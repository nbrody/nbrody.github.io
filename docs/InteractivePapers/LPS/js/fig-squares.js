// Figure S5 — the square complex lab. S^{p,q}: one vertex, a loop for each pair α^{±1} of norm p
// (horizontal) and β^{±1} of norm q (vertical), and a square for each relation αβ = ±β'α'.
// Its hyperplanes, cut at ¼ and ¾ of every square, are the graphs Y^{p,q} and Y^{q,p}.
// The 3D view (flat gluing data folded into a space) is the quaternion calculator's
// FoldedComplexView, loaded on demand so node can import the math below.
import { el, makeCanvas, labelLayer, setTex, chips, button, slider, palette, onTheme, rgba, isDark, fmt } from './common.js';
import { buildY, quatToMatrix, sqrtMinusOne, modpow, geodesicArc, legendre } from './lps.js';
import { buildVHComplex } from '../../../GeometryofLinearGroups/Geometric/Tools/padicGroups/quaternionCalculator/quaternionPackage/vhComplex.js';

const FOLDED = '../../../GeometryofLinearGroups/Geometric/Tools/padicGroups/quaternionCalculator/vis/vis_folded.js';

/** Unordered pairs {p, q}, p < q, both ≡ 1 (mod 4); the folded view is comfortable up to ~60 squares. */
export const PAIRS = [[5, 13], [5, 17], [13, 17], [5, 29]];

// ───────────────────────── pure math (node-testable) ─────────────────────────

/**
 * The point of P¹(F_ℓ) of a quaternion γ of norm ℓ: its matrix mod ℓ (i ↦ √−1) has rank one,
 * and the point is its image. Points are 0, …, ℓ−1 and ∞ = ℓ, as in buildY.
 */
export function pointOf(gamma, ell, I = sqrtMinusOne(ell)) {
  const [a, b, c, d] = quatToMatrix(gamma, ell, I).map((x) => ((x % ell) + ell) % ell);
  const [x, y] = (a || c) ? [a, c] : [b, d];
  if (!x && !y) throw new Error('the matrix vanishes mod ' + ell);
  return y === 0 ? ell : (x * modpow(y, ell - 2, ell)) % ell;
}

/**
 * The ¼/¾ slices of one family of hyperplanes, as a graph.
 * family 'h' (horizontal hyperplanes, crossing the vertical edges β): vertices = the q + 1
 * generators β^{±1}, put at their points of P¹(F_q). Square s (bottom α, right β, top α',
 * left β', with αβ = ±β'α') gives the edge β' — β at height ¼ and β'⁻¹ — β⁻¹ at height ¾.
 * family 'v' (vertical hyperplanes, crossing the horizontal edges α): the same with the roles swapped.
 * Returns { ell, n, gens, point (gen → point), genAt (point → gen), edges: [{ a, b, s, slice }] }.
 */
export function sliceGraph(cx, family) {
  const gens = family === 'h' ? cx.B : cx.A, ell = family === 'h' ? cx.q : cx.p;
  const I = sqrtMinusOne(ell);
  const point = gens.map((g) => pointOf(g.q, ell, I));
  const genAt = new Array(ell + 1).fill(-1);
  point.forEach((z, g) => { genAt[z] = g; });
  const edges = [];
  cx.squares.forEach((sq, s) => {
    const [u, v] = family === 'h' ? [sq.left, sq.right] : [sq.bottom, sq.top];
    edges.push({ a: point[u], b: point[v], s, slice: 0 });
    edges.push({ a: point[gens[u].inv], b: point[gens[v].inv], s, slice: 1 });
  });
  return { ell, n: ell + 1, gens, point, genAt, edges, bijective: genAt.every((g) => g >= 0) };
}

/** Do the slice edges equal the edges of Y (as multisets of unordered pairs, loops included)? */
export function equalsY(G, Y) {
  const key = (u, v) => (u < v ? u + ',' + v : v + ',' + u);
  const want = new Map(), got = new Map();
  for (let z = 0; z < Y.n; z++) for (let s = 0; s < Y.k; s++) {
    const k = key(z, Y.nbr[z * Y.k + s]);
    want.set(k, (want.get(k) || 0) + 1);
  }
  // each undirected edge of Y is seen from both ends (a loop twice from its one end)
  for (const e of G.edges) { const k = key(e.a, e.b); got.set(k, (got.get(k) || 0) + 2); }
  if (want.size !== got.size) return false;
  for (const [k, m] of want) if (got.get(k) !== m) return false;
  return true;
}

