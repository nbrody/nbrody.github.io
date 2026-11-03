// Module worker: builds X^{p,q} and returns its full spectrum.
import { buildX, spectrumX } from './lps.js';

self.onmessage = (e) => {
  const { id, p, q } = e.data;
  try {
    const t0 = performance.now();
    const X = buildX(p, q);
    const lam = spectrumX(X);
    self.postMessage({ id, p, q, n: X.n, lam, ms: performance.now() - t0, bipartite: !X.psl }, [lam.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
