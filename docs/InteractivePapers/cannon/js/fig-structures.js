// Figure 3 — Sullivan–Tukia: circumcenter of a bounded orbit of conformal structures; triples -> points.

import { el, controls, slider, button, makeCanvas, palette, onTheme, pointer, fmt, rgba } from './common.js';

// ---- 2x2 helpers (row-major [a,b,c,d] = [[a,b],[c,d]]) ----
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const T = (A) => [A[0], A[2], A[1], A[3]];
const det = (A) => A[0] * A[3] - A[1] * A[2];
const inv = (A) => { const d = det(A); return [A[3] / d, -A[1] / d, -A[2] / d, A[0] / d]; };
const rot = (t) => [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)];
const refl = (t) => [Math.cos(2 * t), Math.sin(2 * t), Math.sin(2 * t), -Math.cos(2 * t)]; // reflection in line at angle t

// Symmetric positive definite power via eigen-decomposition. S = [[a,b],[b,c]].
function spdPow(S, p) {
  const a = S[0], b = S[1], c = S[3];
  const tr = a + c, dt = a * c - b * b, disc = Math.sqrt(Math.max(0, tr * tr / 4 - dt));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  let v1;
  if (Math.abs(b) > 1e-12) v1 = [l1 - c, b]; else v1 = a >= c ? [1, 0] : [0, 1];
  const n = Math.hypot(v1[0], v1[1]); v1 = [v1[0] / n, v1[1] / n];
  const v2 = [-v1[1], v1[0]];
  const m1 = Math.pow(l1, p), m2 = Math.pow(Math.max(l2, 1e-300), p);
  return [m1 * v1[0] * v1[0] + m2 * v2[0] * v2[0], m1 * v1[0] * v1[1] + m2 * v2[0] * v2[1],
    m1 * v1[0] * v1[1] + m2 * v2[0] * v2[1], m1 * v1[1] * v1[1] + m2 * v2[1] * v2[1]];
}
const normForm = (q) => { const d = Math.sqrt(det(q)); return q.map((x) => x / d); };
const pullback = (F, q) => normForm(mul(T(F), mul(q, F)));

// forms <-> upper half-plane <-> disk.  q = (1/y)[[1, x],[x, x^2+y^2]]
const C = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  conj: (a) => [a[0], -a[1]], abs: (a) => Math.hypot(a[0], a[1]), scale: (a, s) => [a[0] * s, a[1] * s],
};
function formToDisk(q) {
  const qn = normForm(q);
  const tau = [qn[1] / qn[0], 1 / qn[0]];
  return C.div(C.sub(tau, [0, 1]), C.add(tau, [0, 1]));
}
function diskToForm(z) {
  const tau = C.mul([0, 1], C.div(C.add([1, 0], z), C.sub([1, 0], z))); // i(1+z)/(1-z)
  const x = tau[0], y = tau[1];
  return [1 / y, x / y, x / y, (x * x + y * y) / y];
}
const mob = (c, z) => C.div(C.sub(z, c), C.sub([1, 0], C.mul(C.conj(c), z)));     // phi_c
const mobInv = (c, w) => C.div(C.add(w, c), C.add([1, 0], C.mul(C.conj(c), w)));
const hdist = (a, b) => 2 * Math.atanh(Math.min(0.999999999, C.abs(mob(a, b))));
function geoStep(c, p, frac) {
  const w = mob(c, p), r = C.abs(w);
  if (r < 1e-15) return c;
  const D = 2 * Math.atanh(Math.min(r, 0.999999999));
  const r2 = Math.tanh(frac * D / 2);
  return mobInv(c, C.scale(w, r2 / r));
}
function circumcenter(pts, iters = 1500) {
  let c = pts[0];
  for (let k = 1; k <= iters; k++) {
    let far = pts[0], fd = -1;
    for (const p of pts) { const d = hdist(c, p); if (d > fd) { fd = d; far = p; } }
    c = geoStep(c, far, 1 / (k + 1));
  }
  let r = 0; for (const p of pts) r = Math.max(r, hdist(c, p));
  return { c, r };
}

