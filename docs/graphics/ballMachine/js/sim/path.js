// PathBuilder — designs track centre-lines the way railway engineers do:
// a plan (straights + circular arcs, Dubins connections) plus an elevation
// profile (grades with smooth vertical-curve transitions), and a couple of
// genuinely 3D pieces (vertical loops).
//
// Plan convention: x = east, z = south (three.js), heading psi in radians,
// direction = (cos psi, 0, -sin psi): psi = 0 east, +90deg north.
// Positive turn angles are LEFT turns (counter-clockwise seen from above).
// Grade g is "drop per metre of plan distance": positive = downhill.

import { deg, smoothstep } from './math.js';

const TAU = Math.PI * 2;
const mod2pi = (a) => ((a % TAU) + TAU) % TAU;

export class PathBuilder {
  constructor(x, y, z, headingDeg = 0, grade = 0) {
    this.x = x; this.y = y; this.z = z;
    this.psi = headingDeg * deg;
    this.g = grade;
    this.h = 0.004;              // plan step (m)
    this.pts = [{ x, y, z }];
    this.d = 0;                  // plan distance travelled
    this.trans = null;           // active grade transition
    this.sched = [];             // scheduled grade transitions [{at, g, L}]
    this.marks = {};             // name -> point index
    this.warnings = [];
  }

  get heading() { return this.psi / deg; }
  pose() { return { x: this.x, y: this.y, z: this.z, heading: this.heading, grade: this.g }; }

  mark(name) { this.marks[name] = this.pts.length - 1; return this; }

  // --- profile ---------------------------------------------------------------
  grade(g, L = 0.3) {
    if (L <= 0) { this.g = g; this.trans = null; return this; }
    this.trans = { from: this.g, to: g, L, p: 0 };
    return this;
  }
  _gradeStep(h) {
    // returns the average grade over a plan step of length h
    while (this.sched.length && this.d >= this.sched[0].at - 1e-9) {
      const e = this.sched.shift();
      this.grade(e.g, e.L);
    }
    if (!this.trans) return this.g;
    const t = this.trans;
    const g0 = this.g;
    t.p += h;
    const f = smoothstep(t.p / t.L);
    this.g = t.from + (t.to - t.from) * f;
    if (t.p >= t.L) { this.g = t.to; this.trans = null; }
    return 0.5 * (g0 + this.g);
  }

  // --- plan ------------------------------------------------------------------
  _advance(total, curvature) {
    // move `total` metres of plan distance with signed curvature (1/r, + = left)
    const n = Math.max(1, Math.ceil(total / this.h));
    const h = total / n;
    for (let i = 0; i < n; i++) {
      const dpsi = h * curvature;
      const pm = this.psi + dpsi * 0.5;
      // chord of the arc for exactness
      const chord = curvature === 0 ? h : (2 / Math.abs(curvature)) * Math.sin(Math.abs(dpsi) * 0.5);
      const gAvg = this._gradeStep(h);
      this.x += chord * Math.cos(pm);
      this.z -= chord * Math.sin(pm);
      this.y -= gAvg * h;
      this.psi += dpsi;
      this.d += h;
      this.pts.push({ x: this.x, y: this.y, z: this.z });
    }
    return this;
  }
  straight(L) { return L > 0 ? this._advance(L, 0) : this; }
  turn(r, angleDeg) {
    if (!angleDeg) return this;
    return this._advance(r * Math.abs(angleDeg) * deg, Math.sign(angleDeg) / r);
  }
  helix(r, turns, dir = 1) { return this.turn(r, 360 * turns * dir); }
  turnTo(headingDeg, r, dir = 0) {
    let a = mod2pi(headingDeg * deg - this.psi);
    if (dir === 0) dir = a <= Math.PI ? 1 : -1;
    if (dir < 0) a = a - TAU;
    return this.turn(r, a / deg);
  }

  // Vertical loop-the-loop (entered level). `shift` moves the exit sideways
  // (+ = to the left) so the track clears its own entry.
  loop(r, shift = 0.12) {
    if (Math.abs(this.g) > 0.02) this.warnings.push(`loop entered with grade ${this.g.toFixed(3)}`);
    this.g = 0; this.trans = null;
    const hx = Math.cos(this.psi), hz = -Math.sin(this.psi);
    const lx = -hz, lz = hx; // left of heading... (rotate +90deg): dir(psi+90)
    const sx = Math.cos(this.psi + Math.PI / 2), sz = -Math.sin(this.psi + Math.PI / 2);
    void lx; void lz;
    const x0 = this.x, y0 = this.y, z0 = this.z;
    const n = Math.ceil((TAU * r) / this.h);
    for (let i = 1; i <= n; i++) {
      const ph = (i / n) * TAU;
      const f = r * Math.sin(ph);
      const up = r * (1 - Math.cos(ph));
      const side = shift * (ph - Math.sin(ph)) / TAU;
      this.pts.push({ x: x0 + hx * f + sx * side, y: y0 + up, z: z0 + hz * f + sz * side });
    }
    this.x = x0 + sx * shift; this.z = z0 + sz * shift; this.y = y0;
    return this;
  }

