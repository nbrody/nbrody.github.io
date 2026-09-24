// mind.js — Chapter 4's higher layers: memories that surface as
// constellations of earlier chapters, a river of words that collapses into
// "I", a self at the centre, and the reach toward another mind.

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { hash, clamp, lerp, smoothstep, ease, seg, TAU } from '../../lib/math.js';
import { outlineOf } from '../ch3/creatures.js';

const BG_FS = `${HEADER}
uniform vec2 u_view;
uniform float u_t, u_bright;
uniform vec3 u_tint;
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 p = (v_px - 0.5 * u_view) / u_view.y;
  float r = length(p);
  float n = vfbm(vec3(p * 1.8, u_t * 0.03));
  vec3 col = mix(vec3(0.03, 0.015, 0.07), vec3(0.008, 0.004, 0.02), smoothstep(0.0, 0.9, r));
  col += u_tint * (0.05 + 0.1 * n) * smoothstep(1.0, 0.1, r);
  o = vec4(col * u_bright, 1.0);
}`;

// ── memories: shapes from the story so far ─────────────────────────────────

function spiral() {
  const pts = [];
  for (const arm of [0, 1]) {
    for (let k = 0; k < 40; k++) {
      const th = (k / 40) * 3.2 * Math.PI, r = 0.08 * Math.exp(0.21 * th);
      pts.push([Math.cos(th + arm * Math.PI) * r, Math.sin(th + arm * Math.PI) * r * 0.75]);
    }
  }
  return { pts, open: true, arms: 2 };
}
function helix() {
  const a = [], b = [];
  for (let k = 0; k <= 36; k++) {
    const x = -1 + (2 * k) / 36;
    a.push([x, 0.32 * Math.sin(x * 5)]);
    b.push([x, -0.32 * Math.sin(x * 5)]);
  }
  return { pts: [...a, ...b], open: true, arms: 2, rungs: true };
}
function flame() {
  const pts = [];
  for (let k = 0; k < 60; k++) {
    const t = k / 60, a = t * TAU;
    const r = 0.45 * (1 - 0.55 * Math.sin(a) - 0.1 * Math.cos(a * 3));
    pts.push([Math.cos(a) * r * 0.75 * (1 - 0.4 * Math.max(0, -Math.sin(a))), -Math.sin(a) * r * 1.4 + 0.1]);
  }
  return { pts, open: false };
}
function face() {
  // a profile, looking up — the one who stood by the fire
  const c = [[0.35, 0.95], [0.1, 0.9], [-0.05, 0.72], [-0.02, 0.5], [0.05, 0.38], [0.22, 0.3], [0.1, 0.22],
    [0.14, 0.12], [0.08, 0.06], [0.1, -0.05], [0.02, -0.15], [-0.08, -0.2], [-0.12, -0.45], [-0.18, -0.7],
    [-0.55, -0.72], [-0.7, -0.4], [-0.72, 0.1], [-0.6, 0.55], [-0.3, 0.85]];
  return { pts: c.map(([x, y]) => [x * 1.05, y]), open: false };
}
function eye() {
  const pts = [];
  for (let k = 0; k < 40; k++) {
    const t = k / 40, x = -1 + 2 * t;
    pts.push([x * 0.95, 0.38 * (1 - x * x)]);
  }
  for (let k = 0; k < 40; k++) {
    const t = k / 40, x = 1 - 2 * t;
    pts.push([x * 0.95, -0.3 * (1 - x * x)]);
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    pts.push([Math.cos(a) * 0.26, Math.sin(a) * 0.26]);
  }
  return { pts, open: false, loops: [80, 24] };
}
function fish() {
  const src = outlineOf('fish');
  const pts = [];
  for (let k = 0; k < src.length; k += 3) pts.push([src[k][0] * 0.9, src[k][1] * 0.9]);
  return { pts, open: false };
}

export const MEMORIES = [
  { t: 56.5, shape: spiral(), color: [1.0, 0.85, 0.6], label: 'galaxy' },
  { t: 59.4, shape: helix(), color: [0.55, 0.95, 1.0], label: 'molecule' },
  { t: 62.3, shape: fish(), color: [0.45, 0.9, 1.0], label: 'fish' },
  { t: 65.2, shape: flame(), color: [1.0, 0.6, 0.25], label: 'fire' },
  { t: 68.1, shape: eye(), color: [0.6, 1.0, 0.7], label: 'eye' },
  { t: 71.0, shape: face(), color: [1.0, 0.9, 0.8], label: 'face' },
];
const MEM_LEN = 3.6;

