// node --test tests/numberRingPresentation.test.mjs
// Presentations of subgroups of PGL₂(O_k) on their given generators (numberRingPresentation.js). Besides
// the module's own checks (every relator multiplied out over k, every generator out of its word):
//  · at index 1, H₁ of the new presentation is H₁ of Voronoi's presentation of PGL₂(O_k);
//  · for subgroups H′ of Γ, coset enumeration in the new presentation gives [Γ : H′] with
//    [Λ : Γ]·[Γ : H′] = [Λ : H′], the index computed in Λ = PGL₂(O_k) itself;
//  · with odd valuations (P. Hall's extension), the even subgroup K has index [Γ : K] in the new presentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentationInPGL2O } from '../js/numberRingPresentation.js';
import { ringPresentation, indexOfMatrices, wordMatricesK, conjugateIntoGL2O, kMat } from '../js/numberRingIndex.js';
import { enumerateFelsch } from '../js/felsch.js';
import { abelianInvariants } from '../js/presentation.js';

const toLetters = (w) => w.map((x) => (x > 0 ? 2 * (x - 1) : 2 * (-x - 1) + 1));
/** [Γ : ⟨words in the given generators⟩] by coset enumeration in the presentation Pr (g_i = Pr.gamma[i]) */
const indexIn = (Pr, words) => {
    const inv = (w) => w.slice().reverse().map((x) => -x);
    const sub = (w) => w.flatMap((x) => (x > 0 ? Pr.gamma[x - 1] : inv(Pr.gamma[-x - 1])));
    return enumerateFelsch(Pr.gens.length, Pr.relators.map(toLetters), words.map((w) => toLetters(sub(w))), { seconds: 20 }).index;
};
/** the matrices of words in the generators (letters ±(i+1)), over k */
const wordMats = (nf, gens, words) => {
    const K = kMat(nf), one = { v: nf.one(), d: 1n }, zero = { v: nf.zero(), d: 1n };
    return words.map((w) => w.reduce((M, x) => K.mul(M, x > 0 ? gens[x - 1] : K.adj(gens[-x - 1])), [[one, zero], [zero, one]]));
};

/** the stabilizer of [1 : 0] in ℙ¹(O/p) by Schreier generators (as in numberRingIndex.test.mjs), over k */
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

test('ℚ(√2): PGL₂(O) on T, U, S and two diagonal units, with the H₁ of its Voronoi presentation', () => {
    const L = ringPresentation('w^2-2');
    const rows = [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['1+w', '0', '0', '1'], ['-1', '0', '0', '1']];
    const Pr = presentationInPGL2O('w^2-2', rows, { presentation: L });
    assert.ok(!Pr.error, Pr.error);
    assert.equal(Pr.index, 1);
    assert.ok(Pr.onGiven);
    assert.deepEqual(Pr.abelian, abelianInvariants(L.nGens, L.PGL.relators));
});

for (const [poly, p] of [['w^2-2', 3], ['w^2-w-1', 2], ['w^2-w-1', 3], ['w^2+5', 3]]) {
    test(`the stabilizer of a line mod ${p} over ${poly}: on its given generators, and its subgroups`, () => {
        const L = ringPresentation(poly);
        const { orbit, mats } = lineStabilizer(L, p);
        const Pr = presentationInPGL2O(poly, null, { presentation: L, mats, seconds: 30 });
        assert.ok(!Pr.error, Pr.error);
        assert.equal(Pr.index, orbit);
        assert.ok(Pr.onGiven, `${Pr.gens.filter((g) => g.given === null).length} h's left`);
        // H′ = ⟨g₁², g₂, …⟩ and ⟨g₁g₂, g₂g₁, g₃, …⟩: [Λ : Γ]·[Γ : H′] = [Λ : H′]
        const n = mats.length;
        const rest = Array.from({ length: n - 2 }, (_, i) => [i + 3]);
        let checked = 0;
        for (const words of [[[1, 1], [2], ...rest], [[1, 2], [2, 1], ...rest], [[1, 1], [2, 2], [1, 2], ...rest]]) {
            const inLambda = indexOfMatrices(poly, wordMats(L.nf, mats, words), { presentation: L, seconds: 30 }).index;
            if (!inLambda) continue;
            const inGamma = indexIn(Pr, words);
            assert.equal(inLambda, orbit * inGamma, JSON.stringify(words));
            checked++;
        }
        assert.ok(checked >= 2);
    });
}

test('a conjugate: diag(√2, 1)·Γ·diag(√2, 1)⁻¹ for the line stabilizer mod 3 over ℚ(√2)', () => {
    const L = ringPresentation('w^2-2');
    const { nf } = L, K = kMat(nf);
    const { mats } = lineStabilizer(L, 3);
    const D = wordMatricesK(nf, [['w', '0', '0', '1']], [[1]])[0];
    const conj = mats.map((M) => K.mul(K.mul(D, M), K.adj(D)));
    const Pr = presentationInPGL2O('w^2-2', null, { presentation: L, mats: conj, seconds: 30 });
    assert.ok(!Pr.error, Pr.error);
    assert.ok(Pr.conjugated);
    assert.ok(Pr.onGiven);
});

test('the cubic field of discriminant −23: odd valuations, and the even subgroup K of index 2', () => {
    const poly = 'w^3-w-1', rows = [['0', '1', '1-w-w^2', '0'], ['1', '-1', '0', '-w']];
    const L = ringPresentation(poly);
    const Pr = presentationInPGL2O(poly, rows, { presentation: L, seconds: 60 });
    assert.ok(!Pr.error, Pr.error);
    assert.equal(Pr.kernelIndex, 2);
    assert.equal(Pr.index, 288);
    // K, generated by its Schreier generators (as words in the given ones), has index 2 in the new presentation
    const conj = conjugateIntoGL2O(L.nf, wordMatricesK(L.nf, rows, [[1], [2]]));
    assert.equal(indexIn(Pr, conj.words), 2);
});
