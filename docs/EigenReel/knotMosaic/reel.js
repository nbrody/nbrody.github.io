/**
 * Knot mosaics: a Lomonaco–Kauffman mosaic lies on the table, and its strand lifts off the tiles into
 * space and relaxes by Möbius-energy descent (relax.js, in a worker), then settles back down.
 *
 * Frames. The mosaic and the relaxation live in "tile units": x right, y north, z out of the board.
 * The board is always W world units wide, so one tile is W/n. World: X = x·tile, Y = z·tile (up),
 * Z = −y·tile (north is away from the camera).
 *
 * Feed (40 s, three knots): the tube draws itself along the painted strand, lifts, relaxes into its
 * round shape while it turns, comes back down into the tiles, sinks into the paint, and the tiles flip
 * over to show the next mosaic. Interact: pick a mosaic, tap a crossing tile to switch or smooth it,
 * lift and set down, scrub the relaxation.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LIBRARY, byKey, FEED, identify, jones, crossings, TILE_SIDES, Poly } from './mosaic.js';

/* ───────── constants ───────── */
const TAU = Math.PI * 2;
const W = 6;                 // board width in world units, whatever the mosaic size
const TILE_T = 0.16;         // tile thickness
const TILE_FILL = 0.94;      // the rest of each cell is the gap between tiles
const PIC = 0.86;            // the painted face covers this much of a cell
const R_TUBE = 0.065;        // tube radius on the board, tile units (the paint is as wide as the tube)
const R_FLOAT = 0.15;        // …and once it has lifted: the flow keeps strands ≥ 0.53 apart (tests/relax.test.mjs)
const BUMP = 0.16;           // an over strand rises this far over a flat under strand, tile units
const LIFT_Z = 0.35;         // mosaic.curves' default lift at crossings
const RELAX_H = 0.2, RELAX_TUBE = 0.11;
// Where the knot floats (height of its centre, its radius) and how steeply the camera looks down:
// a tall phone frame gets a higher, bigger knot and a steeper view, so the scene fills it.
const LAY = { y: 3.7, r: 2.15, elev: 0.6 };
function layoutFor(aspect) {
  const t = smooth(0.95, 0.5, aspect);
  return { y: lerp(3.7, 5.7, t), r: lerp(2.15, 2.75, t), elev: lerp(0.6, 0.76, t) };
}
const TILT = 0.72;           // it tips this far towards the camera as it rises
const FEED_T = 40, CYCLE = FEED_T / FEED.length;
const SUB = 3, RAD = 14;     // tube: rings per relaxation vertex, vertices per ring
const FOV = 30;              // camera
const TEX = 256;

const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === 'true';

/* ───────── helpers ───────── */
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const ease5 = t => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeOutBack = t => { t = clamp01(t); const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const mod = (a, n) => ((a % n) + n) % n;
const gridKey = g => g.map(r => r.join(',')).join(';');
const $ = id => document.getElementById(id);

/* ───────── theme ───────── */
const THEMES = {
  dark: {
    bg: '#060a14', base: '#0b111f', tile: '#151d31', side: '#10172a', ink: '#3a4670',
    tubes: ['#818cf8', '#2dd4bf', '#fbbf24'], tip: '#fde68a', glow: 0.12,
    hemiSky: '#c7d2fe', hemiGround: '#0a0f1c', hemi: 1.5, key: 3.4, rim: 1.6, env: 0.7,
  },
  light: {
    bg: '#ffffff', base: '#d3d8e2', tile: '#f6f7fa', side: '#c9cfda', ink: '#717c99',
    tubes: ['#6d76f0', '#14b8a6', '#f59e0b'], tip: '#f59e0b', glow: 0.22,
    hemiSky: '#ffffff', hemiGround: '#b9c0cd', hemi: 1.9, key: 3.0, rim: 0.9, env: 0.85,
  },
};
const mq = matchMedia('(prefers-color-scheme: dark)');
let themePref = 'auto';
try { themePref = localStorage.getItem('eigenreel-knotmosaic-theme') || 'auto'; } catch (e) {}
if (qs.get('theme') === 'light' || qs.get('theme') === 'dark') themePref = qs.get('theme');
const themeName = () => (themePref === 'auto' ? (mq.matches ? 'dark' : 'light') : themePref);
let pal = THEMES[themeName()];

/* ───────── renderer, scene, camera ───────── */
const canvas = $('gl'), viewEl = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 8;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;

const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-1.6, 14, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4.6, right: 4.6, top: 4.6, bottom: -4.6, near: 2, far: 30 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffffff, 0.8);
rim.position.set(3, 5, -9);
scene.add(rim);

/* ───────── tile pictures ───────── */
const tileCanvases = [], tileMats = [];
for (let t = 0; t <= 10; t++) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  tileCanvases.push(c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tileMats.push(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
}
const sideMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
const baseMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });

