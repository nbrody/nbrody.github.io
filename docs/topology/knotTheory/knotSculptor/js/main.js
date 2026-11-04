// Knot Sculptor — draw a knot in the air (WebXR hand tracking on Meta Quest, or a mouse), then study it:
// invariants, its projections, a Seifert surface, and the sphere of viewing directions.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { tubeGeometry } from './tube.js';
import { XRInput } from './hands.js';
import { THEMES, renderInfo, renderProjection, renderMenu, projectionData } from './panels.js';
import { P } from './poly.js';
import { KNOT_TABLE } from './knotTable.js';
import { nameTex } from './identify.js';
import * as B from './builders.js';
import { resampleBySpacing, normalizeSize, safeSmooth, liftPlanarCurve, resampleClosed, centroid, radius, closedLength } from './knot.js';
import { projectDiagram } from './diagram.js';
import { texImage } from './mathTex.js';

// ───────────────────────────── constants & state ─────────────────────────────
const TUBE_R = 0.0042;          // tube radius (m, knot-local)
const SPACING = 0.007;          // vertex spacing of finished strands
const HOME = new THREE.Vector3(0, 1.25, -0.5);
const TAU = 2 * Math.PI;

const S = {
  comps: [], history: [], typeVersion: 0, shapeVersion: 0,
  // mode 'draw' = the next stroke is armed (New knot, or Add strand when addStrand); 'move' = pinches grab.
  // With nothing on screen the drawing hand always draws. pristine = still the startup knot, untouched.
  mode: 'move', drawHand: 'right', addStrand: false, crossMode: 'alternate', pristine: true,
  relax: false, surface: false, level: TAU / 2 * 2, sweep: false, flatten: false, circles: false, globe: true,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  lib: 1, analysis: null, geometry: null, xrMode: null,
};
S.level = Math.PI * 2;
const th = () => THEMES[S.theme];
const drawArmed = () => S.mode === 'draw' || !S.comps.length;
let tipUntil = 0;

// ───────────────────────────── library ─────────────────────────────
const LIBRARY = [
  { tex: '0_1', nick: 'Unknot', make: () => B.PRESETS.unknot() },
  { tex: '3_1', nick: 'Trefoil', make: () => B.PRESETS.trefoil() },
  { tex: '4_1', nick: 'Figure-eight', make: () => B.PRESETS.figureEight() },
  { tex: '5_1', nick: 'Cinquefoil', make: () => B.PRESETS.torus(2, 5) },
];
for (const e of KNOT_TABLE) {
  if (e.kind !== 'knot' || ['3_1', '4_1', '5_1'].includes(e.name)) continue;
  const torus = { '7_1': [2, 7], '8_19': [3, 4] }[e.name];
  LIBRARY.push({ tex: nameTex(e.name), nick: e.nick, make: torus ? () => B.PRESETS.torus(...torus) : () => curvesOf(e.recipe), relax: !torus });
}
LIBRARY.push(
  { tex: '3_1 \\# 3_1', nick: 'Granny knot', make: () => B.braidClosureCurves(3, [1, 1, 1, 2, 2, 2]), relax: true },
  { tex: '3_1 \\# 3_1^*', nick: 'Square knot', make: () => B.braidClosureCurves(3, [1, 1, 1, -2, -2, -2]), relax: true },
  { tex: '2^2_1', nick: 'Hopf link', make: () => B.PRESETS.hopf() },
);
for (const e of KNOT_TABLE) {
  if (e.kind !== 'link' || e.name === '2^2_1') continue;
  LIBRARY.push(e.name === '6^3_2'
    ? { tex: '6^3_2', nick: 'Borromean rings', make: () => B.PRESETS.borromean() }
    : { tex: nameTex(e.name), nick: e.nick, make: () => curvesOf(e.recipe), relax: true });
}
function curvesOf(r) {
  return r.rational ? B.rationalCurves(r.rational) : r.pretzel ? B.pretzelCurves(r.pretzel)
    : r.braid ? B.braidClosureCurves(r.braid[0], r.braid[1]) : B.torusKnotCurves(...r.torus);
}

// ───────────────────────────── renderer, scene, camera ─────────────────────────────
const stage = document.getElementById('stage');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(0.0, 1.38, 0.12);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME);
controls.enableDamping = true;
controls.minDistance = 0.2;
controls.maxDistance = 3;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(0.6, 3, 1.2);
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0xcfd3dc, 0.7));

function radialTexture(color, inner = 1, outer = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const col = new THREE.Color(color);
  const rgba = a => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
  grad.addColorStop(0, rgba(inner)); grad.addColorStop(0.55, rgba(inner * 0.75)); grad.addColorStop(1, rgba(outer));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
floor.rotation.x = -Math.PI / 2;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: radialTexture('#000000', 0.22, 0) }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.002;
scene.add(floor, shadow);

// the knot: everything in knot-local coordinates lives under knotRoot
const knotRoot = new THREE.Group();
knotRoot.position.copy(HOME);
scene.add(knotRoot);
const tubeGroup = new THREE.Group();
knotRoot.add(tubeGroup);
const knotMats = [0, 1, 2, 3].map(() => new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
const tubeMeshes = [];

// live stroke
const strokeMat = new THREE.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 0.4 });
const strokeMesh = new THREE.Mesh(new THREE.BufferGeometry(), strokeMat);
const ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineDashedMaterial({ dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.7 }));
const startDot = new THREE.Mesh(new THREE.SphereGeometry(TUBE_R * 1.9, 16, 12), new THREE.MeshBasicMaterial());
strokeMesh.visible = ghost.visible = startDot.visible = false;
knotRoot.add(strokeMesh, ghost, startDot);

// Seifert surface: one geometry, front faces and back faces in different colors (it is orientable)
const surfFront = new THREE.MeshStandardMaterial({ side: THREE.FrontSide, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const surfBack = new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const surfaceGroup = new THREE.Group();
knotRoot.add(surfaceGroup);
let surfaceGeom = null;
const sweepFrames = [];

// panels group (VR): anchored in the world in front of the user
const panels = new THREE.Group();
panels.visible = false;
scene.add(panels);

// projection globe
const globe = new THREE.Group();
const GLOBE_R = 0.05;
const globeMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(GLOBE_R, 7), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
globe.add(globeMesh);
const reticle = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0018, 8, 40), new THREE.MeshBasicMaterial());
scene.add(globe, reticle);
let globeData = null;

// ───────────────────────────── VR panels ─────────────────────────────
class Panel3D {
  constructor(wM, hM, W, H) {
    this.wM = wM; this.hM = hM; this.W = W; this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false }));
    this.regions = [];
    this.busy = false; this.dirty = true;
    this.armed = new Map();
  }
  // world point → canvas pixels and depth in front of the panel (m)
  local(world) {
    const v = this.mesh.worldToLocal(world.clone());
    return { px: (v.x / this.wM + 0.5) * this.W, py: (0.5 - v.y / this.hM) * this.H, z: v.z, inside: Math.abs(v.x) <= this.wM / 2 && Math.abs(v.y) <= this.hM / 2 };
  }
  async draw(fn) {
    if (this.busy) { this.dirty = true; return; }
    this.busy = true; this.dirty = false;
    try { await fn(this.ctx, this.W, this.H); this.tex.needsUpdate = true; } catch (e) { console.error(e); }
    this.busy = false;
    if (this.dirty) this.redraw?.();
  }
  regionAt(px, py) { return this.regions.find(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h); }
}
const infoPanel = new Panel3D(0.40, 0.33, 1200, 990);
const projPanel = new Panel3D(0.40, 0.333, 1200, 1000);
const menuPanel = new Panel3D(0.22, 0.302, 860, 1180);
infoPanel.mesh.position.set(-0.39, 0.03, 0.1);
infoPanel.mesh.rotation.y = 0.58;
projPanel.mesh.position.set(0.39, 0.03, 0.1);
projPanel.mesh.rotation.y = -0.58;
panels.add(infoPanel.mesh, projPanel.mesh);
menuPanel.mesh.visible = false;
scene.add(menuPanel.mesh);
const globeLegend = new Panel3D(0.16, 0.05, 640, 200);
panels.add(globeLegend.mesh);
// a one-line tip under the knot: what a pinch will do right now
const tipPanel = new Panel3D(0.36, 0.055, 1080, 165);
tipPanel.mesh.position.set(0, -0.235, 0.07);
tipPanel.mesh.visible = false;
panels.add(tipPanel.mesh);
let tipText = '';

