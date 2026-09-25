// Meshes for the water slide: the flume and the stream running down it, the
// glass tunnel, the copper riser with its header tank and spout, the
// whirlpool bowl, the tuned water glasses, and the splashes.
import * as THREE from 'three';
import { BALL } from '../sim/constants.js';
import { GeoBuilder, frames } from './trackMeshes.js';

const R = BALL.R;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const add = (a, b, k) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const FLOW_REPEAT = 0.45;        // the stream's texture repeats every 0.45 s of flow

function rod(a, b, r, mat, seg = 10) {
  const d = V(b.x - a.x, b.y - a.y, b.z - a.z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

// ---------------------------------------------------------------------------
// Procedural textures. Integer wave numbers keep every pattern tileable.
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296); }

// Normal map from a sum of sine ripples; `along` stretches them into streaks
// running down the texture's v direction (the direction of flow).
function rippleNormals(size, seed, along = 1) {
  const R0 = rng(seed), waves = [];
  for (let k = 0; k < 16; k++) {
    const fx = Math.round(1 + R0() * 8), fy = Math.max(1, Math.round((1 + R0() * 8) / along));
    waves.push([fx * (R0() < 0.5 ? -1 : 1), fy, 0.5 / Math.hypot(fx, fy * along), R0() * Math.PI * 2]);
  }
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let dx = 0, dy = 0;
    for (const [fx, fy, a, ph] of waves) {
      const cs = Math.cos(2 * Math.PI * (fx * i / size + fy * j / size) + ph) * a;
      dx += cs * fx; dy += cs * fy;
    }
    const n = V(-dx * 0.55, -dy * 0.55, 1).normalize(), o = 4 * (j * size + i);
    img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// White-water streaks on pale turquoise, running along v (drawn twice,
// a tile apart, so they wrap).
function foamTexture() {
  const W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d'), R0 = rng(11);
  g.fillStyle = '#5cc6df'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    const x0 = R0() * W, amp = 2 + R0() * 6, cyc = 1 + Math.floor(R0() * 3), ph = R0() * 6.28;
    const y0 = R0() * H, len = 30 + R0() * 120;
    g.strokeStyle = `rgba(255,255,255,${0.15 + R0() * 0.45})`;
    g.lineWidth = 0.6 + R0() * 2.2;
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0]) {
      g.beginPath();
      for (let y = 0; y <= len; y += 4) {
        const yy = y0 + y, x = x0 + Math.sin((yy / H) * cyc * 2 * Math.PI + ph) * amp;
        if (y === 0) g.moveTo(x + ox, yy + oy); else g.lineTo(x + ox, yy + oy);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Glazed white tiles with turquoise grout for the inside of the bowl.
function tileTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), R0 = rng(5);
  g.fillStyle = '#4fb3bd'; g.fillRect(0, 0, 256, 256);
  const n = 8, s = 256 / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const l = 90 + R0() * 7;
    g.fillStyle = (i + j) % 7 === 3 ? `hsl(186,55%,${l - 32}%)` : `hsl(190,30%,${l}%)`;
    g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 3);
  return t;
}

