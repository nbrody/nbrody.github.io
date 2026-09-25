// devices.js — optional jam-band lighting devices that sit on top of the rig and any show:
//
//   LED pixel tubes   — a wall upstage, bars on the truss sticks, columns, or a canopy
//   Mirror balls      — one to three, with pin spots, rays through the haze and
//                       spots sweeping the floor
//   Blinders, strobes — tungsten audience blinders (slow warm decay) and strobe bars
//                       that light the whole stage for an instant
//   Liquid light show — an oil-and-water projection on an upstage screen, 1960s style
//   CO₂ jets          — cryo blasts along the downstage edge
//
// Nothing pops in or out. Each device has a *presence* that travels toward its
// switch: tubes rise out of the deck (or grow out of the truss, or fly in over the
// crowd), balls fly in from the grid, blinders, strobes and CO₂ nozzles lift out of
// the deck, and the projection screen flies in. Only once in place do they light.
// So a scene that adds or removes devices still moves smoothly.
//
// Everything follows the masters (grand, blackout, flash) and can be hit by the
// show's drops (sections that cut in hard), the beat, the show's strobes, or a MIDI
// crash cymbal.

import * as THREE from 'three';
import { DECK_Y, DECK_FRONT, DECK_BACK, GRID_Y, POD_COUNT, fixtureFrame, landing, hash } from './layout.js';
import { hs2rgb, hexHS } from './engine.js';

const TAU = Math.PI * 2;
const PIX = 24, MAX_TUBES = 32, TUBE_R = 0.055;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const between = (a, b, x) => smooth((x - a) / (b - a));
/** Move `cur` toward `target` taking `secs` for the full 0↔1 trip. */
const approach = (cur, target, secs, dt) => cur + Math.max(-dt / secs, Math.min(dt / secs, target - cur));

export const TUBE_LAYOUTS = {
  curtain: 'Wall of tubes upstage',
  truss: 'Bars on the truss sticks',
  columns: 'Standing columns around the stage',
  canopy: 'Canopy over the crowd',
};
export const TUBE_LOOKS = {
  follow: 'Follow the rig', rain: 'Rain drips', wave: 'Rainbow wave', chase: 'Bar chase on the beat',
  sparkle: 'Sparkle', meter: 'Level meter (show / MIDI)', flash: 'Flash on the beat',
};
export const DEVICE_COLORS = { rig: 'The rig’s colour', rainbow: 'Rainbow', white: 'White', fixed: 'One colour' };
export const HIT_MODES = {
  off: 'Manual only', drops: 'On the drops', phrase: 'Every 4 bars', beat: 'Every beat', show: 'With the show’s strobes',
};
export const LIQUID_PALETTES = { classic: 'Classic (magenta, amber, cyan)', rig: 'Follow the rig', acid: 'Acid (drifting hues)' };

// LED tubes are drawn like the lasers: a camera-facing ribbon whose shading comes
// from each pixel's exact screen-space distance to the tube's axis. A real 11 cm
// cylinder is under a pixel wide across the room, so it shimmered and its 24 pixel
// seams aliased into moiré. Here the tube never gets thinner than ~2 px (a thinner
// one fades instead), its edges are anti-aliased, the position along the tube is
// perspective-correct, and the pixel seams soften once they're finer than the screen.
const TUBE_VERT = /* glsl */ `
  attribute vec3 aA; attribute vec3 aB; attribute float aR; attribute float aIdx;
  uniform vec2 uRes; uniform float uMinPx;
  varying float vId;
  flat varying vec4 vSeg;  // ends of the tube in framebuffer pixels
  flat varying vec2 vW;    // clip-space w at the ends, for perspective-correct position
  flat varying vec2 vT;    // position along the tube at the (near-clipped) ends
  flat varying vec2 vRad;  // tube radius in pixels at the ends
  void main() {
    vec3 va = (viewMatrix * vec4(aA, 1.0)).xyz, vb = (viewMatrix * vec4(aB, 1.0)).xyz;
    float ta = 0.0, tb = 1.0, near = -0.15;
    if ((va.z > near && vb.z > near) || aR <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    if (va.z > near) { float k = (va.z - near) / (va.z - vb.z); va = mix(va, vb, k); ta = k; }
    if (vb.z > near) { float k = (vb.z - near) / (vb.z - va.z); vb = mix(vb, va, k); tb = 1.0 - k; }
    vec4 ca = projectionMatrix * vec4(va, 1.0), cb = projectionMatrix * vec4(vb, 1.0);
    vec2 sa = ca.xy / ca.w * uRes, sb = cb.xy / cb.w * uRes;
    vec2 d = sb - sa; float l = length(d); d = l > 1e-4 ? d / l : vec2(1.0, 0.0);
    vec2 nrm = vec2(-d.y, d.x);
    float ra = aR * projectionMatrix[1][1] * uRes.y / ca.w, rb = aR * projectionMatrix[1][1] * uRes.y / cb.w;
    float W = max(max(ra, rb), uMinPx) + 2.0;
    vec4 c = mix(ca, cb, position.x);
    c.xy += (nrm * position.y + d * (position.x * 2.0 - 1.0)) * W / uRes * c.w;
    gl_Position = c;
    vSeg = vec4(sa + uRes, sb + uRes); vW = vec2(ca.w, cb.w); vT = vec2(ta, tb); vRad = vec2(ra, rb); vId = aIdx;
  }
`;
const TUBE_FRAG = /* glsl */ `
  uniform sampler2D uTex; uniform float uPix; uniform float uMinPx;
  varying float vId;
  flat varying vec4 vSeg; flat varying vec2 vW; flat varying vec2 vT; flat varying vec2 vRad;
  void main() {
    vec2 a = vSeg.xy, ab = vSeg.zw - vSeg.xy, p = gl_FragCoord.xy - a;
    float h = clamp(dot(p, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(p - ab * h);
    float s = (h / vW.y) / ((1.0 - h) / vW.x + h / vW.y);
    float u = mix(vT.x, vT.y, s), r = mix(vRad.x, vRad.y, s);
    float rv = max(r, uMinPx);
    float alpha = clamp(rv + 0.5 - d, 0.0, 1.0) * min(1.0, r / rv);
    if (alpha < 0.004) discard;
    // pixels along the tube: crisp edges up close, blended once a pixel is sub-pixel on screen
    float y = u * uPix - 0.5, fw = max(fwidth(y), 1e-4), k = floor(y);
    int row = int(vId + 0.5), last = int(uPix) - 1;
    vec3 c0 = texelFetch(uTex, ivec2(clamp(int(k), 0, last), row), 0).rgb;
    vec3 c1 = texelFetch(uTex, ivec2(clamp(int(k) + 1, 0, last), row), 0).rgb;
    vec3 col = mix(c0, c1, clamp((y - k - 0.5) / fw + 0.5, 0.0, 1.0));
    float e = abs(fract(y) - 0.5);
    float seam = 1.0 - 0.3 * (1.0 - smoothstep(0.1, 0.4, fw)) * (1.0 - smoothstep(0.0, max(0.12, fw), e));
    float across = clamp(d / rv, 0.0, 1.0);
    float diffuser = 0.78 + 0.22 * (1.0 - across * across) + 0.25 * exp(-across * across * 8.0);
    gl_FragColor = vec4(col * 2.2 * diffuser * seam + vec3(0.03, 0.03, 0.035), alpha);
  }
`;

