// Coconut palms: a ringed, tapering trunk that leans as it rises, a crown of
// feathery fronds that sway in the breeze, and a cluster of coconuts.
//
// The big palm in the middle of the machine is also the lift: its trunk is
// hollow, a spiral slot is carved through the bark along the lift's helix
// (with a mouth at the foot where the feed runs in and one at the top where
// the ball runs out to the crown switches), and inside, visible through the
// slot, are the helical rails and the turning shaft with its pusher bars.
import * as THREE from 'three';
import { BALL, RAIL } from '../../../ballMachine/js/sim/constants.js';
import { NOISE, withWorldPos, patch } from './shaderBits.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

function rng(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------------------------------------------------------------- textures
let barkTex = null, frondTex = null, woodTex = null;
function barkTexture() {
  if (barkTex) return barkTex;
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(3);
  g.fillStyle = '#8a7a66'; g.fillRect(0, 0, W, H);
  // vertical fibres
  for (let i = 0; i < 500; i++) {
    const x = R() * W, y = R() * H, l = 6 + R() * 30;
    g.strokeStyle = R() < 0.5 ? `rgba(60,48,36,${0.1 + R() * 0.25})` : `rgba(190,176,150,${0.08 + R() * 0.2})`;
    g.lineWidth = 0.6 + R() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y + l); g.stroke();
  }
  // four leaf-scar rings per tile: a dark groove with a pale lip above it
  for (let k = 0; k < 4; k++) {
    const y0 = (k + 0.5) * H / 4;
    for (let x = 0; x < W; x += 2) {
      const wob = Math.sin(x / W * TAU * 2 + k * 1.7) * 2.5 + (R() - 0.5) * 1.5;
      g.fillStyle = 'rgba(52,40,30,0.75)'; g.fillRect(x, y0 + wob, 2, 3.5 + R() * 2);
      g.fillStyle = 'rgba(200,188,166,0.35)'; g.fillRect(x, y0 + wob - 3, 2, 2.5);
    }
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  barkTex.anisotropy = 4;
  return barkTex;
}
function carvedWoodTexture() {
  if (woodTex) return woodTex;
  const c = canvas(128, 64), g = c.getContext('2d'), R = rng(9);
  g.fillStyle = '#c9a877'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,86,50,${0.15 + R() * 0.25})`; g.lineWidth = 0.5 + R();
    const y = R() * 64; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y + (R() - 0.5) * 6, 90, y + (R() - 0.5) * 6, 128, y); g.stroke();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  return woodTex;
}
// a pinnate frond: leaflets either side of the midrib (u = 0.5), drawn as
// slender blades slanting toward the tip (v = 1), alpha-tested
function frondTexture() {
  if (frondTex) return frondTex;
  const W = 256, H = 1024, c = canvas(W, H), g = c.getContext('2d'), R = rng(21);
  g.clearRect(0, 0, W, H);
  const n = 58;
  for (let i = 0; i < n; i++) {
    const v = 0.03 + (i / n) * 0.95, y = H - v * H;
    const len = (W * 0.5 - 6) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.55);
    for (const side of [-1, 1]) {
      const droop = 70 + R() * 30;
      const x0 = W / 2, x1 = W / 2 + side * len;
      const grd = g.createLinearGradient(x0, y, x1, y - droop);
      const hue = 88 + R() * 16, lt = 26 + R() * 10;
      grd.addColorStop(0, `hsl(${hue},55%,${lt - 6}%)`);
      grd.addColorStop(1, `hsl(${hue + 8},60%,${lt + 12}%)`);
      g.fillStyle = grd;
      const wdt = 5 + 5 * Math.sin(Math.PI * v);
      g.beginPath();
      g.moveTo(x0, y + wdt * 0.3);
      g.quadraticCurveTo((x0 + x1) / 2, y - droop * 0.35 + wdt, x1, y - droop);
      g.quadraticCurveTo((x0 + x1) / 2, y - droop * 0.35 - wdt * 0.6, x0, y - wdt * 0.6);
      g.fill();
    }
  }
  // the midrib
  g.fillStyle = '#b9a45e'; g.fillRect(W / 2 - 3, 0, 6, H);
  frondTex = new THREE.CanvasTexture(c);
  frondTex.colorSpace = THREE.SRGBColorSpace;
  frondTex.anisotropy = 4;
  return frondTex;
}

// ---------------------------------------------------------------- materials
const mats = {};
function materials() {
  if (mats.bark) return mats;
  mats.bark = new THREE.MeshStandardMaterial({ color: 0xffffff, map: barkTexture(), roughness: 0.95 });
  mats.heart = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1, side: THREE.BackSide });
  mats.carved = new THREE.MeshStandardMaterial({ color: 0xffffff, map: carvedWoodTexture(), roughness: 0.8 });
  mats.frond = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, color: 0xffffff });
  mats.coconut = new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.8 });
  mats.boot = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 1, side: THREE.DoubleSide });
  const U = (mats.uniforms = { uTime: { value: 0 }, uWind: { value: 1 } });
  // fronds sway: more toward the tip, each frond on its own phase
  patch(mats.frond, (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSway; uniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float k = aSway.x * aSway.x;            // 0 at the crown, 1 at the tip
          float ph = aSway.y, spd = aSway.z;
          float s1 = sin(uTime * spd + ph), s2 = sin(uTime * spd * 2.3 + ph * 1.7);
          transformed.y += (s1 * 0.06 + s2 * 0.02) * k * uWind;
          transformed.x += (sin(uTime * spd * 0.7 + ph) * 0.05) * k * uWind;
          transformed.z += (cos(uTime * spd * 0.6 + ph * 0.8) * 0.05) * k * uWind;
        }`);
  });
  return mats;
}

