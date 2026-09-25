// Assemble every mesh of the machine and keep it in sync with the simulation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALL, RAIL } from '../sim/constants.js';
import { PEDESTAL } from '../sim/layout.js';
import { makeMaterials, ballTexture } from './materials.js';
import { buildTracks, buildSupports } from './trackMeshes.js';
import { buildWaterSlide } from './waterMeshes.js';
import {
  KeepOut, buildPedestal, buildLift, buildFlipFlops, buildFunnel, buildWheel, buildBucket,
  buildBells, buildDrum, buildGong, buildPlinko, buildBars, buildColumns, buildClock, buildPennants,
} from './deviceMeshes.js';

const R = BALL.R;

// Fold every mesh that never moves into one merged mesh per material, which
// cuts hundreds of draw calls (tower lattice, stands, legs, frames...).
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.ball) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    const mat = o.material;
    if (Array.isArray(mat) || mat.transparent) return;
    const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
    if (!g.attributes.uv) return;
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const key = mat.uuid;
    if (!groups.has(key)) groups.set(key, { mat, geos: [] });
    groups.get(key).geos.push(g.index ? g : g.toNonIndexed());
    victims.push(o);
  });
  for (const o of victims) o.removeFromParent();
  let n = 0;
  for (const { mat, geos } of groups.values()) {
    const indexed = geos.filter((g) => g.index), plain = geos.filter((g) => !g.index);
    for (const set of [indexed, plain]) {
      if (!set.length) continue;
      const merged = mergeGeometries(set, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      n++;
    }
  }
  return { meshes: victims.length, into: n };
}

