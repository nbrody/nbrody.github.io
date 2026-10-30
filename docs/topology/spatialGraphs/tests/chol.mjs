// the skyline factorization solves the same system as CG
import { buildGraph } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
import { findExample } from '../js/examples.js';
for (const id of ['theta-tangled', 'cube', 'k7', 'borromean', 'handcuff']) {
  const g = buildGraph(findExample(id).spec(), {});
  const r = new Relaxer(g, {});
  r.masses(g.x);
  const F = Float64Array.from({ length: 3 * g.N }, (_, i) => Math.sin(1.7 * i) + 0.3 * Math.cos(0.37 * i));
  const c = r.params.sobolev * r.meanSeg, c2 = 0.7;
  const v1 = new Float64Array(F.length), v2 = new Float64Array(F.length), Av = new Float64Array(F.length);
  r.c2 = c2;
  const t0 = performance.now(); r.solve(F, v1, c, c2); const t1 = performance.now();
  r.params.cgIters = 5000; r.solveCG(F, v2, c, c2);
  r.applyA(v1, Av, c, c2);
  let res = 0, nf = 0, diff = 0, nv = 0; for (let i = 0; i < F.length; i++) { res += (Av[i] - F[i]) ** 2; nf += F[i] ** 2; diff += (v1[i] - v2[i]) ** 2; nv += v2[i] ** 2; }
  console.log(id.padEnd(14), 'N', g.N, 'residual', Math.sqrt(res / nf).toExponential(2), 'vs CG', Math.sqrt(diff / nv).toExponential(2), 'factor+solve', (t1 - t0).toFixed(1), 'ms', 'envelope', r.chol.start[g.N]);
}
