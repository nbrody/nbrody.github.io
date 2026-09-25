// Glasshouse environment — the building: floor, plinth, balustrade, beds, glazed walls,
// cast-iron columns, cornice & gallery, ribbed glass dome, lantern, lamp posts.
import * as THREE from 'three';
import { GeoBuilder, sweepSection, framesFromSide, tube, Rng, TAU, DEG, lerp, clamp } from './util.js';
import * as LY from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// ------------------------------------------------------------- materials ---
// Sunlit, slightly dirty glass scatters light forward: panes glow when you look toward the sun.
const GLASS_SCATTER = /* glsl */`
uniform float uScatter;
void RE_Direct_Glass( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float fwd = saturate( dot( -geometryViewDir, directLight.direction ) );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uScatter * ( pow( fwd, 8.0 ) * 0.45 + pow( fwd, 48.0 ) * 1.6 );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Glass
`;
function makeMaterials(tex, uniforms) {
  const M = {};
  M.iron = new THREE.MeshStandardMaterial({ name: 'gh.whiteIron', color: 0xf0ede4, roughness: 0.42, metalness: 0.0 });
  M.dark = new THREE.MeshStandardMaterial({ name: 'gh.darkIron', color: 0x1c2621, roughness: 0.42, metalness: 0.45 });
  M.brass = new THREE.MeshStandardMaterial({ name: 'gh.brass', color: 0xd0a85c, roughness: 0.26, metalness: 1.0 });
  M.stone = new THREE.MeshStandardMaterial({ name: 'gh.stone', map: tex.stone, roughness: 0.8, metalness: 0 });
  M.plinthTop = new THREE.MeshStandardMaterial({ name: 'gh.plinthTop', map: tex.plinthTop, roughness: 0.62, metalness: 0 });
  M.tiles = new THREE.MeshStandardMaterial({ name: 'gh.tiles', map: tex.tiles.map, roughnessMap: tex.tiles.roughnessMap, roughness: 1.0, metalness: 0 });
  M.grate = new THREE.MeshStandardMaterial({ name: 'gh.grate', map: tex.grate, roughness: 0.55, metalness: 0.5 });
  M.soil = new THREE.MeshStandardMaterial({ name: 'gh.soil', map: tex.soil, roughness: 0.95, metalness: 0 });
  M.lampGlass = new THREE.MeshStandardMaterial({ name: 'gh.lampGlass', color: 0xf3eee2, roughness: 0.35, metalness: 0, emissive: 0xffb866, emissiveIntensity: 0 });
  M.bulb = new THREE.MeshBasicMaterial({ name: 'gh.bulb', color: 0x8a867c });
  M.wire = new THREE.LineBasicMaterial({ name: 'gh.wire', color: 0x2a2a28 });

  // Glass: premultiplied output so reflections are not scaled by opacity.
  const glass = new THREE.MeshStandardMaterial({
    name: 'gh.glass', color: 0xd2e8de, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.095,
    depthWrite: false, side: THREE.DoubleSide, vertexColors: true, fog: false,
  });
  glass.forceSinglePass = true;
  glass.blending = THREE.CustomBlending;
  glass.blendSrc = THREE.OneFactor;
  glass.blendDst = THREE.OneMinusSrcAlphaFactor;
  glass.blendSrcAlpha = THREE.OneFactor;
  glass.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  glass.onBeforeCompile = (sh) => {
    sh.uniforms.uReflect = uniforms.glassReflect;
    sh.uniforms.uScatter = uniforms.glassScatter;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + GLASS_SCATTER)
      .replace('void main() {', 'uniform float uReflect;\nvoid main() {')
      .replace('#include <opaque_fragment>',
        'gl_FragColor = vec4( totalDiffuse * diffuseColor.a + totalSpecular * uReflect + totalEmissiveRadiance, diffuseColor.a );');
  };
  glass.customProgramCacheKey = () => 'gh.glass.v2';
  M.glass = glass;
  return M;
}

// --------------------------------------------------------- local helpers ---
/** Profile lathe with hard/smooth corners. profile: [[r, y, smooth?], ...] traversed top→bottom outside. */
function lathe(gb, profile, { segs = 48, cx = 0, cz = 0, a0 = 0, a1 = TAU, uRep = 1, vScale = 1, y0 = 0 } = {}) {
  const segN = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, yA] = profile[i], [r1, yB] = profile[i + 1];
    const dr = r1 - r0, dy = yB - yA;
    const l = Math.hypot(dr, dy) || 1;
    segN.push([-dy / l, dr / l, l]);
  }
  let vAcc = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const nS = segN[i];
    const nAt = (k, end) => {
      const smooth = profile[k][2];
      if (!smooth) return [nS[0], nS[1]];
      const other = end ? segN[i + 1] : segN[i - 1];
      if (!other) return [nS[0], nS[1]];
      const x = nS[0] + other[0], y = nS[1] + other[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    const nA = nAt(i, false), nB = nAt(i + 1, true);
    const rowA = [], rowB = [];
    for (let j = 0; j <= segs; j++) {
      const a = a0 + (a1 - a0) * (j / segs), ca = Math.cos(a), sa = Math.sin(a);
      const u = (j / segs) * uRep;
      rowA.push(gb.v(cx + ca * profile[i][0], y0 + profile[i][1], cz + sa * profile[i][0], ca * nA[0], nA[1], sa * nA[0], u, vAcc * vScale));
      rowB.push(gb.v(cx + ca * profile[i + 1][0], y0 + profile[i + 1][1], cz + sa * profile[i + 1][0], ca * nB[0], nB[1], sa * nB[0], u, (vAcc + nS[2]) * vScale));
    }
    for (let j = 0; j < segs; j++) {
      if (profile[i][0] < 1e-5 && profile[i + 1][0] < 1e-5) continue;
      gb.quad(rowA[j], rowA[j + 1], rowB[j + 1], rowB[j]);
    }
    vAcc += nS[2];
  }
}

/**
 * Sweep a (d, y) profile around the regular polygon of apothem `ap` (d measured inward).
 * profile traversed so that n2 = (Δy, -Δd) is the visible normal. faces(k) filters faces.
 */
function polySweep(gb, profile, { ap = LY.APOTHEM, faces = null, uScale = 0.5, vScale = 0.5, closed = false } = {}) {
  const N = LY.N_SIDES, ha = LY.HALF_ANGLE;
  const pts = closed ? [...profile, profile[0]] : profile;
  for (let k = 0; k < N; k++) {
    if (faces && !faces(k)) continue;
    const phi = LY.faceAngle(k);
    const nin = [-Math.cos(phi), -Math.sin(phi)];
    const th0 = phi - ha, th1 = phi + ha;
    let vAcc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [dA, yA] = pts[i], [dB, yB] = pts[i + 1];
      const dd = dB - dA, dy = yB - yA, l = Math.hypot(dd, dy) || 1;
      const n2 = [dy / l, -dd / l];
      const nx = nin[0] * n2[0], nz = nin[1] * n2[0], ny = n2[1];
      const rA = (ap - dA) / Math.cos(ha), rB = (ap - dB) / Math.cos(ha);
      const hwA = (ap - dA) * Math.tan(ha), hwB = (ap - dB) * Math.tan(ha);
      const a = gb.v(Math.cos(th0) * rA, yA, Math.sin(th0) * rA, nx, ny, nz, -hwA * uScale, vAcc * vScale);
      const b = gb.v(Math.cos(th1) * rA, yA, Math.sin(th1) * rA, nx, ny, nz, hwA * uScale, vAcc * vScale);
      const c = gb.v(Math.cos(th1) * rB, yB, Math.sin(th1) * rB, nx, ny, nz, hwB * uScale, (vAcc + l) * vScale);
      const d = gb.v(Math.cos(th0) * rB, yB, Math.sin(th0) * rB, nx, ny, nz, -hwB * uScale, (vAcc + l) * vScale);
      gb.quad(a, b, c, d);
      vAcc += l;
    }
  }
}

