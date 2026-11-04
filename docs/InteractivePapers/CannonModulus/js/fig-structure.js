// Figure 2 — Proposition 2.6 (Sullivan–Tukia): at a point x the conformal structures form a
// hyperbolic plane C_x (positive definite forms on T_xS² modulo scalars); pullback by an invertible
// linear map of either orientation is an isometry of C_x; a bounded orbit {f^*q_round} has a unique
// hyperbolic circumcenter q, and because pullback permutes the orbit, f^*q = q for every f.
//
// Model: one tangent plane, a finite group of linear maps (conjugated by h, so its distortion is
// bounded but not 1), the orbit of the round form drawn in the Poincaré disk (round form at the
// centre), and its minimal enclosing ball computed exactly (Welzl's algorithm in the hyperboloid
// model, where a ball's boundary is cut out by a linear equation).
import { el, makeCanvas, labelLayer, slider, chips, button, controls, pointer, setTex, palette, onTheme, fmt, rgba } from './common.js';

// ───────────────────────── 2×2 matrices, row-major [a, b, c, d] = [[a, b], [c, d]] ─────────────────────────

export const I2 = [1, 0, 0, 1];
export const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
export const transpose = (A) => [A[0], A[2], A[1], A[3]];
export const det = (A) => A[0] * A[3] - A[1] * A[2];
export const inv = (A) => { const d = det(A); return [A[3] / d, -A[1] / d, -A[2] / d, A[0] / d]; };
export const rot = (t) => [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)];
/** Reflection of the plane in the line at angle t (determinant −1). */
export const refl = (t) => [Math.cos(2 * t), Math.sin(2 * t), Math.sin(2 * t), -Math.cos(2 * t)];
const matClose = (A, B, tol = 1e-9) => A.every((x, i) => Math.abs(x - B[i]) <= tol * (1 + Math.abs(x)));
export const matPow = (A, k) => { let R = I2; for (let i = 0; i < k; i++) R = mul(R, A); return R; };

/** Linear distortion K(F) = σ₁/σ₂ (ratio of singular values). */
export function distortion(F) {
  const dt = det(F), d = Math.abs(dt);
  // K + 1/K = |F|²/|det F| =: x, and x − 2 is a sum of squares over |det F| (no cancellation near K = 1)
  const e = dt > 0 ? (F[0] - F[3]) ** 2 + (F[1] + F[2]) ** 2 : (F[0] + F[3]) ** 2 + (F[1] - F[2]) ** 2;
  const xm2 = e / d;
  return (xm2 + 2 + Math.sqrt(xm2 * (xm2 + 4))) / 2;
}

/** Square root of a symmetric positive definite matrix. */
export function spdSqrt(S) {
  const a = S[0], b = (S[1] + S[2]) / 2, c = S[3];
  const sd = Math.sqrt(a * c - b * b), t = Math.sqrt(a + c + 2 * sd);
  return [(a + sd) / t, b / t, b / t, (c + sd) / t];
}

// ───────────────────────── C_x: forms mod scalars = hyperboloid = Poincaré disk ─────────────────────────
// A form q = [[a, b], [b, c]] with det q = 1 is the point (T, X, Y) = ((a+c)/2, (c−a)/2, −b) of the
// hyperboloid T² − X² − Y² = 1, and cosh d(q₁, q₂) = ½ tr(q₁ q₂⁻¹) is the Lorentz product. With these
// signs the disk point of q sits at twice the angle of the long axis of the ellipse {v : q(v) ≤ 1},
// and d(q_round, F^*q_round) = log K(F).

export function normForm(q) {
  const d = Math.sqrt(det(q));
  const b = (q[1] + q[2]) / 2 / d;
  return [q[0] / d, b, b, q[3] / d];
}
/** Pullback F^*q = Fᵀ q F, normalized to determinant 1 (forms are taken modulo positive scalars). */
export function pullback(F, q) {
  const r = mul(transpose(F), mul(q, F));
  return normForm(r);
}
export const lor = (u, v) => u[0] * v[0] - u[1] * v[1] - u[2] * v[2];
export function formToVec(q) { q = normForm(q); return [(q[0] + q[3]) / 2, (q[3] - q[0]) / 2, -q[1]]; }
export function vecToForm(v) { return [v[0] - v[1], -v[2], -v[2], v[0] + v[1]]; }
export function vecToDisk(v) { return [v[1] / (1 + v[0]), v[2] / (1 + v[0])]; }
export function diskToVec(z) {
  const s = 1 - z[0] * z[0] - z[1] * z[1];
  return [(2 - s) / s, (2 * z[0]) / s, (2 * z[1]) / s];
}
export const formToDisk = (q) => vecToDisk(formToVec(q));
export const diskToForm = (z) => vecToForm(diskToVec(z));
/** The pullback F^* as a map of the disk (Möbius if det F > 0, anti-Möbius if det F < 0). */
export const pullDisk = (F, z) => formToDisk(pullback(F, diskToForm(z)));

