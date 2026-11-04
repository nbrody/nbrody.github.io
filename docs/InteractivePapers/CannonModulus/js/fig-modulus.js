// Figure 4 — Lemma 3.3 (crossing dual weights), run as an algorithm on a hexagonal board.
// P = the least-norm point of the convex hull of left–right crossing incidence vectors, found by
// pairwise Frank–Wolfe with a cheapest-crossing oracle (node-weighted Dijkstra). Then
// Mod_LR = ‖P‖⁻², P/‖P‖² is admissible for left–right crossings, and ρ = P is admissible for
// top–bottom crossings because on a Hex board every top–bottom chain meets every left–right one
// (Lemma 3.2(i)). Hence Mod_TB ≤ Σρ² = 1/Mod_LR, which is (3.2) with C = 1.
import {
  el, makeCanvas, chips, slider, button, controls, setTex, palette, onTheme, pointer,
  rgba, mix, ramp, Heap,
} from './common.js';

const SQ3 = Math.sqrt(3);

// ───────────────────────── pure math (node-testable) ─────────────────────────

/**
 * A hexagonal board: nr rows of nc pointy-top hexagons, odd rows shifted half a cell right, so two
 * cells meet along an edge or not at all (the Hex property). `hole(u, v)` removes cells whose centre
 * (u across, v down, both in [0, 1]) it accepts. Cells are numbered i = r·nc + c.
 */
export class HexBoard {
  constructor(nc, aspect = 1, hole = null) {
    this.nc = nc;
    this.nr = Math.max(3, Math.round((aspect * SQ3 * (nc + 0.5) - 0.5) / 1.5));
    this.n = this.nr * this.nc;
    this.Wb = SQ3 * (this.nc + 0.5);          // board width, in hexagon circumradii
    this.Hb = 1.5 * (this.nr - 1) + 2;        // board height
    this.holes = new Uint8Array(this.n);
    this.nbrs = [];
    this.u = new Float64Array(this.n); this.v = new Float64Array(this.n);
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) {
      const i = r * this.nc + c, odd = r & 1, list = [];
      const cand = odd
        ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
        : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
      for (const [rr, cc] of cand) if (rr >= 0 && rr < this.nr && cc >= 0 && cc < this.nc) list.push(rr * this.nc + cc);
      this.nbrs.push(list);
      this.u[i] = (SQ3 * (c + 0.5 + 0.5 * odd)) / this.Wb;
      this.v[i] = (1 + 1.5 * r) / this.Hb;
      if (hole && hole(this.u[i], this.v[i])) this.holes[i] = 1;
    }
  }
  row(i) { return (i / this.nc) | 0; }
  col(i) { return i % this.nc; }
  /** Is cell i on side 'L' | 'R' | 'T' | 'B' (holes included)? */
  onSide(i, s) {
    const r = this.row(i), c = this.col(i);
    return (s === 'L' && c === 0) || (s === 'R' && c === this.nc - 1) || (s === 'T' && r === 0) || (s === 'B' && r === this.nr - 1);
  }
  /** The live cells on a side. */
  side(s) {
    const out = [];
    for (let i = 0; i < this.n; i++) if (!this.holes[i] && this.onSide(i, s)) out.push(i);
    return out;
  }
  /** The nearest cell to a point (u, v) of the unit square, by centre distance in board units. */
  nearest(u, v) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const du = (this.u[i] - u) * this.Wb, dv = (this.v[i] - v) * this.Hb, d = du * du + dv * dv;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
}

/** Shapes. Each is { aspect (height/width), hole(u, v) }. */
export const SHAPES = {
  square: { aspect: 1, hole: null },
  long: { aspect: 0.45, hole: null },
  neck: { aspect: 0.8, hole: (u, v) => Math.abs(u - 0.5) < 0.17 && Math.abs(v - 0.5) > 0.075 },
  gap: { aspect: 0.85, hole: (u, v) => Math.abs(u - 0.5) < 0.035 && Math.abs(v - 0.5) > 0.07 },
};

/** Build the board for a shape at a mesh, then apply painted edits [{ u, v, cut }] in order. */
export function makeBoard(shape, nc, edits = []) {
  const S = SHAPES[shape] || SHAPES.square;
  const b = new HexBoard(nc, S.aspect, S.hole);
  for (const e of edits) { const i = b.nearest(e.u, e.v); if (i >= 0) b.holes[i] = e.cut ? 1 : 0; }
  return b;
}

