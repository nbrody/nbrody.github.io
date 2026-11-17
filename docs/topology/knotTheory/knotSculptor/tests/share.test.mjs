import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeKnot, decodeKnot, binarySTL, randomBraid } from '../js/share.js';
import { PRESETS, braidClosureCurves } from '../js/builders.js';
import { normalizeSize, resampleBySpacing, centroid } from '../js/knot.js';
import { bestDiagram } from '../js/diagram.js';
import { diagramInvariants } from '../js/invariants.js';

const prepare = curves => normalizeSize(curves, .13).map(p => resampleBySpacing(p, .007, 48, 420));

test('a shared link brings back the same link type, within quantisation', () => {
  for (const make of [PRESETS.trefoil, PRESETS.figureEight, PRESETS.borromean]) {
    const comps = prepare(make());
    const code = encodeKnot(comps);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    const back = decodeKnot(code);
    assert.equal(back.length, comps.length);
    const a = diagramInvariants(bestDiagram(comps).simplified, { simplify: false });
    const b = diagramInvariants(bestDiagram(back).simplified, { simplify: false });
    assert.equal(b.crossings, a.crossings);
    assert.equal(b.determinant, a.determinant);
    // decoded curves are centred at the origin
    for (const x of centroid(back)) assert.ok(Math.abs(x) < 2e-3);
  }
});

test('a malformed code is rejected', () => {
  assert.throws(() => decodeKnot('AAAA'));
  const code = encodeKnot(prepare(PRESETS.trefoil()));
  assert.throws(() => decodeKnot(code.slice(0, -8)));
});

test('binary STL: header, count, normals and millimetres', () => {
  const position = new Float32Array([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0, 0, 0, 0.001]);
  const index = new Uint16Array([0, 1, 2, 0, 3, 1]);
  const buf = binarySTL([{ position, index }]);
  const v = new DataView(buf);
  assert.equal(buf.byteLength, 84 + 2 * 50);
  assert.equal(v.getUint32(80, true), 2);
  assert.deepEqual([v.getFloat32(84, true), v.getFloat32(88, true), v.getFloat32(92, true)], [0, 0, 1]);
  assert.ok(Math.abs(v.getFloat32(84 + 12 + 12, true) - 1) < 1e-6); // second vertex x = 1 mm
});

test('random braids close up to knots and use every generator', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) {
    const { n, word } = randomBraid(rand);
    assert.equal(new Set(word.map(Math.abs)).size, n - 1);
    for (let i = 0; i + 1 < word.length; i++) assert.notEqual(word[i], -word[i + 1]);
    assert.equal(braidClosureCurves(n, word).length, 1, `σ word ${word} on ${n} strands is a knot`);
  }
});
