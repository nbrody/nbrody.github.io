// shaders.js — GLSL shared by the two passes.
//
// World units: the Sphere's interior is the unit sphere centred at the origin,
// y up, the stage toward −z. One unit is about 70 m. The screen covers the
// sphere above screenEdge(); below it are the seating bowl and walls.
//
// Pass 1 (a scene program, one per scene) shades the dome content seen through
// every pixel into a mipmapped texture. Pass 2 (COMPOSITE) traces the venue —
// floor, stage and band, the crowd in front of you, beams — over that texture,
// and uses its mips for the screen's spill light and glow.

export const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;   // columns: right, up, forward
uniform float uFov;     // radians across the longer side of the view
uniform int uLens;      // 0 rectilinear, 1 equidistant fisheye
uniform float uPix;     // radians per pixel at the centre of the view
uniform float uTime;
uniform float uBeat;    // beats elapsed
uniform float uPulse;   // 0..1 kick envelope
uniform float uLevel;   // 0..1 overall energy
out vec4 fragColor;

#define PI 3.14159265
#define TAU 6.28318531

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
// Distance to the dome from a point inside it.
float domeExit(vec3 ro, vec3 rd) { float b = dot(ro, rd); float c = dot(ro, ro) - 1.0; return -b + sqrt(max(b * b - c, 0.0)); }
// The screen's lower edge: just above the stage in front, above the top row at the back.
float screenEdge(vec3 p) { return -0.5 + 0.55 * smoothstep(-1.0, 1.0, p.z); }
// Azimuth from the stage (positive toward +x) and elevation, seen from the centre.
vec2 azel(vec3 d) { return vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0))); }
vec3 dirAzEl(float az, float el) { return vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el)); }
// Where the eye rests from the seats: ahead of the stage and a little up.
const vec3 FOCUS = vec3(0.0, 0.2873, -0.9578);
// Stereographic chart centred on FOCUS: conformal, |p| = tan(angle / 2).
vec2 focusPlane(vec3 d) { return vec2(d.x, dot(d, vec3(0.0, 0.9578, 0.2873))) / max(1.0 + dot(d, FOCUS), 1e-3); }
`;

// Declarations every scene may use; gPix is set per pixel before scene() runs.
export const SCENE_HEAD = `
uniform float uSceneTime;
uniform float uFade;
uniform float uHue;
uniform float uTrip;
float gPix = 0.001;   // dome radians covered by this pixel

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

export const SCENE_MAIN = `
void main() {
  vec3 rd = cameraRay(gl_FragCoord.xy);
  float th = domeExit(uCamPos, rd);
  vec3 P = uCamPos + rd * th;
  vec3 d = normalize(P);
  gPix = uPix * th / max(dot(rd, d), 0.2);
  if (uTrip > 0.001) {
    vec3 q = d * 1.7 + vec3(0.0, uTime * 0.05, 0.0);
    vec3 w = vec3(vnoise3(q), vnoise3(q + 17.3), vnoise3(q + 41.9)) - 0.5;
    d = normalize(d + w * uTrip * (0.22 + 0.18 * uPulse));
  }
  vec3 col = hueRotate(max(scene(d, uSceneTime), 0.0), uHue);
  float e = screenEdge(P);
  col *= smoothstep(e - 0.004, e + 0.004, P.y);   // only the screen emits
  float a = 1.0;
  if (uFade < 0.999) {
    // the next scene opens like an iris from where the eye rests
    float ang = acos(clamp(dot(d, FOCUS), -1.0, 1.0)) / PI;
    float n = (fbm3(d * 3.0 + 4.0) - 0.5) * 0.35;
    a = smoothstep(ang + n - 0.06, ang + n + 0.06, uFade * 1.6 - 0.3);
  }
  fragColor = vec4(col, a);
}
`;

