// node tests/invariants.test.mjs
import { P } from '../js/poly.js';
import { projectDiagram, simplifyGauss, bestDiagram, normalize } from '../js/diagram.js';
import { diagramInvariants, geometricInvariants } from '../js/invariants.js';
import { rationalCurves, pretzelCurves, torusKnotCurves, braidClosureCurves, PRESETS } from '../js/builders.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };
const tex = p => P.tex(p);

const inv = (curves, dir = [0, 0, 1]) => diagramInvariants(projectDiagram(curves, dir).gauss);

function torusJones(p, q) { // positive T(p,q)
  // t^{(p−1)(q−1)/2}(1 − t^{p+1} − t^{q+1} + t^{p+q})/(1 − t²)
  const num = P.from([[0, 1], [p + 1, -1], [q + 1, -1], [p + q, 1]]);
  const quo = P.divExact(num, P.from([[0, 1], [2, -1]]));
  return P.shift(quo, (p - 1) * (q - 1) / 2);
}

console.log('torus knots via braid closures');
for (const [p, q] of [[2, 3], [2, 5], [3, 4], [2, 7], [3, 5]]) {
  const r = inv(torusKnotCurves(p, q));
  const want = r.writhe > 0 ? torusJones(p, q) : P.mirror(torusJones(p, q));
  ok(P.equal(r.jones, want), `T(${p},${q}) writhe ${r.writhe}: V = ${tex(r.jones)}`);
}
{
  const r = inv(torusKnotCurves(2, 3));
  ok(r.writhe === 3 ? P.equal(r.jones, P.from([[1, 1], [3, 1], [4, -1]])) : true, 'positive trefoil is t + t^3 − t^4');
  console.log('  alexander', tex(r.alexander), 'det', r.determinant, 'genus', r.genusLower, r.seifertGenus);
}

console.log('figure-eight, Hopf, Borromean, unknot');
{
  const r = inv(PRESETS.figureEight(), normalize([0.1, 0.2, 1]));
  ok(P.equal(r.jones, P.from([[2, 1], [1, -1], [0, 1], [-1, -1], [-2, 1]])), `4_1 V = ${tex(r.jones)} (c=${r.crossings})`);
  ok(P.equal(r.alexander, P.from([[1, -1], [0, 3], [-1, -1]])), `4_1 Δ = ${tex(r.alexander)}`);
  const h = inv(PRESETS.hopf(), normalize([0.3, 0.4, 1]));
  ok(Math.abs(h.linking[0][1]) === 1, `Hopf lk = ${h.linking[0][1]}, V = ${tex(h.jones)}, det ${h.determinant}`);
  const want = h.linking[0][1] > 0 ? P.from([[0.5, -1], [2.5, -1]]) : P.from([[-0.5, -1], [-2.5, -1]]);
  ok(P.equal(h.jones, want), 'Hopf Jones matches its linking sign');
  const b = inv(PRESETS.borromean(), normalize([0.31, 0.27, 1]));
  ok(P.equal(b.jones, P.from([[3, -1], [2, 3], [1, -2], [0, 4], [-1, -2], [-2, 3], [-3, -1]])), `Borromean V = ${tex(b.jones)}`);
  ok(b.linking.flat().every(x => x === 0), 'Borromean pairwise linking 0');
  const u = inv(PRESETS.unknot(), normalize([0.2, 0.1, 1]));
  ok(P.equal(u.jones, P.one()) && P.equal(u.alexander, P.one()), 'unknot V = Δ = 1');
  const tr = inv(PRESETS.trefoil(), normalize([0.05, 0.1, 1]));
  ok(Math.abs(tr.writhe) === 3, `parametric trefoil: c=${tr.crossings} w=${tr.writhe} V=${tex(tr.jones)}`);
}

