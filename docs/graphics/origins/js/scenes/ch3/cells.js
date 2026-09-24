// cells.js — Chapter 3, 0–40 s: from the first cells to complex life.
//
//   a colony grows by binary fission (the Ch. 2 protocell finishes dividing)
//   cyanobacteria turn green and oxygen bubbles up; the water clears to blue
//   endosymbiosis: a large cell engulfs a bacterium — the mitochondrion
//   a Volvox-like sphere: cells that stay together
//
// Cells are signed-distance shapes in one fullscreen shader: every entry is
// a pair of lobes joined by a smooth minimum, so a dividing cell pinches
// into two naturally. The lineage and positions are simulated once at start
// and stored as snapshots, so any moment is a pure lookup (free seeking).

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { RNG, clamp, lerp, hash } from '../../lib/math.js';

export const MAX_CELLS = 64;
const FPS = 30;
const SIM_END = 40;

const CELLS_FS = `${HEADER}
#define MAXC ${MAX_CELLS}
uniform vec2 u_view, u_center;
uniform float u_t, u_scale, u_n, u_bright, u_green;
uniform vec4 u_a[MAXC];   // x, y, r, sep   (world units)
uniform vec4 u_b[MAXC];   // angle, blend k, hue, alpha
in vec2 v_px; out vec4 o;
${NOISE}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
void main() {
  vec2 p = (v_px - u_center) / u_scale;
  float best = 1e9; int bi = 0; float second = 1e9;
  for (int i = 0; i < MAXC; i++) {
    if (float(i) >= u_n) break;
    vec4 a = u_a[i]; vec4 b = u_b[i];
    vec2 ax = vec2(cos(b.x), sin(b.x)) * a.w;
    float wob = 0.035 * a.z * sin(atan(p.y - a.y, p.x - a.x) * 5.0 + u_t * 1.3 + float(i));
    float d1 = length(p - a.xy - ax) - a.z, d2 = length(p - a.xy + ax) - a.z;
    float d = smin(d1, d2, b.y) + wob;
    if (d < best) { second = best; best = d; bi = i; } else if (d < second) { second = d; }
  }
  vec4 A = u_a[bi], B = u_b[bi];
  float px = 1.0 / u_scale;
  float r = A.z;
  // membrane: a bright rim with a soft outer glow
  float rim = exp(-pow(best / (0.05 * r + px), 2.0));
  float glow = exp(-max(best, 0.0) / (0.25 * r)) * step(0.0, best);
  float inside = smoothstep(px, -px, best);
  // cytoplasm: granular, with a darker nucleoid tangle
  vec2 q = (p - A.xy) / r;
  float gran = vnoise(vec3(q * 7.0, u_t * 0.4 + float(bi)));
  float dna = smoothstep(0.55, 0.62, vfbm(vec3(q * 3.2 + float(bi) * 3.1, u_t * 0.15))) * smoothstep(0.9, 0.2, length(q));
  vec3 base = mix(vec3(0.25, 0.8, 0.85), vec3(0.35, 0.95, 0.4), u_green);
  base = mix(base, vec3(0.6, 0.9, 0.5), B.z * 0.4);
  vec3 cyto = base * (0.14 + 0.1 * gran - 0.05 * length(q)) + vec3(0.9, 0.7, 1.0) * dna * 0.18;
  vec3 col = cyto * inside + base * rim * 1.3 + base * glow * 0.12;
  // a sliver of contact where two cells press together
  col += base * exp(-pow((second - best) / (0.03 * r + px), 2.0)) * inside * 0.3;
  o = vec4(col * u_bright * B.w, 1.0);
}`;

