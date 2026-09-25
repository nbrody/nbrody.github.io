import * as THREE from 'three';
import { tepalVertex, tepalFragment } from './shaders/tepal.js';
import { filamentVertex, filamentFragment } from './shaders/filament.js';
import { discVertex, discFragment } from './shaders/disc.js';
import { organVertex, organFragment } from './shaders/organ.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function instanced(base, count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  for (const [name, [arr, size]] of Object.entries(attrs)) {
    g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), size));
  }
  g.instanceCount = count;
  return g;
}

// A tube template: attribute aTube = (theta, v). Geometry is placed by the shader.
function tubeTemplate(radial = 6, segs = 22) {
  const tube = [], idx = [];
  for (let j = 0; j <= segs; j++)
    for (let i = 0; i <= radial; i++) tube.push((i / radial) * TAU, j / segs);
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aTube', new THREE.Float32BufferAttribute(tube, 2));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array((tube.length / 2) * 3).fill(0), 3));
  g.setIndex(idx);
  return g;
}

export function organMaterial(shared, o) {
  return new THREE.ShaderMaterial({
    vertexShader: organVertex,
    fragmentShader: organFragment,
    uniforms: {
      ...shared,
      uBase: { value: new THREE.Color(o.base) },
      uSpot: { value: new THREE.Color(o.spot ?? o.base) },
      uSpotAmt: { value: o.spotAmt ?? 0 },
      uSpotScale: { value: o.spotScale ?? 60 },
      uTrans: { value: o.trans ?? 0.3 },
      uSpec: { value: o.spec ?? 0.3 },
      uGrain: { value: o.grain ?? 0.05 },
    },
  });
}

// THREE.Color(hex) stores linear values; organ shader applies srgb() itself,
// so feed it raw sRGB triples instead.
function srgbColor(hex) {
  const c = new THREE.Color();
  c.setHex(hex, THREE.LinearSRGBColorSpace);
  return c;
}

function tube(points, radius, mat, radialSegs = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, radialSegs, false), mat);
}

function ellipsoid(r, pos, mat, lookDir) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
  m.scale.set(...r);
  m.position.set(...pos);
  if (lookDir) m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), lookDir.clone().normalize());
  return m;
}

