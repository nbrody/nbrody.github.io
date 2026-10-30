// invariants of every example before and after relaxing must agree
import { buildGraph } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { graphInvariants } from '../js/invariants.js';
import { EXAMPLES } from '../js/examples.js';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const its = +(process.argv[3] || 1500);
const sig = inv => `dets[${inv.cycles.map(c => c.det).join(',')}] lk[${inv.links.map(l => `${l.i}-${l.j}:${Math.abs(l.lk)}`).join(',')}]`;
let bad = 0;
for (const cat of EXAMPLES) for (const ex of cat.items) {
  if (only && !only.includes(ex.id)) continue;
  const g = buildGraph(ex.spec());
  const before = graphInvariants(g, 120);
  const r = new Relaxer(g, {});
  const t0 = performance.now();
  for (let i = 0; i < its; i++) r.step();
  const after = graphInvariants(g, 120);
  const ok = sig(before) === sig(after);
  if (!ok) bad++;
  const short = s => s.length > 110 ? s.slice(0, 110) + '…' : s;
  console.log(`${ok ? 'ok ' : 'BAD'} ${ex.id.padEnd(15)} cycles ${before.cycles.length}${before.capped ? '+' : ''} pairs ${before.pairs} ${short(sig(after))}${ok ? '' : '  before ' + short(sig(before))}  ${((performance.now()-t0)/its).toFixed(2)}ms/it`);
}
process.exit(bad ? 1 : 0);
