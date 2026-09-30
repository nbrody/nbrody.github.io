// The sandcastle on its plinth: a tall round keep with a helter-skelter
// water slide wound round it, a turret the slide runs straight through on
// every turn, a curtain wall with four bucket-moulded towers (one of them
// tunnelled through where the slide dives under the wall into the moat), a
// gate and a drawbridge, pennants, and seashells pressed into the sand.
import * as THREE from 'three';
import { CASTLE } from '../sim/layout.js';
import { Carver } from './shaderBits.js';
import { sandMaterial } from './sand.js';
import { rod } from './devices.js';

const TAU = Math.PI * 2, deg = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const polar = (C, r, thDeg, y) => V(C.cx + r * Math.cos(thDeg * deg), y, C.cz - r * Math.sin(thDeg * deg));
function rng(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) >>> 0) / 4294967296); }

// a bucket-moulded tower: stacked slightly tapering drums, each with a lip
function moulded(r0, r1, y0, y1, layer = 0.3) {
  const pts = [];
  const n = Math.max(1, Math.round((y1 - y0) / layer));
  const h = (y1 - y0) / n;
  for (let k = 0; k < n; k++) {
    const ya = y0 + k * h, yb = ya + h;
    const ra = r0 + (r1 - r0) * (k / n), rb = r0 + (r1 - r0) * ((k + 1) / n);
    pts.push(V(ra + 0.012, ya), V(ra + 0.004, ya + 0.012), V(rb - 0.004, yb - 0.02), V(rb + 0.01, yb - 0.006), V(rb + 0.012, yb));
  }
  return pts.map((p) => new THREE.Vector2(p.x, p.y));
}

