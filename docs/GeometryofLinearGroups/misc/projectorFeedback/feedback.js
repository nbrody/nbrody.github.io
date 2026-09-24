import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ── Constants ── */
const WALL_W = 16, WALL_H = 9;
const TEX_W = 1024, TEX_H = 576;
// Reference throw distances: at these distances the Scale sliders read true.
// Moving closer shrinks the thrown/captured image, moving away enlarges it.
const P_REF = 2.5, CAM_REF = 4.0;

/* ── Presets ── */
// Each projector is one map of an iterated function system; a preset is a
// choice of maps (scale/rotation/position/color) plus decay/gain balance.
const PRESETS = {
    nebula: {
        decay: 0.97, gain: 1.45, drift: true,
        cam: { s: 1.0, r: 0, d: 4, x: 0, y: 3.5 },
        brush: { size: 0.04, color: '#ffffff' },
        proj: [
            { on: true, s: 0.55, r: 8, d: 2.5, b: 1.1, c: '#ff3366', x: -3, y: 1.5 },
            { on: true, s: 0.5, r: -12, d: 2.5, b: 1.1, c: '#33ffaa', x: 3, y: -1.5 },
            { on: true, s: 0.6, r: 18, d: 2.5, b: 1.1, c: '#4455ff', x: 0, y: 2.8 },
        ],
    },
    sierpinski: {
        decay: 0.88, gain: 2.3, drift: false,
        cam: { s: 1.0, r: 0, d: 4, x: 0, y: 0 },
        brush: { size: 0.04, color: '#ffffff' },
        proj: [
            { on: true, s: 0.5, r: 0, d: 2.5, b: 1, c: '#ff3355', x: -4, y: -2 },
            { on: true, s: 0.5, r: 0, d: 2.5, b: 1, c: '#33ff88', x: 4, y: -2 },
            { on: true, s: 0.5, r: 0, d: 2.5, b: 1, c: '#5533ff', x: 0, y: 2.8 },
        ],
    },
    galaxy: {
        decay: 0.97, gain: 1.35, drift: false,
        cam: { s: 1.0, r: 0, d: 4, x: 0, y: 0 },
        brush: { size: 0.04, color: '#ffffff' },
        proj: [
            { on: true, s: 0.78, r: 12, d: 2.5, b: 1.2, c: '#4466ff', x: 0, y: 0 },
            { on: true, s: 0.3, r: -45, d: 2.5, b: 0.9, c: '#ff44aa', x: -4.5, y: 2 },
            { on: true, s: 0.3, r: 60, d: 2.5, b: 0.9, c: '#ffaa33', x: 4.5, y: -2 },
        ],
    },
    embers: {
        decay: 0.95, gain: 1.9, drift: true,
        cam: { s: 1.0, r: 0, d: 4, x: 0, y: 0 },
        brush: { size: 0.04, color: '#ffddaa' },
        proj: [
            { on: true, s: 0.5, r: 25, d: 2.5, b: 1.25, c: '#ff4422', x: -3, y: -1 },
            { on: true, s: 0.45, r: -18, d: 2.5, b: 1.15, c: '#ff9922', x: 3, y: -1.5 },
            { on: true, s: 0.38, r: 40, d: 2.5, b: 1.05, c: '#ffdd55', x: 0, y: 2 },
        ],
    },
    ocean: {
        decay: 0.985, gain: 1.35, drift: true,
        cam: { s: 1.0, r: -2, d: 4, x: 0, y: 0 },
        brush: { size: 0.06, color: '#ccffff' },
        // mid scales keep the attractor a thin fractal (a filled overlap region
        // would clamp solid); gentle rotations give it a rolling swell
        proj: [
            { on: true, s: 0.55, r: 9, d: 2.5, b: 1, c: '#00ccff', x: -2.5, y: 0.5 },
            { on: true, s: 0.5, r: -13, d: 2.5, b: 1, c: '#3366ff', x: 2.5, y: 0 },
            { on: true, s: 0.45, r: 5, d: 2.5, b: 1, c: '#00ffcc', x: 0, y: -1.5 },
        ],
    },
};
const PRESET_ORDER = ['nebula', 'sierpinski', 'galaxy', 'embers', 'ocean'];
const DEFAULT_PRESET = 'nebula';
let state = structuredClone(PRESETS[DEFAULT_PRESET]);

