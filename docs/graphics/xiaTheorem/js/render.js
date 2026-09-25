// render.js — three.js scene: sky, bodies, ribbon trails, guides, bloom.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CAP = 4096;          // trail ring-buffer length (points per body)
const MAXB = 16;           // bodies supported by the trail texture

// ─────────────────────────── shaders ───────────────────────────

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec3 d = mat3(viewMatrix) * position;
    gl_Position = projectionMatrix * vec4(d, 1.0);
    gl_Position.z = gl_Position.w * 0.99999;
  }`;
const skyFrag = /* glsl */`
  varying vec3 vDir;
  uniform float uTime;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float band = exp(-pow(d.y * 2.6 + 0.35 * sin(d.x * 2.0), 2.0));
    float n = fbm(d * 3.1 + vec3(0.0, 0.0, uTime * 0.002));
    float m = fbm(d * 7.3 + 11.0);
    vec3 deep = vec3(0.006, 0.008, 0.02);
    vec3 violet = vec3(0.10, 0.045, 0.16), teal = vec3(0.02, 0.09, 0.12);
    vec3 col = deep + band * (violet * smoothstep(0.35, 0.85, n) + teal * smoothstep(0.45, 0.9, m)) * 0.55;
    gl_FragColor = vec4(col, 1.0);
  }`;

const starVert = /* glsl */`
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime; uniform float uPixel;
  varying vec3 vColor; varying float vTw;
  void main() {
    vec3 d = mat3(viewMatrix) * position;
    gl_Position = projectionMatrix * vec4(d, 1.0);
    gl_Position.z = gl_Position.w * 0.99998;
    vTw = 0.75 + 0.25 * sin(uTime * (0.6 + aPhase) + aPhase * 40.0);
    vColor = aColor;
    gl_PointSize = aSize * uPixel;
  }`;
const starFrag = /* glsl */`
  varying vec3 vColor; varying float vTw;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float r = length(c);
    float a = smoothstep(0.5, 0.0, r); a *= a;
    gl_FragColor = vec4(vColor * a * vTw, 1.0);
  }`;

const bodyVert = /* glsl */`
  attribute float aSize; attribute vec3 aColor; attribute float aHeat;
  uniform float uPixel;
  varying vec3 vColor; varying float vHeat;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vColor = aColor; vHeat = aHeat;
    gl_PointSize = aSize * uPixel * (1.0 + 0.35 * aHeat);
  }`;
const bodyFrag = /* glsl */`
  varying vec3 vColor; varying float vHeat;
  uniform float uGhost;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
    if (r > 1.0) discard;
    vec3 col;
    float a;
    if (uGhost > 0.5) {
      float ring = smoothstep(0.16, 0.0, abs(r - 0.34));
      col = vColor * ring * 1.3; a = ring;
    } else {
      float core = smoothstep(0.2, 0.08, r);
      float halo = exp(-r * r * 9.0) * 0.9 + exp(-r * 4.0) * 0.25;
      col = mix(vColor, vec3(1.0), 0.55 + 0.3 * vHeat) * core * 2.2 + vColor * halo * (1.0 + vHeat);
      a = clamp(core + halo, 0.0, 1.0);
    }
    gl_FragColor = vec4(col, a);
  }`;

const trailVert = /* glsl */`
  attribute float aSeg; attribute float aSide;
  uniform sampler2D uTex; uniform sampler2D uMeta; uniform float uRow, uHead, uCount, uLen, uCap;
  uniform vec2 uRes; uniform float uWidth;
  uniform vec3 uUnroll; uniform float uNow;
  varying float vAge; varying float vSide; varying float vHeat;
  vec4 fetchP(float j) {
    float idx = mod(uHead - j + uCap, uCap);
    ivec2 c = ivec2(int(idx), int(uRow));
    vec4 P = texelFetch(uTex, c, 0);
    // "Unroll time": push each point sideways by its age in wall-clock seconds.
    P.xyz += uUnroll * (uNow - texelFetch(uMeta, c, 0).r);
    return P;
  }
  vec2 toPx(vec4 c) { return (c.xy / c.w) * 0.5 * uRes; }
  void main() {
    float n = min(uCount, uLen);
    if (aSeg >= n || n < 2.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAge = 1.0; vSide = 0.0; vHeat = 0.0; return; }
    vec4 P = fetchP(aSeg);
    vec4 A = fetchP(max(aSeg - 1.0, 0.0));
    vec4 B = fetchP(min(aSeg + 1.0, n - 1.0));
    mat4 pm = projectionMatrix * modelViewMatrix;
    vec4 c = pm * vec4(P.xyz, 1.0), ca = pm * vec4(A.xyz, 1.0), cb = pm * vec4(B.xyz, 1.0);
    // Drop segments that touch the region behind the camera (they'd project through infinity).
    if (c.w <= 1e-4 || ca.w <= 1e-4 || cb.w <= 1e-4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAge = 1.0; vSide = 0.0; vHeat = 0.0; return; }
    vec2 sa = toPx(ca), sb = toPx(cb), s = toPx(c);
    vec2 d = sa - sb;
    if (dot(d, d) < 1e-6) d = s - sb;
    if (dot(d, d) < 1e-6) d = sa - s;
    if (dot(d, d) < 1e-8) d = vec2(1.0, 0.0);
    d = normalize(d);
    vec2 nrm = vec2(-d.y, d.x);
    float age = aSeg / max(n - 1.0, 1.0);
    float w = uWidth * (1.0 - 0.75 * age) * (0.8 + 0.6 * P.w);
    c.xy += nrm * aSide * w / uRes * 2.0 * c.w;
    gl_Position = c;
    vAge = age; vSide = aSide; vHeat = P.w;
  }`;
const trailFrag = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vAge; varying float vSide; varying float vHeat;
  void main() {
    // clamp: interpolation round-off can push vAge past 1, and pow() of a negative base is NaN
    // (one NaN pixel is enough for the bloom blur to black out the whole frame)
    float fade = pow(clamp(1.0 - vAge, 0.0, 1.0), 1.6);
    float edge = max(1.0 - vSide * vSide, 0.0);
    vec3 col = mix(uColor, vec3(1.0), clamp(vHeat * 0.4, 0.0, 0.5));
    gl_FragColor = vec4(col * fade * edge * uOpacity * (0.7 + 0.6 * vHeat), 1.0);
  }`;

