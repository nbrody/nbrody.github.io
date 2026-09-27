// The beach machine's mechanisms, dressed for the seaside: flip-flop sandals
// for the switch paddles, steel pans slung from giant surfboards, a Ferris
// wheel, a lighthouse, a toy pail on a see-saw, a ship's bell on a gallows, a
// curling wave round the loop, a surfboard ski jump, tuned bottles, and the
// keep's chimes. Each builder returns { object, update(dt, t) }.
import * as THREE from 'three';
import { BALL, RAIL } from '../../../ballMachine/js/sim/constants.js';
import { midiToHz } from '../../../ballMachine/js/sim/music.js';
import { frames, GeoBuilder } from '../../../ballMachine/js/render/trackMeshes.js';

const R = BALL.R;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;

export function rod(a, b, r, mat, seg = 8) {
  const d = V(b.x - a.x, b.y - a.y, b.z - a.z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  m.castShadow = true;
  return m;
}
export function shadow(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) >>> 0) / 4294967296); }

// ---------------------------------------------------------------- materials
export function beachMaterials(M) {
  const B = {};
  const plastic = (hex) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  B.plastic = plastic;
  B.chrome = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.12 });
  B.panFace = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.18, map: hammeredTexture(), side: THREE.DoubleSide });
  B.driftwood = new THREE.MeshStandardMaterial({ color: 0xb8a78e, roughness: 0.95, map: grainTexture('#b9a88e', '#8a7a62') });
  B.plank = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, map: grainTexture('#a0673c', '#6e4020') });
  B.rope = new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 1 });
  B.white = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.45 });
  B.red = new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.45 });
  B.conch = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: conchTexture(), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15, iridescence: 0.45, iridescenceIOR: 1.6, side: THREE.DoubleSide });
  B.conchOut = new THREE.MeshStandardMaterial({ color: 0xe8cfb0, roughness: 0.6, map: grainTexture('#e9d2b3', '#c49a74'), side: THREE.DoubleSide });
  B.sieve = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: sieveTexture(), roughness: 0.35, clearcoat: 0.3, side: THREE.DoubleSide });
  B.bronze = M.bronze;
  B.brass = M.brass;
  return B;
}
function hammeredTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), R0 = rng(4);
  g.fillStyle = '#c9ced4'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = R0() * 256, y = R0() * 256, r = 3 + R0() * 8;
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(90,96,104,0.0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // grooves round the note areas
  g.strokeStyle = 'rgba(60,64,70,0.5)'; g.lineWidth = 2;
  for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(128 + Math.cos(k) * 70, 128 + Math.sin(k) * 70, 26, 20, k, 0, TAU); g.stroke(); }
  g.beginPath(); g.ellipse(128, 128, 36, 30, 0, 0, TAU); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function grainTexture(base, dark) {
  const c = canvas(256, 64), g = c.getContext('2d'), R0 = rng(base.length * 7);
  g.fillStyle = base; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 60; i++) {
    const y = R0() * 64;
    g.strokeStyle = dark; g.globalAlpha = 0.1 + R0() * 0.25; g.lineWidth = 0.5 + R0() * 1.5;
    g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 1.6); g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// the pink-and-cream whorl inside a conch: u round the funnel, v rim → hole
