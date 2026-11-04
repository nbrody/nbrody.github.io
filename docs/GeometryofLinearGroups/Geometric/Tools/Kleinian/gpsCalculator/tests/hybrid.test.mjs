// node --test tests/hybrid.test.mjs — multiquadratic fields, the spin export,
// gluing of right-angled chambers, and the invariants of hybrids.
//
// The reference numbers for ⟨−3,1,1,6⟩ ∪ ⟨−3,1,1,15⟩ were checked independently
// (Sage for the traces and the invariant trace field; the Presentation
// Calculator's Dirichlet domain and Bloch–Wigner sum for the volumes at both
// complex places: 2(V₁ + V₂) = 3.1058256331 and 2|V₁ − V₂| = 1.0981436264).

import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiQuad, kmat } from '../js/multiquad.js';
import { spinSetup, spinPair, rotationGenerators, poincareState, basepointBall, interiorPoint } from '../js/spin.js';
import { chamberOfForm, findPartners } from '../js/partners.js';
import { glueChambers, rightAngledWalls, mixingBase } from '../js/chamber.js';
import { hybridInvariants, bianchiUnit, recognizeRational, multiquadData, zetaTerm, zetaTex, catalanTex } from '../js/arith.js';
import { bil } from '../js/linalg.js';

const diag = (d) => d.map((x, i) => d.map((_, j) => (i === j ? x : 0)));
const close = (a, b, tol = 1e-8) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const cabs2 = (z) => z.re * z.re + z.im * z.im;

test('multiquadratic arithmetic: square roots, inverses, the primitive element', () => {
    const K = new MultiQuad([-1, 18, 90]);                 // ℚ(i, √2, √10)
    assert.equal(K.degree, 8);
    for (const r of [-1, 2, 5, 10, -2, -5, -10, 18, 90, -90]) {
        const s = K.sqrt(r);
        assert.ok(K.eq(K.mul(s, s), K.rat(r)), `√${r} squared`);
        const v = K.num(s);
        if (r > 0) assert.ok(v.re > 0 && Math.abs(v.im) < 1e-12, `√${r} is the positive root`);
        else assert.ok(v.im > 0 && Math.abs(v.re) < 1e-12, `√${r} is i times positive`);
    }
    const a = K.add(K.sqrt(2), K.rat(3)), b = K.add(K.sqrt(-5), K.sqrt(10));
    assert.ok(K.eq(K.mul(K.div(a, b), b), a), 'division');
    // the minimal polynomial of θ vanishes at θ, and every element is a polynomial in θ
    const { poly } = K.powerBasis();
    assert.equal(poly.length, 9);
    const th = K.theta();
    let acc = K.zero(), p = K.one();
    for (const c of poly) { acc = K.add(acc, K.scale(p, c)); p = K.mul(p, th); }
    assert.ok(K.isZero(acc), 'P(θ) = 0');
    const x = K.add(K.scale(K.sqrt(10), 7n), K.sqrt(-2));
    const cs = K.asPoly(x);
    let y = K.zero(); p = K.one();
    for (const c of cs) { y = K.add(y, K.scale(p, c)); p = K.mul(p, th); }
    assert.ok(K.eq(x, y), 'x = Σ c_j θ^j');
});

