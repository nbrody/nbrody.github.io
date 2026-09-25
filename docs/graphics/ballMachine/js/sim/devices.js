// Mechanisms of the machine (simulation side). The renderer reads their state.

import { G } from './math.js';
import { BALL } from './constants.js';
import { velCurve } from './world.js';
import { CapsuleCollider, DiskCollider, BoxCollider, frameFromNormal } from './colliders.js';

const R = BALL.R, M = BALL.m;
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

// --------------------------------------------------------------------------
// Bucket-chain lift: a roller chain with ball shelves; balls queue at the end
// of the feed trough, are scooped by a rising shelf and roll off at the top.
export class ChainLift {
  constructor(world, o) {
    this.kind = 'lift';
    this.world = world;
    Object.assign(this, { cx: o.cx, cz: o.cz, ax: o.ax, az: o.az, yB: o.yB, yT: o.yT });
    this.rs = o.rs ?? 0.1;
    this.out = o.out ?? 0.075;
    this.speed = o.speed ?? 0.35;
    this.baseSpeed = this.speed;
    this.H = this.yT - this.yB;
    this.Lc = 2 * this.H + TAU * this.rs;
    this.n = Math.round(this.Lc / (o.spacing ?? 0.5));
    this.spacing = this.Lc / this.n;
    this.phase = 0;
    this.cargo = new Array(this.n).fill(null);
    this.running = true;
    this.lineX = this.cx + this.ax * (this.rs + this.out);
    this.lineZ = this.cz + this.az * (this.rs + this.out);
    this.loadY = o.loadY; this.releaseY = o.releaseY;
    this.uLoad = this.loadY - R - this.yB;
    this.uRelease = this.releaseY - R - this.yB;
    this.feed = null; this.exit = null;
    this.lifted = 0;
  }
  get loadPoint() { return { x: this.lineX, y: this.loadY, z: this.lineZ }; }
  get releasePoint() { return { x: this.lineX, y: this.releaseY, z: this.lineZ }; }
  shelfU(i) { return (this.phase + i * this.spacing) % this.Lc; }
  step(h, w) {
    if (!this.running || this.speed <= 0) return;
    const du = this.speed * h;
    const prev = this.phase;
    this.phase = (this.phase + du) % this.Lc;
    for (let i = 0; i < this.n; i++) {
      const u1 = (prev + i * this.spacing) % this.Lc, u2 = u1 + du;
      if (!this.cargo[i] && u1 < this.uLoad && u2 >= this.uLoad) {
        const b = this._waiting(w);
        if (b) {
          w.carry(b, this, i, 0.06);
          this.cargo[i] = b; this.lifted++; b.trips++;
          b.branch = null; b.lastDevice = 'lift';
          w.sound('cup', 0.45, b.p);
          w.info('lift', { ball: b.id });
        }
      }
      if (this.cargo[i] && u1 < this.uRelease && u2 >= this.uRelease) {
        const b = this.cargo[i];
        this.cargo[i] = null;
        w.placeOnTrack(b, this.exit, 0.001, 0.06);
        w.sound('clunk', 0.25, b.p);
        w.info('top', { ball: b.id });
      }
    }
  }
  _waiting(w) {
    const f = this.feed;
    for (const b of w.balls) if (b.mode === 'track' && b.track === f && b.s > f.L - 0.025 && Math.abs(b.v) < 0.35) return b;
    return null;
  }
  slotPos(i, o) { o.x = this.lineX; o.y = this.yB + this.shelfU(i) + R + 0.004; o.z = this.lineZ; return o; }
  slotVel(i, o) { o.x = 0; o.y = this.speed; o.z = 0; return o; }
  // chain centre-line point, tangent and outward normal for rendering
  chainFrame(u, o) {
    const { H, rs, ax, az } = this;
    u = wrap(u / this.Lc * TAU) / TAU * this.Lc;
    let px, py, pz, tx, ty, tz, nx, ny, nz;
    if (u < H) {
      px = this.cx + ax * rs; py = this.yB + u; pz = this.cz + az * rs;
      tx = 0; ty = 1; tz = 0; nx = ax; ny = 0; nz = az;
    } else if (u < H + Math.PI * rs) {
      const th = (u - H) / rs;
      const c = Math.cos(th), s = Math.sin(th);
      px = this.cx + ax * rs * c; py = this.yT + rs * s; pz = this.cz + az * rs * c;
      nx = ax * c; ny = s; nz = az * c;
      tx = -ax * s; ty = c; tz = -az * s;
    } else if (u < 2 * H + Math.PI * rs) {
      const d = u - H - Math.PI * rs;
      px = this.cx - ax * rs; py = this.yT - d; pz = this.cz - az * rs;
      tx = 0; ty = -1; tz = 0; nx = -ax; ny = 0; nz = -az;
    } else {
      const th = (u - 2 * H - Math.PI * rs) / rs;
      const c = Math.cos(th), s = Math.sin(th);
      px = this.cx - ax * rs * c; py = this.yB - rs * s; pz = this.cz - az * rs * c;
      nx = -ax * c; ny = -s; nz = -az * c;
      tx = ax * s; ty = -c; tz = az * s;
    }
    o.px = px; o.py = py; o.pz = pz; o.tx = tx; o.ty = ty; o.tz = tz; o.nx = nx; o.ny = ny; o.nz = nz;
    return o;
  }
}

