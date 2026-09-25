import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldGeometry, eisensteinToWorld, nearestEisensteinCell } from './lattice.js';

test('square geometries preserve the existing raster and reject out-of-bounds pointers', () => {
  for (const neighborhood of ['moore', 'vonNeumann']) {
    const field = createFieldGeometry(7, 5, neighborhood);
    assert.equal(field.width, 7);
    assert.equal(field.height, 5);
    assert.equal(field.cellIndices, null);
    assert.deepEqual(field.cellAt(6.99, 4.99), { x: 6, y: 4 });
    assert.deepEqual(field.cellAt(0, 0), { x: 0, y: 0 });
    for (const [x, y] of [[-0.01, 0], [0, -0.01], [7, 0], [0, 5], [NaN, 0], [0, Infinity]]) {
      assert.equal(field.cellAt(x, y), null);
    }
  }
  assert.throws(() => createFieldGeometry(0, 5, 'eisenstein'), RangeError);
  assert.throws(() => createFieldGeometry(5, 2.5, 'eisenstein'), RangeError);
});

test('the six Eisenstein neighbors are equally spaced in the 120-degree basis', () => {
  const offsets = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1]];
  const angles = offsets.map(([x, y]) => {
    const point = eisensteinToWorld(x, y);
    assert.ok(Math.abs(Math.hypot(point.x, point.y) - 1) < 1e-12);
    return (Math.atan2(point.y, point.x) + 2 * Math.PI) % (2 * Math.PI);
  }).sort((a, b) => a - b);
  for (let i = 0; i < 6; i++) {
    const gap = (angles[(i + 1) % 6] - angles[i] + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(Math.abs(gap - Math.PI / 3) < 1e-12);
  }
});

test('cube rounding agrees with an independent Euclidean nearest-site search', () => {
  for (let y = -3; y <= 3; y += 0.17) {
    for (let x = -3; x <= 3; x += 0.19) {
      const cell = nearestEisensteinCell(x, y);
      const selected = eisensteinToWorld(cell.x, cell.y);
      const actual = (selected.x - x) ** 2 + (selected.y - y) ** 2;
      let best = Infinity;
      for (let cy = -5; cy <= 5; cy++) {
        for (let cx = -6; cx <= 6; cx++) {
          const point = eisensteinToWorld(cx, cy);
          best = Math.min(best, (point.x - x) ** 2 + (point.y - y) ** 2);
        }
      }
      assert.ok(Math.abs(actual - best) < 1e-12, `point (${x}, ${y})`);
    }
  }
});

test('every cell center maps back, including diagonal and corner sites', () => {
  for (const [width, height] of [[1, 1], [1, 7], [9, 1], [9, 7], [320, 240]]) {
    const field = createFieldGeometry(width, height, 'eisenstein');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const point = field.cellCenter(x, y);
        assert.deepEqual(field.cellAt(point.x, point.y), { x, y }, `center (${x}, ${y}) in ${width} × ${height}`);
      }
    }
  }
});

test('the sloping domain rejects empty corners and out-of-bounds lattice sites', () => {
  const field = createFieldGeometry(12, 10, 'eisenstein');
  assert.equal(field.cellAt(0, 0), null);
  assert.equal(field.cellAt(field.width - 1, field.height - 1), null);
  for (const [x, y] of [[-1, 4], [12, 4], [4, -1], [4, 10], [-1, -1], [12, 10]]) {
    const point = field.cellCenter(x, y);
    assert.equal(field.cellAt(point.x, point.y), null, `outside site (${x}, ${y})`);
  }
  for (const [x, y] of [[-0.01, 0], [0, -0.01], [field.width, 0], [0, field.height], [NaN, 0]]) {
    assert.equal(field.cellAt(x, y), null);
  }
});

test('pointer sampling and every renderer pixel agree with the same Voronoi map', () => {
  const width = 9, height = 7;
  const field = createFieldGeometry(width, height, 'eisenstein');
  const seen = new Set();
  for (let py = 0; py < field.height; py++) {
    for (let px = 0; px < field.width; px++) {
      const index = field.cellIndices[py * field.width + px];
      const cell = nearestEisensteinCell(field.worldLeft + (px + 0.5) / field.scale,
        field.worldTop + (py + 0.5) / field.scale);
      const expected = cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height ? -1 : cell.y * width + cell.x;
      assert.equal(index, expected);
      for (const offset of [0, 0.5, 0.999]) {
        assert.deepEqual(field.cellAt(px + offset, py + offset), index < 0 ? null : { x: index % width, y: Math.floor(index / width) });
      }
      if (index >= 0) seen.add(index);
    }
  }
  assert.equal(seen.size, width * height);
});

test('raster sizing preserves world scale and caps both dimensions at 1600', () => {
  for (const [width, height] of [[10, 10], [480, 360], [10, 1600]]) {
    const field = createFieldGeometry(width, height, 'eisenstein');
    assert.ok(field.width <= 1600 && field.height <= 1600);
    assert.ok(field.scale <= 4);
    const center = field.cellCenter(0, 0);
    for (const [x, y] of [[1, 0], [0, 1], [1, 1]]) {
      const neighbor = field.cellCenter(x, y);
      assert.ok(Math.abs(Math.hypot(neighbor.x - center.x, neighbor.y - center.y) - field.scale) < 1e-10);
    }
  }
});
