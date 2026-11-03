// node tests/fig-projective.test.mjs — Figure 7's helpers: edges of Y, spec Y ⊆ spec X, Theorem 4.4.
import * as L from '../js/lps.js';
import { yEdges, ySpectrum, contained, multiplicities, qChoices } from '../js/fig-projective.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };

ok(qChoices(5).every((q) => q !== 5 && q % 4 === 1 && L.isPrime(q)) && qChoices(5).includes(29) && qChoices(29).includes(5), 'q choices');

// degree check from the edge list: each vertex has degree p+1 (loops count twice)
for (const p of [5, 13, 17, 29]) for (const q of qChoices(p).filter((q) => q <= 101)) {
  const Y = L.buildY(p, q);
  const E = yEdges(Y);
  ok(E.length === Y.n * (p + 1) / 2, `edge count (${p},${q})`);
  const deg = new Array(Y.n).fill(0);
  for (const e of E) { deg[e.a]++; deg[e.b]++; }
  ok(deg.every((d) => d === p + 1), `degree p+1 (${p},${q})`);
  const lam = ySpectrum(Y);
  ok(Math.abs(lam[0] - (p + 1)) < 1e-7, `top eigenvalue (${p},${q})`);
  ok(L.lambdaX(lam, p + 1) <= 2 * Math.sqrt(p) + 1e-9, `Y Ramanujan (${p},${q})`);
  ok(lam[lam.length - 1] > -(p + 1) + 1e-6, `not bipartite (${p},${q})`);
  ok(multiplicities(lam).reduce((a, b) => a + b.m, 0) === Y.n, `multiplicities sum (${p},${q})`);
}

// spec Y ⊆ spec X on the affordable pairs, and a negative control
for (const [p, q] of [[13, 5], [29, 5], [5, 13], [17, 13]]) {
  const lamX = L.spectrumX(L.buildX(p, q));
  const lamY = ySpectrum(L.buildY(p, q));
  ok(contained(lamY, lamX), `spec Y ⊆ spec X (${p},${q})`);
  ok(!contained([0.123456], lamX) || lamX.some((x) => Math.abs(x - 0.123456) < 1e-6), `negative control (${p},${q})`);
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