// cursors at the pinch points
const cursors = {};
for (const side of ['left', 'right']) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }));
  m.visible = false;
  scene.add(m);
  cursors[side] = m;
}

const xrInput = new XRInput(renderer, scene);

// ───────────────────────────── theme ─────────────────────────────
function applyTheme() {
  const t = th();
  document.documentElement.dataset.theme = S.theme;
  const ar = S.xrMode === 'immersive-ar';
  scene.background = ar ? null : new THREE.Color(t.bg);
  floor.visible = !ar;
  floor.material.map?.dispose();
  floor.material.map = radialTexture(t.floor, 1, 0);
  floor.material.needsUpdate = true;
  knotMats.forEach((m, i) => m.color.set(t.comps[i]));
  strokeMat.color.set(t.comps[0]);
  ghost.material.color.set(t.muted);
  startDot.material.color.set(t.accent);
  surfFront.color.set(t.surfaceFront);
  surfBack.color.set(t.surfaceBack);
  reticle.material.color.set(t.accentInk);
  for (const side of ['left', 'right']) cursors[side].material.color.set(t.accentInk);
  tipText = '';
  recolorGlobe();
  redrawAll();
}

// ───────────────────────────── knot state ─────────────────────────────
const copyComps = cs => cs.map(p => Float64Array.from(p));
let flatT = 0, flatTarget = null, displayComps = [];

function rebuildTubes() {
  const show = flatT > 0 && flatTarget ? lerpComps(S.comps, flatTarget, ease(flatT)) : S.comps;
  displayComps = show;
  while (tubeMeshes.length > show.length) { const m = tubeMeshes.pop(); m.geometry.dispose(); tubeGroup.remove(m); }
  show.forEach((pts, i) => {
    let m = tubeMeshes[i];
    if (!m) { m = new THREE.Mesh(new THREE.BufferGeometry(), knotMats[i % 4]); tubeMeshes.push(m); tubeGroup.add(m); }
    m.geometry = tubeGeometry(pts, TUBE_R, { geometry: m.geometry, radial: 12 });
  });
}
const ease = t => t * t * (3 - 2 * t);
function lerpComps(a, b, t) {
  return a.map((p, c) => { const q = b[c], o = new Float64Array(p.length); for (let i = 0; i < p.length; i++) o[i] = p[i] + t * (q[i] - p[i]); return o; });
}

// Shift knot-local coordinates so the centroid is the origin, without moving anything in the world.
function recenterLocal() {
  if (!S.comps.length) return;
  const c = centroid(S.comps);
  if (Math.hypot(...c) < 1e-5) return;
  S.comps = S.comps.map(p => { const q = Float64Array.from(p); for (let i = 0; i < q.length; i += 3) { q[i] -= c[0]; q[i + 1] -= c[1]; q[i + 2] -= c[2]; } return q; });
  const off = new THREE.Vector3(...c).multiplyScalar(knotRoot.scale.x).applyQuaternion(knotRoot.quaternion);
  knotRoot.position.add(off);
}

function pushHistory() {
  S.history.push(copyComps(S.comps));
  if (S.history.length > 60) S.history.shift();
}

let knotR = 0.14;
function knotChanged({ type = true } = {}) {
  S.shapeVersion++;
  if (type) {
    S.typeVersion++;
    S.analysis = null;
    clearSweep();
    globeData = null;
    if (S.flatten) { S.flatten = false; flatT = 0; flatTarget = null; }
    requestAnalysis(false);
  }
  knotR = S.comps.length ? radius(S.comps) : 0.14;
  rebuildTubes();
  projDirty = true;
  redrawAll();
}

function loadLibrary(i) {
  S.lib = (i + LIBRARY.length) % LIBRARY.length;
  const e = LIBRARY[S.lib];
  stopRelax();
  pushHistory();
  S.comps = normalizeSize(e.make(), 0.13).map(p => resampleBySpacing(p, SPACING, 48, 420));
  S.autoBest = true;
  S.mode = 'move'; S.addStrand = false; S.pristine = false;
  knotChanged();
  if (e.relax) startRelax();
  sync();
}

// ───────────────────────────── workers ─────────────────────────────
const analysisWorker = new Worker(new URL('./analysisWorker.js', import.meta.url), { type: 'module' });
const relaxWorker = new Worker(new URL('./relaxWorker.js', import.meta.url), { type: 'module' });
const seifertWorker = new Worker(new URL('./seifertWorker.js', import.meta.url), { type: 'module' });
let analysisSeq = 0, fullSeq = 0, lastGeom = 0;

function requestAnalysis(geometryOnly) {
  const id = ++analysisSeq;
  if (!geometryOnly) fullSeq = id;
  analysisWorker.postMessage({ type: 'analyze', id, components: copyComps(S.comps), geometryOnly });
}
analysisWorker.onmessage = ev => {
  const m = ev.data;
  if (m.type === 'error') { console.error(m.message); return; }
  if (!m.geometryOnly && m.id !== fullSeq) return;
  if (!m.geometryOnly) {
    S.analysis = m.result;
    // library knots open on their simplest view (some presets are edge-on along an axis)
    if (S.autoBest && m.result.inv?.bestDir) { S.autoBest = false; faceDirection(m.result.inv.bestDir); }
  }
  S.geometry = m.result.geometry;
  refreshInfo();
};

let relaxSeq = 0;
function startRelax() {
  if (!S.comps.length || S.flatten) return;
  S.relax = true;
  relaxWorker.postMessage({ type: 'start', id: ++relaxSeq, components: copyComps(S.comps), options: { spacing: SPACING, tube: 0.0048 } });
  sync();
}
function stopRelax() {
  if (!S.relax) return;
  S.relax = false;
  relaxSeq++;
  relaxWorker.postMessage({ type: 'stop' });
  sync();
}
relaxWorker.onmessage = ev => {
  const m = ev.data;
  if (m.type !== 'frame' || m.id !== relaxSeq || !S.relax) return;
  S.comps = m.components;
  if (m.done) {
    S.relax = false;
    recenterLocal();
    requestAnalysis(false); // a rounder shape may show fewer crossings
    sync();
  } else if (performance.now() - lastGeom > 700) { lastGeom = performance.now(); requestAnalysis(true); }
  knotChanged({ type: false });
};