const EUK_FS = `${HEADER}
uniform vec2 u_view, u_c, u_bact;
uniform float u_t, u_R, u_eng, u_bright;
in vec2 v_px; out vec4 o;
${NOISE}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float capsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
void main() {
  vec2 p = (v_px - u_c) / u_R;
  float px = 1.0 / u_R;
  float ang = atan(p.y, p.x);
  float body = length(p) - 1.0 - 0.04 * sin(ang * 3.0 + u_t * 0.7) - 0.03 * sin(ang * 7.0 - u_t);
  // the bacterium, and the membrane reaching around it
  vec2 bc = u_bact;
  float bact = capsule(p, bc - vec2(0.13, 0.03), bc + vec2(0.13, 0.03), 0.075);
  float wrap = smin(body, bact - 0.02, 0.18 * u_eng * (1.0 - u_eng) * 4.0 + 0.001);
  float cell = mix(body, wrap, smoothstep(0.0, 0.3, u_eng) * (1.0 - smoothstep(0.75, 1.0, u_eng)));
  float inside = smoothstep(px, -px, cell);
  float rim = exp(-pow(cell / (0.012 + px), 2.0));
  vec3 base = vec3(0.45, 0.8, 0.95);
  vec3 col = base * (0.1 + 0.06 * vnoise(vec3(p * 12.0, u_t * 0.3))) * inside + base * rim * 1.4;
  // nucleus: double membrane, chromatin, nucleolus
  vec2 nc = vec2(-0.22, 0.08);
  float nd = length(p - nc) - 0.36;
  float nuc = smoothstep(px, -px, nd);
  float chrom = smoothstep(0.5, 0.7, vfbm(vec3((p - nc) * 6.0, u_t * 0.1)));
  col = mix(col, vec3(0.35, 0.3, 0.7) * (0.25 + 0.35 * chrom), nuc * 0.9);
  col += vec3(0.75, 0.7, 1.0) * (exp(-pow(nd / (0.01 + px), 2.0)) + 0.6 * exp(-pow((nd + 0.03) / (0.008 + px), 2.0))) * 0.9;
  col += vec3(0.9, 0.6, 1.0) * smoothstep(0.1, 0.0, length(p - nc - vec2(0.08, -0.05)) - 0.02) * 0.6;
  // endoplasmic reticulum: folded membranes hugging the nucleus
  float er = abs(sin(length(p - nc) * 60.0 + vnoise(vec3(p * 4.0, 1.0)) * 6.0));
  col += base * smoothstep(0.92, 1.0, er) * smoothstep(0.62, 0.4, length(p - nc)) * step(0.0, nd) * inside * 0.35;
  // the bacterium: rod with a membrane; inside, it becomes a mitochondrion (folded cristae)
  float bIn = smoothstep(px, -px, bact);
  vec3 bcol = mix(vec3(0.45, 0.95, 0.5), vec3(1.0, 0.55, 0.35), smoothstep(0.7, 1.0, u_eng));
  float cristae = smoothstep(0.7, 1.0, sin((p.x - bc.x) * 90.0 + sin((p.y - bc.y) * 40.0) * 2.0));
  col = mix(col, bcol * (0.25 + 0.3 * cristae * smoothstep(0.6, 1.0, u_eng)), bIn * 0.85);
  col += bcol * exp(-pow(bact / (0.008 + px), 2.0)) * 1.2;
  // more mitochondria, already inside
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.7 + 2.2;
    vec2 mc = vec2(cos(a), sin(a)) * 0.62 + 0.03 * vec2(sin(u_t * 0.5 + float(i)), cos(u_t * 0.4 + float(i)));
    vec2 dir = vec2(cos(a + 1.6), sin(a + 1.6)) * 0.1;
    float m = capsule(p, mc - dir, mc + dir, 0.055);
    float mcr = smoothstep(0.7, 1.0, sin(dot(p - mc, dir) * 700.0));
    col = mix(col, vec3(1.0, 0.55, 0.35) * (0.25 + 0.25 * mcr), smoothstep(px, -px, m) * 0.8);
    col += vec3(1.0, 0.55, 0.35) * exp(-pow(m / (0.007 + px), 2.0)) * 0.9;
  }
  col += base * exp(-max(cell, 0.0) * 10.0) * step(0.0, cell) * 0.08;
  o = vec4(col * u_bright, 1.0);
}`;

