// stage.js — Chapter 5: the room the dancers are in. Moving-head spotlights
// cut volumetric cones through haze, pool on the floor, and swing and change
// colour on the beat.

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { TAU, hash } from '../../lib/math.js';

export const NBEAMS = 8;

const BEAMS_FS = `${HEADER}
#define NB ${NBEAMS}
uniform vec2 u_view;
uniform float u_t, u_floor, u_haze, u_bright;
uniform vec4 u_beam[NB];     // origin x, origin y (px), angle (rad, 0 = straight down), half-width
uniform vec3 u_col[NB];      // colour × intensity
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 p = v_px;
  float haze = 0.55 + 0.45 * vfbm(vec3(p / u_view.y * 3.0 + vec2(u_t * 0.05, -u_t * 0.03), u_t * 0.07));
  vec3 col = vec3(0.0);
  for (int i = 0; i < NB; i++) {
    vec4 b = u_beam[i];
    vec3 c = u_col[i];
    if (dot(c, c) < 1e-5) continue;
    vec2 d = p - b.xy;
    float dist = length(d);
    float ang = atan(d.x, d.y);
    float da = ang - b.z;
    float cone = exp(-(da * da) / (b.w * b.w)) * step(0.0, d.y);
    float fall = 1.0 / (1.0 + dist / u_view.y * 1.4);
    float beam = cone * fall * mix(1.0, haze, u_haze);
    // where the beam meets the floor: a pool of light
    float fx = b.x + tan(b.z) * (u_floor - b.y);
    vec2 fp = (p - vec2(fx, u_floor)) / vec2(u_view.y * 0.16, u_view.y * 0.035);
    float pool = exp(-dot(fp, fp)) * step(abs(b.z), 1.2);
    col += c * (beam * 0.55 + pool * 0.5);
  }
  // the room itself: dark, a little warmth near the floor
  float floorGlow = smoothstep(u_floor - u_view.y * 0.25, u_floor, p.y);
  col += vec3(0.05, 0.03, 0.06) * floorGlow;
  o = vec4(col * u_bright, 1.0);
}`;

const PALETTES = [
  [[1.0, 0.25, 0.55], [0.3, 0.45, 1.0]],
  [[1.0, 0.6, 0.2], [0.8, 0.25, 1.0]],
  [[0.25, 0.9, 1.0], [1.0, 0.3, 0.35]],
  [[0.6, 0.35, 1.0], [1.0, 0.85, 0.4]],
];

export class Stage {
  constructor(R) {
    this.prog = R.fsProgram(BEAMS_FS, 'ch5-beams');
    this.beamData = new Float32Array(NBEAMS * 4);
    this.colData = new Float32Array(NBEAMS * 3);
  }

  /**
   * Compute the rig for this moment. level: 0 (dark) … 1 (full show);
   * solo: 0..1 — a single white spot on the lead dancer.
   */
  rig(W, H, beats, level, solo, leadX) {
    const bar = Math.floor(beats / 4);
    const pal = PALETTES[bar % PALETTES.length];
    const beams = [];
    for (let i = 0; i < NBEAMS; i++) {
      const ox = W * (0.08 + (0.84 * i) / (NBEAMS - 1)), oy = -H * 0.06;
      const swing = 0.55 * Math.sin((beats / 8) * TAU * (i % 2 ? 1 : -1) + i * 0.9) + 0.18 * Math.sin((beats / 2) * TAU + i);
      const on = level * (i < 2 + level * NBEAMS ? 1 : 0);
      const hit = Math.exp(-(beats - Math.floor(beats)) * 3.5);
      const c = pal[i % 2];
      const I = on * (0.45 + 0.35 * hit) * (0.85 + 0.3 * hash(i, bar)) * (1 - solo);
      beams.push({ x: ox, y: oy, a: swing, w: 0.1 + 0.04 * Math.sin(beats * 0.5 + i), c: [c[0] * I, c[1] * I, c[2] * I] });
    }
    if (solo > 0) {
      // the solo spot: straight down onto the lead
      beams[0] = { x: leadX, y: -H * 0.1, a: 0, w: 0.085, c: [solo * 1.1, solo * 1.0, solo * 0.9] };
    }
    return beams;
  }

  draw(R, beams, { t, floor, bright }) {
    beams.forEach((b, i) => {
      this.beamData.set([b.x, b.y, b.a, b.w], i * 4);
      this.colData.set(b.c, i * 3);
    });
    R.lowres(() => R.pass(this.prog, { u_t: t, u_floor: floor, u_haze: 0.8, u_bright: bright, u_beam: this.beamData, u_col: this.colData }), 'add');
  }

  /** Light falling on a point (for colouring the dancers). */
  lightAt(beams, x, y, H) {
    const out = [0.04, 0.03, 0.06];
    for (const b of beams) {
      const dx = x - b.x, dy = y - b.y;
      if (dy <= 0) continue;
      const da = Math.atan2(dx, dy) - b.a;
      const k = Math.exp(-(da * da) / (b.w * b.w * 1.8)) / (1 + Math.hypot(dx, dy) / H * 1.4);
      out[0] += b.c[0] * k; out[1] += b.c[1] * k; out[2] += b.c[2] * k;
    }
    return out.map((v) => Math.min(1.6, v * 1.3 + 0.25));
  }
}

