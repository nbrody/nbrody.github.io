// web.js — Chapter 1, 28–58 s: the cosmic web, grown with the Zel'dovich
// approximation.
//
// Each particle starts on a (jittered) lattice q and moves along a fixed
// displacement ψ(q) = −∇φ(q) scaled by the growth factor D:  x = q + D ψ.
// φ is a Gaussian random potential (a sum of periodic plane waves). The
// Jacobian I − D ∇∇φ tells us each particle's density exactly:
//     ρ = 1 / |(1 − Dλ₁)(1 − Dλ₂)(1 − Dλ₃)|
// with λ the eigenvalues of the Hessian — sheets collapse where Dλ₁ → 1,
// filaments where two do, knots where all three do. It's how cosmologists
// seed simulations, it's a pure function of D (seekable), and it runs
// entirely in the vertex shader.

import { HEADER } from '../../gfx/glsl.js';
import { PointCloud } from '../../gfx/gl.js';
import { RNG, TAU } from '../../lib/math.js';

const WEB_VS = `${HEADER}
in vec3 a_q; in vec3 a_psi; in vec3 a_lam; in float a_seed;
uniform mat4 u_vp;
uniform vec3 u_cam;
uniform float u_D, u_bright, u_fogFar, u_near, u_ps, u_stars, u_time, u_rs, u_fade;
out vec3 v_col; out float v_a;
void main() {
  vec3 x = a_q + u_D * a_psi;
  vec3 rel = x - u_cam;
  rel -= floor(rel + 0.5);             // periodic box, always centred on the camera
  vec4 clip = u_vp * vec4(u_cam + rel, 1.0);
  float dist = length(rel);
  vec3 f = 1.0 - u_D * a_lam;
  float rho = min(1.0 / max(abs(f.x * f.y * f.z), 0.012), 80.0);
  float fog = (1.0 - smoothstep(u_fogFar * 0.5, u_fogFar, dist)) * smoothstep(u_near * 0.3, u_near, dist);
  float size = clamp(u_ps / max(clip.w, 1e-4), 1.0, 9.0);
  float lum = (0.25 + pow(rho, 0.9)) * u_bright * fog;

  vec3 cVoid = vec3(0.32, 0.30, 0.95), cFil = vec3(0.50, 0.82, 1.0), cNode = vec3(1.0, 0.78, 0.52);
  vec3 col = mix(cVoid, cFil, smoothstep(1.3, 7.0, rho));
  col = mix(col, cNode, smoothstep(12.0, 50.0, rho));

  // the first stars ignite in the densest knots
  float star = u_stars * step(0.955, fract(a_seed * 7.13)) * smoothstep(6.0, 26.0, rho) * fog;
  float tw = 0.65 + 0.35 * sin(u_time * (2.0 + 5.0 * fract(a_seed * 3.1)) + a_seed * 40.0);
  col = mix(col, vec3(1.0, 0.92, 0.82), min(star, 1.0));
  lum = mix(lum, 3.0 * tw * fog, min(star, 1.0));
  size = mix(size, size * 1.6 + 1.2, min(star, 1.0));

  v_a = lum * u_fade / max(size * size * 0.5, 1.0);
  v_col = col;
  gl_PointSize = size * u_rs;
  gl_Position = (fog <= 0.001 || clip.w <= 0.0) ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
}`;

const WEB_FS = `${HEADER}
in vec3 v_col; in float v_a; out vec4 o;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(d, d) * 3.2) * v_a;
  o = vec4(v_col * a, a);
}`;

/** Eigenvalues (descending) of the symmetric matrix [[a,d,e],[d,b,f],[e,f,c]]. */
function eig3(a, b, c, d, e, f, out, o) {
  const p1 = d * d + e * e + f * f;
  if (p1 < 1e-18) {
    const s = [a, b, c].sort((x, y) => y - x);
    out[o] = s[0]; out[o + 1] = s[1]; out[o + 2] = s[2];
    return;
  }
  const q = (a + b + c) / 3;
  const p = Math.sqrt(((a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1) / 6);
  const b11 = (a - q) / p, b22 = (b - q) / p, b33 = (c - q) / p, b12 = d / p, b13 = e / p, b23 = f / p;
  const det = b11 * (b22 * b33 - b23 * b23) - b12 * (b12 * b33 - b23 * b13) + b13 * (b12 * b23 - b22 * b13);
  const r = Math.max(-1, Math.min(1, det / 2));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi);
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  out[o] = e1; out[o + 1] = 3 * q - e1 - e3; out[o + 2] = e3;
}

