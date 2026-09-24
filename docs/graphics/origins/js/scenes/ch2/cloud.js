// cloud.js — Chapter 2, 0–38 s: supernova debris cools into a molecular
// cloud, and atoms start to bond.
//
// Each atom has bonding "slots" at its real valence geometry: water bends
// at 104.5°, ammonia is a 107° pyramid, methane a tetrahedron. A molecule
// is a rigid body (a root atom plus attached atoms at slot positions) that
// tumbles as it drifts. Bonding events are scheduled so the story reads —
// hydrogen pairs up first, then water, methane, ammonia, carbon monoxide —
// but each one happens between real neighbours in the simulation. Helium
// and neon never bond: noble gases.

import { SHAPE } from '../../gfx/renderer.js';
import { RNG, TAU, clamp, smoothstep, ease, lerp } from '../../lib/math.js';
import { colorOf, ATOM_R } from './molecules.js';

const n3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const SLOTS = {
  H: [[1, 0, 0]],
  O: [[Math.cos(0.912), Math.sin(0.912), 0], [Math.cos(0.912), -Math.sin(0.912), 0]],
  N: [0, 1, 2].map((k) => { const th = 1.2, ph = (k * TAU) / 3; return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), -Math.cos(th)]; }),
  C: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(n3),
};
const BOND = { OH: 0.96, CH: 1.09, NH: 1.01, HH: 0.74, CO: 1.13 };
const MIX = [['H', 0.62], ['He', 0.08], ['O', 0.11], ['C', 0.08], ['N', 0.06], ['Ne', 0.02], ['Si', 0.015], ['Fe', 0.015]];

