// fusion.js — Chapter 1, 84–112 s: inside a stellar core.
//
// A small simulation of the proton–proton chain and the triple-alpha process:
//   p + p   → ²H  + e⁺ + ν        (positron and neutrino fly off)
//   ²H + p  → ³He + γ             (a gamma-ray photon)
//   ³He + ³He → ⁴He + 2p
//   3 ⁴He   → ¹²C + γ             (the triple-alpha process)
//   ¹²C + ⁴He → ¹⁶O + γ
// Early reactions are random, like real thermal collisions. Over the beat
// they lock to the shared tempo until the core beats like a heart — the
// rhythm the music picks up. Stateful, so seek() fast-forwards it.

import { SHAPE } from '../../gfx/renderer.js';
import { RNG, TAU, clamp, smoothstep, lerp } from '../../lib/math.js';
import { NUCLEI, PROTON, NEUTRON } from '../common/elements.js';

const MASS = { p: 1, D: 2, He3: 3, He4: 4, C12: 12, O16: 16 };
const FLASH = {
  D: [[0.8, 0.95, 1.0], 0.9],
  He3: [[1.0, 0.95, 0.8], 1.2],
  He4: [[1.0, 0.8, 0.4], 2.2],
  C12: [[1.0, 0.7, 0.35], 3.2],
  O16: [[1.0, 0.45, 0.4], 3.2],
};

export const CORE_START = 84;

export class FusionCore {
  constructor() {
    this.reset();
  }

  reset() {
    const rng = (this.rng = new RNG(99));
    this.n = [];
    this.fx = [];
    this.lastBeat = null;
    this.clock = 0;
    for (let i = 0; i < 230; i++) this._spawn(i < 205 ? 'p' : i < 224 ? 'He4' : 'D', rng.disk(), 0.9);
  }

  _spawn(kind, [x, y], rMax = 1) {
    const rng = this.rng;
    const sp = 0.16 / Math.sqrt(MASS[kind]);
    const nuc = {
      kind, x: x * rMax, y: y * rMax,
      vx: rng.gauss() * sp, vy: rng.gauss() * sp,
      rot: rng.range(0, TAU), spin: rng.gauss() * 1.5,
      born: this.clock, merge: null,
    };
    this.n.push(nuc);
    return nuc;
  }

  /** Advance the simulation. T = chapter time, show = show time. */
  step(dt, T, show, tempo) {
    if (dt <= 0) return;
    const rng = this.rng;
    this.clock += dt;
    const lock = smoothstep(90, 100, T);
    const heart = tempo.heart(show) * (0.35 + 0.65 * lock);

    // thermal motion, a soft wall, and a squeeze on every heartbeat
    for (const a of this.n) {
      if (a.merge) continue;
      const m = MASS[a.kind];
      const kick = 0.34 / Math.sqrt(m);
      a.vx += rng.gauss() * kick * Math.sqrt(dt);
      a.vy += rng.gauss() * kick * Math.sqrt(dt);
      const r = Math.hypot(a.x, a.y);
      if (r > 0.92) { a.vx -= (a.x / r) * (r - 0.92) * 6 * dt; a.vy -= (a.y / r) * (r - 0.92) * 6 * dt; }
      a.vx -= a.x * heart * 1.6 * dt;
      a.vy -= a.y * heart * 1.6 * dt;
      const damp = Math.exp(-dt * 0.8);
      a.vx *= damp; a.vy *= damp;
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.rot += a.spin * dt;
    }

    // merging pairs rush together
    for (const a of this.n) {
      if (!a.merge) continue;
      const g = a.merge;
      const u = clamp((this.clock - g.t0) / g.dur);
      const e = u * u * (3 - 2 * u);
      a.x = lerp(g.x0, g.mx, e); a.y = lerp(g.y0, g.my, e);
      a.rot += a.spin * dt * 3;
    }
    const done = new Set();
    for (const a of this.n) if (a.merge && this.clock >= a.merge.t0 + a.merge.dur) done.add(a.merge.group);
    for (const g of done) this._fuse(g);

    // schedule reactions: random at first, then on the beat
    const randomRate = (1 - lock) * 2.4 + 0.3;
    if (rng.next() < randomRate * dt) this._react(0.4, T);
    const lead = 0.32;
    const beat = Math.floor(tempo.beats(show + lead));
    if (this.lastBeat === null) this.lastBeat = beat;
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      if (lock > 0.05) {
        const k = 1 + Math.floor(lock * 2.6 + (T > 99 ? 1 : 0));
        for (let i = 0; i < k; i++) this._react(lead, T, true);
      }
    }
    // helium ash accumulates (time-lapse): keep the forge supplied
    if (T > 96 && T < 104 && rng.next() < dt * 5) {
      const ang = rng.range(0, TAU);
      const nuc = this._spawn('He4', [Math.cos(ang), Math.sin(ang)], 0.9);
      nuc.vx -= Math.cos(ang) * 0.1; nuc.vy -= Math.sin(ang) * 0.1;
    }
    // protons replenish so the chain never starves
    const pc = this.n.reduce((s, a) => s + (a.kind === 'p' ? 1 : 0), 0);
    if (pc < 150 && rng.next() < dt * 6) this._spawn('p', rng.disk(), 0.95);

