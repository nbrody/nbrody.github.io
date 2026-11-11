/**
 * Poincaré VR: certified fundamental domains of Kleinian groups in the
 * Poincaré ball, for Meta Quest (WebXR, hands or controllers) and desktop.
 *
 * The math is the desktop Poincaré tool's own (engine.js). This file wires
 * the scene: a workbench in front of you with the ball and two panels, the
 * XR session, the inside view, and the frame loop.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyMatrixToBall, DESKTOP_URL } from './engine.js';
import {
    app, on, emit, loadPreset, loadFromURL, setGroup, stepAnimation, fly, reanchor, setSetting,
    statusSummary, desktopState, goThroughFace, goThroughSide, resetView, namePlain
} from './state.js';
import { createDisplay } from './display.js';
import { createInput } from './xrInput.js';
import { createInteraction } from './interact.js';
import { createScreens } from './screens.js';
import { translationBy, ballToHyp, violatedWall } from './hyper.js';

// ---------------- renderer, scene, camera ----------------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(0, 1.42, 0.92);
// A press on a panel or a face belongs to the app, not to the orbit controls.
// This listener is added before OrbitControls', so it runs first.
const pressRay = new THREE.Raycaster();
canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || renderer.xr.isPresenting || app.inside) return;
    const r = canvas.getBoundingClientRect();
    pressRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const onPanel = screens.panels.some(P => P.mesh.visible && pressRay.intersectObject(P.mesh, false).length);
    if (onPanel || display.pick(pressRay).tag >= 0) controls.enabled = false;
});
window.addEventListener('pointerup', () => { if (!interaction.grabbing) controls.enabled = true; });
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.3, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 0.25;
controls.maxDistance = 4;
controls.update();

const ENV = {
    light: { top: 0xe8ebf1, horizon: 0xffffff, floor: 0xf1f3f6, ring: 0xdfe3ea },
    dark: { top: 0x23282e, horizon: 0x343b44, floor: 0x262b31, ring: 0x3a424c },
};

// Sky: a soft vertical gradient; floor: a flat disk with a faint ring under the workbench.
const skyMat = new THREE.ShaderMaterial({
    uniforms: { u_top: { value: new THREE.Color() }, u_hor: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 u_top; uniform vec3 u_hor; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(u_hor, u_top, pow(h, 0.6)), 1.0); }',
    side: THREE.BackSide, depthWrite: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat);
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf1f3f6 }));
const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.93, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdfe3ea }));
ring.position.y = 0.002;
const env = new THREE.Group();
env.add(sky, floor, ring);
scene.add(env);

// The workbench: the ball's home position and the panels, placed in front of you.
const workbench = new THREE.Group();
workbench.position.set(0, 1.3, 0);
scene.add(workbench);
const ballSlot = new THREE.Object3D();
workbench.add(ballSlot);

// The ball: ballRoot carries the user's grabs; `model` turns ball coordinates
// into world ones with ∞ (the ball's +z) up and the real plane facing you.
const ballRoot = new THREE.Group();
scene.add(ballRoot);
const model = new THREE.Group();
model.rotation.x = -Math.PI / 2;
ballRoot.add(model);
const display = createDisplay(model);

function homeBall() {
    workbench.updateMatrixWorld(true);
    ballSlot.getWorldPosition(ballRoot.position);
    ballSlot.getWorldQuaternion(ballRoot.quaternion);
    ballRoot.scale.setScalar(app.settings.ballRadius);
}
homeBall();

// ---------------- input & panels ----------------

const input = createInput({ renderer, scene, camera, dom: canvas });

const actions = {
    loadPreset, setSetting, resetView,
    applyFace: (i) => throughFace(i),
    recenter: () => recenter(),
    setInside: (v) => setInside(v),
    setTheme: (t) => setTheme(t),
    select: (i) => { app.selected = i; display.syncSelection(); emit('selection'); },
};
const screens = createScreens({ actions, workbench });

const interaction = createInteraction({
    input, display, ballRoot, camera, controls,
    panels: () => screens.panels,
    inside: () => app.inside,
    callbacks: {
        onHover: (tag) => { if (app.hover !== tag) { app.hover = tag; } },
        onTap: (tag) => { actions.select(tag); },
        onTapEmpty: () => { if (app.selected >= 0) actions.select(-1); },
        onDoubleTap: (tag) => throughFace(tag),
        onFly: (d, isStick) => flyWorld(d),
        onBallMoved: () => { },
        onGrab: () => { },
    },
});

function throughFace(tag) {
    if (tag < 0) return;
    if (display.kind === 'delaunay') goThroughSide(tag); else goThroughFace(tag);
}

// ---------------- the inside view ----------------

const INSIDE_RADIUS = 2.6;     // ball radius (m) when you stand inside it
const headPos = new THREE.Vector3(), lastHead = new THREE.Vector3();
let saved = null;

function setInside(on) {
    if (on === app.inside) return;
    app.inside = on;
    if (on) {
        saved = { pos: ballRoot.position.clone(), quat: ballRoot.quaternion.clone(), scale: ballRoot.scale.x };
        ballRoot.scale.setScalar(INSIDE_RADIUS);
        // Keep the ball upright, facing the way the workbench faces.
        workbench.getWorldQuaternion(ballRoot.quaternion);
        headWorld(lastHead);
        ballRoot.position.copy(lastHead);
        if (!renderer.xr.isPresenting) {
            controls.target.copy(lastHead).add(new THREE.Vector3(0, 0, -0.01).applyQuaternion(camera.quaternion));
            controls.enableZoom = false;
        }
    } else {
        if (saved) { ballRoot.position.copy(saved.pos); ballRoot.quaternion.copy(saved.quat); ballRoot.scale.setScalar(saved.scale); }
        if (!renderer.xr.isPresenting) { controls.enableZoom = true; desktopView(); }
    }
    display.syncVisibility();
    display.rebuildTiles();
    emit('inside');
}

function headWorld(out) {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    return cam.getWorldPosition(out);
}

/** A world displacement d of the world (m): move through hyperbolic space with it. */
const tmpQ = new THREE.Quaternion();
function flyWorld(d) {
    if (!app.inside || app.anim) return;
    const local = d.clone().applyQuaternion(model.getWorldQuaternion(tmpQ).invert()).divideScalar(ballRoot.scale.x);
    if (local.lengthSq() < 1e-14) return;
    fly(translationBy(local.clampLength(0, 0.2)));
    reanchor(violatedWall, ballToHyp, applyMatrixToBall);
}

