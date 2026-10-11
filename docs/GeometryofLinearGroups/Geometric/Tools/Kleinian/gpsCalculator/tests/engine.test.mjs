// node --test tests/  — regression tests for the GPS calculator engine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { vinberg } from '../js/vinberg.js';
import { buildPolytope, symmetries } from '../js/polytope.js';
import { analyze, parseForm, parseVector } from '../js/gps.js';
import { pieceRecords, glueCheck, assemble } from '../js/glue.js';
import { similarQ, describeForm, isotropicQ } from '../js/forms.js';
import { pieceHomology } from '../js/cover.js';

const diag = d => d.map((x, i) => d.map((_, j) => (i === j ? x : 0)));
const run = (f, v, N, cut = 'one') => { const A = parseForm(f); return analyze({ A, v: parseVector(v, A.length), N, cut }, { homology: false }); };
const pieces = (f, v, N, cut) => pieceRecords(run(f, v, N, cut), f);
const firstSurface = recs => Object.values(recs[0].surfaces)[0];

test('Vinberg chambers have the known covolumes', () => {
    const cases = [
        [[-1, 1, 1], Math.PI / 4],                 // (2, 4, ∞) triangle
        [[-3, 1, 1], Math.PI / 12],                // (2, 4, 6) triangle
        [[-1, 1, 1, 1], 0.30532186472 / 4],        // [3,4,4] simplex = vol(PSL₂ℤ[i])/4
        [[-3, 1, 1, 1], 0.1057230840],             // [4,3,6] simplex
        [[-1, 1, 1, 2], 1.0038409 / 4],            // vol(PSL₂ O₋₂)/4
    ];
    for (const [d, vol] of cases) {
        const m = d.length, A = diag(d);
        const r = vinberg(A, d.map((_, i) => (i === 0 ? 1 : 0)), { wall: d.map((_, i) => (i === m - 1 ? 1 : 0)) });
        assert.ok(r.ok, `Vinberg closes for ${d}`);
        const P = buildPolytope(A, r.roots, r.rays);
        assert.ok(P.consistent, `vertex data consistent for ${d}`);
        assert.ok(Math.abs(P.volume - vol) < 2e-7, `volume of ${d}: ${P.volume} vs ${vol}`);
    }
});

test('the [3,4,4] simplex diagram and its symmetry group', () => {
    const A = diag([-1, 1, 1, 1]);
    const r = vinberg(A, [1, 0, 0, 0], { wall: [0, 0, 0, 1] });
    const P = buildPolytope(A, r.roots, r.rays);
    const labels = [];
    for (let i = 0; i < P.k; i++) for (let j = i + 1; j < P.k; j++) if (P.coxM[i][j] !== 2) labels.push(P.coxM[i][j]);
    assert.deepEqual(labels.sort(), [3, 4, 4]);
    assert.equal(symmetries(A, r.roots).length, 1);
    assert.equal(P.vertices.filter(v => v.ideal).length, 1);
});

test('rational invariants', () => {
    assert.equal(isotropicQ(diag([-7, 1, 1, 1])), false);       // 7 is not a sum of three squares
    assert.equal(isotropicQ(diag([-1, 1, 1, 1])), true);
    assert.equal(similarQ(diag([-1, 1, 1, 1]), diag([-1, 1, 1, 2])), false);
    assert.equal(similarQ(diag([-1, 1, 1, 2]), diag([-2, 1, 1, 1])), true);
    assert.equal(similarQ(diag([-7, 1, 1, 1]), diag([-7, 1, 1, 21])), false);
    const k = describeForm(diag([-7, 1, 1, 21]));
    assert.equal(k.field, -3);
    assert.deepEqual(k.ramAbove, [7]);
    const t = describeForm(diag([-3, 1, 1]));
    assert.deepEqual(t.ram, [2, 3]);
});

test('every certificate holds on a range of covers', () => {
    const cases = [
        ['-1,1,1', '0,0,1', 3], ['-1,1,1', '0,1,1', 3], ['-3,1,1', '0,1,0', 3],
        ['-1,1,1,1', '0,0,0,1', 3], ['-1,1,1,1', '0,0,0,1', 4], ['-1,1,1,2', '0,0,0,1', 3],
        ['-7,1,1,1', '0,0,0,1', 3], ['-1,1,1,1', '0,1,1,1', 3], ['-1,1,1,1', '0,1,1,0', 4],
        ['-1,1,1,1', '0,0,0,1', 4, 'fix'],
    ];
    for (const [f, v, N, cut] of cases) {
        const r = run(f, v, N, cut);
        assert.ok(r.ok, `${f} ${v}`);
        const c = r.cover.certificates;
        assert.ok(c.embedded && c.twoSided && c.torsionFree && c.verticesInject, `certificates for ${f} ${v} N=${N}: ${JSON.stringify(c)}`);
        for (const sf of r.cover.surfaces) if (r.P.n === 3) assert.ok(sf.chiExact !== null, `χ(Σ) is an integer for ${f} ${v}`);
    }
});