/* ── Renderer ── */
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(0x060610);
document.getElementById('container').appendChild(renderer.domElement);

/* ── Camera & Controls ── */
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 14);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
orbit.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.enabled = false; // only active while Cmd/Ctrl is held
window.addEventListener('keydown', e => { if (e.metaKey || e.ctrlKey) orbit.enabled = true; });
window.addEventListener('keyup', e => { if (!e.metaKey && !e.ctrlKey) orbit.enabled = false; });
window.addEventListener('blur', () => { orbit.enabled = false; });

/* ── Scene ── */
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0x334, 0.6));
const dLight = new THREE.DirectionalLight(0xffffff, 0.4);
dLight.position.set(5, 8, 10);
scene.add(dLight);

/* ── Feedback Shader ── */
const fbVert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const fbFrag = `
precision highp float;
uniform sampler2D uPrev;
uniform float uDecay, uGain, uAspect;
uniform vec2 uCamPos;
uniform float uCamS, uCamR;
uniform vec2 uP1Pos, uP2Pos, uP3Pos, uLightPos;
uniform float uP1S, uP1R, uP1On, uP1B, uP2S, uP2R, uP2On, uP2B, uP3S, uP3R, uP3On, uP3B;
uniform vec3 uP1C, uP2C, uP3C, uLightC;
uniform float uLightOn, uLightRad;
varying vec2 vUv;

// Full pipeline:
// Camera captures with its own scale/rotation centered at camPos.
// Each projector projects with its own scale/rotation centered at projPos.
// Forward: camView = camRot * (input - camPos) / camScale
//          output  = projPos + projScale * projRot(camView)
// Inverse: camView = invProjRot((output - projPos) / projScale)
//          input   = camPos + camScale * invCamRot(camView)
vec2 xform(vec2 uv, vec2 proj, vec2 cam, float ps, float pr, float cs, float cr){
  // Undo projector transform
  vec2 d = uv - proj;
  d.x *= uAspect;
  float co = cos(-pr), si = sin(-pr);
  d = vec2(co*d.x - si*d.y, si*d.x + co*d.y);
  d /= ps;
  // Apply camera inverse
  float co2 = cos(cr), si2 = sin(cr);
  d = vec2(co2*d.x - si2*d.y, si2*d.x + co2*d.y);
  d *= cs;
  d.x /= uAspect;
  return d + cam;
}

void main(){
  vec4 res = texture2D(uPrev, vUv) * uDecay;
  if(uP1On>0.5){ vec2 t=xform(vUv,uP1Pos,uCamPos,uP1S,uP1R,uCamS,uCamR);
    float m=step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.);
    res+=texture2D(uPrev,t)*vec4(uP1C,1.)*uGain*uP1B*m/3.; }
  if(uP2On>0.5){ vec2 t=xform(vUv,uP2Pos,uCamPos,uP2S,uP2R,uCamS,uCamR);
    float m=step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.);
    res+=texture2D(uPrev,t)*vec4(uP2C,1.)*uGain*uP2B*m/3.; }
  if(uP3On>0.5){ vec2 t=xform(vUv,uP3Pos,uCamPos,uP3S,uP3R,uCamS,uCamR);
    float m=step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.);
    res+=texture2D(uPrev,t)*vec4(uP3C,1.)*uGain*uP3B*m/3.; }
  if(uLightOn>0.5){ vec2 d=vUv-uLightPos; d.x*=uAspect;
    float i=smoothstep(uLightRad,0.,length(d));
    res+=vec4(uLightC*i,i); }
  gl_FragColor=clamp(res,0.,1.);
}`;

/* ── Ping-pong render targets ── */
// Half-float keeps faint trails alive — 8-bit quantization makes slow decay band and stall.
const rtOpts = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: THREE.HalfFloatType,
};
let rtA = new THREE.WebGLRenderTarget(TEX_W, TEX_H, rtOpts);
let rtB = new THREE.WebGLRenderTarget(TEX_W, TEX_H, rtOpts);
let readRT = rtA, writeRT = rtB;

function clearTargets() {
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1); // wall clears to true black, not the room color
    renderer.setRenderTarget(rtA); renderer.clear();
    renderer.setRenderTarget(rtB); renderer.clear();
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevColor, prevAlpha);
}