test('spin isomorphism: traces of s_u s_v agree with the Lorentz matrices (n = 3 and n = 2)', () => {
    for (const A of [diag([-3, 1, 1, 6]), diag([-7, 1, 1, 21]), [[-2, 1, 0, 0], [1, 2, 0, 0], [0, 0, 1, 0], [0, 0, 0, 3]], diag([-3, 1, 5])]) {
        const n = A.length - 1;
        const S = spinSetup(A);
        const vecs = n === 3 ? [[0, 1, -1, 0], [1, 0, 3, 0], [0, 0, 0, 1], [-2, -3, -2, -1], [1, 2, 3, 4]] : [[0, 1, 0], [0, 0, 1], [1, 2, 0], [2, 1, 1]];
        for (let i = 0; i < vecs.length; i++) for (let j = 0; j < vecs.length; j++) {
            const u = vecs[i], v = vecs[j];
            if (bil(A, u, u) === 0 || bil(A, v, v) === 0) continue;
            const refl = (r) => (x) => { const c = 2 * bil(A, x, r) / bil(A, r, r); return x.map((t, k) => t - c * r[k]); };
            const E = A.map((_, k) => A.map((__, l) => (k === l ? 1 : 0)));
            const L = E.map((e) => refl(u)(refl(v)(e)));            // columns of s_u s_v
            const tr4 = L.reduce((s, col, k) => s + col[k], 0);
            const X = spinPair(S, u, v);
            const tr = S.K.num(kmat.trace(S.K, X)), det = S.K.num(kmat.det(S.K, X));
            const got = n === 3 ? cabs2(tr) / Math.sqrt(cabs2(det)) : (tr.re * tr.re - tr.im * tr.im) / det.re - 1;
            assert.ok(close(got, tr4, 1e-7), `n = ${n}, ${u} ${v}: ${got} vs ${tr4}`);
        }
    }
});

test('the basepoint map is equivariant', () => {
    const A = diag([-3, 1, 1, 6]);
    const S = spinSetup(A);
    const u = [1, 0, 3, 0], v = [-2, -2, -2, -1], p = [-4, -1, -2, -1];
    const refl = (r) => (x) => { const c = 2 * bil(A, x, r) / bil(A, r, r); return x.map((t, k) => t - c * r[k]); };
    const gp = refl(u)(refl(v)(p));
    const X = spinPair(S, u, v).map((e) => S.K.num(e));
    // act on poincare's hyperboloid point of p and compare with the point of g·p
    const toH = (b) => { const r2 = b[0] ** 2 + b[1] ** 2 + b[2] ** 2; const t = (1 + r2) / (1 - r2); return [2 * b[0] / (1 - r2), 2 * b[1] / (1 - r2), 2 * b[2] / (1 - r2), t]; };
    const [x, y, z, t] = toH(basepointBall(S, p));
    const H = [{ re: t + z, im: 0 }, { re: x, im: y }, { re: x, im: -y }, { re: t - z, im: 0 }];
    const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
    const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
    const conj = (a) => ({ re: a.re, im: -a.im });
    const m2 = (P, Q) => [add(mul(P[0], Q[0]), mul(P[1], Q[2])), add(mul(P[0], Q[1]), mul(P[1], Q[3])), add(mul(P[2], Q[0]), mul(P[3], Q[2])), add(mul(P[2], Q[1]), mul(P[3], Q[3]))];
    const Xs = [conj(X[0]), conj(X[2]), conj(X[1]), conj(X[3])];
    const K2 = m2(m2(X, H), Xs);
    const d = Math.sqrt(K2[0].re * K2[3].re - cabs2(K2[1]));          // det(X H X*) = |det X|²
    const img = [K2[1].re / d, K2[1].im / d, (K2[0].re - K2[3].re) / (2 * d), (K2[0].re + K2[3].re) / (2 * d)];
    const want = toH(basepointBall(S, gp));
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(img[i] - want[i]) < 1e-8 * Math.max(1, Math.abs(want[i])), `coordinate ${i}: ${img[i]} vs ${want[i]}`);
});

const chamber = (d) => { const c = chamberOfForm(diag(d), 20000); assert.ok(c.ok, `${d}: ${c.why}`); return c.rec; };

