// Figure 4 — Lemma 3.2(ii) by the paper's labeling argument.

import { el, controls, slider, button, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';

export function analyze(n, marked) {
  const idx = (r, c) => r * n + c;
  // A = unmarked squares reachable from the top through edge-adjacent unmarked squares
  const A = new Uint8Array(n * n), prev = new Int32Array(n * n).fill(-2), q = [];
  for (let c = 0; c < n; c++) if (!marked[idx(0, c)]) { A[idx(0, c)] = 1; prev[idx(0, c)] = -1; q.push(idx(0, c)); }
  for (let h = 0; h < q.length; h++) {
    const u = q[h], r = (u / n) | 0, c = u % n;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const v = idx(rr, cc);
      if (!marked[v] && !A[v]) { A[v] = 1; prev[v] = u; q.push(v); }
    }
  }
  for (let c = 0; c < n; c++) if (A[idx(n - 1, c)]) {
    const chain = []; for (let v = idx(n - 1, c); v !== -1; v = prev[v]) chain.push(v);
    return { blocks: false, A, chain };
  }
  // labels for rows -1..n (row -1: appended A, row n: appended B)
  const L = (r, c) => (r < 0 ? 1 : r >= n ? 0 : A[idx(r, c)]); // 1 = A, 0 = B
  // interface edges on vertex grid: vertex (i, j), i = 0..n+2 (row lines), j = 0..n
  const V = (i, j) => i * (n + 1) + j;
  const adj = new Map();
  const edges = [];
  const addEdge = (a, b, bSquare) => {
    edges.push([a, b, bSquare]);
    const k = edges.length - 1;
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, k]); adj.get(b).push([a, k]);
  };
  for (let r = -1; r < n; r++) for (let c = 0; c < n; c++) {
    if (L(r, c) !== L(r + 1, c)) {
      const bSq = L(r, c) === 0 ? [r, c] : [r + 1, c];
      addEdge(V(r + 2, c), V(r + 2, c + 1), bSq);
    }
  }
  for (let r = -1; r <= n; r++) for (let c = 0; c < n - 1; c++) {
    if (L(r, c) !== L(r, c + 1)) {
      const bSq = L(r, c) === 0 ? [r, c] : [r, c + 1];
      addEdge(V(r + 1, c + 1), V(r + 2, c + 1), bSq);
    }
  }
  let leftEnds = 0, rightEnds = 0;
  for (const [a, b] of edges) {
    for (const v of [a, b]) { const j = v % (n + 1); if (j === 0) leftEnds++; if (j === n) rightEnds++; }
  }
  // BFS through interface graph from left-boundary vertices to a right-boundary vertex
  const start = [...adj.keys()].filter((v) => v % (n + 1) === 0);
  const pv = new Map(), pe = new Map(), qq = [];
  for (const s of start) { pv.set(s, -1); qq.push(s); }
  let goal = -1;
  for (let h = 0; h < qq.length && goal < 0; h++) {
    const u = qq[h];
    if (u % (n + 1) === n) { goal = u; break; }
    for (const [v, k] of adj.get(u)) if (!pv.has(v)) { pv.set(v, u); pe.set(v, k); qq.push(v); }
  }
  const pathEdges = [], crossing = new Set();
  if (goal >= 0) {
    for (let v = goal; pv.get(v) !== -1; v = pv.get(v)) {
      const k = pe.get(v); pathEdges.push(k);
      const [r, c] = edges[k][2];
      if (r >= 0 && r < n) crossing.add(idx(r, c));
    }
  }
  return { blocks: true, A, edges, pathEdges, crossing, leftEnds, rightEnds, goalFound: goal >= 0 };
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' });
  const right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const n = 16;
  const st = { marked: new Uint8Array(n * n), density: 0.56, res: null };

  // a pleasant default: a wiggly band that blocks
  function example() {
    st.marked.fill(0);
    let r = 7;
    for (let c = 0; c < n; c++) {
      st.marked[r * n + c] = 1;
      const step = Math.round(Math.sin(c * 0.9) * 1.4 + Math.cos(c * 0.37) * 0.8);
      const r2 = Math.max(2, Math.min(n - 3, 7 + step));
      for (let k = Math.min(r, r2); k <= Math.max(r, r2); k++) st.marked[k * n + c] = 1;
      r = r2;
    }
    for (let k = 0; k < 26; k++) st.marked[((Math.random() * n) | 0) * n + ((Math.random() * n) | 0)] = 1;
  }
  example();

  const cv = makeCanvas(left, { aspect: 1.12, maxHeight: 560, draw });
  let geo = null;

  function draw(ctx, w, h) {
    const P = palette();
    st.res = analyze(n, st.marked);
    const res = st.res;
    const pad = 10, band = 12;
    const s = Math.min((w - 2 * pad) / n, (h - 2 * pad - 2 * band - 8) / n);
    const ox = (w - s * n) / 2, oy = (h - s * n) / 2;
    geo = { s, ox, oy };
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const colA = P.dark ? '#22345e' : '#dde7fb', colB = P.dark ? '#2a2c33' : '#efece6';
    const colMarked = P.dark ? '#c9c4b8' : '#3b3833';
    // appended rows
    if (res.blocks) {
      ctx.fillStyle = colA; ctx.fillRect(ox, oy - band - 2, s * n, band);
      ctx.fillStyle = P.dark ? '#3a3d47' : '#d9d5cc'; ctx.fillRect(ox, oy + s * n + 2, s * n, band);
      ctx.font = '9.5px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted;
      ctx.fillText('appended A row', ox + 4, oy - 4.5);
      ctx.fillText('appended B row', ox + 4, oy + s * n + band - 1);
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      let fill;
      if (st.marked[i]) fill = colMarked;
      else if (res.blocks) fill = res.A[i] ? colA : colB;
      else fill = res.A[i] ? colA : P.panel;
      ctx.fillStyle = fill;
      ctx.fillRect(ox + c * s + 0.5, oy + r * s + 0.5, s - 1, s - 1);
    }
    if (!res.blocks) {
      ctx.strokeStyle = P.accent3; ctx.lineWidth = Math.max(3, s * 0.28); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      res.chain.forEach((i, k) => { const r = (i / n) | 0, c = i % n; const x = ox + (c + 0.5) * s, y = oy + (r + 0.5) * s; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    } else {
      // all interface edges
      const vx = (v) => ox + (v % (n + 1)) * s, vy = (v) => oy + (Math.floor(v / (n + 1)) - 1) * s;
      ctx.strokeStyle = rgba(P.accent, 0.55); ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const [a, b] of res.edges) { ctx.moveTo(vx(a), vy(a)); ctx.lineTo(vx(b), vy(b)); }
      ctx.stroke();
      // the lateral crossing inside K
      for (const i of res.crossing) {
        const r = (i / n) | 0, c = i % n;
        ctx.strokeStyle = P.accent2; ctx.lineWidth = 2.2;
        ctx.strokeRect(ox + c * s + 2, oy + r * s + 2, s - 4, s - 4);
      }
      // chosen interface component path
      ctx.strokeStyle = P.accent2; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const k of res.pathEdges) { const [a, b] = res.edges[k]; ctx.moveTo(vx(a), vy(a)); ctx.lineTo(vx(b), vy(b)); }
      ctx.stroke();
    }
    // frame
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, s * n, s * n);
    ctx.fillStyle = P.accent2; ctx.fillRect(ox - 4, oy, 3, s * n); ctx.fillRect(ox + s * n + 1, oy, 3, s * n);
    updateReadout();
  }

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  slider(ctl, { label: 'density', min: 0.3, max: 0.75, step: 0.01, value: st.density, fmt: (v) => v.toFixed(2), oninput: (v) => { st.density = v; } });
  const ctl2 = controls(right);
  button(ctl2, 'Random blocker', () => { for (let i = 0; i < n * n; i++) st.marked[i] = Math.random() < st.density ? 1 : 0; cv.redraw(); }, 'primary');
  button(ctl2, 'Example', () => { example(); cv.redraw(); });
  button(ctl2, 'Clear', () => { st.marked.fill(0); cv.redraw(); });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  const legend = el('div', { class: 'hint' });
  legend.innerHTML = `<span style="color:var(--accent)">━</span> A/B interfaces &nbsp; <span style="color:var(--accent-2)">━</span> component joining the sides, with the marked squares along it &nbsp; <span style="color:var(--accent-3)">━</span> unmarked top–bottom chain`;
  right.append(legend);

  function updateReadout() {
    const res = st.res;
    if (!res) return;
    if (!res.blocks) {
      ro.innerHTML = `<b>Not a blocker.</b> An edge-adjacent chain of unmarked squares joins top and bottom (${res.chain.length} squares), so K misses a top-to-bottom path.`;
    } else {
      ro.innerHTML = `<b>K blocks every top-to-bottom chain.</b>
        <table style="margin-top:.35rem">
        <tr><td class="k">interface ends on the left side</td><td>${res.leftEnds} <span class="${res.leftEnds % 2 ? 'ok' : 'bad'}">(${res.leftEnds % 2 ? 'odd' : 'even'})</span></td></tr>
        <tr><td class="k">interface ends on the right side</td><td>${res.rightEnds} <span class="${res.rightEnds % 2 ? 'ok' : 'bad'}">(${res.rightEnds % 2 ? 'odd' : 'even'})</span></td></tr>
        <tr><td class="k">component joining the sides</td><td><span class="${res.goalFound ? 'ok' : 'bad'}">${res.goalFound ? 'found' : 'none'}</span></td></tr>
        <tr><td class="k">marked squares along it</td><td>${res.crossing.size}</td></tr>
        </table>
        <div class="k" style="margin-top:.3rem">Labels start at A and end at B down each side, so each side has an odd number of interface ends. A component therefore runs from side to side, and the B squares along it are marked squares touching at least at corners.</div>`;
    }
  }

  let paintVal = 1;
  const cellAt = (x, y) => {
    if (!geo) return -1;
    const c = Math.floor((x - geo.ox) / geo.s), r = Math.floor((y - geo.oy) / geo.s);
    return r >= 0 && r < n && c >= 0 && c < n ? r * n + c : -1;
  };
  pointer(cv.wrap, {
    down(x, y) { const i = cellAt(x, y); if (i < 0) return false; paintVal = st.marked[i] ? 0 : 1; st.marked[i] = paintVal; cv.redraw(); return true; },
    move(x, y) { const i = cellAt(x, y); if (i >= 0 && st.marked[i] !== paintVal) { st.marked[i] = paintVal; cv.redraw(); } },
  });
  onTheme(() => cv.redraw());
}
