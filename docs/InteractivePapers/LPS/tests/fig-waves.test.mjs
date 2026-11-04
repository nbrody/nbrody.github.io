// node tests/fig-waves.test.mjs — the math behind Figure S1 (waves on the tree and on H²).
import {
  classify, lambdaOfS, spherical, sphericalClosed, sphereSize, edgeGrowth, planeWave, radialTree, horoTree,
  busemann, mixtureValue, randomWaves, hypProfile, hypAt, hypSphericalIntegral, lamToU, uToLam, DEPTHS, P_CHOICES,
} from '../js/fig-waves.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const PS = [2, 3, 5, 13, 17];
const sample = (p) => {
  const R = 2 * Math.sqrt(p), k = p + 1, out = [];
  for (let i = 0; i <= 40; i++) out.push(-k + (2 * k * i) / 40);
  out.push(R, -R, 0, 0.999 * R, 1.001 * R, k, -k);
  return out;
};

// classify: s gives back λ = p^s + p^{1−s}; θ gives back λ = 2√p cos θ; λ_H = s(1−s) when real
for (const p of PS) for (const lam of sample(p)) {
  const c = classify(lam, p), R = 2 * Math.sqrt(p);
  const b = lambdaOfS(c.s, p);
  ok(near(b.re, lam, 1e-10) && Math.abs(b.im) < 1e-9, `p^s+p^(1-s)=λ (p=${p}, λ=${lam})`);
  // cos of complex θ = a + iμ: cos a cosh μ − i sin a sinh μ
  const cr = Math.cos(c.theta.re) * Math.cosh(c.theta.im), ci = -Math.sin(c.theta.re) * Math.sinh(c.theta.im);
  ok(near(R * cr, lam, 1e-10) && Math.abs(R * ci) < 1e-9, `2√p cos θ = λ (p=${p}, λ=${lam})`);
  const temp = Math.abs(lam) <= R + 1e-12;
  ok(temp === (c.theta.im === 0), `tempered ⇔ θ real (p=${p}, λ=${lam})`);
  ok(temp === (c.kind === 'tempered' || c.kind === 'edge'), `kind (p=${p}, λ=${lam}): ${c.kind}`);
  if (c.lamH !== null) {
    const sr = c.s.re, si = c.s.im; // s(1−s) = (sr + i si)(1 − sr − i si)
    ok(near(sr * (1 - sr) + si * si, c.lamH, 1e-12) && Math.abs(si * (1 - 2 * sr)) < 1e-12, `λ_H = s(1−s) real (p=${p}, λ=${lam})`);
    ok(temp ? c.lamH >= 0.25 - 1e-12 : c.lamH >= 0 && c.lamH <= 0.25, `λ_H ≥ 1/4 ⇔ tempered (p=${p}, λ=${lam})`);
  } else ok(lam < -R, `no H² counterpart only for λ < −2√p (p=${p}, λ=${lam})`);
}
for (const p of PS) {
  ok(classify(p + 1, p).kind === 'trivial' && Math.abs(classify(p + 1, p).s.re) < 1e-12, `λ=p+1 ↦ s=0 (p=${p})`);
  ok(classify(-(p + 1), p).kind === 'sign', `λ=−(p+1) is the sign (p=${p})`);
  ok(near(classify(p + 1, p).mu, Math.log(Math.sqrt(p))), `θ_0 = i log √p (p=${p})`);
}