test('right-angled chambers glue: ⟨−3,1,1,6⟩ ∪ ⟨−3,1,1,15⟩ reproduces the research numbers', () => {
    const c1 = chamber([-3, 1, 1, 6]), c2 = chamber([-3, 1, 1, 15]);
    assert.ok(rightAngledWalls(c1.coxM).includes(c1.wall) && rightAngledWalls(c2.coxM).includes(c2.wall));
    let S;
    const g = glueChambers(c1, c2, (rads) => (S = spinSetup(c1.AL, rads)).K);
    assert.equal(g.status, 'yes', g.reason);
    const G = g.glued;
    assert.equal(G.walls.length, 8);
    assert.equal(G.bad.length, 0);
    assert.ok(close(G.volume, 0.5019205016705981 + 1.0509923148690048, 1e-10));
    // the Coxeter matrix of P (rows: the three face walls, two walls of P₁, three of P₂)
    const want = [
        [1, 6, 4, 2, 2, 2, -1, 2], [6, 1, 2, 2, 4, 2, 2, -1], [4, 2, 1, -1, 2, -1, 2, 2], [2, 2, -1, 1, 2, -1, -1, -1],
        [2, 4, 2, 2, 1, -1, -1, -1], [2, 2, -1, -1, -1, 1, 2, 4], [-1, 2, 2, -1, -1, 2, 1, 2], [2, -1, 2, -1, -1, 4, 2, 1]];
    assert.deepEqual(G.coxM, want);
    // invariants
    const I = hybridInvariants([{ d: c1.formInfo.field, V: c1.volume }, { d: c2.formInfo.field, V: c2.volume }], c1.hypInfo);
    assert.deepEqual(I.field.basis, [-2, -5]);
    assert.equal(I.field.disc, 6400n);
    assert.equal(I.field.r2, 2);
    assert.deepEqual(I.algebra.ram, [3]);
    assert.ok(close(I.places[0].value, 1.552912816539603, 1e-12));
    assert.ok(close(Math.abs(I.places[1].value), 0.5490718131984067, 1e-12));
    assert.deepEqual(I.zeta.map((z) => [z.p, z.q]), [[1, 2], [1, 4]]);
    // the export: traces of the generators of W⁺(P), as computed in Sage
    const gens = rotationGenerators(S, G.walls, { base: 0 });
    const t2 = gens.map((x) => { const tr = S.K.num(kmat.trace(S.K, x.mat)), det = S.K.num(kmat.det(S.K, x.mat)); return Math.round(1e9 * cabs2(tr) / Math.sqrt(cabs2(det))) / 1e9; });
    assert.deepEqual(t2, [3, 2, 0, 0, 0, 5, 0]);
    const st = poincareState(S.K, rotationGenerators(S, G.walls, { base: mixingBase(G) }).map((x) => x.mat), { bp: basepointBall(S, interiorPoint(c1.AL, c1.verts, (v) => v.walls.includes(c1.wall))) });
    assert.equal(st.consts[0].poly, 'w^{8} + 16w^{6} + 62w^{4} + 64w^{2} + 1');
    assert.ok(st.bp && Math.hypot(...st.bp) < 0.99);
    assert.equal(st.mats.length, 7);
});

test('both pieces cocompact, yet AΓ splits: ⟨−3,1,1,5⟩ ∪ ⟨−3,1,1,6⟩', () => {
    const c1 = chamber([-3, 1, 1, 5]), c2 = chamber([-3, 1, 1, 6]);
    const g = glueChambers(c1, c2, (r) => new MultiQuad(r));
    assert.equal(g.status, 'yes');
    const I = hybridInvariants([{ d: c1.formInfo.field, V: c1.volume }, { d: c2.formInfo.field, V: c2.volume }], c1.hypInfo);
    assert.equal(I.field.disc, 14400n);
    assert.equal(I.algebra.split, true);
    assert.ok(close(Math.abs(I.places[1].value), 0.6750597087536254, 1e-12));
});

