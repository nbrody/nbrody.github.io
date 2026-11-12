import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldExamples, presetMatrix, matrixTex } from '../js/presets.js';
import { mmul, isScalar } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
for (const field of ['Q', 'i', 'omega']) {
  test(`${field} desktop examples parse and have projective inverses`, () => {
    const examples = fieldExamples(field);
    assert.ok(examples.length > 0);
    for (const {gens} of examples) for (const entries of gens) {
      const a = presetMatrix(field, entries), inverse = presetMatrix(field, entries, true);
      assert.ok(isScalar(mmul(a, inverse)));
    }
  });
}
test('matrix labels retain all entries', () => assert.equal(matrixTex(['1','t','0','1']), '\\begin{pmatrix}1&t\\\\0&1\\end{pmatrix}'));
