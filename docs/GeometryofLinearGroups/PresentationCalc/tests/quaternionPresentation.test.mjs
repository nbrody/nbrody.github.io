// node --test tests/quaternionPresentation.test.mjs
// Presentations of Γ from step 3's coset enumeration in Λ = N(𝒪[1/S])/k^× (quaternionPresentation.js). Checked
// independently of the quaternion code: relators multiplied out as 2 × 2 matrices over ℤ[w]; LPS is free; and over ℚ
// the presentation is the over-ℚ route's (sarithPresentation.js) on the same generators, each relator of one
// killed by a rewriting system of the other's.
import '../../Algebraic/Tools/numberRings/ringEngine.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quaternionPresentation } from '../js/quaternionPresentation.js';
import { presentationOverQ } from '../js/sarithPresentation.js';
import { RewritingSystem } from '../js/rewriting.js';

// matrices over ℤ[w], w² + w + 2 = 0 (ℚ(√−7)): a + b·w as [a, b]
const zm = ([a, b], [c, d]) => [a * c - 2n * b * d, a * d + b * c - b * d];
const za = ([a, b], [c, d]) => [a + c, b + d];
const zn = ([a, b]) => [-a, -b];
const mm = (X, Y) => [za(zm(X[0], Y[0]), zm(X[1], Y[2])), za(zm(X[0], Y[1]), zm(X[1], Y[3])), za(zm(X[2], Y[0]), zm(X[3], Y[2])), za(zm(X[2], Y[1]), zm(X[3], Y[3]))];
const adj = (X) => [X[3], zn(X[1]), zn(X[2]), X[0]];
const isScalar = (X) => X[1].every((c) => c === 0n) && X[2].every((c) => c === 0n) && X[0][0] === X[3][0] && X[0][1] === X[3][1];
const evalZ = (gens, w) => w.reduce((A, x) => mm(A, x > 0 ? gens[x - 1] : adj(gens[-x - 1])), [[1n, 0n], [0n, 0n], [0n, 0n], [1n, 0n]]);

/** Each relator of A follows from B's (and B's from A's): the same group on the same generators. */
function samePresentation(n, A, B) {
    for (const [X, Y] of [[A, B], [B, A]]) {
        const S = new RewritingSystem(n, { maxRules: 20000, maxLen: 60, maxWork: 5e7 });
        for (const r of Y) S.addRelator(r);
        S.complete();
        for (const r of X) assert.ok(S.kills(r), `a relator does not follow: ${r.join(' ')}`);
    }
}

test('PGL₂(𝒪[1/𝔭]) over ℚ(√−7), 𝔭 above 2: index 1, a short presentation on the given generators', () => {
    // as the page sends it: w the root of w² + w + 2, g₁ = diag(−1 − w, 1), T, the swap; k = ℚ(√−7) from step 1
    const rows = [['-w-1', '0', '0', '1'], ['1', '1', '0', '1'], ['0', '1', '1', '0']];
    const S = [{ p: '2', e: 1, f: 1, H: [['1', '0'], ['0', '2']] }];
    const r = quaternionPresentation(rows, [2n, 1n, 1n], S, { field: { minpoly: ['16', '-1', '1'], P: [['1/1', '0/1'], ['2/1', '3/1']] }, ram: [] });
    assert.ok(!r.error, r.error);
    assert.equal(r.index, 1);
    assert.equal(r.kernelIndex, 1);
    assert.equal(r.onGiven, true);
    assert.deepEqual(r.gens.map((g) => g.name), ['g1', 'g2', 'g3']);
    assert.deepEqual(r.abelian, { rank: 0, torsion: ['2', '2', '2'] });
    assert.ok(r.relators.length <= 8, `${r.relators.length} relators`);
    assert.ok(r.pruned && r.pruned.dropped > 0);
    const G = [[[-1n, -1n], [0n, 0n], [0n, 0n], [1n, 0n]], [[1n, 0n], [1n, 0n], [0n, 0n], [1n, 0n]], [[0n, 0n], [1n, 0n], [1n, 0n], [0n, 0n]]];
    for (const rel of r.relators) assert.ok(isScalar(evalZ(G, rel)), `not a relation: ${rel.join(' ')}`);
});

// Hurwitz quaternions a + bi + cj + dk as matrices over ℚ(i) (w² = −1)
const t = (c0, c1) => `${c0}+${c1}*w`.replace(/\+-/g, '-');
const H = (a0, a1, a2, a3) => [t(a0, a1), t(a2, a3), t(-a2, a3), t(a0, -a1)];

test('LPS ⟨1+2i, 1+2j, 1+2k⟩ at 5: free on its generators (simply transitive on T₆)', () => {
    const r = quaternionPresentation([H(1, 2, 0, 0), H(1, 0, 2, 0), H(1, 0, 0, 2)], [1n, 0n, 1n], [5]);
    assert.ok(!r.error, r.error);
    assert.equal(r.index, 24);
    assert.equal(r.relators.length, 0);
    assert.deepEqual(r.abelian, { rank: 3, torsion: [] });
});

test('Hurwitz quaternions at 5 and 13, five generators: by Reidemeister–Schreier, every relator checked', () => {
    const r = quaternionPresentation([H(1, 2, 0, 0), H(1, 0, 2, 0), H(1, 0, 0, 2), H(3, 2, 0, 0), H(3, 0, 2, 0)], [1n, 0n, 1n], [5, 13]);
    assert.ok(!r.error, r.error);
    assert.equal(r.index, 24);
    assert.equal(r.route, 'schreier');
    assert.equal(r.onGiven, true);
    assert.ok(r.relators.length > 0);
});

const OVER_Q = [
    ['PGL₂(ℤ[½])', [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']], [2]],
    ['⟨T², L², diag(3, 1)⟩', [['1', '2', '0', '1'], ['1', '0', '2', '1'], ['3', '0', '0', '1']], [3]],
    ['⟨Γ₀(3), diag(2, 1)⟩', [['1', '1', '0', '1'], ['1', '0', '3', '1'], ['2', '0', '0', '1']], [2]],
    // w₃ inverts an edge of T₄: K = the elements of even valuation at 3, of index 2 (P. Hall's extension)
    ['⟨Γ₀(3), w₃, diag(2, 1)⟩', [['1', '1', '0', '1'], ['1', '0', '3', '1'], ['0', '1', '3', '0'], ['2', '0', '0', '1']], [2]],
];
for (const [name, rows, S] of OVER_Q) {
    for (const tracedLength of [400, 0]) {
        test(`${name} (${tracedLength ? 'labels' : 'Reidemeister–Schreier'}): the over-ℚ route's group`, () => {
            const r = quaternionPresentation(rows, [0n, 1n], S, { tracedLength });
            const o = presentationOverQ(rows, S, {});
            assert.ok(!r.error, r.error);
            assert.equal(r.index, o.index);
            assert.equal(r.kernelIndex, o.kernelIndex);
            assert.deepEqual(r.abelian, o.abelian);
            // on the same generators: compare as words in all the given ones
            const full = (P) => {
                const ix = P.gens.map((g) => g.given);
                if (ix.some((x) => x === null)) return null;
                const back = (w) => w.map((x) => Math.sign(x) * (ix[Math.abs(x) - 1] + 1));
                return P.relators.map(back).concat(P.gamma.map((w, i) => [-(i + 1)].concat(back(w))));
            };
            const A = full(r), B = full(o);
            assert.ok(A && B, "a presentation keeps a generator besides the given ones");
            samePresentation(rows.length, A, B);
        });
    }
}
