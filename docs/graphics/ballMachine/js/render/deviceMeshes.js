// Meshes for the mechanisms; each builder returns {object, update(dt)} and
// reads the simulation state every frame.
import * as THREE from 'three';
import { BALL, RAIL } from '../sim/constants.js';
import { midiToHz } from '../sim/music.js';
import { LIFT, PEDESTAL } from '../sim/layout.js';

const R = BALL.R;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const up = V(0, 1, 0);

function rod(a, b, r, mat, seg = 8) {
  const d = V(b.x - a.x, b.y - a.y, b.z - a.z);
  const L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(up, d.normalize());
  m.castShadow = true;
  return m;
}
function shadow(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }

// Keep-out volumes for support-post placement
export class KeepOut {
  constructor() { this.list = []; }
  cyl(x, z, r, y0, y1) { this.list.push({ hit: (px, pz, a, b) => Math.hypot(px - x, pz - z) < r && b > y0 && a < y1 }); }
  box(x0, x1, z0, z1, y0, y1) { this.list.push({ hit: (px, pz, a, b) => px > x0 && px < x1 && pz > z0 && pz < z1 && b > y0 && a < y1 }); }
  [Symbol.iterator]() { return this.list[Symbol.iterator](); }
}

// ---------------------------------------------------------------------------
export function buildPedestal(M) {
  const g = new THREE.Group();
  const prof = [
    [0, 0.25], [PEDESTAL.r + 0.1, 0.25], [PEDESTAL.r + 0.1, 0.31], [PEDESTAL.r + 0.02, 0.33], [PEDESTAL.r - 0.03, 0.36],
    [PEDESTAL.r - 0.05, 0.8], [PEDESTAL.r, 0.83], [PEDESTAL.r + 0.04, 0.9], [PEDESTAL.r + 0.04, PEDESTAL.top], [0, PEDESTAL.top],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), M.pedestal);
  g.add(body);
  // brass bands
  for (const y of [0.33, 0.83, PEDESTAL.top - 0.01]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(PEDESTAL.r + (y > 0.8 ? 0.03 : 0.01), 0.012, 8, 96), M.brass);
    band.rotation.x = Math.PI / 2; band.position.y = y;
    g.add(band);
  }
  // decorative panels: brass roundels
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24), M.brass);
    disc.position.set(Math.cos(a) * (PEDESTAL.r - 0.045), 0.58, Math.sin(a) * (PEDESTAL.r - 0.045));
    disc.rotation.z = Math.PI / 2; disc.rotation.y = -a;
    g.add(disc);
  }
  return shadow(g);
}

