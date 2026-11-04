// node tests/fig-lift.test.mjs — the math behind Figure S2 (an eigenvector of X^{p,q} seen from the tree).
import * as L from '../js/lps.js';
import {
  PAIRS, depthFor, rMaxFor, applyA, jacobiEigen, conjugationGroup, isAutomorphism, zonalSpectrum, zonalVector, zonalF,
  residual, nonBacktrackingCounts, sphereSize, sphericalFunction, sphericalAt, sphereAverages, shellSums, liftVertices,
} from '../js/fig-lift.js';
import { treeLayout } from '../js/fig-tree.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };

// Jacobi eigensolver: A z = λ z, Z orthogonal
{
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const D = 30, A = new Float64Array(D * D);
  for (let i = 0; i < D; i++) for (let j = i; j < D; j++) A[i * D + j] = A[j * D + i] = rnd();
  const { values, Z } = jacobiEigen(A, D);
  let worst = 0, orth = 0;
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < D; i++) {
      let t = 0;
      for (let l = 0; l < D; l++) t += A[i * D + l] * Z[l * D + j];
      worst = Math.max(worst, Math.abs(t - values[j] * Z[i * D + j]));
    }
    for (let jj = 0; jj < D; jj++) {
      let d = 0;
      for (let i = 0; i < D; i++) d += Z[i * D + j] * Z[i * D + jj];
      orth = Math.max(orth, Math.abs(d - (j === jj ? 1 : 0)));
    }
  }
  ok(worst < 1e-12 && orth < 1e-12, `jacobiEigen residual ${worst}, orthogonality ${orth}`);
}

// spherical function: the closed form agrees with the recurrence, inside and outside the window
for (const p of [5, 13, 29]) {
  const R = 2 * Math.sqrt(p);
  for (const lam of [p + 1, -(p + 1), R, -R, 0, 1.3, -2.7, R + 0.5, -R - 0.5, (p + 1 + R) / 2]) {
    const phi = sphericalFunction(lam, p, 14);
    let worst = 0;
    for (let r = 0; r <= 14; r++) worst = Math.max(worst, Math.abs(sphericalAt(lam, p, r) - phi[r]) / Math.max(1e-300, Math.abs(phi[r]) + Math.pow(p, -r / 2)));
    ok(worst < 1e-9, `closed form = recurrence, p=${p}, λ=${lam.toFixed(3)} (${worst})`);
  }
  // trivial: φ ≡ 1; sign: φ(r) = (−1)^r
  const one = sphericalFunction(p + 1, p, 10), sgn = sphericalFunction(-(p + 1), p, 10);
  ok(one.every((x) => Math.abs(x - 1) < 1e-12) && sgn.every((x, r) => Math.abs(x - (-1) ** r) < 1e-12), `φ_{±(p+1)}, p=${p}`);
}

