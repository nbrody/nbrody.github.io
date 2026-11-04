// Figure 7 — Theorem 4.4: the graphs Y^{p,q} on the q+1 points of P^1(F_q).
// Draws Y around a circle, its spectrum against the Ramanujan window, and (when the
// spectrum of X^{p,q} is affordable) checks spec Y ⊆ spec X.
import { el, cssVar, makeCanvas, labelLayer, setTex, chips, slider, controls, pointer, palette, onTheme, ticks, rgba } from './common.js';
import { buildY, denseAdjacency, symEigenvalues, lambdaX, legendre, primes1mod4, orderX, geodesicArc } from './lps.js';

export { geodesicArc };
import { getSpectrum, peekSpectrum, SPECTRUM_PAIRS } from './spectrum.js';

const P_CHOICES = [5, 13, 17, 29];
const Q_MAX = 200;

// ───────────────────────── pure math (node-testable) ─────────────────────────

/** Admissible q for a given p: primes ≡ 1 (mod 4) up to qmax, q ≠ p. */
export function qChoices(p, qmax = Q_MAX) {
  return primes1mod4(5, qmax).filter((q) => q !== p);
}

/**
 * Undirected edges of Y: one per point z and generator pair j (z ~ α_j z); the conjugate
 * ᾱ_j gives the same edges backwards. Repeated edges get increasing `rank` so they can be
 * drawn apart; a === b is a loop.
 */
export function yEdges(Y) {
  const { n, k, nbr } = Y, out = [], seen = new Map();
  for (let z = 0; z < n; z++) {
    for (let s = 0; s < k; s += 2) {
      const w = nbr[z * k + s];
      const key = z < w ? z + ',' + w : w + ',' + z;
      const rank = seen.get(key) || 0;
      seen.set(key, rank + 1);
      out.push({ a: z, b: w, j: s / 2, rank });
    }
  }
  return out;
}

export function ySpectrum(Y) {
  return symEigenvalues(denseAdjacency(Y), Y.n);
}

/** Is every eigenvalue of Y (as a set) an eigenvalue of X? */
export function contained(lamY, lamX, tol = 1e-6) {
  const xs = Float64Array.from(lamX).sort();
  return Array.from(lamY).every((y) => {
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < y) lo = mid + 1; else hi = mid; }
    const best = Math.min(Math.abs(xs[lo] - y), lo > 0 ? Math.abs(xs[lo - 1] - y) : Infinity);
    return best <= tol * Math.max(1, Math.abs(y));
  });
}

/** Group sorted eigenvalues into (value, multiplicity). */
export function multiplicities(lam, tol = 1e-7) {
  const xs = Array.from(lam).sort((a, b) => a - b), out = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.v - x) <= tol * Math.max(1, Math.abs(x))) last.m++;
    else out.push({ v: x, m: 1 });
  }
  return out;
}

/** Undirected edges grouped by endpoints: [{ a, b, m }] with m the multiplicity (a === b: m loops). */
export function edgeGroups(edges) {
  const g = new Map();
  for (const e of edges) {
    const key = e.a < e.b ? e.a + ',' + e.b : e.b + ',' + e.a;
    const cur = g.get(key);
    if (cur) cur.m++; else g.set(key, { a: Math.min(e.a, e.b), b: Math.max(e.a, e.b), m: 1 });
  }
  return [...g.values()];
}

const isAffordable = (p, q) => SPECTRUM_PAIRS.some(([a, b]) => a === p && b === q);

