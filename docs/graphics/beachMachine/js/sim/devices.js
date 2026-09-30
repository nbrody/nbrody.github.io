// Mechanisms that only the beach machine has (simulation side). Everything
// else — flip-flops, funnels, the whirlpool, the wheel, the tipping bucket, the
// bar runs — comes from the Glass House machine's engine.

import { G, smoothstep } from '../../../ballMachine/js/sim/math.js';
import { BALL } from '../../../ballMachine/js/sim/constants.js';
import { velCurve } from '../../../ballMachine/js/sim/world.js';
import { DiskCollider, CapsuleCollider } from '../../../ballMachine/js/sim/colliders.js';

const R = BALL.R;
const TAU = Math.PI * 2;

// --------------------------------------------------------------------------
// Spiral lift inside the palm trunk. A fixed helical track runs up the inside
// of the hollow trunk, and a slot carved through the bark follows it, so the
// balls can be seen climbing. A shaft down the middle carries vertical pusher
// bars: each bar sweeps a waiting ball off the end of the feed and pushes it
// round and up the helix. The helix starts and ends level (its pitch eases in
// and out over a quarter turn), and at the top the bar hands the ball on to the
// crown switches at the speed it was pushed.
//
// Plan convention as in path.js: angle phi counter-clockwise from east seen
// from above, so a point is (cx + r cos phi, y, cz - r sin phi) and the ball
// travels towards increasing phi.
export class SpiralLift {
  constructor(world, o) {
    this.kind = 'lift';
    this.style = 'spiral';
    this.world = world;
    Object.assign(this, { cx: o.cx, cz: o.cz, r: o.r, yLoad: o.yLoad, yRelease: o.yRelease });
    this.phiLoad = o.phiLoad ?? 0;
    this.span = TAU * o.turns;                 // helix angle from load to release (rad)
    this.bars = o.bars ?? 2;
    this.ease = o.ease ?? Math.PI / 2;
    this.speed = o.speed ?? 0.25;              // climbing speed on the steady part (m/s)
    this.baseSpeed = this.speed;
    this.releaseV = o.releaseV ?? null;
    // height profile: slope eases in and out, integrated into a table
    const n = 1024, Y = new Float64Array(n + 1), S = new Float64Array(n + 1), da = this.span / n;
    const slope = (a) => smoothstep(a / this.ease) * (1 - smoothstep((a - (this.span - this.ease)) / this.ease));
    for (let i = 0; i <= n; i++) {
      S[i] = slope(i * da);
      if (i) Y[i] = Y[i - 1] + 0.5 * (S[i - 1] + S[i]) * da;
    }
    this.kRise = (this.yRelease - this.yLoad) / Y[n];  // m of rise per radian on the steady part
    this._Y = Y; this._S = S; this._n = n; this._da = da;
    this.pitch = this.kRise * TAU;
    this.phase = 0;                            // angle the shaft has turned (rad)
    this.cargo = [];                           // [{ ball, a }]: a = angle climbed so far
    this.running = true;
    this.feed = null; this.exit = null;
    this.lifted = 0;
    // for the renderer and the sound
    this.yB = this.yLoad; this.yT = this.yRelease;
  }
  get omega() { return this.speed / this.kRise; }   // shaft rate (rad/s)
  get loadPoint() { return this.pointAt(0, {}); }
  get releasePoint() { return this.pointAt(this.span, {}); }
  heightAt(a) {
    const f = Math.min(this._n, Math.max(0, a / this._da)), i = Math.min(this._n - 1, Math.floor(f)), t = f - i;
    return this.yLoad + this.kRise * (this._Y[i] + (this._Y[i + 1] - this._Y[i]) * t);
  }
  slopeAt(a) {
    const f = Math.min(this._n, Math.max(0, a / this._da)), i = Math.min(this._n - 1, Math.floor(f)), t = f - i;
    return this.kRise * (this._S[i] + (this._S[i + 1] - this._S[i]) * t);
  }
  pointAt(a, o) {
    const phi = this.phiLoad + a;
    o.x = this.cx + this.r * Math.cos(phi); o.y = this.heightAt(a); o.z = this.cz - this.r * Math.sin(phi);
    return o;
  }
  // unit tangent of the helix at a (direction of travel)
  tangentAt(a, o) {
    const phi = this.phiLoad + a, dy = this.slopeAt(a);
    const tx = -this.r * Math.sin(phi), tz = -this.r * Math.cos(phi), l = Math.hypot(tx, dy, tz);
    o.x = tx / l; o.y = dy / l; o.z = tz / l;
    return o;
  }
  step(h, w) {
    if (!this.running || this.speed <= 0) return;
    const da = this.omega * h, gap = TAU / this.bars;
    const prev = this.phase;
    this.phase += da;
    // a bar sweeps past the end of the feed: take the ball waiting there
    if (Math.floor(this.phase / gap) > Math.floor(prev / gap)) {
      const b = this._waiting(w);
      if (b) {
        const e = { ball: b, a: 0 };
        this.cargo.push(e);
        w.carry(b, this, e, 0.08);
        this.lifted++; b.trips++;
        b.branch = null; b.lastDevice = 'lift';
        w.sound('cup', 0.4, b.p);
        w.info('lift', { ball: b.id });
      }
    }
    const v = this.omega * this.r;
    for (let k = this.cargo.length - 1; k >= 0; k--) {
      const e = this.cargo[k];
      e.a += da;
      const b = e.ball;
      if (e.a >= this.span) {
        this.cargo.splice(k, 1);
        w.placeOnTrack(b, this.exit, 0.001, this.releaseV ?? v);
        w.sound('clunk', 0.22, b.p);
        w.info('top', { ball: b.id });
        continue;
      }
      // rolling on the helix rails: omega = (up × T) v / d, d = R cos(contact angle)
      const phi = this.phiLoad + e.a, tx = -Math.sin(phi), tz = -Math.cos(phi);
      const wv = v / (R * Math.cos(BALL.contactAngle));
      b.omega.x = tz * wv; b.omega.y = 0; b.omega.z = -tx * wv;
    }
  }
  _waiting(w) {
    const f = this.feed;
    for (const b of w.balls) if (b.mode === 'track' && b.track === f && b.s > f.L - 0.025 && Math.abs(b.v) < 0.35) return b;
    return null;
  }
  slotPos(e, o) { return this.pointAt(e.a, o); }
  slotVel(e, o) {
    const phi = this.phiLoad + e.a, w = this.omega;
    o.x = -this.r * Math.sin(phi) * w; o.y = this.slopeAt(e.a) * w; o.z = -this.r * Math.cos(phi) * w;
    return o;
  }
  // angle of each pusher bar (for the renderer)
  barAngle(j) { return this.phiLoad + this.phase + j * TAU / this.bars; }
}