/**
 * Cheapest chain (node weights w ≥ 0; a chain costs the sum over its cells) from any source cell to a
 * target cell, avoiding holes. Returns { len, cells } (cells from target back to source) or null.
 */
export function shortestChain(board, w, sources, isTarget, heap, dist, prev) {
  dist.fill(Infinity); prev.fill(-1); heap.clear();
  for (const s of sources) if (w[s] < dist[s]) { dist[s] = w[s]; heap.push(w[s], s); }
  while (heap.n) {
    const u = heap.pop(), d = heap.lastKey;
    if (d > dist[u]) continue;
    if (isTarget[u]) {
      const cells = [];
      for (let x = u; x !== -1; x = prev[x]) cells.push(x);
      return { len: d, cells };
    }
    for (const x of board.nbrs[u]) {
      if (board.holes[x]) continue;
      const nd = d + w[x];
      if (nd < dist[x]) { dist[x] = nd; prev[x] = u; heap.push(nd, x); }
    }
  }
  return null;
}

/** A cheapest crossing between two sides under weights w (fresh buffers). */
export function cheapest(board, w, from, to) {
  const isT = new Uint8Array(board.n);
  for (const t of board.side(to)) isT[t] = 1;
  return shortestChain(board, w, board.side(from), isT, new Heap(4 * board.n + 16), new Float64Array(board.n), new Int32Array(board.n));
}

/**
 * Pairwise Frank–Wolfe for min ‖P‖² over the convex hull of the incidence vectors of crossings from
 * side `from` to side `to`. P is kept as an explicit convex combination of crossings (atoms), so
 * every iterate lies in the hull. Bounds at the iterate, with m = cheapest crossing cost under P:
 *   Mod ≥ 1/‖P‖²   (any admissible ω has ⟨ω, P⟩ ≥ 1, then Cauchy–Schwarz)
 *   Mod ≤ ‖P‖²/m²  (P/m is admissible).
 */
export class MinNormSolver {
  constructor(board, from = 'L', to = 'R', { tol = 1e-3, maxIter = 6000 } = {}) {
    this.b = board; this.from = from; this.to = to; this.tol = tol; this.maxIter = maxIter;
    this.sources = board.side(from);
    this.isTarget = new Uint8Array(board.n);
    for (const t of board.side(to)) this.isTarget[t] = 1;
    this.heap = new Heap(4 * board.n + 16);
    this.dist = new Float64Array(board.n);
    this.prev = new Int32Array(board.n);
    this.P = new Float64Array(board.n);
    this.atoms = new Map();
    this.stamp = new Int32Array(board.n);
    this.tick = 0; this.iter = 0; this.done = false; this.empty = false; this.converged = false;
    const ones = new Float64Array(board.n).fill(1);
    const first = shortestChain(board, ones, this.sources, this.isTarget, this.heap, this.dist, this.prev);
    if (!first) { this.empty = true; this.done = true; this.lower = 0; this.upper = 0; this.n2 = Infinity; this.m = Infinity; this.s = null; return; }
    this.addAtom(first.cells, 1);
    for (const c of first.cells) this.P[c] = 1;
    this.measure();
  }
  key(cells) { return cells.slice().sort((a, b) => a - b).join(','); }
  addAtom(cells, lam) {
    const k = this.key(cells);
    const a = this.atoms.get(k);
    if (a) { a.lam += lam; return a; }
    const atom = { cells: Int32Array.from(cells), lam, k };
    this.atoms.set(k, atom);
    return atom;
  }
  norm2() { let s = 0; for (let i = 0; i < this.P.length; i++) s += this.P[i] * this.P[i]; return s; }
  /** Cheapest crossing under the current P, and the certified bounds. */
  measure() {
    this.s = shortestChain(this.b, this.P, this.sources, this.isTarget, this.heap, this.dist, this.prev);
    this.m = this.s.len;
    this.n2 = this.norm2();
    this.lower = 1 / this.n2;
    this.upper = this.n2 / (this.m * this.m);
    if (this.upper / this.lower - 1 <= this.tol) { this.converged = true; this.done = true; }
  }
  /** Relative width of the certified interval: upper/lower − 1 = ‖P‖⁴/m² − 1. */
  get gap() { return this.empty ? 0 : this.upper / this.lower - 1; }
  step() {
    if (this.done) return;
    const s = this.s, m = this.m;
    let away = null, gA = -Infinity;
    for (const a of this.atoms.values()) {
      let g = 0; for (const c of a.cells) g += this.P[c];
      if (g > gA) { gA = g; away = a; }
    }
    this.iter++;
    if (gA - m <= 1e-13 * Math.max(1, gA)) { this.converged = true; this.done = true; return; }
    this.tick++;
    for (const c of s.cells) this.stamp[c] = this.tick;
    let inter = 0; for (const c of away.cells) if (this.stamp[c] === this.tick) inter++;
    const d2 = s.cells.length + away.cells.length - 2 * inter;
    if (d2 <= 0) { this.done = true; return; }
    const gamma = Math.min(away.lam, (gA - m) / d2);
    for (const c of s.cells) this.P[c] += gamma;
    for (const c of away.cells) this.P[c] -= gamma;
    this.addAtom(s.cells, gamma);
    away.lam -= gamma;
    if (away.lam <= 1e-15) this.atoms.delete(away.k);
    for (const c of away.cells) if (this.P[c] < 0 && this.P[c] > -1e-15) this.P[c] = 0;
    this.measure();
    if (this.iter >= this.maxIter) this.done = true;
  }
  /** Run to convergence (synchronously). */
  solve() { while (!this.done) this.step(); return this; }
  /** Mod as a point value (the bounds' geometric mean). */
  get mod() { return this.empty ? 0 : Math.sqrt(this.lower * this.upper); }
}

