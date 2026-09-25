// The flat floral disc under the corona: pale centre, deep purple nectar ring.
import { common } from './common.js';

export const discVertex = /* glsl */ `
${common}
varying vec3 vP;
varying vec3 vW;
varying vec3 vN;
void main() {
  vP = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const discFragment = /* glsl */ `
${common}
varying vec3 vP;
varying vec3 vW;
varying vec3 vN;
void main() {
  float r = length(vP.xy);
  float a = atan(vP.y, vP.x);
  vec3 pale = hexc(196, 204, 150);
  vec3 ring = hexc(44, 8, 40);
  vec3 alb = mix(pale, ring, smoothstep(0.05, 0.075, r));
  alb = mix(alb, hexc(120, 40, 110), 0.35 * smoothstep(0.5, 1.0, sin(a * 140.0)) * smoothstep(0.09, 0.2, r));
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 col = shade(alb, N, normalize(cameraPosition - vW), 0.1, 0.1, 16.0, 0.5);
  gl_FragColor = vec4(finish(col * 0.8), 1.0);
}
`;
