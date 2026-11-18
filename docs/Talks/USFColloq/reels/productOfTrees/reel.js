/**
 * A product of trees, T_m × T_n — EigenReel piece.
 *
 * Each tree is drawn in its own plane (trees.js), and the product is the "sum" picture
 *   (u, v) ↦ x₁(u)·E₁ + y₁(u)·F₁ + x₂(v)·E₂ + y₂(v)·F₂,
 * a linear shadow in ℝ³ of the product of the two planes, ℝ² × ℝ² = ℝ⁴. So every square e × f is drawn
 * as an honest parallelogram, every flat (line × line) as a plane, and each tree's isometries act on
 * its own plane while the other tree's coordinates stay put.
 *
 * E₁ and E₂ are the two horizontal axes, so when both trees are drawn straight along their gold lines
 * the gold flat is the floor and every other flat through a gold line is a wall leaning off it.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTree, layout, slotDist, TAU } from './trees.js';
import { FEED_T, feedState } from './feed.js';

/* ───────── constants ───────── */
const FOV = 32;
// each tree's plane leans off the vertical by alpha (first tree, toward E₂) and beta (second, toward E₁)
const E1 = [1, 0, 0], F1 = [0, 1, 0], E2 = [0, 0, 1], F2 = [0, 1, 0];
function setLean(alpha, beta) {
  F1[1] = Math.cos(alpha); F1[2] = Math.sin(alpha);
  F2[0] = Math.sin(beta); F2[1] = Math.cos(beta);
}
setLean(0.46, 0.46);
const R_EDGE = 0.028, R_VERT = 0.046, R_BASE = 0.08, HIER = 0.8;
const LINK_R = 0.3, ARC_SEG = 18;
const BUDGET = 2600;                        // largest product ball drawn (vertices)

const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === 'true';

/* ───────── small helpers ───────── */
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const ease5 = t => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));
const mod = (a, n) => ((a % n) + n) % n;
const deg = d => (d * Math.PI) / 180;

/* ───────── colour ───────── */
const BASE = {
  dark: { bg: '#060a14', fg: '#eef1f8', t1: '#38bdf8', t2: '#d38ae7', sq: '#818cf8', flat: '#fbbf24',
    vert: '#dfe4f2', base: '#ffffff', arc: '#f4f6fb', shell: '#a5b4fc', fog: 0.62, sqA: 0.17, flatA: 0.32, add: true },
  light: { bg: '#ffffff', fg: '#16181e', t1: '#0284c7', t2: '#a347c6', sq: '#5f67cf', flat: '#d97706',
    vert: '#3a4050', base: '#16181e', arc: '#16181e', shell: '#5f67cf', fog: 0.55, sqA: 0.13, flatA: 0.36, add: false },
};
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function palette(name) {
  const b = BASE[name];
  const P = { ...b, name, dark: name === 'dark' };
  for (const k of ['t1', 't2', 'sq', 'flat', 'vert', 'base', 'arc', 'bg']) P['L' + k] = lin(b[k]);
  return P;
}

/* ───────── renderer, scene ───────── */
const canvas = document.getElementById('gl');
const viewEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.minDistance = 1.0;
controls.maxDistance = 40;
controls.enabled = false;
canvas.style.touchAction = '';
let aspect = 1;

const shared = {
  uKey: { value: new THREE.Vector3(0, 1, 0) },
  uFill: { value: new THREE.Vector3(1, 0, 0) },
  uCamPos: { value: new THREE.Vector3() },
  uBg: { value: new THREE.Color() },
  uFog: { value: new THREE.Vector3(5, 12, 0.5) },
  uDark: { value: 1 },
};
const SHADE = /* glsl */`
uniform vec3 uKey; uniform vec3 uFill; uniform vec3 uCamPos; uniform vec3 uBg; uniform vec3 uFog; uniform float uDark;
vec3 shade(vec3 base, vec3 N, vec3 W) {
  vec3 V = normalize(uCamPos - W);
  float ndv = dot(N, V);
  if (ndv < 0.0) { N = -N; ndv = -ndv; }
  float k = max(dot(N, uKey), 0.0), f = max(dot(N, uFill), 0.0);
  vec3 H = normalize(uKey + V);
  float spec = pow(max(dot(N, H), 0.0), 36.0);
  float rim = pow(1.0 - ndv, 3.0);
  vec3 col = base * (0.36 + 0.62 * k + 0.22 * f) + spec * mix(0.18, 0.32, uDark) + rim * mix(base, vec3(1.0), 0.4) * 0.45 * uDark;
  float fg = smoothstep(uFog.x, uFog.y, length(uCamPos - W)) * uFog.z;
  return mix(col, uBg, fg);
}`;

// tubes: one instance per edge, built in the vertex shader from its two ends
const TUBE_VS = /* glsl */`
attribute vec3 aA; attribute vec3 aB; attribute float aR; attribute vec3 aC;
varying vec3 vN; varying vec3 vW; varying vec3 vC;
void main() {
  vec3 d = aB - aA; float L = length(d);
  vec3 t = L > 1e-6 ? d / L : vec3(0.0, 1.0, 0.0);
  vec3 a = abs(t.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 n1 = normalize(cross(t, a)); vec3 n2 = cross(n1, t);
  vec3 p = aA + d * position.y + (n1 * position.x + n2 * position.z) * aR;
  vN = n1 * normal.x + n2 * normal.z; vW = p; vC = aC;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BALL_VS = /* glsl */`