const MIDC = { N: [0, -0.5], S: [0, 0.5], W: [-0.5, 0], E: [0.5, 0] };   // canvas y points down (south)
function strokePiece(ctx, a, b) {
  ctx.beginPath();
  const straight = (a === 'N' && b === 'S') || (a === 'S' && b === 'N') || (a === 'W' && b === 'E') || (a === 'E' && b === 'W');
  if (straight) { ctx.moveTo(...MIDC[a]); ctx.lineTo(...MIDC[b]); }
  else {
    const cx = (a === 'E' || b === 'E') ? 0.5 : -0.5, cy = (a === 'N' || b === 'N') ? -0.5 : 0.5;
    ctx.arc(cx, cy, 0.5, 0, TAU);   // only its quarter inside the cell is on the canvas
  }
  ctx.stroke();
}
function drawTiles() {
  for (let t = 0; t <= 10; t++) {
    const ctx = tileCanvases[t].getContext('2d'), k = TEX / PIC;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.tile;
    ctx.fillRect(0, 0, TEX, TEX);
    if (t) {
      ctx.setTransform(k, 0, 0, k, TEX / 2, TEX / 2);
      ctx.lineCap = 'butt';
      const pairs = TILE_SIDES[t];
      const order = (t === 7 || t === 8) ? [1, 0] : pairs.map((_, i) => i);   // under strand first
      order.forEach((i, j) => {
        if ((t === 7 || t === 8) && j === 1) {      // a gap in the under strand around the over strand
          ctx.strokeStyle = pal.tile; ctx.lineWidth = 2 * R_TUBE + 0.15;
          strokePiece(ctx, ...pairs[i]);
        }
        ctx.strokeStyle = pal.ink; ctx.lineWidth = 2 * R_TUBE;
        strokePiece(ctx, ...pairs[i]);
      });
    }
    tileMats[t].map.needsUpdate = true;
  }
}

/* ───────── the board ───────── */
class Board {
  constructor() {
    this.group = new THREE.Group();
    scene.add(this.group);
    const base = new THREE.Mesh(new RoundedBoxGeometry(W + 0.5, 0.34, W + 0.5, 4, 0.14), baseMat);
    base.position.y = -TILE_T - 0.17;
    base.receiveShadow = true;
    this.group.add(base);
    this.n = 0; this.tiles = []; this.leaving = []; this.grid = null;
  }
  geoms(n) {
    const tile = W / n, s = tile * TILE_FILL, bevel = Math.min(0.05, tile * 0.04);
    const slab = new RoundedBoxGeometry(s, TILE_T, s, 2, bevel);
    const front = new THREE.PlaneGeometry(PIC * tile, PIC * tile).rotateX(-Math.PI / 2);
    const back = new THREE.PlaneGeometry(PIC * tile, PIC * tile).rotateX(Math.PI / 2);
    return { tile, slab, front, back };
  }
  build(n) {
    // tiles of the old board leave (shrinking in a wave) while the new ones arrive
    for (const T of this.tiles) { T.leave = { t: 0, delay: 0.35 * (T.r + T.c) / Math.max(1, 2 * this.n - 2) }; this.leaving.push(T); }
    this.n = n;
    const G = this.geoms(n);
    this.G = G;
    this.tiles = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const g = new THREE.Group();
      g.position.set((c + 0.5 - n / 2) * G.tile, -TILE_T / 2, (r + 0.5 - n / 2) * G.tile);
      const slab = new THREE.Mesh(G.slab, sideMat);
      const front = new THREE.Mesh(G.front, tileMats[0]);
      const back = new THREE.Mesh(G.back, tileMats[0]);
      front.position.y = TILE_T / 2 + 0.002;
      back.position.y = -TILE_T / 2 - 0.002;
      slab.castShadow = true; slab.receiveShadow = true; front.receiveShadow = true; back.receiveShadow = true;
      g.add(slab, front, back);
      const T = { g, slab, front, back, r, c, type: 0, anim: null, x: g.position.x, z: g.position.z };
      slab.userData.tile = T; front.userData.tile = T;
      this.group.add(g);
      this.tiles.push(T);
    }
    return G;
  }
  at(r, c) { return this.tiles[r * this.n + c]; }
  rest(T) { T.g.rotation.set(0, 0, 0); T.g.position.y = -TILE_T / 2; T.g.scale.setScalar(1); }
  // show a grid at once
  set(grid) {
    if (grid.length !== this.n) { this.build(grid.length); for (const T of this.leaving) this.drop(T); this.leaving = []; }
    this.grid = grid.map(r => r.slice());
    for (const T of this.tiles) { T.type = grid[T.r][T.c]; T.front.material = tileMats[T.type]; T.anim = null; this.rest(T); }
  }
  drop(T) { this.group.remove(T.g); }
  // the feed: tiles flip from A to B in a wave, p ∈ [0, 1]
  flipState(A, B, p) {
    if (A.length !== this.n) this.set(A);
    if (p <= 0 || p >= 1) {
      const G = p >= 1 ? B : A;
      if (this.grid !== G) { this.grid = G; for (const T of this.tiles) { T.type = G[T.r][T.c]; T.front.material = tileMats[T.type]; this.rest(T); } }
      return;
    }
    this.grid = null;
    const n = this.n;
    for (const T of this.tiles) {
      const d = 0.42 * (T.r + T.c) / Math.max(1, 2 * n - 2);
      const q = clamp01((p - d) / 0.58);
      T.front.material = tileMats[A[T.r][T.c]];
      T.back.material = tileMats[B[T.r][T.c]];
      this.flipPose(T, q);
    }
  }
  flipPose(T, q) {
    T.g.rotation.set(Math.PI * ease(q), 0, 0);
    T.g.position.y = -TILE_T / 2 + (0.5 * this.G.tile * TILE_FILL + 0.08) * Math.sin(Math.PI * q);
  }
  // interact: animations that resolve when done
  animate(T, kind, type, dur) {
    return new Promise(res => {
      if (kind === 'flip') T.back.material = tileMats[type];
      T.anim = { kind, type, t: 0, dur, res };
    });
  }
  transition(grid) {
    this.grid = grid.map(r => r.slice());
    if (grid.length === this.n) {
      const n = this.n;
      return Promise.all(this.tiles.map(T => new Promise(res => {
        T.back.material = tileMats[grid[T.r][T.c]];
        T.anim = { kind: 'flip', type: grid[T.r][T.c], t: -0.5 * (T.r + T.c) / Math.max(1, 2 * n - 2), dur: 0.7, res };
      })));
    }
    this.build(grid.length);
    const n = this.n;
    return Promise.all(this.tiles.map(T => new Promise(res => {
      T.type = grid[T.r][T.c];
      T.front.material = tileMats[T.type];
      T.g.scale.setScalar(0.001);
      T.anim = { kind: 'arrive', type: T.type, t: -0.3 - 0.45 * (T.r + T.c) / Math.max(1, 2 * n - 2), dur: 0.7, res };
    })));
  }
  update(dt) {
    for (const T of this.tiles) {
      const A = T.anim;
      if (!A) continue;
      A.t += dt;
      const q = clamp01(A.t / A.dur);
      if (A.t < 0) continue;
      if (A.kind === 'flip') this.flipPose(T, q);
      else if (A.kind === 'turn') {
        T.g.rotation.set(0, -Math.PI / 2 * ease(q), 0);
        T.g.position.y = -TILE_T / 2 + 0.22 * this.G.tile * Math.sin(Math.PI * q);
      } else if (A.kind === 'arrive') {
        T.g.scale.setScalar(Math.max(0.001, easeOutBack(q)));
        T.g.rotation.set(Math.PI * (1 - ease(q)) * 0.5, 0, 0);
        T.g.position.y = -TILE_T / 2 + 0.6 * (1 - ease(q));
      }
      if (q >= 1) {
        T.type = A.type; T.front.material = tileMats[A.type];
        this.rest(T);
        T.anim = null;
        A.res();
      }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const T = this.leaving[i], L = T.leave;
      L.t += dt;
      const q = clamp01((L.t - L.delay) / 0.45);
      T.g.scale.setScalar(Math.max(0.001, 1 - ease(q)));
      T.g.position.y = -TILE_T / 2 - 0.2 * ease(q);
      if (q >= 1) { this.drop(T); this.leaving.splice(i, 1); }
    }
  }
}
const board = new Board();