/* ── Feedback material & quad ── */
const fbUniforms = {
    uPrev: { value: null }, uDecay: { value: 0.97 }, uGain: { value: 1.45 },
    uAspect: { value: WALL_W / WALL_H },
    uCamPos: { value: new THREE.Vector2(0.5, 0.89) },
    uCamS: { value: 1.0 }, uCamR: { value: 0.0 },
    uP1Pos: { value: new THREE.Vector2() }, uP1S: { value: 0.5 }, uP1R: { value: 0 },
    uP1C: { value: new THREE.Vector3(1, 0.2, 0.4) }, uP1On: { value: 1 }, uP1B: { value: 1.0 },
    uP2Pos: { value: new THREE.Vector2() }, uP2S: { value: 0.5 }, uP2R: { value: 0 },
    uP2C: { value: new THREE.Vector3(0.2, 1, 0.67) }, uP2On: { value: 1 }, uP2B: { value: 1.0 },
    uP3Pos: { value: new THREE.Vector2() }, uP3S: { value: 0.5 }, uP3R: { value: 0 },
    uP3C: { value: new THREE.Vector3(0.27, 0.33, 1) }, uP3On: { value: 1 }, uP3B: { value: 1.0 },
    uLightPos: { value: new THREE.Vector2(0.5, 0.5) }, uLightRad: { value: 0.04 },
    uLightC: { value: new THREE.Vector3(1, 1, 1) }, uLightOn: { value: 0 },
};
const fbMat = new THREE.ShaderMaterial({ vertexShader: fbVert, fragmentShader: fbFrag, uniforms: fbUniforms });
const fbScene = new THREE.Scene();
const fbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
fbScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fbMat));

/* ── Wall ── */
const wallMat = new THREE.MeshBasicMaterial({ map: readRT.texture });
const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), wallMat);
scene.add(wallMesh);
// subtle frame
const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(WALL_W + 0.3, WALL_H + 0.3)),
    new THREE.LineBasicMaterial({ color: 0x222244 })
);
frame.position.z = 0.01; scene.add(frame);

/* ── Installation Camera (the one hooked to projectors) ── */
const instCam = new THREE.Group();
// body
const camBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.7, roughness: 0.3 })
);
instCam.add(camBody);
// lens barrel
const camLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.35, 16),
    new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x88aaff, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.2 })
);
camLens.rotation.x = Math.PI / 2; camLens.position.z = 0.45;
instCam.add(camLens);
// viewfinder bump
const camVF = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.3 })
);
camVF.position.set(0, 0.35, -0.1);
instCam.add(camVF);
// small indicator light
const camLight = new THREE.PointLight(0x88aaff, 0.4, 3);
camLight.position.z = 0.5;
instCam.add(camLight);
// Face the wall (lens toward -z)
instCam.rotation.y = Math.PI;
instCam.userData.isCamera = true;
instCam.userData.isDraggable = true;
scene.add(instCam);

/* ── Projectors ── */
function w2uv(x, y) { return new THREE.Vector2((x + WALL_W / 2) / WALL_W, (y + WALL_H / 2) / WALL_H); }

function makeProjector(hex) {
    const g = new THREE.Group();
    // body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.3 })
    );
    g.add(body);
    // lens — built pointing +z, we'll rotate the whole group to face the wall
    const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 0.25, 16),
        new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 2, metalness: 0.4, roughness: 0.2 })
    );
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.35;
    g.add(lens);
    // glow light at front (lens side)
    const pl = new THREE.PointLight(hex, 0.8, 4); pl.position.z = 0.4; g.add(pl);
    // Rotate entire projector 180° around Y so lens faces the wall (-z direction)
    g.rotation.y = Math.PI;
    g.userData.isProjector = true;
    g.userData.isDraggable = true;
    scene.add(g);
    return g;
}
const projMeshes = state.proj.map(p => makeProjector(p.c));

/* ── Light beams (translucent cones) ── */
const beamMats = state.proj.map(p => new THREE.MeshBasicMaterial({
    color: p.c, transparent: true, opacity: 0.025,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
}));
const beams = beamMats.map(mat => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(2, P_REF, 32, 1, true), mat);
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
});

function syncBeamPos(i) {
    const p = projMeshes[i].position;
    beams[i].position.set(p.x, p.y, p.z / 2);
}
function syncBeamGeo(i) {
    // Cone footprint tracks the projected image size
    const r = Math.max(0.25, fbUniforms[`uP${i + 1}S`].value * WALL_H / 2);
    beams[i].geometry.dispose();
    beams[i].geometry = new THREE.ConeGeometry(r, projMeshes[i].position.z, 32, 1, true);
    syncBeamPos(i);
}

