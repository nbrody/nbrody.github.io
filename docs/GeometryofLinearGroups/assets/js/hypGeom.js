/**
 * Hyperbolic geometry helpers for the upper half-space model H^3.
 * Points are p = {x, y, t} with t > 0.
 *
 * Exports:
 *  - bisector(p, q?) -> { type: 'hemisphere', center:{x,y,t:0}, radius } | { type: 'halfplane', normal:{x,y}, offset }
 *  - geodesic(p, q)  -> { type: 'vertical', base:{x,y}, t0, t1 } | { type: 'circle', center:{x,y,t:0}, radius }
 *
 * Mathematical facts used:
 *  (1) Hyperbolic distance in H^3:
 *      cosh d((u1,t1),(u2,t2)) = 1 + (|u1-u2|^2 + (t1 - t2)^2) / (2 t1 t2)
 *  (2) Locus of points equidistant to p and q is a Euclidean sphere or plane
 *      perpendicular to {t=0}. If t_p ≠ t_q, it is a hemisphere with center on {t=0};
 *      if t_p = t_q, it is a vertical plane.
 *  (3) Geodesics are either vertical lines (same horizontal projection) or
 *      Euclidean semicircles orthogonal to {t=0}; the unique circle through p and q
 *      has center along the line through their horizontal projections.
 */