// ---------------------------------------------------------------------------
export function buildLift(lift, M, topColor) {
  const g = new THREE.Group();
  const paint = M.paint(topColor);
  const x0 = -0.2, x1 = 0.33, z0 = -0.2, z1 = 0.2, yb = PEDESTAL.top, yt = lift.yT + 0.28;
  // corner posts
  for (const x of [x0, x1]) for (const z of [z0, z1]) g.add(rod(V(x, yb, z), V(x, yt, z), 0.018, paint));
  // square rings and zig-zag braces
  for (let y = yb + 0.3; y < yt; y += 0.6) {
    const c = [V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1)];
    for (let i = 0; i < 4; i++) g.add(rod(c[i], c[(i + 1) % 4], 0.009, paint, 6));
  }
  for (let y = yb + 0.3; y + 0.6 < yt; y += 0.6) {
    // braces on the west face and the north/south faces (east face stays open for the ball exit)
    g.add(rod(V(x0, y, z0), V(x0, y + 0.6, z1), 0.006, M.brass, 5));
    g.add(rod(V(x0, y, z0), V(x1, y + 0.6, z0), 0.006, M.brass, 5));
    g.add(rod(V(x0, y, z1), V(x1, y + 0.6, z1), 0.006, M.brass, 5));
  }
  // guide rods around the rising ball
  for (const [dx, dz] of [[0.035, 0.028], [0.035, -0.028], [-0.02, 0.036], [-0.02, -0.036]]) {
    g.add(rod(V(lift.lineX + dx, lift.loadY + 0.08, lift.lineZ + dz), V(lift.lineX + dx, lift.releaseY - 0.02, lift.lineZ + dz), 0.0035, M.steel, 5));
  }
  // sprockets
  const sprocket = () => {
    const s = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(lift.rs - 0.006, lift.rs - 0.006, 0.02, 32), M.steelDark);
    disc.rotation.x = Math.PI / 2;
    s.add(disc);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.016), M.steelDark);
      tooth.position.set(Math.cos(a) * lift.rs, Math.sin(a) * lift.rs, 0);
      tooth.rotation.z = a;
      s.add(tooth);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.024, 12), M.brass);
      hole.rotation.x = Math.PI / 2; hole.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0);
      s.add(hole);
    }
    return s;
  };
  const spTop = sprocket(); spTop.userData.dynamic = true; spTop.position.set(lift.cx, lift.yT, lift.cz); g.add(spTop);
  const spBot = sprocket(); spBot.userData.dynamic = true; spBot.position.set(lift.cx, lift.yB, lift.cz); g.add(spBot);
  g.add(rod(V(lift.cx, lift.yT, z0), V(lift.cx, lift.yT, z1), 0.012, M.steel));
  g.add(rod(V(lift.cx, lift.yB, z0), V(lift.cx, lift.yB, z1), 0.012, M.steel));
  // chain links (instanced) and shelves
  const pitch = 0.028;
  const nLinks = Math.floor(lift.Lc / pitch);
  const links = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.024, 0.02), M.chain, nLinks);
  g.add(links);
  const shelfGeo = new THREE.CylinderGeometry(0.036, 0.03, 0.02, 16, 1, true);
  const shelves = new THREE.InstancedMesh(shelfGeo, M.brass, lift.n);
  const armGeo = new THREE.BoxGeometry(0.07, 0.008, 0.02);
  const arms = new THREE.InstancedMesh(armGeo, M.steelDark, lift.n);
  g.add(shelves, arms);
  // motor house with a flywheel
  const motor = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.28), M.paint('#262b2f'));
  box.position.set(-0.05, PEDESTAL.top + 0.1, 0);
  motor.add(box);
  const fly = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 10, 32), M.brass);
  fly.userData.dynamic = true;
  fly.position.set(-0.05, PEDESTAL.top + 0.2, 0.18);
  motor.add(fly);
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.01), M.brass);
    sp.rotation.z = (i * Math.PI) / 4; fly.add(sp);
  }
  g.add(motor);
  // crown ornament
  const crown = new THREE.Group();
  crown.position.set(0.06, yt, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 4, 1), paint);
  cap.rotation.y = Math.PI / 4; cap.position.y = 0.11;
  crown.add(cap);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), M.gold);
  ball.position.y = 0.3; crown.add(ball);
  const mast = rod(V(0, 0.3, 0), V(0, 0.75, 0), 0.008, M.gold); crown.add(mast);
  const whirl = new THREE.Group(); whirl.userData.dynamic = true; whirl.position.y = 0.62; crown.add(whirl);
  const cols = ['#d1263b', '#e3b505', '#2b62c9', '#1f9a6a', '#e2711d', '#7b4bb3'];
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.06), M.paint(cols[i]));
    blade.position.set(Math.cos(i * Math.PI / 3) * 0.11, 0, Math.sin(i * Math.PI / 3) * 0.11);
    blade.rotation.y = -i * Math.PI / 3; blade.rotation.x = 0.5;
    whirl.add(blade);
  }
  const vane = new THREE.Group(); vane.userData.dynamic = true; vane.position.y = 0.78; crown.add(vane);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), M.gold);
  sun.position.set(0.1, 0, 0); vane.add(sun);
  const sunB = sun.clone(); sunB.rotation.y = Math.PI; vane.add(sunB);
  for (let i = 0; i < 12; i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 4), M.gold);
    const a = (i / 12) * Math.PI * 2;
    ray.position.set(0.1 + Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0);
    ray.rotation.z = a - Math.PI / 2;
    vane.add(ray);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.004), M.gold); tail.position.x = -0.12; vane.add(tail);
  g.add(crown);

  const m4 = new THREE.Matrix4(), bx = V(0, 0, 0), by = V(0, 0, 0), bz = V(0, 0, 0), f = {};
  let spin = 0;
  function update(dt, t) {
    for (let i = 0; i < nLinks; i++) {
      lift.chainFrame(lift.phase + i * pitch, f);
      bx.set(f.nx, f.ny, f.nz); by.set(f.tx, f.ty, f.tz); bz.crossVectors(bx, by);
      m4.makeBasis(bx, by, bz);
      if (i & 1) m4.scale(V(1, 1, 0.75));
      m4.setPosition(f.px, f.py, f.pz);
      links.setMatrixAt(i, m4);
    }
    links.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < lift.n; i++) {
      lift.chainFrame(lift.shelfU(i), f);
      bx.set(f.nx, f.ny, f.nz); by.set(f.tx, f.ty, f.tz); bz.crossVectors(bx, by);
      m4.makeBasis(bx, by, bz);
      const o = lift.out;
      m4.setPosition(f.px + f.nx * o - f.tx * 0.004, f.py + f.ny * o - f.ty * 0.004, f.pz + f.nz * o - f.tz * 0.004);
      shelves.setMatrixAt(i, m4);
      m4.makeBasis(bx, by, bz);
      m4.setPosition(f.px + f.nx * o * 0.5 - f.tx * 0.012, f.py + f.ny * o * 0.5 - f.ty * 0.012, f.pz + f.nz * o * 0.5 - f.tz * 0.012);
      arms.setMatrixAt(i, m4);
    }
    shelves.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    const ang = -lift.phase / lift.rs;
    spTop.rotation.z = ang; spBot.rotation.z = ang;
    fly.rotation.z = ang * 0.35;
    spin += dt * (1.2 + Math.sin(t * 0.13) * 0.8);
    whirl.rotation.y = spin * 3;
    vane.rotation.y = Math.sin(t * 0.07) * 1.2 + Math.sin(t * 0.31) * 0.2;
  }
  return { object: shadow(g), update };
}

