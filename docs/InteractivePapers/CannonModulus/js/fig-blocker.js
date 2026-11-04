// Figure 3 — Lemma 3.2(ii): a compact set K meeting every top-to-bottom path contains a continuum
// meeting both lateral edges. The paper's proof, run on a square grid: label A the unmarked squares
// reachable from the top (plus an appended top row), B the rest (plus an appended bottom row); the
// interfaces between unlike labels have an odd number of ends on each lateral side, so one interface
// component joins the sides, and the B squares along it are marked squares forming a lateral crossing.
import { el, makeCanvas, labelLayer, chips, button, controls, setTex, palette, onTheme, pointer, rgba, mix } from './common.js';

/** The rectangle is [0, 1] × [0, ASPECT], y downward; a grid has `cols` square columns. */
export const ASPECT = 0.75;
export const rowsFor = (cols) => Math.round(cols * ASPECT);

// ───────────────────────── pure math (node-testable) ─────────────────────────

/**
 * The labelling argument on a rows × cols grid with marked squares `marked` (Uint8Array, r·cols + c).
 * If an edge-adjacent chain of unmarked squares joins top to bottom, returns { blocks: false, A, chain }.
 * Otherwise returns the interfaces (edges on the vertex grid of rows −1..rows, the appended rows
 * included), their ends on each lateral side, the vertex degrees, the component joining the sides,
 * a path in it, and the B squares along that path in order.
 */
export function analyze(rows, cols, marked) {
  const N = rows * cols, idx = (r, c) => r * cols + c;
  // A = unmarked squares reachable from the top through edge-adjacent unmarked squares
  const A = new Uint8Array(N), prev = new Int32Array(N).fill(-2), q = [];
  for (let c = 0; c < cols; c++) if (!marked[c]) { A[c] = 1; prev[c] = -1; q.push(c); }
  for (let h = 0; h < q.length; h++) {
    const u = q[h], r = (u / cols) | 0, c = u % cols;
    for (const [rr, cc] of [[r + 1, c], [r, c - 1], [r, c + 1], [r - 1, c]]) {
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      const v = idx(rr, cc);
      if (!marked[v] && !A[v]) { A[v] = 1; prev[v] = u; q.push(v); }
    }
  }
  const exit = q.find((u) => u >= (rows - 1) * cols);    // the first bottom-row square reached: a shortest chain
  if (exit !== undefined) {
    const chain = [];
    for (let v = exit; v !== -1; v = prev[v]) chain.push(v);
    return { blocks: false, A, chain: chain.reverse() };
  }
  // labels on rows −1..rows: 1 = A, 0 = B (row −1 is the appended A row, row `rows` the appended B row)
  const L = (r, c) => (r < 0 ? 1 : r >= rows ? 0 : A[idx(r, c)]);
  // vertex (i, j): i = 0..rows+2 is the horizontal line y = i − 1, j = 0..cols the vertical line x = j
  const VW = cols + 1, V = (i, j) => i * VW + j, NV = (rows + 3) * VW;
  const edges = [];                 // [vertex a, vertex b, B square [r, c]]
  const deg = new Int32Array(NV);
  const adj = Array.from({ length: NV }, () => []);
  const add = (a, b, bsq) => {
    const k = edges.length;
    edges.push([a, b, bsq]); deg[a]++; deg[b]++; adj[a].push([b, k]); adj[b].push([a, k]);
  };
  for (let r = -1; r < rows; r++) for (let c = 0; c < cols; c++) {   // horizontal interfaces, below row r
    const x = L(r, c), y = L(r + 1, c);
    if (x !== y) add(V(r + 2, c), V(r + 2, c + 1), x === 0 ? [r, c] : [r + 1, c]);
  }
  for (let r = -1; r <= rows; r++) for (let c = 0; c + 1 < cols; c++) { // vertical interfaces, right of (r, c)
    const x = L(r, c), y = L(r, c + 1);
    if (x !== y) add(V(r + 1, c + 1), V(r + 2, c + 1), x === 0 ? [r, c] : [r, c + 1]);
  }
  let leftEnds = 0, rightEnds = 0, topBottomEnds = 0, oddInterior = 0;
  for (let i = 0; i < rows + 3; i++) for (let j = 0; j <= cols; j++) {
    const d = deg[V(i, j)];
    if (j === 0) leftEnds += d;
    else if (j === cols) rightEnds += d;
    else if (i === 0 || i === rows + 2) topBottomEnds += d;
    else if (d % 2) oddInterior++;
  }
  // a path in the interface graph from the left side to the right side (BFS), and its whole component
  const pv = new Int32Array(NV).fill(-2), pe = new Int32Array(NV).fill(-1), qq = [];
  for (let i = 0; i < rows + 3; i++) if (deg[V(i, 0)]) { pv[V(i, 0)] = -1; qq.push(V(i, 0)); }
  let goal = -1;
  for (let h = 0; h < qq.length && goal < 0; h++) {
    const u = qq[h];
    if (u % VW === cols) { goal = u; break; }
    for (const [v, k] of adj[u]) if (pv[v] === -2) { pv[v] = u; pe[v] = k; qq.push(v); }
  }
  const pathEdges = [], crossing = [], compEdges = new Uint8Array(edges.length);
  if (goal >= 0) {
    for (let v = goal; pv[v] !== -1; v = pv[v]) pathEdges.push(pe[v]);
    pathEdges.reverse();            // left to right
    for (const k of pathEdges) {
      const [r, c] = edges[k][2], sq = r >= 0 && r < rows ? idx(r, c) : -1 - c;   // appended squares as negatives
      if (crossing[crossing.length - 1] !== sq) crossing.push(sq);
    }
    const seen = new Uint8Array(NV), st = [goal];
    seen[goal] = 1;
    while (st.length) { const u = st.pop(); for (const [v, k] of adj[u]) { compEdges[k] = 1; if (!seen[v]) { seen[v] = 1; st.push(v); } } }
  }
  return { blocks: true, A, edges, deg, leftEnds, rightEnds, topBottomEnds, oddInterior, goal, pathEdges, compEdges, crossing };
}