// --------------------------------------------------------------------------
// Flip-flop: a pivoting hardwood paddle at a Y junction. Each ball goes the way
// the paddle points and knocks it over to the other side.
export class FlipFlop {
  constructor(world, o) {
    this.kind = 'flipflop';
    this.name = o.name;
    this.input = o.input;
    this.outs = o.outs;
    this.labels = o.labels || ['A', 'B'];
    this.state = o.state ?? 0;
    this.lock = null;
    this.random = false;
    this.angle = this.targetAngle();
    this.angVel = 0;
    this.count = [0, 0];
    const f = {};
    o.input.sample(o.input.L, f);
    this.pos = { x: f.px, y: f.py, z: f.pz };
    this.frame = f;
    o.input.onEnd = (b, w, over) => this.route(b, w, over);
  }
  targetAngle() { return (this.lock ?? this.state) ? 0.42 : -0.42; }
  route(b, w, over) {
    let k = this.lock ?? this.state;
    if (this.lock == null && this.random) k = w.rand() < 0.5 ? 0 : 1;
    b.track = this.outs[k]; b.s = over;
    this.count[k]++;
    if (this.lock == null) this.state = k ^ 1;
    this.angVel += (this.state ? 1 : -1) * 14;
    w.sound('clack', 0.5 + Math.min(0.4, Math.abs(b.v) * 0.3), this.pos);
    w.info('switch', { name: this.name, ball: b.id, out: k });
    this.onRoute?.(b, k, w);
    return true;
  }
  step(h) {
    const acc = 500 * (this.targetAngle() - this.angle) - 26 * this.angVel;
    this.angVel += acc * h;
    this.angle += this.angVel * h;
  }
}

// --------------------------------------------------------------------------
// Hyperbolic "gravity well" funnel (surface of revolution y = yRim - A(1/r - 1/rOut)).
export class Funnel {
  constructor(world, o) {
    this.kind = 'funnel';
    this.name = o.name || 'funnel';
    Object.assign(this, { cx: o.cx, cz: o.cz, yRim: o.yRim, rOut: o.rOut, rHole: o.rHole, depth: o.depth });
    this.A = this.depth / (1 / this.rHole - 1 / this.rOut);
    this.rMax = this.rOut;
    this.k = 1.4;
    this.mu = o.mu ?? 0.006;
    this.rimE = 0.45;
    this.muWall = o.muWall ?? 0.06;   // friction against the rim wall ("wall of death")
    this.e = 0.3;
    this.sound = 'funnel';
    this.captureFree = true;
    this.inside = 0;
    this.onExitCb = o.onExit || null;
    this.jitter = o.jitter ?? 0;       // outlet-tube rattle (m), breaks perfect symmetry below
  }
  hy(r) { return this.yRim - this.A * (1 / r - 1 / this.rOut); }
  dhy(r) { return this.A / (r * r); }
  onExit(b, w) {
    // the ball rattles down the outlet tube: it leaves straight down, spin damped out
    const j = this.jitter, jx = j ? (w.rand() - 0.5) * 2 * j : 0, jz = j ? (w.rand() - 0.5) * 2 * j : 0;
    w.launch(b, { x: this.cx + jx, y: this.hy(this.rHole) - 0.015, z: this.cz + jz }, { x: jx * 8, y: -0.4, z: jz * 8 });
    b.omega.x = 0; b.omega.y = 0; b.omega.z = 0;
    w.sound('clunk', 0.25, b.p);
    w.info('funnelExit', { ball: b.id, name: this.name });
    this.onExitCb?.(b, w);
  }
  attachEntry(track) {
    track.onEnd = (b, w) => { w.toSurface(b, this); w.info('funnelEnter', { ball: b.id, name: this.name }); return true; };
  }
}

