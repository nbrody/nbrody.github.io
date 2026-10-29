// node --test tests/presentation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reidemeisterSchreier, tietze, abelianInvariants, _canonKey } from '../js/presentation.js';
import { presentationOverQ, standardLambdaQ, presentationReport } from '../js/sarithPresentation.js';
import { congruenceDescription } from '../js/congruence.js';

const rows = (k) => k.split('|').map((m) => m.split(','));
const ab = (r) => `${r.abelian.rank}|${r.abelian.torsion.join(',')}`;

test('the relator key is the least rotation of w or w⁻¹ (Booth, against brute force)', () => {
    const inv = (w) => w.slice().reverse().map((x) => -x);
    const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    const brute = (w) => { let best = null; for (const u of [w, inv(w)]) for (let r = 0; r < u.length; r++) { const k = u.slice(r).concat(u.slice(0, r)); if (!best || cmp(k, best) < 0) best = k; } return best.join(','); };
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let t = 0; t < 3000; t++) {
        const w = Array.from({ length: 1 + rnd(10) }, () => (1 + rnd(3)) * (rnd(2) ? 1 : -1));
        assert.equal(_canonKey(w), brute(w));
    }
});

test('Reidemeister–Schreier keeps the squares of involutions (PGL₂(ℤ) on its own table)', () => {
    // a, b, c with (ab)², (bc)³ and index 1: the presentation is PGL₂(ℤ) again, H₁ = (ℤ/2)²
    const R = reidemeisterSchreier({ nLetters: 3, inv: (x) => x, relators: [[0, 1, 0, 1], [1, 2, 1, 2, 1, 2]], table: [[0, 0, 0]] });
    assert.deepEqual(abelianInvariants(R.gens.length, R.relators), { rank: 0, torsion: ['2', '2'] });
});

test('Tietze: a kept generator of order 1 keeps its relator x (keepPreferred)', () => {
    const T = tietze(2, [[1], [2, 2, 2]], { prefer: new Set([1, 2]), keepPreferred: true });
    assert.deepEqual(T.keep, [1, 2]);
    assert.deepEqual(T.relators, [[1], [2, 2, 2]]);
});

test('Tietze: power relators reduce exponents, and redundant generators go', () => {
    // ⟨x, y, z | x², z = x y, x³ y⁻¹ x y⟩ = ⟨x, y | x², x y⁻¹ x y⟩ (z eliminated, x³ → x)
    const T = tietze(3, [[1, 1], [-3, 1, 2], [1, 1, 1, -2, 1, 2]], { prefer: new Set([1, 2]) });
    assert.deepEqual(T.keep, [1, 2]);
    assert.deepEqual(T.relators.map((w) => w.length).sort(), [2, 4]);
    assert.deepEqual(T.express(3), [1, 2]);
});

test('Λ = PGL₂(ℤ[1/S]) on its standard generators T, w, J, D_p', () => {
    const L = standardLambdaQ([]);
    assert.deepEqual(L.std.map((g) => g.name), ['T', 'w', 'J']);
    assert.deepEqual(abelianInvariants(3, L.relators), { rank: 0, torsion: ['2', '2'] });
    const L2 = standardLambdaQ([2]);
    assert.deepEqual(L2.std.map((g) => g.name), ['T', 'w', 'J', 'D_2']);
    // PGL₂(ℤ[1/2])^ab: det mod squares gives (ℤ/2)² (−1 and 2); T dies (D₂⁻¹T²D₂ = T)
    assert.deepEqual(abelianInvariants(4, L2.relators), { rank: 0, torsion: ['2', '2'] });
});

test('classical groups: PSL₂(ℤ), Γ(2), Γ₀(2), Γ₀(2)⁺', () => {
    const psl = presentationOverQ(rows('1,1,0,1|0,-1,1,0'), []);
    assert.equal(psl.index, 2);
    assert.equal(ab(psl), '0|6');                                // ℤ/2 ∗ ℤ/3
    const g2 = presentationOverQ(rows('1,2,0,1|1,0,2,1'), []);
    assert.equal(g2.index, 12);
    assert.equal(g2.relators.length, 0);                         // free on the two given generators
    assert.ok(g2.onGiven);
    const g02 = presentationOverQ(rows('1,1,0,1|1,0,2,1'), []);
    assert.equal(ab(g02), '1|2');                                // ℤ ∗ ℤ/2
    // the Fricke group ⟨T, W₂⟩: K = Γ₀(2) has index 2, and Γ ≅ ℤ/2 ∗ ℤ/4
    const fr = presentationOverQ(rows('1,1,0,1|0,-1,2,0'), []);
    assert.equal(fr.kernelIndex, 2);
    assert.equal(ab(fr), '0|2,4');
    assert.deepEqual(fr.relators.map((w) => w.length), [2, 8]);
});