// spherical function: recurrence = closed form; unique radial eigenfunction; φ ≤ 1 in size
for (const p of PS) for (const lam of sample(p)) {
  const N = 30, rec = spherical(lam, p, N);
  let good = true;
  for (let n = 0; n <= N; n++) if (!near(rec[n], sphericalClosed(lam, p, n), 1e-8)) { good = false; console.log(p, lam, n, rec[n], sphericalClosed(lam, p, n)); break; }
  ok(good, `closed form = recurrence (p=${p}, λ=${lam})`);
  // radial eigen-equation: (p+1)φ(1) = λφ(0); φ(n−1) + pφ(n+1) = λφ(n)
  ok(near((p + 1) * rec[1], lam * rec[0]), `centre equation (p=${p}, λ=${lam})`);
  let eq = true;
  for (let n = 1; n < N; n++) if (!near(rec[n - 1] + p * rec[n + 1], lam * rec[n], 1e-9)) eq = false;
  ok(eq, `radial eigen-equation (p=${p}, λ=${lam})`);
  let bounded = true;
  for (let n = 0; n <= N; n++) if (Math.abs(rec[n]) > 1 + 1e-9) bounded = false;
  ok(bounded, `|φ| ≤ 1 (p=${p}, λ=${lam})`);
  // tempered ⇔ p^{n/2}φ(n) stays within the edge growth 1 + n(p−1)/(p+1)
  const R = 2 * Math.sqrt(p);
  let inEnv = true;
  for (let n = 0; n <= N; n++) if (Math.abs(rec[n] * p ** (n / 2)) > edgeGrowth(p, n) * (1 + 1e-9)) inEnv = false;
  if (Math.abs(lam) <= R) ok(inEnv, `tempered stays in the edge envelope (p=${p}, λ=${lam})`);
  else if (Math.abs(lam) >= R * 1.05) ok(!inEnv, `non-tempered leaves the envelope by n=30 (p=${p}, λ=${lam})`);
}
for (const p of PS) {
  const e = spherical(2 * Math.sqrt(p), p, 20);
  ok(e.every((v, n) => near(v * p ** (n / 2), edgeGrowth(p, n), 1e-9)), `at λ=2√p: p^{n/2}φ(n) = 1 + n(p−1)/(p+1) (p=${p})`);
  ok(sphereSize(p, 0) === 1 && sphereSize(p, 3) === (p + 1) * p * p, `sphere sizes (p=${p})`);
}

// the plane wave: f(b−1) + p f(b+1) = λ f(b), for any phase
for (const p of PS) for (const lam of sample(p)) {
  const c = classify(lam, p);
  let good = true;
  for (let b = -4; b <= 8; b++) for (const ph of [0, 0.7, 2.1]) {
    const lhs = planeWave(c.s, p, b - 1, ph) + p * planeWave(c.s, p, b + 1, ph), rhs = lam * planeWave(c.s, p, b, ph);
    if (!near(lhs, rhs, 1e-9)) good = false;
  }
  ok(good, `plane wave eigen-equation (p=${p}, λ=${lam})`);
}

// trees: sizes, sectors, the mean-value property for mixtures of plane waves on an explicit ball
for (const p of P_CHOICES) {
  const [Ds, Dh] = DEPTHS[p];
  const T = radialTree(p, Ds);
  let size = 0;
  for (let d = 0; d <= Ds; d++) size += sphereSize(p, d);
  ok(T.nodes.length === size && size <= 1300, `radial ball size p=${p}, D=${Ds}: ${size}`);
  const H = horoTree(p, Dh);
  ok(H.nodes.length === 2 + (p ** (Dh + 1) - 1) / (p - 1), `horocyclic subtree size p=${p}: ${H.nodes.length}`);
  for (let d = 1; d <= Ds; d++) {
    const ring = T.nodes.filter((n) => n.depth === d).sort((a, b) => a.lo - b.lo);
    let cover = Math.abs(ring[0].lo) < 1e-12 && Math.abs(ring[ring.length - 1].hi - 2 * Math.PI) < 1e-9;
    for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i].lo - ring[i - 1].hi) > 1e-9) cover = false;
    ok(cover, `ring ${d} tiles the circle (p=${p})`);
  }
  // an explicit check: neighbours of every interior vertex, values from paths
  for (const lam of [0.7 * 2 * Math.sqrt(p), -0.3 * 2 * Math.sqrt(p), 0.5 * (2 * Math.sqrt(p) + p + 1), -(p + 1), p + 1]) {
    const c = classify(lam, p), waves = randomWaves(p, Ds + 3, 11 + p);
    const f = (path) => mixtureValue(path, waves, c.s, p);
    let eq = true;
    for (const n of T.nodes) {
      if (n.depth >= Ds) continue;
      let sum = n.parent >= 0 ? f(T.nodes[n.parent].path) : 0;
      for (const j of n.kids) sum += f(T.nodes[j].path);
      if (!near(sum, lam * f(n.path), 1e-8)) { eq = false; break; }
    }
    ok(eq, `mixture is a λ-eigenfunction on the ball (p=${p}, λ=${lam.toFixed(3)})`);
    const phi = spherical(lam, p, Ds), f0 = f([]);
    let mv = true;
    for (let d = 0; d <= Ds; d++) {
      const ring = T.nodes.filter((n) => n.depth === d);
      const avg = ring.reduce((a, n) => a + f(n.path), 0) / ring.length;
      if (!near(avg, phi[d] * f0, 1e-8)) { mv = false; console.log(p, lam, d, avg, phi[d] * f0); }
    }
    ok(mv, `mean-value property around o (p=${p}, λ=${lam.toFixed(3)})`);
  }
}
ok(busemann([0, 1, 2], [0, 1, 2, 0]) === -3 && busemann([1, 0], [0, 1, 2]) === 2 && busemann([], [3, 1]) === 0, 'Busemann function');

