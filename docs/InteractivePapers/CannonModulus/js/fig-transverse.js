// Figure 6 — Lemma 3.8 (a finite-cell level comparison), on the magnified functions of §4:
//   f = Re(e^{iθ}/(z − b)),   w = Re(e^{iφ}/(z − c)),   K = the closed unit disk, b, c ∉ K.
// The levels of f are circles through b, and λ = e^{iθ}/(z − b) straightens them: f = Re λ, the
// disk K becomes a disk K_λ, and the level continuum D_t = {f = t} ∩ K becomes the vertical chord
// Re λ = t of K_λ. Everything is exact: osc of w along D_t (endpoints + the two critical points of a
// Möbius function on a line), and osc of f or w on a closed cell (a disk goes to a disk, and Re of a
// disk of radius ρ' has range 2ρ'). Cells are the paper's: closed balls B̄(q, 2r_n) for q in the
// maximal r_n-separated net T_n = r_n Z², r_n = 1/n, summed over the cells that meet K.
import { el, makeCanvas, labelLayer, slider, chips, controls, pointer, setTex, palette, onTheme, cssVar, fmt, rgba, ticks } from './common.js';

// ───────────────────────── pure math (node-testable) ─────────────────────────

/** The closed disk K. */
export const K_DISK = { c: [0, 0], r: 1 };
/** Meshes for the chart: r_n = 1/n. */
export const MESHES = [6, 8, 12, 16, 24, 32, 48, 64, 96, 128];

/** A magnified function F = { p: [x, y], a } is z ↦ Re(e^{ia}/(z − p)). */
export function mag(F, x, y) {
  const dx = x - F.p[0], dy = y - F.p[1], r2 = dx * dx + dy * dy;
  return (Math.cos(F.a) * dx + Math.sin(F.a) * dy) / r2;
}

/** Image of the closed disk D = { c, r } under λ = e^{ia}/(z − p), as { m, r }; null if D ∋ p. */
export function imageDisk(F, D) {
  const ux = D.c[0] - F.p[0], uy = D.c[1] - F.p[1], den = ux * ux + uy * uy - D.r * D.r;
  if (!(den > 0)) return null;
  const ca = Math.cos(F.a), sa = Math.sin(F.a);
  return { m: [(ca * ux + sa * uy) / den, (sa * ux - ca * uy) / den], r: D.r / den };
}

/** Exact range [lo, hi] of F on a closed disk D (Infinity if D contains the puncture). */
export function rangeOn(F, D) {
  const im = imageDisk(F, D);
  return im ? [im.m[0] - im.r, im.m[0] + im.r] : [-Infinity, Infinity];
}

/** Exact oscillation of F on a closed disk of radius rho about q: 2ρ/(|q − p|² − ρ²). */
export function cellOsc(F, qx, qy, rho) {
  const dx = qx - F.p[0], dy = qy - F.p[1], den = dx * dx + dy * dy - rho * rho;
  return den > 0 ? (2 * rho) / den : Infinity;
}

/** The point of the level {F = t} with λ = t + is: z = p + e^{ia}/(t + is). */
export function levelPoint(F, t, s) {
  const n2 = t * t + s * s, ca = Math.cos(F.a), sa = Math.sin(F.a);
  return [F.p[0] + (ca * t + sa * s) / n2, F.p[1] + (sa * t - ca * s) / n2];
}

/** The level continuum D_t = {F = t} ∩ K as the chord s ∈ [s0, s1] of K_λ; null if empty. */
export function levelChord(F, K, t) {
  const im = imageDisk(F, K);
  if (!im) return null;
  const d = t - im.m[0];
  if (Math.abs(d) > im.r) return null;
  const h = Math.sqrt(Math.max(0, im.r * im.r - d * d));
  return [im.m[1] - h, im.m[1] + h];
}

/**
 * osc of G along D_t = {F = t} ∩ K, exactly. Along the chord λ = t + is, G is Re of the Möbius
 * function g(λ) = e^{iφ}λ/(βλ + e^{iθ}) with β = p_F − p_G; dG/ds = 0 exactly where
 * Q = βλ + e^{iθ} lies on the line e^{iψ/2}R or e^{i(ψ/2+π/2)}R, ψ = θ + φ. So the extremes are
 * among the two chord ends and at most two interior critical points.
 */
