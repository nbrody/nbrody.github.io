import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroup, createTransitions } from './groups.js';
import { Simulation } from './simulation.js';

const specifications = [
  { family: 'cyclic', n: 2 }, { family: 'cyclic', n: 12 }, { family: 'cyclic', n: 32 },
  { family: 'product', m: 2, n: 3 }, { family: 'product', m: 8, n: 8 },
  { family: 'dihedral', n: 3 }, { family: 'dihedral', n: 16 },
  { family: 'symmetric', n: 3 }, { family: 'symmetric', n: 4 },
  { family: 'quaternion' },
];

for (const specification of specifications) {
  const group = buildGroup(specification);
  test(`${group.name}: closure, identity, inverses, associativity, and generator coverage`, () => {
    assert.equal(new Set(group.labels).size, group.order);
    for (let a = 0; a < group.order; a++) {
      assert.equal(group.multiply(a, group.identity), a);
      assert.equal(group.multiply(group.identity, a), a);
      let inverseFound = false;
      for (let b = 0; b < group.order; b++) {
        const product = group.multiply(a, b);
        assert.ok(product >= 0 && product < group.order);
        if (product === group.identity && group.multiply(b, a) === group.identity) inverseFound = true;
        for (let c = 0; c < group.order; c++) {
          assert.equal(group.multiply(product, c), group.multiply(a, group.multiply(b, c)));
        }
      }
      assert.ok(inverseFound);
    }
    const reached = new Set([group.identity]);
    for (const state of reached) {
      for (const generator of group.generators) reached.add(group.multiply(state, generator.id));
    }
    assert.equal(reached.size, group.order);
  });
}

test('named noncommutative relations and left/right multiplication', () => {
  const d = buildGroup({ family: 'dihedral', n: 5 });
  const [r, s] = d.generators.map(generator => generator.id);
  assert.equal(d.multiply(d.multiply(s, r), s), 4);
  assert.notEqual(d.multiply(r, s), d.multiply(s, r));
  const q = buildGroup({ family: 'quaternion' });
  assert.equal(q.labels[q.multiply(2, 4)], 'k');
  assert.equal(q.labels[q.multiply(4, 2)], '−k');
  assert.equal(q.labels[q.multiply(2, 2)], '−1');
  assert.equal(q.multiply(1, 1), 0);
  assert.equal(createTransitions(q, [2], 'right')[4][0], q.multiply(4, 2));
  assert.equal(createTransitions(q, [2], 'left')[4][0], q.multiply(2, 4));
  const sym = buildGroup({ family: 'symmetric', n: 3 });
  const [a, b] = sym.generators.map(generator => generator.id);
  assert.equal(sym.labels[sym.multiply(a, b)], '(1 2 3)');
  assert.equal(sym.labels[sym.multiply(b, a)], '(1 3 2)');
});

test('transition priority is preserved while duplicates and stationary moves are removed', () => {
  const group = buildGroup({ family: 'cyclic', n: 4 });
  assert.deepEqual(createTransitions(group, [0, 2, 2, 1])[3], [1, 0]);
  assert.deepEqual(createTransitions(group, []), [[], [], [], []]);
  assert.throws(() => createTransitions(group, [4]), RangeError);
  assert.throws(() => createTransitions(group, [1], 'invalid'), RangeError);
});

function classic(options = {}) {
  const group = buildGroup({ family: 'cyclic', n: options.order ?? 3 });
  return new Simulation({ width: 3, height: 3, order: group.order,
    transitions: createTransitions(group), boundary: 'fixed', ...options });
}

test('classic Griffeath updates simultaneously and only copies its immediate cyclic successor', () => {
  const simulation = classic();
  simulation.cells.set([0, 1, 2, 0, 0, 0, 0, 0, 0]);
  simulation.step();
  assert.deepEqual([...simulation.cells], [1, 2, 0, 0, 1, 0, 0, 0, 0]);
  assert.equal(simulation.generation, 1);
  assert.equal(simulation.activity, 4 / 9);
});

test('wrap sees opposite edge while fixed ignores cells outside the board', () => {
  const fixed = classic({ width: 4, height: 3 });
  const wrap = classic({ width: 4, height: 3, boundary: 'wrap' });
  const cells = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
  fixed.cells.set(cells);
  wrap.cells.set(cells);
  fixed.step();
  wrap.step();
  assert.equal(fixed.cells[4], 0);
  assert.equal(wrap.cells[4], 1);
});

