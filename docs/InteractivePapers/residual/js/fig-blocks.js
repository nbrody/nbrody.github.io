// Figure 3 — one block at a point: the triangles (2.4) as a table, rows = L-directions, columns = R-directions.

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';

// ---------- pure math ----------

// §2.3: d = r n1 + (r+1) n2 with n2 ∈ [r, 2r-1], n2 ≡ d (mod r), n1 ≥ r. Needs d ≥ 4r².
export function blockSizes(d, r) {
  let n2 = r + (((d - r) % r) + r) % r;
  const n1 = (d - (r + 1) * n2) / r;
  return { n1, n2, blocks: [{ s: r, t: n1 }, { s: r + 1, t: n2 }] };
}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// A bijection i ↦ (α(i), β(i)) ∈ Z/s × Z/t, as two arrays plus its inverse.
export function makeBijection(s, t, seed) {
  const n = s * t, perm = [...Array(n).keys()];
  const R = rng(seed);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const alpha = new Int32Array(n), beta = new Int32Array(n), inv = new Int32Array(n);
  for (let i = 0; i < n; i++) { alpha[i] = perm[i] % s; beta[i] = Math.floor(perm[i] / s); inv[perm[i]] = i; }
  return { s, t, alpha, beta, labelAt: (a, b) => inv[(((b % t) + t) % t) * s + (((a % s) + s) % s)] };
}

// The triangle (i,u,v) has sides x_{iuv}, L_{u,j}, R_{v,k}. Returns the table of labels.
export function triangleTable(bij, r, shift) {
  const { s, t, alpha, beta } = bij;
  const rows = r * s, cols = r * t;
  const table = Array.from({ length: rows * cols }, () => []);
  for (let i = 0; i < s * t; i++) for (let u = 0; u < r; u++) for (let v = 0; v < r; v++) {
    const j = shift ? (alpha[i] + v) % s : alpha[i];
    const k = shift ? (beta[i] + u) % t : beta[i];
    table[(u * s + j) * cols + (v * t + k)].push({ i, u, v });
  }
  return { rows, cols, table };
}

export function linkChecks(T, r) {
  const { rows, cols, table } = T;
  let filledOnce = 0, rowRepeats = 0, colRepeats = 0;
  for (const c of table) if (c.length === 1) filledOnce++;
  for (let a = 0; a < rows; a++) {
    const seen = new Map();
    for (let b = 0; b < cols; b++) for (const { i } of table[a * cols + b]) seen.set(i, (seen.get(i) || 0) + 1);
    for (const c of seen.values()) if (c > 1) rowRepeats += c - 1;
  }
  for (let b = 0; b < cols; b++) {
    const seen = new Map();
    for (let a = 0; a < rows; a++) for (const { i } of table[a * cols + b]) seen.set(i, (seen.get(i) || 0) + 1);
    for (const c of seen.values()) if (c > 1) colRepeats += c - 1;
  }
  return { filledOnce, cells: rows * cols, rowRepeats, colRepeats };
}