function conchTexture() {
  const c = canvas(512, 512), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#fbe3d0'); grd.addColorStop(0.35, '#f7b9a4'); grd.addColorStop(0.75, '#e98e84'); grd.addColorStop(1, '#b8556a');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 6; k++) {
    g.strokeStyle = `rgba(255,245,235,${0.35 - k * 0.03})`; g.lineWidth = 10 - k;
    g.beginPath();
    for (let y = 0; y <= 512; y += 4) { const x = ((k / 6) * 512 + y * 1.1) % 512; if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function sieveTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#ffd21f'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#e0a800';
  for (let j = 0; j < 12; j++) for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(i * 16 + (j % 2) * 8 + 4, j * 21 + 10, 3.2, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------------------------------------------------------------- flip-flop switches
export function buildFlipFlops(flipflops, M) {
  const g = new THREE.Group();
  const items = [];
  const cols = ['#ff4f8b', '#2bc6a8', '#ff9a1f', '#7b5cff', '#f5d000', '#19a0e6'];
  // a sandal sole, 13 cm long, standing on edge along the track
  const shape = new THREE.Shape();
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const x = 0.065 + 0.065 * Math.cos(a);
    const w = 0.021 + 0.006 * Math.cos(a) + 0.004 * Math.sin(2 * a);
    const y = w * Math.sin(a);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const sole = new THREE.ExtrudeGeometry(shape, { depth: 0.011, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 });
  sole.rotateY(-Math.PI / 2);
  sole.translate(0.0055, 0, -0.015);
  let k = 0;
  for (const ff of Object.values(flipflops)) {
    const f = ff.frame;
    const node = new THREE.Group();
    node.position.set(f.px - f.ux * 0.004, f.py - f.uy * 0.004, f.pz - f.uz * 0.004);
    node.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(f.sx, f.sy, f.sz), V(f.ux, f.uy, f.uz), V(f.tx, f.ty, f.tz)));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.2), M.brass);
    plate.position.set(0, -RAIL.drop - 0.012, 0.06);
    node.add(plate);
    const pivot = new THREE.Group(); pivot.userData.dynamic = true;
    pivot.position.set(0, -0.004, 0.08);
    const col = new THREE.MeshPhysicalMaterial({ color: cols[k++ % cols.length], roughness: 0.55, clearcoat: 0.2 });
    const s = new THREE.Mesh(sole, col);
    pivot.add(s);
    // the thong strap, on both faces
    const strapM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0035, 6, 16, Math.PI), strapM);
      strap.position.set(side * 0.006, 0, 0.025);
      strap.rotation.set(0, side * Math.PI / 2, Math.PI / 2);
      pivot.add(strap);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.08, 10), M.brass);
    pivot.add(pin);
    node.add(pivot);
    g.add(node);
    items.push({ ff, pivot });
  }
  return { object: shadow(g), update() { for (const it of items) it.pivot.rotation.y = -it.ff.angle * 0.6; } };
}

// ---------------------------------------------------------------- steel pans
function panGeometry(r, depth) {
  // playing face: a shallow concave dish, the rim rolled over, then the skirt
  const pts = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector2(u * r, -0.18 * r * (1 - u * u))); }
  pts.push(new THREE.Vector2(r * 1.03, 0.008), new THREE.Vector2(r * 1.05, -0.01), new THREE.Vector2(r * 1.04, -depth));
  return new THREE.LatheGeometry(pts, 40);
}
export function buildSteelBand(pans, M, B, ladder, mastColor) {
  const g = new THREE.Group();
  const items = [];
  for (const p of pans) {
    const pivot = new THREE.Group(); pivot.userData.dynamic = true;
    pivot.position.set(p.hang.x, p.hang.y, p.hang.z);
    const n = V(p.normal.x, p.normal.y, p.normal.z);
    const node = new THREE.Group();
    node.position.set(p.center.x - p.hang.x, p.center.y - p.hang.y, p.center.z - p.hang.z);
    node.quaternion.setFromUnitVectors(UP, n);
    const mat = B.panFace.clone();
    mat.emissive = new THREE.Color(0xfff0d0); mat.emissiveIntensity = 0;
    const dish = new THREE.Mesh(panGeometry(p.r, 0.07), mat);
    dish.position.y = -0.004;
    node.add(dish);
    pivot.add(node);
    // cords to the hook
    const hook = V(0, 0, 0);
    for (const s of [-1, 1]) {
      const rim = V(p.center.x - p.hang.x + s * p.r * 0.7, p.center.y - p.hang.y + p.r * 0.6, p.center.z - p.hang.z).addScaledVector(n, -0.03);
      pivot.add(rod(hook, rim, 0.0025, B.rope, 4));
    }
    g.add(pivot);
    items.push({ p, pivot, mat });
  }
  // two giant surfboards planted in the sand carry the ramps and the pans
  if (ladder) {
    const cols = [['#19a0e6', '#ffffff', '#ff9a1f'], ['#ff4f8b', '#ffffff', '#f5d000']];
    ladder.mastZ.forEach((z, i) => {
      const board = surfboard(0.56, ladder.y1 - ladder.y0 + 0.6, 0.075, cols[i]);
      board.position.set(ladder.x + 0.1, ladder.y0 - 0.25, z + (i ? 0.045 : -0.045));
      g.add(board);
    });
    const paint = M.paint(mastColor);
    for (const arm of ladder.arms) g.add(rod(arm[0], arm[1], 0.006, paint, 6));
  }
  return {
    object: shadow(g),
    update() {
      for (const it of items) {
        it.pivot.rotation.x = it.p.swing * 0.3;
        it.mat.emissiveIntensity = it.p.amp * 0.35;
      }
    },
  };
}
// a surfboard standing on its tail, face toward ±z (width along x)
function surfboard(w, L, t, cols) {
  const shape = new THREE.Shape();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const u = i / n, y = u * L;
    const hw = w / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.97)), 0.55) * (u > 0.8 ? 1 - (u - 0.8) * 1.6 : 1);
    if (i === 0) shape.moveTo(hw, y); else shape.lineTo(hw, y);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n, y = u * L;
    const hw = w / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.97)), 0.55) * (u > 0.8 ? 1 - (u - 0.8) * 1.6 : 1);
    shape.lineTo(-hw, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t * 0.5, bevelEnabled: true, bevelThickness: t * 0.25, bevelSize: t * 0.2, bevelSegments: 3, curveSegments: 4 });
  geo.translate(0, 0, -t * 0.25);
  // colour: stripes painted down the length
  const c = canvas(64, 512), x = c.getContext('2d');
  x.fillStyle = '#fbf7ee'; x.fillRect(0, 0, 64, 512);
  x.fillStyle = cols[0]; x.fillRect(0, 0, 64, 512 * 0.55);
  x.fillStyle = cols[2]; x.fillRect(0, 512 * 0.55, 64, 20); x.fillRect(0, 512 * 0.6, 64, 8);
  x.fillStyle = cols[1]; x.fillRect(27, 0, 10, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  // planar uv: v along the length
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) / w) + 0.5, 1 - pos.getY(i) / L);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
  return m;
}