// ---------------------------------------------------------------------------
export function buildFlipFlops(flipflops, M) {
  const g = new THREE.Group();
  const items = [];
  for (const ff of Object.values(flipflops)) {
    const f = ff.frame;
    const node = new THREE.Group();
    node.position.set(f.px - f.ux * 0.004, f.py - f.uy * 0.004, f.pz - f.uz * 0.004);
    const bx = V(f.sx, f.sy, f.sz), by = V(f.ux, f.uy, f.uz), bz = V(f.tx, f.ty, f.tz);
    node.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
    // base plate under the junction
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.2), M.brass);
    plate.position.set(0, -RAIL.drop - 0.012, 0.06);
    node.add(plate);
    // the paddle: a hardwood wedge pivoting about U at the junction
    const pivot = new THREE.Group(); pivot.userData.dynamic = true;
    pivot.position.set(0, -0.004, 0.08);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.13), M.maple);
    paddle.position.set(0, 0.0, 0.05);
    pivot.add(paddle);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.08, 10), M.brass);
    pin.position.y = 0.0; pivot.add(pin);
    node.add(pivot);
    g.add(node);
    items.push({ ff, pivot });
  }
  return { object: shadow(g), update() { for (const it of items) it.pivot.rotation.y = -it.ff.angle * 0.6; } };
}

// ---------------------------------------------------------------------------
// Funnel skin: the ball-centre surface offset by R along its normal.
export function buildFunnel(fn, M, mat, legs = 3, floorAt, keepOut) {
  const g = new THREE.Group();
  const pts = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const r = fn.rHole + (fn.rOut + 0.001 - fn.rHole) * Math.pow(i / n, 1.6);
    const sl = fn.dhy(r), inv = 1 / Math.sqrt(1 + sl * sl);
    pts.push(new THREE.Vector2(r + R * sl * inv, fn.hy(r) - R * inv));
  }
  const skinR = pts[pts.length - 1].x;
  const skin = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), mat);
  skin.position.set(fn.cx, 0, fn.cz);
  g.add(skin);
  // rim wall (above the lip, if the funnel has one)
  const rimTop = fn.hy(fn.rOut) + 0.02;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(fn.rOut + R + 0.004, fn.rOut + R + 0.004, rimTop - pts[n].y + 0.01, 72, 1, true), mat);
  wall.position.set(fn.cx, (rimTop + pts[n].y) / 2 - 0.005, fn.cz);
  g.add(wall);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(fn.rOut + R + 0.006, 0.008, 8, 72), M.brass);
  lip.rotation.x = Math.PI / 2; lip.position.set(fn.cx, rimTop, fn.cz);
  g.add(lip);
  // outlet tube
  const holeY = pts[0].y;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(fn.rHole + R * 0.2, fn.rHole + R * 0.2, 0.09, 24, 1, true), M.brass);
  tube.position.set(fn.cx, holeY - 0.04, fn.cz);
  g.add(tube);
  // legs
  const legCol = M.steelDark;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + (fn.legPhase ?? 0);
    const top = V(fn.cx + Math.cos(a) * (skinR + 0.02), fn.yRim - 0.02, fn.cz + Math.sin(a) * (skinR + 0.02));
    const fx = fn.cx + Math.cos(a) * (skinR + 0.12), fz = fn.cz + Math.sin(a) * (skinR + 0.12);
    const bot = V(fx, floorAt(fx, fz), fz);
    g.add(rod(top, bot, 0.011, legCol));
  }
  keepOut?.cyl(fn.cx, fn.cz, skinR + 0.05, holeY - 0.12, rimTop + 0.02);
  return shadow(g);
}

