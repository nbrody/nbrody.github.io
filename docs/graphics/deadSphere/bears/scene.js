// Marching Bears — a twilight lake. A parade of dancing bears marches round the horizon
// on a rainbow path, mirrored in the water; lanterns float on the lake, a moon rises
// ahead, and bear constellations dance slowly overhead.
import { startSphere, num, on } from '../kit/kit.js';

const glsl = `
uniform float uCount;      // bears in the parade (whole number)
uniform float uBearSize;   // fraction of each bear's slot it fills
uniform float uWalk;       // how far the parade has marched
uniform float uStarBears;  // 1 draws the constellations
uniform float uLanterns;   // 0..1

const vec3 MOON = vec3(0.0, 0.3827, -0.9239);   // ahead, 22.5° up
const vec3 DUSK = vec3(0.0, -0.05, 0.9987);     // where the sun went down, behind you
const float PATH = 0.02;                        // height of the rainbow path, radians
const vec3 FUR[5] = vec3[5](vec3(0.93, 0.25, 0.28), vec3(1.0, 0.6, 0.2), vec3(1.0, 0.86, 0.3),
                            vec3(0.3, 0.78, 0.42), vec3(0.3, 0.55, 0.98));
const vec3 BANDS[6] = vec3[6](vec3(0.55, 0.25, 0.95), vec3(0.2, 0.45, 1.0), vec3(0.2, 0.85, 0.45),
                              vec3(1.0, 0.88, 0.25), vec3(1.0, 0.55, 0.15), vec3(1.0, 0.22, 0.28));

float sdCap2(vec2 p, vec2 a, vec2 b, float r) { return sdSeg(p, a, b) - r; }

// A dancing bear's joints, in bear units (1 tall, feet at −0.5, facing +x):
// 0 head, 1 snout tip, 2 ear, 3 shoulder, 4 hip, 5 tail, 6–7 front elbow and paw,
// 8–9 back elbow and paw, 10–11 front knee and foot, 12–13 back knee and foot.
void pose(float ph, out vec2 J[14]) {
  float s = sin(ph), c = cos(ph), lift = 0.5 + 0.5 * s;
  float bob = 0.03 * abs(c);
  J[0] = vec2(0.09, 0.3 + bob);
  J[1] = vec2(0.3, 0.29 + bob);
  J[2] = vec2(0.025, 0.43 + bob);
  J[3] = vec2(0.03, 0.14 + bob);
  J[4] = vec2(0.0, -0.15 + bob);
  J[5] = vec2(-0.17, -0.1 + bob);
  J[6] = J[3] + vec2(0.13, 0.02 + 0.05 * s);
  J[7] = J[6] + vec2(0.06, 0.15 + 0.03 * c);
  J[8] = J[3] + vec2(-0.12, -0.02 - 0.05 * s);
  J[9] = J[8] + vec2(-0.06, 0.1 - 0.05 * c);
  vec2 h1 = J[4] + vec2(0.05, 0.0), h2 = J[4] + vec2(-0.04, 0.0);
  J[10] = mix(h1 + vec2(0.01, -0.17), h1 + vec2(0.15, -0.06), lift);
  J[11] = mix(J[10] + vec2(0.0, -0.16), J[10] + vec2(0.02, -0.15), lift);
  J[12] = mix(h2 + vec2(0.01, -0.17), h2 + vec2(0.15, -0.06), 1.0 - lift);
  J[13] = mix(J[12] + vec2(0.0, -0.16), J[12] + vec2(0.02, -0.15), 1.0 - lift);
}

// Distance to the bear; also the distances to its near side, its far limbs, and its belly patch.
float bearSDF(vec2 p, vec2 J[14], out float near, out float far, out float belly) {
  vec2 mid = vec2(0.0, J[4].y + 0.13);
  near = sdEllipse(rot(-0.12) * (p - mid), vec2(0.16, 0.215));
  near = smin(near, length(p - J[0]) - 0.135, 0.06);
  near = smin(near, sdEllipse(rot(0.15) * (p - mix(J[0], J[1], 0.62)), vec2(0.085, 0.05)), 0.03);
  near = smin(near, length(p - J[2]) - 0.052, 0.015);
  near = smin(near, min(sdCap2(p, J[3] + vec2(0.03, 0.0), J[6], 0.048), sdCap2(p, J[6], J[7], 0.04)), 0.03);
  vec2 h1 = J[4] + vec2(0.05, 0.0), h2 = J[4] + vec2(-0.04, 0.0);
  near = smin(near, min(sdCap2(p, h1, J[10], 0.062), sdCap2(p, J[10], J[11], 0.052)), 0.03);
  near = smin(near, sdEllipse(p - J[11] - vec2(0.04, -0.02), vec2(0.07, 0.035)), 0.02);
  near = smin(near, length(p - J[5]) - 0.035, 0.02);
  far = min(sdCap2(p, J[3] - vec2(0.05, 0.0), J[8], 0.046), sdCap2(p, J[8], J[9], 0.04));
  far = min(far, min(sdCap2(p, h2, J[12], 0.06), sdCap2(p, J[12], J[13], 0.05)));
  far = min(far, sdEllipse(p - J[13] - vec2(0.04, -0.02), vec2(0.07, 0.035)));
  belly = sdEllipse(rot(-0.12) * (p - mid - vec2(0.05, -0.02)), vec2(0.09, 0.15));
  return smin(near, far, 0.02);
}

vec3 drawBear(vec3 col, vec2 p, float ph, vec3 fur, float px) {
  if (abs(p.x) > 0.6 || abs(p.y) > 0.65) return col;
  vec2 J[14];
  pose(ph, J);
  float near, far, belly;
  float d = bearSDF(p, J, near, far, belly);
  col *= 1.0 - 0.35 * exp(-max(d, 0.0) * 22.0);                        // a soft shadow sets it off the sky
  vec3 f = fur * (0.8 + 0.3 * clamp(p.y + 0.5, 0.0, 1.0));             // lighter toward the head
  f *= far < near - 0.004 ? 0.72 : 1.0;                                // far limbs sit back in shade
  f = mix(f, mix(fur, vec3(1.0), 0.4), smoothstep(px, -px, belly) * 0.5);
  f = mix(f, f * 1.3 + 0.08, smoothstep(-0.045, -0.005, d) * 0.45);   // rim light
  f = mix(f, fur * 0.55, smoothstep(px, -px, length(p - J[2]) - 0.024)); // inner ear
  f = mix(f, vec3(1.0, 0.55, 0.6), smoothstep(px, -px, sdEllipse(p - J[0] - vec2(0.085, -0.045), vec2(0.035, 0.022))) * 0.35);  // blush
  vec2 eye = J[0] + vec2(0.068, 0.035);
  f = mix(f, vec3(0.04, 0.03, 0.05), smoothstep(px, -px, length(p - eye) - 0.021));
  f = mix(f, vec3(1.0), smoothstep(px, -px, length(p - eye - vec2(0.007, 0.008)) - 0.007));
  f = mix(f, vec3(0.04, 0.03, 0.05), smoothstep(px, -px, length(p - J[1]) - 0.026));   // nose
  f = mix(fur * 0.28, f, smoothstep(px, -px, d + 0.016));              // outline, in the bear's own darker hue
  return mix(col, f, smoothstep(px, -px, d));
}

vec3 sky(vec3 d, vec2 ae) {
  float y = d.y;
  float dusk = pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), DUSK), 0.0), 3.0);
  vec3 low = mix(vec3(0.72, 0.36, 0.62), vec3(1.0, 0.55, 0.32), dusk);   // violet ahead, embers behind
  vec3 c = mix(low, vec3(0.2, 0.09, 0.32), smoothstep(0.0, 0.3, y));
  c = mix(c, vec3(0.025, 0.02, 0.08), smoothstep(0.25, 1.0, y));
  c += stars(d) * smoothstep(0.08, 0.5, y);
  float md = acos(clamp(dot(d, MOON), -1.0, 1.0));
  float disc = smoothstep(0.055 + gPix, 0.055 - gPix, md);
  vec3 moon = vec3(1.0, 0.96, 0.88) * (0.85 + 0.15 * fbm3(d * 60.0));
  moon = mix(moon, vec3(0.72, 0.72, 0.76), smoothstep(0.52, 0.66, fbm3(d * 22.0 + 3.0)) * 0.6);   // maria
  c = mix(c, moon, disc);
  c += vec3(1.0, 0.9, 0.75) * (exp(-md * 7.0) * 0.18 + exp(-md * 28.0) * 0.3) * (1.0 - disc);
  return c;
}

// Constellations: five bears drawn in stars and faint lines, dancing slowly overhead.
vec3 starBears(vec3 col, vec2 ae, float t) {
  const float EL = 0.95, SZ = 0.42;
  float u = ae.x / TAU * 5.0 + t * 0.004;
  float id = floor(u);
  vec2 p = vec2((fract(u) - 0.5) * TAU / 5.0 * cos(ae.y), ae.y - EL) / SZ;
  if (abs(p.x) > 0.6 || abs(p.y) > 0.65) return col;
  vec2 J[14];
  pose(uBeat * PI * 0.25 + id * 1.7, J);
  float l = min(min(sdSeg(p, J[0], J[1]), sdSeg(p, J[0], J[2])), min(sdSeg(p, J[0], J[3]), sdSeg(p, J[3], J[4])));
  l = min(l, min(sdSeg(p, J[4], J[5]), min(sdSeg(p, J[3], J[6]), sdSeg(p, J[6], J[7]))));
  l = min(l, min(sdSeg(p, J[3], J[8]), min(sdSeg(p, J[8], J[9]), sdSeg(p, J[4], J[10]))));
  l = min(l, min(sdSeg(p, J[10], J[11]), min(sdSeg(p, J[4], J[12]), sdSeg(p, J[12], J[13]))));
  float px = gPix / SZ;
  float lw = max(0.004, px);
  col += vec3(0.5, 0.65, 1.0) * exp(-l / lw) * 0.22 * (0.004 / lw + 0.5);
  for (int j = 0; j < 14; j++) {
    float dd = length(p - J[j]);
    float s = 0.012 + 0.006 * hash11(float(j) + id * 13.0);
    float w = max(s, px);
    float tw = 0.75 + 0.25 * sin(uTime * (2.0 + float(j) * 0.3) + id * 5.0);
    col += vec3(0.85, 0.9, 1.0) * exp(-dd * dd / (w * w)) * (s * s) / (w * w) * 1.6 * tw;
  }
  return col;
}

vec3 above(vec3 d, float t) {
  vec2 ae = azel(d);
  vec3 col = sky(d, ae);
  if (uStarBears > 0.5 && ae.y > 0.4) col = starBears(col, ae, t);
  // the rainbow path round the horizon, brightening on the beat
  float k = ae.y / PATH;
  vec3 path = BANDS[int(clamp(floor(k * 6.0), 0.0, 5.0))] * (0.75 + 0.35 * uPulse);
  col += path * exp(-abs(ae.y - PATH * 0.5) / 0.03) * 0.15;
  col = mix(col, path, smoothstep(-gPix, gPix, ae.y) * smoothstep(PATH + gPix, PATH - gPix, ae.y));
  // the parade on top of it
  float N = floor(uCount + 0.5);
  float S = TAU / N * uBearSize;                 // a bear's height, radians
  if (ae.y > PATH - 0.02 && ae.y < PATH + S * 1.2) {
    float u = ae.x / TAU * N - uWalk * 0.12;
    float id = floor(u);
    vec2 p = vec2((fract(u) - 0.5) * TAU / N * cos(ae.y) / S, (ae.y - PATH) / S - 0.53);
    col = drawBear(col, p, uBeat * PI + id * 0.35, FUR[int(mod(id, 5.0))], gPix / S);
  }
  return col;
}

// Lanterns floating on the lake, on the water plane one unit below the eye.
vec3 lanterns(vec2 wp, float depth, float t) {
  vec2 g = wp / 3.0 + vec2(t * 0.02, t * 0.012);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (hash22(id) - 0.5) * 0.6;
  float on = step(1.0 - uLanterns * 0.6, hash12(id + 3.0));
  float foot = gPix / (depth * depth) / 3.0;     // a pixel's size on the water, in cells
  float s = 0.03, w = max(s, foot);
  float r2 = dot(f, f);
  float flicker = 0.85 + 0.15 * sin(uTime * 7.0 + hash12(id) * 40.0);
  vec3 c = vec3(1.0, 0.62, 0.28) * on * flicker * (0.8 + 0.4 * uPulse);
  return c * (exp(-r2 / (w * w)) * (s * s) / (w * w) * 2.5 + exp(-r2 / 0.02) * 0.2) * smoothstep(80.0, 15.0, length(wp));
}

vec3 scene(vec3 d, float t) {
  if (d.y >= 0.0) return above(d, t);
  // The lake: mirror the sky and the parade, rippled, darker looking down, misty at the horizon.
  float depth = -d.y;
  vec2 wp = d.xz / max(depth, 0.004);
  vec2 rip = vec2(fbm(wp * 0.9 + t * 0.06), fbm(wp * 0.9 + 7.1 - t * 0.05)) - 0.5;
  vec3 r = normalize(vec3(d.x + rip.x * 0.035, depth, d.z + rip.y * 0.035));
  float fres = 0.04 + 0.96 * pow(1.0 - depth, 5.0);
  vec3 col = mix(vec3(0.012, 0.018, 0.05), above(r, t) * 0.85, clamp(fres + 0.2, 0.0, 1.0));
  col += lanterns(wp, depth, t);
  return mix(col, sky(normalize(vec3(d.x, 0.02, d.z)), vec2(0.0)) * 0.9, exp(-depth * 60.0) * 0.5);   // mist on the water
}
`;

// Distance marched is accumulated so changing the speed never makes the parade jump.
let walk = 0;
startSphere({
  glsl,
  pitch: 6,
  uniforms: {
    uCount: () => num('paradeCount'),
    uBearSize: () => num('bearSize'),
    uWalk: () => walk,
    uStarBears: () => (on('starBears') ? 1 : 0),
    uLanterns: () => num('lanterns'),
  },
  onFrame(_, dt) { walk += dt * num('march') * num('speed'); },
});
