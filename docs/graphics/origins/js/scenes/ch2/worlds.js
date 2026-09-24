// worlds.js — Chapter 2, 34–56 s: the cloud collapses into a young Sun and
// its dusty disk (rings and gaps like ALMA's image of HL Tauri), a planet
// gathers in one of the rings, and the early Earth cools from a molten ball
// to a world of oceans.

import { HEADER, NOISE, PALETTES } from '../../gfx/glsl.js';
import { PointCloud } from '../../gfx/gl.js';
import { RNG, TAU } from '../../lib/math.js';

const DISK_VS = `${HEADER}
in vec4 a_orb; // r, theta0, height, brightness
uniform mat4 u_vp;
uniform float u_t, u_ps, u_rs, u_bright;
out vec3 v_col; out float v_a;
void main() {
  float r = a_orb.x;
  float th = a_orb.y + 0.55 * pow(r, -1.5) * u_t;
  vec3 pos = vec3(r * cos(th), a_orb.z, r * sin(th));
  vec4 clip = u_vp * vec4(pos, 1.0);
  float w = max(clip.w, 1e-4);
  float size = clamp(u_ps / w, 1.0, 5.0);
  // lit by the young star: warm and bright inside, dusky red outside
  float lit = 0.3 / (r + 0.22);
  v_col = mix(vec3(1.0, 0.82, 0.55), vec3(0.75, 0.3, 0.15), smoothstep(0.1, 0.9, r));
  v_a = a_orb.w * lit * u_bright / max(size * size * 0.6, 1.0);
  gl_PointSize = size * u_rs;
  gl_Position = clip;
}`;

const DISK_FS = `${HEADER}
in vec3 v_col; in float v_a; out vec4 o;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(d, d) * 3.0) * v_a;
  o = vec4(v_col * a, a);
}`;

const NEBULA_FS = `${HEADER}
uniform vec2 u_view;
uniform float u_t, u_bright, u_zoom, u_stars;
uniform vec3 u_tint, u_tint2;
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 p = (v_px - 0.5 * u_view) / u_view.y / u_zoom;
  float n = vfbm(vec3(p * 1.4, u_t * 0.015));
  float n2 = vfbm(vec3(p * 3.2 + n * 1.5, 7.0 + u_t * 0.02));
  float dust = smoothstep(0.38, 0.72, n);
  vec3 col = mix(vec3(0.004, 0.006, 0.02), mix(u_tint, u_tint2, n2), dust * (0.55 + 0.45 * n2));
  col *= u_bright;
  vec2 g = floor(v_px / 2.5);
  float h = hash12(g);
  float star = step(0.9975, h) * (0.55 + 0.45 * sin(u_t * 2.0 + h * 90.0)) * (1.0 - dust * 0.8);
  col += vec3(0.9, 0.93, 1.0) * star * u_stars;
  o = vec4(col, 1.0);
}`;

