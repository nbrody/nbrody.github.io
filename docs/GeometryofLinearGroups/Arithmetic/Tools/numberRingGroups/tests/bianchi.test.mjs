// Cross-check against independent presentations: for O = Z[i], Z[√−2], Z[ω] the Presentation
// Calculator has presentations of PSL_2(O) read off Dirichlet domains by poincare (Poincaré's
// polyhedron theorem; data copied from PresentationCalc/js/bianchi.js). Two presentations of the same
// group must give the same abelianization for every finite-index subgroup; we compare the stabilizers
// of ±(1, 0) mod N (Reidemeister–Schreier on both sides).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll, subgroupPresentation, simplify } from '../js/engine.js';
import { abelianInvariants } from '../../../../PresentationCalc/js/presentation.js';
import { Rat } from '../js/nf.js';

const GENS = {
    1: { poly: 'x^2+1', mats: [[[0n, 0n], [-1n, 0n], [1n, 0n], [0n, 0n]], [[1n, 0n], [1n, 0n], [0n, 0n], [1n, 0n]], [[1n, 0n], [0n, 1n], [0n, 0n], [1n, 0n]], [[0n, -1n], [0n, 0n], [0n, 0n], [0n, 1n]]],
         rels: [[[-1], 2], [[-4], 2], [[-4, -1], 2], [[2, -4], 2], [[3, -4], 2], [[-4, -4, -1, -1], 1], [[4, 2, -4, 2], 1], [[3, 2, -4], 2], [[3, -4, 3, -4, -1, -1], 1], [[2, -1], 3], [[3, -4, -1], 3]] },
    2: { poly: 'x^2+2', mats: [[[0n, 0n], [-1n, 0n], [1n, 0n], [0n, 0n]], [[1n, 0n], [1n, 0n], [0n, 0n], [1n, 0n]], [[1n, 0n], [0n, 1n], [0n, 0n], [1n, 0n]]],
         rels: [[[-1], 2], [[3, 2, -3, -2], 1], [[3, -1, -1, -3, -1, -1], 1], [[2, -1], 3], [[-1, -3, -2, 3, 2, -1], 1], [[3, -1, -3, -1], 2], [[3, -1, -3, -2], 3]] },
    3: { poly: 'x^2-x+1', mats: [[[0n, 0n], [-1n, 0n], [1n, 0n], [0n, 0n]], [[1n, 0n], [1n, 0n], [0n, 0n], [1n, 0n]], [[1n, 0n], [0n, 1n], [0n, 0n], [1n, 0n]], [[0n, 1n], [0n, 0n], [0n, 0n], [1n, -1n]]],
         rels: [[[-1], 2], [[-4], 3], [[-4, -1], 2], [[-3, -4, -2, 4], 1], [[-4, -3, -4, -2, -4], 1], [[2, 4], 3], [[3, 4], 3], [[3, 4, -1], 3]] },
};

/** the stabilizer of ±(1,0) mod N: abelian invariants, from a presentation (gens = matrices) */
function stabilizerAb(space, gens, relators, N) {
    const K = space.nf, Nb = BigInt(N);
    const mod = (x) => x.map((t) => ((t % Nb) + Nb) % Nb);
    const key = (v) => { const a = [...mod(v[0]), ...mod(v[1])].join(','), b = [...mod(K.neg(v[0])), ...mod(K.neg(v[1]))].join(','); return a < b ? a : b; };
    const start = [K.one(), K.zero()];
    const pts = [start], index = new Map([[key(start), 0]]);
    const mats = gens.map((g) => g.mat);
    for (let i = 0; i < pts.length; i++) for (const g of mats.concat(mats.map((m) => space.matInv(m)))) {
        const w = space.act(g, pts[i]).map(mod);
        if (!index.has(key(w))) { index.set(key(w), pts.length); pts.push(w); }
    }
    // a right action: i·g = g⁻¹·pts[i]
    const invs = mats.map((m) => space.matInv(m));
    const act = (k, i) => index.get(key(space.act(invs[k - 1], pts[i])));
    const sub = subgroupPresentation(space, gens, relators, pts.length, act);
    const S = simplify(space, sub.gens, sub.relators);
    const ab = abelianInvariants(S.gens.length, S.relators);
    return { index: pts.length, ab: `${ab.rank}|${ab.torsion.join(',')}` };
}

for (const d of [1, 2, 3]) {
    test(`PSL_2 over the Bianchi ring d = ${d}: congruence stabilizers agree with poincare's presentation`, () => {
        const R = computeAll(GENS[d].poly);
        const { space, nf } = R._internal;
        const ours = { gens: R.PSL2.gens.map((mat) => ({ mat })), relators: R.PSL2.relators };
        const el = ([a, b]) => nf.fromPower([new Rat(a), new Rat(b)]).v;
        const theirs = {
            gens: GENS[d].mats.map((m) => ({ mat: [[el(m[0]), el(m[1])], [el(m[2]), el(m[3])]] })),
            relators: GENS[d].rels.map(([w, k]) => Array.from({ length: k }, () => w).flat()),
        };
        for (const N of [2, 3, 4, 5]) {
            const a = stabilizerAb(space, ours.gens, ours.relators, N), b = stabilizerAb(space, theirs.gens, theirs.relators, N);
            assert.equal(a.index, b.index);
            assert.equal(a.ab, b.ab, `N = ${N}: ${a.ab} vs ${b.ab}`);
            console.log(`d = ${d}, N = ${N}: index ${a.index}, H_1 = ${a.ab}`);
        }
        const full = abelianInvariants(ours.gens.length, ours.relators), theirsAb = abelianInvariants(theirs.gens.length, theirs.relators);
        assert.deepEqual(full, theirsAb);
    });
}