let surfaceInflight = false, surfaceShape = -1, surfaceLevel = -1;
let sweepState = null, globeInflight = false, globeShape = -1;
seifertWorker.onmessage = ev => {
  const m = ev.data;
  if (m.type === 'error') { console.error('seifert worker:', m.message); surfaceInflight = globeInflight = false; return; }
  if (m.type === 'surface') {
    surfaceInflight = false;
    if (m.id !== S.shapeVersion) return;
    surfaceShape = m.id; surfaceLevel = m.level;
    setSurfaceGeometry(m);
  } else if (m.type === 'sweepFrame') {
    if (!sweepState || m.id !== sweepState.id) return;
    sweepFrames[m.k] = meshFromWorker(m);
  } else if (m.type === 'sweepDone') {
    if (sweepState && m.id === sweepState.id) sweepState.done = true;
  } else if (m.type === 'globe') {
    globeInflight = false;
    if (m.id !== S.shapeVersion) return;
    globeShape = m.id;
    globeData = m;
    recolorGlobe();
    refreshGlobeLegend();
  }
};
function meshFromWorker(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}
function setSurfaceGeometry(m) {
  surfaceGeom?.dispose();
  surfaceGeom = meshFromWorker(m);
  showSurface(surfaceGeom);
}
function showSurface(g) {
  surfaceGroup.clear();
  if (!g) return;
  surfaceGroup.add(new THREE.Mesh(g, surfFront), new THREE.Mesh(g, surfBack));
}
function clearSweep() {
  sweepState = null;
  for (const g of sweepFrames) g?.dispose();
  sweepFrames.length = 0;
}

function maybeRequestSurface() {
  surfaceGroup.visible = S.surface && flatT === 0 && S.comps.length > 0;
  if (!surfaceGroup.visible) return;
  if (S.sweep) {
    if (!sweepState || sweepState.shape !== S.shapeVersion) {
      if (S.relax) return; // wait until the shape settles
      clearSweep();
      sweepState = { id: S.shapeVersion, shape: S.shapeVersion, t: 0, done: false };
      seifertWorker.postMessage({ type: 'sweep', id: S.shapeVersion, components: copyComps(S.comps), frames: 32, res: surfaceRes(64) });
    }
    return;
  }
  if (surfaceInflight || (surfaceShape === S.shapeVersion && surfaceLevel === S.level)) return;
  surfaceInflight = true;
  seifertWorker.postMessage({ type: 'surface', id: S.shapeVersion, components: copyComps(S.comps), level: S.level, res: S.relax ? 36 : surfaceRes(80) });
}
// grid resolution so the surface's edge (half a cell from the knot) stays inside the tube:
// the grid spans about 3.4 knot radii, and we want cells of about 7 mm
function surfaceRes(cap) { return Math.max(40, Math.min(cap, Math.round((3.4 * knotR) / 0.0072))); }
function maybeRequestGlobe() {
  globe.visible = reticle.visible = S.globe && S.comps.length > 0 && !!globeData;
  globeLegend.mesh.visible = globe.visible && !!S.xrMode;
  if (!S.globe || !S.comps.length || S.relax || globeInflight || globeShape === S.shapeVersion) return;
  globeInflight = true;
  seifertWorker.postMessage({ type: 'globe', id: S.shapeVersion, components: copyComps(S.comps), count: 1500 });
}

// crossing-count colors on the globe: the fewest crossings in teal, the rest a periwinkle ramp
function recolorGlobe() {
  const g = globeMesh.geometry;
  const pos = g.attributes.position;
  let col = g.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3); g.setAttribute('color', col); }
  const t = th();
  const base = new THREE.Color(t.field), lo = new THREE.Color('#dfe3ff'), hi = new THREE.Color('#2f3488'), best = new THREE.Color(t.surfaceFront);
  const c = new THREE.Color();
  if (!globeData) { for (let i = 0; i < pos.count; i++) col.setXYZ(i, base.r, base.g, base.b); col.needsUpdate = true; return; }
  const { dirs, counts, min, max } = globeData;
  const M = counts.length;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / GLOBE_R, y = pos.getY(i) / GLOBE_R, z = pos.getZ(i) / GLOBE_R;
    let bestDot = -1, k = 0;
    for (let j = 0; j < M; j++) {
      const d = Math.abs(x * dirs[3 * j] + y * dirs[3 * j + 1] + z * dirs[3 * j + 2]);
      if (d > bestDot) { bestDot = d; k = j; }
    }
    const n = counts[k];
    if (n === min) c.copy(best);
    else c.copy(lo).lerp(hi, max > min + 1 ? (n - min - 1) / (max - min - 1) : 1);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// ───────────────────────────── view helpers ─────────────────────────────
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion();
function eyePos(out = new THREE.Vector3()) {
  if (renderer.xr.isPresenting) return renderer.xr.getCamera().getWorldPosition(out);
  return out.copy(camera.position);
}
function eyeUp(out = new THREE.Vector3()) {
  const q = renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldQuaternion(_q1) : camera.quaternion;
  return out.set(0, 1, 0).applyQuaternion(q);
}
// direction from the knot to the eye, and screen-up, in knot-local coordinates
function viewInKnot() {
  const inv = knotRoot.quaternion.clone().invert();
  const dir = eyePos(_v1).sub(knotRoot.position).normalize().applyQuaternion(inv);
  const up = eyeUp(_v2).applyQuaternion(inv);
  return { dir: [dir.x, dir.y, dir.z], up: [up.x, up.y, up.z] };
}

let rotAnim = null;
function faceDirection(localDir) {
  const d = new THREE.Vector3(...localDir).normalize().applyQuaternion(knotRoot.quaternion);
  const toEye = eyePos(_v1).sub(knotRoot.position).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(d, toEye);
  rotAnim = { from: knotRoot.quaternion.clone(), to: q.multiply(knotRoot.quaternion.clone()), t: 0 };
  spin = null;
}

// ───────────────────────────── flatten (3D knot → diagram) ─────────────────────────────
function computeFlat() {
  const { dir, up } = viewInKnot();
  const D = projectDiagram(S.comps, dir, up);
  const w = D.basis.w, c = centroid(S.comps);
  const h = 2.6 * TUBE_R;
  return S.comps.map((p, ci) => {
    const N = p.length / 3;
    const ev = D.gauss.comps[ci].map(e => ({ s: e.s, sgn: e.over ? 1 : -1 }));
    const zAt = (i, wid) => {
      let z = 0;
      for (const e of ev) { let d = Math.abs(i - e.s); d = Math.min(d, N - d); z += e.sgn * h * Math.exp(-(d / wid) * (d / wid)); }
      return z;
    };
    let wid = 0.012 / SPACING;
    for (let k = 0; k < 8 && !ev.every(e => e.sgn * zAt(e.s, wid) > 0.5 * h); k++) wid *= 0.7;
    const q = new Float64Array(p.length);
    for (let i = 0; i < N; i++) {
      const x = p[3 * i] - c[0], y = p[3 * i + 1] - c[1], z = p[3 * i + 2] - c[2];
      const depth = x * w[0] + y * w[1] + z * w[2], dz = zAt(i, wid) - depth;
      q[3 * i] = p[3 * i] + dz * w[0]; q[3 * i + 1] = p[3 * i + 1] + dz * w[1]; q[3 * i + 2] = p[3 * i + 2] + dz * w[2];
    }
    return q;
  });
}

