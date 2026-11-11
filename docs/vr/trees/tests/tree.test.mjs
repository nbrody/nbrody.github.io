import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAction, buildTree, getFrame } from '../js/tree.js';
const settings = { base: 'disk', lam: 1, h: -.75, edges: 'q', N: 3, depth: 2 };
const same = (a, b) => a.length === b.length && a.every(([p, q], i) => p === b[i][0] && q === b[i][1]);
const distance = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && same([a[i]], [b[i]])) i++;
    return a.length + b.length - 2 * i;
};
test('finite view settings produce valid frames and parent edges', () => {
    for (const depth of [1, 2, 3]) for (const N of [2, 3, 4]) for (const edges of ['q', 'levels', 'zero']) {
        const view = { ...settings, depth, N, edges }, { recs } = buildTree(view);
        assert.ok(recs.length > 1 && recs.length <= 160);
        for (const rec of recs) {
            assert.ok(Number.isFinite(rec.F.cx + rec.F.cy + rec.F.z + rec.F.R + rec.gap) && rec.F.R > 0);
            if (rec.parent >= 0) assert.equal(distance(rec.labels, recs[rec.parent].labels), 1);
        }
    }
});
test('preset matrices preserve edges and S squared fixes vertices', () => {
    const { recs } = buildTree(settings);
    assert.equal(applyAction('U', []).length, 2); // z → z + t moves v₀ two edges.
    for (const rec of recs) {
        assert.ok(same(applyAction('S', applyAction('S', rec.labels)), rec.labels));
        if (rec.parent < 0) continue;
        for (const matrix of ['S', 'T', 'U']) {
            const a = applyAction(matrix, rec.labels), b = applyAction(matrix, recs[rec.parent].labels);
            assert.equal(distance(a, b), 1);
            const F = getFrame(a, settings);
            assert.ok(Number.isFinite(F.cx + F.cy + F.z + F.R));
        }
    }
});