// ---------------------------------------------------------------- the palm
/**
 * @param {object} o  base {x,y,z}, height, lean {x,z} (top offset), r0/r1 (radius at foot/top),
 *                    straight (fraction of the height before the lean starts), fronds, frondLen,
 *                    seed, coconuts, lift (a SpiralLift: carve the slot and build the mechanism)
 */
export function buildPalm(o) {
  const M = materials();
  const R = rng(o.seed ?? 1);
  const g = new THREE.Group();
  g.name = o.lift ? 'palm.lift' : 'palm';
  const H = o.height, r0 = o.r0 ?? 0.2, r1 = o.r1 ?? 0.15, u0 = o.straight ?? 0.25;
  const base = o.base, lean = o.lean ?? { x: 0, z: 0 };
  const ringH = o.ringH ?? 0.1;
  const axisAt = (u) => { const f = Math.pow(Math.max(0, (u - u0) / (1 - u0)), 2); return V(base.x + lean.x * f, base.y + H * u, base.z + lean.z * f); };
  const radiusAt = (u, y) => {
    let r = r0 + (r1 - r0) * u;
    r *= 1 + 0.5 * Math.exp(-(y - base.y) / 0.18);                       // flared foot
    const ph = ((y - base.y) / ringH) % 1;
    r *= 1 + 0.035 * Math.pow(Math.sin(Math.PI * ph), 0.4) - 0.02;       // leaf-scar rings
    return r;
  };
  // ---- trunk shell (lathe along the leaning axis)
  const NU = Math.ceil(H / 0.02), NT = o.lift ? 72 : 24;
  const pos = [], nor = [], uvs = [], idx = [];
  const frames = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, p = axisAt(u), p2 = axisAt(Math.min(1, u + 0.01)), p1 = axisAt(Math.max(0, u - 0.01));
    const T = p2.clone().sub(p1).normalize();
    const X = V(1, 0, 0).sub(T.clone().multiplyScalar(T.x)).normalize();
    const Z = new THREE.Vector3().crossVectors(X, T);
    frames.push({ p, T, X, Z });
    const r = radiusAt(u, p.y);
    for (let k = 0; k <= NT; k++) {
      const th = (k / NT) * TAU, c = Math.cos(th), s = Math.sin(th);
      // plan angle convention: (cos th, −sin th) in (x, z)
      const n = X.clone().multiplyScalar(c).add(Z.clone().multiplyScalar(-s));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uvs.push((k / NT) * Math.max(2, Math.round(r * TAU / 0.35)), (p.y - base.y) / (ringH * 4));
    }
  }
  for (let i = 0; i < NU; i++) for (let k = 0; k < NT; k++) {
    const a = i * (NT + 1) + k, b = a + 1, c = a + NT + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  let barkMat = M.bark;
  const updates = [];
  if (o.lift) {
    const L = buildLiftInside(o.lift, g, radiusAt, base, H, updates);
    barkMat = L.barkMat;
  }
  const trunk = new THREE.Mesh(tg, barkMat);
  trunk.castShadow = true; trunk.receiveShadow = true;
  if (o.lift) trunk.customDepthMaterial = barkMat.userData.depth;
  g.add(trunk);

  // ---- crown: frond boots, fronds, coconuts
  const top = axisAt(1), topT = frames[frames.length - 1].T;
  const boot = new THREE.Mesh(new THREE.ConeGeometry(r1 * 1.5, 0.45, 12, 1, true), M.boot);
  boot.position.copy(top).addScaledVector(topT, -0.12); boot.rotation.x = Math.PI;
  boot.quaternion.setFromUnitVectors(V(0, -1, 0), topT);
  g.add(boot);
  const nF = o.fronds ?? 12, FL = o.frondLen ?? 2.4;
  const fp = [], fn = [], fu = [], fs = [], fi = [];
  const Nseg = 20;
  for (let j = 0; j < nF; j++) {
    const az = (j / nF) * TAU + R() * 0.35, tier = j % 3;
    const len = FL * (0.8 + 0.25 * R()) * (tier === 0 ? 1.05 : tier === 1 ? 0.95 : 0.8);
    const rise = 0.55 + 0.35 * R() - tier * 0.12;           // initial upward angle
    const droop = 1.05 + 0.4 * R() + tier * 0.25;
    const dir = V(Math.cos(az), 0, -Math.sin(az));
    const side = V(-dir.z, 0, dir.x);
    const W = 0.55 + 0.15 * R();
    const ph = R() * TAU, spd = 0.9 + R() * 0.8;
    const b0 = fp.length / 3;
    const start = top.clone().addScaledVector(dir, r1 * 0.6).add(V(0, -0.05 - tier * 0.05, 0));
    for (let i = 0; i <= Nseg; i++) {
      const t = i / Nseg;
      // rachis: up and out, then arching down
      const hx = len * t, hy = len * (rise * t - droop * t * t * 0.62);
      const c = start.clone().addScaledVector(dir, hx).add(V(0, hy, 0));
      const slope = len * (rise - droop * t * 1.24);
      const tan = dir.clone().multiplyScalar(len).add(V(0, slope, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(side, tan).normalize();
      const w = W * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.7 * 0.5 + 0.02;
      const fold = 0.28 + 0.2 * t;                          // leaflets angle up off the midrib (a V)
      for (const [u, sgn] of [[0, -1], [0.5, 0], [1, 1]]) {
        const q = c.clone().addScaledVector(side, sgn * w * Math.cos(fold)).addScaledVector(up, Math.abs(sgn) * w * Math.sin(fold) - (sgn ? 0.02 * t : 0));
        fp.push(q.x, q.y, q.z);
        fn.push(up.x, up.y, up.z);
        fu.push(u, t);
        fs.push(t, ph, spd);
      }
    }
    for (let i = 0; i < Nseg; i++) for (let k = 0; k < 2; k++) {
      const a = b0 + i * 3 + k, b = a + 1, c = a + 3, d = c + 1;
      fi.push(a, c, b, b, c, d);
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
  fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  fg.setAttribute('aSway', new THREE.Float32BufferAttribute(fs, 3));
  fg.setIndex(fi);
  const fronds = new THREE.Mesh(fg, M.frond);
  fronds.castShadow = true; fronds.receiveShadow = true;
  fronds.userData.dynamic = true;
  fronds.customDepthMaterial = frondDepth();
  g.add(fronds);
  const nc = o.coconuts ?? 5;
  const cg = new THREE.SphereGeometry(1, 16, 12);
  const nuts = new THREE.InstancedMesh(cg, M.coconut, nc);
  const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), brown = new THREE.Color(1, 1, 1), nutBase = M.coconut.color;
  const green = new THREE.Color(0x7a8a2a); green.setRGB(green.r / nutBase.r, green.g / nutBase.g, green.b / nutBase.b);
  for (let i = 0; i < nc; i++) {
    const a = R() * TAU, r = r1 * 1.1 + R() * 0.05;
    const s = 0.085 + R() * 0.025;
    cm.compose(top.clone().add(V(Math.cos(a) * r, -0.2 - R() * 0.12, -Math.sin(a) * r)), cq, V(s, s * 1.15, s));
    nuts.setMatrixAt(i, cm);
    nuts.setColorAt(i, R() < 0.35 ? green : brown);
  }
  nuts.castShadow = true;
  g.add(nuts);
  return {
    object: g,
    top,
    axisAt,
    radiusAt,
    update(dt, t) { M.uniforms.uTime.value = t; for (const u of updates) u(dt, t); },
  };
}

let _frondDepth = null;
function frondDepth() {
  if (_frondDepth) return _frondDepth;
  const M = materials();
  _frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: M.frond.map, alphaTest: 0.45 });
  patch(_frondDepth, (sh) => {
    Object.assign(sh.uniforms, M.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSway; uniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float k = aSway.x * aSway.x; float ph = aSway.y, spd = aSway.z;
          transformed.y += (sin(uTime * spd + ph) * 0.06 + sin(uTime * spd * 2.3 + ph * 1.7) * 0.02) * k * uWind; }`);
  });
  return _frondDepth;
}

// ---------------------------------------------------------------- the lift inside the trunk
// The slot follows the lift's helix: its centre line y_c(a) over the helix
// angle a, extended flat at both ends into the mouths. The bark shader
// discards fragments inside the slot (and so does its shadow), the carved
// faces of the slot are built as ribbons, and an inner shell lines the hollow.
function buildLiftInside(lift, g, radiusAt, base, H, updates) {
  const M = materials();
  const HW = 0.056;                                   // half-height of the slot
  const RIN = 0.212;                                  // inner face of the bark
  const aMin = -0.95, aMax = lift.span + 0.8;
  const N = 2048;
  const yc = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = aMin + (aMax - aMin) * i / (N - 1);
    yc[i] = a < 0 ? lift.yLoad + 0.004 * -a : a > lift.span ? lift.yRelease - 0.03 * (a - lift.span) : lift.heightAt(a);
  }
  const ycAt = (a) => { const f = (a - aMin) / (aMax - aMin) * (N - 1), i = Math.max(0, Math.min(N - 2, Math.floor(f))), t = f - i; return yc[i] + (yc[i + 1] - yc[i]) * t; };
  const tex = new THREE.DataTexture(yc, N, 1, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const SU = {
    uSlot: { value: tex }, uSlotA: { value: new THREE.Vector2(aMin, aMax) }, uSlotC: { value: new THREE.Vector3(lift.cx, lift.cz, lift.phiLoad) },
    uSlotHW: { value: HW },
  };
  const slotGLSL = /* glsl */`
    uniform sampler2D uSlot; uniform vec2 uSlotA; uniform vec3 uSlotC; uniform float uSlotHW;
    bool bm_inSlot(vec3 p) {
      float phi = atan(-(p.z - uSlotC.y), p.x - uSlotC.x);
      float a0 = phi - uSlotC.z;
      a0 = uSlotA.x + mod(a0 - uSlotA.x, 6.2831853);
      for (int k = 0; k < 9; k++) {
        float a = a0 + 6.2831853 * float(k);
        if (a > uSlotA.y) break;
        float y = texture2D(uSlot, vec2((a - uSlotA.x) / (uSlotA.y - uSlotA.x), 0.5)).r;
        if (abs(p.y - y) < uSlotHW) return true;
      }
      return false;
    }`;
  const inject = (sh) => {
    withWorldPos(sh);
    Object.assign(sh.uniforms, SU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + slotGLSL)
      .replace('void main() {', 'void main() {\n  if (bm_inSlot(vWPos)) discard;');
  };
  const barkMat = M.bark.clone();
  patch(barkMat, inject);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patch(depth, inject);
  barkMat.userData.depth = depth;
  const heartMat = M.heart.clone();
  patch(heartMat, inject);

  // inner shell: from the floor of the hollow to its ceiling
  const y0 = lift.yLoad - 0.12, y1 = lift.yRelease + 0.2;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(RIN, RIN, y1 - y0, 64, Math.ceil((y1 - y0) / 0.05), true), heartMat);
  inner.position.set(lift.cx, (y0 + y1) / 2, lift.cz);
  inner.receiveShadow = true;
  g.add(inner);
  for (const y of [y0, y1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(RIN + 0.01, 48), M.heart);
    cap.rotation.x = y === y0 ? -Math.PI / 2 : Math.PI / 2;
    cap.position.set(lift.cx, y, lift.cz);
    g.add(cap);
  }

  // the carved faces of the slot: its floor and ceiling, and its two ends
  const lp = [], ln = [], lu = [], li = [];
  const NA = Math.ceil((aMax - aMin) / 0.02);
  for (const side of [-1, 1]) {
    const b0 = lp.length / 3;
    for (let i = 0; i <= NA; i++) {
      const a = aMin + (aMax - aMin) * i / NA, phi = lift.phiLoad + a;
      const c = Math.cos(phi), s = -Math.sin(phi);
      const y = ycAt(a) + side * HW;
      const ro = radiusAt((y - base.y) / H, y) + 0.004;
      for (const r of [RIN - 0.002, ro]) {
        lp.push(lift.cx + c * r, y, lift.cz + s * r);
        ln.push(0, -side, 0);
        lu.push((r - RIN) * 6, a * 0.4);
      }
    }
    for (let i = 0; i < NA; i++) {
      const a = b0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (side > 0) li.push(a, b, c, b, d, c); else li.push(a, c, b, b, c, d);
    }
  }
  for (const a of [aMin, aMax]) {
    const phi = lift.phiLoad + a, c = Math.cos(phi), s = -Math.sin(phi), y = ycAt(a);
    const ro = radiusAt((y - base.y) / H, y) + 0.004;
    const b0 = lp.length / 3;
    const tn = a === aMin ? 1 : -1;                                     // faces into the slot
    for (const [r, yy] of [[RIN - 0.002, y - HW], [ro, y - HW], [RIN - 0.002, y + HW], [ro, y + HW]]) {
      lp.push(lift.cx + c * r, yy, lift.cz + s * r);
      ln.push(-Math.sin(phi) * tn, 0, -Math.cos(phi) * tn);
      lu.push(r * 4, yy * 4);
    }
    li.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2, b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
  lg.setIndex(li);
  const lips = new THREE.Mesh(lg, M.carved);
  lips.castShadow = true; lips.receiveShadow = true;
  g.add(lips);

  // helical rails under the ball, in the slot
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd9dee4, metalness: 1, roughness: 0.22 });
  const rr = BALL.railRadius * 0.9;
  const railG = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= NA; i++) {
      const a = aMin + (aMax - aMin) * i / NA, phi = lift.phiLoad + a;
      const r = lift.r + side * RAIL.lateral;
      pts.push(V(lift.cx + Math.cos(phi) * r, ycAt(a) - RAIL.drop, lift.cz - Math.sin(phi) * r));
    }
    railG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), NA, rr, 6, false));
  }
  for (const rg of railG) { const m = new THREE.Mesh(rg, railMat); m.castShadow = true; g.add(m); }

  // the turning shaft and its pusher bars
  const rot = new THREE.Group();
  rot.position.set(lift.cx, 0, lift.cz);
  rot.userData.dynamic = true;
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a94f, metalness: 1, roughness: 0.3 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.8, roughness: 0.4 });
  const shaftH = y1 - y0 - 0.02;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, shaftH, 16), iron);
  shaft.position.y = (y0 + y1) / 2;
  rot.add(shaft);
  const RB = lift.r - BALL.R - 0.012;
  for (let j = 0; j < lift.bars; j++) {
    const a = (j / lift.bars) * TAU;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, shaftH, 8), brass);
    bar.position.set(Math.cos(a) * RB, (y0 + y1) / 2, -Math.sin(a) * RB);
    rot.add(bar);
    for (let y = y0 + 0.1; y < y1; y += 0.62) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(RB, 0.012, 0.016), iron);
      arm.position.set(Math.cos(a) * RB / 2, y, -Math.sin(a) * RB / 2);
      arm.rotation.y = a;
      rot.add(arm);
    }
  }
  g.add(rot);
  updates.push(() => { rot.rotation.y = lift.phase; });
  return { barkMat };
}
