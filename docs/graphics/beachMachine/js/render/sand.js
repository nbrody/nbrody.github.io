// The sand: the dug heightfield round the machine, the wider beach running
// down into the sea, the tunnels the tracks run through and the patted rims
// of their mouths.
import * as THREE from 'three';
import { GRID, SEA_LEVEL, sandHeight } from '../sim/terrain.js';
import { NOISE, Carver, withWorldPos, patch } from './shaderBits.js';

// Sand colour, wetness near the water, wind ripples on the flat beach, and a
// sparkle of grains catching the sun.
export function sandMaterial({ carver, tint = 0xffffff, ripples = 1, packed = 0, grain = 1, glow = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0 });
  const U = { uSea: { value: SEA_LEVEL }, uRipple: { value: ripples }, uPacked: { value: packed }, uTide: { value: 0 }, uGrain: { value: grain }, uGlow: { value: glow } };
  mat.userData.uniforms = U;
  patch(mat, (sh) => {
    withWorldPos(sh);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${NOISE}
        uniform float uSea, uRipple, uPacked, uTide, uGrain, uGlow;
        float bm_wet(vec3 p) { return 1.0 - smoothstep(uSea + 0.02 + uTide, uSea + 0.32 + uTide * 0.5, p.y); }
        float bm_ripple(vec2 q) {
          // wind ripples: crests across the prevailing (north-westerly) wind, wandering a little
          vec2 d = normalize(vec2(0.8, 0.6));
          float w = dot(q, d) * 9.0 + bm_noise(q * 0.9) * 5.0 + bm_noise(q * 3.1) * 0.8;
          return sin(w) * 0.5 + 0.5;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vWPos.xz;
          float n = bm_fbm(q * 0.55), g = bm_noise(q * 38.0), g2 = bm_hash12(floor(q * 240.0));
          // linear albedo: dry quartz sand, a darker packed sand for sculpting, and wet sand
          vec3 dry = mix(vec3(0.5, 0.37, 0.22), vec3(0.6, 0.47, 0.3), n);
          dry = mix(dry, vec3(0.42, 0.31, 0.19), smoothstep(0.55, 0.9, g) * 0.4);
          dry *= 0.9 + 0.2 * g2;
          vec3 packedCol = mix(vec3(0.5, 0.36, 0.21), vec3(0.57, 0.43, 0.27), n);
          dry = mix(dry, packedCol, uPacked);
          vec3 wet = mix(vec3(0.2, 0.14, 0.085), vec3(0.25, 0.18, 0.11), n);
          float w = bm_wet(vWPos);
          diffuseColor.rgb *= mix(dry, wet, w);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.35, bm_wet(vWPos));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // ripples only where the sand lies flat and dry
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          float flatK = smoothstep(0.93, 0.99, wn.y) * (1.0 - bm_wet(vWPos)) * uRipple * (1.0 - uPacked);
          float e = 0.02;
          float r0 = bm_ripple(vWPos.xz), rx = bm_ripple(vWPos.xz + vec2(e, 0.0)), rz = bm_ripple(vWPos.xz + vec2(0.0, e));
          float gx = (rx - r0) / e, gz = (rz - r0) / e;
          // fine grain everywhere
          float h0 = bm_noise(vWPos.xz * 60.0), hx = bm_noise((vWPos.xz + vec2(0.004, 0.0)) * 60.0), hz = bm_noise((vWPos.xz + vec2(0.0, 0.004)) * 60.0);
          gx = gx * 0.012 * flatK + (hx - h0) / 0.004 * 0.0009 * uGrain;
          gz = gz * 0.012 * flatK + (hz - h0) / 0.004 * 0.0009 * uGrain;
          wn = normalize(wn - vec3(gx, 0.0, gz) * (1.0 - smoothstep(0.3, 0.0, wn.y)));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // glinting grains
          vec2 cell = floor(vWPos.xz * 180.0);
          float h = bm_hash12(cell);
          vec3 V = normalize(cameraPosition - vWPos);
          float glint = step(0.996, h) * pow(max(dot(normal, normalize(vec3(0.3, 1.0, 0.2))), 0.0), 8.0);
          totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * glint * 0.25 * (1.0 - bm_wet(vWPos)) * smoothstep(12.0, 2.0, length(cameraPosition - vWPos)) * uGrain;
          // tunnels: specks of glowing plankton in the damp sand
          if (uGlow > 0.0) {
            vec3 c3 = floor(vWPos * 70.0);
            float hh = bm_hash13(c3);
            vec3 f3 = fract(vWPos * 70.0) - 0.5;
            float dot3 = smoothstep(0.35, 0.0, length(f3)) * step(0.985, hh);
            totalEmissiveRadiance += vec3(0.25, 0.85, 1.0) * dot3 * uGlow * (0.6 + 0.4 * hh);
          }
        }`);
    if (carver) carver.inject(sh);
  });
  return mat;
}

export function buildSand(machine, earth, opts = {}) {
  const group = new THREE.Group();
  group.name = 'sand';
  const carver = new Carver();
  const mat = sandMaterial({ carver });
  const tunnelMat = sandMaterial({ packed: 0.8, ripples: 0, grain: 0, glow: 1.2 });
  tunnelMat.color.setRGB(0.55, 0.48, 0.4);
  tunnelMat.roughness = 0.7;
  tunnelMat.side = THREE.DoubleSide;
  const rimMat = sandMaterial({ packed: 1, ripples: 0 });
  rimMat.color.setRGB(0.93, 0.88, 0.82);

  // ------------------------------------------------ the dug grid
  const { nx, nz, H } = earth, G = earth.grid;
  const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = G.x0 + i * G.step, z = G.z0 + j * G.step;
    pos[3 * k] = x; pos[3 * k + 1] = H[k]; pos[3 * k + 2] = z;
    const hl = H[k - (i > 0 ? 1 : 0)], hr = H[k + (i < nx - 1 ? 1 : 0)], hd = H[k - (j > 0 ? nx : 0)], hu = H[k + (j < nz - 1 ? nx : 0)];
    const ddx = (hr - hl) / ((i > 0 && i < nx - 1 ? 2 : 1) * G.step), ddz = (hu - hd) / ((j > 0 && j < nz - 1 ? 2 : 1) * G.step);
    const l = Math.hypot(ddx, 1, ddz);
    nor[3 * k] = -ddx / l; nor[3 * k + 1] = 1 / l; nor[3 * k + 2] = -ddz / l;
    uv[2 * k] = x; uv[2 * k + 1] = z;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    // split along the shorter diagonal, so creases follow the sand
    if (Math.abs(H[a] - H[d]) < Math.abs(H[b] - H[c])) { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
    else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const fine = new THREE.Mesh(g, mat);
  fine.receiveShadow = true; fine.castShadow = true;
  fine.name = 'sand.near';
  group.add(fine);

  // ------------------------------------------------ the wider beach (with a hole where the grid is)
  {
    const S = 2, X0 = -90, X1 = 90, Z0 = -120, Z1 = 60;
    const cx = Math.round((X1 - X0) / S) + 1, cz = Math.round((Z1 - Z0) / S) + 1;
    const p = [], n = [], ii = [];
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      p.push(x, sandHeight(x, z), z); n.push(0, 1, 0);
    }
    const inside = (x, z) => x >= G.x0 - 1e-6 && x <= G.x1 + 1e-6 && z >= G.z0 - 1e-6 && z <= G.z1 + 1e-6;
    for (let j = 0; j < cz - 1; j++) for (let i = 0; i < cx - 1; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      if (inside(x, z) && inside(x + S, z + S)) continue;
      const a = j * cx + i, b = a + 1, c = a + cx, d = c + 1;
      ii.push(a, c, b, b, c, d);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    bg.setIndex(ii);
    bg.computeVertexNormals();
    const far = new THREE.Mesh(bg, mat);
    far.receiveShadow = true;
    far.name = 'sand.beach';
    group.add(far);
  }

  // ------------------------------------------------ tunnels and their mouths
  const f = {};
  const tubeG = { pos: [], nor: [], uv: [], idx: [] };
  const rims = [];
  const axisAt = (t, s, body) => {
    t.sample(s, f);
    return { p: { x: f.px + f.ux * body.axis, y: f.py + f.uy * body.axis, z: f.pz + f.uz * body.axis }, T: { x: f.tx, y: f.ty, z: f.tz }, U: { x: f.ux, y: f.uy, z: f.uz }, S: { x: f.sx, y: f.sy, z: f.sz } };
  };
  const RADIAL = 24;
  for (const tn of earth.tunnels) {
    const t = tn.track, body = tn.body;
    const s0 = Math.max(0, tn.s0 - 0.1), s1 = Math.min(t.L, tn.s1 + 0.1);
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.03) + 1);
    const base = tubeG.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const s = s0 + (s1 - s0) * i / (n - 1), a = axisAt(t, s, body);
      for (let k = 0; k <= RADIAL; k++) {
        const th = (k / RADIAL) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        const nx_ = c * a.S.x + sn * a.U.x, ny_ = c * a.S.y + sn * a.U.y, nz_ = c * a.S.z + sn * a.U.z;
        // a flattened floor where the rails sit
        const rr = body.tube * (!body.round && sn < -0.5 ? 0.85 + 0.15 * (1 + sn) / 0.5 : 1);
        tubeG.pos.push(a.p.x + nx_ * rr, a.p.y + ny_ * rr, a.p.z + nz_ * rr);
        tubeG.nor.push(nx_, ny_, nz_);
        tubeG.uv.push(k / RADIAL, s * 4);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < RADIAL; k++) {
      const a = base + i * (RADIAL + 1) + k, b = a + 1, c = a + RADIAL + 1, d = c + 1;
      tubeG.idx.push(a, c, b, b, c, d);
    }
  }
  for (const m of earth.mouths) {
    const t = m.track, body = m.body, a = axisAt(t, m.s, body);
    const dir = m.inward;
    // cut the hole: from a little inside the tunnel out past the mouth
    const inP = { x: a.p.x + a.T.x * dir * 0.25, y: a.p.y + a.T.y * dir * 0.25, z: a.p.z + a.T.z * dir * 0.25 };
    const outP = { x: a.p.x - a.T.x * dir * 0.3, y: a.p.y - a.T.y * dir * 0.3, z: a.p.z - a.T.z * dir * 0.3 };
    carver.add(inP, outP, body.tube + 0.004);
    rims.push({ p: a.p, T: a.T, U: a.U, S: a.S, r: body.tube + 0.012 });
  }
  if (tubeG.idx.length) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tubeG.pos, 3));
    tg.setAttribute('normal', new THREE.Float32BufferAttribute(tubeG.nor, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(tubeG.uv, 2));
    tg.setIndex(tubeG.idx);
    const tube = new THREE.Mesh(tg, tunnelMat);
    tube.receiveShadow = true;
    tube.name = 'sand.tunnels';
    group.add(tube);
  }
  // the patted rim round each mouth
  const rimGeo = new THREE.TorusGeometry(1, 0.2, 10, 28);
  const rimMesh = new THREE.InstancedMesh(rimGeo, rimMat, Math.max(1, rims.length));
  const m4 = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  rims.forEach((r, i) => {
    bx.set(r.S.x, r.S.y, r.S.z); by.set(r.U.x, r.U.y, r.U.z); bz.set(r.T.x, r.T.y, r.T.z);
    m4.makeBasis(bx, by, bz).scale(new THREE.Vector3(r.r, r.r, r.r * 0.9)).setPosition(r.p.x, r.p.y, r.p.z);
    rimMesh.setMatrixAt(i, m4);
  });
  rimMesh.count = rims.length;
  rimMesh.castShadow = true; rimMesh.receiveShadow = true;
  group.add(rimMesh);

  return {
    object: group,
    carver,
    material: mat,
    heightAt: earth.heightAt,
    mouths: rims,
    setTide(level) { for (const m of [mat, tunnelMat, rimMat]) m.userData.uniforms.uTide.value = level; },
  };
}
