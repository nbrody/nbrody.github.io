// every step must move each bead by less than half the clearance before it
import { buildGraph, minClearance } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { findExample } from '../js/examples.js';
const id = process.argv[2] || 'fig8';
const g = buildGraph(findExample(id).spec(), {});
const r = new Relaxer(g, {});
let worst = 0, bad = 0;
for (let i = 0; i < +(process.argv[3] || 3000); i++) {
  const x0 = g.x.slice(), N0 = g.N, S0 = g.S;
  const d0 = minClearance(g);
  const nodes0 = g.edges.map(e => e.nodes.slice());
  r.step();
  // a remesh renumbers beads: compare only steps that kept every edge's bead list
  if (g.N !== N0 || g.edges.some((e, k) => e.nodes.length !== nodes0[k].length || e.nodes.some((n, j) => n !== nodes0[k][j]))) continue;
  // compare positions modulo the similarity applied by normalize: undo it by fitting scale+translation
  let cx0=0,cy0=0,cz0=0,cx1=0,cy1=0,cz1=0; for (let k=0;k<g.N;k++){cx0+=x0[3*k];cy0+=x0[3*k+1];cz0+=x0[3*k+2];cx1+=g.x[3*k];cy1+=g.x[3*k+1];cz1+=g.x[3*k+2];}
  let mx = 0;
  // the step before normalize: y = x0 + D; after normalize x1 = (y - c_y)*s. We only bound the raw displacement approximately:
  const s = r.L0 / r.L0; // scale is ~1 per step
  for (let k = 0; k < g.N; k++) { const d = Math.hypot(g.x[3*k]-x0[3*k]-(cx1-cx0)/g.N, g.x[3*k+1]-x0[3*k+1]-(cy1-cy0)/g.N, g.x[3*k+2]-x0[3*k+2]-(cz1-cz0)/g.N); mx = Math.max(mx, d); }
  const ratio = mx / d0;
  worst = Math.max(worst, ratio);
  if (ratio > 0.5) { bad++; if (bad < 5) console.log('step', r.it, 'move/clearance', ratio.toFixed(3), 'clear', d0.toExponential(2)); }
}
console.log(id, 'worst move/clearance', worst.toFixed(3), 'violations', bad, 'final clearance', minClearance(g).toExponential(2));