/* ───────── tubes ───────── */
const tipGeo = new THREE.SphereGeometry(1, 20, 14);
class Tube {
  constructor(N, color) {
    this.N = N; this.M = N * SUB;
    const M = this.M, nv = M * RAD;
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    const idx = new Uint32Array(M * RAD * 6);
    let o = 0;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      for (let k = 0; k < RAD; k++) {
        const k1 = (k + 1) % RAD, a = j * RAD + k, b = j * RAD + k1, c = j1 * RAD + k, d = j1 * RAD + k1;
        idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 12);
    this.geo = g;
    this.mat = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: pal.glow, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.cap = new THREE.Mesh(tipGeo, this.mat);
    this.cap.castShadow = true;
    this.tip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: pal.tip }));
    this.Q = new Float32Array(M * 3); this.T = new Float32Array(M * 3); this.U = new Float32Array(M * 3); this.V = new Float32Array(M * 3);
    this.cs = new Float32Array(RAD * 2);
    for (let k = 0; k < RAD; k++) { this.cs[2 * k] = Math.cos(TAU * k / RAD); this.cs[2 * k + 1] = Math.sin(TAU * k / RAD); }
    scene.add(this.mesh, this.cap, this.tip);
  }
  set visible(v) { this.mesh.visible = v; if (!v) { this.cap.visible = false; this.tip.visible = false; } }
  dispose() { scene.remove(this.mesh, this.cap, this.tip); this.geo.dispose(); this.mat.dispose(); this.tip.material.dispose(); }
  // P: world positions of the N relaxation vertices, closed
  update(P, off, radius, trace) {
    const { N, M, Q, T, U, V } = this;
    if (trace <= 0 || radius <= 1e-4) { this.visible = false; return; }
    this.mesh.visible = true;
    // uniform Catmull–Rom through the vertices, SUB rings per vertex
    for (let i = 0; i < N; i++) {
      const a = off + 3 * ((i - 1 + N) % N), b = off + 3 * i, c = off + 3 * ((i + 1) % N), d = off + 3 * ((i + 2) % N);
      for (let s = 0; s < SUB; s++) {
        const t = s / SUB, t2 = t * t, t3 = t2 * t, j = 3 * (i * SUB + s);
        for (let q = 0; q < 3; q++) {
          const p0 = P[a + q], p1 = P[b + q], p2 = P[c + q], p3 = P[d + q];
          Q[j + q] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
        }
      }
    }
    for (let j = 0; j < M; j++) {
      const a = 3 * ((j - 1 + M) % M), b = 3 * ((j + 1) % M);
      let x = Q[b] - Q[a], y = Q[b + 1] - Q[a + 1], z = Q[b + 2] - Q[a + 2];
      const l = Math.hypot(x, y, z) || 1;
      T[3 * j] = x / l; T[3 * j + 1] = y / l; T[3 * j + 2] = z / l;
    }
    // parallel transport around the loop, then spread the closing twist evenly
    {
      let ux = -T[2], uy = 0, uz = T[0];
      if (Math.hypot(ux, uz) < 0.1) { ux = 0; uy = T[2]; uz = -T[1]; }
      const l = Math.hypot(ux, uy, uz); U[0] = ux / l; U[1] = uy / l; U[2] = uz / l;
    }
    for (let j = 1; j < M; j++) {
      const o = 3 * j, p = o - 3;
      const d = U[p] * T[o] + U[p + 1] * T[o + 1] + U[p + 2] * T[o + 2];
      let x = U[p] - d * T[o], y = U[p + 1] - d * T[o + 1], z = U[p + 2] - d * T[o + 2];
      const l = Math.hypot(x, y, z) || 1;
      U[o] = x / l; U[o + 1] = y / l; U[o + 2] = z / l;
    }
    {
      const p = 3 * (M - 1), d = U[p] * T[0] + U[p + 1] * T[1] + U[p + 2] * T[2];
      let x = U[p] - d * T[0], y = U[p + 1] - d * T[1], z = U[p + 2] - d * T[2];
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      // angle from the transported frame back to U_0, about T_0
      const cx = y * U[2] - z * U[1], cy = z * U[0] - x * U[2], cz = x * U[1] - y * U[0];
      const ang = Math.atan2(cx * T[0] + cy * T[1] + cz * T[2], x * U[0] + y * U[1] + z * U[2]);
      for (let j = 0; j < M; j++) {
        const o = 3 * j, th = ang * j / M, c = Math.cos(th), s = Math.sin(th);
        const tx = T[o], ty = T[o + 1], tz = T[o + 2], ux = U[o], uy = U[o + 1], uz = U[o + 2];
        const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
        U[o] = c * ux + s * vx; U[o + 1] = c * uy + s * vy; U[o + 2] = c * uz + s * vz;
        V[o] = ty * U[o + 2] - tz * U[o + 1]; V[o + 1] = tz * U[o] - tx * U[o + 2]; V[o + 2] = tx * U[o + 1] - ty * U[o];
      }
    }
    const pos = this.pos, nor = this.nor, cs = this.cs;
    for (let j = 0; j < M; j++) {
      const o = 3 * j;
      for (let k = 0; k < RAD; k++) {
        const c = cs[2 * k], s = cs[2 * k + 1], v = 3 * (j * RAD + k);
        const nx = c * U[o] + s * V[o], ny = c * U[o + 1] + s * V[o + 1], nz = c * U[o + 2] + s * V[o + 2];
        nor[v] = nx; nor[v + 1] = ny; nor[v + 2] = nz;
        pos[v] = Q[o] + radius * nx; pos[v + 1] = Q[o + 1] + radius * ny; pos[v + 2] = Q[o + 2] + radius * nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    const head = Math.min(M, Math.floor(trace * M + 1e-6));
    this.geo.setDrawRange(0, head * RAD * 6);
    const open = head < M;
    this.cap.visible = open; this.tip.visible = open;
    if (open) {
      this.cap.position.set(Q[0], Q[1], Q[2]); this.cap.scale.setScalar(radius);
      const h = 3 * (head % M);
      this.tip.position.set(Q[h], Q[h + 1], Q[h + 2]); this.tip.scale.setScalar(radius * 1.15);
    }
  }
}

/* ───────── relaxing, off the main thread ───────── */
let worker = null, nextId = 1;
const waiting = new Map(), cache = new Map();
try {
  worker = new Worker(new URL('./relax-worker.js?v=1', import.meta.url), { type: 'module' });
  worker.onmessage = e => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data); } };
  worker.onerror = () => { worker = null; for (const [, w] of waiting) w(null); waiting.clear(); };
} catch (e) { worker = null; }