attribute vec3 aP; attribute float aR; attribute vec3 aC;
varying vec3 vN; varying vec3 vW; varying vec3 vC;
void main() {
  vec3 p = aP + position * aR;
  vN = normal; vW = p; vC = aC;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SOLID_FS = /* glsl */`
${SHADE}
varying vec3 vN; varying vec3 vW; varying vec3 vC;
void main() {
  gl_FragColor = vec4(shade(vC, normalize(vN), vW), 1.0);
  #include <colorspace_fragment>
}`;
const SQ_VS = /* glsl */`
attribute vec3 aC; attribute float aA;
varying vec3 vC; varying float vA; varying vec3 vW;
void main() { vC = aC; vA = aA; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const SQ_FS = /* glsl */`
uniform vec3 uCamPos; uniform vec3 uFog;
varying vec3 vC; varying float vA; varying vec3 vW;
void main() {
  float fg = smoothstep(uFog.x, uFog.y, length(uCamPos - vW)) * uFog.z;
  gl_FragColor = vec4(vC, vA * (1.0 - fg));
  #include <colorspace_fragment>
}`;
const SHELL_VS = /* glsl */`
varying vec3 vN; varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHELL_FS = /* glsl */`
uniform vec3 uCamPos; uniform vec3 uColor; uniform float uOp;
varying vec3 vN; varying vec3 vW;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(uCamPos - vW)));
  gl_FragColor = vec4(uColor, uOp * (0.05 + 0.55 * pow(f, 2.6)));
  #include <colorspace_fragment>
}`;

function cylinderBase(seg) {
  const pos = [], nor = [], idx = [];
  for (let s = 0; s <= seg; s++) {
    const a = (TAU * s) / seg, c = Math.cos(a), si = Math.sin(a);
    pos.push(c, 0, si, c, 1, si); nor.push(c, 0, si, c, 0, si);
  }
  for (let s = 0; s < seg; s++) { const a = 2 * s, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
const TUBE_BASE = cylinderBase(10);
const BALL_BASE = new THREE.IcosahedronGeometry(1, 2);
const solidMat = vs => new THREE.ShaderMaterial({ uniforms: shared, vertexShader: vs, fragmentShader: SOLID_FS });
const tubeMat = solidMat(TUBE_VS), ballMat = solidMat(BALL_VS);
const sqMat = new THREE.ShaderMaterial({
  uniforms: { uCamPos: shared.uCamPos, uFog: shared.uFog }, vertexShader: SQ_VS, fragmentShader: SQ_FS,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
const shellMat = new THREE.ShaderMaterial({
  uniforms: { uCamPos: shared.uCamPos, uColor: { value: new THREE.Color() }, uOp: { value: 0 } },
  vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false,
});
const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMat);
shell.renderOrder = 2;
scene.add(shell);

/** An instanced mesh whose per-instance attributes are plain Float32Arrays we refill every frame. */
function instanced(base, mat, spec, cap) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('normal', base.attributes.normal);
  const A = {};
  for (const [name, size] of Object.entries(spec)) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, attr);
    A[name] = attr.array;
  }
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, geo, A, cap, spec, n: 0 };
}
function commit(I) {
  for (const name of Object.keys(I.spec)) {
    const a = I.geo.attributes[name];
    a.needsUpdate = true;
    a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, I.n) * I.spec[name]);
  }
  I.geo.instanceCount = I.n;
}
function squaresMesh(cap) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(cap * 12), 3), col = new THREE.BufferAttribute(new Float32Array(cap * 12), 3);
  const al = new THREE.BufferAttribute(new Float32Array(cap * 4), 1);
  for (const a of [pos, col, al]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos); geo.setAttribute('aC', col); geo.setAttribute('aA', al);
  const idx = new (cap * 4 > 65535 ? Uint32Array : Uint16Array)(cap * 6);
  for (let s = 0; s < cap; s++) { const o = 4 * s; idx.set([o, o + 1, o + 2, o, o + 2, o + 3], 6 * s); }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, sqMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, geo, pos: pos.array, col: col.array, al: al.array, cap, n: 0 };
}

/* ───────── the model: two trees and the buffers for their product ─────────
   We draw the ball of radius R in the product's own graph metric, |u| + |v| ≤ R (|·| = distance from
   the white vertex in each tree): the two trees through the white vertex at full radius, and the
   copies further out shrinking as they go. Its gold flat is a diamond. */
const VAL = [3, 4, 5];
const M = {
  m: VAL.includes(+qs.get('m')) ? +qs.get('m') : 3,
  n: VAL.includes(+qs.get('n')) ? +qs.get('n') : 4,
  R: [1, 2, 3, 4].includes(+qs.get('r')) ? +qs.get('r') : 3,
};
const sphere = (k, a) => (a === 0 ? 1 : k * (k - 1) ** (a - 1));
/** Number of vertices (u, v) with |u| + |v| ≤ r (and |u|, |v| ≤ cap). */
function l1Ball(m, n, r, cap = r) {
  let s = 0;
  for (let a = 0; a <= Math.min(r, cap); a++) for (let b = 0; b <= Math.min(r - a, cap); b++) s += sphere(m, a) * sphere(n, b);
  return s;
}
const fitsBudget = (m, n, R) => l1Ball(m, n, R) <= BUDGET;
let T1, T2, A1, A2, tubes = null, balls = null, sqs = null;

function treeScratch(T) {
  const N = T.verts.length;
  return {
    P: T.verts.map(() => [0, 0]), X: new Float32Array(N * 3), Xg: new Float32Array(N * 3), Xs: new Float32Array(N * 3),
    g: new Float32Array(N), s: new Float32Array(N),
    sd: new Float32Array(N),     // distance from the middle of the frame (slides move it)
    sde: new Float32Array(N),    // the same for a copy still sliding out (second tree only)
    sdE: new Float32Array(N),    // the far end of the edge from the parent
    order: new Int32Array(N), orderE: new Int32Array(N),   // ids sorted by sde / sdE, nearest first
  };
}
function rebuild() {
  while (!fitsBudget(M.m, M.n, M.R) && M.R > 1) M.R--;
  T1 = buildTree(M.m, M.R); T2 = buildTree(M.n, M.R);
  A1 = treeScratch(T1); A2 = treeScratch(T2);
  // a slide moves each coordinate by ≤ 1, so at most the pairs with |u| + |v| ≤ R + 2 are ever drawn
  const pairs = l1Ball(M.m, M.n, M.R + 2, M.R + 1);
  for (const o of [tubes, balls, sqs]) if (o) { scene.remove(o.mesh); o.geo.dispose(); }
  tubes = instanced(TUBE_BASE, tubeMat, { aA: 3, aB: 3, aR: 1, aC: 3 }, 2 * pairs + T2.verts.length + M.m * M.n * ARC_SEG + 16);
  balls = instanced(BALL_BASE, ballMat, { aP: 3, aR: 1, aC: 3 }, pairs + T2.verts.length + 64);
  sqs = squaresMesh(pairs);
  scene.add(tubes.mesh, balls.mesh, sqs.mesh);
}

