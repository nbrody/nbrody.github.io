// Water: the flumes of the two water slides and the streams running down
// them, the moat, the tide pool dug into the dune with its whirlpool, the
// spouts that feed the slides, and splashes. Adapted from the Glass House
// machine's water slide.
import * as THREE from 'three';
import { BALL } from '../../../ballMachine/js/sim/constants.js';
import { GeoBuilder, frames } from '../../../ballMachine/js/render/trackMeshes.js';
import { CASTLE } from '../sim/layout.js';
import { sandMaterial } from './sand.js';

const R = BALL.R;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const add = (a, b, k) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const FLOW_REPEAT = 0.45;
const deg = Math.PI / 180;

function rod(a, b, r, mat, seg = 10) {
  const d = V(b.x - a.x, b.y - a.y, b.z - a.z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296); }
function rippleNormals(size, seed, along = 1) {
  const R0 = rng(seed), waves = [];
  for (let k = 0; k < 16; k++) {
    const fx = Math.round(1 + R0() * 8), fy = Math.max(1, Math.round((1 + R0() * 8) / along));
    waves.push([fx * (R0() < 0.5 ? -1 : 1), fy, 0.5 / Math.hypot(fx, fy * along), R0() * Math.PI * 2]);
  }
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let dx = 0, dy = 0;
    for (const [fx, fy, a, ph] of waves) { const cs = Math.cos(2 * Math.PI * (fx * i / size + fy * j / size) + ph) * a; dx += cs * fx; dy += cs * fy; }
    const n = V(-dx * 0.55, -dy * 0.55, 1).normalize(), o = 4 * (j * size + i);
    img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function foamTexture() {
  const W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d'), R0 = rng(11);
  g.fillStyle = '#5ccbd8'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    const x0 = R0() * W, amp = 2 + R0() * 6, cyc = 1 + Math.floor(R0() * 3), ph = R0() * 6.28, y0 = R0() * H, len = 30 + R0() * 120;
    g.strokeStyle = `rgba(255,255,255,${0.15 + R0() * 0.45})`; g.lineWidth = 0.6 + R0() * 2.2;
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0]) {
      g.beginPath();
      for (let y = 0; y <= len; y += 4) { const yy = y0 + y, x = x0 + Math.sin((yy / H) * cyc * 2 * Math.PI + ph) * amp; if (y === 0) g.moveTo(x + ox, yy + oy); else g.lineTo(x + ox, yy + oy); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/**
 * @param styles map track name → 'shell' (a fibreglass slide), 'sand' (a channel dug in the sand)
 * @param earth  the dug earthworks (tunnels are where a flume runs underground)
 */
export function buildWater(machine, M, earth, colors, floorAt) {
  const g = new THREE.Group();
  g.name = 'water';
  const updates = [];
  const d = machine.devices;
  const ws = d.waterSlide, cs = d.castle, pool = ws.pool;
  const flumes = [...ws.flumes, ...cs.flumes];
  const style = { wsHelix: 'shell', wsTube: 'shell', cHelix: 'shell', cGate: 'sand', moat: 'sand' };
  const paintOf = { wsHelix: colors.water, wsTube: colors.water, cHelix: colors.castle };
  const tunnelsOf = (t) => earth.tunnels.filter((x) => x.track === t);
  const inTunnel = (t, s) => tunnelsOf(t).some((x) => s > x.s0 - 0.02 && s < x.s1 + 0.02);

  const gel = new THREE.MeshStandardMaterial({ color: 0xf1f7f4, roughness: 0.42, side: THREE.DoubleSide });
  const paints = {};
  const paint = (hex) => (paints[hex] ||= new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.34, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  const foam = foamTexture(), streamN = rippleNormals(256, 7, 2.5);
  const streamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: foam, normalMap: streamN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide });

  // ------------------------------------------------------------ flume shells and the streams
  const W = { pos: [], nor: [], uv: [], idx: [] };
  const f = {};
  for (const t of flumes) {
    const fl = t.flume, Rc = fl.Rc;
    const fr = frames(t, 0.025);
    const A = fr.P.map((p, i) => add(p, fr.U[i], fl.rho));
    if (style[t.name] === 'shell') {
      const shellIn = new GeoBuilder(), shellOut = new GeoBuilder(), lips = new GeoBuilder();
      // split the sweep into runs above ground and runs underground (lined all round)
      const runs = [];
      let cur = null;
      for (let i = 0; i < fr.P.length; i++) {
        const under = fl.tube && inTunnel(t, fr.s[i]);
        if (!cur || cur.under !== under) { if (cur) cur.i1 = i; cur = { under, i0: Math.max(0, i - 1), i1: i }; runs.push(cur); }
      }
      if (cur) cur.i1 = fr.P.length - 1;
      for (const run of runs) {
        const sl = (arr) => arr.slice(run.i0, run.i1 + 1);
        const Ar = sl(A), Sr = sl(fr.S), Ur = sl(fr.U);
        // underground the flume is just the sand tunnel: no fibreglass
        if (Ar.length < 2 || run.under) continue;
        const rim = fl.rim, n = 22, To = 0.007, inner = [], outer = [];
        for (let k = 0; k <= n; k++) {
          const a = -rim + (2 * rim * k) / n, sa = Math.sin(a), ca = Math.cos(a);
          inner.unshift([Rc * sa, -Rc * ca, -sa, ca]);
          outer.push([(Rc + To) * sa, -(Rc + To) * ca, sa, -ca]);
        }
        shellIn.sweep(Ar, Sr, Ur, inner);
        shellOut.sweep(Ar, Sr, Ur, outer);
        for (const side of [-1, 1]) {
          const a = side * rim, rr = Rc + To / 2;
          lips.tube(Ar.map((p, i) => add(add(p, Sr[i], rr * Math.sin(a)), Ur[i], -rr * Math.cos(a))), Sr, Ur, 0.0068, 8);
        }
      }
      const inM = new THREE.Mesh(shellIn.geometry(), gel);
      const outM = new THREE.Mesh(shellOut.geometry(), paint(paintOf[t.name] ?? '#15a9c6'));
      const lipM = new THREE.Mesh(lips.geometry(), gel);
      for (const m of [inM, outM, lipM]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    }
    // the stream's surface: a chord across the channel at its depth, banked at beta
    for (let i = 0; i < fr.P.length; i++) {
      const j = Math.min(t.n - 1, Math.round(fr.s[i] / t.ds));
      const h = fl.h[j], be = fl.beta[j], th = Math.acos(Math.max(-1, Math.min(1, (Rc - h) / Rc)));
      const nU = Math.cos(be), nS = -Math.sin(be);
      const base = W.pos.length / 3;
      for (let k = 0; k <= 2; k++) {
        const a = k === 1 ? be : be - th + th * k, r = k === 1 ? Rc - h : Rc - 0.0015;
        const q = add(add(A[i], fr.S[i], r * Math.sin(a)), fr.U[i], -r * Math.cos(a));
        W.pos.push(q.x, q.y, q.z);
        W.nor.push(nU * fr.U[i].x + nS * fr.S[i].x, nU * fr.U[i].y + nS * fr.S[i].y, nU * fr.U[i].z + nS * fr.S[i].z);
        W.uv.push(k / 2, fl.tau[j] / FLOW_REPEAT);
      }
      if (i > 0) for (let k = 0; k < 2; k++) { const a = base - 3 + k, b = a + 1, c2 = base + k, dd = c2 + 1; W.idx.push(a, b, c2, b, dd, c2); }
    }
  }
  // the tide pool slide pours out of its tunnel into the pool
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
      for (const k of [-1, 1]) { W.pos.push(p.x + f.sx * w * k, Math.max(p.y, pool.ySurf - 0.01), p.z + f.sz * w * k); W.nor.push(0, 1, 0); W.uv.push(k < 0 ? 0 : 1, (fl.tauEnd + tt) / FLOW_REPEAT); }
      if (rows) { const a = base + 2 * (rows - 1); W.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      rows++;
      if (p.y < pool.ySurf) break;
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(W.pos, 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(W.nor, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(W.uv, 2));
  wg.setIndex(W.idx);
  wg.computeBoundingSphere();
  const stream = new THREE.Mesh(wg, streamMat);
  stream.renderOrder = 3; stream.userData.dynamic = true;
  g.add(stream);

  // ------------------------------------------------------------ the still part of the moat
  // (the current runs half way round; the other half lies calm behind a sluice)
  {
    const C = CASTLE, moat = cs.moat;
    const th0 = Math.atan2(-(moat.end.z - C.cz), moat.end.x - C.cx) / deg, th1 = Math.atan2(-(moat.start.z - C.cz), moat.start.x - C.cx) / deg + 360;
    const yW = moat.end.y - R + 0.03;
    const pts = [];
    for (let th = th0 + 3; th <= th1 - 3; th += 1.5) pts.push(V(C.cx + C.moatR * Math.cos(th * deg), yW, C.cz - C.moatR * Math.sin(th * deg)));
    const geo = new THREE.BufferGeometry(), p = [], ix = [];
    const w = 0.105;
    pts.forEach((q, i) => {
      const r = Math.hypot(q.x - C.cx, q.z - C.cz), dx = (q.x - C.cx) / r, dz = (q.z - C.cz) / r;
      p.push(q.x - dx * w, yW, q.z - dz * w, q.x + dx * w, yW, q.z + dz * w);
      if (i) { const a = 2 * (i - 1); ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setIndex(ix); geo.computeVertexNormals();
    const still = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3fa7b5, roughness: 0.05, metalness: 0.1, normalMap: rippleNormals(128, 31, 1), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    still.renderOrder = 3;
    g.add(still);
    // the sluice boards at either end
    const board = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
    for (const th of [th0 + 2, th1 - 2]) {
      const q = V(C.cx + C.moatR * Math.cos(th * deg), yW + 0.02, C.cz - C.moatR * Math.sin(th * deg));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.02), board);
      b.position.copy(q); b.rotation.y = th * deg;
      b.castShadow = true;
      g.add(b);
    }
    g.userData.moatStill = { pts, y: yW };
  }

  // ------------------------------------------------------------ spouts that feed the slides
  const jetDrops = [];
  const spout = (head, from, flumeT) => {
    flumeT.sample(0.14, f);
    const nozzle = V(f.px + f.ux * flumeT.flume.rho, head.y + 0.22, f.pz + f.uz * flumeT.flume.rho);
    g.add(rod(from, V(nozzle.x, from.y, nozzle.z), 0.018, M.copper, 12));
    g.add(rod(V(nozzle.x, from.y, nozzle.z), nozzle, 0.018, M.copper, 12));
    const nzl = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.045, 14), M.brass);
    nzl.position.set(nozzle.x, nozzle.y - 0.02, nozzle.z); g.add(nzl);
    const jetH = nozzle.y - 0.04 - (f.py - R * 0.4);
    const jt = foam.clone(); jt.needsUpdate = true; jt.repeat.set(1, 1.5);
    const jm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: jt, roughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, jetH, 14, 1, true), jm);
    jet.position.set(nozzle.x, nozzle.y - 0.04 - jetH / 2, nozzle.z);
    jet.renderOrder = 3; jet.userData.dynamic = true;
    g.add(jet);
    jetDrops.push({ x: nozzle.x, y: f.py - R * 0.4 + 0.01, z: nozzle.z, floor: f.py - R });
    updates.push((dt, t) => { jt.offset.y = t * 2.2; });
    return nozzle;
  };
  // the young palm: a coconut on the trunk with a spout
  const wsHead = ws.flumes[0].start;
  const palmFrom = V(ws.palm.x, wsHead.y + 0.3, ws.palm.z);
  const nutG = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.85 }));
  nutG.position.copy(palmFrom).add(V(0.12, 0, -0.1)); nutG.castShadow = true; g.add(nutG);
  const jetWs = spout(wsHead, nutG.position.clone(), ws.flumes[0]);
  // the keep: a pipe out through the battlements
  const cHead = cs.helix.start;
  const keepFrom = V(CASTLE.cx, cHead.y + 0.34, CASTLE.cz - CASTLE.keepR + 0.1);
  const jetC = spout(cHead, keepFrom, cs.helix);

  // ------------------------------------------------------------ the tide pool
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const r = pool.rHole + (pool.rOut - pool.rHole) * Math.pow(i / 64, 1.3);
    const sl = pool.dhy(r), inv = 1 / Math.sqrt(1 + sl * sl);
    pts.push(new THREE.Vector2(r + R * sl * inv, pool.hy(r) - R * inv));
  }
  const rw = pool.rOut + R + 0.002, lipY = pool.wallTop + R * 0.5, floorEdge = pts[pts.length - 1].y;
  pts.push(new THREE.Vector2(rw, floorEdge), new THREE.Vector2(rw, lipY), new THREE.Vector2(rw + 0.05, lipY + 0.01));
  const wetSand = sandMaterial({ packed: 0.5, ripples: 0 });
  wetSand.color.setRGB(0.7, 0.62, 0.52);
  wetSand.side = THREE.DoubleSide;
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), wetSand);
  bowl.position.set(pool.cx, 0, pool.cz);
  bowl.receiveShadow = true;
  g.add(bowl);
  const rimM = sandMaterial({ packed: 1, ripples: 0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rw + 0.03, 0.035, 10, 72), rimM);
  rim.rotation.x = Math.PI / 2; rim.scale.z = 0.6; rim.position.set(pool.cx, lipY, pool.cz);
  rim.castShadow = true; rim.receiveShadow = true;
  g.add(rim);
  // pebbles and a couple of shells round the rim
  {
    const R0 = rng(77);
    const peb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.7 }), 26);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = V(), c = new THREE.Color();
    for (let i = 0; i < 26; i++) {
      const a = R0() * Math.PI * 2, r = rw + 0.04 + R0() * 0.08, sz = 0.015 + R0() * 0.02;
      q.setFromEuler(new THREE.Euler(R0() * 3, R0() * 3, R0() * 3));
      m4.compose(V(pool.cx + Math.cos(a) * r, lipY + 0.005, pool.cz + Math.sin(a) * r), q, s3.set(sz, sz * 0.6, sz * 1.2));
      peb.setMatrixAt(i, m4); peb.setColorAt(i, c.setHSL(0.08, 0.1 + R0() * 0.15, 0.35 + R0() * 0.3));
    }
    peb.castShadow = true;
    g.add(peb);
  }
  // the whirlpool's water, with swirling ripples and splash rings
  const ringsN = 18, segN = 72, dip = 0.03, dipR = 0.065;
  const wp = [], wu = [], wi = [];
  for (let j = 0; j <= ringsN; j++) {
    const r = rw * Math.pow(j / ringsN, 1.4);
    for (let i = 0; i <= segN; i++) { const a = (i / segN) * Math.PI * 2; wp.push(Math.cos(a) * r, -dip * Math.exp(-(r * r) / (dipR * dipR)), Math.sin(a) * r); wu.push(i / segN, j / ringsN); }
  }
  for (let j = 0; j < ringsN; j++) for (let i = 0; i < segN; i++) { const a = j * (segN + 1) + i, b = a + 1, c2 = a + segN + 1, dd = c2 + 1; wi.push(a, b, c2, b, dd, c2); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  pg.setIndex(wi); pg.computeVertexNormals();
  const U = {
    uTime: { value: 0 }, uWaves: { value: rippleNormals(256, 23, 1) },
    uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
    uSwirl: { value: pool.swirl * 1.6 }, uDip: { value: new THREE.Vector2(dip, dipR) },
  };
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x7fd6d8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  poolMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPolar;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPolar = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPolar; uniform float uTime; uniform sampler2D uWaves; uniform vec4 uRip[4]; uniform float uSwirl; uniform vec2 uDip;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float r = max(length(vPolar), 1e-3);
          float ang = atan(vPolar.y, vPolar.x);
          float om = uSwirl * (1.0 - exp(-r * r / 0.0049)) / (r * r);
          float a1 = ang + om * uTime;
          vec2 uv1 = vec2(a1 / 6.2831853 * 5.0, r * 4.0 - uTime * 0.05);
          vec2 uv2 = vec2(a1 / 6.2831853 * 9.0 + 0.37, r * 7.0 + uTime * 0.03);
          vec2 dd = (texture2D(uWaves, uv1).xy * 2.0 - 1.0) * 0.28 + (texture2D(uWaves, uv2).xy * 2.0 - 1.0) * 0.16;
          vec2 er = vPolar / r, et = vec2(-er.y, er.x);
          vec2 gg = er * dd.y + et * dd.x;
          gg += er * (2.0 * uDip.x * r / (uDip.y * uDip.y) * exp(-r * r / (uDip.y * uDip.y)));
          for (int i = 0; i < 4; i++) {
            float age = uTime - uRip[i].z;
            if (age < 0.0 || age > 2.2) continue;
            vec2 q = vPolar - uRip[i].xy;
            float dq = length(q) + 1e-4, front = 0.06 + 0.32 * age;
            float zz = (dq - front) / (0.02 + 0.04 * age);
            float env = uRip[i].w * exp(-2.2 * age) * exp(-zz * zz);
            gg += q / dq * env * sin((dq - front) * 90.0) * 1.2;
          }
          vec3 wn = normalize(vec3(-gg.x, 1.0, -gg.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
  };
  const water = new THREE.Mesh(pg, poolMat);
  water.position.set(pool.cx, pool.ySurf, pool.cz);
  water.renderOrder = 3; water.userData.dynamic = true;
  g.add(water);
  let ripN = 0;

  // ------------------------------------------------------------ spray
  const NDROP = 240;
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xf2feff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false }), NDROP);
  drops.renderOrder = 5; drops.userData.dynamic = true; drops.frustumCulled = false;
  const D = Array.from({ length: NDROP }, () => ({ life: 0, p: V(0, -10, 0), v: V(0, 0, 0), r: 0.004, floor: 0 }));
  let nextDrop = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NDROP; i++) drops.setMatrixAt(i, hide);
  g.add(drops);
  const spray = (x, y, z, n, speed, floorY) => {
    for (let k = 0; k < n; k++) {
      const dd = D[nextDrop]; nextDrop = (nextDrop + 1) % NDROP;
      const a = Math.random() * Math.PI * 2, up = 0.5 + Math.random() * 0.9, out = 0.25 + Math.random() * 0.75;
      dd.p.set(x + Math.cos(a) * 0.02, y + 0.005, z + Math.sin(a) * 0.02);
      dd.v.set(Math.cos(a) * out * speed, up * speed * 1.2, Math.sin(a) * out * speed);
      dd.life = 1.2; dd.r = 0.0025 + Math.random() * 0.0045; dd.floor = floorY;
    }
  };
  const m4 = new THREE.Matrix4();
  let jetDrip = 0;
  updates.push((dt, t) => {
    const k = t / FLOW_REPEAT;
    foam.offset.y = -k; streamN.offset.y = -k * 1.03;
    U.uTime.value = t;
    for (let i = 0; i < NDROP; i++) {
      const dd = D[i];
      if (dd.life <= 0) continue;
      dd.life -= dt; dd.v.y -= 9.81 * dt; dd.p.addScaledVector(dd.v, dt);
      if ((dd.p.y < dd.floor && dd.v.y < 0) || dd.life <= 0) { dd.life = 0; drops.setMatrixAt(i, hide); continue; }
      m4.makeScale(dd.r, dd.r * (1 + Math.min(1.5, Math.abs(dd.v.y) * 0.3)), dd.r); m4.setPosition(dd.p);
      drops.setMatrixAt(i, m4);
    }
    drops.instanceMatrix.needsUpdate = true;
    jetDrip += dt;
    if (jetDrip > 0.08) { jetDrip = 0; for (const j of jetDrops) spray(j.x, j.y, j.z, 1, 0.5, j.floor); }
  });

  return {
    object: g,
    anchors: {
      jet: { x: jetWs.x, y: jetWs.y - 0.1, z: jetWs.z },
      jet2: { x: jetC.x, y: jetC.y - 0.1, z: jetC.z },
      stream: { x: ws.palm.x, y: (wsHead.y + 2.4) / 2, z: ws.palm.z },
      stream2: { x: CASTLE.cx, y: 3.0, z: CASTLE.cz },
      pool: { x: pool.cx, y: pool.ySurf, z: pool.cz },
      moat: { x: CASTLE.cx - 1.2, y: 1.45, z: CASTLE.cz + 0.9 },
    },
    update(dt, t) { for (const u of updates) u(dt, t); },
    splash(e, t) {
      const v = Math.min(3, e.v ?? 1);
      spray(e.x, e.y, e.z, Math.round(10 + 22 * Math.min(1, v / 1.8)), 0.45 + 0.55 * v, pool.ySurf - 0.005);
      if (e.pool === 'pool') {
        const rip = U.uRip.value[ripN++ % 4];
        rip.set(e.x - pool.cx, e.z - pool.cz, t, Math.min(1, 0.4 + v * 0.5));
      }
    },
    spray,
  };
}
