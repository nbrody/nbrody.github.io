// Lightning Bolt — a red and blue disc split by a white bolt, a ring of small bolts,
// and arcs crackling across the sky on the beat.
import { startSphere, num, on } from '../kit/kit.js';

const glsl = `
uniform float uSize;       // emblem radius on the focus chart
uniform float uArcs;       // arcs per beat
uniform float uFlipEvery;  // beats between coin flips; 0 never flips
uniform float uRingBolts;  // 1 shows the ring of small bolts

const vec2 BOLT[11] = vec2[11](vec2(-0.10, 1.00), vec2(0.16, 1.00), vec2(0.00, 0.42), vec2(0.22, 0.42),
  vec2(0.04, -0.10), vec2(0.21, -0.10), vec2(-0.10, -1.00), vec2(-0.02, -0.28), vec2(-0.19, -0.28),
  vec2(-0.01, 0.24), vec2(-0.18, 0.24));

float sdBolt(vec2 p) {
  float d = dot(p - BOLT[0], p - BOLT[0]);
  float s = 1.0;
  int j = 10;
  for (int i = 0; i < 11; i++) {
    vec2 e = BOLT[j] - BOLT[i], w = p - BOLT[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= BOLT[i].y, p.y < BOLT[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    j = i;
  }
  return s * sqrt(d);
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  float r0 = length(p), a0 = atan(p.y, p.x);
  float px0 = gPix * 0.5 * (1.0 + r0 * r0);
  float R = uSize;
  vec3 col = mix(vec3(0.05, 0.02, 0.14), vec3(0.0, 0.0, 0.02), smoothstep(0.3, 2.5, r0));
  col += stars(d) * 0.5;
  col += vec3(0.2, 0.3, 0.9) * pow(max(0.0, sin(a0 * 13.0 + t * 0.4)), 12.0) * smoothstep(0.1, 0.5, r0) * exp(-r0 * 0.8) * (0.4 + 0.6 * uPulse);
  if (uRingBolts > 0.5) {
    float sector = TAU / 13.0;
    float aa = mod(a0 + t * 0.12, sector) - sector * 0.5;
    vec2 sp = vec2(cos(aa), sin(aa)) * r0;
    float mb = sdBolt(vec2(-sp.y, sp.x - R * 1.6) / (R * 0.25)) * R * 0.25;
    col += vec3(0.5, 0.75, 1.0) * (smoothstep(px0, -px0, mb) * (0.6 + 0.8 * uPulse) + exp(-max(mb, 0.0) * 60.0) * 0.35);
  }
  // Arcs run from the emblem right round the sky to the point behind you, where they meet in a plasma globe.
  float toChart = 2.0 / (1.0 + r0 * r0);           // chart units → radians of sky here
  float behind = 2.0 / max(r0, 1e-3);              // radians from the point behind you
  col += vec3(0.35, 0.45, 1.0) * (exp(-behind * behind * 30.0) * (0.7 + 0.9 * uPulse) + exp(-behind * 3.0) * 0.15);
  float bt = floor(uBeat), bf = fract(uBeat);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= uArcs) break;
    float ang = hash11(bt * 7.1 + fi * 3.3) * TAU;
    float sda = (mod(a0 - ang + PI, TAU) - PI) * r0;
    float arc = abs(sda - (fbm(vec2(log(r0 + 1e-3) * 4.0, bt + fi * 5.0)) - 0.5) * 0.18 * r0) * toChart;
    col += vec3(0.7, 0.8, 1.0) * (exp(-arc / 0.006) + exp(-arc / 0.05) * 0.25) * (1.0 - bf) * step(R * 1.15, r0);
  }
  // the emblem, which flips like a coin
  float sx = uFlipEvery > 0.0 ? cos(smoothstep(0.86, 1.0, fract(uBeat / uFlipEvery)) * TAU) : 1.0;
  float sxs = sign(sx) * max(abs(sx), 0.03);
  vec2 q = p / (R * (1.0 + 0.025 * uPulse));
  q.x /= sxs;
  float r = length(q);
  float px = px0 / R / abs(sxs);
  col += vec3(0.5, 0.6, 1.0) * exp(-max(r0 / R - 1.12, 0.0) * 6.0) * (0.25 + 0.5 * uPulse);
  if (r < 1.2) {
    float xm = q.y < -0.1 ? mix(-0.08, 0.03, (q.y + 1.0) / 0.9) : 0.0;
    vec3 em = (q.x < xm ? vec3(0.85, 0.08, 0.12) : vec3(0.1, 0.3, 0.85)) * (0.85 + 0.25 * smoothstep(1.0, 0.0, r));
    float bd = sdBolt(q);
    em = mix(em, vec3(0.02), smoothstep(px, -px, bd - 0.035));
    em = mix(em, vec3(0.97, 0.95, 0.9), smoothstep(px, -px, bd));
    em = mix(em, vec3(0.02), smoothstep(px, -px, abs(r - 1.0) - 0.012));
    em = mix(em, vec3(0.97, 0.95, 0.9), smoothstep(px, -px, abs(r - 1.05) - 0.035));
    em = mix(em, vec3(0.02), smoothstep(px, -px, abs(r - 1.1) - 0.015));
    em *= sx < 0.0 ? 0.55 : 1.0;
    col = mix(col, em, smoothstep(px, -px, r - 1.115));
  }
  return col;
}
`;

startSphere({
  glsl,
  pitch: 16,
  uniforms: {
    uSize: () => num('emblemSize'),
    uArcs: () => num('arcs'),
    uFlipEvery: () => num('flipEvery'),
    uRingBolts: () => (on('ringBolts') ? 1 : 0),
  },
});
