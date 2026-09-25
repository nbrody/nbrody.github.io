// Out-of-focus weathered fence and foliage, drawn on a full-screen quad.
import { common } from './common.js';

export const backgroundVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

export const backgroundFragment = /* glsl */ `
${common}
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  float x = p.x * uAspect * 2.2 + 0.3;
  float plank = floor(x);
  float fx = fract(x);
  float grain = fbm(vec2(x * 5.0 + plank * 3.7, p.y * 0.5));
  vec3 wood = mix(hexc(92, 86, 80), hexc(160, 152, 140), grain);
  wood *= mix(0.55, 1.0, smoothstep(0.0, 0.06, fx) * smoothstep(1.0, 0.94, fx));

  float sun = smoothstep(0.42, 0.68, fbm(p * vec2(2.3, 1.8) + vec2(4.0, uTime * 0.004)));
  wood *= 0.55 + 0.75 * sun;

  float lf = fbm(vec2(p.x * uAspect, p.y) * 3.2 + vec2(11.0, 3.0));
  float edge = smoothstep(0.35, 0.0, p.x) + smoothstep(0.65, 1.0, p.x) + smoothstep(0.4, 0.0, p.y);
  float leafMask = smoothstep(0.55, 0.62, lf + 0.12 * edge);
  vec3 leaf = mix(hexc(30, 58, 28), hexc(128, 168, 84), fbm(p * 7.0 + 2.0));
  vec3 col = mix(wood, leaf, leafMask * 0.9);

  float vig = smoothstep(1.2, 0.3, length((p - 0.5) * vec2(uAspect, 1.0)));
  col *= 0.55 + 0.45 * vig;
  gl_FragColor = vec4(finish(col * 0.7), 1.0);
}
`;