function syncUniforms() {
    projMeshes.forEach((m, i) => {
        fbUniforms[`uP${i + 1}Pos`].value.copy(w2uv(m.position.x, m.position.y));
    });
    fbUniforms.uCamPos.value.copy(w2uv(instCam.position.x, instCam.position.y));
}

/* ── State → scene/uniforms ── */
function applySim() {
    fbUniforms.uDecay.value = state.decay;
    fbUniforms.uGain.value = state.gain;
}
function applyOptics() {
    fbUniforms.uCamS.value = state.cam.s * (state.cam.d / CAM_REF);
    state.proj.forEach((p, i) => {
        fbUniforms[`uP${i + 1}S`].value = p.s * (p.d / P_REF);
    });
}
function applyCam() {
    instCam.position.set(state.cam.x, state.cam.y, state.cam.d);
    const r = state.cam.r * Math.PI / 180;
    fbUniforms.uCamR.value = r;
    instCam.rotation.z = r;
    applyOptics();
    syncUniforms();
}
function applyProj(i) {
    const p = state.proj[i], m = projMeshes[i], n = i + 1;
    m.position.set(p.x, p.y, p.d);
    const r = p.r * Math.PI / 180;
    fbUniforms[`uP${n}R`].value = r;
    m.rotation.z = -r;
    fbUniforms[`uP${n}B`].value = p.b;
    const c = new THREE.Color(p.c);
    fbUniforms[`uP${n}C`].value.set(c.r, c.g, c.b);
    beamMats[i].color.set(p.c);
    const lens = m.children[1];
    lens.material.color.set(p.c);
    lens.material.emissive.set(p.c);
    const pl = m.children[2];
    pl.color.set(p.c);
    fbUniforms[`uP${n}On`].value = p.on ? 1 : 0;
    beams[i].visible = p.on;
    lens.material.emissiveIntensity = p.on ? 2 : 0.15;
    pl.intensity = p.on ? 0.8 : 0;
    applyOptics();
    syncBeamGeo(i);
    syncUniforms();
}
function applyBrush() {
    fbUniforms.uLightRad.value = state.brush.size;
    const c = new THREE.Color(state.brush.color);
    fbUniforms.uLightC.value.set(c.r, c.g, c.b);
}
function applyAll() {
    applySim();
    applyCam();
    state.proj.forEach((_, i) => applyProj(i));
    applyBrush();
}

/* ── Interaction ── */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let dragging = null, painting = false, paused = false;

function getHit(e) {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
}

// All draggable groups (projectors + installation camera)
const allDraggable = [...projMeshes, instCam];
const allDraggableChildren = allDraggable.flatMap(g => g.children);

renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    // Cmd/Ctrl+Click → orbit (handled by OrbitControls)
    if (orbit.enabled) return;
    getHit(e);
    // check draggable objects (projectors + camera)
    const hits = raycaster.intersectObjects(allDraggableChildren, true);
    if (hits.length) {
        dragging = hits[0].object;
        while (dragging.parent && !dragging.userData.isDraggable) dragging = dragging.parent;
        return;
    }
    // paint on wall
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(wallPlane, pt)) {
        painting = true;
        fbUniforms.uLightPos.value.copy(w2uv(pt.x, pt.y));
        fbUniforms.uLightOn.value = 1;
    }
});

renderer.domElement.addEventListener('pointermove', e => {
    if (dragging) {
        getHit(e);
        const pt = new THREE.Vector3();
        const dragZ = dragging.position.z;
        if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -dragZ), pt)) {
            const x = THREE.MathUtils.clamp(pt.x, -WALL_W / 2 + 0.5, WALL_W / 2 - 0.5);
            const y = THREE.MathUtils.clamp(pt.y, -WALL_H / 2 + 0.5, WALL_H / 2 - 0.5);
            dragging.position.x = x;
            dragging.position.y = y;
            // Positions live in state so drift orbits the new spot and presets stay coherent
            const idx = projMeshes.indexOf(dragging);
            if (idx >= 0) {
                state.proj[idx].x = x; state.proj[idx].y = y;
                syncBeamPos(idx);
            } else {
                state.cam.x = x; state.cam.y = y;
            }
            syncUniforms();
        }
    } else if (painting) {
        getHit(e);
        const pt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(wallPlane, pt)) {
            fbUniforms.uLightPos.value.copy(w2uv(pt.x, pt.y));
        }
    }
});