test('splittings: amalgams, HNN extensions, and Fix(r_v)', () => {
    assert.equal(run('-1,1,1', '0,1,1', 3).cover.nPieces, 2);                // separating closed geodesic
    assert.equal(run('-3,1,1', '0,1,0', 3).cover.nPieces, 1);                // non-separating
    const fix = run('-1,1,1,1', '0,0,0,1', 4, 'fix').cover;
    assert.equal(fix.nPieces, 2);
    assert.equal(fix.pieces[0].tiles, fix.pieces[1].tiles);
    const s = run('-7,1,1,1', '0,0,0,1', 3).cover.surfaces[0];
    assert.equal(s.genus, 4);
    assert.equal(s.punctures, 0);
});

test('split lattice for a hypersurface that is not a mirror', () => {
    const r = run('-1,1,1,1', '0,1,1,1', 3);
    assert.equal(r.lattice.mode, 'split');
    assert.equal(r.lattice.D, 3);
    assert.equal(r.cover.surfaces[0].genus, 4);
});

test('gluing verdicts', () => {
    const picard = pieces('-1,1,1,1', '0,0,0,1', 3);
    assert.equal(glueCheck(firstSurface(picard), firstSurface(pieces('-1,1,1,2', '0,0,0,1', 3))).status, 'yes');
    assert.equal(glueCheck(firstSurface(picard), firstSurface(pieces('-1,1,1,1', '0,0,0,1', 4))).status, 'no');
    assert.equal(glueCheck(firstSurface(pieces('-7,1,1,1', '0,0,0,1', 3)), firstSurface(pieces('-7,1,1,21', '0,0,0,1', 3))).status, 'yes');
    assert.equal(glueCheck(firstSurface(pieces('-1,1,1', '0,1,1', 3)), firstSurface(pieces('-1,1,2', '0,1,0', 3))).status, 'yes');
});

test('a GPS hybrid is reported non-arithmetic', () => {
    const a = pieces('-1,1,1,1', '0,0,0,1', 3)[0], b = pieces('-1,1,1,2', '0,0,0,1', 3)[0];
    const asm = assemble([a, b], [{ a: { piece: 0, b: 0 }, b: { piece: 1, b: 1 } }, { a: { piece: 0, b: 1 }, b: { piece: 1, b: 0 } }]);
    assert.ok(asm.closedUp && asm.connected);
    assert.equal(asm.classes.length, 2);
    assert.equal(asm.verdict.status, 'nonarithmetic');
});

test('a closed surface hybrid from incommensurable cocompact lattices', () => {
    const a = pieces('-3,1,1', '0,0,1', 3)[0], b = pieces('-3,1,7', '0,0,1', 3)[0];
    assert.equal(glueCheck(Object.values(a.surfaces)[0], Object.values(b.surfaces)[0]).status, 'yes');
    const asm = assemble([a, b], [{ a: { piece: 0, b: 0 }, b: { piece: 1, b: 1 } }, { a: { piece: 0, b: 1 }, b: { piece: 1, b: 0 } }]);
    assert.equal(asm.verdict.status, 'nonarithmetic');
    // ⟨−1,1,1⟩ and ⟨−1,1,2⟩ are both split (M₂(ℚ)): commensurable, so no verdict
    const c = pieces('-1,1,1', '0,1,1', 3)[0], d = pieces('-1,1,2', '0,1,0', 3)[0];
    assert.equal(assemble([c, d], [{ a: { piece: 0, b: 0 }, b: { piece: 1, b: 0 } }]).classes.length, 1);
});

test('H₁ of surface pieces agrees with the Euler characteristic', () => {
    for (const [f, v] of [['-1,1,1', '0,1,1'], ['-3,1,1', '0,1,0'], ['-1,1,1', '0,0,1']]) {
        const r = run(f, v, 3);
        const H = pieceHomology(r.P, r.cover);
        r.cover.pieces.forEach((p, i) => {
            const chiPiece = Math.round(-p.tiles * r.P.volume / (2 * Math.PI));
            // cutting along a bi-infinite geodesic adds 1 to χ; along a closed one, 0
            const chiCut = r.cover.surfaces[0].closed ? chiPiece : chiPiece + p.boundary.length / 2;
            assert.equal(H[i].b1, 1 - chiCut, `${f} ${v} piece ${i}`);
            assert.deepEqual(H[i].torsion, []);
        });
    }
});
