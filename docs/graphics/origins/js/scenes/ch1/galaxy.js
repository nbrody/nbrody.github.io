// galaxy.js — Chapter 1, 50–84 s: a spiral galaxy condenses out of a knot of
// the cosmic web, then the camera dives into one of its stars.
//
// Spiral arms as density waves (Lin & Shu): every star moves on an ellipse,
// and the ellipse's orientation twists with radius. Where neighbouring
// ellipses crowd together — near their far ends — stars pile up, and those
// pile-ups trace two arms that rotate rigidly while the stars flow through
// them. Young blue stars, pink star-forming nebulae and dark dust are placed
// at the arm crests, where the compression makes them.
//
// Coordinates are galaxy-local: the disk has radius 1 and lies in the x–z
// plane (y is up).

import { HEADER } from '../../gfx/glsl.js';
import { PointCloud } from '../../gfx/gl.js';
import { RNG, TAU } from '../../lib/math.js';

export const TWIST = 5.2;      // ellipse orientation twist (rad per unit radius)
export const PATTERN = 0.05;   // arm pattern speed (rad per galaxy-second)
export const omegaAt = (a) => 0.55 / (a + 0.1);

const GAL_VS = `${HEADER}
in vec4 a_orb;   // a, e, theta0, height
in vec4 a_meta;  // kind, seed, brightness, size
in vec3 a_sph;   // pre-collapse position (the knot of the web)
uniform mat4 u_vp;
uniform float u_t, u_form, u_ps, u_rs, u_bright, u_ref, u_fade;
out vec3 v_col; out float v_a; out float v_soft;
const float TWIST = ${TWIST.toFixed(3)};
const float PATTERN = ${PATTERN.toFixed(3)};
void main() {
  float a = a_orb.x, e = a_orb.y, th0 = a_orb.z, h = a_orb.w;
  int kind = int(a_meta.x + 0.5);
  float seed = a_meta.y;
  float omega = 0.55 / (a + 0.1);
  // arm tracers ride with the pattern; ordinary stars flow along their orbits
  float th = (kind >= 2) ? th0 : th0 + omega * u_t;
  float phi = a * TWIST + PATTERN * u_t;
  float b = a * (1.0 - e);
  vec2 pe = vec2(a * cos(th), b * sin(th));
  vec2 pr = vec2(pe.x * cos(phi) - pe.y * sin(phi), pe.x * sin(phi) + pe.y * cos(phi));
  vec3 disk = vec3(pr.x, h, pr.y);
  if (kind == 1) {                       // bulge: a slowly turning spheroid
    float ang = u_t * 0.35 + seed * 0.2;
    vec3 s = a_sph * 0.2;
    disk = vec3(s.x * cos(ang) - s.z * sin(ang), s.y * 0.62, s.x * sin(ang) + s.z * cos(ang));
  }
  // collapse from the web's knot into the disk, spinning up as it goes
  float f = u_form;
  float swirl = (1.0 - f) * 2.5;
  vec3 sp = a_sph;
  sp = vec3(sp.x * cos(swirl) - sp.z * sin(swirl), sp.y, sp.x * sin(swirl) + sp.z * cos(swirl));
  vec3 pos = mix(sp, disk, f * f * (3.0 - 2.0 * f));

  vec4 clip = u_vp * vec4(pos, 1.0);
  float w = max(clip.w, 1e-5);
  float armness = pow(abs(cos(th)), 4.0);
  vec3 col;
  float lum = a_meta.z * u_bright;
  float size;
  v_soft = 0.0;
  if (kind == 0) {
    col = mix(vec3(1.0, 0.86, 0.68), vec3(0.72, 0.82, 1.0), armness * 0.8 + 0.1 * fract(seed * 9.1));
    lum *= (0.3 + 1.6 * armness) * (0.22 + 0.78 * smoothstep(0.04, 0.42, a));
  } else if (kind == 1) {
    col = vec3(1.0, 0.78, 0.52);
  } else if (kind == 2) {
    col = vec3(0.62, 0.76, 1.0);
  } else if (kind == 3) {
    col = vec3(0.0);                     // dust (drawn with a darkening blend)
  } else {
    col = vec3(1.0, 0.36, 0.56);         // H II regions
  }
  if (kind >= 3) {
    // extended: size grows with proximity, energy spread over the blob
    size = clamp(u_ps * a_meta.w / w, 1.0, 90.0);
    lum *= 1.0 / max(size * size * 0.08, 1.0);
    v_soft = 1.0;
  } else {
    // point sources: brightness follows the inverse-square law up close
    size = clamp(u_ps * a_meta.w * 0.35 / w, 1.0, 3.2);
    lum *= min(pow(u_ref / w, 2.0), 90.0);
  }
  // before collapse it is diffuse gas, not stars
  col = mix(vec3(0.55, 0.6, 1.0), col, f);
  lum *= mix(0.35, 1.0, f) * u_fade;
  v_col = col;
  v_a = lum;
  gl_PointSize = size * u_rs;
  gl_Position = clip.w <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
}`;

const GAL_FS = `${HEADER}
in vec3 v_col; in float v_a; in float v_soft; out vec4 o;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  float a = mix(exp(-r2 * 3.5), exp(-r2 * 2.2) * smoothstep(1.0, 0.6, r2), v_soft) * v_a;
  o = vec4(v_col * a, a);
}`;