// ---------------------------------------------------------------------------
export function buildWheel(wh, M, color, floorAt) {
  const g = new THREE.Group();
  const rot = new THREE.Group(); rot.userData.dynamic = true;
  const holder = new THREE.Group();
  holder.position.set(wh.cx, wh.cy, wh.cz);
  // wheel frame basis: x = e1, y = up, z = a3
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(wh.e1.x, 0, wh.e1.z), up, V(wh.a3.x, 0, wh.a3.z)));
  holder.add(rot);
  const paint = M.paint(color);
  const w = R + 0.012;
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wh.Rw + R * 0.4, 0.009, 8, 64), paint);
    rim.position.z = s * w; rot.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(wh.Rw - R * 1.1, 0.006, 6, 48), M.brass);
    inner.position.z = s * w; rot.add(inner);
    for (let i = 0; i < wh.n; i++) {
      const a = (i / wh.n) * Math.PI * 2 + Math.PI / wh.n;
      const sp = rod(V(0, 0, s * w), V(Math.cos(a) * (wh.Rw + R * 0.4), Math.sin(a) * (wh.Rw + R * 0.4), s * w), 0.006, paint, 6);
      rot.add(sp);
    }
  }
  // pocket plates between the rims, behind each ball seat
  for (let i = 0; i < wh.n; i++) {
    const a = (i / wh.n) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.008, R * 2.2, 2 * w), M.brass);
    const pa = a - (R * 1.15) / wh.Rw;
    plate.position.set(Math.cos(pa) * wh.Rw, Math.sin(pa) * wh.Rw, 0);
    plate.rotation.z = pa;
    rot.add(plate);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(R * 1.6, 0.006, 2 * w), M.brass);
    floor.position.set(Math.cos(a) * (wh.Rw - R * 1.05), Math.sin(a) * (wh.Rw - R * 1.05), 0);
    floor.rotation.z = a + Math.PI / 2;
    rot.add(floor);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2 * w + 0.03, 20), M.brass);
  hub.rotation.x = Math.PI / 2; rot.add(hub);
  g.add(holder);
  // A-frame stand on both sides
  for (const s of [-1, 1]) {
    const ax = V(wh.cx + wh.a3.x * s * (w + 0.05), wh.cy, wh.cz + wh.a3.z * s * (w + 0.05));
    for (const d of [-1, 1]) {
      const fx = ax.x + wh.e1.x * d * 0.35, fz = ax.z + wh.e1.z * d * 0.35;
      g.add(rod(ax, V(fx, floorAt(fx, fz), fz), 0.014, paint));
    }
  }
  g.add(rod(V(wh.cx - wh.a3.x * (w + 0.06), wh.cy, wh.cz - wh.a3.z * (w + 0.06)), V(wh.cx + wh.a3.x * (w + 0.06), wh.cy, wh.cz + wh.a3.z * (w + 0.06)), 0.012, M.steel));
  return { object: shadow(g), update() { rot.rotation.z = wh.theta; } };
}

// ---------------------------------------------------------------------------
export function buildBucket(bk, M, color, floorAt) {
  const g = new THREE.Group();
  const paint = M.paint(color);
  const pivotNode = new THREE.Group();
  pivotNode.position.set(bk.pivot.x, bk.pivot.y, bk.pivot.z);
  // local frame: x = dir, y = up, z = axis
  const frame = new THREE.Group();
  frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(bk.dir.x, 0, bk.dir.z), up, V(bk.axis.x, 0, bk.axis.z)));
  pivotNode.add(frame);
  const tilt = new THREE.Group(); tilt.userData.dynamic = true;
  frame.add(tilt);
  // trough: bottom + two sides + gate
  const L = bk.Lb + 0.06, x0 = 0.12;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(L - x0, 0.006, 0.075), M.copper);
  bottom.position.set((L + x0) / 2, bk.yOff - R - 0.004, 0);
  tilt.add(bottom);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(L - x0, 0.05, 0.005), M.copper);
    side.position.set((L + x0) / 2, bk.yOff - R + 0.02, s * 0.04);
    tilt.add(side);
  }
  const gate = new THREE.Group();
  gate.position.set(L, bk.yOff - R + 0.045, 0);
  const gatePlate = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.055, 0.075), M.brass);
  gatePlate.position.y = -0.026; gate.add(gatePlate);
  tilt.add(gate);
  // arm + counterweight
  tilt.add(rod(V(-0.3, 0, 0), V(L, bk.yOff - R - 0.01, 0), 0.008, paint));
  const cw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), M.brass);
  cw.position.set(-0.3, 0, 0); tilt.add(cw);
  g.add(pivotNode);
  // stand
  for (const s of [-1, 1]) {
    const a = V(bk.pivot.x + bk.axis.x * s * 0.06, bk.pivot.y, bk.pivot.z + bk.axis.z * s * 0.06);
    const fx = a.x + bk.axis.x * s * 0.25, fz = a.z + bk.axis.z * s * 0.25;
    g.add(rod(a, V(fx, floorAt(fx, fz), fz), 0.012, paint));
  }
  return {
    object: shadow(g),
    update() {
      tilt.rotation.z = -bk.phi;
      gate.rotation.z = bk.phi > bk.dumpAngle * 0.8 ? 1.2 : 0;
    },
  };
}