/** Group slice edges by endpoints: [{ a, b, m, squares: [s…] }]. */
export function groupEdges(edges) {
  const g = new Map();
  for (const e of edges) {
    const a = Math.min(e.a, e.b), b = Math.max(e.a, e.b), k = a + ',' + b;
    if (!g.has(k)) g.set(k, { a, b, m: 0, squares: [] });
    const x = g.get(k);
    x.m++;
    if (!x.squares.includes(e.s)) x.squares.push(e.s);
  }
  return [...g.values()];
}

/** Everything the figure shows for one pair. */
export function labData(p, q) {
  const cx = buildVHComplex(p, q);
  const H = sliceGraph(cx, 'h'), V = sliceGraph(cx, 'v');
  const Ypq = buildY(p, q), Yqp = buildY(q, p);
  return {
    p, q, cx, H, V,
    okH: H.bijective && equalsY(H, Ypq),
    okV: V.bijective && equalsY(V, Yqp),
    counts: { h: cx.hEdges.length, v: cx.vEdges.length, squares: cx.squares.length, euler: cx.euler },
  };
}

/** TeX name of a generator: α_i or α_i^{-1} (letter 'alpha' for norm p, 'beta' for norm q). */
export function genTex(gens, g, letter) {
  const G = gens[g];
  return `\\${letter}_{${G.edge + 1}}${G.sign < 0 ? '^{-1}' : ''}`;
}

export function quatTexOf(x) {
  const parts = [], units = ['', '\\bi', '\\bj', '\\bk'];
  x.forEach((c, k) => {
    if (!c) return;
    const sgn = c < 0 ? '-' : parts.length ? '+' : '';
    const mag = Math.abs(c);
    parts.push(sgn + (k === 0 ? mag : (mag === 1 ? '' : mag) + units[k]));
  });
  return parts.length ? parts.join('') : '0';
}

export const pointTex = (z, ell) => (z === ell ? '\\infty' : String(z));

// ───────────────────────── the figure ─────────────────────────