/* ───────── display state: everything a frame shows ───────── */
function newState() {
  return {
    gamma: 0, sigma: 0,          // trees grown / squares swept, in layers
    phi1: 0, phi2: 0,            // turn of each round picture about the white vertex
    mu: 0,                       // round (0) → straight (1)
    c1: 0, c2: 0,                // slide of each straight picture along its line, in steps
    lines: 0, eta: 0,            // the gold line in each tree, and the gold flat they span
    sq: 1,                       // squares
    link: 0,                     // the link of the white vertex
    camPos: new THREE.Vector3(5, 3, 5), camTarget: new THREE.Vector3(),
  };
}
const NUMS = ['gamma', 'sigma', 'phi1', 'phi2', 'mu', 'c1', 'c2', 'lines', 'eta', 'sq', 'link'];
function copyState(a, b) { for (const k of NUMS) b[k] = a[k]; b.camPos.copy(a.camPos); b.camTarget.copy(a.camTarget); return b; }
const D = newState();

/* ───────── building a frame ───────── */
function treeFrame(T, A, mu, phi, c, gam, sig, E, F) {
  layout(T, mu, phi, c, A.P);
  const V = T.verts, X = A.X, N = V.length;
  for (let q = 0; q < N; q++) {
    const p = A.P[q], o = 3 * q;
    X[o] = p[0] * E[0] + p[1] * F[0]; X[o + 1] = p[0] * E[1] + p[1] * F[1]; X[o + 2] = p[0] * E[2] + p[1] * F[2];
    const v = V[q];
    A.sd[q] = slotDist(v, c);
    A.g[q] = q === 0 ? 1 : ease(gam - (v.dist - 1));
    A.s[q] = q === 0 ? 1 : ease(sig - (v.dist - 1));
    // a copy sliding out from the parent still has the parent's size, and shrinks as it arrives
    A.sde[q] = q === 0 ? A.sd[q] : A.sd[q] - (1 - A.s[q]);
  }
  for (let q = 0; q < N; q++) {
    const o = 3 * q, par = Math.max(0, V[q].parent), pp = 3 * par, g = A.g[q], s = A.s[q];
    for (let j = 0; j < 3; j++) {
      const e = X[o + j] - X[pp + j];
      A.Xg[o + j] = X[pp + j] + g * e;
      A.Xs[o + j] = X[pp + j] + s * e;
    }
    A.sdE[q] = q === 0 ? A.sde[0] : Math.max(A.sde[q], A.sde[par]);
  }
  for (let q = 0; q < N; q++) { A.order[q] = q; A.orderE[q] = q; }
  A.order.sort((a, b) => A.sde[a] - A.sde[b]);
  A.orderE.sort((a, b) => A.sdE[a] - A.sdE[b]);
}

let P = null;
const tmpA = [0, 0, 0], tmpB = [0, 0, 0], tmpC = [0, 0, 0], tmpD = [0, 0, 0];
const mixInto = (out, a, b, t) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
const colA = [0, 0, 0];

