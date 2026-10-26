// node --test tests/numberRingIndex.test.mjs
// Coset enumeration in PGL₂(O_k) on the presentation from Voronoi's algorithm (numberRingIndex.js).
//  1. The stabilizer of the line [1 : 0] in P¹(O/p), given by Schreier generators as plain matrices,
//     must have index |P¹(O/p)| (the orbit size, computed independently from the action).
//  2. Groups of the number-field database, bounded at every prime (S = ∅), with their exact index;
//     one needs a conjugation into PGL₂(O_k) and the subgroup fixing a vertex of every tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringPresentation, indexOfMatrices, indexInPGL2O, numberRingApplies } from '../js/numberRingIndex.js';

function lineStabilizer(L, p) {
    const { nf, space, PGL } = L;
    const P = BigInt(p), n = nf.n;
    const mod = (x) => x.map((t) => ((t % P) + P) % P);
    const res = [];
    const all = (k, acc) => { if (k === n) { res.push(acc.slice()); return; } for (let t = 0n; t < P; t++) { acc[k] = t; all(k + 1, acc); } };
    all(0, new Array(n).fill(0n));
    const units = res.filter((x) => nf.norm(x) % P !== 0n);
    const key = (v) => { let best = null; for (const u of units) { const k = [...mod(nf.mul(u, v[0])), ...mod(nf.mul(u, v[1]))].join(','); if (best === null || k < best) best = k; } return best; };
    const gens = PGL.gens.map((g) => g.mat);
    const start = [nf.one(), nf.zero()];
    const pts = [start], trans = [space.identity()], index = new Map([[key(start), 0]]);
    for (let i = 0; i < pts.length; i++) for (const g of gens.concat(gens.map((m) => space.matInv(m)))) {
        const w = space.act(g, pts[i]).map(mod), k = key(w);
        if (!index.has(k)) { index.set(k, pts.length); pts.push(w); trans.push(space.matMul(g, trans[i])); }
    }
    const sch = [];
    for (let i = 0; i < pts.length; i++) for (const g of gens) {
        const j = index.get(key(space.act(g, pts[i]).map(mod)));
        sch.push(space.matMul(space.matInv(trans[j]), space.matMul(g, trans[i])));
    }
    return { orbit: pts.length, mats: sch.map((m) => m.map((row) => row.map((v) => ({ v, d: 1n })))) };
}

for (const [poly, p] of [['w^2-2', 3], ['w^2-w-1', 2], ['w^2+5', 3], ['w^2-3', 5], ['w^3-x-1'.replace('x', 'w'), 2]]) {
    test(`[PGL₂(O) : stabilizer of [1:0] mod ${p}] = |P¹(O/${p})| over ${poly}`, () => {
        const L = ringPresentation(poly);
        assert.ok(!L.error, L.error);
        const { orbit, mats } = lineStabilizer(L, p);
        const r = indexOfMatrices(poly, mats, { seconds: 30, presentation: L });
        assert.equal(r.index, orbit);
    });
}

test('the database: S = ∅ groups over Q(√2) and the cubic field of discriminant −23', () => {
    // r2:1 0;-1 0;0 -1;1 0|1 0;-1 0;1 0;0 1
    const a = indexInPGL2O('w^2-2', [['-1', '1', 'w', '-1'], ['-1', '1', '-1', '-w']], [[1], [2]], { seconds: 30 });
    assert.equal(a.index, 768);
    assert.equal(a.conjugated, false);
    // c23:0 0 0;1 0 0;1 -1 -1;0 0 0|1 0 0;-1 0 0;0 0 0;0 -1 0 — a generator inverts an edge at a prime:
    // its subgroup of index 2 fixing a vertex everywhere has index 288 in PGL₂(O_k)
    const b = indexInPGL2O('w^3-w-1', [['0', '1', '1-w-w^2', '0'], ['1', '-1', '0', '-w']], [[1], [2]], { seconds: 60 });
    assert.equal(b.evenIndex, 2);
    assert.equal(b.index, 288);
});

test('the per-field cache is opt-in (batch runs only)', () => {
    const a = ringPresentation('w^2-2'), b = ringPresentation('w^2-2');
    assert.notEqual(a, b);                                  // a single group builds its own
    const c = ringPresentation('w^2-2', { cache: true }), d = ringPresentation('w^2-2', { cache: true });
    assert.equal(c, d);                                     // a batch worker reuses it
    assert.equal(c.nGens, a.nGens);
});

test('which fields apply', () => {
    assert.ok(numberRingApplies('w^2-2'));
    assert.ok(numberRingApplies('w^3-2'));
    assert.ok(numberRingApplies('w^4+1'));
    assert.ok(!numberRingApplies('w^4-w^2-1'));          // signature (2, 1): not supported
});
