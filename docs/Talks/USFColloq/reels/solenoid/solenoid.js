/**
 * The 3-adic solenoid, as the nested solid tori of the Smale–Williams map.
 *
 *   Sol₃ = ℤ₃ × [0, 1] / (x, 1) ∼ (x + 1, 0)  =  lim← ( S¹ ←z³ S¹ ←z³ S¹ ← ⋯ )
 *
 * Coordinates. A point of the solid torus is (ψ, w): ψ is the angle around the core circle and w is a
 * point of the unit disk, drawn in the meridian plane at ψ (Re w outward, Im w up). The 3-adic integer
 * x = a₀ + 3a₁ + 9a₂ + ⋯ sits, in the cross-section at angle ψ, at
 *
 *   w(ψ, x) = e^{iβ} Σ_{j≥1} λ^{j−1} c · e^{i(ψ + 2π·(x mod 3^j)) / 3^j}.
 *
 * Keeping the first k terms gives the centre line of the k-th tube T_k, a disk of radius λ^k around it.
 * Each term only sees x mod 3^j, so w(ψ + 2π, x) = w(ψ, x + 1): going once around is the odometer +1.
 * For an integer n, w(ψ, n) = w(ψ + 2πn, 0), so one curve Ψ ↦ w(Ψ, 0), Ψ ∈ [0, 2π·3^k], is the whole
 * k-th tube's core, winding 3^k times. T_k is exactly f^k(T₀) for f(θ, w) = (3θ, λw + c e^{i(θ+β)}).
 *
 * Unlike the Crepe-talk version (where only the carrying digits moved, in piecewise arcs), every level
 * here turns continuously at its own rate 1/3^j, so the strands are smooth epicycle curves and the cut
 * face behaves like an orrery.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ───────── constants ───────── */
const TAU = Math.PI * 2;
const RM = 2.0;              // radius of the core circle
const SC = 0.75;             // radius of the solid torus T₀ (the unit disk is drawn this big)
const C = 0.5;               // the three sub-disks sit at distance C from the centre…
const LAM = 0.35;            // …and have radius LAM, in unit-disk units (C + LAM < 1, C√3 > 2·LAM)
const BETA = Math.PI / 2;    // turn of the disk so that the disk of 0 starts at the top
const MAXD = 6;
const POW3 = [1, 3, 9, 27, 81, 243, 729, 2187];
const GAP = 0.9;             // opening of the cut, radians
const FEED_T = 40;           // length of the feed loop, seconds
const OMEGA = 0.1;           // turntable speed in the feed, rad/s
const FOV = 35;
const GROW_S = 1.6;          // seconds to draw one level in interact mode

// samples per turn and around the tube, per level (level 0 is the solid torus, one turn)
const SPEC = [
  { perTurn: 320, radial: 72 },
  { perTurn: 200, radial: 40 },
  { perTurn: 160, radial: 28 },
  { perTurn: 112, radial: 18 },
  { perTurn: 76, radial: 12 },
  { perTurn: 60, radial: 8 },
  { perTurn: 44, radial: 6 },
];

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
const toB3 = (n, k) => { let s = ''; for (let i = 0; i < k; i++) { s = (n % 3) + s; n = Math.floor(n / 3); } return s; };

/* ───────── the geometry ───────── */
// centre of the depth-j tube at strand parameter Ψ, in unit-disk coordinates
function center(j, Psi, out) {
  let x = 0, y = 0, a = C;
  for (let i = 1; i <= j; i++) {
    const th = Psi / POW3[i] + BETA;
    x += a * Math.cos(th); y += a * Math.sin(th);
    a *= LAM;
  }
  out[0] = x; out[1] = y;
  return out;
}
// its derivative in Ψ
function centerD(j, Psi, out) {
  let x = 0, y = 0, a = C;
  for (let i = 1; i <= j; i++) {
    const k = 1 / POW3[i], th = Psi * k + BETA;
    x -= a * k * Math.sin(th); y += a * k * Math.cos(th);
    a *= LAM;
  }
  out[0] = x; out[1] = y;
  return out;
}

const W1 = [0, 0], W2 = [0, 0];
const trig = {};
function ringTrig(radial) {
  if (!trig[radial]) {
    const c = new Float64Array(radial), s = new Float64Array(radial);
    for (let k = 0; k < radial; k++) { c[k] = Math.cos(TAU * k / radial); s[k] = Math.sin(TAU * k / radial); }
    trig[radial] = [c, s];
  }
  return trig[radial];
}

/* One ring of a tube: the circle of radius `radius` (unit-disk units) around the depth-j centre at Ψ,
   lying in the meridian plane at angle Ψ. Rings in meridian planes make the tubes exactly the solid
   tori T_k, so the cut face shows exactly their cross-sections. Normals are exact. */
function writeRing(pos, nor, uu, ring, j, Psi, radial, radius, u) {
  center(j, Psi, W1); centerD(j, Psi, W2);
  const [ca, sa] = ringTrig(radial);
  const cp = Math.cos(Psi), sp = Math.sin(Psi);
  const Pr = SC * W2[0], Py = SC * W2[1];
  for (let k = 0; k < radial; k++) {
    const qx = W1[0] + radius * ca[k], qy = W1[1] + radius * sa[k];
    const rr = RM + SC * qx;
    // outward normal = ∂P/∂a × ∂P/∂Ψ in the right-handed frame (e_r, e_y, e_ψ)
    let nr = ca[k] * rr, ny = sa[k] * rr, np = -sa[k] * Py - ca[k] * Pr;
    const L = 1 / Math.hypot(nr, ny, np);
    nr *= L; ny *= L; np *= L;
    const v = ring * radial + k, o = v * 3;
    pos[o] = rr * cp; pos[o + 1] = SC * qy; pos[o + 2] = rr * sp;
    nor[o] = nr * cp - np * sp; nor[o + 1] = ny; nor[o + 2] = nr * sp + np * cp;
    uu[v] = u;
  }
}