function buildFrame(S) {
  treeFrame(T1, A1, S.mu, S.phi1, S.c1, S.gamma, S.gamma, E1, F1);
  treeFrame(T2, A2, S.mu, S.phi2, S.c2, S.gamma, S.sigma, E2, F2);
  const V1 = T1.verts, V2 = T2.verts, n1 = V1.length, n2 = V2.length, Rp = M.R + 1;
  const { X: X1, Xg: G1, g: g1, sd: d1, sdE: dE1 } = A1;
  const { X: X2, Xg: G2, Xs: S2, g: g2, s: s2, sd: d2, sde: de2, sdE: dE2, order: ord2, orderE: ordE2 } = A2;
  // gold: the line in each tree (on the two trees through the white vertex) spreads out with `lines`,
  // the flat they span with `eta`; both start at the white vertex
  const eta = S.eta, lines = S.lines, reach = M.R + 1.4;
  const flatF = (a, b) => {
    const s = Math.abs(V1[a].i + S.c1) + Math.abs(V2[b].i + S.c2);
    let f = eta > 0 ? clamp01(eta * reach - s) : 0;
    if (lines > 0 && (a === 0 || b === 0)) f = Math.max(f, clamp01(lines * reach - s));
    return f;
  };
  // point (u, v): the first tree's copy at v = o grows with gamma; the other copies slide with sigma
  const pos = (u, v, out) => {
    const a = 3 * u, b = 3 * v;
    if (v === 0) { out[0] = G1[a] + X2[0]; out[1] = G1[a + 1] + X2[1]; out[2] = G1[a + 2] + X2[2]; }
    else { out[0] = G1[a] + S2[b]; out[1] = G1[a + 1] + S2[b + 1]; out[2] = G1[a + 2] + S2[b + 2]; }
    return out;
  };
  const guide = (v, out) => { const b = 3 * v; out[0] = X1[0] + G2[b]; out[1] = X1[1] + G2[b + 1]; out[2] = X1[2] + G2[b + 2]; return out; };
  const here2 = v => v === 0 || s2[v] > 0;   // is the copy T₁ × {v} out yet?
  const win = s => smooth(0, 1, Rp - s);     // fade over the last unit of distance
  const size = s => HIER ** s;
  // while the link is shown, everything else recedes toward the background
  const emph00 = smooth(0, 1, 1 - 2 * Math.abs(S.c1)) * smooth(0, 1, 1 - 2 * Math.abs(S.c2));   // (o, o) in the middle
  const lk = S.link * emph00, dim = 0.78 * lk, thin = 1 - 0.5 * lk;
  const tone = c => (dim > 0 ? mixInto(c, c, P.Lbg, dim) : c);

  // ── tubes ──
  const TA = tubes.A;
  let ne = 0;
  const pushTube = (a, b, r, c) => {
    if (r <= 1e-4 || ne >= tubes.cap) return;
    const o = 3 * ne;
    TA.aA[o] = a[0]; TA.aA[o + 1] = a[1]; TA.aA[o + 2] = a[2];
    TA.aB[o] = b[0]; TA.aB[o + 1] = b[1]; TA.aB[o + 2] = b[2];
    TA.aC[o] = c[0]; TA.aC[o + 1] = c[1]; TA.aC[o + 2] = c[2];
    TA.aR[ne] = r;
    ne++;
  };
  // edges of the first tree: one copy at every vertex v of the second
  for (let u = 1; u < n1; u++) {
    if (g1[u] <= 0) continue;
    const lim = Rp - dE1[u], pu = V1[u].parent, line1 = V1[u].d === 0;
    if (lim <= 0) continue;
    for (let k = 0; k < n2; k++) {
      const v = ord2[k], s = dE1[u] + de2[v];
      if (s >= Rp) break;
      if (!here2(v)) continue;
      const f = line1 && V2[v].d === 0 ? flatF(u, v) : 0;
      pushTube(pos(pu, v, tmpA), pos(u, v, tmpB), R_EDGE * thin * size(s) * win(s), tone(mixInto(colA, P.Lt1, P.Lflat, f)));
    }
  }
  // edges of the second tree: one copy at every vertex u of the first (at u = o, the second tree itself)
  for (let u = 0; u < n1; u++) {
    if (g1[u] <= 0 || d1[u] >= Rp) continue;
    const line1 = V1[u].d === 0;
    for (let k = 0; k < n2; k++) {
      const v = ordE2[k];
      if (v === 0) continue;
      const pv = V2[v].parent;
      let s;
      if (u === 0) {
        if (g2[v] <= 0) continue;
        s = d1[0] + Math.max(d2[v], d2[pv]);
        if (s >= Rp) continue;
        guide(pv, tmpA); guide(v, tmpB);
      } else {
        s = d1[u] + dE2[v];
        if (s >= Rp) break;
        if (s2[v] <= 0) continue;
        pos(u, pv, tmpA); pos(u, v, tmpB);
      }
      const f = line1 && V2[v].d === 0 ? flatF(u, v) : 0;
      pushTube(tmpA, tmpB, R_EDGE * thin * size(s) * win(s), tone(mixInto(colA, P.Lt2, P.Lflat, f)));
    }
  }

  // ── squares ──
  let ns = 0;
  const SP = sqs.pos, SC = sqs.col, SA = sqs.al, sqA = P.sqA * S.sq * (1 - 0.7 * lk), flA = P.flatA * (1 - 0.7 * lk);
  if (sqA > 0.001 || eta > 0.001) {
    for (let u = 1; u < n1; u++) {
      if (g1[u] <= 0 || dE1[u] >= Rp) continue;
      const pu = V1[u].parent, line1 = V1[u].d === 0;
      for (let k = 0; k < n2; k++) {
        const v = ordE2[k];
        if (v === 0) continue;
        const s = dE1[u] + dE2[v];
        if (s >= Rp) break;
        if (s2[v] <= 0) continue;
        const f = line1 && V2[v].d === 0 ? flatF(u, v) : 0;
        const a = (sqA * size(s - 1) * (1 - f) + flA * f) * win(s);
        if (a <= 0.002 || ns >= sqs.cap) continue;
        pos(V1[u].parent, V2[v].parent, tmpA); pos(u, V2[v].parent, tmpB); pos(u, v, tmpC); pos(pu, v, tmpD);
        const o = 12 * ns;
        SP.set(tmpA, o); SP.set(tmpB, o + 3); SP.set(tmpC, o + 6); SP.set(tmpD, o + 9);
        mixInto(colA, P.Lsq, P.Lflat, f);
        for (let j = 0; j < 4; j++) { SC.set(colA, o + 3 * j); SA[4 * ns + j] = a; }
        ns++;
      }
    }
  }
  sqs.n = ns;

  // ── vertices ──
  const BA = balls.A;
  let nb = 0;
  const pushBall = (p, r, c) => {
    if (r <= 1e-4 || nb >= balls.cap) return;
    const o = 3 * nb;
    BA.aP[o] = p[0]; BA.aP[o + 1] = p[1]; BA.aP[o + 2] = p[2];
    BA.aC[o] = c[0]; BA.aC[o + 1] = c[1]; BA.aC[o + 2] = c[2];
    BA.aR[nb] = r;
    nb++;
  };
  for (let u = 0; u < n1; u++) {
    if (g1[u] <= 0 || d1[u] >= Rp) continue;
    const line1 = V1[u].d === 0;
    for (let k = 0; k < n2; k++) {
      const v = ord2[k], s = d1[u] + de2[v];
      if (s >= Rp) break;
      if (!here2(v)) continue;
      // the sliding copy's own white-tree vertex only shows while it slides (then the second tree's takes over)
      const pop = v === 0 ? smooth(0.55, 1, g1[u]) : (u === 0 ? (s2[v] < 1 ? 1 : 0) : 1);
      const f = line1 && V2[v].d === 0 ? flatF(u, v) : 0;
      pushBall(pos(u, v, tmpA), R_VERT * thin * size(s) * win(s) * pop, tone(mixInto(colA, P.Lvert, P.Lflat, f * 0.85)));
    }
  }
  for (let v = 1; v < n2; v++) {                     // the second tree's own vertices, growing with gamma
    const s = d1[0] + d2[v];
    if (g2[v] <= 0 || s >= Rp) continue;
    const f = V2[v].d === 0 ? flatF(0, v) : 0;
    pushBall(guide(v, tmpA), R_VERT * thin * size(s) * win(s) * smooth(0.55, 1, g2[v]), tone(mixInto(colA, P.Lvert, P.Lflat, f * 0.85)));
  }
  // the white vertex: whichever vertex of the flat sits in the middle of the frame
  for (let u = 0; u < n1; u++) {
    const su = Math.abs(V1[u].i + S.c1);
    if (V1[u].d !== 0 || su >= 0.5) continue;
    for (let v = 0; v < n2; v++) {
      const sv = Math.abs(V2[v].i + S.c2);
      if (V2[v].d !== 0 || sv >= 0.5) continue;
      const e = smooth(0, 1, 1 - 2 * su) * smooth(0, 1, 1 - 2 * sv);
      pushBall(pos(u, v, tmpA), R_BASE * e, P.Lbase);
    }
  }

  // ── the link of the white vertex: K_{m,n} on a small sphere ──
  shell.visible = lk > 0.002;
  if (shell.visible) {
    pos(0, 0, tmpA);
    shell.position.set(tmpA[0], tmpA[1], tmpA[2]);
    shell.scale.setScalar(LINK_R);
    shellMat.uniforms.uOp.value = lk;
    const dirs1 = T1.nbrs.map(u => unit([G1[3 * u] - G1[0], G1[3 * u + 1] - G1[1], G1[3 * u + 2] - G1[2]]));
    const dirs2 = T2.nbrs.map(v => unit([X2[3 * v] - X2[0], X2[3 * v + 1] - X2[1], X2[3 * v + 2] - X2[2]]));
    const c0 = [tmpA[0], tmpA[1], tmpA[2]], r = R_EDGE * 0.75 * lk;
    for (const d of dirs1) for (const e of dirs2) {
      let prev = null;
      for (let j = 0; j <= ARC_SEG; j++) {
        const q = slerp(d, e, j / ARC_SEG), p = [c0[0] + LINK_R * q[0], c0[1] + LINK_R * q[1], c0[2] + LINK_R * q[2]];
        if (prev) pushTube(prev, p, r, P.Larc);
        prev = p;
      }
    }
    for (const d of dirs1) pushBall([c0[0] + LINK_R * d[0], c0[1] + LINK_R * d[1], c0[2] + LINK_R * d[2]], R_VERT * 1.5 * lk, P.Lt1);
    for (const e of dirs2) pushBall([c0[0] + LINK_R * e[0], c0[1] + LINK_R * e[1], c0[2] + LINK_R * e[2]], R_VERT * 1.5 * lk, P.Lt2);
  }

  tubes.n = ne; balls.n = nb;
  commit(tubes); commit(balls);
  for (const k of ['position', 'aC', 'aA']) {
    const a = sqs.geo.attributes[k];
    a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, ns) * 4 * a.itemSize);
  }
  sqs.geo.setDrawRange(0, ns * 6);
}
function unit(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function slerp(a, b, t) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), om = Math.acos(d);
  if (om < 1e-4) return a.slice();
  const s = Math.sin(om), ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  return [ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2]];
}

