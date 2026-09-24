// early.js — Chapter 1, 0–31 s: the void, the Big Bang, the quark–gluon
// plasma, the first nuclei, recombination and the cosmic microwave background.
//
// All of it is a pure function of chapter time T, so seeking is free.
// Quarks carry color charge — drawn literally as red, green and blue sparks —
// and when they bind into protons and neutrons the three colors add to white.

import { HEADER, NOISE, PALETTES } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { env, seg, smoothstep, ease, hash, lerp, TAU } from '../../lib/math.js';

const PLASMA_FS = `${HEADER}
uniform vec2 u_view;
uniform float u_t, u_temp, u_scale, u_bright, u_cmb, u_cmbBright, u_ellipse;
in vec2 v_px; out vec4 o;
${NOISE}
${PALETTES}
void main() {
  vec2 p = (v_px - 0.5 * u_view) / u_view.y;
  vec3 col = vec3(0.0);

  if (u_bright > 0.001) {
    vec3 q = vec3(p * u_scale, u_t * 0.10);
    vec2 w = vec2(vfbm(q), vfbm(q + vec3(5.2, 1.3, 2.8)));
    float n = vfbm(vec3(p * u_scale * 1.4 + (w - 0.5) * 3.0, u_t * 0.16 + 3.1));
    float m = clamp((n - 0.5) * 3.4, -1.0, 1.0);
    float ridge = pow(1.0 - abs(m), 7.0);
    float body = 0.5 + 0.5 * m;
    float heat = u_temp * (0.5 + 0.32 * body + 0.35 * ridge);
    col = blackbody(heat) * u_bright * (0.04 + 0.28 * body * body + 1.3 * ridge);
  }

  if (u_cmb > 0.001) {
    // the map shrinks into its familiar ellipse as we pull back from it
    float A = mix(2.6, 0.43 * u_view.x / u_view.y, u_ellipse);
    vec2 e = p / vec2(A, A * 0.5);
    float le = length(e);
    float inside = 1.0 - smoothstep(0.985, 1.0, le);
    vec2 mp = e * vec2(2.0, 1.0);
    float c = 0.5 + 0.30 * snoise(vec3(mp * 2.2, 1.3)) + 0.17 * snoise(vec3(mp * 5.3, 4.1))
                  + 0.10 * snoise(vec3(mp * 11.0, 7.9)) + 0.07 * snoise(vec3(mp * 23.0, 2.2))
                  + 0.04 * snoise(vec3(mp * 47.0, 5.7));
    c = 0.5 + (c - 0.5) * 1.25 + 0.02 * sin(u_t * 0.7 + mp.x * 3.0);
    vec3 cmb = planckCMB(c) * inside;
    float rim = exp(-pow((le - 1.0) * 90.0, 2.0)) * u_ellipse * 0.35;
    col = mix(col, cmb * u_cmbBright + vec3(0.6, 0.75, 1.0) * rim * u_cmbBright, u_cmb);
  }
  o = vec4(col, 1.0);
}`;

const QUARK = [[1.35, 0.18, 0.12], [0.18, 1.2, 0.22], [0.2, 0.35, 1.5]];
const TEMP_KEYS = [[6.3, 1.18], [9, 1.02], [13, 0.84], [17, 0.64], [21, 0.47], [24, 0.34]];

function tempAt(T) {
  if (T <= TEMP_KEYS[0][0]) return TEMP_KEYS[0][1];
  for (let i = 1; i < TEMP_KEYS.length; i++) {
    const [t1, v1] = TEMP_KEYS[i];
    if (T <= t1) {
      const [t0, v0] = TEMP_KEYS[i - 1];
      return lerp(v0, v1, ease.inOutSine((T - t0) / (t1 - t0)));
    }
  }
  return TEMP_KEYS[TEMP_KEYS.length - 1][1];
}

export const BANG = 6.2;

