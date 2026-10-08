// Figure 2 — discrete 2-modulus on a hexagonal board, computed exactly as in the proof of Lemma 3.3:
// the minimum-norm point P of the convex hull of crossing incidence vectors (pairwise Frank–Wolfe).

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, fmt, ramp, rgba, Heap } from './common.js';

const SQ3 = Math.sqrt(3);

export class HexBoard {
  constructor(nc, aspect) {
    this.nc = nc;
    this.nr = Math.max(3, Math.round((aspect * SQ3 * (nc + 0.5) - 0.5) / 1.5));
    this.n = this.nr * this.nc;
    this.holes = new Uint8Array(this.n);
    const nb = [];
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) {
      const odd = r & 1, list = [];
      const cand = odd
        ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
        : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
      for (const [rr, cc] of cand) if (rr >= 0 && rr < this.nr && cc >= 0 && cc < this.nc) list.push(rr * this.nc + cc);
      nb.push(list);
    }
    this.nbrs = nb;
    // normalized centers in board units (width of board = 1)
    const Wb = SQ3 * (this.nc + 0.5), Hb = 1.5 * (this.nr - 1) + 2;
    this.Wb = Wb; this.Hb = Hb;
    this.cx = new Float64Array(this.n); this.cy = new Float64Array(this.n);
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) {
      const i = r * this.nc + c;
      this.cx[i] = (SQ3 * (c + 0.5 + 0.5 * (r & 1))) / Wb;
      this.cy[i] = (1 + 1.5 * r) / Wb;
    }
  }
  side(name) {
    const out = [];
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) {
      const i = r * this.nc + c;
      if (this.holes[i]) continue;
      if ((name === 'L' && c === 0) || (name === 'R' && c === this.nc - 1) || (name === 'T' && r === 0) || (name === 'B' && r === this.nr - 1)) out.push(i);
    }
    return out;
  }
}

// Node-weighted shortest chain from any source to any target. Returns {len, cells} or null.
export function shortestChain(board, w, sources, isTarget, heap, dist, prev) {
  dist.fill(Infinity); prev.fill(-1); heap.clear();
  for (const s of sources) { dist[s] = w[s]; heap.push(w[s], s); }
  while (heap.n) {
    const u = heap.pop(), d = heap.lastKey;
    if (d > dist[u]) continue;
    if (isTarget[u]) {
      const cells = [];
      for (let v = u; v !== -1; v = prev[v]) cells.push(v);
      return { len: d, cells };
    }
    for (const v of board.nbrs[u]) {
      if (board.holes[v]) continue;
      const nd = d + w[v];
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(nd, v); }
    }
  }
  return null;
}