const PLANET_FS = `${HEADER}
uniform vec2 u_view, u_c;
uniform float u_R, u_t, u_molten, u_sea, u_clouds, u_bright, u_spin;
uniform vec3 u_sun;
in vec2 v_px; out vec4 o;
${NOISE}
${PALETTES}
void main() {
  vec2 d = (v_px - u_c) / u_R;
  float r = length(d);
  vec3 col = vec3(0.0);
  vec3 sun = normalize(u_sun);
  if (r < 1.0) {
    vec3 n = vec3(d.x, -d.y, sqrt(1.0 - r * r));
    float a = u_spin;
    vec3 sn = vec3(n.x * cos(a) + n.z * sin(a), n.y, -n.x * sin(a) + n.z * cos(a));
    float h = sfbm(sn * 1.8 + 3.0) + 0.35 * sfbm(sn * 5.0);
    float light = max(dot(n, sun), 0.0);
    float amb = 0.03;
    // rock: basalt, craters of the late heavy bombardment
    vec2 cr = worley3(sn * 7.0);
    float crater = smoothstep(0.1, 0.0, cr.x) * 0.25;
    vec3 rock = mix(vec3(0.22, 0.2, 0.19), vec3(0.42, 0.33, 0.27), smoothstep(-0.3, 0.6, h)) * (1.0 - crater);
    col = rock * (amb + light * 1.1);
    // oceans rise into the low ground
    float sea = smoothstep(u_sea, u_sea - 0.04, h);
    vec3 water = mix(vec3(0.01, 0.06, 0.18), vec3(0.03, 0.2, 0.38), smoothstep(u_sea - 0.5, u_sea, h));
    vec3 hv = normalize(sun + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, hv), 0.0), 60.0) * 0.8;
    col = mix(col, water * (amb + light) + spec * light, sea);
    // molten: glowing cracks between dark crust plates, visible on the night side too
    vec2 w = worley3(sn * 5.0 + vec3(0.0, u_t * 0.03, 0.0));
    float crack = 1.0 - smoothstep(0.0, 0.09, w.y - w.x);
    float lava = u_molten * (crack * 1.6 + 0.25 * smoothstep(0.3, -0.4, h));
    col = mix(col, vec3(0.12, 0.05, 0.03) * (amb + light), u_molten * 0.7);
    col += blackbody(0.45 + 0.25 * crack) * lava;
    // clouds
    float cl = smoothstep(0.1, 0.55, sfbm(sn * 3.0 + vec3(u_t * 0.02, 0.0, 0.0))) * u_clouds;
    col = mix(col, vec3(0.9, 0.92, 0.95) * (amb + light), cl * 0.85);
    // atmosphere rim
    float rim = pow(1.0 - n.z, 3.0);
    col += vec3(0.3, 0.55, 1.0) * rim * (0.2 + light) * u_clouds * 0.9;
  }
  float halo = exp(-max(r - 1.0, 0.0) * 30.0) * smoothstep(0.98, 1.0, r);
  col += vec3(0.35, 0.6, 1.0) * halo * u_clouds * 0.5 + vec3(1.0, 0.4, 0.1) * halo * u_molten * 0.8;
  o = vec4(col * u_bright, 1.0);
}`;

export class Worlds {
  constructor(R) {
    this.R = R;
    this.nebula = R.fsProgram(NEBULA_FS, 'ch2-nebula');
    this.planet = R.fsProgram(PLANET_FS, 'ch2-planet');
    const prog = (this.diskProg = R.program(DISK_VS, DISK_FS, 'ch2-disk'));
    const rng = new RNG(77);
    const gaps = [0.3, 0.46, 0.62, 0.78, 0.9];
    const N = 70000, data = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      let r;
      for (;;) {
        r = 0.07 + 0.95 * Math.pow(rng.next(), 0.8);
        let keep = 1;
        for (const g of gaps) keep *= 1 - 0.9 * Math.exp(-(((r - g) / 0.018) ** 2));
        if (rng.next() < keep) break;
      }
      data[i * 4] = r;
      data[i * 4 + 1] = rng.range(0, TAU);
      data[i * 4 + 2] = rng.gauss() * 0.012 * (0.4 + r);
      data[i * 4 + 3] = 0.6 + 0.8 * rng.next();
    }
    this.disk = new PointCloud(R.gl, prog, data, [['a_orb', 4]]);
    this.planetR = 0.7;      // orbit of the planet we follow (in a ring, between gaps)
  }

  drawNebula(R, u) {
    R.lowres(() => R.pass(this.nebula, {
      u_t: u.t, u_bright: u.bright, u_zoom: u.zoom ?? 1, u_stars: u.stars ?? 1,
      u_tint: u.tint ?? [0.12, 0.2, 0.38], u_tint2: u.tint2 ?? [0.35, 0.16, 0.34],
    }), 'add');
  }

  drawDisk(R, u) {
    R.blend('add');
    this.diskProg.use().setAll({ u_vp: u.vp, u_t: u.t, u_ps: u.ps, u_rs: R.rs, u_bright: u.bright });
    this.disk.draw();
  }

  /** Planet position (disk-local) at disk time t. */
  planetPos(t) {
    const r = this.planetR, th = 1.1 + 0.55 * Math.pow(r, -1.5) * t;
    return [r * Math.cos(th), 0, r * Math.sin(th)];
  }

  drawPlanet(R, u) {
    R.lowres(() => R.pass(this.planet, {
      u_c: [u.cx, u.cy], u_R: u.radius, u_t: u.t, u_molten: u.molten, u_sea: u.sea,
      u_clouds: u.clouds, u_bright: u.bright, u_spin: u.spin, u_sun: u.sun ?? [-0.8, 0.25, 0.55],
    }), 'add');
  }
}
