// engine.test.mjs — the Dehn filling engine against SnapPy (tests/reference.json, from tools/make_census.py).
//
//   node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CENSUS } from '../js/census.js';
import { Triangulation } from '../js/triangulation.js';
import { Solver, dualCurve } from '../js/solver.js';
import { holonomy, evalWord, developCusp, developTets } from '../js/develop.js';
import { fillingHomology, homologySnapPy } from '../js/homology.js';
import { C, INF, abs, sub, add, mul, div, exp, mtrace, mmul, mpow, mapply, mobiusFrom3 } from '../js/complex.js';
import { lobachevsky, tetVolume } from '../js/volume.js';

const REF = JSON.parse(fs.readFileSync(new URL('./reference.json', import.meta.url), 'utf8'));
const TWO = C(2, 0);
const traceDist = (t, ref) => Math.min(abs(sub(t, ref)), abs(add(t, ref)));
const isPmIdentity = (M) => Math.min(abs(sub(M[0], C(1))), abs(add(M[0], C(1)))) + abs(M[1]) + abs(M[2]) + Math.min(abs(sub(M[3], C(1))), abs(add(M[3], C(1))));
const mod = (x, m) => ((x % m) + m) % m;
const angleClose = (a, b, m, tol) => { const d = mod(a - b, m); return Math.min(d, m - d) < tol; };

test('Lobachevsky function and the regular ideal tetrahedron', () => {
    assert.ok(Math.abs(3 * lobachevsky(Math.PI / 3) - 1.0149416064096536) < 1e-14);
    assert.ok(Math.abs(tetVolume(C(0.5, Math.sqrt(3) / 2)) - 1.0149416064096536) < 1e-14);
    assert.ok(Math.abs(tetVolume(C(0, 1)) - 0.915965594177219) < 1e-14);      // Catalan's constant
    assert.ok(Math.abs(tetVolume(C(0.5, -Math.sqrt(3) / 2)) + 1.0149416064096536) < 1e-14);
});

for (const e of CENSUS) {
    const tri = new Triangulation(e);
    const sol = new Solver(tri);
    const ref = REF[e.id];

    test(`${e.id}: edge equations match SnapPy`, () => {
        const key = (r) => JSON.stringify(r);
        assert.deepEqual(tri.edgeRows.map(key).sort(), ref.edgeRows.map(key).sort());
        assert.equal(tri.edgeClasses.length, tri.n);
        assert.equal(tri.edgeClasses.reduce((s, c) => s + c.length, 0), 6 * tri.n);
    });

    test(`${e.id}: complete structure (volume, cusp shapes, traces, relators)`, () => {
        const st = sol.completeState();
        const res = sol.residual(st, sol.equations(new Array(tri.nCusp).fill(null)));
        assert.ok(Math.max(...res.map(abs)) < 1e-12, 'gluing equations hold at the census shapes');
        const fr = sol.frame(st, 0, new Array(tri.nCusp).fill(null));
        assert.ok(Math.abs(fr.volume - e.volume) < 1e-10);
        const H = holonomy(tri, fr.z);
        for (const w of e.pres.rels) assert.ok(isPmIdentity(evalWord(w, H.simple)) < 1e-8, `relator ${w}`);
        for (const [w, t] of Object.entries(ref.traces)) {
            assert.ok(traceDist(mtrace(evalWord(w, H.simple)), C(t[0], t[1])) < 1e-8, `trace of ${w}`);
        }
        for (let k = 0; k < tri.nCusp; k++) {
            const cu = developCusp(tri, fr.z, k);
            // the developed cusp is the mirror image of SnapPy's view from the cusp
            const shape = div(cu.longitude[1], cu.meridian[1]);
            assert.ok(abs(sub(shape, C(e.cuspShapes[k][0], -e.cuspShapes[k][1]))) < 1e-9, `cusp ${k} shape`);
            assert.ok(abs(sub(cu.meridian[0], C(1))) < 1e-10 && abs(sub(cu.longitude[0], C(1))) < 1e-10);
            assert.equal(cu.triangles.length, tri.cuspTriangles(k).length);
            // peripheral elements are parabolic
            assert.ok(traceDist(mtrace(H.periph[k].m), TWO) < 1e-8);
            assert.ok(traceDist(mtrace(H.periph[k].l), TWO) < 1e-8);
        }
    });

    test(`${e.id}: developing along SnapPy's tree reproduces SnapPy's corners`, () => {
        const z = sol.shapes(sol.completeState());
        const { P } = developTets(tri, z);
        const toPt = (c) => (c === null ? INF : [C(c[0], c[1]), C(1)]);
        // SnapPy normalizes the root differently: compare after the Möbius map matching the roots
        const R = e.tets[tri.root].corners.map(toPt);
        const g = mobiusFrom3(P[tri.root].slice(0, 3), R.slice(0, 3));
        for (let t = 0; t < tri.n; t++) {
            for (let v = 0; v < 4; v++) {
                const mine = mapply(g, P[t][v]), theirs = toPt(e.tets[t].corners[v]);
                const d = abs(sub(mul(mine[0], theirs[1]), mul(theirs[0], mine[1])));
                const sc = (abs(mine[0]) + abs(mine[1])) * (abs(theirs[0]) + abs(theirs[1]));
                assert.ok(d < 1e-8 * sc, `tet ${t} vertex ${v}`);
            }
        }
    });

    test(`${e.id}: Dehn fillings match SnapPy (volume, core geodesic, H₁, holonomy)`, () => {
        for (const f of ref.fillings) {
            const spec = f.slopes.map((s) => (s ? { p: s[0], q: s[1], t: 1 } : null));
            const r = sol.solve(spec, { N: 16 });
            assert.ok(r.ok, `${JSON.stringify(f.slopes)} solves`);
            const fr = r.frame;
            assert.ok(Math.abs(fr.volume - f.volume) < 1e-9, `${JSON.stringify(f.slopes)} volume ${fr.volume} vs ${f.volume}`);
            fr.cores.forEach((c, k) => {
                if (!c || !f.core[k]) return;
                assert.ok(Math.abs(c.re - f.core[k][0]) < 1e-9, 'core length');
                assert.ok(angleClose(c.im, f.core[k][1], 2 * Math.PI, 1e-8) || angleClose(c.im, -f.core[k][1], 2 * Math.PI, 1e-8), 'core torsion');
            });
            const hom = fillingHomology(e.pres, f.slopes.map((s) => (s ? { p: s[0], q: s[1] } : null)));
            assert.equal(homologySnapPy(hom), f.homology.replace(/\s/g, ''), 'H₁');
            const H = holonomy(tri, fr.z);
            for (const w of e.pres.rels) assert.ok(isPmIdentity(evalWord(w, H.simple)) < 1e-7, `relator ${w}`);
            f.slopes.forEach((s, k) => {
                if (!s) return;
                const M = mmul(mpow(H.periph[k].m, s[0]), mpow(H.periph[k].l, s[1]));
                assert.ok(isPmIdentity(M) < 1e-6, 'm^p l^q = ±I');
                const cu = developCusp(tri, fr.z, k);
                assert.ok(abs(sub(cu.meridian[0], exp(fr.hol[k].m))) < 1e-8, 'cusp picture holonomy');
            });
        }
    });
}

