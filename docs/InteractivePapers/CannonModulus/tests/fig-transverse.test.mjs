// node tests/fig-transverse.test.mjs — Figure 6: Lemma 3.8, (3.7), on f = Re(e^{iθ}/(z−b)), w = Re(e^{iφ}/(z−c)).
import {
  K_DISK, MESHES, mag, rangeOn, cellOsc, levelChord, levelPoint, oscOnLevel, b0Of, meshSums, analyze, chordMiddle,
} from '../js/fig-transverse.js';

let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log('FAIL', msg)));
let seed = 12345;
const rnd = (a = 0, b = 1) => { seed = (seed * 1103515245 + 12345) % 2147483648; return a + ((b - a) * seed) / 2147483648; };
const K = K_DISK;
const punct = () => { // a point outside K, at distance 0.15–1.2 from it
  const a = rnd(0, 2 * Math.PI), r = K.r + rnd(0.15, 1.2);
  return [r * Math.cos(a), r * Math.sin(a)];
};
const randState = () => {
  const F = { p: punct(), a: rnd(-Math.PI, Math.PI) }, G = { p: punct(), a: rnd(-Math.PI, Math.PI) };
  const [lo, hi] = rangeOn(F, K), u = rnd(0.02, 0.6), v = rnd(u + 0.05, 0.98);
  return { F, G, I: [lo + u * (hi - lo), lo + v * (hi - lo)] };
};

