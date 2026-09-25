// The simulation world. Balls live in one of four modes:
//   track    — rolling along a Track (1D along the curve, with slip/spin); on a
//              water-slide flume the ball also swings around the channel
//   free     — ballistic flight with drag, bouncing off colliders (and
//              buoyancy + water drag inside pools)
//   surface  — rolling on a surface of revolution (vortex funnel, pool floor)
//   carried  — riding a mechanism (lift shelf, wheel pocket, tipping bucket)
// Everything is deterministic for a given seed.

import { G, v3, mulberry32, quatIntegrate, smoothstep } from './math.js';
import { BALL, WATER, SUBSTEP } from './constants.js';

const R = BALL.R;
const MU_K = 0.22;          // sliding friction ball/rail
const TWO_R = 2 * R;

export class Ball {
  constructor(id, color, number) {
    this.id = id;
    this.color = color;
    this.number = number;
    this.mode = 'track';
    this.track = null; this.s = 0; this.v = 0; this.w = 0;
    this.p = v3(); this.vel = v3(); this.omega = v3();
    this.fwd = v3(1, 0, 0); this.up = v3(0, 1, 0);
    this.surf = null; this.e = 0;
    this.carrier = null; this.slot = -1; this.settle = 1; this.settleTime = 0.2; this.settleFrom = v3();
    this.q = [0, 0, 0, 1];
    this.branch = null; this.lastDevice = '';
    this.idle = 0; this.airTime = 0; this.lastClick = -1;
    this.noCapture = null; this.noCaptureUntil = 0;
    this.sound = 'rail'; this.orbitHz = 0;
    this.trips = 0;
    this.phi = 0; this.phiV = 0;     // angle up the flume wall (rad, + = toward the track's side S) and its rate
    this.wet = 0;                    // how deep the ball sits in water (0..1)
    this.inWater = null;             // the pool the ball is in, if any
    this.basin = null;               // the pool basin whose wall contains it
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }
}

export class World {
  constructor(seed = 1) {
    this.t = 0;
    this.balls = [];
    this.tracks = [];
    this.devices = [];
    this.colliders = [];
    this.surfaces = [];
    this.waters = [];              // pools: {name, cx, cz, r, ySurf, floorAt(r)}
    this.events = [];
    this.rand = mulberry32(seed);
    this.cell = 0.25;
    this.colliderGrid = new Map();
    this.capCell = 0.1;
    this.captureGrid = new Map();
    this.fr = {};
    this.fr2 = {};
    this.stats = { derails: 0, liftoffs: 0, lost: 0, recovered: 0, captures: 0, bounces: 0, notes: 0 };
    this.lostHandler = null;       // (ball) => void : where to put rescued balls
    this.log = [];
  }

  // ---------------------------------------------------------------- building
  addTrack(t) { this.tracks.push(t); return t; }
  addDevice(d) { this.devices.push(d); return d; }
  addCollider(c) { this.colliders.push(c); return c; }
  addSurface(s) { this.surfaces.push(s); return s; }
  addWater(w) { this.waters.push(w); return w; }

  finalize() {
    this.colliderGrid.clear();
    for (const c of this.colliders) {
      const b = c.aabb;
      const i0 = Math.floor((b[0] - R) / this.cell), i1 = Math.floor((b[3] + R) / this.cell);
      const j0 = Math.floor((b[1] - R) / this.cell), j1 = Math.floor((b[4] + R) / this.cell);
      const k0 = Math.floor((b[2] - R) / this.cell), k1 = Math.floor((b[5] + R) / this.cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const key = `${i},${j},${k}`;
        let arr = this.colliderGrid.get(key);
        if (!arr) this.colliderGrid.set(key, (arr = []));
        arr.push(c);
      }
    }
    this.captureGrid.clear();
    for (const t of this.tracks) {
      if (!t.capture) continue;
      const i0 = Math.max(0, Math.floor(t.capture.s0 / t.ds)), i1 = Math.min(t.n - 1, Math.ceil(t.capture.s1 / t.ds));
      for (let i = i0; i <= i1; i++) {
        const x = t.P[3 * i], y = t.P[3 * i + 1], z = t.P[3 * i + 2];
        const key = `${Math.floor(x / this.capCell)},${Math.floor(y / this.capCell)},${Math.floor(z / this.capCell)}`;
        let arr = this.captureGrid.get(key);
        if (!arr) this.captureGrid.set(key, (arr = []));
        arr.push(t, i);
      }
    }
  }

