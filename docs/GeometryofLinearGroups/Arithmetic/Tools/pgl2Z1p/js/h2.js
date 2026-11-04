// Upper half-plane renderer (canvas). The real axis sits on the bottom edge; the camera is
// (cx, k): world x = cx at the horizontal centre, k pixels per unit. Zooming keeps y = 0 fixed.
//
// Farey tessellation 𝔉 = PGL₂(ℤ)-orbit of the geodesic (0, ∞). Every tree vertex ⌊q⌋_n carries
// the tessellation pⁿ𝔉 + q, so we only ever draw affine images α𝔉 + β.

import { TexLayer } from "./tex.js";

export const RHO = { x: 0.5, y: Math.sqrt(3) / 2 };
export const I = { x: 0, y: 1 };
export const INF = { x: 0, y: Infinity };
// the base tile P: the (2,3,∞) triangle with vertices ∞, i, ρ = e^{iπ/3}
export const BASE_TILE = [INF, I, RHO];

// apply a real 2×2 matrix (numbers) to a point of H² ∪ ∂H²; det < 0 acts by z ↦ (a z̄ + b)/(c z̄ + d)
export function mobius(m, z) {
  const { a, b, c, d } = m;
  if (z.y === Infinity) return c === 0 ? INF : { x: a / c, y: 0 };
  const det = a * d - b * c;
  const x = z.x, y = det < 0 ? -z.y : z.y;
  // (a z + b)/(c z + d) with z = x + iy
  const nr = a * x + b, ni = a * y, dr = c * x + d, di = c * y;
  const den = dr * dr + di * di;
  if (den === 0) return INF;
  return { x: (nr * dr + ni * di) / den, y: Math.abs((ni * dr - nr * di) / den) };
}
export const toFloat = (m) => ({ a: Number(m.a.n ?? m.a) / Number(m.a.d ?? 1n), b: Number(m.b.n ?? m.b) / Number(m.b.d ?? 1n), c: Number(m.c.n ?? m.c) / Number(m.c.d ?? 1n), d: Number(m.d.n ?? m.d) / Number(m.d.d ?? 1n) });

