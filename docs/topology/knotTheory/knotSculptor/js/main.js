// Knot Sculptor — draw a knot in the air (WebXR hand tracking on Meta Quest, or a mouse), then study it:
// invariants, its projections, a Seifert surface, and the sphere of viewing directions.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { tubeGeometry } from './tube.js';
import { XRInput } from './hands.js?v=2';
import { THEMES, FONT_BODY, drawPoincareCard, renderInfo, renderProjection, renderMovingProjection, renderMenu, projectionData } from './panels.js';
import { P } from './poly.js';
import { KNOT_TABLE } from './knotTable.js';
import { nameTex } from './identify.js';
import * as B from './builders.js';
import { resampleBySpacing, normalizeSize, safeSmooth, liftPlanarCurve, resampleClosed, centroid, radius, closedLength } from './knot.js';
import { projectDiagram } from './diagram.js';
import { createMoveAnimation, sampleMoveAnimation } from './moveAnimation.js';
import { encodeKnot, decodeKnot, binarySTL, download, randomBraid } from './share.js';
import {
  PALETTES, PALETTE_IDS, DEFAULT_PALETTE, ROPE_PERIOD,
  samplePaletteHex, samplePaletteLinear, paletteCSSGradient,
  cumulativeArcLengths, createStrandColorState, stepStrandColorState, ringColorsForStrand,
} from './palettes.js';
import { SparkSystem } from './sparks.js';

// ───────────────────────────── constants & state ─────────────────────────────
const TUBE_R = 0.0042;          // tube radius (m, knot-local)
const SPACING = 0.007;          // vertex spacing of finished strands
const HOME = new THREE.Vector3(0, 1.25, -0.5);
const TAU = 2 * Math.PI;

let savedPalette = DEFAULT_PALETTE;
try {
  const p = localStorage.getItem('knotSculptor.palette');
  if (p && PALETTES[p]) savedPalette = p;
} catch { /* storage blocked */ }

const S = {
  comps: [], strandColors: [], history: [], typeVersion: 0, shapeVersion: 0,
  // mode 'draw' = the next stroke is armed (New knot, or Add strand when addStrand); 'move' = pinches grab.
  // With nothing on screen the drawing hand always draws. pristine = still the startup knot, untouched.
  mode: 'move', drawHand: 'right', addStrand: false, crossMode: 'alternate', pristine: true,
  palette: savedPalette, sparks: true,
  relax: false, surface: false, level: Math.PI * 2, sweep: false, flatten: false, circles: false, globe: true, moves: true, moveKind: 'reduce',
  theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
  lib: 1, custom: null, analysis: null, geometry: null, xrMode: null,
  spin: false, tube: 1, surfOpacity: 1,
};
// Desktop frames are drawn only when something changed; anything that alters the scene calls invalidate().
let needsRender = true;
const invalidate = () => { needsRender = true; };
const th = () => THEMES[S.theme];
const drawArmed = () => S.mode === 'draw' || !S.comps.length;
const phaseOffsetFor = idx => (idx * 0.381966) % 1;
const nextPhaseOffset = () => phaseOffsetFor(S.addStrand ? S.comps.length : 0);
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
scene.environmentIntensity = 0.34;
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(0.6, 3, 1.2);
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0xcfd3dc, 0.58));

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

// Flying sparks particle system (world space)
const sparks = new SparkSystem(scene);

// the knot: everything in knot-local coordinates lives under knotRoot
const knotRoot = new THREE.Group();
knotRoot.position.copy(HOME);
scene.add(knotRoot);
const tubeGroup = new THREE.Group();
knotRoot.add(tubeGroup);
function makeRopeMaterial({ roughness = 0.32, clearcoat = 0.36, emissiveIntensity = 0.24 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness,
    metalness: 0.05,
    clearcoat,
    clearcoatRoughness: 0.26,
    emissive: 0xffffff,
    emissiveIntensity,
  });
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor;\n#endif',
    );
  };
  return mat;
}
const knotMats = [0, 1, 2, 3].map(() => makeRopeMaterial({ roughness: 0.32, clearcoat: 0.36, emissiveIntensity: 0.24 }));
const tubeMeshes = [];

// live stroke (brighter magical self-glow while sculpting)
const strokeMat = makeRopeMaterial({ roughness: 0.26, clearcoat: 0.44, emissiveIntensity: 0.38 });
const strokeMesh = new THREE.Mesh(new THREE.BufferGeometry(), strokeMat);
const ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineDashedMaterial({ dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.78 }));
const startDot = new THREE.Mesh(new THREE.SphereGeometry(TUBE_R * 1.85, 20, 14), new THREE.MeshBasicMaterial());
const startHalo = new THREE.Mesh(
  new THREE.SphereGeometry(TUBE_R * 3.1, 20, 14),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.30, depthWrite: false }),
);
startDot.add(startHalo);
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

// ───────────────────────────── smooth viewing-direction sphere ─────────────────────────────
const globe = new THREE.Group();
const GLOBE_R = 0.05;

// Build an indexed, smooth-normal sphere (detail = 34 → 12,252 unique vertices, zero flat polygon facets)
// together with its 1-ring vertex adjacency so chamber boundaries (Reidemeister walls) get crisp contours.
const globeSphere = (() => {
  const raw = new THREE.IcosahedronGeometry(GLOBE_R, 34);
  const srcPos = raw.attributes.position;
  const keyMap = new Map();
  const unit = [];
  const indices = [];
  for (let i = 0; i < srcPos.count; i++) {
    const x = srcPos.getX(i) / GLOBE_R, y = srcPos.getY(i) / GLOBE_R, z = srcPos.getZ(i) / GLOBE_R;
    const len = Math.hypot(x, y, z) || 1;
    const ux = x / len, uy = y / len, uz = z / len;
    const k = `${Math.round(ux * 1e5)},${Math.round(uy * 1e5)},${Math.round(uz * 1e5)}`;
    let u = keyMap.get(k);
    if (u === undefined) {
      u = unit.length / 3;
      keyMap.set(k, u);
      unit.push(ux, uy, uz);
    }
    indices.push(u);
  }
  raw.dispose();

  const U = unit.length / 3;
  const posArr = new Float32Array(3 * U);
  const normArr = new Float32Array(3 * U);
  const colArr = new Float32Array(3 * U);
  for (let u = 0; u < U; u++) {
    const ux = unit[3 * u], uy = unit[3 * u + 1], uz = unit[3 * u + 2];
    posArr[3 * u] = ux * GLOBE_R; posArr[3 * u + 1] = uy * GLOBE_R; posArr[3 * u + 2] = uz * GLOBE_R;
    normArr[3 * u] = ux; normArr[3 * u + 1] = uy; normArr[3 * u + 2] = uz;
  }

  // 1-ring neighbor list per unique vertex
  const neighSets = Array.from({ length: U }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    neighSets[a].add(b); neighSets[a].add(c);
    neighSets[b].add(a); neighSets[b].add(c);
    neighSets[c].add(a); neighSets[c].add(b);
  }
  const adjOffsets = new Uint32Array(U + 1);
  let totalEdges = 0;
  for (let u = 0; u < U; u++) { adjOffsets[u] = totalEdges; totalEdges += neighSets[u].size; }
  adjOffsets[U] = totalEdges;
  const adjList = new Uint32Array(totalEdges);
  let ptr = 0;
  for (let u = 0; u < U; u++) for (const nb of neighSets[u]) adjList[ptr++] = nb;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  geom.setIndex(new THREE.BufferAttribute(U > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices), 1));
  geom.computeBoundingSphere();

  return { geom, unit: Float64Array.from(unit), U, adjOffsets, adjList, countsAtVert: new Uint16Array(U) };
})();

const globeMesh = new THREE.Mesh(
  globeSphere.geom,
  new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.34, metalness: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.22,
  }),
);
globe.add(globeMesh);
const reticle = new THREE.Mesh(
  new THREE.TorusGeometry(0.0095, 0.0016, 12, 48),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 }),
);
scene.add(globe, reticle);
let globeData = null;
let globeBins = null;

// Build z-latitude bands over the upper-hemisphere Fibonacci directions for fast (~2 ms) lookup.
function buildGlobeBins(data) {
  const { dirs, counts } = data;
  const M = counts.length;
  const NB = 28;
  const buckets = Array.from({ length: NB }, () => []);
  for (let j = 0; j < M; j++) {
    const dz = Math.max(0, Math.min(0.999999, dirs[3 * j + 2]));
    buckets[Math.floor(dz * NB)].push(j);
  }
  return { NB, buckets };
}

function queryGlobeDirection(dx, dy, dz) {
  if (!globeData || !globeBins) return null;
  const { dirs, counts, open } = globeData;
  const { NB, buckets } = globeBins;
  // Antipodal directions give mirror-image projections with the exact same crossing count.
  let qx = dx, qy = dy, qz = dz;
  if (qz < 0) { qx = -qx; qy = -qy; qz = -qz; }
  const b0 = Math.min(NB - 1, Math.max(0, Math.floor(qz * NB)));
  const bLo = Math.max(0, b0 - 2), bHi = Math.min(NB - 1, b0 + 2);
  let bestDot = -1, bestIdx = 0;
  for (let b = bLo; b <= bHi; b++) {
    const arr = buckets[b];
    for (let a = 0; a < arr.length; a++) {
      const j = arr[a];
      const dot = Math.abs(qx * dirs[3 * j] + qy * dirs[3 * j + 1] + qz * dirs[3 * j + 2]);
      if (dot > bestDot) { bestDot = dot; bestIdx = j; }
    }
  }
  return { count: counts[bestIdx], open: open ? open[bestIdx] : 1 };
}