window.addEventListener('pointerup', () => {
    dragging = null;
    painting = false;
    if (seedFrames === 0) fbUniforms.uLightOn.value = 0;
});

/* ── Seed ── */
const RESEED_EVERY = 480; // feedback frames of darkness-risk before a fresh drop of light
let seedFrames = 0, idleFrames = 0;
function injectSeed() {
    // single small white dot at center
    fbUniforms.uLightPos.value.set(0.5, 0.5);
    fbUniforms.uLightC.value.set(1, 1, 1);
    fbUniforms.uLightRad.value = 0.015;
    fbUniforms.uLightOn.value = 1;
    // counted in rendered feedback frames, so throttled tabs still get seeded
    seedFrames = 6;
    idleFrames = 0;
}
function endSeed() {
    seedFrames = 0;
    fbUniforms.uLightOn.value = 0;
    // the seed borrows the brush uniforms — hand them back
    applyBrush();
}

/* ── UI Wiring ── */
const $ = id => document.getElementById(id);
let activeProj = 0;

function markCustom() {
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
}
function setVal(id, v) {
    const el = $(id);
    el.value = v;
    const vEl = $(id + '-val');
    if (vEl) vEl.textContent = el.value;
}
function refreshProjUI() {
    const p = state.proj[activeProj];
    setVal('ps', p.s); setVal('pr', p.r); setVal('pd', p.d); setVal('pb', p.b);
    $('pc').value = p.c;
    $('pon').checked = p.on;
    $('proj-section').style.setProperty('--pc', p.c);
    document.querySelectorAll('.proj-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === activeProj);
        tab.classList.toggle('off', !state.proj[i].on);
        tab.querySelector('.dot').style.background = state.proj[i].c;
    });
}
function refreshUI() {
    setVal('decay', state.decay); setVal('gain', state.gain);
    setVal('cams', state.cam.s); setVal('camr', state.cam.r); setVal('camd', state.cam.d);
    setVal('brush', state.brush.size);
    $('brush-color').value = state.brush.color;
    refreshProjUI();
}

function wire(id, cb) {
    const el = $(id);
    const vEl = $(id + '-val');
    el.addEventListener('input', () => {
        cb(parseFloat(el.value));
        if (vEl) vEl.textContent = el.value;
        markCustom();
    });
}
wire('decay', v => { state.decay = v; applySim(); });
wire('gain', v => { state.gain = v; applySim(); });
wire('cams', v => { state.cam.s = v; applyCam(); });
wire('camr', v => { state.cam.r = v; applyCam(); });
wire('camd', v => { state.cam.d = v; applyCam(); });
wire('ps', v => { state.proj[activeProj].s = v; applyProj(activeProj); });
wire('pr', v => { state.proj[activeProj].r = v; applyProj(activeProj); });
wire('pd', v => { state.proj[activeProj].d = v; applyProj(activeProj); });
wire('pb', v => { state.proj[activeProj].b = v; applyProj(activeProj); });
wire('brush', v => { state.brush.size = v; applyBrush(); });

$('pc').addEventListener('input', e => {
    state.proj[activeProj].c = e.target.value;
    applyProj(activeProj);
    refreshProjUI();
    markCustom();
});
$('pon').addEventListener('change', e => {
    state.proj[activeProj].on = e.target.checked;
    applyProj(activeProj);
    refreshProjUI();
    markCustom();
});
$('brush-color').addEventListener('input', e => {
    state.brush.color = e.target.value;
    applyBrush();
    markCustom();
});

document.querySelectorAll('.proj-tab').forEach((tab, i) =>
    tab.addEventListener('click', () => { activeProj = i; refreshProjUI(); }));

document.querySelectorAll('.chip').forEach(chip =>
    chip.addEventListener('click', () => applyPreset(chip.dataset.preset)));

function applyPreset(name) {
    if (!PRESETS[name]) return;
    state = structuredClone(PRESETS[name]);
    applyAll();
    refreshUI();
    setDrift(state.drift);
    document.querySelectorAll('.chip').forEach(c =>
        c.classList.toggle('active', c.dataset.preset === name));
    clearTargets();
    injectSeed();
}

