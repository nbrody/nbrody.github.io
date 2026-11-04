// Planar polyline geometry.  Points are [x, y] arrays; webs live in the unit disk.
import { SP } from './config.js';

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = a => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const unit = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const perp = a => [-a[1], a[0]];                 // left normal
export const copyPts = p => p.map(q => [q[0], q[1]]);
export const rev = p => p.slice().reverse();
export const same = (a, b, eps = 1e-9) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

export function cumLen(p) {
  const c = [0];
  for (let i = 1; i < p.length; i++) c.push(c[i - 1] + dist(p[i - 1], p[i]));
  return c;
}
export const polyLen = p => cumLen(p)[p.length - 1];

export function pointAtLen(p, c, s) {
  const L = c[c.length - 1];
  if (s <= 0) return [p[0][0], p[0][1]];
  if (s >= L) return [p[p.length - 1][0], p[p.length - 1][1]];
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const t = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
  return lerp(p[lo], p[hi], t);
}

// Uniform-arclength resampling with `n` segments; endpoints are kept exactly.
export function resampleN(p, n) {
  const c = cumLen(p), L = c[c.length - 1];
  const out = [[p[0][0], p[0][1]]];
  for (let i = 1; i < n; i++) out.push(pointAtLen(p, c, L * i / n));
  out.push([p[p.length - 1][0], p[p.length - 1][1]]);
  return out;
}
export function resample(p, sp = SP, minSeg = 10) {
  return resampleN(p, Math.max(minSeg, Math.round(polyLen(p) / sp)));
}

export function fracs(p) {
  const c = cumLen(p), L = c[c.length - 1] || 1;
  return c.map(x => x / L);
}

export function tangentAt(p, i) {
  const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
  return unit(sub(b, a));
}

// index of the polyline vertex nearest to arclength fraction s
export function indexAtFrac(p, s) {
  const f = fracs(p);
  let best = 0, bd = Infinity;
  for (let i = 0; i < f.length; i++) { const d = Math.abs(f[i] - s); if (d < bd) { bd = d; best = i; } }
  return best;
}

export function closestOnPoly(p, q) {
  const c = cumLen(p), L = c[c.length - 1] || 1;
  let best = { d: Infinity };
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], ab = sub(b, a), L2 = dot(ab, ab) || 1e-18;
    let t = dot(sub(q, a), ab) / L2; t = Math.max(0, Math.min(1, t));
    const pt = lerp(a, b, t), d = dist(pt, q);
    if (d < best.d) best = { d, i, t, pt, s: (c[i] + t * (c[i + 1] - c[i])) / L };
  }
  return best;
}

// proper crossing of two segments; touching (within rounding) does not count
export function segsCross(a, b, c, d) {
  const e = 1e-12;
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}

export function bbox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  return [x0, y0, x1, y1];
}
const boxesMeet = (A, B, m = 0) => A[0] <= B[2] + m && B[0] <= A[2] + m && A[1] <= B[3] + m && B[1] <= A[3] + m;

