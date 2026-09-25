// Track — a ball path sampled uniformly by arc length, with a moving frame
// (tangent T, banked "up" U, side S = T x U) and curvature vector K = dT/ds.
// The stored curve is the path of the BALL CENTRE; rails are placed relative
// to it at render time.

import { G, clamp } from './math.js';
import { BALL, railK } from './constants.js';

let nextTrackId = 1;

export class Track {
  constructor(points, opts = {}) {
    this.id = nextTrackId++;
    this.name = opts.name || `track${this.id}`;
    this.branch = opts.branch || 'common';
    this.kind = opts.kind || 'rail';          // 'rail' | 'trough' | 'tube'
    this.k = opts.k ?? (this.kind === 'trough' ? 1.4 : railK);
    this.d = opts.d ?? (this.kind === 'trough' ? BALL.R : BALL.R * Math.cos(BALL.contactAngle));
    this.mu = opts.mu ?? (this.kind === 'trough' ? 0.018 : 0.011);
    this.caged = !!opts.caged;
    this.surface = opts.surface || (this.kind === 'trough' ? 'wood' : 'rail');
    this.capture = opts.capture || null;      // {s0, s1, lat, e}
    this.next = null; this.prev = null;       // {track, s}
    this.onEnd = null; this.onStart = null;   // (ball, world) => bool handled
    this.endStop = opts.endStop ?? null;      // {e}
    this.startStop = opts.startStop ?? null;
    this.sensors = [];
    this.render = opts.render || {};
    this.supports = opts.supports ?? true;
    this.meta = opts.meta || {};
    this._build(points, opts);
  }