// ───────────────────────────── VR panels ─────────────────────────────
class Panel3D {
  constructor(wM, hM, W, H) {
    this.wM = wM; this.hM = hM; this.W = W; this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.premultiplyAlpha = true;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wM, hM),
      new THREE.MeshBasicMaterial({
        map: this.tex, transparent: true, toneMapped: false, alphaTest: 0.015,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      }),
    );
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
    try { await fn(this.ctx, this.W, this.H); this.tex.needsUpdate = true; invalidate(); } catch (e) { console.error(e); }
    this.busy = false;
    if (this.dirty) this.redraw?.();
  }
  regionAt(px, py) { return this.regions.find(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h); }
}
const infoPanel = new Panel3D(0.40, 0.33, 1200, 990);
const projPanel = new Panel3D(0.40, 0.333, 1200, 1000);
const menuPanel = new Panel3D(0.24, 0.34, 920, 1300);
infoPanel.mesh.position.set(-0.39, 0.03, 0.1);
infoPanel.mesh.rotation.y = 0.58;
projPanel.mesh.position.set(0.39, 0.03, 0.1);
projPanel.mesh.rotation.y = -0.58;
panels.add(infoPanel.mesh, projPanel.mesh);
menuPanel.mesh.visible = false;
scene.add(menuPanel.mesh);
const globeLegend = new Panel3D(0.18, 0.056, 720, 224);
panels.add(globeLegend.mesh);
// a one-line tip under the knot: what a pinch will do right now
const tipPanel = new Panel3D(0.36, 0.055, 1080, 165);
tipPanel.mesh.position.set(0, -0.235, 0.07);
tipPanel.mesh.visible = false;
panels.add(tipPanel.mesh);
let tipText = '';

// Paired curved jaws show the pinch location and close as the fingertips come together.
const cursors = {};
for (const side of ['left', 'right']) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthTest: false });
  const jaws = [-1, 1].map(sign => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(sign * 0.005, 0, -0.012),
      new THREE.Vector3(sign * 0.014, 0, -0.015));
    const jaw = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0018, 6, false), material);
    jaw.renderOrder = 10;
    group.add(jaw);
    return jaw;
  });
  group.visible = false;
  scene.add(group);
  cursors[side] = { group, jaws, material };
}

const xrInput = new XRInput(renderer, scene);

// ───────────────────────────── theme ─────────────────────────────
function applyTheme() {
  const t = th();
  const isDark = S.theme === 'dark';
  document.documentElement.classList.toggle('light', !isDark);
  sparks.setDark(isDark || S.xrMode === 'immersive-ar');
  invalidate();
  const ar = S.xrMode === 'immersive-ar';
  scene.background = ar ? null : new THREE.Color(t.bg);
  floor.visible = !ar;
  floor.material.map?.dispose();
  floor.material.map = radialTexture(t.floor, 1, 0);
  floor.material.needsUpdate = true;
  ghost.material.color.set(t.muted);
  const startHex = samplePaletteHex(S.palette, nextPhaseOffset(), t.comps[0]);
  startDot.material.color.set(startHex);
  startHalo.material.color.set(startHex);
  surfFront.color.set(t.surfaceFront);
  surfBack.color.set(t.surfaceBack);
  reticle.material.color.set(isDark ? '#ffffff' : '#171c2b');
  for (const side of ['left', 'right']) cursors[side].material.color.set(t.accentInk);
  tipText = '';
  updateTubeColors();
  recolorGlobe();
  redrawAll();
}

// ───────────────────────────── knot state & rope color gradient ─────────────────────────────
const copyComps = cs => cs.map(p => Float64Array.from(p));
const copyColorStates = cs => cs.map(s => (s ? { ...s } : null));
let flatT = 0, flatTarget = null, displayComps = [], moveAnimation = null;

function ensureStrandColorStates() {
  while (S.strandColors.length > S.comps.length) S.strandColors.pop();
  for (let i = 0; i < S.comps.length; i++) {
    if (!S.strandColors[i]) {
      const L = closedLength(S.comps[i]);
      S.strandColors[i] = createStrandColorState({
        closedLength: L,
        period: ROPE_PERIOD,
        animate: false,
        phaseOffset: phaseOffsetFor(i),
      });
    }
  }
}

function strandRingColors(pts, index) {
  ensureStrandColorStates();
  const t = th();
  const fallbackHex = t.comps[index % t.comps.length];
  return ringColorsForStrand(pts, {
    closed: true,
    paletteId: S.palette,
    state: S.strandColors[index],
    period: ROPE_PERIOD,
    phaseOffset: phaseOffsetFor(index),
    fallbackHex,
  });
}

function rebuildTubes() {
  const show = moveAnimation ? moveAnimation.display : flatT > 0 && flatTarget ? lerpComps(S.comps, flatTarget, ease(flatT)) : S.comps;
  displayComps = show;
  ensureStrandColorStates();
  while (tubeMeshes.length > show.length) { const m = tubeMeshes.pop(); m.geometry.dispose(); tubeGroup.remove(m); }
  show.forEach((pts, i) => {
    let m = tubeMeshes[i];
    if (!m) { m = new THREE.Mesh(new THREE.BufferGeometry(), knotMats[i % 4]); tubeMeshes.push(m); tubeGroup.add(m); }
    const ringColors = strandRingColors(pts, i);
    m.geometry = tubeGeometry(pts, TUBE_R * S.tube, { geometry: m.geometry, radial: 12, ringColors });
  });
  invalidate();
}

// Fast color-only update (used during closure period-smoothing animation & palette switches)
function updateTubeColors() {
  const show = displayComps.length ? displayComps : S.comps;
  ensureStrandColorStates();
  show.forEach((pts, i) => {
    const m = tubeMeshes[i];
    if (!m || !m.geometry?.attributes?.color) return;
    const N = Math.floor(pts.length / 3);
    const C = m.geometry.attributes.color.array;
    const R = Math.round((C.length / 3) / Math.max(1, N));
    if (R * N * 3 !== C.length) { rebuildTubes(); return; }
    const ringColors = strandRingColors(pts, i);
    for (let k = 0; k < N; k++) {
      const cr = ringColors[3 * k], cg = ringColors[3 * k + 1], cb = ringColors[3 * k + 2];
      for (let j = 0; j < R; j++) {
        const v = 3 * (k * R + j);
        C[v] = cr; C[v + 1] = cg; C[v + 2] = cb;
      }
    }
    m.geometry.attributes.color.needsUpdate = true;
  });
  const startHex = samplePaletteHex(S.palette, nextPhaseOffset(), th().comps[0]);
  startDot.material.color.set(startHex);
  startHalo.material.color.set(startHex);
  invalidate();
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
  S.history.push({ comps: copyComps(S.comps), strandColors: copyColorStates(S.strandColors) });
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
    globeBins = null;
    if (S.flatten) { S.flatten = false; flatT = 0; flatTarget = null; }
    requestAnalysis(false);
  }
  knotR = S.comps.length ? radius(S.comps) : 0.14;
  rebuildTubes();
  projDirty = true;
  if (type) redrawAll();
  else updateStatus();
}

function loadLibrary(i) {
  S.lib = (i + LIBRARY.length) % LIBRARY.length;
  const e = LIBRARY[S.lib];
  loadCurves(e.make(), { relax: e.relax });
}
// replace the knot by these curves (any size): normalized, evenly spaced, optionally relaxed
function loadCurves(curves, { relax = false, custom = null } = {}) {
  stopRelax();
  pushHistory();
  S.comps = normalizeSize(curves, 0.13).map(p => resampleBySpacing(p, SPACING, 48, 420));
  S.strandColors = S.comps.map((p, idx) => createStrandColorState({
    closedLength: closedLength(p),
    period: ROPE_PERIOD,
    animate: false,
    phaseOffset: phaseOffsetFor(idx),
  }));
  S.custom = custom;
  S.autoBest = true;
  S.mode = 'move'; S.addStrand = false; S.pristine = false;
  knotChanged();
  if (relax) startRelax();
  sync();
}

// ───────────────────────────── workers ─────────────────────────────
const analysisWorker = new Worker(new URL('./analysisWorker.js', import.meta.url), { type: 'module' });
const relaxWorker = new Worker(new URL('./relaxWorker.js', import.meta.url), { type: 'module' });
const seifertWorker = new Worker(new URL('./seifertWorker.js', import.meta.url), { type: 'module' });
const movesWorker = new Worker(new URL('./movesWorker.js', import.meta.url), { type: 'module' });
let analysisSeq = 0, fullSeq = 0, lastGeom = 0;
let movesSeq = 0, movesPending = null, movesCache = null;
movesWorker.onmessage = ev => {
  const m = ev.data;
  if (!movesPending || m.id !== movesPending.id) return;
  if (m.error) console.error('moves worker:', m.error);
  movesCache = { key: movesPending.key, moves: m.moves || [] };
  movesPending = null;
  projDirty = true;
};

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
    if (S.autoBest && m.result.inv?.bestDir) { S.autoBest = false; faceDirection(m.result.inv.bestDir); }
  }
  S.geometry = m.result.geometry;
  refreshInfo();
};