/**
 * The checks of Lemma 3.2(ii) on an analysis: odd ends on both lateral sides; a component joining
 * them; its B squares all marked (none from the appended rows); successive ones meeting at least at a
 * corner; the first in the left column, the last in the right column.
 */
export function checks(rows, cols, marked, res) {
  if (!res.blocks) return null;
  const sq = res.crossing;
  const inK = sq.length > 0 && sq.every((i) => i >= 0 && marked[i]);
  let corner = sq.length > 0 && sq.every((i) => i >= 0);
  for (let k = 1; corner && k < sq.length; k++) {
    const a = sq[k - 1], b = sq[k];
    if (Math.abs(((a / cols) | 0) - ((b / cols) | 0)) > 1 || Math.abs((a % cols) - (b % cols)) > 1) corner = false;
  }
  const lateral = corner && sq[0] % cols === 0 && sq[sq.length - 1] % cols === cols - 1;
  return {
    leftOdd: res.leftEnds % 2 === 1, rightOdd: res.rightEnds % 2 === 1,
    evenInterior: res.oddInterior === 0, noTopBottom: res.topBottomEnds === 0,
    joined: res.goal >= 0, inK, corner, lateral,
    all: res.leftEnds % 2 === 1 && res.rightEnds % 2 === 1 && res.oddInterior === 0 && res.goal >= 0 && inK && lateral,
  };
}

/** A corner-connected (8-neighbour) chain of marked squares from the left column to the right, or null. */
export function lateralCrossing(rows, cols, marked) {
  const prev = new Int32Array(rows * cols).fill(-2), q = [];
  for (let r = 0; r < rows; r++) if (marked[r * cols]) { prev[r * cols] = -1; q.push(r * cols); }
  for (let h = 0; h < q.length; h++) {
    const u = q[h], r = (u / cols) | 0, c = u % cols;
    if (c === cols - 1) { const out = []; for (let v = u; v !== -1; v = prev[v]) out.push(v); return out.reverse(); }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < rows && cc >= 0 && cc < cols && marked[rr * cols + cc] && prev[rr * cols + cc] === -2) { prev[rr * cols + cc] = u; q.push(rr * cols + cc); }
    }
  }
  return null;
}

// ── presets: compact sets in the rectangle, then "mark the closed squares meeting K" ──

