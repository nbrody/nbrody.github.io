// ambient.js — house lights and fairy lights: the room's own light, independent of the show.
//
// House lights are the venue's ceiling fixtures (cans in the void, Edison pendants in
// the club, chandeliers and sconces in the theater, floodlight towers in the stadium).
// They fade at their own speed — "Showtime" takes them out slowly, the way a room
// goes dark before the band walks on — fill the whole room with light, and wash out
// the beams a little while they're up. They can breathe, flicker like old tungsten,
// chase around the room, pulse on the beat, twinkle, or go rainbow.
//
// Fairy lights are strings of bulbs hanging in swags (a canopy over the crowd, spokes
// from a hub, or swags between the truss sticks that ride the kinetics) or in drops
// (a curtain upstage). Every strand is a live catenary that sways in a breeze; bulbs
// switch on running along each string, and there are classic C9 colours, twinkle,
// chase, waves, sparkle, beat pulses and rain.

import * as THREE from 'three';
import { POD_COUNT, hash } from './layout.js';
import { hs2rgb, hexHS } from './engine.js';

const TAU = Math.PI * 2;
const MAX_BULBS = 3200;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const approach = (cur, target, secs, dt) => cur + Math.max(-dt / secs, Math.min(dt / secs, target - cur));

export const HOUSE_EFFECTS = {
  steady: 'Steady', breathe: 'Breathing', flicker: 'Old tungsten flicker', chase: 'Chase around the room',
  pulse: 'Pulse on the beat', twinkle: 'Twinkle', rainbow: 'Rainbow',
};
export const HOUSE_COLORS = { tungsten: 'White (set the warmth)', color: 'One colour', rig: 'The rig’s colour' };
export const FAIRY_LAYOUTS = {
  canopy: 'Canopy over the crowd', radial: 'Spokes from a hub', rig: 'Swags between the truss sticks', curtain: 'Starcloth drops upstage',
};
export const FAIRY_COLORS = {
  warm: 'Warm white', cool: 'Cool white', classic: 'Classic multicolour (C9)', pastel: 'Pastel', rainbow: 'Rainbow along the string', rig: 'The rig’s colour', fixed: 'One colour',
};
export const FAIRY_EFFECTS = {
  steady: 'Steady', twinkle: 'Twinkle', chase: 'Chase along the strings', wave: 'Wave across the strings',
  breathe: 'Breathing', sparkle: 'Sparkle', beat: 'Pulse on the beat', rain: 'Rain (falling drops)',
};
const C9 = [[1, 0.12, 0.05], [0.1, 0.9, 0.2], [0.15, 0.3, 1], [1, 0.55, 0.05], [0.95, 0.2, 0.75]];
const PASTEL = [[1, 0.6, 0.65], [0.6, 1, 0.75], [0.6, 0.75, 1], [1, 0.9, 0.55], [0.85, 0.65, 1]];

/** Colour temperature (0 = 2200 K candle … 1 = 6500 K daylight) → linear RGB, roughly. */
function warmth(w, out) {
  const stops = [[1, 0.5, 0.16], [1, 0.72, 0.42], [1, 0.9, 0.78], [0.82, 0.88, 1]];
  const x = clamp01(w) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  for (let k = 0; k < 3; k++) out[k] = stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f;
  return out;
}

function makePoints(rig, n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const pts = new THREE.Points(g, rig.glowMat);
  pts.frustumCulled = false;
  pts.renderOrder = 15;
  rig.scene.add(pts);
  return { pts, pos, col, size, g, set(count) { g.setDrawRange(0, count); g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true; pts.visible = count > 0; } };
}

