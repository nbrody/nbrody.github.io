// lasers.js — optional laser package, in the spirit of the Disco Biscuits' audience-scanning
// full-colour lasers run alongside the moving heads.
//
// Six projectors: two upstage corners, one upstage centre, two downstage wings and
// one at front of house. Each frame the chosen pattern writes a list of beams
// (origin, direction, colour × intensity). Beams are razor-thin, don't spread, stop
// on the deck or the floor, and otherwise run out into the haze. Pure: no DOM or three.js.

import { DECK_Y, DECK_FRONT, DECK_BACK, DECK_HALF, hash } from './layout.js';
import { hs2rgb, hexHS } from './engine.js';

export const MAX_BEAMS = 360;
const TAU = Math.PI * 2, DEG = Math.PI / 180;

// origin, base yaw (deg, 0 = toward the audience), base pitch (deg, + = up)
export const PROJECTORS = [
  { id: 'UL', pos: [-9.2, DECK_Y + 0.35, -9.9], yaw: 12, pitch: 4 },
  { id: 'UR', pos: [9.2, DECK_Y + 0.35, -9.9], yaw: -12, pitch: 4 },
  { id: 'UC', pos: [0, DECK_Y + 0.35, -10.1], yaw: 0, pitch: 5 },
  { id: 'WL', pos: [-11.2, DECK_Y + 0.35, 2.6], yaw: 55, pitch: 2 },
  { id: 'WR', pos: [11.2, DECK_Y + 0.35, 2.6], yaw: -55, pitch: 2 },
  { id: 'FOH', pos: [0, 3.2, 29], yaw: 180, pitch: 4 },
];

export const PATTERNS = {
  fan: 'Fans',
  sweep: 'Sweeping fans',
  sky: 'Liquid sky (sheet over the crowd)',
  tunnel: 'Tunnel (spinning cone)',
  burst: 'Starburst',
  chase: 'Beam chase (jumps on the beat)',
  cross: 'Crossfire (wings + front of house)',
  auto: 'Follow the show (changes by section)',
};
export const LASER_COLORS = {
  rgb: 'Full-colour, rotating',
  rainbow: 'Rainbow across each fan',
  green: 'Classic green',
  follow: 'Follow the rig’s colour',
  fixed: 'One colour',
};
const AUTO = ['fan', 'sky', 'sweep', 'tunnel', 'chase', 'cross', 'burst', 'sky'];

export class Lasers {
  constructor(engine) {
    this.e = engine;
    this.on = false;
    this.opts = { pattern: 'fan', color: 'rgb', fixed: '#00ff40', level: 0.8, count: 16, spread: 60, speed: 8, height: 0, chop: false, notes: true };
    this.origin = new Float32Array(MAX_BEAMS * 3);
    this.end = new Float32Array(MAX_BEAMS * 3);
    this.color = new Float32Array(MAX_BEAMS * 3);
    this.hit = new Uint8Array(MAX_BEAMS);
    this.count = 0;
    this.phase = 0;
    this.pattern = 'fan';
    this.tmp = { r: 0, g: 0, b: 0 };
  }

  /** The dominant colour the rig is playing right now (for 'follow'): the brightest head's hue. */
  rigColor() {
    let best = null, bi = 0.05;
    for (const R of this.e.render) if (R.I > bi) { bi = R.I; best = R; }
    if (!best) return [0, 1, 0.3];
    const m = Math.max(best.r, best.g, best.b) || 1;
    return [best.r / m, best.g / m, best.b / m];
  }

  /** Master level from the show: bright looks get more laser. */
  showEnergy() {
    let s = 0;
    for (const R of this.e.render) s += R.I;
    return Math.min(1, s / 30);
  }

