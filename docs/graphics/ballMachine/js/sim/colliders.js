// Static collision shapes for balls in free flight. Each test(p, ct) fills the
// contact normal (pointing toward the ball centre) and penetration depth.

import { BALL } from './constants.js';

const R = BALL.R;
let nextId = 1;

class Collider {
  constructor(o) {
    this.id = nextId++;
    this.e = o.e ?? 0.5;             // restitution
    this.mu = o.mu ?? 0.3;           // friction
    this.instrument = o.instrument ?? null;
    this.midi = o.midi ?? null;
    this.gain = o.gain ?? 1;
    this.vref = o.vref ?? 2;
    this.onHit = o.onHit ?? null;
    this.tag = o.tag ?? '';
    this.render = o.render ?? null;  // hints for the renderer (null = invisible helper)
  }
}

export class BoxCollider extends Collider {
  // center {x,y,z}; axes [u,v,w] unit vectors; half [a,b,c]
  constructor(o) {
    super(o);
    this.c = o.center; this.u = o.axes[0]; this.v = o.axes[1]; this.w = o.axes[2]; this.h = o.half;
    const ex = Math.abs(this.u.x) * this.h[0] + Math.abs(this.v.x) * this.h[1] + Math.abs(this.w.x) * this.h[2];
    const ey = Math.abs(this.u.y) * this.h[0] + Math.abs(this.v.y) * this.h[1] + Math.abs(this.w.y) * this.h[2];
    const ez = Math.abs(this.u.z) * this.h[0] + Math.abs(this.v.z) * this.h[1] + Math.abs(this.w.z) * this.h[2];
    this.aabb = [this.c.x - ex, this.c.y - ey, this.c.z - ez, this.c.x + ex, this.c.y + ey, this.c.z + ez];
  }
  test(p, ct) {
    const dx = p.x - this.c.x, dy = p.y - this.c.y, dz = p.z - this.c.z;
    const u = this.u, v = this.v, w = this.w, h = this.h;
    const lu = dx * u.x + dy * u.y + dz * u.z;
    const lv = dx * v.x + dy * v.y + dz * v.z;
    const lw = dx * w.x + dy * w.y + dz * w.z;
    if (lu > h[0] + R || lu < -h[0] - R || lv > h[1] + R || lv < -h[1] - R || lw > h[2] + R || lw < -h[2] - R) return false;
    const qu = Math.max(-h[0], Math.min(h[0], lu));
    const qv = Math.max(-h[1], Math.min(h[1], lv));
    const qw = Math.max(-h[2], Math.min(h[2], lw));
    const eu = lu - qu, ev = lv - qv, ew = lw - qw;
    const d2 = eu * eu + ev * ev + ew * ew;
    ct.vx = ct.vy = ct.vz = 0;
    if (d2 > 1e-14) {
      if (d2 >= R * R) return false;
      const d = Math.sqrt(d2);
      const nu = eu / d, nv = ev / d, nw = ew / d;
      ct.nx = nu * u.x + nv * v.x + nw * w.x;
      ct.ny = nu * u.y + nv * v.y + nw * w.y;
      ct.nz = nu * u.z + nv * v.z + nw * w.z;
      ct.pen = R - d;
      return true;
    }
    // centre inside the box: push out through the nearest face
    const fu = h[0] - Math.abs(lu), fv = h[1] - Math.abs(lv), fw = h[2] - Math.abs(lw);
    let ax = u, s = Math.sign(lu) || 1, m = fu;
    if (fv < m) { m = fv; ax = v; s = Math.sign(lv) || 1; }
    if (fw < m) { m = fw; ax = w; s = Math.sign(lw) || 1; }
    ct.nx = ax.x * s; ct.ny = ax.y * s; ct.nz = ax.z * s;
    ct.pen = R + m;
    return true;
  }
}

