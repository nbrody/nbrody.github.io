// node --test database/exhaustive.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exhaustiveBound } from './exhaustive.js';

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

test('the published census bound stays σ₁ = 4', () => {
    const dir = new URL('.', import.meta.url);
    const recs = JSON.parse(fs.readFileSync(new URL('web/results.json', dir)));
    const samples = JSON.parse(fs.readFileSync(new URL('samples.json', dir)));
    const sampleKeys = new Set(samples.flatMap((s) => s.keys));
    const bound = exhaustiveBound(recs, sampleKeys);
    assert.equal(bound, 4);
    let naive = 0;
    for (const r of recs) if (!r.set) naive = Math.max(naive, ...r.s1);
    assert.ok(naive > 14, `naive bound ${naive}`);
    const census = recs.filter((r) => Math.max(...r.s1) <= bound + 1e-9).length;
    const inflated = recs.filter((r) => Math.max(...r.s1) <= naive + 1e-9).length;
    assert.ok(inflated - census > 500, `inflated ${inflated} vs census ${census}`);
});
