// node tests/action.test.mjs — checks the exact tree action against its defining properties.
import { Q } from '../js/rational.js';
import { fromPoly, mmul, adj, det, polyTex } from '../js/laurent.js';
import { parsePoly } from '../js/polyParse.js';
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
for (const bad of ['', 'x+1', 't^', '\\frac{1}{t}', '(t+1']) {
    let threw = false;
    try { parsePoly(bad); } catch { threw = true; }
    ok(threw, `rejects "${bad}"`);
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
const sameProj = (A, B) => {                   // A = ±B
    const s = A.every((x, i) => x.eq(B[i])), n = A.every((x, i) => x.eq(B[i].neg()));
    return s || n;
};
const hmul = (A, B) => [A[0].mul(B[0]).add(A[1].mul(B[2])), A[0].mul(B[1]).add(A[1].mul(B[3])), A[2].mul(B[0]).add(A[3].mul(B[2])), A[2].mul(B[1]).add(A[3].mul(B[3]))];
for (let t = 0; t < 200; t++) {
    const g = gens[rnd(gens.length)], g2 = gens[rnd(gens.length)];
    const v = randLabels(rnd(5));
    const { labels: u, h } = localMap(g, v);
    ok(h[0].mul(h[3]).sub(h[1].mul(h[2])).isOne(), `det h = 1 at ${keyOf(v)}`);
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