/** Frame for face k: point at (t along face, y, d inward from glass line). */
function faceFrame(k) {
  const phi = LY.faceAngle(k);
  const c = new THREE.Vector3(Math.cos(phi) * LY.APOTHEM, 0, Math.sin(phi) * LY.APOTHEM);
  const T = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
  const Nin = new THREE.Vector3(-Math.cos(phi), 0, -Math.sin(phi));
  return {
    phi, c, T, Nin,
    at(t, y, d, out = new THREE.Vector3()) {
      return out.set(c.x + T.x * t + Nin.x * d, y, c.z + T.z * t + Nin.z * d);
    },
  };
}

/** Axis-aligned box in a face's local frame (t, y, d). Omits faces listed in `skip`. */
function localBox(gb, F, t0, t1, y0, y1, d0, d1, { uv = 0.5, skip = '' } = {}) {
  const P = (t, y, d) => F.at(t, y, d);
  const faces = [
    ['in', [[t0, y0, d1], [t1, y0, d1], [t1, y1, d1], [t0, y1, d1]], F.Nin, (p) => [p[0], p[1]]],
    ['out', [[t1, y0, d0], [t0, y0, d0], [t0, y1, d0], [t1, y1, d0]], F.Nin.clone().negate(), (p) => [p[0], p[1]]],
    ['top', [[t0, y1, d1], [t1, y1, d1], [t1, y1, d0], [t0, y1, d0]], UP, (p) => [p[0], p[2]]],
    ['bot', [[t0, y0, d0], [t1, y0, d0], [t1, y0, d1], [t0, y0, d1]], UP.clone().negate(), (p) => [p[0], p[2]]],
    ['left', [[t0, y0, d0], [t0, y0, d1], [t0, y1, d1], [t0, y1, d0]], F.T.clone().negate(), (p) => [p[2], p[1]]],
    ['right', [[t1, y0, d1], [t1, y0, d0], [t1, y1, d0], [t1, y1, d1]], F.T, (p) => [p[2], p[1]]],
  ];
  for (const [name, corners, n, uvf] of faces) {
    if (skip.includes(name)) continue;
    const ids = corners.map((c) => {
      const p = P(c[0], c[1], c[2]);
      const [u, v] = uvf(c);
      return gb.v(p.x, p.y, p.z, n.x, n.y, n.z, u * uv, v * uv);
    });
    gb.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

/** Annular-sector prism (curbs, steps). */
function arcBox(gb, r0, r1, y0, y1, a0, a1, { segs = 32, uv = 0.5, skipBottom = true, ends = true } = {}) {
  const top = [], inn = [], out = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs), ca = Math.cos(a), sa = Math.sin(a);
    const sOut = a * r1 * uv, sIn = a * r0 * uv;
    out.push([gb.v(ca * r1, y0, sa * r1, ca, 0, sa, sOut, y0 * uv), gb.v(ca * r1, y1, sa * r1, ca, 0, sa, sOut, y1 * uv)]);
    inn.push([gb.v(ca * r0, y0, sa * r0, -ca, 0, -sa, sIn, y0 * uv), gb.v(ca * r0, y1, sa * r0, -ca, 0, -sa, sIn, y1 * uv)]);
    top.push([gb.v(ca * r0, y1, sa * r0, 0, 1, 0, sIn, 0), gb.v(ca * r1, y1, sa * r1, 0, 1, 0, sOut, (r1 - r0) * uv)]);
  }
  for (let i = 0; i < segs; i++) {
    gb.quad(out[i][0], out[i + 1][0], out[i + 1][1], out[i][1]);
    gb.quad(inn[i][0], inn[i + 1][0], inn[i + 1][1], inn[i][1]);
    gb.quad(top[i][0], top[i + 1][0], top[i + 1][1], top[i][1]);
  }
  if (ends) {
    for (const [a, sgn] of [[a0, -1], [a1, 1]]) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = -sa * sgn, nz = ca * sgn;
      const ids = [[r0, y0], [r1, y0], [r1, y1], [r0, y1]].map(([r, y]) => gb.v(ca * r, y, sa * r, nx, 0, nz, r * uv, y * uv));
      gb.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
}

/** World-space box via matrix. */
function boxAt(gb, w, h, d, pos, rotY = 0, opts) {
  const g = new THREE.BoxGeometry(w, h, d);
  _q.setFromAxisAngle(UP, rotY);
  _m.compose(pos, _q, _s.set(1, 1, 1));
  gb.addGeometry(g, _m, opts);
  g.dispose();
}
function geomAt(gb, geo, pos, quat = null, scale = null, opts) {
  _m.compose(pos, quat || _q.identity(), scale || _s.set(1, 1, 1));
  gb.addGeometry(geo, _m, opts);
}

// ================================================================= floor ===
function buildFloor(B) {
  // walkway ring (polar-mapped encaustic band, 28 repeats around)
  const t = B.tiles;
  const R0 = LY.PLINTH_R - 0.06, R1 = LY.WALK_OUTER, segs = 256, rings = 4, reps = 28;
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const col = [];
    for (let j = 0; j <= rings; j++) {
      const r = lerp(R0, R1, j / rings);
      col.push(t.v(ca * r, 0, sa * r, 0, 1, 0, (i / segs) * reps, (r - LY.PLINTH_R) / 1.5));
    }
    idx.push(col);
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rings; j++) t.quad(idx[i][j], idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]);

  // radial paths to the doors (+z and -z)
  for (const s of [1, -1]) {
    const nx = 6, nz = 14, zEnd = LY.APOTHEM;
    const grid = [];
    for (let i = 0; i <= nx; i++) {
      const x = lerp(-LY.PATH_HALF, LY.PATH_HALF, i / nx);
      const z0 = Math.sqrt(LY.WALK_OUTER * LY.WALK_OUTER - x * x) - 0.01;
      const col = [];
      for (let j = 0; j <= nz; j++) {
        const z = lerp(z0, zEnd, j / nz);
        col.push(t.v(x, 0, z * s, 0, 1, 0, (z - LY.WALK_OUTER) / 1.5, (x * s + LY.PATH_HALF) / 1.5));
      }
      grid.push(col);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) t.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
    // door threshold (stone sill, slightly raised)
    boxAt(B.stone, 2.5, 0.04, 0.56, new THREE.Vector3(0, 0.0, s * (LY.WALL_INNER + 0.26)), 0);
  }

  // perimeter heating grate between beds and dwarf wall (two halves between the paths)
  const g = B.grate;
  for (const half of [0, 1]) {
    const n = 160;
    const rows = [];
    for (const [ri, rFn] of [[0, () => LY.GRATE_INNER - 0.02], [1, (phi) => LY.polyRadius(LY.WALL_INNER, phi) + 0.02]]) {
      const row = [];
      for (let j = 0; j <= n; j++) {
        const rr = ri === 0 ? LY.GRATE_INNER : LY.WALL_INNER;
        const ex = Math.asin(LY.PATH_HALF / rr);
        const aStart = half === 0 ? -Math.PI / 2 + ex : Math.PI / 2 + ex;
        const aEnd = half === 0 ? Math.PI / 2 - ex : 1.5 * Math.PI - ex;
        const a = lerp(aStart, aEnd, j / n);
        const r = rFn(a);
        row.push(g.v(Math.cos(a) * r, 0.002, Math.sin(a) * r, 0, 1, 0, (a * 13.5) / 0.6, ri));
      }
      rows.push(row);
    }
    for (let j = 0; j < n; j++) g.quad(rows[0][j], rows[0][j + 1], rows[1][j + 1], rows[1][j]);
  }
}

