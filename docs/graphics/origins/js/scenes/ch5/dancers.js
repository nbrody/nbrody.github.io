// dancers.js — Chapter 5: people made of light, dancing on the beat.
//
// Each dancer is a front-view skeleton posed procedurally from the shared
// tempo (bounce on every beat, sway every two, a move that changes every
// bar), rendered as a cloud of ~100 glowing particles strung along the bones —
// the same kind of points the piece began with. Near the end the particles
// take on the colours of the elements they are actually made of.

import { SHAPE } from '../../gfx/renderer.js';
import { RNG, TAU, lerp, hash } from '../../lib/math.js';
import { glowColor } from '../common/elements.js';

const MOVES = ['up', 'pump', 'wave', 'clap', 'groove', 'point'];
// what a body is made of, by number of atoms: mostly hydrogen, then oxygen, carbon, nitrogen…
const BODY_ELEMENTS = [['H', 0.62], ['O', 0.24], ['C', 0.12], ['N', 0.011], ['P', 0.006], ['S', 0.003]];

const ease = (x) => x * x * (3 - 2 * x);

/** Joint positions (units: height ≈ 1, floor at y = 0, y up) for a dancer at beat b. */
export function pose(b, d, energy) {
  const beat = b + d.phase;
  const ph = beat - Math.floor(beat);            // 0..1 within the beat
  const bar = Math.floor(beat / 4) + d.seed;
  const move = d.fixedMove || MOVES[Math.floor(hash(bar, d.seed + 3) * MOVES.length)];
  const e = energy * d.energy;
  const bounce = -0.035 * e * Math.abs(Math.sin(Math.PI * beat));
  const sway = 0.045 * e * Math.sin(Math.PI * beat + d.seed);
  const pelvis = [sway, 0.5 + bounce];
  const lean = 0.08 * e * Math.sin(Math.PI * beat + d.seed + 0.5);
  const up = (p, len, ang) => [p[0] + Math.sin(ang) * len, p[1] + Math.cos(ang) * len];
  const chest = up(pelvis, 0.22, lean);
  const neck = up(chest, 0.12, lean * 1.2);
  const nod = 0.04 * e * Math.sin(TAU * ph);
  const head = up(neck, 0.085, lean * 1.4 + nod);
  const sL = [chest[0] - 0.1, chest[1] + 0.07], sR = [chest[0] + 0.1, chest[1] + 0.07];
  // arms: α from straight down, outward; β bends the forearm further
  const hit = ease(Math.max(0, 1 - ph * 3.2));   // snap on the beat
  let aL = 0.5, aR = 0.5, bL = 0.6, bR = 0.6;
  const sw = Math.sin(Math.PI * beat);
  switch (move) {
    case 'up': aL = 2.7 + 0.15 * Math.sin(TAU * ph); aR = 2.7 - 0.15 * Math.sin(TAU * ph); bL = bR = 0.3; break;
    case 'pump': aR = lerp(1.2, 2.8, hit); bR = lerp(1.4, 0.1, hit); aL = 0.5; bL = 1.9; break;
    case 'wave': aL = 2.3 + 0.35 * sw; aR = 2.3 - 0.35 * sw; bL = 0.4 - 0.3 * sw; bR = 0.4 + 0.3 * sw; break;
    case 'clap': aL = aR = lerp(2.3, 2.95, hit); bL = bR = lerp(0.9, 0.35, hit); break;
    case 'groove': aL = 0.7 + 0.4 * sw; aR = 0.7 - 0.4 * sw; bL = bR = 1.3; break;
    case 'point': aR = 2.35 + 0.08 * Math.sin(TAU * ph); bR = 0.05; aL = 0.45; bL = 1.8; break;
    default: break;
  }
  const armE = (s, side, a, bb) => {
    const k = lerp(0.5, 1, e);
    a = lerp(0.35, a, k); bb = lerp(0.5, bb, k);
    const el = [s[0] + side * Math.sin(a) * 0.16, s[1] - Math.cos(a) * 0.16];
    const w = [el[0] + side * Math.sin(a + bb) * 0.15, el[1] - Math.cos(a + bb) * 0.15];
    return [el, w];
  };
  const [eL, wL] = armE(sL, -1, aL, bL), [eR, wR] = armE(sR, 1, aR, bR);
  // legs: feet stay on the floor (stepping on alternate beats); knees take the bounce
  const hL = [pelvis[0] - 0.06, pelvis[1] - 0.02], hR = [pelvis[0] + 0.06, pelvis[1] - 0.02];
  const step = Math.floor(beat) % 2;
  const lift = 0.035 * e * Math.max(0, Math.sin(Math.PI * ph));
  const fL = [-0.075 + sway * 0.4, 0.03 + (step ? lift : 0)], fR = [0.075 + sway * 0.4, 0.03 + (step ? 0 : lift)];
  const knee = (h, f, side) => {
    const dx = f[0] - h[0], dy = f[1] - h[1], d = Math.hypot(dx, dy);
    const bend = Math.sqrt(Math.max(0, 0.235 * 0.235 - (d / 2) ** 2));
    return [(h[0] + f[0]) / 2 + side * bend * 0.6, (h[1] + f[1]) / 2];
  };
  const kL = knee(hL, fL, -1), kR = knee(hR, fR, 1);
  return { pelvis, chest, neck, head, sL, sR, eL, eR, wL, wR, hL, hR, kL, kR, fL, fR };
}

