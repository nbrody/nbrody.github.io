// node tests/fig-structure.test.mjs — Figure 2 (Proposition 2.6): the orbit of the round form under a
// bounded group of linear maps, its hyperbolic circumcenter, and the invariance f^*q = q.
import {
  PRESETS, buildConfig, circumcenter, circumcenterBrute, hdist, pullDisk, pullback, formToDisk, diskToForm,
  distortion, rot, refl, mul, inv, det, I2, closeGroup, orbitOf, permutes, isometryDefect, pullPath, conjugatorFrom,
} from '../js/fig-structure.js';

let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log('FAIL', msg)));
let s = 2024;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const diskPt = (rmax = 0.8) => { const r = rmax * Math.sqrt(rnd()), a = 2 * Math.PI * rnd(); return [r * Math.cos(a), r * Math.sin(a)]; };

// ── the model of C_x: round form at 0, d(q_round, F^*q_round) = log K(F), forms ↔ disk
for (let i = 0; i < 200; i++) {
  const F = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
  if (Math.abs(det(F)) < 0.05) continue;
  const z = formToDisk(pullback(F, I2));
  ok(Math.abs(hdist([0, 0], z) - Math.log(distortion(F))) < 1e-9, `d(round, F*round) = log K(F) #${i}`);
  const w = diskPt();
  const back = formToDisk(diskToForm(w));
  ok(hdist(w, back) < 1e-12, `disk ↔ form round trip #${i}`);
  // pullback is an isometry, of either orientation
  ok(isometryDefect(F, 10, i + 1) < 1e-8, `F^* is an isometry (det ${det(F) > 0 ? '+' : '−'}) #${i}`);
  // (FG)^* = G^* F^*
  const G = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
  if (Math.abs(det(G)) > 0.05) ok(hdist(pullDisk(mul(F, G), w), pullDisk(G, pullDisk(F, w))) < 1e-8, `composition rule #${i}`);
}
ok(formToDisk(I2).every((x) => Math.abs(x) < 1e-15), 'round form at the centre');
ok(hdist(formToDisk(pullback(rot(0.7), I2)), [0, 0]) < 1e-12, 'rotations fix the round form');
ok(hdist(formToDisk(pullback(refl(0.3), I2)), [0, 0]) < 1e-12, 'reflections fix the round form');

// ── circumcenter: Welzl agrees with brute force, and encloses
for (let i = 0; i < 400; i++) {
  const n = 1 + Math.floor(rnd() * 8);
  const rmax = rnd() < 0.3 ? 0.97 : 0.8;
  const pts = Array.from({ length: n }, () => diskPt(rmax));
  const a = circumcenter(pts), b = circumcenterBrute(pts);
  ok(Math.abs(a.r - b.r) < 1e-7 * Math.max(1, b.r), `radius agrees with brute force n=${n} #${i}: ${a.r} vs ${b.r}`);
  ok(hdist(a.c, b.c) < 1e-5, `centre agrees with brute force n=${n} #${i}: ${hdist(a.c, b.c)}`);
  ok(pts.every((p) => hdist(a.c, p) <= a.r + 1e-9), `ball encloses n=${n} #${i}`);
  // minimality: moving the centre a little in any direction does not shrink the radius
  const worse = [0, 1, 2, 3, 4, 5, 6, 7].every((k) => {
    const e = 1e-4, c = [a.c[0] + e * Math.cos(k), a.c[1] + e * Math.sin(k)];
    return Math.max(...pts.map((p) => hdist(c, p))) >= a.r - 1e-9;
  });
  ok(worse, `local minimality n=${n} #${i}`);
}
// equilateral configuration about a known centre
for (let i = 0; i < 20; i++) {
  const c = diskPt(0.6), r = 0.3 + rnd() * 1.5, rho = Math.tanh(r / 2), m = 3 + (i % 5);
  const pts = Array.from({ length: m }, (_, k) => { const t = (2 * Math.PI * k) / m + rnd() * 0.1; const w = [rho * Math.cos(t), rho * Math.sin(t)]; return mobInvExt(c, w); });
  const a = circumcenter(pts);
  ok(hdist(a.c, c) < 1e-8 && Math.abs(a.r - r) < 1e-8, `regular polygon centre recovered #${i}`);
}
function mobInvExt(c, w) { // (w + c)/(1 + c̄ w)
  const nr = [w[0] + c[0], w[1] + c[1]], dr = [1 + c[0] * w[0] + c[1] * w[1], c[0] * w[1] - c[1] * w[0]];
  const d = dr[0] * dr[0] + dr[1] * dr[1];
  return [(nr[0] * dr[0] + nr[1] * dr[1]) / d, (nr[1] * dr[0] - nr[0] * dr[1]) / d];
}

