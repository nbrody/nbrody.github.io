// Glasshouse environment — the planting. Every plant is procedurally built and merged per
// material (one draw call per leaf type) with per-vertex sway weights; alpha-tested canvas
// leaf textures; a translucency term so backlit leaves glow.
import * as THREE from 'three';
import { GeoBuilder, Rng, tube, TAU, DEG, lerp, clamp } from './util.js';
import * as LY from './layout.js';
import { BARK_COLS, BARK_PAD } from './textures.js';

// ------------------------------------------------------------- shaders ---
const SWAY_PARS = /* glsl */`
attribute vec3 aSway;      // x: amplitude (m), y: phase, z: flutter (m)
uniform float uTime;
uniform float uSwayAmp;
vec3 ghSway(vec3 p) {
  float t = uTime;
  float ph = aSway.y;
  float w = aSway.x * uSwayAmp;
  float g = 0.6 + 0.4 * sin(t * 0.23 + p.x * 0.11 + p.z * 0.07);
  vec3 o;
  o.x = (sin(t * 0.83 + ph) + 0.4 * sin(t * 1.91 + ph * 1.7)) * w * g;
  o.z = (cos(t * 0.71 + ph * 1.31) + 0.35 * sin(t * 1.63 + ph * 0.73)) * w * g;
  o.y = sin(t * 2.3 + ph * 2.1 + p.x * 0.5) * aSway.z * uSwayAmp;
  return o;
}
`;
const TRANSLUCENT_PARS = /* glsl */`
uniform float uTrans;
uniform vec3 uTransColor;
void RE_Direct_Foliage( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = saturate( -dot( geometryNormal, directLight.direction ) );
  float fwd = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 4.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uTransColor * uTrans * ( back * 0.55 + fwd * 1.1 ) * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Foliage
`;

function injectSway(sh, U) {
  sh.uniforms.uTime = U.time;
  sh.uniforms.uSwayAmp = U.swayAmp;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + SWAY_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += ghSway(transformed);');
}

export function foliageMaterial(name, leaf, U, { roughness = 0.6, trans = 1.0, transColor = 0xb8d86a } = {}) {
  const m = new THREE.MeshStandardMaterial({
    name, map: leaf.map, alphaMap: leaf.alphaMap, alphaTest: 0.5, side: THREE.DoubleSide,
    roughness, metalness: 0, vertexColors: true,
  });
  m.alphaToCoverage = true;
  const tc = new THREE.Color(transColor);
  m.userData.trans = { value: trans };
  m.onBeforeCompile = (sh) => {
    injectSway(sh, U);
    sh.uniforms.uTrans = m.userData.trans;
    sh.uniforms.uTransColor = { value: tc };
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + TRANSLUCENT_PARS);
  };
  m.customProgramCacheKey = () => 'gh.foliage.v1';
  return m;
}
function swayDepthMaterial(U) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => injectSway(sh, U);
  d.customProgramCacheKey = () => 'gh.swayDepth.v1';
  return d;
}

// ------------------------------------------------------------- helpers ---
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
const barkU = (col) => [col * 0.25 + BARK_PAD * 1.0, (col + 1) * 0.25 - BARK_PAD * 1.0];

/** Direction from yaw (radians, around y) and pitch (radians above horizontal). */
function dirYP(yaw, pitch, out = V()) {
  return out.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
}

/**
 * Arching leaf spine: pitch decreases along the length (cantilever-like curvature).
 * Returns {pts, tans}.
 */
function arcSpine(origin, yaw, pitch0, length, bend, segs = 14) {
  const pts = [origin.clone()], tans = [];
  const p = origin.clone();
  const ds = length / segs;
  const pitchAt = (s) => pitch0 - bend * (0.3 * s + 0.5 * s * s) / 0.8;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const d = dirYP(yaw, pitchAt(s));
    tans.push(d);
    if (i < segs) {
      const dm = dirYP(yaw, pitchAt(s + 0.5 / segs));
      p.addScaledVector(dm, ds);
      pts.push(p.clone());
    }
  }
  return { pts, tans };
}

/** Leaf strip along a spine with a V-fold and twist. */
function leafStrip(gb, spine, yaw, {
  width, fold = 0, twist = 0, cols = 2, v0 = 0, v1 = 1, u0 = 0, u1 = 1,
  sway = () => [0, 0, 0], color = () => [1, 1, 1], normalUp = 0.35, flipU = false,
}) {
  const { pts, tans } = spine;
  const n = pts.length;
  const side0 = V(-Math.sin(yaw), 0, Math.cos(yaw));
  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const T = tans[i];
    const S = side0.clone().addScaledVector(T, -side0.dot(T)).normalize();
    let U = V().crossVectors(S, T).normalize();
    if (twist) {
      _q.setFromAxisAngle(T, twist * t);
      S.applyQuaternion(_q); U.applyQuaternion(_q);
    }
    const hw = width(t) / 2;
    const [sw, ph, fl] = sway(t);
    const [cr, cg, cb] = color(t);
    gb.set('aSway', sw, ph, fl);
    gb.set('color', cr, cg, cb);
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      const f = fold * Math.min(1, Math.abs(s) * 1.0);
      const lat = Math.cos(f) * s * hw, vert = Math.sin(f) * Math.abs(s) * hw;
      const px = pts[i].x + S.x * lat + U.x * vert, py = pts[i].y + S.y * lat + U.y * vert, pz = pts[i].z + S.z * lat + U.z * vert;
      // normal of the tilted half, blended toward "up" for soft foliage shading
      const sg = Math.sign(s);
      let nx = U.x * Math.cos(f) - S.x * Math.sin(f) * sg, ny = U.y * Math.cos(f) - S.y * Math.sin(f) * sg, nz = U.z * Math.cos(f) - S.z * Math.sin(f) * sg;
      nx += normalUp * 0.0; ny += normalUp; nz += 0;
      const l = Math.hypot(nx, ny, nz) || 1;
      let uu = lerp(u0, u1, (s + 1) / 2);
      if (flipU) uu = u0 + u1 - uu;
      row.push(gb.v(px, py, pz, nx / l, ny / l, nz / l, uu, lerp(v0, v1, t)));
    }
    rows.push(row);
  }
  for (let i = 0; i < n - 1; i++) for (let c = 0; c < cols; c++) gb.quad(rows[i][c], rows[i][c + 1], rows[i + 1][c + 1], rows[i + 1][c]);
}

