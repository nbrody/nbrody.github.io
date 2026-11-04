// node tests/fig-pairs.test.mjs — Figure 8: the cost of a far pair, (6.8)–(6.11), in the exact Möbius model
// h_i(u) = p_i + R e^{iα}/u on the Riemann sphere with the chordal metric.
import {
  CONST, BAND, sigma, lift, capOfDisk, diskOfCap, ballCap, ballDisk, mobiusDisk, mobiusPoint, maxDist, minDist, capInside, pairCost,
} from '../js/fig-pairs.js';

let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log('FAIL', msg)));
let seed = 987654;
const rnd = (a = 0, b = 1) => { seed = (seed * 1103515245 + 12345) % 2147483648; return a + ((b - a) * seed) / 2147483648; };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const circlePts = (D, n = 360) => Array.from({ length: n }, (_, k) => [D.m[0] + D.r * Math.cos((2 * Math.PI * k) / n), D.m[1] + D.r * Math.sin((2 * Math.PI * k) / n)]);
const inside = (D, w) => { const d = Math.hypot(w[0] - D.m[0], w[1] - D.m[1]); return D.ext ? d >= D.r : d <= D.r; };

// 1. the chordal metric in a chart is the distance in R³ between the lifts
for (let k = 0; k < 200; k++) {
  const a = [rnd(-3, 3), rnd(-3, 3)], b = [rnd(-3, 3), rnd(-3, 3)], A = lift(a), B = lift(b);
  ok(near(sigma(a, b), Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), 1e-12), 'sigma = |lift a − lift b|');
  ok(near(Math.hypot(...A), 1, 1e-12), 'lift on the unit sphere');
}

// 2. Möbius images of disks are the exact disks: dense boundary sampling (both sides of the pole)
for (let k = 0; k < 300; k++) {
  const D = { m: [rnd(-1, 1), rnd(-1, 1)], r: rnd(0.01, 0.6), ext: false };
  const o = [rnd(-1, 1), rnd(-1, 1)], q = [rnd(-1, 1), rnd(-1, 1)], K = [rnd(-0.1, 0.1), rnd(-0.1, 0.1)];
  if (Math.abs(Math.hypot(D.m[0] - o[0], D.m[1] - o[1]) - D.r) < 0.02) continue; // pole too close to the circle
  const E = mobiusDisk(D, q, K, o);
  let onCircle = true;
  for (const w of circlePts(D)) {
    const v = mobiusPoint(w, q, K, o);
    if (!near(Math.hypot(v[0] - E.m[0], v[1] - E.m[1]), E.r, 1e-8)) onCircle = false;
  }
  ok(onCircle, 'boundary maps onto the image circle');
  const poleInside = Math.hypot(D.m[0] - o[0], D.m[1] - o[1]) < D.r;
  ok(E.ext === poleInside, 'the image is an exterior exactly when the pole is inside');
  // interior samples land inside the image region
  let allIn = true;
  for (let m = 0; m < 50; m++) {
    const rr = D.r * Math.sqrt(rnd(0, 0.95)), a = rnd(0, 2 * Math.PI), w = [D.m[0] + rr * Math.cos(a), D.m[1] + rr * Math.sin(a)];
    if (Math.hypot(w[0] - o[0], w[1] - o[1]) < 1e-6) continue;
    if (!inside(E, mobiusPoint(w, q, K, o))) allIn = false;
  }
  ok(allIn, 'interior maps into the image region');
}