// ---------------- placing the workbench ----------------

function recenter() {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    const p = cam.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    if (renderer.xr.isPresenting) {
        workbench.position.copy(p).addScaledVector(dir, 0.52);
        workbench.position.y = Math.max(0.8, p.y - 0.2);
    } else {
        workbench.position.set(0, 1.3, 0);
        dir.set(0, 0, -1);
    }
    workbench.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    if (app.inside) setInside(false);
    homeBall();
    interaction.cancelMotion();
    if (!renderer.xr.isPresenting) desktopView();
}

/** Desktop camera: back far enough that the ball and both panels fit the window. */
function desktopView() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(0.46 / t, 0.8 / (t * aspect)) + 0.12;
    camera.position.set(0, 1.36, d);
    controls.target.set(0, 1.31, 0);
    controls.update();
}

// ---------------- XR sessions ----------------

const btnVR = document.getElementById('btn-vr');
const btnAR = document.getElementById('btn-ar');
let placeOnNextFrame = false;

async function startSession(mode) {
    if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
    try {
        const session = await navigator.xr.requestSession(mode, {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['hand-tracking', 'bounded-floor'],
        });
        session.addEventListener('end', onSessionEnd);
        await renderer.xr.setSession(session);
        const ar = mode === 'immersive-ar';
        env.visible = !ar;
        scene.background = null;
        renderer.setClearAlpha(ar ? 0 : 1);
        input.setHandsVisible(!ar);
        placeOnNextFrame = true;
        btnVR.textContent = 'Exit VR';
    } catch (e) {
        console.error('[xr]', e);
        alert(`Could not start ${mode}: ${e.message}`);
    }
}

