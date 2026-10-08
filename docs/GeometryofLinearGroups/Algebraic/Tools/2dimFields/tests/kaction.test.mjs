// node tests/kaction.test.mjs — the tree of K((1/t)) for K = ℚ(i), ℚ(ω), and PGL₂(K(t)) acting on it.
import { Q } from '../js/rational.js';
import { mmul, det } from '../js/laurent.js';
import { makeKEngine } from '../js/kengine.js';
import { cusps } from '../js/fieldK.js';
import { cpath, cnorm, capply, sphereOf, cmul, CID } from '../js/cmobius.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; if (fails < 20) console.log('FAIL', msg); } };
const rnd = (n) => Math.floor(Math.random() * n);

for (const id of ['i', 'omega']) {
    const E = makeKEngine(id), { KE, tree, INF } = E, sym = id === 'i' ? 'i' : '\\omega';
    const q = (n, d = 1) => Q.of(n, d);
    const rk = () => new KE(q(rnd(9) - 4, 1 + rnd(3)), q(rnd(7) - 3, 1 + rnd(2)));
    // arithmetic
    const th = KE.THETA, t2 = th.mul(th);
    ok(id === 'i' ? t2.eq(KE.ONE.neg()) : t2.eq(KE.ONE.neg().sub(th)), `${id}: θ²`);
    for (let k = 0; k < 100; k++) {
        const x = rk(), y = rk();
        if (!x.isZero()) ok(x.mul(x.inv()).isOne(), `${id}: x·x⁻¹ = 1`);
        ok(x.mul(y).norm().eq(x.norm().mul(y.norm())), `${id}: norm multiplicative`);
        const [a, b] = x.mul(y).toC(), [c, d] = x.toC(), [e, f] = y.toC();
        ok(Math.abs(a - (c * e - d * f)) < 1e-9 && Math.abs(b - (c * f + d * e)) < 1e-9, `${id}: the embedding in ℂ`);
    }
    // labels round-trip through frames
    const randLabels = (n) => Array.from({ length: n }, (_, i) => (i === 0 && Math.random() < 0.25 ? INF : rk()));
    for (let k = 0; k < 150; k++) {
        const lab = randLabels(rnd(5));
        ok(tree.keyOf(tree.vertexOf(tree.frameOf(lab))) === tree.keyOf(lab), `${id}: round trip ${tree.keyOf(lab)}`);
    }
    // generators with entries in K(t)
    const mat = (...e) => E.matrixOf(e.map(E.parse));
    const gens = [
        mat('0', '-1', '1', '0'), mat('1', '1', '0', '1'), mat('1', sym, '0', '1'), mat('1', 't', '0', '1'),
        mat('1', `${sym}t`, '0', '1'), mat('t', '1', '-1', '0'), mat(sym, '0', '0', '1'), mat('1', '0', `\\frac{${sym}}{t}`, '1'),
        mat(`1+${sym}t`, '2', '-t', `${sym}`),
    ];
    for (const g of gens) ok(!det(g).isZero(), `${id}: invertible`);
    const hApply = (h, w) => {
        const [a, b, c, d] = h;
        if (w.inf) return c.isZero() ? INF : a.div(c);
        const den = c.mul(w).add(d);
        return den.isZero() ? INF : a.mul(w).add(b).div(den);
    };
    const sameProj = (A, B) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (!A[i].mul(B[j]).eq(A[j].mul(B[i]))) return false; return true; };
    const hmul = (A, B) => [A[0].mul(B[0]).add(A[1].mul(B[2])), A[0].mul(B[1]).add(A[1].mul(B[3])), A[2].mul(B[0]).add(A[3].mul(B[2])), A[2].mul(B[1]).add(A[3].mul(B[3]))];
    for (let k = 0; k < 150; k++) {
        const g = gens[rnd(gens.length)], g2 = gens[rnd(gens.length)], v = randLabels(rnd(4)), w = rk();
        const { labels: u, h } = tree.localMap(g, v), hw = hApply(h, w);
        const img = tree.vertexOf(mmul(g, tree.frameOf([...v, w])));
        const expect = hw.inf && u.length ? u.slice(0, -1) : [...u, hw];
        ok(tree.keyOf(img) === tree.keyOf(expect), `${id}: link at ${tree.keyOf(v)}`);
        const { h: h2 } = tree.localMap(g2, u), { h: h12 } = tree.localMap(mmul(g2, g), v);
        ok(sameProj(h12, hmul(h2, h)), `${id}: cocycle`);
        // the float Möbius map of h moves the sphere point of w to that of h(w)
        const C = cnorm(E.toComplex(h)), cw = E.cuspOfLabel(w), chw = E.cuspOfLabel(hw);
        const vec = (c) => [[...c.p.length ? (() => { const x = E.KE.of(c.p).toC(); return x; })() : [0, 0]], E.KE.of(c.q).toC()];
        const p1 = sphereOf(capply(C, vec(cw))), p2 = chw.dir;
        ok(Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]) < 1e-8, `${id}: h on the sphere`);
    }
    // cusps ↔ labels
    for (const c of cusps(E.K, 5, true).slice(0, 200)) ok(E.cuspOfLabel(E.labelOfCusp(c)).key === c.key, `${id}: cusp round trip ${c.key}`);
    // the Picard (or Eisenstein) group fixes v₀; (1 θt; 0 1) fixes the plane at ∞
    ok(!tree.vertexOf(gens[2]).length, `${id}: (1 θ; 0 1) fixes v₀`);
    ok(tree.keyOf(tree.classify(gens[4]).fixed) === '∞', `${id}: (1 θt; 0 1) turns about the ball at ∞`);
    // complex paths
    for (let k = 0; k < 40; k++) {
        const h = cnorm(E.toComplex(tree.localMap(gens[rnd(gens.length)], randLabels(rnd(3))).h));
        const P = cpath(h), e = P(1), m = cmul(P(0.4), P(0.6));
        const close = (A, B) => { const d1 = Math.max(...A.map((x, i) => Math.hypot(x[0] - B[i][0], x[1] - B[i][1]))), d2 = Math.max(...A.map((x, i) => Math.hypot(x[0] + B[i][0], x[1] + B[i][1]))); return Math.min(d1, d2) < 1e-7; };
        ok(close(P(0), CID) && close(e, h) && close(m, e), `${id}: hˢ⁺ᵗ = hˢhᵗ, h¹ = h`);
    }
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