export class H2View {
  constructor(canvas, { interactive = true, onHover = null, onViewChange = null, margin = 20 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.margin = margin;
    this.cx = 0.5; this.k = 200;
    this.onHover = onHover;
    this.onViewChange = onViewChange;
    this.ticks = new TexLayer(canvas.parentNode, "h2-ticks");
    this.resize();
    if (interactive) this.#bindInteraction();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.W = Math.max(50, r.width); this.H = Math.max(50, r.height);
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // world ↔ screen
  sx(x) { return (x - this.cx) * this.k + this.W / 2; }
  sy(y) { return this.H - this.margin - y * this.k; }
  wx(px) { return (px - this.W / 2) / this.k + this.cx; }
  wy(py) { return (this.H - this.margin - py) / this.k; }
  get X0() { return this.wx(0); }
  get X1() { return this.wx(this.W); }
  get Ytop() { return this.wy(0); }

  view() { return { cx: this.cx, k: this.k }; }
  setView(v) { this.cx = v.cx; this.k = v.k; }

  // camera that shows [x0, x1] × [0, yTop] with padding
  fitView(x0, x1, yTop, pad = 0.08) {
    const w = (x1 - x0) * (1 + 2 * pad), h = yTop * (1 + pad);
    const k = Math.min(this.W / w, (this.H - this.margin) / h);
    return { cx: (x0 + x1) / 2, k };
  }
  static lerpView(a, b, s) {
    // interpolate the scale logarithmically and the screen-centre linearly in the world
    const k = Math.exp(Math.log(a.k) * (1 - s) + Math.log(b.k) * s);
    return { cx: a.cx * (1 - s) + b.cx * s, k };
  }

  clear(color) {
    const c = this.ctx;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = color; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.restore();
  }

  realAxis(color) {
    const c = this.ctx, y = this.sy(0);
    c.strokeStyle = color; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, y); c.lineTo(this.W, y); c.stroke();
  }

  // tick numbers along the real axis, typeset by KaTeX in the layer over the canvas
  axisTicks() {
    const span = this.X1 - this.X0;
    let step = Math.pow(10, Math.floor(Math.log10(span / 6)));
    if (span / step > 12) step *= 2;
    if (span / step > 12) step *= 2.5;
    this.ticks.clear();
    const y = this.sy(0) + 3;
    for (let x = Math.ceil(this.X0 / step) * step; x <= this.X1; x += step) {
      const lab = Math.abs(x) < step * 1e-6 ? "0" : String(+x.toPrecision(6));
      this.ticks.add(lab, this.sx(x), y, { baseline: "top", cls: "h2-tick" });
    }
  }

  // ---------------------------------------------------------------- Farey tessellation α𝔉 + β

  farey(alpha, beta, { color, width = 1, minPx = 0.9, alphaFade = 1, dash = null, maxArcs = 40000 } = {}) {
    const a = Math.abs(alpha);
    const c = this.ctx;
    const spacing = a * this.k;
    if (spacing < 1.6) {
      // too fine to resolve: a light wash near the axis instead of a moiré
      c.globalAlpha = 0.18 * alphaFade;
      c.fillStyle = color;
      const h = Math.min(this.H, Math.max(2, a * this.k * 0.5));
      c.fillRect(0, this.sy(0) - h, this.W, h);
      c.globalAlpha = 1;
      return 0;
    }
    c.save();
    c.strokeStyle = color; c.lineWidth = width; c.globalAlpha = alphaFade;
    if (dash) c.setLineDash(dash);
    const X0 = this.X0, X1 = this.X1;
    const mLo = Math.floor((X0 - beta) / a) - 1, mHi = Math.ceil((X1 - beta) / a) + 1;
    const yAxis = this.sy(0);
    let count = 0;
    c.beginPath();
    for (let m = mLo; m <= mHi; m++) {
      const px = this.sx(a * m + beta);
      c.moveTo(px, yAxis); c.lineTo(px, 0);
    }
    c.stroke();
    c.beginPath();
    // Stern–Brocot descent with an explicit stack: near a cusp at high zoom the chain of
    // tangent arcs is thousands deep, too deep for recursion.
    const stack = [];
    for (let m = mHi - 1; m >= mLo; m--) stack.push(m, 1, m + 1, 1);
    while (stack.length && count <= maxArcs) {
      const qr = stack.pop(), pr = stack.pop(), ql = stack.pop(), pl = stack.pop();
      const xl = a * (pl / ql) + beta, xr = a * (pr / qr) + beta;
      const rpx = (xr - xl) / 2 * this.k;
      if (rpx < minPx || xr < X0 || xl > X1) continue;
      const cx = this.sx((xl + xr) / 2);
      c.moveTo(cx + rpx, yAxis);
      c.arc(cx, yAxis, rpx, 0, Math.PI, true);
      count++;
      stack.push(pl + pr, ql + qr, pr, qr, pl, ql, pl + pr, ql + qr);
    }
    c.stroke();
    c.restore();
    return count;
  }

  // The Λ-orbit of i inside α𝔉 + β: one point on every Farey edge.
  // For neighbours b/d < a/c (ad − bc = 1) the point is ((ac + bd) + i)/(c² + d²).
  orbitPoints(alpha, beta, { minPx = 1.4, maxPts = 20000 } = {}) {
    const a = Math.abs(alpha);
    const out = [];
    if (a * this.k < 1.5) return out;
    const X0 = this.X0, X1 = this.X1, Yt = this.Ytop;
    const mLo = Math.floor((X0 - beta) / a) - 1, mHi = Math.ceil((X1 - beta) / a) + 1;
    for (let m = mLo; m <= mHi; m++) {
      const x = a * m + beta, y = a;
      if (y <= Yt * 1.05 && x >= X0 && x <= X1) out.push({ x, y });
    }
    const k = this.k;
    const stack = [];
    for (let m = mHi - 1; m >= mLo; m--) stack.push(m, 1, m + 1, 1);
    while (stack.length && out.length <= maxPts) {
      const qr = stack.pop(), pr = stack.pop(), ql = stack.pop(), pl = stack.pop();
      const den = ql * ql + qr * qr;
      const y = a / den;
      if (y * k < minPx) continue;
      const xl = a * (pl / ql) + beta, xr = a * (pr / qr) + beta;
      if (xr < X0 || xl > X1) continue;
      const x = a * ((pr * qr + pl * ql) / den) + beta;
      if (y <= Yt * 1.05 && x >= X0 && x <= X1) out.push({ x, y });
      stack.push(pl + pr, ql + qr, pr, qr, pl, ql, pl + pr, ql + qr);
    }
    return out;
  }

  // ---------------------------------------------------------------- geodesics & polygons

  // screen-space polyline along the geodesic from z1 to z2 (either may be ideal, y = 0 or ∞)
  geodesicPts(z1, z2) {
    const top = this.Ytop * 1.2 + 1;
    if (z1.y === Infinity && z2.y === Infinity) return [];
    if (z1.y === Infinity) return [[this.sx(z2.x), this.sy(top)], [this.sx(z2.x), this.sy(z2.y)]];
    if (z2.y === Infinity) return [[this.sx(z1.x), this.sy(z1.y)], [this.sx(z1.x), this.sy(top)]];
    const dx = z2.x - z1.x;
    if (Math.abs(dx) * this.k < 0.01) return [[this.sx(z1.x), this.sy(z1.y)], [this.sx(z2.x), this.sy(z2.y)]];
    const c = (z2.x * z2.x + z2.y * z2.y - z1.x * z1.x - z1.y * z1.y) / (2 * dx);
    const r = Math.hypot(z1.x - c, z1.y);
    const t1 = Math.atan2(z1.y, z1.x - c), t2 = Math.atan2(z2.y, z2.x - c);
    const n = Math.max(6, Math.min(240, Math.ceil(Math.abs(t2 - t1) * r * this.k / 3)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = t1 + (t2 - t1) * (i / n);
      pts.push([this.sx(c + r * Math.cos(t)), this.sy(r * Math.sin(t))]);
    }
    return pts;
  }

  polygonPath(verts) {
    const c = this.ctx;
    c.beginPath();
    let first = true;
    for (let i = 0; i < verts.length; i++) {
      const pts = this.geodesicPts(verts[i], verts[(i + 1) % verts.length]);
      for (const [x, y] of pts) {
        if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
      }
    }
    c.closePath();
  }

  polygon(verts, { fill = null, stroke = null, width = 1.5, dash = null, alpha = 1 } = {}) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    this.polygonPath(verts);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; if (dash) c.setLineDash(dash); c.lineJoin = "round"; c.stroke(); }
    c.restore();
  }