// ───────────────────────── figure ─────────────────────────

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { p: 5, q: 29, Y: null, edges: [], lam: null, mult: [], hover: null, lamX: null, xState: 'none', token: 0 };
  let qList = qChoices(st.p);

  const cvC = makeCanvas(left, { aspect: 1, maxHeight: 500, minHeight: 260, draw: drawCircle });
  const labC = labelLayer(cvC.wrap);
  const cvS = makeCanvas(left, { aspect: (w) => (w < 520 ? 0.36 : 0.24), minHeight: 104, maxHeight: 150, draw: drawStrip });
  const labS = labelLayer(cvS.wrap);
  const hint = el('div', { class: 'hint' });
  left.append(hint);

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  chips(ctl, {
    label: '$p$',
    options: P_CHOICES.map((p) => [String(p), `$${p}$`]),
    value: String(st.p),
    onchange: (key) => {
      const p = +key;
      qList = qChoices(p);
      let q = st.q;
      if (!qList.includes(q)) q = qList.reduce((a, b) => (Math.abs(b - q) < Math.abs(a - q) ? b : a));
      qs.setRange(0, qList.length - 1);
      qs.set(qList.indexOf(q));
      build(p, q);
    },
  });
  const qs = slider(ctl, {
    label: '$q$', min: 0, max: qList.length - 1, step: 1, value: qList.indexOf(st.q),
    fmt: (i) => qList[i], oninput: (i) => build(st.p, qList[i]),
  });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro, el('div', { class: 'hint' }, 'Hover or tap a point to see its neighbours.'));

  function build(p, q) {
    st.p = p; st.q = q;
    st.Y = buildY(p, q);
    st.edges = yEdges(st.Y);
    st.groups = edgeGroups(st.edges);
    st.lam = ySpectrum(st.Y);
    st.mult = multiplicities(st.lam);
    st.hover = null;
    st.lamX = null;
    const token = ++st.token;
    const cached = peekSpectrum(p, q);
    if (cached || isAffordable(p, q)) {
      st.xState = 'pending';
      getSpectrum(p, q).then((res) => {
        if (token !== st.token) return;
        st.lamX = res.lam; st.xState = 'done';
        updateReadout(); cvS.redraw();
      }).catch(() => { if (token === st.token) { st.xState = 'none'; updateReadout(); } });
    } else st.xState = 'none';
    updateReadout();
    setHint();
    cvC.redraw();
    cvS.redraw();
  }

  function updateReadout() {
    const { p, q, lam } = st, k = p + 1, R = 2 * Math.sqrt(p), n = q + 1;
    const top = lam[0], bottom = lam[lam.length - 1];
    const lY = lambdaX(lam, k);
    const leg = legendre(p, q);
    const okTop = Math.abs(top - k) < 1e-7;
    const okRam = lY <= R + 1e-9;
    const okNB = bottom > -k + 1e-6;
    const ok = (b) => (b ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    let xrow;
    if (st.xState === 'done') {
      const c = contained(lam, st.lamX);
      xrow = `$\\spec Y^{${p},${q}}\\subseteq\\spec X^{${p},${q}}$ ${ok(c)}`;
    } else if (st.xState === 'pending') {
      xrow = `<span class="dim">Computing $\\spec X^{${p},${q}}$ to compare…</span>`;
    } else {
      xrow = `<span class="dim">$\\spec X^{${p},${q}}$ not compared: $|X^{${p},${q}}|=${orderX(p, q).toLocaleString('en-US').replace(/,/g, '{,}')}$ is too large to diagonalize here.</span>`;
    }
    setTex(ro, `<table>
      <tr><td>vertices $q+1$</td><td class="num">${n}</td></tr>
      <tr><td>degree $p+1$</td><td class="num">${k}</td></tr>
      <tr><td>$\\leg{${p}}{${q}}$</td><td class="num">$${leg}$</td></tr>
      <tr class="sep"><td colspan="2">top eigenvalue $=${top.toFixed(4)}=p+1$ ${ok(okTop)}</td></tr>
      <tr><td colspan="2">$\\lambda(Y)=${lY.toFixed(4)}\\le2\\sqrt{${p}}=${R.toFixed(4)}$ ${ok(okRam)}</td></tr>
      <tr><td colspan="2">smallest $=${bottom.toFixed(4)}\\gt-(p+1)=-${k}$ ${ok(okNB)}</td></tr>
      <tr><td colspan="2" class="dim">${leg === -1 ? `$X^{${p},${q}}$ is bipartite here, yet $Y^{${p},${q}}$ is not.` : `$X^{${p},${q}}$ is not bipartite here.`}</td></tr>
      <tr class="sep"><td colspan="2">${xrow}</td></tr>
    </table>`);
  }

  const pointTex = (z) => (z === st.q ? '\\infty' : String(z));

  function setHint() {
    if (st.hover === null) {
      setTex(hint, `$Y^{${st.p},${st.q}}$ joins each $\\xi\\in\\PP^1(\\F_{${st.q}})$ to $\\gamma\\xi$ for the ${st.p + 1} generators $\\gamma$.`);
      return;
    }
    const z = st.hover, { k, nbr } = st.Y;
    const imgs = [];
    for (let s = 0; s < k; s++) imgs.push(pointTex(nbr[z * k + s]));
    setTex(hint, `$\\xi=${pointTex(z)}$ is joined to $${imgs.join(',\\ ')}$.`);
  }

  // geometry of the circle, shared by drawing and hit-testing
  function layout(w, h) {
    const n = st.Y.n, cx = w / 2, cy = h / 2, r = Math.max(8, Math.min(w, h) / 2 - 50); // room outside for loops and labels; a canvas can be tiny mid-resize
    const pts = [];
    for (let z = 0; z < n; z++) {
      const a = -Math.PI / 2 + (2 * Math.PI * z) / n;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), ux: Math.cos(a), uy: Math.sin(a) });
    }
    return { cx, cy, r, pts };
  }

  function drawCircle(ctx, w, h) {
    if (!st.Y) return;
    const P = palette();
    const { cx, cy, r, pts } = layout(w, h);
    const n = st.Y.n, E = st.groups.length;
    const baseAlpha = Math.max(0.16, Math.min(0.6, 8 / Math.sqrt(E)));
    const hv = st.hover;

    // edges are hyperbolic geodesics between ideal points of the Poincaré disk; a repeated edge
    // is one geodesic drawn thicker; a loop (a fixed point) is a small circle outside the disk, tangent at its point
    const horo = (i) => Math.max(5, r * (0.04 + 0.028 * i)); // nested outward for several loops
    const drawEdge = (g, width) => {
      const A = pts[g.a], B = pts[g.b];
      ctx.lineWidth = width * (1 + 0.75 * (g.m - 1));
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
      const G = geodesicArc(Math.atan2(A.uy, A.ux), Math.atan2(B.uy, B.ux));
      ctx.moveTo(A.x, A.y);
      if (G.line) ctx.lineTo(B.x, B.y);
      else {
        const Cx = cx + r * G.cx, Cy = cy + r * G.cy, rho = Math.max(0, r * G.rho);
        const s1 = Math.atan2(A.y - Cy, A.x - Cx), s2 = Math.atan2(B.y - Cy, B.x - Cx);
        let sw = s2 - s1;
        while (sw > Math.PI) sw -= 2 * Math.PI;
        while (sw <= -Math.PI) sw += 2 * Math.PI;
        ctx.arc(Cx, Cy, rho, s1, s1 + sw, sw < 0);
      }
      ctx.stroke();
    };

    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(P.graph, hv === null ? baseAlpha : baseAlpha * 0.35);
    for (const g of st.groups) if (hv === null || (g.a !== hv && g.b !== hv)) drawEdge(g, 1);
    if (hv !== null) {
      ctx.strokeStyle = P.graph;
      for (const g of st.groups) if (g.a === hv || g.b === hv) drawEdge(g, 2);
    }

    const near = new Set();
    if (hv !== null) for (let s = 0; s < st.Y.k; s++) near.add(st.Y.nbr[hv * st.Y.k + s]);
    const rad = n <= 60 ? 3.6 : n <= 120 ? 2.8 : 2.2;
    for (let z = 0; z < n; z++) {
      const Pt = pts[z];
      ctx.beginPath();
      ctx.arc(Pt.x, Pt.y, z === hv ? rad + 2.5 : near.has(z) ? rad + 1.5 : rad, 0, 2 * Math.PI);
      ctx.fillStyle = z === hv || near.has(z) ? P.graph : P.ink;
      ctx.fill();
    }

    const loops = [];
    for (const g of st.groups) if (g.a === g.b) loops[g.a] = g.m;
    // labels: every point when there is room, otherwise 0, ∞ and a few others
    const lab = [];
    const step = n <= 42 ? 1 : Math.max(1, Math.round(n / 12));
    for (let z = 0; z < n; z++) {
      if (!(z === st.q || z === hv || z % step === 0)) continue;
      const Pt = pts[z];
      const off = loops[z] ? 2 * horo(loops[z] - 1) + 13 : 20; // clear of the loops at z
      lab.push({ id: 'p' + z, x: cx + (r + off) * Pt.ux, y: cy + (r + off) * Pt.uy, tex: pointTex(z), anchor: 'c', cls: z === hv ? '' : 'small' });
    }
    labC.set(lab);
  }

  function drawStrip(ctx, w, h) {
    if (!st.lam) return;
    const P = palette();
    const k = st.p + 1, R = 2 * Math.sqrt(st.p);
    const X0 = 14, X1 = w - 14, Y0 = h - 26, Y1 = 22;
    const xmax = k * 1.08;
    const sx = (t) => X0 + ((t + xmax) / (2 * xmax)) * (X1 - X0);

    ctx.fillStyle = P.window;
    ctx.fillRect(sx(-R), Y1, sx(R) - sx(-R), Y0 - Y1);

    ctx.strokeStyle = P.muted;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X0, Y0 + 0.5); ctx.lineTo(X1, Y0 + 0.5); ctx.stroke();
    ctx.fillStyle = P.muted;
    ctx.font = `11px ${cssVar('--font-body')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of ticks(-xmax, xmax, w < 520 ? 5 : 8)) {
      ctx.beginPath(); ctx.moveTo(sx(t), Y0); ctx.lineTo(sx(t), Y0 + 4); ctx.stroke();
      ctx.fillText(t < 0 ? '−' + (-t) : String(t), sx(t), Y0 + 7);
    }

    // eigenvalues of X (faint ticks) when known
    if (st.lamX) {
      ctx.strokeStyle = rgba(P.tree, 0.55);
      ctx.lineWidth = 1;
      for (const { v } of multiplicities(st.lamX)) {
        ctx.beginPath(); ctx.moveTo(sx(v), Y0); ctx.lineTo(sx(v), Y0 - 0.45 * (Y0 - Y1)); ctx.stroke();
      }
    }

    // eigenvalues of Y, stacked by multiplicity
    const dot = 3.2, gap = 7.5;
    for (const { v, m } of st.mult) {
      const triv = Math.abs(v - k) < 1e-7;
      ctx.fillStyle = triv ? P.trivial : P.graph;
      const show = Math.min(m, Math.floor((Y0 - Y1 - 6) / gap));
      for (let i = 0; i < show; i++) {
        ctx.beginPath(); ctx.arc(sx(v), Y0 - 6 - i * gap, triv ? 4.2 : dot, 0, 2 * Math.PI); ctx.fill();
      }
    }

    // −(p+1): absent
    ctx.strokeStyle = P.trivial;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.arc(sx(-k), Y0 - 6, 4.2, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);

    labS.set([
      { id: 'wl', x: sx(-R), y: Y1 - 3, tex: `-2\\sqrt{${st.p}}`, anchor: 'n', cls: 'small' },
      { id: 'wr', x: sx(R), y: Y1 - 3, tex: `2\\sqrt{${st.p}}`, anchor: 'n', cls: 'small' },
      { id: 'tp', x: sx(k), y: Y0 - 13, tex: `${k}`, anchor: 'n', cls: 'small halo', color: P.trivial },
      { id: 'tm', x: sx(-k), y: Y0 - 13, tex: `-${k}`, anchor: 'n', cls: 'small halo', color: P.trivial },
    ]);
  }

  pointer(cvC.wrap, {
    hover(x, y) { pick(x, y); },
    leave() { if (st.hover !== null) { st.hover = null; setHint(); cvC.redraw(); } },
    down(x, y) { pick(x, y); return false; },
  });

  function pick(x, y) {
    if (!st.Y) return;
    const { pts } = layout(cvC.w, cvC.h);
    let best = null, bd = 14 * 14;
    for (let z = 0; z < pts.length; z++) {
      const d = (pts[z].x - x) ** 2 + (pts[z].y - y) ** 2;
      if (d < bd) { bd = d; best = z; }
    }
    if (best !== st.hover) { st.hover = best; setHint(); cvC.redraw(); }
  }

  onTheme(() => { cvC.redraw(); cvS.redraw(); });
  build(st.p, st.q);
}
