/* Off-thread work for the Riemann viewer, in double precision:
   zeros on the critical line (with their indices), the n-th zero, and the inset curves. */
import * as Z from './zeta.js';

function inset({ mode, sigma, t, w, n }) {
  const ts = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const u = t - w + (2 * w * i) / (n - 1);
    ts[i] = u;
    if (mode === 'Z') re[i] = Z.hardyZ(u);
    else { const v = Z.zeta(sigma, u); re[i] = v[0]; im[i] = v[1]; }
  }
  const out = { ts, re, im };
  if (mode === 'Z') {
    // Gram points g_k in the window, with whether Gram's law (−1)^k Z(g_k) > 0 holds
    // Z is even, so the window's Gram points are ±g_k for g_k in [a, b]
    const lo = Math.abs(t - w), hi = Math.abs(t + w);
    const a = (t - w) * (t + w) < 0 ? 0 : Math.min(lo, hi), b = Math.max(lo, hi);
    const grams = [];
    if (b > 18 && (b - a) / Z.meanGap(b) < 120) {
      const k0 = Math.max(0, Math.ceil(Z.theta(Math.max(a, 17.8)) / Math.PI));
      for (let k = k0; ; k++) {
        const g = Z.gramPoint(k);
        if (g > b) break;
        if (g < a) continue;
        const z = Z.hardyZ(g);
        grams.push([k, g, (k % 2 ? -1 : 1) * z > 0 ? 1 : 0]);
        if (grams.length > 200) break;
      }
    }
    out.grams = grams;
  }
  return out;
}

onmessage = (e) => {
  const m = e.data;
  let out;
  try {
    if (m.type === 'zeros') out = { zeros: Z.indexedZeros(m.t0, m.t1, { maxSamples: m.maxSamples || 8000 }) };
    else if (m.type === 'nth') out = { gamma: Z.nthZero(m.n) };
    else if (m.type === 'inset') out = inset(m);
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  postMessage({ ...m, ...out });
};