/**
 * The checks of Lemma 3.3 at an iterate P of the left–right solver:
 *  (a) cheapest left–right cost under P/‖P‖² is m/‖P‖² (≤ 1 always, → 1; ≥ 1 − gap at convergence);
 *  (b) cheapest top–bottom cost under ρ = P is ≥ 1 (exact at every iterate, by Lemma 3.2(i));
 *  (c) Σρ² · Mod_LR ∈ [1, ‖P‖⁴/m²], so Mod_TB ≤ Σρ² = 1/Mod_LR, which is (3.2).
 */
export function dualChecks(lr, tol = 1e-3) {
  if (lr.empty) return null;
  const tb = cheapest(lr.b, lr.P, 'T', 'B');
  const a = lr.m / lr.n2;
  const cHi = lr.n2 * lr.upper;          // Σρ²·Mod_LR ≤ ‖P‖²·(‖P‖²/m²)
  let shared = [];
  if (tb && lr.s) { const onLR = new Set(lr.s.cells); shared = tb.cells.filter((c) => onLR.has(c)); }
  return {
    a, aOk: a >= 1 - tol,
    tbCost: tb ? tb.len : Infinity, tbCells: tb ? tb.cells : null, bOk: !tb || tb.len >= 1 - 1e-9,
    cLo: 1, cHi, cOk: cHi - 1 <= 2 * tol,
    shared,
    energy: lr.n2,
  };
}

/** Every chain from side `from` to side `to` must meet `blockCells`: is there one that avoids them? */
export function avoids(board, blockCells, from, to) {
  const block = new Uint8Array(board.n);
  for (const c of blockCells) block[c] = 1;
  const seen = new Uint8Array(board.n), q = [];
  for (const s of board.side(from)) if (!block[s]) { seen[s] = 1; q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const x = q[h];
    if (board.onSide(x, to)) return true;
    for (const y of board.nbrs[x]) if (!board.holes[y] && !block[y] && !seen[y]) { seen[y] = 1; q.push(y); }
  }
  return false;
}

// The top–bottom solver only supplies a lower bound 1/‖P_TB‖² for Mod_TB (the upper bound is Σρ² from
// (b)); its many tied zigzag crossings make Frank–Wolfe slow to certify, so it stops at a looser gap.
export const TB_OPTS = { tol: 2e-3, maxIter: 3000 };

/** Round down / up to d decimals, so a printed interval still contains the certified one. */
const down = (x, d = 4) => (Math.floor(x * 10 ** d) / 10 ** d).toFixed(d);
const up = (x, d = 4) => (Math.ceil(x * 10 ** d) / 10 ** d).toFixed(d);

/** chunked() with the slices scheduled by MessageChannel instead of requestAnimationFrame: Frank–Wolfe
 *  keeps its pace (and the readout reaches ✓) even where frames are throttled, as in hidden panes. */
function slices(fn, budget = 8) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      const t = performance.now();
      while (performance.now() - t < budget) if (fn()) { ch.port1.close(); resolve(); return; }
      ch.port2.postMessage(0);
    };
    ch.port2.postMessage(0);
  });
}

