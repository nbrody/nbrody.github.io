// Module worker: looks for Reidemeister moves in one projection, off the main thread.
// The add-a-loop and add-a-pair searches take 50–400 ms, which used to stall the page
// every time the view came to rest.
// in:  { id, components, dir, up, kind: 'reduce'|'r3'|'add1'|'add2', tube }
// out: { id, moves } (each move: { type, x, y, label?, components, steps }) or { id, error }
import { projectDiagram } from './diagram.js';
import { findReidemeisterMoves } from './reidemeister.js';
import { findR2Moves } from './reidemeister2.js';
import { findR3Moves } from './reidemeister3.js';
import { findR1AddMoves } from './reidemeisterAdd1.js';
import { findR2AddMoves } from './reidemeisterAdd2.js';

let latest = 0;

self.onmessage = ev => {
  const m = ev.data;
  latest = m.id;
  // let a burst of requests collapse to the newest one
  setTimeout(() => run(m), 0);
};

function run(m) {
  if (m.id !== latest) return;
  try {
    const D = projectDiagram(m.components, m.dir, m.up);
    let moves = [];
    if (m.kind === 'reduce') moves = [...findReidemeisterMoves(m.components, D), ...findR2Moves(m.components, D)];
    else if (m.kind === 'r3') moves = findR3Moves(m.components, D);
    else if (m.kind === 'add1') moves = findR1AddMoves(m.components, D, { tubeDiameter: m.tube });
    else if (m.kind === 'add2') moves = findR2AddMoves(m.components, D, { clearance: m.tube });
    // keep only what the page needs (some finders attach diagram objects with Maps)
    moves = moves.map(({ type, x, y, label, sign, components, steps }) => ({
      type, x, y, label, sign, components,
      steps: steps.map(s => ({ from: s.from, to: s.to })),
    }));
    self.postMessage({ id: m.id, moves });
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err && err.stack || err) });
  }
}