async function relaxHere(grid) {
  const [{ curves }, { buildLink, record }] = await Promise.all([import('./mosaic.js'), import('./relax.js?v=1')]);
  const { comps, error } = curves(grid);
  if (error) return { error };
  const link = buildLink(comps, { h: RELAX_H, tubeR: RELAX_TUBE });
  const frames = record(link);
  const n = link.n, buf = new Float32Array(frames.length * 3 * n);
  frames.forEach((f, k) => buf.set(f, k * 3 * n));
  return { K: frames.length, n, offsets: link.offsets, sizes: link.chains.map(c => c.N), buf };
}

function relax(grid) {
  const k = gridKey(grid);
  if (cache.has(k)) return cache.get(k);
  const p = new Promise(res => {
    if (!worker) { setTimeout(() => relaxHere(grid).then(res), 0); return; }
    const id = nextId++;
    waiting.set(id, d => (d ? res(d) : relaxHere(grid).then(res)));
    worker.postMessage({ id, grid, h: RELAX_H, tubeR: RELAX_TUBE });
  }).then(res => (res.error ? res : prepare(grid, res)));
  cache.set(k, p);
  return p;
}

// Everything a knot needs for display, from its relaxation frames.
function prepare(grid, res) {
  const { K, n, buf, offsets, sizes } = res;
  const f0 = buf.subarray(0, 3 * n), fK = buf.subarray((K - 1) * 3 * n, K * 3 * n);
  const flat = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    flat[3 * i] = f0[3 * i]; flat[3 * i + 1] = f0[3 * i + 1];
    const z = f0[3 * i + 2];
    flat[3 * i + 2] = z > 0 ? (z / LIFT_Z) * BUMP : 0;
  }
  const cen = f => { const c = [0, 0, 0]; for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) c[q] += f[3 * i + q] / n; return c; };
  const c0 = cen(f0), cK = cen(fK);
  // the plane the relaxed knot lies closest to: least eigenvector of its second moments
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const d = [fK[3 * i] - cK[0], fK[3 * i + 1] - cK[1], fK[3 * i + 2] - cK[2]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b];
  }
  const tr = C[0][0] + C[1][1] + C[2][2];
  let v = [0.1, 0.2, 1];
  for (let it = 0; it < 80; it++) {       // power iteration on (tr·I − C)
    const w = [0, 1, 2].map(a => tr * v[a] - (C[a][0] * v[0] + C[a][1] * v[1] + C[a][2] * v[2]));
    const l = Math.hypot(...w); v = w.map(x => x / l);
  }
  if (v[2] < 0) v = v.map(x => -x);
  const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...v), new THREE.Vector3(0, 0, 1));
  const radius = (f, rot) => {
    const c = cen(f), p = new THREE.Vector3();
    let r = 0;
    for (let i = 0; i < n; i++) {
      p.set(f[3 * i] - c[0], f[3 * i + 1] - c[1], f[3 * i + 2] - c[2]);
      if (rot) p.applyQuaternion(rot);
      r = Math.max(r, Math.hypot(p.x, p.y));
    }
    return r;
  };
  return { grid, K, n, buf, offsets, sizes, flat, c0, qAlign, r0: radius(f0), rK: radius(fK, qAlign), tubes: null };
}