// bass pans under the conch: full steel drums on stands, tilted like the colliders
export function buildBassPan(d, M, B, floorAt) {
  const g = new THREE.Group();
  const node = new THREE.Group();
  node.position.set(d.center.x, d.center.y, d.center.z);
  node.quaternion.setFromUnitVectors(UP, V(d.normal.x, d.normal.y, d.normal.z));
  const faceM = B.panFace.clone(); faceM.emissive = new THREE.Color(0xfff0d0); faceM.emissiveIntensity = 0;
  const face = new THREE.Mesh(panGeometry(d.r, 0.02), faceM);
  face.position.y = -0.003;
  node.add(face);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 1.05, d.r * 1.05, d.depth * 2.2, 40, 1, true), new THREE.MeshStandardMaterial({ color: d.name === 'bass1' ? 0x1f8ad0 : 0xe04a2f, metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }));
  barrel.position.y = -d.depth * 1.1;
  node.add(barrel);
  for (const y of [-0.01, -d.depth * 0.8, -d.depth * 1.6]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(d.r * 1.06, 0.007, 8, 48), B.chrome);
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y; node.add(hoop);
  }
  g.add(node);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const top = V(d.center.x + Math.cos(a) * d.r * 0.9, d.center.y - d.depth * 1.8, d.center.z + Math.sin(a) * d.r * 0.9);
    const fx = d.center.x + Math.cos(a) * (d.r + 0.22), fz = d.center.z + Math.sin(a) * (d.r + 0.22);
    g.add(rod(top, V(fx, floorAt(fx, fz), fz), 0.009, B.chrome));
  }
  return {
    object: shadow(g),
    update() { face.position.y = -0.003 - d.amp * 0.01 * Math.sin(d.phase * 70); faceM.emissiveIntensity = d.amp * 0.4; },
  };
}