export function memoryAlpha(m, T) {
  return smoothstep(m.t, m.t + 0.8, T) * (1 - smoothstep(m.t + MEM_LEN - 0.9, m.t + MEM_LEN, T));
}

// ── words ──────────────────────────────────────────────────────────────────

const WORDS = ('fire water star mother hunger home sky why light dark we you remember tomorrow love fear ' +
  'dream name sun child river stone hand song rain cold warm moon breath blood seed tree path ' +
  'lost found here there always never other self').split(' ');

export class Mind {
  constructor(R) {
    this.bg = R.fsProgram(BG_FS, 'ch4-bg');
  }

  drawBackground(R, T, tint, bright) {
    R.lowres(() => R.pass(this.bg, { u_t: T, u_bright: bright, u_tint: tint }), 'add');
  }

  /** Map a memory's shape to screen points. */
  shapePoints(m, cx, cy, s) {
    return m.shape.pts.map(([x, y]) => [cx + x * s, cy - y * s]);
  }

  drawMemory(R, m, T, cx, cy, s) {
    const a = memoryAlpha(m, T);
    if (a <= 0.001) return;
    const S = R.sprites, L = R.lines;
    const pts = this.shapePoints(m, cx, cy, s);
    const c = m.color;
    const drawOn = clamp((T - m.t) / 1.2);
    const n = pts.length;
    const segs = m.shape.loops || (m.shape.arms ? [n / m.shape.arms, n / m.shape.arms] : [n]);
    let start = 0;
    for (const len of segs) {
      const closed = !m.shape.open;
      const count = closed ? len : len - 1;
      for (let k = 0; k < count * drawOn; k++) {
        const p = pts[start + k], q = pts[start + ((k + 1) % len)];
        L.add(p[0], p[1], q[0], q[1], 1.3, c, a * 0.8, c, a * 0.8, 0);
        L.add(p[0], p[1], q[0], q[1], 6, c, a * 0.12, c, a * 0.12, 1);
      }
      start += len;
    }
    if (m.shape.rungs) {
      const half = n / 2;
      for (let k = 0; k < half; k += 3) {
        const p = pts[k], q = pts[half + k];
        L.add(p[0], p[1], q[0], q[1], 0.8, c, a * 0.35 * drawOn, c, a * 0.35 * drawOn, 0);
      }
    }
    L.flush('add');
    for (let k = 0; k < n; k++) {
      if (k / n > drawOn + 0.05) continue;
      const tw = 0.6 + 0.4 * Math.sin(T * (3 + 3 * hash(k, 2)) + k);
      S.add(pts[k][0], pts[k][1], 3.5, c, a * tw * 1.2, SHAPE.glow);
      if (k % 5 === 0) S.add(pts[k][0], pts[k][1], 9, c, a * tw * 0.35, SHAPE.flare, 0.6);
    }
    S.flush('add');
  }

  /** Words flow in a river, then fall into the centre and become "I". */
  drawWords(R, T, W, H) {
    if (T < 67 || T > 92) return;
    const g = R.begin2D();
    const cx = W / 2, cy = H / 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const converge = ease.inOutCubic(seg(T, 82.5, 86.5));
    for (let k = 0; k < 52; k++) {
      const t0 = 67.5 + k * 0.29;
      const age = T - t0;
      if (age < 0) continue;
      const word = WORDS[k % WORDS.length];
      const lane = hash(k, 3) - 0.5;
      const speed = W / (7 + 3 * hash(k, 4));
      let x = W + 60 - age * speed;
      let y = cy + lane * H * 0.55 + Math.sin(x / W * 5 + k) * H * 0.05;
      if (x < -80 && converge <= 0) continue;
      x = lerp(x, cx, converge);
      y = lerp(y, cy, converge);
      const size = (15 + 17 * hash(k, 5)) * (1 - converge * 0.8);
      const a = smoothstep(0, 0.8, age) * (1 - converge) * (0.45 + 0.5 * hash(k, 6));
      if (a <= 0.01) continue;
      g.font = `${hash(k, 7) < 0.3 ? 'italic ' : ''}300 ${size.toFixed(1)}px "Avenir Next", "Helvetica Neue", sans-serif`;
      g.fillStyle = `rgba(235, 225, 255, ${a})`;
      g.fillText(word, x, y);
    }
    // "I"
    const iA = smoothstep(85.5, 87.2, T) * (1 - smoothstep(89.2, 90.8, T));
    if (iA > 0.01) {
      const size = H * 0.22 * (1 - 0.8 * smoothstep(89.2, 90.8, T));
      g.font = `200 ${size.toFixed(1)}px "Avenir Next", "Helvetica Neue", sans-serif`;
      g.shadowColor = `rgba(255, 210, 150, ${iA})`;
      g.shadowBlur = size * 0.25;
      g.fillStyle = `rgba(255, 245, 230, ${iA})`;
      g.fillText('I', cx, cy + size * 0.03);
      g.shadowBlur = 0;
    }
    R.flush2D(1.6);
  }