// ───────────────────────── the figure ─────────────────────────

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = {
    shape: 'gap', nc: 16, edits: [],
    board: null, lr: null, tb: null, checks: null,
    paused: false, slow: 0, token: 0, running: false,
  };

  // the board's own shape, plus room for the side bars
  const cv = makeCanvas(left, { aspect: (w) => (st.board ? ((st.board.Hb / st.board.Wb) * (w - 52) + 52) / w : 0.8), maxHeight: 520, minHeight: 200, draw });
  const legend = el('div', { class: 'hint' });
  left.append(legend);

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  chips(ctl, {
    label: 'Board',
    options: [['gap', 'wall with a gap'], ['neck', 'narrow neck'], ['square', 'square'], ['long', 'long']],
    value: st.shape,
    onchange: (k) => { st.shape = k; st.edits = []; rebuild(); },
  });
  slider(ctl, { label: 'columns', min: 8, max: 24, step: 1, value: st.nc, fmt: (v) => v, oninput: (v) => { st.nc = v; rebuild(); } });
  const btns = el('div', { class: 'btn-row' });
  ctl.append(btns);
  const runBtn = button(btns, 'Pause', () => { if (st.lr && st.lr.done && st.tb && st.tb.done) return; st.paused = !st.paused; syncRun(); if (!st.paused) run(); });
  button(btns, 'Step', () => { st.paused = true; syncRun(); stepOnce(); }, 'ghost');
  button(btns, 'Replay', () => { rebuild({ slow: 90 }); }, 'ghost');
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro, el('div', { class: 'hint', html: 'Drag across the board to cut cells out or put them back.' }));

  function syncRun() {
    const finished = st.lr && st.lr.done && st.tb && st.tb.done;
    setTex(runBtn, finished ? 'Converged' : st.paused ? 'Run' : 'Pause');
    runBtn.disabled = !!finished;
  }

  function rebuild(opts = {}) {
    st.token++;
    st.board = makeBoard(st.shape, st.nc, st.edits);
    st.lr = new MinNormSolver(st.board, 'L', 'R');
    st.tb = new MinNormSolver(st.board, 'T', 'B', TB_OPTS);
    st.checks = dualChecks(st.lr);
    st.slow = opts.slow || 0;
    st.paused = false;
    syncRun();
    cv.resize(); cv.redraw();
    run();
  }

  function stepOnce() {
    if (!st.lr.done) st.lr.step();
    else if (!st.tb.done) st.tb.step();
    st.checks = dualChecks(st.lr);
    syncRun();
    cv.redraw();
  }

  // Fast phase: 8 ms slices, redrawing every ~50 ms. Slow phase (Replay): one step per frame.
  function run() {
    const token = st.token;
    if (st.slow > 0) {
      const frame = () => {
        if (token !== st.token || st.paused) return;
        if (st.slow-- > 0 && !st.lr.done) { st.lr.step(); st.checks = dualChecks(st.lr); cv.redraw(); requestAnimationFrame(frame); }
        else { st.slow = 0; run(); }
      };
      requestAnimationFrame(frame);
      return;
    }
    let last = performance.now();
    slices(() => {
      if (token !== st.token || st.paused) return true;
      if (!st.lr.done) st.lr.step();
      else if (!st.tb.done) st.tb.step();
      const finished = st.lr.done && st.tb.done;
      if (finished || performance.now() - last > 50) {
        last = performance.now();
        st.checks = dualChecks(st.lr);
        cv.redraw();
        if (finished) syncRun();
      }
      return finished;
    }, 8);
  }

  // ---- drawing ----
  let lay = null;
  const centre = (i) => [lay.ox + st.board.u[i] * st.board.Wb * lay.s, lay.oy + st.board.v[i] * st.board.Hb * lay.s];
  function hexPath(ctx, x, y, s) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function draw(ctx, w, h) {
    const b = st.board;
    if (!b) return;
    const P = palette();
    const padX = 26, padTop = 26, padBot = 26;
    const s = Math.min((w - 2 * padX) / b.Wb, (h - padTop - padBot) / b.Hb);
    const ox = (w - s * b.Wb) / 2, oy = padTop + (h - padTop - padBot - s * b.Hb) / 2;
    lay = { s, ox, oy };
    const lr = st.lr, ck = st.checks;
    let vmax = 0;
    if (!lr.empty) for (let i = 0; i < b.n; i++) if (lr.P[i] > vmax) vmax = lr.P[i];
    const stops = P.dark
      ? [P.surface, mix(P.surface, P.mu, 0.3), mix(P.surface, P.mu, 0.7), mix(P.mu, '#ffffff', 0.3)]
      : [P.surface, mix(P.surface, P.mu, 0.22), mix(P.surface, P.mu, 0.62), mix(P.mu, '#000000', 0.18)];
    const wall = mix(P.bg, P.mesh, P.dark ? 0.45 : 0.55);
    for (let i = 0; i < b.n; i++) {
      const [x, y] = centre(i);
      hexPath(ctx, x, y, s * 0.99);
      ctx.fillStyle = b.holes[i] ? wall : ramp(stops, vmax > 0 ? Math.sqrt(lr.P[i] / vmax) : 0);
      ctx.fill();
      ctx.strokeStyle = rgba(P.mesh, b.holes[i] ? 0.5 : 0.28);
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    // the four sides: left/right in the crossing colour, top/bottom in the partner colour
    const W = b.Wb * s, H = b.Hb * s;
    ctx.lineCap = 'round'; ctx.lineWidth = 4;
    ctx.strokeStyle = P.u;
    ctx.beginPath(); ctx.moveTo(ox - 9, oy + 0.5 * s); ctx.lineTo(ox - 9, oy + H - 0.5 * s); ctx.moveTo(ox + W + 9, oy + 0.5 * s); ctx.lineTo(ox + W + 9, oy + H - 0.5 * s); ctx.stroke();
    ctx.strokeStyle = P.w;
    ctx.beginPath(); ctx.moveTo(ox + 0.5 * s, oy - 9); ctx.lineTo(ox + W - 0.5 * s, oy - 9); ctx.moveTo(ox + 0.5 * s, oy + H + 9); ctx.lineTo(ox + W - 0.5 * s, oy + H + 9); ctx.stroke();

    const chain = (cells, color, width) => {
      if (!cells || !cells.length) return;
      const path = () => { ctx.beginPath(); cells.forEach((c, k) => { const [x, y] = centre(c); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      path(); ctx.strokeStyle = rgba(P.surface, 0.9); ctx.lineWidth = width + 3; ctx.stroke();
      path(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      for (const c of [cells[0], cells[cells.length - 1]]) {
        const [x, y] = centre(c);
        ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, width * 0.9), 0, 2 * Math.PI);
        ctx.fillStyle = color; ctx.fill();
      }
    };
    const lw = Math.max(2, Math.min(3.5, s * 0.32));
    if (ck && ck.tbCells) chain(ck.tbCells, P.w, lw);
    if (!lr.empty && lr.s) chain(lr.s.cells, P.u, lw);
    // where they meet: Lemma 3.2(i) on the board
    if (ck) for (const c of ck.shared) {
      const [x, y] = centre(c);
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, s * 0.62), 0, 2 * Math.PI);
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.6; ctx.stroke();
    }
    readout();
  }

  function setLegend() {
    const item = (html) => `<span style="white-space:nowrap">${html}</span>`;
    setTex(legend, [
      item('<span style="color:var(--c-mu)">■</span> $P_q$ (square-root scale)'),
      item('<span style="color:var(--c-u)">━</span> cheapest left–right crossing under $P$'),
      item('<span style="color:var(--c-w)">━</span> cheapest top–bottom crossing under $\\rho=P$'),
      item('○ a cell they share'),
      item('<span style="color:var(--c-mesh)">■</span> walls'),
    ].join(' &nbsp; '));
  }
  setLegend();

  // The readout: rows with typeset labels are built once per kind; values are plain numbers and marks,
  // updated without MathJax, so the table can follow Frank–Wolfe live.
  const status = el('div', { class: 'dim', style: 'margin-bottom:.3rem' });
  const table = el('div');
  ro.append(status, table);
  let kind = null;
  const cells = {};
  function build(k, rows) {
    if (kind === k) return;
    kind = k;
    setTex(table, '<table>' + rows.map(([key, lab, cls = '']) => (key
      ? `<tr class="${cls}"><td>${lab}</td><td class="num" data-k="${key}" style="white-space:nowrap"></td></tr>`
      : `<tr class="${cls}"><td colspan="2" class="dim">${lab}</td></tr>`)).join('') + '</table>');
    for (const td of table.querySelectorAll('[data-k]')) cells[td.dataset.k] = td;
  }
  const put = (k, html) => { if (cells[k] && cells[k].innerHTML !== html) cells[k].innerHTML = html; };
  const mark = (ok) => (ok === null ? '<span class="dim">…</span>' : ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');

  function readout() {
    const lr = st.lr, tb = st.tb, ck = st.checks;
    if (!lr) return;
    const live = st.board.n - st.board.holes.reduce((a, x) => a + x, 0);
    if (lr.empty) {
      status.textContent = `${live} cells.`;
      build('empty', [[null, 'No left–right crossing: the walls cut the board, so $\\mathrm{Mod}_{LR}=0$ and there is nothing to dualize.']]);
      return;
    }
    build('full', [
      ['lo', '$\\mathrm{Mod}_{LR}\\ge1/\\|P\\|^2$'],
      ['hi', '$\\mathrm{Mod}_{LR}\\le\\|P\\|^2/m^2$'],
      ['a', '(a) cheapest left–right cost under $P/\\|P\\|^2$, tending to $1$', 'sep'],
      ['b', '(b) cheapest top–bottom cost under $\\rho=P$, at least $1$'],
      ['c', '(c) $1\\le\\sum\\rho^2\\cdot\\mathrm{Mod}_{LR}\\le$'],
      ['tb', '$\\mathrm{Mod}_{TB}\\ge1/\\|P_{TB}\\|^2$, by its own Frank–Wolfe', 'sep'],
      ['e', '(3.2): $\\mathrm{Mod}_{TB}\\le1/\\mathrm{Mod}_{LR}=\\sum\\rho^2=$'],
      ['prod', '$\\mathrm{Mod}_{LR}\\cdot\\mathrm{Mod}_{TB}$'],
    ]);
    const state = lr.done ? (lr.converged ? 'converged' : 'stopped') : (st.paused ? 'paused' : 'running…');
    const tbState = lr.done && !tb.empty ? (tb.done ? '' : st.paused ? '' : ' · top–bottom solver running…') : '';
    status.textContent = `${live} cells · ${lr.iter} Frank–Wolfe steps · ${state} · support of ${lr.atoms.size} crossing${lr.atoms.size === 1 ? '' : 's'}${tbState}`;
    const pending = !lr.done;
    const tbHi = tb.empty ? 0 : Math.min(tb.upper, ck.energy);
    const tbOk = tb.empty ? true : tb.done ? tb.lower <= ck.energy * (1 + 1e-12) : null;
    put('lo', down(lr.lower));
    put('hi', up(lr.upper));
    put('a', `${ck.a.toFixed(4)} ${mark(pending ? null : ck.aOk)}`);
    put('b', `${ck.tbCost.toFixed(4)} ${mark(ck.bOk)}`);
    put('c', `${up(ck.cHi)} ${mark(pending ? null : ck.cOk)}`);
    put('tb', tb.empty ? '0' : down(tb.lower, 3));
    put('e', `${up(ck.energy, 3)} ${mark(tbOk)}`);
    put('prod', tbOk === null ? mark(null) : (lr.mod * tbHi).toFixed(3));
  }

  // painting: cut or restore cells (stored as points of the unit square, so they survive a mesh change)
  let paintCut = true, lastCell = -1, pendingRebuild = null;
  const cellAt = (x, y) => {
    if (!lay || !st.board) return -1;
    const b = st.board, u = (x - lay.ox) / (b.Wb * lay.s), v = (y - lay.oy) / (b.Hb * lay.s);
    if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) return -1;
    const i = b.nearest(u, v);
    const [cx, cy] = centre(i);
    return Math.hypot(cx - x, cy - y) <= lay.s ? i : -1;
  };
  const paint = (i) => {
    if (i < 0 || i === lastCell) return;
    lastCell = i;
    const b = st.board;
    if (!!b.holes[i] === paintCut) return;
    st.token++;
    b.holes[i] = paintCut ? 1 : 0;
    st.edits.push({ u: b.u[i], v: b.v[i], cut: paintCut });
    if (!pendingRebuild) pendingRebuild = setTimeout(() => { pendingRebuild = null; rebuild(); }, 70);
    cv.redraw();
  };
  pointer(cv.wrap, {
    down(x, y) { const i = cellAt(x, y); if (i < 0) return false; paintCut = !st.board.holes[i]; lastCell = -1; paint(i); return true; },
    move(x, y) { paint(cellAt(x, y)); },
    up() { lastCell = -1; },
  });

  onTheme(() => cv.redraw());
  rebuild();
}