// ---------------------------------------------------------------- Ferris wheel
export function buildFerrisWheel(wh, M, B, color, floorAt) {
  const g = new THREE.Group();
  const rot = new THREE.Group(); rot.userData.dynamic = true;
  const holder = new THREE.Group();
  holder.position.set(wh.cx, wh.cy, wh.cz);
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(wh.e1.x, 0, wh.e1.z), UP, V(wh.a3.x, 0, wh.a3.z)));
  holder.add(rot);
  const paint = M.paint(color);
  const w = R + 0.02;
  const bulbs = [];
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wh.Rw + 0.06, 0.008, 8, 64), paint);
    rim.position.z = s * w; rot.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(wh.Rw * 0.45, 0.006, 6, 48), B.white);
    inner.position.z = s * w; rot.add(inner);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      rot.add(rod(V(0, 0, s * w), V(Math.cos(a) * (wh.Rw + 0.06), Math.sin(a) * (wh.Rw + 0.06), s * w), 0.0035, B.white, 5));
      bulbs.push(V(Math.cos(a + 0.2) * (wh.Rw + 0.06), Math.sin(a + 0.2) * (wh.Rw + 0.06), s * (w + 0.01)));
    }
  }
  const bulbM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0.3 });
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 8, 6), bulbM, bulbs.length);
  const m4 = new THREE.Matrix4();
  bulbs.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); bulbMesh.setMatrixAt(i, m4); });
  rot.add(bulbMesh);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2 * w + 0.03, 20), M.brass);
  hub.rotation.x = Math.PI / 2; rot.add(hub);
  // gondolas: a cup under each pocket that stays level as the wheel turns
  const cols = ['#e8332c', '#2a6fd6', '#f5c518', '#21a35b', '#f07a1c', '#8a4fbf', '#16a6b8', '#e0457b'];
  const gond = [];
  for (let j = 0; j < wh.n; j++) {
    const cup = new THREE.Group(); cup.userData.dynamic = true;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.012, R * 0.8, R * 1.1, 16, 1, true), new THREE.MeshStandardMaterial({ color: cols[j % cols.length], roughness: 0.4, side: THREE.DoubleSide }));
    bowl.position.y = -R * 0.55;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.8, 16), bowl.material);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -R * 1.1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.02, 0.03, 16), B.white);
    roof.position.y = R + 0.05;
    cup.add(bowl, floor, roof, rod(V(0, -R * 0.2, 0), V(0, R + 0.04, 0), 0.002, B.white, 4));
    g.add(cup);
    gond.push(cup);
  }
  g.add(holder);
  for (const s of [-1, 1]) {
    const ax = V(wh.cx + wh.a3.x * s * (w + 0.06), wh.cy, wh.cz + wh.a3.z * s * (w + 0.06));
    for (const d of [-1, 1]) {
      const fx = ax.x + wh.e1.x * d * 0.42, fz = ax.z + wh.e1.z * d * 0.42;
      g.add(rod(ax, V(fx, floorAt(fx, fz), fz), 0.014, paint));
    }
  }
  g.add(rod(V(wh.cx - wh.a3.x * (w + 0.07), wh.cy, wh.cz - wh.a3.z * (w + 0.07)), V(wh.cx + wh.a3.x * (w + 0.07), wh.cy, wh.cz + wh.a3.z * (w + 0.07)), 0.012, M.steel));
  const tmp = {};
  return {
    object: shadow(g),
    update(dt, t) {
      rot.rotation.z = wh.theta;
      for (let j = 0; j < wh.n; j++) { wh.slotPos(j, tmp); gond[j].position.set(tmp.x, tmp.y, tmp.z); }
      bulbM.emissiveIntensity = 0.3 + 1.5 * (wh.night ?? 0) * (0.75 + 0.25 * Math.sin(t * 3));
    },
    bulbMaterial: bulbM,
  };
}

// ---------------------------------------------------------------- lighthouse
export function buildLighthouse(c, M, B, floorAt, topY) {
  const g = new THREE.Group();
  const y0 = floorAt(c.x, c.z) - 0.05, y1 = topY;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = y0 + (y1 - y0) * i / n, b = y0 + (y1 - y0) * (i + 1) / n;
    const ra = 0.24 - 0.08 * (i / n), rb = 0.24 - 0.08 * ((i + 1) / n);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, b - a, 32), i % 2 ? B.red : B.white);
    seg.position.set(c.x, (a + b) / 2, c.z);
    g.add(seg);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.04, 32), M.iron);
  gallery.position.set(c.x, y1 + 0.02, c.z); g.add(gallery);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.add(rod(V(c.x + Math.cos(a) * 0.23, y1 + 0.04, c.z + Math.sin(a) * 0.23), V(c.x + Math.cos(a) * 0.23, y1 + 0.13, c.z + Math.sin(a) * 0.23), 0.003, M.iron, 4)); }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.004, 6, 40), M.iron); rail.rotation.x = Math.PI / 2; rail.position.set(c.x, y1 + 0.13, c.z); g.add(rail);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 16, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xfff6d8, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  glass.position.set(c.x, y1 + 0.15, c.z); g.add(glass);
  const lampM = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 0.4 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), lampM); lamp.position.set(c.x, y1 + 0.15, c.z); g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 16), B.red); cap.position.set(c.x, y1 + 0.34, c.z); g.add(cap);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), M.gold); ball.position.set(c.x, y1 + 0.44, c.z); g.add(ball);
  shadow(g);
  // the beam: two long cones sweeping round after dark, brightest near the
  // lamp and at their core, fading out along their length
  const beamU = { uOpacity: { value: 0 } };
  const beamM = new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { float along = vUv.y; float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = uOpacity * pow(along, 2.5) * core; gl_FragColor = vec4(vec3(1.0, 0.93, 0.72) * a, 1.0); }',
  });
  const beam = new THREE.Group(); beam.userData.dynamic = true;
  beam.position.set(c.x, y1 + 0.15, c.z);
  for (const s of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 7, 24, 1, true), beamM);
    cone.rotation.z = -s * Math.PI / 2; cone.position.x = -s * 3.5;   // apex at the lamp
    cone.castShadow = false;
    beam.add(cone);
  }
  g.add(beam);
  return {
    object: g,
    night: 0,
    update(dt, t) {
      beam.rotation.y = t * 0.6;
      const n = this.night;
      beamU.uOpacity.value = 0.35 * n;
      beam.visible = n > 0.02;
      lampM.emissiveIntensity = 0.4 + 3 * n;
    },
  };
}

