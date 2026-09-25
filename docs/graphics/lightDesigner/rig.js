// rig.js — three.js renderer: a stage and floor in a black void, the selected rig, and haze beams.
//
// Beams are instanced open cones drawn additively; their soft edges come from
// the angle between the surface and the view ray, which reads as a lit column of
// haze. Every lit surface (deck, floor, truss, fixture bodies) samples one
// per-fixture data texture, so each head throws a pool of light where its beam
// lands and sweeping beams catch the metal. The rig itself is rebuilt from the
// layout's body description whenever a different rig is selected.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  POD_COUNT, DECK_Y, DECK_FRONT, DECK_BACK, DECK_HALF, GRID_Y,
} from './layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_BEAMS, PROJECTORS } from './lasers.js';

export const CAMERAS = {
  foh: { label: 'Front', pos: [0, 5.2, 25], target: [0, 6.5, -3.5] },
  low: { label: 'Low, looking up', pos: [3.5, 1.5, 11], target: [0, 8.5, -3.5] },
  angle: { label: 'Three-quarter', pos: [-14, 7, 16], target: [0, 7, -3.5] },
  high: { label: 'High', pos: [0, 17, 30], target: [0, 5.5, -3.5] },
  side: { label: 'Side on', pos: [-24, 7, -3.5], target: [0, 7, -3.5] },
  under: { label: 'Under the pods', pos: [0.5, 2.5, -4], target: [0, 10, -3.2] },
  above: { label: 'Rigging plot (above)', pos: [0, 30, 8], target: [0, 1, -3.2] },
};

const LIT_VERT = /* glsl */ `
  varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vIC;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    vUv = uv;
    #ifdef USE_INSTANCING_COLOR
      vIC = instanceColor;
    #else
      vIC = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const LIT_FRAG = /* glsl */ `
  uniform sampler2D uLights; uniform int uCount;
  uniform vec3 uAlbedo; uniform vec3 uAmbient; uniform float uSpec; uniform float uGain; uniform vec3 uFill;
  uniform sampler2D uMap; uniform float uUseMap; uniform vec2 uRepeat;
  varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vIC;
  vec3 spots(vec3 p, vec3 n) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 96; i++) {
      if (i >= uCount) break;
      vec4 c = texelFetch(uLights, ivec2(2, i), 0);
      if (c.w <= 0.001) continue;
      vec4 a = texelFetch(uLights, ivec2(0, i), 0);
      vec4 b = texelFetch(uLights, ivec2(1, i), 0);
      vec3 v = p - a.xyz;
      float along = dot(v, b.xyz);
      if (along <= 0.05) continue;
      float perp = length(v - b.xyz * along);
      float rad = 0.07 + along * a.w;
      float spot = 1.0 - smoothstep(rad * (0.72 - 0.6 * b.w), rad * (1.0 + 0.5 * b.w), perp);
      float energy = 1.0 / (0.35 + rad * rad * 0.9);
      float lam = max(dot(n, -b.xyz), 0.0) * 0.8 + 0.2;
      vec3 h = normalize(-b.xyz + normalize(cameraPosition - p));
      float spec = uSpec * pow(max(dot(n, h), 0.0), 40.0) * 4.0;
      acc += c.rgb * spot * energy * (lam + spec);
    }
    return acc;
  }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 alb = uAlbedo * vIC;
    if (uUseMap > 0.5) {
      vec4 t = texture2D(uMap, vUv * uRepeat);
      if (t.a < 0.45) discard;
      alb *= t.rgb;
    }
    vec3 col = alb * (uAmbient + uFill + spots(vW, n) * uGain);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const BEAM_VERT = /* glsl */ `
  attribute vec4 aBeam; // length, tan(half angle), lens radius, frost
  attribute vec3 aColor;
  varying vec3 vW; varying vec3 vN; varying float vAlong; varying float vR; varying vec3 vC; varying float vSoft; varying float vLen;
  void main() {
    float along = position.y * aBeam.x;
    float r = aBeam.z + along * aBeam.y;
    vec3 lp = vec3(position.x * r, along, position.z * r);
    vec3 ln = normalize(vec3(position.x, -aBeam.y, position.z));
    mat4 m = modelMatrix * instanceMatrix;
    vec4 w = m * vec4(lp, 1.0);
    vW = w.xyz; vN = normalize(mat3(m) * ln);
    vAlong = along; vR = r; vC = aColor; vSoft = aBeam.w; vLen = aBeam.x;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime; uniform float uHaze; uniform float uGain; uniform float uTexture;
  varying vec3 vW; varying vec3 vN; varying float vAlong; varying float vR; varying vec3 vC; varying float vSoft; varying float vLen;
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 V = normalize(cameraPosition - vW);
    float f = abs(dot(normalize(vN), V));
    float edge = pow(f, 1.2 + vSoft * 2.5);
    float fall = exp(-vAlong * (0.018 + 0.03 * (1.0 - uHaze)));
    float width = 1.0 / (1.0 + vR * 1.6);
    float start = smoothstep(0.0, 0.25, vAlong);
    float end = 1.0 - smoothstep(vLen * 0.45, vLen, vAlong);
    vec3 q = vW * 0.45 + vec3(0.0, -uTime * 0.18, uTime * 0.07);
    float tex = mix(1.0, 0.35 + 1.3 * vn(q) * (0.6 + 0.4 * vn(q * 2.3 + 4.0)), uTexture);
    float a = edge * fall * width * start * end * tex * uHaze * uGain;
    gl_FragColor = vec4(vC * a, 1.0);
  }
`;