/* ───────── posing a knot ───────── */
const P = { m: new THREE.Matrix4(), ra: new THREE.Matrix4(), q: new THREE.Quaternion(), qI: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3() };
let worldBuf = new Float32Array(0);

// S: { lift, u, phi, wobX, wobY, trace, sink }
function poseKnot(kd, S) {
  const n = kd.n, tile = W / kd.grid.length;
  if (worldBuf.length < 3 * n) worldBuf = new Float32Array(3 * n);
  const out = worldBuf;
  const L = ease(S.lift), ls = smooth(0.12, 0.7, L), u = clamp01(S.u), us = ease(u);
  const kf = u * (kd.K - 1), k0 = Math.floor(kf), k1 = Math.min(kd.K - 1, k0 + 1), fr = kf - k0;
  const F0 = kd.buf.subarray(k0 * 3 * n), F1 = kd.buf.subarray(k1 * 3 * n);
  P.q.copy(P.qI).slerp(kd.qAlign, us);
  P.ra.makeRotationFromQuaternion(P.q);
  const a = P.ra.elements;
  P.e.set(TILT * L + S.wobX, S.wobY, S.phi, 'XYZ');
  P.m.makeRotationFromEuler(P.e);
  const m = P.m.elements;
  const sc = lerp(1, LAY.r / tile / lerp(kd.r0, kd.rK, us), ls);
  const [cx, cy, cz] = kd.c0, fl = kd.flat;
  for (let i = 0; i < n; i++) {
    const o = 3 * i;
    let x = lerp(F0[o], F1[o], fr) - cx, y = lerp(F0[o + 1], F1[o + 1], fr) - cy, z = lerp(F0[o + 2], F1[o + 2], fr) - cz;
    // turn towards the plane the relaxed knot lies in (column-major matrix)
    const rx = a[0] * x + a[4] * y + a[8] * z, ry = a[1] * x + a[5] * y + a[9] * z, rz = a[2] * x + a[6] * y + a[10] * z;
    // from the flat drawing on the tiles to the shape in space
    x = (lerp(fl[o] - cx, rx, ls)) * sc; y = (lerp(fl[o + 1] - cy, ry, ls)) * sc; z = (lerp(fl[o + 2] - cz, rz, ls)) * sc;
    const qx = m[0] * x + m[4] * y + m[8] * z, qy = m[1] * x + m[5] * y + m[9] * z, qz = m[2] * x + m[6] * y + m[10] * z;
    out[o] = (qx + cx * (1 - L)) * tile;
    out[o + 1] = (qz + cz * (1 - L)) * tile + L * LAY.y + (1 - L) * R_TUBE * tile;
    out[o + 2] = -(qy + cy * (1 - L)) * tile;
  }
  if (!kd.tubes) kd.tubes = kd.sizes.map((N, c) => new Tube(N, pal.tubes[c % pal.tubes.length]));
  const radius = lerp(R_TUBE, R_FLOAT, ls) * tile * sc * S.sink;
  kd.tubes.forEach((T, c) => T.update(out, 3 * kd.offsets[c], radius, S.trace));
}
let shown = null;
function showKnot(kd, S) {
  if (shown && shown !== kd && shown.tubes) shown.tubes.forEach(T => { T.visible = false; });
  shown = kd;
  if (kd && !kd.error) poseKnot(kd, S);
}

/* ───────── theme ───────── */
function applyTheme() {
  pal = THEMES[themeName()];
  const root = document.documentElement;
  if (themePref === 'auto') delete root.dataset.theme; else root.dataset.theme = themePref;
  scene.background = new THREE.Color(pal.bg);
  hemi.color.set(pal.hemiSky); hemi.groundColor.set(pal.hemiGround); hemi.intensity = pal.hemi;
  key.intensity = pal.key; rim.intensity = pal.rim;
  scene.environmentIntensity = pal.env;
  sideMat.color.set(pal.side); baseMat.color.set(pal.base);
  drawTiles();
  for (const [, p] of cache) p.then(kd => kd.tubes && kd.tubes.forEach((T, c) => {
    const col = pal.tubes[c % pal.tubes.length];
    T.mat.color.set(col); T.mat.emissive.set(col); T.mat.emissiveIntensity = pal.glow; T.tip.material.color.set(pal.tip);
  }));
  document.querySelectorAll('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === themePref));
}
mq.addEventListener('change', () => { if (themePref === 'auto') applyTheme(); });

/* ───────── camera framing ───────── */
const fitCam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
function fit(aspect) {
  Object.assign(LAY, layoutFor(aspect));
  const FIT = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { FIT.push(new THREE.Vector3(sx * (W / 2 + 0.25), 0, sz * (W / 2 + 0.25))); FIT.push(new THREE.Vector3(sx * (W / 2 + 0.25), -TILE_T - 0.34, sz * (W / 2 + 0.25))); }
  for (let i = 0; i < 26; i++) {      // the floating knot's sphere
    const th = Math.acos(1 - 2 * (i + 0.5) / 26), ph = i * 2.39996;
    FIT.push(new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)).multiplyScalar(LAY.r * 1.08).add(new THREE.Vector3(0, LAY.y, 0)));
  }
  const dir = new THREE.Vector3(0, Math.sin(LAY.elev), Math.cos(LAY.elev));
  const target = new THREE.Vector3(0, LAY.y * 0.42, 0), p = new THREE.Vector3();
  fitCam.aspect = aspect; fitCam.updateProjectionMatrix();
  const MX = 0.9, MY = aspect < 1 ? 0.86 : 0.9;
  const place = d => { fitCam.position.copy(target).addScaledVector(dir, d); fitCam.lookAt(target); fitCam.updateMatrixWorld(); };
  let d = 20;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 3, hi = 120;
    for (let it = 0; it < 36; it++) {
      const mid = 0.5 * (lo + hi);
      place(mid);
      const ok = FIT.every(q => { p.copy(q).project(fitCam); return Math.abs(p.x) <= MX && Math.abs(p.y) <= MY; });
      if (ok) hi = mid; else lo = mid;
    }
    d = hi; place(d);
    let y0 = 1, y1 = -1;
    for (const q of FIT) { p.copy(q).project(fitCam); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    target.y += 0.5 * (y0 + y1) * d * Math.tan(FOV * Math.PI / 360) * 0.9;
  }
  return { pos: fitCam.position.clone(), target: target.clone() };
}

