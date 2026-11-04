// Figure S1 — what an eigenvalue of Δ is: waves on the (p+1)-regular tree, the spherical function,
// and the same picture on the hyperbolic plane.
import { el, makeCanvas, labelLayer, setTex, chips, segmented, button, palette, onTheme, fmt, rgba, mix, pointer, cssVar, isDark } from './common.js';

// ───────────────────────── pure math (node-testable) ─────────────────────────

/** Depth drawn for each p: spherical ball / horocyclic subtree (≤ ~1200 vertices). */
export const DEPTHS = { 2: [7, 7], 3: [5, 5], 5: [4, 4], 13: [2, 2] };
export const P_CHOICES = [2, 3, 5, 13];

/** |S_n| in the (p+1)-regular tree. */
export const sphereSize = (p, n) => (n === 0 ? 1 : (p + 1) * Math.pow(p, n - 1));

/** The most a tempered wave can grow after scaling by p^{n/2}: its value at λ = 2√p. */
export const edgeGrowth = (p, n) => 1 + (n * (p - 1)) / (p + 1);

/**
 * Where λ sits. θ with λ = 2√p cos θ (real, iμ or π + iμ), s = 1/2 + iθ/log p (so λ = p^s + p^{1−s}),
 * and λ_H = s(1−s) when it is real (null when the hyperbolic plane has no counterpart).
 * kind: 'tempered' | 'edge' | 'complementary' | 'trivial' | 'signcomp' | 'sign'.
 */
export function classify(lam, p) {
  const R = 2 * Math.sqrt(p), k = p + 1, L = Math.log(p), eps = 1e-9 * k;
  lam = Math.max(-k, Math.min(k, lam));
  if (Math.abs(lam) <= R + eps) {
    const th = Math.acos(Math.max(-1, Math.min(1, lam / R))), tau = th / L;
    const edge = Math.abs(Math.abs(lam) - R) <= eps;
    return { kind: edge ? 'edge' : 'tempered', lam, R, theta: { re: th, im: 0 }, mu: 0, s: { re: 0.5, im: tau }, tau, lamH: 0.25 + tau * tau };
  }
  const mu = Math.acosh(Math.abs(lam) / R), sr = 0.5 - mu / L;
  if (lam > 0) {
    const kind = Math.abs(lam - k) <= eps ? 'trivial' : 'complementary';
    return { kind, lam, R, theta: { re: 0, im: mu }, mu, s: { re: Math.max(0, sr), im: 0 }, tau: 0, lamH: Math.max(0, sr) * (1 - Math.max(0, sr)) };
  }
  const kind = Math.abs(lam + k) <= eps ? 'sign' : 'signcomp';
  return { kind, lam, R, theta: { re: Math.PI, im: mu }, mu, s: { re: Math.max(0, sr), im: Math.PI / L }, tau: Math.PI / L, lamH: null };
}

/** λ = p^s + p^{1−s} for complex s (returns { re, im }). */
export function lambdaOfS(s, p) {
  const L = Math.log(p);
  const a = Math.exp(s.re * L), b = Math.exp((1 - s.re) * L), w = s.im * L;
  // p^s = a e^{iw}, p^{1−s} = b e^{−iw}
  return { re: (a + b) * Math.cos(w), im: (a - b) * Math.sin(w) };
}

/** The spherical function φ_λ(0..N) by its recurrence: φ(0)=1, φ(1)=λ/(p+1), φ(n+1)=(λφ(n)−φ(n−1))/p. */
export function spherical(lam, p, N) {
  const out = new Float64Array(N + 1);
  out[0] = 1;
  if (N >= 1) out[1] = lam / (p + 1);
  for (let n = 1; n < N; n++) out[n + 1] = (lam * out[n] - out[n - 1]) / p;
  return out;
}

/** Closed form p^{−n/2}[(2/(p+1)) cos nθ + ((p−1)/(p+1)) sin((n+1)θ)/sin θ], continued to complex θ. */
export function sphericalClosed(lam, p, n) {
  const c = classify(lam, p), A = 2 / (p + 1), B = (p - 1) / (p + 1), sc = Math.pow(p, -n / 2);
  if (c.theta.im === 0) {
    const th = c.theta.re, sn = Math.sin(th);
    const ratio = Math.abs(sn) < 1e-9 ? (Math.cos(th) > 0 ? n + 1 : (n % 2 ? -1 : 1) * (n + 1)) : Math.sin((n + 1) * th) / sn;
    return sc * (A * Math.cos(n * th) + B * ratio);
  }
  const mu = c.mu, sign = c.theta.re ? (n % 2 ? -1 : 1) : 1;
  const ratio = mu < 1e-9 ? n + 1 : Math.sinh((n + 1) * mu) / Math.sinh(mu);
  return sign * sc * (A * Math.cosh(n * mu) + B * ratio);
}

/** A real plane wave for the end ξ at horocycle level b: Re(e^{iφ₀} p^{−s b}) = p^{−σb} cos(φ₀ − τ b log p). */
export function planeWave(s, p, b, phase = 0) {
  const L = Math.log(p);
  return Math.exp(-s.re * b * L) * Math.cos(phase - s.im * b * L);
}

/**
 * The ball of radius D around o in the (p+1)-regular tree, as a sunburst: each vertex owns an angular
 * sector [lo, hi) of the boundary. path[0] ∈ 0..p, later entries ∈ 0..p−1 (the branches away from o).
 */
export function radialTree(p, D) {
  const nodes = [{ depth: 0, parent: -1, path: [], lo: 0, hi: 2 * Math.PI, kids: [] }];
  for (let h = 0; h < nodes.length; h++) {
    const u = nodes[h];
    if (u.depth === D) continue;
    const m = u.depth === 0 ? p + 1 : p, span = (u.hi - u.lo) / m;
    for (let c = 0; c < m; c++) {
      u.kids.push(nodes.length);
      nodes.push({ depth: u.depth + 1, parent: h, path: [...u.path, c], lo: u.lo + c * span, hi: u.lo + (c + 1) * span, kids: [] });
    }
  }
  return { p, D, nodes };
}

/**
 * The subtree under one vertex r (level 0) for the end ξ "above" it, as an icicle chart: level b, the
 * horizontal span [x0, x1) ⊂ [0,1] of its descendants. Two ancestors on the ray to ξ (levels −1, −2).
 */