  // Dubins (CSC) connection in plan to a target pose, with an elevation
  // profile that arrives exactly at target y. Returns this; info in .lastConnect
  connectTo(tx, ty, tz, headingDeg, opts = {}) {
    const r = opts.r ?? 0.5;
    const gEnd = opts.gEnd ?? null;
    const trans = opts.trans ?? 0.35;
    const path = dubins(this.x, -this.z, this.psi, tx, -tz, headingDeg * deg, r, opts.word);
    if (!path) throw new Error('connectTo: no Dubins path');
    const D = path.length;
    const drop = this.y - ty;
    const g0 = this.g;
    const g1 = gEnd ?? (drop / D);
    const L1 = Math.min(trans, D / 3), L2 = Math.min(trans, D / 3);
    const gm = (drop - (L1 * g0 + L2 * g1) / 2) / (D - (L1 + L2) / 2);
    this.lastConnect = { D, gm, path: path.word };
    if (gm < -0.02) this.warnings.push(`connectTo climbs (grade ${gm.toFixed(3)})`);
    if (gm > 0.6) this.warnings.push(`connectTo very steep (grade ${gm.toFixed(3)})`);
    this.grade(gm, L1);
    const start = this.d;
    this.sched.push({ at: start + D - L2, g: g1, L: L2 });
    this.sched.sort((a, b) => a.at - b.at);
    const segs = path.segs;
    for (const [type, l] of segs) {
      if (type === 'S') this.straight(l);
      else this.turn(r, (type === 'L' ? 1 : -1) * (l / r) / deg);
    }
    const err = Math.hypot(this.x - tx, this.y - ty, this.z - tz);
    if (err > 0.003) this.warnings.push(`connectTo end error ${(err * 1000).toFixed(1)} mm`);
    this.x = tx; this.y = ty; this.z = tz; this.psi = headingDeg * deg;
    const last = this.pts[this.pts.length - 1];
    last.x = tx; last.y = ty; last.z = tz;
    return this;
  }

  // Rise/drop to a given height over a given plan length (straight), smoothly.
  straightTo(L, y, trans = 0.3) {
    const drop = this.y - y;
    const L1 = Math.min(trans, L / 3), L2 = Math.min(trans, L / 3);
    const gEnd = 0;
    const gm = (drop - (L1 * this.g + L2 * gEnd) / 2) / (L - (L1 + L2) / 2);
    this.grade(gm, L1);
    this.sched.push({ at: this.d + L - L2, g: gEnd, L: L2 });
    this.sched.sort((a, b) => a.at - b.at);
    return this.straight(L);
  }

  points() { return this.pts; }
}

// Dubins shortest CSC path, standard math orientation (x east, y north, theta CCW).
export function dubins(x0, y0, th0, x1, y1, th1, r, only) {
  const dx = x1 - x0, dy = y1 - y0;
  const D = Math.hypot(dx, dy) / r;
  const th = Math.atan2(dy, dx);
  const a = mod2pi(th0 - th), b = mod2pi(th1 - th);
  const sa = Math.sin(a), sb = Math.sin(b), ca = Math.cos(a), cb = Math.cos(b);
  const cab = Math.cos(a - b);
  const cands = [];
  { // LSL
    const p2 = 2 + D * D - 2 * cab + 2 * D * (sa - sb);
    if (p2 >= 0) {
      const tmp = Math.atan2(cb - ca, D + sa - sb);
      cands.push({ word: 'LSL', t: mod2pi(-a + tmp), p: Math.sqrt(p2), q: mod2pi(b - tmp), w: ['L', 'S', 'L'] });
    }
  }
  { // RSR
    const p2 = 2 + D * D - 2 * cab + 2 * D * (sb - sa);
    if (p2 >= 0) {
      const tmp = Math.atan2(ca - cb, D - sa + sb);
      cands.push({ word: 'RSR', t: mod2pi(a - tmp), p: Math.sqrt(p2), q: mod2pi(-b + tmp), w: ['R', 'S', 'R'] });
    }
  }
  { // LSR
    const p2 = -2 + D * D + 2 * cab + 2 * D * (sa + sb);
    if (p2 >= 0) {
      const p = Math.sqrt(p2);
      const tmp = Math.atan2(-ca - cb, D + sa + sb) - Math.atan2(-2, p);
      cands.push({ word: 'LSR', t: mod2pi(-a + tmp), p, q: mod2pi(-b + tmp), w: ['L', 'S', 'R'] });
    }
  }
  { // RSL
    const p2 = -2 + D * D + 2 * cab - 2 * D * (sa + sb);
    if (p2 >= 0) {
      const p = Math.sqrt(p2);
      const tmp = Math.atan2(ca + cb, D - sa - sb) - Math.atan2(2, p);
      cands.push({ word: 'RSL', t: mod2pi(a - tmp), p, q: mod2pi(b - tmp), w: ['R', 'S', 'L'] });
    }
  }
  let best = null;
  for (const c of cands) {
    if (only && c.word !== only) continue;
    const L = (c.t + c.p + c.q) * r;
    if (!best || L < best.length) best = { length: L, word: c.word, segs: [[c.w[0], c.t * r], ['S', c.p * r], [c.w[2], c.q * r]] };
  }
  return best;
}