/* ───────── theme ───────── */
const mq = matchMedia('(prefers-color-scheme: dark)');
let themePref = qs.get('theme') || (() => { try { return localStorage.getItem('eigenreel-productOfTrees-theme'); } catch (e) { return null; } })() || 'auto';
if (!['auto', 'light', 'dark'].includes(themePref)) themePref = 'auto';
function applyTheme() {
  const name = themePref === 'auto' ? (mq.matches ? 'dark' : 'light') : themePref;
  if (themePref === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = themePref;
  P = palette(name);
  renderer.setClearColor(P.bg, 1);
  shared.uBg.value.set(P.bg);
  shared.uDark.value = P.dark ? 1 : 0;
  sqMat.blending = P.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  sqMat.needsUpdate = true;
  shellMat.uniforms.uColor.value.set(P.shell);
  shellMat.blending = P.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  shellMat.needsUpdate = true;
  document.querySelectorAll('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === themePref));
}
mq.addEventListener('change', () => { if (themePref === 'auto') applyTheme(); });

/* ───────── camera ───────── */
function fitDist(fit) {
  const half = deg(FOV / 2), hHalf = Math.atan(Math.tan(half) * aspect);
  return (fit * 1.04) / Math.tan(Math.min(half, hHalf));
}
function camPose(az, el, fit, ty, pos, target) {
  const d = fitDist(fit);
  target.set(0, ty, 0);
  pos.set(d * Math.cos(el) * Math.cos(az), d * Math.sin(el), d * Math.cos(el) * Math.sin(az)).add(target);
}
const vR = new THREE.Vector3(), vU = new THREE.Vector3(), vB = new THREE.Vector3();
function updateLights() {
  camera.updateMatrixWorld();
  vR.setFromMatrixColumn(camera.matrixWorld, 0);
  vU.setFromMatrixColumn(camera.matrixWorld, 1);
  vB.setFromMatrixColumn(camera.matrixWorld, 2);
  shared.uKey.value.set(0, 0, 0).addScaledVector(vR, -0.45).addScaledVector(vU, 0.8).addScaledVector(vB, 0.55).normalize();
  shared.uFill.value.set(0, 0, 0).addScaledVector(vR, 0.7).addScaledVector(vU, -0.25).addScaledVector(vB, 0.45).normalize();
  shared.uCamPos.value.copy(camera.position);
  const dc = camera.position.distanceTo(controls.target);
  const ext = M.R * 1.25 + 0.6;
  shared.uFog.value.set(Math.max(0.2, dc - ext * 0.6), dc + ext * 1.5, P.fog);
}

/* ───────── the feed ───────── */
const F = newState();
function feedInto(t, out) {
  const s = feedState(t, M.R);
  out.gamma = s.gamma; out.sigma = s.sigma;
  out.phi1 = (s.turn * TAU) / M.m; out.phi2 = (s.turn * TAU) / M.n;
  out.mu = s.mu; out.c1 = s.c1; out.c2 = s.c2; out.lines = s.lines; out.eta = s.eta;
  out.sq = 1; out.link = 0;
  camPose(s.cam.az, s.cam.el, s.cam.fit, s.cam.ty, out.camPos, out.camTarget);
  return out;
}

/* ───────── interact mode ───────── */
const I = {
  flat: true, squares: true, link: false,
  queue: [], anim: null,           // moves wait in the queue; anim is the tween running now
  cam: null, last: null,           // camera tween; the last move (for the readout)
};
const GROW_RATE = 2.4, SWEEP_RATE = 1.5;

function startAnim(kind, to, dur, then) {
  const from = {};
  for (const k of Object.keys(to)) from[k] = D[k];
  I.anim = { kind, from, to, t: 0, dur, then };
}
function nextMove() {
  const mv = I.queue[0];
  if (!mv) return;
  if (mv.type === 'shift') {
    if (D.mu < 1) { startAnim('shape', { mu: 1 }, 0.9 * (1 - D.mu) + 0.25, () => { D.phi1 = D.phi2 = 0; }); tweenCamera('shape', true); return; }
    I.queue.shift();
    startAnim('shift', { c1: mv.d[0], c2: mv.d[1] }, Math.hypot(mv.d[0], mv.d[1]) > 1.2 ? 1.9 : 1.5, () => { D.c1 = D.c2 = 0; });
  } else if (mv.type === 'turn') {
    if (D.mu > 0) { startAnim('shape', { mu: 0 }, 0.9 * D.mu + 0.25); tweenCamera('shape', false); return; }
    I.queue.shift();
    const k = mv.which === 1 ? M.m : M.n, key = mv.which === 1 ? 'phi1' : 'phi2';
    startAnim('turn', { [key]: D[key] + (mv.dir * TAU) / k }, 1.6, () => { D[key] = mod(D[key], TAU); });
  } else if (mv.type === 'shape') {
    I.queue.shift();
    const to = mv.to === 'straight' ? 1 : 0;
    if (Math.abs(D.mu - to) < 1e-6) return;
    startAnim('shape', { mu: to }, 1.3, () => { if (to === 1) D.phi1 = D.phi2 = 0; });
    tweenCamera('shape', to === 1);
  } else if (mv.type === 'settle') {
    I.queue.shift();
    const to = {
      c1: Math.round(D.c1), c2: Math.round(D.c2), mu: D.mu > 0.5 ? 1 : 0,
      phi1: Math.round(D.phi1 / (TAU / M.m)) * (TAU / M.m), phi2: Math.round(D.phi2 / (TAU / M.n)) * (TAU / M.n),
    };
    startAnim('settle', to, 0.8, () => {
      D.c1 = D.c2 = 0; D.phi1 = mod(D.phi1, TAU / M.m); D.phi2 = mod(D.phi2, TAU / M.n);
      if (D.mu === 1) D.phi1 = D.phi2 = 0;
    });
  }
}
function interactStep(dt) {
  // the product keeps itself whole: trees grown, then squares swept
  if (D.gamma < M.R) D.gamma = Math.min(M.R, D.gamma + dt * GROW_RATE);
  else if (D.sigma < M.R) D.sigma = Math.min(M.R, D.sigma + dt * SWEEP_RATE);
  D.eta = approach(D.eta, I.flat ? 1 : 0, 5, dt);
  D.lines = approach(D.lines, I.flat ? 1 : 0, 5, dt);
  D.sq = approach(D.sq, I.squares ? 1 : 0, 6, dt);
  D.link = approach(D.link, I.link ? 1 : 0, 6, dt);
  if (!I.anim) nextMove();
  if (I.anim) {
    const A = I.anim;
    A.t += dt;
    const e = A.kind === 'shape' ? ease5(A.t / A.dur) : ease(A.t / A.dur);
    for (const k of Object.keys(A.to)) D[k] = lerp(A.from[k], A.to[k], e);
    if (A.t >= A.dur) { I.anim = null; if (A.then) A.then(); syncControls(); }
  }
  if (I.cam) {
    I.cam.t += dt;
    const k = ease(I.cam.t / I.cam.dur);
    camera.position.lerpVectors(I.cam.p0, I.cam.p1, k);
    controls.target.lerpVectors(I.cam.t0, I.cam.t1, k);
    if (I.cam.t >= I.cam.dur) I.cam = null;
  }
  controls.update();
  D.camPos.copy(camera.position);
  D.camTarget.copy(controls.target);
}
function move(mv) {
  if (I.queue.length > 6) return;
  I.queue.push(mv);
  I.last = mv;
  updateReadout();
}
// radius to fit: the whole ball, round or straight
const fitFor = straight => (straight ? 1.95 + 0.3 * M.R : 1.6 + 0.3 * M.R);
/** Re-frame the view (keeping the direction it looks from) for the shape the trees are heading to. */
function tweenCamera(kind, straight = D.mu > 0.5) {
  const p1 = new THREE.Vector3(), t1 = new THREE.Vector3();
  const off = camera.position.clone().sub(controls.target);
  const az = Math.atan2(off.z, off.x), el = Math.asin(Math.max(-1, Math.min(1, off.y / off.length())));
  if (kind === 'link' || (kind === 'shape' && I.link)) {
    const d = fitDist(0.95);
    t1.set(0, 0, 0);
    p1.set(d * Math.cos(el) * Math.cos(az), d * Math.sin(el), d * Math.cos(el) * Math.sin(az));
  } else {
    camPose(az, Math.min(1.2, Math.max(el, straight ? 0.45 : 0.22)), fitFor(straight), straight ? 0.25 : 0.3, p1, t1);
  }
  I.cam = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, t: 0, dur: 1.2 };
}

/* ───────── modes ───────── */
let mode = 'feed', feedT = 0, blend = 1;
const snap = newState();
const root = document.documentElement;
const panel = document.getElementById('panel');

function setMode(m) {
  if (m === mode) return;
  mode = m;
  root.classList.toggle('interact', m === 'interact');
  panel.inert = m !== 'interact';
  controls.enabled = m === 'interact';
  hint.classList.remove('show');
  if (m === 'interact') {
    blend = 1;
    I.queue = [{ type: 'settle' }]; I.anim = null; I.last = null;
    I.flat = true;
    controls.target.copy(D.camTarget);
    camera.position.copy(D.camPos);
    controls.update();
    syncControls();
    updateReadout();
    let touched = false;
    const mark = () => { touched = true; };
    canvas.addEventListener('pointerdown', mark, { once: true });
    canvas.addEventListener('wheel', mark, { once: true, passive: true });
    setTimeout(() => {
      canvas.removeEventListener('pointerdown', mark);
      canvas.removeEventListener('wheel', mark);
      if (mode === 'interact' && !touched && !I.cam) tweenCamera('whole', D.mu > 0.5);
    }, 650);
  } else {
    copyState(D, snap);
    I.queue = []; I.anim = null; I.cam = null;
    // rejoin the loop at a moment that looks like what is on screen
    feedT = D.mu > 0.5 ? 26.4 : 13.2;
    blend = 0;
  }
}

function feedStep(dt) {
  feedT = mod(feedT + dt, FEED_T);
  feedInto(feedT, F);
  if (blend < 1) {
    blend = Math.min(1, blend + dt / 1.5);
    const e = ease5(blend);
    for (const k of NUMS) D[k] = lerp(snap[k], F[k], e);
    D.camPos.lerpVectors(snap.camPos, F.camPos, e);
    D.camTarget.lerpVectors(snap.camTarget, F.camTarget, e);
  } else copyState(F, D);
  camera.position.copy(D.camPos);
  camera.lookAt(D.camTarget);
}

/* ───────── panel ───────── */
const $ = id => document.getElementById(id);
const hint = $('hint');
if (matchMedia('(hover: hover) and (pointer: fine)').matches) hint.textContent = 'Click to explore';
const ro = $('ro');

const frac = k => ({ 3: 'a third of a turn', 4: 'a quarter turn', 5: 'a fifth of a turn' }[k]);
function readoutHTML() {
  const m = M.m, n = M.n, mv = I.last;
  const T = (k, c) => `<span class="${c}">\\(T_{${k}}\\)</span>`;
  const facts = `Every vertex has \\(${m} + ${n} = ${m + n}\\) edges and \\(${m} \\cdot ${n} = ${m * n}\\) squares around it. Its link is the complete bipartite graph \\(K_{${m},${n}}\\).`;
  if (!mv) return `<p>${facts}</p>`;
  let s = '';
  if (mv.type === 'shift') {
    const [a, b] = mv.d;
    const name = a && b ? (a > 0 ? '\\(gh\\)' : '\\((gh)^{-1}\\)') : a ? (a > 0 ? '\\(g\\)' : '\\(g^{-1}\\)') : (b > 0 ? '\\(h\\)' : '\\(h^{-1}\\)');
    if (a && b) s = `${name} slides both trees one step along their gold lines at once: a diagonal translation of the gold flat, by \\(\\sqrt 2\\).`;
    else s = `${name} slides ${a ? T(m, 'c1') : T(n, 'c2')} one step along its gold line and leaves ${a ? T(n, 'c2') : T(m, 'c1')} alone. On the gold flat it is a translation by one square.`;
    s += ' The picture after the slide is the same as before.';
  } else if (mv.type === 'turn') {
    const k = mv.which === 1 ? m : n, other = mv.which === 1 ? n : m, cls = mv.which === 1 ? 'c1' : 'c2';
    const name = mv.which === 1 ? '\\(r\\)' : '\\(s\\)';
    s = `${name} turns ${T(k, cls)} ${frac(k)} about its white vertex and leaves ${T(other, mv.which === 1 ? 'c2' : 'c1')} alone. It fixes the white vertex of the product and turns its link \\(K_{${m},${n}}\\). The gold flat moves to another flat.`;
  } else if (mv.type === 'shape') {
    s = mv.to === 'straight'
      ? 'Straight: each tree is drawn along its gold line, so the gold flat is the floor and the slides \\(g, h\\) are rigid.'
      : 'Round: each tree is drawn around the white vertex, so the turns \\(r, s\\) are rigid.';
  } else if (mv.type === 'link') {
    s = `The squares at the white vertex cut a small sphere in \\(${m * n}\\) arcs, one from each blue point to each violet point: the link \\(K_{${m},${n}}\\). Its shortest cycles have length \\(4\\), which is exactly what lets the squares fit together with no positive curvature.`;
  }
  return `<p>${s}</p><p class="faint">${facts}</p>`;
}
let roKey = '';
function updateReadout() {
  const html = readoutHTML();
  if (html === roKey) return;
  roKey = html;
  ro.innerHTML = html;
  typeset([ro]);
}
// MathJax loads async: queue what needs typesetting until it is ready
const mjQueue = new Set();
let mjReady = false;
function typeset(els) {
  for (const e of els) mjQueue.add(e);
  if (mjReady) flushMath();
}
let mjChain = Promise.resolve();
function flushMath() {
  // typeset each element once: drop any that sit inside another queued one, and never overlap two runs
  const all = [...mjQueue];
  mjQueue.clear();
  const els = all.filter(e => !all.some(o => o !== e && o.contains(e)));
  if (els.length) mjChain = mjChain.then(() => window.MathJax.typesetPromise(els)).catch(() => {});
}
function mathReady() { if (!mjReady) { mjReady = true; flushMath(); } }
if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.startup.promise.then(mathReady);
else document.addEventListener('mathjax-ready', mathReady, { once: true });
function typesetPanel() {
  setSub();
  typeset([panel]);
}
function setSub() {
  $('sub').innerHTML = `<span class="c1">\\(T_{${M.m}}\\)</span> \\(\\times\\) <span class="c2">\\(T_{${M.n}}\\)</span>`;
  document.querySelectorAll('.t1name').forEach(e => { e.innerHTML = `\\(T_{${M.m}}\\)`; });
  document.querySelectorAll('.t2name').forEach(e => { e.innerHTML = `\\(T_{${M.n}}\\)`; });
  document.querySelectorAll('.mval').forEach(e => { e.textContent = M.m; });
  document.querySelectorAll('.nval').forEach(e => { e.textContent = M.n; });
  document.querySelectorAll('.kname').forEach(e => { e.innerHTML = `\\(K_{${M.m},${M.n}}\\)`; });
}

function syncControls() {
  document.querySelectorAll('#seg-m button').forEach(b => b.classList.toggle('on', +b.dataset.k === M.m));
  document.querySelectorAll('#seg-n button').forEach(b => b.classList.toggle('on', +b.dataset.k === M.n));
  document.querySelectorAll('#seg-r button').forEach(b => {
    const r = +b.dataset.r;
    b.classList.toggle('on', r === M.R);
    b.disabled = !fitsBudget(M.m, M.n, r);
  });
  const target = I.queue.length ? I.queue[I.queue.length - 1] : null;
  const straight = target && target.type === 'shift' ? true : target && target.type === 'turn' ? false : D.mu > 0.5;
  document.querySelectorAll('#seg-shape button').forEach(b => b.classList.toggle('on', (b.dataset.s === 'straight') === straight));
  $('sw-squares').checked = I.squares;
  $('sw-flat').checked = I.flat;
  $('sw-link').checked = I.link;
}
function setTrees(m, n, R) {
  M.m = m; M.n = n; M.R = R;
  rebuild();
  D.gamma = 0; D.sigma = 0; D.c1 = D.c2 = 0; D.phi1 = D.phi2 = 0;
  I.queue = []; I.anim = null; I.last = null;
  setSub();
  typeset([$('sub'), ...document.querySelectorAll('.t1name, .t2name, .kname')]);
  syncControls();
  roKey = '';
  updateReadout();
  tweenCamera('whole');
}

document.querySelectorAll('#seg-m button').forEach(b => b.addEventListener('click', () => setTrees(+b.dataset.k, M.n, M.R)));
document.querySelectorAll('#seg-n button').forEach(b => b.addEventListener('click', () => setTrees(M.m, +b.dataset.k, M.R)));
document.querySelectorAll('#seg-r button').forEach(b => b.addEventListener('click', () => { if (!b.disabled) setTrees(M.m, M.n, +b.dataset.r); }));
document.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => {
  const [t, x, y] = b.dataset.move.split(',');
  if (t === 'shift') move({ type: 'shift', d: [+x, +y] });
  else move({ type: 'turn', which: +x, dir: +y });
  syncControls();
}));
document.querySelectorAll('#seg-shape button').forEach(b => b.addEventListener('click', () => {
  move({ type: 'shape', to: b.dataset.s });
  syncControls();
}));
$('sw-squares').addEventListener('change', e => { I.squares = e.target.checked; });
$('sw-flat').addEventListener('change', e => { I.flat = e.target.checked; });
$('sw-link').addEventListener('change', e => {
  I.link = e.target.checked;
  if (I.link) { I.last = { type: 'link' }; updateReadout(); }
  tweenCamera(I.link ? 'link' : 'whole');
});
document.querySelectorAll('#theme-seg button').forEach(b => b.addEventListener('click', () => {
  themePref = b.dataset.t;
  try { localStorage.setItem('eigenreel-productOfTrees-theme', themePref); } catch (e) {}
  applyTheme();
}));
$('close').addEventListener('click', () => setMode('feed'));

