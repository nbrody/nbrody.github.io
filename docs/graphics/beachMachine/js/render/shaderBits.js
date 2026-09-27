// Small shader-patching helpers shared by the beach's materials: a world-space
// position varying, cheap value noise, and "carving" — discarding a
// material's fragments inside a list of capsules, which is how tunnel mouths
// are cut through the sand and arches through the sandcastle's walls.
import * as THREE from 'three';

export const NOISE = /* glsl */`
float bm_hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bm_hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float bm_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bm_hash12(i), bm_hash12(i + vec2(1.0, 0.0)), u.x), mix(bm_hash12(i + vec2(0.0, 1.0)), bm_hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float bm_fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * bm_noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

/** Add `varying vec3 vWPos` (world position, instancing-aware) to a patched shader. */
export function withWorldPos(sh) {
  if (sh.vertexShader.includes('vWPos')) return;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 bmW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          bmW = instanceMatrix * bmW;
        #endif
        vWPos = (modelMatrix * bmW).xyz;
      }`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;');
}

// ------------------------------------------------------------------ carving
const MAX_CARVE = 24;

export class Carver {
  constructor() {
    this.list = [];
    this.uniforms = {
      uCarveA: { value: Array.from({ length: MAX_CARVE }, () => new THREE.Vector4(0, -99, 0, 0)) },
      uCarveB: { value: Array.from({ length: MAX_CARVE }, () => new THREE.Vector4(0, -99, 0, 0)) },
      uCarveN: { value: 0 },
    };
  }
  /** Carve away everything within r of the segment a–b. */
  add(a, b, r) {
    if (this.list.length >= MAX_CARVE) { console.warn('carver full'); return this; }
    const i = this.list.length;
    this.list.push({ a, b, r });
    this.uniforms.uCarveA.value[i].set(a.x, a.y, a.z, r);
    this.uniforms.uCarveB.value[i].set(b.x, b.y, b.z, 0);
    this.uniforms.uCarveN.value = this.list.length;
    return this;
  }
  /** Does a point lie inside any carve? (for placing decorations) */
  inside(p, pad = 0) {
    for (const { a, b, r } of this.list) if (segDist(p, a, b) < r + pad) return true;
    return false;
  }
  /** Patch a shader (inside onBeforeCompile) to discard carved fragments. */
  inject(sh) {
    withWorldPos(sh);
    Object.assign(sh.uniforms, this.uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uCarveA[${MAX_CARVE}]; uniform vec4 uCarveB[${MAX_CARVE}]; uniform int uCarveN;
        float bm_carve(vec3 p) {
          float dm = 1e9;
          for (int i = 0; i < ${MAX_CARVE}; i++) {
            if (i >= uCarveN) break;
            vec3 a = uCarveA[i].xyz, ab = uCarveB[i].xyz - a;
            float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
            dm = min(dm, length(p - a - ab * h) - uCarveA[i].w);
          }
          return dm;
        }`)
      .replace('void main() {', 'void main() {\n  if (bm_carve(vWPos) < 0.0) discard;');
  }
}

function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let h = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2;
  h = Math.max(0, Math.min(1, h));
  return Math.hypot(p.x - a.x - abx * h, p.y - a.y - aby * h, p.z - a.z - abz * h);
}

/** Chain several onBeforeCompile patches on one material. */
export function patch(mat, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh, r); };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  const tag = Math.random().toString(36).slice(2, 8);
  mat.customProgramCacheKey = () => key + tag;
  return mat;
}
