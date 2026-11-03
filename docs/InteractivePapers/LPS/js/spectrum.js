// Spectra of X^{p,q}, computed once per (p, q) in a module worker and shared by every figure.
import { buildX, spectrumX } from './lps.js';

const cache = new Map();
let worker = null, nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./spectrum-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data);
    };
    worker.onerror = () => { worker = false; for (const [, job] of pending) job.fallback(); pending.clear(); };
  } catch (err) {
    worker = false;
  }
  return worker;
}

function computeHere(p, q) {
  const t0 = performance.now();
  const X = buildX(p, q);
  const lam = spectrumX(X);
  return { p, q, n: X.n, lam, ms: performance.now() - t0, bipartite: !X.psl };
}

/** Promise of { p, q, n, lam (Float64Array, descending), ms, bipartite }. */
export function getSpectrum(p, q) {
  const key = p + ',' + q;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve, reject) => {
      const w = getWorker();
      const fallback = () => { try { resolve(computeHere(p, q)); } catch (e) { reject(e); } };
      if (!w) { setTimeout(fallback, 0); return; }
      const id = nextId++;
      pending.set(id, { resolve, reject, fallback });
      w.postMessage({ id, p, q });
    }));
  }
  return cache.get(key);
}

/** The spectrum if it is already known, else null (no work started). */
export function peekSpectrum(p, q) {
  return cache.get(p + ',' + q) || null;
}

/** Pairs whose spectrum is quick to compute in a browser (dense size ≤ ~1100). */
export const SPECTRUM_PAIRS = [
  [13, 5], [17, 5], [29, 5], [37, 5], [41, 5],
  [5, 13], [17, 13], [29, 13], [37, 13], [41, 13],
];