// ================================================================ plinth ===
function buildPlinth(B) {
  const R = LY.PLINTH_R, Y = LY.PLINTH_TOP;
  lathe(B.stone, [
    [R - 0.2, Y, false], [R - 0.06, Y, false], [R - 0.022, Y - 0.006, true], [R - 0.003, Y - 0.02, true],
    [R, Y - 0.035, false], [R - 0.018, Y - 0.045, false], [R - 0.018, 0.075, false], [R + 0.01, 0.068, true],
    [R + 0.035, 0.05, true], [R + 0.05, 0.028, false], [R + 0.055, 0.0, false],
  ], { segs: 160, uRep: Math.round((TAU * R) / 2), vScale: 0.5 });
  // top: polar slab texture (8 repeats around, v = r / 5.8)
  const tp = B.plinthTop, segs = 128, rings = 14, rMax = R - 0.2;
  const grid = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU, col = [];
    for (let j = 0; j <= rings; j++) {
      const r = rMax * Math.pow(j / rings, 0.85);
      col.push(tp.v(Math.cos(a) * r, Y, Math.sin(a) * r, 0, 1, 0, (i / segs) * 8, r / 5.8));
    }
    grid.push(col);
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rings; j++) tp.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
  // entrance steps at the two balustrade gaps
  for (const c of [Math.PI / 2, -Math.PI / 2]) arcBox(B.stone, R, R + 0.36, 0, 0.125, c - 9.5 * DEG, c + 9.5 * DEG, { segs: 12 });
}

// ============================================================ balustrade ===
function buildBalustrade(B) {
  const R = LY.PLINTH_R - 0.14, Y = LY.PLINTH_TOP;
  const gap = 8 * DEG;
  const arcs = [[Math.PI / 2 + gap, 1.5 * Math.PI - gap], [-Math.PI / 2 + gap, Math.PI / 2 - gap]];
  const baluster = new THREE.CylinderGeometry(0.0085, 0.0085, 0.66, 5, 1, true);
  const ring = new THREE.TorusGeometry(0.13, 0.009, 4, 22);
  const ball = new THREE.SphereGeometry(0.042, 10, 7);
  const bigBall = new THREE.SphereGeometry(0.06, 14, 10);
  const collar = new THREE.TorusGeometry(0.0115, 0.004, 4, 8);
  for (const [a0, a1] of arcs) {
    const span = a1 - a0;
    const nPosts = Math.round((span * R) / 1.25);
    // posts
    for (let i = 0; i <= nPosts; i++) {
      const a = a0 + (span * i) / nPosts;
      const gate = i === 0 || i === nPosts;
      const p = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
      const w = gate ? 0.1 : 0.066, h = gate ? 1.0 : 0.9;
      boxAt(B.dark, w, h, w, p.clone().setY(Y + h / 2), -a);
      boxAt(B.dark, w + 0.03, 0.03, w + 0.03, p.clone().setY(Y + h + 0.015), -a);
      boxAt(B.dark, w + 0.03, 0.05, w + 0.03, p.clone().setY(Y + 0.025), -a);
      geomAt(B.brass, gate ? bigBall : ball, p.clone().setY(Y + h + 0.03 + (gate ? 0.055 : 0.038)));
      // panel ring motif mid-way to next post
      if (i < nPosts) {
        const am = a + span / nPosts / 2;
        const pm = new THREE.Vector3(Math.cos(am) * R, Y + 0.56, Math.sin(am) * R);
        _q.setFromAxisAngle(UP, -am + Math.PI / 2);
        geomAt(B.dark, ring, pm, _q);
      }
    }
    // balusters
    const nb = Math.round((span * R) / 0.115);
    for (let i = 1; i < nb; i++) {
      const a = a0 + (span * i) / nb;
      const p = new THREE.Vector3(Math.cos(a) * R, Y + 0.1 + 0.33, Math.sin(a) * R);
      geomAt(B.dark, baluster, p);
    }
    // rails
    const arcPts = (y, n = 96) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + (span * i) / n; pts.push(new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R)); } return pts; };
    const radial = (i, p) => new THREE.Vector3(p.x, 0, p.z).normalize();
    tube(B.brass, arcPts(Y + 0.905), () => 0.027, { sides: 10 });
    const low = arcPts(Y + 0.09);
    sweepSection(B.dark, low, framesFromSide(low, radial), [[-0.012, -0.02], [0.012, -0.02], [0.012, 0.02], [-0.012, 0.02]]);
    const mid = arcPts(Y + 0.77);
    sweepSection(B.dark, mid, framesFromSide(mid, radial), [[-0.012, -0.015], [0.012, -0.015], [0.012, 0.015], [-0.012, 0.015]]);
  }
  [baluster, ring, ball, bigBall, collar].forEach((g) => g.dispose());
}