// a tap (not a swipe) on the feed engages the piece
let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (mode === 'feed' && !EMBED && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 10) setMode('interact');
  down = null;
});

addEventListener('keydown', e => {
  if (EMBED) {
    const dir = { ArrowRight: 'next', ArrowDown: 'next', ArrowLeft: 'prev', ArrowUp: 'prev' }[e.key];
    if (dir) { e.preventDefault(); parent.postMessage({ type: 'iframeNav', direction: dir }, '*'); }
    return;
  }
  if (e.target.closest && e.target.closest('input, textarea')) { if (e.key !== 'Escape') return; }
  if (e.target.closest && e.target.closest('button, summary') && (e.key === ' ' || e.key === 'Enter')) return;
  if (mode === 'feed') {
    if (e.key === 'Enter') { e.preventDefault(); setMode('interact'); }
    return;
  }
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); setMode('feed'); return; }
  let mv = null;
  if (k === 'ArrowRight' || k === 'ArrowLeft') mv = { type: 'shift', d: e.shiftKey ? [0, k === 'ArrowRight' ? 1 : -1] : [k === 'ArrowRight' ? 1 : -1, 0] };
  else if (k === ' ') mv = { type: 'shift', d: e.shiftKey ? [-1, -1] : [1, 1] };
  else if (k === 'r' || k === 'R') mv = { type: 'turn', which: 1, dir: e.shiftKey ? -1 : 1 };
  else if (k === 's' || k === 'S') mv = { type: 'turn', which: 2, dir: e.shiftKey ? -1 : 1 };
  else if (k === 'v' || k === 'V') mv = { type: 'shape', to: D.mu > 0.5 ? 'round' : 'straight' };
  if (mv) { e.preventDefault(); move(mv); syncControls(); }
});

