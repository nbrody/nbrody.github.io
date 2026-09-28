// Marching Bears — rings of dancing bears circling above and below you, around a seventies sunburst.
import { startSphere, num } from '../sphereKit/kit.js';

const glsl = `
uniform float uRings;      // how many of the five rings march
uniform float uBearSize;   // fraction of each bear's slot it fills
uniform float uWalk;       // distance marched so far

// Rings in the order they appear: nearest the horizon first.
const float RING_EL[5] = float[5](0.1, 0.62, -0.52, 1.05, -1.02);
const float RING_N[5] = float[5](16.0, 11.0, 12.0, 6.0, 7.0);

float sdCap2(vec2 p, vec2 a, vec2 b, float r) { return sdSeg(p, a, b) - r; }

float bear(vec2 p, float ph) {
  float s1 = sin(ph), s2 = sin(ph + PI);
  float d = sdEllipse(p - vec2(0.0, -0.03), vec2(0.18, 0.23));
  d = smin(d, length(p - vec2(0.07, 0.28)) - 0.13, 0.05);
  d = smin(d, sdEllipse(p - vec2(0.2, 0.25), vec2(0.08, 0.055)), 0.03);
  d = min(d, length(p - vec2(-0.02, 0.4)) - 0.05);
  d = smin(d, sdCap2(p, vec2(0.06, 0.12), vec2(0.24, 0.17 + 0.12 * s1), 0.045), 0.02);
  d = smin(d, sdCap2(p, vec2(-0.06, 0.12), vec2(-0.2, 0.2 + 0.12 * s2), 0.045), 0.02);
  d = smin(d, sdCap2(p, vec2(0.06, -0.2), vec2(0.13 + 0.07 * s1, -0.47 + 0.12 * max(s1, 0.0)), 0.06), 0.02);
  d = smin(d, sdCap2(p, vec2(-0.06, -0.2), vec2(-0.1 - 0.07 * s1, -0.47 + 0.12 * max(s2, 0.0)), 0.06), 0.02);
  return d;
}

vec3 bearCol(float i) {
  i = mod(i, 6.0);
  return i < 1.0 ? vec3(0.92, 0.16, 0.2) : i < 2.0 ? vec3(1.0, 0.55, 0.08) : i < 3.0 ? vec3(1.0, 0.86, 0.15)
       : i < 4.0 ? vec3(0.2, 0.78, 0.3) : i < 5.0 ? vec3(0.2, 0.45, 0.95) : vec3(0.95, 0.4, 0.72);
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  float r = length(p), a = atan(p.y, p.x);
  float rayW = length(fwidth(p)) / max(r, 1e-3) * 14.0;
  float rays = mix(smoothstep(-0.1, 0.1, sin(a * 14.0 + t * 0.15)), 0.5, smoothstep(0.3, 1.0, rayW));
  vec3 col = mix(vec3(1.0, 0.58, 0.22), vec3(0.98, 0.36, 0.38), rays * 0.55);
  col = mix(col, vec3(0.32, 0.12, 0.5), smoothstep(0.3, 2.2, r));
  col = mix(col, vec3(1.0, 0.9, 0.45) * (1.0 + 0.3 * uPulse), smoothstep(0.17, 0.16, r));
  col = mix(col, vec3(1.0, 0.75, 0.3), smoothstep(0.012, 0.0, abs(r - 0.21 - 0.02 * uPulse)));
  vec2 ae = azel(d);
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    if (fk >= uRings) break;
    float elk = RING_EL[k], N = RING_N[k];
    float dir = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
    float S = TAU / N * cos(elk) * uBearSize;           // a bear's height, in radians
    float u = ae.x / TAU * N - dir * uWalk * (0.05 + 0.02 * fk);
    float id = floor(u);
    float ph = uBeat * PI + id * 1.7 + fk;
    vec2 bq = vec2((fract(u) - 0.5) * TAU / N * cos(ae.y) * dir, ae.y - elk) / S;
    bq.y -= 0.035 * abs(sin(ph));
    float sd = bear(bq, ph);
    if (sd < 0.05) {
      float px = gPix / S;
      vec3 fill = bearCol(id + fk * 2.0) * (0.85 + 0.3 * smoothstep(0.2, -0.3, bq.y - bq.x * 0.3));
      fill = mix(fill, vec3(1.0), smoothstep(0.03, 0.0, length(bq - vec2(0.02, 0.33)) - 0.02) * 0.35);
      vec3 c = mix(vec3(0.03), fill, smoothstep(px, -px, sd + 0.028));   // black outline
      c = mix(c, vec3(0.02), smoothstep(px, -px, length(bq - vec2(0.12, 0.31)) - 0.024));   // eye
      c = mix(c, vec3(0.02), smoothstep(px, -px, length(bq - vec2(0.275, 0.26)) - 0.028));  // nose
      col = mix(col, c, smoothstep(px, -px, sd));
    }
  }
  return col;
}
`;

// Distance marched is accumulated so changing the speed never makes the rings jump.
let walk = 0;
startSphere({
  glsl,
  pitch: 16,
  uniforms: { uRings: () => num('rings'), uBearSize: () => num('bearSize'), uWalk: () => walk },
  onFrame(_, dt) { walk += dt * num('march') * num('speed'); },
});