// ---------------------------------------------------------------------------
function bellGeometry(r, h) {
  const pts = [];
  const prof = [[0, 1], [0.35, 0.99], [0.52, 0.93], [0.58, 0.8], [0.6, 0.62], [0.66, 0.42], [0.8, 0.22], [0.95, 0.08], [1.0, 0.02], [0.98, 0], [0.9, 0.02], [0.78, 0.18], [0.6, 0.45], [0.5, 0.8], [0.3, 0.93], [0, 0.95]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x * r, y * h));
  return new THREE.LatheGeometry(pts, 40);
}

export function buildBells(bells, M, mastColor, ladder) {
  const g = new THREE.Group();
  const items = [];
  const geoCache = new Map();
  for (const b of bells) {
    const key = `${b.r}-${b.hgt}`;
    if (!geoCache.has(key)) geoCache.set(key, bellGeometry(b.r, b.hgt));
    const pivot = new THREE.Group(); pivot.userData.dynamic = true;
    pivot.position.set(b.hang.x, b.hang.y, b.hang.z);
    const bell = new THREE.Mesh(geoCache.get(key), M.bronze.clone());
    bell.material.emissive = new THREE.Color(0xffb347);
    bell.material.emissiveIntensity = 0;
    bell.position.y = -0.03 - b.hgt;
    pivot.add(bell);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), M.iron);
    yoke.position.y = -0.03; pivot.add(yoke);
    g.add(pivot);
    items.push({ b, pivot, bell });
  }
  // masts carrying the ramps and bells
  if (ladder) {
    const paint = M.paint(mastColor);
    for (const z of ladder.mastZ) {
      g.add(rod(V(ladder.x + 0.1, ladder.y0, z), V(ladder.x + 0.1, ladder.y1, z), 0.02, paint));
    }
    for (const arm of ladder.arms) g.add(rod(arm[0], arm[1], 0.006, paint, 6));
  }
  return {
    object: shadow(g),
    update() {
      for (const it of items) {
        it.pivot.rotation.x = it.b.swing * 0.35;
        it.bell.material.emissiveIntensity = it.b.ring * 0.9;
      }
    },
  };
}

// ---------------------------------------------------------------------------
export function buildDrum(d, M, floorAt) {
  const g = new THREE.Group();
  const node = new THREE.Group();
  node.position.set(d.center.x, d.center.y, d.center.z);
  node.quaternion.setFromUnitVectors(up, V(d.normal.x, d.normal.y, d.normal.z));
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(d.r + 0.01, d.r + 0.01, d.depth, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: d.color, metalness: 0.3, roughness: 0.3, side: THREE.DoubleSide }));
  shell.position.y = -d.depth / 2 - 0.004;
  node.add(shell);
  for (const y of [-0.006, -d.depth]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(d.r + 0.012, 0.008, 8, 48), M.brass);
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y; node.add(hoop);
  }
  const head = new THREE.Mesh(new THREE.CircleGeometry(d.r, 40), M.drumHead.clone());
  head.userData.dynamic = true;
  head.material.emissive = new THREE.Color(0xffe2b0);
  head.rotation.x = -Math.PI / 2; head.position.y = -0.002;
  node.add(head);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.012, d.depth * 0.6, 0.02), M.brass);
    lug.position.set(Math.cos(a) * (d.r + 0.016), -d.depth * 0.5, Math.sin(a) * (d.r + 0.016));
    lug.rotation.y = -a;
    node.add(lug);
  }
  g.add(node);
  // tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const top = V(d.center.x + Math.cos(a) * d.r * 0.9, d.center.y - d.depth * 0.8, d.center.z + Math.sin(a) * d.r * 0.9);
    const fx = d.center.x + Math.cos(a) * (d.r + 0.18), fz = d.center.z + Math.sin(a) * (d.r + 0.18);
    g.add(rod(top, V(fx, floorAt(fx, fz), fz), 0.008, M.steelDark));
  }
  return {
    object: shadow(g),
    update() {
      const w = d.amp * 0.02 * Math.sin(d.phase * 60);
      head.position.y = -0.002 - w;
      head.material.emissiveIntensity = d.amp * 0.6;
    },
  };
}

