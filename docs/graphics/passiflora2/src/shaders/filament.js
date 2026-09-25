// Corona filaments: instanced tubes. Each tube's centreline is a curve evaluated in
// the vertex shader (outward, lifted, drooping, crinkled at the tip), with a
// frame built on the fly so the tube follows it.
import { common } from './common.js';

export const filamentVertex = /* glsl */ `
${common}
attribute vec2 aTube;  // theta around tube, v along tube
attribute vec4 aF;     // angle, length, r0, elevation
attribute vec4 aF2;    // seed, thickness, droop, kind (0 = long corona, 1 = inner short)
varying float vV;
varying float vKind;
varying float vSeed;
varying vec3  vN;
varying vec3  vW;

vec3 curve(float v) {
  float L = aF.y, r0 = aF.z, el = aF.w;
  float a = aF.x + 0.025 * sin(uTime * 0.7 + aF2.x * 10.0) * v * v;
  float s = L * v;
  float r = r0 + s * cos(el);
  float z = 0.035 + s * sin(el) - aF2.z * s * s;
  float cr = smoothstep(0.3, 1.0, v) * (1.0 - aF2.w);
  float cr2 = cr * cr;
  float w1 = sin(v * 34.0 + aF2.x * 20.0 + uTime * 0.6) * 0.010 * cr2 * L
           + (hash11(aF2.x) - 0.5) * 0.06 * v * v * L;            // slight sideways sweep
  float w2 = cos(v * 29.0 + aF2.x * 13.0 + uTime * 0.5) * 0.008 * cr2 * L;
  vec3 d = vec3(cos(a), sin(a), 0.0);
  vec3 p = vec3(-sin(a), cos(a), 0.0);
  return d * r + p * w1 + vec3(0.0, 0.0, z + w2);
}

void main() {
  float th = aTube.x, v = aTube.y;
  vec3 c = curve(v);
  vec3 T = normalize(curve(min(v + 0.01, 1.0)) - curve(max(v - 0.01, 0.0)));
  vec3 B = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
  vec3 Nn = cross(B, T);
  float rad = aF2.y * (1.0 - 0.45 * v) * (v > 0.999 ? 0.0 : 1.0);
  vec3 n = cos(th) * Nn + sin(th) * B;
  vec3 pos = c + n * rad;

  vV = v; vKind = aF2.w; vSeed = aF2.x;
  vec4 w = modelMatrix * vec4(pos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const filamentFragment = /* glsl */ `
${common}
varying float vV;
varying float vKind;
varying float vSeed;
varying vec3  vN;
varying vec3  vW;

vec3 filamentColor(float v) {
  float j = (hash11(vSeed * 3.3) - 0.5) * 0.05;
  if (vKind < 0.5) {
    vec3 dark  = hexc(38, 6, 44);
    vec3 purp  = hexc(92, 24, 104);
    vec3 white = hexc(244, 242, 255);
    vec3 blue  = hexc(172, 170, 246);
    vec3 vio   = hexc(122, 114, 226);
    vec3 c = mix(dark, purp, smoothstep(0.06, 0.17, v));
    c = mix(c, white, smoothstep(0.18 + j, 0.25 + j, v));
    c = mix(c, blue,  smoothstep(0.33 + j, 0.46 + j, v));
    c = mix(c, vio,   smoothstep(0.5, 0.95, v));
    return c;
  }
  vec3 c = mix(hexc(46, 8, 50), hexc(140, 60, 140), smoothstep(0.1, 0.6, v));
  return mix(c, hexc(246, 236, 246), smoothstep(0.55, 0.95, v));
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 alb = filamentColor(vV);
  float ao = mix(0.35, 1.0, smoothstep(0.0, 0.3, vV));
  vec3 col = shade(alb, N, V, 0.45, 0.35, 36.0, ao);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.25, vV));
  gl_FragColor = vec4(finish(col), 1.0);
}
`;
