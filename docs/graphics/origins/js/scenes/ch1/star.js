// star.js — Chapter 1, ~81–87 s: a star's surface fills the frame.
// Granulation (convection cells, bright centres and dark lanes), limb
// darkening, sunspots, a chromosphere rim, prominences and the corona.

import { HEADER, NOISE, PALETTES } from '../../gfx/glsl.js';

const STAR_FS = `${HEADER}
uniform vec2 u_view, u_c;
uniform float u_R, u_t, u_bright, u_heat;
in vec2 v_px; out vec4 o;
${NOISE}
${PALETTES}
void main() {
  vec2 d = (v_px - u_c) / u_R;
  float r = length(d);
  vec3 col = vec3(0.0);
  float spin = u_t * 0.03;
  if (r < 1.0) {
    float z = sqrt(1.0 - r * r);
    vec3 n = vec3(d.x, -d.y, z);
    vec3 sn = vec3(n.x * cos(spin) + n.z * sin(spin), n.y, -n.x * sin(spin) + n.z * cos(spin));
    // granulation: cellular convection, slowly evolving
    vec3 gp = sn * 26.0 + vec3(0.0, 0.0, u_t * 0.05);
    vec2 w = worley3(gp + 0.25 * vec3(snoise(gp * 0.35 + u_t * 0.04)));
    float lanes = smoothstep(0.0, 0.1, w.y - w.x);
    float cell = 1.0 - w.x * 0.45;
    float gran = mix(0.6, 1.0, lanes) * cell;
    float meso = vfbm(sn * 6.0 + u_t * 0.02);
    // sunspots: umbra + penumbra
    float s = snoise(sn * 3.6 + vec3(7.0, 1.0, 3.0));
    float penumbra = smoothstep(0.7, 0.75, s), umbra = smoothstep(0.78, 0.83, s);
    float mu = z;
    float limb = 1.0 - 0.56 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
    float heat = u_heat * (0.86 + 0.1 * gran + 0.05 * meso) - 0.12 * (1.0 - mu);
    heat -= penumbra * 0.08 + umbra * 0.12;
    col = blackbody(heat) * limb * (0.45 + 0.75 * gran) * (1.0 - penumbra * 0.55 - umbra * 0.4);
    // faculae: bright patches near the limb
    col += blackbody(0.9) * smoothstep(0.62, 0.8, vfbm(sn * 9.0)) * pow(1.0 - mu, 2.0) * 0.35;
    col *= u_bright * 1.0;
  }
  // chromosphere, prominences, corona
  float h = r - 1.0;
  if (h > -0.02) {
    float ang = atan(d.y, d.x);
    vec2 ca = vec2(cos(ang), sin(ang));
    float rim = exp(-pow(h * 90.0, 2.0));
    float str = 0.5 + 0.5 * snoise(vec3(ca * 2.5, h * 1.5 - u_t * 0.03));
    float corona = exp(-max(h, 0.0) * 7.0) * (0.3 + 0.7 * str) * 0.7 + exp(-max(h, 0.0) * 1.8) * 0.12;
    float pr = snoise(vec3(ca * 7.0, h * 9.0 - u_t * 0.12));
    float prom = smoothstep(0.35, 0.8, pr) * exp(-max(h, 0.0) * 11.0) * smoothstep(-0.01, 0.01, h);
    col += (blackbody(0.74) * corona + vec3(1.0, 0.35, 0.3) * rim * 0.8 + vec3(1.2, 0.3, 0.22) * prom * 1.4) * u_bright;
  }
  o = vec4(col, 1.0);
}`;

export class StarSurface {
  constructor(R) {
    this.prog = R.fsProgram(STAR_FS, 'ch1-star');
  }

  draw(R, { cx, cy, radius, t, bright, heat = 0.78 }) {
    R.lowres(() => {
      R.pass(this.prog, { u_c: [cx, cy], u_R: radius, u_t: t, u_bright: bright, u_heat: heat });
    }, 'add');
  }
}