// 3. caps ↔ chart disks; chordal balls; extreme chordal distances
for (let k = 0; k < 300; k++) {
  const c = [rnd(-1.2, 1.2), rnd(-1.2, 1.2)], r = rnd(0.002, 0.8);
  const D = ballDisk(c, r), C = ballCap(c, r);
  let good = true;
  for (const w of circlePts(D, 120)) if (!near(sigma(c, w), r, 1e-9)) good = false;
  ok(good && !D.ext, 'chordal ball B(c, r) is the chart disk with boundary at chordal distance r');
  const C2 = capOfDisk(D), D2 = diskOfCap(C2);
  ok(near(C2.th, C.th, 1e-9) && near(C2.n[0], C.n[0], 1e-9) && near(C2.n[2], C.n[2], 1e-9), 'capOfDisk inverts diskOfCap');
  ok(near(D2.r, D.r, 1e-9) && near(D2.m[0], D.m[0], 1e-9) && D2.ext === D.ext, 'diskOfCap inverts capOfDisk');
  const P = [rnd(-1.5, 1.5), rnd(-1.5, 1.5)];
  let mx = -Infinity, mn = Infinity;
  for (const w of circlePts(D, 4000)) { const s = sigma(P, w); mx = Math.max(mx, s); mn = Math.min(mn, s); }
  if (inside(D, P)) mn = 0;
  const A = lift(P);
  if (-(A[0] * C.n[0] + A[1] * C.n[1] + A[2] * C.n[2]) >= Math.cos(C.th)) mx = 2; // the antipode of P is in the cap
  ok(mx <= maxDist(P, C) + 1e-12 && near(mx, maxDist(P, C), 1e-5), `maxDist ${maxDist(P, C)} vs ${mx}`);
  ok(mn >= minDist(P, C) - 1e-12 && near(mn, minDist(P, C), 1e-5), `minDist ${minDist(P, C)} vs ${mn}`);
}
// exterior regions: a cap containing ∞ comes back as an exterior and survives the round trip
for (let k = 0; k < 100; k++) {
  const D = { m: [rnd(-1, 1), rnd(-1, 1)], r: rnd(0.05, 1), ext: true }, D2 = diskOfCap(capOfDisk(D));
  ok(D2.ext && near(D2.r, D.r, 1e-9) && near(D2.m[1], D.m[1], 1e-9), 'exterior round trip');
}