// Pairwise Frank–Wolfe for min ||P||^2 over conv{incidence vectors of crossings}.
export class MinNormSolver {
  constructor(board, from, to) {
    this.b = board;
    this.sources = board.side(from);
    this.isTarget = new Uint8Array(board.n);
    for (const t of board.side(to)) this.isTarget[t] = 1;
    this.heap = new Heap(4 * board.n + 16);
    this.dist = new Float64Array(board.n);
    this.prev = new Int32Array(board.n);
    this.P = new Float64Array(board.n);
    this.atoms = new Map();
    this.stamp = new Int32Array(board.n);
    this.tick = 0;
    this.iter = 0;
    this.done = false;
    this.empty = false;
    const ones = new Float64Array(board.n).fill(1);
    const first = shortestChain(board, ones, this.sources, this.isTarget, this.heap, this.dist, this.prev);
    if (!first) { this.empty = true; this.done = true; this.lower = 0; this.upper = 0; return; }
    this.addAtom(first.cells, 1);
    for (const c of first.cells) this.P[c] = 1;
    this.updateBounds(first.cells.length);
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
  updateBounds(m) {
    const n2 = this.norm2();
    this.n2 = n2;
    this.m = m;
    this.lower = 1 / n2;             // any P in the hull: Mod >= 1/||P||^2
    this.upper = n2 / (m * m);       // P/m is admissible: Mod <= ||P||^2/m^2
  }
  step() {
    if (this.done) return;
    const s = shortestChain(this.b, this.P, this.sources, this.isTarget, this.heap, this.dist, this.prev);
    const m = s.len;
    // away atom
    let away = null, gA = -Infinity;
    for (const a of this.atoms.values()) {
      let g = 0; for (const c of a.cells) g += this.P[c];
      if (g > gA) { gA = g; away = a; }
    }
    this.iter++;
    this.lastS = s.cells;
    this.updateBounds(m);
    if (gA - m <= 1e-12 * Math.max(1, gA)) { this.done = true; return; }
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
    if (away.lam <= 1e-14) this.atoms.delete(away.k);
    if ((this.upper - this.lower) / this.lower < 6e-4) this.done = true;
  }
}

// Cost from the top edge with node weights rho (cell's own weight included).
export function costFromTop(board, rho) {
  const heap = new Heap(4 * board.n + 16), dist = new Float64Array(board.n).fill(Infinity);
  for (const s of board.side('T')) { dist[s] = rho[s]; heap.push(rho[s], s); }
  while (heap.n) {
    const u = heap.pop(), d = heap.lastKey;
    if (d > dist[u]) continue;
    for (const v of board.nbrs[u]) {
      if (board.holes[v]) continue;
      const nd = d + rho[v];
      if (nd < dist[v]) { dist[v] = nd; heap.push(nd, v); }
    }
  }
  return dist;
}

// BFS for a chain inside a cell set from side A to side B (walls may belong to the set).
function chainWithin(board, inSet, from, to) {
  const onSide = (i, nm) => { const r = (i / board.nc) | 0, c = i % board.nc; return (nm === 'L' && c === 0) || (nm === 'R' && c === board.nc - 1) || (nm === 'T' && r === 0) || (nm === 'B' && r === board.nr - 1); };
  const prev = new Int32Array(board.n).fill(-2), q = [];
  for (let s = 0; s < board.n; s++) if (inSet[s] && onSide(s, from)) { prev[s] = -1; q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    if (onSide(u, to)) { const out = []; for (let v = u; v !== -1; v = prev[v]) out.push(v); return out; }
    for (const v of board.nbrs[u]) if (inSet[v] && prev[v] === -2) { prev[v] = u; q.push(v); }
  }
  return null;
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' });
  const right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = {
    nc: 14, aspect: 1.0, mode: 'lr', t: 0.5, paint: false,
    strokes: [], brush: 0.04,
    board: null, lr: null, tb: null, history: new Map(),
  };

  const cv = makeCanvas(left, { aspect: 0.86, maxHeight: 520, draw });

  const ctlTop = controls(left);
  segmented(ctlTop, [['lr', 'LR density'], ['tb', 'TB modulus'], ['cost', 'Dual ρ = P → cost b(x)']], st.mode, (m) => { st.mode = m; tSl.label.style.display = m === 'cost' ? '' : 'none'; cv.redraw(); });
  const tSl = slider(ctlTop, { label: 'level t', min: 0.02, max: 0.98, step: 0.01, value: st.t, fmt: (v) => v.toFixed(2), oninput: (v) => { st.t = v; cv.redraw(); updateReadout(); } });
  tSl.label.style.display = 'none';

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  slider(ctl, { label: 'mesh (cols)', min: 6, max: 30, step: 1, value: st.nc, fmt: (v) => v, oninput: (v) => { st.nc = v; rebuild(false); } });
  slider(ctl, { label: 'height / width', min: 0.5, max: 2, step: 0.05, value: st.aspect, fmt: (v) => v.toFixed(2), oninput: (v) => { st.aspect = v; rebuild(true); } });
  const ctl2 = controls(right);
  const paintBtn = button(ctl2, 'Paint walls', () => { st.paint = !st.paint; paintBtn.classList.toggle('primary', st.paint); cv.canvas.style.cursor = st.paint ? 'crosshair' : 'default'; });
  button(ctl2, 'Wall with a gap', () => {
    st.strokes = [];
    for (let y = 0.0; y <= 1.0; y += 0.012) if (Math.abs(y - 0.5) > 0.09) st.strokes.push({ x: 0.5, y });
    rebuild(true);
  });
  button(ctl2, 'Clear', () => { st.strokes = []; rebuild(true); });

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  const histWrap = el('div', { style: 'margin-top:.6rem' });
  right.append(histWrap);
  const hist = makeCanvas(histWrap, { aspect: 0.42, maxHeight: 140, draw: drawHistory });
  right.append(el('div', { class: 'hint' }, 'History: converged Mod_LR at each mesh for the current geometry. A bounded sequence is the Euclidean case of sup M(n) < ∞.'));

  function applyHoles(board) {
    board.holes.fill(0);
    if (!st.strokes.length) return;
    const r2 = st.brush * st.brush;
    for (let i = 0; i < board.n; i++) {
      const x = board.cx[i], y = board.cy[i] * board.Wb / board.Hb; // normalized to [0,1]^2
      for (const p of st.strokes) {
        const dx = x - p.x, dy = (y - p.y) * board.Hb / board.Wb;
        if (dx * dx + dy * dy < r2) { board.holes[i] = 1; break; }
      }
    }
  }

  function rebuild(geometryChanged) {
    if (geometryChanged) st.history.clear();
    st.board = new HexBoard(st.nc, st.aspect);
    applyHoles(st.board);
    st.lr = new MinNormSolver(st.board, 'L', 'R');
    st.tb = new MinNormSolver(st.board, 'T', 'B');
    run();
  }

  let running = false;
  function run() {
    if (running) return;
    running = true;
    const frame = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 10 && !(st.lr.done && st.tb.done)) {
        if (!st.lr.done) st.lr.step();
        if (!st.tb.done) st.tb.step();
        if (st.lr.iter > 4000) st.lr.done = true;
        if (st.tb.iter > 4000) st.tb.done = true;
      }
      if (st.lr.done && !st.lr.empty) st.history.set(st.nc, (st.lr.lower + st.lr.upper) / 2);
      cv.redraw(); updateReadout(); hist.redraw();
      if (!(st.lr.done && st.tb.done)) requestAnimationFrame(frame);
      else running = false;
    };
    requestAnimationFrame(frame);
  }

  // ---- geometry for drawing ----
  let layout = null;
  function computeLayout(w, h) {
    const b = st.board;
    const pad = 22;
    const s = Math.min((w - 2 * pad) / b.Wb, (h - 2 * pad) / b.Hb); // hex circumradius in px
    const ox = (w - s * b.Wb) / 2, oy = (h - s * b.Hb) / 2;
    layout = { s, ox, oy };
  }
  const center = (i) => {
    const b = st.board, { s, ox, oy } = layout;
    return [ox + b.cx[i] * b.Wb * s, oy + b.cy[i] * b.Wb * s];
  };
  function hexPath(ctx, x, y, s) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + k * Math.PI / 3;
      const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function draw(ctx, w, h) {
    if (!st.board) return;
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    computeLayout(w, h);
    const b = st.board, s = layout.s;
    const solver = st.mode === 'tb' ? st.tb : st.lr;
    const heatStops = P.dark ? [P.bg, '#26407a', '#4f7be6', '#ffd38a'] : ['#ffffff', '#c9d7f6', '#4c74d6', '#152a66'];
    let vals = solver.P, vmax = 0;
    let cost = null, level = null, lateral = null, tbPath = null;
    if (st.mode === 'cost') {
      cost = costFromTop(b, st.lr.P);
      level = new Uint8Array(b.n);
      for (let i = 0; i < b.n; i++) if (!b.holes[i] && st.lr.P[i] > 0 && cost[i] - st.lr.P[i] <= st.t && st.t <= cost[i]) level[i] = 1;
      const blocker = new Uint8Array(b.n);
      for (let i = 0; i < b.n; i++) blocker[i] = level[i] || b.holes[i];
      lateral = chainWithin(b, blocker, 'L', 'R');
      const isB = new Uint8Array(b.n); for (const t of b.side('B')) isB[t] = 1;
      const tmp = new MinNormSolver(b, 'T', 'B'); // reuse its buffers for a Dijkstra
      tbPath = shortestChain(b, st.lr.P, b.side('T'), isB, tmp.heap, tmp.dist, tmp.prev);
    } else {
      for (let i = 0; i < b.n; i++) vmax = Math.max(vmax, vals[i]);
    }
    const costStops = P.dark ? ['#1e2a4a', '#3d6bd4', '#9bd0a0', '#f4e3a1'] : ['#f2f5fc', '#9fb8ec', '#3d8a70', '#173a2c'];
    for (let i = 0; i < b.n; i++) {
      const [x, y] = center(i);
      hexPath(ctx, x, y, s * 0.985);
      if (b.holes[i]) ctx.fillStyle = P.dark ? '#3a3a40' : '#4a4740';
      else if (cost) ctx.fillStyle = ramp(costStops, Math.min(1, cost[i]));
      else ctx.fillStyle = ramp(heatStops, vmax > 0 ? vals[i] / vmax : 0);
      ctx.fill();
      ctx.strokeStyle = rgba(P.ink, P.dark ? 0.12 : 0.10);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    // sides
    ctx.lineWidth = 3;
    const sideMark = (cells, color, dx, dy) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      cells.forEach((c, k) => { const [x, y] = center(c); k ? ctx.lineTo(x + dx * s, y + dy * s) : ctx.moveTo(x + dx * s, y + dy * s); });
      ctx.stroke();
    };
    const lrColor = P.accent2, tbColor = P.accent3;
    const allSide = (nm) => { const o = []; for (let r = 0; r < b.nr; r++) for (let c = 0; c < b.nc; c++) if ((nm === 'L' && c === 0) || (nm === 'R' && c === b.nc - 1) || (nm === 'T' && r === 0) || (nm === 'B' && r === b.nr - 1)) o.push(r * b.nc + c); return o; };
    sideMark(allSide('L'), lrColor, -1.15, 0); sideMark(allSide('R'), lrColor, 1.15, 0);
    sideMark(allSide('T'), tbColor, 0, -1.3); sideMark(allSide('B'), tbColor, 0, 1.3);

    const chainLine = (cells, color, width, alpha = 1) => {
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      cells.forEach((c, k) => { const [x, y] = center(c); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.globalAlpha = 1;
    };
    if (!cost) {
      // the optimal crossing distribution: atoms drawn with opacity ~ weight
      const color = st.mode === 'tb' ? tbColor : lrColor;
      let lmax = 0; for (const a of solver.atoms.values()) lmax = Math.max(lmax, a.lam);
      for (const a of solver.atoms.values()) chainLine(a.cells, color, 1.6, Math.min(0.9, 0.12 + 0.8 * a.lam / (lmax || 1)));
    } else {
      for (let i = 0; i < b.n; i++) if (level[i]) {
        const [x, y] = center(i);
        hexPath(ctx, x, y, s * 0.8);
        ctx.strokeStyle = P.accent2; ctx.lineWidth = 1.6; ctx.stroke();
      }
      if (lateral) chainLine(lateral, P.accent2, 3);
      if (tbPath) chainLine(tbPath.cells, tbColor, 2.2, 0.9);
      st.costInfo = { lateral: !!lateral, tbLen: tbPath ? tbPath.len : Infinity, levelCount: level.reduce((a, v) => a + v, 0) };
    }
    // side labels
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = lrColor; ctx.textAlign = 'center';
    ctx.fillText('left', layout.ox - 8, layout.oy - 6); ctx.fillText('right', layout.ox + b.Wb * s + 8, layout.oy - 6);
    ctx.fillStyle = tbColor;
    ctx.fillText('top', layout.ox + b.Wb * s / 2, layout.oy - 7);
    ctx.fillText('bottom', layout.ox + b.Wb * s / 2, layout.oy + b.Hb * s + 15);
    ctx.textAlign = 'left';
  }

  function drawHistory(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.panel2; ctx.fillRect(0, 0, w, h);
    const entries = [...st.history.entries()].sort((a, b) => a[0] - b[0]);
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = P.muted;
    ctx.fillText('Mod_LR vs mesh', 6, 12);
    if (!entries.length) return;
    const vmax = Math.max(...entries.map((e) => e[1])) * 1.25 || 1;
    const x0 = 8, x1 = w - 8, y0 = h - 16, y1 = 18;
    const X = (n) => x0 + (x1 - x0) * (n - 6) / 24;
    const Y = (v) => y0 - (y0 - y1) * v / vmax;
    ctx.strokeStyle = P.rule; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    ctx.fillStyle = P.accent2;
    for (const [n, v] of entries) { ctx.beginPath(); ctx.arc(X(n), Y(v), 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = P.muted;
    ctx.fillText('6', X(6) - 2, h - 4); ctx.fillText('30', X(30) - 6, h - 4);
    const last = entries[entries.length - 1];
    ctx.fillText(last[1].toFixed(3), Math.min(X(last[0]) + 5, w - 34), Y(last[1]) - 4);
  }

  function updateReadout() {
    const lr = st.lr, tb = st.tb;
    if (!lr) return;
    const status = (s) => s.empty ? '<span class="bad">no crossing</span>' : (s.done ? '<span class="ok">converged</span>' : 'running…');
    let html = `<table>
      <tr><td class="k">board</td><td>${st.board.nr} × ${st.board.nc} cells</td></tr>
      <tr><td class="k">Mod<sub>LR</sub></td><td>${lr.empty ? '0' : `${fmt.f(lr.lower, 4)} … ${fmt.f(lr.upper, 4)}`}</td></tr>
      <tr><td class="k">&nbsp;&nbsp;FW iterations</td><td>${lr.iter} · ${status(lr)}</td></tr>
      <tr><td class="k">Mod<sub>TB</sub></td><td>${tb.empty ? '0' : `${fmt.f(tb.lower, 4)} … ${fmt.f(tb.upper, 4)}`}</td></tr>
      <tr><td class="k">Mod<sub>LR</sub> · Mod<sub>TB</sub></td><td>${fmt.f(lr.lower * tb.lower, 3)} … ${fmt.f(lr.upper * tb.upper, 3)} <span class="k">(true value ≤ 1)</span></td></tr>
    </table><hr>`;
    if (!lr.empty) {
      html += `<div class="k" style="margin-bottom:.2rem">Lemma 3.3, at the current iterate P</div><table>
        <tr><td class="k">Σρ² = ‖P‖² (= 1/Mod<sub>LR</sub> at optimum)</td><td>${fmt.f(lr.n2, 4)}</td></tr>
        <tr><td class="k">cheapest LR chain ⟨P,v⟩</td><td>${fmt.f(lr.m, 4)}</td></tr>`;
      if (st.mode === 'cost' && st.costInfo) {
        const ok = st.costInfo.tbLen >= 1 - 1e-9;
        html += `<tr><td class="k">cheapest TB chain, ρ = P</td><td><span class="${ok ? 'ok' : 'bad'}">${fmt.f(st.costInfo.tbLen, 4)} ≥ 1</span></td></tr>
          <tr><td class="k">level t: cells crossing t</td><td>${st.costInfo.levelCount}</td></tr>
          <tr><td class="k">${st.strokes.length ? 'level ∪ walls contains' : 'contains'} a left–right chain</td><td><span class="${st.costInfo.lateral ? 'ok' : 'bad'}">${st.costInfo.lateral ? 'yes' : 'no'}</span></td></tr>`;
      }
      html += '</table>';
    }
    ro.innerHTML = html;
  }

  // painting
  const toBoard = (x, y) => {
    const b = st.board, { s, ox, oy } = layout;
    return { x: (x - ox) / (b.Wb * s), y: (y - oy) / (b.Hb * s) };
  };
  let painting = false;
  pointer(cv.wrap, {
    down(x, y) { if (!st.paint || !layout) return false; painting = true; st.strokes.push(toBoard(x, y)); rebuildSoon(); return true; },
    move(x, y) { if (painting) { st.strokes.push(toBoard(x, y)); rebuildSoon(); } },
    up() { painting = false; rebuild(true); },
  });
  let soon = null;
  function rebuildSoon() {
    if (soon) return;
    soon = setTimeout(() => { soon = null; rebuild(true); }, 60);
  }

  onTheme(() => { cv.redraw(); hist.redraw(); });
  for (let y = 0.0; y <= 1.0; y += 0.012) if (Math.abs(y - 0.5) > 0.09) st.strokes.push({ x: 0.5, y });
  rebuild(true);
}