let relaxSeq = 0;
function startRelax() {
  if (!S.comps.length || S.flatten) return;
  S.relax = true;
  projDirty = true;
  relaxWorker.postMessage({ type: 'start', id: ++relaxSeq, components: copyComps(S.comps), options: { spacing: SPACING, tube: 0.0048 } });
  sync();
}
function stopRelax() {
  if (!S.relax) return;
  S.relax = false;
  projDirty = true;
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
    requestAnalysis(false);
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
    globeBins = buildGlobeBins(m);
    recolorGlobe();
    refreshGlobeLegend();
    updateGlobeCaption();
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
  invalidate();
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
  surfaceGroup.visible = S.surface && !moveAnimation && flatT === 0 && S.comps.length > 0;
  if (!surfaceGroup.visible) return;
  if (S.sweep) {
    if (!sweepState || sweepState.shape !== S.shapeVersion) {
      if (S.relax) return;
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
function surfaceRes(cap) { return Math.max(40, Math.min(cap, Math.round((3.4 * knotR) / 0.0072))); }

function maybeRequestGlobe() {
  globe.visible = reticle.visible = S.globe && !moveAnimation && S.comps.length > 0 && !!globeData;
  globeLegend.mesh.visible = globe.visible && !!S.xrMode;
  updateGlobeCaptionVisibility();
  if (!S.globe || !S.comps.length || S.relax || moveAnimation || globeInflight || globeShape === S.shapeVersion) return;
  globeInflight = true;
  seifertWorker.postMessage({ type: 'globe', id: S.shapeVersion, components: copyComps(S.comps), count: 4000 });
}

// Smooth perceptual color ramp on the viewing sphere:
// - fewest crossings (`min`): luminous cyan/teal
// - intermediate crossings: periwinkle → indigo → violet → magenta → warm amber (`max`)
// - chamber boundaries (Reidemeister walls where crossing count jumps): subtle crisp contour line
// - when `min === max` (e.g. round unknot): smooth shading by projection openness so the edge-on equator reads clearly!
const GLOBE_RAMP_DARK = ['#4f7cff', '#7c5dfa', '#a855f7', '#ec4899', '#f59e0b'];
const GLOBE_RAMP_LIGHT = ['#4f6ef7', '#6d4aff', '#9333ea', '#db2777', '#d97706'];

function sampleRampColors(colors, t, out) {
  const n = colors.length - 1;
  const x = Math.min(1, Math.max(0, t)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  out.copy(colors[i]).lerp(colors[i + 1], f);
}

function recolorGlobe() {
  const { geom, unit, U, adjOffsets, adjList, countsAtVert } = globeSphere;
  const col = geom.attributes.color;
  const t = th();
  const isDark = S.theme === 'dark';
  const base = new THREE.Color(isDark ? '#1a2238' : '#dde3f2');
  const bestCol = new THREE.Color(isDark ? '#1ee3f3' : '#06b6d4');
  const bestDeep = new THREE.Color(isDark ? '#0e8ea8' : '#0e7490');
  const contourCol = new THREE.Color(isDark ? '#070a14' : '#1e293b');
  const ramp = (isDark ? GLOBE_RAMP_DARK : GLOBE_RAMP_LIGHT).map(h => new THREE.Color(h));
  const c = new THREE.Color();
  invalidate();

  if (!globeData || !globeBins) {
    for (let u = 0; u < U; u++) col.setXYZ(u, base.r, base.g, base.b);
    col.needsUpdate = true;
    return;
  }

  const { min, max } = globeData;
  const openAtVert = new Float32Array(U);
  for (let u = 0; u < U; u++) {
    const q = queryGlobeDirection(unit[3 * u], unit[3 * u + 1], unit[3 * u + 2]);
    countsAtVert[u] = q.count;
    openAtVert[u] = q.open;
  }

  const span = Math.max(1, max - min);
  for (let u = 0; u < U; u++) {
    const n = countsAtVert[u];
    const op = openAtVert[u];
    if (min === max) {
      // Unknot or constant-crossing curve: shade smoothly from face-on teal poles to indigo edge-on equator
      c.copy(ramp[0]).lerp(bestCol, Math.pow(op, 0.65));
    } else if (n === min) {
      c.copy(bestDeep).lerp(bestCol, 0.45 + 0.55 * op);
    } else {
      const f = max > min + 1 ? (n - min - 1) / (span - 1) : 0.65;
      sampleRampColors(ramp, f, c);
      c.offsetHSL(0, 0, (op - 0.5) * 0.04);
    }

    // Crisp Reidemeister caustic contour along edges where crossing number changes
    let diffNeighbors = 0;
    const s0 = adjOffsets[u], s1 = adjOffsets[u + 1];
    for (let e = s0; e < s1; e++) {
      if (countsAtVert[adjList[e]] !== n) diffNeighbors++;
    }
    if (diffNeighbors > 0) {
      const strength = Math.min(0.42, 0.14 + 0.07 * diffNeighbors);
      c.lerp(contourCol, strength);
    }
    col.setXYZ(u, c.r, c.g, c.b);
  }
  // 2 passes of 1-ring Laplacian anti-aliasing smooth out discrete Fibonacci Voronoi ripples along chamber walls
  const arr = col.array;
  const tmp = new Float32Array(arr.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let u = 0; u < U; u++) {
      const s0 = adjOffsets[u], s1 = adjOffsets[u + 1], deg = s1 - s0;
      if (!deg) { tmp[3 * u] = arr[3 * u]; tmp[3 * u + 1] = arr[3 * u + 1]; tmp[3 * u + 2] = arr[3 * u + 2]; continue; }
      let sr = 0, sg = 0, sb = 0;
      for (let e = s0; e < s1; e++) {
        const nb = 3 * adjList[e];
        sr += arr[nb]; sg += arr[nb + 1]; sb += arr[nb + 2];
      }
      tmp[3 * u] = 0.52 * arr[3 * u] + 0.48 * (sr / deg);
      tmp[3 * u + 1] = 0.52 * arr[3 * u + 1] + 0.48 * (sg / deg);
      tmp[3 * u + 2] = 0.52 * arr[3 * u + 2] + 0.48 * (sb / deg);
    }
    arr.set(tmp);
  }
  col.needsUpdate = true;
}

// ───────────────────────────── view helpers ─────────────────────────────
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
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
  newKnot: () => { const on = S.mode === 'draw' && !S.addStrand; S.mode = on ? 'move' : 'draw'; S.addStrand = false; },
  undo: () => {
    if (!S.history.length) return;
    stopRelax();
    const prev = S.history.pop();
    S.comps = prev.comps;
    S.strandColors = prev.strandColors || [];
    knotChanged();
  },
  clear: () => { if (!S.comps.length) return; stopRelax(); pushHistory(); S.comps = []; S.strandColors = []; S.mode = 'move'; S.addStrand = false; knotChanged(); },
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
  moves: () => { S.moves = !S.moves; projDirty = true; },
  moveKind: v => { if (['reduce', 'r3', 'add1', 'add2'].includes(v)) { S.moveKind = v; projDirty = true; } },
  globe: () => { S.globe = !S.globe; globeHoverCount = null; updateGlobeCaptionVisibility(); },
  best: () => {
    const d = S.analysis?.inv?.bestDir || globeData?.best;
    if (!d) return;
    if (S.flatten) { S.flatten = false; }
    faceDirection(d);
  },
  palette: v => {
    if (!PALETTES[v]) return;
    S.palette = v;
    try { localStorage.setItem('knotSculptor.palette', S.palette); } catch { /* storage blocked */ }
    updateTubeColors();
  },
  nextPalette: () => {
    const idx = (PALETTE_IDS.indexOf(S.palette) + 1) % PALETTE_IDS.length;
    actions.palette(PALETTE_IDS[idx]);
  },
  prevPalette: () => {
    const idx = (PALETTE_IDS.indexOf(S.palette) - 1 + PALETTE_IDS.length) % PALETTE_IDS.length;
    actions.palette(PALETTE_IDS[idx]);
  },
  sparks: () => { S.sparks = !S.sparks; },
  prev: () => loadLibrary(S.lib - 1),
  next: () => loadLibrary(S.lib + 1),
  library: v => { if (+v >= 0) loadLibrary(+v); },
  random: () => {
    const { n, word } = randomBraid();
    const sigma = word.map(g => `σ${'₀₁₂₃₄₅₆₇₈₉'[Math.abs(g)]}${g < 0 ? '⁻¹' : ''}`).join('');
    loadCurves(B.braidClosureCurves(n, word), { relax: true, custom: `Random braid closure ${sigma}` });
  },
  spin: () => { S.spin = !S.spin; spin = null; },
  share: () => shareLink(),
  png: () => savePNG(),
  stl: () => saveSTL(),
  recenter: () => { spin = null; if (renderer.xr.isPresenting) recenterVR(); else { knotRoot.position.copy(HOME); knotRoot.quaternion.identity(); knotRoot.scale.setScalar(1); controls.target.copy(HOME); } },
  theme: () => {
    S.theme = S.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('knotSculptor.theme', S.theme); } catch { /* storage blocked */ }
    applyTheme();
  },
  hand: () => { S.drawHand = S.drawHand === 'right' ? 'left' : 'right'; },
  crossMode: v => { S.crossMode = v; },
  exit: () => renderer.xr.getSession()?.end(),
};
function act(id, value) {
  if (!actions[id]) return;
  if (moveAnimation && ['undo', 'clear', 'newKnot', 'addStrand', 'relax', 'flatten', 'circles', 'prev', 'next', 'library', 'random'].includes(id)) finishMoveAnimation();
  actions[id](value);
  if (id !== 'level') click();
  invalidate();
  sync();
}

// ───────────────────────────── share & export ─────────────────────────────
const knotName = () => S.analysis?.id?.nick || S.custom || LIBRARY[S.lib]?.nick || 'knot';
const fileStem = () => `knot-${knotName().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'knot'}`;
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
async function shareLink() {
  if (!S.comps.length) { toast('Nothing to share yet: draw a knot first'); return; }
  const url = `${location.origin}${location.pathname}#k=${encodeKnot(S.comps)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Link copied: it opens this exact knot'); }
  catch { toast('Link is in the address bar'); }
}
function loadFromHash() {
  const m = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return false;
  try {
    loadCurves(decodeKnot(m[1]), { custom: 'Shared knot' });
    S.pristine = false;
    return true;
  } catch (e) {
    console.warn('could not read the knot in the link', e);
    toast('The knot in this link could not be read');
    return false;
  }
}
function savePNG() {
  renderer.render(scene, camera);
  canvas.toBlob(b => { if (b) { download(`${fileStem()}.png`, b); toast('Saved the view as PNG'); } }, 'image/png');
}
function saveSTL() {
  if (!tubeMeshes.length) { toast('Nothing to export yet'); return; }
  const geoms = tubeMeshes.map(m => ({ position: m.geometry.attributes.position.array, index: m.geometry.index?.array || null }));
  download(`${fileStem()}.stl`, binarySTL(geoms), 'model/stl');
  const mm = Math.round(2 * knotR * 1000);
  toast(`Saved STL: about ${mm} mm across, tube ${(2 * TUBE_R * S.tube * 1000).toFixed(1)} mm thick`);
}

// ───────────────────────────── desktop sidebar ─────────────────────────────
const $ = s => document.querySelector(s);
const UI = {};

function populatePaletteSelect() {
  const sel = $('#palette');
  if (!sel) return;
  const fallback = th().comps[0];
  const supportsBaseSelect = typeof CSS !== 'undefined' && CSS.supports?.('appearance', 'base-select');
  const head = supportsBaseSelect ? '<button type="button"><selectedcontent></selectedcontent></button>' : '';
  sel.innerHTML = head + PALETTE_IDS.map(id => {
    const p = PALETTES[id];
    const grad = paletteCSSGradient(id, fallback);
    return `<option value="${id}"><span class="opt-swatch" style="background:${grad}" aria-hidden="true"></span>${p.name}</option>`;
  }).join('');
  sel.value = S.palette;
}

function syncPaletteSwatch() {
  const sw = $('#palette-swatch');
  if (sw) sw.style.background = paletteCSSGradient(S.palette, th().comps[0]);
  const classicOpt = $('#palette option[value="classic"] .opt-swatch');
  if (classicOpt) classicOpt.style.background = paletteCSSGradient('classic', th().comps[0]);
}

function bindSidebar() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => act(el.dataset.action, el.dataset.value));
  });
  $('#level').addEventListener('input', e => { act('level', +e.target.value); });

  const lib = $('#library');
  lib.innerHTML = '<option value="-1" disabled hidden>Your knot</option>' +
    LIBRARY.map((e, i) => `<option value="${i}">${e.nick ? `${e.nick} — ` : ''}${e.tex.replace(/\\#/g, '#').replace(/\^\*/g, '*').replace(/[{}]/g, '')}</option>`).join('');
  lib.addEventListener('change', e => act('library', e.target.value));

  populatePaletteSelect();
  $('#palette').addEventListener('change', e => act('palette', e.target.value));

  $('#cross-mode').addEventListener('change', e => act('crossMode', e.target.value));
  $('#tube').addEventListener('input', e => {
    S.tube = +e.target.value;
    $('#tube-value').textContent = `${S.tube.toFixed(1)}×`;
    rebuildTubes();
  });
  $('#surf-opacity').addEventListener('input', e => {
    S.surfOpacity = +e.target.value;
    $('#surf-opacity-value').textContent = `${Math.round(S.surfOpacity * 100)}%`;
    for (const m of [surfFront, surfBack]) {
      const see = S.surfOpacity < 0.999;
      if (m.transparent !== see) { m.transparent = see; m.depthWrite = !see; m.needsUpdate = true; }
      m.opacity = S.surfOpacity;
    }
    invalidate();
  });

  // Collapsible status banner (matching poincare-ui.js)
  const banner = $('#status-banner');
  $('#banner-close')?.addEventListener('click', e => {
    e.stopPropagation();
    banner.classList.add('collapsed');
  });
  banner?.addEventListener('click', () => banner.classList.remove('collapsed'));

  // Tabs and collapse button, as on the Poincaré workbench
  const panel = $('#control-panel');
  const tabs = [...document.querySelectorAll('.tab-btn')];
  const showTab = name => {
    tabs.forEach(b => { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
    try { localStorage.setItem('knotSculptor.tab', name); } catch { /* storage blocked */ }
    if (name === 'info' || name === 'surface') typesetOnce(`#tab-${name}`);
    projDirty = true;
  };
  tabs.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  try { const t = localStorage.getItem('knotSculptor.tab'); if (t && tabs.some(b => b.dataset.tab === t)) showTab(t); } catch { /* storage blocked */ }
  const collapse = () => {
    const collapsed = panel.classList.toggle('collapsed');
    document.documentElement.classList.toggle('panel-collapsed', collapsed);
    projDirty = true;
  };
  $('#collapse-btn').addEventListener('click', collapse);
  new ResizeObserver(layoutView).observe(panel);
  panel.addEventListener('transitionend', e => { if (e.target === panel) layoutView(); });

  // Keyboard shortcuts (not while typing in a field)
  const keys = {
    d: () => act('mode', 'draw'), o: () => act('mode', 'move'), z: () => act('undo'), r: () => act('relax'), f: () => act('flatten'),
    p: () => act('nextPalette'),
    s: () => act('surface'), w: () => act('sweep'), c: () => act('circles'), g: () => act('globe'), b: () => act('best'),
    n: () => act('random'), t: () => act('theme'), '[': () => act('prev'), ']': () => act('next'), ' ': () => act('spin'), h: collapse,
    1: () => showTab('knot'), 2: () => showTab('diagram'), 3: () => showTab('surface'), 4: () => showTab('info'),
  };
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, select, textarea') || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.metaKey || e.ctrlKey) { if (k === 'z' && !e.shiftKey) { e.preventDefault(); act('undo'); } return; }
    if (!keys[k] || e.repeat) return;
    if (k === ' ' && e.target.closest?.('button')) return;
    e.preventDefault();
    keys[k]();
  });
  UI.toggles = [...document.querySelectorAll('[data-toggle]')];
  UI.modes = [...document.querySelectorAll('[data-action="mode"]')];
  UI.kinds = [...document.querySelectorAll('[data-action="moveKind"]')];
  UI.undo = $('[data-action="undo"]');
}
const typeset = new Set();
function typesetOnce(sel) {
  if (typeset.has(sel)) return;
  typeset.add(sel);
  window.MathJax?.startup?.promise?.then(() => window.MathJax.typesetPromise([...document.querySelectorAll(`${sel} .panel-subtitle, ${sel} .info-section, ${sel} .range-name`)])).catch(() => {});
}
function sync() {
  for (const el of UI.toggles) {
    const on = !!S[el.dataset.toggle];
    el.setAttribute('aria-pressed', String(on));
    if (el.classList.contains('toggle-btn')) el.classList.toggle('active', on);
  }
  for (const el of UI.modes) {
    const on = (el.dataset.value === 'draw') === drawArmed();
    el.setAttribute('aria-pressed', String(on));
    el.classList.toggle('active', on);
  }
  for (const el of UI.kinds) {
    const on = el.dataset.value === S.moveKind;
    el.setAttribute('aria-pressed', String(on));
    el.classList.toggle('active', on);
  }
  UI.kinds[0].parentElement.classList.toggle('disabled', !S.moves);
  $('#level').value = S.level;
  $('#level-value').textContent = levelLabel();
  $('#library').value = S.custom ? '-1' : String(S.lib);
  $('#palette').value = S.palette;
  syncPaletteSwatch();
  $('#cross-mode').value = S.crossMode;
  UI.undo.disabled = !S.history.length;
  updateStatus();
  updateGlobeCaptionVisibility();
  if (!globeHoverCount) canvas.style.cursor = drawArmed() ? 'crosshair' : 'grab';
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

// ───────────────────────────── desktop viewing-sphere caption ─────────────────────────────
let globeHoverCount = null;
function updateGlobeCaptionVisibility() {
  const cap = $('#globe-caption');
  if (!cap) return;
  const show = S.globe && !S.xrMode && !moveAnimation && S.comps.length > 0 && !!globeData;
  cap.hidden = !show;
  if (show) positionGlobeCaption();
}
function positionGlobeCaption() {
  const cap = $('#globe-caption');
  if (!cap || cap.hidden) return;
  const cx = ((view.globeX + 1) * 0.5) * innerWidth;
  const cy = ((1 - view.globeY) * 0.5) * innerHeight;
  cap.style.left = `${Math.round(cx)}px`;
  cap.style.top = `${Math.min(innerHeight - 34, Math.round(cy + view.globeR + 10))}px`;
}
function updateGlobeCaption() {
  const txt = $('#globe-caption-text');
  if (!txt || !globeData) return;
  const { min, max } = globeData;
  if (globeHoverCount != null) {
    const tag = globeHoverCount === min && max > min ? ' (simplest)' : '';
    txt.innerHTML = `<b>${globeHoverCount} crossing${globeHoverCount === 1 ? '' : 's'}</b>${tag} · click to view`;
  } else if (min === max) {
    txt.innerHTML = `Viewing sphere · <b>${min}</b> crossing${min === 1 ? '' : 's'}`;
  } else {
    txt.innerHTML = `Viewing sphere · <b>${min}–${max}</b> crossings`;
  }
}

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

let infoSeq = 0, infoHTML = '', infoVRKey = '';
function refreshInfo() {
  const model = infoModel();
  const t = model.title || {};
  const html = `
    <div class="ident">
      ${t.tex ? `<div class="ident-name">$${t.tex}$</div>` : ''}
      <div><div class="ident-nick">${t.nick || ''}</div>${t.detail ? `<div class="ident-detail">${t.detail}</div>` : ''}</div>
    </div>
    ${t.note ? `<p class="note">${t.note}</p>` : ''}
    ${model.hint ? `<ul class="hint">${model.hint.map(h => `<li>${h}</li>`).join('')}</ul>` : ''}
    ${model.rows ? `<dl class="rows">${model.rows.map(r => `<dt>${r.label}</dt><dd>${r.value}${r.sub ? `<small>${r.sub}</small>` : ''}</dd>`).join('')}</dl>` : ''}`;
  if (html !== infoHTML) {
    infoHTML = html;
    const el = $('#invariants');
    const seq = ++infoSeq;
    el.innerHTML = html;
    window.MathJax?.startup?.promise?.then(() => { if (seq === infoSeq) window.MathJax.typesetPromise([el]).catch(() => {}); });
  }
  updateStatus();
  infoPanel.redraw = () => infoPanel.draw((ctx, W, H) => renderInfo(ctx, W, H, infoModel(), th()));
  const vrKey = `${html}|${S.theme}`;
  if (S.xrMode && (vrKey !== infoVRKey || infoPanel.dirty)) { infoVRKey = vrKey; infoPanel.redraw(); }
}

// the banner, top left: what this is, in one line
let statusKey = '', statusSeq = 0;
function updateStatus() {
  const A = S.analysis, inv = A?.inv, id = A?.id;
  let tex = '', title, detail, busy = false;
  if (!S.comps.length) { title = 'Draw a knot'; detail = drawArmed() ? 'Drag across the view to draw a closed loop' : 'Or pick one from the library'; }
  else if (!A) { title = S.custom || 'Analyzing…'; detail = 'Computing invariants'; busy = true; }
  else {
    tex = id.tex || '';
    title = id.nick || (inv.components > 1 ? `${inv.components}-component link` : 'Knot');
    const parts = [`${inv.crossings} crossing${inv.crossings === 1 ? '' : 's'}`];
    if (inv.components > 1) parts.push(`${inv.components} components`);
    else if (inv.genusLower !== undefined) parts.push(inv.genusLower === inv.seifertGenus ? `genus ${inv.genusLower}` : `genus ${inv.genusLower}–${inv.seifertGenus}`);
    if (inv.determinant !== undefined) parts.push(`det ${inv.determinant}`);
    detail = parts.join(' · ');
  }
  if (S.relax) { detail = 'Relaxing…'; busy = true; }
  else if (moveAnimation) { detail = 'Reidemeister move in progress'; busy = true; }
  const key = `${tex}|${title}|${detail}|${busy}`;
  if (key === statusKey) return;
  statusKey = key;
  const banner = $('#status-banner'), titleEl = $('#status-title');
  banner.classList.toggle('busy', busy);
  titleEl.textContent = '';
  if (tex) { const m = document.createElement('span'); m.textContent = `$${tex}$`; titleEl.append(m, ' '); }
  titleEl.append(title);
  $('#status-detail').textContent = detail;
  if (tex) {
    const seq = ++statusSeq;
    window.MathJax?.startup?.promise?.then(() => { if (seq === statusSeq) window.MathJax.typesetPromise([titleEl]).catch(() => {}); });
  }
}

function drawMenu() {
  menuPanel.redraw = () => menuPanel.draw(async (ctx, W, H) => {
    menuPanel.regions = await renderMenu(ctx, W, H, menuRows(), th(), menuPanel.hover, menuPanel.pressed);
  });
  menuPanel.redraw();
}
function menuRows() {
  const e = LIBRARY[S.lib];
  const pal = PALETTES[S.palette] || PALETTES[DEFAULT_PALETTE];
  return [
    [{ kind: 'title', id: 't', label: 'Knot Sculptor' }],
    [{ group: 'sculpt', kind: 'toggle', id: 'newKnot', label: 'New knot', active: S.mode === 'draw' && !S.addStrand }, { group: 'sculpt', kind: 'toggle', id: 'addStrand', label: 'Add strand', active: S.mode === 'draw' && S.addStrand }],
    [{ group: 'sculpt', kind: 'button', id: 'prevPalette', label: '‹', weight: 0.42 }, { group: 'sculpt', kind: 'palette', id: 'nextPalette', paletteId: S.palette, label: pal.name, weight: 2.1 }, { group: 'sculpt', kind: 'toggle', id: 'sparks', label: 'Sparks', active: S.sparks, weight: 0.95 }],
    [{ group: 'sculpt', kind: 'button', id: 'undo', label: 'Undo', disabled: !S.history.length }, { group: 'sculpt', kind: 'button', id: 'clear', label: 'Clear' }, { group: 'sculpt', kind: 'toggle', id: 'relax', label: 'Relax', active: S.relax }],
    [{ group: 'surface', kind: 'toggle', id: 'surface', label: 'Seifert surface', active: S.surface, weight: 1.4 }, { group: 'surface', kind: 'toggle', id: 'sweep', label: 'Sweep', active: S.sweep }],
    [{ group: 'surface', kind: 'slider', id: 'level', label: 'Surface level', valueLabel: `$\\Omega = ${levelTex()}$`, value: S.level, min: 0, max: 2 * TAU }],
    [{ group: 'diagram', kind: 'toggle', id: 'flatten', label: 'Flatten', active: S.flatten }, { group: 'diagram', kind: 'toggle', id: 'circles', label: 'Circles', active: S.circles }, { group: 'diagram', kind: 'toggle', id: 'globe', label: 'Sphere', active: S.globe }],
    [{ group: 'diagram', kind: 'toggle', id: 'moves', label: 'Moves', active: S.moves }, { group: 'diagram', kind: 'button', id: 'best', label: 'Best view' }],
    [{ group: 'diagram', kind: 'seg', id: 'moveKind', value: S.moveKind, options: [{ value: 'reduce', label: 'I/II −' }, { value: 'r3', label: 'III' }, { value: 'add1', label: 'I +' }, { value: 'add2', label: 'II +' }] }],
    [{ group: 'lib', kind: 'button', id: 'prev', label: '‹', weight: 0.42 }, { group: 'lib', kind: 'label', id: 'libname', label: `${e.nick ? `${e.nick} ` : ''}$${e.tex}$`, weight: 1.85 }, { group: 'lib', kind: 'button', id: 'next', label: '›', weight: 0.42 }, { group: 'lib', kind: 'button', id: 'random', label: 'Random', accentAlt: true, weight: 0.9 }],
    [{ group: 'sys', kind: 'button', id: 'recenter', label: 'Recenter' }, { group: 'sys', kind: 'toggle', id: 'theme', label: 'Dark', active: S.theme === 'dark' }, { group: 'sys', kind: 'toggle', id: 'hand', label: 'Left hand', active: S.drawHand === 'left' }, { group: 'sys', kind: 'button', id: 'exit', label: 'Exit' }],
  ];
}

async function refreshGlobeLegend() {
  if (!S.xrMode || !globeData) return;
  globeLegend.draw(async (ctx, W, H) => {
    const t = th();
    drawPoincareCard(ctx, W, H, t, { radius: 34 });
    ctx.save();
    ctx.fillStyle = t.surfaceFront;
    ctx.shadowColor = t.surfaceFront;
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(54, 78, 15, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = t.text;
    ctx.font = `600 32px ${FONT_BODY}`;
    ctx.fillText(`Viewing sphere · ${globeData.min} crossings simplest`, 86, 89);
    ctx.fillStyle = t.muted;
    ctx.font = `26px ${FONT_BODY}`;
    ctx.fillText(
      globeData.max > globeData.min
        ? `Up to ${globeData.max} crossings in warmer regions. Poke to aim.`
        : 'Poke any spot on the sphere to look from there.',
      38, 158,
    );
  });
}

// ───────────────────────────── projection (live) ─────────────────────────────
let projDirty = true, lastProj = 0, lastViewKey = '';
const projCanvas = document.getElementById('proj-canvas');
const projCtx = projCanvas.getContext('2d');
let projectionSnapshot = null, projectionRender = 0, observedView = '', viewSettlesAt = 0, viewTimer = null;
const projectionKey = (dir, up) => dir.map(x => x.toFixed(3)).join() + up.map(x => x.toFixed(2)).join();
function currentProjection(snapshot) {
  if (!snapshot || moveAnimation || !S.moves || S.circles || S.flatten || flatT !== 0 || S.relax || snapshot.shapeVersion !== S.shapeVersion || snapshot.kind !== S.moveKind) return false;
  const { dir, up } = viewInKnot();
  return [...dir, ...up].every((v, i) => Math.abs(v - snapshot.view[i]) < 1e-5);
}
function selectMove(snapshot, index) {
  if (!currentProjection(snapshot) || projectionSnapshot !== snapshot || !snapshot.moves[index]) {
    projDirty = true;
    return;
  }
  const move = snapshot.moves[index];
  if (!move.components || !move.steps?.length) return;
  pushHistory();
  const motion = createMoveAnimation(move.steps, move.components, S.comps);
  const center = centroid(S.comps);
  let R = radius(S.comps, center);
  for (const step of move.steps) R = Math.max(R, radius(step.from, center), radius(step.to, center));
  R = Math.max(R, radius(move.components, center));
  moveAnimation = { motion, display: S.comps, center, R, elapsed: 0, duration: Math.min(6, 2.8 + 0.1 * move.steps.length) };
  spin = null; rotAnim = null;
  S.pristine = false;
  projectionSnapshot = null;
  projPanel.regions = [];
  projectionRender++;
  projDirty = true;
  updateMoveControls(null);
  updateStatus();
  click();
}
function finishMoveAnimation() {
  if (!moveAnimation) return;
  const final = moveAnimation.motion.finalComponents;
  moveAnimation = null;
  S.comps = copyComps(final);
  projectionRender++;
  knotChanged();
}
function updateMoveControls(snapshot) {
  const status = document.getElementById('move-status');
  const list = document.getElementById('move-list');
  list.replaceChildren();
  if (moveAnimation) status.textContent = 'Animating the move…';
  else if (!S.comps.length) status.textContent = 'Draw or load a knot to look for moves.';
  else if (!S.moves) status.textContent = 'Move suggestions are hidden.';
  else if (S.circles) status.textContent = 'Turn off Seifert circles to see moves on the diagram.';
  else if (S.flatten || flatT !== 0 || S.relax) status.textContent = 'Move suggestions return when the knot is still and unflattened.';
  else if (snapshot?.waiting) status.textContent = 'Hold the view still to look for moves.';
  else if (snapshot?.searching) status.textContent = 'Looking for moves in this view…';
  else if (!snapshot?.moves.length) status.textContent = 'No applicable moves found for this choice in this view.';
  else {
    status.textContent = 'Click a numbered region to apply the suggested move, or use a button below.';
    snapshot.moves.forEach((move, i) => {
      const button = document.createElement('button');
      button.className = 'toggle-btn';
      const labels = { R1: 'Remove loop (I)', R2: 'Remove pair (II)', R3: 'Slide (III)', 'R1+': 'Add loop (I)', 'R2+': 'Add pair (II)' };
      button.textContent = `${move.label || labels[move.type] || move.type} · ${i + 1}`;
      button.addEventListener('click', () => selectMove(snapshot, i));
      list.append(button);
    });
  }
}
projCanvas.addEventListener('click', e => {
  const snapshot = projectionSnapshot;
  if (!snapshot) return;
  const rect = projCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * 1200 / rect.width;
  const y = (e.clientY - rect.top) * 1000 / rect.height;
  const r = snapshot.regions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (r) selectMove(snapshot, r.value);
});
const projOff = document.createElement('canvas');
projOff.width = 1200; projOff.height = 1000;
function maybeUpdateProjection(now) {
  if (!S.xrMode && !projCanvas.offsetParent) return;
  if (!S.comps.length) {
    if (projDirty || projectionSnapshot) { projDirty = false; projectionSnapshot = null; projectionRender++; projPanel.regions = []; projCtx.clearRect(0, 0, projCanvas.width, projCanvas.height); updateMoveControls(null); }
    return;
  }
  const { dir, up } = viewInKnot();
  const key = projectionKey(dir, up);
  if (key !== observedView) {
    observedView = key;
    viewSettlesAt = now + 300;
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => { projDirty = true; }, 320);
  }
  if (!projDirty && key === lastViewKey) return;
  if (!moveAnimation && now - lastProj < (S.xrMode ? 140 : 60)) return;
  lastProj = now; lastViewKey = key; projDirty = false;
  const comps = displayComps.length ? displayComps : S.comps;
  const data = projectionData(comps, dir, up);
  const c = moveAnimation?.center || centroid(comps), b = data.D.basis;
  const center2 = [c[0] * b.u[0] + c[1] * b.u[1] + c[2] * b.u[2], c[0] * b.v[0] + c[1] * b.v[1] + c[2] * b.v[2]];
  const waiting = now < viewSettlesAt;
  let moves = [], searching = false;
  if (!moveAnimation && S.moves && !S.circles && !S.flatten && flatT === 0 && !S.relax && !waiting) {
    const mk = `${key}|${S.shapeVersion}|${S.moveKind}`;
    if (movesCache?.key === mk) moves = movesCache.moves;
    else {
      searching = true;
      if (movesPending?.key !== mk) {
        movesPending = { id: ++movesSeq, key: mk };
        movesWorker.postMessage({ id: movesSeq, components: copyComps(S.comps), dir, up, kind: S.moveKind, tube: 2 * TUBE_R });
      }
    }
  }
  const snapshot = { moves, waiting, searching, kind: S.moveKind, regions: [], shapeVersion: S.shapeVersion, view: [...dir, ...up] };
  const opts = { th: th(), R: moveAnimation?.R || knotR, center2, seifert: S.circles, moves,
    subtitle: moves.length ? 'Poke a numbered region to apply a move' : 'the diagram you see from where you stand' };
  projectionSnapshot = null;
  projPanel.regions = [];
  const render = ++projectionRender;
  if (moveAnimation) {
    if (S.xrMode) {
      renderMovingProjection(projPanel.ctx, projPanel.W, projPanel.H, data, opts);
      projPanel.tex.needsUpdate = true;
    } else {
      const r = projCanvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (W < 120 || H < 100) { projDirty = true; return; }
      if (projCanvas.width !== W || projCanvas.height !== H) { projCanvas.width = W; projCanvas.height = H; }
      projCtx.setTransform(W / 1200, 0, 0, H / 1000, 0, 0);
      renderMovingProjection(projCtx, 1200, 1000, data, { ...opts, transparent: true, compact: true });
      projCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    return;
  }
  if (S.xrMode) {
    projPanel.redraw = () => projPanel.draw(async (ctx, W, H) => {
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const regions = await renderProjection(off.getContext('2d'), W, H, data, opts);
      if (render === projectionRender && snapshot.shapeVersion === S.shapeVersion && !moveAnimation) {
        ctx.clearRect(0, 0, W, H); ctx.drawImage(off, 0, 0);
        snapshot.regions = regions; projectionSnapshot = snapshot; projPanel.regions = regions;
      }
    });
    projPanel.redraw();
  } else {
    const r = projCanvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (W < 120 || H < 100) { projDirty = true; return; }
    if (projCanvas.width !== W || projCanvas.height !== H) { projCanvas.width = W; projCanvas.height = H; }
    renderProjection(projOff.getContext('2d'), 1200, 1000, data, { ...opts, transparent: true, compact: true }).then(regions => {
      if (render !== projectionRender || snapshot.shapeVersion !== S.shapeVersion) return;
      snapshot.regions = regions; projectionSnapshot = snapshot;
      projCtx.setTransform(1, 0, 0, 1, 0, 0);
      projCtx.clearRect(0, 0, W, H); projCtx.drawImage(projOff, 0, 0, W, H);
      updateMoveControls(snapshot);
    }).catch(console.error);
  }
}

function redrawAll() {
  refreshInfo();
  projDirty = true;
  sync();
  refreshGlobeLegend();
  updateGlobeCaption();
}

// ───────────────────────────── XR session ─────────────────────────────
async function enterXR(mode) {
  try {
    if (moveAnimation) finishMoveAnimation();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
    S.xrMode = mode;
    xrInput.setHandModelsVisible(mode !== 'immersive-ar');
    panels.visible = true;
    pendingRecenter = 3;
    if (S.pristine && S.comps.length) { stopRelax(); S.comps = []; S.strandColors = []; S.history = []; knotChanged(); }
    else if (S.comps.length) tipUntil = performance.now() + 12000;
    session.addEventListener('end', () => {
      S.xrMode = null;
      grab = null; spin = null;
      panels.visible = false;
      menuPanel.mesh.visible = false;
      for (const c of Object.values(cursors)) c.group.visible = false;
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
const pending = { left: null, right: null };
let grab = null, spin = null;
const prevQuat = new THREE.Quaternion(), prevPosition = new THREE.Vector3();
let menuShown = false;
const consumed = { left: false, right: false };

function handMatrix(h) { return new THREE.Matrix4().compose(h.grip, h.quat, new THREE.Vector3(1, 1, 1)); }

const GRAB_MOVE = 0.008, GRAB_TURN = 0.08;
function startGrab(hands, engaged = false) {
  spin = null;
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
  prevPosition.copy(knotRoot.position);
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
    const [a, b] = handsPair(grab.hands);
    const v = b.grip.clone().sub(a.grip);
    const s = THREE.MathUtils.clamp(grab.s0 * v.length() / grab.v0.length(), 0.25, 6);
    const dq = new THREE.Quaternion().setFromUnitVectors(grab.v0.clone().normalize(), v.clone().normalize());
    knotRoot.quaternion.copy(dq).multiply(grab.q0);
    knotRoot.scale.setScalar(s);
    const mid = a.grip.clone().add(b.grip).multiplyScalar(0.5);
    knotRoot.position.copy(grab.pos0).sub(grab.mid0).multiplyScalar(s / grab.s0).applyQuaternion(dq).add(mid);
  }
  if (dt > 0) {
    const velocity = knotRoot.position.clone().sub(prevPosition).divideScalar(dt).clampLength(0, 1.5);
    grab.velocity = grab.velocity ? grab.velocity.lerp(velocity, 0.3) : velocity;
  }
  const dq = knotRoot.quaternion.clone().multiply(prevQuat.clone().invert());
  const angle = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
  if (angle > 1e-5 && dt > 0) {
    const axis = new THREE.Vector3(dq.x, dq.y, dq.z).normalize().multiplyScalar(Math.sign(dq.w) || 1);
    const w = axis.multiplyScalar(angle / dt).clampLength(0, 4);
    grab.omega = grab.omega ? grab.omega.lerp(w, 0.3) : w;
  } else if (grab.omega) grab.omega.multiplyScalar(0.8);
  prevQuat.copy(knotRoot.quaternion);
  prevPosition.copy(knotRoot.position);
}
const handsPair = hs => [hs[0], hs[1]];
function endGrab(h) {
  if (!grab) return;
  const rest = grab.hands.filter(x => x !== h);
  const omega = grab.engaged && h.present ? grab.omega : null;
  const velocity = grab.engaged && h.present ? grab.velocity : null;
  grab = null;
  if (rest.length) startGrab(rest);
  else if (omega || velocity) spin = { omega: omega?.clone() || new THREE.Vector3(), velocity: velocity?.clone() || new THREE.Vector3() };
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
    if (r.kind === 'move') selectMove(projectionSnapshot, r.value);
    else if (r.kind === 'slider') st.drag = r;
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
      if (p === menuPanel && h === off && h.isHand) continue;
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
        const local = dom.tip.clone().sub(gc).normalize().applyQuaternion(globe.quaternion.clone().invert());
        faceDirection([local.x, local.y, local.z]);
        click();
      }
    } else if (d > GLOBE_R + 0.02) globe.userData.touching = false;
  }

  for (const h of [dom, off]) {
    if (h.pinchStart) {
      consumed[h.side] = near[h.side];
      if (consumed[h.side]) continue;
      if (h === dom && drawArmed() && !S.flatten) pending[h.side] = { t0: performance.now(), p0: h.pos.clone(), pts: [] };
      else startGrab(grab ? [...grab.hands, h] : [h]);
    }
    if (h.pinching && pending[h.side]) {
      const pd = pending[h.side];
      pushStrokePoint(pd.pts, h);
      if (performance.now() - pd.t0 > 120 && h.pos.distanceTo(pd.p0) > 0.012) { beginStroke(h, pd.pts); pending[h.side] = null; }
    }
    if (h.pinching && strokes[h.side]) extendStroke(h, dt);
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
    c.group.visible = h.present && !near[side];
    if (c.group.visible) {
      c.group.position.copy(h.pos);
      c.group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), h.pinchAxis);
      const gap = THREE.MathUtils.clamp(h.pinchGap, 0.004, 0.05);
      c.jaws[0].position.x = -gap / 2;
      c.jaws[1].position.x = gap / 2;
      const drawing = h === dom && drawArmed();
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
    drawPoincareCard(ctx, W, H, c, { radius: H / 2, borderW: 2.5 });
    ctx.font = `600 42px ${FONT_BODY}`;
    const w = ctx.measureText(t).width, s = Math.min(1, (W - 96) / w);
    ctx.save();
    ctx.translate(W / 2, H / 2 + 15 * s);
    ctx.scale(s, s);
    ctx.fillStyle = S.mode === 'draw' || !S.comps.length ? c.accentInk : c.text;
    ctx.textAlign = 'center';
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
}

function placeMenu(h, head, snap) {
  const target = h.isHand
    ? h.palmCenter.clone().addScaledVector(h.palmNormal, 0.05).add(new THREE.Vector3(0, 0.14, 0))
    : h.pos.clone().add(new THREE.Vector3(0, 0.17, 0));
  const m = menuPanel.mesh;
  if (snap) m.position.copy(target); else m.position.lerp(target, 0.3);
  const look = new THREE.Object3D();
  look.position.copy(m.position);
  look.lookAt(head);
  if (snap) m.quaternion.copy(look.quaternion); else m.quaternion.slerp(look.quaternion, 0.3);
}

// ── drawing a strand (with live cycling gradient + flying sparks) ──
const strokeSparkPrev = new THREE.Vector3();
let hasStrokeSparkPrev = false;
let currentTipRgbLinear = [1, 0.4, 0.85];

function beginStroke(h, pts) {
  stopRelax();
  strokes[h.side] = { pts };
  hasStrokeSparkPrev = false;
  if (!pts.length) pushStrokePoint(pts, h);
  updateStrokeMesh(pts, 0.016);
}
function pushStrokePoint(pts, h) {
  const local = knotRoot.worldToLocal(h.pos.clone());
  const n = pts.length;
  if (n && Math.hypot(local.x - pts[n - 3], local.y - pts[n - 2], local.z - pts[n - 1]) * knotRoot.scale.x <= 0.004) return false;
  pts.push(local.x, local.y, local.z);
  return true;
}
function extendStroke(h, dt) {
  const st = strokes[h.side];
  if (pushStrokePoint(st.pts, h)) updateStrokeMesh(st.pts, dt);
  else if (S.sparks && st.pts.length >= 6) emitStrokeTipSparks(st.pts, dt);
}

function emitStrokeTipSparks(pts, dt) {
  if (!S.sparks || pts.length < 3) return;
  const n = pts.length;
  knotRoot.updateMatrixWorld();
  const tipWorld = knotRoot.localToWorld(_v3.set(pts[n - 3], pts[n - 2], pts[n - 1]));
  sparks.emitTip(tipWorld, hasStrokeSparkPrev ? strokeSparkPrev : null, dt, currentTipRgbLinear, knotRoot.scale.x);
  strokeSparkPrev.copy(tipWorld);
  hasStrokeSparkPrev = true;
}

function updateStrokeMesh(pts, dt = 0.016) {
  const f = Float64Array.from(pts);
  const N = f.length / 3;
  strokeMesh.visible = N >= 2;
  startDot.visible = ghost.visible = N >= 2;
  const fallback = th().comps[0];
  const offset = nextPhaseOffset();
  if (N >= 2) {
    const ringColors = ringColorsForStrand(f, {
      closed: false,
      paletteId: S.palette,
      period: ROPE_PERIOD,
      phaseOffset: offset,
      fallbackHex: fallback,
    });
    currentTipRgbLinear = [ringColors[3 * N - 3], ringColors[3 * N - 2], ringColors[3 * N - 1]];
    strokeMesh.geometry = tubeGeometry(f, TUBE_R * S.tube, {
      closed: false, radial: 12, geometry: strokeMesh.geometry, ringColors,
    });
    const { total } = cumulativeArcLengths(f, false);
    ghost.material.color.set(samplePaletteHex(S.palette, offset + total / ROPE_PERIOD, fallback));
    emitStrokeTipSparks(pts, dt);
  }
  const startHex = samplePaletteHex(S.palette, offset, fallback);
  startDot.material.color.set(startHex);
  startHalo.material.color.set(startHex);
  startDot.position.set(f[0], f[1], f[2]);
  const g = ghost.geometry.attributes.position;
  g.setXYZ(0, f[3 * N - 3], f[3 * N - 2], f[3 * N - 1]);
  g.setXYZ(1, f[0], f[1], f[2]);
  g.needsUpdate = true;
  ghost.computeLineDistances();
  invalidate();
}

function finishStroke(side) {
  const st = strokes[side];
  strokes[side] = null;
  hasStrokeSparkPrev = false;
  strokeMesh.visible = ghost.visible = startDot.visible = false;
  const raw = Float64Array.from(st.pts);
  const openLength = cumulativeArcLengths(raw, false).total;
  addStrand(raw, { smooth: true, openLength });
}

function addStrand(pts, { smooth = true, relax = false, openLength = null } = {}) {
  if (moveAnimation) finishMoveAnimation();
  if (pts.length / 3 < 8 || closedLength(pts) < 0.08) return;
  let strand = resampleBySpacing(pts, SPACING * 0.8, 48, 420);
  pushHistory();
  const keep = S.addStrand ? S.comps : [];
  const keepColors = S.addStrand ? S.strandColors.slice(0, keep.length) : [];
  let comps = [...keep, strand];
  if (smooth) comps = safeSmooth(comps, 10, 0.4, comps.length - 1);
  const finalStrand = resampleBySpacing(comps[comps.length - 1], SPACING, 48, 420);
  comps[comps.length - 1] = finalStrand;

  const finalLen = closedLength(finalStrand);
  const colorState = createStrandColorState({
    openLength: openLength ?? finalLen * 0.94,
    closedLength: finalLen,
    period: ROPE_PERIOD,
    animate: true,
    phaseOffset: phaseOffsetFor(comps.length - 1),
  });

  // Celebratory spark burst at the closing bridge & along the loop before local recentering shifts coords
  if (S.sparks) {
    knotRoot.updateMatrixWorld();
    const seamWorld = knotRoot.localToWorld(new THREE.Vector3(pts[0], pts[1], pts[2]));
    const N = finalStrand.length / 3;
    const worldLoop = new Float64Array(3 * N);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      knotRoot.localToWorld(tmp.set(finalStrand[3 * i], finalStrand[3 * i + 1], finalStrand[3 * i + 2]));
      worldLoop[3 * i] = tmp.x; worldLoop[3 * i + 1] = tmp.y; worldLoop[3 * i + 2] = tmp.z;
    }
    sparks.emitClosureBurst(seamWorld, worldLoop, S.palette, th().comps[(comps.length - 1) % 4], knotRoot.scale.x);
    closureChime();
  }

  S.comps = comps;
  S.strandColors = [...keepColors, colorState];
  S.custom = 'Your drawing';
  recenterLocal();
  S.mode = 'move';
  S.addStrand = false;
  S.pristine = false;
  tipUntil = performance.now() + 12000;
  knotChanged();
  if (relax) startRelax();
}

// ───────────────────────────── desktop drawing & globe hover ─────────────────────────────
let deskStroke = null;
let lastDeskMoveTime = 0;
const raycaster = new THREE.Raycaster();
function pointerRay(e) {
  camera.updateMatrixWorld();
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  return raycaster.ray;
}
canvas.addEventListener('pointerdown', e => {
  if (renderer.xr.isPresenting) return;
  // Clicking the viewing sphere faces that direction
  if (globe.visible && e.button === 0) {
    pointerRay(e);
    const hit = raycaster.intersectObject(globeMesh, false)[0];
    if (hit) {
      const local = hit.point.clone().sub(globe.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(globe.quaternion.clone().invert());
      faceDirection([local.x, local.y, local.z]);
      click();
      return;
    }
  }
  if (!drawArmed() || e.button !== 0 || e.ctrlKey || e.metaKey) return;
  if (moveAnimation) finishMoveAnimation();
  stopRelax();
  const ray = pointerRay(e);
  const n = camera.getWorldDirection(new THREE.Vector3()).negate();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, knotRoot.position);
  const inv = knotRoot.quaternion.clone().invert();
  const u = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).applyQuaternion(inv);
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(inv);
  const w = n.clone().applyQuaternion(inv);
  deskStroke = { plane, u, v, w, pts2: [], pts3: [] };
  hasStrokeSparkPrev = false;
  lastDeskMoveTime = performance.now();
  controls.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  extendDesk(ray);
});
canvas.addEventListener('pointermove', e => {
  if (renderer.xr.isPresenting) return;
  if (deskStroke) {
    extendDesk(pointerRay(e));
    return;
  }
  // Hovering over the viewing sphere shows the exact crossing count at that direction
  if (globe.visible && globeData) {
    pointerRay(e);
    const hit = raycaster.intersectObject(globeMesh, false)[0];
    if (hit) {
      const local = hit.point.clone().sub(globe.getWorldPosition(_v1)).normalize().applyQuaternion(globe.quaternion.clone().invert());
      const q = queryGlobeDirection(local.x, local.y, local.z);
      const nextCount = q ? q.count : null;
      if (nextCount !== globeHoverCount) {
        globeHoverCount = nextCount;
        canvas.style.cursor = 'pointer';
        updateGlobeCaption();
      }
      return;
    }
  }
  if (globeHoverCount !== null) {
    globeHoverCount = null;
    canvas.style.cursor = drawArmed() ? 'crosshair' : 'grab';
    updateGlobeCaption();
  }
});
canvas.addEventListener('pointerleave', () => {
  if (globeHoverCount !== null) {
    globeHoverCount = null;
    updateGlobeCaption();
  }
});
canvas.addEventListener('pointerup', () => {
  if (!deskStroke) return;
  const st = deskStroke;
  deskStroke = null;
  hasStrokeSparkPrev = false;
  controls.enabled = true;
  strokeMesh.visible = ghost.visible = startDot.visible = false;
  const N = st.pts2.length / 2;
  if (N < 8) return;
  const flat3 = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) { flat3[3 * i] = st.pts2[2 * i]; flat3[3 * i + 1] = st.pts2[2 * i + 1]; }
  const openFlatLen = cumulativeArcLengths(flat3, false).total;
  const closedFlatLen = closedLength(flat3);
  if (closedFlatLen < 0.06) return;
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
  const outClosedLen = closedLength(out);
  const openRatio = closedFlatLen > 1e-6 ? openFlatLen / closedFlatLen : 0.95;
  addStrand(out, { smooth: false, relax: true, openLength: outClosedLen * openRatio });
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
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.004, (now - lastDeskMoveTime) / 1000));
  lastDeskMoveTime = now;
  st.pts2.push(x, y);
  st.pts3.push(local.x, local.y, local.z);
  updateStrokeMesh(st.pts3, dt);
}
function centroidOrigin() { return S.addStrand && S.comps.length ? centroid(S.comps) : [0, 0, 0]; }

// ───────────────────────────── per-frame updates ─────────────────────────────
function animate(dt, nowMs) {
  // Smooth integer-period color relaxation after closing a drawn knot
  let colorSmoothing = false;
  for (const st of S.strandColors) {
    if (st && st.progress < 1) {
      stepStrandColorState(st, dt);
      colorSmoothing = true;
    }
  }
  if (colorSmoothing) updateTubeColors();

  // Gentle idle sparkle while holding a desktop stroke stationary, plus pulsing start orb
  if (startDot.visible) {
    const pulse = 1 + 0.14 * Math.sin(nowMs * 0.008);
    startDot.scale.setScalar(pulse);
    startHalo.scale.setScalar(0.95 + 0.2 * Math.sin(nowMs * 0.005));
    invalidate();
  }
  if (deskStroke && deskStroke.pts3.length >= 6 && S.sparks && nowMs - lastDeskMoveTime > 45) {
    emitStrokeTipSparks(deskStroke.pts3, dt);
  }
  if (sparks.update(dt)) invalidate();

  if (moveAnimation) {
    moveAnimation.elapsed += dt;
    const t = Math.min(1, moveAnimation.elapsed / moveAnimation.duration);
    if (t >= 1) finishMoveAnimation();
    else {
      moveAnimation.display = sampleMoveAnimation(moveAnimation.motion, t);
      rebuildTubes();
      projDirty = true;
    }
  }
  if (rotAnim) {
    rotAnim.t = Math.min(1, rotAnim.t + dt / 0.8);
    knotRoot.quaternion.slerpQuaternions(rotAnim.from, rotAnim.to, ease(rotAnim.t));
    if (rotAnim.t >= 1) rotAnim = null;
  }
  if (spin && !grab) {
    const w = spin.omega.length(), speed = spin.velocity.length();
    if (w < 0.03 && speed < 0.003) spin = null;
    else {
      const decay = Math.exp(-5 * dt), travel = (1 - decay) / 5;
      knotRoot.position.addScaledVector(spin.velocity, travel);
      if (w > 1e-6) knotRoot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(spin.omega.clone().normalize(), w * travel));
      spin.velocity.multiplyScalar(decay);
      spin.omega.multiplyScalar(decay);
    }
  }
  if (S.spin && !grab && !rotAnim && !deskStroke && S.comps.length) knotRoot.quaternion.premultiply(_q1.setFromAxisAngle(UP, 0.45 * dt));
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
      if (k !== sweepState.k) {
        sweepState.k = k; S.level = 4 * Math.PI * (k + 0.5) / 32;
        if (!S.xrMode) { $('#level').value = S.level; $('#level-value').textContent = levelLabel(); }
      }
    }
  }
  // Viewing sphere & reticle
  if (globe.visible) {
    const eye = eyePos(_v1);
    // True world-space viewing direction from the knot to the eye
    const knotToEye = eye.clone().sub(knotRoot.position).normalize();
    if (S.xrMode) {
      globe.position.copy(panels.localToWorld(new THREE.Vector3(0.36, -0.24, 0.16)));
      globe.scale.setScalar(1);
      globe.quaternion.copy(knotRoot.quaternion);
      globeLegend.mesh.position.set(0.36, -0.335, 0.16);
      globeLegend.mesh.rotation.y = -0.58;
      // In stereo VR, place the reticle at the exact viewing direction of the knot on the 3D sphere
      reticle.position.copy(globe.position).addScaledVector(knotToEye, GLOBE_R * 1.028);
      reticle.lookAt(globe.position.clone().addScaledVector(knotToEye, 2));
      reticle.scale.setScalar(1);
    } else {
      const ndc = knotRoot.position.clone().project(camera);
      const dist = camera.position.distanceTo(knotRoot.position);
      globe.position.set(view.globeX, view.globeY, ndc.z).unproject(camera);
      const globeToEye = eye.clone().sub(globe.position).normalize();
      // Compensate for off-center perspective angle so the sphere isn't skewed and the active view chamber faces the camera ray
      const cosOff = Math.max(0.75, Math.abs(globeToEye.dot(camera.getWorldDirection(_v2).negate())));
      globe.scale.setScalar(((view.globeR * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (view.H / 2) / GLOBE_R) / cosOff);
      const parallaxQ = _q2.setFromUnitVectors(knotToEye, globeToEye);
      globe.quaternion.copy(parallaxQ).multiply(knotRoot.quaternion);
      reticle.position.copy(globe.position).addScaledVector(globeToEye, GLOBE_R * globe.scale.x * 1.028);
      reticle.lookAt(eye);
      reticle.scale.copy(globe.scale);
    }
  }
  // soft shadow under the knot
  shadow.visible = !!S.comps.length && S.xrMode !== 'immersive-ar';
  shadow.position.x = knotRoot.position.x; shadow.position.z = knotRoot.position.z;
  shadow.scale.setScalar(Math.max(0.1, knotR * knotRoot.scale.x * 3.2));
}