// --------------------------------------------------------------------------
// Overbalanced wheel with pockets, turned only by the weight of the balls it carries.
export class Wheel {
  constructor(world, o) {
    this.kind = 'wheel';
    this.world = world;
    Object.assign(this, { cx: o.cx, cy: o.cy, cz: o.cz });
    const a = o.axis; // horizontal unit
    this.a3 = { x: a.x, y: 0, z: a.z };
    this.e1 = { x: a.z, y: 0, z: -a.x };
    this.Rw = o.radius ?? 0.42;
    this.n = o.pockets ?? 8;
    this.theta = o.theta ?? 0.2; this.omega = 0;
    this.I = o.I ?? 0.35;
    this.fr = o.friction ?? 0.05;
    this.damp = o.damp ?? 0.25;
    this.loadAngle = o.loadAngle ?? 100 * Math.PI / 180;
    this.dumpAngle = o.dumpAngle ?? 215 * Math.PI / 180;
    this.cargo = new Array(this.n).fill(null);
    this.feed = null; this.exit = null;
    this.tickAcc = 0;
    this.turned = 0;
  }
  pocketAngle(j) { return this.theta + j * TAU / this.n; }
  pointAt(phi, rad = this.Rw) {
    const c = Math.cos(phi), s = Math.sin(phi);
    return { x: this.cx + rad * c * this.e1.x, y: this.cy + rad * s, z: this.cz + rad * c * this.e1.z };
  }
  slotPos(j, o) {
    const phi = this.pocketAngle(j), c = Math.cos(phi), s = Math.sin(phi);
    o.x = this.cx + this.Rw * c * this.e1.x; o.y = this.cy + this.Rw * s; o.z = this.cz + this.Rw * c * this.e1.z;
    return o;
  }
  slotVel(j, o) {
    const phi = this.pocketAngle(j), c = Math.cos(phi), s = Math.sin(phi);
    const v = this.omega * this.Rw;
    o.x = -v * s * this.e1.x; o.y = v * c; o.z = -v * s * this.e1.z;
    return o;
  }
  step(h, w) {
    let tq = 0;
    for (let j = 0; j < this.n; j++) if (this.cargo[j]) tq += -M * G * this.Rw * Math.cos(this.pocketAngle(j));
    const waiting = this._waiting(w);
    if (waiting) {
      let got = false;
      for (let j = 0; j < this.n; j++) {
        if (this.cargo[j]) continue;
        let d = wrap(this.pocketAngle(j) - this.loadAngle);
        if (d > Math.PI) d -= TAU;
        if (Math.abs(d) < 0.05) {
          w.carry(waiting, this, j, 0.12);
          this.cargo[j] = waiting; got = true;
          w.sound('cup', 0.4, waiting.p);
          w.info('wheel', { ball: waiting.id });
          break;
        }
      }
      if (!got) tq += M * G * this.Rw * 0.45; // the ball leans on the rim
    }
    // Coulomb + viscous friction, ratchet prevents running backwards
    if (Math.abs(this.omega) < 1e-4 && Math.abs(tq) <= this.fr) { this.omega = 0; }
    else {
      const fr = this.omega > 1e-4 ? this.fr : Math.sign(tq) * this.fr;
      this.omega += ((tq - fr - this.damp * this.omega) / this.I) * h;
      if (this.omega < 0) this.omega = 0;
    }
    const dth = this.omega * h;
    const prevTheta = this.theta;
    this.theta += dth;
    this.turned += dth;
    for (let j = 0; j < this.n; j++) {
      const b = this.cargo[j];
      if (!b) continue;
      const p0 = wrap(prevTheta + j * TAU / this.n), p1 = p0 + dth, D = this.dumpAngle;
      if ((p0 < D && p1 >= D) || (p0 < D + TAU && p1 >= D + TAU)) {
        this.cargo[j] = null;
        w.placeOnTrack(b, this.exit, 0.001, Math.max(0.12, this.omega * this.Rw * 0.6));
        w.sound('clunk', 0.35, b.p);
      }
    }
    this.tickAcc += dth;
    const tickStep = TAU / (this.n * 3);
    while (this.tickAcc > tickStep) { this.tickAcc -= tickStep; w.sound('tick', 0.35 + Math.min(0.4, this.omega * 0.2), { x: this.cx, y: this.cy, z: this.cz }); }
  }
  _waiting(w) {
    const f = this.feed;
    if (!f) return null;
    for (const b of w.balls) if (b.mode === 'track' && b.track === f && b.s > f.L - 0.03 && Math.abs(b.v) < 0.4) return b;
    return null;
  }
}