/** Planar card (grid) with local axes; uv from 0..1. */
export function card(gb, center, ax, ay, w, h, { segX = 1, segY = 2, bend = 0, normal = null, u0 = 0, u1 = 1, v0 = 0, v1 = 1, anchorBottom = false, sway = () => [0, 0, 0], color = () => [1, 1, 1] }) {
  const N = normal || V().crossVectors(ax, ay).normalize();
  const rows = [];
  for (let j = 0; j <= segY; j++) {
    const ty = j / segY;
    const row = [];
    for (let i = 0; i <= segX; i++) {
      const tx = i / segX;
      const x = (tx - 0.5) * w;
      const y = anchorBottom ? ty * h : (ty - 0.5) * h;
      const bz = bend * ((anchorBottom ? ty : Math.abs(ty - 0.5) * 2) ** 2) * h;
      const p = center.clone().addScaledVector(ax, x).addScaledVector(ay, y).addScaledVector(N, -bz);
      const [sw, ph, fl] = sway(ty, tx);
      const [cr, cg, cb] = color(ty, tx);
      gb.set('aSway', sw, ph, fl);
      gb.set('color', cr, cg, cb);
      const nn = N.clone().addScaledVector(ay, bend * ty * 0.8).normalize();
      row.push(gb.v(p.x, p.y, p.z, nn.x, nn.y + 0.25, nn.z, lerp(u0, u1, tx), lerp(v0, v1, ty)));
    }
    rows.push(row);
  }
  for (let j = 0; j < segY; j++) for (let i = 0; i < segX; i++) gb.quad(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
}

/** Checks a spine (+ lateral extents) against the keep-out volumes. */
function spineOK(spine, yaw, halfW) {
  const side = V(-Math.sin(yaw), 0, Math.cos(yaw));
  for (let i = 0; i < spine.pts.length; i++) {
    const p = spine.pts[i];
    if (!LY.foliageAllowed(p.x, p.y, p.z)) return false;
    if (halfW > 0.1) {
      if (!LY.foliageAllowed(p.x + side.x * halfW, p.y, p.z + side.z * halfW)) return false;
      if (!LY.foliageAllowed(p.x - side.x * halfW, p.y, p.z - side.z * halfW)) return false;
    }
  }
  return true;
}

// -------------------------------------------------------------- species ---
class Planter {
  constructor(seed, stats) {
    this.rng = new Rng(seed);
    const ex = { color: 3, aSway: 3 };
    this.G = {
      trunk: new GeoBuilder(ex), pinnate: new GeoBuilder(ex), fan: new GeoBuilder(ex), banana: new GeoBuilder(ex),
      fern: new GeoBuilder(ex), monstera: new GeoBuilder(ex), strelitzia: new GeoBuilder(ex), bird: new GeoBuilder(ex),
      bougainvillea: new GeoBuilder(ex), hibiscus: new GeoBuilder(ex), shrub: new GeoBuilder(ex), clump: new GeoBuilder(ex),
      // ground cover: same materials, but excluded from the shadow pass (cheap, hardly visible)
      fernGround: new GeoBuilder(ex), clumpGround: new GeoBuilder(ex), shrubGround: new GeoBuilder(ex),
    };
    this.trunks = [];   // [x, z, r] for ground-cover exclusion
    this.stats = stats;
  }

  /** Try a frond with retries (yaw nudges, then shortening). */
  frond(gb, origin, yaw, pitch, len, bend, halfW, build) {
    for (let k = 0; k < 7; k++) {
      const y = yaw + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.28);
      const l = len * (k > 4 ? 0.75 : 1);
      const sp = arcSpine(origin, y, pitch, l, bend);
      if (spineOK(sp, y, halfW * (k > 4 ? 0.75 : 1))) { build(sp, y, l); return true; }
    }
    this.stats.rejected++;
    return false;
  }

  trunkTube(pts, rFn, col, { tint = [1, 1, 1], sway = 0.02, phase = 0, sides = 10, vScale = 1 / 3 } = {}) {
    const g = this.G.trunk;
    const [u0, u1] = barkU(col);
    const y0 = pts[0].y, y1 = pts[pts.length - 1].y;
    // tube() takes a single set() for extra attrs; emulate per-ring sway by building rings manually
    const base = g.vcount;
    tube(g, pts, rFn, { sides, u0, u1, vScale, capEnd: true });
    // patch aSway / color for the vertices just added (height-weighted sway)
    const E = g.E.aSway, C = g.E.color;
    for (let v = base; v < g.vcount; v++) {
      const y = g.P[v * 3 + 1];
      const h = clamp((y - y0) / Math.max(0.01, y1 - y0), 0, 1);
      E[v * 3] = sway * h * h; E[v * 3 + 1] = phase; E[v * 3 + 2] = 0;
      const ao = 0.75 + 0.25 * Math.min(1, h * 3);
      C[v * 3] = tint[0] * ao; C[v * 3 + 1] = tint[1] * ao; C[v * 3 + 2] = tint[2] * ao;
    }
  }

  palm({ x, z, height, lean = [0, 0], fronds = 16, frondLen = 3.2, kind = 'kentia', trunkR = 0.15, dead = 0, crownSway = 0.035 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.06;
    const base = V(x, y0, z), top = V(x + lean[0], y0 + height, z + lean[1]);
    const ctrl = V(x + lean[0] * 0.12, y0 + height * 0.55, z + lean[1] * 0.12);
    const pts = [];
    const segs = Math.max(8, Math.round(height * 2.2));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, u = 1 - t;
      pts.push(V(u * u * base.x + 2 * u * t * ctrl.x + t * t * top.x, u * u * base.y + 2 * u * t * ctrl.y + t * t * top.y, u * u * base.z + 2 * u * t * ctrl.z + t * t * top.z));
    }
    const phase = rng.range(0, TAU);
    const tint = kind === 'phoenix' ? [0.95, 0.9, 0.82] : [1, 1, 1];
    this.trunkTube(pts, (t) => trunkR * (t < 0.06 ? lerp(1.55, 1.05, t / 0.06) : lerp(1.05, 0.78, (t - 0.06) / 0.94)) * (t > 0.96 ? 1.18 : 1), BARK_COLS.palm, { tint, sway: crownSway, phase });
    this.trunks.push([x, z, trunkR * 2.2]);
    // crown boss
    const gbT = this.G.trunk;
    const crown = top.clone();
    const g = this.G.pinnate;
    const tipLean = V(lean[0], 0, lean[1]).multiplyScalar(0.05);
    for (let i = 0; i < fronds + dead; i++) {
      const isDead = i >= fronds;
      const age = isDead ? 1 : i / Math.max(1, fronds - 1);
      const yaw = i * 137.5 * DEG + rng.range(-0.25, 0.25);
      const pitch = isDead ? rng.range(-75, -55) * DEG : lerp(72, -18, Math.pow(age, 0.85)) * DEG + rng.range(-8, 8) * DEG;
      const bend = isDead ? 0.3 : lerp(0.25, 1.35, age) * rng.range(0.85, 1.15);
      const len = frondLen * (isDead ? 0.8 : lerp(0.72, 1.0, Math.min(1, age * 2.5))) * rng.range(0.9, 1.08);
      const W = len * (kind === 'phoenix' ? 0.3 : 0.36);
      const fold = kind === 'phoenix' ? 0.5 : -0.45 - age * 0.25;
      const origin = crown.clone().add(dirYP(yaw, 0).multiplyScalar(trunkR * 0.6)).add(tipLean);
      const tint = isDead ? [0.78, 0.62, 0.36] : age > 0.85 ? [0.95, 0.92, 0.7] : [rng.range(0.9, 1.05), rng.range(0.95, 1.05), rng.range(0.85, 1.0)];
      const fph = phase + i * 0.7;
      this.frond(g, origin, yaw, pitch, len, bend, W / 2, (sp, y) => {
        leafStrip(g, sp, y, {
          width: (t) => W * (t < 0.08 ? 0.35 + t * 8 : 1), fold, twist: rng.range(-0.25, 0.25),
          sway: (t) => [crownSway + 0.055 * Math.pow(t, 1.5), fph, 0.018 * t],
          color: (t) => { const ao = lerp(0.55, 1.0, Math.min(1, t * 3)); return [tint[0] * ao, tint[1] * ao, tint[2] * ao]; },
          normalUp: 0.4,
        });
      });
    }
    void gbT;
  }

  fanPalm({ x, z, height, leaves = 14, trunkR = 0.17, lean = [0, 0] }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.06;
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V(x + lean[0] * t * t, y0 + height * t, z + lean[1] * t * t)); }
    const phase = rng.range(0, TAU);
    this.trunkTube(pts, (t) => trunkR * (t < 0.06 ? 1.4 : 1.0) * lerp(1, 0.85, t), BARK_COLS.palm, { tint: [0.85, 0.78, 0.66], sway: 0.025, phase });
    this.trunks.push([x, z, trunkR * 2.2]);
    const top = pts[pts.length - 1];
    for (let i = 0; i < leaves; i++) {
      const age = i / (leaves - 1);
      const yaw = i * 137.5 * DEG;
      const pitch = lerp(65, 5, age) * DEG;
      const petL = rng.range(0.9, 1.5);
      const dir = dirYP(yaw, pitch);
      const end = top.clone().addScaledVector(dir, petL);
      if (!LY.foliageAllowed(end.x, end.y, end.z)) { this.stats.rejected++; continue; }
      // petiole
      const pp = [top.clone(), top.clone().addScaledVector(dir, petL * 0.5).add(V(0, 0.05, 0)), end];
      this.stemTube(pp, 0.025, [0.8, 0.8, 0.6], 0.02 + 0.02 * age, phase + i);
      // blade: plane with normal tilted up/outward
      const R = rng.range(0.75, 0.95);
      const fwd = dirYP(yaw, pitch + lerp(20, -35, age) * DEG);      // continuation (leaf "up" in texture)
      const lat = V(-Math.sin(yaw), 0, Math.cos(yaw));
      const nrm = V().crossVectors(lat, fwd).normalize();
      const center = end;
      if (!LY.foliageAllowed(center.x + fwd.x * R, center.y + fwd.y * R, center.z + fwd.z * R)) { this.stats.rejected++; continue; }
      const g = this.G.fan;
      const nA = 20, nR = 5, span = 135 * DEG;
      const ids = [];
      const fph = phase + i * 0.9;
      for (let a = 0; a <= nA; a++) {
        const al = -span + (2 * span * a) / nA;
        const row = [];
        for (let r = 0; r <= nR; r++) {
          const rr = r / nR;
          const pleat = (a % 2 ? 1 : -1) * 0.06 * rr * R;
          const droop = -0.28 * rr * rr * R * (0.6 + 0.4 * Math.abs(Math.sin(al)));
          const lx = Math.sin(al) * rr * R, ly = Math.cos(al) * rr * R;
          const p = center.clone().addScaledVector(lat, lx).addScaledVector(fwd, ly).addScaledVector(nrm, pleat + droop);
          g.set('aSway', 0.03 + 0.05 * rr, fph, 0.012 * rr);
          const ao = lerp(0.75, 1.0, rr);
          g.set('color', ao, ao, ao * 0.95);
          const n = nrm.clone().addScaledVector(lat, (a % 2 ? 0.25 : -0.25) * rr).normalize();
          row.push(g.v(p.x, p.y, p.z, n.x, n.y + 0.3, n.z, 0.5 + 0.46 * Math.sin(al) * rr, 0.38 + 0.46 * Math.cos(al) * rr));
        }
        ids.push(row);
      }
      for (let a = 0; a < nA; a++) for (let r = 0; r < nR; r++) g.quad(ids[a][r], ids[a + 1][r], ids[a + 1][r + 1], ids[a][r + 1]);
    }
  }

  stemTube(pts, r, tint, sway, phase) {
    const g = this.G.trunk;
    const [u0, u1] = barkU(BARK_COLS.stem);
    const base = g.vcount;
    tube(g, pts, (t) => r * lerp(1.1, 0.8, t), { sides: 5, u0, u1, vScale: 1 / 3 });
    const E = g.E.aSway, C = g.E.color;
    const n = g.vcount - base, rows = pts.length;
    for (let v = base; v < g.vcount; v++) {
      const row = Math.floor((v - base) / (n / rows));
      const t = row / Math.max(1, rows - 1);
      E[v * 3] = sway * t; E[v * 3 + 1] = phase; E[v * 3 + 2] = 0;
      C[v * 3] = tint[0]; C[v * 3 + 1] = tint[1]; C[v * 3 + 2] = tint[2];
    }
  }

  banana({ x, z, height, leaves = 8 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.05;
    const lean = [rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)];
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(x + lean[0] * t * t, y0 + height * t, z + lean[1] * t * t)); }
    const phase = rng.range(0, TAU);
    const r0 = rng.range(0.11, 0.15);
    this.trunkTube(pts, (t) => r0 * lerp(1.25, 0.72, t), BARK_COLS.banana, { sway: 0.03, phase, sides: 9, vScale: 1 / 3 });
    this.trunks.push([x, z, r0 * 2]);
    const top = pts[pts.length - 1];
    const g = this.G.banana;
    for (let i = 0; i < leaves; i++) {
      const age = i / (leaves - 1);
      const yaw = i * 137.5 * DEG + rng.range(-0.2, 0.2);
      const pitch = lerp(78, 22, age) * DEG + rng.range(-6, 6) * DEG;
      const len = rng.range(1.5, 2.2) * lerp(0.8, 1, Math.min(1, age * 3));
      const W = len * rng.range(0.3, 0.36);
      const bend = lerp(0.35, 1.6, age) * rng.range(0.85, 1.15);
      const origin = top.clone().add(V(0, -0.1 * age, 0));
      const tint = age > 0.88 ? [0.9, 0.85, 0.55] : [rng.range(0.9, 1.05), 1, rng.range(0.85, 1)];
      const fph = phase + i;
      this.frond(g, origin, yaw, pitch, len, bend, W / 2, (sp, y) => {
        leafStrip(g, sp, y, {
          width: (t) => W * (t < 0.05 ? 0.2 : 1), fold: -0.32, twist: rng.range(-0.4, 0.4), cols: 4,
          sway: (t) => [0.03 + 0.06 * Math.pow(t, 1.5), fph, 0.02 * t],
          color: (t) => { const ao = lerp(0.65, 1.0, Math.min(1, t * 2.5)); return [tint[0] * ao, tint[1] * ao, tint[2] * ao]; },
          normalUp: 0.3, flipU: rng.chance(0.5),
        });
      });
    }
  }

  treeFern({ x, z, height, fronds = 16 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.05;
    const lean = [rng.range(-0.35, 0.35), rng.range(-0.35, 0.35)];
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(x + lean[0] * t * t, y0 + height * t, z + lean[1] * t * t)); }
    const phase = rng.range(0, TAU);
    const r0 = rng.range(0.15, 0.2);
    this.trunkTube(pts, (t) => r0 * (t < 0.1 ? 1.35 : 1) * lerp(1.05, 0.95, t) * (t > 0.95 ? 1.3 : 1), BARK_COLS.fern, { sway: 0.015, phase, sides: 10, vScale: 1 / 3 });
    this.trunks.push([x, z, r0 * 2.2]);
    const top = pts[pts.length - 1];
    const g = this.G.fern;
    for (let i = 0; i < fronds; i++) {
      const age = i / (fronds - 1);
      const yaw = i * 137.5 * DEG + rng.range(-0.2, 0.2);
      const pitch = lerp(62, 18, age) * DEG + rng.range(-6, 6) * DEG;
      const len = rng.range(1.7, 2.5);
      const W = len * rng.range(0.28, 0.33);
      const bend = lerp(0.6, 1.5, age) * rng.range(0.85, 1.15);
      const origin = top.clone().add(dirYP(yaw, 0).multiplyScalar(r0 * 0.8));
      const tint = [rng.range(0.9, 1.05), rng.range(0.95, 1.05), rng.range(0.85, 1)];
      const fph = phase + i * 0.8;
      this.frond(g, origin, yaw, pitch, len, bend, W / 2, (sp, y) => {
        leafStrip(g, sp, y, {
          width: (t) => W * (t < 0.06 ? 0.4 + t * 10 : 1), fold: 0.12, twist: rng.range(-0.3, 0.3),
          sway: (t) => [0.015 + 0.045 * Math.pow(t, 1.5), fph, 0.015 * t],
          color: (t) => { const ao = lerp(0.6, 1.0, Math.min(1, t * 2.5)); return [tint[0] * ao, tint[1] * ao, tint[2] * ao]; },
          normalUp: 0.45,
        });
      });
    }
  }

  monstera({ x, z, leaves = 7 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.03;
    const phase = rng.range(0, TAU);
    const out = V(x, 0, z).normalize().negate();          // toward the walkway / viewer
    const g = this.G.monstera;
    for (let i = 0; i < leaves; i++) {
      const yaw = Math.atan2(out.z, out.x) + rng.range(-1.9, 1.9);
      const hgt = rng.range(0.45, 1.35);
      const reach = rng.range(0.25, 0.8);
      const d = V(Math.cos(yaw), 0, Math.sin(yaw));
      const tip = V(x + d.x * reach, y0 + hgt, z + d.z * reach);
      const mid = V(x + d.x * reach * 0.3, y0 + hgt * 0.75, z + d.z * reach * 0.3);
      if (!LY.foliageAllowed(tip.x, tip.y, tip.z)) { this.stats.rejected++; continue; }
      this.stemTube([V(x, y0, z), mid, tip], 0.014, [0.85, 0.95, 0.75], 0.012, phase + i);
      const size = rng.range(0.42, 0.72);
      // blade faces up/out; leaf "up" (tip direction) points outward & slightly down
      const tilt = rng.range(25, 55) * DEG;
      const fwd = V(d.x * Math.cos(-tilt), Math.sin(-tilt) + 0.15, d.z * Math.cos(-tilt)).normalize();
      const lat = V(-d.z, 0, d.x);
      const nrm = V().crossVectors(lat, fwd).normalize();
      if (nrm.y < 0) nrm.negate();
      const n = 4;
      const rows = [];
      const fph = phase + i * 1.3;
      for (let j = 0; j <= n; j++) {
        const vy = j / n;
        const row = [];
        for (let k = 0; k <= n; k++) {
          const ux = k / n;
          const lx = (ux - 0.5) * size, ly = (vy - 0.12) * size;
          const cup = -0.18 * size * ((ux - 0.5) ** 2 * 2 + Math.max(0, vy - 0.5) ** 2 * 1.2) + 0.03 * size * Math.abs(ux - 0.5);
          const p = tip.clone().addScaledVector(lat, lx).addScaledVector(fwd, ly).addScaledVector(nrm, cup);
          g.set('aSway', 0.01 + 0.025 * vy, fph, 0.01 * vy);
          const ao = 0.85 + 0.15 * vy;
          g.set('color', ao, ao, ao);
          const nn = nrm.clone().addScaledVector(lat, (ux - 0.5) * 0.8).normalize();
          row.push(g.v(p.x, p.y, p.z, nn.x, nn.y + 0.2, nn.z, ux, vy));
        }
        rows.push(row);
      }
      for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) g.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
    }
    this.trunks.push([x, z, 0.3]);
  }

  strelitzia({ x, z, leaves = 10, flowers = 3 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.03;
    const phase = rng.range(0, TAU);
    const fanYaw = rng.range(0, TAU);
    const fanDir = V(Math.cos(fanYaw), 0, Math.sin(fanYaw));
    const g = this.G.strelitzia;
    for (let i = 0; i < leaves; i++) {
      const spread = lerp(-38, 38, i / (leaves - 1)) * DEG + rng.range(-5, 5) * DEG;
      const petL = rng.range(0.55, 1.05);
      const dir = V(fanDir.x * Math.sin(spread), Math.cos(spread), fanDir.z * Math.sin(spread)).normalize();
      const mid = V(x, y0, z).addScaledVector(dir, petL * 0.5);
      const end = V(x, y0, z).addScaledVector(dir, petL);
      this.stemTube([V(x, y0, z), mid, end], 0.012, [0.8, 0.9, 0.7], 0.012, phase + i);
      const bl = rng.range(0.34, 0.52);
      const yaw = Math.atan2(dir.z, dir.x);
      const pitch = Math.asin(clamp(dir.y, -1, 1));
      const sp = arcSpine(end, Math.abs(Math.sin(spread)) < 0.05 ? fanYaw : yaw, pitch, bl, 0.5, 6);
      if (!spineOK(sp, yaw, 0.1)) { this.stats.rejected++; continue; }
      leafStrip(g, sp, fanYaw - Math.PI / 2, {       // blade lies in the fan plane
        width: () => bl * 0.42, fold: 0.18, cols: 2,
        sway: (t) => [0.012 + 0.02 * t, phase + i, 0.008 * t],
        color: (t) => { const a = lerp(0.8, 1, t); return [a, a, a]; }, normalUp: 0.3,
      });
    }
    for (let f = 0; f < flowers; f++) {
      const h = rng.range(0.85, 1.25);
      const off = V(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15));
      const top = V(x + off.x, y0 + h, z + off.z);
      this.stemTube([V(x, y0, z), V(x + off.x * 0.5, y0 + h * 0.5, z + off.z * 0.5), top], 0.01, [0.75, 0.85, 0.65], 0.015, phase + f);
      const yaw = rng.range(0, TAU);
      for (let c = 0; c < 2; c++) {
        const a = yaw + c * Math.PI / 2;
        const ax = V(Math.cos(a), 0, Math.sin(a));
        card(this.G.bird, top.clone().add(V(0, 0.03, 0)), ax, V(0, 1, 0), 0.3, 0.3, { segX: 1, segY: 1, sway: () => [0.02, phase + f, 0.01] });
      }
    }
    this.trunks.push([x, z, 0.25]);
  }

  shrub({ x, z, kind = 'bougainvillea', size = 1.0, height = 1.3 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.03;
    const g = this.G[kind];
    const phase = rng.range(0, TAU);
    const rx = size, ry = height / 2, cy = y0 + ry * 0.95;
    const n = Math.round(22 + size * 16);
    for (let i = 0; i < n; i++) {
      // points on an upper-biased ellipsoid
      const u = rng.range(-0.35, 1), a = rng.range(0, TAU);
      const r = Math.sqrt(1 - u * u);
      const dir = V(Math.cos(a) * r, u, Math.sin(a) * r);
      const inset = rng.range(0.55, 0.95);
      const c = V(x + dir.x * rx * inset, cy + dir.y * ry * inset, z + dir.z * rx * inset);
      if (!LY.foliageAllowed(c.x, c.y, c.z)) continue;
      const w = rng.range(0.5, 0.8) * Math.min(1.2, 0.6 + size * 0.4);
      const nrm = dir.clone().add(V(rng.range(-0.4, 0.4), rng.range(-0.2, 0.4), rng.range(-0.4, 0.4))).normalize();
      const ax = V().crossVectors(V(0, 1, 0), nrm);
      if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0);
      ax.normalize();
      const ay = V().crossVectors(nrm, ax).normalize();
      const roll = rng.range(0, TAU);
      _q.setFromAxisAngle(nrm, roll);
      ax.applyQuaternion(_q); ay.applyQuaternion(_q);
      const ao = lerp(0.55, 1.0, clamp((dir.y + 0.35) / 1.35, 0, 1)) * inset;
      card(g, c, ax, ay, w, w, { segX: 1, segY: 1, normal: nrm, sway: () => [0.012 + 0.012 * size, phase + i * 0.3, 0.006], color: () => [ao, ao, ao * 0.95] });
    }
    this.trunks.push([x, z, size * 0.6]);
  }

  climber({ k, kind = 'bougainvillea', top = 5.2 }) {
    const rng = this.rng;
    const th = LY.vertexAngle(k);
    const r = LY.CIRCUM - 0.34;
    const g = this.G[kind];
    const phase = rng.range(0, TAU);
    const rad = V(Math.cos(th), 0, Math.sin(th));
    const tan = V(-Math.sin(th), 0, Math.cos(th));
    for (let y = 1.0; y < top; y += 0.2) {
      const spreadT = 0.25 + 0.5 * Math.sin(((y - 1) / (top - 1)) * Math.PI);
      for (let s = 0; s < 2; s++) {
        const c = V(rad.x * (r - rng.range(0, 0.25)), y + rng.range(-0.1, 0.1), rad.z * (r - rng.range(0, 0.25))).addScaledVector(tan, rng.range(-spreadT, spreadT));
        const nrm = rad.clone().negate().addScaledVector(tan, rng.range(-0.6, 0.6)).add(V(0, rng.range(-0.2, 0.4), 0)).normalize();
        const ax = V().crossVectors(V(0, 1, 0), nrm).normalize();
        const ay = V().crossVectors(nrm, ax).normalize();
        _q.setFromAxisAngle(nrm, rng.range(0, TAU));
        ax.applyQuaternion(_q); ay.applyQuaternion(_q);
        const w = rng.range(0.45, 0.7);
        const ao = lerp(0.7, 1.0, (y - 1) / (top - 1));
        card(g, c, ax, ay, w, w, { segX: 1, segY: 1, normal: nrm, sway: () => [0.01, phase + y, 0.006], color: () => [ao, ao, ao] });
      }
    }
    // cascade along the gallery edge above
    for (let i = 0; i < 10; i++) {
      const t = rng.range(-1.5, 1.5);
      const c = V(rad.x * (LY.CIRCUM - 1.2), rng.range(8.5, 9.2), rad.z * (LY.CIRCUM - 1.2)).addScaledVector(tan, t);
      const nrm = rad.clone().negate().add(V(0, -0.3, 0)).normalize();
      const ax = V().crossVectors(V(0, 1, 0), nrm).normalize();
      const ay = V().crossVectors(nrm, ax).normalize();
      const w = rng.range(0.5, 0.7);
      card(g, c, ax, ay, w, w, { segX: 1, segY: 1, normal: nrm, sway: () => [0.015, phase + i, 0.006] });
    }
  }

  fernClump({ x, z, fronds = 7, size = 1 }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.02;
    const g = this.G.fernGround;
    const phase = rng.range(0, TAU);
    for (let i = 0; i < fronds; i++) {
      const yaw = (i / fronds) * TAU + rng.range(-0.3, 0.3);
      const len = rng.range(0.5, 0.85) * size;
      const sp = arcSpine(V(x, y0, z), yaw, rng.range(45, 72) * DEG, len, rng.range(1.0, 1.7), 6);
      if (!spineOK(sp, yaw, 0.1)) continue;
      const tint = [rng.range(0.95, 1.1), rng.range(1.0, 1.1), rng.range(0.85, 1.0)];
      leafStrip(g, sp, yaw, {
        width: () => len * 0.28, fold: 0.1, twist: rng.range(-0.3, 0.3), cols: 1,
        sway: (t) => [0.012 * t, phase + i, 0.01 * t],
        color: (t) => { const a = lerp(0.6, 1.05, t); return [tint[0] * a, tint[1] * a, tint[2] * a]; }, normalUp: 0.5,
      });
    }
  }

  clumpCards({ x, z, size = 0.8, kind = 'clump' }) {
    const rng = this.rng;
    const y0 = LY.soilHeight(x, z) - 0.04;
    const g = this.G[kind + 'Ground'];
    const phase = rng.range(0, TAU);
    const n = 3;
    const yaw0 = rng.range(0, Math.PI);
    for (let i = 0; i < n; i++) {
      const a = yaw0 + (i / n) * Math.PI;
      const ax = V(Math.cos(a), 0, Math.sin(a));
      const w = size * rng.range(0.85, 1.1);
      card(g, V(x, y0, z), ax, V(0, 1, 0), w, w, {
        segX: 2, segY: 2, anchorBottom: true, bend: 0.15,
        normal: V(-ax.z, 0.35, ax.x).normalize(),
        sway: (ty) => [0.012 * ty, phase + i, 0.006 * ty], color: (ty) => { const a2 = lerp(0.55, 1.0, ty); return [a2, a2, a2]; },
      });
    }
  }
}