// ================================================================== beds ===
function buildBeds(B) {
  const S = B.stone;
  const ri = LY.WALK_OUTER, ro = LY.BED_OUTER;
  const h = LY.CURB_H;
  for (const half of [0, 1]) {
    const base = half === 0 ? -Math.PI / 2 : Math.PI / 2;
    const exI = Math.asin(LY.PATH_HALF / (ri + LY.CURB_W / 2));
    const exO = Math.asin(LY.PATH_HALF / (ro + LY.CURB_W / 2));
    arcBox(S, ri, ri + LY.CURB_W, 0, h, base + exI, base + Math.PI - exI, { segs: 96 });
    arcBox(S, ro, ro + LY.CURB_W, 0, h, base + exO, base + Math.PI - exO, { segs: 128 });
  }
  // straight curbs along the paths
  for (const sz of [1, -1]) {
    for (const sx of [1, -1]) {
      const z0 = Math.sqrt(ri * ri - LY.PATH_CURB_X ** 2), z1 = Math.sqrt((ro + LY.CURB_W) ** 2 - LY.PATH_HALF ** 2);
      const len = z1 - z0;
      const cx = sx * (LY.PATH_HALF + LY.CURB_W / 2), cz = sz * (z0 + len / 2);
      const g = new THREE.BoxGeometry(LY.CURB_W, h, len);
      const uvA = g.attributes.uv;
      // metre-based uvs for the ashlar texture
      const pos = g.attributes.position, nor = g.attributes.normal;
      for (let i = 0; i < uvA.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
        uvA.setXY(i, (ax > 0.5 ? z : x + z) * 0.5, (ay > 0.5 ? x : y + h / 2) * 0.5);
      }
      _m.makeTranslation(cx, h / 2, cz);
      S.addGeometry(g, _m);
      g.dispose();
    }
  }
  // soil (mounded height field) for both halves
  const so = B.soil;
  for (const half of [0, 1]) {
    const rows = 20, cols = 110;
    const grid = [];
    for (let i = 0; i <= rows; i++) {
      const r = lerp(LY.BED_INNER - 0.1, LY.BED_OUTER + 0.1, i / rows);
      const ex = Math.asin(Math.min(1, LY.PATH_CURB_X / r)) - 0.02;
      const a0 = (half === 0 ? -Math.PI / 2 : Math.PI / 2) + ex, a1 = a0 + Math.PI - 2 * ex;
      const row = [];
      for (let j = 0; j <= cols; j++) {
        const a = lerp(a0, a1, j / cols);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y = LY.soilHeight(x, z);
        const e = 0.05;
        const nx = -(LY.soilHeight(x + e, z) - LY.soilHeight(x - e, z)) / (2 * e);
        const nz = -(LY.soilHeight(x, z + e) - LY.soilHeight(x, z - e)) / (2 * e);
        const l = Math.hypot(nx, 1, nz);
        row.push(so.v(x, y, z, nx / l, 1 / l, nz / l, x / 1.2, z / 1.2));
      }
      grid.push(row);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) so.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
  }
}

// ================================================================= walls ===
const MULLIONS = (() => { const a = []; for (let i = 0; i <= 7; i++) a.push(-2.615 + 0.747 * i); return a; })();
const ROWS = [0.92, 1.55, 2.2, 2.9, 3.6, 4.3, 5.0, 5.65, 6.3, 6.95, 7.6, LY.WALL_TOP];
const TRANSOMS = new Set([2.9, 5.0, 6.95]);

function pushPane(gb, corners, normal, rng) {
  // per-pane tint & slight normal tilt (old glass reflects unevenly)
  const n = normal.clone();
  n.x += rng.range(-0.02, 0.02); n.y += rng.range(-0.02, 0.02); n.z += rng.range(-0.02, 0.02);
  n.normalize();
  const k = rng.range(0.9, 1.08);
  const r = k * rng.range(0.96, 1.02), b = k * rng.range(0.97, 1.03), a = rng.range(0.6, 1.5);
  // grime settles at the bottom of each pane: alpha gradient bottom → top
  const ids = corners.map((p, i) => { gb.set('color', r, k, b, a * (i < 2 ? 1.45 : 0.8)); return gb.v(p.x, p.y, p.z, n.x, n.y, n.z, 0, 0); });
  gb.quad(ids[0], ids[1], ids[2], ids[3]);
}

function buildWalls(B, rng) {
  const hw = LY.SIDE_LEN / 2;
  for (let k = 0; k < LY.N_SIDES; k++) {
    const F = faceFrame(k);
    const door = LY.DOOR_FACES.includes(k);
    const dh = LY.DOOR_HALF;
    // dwarf wall + coping (stone)
    const spans = door ? [[-hw - 0.12, -dh - 0.06], [dh + 0.06, hw + 0.12]] : [[-hw - 0.12, hw + 0.12]];
    for (const [t0, t1] of spans) {
      localBox(B.stone, F, t0, t1, 0, 0.845, -0.25, LY.APOTHEM - LY.WALL_INNER, { skip: 'out bot' });
      localBox(B.stone, F, t0, t1, 0.845, 0.925, -0.3, LY.APOTHEM - LY.WALL_INNER + 0.045, { skip: 'out' });
    }
    // glazing bars (white iron): mullions
    MULLIONS.forEach((t, i) => {
      const jamb = i === 0 || i === 7;
      const inDoor = door && (i === 3 || i === 4);
      const doorJamb = door && (i === 2 || i === 5);
      const w = jamb ? 0.06 : doorJamb ? 0.08 : 0.036;
      const dep = jamb ? 0.1 : doorJamb ? 0.1 : 0.065;
      const y0 = inDoor ? LY.DOOR_TOP : doorJamb ? 0.0 : 0.92;
      localBox(B.iron, F, t - w / 2, t + w / 2, y0, LY.WALL_TOP, 0, dep, { skip: 'out bot top' });
    });
    // horizontal bars
    for (const y of ROWS) {
      const tr = TRANSOMS.has(y);
      const hgt = y === 0.92 ? 0.07 : tr ? 0.07 : 0.032;
      const dep = y === 0.92 ? 0.12 : tr ? 0.09 : 0.05;
      if (door && y < LY.DOOR_TOP) {
        localBox(B.iron, F, -hw + 0.12, -dh, y - hgt / 2, y + hgt / 2, 0, dep, { skip: 'out' });
        localBox(B.iron, F, dh, hw - 0.12, y - hgt / 2, y + hgt / 2, 0, dep, { skip: 'out' });
      } else {
        localBox(B.iron, F, -hw + 0.12, hw - 0.12, y - hgt / 2, y + hgt / 2, 0, dep, { skip: 'out' });
      }
    }
    // glass panes
    for (let i = 0; i < MULLIONS.length - 1; i++) {
      for (let j = 0; j < ROWS.length - 1; j++) {
        const ta = i === 0 ? -hw : MULLIONS[i], tb = i === MULLIONS.length - 2 ? hw : MULLIONS[i + 1];
        const ya = ROWS[j], yb = ROWS[j + 1];
        if (door && i >= 2 && i <= 4 && ya < LY.DOOR_TOP) continue;
        const d = -0.006;
        pushPane(B.glass, [F.at(ta, ya, d), F.at(tb, ya, d), F.at(tb, yb, d), F.at(ta, yb, d)], F.Nin, rng);
      }
    }
    // decorative frieze arch + spandrel rings
    const archPts = [], frames = [];
    const span = hw - 0.24, rise = 0.66, yb = 7.28;
    const R = (span * span + rise * rise) / (2 * rise), yc = yb + rise - R;
    const aMax = Math.asin(span / R);
    for (let i = 0; i <= 28; i++) {
      const a = -aMax + (2 * aMax * i) / 28;
      const t = Math.sin(a) * R, y = yc + Math.cos(a) * R;
      archPts.push(F.at(t, y, 0.045));
    }
    sweepSection(B.iron, archPts, framesFromSide(archPts, () => F.Nin), [[-0.03, -0.045], [0.03, -0.045], [0.03, 0.045], [-0.03, 0.045]]);
    const ringG = new THREE.TorusGeometry(0.21, 0.02, 5, 18);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), F.Nin);
    for (const s of [-1, 1]) geomAt(B.iron, ringG, F.at(s * 1.86, 7.98, 0.045), _q);
    ringG.dispose();
    const boss = new THREE.SphereGeometry(0.07, 8, 6);
    geomAt(B.iron, boss, F.at(0, yb + rise + 0.07, 0.06));
    boss.dispose();

    if (door) buildDoor(B, F, rng);
  }
}