export function horoTree(p, D) {
  const nodes = [
    { level: -2, parent: -1, x0: 0, x1: 1, kids: [1], ray: true },
    { level: -1, parent: 0, x0: 0, x1: 1, kids: [2], ray: true },
    { level: 0, parent: 1, x0: 0, x1: 1, kids: [] },
  ];
  for (let h = 2; h < nodes.length; h++) {
    const u = nodes[h];
    if (u.level === D) continue;
    const span = (u.x1 - u.x0) / p;
    for (let c = 0; c < p; c++) {
      u.kids.push(nodes.length);
      nodes.push({ level: u.level + 1, parent: h, x0: u.x0 + c * span, x1: u.x0 + (c + 1) * span, kids: [] });
    }
  }
  return { p, D, nodes };
}

/** Busemann function of the end `end` (an infinite reduced path from o, given far enough) at the vertex `path`. */
export function busemann(path, end) {
  let c = 0;
  while (c < path.length && c < end.length && path[c] === end[c]) c++;
  return path.length - 2 * c;
}

/** A superposition Σ_j a_j Re(e^{iφ_j} p^{−s b_j(x)}) of plane waves: an eigenfunction with the same λ. */
export function mixtureValue(path, waves, s, p) {
  let v = 0;
  for (const w of waves) v += w.amp * planeWave(s, p, busemann(path, w.end), w.phase);
  return v;
}

/** Deterministic little RNG for reproducible ends and phases. */
export function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/** Three plane waves from random ends of the ball (paths of length len). */
export function randomWaves(p, len, seed, count = 3) {
  const r = rng(seed), out = [];
  for (let j = 0; j < count; j++) {
    const end = [];
    for (let i = 0; i < len; i++) end.push(Math.floor(r() * (i === 0 ? p + 1 : p)));
    out.push({ end, phase: 2 * Math.PI * r(), amp: 0.6 + 0.8 * r() });
  }
  return out;
}

/**
 * The hyperbolic spherical function φ_s(ρ) = P_{−s}(cosh ρ) from its radial ODE
 * φ'' + coth ρ φ' + λ_H φ = 0, φ(0)=1, φ'(0)=0 (RK4). Returns samples at ρ = 0, h, 2h, …, ≥ rhoMax.
 */
