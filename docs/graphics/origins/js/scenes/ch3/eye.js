// eye.js — Chapter 3, 106–122 s: a human eye in firelight, the stars and
// the fire caught in it. The pupil opens and we fall through it into the
// dark — where Chapter 4 finds a single neuron.

import { HEADER, NOISE } from '../../gfx/glsl.js';

const EYE_FS = `${HEADER}
uniform vec2 u_view, u_c;
uniform float u_R, u_pupil, u_t, u_open, u_bright;
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 p = (v_px - u_c) / u_R;              // iris radius = 1
  float px = 1.0 / u_R;
  float r = length(p);
  float ang = atan(p.y, p.x);
  // the opening between the lids: an almond, slightly lifted at the outer corner
  float h = u_open * 1.3 * max(0.0, 1.0 - pow(abs(p.x + 0.1) / 2.9, 2.2));
  float upper = -h + 0.12 * p.x * 0.3, lower = h * 0.82;
  float open = smoothstep(upper - px * 2.0, upper + px * 2.0, p.y) * smoothstep(lower + px * 2.0, lower - px * 2.0, p.y) * smoothstep(0.0, 0.06, h);
  // firelight from below-left, cool starlight from above
  vec3 fire = vec3(1.0, 0.55, 0.22);
  // sclera, shaded as a sphere, with a few faint vessels
  float ball = sqrt(max(0.0, 1.0 - pow(length(p / vec2(3.2, 2.2)), 2.0)));
  float vessel = smoothstep(0.93, 1.0, vnoise(vec3(p * 6.0, 1.0)) * (0.6 + 0.4 * sin(ang * 12.0))) * smoothstep(1.2, 2.4, r);
  vec3 sclera = mix(vec3(0.34, 0.25, 0.2), vec3(0.78, 0.66, 0.56), ball * ball) * (0.55 + 0.45 * fire.r) + vec3(0.5, 0.05, 0.05) * vessel * 0.25;
  sclera = mix(sclera, vec3(0.6, 0.3, 0.28), smoothstep(2.1, 2.8, abs(p.x + 0.1)) * 0.6);   // pink corners
  // iris: radial fibres, crypts, collarette, limbal ring
  float fib = 0.5 + 0.5 * sin(ang * 110.0 + vnoise(vec3(ang * 9.0, r * 5.0, 3.0)) * 7.0);
  float fib2 = vnoise(vec3(cos(ang) * 14.0, sin(ang) * 14.0, r * 9.0));
  vec2 w = worley(vec2(ang * 7.0, r * 5.0));
  float crypt = smoothstep(0.35, 0.1, w.x) * smoothstep(0.35, 0.85, r);
  vec3 inner = vec3(0.95, 0.6, 0.22), outer = vec3(0.24, 0.46, 0.34);
  vec3 iris = mix(inner, outer, smoothstep(u_pupil + 0.05, 0.75, r));
  iris *= 0.45 + 0.4 * fib + 0.3 * fib2;
  iris *= 1.0 - crypt * 0.55;
  float collar = exp(-pow((r - (u_pupil + 0.2)) * 14.0, 2.0));
  iris += vec3(1.0, 0.75, 0.35) * collar * 0.25;
  iris *= 1.0 - smoothstep(0.82, 1.0, r) * 0.75;           // limbal ring
  float isIris = smoothstep(1.0 + px, 1.0 - px, r);
  vec3 eye = mix(sclera, iris * (0.55 + 0.6 * fire.g), isIris);
  // pupil, with a faint reflection of the night sky inside it
  float pupil = smoothstep(u_pupil + px * 1.5, u_pupil - px * 1.5, r);
  vec2 sg = floor((p + 3.0) * 120.0);
  float stars = step(0.992, hash12(sg)) * 0.35;
  eye = mix(eye, vec3(0.005) + vec3(stars), pupil);
  // catchlights: the fire, and the sky
  vec2 c1 = p - vec2(-0.32, 0.28);
  eye += fire * 1.4 * exp(-dot(c1 / vec2(0.16, 0.1), c1 / vec2(0.16, 0.1))) * (0.85 + 0.15 * sin(u_t * 13.0) * sin(u_t * 7.3));
  vec2 c2 = p - vec2(0.3, -0.35);
  eye += vec3(0.6, 0.7, 1.0) * 0.35 * exp(-dot(c2 / vec2(0.1, 0.07), c2 / vec2(0.1, 0.07)));
  // wet edge and shadow under the upper lid
  eye *= 1.0 - smoothstep(0.35, 0.0, p.y - upper) * 0.55;
  // skin and lashes outside the opening
  float skinN = vfbm(vec3(p * 3.0, 2.0));
  vec3 skin = vec3(0.42, 0.22, 0.13) * (0.35 + 0.35 * skinN) * (0.4 + 0.6 * smoothstep(2.5, -1.5, p.y - p.x * 0.3));
  float crease = exp(-pow((p.y - (upper - 0.55)) * 7.0, 2.0)) * smoothstep(3.0, 1.0, abs(p.x));
  skin *= 1.0 - crease * 0.5;
  float lashes = smoothstep(0.6, 1.0, sin(p.x * 55.0 + p.y * 10.0)) * smoothstep(0.25, 0.0, upper - p.y) * step(p.y, upper) * smoothstep(3.0, 1.5, abs(p.x));
  skin *= 1.0 - lashes * 0.85;
  vec3 col = mix(skin, eye, open);
  o = vec4(col * u_bright, 1.0);
}`;

export class Eye {
  constructor(R) {
    this.prog = R.fsProgram(EYE_FS, 'ch3-eye');
  }
  draw(R, { cx, cy, radius, pupil, t, open, bright }) {
    R.pass(this.prog, { u_c: [cx, cy], u_R: radius, u_pupil: pupil, u_t: t, u_open: open, u_bright: bright }, 'add');
  }
}