// ───────────────────────────── actions ─────────────────────────────
const actions = {
  mode: v => { S.mode = v; if (v !== 'draw') S.addStrand = false; },
  // arm one stroke that replaces the knot / adds a strand to it; pressing again disarms
  newKnot: () => { const on = S.mode === 'draw' && !S.addStrand; S.mode = on ? 'move' : 'draw'; S.addStrand = false; },
  undo: () => {
    if (!S.history.length) return;
    stopRelax();
    S.comps = S.history.pop();
    knotChanged();
  },
  clear: () => { if (!S.comps.length) return; stopRelax(); pushHistory(); S.comps = []; S.mode = 'move'; S.addStrand = false; knotChanged(); },
  addStrand: () => { const on = S.mode === 'draw' && S.addStrand; S.mode = on ? 'move' : 'draw'; S.addStrand = !on; },
  relax: () => { if (S.relax) stopRelax(); else startRelax(); },
  surface: () => { S.surface = !S.surface; if (!S.surface) S.sweep = false; },
  sweep: () => { S.sweep = !S.sweep; if (S.sweep) S.surface = true; else showSurface(surfaceGeom); },
  level: v => { S.level = Math.round(v / (Math.PI / 8)) * (Math.PI / 8); if (S.sweep) { S.sweep = false; } },
  flatten: () => {
    if (!S.comps.length) return;
    S.flatten = !S.flatten;
    if (S.flatten) { stopRelax(); flatTarget = computeFlat(); }
  },
  circles: () => { S.circles = !S.circles; projDirty = true; },
  globe: () => { S.globe = !S.globe; },
  best: () => {
    const d = S.analysis?.inv?.bestDir || globeData?.best;
    if (!d) return;
    if (S.flatten) { S.flatten = false; }
    faceDirection(d);
  },
  prev: () => loadLibrary(S.lib - 1),
  next: () => loadLibrary(S.lib + 1),
  library: v => loadLibrary(+v),
  recenter: () => { if (renderer.xr.isPresenting) recenterVR(); else { knotRoot.position.copy(HOME); knotRoot.quaternion.identity(); knotRoot.scale.setScalar(1); controls.target.copy(HOME); } },
  theme: () => { S.theme = S.theme === 'light' ? 'dark' : 'light'; applyTheme(); },
  hand: () => { S.drawHand = S.drawHand === 'right' ? 'left' : 'right'; },
  crossMode: v => { S.crossMode = v; },
  exit: () => renderer.xr.getSession()?.end(),
};
function act(id, value) {
  if (!actions[id]) return;
  actions[id](value);
  click();
  sync();
}

