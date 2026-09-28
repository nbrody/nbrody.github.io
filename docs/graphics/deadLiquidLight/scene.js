// Liquid Light Show — oil blobs with thin-film edges drifting over domain-warped dye.
import { startSphere, num } from '../sphereKit/kit.js';

const glsl = `
uniform float uBlobs;
uniform float uBlobSize;
uniform float uFilm;
uniform float uDish;     // the projector dish's turn, radians

vec3 oil(float i) {
  i = mod(i, 5.0);
  return i < 1.0 ? vec3(0.95, 0.1, 0.45) : i < 2.0 ? vec3(1.0, 0.62, 0.05) : i < 3.0 ? vec3(0.1, 0.85, 0.55)
       : i < 4.0 ? vec3(0.2, 0.3, 1.0) : vec3(0.75, 0.2, 0.95);
}

// One projector dish seen through a stereographic chart; px is a pixel's size in chart units.
vec3 dish(vec2 p, float t, float px) {
  vec2 q = p + 1.1 * vec2(fbm(p * 1.3 + vec2(0.0, t * 0.05)), fbm(p * 1.3 + vec2(5.2, 1.3) - t * 0.04));
  float n = fbm(q * 1.7 + vec2(t * 0.03, -t * 0.02));
  vec3 bg = pal(n * 1.3 + t * 0.012, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.15, 0.3)) * (0.15 + 0.95 * n * n);
  float F = 0.0;
  vec3 C = vec3(0.0);
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    if (fi >= uBlobs) break;
    vec2 c = vec2(sin(t * (0.05 + 0.011 * fi) + fi * 2.1), cos(t * (0.04 + 0.013 * fi) + fi * 1.3)) * (0.3 + 0.08 * fi);
    float rr = (0.12 + 0.07 * hash11(fi * 7.3)) * uBlobSize * (1.0 + 0.2 * uPulse);
    vec2 dp = p - c;
    float w = rr * rr / (dot(dp, dp) + 1e-4);
    F += w;
    C += w * oil(fi);
    grad -= 2.0 * w * w / (rr * rr) * dp;
  }
  float e = F - 1.0;
  float m = smoothstep(-1.0, 1.0, e / (length(grad) * px + 1e-4));   // edge smoothed to one pixel
  vec3 nrm = normalize(vec3(-grad * 0.05, 1.0));
  float spec = pow(max(dot(nrm, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 40.0);
  vec3 inside = C / max(F, 1e-4) * (0.55 + 0.6 * nrm.z) * (0.85 + 0.3 * fbm(p * 6.0 + t * 0.1));
  vec2 bq = p * 14.0;
  vec2 bid = floor(bq);
  vec2 bf = fract(bq) - 0.5 - (hash22(bid) - 0.5) * 0.5;
  inside += step(0.8, hash12(bid)) * smoothstep(0.09, 0.06, abs(length(bf) - 0.1)) * 0.5;   // trapped bubbles
  return mix(bg, inside, m) + rainbow(F * 1.8 - t * 0.12) * exp(-abs(e) * 9.0) * uFilm + spec * m * 0.7;
}

// A dish in front of you and another behind, each on its own chart, blended round the sides:
// no single flat chart covers the whole sphere without stretching.
vec3 scene(vec3 d, float t) {
  float w = smoothstep(-0.3, 0.3, dot(d, FOCUS));
  vec3 col = vec3(0.0);
  if (w > 0.001) {
    vec2 p = focusPlane(d);
    col += dish(rot(uDish) * p * 1.5, t, gPix * 0.75 * (1.0 + dot(p, p))) * w;
  }
  if (w < 0.999) {
    vec2 p = focusPlane(-d);
    col += dish(rot(-uDish) * p * 1.5, t + 60.0, gPix * 0.75 * (1.0 + dot(p, p))) * (1.0 - w);
  }
  return col;
}
`;

// The dish's turn is accumulated so changing its speed never makes the picture jump.
let dish = 0;
startSphere({
  glsl,
  pitch: 16,
  uniforms: { uBlobs: () => num('blobs'), uBlobSize: () => num('blobSize'), uFilm: () => num('film'), uDish: () => dish },
  onFrame(_, dt) { dish = (dish + dt * num('dish') * num('speed')) % (Math.PI * 2); },
});
