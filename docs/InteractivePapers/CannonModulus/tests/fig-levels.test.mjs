// node tests/fig-levels.test.mjs — the math behind Figure 5 (Lemma 3.4): b_N, U^0_N, F_N, H_N,
// (3.3), and the lateral level continuum C_{N,t} met by every straddling path.
import * as L from '../js/fig-levels.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; if (fails < 40) console.log('FAIL', m); } };
const t0 = Date.now();
const EPS = 1e-12;

const G = L.makeGrid();
const models = Object.fromEntries(L.PRESETS.map((name) => [name, L.buildModel(G, L.presetWeights(G, name))]));
const rnd = L.mulberry32(2026);
const rp = (lo = 0, hi = 1) => [rnd(), lo + (hi - lo) * rnd()];

// ── Lemma 3.3 on this board: any convex combination of left–right crossings is top–bottom admissible
{
  const d = L.dualWeights(G, { gap: 1e-2 });
  ok(d.lower <= d.upper + EPS, `Frank–Wolfe bounds ordered (${d.lower} ≤ ${d.upper})`);
  ok(L.crossingCost(G, d.w) >= 1 - 1e-9, `dual weights are top–bottom admissible: cheapest crossing ${L.crossingCost(G, d.w)}`);
  let lake = true;
  for (let c = 0; c < G.NC; c++) if (d.hole[c] && d.w[c] !== 0) lake = false;
  ok(lake, 'dual weights vanish on the lakes');
}