export function createFlower(shared, seed = 1) {
  const rand = rng(seed * 9973 + 17);
  const group = new THREE.Group();
  const spin = rand() * TAU;

  // ---- tepals -------------------------------------------------------------
  {
    const a = [], b = [];
    for (let i = 0; i < 10; i++) {
      const sepal = i % 2 === 0;
      const ang = spin + (i * TAU) / 10 + (rand() - 0.5) * 0.08;
      a.push(ang, (sepal ? 0.96 : 0.9) * (0.95 + rand() * 0.1), sepal ? 0.23 : 0.21, sepal ? 1 : 0);
      b.push(rand() * 10, sepal ? 0.1 : 0.13, sepal ? 0.16 : 0.13, sepal ? 0.22 : 0.3);
    }
    const plane = new THREE.PlaneGeometry(1, 1, 14, 48);
    const geo = instanced(plane, 10, { aTepal: [a, 4], aTepal2: [b, 4] });
    const mat = new THREE.ShaderMaterial({
      vertexShader: tepalVertex, fragmentShader: tepalFragment,
      uniforms: shared, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- corona filaments ---------------------------------------------------
  {
    const a = [], b = [];
    const row = (n, r0, L, el, droop, thick, kind, offset) => {
      for (let i = 0; i < n; i++) {
        const ang = spin + ((i + offset) * TAU) / n + (rand() - 0.5) * (TAU / n) * 0.6;
        a.push(ang, L * (0.9 + rand() * 0.2), r0, el + (rand() - 0.5) * 0.12);
        b.push(rand() * 100, thick * (0.85 + rand() * 0.3), droop, kind);
      }
    };
    row(150, 0.17, 0.68, 0.18, 0.14, 0.0085, 0, 0.0);   // outer long row, lies flat
    row(136, 0.155, 0.6, 0.32, 0.36, 0.008, 0, 0.5);  // inner long row, rises then arcs down
    row(72, 0.125, 0.07, 1.05, 0.0, 0.0042, 1, 0.25); // short upright rows
    row(64, 0.11, 0.06, 1.2, 0.0, 0.004, 1, 0.75);
    row(56, 0.095, 0.05, 1.3, 0.0, 0.0038, 1, 0.1);
    const count = a.length / 4;
    const geo = instanced(tubeTemplate(6, 22), count, { aF: [a, 4], aF2: [b, 4] });
    const mat = new THREE.ShaderMaterial({
      vertexShader: filamentVertex, fragmentShader: filamentFragment, uniforms: shared,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- disc ---------------------------------------------------------------
  {
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.23, 128, 6),
      new THREE.ShaderMaterial({ vertexShader: discVertex, fragmentShader: discFragment, uniforms: shared, side: THREE.DoubleSide })
    );
    disc.position.z = 0.03;
    group.add(disc);
  }

  // ---- androgynophore, stamens, ovary, styles ----------------------------
  const green = organMaterial(shared, { base: srgbColor(0x9fbe5a), spot: srgbColor(0x6b3a50), spotAmt: 0.5, spotScale: 70, trans: 0.4 });
  const anther = organMaterial(shared, { base: srgbColor(0xc9d774), spot: srgbColor(0xe3e39a), spotAmt: 0.6, spotScale: 140, trans: 0.3, grain: 0.12 });
  const style = organMaterial(shared, { base: srgbColor(0x6e2a44), spot: srgbColor(0xb58a7a), spotAmt: 0.55, spotScale: 110, trans: 0.3 });
  const stigma = organMaterial(shared, { base: srgbColor(0xb6cc5c), spot: srgbColor(0x8fa844), spotAmt: 0.4, spotScale: 90, trans: 0.4, spec: 0.5 });

  const col = tube([[0, 0, 0.02], [0, 0, 0.12], [0, 0, 0.225]], 0.027, green, 12);
  group.add(col);

  for (let i = 0; i < 5; i++) {
    const ang = spin + (i * TAU) / 5 + TAU / 20;
    const d = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
    const P = (r, z) => [d.x * r, d.y * r, z];
    group.add(tube([P(0.0, 0.215), P(0.05, 0.225), P(0.1, 0.215), P(0.14, 0.195)], 0.0085, green, 6));
    const t = new THREE.Vector3(-d.y, d.x, 0);
    const axis = d.clone().multiplyScalar(0.85).addScaledVector(t, 0.5).normalize();
    group.add(ellipsoid([0.07, 0.024, 0.013], P(0.145, 0.178), anther, axis));
  }

  group.add(ellipsoid([0.045, 0.045, 0.052], [0, 0, 0.268], green));

  for (let i = 0; i < 3; i++) {
    const ang = spin + (i * TAU) / 3 + 0.4;
    const d = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
    const P = (r, z) => [d.x * r, d.y * r, z];
    group.add(tube([P(0.0, 0.3), P(0.035, 0.33), P(0.085, 0.345), P(0.135, 0.33)], 0.0068, style, 6));
    const tip = new THREE.Vector3(...P(0.15, 0.322));
    group.add(ellipsoid([0.03, 0.021, 0.017], tip.toArray(), stigma, d.clone().add(new THREE.Vector3(0, 0, -0.3))));
  }

  // ---- calyx and stem behind ---------------------------------------------
  const calyx = ellipsoid([0.1, 0.1, 0.06], [0, 0, -0.03], organMaterial(shared, { base: srgbColor(0x7ea04a), trans: 0.3 }));
  group.add(calyx);
  group.add(tube([[0, 0, -0.05], [0.02, -0.12, -0.25], [0.1, -0.5, -0.5], [0.15, -1.2, -0.7]], 0.018,
    organMaterial(shared, { base: srgbColor(0x6f9444), spot: srgbColor(0x8a4a3a), spotAmt: 0.25, trans: 0.3 }), 8));

  return group;
}

export function createBud(shared, len = 0.35) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(new THREE.Vector2(0.11 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.3 * t) + 0.001, t * len));
  }
  const mat = organMaterial(shared, { base: srgbColor(0xc8d27a), spot: srgbColor(0xa5b85c), spotAmt: 0.4, spotScale: 30, trans: 0.6, spec: 0.4 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat));
  g.add(ellipsoid([0.07, 0.07, 0.05], [0, 0.01, 0], organMaterial(shared, { base: srgbColor(0x7ea04a), trans: 0.3 })));
  g.children[1].rotation.x = Math.PI / 2;
  g.add(tube([[0, 0, 0], [0.02, -0.25, 0], [0.08, -0.6, -0.1]], 0.014,
    organMaterial(shared, { base: srgbColor(0x6f9444), trans: 0.3 }), 8));
  return g;
}

export { srgbColor };