// complex numbers as [re, im]; Möbius maps of the disk
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
/** φ_c(z) = (z − c)/(1 − c̄z): the isometry taking c to 0. */
export const mob = (c, z) => cdiv([z[0] - c[0], z[1] - c[1]], [1 - (c[0] * z[0] + c[1] * z[1]), -(c[0] * z[1] - c[1] * z[0])]);
export const mobInv = (c, w) => cdiv([w[0] + c[0], w[1] + c[1]], [1 + (c[0] * w[0] + c[1] * w[1]), c[0] * w[1] - c[1] * w[0]]);
export function hdist(a, b) {
  const w = mob(a, b);
  return 2 * Math.atanh(Math.min(1 - 1e-16, Math.hypot(w[0], w[1])));
}

// ───────────────────────── the circumcenter (minimal enclosing ball) ─────────────────────────
// In the hyperboloid model the ball B(c, r) is {p : ⟨c, p⟩ ≤ cosh r}, so the centre of a ball through
// two or three points solves linear equations: through p, q the midpoint (p+q)/|p+q|; through p, q, s
// the timelike vector Lorentz-orthogonal to p−q and p−s. Welzl's algorithm (iterative form) then
// finds the unique minimal enclosing ball; it is exact up to rounding.

const unitTimelike = (v) => {
  let n2 = lor(v, v);
  if (!(n2 > 0)) return null;
  const s = (v[0] < 0 ? -1 : 1) / Math.sqrt(n2);
  return [v[0] * s, v[1] * s, v[2] * s];
};
const ballFrom = (c, pts) => ({ c, ch: Math.max(1, ...pts.map((p) => lor(c, p))) });
function ball2(p, q) { return ballFrom(unitTimelike([p[0] + q[0], p[1] + q[1], p[2] + q[2]]), [p, q]); }
function ball3(p, q, s) {
  const u = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], v = [p[0] - s[0], p[1] - s[1], p[2] - s[2]];
  // c with ⟨c,u⟩ = ⟨c,v⟩ = 0: Jc ∥ u × v, J = diag(1, −1, −1)
  const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const c = unitTimelike([x[0], -x[1], -x[2]]);
  if (!c) return null;
  return ballFrom(c, [p, q, s]);
}
const inside = (B, p, tol = 1e-12) => lor(B.c, p) <= B.ch * (1 + tol) + tol;

function dedupeDisk(pts, tol = 1e-9) {
  const out = [];
  for (const z of pts) if (!out.some((w) => hdist(w, z) < tol)) out.push(z);
  return out;
}

/** Minimal enclosing ball of disk points: { c (disk point), r (hyperbolic radius), support }. */
export function circumcenter(diskPts) {
  const Z = dedupeDisk(diskPts);
  if (!Z.length) return null;
  // a fixed shuffle keeps the expected running time linear and the result reproducible
  let s = 0x9e3779b9 ^ Z.length;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = Z.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [Z[i], Z[j]] = [Z[j], Z[i]]; }
  const P = Z.map(diskToVec);
  const n = P.length;
  let B = { c: P[0], ch: 1 };
  for (let i = 1; i < n; i++) {
    if (inside(B, P[i])) continue;
    B = { c: P[i], ch: 1 };
    for (let j = 0; j < i; j++) {
      if (inside(B, P[j])) continue;
      B = ball2(P[i], P[j]);
      for (let k = 0; k < j; k++) {
        if (inside(B, P[k])) continue;
        B = ball3(P[i], P[j], P[k]) || [ball2(P[i], P[k]), ball2(P[j], P[k]), ball2(P[i], P[j])].sort((x, y) => y.ch - x.ch)[0];
      }
    }
  }
  const c = vecToDisk(B.c);
  let r = 0;
  for (const z of Z) r = Math.max(r, hdist(c, z));
  return { c, r };
}

