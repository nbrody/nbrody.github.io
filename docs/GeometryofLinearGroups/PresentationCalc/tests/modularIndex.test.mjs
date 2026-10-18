// node --test tests/modularIndex.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { coxeterWord, indexInPGL2Z } from '../js/modularIndex.js';

const idx = (ms) => indexInPGL2Z(ms, { seconds: 10 }).index;

test('words multiply back (checked inside coxeterWord)', () => {
    for (const m of [[1, 0, 0, 1], [0, -1, 1, 0], [2, 1, 1, 1], [5, 3, 3, 2], [-7, 4, 2, -1], [1, 0, 0, -1], [3, 1, 1, 0], [13, 8, -5, -3]]) {
        assert.ok(Array.isArray(coxeterWord(m)));
    }
});
test('PGL₂(ℤ) and PSL₂(ℤ)', () => {
    assert.equal(idx([[1, 1, 0, 1], [0, -1, 1, 0], [-1, 0, 0, 1]]), 1);
    assert.equal(idx([[1, 1, 0, 1], [0, -1, 1, 0]]), 2);
});
test('Γ(2) = ⟨T², L²⟩ (with −1) has index 6 in PSL₂(ℤ), 12 in PGL₂(ℤ)', () => {
    assert.equal(idx([[1, 2, 0, 1], [1, 0, 2, 1]]), 12);
});
test('Γ₀(2) ⊂ PSL₂(ℤ): index 3, so 6 in PGL₂(ℤ)', () => {
    // Γ₀(2) = ⟨T, (1 0; 2 1), −1⟩ … T and (1 0;2 1) generate it projectively
    assert.equal(idx([[1, 1, 0, 1], [1, 0, 2, 1]]), 6);
});
test('Γ₀(11) extended by diag(−1,1): index 12', () => {
    // generators of Γ₀(11) (Farey/Sage): T, (7 −2; 11 −3), (8 −3; 11 −4)  — and −1
    assert.equal(idx([[1, 1, 0, 1], [7, -2, 11, -3], [8, -3, 11, -4], [-1, 0, 0, 1]]), 12);
});
test('an infinite-index subgroup does not close', () => {
    const r = indexInPGL2Z([[1, 3, 0, 1], [1, 0, 3, 1]], { seconds: 1, maxCosets: 20000 });
    assert.ok(r.limit);
});
