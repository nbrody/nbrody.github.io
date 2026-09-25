// Solid parts: column, stamens, anthers, ovary, styles, stigmas, stems, buds.
import { common } from './common.js';

export const organVertex = /* glsl */ `
${common}
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vL = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const organFragment = /* glsl */ `
${common}
uniform vec3  uBase;
uniform vec3  uSpot;
uniform float uSpotAmt;
uniform float uSpotScale;
uniform float uTrans;
uniform float uSpec;
uniform float uGrain;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  vec3 base = srgb(uBase);
  vec2 q = vec2(vL.x + vL.z * 0.7, vL.y - vL.z * 0.6) * uSpotScale;
  float s = smoothstep(0.62, 0.72, vnoise(q)) * uSpotAmt;
  vec3 alb = mix(base, srgb(uSpot), s);
  alb *= 1.0 - uGrain + uGrain * 2.0 * vnoise(q * 3.7);
  vec3 col = shade(alb, N, V, uTrans, uSpec, 28.0, 0.85);
  gl_FragColor = vec4(finish(col), 1.0);
}
`;