function onSessionEnd() {
    env.visible = true;
    renderer.setClearAlpha(1);
    btnVR.textContent = 'Enter VR';
    if (app.inside) setInside(false);
    recenter();
}

if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
        btnVR.disabled = !ok;
        if (!ok) btnVR.title = 'This browser has no immersive VR (open the page in the Quest Browser).';
    }).catch(() => { });
    navigator.xr.isSessionSupported('immersive-ar').then(ok => { btnAR.hidden = !ok; }).catch(() => { });
} else {
    btnVR.title = 'WebXR is not available in this browser (open the page in the Quest Browser).';
}
btnVR.addEventListener('click', () => startSession('immersive-vr'));
btnAR.addEventListener('click', () => startSession('immersive-ar'));

// ---------------- theme ----------------

function setTheme(t) {
    setSetting('theme', t);
    document.documentElement.dataset.theme = t;
    const E = ENV[t] || ENV.light;
    skyMat.uniforms.u_top.value.setHex(E.top);
    skyMat.uniforms.u_hor.value.setHex(E.horizon);
    floor.material.color.setHex(E.floor);
    ring.material.color.setHex(E.ring);
    renderer.setClearColor(E.horizon, renderer.xr.isPresenting && !env.visible ? 0 : 1);
    display.setTheme(t);
    screens.setTheme(t);
}

// ---------------- reacting to state ----------------

const statusEl = document.getElementById('status');
function showStatus() {
    const s = statusSummary();
    statusEl.dataset.kind = s.kind;
    const name = app.name ? `${namePlain(app.name)} — ` : '';
    statusEl.querySelector('.txt').textContent = name + s.text;
    const link = document.getElementById('btn-desktop');
    link.href = DESKTOP_URL + desktopState();
}

on('status', showStatus);
on('domain', () => { display.rebuild(); display.rebuildExtras(); showStatus(); });
on('settings', (key) => {
    if (['domain', 'plane', 'palette'].includes(key)) display.rebuild();
    else if (['tiling', 'tilingRadius', 'honeycomb'].includes(key)) display.rebuildTiles();
    else if (['cayley', 'limit'].includes(key)) display.rebuildExtras();
    else if (key === 'ballRadius') { if (!app.inside) { ballRoot.scale.setScalar(app.settings.ballRadius); } }
    else display.syncVisibility();
    if (key === 'edges') display.rebuildTiles();
});
on('group', () => { display.rebuild(); display.rebuildExtras(); });
on('recolor', () => display.rebuild());

// ---------------- the HTML drawer: your own group ----------------

setupDrawer();

