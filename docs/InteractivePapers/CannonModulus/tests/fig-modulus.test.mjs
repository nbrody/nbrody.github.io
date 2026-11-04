// node tests/fig-modulus.test.mjs — Figure 4: Lemma 3.3 on a hexagonal board.
import {
  HexBoard, makeBoard, SHAPES, MinNormSolver, dualChecks, cheapest, avoids, shortestChain, TB_OPTS,
} from '../js/fig-modulus.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const t0 = Date.now();

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return ((seed >>> 8) & 0xffffff) / 0x1000000; };

function randomBoard(maxNc = 9, holeP = 0.15) {
  const nc = 3 + Math.floor(rnd() * (maxNc - 2));
  const b = new HexBoard(nc, 0.4 + rnd() * 1.2);
  for (let i = 0; i < b.n; i++) if (rnd() < holeP) b.holes[i] = 1;
  return b;
}
const randomWeights = (n) => Float64Array.from({ length: n }, () => 0.05 + rnd());

// ── neighbours are symmetric, and two cells are adjacent iff their centres are one hexagon apart ──
for (const nc of [3, 6, 11]) {
  const b = new HexBoard(nc, 1);
  let sym = true, geo = true;
  for (let i = 0; i < b.n; i++) for (let j = 0; j < b.n; j++) {
    if (i === j) continue;
    const adj = b.nbrs[i].includes(j);
    if (adj !== b.nbrs[j].includes(i)) sym = false;
    const d = Math.hypot((b.u[i] - b.u[j]) * b.Wb, (b.v[i] - b.v[j]) * b.Hb);
    if (adj !== Math.abs(d - Math.sqrt(3)) < 1e-9) geo = false;
  }
  ok(sym && geo, `hex adjacency nc=${nc}`);
}

// ── Lemma 3.2(i) on the board (Hex): every top–bottom chain meets every left–right chain ──
for (let trial = 0; trial < 400; trial++) {
  const b = randomBoard(10, 0.12 + 0.2 * rnd());
  const tb = cheapest(b, randomWeights(b.n), 'T', 'B');
  if (tb) ok(!avoids(b, tb.cells, 'L', 'R'), `a left–right chain avoids a top–bottom chain (trial ${trial})`);
  const lr = cheapest(b, randomWeights(b.n), 'L', 'R');
  if (lr) ok(!avoids(b, lr.cells, 'T', 'B'), `a top–bottom chain avoids a left–right chain (trial ${trial})`);
}

// ── the oracle: Dijkstra's chain is a chain, its cost is its cell sum, and nothing cheaper exists ──
for (let trial = 0; trial < 60; trial++) {
  const b = randomBoard(5, 0.1);
  const w = randomWeights(b.n);
  const s = cheapest(b, w, 'L', 'R');
  if (!s) continue;
  const cells = s.cells;
  let valid = b.onSide(cells[cells.length - 1], 'L') && b.onSide(cells[0], 'R') && cells.every((c) => !b.holes[c]);
  for (let k = 1; k < cells.length; k++) if (!b.nbrs[cells[k]].includes(cells[k - 1])) valid = false;
  ok(valid, `cheapest chain is a left–right chain (trial ${trial})`);
  ok(Math.abs(cells.reduce((a, c) => a + w[c], 0) - s.len) < 1e-12, `chain cost = cell sum (trial ${trial})`);
  // brute force over simple chains on these small boards
  let best = Infinity;
  const seen = new Uint8Array(b.n);
  const dfs = (x, cost) => {
    if (cost >= best) return;
    if (b.onSide(x, 'R')) { best = cost; return; }
    for (const y of b.nbrs[x]) if (!b.holes[y] && !seen[y]) { seen[y] = 1; dfs(y, cost + w[y]); seen[y] = 0; }
  };
  for (const s0 of b.side('L')) { seen[s0] = 1; dfs(s0, w[s0]); seen[s0] = 0; }
  ok(Math.abs(best - s.len) < 1e-12, `Dijkstra = brute force (trial ${trial}): ${s.len} vs ${best}`);
}

// ── exact values on full boards: every left–right chain has ≥ nc cells and the nr rows are disjoint
//    left–right chains, so Mod_LR = nr/nc; the nc columns are disjoint top–bottom chains, so Mod_TB = nc/nr ──
for (const nc of [4, 7, 10, 16]) for (const aspect of [0.45, 1, 1.4]) {
  const b = new HexBoard(nc, aspect);
  const lr = new MinNormSolver(b, 'L', 'R').solve();
  const exact = b.nr / b.nc;
  ok(lr.converged, `converged ${b.nr}×${nc}`);
  ok(lr.lower <= exact * (1 + 1e-12) && exact <= lr.upper * (1 + 1e-12), `certified bounds contain Mod_LR = nr/nc on ${b.nr}×${nc}: [${lr.lower}, ${lr.upper}] ∋ ${exact}`);
  const tb = new MinNormSolver(b, 'T', 'B', TB_OPTS).solve();
  ok(tb.lower <= b.nc / b.nr * (1 + 1e-12) && b.nc / b.nr <= tb.upper * (1 + 1e-12), `certified bounds contain Mod_TB = nc/nr on ${b.nr}×${nc}`);
}