export function mount(root) {
  const st = { pair: PAIRS[0], data: null, view: null, mod: null, sel: -1, hover: { h: null, v: null },
    show: { squares: true, edges: true, horizontal: true, vertical: false } };

  const top = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  top.append(left, right);
  root.append(top);

  const hint = el('p', { class: 'panel-hint' });
  left.append(hint);
  const stage = el('div', { class: 'cv-wrap squares-stage' });
  left.append(stage);
  const stageLabels = labelLayer(stage);
  const status = el('div', { class: 'squares-status' }, 'Loading the 3D view…');
  stage.append(status);
  const stageHeight = () => (stage.clientWidth < 520 ? 340 : 470);
  stage.style.height = stageHeight() + 'px';

  // controls
  const ctl = el('div', { class: 'controls' });
  right.append(ctl);
  const pairChips = chips(ctl, {
    label: 'the complex',
    options: PAIRS.map(([p, q]) => [p + ',' + q, `$S^{${p},${q}}$`]),
    value: '5,13',
    onchange: (k) => { st.pair = k.split(',').map(Number); build(); },
  });
  const showWrap = el('div', { class: 'chips' });
  const showName = el('span', { class: 'ctl-name' });
  setTex(showName, 'show');
  const showRow = el('div', { class: 'chip-row' });
  showWrap.append(showName, showRow);
  ctl.append(showWrap);
  const toggles = {};
  for (const [key, tex] of [['squares', 'squares'], ['edges', 'edges'], ['horizontal', '$Y^{p,q}$'], ['vertical', '$Y^{q,p}$']]) {
    const b = el('button', { type: 'button', class: 'chip' + (key === 'horizontal' ? ' chip-ypq' : key === 'vertical' ? ' chip-yqp' : '') });
    setTex(b, tex);
    b.addEventListener('click', () => { st.show[key] = !st.show[key]; applyShow(); });
    showRow.append(b);
    toggles[key] = b;
  }
  const foldS = slider(ctl, { label: 'flat $\\to$ folded', min: 0, max: 1, step: 0.01, value: 1, fmt: (v) => (v < 0.005 ? 'flat' : v > 0.995 ? 'folded' : v.toFixed(2)),
    oninput: (v) => { if (st.view) st.view.setFold(v); syncFoldButton(v); } });
  const coverS = slider(ctl, { label: 'slices', min: 0, max: 1, step: 0.01, value: 0, fmt: (v) => (v < 0.005 ? '$\\tfrac14,\\tfrac34$' : v > 0.995 ? '$\\tfrac12$' : v.toFixed(2)),
    oninput: (v) => { if (st.view) st.view.setCover(v); } });
  const btnRow = el('div', { class: 'btn-row' });
  ctl.append(btnRow);
  const foldBtn = button(btnRow, 'Lay it flat', () => {
    if (!st.view) return;
    st.view.animateFold(st.view.params.fold > 0.5 ? 0 : 1);
  });
  button(btnRow, 'New immersion', () => { if (st.view) { st.view.newImmersion(); } }, 'ghost');
  button(btnRow, 'Reset view', () => { if (st.view) st.view.resetCamera(); }, 'ghost');

  const ro = el('div', { class: 'readout' });
  right.append(ro);
  function syncFoldButton(t) { foldBtn.textContent = t > 0.5 ? 'Lay it flat' : 'Fold it up'; }

  // which colour is which loop
  const legend = el('div', { class: 'squares-legend' });
  left.append(legend);
  function buildLegend() {
    if (!st.mod || !st.data) return;
    const { cx } = st.data, m = cx.hEdges.length, n = cx.vEdges.length;
    const sw = (col, tex) => `<span class="sw"><i style="background:${col}"></i>$${tex}$</span>`;
    const hs = cx.hEdges.map((_, i) => sw(st.mod.hEdgeColor(i, m), `\\alpha_{${i + 1}}`)).join('');
    const vs = cx.vEdges.map((_, j) => sw(st.mod.vEdgeColor(j, n), `\\beta_{${j + 1}}`)).join('');
    setTex(legend, `<span class="lg-h">norm $${st.data.p}$: ${hs}</span><span class="lg-v">norm $${st.data.q}$: ${vs}</span>`);
  }

  // the two graphs
  const pair = el('div', { class: 'fig-row squares-ys' });
  root.append(pair);
  const panels = {};
  for (const fam of ['h', 'v']) {
    const box = el('div', { class: 'grow' });
    const head = el('p', { class: 'panel-hint' });
    box.append(head);
    pair.append(box);
    const cv = makeCanvas(box, { aspect: 1, maxHeight: 360, draw: (ctx, w, h) => drawY(fam, ctx, w, h) });
    panels[fam] = { head, cv, labels: labelLayer(cv.wrap), geom: null };
    cv.canvas.addEventListener('pointermove', (e) => hoverY(fam, e));
    cv.canvas.addEventListener('pointerleave', () => {
      st.hover[fam] = null;
      if (st.hoverSelected) { st.hoverSelected = false; if (st.view) st.view.select(-1); else st.sel = -1; }
      redrawYs(); updateReadout();
    });
  }
  const sq = el('div', { class: 'readout', style: 'margin-top:0.9rem' });
  root.append(sq);

  // ── data and the 3D view ──
  function build() {
    const [p, q] = st.pair;
    st.data = labData(p, q);
    st.sel = -1;
    st.hover = { h: null, v: null };
    setTex(hint, `$S^{${p},${q}}$: one vertex, ${st.data.counts.h} horizontal loops $\\alpha_i$ (norm $${p}$), ${st.data.counts.v} vertical loops $\\beta_j$ (norm $${q}$), and ${st.data.counts.squares} squares, one for each relation $\\alpha\\beta=\\pm\\beta'\\alpha'$. <b>Drag</b> to turn it; <b>click</b> a square.`);
    setTex(panels.h.head, `<b>$Y^{${p},${q}}$</b> on $\\PP^1(\\F_{${q}})$: the slices of the horizontal hyperplanes. Vertices are the $\\beta_j^{\\pm1}$, each at the point of its matrix mod $${q}$.`);
    setTex(panels.v.head, `<b>$Y^{${q},${p}}$</b> on $\\PP^1(\\F_{${p}})$: the slices of the vertical hyperplanes. Vertices are the $\\alpha_i^{\\pm1}$, each at the point of its matrix mod $${p}$.`);
    for (const fam of ['h', 'v']) panels[fam].cv.redraw();
    updateReadout();
    if (st.view) setComplex();
  }

  function setComplex() {
    st.view.select(-1);
    st.view.setComplex(st.data.cx);
    applyShow();
    buildLegend();
  }

  function themeColours() {
    const P = palette();
    if (st.mod) {
      st.mod.COLORS.hHyper = P.graph;
      st.mod.COLORS.vHyper = P.count;
    }
    if (st.view) {
      const bg = getComputedStyle(stage).backgroundColor;
      st.view.renderer.setClearColor(bg, 1);
      st.view.setParams({ arcColors: 'hyperplane' });
    }
  }

  function applyShow() {
    for (const [k, b] of Object.entries(toggles)) { b.classList.toggle('on', st.show[k]); b.setAttribute('aria-pressed', String(st.show[k])); }
    if (!st.view) return;
    const any = st.show.horizontal || st.show.vertical;
    st.view.setParams({ ...st.show, opacity: any ? 0.2 : 0.42 });
    redrawYs();
  }

  // load the 3D view when the figure mounts
  import(FOLDED).then((mod) => {
    st.mod = mod;
    status.textContent = '';
    status.style.display = 'none';
    st.view = new mod.FoldedComplexView(stage, {
      onSelect: (s) => { st.sel = s; redrawYs(); updateReadout(); },
    });
    const canvas = st.view.renderer.domElement;
    canvas.setAttribute('aria-label', 'The square complex in 3D; drag to turn it');
    stage.insertBefore(canvas, stageLabels.layer);
    // math labels in an HTML layer over the canvas (the view's own sprite labels are hidden)
    const render = st.view.renderer.render.bind(st.view.renderer);
    st.view.renderer.render = (scene, camera) => { render(scene, camera); placeLabels(); };
    st.view.onFold = (t) => { foldS.set(t); syncFoldButton(t); };
    st.view.onCover = (c) => coverS.set(c);
    st.view.params.labels = true;
    themeColours();
    setComplex();
    new ResizeObserver(() => {
      const h = stageHeight();
      if (stage.style.height !== h + 'px') stage.style.height = h + 'px';
      st.view.resize();
    }).observe(stage);
  }).catch((err) => {
    status.textContent = 'The 3D view could not load (' + (err && err.message ? err.message : err) + '). The two graphs below still work.';
  });

  onTheme(() => { themeColours(); redrawYs(); });

  function placeLabels() {
    const v = st.view, mod = st.mod;
    if (!v || !v.labelSprites || !v.cx) return;
    const out = [];
    const w = stage.clientWidth, h = stage.clientHeight;
    const show = v.labels && v.labels.visible;
    const tmp = placeLabels.tmp || (placeLabels.tmp = new v.camera.position.constructor());
    for (const sp of v.labelSprites) {
      sp.material.visible = false;
      if (!show || !sp.visible) continue;
      const { kind, i, lift } = sp.userData;
      sp.getWorldPosition(tmp);
      tmp.project(v.camera);
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) continue;
      const letter = kind === 'h' ? 'alpha' : 'beta';
      const tex = `\\${letter}_{${i + 1}}` + (lift !== undefined && lift > 0.5 ? '^{-1}' : '');
      const col = kind === 'h' ? mod.hEdgeColor(i, v.cx.hEdges.length) : mod.vEdgeColor(i, v.cx.vEdges.length);
      out.push({ id: kind + i + (lift === undefined ? 'e' : lift < 0.5 ? 'a' : 'b'), x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h, tex, anchor: 'c', cls: 'halo squares-label', color: col });
    }
    // the gluing data: label the sides of the flat squares (all of them when there is room)
    if (v._t !== undefined && v._t < 0.02 && typeof v._eval === 'function') {
      const { cx } = st.data, S = cx.squares.length, P3 = [0, 0, 0];
      const which = S <= 30 ? cx.squares.map((_, k) => k) : st.sel >= 0 ? [st.sel] : [];
      const m = cx.hEdges.length, n = cx.vEdges.length;
      for (const k of which) {
        const Sq = cx.squares[k];
        const sides = [
          [0.5, 0.15, genTex(cx.A, Sq.bottom, 'alpha'), mod.hEdgeColor(cx.A[Sq.bottom].edge, m)],
          [0.85, 0.5, genTex(cx.B, Sq.right, 'beta'), mod.vEdgeColor(cx.B[Sq.right].edge, n)],
          [0.5, 0.85, genTex(cx.A, Sq.top, 'alpha'), mod.hEdgeColor(cx.A[Sq.top].edge, m)],
          [0.15, 0.5, genTex(cx.B, Sq.left, 'beta'), mod.vEdgeColor(cx.B[Sq.left].edge, n)],
        ];
        sides.forEach(([u, w2, tex, col], j) => {
          v._eval(k, u, w2, P3);
          tmp.set(P3[0], P3[1], P3[2]).applyMatrix4(v.root.matrixWorld).project(v.camera);
          if (tmp.z > 1) return;
          out.push({ id: 'sq' + k + '_' + j, x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h, tex, anchor: 'c', cls: 'halo squares-label side', color: col });
        });
      }
    }
    stageLabels.set(out);
  }

  // ── the two graphs, drawn as in Figure 7 ──
  function layout(fam, w, h) {
    const G = fam === 'h' ? st.data.H : st.data.V;
    const n = G.n, cx = w / 2, cy = h / 2, r = Math.max(8, Math.min(w, h) / 2 - 46);
    const pts = [];
    for (let z = 0; z < n; z++) {
      const a = -Math.PI / 2 + (2 * Math.PI * z) / n;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), ux: Math.cos(a), uy: Math.sin(a) });
    }
    return { cx, cy, r, pts, G };
  }

  function drawY(fam, ctx, w, h) {
    if (!st.data) return;
    const P = palette();
    const col = fam === 'h' ? P.graph : P.count;
    const geo = layout(fam, w, h);
    panels[fam].geom = geo;
    const { cx, cy, r, pts, G } = geo;
    const groups = groupEdges(G.edges);
    const hv = st.hover[fam];
    const hot = (g) => (st.sel >= 0 && g.squares.includes(st.sel)) || (hv && hv.kind === 'edge' && hv.g === g) || (hv && hv.kind === 'point' && (g.a === hv.z || g.b === hv.z));
    const horo = (i) => Math.max(4, r * (0.035 + 0.024 * i));
    const drawEdge = (g, width) => {
      const A = pts[g.a], B = pts[g.b];
      ctx.beginPath();
      if (g.a === g.b) {
        for (let i = 0; i < g.m; i++) {
          const rr = horo(i);
          ctx.moveTo(A.x + A.ux * rr + rr, A.y + A.uy * rr);
          ctx.arc(A.x + A.ux * rr, A.y + A.uy * rr, rr, 0, 2 * Math.PI);
        }
        ctx.lineWidth = width;
        ctx.stroke();
        return;
      }
      ctx.lineWidth = width * (1 + 0.6 * (g.m - 1));
      const Gc = geodesicArc(Math.atan2(A.uy, A.ux), Math.atan2(B.uy, B.ux));
      ctx.moveTo(A.x, A.y);
      if (Gc.line) ctx.lineTo(B.x, B.y);
      else {
        const Cx = cx + r * Gc.cx, Cy = cy + r * Gc.cy, rho = Math.max(0, r * Gc.rho);
        const s1 = Math.atan2(A.y - Cy, A.x - Cx), s2 = Math.atan2(B.y - Cy, B.x - Cx);
        let sw = s2 - s1;
        while (sw > Math.PI) sw -= 2 * Math.PI;
        while (sw <= -Math.PI) sw += 2 * Math.PI;
        ctx.arc(Cx, Cy, rho, s1, s1 + sw, sw < 0);
      }
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    const anyHot = groups.some(hot);
    const base = Math.max(0.18, Math.min(0.6, 7 / Math.sqrt(groups.length)));
    ctx.strokeStyle = rgba(col, anyHot ? base * 0.4 : base);
    for (const g of groups) if (!hot(g)) drawEdge(g, 1);
    ctx.strokeStyle = col;
    for (const g of groups) if (hot(g)) drawEdge(g, 2.4);
    const lab = [];
    for (let z = 0; z < G.n; z++) {
      const Pt = pts[z];
      const on = hv && hv.kind === 'point' && hv.z === z;
      ctx.beginPath();
      ctx.arc(Pt.x, Pt.y, on ? 5.5 : 3.6, 0, 2 * Math.PI);
      ctx.fillStyle = on ? col : P.ink;
      ctx.fill();
      const loops = groups.filter((g) => g.a === z && g.b === z).reduce((m, g) => m + g.m, 0);
      const off = loops ? 2 * horo(loops - 1) + 12 : 16;
      lab.push({ id: 'p' + z, x: cx + (r + off) * Pt.ux, y: cy + (r + off) * Pt.uy, tex: pointTex(z, G.ell), anchor: 'c', cls: on ? '' : 'small' });
    }
    panels[fam].labels.set(lab);
  }

  function redrawYs() { for (const fam of ['h', 'v']) panels[fam].cv.redraw(); }

  function hoverY(fam, e) {
    const geo = panels[fam].geom;
    if (!geo) return;
    const rect = panels[fam].cv.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = null, bd = 14;
    geo.pts.forEach((Pt, z) => { const d = Math.hypot(Pt.x - x, Pt.y - y); if (d < bd) { bd = d; best = { kind: 'point', z }; } });
    if (!best) {
      // nearest edge: sample each group's geodesic
      const groups = groupEdges(geo.G.edges);
      let bestD = 7;
      for (const g of groups) {
        if (g.a === g.b) continue;
        const A = geo.pts[g.a], B = geo.pts[g.b];
        const Gc = geodesicArc(Math.atan2(A.uy, A.ux), Math.atan2(B.uy, B.ux));
        for (let k = 1; k < 24; k++) {
          const t = k / 24;
          let px, py;
          if (Gc.line) { px = A.x + (B.x - A.x) * t; py = A.y + (B.y - A.y) * t; }
          else {
            const Cx = geo.cx + geo.r * Gc.cx, Cy = geo.cy + geo.r * Gc.cy, rho = geo.r * Gc.rho;
            const s1 = Math.atan2(A.y - Cy, A.x - Cx), s2 = Math.atan2(B.y - Cy, B.x - Cx);
            let sw = s2 - s1;
            while (sw > Math.PI) sw -= 2 * Math.PI;
            while (sw <= -Math.PI) sw += 2 * Math.PI;
            px = Cx + rho * Math.cos(s1 + sw * t); py = Cy + rho * Math.sin(s1 + sw * t);
          }
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = { kind: 'edge', g }; }
        }
      }
    }
    const same = JSON.stringify(best && (best.kind === 'point' ? best.z : [best.g.a, best.g.b])) === JSON.stringify(st.hover[fam] && (st.hover[fam].kind === 'point' ? st.hover[fam].z : [st.hover[fam].g.a, st.hover[fam].g.b]));
    if (same) return;
    st.hover[fam] = best;
    if (best && best.kind === 'edge') {
      st.hoverSelected = true;
      if (st.view) st.view.select(best.g.squares[0]); else st.sel = best.g.squares[0];
    } else if (st.hoverSelected) {
      st.hoverSelected = false;
      if (st.view) st.view.select(-1); else st.sel = -1;
    }
    redrawYs();
    updateReadout();
  }

  // ── readouts ──
  function updateReadout() {
    const D = st.data;
    if (!D) return;
    const { p, q, counts } = D;
    const cH = D.cx.hHyperplanes.components, cV = D.cx.vHyperplanes.components;
    const sides = (C) => (C.every((c) => !c.twoSided) ? 'one-sided' : C.every((c) => c.twoSided) ? 'two-sided' : 'mixed');
    setTex(ro, `<table>
      <tr><td>vertices</td><td class="num">1</td></tr>
      <tr><td>loops $\\alpha_i$, $\\beta_j$</td><td class="num">${counts.h} + ${counts.v}</td></tr>
      <tr><td>squares $\\frac{(p+1)(q+1)}4$</td><td class="num">${counts.squares}</td></tr>
      <tr><td>Euler characteristic $\\frac{(p-1)(q-1)}4$</td><td class="num">${counts.euler}</td></tr>
      <tr class="sep"><td colspan="2">link of the vertex: $K_{${p + 1},${q + 1}}$, a corner for every pair $(\\alpha^{\\pm1},\\beta^{\\pm1})$</td></tr>
      <tr class="sep"><td colspan="2"><span class="${D.okH ? 'ok' : 'bad'}">${D.okH ? '✓' : '✗'}</span> horizontal slices $=Y^{${p},${q}}$, edge for edge</td></tr>
      <tr><td colspan="2"><span class="${D.okV ? 'ok' : 'bad'}">${D.okV ? '✓' : '✗'}</span> vertical slices $=Y^{${q},${p}}$, edge for edge</td></tr>
      <tr><td colspan="2" class="dim">hyperplanes: ${cH.length} horizontal, ${cV.length} vertical; all ${sides([...cH, ...cV])}, so each one's slices are connected</td></tr>
    </table>`);
    updateSquare();
  }

  function updateSquare() {
    const D = st.data;
    const hvH = st.hover.h, hvV = st.hover.v;
    const pointLine = (fam, hv) => {
      const G = fam === 'h' ? D.H : D.V, letter = fam === 'h' ? 'beta' : 'alpha';
      const g = G.genAt[hv.z];
      const quat = G.gens[g].q;
      return `The point $${pointTex(hv.z, G.ell)}\\in\\PP^1(\\F_{${G.ell}})$ is $${genTex(G.gens, g, letter)}=${quatTexOf(quat)}$: its matrix mod $${G.ell}$ has rank one, with image this point.`;
    };
    if (hvH && hvH.kind === 'point') { setTex(sq, pointLine('h', hvH)); return; }
    if (hvV && hvV.kind === 'point') { setTex(sq, pointLine('v', hvV)); return; }
    const s = st.sel;
    if (s < 0) {
      setTex(sq, '<span class="dim"><b>Click</b> a square, or <b>hover</b> an edge of either graph: each square gives two edges of $Y^{p,q}$ (its horizontal slices at heights $\\frac14$, $\\frac34$) and two of $Y^{q,p}$ (its vertical slices). <b>Hover</b> a point to see which generator sits there.</span>');
      return;
    }
    const { cx, H, V } = D, Sq = cx.squares[s];
    const A = (g) => genTex(cx.A, g, 'alpha'), B = (g) => genTex(cx.B, g, 'beta');
    const sign = Sq.sign < 0 ? '-' : '';
    const qa = quatTexOf(cx.A[Sq.bottom].q), qb = quatTexOf(cx.B[Sq.right].q), qb2 = quatTexOf(cx.B[Sq.left].q), qa2 = quatTexOf(cx.A[Sq.top].q);
    const e = (G, u, v) => `$${pointTex(G.point[u], G.ell)}$ — $${pointTex(G.point[v], G.ell)}$`;
    setTex(sq, `Square ${s + 1}: $${A(Sq.bottom)}\\,${B(Sq.right)}=${sign}${B(Sq.left)}\\,${A(Sq.top)}$, that is $(${qa})(${qb})=${sign}(${qb2})(${qa2})$.<br>
      Its horizontal slices are the edges ${e(H, Sq.left, Sq.right)} and ${e(H, cx.B[Sq.left].inv, cx.B[Sq.right].inv)} of $Y^{${D.p},${D.q}}$; its vertical slices are ${e(V, Sq.bottom, Sq.top)} and ${e(V, cx.A[Sq.bottom].inv, cx.A[Sq.top].inv)} of $Y^{${D.q},${D.p}}$.`);
  }

  build();
}