test('threshold applies separately to each possible successor, with majority and ordered tie breaking', () => {
  const group = buildGroup({ family: 'product', m: 2, n: 2 });
  const simulation = new Simulation({ width: 3, height: 3, order: 4,
    transitions: createTransitions(group, [1, 2]), boundary: 'fixed', threshold: 2 });
  simulation.cells.set([0, 1, 0, 2, 0, 0, 0, 0, 0]);
  simulation.step();
  assert.equal(simulation.cells[4], 0, 'two different successors cannot combine to pass threshold 2');
  simulation.configure({ threshold: 1 });
  simulation.cells.set([0, 1, 0, 2, 0, 2, 0, 0, 0]);
  simulation.step();
  assert.equal(simulation.cells[4], 2, 'most abundant eligible successor wins');
  simulation.cells.set([0, 1, 0, 2, 0, 2, 0, 1, 0]);
  simulation.step();
  assert.equal(simulation.cells[4], 1, 'generator order breaks a tie');
  simulation.configure({ transitions: createTransitions(group, [2, 1]) });
  simulation.cells.set([0, 1, 0, 2, 0, 2, 0, 1, 0]);
  simulation.step();
  assert.equal(simulation.cells[4], 2);
});

function referenceStep(simulation) {
  const { width, height, radius, neighborhood, boundary, cells, transitions, threshold } = simulation;
  const result = new Uint16Array(cells.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighbors = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (neighborhood === 'vonNeumann' && Math.abs(dx) + Math.abs(dy) > radius) continue;
          if (neighborhood === 'eisenstein' && (Math.abs(dx) + Math.abs(dy) + Math.abs(dx - dy)) / 2 > radius) continue;
          let nx = x + dx;
          let ny = y + dy;
          if (boundary === 'wrap') {
            nx = (nx % width + width) % width;
            ny = (ny % height + height) % height;
          } else if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          neighbors.push(cells[ny * width + nx]);
        }
      }
      let choice = cells[y * width + x];
      let highest = threshold - 1;
      for (const target of transitions[choice]) {
        const count = neighbors.filter(value => value === target).length;
        if (count > highest) {
          choice = target;
          highest = count;
        }
      }
      result[y * width + x] = choice;
    }
  }
  return result;
}

test('optimized stepping matches independent reference across groups, radii, neighborhoods and boundaries', () => {
  for (const specification of specifications) {
    const group = buildGroup(specification);
    for (const neighborhood of ['vonNeumann', 'moore', 'eisenstein']) {
      for (const boundary of ['fixed', 'wrap']) {
        for (const radius of [1, 2, 5]) {
          for (const threshold of [1, 2, 5]) {
            const simulation = new Simulation({ width: 7, height: 4, order: group.order,
              transitions: createTransitions(group), neighborhood, boundary, radius, threshold, seed: 238 });
            for (let generation = 0; generation < 3; generation++) {
              const expected = referenceStep(simulation);
              simulation.step();
              assert.deepEqual(simulation.cells, expected,
                `${group.name}, ${neighborhood}, ${boundary}, radius ${radius}, threshold ${threshold}`);
            }
          }
        }
      }
    }
  }
});

test('empty successor sets freeze, and configuring changes rules without resetting cells or generation', () => {
  const simulation = classic();
  simulation.step();
  const before = simulation.cells.slice();
  simulation.configure({ transitions: [[], [], []], neighborhood: 'moore', boundary: 'wrap', radius: 2 });
  assert.equal(simulation.neighborCount, 24);
  simulation.step();
  assert.equal(simulation.generation, 2);
  assert.equal(simulation.activity, 0);
  assert.deepEqual(simulation.cells, before);
});

test('Eisenstein neighborhoods have six nearest neighbors and 3r(r+1) cells', () => {
  for (const radius of [1, 2, 3, 8, 32]) {
    const simulation = classic({ neighborhood: 'eisenstein', radius });
    assert.equal(simulation.neighborCount, 3 * radius * (radius + 1));
  }
  const simulation = classic({ width: 7, height: 7, neighborhood: 'eisenstein' });
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    simulation.cells.fill(0);
    simulation.cells[(3 + dy) * 7 + 3 + dx] = 1;
    simulation.step();
    assert.equal(simulation.cells[24], 1, `unit direction (${dx}, ${dy})`);
  }
  for (const [dx, dy] of [[1, -1], [-1, 1], [2, 0], [0, 2]]) {
    simulation.cells.fill(0);
    simulation.cells[(3 + dy) * 7 + 3 + dx] = 1;
    simulation.step();
    assert.equal(simulation.cells[24], 0, `not a unit direction (${dx}, ${dy})`);
  }
});