// --------------------------------------------------------------------------
// Tipping trough: collects balls against its gate; the third ball outweighs the
// counterweight, the trough tips, the gate opens and the balls roll out.
export class TipBucket {
  constructor(world, o) {
    this.kind = 'bucket';
    this.world = world;
    this.pivot = o.pivot;
    this.dir = o.dir;                  // horizontal unit from pivot toward the bucket
    this.axis = { x: this.dir.z, y: 0, z: -this.dir.x }; // tilt axis (dir x up)
    this.Lb = o.Lb ?? 0.36;            // lever arm of the first (outermost) slot
    this.cap = o.cap ?? 3;
    this.cwTorque = o.cwTorque ?? M * G * 0.76;
    this.I = o.I ?? 0.06;
    this.phi = 0; this.omega = 0;
    this.phiMax = o.phiMax ?? 0.62;
    this.dumpAngle = o.dumpAngle ?? 0.5;
    this.cargo = [];
    this.releasing = false; this.releaseT = 0;
    this.feed = null; this.chute = null;
    this.tips = 0;
    this.yOff = o.yOff ?? R + 0.005;
  }
  slotLocal(k) { return { d: this.Lb - k * 2.02 * R, y: this.yOff }; }
  _rot(d, y, o) {
    // rotate the point (d along dir, y up) about the pivot by -phi (bucket end dips)
    const c = Math.cos(this.phi), s = Math.sin(this.phi);
    const dd = d * c + y * s, yy = -d * s + y * c;
    o.x = this.pivot.x + this.dir.x * dd; o.y = this.pivot.y + yy; o.z = this.pivot.z + this.dir.z * dd;
    return o;
  }
  slotPos(k, o) { const l = this.slotLocal(k); return this._rot(l.d, l.y, o); }
  slotVel(k, o) {
    const l = this.slotLocal(k);
    const c = Math.cos(this.phi), s = Math.sin(this.phi);
    // d/dt of rotated coords
    const ddd = (-l.d * s + l.y * c) * this.omega, dyy = (-l.d * c - l.y * s) * this.omega;
    o.x = this.dir.x * ddd; o.y = dyy; o.z = this.dir.z * ddd;
    return o;
  }
  lipPoint(phi) {
    const save = this.phi; this.phi = phi;
    const p = this._rot(this.Lb + 0.045, this.yOff, {});
    this.phi = save; return p;
  }
  receive(b, w, over) {
    if (this.phi > 0.03 || this.releasing || this.cargo.length >= this.cap) {
      // gate closed: the ball waits at the end of the feed
      b.s = b.track.L - Math.max(over, 0.001);
      b.v = -Math.abs(b.v) * 0.1; b.w = b.v;
      return true;
    }
    const k = this.cargo.length;
    this.cargo.push(b);
    w.carry(b, this, k, 0.18 + 0.12 * (this.cap - k));
    w.sound('cup', 0.5, b.p);
    w.info('bucket', { ball: b.id, count: this.cargo.length });
    return true;
  }
  step(h, w) {
    let tq = -this.cwTorque * Math.cos(this.phi);
    for (let k = 0; k < this.cargo.length; k++) {
      const b = this.cargo[k];
      if (b.mode !== 'carried' || b.carrier !== this) continue;
      if (b.settle < 1) continue; // still rolling in
      tq += M * G * this.slotLocal(k).d * Math.cos(this.phi);
    }
    this.omega += ((tq - 0.4 * this.omega) / this.I) * h;
    this.phi += this.omega * h;
    if (this.phi < 0) {
      if (this.omega < -0.6) w.sound('thud', Math.min(1, -this.omega * 0.25), this.pivot);
      this.phi = 0; this.omega = Math.max(0, this.omega) * 0;
    }
    if (this.phi > this.phiMax) {
      if (this.omega > 0.6) w.sound('thud', Math.min(1, this.omega * 0.25), this.pivot);
      this.phi = this.phiMax; this.omega = 0;
    }
    if (!this.releasing && this.cargo.length && this.phi > this.dumpAngle) {
      this.releasing = true; this.releaseT = 0; this.tips++;
      w.info('tip', { count: this.cargo.length });
    }
    if (this.releasing) {
      this.releaseT -= h;
      if (this.releaseT <= 0 && this.cargo.length) {
        const b = this.cargo.shift();
        w.placeOnTrack(b, this.chute, 0.001, 0.25);
        this.releaseT = 0.42;
        // remaining balls shift one slot outward
        for (let k = 0; k < this.cargo.length; k++) this.cargo[k].slot = k;
      }
      if (!this.cargo.length) this.releasing = false;
    }
  }
}

