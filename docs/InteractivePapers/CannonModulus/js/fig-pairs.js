// Figure 8 — §6, (6.8)–(6.11): the cost of a far pair (the paper's second figure, made live).
//
// Model. Z = S², the Riemann sphere with the chordal metric σ (distance in R³ on the unit sphere,
// a visual metric for any cocompact Kleinian group). Each panel is a stereographic chart: project
// from the antipode onto the tangent plane at the panel's base point, so the base point is w = 0,
// σ(w, w') = |w − w'| / √((1 + |w|²/4)(1 + |w'|²/4)), and σ ≈ |dw| near 0. The source chart is
// based at x_i (so x_i = 0 and z_0 = ∞ is its antipode, d(x_i, z_0) = 2); the target chart is a
// rotated copy of the same sphere (rotations are isometries, so nothing below depends on it).
// The expansion at x_i with scale R is the Möbius map
//     h_i(u) = p_i + R e^{iα}/u        (source chart u ↦ target chart v),
// so p_i = h_i z_0, and in chordal units h_i is an inversion of constant R: (2.2) and (2.3) hold
// with D_y = max{R, σ(x_i, y)} and constants between 1/5 and 5 (tests/fig-pairs.test.mjs). Möbius maps send disks to disks, and a
// chordal ball is a spherical cap and a disk in the chart, so every set below is computed exactly:
// sets are carried as chart disks (for Möbius images and drawing) and as caps {X : n·X ≥ cos θ}
// in R³ (for chordal radii, containments and disjointness).
import { el, makeCanvas, labelLayer, slider, chips, controls, pointer, setTex, palette, onTheme, fmt, rgba } from './common.js';

// ───────────────────────── pure math (node-testable) ─────────────────────────

/** The paper's constants, fixed: E = B̄(p, A_h R), s_ij = C_2 R²/d², D_ij = B̄(z_ij, C_μ s_ij), B̄(p_j, C_3 R). */
export const CONST = { Ah: 1, C2: 1.5, Cmu: 2, C3: 6 };
/** Bands for the "≍" statements. */
export const BAND = [0.5, 2];

/** Chordal distance in a chart. */
export function sigma(a, b) {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return d / Math.sqrt((1 + (a[0] * a[0] + a[1] * a[1]) / 4) * (1 + (b[0] * b[0] + b[1] * b[1]) / 4));
}

/** Chart point → unit vector in R³ (w = 0 is the base point (0,0,−1); w = ∞ is (0,0,1)). */
export function lift(w) {
  const zx = w[0] / 2, zy = w[1] / 2, q = zx * zx + zy * zy;
  return [(2 * zx) / (q + 1), (2 * zy) / (q + 1), (q - 1) / (q + 1)];
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot3(a, b))));

/** A chart disk { m, r, ext } (ext: the closed exterior |w − m| ≥ r, plus ∞) as a cap { n, th }. */
export function capOfDisk(D) {
  const mx = D.m[0] / 2, my = D.m[1] / 2, rr = D.r / 2, q = mx * mx + my * my - rr * rr;
  const a = [2 * mx, 2 * my, q - 1], b = 1 + q, L = Math.hypot(...a);
  let n = [a[0] / L, a[1] / L, a[2] / L], k = b / L;
  if (D.ext) { n = [-n[0], -n[1], -n[2]]; k = -k; }
  return { n, th: Math.acos(Math.max(-1, Math.min(1, k))) };
}

/** A cap { n, th } as a chart disk { m, r, ext }. */
export function diskOfCap(C) {
  const k = Math.cos(C.th), den = k - C.n[2];
  const lam = 2 / (Math.abs(den) < 1e-15 ? 1e-15 : den);
  const mx = (lam * C.n[0]) / 2, my = (lam * C.n[1]) / 2;
  const r2 = mx * mx + my * my - lam * k + 1;
  return { m: [2 * mx, 2 * my], r: 2 * Math.sqrt(Math.max(0, r2)), ext: lam < 0 };
}

/** The closed chordal ball B̄(c, r) as a cap (chordal r = 2 sin(θ/2)). */
export function ballCap(c, r) {
  return { n: lift(c), th: 2 * Math.asin(Math.min(1, r / 2)) };
}
export const ballDisk = (c, r) => diskOfCap(ballCap(c, r));