// ---------------------------------------------------------------------------
export function buildWaterSlide(machine, M, color, floorAt, keepOut) {
  const ws = machine.devices.waterSlide;
  const pool = ws.pool;
  const g = new THREE.Group();
  g.name = 'waterSlide';
  const updates = [];

  // glossy painted fibreglass outside, satin white gelcoat inside (as water slides are)
  const paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.34, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const gel = new THREE.MeshStandardMaterial({ color: 0xf1f7f4, roughness: 0.42, metalness: 0 });
  const tubeGlass = new THREE.MeshPhysicalMaterial({
    color: 0xcfeffa, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
    transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
  });
  const foam = foamTexture(), streamN = rippleNormals(256, 7, 2.5);
  const streamMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: foam, normalMap: streamN, normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
  });

  // ------------------------------------------------------------ flume shells, the tunnel and the stream
  const shellIn = new GeoBuilder(), shellOut = new GeoBuilder(), lips = new GeoBuilder(), glassG = new GeoBuilder();
  const W = { pos: [], nor: [], uv: [], idx: [] };
  const collars = [];
  const f = {};
  for (const t of ws.flumes) {
    const fl = t.flume, Rc = fl.Rc;
    const fr = frames(t, 0.025);
    const A = fr.P.map((p, i) => add(p, fr.U[i], fl.rho));        // the channel's axis
    if (fl.tube) {
      const n = 28, Rt = Rc + 0.004, prof = [];
      for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; prof.push([Rt * Math.sin(a), -Rt * Math.cos(a), Math.sin(a), -Math.cos(a)]); }
      glassG.sweep(A, fr.S, fr.U, prof);
      for (let s = 0.3; s < t.L - 0.1; s += 0.55) collars.push([t, s]);
    } else {
      const rim = fl.rim, n = 22, To = 0.007, inner = [], outer = [];
      // a sweep's front faces point along T × (next profile point − this one): the
      // lining runs right to left so it faces the axis, the skin left to right
      for (let k = 0; k <= n; k++) {
        const a = -rim + (2 * rim * k) / n, sa = Math.sin(a), ca = Math.cos(a);
        inner.unshift([Rc * sa, -Rc * ca, -sa, ca]);
        outer.push([(Rc + To) * sa, -(Rc + To) * ca, sa, -ca]);
      }
      shellIn.sweep(A, fr.S, fr.U, inner);
      shellOut.sweep(A, fr.S, fr.U, outer);
      for (const side of [-1, 1]) {
        const a = side * rim, rr = Rc + To / 2;
        lips.tube(A.map((p, i) => add(add(p, fr.S[i], rr * Math.sin(a)), fr.U[i], -rr * Math.cos(a))), fr.S, fr.U, 0.0068, 8);
      }
    }
    // the stream's surface: a chord across the channel at its depth, banked at beta
    for (let i = 0; i < fr.P.length; i++) {
      const j = Math.min(t.n - 1, Math.round(fr.s[i] / t.ds));
      const h = fl.h[j], be = fl.beta[j], th = Math.acos(Math.max(-1, Math.min(1, (Rc - h) / Rc)));
      const nU = Math.cos(be), nS = -Math.sin(be);
      const base = W.pos.length / 3;
      for (let k = 0; k <= 2; k++) {
        // the two wetted edges on the wall, and the middle of the chord between them
        const a = k === 1 ? be : be - th + th * k, r = k === 1 ? Rc - h : Rc - 0.0015;
        const q = add(add(A[i], fr.S[i], r * Math.sin(a)), fr.U[i], -r * Math.cos(a));
        W.pos.push(q.x, q.y, q.z);
        W.nor.push(nU * fr.U[i].x + nS * fr.S[i].x, nU * fr.U[i].y + nS * fr.S[i].y, nU * fr.U[i].z + nS * fr.S[i].z);
        W.uv.push(k / 2, fl.tau[j] / FLOW_REPEAT);
      }
      if (i > 0) for (let k = 0; k < 2; k++) { const a = base - 3 + k, b = a + 1, c2 = base + k, d = c2 + 1; W.idx.push(a, b, c2, b, d, c2); }
    }
  }
  // the stream pours out of the tunnel into the pool
  {
    const t = ws.flumes[ws.flumes.length - 1], fl = t.flume;
    t.sample(t.L, f);
    const j = t.n - 1, u = fl.u[j], h = fl.h[j], half = Math.sqrt(Math.max(0, 2 * fl.Rc * h - h * h));
    const p0 = { x: f.px - f.ux * (R - h * 0.6), y: f.py - f.uy * (R - h * 0.6), z: f.pz - f.uz * (R - h * 0.6) };
    const base = W.pos.length / 3;
    let rows = 0;
    for (let tt = 0; tt < 0.4; tt += 0.02) {
      const p = { x: p0.x + f.tx * u * tt, y: p0.y + f.ty * u * tt - 4.9 * tt * tt, z: p0.z + f.tz * u * tt };
      const w = half * (1 + tt * 1.5);
      for (const k of [-1, 1]) {
        W.pos.push(p.x + f.sx * w * k, Math.max(p.y, pool.ySurf - 0.01), p.z + f.sz * w * k);
        W.nor.push(0, 1, 0);
        W.uv.push(k < 0 ? 0 : 1, (fl.tauEnd + tt) / FLOW_REPEAT);
      }
      if (rows) { const a = base + 2 * (rows - 1); W.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      rows++;
      if (p.y < pool.ySurf) break;
    }
  }
  const shellInM = new THREE.Mesh(shellIn.geometry(), gel);
  const shellOutM = new THREE.Mesh(shellOut.geometry(), paint);
  const lipM = new THREE.Mesh(lips.geometry(), gel);
  for (const m of [shellInM, shellOutM, lipM]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(W.pos, 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(W.nor, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(W.uv, 2));
  wg.setIndex(W.idx);
  wg.computeBoundingSphere();
  const stream = new THREE.Mesh(wg, streamMat);
  stream.renderOrder = 3;
  stream.userData.dynamic = true;
  g.add(stream);
  const tunnel = new THREE.Mesh(glassG.geometry(), tubeGlass);
  tunnel.renderOrder = 4;
  tunnel.userData.dynamic = true;
  g.add(tunnel);
  if (collars.length) {
    const cg = new THREE.TorusGeometry(ws.flumes[1].flume.Rc + 0.008, 0.005, 6, 28);
    const im = new THREE.InstancedMesh(cg, M.brass, collars.length);
    const m4 = new THREE.Matrix4(), bx = V(0, 0, 0), by = V(0, 0, 0), bz = V(0, 0, 0);
    collars.forEach(([t, s], i) => {
      t.sample(s, f);
      bx.set(f.sx, f.sy, f.sz); by.set(f.ux, f.uy, f.uz); bz.set(f.tx, f.ty, f.tz);
      m4.makeBasis(bx, by, bz);
      const rho = t.flume.rho;
      m4.setPosition(f.px + f.ux * rho, f.py + f.uy * rho, f.pz + f.uz * rho);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    g.add(im);
  }

  // ------------------------------------------------------------ riser, header tank and spout
  const rx = ws.riser.x, rz = ws.riser.z;
  const helix = ws.flumes[0], head = helix.start;
  const tankY = head.y + 0.46;
  g.add(rod(V(rx, 0.25, rz), V(rx, tankY - 0.14, rz), 0.052, M.copper, 20));
  for (let y = 0.6; y < tankY - 0.3; y += 0.85) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 20), M.brass);
    fl.position.set(rx, y, rz); g.add(fl);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.3, 36), M.copper);
  tank.position.set(rx, tankY, rz); g.add(tank);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.21, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.copper);
  lid.scale.y = 0.45; lid.position.set(rx, tankY + 0.15, rz); g.add(lid);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), M.gold);
  fin.position.set(rx, tankY + 0.27, rz); g.add(fin);
  for (const y of [tankY - 0.12, tankY + 0.12]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.008, 8, 48), M.brass);
    band.rotation.x = Math.PI / 2; band.position.set(rx, y, rz); g.add(band);
  }
  // spout: out from the tank to just past the head of the flume, then down
  helix.sample(0.14, f);
  const nozzle = V(f.px + f.ux * helix.flume.rho, head.y + 0.24, f.pz + f.uz * helix.flume.rho);
  const py = tankY - 0.06;
  const dirN = V(nozzle.x - rx, 0, nozzle.z - rz).normalize();
  const elbow = V(nozzle.x, py, nozzle.z);
  g.add(rod(V(rx + dirN.x * 0.19, py, rz + dirN.z * 0.19), elbow, 0.022, M.copper, 14));
  g.add(rod(elbow, V(nozzle.x, nozzle.y, nozzle.z), 0.022, M.copper, 14));
  const nzl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.05, 16), M.brass);
  nzl.position.set(nozzle.x, nozzle.y - 0.02, nozzle.z); g.add(nzl);
  const elb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), M.brass);
  elb.position.copy(elbow); g.add(elb);
  // the falling jet
  const jetH = nozzle.y - 0.045 - (f.py - R * 0.4);
  const jetTex = foam.clone(); jetTex.needsUpdate = true; jetTex.repeat.set(1, 1.5);
  const jetN = streamN.clone(); jetN.needsUpdate = true; jetN.repeat.set(1, 1.5);
  const jetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: jetTex, normalMap: jetN, roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, jetH, 16, 1, true), jetMat);
  jet.position.set(nozzle.x, nozzle.y - 0.045 - jetH / 2, nozzle.z);
  jet.renderOrder = 3; jet.userData.dynamic = true;
  g.add(jet);
  keepOut.cyl(rx, rz, 0.12, 0, tankY + 0.35);
  keepOut.cyl(rx, rz, 0.25, tankY - 0.2, tankY + 0.35);

  // ------------------------------------------------------------ the whirlpool bowl
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const r = pool.rHole + (pool.rOut - pool.rHole) * Math.pow(i / 64, 1.3);
    const sl = pool.dhy(r), inv = 1 / Math.sqrt(1 + sl * sl);
    pts.push(new THREE.Vector2(r + R * sl * inv, pool.hy(r) - R * inv));
  }
  const rw = pool.rOut + R + 0.002, lipY = pool.wallTop + R * 0.5, floorEdge = pts[pts.length - 1].y;
  pts.push(new THREE.Vector2(rw, floorEdge), new THREE.Vector2(rw, lipY));
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tileTexture(), roughness: 0.25, metalness: 0, side: THREE.DoubleSide });
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), tileMat);
  bowl.position.set(pool.cx, 0, pool.cz);
  bowl.receiveShadow = true;
  g.add(bowl);
  const holeY = pts[0].y;
  const outerPts = [V(0.07, holeY - 0.06), V(rw * 0.55, floorEdge - 0.09), V(rw + 0.025, floorEdge - 0.03), V(rw + 0.025, lipY)].map((v) => new THREE.Vector2(v.x, v.y));
  const skin = new THREE.Mesh(new THREE.LatheGeometry(outerPts, 96), M.paint('#1d5b55'));
  skin.position.set(pool.cx, 0, pool.cz);
  g.add(skin);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rw + 0.014, 0.014, 10, 96), M.brass);
  lip.rotation.x = Math.PI / 2; lip.position.set(pool.cx, lipY, pool.cz);
  g.add(lip);
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(pool.rHole + 0.008, pool.rHole + 0.008, 0.16, 24, 1, true), M.brass);
  drain.position.set(pool.cx, holeY - 0.07, pool.cz);
  g.add(drain);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const top = V(pool.cx + Math.cos(a) * rw * 0.8, floorEdge - 0.06, pool.cz + Math.sin(a) * rw * 0.8);
    const fx = pool.cx + Math.cos(a) * (rw + 0.2), fz = pool.cz + Math.sin(a) * (rw + 0.2);
    g.add(rod(top, V(fx, floorAt(fx, fz), fz), 0.016, M.iron, 10));
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), M.brass);
    foot.position.set(fx, floorAt(fx, fz) + 0.02, fz); g.add(foot);
  }
  // pump at the foot of the bowl and the pipe to the riser
  const pumpP = V(pool.cx + 0.45, 0.25, pool.cz - 0.45);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 20), M.paint('#262b2f'));
  pump.position.set(pumpP.x, 0.35, pumpP.z); g.add(pump);
  const pumpCap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20), M.brass);
  pumpCap.position.set(pumpP.x, 0.47, pumpP.z); g.add(pumpCap);
  g.add(rod(V(pumpP.x, 0.3, pumpP.z), V(rx, 0.3, rz), 0.03, M.copper, 12));
  g.add(rod(V(pool.cx, holeY - 0.12, pool.cz), V(pumpP.x, 0.36, pumpP.z), 0.022, M.copper, 10));
  keepOut.cyl(pool.cx, pool.cz, rw + 0.25, 0, lipY + 0.05);
  keepOut.cyl(pumpP.x, pumpP.z, 0.18, 0, 0.6);

  // the water: a disc with a dimple over the drain; ripples that swirl
  // faster toward the centre are drawn in the shader, plus splash rings
  const ringsN = 18, segN = 72, dip = 0.03, dipR = 0.065;
  const wp = [], wu = [], wi = [];
  for (let j = 0; j <= ringsN; j++) {
    const r = rw * Math.pow(j / ringsN, 1.4);
    for (let i = 0; i <= segN; i++) {
      const a = (i / segN) * Math.PI * 2;
      wp.push(Math.cos(a) * r, -dip * Math.exp(-(r * r) / (dipR * dipR)), Math.sin(a) * r);
      wu.push(i / segN, j / ringsN);
    }
  }
  for (let j = 0; j < ringsN; j++) for (let i = 0; i < segN; i++) {
    const a = j * (segN + 1) + i, b = a + 1, c2 = a + segN + 1, d = c2 + 1;
    wi.push(a, b, c2, b, d, c2);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  pg.setIndex(wi);
  pg.computeVertexNormals();
  const U = {
    uTime: { value: 0 },
    uWaves: { value: rippleNormals(256, 23, 1) },
    uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
    uSwirl: { value: pool.swirl * 1.6 },
    uDip: { value: new THREE.Vector2(dip, dipR) },
  };
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x8fdbe8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
  poolMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPolar;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPolar = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPolar;
        uniform float uTime; uniform sampler2D uWaves; uniform vec4 uRip[4]; uniform float uSwirl; uniform vec2 uDip;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float r = max(length(vPolar), 1e-3);
          float ang = atan(vPolar.y, vPolar.x);
          // angular speed of the vortex (Lamb–Oseen), clockwise seen from above
          float om = uSwirl * (1.0 - exp(-r * r / 0.0049)) / (r * r);
          float a1 = ang + om * uTime;
          vec2 uv1 = vec2(a1 / 6.2831853 * 5.0, r * 4.0 - uTime * 0.05);
          vec2 uv2 = vec2(a1 / 6.2831853 * 9.0 + 0.37, r * 7.0 + uTime * 0.03);
          vec2 d = (texture2D(uWaves, uv1).xy * 2.0 - 1.0) * 0.28 + (texture2D(uWaves, uv2).xy * 2.0 - 1.0) * 0.16;
          // rotate the ripple slopes from polar to x/z
          vec2 er = vPolar / r, et = vec2(-er.y, er.x);
          vec2 g = er * d.y + et * d.x;
          // the dimple over the drain
          g += er * (2.0 * uDip.x * r / (uDip.y * uDip.y) * exp(-r * r / (uDip.y * uDip.y)));
          // splash rings
          for (int i = 0; i < 4; i++) {
            float age = uTime - uRip[i].z;
            if (age < 0.0 || age > 2.2) continue;
            vec2 q = vPolar - uRip[i].xy;
            float dq = length(q) + 1e-4, front = 0.06 + 0.32 * age;
            float zz = (dq - front) / (0.02 + 0.04 * age);
            float env = uRip[i].w * exp(-2.2 * age) * exp(-zz * zz);
            g += q / dq * env * sin((dq - front) * 90.0) * 1.2;
          }
          vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
  };
  const water = new THREE.Mesh(pg, poolMat);
  water.position.set(pool.cx, pool.ySurf, pool.cz);
  water.renderOrder = 3; water.userData.dynamic = true;
  g.add(water);
  let ripN = 0;

  // ------------------------------------------------------------ the water glasses
  const run = machine.devices.glasses;
  const gt = run.track;
  const TINT = { 86: '#4d6bff', 88: '#10b3a0', 90: '#5fc23a', 91: '#f0b020', 93: '#f06a2a' };
  const gobletPts = [[0, 0], [0.027, 0.0], [0.027, 0.004], [0.006, 0.008], [0.004, 0.034], [0.012, 0.042], [0.028, 0.055], [0.034, 0.075], [0.036, 0.1], [0.0345, 0.1], [0.0325, 0.075], [0.027, 0.057], [0.011, 0.045], [0, 0.044]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xeef9ff, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide });
  const nG = run.bars.length;
  const goblets = new THREE.InstancedMesh(new THREE.LatheGeometry(gobletPts, 28), glassMat, nG);
  goblets.renderOrder = 4;
  const liquid = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.8, 1, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, transparent: true, opacity: 0.8, depthWrite: false }), nG);
  liquid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nG * 3), 3);
  liquid.renderOrder = 3;
  const hammerGeo = (() => {
    const arm = new THREE.CylinderGeometry(0.0022, 0.0022, 0.06, 6); arm.translate(0, -0.03, 0);
    const head = new THREE.SphereGeometry(0.0075, 12, 8); head.translate(0, -0.062, 0);
    const merged = new THREE.BufferGeometry();
    const parts = [arm.toNonIndexed(), head.toNonIndexed()];
    for (const k of ['position', 'normal', 'uv']) {
      const arrs = parts.map((p) => p.getAttribute(k).array);
      const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
      let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
      merged.setAttribute(k, new THREE.BufferAttribute(out, k === 'uv' ? 2 : 3));
    }
    return merged;
  })();
  const hammers = new THREE.InstancedMesh(hammerGeo, M.brass, nG);
  const glassInfo = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = V(1, 1, 1), p3 = V(0, 0, 0), col = new THREE.Color();
  run.bars.forEach((bar, i) => {
    gt.sample(bar.s, f);
    const side = -1;                                   // glasses stand on the left of the run
    const T = V(f.tx, 0, f.tz).normalize(), S = V(f.sx, 0, f.sz).normalize();
    const base = V(f.px + f.sx * side * 0.09, f.py - 0.086, f.pz + f.sz * side * 0.09);
    q.setFromUnitVectors(UP, UP);
    m4.compose(base, q, s3.set(1, 1, 1));
    goblets.setMatrixAt(i, m4);
    const level = Math.max(0.25, 0.78 - (bar.midi - 86) * 0.068);   // more water, lower note
    const lh = 0.056 * level;
    m4.compose(p3.set(base.x, base.y + 0.045 + lh / 2, base.z), q, s3.set(0.029 + 0.004 * level, lh, 0.029 + 0.004 * level));
    liquid.setMatrixAt(i, m4);
    col.set(TINT[bar.midi] ?? '#8fdbe8');
    liquid.setColorAt(i, col);
    // a little brass shelf from under the rails out beneath the glass
    const tieC = { x: f.px - f.ux * 0.045, y: f.py - f.uy * 0.045, z: f.pz - f.uz * 0.045 };
    g.add(rod(tieC, V(base.x, base.y - 0.004, base.z), 0.003, M.brass, 6));
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.004, 20), M.brass);
    plate.position.set(base.x, base.y - 0.004, base.z); g.add(plate);
    // the striker hangs from a gantry over the rails
    const pivot = V(f.px + f.sx * side * 0.05, f.py + 0.075, f.pz + f.sz * side * 0.05);
    g.add(rod(V(f.px - f.sx * side * 0.045, f.py - 0.03, f.pz - f.sz * side * 0.045), V(f.px - f.sx * side * 0.045, pivot.y + 0.012, f.pz - f.sz * side * 0.045), 0.0025, M.brass, 6));
    g.add(rod(V(f.px - f.sx * side * 0.045, pivot.y + 0.012, f.pz - f.sz * side * 0.045), V(pivot.x, pivot.y + 0.012, pivot.z), 0.0025, M.brass, 6));
    glassInfo.push({ bar, pivot, T, S: S.multiplyScalar(side), base, lh, level });
  });
  g.add(goblets, liquid, hammers);
  goblets.userData.dynamic = true; liquid.userData.dynamic = true; hammers.userData.dynamic = true;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const updGlasses = (t) => {
    glassInfo.forEach((gi, i) => {
      const k = gi.bar.amp;
      // at rest the striker leans over the rail, where the passing ball
      // knocks it; on the note it is against the rim, then falls back
      const ang = -0.28 + 0.4 * k * k;
      qa.setFromUnitVectors(UP, UP);
      qb.setFromAxisAngle(gi.T, ang * (gi.S.x * gi.T.z - gi.S.z * gi.T.x > 0 ? 1 : -1));
      m4.compose(gi.pivot, qb.multiply(qa), s3.set(1, 1, 1));
      hammers.setMatrixAt(i, m4);
      // the water shivers when the glass rings
      const wob = 1 + k * 0.12 * Math.sin(t * 90 + i);
      m4.compose(p3.set(gi.base.x, gi.base.y + 0.045 + gi.lh * wob / 2, gi.base.z), qa, s3.set(0.029 + 0.004 * gi.level, gi.lh * wob, 0.029 + 0.004 * gi.level));
      liquid.setMatrixAt(i, m4);
    });
    hammers.instanceMatrix.needsUpdate = true;
    liquid.instanceMatrix.needsUpdate = true;
  };

  // ------------------------------------------------------------ spray
  const NDROP = 220;
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xf2feff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false }), NDROP);
  drops.renderOrder = 5; drops.userData.dynamic = true; drops.frustumCulled = false;
  const D = Array.from({ length: NDROP }, () => ({ life: 0, p: V(0, -10, 0), v: V(0, 0, 0), r: 0.004, floor: 0 }));
  let nextDrop = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NDROP; i++) drops.setMatrixAt(i, hide);
  g.add(drops);
  const spray = (x, y, z, n, speed, floorY) => {
    for (let k = 0; k < n; k++) {
      const d = D[nextDrop]; nextDrop = (nextDrop + 1) % NDROP;
      const a = Math.random() * Math.PI * 2, up = 0.5 + Math.random() * 0.9, out = 0.25 + Math.random() * 0.75;
      d.p.set(x + Math.cos(a) * 0.02, y + 0.005, z + Math.sin(a) * 0.02);
      d.v.set(Math.cos(a) * out * speed, up * speed * 1.2, Math.sin(a) * out * speed);
      d.life = 1.2; d.r = 0.0025 + Math.random() * 0.0045; d.floor = floorY;
    }
  };
  const updDrops = (dt) => {
    for (let i = 0; i < NDROP; i++) {
      const d = D[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 9.81 * dt;
      d.p.addScaledVector(d.v, dt);
      if ((d.p.y < d.floor && d.v.y < 0) || d.life <= 0) { d.life = 0; drops.setMatrixAt(i, hide); continue; }
      m4.makeScale(d.r, d.r * (1 + Math.min(1.5, Math.abs(d.v.y) * 0.3)), d.r);
      m4.setPosition(d.p);
      drops.setMatrixAt(i, m4);
    }
    drops.instanceMatrix.needsUpdate = true;
  };

  // ------------------------------------------------------------ animation
  let jetDrip = 0;
  updates.push((dt, t) => {
    const k = t / FLOW_REPEAT;
    foam.offset.y = -k; streamN.offset.y = -k * 1.03;
    jetTex.offset.y = t * 2.2; jetN.offset.y = t * 2.3;
    U.uTime.value = t;
    updGlasses(t);
    updDrops(dt);
    // a few droplets fly where the jet hits the flume
    jetDrip += dt;
    if (jetDrip > 0.07) { jetDrip = 0; spray(nozzle.x, f.py - R * 0.4 + 0.01, nozzle.z, 1, 0.5, f.py - R); }
  });

  return {
    object: g,
    // where the running water is, for the sound
    anchors: {
      jet: { x: nozzle.x, y: nozzle.y - 0.1, z: nozzle.z },
      stream: { x: rx, y: (head.y + ws.flumes[1].end.y) / 2, z: rz },
      pool: { x: pool.cx, y: pool.ySurf, z: pool.cz },
    },
    update(dt, t) { for (const u of updates) u(dt, t); },
    // a splash event from the simulation
    splash(e, t) {
      const v = Math.min(3, e.v ?? 1);
      spray(e.x, e.y, e.z, Math.round(10 + 22 * Math.min(1, v / 1.8)), 0.45 + 0.55 * v, pool.ySurf - 0.005);
      const rip = U.uRip.value[ripN++ % 4];
      rip.set(e.x - pool.cx, e.z - pool.cz, t, Math.min(1, 0.4 + v * 0.5));
    },
  };
}