export function oscOnLevel(F, G, K, t) {
  const ch = levelChord(F, K, t);
  if (!ch) return null;
  const [s0, s1] = ch;
  const cand = [s0, s1];
  const bx = F.p[0] - G.p[0], by = F.p[1] - G.p[1];
  const Ax = bx * t + Math.cos(F.a), Ay = by * t + Math.sin(F.a); // A = βt + e^{iθ}
  const psi = F.a + G.a;
  for (const al of [psi / 2, psi / 2 + Math.PI / 2]) {
    const ca = Math.cos(al), sa = Math.sin(al);
    // e^{-iα}A and e^{-iα}β
    const imA = ca * Ay - sa * Ax, reB = ca * bx + sa * by;
    if (Math.abs(reB) < 1e-14) continue;
    const s = -imA / reB;
    if (s > s0 && s < s1) cand.push(s);
  }
  let lo = Infinity, hi = -Infinity, zlo = null, zhi = null;
  for (const s of cand) {
    const z = levelPoint(F, t, s), v = mag(G, z[0], z[1]);
    if (v < lo) { lo = v; zlo = z; }
    if (v > hi) { hi = v; zhi = z; }
  }
  return { osc: hi - lo, lo, hi, zlo, zhi, s0, s1 };
}

/**
 * b_0 = min over t ∈ I of osc_{D_t} G: a fine sweep of t, then golden-section refinement around
 * the smallest sample (the sweep alone can only overestimate a minimum).
 */
export function b0Of(F, G, K, I, N = 400) {
  const [t0, t1] = I;
  const osc = (t) => { const o = oscOnLevel(F, G, K, t); return o ? o.osc : 0; };
  let best = Infinity, kb = 0;
  for (let k = 0; k <= N; k++) {
    const v = osc(t0 + ((t1 - t0) * k) / N);
    if (v < best) { best = v; kb = k; }
  }
  let a = t0 + ((t1 - t0) * Math.max(0, kb - 1)) / N, b = t0 + ((t1 - t0) * Math.min(N, kb + 1)) / N;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = osc(x1), f2 = osc(x2);
  for (let it = 0; it < 50; it++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = osc(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = osc(x2); }
  }
  let tMin = t0 + ((t1 - t0) * kb) / N;
  for (const [t, v] of [[x1, f1], [x2, f2]]) if (v < best) { best = v; tMin = t; }
  return { b0: best, tMin };
}

/**
 * The finite-cell sums of Lemma 3.8 at mesh n: over q ∈ T_n = r_n Z² with B(q, 2r_n) ∩ K ≠ ∅,
 *   S = Σ osc f · osc w,  M = Σ osc w · |I ∩ I_q(f)|  (the proof's middle term),
 *   Ef = Σ (osc f)²,  Ew = Σ (osc w)².
 * valid = false when some such cell contains a puncture (n is not yet "sufficiently large").
 */
export function meshSums(F, G, K, n, I) {
  const rn = 1 / n, rho = 2 * rn, reach = K.r + rho;
  const ca = Math.cos(F.a), sa = Math.sin(F.a);
  let S = 0, M = 0, Ef = 0, Ew = 0, cells = 0, valid = true;
  const i0 = Math.ceil((K.c[0] - reach) / rn), i1 = Math.floor((K.c[0] + reach) / rn);
  const j0 = Math.ceil((K.c[1] - reach) / rn), j1 = Math.floor((K.c[1] + reach) / rn);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const qx = i * rn, qy = j * rn;
      const ex = qx - K.c[0], ey = qy - K.c[1];
      if (ex * ex + ey * ey > reach * reach * (1 + 1e-12)) continue; // the closed cell misses K (tangent cells count)
      const ux = qx - F.p[0], uy = qy - F.p[1], df = ux * ux + uy * uy - rho * rho;
      const vx = qx - G.p[0], vy = qy - G.p[1], dw = vx * vx + vy * vy - rho * rho;
      if (!(df > 0) || !(dw > 0)) { valid = false; continue; }
      const of = (2 * rho) / df, ow = (2 * rho) / dw;
      const mx = (ca * ux + sa * uy) / df, rr = rho / df; // I_q(f) = [mx − rr, mx + rr]
      const ov = Math.max(0, Math.min(I[1], mx + rr) - Math.max(I[0], mx - rr));
      S += of * ow; M += ow * ov; Ef += of * of; Ew += ow * ow; cells++;
    }
  }
  return { n, rn, valid, S, M, Ef, Ew, CS: Math.sqrt(Ef * Ew), cells };
}

/** Everything the figure shows, for a state { f: F, w: G, I: [t0, t1] }. */
export function analyze(F, G, I, K = K_DISK, meshes = MESHES) {
  const { b0, tMin } = b0Of(F, G, K, I);
  const lhs = b0 * (I[1] - I[0]);
  const rows = meshes.map((n) => meshSums(F, G, K, n, I));
  const tol = (v) => 1e-9 * Math.max(1, Math.abs(v));
  for (const r of rows) {
    r.ok37 = r.valid ? lhs <= r.M + tol(r.M) && r.M <= r.S + tol(r.S) : null;
    r.okCS = r.valid ? r.S <= r.CS + tol(r.CS) : null;
  }
  return { b0, tMin, lhs, rows };
}