/** Brute force for tests: the smallest ball through 1, 2 or 3 of the points that contains them all. */
export function circumcenterBrute(diskPts) {
  const Z = dedupeDisk(diskPts), P = Z.map(diskToVec), n = P.length;
  if (n === 1) return { c: Z[0], r: 0 };
  let best = null;
  const consider = (B) => {
    if (!B || !P.every((p) => inside(B, p, 1e-9))) return;
    if (!best || B.ch < best.ch) best = B;
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    consider(ball2(P[i], P[j]));
    for (let k = j + 1; k < n; k++) consider(ball3(P[i], P[j], P[k]));
  }
  const c = vecToDisk(best.c);
  let r = 0;
  for (const z of Z) r = Math.max(r, hdist(c, z));
  return { c, r };
}

// ───────────────────────── groups, orbits, checks ─────────────────────────

/** The finite group generated by gens (null if it has more than cap elements). Words index gens. */
export function closeGroup(gens, cap = 96) {
  const els = [{ M: I2, word: [] }];
  for (let i = 0; i < els.length; i++) {
    for (let g = 0; g < gens.length; g++) {
      const M = mul(els[i].M, gens[g]);
      if (!els.some((e) => matClose(e.M, M))) {
        els.push({ M, word: [...els[i].word, g] });
        if (els.length > cap) return null;
      }
    }
  }
  return els;
}

/** The orbit {f^*q₀ : f ∈ els} as distinct disk points, each with the elements that land on it. */
export function orbitOf(els, q0 = I2) {
  const pts = [];
  els.forEach((e, i) => {
    const q = pullback(e.M, q0), z = formToDisk(q);
    const hit = pts.find((p) => hdist(p.z, z) < 1e-9);
    if (hit) hit.els.push(i); else pts.push({ q, z, els: [i], K: distortion(e.M) });
  });
  return pts;
}

/** Does F^* permute the point set? (a bijection up to tol) */
export function permutes(F, pts, tol = 1e-8) {
  const hits = new Array(pts.length).fill(0);
  let missing = 0, maxErr = 0, worst = 0;
  for (const p of pts) {
    const z = pullDisk(F, p.z);
    let best = Infinity, bi = -1;
    pts.forEach((o, j) => { const d = hdist(z, o.z); if (d < best) { best = d; bi = j; } });
    worst = Math.max(worst, best);
    if (best < tol) { hits[bi]++; maxErr = Math.max(maxErr, best); } else missing++;
  }
  return { ok: missing === 0 && hits.every((h) => h === 1), missing, maxErr, worst };
}

/** max |d(F^*x, F^*y) − d(x, y)| over pseudo-random pairs in the disk: pullback is an isometry. */
export function isometryDefect(F, n = 60, seed = 5) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pt = () => { const r = 0.85 * Math.sqrt(rnd()), a = 2 * Math.PI * rnd(); return [r * Math.cos(a), r * Math.sin(a)]; };
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const x = pt(), y = pt();
    const d0 = hdist(x, y), d1 = hdist(pullDisk(F, x), pullDisk(F, y));
    worst = Math.max(worst, Math.abs(d1 - d0) / Math.max(1, d0));
  }
  return worst;
}

// ───────────────────────── presets ─────────────────────────
// Each preset is a finite group (or, for the shear, a finite set that is not closed) of linear maps g,
// conjugated by h: the maps acting are f = h⁻¹gh. Q0 is a form the unconjugated group fixes, so the
// conjugated group fixes h^*Q0 = hᵀQ0h.

export const PRESETS = {
  c5: {
    chip: 'rotations $C_5$',
    gens: [{ name: '\\rho', M: rot((2 * Math.PI) / 5) }],
    Q0: I2, closed: true, h: { K: 1.9, ang: 0.9 },
  },
  d3: {
    chip: '$D_3$ with reflections',
    gens: [{ name: '\\rho', M: rot((2 * Math.PI) / 3) }, { name: '\\sigma', M: refl(0) }],
    Q0: I2, closed: true, h: { K: 2.1, ang: 0.62 },
  },
  lattice: {
    chip: '$D_6\\subset\\mathrm{GL}_2(\\mathbb Z)$',
    gens: [{ name: 'a', M: [1, -1, 1, 0] }, { name: 'b', M: [0, 1, 1, 0] }],
    Q0: [2, -1, -1, 2], closed: true, h: { K: 1, ang: 0.6 },
  },
  shear: {
    chip: 'a shear: not closed',
    gens: [{ name: 's', M: [1, 0.5, 0, 1] }],
    iterates: 5, Q0: null, closed: false, h: { K: 1, ang: 0.6 },
  },
};