// --------------------------------------------------------------------------
// A steel pan (a Caribbean steel drum): a shallow hammered dish on a chrome
// skirt. A ball striking the playing face sounds its note.
export class SteelPan {
  constructor(world, o) {
    this.kind = 'pan';
    this.name = o.name || 'pan';
    this.center = o.center; this.normal = o.normal; this.r = o.r; this.midi = o.midi;
    this.depth = o.depth ?? 0.12;
    this.amp = 0; this.phase = 0;
    this.swing = 0; this.swingVel = 0;
    this.color = o.color ?? 0xd0d6dc;
    this.hang = o.hang ?? null;                 // hangs from a cord (steel band ladder) or stands (bass pans)
    this.collider = world.addCollider(new DiskCollider({
      center: o.center, normal: o.normal, r: o.r, halfThick: 0.004, e: o.e ?? 0.55, mu: 0.25, tag: 'pan',
      onHit: (b, v, w) => {
        const amp = velCurve(v, o.vref ?? 2);
        w.sound('pan', amp, this.center, this.midi);
        this.amp = Math.min(1, this.amp + amp); this.phase = 0;
        if (this.hang) this.swingVel += Math.min(1.2, v * 0.8);
        w.stats.notes++;
        w.info('pan', { ball: b.id, name: this.name });
      },
    }));
  }
  step(h) {
    this.amp *= 1 - 4 * h; this.phase += h;
    if (this.hang) {
      this.swingVel += (-(G / 0.14) * Math.sin(this.swing) - 1.4 * this.swingVel) * h;
      this.swing += this.swingVel * h;
    }
  }
}

// --------------------------------------------------------------------------
// A ship's bell hung from a gallows: the ball flies off the end of a chute and
// strikes its waist. It swings and rings.
export class ShipBell {
  constructor(world, o) {
    this.kind = 'shipbell';
    this.name = o.name || 'ship’s bell';
    this.hang = o.hang;                        // pivot at the crown of the bell
    this.midi = o.midi ?? 50;
    this.r = o.r ?? 0.15;                      // mouth radius
    this.hgt = o.height ?? 0.3;
    this.axis = o.axis ?? { x: 1, y: 0, z: 0 }; // swing axis (horizontal)
    this.swing = 0; this.swingVel = 0; this.ring = 0;
    const top = { x: this.hang.x, y: this.hang.y - 0.08, z: this.hang.z };
    const bot = { x: this.hang.x, y: this.hang.y - this.hgt + this.r * 0.75, z: this.hang.z };
    this.collider = world.addCollider(new CapsuleCollider({
      a: top, b: bot, r: this.r * 0.8, e: 0.35, mu: 0.2, tag: 'shipbell',
      onHit: (b, v, w) => {
        const amp = velCurve(v, 2);
        w.sound('bell', amp, { x: this.hang.x, y: this.hang.y - this.hgt * 0.6, z: this.hang.z }, this.midi);
        this.swingVel += Math.min(1.2, v * 0.45);
        this.ring = Math.min(1, this.ring + amp);
        w.stats.notes++;
        w.info('shipbell', { ball: b.id });
      },
    }));
  }
  step(h) {
    const L = 0.2;
    this.swingVel += (-(G / L) * Math.sin(this.swing) - 0.9 * this.swingVel) * h;
    this.swing += this.swingVel * h;
    this.ring *= 1 - 0.3 * h;
  }
}