const GLOW_VERT = /* glsl */ `
  attribute vec3 aColor; attribute float aSize;
  varying vec3 vC;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    vC = aColor;
  }
`;
const GLOW_FRAG = /* glsl */ `
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 7.0) * 0.8 + (1.0 - smoothstep(0.0, 0.28, d)) * 1.6;
    gl_FragColor = vec4(vC * a, 1.0);
  }
`;

// Lasers: each beam is a camera-facing ribbon a few pixels wide, clipped to the near
// plane. The brightness profile is measured in the fragment shader as the exact
// pixel distance to the beam's screen-space line (endpoints passed as flat
// varyings): interpolating an across-beam coordinate over the quad would be
// perspective-skewed on long, shallow beams and shows up as stair-steps.
const LASER_VERT = /* glsl */ `
  attribute vec3 aStart; attribute vec3 aEnd; attribute vec3 aColor;
  uniform vec2 uRes; uniform float uWidth;
  varying vec3 vC; varying vec3 vW; varying float vAlong;
  flat varying vec4 vSeg; // beam endpoints in framebuffer pixels
  void main() {
    vec3 va = (viewMatrix * vec4(aStart, 1.0)).xyz, vb = (viewMatrix * vec4(aEnd, 1.0)).xyz;
    float near = -0.15;
    if (va.z > near && vb.z > near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    if (va.z > near) va = mix(va, vb, (va.z - near) / (va.z - vb.z));
    if (vb.z > near) vb = mix(vb, va, (vb.z - near) / (vb.z - va.z));
    vec4 ca = projectionMatrix * vec4(va, 1.0), cb = projectionMatrix * vec4(vb, 1.0);
    vec2 sa = ca.xy / ca.w * uRes, sb = cb.xy / cb.w * uRes;
    vec2 d = sb - sa; float l = length(d); d = l > 1e-4 ? d / l : vec2(1.0, 0.0);
    vec2 nrm = vec2(-d.y, d.x);
    vec4 c = mix(ca, cb, position.x);
    // widen, and extend a little past each end so round-off never trims the tips
    c.xy += (nrm * position.y + d * (position.x * 2.0 - 1.0)) * uWidth / uRes * c.w;
    gl_Position = c;
    vSeg = vec4(sa + uRes, sb + uRes);
    vC = aColor; vAlong = position.x;
    vW = mix(aStart, aEnd, position.x);
  }
`;
const LASER_FRAG = /* glsl */ `
  uniform float uTime; uniform float uHaze;
  varying vec3 vC; varying vec3 vW; varying float vAlong;
  flat varying vec4 vSeg;
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x) { // smooth value noise: no blocky steps along shallow beams
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    // exact distance (px) from this pixel to the beam's line segment
    vec2 a = vSeg.xy, b = vSeg.zw, ab = b - a, p = gl_FragCoord.xy - a;
    float h = clamp(dot(p, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(p - ab * h);
    // a ~2 px anti-aliased core plus a soft halo
    float core = exp(-(d * d) / 0.8) * 0.62 + exp(-(d * d) / 5.0) * 0.14;
    float grain = 0.85 + 0.3 * vn(vW * 0.8 + vec3(0.0, -uTime * 0.5, uTime * 0.25));
    float start = smoothstep(0.0, 0.004, clamp(vAlong, 0.0, 1.0));
    gl_FragColor = vec4(vC * core * grain * start * (0.6 + 0.6 * uHaze), 1.0);
  }
`;

