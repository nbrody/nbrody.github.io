// node tests/identify.test.mjs — every table entry with a recipe is recognized from its 3D curve and mirror
import { bestDiagram } from '../js/diagram.js';
import { diagramInvariants } from '../js/invariants.js';
import { identify, nameTex } from '../js/identify.js';
import { KNOT_TABLE } from '../js/knotTable.js';
import { rationalCurves, pretzelCurves, braidClosureCurves, torusKnotCurves, PRESETS } from '../js/builders.js';
let fails = 0;
const curvesOf = r => r.rational ? rationalCurves(r.rational) : r.pretzel ? pretzelCurves(r.pretzel)
  : r.braid ? braidClosureCurves(r.braid[0], r.braid[1]) : torusKnotCurves(...r.torus);
const mirror = cs => cs.map(p => { const q = Float64Array.from(p); for (let i = 2; i < q.length; i += 3) q[i] = -q[i]; return q; });
const name = cs => { const b = bestDiagram(cs); return identify(diagramInvariants(b.simplified, { simplify: false })); };
for (const e of KNOT_TABLE) {
  if (!e.recipe) continue;
  const c = curvesOf(e.recipe);
  const a = name(c), b = name(mirror(c));
  const good = a.tex === nameTex(e.name) && b.tex === nameTex(e.name);
  if (!good) fails++;
  console.log(good ? 'ok  ' : 'FAIL', e.name.padEnd(6), '|', a.nick, '|', a.detail, '|| mirror:', b.detail);
}
for (const [k, f] of Object.entries(PRESETS)) {
  const cs = k === 'torus' ? f(3, 4) : f();
  const r = name(cs);
  console.log('preset', k.padEnd(12), r.tex, r.nick, '|', r.detail);
}
console.log(fails ? `${fails} FAILED` : 'all identified');