  geodesic(z1, z2, { color, width = 1.5, dash = null, alpha = 1 } = {}) {
    const c = this.ctx;
    const pts = this.geodesicPts(z1, z2);
    if (!pts.length) return;
    c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) c.lineTo(x, y);
    c.stroke(); c.restore();
  }

  tileVerts(m) { return BASE_TILE.map((z) => mobius(m, z)); }

  dot(z, r, fill, ring = null) {
    const c = this.ctx;
    c.beginPath(); c.arc(this.sx(z.x), this.sy(z.y), r, 0, 2 * Math.PI);
    if (ring) { c.lineWidth = 2; c.strokeStyle = ring; c.stroke(); }
    c.fillStyle = fill; c.fill();
  }

  // ---------------------------------------------------------------- interaction

  #bindInteraction() {
    const cv = this.canvas;
    let drag = null;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left;
      const xw = this.wx(px);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.k = Math.min(1e9, Math.max(1e-6, this.k * f));
      this.cx = xw - (px - this.W / 2) / this.k;
      this.userMoved = true;
      this.onViewChange?.();
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, cx: this.cx };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add("is-dragging");
    });
    cv.addEventListener("pointermove", (e) => {
      if (drag) {
        this.cx = drag.cx - (e.clientX - drag.x) / this.k;
        if (Math.abs(e.clientX - drag.x) > 2) this.userMoved = true;
        this.onViewChange?.();
      } else if (this.onHover) {
        const r = cv.getBoundingClientRect();
        this.onHover({ px: e.clientX - r.left, py: e.clientY - r.top, x: this.wx(e.clientX - r.left), y: this.wy(e.clientY - r.top) });
      }
    });
    const end = (e) => { drag = null; cv.classList.remove("is-dragging"); };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { if (!drag) this.onHover?.(null); });
  }
}

// colours from CSS custom properties (re-read on theme change)
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