// 4. the model is an expansion: (2.2) and (2.3) with D_y = max{R, σ(x_i, y)}
for (let k = 0; k < 40; k++) {
  const R = 10 ** rnd(-3, -1.3), pi = [rnd(-0.5, 0.5), rnd(-0.5, 0.5)], al = rnd(0, 6.3), K = [R * Math.cos(al), R * Math.sin(al)];
  const h = (u) => mobiusPoint(u, pi, K, [0, 0]);
  let lo = Infinity, hi = 0, plo = Infinity, phi = 0;
  for (let m = 0; m < 300; m++) {
    const pt = () => { const s = 10 ** rnd(Math.log10(R) - 1.5, 0.6), a = rnd(0, 6.3); return [s * Math.cos(a), s * Math.sin(a)]; };
    const y = pt(), z = pt(), Dy = Math.max(R, sigma([0, 0], y)), Dz = Math.max(R, sigma([0, 0], z));
    const q = (sigma(h(y), h(z)) * Dy * Dz) / (R * sigma(y, z));
    lo = Math.min(lo, q); hi = Math.max(hi, q);
    if (sigma([0, 0], y) <= 1) { const pq = (sigma(h(y), pi) * Dy) / R; plo = Math.min(plo, pq); phi = Math.max(phi, pq); }
  }
  ok(lo >= 0.2 && hi <= 5, `(2.2) band [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
  ok(plo >= 0.2 && phi <= 5, `(2.3) band [${plo.toFixed(3)}, ${phi.toFixed(3)}]`);
}

// 5. random far pairs: every check holds, and the containments hold on dense samples too
const randPair = (eLo, eHi) => {
  const R = 10 ** rnd(-3, -1.3), e = rnd(eLo, eHi), d0 = R / e, a = rnd(0, 6.3);
  const pi = [rnd(-0.4, 0.4), rnd(-0.4, 0.4)];
  return { pi, pj: [pi[0] + d0 * Math.cos(a), pi[1] + d0 * Math.sin(a)], R, alpha: rnd(-3, 3) };
};
let farN = 0;
for (let k = 0; k < 600; k++) {
  const P = randPair(0.002, 0.14), r = pairCost(P);
  if (r.d > 1.6 || r.ratio > 0.15) continue; // keep d_ij ≤ diam-ish and R/d_ij genuinely small
  farN++;
  ok(r.allOk, `far pair: all checks (R/d=${r.ratio.toFixed(3)}, d=${r.d.toFixed(3)})`);
  ok(near(r.c2, CONST.C2, 1e-9), 's_ij d²/R² = C_2 by definition');
  ok(r.q68 >= BAND[0] && r.q68 <= BAND[1], '(6.8) band');
  ok(r.q69 >= BAND[0] * CONST.Ah && r.q69 <= BAND[1] * CONST.Ah, '(6.9) radius band');
  // z_ij = h_i⁻¹ p_j
  const back = mobiusPoint(r.z, P.pi, [P.R * Math.cos(P.alpha), P.R * Math.sin(P.alpha)], [0, 0]);
  ok(near(back[0], P.pj[0], 1e-9) && near(back[1], P.pj[1], 1e-9), 'h_i z_ij = p_j');
  if (k % 4 === 0) {
    const K = [P.R * Math.cos(P.alpha), P.R * Math.sin(P.alpha)];
    // (6.9) on samples: pull back points of E_j and measure from z_ij
    let worst = 0;
    for (const w of circlePts(r.Ej, 720)) worst = Math.max(worst, sigma(r.z, mobiusPoint(w, [0, 0], K, P.pi)));
    ok(worst <= r.s * (1 + 1e-9), '(6.9) on samples');
    // (6.11) on samples: push forward points of ∂D_ij and measure from p_j
    let worst2 = 0;
    for (const w of circlePts(r.DD, 720)) worst2 = Math.max(worst2, sigma(P.pj, mobiusPoint(w, P.pi, K, [0, 0])));
    ok(worst2 <= CONST.C3 * P.R * (1 + 1e-9), '(6.11) on samples');
    ok(near(worst2, r.q611 * P.R, 1e-4), 'radius of h_i D_ij about p_j, exact vs samples');
  }
}
ok(farN > 300, `enough far pairs (${farN})`);

// 6. near pairs: the scale separation fails and the checks catch it
for (let k = 0; k < 300; k++) {
  const r = pairCost(randPair(0.3, 3));
  ok(!r.allOk && !r.okSep && !r.ok611, `near pair flagged (R/d=${r.ratio.toFixed(3)})`);
}
// sweeping R/d_ij along a ray: once it fails, it keeps failing
{
  let failed = false, monotone = true;
  for (let e = 0.01; e < 3; e *= 1.05) {
    const r = pairCost({ pi: [0.1, -0.05], pj: [0.1 + 0.02 / e, -0.05], R: 0.02, alpha: 0.4 });
    if (failed && r.allOk) monotone = false;
    if (!r.allOk) failed = true;
  }
  ok(failed && monotone, 'checks fail from a threshold of R/d_ij on and stay failed');
}

// 7. the presets as shipped
{
  const far = pairCost({ pi: [-0.3, -0.08], pj: [0.3, 0.08], R: 0.035, alpha: 0.35 });
  const closer = pairCost({ pi: [-0.3, -0.08], pj: [-0.02, -0.01], R: 0.035, alpha: 0.35 });
  const nearP = pairCost({ pi: [-0.3, -0.08], pj: [-0.187, -0.05], R: 0.035, alpha: 0.35 });
  ok(far.allOk && closer.allOk, 'far and closer presets: every check ✓');
  ok(!nearP.allOk && nearP.disjoint && nearP.ok68 && !nearP.ok611, 'near preset: E_i, E_j disjoint but (6.11) fails');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