export class EarlyUniverse {
  constructor(R) {
    this.R = R;
    this.prog = R.fsProgram(PLASMA_FS, 'ch1-plasma');
    this.nB = 240;
  }

  /** Flash and lens effects for the compositor. */
  post(T) {
    let flash = 0;
    if (T > BANG) {
      const k = T - BANG;
      flash = k < 0.12 ? smoothstep(0, 0.12, k) : Math.exp(-(k - 0.12) * 1.9);
    }
    return {
      flash: flash * 0.97,
      ca: 1.2 * Math.max(0, 1 - Math.abs(T - BANG - 0.6) / 1.6),
      exposure: 1 + 0.3 * env(T, BANG, BANG + 4, 0.1, 3),
    };
  }

  render(R, T) {
    const W = R.W, H = R.H, cx = W / 2, cy = H / 2;
    const S = R.sprites;

    // ── 1. the void and the point ─────────────────────────────────────────
    if (T < BANG + 0.5) {
      const charge = Math.pow(seg(T, 4.6, BANG), 3);
      const flick = 0.7 + 0.3 * Math.sin(T * 23.0) * Math.sin(T * 7.3 + 1.2);
      const I = smoothstep(0.6, 3.0, T) * flick * (1 - seg(T, BANG + 0.05, BANG + 0.4)) + charge * 7;
      S.add(cx, cy, 3 + charge * 10, [1, 0.95, 0.9], I * 1.6, SHAPE.glow);
      S.add(cx, cy, 18 + charge * 90, [0.8, 0.85, 1.0], I * 0.28, SHAPE.flare, 0.9);
      S.add(cx, cy, 60 + charge * 200, [0.5, 0.55, 1.0], I * 0.06, SHAPE.glow);

      // virtual particle pairs: pop out of nothing, annihilate
      const pull = ease.inCubic(seg(T, 4.4, BANG));
      for (let k = 0; k < 70; k++) {
        const s = 1.4 + k * 0.066 + hash(k, 3) * 0.05;
        const L = 0.7 + hash(k, 4) * 0.4;
        const age = T - s;
        if (age < 0 || age > L) continue;
        const u = age / L;
        const rho = (16 + 90 * hash(k, 1)) * (1 - pull * 0.92);
        const th = hash(k, 2) * TAU;
        const px = cx + Math.cos(th) * rho, py = cy + Math.sin(th) * rho;
        const phi = hash(k, 5) * TAU, d = Math.sin(Math.PI * u) * (5 + 9 * hash(k, 6));
        const a = Math.sin(Math.PI * u) * 0.9 * smoothstep(1.2, 2.2, T);
        const dx = Math.cos(phi) * d, dy = Math.sin(phi) * d;
        S.add(px + dx, py + dy, 3.2, [1.0, 0.8, 0.55], a, SHAPE.glow);
        S.add(px - dx, py - dy, 3.2, [0.5, 0.8, 1.0], a, SHAPE.glow);
        if (u > 0.9) S.add(px, py, 7, [1, 1, 1], (u - 0.9) * 10 * 0.8, SHAPE.glow);
      }
      S.flush('add');
    }

    // ── 2. plasma → CMB (fullscreen, half resolution) ─────────────────────
    const plasmaOn = T > BANG && T < 32.5;
    if (plasmaOn) {
      const clearing = smoothstep(21.8, 25.5, T);
      const bright = lerp(0.8, 0.6, seg(T, 7, 21)) * (1 - clearing) * smoothstep(BANG, BANG + 0.25, T);
      const cmb = smoothstep(22.2, 25.2, T);
      R.lowres(() => {
        R.pass(this.prog, {
          u_t: T,
          u_temp: tempAt(T),
          u_scale: lerp(5.5, 1.5, ease.outCubic(seg(T, BANG, 24))),
          u_bright: bright,
          u_cmb: cmb,
          u_cmbBright: 0.62 * (1 - smoothstep(29.2, 32.2, T)),
          u_ellipse: ease.inOutCubic(seg(T, 25.4, 29.4)),
        });
      }, 'add');
    }

    // ── 3. expansion flash geometry ───────────────────────────────────────
    if (T > BANG && T < BANG + 2.5) {
      const k = T - BANG;
      S.add(cx, cy, k * 3200 + 20, [1, 0.97, 0.92], 4 * Math.exp(-k * 1.4), SHAPE.glow);
      S.add(cx, cy, k * 1500 + 10, [0.8, 0.9, 1.0], 1.6 * Math.exp(-k * 2.5), SHAPE.ring, 0.05);
      S.flush('add');
    }

    // ── 4. quarks → hadrons → nuclei → atoms ──────────────────────────────
    const vis = env(T, 7.4, 26.5, 1.6, 2.2);
    if (vis > 0.001) {
      const expand = 1 + 0.035 * (T - BANG);
      const scale = Math.max(W, H) * 0.62;
      for (let b = 0; b < this.nB; b++) {
        const bx = (hash(b, 11) - 0.5) * 2, by = (hash(b, 12) - 0.5) * 2 * (H / Math.max(W, H));
        let x = cx + bx * scale * expand + Math.sin(T * 0.3 + b) * 12;
        let y = cy + by * scale * expand + Math.cos(T * 0.27 + b * 1.7) * 12;
        // pairs drift together to make the first nuclei
        const pair = b % 5 === 1;
        const fuse = pair ? ease.inOutCubic(seg(T, 15.8 + hash(b, 13) * 2.2, 18.2 + hash(b, 13) * 2.2)) : 0;
        if (pair) {
          const b0 = b - 1;
          const px = cx + (hash(b0, 11) - 0.5) * 2 * scale * expand + Math.sin(T * 0.3 + b0) * 12;
          const py = cy + (hash(b0, 12) - 0.5) * 2 * (H / Math.max(W, H)) * scale * expand + Math.cos(T * 0.27 + b0 * 1.7) * 12;
          x = lerp(x, px + 5, fuse);
          y = lerp(y, py + 3, fuse);
        }
        const bind = ease.inOutCubic(seg(T, 11.2 + hash(b, 14) * 2.5, 13.2 + hash(b, 14) * 2.5));
        const spread = lerp(46 + 40 * hash(b, 15), 2.6, bind);
        const spin = T * (2 + 6 * bind) + b;
        for (let q = 0; q < 3; q++) {
          const wx = Math.sin(T * (1.1 + hash(b * 3 + q, 16)) + hash(b * 3 + q, 17) * 9) +
                     0.5 * Math.sin(T * 2.3 + q * 2.1 + b);
          const wy = Math.cos(T * (0.9 + hash(b * 3 + q, 18)) + hash(b * 3 + q, 19) * 9) +
                     0.5 * Math.cos(T * 1.9 + q * 1.3 + b);
          const ox = lerp(wx * spread * 0.7, Math.cos(spin + (q * TAU) / 3) * spread, bind);
          const oy = lerp(wy * spread * 0.7, Math.sin(spin + (q * TAU) / 3) * spread, bind);
          S.add(x + ox, y + oy, lerp(4.2, 2.6, bind), QUARK[q], vis * lerp(0.9, 0.75, bind), SHAPE.glow);
        }
        if (bind > 0) S.add(x, y, 9, [1, 0.96, 0.9], vis * bind * 0.22, SHAPE.glow);
        // flash when a pair touches
        if (pair && fuse > 0.97) {
          const age = (fuse - 0.97) / 0.03;
          S.add(x, y, 14 + age * 10, [1, 0.9, 0.7], vis * (1 - age) * 1.6, SHAPE.glow);
        }
        // recombination: an electron settles around every nucleus
        const e = smoothstep(21.6, 24.0, T + hash(b, 20) * 0.8);
        if (e > 0) S.add(x, y, lerp(22, 8, e), [0.55, 0.8, 1.0], vis * e * 0.5, SHAPE.ring, 0.12);
      }
      S.flush('add');
    }
  }
}
