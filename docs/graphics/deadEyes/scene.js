// Eyes of the World — one great eye where you look, and a sky of smaller eyes all around.
import { startSphere, num, on } from '../sphereKit/kit.js';

const glsl = `
uniform float uBigEye;   // 1 shows the great eye
uniform float uCols;     // eyes around the equator (even)
uniform float uBlink;    // blink-rate multiplier; 0 never blinks

vec3 eyeBall(vec2 q, float open, vec2 gaze, float hue, float dil, float px, out float mask) {
  float xx = 1.0 - q.x * q.x;
  float lidT = 0.55 * xx * open, lidB = -0.42 * xx * open;
  float inside = min(lidT - q.y, q.y - lidB);
  float sx = 1.0 - q.x * q.x / 1.3225;
  float socket = min(0.7 * sx - q.y, q.y + 0.55 * sx);
  mask = smoothstep(-px, px, socket);
  vec3 c = hsv(hue + 0.55, 0.45, 0.35) * (0.6 + 0.4 * smoothstep(0.0, 0.3, socket));
  vec2 iq = q - gaze;
  float ri = length(iq);
  vec3 ball = vec3(0.96, 0.93, 0.9) * (0.55 + 0.45 * smoothstep(0.0, 0.22, inside));
  float vein = smoothstep(0.03, 0.0, abs(fbm(q * 7.0 + hue * 10.0) - 0.5)) * smoothstep(0.25, 0.8, abs(q.x));
  ball = mix(ball, vec3(0.8, 0.15, 0.15), vein * 0.5);
  if (ri < 0.38) {
    float ang = atan(iq.y, iq.x);
    float fib = fbm3(vec3(cos(ang) * 4.0, sin(ang) * 4.0, ri * 9.0 + hue * 5.0));
    float streak = 0.5 + 0.5 * sin(ang * 50.0 + fib * 8.0);
    vec3 ic = mix(hsv(hue, 0.75, 0.35), hsv(hue + 0.08, 0.7, 0.95), fib * 0.7 + streak * 0.3);
    ic = mix(ic, vec3(0.95, 0.65, 0.2), smoothstep(0.22, 0.12, ri) * 0.6);   // golden collarette
    ic *= smoothstep(0.37, 0.3, ri) * 0.65 + 0.35;                           // limbal ring
    float PR = 0.1 + 0.07 * dil;
    ic = mix(ic, vec3(0.005), smoothstep(PR + px, PR - px, ri));
    ball = mix(ball, ic, smoothstep(0.36 + px, 0.36 - px, ri));
  }
  ball += smoothstep(0.06 + px, 0.05, length(iq - vec2(-0.12, 0.13))) * 0.9;   // catchlights
  ball += smoothstep(0.025 + px, 0.02, length(iq - vec2(0.1, -0.1))) * 0.6;
  ball *= 0.55 + 0.45 * smoothstep(0.0, 0.16, lidT - q.y);
  c = mix(c, ball, smoothstep(-px, px, inside));
  c = mix(c, vec3(0.02), smoothstep(0.03 + px, 0.0, abs(lidT - q.y)) * step(abs(q.x), 1.0));   // lash line
  return c;
}

// 1 while open, dipping to 0 for a quick blink once a period.
float blink(float t, float period, float off) {
  if (uBlink <= 0.0) return 1.0;
  return smoothstep(0.02, 0.16, abs(mod(t * uBlink + off, period) - 0.2));
}

vec3 scene(vec3 d, float t) {
  vec2 p = focusPlane(d);
  vec3 col = mix(vec3(0.03, 0.0, 0.07), vec3(0.12, 0.02, 0.18), fbm3(d * 2.0 + t * 0.02)) + stars(d) * 0.6;
  vec2 ae = azel(d);
  float cols = floor(uCols + 0.5);
  vec2 g = vec2(ae.x / TAU * cols, asinh(tan(clamp(ae.y, -1.35, 1.35))) / TAU * cols);
  vec2 id = floor(g), f = fract(g) - 0.5;
  float cell = TAU / cols * cos(ae.y);
  float h = hash12(id + 4.0);
  vec2 cc = (id + 0.5) / cols * TAU;                    // the cell's centre: azimuth, Mercator y
  bool clear = uBigEye < 0.5 || length(focusPlane(dirAzEl(cc.x, atan(sinh(cc.y))))) > 0.75;
  if (h > 0.3 && clear && abs(cc.y) < 2.2) {
    float m;
    vec2 gaze = 0.18 * vec2(sin(t * 0.4 + h * 20.0), 0.6 * cos(t * 0.3 + h * 13.0));
    vec3 e = eyeBall((f - (hash22(id) - 0.5) * 0.12) / 0.3, blink(t, 3.0 + 5.0 * h, h * 17.0), gaze, h + t * 0.01, uPulse, gPix / (cell * 0.3), m);
    col = mix(col, e, m);
  }
  if (uBigEye > 0.5) {
    col += vec3(0.5, 0.25, 0.9) * exp(-max(length(p) - 0.55, 0.0) * 8.0) * (0.25 + 0.4 * uPulse);
    float bm;
    vec2 gaze = vec2(0.22 * sin(t * 0.21) + 0.1 * sin(t * 0.73), 0.1 * sin(t * 0.17));
    vec3 big = eyeBall(p / 0.5, blink(t, 7.0, 3.0), gaze, 0.5 + t * 0.005, uPulse, gPix * (1.0 + dot(p, p)), bm);
    col = mix(col, big, bm);
  }
  return col;
}
`;

startSphere({
  glsl,
  pitch: 16,
  uniforms: { uBigEye: () => (on('bigEye') ? 1 : 0), uCols: () => num('eyeCols'), uBlink: () => num('blinkRate') },
});
