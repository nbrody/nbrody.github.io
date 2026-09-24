// supernova.js — Chapter 1, 105–122 s: the star's cross-section (the
// "onion" of burning shells: H, He, C, O, Ne, Si around an iron core), the
// core collapse, the bounce, and the expanding remnant that carries every
// element the star made out into space — the raw material for Chapter 2.

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { RNG, TAU, smoothstep, mixc } from '../../lib/math.js';
import { glowColor } from '../common/elements.js';

// outer radius of each shell (fraction of the star) and its color
export const SHELLS = [
  ['H', 1.0, [1.0, 0.36, 0.14]],
  ['He', 0.64, [1.0, 0.72, 0.30]],
  ['C', 0.46, [0.95, 0.62, 0.42]],
  ['O', 0.34, [1.0, 0.32, 0.30]],
  ['Ne', 0.26, [1.0, 0.36, 0.62]],
  ['Si', 0.19, [0.85, 0.85, 0.55]],
  ['Fe', 0.11, [0.75, 0.3, 0.18]],
];

const ONION_FS = `${HEADER}
uniform vec2 u_view, u_c;
uniform float u_R, u_t, u_collapse, u_pulse, u_bright, u_shock, u_burst;
uniform float u_radii[7];
uniform vec3 u_cols[7];
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 d = (v_px - u_c) / u_R;
  float r = length(d);
  float ang = atan(d.y, d.x);
  // the core falls in first and fastest
  float k = mix(1.0, 0.25 + 0.75 * smoothstep(0.0, 0.9, r), u_collapse);
  float rr = r / k;
  float turb = vfbm(vec3(cos(ang) * 2.5 + rr * 5.0, sin(ang) * 2.5 - rr * 5.0, u_t * 0.35));
  float rt = rr + (turb - 0.5) * 0.045;
  vec3 col = vec3(0.0);
  if (rt < 1.0) {
    int idx = 0;
    for (int i = 0; i < 7; i++) if (rt < u_radii[i]) idx = i;
    float outer = u_radii[idx];
    float inner = idx < 6 ? u_radii[idx + 1] : 0.0;
    vec3 c = u_cols[idx];
    float depth = 1.0 - rt;
    float boil = vfbm(vec3(d * 9.0 / max(k, 0.3), u_t * 0.5));
    float heat = 0.3 + 0.42 * depth * depth + 0.3 * boil;
    col = c * heat;
    // shell-burning fronts glow at every boundary
    float edge = exp(-pow((rt - inner) * 110.0, 2.0)) * (idx < 6 ? 1.0 : 0.0);
    col += mix(c, vec3(1.0), 0.5) * edge * (1.2 + 1.5 * u_pulse);
    col *= 0.8 + 0.5 * u_pulse * (1.0 - rt);
    if (idx == 6) col = mix(col, vec3(1.6, 1.5, 1.4), u_collapse * u_collapse);
    col *= smoothstep(1.0, 0.985, rt);
  }
  // photosphere limb + faint corona
  col += vec3(1.0, 0.5, 0.25) * exp(-max(r - 1.0, 0.0) * 9.0) * 0.25 * smoothstep(0.96, 1.0, r);
  // the shock wave tearing outward
  col += vec3(0.8, 0.9, 1.2) * exp(-pow((r - u_shock) * 26.0, 2.0)) * u_burst * 3.0;
  o = vec4(col * u_bright, 1.0);
}`;

export class Supernova {
  constructor(R) {
    this.prog = R.fsProgram(ONION_FS, 'ch1-onion');
    this.radii = new Float32Array(SHELLS.map((s) => s[1]));
    this.cols = new Float32Array(SHELLS.flatMap((s) => s[2]));
    // remnant debris: which element, where it starts, which way it flies
    const rng = new RNG(314);
    const mixTable = [['H', 0.2], ['He', 0.14], ['C', 0.14], ['O', 0.2], ['Ne', 0.09], ['Si', 0.11], ['Fe', 0.12]];
    this.debris = [];
    for (let i = 0; i < 5000; i++) {
      let u = rng.next(), el = 'H';
      for (const [s, w] of mixTable) { if (u < w) { el = s; break; } u -= w; }
      const shell = SHELLS.find((s) => s[0] === el);
      const d = rng.dir3();
      const ang = Math.atan2(d[1], d[0]);
      // Rayleigh–Taylor fingers: the shell pushes further out along some directions
      const finger = Math.pow(0.5 + 0.5 * Math.sin(ang * 9 + Math.sin(ang * 4) * 2.2 + d[2] * 3), 4);
      const inShell = rng.next() < 0.78;
      this.debris.push({
        el, d, r0: shell[1] * (0.6 + 0.4 * rng.next()),
        rf: inShell ? 1.15 + 0.8 * finger + 0.18 * rng.next() : 0.25 + 0.8 * rng.next(),
        c: glowColor(el), size: 1 + rng.next() * 1.5, tw: rng.next() * TAU,
      });
    }
  }