  /** The self: a bright point at the centre that pulses with the shared beat. */
  drawSelf(R, x, y, T, pulse, alpha, scale = 1) {
    if (alpha <= 0.001) return;
    const S = R.sprites;
    S.add(x, y, 42 * scale * (1 + 0.25 * pulse), [1, 0.85, 0.6], alpha * (0.2 + 0.2 * pulse), SHAPE.glow);
    S.add(x, y, 8 * scale, [1, 0.95, 0.85], alpha * 1.8, SHAPE.glow);
    S.add(x, y, 45 * scale * (1 + 0.2 * pulse), [1, 0.9, 0.75], alpha * 0.6, SHAPE.flare, 0.9);
    S.add(x, y, 20 * scale * (1 + 1.5 * pulse), [1, 0.9, 0.7], alpha * 0.5 * pulse, SHAPE.ring, 0.08);
    S.flush('add');
  }

  /** Other minds and the tendrils that reach them. */
  drawReach(R, T, from, others, pulse) {
    const S = R.sprites, L = R.lines;
    for (const o of others) {
      const a = smoothstep(o.t, o.t + 1.2, T);
      if (a <= 0) continue;
      // halo of orbiting cells: a small mind of its own
      for (let k = 0; k < 26; k++) {
        const ang = (k / 26) * TAU + T * (0.4 + 0.2 * hash(k, o.seed)) * (k % 2 ? 1 : -1);
        const rr = o.r * (0.5 + 0.5 * hash(k, o.seed + 1));
        S.add(o.x + Math.cos(ang) * rr, o.y + Math.sin(ang) * rr * 0.8, 1.8, o.c, a * 0.8, SHAPE.glow);
      }
      S.add(o.x, o.y, o.r * 1.6, o.c, a * 0.2 * (1 + pulse * 0.4), SHAPE.glow);
      S.add(o.x, o.y, 5, [1, 1, 1], a * 1.6, SHAPE.glow);
      // tendril from the first mind (or from the previous one)
      const src = o.from ? others.find((q) => q.id === o.from) : from;
      const grow = clamp((T - o.t + 1.8) / 2.2);
      if (grow <= 0) continue;
      const mx = (src.x + o.x) / 2 + (o.bend ?? 0) * (o.y - src.y) * 0.3, my = (src.y + o.y) / 2 - (o.bend ?? 0) * (o.x - src.x) * 0.3;
      let px = src.x, py = src.y;
      const n = 24;
      for (let k = 1; k <= n * grow; k++) {
        const u = k / n, v = 1 - u;
        const qx = v * v * src.x + 2 * v * u * mx + u * u * o.x, qy = v * v * src.y + 2 * v * u * my + u * u * o.y;
        L.add(px, py, qx, qy, 1.3, [1, 0.85, 0.65], 0.7 * Math.min(1, a + 0.5), [1, 0.85, 0.65], 0.7 * Math.min(1, a + 0.5), 0);
        L.add(px, py, qx, qy, 6, [1, 0.7, 0.4], 0.12, [1, 0.7, 0.4], 0.12, 1);
        px = qx; py = qy;
      }
      // light pulses travelling across once connected
      if (grow >= 1) {
        for (let j = 0; j < 2; j++) {
          const u = ((T * 0.45 + j * 0.5 + hash(o.seed, 9)) % 1), v = 1 - u;
          const qx = v * v * src.x + 2 * v * u * mx + u * u * o.x, qy = v * v * src.y + 2 * v * u * my + u * u * o.y;
          S.add(qx, qy, 6, [1, 0.9, 0.7], 1.2, SHAPE.glow);
        }
      }
    }
    L.flush('add');
    S.flush('add');
  }
}