// ---------------------------------------------------------------------------
export function buildGong(gg, M, color, floorAt) {
  const g = new THREE.Group();
  const paint = M.paint(color);
  const hang = new THREE.Group(); hang.userData.dynamic = true;
  hang.position.set(gg.center.x, gg.center.y + gg.r + 0.08, gg.center.z);
  const pts = [];
  const prof = [[0, 0.03], [0.12, 0.028], [0.2, 0.012], [0.3, 0.006], [0.92, 0.0], [0.98, -0.02], [1.0, -0.05], [1.0, -0.06], [0.97, -0.03], [0.9, -0.01], [0.3, -0.004], [0, -0.004]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x * gg.r, y * gg.r));
  const disc = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), M.gongBronze.clone());
  disc.material.emissive = new THREE.Color(0xffb060);
  disc.material.emissiveMap = disc.material.map;
  disc.material.emissiveIntensity = 0;
  disc.rotation.x = Math.PI / 2; // lathe axis (y) -> +z (gong faces +z)
  disc.position.y = -(gg.r + 0.08);
  hang.add(disc);
  // cords
  for (const s of [-1, 1]) hang.add(rod(V(s * gg.r * 0.35, 0.0, 0), V(s * gg.r * 0.25, -0.09, 0), 0.004, M.rubber, 5));
  g.add(hang);
  // frame
  const w = gg.r + 0.14, top = gg.center.y + gg.r + 0.12;
  for (const s of [-1, 1]) {
    const x = gg.center.x + s * w;
    g.add(rod(V(x, floorAt(x, gg.center.z), gg.center.z), V(x, top + 0.05, gg.center.z), 0.022, paint));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), M.gold);
    cap.position.set(x, top + 0.08, gg.center.z); g.add(cap);
    // feet
    g.add(rod(V(x, floorAt(x, gg.center.z) + 0.3, gg.center.z), V(x, floorAt(x, gg.center.z), gg.center.z + 0.3), 0.012, paint));
    g.add(rod(V(x, floorAt(x, gg.center.z) + 0.3, gg.center.z), V(x, floorAt(x, gg.center.z), gg.center.z - 0.3), 0.012, paint));
  }
  const bar = rod(V(gg.center.x - w - 0.04, top, gg.center.z), V(gg.center.x + w + 0.04, top, gg.center.z), 0.02, paint);
  g.add(bar);
  // cuckoo house on the crossbar; the bird pops out when the gong sounds
  const house = new THREE.Group();
  house.position.set(gg.center.x, top + 0.02, gg.center.z);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.12), M.maple);
  box.position.y = 0.07; house.add(box);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.08, 4), paint);
  roof.rotation.y = Math.PI / 4; roof.position.y = 0.18; house.add(roof);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), M.iron);
  door.position.set(0, 0.08, 0.061); house.add(door);
  const bird = new THREE.Group(); bird.userData.dynamic = true;
  bird.position.set(0, 0.08, 0.02);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), M.paint('#e3b505'));
  body.scale.set(1, 0.9, 1.3); bird.add(body);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 8), M.paint('#e2711d'));
  beak.rotation.x = Math.PI / 2; beak.position.z = 0.045; bird.add(beak);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.03), M.paint('#d1263b'));
  wingL.position.set(0.03, 0.005, 0); const wingR = wingL.clone(); wingR.position.x = -0.03;
  wingL.userData.dynamic = true; wingR.userData.dynamic = true;
  bird.add(wingL, wingR);
  house.add(bird);
  g.add(house);
  let pop = 0, lastShimmer = 0;
  return {
    object: shadow(g),
    update(dt, t) {
      if (gg.shimmer > lastShimmer + 0.15) pop = 1.6;
      lastShimmer = gg.shimmer;
      pop = Math.max(0, pop - dt);
      const out = Math.min(1, pop * 2.5);
      bird.position.z = 0.02 + out * 0.1;
      wingL.rotation.z = out * Math.sin(t * 30) * 0.8;
      wingR.rotation.z = -out * Math.sin(t * 30) * 0.8;
      hang.rotation.x = gg.wob * 0.25;
      disc.rotation.z = Math.sin(t * 0.7) * 0.02 * gg.shimmer;
      disc.material.emissiveIntensity = gg.shimmer * 0.22;
    },
  };
}