// The knot is framed in the part of the screen the panel leaves free (setViewOffset shifts the
// picture without changing the camera), and the globe sits in that region's lower-right corner.
const view = { globeX: 0.72, globeY: -0.68, globeR: 50, H: 600 };
function layoutView() {
  const W = innerWidth, H = innerHeight;
  const p = document.getElementById('control-panel').getBoundingClientRect();
  let left = 0, right = W, bottom = H;
  if (p.width > 60 && p.left > W * 0.4) right = p.left - 12;
  else if (p.width > 60 && p.top > H * 0.3) bottom = p.top - 8;
  const dx = W / 2 - (left + right) / 2, dy = H / 2 - bottom / 2;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) camera.clearViewOffset();
  else camera.setViewOffset(W, H, dx, dy, W, H);
  view.H = H;
  view.globeR = Math.max(32, Math.min(62, 0.075 * Math.min(right - left, bottom)));
  const mx = Math.max(view.globeR + 28, 98);
  const my = view.globeR + 44; // room for the glass caption pill beneath the sphere
  view.globeX = ((right - mx) / W) * 2 - 1;
  view.globeY = 1 - ((bottom - my) / H) * 2;
  positionGlobeCaption();
  invalidate();
}

const UP = new THREE.Vector3(0, 1, 0);
const drawn = { cam: new THREE.Matrix4(), knot: new THREE.Matrix4(), vis: '' };
function sceneMoved() {
  camera.updateMatrixWorld();
  knotRoot.updateMatrix();
  const vis = `${surfaceGroup.visible}${globe.visible}${strokeMesh.visible}${shadow.visible}${tubeGroup.visible}${sparks.mesh.visible}`;
  const moved = !drawn.cam.equals(camera.matrixWorld) || !drawn.knot.equals(knotRoot.matrix) || vis !== drawn.vis;
  if (moved) { drawn.cam.copy(camera.matrixWorld); drawn.knot.copy(knotRoot.matrix); drawn.vis = vis; }
  return moved;
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
  animate(dt, t);
  maybeRequestSurface();
  maybeRequestGlobe();
  maybeUpdateProjection(t);
  if (renderer.xr.isPresenting || sceneMoved() || needsRender) {
    needsRender = false;
    renderer.render(scene, camera);
    stats.rendered++;
  }
  stats.frames++;
}
const stats = { frames: 0, rendered: 0 };

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
function closureChime() {
  try {
    audio = audio || new AudioContext();
    const t0 = audio.currentTime;
    [587.33, 880, 1174.66].forEach((freq, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t0 + i * 0.045);
      g.gain.setValueAtTime(0.0001, t0 + i * 0.045);
      g.gain.linearRampToValueAtTime(0.032 / (i + 1), t0 + i * 0.045 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.045 + 0.34);
      o.connect(g).connect(audio.destination);
      o.start(t0 + i * 0.045);
      o.stop(t0 + i * 0.045 + 0.36);
    });
  } catch { /* no audio */ }
}