// --------------------------------------------------------------------------
// Instruments struck by flying balls.

export class Bell {
  constructor(world, o) {
    this.kind = 'bell';
    this.name = o.name || 'bell';
    this.hang = o.hang;            // pivot point at the top
    this.midi = o.midi;
    this.r = o.r ?? 0.07;          // mouth radius
    this.hgt = o.height ?? 0.12;
    this.facing = o.facing;        // horizontal unit: direction the ball comes from
    this.swing = 0; this.swingVel = 0; this.ring = 0;
    const top = { x: this.hang.x, y: this.hang.y - 0.03, z: this.hang.z };
    const bot = { x: this.hang.x, y: this.hang.y - 0.03 - this.hgt + this.r * 0.9, z: this.hang.z };
    this.collider = world.addCollider(new CapsuleCollider({
      a: top, b: bot, r: this.r * 0.85, e: 0.42, mu: 0.2, tag: 'bell',
      onHit: (b, v, w) => this.hit(b, v, w),
    }));
  }
  hit(b, v, w) {
    const amp = velCurve(v, 1.6);
    w.sound('bell', amp, { x: this.hang.x, y: this.hang.y - this.hgt * 0.6, z: this.hang.z }, this.midi);
    this.swingVel += Math.min(1.5, v * 0.9);
    this.ring = Math.min(1, this.ring + amp);
    w.stats.notes++;
  }
  step(h) {
    const L = 0.12;
    this.swingVel += (-(G / L) * Math.sin(this.swing) - 1.2 * this.swingVel) * h;
    this.swing += this.swingVel * h;
    this.ring *= 1 - 0.6 * h;
  }
}

export class Drum {
  constructor(world, o) {
    this.kind = 'drum';
    this.name = o.name || 'drum';
    this.center = o.center; this.normal = o.normal; this.r = o.r; this.midi = o.midi;
    this.depth = o.depth ?? 0.22;
    this.amp = 0; this.phase = 0;
    this.color = o.color ?? 0xb22222;
    this.collider = world.addCollider(new DiskCollider({
      center: o.center, normal: o.normal, r: o.r, halfThick: 0.004, e: o.e ?? 0.72, mu: 0.25, tag: 'drum',
      onHit: (b, v, w) => {
        const amp = velCurve(v, 3);
        w.sound('drum', amp, this.center, this.midi);
        this.amp = Math.min(1, this.amp + amp); this.phase = 0;
        w.stats.notes++;
        w.info('drum', { ball: b.id, name: this.name });
      },
    }));
  }
  step(h) { this.amp *= 1 - 5 * h; this.phase += h; }
}

export class Gong {
  constructor(world, o) {
    this.kind = 'gong';
    this.center = o.center; this.normal = o.normal; this.r = o.r; this.midi = o.midi ?? 38;
    this.wob = 0; this.wobVel = 0; this.shimmer = 0;
    this.collider = world.addCollider(new DiskCollider({
      center: o.center, normal: o.normal, r: o.r, halfThick: 0.006, e: 0.3, mu: 0.2, tag: 'gong',
      onHit: (b, v, w) => {
        const amp = velCurve(v, 2.2);
        w.sound('gong', amp, this.center, this.midi);
        this.wobVel += v * 0.5; this.shimmer = Math.min(1, this.shimmer + amp);
        w.stats.notes++;
        w.info('gong', { ball: b.id });
      },
    }));
  }
  step(h) {
    this.wobVel += (-30 * this.wob - 0.8 * this.wobVel) * h;
    this.wob += this.wobVel * h;
    this.shimmer *= 1 - 0.35 * h;
  }
}