// ---------------------------------------------------------------------------
export function buildPlinko(pl, M, color, floorAt) {
  const g = new THREE.Group();
  const paint = M.paint(color);
  const c = pl.center, rt = pl.right, n = pl.normal;
  const node = new THREE.Group();
  node.position.set(c.x, c.y, c.z);
  node.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(rt.x, 0, rt.z), up, V(n.x, 0, n.z)));
  g.add(node);
  const W = pl.width, H = pl.height, D = pl.depth;
  for (const s of [-1, 1]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.006), M.glass);
    glass.position.z = s * (D / 2 + 0.004);
    glass.renderOrder = 2;
    node.add(glass);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.035, H + 0.06, D + 0.03), M.maple);
    side.position.x = s * (W / 2 + 0.018);
    node.add(side);
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.07, 0.03, D + 0.03), M.maple);
  topBar.position.y = H / 2 + 0.015;
  node.add(topBar);
  // header sign
  const sign = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.08, 0.012), paint);
  sign.position.set(0, H / 2 + 0.07, D / 2 + 0.02);
  node.add(sign);
  // pegs
  const pegGeo = new THREE.CylinderGeometry(pl.pegR, pl.pegR, D + 0.01, 10);
  pegGeo.rotateX(Math.PI / 2);
  const pegs = new THREE.InstancedMesh(pegGeo, M.brass, pl.pegs.length);
  const capGeo = new THREE.SphereGeometry(0.011, 12, 8);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.3 }), pl.pegs.length * 2);
  caps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pl.pegs.length * 2 * 3), 3);
  const m4 = new THREE.Matrix4();
  const hue = new THREE.Color();
  pl.pegs.forEach((p, i) => {
    m4.makeTranslation(p.u, p.y - c.y, 0);
    pegs.setMatrixAt(i, m4);
    for (const s of [0, 1]) {
      m4.makeTranslation(p.u, p.y - c.y, (s ? 1 : -1) * (D / 2 + 0.012));
      caps.setMatrixAt(2 * i + s, m4);
    }
    hue.setHSL(((p.midi % 12) / 12), 0.75, 0.55);
    p.hue = hue.clone();
  });
  node.add(pegs, caps);
  // legs
  for (const s of [-1, 1]) {
    const x = c.x + rt.x * s * (W / 2 + 0.018), z = c.z + rt.z * s * (W / 2 + 0.018);
    g.add(rod(V(x, c.y - H / 2 - 0.03, z), V(x, floorAt(x, z), z), 0.016, paint));
  }
  const col = new THREE.Color();
  return {
    object: shadow(g),
    update() {
      pl.pegs.forEach((p, i) => {
        const k = Math.min(1, p.glow);
        col.copy(p.hue).multiplyScalar(0.25 + 2.2 * k);
        caps.setColorAt(2 * i, col); caps.setColorAt(2 * i + 1, col);
      });
      caps.instanceColor.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Bars under the rails (marimba lanes, glockenspiel tines) + resonators.
export function buildBars(run, M, kind) {
  const t = run.track;
  const g = new THREE.Group();
  const n = run.bars.length;
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  const bars = new THREE.InstancedMesh(barGeo, kind === 'marimba' ? M.rosewood : M.steel, n);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
  const tubes = kind === 'marimba' ? new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), M.brass, n) : null;
  const f = {};
  const base = [];
  const m4 = new THREE.Matrix4(), s3 = V(1, 1, 1), q = new THREE.Quaternion(), p3 = V(0, 0, 0);
  run.bars.forEach((b, i) => {
    t.sample(b.s, f);
    const hz = midiToHz(b.midi);
    const len = kind === 'marimba' ? 0.3 * Math.sqrt(midiToHz(62) / hz) + 0.05 : 0.16 * Math.sqrt(midiToHz(74) / hz) + 0.04;
    const thick = kind === 'marimba' ? 0.014 : 0.008;
    const width = kind === 'marimba' ? 0.034 : 0.016;
    const bx = V(f.sx, f.sy, f.sz), by = V(f.ux, f.uy, f.uz), bz = V(f.tx, f.ty, f.tz);
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
    const drop = RAIL.drop + BALL.railRadius + thick / 2 + 0.001;
    p3.set(f.px - f.ux * drop, f.py - f.uy * drop, f.pz - f.uz * drop);
    s3.set(len, thick, width);
    m4.compose(p3, q, s3);
    bars.setMatrixAt(i, m4);
    base.push({ p: p3.clone(), q: q.clone(), s: s3.clone() });
    if (tubes) {
      const tl = Math.min(0.42, 343 / (4 * hz) * 0.9);
      const tr = 0.017;
      const tp = V(p3.x, p3.y - thick / 2 - 0.006 - tl / 2, p3.z);
      m4.compose(tp, new THREE.Quaternion(), V(tr, tl, tr));
      tubes.setMatrixAt(i, m4);
    }
  });
  g.add(bars);
  if (tubes) g.add(tubes);
  const col = new THREE.Color();
  return {
    object: shadow(g),
    update() {
      run.bars.forEach((b, i) => {
        const k = b.amp;
        col.setRGB(1 + k * 1.6, 1 + k * 1.2, 1 + k * 0.6);
        bars.setColorAt(i, col);
        const bb = base[i];
        const wob = 1 + k * 0.06;
        m4.compose(bb.p, bb.q, s3.set(bb.s.x, bb.s.y * wob, bb.s.z));
        bars.setMatrixAt(i, m4);
      });
      bars.instanceColor.needsUpdate = true;
      bars.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Clock faces on the lift tower showing the glasshouse's time of day.
export function buildClock(M, getHour, faces) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f6efdc'; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#2a2016'; x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#2a2016'; x.font = '600 26px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const rn = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    x.save(); x.translate(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); x.rotate(a + Math.PI / 2);
    x.fillText(rn[i], 0, 0); x.restore();
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    x.lineWidth = i % 5 ? 1 : 3;
    x.beginPath(); x.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); x.lineTo(128 + Math.cos(a) * (i % 5 ? 106 : 102), 128 + Math.sin(a) * (i % 5 ? 106 : 102)); x.stroke();
  }
  x.fillStyle = '#b8872d'; x.font = 'italic 600 15px Georgia, serif'; x.fillText('Glass House', 128, 168);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xfff2d0, emissiveMap: tex, emissiveIntensity: 0 });
  const hands = [];
  for (const f of faces) {
    const node = new THREE.Group();
    node.position.set(f.x, f.y, f.z);
    node.rotation.y = f.rotY;
    const face = new THREE.Mesh(new THREE.CircleGeometry(f.r, 48), faceMat);
    node.add(face);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(f.r + 0.008, 0.012, 8, 48), M.brass);
    node.add(bezel);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(f.r + 0.01, f.r + 0.01, 0.03, 32), M.paint('#1d2a28'));
    back.rotation.x = Math.PI / 2; back.position.z = -0.016;
    node.add(back);
    const hourHand = new THREE.Group(), minHand = new THREE.Group();
    hourHand.userData.dynamic = true; minHand.userData.dynamic = true;
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.012, f.r * 0.55, 0.004), M.iron);
    hh.position.y = f.r * 0.25; hourHand.add(hh);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(0.008, f.r * 0.85, 0.004), M.iron);
    mh.position.y = f.r * 0.4; minHand.add(mh);
    hourHand.position.z = 0.004; minHand.position.z = 0.008;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), M.brass); hub.position.z = 0.01;
    node.add(hourHand, minHand, hub);
    g.add(node);
    hands.push([hourHand, minHand]);
  }
  return {
    object: shadow(g),
    faceMat,
    update() {
      const h = getHour();
      for (const [hh, mh] of hands) {
        hh.rotation.z = -((h % 12) / 12) * Math.PI * 2;
        mh.rotation.z = -((h % 1)) * Math.PI * 2;
      }
    },
  };
}