function buildDoor(B, F, rng) {
  const dh = LY.DOOR_HALF;
  for (const [t0, t1] of [[-dh, 0], [0, dh]]) {
    const d0 = 0, d1 = 0.055;
    // stiles
    localBox(B.iron, F, t0, t0 + 0.075, 0.02, LY.DOOR_TOP - 0.04, d0, d1);
    localBox(B.iron, F, t1 - 0.075, t1, 0.02, LY.DOOR_TOP - 0.04, d0, d1);
    // rails
    for (const [y0, y1] of [[0.02, 0.12], [0.86, 0.95], [LY.DOOR_TOP - 0.12, LY.DOOR_TOP - 0.04]]) localBox(B.iron, F, t0, t1, y0, y1, d0, d1);
    // kick panel
    localBox(B.iron, F, t0 + 0.07, t1 - 0.07, 0.12, 0.86, 0.015, 0.03);
    // glazing bars
    const tm = (t0 + t1) / 2;
    localBox(B.iron, F, tm - 0.015, tm + 0.015, 0.95, LY.DOOR_TOP - 0.12, d0, 0.04);
    for (const y of [1.55, 2.2]) localBox(B.iron, F, t0 + 0.07, t1 - 0.07, y - 0.015, y + 0.015, d0, 0.04);
    // brass handle
    const hx = t0 === 0 ? 0.12 : -0.12;
    const knob = new THREE.SphereGeometry(0.035, 10, 8);
    geomAt(B.brass, knob, F.at(hx, 1.0, 0.1));
    knob.dispose();
    // glass
    const ys = [0.95, 1.55, 2.2, LY.DOOR_TOP - 0.12];
    for (let j = 0; j < 3; j++) for (const [a, b] of [[t0 + 0.07, tm], [tm, t1 - 0.07]]) {
      pushPane(B.glass, [F.at(a, ys[j], 0.025), F.at(b, ys[j], 0.025), F.at(b, ys[j + 1], 0.025), F.at(a, ys[j + 1], 0.025)], F.Nin, rng);
    }
  }
}

// =============================================================== columns ===
function flutedShaft(gb, cx, cz, y0, y1, r0, r1, flutes = 20, depth = 0.011) {
  const per = 4, n = flutes * per, rings = 1;
  const rAt = (u, y) => {
    const R = lerp(r0, r1, (y - y0) / (y1 - y0));
    const f = (u * flutes) % 1;
    const g = Math.sin(Math.PI * clamp((f - 0.1) / 0.8, 0, 1));
    return R - depth * g;
  };
  const grid = [];
  for (let j = 0; j <= rings; j++) {
    const y = lerp(y0, y1, j / rings);
    const row = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = u * TAU;
      const r = rAt(u, y);
      const e = 1e-3, rp = rAt(u + e, y), rm = rAt(u - e + 1, y);
      const dr = (rp - rm) / (2 * e * TAU);
      // normal of polar curve r(a): (r cos a + dr sin a, r sin a - dr cos a) rotated appropriately
      let nx = r * Math.cos(a) + dr * Math.sin(a), nz = r * Math.sin(a) - dr * Math.cos(a);
      const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      row.push(gb.v(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, nx, 0, nz, u * 2, y));
    }
    grid.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < n; i++) gb.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
}

function buildColumns(B) {
  const leafSec = [[-0.05, 0], [0.05, 0], [0.05, 0.012], [-0.05, 0.012]];
  const volute = new THREE.TorusGeometry(0.045, 0.014, 4, 10);
  const astragal = new THREE.TorusGeometry(0.172, 0.02, 6, 24);
  for (let k = 0; k < LY.N_SIDES; k++) {
    const th = LY.vertexAngle(k);
    const cx = Math.cos(th) * LY.CIRCUM, cz = Math.sin(th) * LY.CIRCUM;
    const pos = new THREE.Vector3(cx, 0, cz);
    const rot = -th;
    // pedestal
    boxAt(B.iron, 0.54, 0.12, 0.54, pos.clone().setY(0.06), rot);
    boxAt(B.iron, 0.46, 0.72, 0.46, pos.clone().setY(0.12 + 0.36), rot);
    boxAt(B.iron, 0.52, 0.05, 0.52, pos.clone().setY(0.865), rot);
    boxAt(B.iron, 0.56, 0.05, 0.56, pos.clone().setY(0.915), rot);
    // attic base mouldings
    lathe(B.iron, [[0.0, 1.17, false], [0.17, 1.17, false], [0.19, 1.15, true], [0.2, 1.125, true], [0.18, 1.105, false], [0.168, 1.09, true],
      [0.18, 1.07, false], [0.215, 1.05, true], [0.23, 1.01, true], [0.215, 0.975, false], [0.2, 0.94, false]],
    { segs: 24, cx, cz });
    flutedShaft(B.iron, cx, cz, 1.17, 7.56, 0.168, 0.152);
    geomAt(B.iron, astragal, new THREE.Vector3(cx, 7.57, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    // capital bell
    lathe(B.iron, [[0.3, 8.19, false], [0.31, 8.16, true], [0.29, 8.1, true], [0.24, 8.0, true], [0.19, 7.86, true], [0.162, 7.72, true], [0.155, 7.6, false]],
      { segs: 24, cx, cz });
    // acanthus leaves
    for (let i = 0; i < 8; i++) {
      const a = th + (i / 8) * TAU + Math.PI / 8;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const u = j / 8;
        const r = 0.16 + 0.15 * Math.pow(u, 1.4) + (u > 0.75 ? (u - 0.75) * 0.25 : 0);
        const y = 7.62 + 0.36 * Math.sin(u * Math.PI * 0.5) - (u > 0.8 ? (u - 0.8) * 0.4 : 0);
        pts.push(new THREE.Vector3(cx + dir.x * r, y, cz + dir.z * r));
      }
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      sweepSection(B.iron, pts, framesFromSide(pts, () => side), leafSec, { capEnd: true });
    }
    // volutes at the four corners
    for (let i = 0; i < 4; i++) {
      const a = th + Math.PI / 4 + (i * Math.PI) / 2;
      const p = new THREE.Vector3(cx + Math.cos(a) * 0.3, 8.1, cz + Math.sin(a) * 0.3);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, -a + Math.PI / 2);
      geomAt(B.iron, volute, p, q);
    }
    // abacus
    boxAt(B.iron, 0.62, 0.1, 0.62, pos.clone().setY(8.245), rot);
  }
  volute.dispose(); astragal.dispose();
}