const BONES = [
  ['pelvis', 'chest', 0.075], ['chest', 'neck', 0.05], ['sL', 'sR', 0.035], ['hL', 'hR', 0.04],
  ['sL', 'eL', 0.03], ['eL', 'wL', 0.025], ['sR', 'eR', 0.03], ['eR', 'wR', 0.025],
  ['hL', 'kL', 0.038], ['kL', 'fL', 0.03], ['hR', 'kR', 0.038], ['kR', 'fR', 0.03],
];

export class Crowd {
  constructor(n = 84) {
    const rng = new RNG(555);
    this.dancers = [];
    // the lead dancer — front and centre — then rows fading back into haze
    const rows = [[1, 0], [7, 0], [10, 1], [12, 2], [14, 3], [17, 4]];
    let id = 0;
    for (const [count, row] of rows) {
      for (let k = 0; k < count && id < n; k++, id++) {
        const lead = id === 0;
        const spread = 0.86 + 0.1 * row;
        const u = count === 1 ? 0.5 : (k + 0.5) / count;
        this.dancers.push({
          id, row: lead ? -1 : row, lead,
          x: lead ? 0.5 : 0.5 + (u - 0.5) * spread + rng.range(-0.02, 0.02) + (row % 2 ? 0.015 : 0),
          phase: lead ? 0 : rng.range(-0.08, 0.08) + (rng.next() < 0.15 ? 0.5 : 0),
          seed: rng.int(1, 999), energy: rng.range(0.75, 1.15),
          hue: rng.pick([[1.0, 0.55, 0.3], [1.0, 0.35, 0.55], [0.45, 0.7, 1.0], [0.7, 0.5, 1.0], [0.4, 1.0, 0.8], [1.0, 0.85, 0.45]]),
          appear: lead ? 36 : 45 + row * 4.2 + rng.range(0, 3.5),
          fixedMove: null,
        });
      }
    }
    this.lead = this.dancers[0];
    // particles strung along the bones (same template for everyone)
    const lens = BONES.map(([, , w]) => w);
    this.parts = [];
    const total = 110;
    const wsum = lens.reduce((s, w) => s + w, 0);
    for (let i = 0; i < total; i++) {
      let u = rng.next() * wsum, bone = BONES.length - 1;
      for (let k = 0; k < BONES.length; k++) { if (u < lens[k]) { bone = k; break; } u -= lens[k]; }
      let el = 'H', v = rng.next();
      for (const [s, w] of BODY_ELEMENTS) { if (v < w) { el = s; break; } v -= w; }
      this.parts.push({
        bone, t: rng.next(), off: rng.gauss() * 0.45, ang: rng.range(0, TAU), rad: Math.sqrt(rng.next()),
        tw: rng.range(0, TAU), size: rng.range(0.7, 1.3), el,
      });
    }
  }