// ---------------------------------------------------------------- sand pail on a see-saw
export function buildPail(bk, M, B, color, floorAt) {
  const g = new THREE.Group();
  const pivotNode = new THREE.Group();
  pivotNode.position.set(bk.pivot.x, bk.pivot.y, bk.pivot.z);
  const frame = new THREE.Group();
  frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(bk.dir.x, 0, bk.dir.z), UP, V(bk.axis.x, 0, bk.axis.z)));
  pivotNode.add(frame);
  const tilt = new THREE.Group(); tilt.userData.dynamic = true;
  frame.add(tilt);
  // the pail lies on its side along the arm, its mouth toward the chute
  const x0 = 0.1, x1 = bk.Lb + 0.075, rb = 0.052, rm = 0.068;
  const pailM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide });
  const yAxis = bk.yOff - R - 0.004 + rb;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rm, rb, x1 - x0, 32, 1, true), pailM);
  body.rotation.z = -Math.PI / 2;                          // cylinder y → +x
  body.position.set((x0 + x1) / 2, yAxis, 0);
  tilt.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(rb, 32), pailM);
  bottom.rotation.y = -Math.PI / 2; bottom.position.set(x0, yAxis, 0);
  tilt.add(bottom);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rm + 0.004, 0.006, 8, 32), B.plastic('#f5c518'));
  lip.rotation.y = Math.PI / 2; lip.position.set(x1, yAxis, 0);
  tilt.add(lip);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.003, 6, 24, Math.PI), M.steel);
  handle.position.set((x0 + x1) / 2 + 0.03, yAxis, 0); handle.rotation.y = Math.PI / 2;
  tilt.add(handle);
  // a starfish sticker
  // arm and a coconut for a counterweight
  tilt.add(rod(V(-0.3, 0, 0), V(x0, yAxis - rb, 0), 0.008, M.paint(color)));
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.85 }));
  nut.scale.set(1, 1.1, 1); nut.position.set(-0.3, 0, 0); tilt.add(nut);
  g.add(pivotNode);
  for (const s of [-1, 1]) {
    const a = V(bk.pivot.x + bk.axis.x * s * 0.06, bk.pivot.y, bk.pivot.z + bk.axis.z * s * 0.06);
    const fx = a.x + bk.axis.x * s * 0.25, fz = a.z + bk.axis.z * s * 0.25;
    g.add(rod(a, V(fx, floorAt(fx, fz), fz), 0.012, M.paint(color)));
  }
  return { object: shadow(g), update() { tilt.rotation.z = -bk.phi; } };
}

// ---------------------------------------------------------------- beach umbrella over the chute
export function buildUmbrella(c, M, B, stripes, floorAt, top) {
  const g = new THREE.Group();
  const y0 = floorAt(c.x, c.z) - 0.1;
  g.add(rod(V(c.x, y0, c.z), V(c.x, top + 0.15, c.z), 0.03, B.white, 12));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.32, 16, 1, true), stripes);
  canopy.position.set(c.x, top + 0.02, c.z);
  g.add(canopy);
  const under = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.32, 16, 1, true), stripes);
  under.position.copy(canopy.position); under.scale.set(0.995, 0.99, 0.995);
  g.add(under);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), B.white); fin.position.set(c.x, top + 0.2, c.z); g.add(fin);
  // scalloped fringe
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + TAU / 32;
    const tri = new THREE.Mesh(new THREE.CircleGeometry(0.06, 3, 0, Math.PI), i % 2 ? B.white : B.red);
    tri.position.set(c.x + Math.cos(a) * 0.93, top - 0.16, c.z + Math.sin(a) * 0.93);
    tri.rotation.set(Math.PI, -a + Math.PI / 2, 0);
    g.add(tri);
  }
  return shadow(g);
}