// Plinko board of tuned glockenspiel pegs between two panes of glass.
export class Plinko {
  constructor(world, o) {
    this.kind = 'plinko';
    this.world = world;
    this.center = o.center;         // board centre
    this.right = o.right;           // horizontal unit along the board
    this.normal = { x: -o.right.z, y: 0, z: o.right.x };
    this.width = o.width; this.height = o.height; this.depth = o.depth ?? 0.075;
    this.pegR = o.pegR ?? 0.007;
    this.pegs = [];
    const rows = o.rows, cols = o.cols, dx = o.dx, dy = o.dy;
    const top = this.center.y + this.height / 2 - o.topMargin;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) ? dx / 2 : 0;
      const n = (r % 2) ? cols - 1 : cols;
      for (let c = 0; c < n; c++) {
        const u = -((cols - 1) * dx) / 2 + c * dx + off;
        const y = top - r * dy;
        const pc = { x: this.center.x + this.right.x * u, y, z: this.center.z + this.right.z * u };
        const midi = o.noteFor(r, c, u);
        const peg = { u, y, row: r, col: c, midi, glow: 0, pos: pc };
        const hd = this.depth / 2;
        peg.collider = world.addCollider(new CapsuleCollider({
          a: { x: pc.x - this.normal.x * hd, y, z: pc.z - this.normal.z * hd },
          b: { x: pc.x + this.normal.x * hd, y, z: pc.z + this.normal.z * hd },
          r: this.pegR, e: 0.5, mu: 0.15, tag: 'peg',
          onHit: (b, v, w) => {
            if (v < 0.08) return;
            const amp = velCurve(v, 1.8);
            w.sound('glock', amp * 0.9, pc, midi);
            peg.glow = Math.min(1, peg.glow + 0.4 + amp);
            w.stats.notes++;
          },
        }));
        this.pegs.push(peg);
      }
    }
    // glass panes front/back and side walls (all invisible helpers; rendered separately)
    const c = this.center, n = this.normal, rt = this.right;
    const up = { x: 0, y: 1, z: 0 };
    const hw = this.width / 2, hh = this.height / 2, hd = this.depth / 2;
    for (const s of [-1, 1]) {
      world.addCollider(new BoxCollider({
        center: { x: c.x + n.x * (hd + 0.004) * s, y: c.y, z: c.z + n.z * (hd + 0.004) * s },
        axes: [rt, up, n], half: [hw, hh, 0.004], e: 0.35, mu: 0.05, tag: 'glass',
      }));
      world.addCollider(new BoxCollider({
        center: { x: c.x + rt.x * (hw + 0.01) * s, y: c.y, z: c.z + rt.z * (hw + 0.01) * s },
        axes: [rt, up, n], half: [0.01, hh, hd + 0.01], e: 0.4, mu: 0.1, tag: 'wall',
        instrument: 'thud', gain: 0.4,
      }));
    }
  }
  step(h) { for (const p of this.pegs) p.glow *= 1 - 4 * h; }
}

// Tuned bars laid across the rails: the ball rolls over each one in turn.
export class BarRun {
  constructor(world, track, bars, o = {}) {
    this.kind = o.kind || 'marimba';
    this.instrument = o.instrument || 'marimba';
    this.track = track;
    this.bars = bars.map((b) => ({ ...b, amp: 0 }));
    this.name = o.name || this.kind;
    this.plays = 0;
    for (const bar of this.bars) {
      track.addSensor(bar.s, (ball, w, dir) => {
        if (dir < 0) return;
        const v = Math.abs(ball.v);
        const amp = Math.min(1, 0.35 + v * 0.45) * (o.gain ?? 1);
        w.sound(this.instrument, amp, ball.p, bar.midi);
        bar.amp = 1;
        w.stats.notes++;
        if (bar === this.bars[0]) { this.plays++; w.info('melody', { name: this.name, ball: ball.id }); }
      }, { kind: 'bar' });
    }
  }
  step(h) { for (const b of this.bars) b.amp *= 1 - 3.5 * h; }
}
