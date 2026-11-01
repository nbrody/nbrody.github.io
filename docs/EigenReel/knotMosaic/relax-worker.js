// Relaxes mosaics off the main thread: { id, grid, h, tubeR } → every frame of the flow in one buffer.
import { curves } from './mosaic.js';
import { buildLink, record } from './relax.js';

self.onmessage = e => {
  const { id, grid, h, tubeR } = e.data;
  try {
    self.postMessage(relaxGrid(id, grid, h, tubeR), undefined);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};

function relaxGrid(id, grid, h, tubeR) {
  const { comps, error } = curves(grid);
  if (error) return { id, error };
  const link = buildLink(comps, { h, tubeR });
  const frames = record(link);
  const n = link.n, K = frames.length, buf = new Float32Array(K * 3 * n);
  frames.forEach((f, k) => buf.set(f, k * 3 * n));
  return { id, K, n, offsets: link.offsets, sizes: link.chains.map(c => c.N), tags: link.tags, buf, steps: link.steps };
}