$('controls-toggle').addEventListener('click', () =>
    $('controls-panel').classList.toggle('hidden'));
$('clear-btn').addEventListener('click', clearTargets);
$('seed-btn').addEventListener('click', injectSeed);
$('reset-btn').addEventListener('click', () => applyPreset(DEFAULT_PRESET));

function togglePause() {
    paused = !paused;
    $('pause-btn').textContent = paused ? 'Resume' : 'Pause';
}
$('pause-btn').addEventListener('click', togglePause);

$('save-btn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'feedback-loop.png';
    a.href = renderer.domElement.toDataURL('image/png');
    a.click();
});

// Keep Space (etc.) from re-triggering the last clicked panel button
$('controls-panel').addEventListener('click', e => e.target.closest('button')?.blur());

/* ── Auto-Drift ── */
let autoDrift = false;
function driftNoise(t, seed) {
    return Math.sin(t * 0.13 + seed) * 0.5
        + Math.sin(t * 0.07 + seed * 2.3) * 0.3
        + Math.sin(t * 0.03 + seed * 5.1) * 0.2;
}
function setDrift(on) {
    autoDrift = on;
    state.drift = on;
    const btn = $('drift-btn');
    btn.textContent = on ? 'Stop Drift' : 'Auto Drift';
    btn.classList.toggle('btn-accent', on);
    if (!on) {
        // settle back to the state values drift was orbiting around
        applyCam();
        state.proj.forEach((_, i) => applyProj(i));
    }
}
$('drift-btn').addEventListener('click', () => { setDrift(!autoDrift); markCustom(); });

/* ── Keyboard shortcuts ── */
window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    const preset = PRESET_ORDER['12345'.indexOf(k)];
    if (preset) { applyPreset(preset); return; }
    switch (k) {
        case ' ': e.preventDefault(); togglePause(); break;
        case 'c': clearTargets(); break;
        case 's': injectSeed(); break;
        case 'r': applyPreset(DEFAULT_PRESET); break;
        case 'd': setDrift(!autoDrift); break;
        case 'h': $('controls-panel').classList.toggle('hidden'); break;
    }
});

/* ── Resize ── */
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
});

/* ── Animation Loop ── */
function feedbackStep() {
    fbUniforms.uPrev.value = readRT.texture;
    renderer.setRenderTarget(writeRT);
    renderer.render(fbScene, fbCam);
    [readRT, writeRT] = [writeRT, readRT];
    if (seedFrames > 0 && --seedFrames === 0 && !painting) endSeed();
    // heartbeat: keep the wall alive with a fresh drop of light now and then
    if (painting || seedFrames > 0) idleFrames = 0;
    else if (++idleFrames >= RESEED_EVERY) injectSeed();
}

let fc = 0, ft = 0;
function animate(t) {
    requestAnimationFrame(animate);
    fc++;
    if (t - ft > 1000) { $('fps').textContent = fc + ' fps'; fc = 0; ft = t; }

    // Auto-drift: slowly modulate camera and projector params around state
    if (autoDrift) {
        const s = t * 0.001;
        instCam.position.x = state.cam.x + driftNoise(s, 0) * 4;
        instCam.position.y = state.cam.y + driftNoise(s, 7) * 2.5;
        fbUniforms.uCamS.value = Math.max(0.1, state.cam.s + driftNoise(s, 17) * 0.3) * (state.cam.d / CAM_REF);
        fbUniforms.uCamR.value = (state.cam.r * Math.PI / 180) + driftNoise(s, 23) * 0.15;
        projMeshes.forEach((m, i) => {
            const home = state.proj[i];
            m.position.x = home.x + driftNoise(s, 30 + i * 11) * 1.5;
            m.position.y = home.y + driftNoise(s, 40 + i * 13) * 1.0;
            syncBeamPos(i);
        });
        syncUniforms();
    }

    orbit.update();
    if (!paused) feedbackStep();
    // display
    wallMat.map = readRT.texture;
    wallMat.needsUpdate = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
}

/* ── Boot ── */
applyPreset(DEFAULT_PRESET);
requestAnimationFrame(animate);

// console/debug hook: fb.steps(300) fast-forwards the feedback loop
window.fb = {
    steps(n = 120) {
        for (let k = 0; k < n; k++) feedbackStep();
        renderer.setRenderTarget(null);
    },
    seed: injectSeed,
    preset: applyPreset,
};
