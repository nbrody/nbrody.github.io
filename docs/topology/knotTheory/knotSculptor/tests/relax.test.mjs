// node tests/relax.test.mjs
import { P } from '../js/poly.js';
import { bestDiagram } from '../js/diagram.js';
import { diagramInvariants } from '../js/invariants.js';
import { rationalCurves, braidClosureCurves, PRESETS } from '../js/builders.js';
import { Relaxer } from '../js/relax.js';
import { resampleBySpacing, normalizeSize, liftPlanarCurve, resampleClosed, minSegmentGap, closedLength } from '../js/knot.js';

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? '  ok  ' : '  FAIL', m); };
const jones = comps => { const b = bestDiagram(comps); return { V: diagramInvariants(b.simplified, { simplify: false }).jones, n: b.n }; };
const prep = comps => normalizeSize(comps, 0.15).map(p => resampleBySpacing(p, 0.006, 48, 400));

for (const [name, comps] of [
  ['5_2', rationalCurves([3, 2])], ['6_2', rationalCurves([3, 1, 2])], ['8_18', braidClosureCurves(3, [-2, 1, -2, 1, -2, 1, -2, 1])],
  ['Borromean', braidClosureCurves(3, [1, -2, 1, -2, 1, -2])], ['unknot', PRESETS.unknot()],
]) {
  const c0 = prep(comps);
  const before = jones(c0);
  const R = new Relaxer(c0);
  const t0 = performance.now();
  while (!R.converged && R.steps < 6000) R.step();
  const ms = performance.now() - t0;
  const after = jones(R.comps);
  const N = R.comps.reduce((s, p) => s + p.length / 3, 0);
  const gap = minSegmentGap(R.comps, 1);
  ok(P.equal(before.V, after.V), `${name}: N=${N}, ${R.steps} steps in ${ms.toFixed(0)} ms (${(ms / R.steps).toFixed(2)} ms/step), best-view crossings ${before.n} → ${after.n}, min gap ${(gap * 1000).toFixed(1)} mm`);
}

console.log('desktop lift of a planar trefoil shadow');
{
  const N = 300, pts2 = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) { const t = 2 * Math.PI * i / N; pts2[2 * i] = 0.03 * (Math.sin(t) + 2 * Math.sin(2 * t)); pts2[2 * i + 1] = 0.03 * (Math.cos(t) - 2 * Math.cos(2 * t)); }
  for (const mode of ['alternate', 'over', 'under']) {
    const { pts, crossings } = liftPlanarCurve(pts2, mode, 0.012);
    const r = jones([pts]);
    console.log(`  ${mode}: ${crossings} crossings → V = ${P.tex(r.V)}`);
    if (mode === 'alternate') ok(P.span(r.V) === 3, 'alternate lift of the 3-crossing shadow is a trefoil');
  }
}
console.log(fails ? `${fails} FAILED` : 'all passed');