/** Simulate the colony once; store snapshots for pure-function playback. */
function simulateColony() {
  const rng = new RNG(303);
  const cells = [];
  const mk = (x, y, r, born, angle) => ({
    x, y, r, r0: r, vx: 0, vy: 0, born, angle, divAt: born + 2.3 + rng.next() * 1.1, sep: 0, k: 0, hue: rng.next(),
  });
  // the two lobes of the Chapter 2 protocell, still joined
  const a = mk(-0.222, 0, 0.24, -2, 0), b = mk(0.222, 0, 0.24, -2, 0);
  a.divAt = 2.8; b.divAt = 3.4;
  cells.push(a, b);
  const frames = [];
  const dt = 1 / FPS;
  for (let f = 0; f <= SIM_END * FPS; f++) {
    const t = f * dt;
    // divisions
    for (const c of [...cells]) {
      if (cells.length >= MAX_CELLS) break;
      const u = (t - c.divAt) / 0.9;
      if (u >= 1) {
        const ax = Math.cos(c.angle), ay = Math.sin(c.angle);
        const r = c.r * 0.8;
        const d1 = mk(c.x + ax * c.r * 0.55, c.y + ay * c.r * 0.55, r, t, c.angle + rng.range(-1.2, 1.2) + Math.PI / 2);
        const d2 = mk(c.x - ax * c.r * 0.55, c.y - ay * c.r * 0.55, r, t, c.angle + rng.range(-1.2, 1.2) + Math.PI / 2);
        d1.vx = ax * 0.08; d1.vy = ay * 0.08; d2.vx = -ax * 0.08; d2.vy = -ay * 0.08;
        cells.splice(cells.indexOf(c), 1, d1, d2);
      }
    }
    // growth and the pinch of dividing cells
    for (const c of cells) {
      c.pinch = clamp((t - (c.divAt - 0.9)) / 0.9);
      c.sep = c.r * 0.55 * c.pinch;
      c.k = c.r * lerp(0.9, 0.02, c.pinch * c.pinch);
      c.r = Math.min(c.r0 * 1.12, c.r + dt * 0.02 * c.r0);
    }
    // soft collisions + gentle cohesion
    for (let i = 0; i < cells.length; i++) {
      const p = cells[i];
      for (let j = i + 1; j < cells.length; j++) {
        const q = cells[j];
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
        const want = (p.r + p.sep * 0.9) + (q.r + q.sep * 0.9) + 0.004;
        if (d < want) {
          const push = (want - d) * 0.5 * 6 * dt;
          p.vx -= (dx / d) * push; p.vy -= (dy / d) * push;
          q.vx += (dx / d) * push; q.vy += (dy / d) * push;
        }
      }
      p.vx -= p.x * 0.05 * dt; p.vy -= p.y * 0.05 * dt;
    }
    for (const c of cells) {
      c.vx *= Math.exp(-dt * 3); c.vy *= Math.exp(-dt * 3);
      c.x += c.vx; c.y += c.vy;
    }
    const snap = new Float32Array(MAX_CELLS * 8);
    cells.forEach((c, i) => {
      // lobes shrink as they pinch, so daughters (0.8 r) take over seamlessly
      snap.set([c.x, c.y, c.r * (1 - 0.2 * (c.pinch || 0)), c.sep, c.angle, c.k, c.hue, 1], i * 8);
    });
    frames.push({ n: cells.length, data: snap });
  }
  return frames;
}

export class Cells {
  constructor(R) {
    this.prog = R.fsProgram(CELLS_FS, 'ch3-cells');
    this.euk = R.fsProgram(EUK_FS, 'ch3-euk');
    this.frames = simulateColony();
    this.ua = new Float32Array(MAX_CELLS * 4);
    this.ub = new Float32Array(MAX_CELLS * 4);
  }

  frameAt(T) {
    const f = Math.min(this.frames.length - 1, Math.max(0, Math.round(T * FPS)));
    return this.frames[f];
  }