/** Handle point (a disk point) → the conjugator h = (handle form)^{1/2}, symmetric with det 1. */
export function conjugatorFrom(handleZ) { return spdSqrt(diskToForm(handleZ)); }

/** Everything the figure shows, as pure data. */
export function buildConfig(key, handleZ) {
  const pre = PRESETS[key];
  const h = conjugatorFrom(handleZ), hi = inv(h);
  const gens = pre.gens.map((g) => ({ name: g.name, M: mul(hi, mul(g.M, h)), det: det(g.M) }));
  let els;
  if (pre.closed) els = closeGroup(gens.map((g) => g.M));
  else els = Array.from({ length: pre.iterates }, (_, k) => ({ M: matPow(gens[0].M, k), word: Array(k).fill(0) }));
  const pts = orbitOf(els);
  const cc = circumcenter(pts.map((p) => p.z));
  const K = Math.max(...els.map((e) => distortion(e.M)));
  const invariant = pre.Q0 ? formToDisk(pullback(h, pre.Q0)) : null;
  const checks = gens.map((g) => {
    const perm = permutes(g.M, pts);
    const moved = hdist(pullDisk(g.M, cc.c), cc.c);
    return { name: g.name, det: g.det, perm, moved, iso: isometryDefect(g.M) };
  });
  return { key, pre, h, gens, els, pts, cc, K, invariant, checks, closed: pre.closed };
}

// ───────────────────────── animation paths of a pullback ─────────────────────────

/** A path z ↦ z_t (t ∈ [0,1]) from the identity to F^*, for drawing. Elliptic and reflection
 *  pullbacks fixing c are drawn as a rotation or a page-turn about c; a unipotent F by I + t(F − I). */
export function pullPath(F, c) {
  const Fc = pullDisk(F, c);
  if (hdist(Fc, c) < 1e-7) {
    const N = (w) => mob(c, pullDisk(F, mobInv(c, w)));
    const probe = N([0.5, 0]);
    const ang = Math.atan2(probe[1], probe[0]);
    if (det(F) > 0) {
      return (z, t) => { const w = mob(c, z), e = [Math.cos(t * ang), Math.sin(t * ang)]; return mobInv(c, cmul(e, w)); };
    }
    const half = ang / 2, e = [Math.cos(half), Math.sin(half)], ei = [Math.cos(half), -Math.sin(half)];
    return (z, t) => {
      const u = cmul(ei, mob(c, z));
      return mobInv(c, cmul(e, [u[0], Math.cos(Math.PI * t) * u[1]]));
    };
  }
  const E = [F[0] - 1, F[1], F[2], F[3] - 1];
  if (Math.hypot(...mul(E, E)) < 1e-9) {
    return (z, t) => pullDisk([1 + t * E[0], t * E[1], t * E[2], 1 + t * E[3]], z);
  }
  return (z, t) => { // geodesic interpolation to the image
    const w = pullDisk(F, z), v = mob(z, w), r = Math.hypot(v[0], v[1]);
    if (r < 1e-15) return z;
    const d = 2 * Math.atanh(Math.min(r, 1 - 1e-16)), rt = Math.tanh((t * d) / 2) / r;
    return mobInv(z, [v[0] * rt, v[1] * rt]);
  };
}

// ───────────────────────── figure ─────────────────────────