const report = [];
for (const [p, q] of PAIRS) {
  const t0 = Date.now();
  const X = L.buildX(p, q);
  const Zs = zonalSpectrum(X);
  const tZ = Date.now() - t0;
  const group = conjugationGroup(X);
  ok(group.every((g) => g[0] === 0 && isAutomorphism(X, g)), `(${p},${q}) the ${group.length} conjugations fix e and are automorphisms`);
  ok(group.length === 24, `(${p},${q}) the conjugation group has order 24 (got ${group.length})`);
  const spec = L.spectrumX(X);
  const groups = [];
  for (const x of spec) { const g = groups[groups.length - 1]; if (g && Math.abs(g.x - x) < 1e-6) g.m++; else groups.push({ x, m: 1 }); }
  const D = Zs.eigen;
  ok(D.length === groups.length, `(${p},${q}) ${D.length} distinct zonal eigenvalues = ${groups.length} distinct eigenvalues`);
  let worstLam = 0, multOk = true, wsum = 0;
  D.forEach((d, i) => {
    const g = groups[i];
    if (!g) { multOk = false; return; }
    worstLam = Math.max(worstLam, Math.abs(d.lam - g.x));
    if (Math.abs(d.weight * X.n - g.m) > 1e-8) multOk = false;
    wsum += d.weight;
  });
  ok(worstLam < 1e-6, `(${p},${q}) zonal eigenvalues = dense spectrum (whose √ of A² loses precision near 0) (${worstLam})`);
  ok(multOk, `(${p},${q}) n·P_λ(e,e) = multiplicity`);
  ok(Math.abs(wsum - 1) < 1e-12, `(${p},${q}) Σ P_λ(e,e) = 1`);
  const lz = { dim: Zs.D };
  const tL = tZ;

  // a few eigenvalues: the top, the largest nontrivial, a middle one, the bottom
  const R = rMaxFor(p);
  const a = nonBacktrackingCounts(X, R);
  // counts are tree sphere sizes
  ok(a.every((ar, r) => Math.abs(ar.reduce((s, x) => s + x, 0) - sphereSize(p, r)) < 0.5), `(${p},${q}) Σ_v a_r(v) = |S_r|`);
  const picks = new Set(D.map((_, i) => i));
  let worstRes = 0, worstAvg = 0, worstShell = 0;
  for (const i of picks) {
    const d = D[i], P = zonalVector(Zs, i);
    const Pee = P[0];
    ok(Math.abs(Pee - d.weight) < 1e-10, `(${p},${q}) projection(e) = weight`);
    worstRes = Math.max(worstRes, residual(X, P, d.lam));
    const F = zonalF(X, Zs, i);
    ok(Math.abs(F[0] - 1) < 1e-14 && residual(X, F, d.lam) < 1e-9, `(${p},${q}) zonalF is a normalized eigenfunction`);
    const avg = sphereAverages(a, F, p), phi = sphericalFunction(d.lam, p, R);
    for (let r = 0; r <= R; r++) worstAvg = Math.max(worstAvg, Math.abs(avg[r] - phi[r]));
    const Ls = shellSums(a, F);
    for (let t = 0; t <= R; t++) { const h = L.H(t, d.lam, p); worstShell = Math.max(worstShell, Math.abs(Ls[t] - h) / Math.max(Math.abs(h), (t + 1) * Math.pow(p, t / 2))); }
  }
  ok(worstRes < 1e-9, `(${p},${q}) ‖AP − λP‖/‖P‖ = ${worstRes}`);
  ok(worstAvg < 1e-9, `(${p},${q}) sphere averages = φ_λ(r), r ≤ ${R} (${worstAvg})`);
  ok(worstShell < 1e-8, `(${p},${q}) shell sums = H_t(λ) (${worstShell})`);

  // the lift to the drawn tree ball is an eigenfunction there: Σ_{tree neighbours} F = λF at interior vertices
  const Lt = treeLayout(p, depthFor(p));
  const lift = liftVertices(Lt, X);
  // children lists
  const kids = Lt.nodes.map(() => []);
  Lt.nodes.forEach((nd, i) => { if (nd.parent >= 0) kids[nd.parent].push(i); });
  let worstLift = 0, cover = true;
  const d1 = D[1], F1 = zonalF(X, Zs, 1);
  Lt.nodes.forEach((nd, i) => {
    if (nd.depth === Lt.depth) return;
    const nbrs = [...kids[i], ...(nd.parent >= 0 ? [nd.parent] : [])];
    if (nbrs.length !== p + 1) cover = false;
    // the tree neighbours' images are exactly the graph neighbours of the image (as a multiset)
    const img = nbrs.map((j) => lift[j]).sort((x, y) => x - y);
    const gn = []; for (let s = 0; s < X.k; s++) gn.push(X.nbr[lift[i] * X.k + s]);
    gn.sort((x, y) => x - y);
    if (img.join() !== gn.join()) cover = false;
    const sum = nbrs.reduce((s, j) => s + F1[lift[j]], 0);
    worstLift = Math.max(worstLift, Math.abs(sum - d1.lam * F1[lift[i]]));
  });
  ok(cover, `(${p},${q}) the tree ball covers X (neighbours ↦ neighbours)`);
  ok(worstLift < 1e-9, `(${p},${q}) lifted F is a λ-eigenfunction on the tree (${worstLift})`);
  report.push(`(${p},${q}) n=${X.n} orbits=${lz.dim} group ${group.length} zonal ${tL} ms, res ${worstRes.toExponential(1)}, |avg−φ| ${worstAvg.toExponential(1)}, R=${R}, ball ${Lt.nodes.length}`);
}
console.log(report.join('\n'));
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