test('cone manifolds: Schläfli dV/dθ = −ℓ/2 and the figure-eight collapse at 2π/3', () => {
    const e = CENSUS.find((x) => x.id === '4_1');
    const tri = new Triangulation(e), sol = new Solver(tri);
    const path = sol.follow(sol.completeState(), (s) => [{ p: 5, q: 1, t: s }], { N: 240 });
    assert.ok(path.ok);
    const fr = path.frames;
    for (let i = 1; i + 1 < fr.length; i++) {
        const dV = (fr[i + 1].volume - fr[i - 1].volume) / (2 * Math.PI * (fr[i + 1].s - fr[i - 1].s));
        assert.ok(Math.abs(dV + fr[i].cores[0].re / 2) < 1e-4, `Schläfli at s=${fr[i].s}`);
    }
    // meridian: the orbifold with cone angle α along the knot is Euclidean at α = 2π/3
    const mer = sol.follow(sol.completeState(), (s) => [{ p: 1, q: 0, t: s }], { N: 120 });
    assert.ok(!mer.ok && mer.collapsed);
    assert.ok(Math.abs(mer.sFail - 1 / 3) < 1e-4, `collapses at θ = ${360 * mer.sFail}°`);
    // exceptional slopes do not reach a hyperbolic structure; 5 does
    for (const [p, q, ok] of [[4, 1, false], [0, 1, false], [-4, 1, false], [5, 1, true], [-5, 1, true]]) {
        assert.equal(sol.solve([{ p, q, t: 1 }], { N: 32 }).ok, ok, `${p}/${q}`);
    }
});

test('orbifold fillings: the elliptic element has order n', () => {
    const e = CENSUS.find((x) => x.id === '4_1');
    const tri = new Triangulation(e), sol = new Solver(tri);
    for (const n of [2, 3, 4]) {
        const r = sol.solve([{ p: 5, q: 1, t: 1 / n }], { N: 16 });
        assert.ok(r.ok);
        const H = holonomy(tri, r.frame.z);
        const g = mmul(mpow(H.periph[0].m, 5), H.periph[0].l);
        assert.ok(isPmIdentity(mpow(g, n)) < 1e-8, `(m⁵l)^${n} = ±I`);
        assert.ok(isPmIdentity(g) > 1e-3, 'm⁵l is not trivial');
    }
});

test('dual curves: p·s − q·r = 1', () => {
    for (const [p, q] of [[5, 1], [-5, 1], [7, 2], [-7, 3], [1, 0], [-1, 0], [0, 1], [13, 4], [37, 2]]) {
        const [r, s] = dualCurve(p, q);
        assert.equal(p * s - q * r, 1, `${p}/${q}`);
    }
});