// ── channels: only some rows live, separated by walls: Mod_LR = (#rows)/nc ──
for (const [nc, live] of [[6, [1]], [9, [0, 2]], [8, [1, 3, 5]]]) {
  const b = new HexBoard(nc, 1.2);
  for (let i = 0; i < b.n; i++) if (!live.includes(b.row(i))) b.holes[i] = 1;
  const lr = new MinNormSolver(b, 'L', 'R').solve();
  const exact = live.length / nc;
  ok(lr.lower <= exact * (1 + 1e-12) && exact <= lr.upper * (1 + 1e-12), `channels ${live} on nc=${nc}: Mod_LR = ${exact}`);
}

// ── tiny boards with holes: compare with an independent solve over ALL left–right chains (enumerated),
//    minimizing ‖Σ λ_v v‖² over the simplex by accelerated projected gradient ──
function enumerateChains(b, from, to) {
  const out = new Map(), seen = new Uint8Array(b.n), path = [];
  const dfs = (x) => {
    if (b.onSide(x, to)) { const k = path.slice().sort((p, q) => p - q); out.set(k.join(','), k); return; }
    for (const y of b.nbrs[x]) if (!b.holes[y] && !seen[y] && !b.onSide(y, from)) { seen[y] = 1; path.push(y); dfs(y); path.pop(); seen[y] = 0; }
  };
  for (const s of b.side(from)) { seen[s] = 1; path.push(s); dfs(s); path.pop(); seen[s] = 0; }
  return [...out.values()];
}
function projSimplex(y) {
  const u = Array.from(y).sort((a, b) => b - a);
  let css = 0, theta = 0;
  for (let i = 0; i < u.length; i++) { css += u[i]; const t = (css - 1) / (i + 1); if (u[i] - t > 0) theta = t; }
  return y.map((v) => Math.max(0, v - theta));
}
function minNormBrute(b, chains) {
  const k = chains.length, n = b.n;
  const Pof = (lam) => { const P = new Float64Array(n); chains.forEach((c, j) => { for (const x of c) P[x] += lam[j]; }); return P; };
  let maxLen = 0; for (const c of chains) maxLen = Math.max(maxLen, c.length);
  const L = 2 * maxLen * k;                      // a Lipschitz bound for the gradient 2 Vᵀ V λ
  let lam = new Float64Array(k).fill(1 / k), yv = lam.slice(), tk = 1;
  for (let it = 0; it < 30000; it++) {
    const P = Pof(yv);
    const g = chains.map((c) => 2 * c.reduce((a, x) => a + P[x], 0));
    const next = Float64Array.from(projSimplex(yv.map((v, j) => v - g[j] / L)));
    const t2 = (1 + Math.sqrt(1 + 4 * tk * tk)) / 2;
    yv = next.map((v, j) => v + ((tk - 1) / t2) * (v - lam[j]));
    lam = next; tk = t2;
  }
  const P = Pof(lam);
  return P.reduce((a, x) => a + x * x, 0);
}
let tinyChecked = 0;
for (let trial = 0; trial < 40 && tinyChecked < 14; trial++) {
  const b = new HexBoard(3 + (trial % 2), 0.7 + 0.5 * rnd());
  for (let i = 0; i < b.n; i++) if (rnd() < 0.18) b.holes[i] = 1;
  const chains = enumerateChains(b, 'L', 'R');
  if (!chains.length || chains.length > 400) continue;
  tinyChecked++;
  const n2 = minNormBrute(b, chains);
  const lr = new MinNormSolver(b, 'L', 'R', { tol: 1e-9, maxIter: 20000 }).solve();
  ok(Math.abs(lr.n2 - n2) <= 1e-6 * n2, `least norm ‖P‖² by Frank–Wolfe ${lr.n2} vs enumeration ${n2} (${b.nr}×${b.nc}, ${chains.length} chains)`);
  const exact = 1 / n2;
  ok(lr.lower <= exact * (1 + 1e-6) && exact <= lr.upper * (1 + 1e-6), `certified bounds contain the enumerated Mod_LR (${b.nr}×${b.nc})`);
}
ok(tinyChecked >= 10, `enough tiny boards checked (${tinyChecked})`);

