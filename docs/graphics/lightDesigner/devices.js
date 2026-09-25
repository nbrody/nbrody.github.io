// devices.js — optional jam-band lighting devices that sit on top of any rig and show:
//
//   LED pixel tubes   — a wall upstage, bars on the rig's truss, columns, or a canopy
//   Mirror balls      — one to three, with pin spots, rays through the haze and
//                       spots sweeping the floor; "drop the ball" lowers them in
//   Blinders, strobes — tungsten audience blinders (slow warm decay) and strobe bars
//                       that light the whole stage for an instant
//   Liquid light show — an oil-and-water projection on an upstage screen, 1960s style
//   CO₂ jets          — cryo blasts along the downstage edge
//
// Everything follows the masters (grand, blackout, flash) and can be hit by the show's
// drops (sections that cut in hard), the beat, the show's strobes, or a MIDI crash cymbal.

import * as THREE from 'three';
import { DECK_Y, DECK_FRONT, DECK_BACK, DECK_HALF, GRID_Y, POD_COUNT, fixtureFrame, hash } from './layout.js';
import { hs2rgb, hexHS } from './engine.js';

const TAU = Math.PI * 2;
const PIX = 24, MAX_TUBES = 32;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const TUBE_LAYOUTS = {
  curtain: 'Wall of tubes upstage',
  truss: 'Bars on the rig’s truss',
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

const TUBE_VERT = /* glsl */ `
  attribute float aIdx;
  varying float vU; varying float vId;
  void main() { vU = position.y; vId = aIdx; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }
`;
const TUBE_FRAG = /* glsl */ `
  uniform sampler2D uTex; uniform float uPix;
  varying float vU; varying float vId;
  void main() {
    vec3 c = texelFetch(uTex, ivec2(clamp(int(vU * uPix), 0, int(uPix) - 1), int(vId + 0.5)), 0).rgb;
    float seam = 0.75 + 0.25 * smoothstep(0.0, 0.18, abs(fract(vU * uPix) - 0.5) * 2.0 - 0.2);
    gl_FragColor = vec4(c * 2.2 * seam + vec3(0.02, 0.02, 0.025), 1.0);
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
function tubeLayout(kind) {
  const L = [];
  if (kind === 'curtain') {
    for (let i = 0; i < 24; i++) { const x = -11 + (i * 22) / 23; L.push({ a: [x, DECK_Y + 0.15, -10.3], b: [x, DECK_Y + 3.4, -10.3] }); }
  } else if (kind === 'columns') {
    for (let i = 0; i < 8; i++) { const x = -10.4 + (i * 20.8) / 7; L.push({ a: [x, DECK_Y, DECK_FRONT - 0.3], b: [x, DECK_Y + 2.4, DECK_FRONT - 0.3] }); }
    for (const s of [-1, 1]) for (const z of [-1.5, -4.5, -7.5]) L.push({ a: [s * 11.1, DECK_Y, z], b: [s * 11.1, DECK_Y + 3.2, z] });
  } else if (kind === 'canopy') {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
      const x = -10 + c * 4 + (r % 2) * 1.2, z = 6 + r * 3.4, y = 9.2 + Math.sin(c * 1.3 + r) * 0.5;
      L.push({ a: [x - 1.3, y, z], b: [x + 1.3, y + 0.15, z] });
    }
  }
  return L; // 'truss' is computed every frame from the rig
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
    this.t = 0;
    this.lastSection = -1; this.lastBeat = 0; this.lastPhrase = 0;
    this.buildTubes(); this.buildBalls(); this.buildBlinders(); this.buildLiquid(); this.buildCO2();
    this.setTubeLayout(this.o.tubeLayout);
  }

  // ——— builders ———
  buildTubes() {
    this.tubeData = new Float32Array(MAX_TUBES * PIX * 4);
    this.tubeTex = new THREE.DataTexture(this.tubeData, PIX, MAX_TUBES, THREE.RGBAFormat, THREE.FloatType);
    this.tubeTex.minFilter = this.tubeTex.magFilter = THREE.NearestFilter;
    const geo = new THREE.CylinderGeometry(0.055, 0.055, 1, 10, 1);
    geo.translate(0, 0.5, 0);
    const idx = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TUBES).map((_, i) => i), 1);
    geo.setAttribute('aIdx', idx);
    const mat = new THREE.ShaderMaterial({ vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: { uTex: { value: this.tubeTex }, uPix: { value: PIX } } });
    this.tubeMesh = new THREE.InstancedMesh(geo, mat, MAX_TUBES);
    this.tubeMesh.frustumCulled = false;
    this.tubeMesh.visible = false;
    this.scene.add(this.tubeMesh);
  }

  setTubeLayout(kind) {
    this.o.tubeLayout = kind;
    this.tubes = kind === 'truss' ? [] : tubeLayout(kind);
    this.tubeCount = kind === 'truss' ? POD_COUNT * 2 : this.tubes.length;
  }

  buildBalls() {
    this.ballDefs = [[0, 11.2, -2.2], [-8, 10.2, 9], [8, 10.2, 9]].map((p) => ({ p, y: p[1], drop: 0, dropTarget: 0 }));
    this.ballMats = []; this.ballGroups = [];
    for (const b of this.ballDefs) {
      const g = new THREE.Group();
      const mat = new THREE.ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader: BALL_FRAG, uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uLight: { value: new THREE.Vector3(0, 1, 0.3).normalize() }, uLevel: { value: 1 } } });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), mat);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 10), this.rig.lit({ albedo: [0.1, 0.1, 0.1] }));
      motor.position.y = 0.75;
      g.add(ball, motor);
      g.userData.ball = ball;
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
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.22), housing);
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
    this.scene.add(this.blinderGroup);
    this.strobeGroup = new THREE.Group();
    this.strobeFaceMats = [];
    for (const s of this.strobeDefs) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.22), housing);
      box.position.set(s.x, s.y, s.z);
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), mat);
      face.position.z = 0.115;
      box.add(face);
      this.strobeFaceMats.push(mat);
      this.strobeGroup.add(box);
    }
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
    this.liquid.position.set(0, DECK_Y + 0.4 + h / 2, DECK_BACK - 0.35);
    this.liquid.visible = false;
    this.scene.add(this.liquid);
  }

  buildCO2() {
    this.jets = [-10, -6, -2, 2, 6, 10].map((x) => ({ x, y: DECK_Y + 0.15, z: DECK_FRONT - 0.6, t: 0 }));
    const nozzle = this.rig.lit({ albedo: [0.12, 0.12, 0.13], spec: 0.6 });
    this.jetGroup = new THREE.Group();
    for (const j of this.jets) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), nozzle);
      m.position.set(j.x, j.y, j.z);
      this.jetGroup.add(m);
    }
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
  blast() { for (const j of this.jets) j.t = 1.1; }
  hitBlinders() { for (const b of this.blinderDefs) b.env = 1; }
  burst(sec = 1.2) { this.burstT = sec; this.t0 = this.t; }
  dropBalls(down) { for (const b of this.ballDefs) b.dropTarget = down ? 0 : 1; }

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
    const E = this.e, o = this.o, m = E.m;
    this.t += dt;
    const master = m.blackout ? 0 : m.grand * (m.dip ?? 1);
    const rig = this.rigColor();

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

    // blinders: tungsten — fast attack, slow warm decay
    const bl = o.blinders;
    this.blinderGroup.visible = bl;
    if (bl && fires(o.blinderMode)) this.hitBlinders();
    if (m.flash && bl) for (const d of this.blinderDefs) d.env = Math.max(d.env, m.flash);
    let gi = 0;
    this.blinderDefs.forEach((d, i) => {
      d.env = bl ? d.env * Math.exp(-dt / 0.38) : 0;
      const L = d.env * o.blinderLevel * master;
      const warm = [1, 0.35 + 0.4 * d.env, 0.08 + 0.32 * d.env];
      this.lampMats[i].color.setRGB(warm[0] * (0.05 + L * 3), warm[1] * (0.05 + L * 3), warm[2] * (0.05 + L * 3));
      fillWarm += L;
      for (const [dx, dy] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        const k = gi++;
        this.gPos.set([d.x + dx, d.y + dy, d.z + 0.2], k * 3);
        this.gCol.set([warm[0] * L * 2.5, warm[1] * L * 2.5, warm[2] * L * 2.5], k * 3);
        this.gSize[k] = L > 0.01 ? 1.2 + L * 2.5 : 0;
      }
    });

    // strobes: 20 ms flashes — with the show, on the beat, chasing, or all on a burst
    const st = o.strobes;
    this.strobeGroup.visible = st;
    this.burstT = Math.max(0, (this.burstT || 0) - dt);
    if (st && fires(o.strobeMode)) this.burst(o.strobeMode === 'beat' ? 0.05 : 1.0);
    const showOn = o.strobeMode === 'show' && showStrobe > 0.02;
    const active = st && (this.burstT > 0 || m.strobeHold || showOn);
    const rate = showOn ? 1.5 + showStrobe * 18 : o.strobeRate;
    const ph = (this.t - (this.t0 || 0)) * rate;
    const on = active && ph - Math.floor(ph) < 0.22;
    this.strobeDefs.forEach((s, i) => {
      // long bursts alternate upstage/downstage banks; everything else fires together
      const bank = this.burstT > 0.2 && !m.strobeHold ? (Math.floor(ph) + (i < 4 ? 0 : 1)) % 2 === 0 : true;
      s.flash = on && bank ? o.strobeLevel * master : 0;
      this.strobeFaceMats[i].color.setScalar(0.03 + s.flash * 4);
      fill += s.flash;
      const k = gi++;
      this.gPos.set([s.x, s.y, s.z + 0.2], k * 3);
      this.gCol.set([s.flash * 3, s.flash * 3, s.flash * 3.2], k * 3);
      this.gSize[k] = s.flash > 0 ? 3.5 : 0;
    });
    const ga = this.glows.geometry.attributes;
    ga.position.needsUpdate = ga.aColor.needsUpdate = ga.aSize.needsUpdate = true;
    this.glows.visible = bl || st;
    // the flash fills the whole stage for an instant
    this.rig.shared.uFill.value.setRGB(fill * 0.06 + fillWarm * 0.05, fill * 0.06 + fillWarm * 0.03, fill * 0.065 + fillWarm * 0.012);

    this.updateLiquid(dt, master, rig);
    this.updateCO2(dt, master, rig, fires(o.co2Mode) && o.co2);
  }

  updateTubes(dt, master, rig) {
    const o = this.o, E = this.e;
    this.tubeMesh.visible = o.tubes;
    if (!o.tubes) return;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    let list = this.tubes;
    if (o.tubeLayout === 'truss') {
      list = [];
      const fr = {};
      for (let p = 0; p < POD_COUNT; p++) for (const s of [2, 7]) {
        const f = E.fixtures[p * 10 + s];
        fixtureFrame(f, E, fr);
        const R = fr.m, up = [R[1], R[4], R[7]], ax = [R[0], R[3], R[6]], lift = 0.9;
        const c = [fr.x + up[0] * lift, fr.y + up[1] * lift, fr.z + up[2] * lift];
        list.push({ a: [c[0] - ax[0] * 0.75, c[1] - ax[1] * 0.75, c[2] - ax[2] * 0.75], b: [c[0] + ax[0] * 0.75, c[1] + ax[1] * 0.75, c[2] + ax[2] * 0.75], fix: f.i });
      }
    }
    const n = Math.min(MAX_TUBES, list.length), beat = E.beat, t = this.t * o.tubeSpeed;
    const NL = E.noteLayer;
    let energy = 0;
    for (const R of E.render) energy += R.I;
    energy = Math.min(1, energy / 30);
    if (NL?.on) { let x = 0; for (let i = 0; i < NL.I.length; i++) x = Math.max(x, NL.I[i]); energy = x; }
    const c = { r: 0, g: 0, b: 0 }, D = this.tubeData;
    for (let i = 0; i < n; i++) {
      const T = list[i];
      dir.set(T.b[0] - T.a[0], T.b[1] - T.a[1], T.b[2] - T.a[2]);
      const len = dir.length();
      q.setFromUnitVectors(Y, dir.normalize());
      M.compose(new THREE.Vector3(...T.a), q, new THREE.Vector3(1, len, 1));
      this.tubeMesh.setMatrixAt(i, M);
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
        const s = L * o.tubeLevel * master * (this.e.m.flash ? 1.5 : 1), idx = (i * PIX + j) * 4;
        D[idx] = r * s; D[idx + 1] = g * s; D[idx + 2] = bl * s; D[idx + 3] = 1;
      }
    }
    this.tubeMesh.count = n;
    this.tubeMesh.instanceMatrix.needsUpdate = true;
    this.tubeTex.needsUpdate = true;
  }

  updateBalls(dt, master, rig) {
    const o = this.o, E = this.e, n = o.balls;
    let ray = 0, pin = 0, dot = 0;
    const c = { r: 1, g: 1, b: 1 };
    const R = this.rays, P = this.pins;
    this.ballGroups.forEach((g, bi) => {
      const B = this.ballDefs[bi], on = bi < n;
      g.visible = on;
      if (!on) return;
      B.drop += (B.dropTarget - B.drop) * Math.min(1, dt * 0.35);
      const y = B.p[1] + B.drop * (GRID_Y - 2 - B.p[1]);
      g.position.set(B.p[0], y, B.p[2]);
      const spin = this.t * (o.ballSpin / 60) * TAU;
      g.userData.ball.rotation.y = spin;
      this.cablePos.set([B.p[0], y + 0.85, B.p[2], B.p[0], GRID_Y, B.p[2]], bi * 6);
      const level = o.ballLevel * master * (E.m.flash ? 1.4 : 1);
      this.colorOf(o.ballColor, o.ballFixed, 0, rig, c);
      this.ballMats[bi].uniforms.uColor.value.setRGB(c.r, c.g, c.b);
      this.ballMats[bi].uniforms.uLevel.value = level;
      // two pin spots from the grid
      for (const s of [-1, 1]) {
        const k = pin++;
        P.start.array.set([B.p[0] + s * 4, GRID_Y - 3, B.p[2] + 3], k * 3);
        P.end.array.set([B.p[0], y, B.p[2]], k * 3);
        P.color.array.set([c.r * level * 0.35, c.g * level * 0.35, c.b * level * 0.35], k * 3);
      }
      // reflections: rays through the haze, and spots sweeping the floor
      const cs = Math.cos(spin), sn = Math.sin(spin), count = Math.min(this.fib.length, Math.round(o.ballRays));
      for (let i = 0; i < count; i++) {
        const [fx, fy, fz, h] = this.fib[i];
        const dx = fx * cs - fz * sn, dz = fx * sn + fz * cs, dy = fy;
        const ox = B.p[0] + dx * 0.62, oy = y + dy * 0.62, oz = B.p[2] + dz * 0.62;
        let L = 30, hit = false;
        if (dy < -1e-3) {
          const t1 = (DECK_Y - oy) / dy, hx = ox + dx * t1, hz = oz + dz * t1;
          if (t1 > 0 && hz < DECK_FRONT && hz > DECK_BACK && Math.abs(hx) < DECK_HALF) { L = t1; hit = true; }
          else { const t0 = -oy / dy; if (t0 > 0 && t0 < L) { L = t0; hit = true; } }
        }
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
    this.cables.visible = n > 0;
    this.cables.geometry.setDrawRange(0, n * 2);
    this.cables.geometry.attributes.position.needsUpdate = true;
    const dg = this.dots.geometry;
    dg.setDrawRange(0, dot);
    dg.attributes.position.needsUpdate = dg.attributes.aColor.needsUpdate = dg.attributes.aSize.needsUpdate = true;
    this.dots.visible = dot > 0;
    for (const mat of [R.mat, P.mat]) { mat.uniforms.uTime.value = this.t; mat.uniforms.uHaze.value = E.m.haze; }
  }

  updateLiquid(dt, master, rig) {
    const o = this.o, U = this.liquidMat.uniforms;
    this.liquid.visible = o.liquid;
    if (!o.liquid) return;
    U.uTime.value += dt * o.liquidSpeed;
    U.uLevel.value = o.liquidLevel * master;
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
    const o = this.o, p = this.p, N = this.NP;
    this.jetGroup.visible = o.co2;
    if (fire) this.blast();
    for (const j of this.jets) {
      if (!o.co2 || j.t <= 0) continue;
      j.t -= dt;
      const emit = Math.floor(dt * 420 + Math.random());
      for (let e = 0; e < emit; e++) {
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
      p.alpha[i] = (1 - a) * (1 - a) * 0.09 * (o.co2 ? 1 : 0);
    }
    this.smoke.visible = live > 0;
    const g = this.smoke.geometry.attributes;
    g.position.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true;
    // CO₂ is white, lit a little by whatever the rig is playing
    this.smokeMat.uniforms.uTint.value.setRGB(0.6 + rig[0] * 0.4, 0.6 + rig[1] * 0.4, 0.62 + rig[2] * 0.4).multiplyScalar(0.25 + 0.75 * master);
  }
}
