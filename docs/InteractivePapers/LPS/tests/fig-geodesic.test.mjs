// node tests/fig-geodesic.test.mjs — Figure 7's geodesics are arcs orthogonal to the unit circle through both points.
import { geodesicArc, edgeGroups, yEdges } from '../js/fig-projective.js';
import { buildY } from '../js/lps.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
for (let i = 0; i < 2000; i++) {
  const a1 = Math.random() * 2 * Math.PI, a2 = Math.random() * 2 * Math.PI;
  const G = geodesicArc(a1, a2);
  if (G.line) { ok(Math.abs(Math.abs(Math.cos((a2 - a1) / 2))) < 1e-3, 'diameter only for antipodal points'); continue; }
  const c2 = G.cx * G.cx + G.cy * G.cy;
  ok(Math.abs(c2 - (1 + G.rho * G.rho)) < 1e-9 * (1 + c2), 'orthogonal to the boundary');
  for (const a of [a1, a2]) ok(Math.abs(Math.hypot(Math.cos(a) - G.cx, Math.sin(a) - G.cy) - G.rho) < 1e-8 * (1 + G.rho), 'passes through both points');
}
ok(geodesicArc(0, Math.PI).line, 'antipodal → diameter');
// grouping keeps every edge: multiplicities add up to the edge count, for several Y
for (const [p, q] of [[5, 13], [5, 29], [13, 5], [29, 37]]) {
  const E = yEdges(buildY(p, q));
  ok(edgeGroups(E).reduce((s, g) => s + g.m, 0) === E.length, `groups cover all edges (${p},${q})`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
