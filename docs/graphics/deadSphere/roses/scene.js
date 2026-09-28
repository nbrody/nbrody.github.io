// Scarlet Roses — a garden of roses and leaves over the whole sky, one great bloom, falling petals.
import { startSphere, num } from '../kit/kit.js';

const glsl = `
uniform float uBloom;    // great rose radius on the focus chart; 0 hides it
uniform float uCols;     // garden cells around the equator (even)
uniform float uPetals;   // falling petals, 0..1

vec3 rose(vec2 q, float seed, float px, out float m) {
  float r = length(q), a = atan(q.y, q.x);
  float outer = 0.995 * (0.8 + 0.2 * sqrt(sin(fract(a / TAU * 6.0 + 1.85 + seed) * PI)));
  m = smoothstep(px, -px, r - outer);
  vec3 deep = vec3(0.22, 0.0, 0.03), mid = vec3(0.75, 0.03, 0.09), lite = vec3(1.0, 0.32, 0.3);
  vec3 col = deep;
  if (r > 1.0) return col;
  for (int n = 0; n < 6; n++) {
    float fn = float(n);
    float R = 0.22 + 0.155 * fn;
    float ph = fract(a / TAU * (3.0 + floor(fn * 0.7)) + fn * 0.37 + seed);
    float edge = R * (0.8 + 0.2 * sqrt(sin(ph * PI)));
    if (r < edge) {
      float inner = n == 0 ? 0.0 : (R - 0.155) * 0.56;
      float k = clamp((r - inner) / max(edge - inner, 1e-3), 0.0, 1.0);
      col = mix(deep, mid, smoothstep(0.0, 0.75, k));
      col = mix(col, lite, smoothstep(0.78, 1.0, k) * 0.65);
      col *= mix(0.4, 1.0, smoothstep(0.0, 0.012 + px, edge - r));
      col *= 0.8 + 0.2 * smoothstep(0.0, 0.2, min(ph, 1.0 - ph));
      if (n == 0 && r < 0.16) col = mix(deep, mid, 0.5 + 0.5 * sin(a + r * 60.0));   // the bud
      break;
    }
  }
  return col;
}

float sdVesica(vec2 p, float r, float dd) {
  p = abs(p);
  float b = sqrt(r * r - dd * dd);
  return (p.y - b) * dd > p.x * b ? length(p - vec2(0.0, b)) : length(p - vec2(-dd, 0.0)) - r;
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  vec2 ae = azel(d);
  vec3 col = mix(vec3(0.01, 0.04, 0.02), vec3(0.03, 0.0, 0.02), smoothstep(-1.2, 1.2, ae.y));
  col *= 0.7 + 0.6 * fbm3(d * 3.0 + t * 0.02);
  float cols = floor(uCols + 0.5);
  vec2 g = vec2(ae.x / TAU * cols + t * 0.02, asinh(tan(clamp(ae.y, -1.35, 1.35))) / TAU * cols);
  vec2 id = floor(g), f = fract(g) - 0.5;
  float cell = TAU / cols * cos(ae.y);
  float px = gPix / cell;
  float detail = smoothstep(0.12, 0.04, px);      // cells shrink toward the poles; fade them before they shimmer
  for (int i = 0; i < 2; i++) {
    float ang = hash12(id + float(i) * 3.1) * TAU;
    vec2 lp = rot(-ang) * f - vec2(0.0, 0.26);
    float ld = sdVesica(lp / 0.2, 1.0, 0.7) * 0.2;
    vec3 leaf = mix(vec3(0.03, 0.14, 0.05), vec3(0.1, 0.32, 0.1), smoothstep(-0.12, 0.2, lp.y));
    leaf = mix(leaf, vec3(0.16, 0.4, 0.14), smoothstep(0.006 + px, 0.0, abs(lp.x)) * 0.7);   // vein
    col = mix(col, leaf, smoothstep(px, -px, ld) * detail);
  }
  float h = hash12(id);
  vec2 cc = vec2((id.x + 0.5 - t * 0.02) / cols * TAU, atan(sinh((id.y + 0.5) / cols * TAU)));   // the cell's centre
  bool clear = uBloom <= 0.0 || length(focusPlane(dirAzEl(cc.x, cc.y))) > uBloom * 1.3 + 0.06;
  if (h > 0.3 && clear) {
    float m;
    float rr = 0.3 + 0.12 * hash12(id + 7.0);
    vec3 rc = rose(rot(t * 0.05 * (h - 0.5) + h * 6.0) * (f - (hash22(id) - 0.5) * 0.12) / rr, h * 3.0, px / rr, m);
    col = mix(col, rc * (1.0 + 0.25 * uPulse), m * detail);
  }
  // falling petals, on a Mercator grid so they stay petal-shaped all the way to the poles
  float merc = asinh(tan(clamp(ae.y, -1.35, 1.35)));
  for (int i = 0; i < 2; i++) {
    float fi = float(i), sc = 60.0 + fi * 32.0;
    vec2 pg = vec2(ae.x / TAU * sc, merc / TAU * sc + t * (0.6 + fi * 0.3));
    vec2 pid = floor(pg);
    vec2 pf = fract(pg) - 0.5 - (hash22(pid + fi * 9.0) - 0.5) * 0.5;
    float pd = sdEllipse(rot(t * 2.0 + hash12(pid) * 6.0) * pf, vec2(0.14, 0.08));
    float pfade = smoothstep(0.12, 0.04, gPix / (TAU / sc * cos(ae.y)));
    col = mix(col, vec3(0.8, 0.05, 0.12), smoothstep(0.03, -0.03, pd) * step(1.0 - 0.3 * uPetals, hash12(pid + fi)) * pfade);
  }
  // a rose over each pole, where the garden's grid pinches together
  float pr = 1.5708 - abs(ae.y);
  if (pr < 0.34) {
    float m;
    vec2 q = rot(t * 0.05 * sign(ae.y)) * vec2(cos(ae.x), sin(ae.x)) * pr / 0.3;
    vec3 rc = rose(q, sign(ae.y) * 0.2 + 0.6, gPix / 0.3, m);
    col = mix(col, rc * (1.0 + 0.25 * uPulse), m);
  }
  if (uBloom > 0.0) {
    float bloom = uBloom * (1.0 + 0.03 * sin(t * 0.5) + 0.04 * uPulse);
    col += vec3(0.6, 0.02, 0.08) * exp(-max(length(p) - bloom, 0.0) * 9.0) * (0.3 + 0.4 * uPulse);
    float bm;
    vec3 br = rose(rot(t * 0.04) * p / bloom, 0.1, gPix * 0.5 * (1.0 + dot(p, p)) / bloom, bm);
    col = mix(col, br, bm);
  }
  return col;
}
`;

startSphere({
  glsl,
  pitch: 16,
  uniforms: { uBloom: () => num('bloom'), uCols: () => num('roseCols'), uPetals: () => num('petals') },
});