// ======================================================= cornice/gallery ===
function buildCornice(B) {
  // entablature + gallery floor
  polySweep(B.iron, [
    [0.02, 8.3], [0.31, 8.3], [0.31, 8.5], [0.35, 8.53], [0.35, 8.57], [0.29, 8.6],
    [0.29, 8.92], [0.33, 8.94], [0.43, 8.99], [0.53, 9.07], [0.6, 9.15], [0.64, 9.17], [0.64, 9.235],
    [LY.GALLERY_D, 9.235], [LY.GALLERY_D, 9.3], [0.0, 9.3],
  ]);
  // dentil-like blocks under the cornice
  for (let k = 0; k < LY.N_SIDES; k++) {
    const F = faceFrame(k);
    const hw = (LY.APOTHEM - 0.3) * Math.tan(LY.HALF_ANGLE);
    for (let t = -hw + 0.1; t < hw - 0.05; t += 0.22) localBox(B.iron, F, t, t + 0.1, 8.86, 8.92, 0.29, 0.34, { skip: 'out top' });
  }
  // gallery railing
  const railD = LY.GALLERY_D - 0.05;
  polySweep(B.iron, [[railD - 0.035, 10.2], [railD + 0.035, 10.2], [railD + 0.035, 10.255], [railD - 0.035, 10.255]], { closed: true });
  polySweep(B.iron, [[railD - 0.02, 9.38], [railD + 0.02, 9.38], [railD + 0.02, 9.42], [railD - 0.02, 9.42]], { closed: true });
  for (let k = 0; k < LY.N_SIDES; k++) {
    const F = faceFrame(k);
    const hw = (LY.APOTHEM - railD) * Math.tan(LY.HALF_ANGLE);
    for (let t = -hw + 0.07; t < hw - 0.03; t += 0.14) localBox(B.iron, F, t - 0.009, t + 0.009, 9.3, 10.2, railD - 0.009, railD + 0.009, { skip: 'top bot' });
    for (const t of [0]) localBox(B.iron, F, t - 0.03, t + 0.03, 9.3, 10.28, railD - 0.03, railD + 0.03, { skip: 'bot' });
    // scalloped valance under the gallery edge (double-sided thin plate)
    const hv = (LY.APOTHEM - LY.GALLERY_D) * Math.tan(LY.HALF_ANGLE);
    const nSc = 16, per = 4;
    const top = [], bot = [];
    for (let i = 0; i <= nSc * per; i++) {
      const u = i / (nSc * per);
      const t = lerp(-hv, hv, u);
      const f = (u * nSc) % 1;
      const yb = 9.235 - 0.05 - 0.085 * Math.sin(Math.PI * f);
      top.push(F.at(t, 9.235, LY.GALLERY_D - 0.012));
      bot.push(F.at(t, yb, LY.GALLERY_D - 0.012));
    }
    for (const sgn of [1, -1]) {
      const n = F.Nin.clone().multiplyScalar(sgn);
      const off = F.Nin.clone().multiplyScalar(sgn * 0.004);
      const a = top.map((p) => B.iron.v(p.x + off.x, p.y, p.z + off.z, n.x, n.y, n.z, 0, 0));
      const b = bot.map((p) => B.iron.v(p.x + off.x, p.y, p.z + off.z, n.x, n.y, n.z, 0, 0));
      for (let i = 0; i < a.length - 1; i++) B.iron.quad(a[i], a[i + 1], b[i + 1], b[i]);
    }
  }
  // scroll brackets under the gallery at each column
  const sec = [[-0.03, -0.045], [0.03, -0.045], [0.03, 0.045], [-0.03, 0.045]];
  const ringG = new THREE.TorusGeometry(0.2, 0.018, 5, 18);
  for (let k = 0; k < LY.N_SIDES; k++) {
    const th = LY.vertexAngle(k);
    const rad = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
    const at = (dv, y) => new THREE.Vector3(rad.x * (LY.CIRCUM - dv), y, rad.z * (LY.CIRCUM - dv));
    for (const [c0, rx, ry] of [[1.12, 0.93, 1.73], [1.12, 0.7, 1.35]]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI - (i / 20) * (Math.PI / 2);
        pts.push(at(c0 + Math.cos(a) * rx, 7.5 + (ry === 1.73 ? 0 : 0.38) + Math.sin(a) * ry));
      }
      sweepSection(B.iron, pts, framesFromSide(pts, () => side), sec);
    }
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    geomAt(B.iron, ringG, at(0.52, 8.86), _q);
  }
  ringG.dispose();
}

// ================================================================== dome ===
export const DOME_RINGS = [0.0, 0.13, 0.26, 0.39, 0.52, 0.64, 0.76, 0.87, 1.0];

function domeVertex(k, s, out = new THREE.Vector3()) {
  const [R, y] = LY.domeAt(s);
  const th = LY.vertexAngle(k);
  return out.set(Math.cos(th) * R, y, Math.sin(th) * R);
}
function domePoint(k, s, f, out = new THREE.Vector3()) {
  const a = domeVertex(k, s), b = domeVertex(k + 1, s);
  return out.copy(a).lerp(b, f);
}
function facetFrame(k, s, f) {
  const e = 0.002;
  const t = domePoint(k, Math.min(1, s + e), f).sub(domePoint(k, Math.max(0, s - e), f)).normalize();
  const b = domeVertex(k + 1, s).sub(domeVertex(k, s)).normalize();
  const n = new THREE.Vector3().crossVectors(b, t).normalize();
  return { t, b, n };
}

function buildDome(B, rng, bulbs) {
  const N = LY.N_SIDES;
  // main ribs
  const ribN = 56;
  const RECT = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
  const dep = (s) => lerp(0.3, 0.17, s);
  for (let k = 0; k < N; k++) {
    const th = LY.vertexAngle(k);
    // framesFromSide gives n = t × b, so b must point clockwise for n to face the axis
    const side = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
    const pts = [];
    for (let i = 0; i <= ribN; i++) pts.push(domeVertex(k, i / ribN));
    const base = framesFromSide(pts, () => side);
    // tapered main rib
    const main = base.map((f, i) => ({ b: f.b.clone().multiplyScalar(lerp(0.15, 0.1, i / ribN)), n: f.n.clone().multiplyScalar(dep(i / ribN)) }));
    sweepSectionScaled(B.iron, pts, main, RECT);
    // inner flange (T-section lip)
    const pts2 = pts.map((p, i) => p.clone().addScaledVector(base[i].n, dep(i / ribN) - 0.01));
    const fl = base.map((f, i) => ({ b: f.b.clone().multiplyScalar(lerp(0.21, 0.13, i / ribN)), n: f.n.clone().multiplyScalar(0.035) }));
    sweepSectionScaled(B.iron, pts2, fl, RECT);
    // string-light bulbs hanging under the rib
    for (let i = 0; i < 20; i++) {
      const s = 0.05 + (i / 19) * 0.84;
      const idx = Math.round(s * ribN);
      bulbs.push(pts[idx].clone().addScaledVector(base[idx].n, dep(s) + 0.07));
    }
  }
  // ring purlins
  for (let j = 0; j < DOME_RINGS.length; j++) {
    const s = DOME_RINGS[j];
    const heavy = j === 0 || j === DOME_RINGS.length - 1;
    const h = heavy ? 0.16 : 0.1, dep = heavy ? 0.26 : 0.15;
    for (let k = 0; k < N; k++) {
      const a = domeVertex(k, s), b = domeVertex(k + 1, s);
      const { t: tm, n } = facetFrame(k, s, 0.5);
      const dir = b.clone().sub(a).normalize();
      const pts = [a, b];
      const frames = [{ b: tm.clone().multiplyScalar(h), n: n.clone().multiplyScalar(dep) }, { b: tm.clone().multiplyScalar(h), n: n.clone().multiplyScalar(dep) }];
      sweepSectionScaled(B.iron, pts, frames, [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]);
      void dir;
    }
  }
  // secondary glazing bars + panes
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < DOME_RINGS.length - 1; j++) {
      const s0 = DOME_RINGS[j], s1 = DOME_RINGS[j + 1];
      const fs = j < 5 ? [0, 0.25, 0.5, 0.75, 1] : j < 7 ? [0, 0.5, 1] : [0, 1];
      const sm = (s0 + s1) / 2;
      // meridian bars
      for (let q = 1; q < fs.length - 1; q++) {
        const pts = [], frames = [];
        for (let i = 0; i <= 4; i++) {
          const s = lerp(s0, s1, i / 4);
          pts.push(domePoint(k, s, fs[q]));
          const fr = facetFrame(k, s, fs[q]);
          frames.push({ b: fr.b.clone().multiplyScalar(0.04), n: fr.n.clone().multiplyScalar(0.07) });
        }
        sweepSectionScaled(B.iron, pts, frames, [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]);
      }
      // mid horizontal glazing bar
      {
        const a = domePoint(k, sm, 0), b = domePoint(k, sm, 1);
        const fr = facetFrame(k, sm, 0.5);
        const frames = [{ b: fr.t.clone().multiplyScalar(0.035), n: fr.n.clone().multiplyScalar(0.05) }, { b: fr.t.clone().multiplyScalar(0.035), n: fr.n.clone().multiplyScalar(0.05) }];
        sweepSectionScaled(B.iron, [a, b], frames, [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]);
      }
      // panes
      for (const [sa, sb] of [[s0, sm], [sm, s1]]) {
        for (let q = 0; q < fs.length - 1; q++) {
          const fa = fs[q], fb = fs[q + 1];
          const n = facetFrame(k, (sa + sb) / 2, (fa + fb) / 2).n;
          const off = n.clone().multiplyScalar(-0.012);
          const c = [domePoint(k, sa, fa), domePoint(k, sa, fb), domePoint(k, sb, fb), domePoint(k, sb, fa)].map((p) => p.add(off));
          pushPane(B.glass, c, n, rng);
        }
      }
    }
  }
}