/* ───────── feed ───────── */
const feedGrids = FEED.map(f => f.grid());
const feedData = feedGrids.map(() => null);
feedGrids.forEach((g, i) => relax(g).then(kd => { feedData[i] = kd; }));

const S = { lift: 0, u: 0, phi: 0, wobX: 0, wobY: 0, trace: 0, sink: 1 };

function feedState(t, out) {
  const cyc = Math.floor(t / CYCLE), tau = t - cyc * CYCLE, k = mod(cyc, FEED.length);
  out.k = k;
  out.trace = smooth(0.25, 2.0, tau);
  out.lift = tau < 9.7 ? ease((tau - 2.0) / 1.5) : 1 - ease((tau - 9.7) / 1.4);
  out.u = tau < 8.6 ? ease5((tau - 2.9) / 4.6) : 1 - ease((tau - 8.6) / 2.0);
  out.phi = TAU * ease5((tau - 2.2) / 8.6);
  const L = ease(out.lift);
  out.wobX = L * 0.16 * Math.sin(TAU * (tau - 2.0) / 7.4);
  out.wobY = L * 0.22 * Math.sin(TAU * (tau - 2.0) / 5.2);
  out.sink = 1 - smooth(11.1, 11.65, tau);
  out.flip = clamp01((tau - 11.75) / 1.5);
  return out;
}
const FS = {};
let feedT = 0;
function feedStep(dt) {
  if (feedData[0]) feedT = mod(feedT + dt, FEED_T);     // hold at 0 until the first knot is ready
  feedState(feedT, FS);
  const k = FS.k, k2 = (k + 1) % FEED.length;
  board.flipState(feedGrids[k], feedGrids[k2], FS.flip);
  const kd = feedData[k];
  if (!kd) { showKnot(null, FS); return; }
  Object.assign(S, FS);
  showKnot(kd, S);
}

/* ───────── interact ───────── */
const I = { kd: null, grid: null, job: 0, tap: 'turn', spin: true, lifted: false, busy: false, touched: false, wobT: 0 };
const tweens = new Map();
function tw(k, to, dur, delay = 0, fn = ease) {
  return new Promise(res => {
    const old = tweens.get(k);
    if (old) old.res();
    if (dur <= 0 && delay <= 0) { S[k] = to; res(); return; }
    tweens.set(k, { from: S[k], to, dur: Math.max(1e-3, dur), t: -delay, fn, res, started: false });
  });
}
function stepTweens(dt) {
  for (const [k, T] of tweens) {
    T.t += dt;
    if (T.t < 0) continue;
    if (!T.started) { T.started = true; T.from = S[k]; }
    const q = clamp01(T.t / T.dur);
    S[k] = lerp(T.from, T.to, T.fn(q));
    if (q >= 1) { tweens.delete(k); T.res(); }
  }
}
const wait = s => new Promise(r => setTimeout(r, s * 1000));

async function liftUp(job) {
  I.lifted = true; syncLift();
  if (S.trace < 1) await tw('trace', 1, 0.9 * (1 - S.trace) + 0.05, 0, x => x);
  if (job !== I.job) return;
  tw('lift', 1, 1.4 * (1 - S.lift) + 0.1);
  await tw('u', 1, 3.4 * (1 - S.u) + 0.1, 0.45, ease5);
}
async function setDown(job, fast = 1) {
  I.lifted = false; syncLift();
  const near = Math.round(S.phi / TAU) * TAU;
  tw('phi', near, 1.4 * fast);
  tw('u', 0, 1.5 * fast * S.u + 0.05);
  await tw('lift', 0, 1.2 * fast * S.lift + 0.05, 0.9 * fast * S.u);
  if (job === I.job) S.phi = 0;
}

async function useGrid(grid, how) {
  const job = ++I.job;
  I.busy = true; I.busyJob = job;
  const wasLifted = I.lifted || how === 'library';
  setReadout(grid, true);
  const pending = relax(grid);
  if (S.lift > 0.001 || S.u > 0.001) await setDown(job, how === 'library' ? 1 : 0.6);
  if (job !== I.job) return;
  await tw('sink', 0, 0.3);
  if (job !== I.job) return;
  if (how === 'library') await board.transition(grid);
  else if (how) await how();         // a tile animation
  if (job !== I.job) return;
  I.grid = grid.map(r => r.slice());
  const kd = await pending;
  if (job !== I.job) return;
  I.kd = kd;
  setReadout(grid, false);
  if (kd.error) { I.busy = false; return; }
  S.trace = how === 'library' ? 0 : 1; S.sink = 0;
  showKnot(kd, S);
  await tw('sink', 1, 0.35);
  I.busy = false;
  if (job !== I.job) return;
  if (wasLifted) liftUp(job);
}

function selectEntry(keyName) {
  const e = byKey[keyName];
  if (!e) return;
  document.querySelectorAll('#library button').forEach(b => b.classList.toggle('on', b.dataset.k === keyName));
  useGrid(e.grid(), 'library');
}