addEventListener('message', e => {
  const m = e.data;
  if (m && typeof m === 'object' && m.type === 'mode' && (m.mode === 'feed' || m.mode === 'interact')) setMode(m.mode);
});

/* ───────── size, loop ───────── */
function resize() {
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (P && tubes) render();   // setSize clears the canvas: never leave it blank until the next frame
}
new ResizeObserver(resize).observe(viewEl);

function step(dt) {
  if (mode === 'feed') feedStep(dt); else interactStep(dt);
  updateLights();
  buildFrame(D);
}
function render() { renderer.render(scene, camera); }

let last = performance.now(), paused = false;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) step(dt);
  render();
  requestAnimationFrame(frame);
}

applyTheme();
rebuild();
resize();
typesetPanel();
if (qs.has('t')) feedT = mod(+qs.get('t') || 0, FEED_T);
feedInto(feedT, F); copyState(F, D);
camera.position.copy(D.camPos); camera.lookAt(D.camTarget);
if (qs.get('mode') === 'interact' && !EMBED) setMode('interact');
else if (!EMBED) {
  setTimeout(() => { if (mode === 'feed') hint.classList.add('show'); }, 2200);
  setTimeout(() => hint.classList.remove('show'), 8000);
}
requestAnimationFrame(frame);

// for testing: step the piece by hand when the pane is hidden and rAF is frozen
window.__pot = {
  step: dt => { step(dt); render(); },
  seek: t => { feedT = mod(t, FEED_T); blend = 1; step(0); render(); },
  setMode, move, setTrees, state: D, I, M,
  pause: v => { paused = v !== false; },
  counts: () => ({ tubes: tubes.n, balls: balls.n, squares: sqs.n }),
  tune: o => { if ('lean' in o) setLean(o.lean[0], o.lean[1]); if ('sqA' in o) P.sqA = o.sqA; if ('fog' in o) P.fog = o.fog; step(0); render(); },
  cam: (az, el, fit, ty) => { camPose(az, el, fit, ty, camera.position, controls.target); camera.lookAt(controls.target); updateLights(); render(); },
  get mode() { return mode; }, get feedT() { return feedT; },
};