function tubeIndex(samples, radial) {
  const n = samples * radial * 6;
  const idx = (samples + 1) * radial > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  let o = 0;
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      const a = i * radial + k, b = i * radial + k1, c = (i + 1) * radial + k, d = (i + 1) * radial + k1;
      idx[o++] = a; idx[o++] = b; idx[o++] = c;
      idx[o++] = b; idx[o++] = d; idx[o++] = c;
    }
  }
  return idx;
}

function tubeGeometry(j) {
  const turns = POW3[j], { perTurn, radial } = SPEC[j];
  const samples = turns * perTurn, rings = samples + 1, radius = Math.pow(LAM, j);
  const pos = new Float32Array(rings * radial * 3), nor = new Float32Array(rings * radial * 3);
  const uu = new Float32Array(rings * radial);
  for (let i = 0; i < rings; i++) writeRing(pos, nor, uu, i, j, (TAU * turns * i) / samples, radial, radius, i / samples);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(uu, 1));
  g.setIndex(new THREE.BufferAttribute(tubeIndex(samples, radial), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RM + SC);
  return g;
}

/* ───────── colour ───────── */
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function oklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + rgb.map(c => Math.round(clamp01(toSrgb(clamp01(c))) * 255).toString(16).padStart(2, '0')).join('');
}
const mixLab = (h1, h2, t) => { const a = oklab(h1), b = oklab(h2); return fromOklab(a.map((v, i) => lerp(v, b[i], t))); };
function mixLch(h1, h2, t) {
  const [L1, a1, b1] = oklab(h1), [L2, a2, b2] = oklab(h2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  let H1 = Math.atan2(b1, a1), H2 = Math.atan2(b2, a2);
  if (H2 - H1 > Math.PI) H2 -= TAU; else if (H1 - H2 > Math.PI) H2 += TAU;
  const L = lerp(L1, L2, t), Cc = lerp(C1, C2, t), H = lerp(H1, H2, t);
  return fromOklab([L, Cc * Math.cos(H), Cc * Math.sin(H)]);
}

// Palette. `main` and `secondary` are the piece's two colours; the levels run between them.
const BASE = {
  dark: { bg: '#060a14', fg: '#eef1f8', main: '#818cf8', secondary: '#2dd4bf', glow: '#fbbf24',
    torus: '#3b4774', torusRim: '#8d9bc7', torusCap: '#161d31', edge: '#060a14', fog: 0.42 },
  light: { bg: '#ffffff', fg: '#16181e', main: '#5f67cf', secondary: '#0d9488', glow: '#d97706',
    torus: '#c3c9e6', torusRim: '#59627e', torusCap: '#e8ebf6', edge: '#ffffff', fog: 0.34 },
};
function palette(name) {
  const b = BASE[name], dark = name === 'dark';
  const level = [b.torus], rim = [b.torusRim];
  for (let j = 1; j <= MAXD; j++) {
    const h = mixLch(b.main, b.secondary, (j - 1) / (MAXD - 1));
    level.push(h);
    rim.push(dark ? mixLab(h, '#ffffff', 0.3) : mixLab(h, '#000000', 0.22));
  }
  const caps = [];   // caps[depth][j]: coarse levels recede, the finest is full strength
  for (let d = 0; d <= MAXD; d++) {
    caps.push([]);
    for (let j = 0; j <= MAXD; j++) {
      if (j === 0) { caps[d].push(b.torusCap); continue; }
      const t = Math.min(1, j / Math.max(d, 1));
      caps[d].push(dark ? mixLab(b.torusCap, level[j], 0.42 + 0.58 * t) : mixLab('#ffffff', level[j], 0.22 + 0.78 * t));
    }
  }
  return { ...b, name, dark, level, rim, caps };
}

/* ───────── renderer, scene ───────── */
const canvas = document.getElementById('gl');
const viewEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.03, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.minDistance = 1.2;
controls.maxDistance = 40;
controls.enabled = false;
canvas.style.touchAction = '';   // the stylesheet decides (pan-y in the feed, none when engaged)

const group = new THREE.Group();
scene.add(group);

// The cut: a wedge between two planes through the axis, in world coordinates.
const CLIP = [new THREE.Plane(), new THREE.Plane()];

const TUBE_VS = /* glsl */`
attribute float aU;
varying vec3 vN;
varying vec3 vW;
varying float vU;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vU = aU;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;

// One material for every tube: uSolid blends a lit opaque tube into a glassy rim-only ghost.
const TUBE_FS = /* glsl */`
uniform vec3 uColor;
uniform vec3 uRim;
uniform vec3 uHead;
uniform vec3 uBg;
uniform vec3 uKey;
uniform vec3 uFill;
uniform float uOpacity;
uniform float uSolid;
uniform vec2 uGrow;
uniform float uHeadK;
uniform float uHeadAmt;
uniform float uTail;
uniform vec3 uFog;
varying vec3 vN;
varying vec3 vW;
varying float vU;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (vU > uGrow.y || vU < uGrow.x) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.5);
  float dif = max(dot(N, uKey), 0.0);
  float fil = max(dot(N, uFill), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 H = normalize(uKey + V);
  float spec = pow(max(dot(N, H), 0.0), 70.0);
  vec3 solid = uColor * (0.15 + 0.15 * hemi + 0.78 * dif + 0.22 * fil) + vec3(0.5 * spec) + uRim * fres * 0.28;
  float ghostA = 0.03 + 0.8 * fres;
  vec3 col = mix(uRim, solid, uSolid);
  float a = mix(ghostA, 1.0, uSolid);
  float g = clamp(uHeadAmt * exp(-max(uGrow.y - vU, 0.0) * uHeadK), 0.0, 1.0);
  col = mix(col, uHead * (0.85 + 0.35 * dif), g * g);
  a = max(a, g);
  if (uTail > 0.0) a *= smoothstep(uGrow.x, uGrow.x + uTail, vU);
  float dist = length(cameraPosition - vW);
  col = mix(col, uBg, smoothstep(uFog.x, uFog.y, dist) * uFog.z);
  gl_FragColor = vec4(col, a * uOpacity);
  #include <colorspace_fragment>
}`;

const shared = {
  uKey: { value: new THREE.Vector3(0, 1, 0) },
  uFill: { value: new THREE.Vector3(1, 0, 0) },
  uBg: { value: new THREE.Color() },
  uFog: { value: new THREE.Vector3(5, 12, 0.3) },
};
function makeTubeMaterial(clip) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uHead: { value: new THREE.Color() },
      uOpacity: { value: 1 }, uSolid: { value: 1 }, uGrow: { value: new THREE.Vector2(0, 1.01) },
      uHeadK: { value: 10 }, uHeadAmt: { value: 0 }, uTail: { value: 0 },
    },
    vertexShader: TUBE_VS, fragmentShader: TUBE_FS,
    transparent: true, depthWrite: true, side: THREE.FrontSide,
    clipping: clip, clippingPlanes: clip ? CLIP : null, clipIntersection: true,
  });
}

const CAP_VS = /* glsl */`
varying vec2 vP;
void main() {
  vP = position.xy;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const CAP_FS = /* glsl */`
uniform vec3 uColor;
uniform vec3 uEdge;
varying vec2 vP;
void main() {
  float d = length(vP);
  float w = fwidth(d);
  float e = smoothstep(0.92 - w, 0.97, d);
  vec3 col = mix(uColor * (1.06 - 0.1 * d * d), uEdge, e * 0.5);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/* tubes: built lazily (level 6 only when asked for) */
const tubes = [];
for (let j = 0; j <= MAXD; j++) tubes.push({ mesh: null, mat: makeTubeMaterial(true) });
function ensureTube(j) {
  const T = tubes[j];
  if (!T.mesh) { T.mesh = new THREE.Mesh(tubeGeometry(j), T.mat); T.mesh.visible = false; group.add(T.mesh); }
  return T;
}

/* caps: the cross-section disks on both faces of the cut */
const capSegs = [72, 56, 40, 28, 18, 12, 10];
const caps = [];
for (let j = 0; j <= MAXD; j++) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() } },
    vertexShader: CAP_VS, fragmentShader: CAP_FS, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -(j + 1), polygonOffsetUnits: -2 * (j + 1),
  });
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, capSegs[j]), mat, 2 * POW3[j]);
  mesh.frustumCulled = false;
  mesh.visible = false;
  group.add(mesh);
  caps.push(mesh);
}

/* the bead, its glow, and its wake along the finest tube */
const beadMat = makeTubeMaterial(false);
const bead = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), beadMat);
bead.renderOrder = 2;
bead.visible = false;
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false }));
glow.renderOrder = 50;
glow.visible = false;
group.add(bead, glow);

const WAKE_MAX = 300, WAKE_RAD = 12;
const wakeGeo = new THREE.BufferGeometry();
const wakePos = new Float32Array((WAKE_MAX + 1) * WAKE_RAD * 3), wakeNor = new Float32Array(wakePos.length);
const wakeU = new Float32Array((WAKE_MAX + 1) * WAKE_RAD);
wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePos, 3).setUsage(THREE.DynamicDrawUsage));
wakeGeo.setAttribute('normal', new THREE.BufferAttribute(wakeNor, 3).setUsage(THREE.DynamicDrawUsage));
wakeGeo.setAttribute('aU', new THREE.BufferAttribute(wakeU, 1).setUsage(THREE.DynamicDrawUsage));
wakeGeo.setIndex(new THREE.BufferAttribute(tubeIndex(WAKE_MAX, WAKE_RAD), 1));
const wakeMat = makeTubeMaterial(true);
wakeMat.depthWrite = false;
wakeMat.uniforms.uTail.value = 0.55;
const wake = new THREE.Mesh(wakeGeo, wakeMat);
wake.frustumCulled = false;
wake.renderOrder = 3;
wake.visible = false;
group.add(wake);
let wakeKey = '';
function updateWake(d, Psi0, Psi1) {
  const key = `${d}|${Psi0.toFixed(5)}|${Psi1.toFixed(5)}`;
  if (key === wakeKey) return;
  wakeKey = key;
  const samples = Math.max(2, Math.min(WAKE_MAX, Math.ceil(((Psi1 - Psi0) / TAU) * 140)));
  const radius = Math.pow(LAM, d) * 1.1;
  for (let i = 0; i <= samples; i++) writeRing(wakePos, wakeNor, wakeU, i, d, lerp(Psi0, Psi1, i / samples), WAKE_RAD, radius, i / samples);
  for (const k of ['position', 'normal', 'aU']) {
    const a = wakeGeo.attributes[k]; a.needsUpdate = true;
    a.clearUpdateRanges(); a.addUpdateRange(0, (samples + 1) * WAKE_RAD * a.itemSize);
  }
  wakeGeo.setDrawRange(0, samples * WAKE_RAD * 6);
}

/* ───────── theme ───────── */
const mq = matchMedia('(prefers-color-scheme: dark)');
let themePref = qs.get('theme') || (() => { try { return localStorage.getItem('eigenreel-solenoid-theme'); } catch (e) { return null; } })() || 'auto';
if (!['auto', 'light', 'dark'].includes(themePref)) themePref = 'auto';
let P = null;
function applyTheme() {
  const name = themePref === 'auto' ? (mq.matches ? 'dark' : 'light') : themePref;
  if (themePref === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = themePref;
  P = palette(name);
  renderer.setClearColor(P.bg, 1);
  shared.uBg.value.set(P.bg);
  for (let j = 0; j <= MAXD; j++) {
    const u = tubes[j].mat.uniforms;
    u.uColor.value.set(P.level[j]); u.uRim.value.set(P.rim[j]); u.uHead.value.set(P.glow);
    caps[j].material.uniforms.uEdge.value.set(P.edge);
  }
  for (const m of [beadMat, wakeMat]) { m.uniforms.uColor.value.set(P.glow); m.uniforms.uRim.value.set(P.glow); m.uniforms.uHead.value.set(P.glow); }
  glow.material.color.set(P.glow);
  glow.material.blending = P.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  glow.material.needsUpdate = true;
  capDepth = -1;
  document.querySelectorAll('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === themePref));
}
mq.addEventListener('change', () => { if (themePref === 'auto') applyTheme(); });

/* ───────── display state: everything the frame shows ───────── */
function newState() {
  return {
    p: [1, 0, 0, 0, 0, 0, 0],   // p[j]: how much of tube j is drawn (0…1, linear in time)
    gap: 0,                     // opening of the cut
    rotY: 0,                    // turn of the whole torus
    psi: 0,                     // angle of the cut face, in the torus's own coordinates (unwrapped)
    nb: 0,                      // the bead's 3-adic address (its disk at ψ = 0)
    bead: 0, wake: 0,           // their opacities
    wakeFrom: 0,                // ψ where the bead's lit path begins
    camPos: new THREE.Vector3(0, 4, 8), camTarget: new THREE.Vector3(),
  };
}
function copyState(a, b) {
  b.p = a.p.slice(); b.gap = a.gap; b.rotY = a.rotY; b.psi = a.psi; b.nb = a.nb;
  b.bead = a.bead; b.wake = a.wake; b.wakeFrom = a.wakeFrom;
  b.camPos.copy(a.camPos); b.camTarget.copy(a.camTarget);
  return b;
}
const finestInt = p => { let f = 0; for (let j = 1; j <= MAXD; j++) if (p[j] > 0) f = j; return f; };
const finestCont = p => { let f = 0; for (let j = 1; j <= MAXD; j++) f += Math.min(1, p[j] * 6); return f; };

const D = newState();
let capDepth = -1;

function apply(S) {
  const fc = finestCont(S.p), fi = finestInt(S.p);
  group.rotation.y = S.rotY;

  // tubes: the finest one is solid, the ones around it are glass, fading with distance
  for (let j = 0; j <= MAXD; j++) {
    const pj = j === 0 ? 1 : S.p[j];
    if (pj <= 0) { if (tubes[j].mesh) tubes[j].mesh.visible = false; continue; }
    const T = ensureTube(j), u = T.mat.uniforms;
    const solid = clamp01(1 - (j < MAXD ? S.p[j + 1] : 0) * 6);
    const ghostOp = 0.2 + 0.8 * Math.pow(0.55, Math.max(0, fc - 1 - j));
    u.uSolid.value = solid;
    u.uOpacity.value = lerp(ghostOp, 1, solid);
    u.uGrow.value.set(0, pj >= 1 ? 1.01 : ease(pj));
    u.uHeadAmt.value = j === 0 ? 0 : smooth(0, 0.03, pj) * (1 - smooth(0.94, 1, pj));
    u.uHeadK.value = 14 * POW3[j];   // the glow fades over about a twelfth of a turn
    T.mat.depthWrite = solid > 0.95;
    T.mesh.renderOrder = solid > 0.95 ? 1 : 10 + (fi - j);
    T.mesh.visible = true;
  }

  // the cut, in world coordinates: the face at local angle ψ sits at world angle ψ − rotY
  const open = S.gap > 0.0015;
  const A = S.psi - S.rotY, B = A + S.gap;
  if (open) {
    CLIP[0].normal.set(Math.sin(A), 0, -Math.cos(A)); CLIP[0].constant = 0;
    CLIP[1].normal.set(-Math.sin(B), 0, Math.cos(B)); CLIP[1].constant = 0;
  } else {
    CLIP[0].normal.set(0, 1, 0); CLIP[0].constant = 1e4;   // nothing is on the negative side of both
    CLIP[1].normal.set(0, 1, 0); CLIP[1].constant = 1e4;
  }

  // caps
  if (capDepth !== fi) {
    capDepth = fi;
    for (let j = 0; j <= MAXD; j++) caps[j].material.uniforms.uColor.value.set(P.caps[fi][j]);
  }
  for (let j = 0; j <= MAXD; j++) caps[j].visible = open && (j === 0 || S.p[j] > 0);
  if (open) updateCaps(S.psi, S.psi + S.gap, fi, S.p);

  // bead and wake
  const nbEff = fi ? mod(S.nb, POW3[fi]) : 0;
  const showBead = open && fi > 0 && S.bead > 0.01;
  bead.visible = glow.visible = showBead;
  if (showBead) {
    center(fi, S.psi + TAU * nbEff, W1);
    const cp = Math.cos(S.psi), sp = Math.sin(S.psi);
    const rb = Math.max(SC * Math.pow(LAM, fi) * 1.25, 0.017) * (0.4 + 0.6 * S.bead);
    const rr = RM + SC * W1[0], off = rb * 0.55;
    bead.position.set(rr * cp - off * sp, SC * W1[1], rr * sp + off * cp);
    bead.scale.setScalar(rb);
    beadMat.uniforms.uOpacity.value = S.bead;
    glow.position.copy(bead.position);
    glow.scale.setScalar(rb * 7.5);
    glow.material.opacity = S.bead * (P.dark ? 0.85 : 0.5);
  }
  const from = Math.max(S.wakeFrom, S.psi - 2 * TAU);
  const showWake = fi > 0 && S.wake > 0.01 && S.psi - from > 0.004 && S.p[fi] >= 1;
  wake.visible = showWake;
  if (showWake) {
    updateWake(fi, from + TAU * nbEff, S.psi + TAU * nbEff);
    wakeMat.uniforms.uOpacity.value = S.wake;
  }

  camera.position.copy(S.camPos);
}

function updateCaps(psiA, psiB, depth, p) {
  for (let j = 0; j <= depth; j++) {
    const mesh = caps[j], arr = mesh.instanceMatrix.array, n = POW3[j];
    const rad = SC * Math.pow(LAM, j) * (j === 0 ? 1 : smooth(0, 1, p[j]));
    let idx = 0;
    for (let f = 0; f < 2; f++) {
      const psi = f === 0 ? psiA : psiB, side = f === 0 ? 1 : -1;
      const cp = Math.cos(psi), sp = Math.sin(psi), eps = side * 0.0005 * j;
      for (let m = 0; m < n; m++, idx++) {
        center(j, psi + TAU * m, W1);
        const rr = RM + SC * W1[0], o = idx * 16;
        arr[o] = rad * cp; arr[o + 1] = 0; arr[o + 2] = rad * sp; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = rad; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = -sp * side; arr[o + 9] = 0; arr[o + 10] = cp * side; arr[o + 11] = 0;
        arr[o + 12] = rr * cp - eps * sp; arr[o + 13] = SC * W1[1]; arr[o + 14] = rr * sp + eps * cp; arr[o + 15] = 1;
      }
    }
    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ───────── camera poses ───────── */
let aspect = 1;
const deg = THREE.MathUtils.degToRad;
const elevFor = a => (a >= 1 ? 0.6 : lerp(0.6, 1.0, clamp01((1 - a) / 0.5)));
function wholeDist(a, el) {
  const half = deg(FOV / 2), hHalf = Math.atan(Math.tan(half) * a), Rb = RM + SC;
  const dW = (Rb * 1.12) / Math.tan(hHalf);
  const dH = ((Rb * Math.sin(el) + SC * Math.cos(el)) * 1.2) / Math.tan(half);
  return Math.max(dW, dH);
}
function orbitPose(az, el, a, pos, target) {
  const d = wholeDist(a, el);
  target.set(0, -0.04, 0);
  pos.set(d * Math.cos(el) * Math.cos(az), d * Math.sin(el), d * Math.cos(el) * Math.sin(az)).add(target);
}
// looking into the cut at world angle A, from the gap side, outward to the right
function facePose(A, a, pos, target) {
  const half = deg(FOV / 2), hHalf = Math.atan(Math.tan(half) * a);
  const d = (SC * 1.2) / Math.tan(Math.min(half, hHalf));
  const er = new THREE.Vector3(Math.cos(A), 0, Math.sin(A)), ep = new THREE.Vector3(-Math.sin(A), 0, Math.cos(A));
  const dir = ep.multiplyScalar(0.8).addScaledVector(er, 0.5).add(new THREE.Vector3(0, 0.32, 0)).normalize();
  target.copy(er).multiplyScalar(RM);
  pos.copy(target).addScaledVector(dir, d);
}

/* ───────── the feed: a 40-second loop with no text ─────────
   torus → tubes 1…5 draw themselves, each inside the last → the cut opens, the camera looks in,
   the cut face turns twice around (+1, +1) with the bead riding along → everything winds back up. */
const GROW = [[2.0, 5.6], [6.0, 9.4], [9.8, 13.0], [13.4, 16.6], [17.0, 20.2]];
const UNWIND = [[37.4, 38.6], [36.9, 37.9], [36.4, 37.4], [35.9, 36.9], [35.4, 36.4]];
const SWEEPS = [[24.2, 28.4], [29.4, 33.6]];
const AZ0 = 1.15, A_FEED = AZ0 - 0.55;
const F = newState(), poseA = { pos: new THREE.Vector3(), target: new THREE.Vector3() }, poseB = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
function feedState(t, out) {
  for (let j = 1; j <= MAXD; j++) {
    if (j > 5) { out.p[j] = 0; continue; }
    const [a, b] = GROW[j - 1], [c, d] = UNWIND[j - 1];
    out.p[j] = t < c ? clamp01((t - a) / (b - a)) : 1 - clamp01((t - c) / (d - c));
  }
  let sweep = 0;
  for (const [a, b] of SWEEPS) sweep += TAU * ease((t - a) / (b - a));
  out.rotY = OMEGA * t + sweep;
  out.psi = A_FEED + out.rotY;              // the cut stays put in the world while the torus turns
  out.gap = GAP * smooth(21.0, 22.6, t) * (1 - smooth(34.2, 35.6, t));
  out.bead = smooth(23.2, 23.9, t) * (1 - smooth(33.8, 34.5, t));
  out.wake = out.bead;
  out.wakeFrom = A_FEED + OMEGA * SWEEPS[0][0];
  out.nb = 0;
  const el = elevFor(aspect) + 0.05 * Math.sin((TAU * t) / FEED_T + 1.0);
  const az = AZ0 + 0.16 * Math.sin((TAU * t) / FEED_T);
  orbitPose(az, el, aspect, poseA.pos, poseA.target);
  facePose(A_FEED, aspect, poseB.pos, poseB.target);
  const e = ease5((t - 20.6) / 3.0) * (1 - ease5((t - 34.0) / 3.0));
  out.camPos.lerpVectors(poseA.pos, poseB.pos, e);
  out.camTarget.lerpVectors(poseA.target, poseB.target, e);
  out.face = e;
  return out;
}

/* ───────── interact mode ───────── */
const I = {
  depth: 4, cut: true, follow: true, wakeOn: true,
  A: 0,                 // world angle of the cut while following
  tw: null,             // ψ tween
  cam: null,            // camera tween
};

function interactStep(dt) {
  // tubes grow one after another and unwind from the top down
  for (let j = 1; j <= MAXD; j++) {
    if (j <= I.depth) { if (j === 1 || D.p[j - 1] >= 1) D.p[j] = Math.min(1, D.p[j] + dt / GROW_S); }
    else if (j === MAXD || D.p[j + 1] <= 0) D.p[j] = Math.max(0, D.p[j] - dt / 0.55);
  }
  D.gap = approach(D.gap, I.cut ? GAP : 0, 6, dt);
  if (I.tw) {
    I.tw.t += dt;
    D.psi = lerp(I.tw.from, I.tw.to, ease(I.tw.t / I.tw.dur));
    if (I.tw.t >= I.tw.dur) { D.psi = I.tw.to; I.tw = null; }
  }
  if (I.follow) D.rotY = D.psi - I.A; else I.A = D.psi - D.rotY;
  D.bead = approach(D.bead, I.cut ? 1 : 0, 6, dt);
  D.wake = approach(D.wake, I.cut && I.wakeOn ? 1 : 0, 6, dt);
  if (D.psi < D.wakeFrom) D.wakeFrom = D.psi;

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

function tweenPsi(to, dur) { I.tw = { from: D.psi, to, t: 0, dur }; }
function turn(k) {
  const base = I.tw ? I.tw.to : D.psi;
  const to = Math.round((base / TAU) * 1000) / 1000 * TAU + k * TAU;
  tweenPsi(to, 2.2);
}
function tweenCamera(kind) {
  const p1 = new THREE.Vector3(), t1 = new THREE.Vector3();
  if (kind === 'face') facePose(D.psi - D.rotY, aspect, p1, t1);
  else {
    const off = camera.position.clone().sub(controls.target);
    orbitPose(Math.atan2(off.z, off.x), elevFor(aspect), aspect, p1, t1);
  }
  I.cam = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, t: 0, dur: 1.4 };
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
    // take over from wherever the feed is
    const fi = finestInt(D.p);
    I.depth = Math.max(3, Math.min(5, Math.ceil(finestCont(D.p)) || fi || 3));
    I.cut = true;
    const q = Math.floor(D.psi / TAU);
    D.psi -= q * TAU; D.rotY -= q * TAU;
    I.A = D.psi - D.rotY;
    const settle = Math.round(D.psi / TAU) * TAU;      // land on a whole turn, so the labels sit in slots
    tweenPsi(settle, 1.2);
    D.wakeFrom = settle;
    D.nb = 0;
    controls.target.copy(D.camTarget);
    camera.position.copy(D.camPos);
    controls.update();
    syncControls();
    // once the canvas has made room for the panel, re-frame for its new shape
    const kind = F.face > 0.5 && blend >= 1 ? 'face' : 'whole';
    let touched = false;
    const mark = () => { touched = true; };
    canvas.addEventListener('pointerdown', mark, { once: true });
    canvas.addEventListener('wheel', mark, { once: true, passive: true });
    setTimeout(() => {
      canvas.removeEventListener('pointerdown', mark);
      canvas.removeEventListener('wheel', mark);
      if (mode === 'interact' && !touched && !I.cam) tweenCamera(kind);
    }, 650);
  } else {
    copyState(D, snap);
    const q = Math.round(snap.rotY / TAU);
    snap.rotY -= q * TAU; snap.psi -= q * TAU;
    feedT = 0; blend = 0;
    I.tw = null; I.cam = null;
  }
}

function feedStep(dt) {
  feedT += dt;
  if (feedT >= FEED_T) feedT -= FEED_T;
  feedState(feedT, F);
  if (blend < 1) {
    blend = Math.min(1, blend + dt / 1.6);
    const e = ease5(blend);
    for (let j = 1; j <= MAXD; j++) D.p[j] = lerp(snap.p[j], F.p[j], e);
    D.gap = lerp(snap.gap, F.gap, e);
    D.rotY = lerp(snap.rotY, F.rotY, e);
    D.psi = lerp(snap.psi, F.psi, e);
    D.bead = lerp(snap.bead, F.bead, e);
    D.wake = lerp(snap.wake, F.wake, e);
    D.nb = blend < 0.5 ? snap.nb : F.nb;
    D.wakeFrom = blend < 0.5 ? snap.wakeFrom : F.wakeFrom;
    D.camPos.lerpVectors(snap.camPos, F.camPos, e);
    D.camTarget.lerpVectors(snap.camTarget, F.camTarget, e);
  } else copyState(F, D);
  camera.position.copy(D.camPos);
  camera.lookAt(D.camTarget);
}

/* ───────── lights follow the camera ───────── */
const vR = new THREE.Vector3(), vU = new THREE.Vector3(), vB = new THREE.Vector3();
function updateLights() {
  camera.updateMatrixWorld();
  vR.setFromMatrixColumn(camera.matrixWorld, 0);
  vU.setFromMatrixColumn(camera.matrixWorld, 1);
  vB.setFromMatrixColumn(camera.matrixWorld, 2);
  shared.uKey.value.set(0, 0, 0).addScaledVector(vR, -0.45).addScaledVector(vU, 0.8).addScaledVector(vB, 0.55).normalize();
  shared.uFill.value.set(0, 0, 0).addScaledVector(vR, 0.7).addScaledVector(vU, -0.25).addScaledVector(vB, 0.45).normalize();
  const dc = camera.position.length();
  shared.uFog.value.set(Math.max(0.2, dc - RM - SC * 0.5), dc + RM + SC, P.fog);
}

/* ───────── the cross-section inset (interact mode) ───────── */
const inset = document.getElementById('inset');
const ictx = inset.getContext('2d');
let insetGeom = null;
function sizeInset() {
  const w = inset.clientWidth;
  if (!w) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  inset.width = inset.height = Math.round(w * dpr);
}
function drawInset() {
  const Wd = inset.width;
  if (!Wd) return;
  const dpr = Wd / inset.clientWidth, g = ictx;
  g.clearRect(0, 0, Wd, Wd);
  const R = Wd * 0.47, cx = Wd / 2, cy = Wd / 2;
  const d = finestInt(D.p), psi = D.psi;
  insetGeom = { R, cx, cy, d, psi, dpr };
  const caps = P.caps[d];
  for (let j = 0; j <= d; j++) {
    const n = POW3[j], r = R * Math.pow(LAM, j) * (j === 0 ? 1 : smooth(0, 1, D.p[j]));
    if (r < 0.15) continue;
    g.fillStyle = caps[j];
    g.beginPath();
    for (let m = 0; m < n; m++) {
      center(j, psi + TAU * m, W1);
      const x = cx + R * W1[0], y = cy - R * W1[1];
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
    g.fill();
  }
  // the bead, under the labels so its disk's label stays readable
  if (d > 0 && D.bead > 0.01) {
    center(d, psi + TAU * mod(D.nb, POW3[d]), W1);
    const x = cx + R * W1[0], y = cy - R * W1[1], r = Math.max(R * Math.pow(LAM, d) * 1.05, 4.5 * dpr);
    g.globalAlpha = D.bead;
    g.beginPath(); g.arc(x, y, r + 2 * dpr, 0, TAU); g.fillStyle = P.bg; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = P.glow; g.fill();
    g.globalAlpha = 1;
  }
  // labels: the starting address of each disk two levels down (one, at depth 1)
  const L = Math.min(d, 2);
  if (L >= 1) {
    const n = POW3[L], fs = Math.max(9 * dpr, Math.min(19 * dpr, R * Math.pow(LAM, L) * 0.6));
    g.font = `600 ${fs}px 'JetBrains Mono', ui-monospace, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 3.2 * dpr;
    g.strokeStyle = P.dark ? 'rgba(6,10,20,0.75)' : 'rgba(255,255,255,0.85)';
    g.fillStyle = P.fg;
    for (let m = 0; m < n; m++) {
      center(L, psi + TAU * m, W1);
      const x = cx + R * W1[0], y = cy - R * W1[1], s = toB3(m, L);
      g.strokeText(s, x, y); g.fillText(s, x, y);
    }
  }
}
inset.addEventListener('click', e => {
  if (!insetGeom || !insetGeom.d) return;
  const { R, cx, cy, d, psi, dpr } = insetGeom;
  const wx = (e.offsetX * dpr - cx) / R, wy = (cy - e.offsetY * dpr) / R;
  if (Math.hypot(wx, wy) > 1.05) return;
  let best = 0, bd = Infinity;
  for (let m = 0; m < POW3[d]; m++) {
    center(d, psi + TAU * m, W1);
    const dd = (W1[0] - wx) ** 2 + (W1[1] - wy) ** 2;
    if (dd < bd) { bd = dd; best = m; }
  }
  D.nb = best;
  D.wakeFrom = D.psi;
});