export const COMPOSITE = `
uniform sampler2D uScreen;
uniform float uGain;      // screen brightness
uniform float uBloom;
uniform float uBand;
uniform float uCrowd;     // rows of people in front of the seat
uniform float uRake;      // how steeply those rows fall away (0 on the floor)
uniform float uPhones;
uniform float uBeams;
uniform float uFlash;
uniform vec2 uBolt;       // lightning: azimuth, seed

const float FLOOR = -0.55;
const vec3 STAGE = vec3(0.0, -0.55, -0.66);
const float SM = 0.0229;     // stage metres → units (drawn 1.6× life size so the band reads)
const float UM = 0.0142857;  // crowd metres → units (life size)

float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdCylY(vec3 p, float r, float hh) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, hh); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

// A player standing at the origin (metres), facing the audience (+z).
float player(vec3 p, float ph, float guitar) {
  p.x -= sin(ph) * 0.05 * p.y;
  float d = sdCap(p, vec3(-0.12, 0.05, 0.0), vec3(-0.1, 0.86, 0.0), 0.09);
  d = min(d, sdCap(p, vec3(0.12, 0.05, 0.0), vec3(0.1, 0.86, 0.0), 0.09));
  d = min(d, sdCap(p, vec3(0.0, 0.92, 0.0), vec3(0.0, 1.36, 0.0), 0.19));
  d = min(d, length(p - vec3(0.0, 1.63, 0.02)) - 0.12);
  float strum = sin(ph * 2.0) * 0.06;
  d = min(d, sdCap(p, vec3(0.22, 1.35, 0.0), vec3(0.16, 1.02 + strum, 0.28), 0.055));
  d = min(d, sdCap(p, vec3(-0.22, 1.35, 0.0), vec3(-0.55, 1.2, 0.25), 0.055));
  if (guitar > 0.5) {
    vec3 g = p - vec3(0.05, 1.02, 0.2);
    g.xy = rot(0.45) * g.xy;
    d = min(d, sdBox(g, vec3(0.2, 0.15, 0.04)) - 0.03);
    d = min(d, sdCap(p, vec3(-0.1, 1.1, 0.22), vec3(-0.72, 1.33, 0.24), 0.028));
  }
  return d;
}

// The stage in local metres: origin at the centre of the deck's footprint, audience toward +z.
vec2 stageMap(vec3 p) {
  vec2 res = vec2(sdBox(p - vec3(0.0, 0.75, 0.0), vec3(12.0, 0.75, 6.0)), 1.0);
  res = opU(res, vec2(sdBox(p - vec3(0.0, 1.9, -3.2), vec3(5.5, 0.4, 2.2)), 1.0));        // drum riser
  vec3 q = vec3(abs(p.x), p.yz);
  res = opU(res, vec2(sdBox(q - vec3(9.5, 3.0, -4.6), vec3(1.3, 1.5, 0.8)), 3.0));        // speaker stacks
  res = opU(res, vec2(sdBox(q - vec3(7.8, 2.0, -3.5), vec3(0.5, 0.5, 0.35)), 3.0));       // amps
  float b = uBeat * PI;
  res = opU(res, vec2(player(p - vec3(-6.2, 1.5, 0.8), b, 1.0), 2.0));
  res = opU(res, vec2(player(p - vec3(-2.4, 1.5, 1.4), b + 1.3, 1.0), 2.0));
  res = opU(res, vec2(player(p - vec3(2.8, 1.5, 0.9), b + 2.4, 1.0), 2.0));
  res = opU(res, vec2(player(p - vec3(6.6, 1.5, -0.2), b + 0.7, 0.0), 2.0));
  res = opU(res, vec2(sdBox(p - vec3(6.6, 2.45, 0.35), vec3(0.85, 0.05, 0.32)), 3.0));    // keyboards
  res = opU(res, vec2(sdBox(p - vec3(7.8, 2.1, 0.0), vec3(0.3, 0.6, 0.3)), 3.0));         // organ cabinet
  for (int i = 0; i < 2; i++) {                                                            // two drummers
    vec3 k = p - vec3(i == 0 ? -2.0 : 2.0, 2.3, -3.3);
    float dd = sdCylY(k.xzy - vec3(0.0, 0.55, 0.35), 0.35, 0.22);                         // kick
    dd = min(dd, sdCylY(k - vec3(-0.45, 0.75, 0.55), 0.2, 0.12));
    dd = min(dd, sdCylY(k - vec3(0.45, 0.75, 0.5), 0.22, 0.13));
    dd = min(dd, sdCylY(k - vec3(-0.75, 1.3, 0.35), 0.35, 0.012));                        // cymbals
    dd = min(dd, sdCylY(k - vec3(0.8, 1.35, 0.3), 0.38, 0.012));
    res = opU(res, vec2(dd, 3.0));
    float hit = abs(sin(b * 2.0 + float(i)));
    float dr = sdCap(k, vec3(0.0, 0.5, -0.2), vec3(0.0, 1.0, -0.2), 0.2);
    dr = min(dr, length(k - vec3(0.0, 1.27, -0.18)) - 0.12);
    dr = min(dr, sdCap(k, vec3(-0.2, 0.95, -0.15), vec3(-0.35, 0.85 + 0.2 * hit, 0.35), 0.05));
    dr = min(dr, sdCap(k, vec3(0.2, 0.95, -0.15), vec3(0.35, 1.05 - 0.2 * hit, 0.35), 0.05));
    res = opU(res, vec2(dr, 2.0));
  }
  // the Beam: a long strung bar on two legs
  float beam = sdBox(p - vec3(-4.6, 2.95, -3.2), vec3(1.6, 0.07, 0.1));
  beam = min(beam, sdBox(vec3(abs(p.x + 4.6) - 1.3, p.y - 2.6, p.z + 3.2), vec3(0.04, 0.32, 0.04)));
  res = opU(res, vec2(beam, 3.0));
  return res;
}

vec3 stageNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.01;
  return normalize(k.xyy * stageMap(p + k.xyy * e).x + k.yyx * stageMap(p + k.yyx * e).x +
                   k.yxy * stageMap(p + k.yxy * e).x + k.xxx * stageMap(p + k.xxx * e).x);
}

vec3 shadeStage(vec3 p, vec3 rd, float mat, vec3 amb) {
  vec3 n = stageNormal(p);
  float fromScreen = max(dot(n, normalize(vec3(0.0, 0.5, -1.0))), 0.0);   // the screen towers behind
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  float spot = max(dot(n, normalize(vec3(0.0, 0.45, 1.0))), 0.0);          // follow spots from front of house
  vec3 alb = mat < 1.5 ? vec3(0.05) : (mat < 2.5 ? hsv(fract(p.x * 0.13 + 0.3), 0.35, 0.17) : vec3(0.09, 0.085, 0.08));
  vec3 c = alb * (amb * (0.6 + 2.4 * fromScreen) + vec3(1.0, 0.9, 0.78) * spot * (1.0 + 0.8 * uPulse));
  c += amb * rim * (mat > 1.5 ? 1.4 : 0.4);
  if (mat < 1.5 && n.y > 0.8) {
    // a pool of follow-spot light under each player, and the screen's wash across the deck
    vec2 q = p.xz;
    float pools = exp(-dot(q - vec2(-6.2, 0.8), q - vec2(-6.2, 0.8)) / 1.8) + exp(-dot(q - vec2(-2.4, 1.4), q - vec2(-2.4, 1.4)) / 1.8)
                + exp(-dot(q - vec2(2.8, 0.9), q - vec2(2.8, 0.9)) / 1.8) + exp(-dot(q - vec2(6.6, -0.2), q - vec2(6.6, -0.2)) / 1.8)
                + exp(-dot(vec2(abs(q.x) - 2.0, q.y + 3.3), vec2(abs(q.x) - 2.0, q.y + 3.3)) / 2.2);
    c += vec3(1.0, 0.85, 0.65) * pools * 0.3 * (0.8 + 0.4 * uPulse) + amb * 0.2;
  }
  if (mat < 1.5 && p.z > 5.9 && p.y > 1.2) c += normalize(amb + 0.02) * (0.6 + 0.8 * uPulse);  // LED lip
  return c;
}

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / (sign(rd) * max(abs(rd), vec3(1e-6)));
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

// A dancer seen from behind in a row plane (metres, y = 0 at the top of the head).
float dancer(vec2 q, float raise, float ph, out float phoneD) {
  q.y -= 0.035 * sin(ph);
  q.x -= 0.03 * sin(ph * 0.5);
  float d = sdEllipse(q - vec2(0.0, -0.115), vec2(0.085, 0.115));
  vec2 b = abs(q - vec2(0.0, -1.05)) - vec2(0.19, 0.75);
  d = smin(d, length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.06, 0.07);
  // arms up in a loose V, elbows bent, swaying against each other
  float sw = 0.05 * sin(ph);
  vec2 el = mix(vec2(-0.26, -0.6), vec2(-0.3 + sw, -0.08), raise), er = mix(vec2(0.26, -0.6), vec2(0.3 + sw, -0.06), raise);
  vec2 hl = mix(vec2(-0.22, -0.85), vec2(-0.2 + 2.0 * sw, 0.3 + 0.05 * sin(ph * 2.0)), raise);
  vec2 hr = mix(vec2(0.22, -0.85), vec2(0.22 + 2.0 * sw, 0.34 + 0.05 * cos(ph * 2.0)), raise);
  d = min(d, sdSeg(q, vec2(-0.17, -0.33), el) - 0.042);
  d = min(d, sdSeg(q, vec2(0.17, -0.33), er) - 0.042);
  d = min(d, sdSeg(q, el, hl) - 0.034);
  d = min(d, sdSeg(q, er, hr) - 0.034);
  d = min(d, sdEllipse(q - hl - vec2(0.0, 0.04), vec2(0.045, 0.06)));
  d = min(d, sdEllipse(q - hr - vec2(0.0, 0.04), vec2(0.045, 0.06)));
  vec2 pq = abs(q - hr - vec2(0.0, 0.12)) - vec2(0.035, 0.07);
  phoneD = length(max(pq, 0.0)) + min(max(pq.x, pq.y), 0.0);
  return d;
}

// Rows of dancers in front of the seat, painted far to near. Each pixel checks
// its own seat and the neighbour on the near side, since raised arms overhang.
void crowd(vec3 ro, vec3 rd, inout vec3 col, float tHit, vec3 halo, vec3 amb) {
  if (rd.z > -0.02) return;
  for (int k = 9; k >= 1; k--) {
    float fk = float(k);
    float t = -(0.95 * fk + 0.35) * UM / rd.z;
    if (t > tHit) continue;
    vec3 h = ro + rd * t;
    float mx = (h.x - ro.x) / UM / 0.55 + mod(fk + 1.0, 2.0) * 0.5;   // the front row leaves a gap to see through
    float my = (h.y - ro.y) / UM + uRake * 0.95 * fk;
    if (my > 0.95) continue;                        // above everyone's hands
    float lx = fract(mx) - 0.5;
    float sd = 1e3, pd = 1e3, phone = 0.0;
    for (int n = 0; n < 2; n++) {
      float i = floor(mx) + (n == 0 ? 0.0 : sign(lx));
      vec2 seat = vec2(i, fk);
      vec2 q = vec2((mx - i - 0.5) * 0.55, my - 0.12 - (hash12(seat) - 0.5) * 0.22);
      float r = hash12(seat + 3.3);
      float raise = smoothstep(0.35, 0.9, 0.5 + 0.5 * sin(uBeat * 0.39 + r * 40.0)) * step(0.55, r);
      float p;
      float s = dancer(q, raise, uBeat * PI + r * TAU, p);
      if (s < sd) { sd = s; pd = p; phone = step(1.0 - uPhones * 0.7, hash12(seat + 9.7)) * step(0.5, raise); }
    }
    float px = t * uPix / UM;
    float cover = smoothstep(px, -px, sd);
    vec3 sil = vec3(0.004) + amb * 0.02 + halo * (0.03 + 0.5 * smoothstep(-0.025 - px, 0.0, sd));
    col = mix(col, sil, cover);
    col += vec3(0.8, 0.9, 1.0) * smoothstep(px, -px, pd) * phone * 1.3;
  }
}

vec3 floorShade(vec3 p, float t, vec3 amb) {
  if (p.z < -0.52) return amb * 0.015;                     // backstage
  vec2 g = p.xz / UM;
  vec3 c = amb * (0.025 + 0.05 * vnoise(g * 2.2));         // a sea of heads
  vec2 cell = floor(g * 0.9);
  vec2 f = fract(g * 0.9) - 0.5 - (hash22(cell) - 0.5) * 0.6;
  float on = step(1.0 - uPhones * 0.35, hash12(cell));
  float tw = 0.6 + 0.4 * sin(uTime * (2.0 + 3.0 * hash12(cell + 1.0)) + hash12(cell) * 20.0);
  float s = 0.06, w = max(s, t * uPix / UM * 0.9);
  c += vec3(0.85, 0.9, 1.0) * on * tw * exp(-dot(f, f) / (w * w)) * (s * s) / (w * w) * 2.0;
  return c;
}

vec3 venueShade(vec3 P, float t, vec3 amb) {
  float az = atan(P.x, -P.z);
  vec3 c = amb * 0.035;
  float tier = abs(fract(P.y * 24.0) - 0.5);
  c += amb * 0.05 * smoothstep(0.46, 0.49, tier);          // balcony fascias
  float bowl = smoothstep(-0.35, 0.0, P.z);                 // seats fill the back half
  vec2 g = vec2(az * 260.0, P.y * 300.0);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5 - (hash22(cell) - 0.5) * 0.6;
  float on = step(1.0 - uPhones * 0.3, hash12(cell + 5.0));
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + 3.0 * hash12(cell)) + 30.0 * hash12(cell + 2.0));
  float s = 0.08, w = max(s, t * uPix * 260.0);
  c += vec3(0.9, 0.92, 1.0) * on * tw * bowl * exp(-dot(f, f) / (w * w)) * (s * s) / (w * w) * 1.5;
  return c;
}

vec3 beams(vec3 ro, vec3 rd, float tMax, vec3 amb) {
  vec3 acc = vec3(0.0);
  vec3 tint = normalize(amb + 0.03);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float side = i < 4 ? -1.0 : 1.0;
    vec3 O = STAGE + vec3((mod(fi, 4.0) * 3.0 + 2.0) * side, 1.6, 5.8) * SM;
    float ph = uBeat * 0.5 + fi * 0.9;
    vec3 D = normalize(vec3(sin(ph) * 0.55 + side * 0.15, 1.0, 0.35 + 0.35 * sin(ph * 0.7 + 1.0)));
    vec3 w0 = ro - O;
    float b = dot(rd, D), dd = dot(rd, w0), e = dot(D, w0);
    float den = max(1.0 - b * b, 1e-4);
    float sc = (b * e - dd) / den;
    float tc = clamp((e - b * dd) / den, 0.0, 1.2);
    if (sc < 0.0 || sc > tMax) continue;
    float dist = length(ro + rd * sc - (O + D * tc));
    float wdt = 0.004 + 0.045 * tc;
    float g = exp(-dist * dist / (wdt * wdt)) * (1.0 - tc / 1.2) * (0.006 / wdt);
    acc += mix(tint, rainbow(fi * 0.125 + uTime * 0.02), 0.4) * g;
  }
  return acc * (0.35 + 0.4 * uPulse);
}

vec3 lightning(vec3 P) {
  vec3 d = normalize(P);
  float el = asin(clamp(d.y, -1.0, 1.0));
  if (el > 1.35 || el < -0.45) return vec3(0.0);
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
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 ro = uCamPos;
  vec3 rd = cameraRay(gl_FragCoord.xy);
  vec3 amb = max(textureLod(uScreen, vec2(0.5), 14.0).rgb * 1.3, vec3(0.012));   // the whole screen's light
  vec3 halo = textureLod(uScreen, uv, 4.0).rgb * 0.5 + textureLod(uScreen, uv, 6.0).rgb * 0.5;
  float tD = domeExit(ro, rd);
  vec3 P = ro + rd * tD;
  float e = screenEdge(P);
  float scr = smoothstep(e - 0.004, e + 0.004, P.y);
  vec3 col = mix(venueShade(P, tD, amb), texture(uScreen, uv).rgb * uGain, scr);
  col *= 1.0 - 0.8 * smoothstep(0.005, 0.0, abs(P.y - e));
  if (uFlash > 0.001) col += lightning(P) * uFlash * scr;
  float tHit = tD;
  if (rd.y < 0.0) {
    float tF = (FLOOR - ro.y) / rd.y;
    if (tF > 0.0 && tF < tHit) { tHit = tF; col = floorShade(ro + rd * tF, tF, amb); }
  }
  if (uBand > 0.5) {
    vec3 o = (ro - STAGE) / SM;
    vec2 bb = boxHit(o, rd, vec3(-13.0, 0.0, -7.0), vec3(13.0, 5.5, 7.0));
    if (bb.x < bb.y && bb.y > 0.0 && bb.x * SM < tHit) {
      float t = max(bb.x, 0.0), hitT = -1.0, mat = 0.0;
      for (int i = 0; i < 90; i++) {
        vec2 h = stageMap(o + rd * t);
        if (h.x < 0.0012 * t) { hitT = t; mat = h.y; break; }
        t += h.x;
        if (t > bb.y) break;
      }
      if (hitT > 0.0 && hitT * SM < tHit) {
        tHit = hitT * SM;
        col = shadeStage(o + rd * hitT, rd, mat, amb);
      }
    }
  }
  if (uCrowd > 0.5) crowd(ro, rd, col, tHit, halo, amb);
  col += beams(ro, rd, tHit, amb) * uBeams;
  col += halo * uBloom + amb * uFlash * 0.4;
  col = mix(col, 1.0 - 0.2 * exp(-(col - 0.8) / 0.2), step(0.8, col));   // soft shoulder above 0.8
  col *= 1.0 - 0.3 * pow(length(uv - 0.5) * 1.25, 2.5);
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
