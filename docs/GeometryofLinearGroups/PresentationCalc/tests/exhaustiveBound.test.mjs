// node --test tests/exhaustiveBound.test.mjs — the database page's exhaustive-census bound (database/exhaustive.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { exhaustiveBound } from '../database/exhaustive.js';

test('a random draw that lost its set name does not raise the census bound', () => {
    const recs = [
        { key: 'a|b', s1: [2, 4] },
        { key: 'big|pair', set: 'random-B15-N100-seed1', s1: [8, 13] },
        { key: 'lost|set', s1: [11, 14.928] },
    ];
    const samples = new Set(['big|pair', 'lost|set']);
    assert.equal(exhaustiveBound(recs, samples), 4);
    assert.equal(exhaustiveBound(recs, new Set()), 14.928);
});