/**
 * Exact image of a chart disk { m, r, ext } under w ↦ q + K/(w − o), K = [Re, Im] (a Möbius map;
 * h_i is (q, K, o) = (p_i, Re^{iα}, 0) and h_i⁻¹ is (0, Re^{iα}, p_i)). Inversion keeps the inside
 * of a circle inside unless the pole o lies inside, when the inside goes to the outside.
 */
export function mobiusDisk(D, q, K, o) {
  const ux = D.m[0] - o[0], uy = D.m[1] - o[1], den = ux * ux + uy * uy - D.r * D.r;
  const cx = ux / den, cy = -uy / den, rr = D.r / Math.abs(den); // 1/u: centre conj(u)/den
  const kx = K[0] * cx - K[1] * cy, ky = K[0] * cy + K[1] * cx, kk = Math.hypot(K[0], K[1]);
  return { m: [q[0] + kx, q[1] + ky], r: kk * rr, ext: !!D.ext !== den < 0 };
}

/** Apply w ↦ q + K/(w − o) to a point. */
export function mobiusPoint(w, q, K, o) {
  const ux = w[0] - o[0], uy = w[1] - o[1], n2 = ux * ux + uy * uy;
  const ix = ux / n2, iy = -uy / n2;
  return [q[0] + K[0] * ix - K[1] * iy, q[1] + K[0] * iy + K[1] * ix];
}

/** Largest and smallest chordal distance from the point P (chart) to the cap C. */
export function maxDist(P, C) {
  return 2 * Math.sin(Math.min(Math.PI, ang(lift(P), C.n) + C.th) / 2);
}
export function minDist(P, C) {
  return 2 * Math.sin(Math.max(0, ang(lift(P), C.n) - C.th) / 2);
}
/** B ⊆ A for caps (exact, with a relative tolerance for round-off). */
export function capInside(B, A, tol = 1e-12) {
  return ang(B.n, A.n) + B.th <= A.th + tol;
}
export function capsDisjoint(A, B) {
  return ang(A.n, B.n) > A.th + B.th;
}

/**
 * Everything in (6.8)–(6.11) for one ordered pair: punctures p_i, p_j (target chart), scale R,
 * rotation α of h_i. Source chart: x_i = 0.
 */
export function pairCost({ pi, pj, R, alpha = 0 }, C = CONST) {
  const K = [R * Math.cos(alpha), R * Math.sin(alpha)], X0 = [0, 0];
  const d = sigma(pi, pj);
  const Ei = ballCap(pi, C.Ah * R), Ej = ballCap(pj, C.Ah * R);
  const EiD = diskOfCap(Ei), EjD = diskOfCap(Ej);
  const z = mobiusPoint(pj, X0, K, pi);                    // z_ij = h_i⁻¹ p_j
  const Dz = Math.max(R, sigma(X0, z));                    // D_{z_ij}
  const pre = mobiusDisk(EjD, X0, K, pi);                  // h_i⁻¹ E_j (exact)
  const preCap = capOfDisk(pre);
  const s = (C.C2 * R * R) / (d * d);                      // s_ij
  const sCap = ballCap(z, s), sD = diskOfCap(sCap);         // B̄(z_ij, s_ij)
  const DCap = ballCap(z, C.Cmu * s), DD = diskOfCap(DCap); // the charged ball D_ij
  const img = mobiusDisk(DD, pi, K, X0);                   // h_i D_ij (exact)
  const imgCap = capOfDisk(img);
  const tCap = ballCap(pj, C.C3 * R), tD = diskOfCap(tCap); // B̄(p_j, C_3 R)
  const preR = pre.ext ? Infinity : maxDist(z, preCap);    // radius of h_i⁻¹E_j about z_ij
  const imgR = img.ext ? Infinity : maxDist(pj, imgCap);   // radius of h_i D_ij about p_j
  const Dlo = Math.max(R, minDist(X0, DCap)), Dhi = Math.max(R, maxDist(X0, DCap)); // D_y on D_ij
  const sep = (C.Cmu * s) / Dz;
  const out = {
    d, ratio: R / d, z, Dz, s, sep,
    Ei: EiD, Ej: EjD, pre, sD, DD, img, tD,
    q68: (Dz * d) / R,
    q69: (preR * d * d) / (R * R),
    c2: (s * d * d) / (R * R),
    q611: imgR / R,
    Dy: [Dlo / Dz, Dhi / Dz],
    disjoint: capsDisjoint(Ei, Ej),
    ok68: false, ok69: false, ok69band: false, okSep: false, okDy: false, ok611: false,
  };
  const inBand = (v) => v >= BAND[0] && v <= BAND[1];
  out.ok68 = inBand(out.q68);
  out.ok69 = !pre.ext && capInside(preCap, sCap);
  out.ok69band = Number.isFinite(out.q69) && inBand(out.q69 / C.Ah);
  out.okSep = sep <= 0.5;
  out.okDy = !DD.ext && inBand(out.Dy[0]) && inBand(out.Dy[1]);
  out.ok611 = !img.ext && capInside(imgCap, tCap);
  out.allOk = out.disjoint && out.ok68 && out.ok69 && out.ok69band && out.okSep && out.okDy && out.ok611;
  return out;
}

