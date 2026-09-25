// Palmate, five-lobed passionflower leaves. Lobe outline, fold and droop are all
// computed in the vertex shader from a polar grid.
import { common } from './common.js';

export const leafVertex = /* glsl */ `
${common}
attribute float aSeed;
varying vec2  vUv;
varying vec3  vN;
varying vec3  vW;
varying float vLobeD;

const float LA[5] = float[5](-1.45, -0.72, 0.0, 0.72, 1.45);
const float LL[5] = float[5](0.55, 0.82, 1.0, 0.82, 0.55);

float nearestLobe(float th, out float len) {
  float best = 10.0; len = 0.0;
  for (int k = 0; k < 5; k++) {
    float d = th - LA[k];
    if (abs(d) < abs(best)) { best = d; len = LL[k]; }
  }
  return best;
}

vec3 shape(float t, float rho) {
  float th = (t - 0.5) * 3.9;
  float R = 0.1;
  for (int k = 0; k < 5; k++) {
    float d = (th - LA[k]) / 0.27;
    R += LL[k] * exp(-d * d);
  }
  float len;
  float d = nearestLobe(th, len);
  float rr = rho * R;
  vec3 p = vec3(sin(th) * rr, cos(th) * rr, 0.0);
  p.z += 0.2 * abs(d) * rr;                  // V-fold along each lobe midrib
  p.z -= 0.22 * rr * rr;                            // overall droop
  p.z += 0.03 * sin(uTime * 0.8 + aSeed * 5.0 + rr * 3.0) * rr;
  return p;
}

void main() {
  float t = uv.x, rho = uv.y;
  vec3 pos = shape(t, rho);
  float e = 0.004;
  float rr = clamp(rho, 0.02, 0.98);
  vec3 q = shape(t, rr);
  vec3 n = normalize(cross(shape(t + e, rr) - q, shape(t, rr + e) - q));
  float len;
  vLobeD = nearestLobe((t - 0.5) * 3.9, len);
  vUv = uv;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(pos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const leafFragment = /* glsl */ `
${common}
varying vec2  vUv;
varying vec3  vN;
varying vec3  vW;
varying float vLobeD;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  bool front = dot(N, V) > 0.0;
  if (!front) N = -N;
  vec3 top = hexc(44, 80, 34), under = hexc(104, 134, 76);
  vec3 alb = front ? top : under;
  float mid = exp(-vLobeD * vLobeD * 2500.0);
  alb = mix(alb, hexc(120, 150, 86), mid * 0.5);
  float sec = pow(abs(sin(vLobeD * 60.0 - vUv.y * 22.0)), 30.0) * smoothstep(0.1, 0.5, vUv.y);
  alb = mix(alb, hexc(110, 145, 80), sec * 0.3);
  alb *= 0.9 + 0.15 * vnoise(vUv * vec2(60.0, 30.0));
  vec3 col = shade(alb, N, V, 0.35, front ? 0.3 : 0.08, 30.0, 0.8);
  gl_FragColor = vec4(finish(col), 1.0);
}
`;