function tapTile(T) {
  if (I.busy && I.busyJob === I.job) return;     // a change is still under way
  const g = I.grid, t = g?.[T.r]?.[T.c];
  if (!g || t == null) return;
  let nt = null, kind = 'turn';
  if (I.tap === 'turn') {
    if (t === 7 || t === 8) nt = 15 - t;
    else if (t === 9 || t === 10) nt = 19 - t;
  } else {
    if (t === 7) nt = 10; else if (t === 8) nt = 9;      // the A-smoothing
    else if (t === 9 || t === 10) nt = 7;
    kind = 'flip';
  }
  if (nt == null) { wiggle(T); return; }
  const grid = g.map(r => r.slice());
  grid[T.r][T.c] = nt;
  document.querySelectorAll('#library button').forEach(b => b.classList.remove('on'));
  useGrid(grid, () => board.animate(T, kind, nt, kind === 'turn' ? 0.55 : 0.7));
}
function wiggle(T) {
  if (T.anim) return;
  const t0 = performance.now();
  const f = () => {
    const q = (performance.now() - t0) / 380;
    T.g.rotation.y = q < 1 ? 0.12 * Math.sin(q * TAU * 2) * (1 - q) : 0;
    if (q < 1) requestAnimationFrame(f);
  };
  f();
}

function interactStep(dt) {
  stepTweens(dt);
  if (I.lifted && I.spin && S.lift > 0.5 && !tweens.has('phi')) S.phi += dt * 0.32;
  I.wobT += dt * (S.lift > 0.01 ? 1 : 0);
  const L = ease(S.lift);
  S.wobX = L * 0.14 * Math.sin(TAU * I.wobT / 7.4);
  S.wobY = L * 0.2 * Math.sin(TAU * I.wobT / 5.2);
  if (I.kd && !I.kd.error) showKnot(I.kd, S);
  if (document.activeElement !== relaxIn) relaxIn.value = S.u.toFixed(3);
  controls.update();
}

/* ───────── readout ───────── */
function jonesHTML(v) {
  if (!v) return '';
  let s = '';
  for (const [e, c] of Poly.sorted(v)) {
    const a = Math.abs(c), neg = c < 0;
    const ex = Number.isInteger(e) ? String(e).replace('-', '−') : `${e < 0 ? '−' : ''}${Math.abs(e * 2)}/2`;
    const term = e === 0 ? String(a) : `${a === 1 ? '' : a}<i>t</i>${ex === '1' ? '' : `<sup>${ex}</sup>`}`;
    s += s ? (neg ? ' − ' : ' + ') + term : (neg ? '−' : '') + term;
  }
  return `<i>V</i>(<i>t</i>) = ${s}`;
}
function setReadout(grid, busy) {
  const id = identify(grid), v = jones(grid), c = crossings(grid).length;
  let name = id.name || (id.comps === 1 ? 'A knot not in the library' : `A ${id.comps}-component link not in the library`);
  let extra = '';
  if (id.name && id.chiral) {
    const right = (id.refWrithe > 0) !== !!id.mirror;
    extra = (id.key === 'trefoil' || id.key === 'cinquefoil') ? (right ? 'right-handed' : 'left-handed') : (id.mirror ? 'mirror image' : '');
  }
  $('r-name').innerHTML = name + (extra ? ` <span class="mirror">${extra}</span>` : '');
  const bits = [`${c} crossing${c === 1 ? '' : 's'}`];
  if (id.comps > 1) {
    bits.push(`${id.comps} components`);
    if (id.comps === 2) bits.push(`linking number ${Math.abs(id.lk[0][1])}`);
    else bits.push(id.lk.every(r => r.every(x => x === 0)) ? 'every pair unlinked' : 'some pairs linked');
  } else bits.push(`writhe ${String(id.writhe).replace('-', '−')}`);
  $('r-stats').textContent = bits.join(' · ');
  $('r-jones').innerHTML = jonesHTML(v) + (busy ? ' <span class="busy">· relaxing…</span>' : '');
}

const relaxIn = $('relax');
function syncLift() { $('lift').textContent = I.lifted ? 'Set down' : 'Lift'; }

/* ───────── modes ───────── */
let mode = 'feed', returning = false;
const root = document.documentElement, panel = $('panel'), hint = $('hint');

function setMode(m) {
  if (m === mode) return;
  mode = m;
  root.classList.toggle('interact', m === 'interact');
  panel.inert = m !== 'interact';
  controls.enabled = m === 'interact';
  hint.classList.remove('show');
  if (m === 'interact') {
    returning = false;
    const k = FS.k ?? 0;
    // finish a flip that was under way, and take the knot the board now shows
    const onNext = FS.flip > 0 || FS.sink < 0.5;
    const k2 = onNext ? (k + 1) % FEED.length : k;
    I.grid = feedGrids[k2].map(r => r.slice());
    board.set(feedGrids[k2]);
    I.kd = feedData[k2];
    if (onNext) Object.assign(S, { trace: 0, sink: 1, lift: 0, u: 0, phi: 0 });
    document.querySelectorAll('#library button').forEach(b => b.classList.toggle('on', b.dataset.k === FEED[k2].key));
    setReadout(I.grid, false);
    const job = ++I.job;
    I.touched = false;
    if (I.kd) liftUp(job);
    else relax(I.grid).then(kd => { if (job === I.job) { I.kd = kd; liftUp(job); } });
    setTimeout(() => { if (mode === 'interact' && !I.touched) tweenCamera(); }, 650);
  } else {
    // set the knot down, sink it, flip to the start of the feed, then let the feed run from 0
    const job = ++I.job;
    returning = true;
    (async () => {
      await setDown(job, 0.7);
      if (job !== I.job) return;
      await tw('sink', 0, 0.3);
      if (job !== I.job) return;
      if (gridKey(board.grid || []) !== gridKey(feedGrids[0])) await board.transition(feedGrids[0]);
      if (job !== I.job) return;
      feedT = 0; returning = false;
      camFrom = { pos: camera.position.clone(), target: controls.target.clone(), t: 0 };
    })();
  }
}

