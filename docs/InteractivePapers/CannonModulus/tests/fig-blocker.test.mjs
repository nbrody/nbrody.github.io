// node tests/fig-blocker.test.mjs — Figure 3: Lemma 3.2(ii) by the labelling argument.
import { analyze, checks, lateralCrossing, presetGrid, rowsFor, remesh, rasterize, PRESETS, rng } from '../js/fig-blocker.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const t0 = Date.now();

/** Independent: is there an edge-adjacent chain of unmarked squares from the top row to the bottom row? */
function unmarkedChain(rows, cols, m) {
  const seen = new Uint8Array(rows * cols), st = [];
  for (let c = 0; c < cols; c++) if (!m[c]) { seen[c] = 1; st.push(c); }
  while (st.length) {
    const u = st.pop(), r = (u / cols) | 0, c = u % cols;
    if (r === rows - 1) return true;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const v = rr * cols + cc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && !m[v] && !seen[v]) { seen[v] = 1; st.push(v); }
    }
  }
  return false;
}

const R = rng(20261103);
let nBlock = 0, nOpen = 0;
for (let trial = 0; trial < 3000; trial++) {
  const rows = 2 + Math.floor(R() * 16), cols = 2 + Math.floor(R() * 20);
  const p = 0.25 + 0.5 * R();
  const m = new Uint8Array(rows * cols);
  for (let i = 0; i < m.length; i++) m[i] = R() < p ? 1 : 0;
  const res = analyze(rows, cols, m);
  const open = unmarkedChain(rows, cols, m);
  ok(res.blocks === !open, `blocking agrees with an independent search (trial ${trial})`);
  if (!res.blocks) {
    nOpen++;
    const ch = res.chain;
    let valid = ch.length > 0 && ch[0] < cols && ((ch[ch.length - 1] / cols) | 0) === rows - 1 && ch.every((i) => !m[i]);
    for (let k = 1; k < ch.length; k++) {
      const a = ch[k - 1], b = ch[k], dr = Math.abs(((a / cols) | 0) - ((b / cols) | 0)), dc = Math.abs((a % cols) - (b % cols));
      if (dr + dc !== 1) valid = false;
    }
    ok(valid, `not blocking ⇒ a valid unmarked top-to-bottom chain (trial ${trial})`);
    ok(lateralCrossing(rows, cols, m) === null, `not blocking ⇒ no corner-connected lateral crossing in K, Lemma 3.2(i) (trial ${trial})`);
    ok(checks(rows, cols, m, res) === null, `no checks when not blocking (trial ${trial})`);
    continue;
  }
  nBlock++;
  const ck = checks(rows, cols, m, res);
  ok(ck.leftOdd && ck.rightOdd, `blocking ⇒ odd ends on both lateral sides: ${res.leftEnds}, ${res.rightEnds} (trial ${trial})`);
  ok(ck.evenInterior, `interior vertices have even degree (trial ${trial})`);
  ok(ck.noTopBottom, `no ends on the top or bottom (trial ${trial})`);
  ok(ck.joined, `some interface component joins the lateral sides (trial ${trial})`);
  ok(ck.inK, `its B squares are marked, none appended (trial ${trial})`);
  ok(ck.corner && ck.lateral, `successive B squares meet at a corner, left column to right (trial ${trial})`);
  ok(ck.all, `all checks (trial ${trial})`);
  // the path is a path: consecutive edges share a vertex, it starts on the left and ends on the right
  const E = res.edges, pe = res.pathEdges, VW = cols + 1;
  let pathOk = pe.length > 0;
  let cur = [E[pe[0]][0], E[pe[0]][1]].find((v) => v % VW === 0);
  if (cur === undefined) pathOk = false;
  for (const k of pe) {
    const [a, b] = E[k];
    if (a === cur) cur = b; else if (b === cur) cur = a; else { pathOk = false; break; }
  }
  ok(pathOk && cur % VW === cols, `the interface path runs from the left side to the right side (trial ${trial})`);
  // the parity argument: every component meeting only one lateral side has an even number of ends there
  const NV = (rows + 3) * VW, comp = new Int32Array(NV).fill(-1);
  const adj = Array.from({ length: NV }, () => []);
  for (const [a, b] of E) { adj[a].push(b); adj[b].push(a); }
  let nc = 0, parityOk = true;
  for (let v0 = 0; v0 < NV; v0++) {
    if (comp[v0] >= 0 || !adj[v0].length) continue;
    const st = [v0]; comp[v0] = nc; let le = 0, re = 0;
    while (st.length) { const u = st.pop(); if (u % VW === 0) le += adj[u].length; if (u % VW === cols) re += adj[u].length; for (const w of adj[u]) if (comp[w] < 0) { comp[w] = nc; st.push(w); } }
    if (le && !re && le % 2) parityOk = false;
    if (re && !le && re % 2) parityOk = false;
    nc++;
  }
  ok(parityOk, `components meeting one lateral side have an even number of ends there (trial ${trial})`);
  // and conversely the duality: K blocks ⇔ K contains a corner-connected lateral crossing
  ok(lateralCrossing(rows, cols, m) !== null, `blocking ⇒ a corner-connected lateral crossing exists (trial ${trial})`);
}
ok(nBlock > 500 && nOpen > 500, `both cases sampled: ${nBlock} blocking, ${nOpen} not`);

