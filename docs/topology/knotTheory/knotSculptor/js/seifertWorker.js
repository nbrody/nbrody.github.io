// Knot Sculptor: module worker for solid-angle Seifert surfaces and the
// crossing-number globe.  new Worker(new URL('./seifertWorker.js', import.meta.url), { type: 'module' })
//
// In  { type: 'surface', id, components, level = 2pi, res = 48 }
// Out { type: 'surface', id, level, h, positions, normals, indices, ms }   (h = grid cell size, m)
//
// In  { type: 'sweep', id, components, frames = 32, res = 48 }
// Out { type: 'sweepFrame', id, k, frames, level, h, positions, normals, indices } for
//       k = 0..frames-1 with level = 4pi (k + 1/2) / frames, then { type: 'sweepDone', id }.
//     Frames are produced one per macrotask, so later messages are handled in
//     between; a sweep stops early (without sweepDone) when a newer sweep
//     arrives, or any message with a different id (the knot changed).
//
// In  { type: 'globe', id, components, count = 1500 }
// Out { type: 'globe', id, dirs, counts, best, min, max, ms }
//
// On failure: { type: 'error', id, message }.
//
// `id` is the knot version: the solid-angle grid is cached and reused while
// (id, res) is unchanged, so `components` may be omitted on a repeat request.
// All typed-array buffers in replies are transferred.

import { solidAngleGrid, marchLevel, crossingGlobe } from './seifert.js';

const TWO_PI = 2 * Math.PI;
const FOUR_PI = 4 * Math.PI;

let cache = null; // { id, res, grid }
let latestId;     // id of the most recent message
let sweepToken = 0;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function gridFor(id, components, res) {
  if (cache && cache.id === id && cache.res === res) return cache.grid;
  if (!components) throw new Error(`no components sent and no cached grid for id ${id} at res ${res}`);
  const grid = solidAngleGrid(components, { res });
  cache = { id, res, grid };
  return grid;
}

function postMesh(base, mesh) {
  self.postMessage(
    { ...base, positions: mesh.positions, normals: mesh.normals, indices: mesh.indices },
    [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer],
  );
}

function postError(id, err) {
  self.postMessage({ type: 'error', id, message: (err && err.message) || String(err) });
}

function runSweep(msg, token) {
  const { id } = msg;
  const frames = Math.max(1, msg.frames | 0 || 32);
  const res = msg.res || 48;
  let grid;
  try { grid = gridFor(id, msg.components, res); }
  catch (err) { postError(id, err); return; }
  let k = 0;
  const step = () => {
    if (token !== sweepToken || latestId !== id) return; // superseded
    try {
      const level = (FOUR_PI * (k + 0.5)) / frames;
      const mesh = marchLevel(grid, null, level);
      postMesh({ type: 'sweepFrame', id, k, frames, level, h: grid.h }, mesh);
    } catch (err) { postError(id, err); return; }
    k++;
    if (k < frames) setTimeout(step, 0);
    else self.postMessage({ type: 'sweepDone', id });
  };
  step();
}

self.onmessage = (e) => {
  const msg = e.data || {};
  const { type, id } = msg;
  latestId = id;
  try {
    if (type === 'surface') {
      const t0 = now();
      const res = msg.res || 48;
      const level = msg.level == null ? TWO_PI : msg.level;
      const grid = gridFor(id, msg.components, res);
      const mesh = marchLevel(grid, null, level);
      postMesh({ type: 'surface', id, level, h: grid.h, ms: now() - t0 }, mesh);
    } else if (type === 'sweep') {
      runSweep(msg, ++sweepToken);
    } else if (type === 'globe') {
      const t0 = now();
      const r = crossingGlobe(msg.components, { count: msg.count || 1500 });
      self.postMessage(
        { type: 'globe', id, dirs: r.dirs, counts: r.counts, best: r.best, min: r.min, max: r.max, ms: now() - t0 },
        [r.dirs.buffer, r.counts.buffer],
      );
    } else {
      throw new Error(`unknown message type ${type}`);
    }
  } catch (err) {
    postError(id, err);
  }
};