  // ---------------------------------------------------------------- events
  sound(instrument, velocity, p, midi) {
    if (velocity <= 0.001) return;
    this.events.push({ type: 'sound', t: this.t, instrument, midi, velocity: Math.min(1, velocity), x: p.x, y: p.y, z: p.z });
  }
  info(kind, data) { this.events.push({ type: kind, t: this.t, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // ---------------------------------------------------------------- ball placement
  placeOnTrack(b, track, s, v = 0) {
    b.mode = 'track'; b.track = track; b.s = s; b.v = v; b.w = v;
    b.phi = 0; b.phiV = 0;
    b.carrier = null; b.surf = null;
    this._syncTrack(b);
  }
  carry(b, carrier, slot, settleTime = 0.18) {
    b.settleFrom.x = b.p.x; b.settleFrom.y = b.p.y; b.settleFrom.z = b.p.z;
    b.mode = 'carried'; b.carrier = carrier; b.slot = slot;
    b.settle = settleTime > 0 ? 0 : 1; b.settleTime = settleTime;
    b.track = null; b.surf = null;
  }
  launch(b, p, vel) {
    b.mode = 'free';
    b.p.x = p.x; b.p.y = p.y; b.p.z = p.z;
    b.vel.x = vel.x; b.vel.y = vel.y; b.vel.z = vel.z;
    b.airTime = 0; b.track = null; b.surf = null; b.carrier = null;
    b.sound = 'air';
  }
  toSurface(b, surf) {
    b.mode = 'surface'; b.surf = surf; b.track = null; b.carrier = null;
    const r = Math.hypot(b.p.x - surf.cx, b.p.z - surf.cz);
    b.p.y = surf.hy(r);
    this._projectSurfaceVel(b, surf);
    // keep whatever spin the ball had about the new surface normal
    b.wn = b.omega.x * b.up.x + b.omega.y * b.up.y + b.omega.z * b.up.z;
    b.sound = surf.sound || 'funnel';
  }

  // ---------------------------------------------------------------- stepping
  step(h = SUBSTEP) {
    for (let i = 0; i < this.devices.length; i++) this.devices[i].step?.(h, this);
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      switch (b.mode) {
        case 'track': if (b.track.flume) this._stepFlume(b, h); else this._stepTrack(b, h); break;
        case 'free': this._stepFree(b, h); break;
        case 'surface': this._stepSurface(b, h); break;
        case 'carried': this._stepCarried(b, h); break;
      }
      quatIntegrate(b.q, b.omega.x, b.omega.y, b.omega.z, h);
    }
    this._collideBalls(h);
    this._collideBalls(h);
    this.t += h;
  }

  advance(dt) {
    const n = Math.max(1, Math.round(dt / SUBSTEP));
    for (let i = 0; i < n; i++) this.step(SUBSTEP);
  }

  // ---- track mode --------------------------------------------------------
  _stepTrack(b, h) {
    const tr = b.track, f = this.fr;
    tr.sample(b.s, f);
    const v = b.v;
    const gt = -G * f.ty;
    // contact force per unit mass needed to keep the ball on the curve
    const fx = v * v * f.kx + gt * f.tx;
    const fy = v * v * f.ky + G + gt * f.ty;
    const fz = v * v * f.kz + gt * f.tz;
    const fn = fx * f.ux + fy * f.uy + fz * f.uz;
    const fm = Math.hypot(fx, fy, fz);
    if (!tr.caged) {
      if (fn < -0.4) { this.stats.liftoffs++; this._leaveTrack(b, tr, f, 'liftoff'); return; }
      const fl = fx * f.sx + fy * f.sy + fz * f.sz;
      if (fn > 0 && Math.abs(fl) > 2.2 * fn + 1.5) { this.stats.derails++; this._leaveTrack(b, tr, f, 'derail'); return; }
    }
    const dr = BALL.drag * v * Math.abs(v);
    const k = tr.k;
    const brk = tr.brake && b.s > tr.brake.s0 && b.s < tr.brake.s1 ? tr.brake.rate : 0;
    if (Math.abs(b.v - b.w) < 0.003) {
      // rolling without slipping
      let vn = v + ((gt - dr) / k - brk * v) * h;
      const fr = (tr.mu * fm / k) * h;
      if (Math.abs(vn) <= fr) vn = 0; else vn -= Math.sign(vn) * fr;
      b.v = vn; b.w = vn;
    } else {
      // skidding (after an impact): friction trades translation for spin
      const dir = Math.sign(b.w - b.v);
      const Ff = MU_K * fm;
      const vn = b.v + (gt - dr + dir * Ff) * h;
      const wn = b.w - (dir * Ff / (k - 1)) * h;
      if (Math.sign(wn - vn) !== dir) {
        const vr = (vn + (k - 1) * wn) / k;
        b.v = vr; b.w = vr;
      } else { b.v = vn; b.w = wn; }
    }
    const s0 = b.s;
    b.s += b.v * h;
    if (tr.sensors.length) this._sensors(b, tr, s0, b.s);
    if (b.s > tr.L) { this._trackEnd(b, tr); if (b.mode !== 'track') return; }
    else if (b.s < 0) { this._trackStart(b, tr); if (b.mode !== 'track') return; }
    this._syncTrack(b);
    if (brk) b.sound = 'brush';
    b.idle = Math.abs(b.v) < 0.01 ? b.idle + h : 0;
  }

  _syncTrack(b) {
    if (b.track.flume) { this._syncFlume(b); return; }
    const tr = b.track, f = this.fr2;
    tr.sample(Math.min(Math.max(b.s, 0), tr.L), f);
    b.p.x = f.px; b.p.y = f.py; b.p.z = f.pz;
    b.vel.x = b.v * f.tx; b.vel.y = b.v * f.ty; b.vel.z = b.v * f.tz;
    b.fwd.x = f.tx; b.fwd.y = f.ty; b.fwd.z = f.tz;
    b.up.x = f.ux; b.up.y = f.uy; b.up.z = f.uz;
    // spin: omega = (w/d) (U x T) = -(w/d) S
    const wd = b.w / tr.d;
    b.omega.x = -wd * f.sx; b.omega.y = -wd * f.sy; b.omega.z = -wd * f.sz;
    b.sound = tr.surface;
  }

  _sensors(b, tr, s0, s1) {
    const S = tr.sensors;
    if (s1 >= s0) {
      for (let i = 0; i < S.length; i++) if (S[i].s > s0 && S[i].s <= s1) S[i].fn(b, this, 1, S[i]);
    } else {
      for (let i = S.length - 1; i >= 0; i--) if (S[i].s < s0 && S[i].s >= s1) S[i].fn(b, this, -1, S[i]);
    }
  }

  _trackEnd(b, tr) {
    const over = b.s - tr.L;
    if (tr.onEnd && tr.onEnd(b, this, over)) return;
    if (tr.next) {
      b.track = tr.next.track; b.s = tr.next.s + over;
      if (b.track.flume && !tr.flume) { b.phi = 0; b.phiV = 0; }
      if (b.track.sensors.length) this._sensors(b, b.track, tr.next.s, b.s);
      return;
    }
    if (tr.endStop) {
      b.s = tr.L - over;
      const imp = Math.abs(b.v);
      b.v = -b.v * tr.endStop.e; b.w = b.v;
      if (imp > 0.12 && this.t - b.lastClick > 0.12) { b.lastClick = this.t; this.sound(tr.endStop.sound || 'click', imp * 0.5, b.p); }
      return;
    }
    const f = this.fr; tr.sample(tr.L, f);
    this._leaveTrack(b, tr, f, 'end');
  }

  _trackStart(b, tr) {
    const over = -b.s;
    if (tr.onStart && tr.onStart(b, this, over)) return;
    if (tr.prev) {
      b.track = tr.prev.track; b.s = tr.prev.s - over;
      return;
    }
    if (tr.startStop) {
      b.s = over;
      const imp = Math.abs(b.v);
      b.v = -b.v * tr.startStop.e; b.w = b.v;
      if (imp > 0.06) this.sound('click', imp * 0.5, b.p);
      return;
    }
    const f = this.fr; tr.sample(0, f);
    this._leaveTrack(b, tr, f, 'start');
  }

  _leaveTrack(b, tr, f, why) {
    if (tr.flume) this._syncFlume(b);      // leaves from where it is on the wall, swinging
    else {
      b.p.x = f.px; b.p.y = f.py; b.p.z = f.pz;
      b.vel.x = b.v * f.tx; b.vel.y = b.v * f.ty; b.vel.z = b.v * f.tz;
      const wd = b.w / tr.d;
      b.omega.x = -wd * f.sx; b.omega.y = -wd * f.sy; b.omega.z = -wd * f.sz;
    }
    b.mode = 'free';
    b.airTime = 0; b.noCapture = tr; b.noCaptureUntil = this.t + 0.05;
    b.track = null; b.sound = 'air';
    if (why !== 'end') this.info('warn', { ball: b.id, why, track: tr.name, s: +b.s.toFixed(3), v: +b.v.toFixed(2) });
  }

  // ---- water-slide flume ---------------------------------------------------
  // The flume is a round-bottomed channel of radius Rc; the ball's centre rides
  // on a circle of radius rho = Rc - R around the channel's axis, at angle phi
  // from the bottom. Along the flume it rolls like on any track, but the water
  // film drags it toward the water's own speed. Around the flume it is a
  // pendulum in the "gravity" g - v^2 K felt by something following the curve:
  // in a bend it swings up the outside wall, then the wall and the water
  // damp the swing. A ball that swings over the rim of an open flume is out.
  _stepFlume(b, h) {
    const tr = b.track, f = this.fr, fl = tr.flume;
    tr.sample(b.s, f);
    const v = b.v, v2 = v * v, rho = fl.rho;
    // the stream here: how deep the ball sits in it (it banks at beta; the
    // ball swings at phi), how much of the ball it wets, and its buoyancy
    const fi = Math.min(tr.n - 1, Math.max(0, Math.round(b.s / tr.ds)));
    const hw = fl.h[fi], d = Math.min(2 * R, hw - fl.Rc * (1 - Math.cos(b.phi - fl.beta[fi])));
    let cw = 0, fv = 0, wet = 0;
    if (d > 0) {
      wet = Math.min(1, d / hw);
      cw = fl.cwk * (R * R * Math.acos((R - d) / R) - (R - d) * Math.sqrt(Math.max(0, 2 * R * d - d * d)));
      fv = d * d * (3 * R - d) / (4 * R * R * R);
    }
    b.wet = wet;
    const g = G * (1 - WATER.ratio * fv);
    const ex = -v2 * f.kx, ey = -g - v2 * f.ky, ez = -v2 * f.kz;
    const gU = ex * f.ux + ey * f.uy + ez * f.uz;
    const gS = ex * f.sx + ey * f.sy + ez * f.sz;
    const c = Math.cos(b.phi), sn = Math.sin(b.phi);
    const lat = rho * b.phiV;
    // wall reaction per unit mass, toward the axis (a wall can only push)
    const N = Math.max(0, rho * b.phiV * b.phiV - (gU * c - gS * sn));
    const mu = tr.mu + fl.muWet * wet;
    // along the flume: gravity, rolling loss, air drag, and the stream pulling the ball toward its own speed
    const rel = fl.u[fi] - v;
    let vn = v + ((-g * f.ty - BALL.drag * v * Math.abs(v) + cw * rel * Math.abs(rel)) / tr.k) * h;
    const fr = (mu * N / tr.k) * h;
    if (Math.abs(vn) <= fr) vn = 0; else vn -= Math.sign(vn) * fr;
    b.v = vn; b.w = vn;
    // around the flume
    const aLat = (gS * c + gU * sn - mu * N * Math.tanh(lat / 0.01) - cw * lat * Math.abs(lat)) / 1.4 - fl.damp * lat;
    b.phiV += (aLat / rho) * h;
    b.phi += b.phiV * h;
    if (!fl.tube && Math.abs(b.phi) > fl.rim) {
      this.stats.derails++;
      b.phi = Math.sign(b.phi) * fl.rim;
      this._leaveTrack(b, tr, f, 'over the rim');
      return;
    }
    const s0 = b.s;
    b.s += b.v * h;
    if (tr.sensors.length) this._sensors(b, tr, s0, b.s);
    if (b.s > tr.L) { this._trackEnd(b, tr); if (b.mode !== 'track') return; }
    else if (b.s < 0) { this._trackStart(b, tr); if (b.mode !== 'track') return; }
    this._syncTrack(b);
    b.idle = Math.abs(b.v) < 0.01 ? b.idle + h : 0;
  }

  _syncFlume(b) {
    const tr = b.track, f = this.fr2, fl = tr.flume;
    tr.sample(Math.min(Math.max(b.s, 0), tr.L), f);
    const c = Math.cos(b.phi), sn = Math.sin(b.phi), rho = fl.rho;
    const ou = rho * (1 - c), os = rho * sn, lat = rho * b.phiV;
    b.p.x = f.px + ou * f.ux + os * f.sx; b.p.y = f.py + ou * f.uy + os * f.sy; b.p.z = f.pz + ou * f.uz + os * f.sz;
    b.vel.x = b.v * f.tx + lat * (sn * f.ux + c * f.sx);
    b.vel.y = b.v * f.ty + lat * (sn * f.uy + c * f.sy);
    b.vel.z = b.v * f.tz + lat * (sn * f.uz + c * f.sz);
    b.fwd.x = f.tx; b.fwd.y = f.ty; b.fwd.z = f.tz;
    // wall normal (toward the axis); rolling: omega = (n x v) / R
    const nx = c * f.ux - sn * f.sx, ny = c * f.uy - sn * f.sy, nz = c * f.uz - sn * f.sz;
    b.up.x = nx; b.up.y = ny; b.up.z = nz;
    b.omega.x = (ny * b.vel.z - nz * b.vel.y) / R;
    b.omega.y = (nz * b.vel.x - nx * b.vel.z) / R;
    b.omega.z = (nx * b.vel.y - ny * b.vel.x) / R;
    b.sound = tr.surface;
  }

  // ---- free flight -------------------------------------------------------
  _stepFree(b, h) {
    const vel = b.vel, p = b.p;
    const sp = Math.hypot(vel.x, vel.y, vel.z);
    const wf = this.waters.length ? this._inWater(b) : 0;
    if (wf > 0) {
      // in a pool: buoyancy, added mass, water drag on the submerged part
      const kf = 1 + WATER.addedMass * WATER.ratio * wf;
      const dk = 1 - (BALL.drag + WATER.dragFull * Math.min(1, wf * 1.4)) * sp / kf * h;
      vel.x *= dk; vel.y = (vel.y - G * (1 - WATER.ratio * wf) / kf * h) * dk; vel.z *= dk;
    } else {
      const dk = 1 - BALL.drag * sp * h;
      vel.x *= dk; vel.y = (vel.y - G * h) * dk; vel.z *= dk;
    }
    p.x += vel.x * h; p.y += vel.y * h; p.z += vel.z * h;
    if (this.waters.length) this._basinWall(b);
    b.airTime += h;
    // static colliders
    const key = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)},${Math.floor(p.z / this.cell)}`;
    const cs = this.colliderGrid.get(key);
    if (cs) for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.test(p, CT)) this._resolveContact(b, c, CT);
      if (b.mode !== 'free') return;
    }
    // funnel surfaces
    for (let i = 0; i < this.surfaces.length; i++) {
      const s = this.surfaces[i];
      if (s.captureFree === false) continue;
      const dx = p.x - s.cx, dz = p.z - s.cz;
      const r = Math.hypot(dx, dz);
      if (r < s.rHole || r > s.rMax) continue;
      const y = s.hy(r);
      if (p.y > y + 0.002 || p.y < y - 0.1) continue;
      const sl = s.dhy(r), inv = 1 / Math.sqrt(1 + sl * sl);
      const nx = -sl * dx / r * inv, ny = inv, nz = -sl * dz / r * inv;
      const vn = vel.x * nx + vel.y * ny + vel.z * nz;
      p.y = y;
      if (vn < -(s.captureVn ?? 0.5)) {
        const e = s.e ?? 0.35;
        vel.x -= (1 + e) * vn * nx; vel.y -= (1 + e) * vn * ny; vel.z -= (1 + e) * vn * nz;
        this.sound(s.hitSound || 'clunk', -vn * 0.25, p);
      } else {
        this.toSurface(b, s);
        return;
      }
    }
    // landing on capture tracks
    this._tryCapture(b);
    if (b.mode !== 'free') return;
    // spin decays slowly in air
    if (b.airTime > 6 || p.y < -0.5) this._lost(b, 'airborne too long');
  }

  // A pool's basin is a bowl: once a ball is inside (below the top of its
  // wall) the wall turns it back.
  _basinWall(b) {
    const p = b.p, vel = b.vel;
    for (let i = 0; i < this.waters.length; i++) {
      const w = this.waters[i];
      const dx = p.x - w.cx, dz = p.z - w.cz, r = Math.hypot(dx, dz);
      if (b.basin !== w) {
        if (r <= w.r && p.y < w.wallTop && p.y > w.floorAt(r) - 0.01) b.basin = w;
        continue;
      }
      if (p.y >= w.wallTop || p.y < w.floorAt(Math.min(r, w.r)) - 0.01) { b.basin = null; continue; }
      if (r > w.r) {
        const ux = dx / r, uz = dz / r, vr = vel.x * ux + vel.z * uz;
        if (vr > 0) {
          vel.x -= (1 + w.wallE) * vr * ux; vel.z -= (1 + w.wallE) * vr * uz;
          if (vr > 0.3 && p.y > w.ySurf) this.sound('thud', velCurve(vr, 3) * 0.5, p);
        }
        p.x = w.cx + ux * (w.r - 0.001); p.z = w.cz + uz * (w.r - 0.001);
      }
    }
  }

  // Submerged volume fraction of a ball in any pool (0 = dry). Crossing the
  // surface on the way in makes a splash.
  _inWater(b) {
    const p = b.p;
    for (let i = 0; i < this.waters.length; i++) {
      const w = this.waters[i];
      const dx = p.x - w.cx, dz = p.z - w.cz, r2 = dx * dx + dz * dz;
      if (r2 > (w.r + 0.002) ** 2) continue;
      const d = w.ySurf - (p.y - R);                  // depth of the ball's lowest point
      if (d <= 0 || p.y < w.floorAt(Math.sqrt(r2)) - 0.01) { if (b.inWater === w) b.inWater = null; return 0; }
      if (b.inWater !== w) {
        b.inWater = w;
        const vin = -b.vel.y;
        if (vin > 0.05) {
          const at = { x: p.x, y: w.ySurf, z: p.z };
          this.sound('splash', velCurve(Math.hypot(vin, 0.5 * Math.hypot(b.vel.x, b.vel.z)), 2.5), at);
          this.info('splash', { ball: b.id, x: +p.x.toFixed(3), y: +w.ySurf.toFixed(3), z: +p.z.toFixed(3), v: +vin.toFixed(2), pool: w.name });
        }
      }
      const dd = Math.min(2 * R, d);
      return dd * dd * (3 * R - dd) / (4 * R * R * R);
    }
    if (b.inWater) b.inWater = null;
    return 0;
  }

  _resolveContact(b, c, ct) {
    const vel = b.vel, om = b.omega, p = b.p;
    const nx = ct.nx, ny = ct.ny, nz = ct.nz;
    // moving colliders (gong, bells) may report their surface velocity
    const cvx = ct.vx || 0, cvy = ct.vy || 0, cvz = ct.vz || 0;
    const rvx = vel.x - cvx, rvy = vel.y - cvy, rvz = vel.z - cvz;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    p.x += nx * ct.pen; p.y += ny * ct.pen; p.z += nz * ct.pen;
    if (vn >= 0) return;
    const e = -vn < 0.12 ? 0 : c.e;
    const jn = -(1 + e) * vn;
    // tangential slip at the contact point: v + omega x (-R n)
    const cx = rvx + (om.y * -nz - om.z * -ny) * R;
    const cy = rvy + (om.z * -nx - om.x * -nz) * R;
    const cz = rvz + (om.x * -ny - om.y * -nx) * R;
    const cn = cx * nx + cy * ny + cz * nz;
    let tx = cx - cn * nx, ty = cy - cn * ny, tz = cz - cn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl > 1e-6) {
      tx /= tl; ty /= tl; tz /= tl;
      const jt = Math.min(c.mu * jn, tl * 2 / 7);
      vel.x -= jt * tx; vel.y -= jt * ty; vel.z -= jt * tz;
      const k = 2.5 * jt / R; // omega += k (n x t)
      om.x += k * (ny * tz - nz * ty);
      om.y += k * (nz * tx - nx * tz);
      om.z += k * (nx * ty - ny * tx);
    }
    vel.x += jn * nx; vel.y += jn * ny; vel.z += jn * nz;
    const impact = -vn;
    if (impact > 0.04) {
      this.stats.bounces++;
      if (c.onHit) c.onHit(b, impact, this, ct);
      else if (c.instrument) this.sound(c.instrument, c.gain * velCurve(impact, c.vref), p, c.midi);
    }
  }

  _tryCapture(b) {
    const p = b.p;
    const cc = this.capCell;
    const ci = Math.floor(p.x / cc), cj = Math.floor(p.y / cc), ck = Math.floor(p.z / cc);
    let best = 0.012, bt = null, bi = -1; // 11 cm radius
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      const arr = this.captureGrid.get(`${i},${j},${k}`);
      if (!arr) continue;
      for (let q = 0; q < arr.length; q += 2) {
        const t = arr[q], idx = arr[q + 1];
        if (t === b.noCapture && this.t < b.noCaptureUntil) continue;
        const d2 = (t.P[3 * idx] - p.x) ** 2 + (t.P[3 * idx + 1] - p.y) ** 2 + (t.P[3 * idx + 2] - p.z) ** 2;
        if (d2 < best) { best = d2; bt = t; bi = idx; }
      }
    }
    if (!bt) return;
    const f = this.fr;
    bt.sample(bi * bt.ds, f);
    const dx = p.x - f.px, dy = p.y - f.py, dz = p.z - f.pz;
    const dn = dx * f.ux + dy * f.uy + dz * f.uz;
    const dl = dx * f.sx + dy * f.sy + dz * f.sz;
    const dt = dx * f.tx + dy * f.ty + dz * f.tz;
    const cap = bt.capture;
    if (dn > 0.001 || dn < -0.07 || Math.abs(dl) > cap.lat) return;
    const vel = b.vel;
    const vn = vel.x * f.ux + vel.y * f.uy + vel.z * f.uz;
    if (vn > 0.05) return; // moving away (came from below)
    const s = Math.min(Math.max(bi * bt.ds + dt, cap.s0), bt.L);
    if (-vn > (cap.bounceAbove ?? 0.4)) {
      // bounce on the rails, most of the lateral drift absorbed by the rail flanks
      const e = cap.e ?? 0.32;
      const vl = vel.x * f.sx + vel.y * f.sy + vel.z * f.sz;
      vel.x += -(1 + e) * vn * f.ux - 0.6 * vl * f.sx;
      vel.y += -(1 + e) * vn * f.uy - 0.6 * vl * f.sy;
      vel.z += -(1 + e) * vn * f.uz - 0.6 * vl * f.sz;
      // settle onto the track centre-line height
      p.x -= dn * f.ux + dl * 0.5 * f.sx; p.y -= dn * f.uy + dl * 0.5 * f.sy; p.z -= dn * f.uz + dl * 0.5 * f.sz;
      this.stats.bounces++;
      this.sound(cap.sound || (bt.kind === 'trough' ? 'thud' : 'clunk'), velCurve(-vn, 2.5) * 0.8, p);
      return;
    }
    // attach
    const vt = vel.x * f.tx + vel.y * f.ty + vel.z * f.tz;
    const spinW = -(b.omega.x * f.sx + b.omega.y * f.sy + b.omega.z * f.sz) * bt.d;
    this.stats.captures++;
    if (-vn > 0.08) this.sound(cap.sound || (bt.kind === 'trough' ? 'thud' : 'clunk'), velCurve(-vn, 2.5) * 0.6, p);
    b.mode = 'track'; b.track = bt; b.s = s; b.v = vt; b.w = spinW;
    b.airTime = 0;
    cap.onCapture?.(b, this);
    this._syncTrack(b);
  }

  // ---- surface (funnel) mode ---------------------------------------------
  _projectSurfaceVel(b, S) {
    const dx = b.p.x - S.cx, dz = b.p.z - S.cz;
    const r = Math.hypot(dx, dz) || 1e-6;
    const sl = S.dhy(r), inv = 1 / Math.sqrt(1 + sl * sl);
    const nx = -sl * dx / r * inv, ny = inv, nz = -sl * dz / r * inv;
    const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
    b.vel.x -= vn * nx; b.vel.y -= vn * ny; b.vel.z -= vn * nz;
    b.up.x = nx; b.up.y = ny; b.up.z = nz;
  }

  // A sphere rolling without slipping on a surface of revolution y = Y(r)
  // (Routh's problem). With meridian m, parallel t and normal n, the centre's
  // tangential acceleration is
  //   a_t = (F_t/m - mu_r N v^) / K + (k_r / K) R w_n (n x dn/dt),  K = k_t + k_r,
  // where k_r = 2/5 is the ball's rotational inertia factor and k_t is 1 (plus
  // the water's added mass in the pool). Rolling round a doubly curved surface
  // makes the ball spin about the normal, dw_n/dt = v_m v_t (k_t - k_m) / R,
  // and that drilling spin steers it. The motion is integrated in Lagrange's
  // form on (r, theta), so the ball stays exactly on the surface and energy is
  // lost only to rolling resistance, drag and the wall.
  _stepSurface(b, h) {
    const S = b.surf, p = b.p, vel = b.vel, g = S.g ?? G;
    let dx = p.x - S.cx, dz = p.z - S.cz;
    let r = Math.hypot(dx, dz) || 1e-6, th = Math.atan2(dz, dx);
    let c = dx / r, s = dz / r;
    let Y1 = S.dhy(r);
    const Y2 = S.d2hy(r);
    let lam = Math.sqrt(1 + Y1 * Y1);
    // velocity in the surface frame: m = (c, Y1, s)/lam, t = (-s, 0, c)
    const vm = (vel.x * c + vel.y * Y1 + vel.z * s) / lam;
    const vt = -vel.x * s + vel.z * c;
    let rd = vm / lam, thd = vt / r;
    const kt = S.kTrans ?? 1, kr = 0.4, K = kt + kr;
    const km = Y2 / (lam * lam * lam), kp = Y1 / (r * lam);          // principal curvatures
    const v = Math.hypot(vm, vt) || 1e-9;
    const N = kt * (km * vm * vm + kp * vt * vt) + g / lam;           // wall reaction per unit mass
    // applied tangential forces per unit mass: gravity, rolling resistance, drag
    let fm = -g * Y1 / lam, ft = 0;
    const loss = (S.mu * Math.max(0, N)) / v + BALL.drag * v;
    fm -= loss * vm; ft -= loss * vt;
    if (S.cw) {
      // under water: drag toward the pool's flow, a vortex round the drain
      // (clockwise from above for swirl > 0) drifting in toward the drain
      const ut = S.swirl * (1 - Math.exp(-(r * r) / (S.core * S.core))) / r, ui = S.inflowAt(r);
      const qm = -ui / lam - vm, qt = ut - vt, qn = ui * Y1 / lam, q = Math.hypot(qm, qt, qn);
      fm += S.cw * q * qm; ft += S.cw * q * qt;
    }
    const wn = b.wn || 0;
    fm = fm / K - (kr / K) * R * wn * kp * vt;
    ft = ft / K + (kr / K) * R * wn * km * vm;
    // drilling spin: driven by the curvature, worn down by pivoting friction
    b.wn = (wn + (vm * vt * (kp - km) / R) * h) * (1 - (S.pivot ?? 0.4) * h);
    // Lagrange's equations on (r, theta), semi-implicit Euler
    rd += ((lam * fm - Y1 * Y2 * rd * rd + r * thd * thd) / (lam * lam)) * h;
    thd += (ft / r - 2 * rd * thd / r) * h;
    r += rd * h; th += thd * h;
    // the rim: a wall the ball rolls along (the "wall of death")
    let onRim = false;
    if (r > S.rMax) {
      r = S.rMax;
      if (rd > 0) {
        if (rd > 0.35 && this.t - b.lastClick > 0.08) { b.lastClick = this.t; this.sound('clunk', rd * 0.25, p); }
        rd = -rd * S.rimE;
      }
      onRim = true;
      const nw = Math.max(0, r * thd * thd - g * S.dhy(r) / (1 + S.dhy(r) ** 2));
      const dv = (S.muWall * nw / K) * h;
      thd = Math.sign(thd) * Math.max(0, Math.abs(thd) - dv / r);
    }
    // back to world coordinates
    c = Math.cos(th); s = Math.sin(th);
    Y1 = S.dhy(r); lam = Math.sqrt(1 + Y1 * Y1);
    p.x = S.cx + r * c; p.z = S.cz + r * s; p.y = S.hy(r);
    vel.x = rd * c - r * thd * s; vel.y = rd * Y1; vel.z = rd * s + r * thd * c;
    const nx = -Y1 * c / lam, ny = 1 / lam, nz = -Y1 * s / lam;
    b.up.x = nx; b.up.y = ny; b.up.z = nz;
    // spin: rolling (n x v)/R plus the drilling spin about n
    const w = b.wn;
    b.omega.x = (ny * vel.z - nz * vel.y) / R + w * nx;
    b.omega.y = (nz * vel.x - nx * vel.z) / R + w * ny;
    b.omega.z = (nx * vel.y - ny * vel.x) / R + w * nz;
    b.orbitHz = Math.abs(thd) / (2 * Math.PI);
    b.fwd.x = vel.x; b.fwd.y = vel.y; b.fwd.z = vel.z;
    b.onRim = onRim;
    if (r < S.rHole + 0.002) S.onExit(b, this);
  }

  // ---- carried -------------------------------------------------------------
  _stepCarried(b, h) {
    const c = b.carrier;
    c.slotPos(b.slot, TMP);
    c.slotVel(b.slot, TMPV);
    if (b.settle < 1) {
      b.settle = Math.min(1, b.settle + h / b.settleTime);
      const f = smoothstep(b.settle);
      b.p.x = b.settleFrom.x + (TMP.x - b.settleFrom.x) * f;
      b.p.y = b.settleFrom.y + (TMP.y - b.settleFrom.y) * f;
      b.p.z = b.settleFrom.z + (TMP.z - b.settleFrom.z) * f;
    } else { b.p.x = TMP.x; b.p.y = TMP.y; b.p.z = TMP.z; }
    b.vel.x = TMPV.x; b.vel.y = TMPV.y; b.vel.z = TMPV.z;
    const d = 1 - 4 * h;
    b.omega.x *= d; b.omega.y *= d; b.omega.z *= d;
    b.sound = 'air';
  }

  // ---- ball/ball -------------------------------------------------------------
  _collideBalls(h) {
    const balls = this.balls, n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const dx = b.p.x - a.p.x;
        if (dx > TWO_R || dx < -TWO_R) continue;
        const dy = b.p.y - a.p.y;
        if (dy > TWO_R || dy < -TWO_R) continue;
        const dz = b.p.z - a.p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= TWO_R * TWO_R || d2 < 1e-12) continue;
        if (a.mode === 'carried' && b.mode === 'carried') continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const ia = invMass(a, nx, ny, nz), ib = invMass(b, nx, ny, nz);
        const it = ia + ib;
        if (it < 1e-6) continue;
        const va = a.vel.x * nx + a.vel.y * ny + a.vel.z * nz;
        const vb = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
        const rel = va - vb;
        if (rel > 0) {
          // gentle queue contacts are inelastic so lines of balls settle instead of rattling
          const e = rel > 0.3 ? BALL.e_ball : rel > 0.12 ? BALL.e_ball * (rel - 0.12) / 0.18 : 0;
          const J = (1 + e) * rel / it;
          applyImpulse(a, -J, nx, ny, nz);
          applyImpulse(b, J, nx, ny, nz);
          if (rel > 0.08 && this.t - a.lastClick > 0.12 && this.t - b.lastClick > 0.12) {
            a.lastClick = b.lastClick = this.t;
            this.sound('click', velCurve(rel, 1.5), { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2, z: (a.p.z + b.p.z) / 2 });
          }
        }
        const pen = TWO_R - d;
        if (pen > 0.0004) {
          const corr = pen - 0.0002;
          moveApart(a, -corr * ia / it, nx, ny, nz);
          moveApart(b, corr * ib / it, nx, ny, nz);
        }
      }
    }
    // keep track-mode positions consistent after corrections
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (b.mode === 'track' && b._moved) {
        b._moved = false;
        if (b.s > b.track.L) b.s = b.track.L - 1e-4;
        if (b.s < 0) b.s = 1e-4;
        this._syncTrack(b);
      }
    }
  }

  _lost(b, why) {
    this.stats.lost++;
    this.info('warn', { ball: b.id, why, at: { x: +b.p.x.toFixed(2), y: +b.p.y.toFixed(2), z: +b.p.z.toFixed(2) } });
    if (this.lostHandler) this.lostHandler(b, this);
  }
}

// contact scratch
const CT = { nx: 0, ny: 0, nz: 0, pen: 0, vx: 0, vy: 0, vz: 0, id: 0 };
const TMP = v3(), TMPV = v3();

export function velCurve(v, vref = 2) {
  // map impact speed (m/s) to 0..1 loudness with a soft knee
  const x = v / vref;
  return x / (1 + x) * 1.6;
}

function invMass(b, nx, ny, nz) {
  switch (b.mode) {
    case 'track': { const c = b.fwd.x * nx + b.fwd.y * ny + b.fwd.z * nz; return c * c; }
    case 'free': return 1;
    case 'surface': { const c = b.up.x * nx + b.up.y * ny + b.up.z * nz; return 1 - c * c; }
    default: return 0;
  }
}

function applyImpulse(b, J, nx, ny, nz) {
  switch (b.mode) {
    case 'track': {
      const c = b.fwd.x * nx + b.fwd.y * ny + b.fwd.z * nz;
      b.v += J * c; // translation only: spin catches up through rail friction
      b.vel.x = b.v * b.fwd.x; b.vel.y = b.v * b.fwd.y; b.vel.z = b.v * b.fwd.z;
      break;
    }
    case 'free': b.vel.x += J * nx; b.vel.y += J * ny; b.vel.z += J * nz; break;
    case 'surface': {
      const c = b.up.x * nx + b.up.y * ny + b.up.z * nz;
      const tx = nx - c * b.up.x, ty = ny - c * b.up.y, tz = nz - c * b.up.z;
      b.vel.x += J * tx; b.vel.y += J * ty; b.vel.z += J * tz;
      break;
    }
  }
}

function moveApart(b, d, nx, ny, nz) {
  switch (b.mode) {
    case 'track': {
      const c = b.fwd.x * nx + b.fwd.y * ny + b.fwd.z * nz;
      if (Math.abs(c) < 0.25) return;
      b.s += d / c;
      b._moved = true;
      break;
    }
    case 'free': case 'surface': b.p.x += d * nx; b.p.y += d * ny; b.p.z += d * nz; break;
  }
}