// presets: wavy, two walls and random block at every mesh with all checks ✓; the gap preset does not block
for (const cols of [12, 16, 24, 32]) {
  const rows = rowsFor(cols);
  for (const name of ['wavy', 'two', 'random']) {
    const m = presetGrid(name, cols, 7);
    const res = analyze(rows, cols, m);
    ok(res.blocks && checks(rows, cols, m, res).all, `preset ${name} at ${cols}×${rows} blocks and every check passes`);
  }
  const g = presetGrid('gap', cols);
  ok(!analyze(rows, cols, g).blocks, `preset gap at ${cols}×${rows} does not block`);
}
// the default shows more than one end on the left: the spur's interface has both ends there
{
  const m = presetGrid('wavy', 16), res = analyze(rowsFor(16), 16, m);
  ok(res.leftEnds === 3 && res.rightEnds === 1, `default: 3 ends on the left, 1 on the right (${res.leftEnds}, ${res.rightEnds})`);
}
// random blockers: different seeds differ, the same seed repeats
ok(presetGrid('random', 16, 3).join('') === presetGrid('random', 16, 3).join(''), 'random blocker is seeded');
ok(presetGrid('random', 16, 3).join('') !== presetGrid('random', 16, 4).join(''), 'different seeds differ');

// remeshing: refining by an integer factor is exact (a 2×2 block per square), and preserves blocking
for (let trial = 0; trial < 200; trial++) {
  const cols = [12, 16][trial % 2], rows = rowsFor(cols), m = new Uint8Array(rows * cols);
  for (let i = 0; i < m.length; i++) m[i] = R() < 0.5 ? 1 : 0;
  const f = remesh(m, cols, 2 * cols), c2 = 2 * cols;
  let exact = true;
  for (let r = 0; r < rowsFor(c2); r++) for (let c = 0; c < c2; c++) if (f[r * c2 + c] !== m[(r >> 1) * cols + (c >> 1)]) exact = false;
  ok(exact, `refinement ×2 is exact (trial ${trial})`);
  ok(analyze(rows, cols, m).blocks === analyze(rowsFor(c2), c2, f).blocks, `refinement preserves blocking (trial ${trial})`);
}
// rasterizing a curve marks the squares meeting it: a horizontal segment marks exactly one row
{
  const m = rasterize([{ pts: [[-0.01, 0.3 + 1 / 32], [1.01, 0.3 + 1 / 32]], r: 0.001 }], 12, 16);
  const rowsHit = new Set(); m.forEach((v, i) => v && rowsHit.add((i / 16) | 0));
  ok(rowsHit.size === 1 && m.reduce((a, v) => a + v, 0) === 16, 'a horizontal segment marks one full row');
}
void PRESETS;

console.log(`fig-blocker: ${passes} passed, ${fails} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fails ? 1 : 0);