const HANDLE_MAX_K = 3;
const handleFromK = (K, ang) => { const r = Math.tanh(Math.log(K) / 2); return [r * Math.cos(ang), r * Math.sin(ang)]; };

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { key: 'd3', handle: handleFromK(PRESETS.d3.h.K, PRESETS.d3.h.ang), cfg: null, anim: null, after: null };
  st.cfg = buildConfig(st.key, st.handle);

  const legend = el('div', { class: 'panel-hint' });
  left.append(legend);
  setTex(legend, '<span style="color:var(--c-u)">⬭</span> orbit $f^*q_{\\rm round}$, drawn as its ellipse &nbsp; '
    + '<span style="color:var(--c-mu)">◯</span> minimal enclosing ball, centre $q$ &nbsp; '
    + '<span style="color:var(--c-mesh)">┄</span> $B(q_{\\rm round},\\log K)$ &nbsp; '
    + '<span style="color:var(--c-w)">●</span> after pullback');
  const cv = makeCanvas(left, { aspect: 1, maxHeight: 470, minHeight: 280, draw });
  const labels = labelLayer(cv.wrap);
  let geo = null;

  // ── controls
  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const presetChips = chips(ctl, {
    label: 'Maps',
    options: Object.entries(PRESETS).map(([k, p]) => [k, p.chip]),
    value: st.key,
    onchange: (k) => {
      st.key = k;
      st.handle = handleFromK(PRESETS[k].h.K, PRESETS[k].h.ang);
      kSlider.set(PRESETS[k].h.K);
      rebuild();
      buildGenButtons();
    },
  });
  const kSlider = slider(ctl, {
    label: 'conjugator $K(h)$',
    min: 1, max: HANDLE_MAX_K, step: 0.01, value: PRESETS.d3.h.K,
    fmt: (v) => v.toFixed(2),
    oninput: (v) => {
      const r = Math.hypot(...st.handle);
      const ang = r > 1e-9 ? Math.atan2(st.handle[1], st.handle[0]) : PRESETS[st.key].h.ang;
      st.handle = handleFromK(v, ang);
      rebuild();
    },
  });
  const genWrap = el('div', { class: 'chips' });
  const genName = el('span', { class: 'ctl-name' });
  const genRow = el('div', { class: 'btn-row' });
  genWrap.append(genName, genRow);
  ctl.append(genWrap);
  setTex(genName, 'Pull back by a generator');
  function buildGenButtons() {
    genRow.innerHTML = '';
    st.cfg.gens.forEach((g, i) => {
      button(genRow, `$${g.name}^*$`, () => animate(i));
    });
  }
  buildGenButtons();

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  const hint = el('div', { class: 'hint' });
  right.append(hint);
  setTex(hint, '<b>Drag</b> $h$ to conjugate the maps; the orbit moves, and the centre follows the form they fix.');

  function rebuild() {
    st.anim = null; st.after = null;
    st.cfg = buildConfig(st.key, st.handle);
    cv.redraw();
    readout();
  }

  // ── animation of a pullback
  function animate(i) {
    const cfg = st.cfg, g = cfg.gens[i];
    const path = pullPath(g.M, cfg.cc.c);
    st.after = null;
    st.anim = { i, path, t0: performance.now(), dur: 1300, fade: 0 };
    const step = (now) => {
      const a = st.anim;
      if (!a || a.path !== path) return;
      const u = Math.min(1, (now - a.t0) / a.dur);
      a.t = 0.5 - 0.5 * Math.cos(Math.PI * u);
      if (u >= 1) {
        if (cfg.closed) {
          a.fade = Math.min(1, (now - a.t0 - a.dur) / 500);
          if (a.fade >= 1) { st.anim = null; cv.redraw(); return; }
        } else {
          st.after = { path, i };
          st.anim = null; cv.redraw(); readout(); return;
        }
      }
      cv.redraw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    readout(i);
  }

  // ── drawing
  function circlePts(c, r, n = 96) {
    const rho = Math.tanh(r / 2), out = [];
    for (let k = 0; k <= n; k++) { const a = (2 * Math.PI * k) / n; out.push(mobInv(c, [rho * Math.cos(a), rho * Math.sin(a)])); }
    return out;
  }
  function geodesic(a, b, n = 28) {
    const w = mob(a, b), out = [];
    const r = Math.hypot(w[0], w[1]);
    const d = 2 * Math.atanh(Math.min(r, 1 - 1e-16));
    for (let k = 0; k <= n; k++) {
      const s = r < 1e-15 ? 0 : Math.tanh((d * k) / n / 2) / r;
      out.push(mobInv(a, [w[0] * s, w[1] * s]));
    }
    return out;
  }
  function glyph(ctx, x, y, q, color, fill, lw = 1.4) {
    // unit ball {v : q(v) ≤ 1}; only its shape matters (forms are taken modulo scalars)
    const a = q[0], b = q[1], c = q[3];
    const tr = a + c, disc = Math.sqrt(Math.max(0, (a - c) * (a - c) / 4 + b * b));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc; // l1 ≥ l2, l1 l2 = 1
    const K = l1 / l2;
    // long axis: eigenvector of the small eigenvalue l2
    const ang = Math.abs(b) > 1e-14 || Math.abs(a - c) > 1e-14 ? Math.atan2(l2 - a, b) : 0;
    const long = Math.min(18, 9 * Math.pow(K, 0.3)), short = Math.max(2, long / K);
    ctx.beginPath();
    ctx.ellipse(x, y, long, short, -ang, 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  }

  function draw(ctx, w, h) {
    const P = palette();
    const cfg = st.cfg;
    const R = Math.min(w, h) / 2 - 6, cx = w / 2, cy = h / 2;
    if (R < 20) return;
    geo = { R, cx, cy };
    const X = (z) => [cx + R * z[0], cy - R * z[1]];
    const poly = (pts) => { ctx.beginPath(); pts.forEach((z, k) => { const [x, y] = X(z); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
    const labs = [];

    // the plane C_x
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(P.mesh, P.dark ? 0.1 : 0.07); ctx.fill();

    // the bound: the orbit lies in B(q_round, log K)
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(P.mesh, 0.85);
    poly(circlePts([0, 0], Math.log(cfg.K))); ctx.stroke();
    ctx.restore();

    // minimal enclosing ball and its spokes
    ctx.strokeStyle = rgba(P.u, 0.28); ctx.lineWidth = 1;
    for (const p of cfg.pts) { poly(geodesic(cfg.cc.c, p.z)); ctx.stroke(); }
    ctx.strokeStyle = P.mu; ctx.lineWidth = 1.8;
    poly(circlePts(cfg.cc.c, cfg.cc.r)); ctx.stroke();

    // the conjugated invariant form (when it differs from the handle)
    // orbit points
    for (const p of cfg.pts) {
      const [x, y] = X(p.z);
      glyph(ctx, x, y, p.q, P.u, rgba(P.u, 0.16));
      ctx.fillStyle = P.u; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 2 * Math.PI); ctx.fill();
    }

    // handle h (at h^*q_round = hᵀh)
    const [hx, hy] = X(st.handle);
    ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, 2 * Math.PI);
    ctx.fillStyle = P.text; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = P.surface; ctx.stroke();

    // centre q
    const [qx, qy] = X(cfg.cc.c);
    ctx.beginPath(); ctx.arc(qx, qy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = P.mu; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = P.surface; ctx.stroke();

    // a pullback in progress (or, for a set that is not closed, its result)
    const a = st.anim || (st.after ? { path: st.after.path, t: 1, fade: 0 } : null);
    if (a && a.t !== undefined) {
      const alpha = 1 - (a.fade || 0);
      const col = rgba(P.w, alpha), colSoft = rgba(P.w, 0.22 * alpha);
      ctx.strokeStyle = rgba(P.w, 0.9 * alpha); ctx.lineWidth = 1.6; ctx.setLineDash([5, 3]);
      poly(circlePts(cfg.cc.c, cfg.cc.r).map((z) => a.path(z, a.t))); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of cfg.pts) {
        const z = a.path(p.z, a.t), [x, y] = X(z);
        glyph(ctx, x, y, diskToForm(z), col, colSoft, 1.6);
      }
      const zc = a.path(cfg.cc.c, a.t), [x, y] = X(zc);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill();
      if (!cfg.closed && a.t >= 1) labs.push({ id: 'fq', x: x + 7, y: y + 4, tex: `${cfg.gens[0].name}^*q`, anchor: 'se', cls: 'halo', color: P.w });
    }

    labs.push({ id: 'qr', x: cx - 7, y: cy + 7, tex: 'q_{\\rm round}', anchor: 'sw', cls: 'halo', color: P.u });
    labs.push({ id: 'q', x: qx + 6, y: qy - 6, tex: 'q', anchor: 'ne', cls: 'halo', color: P.mu });
    labs.push({ id: 'h', x: hx - 8, y: hy - 8, tex: 'h', anchor: 'nw', cls: 'halo' });
    labels.set(labs);
  }

  // ── dragging the conjugator
  const toDisk = (x, y) => [(x - geo.cx) / geo.R, -(y - geo.cy) / geo.R];
  pointer(cv.wrap, {
    down(x, y) {
      if (!geo) return false;
      const [hx, hy] = [geo.cx + geo.R * st.handle[0], geo.cy - geo.R * st.handle[1]];
      return Math.hypot(x - hx, y - hy) <= 16;
    },
    move(x, y) {
      let z = toDisk(x, y);
      const rmax = Math.tanh(Math.log(HANDLE_MAX_K) / 2), r = Math.hypot(z[0], z[1]);
      if (r > rmax) z = [(z[0] * rmax) / r, (z[1] * rmax) / r];
      st.handle = z;
      kSlider.set(Math.exp(hdist([0, 0], z)));
      rebuild();
    },
    hover(x, y) {
      if (!geo) return;
      const [hx, hy] = [geo.cx + geo.R * st.handle[0], geo.cy - geo.R * st.handle[1]];
      cv.wrap.style.cursor = Math.hypot(x - hx, y - hy) <= 16 ? 'grab' : '';
    },
  });

  // ── readout
  const tiny = (v) => (v < 1e-12 ? '0' : fmt.tex(v, 2));
  function readout(active) {
    const cfg = st.cfg;
    const ok = (b) => `<span class="${b ? 'ok' : 'bad'}">${b ? '✓' : '✗'}</span>`;
    const nRev = cfg.closed ? cfg.els.filter((e) => det(e.M) < 0).length : 0;
    const head = cfg.closed
      ? `$|G|=${cfg.els.length}$${nRev ? ` (${nRev} reverse orientation)` : ''}; the orbit has $${cfg.pts.length}$ points`
      : `the set $\\{(s^k)^*q_{\\rm round}:0\\le k\\lt ${cfg.pts.length}\\}$, not a group orbit`;
    const rows = cfg.checks.map((c, i) => {
      const fixes = c.moved < 1e-9;
      const orient = c.det < 0 ? ' <span class="dim">($\\det\\lt0$)</span>' : '';
      return `<tr${i === active ? ' style="background:var(--accent-soft)"' : ''}><td>$${c.name}$${orient}</td>
        <td class="num">${c.perm.ok ? ok(true) : `${ok(false)} <span class="dim">${c.perm.missing} out</span>`}</td>
        <td class="num">$${tiny(c.moved)}$ ${ok(fixes)}</td></tr>`;
    }).join('');
    const isoWorst = Math.max(...cfg.checks.map((c) => c.iso));
    const logK = Math.log(cfg.K);
    const dRound = hdist([0, 0], cfg.cc.c);
    const bounded = cfg.cc.r <= logK + 1e-9 && dRound <= cfg.cc.r + 1e-9;
    let inv = '';
    if (cfg.invariant) {
      const dInv = hdist(cfg.invariant, cfg.cc.c);
      inv = `<tr><td>$d(q,\\,h^*Q_0)$</td><td class="num" colspan="2">$${tiny(dInv)}$ ${ok(dInv < 1e-8)}</td></tr>`;
    }
    const sK = cfg.closed ? '' : `<tr><td colspan="3"><span class="bad">✗</span> $K(s^n)\\to\\infty$: the group $\\langle s\\rangle$ has no bounded orbit, and this finite piece of it is not invariant, so its centre moves.</td></tr>`;
    setTex(ro, `<div style="margin-bottom:.3rem">${head}</div>
      <table>
      <tr><th>$f$</th><th class="num">permutes</th><th class="num">$d_{\\mathbb H}(f^*q,q)$</th></tr>
      ${rows}
      <tr class="sep"><td>$K=\\max_f K(f)$</td><td class="num" colspan="2">$${fmt.tex(cfg.K, 3)}$</td></tr>
      <tr><td>radius $r\\le\\log K$</td><td class="num" colspan="2">$${cfg.cc.r.toFixed(3)}\\le${logK.toFixed(3)}$ ${ok(bounded)}</td></tr>
      <tr><td>$d(q,q_{\\rm round})\\le r$</td><td class="num" colspan="2">$${dRound.toFixed(3)}$ ${ok(dRound <= cfg.cc.r + 1e-9)}</td></tr>
      ${inv}
      <tr><td>pullbacks are isometries</td><td class="num" colspan="2">$${tiny(isoWorst)}$ ${ok(isoWorst < 1e-8)}</td></tr>
      ${sK}
      </table>`);
  }

  onTheme(() => cv.redraw());
  readout();
}