for (const [name, M] of Object.entries(models)) {
  const { U, F, H } = M;
  // normalization and band values
  ok(Math.abs(M.crossing - 1) < 1e-12, `${name}: cheapest crossing = 1`);
  let top = true, bot = true;
  for (let i = 0; i <= G.nx; i++) {
    const a = i, b = G.ny * G.W + i;
    if (U[a] !== 0 || F[a] !== 0 || H[a] !== 0) top = false;
    if (U[b] !== 1 || F[b] !== 1 || H[b] !== 1) bot = false;
  }
  ok(top, `${name}: U, F, H vanish on the top edge`);
  ok(bot, `${name}: U, F, H equal 1 on the bottom edge`);
  // raw values: b_N ≥ 1 at the bottom edge before clipping (admissibility), min{1,b} in [0,1]
  let inRange = true;
  for (let v = 0; v < G.NV; v++) if (!(U[v] >= 0 && U[v] <= 1)) inRange = false;
  ok(inRange, `${name}: raw values lie in [0,1]`);
  let bands = true;
  for (let k = 0; k < 200; k++) {
    const x = rnd();
    for (const kind of ['U', 'F', 'H']) {
      if (L.valueAt(M, kind, x, -rnd()) !== 0 || L.valueAt(M, kind, x, 1 + rnd()) !== 1) bands = false;
    }
  }
  ok(bands, `${name}: band values 0 (top band) and 1 (bottom band)`);

  // vertex values agree with the closed forms; F ≥ U and H ≤ F at vertices and at random points
  let agree = true, order = true;
  for (let v = 0; v < G.NV; v++) {
    const x = L.vx(G, v), y = L.vy(G, v);
    if (Math.abs(L.valueAt(M, 'U', x, y) - U[v]) > EPS || Math.abs(L.valueAt(M, 'F', x, y) - F[v]) > EPS || Math.abs(L.valueAt(M, 'H', x, y) - H[v]) > EPS) agree = false;
    if (!(F[v] >= U[v] && H[v] <= F[v])) order = false;
  }
  for (let k = 0; k < 3000; k++) {
    const [x, y] = rp();
    const u = L.valueAt(M, 'U', x, y), f = L.valueAt(M, 'F', x, y), h = L.valueAt(M, 'H', x, y);
    if (!(f >= u - EPS && h <= f + EPS)) order = false;
  }
  ok(agree, `${name}: closed-form values at the vertices = Dijkstra values`);
  ok(order, `${name}: F ≥ U^0 and H ≤ F pointwise`);

  // continuity across triangle edges: approach random edge points from both sides
  let cont = true;
  for (let k = 0; k < 2000; k++) {
    const i = Math.floor(rnd() * G.nx), j = Math.floor(rnd() * G.ny), s = rnd();
    const pts = [[(i + s) / G.nx, j / G.ny, 0, 1], [i / G.nx, (j + s) / G.ny, 1, 0]];   // horizontal and vertical edges
    for (const [x, y, ex, ey] of pts) {
      for (const kind of ['U', 'F', 'H']) {
        const a = L.valueAt(M, kind, x - ex * 1e-11, y - ey * 1e-11), b = L.valueAt(M, kind, x + ex * 1e-11, y + ey * 1e-11);
        if (Math.abs(a - b) > 1e-8) cont = false;
      }
    }
  }
  ok(cont, `${name}: U, F, H continuous across edges`);

  // exactness: on a midpoint subdivision of the triangulation (same PL function U), vertex
  // bottleneck Dijkstra must reproduce the closed forms F = max(U, f_T), H = min(F, h_T)
  {
    const nx2 = 2 * G.nx, ny2 = 2 * G.ny, W2 = nx2 + 1, NV2 = W2 * (ny2 + 1);
    const nb = Array.from({ length: NV2 }, () => []);
    const add = (a, b) => { nb[a].push(b); nb[b].push(a); };
    for (let J = 0; J <= ny2; J++) for (let I = 0; I <= nx2; I++) {
      const v = J * W2 + I;
      if (I < nx2) add(v, v + 1);
      if (J < ny2) add(v, v + W2);
      if (I < nx2 && J < ny2) {
        const even = (((I >> 1) + (J >> 1)) & 1) === 0;
        if (even) add(v, v + W2 + 1); else add(v + 1, v + W2);
      }
    }
    const Ur = new Float64Array(NV2), Fe = new Float64Array(NV2), He = new Float64Array(NV2);
    for (let v = 0; v < NV2; v++) {
      const x = (v % W2) / nx2, y = Math.floor(v / W2) / ny2;
      Ur[v] = L.valueAt(M, 'U', x, y); Fe[v] = L.valueAt(M, 'F', x, y); He[v] = L.valueAt(M, 'H', x, y);
    }
    const Fr = new Float64Array(NV2).fill(Infinity);
    const order1 = [];
    for (let i = 0; i < W2; i++) { Fr[i] = Ur[i]; order1.push(i); }
    // simple label-correcting bottleneck (graph is small)
    let changed = true;
    while (changed) {
      changed = false;
      for (let v = 0; v < NV2; v++) for (const u of nb[v]) { const c = Math.max(Fr[u], Ur[v]); if (c < Fr[v]) { Fr[v] = c; changed = true; } }
    }
    const Hr = new Float64Array(NV2).fill(-Infinity);
    for (let i = 0; i < W2; i++) Hr[ny2 * W2 + i] = Fr[ny2 * W2 + i];
    changed = true;
    while (changed) {
      changed = false;
      for (let v = 0; v < NV2; v++) for (const u of nb[v]) { const c = Math.min(Hr[u], Fr[v]); if (c > Hr[v]) { Hr[v] = c; changed = true; } }
    }
    let fe = 0, he = 0;
    for (let v = 0; v < NV2; v++) { fe = Math.max(fe, Math.abs(Fr[v] - Fe[v])); he = Math.max(he, Math.abs(Hr[v] - He[v])); }
    ok(fe < 1e-12, `${name}: F on the refined triangulation = closed form (max err ${fe})`);
    ok(he < 1e-12, `${name}: H on the refined triangulation = closed form (max err ${he})`);
  }

  // (3.3) on random paths (segments and 3-handle polylines, some reaching into the bands)
  let ok33 = 0, n33 = 0, strict = 0;
  for (let k = 0; k < 400; k++) {
    const pts = k % 2 ? [rp(-0.2, 1.2), rp(-0.2, 1.2)] : [rp(-0.1, 1.1), rp(), rp(-0.1, 1.1)];
    const o = L.oscTriple(M, pts);
    n33++;
    if (o.H <= o.F + EPS && o.F <= o.U + EPS) ok33++;
    if (o.H < o.U - 1e-6) strict++;
  }
  ok(ok33 === n33, `${name}: (3.3) on ${n33} random paths (${ok33} hold)`);
  if (name === 'rough') ok(strict > 0, `${name}: (3.3) is strict on some paths (${strict})`);

  // the envelope inequalities from the proof, along random segments K from x to y
  let env = true;
  for (let k = 0; k < 400; k++) {
    const x = rp(), y = rp();
    const rU = L.rangeAlong(M, 'U', [x, y]), rF = L.rangeAlong(M, 'F', [x, y]);
    const Fx = L.valueAt(M, 'F', ...x), Fy = L.valueAt(M, 'F', ...y), Hx = L.valueAt(M, 'H', ...x), Hy = L.valueAt(M, 'H', ...y);
    if (Fx > Math.max(rU.hi, Fy) + EPS) env = false;
    if (Hy < Math.min(rF.lo, Hx) - EPS) env = false;
  }
  ok(env, `${name}: F(x) ≤ max(max_K U, F(y)) and H(y) ≥ min(inf_K F, H(x))`);

  // level continua of H: a lateral component for every t in (0.05, 0.95), no islands, met by every
  // straddling segment
  for (let t = 0.06; t < 0.95; t += 0.04) {
    const Ls = L.levelSet(M, 'H', t);
    ok(Ls.nLateral >= 1, `${name}: {H=${t.toFixed(2)}} has a lateral component`);
    ok(Ls.nComp === Ls.nLateral, `${name}: {H=${t.toFixed(2)}} has no islands (${Ls.nComp - Ls.nLateral})`);
    const b = L.batchCheck(M, 'H', t, Ls, 200, 1000 + Math.round(t * 100));
    ok(b.n >= 100 && b.met === b.n, `${name}: t=${t.toFixed(2)}: every straddling segment meets C_{N,t} (${b.met}/${b.n})`);
  }

  // strict-side extensions complete a straddling path to a top–bottom crossing that meets C_{N,t}
  // only through the original path
  for (const t of [0.25, 0.5, 0.75]) {
    const Ls = L.levelSet(M, 'H', t);
    let made = 0, good = 0;
    for (let k = 0; k < 300 && made < 25; k++) {
      const a = rp(), b = rp();
      const fa = L.valueAt(M, 'H', ...a), fb = L.valueAt(M, 'H', ...b);
      if (!(fa < t && fb > t)) continue;
      made++;
      const lo = L.extension(M, 'H', t, a, -1), hi = L.extension(M, 'H', t, b, +1);
      if (!lo || !hi) continue;
      const loEnds = lo[lo.length - 1][1] === -1 && hi[hi.length - 1][1] === 2;
      const avoid = L.polylineMeets(Ls, lo, false).length === 0 && L.polylineMeets(Ls, hi, false).length === 0;
      const sides = L.rangeAlong(M, 'H', lo).hi < t && L.rangeAlong(M, 'H', hi).lo > t;
      const meets = L.polylineMeets(Ls, [a, b], true).length > 0;
      if (loEnds && avoid && sides && meets) good++;
    }
    ok(made > 5 && good === made, `${name}: t=${t}: strict-side extensions exist, avoid the level, and η meets C (${good}/${made})`);
  }
}