// 1. exact oscillation and range on a closed disk = dense sampling of its boundary (harmonic: extremes on ∂)
for (let k = 0; k < 300; k++) {
  const F = { p: punct(), a: rnd(-3, 3) };
  const q = [rnd(-1, 1), rnd(-1, 1)], dq = Math.hypot(q[0] - F.p[0], q[1] - F.p[1]), rho = rnd(0.01, 0.95) * dq;
  let lo = Infinity, hi = -Infinity;
  for (let m = 0; m < 4000; m++) {
    const a = (2 * Math.PI * m) / 4000, v = mag(F, q[0] + rho * Math.cos(a), q[1] + rho * Math.sin(a));
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const ex = cellOsc(F, q[0], q[1], rho), [rl, rh] = rangeOn(F, { c: q, r: rho });
  ok(hi - lo <= ex * (1 + 1e-12) && hi - lo >= ex * (1 - 1e-4), `cellOsc vs sampling ${ex} ${hi - lo}`);
  ok(Math.abs(rl - lo) <= 1e-4 * ex && Math.abs(rh - hi) <= 1e-4 * ex, 'rangeOn vs sampling');
}
ok(cellOsc({ p: [0, 0], a: 0 }, 0.1, 0, 0.2) === Infinity, 'a cell containing the puncture has infinite oscillation');

// 2. level continua: points of the chord are in K and on the level; osc of w along D_t is exact
for (let k = 0; k < 300; k++) {
  const { F, G, I } = randState();
  const t = rnd(I[0], I[1]), ch = levelChord(F, K, t);
  ok(!!ch, 'D_t nonempty for t in I');
  if (!ch) continue;
  let lo = Infinity, hi = -Infinity, onLevel = true, inK = true;
  for (let m = 0; m <= 20000; m++) {
    const z = levelPoint(F, t, ch[0] + ((ch[1] - ch[0]) * m) / 20000);
    if (Math.abs(mag(F, ...z) - t) > 1e-9 * Math.max(1, Math.abs(t))) onLevel = false;
    if (Math.hypot(z[0] - K.c[0], z[1] - K.c[1]) > K.r * (1 + 1e-9)) inK = false;
    const v = mag(G, ...z); lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  ok(onLevel && inK, 'chord points lie on {f=t} and in K');
  const o = oscOnLevel(F, G, K, t);
  ok(hi - lo <= o.osc + 1e-10 && hi - lo >= o.osc - 1e-6 * Math.max(1, o.osc), `oscOnLevel exact ${o.osc} vs ${hi - lo}`);
}

// 3. b_0 against a brute-force grid over t (sampled osc)
for (let k = 0; k < 40; k++) {
  const { F, G, I } = randState();
  const { b0 } = b0Of(F, G, K, I);
  let brute = Infinity;
  for (let m = 0; m <= 20000; m++) brute = Math.min(brute, oscOnLevel(F, G, K, I[0] + ((I[1] - I[0]) * m) / 20000).osc);
  ok(b0 <= brute + 1e-12 && b0 >= brute - 2e-3 * Math.max(1e-3, brute), `b0 ${b0} vs grid ${brute}`);
}

// 4. the proof's first step: osc_{D_t} w ≤ Σ over cells meeting D_t of osc w (cells cover D_t)
for (let k = 0; k < 60; k++) {
  const { F, G, I } = randState();
  const n = [8, 16, 32][k % 3], rn = 1 / n, rho = 2 * rn;
  const t = rnd(I[0], I[1]), o = oscOnLevel(F, G, K, t);
  const hit = new Set();
  for (let m = 0; m <= 4000; m++) {
    const z = levelPoint(F, t, o.s0 + ((o.s1 - o.s0) * m) / 4000);
    const i0 = Math.floor(z[0] / rn) - 2, j0 = Math.floor(z[1] / rn) - 2;
    for (let i = i0; i <= i0 + 5; i++) for (let j = j0; j <= j0 + 5; j++) if (Math.hypot(i * rn - z[0], j * rn - z[1]) <= rho) hit.add(i + ',' + j);
  }
  let sum = 0;
  for (const key of hit) { const [i, j] = key.split(',').map(Number); sum += cellOsc(G, i * rn, j * rn, rho); }
  ok(o.osc <= sum, `covering step: ${o.osc} <= ${sum}`);
}

// 5. (3.7) with the proof's middle term, and Cauchy–Schwarz, over random states and every valid mesh
let meshesChecked = 0;
for (let k = 0; k < 250; k++) {
  const { F, G, I } = randState();
  const res = analyze(F, G, I);
  const lhs = res.b0 * (I[1] - I[0]);
  for (const r of res.rows) {
    if (!r.valid) continue;
    meshesChecked++;
    ok(lhs <= r.M * (1 + 1e-12), `b0|I| ${lhs} <= M ${r.M} at n=${r.n}`);
    ok(r.M <= r.S * (1 + 1e-12), `M <= S at n=${r.n}`);
    ok(r.S <= r.CS * (1 + 1e-12), `S <= CS at n=${r.n}`);
    ok(r.ok37 && r.okCS, 'analyze flags');
  }
}
ok(meshesChecked > 1500, `enough meshes checked (${meshesChecked})`);

// 6. cell count = the net points whose closed cell meets K; a too-coarse mesh is flagged
{
  const F = { p: [-1.6, 0.2], a: 0.3 }, G = { p: [1.5, -0.4], a: 2 };
  for (const n of MESHES) {
    const r = meshSums(F, G, K, n, [0, 0.1]), rn = 1 / n;
    let c = 0;
    for (let i = -n - 3; i <= n + 3; i++) for (let j = -n - 3; j <= n + 3; j++) if ((i * rn) ** 2 + (j * rn) ** 2 <= (K.r + 2 * rn) ** 2 * (1 + 1e-12)) c++;
    ok(r.cells === c && r.valid, `cell count n=${n}`);
  }
  ok(!meshSums({ p: [-1.1, 0], a: 0 }, G, K, 6, [0, 0.1]).valid, 'a cell reaching a puncture invalidates the mesh');
}

// 7. same puncture, same angle: w = f, so b_0 = 0 (no constraint); same puncture, other angle: b_0 > 0
for (let k = 0; k < 100; k++) {
  const { F, I } = randState();
  ok(b0Of(F, { p: F.p.slice(), a: F.a }, K, I).b0 <= 1e-12, 'w = f gives b0 = 0');
  ok(b0Of(F, { p: F.p.slice(), a: F.a + rnd(0.3, 2.8) }, K, I).b0 > 0, 'same puncture, different angle gives b0 > 0');
}

// 8. the presets as shipped
{
  const b = [-1.73, -0.48], th = -0.99, F = { p: b, a: th };
  const P0 = chordMiddle(F, K, 0.3), P1 = chordMiddle(F, K, 0.7);
  const a = mag(F, ...P0), c = mag(F, ...P1), I = [Math.min(a, c), Math.max(a, c)];
  ok(Math.hypot(...P0) < K.r && Math.hypot(...P1) < K.r, 'preset handles lie in K');
  const apart = analyze(F, { p: [1.64, 0.97], a: 1.72 }, I), same = analyze(F, { p: b, a: th }, I), close = analyze(F, { p: [-1.65, -0.48], a: th }, I);
  ok(apart.b0 > 0.1 && apart.rows.every((r) => r.valid && r.ok37 && r.okCS), 'default: b0 > 0 and (3.7) at every mesh');
  ok(same.b0 === 0 && same.rows.every((r) => r.ok37), 'same puncture, same angle: b0 = 0');
  ok(close.b0 > 0 && close.b0 < apart.b0 / 5 && close.rows.every((r) => !r.valid || r.ok37), 'close punctures: small positive b0');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