/** sweepSection variant where frame b/n vectors carry the section scale. */
function sweepSectionScaled(gb, pts, frames, section) {
  const fr = frames.map((f) => {
    const bl = f.b.length(), nl = f.n.length();
    return { b: f.b.clone().divideScalar(bl), n: f.n.clone().divideScalar(nl), sb: bl, sn: nl };
  });
  const m = section.length;
  for (let j = 0; j < m; j++) {
    const a = section[j], b = section[(j + 1) % m];
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const f = fr[i], p = pts[i];
      const ax = a[0] * f.sb, ay = a[1] * f.sn, bx = b[0] * f.sb, by = b[1] * f.sn;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const snx = dy / len, sny = -dx / len;
      const nx = f.b.x * snx + f.n.x * sny, ny = f.b.y * snx + f.n.y * sny, nz = f.b.z * snx + f.n.z * sny;
      const i0 = gb.v(p.x + f.b.x * ax + f.n.x * ay, p.y + f.b.y * ax + f.n.y * ay, p.z + f.b.z * ax + f.n.z * ay, nx, ny, nz, i, j);
      const i1 = gb.v(p.x + f.b.x * bx + f.n.x * by, p.y + f.b.y * bx + f.n.y * by, p.z + f.b.z * bx + f.n.z * by, nx, ny, nz, i, j + 1);
      if (prev) gb.quad(prev[0], prev[1], i1, i0);
      prev = [i0, i1];
    }
  }
}

// =============================================================== lantern ===
function buildLantern(B, rng) {
  const y0 = LY.DOME_TOP_Y, R = LY.DOME_TOP_R;
  const ap = R * Math.cos(LY.HALF_ANGLE);
  // heavy crown ring
  polySweep(B.iron, [[-0.02, y0 - 0.28], [0.34, y0 - 0.28], [0.34, y0 + 0.06], [-0.02, y0 + 0.06]], { ap, closed: true });
  const yTop = y0 + LY.LANTERN_H;
  // slim columns at alternate vertices + glass drum
  const col = new THREE.CylinderGeometry(0.045, 0.05, LY.LANTERN_H, 8, 1, true);
  for (let k = 0; k < LY.N_SIDES; k++) {
    const th = LY.vertexAngle(k);
    const r = (ap - 0.08) / Math.cos(LY.HALF_ANGLE);
    if (k % 2 === 0) geomAt(B.iron, col, new THREE.Vector3(Math.cos(th) * r, y0 + LY.LANTERN_H / 2, Math.sin(th) * r));
    const th1 = LY.vertexAngle(k + 1);
    const n = new THREE.Vector3(-Math.cos(LY.faceAngle(k)), 0, -Math.sin(LY.faceAngle(k)));
    const c = [
      new THREE.Vector3(Math.cos(th) * r, y0 + 0.06, Math.sin(th) * r), new THREE.Vector3(Math.cos(th1) * r, y0 + 0.06, Math.sin(th1) * r),
      new THREE.Vector3(Math.cos(th1) * r, yTop, Math.sin(th1) * r), new THREE.Vector3(Math.cos(th) * r, yTop, Math.sin(th) * r),
    ];
    pushPane(B.glass, c, n, rng);
  }
  col.dispose();
  polySweep(B.iron, [[0.0, yTop - 0.02], [0.2, yTop - 0.02], [0.2, yTop + 0.1], [0.0, yTop + 0.1]], { ap: ap - 0.05, closed: true });
  // glazed cap with 8 ribs
  const capProf = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    capProf.push([Math.cos(a) * (R - 0.12) + 0.001, yTop + 0.1 + Math.sin(a) * 0.85]);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const pts = capProf.map(([r, y]) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    sweepSection(B.iron, pts, framesFromSide(pts, () => side), [[-0.035, 0], [0.035, 0], [0.035, 0.07], [-0.035, 0.07]]);
  }
  for (let i = 0; i < capProf.length - 1; i++) {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * TAU, a1 = ((k + 1) / 16) * TAU;
      const [ra, ya] = capProf[i], [rb, yb] = capProf[i + 1];
      const c = [
        new THREE.Vector3(Math.cos(a0) * ra, ya, Math.sin(a0) * ra), new THREE.Vector3(Math.cos(a1) * ra, ya, Math.sin(a1) * ra),
        new THREE.Vector3(Math.cos(a1) * rb, yb, Math.sin(a1) * rb), new THREE.Vector3(Math.cos(a0) * rb, yb, Math.sin(a0) * rb),
      ];
      const n = new THREE.Vector3().crossVectors(c[1].clone().sub(c[0]), c[3].clone().sub(c[0])).normalize();
      if (n.y > 0) n.negate();
      pushPane(B.glass, c, n, rng);
    }
  }
  // finial
  const yF = yTop + 0.95;
  const s1 = new THREE.SphereGeometry(0.2, 16, 12), s2 = new THREE.SphereGeometry(0.09, 12, 8), cone = new THREE.ConeGeometry(0.05, 0.75, 10);
  lathe(B.brass, [[0.001, yF + 0.02, false], [0.14, yF - 0.02, true], [0.2, yF - 0.08, false], [0.001, yF - 0.1, false]], { segs: 16 });
  geomAt(B.brass, s1, new THREE.Vector3(0, yF + 0.2, 0));
  geomAt(B.brass, s2, new THREE.Vector3(0, yF + 0.47, 0));
  geomAt(B.brass, cone, new THREE.Vector3(0, yF + 0.9, 0));
  [s1, s2, cone].forEach((g) => g.dispose());
}

