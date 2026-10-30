// basin hopping as in main.js: kick with guarded swirls, settle, keep the lowest
import { buildGraph, mulberry32 } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { detectSymmetry } from '../js/symmetry.js';
import { findExample } from '../js/examples.js';
const id = process.argv[2] || 'octahedron', trials = +(process.argv[3] || 8);
const g = buildGraph(findExample(id).spec(), {});
const r = new Relaxer(g, {});
const settle = () => { r.history = []; r.settled = false; r.tau = 0; for (let i = 0; i < 3000; i++) { r.step(); if (r.settled && i > 300) break; } return r.cache?.E ?? r.energy(g.x, new Float64Array(3 * g.N)).E; };
const restore = c => { g.N = c.N; g.x = c.x.slice(); g.kind = c.kind.slice(); g.edges = c.edges.map(e => ({ ...e, nodes: e.nodes.slice() })); g.vertexNodes = c.vertexNodes.slice(); g.rebuild(); r.invalidate(); };
let E = settle(); let best = g.clone(), bestE = E;
console.log(id, 'start', E.toFixed(2), detectSymmetry(g).group.name);
const rng = mulberry32(3);
const t0 = performance.now();
for (let t = 0; t < trials; t++) {
  let field = r.makeSwirls(rng, 4);
  for (let k = 0; k < 80; k++) { if (k % 40 === 0) field = r.makeSwirls(rng, 4); r.pushStep(field); }
  const Et = settle();
  const sym = detectSymmetry(g).group.name;
  if (Et < bestE * (1 - 2e-3)) { best = g.clone(); bestE = Et; }
  console.log(`  trial ${t}: E ${Et.toFixed(2)} ${sym}${Et === bestE ? '  ← best' : ''}`);
}
restore(best);
const s = detectSymmetry(g);
console.log('best', bestE.toFixed(2), s.group.name, `real ${s.realized}/${s.autCount}`, ((performance.now() - t0) / 1000).toFixed(1) + 's');