// ───────────────────────────── desktop sidebar ─────────────────────────────
const $ = s => document.querySelector(s);
function bindSidebar() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => act(el.dataset.action, el.dataset.value));
  });
  $('#level').addEventListener('input', e => { act('level', +e.target.value); });
  const lib = $('#library');
  lib.innerHTML = LIBRARY.map((e, i) => `<option value="${i}">${e.nick ? `${e.nick} — ` : ''}${e.tex.replace(/\\#/g, '#').replace(/\^\*/g, '*').replace(/[{}]/g, '')}</option>`).join('');
  lib.addEventListener('change', e => act('library', e.target.value));
  $('#cross-mode').addEventListener('change', e => act('crossMode', e.target.value));
}
function sync() {
  document.querySelectorAll('[data-toggle]').forEach(el => el.setAttribute('aria-pressed', String(!!S[el.dataset.toggle])));
  document.querySelectorAll('[data-action="mode"]').forEach(el => el.setAttribute('aria-pressed', String((el.dataset.value === 'draw') === drawArmed())));
  $('#level').value = S.level;
  $('#level-value').textContent = levelLabel();
  $('#library').value = String(S.lib);
  $('#cross-mode').value = S.crossMode;
  $('[data-action="undo"]').disabled = !S.history.length;
  canvas.style.cursor = drawArmed() ? 'crosshair' : 'grab';
  // while drawing is armed the left button draws; orbit with the right button (or one finger in Orbit mode)
  const drawing = drawArmed();
  controls.mouseButtons.LEFT = drawing ? null : THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = drawing ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  controls.touches.ONE = drawing ? null : THREE.TOUCH.ROTATE;
  menuPanel.dirty = true;
  if (S.xrMode) drawMenu();
}
function levelLabel() {
  const k = Math.round(S.level / (Math.PI / 8));
  const g = gcd(k, 8), n = k / g, d = 8 / g;
  if (k === 0) return '0';
  const num = n === 1 ? '' : n;
  return d === 1 ? `${num}π`.replace(/^π/, 'π') : `${num}π/${d}`;
}
function levelTex() {
  const k = Math.round(S.level / (Math.PI / 8));
  const g = gcd(k, 8), n = k / g, d = 8 / g;
  if (k === 0) return '0';
  const num = n === 1 ? '' : n;
  return d === 1 ? `${num}\\pi` : `\\tfrac{${num || 1}\\pi}{${d}}`.replace('{1\\pi}', '{\\pi}');
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

// ───────────────────────────── info card ─────────────────────────────
function infoModel() {
  const A = S.analysis, G = S.geometry;
  if (!S.comps.length) {
    return {
      kicker: 'START HERE', title: { nick: 'Draw a knot' },
      hint: S.xrMode
        ? [`Pinch with your ${S.drawHand} hand and draw a loop in the air.`, 'Let go and the loop closes itself.',
           'Then pinch and drag to turn it; use both hands to scale it.',
           `Turn your ${S.drawHand === 'right' ? 'left' : 'right'} palm toward you for the menu.`]
        : ['Drag across the view to draw a closed loop.', 'Where it crosses itself, the crossings alternate.', 'Or pick a knot from the library.'],
    };
  }
  if (!A) return { title: { nick: 'Analyzing…' }, rows: [] };
  const inv = A.inv, id = A.id, mu = inv.components;
  const rows = [];
  if (inv.jones) rows.push({ label: 'Jones polynomial', value: `$V(t) = ${P.tex(P.from(inv.jones))}$` });
  if (inv.alexander) {
    rows.push({ label: 'Alexander polynomial', value: `$\\Delta(t) = ${P.tex(P.from(inv.alexander))}$`, sub: mu > 1 ? 'up to sign and powers of $t$' : null });
  }
  if (inv.determinant !== undefined) rows.push({ label: 'Determinant', value: `$${inv.determinant}$` });
  if (mu === 1 && inv.genusLower !== undefined) {
    const lo = inv.genusLower, hi = inv.seifertGenus;
    rows.push({ label: 'Genus', value: lo === hi ? `$g = ${lo}$` : `$${lo} \\le g \\le ${hi}$`, sub: 'bounds from $\\Delta$ and from Seifert\'s algorithm' });
  } else if (mu > 1) {
    rows.push({ label: 'Seifert surface', value: `genus $\\le ${inv.seifertGenus}$` });
  }
  rows.push({ label: 'Crossings', value: `$${inv.crossings}$ in the simplest view found` });
  if (inv.linking) {
    const parts = [];
    for (let a = 0; a < mu; a++) for (let b = a + 1; b < mu; b++) parts.push(`\\operatorname{lk}_{${a + 1}${b + 1}} = ${inv.linking[a][b]}`);
    rows.push({ label: 'Linking numbers', value: `$${parts.join(',\\ ')}$` });
  }
  if (G) {
    const ks = G.curvature.map(k => (k / TAU).toFixed(2));
    rows.push({
      label: 'Total curvature', value: `$\\kappa = ${ks.length === 1 ? ks[0] : `(${ks.join(', ')})`} \\cdot 2\\pi$`,
      sub: 'Fáry–Milnor: a knotted curve has $\\kappa > 4\\pi$',
    });
    rows.push({ label: 'Writhe', value: `$\\mathrm{Wr} = ${G.writheGauss.map(w => w.toFixed(2)).join(',\\ ')}$`, sub: 'the average over all projections' });
  }
  return { title: { tex: id.tex, nick: id.nick, detail: id.detail, note: id.note }, rows };
}

let infoSeq = 0;
function refreshInfo() {
  const model = infoModel();
  // desktop HTML
  const el = $('#invariants');
  const seq = ++infoSeq;
  const t = model.title || {};
  el.innerHTML = `
    <div class="ident">
      ${t.tex ? `<div class="ident-name">$${t.tex}$</div>` : ''}
      <div><div class="ident-nick">${t.nick || ''}</div>${t.detail ? `<div class="ident-detail">${t.detail}</div>` : ''}</div>
    </div>
    ${t.note ? `<p class="note">${t.note}</p>` : ''}
    ${model.hint ? `<ul class="hint">${model.hint.map(h => `<li>${h}</li>`).join('')}</ul>` : ''}
    ${model.rows ? `<dl class="rows">${model.rows.map(r => `<dt>${r.label}</dt><dd>${r.value}${r.sub ? `<small>${r.sub}</small>` : ''}</dd>`).join('')}</dl>` : ''}`;
  window.MathJax?.startup?.promise?.then(() => { if (seq === infoSeq) window.MathJax.typesetPromise([el]).catch(() => {}); });
  // VR texture
  infoPanel.redraw = () => infoPanel.draw((ctx, W, H) => renderInfo(ctx, W, H, infoModel(), th()));
  if (S.xrMode) infoPanel.redraw();
}

function drawMenu() {
  menuPanel.redraw = () => menuPanel.draw(async (ctx, W, H) => {
    menuPanel.regions = await renderMenu(ctx, W, H, menuRows(), th(), menuPanel.hover, menuPanel.pressed);
  });
  menuPanel.redraw();
}
function menuRows() {
  const e = LIBRARY[S.lib];
  return [
    [{ kind: 'title', id: 't', label: 'Knot Sculptor' }],
    [{ kind: 'toggle', id: 'newKnot', label: 'New knot', active: S.mode === 'draw' && !S.addStrand }, { kind: 'toggle', id: 'addStrand', label: 'Add strand', active: S.mode === 'draw' && S.addStrand }],
    [{ kind: 'button', id: 'undo', label: 'Undo', disabled: !S.history.length }, { kind: 'button', id: 'clear', label: 'Clear' }, { kind: 'toggle', id: 'relax', label: 'Relax', active: S.relax }],
    [{ kind: 'toggle', id: 'surface', label: 'Seifert surface', active: S.surface, weight: 1.4 }, { kind: 'toggle', id: 'sweep', label: 'Sweep', active: S.sweep }],
    [{ kind: 'slider', id: 'level', label: 'Surface level', valueLabel: `$\\Omega = ${levelTex()}$`, value: S.level, min: 0, max: 2 * TAU }],
    [{ kind: 'toggle', id: 'flatten', label: 'Flatten', active: S.flatten }, { kind: 'toggle', id: 'circles', label: 'Seifert circles', active: S.circles, weight: 1.3 }],
    [{ kind: 'toggle', id: 'globe', label: 'Globe', active: S.globe }, { kind: 'button', id: 'best', label: 'Best view' }],
    [{ kind: 'button', id: 'prev', label: '‹', weight: 0.45 }, { kind: 'label', id: 'libname', label: `${e.nick ? `${e.nick} ` : ''}$${e.tex}$`, weight: 2 }, { kind: 'button', id: 'next', label: '›', weight: 0.45 }],
    [{ kind: 'button', id: 'recenter', label: 'Recenter' }, { kind: 'toggle', id: 'theme', label: 'Dark', active: S.theme === 'dark' }, { kind: 'toggle', id: 'hand', label: 'Left hand', active: S.drawHand === 'left' }, { kind: 'button', id: 'exit', label: 'Exit' }],
  ];
}

async function refreshGlobeLegend() {
  if (!S.xrMode || !globeData) return;
  globeLegend.draw(async (ctx, W, H) => {
    const t = th();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = t.panel;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 36); ctx.fill();
    ctx.fillStyle = t.surfaceFront;
    ctx.beginPath(); ctx.arc(52, 70, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = t.text;
    ctx.font = '700 34px "Atkinson Hyperlegible", sans-serif';
    ctx.fillText(`${globeData.min} crossings: the simplest views`, 86, 82);
    ctx.fillStyle = t.muted;
    ctx.font = '28px "Atkinson Hyperlegible", sans-serif';
    ctx.fillText(`darker: up to ${globeData.max}. Poke the globe to look from there.`, 32, 150);
  });
}

// ───────────────────────────── projection (live) ─────────────────────────────
let projDirty = true, lastProj = 0, lastViewKey = '';
const projCanvas = document.getElementById('proj-canvas');
const projCtx = projCanvas.getContext('2d');
function maybeUpdateProjection(now) {
  if (!S.comps.length) return;
  const { dir, up } = viewInKnot();
  const key = dir.map(x => x.toFixed(3)).join() + up.map(x => x.toFixed(2)).join();
  if (!projDirty && key === lastViewKey) return;
  if (now - lastProj < (S.xrMode ? 140 : 60)) return;
  lastProj = now; lastViewKey = key; projDirty = false;
  const comps = displayComps.length ? displayComps : S.comps;
  const data = projectionData(comps, dir, up);
  const c = centroid(comps), b = data.D.basis;
  const center2 = [c[0] * b.u[0] + c[1] * b.u[1] + c[2] * b.u[2], c[0] * b.v[0] + c[1] * b.v[1] + c[2] * b.v[2]];
  const opts = { th: th(), R: knotR, center2, seifert: S.circles };
  if (S.xrMode) projPanel.draw((ctx, W, H) => renderProjection(ctx, W, H, data, opts));
  else {
    const r = projCanvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (W < 120 || H < 100) { projDirty = true; return; }
    if (projCanvas.width !== W || projCanvas.height !== H) { projCanvas.width = W; projCanvas.height = H; }
    // draw in the VR panel's logical units (1200 × 1000), scaled to the canvas
    projCtx.setTransform(W / 1200, 0, 0, W / 1200, 0, 0);
    renderProjection(projCtx, 1200, 1000, data, { ...opts, transparent: true, compact: true }).catch(console.error);
  }
}

function redrawAll() {
  refreshInfo();
  projDirty = true;
  sync();
  refreshGlobeLegend();
}

// ───────────────────────────── XR session ─────────────────────────────
async function enterXR(mode) {
  try {
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
    S.xrMode = mode;
    xrInput.setHandModelsVisible(mode !== 'immersive-ar');
    panels.visible = true;
    pendingRecenter = 3;
    if (S.pristine && S.comps.length) { stopRelax(); S.comps = []; S.history = []; knotChanged(); }
    else if (S.comps.length) tipUntil = performance.now() + 12000;
    session.addEventListener('end', () => {
      S.xrMode = null;
      panels.visible = false;
      menuPanel.mesh.visible = false;
      for (const c of Object.values(cursors)) c.visible = false;
      knotRoot.position.copy(HOME); knotRoot.quaternion.identity(); knotRoot.scale.setScalar(1);
      controls.target.copy(HOME);
      applyTheme();
    });
    applyTheme();
  } catch (e) {
    $('#xr-status').textContent = `Could not start: ${e.message}`;
  }
}
let pendingRecenter = 0;
function recenterVR() {
  const cam = renderer.xr.getCamera();
  const head = cam.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize();
  const pos = head.clone().addScaledVector(fwd, 0.5);
  pos.y = head.y - 0.16;
  knotRoot.position.copy(pos);
  knotRoot.scale.setScalar(1);
  panels.position.copy(pos);
  panels.lookAt(head.x, pos.y, head.z);
  globe.position.set(0, 0, 0);
}

// ───────────────────────────── VR interaction ─────────────────────────────
const strokes = { left: null, right: null };
const pending = { left: null, right: null }; // a pinch that may become a stroke once it is held and moved
let grab = null, spin = null;
const prevQuat = new THREE.Quaternion();
let menuShown = false;
const consumed = { left: false, right: false };

function handMatrix(h) { return new THREE.Matrix4().compose(h.grip, h.quat, new THREE.Vector3(1, 1, 1)); }

// A grab only takes hold once the hand has moved ~8 mm or turned ~5°, so a stray pinch moves nothing;
// at that moment the baseline is captured again, so the knot doesn't jump.
const GRAB_MOVE = 0.008, GRAB_TURN = 0.08;
function startGrab(hands, engaged = false) {
  if (hands.length === 1) {
    const h = hands[0];
    grab = { hands, offset: handMatrix(h).invert().multiply(knotRoot.matrix.clone()) };
  } else {
    const [a, b] = hands;
    grab = {
      hands, p0: a.grip.clone(), v0: b.grip.clone().sub(a.grip), mid0: a.grip.clone().add(b.grip).multiplyScalar(0.5),
      q0: knotRoot.quaternion.clone(), s0: knotRoot.scale.x, pos0: knotRoot.position.clone(),
    };
  }
  grab.engaged = engaged;
  grab.start = hands.map(h => ({ p: h.grip.clone(), q: h.quat.clone() }));
  if (engaged) { rotAnim = null; spin = null; tipUntil = 0; }
  prevQuat.copy(knotRoot.quaternion);
}
function updateGrab(dt) {
  if (!grab) return;
  if (!grab.engaged) {
    const moved = grab.hands.some((h, i) => h.grip.distanceTo(grab.start[i].p) > GRAB_MOVE || h.quat.angleTo(grab.start[i].q) > GRAB_TURN);
    if (moved) startGrab(grab.hands, true);
    return;
  }
  if (grab.hands.length === 1) {
    const m = handMatrix(grab.hands[0]).multiply(grab.offset);
    const s = new THREE.Vector3();
    m.decompose(knotRoot.position, knotRoot.quaternion, s);
  } else {
    const [a, b] = grab.hands;
    const v = b.grip.clone().sub(a.grip);
    const s = THREE.MathUtils.clamp(grab.s0 * v.length() / grab.v0.length(), 0.25, 6);
    const dq = new THREE.Quaternion().setFromUnitVectors(grab.v0.clone().normalize(), v.clone().normalize());
    knotRoot.quaternion.copy(dq).multiply(grab.q0);
    knotRoot.scale.setScalar(s);
    const mid = a.grip.clone().add(b.grip).multiplyScalar(0.5);
    knotRoot.position.copy(grab.pos0).sub(grab.mid0).multiplyScalar(s / grab.s0).applyQuaternion(dq).add(mid);
  }
  // angular velocity for a spin on release
  const dq = knotRoot.quaternion.clone().multiply(prevQuat.clone().invert());
  const angle = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
  if (angle > 1e-5 && dt > 0) {
    const axis = new THREE.Vector3(dq.x, dq.y, dq.z).normalize().multiplyScalar(Math.sign(dq.w) || 1);
    const w = axis.multiplyScalar(angle / dt);
    grab.omega = grab.omega ? grab.omega.lerp(w, 0.3) : w;
  } else if (grab.omega) grab.omega.multiplyScalar(0.8);
  prevQuat.copy(knotRoot.quaternion);
}
function endGrab(h) {
  if (!grab) return;
  const rest = grab.hands.filter(x => x !== h);
  const omega = grab.engaged ? grab.omega : null;
  grab = null;
  if (rest.length) startGrab(rest);
  else if (omega && omega.length() > 0.8) spin = omega.clone();
}

function panelHit(panel, h) {
  if (!panel.mesh.visible || !panel.mesh.parent?.visible && panel !== menuPanel) return null;
  if (h.isHand) {
    const l = panel.local(h.tip);
    if (!l.inside || l.z < -0.02 || l.z > 0.08) return null;
    return l;
  }
  if (!h.rayDir) return null;
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(panel.mesh.getWorldQuaternion(new THREE.Quaternion()));
  const p0 = panel.mesh.getWorldPosition(new THREE.Vector3());
  const den = n.dot(h.rayDir);
  if (Math.abs(den) < 1e-4) return null;
  const t = n.dot(p0.clone().sub(h.rayOrigin)) / den;
  if (t < 0 || t > 4) return null;
  const l = panel.local(h.rayOrigin.clone().addScaledVector(h.rayDir, t));
  return l.inside ? { ...l, z: 0, ray: true } : null;
}

function pokePanel(panel, h) {
  const hit = panelHit(panel, h);
  const key = h.side;
  let st = panel.armed.get(key) || { armed: true, drag: null };
  panel.armed.set(key, st);
  if (!hit) { if (st.drag && !h.pinching) st.drag = null; st.armed = true; return false; }
  const r = panel.regionAt(hit.px, hit.py);
  const hoverId = r?.id ?? null;
  if (panel.hover !== hoverId || panel.hoverValue !== r?.value) { panel.hover = hoverId; panel.hoverValue = r?.value; panel.redraw?.(); }
  const pressNow = hit.ray ? h.pinchStart : (st.armed && hit.z < 0.006);
  if (!hit.ray && hit.z > 0.018) st.armed = true;
  if (pressNow && r) {
    st.armed = false;
    if (r.kind === 'slider') st.drag = r;
    else if (r.kind === 'seg') act(r.id, r.value);
    else act(r.id);
    panel.pressed = r.id; panel.redraw?.();
    setTimeout(() => { panel.pressed = null; panel.redraw?.(); }, 180);
  }
  if (st.drag) {
    const still = hit.ray ? h.pinching : hit.z < 0.03;
    if (still) {
      const d = st.drag, f = THREE.MathUtils.clamp((hit.px - d.tx0) / (d.tx1 - d.tx0), 0, 1);
      const v = d.min + f * (d.max - d.min);
      if (Math.abs(v - S.level) > 1e-6) { actions.level(v); sync(); }
    } else st.drag = null;
  }
  return true;
}

function updateXR(dt) {
  const head = eyePos(new THREE.Vector3());
  xrInput.update(head);
  const dom = xrInput.hands[S.drawHand], off = xrInput.hands[S.drawHand === 'right' ? 'left' : 'right'];

  // palm-up menu on the off hand (controllers: squeeze toggles it)
  if (off.present && off.isHand) {
    if (!menuShown && off.palmToward > 0.6) menuShown = true;
    else if (menuShown && off.palmToward < 0.3) menuShown = false;
  } else if (off.present && off.squeezeStart) menuShown = !menuShown;
  if (!off.present) menuShown = false;
  if (menuShown !== menuPanel.mesh.visible) { menuPanel.mesh.visible = menuShown; if (menuShown) { drawMenu(); placeMenu(off, head, true); } }
  if (menuShown) placeMenu(off, head, false);

  // poking or pointing at panels
  const near = { left: false, right: false };
  for (const h of [dom, off]) {
    if (!h.present) continue;
    for (const p of [menuPanel, infoPanel, projPanel]) {
      if (p === menuPanel && h === off && h.isHand) continue; // the menu hand can't poke its own menu
      if (pokePanel(p, h)) near[h.side] = true;
    }
  }
  // poking the globe chooses the view from there
  if (dom.present && globe.visible && dom.tipValid) {
    const gc = globe.getWorldPosition(new THREE.Vector3());
    const d = dom.tip.distanceTo(gc);
    if (d < GLOBE_R * globe.scale.x + 0.008) {
      near[dom.side] = true;
      if (!globe.userData.touching) {
        globe.userData.touching = true;
        const local = dom.tip.clone().sub(gc).normalize().applyQuaternion(knotRoot.quaternion.clone().invert());
        faceDirection([local.x, local.y, local.z]);
        click();
      }
    } else if (d > GLOBE_R + 0.02) globe.userData.touching = false;
  }

  for (const h of [dom, off]) {
    if (h.pinchStart) {
      consumed[h.side] = near[h.side];
      if (consumed[h.side]) continue;
      // the drawing hand draws only when the scene is empty or New knot / Add strand is armed;
      // otherwise every pinch grabs the knot
      if (h === dom && drawArmed() && !S.flatten) pending[h.side] = { t0: performance.now(), p0: h.pos.clone(), pts: [] };
      else startGrab(grab ? [...grab.hands, h] : [h]);
    }
    if (h.pinching && pending[h.side]) {
      const pd = pending[h.side];
      pushStrokePoint(pd.pts, h);
      // a stroke starts once the pinch is held a moment and has moved; a tap does nothing
      if (performance.now() - pd.t0 > 120 && h.pos.distanceTo(pd.p0) > 0.012) { beginStroke(h, pd.pts); pending[h.side] = null; }
    }
    if (h.pinching && strokes[h.side]) extendStroke(h);
    if (h.pinchEnd) {
      pending[h.side] = null;
      if (strokes[h.side]) finishStroke(h.side);
      else if (grab?.hands.includes(h)) endGrab(h);
      consumed[h.side] = false;
    }
  }
  updateGrab(dt);
  for (const side of ['left', 'right']) {
    const h = xrInput.hands[side], c = cursors[side];
    c.visible = h.present && !near[side];
    if (c.visible) {
      c.position.copy(h.pos);
      const drawing = h === dom && drawArmed();
      c.scale.setScalar(h.pinching ? 1.5 : drawing ? 1 : 0.7);
      c.material.opacity = drawing ? 0.9 : 0.45;
    }
  }
}

function currentTip() {
  const hand = S.drawHand, other = hand === 'right' ? 'left' : 'right';
  if (!S.comps.length) return `Pinch with your ${hand} hand and draw a loop in the air`;
  if (S.mode === 'draw') return S.addStrand ? 'Pinch and draw another strand: it joins the link' : 'Pinch and draw a new knot: it replaces this one';
  if (performance.now() < tipUntil) return `Pinch and drag to turn it. Two hands scale it. ${other[0].toUpperCase() + other.slice(1)} palm up: menu`;
  return '';
}
function updateTip() {
  const t = currentTip();
  tipPanel.mesh.visible = !!t;
  if (t === tipText) return;
  tipText = t;
  if (!t) return;
  tipPanel.draw((ctx, W, H) => {
    const c = th();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = c.panel;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, H / 2); ctx.fill();
    ctx.font = '700 46px "Atkinson Hyperlegible", sans-serif';
    const w = ctx.measureText(t).width, s = Math.min(1, (W - 90) / w);
    ctx.save();
    ctx.translate(W / 2, H / 2 + 16 * s);
    ctx.scale(s, s);
    ctx.fillStyle = S.mode === 'draw' || !S.comps.length ? c.accentInk : c.text;
    ctx.textAlign = 'center';
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
}

function placeMenu(h, head, snap) {
  let target, look;
  if (h.isHand) {
    target = h.palmCenter.clone().addScaledVector(h.palmNormal, 0.05).add(new THREE.Vector3(0, 0.13, 0));
  } else {
    target = h.pos.clone().add(new THREE.Vector3(0, 0.16, 0));
  }
  const m = menuPanel.mesh;
  if (snap) m.position.copy(target); else m.position.lerp(target, 0.3);
  look = new THREE.Object3D();
  look.position.copy(m.position);
  look.lookAt(head);
  if (snap) m.quaternion.copy(look.quaternion); else m.quaternion.slerp(look.quaternion, 0.3);
}

// ── drawing a strand ──
function beginStroke(h, pts) {
  stopRelax();
  strokes[h.side] = { pts };
  if (!pts.length) pushStrokePoint(pts, h);
  updateStrokeMesh(pts);
}
// append the pinch point (knot coordinates) if it moved more than 4 mm in the world
function pushStrokePoint(pts, h) {
  const local = knotRoot.worldToLocal(h.pos.clone());
  const n = pts.length;
  if (n && Math.hypot(local.x - pts[n - 3], local.y - pts[n - 2], local.z - pts[n - 1]) * knotRoot.scale.x <= 0.004) return false;
  pts.push(local.x, local.y, local.z);
  return true;
}
function extendStroke(h) {
  const st = strokes[h.side];
  if (pushStrokePoint(st.pts, h)) updateStrokeMesh(st.pts);
}
function updateStrokeMesh(pts) {
  const f = Float64Array.from(pts);
  const N = f.length / 3;
  strokeMesh.visible = N >= 2;
  startDot.visible = ghost.visible = N >= 2;
  if (N >= 2) strokeMesh.geometry = tubeGeometry(f, TUBE_R, { closed: false, radial: 10, geometry: strokeMesh.geometry });
  startDot.position.set(f[0], f[1], f[2]);
  const g = ghost.geometry.attributes.position;
  g.setXYZ(0, f[3 * N - 3], f[3 * N - 2], f[3 * N - 1]);
  g.setXYZ(1, f[0], f[1], f[2]);
  g.needsUpdate = true;
  ghost.computeLineDistances();
}
function finishStroke(side) {
  const st = strokes[side];
  strokes[side] = null;
  strokeMesh.visible = ghost.visible = startDot.visible = false;
  addStrand(Float64Array.from(st.pts), { smooth: true });
}
function addStrand(pts, { smooth = true, relax = false } = {}) {
  if (pts.length / 3 < 8 || closedLength(pts) < 0.08) return; // too short to be meant
  let strand = resampleBySpacing(pts, SPACING * 0.8, 48, 420);
  pushHistory();
  const keep = S.addStrand ? S.comps : [];
  let comps = [...keep, strand];
  if (smooth) comps = safeSmooth(comps, 10, 0.4, comps.length - 1);
  comps[comps.length - 1] = resampleBySpacing(comps[comps.length - 1], SPACING, 48, 420);
  S.comps = comps;
  recenterLocal();
  // one stroke per arming: from now on a pinch grabs the knot
  S.mode = 'move';
  S.addStrand = false;
  S.pristine = false;
  tipUntil = performance.now() + 12000;
  knotChanged();
  if (relax) startRelax();
}

// ───────────────────────────── desktop drawing ─────────────────────────────
let deskStroke = null;
const raycaster = new THREE.Raycaster();
function pointerRay(e) {
  camera.updateMatrixWorld(); // in case no frame has rendered since the camera last moved
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  return raycaster.ray;
}
canvas.addEventListener('pointerdown', e => {
  if (renderer.xr.isPresenting) return;
  // clicking the globe faces that direction
  if (globe.visible && e.button === 0) {
    const hit = raycaster.intersectObject(globeMesh, false, []) && (pointerRay(e), raycaster.intersectObject(globeMesh)[0]);
    if (hit) {
      const local = hit.point.clone().sub(globe.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(knotRoot.quaternion.clone().invert());
      faceDirection([local.x, local.y, local.z]);
      return;
    }
  }
  if (!drawArmed() || e.button !== 0 || e.ctrlKey || e.metaKey) return;
  stopRelax();
  const ray = pointerRay(e);
  const n = camera.getWorldDirection(new THREE.Vector3()).negate();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, knotRoot.position);
  const inv = knotRoot.quaternion.clone().invert();
  const u = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).applyQuaternion(inv);
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(inv);
  const w = n.clone().applyQuaternion(inv);
  deskStroke = { plane, u, v, w, pts2: [], pts3: [] };
  controls.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  extendDesk(ray);
});
canvas.addEventListener('pointermove', e => { if (deskStroke) extendDesk(pointerRay(e)); });
canvas.addEventListener('pointerup', e => {
  if (!deskStroke) return;
  const st = deskStroke;
  deskStroke = null;
  controls.enabled = true;
  strokeMesh.visible = ghost.visible = startDot.visible = false;
  const N = st.pts2.length / 2;
  if (N < 8) return;
  // closed planar curve → evenly spaced → lifted at its crossings → 3D strand in knot coordinates
  const flat3 = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) { flat3[3 * i] = st.pts2[2 * i]; flat3[3 * i + 1] = st.pts2[2 * i + 1]; }
  if (closedLength(flat3) < 0.06) return;
  const even = resampleClosed(flat3, 360);
  const p2 = new Float64Array(2 * 360);
  for (let i = 0; i < 360; i++) { p2[2 * i] = even[3 * i]; p2[2 * i + 1] = even[3 * i + 1]; }
  const { pts } = liftPlanarCurve(p2, S.crossMode, 0.012);
  const s = knotRoot.scale.x;
  const out = new Float64Array(pts.length);
  for (let i = 0; i < 360; i++) {
    const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2];
    for (let c = 0; c < 3; c++) out[3 * i + c] = st.o[c] + (x * st.u.getComponent(c) + y * st.v.getComponent(c) + z * st.w.getComponent(c)) / s;
  }
  addStrand(out, { smooth: false, relax: true });
});
function extendDesk(ray) {
  const hit = ray.intersectPlane(deskStroke.plane, new THREE.Vector3());
  if (!hit) return;
  const local = knotRoot.worldToLocal(hit.clone());
  const st = deskStroke;
  if (!st.o) st.o = centroidOrigin();
  const s = knotRoot.scale.x;
  const rel = local.clone().sub(new THREE.Vector3(...st.o)).multiplyScalar(s);
  const x = rel.dot(st.u), y = rel.dot(st.v);
  const n = st.pts2.length;
  if (n && Math.hypot(x - st.pts2[n - 2], y - st.pts2[n - 1]) < 0.003) return;
  st.pts2.push(x, y);
  st.pts3.push(local.x, local.y, local.z);
  updateStrokeMesh(st.pts3);
}
function centroidOrigin() { return S.addStrand && S.comps.length ? centroid(S.comps) : [0, 0, 0]; }

