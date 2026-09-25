// Shared GLSL: uniforms, colour helpers, noise, and a thin-tissue lighting model.
export const common = /* glsl */ `
uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform vec3  uGroundColor;

#define PI 3.14159265359

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
#define hexc(r, g, b) srgb(vec3(float(r), float(g), float(b)) / 255.0)

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

// Wrapped diffuse + translucency (petals and filaments are thin and glow when backlit)
vec3 shade(vec3 albedo, vec3 N, vec3 V, float trans, float spec, float gloss, float ao) {
  vec3 L = normalize(uSunDir);
  float ndl  = dot(N, L);
  float diff = max((ndl + 0.25) / 1.25, 0.0);
  float back = max(-ndl, 0.0) * trans;
  float thru = pow(max(dot(-V, L), 0.0), 4.0) * trans * 0.6;
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), gloss) * spec * smoothstep(0.0, 0.2, ndl);
  vec3 amb = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  vec3 col = albedo * (uSunColor * diff + amb * ao);
  col += albedo * uSunColor * (back + thru) * vec3(1.0, 1.0, 0.8);
  col += sp * uSunColor;
  return col;
}

vec3 finish(vec3 c) {
  c *= 0.85;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); // ACES fit
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
`;