export class Galaxy {
  constructor(R, seed = 21) {
    this.R = R;
    this.prog = R.program(GAL_VS, GAL_FS, 'ch1-galaxy');
    const rng = new RNG(seed);
    const counts = { disk: 90000, bulge: 22000, young: 9000, dust: 9000, hii: 1400 };
    const total = counts.disk + counts.bulge + counts.young + counts.dust + counts.hii;
    const data = new Float32Array(total * 11);
    let k = 0;
    const put = (a, e, th, h, kind, bright, size, sph) => {
      const o = k++ * 11;
      data[o] = a; data[o + 1] = e; data[o + 2] = th; data[o + 3] = h;
      data[o + 4] = kind; data[o + 5] = rng.next(); data[o + 6] = bright; data[o + 7] = size;
      data[o + 8] = sph[0]; data[o + 9] = sph[1]; data[o + 10] = sph[2];
    };
    const sphere = (r) => {
      const d = rng.dir3(), s = r * Math.cbrt(rng.next());
      return [d[0] * s, d[1] * s * 0.8, d[2] * s];
    };
    const ecc = (a) => 0.12 + 0.28 * Math.exp(-((a - 0.45) ** 2) / 0.08);
    const diskRadius = () => {
      // exponential disk, scale length 0.28, truncated at 1
      for (;;) {
        const a = -0.28 * Math.log(1 - rng.next() * 0.975);
        if (a > 0.04 && a < 1.05) return a;
      }
    };
    const armTheta = (spread) => (rng.next() < 0.5 ? 0 : Math.PI) + rng.gauss() * spread;

    // stars flowing through the arms (ranges: [0, arms) drawn additively)
    for (let i = 0; i < counts.disk; i++) {
      const a = diskRadius();
      put(a, ecc(a) * (0.85 + 0.3 * rng.next()), rng.range(0, TAU), rng.gauss() * 0.018 * (1 + 0.6 / (a * 6 + 0.5)),
        0, 0.13 + 0.12 * rng.next() ** 3, 1, sphere(1.3));
    }
    for (let i = 0; i < counts.bulge; i++) {
      const d = rng.dir3(), r = -0.45 * Math.log(1 - rng.next() * 0.98);
      put(0.05, 0, 0, 0, 1, 0.035 + 0.03 * rng.next(), 1, [d[0] * r, d[1] * r, d[2] * r]);
    }
    for (let i = 0; i < counts.young; i++) {
      const a = 0.18 + 0.85 * rng.next() ** 0.8;
      put(a, ecc(a), armTheta(0.38), rng.gauss() * 0.01, 2, 0.1 + 0.14 * rng.next() ** 2, 1.2, sphere(1.3));
    }
    this.nAdd = k;
    // dust lanes sit just inside the arm crests
    for (let i = 0; i < counts.dust; i++) {
      const a = 0.12 + 0.9 * rng.next() ** 0.9;
      put(a, ecc(a), armTheta(0.2) - 0.2, rng.gauss() * 0.006, 3, 0.55, 2.5 + 4 * rng.next(), sphere(1.3));
    }
    this.nDust = k - this.nAdd;
    for (let i = 0; i < counts.hii; i++) {
      const a = 0.2 + 0.8 * rng.next();
      put(a, ecc(a), armTheta(0.2) + 0.05, rng.gauss() * 0.008, 4, 0.12 + 0.25 * rng.next() ** 2, 1 + 2 * rng.next(), sphere(1.3));
    }
    this.nHii = k - this.nAdd - this.nDust;

    this.cloud = new PointCloud(R.gl, this.prog, data,
      [['a_orb', 4], ['a_meta', 4], ['a_sph', 3]]);

    // the star we will dive into: an ordinary disk star in an arm, 60% of the way out
    this.target = { a: 0.6, e: ecc(0.6), th0: 0.35, h: 0.004 };
  }

  /** Galaxy-local position of the dive target at galaxy time t. */
  targetPos(t) {
    const { a, e, th0, h } = this.target;
    const th = th0 + omegaAt(a) * t;
    const phi = a * TWIST + PATTERN * t;
    const b = a * (1 - e);
    const x = a * Math.cos(th), y = b * Math.sin(th);
    return [x * Math.cos(phi) - y * Math.sin(phi), h, x * Math.sin(phi) + y * Math.cos(phi)];
  }

  draw(R, u) {
    this.prog.use().setAll({
      u_vp: u.vp, u_t: u.t, u_form: u.form, u_ps: u.ps, u_rs: R.rs,
      u_bright: u.bright, u_ref: u.ref, u_fade: u.fade ?? 1,
    });
    const gl = R.gl;
    gl.bindVertexArray(this.cloud.vao);
    R.blend('add');
    gl.drawArrays(gl.POINTS, 0, this.nAdd);
    R.blend('darken');
    this.prog.set('u_bright', u.bright * (u.dust ?? 1) * 0.5);
    gl.drawArrays(gl.POINTS, this.nAdd, this.nDust);
    R.blend('add');
    this.prog.set('u_bright', u.bright);
    gl.drawArrays(gl.POINTS, this.nAdd + this.nDust, this.nHii);
    gl.bindVertexArray(null);
  }
}