// the hyperbolic plane: the ODE solution agrees with the Laplace integral, which satisfies the ODE
const SS = [{ re: 0.5, im: 0.7 }, { re: 0.5, im: 2.3 }, { re: 0.2, im: 0 }, { re: 0.05, im: 0 }, { re: 0.5, im: 0 }];
for (const s of SS) {
  const lamH = s.re * (1 - s.re) + s.im * s.im;
  const prof = hypProfile(lamH, 8.1, 0.005);
  for (const rho of [0.3, 1, 2.5, 5, 8]) {
    const I = hypSphericalIntegral(s, rho);
    ok(Math.abs(I.im) < 1e-8, `φ_s real (s=${s.re}+${s.im}i, ρ=${rho}): im ${I.im.toExponential(1)}`);
    ok(near(hypAt(prof, rho), I.re, 2e-6), `ODE = integral (s=${s.re}+${s.im}i, ρ=${rho}): ${hypAt(prof, rho)} vs ${I.re}`);
    const h = 2e-3, f0 = hypSphericalIntegral(s, rho).re, fp = hypSphericalIntegral(s, rho + h).re, fm = hypSphericalIntegral(s, rho - h).re;
    const res = (fp - 2 * f0 + fm) / (h * h) + ((fp - fm) / (2 * h)) / Math.tanh(rho) + lamH * f0;
    ok(Math.abs(res) < 2e-4 * Math.max(1, Math.abs(f0) * Math.exp(rho / 2) * 0 + 1), `integral solves φ''+coth ρ φ'+s(1−s)φ=0 (s=${s.re}+${s.im}i, ρ=${rho}): ${res.toExponential(1)}`);
  }
  ok(near(hypSphericalIntegral(s, 0).re, 1), `φ_s(0) = 1 (s=${s.re}+${s.im}i)`);
}
// the same growth rate on both sides for complementary s: tree p^{n/2}φ(n) and H² e^{ρ/2}φ_s(ρ), ρ = n log p
for (const p of [5, 13]) {
  const R = 2 * Math.sqrt(p), lam = 0.5 * (R + p + 1), c = classify(lam, p), L = Math.log(p);
  const prof = hypProfile(c.lamH, 40 * L, 0.01), tr = spherical(lam, p, 40);
  const gTree = Math.log((tr[40] * p ** 20) / (tr[30] * p ** 15)) / 10;
  const gH = Math.log((Math.exp(20 * L) * hypAt(prof, 40 * L)) / (Math.exp(15 * L) * hypAt(prof, 30 * L))) / 10;
  ok(Math.abs(gTree - c.mu) < 2e-3 && Math.abs(gH - c.mu) < 2e-3, `growth rate μ on both sides (p=${p}): ${gTree.toFixed(4)}, ${gH.toFixed(4)}, μ=${c.mu.toFixed(4)}`);
}
// tempered: same oscillation frequency θ per step
for (const p of [5, 13]) {
  const R = 2 * Math.sqrt(p), lam = 0.6 * R, c = classify(lam, p), L = Math.log(p);
  const prof = hypProfile(c.lamH, 60 * L, 0.01);
  // zero crossings of the H² profile in n-units, spacing → π/θ
  const zs = [];
  let prev = 1;
  for (let i = 1; i <= 6000; i++) { const n = i / 100, v = hypAt(prof, n * L); if ((v > 0) !== (prev > 0)) zs.push(n); prev = v; }
  const gap = (zs[zs.length - 1] - zs[2]) / (zs.length - 3);
  ok(Math.abs(gap - Math.PI / c.theta.re) < 0.03, `H² zero spacing π/θ in tree steps (p=${p}): ${gap.toFixed(3)} vs ${(Math.PI / c.theta.re).toFixed(3)}`);
}

// λ ↔ u keeps the class across p
for (const p of PS) for (const lam of sample(p)) ok(near(uToLam(lamToU(lam, p), p), lam, 1e-12), `u round trip (p=${p}, λ=${lam})`);
for (const u of [-2, -1.5, -1, -0.3, 0, 0.8, 1, 1.4, 2]) {
  const kinds = PS.map((p) => classify(uToLam(u, p), p).kind);
  ok(kinds.every((k) => k === kinds[0]), `class kept across p for u=${u}: ${kinds[0]}`);
}

console.log(`fig-waves: ${passes} passed, ${fails} failed`);
if (fails) process.exit(1);