function rotate(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
/** Rotate matrix m by angle about unit axis (in place). */
function spin(m, ax, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c, [x, y, z] = ax;
  const r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
             t * x * y + s * z, t * y * y + c, t * y * z - s * x,
             t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  const o = m.slice();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = r[i * 3] * o[j] + r[i * 3 + 1] * o[3 + j] + r[i * 3 + 2] * o[6 + j];
}

export class MolecularCloud {
  constructor() {
    this.reset();
  }

  reset() {
    const rng = (this.rng = new RNG(2024));
    this.box = [110, 62, 50];   // half-extents, Å
    this.atoms = [];
    this.mols = [];
    this.fx = [];
    this.clock = 0;
    this.nextEvent = 11.5;
    for (let i = 0; i < 1400; i++) {
      let u = rng.next(), el = 'H';
      for (const [s, w] of MIX) { if (u < w) { el = s; break; } u -= w; }
      const d = rng.dir3(), sp = 10 + 8 * rng.next();
      this.atoms.push({
        el, p: [rng.range(-1, 1) * this.box[0], rng.range(-1, 1) * this.box[1], rng.range(-1, 1) * this.box[2]],
        v: [d[0] * sp, d[1] * sp, d[2] * sp * 0.5], mol: null, busy: false, tw: rng.next() * TAU,
      });
    }
  }

  _free(el) { return this.atoms.filter((a) => a.el === el && !a.mol && !a.busy); }

  _nearest(a, list, maxD) {
    let best = null, bd = maxD * maxD;
    for (const b of list) {
      if (b === a) continue;
      const d = (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Visible-region test for choosing where to stage events (camera half-extent in Å). */
  _inView(a, hw, hh) { return Math.abs(a.p[0]) < hw * 0.8 && Math.abs(a.p[1]) < hh * 0.8; }

  _molOf(root) {
    if (root.mol) return root.mol;
    const m = { root, members: [], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], ax: this.rng.dir3(), w: this.rng.range(0.4, 1.2), kind: root.el };
    root.mol = m;
    this.mols.push(m);
    return m;
  }

  /** Start one bonding event: partner flies to a free slot on root. */
  _capture(root, partner, len, dur = 0.7) {
    const m = this._molOf(root);
    const slot = m.members.length + this.fx.filter((f) => f.kind === 'capture' && f.m === m && !f.done).length;
    partner.busy = true;
    this.fx.push({ kind: 'capture', m, partner, slot, len, t0: this.clock, dur, from: partner.p.slice() });
  }

  _schedule(T, hw, hh) {
    const rng = this.rng;
    const inView = (a) => this._inView(a, hw, hh);
    const Hs = this._free('H').filter(inView);
    const pick = (list) => list.length ? rng.pick(list) : null;
    const r = rng.next();
    const late = smoothstep(15, 22, T);
    // centres that still have open slots
    const open = (el) => this.atoms.filter((a) => a.el === el && !a.busy && inView(a) &&
      (!a.mol || (a.mol.root === a && a.mol.kind === el && a.mol.members.length + a.mol.pending < SLOTS[el].length)));
    for (const a of this.atoms) if (a.mol) a.mol.pending = this.fx.filter((f) => f.kind === 'capture' && f.m === a.mol).length;
    if (r < 0.55 * (1 - late) + 0.18) {
      const a = pick(Hs), b = a && this._nearest(a, Hs, 16);
      if (a && b) { this._capture(a, b, BOND.HH); a.busy = true; }
      return;
    }
    const centerEl = rng.pick(['O', 'O', 'C', 'N', 'O', 'C']);
    const cs = open(centerEl);
    const c = pick(cs);
    if (!c) return;
    if (centerEl === 'C' && !c.mol && rng.next() < 0.18) {
      const o = this._nearest(c, this._free('O').filter(inView), 22);
      if (o) { this._capture(c, o, BOND.CO); this._molOf(c).kind = 'CO'; }
      return;
    }
    const h = this._nearest(c, Hs, 22);
    if (h) this._capture(c, h, centerEl === 'O' ? BOND.OH : centerEl === 'N' ? BOND.NH : BOND.CH);
  }

  step(dt, T, hw, hh) {
    if (dt <= 0) return;
    this.clock += dt;
    const rng = this.rng;
    const cool = lerp(1, 0.22, smoothstep(0, 12, T));
    const [bx, by, bz] = this.box;
    // free atoms and molecule roots drift; a little Brownian jitter
    for (const a of this.atoms) {
      if (a.mol && a.mol.root !== a) continue;
      if (a.busy && !a.mol) continue;
      const damp = Math.exp(-dt * 0.4);
      for (let k = 0; k < 3; k++) {
        a.v[k] = a.v[k] * damp + rng.gauss() * 6 * cool * Math.sqrt(dt);
        const target = (k === 2 ? 5 : 12) * cool;
        const sp = Math.hypot(a.v[0], a.v[1], a.v[2]) || 1;
        if (sp > target * 2) a.v[k] *= 0.98;
        a.p[k] += a.v[k] * dt;
      }
      if (a.p[0] > bx) a.p[0] -= 2 * bx; else if (a.p[0] < -bx) a.p[0] += 2 * bx;
      if (a.p[1] > by) a.p[1] -= 2 * by; else if (a.p[1] < -by) a.p[1] += 2 * by;
      if (a.p[2] > bz) a.p[2] -= 2 * bz; else if (a.p[2] < -bz) a.p[2] += 2 * bz;
    }
    // molecules tumble; members sit on their slots
    for (const m of this.mols) {
      spin(m.R, m.ax, m.w * dt);
      this._placeMembers(m);
    }
    // captures in flight
    for (const f of this.fx) {
      if (f.kind !== 'capture') continue;
      const u = clamp((this.clock - f.t0) / f.dur);
      const tgt = this._slotPos(f.m, f.slot, f.len);
      const e = ease.inOutCubic(u);
      for (let k = 0; k < 3; k++) f.partner.p[k] = lerp(f.from[k], tgt[k], e);
      if (u >= 1) {
        f.done = true;
        f.partner.busy = false;
        f.partner.mol = f.m;
        f.m.members.push({ atom: f.partner, len: f.len, slot: f.slot });
        f.m.root.busy = false;
        const full = f.m.kind === 'CO' || f.m.members.length >= (SLOTS[f.m.root.el] || [1]).length;
        this.fx.push({ kind: 'flash', p: tgt, t0: this.clock, dur: full ? 0.9 : 0.5, big: full });
      }
    }
    this.fx = this.fx.filter((f) => !f.done && !(f.kind === 'flash' && this.clock - f.t0 > f.dur));
    // schedule new bonds, faster as the cloud settles
    if (T > 11.5 && T < 36) {
      const rate = lerp(3, 9, smoothstep(12, 24, T));
      while (this.nextEvent < T) {
        this._schedule(T, hw, hh);
        this.nextEvent += (0.5 + rng.next()) / rate;
      }
    } else {
      this.nextEvent = Math.max(this.nextEvent, T);
    }
  }

  _slotPos(m, slot, len) {
    const el = m.root.el;
    const dirs = m.kind === 'CO' ? [[1, 0, 0]] : SLOTS[el] || SLOTS.H;
    const d = rotate(m.R, dirs[Math.min(slot, dirs.length - 1)]);
    return [m.root.p[0] + d[0] * len, m.root.p[1] + d[1] * len, m.root.p[2] + d[2] * len];
  }

  _placeMembers(m) {
    for (const mb of m.members) mb.atom.p = this._slotPos(m, mb.slot, mb.len);
  }

  /** Fast-forward from scratch to chapter time T. */
  seekTo(T, hwAt) {
    this.reset();
    const dt = 1 / 30;
    for (let t = 0; t < Math.min(T, 38); t += dt) {
      const [hw, hh] = hwAt(t);
      this.step(dt, t, hw, hh);
    }
  }

  /**
   * Draw atoms and bonds. cam = { zoom (px per Å), cx, cy, persp }.
   */
  draw(R, cam, alpha) {
    if (alpha <= 0.001) return;
    const S = R.sprites, L = R.lines;
    const W = R.W, H = R.H;
    const pts = [];
    const proj = (p) => {
      const k = 1 / (1 - p[2] * cam.persp);
      return [cam.cx + p[0] * cam.zoom * k, cam.cy - p[1] * cam.zoom * k, k];
    };
    for (const a of this.atoms) {
      const [x, y, k] = proj(a.p);
      const r = ATOM_R[a.el] ? ATOM_R[a.el] : 0.55;
      const rad = r * cam.zoom * k * 0.9;
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      pts.push({ a, x, y, k, rad, z: a.p[2] });
    }
    // bonds
    for (const m of this.mols) {
      const rp = proj(m.root.p);
      for (const mb of m.members) {
        const q = proj(mb.atom.p);
        if ((rp[0] < -40 || rp[0] > W + 40) && (q[0] < -40 || q[0] > W + 40)) continue;
        const c0 = colorOf(m.root.el), c1 = colorOf(mb.atom.el);
        const w = Math.max(0.7, 0.12 * cam.zoom * rp[2]);
        L.add(rp[0], rp[1], q[0], q[1], w * 3, [0.6, 0.8, 1], alpha * 0.18, [0.6, 0.8, 1], alpha * 0.18, 1);
        const mx = (rp[0] + q[0]) / 2, my = (rp[1] + q[1]) / 2;
        L.add(rp[0], rp[1], mx, my, w, c0, alpha, c0, alpha, 0);
        L.add(mx, my, q[0], q[1], w, c1, alpha, c1, alpha, 0);
      }
    }
    L.flush('add');
    pts.sort((p, q) => p.z - q.z);
    for (const p of pts) {
      const c = colorOf(p.a.el);
      const noble = p.a.el === 'He' || p.a.el === 'Ne';
      S.add(p.x, p.y, p.rad * (noble ? 3.4 : 2.6), c, alpha * (noble ? 0.35 : 0.22), SHAPE.glow);
    }
    S.flush('add');
    for (const p of pts) {
      const c = colorOf(p.a.el);
      S.add(p.x, p.y, p.rad, [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15], alpha, SHAPE.sphere, 0.55, 0.5);
    }
    S.flush('over');
    // bond flashes
    for (const f of this.fx) {
      if (f.kind !== 'flash') continue;
      const u = (this.clock - f.t0) / f.dur;
      const [x, y, k] = proj(f.p);
      const s = cam.zoom * k;
      S.add(x, y, s * (f.big ? 1.2 + 3.5 * u : 0.8 + 1.5 * u), [1, 0.95, 0.85], alpha * (1 - u) * (f.big ? 1.3 : 0.8), SHAPE.ring, 0.1);
      S.add(x, y, s * 1.2, [1, 0.95, 0.85], alpha * (1 - u) ** 2 * (f.big ? 1.2 : 0.6), SHAPE.glow);
    }
    S.flush('add');
  }

  /** How many of each molecule exist (for the HUD / captions). */
  census() {
    const c = {};
    for (const m of this.mols) {
      const key = m.kind === 'CO' ? 'CO' : `${m.root.el}${m.members.length}`;
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }
}
