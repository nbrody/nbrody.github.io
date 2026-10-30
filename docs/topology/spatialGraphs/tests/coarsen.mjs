// exact build + guarded coarsening: fewer beads, clearance never below the guard bound, invariants unchanged
import { buildGraph, minClearance } from '../js/model.js';
import { graphInvariants } from '../js/invariants.js';
import { EXAMPLES } from '../js/examples.js';
const sig = inv => `${inv.cycles.map(c => c.det).join(',')}|${inv.links.map(l => `${l.i}-${l.j}:${Math.abs(l.lk)}`).join(',')}`;
let bad = 0;
for (const cat of EXAMPLES) for (const ex of cat.items) {
  const spec = { ...ex.spec() };
  // the reference: the dense curve itself, every point a bead
  const dense = buildGraph({ ...spec }, { exact: true, totalBeads: 1e9 });
  const thin = buildGraph({ ...spec }, { exact: true });
  const a = sig(graphInvariants(dense, 60)), b = sig(graphInvariants(thin, 60));
  const ok = a === b && minClearance(thin) > 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${ex.id.padEnd(15)} beads ${dense.N} → ${thin.N}  clearance ${minClearance(dense).toExponential(2)} → ${minClearance(thin).toExponential(2)}${a === b ? '' : '  invariants changed'}`);
}
process.exit(bad ? 1 : 0);