export function buildCastle(machine, M, opts = {}) {
  const C = CASTLE;
  const g = new THREE.Group();
  g.name = 'sandcastle';
  const carver = new Carver();
  const sand = sandMaterial({ packed: 1, ripples: 0, carver });
  sand.color.setRGB(1.0, 0.97, 0.93);
  sand.side = THREE.DoubleSide;
  const inside = sandMaterial({ packed: 1, ripples: 0, carver });
  inside.color.setRGB(0.62, 0.55, 0.47);
  inside.side = THREE.BackSide;
  const f = {};
  const d = machine.devices.castle;
  const updates = [];

  // ---------------------------------------------------------- carve where the flumes pass through
  const pierce = (t, cx, cz, rad, bodyR) => {
    // runs of the track inside the circle (cx, cz, rad): carve each one
    let inRun = null;
    for (let s = 0; s <= t.L; s += 0.01) {
      t.sample(s, f);
      const inside_ = Math.hypot(f.px - cx, f.pz - cz) < rad + 0.02;
      if (inside_ && !inRun) inRun = s;
      if ((!inside_ || s + 0.01 > t.L) && inRun !== null) {
        const a = t.pointAt(Math.max(0, inRun - 0.06)), b = t.pointAt(Math.min(t.L, s + 0.06));
        const lift = t.flume ? t.flume.rho : 0;
        carver.add({ x: a.x, y: a.y + lift, z: a.z }, { x: b.x, y: b.y + lift, z: b.z }, bodyR);
        inRun = null;
      }
    }
  };
  const turret = polar(C, 0.72, C.turretAt, 0);
  const rc = d.helix.flume.Rc;
  pierce(d.helix, turret.x, turret.z, C.turretR, rc + 0.03);
  for (const th of C.towers) { const p = polar(C, C.wallR, th, 0); pierce(d.gate, p.x, p.z, C.towerR, rc + 0.035); }
  // where the culvert passes under the curtain wall
  {
    const t = d.gate;
    let s0 = null;
    for (let s = 0; s <= t.L; s += 0.01) {
      t.sample(s, f);
      const r = Math.hypot(f.px - C.cx, f.pz - C.cz);
      if (Math.abs(r - C.wallR) < 0.1) { if (s0 === null) s0 = s; }
      else if (s0 !== null) { const a = t.pointAt(s0 - 0.03), b = t.pointAt(s + 0.03); carver.add({ x: a.x, y: a.y + t.flume.rho, z: a.z }, { x: b.x, y: b.y + t.flume.rho, z: b.z }, rc + 0.035); s0 = null; }
    }
  }

  // ---------------------------------------------------------- the keep
  const keepProf = moulded(C.keepR, C.keepR - 0.05, C.base - 0.02, C.keepTop - 0.08, 0.36);
  const keep = new THREE.Mesh(new THREE.LatheGeometry(keepProf, 72), sand);
  keep.position.set(C.cx, 0, C.cz);
  g.add(keep);
  const roof = new THREE.Mesh(new THREE.CircleGeometry(C.keepR - 0.04, 48), sand);
  roof.rotation.x = -Math.PI / 2; roof.position.set(C.cx, C.keepTop - 0.08, C.cz);
  g.add(roof);
  // crenellations
  const merlonGeo = new THREE.BoxGeometry(1, 1, 1);
  const merlons = [];
  const ring = (cx, cz, r, y, n, w, h, dep) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      merlons.push({ p: V(cx + Math.cos(a) * r, y + h / 2, cz - Math.sin(a) * r), a, s: V(dep, h, w) });
    }
  };
  ring(C.cx, C.cz, C.keepR - 0.075, C.keepTop - 0.08, 14, 0.1, 0.1, 0.07);
  // windows: dark arched openings pressed into the keep and the towers
  const winM = new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 1 });
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.028, 0); archShape.lineTo(-0.028, 0.06); archShape.absarc(0, 0.06, 0.028, Math.PI, 0, true); archShape.lineTo(0.028, 0); archShape.lineTo(-0.028, 0);
  const archGeo = new THREE.ShapeGeometry(archShape, 8);
  const addWindow = (cx, cz, r, th, y, s = 1) => {
    const w = new THREE.Mesh(archGeo, winM);
    const a = th * deg;
    w.position.set(cx + Math.cos(a) * (r + 0.004), y, cz - Math.sin(a) * (r + 0.004));
    w.rotation.y = a + Math.PI / 2;
    w.scale.setScalar(s);
    g.add(w);
  };
  for (const [th, y] of [[300, 4.1], [330, 3.4], [20, 3.8], [200, 3.0], [240, 4.2], [150, 3.6], [100, 2.6], [320, 2.4], [60, 2.9]]) addWindow(C.cx, C.cz, C.keepR - 0.02 - (y - C.base) * 0.05 / (C.keepTop - C.base), th, y, 1.4);

  // ---------------------------------------------------------- the turret the slide runs through
  const tur = new THREE.Mesh(new THREE.LatheGeometry(moulded(C.turretR, C.turretR - 0.03, C.base - 0.02, C.turretTop - 0.25, 0.3), 36), sand);
  tur.position.set(turret.x, 0, turret.z);
  g.add(tur);
  const turIn = new THREE.Mesh(new THREE.CylinderGeometry(C.turretR - 0.03, C.turretR - 0.02, C.turretTop - 0.25 - C.base, 28, 1, true), inside);
  turIn.position.set(turret.x, (C.base + C.turretTop - 0.25) / 2, turret.z);
  g.add(turIn);
  // a drip-castle spire on top
  const spirePts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; spirePts.push(new THREE.Vector2((C.turretR - 0.02) * (1 - t) * (1 + 0.12 * Math.sin(t * 22)), C.turretTop - 0.25 + t * 0.34)); }
  const spire = new THREE.Mesh(new THREE.LatheGeometry(spirePts, 24), sand);
  spire.position.set(turret.x, 0, turret.z);
  g.add(spire);

  // ---------------------------------------------------------- curtain wall and towers
  const wallT = 0.12, wr0 = C.wallR - wallT / 2, wr1 = C.wallR + wallT / 2;
  {
    const n = 160, pos = [], idx = [];
    const yb = C.base - 0.03, yt = C.wallTop;
    const add = (ra, rb, ya, yb2) => {
      const b = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        pos.push(C.cx + Math.cos(a) * ra, ya, C.cz - Math.sin(a) * ra, C.cx + Math.cos(a) * rb, yb2, C.cz - Math.sin(a) * rb);
      }
      for (let i = 0; i < n; i++) { const a = b + 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    add(wr1, wr1 - 0.01, yb, yt);            // outer face (slight batter)
    add(wr0, wr0 + 0.01, yt, yb);            // inner face
    add(wr1 - 0.01, wr0 + 0.01, yt, yt);     // wall walk
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    const wall = new THREE.Mesh(wg, sand);
    g.add(wall);
    ring(C.cx, C.cz, wr1 - 0.025, C.wallTop, 44, 0.07, 0.07, 0.05);
  }
  const R0 = rng(7);
  const flagCols = ['#e8332c', '#2a6fd6', '#f5c518', '#21a35b', '#ff4f8b'];
  const flags = [];
  const addFlag = (x, y, z, col, size = 1) => {
    const pole = rod(V(x, y, z), V(x, y + 0.32 * size, z), 0.004, M.driftwood ?? M.iron, 5);
    g.add(pole);
    const pivot = new THREE.Group(); pivot.userData.dynamic = true;
    pivot.position.set(x, y + 0.3 * size, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.09 * size, 0, 0.16 * size, -0.045 * size, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 }));
    pivot.add(flag);
    g.add(pivot);
    flags.push({ pivot, flag, ph: R0() * 10 });
  };
  for (const [i, th] of C.towers.entries()) {
    const p = polar(C, C.wallR, th, 0);
    const tw = new THREE.Mesh(new THREE.LatheGeometry(moulded(C.towerR, C.towerR - 0.03, C.base - 0.03, C.towerTop - 0.07, 0.34), 40), sand);
    tw.position.set(p.x, 0, p.z);
    g.add(tw);
    const inTw = new THREE.Mesh(new THREE.CylinderGeometry(C.towerR - 0.035, C.towerR - 0.035, C.towerTop - C.base - 0.1, 24, 1, true), inside);
    inTw.position.set(p.x, (C.base + C.towerTop - 0.07) / 2, p.z);
    g.add(inTw);
    const top = new THREE.Mesh(new THREE.CircleGeometry(C.towerR - 0.02, 32), sand);
    top.rotation.x = -Math.PI / 2; top.position.set(p.x, C.towerTop - 0.07, p.z);
    g.add(top);
    ring(p.x, p.z, C.towerR - 0.05, C.towerTop - 0.07, 9, 0.07, 0.08, 0.05);
    addFlag(p.x, C.towerTop - 0.07, p.z, flagCols[i % flagCols.length]);
    addWindow(p.x, p.z, C.towerR - 0.03, th, C.towerTop - 0.42);
  }
  addFlag(C.cx, C.keepTop - 0.08, C.cz, '#e8332c', 1.8);
  addFlag(turret.x, C.turretTop + 0.08, turret.z, '#f5c518', 1.2);
  // the gate: an arch in the wall facing the palm, and a drawbridge over the moat
  {
    const gateTh = 350;
    const p = polar(C, wr1 + 0.004, gateTh, C.base);
    const arch = new THREE.Mesh(archGeo, winM);
    arch.position.copy(p); arch.rotation.y = gateTh * deg + Math.PI / 2; arch.scale.set(2.6, 3.4, 1);
    g.add(arch);
    const bridge = new THREE.Group();
    const a = gateTh * deg;
    const mid = polar(C, (C.wallR + C.moatR + 0.12) / 2 + 0.05, gateTh, C.base + 0.005);
    bridge.position.copy(mid);
    bridge.rotation.y = a;
    const planks = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.2), M.plank ?? M.maple);
    bridge.add(planks);
    for (const s of [-1, 1]) {
      const chain = rod(V(-0.3, 0.01, s * 0.09), V(-0.3 - 0.02, 0.26, s * 0.09), 0.003, M.iron, 4);
      bridge.add(chain);
    }
    g.add(bridge);
  }

  // ---------------------------------------------------------- merlons (instanced)
  const mer = new THREE.InstancedMesh(merlonGeo, sand, merlons.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  merlons.forEach((m, i) => { q.setFromAxisAngle(V(0, 1, 0), m.a); m4.compose(m.p, q, m.s); mer.setMatrixAt(i, m4); });
  g.add(mer);

  // ---------------------------------------------------------- seashells pressed into the walls
  {
    const shellG = new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2);
    const shellM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
    const n = 120, shells = new THREE.InstancedMesh(shellG, shellM, n);
    const col = new THREE.Color(), s3 = V(), up = V(0, 1, 0);
    let k = 0;
    const put = (p, nrm, sz) => {
      if (k >= n || carver.inside(p, 0.03)) return;
      q.setFromUnitVectors(up, nrm);
      m4.compose(p, q, s3.set(sz, sz * 0.45, sz * 1.15));
      shells.setMatrixAt(k, m4);
      shells.setColorAt(k, col.setHSL(0.03 + R0() * 0.08, 0.35 + R0() * 0.4, 0.75 + R0() * 0.18));
      k++;
    };
    for (let i = 0; i < 70; i++) {
      const th = R0() * 360, y = C.base + 0.15 + R0() * (C.keepTop - C.base - 0.4);
      const r = C.keepR - (y - C.base) * 0.05 / (C.keepTop - C.base) + 0.004;
      put(polar(C, r, th, y), V(Math.cos(th * deg), 0, -Math.sin(th * deg)), 0.016 + R0() * 0.01);
    }
    for (let i = 0; i < 50; i++) {
      const th = R0() * 360, y = C.base + 0.08 + R0() * (C.wallTop - C.base - 0.15);
      put(polar(C, wr1 + 0.002, th, y), V(Math.cos(th * deg), 0, -Math.sin(th * deg)), 0.014 + R0() * 0.008);
    }
    shells.count = k;
    g.add(shells);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  updates.push((dt, t) => {
    for (const fl of flags) {
      fl.pivot.rotation.y = 0.6 + Math.sin(t * 0.4 + fl.ph) * 0.35;
      fl.flag.rotation.x = Math.sin(t * 6 + fl.ph) * 0.2;
    }
  });
  return {
    object: g,
    carver,
    // keep-outs for support masts
    keepOut(keep) {
      keep.cyl(C.cx, C.cz, C.keepR + 0.03, 0, 9);
      keep.cyl(turret.x, turret.z, C.turretR + 0.03, 0, 9);
      keep.cyl(C.cx, C.cz, C.moatR + 0.16, 0, C.wallTop + 0.4);
      for (const th of C.towers) { const p = polar(C, C.wallR, th, 0); keep.cyl(p.x, p.z, C.towerR + 0.04, 0, C.towerTop + 0.3); }
    },
    update(dt, t) { for (const u of updates) u(dt, t); },
  };
}
