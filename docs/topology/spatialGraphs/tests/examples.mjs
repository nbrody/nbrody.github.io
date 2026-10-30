// every example builds to an embedding (clearance well above zero)
import { buildGraph } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { EXAMPLES } from '../js/examples.js';
let bad = 0;
for (const cat of EXAMPLES) for (const ex of cat.items) {
  try {
    const g = buildGraph(ex.spec());
    const r = new Relaxer(g);
    const c = r.clearance(g.x);
    const ok = c > 0.02 * r.meanSeg;
    if (!ok) bad++;
    const k = g.counts();
    console.log(`${ok ? 'ok ' : 'BAD'} ${ex.id.padEnd(16)} V=${k.V} arcs=${k.arcs} circles=${k.circles} N=${g.N} clearance/h=${(c / r.meanSeg).toFixed(3)}`);
  } catch (e) { bad++; console.log('ERR', ex.id, e.message); }
}
process.exit(bad ? 1 : 0);