function setupDrawer() {
    const drawer = document.getElementById('drawer');
    const list = document.getElementById('gen-list');
    document.getElementById('btn-custom').addEventListener('click', () => {
        drawer.hidden = !drawer.hidden;
        if (!drawer.hidden) fillDrawer();
    });
    document.getElementById('drawer-close').addEventListener('click', () => { drawer.hidden = true; });
    document.getElementById('gen-add').addEventListener('click', () => addGen(['1', '0', '0', '1'], false));
    document.getElementById('gen-compute').addEventListener('click', () => {
        const mats = [], anti = [];
        list.querySelectorAll('.gen').forEach(g => {
            mats.push([...g.querySelectorAll('input[type=text]')].map(i => i.value.trim() || '0'));
            anti.push(g.querySelector('input[type=checkbox]').checked);
        });
        const consts = [];
        for (const line of document.getElementById('consts').value.split('\n')) {
            const s = line.trim();
            if (!s) continue;
            const r = s.match(/^([A-Za-z]\w*)\s+root\s+of\s+(.+?)(?:\s+near\s+([-+0-9.eE]+)\s*([-+]\s*[0-9.eE]+)\s*i)?$/);
            if (r) { consts.push({ name: r[1], poly: r[2], near: { re: +(r[3] || 0), im: r[4] ? +r[4].replace(/\s/g, '') : 0 } }); continue; }
            const m = s.match(/^([A-Za-z]\w*)\s*=\s*(.+)$/);
            if (m) consts.push([m[1], m[2]]);
        }
        const depth = Math.max(2, Math.min(32, +document.getElementById('depth').value || 8));
        const ok = setGroup({ mats, anti, consts }, { name: 'Your group', depth });
        document.getElementById('gen-error').textContent = ok ? '' : app.error;
    });

    function addGen(vals, anti) {
        const k = list.children.length + 1;
        const el = document.createElement('div');
        el.className = 'gen';
        el.innerHTML = `<div class="gen-head"><span>g${k}</span><label class="gen-anti"><input type="checkbox"${anti ? ' checked' : ''}> orientation-reversing (z̄)</label><button class="icon" type="button" aria-label="Remove">×</button></div>
            <div class="gen-grid">${vals.map((v, i) => `<input type="text" spellcheck="false" aria-label="entry ${i + 1}">`).join('')}</div>`;
        el.querySelectorAll('input[type=text]').forEach((inp, i) => { inp.value = vals[i]; });
        el.querySelector('button').addEventListener('click', () => el.remove());
        list.appendChild(el);
    }

    function fillDrawer() {
        list.innerHTML = '';
        const inp = app.input || { mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']], anti: [], consts: [] };
        inp.mats.forEach((m, i) => addGen(m.map(String), !!(inp.anti && inp.anti[i])));
        document.getElementById('consts').value = (inp.consts || []).map(r => Array.isArray(r) ? `${r[0]} = ${r[1]}`
            : `${r.name} root of ${r.poly}${r.near ? ` near ${r.near.re} ${r.near.im >= 0 ? '+' : '-'} ${Math.abs(r.near.im)}i` : ''}`).join('\n');
        document.getElementById('depth').value = app.depth;
    }
}

// ---------------- frame loop ----------------

const clock = new THREE.Clock();
const keys = new Set();
window.addEventListener('keydown', (e) => { if (e.target === document.body) keys.add(e.key.toLowerCase()); });
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();
    const xr = renderer.xr.isPresenting;

    if (xr && placeOnNextFrame) { placeOnNextFrame = false; recenter(); }

    input.update();
    interaction.update(now, dt);

    if (app.inside) {
        // Walking moves you through hyperbolic space; the ball stays centred on your head.
        headWorld(headPos);
        const d = headPos.clone().sub(lastHead);
        if (d.lengthSq() > 1e-10) flyWorld(d.negate());
        lastHead.copy(headPos);
        ballRoot.position.copy(headPos);
        if (!xr) {
            const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const v = new THREE.Vector3();
            if (keys.has('w') || keys.has('arrowup')) v.add(f);
            if (keys.has('s') || keys.has('arrowdown')) v.sub(f);
            if (keys.has('d') || keys.has('arrowright')) v.add(r);
            if (keys.has('a') || keys.has('arrowleft')) v.sub(r);
            if (v.lengthSq()) flyWorld(v.normalize().multiplyScalar(-0.8 * dt));
        }
    }

    stepAnimation(now);
    display.frame(now);
    screens.update(now);
    if (!xr) controls.update();
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

window.addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (!renderer.xr.isPresenting && !app.inside) desktopView();
});

// ---------------- start ----------------

desktopView();
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
setTheme(prefersDark ? 'dark' : 'light');
if (!loadFromURL()) {
    // Start with the figure-eight knot complement if the library has it, else the first preset.
    const { exampleLibrary } = await import('./engine.js');
    const i = exampleLibrary.findIndex(e => /figure.?eight/i.test(e.name) && !/fiber/i.test(e.name));
    loadPreset(i >= 0 ? i : 0);
}
// Handles for debugging and headless checks: tick() runs one frame by hand (a hidden tab gets no animation frames).
window.PoincareVR = { app, display, screens, scene, camera, renderer, ballRoot, workbench, actions, input, tick: frame, setInside };