export class MachineView {
  constructor(scene, renderer, machine) {
    this.machine = machine;
    this.scene = scene;
    const M = (this.M = makeMaterials(renderer));
    const B = machine.BRANCHES;
    const colorOf = (t) => (B[t.branch ?? t] || B.top).color;
    const floorAt = (x, z) => (Math.hypot(x, z) < PEDESTAL.r - 0.02 ? PEDESTAL.top : 0.25);
    this.floorAt = floorAt;
    const root = (this.root = new THREE.Group());
    root.name = 'machine';
    scene.add(root);
    this.updaters = [];
    const add = (o) => { if (o.object) { root.add(o.object); if (o.update) this.updaters.push(o.update); } else root.add(o); return o; };

    const keep = new KeepOut();
    const d = machine.devices;
    // lift tower footprint
    keep.box(-0.26, 0.38, -0.26, 0.26, 0, 9);
    add(buildPedestal(M));
    add(buildLift(machine.lift, M, B.top.color));
    add(buildFlipFlops(machine.flipflops, M));
    // funnels
    d.funnel.legPhase = 0;
    add(buildFunnel(d.funnel, M, M.funnel, 3, floorAt, keep));
    for (const h of [d.hopperM, d.hopperP, d.hopperM2]) { h.legPhase = 0.6; add(buildFunnel(h, M, M.hopper, 3, floorAt, keep)); }
    // wheel
    keep.box(d.wheel.cx - 0.55, d.wheel.cx + 0.55, d.wheel.cz - 0.2, d.wheel.cz + 0.2, d.wheel.cy - 0.55, d.wheel.cy + 0.55);
    add(buildWheel(d.wheel, M, B.marimba.color, floorAt));
    // bucket
    keep.box(d.bucket.pivot.x - 0.2, d.bucket.pivot.x + 0.2, d.bucket.pivot.z - 0.55, d.bucket.pivot.z + 0.4, d.bucket.pivot.y - 0.35, d.bucket.pivot.y + 0.2);
    add(buildBucket(d.bucket, M, B.gong.color, floorAt));
    // bell tower
    const ladder = this._ladder(machine);
    add(buildBells(d.bells, M, B.bells.color, ladder));
    // drums and gong
    for (const dr of [d.drum1, d.drum2]) { keep.cyl(dr.center.x, dr.center.z, dr.r + 0.05, dr.center.y - dr.depth - 0.1, dr.center.y + 0.1); add(buildDrum(dr, M, floorAt)); }
    keep.box(d.gong.center.x - 0.6, d.gong.center.x + 0.6, d.gong.center.z - 0.1, d.gong.center.z + 0.1, 0, d.gong.center.y + 0.6);
    add(buildGong(d.gong, M, B.gong.color, floorAt));
    // plinko
    const pl = d.plinko;
    keep.box(pl.center.x - pl.width / 2 - 0.06, pl.center.x + pl.width / 2 + 0.06, pl.center.z - 0.08, pl.center.z + 0.08, pl.center.y - pl.height / 2 - 0.1, pl.center.y + pl.height / 2 + 0.2);
    add(buildPlinko(pl, M, B.plinko.color, floorAt));
    // water slide: flume, tunnel, riser and tank, whirlpool, water glasses
    this.water = add(buildWaterSlide(machine, M, B.water.color, floorAt, keep));
    // bar runs
    add(buildBars(d.marimbaI, M, 'marimba'));
    add(buildBars(d.marimbaII, M, 'marimba'));
    add(buildBars(d.tines, M, 'tines'));
    add(buildColumns(machine.columns, M, (b) => colorOf(b)));
    // tracks + supports
    add(buildTracks(machine, M));
    const sup = buildSupports(machine, M, keep, floorAt, (t) => colorOf(t));
    add(sup);
    this.postCount = sup.userData.postCount;
    add(buildPennants(sup.userData.masts, M));
    // clock faces at the top of the lift tower (south and north)
    this.hour = 17.5;
    const yc = machine.lift.yT + 0.1;
    const clock = add(buildClock(M, () => this.hour, [
      { x: 0.065, y: yc, z: 0.225, r: 0.16, rotY: 0 },
      { x: 0.065, y: yc, z: -0.225, r: 0.16, rotY: Math.PI },
    ]));
    this.clockMat = clock.faceMat;
    // bulbs around the pedestal rim: glow at night, chase when the gong tips
    const nB = 36;
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.3 }), nB);
    this.bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nB * 3), 3);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nB; i++) {
      const a = (i / nB) * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * (PEDESTAL.r + 0.045), PEDESTAL.top - 0.045, Math.sin(a) * (PEDESTAL.r + 0.045));
      this.bulbs.setMatrixAt(i, m4);
    }
    root.add(this.bulbs);
    this.night = 0; this.flash = 0; this.bulbT = 0;
    const bulbCol = new THREE.Color();
    this.updaters.push((dt, t) => {
      this.flash = Math.max(0, this.flash - dt * 0.35);
      for (let i = 0; i < nB; i++) {
        const chase = this.flash > 0 ? Math.max(0, Math.sin((i / nB) * Math.PI * 8 - t * 9)) * this.flash * 2.5 : 0;
        const k = 0.12 + this.night * 1.3 + chase;
        bulbCol.setRGB(1.0 * k, 0.78 * k, 0.45 * k);
        this.bulbs.setColorAt(i, bulbCol);
      }
      this.bulbs.instanceColor.needsUpdate = true;
      if (this.clockMat) this.clockMat.emissiveIntensity = this.night * 0.55;
    });

    this.mergedFrom = mergeStatic(root);

    // balls
    this.ballMeshes = [];
    const geo = new THREE.SphereGeometry(R, 40, 24);
    for (const b of machine.world.balls) this._addBallMesh(b, geo);
    this.ballGeo = geo;
  }

  _ladder(machine) {
    const ramps = machine.world.tracks.filter((t) => t.meta.ladder !== undefined);
    if (!ramps.length) return null;
    const x = ramps[0].start.x;
    let zMin = Infinity, zMax = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of ramps) for (const p of [t.start, t.end]) { zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const mastZ = [zMin - 0.19, zMax + 0.19];
    const arms = [];
    const V = (a, b, c) => new THREE.Vector3(a, b, c);
    for (const t of ramps) {
      for (const p of [t.start, t.end]) {
        const zm = Math.abs(p.z - mastZ[0]) < Math.abs(p.z - mastZ[1]) ? mastZ[0] : mastZ[1];
        arms.push([V(x + 0.1, p.y - RAIL.drop - 0.01, zm), V(x, p.y - RAIL.drop - 0.012, p.z)]);
      }
    }
    for (const b of machine.devices.bells) {
      const zm = Math.abs(b.hang.z - mastZ[0]) < Math.abs(b.hang.z - mastZ[1]) ? mastZ[0] : mastZ[1];
      arms.push([V(x + 0.1, b.hang.y, zm), V(b.hang.x, b.hang.y, b.hang.z)]);
    }
    return { x, mastZ, y0: 0.25, y1: y1 + 0.25, arms };
  }

  _addBallMesh(b, geo = this.ballGeo) {
    const mat = new THREE.MeshPhysicalMaterial({
      map: ballTexture(b.color, b.number), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.userData.ball = b;
    this.root.add(mesh);
    this.ballMeshes.push(mesh);
    return mesh;
  }

  syncBalls() {
    const balls = this.machine.world.balls;
    // add/remove meshes to match the ball list
    while (this.ballMeshes.length < balls.length) this._addBallMesh(balls[this.ballMeshes.length]);
    while (this.ballMeshes.length > balls.length) {
      const m = this.ballMeshes.pop();
      this.root.remove(m);
      m.material.dispose();
    }
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i], m = this.ballMeshes[i];
      m.userData.ball = b;
      m.position.set(b.p.x, b.p.y, b.p.z);
      m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    }
  }

  update(dt, t) {
    for (const u of this.updaters) u(dt, t);
    this.syncBalls();
  }
}