  _build(pts, opts) {
    // cumulative length of the dense polyline
    const m = pts.length;
    const cum = new Float64Array(m);
    for (let i = 1; i < m; i++) {
      const a = pts[i - 1], b = pts[i];
      cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    const L = cum[m - 1];
    const n = Math.max(2, Math.round(L / 0.01) + 1);
    const ds = L / (n - 1);
    this.L = L; this.n = n; this.ds = ds;
    const P = (this.P = new Float64Array(3 * n));
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      while (j < m - 2 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const f = clamp((s - cum[j]) / seg, 0, 1);
      const a = pts[j], b = pts[j + 1];
      P[3 * i] = a.x + (b.x - a.x) * f;
      P[3 * i + 1] = a.y + (b.y - a.y) * f;
      P[3 * i + 2] = a.z + (b.z - a.z) * f;
    }
    // tangents
    const T = (this.T = new Float64Array(3 * n));
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let x = P[3 * i1] - P[3 * i0], y = P[3 * i1 + 1] - P[3 * i0 + 1], z = P[3 * i1 + 2] - P[3 * i0 + 2];
      const l = Math.hypot(x, y, z) || 1;
      T[3 * i] = x / l; T[3 * i + 1] = y / l; T[3 * i + 2] = z / l;
    }
    // curvature vector K = dT/ds, lightly smoothed
    const K = (this.K = new Float64Array(3 * n));
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const h = (i1 - i0) * ds || 1;
      for (let c = 0; c < 3; c++) K[3 * i + c] = (T[3 * i1 + c] - T[3 * i0 + c]) / h;
    }
    smooth3(K, n, 2);
    this.U = new Float64Array(3 * n);
    this.vnom = new Float32Array(n);
    this.tnom = new Float32Array(n);
    this.bankMax = opts.bankMax ?? (this.caged ? Math.PI : 50 * Math.PI / 180);
    this.bank(opts.bank ?? 'auto', opts.v0 ?? 0.4);
  }

  // Nominal speed profile (rolling-only model) and banking of the frame so the
  // rails lean into the apparent gravity at the design speed — what builders of
  // real ball machines do when they bend and twist the rails.
  bank(mode, v0) {
    const { n, ds, T, K } = this;
    const U = this.U;
    let v2 = v0 * v0;
    let t = 0;
    const drag = BALL.drag;
    this.v0 = v0;
    this.stall = -1;
    for (let i = 0; i < n; i++) {
      const tx = T[3 * i], ty = T[3 * i + 1], tz = T[3 * i + 2];
      const gt = -G * ty;
      // f = v^2 K - g_perp (contact force per unit mass)
      const fx = v2 * K[3 * i] - (0 - gt * tx);
      const fy = v2 * K[3 * i + 1] - (-G - gt * ty);
      const fz = v2 * K[3 * i + 2] - (0 - gt * tz);
      const fm = Math.hypot(fx, fy, fz);
      this.vnom[i] = Math.sqrt(v2);
      this.tnom[i] = t;
      if (mode === 'auto' && fm > 1e-6) {
        U[3 * i] = fx / fm; U[3 * i + 1] = fy / fm; U[3 * i + 2] = fz / fm;
      } else {
        U[3 * i] = 0; U[3 * i + 1] = 1; U[3 * i + 2] = 0;
      }
      const a = (gt - this.mu * fm - drag * v2) / this.k;
      const v2n = v2 + 2 * a * ds;
      if (v2n < 0.0025 && this.stall < 0) this.stall = i * ds;
      const vAvg = 0.5 * (Math.sqrt(v2) + Math.sqrt(Math.max(v2n, 0.0025)));
      t += ds / vAvg;
      v2 = Math.max(v2n, 0.0025);
    }
    this.vEnd = Math.sqrt(v2);
    this.tEnd = t;
    // smooth U along s, then make it orthonormal to T
    smooth3(U, n, mode === 'auto' ? 4 : 0);
    for (let i = 0; i < n; i++) {
      const tx = T[3 * i], ty = T[3 * i + 1], tz = T[3 * i + 2];
      let ux = U[3 * i], uy = U[3 * i + 1], uz = U[3 * i + 2];
      const d = ux * tx + uy * ty + uz * tz;
      ux -= d * tx; uy -= d * ty; uz -= d * tz;
      let l = Math.hypot(ux, uy, uz);
      if (l < 1e-4) { // vertical tangent: fall back to any perpendicular
        ux = 1 - tx * tx; uy = -tx * ty; uz = -tx * tz; l = Math.hypot(ux, uy, uz) || 1;
      }
      ux /= l; uy /= l; uz /= l;
      // limit the bank to bankMax away from the natural (gravity) up
      if (this.bankMax < Math.PI) {
        let nx = -ty * tx, ny = 1 - ty * ty, nz = -ty * tz;
        const nl = Math.hypot(nx, ny, nz);
        if (nl > 1e-4) {
          nx /= nl; ny /= nl; nz /= nl;
          const c = ux * nx + uy * ny + uz * nz;
          if (c < Math.cos(this.bankMax)) {
            // rotate from n toward u by bankMax, in the plane normal to T
            let px = ux - c * nx, py = uy - c * ny, pz = uz - c * nz;
            const pl = Math.hypot(px, py, pz) || 1;
            px /= pl; py /= pl; pz /= pl;
            const cb = Math.cos(this.bankMax), sb = Math.sin(this.bankMax);
            ux = nx * cb + px * sb; uy = ny * cb + py * sb; uz = nz * cb + pz * sb;
          }
        }
      }
      U[3 * i] = ux; U[3 * i + 1] = uy; U[3 * i + 2] = uz;
    }
    // design check: would a ball at the nominal speed lift off or derail?
    this.minFn = Infinity; this.minFnS = 0; this.maxLat = 0; this.maxLatS = 0;
    for (let i = 0; i < n; i++) {
      const v2 = this.vnom[i] ** 2;
      const tx = T[3 * i], ty = T[3 * i + 1], tz = T[3 * i + 2];
      const gt = -G * ty;
      const fx = v2 * K[3 * i] + gt * tx, fy = v2 * K[3 * i + 1] + G + gt * ty, fz = v2 * K[3 * i + 2] + gt * tz;
      const fn = fx * U[3 * i] + fy * U[3 * i + 1] + fz * U[3 * i + 2];
      if (fn < this.minFn) { this.minFn = fn; this.minFnS = i * ds; }
      const fm = Math.hypot(fx, fy, fz);
      const lat = Math.sqrt(Math.max(0, fm * fm - fn * fn)) / Math.max(fn, 1e-3);
      if (lat > this.maxLat) { this.maxLat = lat; this.maxLatS = i * ds; }
    }
  }

  // Interpolated frame at arc length s. `o` receives px..kz and sx..sz.
  sample(s, o) {
    const n = this.n;
    let f = s / this.ds;
    if (f < 0) f = 0; else if (f > n - 1) f = n - 1;
    let i = Math.floor(f);
    if (i >= n - 1) i = n - 2;
    const t = f - i;
    const a = 3 * i, b = a + 3;
    const P = this.P, T = this.T, U = this.U, K = this.K;
    o.px = P[a] + (P[b] - P[a]) * t;
    o.py = P[a + 1] + (P[b + 1] - P[a + 1]) * t;
    o.pz = P[a + 2] + (P[b + 2] - P[a + 2]) * t;
    let tx = T[a] + (T[b] - T[a]) * t, ty = T[a + 1] + (T[b + 1] - T[a + 1]) * t, tz = T[a + 2] + (T[b + 2] - T[a + 2]) * t;
    let l = Math.hypot(tx, ty, tz) || 1;
    o.tx = tx / l; o.ty = ty / l; o.tz = tz / l;
    let ux = U[a] + (U[b] - U[a]) * t, uy = U[a + 1] + (U[b + 1] - U[a + 1]) * t, uz = U[a + 2] + (U[b + 2] - U[a + 2]) * t;
    l = Math.hypot(ux, uy, uz) || 1;
    o.ux = ux / l; o.uy = uy / l; o.uz = uz / l;
    o.kx = K[a] + (K[b] - K[a]) * t;
    o.ky = K[a + 1] + (K[b + 1] - K[a + 1]) * t;
    o.kz = K[a + 2] + (K[b + 2] - K[a + 2]) * t;
    // side = T x U
    o.sx = o.ty * o.uz - o.tz * o.uy;
    o.sy = o.tz * o.ux - o.tx * o.uz;
    o.sz = o.tx * o.uy - o.ty * o.ux;
    return o;
  }

  pointAt(s) {
    const o = this.sample(s, {});
    return { x: o.px, y: o.py, z: o.pz };
  }
  get start() { return { x: this.P[0], y: this.P[1], z: this.P[2] }; }
  get end() { const i = 3 * (this.n - 1); return { x: this.P[i], y: this.P[i + 1], z: this.P[i + 2] }; }
  endTangent() { const i = 3 * (this.n - 1); return { x: this.T[i], y: this.T[i + 1], z: this.T[i + 2] }; }

  // Nominal time (s) to reach arc length s from the start (rolling-only model).
  timeAt(s) {
    const f = clamp(s / this.ds, 0, this.n - 1);
    const i = Math.min(Math.floor(f), this.n - 2);
    return this.tnom[i] + (this.tnom[i + 1] - this.tnom[i]) * (f - i);
  }

  // Nearest sample index to a point (brute force; used at build time only).
  nearestS(p, s0 = 0, s1 = this.L) {
    const i0 = Math.max(0, Math.floor(s0 / this.ds)), i1 = Math.min(this.n - 1, Math.ceil(s1 / this.ds));
    let best = Infinity, bi = i0;
    for (let i = i0; i <= i1; i++) {
      const d = (this.P[3 * i] - p.x) ** 2 + (this.P[3 * i + 1] - p.y) ** 2 + (this.P[3 * i + 2] - p.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return { s: bi * this.ds, d: Math.sqrt(best) };
  }

  addSensor(s, fn, meta = {}) {
    this.sensors.push({ s, fn, ...meta });
    this.sensors.sort((a, b) => a.s - b.s);
    return this;
  }

  connect(next, s = 0) { this.next = { track: next, s }; if (!next.prev) next.prev = { track: this, s: this.L }; return this; }
}

function smooth3(A, n, w) {
  if (w <= 0) return;
  const tmp = new Float64Array(A.length);
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0, c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) {
      x += A[3 * j]; y += A[3 * j + 1]; z += A[3 * j + 2]; c++;
    }
    tmp[3 * i] = x / c; tmp[3 * i + 1] = y / c; tmp[3 * i + 2] = z / c;
  }
  A.set(tmp);
}