export class CosmicWeb {
  constructor(R, { n = 96, waves = 120, seed = 5, dFinal = 1.55 } = {}) {
    this.R = R;
    this.n = n;
    this.N = n * n * n;
    this.dFinal = dFinal;
    this.prog = R.program(WEB_VS, WEB_FS, 'ch1-web');
    this.ready = false;
    this.job = this._build(seed, waves);
  }

  /** Spend up to `ms` on the precompute; call once per frame until ready. */
  step(ms = 5) {
    if (this.ready) return true;
    const t0 = performance.now();
    while (!this.ready && performance.now() - t0 < ms) {
      if (this.job.next().done) this.ready = true;
    }
    return this.ready;
  }
  finish() { while (!this.ready) this.step(1e9); }

  *_build(seed, K) {
    const n = this.n, N = this.N;
    const rng = new RNG(seed);
    // wavevectors: log-uniform in |k| (equal modes per octave), random directions,
    // snapped to integers so the box stays periodic
    const waves = [];
    while (waves.length < K) {
      const target = Math.exp(rng.range(Math.log(2.2), Math.log(15)));
      const d = rng.dir3();
      const nx = Math.round(d[0] * target), ny = Math.round(d[1] * target), nz = Math.round(d[2] * target);
      const m = Math.hypot(nx, ny, nz);
      if (m < 1.5) continue;
      waves.push({ nx, ny, nz, amp: Math.pow(m, -2.3) * (0.6 + 0.8 * rng.next()), ph: rng.range(0, TAU) });
    }
    const psi = new Float32Array(N * 3), hes = new Float32Array(N * 6);
    const xs = new Float32Array(n);
    for (let i = 0; i < n; i++) xs[i] = (i + 0.5) / n;
    const cx = new Float32Array(n), sx = new Float32Array(n), cy = new Float32Array(n),
          sy = new Float32Array(n), cz = new Float32Array(n), sz = new Float32Array(n);

    for (let w = 0; w < K; w++) {
      const { nx, ny, nz, amp, ph } = waves[w];
      const kx = TAU * nx, ky = TAU * ny, kz = TAU * nz;
      for (let i = 0; i < n; i++) {
        cx[i] = Math.cos(kx * xs[i]); sx[i] = Math.sin(kx * xs[i]);
        cy[i] = Math.cos(ky * xs[i]); sy[i] = Math.sin(ky * xs[i]);
        cz[i] = Math.cos(kz * xs[i] + ph); sz[i] = Math.sin(kz * xs[i] + ph);
      }
      // φ = Σ amp cos(k·q + ph);  ψ = −∇φ = Σ amp k sin(...);  H = ∇∇φ = −Σ amp k kᵀ cos(...)
      const ax = amp * kx, ay = amp * ky, az = amp * kz;
      const hxx = amp * kx * kx, hyy = amp * ky * ky, hzz = amp * kz * kz;
      const hxy = amp * kx * ky, hxz = amp * kx * kz, hyz = amp * ky * kz;
      let p = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cab = cx[i] * cy[j] - sx[i] * sy[j];
          const sab = sx[i] * cy[j] + cx[i] * sy[j];
          for (let l = 0; l < n; l++, p++) {
            const s = sab * cz[l] + cab * sz[l];
            const c = cab * cz[l] - sab * sz[l];
            const p3 = p * 3, p6 = p * 6;
            psi[p3] += ax * s; psi[p3 + 1] += ay * s; psi[p3 + 2] += az * s;
            hes[p6] -= hxx * c; hes[p6 + 1] -= hyy * c; hes[p6 + 2] -= hzz * c;
            hes[p6 + 3] -= hxy * c; hes[p6 + 4] -= hxz * c; hes[p6 + 5] -= hyz * c;
          }
        }
      }
      if (w % 3 === 2) yield;
    }

    const lam = new Float32Array(N * 3);
    for (let p = 0; p < N; p++) {
      const h = p * 6;
      eig3(hes[h], hes[h + 1], hes[h + 2], hes[h + 3], hes[h + 4], hes[h + 5], lam, p * 3);
      if ((p & 32767) === 32767) yield;
    }

    // normalise D so that D = 1 is when ~12% of the volume has shell-crossed
    const sample = [];
    for (let p = 0; p < N; p += 13) sample.push(lam[p * 3]);
    sample.sort((a, b) => a - b);
    const Dc = 1 / sample[Math.floor(sample.length * 0.88)];

    const data = new Float32Array(N * 10);
    const jr = new RNG(seed + 1);
    for (let p = 0, i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let l = 0; l < n; l++, p++) {
          const o = p * 10;
          data[o] = xs[i] + (jr.next() - 0.5) * 0.7 / n;
          data[o + 1] = xs[j] + (jr.next() - 0.5) * 0.7 / n;
          data[o + 2] = xs[l] + (jr.next() - 0.5) * 0.7 / n;
          data[o + 3] = psi[p * 3] * Dc; data[o + 4] = psi[p * 3 + 1] * Dc; data[o + 5] = psi[p * 3 + 2] * Dc;
          data[o + 6] = lam[p * 3] * Dc; data[o + 7] = lam[p * 3 + 1] * Dc; data[o + 8] = lam[p * 3 + 2] * Dc;
          data[o + 9] = jr.next();
        }
      }
      if (i % 16 === 15) yield;
    }

    // find the richest knot at the final growth factor: that's where our galaxy forms
    const G = 24, hist = new Float32Array(G * G * G);
    const D = this.dFinal;
    const wrap = (v) => v - Math.floor(v);
    for (let p = 0; p < N; p++) {
      const o = p * 10;
      const x = wrap(data[o] + D * data[o + 3]), y = wrap(data[o + 1] + D * data[o + 4]), z = wrap(data[o + 2] + D * data[o + 5]);
      hist[((x * G) | 0) * G * G + ((y * G) | 0) * G + ((z * G) | 0)]++;
    }
    let best = 0;
    for (let c = 1; c < hist.length; c++) if (hist[c] > hist[best]) best = c;
    const bi = Math.floor(best / (G * G)), bj = Math.floor(best / G) % G, bk = best % G;
    const cc = [(bi + 0.5) / G, (bj + 0.5) / G, (bk + 0.5) / G];
    let sx2 = 0, sy2 = 0, sz2 = 0, cnt = 0;
    for (let p = 0; p < N; p++) {
      const o = p * 10;
      let dx = data[o] + D * data[o + 3] - cc[0], dy = data[o + 1] + D * data[o + 4] - cc[1], dz = data[o + 2] + D * data[o + 5] - cc[2];
      dx -= Math.round(dx); dy -= Math.round(dy); dz -= Math.round(dz);
      if (dx * dx + dy * dy + dz * dz < (1.5 / G) ** 2) { sx2 += dx; sy2 += dy; sz2 += dz; cnt++; }
    }
    this.node = [wrap(cc[0] + sx2 / cnt), wrap(cc[1] + sy2 / cnt), wrap(cc[2] + sz2 / cnt)];

    this.cloud = new PointCloud(this.R.gl, this.prog, data,
      [['a_q', 3], ['a_psi', 3], ['a_lam', 3], ['a_seed', 1]]);
  }

  draw(R, u) {
    if (!this.ready) return;
    R.blend('add');
    this.prog.use().setAll({
      u_vp: u.vp, u_cam: u.cam, u_D: u.D, u_bright: u.bright, u_fogFar: u.fogFar, u_near: u.near,
      u_ps: u.ps, u_stars: u.stars, u_time: u.time, u_rs: R.rs, u_fade: u.fade ?? 1,
    });
    this.cloud.draw();
  }
}
