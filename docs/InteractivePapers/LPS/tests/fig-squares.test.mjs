// node tests/fig-squares.test.mjs — Figure S5: the hyperplane slices of S^{p,q} are Y^{p,q} and Y^{q,p}.
import { PAIRS, labData, sliceGraph, equalsY, pointOf, groupEdges, genTex, quatTexOf } from '../js/fig-squares.js';
import { buildY, qmul, qnorm } from '../js/lps.js';

let passes = 0, fails = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const t0 = Date.now();

const primes = [5, 13, 17, 29, 37];
for (const p of primes) for (const q of primes) {
  if (p >= q || p * q > 700) continue;
  const D = labData(p, q);
  const { cx, H, V } = D;
  ok(cx.squares.length === ((p + 1) * (q + 1)) / 4, `square count (${p},${q})`);
  ok(D.counts.euler === ((p - 1) * (q - 1)) / 4, `Euler characteristic (${p},${q})`);
  ok(D.counts.h === (p + 1) / 2 && D.counts.v === (q + 1) / 2, `loop counts (${p},${q})`);
  ok(H.bijective && V.bijective, `generators biject onto P^1 (${p},${q})`);
  ok(D.okH, `horizontal slices = Y^{${p},${q}}`);
  ok(D.okV, `vertical slices = Y^{${q},${p}}`);
  // every square is a relation αβ = ±β'α' among the generators
  for (const s of cx.squares) {
    const l = qmul(cx.A[s.bottom].q, cx.B[s.right].q), r = qmul(cx.B[s.left].q, cx.A[s.top].q);
    ok(l.every((x, k) => x === s.sign * r[k]), `square relation (${p},${q})`);
  }
  // the link of the vertex is K_{p+1,q+1}: each (α, β) pair is a corner exactly once
  const corners = new Map();
  for (const s of cx.squares) {
    const As = [s.bottom, s.top], Bs = [s.left, s.right];
    // corners: (bottom, left) at the start, (bottom⁻¹, right) after α, (top, left⁻¹) after β', (top⁻¹, right⁻¹) at the end
    for (const [a, b] of [[s.bottom, s.left], [cx.A[s.bottom].inv, s.right], [s.top, cx.B[s.left].inv], [cx.A[s.top].inv, cx.B[s.right].inv]]) {
      const k = a + ',' + b;
      corners.set(k, (corners.get(k) || 0) + 1);
    }
    void As; void Bs;
  }
  ok(corners.size === (p + 1) * (q + 1) && [...corners.values()].every((m) => m === 1), `link is K_{p+1,q+1} (${p},${q})`);
  // a deliberately wrong identification fails (the check has teeth)
  const bad = { ...H, edges: H.edges.map((e, i) => (i === 0 ? { ...e, b: (e.b + 1) % H.n } : e)) };
  ok(!equalsY(bad, buildY(p, q)), `perturbed slice graph is not Y (${p},${q})`);
  // grouping keeps every edge
  ok(groupEdges(H.edges).reduce((m, g) => m + g.m, 0) === H.edges.length, `grouping (${p},${q})`);
}

// points of P^1 from rank-one matrices: norm-ℓ quaternions only
for (const ell of [5, 13, 17]) {
  const D = labData(5 === ell ? 5 : 5, ell === 5 ? 13 : ell);
  const G = ell === 5 ? D.V : D.H;
  for (const g of G.gens) ok(qnorm(g.q) === ell && pointOf(g.q, ell) >= 0 && pointOf(g.q, ell) <= ell, `pointOf in range (ℓ=${ell})`);
}
ok(genTex(labData(5, 13).cx.A, 0, 'alpha').startsWith('\\alpha_{'), 'genTex');
ok(quatTexOf([1, 0, -2, 4]) === '1-2\\bj+4\\bk', 'quatTexOf');
ok(PAIRS.every(([p, q]) => labData(p, q).okH && labData(p, q).okV), 'every pair offered in the figure checks out');

console.log(`${passes} passed, ${fails} failed in ${Date.now() - t0} ms`);
if (fails) process.exit(1);
