import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'scene3d.js'), 'utf8');
const sandbox = {
  console,
  document: { hidden: false, addEventListener() {}, getElementById() { return null; } },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
runInContext(src, createContext(sandbox));
const { layerAppendStart } = sandbox.Scene3D;

test('layer append never starts before the sliding window', () => {
  assert.equal(layerAppendStart(5, 2300), 2300);
  assert.equal(layerAppendStart(500, 320), 500);
  assert.equal(layerAppendStart(0, 0), 0);
});

test('scene3d append loops use the window clamp', () => {
  assert.match(src, /for \(let i = layerAppendStart\(builtRingEnd, builtStart\); i < iters - 1; i\+\+\)/);
  assert.match(src, /for \(let i = layerAppendStart\(builtEdgeEnd, builtStart\); i < iters; i\+\+\)/);
});

// Mirrors rebuildScene's cursor updates, including a history that grows while
// the 3D view is inactive (no rebuild until the user comes back).
function rebuild(state, iters, maxLayers, { palette = 'midnight', revision = 0 } = {}) {
  const windowStart = Math.max(0, iters - maxLayers);
  const fullRebuild =
    state.builtEdgeEnd === 0 ||
    palette !== state.palette ||
    revision !== state.revision ||
    iters < state.builtEdgeEnd ||
    windowStart < state.builtStart;

  if (fullRebuild) {
    state.rings = [];
    state.edges = [];
    state.builtStart = windowStart;
    state.builtRingEnd = windowStart;
    state.builtEdgeEnd = windowStart;
  }
  while (state.builtStart < windowStart) {
    if (state.rings.length > 0) state.rings.shift();
    if (state.edges.length > 0) state.edges.shift();
    state.builtStart++;
  }
  for (let i = layerAppendStart(state.builtRingEnd, state.builtStart); i < iters - 1; i++) {
    state.rings.push(i);
  }
  state.builtRingEnd = Math.max(state.builtRingEnd, iters - 1);
  for (let i = layerAppendStart(state.builtEdgeEnd, state.builtStart); i < iters; i++) {
    state.edges.push(i);
  }
  state.builtEdgeEnd = iters;
  state.palette = palette;
  state.revision = revision;

  const expEdges = Math.max(0, iters - windowStart);
  const expRings = Math.max(0, iters - 1 - windowStart);
  assert.deepEqual(state.edges, Array.from({ length: expEdges }, (_, k) => windowStart + k));
  assert.deepEqual(state.rings, Array.from({ length: expRings }, (_, k) => windowStart + k));
}

test('returning to 3D after a long 2D run keeps only the capped window', () => {
  const state = {
    rings: [], edges: [],
    builtStart: 0, builtRingEnd: 0, builtEdgeEnd: 0,
    palette: 'midnight', revision: 0,
  };
  rebuild(state, 6, 200);
  // 2D playback grows the history with no 3D rebuild, then the user switches back.
  rebuild(state, 2500, 200);
  assert.equal(state.edges.length, 200);
  assert.equal(state.rings.length, 199);
  assert.equal(state.edges[0], 2300);
  assert.equal(state.rings[0], 2300);
});

test('incremental playback and step-back stay inside the window', () => {
  const state = {
    rings: [], edges: [],
    builtStart: 0, builtRingEnd: 0, builtEdgeEnd: 0,
    palette: 'midnight', revision: 0,
  };
  for (let n = 1; n <= 500; n++) rebuild(state, n, 200);
  rebuild(state, 520, 200);
  rebuild(state, 80, 200);
  for (let n = 80; n <= 160; n += 20) rebuild(state, n, 10);
  rebuild(state, 40, 10, { revision: 1 });
  rebuild(state, 41, 10, { palette: 'ember', revision: 1 });
});