/* ───────── readouts and controls ───────── */
const $ = id => document.getElementById(id);
const hint = $('hint');
if (matchMedia('(hover: hover) and (pointer: fine)').matches) hint.textContent = 'Click to explore';
const rTurn = $('r-turn'), rBead = $('r-bead'), rDepth = $('r-depth'), frac = $('frac');
let lastRead = '';
function updateReadout() {
  const turns = D.psi / TAU, whole = Math.round(turns), near = Math.abs(turns - whole) < 0.004;
  const d = finestInt(D.p), n = POW3[d] || 1;
  const nb = mod(D.nb, n), m = Math.floor(turns + 1e-6);
  let bead = '';
  if (d > 0) {
    const addr = k => `<span class="mono">…${toB3(mod(k, n), d)}</span>`;
    bead = near
      ? `<b>Bead</b> ${addr(nb)} now sits where ${addr(nb + whole)} began`
      : `<b>Bead</b> ${addr(nb)} is between ${addr(nb + m)} and ${addr(nb + m + 1)}`;
  }
  const key = `${turns.toFixed(2)}|${bead}|${I.depth}`;
  if (key === lastRead) return;
  lastRead = key;
  rTurn.textContent = `turn ${turns.toFixed(2)}`;
  rBead.innerHTML = bead;
  rDepth.textContent = `Tube ${I.depth} is ℤ/${POW3[I.depth]} glued up: one circle, ${POW3[I.depth]} times around.`;
  if (document.activeElement !== frac) {
    let f = turns - Math.floor(turns);
    if (f > 0.9995) f = 0;   // a whole turn reads as the start of the next one
    frac.value = f.toFixed(3);
  }
}

