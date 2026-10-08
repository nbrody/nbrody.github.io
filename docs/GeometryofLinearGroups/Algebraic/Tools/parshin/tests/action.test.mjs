// node tests/action.test.mjs — checks the exact tree action against its defining properties.
import { Q } from '../js/rational.js';
import { fromPoly, mmul, adj, det, polyTex, normalizePGL } from '../js/laurent.js';
import { parsePoly, parseRat } from '../js/polyParse.js';
import { polyMatrix } from '../js/poly.js';
import { frameOf, vertexOf, localMap, classify, keyOf, INF } from '../js/treeAction.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const mat = (...entries) => entries.map((s) => fromPoly(parsePoly(s)));
const qn = (x) => x.toString();

// --- parser ---
const P = (s) => parsePoly(s).map(qn).join(',');
ok(P('1+2t') === '1,2', '1+2t');
ok(P('-t^{2}') === '0,0,-1', '-t^2');
ok(P('\\frac{1}{2}t') === '0,1/2', 'frac');
ok(P('\\left(t+1\\right)^2') === '1,2,1', '(t+1)^2');
ok(P('2\\cdot t-3') === '-3,2', '2·t−3');
ok(P('t(t-1)') === '0,-1,1', 't(t−1)');
ok(P('0.5t^3') === '0,0,0,1/2', 'decimal');
ok(polyTex(parsePoly('1-2t+t^2')) === 't^{2} - 2t + 1', 'polyTex');
const R = (s) => { const { num, den } = parseRat(s); return `${num.map(qn)}|${den.map(qn)}`; };
ok(R('\\frac{1}{t}') === '1|0,1', '1/t');
ok(R('t^{-2}') === '1|0,0,1', 't^{-2}');
ok(R('\\frac{t^2-1}{t+1}') === '-1,1|1', 'cancels a common factor');
ok(R('\\frac{t}{2t-2}') === '0,1/2|-1,1', 'monic denominator');
ok(R('(1+t)^{-1}+1') === '2,1|1,1', '(1+t)⁻¹ + 1');
const PM = (...e) => polyMatrix(e.map(parseRat)).map((p) => p.map(qn).join(',')).join(' ; ');
ok(PM('1', '\\frac{1}{t}', '0', '1') === '0,1 ; 1 ;  ; 0,1', `clears denominators: ${PM('1', '\\frac{1}{t}', '0', '1')}`);
ok(PM('2t', '4', '0', '-2t') === '0,1 ; 2 ;  ; 0,-1', `primitive: ${PM('2t', '4', '0', '-2t')}`);
for (const bad of ['', 'x+1', 't^', '\\frac{1}{0}', '(t+1', '\\frac{1}{t-t}']) {
    let threw = false;
    try { parsePoly(bad); } catch { threw = true; }
    ok(threw, `rejects "${bad}"`);
}

for (const bad of ['\\frac{1}{t}']) {
    let threw = false;
    try { parsePoly(bad); } catch { threw = true; }
    ok(threw, `parsePoly rejects "${bad}"`);
}

// --- labels round-trip through frames ---
const rnd = (n) => Math.floor(Math.random() * n);
const cusp = () => { const q = 1 + rnd(4), p = rnd(9) - 4; const g = (a, b) => (b ? g(b, a % b) : Math.abs(a)); const d = g(p, q) || 1; return [BigInt(p / d), BigInt(q / d)]; };
const randLabels = (n) => Array.from({ length: n }, (_, i) => (i === 0 && Math.random() < 0.25 ? INF : cusp()));
for (let t = 0; t < 300; t++) {
    const lab = randLabels(rnd(6));
    ok(keyOf(vertexOf(frameOf(lab))) === keyOf(lab), `round trip ${keyOf(lab)}`);
}

// --- local maps ---
const gens = [
    mat('0', '-1', '1', '0'), mat('1', '1', '0', '1'), mat('1', 't', '0', '1'), mat('1', '0', 't', '1'),
    mat('t', '1', '-1', '0'), mat('1+2t', '4', '-t^2', '1-2t'), mat('1', 't^2', '0', '1'),
];
for (const g of gens) ok(det(g).sub(fromPoly([Q.ONE])).isZero(), 'det 1');
const hApply = (h, [p, q]) => {               // h·(p, q) as a reduced cusp
    const P_ = h[0].mul(Q.of(p)).add(h[1].mul(Q.of(q))), Q_ = h[2].mul(Q.of(p)).add(h[3].mul(Q.of(q)));
    if (Q_.isZero()) return INF;
    const x = P_.div(Q_);
    return [x.n, x.d];
};
const sameProj = (A, B) => {                   // A = λB for some λ ∈ ℚ^×
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (!A[i].mul(B[j]).eq(A[j].mul(B[i]))) return false;
    return true;
};
const qdet = (h) => h[0].mul(h[3]).sub(h[1].mul(h[2]));
const hmul = (A, B) => [A[0].mul(B[0]).add(A[1].mul(B[2])), A[0].mul(B[1]).add(A[1].mul(B[3])), A[2].mul(B[0]).add(A[3].mul(B[2])), A[2].mul(B[1]).add(A[3].mul(B[3]))];
for (let t = 0; t < 200; t++) {
    const g = gens[rnd(gens.length)], g2 = gens[rnd(gens.length)];
    const v = randLabels(rnd(5));
    const { labels: u, h } = localMap(g, v);
    ok(qdet(h).isOne(), `det h = 1 at ${keyOf(v)}`);
    // the link: the neighbour of v in direction w goes to the neighbour of γv in direction h(w)
    const w = cusp();
    const hw = hApply(h, w);
    const img = vertexOf(mmul(g, frameOf([...v, w])));
    const expect = hw[1] === 0n && u.length ? u.slice(0, -1) : [...u, hw];
    ok(keyOf(img) === keyOf(expect), `link at ${keyOf(v)} → ${keyOf(u)}, w=${keyOf([w])}: got ${keyOf(img)} want ${keyOf(expect)}`);
    // composition: h_{g2 g, v} = h_{g2, gv} h_{g, v}
    const { h: h2 } = localMap(g2, u), { h: h12, labels: u2 } = localMap(mmul(g2, g), v);
    ok(sameProj(h12, hmul(h2, h)), `cocycle at ${keyOf(v)}`);
    ok(keyOf(u2) === keyOf(localMap(g2, u).labels), 'composition of vertices');
}