// Does polyline p cross polyline q?  Segments of p with index in skipP (a Set)
// and of q in skipQ are ignored.
export function polysCross(p, q, skipP = null, skipQ = null) {
  if (!boxesMeet(bbox(p), bbox(q))) return false;
  for (let i = 0; i < p.length - 1; i++) {
    if (skipP && skipP.has(i)) continue;
    const a = p[i], b = p[i + 1];
    const bx0 = Math.min(a[0], b[0]), bx1 = Math.max(a[0], b[0]), by0 = Math.min(a[1], b[1]), by1 = Math.max(a[1], b[1]);
    for (let j = 0; j < q.length - 1; j++) {
      if (skipQ && skipQ.has(j)) continue;
      const c = q[j], d = q[j + 1];
      if (Math.max(c[0], d[0]) < bx0 || Math.min(c[0], d[0]) > bx1 || Math.max(c[1], d[1]) < by0 || Math.min(c[1], d[1]) > by1) continue;
      if (segsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

export function selfCrosses(p) {
  for (let i = 0; i < p.length - 1; i++)
    for (let j = i + 2; j < p.length - 1; j++) {
      if (i === 0 && j === p.length - 2 && same(p[0], p[p.length - 1])) continue;
      if (segsCross(p[i], p[i + 1], p[j], p[j + 1])) return true;
    }
  return false;
}

export function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
  return a / 2;
}

export function pointInPoly(pt, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function cubic(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  out[0] = [p0[0], p0[1]]; out[n] = [p3[0], p3[1]];
  return out;
}

// A connector curve from a (leaving in direction ta) to b (arriving in direction tb).
export function connector(a, ta, b, tb, k = 0.38) {
  const d = dist(a, b), n = Math.max(3, Math.round(d / SP));
  return cubic(a, add(a, mul(ta, k * d)), sub(b, mul(tb, k * d)), b, n);
}

export function line(a, b, minSeg = 4) {
  const n = Math.max(minSeg, Math.round(dist(a, b) / SP));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(lerp(a, b, i / n));
  out[0] = [a[0], a[1]]; out[n] = [b[0], b[1]];
  return out;
}

// per-vertex left normals of a polyline
export function normals(p) {
  return p.map((_, i) => perp(tangentAt(p, i)));
}
export function offsetPts(p, d) {
  const N = normals(p);
  return p.map((q, i) => [q[0] + N[i][0] * d, q[1] + N[i][1] * d]);
}
// push the interior of p sideways by h*sin(pi*f) (endpoints stay put)
export function bulge(p, h) {
  const N = normals(p), f = fracs(p), n = p.length;
  return p.map((q, i) => {
    if (i === 0 || i === n - 1) return [q[0], q[1]];
    const w = h * Math.sin(Math.PI * f[i]);
    return [q[0] + N[i][0] * w, q[1] + N[i][1] * w];
  });
}

const smoothstep = t => t * t * (3 - 2 * t);

// Move one endpoint of p to `target`, dragging the rest along with a falloff.
export function deformEnd(p, atStart, target) {
  const f = fracs(p), n = p.length;
  const end = atStart ? p[0] : p[n - 1], d = sub(target, end);
  return p.map((q, i) => {
    const w = 1 - smoothstep(atStart ? f[i] : 1 - f[i]);
    return [q[0] + d[0] * w, q[1] + d[1] * w];
  });
}

// Push the polyline near arclength fraction s0 by delta (endpoints fixed).
export function bump(p, s0, delta, sigma = 0.22) {
  const f = fracs(p);
  return p.map((q, i) => {
    const w = Math.exp(-(((f[i] - s0) / sigma) ** 2)) * Math.min(1, f[i] / 0.08, (1 - f[i]) / 0.08);
    return [q[0] + delta[0] * w, q[1] + delta[1] * w];
  });
}

export function smooth(p, iters = 2, keepEnds = true) {
  let q = copyPts(p);
  for (let it = 0; it < iters; it++) {
    const r = copyPts(q);
    for (let i = 1; i < q.length - 1; i++) r[i] = [(q[i - 1][0] + 2 * q[i][0] + q[i + 1][0]) / 4, (q[i - 1][1] + 2 * q[i][1] + q[i + 1][1]) / 4];
    if (!keepEnds) { r[0] = q[0]; r[q.length - 1] = q[q.length - 1]; }
    q = r;
  }
  return q;
}

// hyperbolic geodesic between two points of the open unit disk
export function geodesic(p, q) {
  const n = Math.max(6, Math.round(dist(p, q) / SP));
  const c = cross(p, q);
  if (Math.abs(c) < 1e-6) return line(p, q, 6);
  // circle through p, q orthogonal to the unit circle: |x - z|^2 = |z|^2 - 1
  const A = [[2 * p[0], 2 * p[1]], [2 * q[0], 2 * q[1]]];
  const b = [dot(p, p) + 1, dot(q, q) + 1];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const z = [(b[0] * A[1][1] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - b[0] * A[1][0]) / det];
  const r = dist(z, p);
  let a0 = Math.atan2(p[1] - z[1], p[0] - z[0]), a1 = Math.atan2(q[1] - z[1], q[0] - z[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + da * i / n; out.push([z[0] + r * Math.cos(a), z[1] + r * Math.sin(a)]); }
  out[0] = [p[0], p[1]]; out[n] = [q[0], q[1]];
  return out;
}

export function circlePts(c, r, ccw = true, a0 = 0) {
  const n = Math.max(16, Math.round(2 * Math.PI * r / SP));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (ccw ? 1 : -1) * 2 * Math.PI * i / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  out[n] = [out[0][0], out[0][1]];
  return out;
}

// transverse intersections of polylines P and Q: P's segment i at parameter t,
// Q's segment j at parameter u, and the point
export function intersections(P, Q, sameCurve = false) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const bx0 = Math.min(a[0], b[0]), bx1 = Math.max(a[0], b[0]), by0 = Math.min(a[1], b[1]), by1 = Math.max(a[1], b[1]);
    for (let j = sameCurve ? i + 2 : 0; j < Q.length - 1; j++) {
      const c = Q[j], d = Q[j + 1];
      if (Math.max(c[0], d[0]) < bx0 || Math.min(c[0], d[0]) > bx1 || Math.max(c[1], d[1]) < by0 || Math.min(c[1], d[1]) > by1) continue;
      if (!segsCross(a, b, c, d)) continue;
      const r = sub(b, a), s = sub(d, c), den = cross(r, s);
      const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
      out.push({ i, t, j, u, pt: lerp(a, b, t) });
    }
  }
  return out;
}

// polyline p with the point pt inserted on segment i (returns the index of pt)
export function insertOnSegment(p, i, pt) {
  const q = p.slice(0, i + 1).map(x => [x[0], x[1]]);
  q.push([pt[0], pt[1]]);
  for (let k = i + 1; k < p.length; k++) q.push([p[k][0], p[k][1]]);
  return { pts: q, k: i + 1 };
}

// centripetal Catmull-Rom curve through the points (with phantom end points
// p0 / pn shaping the end tangents); `step` is the target spacing
export function spline(pts, p0 = null, pn = null, step = SP / 2) {
  const P = [p0 || sub(mul(pts[0], 2), pts[1]), ...pts, pn || sub(mul(pts[pts.length - 1], 2), pts[pts.length - 2])];
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < P.length - 2; i++) {
    const [a, b, c, d] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t0 = 0, t1 = t0 + Math.sqrt(dist(a, b)) || 1e-6, t2 = t1 + Math.sqrt(dist(b, c)) || 1e-6, t3 = t2 + Math.sqrt(dist(c, d)) || 1e-6;
    const n = Math.max(2, Math.round(dist(b, c) / step));
    for (let k = 1; k <= n; k++) {
      const t = t1 + (t2 - t1) * k / n;
      const L = (p, q, ta, tb) => lerp(p, q, (t - ta) / ((tb - ta) || 1e-9));
      const A1 = L(a, b, t0, t1), A2 = L(b, c, t1, t2), A3 = L(c, d, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
    out[out.length - 1] = [c[0], c[1]];
  }
  return out;
}