const TAU = 2 * Math.PI;
const wavy = (x) => 0.40 + 0.13 * Math.sin(TAU * 1.15 * x + 0.3) + 0.04 * Math.sin(TAU * 3.2 * x + 1);
const graph = (f, x0, x1) => { const pts = []; for (let k = 0; k <= 240; k++) { const x = x0 + ((x1 - x0) * k) / 240; pts.push([x, f(x)]); } return pts; };
const R0 = 0.006;   // thickness of the drawn curves
const DECOR = [
  { pts: [[-0.01, 0.2], [0.12, 0.19], [0.22, 0.225], [0.29, 0.3]], r: R0 },   // a spur from the left side
  { disc: [0.6, 0.115], r: 0.04 },                                             // an island
];
const SPIKE = { pts: [[0.82, 0.36], [0.835, 0.25], [0.86, 0.14]], r: R0 };    // a spike on the wall

export const PRESETS = {
  wavy: () => [{ pts: graph(wavy, -0.01, 1.01), r: R0 }, SPIKE, ...DECOR],
  gap: () => [{ pts: graph(wavy, -0.01, 0.4), r: R0 }, { pts: graph(wavy, 0.58, 1.01), r: R0 }, SPIKE, ...DECOR],
  two: () => {
    const up = (x) => 0.21 + 0.05 * Math.sin(TAU * 1.3 * x + 1);
    const lo = (x) => 0.52 + 0.08 * Math.sin(TAU * 0.9 * x + 2.2) + 0.025 * Math.sin(TAU * 2.7 * x);
    return [{ pts: graph(up, -0.01, 0.62), r: R0 }, { pts: graph(up, 0.8, 1.01), r: R0 }, { pts: graph(lo, -0.01, 1.01), r: R0 }];
  },
};

/** Mark the closed squares of a rows × cols grid meeting a set given by thick polylines and discs. */
export function rasterize(shapes, rows, cols) {
  const s = 1 / cols, marked = new Uint8Array(rows * cols);
  const distRect = (x, y, r, c) => {
    const dx = Math.max(c * s - x, 0, x - (c + 1) * s), dy = Math.max(r * s - y, 0, y - (r + 1) * s);
    return Math.hypot(dx, dy);
  };
  const mark = (x, y, rad) => {
    const c0 = Math.max(0, Math.floor((x - rad) / s) - 1), c1 = Math.min(cols - 1, Math.floor((x + rad) / s) + 1);
    const r0 = Math.max(0, Math.floor((y - rad) / s) - 1), r1 = Math.min(rows - 1, Math.floor((y + rad) / s) + 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (distRect(x, y, r, c) <= rad) marked[r * cols + c] = 1;
  };
  for (const sh of shapes) {
    if (sh.disc) { mark(sh.disc[0], sh.disc[1], sh.r); continue; }
    const p = sh.pts;
    for (let k = 0; k + 1 < p.length; k++) {
      const [x0, y0] = p[k], [x1, y1] = p[k + 1], m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.002));
      for (let t = 0; t <= m; t++) mark(x0 + ((x1 - x0) * t) / m, y0 + ((y1 - y0) * t) / m, sh.r);
    }
  }
  return marked;
}

/** A small seeded generator. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A random blocker: squares marked with probability `p`, resampled until K blocks. */
export function randomBlocker(rows, cols, seed, p = 0.47) {
  const R = rng(seed);
  for (let tries = 0; tries < 400; tries++) {
    const m = new Uint8Array(rows * cols);
    for (let i = 0; i < m.length; i++) m[i] = R() < p + tries * 0.002 ? 1 : 0;
    if (analyze(rows, cols, m).blocks) return m;
  }
  return new Uint8Array(rows * cols).fill(1);
}

export function presetGrid(name, cols, seed = 1) {
  const rows = rowsFor(cols);
  if (name === 'random') return randomBlocker(rows, cols, seed);
  if (name === 'clear') return new Uint8Array(rows * cols);
  return rasterize(PRESETS[name](), rows, cols);
}

