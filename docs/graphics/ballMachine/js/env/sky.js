// Glasshouse environment — sky dome (gradient, sun, moon, stars, clouds) and the grounds
// outside the glass (terrace, lawn, hedges, trees, treeline & hill silhouettes).
import * as THREE from 'three';
import { GeoBuilder, Rng, periodicNoise1D, TAU, lerp, clamp } from './util.js';
import * as LY from './layout.js';
import { foliageMaterial, card } from './plants.js';

export const NOISE_GLSL = /* glsl */`
float gh_hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gh_hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float gh_vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh_hash12(i), gh_hash12(i + vec2(1.0, 0.0)), u.x), mix(gh_hash12(i + vec2(0.0, 1.0)), gh_hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float gh_fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * gh_vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

// ------------------------------------------------------------------- sky ---
export function buildSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunVis: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTwilight: { value: 0 }, uTime: { value: 0 },
    uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uCover: { value: 0.56 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'gh.sky', uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.999998, p.w);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunCol, uMoonDir, uCloudLit, uCloudShade;
      uniform float uSunVis, uNight, uTwilight, uTime, uCover;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        float up = clamp(y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.52));
        float sd = dot(d, uSunDir);
        vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
        float azc = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunH), 0.0);
        // twilight band hugging the horizon on the sun side
        col += uSunCol * uTwilight * pow(azc, 2.5) * exp(-max(y, 0.0) * 7.0) * 0.55;
        // aureole
        float s0 = max(sd, 0.0);
        col += uSunCol * (pow(s0, 10.0) * 0.28 + pow(s0, 160.0) * 1.4) * uSunVis;
        // clouds on a virtual plane
        if (y > 0.0) {
          vec2 cp = d.xz / (y + 0.14) * 1.25 + vec2(uTime * 0.006, uTime * 0.0021);
          float n = gh_fbm(cp);
          float c = smoothstep(uCover, uCover + 0.3, n) * smoothstep(0.0, 0.2, y);
          float lit = clamp(0.5 + 0.45 * s0 + (n - uCover) * 0.9, 0.0, 1.0);
          vec3 cc = mix(uCloudShade, uCloudLit, lit);
          cc += uSunCol * pow(s0, 7.0) * 0.45 * uSunVis;
          col = mix(col, cc, c * 0.9);
        }
        // stars
        if (uNight > 0.01 && y > 0.0) {
          vec3 sp = d * 230.0;
          vec3 cell = floor(sp);
          float h = gh_hash13(cell);
          if (h > 0.9962) {
            vec3 ctr = cell + 0.5 + (vec3(gh_hash13(cell + 1.3), gh_hash13(cell + 2.7), gh_hash13(cell + 5.1)) - 0.5) * 0.6;
            float dd = length(sp - ctr);
            float tw = 0.7 + 0.3 * sin(uTime * (1.0 + h * 40.0) + h * 100.0);
            col += vec3(0.85, 0.9, 1.0) * smoothstep(0.38, 0.0, dd) * uNight * tw * (h - 0.9962) * 520.0 * smoothstep(0.0, 0.3, y);
          }
        }
        // moon
        float md = dot(d, uMoonDir);
        col += vec3(1.0, 0.96, 0.88) * smoothstep(0.99986, 0.9999, md) * 3.0 * uNight;
        col += vec3(0.45, 0.55, 0.9) * pow(max(md, 0.0), 40.0) * 0.07 * uNight;
        // sun disk
        col += uSunCol * smoothstep(0.99993, 0.99996, sd) * 40.0 * uSunVis;
        // below the horizon fade to the haze colour
        col = mix(col, uGround, smoothstep(0.0, -0.05, y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.SphereGeometry(100, 64, 32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'gh.sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.setFromMatrixPosition(camera.matrixWorld);
    mesh.updateMatrixWorld();
  };
  return { mesh, uniforms };
}

// --------------------------------------------------------------- outside ---
function crownSkyline(seed, n, count, hMin, hMax, wMin, wMax, conifers = 0.2) {
  const rng = new Rng(seed);
  const hs = new Float32Array(n + 1).fill(0);
  for (let c = 0; c < count; c++) {
    const center = rng.next();
    const conifer = rng.chance(conifers);
    const w = rng.range(wMin, wMax) * (conifer ? 0.38 : 1);
    const H = rng.range(hMin, hMax);
    const i0 = Math.floor((center - w) * n), i1 = Math.ceil((center + w) * n);
    for (let i = i0; i <= i1; i++) {
      const ii = ((i % n) + n) % n;
      const x = (i / n - center) / w;
      if (Math.abs(x) >= 1) continue;
      const v = conifer ? H * 1.25 * (1 - Math.abs(x)) : H * Math.sqrt(1 - x * x);
      if (v > hs[ii]) hs[ii] = v;
    }
  }
  hs[n] = hs[0];
  return hs;
}

export function buildOutside(tex, U, { seed = 17 } = {}) {
  const group = new THREE.Group();
  group.name = 'glasshouse-outside';
  const rng = new Rng(seed);

  // ---- distant silhouettes (painter-ordered, no depth)
  const hazeU = { uHaze: { value: new THREE.Color() }, uLight: { value: new THREE.Color(1, 1, 1) }, uHazeBoost: { value: 0 } };
  const ringMat = new THREE.ShaderMaterial({
    name: 'gh.distant', uniforms: hazeU, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aCol;   // rgb, haze amount
      varying vec3 vCol; varying float vHaze; varying float vY;
      void main() {
        vCol = aCol.rgb; vHaze = aCol.a; vY = position.y;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.999997, p.w);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uHaze, uLight; uniform float uHazeBoost;
      varying vec3 vCol; varying float vHaze; varying float vY;
      void main() {
        float h = clamp(vHaze + uHazeBoost * (1.0 - vHaze) + (1.0 - smoothstep(-3.0, 6.0, vY)) * 0.25, 0.0, 1.0);
        vec3 c = mix(vCol * uLight, uHaze, h);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const layers = [
    { R: 440, n: 360, order: -999, col: '#5a7462', haze: 0.78, prof: (() => { const f = periodicNoise1D(seed + 1, 4); return (u) => 12 + 20 * Math.pow(0.5 + 0.5 * f(u), 1.6); })() },
    { R: 330, n: 360, order: -998, col: '#46653f', haze: 0.6, prof: (() => { const f = periodicNoise1D(seed + 2, 5); return (u) => 7 + 12 * Math.pow(0.5 + 0.5 * f(u), 1.4); })() },
  ];
  const tl = crownSkyline(seed + 3, 1440, 900, 7, 15, 0.0025, 0.007, 0.18);
  const tl2 = crownSkyline(seed + 4, 1440, 700, 5, 11, 0.003, 0.008, 0.1);
  layers.push({ R: 250, n: 1440, order: -997, col: '#2c4529', haze: 0.36, prof: (u) => 3 + tl2[Math.round(u * 1440) % 1441] });
  layers.push({ R: 200, n: 1440, order: -996, col: '#223a20', haze: 0.24, prof: (u) => 2 + tl[Math.round(u * 1440) % 1441] });
  for (const L of layers) {
    const pos = [], col = [], idx = [];
    const c = new THREE.Color(L.col);
    for (let i = 0; i <= L.n; i++) {
      const u = i / L.n, a = u * TAU;
      const x = Math.cos(a) * L.R, z = Math.sin(a) * L.R;
      const top = L.prof(u);
      pos.push(x, -4, z, x, top, z);
      col.push(c.r * 0.8, c.g * 0.8, c.b * 0.8, L.haze, c.r, c.g, c.b, L.haze);
      if (i < L.n) { const b = i * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, ringMat);
    m.renderOrder = L.order;
    m.frustumCulled = false;
    m.name = 'gh.distant';
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // ---- lawn
  const lawnB = new GeoBuilder();
  {
    const segs = 160, rings = 26, r0 = 18.2, r1 = 185;
    const grid = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU, row = [];
      for (let j = 0; j <= rings; j++) {
        const r = r0 * Math.pow(r1 / r0, j / rings);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        row.push(lawnB.v(x, 0, z, 0, 1, 0, x / 4, z / 4));
      }
      grid.push(row);
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < rings; j++) lawnB.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
  }
  const lawnMat = new THREE.MeshStandardMaterial({ name: 'gh.lawn', map: tex.lawn, color: 0xc4ccb4, roughness: 0.95, metalness: 0 });
  const lawn = new THREE.Mesh(lawnB.build(), lawnMat);
  lawn.name = 'gh.lawn'; lawn.matrixAutoUpdate = false;
  group.add(lawn);

  // ---- gravel terrace + garden paths
  const gB = new GeoBuilder();
  {
    const segs = 160;
    const inner = [], outer = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const ri = LY.polyRadius(LY.WALL_OUTER, a) - 0.05, ro = 18.6;
      inner.push(gB.v(Math.cos(a) * ri, 0.01, Math.sin(a) * ri, 0, 1, 0, Math.cos(a) * ri / 2, Math.sin(a) * ri / 2));
      outer.push(gB.v(Math.cos(a) * ro, 0.01, Math.sin(a) * ro, 0, 1, 0, Math.cos(a) * ro / 2, Math.sin(a) * ro / 2));
    }
    for (let i = 0; i < segs; i++) gB.quad(inner[i], inner[i + 1], outer[i + 1], outer[i]);
    for (const s of [1, -1]) {
      const w = 1.6, z0 = 18.0, z1 = 150, n = 20;
      const L = [], R = [];
      for (let j = 0; j <= n; j++) {
        const z = lerp(z0, z1, j / n);
        L.push(gB.v(-w, 0.03, z * s, 0, 1, 0, -w / 2, z / 2));
        R.push(gB.v(w, 0.03, z * s, 0, 1, 0, w / 2, z / 2));
      }
      for (let j = 0; j < n; j++) gB.quad(L[j], R[j], R[j + 1], L[j + 1]);
    }
  }
  const gravelMat = new THREE.MeshStandardMaterial({ name: 'gh.gravel', map: tex.gravel, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const gravel = new THREE.Mesh(gB.build(), gravelMat);
  gravel.name = 'gh.gravel'; gravel.matrixAutoUpdate = false;
  group.add(gravel);

  // ---- hedges, topiary and parkland trees (vertex coloured, one draw call)
  const vB = new GeoBuilder({ color: 3 });
  const col = new THREE.Color();
  const jitterGeo = (geo, amp, freq, s) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * freq + s) * Math.sin(y * freq * 1.3 + s * 2) * Math.sin(z * freq * 0.9 + s * 3);
      const n2 = Math.sin(x * freq * 2.7 + s) * Math.sin(z * freq * 2.3 - s);
      const k = 1 + amp * n + amp * 0.5 * n2;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const addColored = (geo, m, c, dark = 0) => {
    vB.addGeometry(geo, m, {
      perVertex: (b, v, n) => {
        const shade = 0.72 + 0.28 * clamp(n.y * 0.5 + 0.5, 0, 1) - dark;
        b.set('color', c.r * shade, c.g * shade, c.b * shade);
      },
    });
  };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  // path hedges
  for (const s of [1, -1]) {
    for (const side of [-1, 1]) {
      for (let z = 22; z < 70; z += 7.5) {
        const len = 6.2;
        const g = new THREE.BoxGeometry(0.6, 0.7, len, 2, 2, 8);
        jitterGeo(g, 0.05, 3.1, z);
        M4.makeTranslation(side * 2.4, 0.35, s * (z + len / 2));
        addColored(g, M4, col.set('#2c4a25'));
        g.dispose();
      }
    }
    // topiary cones by the doors
    for (const side of [-1, 1]) {
      const g = jitterGeo(new THREE.ConeGeometry(0.7, 2.4, 12, 4), 0.04, 4, side);
      M4.makeTranslation(side * 3.2, 1.2, s * 19.6);
      addColored(g, M4, col.set('#27431f'));
      g.dispose();
    }
  }
  // parkland trees: bark cylinders + alpha-tested leaf-card canopies (soft, leafy silhouettes)
  const leafB = new GeoBuilder({ color: 3, aSway: 3 });
  const palette = ['#5f8a44', '#6a9148', '#557c3e', '#7a9a4c', '#8a5a4a', '#83a24e', '#4c7038'];
  let placed = 0, tries = 0;
  const spots = [];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  while (placed < 40 && tries < 2000) {
    tries++;
    const a = rng.range(0, TAU), r = lerp(28, 175, Math.pow(rng.next(), 0.85));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 9 + r * 0.05 && Math.abs(z) > 15) continue;       // keep the garden vistas open
    if (spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 8 + r * 0.06)) continue;
    spots.push([x, z]);
    placed++;
    const conifer = rng.chance(0.16);
    const H = conifer ? rng.range(12, 22) : rng.range(10, 19);
    const trunkH = conifer ? H * 0.3 : H * rng.range(0.34, 0.45);
    const tg = new THREE.CylinderGeometry(H * 0.016, H * 0.03, trunkH + (conifer ? H * 0.5 : H * 0.15), 6);
    M4.makeTranslation(x, (trunkH + (conifer ? H * 0.5 : H * 0.15)) / 2, z);
    addColored(tg, M4, col.set('#4a3a2c'), 0.1);
    tg.dispose();
    const base = new THREE.Color(rng.pick(palette));
    const phase = rng.range(0, TAU);
    if (conifer) {
      const tiers = 9;
      for (let k = 0; k < tiers; k++) {
        const y = trunkH * 0.7 + (k / tiers) * H * 0.78;
        const rad = H * 0.2 * (1 - k / tiers) + 0.6;
        for (let c = 0; c < 6; c++) {
          const aa = c * TAU / 6 + k * 0.7 + rng.range(-0.3, 0.3);
          const dir = V3(Math.cos(aa), -0.25, Math.sin(aa)).normalize();
          const ctr = V3(x + Math.cos(aa) * rad * 0.55, y, z + Math.sin(aa) * rad * 0.55);
          const ax = V3(-Math.sin(aa), 0, Math.cos(aa));
          const ay = V3().crossVectors(dir, ax).normalize();
          const k2 = 0.55 + 0.45 * (k / tiers);
          card(leafB, ctr, ax, ay, rad * 1.5, rad * 1.1, { segX: 1, segY: 1, normal: dir, sway: () => [0.02, phase, 0], color: () => [base.r * 0.55 * k2, base.g * 0.62 * k2, base.b * 0.6 * k2] });
        }
      }
    } else {
      const crownR = H * rng.range(0.3, 0.38);
      const cy = trunkH + crownR * 0.85;
      const n = 46;
      for (let i = 0; i < n; i++) {
        const u = rng.range(-0.45, 1), aa = rng.range(0, TAU);
        const rr = Math.sqrt(1 - u * u);
        const dir = V3(Math.cos(aa) * rr, u, Math.sin(aa) * rr);
        const inset = rng.range(0.45, 0.92);
        const ctr = V3(x + dir.x * crownR * inset, cy + dir.y * crownR * 0.8 * inset, z + dir.z * crownR * inset);
        const nrm = dir.clone().add(V3(rng.range(-0.5, 0.5), rng.range(-0.3, 0.3), rng.range(-0.5, 0.5))).normalize();
        const ax = V3().crossVectors(V3(0, 1, 0), nrm);
        if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0);
        ax.normalize();
        const ay = V3().crossVectors(nrm, ax).normalize();
        const w = crownR * rng.range(0.7, 1.05);
        const ao = (0.5 + 0.5 * clamp((u + 0.45) / 1.45, 0, 1)) * (0.75 + 0.25 * inset);
        const tint = rng.range(0.85, 1.12);
        card(leafB, ctr, ax, ay, w, w, { segX: 1, segY: 1, normal: nrm, sway: () => [0.03, phase + i * 0.2, 0.01], color: () => [base.r * ao * tint, base.g * ao * tint, base.b * ao * tint] });
      }
    }
  }
  const vegMat = new THREE.MeshStandardMaterial({ name: 'gh.parkland', vertexColors: true, roughness: 0.95, metalness: 0 });
  const veg = new THREE.Mesh(vB.build(), vegMat);
  veg.name = 'gh.parkland'; veg.matrixAutoUpdate = false;
  group.add(veg);
  const canopyMat = foliageMaterial('gh.parkland.leaves', tex.leaves.shrub, U, { roughness: 0.75, trans: 0.7 });
  const canopy = new THREE.Mesh(leafB.build(), canopyMat);
  canopy.name = 'gh.parkland.leaves'; canopy.matrixAutoUpdate = false;
  group.add(canopy);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, hazeUniforms: hazeU };
}