// ───────────────────────────── per-frame updates ─────────────────────────────
function animate(dt) {
  if (rotAnim) {
    rotAnim.t = Math.min(1, rotAnim.t + dt / 0.8);
    knotRoot.quaternion.slerpQuaternions(rotAnim.from, rotAnim.to, ease(rotAnim.t));
    if (rotAnim.t >= 1) rotAnim = null;
  }
  if (spin && !grab) {
    const w = spin.length();
    if (w < 0.05) spin = null;
    else {
      knotRoot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(spin.clone().normalize(), w * dt));
      spin.multiplyScalar(Math.exp(-1.6 * dt));
    }
  }
  const target = S.flatten ? 1 : 0;
  if (flatT !== target) {
    if (S.flatten && !flatTarget) flatTarget = computeFlat();
    flatT = THREE.MathUtils.clamp(flatT + (target ? dt : -dt) * 1.6, 0, 1);
    rebuildTubes();
    projDirty = true;
    if (flatT === 0) flatTarget = null;
  }
  if (S.sweep && sweepState) {
    sweepState.t += dt;
    const have = sweepFrames.filter(Boolean).length;
    if (sweepState.done || have >= 4) {
      const k = Math.floor(sweepState.t * 8) % 32;
      const g = sweepFrames[k];
      if (g && surfaceGroup.children[0]?.geometry !== g) showSurface(g);
      if (k !== sweepState.k) { sweepState.k = k; S.level = 4 * Math.PI * (k + 0.5) / 32; }
    }
  }
  // globe and reticle
  if (globe.visible) {
    const eye = eyePos(_v1);
    if (S.xrMode) {
      globe.position.copy(panels.localToWorld(new THREE.Vector3(0.36, -0.24, 0.16)));
      globeLegend.mesh.position.set(0.36, -0.33, 0.16);
      globeLegend.mesh.rotation.y = -0.58;
    } else {
      // pinned to the lower-right corner of the view, at the knot's depth
      const ndc = knotRoot.position.clone().project(camera);
      const dist = camera.position.distanceTo(knotRoot.position);
      globe.position.set(0.72, -0.68, ndc.z).unproject(camera);
      globe.scale.setScalar((dist / 0.62) * Math.min(1, 0.75 + 0.25 * camera.aspect));
    }
    globe.quaternion.copy(knotRoot.quaternion);
    const toEye = eye.clone().sub(globe.position).normalize();
    reticle.position.copy(globe.position).addScaledVector(toEye, GLOBE_R * globe.scale.x * 1.02);
    reticle.lookAt(eye);
    reticle.scale.copy(globe.scale);
  }
  // soft shadow under the knot
  shadow.visible = !!S.comps.length && S.xrMode !== 'immersive-ar';
  shadow.position.x = knotRoot.position.x; shadow.position.z = knotRoot.position.z;
  shadow.scale.setScalar(Math.max(0.1, knotR * knotRoot.scale.x * 3.2));
}