// ================================================================= lamps ===
export const LAMP_R = 7.22;
export const LAMP_LIGHT_Y = 2.93;
function buildLamps(B) {
  const positions = [];
  const shaft = new THREE.CylinderGeometry(0.043, 0.056, 2.14, 10, 1, true);
  const collar = new THREE.TorusGeometry(0.058, 0.018, 6, 16);
  const ball = new THREE.SphereGeometry(0.03, 10, 8);
  const glass = new THREE.CylinderGeometry(0.15, 0.115, 0.42, 6, 1, true);
  const roof = new THREE.CylinderGeometry(0.035, 0.215, 0.17, 6, 1, false);
  const post = new THREE.BoxGeometry(0.018, 0.44, 0.018);
  const fin = new THREE.SphereGeometry(0.045, 10, 8);
  const xq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const a = (22.5 + 45 * i) * DEG;
    const x = Math.cos(a) * LAMP_R, z = Math.sin(a) * LAMP_R;
    positions.push(new THREE.Vector3(x, LAMP_LIGHT_Y, z));
    lathe(B.dark, [[0.001, 0.42, false], [0.066, 0.42, false], [0.07, 0.38, true], [0.1, 0.34, true], [0.13, 0.29, true], [0.14, 0.12, true],
      [0.17, 0.09, false], [0.17, 0.0, false]], { segs: 20, cx: x, cz: z });
    geomAt(B.dark, shaft, new THREE.Vector3(x, 0.42 + 1.07, z));
    for (const y of [0.95, 2.3]) geomAt(B.dark, collar, new THREE.Vector3(x, y, z), xq);
    // ladder bar
    const tang = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    boxAt(B.dark, 0.5, 0.022, 0.022, new THREE.Vector3(x, 2.47, z), -a + Math.PI / 2);
    for (const s of [-1, 1]) geomAt(B.brass, ball, new THREE.Vector3(x + tang.x * 0.25 * s, 2.47, z + tang.z * 0.25 * s));
    // lantern head
    lathe(B.dark, [[0.001, 2.72, false], [0.125, 2.72, false], [0.13, 2.69, true], [0.08, 2.6, true], [0.045, 2.56, false]], { segs: 12, cx: x, cz: z });
    const hq = new THREE.Quaternion().setFromAxisAngle(UP, -a);
    geomAt(B.lampGlass, glass, new THREE.Vector3(x, 2.93, z), hq);
    for (let k = 0; k < 6; k++) {
      // CylinderGeometry corners sit at (r sinθ, r cosθ); rotated by -a about Y
      const th = (k / 6) * TAU - a;
      geomAt(B.dark, post, new THREE.Vector3(x + Math.sin(th) * 0.14, 2.93, z + Math.cos(th) * 0.14), new THREE.Quaternion().setFromAxisAngle(UP, th));
    }
    geomAt(B.dark, roof, new THREE.Vector3(x, 3.14 + 0.085, z), hq);
    geomAt(B.brass, fin, new THREE.Vector3(x, 3.36, z));
  }
  [shaft, collar, ball, glass, roof, post, fin].forEach((g) => g.dispose());
  return positions;
}

// ============================================================== festoons ===
function festoons(bulbs) {
  const lines = [];
  const d = LY.GALLERY_D + 0.05;
  const r = (LY.APOTHEM - d) / Math.cos(LY.HALF_ANGLE);
  for (let k = 0; k < LY.N_SIDES; k++) {
    const a0 = LY.vertexAngle(k), a1 = LY.vertexAngle(k + 1);
    const A = new THREE.Vector3(Math.cos(a0) * r, 9.12, Math.sin(a0) * r);
    const Bv = new THREE.Vector3(Math.cos(a1) * r, 9.12, Math.sin(a1) * r);
    const at = (t) => A.clone().lerp(Bv, t).setY(9.12 - 0.62 * (1 - (2 * t - 1) ** 2));
    const n = 24;
    for (let i = 0; i < n; i++) lines.push(at(i / n), at((i + 1) / n));
    for (let i = 0; i < 12; i++) bulbs.push(at((i + 0.5) / 12).add(new THREE.Vector3(0, -0.05, 0)));
  }
  return lines;
}

// ================================================================= build ===
export function buildStructure(tex, uniforms, { seed = 3 } = {}) {
  const rng = new Rng(seed);
  const M = makeMaterials(tex, uniforms);
  const B = {
    iron: new GeoBuilder(), dark: new GeoBuilder(), brass: new GeoBuilder(),
    stone: new GeoBuilder(), plinthTop: new GeoBuilder(), tiles: new GeoBuilder(),
    grate: new GeoBuilder(), soil: new GeoBuilder(), glass: new GeoBuilder({ color: 4 }),
    lampGlass: new GeoBuilder(),
  };
  const bulbs = [];
  buildFloor(B);
  buildPlinth(B);
  buildBalustrade(B);
  buildBeds(B);
  buildWalls(B, rng);
  buildColumns(B);
  buildCornice(B);
  buildDome(B, rng, bulbs);
  buildLantern(B, rng);
  const lampPositions = buildLamps(B);
  const wire = festoons(bulbs);

  const group = new THREE.Group();
  group.name = 'glasshouse-structure';
  const meshes = {};
  const add = (key, mat, { cast = true, receive = true, order = 0 } = {}) => {
    const g = B[key].build();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `gh.${key}`;
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    meshes[key] = mesh;
    return mesh;
  };
  add('tiles', M.tiles, { cast: false });
  add('grate', M.grate, { cast: false });
  add('soil', M.soil, { cast: false });
  add('plinthTop', M.plinthTop, { cast: false });
  add('stone', M.stone);
  add('iron', M.iron);
  add('dark', M.dark);
  add('brass', M.brass);
  add('lampGlass', M.lampGlass, { cast: false, receive: false });
  // the glass is always the outermost shell: draw it first among transparents so anything
  // transparent inside (the machine's parts, particles) blends over it
  add('glass', M.glass, { cast: false, receive: false, order: -10 });

  // string-light bulbs (instanced)
  const bulbGeo = new THREE.IcosahedronGeometry(0.036, 0);
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, M.bulb, bulbs.length);
  bulbs.forEach((p, i) => { _m.makeTranslation(p.x, p.y, p.z); bulbMesh.setMatrixAt(i, _m); });
  bulbMesh.instanceMatrix.needsUpdate = true;
  bulbMesh.computeBoundingSphere();
  bulbMesh.name = 'gh.bulbs';
  group.add(bulbMesh);
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wire);
  const wireMesh = new THREE.LineSegments(wireGeo, M.wire);
  wireMesh.name = 'gh.festoonWire';
  group.add(wireMesh);

  return { group, materials: M, meshes, lampPositions, bulbPositions: bulbs };
}