test('a cusped chamber glues to a compact one along a quadrilateral, and surfaces glue too', () => {
    const g = glueChambers(chamber([-7, 1, 1, 7]), chamber([-7, 1, 1, 21]), (r) => new MultiQuad(r));
    assert.equal(g.status, 'yes');
    assert.equal(g.glued.walls.length, 13);
    assert.equal(g.glued.compact, false);
    const s1 = chamber([-3, 1, 5]), s2 = chamber([-3, 1, 6]);
    let S;
    const h = glueChambers(s1, s2, (r) => (S = spinSetup(s1.AL, r)).K);
    assert.equal(h.status, 'yes', h.reason);
    assert.equal(h.glued.bad.length, 0);
    assert.ok(close(h.glued.volume, s1.volume + s2.volume, 1e-12));
    // a Fuchsian export: real matrices
    const gens = rotationGenerators(S, h.glued.walls, { base: mixingBase(h.glued) });
    for (const x of gens) for (const e of x.mat) assert.ok(Math.abs(S.K.num(e).im) < 1e-9);
});

test('chambers that do not glue', () => {
    const c1 = chamber([-3, 1, 1, 6]);
    const c3 = chamber([-7, 1, 1, 21]);
    assert.equal(glueChambers(c1, c3).status, 'no');                 // a triangle and a quadrilateral
});

test('partner search finds the compact partners of ⟨−3,1,1,6⟩', () => {
    const c1 = chamber([-3, 1, 1, 6]);
    const found = [];
    findPartners(c1, { amin: 4, amax: 6, perFormMs: 3000, onResult: (r) => found.push(r) });
    const byA = Object.fromEntries(found.map((r) => [r.a, r]));
    assert.equal(byA[5].ok, true);
    assert.equal(byA[5].rec.compact, true);
    assert.equal(byA[5].similar, false);
    assert.equal(byA[6].similar, true);                                // itself
});

test('zeta values and rational recognition', () => {
    assert.ok(close(bianchiUnit(-1), 0.30532186472, 1e-9));           // vol PSL₂(ℤ[i])
    assert.ok(close(bianchiUnit(-3), 0.1691569, 1e-6));               // vol PSL₂(ℤ[ω]) = 4·vol[3,3,6]
    assert.ok(close(bianchiUnit(-2), 1.0038410, 1e-6));
    assert.deepEqual(recognizeRational(0.375), { p: 3, q: 8 });
    const K = multiquadData([-15, -2, 30]);
    assert.equal(K.degree, 4);
    assert.deepEqual(K.expr, [1, 2, 3]);
});

test('volumes as zeta values', () => {
    const c6 = chamber([-3, 1, 1, 6]), c15 = chamber([-3, 1, 1, 15]), c5 = chamber([-3, 1, 1, 5]);
    // vol P = c √r ζ_k(2)/π², from vol P = q |D|^{3/2} ζ_k(2)/4π²
    assert.deepEqual(zetaTerm(c6.volume, -2), { p: 2, q: 1, r: 2, d: -2 });
    assert.deepEqual(zetaTerm(c15.volume, -5), { p: 5, q: 2, r: 5, d: -5 });
    assert.deepEqual(zetaTerm(c5.volume, -15), { p: 45, q: 32, r: 15, d: -15 });
    assert.equal(zetaTex([zetaTerm(c6.volume, -2)]), '\\frac{2\\sqrt{2}\\,\\zeta_{\\mathbb Q(\\sqrt{-2})}(2)}{\\pi^2}');
    // the fold: V₁ − V₂, signs carried by p
    const t1 = zetaTerm(c6.volume, -2), t2 = zetaTerm(c15.volume, -5);
    assert.match(zetaTex([t1, { ...t2, p: -t2.p }]), / - \\frac\{5\\sqrt\{5\}/);
    // ⟨−1,1,1,1⟩: covolume ζ_{ℚ(i)}(2)/2π² = G/12; PSL₂(ℤ[i]) = G/3
    const t = zetaTerm(0.30532186472 / 4, -1);
    assert.deepEqual(t, { p: 1, q: 2, r: 1, d: -1 });
    assert.equal(catalanTex(t), '\\tfrac{1}{12}\\,G');
    assert.equal(zetaTerm(Math.PI, -2), null);                       // not a rational multiple
});