  /** Colony extent (world units) at time T, for framing. */
  extent(T) {
    const fr = this.frameAt(T);
    let m = 0.3;
    for (let i = 0; i < fr.n; i++) m = Math.max(m, Math.hypot(fr.data[i * 8], fr.data[i * 8 + 1]) + fr.data[i * 8 + 2]);
    return m;
  }

  drawColony(R, { T, cx, cy, scale, bright, green }) {
    const fr = this.frameAt(T);
    for (let i = 0; i < fr.n; i++) {
      const d = fr.data;
      this.ua.set([d[i * 8], d[i * 8 + 1], d[i * 8 + 2], d[i * 8 + 3]], i * 4);
      this.ub.set([d[i * 8 + 4], d[i * 8 + 5], d[i * 8 + 6], d[i * 8 + 7]], i * 4);
    }
    R.lowres(() => R.pass(this.prog, {
      u_center: [cx, cy], u_t: T, u_scale: scale, u_n: fr.n, u_bright: bright, u_green: green,
      u_a: this.ua, u_b: this.ub,
    }), 'add');
    return fr;
  }

  /** Oxygen bubbles rising from the colony. */
  drawBubbles(R, { T, cx, cy, scale, alpha, frame }) {
    if (alpha <= 0.001) return;
    const S = R.sprites;
    for (let k = 0; k < 90; k++) {
      const i = k % frame.n;
      const life = 3 + 2 * hash(k, 1);
      const age = ((T + hash(k, 2) * life) % life);
      const x = cx + frame.data[i * 8] * scale + Math.sin(age * 2 + k) * 6;
      const y = cy + frame.data[i * 8 + 1] * scale - age * scale * 0.18 - age * age * 8;
      const r = 1.5 + age * 1.3;
      S.add(x, y, r, [0.8, 0.95, 1.0], alpha * (1 - age / life) * 0.9, SHAPE.bubble);
    }
    S.flush('add');
  }

  drawEukaryote(R, { cx, cy, radius, t, eng, bright, bact }) {
    R.lowres(() => R.pass(this.euk, { u_c: [cx, cy], u_R: radius, u_t: t, u_eng: eng, u_bright: bright, u_bact: bact }), 'add');
  }

  /** A Volvox-like colony: hundreds of cells on a turning sphere, daughters inside. */
  drawVolvox(R, { cx, cy, radius, t, alpha }) {
    if (alpha <= 0.001) return;
    const S = R.sprites;
    const pts = [];
    const ball = (ox, oy, rr, n, spin, bright) => {
      for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), phi = i * 2.399963 + spin;
        const x = Math.cos(phi) * rad, z = Math.sin(phi) * rad;
        const tilt = 0.4, y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
        pts.push([ox + x * rr, oy + y2 * rr, z2, rr, bright]);
      }
    };
    ball(cx, cy, radius, 420, t * 0.35, 1);
    ball(cx - radius * 0.3, cy + radius * 0.15, radius * 0.28, 60, -t * 0.5, 0.8);
    ball(cx + radius * 0.25, cy - radius * 0.25, radius * 0.24, 50, t * 0.6, 0.8);
    ball(cx + radius * 0.1, cy + radius * 0.38, radius * 0.2, 40, t * 0.4, 0.7);
    pts.sort((a, b) => a[2] - b[2]);
    S.add(cx, cy, radius * 1.05, [0.35, 0.9, 0.55], alpha * 0.18, SHAPE.bubble);
    for (const [x, y, z, rr, b] of pts) {
      const s = rr * 0.055 * (0.85 + 0.15 * z);
      S.add(x, y, s * 2.2, [0.4, 1.0, 0.5], alpha * b * (0.25 + 0.2 * z) * 0.18, SHAPE.glow);
      S.add(x, y, s, [0.35, 0.85, 0.45], alpha * b * (0.25 + 0.35 * (z * 0.5 + 0.5)), SHAPE.disc);
    }
    S.flush('add');
  }
}

