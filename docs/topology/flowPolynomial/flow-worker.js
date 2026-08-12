/* flow-worker.js — computes flow polynomials off the main thread so the
 * editor stays responsive while large graphs (dice rolls up to n = 40,
 * i.e. 60 edges) crunch for seconds or minutes. */
importScripts('flowpoly.js');

onmessage = (e) => {
  const { reqId, pairs, limit } = e.data;
  try {
    const poly = FlowPoly.flowPoly(pairs, { limit });
    postMessage({ reqId, ok: true, poly });
  } catch (err) {
    postMessage({ reqId, ok: false });
  }
};