export function hypProfile(lamH, rhoMax, h = 0.01) {
  const n = Math.ceil(rhoMax / h) + 1, out = new Float64Array(n + 1);
  out[0] = 1;
  const r0 = 1e-4;
  let rho = r0, y = 1 - (lamH * r0 * r0) / 4, yp = -(lamH * r0) / 2;
  const f = (r, a, b) => [b, -b / Math.tanh(r) - lamH * a];
  // first sample at ρ = h: integrate r0 → h in one small step
  let target = h;
  for (let i = 1; i <= n; i++, target += h) {
    const hh = target - rho;
    const k1 = f(rho, y, yp);
    const k2 = f(rho + hh / 2, y + (hh / 2) * k1[0], yp + (hh / 2) * k1[1]);
    const k3 = f(rho + hh / 2, y + (hh / 2) * k2[0], yp + (hh / 2) * k2[1]);
    const k4 = f(rho + hh, y + hh * k3[0], yp + hh * k3[1]);
    y += (hh / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    yp += (hh / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    rho = target;
    out[i] = y;
  }
  return { h, values: out };
}

/**
 * φ_s(ρ) = (1/π)∫_0^π (cosh ρ + sinh ρ cos t)^{−s} dt for complex s. The integrand peaks at t = π when ρ is
 * large, so the interval is cut geometrically toward π and each piece gets composite Simpson. Returns { re, im }.
 */
export function hypSphericalIntegral(s, rho, m = 96) {
  const sh = Math.sinh(rho);
  const g = (x) => { // x = π − t; cosh ρ − sinh ρ cos x, written without cancellation
    const lb = Math.log(Math.exp(-rho) + 2 * sh * Math.sin(x / 2) ** 2), mm = Math.exp(-s.re * lb), a = -s.im * lb;
    return [mm * Math.cos(a), mm * Math.sin(a)];
  };
  const J = Math.ceil(rho / Math.LN2) + 12;
  let re = 0, im = 0;
  for (let j = 0; j <= J; j++) {
    const a = j === J ? 0 : Math.PI * 2 ** -(j + 1), b = Math.PI * 2 ** -j, hh = (b - a) / m;
    for (let i = 0; i <= m; i++) {
      const w = i === 0 || i === m ? 1 : i % 2 ? 4 : 2, v = g(a + i * hh);
      re += (w * hh * v[0]) / 3; im += (w * hh * v[1]) / 3;
    }
  }
  return { re: re / Math.PI, im: im / Math.PI };
}

/** Linear interpolation into a hypProfile. */
export function hypAt(prof, rho) {
  const x = rho / prof.h, i = Math.floor(x);
  if (i >= prof.values.length - 1) return prof.values[prof.values.length - 1];
  const t = x - i;
  return prof.values[i] * (1 - t) + prof.values[i + 1] * t;
}

/** Position of λ on a scale that keeps the class when p changes: |u| ≤ 1 inside the window, 1 < |u| ≤ 2 outside. */
export function lamToU(lam, p) {
  const R = 2 * Math.sqrt(p), k = p + 1;
  if (Math.abs(lam) <= R) return lam / R;
  return Math.sign(lam) * (1 + (Math.abs(lam) - R) / (k - R));
}
export function uToLam(u, p) {
  const R = 2 * Math.sqrt(p), k = p + 1;
  if (Math.abs(u) <= 1) return u * R;
  return Math.sign(u) * (R + (Math.abs(u) - 1) * (k - R));
}

// ───────────────────────── the figure ─────────────────────────

const N_PROFILE = 24;

export function mount(root) {
  const st = { p: 5, lam: 0, mode: 'sph', norm: true, hover: -1, seed: 7, waves: null, prof: null };
  st.lam = 0.42 * 2 * Math.sqrt(st.p);

  // layout
  const top = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  top.append(left, right);
  root.append(top);

  const lineHint = el('p', { class: 'panel-hint' });
  left.append(lineHint);
  const line = makeCanvas(left, { aspect: (w) => 132 / w, draw: drawLine });
  const lineLabels = labelLayer(line.wrap);
  line.wrap.tabIndex = 0;
  line.wrap.setAttribute('role', 'slider');
  line.wrap.setAttribute('aria-label', 'Eigenvalue');
  line.wrap.style.cursor = 'ew-resize';
  line.wrap.style.marginBottom = '0.6rem';

  const treeHint = el('p', { class: 'panel-hint' });
  left.append(treeHint);
  const cv = makeCanvas(left, { aspect: (w) => (st.mode === 'plane' ? (w < 500 ? 0.86 : 0.6) : 1), maxHeight: 470, draw: drawTree });
  const treeLabels = labelLayer(cv.wrap);

  const ctl = el('div', { class: 'controls' });
  right.append(ctl);
  const modeName = el('span', { class: 'ctl-name', style: 'font-size:0.8rem' }, 'the wave');
  const modeWrap = el('div', { class: 'chips' }, modeName);
  ctl.append(modeWrap);
  const modeSeg = segmented(modeWrap, [['sph', 'Spherical'], ['plane', 'Plane'], ['mix', 'Mixture']], st.mode, (m) => {
    st.mode = m; st.hover = -1; build(); cv.resize(); cv.redraw(); updateAll();
  });
  modeSeg.el.style.alignSelf = 'flex-start';
  const pChips = chips(ctl, {
    label: 'the tree $T_{p+1}$',
    options: P_CHOICES.map((p) => [String(p), `$p=${p}$`]),
    value: String(st.p),
    onchange: (v) => {
      const u = lamToU(st.lam, st.p);
      st.p = +v; st.lam = uToLam(u, st.p); st.hover = -1;
      rebuildSnaps(); build(); line.redraw(); cv.redraw(); updateAll();
    },
  });
  const snapWrap = el('div');
  ctl.append(snapWrap);
  let snaps = null;
  function rebuildSnaps() {
    snapWrap.innerHTML = '';
    snaps = chips(snapWrap, {
      label: 'jump to $\\lambda=$',
      options: [['k', '$p+1$'], ['R', '$2\\sqrt p$'], ['0', '$0$'], ['-R', '$-2\\sqrt p$'], ['-k', '$-(p+1)$']],
      value: null,
      onchange: (key) => {
        const R = 2 * Math.sqrt(st.p), k = st.p + 1;
        setLam({ k, R, '0': 0, '-R': -R, '-k': -k }[key]);
        snaps.set(null);
      },
    });
  }
  rebuildSnaps();
  const colorChips = chips(ctl, {
    label: 'colour by',
    options: [['norm', 'the scaled wave'], ['raw', 'the wave $f$']],
    value: 'norm',
    onchange: (v) => { st.norm = v === 'norm'; cv.redraw(); updateHints(); },
  });
  const reshuffle = el('div', { class: 'btn-row' });
  ctl.append(reshuffle);
  const shuffleBtn = button(reshuffle, 'New ends $\\xi_1,\\xi_2,\\xi_3$', () => { st.seed = (st.seed * 7919 + 13) % 100003; build(); cv.redraw(); updateAll(); }, 'ghost');

  const ro = el('div', { class: 'readout' });
  right.append(ro);
  const eqBox = el('div', { class: 'readout', style: 'margin-top:0.6rem; border-color: var(--c-graph)' });
  right.append(eqBox);
  const mvBox = el('div', { class: 'readout', style: 'margin-top:0.6rem' });
  right.append(mvBox);

  // the profile: tree and hyperbolic plane on one axis
  const profWrap = el('div', { style: 'margin-top:1rem' });
  root.append(profWrap);
  const profHint = el('p', { class: 'panel-hint' });
  profWrap.append(profHint);
  const prof = makeCanvas(profWrap, { aspect: (w) => (w < 500 ? 0.62 : 0.3), maxHeight: 280, minHeight: 190, draw: drawProfile });
  const profLabels = labelLayer(prof.wrap);

  // ── data ──
  let T = null; // the drawn tree
  function build() {
    const [Ds, Dh] = DEPTHS[st.p];
    if (st.mode === 'plane') T = { kind: 'horo', ...horoTree(st.p, Dh) };
    else T = { kind: 'radial', ...radialTree(st.p, Ds) };
    st.waves = randomWaves(st.p, (st.mode === 'plane' ? Dh : Ds) + 3, st.seed);
    shuffleBtn.style.display = st.mode === 'mix' ? '' : 'none';
  }

  function setLam(v) {
    const k = st.p + 1;
    st.lam = Math.max(-k, Math.min(k, v));
    line.redraw(); cv.redraw(); updateAll();
  }

  // the value of the current wave at a vertex (radial: by path; horo: by level)
  function waveAt(node, c) {
    if (T.kind === 'horo') return planeWave(c.s, st.p, node.level);
    if (st.mode === 'mix') return mixtureValue(node.path, st.waves, c.s, st.p);
    return sphericalClosed(st.lam, st.p, node.path.length);
  }
  // neighbours as values, including ones beyond the drawn ball: { up: [v], down: [v…] }
  function neighbourValues(i, c) {
    const n = T.nodes[i], p = st.p;
    if (T.kind === 'horo') {
      return { up: [planeWave(c.s, p, n.level - 1)], down: Array(p).fill(planeWave(c.s, p, n.level + 1)) };
    }
    const d = n.path.length;
    const valAt = (path) => (st.mode === 'mix' ? mixtureValue(path, st.waves, c.s, p) : sphericalClosed(st.lam, p, path.length));
    const up = d ? [valAt(n.path.slice(0, -1))] : [];
    const m = d === 0 ? p + 1 : p, down = [];
    for (let j = 0; j < m; j++) down.push(valAt([...n.path, j]));
    return { up, down };
  }
  const scaleOf = (node) => (st.norm ? Math.pow(st.p, (T.kind === 'horo' ? node.level : node.path.length) / 2) : 1);

  // ── colours ──
  function waveColours(P) {
    const neg = cssVar('--supp') || (P.dark ? '#f0913a' : '#e07316');
    return { pos: P.graph, neg, zero: P.surface };
  }
  function colourFor(t, W) {
    const a = Math.min(1, Math.pow(Math.min(1, Math.abs(t)), 0.6));
    return mix(W.zero, t >= 0 ? W.pos : W.neg, 0.08 + 0.86 * a);
  }

  // ── the spectral line ──
  let lineGeom = null;
  function drawLine(ctx, w, h) {
    if (w < 120) return;
    const P = palette(), p = st.p, k = p + 1, R = 2 * Math.sqrt(p);
    const padL = 22, padR = 22, axisY = h - 40;
    const X = (x) => padL + ((x + k) / (2 * k)) * (w - padL - padR);
    const Xinv = (px) => ((px - padL) / (w - padL - padR)) * 2 * k - k;
    lineGeom = { X, Xinv };
    const c = classify(st.lam, p);
    // window
    ctx.fillStyle = P.window;
    ctx.fillRect(X(-R), 6, X(R) - X(-R), axisY - 6);
    // the half-ellipse whose shadow is λ = 2√p cos θ
    const rx = X(R) - X(0), ry = Math.min(rx, axisY - 14), cx = X(0);
    ctx.strokeStyle = rgba(P.text, 0.28); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, axisY, rx, ry, 0, Math.PI, 2 * Math.PI); ctx.stroke();
    // axis
    ctx.strokeStyle = P.border; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL - 6, axisY + 0.5); ctx.lineTo(w - padR + 6, axisY + 0.5); ctx.stroke();
    // ticks
    ctx.strokeStyle = P.muted;
    for (const x of [-R, 0, R]) { ctx.beginPath(); ctx.moveTo(X(x), axisY - 4); ctx.lineTo(X(x), axisY + 4); ctx.stroke(); }
    // ±(p+1)
    ctx.fillStyle = P.trivial;
    for (const x of [-k, k]) { ctx.beginPath(); ctx.arc(X(x), axisY, 4, 0, 7); ctx.fill(); }
    // the marker
    const mx = X(c.lam), col = c.kind === 'trivial' || c.kind === 'sign' ? P.trivial : P.graph;
    if (c.theta.im === 0) {
      const th = c.theta.re, px = cx + rx * Math.cos(th), py = axisY - ry * Math.sin(th);
      ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx, axisY); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(mx, axisY); ctx.stroke();
      ctx.setLineDash([]);
      // the angle
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.2;
      const ar = Math.min(18, rx * 0.25);
      ctx.beginPath(); ctx.ellipse(cx, axisY, ar, ar * (ry / rx), 0, -th, 0, false); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = col; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(mx, 8); ctx.lineTo(mx, axisY); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(mx, axisY, 6.5, 0, 7); ctx.fill();
    ctx.strokeStyle = P.surface; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, axisY, 6.5, 0, 7); ctx.stroke();
    if (document.activeElement === line.wrap) {
      ctx.strokeStyle = P.text; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, axisY, 10, 0, 7); ctx.stroke();
    }
    const lab = [
      { id: 'mk', x: X(-k), y: axisY + 7, anchor: 's', tex: '-(p+1)', cls: 'small', color: P.trivial },
      { id: 'pk', x: X(k), y: axisY + 7, anchor: 's', tex: 'p+1', cls: 'small', color: P.trivial },
      { id: 'z', x: X(0), y: axisY + 7, anchor: 's', tex: '0', cls: 'small' },
      { id: 'mR', x: X(-R), y: axisY + 22, anchor: 's', tex: '-2\\sqrt p', cls: 'small' },
      { id: 'pR', x: X(R), y: axisY + 22, anchor: 's', tex: '2\\sqrt p', cls: 'small' },
      { id: 'lam', x: Math.min(w - 40, Math.max(40, mx)), y: 4, anchor: 's', tex: `\\lambda=${fmt.tex(+c.lam.toFixed(3), 4)}`, cls: 'halo', color: col },
    ];
    if (c.theta.im === 0) {
      const ar = Math.min(18, rx * 0.25);
      lab.push({ id: 'th', x: cx + (ar + 10) * Math.cos(c.theta.re / 2), y: axisY - (ar + 8) * (ry / rx) * Math.sin(c.theta.re / 2) - 2, anchor: 'c', tex: '\\theta', cls: 'small halo', color: col });
    } else lab.push({ id: 'th', x: Math.min(w - 50, Math.max(50, mx + (c.lam > 0 ? -28 : 28))), y: axisY - 14, anchor: 'c', tex: c.theta.re ? '\\theta=\\pi+i\\mu' : '\\theta=i\\mu', cls: 'small halo', color: col });
    lineLabels.set(lab);
    line.wrap.setAttribute('aria-valuemin', String(-k));
    line.wrap.setAttribute('aria-valuemax', String(k));
    line.wrap.setAttribute('aria-valuenow', c.lam.toFixed(3));
  }
  pointer(line.wrap, {
    down(x) { if (!lineGeom) return false; setFromPx(x); return true; },
    move(x) { setFromPx(x); },
  });
  function setFromPx(x) {
    const p = st.p, k = p + 1, R = 2 * Math.sqrt(p);
    let v = lineGeom.Xinv(x);
    const px = (u) => Math.abs(lineGeom.X(u) - x);
    for (const sn of [k, -k]) if (px(sn) < 7) v = sn;
    for (const sn of [R, -R, 0]) if (px(sn) < 4) v = sn;
    setLam(v);
  }
  line.wrap.addEventListener('keydown', (e) => {
    const k = st.p + 1, step = (e.shiftKey ? 0.1 : 0.02) * k;
    let v = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = st.lam + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = st.lam - step;
    else if (e.key === 'Home') v = -k;
    else if (e.key === 'End') v = k;
    if (v === null) return;
    e.preventDefault();
    setLam(v);
  });
  line.wrap.addEventListener('focus', () => line.redraw());
  line.wrap.addEventListener('blur', () => line.redraw());

  // ── the tree ──
  let treeGeom = null;
  function drawTree(ctx, w, h) {
    if (!T || w < 120) return;
    const P = palette(), W = waveColours(P), c = classify(st.lam, st.p), nodes = T.nodes;
    const vals = nodes.map((n) => waveAt(n, c) * scaleOf(n));
    // colour scale: the largest value, or (for a mixture, which grows toward its ends) the 90th percentile
    const mags = vals.map(Math.abs).sort((a, b) => a - b);
    const M = (st.mode === 'mix' ? mags[Math.floor(0.9 * (mags.length - 1))] : mags[mags.length - 1]) || 1;
    const hov = st.hover, nb = new Set();
    if (hov >= 0) { const n = nodes[hov]; if (n.parent >= 0) nb.add(n.parent); for (const j of n.kids) nb.add(j); }
    const lab = [];
    if (T.kind === 'radial') {
      const D = T.D, Rmax = Math.min(w, h) / 2 - 16, ring = Rmax / (D + 0.5), cx = w / 2, cy = h / 2;
      const pos = (n) => {
        if (!n.depth) return [cx, cy];
        const a = (n.lo + n.hi) / 2 - Math.PI / 2, r = n.depth * ring;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      };
      treeGeom = { kind: 'radial', cx, cy, ring, D };
      // sunburst cells
      nodes.forEach((n, i) => {
        ctx.fillStyle = colourFor(vals[i] / M, W);
        ctx.beginPath();
        if (!n.depth) ctx.arc(cx, cy, ring * 0.5, 0, 2 * Math.PI);
        else {
          const a0 = n.lo - Math.PI / 2, a1 = n.hi - Math.PI / 2;
          ctx.arc(cx, cy, (n.depth + 0.5) * ring, a0, a1);
          ctx.arc(cx, cy, (n.depth - 0.5) * ring, a1, a0, true);
          ctx.closePath();
        }
        ctx.fill();
      });
      // thin separators between rings
      ctx.strokeStyle = rgba(P.bg, 0.55); ctx.lineWidth = 0.6;
      for (let d = 0; d <= D; d++) { ctx.beginPath(); ctx.arc(cx, cy, (d + 0.5) * ring, 0, 7); ctx.stroke(); }
      // edges and stubs (the outermost edges only when they are far enough apart to read)
      const leafGap = (2 * Math.PI * D * ring) / Math.max(1, (st.p + 1) * Math.pow(st.p, D - 1));
      const dense = leafGap < 3.5;
      ctx.strokeStyle = rgba(P.ink, 0.42); ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const n of nodes) {
        if (n.parent < 0 || (dense && n.depth === D)) continue;
        const [x0, y0] = pos(nodes[n.parent]), [x1, y1] = pos(n);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      for (const n of nodes) {
        if (n.depth !== D || dense) continue;
        const a = (n.lo + n.hi) / 2 - Math.PI / 2;
        ctx.moveTo(cx + D * ring * Math.cos(a), cy + D * ring * Math.sin(a));
        ctx.lineTo(cx + (D + 0.42) * ring * Math.cos(a), cy + (D + 0.42) * ring * Math.sin(a));
      }
      ctx.stroke();
      // vertices
      ctx.fillStyle = rgba(P.ink, 0.7);
      for (const n of nodes) {
        const r = !n.depth ? 3.6 : n.depth === 1 ? 2.8 : n.depth === 2 ? 2.2 : 1.6;
        if (n.depth === D && leafGap < 3.5) continue;
        const [x, y] = pos(n);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      // hover
      if (hov >= 0) {
        const n = nodes[hov], [x, y] = pos(n);
        ctx.strokeStyle = P.text; ctx.lineWidth = 2.2;
        for (const j of nb) { const [a, b] = pos(nodes[j]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke(); }
        if (n.depth === D) {
          const a = (n.lo + n.hi) / 2 - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx + (D + 0.45) * ring * Math.cos(a), cy + (D + 0.45) * ring * Math.sin(a)); ctx.stroke();
        }
        for (const j of nb) { const [a, b] = pos(nodes[j]); ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(a, b, 3.4, 0, 7); ctx.fill(); }
        ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
        ctx.strokeStyle = P.surface; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.stroke();
      }
      lab.push({ id: 'o', x: cx, y: cy + 6, anchor: 's', tex: 'o', cls: 'small halo' });
      if (st.mode === 'mix') {
        st.waves.forEach((wv, j) => {
          // the sector of the end ξ_j on the boundary
          let lo = 0, hi = 2 * Math.PI;
          for (let i = 0; i < D; i++) { const m = i === 0 ? st.p + 1 : st.p, sp = (hi - lo) / m; lo += wv.end[i] * sp; hi = lo + sp; }
          const a = (lo + hi) / 2 - Math.PI / 2, r = (D + 0.5) * ring + 9;
          lab.push({ id: 'xi' + j, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), anchor: 'c', tex: `\\xi_${j + 1}`, cls: 'small halo' });
          ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(cx, cy, (D + 0.5) * ring + 1.5, lo - Math.PI / 2, hi - Math.PI / 2); ctx.stroke();
        });
      }
    } else {
      // horocyclic layout: ξ at the top, levels b = −2..D downward
      const D = T.D, padX = 14, topY = 30, botY = h - 14, levels = D + 3;
      const wts = []; let tot = 0;
      for (let b = -2; b <= D; b++) { const v = Math.pow(0.86, b + 2); wts.push(v); tot += v; }
      const y0s = [], y1s = []; let acc = topY;
      wts.forEach((v) => { y0s.push(acc); acc += ((botY - topY) * v) / tot; y1s.push(acc); });
      const X = (u) => padX + u * (w - 2 * padX);
      const rowOf = (b) => b + 2;
      const pos = (n) => [X((n.x0 + n.x1) / 2), (y0s[rowOf(n.level)] + y1s[rowOf(n.level)]) / 2];
      treeGeom = { kind: 'horo', X, y0s, y1s, padX, w };
      nodes.forEach((n, i) => {
        ctx.fillStyle = colourFor(vals[i] / M, W);
        const r = rowOf(n.level);
        ctx.fillRect(X(n.x0), y0s[r], X(n.x1) - X(n.x0) + 0.4, y1s[r] - y0s[r] + 0.4);
      });
      ctx.strokeStyle = rgba(P.bg, 0.55); ctx.lineWidth = 0.6;
      for (let r = 0; r < levels; r++) { ctx.beginPath(); ctx.moveTo(X(0), y1s[r]); ctx.lineTo(X(1), y1s[r]); ctx.stroke(); }
      // the ray up to ξ
      const [rx] = pos(nodes[0]);
      ctx.strokeStyle = rgba(P.ink, 0.6); ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(rx, pos(nodes[0])[1]); ctx.lineTo(rx, 10); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(rx - 4, 15); ctx.lineTo(rx, 9); ctx.lineTo(rx + 4, 15); ctx.stroke();
      // edges; siblings of the ray vertices as stubs
      const leafGap = (w - 2 * padX) / Math.pow(st.p, D), dense = leafGap < 3.5;
      ctx.strokeStyle = rgba(P.ink, 0.42); ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const n of nodes) {
        if (n.parent < 0 || (dense && n.level === D)) continue;
        const [a, b] = pos(nodes[n.parent]), [c2, d] = pos(n);
        ctx.moveTo(a, b); ctx.lineTo(c2, d);
      }
      for (const i of [0, 1]) {
        const [a, b] = pos(nodes[i]), dy = (y1s[rowOf(nodes[i].level)] - y0s[rowOf(nodes[i].level)]) * 0.75;
        for (let j = 1; j < st.p; j++) {
          const side = j % 2 ? 1 : -1, off = Math.ceil(j / 2) * 16;
          ctx.moveTo(a, b); ctx.lineTo(a + side * off, b + dy);
        }
      }
      for (const n of nodes) {
        if (n.level !== D || dense) continue;
        const [a, b] = pos(n), dy = (y1s[rowOf(D)] - y0s[rowOf(D)]) * 0.5;
        ctx.moveTo(a, b); ctx.lineTo(a, b + dy * 0.9);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(P.ink, 0.7);
      for (const n of nodes) {
        if (n.level === D && leafGap < 3.5) continue;
        const [a, b] = pos(n), r = n.level <= 0 ? 3.4 : n.level === 1 ? 2.6 : n.level === 2 ? 2 : 1.5;
        ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill();
      }
      if (hov >= 0) {
        const n = nodes[hov], [x, y] = pos(n);
        ctx.strokeStyle = P.text; ctx.lineWidth = 2.2;
        if (n.parent >= 0) { const [a, b] = pos(nodes[n.parent]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y0s[0] - 8); ctx.stroke(); }
        if (n.kids.length) for (const j of n.kids) { const [a, b] = pos(nodes[j]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke(); }
        else { const dy = (y1s[rowOf(D)] - y0s[rowOf(D)]) * 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dy); ctx.stroke(); }
        if (n.ray && n.level === -1) {
          // its other children are the stubs
          ctx.lineWidth = 1.4;
          const dy = (y1s[rowOf(-1)] - y0s[rowOf(-1)]) * 0.75;
          for (let j = 1; j < st.p; j++) { const side = j % 2 ? 1 : -1, off = Math.ceil(j / 2) * 16; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * off, y + dy); ctx.stroke(); }
        }
        for (const j of nb) { const [a, b] = pos(nodes[j]); ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(a, b, 3.4, 0, 7); ctx.fill(); }
        ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
        ctx.strokeStyle = P.surface; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.stroke();
      }
      lab.push({ id: 'xi', x: rx + 8, y: 12, anchor: 'e', tex: '\\xi', cls: 'halo' });
      for (let b = -2; b <= D; b++) {
        const r = rowOf(b);
        if (y1s[r] - y0s[r] < 13 && b > 0 && b < D) continue;
        lab.push({ id: 'b' + b, x: X(1) - 2, y: (y0s[r] + y1s[r]) / 2, anchor: 'w', tex: `b=${b}`, cls: 'small halo' });
      }
    }
    treeLabels.set(lab);
  }

  function hitTree(x, y) {
    if (!T || !treeGeom) return -1;
    const nodes = T.nodes;
    if (treeGeom.kind === 'radial') {
      const { cx, cy, ring, D } = treeGeom, r = Math.hypot(x - cx, y - cy);
      const d = Math.round(r / ring);
      if (d > D || r > (D + 0.5) * ring) return -1;
      if (d === 0) return 0;
      let a = Math.atan2(y - cy, x - cx) + Math.PI / 2;
      if (a < 0) a += 2 * Math.PI;
      for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (n.depth === d && a >= n.lo && a < n.hi) return i; }
      return -1;
    }
    const { X, y0s, y1s } = treeGeom;
    let row = -1;
    for (let r = 0; r < y0s.length; r++) if (y >= y0s[r] && y < y1s[r]) row = r;
    if (row < 0) return -1;
    const level = row - 2;
    for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (n.level === level && x >= X(n.x0) && x < X(n.x1)) return i; }
    return -1;
  }
  pointer(cv.wrap, {
    down(x, y, e) {
      // touch: tap to inspect
      if (e.pointerType !== 'mouse') { const i = hitTree(x, y); if (i !== st.hover) { st.hover = i; cv.redraw(); updateEq(); } }
      return false;
    },
    hover(x, y) { const i = hitTree(x, y); if (i !== st.hover) { st.hover = i; cv.redraw(); updateEq(); } },
    leave() { /* keep the last vertex, so its equation stays readable */ },
  });

  // ── the profile ──
  function drawProfile(ctx, w, h) {
    if (w < 120) return;
    const P = palette(), p = st.p, c = classify(st.lam, p), N = N_PROFILE, L = Math.log(p);
    const padL = 40, padR = 14, padT = 46, padB = 30;
    const phi = spherical(st.lam, p, N), tree = Array.from(phi, (v, n) => v * Math.pow(p, n / 2));
    const hyp = c.lamH === null ? null : hypProfile(c.lamH, N * L + 0.05, 0.01);
    const hypY = (n) => Math.exp((n * L) / 2) * hypAt(hyp, n * L);
    let M = 0;
    for (const v of tree) M = Math.max(M, Math.abs(v));
    if (hyp) for (let i = 0; i <= 4 * N; i++) M = Math.max(M, Math.abs(hypY(i / 4)));
    // a wave that grows exponentially is shown on a signed log scale, where it is a straight line
    const logMode = M > 40;
    const tr = logMode ? (v) => Math.sign(v) * Math.log10(1 + Math.abs(v)) : (v) => v;
    const MT = logMode ? tr(M) * 1.06 : Math.max(M * 1.08, 1.4);
    M = MT;
    const X = (n) => padL + (n / N) * (w - padL - padR);
    const Y = (v) => padT + ((MT - tr(v)) / (2 * MT)) * (h - padT - padB);
    // the most a tempered wave can grow: ±(1 + n(p−1)/(p+1)), dashed
    ctx.strokeStyle = rgba(P.graph, 0.45); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (const sg of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const v = sg * edgeGrowth(p, i); if (Math.abs(tr(v)) > MT) break; ctx.lineTo(X(i), Y(v)); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // axes
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
    ctx.strokeStyle = P.border;
    ctx.beginPath(); ctx.moveTo(padL, padT - 4); ctx.lineTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT - 6, w - padL - padR, h - padT - padB + 6); ctx.clip();
    // the hyperbolic plane
    if (hyp) {
      ctx.strokeStyle = rgba(P.text, 0.55); ctx.lineWidth = 1.6;
      ctx.beginPath();
      const steps = Math.round(w);
      for (let i = 0; i <= steps; i++) {
        const n = (i / steps) * N, v = hypY(n);
        const yy = logMode ? Y(v) : Y(Math.max(-3 * M, Math.min(3 * M, v)));
        if (i) ctx.lineTo(X(n), yy); else ctx.moveTo(X(n), yy);
      }
      ctx.stroke();
    }
    // the tree
    const col = c.kind === 'trivial' || c.kind === 'sign' ? P.trivial : P.graph;
    ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1.2;
    ctx.beginPath();
    tree.forEach((v, n) => { const yy = logMode ? Y(v) : Y(Math.max(-3 * M, Math.min(3 * M, v))); if (n) ctx.lineTo(X(n), yy); else ctx.moveTo(X(n), yy); });
    ctx.stroke();
    ctx.fillStyle = col;
    tree.forEach((v, n) => { if (logMode || Math.abs(v) <= M) { ctx.beginPath(); ctx.arc(X(n), Y(v), 3.2, 0, 7); ctx.fill(); } });
    ctx.restore();
    // labels
    const lab = [];
    for (let n = 0; n <= N; n += N > 12 ? 4 : 2) lab.push({ id: 'n' + n, x: X(n), y: h - padB + 5, anchor: 's', tex: String(n), cls: 'small' });
    lab.push({ id: 'nax', x: w - padR, y: h - padB - 4, anchor: 'nw', tex: 'n', cls: 'small halo' });
    if (logMode) {
      const top = Math.floor(MT / 1.06 + 1e-9), step = Math.max(1, Math.ceil(top / 3));
      for (let e = step; e <= top; e += step) {
        lab.push({ id: 'yt' + e, x: padL - 5, y: Y(10 ** e), anchor: 'w', tex: `10^{${e}}`, cls: 'small' });
        lab.push({ id: 'ytm' + e, x: padL - 5, y: Y(-(10 ** e)), anchor: 'w', tex: `-10^{${e}}`, cls: 'small' });
      }
      lab.push({ id: 'logs', x: w - padR, y: padT - 4, anchor: 'nw', tex: '\\text{signed log scale}', cls: 'small halo' });
    } else {
      lab.push({ id: 'yt1', x: padL - 5, y: Y(1), anchor: 'w', tex: '1', cls: 'small' });
      lab.push({ id: 'ytm1', x: padL - 5, y: Y(-1), anchor: 'w', tex: '-1', cls: 'small' });
    }
    lab.push({ id: 'y0', x: padL - 5, y: Y(0), anchor: 'w', tex: '0', cls: 'small' });
    lab.push({ id: 'lt', x: padL, y: 6, anchor: 'se', tex: 'p^{n/2}\\varphi_\\lambda(n)\\ \\text{on the tree}', cls: 'small halo', color: col });
    if (hyp) lab.push({ id: 'lh', x: padL, y: 24, anchor: 'se', tex: 'e^{\\rho/2}\\varphi_s(\\rho)\\ \\text{on }\\mathbb H^2,\\ \\rho=n\\log p', cls: 'small halo', color: rgba(P.text, 0.8) });
    else lab.push({ id: 'lh', x: padL, y: 24, anchor: 'se', tex: '\\text{no counterpart on }\\mathbb H^2', cls: 'small halo' });
    profLabels.set(lab);
  }

  // ── readouts ──
  function updateHints() {
    const sc = st.mode === 'plane' ? 'p^{b/2}f' : 'p^{n/2}f';
    setTex(lineHint, '<b>Drag</b> $\\lambda$ along the spectrum of the tree. Shaded: the window $|\\lambda|\\le2\\sqrt p$; the point on the arc above is at angle $\\theta$, and $\\lambda=2\\sqrt p\\cos\\theta$ is its shadow.');
    const what = st.mode === 'sph' ? 'the radial eigenfunction $\\varphi_\\lambda(n)$, $n=d(o,x)$'
      : st.mode === 'plane' ? 'the plane wave $p^{-s\\,b(x)}$ (real part), constant on each horocycle $b=$ const'
        : 'a sum of three plane waves from the ends $\\xi_1,\\xi_2,\\xi_3$';
    setTex(treeHint, `Colour: ${what}, ${st.norm ? `scaled by $${sc.slice(0, -1)}$ so the oscillation shows` : 'unscaled'} (blue $+$, orange $-$). <b>Hover</b> a vertex.`);
    setTex(profHint, 'The spherical function against distance, scaled by $p^{n/2}$ (which is $|S_n|^{1/2}$ up to a constant). Dashed: $\\pm\\big(1+n\\frac{p-1}{p+1}\\big)$, the most any tempered wave can do, reached at $\\lambda=\\pm2\\sqrt p$.');
  }

  let roQueued = false;
  function updateAll() {
    if (roQueued) return;
    roQueued = true;
    setTimeout(() => { roQueued = false; updateRo(); updateEq(); updateMv(); prof.redraw(); }, 16);
  }

  const KIND_TEXT = {
    tempered: '<b>Tempered.</b> $\\theta$ is real: the wave oscillates with frequency $\\theta$ and decays exactly like $p^{-n/2}=|S_n|^{-1/2}$ (up to a constant), the borderline for being square-summable, like $e^{ikx}$ on $\\R^d$.',
    edge: '<b>The edge of the window</b>, $\\theta=0$ or $\\pi$: the wave decays like $n\\,p^{-n/2}$, the slowest any tempered wave can.',
    complementary: '<b>Complementary.</b> $\\theta=i\\mu$ is imaginary: no oscillation, and the wave decays only like $p^{-n/2}e^{\\mu n}$, more slowly than $|S_n|^{-1/2}$. A finite quotient with this eigenvalue is not Ramanujan.',
    trivial: '<b>Trivial.</b> $\\lambda=p+1$: the constant function, $s=0$, $\\theta=i\\log\\sqrt p$.',
    signcomp: '<b>Not tempered.</b> $\\theta=\\pi+i\\mu$: $(-1)^n$ times a complementary wave, decaying only like $p^{-n/2}e^{\\mu n}$.',
    sign: '<b>Sign.</b> $\\lambda=-(p+1)$: the function $(-1)^n$, the bipartition of the tree.',
  };

  function updateRo() {
    const c = classify(st.lam, st.p), p = st.p;
    const thTex = c.theta.im === 0 ? fmt.f(c.theta.re, 4) : c.theta.re ? `\\pi+${fmt.f(c.mu, 4)}\\,i` : `${fmt.f(c.mu, 4)}\\,i`;
    const sRe = Math.abs(c.s.re - 0.5) < 1e-12 ? '\\tfrac12' : fmt.f(c.s.re, 4);
    const sTex = c.s.im ? `${sRe}+${fmt.f(c.s.im, 4)}\\,i` : sRe;
    const back = lambdaOfS(c.s, p), backOk = Math.abs(back.re - c.lam) < 1e-9 * (p + 1) && Math.abs(back.im) < 1e-9 * (p + 1);
    let hRow;
    if (c.lamH === null) hRow = '<tr><td colspan="2">$\\mathbb H^2$: <span class="dim">no counterpart. The sign $(-1)^n$ of the bipartite tree has none on the hyperbolic plane.</span></td></tr>';
    else {
      const tag = c.kind === 'tempered' || c.kind === 'edge' ? '$\\ge\\tfrac14$: tempered (principal series)' : c.kind === 'trivial' ? '$=0$: the constant function' : '$\\in(0,\\tfrac14)$: an exceptional eigenvalue (complementary series), which Selberg conjectured never occurs for congruence surfaces';
      hRow = `<tr><td>$\\lambda_{\\mathbb H}=s(1-s)$</td><td class="num">$${fmt.f(c.lamH, 4)}$</td></tr><tr><td colspan="2" class="dim">${tag}</td></tr>`;
    }
    setTex(ro, `<table>
      <tr><td>$\\lambda$</td><td class="num">$${fmt.f(c.lam, 4)}$</td></tr>
      <tr><td>$\\theta$, with $\\lambda=2\\sqrt p\\cos\\theta$</td><td class="num">$${thTex}$</td></tr>
      <tr><td>$s=\\tfrac12+i\\theta/\\log p$</td><td class="num">$${sTex}$</td></tr>
      <tr><td colspan="2" class="dim">$p^s+p^{1-s}=\\lambda$ ${backOk ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
      ${hRow}
      <tr class="sep"><td colspan="2">${KIND_TEXT[c.kind]}</td></tr>
    </table>`);
  }

  function updateEq() {
    const c = classify(st.lam, st.p), p = st.p;
    if (!T) return;
    let i = st.hover;
    if (i < 0) {
      // default: a vertex at depth 2 (or level 1)
      i = T.nodes.findIndex((n) => (T.kind === 'horo' ? n.level === 1 : n.depth === 2));
    }
    const n = T.nodes[i], f = waveAt(n, c), { up, down } = neighbourValues(i, c);
    const sum = up.reduce((a, b) => a + b, 0) + down.reduce((a, b) => a + b, 0);
    const okEq = Math.abs(sum - c.lam * f) <= 1e-9 * Math.max(1, Math.abs(sum), Math.abs(c.lam * f));
    const g = (v) => fmt.tex(+v.toPrecision(4), 4);
    const gp = (v) => (v < 0 ? `(${g(v)})` : g(v));
    const where = T.kind === 'horo' ? `level $b=${n.level}$` : n.depth ? `distance $n=${n.depth}$ from $o$` : 'the centre $o$';
    let lhs;
    if (st.mode === 'mix') {
      lhs = (up.length ? `inward $${g(up[0])}$; ` : '') + `outward ${down.map((v) => `$${g(v)}$`).join(', ')}; sum`;
    } else if (up.length) lhs = `$1\\cdot(${g(up[0])})+${p}\\cdot(${g(down[0])})$`;
    else lhs = `$${p + 1}\\cdot(${g(down[0])})$`;
    const lead = st.hover < 0 ? '<span class="dim">Hover a vertex. Here, a vertex at</span>' : 'At the vertex at';
    const legend = T.kind === 'horo' ? '1 neighbour above (toward $\\xi$), $p$ below' : n.depth ? '1 neighbour inward, $p$ outward' : '$p+1$ neighbours, all outward';
    setTex(eqBox, `<div style="font-weight:700; margin-bottom:0.25rem">The eigenvalue equation $\\ \\sum_{y\\sim x}f(y)=\\lambda f(x)$</div>
      <div>${lead} ${where} (${legend}):</div>
      <div style="margin:0.3rem 0">${lhs}</div>
      <div>$=${g(sum)}$, and $\\lambda f(x)=${gp(c.lam)}\\times${gp(f)}=${g(c.lam * f)}$ ${okEq ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</div>`);
  }

  function updateMv() {
    if (st.mode !== 'mix' || !T || T.kind !== 'radial') { mvBox.style.display = 'none'; return; }
    mvBox.style.display = '';
    const c = classify(st.lam, st.p), p = st.p, D = T.D;
    const phi = spherical(st.lam, p, D), f0 = waveAt(T.nodes[0], c);
    const sums = new Float64Array(D + 1), cnt = new Int32Array(D + 1);
    for (const n of T.nodes) { sums[n.depth] += waveAt(n, c); cnt[n.depth]++; }
    let rows = '', allOk = true;
    for (let d = 0; d <= D; d++) {
      const avg = sums[d] / cnt[d], pred = phi[d] * f0, ok = Math.abs(avg - pred) <= 1e-9 * Math.max(1, Math.abs(pred));
      allOk = allOk && ok;
      rows += `<tr><td>$${d}$</td><td class="num">$${fmt.tex(+avg.toPrecision(5), 5)}$</td><td class="num">$${fmt.tex(+pred.toPrecision(5), 5)}$</td><td>${ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>`;
    }
    setTex(mvBox, `<div style="font-weight:700; margin-bottom:0.25rem">Averages over spheres around $o$</div>
      <table><tr><th>$n$</th><th class="num">mean of $f$ on $S_n(o)$</th><th class="num">$\\varphi_\\lambda(n)\\,f(o)$</th><th></th></tr>${rows}</table>
      <div class="hint" style="margin-top:0.35rem">${allOk ? '<span class="ok">✓</span> ' : ''}Averaging any $\\lambda$-eigenfunction over a sphere returns the spherical function times its value at the centre. Only $\\lambda$ survives.</div>`);
  }

  onTheme(() => { line.redraw(); cv.redraw(); prof.redraw(); });
  build();
  updateHints();
  updateAll();
  // the hint mentions the scale for the current mode
  modeSeg.el.addEventListener('click', () => updateHints());
}