/** Carry marked squares to another mesh: a new square is marked if its interior meets a marked one's. */
export function remesh(marked, cols, newCols) {
  const rows = rowsFor(cols), nr = rowsFor(newCols), out = new Uint8Array(nr * newCols);
  const s = 1 / cols, t = 1 / newCols, eps = 1e-9;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!marked[r * cols + c]) continue;
    const c0 = Math.floor((c * s) / t + eps), c1 = Math.ceil(((c + 1) * s) / t - eps) - 1;
    const r0 = Math.floor((r * s) / t + eps), r1 = Math.ceil(((r + 1) * s) / t - eps) - 1;
    for (let rr = Math.max(0, r0); rr <= Math.min(nr - 1, r1); rr++) for (let cc = Math.max(0, c0); cc <= Math.min(newCols - 1, c1); cc++) out[rr * newCols + cc] = 1;
  }
  return out;
}

// ───────────────────────── the figure ─────────────────────────

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { preset: 'wavy', cols: 16, seed: 7, dirty: false, marked: null, res: null, ck: null };
  st.marked = presetGrid(st.preset, st.cols, st.seed);
  const rows = () => rowsFor(st.cols);

  // the grid plus its two appended rows, with a little padding
  const cv = makeCanvas(left, { aspect: (w) => (((rows() + 2) / st.cols) * (w - 28) + 16) / w, maxHeight: 560, minHeight: 220, draw });
  const labels = labelLayer(cv.wrap);
  const legend = el('div', { class: 'hint' });
  left.append(legend);

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const presetChips = chips(ctl, {
    label: 'The set $K$',
    options: [['wavy', 'wavy wall'], ['gap', 'wall with a gap'], ['two', 'two walls'], ['random', 'random blocker']],
    value: st.preset,
    onchange: (k) => { if (k === 'random' && st.preset === 'random') st.seed++; st.preset = k; load(); },
  });
  chips(ctl, {
    label: 'Grid',
    options: [12, 16, 24, 32].map((c) => [String(c), `$${c}\\times${rowsFor(c)}$`]),
    value: String(st.cols),
    onchange: (k) => {
      const c = +k;
      if (c === st.cols) return;
      if (st.dirty) st.marked = remesh(st.marked, st.cols, c);
      st.cols = c;
      if (!st.dirty) st.marked = presetGrid(st.preset, c, st.seed);
      cv.resize(); cv.redraw();
    },
  });
  const btns = el('div', { class: 'btn-row' });
  ctl.append(btns);
  button(btns, 'Clear', () => { st.marked = new Uint8Array(rows() * st.cols); st.dirty = true; presetChips.set(null); cv.redraw(); }, 'ghost');
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro, el('div', { class: 'hint', html: 'Click or drag on the grid to mark or unmark squares.' }));

  function load() { st.dirty = false; st.marked = presetGrid(st.preset, st.cols, st.seed); cv.redraw(); }

  let lay = null;
  function draw(ctx, w, h) {
    const P = palette();
    const R = rows(), C = st.cols, m = st.marked;
    st.res = analyze(R, C, m);
    st.ck = checks(R, C, m, st.res);
    const res = st.res;
    const padX = 14, padY = 8;
    const s = Math.min((w - 2 * padX) / C, (h - 2 * padY) / (R + 2));
    const ox = Math.round((w - s * C) / 2), oy = Math.round((h - s * (R + 2)) / 2 + s);
    lay = { s, ox, oy };
    const X = (c) => ox + c * s, Y = (r) => oy + r * s;

    const tintA = rgba(P.u, P.dark ? 0.24 : 0.15), tintB = rgba(P.mesh, P.dark ? 0.12 : 0.08);
    const kFill = mix(P.surface, P.mesh, P.dark ? 0.55 : 0.6);
    const onPath = new Set(res.blocks ? res.crossing.filter((i) => i >= 0) : []);
    // appended rows
    if (res.blocks) {
      ctx.fillStyle = tintA; ctx.fillRect(X(0), Y(-1), C * s, s);
      ctx.fillStyle = rgba(P.mesh, P.dark ? 0.22 : 0.16); ctx.fillRect(X(0), Y(R), C * s, s);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(P.mesh, 0.7); ctx.lineWidth = 1;
      ctx.strokeRect(X(0) + 0.5, Y(-1) + 0.5, C * s - 1, s - 1);
      ctx.strokeRect(X(0) + 0.5, Y(R) + 0.5, C * s - 1, s - 1);
      ctx.setLineDash([]);
    }
    // squares
    ctx.fillStyle = P.surface; ctx.fillRect(X(0), Y(0), C * s, R * s);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      ctx.fillStyle = onPath.has(i) ? rgba(P.w, 0.88) : m[i] ? kFill : res.A[i] ? tintA : tintB;
      ctx.fillRect(X(c), Y(r), s, s);
    }
    // grid
    ctx.strokeStyle = rgba(P.mesh, P.dark ? 0.32 : 0.28); ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let c = 0; c <= C; c++) { ctx.moveTo(X(c) + 0.5, Y(0)); ctx.lineTo(X(c) + 0.5, Y(R)); }
    for (let r = 0; r <= R; r++) { ctx.moveTo(X(0), Y(r) + 0.5); ctx.lineTo(X(C), Y(r) + 0.5); }
    ctx.stroke();
    // the lateral sides
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(R)); ctx.moveTo(X(C), Y(0)); ctx.lineTo(X(C), Y(R)); ctx.stroke();
    ctx.strokeStyle = rgba(P.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(C), Y(0)); ctx.moveTo(X(0), Y(R)); ctx.lineTo(X(C), Y(R)); ctx.stroke();

    const lab = [];
    if (res.blocks) {
      const vx = (v) => X(v % (C + 1)), vy = (v) => Y(Math.floor(v / (C + 1)) - 1);
      ctx.lineCap = 'round';
      // interfaces not in the joining component
      ctx.strokeStyle = rgba(P.u, 0.6); ctx.lineWidth = Math.max(1.4, s * 0.09);
      ctx.beginPath();
      res.edges.forEach(([a, b], k) => { if (!res.compEdges[k]) { ctx.moveTo(vx(a), vy(a)); ctx.lineTo(vx(b), vy(b)); } });
      ctx.stroke();
      // the component joining the lateral sides
      ctx.strokeStyle = P.u; ctx.lineWidth = Math.max(2.6, s * 0.2);
      ctx.beginPath();
      res.edges.forEach(([a, b], k) => { if (res.compEdges[k]) { ctx.moveTo(vx(a), vy(a)); ctx.lineTo(vx(b), vy(b)); } });
      ctx.stroke();
      // ends on the lateral sides
      for (let i = 0; i < R + 3; i++) for (const j of [0, C]) {
        const v = i * (C + 1) + j;
        if (!res.deg[v]) continue;
        ctx.beginPath(); ctx.arc(vx(v), vy(v), Math.max(3.5, s * 0.2), 0, 2 * Math.PI);
        ctx.fillStyle = P.u; ctx.fill(); ctx.strokeStyle = P.surface; ctx.lineWidth = 2; ctx.stroke();
      }
      const small = s < 22;
      lab.push({ id: 'rowA', x: X(C / 2), y: Y(-0.5), tex: small ? 'A' : '\\text{appended row } A', anchor: 'c', cls: 'small' });
      lab.push({ id: 'rowB', x: X(C / 2), y: Y(R + 0.5), tex: small ? 'B' : '\\text{appended row } B', anchor: 'c', cls: 'small' });
    } else {
      // the escaping chain of unmarked squares
      const cx = (i) => X((i % C) + 0.5), cy = (i) => Y(((i / C) | 0) + 0.5);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); res.chain.forEach((i, k) => (k ? ctx.lineTo(cx(i), cy(i)) : ctx.moveTo(cx(i), cy(i)))); };
      path(); ctx.strokeStyle = rgba(P.surface, 0.9); ctx.lineWidth = Math.max(5, s * 0.36); ctx.stroke();
      path(); ctx.strokeStyle = P.mu; ctx.lineWidth = Math.max(3, s * 0.24); ctx.stroke();
      for (const i of [res.chain[0], res.chain[res.chain.length - 1]]) {
        ctx.beginPath(); ctx.arc(cx(i), cy(i), Math.max(3.5, s * 0.2), 0, 2 * Math.PI); ctx.fillStyle = P.mu; ctx.fill();
      }
    }
    labels.set(lab);
    setLegend(res.blocks);
    readout();
  }

  function setLegend(blocks) {
    const item = (html) => `<span style="white-space:nowrap">${html}</span>`;
    setTex(legend, [
      item('<span style="color:var(--c-mesh)">■</span> marked squares, $K$'),
      item('<span style="color:var(--c-u);opacity:.45">■</span> $A$: unmarked, reachable from the top'),
      ...(blocks ? [
        item('<span style="color:var(--c-u)">━</span> interfaces <span style="color:var(--c-u)">●</span> their lateral ends'),
        item('<span style="color:var(--c-w)">■</span> $B$ squares along the joining component'),
      ] : [item('<span style="color:var(--c-mu)">━</span> an unmarked top–bottom chain')]),
    ].join(' &nbsp; '));
  }

  // The readout: typeset labels built once per state; values are plain numbers and marks.
  let kind = null;
  const cells = {};
  function build(k, rows) {
    if (kind === k) return;
    kind = k;
    setTex(ro, '<table>' + rows.map(([key, lab, cls = '']) => (key
      ? `<tr class="${cls}"><td>${lab}</td><td class="num" data-k="${key}" style="white-space:nowrap"></td></tr>`
      : `<tr class="${cls}"><td colspan="2" class="dim">${lab}</td></tr>`)).join('') + '</table>');
    for (const td of ro.querySelectorAll('[data-k]')) cells[td.dataset.k] = td;
  }
  const put = (k, html) => { if (cells[k] && cells[k].innerHTML !== html) cells[k].innerHTML = html; };
  const mark = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');

  function readout() {
    const res = st.res, ck = st.ck;
    if (!res.blocks) {
      build('open', [
        ['hyp', '$K$ meets every top-to-bottom chain'],
        ['len', 'an unmarked top-to-bottom chain (violet), squares'],
        [null, 'The hypothesis of Lemma 3.2(ii) fails, and the labelling has nothing to find.'],
        ['lat', 'a corner-connected crossing of $K$ from left to right', 'sep'],
        [null, 'There is none: it would meet the chain, by Lemma 3.2(i).'],
      ]);
      const lat = lateralCrossing(rows(), st.cols, st.marked);
      put('hyp', mark(false));
      put('len', String(res.chain.length));
      put('lat', `${lat ? 'found' : 'none'} ${mark(!lat)}`);
      return;
    }
    build('block', [
      ['hyp', '$K$ meets every top-to-bottom chain'],
      ['left', 'interface ends on the left side: odd', 'sep'],
      ['right', 'interface ends on the right side: odd'],
      ['odd', 'interior vertices of odd degree'],
      ['join', 'a component joins left to right', 'sep'],
      ['inK', 'its $B$ squares lying in $K$'],
      ['lat', 'successive ones meet at least at a corner, left column to right'],
    ]);
    const nB = res.crossing.length, nK = res.crossing.filter((i) => i >= 0 && st.marked[i]).length;
    put('hyp', mark(true));
    put('left', `${res.leftEnds} ${mark(ck.leftOdd)}`);
    put('right', `${res.rightEnds} ${mark(ck.rightOdd)}`);
    put('odd', `${res.oddInterior} ${mark(ck.evenInterior)}`);
    put('join', mark(ck.joined));
    put('inK', `${nK} of ${nB} ${mark(ck.inK)}`);
    put('lat', mark(ck.lateral));
  }

  // painting
  let paintVal = 1;
  const cellAt = (x, y) => {
    if (!lay) return -1;
    const c = Math.floor((x - lay.ox) / lay.s), r = Math.floor((y - lay.oy) / lay.s);
    return r >= 0 && r < rows() && c >= 0 && c < st.cols ? r * st.cols + c : -1;
  };
  const setCell = (i) => {
    if (i < 0 || st.marked[i] === paintVal) return;
    st.marked[i] = paintVal;
    if (!st.dirty) { st.dirty = true; presetChips.set(null); }
    cv.redraw();
  };
  pointer(cv.wrap, {
    down(x, y) { const i = cellAt(x, y); if (i < 0) return false; paintVal = st.marked[i] ? 0 : 1; setCell(i); return true; },
    move(x, y) { setCell(cellAt(x, y)); },
  });
  cv.canvas.style.cursor = 'crosshair';
  onTheme(() => cv.redraw());
}