export class Ambience {
  constructor(rig, engine, venue) {
    this.rig = rig; this.e = engine; this.venue = venue;
    this.house = {
      level: 0, target: 0, fade: 3,
      o: { color: 'tungsten', warmth: 0.25, fixed: '#ffcf8a', effect: 'steady', speed: 1 },
    };
    this.fairy = {
      pres: 0,
      o: { on: false, layout: 'canopy', color: 'warm', fixed: '#ff7ad9', effect: 'twinkle', level: 0.8, speed: 1, density: 3, sag: 1, sway: 0.4, size: 1 },
    };
    this.t = 0;
    this.housePts = makePoints(rig, 400);
    this.fairyPts = makePoints(rig, MAX_BULBS);
    const wg = new THREE.BufferGeometry();
    this.wirePos = new Float32Array(MAX_BULBS * 6);
    wg.setAttribute('position', new THREE.BufferAttribute(this.wirePos, 3));
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3b40, transparent: true, opacity: 0.8 }));
    this.wires.frustumCulled = false;
    rig.scene.add(this.wires);
    this.tmp = [0, 0, 0];
  }

  /** Fade the house lights to `level` (0…1) over `secs`. */
  houseTo(level, secs) { this.house.target = clamp01(level); if (secs !== undefined) this.house.fade = Math.max(0.05, secs); }

  rigColor() {
    let best = null, bi = 0.05;
    for (const R of this.e.render) if (R.I > bi) { bi = R.I; best = R; }
    if (!best) return [0.5, 0.6, 1];
    const m = Math.max(best.r, best.g, best.b) || 1;
    return [best.r / m, best.g / m, best.b / m];
  }

  update(dt) {
    const E = this.e, m = E.m;
    this.t += dt;
    const master = m.blackout ? 0 : 1; // house lights are the venue's, not on the grand master
    const rig = this.rigColor();
    this.venue.update(dt, rig);
    const houseFill = this.updateHouse(dt, master, rig);
    const fairyFill = this.updateFairy(dt, master * m.grand, rig);
    // add the room's light on top of whatever the devices put there this frame
    const f = this.rig.shared.uFill.value, v = this.venue.def.fill;
    f.r += houseFill[0] * v + fairyFill[0]; f.g += houseFill[1] * v + fairyFill[1]; f.b += houseFill[2] * v + fairyFill[2];
    this.rig.beamWash = Math.min(0.55, ((houseFill[0] + houseFill[1] + houseFill[2]) / 3) * 0.6 * Math.min(1.6, v / 0.35));
  }

  updateHouse(dt, master, rig) {
    const H = this.house, o = H.o, bulbs = this.venue.house, P = this.housePts, beat = this.e.beat, t = this.t * o.speed;
    H.level = approach(H.level, H.target, H.fade, dt);
    const L = H.level * master, sum = [0, 0, 0];
    if (L <= 0.0005 || !bulbs.length) { P.set(0); return sum; }
    const base = [0, 0, 0];
    if (o.color === 'color') { const c = hs2rgb(...hexHS(o.fixed), { r: 0, g: 0, b: 0 }); base[0] = c.r; base[1] = c.g; base[2] = c.b; }
    else if (o.color === 'rig') { base[0] = rig[0]; base[1] = rig[1]; base[2] = rig[2]; }
    else warmth(o.warmth, base);
    const n = Math.min(bulbs.length, 400), c = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < n; i++) {
      const B = bulbs[i];
      let e = 1, r = base[0], g = base[1], b = base[2];
      switch (o.effect) {
        case 'breathe': e = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.3)); break;
        case 'flicker': e = 0.78 + 0.22 * Math.sin(t * 23 + B.k * 50) * Math.sin(t * 37 + B.k * 13) + (hash(Math.floor(t * 9) + i * 0.37) > 0.985 ? -0.5 : 0); break;
        case 'chase': e = 0.12 + 0.88 * Math.pow(0.5 + 0.5 * Math.cos(TAU * (B.k * 2 - t * 0.35)), 8); break;
        case 'pulse': e = 0.3 + 0.7 * Math.exp(-(beat - Math.floor(beat)) * 5); break;
        case 'twinkle': e = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 3 + hash(i * 1.7) * 40), 4); break;
        case 'rainbow': hs2rgb(B.k * 720 + t * 40, 0.85, c); r = c.r; g = c.g; b = c.b; break;
        default: break;
      }
      e = Math.max(0, e) * L;
      P.pos.set(B.p, i * 3);
      P.col[i * 3] = r * e * 2; P.col[i * 3 + 1] = g * e * 2; P.col[i * 3 + 2] = b * e * 2;
      P.size[i] = B.size * (0.6 + 0.6 * e);
      sum[0] += r * e; sum[1] += g * e; sum[2] += b * e;
    }
    P.set(n);
    return sum.map((v) => v / n);
  }

  /** The strands for the current layout (the 'rig' layout rides the truss sticks). */
  strands() {
    const o = this.fairy.o;
    if (o.layout === 'rig') {
      const out = [], pose = {}, rig = this.rig.rig, E = this.e;
      const end = (p, b, sgn) => {
        pose.scale = 1; rig.pose(p, b, E.pods[p], E.time, pose);
        const hx = rig.hoists(p, b)[sgn > 0 ? 1 : 0], M = pose.m;
        return [pose.x + M[0] * hx[0] + M[1] * (hx[1] - 0.3), pose.y + M[3] * hx[0] + M[4] * (hx[1] - 0.3), pose.z + M[6] * hx[0] + M[7] * (hx[1] - 0.3)];
      };
      for (const p of [0, 2, 4].filter((q) => q < POD_COUNT)) for (let b = 0; b < 4; b++) out.push({ a: end(p, b, 1), b: end(p, b + 1, -1), sag: 0.9 });
      return out;
    }
    const f = this.venue.def.fairy[o.layout] || this.venue.def.fairy.canopy;
    if (!this._cache || this._cacheKey !== `${this.venue.id}:${o.layout}`) { this._cache = f(); this._cacheKey = `${this.venue.id}:${o.layout}`; }
    return this._cache;
  }

  updateFairy(dt, master, rig) {
    const F = this.fairy, o = F.o, P = this.fairyPts, W = this.wirePos, sum = [0, 0, 0];
    F.pres = approach(F.pres, o.on ? 1 : 0, 2.2, dt);
    if (F.pres <= 0.0005) { P.set(0); this.wires.visible = false; return sum; }
    this.wires.visible = true;
    const t = this.t * o.speed, beat = this.e.beat, spacing = 1 / Math.max(0.5, o.density);
    const strands = this.strands(), ns = strands.length;
    let n = 0, w = 0;
    const c = { r: 0, g: 0, b: 0 }, fixed = hs2rgb(...hexHS(o.fixed), { r: 0, g: 0, b: 0 });
    for (let s = 0; s < ns && n < MAX_BULBS; s++) {
      const S = strands[s];
      let len, pt;
      const phase = hash(s * 3.3) * TAU, sway = o.sway * (0.6 + 0.4 * Math.sin(t * 0.37 + phase));
      if (S.vertical) {
        len = S.len;
        pt = (u, out) => { const hang = u; out[0] = S.a[0] + Math.sin(t * 1.1 + phase + u * 2) * sway * 0.35 * hang; out[1] = S.a[1] - u * len; out[2] = S.a[2] + Math.cos(t * 0.9 + phase) * sway * 0.2 * hang; return out; };
      } else {
        const dx = S.b[0] - S.a[0], dy = S.b[1] - S.a[1], dz = S.b[2] - S.a[2];
        len = Math.hypot(dx, dy, dz);
        const hz = Math.hypot(dx, dz) || 1, px = -dz / hz, pz = dx / hz, sag = S.sag * o.sag * (len / 20 + 0.5);
        pt = (u, out) => {
          const bow = 4 * u * (1 - u), swing = Math.sin(t * 1.3 + phase) * sway * bow;
          out[0] = S.a[0] + dx * u + px * swing; out[1] = S.a[1] + dy * u - sag * bow * Math.cos(swing * 0.3); out[2] = S.a[2] + dz * u + pz * swing;
          return out;
        };
      }
      const count = Math.max(2, Math.min(MAX_BULBS - n, Math.round(len / spacing)));
      let prevX, prevY, prevZ;
      for (let j = 0; j < count; j++) {
        const u = count > 1 ? j / (count - 1) : 0, gi = n + j;
        const p = pt(u, this.tmp);
        P.pos[gi * 3] = p[0]; P.pos[gi * 3 + 1] = p[1]; P.pos[gi * 3 + 2] = p[2];
        if (j > 0) { W.set([prevX, prevY, prevZ, p[0], p[1], p[2]], w * 6); w++; }
        prevX = p[0]; prevY = p[1]; prevZ = p[2];
        // colour
        let r = 1, g = 1, b = 1;
        switch (o.color) {
          case 'warm': r = 1; g = 0.62; b = 0.26; break;
          case 'cool': r = 0.75; g = 0.86; b = 1; break;
          case 'classic': [r, g, b] = C9[(gi + s) % 5]; break;
          case 'pastel': [r, g, b] = PASTEL[(gi + s) % 5]; break;
          case 'rainbow': hs2rgb(u * 360 + s * 25 + t * 25, 1, c); r = c.r; g = c.g; b = c.b; break;
          case 'rig': [r, g, b] = rig; break;
          default: r = fixed.r; g = fixed.g; b = fixed.b;
        }
        // animation
        let e = 1;
        switch (o.effect) {
          case 'twinkle': e = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.6 + hash(gi * 0.71) * 60), 3); break;
          case 'chase': e = 0.12 + 0.88 * Math.pow(0.5 + 0.5 * Math.sin(TAU * (u * len / 3 - t * 0.6)), 6); break;
          case 'wave': e = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(TAU * (s / Math.max(1, ns) - t * 0.25))); break;
          case 'breathe': e = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.2)); break;
          case 'sparkle': if (hash(gi * 7.13 + Math.floor(t * 10)) > 0.965) { r = g = b = 1; e = 2; } else e = 0.45; break;
          case 'beat': e = 0.25 + 0.75 * Math.exp(-(beat - Math.floor(beat)) * 5); break;
          case 'rain': {
            const pos = ((t * (0.25 + hash(s * 1.9) * 0.2) + hash(s * 5.1)) % 1);
            const x = u - pos;
            e = 0.1 + (x <= 0 ? Math.exp(x * 14) : Math.exp(-x * 60));
            break;
          }
          default: break;
        }
        // switching on: bulbs light running along each string
        const on = smooth(F.pres * 1.6 - 0.6 * u);
        e *= o.level * master * on;
        P.col[gi * 3] = r * e * 2.4; P.col[gi * 3 + 1] = g * e * 2.4; P.col[gi * 3 + 2] = b * e * 2.4;
        P.size[gi] = e > 0.003 ? 0.24 * o.size * (0.7 + 0.5 * Math.min(1.5, e)) : 0;
        sum[0] += r * e; sum[1] += g * e; sum[2] += b * e;
      }
      n += count;
    }
    P.set(n);
    this.wires.geometry.setDrawRange(0, w * 2);
    this.wires.geometry.attributes.position.needsUpdate = true;
    this.wires.material.opacity = 0.8 * smooth(F.pres * 3);
    // a canopy of bulbs lifts the room a little: average bulb light, gently
    return sum.map((v) => (v / Math.max(1, n)) * 0.05);
  }
}
