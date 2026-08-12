// main.js — scene setup, camera, UI, and the animation loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Machine } from './machine.js';
import { AudioEngine } from './audio.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.Fog(0x0a0a0f, 18, 46);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
const DEFAULT_POS = new THREE.Vector3(6.2, 4.8, 10.2);
const DEFAULT_TARGET = new THREE.Vector3(-0.6, 3.1, 0);
camera.position.copy(DEFAULT_POS);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(DEFAULT_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 34;
controls.minDistance = 2;
controls.maxPolarAngle = Math.PI * 0.55;

// lights
scene.add(new THREE.HemisphereLight(0x8899bb, 0x1c1a22, 0.5));
const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
key.position.set(6, 12, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 10; key.shadow.camera.bottom = -3;
key.shadow.camera.far = 32;
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.PointLight(0x7fa8ff, 26, 40);
fill.position.set(-8, 5, -6);
scene.add(fill);
const warm = new THREE.PointLight(0xffb36b, 18, 30);
warm.position.set(3, 2.5, 6);
scene.add(warm);
// accent on the bell under the vortex bowl
const bellGlow = new THREE.PointLight(0xffc76b, 7, 4.5);
bellGlow.position.set(2.4, 2.9, 2.3);
scene.add(bellGlow);

const audio = new AudioEngine();
const machine = await Machine.create(scene, audio);
window.__machine = machine; // debug/inspection hooks
window.__audio = audio;
window.__camera = camera;
window.__controls = controls;

// ---- UI ----
const overlay = document.getElementById('overlay');
const btnMute = document.getElementById('btn-mute');
const btnFollow = document.getElementById('btn-follow');
const btnView = document.getElementById('btn-view');
const statsEl = document.getElementById('stats');

let started = false;
let followIdx = -1;

const btnStart = document.getElementById('btn-start');
btnStart.disabled = false;
btnStart.innerHTML = '&#9654;&nbsp; set it in motion';
btnStart.addEventListener('click', () => {
    audio.init();
    audio.resume();
    overlay.classList.add('hidden');
    started = true;
});

btnMute.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    btnMute.textContent = audio.muted ? '🔇 sound' : '🔊 sound';
});

btnFollow.addEventListener('click', () => {
    followIdx = (followIdx + 2) % (machine.balls.length + 1) - 1;
    btnFollow.textContent = followIdx < 0 ? '🎯 follow' : `🎯 ball ${followIdx + 1}`;
    btnFollow.classList.toggle('active', followIdx >= 0);
});

btnView.addEventListener('click', () => {
    followIdx = -1;
    btnFollow.textContent = '🎯 follow';
    btnFollow.classList.remove('active');
    camera.position.copy(DEFAULT_POS);
    controls.target.copy(DEFAULT_TARGET);
});

function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.ctx?.suspend?.(); else if (started) audio.resume();
});

let last = performance.now();
let statTimer = 0;
function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (started) machine.update(dt);

    if (followIdx >= 0) {
        controls.target.lerp(machine.balls[followIdx].pos, Math.min(1, 6 * dt));
    }
    controls.update();
    renderer.render(scene, camera);

    statTimer += dt;
    if (statTimer > 0.5) {
        statTimer = 0;
        const s = machine.stats;
        statsEl.textContent = `${s.laps} lifts · ${s.chimes} chimes · ${s.bells} bells · ${s.boings} boings`;
    }
}
requestAnimationFrame(animate);