const BALL_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vW; varying vec3 vO;
  void main() { vO = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const BALL_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uLight; uniform float uLevel;
  varying vec3 vN; varying vec3 vW; varying vec3 vO;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 o = normalize(vO);
    vec2 sph = vec2(atan(o.z, o.x) / 6.2831853 * 44.0, acos(o.y) / 3.14159 * 22.0);
    vec2 cell = floor(sph), f = fract(sph);
    float grout = smoothstep(0.0, 0.08, f.x) * smoothstep(0.0, 0.08, 1.0 - f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(0.0, 0.08, 1.0 - f.y);
    vec3 n = normalize(vN + (vec3(h2(cell), h2(cell + 7.1), h2(cell + 3.3)) - 0.5) * 0.35);
    vec3 V = normalize(cameraPosition - vW);
    float glint = pow(max(dot(reflect(-uLight, n), V), 0.0), 60.0) * 6.0;
    vec3 col = vec3(0.05) + uColor * glint * uLevel + uColor * 0.08 * uLevel;
    gl_FragColor = vec4(col * grout + vec3(0.01), 1.0);
  }
`;

const LIQUID_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LIQUID_FRAG = /* glsl */ `
  uniform float uTime; uniform float uLevel; uniform float uPulse; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec2 uAspect;
  varying vec2 vUv;
  vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = h22(i).x, b = h22(i + vec2(1, 0)).x, c = h22(i + vec2(0, 1)).x, d = h22(i + vec2(1, 1)).x;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
  void main() {
    vec2 p = (vUv - 0.5) * uAspect * 3.0;
    float t = uTime;
    // two immiscible dyes pushed around by a slow warped flow
    vec2 q = vec2(fbm(p + t * 0.05), fbm(p - t * 0.04 + 5.2));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.07), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.06));
    float dye = fbm(p + 3.5 * r);
    float oil = smoothstep(0.45, 0.62, fbm(p * 1.3 + 2.0 * r - t * 0.03));
    // bubbles: cells whose walls glow
    vec2 g = p * 2.2 + r * 1.5;
    vec2 gi = floor(g), gf = fract(g);
    float d1 = 9.0, d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y), c = h22(gi + o);
      c = 0.5 + 0.45 * sin(t * 0.3 + 6.28 * c);
      float d = length(o + c - gf);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    float wall = 1.0 - smoothstep(0.02, 0.12, d2 - d1);
    vec3 col = mix(uA, uB, smoothstep(0.3, 0.7, dye));
    col = mix(col, uC, oil * 0.8);
    col *= 0.55 + 0.45 * smoothstep(0.2, 0.8, dye) + wall * 0.6;
    float vign = smoothstep(0.0, 0.12, vUv.x) * smoothstep(0.0, 0.12, 1.0 - vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(0.0, 0.1, 1.0 - vUv.y);
    gl_FragColor = vec4(col * uLevel * (0.8 + 0.4 * uPulse) * vign * 0.9, 1.0);
  }
`;

const SMOKE_VERT = /* glsl */ `
  attribute float aSize; attribute float aAlpha;
  uniform float uScale;
  varying float vA;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.5, -mv.z); vA = aAlpha; }
`;
const SMOKE_FRAG = /* glsl */ `
  uniform vec3 uTint;
  varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = (1.0 - d * d) * vA; gl_FragColor = vec4(uTint * a, 1.0); }
