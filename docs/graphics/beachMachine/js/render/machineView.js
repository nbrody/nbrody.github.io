// Assemble every mesh of the beach machine and keep it in sync with the
// simulation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALL } from '../../../ballMachine/js/sim/constants.js';
import { makeMaterials } from '../../../ballMachine/js/render/materials.js';
import { buildTracks, buildSupports } from '../../../ballMachine/js/render/trackMeshes.js';
import { KeepOut, buildFunnel, buildBars, buildPennants } from '../../../ballMachine/js/render/deviceMeshes.js';
import { PALM, CASTLE } from '../sim/layout.js';
import { digEarthworks } from '../sim/terrain.js';
import { buildSand } from './sand.js';
import { buildPalm } from './palm.js';
import { buildCastle } from './castle.js';
import { buildWater } from './water.js';
import { stripedMaterial } from '../env/beach.js';
import {
  beachMaterials, buildFlipFlops, buildSteelBand, buildBassPan, buildFerrisWheel, buildLighthouse, buildPail,
  buildUmbrella, buildShipBell, buildWave, buildJumpBoard, buildBottles, buildChimes,
} from './devices.js';

const R = BALL.R;
const deg = Math.PI / 180;

// Fold every mesh that never moves into one merged mesh per material.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.ball || o.userData.keep) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic || p.userData.keep) return;
    const mat = o.material;
    if (Array.isArray(mat) || mat.transparent || o.customDepthMaterial) return;
    const g = o.geometry.clone();
    if (!g.attributes.uv || !g.attributes.normal) return;
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const key = mat.uuid;
    if (!groups.has(key)) groups.set(key, { mat, geos: [] });
    groups.get(key).geos.push(g);
    victims.push(o);
  });
  for (const o of victims) o.removeFromParent();
  for (const { mat, geos } of groups.values()) {
    for (const set of [geos.filter((g) => g.index), geos.filter((g) => !g.index)]) {
      if (!set.length) continue;
      const merged = mergeGeometries(set, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
  }
}

export class MachineView {
  constructor(scene, renderer, machine) {
    this.machine = machine;
    const M = (this.M = makeMaterials(renderer));
    const B = (this.B = beachMaterials(M));
    M.trough = new THREE.MeshStandardMaterial({ color: 0xffffff, map: B.plank.map, roughness: 0.8, side: THREE.DoubleSide });
    M.driftwood = B.driftwood; M.plank = B.plank;
    const BR = machine.BRANCHES;
    const colorOf = (t) => (BR[t.branch ?? t] || BR.top).color;
    const root = (this.root = new THREE.Group());
    root.name = 'machine';
    scene.add(root);
    this.updaters = [];
    const add = (o) => { if (o && o.object) { root.add(o.object); if (o.update) this.updaters.push(o.update.bind(o)); } else if (o) root.add(o); return o; };
    const d = machine.devices;

    // ---------------------------------------------------------- the sand, dug by the tracks
    // the calm half of the moat is dug first, then the tracks dig their way through
    const moatPts = [];
    {
      const C = CASTLE, moat = d.castle.moat;
      const th0 = Math.atan2(-(moat.end.z - C.cz), moat.end.x - C.cx) / deg, th1 = Math.atan2(-(moat.start.z - C.cz), moat.start.x - C.cx) / deg + 360;
      for (let th = th0; th <= th1; th += 1) moatPts.push({ x: C.cx + C.moatR * Math.cos(th * deg), y: moat.end.y - R - 0.035, z: C.cz - C.moatR * Math.sin(th * deg) });
    }
    const earth = (this.earth = digEarthworks(machine, { channels: [{ pts: moatPts, half: 0.085 }] }));
    const sand = (this.sand = buildSand(machine, earth));
    sand.object.userData.keep = true;
    add(sand);
    const floorAt = (this.floorAt = (x, z) => earth.heightAt(x, z));

    const keep = new KeepOut();
    // ---------------------------------------------------------- the palm-tree lift
    const lift = machine.lift;
    const palm = (this.palm = buildPalm({
      base: { x: PALM.cx, y: 0.92, z: PALM.cz }, height: PALM.top - 0.92, lean: { x: 0.22, z: 0.18 }, straight: (5.3 - 0.92) / (PALM.top - 0.92),
      r0: 0.3, r1: 0.26, ringH: 0.11, fronds: 14, frondLen: 2.35, seed: 3, coconuts: 7, lift,
    }));
    add(palm);
    keep.cyl(PALM.cx, PALM.cz, 0.42, 0, 9);
    // the young palm the tide-pool slide winds round
    const ws = d.waterSlide;
    const tpBase = floorAt(ws.palm.x, ws.palm.z) - 0.05;
    const palm2 = buildPalm({ base: { x: ws.palm.x, y: tpBase, z: ws.palm.z }, height: 5.55 - tpBase, lean: { x: 0.12, z: -0.1 }, straight: 0.7, r0: 0.17, r1: 0.14, fronds: 12, frondLen: 1.9, seed: 8, coconuts: 5 });
    add(palm2);
    keep.cyl(ws.palm.x, ws.palm.z, 0.25, 0, 9);

    // ---------------------------------------------------------- the sandcastle
    const castle = (this.castle = buildCastle(machine, M));
    add(castle);
    castle.keepOut(keep);

    // ---------------------------------------------------------- switches and devices
    add(buildFlipFlops(machine.flipflops, M));
    // sieves (toy sand sieves) and the conch
    for (const h of [d.hopperM, d.hopperM2]) { h.legPhase = 0.6; add(buildFunnel(h, M, B.sieve, 3, floorAt, keep)); }
    d.funnel.legPhase = 0;
    add(buildFunnel(d.funnel, M, B.conch, 3, floorAt, keep));
    for (const dr of [d.drum1, d.drum2]) { keep.cyl(dr.center.x, dr.center.z, dr.r + 0.06, 0, dr.center.y + 0.1); add(buildBassPan(dr, M, B, floorAt)); }
    // Ferris wheel
    keep.box(d.wheel.cx - 0.6, d.wheel.cx + 0.6, d.wheel.cz - 0.2, d.wheel.cz + 0.2, 0, d.wheel.cy + 0.6);
    this.ferris = add(buildFerrisWheel(d.wheel, M, B, BR.marimba.color, floorAt));
    // the lighthouse inside the tines' spiral
    const lh = machine.columns.find((c) => c.kind === 'lighthouse');
    this.lighthouse = add(buildLighthouse(lh, M, B, floorAt, machine.tracks.glockHelix.start.y + 0.25));
    keep.cyl(lh.x, lh.z, 0.28, 0, 9);
    // sand pail
    keep.box(d.bucket.pivot.x - 0.2, d.bucket.pivot.x + 0.2, d.bucket.pivot.z - 0.55, d.bucket.pivot.z + 0.4, d.bucket.pivot.y - 0.35, d.bucket.pivot.y + 0.2);
    add(buildPail(d.bucket, M, B, '#e8332c', floorAt));
    // the umbrella over the chute, and the ship's bell
    const um = machine.columns.find((c) => c.kind === 'umbrella');
    add(buildUmbrella(um, M, B, stripedMaterial(['#1d9e6c', '#ffffff'], 16), floorAt, 5.0));
    keep.cyl(um.x, um.z, 0.08, 0, 9);
    const sb = d.shipBell, ch = machine.tracks.chute, chT = ch.endTangent();
    add(buildShipBell(sb, M, B, floorAt, { x: chT.x, z: chT.z }));
    keep.cyl(sb.hang.x, sb.hang.z, 0.4, sb.hang.y - 0.8, sb.hang.y + 0.3);
    // steel band ladder between two surfboards
    const ladder = this._ladder(machine);
    add(buildSteelBand(d.pans, M, B, ladder, BR.bells.color));
    keep.box(ladder.x - 0.25, ladder.x + 0.4, ladder.mastZ[0] - 0.12, ladder.mastZ[1] + 0.12, 0, 9);
    // the curling wave, the surfboard jump
    add(buildWave(machine.tracks.loop));
    add(buildJumpBoard(machine.tracks.jump, B));
    // bars: the boardwalk marimba, the lighthouse's tines; bottles and chimes
    add(buildBars(d.marimbaI, M, 'marimba'));
    add(buildBars(d.marimbaII, M, 'marimba'));
    add(buildBars(d.tines, M, 'tines'));
    add(buildBottles(d.glasses, M, B));
    add(buildChimes(d.chimes, M, { x: CASTLE.cx, z: CASTLE.cz, r: CASTLE.keepR }));

    // ---------------------------------------------------------- water
    this.water = add(buildWater(machine, M, earth, { water: BR.water.color, castle: BR.castle.color }, floorAt));
    keep.cyl(d.pool.cx, d.pool.cz, d.pool.rOut + 0.12, 0, 9);

    // ---------------------------------------------------------- tracks and supports
    add(buildTracks(machine, M));
    const sup = buildSupports(machine, M, keep, floorAt, (t) => colorOf(t));
    add(sup);
    this.postCount = sup.userData.postCount;
    add(buildPennants(sup.userData.masts, M));

    mergeStatic(root);
    this.night = 0;

    // ---------------------------------------------------------- beach balls
    this.ballMeshes = [];
    const geo = new THREE.SphereGeometry(R, 40, 24);
    for (const b of machine.world.balls) this._addBallMesh(b, geo);
    this.ballGeo = geo;
  }

  _ladder(machine) {
    const ramps = machine.world.tracks.filter((t) => t.meta.ladder !== undefined);
    const x = ramps[0].start.x;
    let zMin = Infinity, zMax = -Infinity, y1 = -Infinity;
    for (const t of ramps) for (const p of [t.start, t.end]) { zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); y1 = Math.max(y1, p.y); }
    const mastZ = [zMin - 0.19, zMax + 0.19];
    const arms = [];
    const V = (a, b, c) => new THREE.Vector3(a, b, c);
    for (const t of ramps) for (const p of [t.start, t.end]) {
      const zm = Math.abs(p.z - mastZ[0]) < Math.abs(p.z - mastZ[1]) ? mastZ[0] : mastZ[1];
      arms.push([V(x + 0.1, p.y - 0.04, zm + (zm < 0 ? 0.05 : -0.05)), V(x, p.y - 0.04, p.z)]);
    }
    for (const b of machine.devices.pans) {
      const zm = Math.abs(b.hang.z - mastZ[0]) < Math.abs(b.hang.z - mastZ[1]) ? mastZ[0] : mastZ[1];
      arms.push([V(x + 0.1, b.hang.y, zm + (zm < 0 ? 0.05 : -0.05)), V(b.hang.x, b.hang.y, b.hang.z)]);
    }
    const y0 = Math.min(this.floorAt(x + 0.1, mastZ[0]), this.floorAt(x + 0.1, mastZ[1]));
    return { x, mastZ, y0, y1: y1 + 0.25, arms };
  }

  _addBallMesh(b, geo = this.ballGeo) {
    const mat = new THREE.MeshPhysicalMaterial({ map: beachBallTexture(b.color, b.number), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.userData.ball = b;
    this.root.add(mesh);
    this.ballMeshes.push(mesh);
    return mesh;
  }

  syncBalls() {
    const balls = this.machine.world.balls;
    while (this.ballMeshes.length < balls.length) this._addBallMesh(balls[this.ballMeshes.length]);
    while (this.ballMeshes.length > balls.length) { const m = this.ballMeshes.pop(); this.root.remove(m); m.material.dispose(); }
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i], m = this.ballMeshes[i];
      m.userData.ball = b;
      m.position.set(b.p.x, b.p.y, b.p.z);
      m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    }
  }

  update(dt, t) {
    const n = this.night;
    if (this.lighthouse) this.lighthouse.night = n;
    this.machine.devices.wheel.night = n;
    for (const u of this.updaters) u(dt, t);
    this.syncBalls();
  }
}

// A beach ball: six gores, its own colour alternating with white and two
// friends, white caps at the poles, and its number on one white gore.
const texCache = new Map();
const FRIENDS = [0xf5c518, 0x2a6fd6, 0xe8332c, 0x21a35b];
export function beachBallTexture(colorHex, number) {
  const key = `${colorHex}-${number}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const hex = (h) => '#' + h.toString(16).padStart(6, '0');
  const friends = FRIENDS.filter((f) => f !== colorHex);
  const cols = [hex(colorHex), '#fbf8f0', hex(friends[number % friends.length]), '#fbf8f0', hex(friends[(number + 1) % friends.length]), '#fbf8f0'];
  for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.fillRect((i / 6) * 512, 0, 512 / 6 + 1, 256); }
  g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 21, 512, 2); g.fillRect(0, 233, 512, 2);
  g.fillStyle = '#1b1b1b'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(number), (1.5 / 6) * 512, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