// ── the finite-group presets: closure, invariance, the bound
for (const key of ['c5', 'd3', 'lattice']) {
  const pre = PRESETS[key];
  for (let i = 0; i < 40; i++) {
    const hz = i === 0 ? [0, 0] : diskPt(0.5);
    const cfg = buildConfig(key, hz);
    ok(cfg.els && cfg.els.length === { c5: 5, d3: 6, lattice: 12 }[key], `${key}: group order ${cfg.els && cfg.els.length}`);
    ok(cfg.pts.length === (i === 0 ? { c5: 1, d3: 1, lattice: 3 } : { c5: 5, d3: 6, lattice: 6 })[key], `${key}: orbit size ${cfg.pts.length} #${i}`);
    for (const c of cfg.checks) {
      ok(c.perm.ok, `${key}: ${c.name}^* permutes the orbit #${i}`);
      ok(c.moved < 1e-9, `${key}: d(${c.name}^*q, q) = ${c.moved} #${i}`);
      ok(c.iso < 1e-8, `${key}: ${c.name}^* is an isometry #${i}`);
    }
    // every element of the group (not only generators) fixes the centre
    ok(cfg.els.every((e) => hdist(pullDisk(e.M, cfg.cc.c), cfg.cc.c) < 1e-8), `${key}: every f fixes q #${i}`);
    // the centre is the conjugated invariant form h^*Q0
    ok(hdist(cfg.invariant, cfg.cc.c) < 1e-8, `${key}: q = h^*Q0 (${hdist(cfg.invariant, cfg.cc.c)}) #${i}`);
    // the orbit lies in B(q_round, log K), with a point on its boundary; r ≤ log K; d(q, q_round) ≤ r
    const logK = Math.log(cfg.K);
    const far = Math.max(...cfg.pts.map((p) => hdist([0, 0], p.z)));
    ok(Math.abs(far - logK) < 1e-8, `${key}: max d(q_round, f^*q_round) = log K #${i}`);
    ok(cfg.cc.r <= logK + 1e-9, `${key}: r ≤ log K #${i}`);
    ok(hdist([0, 0], cfg.cc.c) <= cfg.cc.r + 1e-9, `${key}: d(q, q_round) ≤ r #${i}`);
    // all orbit points are at the same distance from the centre (G is transitive on the orbit)
    ok(cfg.pts.every((p) => Math.abs(hdist(cfg.cc.c, p.z) - cfg.cc.r) < 1e-8), `${key}: orbit on the circle #${i}`);
    // conjugator distortion bound: K ≤ K(h)^2 · K(G₀)
    const K0 = Math.max(...closeGroup(pre.gens.map((g) => g.M)).map((e) => distortion(e.M)));
    ok(cfg.K <= distortion(cfg.h) ** 2 * K0 * (1 + 1e-9), `${key}: K ≤ K(h)²K(G₀) #${i}`);
    // the animation path ends at the pullback and keeps the centre fixed
    for (const g of cfg.gens) {
      const path = pullPath(g.M, cfg.cc.c);
      ok(cfg.pts.every((p) => hdist(path(p.z, 1), pullDisk(g.M, p.z)) < 1e-8), `${key}: path(·,1) = ${g.name}^* #${i}`);
      ok([0.3, 0.5, 0.8].every((t) => hdist(path(cfg.cc.c, t), cfg.cc.c) < 1e-8), `${key}: path fixes q #${i}`);
    }
  }
}
// orientation-reversing maps are present and kept
ok(buildConfig('d3', [0.2, 0.1]).els.filter((e) => det(e.M) < 0).length === 3, 'D3: three reflections');
ok(buildConfig('lattice', [0, 0]).els.filter((e) => det(e.M) < 0).length === 6, 'D6: six reversing elements');

// ── the set that is not closed: detected
for (let i = 0; i < 30; i++) {
  const cfg = buildConfig('shear', i === 0 ? [0, 0] : diskPt(0.5));
  const c = cfg.checks[0];
  ok(!c.perm.ok && c.perm.missing === 1, `shear: s^* does not permute the set (missing ${c.perm.missing}) #${i}`);
  ok(c.moved > 1e-3, `shear: the centre moves, d(s^*q, q) = ${c.moved} #${i}`);
  ok(c.iso < 1e-8, `shear: s^* is still an isometry #${i}`);
  const path = pullPath(cfg.gens[0].M, cfg.cc.c);
  ok(cfg.pts.every((p) => hdist(path(p.z, 1), pullDisk(cfg.gens[0].M, p.z)) < 1e-8), `shear: path ends at s^* #${i}`);
}
// K(s^n) grows without bound (no bounded orbit for ⟨s⟩)
{
  const s0 = PRESETS.shear.gens[0].M;
  let M = I2, prev = 1, grows = true;
  for (let n = 1; n <= 40; n++) { M = mul(M, s0); const K = distortion(M); if (K <= prev) grows = false; prev = K; }
  ok(grows && prev > 100, `K(s^n) increases without bound (K(s^40) = ${prev.toFixed(1)})`);
}

// ── a conjugated finite group fixes exactly h^T h, recovered by the circumcenter
for (let i = 0; i < 50; i++) {
  const hz = diskPt(0.7), h = conjugatorFrom(hz), m = 3 + (i % 6);
  const G = closeGroup([rot((2 * Math.PI) / m), refl(rnd() * Math.PI)].map((g) => mul(inv(h), mul(g, h))));
  const pts = orbitOf(G);
  const cc = circumcenter(pts.map((p) => p.z));
  ok(hdist(cc.c, hz) < 1e-8, `D${m}: circumcenter = h^T h #${i}`);
  ok(G.every((e) => permutes(e.M, pts).ok), `D${m}: every element permutes the orbit #${i}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