  drawOnion(R, { cx, cy, radius, t, collapse, pulse, bright, shock, burst }) {
    R.lowres(() => {
      R.pass(this.prog, {
        u_c: [cx, cy], u_R: radius, u_t: t, u_collapse: collapse, u_pulse: pulse,
        u_bright: bright, u_shock: shock, u_burst: burst, u_radii: this.radii, u_cols: this.cols,
      });
    }, 'add');
  }

  /** Element symbols beside each shell, on the 2D layer. */
  drawLabels(R, { cx, cy, radius, alpha }) {
    if (alpha <= 0.01) return;
    const g = R.begin2D();
    g.font = `500 ${Math.max(10, radius * 0.045).toFixed(0)}px "Avenir Next", "Helvetica Neue", sans-serif`;
    g.textBaseline = 'middle';
    const a = -0.62;
    for (let i = 0; i < SHELLS.length; i++) {
      const [sym, rOut] = SHELLS[i];
      const rIn = i < SHELLS.length - 1 ? SHELLS[i + 1][1] : 0;
      const rm = (rOut + rIn) / 2;
      const x0 = cx + Math.cos(a) * rm * radius, y0 = cy + Math.sin(a) * rm * radius;
      const x1 = cx + radius * 1.12, y1 = cy - radius * (0.75 - i * 0.13);
      g.strokeStyle = `rgba(255,235,210,${0.35 * alpha})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - 6, y1); g.stroke();
      g.fillStyle = `rgba(255,240,225,${0.85 * alpha})`;
      g.fillText(sym, x1, y1);
    }
  }

  /** Expanding debris; t = seconds since the bounce. */
  drawDebris(R, { cx, cy, radius, t, alpha, zoom = 1 }) {
    if (t <= 0 || alpha <= 0.001) return;
    const S = R.sprites, L = R.lines;
    const reach = (tt) => 1 - Math.exp(-tt / 0.75);
    for (const p of this.debris) {
      const rNow = (p.r0 + (p.rf - p.r0) * reach(t) + 0.05 * t) * radius * zoom;
      const rPrev = (p.r0 + (p.rf - p.r0) * reach(Math.max(0, t - 0.05)) + 0.05 * t) * radius * zoom;
      const x = cx + p.d[0] * rNow, y = cy + p.d[1] * rNow;
      const xp = cx + p.d[0] * rPrev, yp = cy + p.d[1] * rPrev;
      const cool = smoothstep(0.1, 2.2, t);
      const c = mixc([2.2, 2.1, 2.0], [p.c[0] * 1.3, p.c[1] * 1.3, p.c[2] * 1.3], cool);
      // limb brightening: a thin shell looks like a ring, as real remnants do
      const limb = 0.3 + 1.4 * (1 - Math.abs(p.d[2])) ** 3;
      const I = alpha * limb * (0.45 + 0.55 * Math.exp(-t * 0.8)) * (0.8 + 0.2 * Math.sin(t * 3 + p.tw));
      L.add(xp, yp, x, y, 0.9 * p.size, c, 0, c, I * 1.2, 0.6);
      S.add(x, y, 2.4 * p.size * Math.sqrt(zoom), c, I, SHAPE.glow);
    }
    L.flush('add');
    S.flush('add');
  }

  /** The neutrino burst: 99% of the energy leaves first, as ghosts. */
  drawNeutrinos(R, { cx, cy, radius, t }) {
    if (t < 0 || t > 0.6) return;
    const L = R.lines;
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * TAU + Math.sin(i * 12.9898) * 0.05;
      const r1 = radius * (0.05 + t * 9), r0 = Math.max(0, r1 - radius * 0.9);
      const I = (1 - t / 0.6) * 0.9;
      L.add(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
        0.6, [0.55, 0.45, 1.0], 0, [0.9, 0.8, 1.3], I, 0);
    }
    L.flush('add');
  }
}

/** Shock radius (fraction of the star) t seconds after the bounce. */
export const shockAt = (t) => (t <= 0 ? 0 : 1.3 * (1 - Math.exp(-t * 1.6)));