// ================================================================ layout ===
const polar = (deg, r) => [Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r];

export function buildPlants(tex, U, { seed = 11, density = 1 } = {}) {
  const stats = { rejected: 0 };
  const P = new Planter(seed, stats);
  const rng = new Rng(seed + 1);

  // hero palms (kentia): [angle°, base r, height, crown lean inward (m), frond length]
  const tall = [[18, 11.9, 11.2, 1.7, 3.6], [64, 11.6, 8.8, 1.3, 3.3], [118, 11.8, 10.2, 1.5, 3.5], [158, 12.0, 8.4, 1.1, 3.2],
    [204, 11.9, 11.8, 1.8, 3.7], [243, 11.5, 9.4, 1.4, 3.3], [298, 11.9, 10.8, 1.6, 3.6], [336, 11.4, 8.6, 1.2, 3.2]];
  for (const [deg, r, h, leanIn, fl] of tall) {
    const [x, z] = polar(deg, r);
    const tanJ = rng.range(-0.6, 0.6);
    const inward = V(-x, 0, -z).normalize();
    const tangent = V(-inward.z, 0, inward.x);
    P.palm({ x, z, height: h, lean: [inward.x * leanIn + tangent.x * tanJ, inward.z * leanIn + tangent.z * tanJ], fronds: 17, frondLen: fl, kind: 'kentia', trunkR: 0.14, dead: rng.int(0, 2), crownSway: 0.04 });
  }
  // medium palms (phoenix-like)
  const mid = [[40, 10.3, 5.2], [100, 12.0, 4.4], [80, 12.1, 3.8], [141, 10.4, 6.2], [183, 10.8, 4.8], [226, 10.2, 5.8], [262, 12.1, 4.2], [278, 12.0, 4.8], [318, 10.4, 5.4], [356, 10.6, 4.6]];
  for (const [deg, r, h] of mid) {
    const [x, z] = polar(deg + rng.range(-2, 2), r);
    const inward = V(-x, 0, -z).normalize();
    P.palm({ x, z, height: h, lean: [inward.x * 0.6 + rng.range(-0.4, 0.4), inward.z * 0.6 + rng.range(-0.4, 0.4)], fronds: 15, frondLen: rng.range(2.3, 2.9), kind: 'phoenix', trunkR: 0.17, crownSway: 0.03 });
  }
  // fan palms
  for (const [deg, r, h] of [[30, 12.3, 5.2], [172, 12.3, 4.4], [312, 12.2, 5.6]]) {
    const [x, z] = polar(deg, r);
    const inward = V(-x, 0, -z).normalize();
    P.fanPalm({ x, z, height: h, leaves: 14, lean: [inward.x * 0.5, inward.z * 0.5] });
  }
  // bananas
  for (const [deg, r] of [[6, 10.0], [52, 10.6], [128, 10.4], [194, 12.1], [233, 11.6], [329, 11.8], [285, 9.8]]) {
    const [x, z] = polar(deg + rng.range(-3, 3), r);
    P.banana({ x, z, height: rng.range(2.4, 3.6), leaves: rng.int(7, 9) });
    if (rng.chance(0.6)) { const [x2, z2] = polar(deg + rng.range(3, 6), r + rng.range(-0.6, 0.6)); P.banana({ x: x2, z: z2, height: rng.range(1.2, 2.0), leaves: 6 }); }
  }
  // tree ferns
  for (const [deg, r] of [[27, 9.4], [74, 9.6], [151, 9.3], [213, 9.6], [254, 9.5], [292, 11.2], [346, 9.3], [110, 9.8]]) {
    const [x, z] = polar(deg + rng.range(-2, 2), r);
    P.treeFern({ x, z, height: rng.range(1.6, 3.4), fronds: rng.int(14, 18) });
  }
  // front-edge monstera & strelitzia (skip the path mouths)
  const frontSlots = [];
  for (let d = 0; d < 360; d += 13) {
    if (Math.abs(((d - 90 + 540) % 360) - 180) > 164 || Math.abs(((d - 270 + 540) % 360) - 180) > 164) continue;
    frontSlots.push(d);
  }
  frontSlots.forEach((d, i) => {
    const [x, z] = polar(d + rng.range(-3, 3), rng.range(8.25, 8.85));
    if (!LY.inBeds(x, z, 0.3)) return;
    if (i % 3 === 0) P.strelitzia({ x, z, leaves: rng.int(8, 11), flowers: rng.int(2, 3) });
    else if (i % 3 === 1) P.monstera({ x, z, leaves: rng.int(6, 9) });
    else P.shrub({ x, z, kind: rng.pick(['shrub', 'hibiscus', 'shrub']), size: rng.range(0.55, 0.8), height: rng.range(0.8, 1.2) });
  });
  // shrubs in the middle / back
  for (let i = 0; i < 16; i++) {
    const d = (i / 16) * 360 + rng.range(-8, 8);
    const [x, z] = polar(d, rng.range(9.6, 12.4));
    if (!LY.inBeds(x, z, 0.6)) continue;
    if (P.trunks.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + 0.9)) continue;
    const kind = i % 3 === 0 ? 'bougainvillea' : i % 3 === 1 ? 'hibiscus' : 'shrub';
    P.shrub({ x, z, kind, size: rng.range(0.7, 1.1), height: rng.range(1.2, 2.0) });
  }
  // climbers on a few columns (away from the doors)
  for (const [k, kind] of [[1, 'bougainvillea'], [7, 'bougainvillea'], [10, 'hibiscus'], [15, 'bougainvillea']]) P.climber({ k, kind });

  // ground cover: jittered grid over the beds, avoiding trunks
  const step = 0.68 / Math.sqrt(density);
  for (let x = -LY.BED_OUTER; x <= LY.BED_OUTER; x += step) {
    for (let z = -LY.BED_OUTER; z <= LY.BED_OUTER; z += step) {
      const px = x + rng.range(-0.3, 0.3) * step, pz = z + rng.range(-0.3, 0.3) * step;
      if (!LY.inBeds(px, pz, 0.12)) continue;
      if (P.trunks.some(([tx, tz, tr]) => Math.hypot(tx - px, tz - pz) < tr + 0.25)) continue;
      const roll = rng.next();
      if (roll < 0.5) P.fernClump({ x: px, z: pz, fronds: rng.int(5, 8), size: rng.range(0.8, 1.25) });
      else if (roll < 0.82) P.clumpCards({ x: px, z: pz, size: rng.range(0.55, 0.85) });
      else P.clumpCards({ x: px, z: pz, size: rng.range(0.45, 0.65), kind: 'shrub' });
    }
  }

  // ---- materials & meshes
  const L = tex.leaves;
  const mats = {
    pinnate: foliageMaterial('gh.leaf.palm', L.pinnate, U, { roughness: 0.55, trans: 1.0 }),
    fan: foliageMaterial('gh.leaf.fan', L.fan, U, { roughness: 0.55, trans: 0.9 }),
    banana: foliageMaterial('gh.leaf.banana', L.banana, U, { roughness: 0.5, trans: 1.3, transColor: 0xc6e07a }),
    fern: foliageMaterial('gh.leaf.fern', L.fern, U, { roughness: 0.65, trans: 1.1 }),
    monstera: foliageMaterial('gh.leaf.monstera', L.monstera, U, { roughness: 0.38, trans: 0.6 }),
    strelitzia: foliageMaterial('gh.leaf.strelitzia', L.strelitzia, U, { roughness: 0.45, trans: 0.7 }),
    bird: foliageMaterial('gh.flower.strelitzia', L.bird, U, { roughness: 0.5, trans: 0.8, transColor: 0xffc070 }),
    bougainvillea: foliageMaterial('gh.shrub.bougainvillea', L.bougainvillea, U, { roughness: 0.6, trans: 0.8, transColor: 0xe07ab0 }),
    hibiscus: foliageMaterial('gh.shrub.hibiscus', L.hibiscus, U, { roughness: 0.55, trans: 0.8 }),
    shrub: foliageMaterial('gh.shrub.plain', L.shrub, U, { roughness: 0.6, trans: 0.8 }),
    clump: foliageMaterial('gh.groundcover', L.clump, U, { roughness: 0.5, trans: 0.7 }),
  };
  const trunkMat = new THREE.MeshStandardMaterial({ name: 'gh.bark', map: tex.bark, roughness: 0.88, metalness: 0, vertexColors: true, bumpMap: tex.bark, bumpScale: 1.2 });
  trunkMat.onBeforeCompile = (sh) => injectSway(sh, U);
  trunkMat.customProgramCacheKey = () => 'gh.bark.v1';

  const group = new THREE.Group();
  group.name = 'glasshouse-plants';
  const meshes = {};
  const depthMats = [];
  let tris = 0;
  for (const key of Object.keys(P.G)) {
    const gb = P.G[key];
    if (gb.vcount === 0) continue;
    const geo = gb.build();
    tris += geo.index.count / 3;
    const ground = key.endsWith('Ground');
    const mat = key === 'trunk' ? trunkMat : mats[key.replace('Ground', '')];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `gh.plants.${key}`;
    mesh.castShadow = !ground;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    const dm = swayDepthMaterial(U);
    depthMats.push(dm);
    mesh.customDepthMaterial = dm;
    group.add(mesh);
    meshes[key] = mesh;
  }
  // materials that ended up unused still need disposal
  const allMats = [...Object.values(mats), trunkMat, ...depthMats];
  return { group, meshes, materials: allMats, stats: { ...stats, triangles: tris } };
}
