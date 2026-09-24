import test from 'node:test';
import assert from 'node:assert/strict';
import { Life, A, B, C, SIGMA, parseRule } from './life.js';
import { PATTERNS, transform } from './patterns.js';
import { STORIES, storyTools } from './stories.js';

const place = (life, name, x, y, color = A, rot = 0) => {
  for (const [dx, dy] of transform(PATTERNS[name], rot)) life.set(x + dx, y + dy, color);
};
const alive = life => { const c = life.census(); return c[1] + c[2] + c[3]; };
const shadow = life => { const out = []; for (let y = 0; y < life.viewH; y++) for (let x = 0; x < life.viewW; x++) out.push(life.get(x, y) ? 1 : 0); return out.join(''); };

test('XOR encoding is the Klein four-group, and σ has order 3', () => {
  assert.equal(A ^ B, C); assert.equal(B ^ C, A); assert.equal(A ^ C, B);
  for (const x of [A, B, C]) { assert.equal(x ^ x, 0); assert.equal(SIGMA[SIGMA[SIGMA[x]]], x); assert.notEqual(SIGMA[x], x); }
  // σ is an automorphism: σ(x + y) = σ(x) + σ(y).
  for (const x of [A, B, C]) for (const y of [A, B, C]) if (x !== y) assert.equal(SIGMA[x ^ y], SIGMA[x] ^ SIGMA[y]);
});

test('rule strings parse', () => {
  const r = parseRule('b36/s23');
  assert.equal(r.text, 'B36/S23');
  assert.deepEqual([...r.birth].map((v, i) => v && i).filter(Boolean), [3, 6]);
  assert.equal(parseRule('nonsense'), null);
});

test('spaceships and the Gosper gun behave as in Conway’s Life', () => {
  for (const [name, dx, dy] of [['glider', 1, 1], ['lwss', -2, 0], ['mwss', -2, 0], ['hwss', -2, 0]]) {
    const life = new Life({ width: 60, height: 60, boundary: 'wrap' });
    place(life, name, 30, 30, B);
    const before = shadow(life);
    for (let i = 0; i < 4; i++) life.step();
    const moved = new Life({ width: 60, height: 60, boundary: 'wrap' });
    place(moved, name, 30 + dx, 30 + dy, B);
    assert.equal(shadow(life), shadow(moved), name);
    assert.equal(life.census()[B], alive(life), `${name} keeps its colour`);
    assert.notEqual(before, shadow(life));
  }
  const gun = new Life({ width: 120, height: 80 });
  place(gun, 'gosperGun', 4, 4);
  const pops = [];
  for (let i = 1; i <= 120; i++) { gun.step(); if (i % 30 === 0) pops.push(alive(gun)); }
  for (let k = 1; k < pops.length; k++) assert.equal(pops[k] - pops[k - 1], 5, 'one glider per period');
});

test('one-colour patterns are identical under every law', () => {
  for (const law of ['heredity', 'alchemy', 'predation', 'tribes']) {
    const life = new Life({ width: 80, height: 80, law, seed: 3 });
    const ref = new Life({ width: 80, height: 80, law: 'heredity' });
    for (const l of [life, ref]) place(l, 'rpentomino', 40, 40, C);
    for (let i = 0; i < 200; i++) { life.step(); ref.step(); }
    assert.equal(shadow(life), shadow(ref), law);
    assert.equal(life.census()[C], alive(life), law);
  }
});

test('heredity: newborns are the sum of their parents, and triads cancel', () => {
  // Three parents in a row above an empty cell: a blinker's birth sites.
  const cases = [[[A, A, B], B], [[A, B, B], A], [[C, C, C], C], [[A, B, C], 0]];
  for (const [parents, expected] of cases) {
    const life = new Life({ width: 10, height: 10, boundary: 'wrap' });
    parents.forEach((v, i) => life.set(3 + i, 5, v));
    life.step();
    assert.equal(life.get(4, 4), expected, parents.join());
    assert.equal(life.get(4, 6), expected, parents.join());
  }
  const noCancel = new Life({ width: 10, height: 10, law: { birth: 'sum', survive: 'keep', cancel: false } });
  [A, B, C].forEach((v, i) => noCancel.set(3 + i, 5, v));
  noCancel.step();
  assert.ok(noCancel.get(4, 4), 'without cancellation the triad is born');
});

test('alchemy: a survivor absorbs the sum of its neighbours', () => {
  const life = new Life({ width: 10, height: 10, law: 'alchemy' });
  // A block with one b: that cell sees a+a+a = a and becomes b + a = c.
  life.set(4, 4, A); life.set(5, 4, A); life.set(4, 5, A); life.set(5, 5, B);
  life.step();
  assert.equal(life.get(5, 5), C);
  assert.equal(life.get(4, 4), C); // an a sees a + a + b = b, and a + b = c
});

test('predation: the predator wins mixed births and converts survivors', () => {
  const life = new Life({ width: 10, height: 10, law: 'predation' });
  life.setBite(1);
  life.set(3, 5, A); life.set(4, 5, B); life.set(5, 5, A); // b = σ(a) preys on a
  life.step();
  assert.equal(life.get(4, 4), B);
  assert.equal(life.get(4, 5), B);
  const conv = new Life({ width: 10, height: 10, law: 'predation' });
  conv.setBite(1);
  conv.set(4, 4, A); conv.set(5, 4, A); conv.set(4, 5, A); conv.set(5, 5, B);
  conv.step();
  assert.equal(conv.census()[B], 4, 'every a in the block is next to its predator');
});

test('open edges absorb escaping gliders', () => {
  const life = new Life({ width: 40, height: 40 });
  place(life, 'glider', 20, 20);
  for (let i = 0; i < 200; i++) life.step();
  assert.equal(alive(life), 0);
});

test('every story runs to the end on several grid shapes', () => {
  for (const story of STORIES) {
    for (const [w, h] of [[story.cells, Math.round(story.cells * 0.62)], [200, 240]]) {
      const life = new Life({ width: w, height: h, boundary: story.boundary, rule: story.rule, law: story.law });
      let beat = 0;
      for (let g = 0; g <= story.end; g++) {
        while (beat < story.beats.length && story.beats[beat].at <= life.generation) story.beats[beat++].run?.(storyTools(life));
        life.step();
      }
      assert.equal(beat, story.beats.length, story.id);
      assert.ok(alive(life) > 0, `${story.id} ends with something alive`);
    }
  }
});