// ---------------------------------------------------------------- ship's bell on a gallows
function bellGeometry(r, h) {
  const prof = [[0, 1], [0.35, 0.99], [0.52, 0.93], [0.58, 0.8], [0.6, 0.62], [0.66, 0.42], [0.8, 0.22], [0.95, 0.08], [1.0, 0.02], [0.98, 0], [0.9, 0.02], [0.78, 0.18], [0.6, 0.45], [0.5, 0.8], [0.3, 0.93], [0, 0.95]];
  return new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * r, y * h)), 48);
}
export function buildShipBell(sb, M, B, floorAt, facing) {
  const g = new THREE.Group();
  const pivot = new THREE.Group(); pivot.userData.dynamic = true;
  pivot.position.set(sb.hang.x, sb.hang.y, sb.hang.z);
  const mat = M.bronze.clone(); mat.emissive = new THREE.Color(0xffb347); mat.emissiveIntensity = 0;
  const bell = new THREE.Mesh(bellGeometry(sb.r / 0.98, sb.hgt), mat);
  bell.position.y = -sb.hgt;
  pivot.add(bell);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 8, 16), M.bronze); crown.position.y = 0.01; pivot.add(crown);
  // bell rope hanging from the clapper
  pivot.add(rod(V(0, -sb.hgt + 0.02, 0), V(0.02, -sb.hgt - 0.28, 0.01), 0.005, B.rope, 5));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), B.rope); knot.position.set(0.02, -sb.hgt - 0.29, 0.01); pivot.add(knot);
  g.add(pivot);
  // gallows: a driftwood post and a beam out over the bell
  const off = V(facing.z, 0, -facing.x).multiplyScalar(0.34);
  const postX = sb.hang.x + off.x, postZ = sb.hang.z + off.z;
  const top = sb.hang.y + 0.12;
  g.add(rod(V(postX, floorAt(postX, postZ) - 0.1, postZ), V(postX, top + 0.05, postZ), 0.04, B.driftwood, 10));
  g.add(rod(V(postX, top, postZ), V(sb.hang.x - off.x * 0.25, top, sb.hang.z - off.z * 0.25), 0.03, B.driftwood, 10));
  g.add(rod(V(sb.hang.x, top - 0.03, sb.hang.z), V(sb.hang.x, sb.hang.y + 0.02, sb.hang.z), 0.006, M.iron, 6));
  g.add(rod(V(postX, top - 0.35, postZ), V(postX - off.x * 0.45, top, postZ - off.z * 0.45), 0.02, B.driftwood, 8));
  return {
    object: shadow(g),
    update() {
      pivot.rotation.set(0, 0, 0);
      pivot.rotateOnAxis(V(sb.axis.x, sb.axis.y, sb.axis.z), sb.swing * 0.4);
      mat.emissiveIntensity = sb.ring * 0.6;
    },
  };
}

