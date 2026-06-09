// Web Worker (ES module): runs the beam search off the main thread.
import { runSearch } from "./beam.js";

self.onmessage = (e) => {
  const d = e.data;
  try {
    const a = d.a.map((s) => BigInt(s));
    const b = d.b.map((s) => BigInt(s));
    const res = runSearch({
      a, b, p: d.p, q: d.q,
      precision: d.precision,
      nodeBudget: d.nodeBudget,
      confirmNodes: d.confirmNodes,
      reportEvery: d.reportEvery ?? 3000,
      onProgress: (ev) => self.postMessage({ type: "progress", ev }),
    });
    self.postMessage({ type: "done", res });
  } catch (err) {
    self.postMessage({ type: "error", error: String(err && err.message || err) });
  }
};
