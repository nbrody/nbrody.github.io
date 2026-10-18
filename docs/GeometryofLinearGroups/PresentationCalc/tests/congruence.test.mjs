// node --test tests/congruence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { _index } from '../js/congruence.js';

const rows = (k) => k.split('|').map((m) => m.split(','));

test('Λ itself: index 1 at any level', () => {
    for (const [S, levels] of [[[11], [8, 9]], [[3, 7], [8, 5]], [[2, 13], [9, 5]]]) {
        const L = [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['-1', '0', '0', '1'], ...S.map((p) => ['0', '1', String(p), '0'])];
        assert.equal(_index(L, S, levels).index, 1);
    }
});

test('S-arithmetic groups equal their congruence closure (indices from coset enumeration)', () => {
    // the scalars of Λ are ±S-units only: quotients PGL₂(ℤ/q) level by level gave half of these
    assert.equal(_index(rows('1,-3,-3,-2|1,-3,-1,2'), [11], [8, 9]).index, 144);
    assert.equal(_index(rows('1,-2,1,1|2,-1,3,2'), [3, 7], [16, 25]).index, 160);
    assert.equal(_index(rows('1,-3,3,2|1,1,-1,2'), [3, 11], [16]).index, 32);
});

test('the image does not depend on the order of the levels (Schreier generators t_x g t_xg⁻¹)', () => {
    // conjugated Schreier generators t_xg⁻¹ t_x g gave index 640 here, above the true index 80
    assert.equal(_index(rows('0,1,-1,-1|0,2,-2,3'), [2], [3, 5]).index, 80);
    assert.equal(_index(rows('0,1,-1,-1|0,2,-2,3'), [2], [5, 3]).index, 80);
    assert.equal(_index(rows('0,2,2,-1|1,0,0,-4'), [2], [3, 5]).index, 40);
});