let last = performance.now();
renderer.setAnimationLoop(frame);
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (renderer.xr.isPresenting) {
    if (pendingRecenter > 0 && --pendingRecenter === 0) { recenterVR(); redrawAll(); }
    updateXR(dt);
    updateTip();
  } else {
    controls.target.lerp(knotRoot.position, 0.2);
    controls.update();
  }
  animate(dt);
  maybeRequestSurface();
  maybeRequestGlobe();
  maybeUpdateProjection(t);
  renderer.render(scene, camera);
}

// ───────────────────────────── sounds ─────────────────────────────
let audio = null;
function click() {
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1400;
    g.gain.setValueAtTime(0.05, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.05);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.06);
  } catch { /* no audio */ }
}

// ───────────────────────────── startup ─────────────────────────────
function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
  projDirty = true;
}
new ResizeObserver(resize).observe(stage);
resize();
bindSidebar();

async function setupXRButtons() {
  const vr = $('#enter-vr'), ar = $('#enter-ar'), status = $('#xr-status');
  await window.__xrReady?.catch(e => console.warn('XR emulation failed to load', e));
  const xr = navigator.xr;
  const [okVR, okAR] = xr ? await Promise.all([xr.isSessionSupported('immersive-vr').catch(() => false), xr.isSessionSupported('immersive-ar').catch(() => false)]) : [false, false];
  vr.disabled = !okVR; ar.disabled = !okAR;
  vr.addEventListener('click', () => enterXR('immersive-vr'));
  ar.addEventListener('click', () => enterXR('immersive-ar'));
  status.textContent = okVR || okAR
    ? 'Your headset is ready. Hand tracking works best; controllers work too.'
    : 'Open this page in the Meta Quest browser to draw with your hands. Here you can draw with the mouse.';
}
setupXRButtons();