  update(dt) {
    this.count = 0;
    const E = this.e, o = this.opts;
    if (!this.on) return;
    this.phase += (dt * E.bpm * E.speed) / 60 / Math.max(0.5, o.speed);
    const beat = E.beat, t = this.phase;

    let pattern = o.pattern;
    if (pattern === 'auto') {
      const k = E.show ? E.sectionIndex + (E.shows.indexOf(E.show) * 3) : Math.floor(beat / 32);
      pattern = AUTO[((k % AUTO.length) + AUTO.length) % AUTO.length];
    }
    this.pattern = pattern;

    // master: laser level × grand × blackout × (show energy when following) × chop × note pulse
    const m = E.m;
    let level = o.level * (m.blackout ? 0 : m.grand * (m.dip ?? 1)) * (0.35 + 0.65 * Math.min(1, m.haze));
    if (o.pattern === 'auto') level *= 0.25 + 0.75 * this.showEnergy();
    if (o.chop) level *= beat - Math.floor(beat) < 0.5 ? 1 : 0;
    if (m.flash) level = Math.max(level, o.level);
    const NL = E.noteLayer;
    if (o.notes && NL?.on) {
      let n = 0;
      for (let i = 0; i < NL.I.length; i++) n = Math.max(n, NL.I[i]);
      level *= 0.1 + 0.9 * n;
    }
    if (level < 0.003) return;

    const base = this.rigColor();
    const color = (k, j, n) => {
      const c = this.tmp;
      switch (o.color) {
        case 'green': c.r = 0.05; c.g = 1; c.b = 0.15; break;
        case 'follow': c.r = base[0]; c.g = base[1]; c.b = base[2]; break;
        case 'fixed': hs2rgb(...hexHS(o.fixed), c); break;
        case 'rainbow': hs2rgb((j / Math.max(1, n)) * 300 + t * 20, 1, c); break;
        default: hs2rgb(k * 60 + t * 25, 1, c);
      }
      return c;
    };
    const add = (P, yaw, pitch, c, gain = 1) => {
      if (this.count >= MAX_BEAMS) return;
      const y = (P.yaw + yaw) * DEG, p = (P.pitch + pitch + o.height) * DEG;
      const dx = Math.sin(y) * Math.cos(p), dy = Math.sin(p), dz = Math.cos(y) * Math.cos(p);
      this.push(P.pos, dx, dy, dz, c, level * gain);
    };
    const n = Math.max(1, Math.round(o.count)), spread = o.spread;

    switch (pattern) {
      case 'fan': case 'sweep': {
        [0, 1, 2].forEach((k) => {
          const P = PROJECTORS[k], off = pattern === 'sweep' ? Math.sin(t * TAU * 0.5 + k * 2.1) * spread * 0.45 : 0;
          const s = pattern === 'sweep' ? spread * 0.45 : spread;
          const tilt = Math.sin(t * TAU * 0.25 + k) * 4;
          for (let j = 0; j < n; j++) add(P, off + (j / Math.max(1, n - 1) - 0.5) * s, tilt, color(k, j, n));
        });
        break;
      }
      case 'sky': { // a dense sheet just over the crowd, rippling
        const dense = Math.min(80, n * 4);
        [0, 1, 2].forEach((k) => {
          const P = PROJECTORS[k];
          for (let j = 0; j < dense; j++) {
            const u = j / (dense - 1) - 0.5;
            add(P, u * Math.max(spread, 70), 1.2 + Math.sin(u * 9 + t * TAU * 0.5 + k) * 1.1, color(k, j, dense), 0.55);
          }
        });
        break;
      }
      case 'tunnel': { // cone from upstage centre, spinning
        const P = PROJECTORS[2], R = spread * 0.18;
        for (let j = 0; j < n * 2; j++) {
          const a = (j / (n * 2)) * TAU + t * TAU * 0.5;
          add(P, Math.cos(a) * R, 4 + Math.sin(a) * R, color(2, j, n * 2), 0.8);
        }
        break;
      }
      case 'burst': { // radial beams in every direction from upstage centre, flickering
        const P = PROJECTORS[2];
        for (let j = 0; j < n * 2; j++) {
          const a = (j / (n * 2)) * TAU + t * TAU * 0.2;
          const flick = hash(j * 7.1 + Math.floor(beat * 4)) > 0.35 ? 1 : 0;
          add(P, Math.cos(a) * 80 - P.yaw, 25 + Math.sin(a) * 30, color(2, j, n * 2), flick);
        }
        break;
      }
      case 'chase': { // a handful of beams jump to new positions every beat
        const b = Math.floor(beat);
        PROJECTORS.slice(0, 5).forEach((P, k) => {
          for (let j = 0; j < Math.max(2, n / 4); j++) {
            const hy = hash(b * 13.3 + k * 5.7 + j * 1.9), hp = hash(b * 7.7 + k * 3.1 + j * 2.3);
            add(P, (hy - 0.5) * spread * 1.4, (hp - 0.3) * 18, color(k + b, j, n));
          }
        });
        break;
      }
      case 'cross': { // wings scissor across the stage; front of house answers the stage
        [3, 4].forEach((k) => {
          const P = PROJECTORS[k];
          for (let j = 0; j < n; j++) add(P, (j / Math.max(1, n - 1) - 0.5) * spread * 0.6 + Math.sin(t * TAU * 0.5 + k) * 15, 6 + Math.sin(t * TAU + j * 0.4) * 5, color(k, j, n));
        });
        const P = PROJECTORS[5];
        for (let j = 0; j < n; j++) add(P, (j / Math.max(1, n - 1) - 0.5) * 30, 5 + Math.cos(t * TAU * 0.5 + j * 0.5) * 4, color(5, j, n), 0.8);
        break;
      }
      default: break;
    }
  }

  push(p, dx, dy, dz, c, I) {
    const i = this.count++, k = i * 3;
    // stop on the deck or the floor, otherwise run out into the haze
    let L = 80, hit = 0;
    if (dy < -1e-4) {
      const t1 = (DECK_Y - p[1]) / dy, hx = p[0] + dx * t1, hz = p[2] + dz * t1;
      if (t1 > 0 && hz < DECK_FRONT && hz > DECK_BACK && Math.abs(hx) < DECK_HALF) { L = t1; hit = 1; }
      else { const t0 = -p[1] / dy; if (t0 > 0 && t0 < L) { L = t0; hit = 1; } }
    }
    if (this.e.floorOn === false) { L = 80; hit = 0; }
    this.origin[k] = p[0]; this.origin[k + 1] = p[1]; this.origin[k + 2] = p[2];
    this.end[k] = p[0] + dx * L; this.end[k + 1] = p[1] + dy * L; this.end[k + 2] = p[2] + dz * L;
    this.color[k] = c.r * I; this.color[k + 1] = c.g * I; this.color[k + 2] = c.b * I;
    this.hit[i] = hit;
  }
}