// ───────────────────────── figure ─────────────────────────

const TV = { x: 0.62 };                     // target window half-width (chart units ≈ chordal)
const PRESETS = {
  far: { pi: [-0.3, -0.08], pj: [0.3, 0.08], R: 0.035 },
  closer: { pi: [-0.3, -0.08], pj: [-0.02, -0.01], R: 0.035 },
  near: { pi: [-0.3, -0.08], pj: [-0.187, -0.05], R: 0.035 },
};

export function mount(root) {
  const panels = el('div', { style: 'display:flex;flex-wrap:wrap;gap:.8rem 1rem' });
  const pS = el('div', { style: 'flex:1 1 260px;min-width:0' }), pT = el('div', { style: 'flex:1 1 260px;min-width:0' });
  panels.append(pS, pT);
  const row = el('div', { class: 'fig-row', style: 'margin-top:.9rem' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side', style: 'flex-basis:330px' });
  row.append(left, right);
  root.append(panels, row);

  const st = { preset: 'far', alpha: 0.35 };
  const load = (k) => { const p = PRESETS[k]; st.preset = k; st.pi = p.pi.slice(); st.pj = p.pj.slice(); st.R = p.R; };
  load('far');
  let res = null;

  const hS = el('div', { class: 'panel-hint' }), hT = el('div', { class: 'panel-hint' });
  pS.append(hS); pT.append(hT);
  setTex(hS, '<b>Source</b>, near $x_i$ (scale $R/d_{ij}$)');
  setTex(hT, '<b>Target</b>, after $h_i$ (drag $p_i$, $p_j$)');
  const asp = (w) => (w < 420 ? 0.86 : 0.78);
  const cvS = makeCanvas(pS, { aspect: asp, maxHeight: 400, minHeight: 230, draw: drawSource });
  const cvT = makeCanvas(pT, { aspect: asp, maxHeight: 400, minHeight: 230, draw: drawTarget });
  for (const c of [cvS, cvT]) c.wrap.style.cssText += ';border:1px solid var(--border);border-radius:8px;overflow:hidden';
  const labS = labelLayer(cvS.wrap), labT = labelLayer(cvT.wrap);

  const ctl = controls(left);
  ctl.style.marginTop = '0';
  const pre = chips(ctl, {
    label: 'Preset',
    options: [['far', 'Far pair'], ['closer', 'Closer pair'], ['near', 'Near pair: $d_{ij}$ not $\\gg R$']],
    value: st.preset,
    onchange: (k) => { load(k); Rs.set(Math.log10(st.R)); update(); },
  });
  const Rs = slider(ctl, {
    label: 'scale $R$', min: -3, max: -1, step: 0.01, value: Math.log10(st.R),
    fmt: (v) => fmt.g(10 ** v, 2),
    oninput: (v) => { st.R = 10 ** v; st.preset = null; pre.set(null); update(); },
  });
  const legend = el('div', { class: 'hint', style: 'margin-top:.1rem' });
  ctl.append(legend);
  setTex(legend,
    '<span style="color:var(--c-u)">●</span> node $i$: $x_i$, $p_i$, $E_i$; ' +
    '<span style="color:var(--c-w)">●</span> partner $j$: $p_j$, $E_j$, its preimage $h_i^{-1}E_j$, $z_{ij}$; ' +
    '<span style="color:var(--c-mu)">●</span> the charged ball $\\mathcal D_{ij}$ and its image; dashed: the balls of (6.9) and (6.11). ' +
    `Constants: $A_h=${CONST.Ah}$, $C_2=\\tfrac32$, $C_\\mu=${CONST.Cmu}$, $C_3=${CONST.C3}$.`);
  const verdict = el('div', { class: 'hint' });
  left.append(verdict);
  const ro = el('div', { class: 'readout' });
  right.append(ro);

  let roTimer = 0, roLast = 0;
  function scheduleReadout() {
    const wait = 120 - (performance.now() - roLast);
    clearTimeout(roTimer);
    if (wait <= 0) { roLast = performance.now(); readout(); } else roTimer = setTimeout(() => { roLast = performance.now(); readout(); }, wait);
  }
  function update() {
    res = pairCost({ pi: st.pi, pj: st.pj, R: st.R, alpha: st.alpha });
    cvS.redraw(); cvT.redraw(); scheduleReadout();
  }

  // drawing helpers: a chart disk (or the exterior of one) in a view (X, Y, S)
  function region(ctx, V, D, w, h) {
    ctx.beginPath();
    if (D.ext) ctx.rect(-10, -10, w + 20, h + 20);
    ctx.moveTo(V.X(D.m[0]) + D.r * V.S, V.Y(D.m[1]));
    ctx.arc(V.X(D.m[0]), V.Y(D.m[1]), Math.max(0.4, D.r * V.S), 0, 2 * Math.PI);
  }
  function paint(ctx, V, D, w, h, { fill, stroke, lw = 1.6, dash = null }) {
    region(ctx, V, D, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
    if (stroke) {
      ctx.beginPath(); ctx.arc(V.X(D.m[0]), V.Y(D.m[1]), Math.max(0.4, D.r * V.S), 0, 2 * Math.PI);
      ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  const dotAt = (ctx, x, y, color, P, r = 3.6) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = P.surface; ctx.stroke();
  };

  // the source chart is displayed rotated about x_i so that z_ij sits to the right of x_i
  // (a rotation of the sphere about x_i: an isometry, like the rotation of the target chart)
  function drawSource(ctx, w, h) {
    const P = palette();
    if (!res) res = pairCost({ pi: st.pi, pj: st.pj, R: st.R, alpha: st.alpha });
    const z = res.z, L = Math.hypot(z[0], z[1]);
    const rot = [z[0] / L, -z[1] / L]; // multiply by conj(z)/|z|
    const tr = (p) => [rot[0] * p[0] - rot[1] * p[1], rot[0] * p[1] + rot[1] * p[0]];
    const trD = (D) => ({ m: tr(D.m), r: D.r, ext: D.ext });
    const rD = res.DD.ext ? L : res.DD.r;
    const cxw = 0.5 * L, half = Math.max(0.5 * L + Math.min(rD, 0.6 * L) + 0.28 * L, 0.2 * L);
    const S = Math.min(w / (2 * half), h / (2 * half * 0.86));
    const V = { S, X: (x) => w / 2 + (x - cxw) * S, Y: (y) => h / 2 - y * S };
    const lab = [];
    // B̄(x_i, R): the ball that h_i blows up (D_y = R inside it)
    const BxR = ballDisk([0, 0], st.R);
    paint(ctx, V, BxR, w, h, { stroke: rgba(P.u, 0.5), lw: 1, dash: [2, 3] });
    lab.push({ id: 'bx', x: V.X(0), y: V.Y(-BxR.r) + 4, tex: '\\overline B(x_i,R)', anchor: 's', cls: 'small halo' });
    // x_i — z_ij
    ctx.strokeStyle = rgba(P.text, 0.35); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(V.X(0), V.Y(0)); ctx.lineTo(V.X(L), V.Y(0)); ctx.stroke(); ctx.setLineDash([]);
    lab.push({ id: 'dz', x: V.X(0.5 * L), y: V.Y(0) - 4, tex: 'D_{z_{ij}}', anchor: 'n', cls: 'small halo' });
    // the nested sets around z_ij
    const nest = (Vw, labels) => {
      paint(ctx, Vw, trD(res.DD), w, h, { fill: rgba(P.mu, P.dark ? 0.2 : 0.13), stroke: P.mu, lw: 2 });
      paint(ctx, Vw, trD(res.sD), w, h, { stroke: P.text, lw: 1.3, dash: [4, 3] });
      paint(ctx, Vw, trD(res.pre), w, h, { fill: rgba(P.w, P.dark ? 0.55 : 0.45), stroke: P.w, lw: 1.2 });
      const zz = tr(z);
      dotAt(ctx, Vw.X(zz[0]), Vw.Y(zz[1]), P.w, P, 3);
      if (labels) labels(zz);
    };
    const big = !res.DD.ext && res.DD.r * S >= 16;
    nest(V, big ? (zz) => {
      lab.push({ id: 'D', x: V.X(zz[0]), y: V.Y(zz[1] + res.DD.r) - 3, tex: '\\mathcal D_{ij}', anchor: 'n', cls: 'halo', color: P.mu });
      if (res.DD.r * S < 60) lab.push({ id: 'z', x: V.X(zz[0]), y: V.Y(zz[1] - res.DD.r) + 3, tex: 'z_{ij}', anchor: 's', cls: 'halo', color: P.w });
      else lab.push({ id: 'z', x: V.X(zz[0]) + 5, y: V.Y(zz[1]) + 4, tex: 'z_{ij}', anchor: 'se', cls: 'halo', color: P.w });
    } : null);
    if (!big) {
      // magnifier: the neighbourhood of z_ij at the scale R²/d²
      const box = Math.min(w, h) * 0.42, bx = w - box - 8, by = h - box - 8;
      const zz = tr(z), zs = Math.max(res.DD.ext ? L : res.DD.r, 1e-12);
      const S2 = (0.3 * box) / zs;
      const V2 = { S: S2, X: (x) => bx + box / 2 + (x - zz[0]) * S2, Y: (y) => by + box / 2 - (y - zz[1]) * S2 };
      ctx.strokeStyle = rgba(P.text, 0.4); ctx.lineWidth = 1;
      const zr = Math.max(4, (res.DD.ext ? 0 : res.DD.r) * S + 3);
      ctx.beginPath(); ctx.arc(V.X(zz[0]), V.Y(zz[1]), zr, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(V.X(zz[0]), V.Y(zz[1]) + zr); ctx.lineTo(bx + box / 2, by); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.rect(bx, by, box, box);
      ctx.fillStyle = P.surface; ctx.fill(); ctx.strokeStyle = rgba(P.text, 0.4); ctx.stroke(); ctx.clip();
      nest(V2, null);
      ctx.restore();
      lab.push({ id: 'D', x: bx + box / 2, y: by + box / 2 - 0.3 * box - 3, tex: '\\mathcal D_{ij}', anchor: 'n', cls: 'halo', color: P.mu });
      lab.push({ id: 'z', x: bx + box / 2, y: by + box / 2 + 0.3 * box + 3, tex: 'z_{ij}', anchor: 's', cls: 'halo', color: P.w });
      lab.push({ id: 'zoom', x: bx + 4, y: by + 3, html: `×${fmt.g(S2 / S, 2)}`, anchor: 'se', cls: 'small' });
    }
    dotAt(ctx, V.X(0), V.Y(0), P.u, P, 4.5);
    lab.push({ id: 'x', x: V.X(0) - 6, y: V.Y(0) - 5, tex: 'x_i', anchor: 'nw', cls: 'halo', color: P.u });
    labS.set(lab);
  }

  let VT = null;
  function drawTarget(ctx, w, h) {
    const P = palette();
    if (!res) res = pairCost({ pi: st.pi, pj: st.pj, R: st.R, alpha: st.alpha });
    const S = w / (2 * TV.x);
    const V = { S, X: (x) => w / 2 + x * S, Y: (y) => h / 2 - y * S };
    VT = V;
    const lab = [];
    // the dashed ball B̄(p_j, C_3 R) and the image h_i D_ij inside it
    paint(ctx, V, res.img, w, h, { fill: rgba(P.mu, P.dark ? 0.22 : 0.15), stroke: rgba(P.mu, 0.9), lw: 1.4 });
    paint(ctx, V, res.tD, w, h, { stroke: P.mu, lw: 1.6, dash: [5, 4] });
    // E_i, E_j
    paint(ctx, V, res.Ei, w, h, { fill: rgba(P.u, P.dark ? 0.35 : 0.25), stroke: P.u, lw: 1.6 });
    paint(ctx, V, res.Ej, w, h, { fill: rgba(P.w, P.dark ? 0.4 : 0.3), stroke: P.w, lw: 1.6 });
    // d_ij, drawn beside the segment p_i p_j (on the lower side), clear of the balls
    const a = [V.X(st.pi[0]), V.Y(st.pi[1])], b = [V.X(st.pj[0]), V.Y(st.pj[1])];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    if (ny < 0) { nx = -nx; ny = -ny; }
    const Er = res.Ei.ext ? 0 : res.Ei.r * S, off = Math.max(32, Er + 30);
    ctx.strokeStyle = rgba(P.text, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a[0] + nx * off, a[1] + ny * off); ctx.lineTo(b[0] + nx * off, b[1] + ny * off); ctx.stroke();
    for (const [p, sg] of [[a, 1], [b, -1]]) {
      const ux = ((b[0] - a[0]) / len) * sg, uy = ((b[1] - a[1]) / len) * sg, q = [p[0] + nx * off, p[1] + ny * off];
      if (len > 14) { ctx.beginPath(); ctx.moveTo(q[0] + ux * 6 + nx * 3, q[1] + uy * 6 + ny * 3); ctx.lineTo(q[0], q[1]); ctx.lineTo(q[0] + ux * 6 - nx * 3, q[1] + uy * 6 - ny * 3); ctx.stroke(); }
    }
    lab.push({ id: 'd', x: (a[0] + b[0]) / 2 + nx * (off + 3), y: (a[1] + b[1]) / 2 + ny * (off + 3), tex: 'd_{ij}', anchor: 's', cls: 'halo' });
    // handles: the punctures
    for (const [p, color] of [[st.pi, P.u], [st.pj, P.w]]) {
      ctx.beginPath(); ctx.arc(V.X(p[0]), V.Y(p[1]), 6, 0, 2 * Math.PI);
      ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = P.surface; ctx.stroke();
    }
    const gap = Math.max(9, Er + 3);
    lab.push({ id: 'pi', x: a[0], y: a[1] + gap, tex: 'p_i', anchor: 's', cls: 'halo', color: P.u });
    lab.push({ id: 'pj', x: b[0], y: b[1] + gap, tex: 'p_j', anchor: 's', cls: 'halo', color: P.w });
    lab.push({ id: 'Ei', x: a[0], y: a[1] - gap, tex: 'E_i', anchor: 'n', cls: 'halo', color: P.u });
    lab.push({ id: 'Ej', x: b[0], y: b[1] - gap, tex: 'E_j', anchor: 'n', cls: 'halo', color: P.w });
    if (!res.tD.ext && res.tD.r * S < 0.9 * w) {
      const r3 = res.tD.r * S, top = V.Y(res.tD.m[1]) - r3 - 3, cx3 = Math.min(w - 70, Math.max(70, V.X(res.tD.m[0])));
      lab.push({ id: 'B3', x: cx3, y: top, tex: '\\overline B(p_j,C_3R)', anchor: 'n', cls: 'halo small', color: P.mu });
      if (!res.img.ext) {
        const ri = res.img.r * S, rm = (ri + r3) / 2, c = 0.7071;
        if (r3 - ri > 44) lab.push({ id: 'hD', x: V.X(res.img.m[0]) + rm * c, y: V.Y(res.img.m[1]) + rm * c, tex: 'h_i\\mathcal D_{ij}', anchor: 'c', cls: 'halo small', color: P.mu });
      }
    }
    labT.set(lab);
  }

  function readout() {
    const r = res, ok = (b) => (b ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    const g = (v) => (Number.isFinite(v) ? fmt.tex(v, 3) : '\\infty');
    setTex(ro, `<table>
      <tr><td>$R$, $d_{ij}$</td><td class="num">$${g(st.R)}$, $${g(r.d)}$</td></tr>
      <tr><td>$R/d_{ij}$ <span class="dim">(far pairs: $\\to0$)</span></td><td class="num">$${g(r.ratio)}$</td></tr>
      <tr><td colspan="2">$E_i\\cap E_j=\\varnothing$ ${ok(r.disjoint)}</td></tr>
      <tr class="sep"><td>(6.8) $D_{z_{ij}}\\,d_{ij}/R\\in[\\tfrac12,2]$</td><td class="num">$${g(r.q68)}$ ${ok(r.ok68)}</td></tr>
      <tr class="sep"><td>$s_{ij}\\,d_{ij}^2/R^2=C_2$</td><td class="num">$${g(r.c2)}$</td></tr>
      <tr><td>radius of $h_i^{-1}E_j$ about $z_{ij}$, $\\times d_{ij}^2/R^2$</td><td class="num">$${g(r.q69)}$ ${ok(r.ok69band)}</td></tr>
      <tr><td colspan="2">(6.9) $h_i^{-1}E_j\\subseteq\\overline B(z_{ij},s_{ij})$ ${ok(r.ok69)}</td></tr>
      <tr class="sep"><td>$C_\\mu s_{ij}/D_{z_{ij}}\\le\\tfrac12$ <span class="dim">(scale separation)</span></td><td class="num">$${g(r.sep)}$ ${ok(r.okSep)}</td></tr>
      <tr><td>$D_y/D_{z_{ij}}$ on $\\mathcal D_{ij}$</td><td class="num">$[${g(r.Dy[0])},${g(r.Dy[1])}]$ ${ok(r.okDy)}</td></tr>
      <tr class="sep"><td>radius of $h_i\\mathcal D_{ij}$ about $p_j$, $\\div R$</td><td class="num">$${g(r.q611)}$</td></tr>
      <tr><td colspan="2">(6.11) $h_i\\mathcal D_{ij}\\subseteq\\overline B(p_j,C_3R)$ ${ok(r.ok611)}</td></tr>
    </table>`);
    setTex(verdict, r.allOk
      ? `A far pair: $R/d_{ij}=${g(r.ratio)}$ is small, so the charged ball $\\mathcal D_{ij}$ (radius $\\asymp R^2/d_{ij}^2$) is tiny next to its distance $D_{z_{ij}}\\asymp R/d_{ij}$ from $x_i$, and $h_i$ sends even its enlargement into $\\overline B(p_j,C_3R)$.`
      : `<span class="bad">Not a far pair.</span> $R/d_{ij}=${g(r.ratio)}$ is not small: the radius $C_\\mu s_{ij}$ is no longer small next to $D_{z_{ij}}$, so $h_i$ magnifies $\\mathcal D_{ij}$ unevenly and the checks fail. The far-pair hypothesis (6.5), $d_{ij}\\gt a^{-l}$ with $R/d_{ij}\\le a^{-(k-l)}\\to0$, is what prevents this.`);
  }

  // dragging p_i, p_j in the target
  let drag = null;
  const toW = (x, y) => [(x - VT.X(0)) / VT.S, -(y - VT.Y(0)) / VT.S];
  pointer(cvT.wrap, {
    down(x, y) {
      if (!VT) return false;
      for (const k of ['pj', 'pi']) if (Math.hypot(VT.X(st[k][0]) - x, VT.Y(st[k][1]) - y) < 15) { drag = k; return true; }
      return false;
    },
    move(x, y) {
      const p = toW(x, y), hy = (cvT.h / 2 - 8) / VT.S;
      p[0] = Math.max(-TV.x + 0.02, Math.min(TV.x - 0.02, p[0]));
      p[1] = Math.max(-hy, Math.min(hy, p[1]));
      const o = drag === 'pi' ? st.pj : st.pi, dd = Math.hypot(p[0] - o[0], p[1] - o[1]), m = 1.15 * CONST.Ah * st.R;
      if (dd < m) { p[0] = o[0] + ((p[0] - o[0]) * m) / (dd || 1); p[1] = o[1] + ((p[1] - o[1]) * m) / (dd || 1); }
      st[drag] = p;
      if (st.preset) { st.preset = null; pre.set(null); }
      update();
    },
    up() { drag = null; },
  });

  onTheme(() => { cvS.redraw(); cvT.redraw(); });
  update();
}