export class CapsuleCollider extends Collider {
  constructor(o) {
    super(o);
    this.a = o.a; this.b = o.b; this.r = o.r;
    this.aabb = [
      Math.min(o.a.x, o.b.x) - o.r, Math.min(o.a.y, o.b.y) - o.r, Math.min(o.a.z, o.b.z) - o.r,
      Math.max(o.a.x, o.b.x) + o.r, Math.max(o.a.y, o.b.y) + o.r, Math.max(o.a.z, o.b.z) + o.r,
    ];
    this.dx = o.b.x - o.a.x; this.dy = o.b.y - o.a.y; this.dz = o.b.z - o.a.z;
    this.l2 = this.dx * this.dx + this.dy * this.dy + this.dz * this.dz || 1e-12;
  }
  test(p, ct) {
    const a = this.a;
    let t = ((p.x - a.x) * this.dx + (p.y - a.y) * this.dy + (p.z - a.z) * this.dz) / this.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a.x + this.dx * t, qy = a.y + this.dy * t, qz = a.z + this.dz * t;
    const ex = p.x - qx, ey = p.y - qy, ez = p.z - qz;
    const d2 = ex * ex + ey * ey + ez * ez;
    const rr = R + this.r;
    if (d2 >= rr * rr || d2 < 1e-14) return false;
    const d = Math.sqrt(d2);
    ct.nx = ex / d; ct.ny = ey / d; ct.nz = ez / d; ct.pen = rr - d;
    ct.vx = ct.vy = ct.vz = 0;
    return true;
  }
}

export class SphereCollider extends Collider {
  constructor(o) {
    super(o);
    this.c = o.center; this.r = o.r;
    this.aabb = [o.center.x - o.r, o.center.y - o.r, o.center.z - o.r, o.center.x + o.r, o.center.y + o.r, o.center.z + o.r];
  }
  test(p, ct) {
    const ex = p.x - this.c.x, ey = p.y - this.c.y, ez = p.z - this.c.z;
    const d2 = ex * ex + ey * ey + ez * ez, rr = R + this.r;
    if (d2 >= rr * rr || d2 < 1e-14) return false;
    const d = Math.sqrt(d2);
    ct.nx = ex / d; ct.ny = ey / d; ct.nz = ez / d; ct.pen = rr - d;
    ct.vx = ct.vy = ct.vz = 0;
    return true;
  }
}

// Thick disk (short cylinder): drum heads, the gong face.
export class DiskCollider extends Collider {
  constructor(o) {
    super(o);
    this.c = o.center; this.n = o.normal; this.r = o.r; this.t = o.halfThick ?? 0.005;
    const e = o.r + this.t;
    this.aabb = [this.c.x - e, this.c.y - e, this.c.z - e, this.c.x + e, this.c.y + e, this.c.z + e];
    this.vel = null; // optional function returning surface velocity along n
  }
  test(p, ct) {
    const n = this.n;
    const dx = p.x - this.c.x, dy = p.y - this.c.y, dz = p.z - this.c.z;
    const h = dx * n.x + dy * n.y + dz * n.z;
    const rx = dx - h * n.x, ry = dy - h * n.y, rz = dz - h * n.z;
    const rl = Math.hypot(rx, ry, rz);
    ct.vx = ct.vy = ct.vz = 0;
    if (rl <= this.r) {
      const gap = Math.abs(h) - this.t;
      if (gap >= R) return false;
      const s = h >= 0 ? 1 : -1;
      ct.nx = n.x * s; ct.ny = n.y * s; ct.nz = n.z * s; ct.pen = R - gap;
      if (this.vel) { const sv = this.vel(); ct.vx = n.x * sv; ct.vy = n.y * sv; ct.vz = n.z * sv; }
      return true;
    }
    // rim edge
    const hc = Math.max(-this.t, Math.min(this.t, h));
    const qx = this.c.x + rx / rl * this.r + n.x * hc;
    const qy = this.c.y + ry / rl * this.r + n.y * hc;
    const qz = this.c.z + rz / rl * this.r + n.z * hc;
    const ex = p.x - qx, ey = p.y - qy, ez = p.z - qz;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 >= R * R || d2 < 1e-14) return false;
    const d = Math.sqrt(d2);
    ct.nx = ex / d; ct.ny = ey / d; ct.nz = ez / d; ct.pen = R - d;
    return true;
  }
}

// helpers to build orthonormal frames
export function frameFromNormal(n) {
  // returns [t1, t2, n] with t1 horizontal when possible
  let t1 = Math.abs(n.y) < 0.95 ? { x: n.z, y: 0, z: -n.x } : { x: 1, y: 0, z: 0 };
  let l = Math.hypot(t1.x, t1.y, t1.z); t1 = { x: t1.x / l, y: t1.y / l, z: t1.z / l };
  const t2 = { x: n.y * t1.z - n.z * t1.y, y: n.z * t1.x - n.x * t1.z, z: n.x * t1.y - n.y * t1.x };
  return [t1, t2, n];
}