// ───────────────────────── figure ─────────────────────────

const VIEW = { x: 2.35, y: 1.5 };          // half-widths of the world window (narrower on a phone)
const viewFor = (w) => (w < 520 ? { x: 1.95, y: 1.5 } : VIEW);
const MARGIN = 0.12;                        // punctures stay this far outside K
// I is set by two handles placed at the middles of the chords D_t for t at these fractions of f(K)
const PRESETS = {
  apart: { b: [-1.73, -0.48], th: -0.99, c: [1.64, 0.97], ph: 1.72, fr: [0.3, 0.7] },
  same: { b: [-1.73, -0.48], th: -0.99, c: [-1.73, -0.48], ph: -0.99, fr: [0.3, 0.7] },
  close: { b: [-1.73, -0.48], th: -0.99, c: [-1.65, -0.48], ph: -0.99, fr: [0.3, 0.7] },
};

/** The middle of the chord D_t, t at the fraction u of f(K): where the preset puts an end of I. */
export function chordMiddle(F, K, u) {
  const [lo, hi] = rangeOn(F, K), im = imageDisk(F, K);
  return levelPoint(F, lo + u * (hi - lo), im.m[1]);
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { preset: 'apart', n: 16, hover: null, res: null };
  const load = (key) => {
    const p = PRESETS[key];
    st.preset = key;
    st.b = p.b.slice(); st.c = p.c.slice(); st.th = p.th; st.ph = p.ph;
    const Fp = { p: st.b, a: st.th };
    st.P0 = chordMiddle(Fp, K_DISK, p.fr[0]); st.P1 = chordMiddle(Fp, K_DISK, p.fr[1]);
  };
  load('apart');
  const F = () => ({ p: st.b, a: st.th }), G = () => ({ p: st.c, a: st.ph });
  const interval = () => {
    const a = mag(F(), ...st.P0), b = mag(F(), ...st.P1);
    return [Math.min(a, b), Math.max(a, b)];
  };

  const cv = makeCanvas(left, { aspect: (w) => (w < 520 ? 0.86 : 0.64), maxHeight: 470, minHeight: 250, draw });
  const labels = labelLayer(cv.wrap);
  left.append(el('div', { class: 'panel-hint', style: 'margin:.7rem 0 .2rem' }, ''));
  const chartHint = left.lastChild;
  const ch = makeCanvas(left, { aspect: (w) => (w < 520 ? 0.5 : 0.3), maxHeight: 200, minHeight: 140, draw: drawChart });
  const chLabels = labelLayer(ch.wrap);
  setTex(chartHint, 'Both sides of (3.7) at every mesh $n$ (log scales)');

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const pre = chips(ctl, {
    label: 'Preset',
    options: [['apart', 'Different punctures'], ['same', 'Same puncture, same angle'], ['close', 'Close punctures']],
    value: st.preset,
    onchange: (k) => { load(k); thS.set(st.th); phS.set(st.ph); update(); },
  });
  const thS = slider(ctl, { label: 'angle $\\theta$ of $f$', min: -3.14, max: 3.14, step: 0.01, value: st.th, fmt: (v) => v.toFixed(2), oninput: (v) => { st.th = v; st.preset = null; pre.set(null); update(); } });
  const phS = slider(ctl, { label: 'angle $\\varphi$ of $w$', min: -3.14, max: 3.14, step: 0.01, value: st.ph, fmt: (v) => v.toFixed(2), oninput: (v) => { st.ph = v; st.preset = null; pre.set(null); update(); } });
  const nIdx = () => MESHES.indexOf(st.n);
  slider(ctl, { label: 'mesh $n$', min: 0, max: MESHES.length - 1, step: 1, value: nIdx(), fmt: (i) => MESHES[i], oninput: (i) => { st.n = MESHES[i]; update(); } });
  const legend = el('div', { class: 'hint', style: 'margin-top:.1rem' });
  ctl.append(legend);
  setTex(legend,
    '<span style="color:var(--c-u)">━</span> levels of $f$, circles through $b$; ' +
    '<span style="color:var(--c-w)">━</span> levels of $w$, through $c$; ' +
    '<span style="color:var(--c-u)">▒</span> the continua $D_t$, $t\\in I$; ' +
    '<span style="color:var(--c-w)">●</span> extremes of $w$ on $D_{t_*}$; ' +
    '<span style="color:var(--c-mesh)">◌</span> a cell $\\overline B(q,2r_n)$.');
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  const hint = el('div', { class: 'hint' });
  right.append(ro, hint);

  // the readout is typeset by MathJax: at most every 120 ms while dragging, and once at the end
  let roTimer = 0, roLast = 0;
  function scheduleReadout() {
    const wait = 120 - (performance.now() - roLast);
    clearTimeout(roTimer);
    if (wait <= 0) { roLast = performance.now(); readout(); } else roTimer = setTimeout(() => { roLast = performance.now(); readout(); }, wait);
  }
  function update() {
    st.res = analyze(F(), G(), interval());
    cv.redraw(); ch.redraw(); scheduleReadout();
  }

  // world ↔ canvas
  let T = null;
  const layout = (w, h) => {
    const V = viewFor(w), S = Math.min(w / (2 * V.x), h / (2 * V.y));
    return { S, ox: w / 2, oy: h / 2, V };
  };
  const X = (x) => T.ox + x * T.S, Y = (y) => T.oy - y * T.S;

  // a polyline of the level {F = t} over the chord [s0, s1] (fine in λ, so smooth in z)
  function levelPath(ctx, Fn, t, s0, s1, steps = 90) {
    for (let k = 0; k <= steps; k++) {
      const z = levelPoint(Fn, t, s0 + ((s1 - s0) * k) / steps);
      if (k) ctx.lineTo(X(z[0]), Y(z[1])); else ctx.moveTo(X(z[0]), Y(z[1]));
    }
  }

  // the full level circle {F = t} (a line when t = 0)
  function levelCircle(ctx, Fn, t) {
    const ca = Math.cos(Fn.a), sa = Math.sin(Fn.a);
    if (Math.abs(t) < 1e-9) {
      const L = 50; // direction i e^{ia}
      ctx.moveTo(X(Fn.p[0] + sa * L), Y(Fn.p[1] - ca * L));
      ctx.lineTo(X(Fn.p[0] - sa * L), Y(Fn.p[1] + ca * L));
      return;
    }
    const cx = Fn.p[0] + ca / (2 * t), cy = Fn.p[1] + sa / (2 * t), r = 1 / (2 * Math.abs(t));
    ctx.moveTo(X(cx) + r * T.S, Y(cy));
    ctx.arc(X(cx), Y(cy), r * T.S, 0, 2 * Math.PI);
  }

  // the region {z ∈ K : f(z) ∈ I}: in the λ-plane a disk cut by two vertical lines (convex);
  // clip a fine polygon of K_λ there, refine its edges, and map back by z = b + e^{iθ}/λ
  function bandPath(ctx, Fn, I) {
    const im = imageDisk(Fn, K_DISK);
    if (!im) return;
    let poly = [];
    for (let k = 0; k < 360; k++) {
      const a = (2 * Math.PI * k) / 360;
      poly.push([im.m[0] + im.r * Math.cos(a), im.m[1] + im.r * Math.sin(a)]);
    }
    const clip = (pts, keep, cut) => {
      const out = [];
      for (let k = 0; k < pts.length; k++) {
        const A = pts[k], B = pts[(k + 1) % pts.length], ka = keep(A), kb = keep(B);
        if (ka) out.push(A);
        if (ka !== kb) { const u = cut(A, B); out.push([A[0] + u * (B[0] - A[0]), A[1] + u * (B[1] - A[1])]); }
      }
      return out;
    };
    poly = clip(poly, (P) => P[0] >= I[0], (A, B) => (I[0] - A[0]) / (B[0] - A[0]));
    poly = clip(poly, (P) => P[0] <= I[1], (A, B) => (I[1] - A[0]) / (B[0] - A[0]));
    if (poly.length < 3) return;
    let first = true;
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]), steps = Math.max(1, Math.ceil((len / im.r) * 60));
      for (let m = 0; m < steps; m++) {
        const u = m / steps, lx = A[0] + u * (B[0] - A[0]), ly = A[1] + u * (B[1] - A[1]);
        const z = levelPoint(Fn, lx, ly);
        if (first) { ctx.moveTo(X(z[0]), Y(z[1])); first = false; } else ctx.lineTo(X(z[0]), Y(z[1]));
      }
    }
    ctx.closePath();
  }

  function draw(ctx, w, h) {
    const P = palette();
    if (!st.res) st.res = analyze(F(), G(), interval());
    T = layout(w, h);
    const Fn = F(), Gn = G(), I = interval(), res = st.res;
    const Kc = [X(K_DISK.c[0]), Y(K_DISK.c[1])], Kr = K_DISK.r * T.S;
    const clipK = () => { ctx.beginPath(); ctx.arc(Kc[0], Kc[1], Kr, 0, 2 * Math.PI); ctx.clip(); };
    const clipOut = () => { ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(Kc[0], Kc[1], Kr, 0, 2 * Math.PI); ctx.clip('evenodd'); };

    // K
    ctx.fillStyle = rgba(P.mesh, P.dark ? 0.1 : 0.06);
    ctx.beginPath(); ctx.arc(Kc[0], Kc[1], Kr, 0, 2 * Math.PI); ctx.fill();

    // the band f^{-1}(I) ∩ K, swept by the level continua D_t
    ctx.fillStyle = rgba(P.u, P.dark ? 0.2 : 0.13);
    ctx.beginPath(); bandPath(ctx, Fn, I); ctx.fill();

    // level circles: f (cobalt) and w (teal, lighter), evenly spaced over their ranges on K
    const levels = (Fx) => { const [lo, hi] = rangeOn(Fx, K_DISK), out = []; for (let k = 1; k <= 11; k++) out.push(lo + ((hi - lo) * k) / 12); return out; };
    const tf = levels(Fn), tw = levels(Gn);
    const strokeLevels = (Fx, ts, color, aIn, aOut, lw) => {
      ctx.save(); clipOut(); ctx.strokeStyle = rgba(color, aOut); ctx.lineWidth = 1;
      ctx.beginPath(); for (const t of ts) levelCircle(ctx, Fx, t); ctx.stroke(); ctx.restore();
      ctx.save(); clipK(); ctx.strokeStyle = rgba(color, aIn); ctx.lineWidth = lw;
      ctx.beginPath(); for (const t of ts) levelCircle(ctx, Fx, t); ctx.stroke(); ctx.restore();
    };
    strokeLevels(Gn, tw, P.w, P.dark ? 0.6 : 0.55, P.dark ? 0.14 : 0.1, 1.1);
    strokeLevels(Fn, tf, P.u, P.dark ? 0.42 : 0.34, P.dark ? 0.16 : 0.12, 1);

    // a few level continua D_t, t ∈ I, and the two ends of I
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(P.u, 0.85);
    ctx.lineWidth = 1.6;
    for (let k = 1; k < 8; k++) {
      const t = I[0] + ((I[1] - I[0]) * k) / 8, chd = levelChord(Fn, K_DISK, t);
      if (!chd) continue;
      ctx.beginPath(); levelPath(ctx, Fn, t, chd[0], chd[1]); ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = P.u;
    for (const t of I) {
      const chd = levelChord(Fn, K_DISK, t);
      if (!chd) continue;
      ctx.beginPath(); levelPath(ctx, Fn, t, chd[0], chd[1]); ctx.stroke();
    }

    // the minimizing continuum D_{t*} and where w attains its extremes on it
    const om = oscOnLevel(Fn, Gn, K_DISK, res.tMin);
    const lab = [];
    if (om && res.b0 > 1e-12) { // (when b_0 = 0 every D_t lies in a level of w: nothing to single out)
      ctx.strokeStyle = P.text; ctx.lineWidth = 3.2;
      ctx.beginPath(); levelPath(ctx, Fn, res.tMin, om.s0, om.s1); ctx.stroke();
      ctx.strokeStyle = P.u; ctx.lineWidth = 1.6;
      ctx.beginPath(); levelPath(ctx, Fn, res.tMin, om.s0, om.s1); ctx.stroke();
      if (om.osc > 1e-9) {
        for (const z of [om.zlo, om.zhi]) {
          ctx.fillStyle = P.w; ctx.strokeStyle = P.surface; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(X(z[0]), Y(z[1]), 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
      }
      const zm = levelPoint(Fn, res.tMin, om.s0 + 0.78 * (om.s1 - om.s0));
      const side = X(zm[0]) >= X(K_DISK.c[0]) ? 1 : -1; // put the label on the side away from K's centre
      lab.push({ id: 'dt', x: X(zm[0]) + side * 8, y: Y(zm[1]), tex: 'D_{t_*}', anchor: side > 0 ? 'e' : 'w', cls: 'halo' });
    }

    // the cells: the net T_n near K (when it is not too dense) and one cell B̄(q, 2r_n)
    const rn = 1 / st.n, step = rn * T.S;
    if (step >= 7) {
      ctx.fillStyle = rgba(P.mesh, P.dark ? 0.5 : 0.42);
      const reach = K_DISK.r + 2 * rn, m = Math.ceil(reach / rn);
      for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) {
        if ((i * rn) ** 2 + (j * rn) ** 2 > reach * reach) continue;
        ctx.beginPath(); ctx.arc(X(i * rn), Y(j * rn), 1.1, 0, 2 * Math.PI); ctx.fill();
      }
    }
    const qc = st.hover || (om ? levelPoint(Fn, res.tMin, om.s0 + 0.3 * (om.s1 - om.s0)) : [0, 0]);
    const q = [Math.round(qc[0] / rn) * rn, Math.round(qc[1] / rn) * rn];
    if (Math.hypot(q[0], q[1]) <= K_DISK.r + 2 * rn) {
      ctx.fillStyle = rgba(P.mesh, P.dark ? 0.22 : 0.16);
      ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 2 * rn * T.S, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 2 * rn * T.S, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.mesh; ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 2.4, 0, 2 * Math.PI); ctx.fill();
      st.cell = { q, of: cellOsc(Fn, q[0], q[1], 2 * rn), ow: cellOsc(Gn, q[0], q[1], 2 * rn), If: rangeOn(Fn, { c: q, r: 2 * rn }) };
    } else st.cell = null;

    // K outline
    ctx.strokeStyle = rgba(P.mesh, 0.9); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(Kc[0], Kc[1], Kr, 0, 2 * Math.PI); ctx.stroke();
    lab.push({ id: 'K', x: Kc[0] - Kr * 0.72 - 4, y: Kc[1] + Kr * 0.72 + 4, tex: 'K', anchor: 'sw', cls: 'halo', color: P.muted });

    // handles: the two ends of I (cobalt rings) and the punctures b, c (violet)
    const handle = (z, fill, ring) => {
      ctx.beginPath(); ctx.arc(X(z[0]), Y(z[1]), 6.5, 0, 2 * Math.PI);
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke();
    };
    const fa = mag(Fn, ...st.P0), fb = mag(Fn, ...st.P1);
    handle(st.P0, P.u, P.surface); handle(st.P1, P.u, P.surface);
    lab.push({ id: 'P0', x: X(st.P0[0]) + 9, y: Y(st.P0[1]) - 7, tex: fa <= fb ? '\\min I' : '\\max I', anchor: 'ne', cls: 'halo', color: P.u });
    lab.push({ id: 'P1', x: X(st.P1[0]) + 9, y: Y(st.P1[1]) - 7, tex: fa <= fb ? '\\max I' : '\\min I', anchor: 'ne', cls: 'halo', color: P.u });
    const same = Math.hypot(st.b[0] - st.c[0], st.b[1] - st.c[1]) < 1e-9;
    handle(st.c, P.mu, P.surface);
    handle(st.b, P.mu, P.surface);
    if (same) lab.push({ id: 'b', x: X(st.b[0]) - 9, y: Y(st.b[1]) - 7, tex: 'b=c', anchor: 'nw', cls: 'halo', color: P.mu });
    else {
      lab.push({ id: 'b', x: X(st.b[0]) - 9, y: Y(st.b[1]) - 7, tex: 'b', anchor: 'nw', cls: 'halo', color: P.mu });
      lab.push({ id: 'c', x: X(st.c[0]) + 9, y: Y(st.c[1]) + 7, tex: 'c', anchor: 'se', cls: 'halo', color: P.mu });
    }
    labels.set(lab);
  }

  function drawChart(ctx, w, h) {
    const P = palette(), res = st.res;
    if (!res) return;
    const rows = res.rows.filter((r) => r.valid);
    const padL = 44, padR = 14, padT = 12, padB = 26;
    const X0 = padL, X1 = w - padR, Y0 = h - padB, Y1 = padT;
    const nlo = Math.log(MESHES[0]), nhi = Math.log(MESHES[MESHES.length - 1]);
    const sx = (n) => X0 + ((Math.log(n) - nlo) / (nhi - nlo)) * (X1 - X0);
    const vals = rows.flatMap((r) => [r.S, r.M, r.CS]).concat(res.lhs > 0 ? [res.lhs] : []);
    let vlo = Math.min(...vals), vhi = Math.max(...vals);
    if (!Number.isFinite(vlo)) { vlo = 0.1; vhi = 10; }
    const e0 = Math.floor(Math.log10(vlo) - 0.15), e1 = Math.ceil(Math.log10(vhi) + 0.05);
    const sy = (v) => Y0 - ((Math.log10(v) - e0) / (e1 - e0)) * (Y0 - Y1);
    ctx.font = `11px ${cssVar('--font-body')}`;
    ctx.strokeStyle = P.grid; ctx.fillStyle = P.muted; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const lab = [];
    const estep = Math.max(1, Math.ceil((e1 - e0) / 4));
    for (let e = e0; e <= e1; e += estep) {
      ctx.beginPath(); ctx.moveTo(X0, Math.round(sy(10 ** e)) + 0.5); ctx.lineTo(X1, Math.round(sy(10 ** e)) + 0.5); ctx.stroke();
      lab.push({ id: 'e' + e, x: X0 - 5, y: sy(10 ** e), tex: `10^{${e}}`, anchor: 'w', cls: 'small' });
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const n of MESHES) {
      ctx.beginPath(); ctx.moveTo(sx(n), Y0); ctx.lineTo(sx(n), Y0 + 4); ctx.stroke();
      ctx.fillText(String(n), sx(n), Y0 + 7);
    }
    ctx.strokeStyle = P.muted; ctx.beginPath(); ctx.moveTo(X0, Y0 + 0.5); ctx.lineTo(X1, Y0 + 0.5); ctx.stroke();
    // meshes too coarse: a cell meets a puncture
    const bad = res.rows.filter((r) => !r.valid);
    if (bad.length) {
      const xb = sx(bad[bad.length - 1].n) + 6;
      ctx.fillStyle = rgba(P.mesh, P.dark ? 0.16 : 0.1);
      ctx.fillRect(X0, Y1, xb - X0, Y0 - Y1);
    }
    const series = (key, color, dash, lw) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
      ctx.beginPath(); rows.forEach((r, k) => (k ? ctx.lineTo(sx(r.n), sy(r[key])) : ctx.moveTo(sx(r.n), sy(r[key])))); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      for (const r of rows) { ctx.beginPath(); ctx.arc(sx(r.n), sy(r[key]), r.n === st.n ? 4.5 : 2.6, 0, 2 * Math.PI); ctx.fill(); }
    };
    if (rows.length) {
      series('CS', P.mesh, [4, 3], 1.3);
      series('S', P.mu, [], 2);
      series('M', rgba(P.mu, 0.5), [], 1.4);
      // labels where the lines are well apart: just above S_n and the bound near the coarse end,
      // the proof's middle sum just below its line further right
      const at = (n) => rows.find((r) => r.n >= n) || rows[rows.length - 1];
      const a1 = at(8), a2 = at(32);
      lab.push({ id: 'CS', x: sx(a1.n) + 5, y: sy(a1.CS) - 2, tex: '\\sqrt{E_f E_w}', anchor: 'ne', cls: 'halo small' });
      const tight = sy(a1.S) - sy(a1.CS) < 16; // S_n = √(E_f E_w) when w = f
      lab.push({ id: 'S', x: sx(a1.n) + 5, y: sy(a1.S) + (tight ? 3 : -2), tex: 'S_n', anchor: tight ? 'se' : 'ne', cls: 'halo', color: P.mu });
      lab.push({ id: 'M', x: sx(a2.n) + 4, y: sy(a2.M) + 3, tex: '\\textstyle\\sum_q\\operatorname{osc}w\\,|I\\cap I_q(f)|', anchor: 'se', cls: 'halo small' });
    }
    if (res.lhs > 0) {
      ctx.strokeStyle = P.w; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X0, sy(res.lhs)); ctx.lineTo(X1, sy(res.lhs)); ctx.stroke();
      lab.push({ id: 'L', x: X1 - 4, y: sy(res.lhs) - 3, tex: 'b_0|I|', anchor: 'nw', cls: 'halo', color: P.w });
    } else {
      lab.push({ id: 'L', x: X1 - 4, y: Y0 - 4, tex: 'b_0|I|=0', anchor: 'nw', cls: 'halo', color: P.w });
    }
    if (bad.length) lab.push({ id: 'bad', x: X0 + 4, y: Y1 + 2, html: 'cells reach a puncture', anchor: 'se', cls: 'small' });
    chLabels.set(lab);
  }

  function readout() {
    const res = st.res, I = interval(), r = res.rows.find((x) => x.n === st.n);
    const ok = (b) => (b ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    const valid = res.rows.filter((x) => x.valid);
    const all37 = valid.every((x) => x.ok37), allCS = valid.every((x) => x.okCS);
    const same = Math.hypot(st.b[0] - st.c[0], st.b[1] - st.c[1]) < 1e-9 && Math.abs(Math.sin(st.th - st.ph)) < 1e-9;
    const g = (v) => fmt.tex(v, 3);
    let rows = `<tr><td>$I=[${g(I[0])},${g(I[1])}]$</td><td class="num">$|I|=${g(I[1] - I[0])}$</td></tr>
      <tr><td>$b_0=\\min_{t\\in I}\\operatorname{osc}_{D_t}w$</td><td class="num">$${g(res.b0)}$</td></tr>
      <tr><td>$b_0|I|$</td><td class="num">$${g(res.lhs)}$</td></tr>`;
    if (r && r.valid) {
      rows += `<tr class="sep"><td>$S_n$ at $n=${st.n}$ <span class="dim">(${r.cells.toLocaleString('en-US')} cells)</span></td><td class="num">$${g(r.S)}$</td></tr>
        <tr><td>$E_f=\\sum(\\operatorname{osc}f)^2$</td><td class="num">$${g(r.Ef)}$</td></tr>
        <tr><td>$E_w=\\sum(\\operatorname{osc}w)^2$</td><td class="num">$${g(r.Ew)}$</td></tr>
        <tr><td colspan="2">(3.7) $b_0|I|\\le S_n$ at $n=${st.n}$ ${ok(r.ok37)}</td></tr>
        <tr><td colspan="2">$S_n\\le\\sqrt{E_f}\\sqrt{E_w}=${g(r.CS)}$ ${ok(r.okCS)}</td></tr>`;
    } else {
      rows += `<tr class="sep"><td colspan="2" class="dim">At $n=${st.n}$ a cell $\\overline B(q,2r_n)$ meeting $K$ contains a puncture: $n$ is not yet large enough.</td></tr>`;
    }
    rows += `<tr class="sep"><td colspan="2">(3.7) at all ${valid.length} meshes that avoid the punctures ${ok(all37)}; Cauchy–Schwarz ${ok(allCS)}</td></tr>`;
    setTex(ro, `<table>${rows}</table>`);
    let note;
    if (same) note = '$w=f$: every $D_t$ is a level of $w$ too, so $b_0=0$ and (3.7) says nothing. This is why Lemma 4.3 needs $c\\ne b$.';
    else note = 'Lemma 3.8’s “consequently”: if $E_f\\to0$ and $E_w\\to0$ along a sequence, Cauchy–Schwarz forces $S_n\\to0$, impossible while $b_0|I|$ stays positive. Here $f,w$ are fixed, so $S_n$ stays put.';
    if (st.cell) {
      const c = st.cell;
      note += ` <span class="dim">Dashed cell: $\\operatorname{osc}f=${g(c.of)}$, $\\operatorname{osc}w=${g(c.ow)}$.</span>`;
    }
    setTex(hint, note + ' Drag $b$, $c$ and the ends of $I$; hover or tap to pick a cell.');
  }

  // dragging
  let drag = null;
  const toW = (x, y) => [(x - T.ox) / T.S, -(y - T.oy) / T.S];
  const clampOut = (p) => {
    const d = Math.hypot(p[0], p[1]), m = K_DISK.r + MARGIN;
    let q = d < m ? [(p[0] * m) / (d || 1), (p[1] * m) / (d || 1)] : p.slice();
    const V = T.V;
    q = [Math.max(-V.x + 0.05, Math.min(V.x - 0.05, q[0])), Math.max(-V.y + 0.05, Math.min(V.y - 0.05, q[1]))];
    return q;
  };
  const clampIn = (p) => {
    const d = Math.hypot(p[0], p[1]), m = K_DISK.r - 0.03;
    return d > m ? [(p[0] * m) / d, (p[1] * m) / d] : p.slice();
  };
  pointer(cv.wrap, {
    down(x, y) {
      if (!T) return false;
      const p = toW(x, y);
      const cand = [['P0', st.P0], ['P1', st.P1], ['c', st.c], ['b', st.b]];
      for (const [k, q] of cand) if (Math.hypot(q[0] - p[0], q[1] - p[1]) * T.S < 15) { drag = k; return true; }
      if (Math.hypot(p[0], p[1]) <= K_DISK.r + 2 / st.n) { st.hover = p; cv.redraw(); scheduleReadout(); } // a tap picks a cell
      return false;
    },
    move(x, y) {
      const p = toW(x, y);
      if (drag === 'P0' || drag === 'P1') st[drag] = clampIn(p);
      else {
        st[drag] = clampOut(p);
        if (st.preset) { st.preset = null; pre.set(null); }
      }
      update();
    },
    up() { drag = null; },
    hover(x, y) {
      if (!T) return;
      const p = toW(x, y);
      if (Math.hypot(p[0], p[1]) <= K_DISK.r + 2 / st.n) { st.hover = p; cv.redraw(); scheduleReadout(); }
    },
    leave(e) { if (st.hover && e.pointerType === 'mouse') { st.hover = null; cv.redraw(); scheduleReadout(); } }, // a tapped cell stays
  });

  onTheme(() => { cv.redraw(); ch.redraw(); });
  update();
}