// ---------- figure ----------

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow', style: 'flex: 1 1 380px' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const st = { r: 2, d: 18, block: 0, shift: true, seed: 7, sel: null, hover: null };
  let bij, T, chk, geo = null;

  function rebuild() {
    const { blocks } = blockSizes(st.d, st.r);
    const b = blocks[st.block];
    bij = makeBijection(b.s, b.t, st.seed + 31 * st.block + 101 * st.d);
    T = triangleTable(bij, st.r, st.shift);
    chk = linkChecks(T, st.r);
    if (!st.sel || st.sel.i >= b.s * b.t || st.sel.u >= st.r || st.sel.v >= st.r) st.sel = { i: Math.floor(b.s * b.t / 2), u: 0, v: 0 };
    st.hover = null;
    if (typeof cv !== 'undefined' && cv.resize) cv.resize();
  }

  const PAD = { l: 46, t: 30, r: 8, b: 8 };
  const cellSize = (w) => Math.max(6, Math.min(34, (w - PAD.l - PAD.r) / T.cols));
  const cv = makeCanvas(left, { aspect: (w) => (PAD.t + PAD.b + T.rows * cellSize(w)) / w, maxHeight: 520, minHeight: 120, draw });

  function hue(i, n) { return (i * 360 / n + 200) % 360; }

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const { rows, cols, table } = T, { s, t } = bij, r = st.r, n = s * t;
    const cs = Math.min(cellSize(w), (h - PAD.t - PAD.b) / rows);
    const ox = PAD.l + ((w - PAD.l - PAD.r) - cs * cols) / 2, oy = PAD.t;
    geo = { ox, oy, cs, rows, cols };
    const sel = st.hover || st.sel;
    // cells
    for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) {
      const cell = table[a * cols + b];
      const x = ox + b * cs, y = oy + a * cs;
      if (!cell.length) continue;
      const { i } = cell[0];
      const isSel = sel && i === sel.i;
      const L = P.dark ? (isSel ? 58 : 32) : (isSel ? 62 : 86), C = P.dark ? 45 : 55;
      ctx.fillStyle = `hsl(${hue(i, n)} ${C}% ${L}%)`;
      ctx.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      if (cs >= 15) {
        ctx.fillStyle = isSel ? (P.dark ? '#fff' : '#000') : P.muted;
        ctx.font = `${isSel ? 700 : 500} ${Math.min(11, cs * 0.5)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), x + cs / 2, y + cs / 2 + Math.min(4, cs * 0.18));
      }
    }
    ctx.textAlign = 'left';
    // macro-block grid (u, v)
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6;
    for (let u = 0; u <= r; u++) { ctx.beginPath(); ctx.moveTo(ox, oy + u * s * cs); ctx.lineTo(ox + cols * cs, oy + u * s * cs); ctx.stroke(); }
    for (let v = 0; v <= r; v++) { ctx.beginPath(); ctx.moveTo(ox + v * t * cs, oy); ctx.lineTo(ox + v * t * cs, oy + rows * cs); ctx.stroke(); }
    // axis labels
    ctx.fillStyle = P.muted; ctx.font = '10.5px Inter, system-ui, sans-serif';
    for (let u = 0; u < r; u++) { ctx.textAlign = 'right'; ctx.fillText(`L, u=${u}`, ox - 5, oy + (u + 0.5) * s * cs + 4); }
    ctx.textAlign = 'center';
    for (let v = 0; v < r; v++) ctx.fillText(`R, v=${v}`, ox + (v + 0.5) * t * cs, oy - 9);
    ctx.textAlign = 'left';
    // the selected label's r² cells: the edge array x_{i u v}
    if (sel) {
      const cellsOf = [];
      for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) for (const c of table[a * cols + b]) if (c.i === sel.i) cellsOf.push({ a, b, ...c });
      for (const c of cellsOf) {
        const here = c.u === sel.u && c.v === sel.v;
        ctx.strokeStyle = here ? P.accent : P.ink; ctx.lineWidth = here ? 3 : 1.6;
        ctx.strokeRect(ox + c.b * cs + 1.5, oy + c.a * cs + 1.5, cs - 3, cs - 3);
      }
      // repeated label in a row (link at V) or column (link at W): join the repeats
      ctx.strokeStyle = P.accent2; ctx.lineWidth = 2.5;
      const byRow = new Map(), byCol = new Map();
      for (const c of cellsOf) { (byRow.get(c.a) || byRow.set(c.a, []).get(c.a)).push(c); (byCol.get(c.b) || byCol.set(c.b, []).get(c.b)).push(c); }
      for (const list of byRow.values()) if (list.length > 1) {
        list.sort((p, q) => p.b - q.b);
        ctx.beginPath(); ctx.moveTo(ox + (list[0].b + 0.5) * cs, oy + (list[0].a + 0.5) * cs);
        ctx.lineTo(ox + (list[list.length - 1].b + 0.5) * cs, oy + (list[0].a + 0.5) * cs); ctx.stroke();
      }
      for (const list of byCol.values()) if (list.length > 1) {
        list.sort((p, q) => p.a - q.a);
        ctx.beginPath(); ctx.moveTo(ox + (list[0].b + 0.5) * cs, oy + (list[0].a + 0.5) * cs);
        ctx.lineTo(ox + (list[0].b + 0.5) * cs, oy + (list[list.length - 1].a + 0.5) * cs); ctx.stroke();
      }
    }
    tri.redraw();
    updateReadout();
  }

  // the paper's Figure 1, labeled by the selected triangle
  const triWrap = el('div', { style: 'max-width: 260px' });
  right.append(triWrap);
  const tri = makeCanvas(triWrap, { aspect: 0.62, maxHeight: 170, draw: drawTri });
  function drawTri(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (!bij) return;
    const sel = st.hover || st.sel, { s, t, alpha, beta } = bij;
    const j = st.shift ? (alpha[sel.i] + sel.v) % s : alpha[sel.i];
    const k = st.shift ? (beta[sel.i] + sel.u) % t : beta[sel.i];
    // angles 3π/5 at O, π/5 at V and W: isosceles with base VW
    const base = w * 0.74, hgt = (base / 2) * Math.tan(Math.PI / 5);
    const Vx = (w - base) / 2, Wx = Vx + base, y0 = h * 0.78, Ox = w / 2, Oy = y0 - hgt;
    ctx.fillStyle = rgba(P.accent, 0.1); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Ox, Oy); ctx.lineTo(Vx, y0); ctx.lineTo(Wx, y0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillStyle = P.ink; ctx.textAlign = 'center';
    ctx.fillText('O', Ox, Oy - 6); ctx.fillText('V', Vx - 8, y0 + 4); ctx.fillText('W', Wx + 9, y0 + 4);
    ctx.font = '10.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = P.accent;
    ctx.fillText(`x(${sel.i + 1}; ${sel.u},${sel.v})`, w / 2, y0 + 15);
    ctx.fillStyle = P.muted;
    ctx.textAlign = 'right'; ctx.fillText(`L(${sel.u}, ${j})`, (Ox + Vx) / 2 - 4, (Oy + y0) / 2 - 2);
    ctx.textAlign = 'left'; ctx.fillText(`R(${sel.v}, ${k})`, (Ox + Wx) / 2 + 4, (Oy + y0) / 2 - 2);
    ctx.textAlign = 'center'; ctx.fillStyle = P.accent2; ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillText('3π/5', Ox, Oy + 17); ctx.fillText('π/5', Vx + 26, y0 - 5); ctx.fillText('π/5', Wx - 26, y0 - 5);
    ctx.textAlign = 'left';
  }

  const ctl = controls(right);
  slider(ctl, { label: 'r', min: 2, max: 3, step: 1, value: st.r, fmt: (v) => v, oninput: (v) => { st.r = v; st.d = Math.max(st.d, 4 * v * v); dS.input.min = 4 * v * v; dS.set(st.d); st.sel = null; rebuild(); cv.redraw(); } });
  const dS = slider(ctl, { label: 'degree d', min: 16, max: 48, step: 1, value: st.d, fmt: (v) => v, oninput: (v) => { st.d = v; st.sel = null; rebuild(); cv.redraw(); } });
  const ctl2 = controls(right); ctl2.style.marginTop = '.4rem';
  segmented(ctl2, [[0, 'block 1'], [1, 'block 2']], 0, (k) => { st.block = k; st.sel = null; rebuild(); cv.redraw(); });
  segmented(ctl2, [[true, 'shifted (2.4)'], [false, 'no shift']], true, (k) => { st.shift = k; rebuild(); cv.redraw(); });
  const ctl3 = controls(right); ctl3.style.marginTop = '.4rem';
  button(ctl3, 'Reshuffle the bijection', () => { st.seed++; rebuild(); cv.redraw(); });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Hover or click a cell. Outlined: the r² triangles of one label i, its edge array.'));

  function updateReadout() {
    const { blocks, n1, n2 } = blockSizes(st.d, st.r);
    const b = blocks[st.block], r = st.r;
    const mark = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    ro.innerHTML = `<table>
      <tr><td class="k">d = r·n₁ + (r+1)·n₂</td><td>${st.d} = ${r}·${n1} + ${r + 1}·${n2}</td></tr>
      <tr><td class="k">this block</td><td>|I_b| = ${b.s}·${b.t}, s,t ≥ r ${mark(b.s >= r && b.t >= r)}</td></tr>
      </table><hr><table>
      <tr><td>every (L, R) pair in one triangle</td><td>${chk.filledOnce}/${chk.cells} ${mark(chk.filledOnce === chk.cells)}</td></tr>
      <tr><td class="k">&nbsp;⇒ link at O: girth 4 · 3π/5 = 2π + 2π/5</td><td></td></tr>
      <tr><td>no label twice in a row (at V)</td><td>${mark(chk.rowRepeats === 0)}</td></tr>
      <tr><td>no label twice in a column (at W)</td><td>${mark(chk.colRepeats === 0)}</td></tr>
      </table><hr>${chk.rowRepeats + chk.colRepeats === 0
        ? '<span class="ok">links at V, W immerse in the incidence graph</span>'
        : `<span class="bad">4-cycle in the link at V: 4 · π/5 &lt; 2π</span>`}`;
  }

  function cellAt(x, y) {
    if (!geo) return null;
    const b = Math.floor((x - geo.ox) / geo.cs), a = Math.floor((y - geo.oy) / geo.cs);
    if (a < 0 || b < 0 || a >= geo.rows || b >= geo.cols) return null;
    const c = T.table[a * geo.cols + b];
    return c.length ? c[0] : null;
  }
  pointer(cv.wrap, {
    down(x, y) { const c = cellAt(x, y); if (c) { st.sel = c; st.hover = null; cv.redraw(); } return false; },
    hover(x, y) { const c = cellAt(x, y); const same = c && st.hover && c.i === st.hover.i && c.u === st.hover.u && c.v === st.hover.v; if (!same) { st.hover = c; cv.redraw(); } },
  });
  cv.wrap.addEventListener('pointerleave', () => { if (st.hover) { st.hover = null; cv.redraw(); } });

  rebuild();
  onTheme(() => cv.redraw());
}