// ---------------------------------------------------------------- the curling wave round the loop
export function buildWave(loop) {
  // the loop's plane: its axis is horizontal, across the direction of travel
  const s0 = loop.start, T = loop.pointAt(0.05);
  const fwd = V(T.x - s0.x, 0, T.z - s0.z).normalize();
  const side = V(-fwd.z, 0, fwd.x);                            // left of travel
  let top = { y: -Infinity };
  for (let i = 0; i < loop.n; i++) if (loop.P[3 * i + 1] > top.y) top = { x: loop.P[3 * i], y: loop.P[3 * i + 1], z: loop.P[3 * i + 2] };
  const rL = (top.y - s0.y) / 2;
  const C = V(top.x, s0.y + rL, top.z);
  const W = 0.66;
  const c = canvas(64, 512), x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 512, 0, 0);
  grd.addColorStop(0, 'rgba(8,70,120,0.95)'); grd.addColorStop(0.45, 'rgba(20,150,180,0.8)'); grd.addColorStop(0.8, 'rgba(90,210,210,0.7)'); grd.addColorStop(0.93, 'rgba(230,250,250,0.95)'); grd.addColorStop(1, 'rgba(255,255,255,1)');
  x.fillStyle = grd; x.fillRect(0, 0, 64, 512);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`; x.fillRect(Math.random() * 64, Math.random() * 60, 2 + Math.random() * 6, 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.08, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  // profile in the loop's plane: up the back of the wave, over the top, and a
  // lip curling down in front; u across the wave, v along the profile
  const prof = [];
  const back = 18, curl = 60;
  for (let i = 0; i <= back; i++) { const t = i / back; prof.push([-(rL + 0.42) + 0.32 * t, -0.17 + 0.17 * Math.pow(t, 0.7)]); }
  for (let i = 1; i <= curl; i++) {
    const a = Math.PI / 2 + (i / curl) * 0.88 * Math.PI, r = rL + 0.1 + 0.04 * (1 - i / curl);
    prof.push([-r * Math.sin(a), -r * Math.cos(a)]);
  }
  const g = new GeoBuilder();
  const N = 14, pts = [], S = [], U = [];
  for (let j = 0; j <= N; j++) {
    const u = -W / 2 + W * j / N;
    const center = C.clone().addScaledVector(side, u + 0.08);
    pts.push(center); S.push(side); U.push(UP);
  }
  // sweep: rows along the width, columns along the profile
  const pos = [], nor = [], uv = [], idx = [];
  const m = prof.length;
  for (let j = 0; j <= N; j++) {
    const edge = Math.min(j, N - j) / N;                       // the wave's ends taper a little
    for (let k = 0; k < m; k++) {
      const [a, b] = prof[k];
      const sc = 1 - 0.12 * (1 - Math.min(1, edge * 4));
      const p = pts[j].clone().addScaledVector(fwd, a * sc).addScaledVector(UP, b * sc);
      pos.push(p.x, p.y, p.z);
      nor.push(0, 1, 0);
      uv.push(j / N, k / (m - 1));
    }
  }
  for (let j = 0; j < N; j++) for (let k = 0; k < m - 1; k++) { const a = j * m + k, b = a + 1, c2 = a + m, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 4;
  mesh.userData.dynamic = true;
  void g;
  return { object: mesh, update(dt, t) { tex.offset.x = Math.sin(t * 0.5) * 0.02; } };
}

// ---------------------------------------------------------------- surfboard ski jump
export function buildJumpBoard(jump, B) {
  const fr = frames(jump, 0.02, 0, jump.L);
  const g = new GeoBuilder();
  const drop = RAIL.drop + 0.018;
  const prof = [];
  const n = fr.P.length;
  const top = [], bot = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const hw = 0.075 * Math.pow(Math.sin(Math.PI * (0.12 + t * 0.86)), 0.5) + 0.02;
    top.push(hw);
  }
  void prof; void bot;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const P = fr.P[i], U = fr.U[i], S = fr.S[i], hw = top[i];
    for (const [s, u] of [[-hw, 0], [-hw, -0.018], [hw, -0.018], [hw, 0]]) {
      pos.push(P.x - U.x * drop + S.x * s + U.x * u, P.y - U.y * drop + S.y * s + U.y * u, P.z - U.z * drop + S.z * s + U.z * u);
      uv.push((s / hw + 1) / 2, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const c = canvas(64, 256), x = c.getContext('2d');
  x.fillStyle = '#ff4f8b'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#ffffff'; x.fillRect(28, 0, 8, 256); x.fillStyle = '#f5d000'; x.fillRect(0, 200, 64, 14);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  void g; void B;
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 0.8, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- tuned bottles (after the water glasses)
export function buildBottles(run, M, B) {
  const g = new THREE.Group();
  const t = run.track, f = {};
  const TINT = { 86: '#3f9a4a', 88: '#2c7a8c', 90: '#7a5230', 91: '#3a64b8', 93: '#6aa84f' };
  const prof = [[0, 0], [0.024, 0.0], [0.026, 0.004], [0.026, 0.07], [0.022, 0.085], [0.011, 0.105], [0.009, 0.13], [0.01, 0.135], [0.008, 0.135], [0.006, 0.13], [0, 0.13]].map(([x, y]) => new THREE.Vector2(x, y));
  const glassGeo = new THREE.LatheGeometry(prof, 24);
  const items = [];
  const liqM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, transparent: true, opacity: 0.75, depthWrite: false });
  const nG = run.bars.length;
  const liquid = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18), liqM, nG);
  liquid.renderOrder = 3; liquid.userData.dynamic = true;
  const strikers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 10, 8), M.brass, nG);
  strikers.userData.dynamic = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = V(1, 1, 1), p3 = V(), col = new THREE.Color();
  run.bars.forEach((bar, i) => {
    t.sample(bar.s, f);
    const side = -1;
    const base = V(f.px + f.sx * side * 0.085, f.py - 0.09, f.pz + f.sz * side * 0.085);
    const gm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(TINT[bar.midi] ?? '#4f8f5a'), roughness: 0.05, transparent: true, opacity: 0.42, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
    const bottle = new THREE.Mesh(glassGeo, gm);
    bottle.position.copy(base); bottle.renderOrder = 4;
    g.add(bottle);
    const level = Math.max(0.2, 0.8 - (bar.midi - 86) * 0.08);
    const lh = 0.07 * level;
    m4.compose(p3.set(base.x, base.y + 0.004 + lh / 2, base.z), q.identity(), s3.set(0.022, lh, 0.022));
    liquid.setMatrixAt(i, m4);
    liquid.setColorAt(i, col.set(TINT[bar.midi] ?? '#4f8f5a').lerp(new THREE.Color(1, 1, 1), 0.35));
    // a shelf from the rails, and a striker on a spring arm leaning over the rail
    const tie = { x: f.px - f.ux * 0.045, y: f.py - f.uy * 0.045, z: f.pz - f.uz * 0.045 };
    g.add(rod(tie, V(base.x, base.y - 0.003, base.z), 0.003, M.brass, 6));
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 20), B.driftwood);
    plate.position.set(base.x, base.y - 0.003, base.z); g.add(plate);
    const pivot = V(base.x, base.y + 0.16, base.z);
    g.add(rod(V(base.x - f.sx * side * 0.02, base.y, base.z - f.sz * side * 0.02), pivot, 0.002, M.brass, 5));
    items.push({ bar, pivot, S: V(f.sx * side, 0, f.sz * side).normalize(), base, lh, level });
  });
  g.add(liquid, strikers);
  shadow(g);
  return {
    object: g,
    update(dt, tt) {
      items.forEach((it, i) => {
        const k = it.bar.amp;
        // the striker swings from over the rail to the bottle's shoulder
        const lean = 0.05 - 0.05 * k * k;
        m4.makeTranslation(it.pivot.x - it.S.x * lean, it.base.y + 0.105, it.pivot.z - it.S.z * lean);
        strikers.setMatrixAt(i, m4);
        const wob = 1 + k * 0.1 * Math.sin(tt * 90 + i);
        m4.compose(p3.set(it.base.x, it.base.y + 0.004 + it.lh * wob / 2, it.base.z), q.identity(), s3.set(0.022, it.lh * wob, 0.022));
        liquid.setMatrixAt(i, m4);
      });
      strikers.instanceMatrix.needsUpdate = true;
      liquid.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- the keep's chimes
export function buildChimes(run, M, keep) {
  const g = new THREE.Group();
  const t = run.track, f = {};
  const tubeM = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.18 });
  const items = [];
  for (const bar of run.bars) {
    t.sample(bar.s, f);
    // hung from a bracket on the keep, over the flume's inner rim
    const dx = f.px - keep.x, dz = f.pz - keep.z, d = Math.hypot(dx, dz);
    const rx = dx / d, rz = dz / d;
    const at = V(keep.x + rx * (d - 0.13), f.py + 0.19, keep.z + rz * (d - 0.13));
    const len = Math.min(0.26, 0.1 + 0.9 / Math.sqrt(midiToHz(bar.midi)) * 3.2);
    const pivot = new THREE.Group(); pivot.userData.dynamic = true;
    pivot.position.copy(at);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 12), tubeM.clone());
    tube.material.emissive = new THREE.Color(0xfff0c0); tube.material.emissiveIntensity = 0;
    tube.position.y = -0.03 - len / 2;
    pivot.add(tube, rod(V(0, 0, 0), V(0, -0.03, 0), 0.0015, M.iron, 4));
    g.add(pivot);
    g.add(rod(V(keep.x + rx * keep.r, at.y + 0.01, keep.z + rz * keep.r), V(at.x, at.y + 0.01, at.z), 0.004, M.brass, 6));
    items.push({ bar, pivot, tube, axis: V(-rz, 0, rx) });
  }
  return {
    object: shadow(g),
    update() {
      for (const it of items) {
        const k = it.bar.amp;
        it.pivot.quaternion.setFromAxisAngle(it.axis, k * 0.35);
        it.tube.material.emissiveIntensity = k * 0.5;
      }
    },
  };
}