// --- PGL₂(ℚ(t)): any determinant, entries rational functions ---
const rentry = () => { const c = [rnd(5) - 2, rnd(5) - 2, rnd(3) - 1]; return `${c[0]}+${c[1]}t+${c[2]}t^2`.replace(/\+-/g, '-'); };
const pgl = (...e) => polyMatrix(e.map(parseRat)).map(fromPoly);
const pgens = [
    pgl('-1', '0', '0', '1'), pgl('0', '1', 't', '0'), pgl('t', '0', '0', '1'), pgl('1', '\\frac{1}{t}', '0', '1'),
    pgl('1', '\\frac{t}{t-1}', '0', '1'), pgl('1', '0', '\\frac{1}{1+t}', '1'),
];
for (let t = 0; t < 40; t++) {
    const M = pgl(rentry(), rentry(), rentry(), rentry());
    if (!det(M).isZero()) pgens.push(M);
}
for (let t = 0; t < 300; t++) {
    const g = pgens[rnd(pgens.length)], g2 = pgens[rnd(pgens.length)];
    const v = randLabels(rnd(5));
    const { labels: u, h } = localMap(g, v);
    ok(!qdet(h).isZero(), `h invertible at ${keyOf(v)}`);
    const w = cusp(), hw = hApply(h, w);
    const img = vertexOf(mmul(g, frameOf([...v, w])));
    const expect = hw[1] === 0n && u.length ? u.slice(0, -1) : [...u, hw];
    ok(keyOf(img) === keyOf(expect), `PGL link at ${keyOf(v)}: got ${keyOf(img)} want ${keyOf(expect)}`);
    const { h: h2 } = localMap(g2, u), { h: h12 } = localMap(mmul(g2, g), v);
    ok(sameProj(h12, hmul(h2, h)), `PGL cocycle at ${keyOf(v)}`);
    // scaling γ by a rational function changes nothing projectively, and keeps the sign of det h
    const c = fromPoly(parsePoly('2t^2-3'));
    const { labels: us, h: hs } = localMap(g.map((x) => x.mul(c)), v);
    ok(keyOf(us) === keyOf(u) && sameProj(hs, h) && qdet(hs).sign() === qdet(h).sign(), 'scaling invariance');
    ok(keyOf(normalizePGL(g).length ? localMap(normalizePGL(g), v).labels : []) === keyOf(u), 'normalizePGL is the same element');
}
const [Rf, Inv, Dt, Lt, Rt1, Rt2] = pgens;
ok(classify(Inv).kind === 'inversion' && keyOf(vertexOf(Inv)) === '0', `(0 1; t 0) inverts the edge v₀–0: ${classify(Inv).kind}`);
ok(qdet(localMap(Inv, []).h).sign() < 0, '(0 1; t 0) reflects the base plane');
ok(classify(Dt).kind === 'hyperbolic' && classify(Dt).ell === 1, 'diag(t, 1) translates by 1');
ok(qdet(localMap(Rf, [[3n, 1n], [1n, 2n]]).h).sign() < 0 && keyOf(localMap(Rf, [[3n, 1n], [1n, 2n]]).labels) === '-3 -1/2', 'diag(−1, 1) mirrors the plane at 3 → 1/2');
ok(sameProj(localMap(Lt, []).h, [Q.ONE, Q.ZERO, Q.ZERO, Q.ONE]) && sameProj(localMap(Lt, [[2n, 3n]]).h, [Q.ONE, Q.ONE, Q.ZERO, Q.ONE]), '(1 1/t; 0 1): trivial on X(v₀), z ↦ z+1 at its neighbours');
ok(sameProj(localMap(Rt1, []).h, [Q.ONE, Q.ONE, Q.ZERO, Q.ONE]), '(1 t/(t−1); 0 1) acts on X(v₀) as z ↦ z+1');
ok(sameProj(localMap(Rt2, []).h, [Q.ONE, Q.ZERO, Q.ZERO, Q.ONE]) && !vertexOf(Rt2).length, '(1 0; 1/(1+t) 1) fixes X(v₀) pointwise');

// --- known cases ---
const S = gens[0], U = gens[2];
ok(keyOf(vertexOf(U)) === '∞ -1', `U·v₀ = ${keyOf(vertexOf(U))}`);
ok(keyOf(classify(U).fixed) === '∞', 'U fixes the plane at ∞');
ok(keyOf(classify(gens[6]).fixed) === '∞ 0', `(1 t²; 0 1) fixes ${keyOf(classify(gens[6]).fixed)}`);
ok(classify(gens[4]).ell === 2, 'z ↦ t − 1/z translates by 2');
const { labels: s2, h: hs2 } = localMap(S, [[2n, 1n]]);
ok(keyOf(s2) === '-1/2', 'S sends the plane at 2 to the plane at −1/2');
ok(sameProj(hs2, [Q.of(1, 2), Q.ZERO, Q.ZERO, Q.of(2)]), `S at 2 acts as z ↦ z/4: ${hs2.map(qn)}`);

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