function applyPose(pose, l) {
  const m = pose.m, sc = pose.scale || 1, x = l[0] * sc, y = l[1], z = l[2] * sc;
  return [pose.x + m[0] * x + m[1] * y + m[2] * z, pose.y + m[3] * x + m[4] * y + m[5] * z, pose.z + m[6] * x + m[7] * y + m[8] * z];
}

// 2016 video wall: an LED grid showing the unit's colours as drifting pop-art bands
const PANEL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PANEL_FRAG = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uSeed; uniform vec2 uGrid;
  varying vec2 vUv;
  void main() {
    vec2 cell = floor(vUv * uGrid), f = fract(vUv * uGrid) - 0.5;
    float band = 0.5 + 0.5 * sin(cell.x * 0.35 + cell.y * 0.6 - uTime * 2.2 + uSeed);
    float blocks = step(0.5, fract(sin(dot(floor(cell / 6.0) + floor(uTime * 1.5 + uSeed), vec2(12.9898, 78.233))) * 43758.5453));
    vec3 c = mix(uA, uB, mix(band, blocks, 0.35));
    float dot_ = 1.0 - smoothstep(0.3, 0.5, length(f));
    gl_FragColor = vec4(c * (0.25 + 1.4 * dot_) * 1.6 + vec3(0.004), 1.0);
  }
