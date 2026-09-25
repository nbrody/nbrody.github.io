// Tepals: 5 sepals + 5 petals. The flat plane is bent into shape entirely in the
// vertex shader; normals come from finite differences of the same shape function.
import { common } from './common.js';

export const tepalVertex = /* glsl */ `
${common}
attribute vec4 aTepal;   // angle, length, width, kind (1 = sepal, 0 = petal)
attribute vec4 aTepal2;  // seed, lift, curl, cup
varying vec2  vUv;
varying vec3  vN;
varying vec3  vW;
varying float vKind;
varying float vR;
varying float vAng;

vec3 shape(float u, float v) {
  float L = aTepal.y, W = aTepal.z;
  // oblong blade with a blunt, rounded tip
  float prof  = 0.28 * (1.0 - v) * (1.0 - v) + pow(sin(PI * pow(v, 0.9)), 0.5) * smoothstep(1.0, 0.8, v)
              + pow(max(1.0 - v, 0.0), 0.5) * (1.0 - smoothstep(1.0, 0.8, v)) * 0.95;
  float halfw = W * prof * (1.0 - 0.18 * v);
  float x = u * 2.0 * halfw;
  float r = 0.07 + L * v;
  float z = aTepal2.w * (u * 2.0) * (u * 2.0) * halfw;      // shallow cup across
  z += aTepal2.y * v - aTepal2.z * v * v;                  // rise, then curl back
  z -= 0.010 * exp(-u * u * 150.0) * v;                    // midrib groove
  z += x * (hash11(aTepal2.x * 7.1) - 0.5) * 0.35 * v;     // slight twist
  z += 0.006 * sin(uTime * 0.9 + aTepal2.x * 6.0) * v * v; // breeze
  z += aTepal.w < 0.5 ? 0.012 : 0.0;                       // petals sit above sepals
  float a = aTepal.x;
  vec3 d = vec3(cos(a), sin(a), 0.0);
  vec3 p = vec3(-sin(a), cos(a), 0.0);
  return d * r + p * x + vec3(0.0, 0.0, z);
}

void main() {
  float u = uv.x - 0.5;
  float v = uv.y;
  vec3 pos = shape(u, v);
  float vv = min(v, 0.97);
  float e = 0.003;
  vec3 q  = shape(u, vv);
  vec3 qu = shape(u + e, vv);
  vec3 qv = shape(u, vv + e);
  vec3 n = normalize(cross(qv - q, qu - q));

  vUv = uv; vKind = aTepal.w;
  vR = length(pos.xy); vAng = atan(pos.y, pos.x);
  vec4 w = modelMatrix * vec4(pos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const tepalFragment = /* glsl */ `
${common}
varying vec2  vUv;
varying vec3  vN;
varying vec3  vW;
varying float vKind;
varying float vR;
varying float vAng;

void main() {
  float u = vUv.x - 0.5, v = vUv.y;
  float sepal = vKind;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  bool front = dot(N, V) > 0.0;
  if (!front) N = -N;

  vec3 cWhite = mix(hexc(238, 243, 226), hexc(226, 236, 206), sepal);
  vec3 cGreen = hexc(170, 198, 132);
  float au = abs(u) * 2.0;
  float g = 0.30 * smoothstep(0.35, 0.0, v)
          + 0.30 * pow(au, 3.0)
          + 0.35 * smoothstep(0.72, 1.0, v) * (0.4 + sepal);
  vec3 alb = mix(cWhite, cGreen, clamp(g, 0.0, 1.0));

  // fine longitudinal veins converging at the tip
  float vein = pow(abs(sin(u * PI * 15.0 + 0.4 * sin(v * 5.0))), 22.0);
  alb = mix(alb, cGreen * 0.9, vein * 0.22);
  float mid = exp(-u * u * 500.0);
  alb = mix(alb, hexc(150, 186, 104), mid * (0.35 + 0.35 * sepal));

  // underside: sepals are leafy green behind, petals only slightly tinted
  if (!front) alb = mix(alb, hexc(118, 158, 78), 0.35 + 0.5 * sepal);

  // soft speckle of tissue variation
  alb *= 0.94 + 0.08 * vnoise(vUv * vec2(40.0, 90.0));

  // cheap stand-in for the filament shadows falling across the tepals
  float stripes = smoothstep(0.35, 1.0, sin(vAng * 97.0 + vR * 9.0));
  float zone = smoothstep(0.92, 0.55, vR) * smoothstep(0.14, 0.3, vR);
  float sh = 1.0 - 0.32 * stripes * zone * (front ? 1.0 : 0.0);

  float ao = mix(0.45, 1.0, smoothstep(0.08, 0.5, vR));
  vec3 col = shade(alb, N, V, 0.6, 0.12, 20.0, ao);
  col *= sh * mix(0.6, 1.0, smoothstep(0.06, 0.35, vR));
  gl_FragColor = vec4(finish(col), 1.0);
}
`;