// ---------- Vector helpers (R^2) ----------
function dot2(a, b) { return a.x * b.x + a.y * b.y; }
function sub2(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function add2(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function mul2(a, s) { return { x: a.x * s, y: a.y * s }; }
function norm2(a) { return Math.hypot(a.x, a.y); }

function horiz(p) { return { x: p.x, y: p.y }; }
function assertPoint(p, name) {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.t !== 'number') {
    throw new Error(`${name} must be an object {x, y, t}`);
  }
  if (!(p.t > 0)) throw new Error(`${name}.t must be > 0`);
}

// Small tolerance for numerical comparisons
const EPS = 1e-12;

/**
 * bisector(p, q?)
 * Returns the equidistant locus between p and q in H^3.
 * If q is omitted, uses q = (0,0,1).
 *
 * Result formats:
 *  - Hemisphere: { type: 'hemisphere', center:{x,y,t:0}, radius }
 *      center = ((t_q * u_p - t_p * u_q) / (t_q - t_p), 0)
 *      radius^2 = (t_p t_q * |p - q|^2) / (t_p - t_q)^2
 *  - Half-plane (vertical): { type: 'halfplane', normal:{x,y}, offset }
 *      when t_p = t_q = t, plane: (u_p - u_q) · u = (|u_p|^2 - |u_q|^2)/2
 */
export function bisector(p, q = { x: 0, y: 0, t: 1 }) {
  assertPoint(p, 'p');
  assertPoint(q, 'q');
  const up = horiz(p);
  const uq = horiz(q);
  const tp = p.t, tq = q.t;

  // If heights are (numerically) equal -> vertical half-plane
  if (Math.abs(tp - tq) < EPS) {
    const normal = sub2(up, uq); // n = u_p - u_q
    const nlen = norm2(normal);
    if (nlen < EPS) {
      // Same horizontal point and same height: p == q (invalid for a bisector)
      throw new Error('bisector: p and q must be distinct.');
    }
    const offset = (dot2(up, up) - dot2(uq, uq)) / 2;
    return { type: 'halfplane', normal, offset };
  }

  // Hemisphere case
  // Center on boundary: c = (t_q * u_p - t_p * u_q) / (t_q - t_p)
  const denom = (tq - tp);
  const center = mul2(add2(mul2(up, tq), mul2(uq, -tp)), 1 / denom);

  // Radius: r^2 = t_p t_q * |p - q|^2 / (t_p - t_q)^2
  const dx = p.x - q.x, dy = p.y - q.y, dt = tp - tq;
  const euclidDist2 = dx * dx + dy * dy + dt * dt;
  const radius = Math.sqrt((tp * tq * euclidDist2) / (dt * dt));

  return { type: 'hemisphere', center: { x: center.x, y: center.y, t: 0 }, radius };
}

/**
 * geodesic(p, q)
 * Returns the hyperbolic geodesic segment between p and q.
 *
 * Result formats:
 *  - Vertical segment when u_p == u_q:
 *      { type: 'vertical', base:{x,y}, t0, t1 }
 *  - Semicircle orthogonal to {t=0} through p and q:
 *      { type: 'circle', center:{x,y,t:0}, radius }
 *      Construction in the vertical 2-plane spanned by (u2-u1) and t:
 *        Let L = |u2 - u1|, e1 = (u2 - u1)/L, write u_c = u1 + s_c e1 with
 *        s_c = (L^2 + t2^2 - t1^2) / (2L),  r^2 = s_c^2 + t1^2.
 */
export function geodesic(p, q) {
  assertPoint(p, 'p');
  assertPoint(q, 'q');
  const up = horiz(p);
  const uq = horiz(q);

  // If same point
  if (Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS && Math.abs(p.t - q.t) < EPS) {
    throw new Error('geodesic: p and q must be distinct.');
  }

  const v = sub2(uq, up);
  const L = norm2(v);

  // Vertical geodesic (same horizontal projection)
  if (L < EPS) {
    const t0 = Math.min(p.t, q.t);
    const t1 = Math.max(p.t, q.t);
    return { type: 'vertical', base: { x: p.x, y: p.y }, t0, t1 };
  }

  // Unit direction along the chord
  const e1 = mul2(v, 1 / L);
  // s_c = (L^2 + t2^2 - t1^2) / (2 L)
  const s_c = (L * L + q.t * q.t - p.t * p.t) / (2 * L);
  const uc = add2(up, mul2(e1, s_c));
  const radius = Math.hypot(s_c, p.t);

  return { type: 'circle', center: { x: uc.x, y: uc.y, t: 0 }, radius };
}

/**
 * halfSpace(p, q?)
 * Returns the half-space bounded by the bisector(p,q) that contains p.
 *
 * For hemispheres: inequality is sense * (|u - c|^2 + t^2 - r^2) <= 0
 * For half-planes: inequality is sense * ((n·u) - offset) >= 0
 *
 * The returned object includes a `contains(r)` predicate for convenience.
 */
export function halfSpace(p, q = { x: 0, y: 0, t: 1 }) {
  assertPoint(p, 'p');
  assertPoint(q, 'q');
  const b = bisector(p, q);

  if (b.type === 'hemisphere') {
    const f = (r) => {
      const ux = r.x - b.center.x;
      const uy = r.y - b.center.y;
      return ux * ux + uy * uy + r.t * r.t - b.radius * b.radius;
    };
    const fp = f(p);
    const sense = fp < 0 ? -1 : +1; // pick inequality that makes p satisfy it
    return {
      type: 'hemisphere',
      center: b.center,
      radius: b.radius,
      sense,
      contains: (r) => sense * f(r) <= EPS
    };
  } else if (b.type === 'halfplane') {
    const n = b.normal, offset = b.offset;
    const g = (u) => n.x * u.x + n.y * u.y - offset;
    const sp = g({ x: p.x, y: p.y });
    const sense = sp >= 0 ? +1 : -1;
    return {
      type: 'halfplane',
      normal: n,
      offset,
      sense,
      contains: (r) => sense * (n.x * r.x + n.y * r.y - offset) >= -EPS
    };
  }
  throw new Error('halfSpace: unknown bisector type');
}

/**
 * hypDist(p, q)
 * Hyperbolic distance in upper half-space H^3.
 * cosh d = 1 + (|u1-u2|^2 + (t1 - t2)^2) / (2 t1 t2)
 */
export function hypDist(p, q) {
  assertPoint(p, 'p');
  assertPoint(q, 'q');
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const dt = p.t - q.t;
  const num = dx * dx + dy * dy + dt * dt;
  const val = 1 + num / (2 * p.t * q.t);
  const safe = Math.max(1, val); // numeric guard
  return Math.acosh(safe);
}

export function axis(g) {
   //  This returns the axis of a hyperbolic isometry g in H^3.
}

// UMD-style exposure for browser usage without modules
if (typeof window !== 'undefined') {
  window.hypGeom = { bisector, geodesic, halfSpace, hypDist };
}