`;

function trussTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 4); g.lineTo(128, 4); g.moveTo(0, 60); g.lineTo(128, 60); g.stroke();
  g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(0, 60); g.lineTo(64, 4); g.lineTo(128, 60); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class Rig {
  constructor(host, engine) {
    this.engine = engine;
    this.N = engine.N;
    this.host = host;
    this.quality = 1;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    host.append(r.domElement);
    this.canvas = r.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxDistance = 90;
    this.controls.minDistance = 2;
    this.lastInteract = -1e9;
    this.controls.addEventListener('start', () => { this.lastInteract = performance.now(); this.tween = null; });
    this.controls.addEventListener('end', () => { this.lastInteract = performance.now(); });
    this.setCamera('foh', 0);

    // per-fixture light data: 3 texels per fixture
    this.lightData = new Float32Array(3 * 4 * this.N);
    this.lightTex = new THREE.DataTexture(this.lightData, 3, this.N, THREE.RGBAFormat, THREE.FloatType);
    this.lightTex.minFilter = this.lightTex.magFilter = THREE.NearestFilter;
    this.lightTex.needsUpdate = true;
    this.shared = {
      uLights: { value: this.lightTex }, uCount: { value: this.N }, uFill: { value: new THREE.Color(0, 0, 0) },
    };

    this.buildStage();
    this.buildFixtures();
    this.buildBeams();
    this.buildLasers();
    this.setRig(engine.rig);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.45);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  lit(opts = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: LIT_VERT,
      fragmentShader: LIT_FRAG,
      defines: opts.defines || {},
      side: opts.side ?? THREE.FrontSide,
      uniforms: {
        ...this.shared,
        uAlbedo: { value: new THREE.Color(...(opts.albedo || [0.3, 0.3, 0.3])) },
        uAmbient: { value: new THREE.Color(...(opts.ambient || [0.012, 0.014, 0.022])) },
        uSpec: { value: opts.spec ?? 0 },
        uGain: { value: opts.gain ?? 1 },
        uMap: { value: opts.map || null },
        uUseMap: { value: opts.map ? 1 : 0 },
        uRepeat: { value: new THREE.Vector2(...(opts.repeat || [1, 1])) },
      },
    });
    return m;
  }

  buildStage() {
    const g = (this.stage = new THREE.Group());
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), this.lit({ albedo: [0.11, 0.11, 0.12], spec: 0.25, ambient: [0.02, 0.022, 0.03] }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 10);
    const depth = DECK_FRONT - DECK_BACK;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_HALF * 2, DECK_Y, depth), this.lit({ albedo: [0.2, 0.2, 0.22], spec: 0.7, ambient: [0.09, 0.095, 0.12] }));
    deck.position.set(0, DECK_Y / 2, (DECK_FRONT + DECK_BACK) / 2);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(DECK_HALF * 2 + 0.1, 0.06, 0.08), this.lit({ albedo: [0.5, 0.5, 0.52], spec: 1 }));
    lip.position.set(0, DECK_Y, DECK_FRONT);
    g.add(floor, deck, lip);
    this.scene.add(g);
  }

  buildFixtures() {
    this.trussTex = trussTexture();
    const headGeo = new THREE.CylinderGeometry(0.19, 0.24, 0.5, 14);
    headGeo.translate(0, -0.08, 0);
    this.heads = new THREE.InstancedMesh(headGeo, this.lit({ albedo: [0.13, 0.13, 0.14], spec: 0.5 }), this.N);
    this.heads.frustumCulled = false;
    this.scene.add(this.heads);
    const baseGeo = new THREE.BoxGeometry(0.46, 0.22, 0.4);
    this.bases = new THREE.InstancedMesh(baseGeo, this.lit({ albedo: [0.09, 0.09, 0.1] }), this.N);
    this.bases.frustumCulled = false;
    this.scene.add(this.bases);
  }

  /** Build truss, panels and hoist chains for a rig from its body description. */
  setRig(rig) {
    if (this.rigGroup) {
      this.scene.remove(this.rigGroup);
      this.rigGroup.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material !== this.trussMat) o.material.dispose?.(); });
    }
    this.rig = rig;
    const group = (this.rigGroup = new THREE.Group());
    this.trussMat ??= this.lit({ albedo: [0.55, 0.56, 0.6], map: this.trussTex, side: THREE.DoubleSide, spec: 0.8, gain: 0.5 });
    const size = { pods: 0.52, sticks: 0.42, squares: 0.5, wall2016: 0.3 }[rig.id] ?? 0.4;
    this.bodies = [];
    const hoists = [];
    for (let p = 0; p < POD_COUNT; p++) {
      for (let b = 0; b < rig.bodies; b++) {
        const node = new THREE.Group();
        const segs = rig.segs(p, b);
        if (rig.scaled) {
          // virtual rings: light-lines rather than steel
          const pts = segs.flatMap(([a, c]) => [...a, ...c]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          node.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x5a6a88, transparent: true, opacity: 0.55 })));
        } else if (segs.length) {
          const parts = segs.map(([a, c]) => {
            const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c), len = va.distanceTo(vc);
            const box = new THREE.BoxGeometry(len + size * 0.6, size, size);
            const uv = box.getAttribute('uv');
            for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (len / 0.6));
            const dir = vc.clone().sub(va).normalize();
            box.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir));
            box.translate(...va.clone().add(vc).multiplyScalar(0.5).toArray());
            return box;
          });
          node.add(new THREE.Mesh(mergeGeometries(parts), this.trussMat));
        }
        if (rig.panel) {
          const { w, h } = rig.panel(p, b);
          const mat = new THREE.ShaderMaterial({
            vertexShader: PANEL_VERT, fragmentShader: PANEL_FRAG,
            uniforms: { uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uTime: { value: 0 }, uSeed: { value: p * 1.7 }, uGrid: { value: new THREE.Vector2(w * 18, h * 18) } },
          });
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
          panel.position.z = 0.02;
          const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), this.lit({ albedo: [0.05, 0.05, 0.055] }));
          back.position.z = -0.05;
          node.add(back, panel);
          node.userData.panel = mat;
        }
        for (const l of rig.hoists(p, b)) hoists.push({ p, b, l });
        group.add(node);
        this.bodies.push({ p, b, node });
      }
    }
    this.hoists = hoists;
    this.chainPos = new Float32Array(Math.max(1, hoists.length) * 6);
    const chainGeo = new THREE.BufferGeometry();
    chainGeo.setAttribute('position', new THREE.BufferAttribute(this.chainPos, 3));
    this.chains = new THREE.LineSegments(chainGeo, new THREE.LineBasicMaterial({ color: 0x2a2c33 }));
    this.chains.frustumCulled = false;
    group.add(this.chains);
    this.scene.add(group);
  }

  buildBeams() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 36, 1, true);
    geo.translate(0, 0.5, 0);
    const ig = geo;
    this.aBeam = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 4), 4);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    this.aBeam.setUsage(THREE.DynamicDrawUsage);
    this.aColor.setUsage(THREE.DynamicDrawUsage);
    ig.setAttribute('aBeam', this.aBeam);
    ig.setAttribute('aColor', this.aColor);
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uTime: { value: 0 }, uHaze: { value: 0.7 }, uGain: { value: 0.15 }, uTexture: { value: 0.75 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beams = new THREE.InstancedMesh(ig, this.beamMat, this.N);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 10;
    this.scene.add(this.beams);

    const gg = new THREE.BufferGeometry();
    this.gPos = new Float32Array(this.N * 3);
    this.gCol = new Float32Array(this.N * 3);
    this.gSize = new Float32Array(this.N);
    gg.setAttribute('position', new THREE.BufferAttribute(this.gPos, 3));
    gg.setAttribute('aColor', new THREE.BufferAttribute(this.gCol, 3));
    gg.setAttribute('aSize', new THREE.BufferAttribute(this.gSize, 1));
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uScale: { value: 300 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Points(gg, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 11;
    this.scene.add(this.glow);
  }

  /**
   * A batch of thin, anti-aliased beams (lasers, mirror-ball rays, pin spots).
   * Returns { mesh, start, end, color, mat, set(count) }; `width` is the ribbon
   * half-width in pixels (the visible core stays ~2 px).
   */
  makeRibbons(max, width = 4) {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const start = attr(3), end = attr(3), color = attr(3);
    quad.setAttribute('aStart', start); quad.setAttribute('aEnd', end); quad.setAttribute('aColor', color);
    quad.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: LASER_VERT, fragmentShader: LASER_FRAG,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: width }, uTime: { value: 0 }, uHaze: { value: 0.7 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(quad, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    this.scene.add(mesh);
    (this.ribbons ??= []).push(mat);
    if (this.resUniform) mat.uniforms.uRes.value.copy(this.resUniform);
    const r = {
      mesh, start, end, color, mat,
      set(n) {
        quad.instanceCount = n; mesh.visible = n > 0;
        start.needsUpdate = end.needsUpdate = color.needsUpdate = true;
      },
    };
    return r;
  }

  buildLasers() {
    const rb = this.makeRibbons(MAX_BEAMS, 4);
    this.lStart = rb.start; this.lEnd = rb.end; this.lColor = rb.color;
    this.laserMat = rb.mat;
    this.laserMesh = rb.mesh;
    // hit dots where beams land
    const dg = new THREE.BufferGeometry();
    this.dPos = new Float32Array(MAX_BEAMS * 3); this.dCol = new Float32Array(MAX_BEAMS * 3); this.dSize = new Float32Array(MAX_BEAMS);
    dg.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3));
    dg.setAttribute('aColor', new THREE.BufferAttribute(this.dCol, 3));
    dg.setAttribute('aSize', new THREE.BufferAttribute(this.dSize, 1));
    this.laserDots = new THREE.Points(dg, this.glowMat);
    this.laserDots.frustumCulled = false;
    this.laserDots.renderOrder = 13;
    this.scene.add(this.laserDots);
    // projector housings
    const box = new THREE.BoxGeometry(0.5, 0.3, 0.45);
    this.projectors = new THREE.InstancedMesh(box, this.lit({ albedo: [0.08, 0.08, 0.09], spec: 0.4 }), PROJECTORS.length);
    PROJECTORS.forEach((P, i) => {
      const m = new THREE.Matrix4().makeRotationY((P.yaw * Math.PI) / 180);
      m.setPosition(P.pos[0], P.pos[1] - 0.1, P.pos[2]);
      this.projectors.setMatrixAt(i, m);
    });
    this.scene.add(this.projectors);
  }

  updateLasers(L) {
    const on = !!(L && L.on);
    this.projectors.visible = on;
    const n = on ? L.count : 0;
    this.laserMesh.geometry.instanceCount = n;
    this.laserMesh.visible = this.laserDots.visible = n > 0;
    if (!n) return;
    this.lStart.array.set(L.origin.subarray(0, n * 3));
    this.lEnd.array.set(L.end.subarray(0, n * 3));
    const c = this.lColor.array;
    for (let k = 0; k < n * 3; k++) c[k] = L.color[k] * 2.2;
    this.lStart.needsUpdate = this.lEnd.needsUpdate = this.lColor.needsUpdate = true;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      this.dPos[k] = L.end[k]; this.dPos[k + 1] = L.end[k + 1] + 0.02; this.dPos[k + 2] = L.end[k + 2];
      this.dCol[k] = L.color[k] * 1.4; this.dCol[k + 1] = L.color[k + 1] * 1.4; this.dCol[k + 2] = L.color[k + 2] * 1.4;
      this.dSize[i] = L.hit[i] ? 0.35 : 0;
    }
    const dg = this.laserDots.geometry;
    dg.setDrawRange(0, n);
    dg.attributes.position.needsUpdate = dg.attributes.aColor.needsUpdate = dg.attributes.aSize.needsUpdate = true;
    this.laserMat.uniforms.uTime.value = this.engine.time;
    this.laserMat.uniforms.uHaze.value = this.engine.m.haze;
  }

  setCamera(id, dur = 3) {
    const c = CAMERAS[id];
    if (!c) return;
    this.camId = id;
    const toPos = new THREE.Vector3(...c.pos), toT = new THREE.Vector3(...c.target);
    if (!dur) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toT);
      this.controls.update();
      this.tween = null;
      return;
    }
    this.tween = { t: 0, dur, fromPos: this.camera.position.clone(), fromT: this.controls.target.clone(), toPos, toT };
  }

  setQuality(q) {
    this.quality = q;
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.quality;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.glowMat.uniforms.uScale.value = h * dpr * 0.55;
    this.resUniform = new THREE.Vector2(w * dpr * 0.5, h * dpr * 0.5);
    for (const m of this.ribbons || []) m.uniforms.uRes.value.copy(this.resUniform);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  update(dt, opts) {
    const E = this.engine, N = this.N;
    // camera
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur), e = k * k * (3 - 2 * k);
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, e);
      if (k >= 1) this.tween = null;
    } else if (opts.drift && performance.now() - this.lastInteract > 6000) {
      const off = this.camera.position.clone().sub(this.controls.target);
      const a = 0.028 * Math.sin(E.time * 0.045) * dt;
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.camera.position.copy(this.controls.target).add(off);
    }
    this.controls.update();

    // rig bodies, panels + chains
    const rig = this.rig, pose = {}, mat = new THREE.Matrix4();
    for (const { p, b, node } of this.bodies) {
      pose.scale = 1;
      rig.pose(p, b, E.pods[p], E.time, pose);
      const M = pose.m;
      mat.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
      node.quaternion.setFromRotationMatrix(mat);
      node.position.set(pose.x, pose.y, pose.z);
      node.scale.set(pose.scale, 1, pose.scale);
      const pm = node.userData.panel;
      if (pm) {
        // the wall shows the colours its unit is playing, as pixel content
        let r = 0, g = 0, bl = 0, r2 = 0, g2 = 0, b2 = 0;
        for (let s = 0; s < 10; s++) {
          const R = E.render[p * 10 + s];
          if (s < 5) { r += R.r; g += R.g; bl += R.b; } else { r2 += R.r; g2 += R.g; b2 += R.b; }
        }
        pm.uniforms.uA.value.setRGB(r / 5, g / 5, bl / 5);
        pm.uniforms.uB.value.setRGB(r2 / 5, g2 / 5, b2 / 5);
        pm.uniforms.uTime.value = E.time;
      }
    }
    this.hoists.forEach(({ p, b, l }, k) => {
      pose.scale = 1;
      rig.pose(p, b, E.pods[p], E.time, pose);
      const w = applyPose(pose, l);
      this.chainPos.set([w[0], w[1], w[2], w[0], GRID_Y, w[2]], k * 6);
    });
    this.chains.geometry.attributes.position.needsUpdate = true;
    this.chains.visible = this.hoists.length > 0;
    this.stage.visible = opts.stage !== false;

    // fixtures
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), qb = new THREE.Quaternion();
    const cam = this.camera.position;
    const beamGain = opts.beamGain ?? 1;
    const ld = this.lightData, ab = this.aBeam.array, ac = this.aColor.array;
    for (let i = 0; i < N; i++) {
      const R = E.render[i], f = E.fixtures[i];
      d.set(R.dx, R.dy, R.dz);
      q.setFromUnitVectors(Y, d);
      pos.set(R.x, R.y, R.z);
      m.compose(pos, q, one);
      this.beams.setMatrixAt(i, m);
      // head: cylinder axis along beam, pulled back from the lens
      const hp = pos.clone().addScaledVector(d, -0.18);
      m.compose(hp, q, one);
      this.heads.setMatrixAt(i, m);
      // base sits on the truss (or the deck), rotated by roll
      const M = R.m;
      mat.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
      qb.setFromRotationMatrix(mat);
      const up = new THREE.Vector3(M[1], M[4], M[7]);
      m.compose(pos.clone().addScaledVector(up, f.hang ? 0.3 : -0.3), qb, one);
      this.bases.setMatrixAt(i, m);

      ab[i * 4] = R.len; ab[i * 4 + 1] = R.tan; ab[i * 4 + 2] = 0.1; ab[i * 4 + 3] = R.soft;
      ac[i * 3] = R.r * beamGain; ac[i * 3 + 1] = R.g * beamGain; ac[i * 3 + 2] = R.b * beamGain;

      const o = i * 12;
      ld[o] = R.x; ld[o + 1] = R.y; ld[o + 2] = R.z; ld[o + 3] = R.tan;
      ld[o + 4] = R.dx; ld[o + 5] = R.dy; ld[o + 6] = R.dz; ld[o + 7] = R.soft;
      ld[o + 8] = R.r * 3.2; ld[o + 9] = R.g * 3.2; ld[o + 10] = R.b * 3.2; ld[o + 11] = R.I;

      // lens glare: strongest looking down the barrel
      const tx = cam.x - R.x, ty = cam.y - R.y, tz = cam.z - R.z, tl = Math.hypot(tx, ty, tz) || 1;
      const facing = Math.max(0, (R.dx * tx + R.dy * ty + R.dz * tz) / tl);
      const cone = Math.max(0, (facing - Math.cos(Math.atan(R.tan) * 2.2)) / (1 - Math.cos(Math.atan(R.tan) * 2.2) + 1e-4));
      const gl = 0.35 + 5 * cone * cone + 0.6 * Math.pow(facing, 6);
      this.gPos[i * 3] = R.x + R.dx * 0.05; this.gPos[i * 3 + 1] = R.y + R.dy * 0.05; this.gPos[i * 3 + 2] = R.z + R.dz * 0.05;
      this.gCol[i * 3] = R.r * gl; this.gCol[i * 3 + 1] = R.g * gl; this.gCol[i * 3 + 2] = R.b * gl;
      this.gSize[i] = R.I > 0.002 ? 0.55 + 1.6 * cone : 0;
    }
    this.beams.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.bases.instanceMatrix.needsUpdate = true;
    this.aBeam.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.lightTex.needsUpdate = true;
    const ga = this.glow.geometry.attributes;
    ga.position.needsUpdate = ga.aColor.needsUpdate = ga.aSize.needsUpdate = true;

    this.beamMat.uniforms.uTime.value = E.time;
    this.beamMat.uniforms.uHaze.value = E.m.haze;
    this.beamMat.uniforms.uTexture.value = opts.hazeTexture ?? 0.75;
    this.bloom.strength = (opts.bloom ?? 0.85) * 0.6;
    // auto-exposure, like a camera riding the iris: busy, bright looks are pulled down
    let load = 0;
    for (let i = 0; i < N; i++) { const R = E.render[i]; load += R.I * (0.4 + 0.6 * Math.min(1, R.tan * 4)); }
    const target = Math.max(0.5, Math.min(1.15, 1.25 / (1 + load * 0.025)));
    this.exposure = (this.exposure ?? target) + (target - (this.exposure ?? target)) * Math.min(1, dt * 1.5);
    this.renderer.toneMappingExposure = this.exposure * (opts.exposure ?? 1);

    this.preRender?.(dt, opts);
    this.updateLasers(opts.lasers);
    this.composer.render(dt);
  }
}