// ─────────────────────────── renderer ───────────────────────────

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.gl = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1e6);
    this.camera.position.set(12, 4, 8);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.enableZoom = false;         // wheel handled by main.js (zoom bias)
    this.controls.enablePan = false;

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.16);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.pixel = r.getPixelRatio();
    this.buildSky();
    this.buildTrails();
    this.buildGuides();
    this.bodies = null;
    this.ghosts = null;
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1), h = Math.max(1, this.canvas.clientHeight || window.innerHeight || 1);
    this.cssSize = [w, h];
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.gl.getPixelRatio();
    this.res = new THREE.Vector2(w * pr, h * pr);
    for (const m of this.trailMeshes) m.material.uniforms.uRes.value.copy(this.res);
  }

  // ── sky ──
  buildSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false, depthTest: false }));
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);

    const n = 2600, pos = new Float32Array(3 * n), size = new Float32Array(n), phase = new Float32Array(n), col = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[3 * i] = s * Math.cos(th); pos[3 * i + 1] = s * Math.sin(th); pos[3 * i + 2] = u;
      const big = Math.random();
      size[i] = 0.8 + 2.4 * big ** 6;
      phase[i] = Math.random();
      const warm = Math.random(), b = 0.35 + 0.65 * Math.random() ** 2;
      col[3 * i] = b * (0.8 + 0.2 * warm); col[3 * i + 1] = b * (0.85 + 0.1 * warm); col[3 * i + 2] = b * (1.0 - 0.2 * warm);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: starVert, fragmentShader: starFrag,
      uniforms: { uTime: { value: 0 }, uPixel: { value: this.pixel } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  // ── trails ──
  buildTrails() {
    this.trailData = new Float32Array(CAP * MAXB * 4);
    this.trailTex = new THREE.DataTexture(this.trailData, CAP, MAXB, THREE.RGBAFormat, THREE.FloatType);
    this.trailTex.minFilter = this.trailTex.magFilter = THREE.NearestFilter;
    this.trailTex.needsUpdate = true;
    this.metaData = new Float32Array(CAP * MAXB);
    this.metaTex = new THREE.DataTexture(this.metaData, CAP, MAXB, THREE.RedFormat, THREE.FloatType);
    this.metaTex.minFilter = this.metaTex.magFilter = THREE.NearestFilter;
    this.metaTex.needsUpdate = true;
    this.unroll = { dir: new THREE.Vector3(), now: { value: 0 }, vec: { value: new THREE.Vector3() } };
    this.lastWall = new Float64Array(MAXB);
    const seg = new Float32Array(CAP * 2), side = new Float32Array(CAP * 2);
    for (let j = 0; j < CAP; j++) { seg[2 * j] = seg[2 * j + 1] = j; side[2 * j] = -1; side[2 * j + 1] = 1; }
    const idx = new Uint32Array((CAP - 1) * 6);
    for (let j = 0; j < CAP - 1; j++) {
      const a = 2 * j, b = a + 1, c = a + 2, d = a + 3;
      idx.set([a, b, c, b, d, c], 6 * j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAP * 2 * 3), 3));
    geo.setAttribute('aSeg', new THREE.BufferAttribute(seg, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.trailGeo = geo;
    this.trailMeshes = [];
    this.head = new Int32Array(MAXB);
    this.count = new Int32Array(MAXB);
    this.last = Array.from({ length: MAXB }, () => new Float64Array(3));
    this.trailLen = 900;
    this.trailWidth = 2.2;
  }

  // ── guides: axis line, plane grid, osculating orbits ──
  buildGuides() {
    this.guides = new THREE.Group();
    this.scene.add(this.guides);
    const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)]);
    this.axis = new THREE.Line(axisGeo, new THREE.LineDashedMaterial({ color: 0x8fa6ff, transparent: true, opacity: 0.28, dashSize: 0.02, gapSize: 0.016, depthWrite: false }));
    this.axis.computeLineDistances();
    this.axis.frustumCulled = false;
    this.guides.add(this.axis);

    const ringPts = [];
    const grid = new THREE.Group();
    for (let k = 1; k <= 6; k++) {
      ringPts.length = 0;
      for (let i = 0; i <= 128; i++) { const t = i / 128 * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(t) * k, Math.sin(t) * k, 0)); }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x6c7bd9, transparent: true, opacity: 0.09 - k * 0.008, depthWrite: false }));
      grid.add(l);
    }
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * Math.PI * 2;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(t) * 0.6, Math.sin(t) * 0.6, 0), new THREE.Vector3(Math.cos(t) * 6, Math.sin(t) * 6, 0)]),
        new THREE.LineBasicMaterial({ color: 0x6c7bd9, transparent: true, opacity: 0.05, depthWrite: false }));
      grid.add(l);
    }
    this.grid = grid;
    this.guides.add(grid);

    this.orbitLines = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 257), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
      l.frustumCulled = false;
      this.orbitLines.push(l);
      this.guides.add(l);
    }
  }

  /** Configure for a scenario's bodies. */
  setBodies(bodies, masses) {
    const n = bodies.length;
    this.n = n;
    if (this.bodies) { this.scene.remove(this.bodies); this.bodies.geometry.dispose(); }
    if (this.ghosts) { this.scene.remove(this.ghosts); this.ghosts.geometry.dispose(); }
    const mk = (ghost) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
      const size = new Float32Array(n), col = new Float32Array(3 * n), heat = new Float32Array(n);
      const mMax = Math.max(...masses.map(m => m || 0), 1e-9);
      bodies.forEach((b, i) => {
        const c = new THREE.Color(b.color);
        col.set([c.r, c.g, c.b], 3 * i);
        const rel = Math.cbrt(Math.max(masses[i], 1e-4 * mMax) / mMax);
        size[i] = (ghost ? 22 : 30) * (0.45 + 0.55 * rel);
      });
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1));
      const p = new THREE.Points(g, new THREE.ShaderMaterial({
        vertexShader: bodyVert, fragmentShader: bodyFrag,
        uniforms: { uPixel: { value: this.pixel }, uGhost: { value: ghost ? 1 : 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      p.frustumCulled = false; p.renderOrder = 5;
      return p;
    };
    this.bodies = mk(false);
    this.ghosts = mk(true);
    this.ghosts.visible = false;
    this.scene.add(this.bodies, this.ghosts);

    for (const m of this.trailMeshes) { this.scene.remove(m); m.material.dispose(); }
    this.trailMeshes = bodies.map((b, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: trailVert, fragmentShader: trailFrag,
        uniforms: {
          uTex: { value: this.trailTex }, uMeta: { value: this.metaTex }, uNow: this.unroll.now, uUnroll: this.unroll.vec, uRow: { value: i }, uHead: { value: 0 }, uCount: { value: 0 },
          uLen: { value: this.trailLen }, uCap: { value: CAP }, uRes: { value: this.res ? this.res.clone() : new THREE.Vector2(1, 1) },
          uWidth: { value: this.trailWidth * this.pixel }, uColor: { value: new THREE.Color(b.color) }, uOpacity: { value: 0.62 },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.trailGeo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      return mesh;
    });
    this.clearTrails();
  }

  /** Unroll trails: world-space drift per wall-clock second of age (zero vector = off). */
  setUnroll(now, vx, vy, vz) { this.unroll.now.value = now; this.unroll.vec.value.set(vx, vy, vz); }

  clearTrails() {
    this.head.fill(0); this.count.fill(0); this.lastWall.fill(-1e9);
    for (const l of this.last) l.fill(NaN);
    this.trailDirty = true;
  }

  setTrailLength(len) { this.trailLen = len; for (const m of this.trailMeshes) m.material.uniforms.uLen.value = len; }
  setTrailWidth(w) { this.trailWidth = w; for (const m of this.trailMeshes) m.material.uniforms.uWidth.value = w * this.pixel; }

  /** Commit a trail point for body i if it moved at least `minStep` since the last one. */
  pushTrail(i, x, y, z, heat, minStep, wall = 0, unrolling = false) {
    const L = this.last[i];
    const dx = x - L[0], dy = y - L[1], dz = z - L[2];
    if (dx * dx + dy * dy + dz * dz < minStep * minStep && !(unrolling && wall - this.lastWall[i] > 0.04)) return false;
    const h = (this.head[i] + 1) % CAP;
    this.head[i] = h;
    this.count[i] = Math.min(CAP - 1, this.count[i] + 1);
    const o = 4 * (i * CAP + h);
    this.trailData[o] = x; this.trailData[o + 1] = y; this.trailData[o + 2] = z; this.trailData[o + 3] = heat;
    this.metaData[i * CAP + h] = wall;
    this.lastWall[i] = wall;
    L[0] = x; L[1] = y; L[2] = z;
    this.trailDirty = true;
    return true;
  }

  /** The live head of each trail: the body's interpolated position this frame (not committed). */
  setLiveHead(i, x, y, z, heat, wall = 0) {
    const h = (this.head[i] + 1) % CAP;
    const o = 4 * (i * CAP + h);
    this.trailData[o] = x; this.trailData[o + 1] = y; this.trailData[o + 2] = z; this.trailData[o + 3] = heat;
    this.metaData[i * CAP + h] = wall;
    const u = this.trailMeshes[i].material.uniforms;
    u.uHead.value = h; u.uCount.value = this.count[i] + 1;
    this.trailDirty = true;
  }

  /** Update body sprites. pos: Float64Array(3n); heat: 0..1 per body. */
  setBodyPositions(pos, heat, ghostPos) {
    const a = this.bodies.geometry.attributes;
    for (let k = 0; k < 3 * this.n; k++) a.position.array[k] = pos[k];
    for (let i = 0; i < this.n; i++) a.aHeat.array[i] = heat[i];
    a.position.needsUpdate = true; a.aHeat.needsUpdate = true;
    if (ghostPos) {
      const g = this.ghosts.geometry.attributes;
      for (let k = 0; k < 3 * this.n; k++) g.position.array[k] = ghostPos[k];
      g.position.needsUpdate = true;
      this.ghosts.visible = true;
    } else this.ghosts.visible = false;
  }

  /** Osculating Kepler ellipse of a pair (i, j) around its centre of mass, or hide. */
  setOrbit(k, data, color) {
    const line = this.orbitLines[k];
    if (!data) { line.visible = false; return; }
    const { c, e1, e2, a, e, scale } = data;
    const arr = line.geometry.attributes.position.array;
    const b = a * Math.sqrt(Math.max(0, 1 - e * e));
    for (let s = 0; s <= 256; s++) {
      const E = s / 256 * Math.PI * 2;
      const u = scale * a * (Math.cos(E) - e), v = scale * b * Math.sin(E);
      for (let q = 0; q < 3; q++) arr[3 * s + q] = c[q] + u * e1[q] + v * e2[q];
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.material.color.set(color);
    line.visible = true;
  }

  setAxis(visible, centre, halfLength) {
    this.axis.visible = visible;
    if (!visible) return;
    this.axis.position.set(centre[0], centre[1], centre[2]);
    this.axis.scale.set(1, 1, halfLength);
    this.axis.material.dashSize = 0.02;
    this.axis.material.gapSize = 0.014;
  }

  setGrid(visible, centre, scale) {
    this.grid.visible = visible;
    if (!visible) return;
    this.grid.position.set(centre[0], centre[1], centre[2]);
    this.grid.scale.setScalar(scale);
  }

  render(time) {
    // Hidden panes and late layout can leave us sized 1×1 with no resize event: re-check.
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (cw && ch && (cw !== this.cssSize[0] || ch !== this.cssSize[1])) { this.resize(); this.onResize?.(); }
    if (cw < 16 || ch < 16) return;
    this.sky.material.uniforms.uTime.value = time;
    this.stars.material.uniforms.uTime.value = time;
    if (this.trailDirty) { this.trailTex.needsUpdate = true; this.metaTex.needsUpdate = true; this.trailDirty = false; }
    if (this.bloom.enabled) this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }
}
