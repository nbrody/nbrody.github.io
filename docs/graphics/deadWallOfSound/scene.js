// Wall of Sound — the 1974 system wrapped into a sphere: amps at eye level, then woofers,
// mids and tweeters rising (and falling) to glowing crowns at both poles.
import { startSphere, num } from '../sphereKit/kit.js';

const glsl = `
uniform float uCols;   // cabinets around the equator (even)
uniform float uTurn;   // how far the wall has turned, in columns
uniform float uWash;   // strength of the colored light wash

vec3 wash(vec3 d, float t) {
  vec3 w = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 c = dirAzEl(sin(t * 0.13 + fi * 1.9) * 1.3 + fi * 1.0472 - 2.5, 0.9 * sin(t * 0.21 + fi * 2.7));
    float a = acos(clamp(dot(d, c), -1.0, 1.0));
    w += rainbow(fi * 0.17 + t * 0.015) * exp(-a * a * 5.0);
  }
  return w;
}

vec3 cone(vec2 q, float R, float px, float pump, float ring, vec3 L) {
  float r = length(q) / R, aa = px / R + 0.002;
  float lit = 0.5 + 0.5 * dot(normalize(q + 1e-6), vec2(-0.45, -0.9));   // the bowl's lower wall faces the light
  vec3 c = vec3(0.02);
  c = mix(c, vec3(0.03) + L * 0.05 * lit, smoothstep(1.0 + aa, 1.0 - aa, r));
  float paper = smoothstep(0.86 + aa, 0.86 - aa, r);
  c = mix(c, vec3(0.07, 0.068, 0.065) * (0.85 + 0.15 * sin(atan(q.y, q.x) * 24.0)) + L * (0.05 + 0.18 * lit * (1.0 - r)), paper);
  vec2 hq = q / R - vec2(-0.08, 0.1);
  float cap = smoothstep(0.3 + aa, 0.3 - aa, r);
  c = mix(c, vec3(0.1) + L * (0.25 + 1.4 * pump) + exp(-dot(hq, hq) * 90.0) * (0.6 + pump), cap);
  c += L * exp(-pow((r - ring) * 14.0, 2.0)) * (1.0 - ring) * paper * 0.8;   // pressure ring
  c += vec3(0.5) * smoothstep(0.035 + aa, 0.0, abs(r - 1.05)) * (0.3 + 0.7 * lit);  // chrome trim
  return c;
}

vec3 scene(vec3 d, float t) {
  vec2 ae = azel(d);
  float el = clamp(ae.y, -1.3, 1.3);
  float cols = floor(uCols + 0.5);
  vec2 g = vec2(ae.x / TAU * cols + uTurn, asinh(tan(el)) / TAU * cols);   // Mercator: square cabinets
  vec2 id = floor(g), f = fract(g) - 0.5;
  float row = id.y >= 0.0 ? id.y : -id.y - 1.0;       // rows count away from the equator, up and down
  f.y *= el >= 0.0 ? 1.0 : -1.0;                        // light from the poles on both halves
  float cellPx = gPix / (TAU / cols * cos(el));
  vec3 L = wash(d, t) * uWash + 0.08;
  float sa = acos(clamp(dot(d, FOCUS), -1.0, 1.0));
  L += vec3(1.0, 0.95, 0.85) * exp(-pow((sa - fract(uBeat) * 3.1) * 5.0, 2.0)) * (1.0 - fract(uBeat)) * 0.9;   // a ring on every beat
  float pump = uPulse, ring = fract(uBeat);
  float face = smoothstep(0.46 + cellPx, 0.46 - cellPx, max(abs(f.x), abs(f.y)));
  vec3 col = mix(vec3(0.004), vec3(0.055, 0.04, 0.03) + L * 0.02, face);
  if (row < 0.5) {
    // amplifiers: black glass, blue meters, green logo, silver handles
    col = mix(col, vec3(0.01), face * 0.8);
    vec2 m = vec2(abs(f.x) - 0.2, f.y - 0.07);
    float lvl = clamp(0.25 + 0.55 * uLevel * (0.7 + 0.6 * hash12(id + step(0.0, f.x))) + 0.3 * pump, 0.0, 1.0);
    vec3 meter = vec3(0.1, 0.5, 1.0) * (0.9 + 0.3 * (1.0 - length(m / vec2(0.15, 0.1))));
    float needle = sdSeg(m, vec2(0.0, -0.09), vec2(0.0, -0.09) + 0.17 * vec2(sin((lvl - 0.5) * 1.6), cos((lvl - 0.5) * 1.6)));
    meter = mix(meter, vec3(0.02), smoothstep(0.008 + cellPx, 0.0, needle));
    col = mix(col, meter, smoothstep(cellPx, -cellPx, max(abs(m.x) - 0.15, abs(m.y) - 0.1)));
    col = mix(col, vec3(0.2, 1.0, 0.45), smoothstep(cellPx, -cellPx, max(abs(f.x) - 0.12, abs(f.y + 0.2) - 0.018)) * 0.9);
    col = mix(col, vec3(0.35) + L * 0.2, smoothstep(0.045 + cellPx, 0.045, length(vec2(abs(f.x) - 0.3, f.y + 0.3))));
    col = mix(col, vec3(0.7) + L * 0.3, smoothstep(cellPx, 0.0, max(abs(abs(f.x) - 0.44) - 0.015, abs(f.y) - 0.3)));
  } else if (row < 14.5) {
    float sub = row < 6.5 ? 1.0 : (row < 10.5 ? 2.0 : 3.0);   // woofers, then 2×2 mids, then 3×3 tweeters
    vec2 q = sub > 1.0 ? fract(f * sub + 0.5) - 0.5 : f;
    vec3 c = cone(q, sub > 2.0 ? 0.34 : 0.38, cellPx * sub, sub > 2.0 ? pump * 0.7 : pump, ring, L);
    c = mix(vec3(0.04) + L * 0.08, c, smoothstep(0.2, 0.06, cellPx * sub));   // too small to resolve: their average
    col = mix(col, c, face);
  }
  // the crowns: rings of lights running in to each pole on the beat, spokes, a bright core
  float pr = 1.5708 - abs(ae.y);
  float leds = exp(-pow((fract(pr * 18.0 + uBeat * 0.5) - 0.5) * 6.0, 2.0));
  float spokes = pow(abs(cos(ae.x * 8.0 + t * 0.3 * sign(ae.y))), 30.0) * smoothstep(0.4, 0.05, pr);
  vec3 crown = L * (0.15 + 0.8 * leds) + vec3(1.0, 0.9, 0.7) * (exp(-pr * 14.0) * (0.6 + pump) + spokes * 0.4);
  return mix(col, crown, smoothstep(0.42, 0.28, pr));
}
`;

// The wall's turn is accumulated here so changing its speed never makes it jump.
let turn = 0;
startSphere({
  glsl,
  pitch: 8,
  uniforms: { uCols: () => num('cols'), uTurn: () => turn, uWash: () => num('wash') },
  onFrame(_, dt) { turn = (turn + dt * num('spin') * num('speed')) % 1e4; },
});