// Little pennants fluttering on the tallest masts.
export function buildPennants(masts, M, colorOf) {
  const tall = masts.filter((m) => m.yTop - m.y0 > 2.6);
  const g = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.035, 0, 0, -0.035, 0, 0.16, 0, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const items = [];
  for (const m of tall) {
    const pivot = new THREE.Group();
    pivot.userData.dynamic = true;
    pivot.position.set(m.x, m.yTop + 0.1, m.z);
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.color, side: THREE.DoubleSide, roughness: 0.7 }));
    pivot.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), M.gold);
    pole.position.y = -0.03;
    pivot.add(pole);
    g.add(pivot);
    items.push({ pivot, flag, ph: Math.random() * 10 });
  }
  return {
    object: g,
    update(dt, t) {
      for (const it of items) {
        it.pivot.rotation.y = 0.9 + Math.sin(t * 0.3 + it.ph) * 0.5;
        it.flag.rotation.x = Math.sin(t * 5 + it.ph) * 0.25;
      }
    },
  };
}

// ---------------------------------------------------------------------------
export function buildColumns(columns, M, colorOf) {
  const g = new THREE.Group();
  for (const c of columns) {
    const paint = M.paint(colorOf(c.branch));
    g.add(rod(V(c.x, c.y0, c.z), V(c.x, c.y1, c.z), c.r, paint, 16));
    const capital = new THREE.Mesh(new THREE.SphereGeometry(c.r * 1.8, 20, 12), M.gold);
    capital.position.set(c.x, c.y1 + c.r * 1.2, c.z);
    g.add(capital);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 2.4, c.r * 2.8, 0.05, 20), M.brass);
    base.position.set(c.x, c.y0 + 0.025, c.z);
    g.add(base);
  }
  return shadow(g);
}