test('S-arithmetic groups: the index agrees with the congruence description', () => {
    const cases = [
        ['1,1,0,1|1,0,5,1|2,0,0,1/2|2,1,5,3', [2], [3, 5], 24, 'Γ₀(N)', 5],
        ['1,1,0,1|1,0,7,1|3,0,0,1/3', [3], [8, 7], 32, 'Γ₀(N)', 7],
        ['1,1,0,1|1,0,5,1|4,0,0,1/4|11,-2,5,-1', [2], [3, 25], 24, 'Γ₁(N)', 5],
        ['1,3,0,1|1,0,3,1|4,0,0,1/4', [2], [9, 5], 48, 'Γ(N)', 3],
    ];
    for (const [g, S, levels, index, shape, N] of cases) {
        const P = presentationOverQ(rows(g), S.map(String));
        assert.equal(P.index, index, g);
        const C = congruenceDescription(rows(g), S, levels);
        assert.equal(C.index, index, g);
        assert.equal(C.shape, shape, g);
        assert.equal(C.N, N, g);
    }
});

test('presentations on the given generators, every relator checked (also across odd valuations)', () => {
    // ⟨T, (0 1; 3 0), D₂⟩ over ℤ[1/2]: odd valuations at 3, K of index 2
    const P = presentationOverQ(rows('1,1,0,1|0,1,3,0|2,0,0,1'), ['2']);
    assert.equal(P.kernelIndex, 2);
    assert.equal(P.index, 8);
    assert.ok(P.onGiven);
    assert.equal(ab(P), '0|2,2');
    // Γ₀(15)⁺ over ℤ[1/2], with the two Atkin–Lehner elements A (det 3) and B (det 5). Replacing B by
    // AB (det 15) is the same group, but the parity classes arrive as 11, 10, 01. The basis has to
    // reduce 11 against the earlier row; keeping the unreduced class throws "a parity class outside
    // the span" and presents nothing.
    const standard = presentationOverQ(rows('1,1,0,1|1,0,15,1|2,0,0,1|3,1,15,6|5,1,45,10'), ['2']);
    const mixed = presentationOverQ(rows('1,1,0,1|1,0,15,1|2,0,0,1|60,13,345,75|3,1,15,6'), ['2']);
    assert.equal(mixed.error, undefined);
    assert.equal(mixed.kernelIndex, 4);
    assert.equal(mixed.index, standard.index);
    assert.equal(ab(mixed), ab(standard));
    // conjugated at 3 (even valuations): ⟨T³, (1 0; 1/3 1)⟩ ≅ PSL₂(ℤ)
    const C = presentationOverQ(rows('1,3,0,1|1,0,1/3,1'), []);
    assert.deepEqual(C.conjugatedAt, ['3']);
    assert.equal(ab(C), '0|6');
});

test('the report: Λ, the congruence description and Γ, serializable', () => {
    const R = presentationReport(rows('1,1,0,1|1,0,5,1|2,0,0,1/2|2,1,5,3'), ['2'], { levels: [3, 5] });
    assert.equal(R.lambda.gens.length, 4);
    assert.ok(R.cong.agrees);
    assert.equal(R.pres.index, 24);
    assert.doesNotThrow(() => JSON.stringify(R));
});

test('Bianchi rings: Λ on w, T, U, units and D_π; Γ on its given generators', async () => {
    const { presentationReportBianchi } = await import('../js/bianchiPresentation.js');
    const { parseLinear } = await import('../js/bianchi.js');
    const m = (s) => s.split(',').map((e) => { const t = parseLinear(e); return [t[0][0], t[1][0]]; });
    // PGL₂(ℤ[i][1/(1+i)]) itself: index 1, and its abelianization (ℤ/2)²
    const L = presentationReportBianchi(1, ['0,-1,1,0', '1,1,0,1', '1,w,0,1', 'w,0,0,1', '1+w,0,0,1'].map(m));
    assert.equal(L.pres.index, 1);
    assert.deepEqual(L.pres.abelian, { rank: 0, torsion: ['2', '2'] });
    assert.deepEqual(L.lambda.gens.map((g) => g.name), ['w', 'T', 'U', 'L', 'E', 'D_{1−w}']);
    // index 2 in PGL₂(ℤ[√−2][1/√−2]), on the given generators
    const P = presentationReportBianchi(2, ['1,1,0,1', '1,w,0,1', '0,-1,1,0', 'w,0,0,1'].map(m)).pres;
    assert.equal(P.index, 2);
    assert.ok(P.onGiven);
    assert.deepEqual(P.abelian, { rank: 0, torsion: ['6'] });
});
