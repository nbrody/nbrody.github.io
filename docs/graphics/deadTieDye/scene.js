// Tie-Dye Sky — a loxodrome spiral from the point ahead of you to the point behind.
import { startSphere, num } from '../sphereKit/kit.js';

const glsl = `
uniform float uArms;
uniform float uTwist;
uniform float uBleed;
uniform float uFolds;

vec3 dye(float i) {
  i = mod(i, 6.0);
  return i < 1.0 ? vec3(0.88, 0.08, 0.2) : i < 2.0 ? vec3(1.0, 0.45, 0.04) : i < 3.0 ? vec3(1.0, 0.84, 0.1)
       : i < 4.0 ? vec3(0.1, 0.72, 0.32) : i < 5.0 ? vec3(0.1, 0.36, 0.92) : vec3(0.52, 0.14, 0.76);
}

vec3 scene(vec3 d, float t) {
  float arms = floor(uArms + 0.5);   // whole arms keep the spiral seamless
  vec2 p = focusPlane(d);
  float r = length(p) + 1e-5;
  float a = atan(p.y, p.x);
  float warp = fbm3(d * 3.2 + vec3(0.0, t * 0.03, 0.0));
  float s = a / TAU * arms + log(r) * uTwist - t * 0.07 + 0.45 * warp + 0.06 * uPulse;
  float b = s * 6.0;
  float fw = 6.0 * length(fwidth(p)) / r * (arms / TAU + uTwist);   // band density, free of the atan seam
  float bleed = (0.05 + 0.6 * uBleed) * (0.4 + 0.9 * fbm3(d * 8.0 + 2.0));
  vec3 col = mix(dye(floor(b)), dye(floor(b) + 1.0), smoothstep(1.0 - bleed, 1.0, fract(b)));
  float fold = abs(sin(a * 6.0 + 2.5 * warp + log(r) * 0.5));
  col = mix(col, vec3(0.97, 0.94, 0.9), smoothstep(0.12, 0.0, fold) * smoothstep(0.3, 0.7, fbm3(d * 14.0)) * uFolds);
  col *= 0.72 + 0.4 * fbm3(d * 26.0 + 5.0);
  col = mix(col, vec3(0.62, 0.45, 0.5), smoothstep(0.35, 1.2, fw));
  return mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.05 + 0.03 * uPulse, 0.0, r));
}
`;

startSphere({
  glsl,
  pitch: 16,
  uniforms: { uArms: () => num('arms'), uTwist: () => num('twist'), uBleed: () => num('bleed'), uFolds: () => num('folds') },
});