  /** Screen transform for a dancer (floor position, scale in px per unit). */
  place(d, W, H) {
    const row = Math.max(0, d.row + (d.lead ? 0 : 1));
    const s = (H * 0.5) / (1 + 0.42 * row) * (d.lead ? 1.06 : 1);
    const floor = H * (0.95 - 0.065 * row);
    return { x: d.x * W, y: floor, s, row };
  }

  /**
   * Draw the crowd. o = { beats, energy, alpha(d), light(x, y) → [r,g,b], stardust 0..1,
   *                       rise (0..1: particles float away), time }
   */
  draw(R, o) {
    const S = R.sprites, W = R.W, H = R.H;
    const order = [...this.dancers].sort((a, b) => this.place(b, W, H).row - this.place(a, W, H).row);
    for (const d of order) {
      const a = o.alpha(d);
      if (a <= 0.01) continue;
      const pl = this.place(d, W, H);
      const P = pose(o.beats, d, o.energy);
      const X = (p) => pl.x + p[0] * pl.s, Y = (p) => pl.y - p[1] * pl.s;
      const fog = 1 - 0.15 * pl.row;
      const lit = o.light(pl.x, pl.y - pl.s * 0.6);
      const base = [d.hue[0] * 0.35 + lit[0] * 0.8, d.hue[1] * 0.35 + lit[1] * 0.8, d.hue[2] * 0.35 + lit[2] * 0.8];
      const pr = Math.max(1.2, pl.s * 0.012);
      // head: a soft ring of particles
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * TAU + o.time * 0.5;
        const hx = X(P.head) + Math.cos(ang) * pl.s * 0.055, hy = Y(P.head) + Math.sin(ang) * pl.s * 0.06;
        S.add(hx, hy, pr, base, a * fog * 0.9, SHAPE.glow);
      }
      S.add(X(P.head), Y(P.head), pl.s * 0.07, base, a * fog * 0.25, SHAPE.glow);
      for (const p of this.parts) {
        const [ka, kb, w] = BONES[p.bone];
        const A = P[ka], B = P[kb];
        const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const jit = 0.006 * Math.sin(o.time * 3 + p.tw);
        let x = A[0] + dx * p.t + nx * (p.off * w + jit), y = A[1] + dy * p.t + ny * (p.off * w + jit);
        let sx = X([x, y]), sy = Y([x, y]);
        if (o.rise > 0) {
          const r = o.rise * (0.6 + 0.8 * hash(p.bone * 131 + Math.round(p.t * 97), d.id));
          sy -= r * r * H * 0.9;
          sx += Math.sin(p.tw + o.time) * r * H * 0.05;
        }
        const tw = 0.75 + 0.25 * Math.sin(o.time * (2 + p.size * 3) + p.tw);
        const el = glowColor(p.el);
        const c = o.stardust > 0 ? [lerp(base[0], el[0] * 1.2, o.stardust), lerp(base[1], el[1] * 1.2, o.stardust), lerp(base[2], el[2] * 1.2, o.stardust)] : base;
        S.add(sx, sy, pr * p.size * (1 + 0.25 * o.stardust * tw), c, a * fog * tw * (1 - 0.6 * o.rise), SHAPE.glow);
      }
      // a faint body glow so figures read at a distance
      S.add(X(P.chest), Y(P.chest), pl.s * 0.22, base, a * fog * 0.07, SHAPE.glow);
    }
    S.flush('add');
  }

  /** World-space point on the lead dancer (for the finale's last light). */
  leadHeart(beats, energy, W, H) {
    const pl = this.place(this.lead, W, H);
    const P = pose(beats, this.lead, energy);
    return [pl.x + P.chest[0] * pl.s, pl.y - (P.chest[1] - 0.04) * pl.s, pl.s];
  }
}

