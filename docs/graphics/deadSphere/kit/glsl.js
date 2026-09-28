// glsl.js — the GLSL every full-sphere scene is compiled with.
//
// The viewer sits at the centre of the scene and can look in any direction.
// A scene is one function of the view direction and its own clock,
//   vec3 scene(vec3 d, float t)
// with y up and "ahead" toward −z. It compiles as HEAD + scene + MAIN.

export const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform mat3 uCamRot;    // columns: right, up, forward
uniform float uFov;      // radians across the longer side of the view
uniform int uLens;       // 0 rectilinear, 1 equidistant fisheye
uniform float uPix;      // radians per pixel at the centre of the view
uniform float uTime;     // wall clock (twinkles), stops while paused
uniform float uSceneTime;
uniform float uBeat;     // beats elapsed
uniform float uPulse;    // 0..1 kick envelope
uniform float uLevel;    // 0..1 overall energy
uniform float uHue;      // hue rotation, radians
uniform float uTrip;     // 0..1 warp of the whole sphere
uniform float uFlash;    // lightning envelope
uniform vec2 uBolt;      // lightning azimuth, seed
out vec4 fragColor;

#define PI 3.14159265
#define TAU 6.28318531
float gPix = 0.001;      // radians of sphere covered by this pixel

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
                 mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
                 mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
  return s / 0.96875;
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.9375;
}

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(TAU * (c * t + d)); }
vec3 rainbow(float t) { return pal(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67)); }
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdEllipse(vec2 p, vec2 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }

// Azimuth (0 ahead, positive to the right) and elevation of a direction.
vec2 azel(vec3 d) { return vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0))); }
vec3 dirAzEl(float az, float el) { return vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el)); }
// Where the eye rests by default: ahead and a little up.
const vec3 FOCUS = vec3(0.0, 0.2873, -0.9578);
// Stereographic chart centred on FOCUS: conformal, |p| = tan(angle / 2); the point behind is at infinity.
vec2 focusPlane(vec3 d) { return vec2(d.x, dot(d, vec3(0.0, 0.9578, 0.2873))) / max(1.0 + dot(d, FOCUS), 1e-3); }

vec3 starLayer(vec3 d, float scale, float density) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 h = hash33(c);
  vec3 s = c + 0.25 + 0.5 * hash33(c + 11.0);
  float r = length(p - s);
  float size = 0.04 + 0.08 * h.y;
  float w = max(size, gPix * scale * 0.9);          // never thinner than a pixel: no shimmer
  float g = exp(-r * r / (w * w)) * (size * size) / (w * w);
  vec3 tint = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.82, 0.62), h.z);
  float tw = 0.8 + 0.2 * sin(uTime * (2.0 + 3.0 * h.z) + h.y * 40.0);
  return tint * g * step(h.x, density) * (0.7 + 0.8 * h.y) * tw;
}
vec3 stars(vec3 d) { return starLayer(d, 60.0, 0.25) * 1.4 + starLayer(d, 140.0, 0.3) + starLayer(d, 300.0, 0.35) * 0.7; }
`;

export const MAIN = `
vec3 cameraRay(vec2 frag) {
  vec2 p = (2.0 * frag - uRes) / max(uRes.x, uRes.y);
  vec3 d;
  if (uLens == 1) {
    float r = length(p);
    float th = r * uFov * 0.5;
    vec2 q = r > 1e-6 ? p / r : vec2(0.0);
    d = vec3(q * sin(th), cos(th));
  } else {
    d = vec3(p * tan(uFov * 0.5), 1.0);
  }
  return normalize(uCamRot * d);
}

// A forked bolt from high overhead down past the horizon at azimuth uBolt.x.
vec3 lightning(vec3 d) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  if (el > 1.35 || el < -0.6) return vec3(0.0);
  float s = 1.35 - el;
  float off = (fbm(vec2(s * 2.2, uBolt.y)) - 0.5) * 0.5 + (vnoise(vec2(s * 14.0, uBolt.y * 3.1)) - 0.5) * 0.06;
  float x = (mod(atan(d.x, -d.z) - uBolt.x + PI, TAU) - PI) * cos(el);
  float dx = abs(x - off);
  float c = exp(-dx / 0.0025) + exp(-dx / 0.05) * 0.35;
  float s2 = s - 0.5;
  if (s2 > 0.0) {
    float off2 = off + s2 * (hash11(uBolt.y) - 0.5) * 1.2 + (vnoise(vec2(s2 * 12.0, uBolt.y * 7.0)) - 0.5) * 0.08;
    c += exp(-abs(x - off2) / 0.002) * exp(-s2 * 2.0);
  }
  return vec3(0.75, 0.8, 1.0) * c * 2.0;
}

void main() {
  vec3 rd = cameraRay(gl_FragCoord.xy);
  gPix = uPix;
  vec3 d = rd;
  if (uTrip > 0.001) {
    vec3 q = d * 1.7 + vec3(0.0, uTime * 0.05, 0.0);
    vec3 w = vec3(vnoise3(q), vnoise3(q + 17.3), vnoise3(q + 41.9)) - 0.5;
    d = normalize(d + w * uTrip * (0.22 + 0.18 * uPulse));
  }
  vec3 col = hueRotate(max(scene(d, uSceneTime), 0.0), uHue);
  if (uFlash > 0.001) col += lightning(rd) * uFlash + col * uFlash * 0.3;
  col = mix(col, 1.0 - 0.2 * exp(-(col - 0.8) / 0.2), step(0.8, col));   // soft shoulder above 0.8
  vec2 uv = gl_FragCoord.xy / uRes;
  col *= 1.0 - 0.22 * pow(length(uv - 0.5) * 1.25, 2.5);
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
