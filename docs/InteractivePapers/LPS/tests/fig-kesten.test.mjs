// node tests/fig-kesten.test.mjs — Figure 4's histogram and moments on real spectra.
import * as L from '../js/lps.js';
import { eigenHistogram, moments, agrees, binCount } from '../js/fig-kesten.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };

for (const [p, q] of [[13, 5], [29, 5], [5, 13], [17, 13], [37, 13]]) {
  const X = L.buildX(p, q);
  const lam = L.spectrumX(X);
  const n = lam.length, k = p + 1;
  const h = eigenHistogram(lam, p, binCount(n));
  const total = h.counts.reduce((a, b) => a + b, 0);
  ok(total + h.trivial.length + h.outside.length === n, `every eigenvalue binned (${p},${q})`);
  ok(h.outside.length === 0, `no eigenvalue outside the window (${p},${q})`);
  ok(h.trivial.length === (L.isBipartite(X) ? 2 : 1), `trivial eigenvalues (${p},${q}): ${h.trivial.length}`);
  const mass = h.density.reduce((a, b) => a + b, 0) * h.w;
  ok(Math.abs(mass - (n - h.trivial.length) / n) < 1e-12, `density mass (${p},${q})`);
  const g = L.girth(X).girth;
  const m = moments(lam, 10), rho = L.treeClosedWalks(k, 10);
  for (let l = 0; l <= 10; l++) {
    if (l < g) ok(agrees(m[l], rho[l]), `m_${l} = ρ(${l}) below girth ${g} (${p},${q})`);
    if (l === g) ok(!agrees(m[l], rho[l]), `m_${g} ≠ ρ(${g}) at the girth (${p},${q})`);
    ok(Math.abs(m[l] - Math.round(m[l])) < 1e-6 * Math.max(1, Math.abs(m[l])), `m_${l} is an integer (${p},${q})`);
  }
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