/* ───────── camera ───────── */
let aspect = 1, home = fit(1), camFrom = null, camTween = null;
function tweenCamera() { camTween = { pos: camera.position.clone(), target: controls.target.clone(), t: 0 }; }
function stepCamera(dt) {
  if (mode === 'interact' && camTween) {
    camTween.t += dt / 0.9;
    const e = ease5(camTween.t);
    camera.position.lerpVectors(camTween.pos, home.pos, e);
    controls.target.lerpVectors(camTween.target, home.target, e);
    if (camTween.t >= 1) camTween = null;
  } else if (mode === 'feed') {
    if (camFrom) {
      camFrom.t += dt / 1.2;
      const e = ease5(camFrom.t);
      camera.position.lerpVectors(camFrom.pos, home.pos, e);
      controls.target.lerpVectors(camFrom.target, home.target, e);
      if (camFrom.t >= 1) camFrom = null;
    } else if (!returning) { camera.position.copy(home.pos); controls.target.copy(home.target); }
    camera.lookAt(controls.target);
  }
}

/* ───────── wiring ───────── */
const lib = $('library');
LIBRARY.forEach((e, i) => {
  const b = document.createElement('button');
  b.textContent = e.short; b.dataset.k = e.key; b.title = `${e.name} (${(i + 1) % 10})`;
  b.addEventListener('click', () => selectEntry(e.key));
  lib.appendChild(b);
});
$('lift').addEventListener('click', toggleLift);
function toggleLift() {
  const job = ++I.job;
  if (I.lifted) setDown(job); else if (I.kd && !I.kd.error) liftUp(job);
}
relaxIn.addEventListener('input', () => {
  if (!I.kd || I.kd.error) return;
  tweens.delete('u');
  S.u = +relaxIn.value;
  if (!I.lifted) { I.lifted = true; syncLift(); S.trace = 1; tw('lift', 1, 1.0 * (1 - S.lift) + 0.1); }
});
document.querySelectorAll('#tap-seg button').forEach(b => b.addEventListener('click', () => {
  I.tap = b.dataset.m;
  document.querySelectorAll('#tap-seg button').forEach(x => x.classList.toggle('on', x === b));
  $('tap-note').textContent = I.tap === 'turn'
    ? 'The tile turns a quarter turn, which swaps over and under.'
    : 'The tile flips to the smoothing that joins the regions the over strand sweeps turning anticlockwise.';
}));
$('sw-spin').addEventListener('change', e => { I.spin = e.target.checked; });
document.querySelectorAll('#theme-seg button').forEach(b => b.addEventListener('click', () => {
  themePref = b.dataset.t;
  try { localStorage.setItem('eigenreel-knotmosaic-theme', themePref); } catch (e) {}
  applyTheme();
}));
$('close').addEventListener('click', () => setMode('feed'));
controls.addEventListener('start', () => { I.touched = true; camTween = null; });

// a tap (not a swipe) on the feed engages the piece; in interact mode a tap on a tile changes it
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  const tap = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 8;
  down = null;
  if (!tap) return;
  if (mode === 'feed') { if (!EMBED) setMode('interact'); return; }
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(board.tiles.flatMap(T => [T.slab, T.front]), false)[0];
  if (hit && hit.object.userData.tile) tapTile(hit.object.userData.tile);
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
  if (e.key === 'Escape') { e.preventDefault(); setMode('feed'); }
  else if (e.key === ' ') { e.preventDefault(); toggleLift(); }
  else if (/^[0-9]$/.test(e.key)) { const i = (+e.key + 9) % 10; if (LIBRARY[i]) selectEntry(LIBRARY[i].key); }
});
addEventListener('message', e => {
  const m = e.data;
  if (m && typeof m === 'object' && m.type === 'mode' && (m.mode === 'feed' || m.mode === 'interact')) setMode(m.mode);
});
if (matchMedia('(hover: hover) and (pointer: fine)').matches) hint.textContent = 'Click to explore';

/* ───────── size, loop ───────── */
function resize() {
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  home = fit(aspect);
  if (mode === 'interact' && !I.touched) tweenCamera();
}
new ResizeObserver(resize).observe(viewEl);

function step(dt) {
  board.update(dt);
  if (mode === 'feed' && !returning) feedStep(dt);
  else interactStep(dt);
  stepCamera(dt);
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
board.set(feedGrids[0]);
camera.position.copy(home.pos); controls.target.copy(home.target); camera.lookAt(home.target);
if (qs.has('t')) feedT = mod(+qs.get('t') || 0, FEED_T);
if (qs.get('mode') === 'interact' && !EMBED) {
  const k = qs.get('knot');
  setMode('interact');
  if (k && byKey[k]) selectEntry(k);
} else if (!EMBED) {
  setTimeout(() => { if (mode === 'feed') hint.classList.add('show'); }, 2200);
  setTimeout(() => hint.classList.remove('show'), 8000);
}
requestAnimationFrame(frame);

// for testing: step the piece by hand when the pane is hidden and rAF is frozen
window.__km = {
  step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); render(); },
  seek: t => { feedT = mod(t, FEED_T); step(0); render(); },
  ready: () => Promise.all(feedGrids.map(relax)),
  setMode, selectEntry, tapTile: (r, c) => tapTile(board.at(r, c)), toggleLift,
  pause: v => { paused = v !== false; },
  get mode() { return mode; }, get feedT() { return feedT; }, S, I, board,
};