console.log('random projections give the same Jones polynomial');
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [name, curves] of [['trefoil', PRESETS.trefoil()], ['4_1', PRESETS.figureEight()], ['T(3,4)', PRESETS.torus(3, 4)],
    ['6_2 plat', rationalCurves([3, 1, 2])], ['Borromean', PRESETS.borromean()]]) {
    const ref = inv(curves, normalize([0.11, 0.07, 1]));
    let same = true, cs = [];
    for (let k = 0; k < 25; k++) {
      const d = normalize([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
      const r = inv(curves, d);
      cs.push(r.crossings);
      if (!P.equal(r.jones, ref.jones)) { same = false; console.log('    differs at', d, tex(r.jones)); break; }
    }
    ok(same, `${name}: ${tex(ref.jones)}  (simplified crossings seen: ${Math.min(...cs)}–${Math.max(...cs)})`);
  }
}

console.log('rational knots: determinant and Alexander');
const RAT = [
  ['3_1', [3], 3, [1, -1, 1]], ['4_1', [2, 2], 5, [-1, 3, -1]], ['5_1', [5], 5, [1, -1, 1, -1, 1]], ['5_2', [3, 2], 7, [2, -3, 2]],
  ['6_1', [4, 2], 9, [-2, 5, -2]], ['6_2', [3, 1, 2], 11, [-1, 3, -3, 3, -1]], ['6_3', [2, 1, 1, 2], 13, [1, -3, 5, -3, 1]],
  ['7_1', [7], 7, [1, -1, 1, -1, 1, -1, 1]], ['7_2', [5, 2], 11, [3, -5, 3]], ['7_3', [4, 3], 13, [2, -3, 3, -3, 2]],
  ['7_4', [3, 1, 3], 15, [4, -7, 4]], ['7_5', [3, 2, 2], 17, [2, -4, 5, -4, 2]], ['7_6', [2, 2, 1, 2], 19, [1, -5, 7, -5, 1]],
  ['7_7', [2, 1, 1, 1, 2], 21, [1, -5, 9, -5, 1]],
];
const coeffs = p => P.toPairs(p).map(x => x[1]);
for (const [name, cw, det, alex] of RAT) {
  const r = inv(rationalCurves(cw));
  const a = coeffs(r.alexander);
  const alexOk = JSON.stringify(a) === JSON.stringify(alex) || JSON.stringify(a.map(x => -x)) === JSON.stringify(alex);
  ok(r.determinant === det && alexOk && P.span(r.jones) === r.crossings,
    `${name} [${cw}]: c=${r.crossings} det=${r.determinant} Δ=[${a}] span V=${P.span(r.jones)} g∈[${r.genusLower},${r.seifertGenus}]`);
}
console.log('pretzels');
for (const [name, ps, det] of [['8_5', [3, 3, 2], 21], ['8_19', [3, 3, -2], 3], ['8_20', [3, -3, 2], 9]]) {
  const r = inv(pretzelCurves(ps));
  ok(r.determinant === det, `${name} P(${ps}): c=${r.crossings} det=${r.determinant} Δ=${tex(r.alexander)} V=${tex(r.jones)}`);
}

console.log('bestDiagram + geometry');
{
  const t0 = performance.now();
  const b = bestDiagram(PRESETS.torus(3, 4));
  const r = diagramInvariants(b.simplified, { simplify: false });
  console.log(`  best T(3,4): ${b.n} crossings, ${(performance.now() - t0).toFixed(0)} ms, V=${tex(r.jones)}`);
  const g = geometricInvariants(PRESETS.trefoil());
  ok(g.curvature[0] > 4 * Math.PI, `trefoil total curvature ${(g.curvature[0] / (2 * Math.PI)).toFixed(3)}·2π > 4π`);
  const gh = geometricInvariants(PRESETS.hopf());
  ok(Math.abs(Math.abs(gh.linkingGauss[0].lk) - 1) < 1e-6, `Gauss linking integral of Hopf = ${gh.linkingGauss[0].lk.toFixed(6)}`);
  console.log('  trefoil Wr =', g.writheGauss[0].toFixed(4));
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