test('larger Eisenstein neighborhoods agree with walking the six lattice directions', () => {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
  const reached = new Set(['0,0']);
  for (let radius = 1; radius <= 3; radius++) {
    for (const position of [...reached]) {
      const [x, y] = position.split(',').map(Number);
      for (const [dx, dy] of directions) reached.add(`${x + dx},${y + dy}`);
    }
    const simulation = classic({ width: 9, height: 9, neighborhood: 'eisenstein', radius });
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx === 0 && dy === 0) continue;
        simulation.cells.fill(0);
        simulation.cells[(4 + dy) * 9 + 4 + dx] = 1;
        simulation.step();
        assert.equal(simulation.cells[40], Number(reached.has(`${dx},${dy}`)),
          `radius ${radius}, offset (${dx}, ${dy})`);
      }
    }
  }
});

test('Eisenstein wrapping preserves axial edge and joint corner neighbors', () => {
  for (const source of [[4, 0], [0, 3], [4, 3]]) {
    for (const boundary of ['fixed', 'wrap']) {
      const simulation = classic({ width: 5, height: 4, neighborhood: 'eisenstein', boundary });
      simulation.cells.fill(0);
      simulation.cells[source[1] * 5 + source[0]] = 1;
      simulation.step();
      assert.equal(simulation.cells[0], Number(boundary === 'wrap'), `${boundary}: ${source}`);
    }
  }
  // The opposite square diagonal remains nonadjacent after crossing the x seam.
  const simulation = classic({ width: 5, height: 4, neighborhood: 'eisenstein', boundary: 'wrap' });
  simulation.cells.fill(0);
  simulation.cells[9] = 1;
  simulation.step();
  assert.equal(simulation.cells[0], 0);
});

test('Eisenstein paint is a Euclidean disc, including points outside a square radius bound', () => {
  const simulation = classic({ width: 15, height: 15, neighborhood: 'eisenstein' });
  simulation.cells.fill(0);
  simulation.paint(7, 7, 3.5, 2);
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const dx = x - 7;
      const dy = y - 7;
      const distance = Math.hypot(dx - dy / 2, Math.sqrt(3) * dy / 2);
      assert.equal(simulation.cells[y * 15 + x], distance <= 3.5 ? 2 : 0);
    }
  }
  assert.equal(simulation.cells[9 * 15 + 11], 2, '(4,2) is within Euclidean radius 3.5');
  simulation.cells.fill(0);
  simulation.paint(0, 0, 1, 1);
  assert.equal(simulation.counts()[1], 4);
  simulation.configure({ boundary: 'wrap' });
  simulation.cells.fill(0);
  simulation.paint(0, 0, 1, 1);
  assert.equal(simulation.counts()[1], 7);
  assert.equal(simulation.cells[224], 1, 'the brush wraps across both axial seams');
});

test('Eisenstein patterns and random paint remain valid and repeatable from a seed', () => {
  const simulation = classic({ width: 60, height: 40, order: 12, neighborhood: 'eisenstein' });
  for (const initial of ['random', 'spirals', 'bands', 'droplets']) {
    simulation.reset({ seed: 'eisenstein', initial });
    const pattern = simulation.cells.slice();
    assert.ok(pattern.every(state => state < simulation.order));
    simulation.paint(30, 20, 8, -1);
    const painted = simulation.cells.slice();
    assert.notDeepEqual(painted, pattern);
    simulation.reset();
    assert.deepEqual(simulation.cells, pattern);
    simulation.paint(30, 20, 8, -1);
    assert.deepEqual(simulation.cells, painted);
  }
});

test('reset is seeded and valid for every pattern, counts reflect cells, and paint respects boundaries', () => {
  const simulation = classic({ width: 20, height: 16 });
  for (const initial of ['random', 'spirals', 'bands', 'droplets']) {
    simulation.reset({ seed: 'repeatable', initial });
    const before = simulation.cells.slice();
    simulation.step();
    simulation.reset();
    assert.deepEqual(simulation.cells, before);
    assert.ok(simulation.cells.every(state => state < simulation.order));
    assert.equal([...simulation.counts()].reduce((a, b) => a + b), 320);
    assert.equal(simulation.generation, 0);
    assert.equal(simulation.activity, 0);
  }
  simulation.cells.fill(0);
  simulation.paint(0, 0, 1, 2);
  assert.equal(simulation.counts()[2], 3);
  simulation.configure({ boundary: 'wrap' });
  simulation.cells.fill(0);
  simulation.paint(0, 0, 1, 2);
  assert.equal(simulation.counts()[2], 5);
  simulation.paint(10, 10, 0, 1);
  assert.equal(simulation.cells[210], 1);
  simulation.paint(10, 10, 2, -1);
  assert.ok(simulation.cells.every(state => state < simulation.order));
});