// Generic geodesic through two points of the closed disk, as a polyline.
function geodesicPoints(z1, z2, n = 64) {
  const in1 = C.abs(z1) < 0.999, in2 = C.abs(z2) < 0.999;
  // move z1 (if interior) or z2 to the origin, draw the radial segment, map back
  if (in1 || in2) {
    const base = in1 ? z1 : z2, other = in1 ? z2 : z1;
    const w = mob(base, other), out = [];
    for (let k = 0; k <= n; k++) out.push(mobInv(base, C.scale(w, k / n)));
    return out;
  }
  // both ideal: use the midpoint of the arc through the hyperbolic center of the geodesic
  const a1 = Math.atan2(z1[1], z1[0]), a2 = Math.atan2(z2[1], z2[0]);
  let dA = a2 - a1; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
  const mid = a1 + dA / 2, half = Math.abs(dA) / 2;
  const m = (1 - Math.sin(half)) / Math.cos(half) || 0; // closest point to origin
  const mz = [m * Math.cos(mid), m * Math.sin(mid)];
  const p1 = geodesicPoints(mz, z1, n / 2), p2 = geodesicPoints(mz, z2, n / 2);
  return p1.reverse().concat(p2);
}

// Foot of the perpendicular from ideal point c to the geodesic between ideal a, b.
function tripleFoot(a, b, c) {
  const Tz = (z) => C.div(C.sub(z, a), C.sub(z, b));
  const Tinv = (w) => C.div(C.sub(C.mul(b, w), a), C.sub(w, [1, 0]));
  const tc = Tz(c);
  const cand1 = Tinv(C.mul([0, 1], tc)), cand2 = Tinv(C.mul([0, -1], tc));
  return C.abs(cand1) < C.abs(cand2) ? cand1 : cand2;
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const p1 = el('div', { class: 'grow', style: 'flex: 1 1 250px' });
  const p2 = el('div', { class: 'grow', style: 'flex: 1 1 200px' });
  const p3 = el('div', { class: 'grow', style: 'flex: 1 1 220px' });
  row.append(p1, p2, p3);
  root.append(row);

  const st = {
    hidden: [0.38, 0.22], m: 5, reflections: true, straighten: 0,
    tri: [0.3, 2.4, 4.3], // angles of a, b, c
  };

  let orbit = [], cc = null, Phi = null, group = [];
  function recompute() {
    const qs = diskToForm(st.hidden);
    Phi = spdPow(normForm(qs), 0.5);
    const PhiInv = inv(Phi);
    group = [];
    for (let k = 0; k < st.m; k++) {
      group.push({ M: rot(2 * Math.PI * k / st.m), rev: false });
      if (st.reflections) group.push({ M: refl(Math.PI * k / st.m), rev: true });
    }
    orbit = group.map((g) => {
      const f = mul(PhiInv, mul(g.M, Phi));
      const form = pullback(f, [1, 0, 0, 1]);
      return { f, form, z: formToDisk(form), rev: g.rev };
    });
    cc = circumcenter(orbit.map((o) => o.z));
  }

  // ---------- panel 1: the hyperbolic plane of conformal structures ----------
  p1.append(el('div', { class: 'hint', style: 'margin:0 0 .3rem' }, 'Conformal structures 𝒞ₓ ≅ ℍ²'));
  const cv1 = makeCanvas(p1, { aspect: 1, maxHeight: 340, draw: draw1 });
  let D1 = null;
  function ellipseGlyph(ctx, x, y, form, size, color, fill) {
    // unit ellipse of the form: semi-axes 1/sqrt(eigenvalues)
    const a = form[0], b = form[1], c = form[3];
    const tr = a + c, dt = a * c - b * b, disc = Math.sqrt(Math.max(0, tr * tr / 4 - dt));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    const ang = Math.abs(b) > 1e-12 ? Math.atan2(l1 - a, b) : (a >= c ? 0 : Math.PI / 2);
    const r1 = size / Math.sqrt(l1), r2 = size / Math.sqrt(l2);
    ctx.beginPath();
    ctx.ellipse(x, y, r1, r2, -ang, 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color; ctx.stroke();
  }
  function draw1(ctx, w, h) {
    const P = palette();
    const R = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
    D1 = { R, cx, cy };
    const X = (z) => [cx + R * z[0], cy - R * z[1]];
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = P.panel2; ctx.fill();
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.stroke();
    // faint geodesic grid
    ctx.strokeStyle = rgba(P.ink, 0.07);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 6;
      const pts = geodesicPoints([Math.cos(a), Math.sin(a)], [Math.cos(a + Math.PI * 0.62), Math.sin(a + Math.PI * 0.62)]);
      ctx.beginPath(); pts.forEach((z, i) => { const [x, y] = X(z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    // enclosing circle
    ctx.strokeStyle = P.accent3; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const t = 2 * Math.PI * k / 120;
      const z = mobInv(cc.c, [Math.tanh(cc.r / 2) * Math.cos(t), Math.tanh(cc.r / 2) * Math.sin(t)]);
      const [x, y] = X(z); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    // geodesics from the circumcenter to orbit points
    ctx.strokeStyle = rgba(P.accent, 0.25); ctx.lineWidth = 1;
    for (const o of orbit) {
      const pts = geodesicPoints(cc.c, o.z, 24);
      ctx.beginPath(); pts.forEach((z, i) => { const [x, y] = X(z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    // round structure
    const [ox, oy] = X([0, 0]);
    ctx.lineWidth = 1.2;
    ellipseGlyph(ctx, ox, oy, [1, 0, 0, 1], 7, P.muted, null);
    ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted; ctx.fillText('round', ox + 9, oy + 12);
    // orbit points
    for (const o of orbit) {
      const [x, y] = X(o.z);
      ctx.lineWidth = 1.3;
      ellipseGlyph(ctx, x, y, o.form, 8, o.rev ? P.accent4 : P.accent, rgba(o.rev ? P.accent4 : P.accent, 0.15));
    }
    // hidden structure (draggable) and circumcenter
    const [hx, hy] = X(st.hidden);
    ctx.lineWidth = 2; ctx.strokeStyle = P.accent2;
    ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.stroke();
    const [ccx, ccy] = X(cc.c);
    ctx.fillStyle = P.accent3; ctx.beginPath(); ctx.arc(ccx, ccy, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = P.accent2; ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    ctx.fillText('Φᵀ Φ (drag)', hx + 11, hy - 8);
  }
  pointer(cv1.wrap, {
    down(x, y) { if (!D1) return false; const z = [(x - D1.cx) / D1.R, -(y - D1.cy) / D1.R]; if (C.abs(C.sub(z, st.hidden)) * D1.R > 18) return false; return true; },
    move(x, y) {
      let z = [(x - D1.cx) / D1.R, -(y - D1.cy) / D1.R];
      const r = C.abs(z); if (r > 0.86) z = C.scale(z, 0.86 / r);
      st.hidden = z; recompute(); redrawAll();
    },
  });

  // ---------- panel 2: tangent plane ----------
  p2.append(el('div', { class: 'hint', style: 'margin:0 0 .3rem' }, 'Pullbacks f*q_round in TₓS²'));
  const cv2 = makeCanvas(p2, { aspect: 1, maxHeight: 300, draw: draw2 });
  function draw2(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, size = Math.min(w, h) * 0.15;
    ctx.strokeStyle = P.rule; ctx.beginPath(); ctx.moveTo(8, cy); ctx.lineTo(w - 8, cy); ctx.moveTo(cx, 8); ctx.lineTo(cx, h - 8); ctx.stroke();
    const Ft = spdPow(Phi, st.straighten), FtInv = inv(Ft);
    ctx.lineWidth = 1.4;
    for (const o of orbit) {
      const g = mul(Ft, mul(o.f, FtInv));
      const form = pullback(g, [1, 0, 0, 1]);
      ellipseGlyph(ctx, cx, cy, form, size, rgba(o.rev ? P.accent4 : P.accent, 0.75), null);
    }
    // invariant structure q = Phi^T Phi, transported
    const q = pullback(FtInv, normForm(mul(Phi, Phi)));
    ctx.lineWidth = 2.6;
    ellipseGlyph(ctx, cx, cy, q, size, P.accent2, null);
    ctx.font = '10px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted;
    ctx.fillText(st.straighten > 0.99 ? 'after F: all round' : 'orange = invariant q', 8, h - 8);
  }

  // ---------- panel 3: triples -> points ----------
  p3.append(el('div', { class: 'hint', style: 'margin:0 0 .3rem' }, 'Triples → points: T(S¹) → ℍ²'));
  const cv3 = makeCanvas(p3, { aspect: 1, maxHeight: 300, draw: draw3 });
  let D3 = null, foot = [0, 0];
  function draw3(ctx, w, h) {
    const P = palette();
    const R = Math.min(w, h) / 2 - 12, cx = w / 2, cy = h / 2;
    D3 = { R, cx, cy };
    const X = (z) => [cx + R * z[0], cy - R * z[1]];
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = P.panel2; ctx.fill(); ctx.strokeStyle = P.rule; ctx.stroke();
    const pts = st.tri.map((t) => [Math.cos(t), Math.sin(t)]);
    const line = (a, b, color, wdt, dash) => {
      const g = geodesicPoints(a, b, 80);
      ctx.strokeStyle = color; ctx.lineWidth = wdt; ctx.setLineDash(dash || []);
      ctx.beginPath(); g.forEach((z, i) => { const [x, y] = X(z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.setLineDash([]);
    };
    line(pts[1], pts[2], rgba(P.ink, 0.25), 1); line(pts[2], pts[0], rgba(P.ink, 0.25), 1);
    line(pts[0], pts[1], P.accent, 2);
    foot = tripleFoot(pts[0], pts[1], pts[2]);
    line(pts[2], foot, P.accent2, 1.5, [4, 3]);
    const [fx, fy] = X(foot);
    ctx.fillStyle = P.accent2; ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, 7); ctx.fill();
    // compact reference ball
    ctx.strokeStyle = rgba(P.accent3, 0.6); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, R * Math.tanh(1.5 / 2), 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ['a', 'b', 'c'].forEach((nm, i) => {
      const [x, y] = X(pts[i]);
      ctx.fillStyle = i === 2 ? P.accent2 : P.accent;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = P.ink; ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillText(nm, x + (pts[i][0] > 0 ? 8 : -16), y + (pts[i][1] > 0 ? -6 : 14));
    });
  }
  let dragTri = -1;
  pointer(cv3.wrap, {
    down(x, y) {
      if (!D3) return false;
      dragTri = -1;
      st.tri.forEach((t, i) => { const px = D3.cx + D3.R * Math.cos(t), py = D3.cy - D3.R * Math.sin(t); if (Math.hypot(px - x, py - y) < 16) dragTri = i; });
      return dragTri >= 0;
    },
    move(x, y) { st.tri[dragTri] = Math.atan2(-(y - D3.cy), x - D3.cx); cv3.redraw(); updateReadout(); },
  });

  // ---------- controls & readout ----------
  const ctl = controls(root);
  slider(ctl, { label: 'dihedral order m', min: 3, max: 9, step: 1, value: st.m, fmt: (v) => v, oninput: (v) => { st.m = v; recompute(); redrawAll(); } });
  const refBtn = button(ctl, 'Reflections: on', () => { st.reflections = !st.reflections; refBtn.textContent = 'Reflections: ' + (st.reflections ? 'on' : 'off'); recompute(); redrawAll(); });
  const sSl = slider(ctl, { label: 'straighten F', min: 0, max: 1, step: 0.01, value: 0, fmt: (v) => v.toFixed(2), oninput: (v) => { st.straighten = v; cv2.redraw(); } });
  let an = null;
  button(ctl, 'Straighten', () => {
    if (an) cancelAnimationFrame(an);
    const from = st.straighten, to = from > 0.5 ? 0 : 1, t0 = performance.now();
    const step = (now) => { const u = Math.min(1, (now - t0) / 1200); st.straighten = from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * u)); sSl.set(st.straighten); cv2.redraw(); an = u < 1 ? requestAnimationFrame(step) : null; };
    an = requestAnimationFrame(step);
  }, 'primary');
  const ro = el('div', { class: 'readout', style: 'margin-top:.6rem' });
  root.append(ro);

  function updateReadout() {
    const dRound = hdist([0, 0], st.hidden);
    const err = hdist(cc.c, st.hidden);
    const pts = st.tri.map((t) => [Math.cos(t), Math.sin(t)]);
    let minPair = Infinity;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) minPair = Math.min(minPair, C.abs(C.sub(pts[i], pts[j])) / 2);
    const footDist = 2 * Math.atanh(Math.min(0.9999999, C.abs(foot)));
    ro.innerHTML = `<table>
      <tr><td class="k">group</td><td>D<sub>${st.m}</sub>${st.reflections ? ' (with reflections)' : ' rotations only'}, conjugated by Φ</td></tr>
      <tr><td class="k">uniform qc bound K ≤ e<sup>2·d(round, q)</sup></td><td>${fmt.f(Math.exp(2 * dRound), 3)}</td></tr>
      <tr><td class="k">circumradius of the orbit</td><td>${fmt.f(cc.r, 4)}</td></tr>
      <tr><td class="k">d(circumcenter, Φᵀ Φ)</td><td><span class="${err < 1e-2 ? 'ok' : 'bad'}">${fmt.g(err, 2)}</span></td></tr>
      <tr><td class="k">triples: min pairwise distance</td><td>${fmt.f(minPair, 3)}</td></tr>
      <tr><td class="k">hyperbolic distance of image from center</td><td>${fmt.f(footDist, 3)}</td></tr>
    </table>`;
  }
  function redrawAll() { cv1.redraw(); cv2.redraw(); cv3.redraw(); updateReadout(); }

  recompute();
  onTheme(redrawAll);
  requestAnimationFrame(updateReadout);
}