function syncControls() {
  document.querySelectorAll('#depth button').forEach(b => b.classList.toggle('on', +b.dataset.d === I.depth));
  $('sw-cut').checked = I.cut;
  $('sw-follow').checked = I.follow;
  $('sw-wake').checked = I.wakeOn;
  lastRead = '';
}
function setDepth(d) {
  I.depth = Math.max(1, Math.min(MAXD, d));
  D.wakeFrom = D.psi;
  syncControls();
}

$('plus1').addEventListener('click', () => turn(1));
$('minus1').addEventListener('click', () => turn(-1));
frac.addEventListener('input', () => {
  I.tw = null;
  const m = Math.floor(D.psi / TAU + 1e-9);
  D.psi = TAU * (m + +frac.value);
});
document.querySelectorAll('#depth button').forEach(b => b.addEventListener('click', () => setDepth(+b.dataset.d)));
$('sw-cut').addEventListener('change', e => { I.cut = e.target.checked; });
$('sw-follow').addEventListener('change', e => { I.follow = e.target.checked; if (I.follow) I.A = D.psi - D.rotY; });
$('sw-wake').addEventListener('change', e => { I.wakeOn = e.target.checked; if (I.wakeOn) D.wakeFrom = D.psi; });
document.querySelectorAll('#view-seg button').forEach(b => b.addEventListener('click', () => {
  tweenCamera(b.dataset.v);
  document.querySelectorAll('#view-seg button').forEach(x => x.classList.toggle('on', x === b));
}));
document.querySelectorAll('#theme-seg button').forEach(b => b.addEventListener('click', () => {
  themePref = b.dataset.t;
  try { localStorage.setItem('eigenreel-solenoid-theme', themePref); } catch (e) {}
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
    // the parent presentation owns the arrows
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
  if (e.key === 'Escape') { e.preventDefault(); setMode('feed'); }
  else if (e.key === ' ') { e.preventDefault(); turn(e.shiftKey ? -1 : 1); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const base = I.tw ? I.tw.to : D.psi;
    tweenPsi(base + (e.key === 'ArrowRight' ? 1 : -1) * TAU / 24, 0.35);
  } else if (/^[1-6]$/.test(e.key)) setDepth(+e.key);
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
}
new ResizeObserver(resize).observe(viewEl);
new ResizeObserver(() => { sizeInset(); }).observe(inset);

function step(dt) {
  if (mode === 'feed') feedStep(dt); else interactStep(dt);
  apply(D);
  updateLights();
  if (mode === 'interact') { drawInset(); updateReadout(); }
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
resize();
sizeInset();
// build the first tubes now and the rest a little later, so the first frame is quick
ensureTube(0); ensureTube(1);
[2, 3, 4, 5].forEach((j, i) => setTimeout(() => ensureTube(j), 120 + 90 * i));
if (qs.get('mode') === 'interact' && !EMBED) { feedState(0, F); copyState(F, D); setMode('interact'); }
else if (!EMBED) {
  setTimeout(() => { if (mode === 'feed') hint.classList.add('show'); }, 2200);
  setTimeout(() => hint.classList.remove('show'), 8000);
}
if (qs.has('t')) feedT = Math.max(0, Math.min(FEED_T - 0.001, +qs.get('t') || 0));
requestAnimationFrame(frame);

// for testing: step the piece by hand when the pane is hidden and rAF is frozen
window.__sol = {
  step: dt => { step(dt); render(); },
  seek: t => { feedT = mod(t, FEED_T); blend = 1; step(0); render(); },
  setMode, turn, setDepth, state: D, I,
  pause: v => { paused = v !== false; },
  get mode() { return mode; }, get feedT() { return feedT; },
};