// ───────────────────────────── startup ─────────────────────────────
function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
  layoutView();
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

Promise.all(['400 30px Inter', '600 30px Inter'].map(f => document.fonts.load(f))).finally(() => { infoVRKey = ''; redrawAll(); });
applyTheme();
if (!loadFromHash()) { loadLibrary(1); S.pristine = true; }
addEventListener('hashchange', () => loadFromHash());
typesetOnce('#tab-surface');

// for automated checks
window.knotSculptor = {
  S, actions, act, LIBRARY, PALETTES, knotRoot, camera, globe, surfaceGroup, sparks, xrInput, menuPanel, infoPanel, projPanel, tipPanel,
  get tip() { return tipPanel.mesh.visible ? tipText : ''; },
  get grabState() { return grab ? { hands: grab.hands.length, engaged: grab.engaged } : null; },
  async frames(n = 1, ms = 16) { for (let i = 0; i < n; i++) { frame(performance.now()); await new Promise(r => setTimeout(r, ms)); } },
  get displayComps() { return displayComps; },
  get projectionSnapshot() { return projectionSnapshot; },
  selectMove(index) { selectMove(projectionSnapshot, index); },
  get stats() { return { ...stats }; },
  get debug() { return { globeData: !!globeData, globeInflight, globeShape, surfaceInflight, surfaceShape, surfaceLevel, surfaceKids: surfaceGroup.children.length, sweepFrames: sweepFrames.filter(Boolean).length, flatT, activeSparks: sparks.activeCount }; },
};
