// Fire on the Mountain — standing in a caldera: a burning ridge all around, an erupting
// peak ahead, lava running down the slopes, embers rising, a cracked lava lake below.
import { startSphere, $, num } from '../kit/kit.js';

const glsl = `
uniform float uFlame;
uniform float uEmbers;
uniform float uLava;
uniform float uErupt;    // 0..1, decays after the Erupt button

vec3 fireRamp(float x) { x = clamp(x, 0.0, 1.5); return vec3(1.6 * x, 1.2 * x * x, 0.9 * x * x * x * x) * 1.1; }

float ridgeAt(float az) {
  vec2 cs = vec2(cos(az), sin(az));
  float r = 0.03 + 0.12 * fbm3(vec3(cs * 2.2, 0.5)) + 0.05 * fbm3(vec3(cs * 7.0, 3.0));
  return r + 0.36 * exp(-az * az * 3.5) - 0.05 * exp(-az * az * 180.0);   // the mountain and its crater
}
float shoreAt(float az) { vec2 cs = vec2(cos(az), sin(az)); return -0.34 + 0.06 * (fbm3(vec3(cs * 3.0, 7.0)) - 0.5); }

// The caldera floor, seen in perspective: plates of crust with glowing seams that slowly drift.
vec3 lavaLake(vec3 d, float t) {
  vec2 p = d.xz / max(-d.y, 0.05) * 3.4 + vec2(t * 0.04, t * 0.015);
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.5 + 0.4 * sin(t * 0.25 + TAU * hash22(i + g));
    vec2 r = g + o - f;
    float dd = dot(r, r);
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
  }
  float seam = sqrt(d2) - sqrt(d1);
  float heat = 0.6 + 0.8 * vnoise(p * 0.7 + t * 0.1);    // some seams run hotter than others
  float glow = exp(-seam * 15.0) * heat * (0.75 + 0.5 * uPulse) * uLava * (1.0 + uErupt);
  vec3 crust = vec3(0.045, 0.016, 0.01) * (0.6 + 0.8 * vnoise(p * 3.0)) + vec3(0.12, 0.02, 0.0) * exp(-seam * 5.0) * uLava;
  return crust + fireRamp(glow) + vec3(0.25, 0.05, 0.0) * uLava * smoothstep(-0.2, -0.9, d.y) * 0.3;
}

vec3 scene(vec3 d, float t) {
  vec2 ae = azel(d);
  float az = ae.x, el = ae.y;
  float hh = el - ridgeAt(az);
  vec2 cs = vec2(cos(az), sin(az));
  vec3 col = mix(vec3(0.16, 0.02, 0.02), vec3(0.01, 0.0, 0.03), smoothstep(-0.1, 1.0, hh));
  col += stars(d) * smoothstep(0.4, 1.0, el) * 0.8;
  float smoke = fbm3(vec3(cs * 2.0, el * 2.5 - t * 0.05) + 1.0);
  col = mix(col, vec3(0.35, 0.08, 0.03) * (1.0 + uPulse + uErupt), smoothstep(0.45, 0.8, smoke) * exp(-max(hh, 0.0) * 1.2) * 0.8);
  float column = exp(-az * az * 40.0);
  float height = (0.12 + (0.35 + 0.9 * uErupt) * column + 0.08 * uPulse + 0.06 * uLevel) * uFlame;
  float n = fbm3(vec3(cs * 5.0, hh * 5.0 - t * 1.4)) * 0.6 + fbm3(vec3(cs * 11.0, hh * 9.0 - t * 2.2)) * 0.4;
  col += fireRamp(clamp(n * 1.25 - hh / height, 0.0, 1.5) * step(-0.02, hh) * 1.2);
  for (int i = 0; i < 2; i++) {
    float fi = float(i), sc = 26.0 + fi * 14.0;
    vec2 g = vec2(az * sc, el * sc - t * (1.2 + fi * 0.7 + uErupt * 2.0));
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5 - (hash22(id + fi * 31.0) - 0.5) * 0.6;
    f.x += 0.15 * sin(t * 2.0 + id.y);
    float spark = exp(-dot(f, f) * 240.0) * step(1.0 - 0.36 * uEmbers - 0.3 * uErupt, hash12(id + fi * 7.0));
    col += vec3(1.0, 0.55, 0.15) * spark * smoothstep(1.0, 0.0, hh) * step(0.0, hh) * 1.5;
  }
  float shore = shoreAt(az);
  if (hh < 0.0) {
    // the slopes: black rock with lava running downhill, brightest under the crater
    float veins = abs(fbm3(vec3(cs * 9.0, el * 1.2 + t * 0.03)) - 0.5);
    float lava = smoothstep(0.03, 0.0, veins) * exp(hh * 4.0) * (0.7 + 0.6 * uPulse) * (0.3 + column * (1.8 + 2.0 * uErupt)) * uLava;
    float strata = fbm3(vec3(cs * 16.0, el * 20.0));
    col = vec3(0.03, 0.014, 0.012) * (0.5 + strata) + vec3(0.3, 0.06, 0.01) * exp(hh * 16.0) + fireRamp(lava) * 0.9;
    col += vec3(0.35, 0.08, 0.01) * uLava * exp(-(el - shore) * 14.0) * 0.5;   // lit from the lake below
  }
  if (el < shore) col = mix(col, lavaLake(d, t), smoothstep(shore, shore - 0.02, el));
  return col;
}
`;

// Erupt: a burst that fades over a few seconds.
let erupt = 0;
const blow = () => { erupt = 1; };
$('erupt').addEventListener('click', blow);

startSphere({
  glsl,
  pitch: 10,
  keys: { e: blow },
  uniforms: { uFlame: () => num('flame'), uEmbers: () => num('embers'), uLava: () => num('lava'), uErupt: () => erupt },
  onFrame(_, dt) { erupt *= Math.exp(-dt * 0.6); },
});