`;

// ——— layouts ———
// mode: how a tube arrives. 'rise' out of the deck, 'drop' in from the grid, 'grow' out of the truss.
function tubeLayout(kind) {
  const L = [];
  if (kind === 'curtain') {
    for (let i = 0; i < 24; i++) { const x = -11 + (i * 22) / 23; L.push({ a: [x, DECK_Y + 0.15, -10.3], b: [x, DECK_Y + 3.4, -10.3], mode: 'rise', key: Math.abs(x) / 11 }); }
  } else if (kind === 'columns') {
    for (let i = 0; i < 8; i++) { const x = -10.4 + (i * 20.8) / 7; L.push({ a: [x, DECK_Y, DECK_FRONT - 0.3], b: [x, DECK_Y + 2.4, DECK_FRONT - 0.3], mode: 'rise', key: Math.abs(x) / 11 }); }
    for (const s of [-1, 1]) for (const [k, z] of [-1.5, -4.5, -7.5].entries()) L.push({ a: [s * 11.1, DECK_Y, z], b: [s * 11.1, DECK_Y + 3.2, z], mode: 'rise', key: 0.6 + k * 0.2 });
  } else if (kind === 'canopy') {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
      const x = -10 + c * 4 + (r % 2) * 1.2, z = 6 + r * 3.4, y = 9.2 + Math.sin(c * 1.3 + r) * 0.5;
      L.push({ a: [x - 1.3, y, z], b: [x + 1.3, y + 0.15, z], mode: 'drop', key: r / 4 });
    }
  }
  return L; // 'truss' is computed every frame from the sticks
}

export class Devices {
  constructor(rig, engine) {
    this.rig = rig; this.e = engine;
    this.scene = rig.scene;
    this.o = {
      tubes: false, tubeLayout: 'truss', tubeLook: 'follow', tubeColor: 'rig', tubeFixed: '#ff3cc8', tubeLevel: 0.9, tubeSpeed: 1,
      balls: 0, ballColor: 'white', ballFixed: '#ffffff', ballLevel: 0.8, ballSpin: 2, ballRays: 90,
      blinders: false, blinderMode: 'drops', blinderLevel: 1, strobes: false, strobeMode: 'show', strobeRate: 10, strobeLevel: 1,
      liquid: false, liquidPalette: 'classic', liquidLevel: 0.7, liquidSpeed: 1, liquidPulse: true,
      co2: false, co2Mode: 'drops', crash: true,
    };
    // presence of each device: 0 = stowed (in the deck / up in the grid), 1 = in place
    this.pres = { tubes: 0, blinders: 0, strobes: 0, liquid: 0, co2: 0 };
    this.t = 0;
    this.queued = {};
    this.lastSection = -1; this.lastBeat = 0;
    this.buildTubes(); this.buildBalls(); this.buildBlinders(); this.buildLiquid(); this.buildCO2();
    this.tubeShown = this.o.tubeLayout;
    this.tubes = tubeLayout(this.tubeShown);
  }

  // ——— builders ———
  buildTubes() {
    this.tubeData = new Float32Array(MAX_TUBES * PIX * 4);
    this.tubeTex = new THREE.DataTexture(this.tubeData, PIX, MAX_TUBES, THREE.RGBAFormat, THREE.FloatType);
    this.tubeTex.minFilter = this.tubeTex.magFilter = THREE.NearestFilter;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (n, fill) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TUBES * n), n); if (fill) a.array.set(fill); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.tA = attr(3); this.tB = attr(3); this.tR = attr(1);
    geo.setAttribute('aA', this.tA); geo.setAttribute('aB', this.tB); geo.setAttribute('aR', this.tR);
    geo.setAttribute('aIdx', attr(1, Array.from({ length: MAX_TUBES }, (_, i) => i)));
    geo.instanceCount = 0;
    this.tubeMat = new THREE.ShaderMaterial({
      vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG,
      uniforms: { uTex: { value: this.tubeTex }, uPix: { value: PIX }, uRes: { value: new THREE.Vector2(1, 1) }, uMinPx: { value: 0.9 } },
      transparent: true, depthWrite: true,
    });
    (this.rig.ribbons ??= []).push(this.tubeMat); // the renderer keeps uRes in step with the canvas
    if (this.rig.resUniform) this.tubeMat.uniforms.uRes.value.copy(this.rig.resUniform);
    this.tubeMesh = new THREE.Mesh(geo, this.tubeMat);
    this.tubeMesh.frustumCulled = false;
    this.tubeMesh.renderOrder = 5;
    this.tubeMesh.visible = false;
    this.scene.add(this.tubeMesh);
  }

  /** Ask for a tube layout. Tubes already out go away first, then the new ones arrive. */
  setTubeLayout(kind) { this.o.tubeLayout = kind; }

  buildBalls() {
    this.ballDefs = [[0, 11.2, -2.2], [-8, 10.2, 9], [8, 10.2, 9]].map((p) => ({ p, pres: 0 }));
    this.ballMats = []; this.ballGroups = [];
    for (const b of this.ballDefs) {
      const g = new THREE.Group();
      const mat = new THREE.ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader: BALL_FRAG, uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uLight: { value: new THREE.Vector3(0, 1, 0.3).normalize() }, uLevel: { value: 1 } } });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), mat);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 10), this.rig.lit({ albedo: [0.1, 0.1, 0.1] }));
      motor.position.y = 0.75;
      g.add(ball, motor);
      g.userData.ball = ball;
      g.visible = false;
      this.scene.add(g);
      this.ballMats.push(mat); this.ballGroups.push(g);
    }
    const cg = new THREE.BufferGeometry();
    this.cablePos = new Float32Array(3 * 6);
    cg.setAttribute('position', new THREE.BufferAttribute(this.cablePos, 3));
    this.cables = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x33363d }));
    this.cables.frustumCulled = false;
    this.scene.add(this.cables);
    this.rays = this.rig.makeRibbons(3 * 220, 3);
    this.pins = this.rig.makeRibbons(6, 7);
    const dg = new THREE.BufferGeometry();
    this.dotPos = new Float32Array(3 * 220 * 3); this.dotCol = new Float32Array(3 * 220 * 3); this.dotSize = new Float32Array(3 * 220);
    dg.setAttribute('position', new THREE.BufferAttribute(this.dotPos, 3));
    dg.setAttribute('aColor', new THREE.BufferAttribute(this.dotCol, 3));
    dg.setAttribute('aSize', new THREE.BufferAttribute(this.dotSize, 1));
    this.dots = new THREE.Points(dg, this.rig.glowMat);
    this.dots.frustumCulled = false;
    this.scene.add(this.dots);
    // Fibonacci directions: reflections go everywhere except straight back up at the pin spot
    this.fib = [];
    const n = 220;
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
      if (y < 0.55) this.fib.push([Math.cos(a) * r, y, Math.sin(a) * r, hash(i * 3.7)]);
    }
  }

  buildBlinders() {
    const housing = this.rig.lit({ albedo: [0.07, 0.07, 0.08], spec: 0.3 });
    this.blinderDefs = [-9.5, -5.7, -1.9, 1.9, 5.7, 9.5].map((x) => ({ x, y: DECK_Y + 0.42, z: DECK_FRONT - 0.35, env: 0 }));
    this.strobeDefs = [[-7.6, DECK_FRONT - 0.35], [-3.8, DECK_FRONT - 0.35], [3.8, DECK_FRONT - 0.35], [7.6, DECK_FRONT - 0.35],
      [-6, -10.25], [-2, -10.25], [2, -10.25], [6, -10.25]].map(([x, z]) => ({ x, y: DECK_Y + 0.2, z, flash: 0 }));
    this.blinderGroup = new THREE.Group();
    this.lampMats = [];
    for (const b of this.blinderDefs) {
      const box = (b.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.22), housing));
      box.position.set(b.x, b.y, b.z);
      box.rotation.x = -0.18;
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      this.lampMats.push(mat);
      for (const [dx, dy] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), mat);
        lamp.position.set(dx, dy, 0.115);
        box.add(lamp);
      }
      this.blinderGroup.add(box);
    }
    this.blinderGroup.visible = false;
    this.scene.add(this.blinderGroup);
    this.strobeGroup = new THREE.Group();
    this.strobeFaceMats = [];
    for (const s of this.strobeDefs) {
      const box = (s.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.22), housing));
      box.position.set(s.x, s.y, s.z);
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), mat);
      face.position.z = 0.115;
      box.add(face);
      this.strobeFaceMats.push(mat);
      this.strobeGroup.add(box);
    }
    this.strobeGroup.visible = false;
    this.scene.add(this.strobeGroup);
    // big glows: 6 blinders × 4 lamps + 8 strobes
    const gg = new THREE.BufferGeometry();
    const n = 6 * 4 + 8;
    this.gPos = new Float32Array(n * 3); this.gCol = new Float32Array(n * 3); this.gSize = new Float32Array(n);
    gg.setAttribute('position', new THREE.BufferAttribute(this.gPos, 3));
    gg.setAttribute('aColor', new THREE.BufferAttribute(this.gCol, 3));
    gg.setAttribute('aSize', new THREE.BufferAttribute(this.gSize, 1));
    this.glows = new THREE.Points(gg, this.rig.glowMat);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 14;
    this.scene.add(this.glows);
  }

  buildLiquid() {
    const w = 21, h = 8.5;
    this.liquidMat = new THREE.ShaderMaterial({
      vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG,
      uniforms: { uTime: { value: 0 }, uLevel: { value: 0.7 }, uPulse: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() }, uAspect: { value: new THREE.Vector2(w / h, 1) } },
    });
    this.liquid = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.liquidMat);
    this.liquidY = DECK_Y + 0.4 + h / 2;
    this.liquid.position.set(0, this.liquidY, DECK_BACK - 0.35);
    this.liquid.visible = false;
    this.scene.add(this.liquid);
  }

  buildCO2() {
    this.jets = [-10, -6, -2, 2, 6, 10].map((x) => ({ x, y: DECK_Y + 0.15, z: DECK_FRONT - 0.6, t: 0 }));
    const nozzle = this.rig.lit({ albedo: [0.12, 0.12, 0.13], spec: 0.6 });
    this.jetGroup = new THREE.Group();
    for (const j of this.jets) {
      const m = (j.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), nozzle));
      m.position.set(j.x, j.y, j.z);
      this.jetGroup.add(m);
    }
    this.jetGroup.visible = false;
    this.scene.add(this.jetGroup);
    const N = (this.NP = 1600);
    this.p = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), age: new Float32Array(N).fill(99), life: new Float32Array(N).fill(1), size: new Float32Array(N), alpha: new Float32Array(N) };
    this.pNext = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.p.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.p.alpha, 1));
    this.smokeMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      uniforms: { uScale: this.rig.glowMat.uniforms.uScale, uTint: { value: new THREE.Color(0.5, 0.5, 0.55) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.smoke = new THREE.Points(g, this.smokeMat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 9;
    this.scene.add(this.smoke);
  }

  // ——— triggers ———
  // a hit asked for while the device is still rising waits until it's in place
  blast() { if (this.pres.co2 > 0.95) for (const j of this.jets) j.t = 1.1; else if (this.o.co2) this.queued.co2 = true; }
  hitBlinders() { if (this.pres.blinders > 0.95) for (const b of this.blinderDefs) b.env = 1; else if (this.o.blinders) this.queued.blinders = true; }
  burst(sec = 1.2) { this.burstT = sec; this.t0 = this.t; }
  /** Fly the balls out and back in again: the classic "drop the ball". */
  redropBalls() { for (const b of this.ballDefs) b.pres = 0; }
  /** Put every device straight into place (thumbnails, links): no travel. */
  settle() {
    const o = this.o;
    this.tubeShown = o.tubeLayout;
    this.tubes = tubeLayout(this.tubeShown);
    this.pres = { tubes: o.tubes ? 1 : 0, blinders: o.blinders ? 1 : 0, strobes: o.strobes ? 1 : 0, liquid: o.liquid ? 1 : 0, co2: o.co2 ? 1 : 0 };
    this.ballDefs.forEach((b, i) => { b.pres = i < o.balls ? 1 : 0; });
  }

  /** Colour helper shared by tubes and balls. */
  colorOf(mode, fixed, k, rig, out) {
    if (mode === 'white') { out.r = out.g = out.b = 1; return out; }
    if (mode === 'fixed') return hs2rgb(...hexHS(fixed), out);
    if (mode === 'rainbow') return hs2rgb(k * 360 + this.t * 30, 1, out);
    out.r = rig[0]; out.g = rig[1]; out.b = rig[2];
    return out;
  }

  rigColor() {
    let best = null, bi = 0.05;
    for (const R of this.e.render) if (R.I > bi) { bi = R.I; best = R; }
    if (!best) return [0.4, 0.5, 1];
    const m = Math.max(best.r, best.g, best.b) || 1;
    return [best.r / m, best.g / m, best.b / m];
  }

  // ——— the frame ———
  update(dt) {
    const E = this.e, o = this.o, m = E.m, P = this.pres;
    this.t += dt;
    const master = m.blackout ? 0 : m.grand;
    const rig = this.rigColor();

    // presence: every device travels toward its switch
    P.blinders = approach(P.blinders, o.blinders ? 1 : 0, 0.7, dt);
    P.strobes = approach(P.strobes, o.strobes ? 1 : 0, 0.7, dt);
    P.liquid = approach(P.liquid, o.liquid ? 1 : 0, 2.4, dt);
    P.co2 = approach(P.co2, o.co2 ? 1 : 0, 0.6, dt);
    if (this.queued.co2 && P.co2 > 0.95) { this.queued.co2 = false; this.blast(); }
    if (this.queued.blinders && P.blinders > 0.95) { this.queued.blinders = false; this.hitBlinders(); }
    if (!o.co2) this.queued.co2 = false;
    if (!o.blinders) this.queued.blinders = false;

    // events: drops (sections that cut in hard), beats, phrases, the show's strobes, MIDI crash
    const events = { drop: false, beat: false, phrase: false, crash: false };
    if (E.show && E.sectionIndex !== this.lastSection) {
      const sec = E.show.sections[E.sectionIndex];
      if (this.lastSection >= 0 && sec && (sec.f ?? 4) <= 0.6) events.drop = true;
      this.lastSection = E.sectionIndex;
    }
    const b = Math.floor(E.beat);
    if (b !== this.lastBeat) { events.beat = true; if (b % 16 === 0) events.phrase = true; this.lastBeat = b; }
    const NL = E.noteLayer;
    if (o.crash && NL?.on) for (const v of NL.voices.values()) if (v.drum && [49, 52, 55, 57].includes(v.note) && v.t <= dt + 1e-6) events.crash = true;
    const showStrobe = E.out.reduce((a, s) => Math.max(a, s.dim > 0.2 ? s.strobe : 0), 0);
    const fires = (mode) => events.crash || (mode === 'drops' && events.drop) || (mode === 'phrase' && events.phrase) || (mode === 'beat' && events.beat);

    let fill = 0, fillWarm = 0;
    this.updateTubes(dt, master, rig);
    this.updateBalls(dt, master, rig);

    // blinders: tungsten — fast attack, slow warm decay. They lift out of the deck lip.
    const eb = smooth(P.blinders), blOn = between(0.85, 1, P.blinders);
    this.blinderGroup.visible = P.blinders > 0.001;
    if (o.blinders && fires(o.blinderMode)) this.hitBlinders();
    if (m.flash && P.blinders > 0.95) for (const d of this.blinderDefs) d.env = Math.max(d.env, m.flash);
    let gi = 0;
    this.blinderDefs.forEach((d, i) => {
      const y = d.y - (1 - eb) * 0.95;
      d.mesh.position.y = y;
      d.env = P.blinders > 0.95 ? d.env * Math.exp(-dt / 0.38) : 0;
      const L = d.env * o.blinderLevel * master * blOn;
      const warm = [1, 0.35 + 0.4 * d.env, 0.08 + 0.32 * d.env];
      this.lampMats[i].color.setRGB(warm[0] * (0.05 + L * 3), warm[1] * (0.05 + L * 3), warm[2] * (0.05 + L * 3));
      fillWarm += L;
      for (const [dx, dy] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        const k = gi++;
        this.gPos.set([d.x + dx, y + dy, d.z + 0.2], k * 3);
        this.gCol.set([warm[0] * L * 2.5, warm[1] * L * 2.5, warm[2] * L * 2.5], k * 3);
        this.gSize[k] = L > 0.01 ? 1.2 + L * 2.5 : 0;
      }
    });

    // strobes: 20 ms flashes — with the show, on the beat, or all on a burst. They lift out too.
    const es = smooth(P.strobes), stOn = P.strobes > 0.95;
    this.strobeGroup.visible = P.strobes > 0.001;
    this.burstT = Math.max(0, (this.burstT || 0) - dt);
    if (o.strobes && fires(o.strobeMode)) this.burst(o.strobeMode === 'beat' ? 0.05 : 1.0);
    const showOn = o.strobeMode === 'show' && showStrobe > 0.02;
    const active = stOn && (this.burstT > 0 || m.strobeHold || showOn);
    const rate = showOn ? 1.5 + showStrobe * 18 : o.strobeRate;
    const ph = (this.t - (this.t0 || 0)) * rate;
    const on = active && ph - Math.floor(ph) < 0.22;
    this.strobeDefs.forEach((s, i) => {
      const y = s.y - (1 - es) * 0.55;
      s.mesh.position.y = y;
      // long bursts alternate upstage/downstage banks; everything else fires together
      const bank = this.burstT > 0.2 && !m.strobeHold ? (Math.floor(ph) + (i < 4 ? 0 : 1)) % 2 === 0 : true;
      s.flash = on && bank ? o.strobeLevel * master : 0;
      this.strobeFaceMats[i].color.setScalar(0.03 + s.flash * 4);
      fill += s.flash;
      const k = gi++;
      this.gPos.set([s.x, y, s.z + 0.2], k * 3);
      this.gCol.set([s.flash * 3, s.flash * 3, s.flash * 3.2], k * 3);
      this.gSize[k] = s.flash > 0 ? 3.5 : 0;
    });
    const ga = this.glows.geometry.attributes;
    ga.position.needsUpdate = ga.aColor.needsUpdate = ga.aSize.needsUpdate = true;
    this.glows.visible = this.blinderGroup.visible || this.strobeGroup.visible;
    // the flash fills the whole stage for an instant
    this.rig.shared.uFill.value.setRGB(fill * 0.06 + fillWarm * 0.05, fill * 0.06 + fillWarm * 0.03, fill * 0.065 + fillWarm * 0.012);

    this.updateLiquid(dt, master, rig);
    this.updateCO2(dt, master, rig, o.co2 && fires(o.co2Mode));
  }

  updateTubes(dt, master, rig) {
    const o = this.o, E = this.e, P = this.pres;
    // a new layout waits for the old tubes to go away, then arrives
    const want = o.tubes && this.tubeShown === o.tubeLayout ? 1 : 0;
    P.tubes = approach(P.tubes, want, 1.3, dt);
    if (P.tubes <= 0 && this.tubeShown !== o.tubeLayout) { this.tubeShown = o.tubeLayout; this.tubes = tubeLayout(this.tubeShown); }
    const geo = this.tubeMesh.geometry;
    if (P.tubes <= 0.0005) { this.tubeMesh.visible = false; geo.instanceCount = 0; return; }
    this.tubeMesh.visible = true;

    let list = this.tubes;
    if (this.tubeShown === 'truss') {
      list = [];
      const fr = {};
      for (let p = 0; p < POD_COUNT; p++) for (const s of [2, 7]) {
        const f = E.fixtures[p * 10 + s];
        fixtureFrame(f, E, fr);
        const R = fr.m, up = [R[1], R[4], R[7]], ax = [R[0], R[3], R[6]], lift = 0.9;
        const c = [fr.x + up[0] * lift, fr.y + up[1] * lift, fr.z + up[2] * lift];
        list.push({ c, ax, mode: 'grow', key: p / (POD_COUNT - 1), fix: f.i });
      }
    }
    const n = Math.min(MAX_TUBES, list.length), beat = E.beat, t = this.t * o.tubeSpeed;
    const NL = E.noteLayer;
    let energy = 0;
    for (const R of E.render) energy += R.I;
    energy = Math.min(1, energy / 30);
    if (NL?.on) { let x = 0; for (let i = 0; i < NL.I.length; i++) x = Math.max(x, NL.I[i]); energy = x; }
    const c = { r: 0, g: 0, b: 0 }, D = this.tubeData, A = this.tA.array, B = this.tB.array, RR = this.tR.array;
    const STAGGER = 0.7;
    for (let i = 0; i < n; i++) {
      const T = list[i];
      // each tube travels on its own slightly staggered clock: centre / front first
      const ei = clamp01(P.tubes * (1 + STAGGER) - STAGGER * T.key), e = smooth(ei);
      let a, bb;
      if (T.mode === 'grow') {
        const h = 0.75 * e;
        a = [T.c[0] - T.ax[0] * h, T.c[1] - T.ax[1] * h, T.c[2] - T.ax[2] * h];
        bb = [T.c[0] + T.ax[0] * h, T.c[1] + T.ax[1] * h, T.c[2] + T.ax[2] * h];
      } else if (T.mode === 'drop') {
        const dy = (1 - e) * ((this.rig.gridY ?? GRID_Y) - 1 - T.a[1]);
        a = [T.a[0], T.a[1] + dy, T.a[2]]; bb = [T.b[0], T.b[1] + dy, T.b[2]];
      } else { // rise out of the deck: fully below it when stowed
        const dy = -(1 - e) * (T.b[1] - T.a[1] + 0.35);
        a = [T.a[0], T.a[1] + dy, T.a[2]]; bb = [T.b[0], T.b[1] + dy, T.b[2]];
      }
      A.set(a, i * 3); B.set(bb, i * 3);
      RR[i] = ei > 0.002 ? TUBE_R : 0;
      const lit = between(0.7, 1, ei); // pixels come up once the tube is nearly in place
      // nearest head for 'follow'
      let src = null;
      if (T.fix !== undefined) src = E.render[T.fix];
      else {
        let bd = 1e9;
        const cx = (T.a[0] + T.b[0]) / 2;
        for (const R of E.render) { const d = Math.abs(R.x - cx) + (R.I > 0.05 ? 0 : 50); if (d < bd) { bd = d; src = R; } }
      }
      const k = i / Math.max(1, n - 1);
      this.colorOf(o.tubeColor, o.tubeFixed, k, rig, c);
      for (let j = 0; j < PIX; j++) {
        const u = j / (PIX - 1);
        let L = 0, r = c.r, g = c.g, bl = c.b;
        switch (o.tubeLook) {
          case 'rain': {
            for (let d = 0; d < 2; d++) {
              const pos = 1 - ((t * (0.35 + hash(i * 1.3 + d) * 0.3) + hash(i * 7.7 + d * 3.1)) % 1);
              const x = u - pos;
              L = Math.max(L, x >= 0 ? Math.exp(-x * 7) : Math.exp(x * 60));
            }
            break;
          }
          case 'wave': { hs2rgb(360 * (u * 0.5 + k * 0.8 - t * 0.25), 1, c); r = c.r; g = c.g; bl = c.b; L = 0.75 + 0.25 * Math.sin(u * 8 - t * 3 + i); break; }
          case 'chase': { const bar = Math.floor(beat * 2) % n; const d = Math.min(Math.abs(i - bar), n - Math.abs(i - bar)); L = Math.exp(-d * 1.4); break; }
          case 'sparkle': L = hash(i * 31.7 + j * 7.3 + Math.floor(this.t * 14)) > 0.9 ? 1 : 0.02; if (L > 0.5) { r = g = bl = 1; } break;
          case 'meter': { L = u < energy ? 1 : 0.03; hs2rgb(120 - u * 120, 1, c); r = c.r; g = c.g; bl = c.b; break; }
          case 'flash': L = Math.exp(-(beat - Math.floor(beat)) * 9); break;
          default: { // follow the nearest head
            const I = src ? src.I : 0;
            L = I * (0.65 + 0.35 * Math.sin(u * 5 + t * 2 + i));
            if (src && I > 0.02 && o.tubeColor === 'rig') { r = src.r / I; g = src.g / I; bl = src.b / I; }
          }
        }
        const s = L * o.tubeLevel * master * lit * (E.m.flash ? 1.5 : 1), idx = (i * PIX + j) * 4;
        D[idx] = r * s; D[idx + 1] = g * s; D[idx + 2] = bl * s; D[idx + 3] = 1;
      }
    }
    geo.instanceCount = n;
    this.tA.needsUpdate = this.tB.needsUpdate = this.tR.needsUpdate = true;
    this.tubeTex.needsUpdate = true;
  }

  updateBalls(dt, master, rig) {
    const o = this.o, E = this.e;
    let ray = 0, pin = 0, dot = 0, any = false;
    const c = { r: 1, g: 1, b: 1 };
    const R = this.rays, P = this.pins, grid = this.rig.gridY ?? GRID_Y, top = grid - 1.5;
    this.ballGroups.forEach((g, bi) => {
      const B = this.ballDefs[bi];
      // balls fly in from the grid and back out, about three seconds each way
      B.pres = approach(B.pres, bi < o.balls ? 1 : 0, 3, dt);
      g.visible = B.pres > 0.001;
      if (!g.visible) { this.cablePos.fill(0, bi * 6, bi * 6 + 6); return; }
      any = true;
      const y = top + (B.p[1] - top) * smooth(B.pres);
      g.position.set(B.p[0], y, B.p[2]);
      const spin = this.t * (o.ballSpin / 60) * TAU;
      g.userData.ball.rotation.y = spin;
      this.cablePos.set([B.p[0], y + 0.85, B.p[2], B.p[0], grid, B.p[2]], bi * 6);
      const level = o.ballLevel * master * (E.m.flash ? 1.4 : 1) * between(0.8, 1, B.pres); // pin spots open once it's down
      this.colorOf(o.ballColor, o.ballFixed, 0, rig, c);
      this.ballMats[bi].uniforms.uColor.value.setRGB(c.r, c.g, c.b);
      this.ballMats[bi].uniforms.uLevel.value = level;
      if (level < 0.002) return;
      // two pin spots from the grid
      for (const s of [-1, 1]) {
        const k = pin++;
        P.start.array.set([B.p[0] + s * 4, grid - 3, B.p[2] + 3], k * 3);
        P.end.array.set([B.p[0], y, B.p[2]], k * 3);
        P.color.array.set([c.r * level * 0.35, c.g * level * 0.35, c.b * level * 0.35], k * 3);
      }
      // reflections: rays through the haze, and spots sweeping the floor
      const cs = Math.cos(spin), sn = Math.sin(spin), count = Math.min(this.fib.length, Math.round(o.ballRays));
      for (let i = 0; i < count; i++) {
        const [fx, fy, fz, h] = this.fib[i];
        const dx = fx * cs - fz * sn, dz = fx * sn + fz * cs, dy = fy;
        const ox = B.p[0] + dx * 0.62, oy = y + dy * 0.62, oz = B.p[2] + dz * 0.62;
        const land = landing(E, ox, oy, oz, dx, dy, dz, 30, this.tmpLand || (this.tmpLand = {}));
        const L = land.L, hit = land.hit;
        if (o.ballColor === 'rainbow') hs2rgb(h * 360 + this.t * 20, 1, c);
        const tw = 0.55 + 0.45 * Math.sin(this.t * 3 + h * 40);
        const k = ray++;
        R.start.array.set([ox, oy, oz], k * 3);
        R.end.array.set([ox + dx * L, oy + dy * L, oz + dz * L], k * 3);
        R.color.array.set([c.r * level * 0.16 * tw, c.g * level * 0.16 * tw, c.b * level * 0.16 * tw], k * 3);
        if (hit) {
          const d = dot++;
          this.dotPos.set([ox + dx * L, oy + dy * L + 0.02, oz + dz * L], d * 3);
          this.dotCol.set([c.r * level * 0.9 * tw, c.g * level * 0.9 * tw, c.b * level * 0.9 * tw], d * 3);
          this.dotSize[d] = 0.28;
        }
      }
    });
    R.set(ray); P.set(pin);
    this.cables.visible = any;
    this.cables.geometry.attributes.position.needsUpdate = true;
    const dg = this.dots.geometry;
    dg.setDrawRange(0, dot);
    dg.attributes.position.needsUpdate = dg.attributes.aColor.needsUpdate = dg.attributes.aSize.needsUpdate = true;
    this.dots.visible = dot > 0;
    for (const mat of [R.mat, P.mat]) { mat.uniforms.uTime.value = this.t; mat.uniforms.uHaze.value = E.m.haze; }
  }

  updateLiquid(dt, master, rig) {
    const o = this.o, U = this.liquidMat.uniforms, pres = this.pres.liquid;
    // the screen flies in from above the grid; the projector opens once it's in place
    this.liquid.visible = pres > 0.001;
    if (!this.liquid.visible) return;
    this.liquid.position.y = this.liquidY + (1 - smooth(pres)) * 16;
    U.uTime.value += dt * o.liquidSpeed;
    U.uLevel.value = o.liquidLevel * master * between(0.85, 1, pres);
    const ph = this.e.beat - Math.floor(this.e.beat);
    U.uPulse.value = o.liquidPulse ? Math.exp(-ph * 5) : 0;
    const set = (u, h, s) => { const c = hs2rgb(h, s, { r: 0, g: 0, b: 0 }); u.value.setRGB(c.r, c.g, c.b); };
    if (o.liquidPalette === 'rig') {
      const [r, g, b] = rig;
      U.uA.value.setRGB(r, g, b);
      U.uB.value.setRGB(1 - r * 0.6, 1 - g * 0.6, 1 - b * 0.6);
      U.uC.value.setRGB(g, b, r);
    } else if (o.liquidPalette === 'acid') {
      const h = this.t * 12;
      set(U.uA, h, 1); set(U.uB, h + 130, 1); set(U.uC, h + 240, 0.9);
    } else {
      set(U.uA, 330, 1); set(U.uB, 38, 1); set(U.uC, 195, 1);
    }
  }

  updateCO2(dt, master, rig, fire) {
    const o = this.o, p = this.p, N = this.NP, pres = this.pres.co2;
    // nozzles lift out of the deck; they only fire once they're up
    this.jetGroup.visible = pres > 0.001;
    const e = smooth(pres);
    for (const j of this.jets) j.mesh.position.y = j.y - (1 - e) * 0.45;
    if (fire) this.blast();
    for (const j of this.jets) {
      if (pres < 0.95 || j.t <= 0) { j.t = pres < 0.95 ? 0 : j.t; continue; }
      j.t -= dt;
      const emit = Math.floor(dt * 420 + Math.random());
      for (let k = 0; k < emit; k++) {
        const i = this.pNext; this.pNext = (this.pNext + 1) % N;
        p.pos.set([j.x + (Math.random() - 0.5) * 0.15, j.y + 0.2, j.z + (Math.random() - 0.5) * 0.15], i * 3);
        const sp = 13 + Math.random() * 5;
        p.vel.set([(Math.random() - 0.5) * 1.6, sp, (Math.random() - 0.5) * 1.6], i * 3);
        p.age[i] = 0; p.life[i] = 1.1 + Math.random() * 0.8;
      }
    }
    let live = 0;
    for (let i = 0; i < N; i++) {
      if (p.age[i] >= p.life[i]) { p.alpha[i] = 0; p.size[i] = 0; continue; }
      live++;
      p.age[i] += dt;
      const k = i * 3, drag = Math.exp(-dt * 2.6);
      p.vel[k] *= drag; p.vel[k + 1] = p.vel[k + 1] * drag - dt * 0.6; p.vel[k + 2] *= drag;
      p.pos[k] += p.vel[k] * dt; p.pos[k + 1] += p.vel[k + 1] * dt; p.pos[k + 2] += p.vel[k + 2] * dt;
      const a = p.age[i] / p.life[i];
      p.size[i] = 0.35 + a * 3.2;
      p.alpha[i] = (1 - a) * (1 - a) * 0.09;
    }
    this.smoke.visible = live > 0;
    const g = this.smoke.geometry.attributes;
    g.position.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true;
    // CO₂ is white, lit a little by whatever the rig is playing
    this.smokeMat.uniforms.uTint.value.setRGB(0.6 + rig[0] * 0.4, 0.6 + rig[1] * 0.4, 0.62 + rig[2] * 0.4).multiplyScalar(0.25 + 0.75 * master);
  }
}