// ── the checks of Lemma 3.3 on random boards with walls, at early iterates and at convergence ──
for (let trial = 0; trial < 120; trial++) {
  const b = randomBoard(13, 0.08 + 0.15 * rnd());
  const lr = new MinNormSolver(b, 'L', 'R');
  if (lr.empty) { ok(!cheapest(b, new Float64Array(b.n).fill(1), 'L', 'R'), `empty ⇔ no crossing (trial ${trial})`); continue; }
  let bAlways = true, inHull = true, nonneg = true, sumOk = true;
  for (let it = 0; !lr.done; it++) {
    if (it % 7 === 0) {
      const ck = dualChecks(lr);
      if (!ck.bOk) bAlways = false;                     // (b) holds at EVERY iterate: P is a convex combination
      if (lr.lower > lr.upper * (1 + 1e-12)) inHull = false;
      // P is the convex combination of its atoms
      const Q = new Float64Array(b.n); let lamSum = 0;
      for (const a of lr.atoms.values()) { lamSum += a.lam; for (const c of a.cells) Q[c] += a.lam; }
      if (Math.abs(lamSum - 1) > 1e-9 || Q.some((q, i) => Math.abs(q - lr.P[i]) > 1e-9)) inHull = false;
      if (lr.P.some((x) => x < 0)) nonneg = false;
      if (lr.P.reduce((a, x) => a + x, 0) < 1 - 1e-9) sumOk = false;
    }
    lr.step();
  }
  ok(bAlways, `(b) cheapest top–bottom cost under ρ = P is ≥ 1 at every iterate (trial ${trial})`);
  ok(inHull, `P stays in the hull, lower ≤ upper (trial ${trial})`);
  ok(nonneg && sumOk, `P ≥ 0 with Σ P ≥ 1 (trial ${trial})`);
  ok(lr.converged, `converged (trial ${trial}, ${b.nr}×${b.nc}, ${lr.iter} steps)`);
  const ck = dualChecks(lr);
  ok(ck.aOk, `(a) P/‖P‖² admissible within the gap: ${ck.a} (trial ${trial})`);
  ok(ck.cOk && ck.cHi >= 1 - 1e-12, `(c) Σρ²·Mod_LR ∈ [1, ${ck.cHi}] (trial ${trial})`);
  ok(ck.shared.length >= 1, `the two cheapest crossings share a cell (trial ${trial})`);
  // Mod_TB ≤ Σρ² = 1/Mod_LR (3.2): the top–bottom solver's certified lower bound never exceeds it
  const tb = new MinNormSolver(b, 'T', 'B', TB_OPTS).solve();
  if (!tb.empty) ok(tb.lower <= lr.n2 * (1 + 1e-12), `(3.2) Mod_TB ≥ ${tb.lower} ≤ Σρ² = ${lr.n2} (trial ${trial})`);
}

// ── the figure's presets converge, and every check is ✓ ──
for (const shape of Object.keys(SHAPES)) for (const nc of [8, 16, 24]) {
  const b = makeBoard(shape, nc);
  const lr = new MinNormSolver(b, 'L', 'R').solve();
  const ck = dualChecks(lr);
  ok(lr.converged && ck.aOk && ck.bOk && ck.cOk, `preset ${shape} at ${nc} columns: (a)(b)(c) ✓`);
  const tb = new MinNormSolver(b, 'T', 'B', TB_OPTS).solve();
  ok(tb.lower <= lr.n2, `preset ${shape} at ${nc} columns: (3.2) ✓`);
  if (!SHAPES[shape].hole) ok(Math.abs(lr.mod * tb.mod - 1) < 4e-3, `full board ${shape}: Mod_LR·Mod_TB = 1 (${lr.mod * tb.mod})`);
  else ok(lr.mod * tb.upper < 0.9, `walled board ${shape}: Mod_LR·Mod_TB < 1 strictly (${lr.mod * tb.upper})`);
}
// painted edits survive a mesh change (stored as points of the unit square)
{
  const edits = [{ u: 0.5, v: 0.5, cut: true }, { u: 0.2, v: 0.3, cut: true }, { u: 0.2, v: 0.3, cut: false }];
  for (const nc of [8, 13, 20]) {
    const b = makeBoard('square', nc, edits);
    ok(b.holes.reduce((a, x) => a + x, 0) === 1 && b.holes[b.nearest(0.5, 0.5)] === 1, `edits replay at nc=${nc}`);
  }
}
void shortestChain;

console.log(`fig-modulus: ${passes} passed, ${fails} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fails ? 1 : 0);