    // effects
    for (const f of this.fx) { f.x += f.vx * dt; f.y += f.vy * dt; }
    this.fx = this.fx.filter((f) => this.clock - f.t0 < f.life);
  }

  /** Pick a reaction that is possible right now and start it. */
  _react(dur, T, onBeat = false) {
    const free = this.n.filter((a) => !a.merge);
    const by = (k) => free.filter((a) => a.kind === k);
    const rng = this.rng;
    const nearest = (a, list, maxD) => {
      let best = null, bd = maxD * maxD;
      for (const b of list) {
        if (b === a) continue;
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    };
    const options = [];
    if (T > 98) {
      const he = by('He4');
      if (he.length >= 3 && rng.next() < 0.6) options.push(() => {
        const a = rng.pick(he);
        const b = nearest(a, he, 0.6), c = b && nearest(b, he.filter((x) => x !== a), 0.6);
        return b && c ? [a, b, c] : null;
      });
      const cs = by('C12');
      if (cs.length && he.length && rng.next() < 0.5) options.push(() => {
        const a = rng.pick(cs), b = nearest(a, he, 0.7);
        return b ? [a, b] : null;
      });
    }
    const h3 = by('He3');
    if (h3.length >= 2 && (onBeat ? rng.next() < 0.7 : rng.next() < 0.4)) options.push(() => {
      const a = rng.pick(h3), b = nearest(a, h3, 0.9);
      return b ? [a, b] : null;
    });
    const ps = by('p'), ds = by('D');
    if (ds.length && ps.length) options.push(() => {
      const a = rng.pick(ds), b = nearest(a, ps, 0.4);
      return b ? [a, b] : null;
    });
    if (ps.length >= 2) options.push(() => {
      const a = rng.pick(ps), b = nearest(a, ps, 0.3);
      return b ? [a, b] : null;
    });
    for (const opt of options) {
      const g = opt();
      if (!g) continue;
      const mx = g.reduce((s, a) => s + a.x, 0) / g.length, my = g.reduce((s, a) => s + a.y, 0) / g.length;
      const group = { members: g, mx, my };
      for (const a of g) a.merge = { group, t0: this.clock, dur, x0: a.x, y0: a.y, mx, my };
      return;
    }
  }

  _fuse(group) {
    const rng = this.rng;
    const g = group.members;
    const kinds = g.map((a) => a.kind).sort().join('+');
    let product = null, emits = [];
    if (kinds === 'p+p') { product = 'D'; emits = ['e+', 'nu']; }
    else if (kinds === 'D+p') { product = 'He3'; emits = ['gamma']; }
    else if (kinds === 'He3+He3') { product = 'He4'; emits = ['p', 'p']; }
    else if (kinds === 'He4+He4+He4') { product = 'C12'; emits = ['gamma']; }
    else if (kinds === 'C12+He4') { product = 'O16'; emits = ['gamma']; }
    this.n = this.n.filter((a) => !g.includes(a));
    if (!product) return;
    const vx = g.reduce((s, a) => s + a.vx * MASS[a.kind], 0) / g.reduce((s, a) => s + MASS[a.kind], 0);
    const vy = g.reduce((s, a) => s + a.vy * MASS[a.kind], 0) / g.reduce((s, a) => s + MASS[a.kind], 0);
    const nuc = this._spawn(product, [group.mx, group.my], 1);
    nuc.vx = vx; nuc.vy = vy;
    const [fc, fi] = FLASH[product];
    const t0 = this.clock;
    this.fx.push({ type: 'flash', x: group.mx, y: group.my, vx: 0, vy: 0, t0, life: 0.45, c: fc, i: fi });
    this.fx.push({ type: 'ring', x: group.mx, y: group.my, vx: 0, vy: 0, t0, life: 0.6, c: fc, i: fi * 0.5 });
    for (const e of emits) {
      const ang = rng.range(0, TAU), c = Math.cos(ang), s = Math.sin(ang);
      if (e === 'gamma') this.fx.push({ type: 'gamma', x: group.mx, y: group.my, vx: c * 2.4, vy: s * 2.4, t0, life: 0.8 });
      else if (e === 'nu') this.fx.push({ type: 'nu', x: group.mx, y: group.my, vx: c * 5, vy: s * 5, t0, life: 0.5 });
      else if (e === 'e+') this.fx.push({ type: 'pos', x: group.mx, y: group.my, vx: c * 0.7, vy: s * 0.7, t0, life: 0.35 });
      else if (e === 'p') {
        const p = this._spawn('p', [group.mx + c * 0.02, group.my + s * 0.02], 1);
        p.vx = vx + c * 0.45; p.vy = vy + s * 0.45;
      }
    }
  }

  /** Draw nuclei and effects centred at (cx, cy) with arena radius Rpx. */
  draw(R, { cx, cy, Rpx, alpha, heart }) {
    if (alpha <= 0.001) return;
    const S = R.sprites, L = R.lines;
    const nr = Math.max(1.5, Rpx * 0.019);
    const now = this.clock;
    // nuclei: glow halo, then lit nucleons
    for (const a of this.n) {
      const x = cx + a.x * Rpx, y = cy + a.y * Rpx;
      const age = now - a.born;
      const heavy = MASS[a.kind] >= 4;
      const halo = heavy ? [1.0, 0.75, 0.4] : [1.0, 0.45, 0.3];
      S.add(x, y, nr * (2.6 + Math.cbrt(MASS[a.kind]) * 1.4), halo, alpha * (0.16 + 0.1 * heart) * (1 + 2 * Math.exp(-age * 5)), SHAPE.glow);
    }
    S.flush('add');
    for (const a of this.n) {
      const x = cx + a.x * Rpx, y = cy + a.y * Rpx;
      const parts = NUCLEI[a.kind].parts;
      const c = Math.cos(a.rot), s = Math.sin(a.rot);
      const sorted = parts.map(([t, px, py, pz]) => [t, px * c - pz * s, py, px * s + pz * c]).sort((u, v) => u[3] - v[3]);
      for (const [t, px, py, pz] of sorted) {
        const col = t === 'P' ? PROTON : NEUTRON;
        const k = 0.75 + 0.25 * (pz + 1) * 0.5;
        S.add(x + px * nr * 1.05, y + py * nr * 1.05, nr, [col[0] * k * 1.3, col[1] * k * 1.3, col[2] * k * 1.3], alpha, SHAPE.sphere, 0.5, 0.6);
      }
    }
    S.flush('over');
    // effects
    for (const f of this.fx) {
      const u = (now - f.t0) / f.life;
      const x = cx + f.x * Rpx, y = cy + f.y * Rpx;
      if (f.type === 'flash') {
        S.add(x, y, nr * (4 + 10 * u), f.c, alpha * f.i * 3 * (1 - u) ** 2, SHAPE.glow);
        S.add(x, y, nr * 14 * (0.4 + u), f.c, alpha * f.i * 0.5 * (1 - u) ** 2, SHAPE.flare, 0.7);
      } else if (f.type === 'ring') {
        S.add(x, y, nr * (3 + 26 * Math.sqrt(u)), f.c, alpha * f.i * (1 - u) ** 2, SHAPE.ring, 0.06);
      } else if (f.type === 'gamma') {
        const tail = 0.14;
        const tx = cx + (f.x - f.vx * tail) * Rpx, ty = cy + (f.y - f.vy * tail) * Rpx;
        L.add(tx, ty, x, y, 2.2, [1, 0.9, 0.6], 0, [1.6, 1.5, 1.2], alpha * (1 - u) * 2.5, 1);
        S.add(x, y, 7, [1, 0.95, 0.8], alpha * (1 - u) * 2.2, SHAPE.glow);
      } else if (f.type === 'nu') {
        const tail = 0.12;
        const tx = cx + (f.x - f.vx * tail) * Rpx, ty = cy + (f.y - f.vy * tail) * Rpx;
        L.add(tx, ty, x, y, 0.7, [0.6, 0.5, 1.0], 0, [0.8, 0.7, 1.2], alpha * (1 - u) * 1.2, 0);
      } else if (f.type === 'pos') {
        S.add(x, y, 4, [0.5, 0.95, 1.2], alpha * (1 - u) * 2.5, SHAPE.glow);
        if (u > 0.85) S.add(x, y, 12, [1, 1, 1], alpha * 2 * (u - 0.85) / 0.15, SHAPE.glow);
      }
    }
    L.flush('add');
    S.flush('add');
  }
}
