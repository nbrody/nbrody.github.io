// which symmetry does each example settle into?
import { buildGraph } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { detectSymmetry } from '../js/symmetry.js';
import { findExample, EXAMPLES } from '../js/examples.js';
const ids = process.argv[2] ? process.argv[2].split(',') : EXAMPLES.flatMap(c => c.items.map(i => i.id));
const params = JSON.parse(process.argv[3] || '{}');
const its = +(process.argv[4] || 4000);
for (const id of ids) {
  const ex = findExample(id);
  const spec = ex.spec(); const m = (spec.edges?.length||0) + (spec.circles?.length||0);
  const g = buildGraph(spec, {});
  const r = new Relaxer(g, params);
  const t0 = performance.now(); let settledAt = null;
  for (let i = 1; i <= its; i++) { r.step(); if (r.settled && settledAt === null) settledAt = i; }
  const t = performance.now() - t0;
  const s = detectSymmetry(g);
  console.log(`${id.padEnd(15)} ${s.group.name.padEnd(4)} ord ${String(s.group.order).padEnd(3)} aut ${s.autCount ?? '-'} real ${s.realized ?? '-'}  settled@${settledAt}  ${(t/its).toFixed(2)}ms/it  E=${r.cache?.E?.toFixed(2)}`);
}