// the U^0 view: islands exist for the rough weights, and a straddling path inside one misses
{
  const M = models.rough, t = 0.6;
  const LU = L.levelSet(M, 'U', t), LH = L.levelSet(M, 'H', t);
  ok(LU.nComp > LU.nLateral, `rough: {U^0=${t}} has islands (${LU.nComp - LU.nLateral})`);
  const path = L.islandPath(M, 'U', t, LU);
  ok(!!path, 'rough: islandPath finds a path into an island of U^0');
  if (path) {
    const fa = L.valueAt(M, 'U', ...path[0]), fb = L.valueAt(M, 'U', ...path[2]);
    ok((fa - t) * (fb - t) < 0, 'island path straddles t for U^0');
    ok(L.polylineMeets(LU, path, true).length === 0, 'island path misses the lateral part of {U^0=t}');
    const hit = L.polylineMeets(LU, path, false).length > 0;
    ok(hit, 'island path meets an island of {U^0=t}');
    const ext = L.extension(M, 'U', t, fa < t ? path[2] : path[0], +1);
    ok(ext === null, 'the island end of the path cannot reach the bottom band inside {U^0>t}');
    const ha = L.valueAt(M, 'H', ...path[0]), hb = L.valueAt(M, 'H', ...path[2]);
    if ((ha - t) * (hb - t) < 0) ok(L.polylineMeets(LH, path, true).length > 0, 'for H the same path, if straddling, meets C_{N,t}');
    else ok(true, 'for H the same path no longer straddles t');
  }
  ok(L.islandPath(M, 'H', t, LH) === null, 'H has no island to put a path in');
  const b = L.batchCheck(M, 'U', t, LU, 500);
  ok(b.met < b.n, `rough: some straddling segments miss the lateral part of {U^0=t} (${b.n - b.met})`);
  let pits = 0, peaks = 0;
  for (let v = 0; v < G.NV; v++) { if (M.F[v] > M.U[v]) pits++; if (M.H[v] < M.F[v]) peaks++; }
  ok(pits > 0 && peaks > 0, `rough: F fills pits (${pits}) and H cuts peaks (${peaks})`);
}

// breakpoints: the functions are monotone between consecutive breakpoints (dense check)
{
  const M = models.rough;
  let mono = true;
  for (let k = 0; k < 150; k++) {
    const p = rp(-0.1, 1.1), q = rp(-0.1, 1.1), bp = L.breakpoints(G, p, q);
    for (let i = 0; i + 1 < bp.length; i++) {
      for (const kind of ['U', 'F', 'H']) {
        const at = (s) => L.valueAt(M, kind, p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1]));
        const a = at(bp[i]), b = at(bp[i + 1]), sgn = Math.sign(b - a);
        let prev = a;
        for (let m = 1; m <= 6; m++) {
          const v = at(bp[i] + ((bp[i + 1] - bp[i]) * m) / 7);
          if ((v - prev) * sgn < -1e-9 || (sgn === 0 && Math.abs(v - a) > 1e-9)) mono = false;
          prev = v;
        }
      }
    }
  }
  ok(mono, 'U, F, H are monotone between consecutive breakpoints (so osc is exact)');
}

console.log(`${passes} passed, ${fails} failed  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fails ? 1 : 0);