document.fonts.load('400 30px "Atkinson Hyperlegible"').then(() => document.fonts.load('500 30px "Source Serif 4"')).finally(() => redrawAll());
applyTheme();
loadLibrary(1);
S.pristine = true;
window.MathJax?.startup?.promise?.then(() => window.MathJax.typesetPromise(document.querySelectorAll('#sidebar .small'))).catch(() => {});

// for automated checks
window.knotSculptor = {
  S, actions, act, LIBRARY, knotRoot, camera, globe, surfaceGroup, xrInput, menuPanel, infoPanel, projPanel, tipPanel,
  get tip() { return tipPanel.mesh.visible ? tipText : ''; },
  get grabState() { return grab ? { hands: grab.hands.length, engaged: grab.engaged } : null; },
  // step the loop by hand (hidden preview panes don't run requestAnimationFrame)
  async frames(n = 1, ms = 16) { for (let i = 0; i < n; i++) { frame(performance.now()); await new Promise(r => setTimeout(r, ms)); } },
  get displayComps() { return displayComps; },
  get debug() { return { globeData: !!globeData, globeInflight, globeShape, surfaceInflight, surfaceShape, surfaceLevel, surfaceKids: surfaceGroup.children.length, sweepFrames: sweepFrames.filter(Boolean).length, flatT }; },
};
