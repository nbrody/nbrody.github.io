import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFlower, createBud } from './flower.js';
import { createLeaves } from './leaves.js';
import { backgroundVertex, backgroundFragment } from './shaders/background.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50);
camera.position.set(0.25, 0.05, 4.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0.3, 0.05, 0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 8;

// Shared uniforms: every material spreads these, so one update drives them all.
const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.55, 0.75, 0.65).normalize() },
  uSunColor: { value: new THREE.Vector3(1.55, 1.45, 1.25) },
  uSkyColor: { value: new THREE.Vector3(0.32, 0.36, 0.42) },
  uGroundColor: { value: new THREE.Vector3(0.14, 0.16, 0.1) },
};

// background
const bgUniforms = { ...shared, uAspect: { value: 1 } };
const bg = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({ vertexShader: backgroundVertex, fragmentShader: backgroundFragment, uniforms: bgUniforms, depthWrite: false })
);
bg.frustumCulled = false;
bg.renderOrder = -1;
scene.add(bg);

// two flowers, as in the photo
const flowerA = createFlower(shared, 3);
flowerA.position.set(-0.55, 0.22, 0);
flowerA.rotation.set(-0.08, 0.12, 0);
scene.add(flowerA);

const flowerB = createFlower(shared, 11);
flowerB.position.set(1.2, -0.08, -0.35);
flowerB.rotation.set(0.1, -0.45, 0.3);
flowerB.scale.setScalar(0.9);
scene.add(flowerB);

// buds
[
  { pos: [-1.9, 1.05, -0.5], rot: [0.3, 0, 0.9], len: 0.32 },
  { pos: [0.9, 1.2, -0.7], rot: [0.9, 0.2, -0.5], len: 0.4 },
  { pos: [-0.9, -1.0, -0.4], rot: [-0.5, 0.3, 2.3], len: 0.3 },
].forEach((b) => {
  const bud = createBud(shared, b.len);
  bud.position.set(...b.pos);
  bud.rotation.set(...b.rot);
  scene.add(bud);
});

scene.add(createLeaves(shared, [
  { pos: [-1.5, -0.2, -0.45], rot: [-0.3, 0.4, 1.6], scale: 0.62 },
  { pos: [0.35, -0.95, -0.25], rot: [-0.6, -0.1, 3.3], scale: 0.7 },
  { pos: [1.75, 0.85, -0.55], rot: [-0.4, -0.3, -0.6], scale: 0.7 },
  { pos: [2.1, -0.9, -0.3], rot: [-0.5, -0.4, -2.3], scale: 0.6 },
  { pos: [-0.3, 1.25, -0.6], rot: [-0.2, 0.1, 0.2], scale: 0.55 },
  { pos: [-1.8, -1.2, -0.2], rot: [-0.7, 0.3, 2.8], scale: 0.55 },
  { pos: [0.55, 0.75, -0.9], rot: [-0.3, 0.0, -0.3], scale: 0.6 },
]));

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // pull back on narrow screens so both flowers fit
  camera.fov = w / h < 1 ? 36 / Math.max(w / h, 0.55) : 36;
  camera.updateProjectionMatrix();
  bgUniforms.uAspect.value = w / h;
}
window.addEventListener('resize', resize);
resize();

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock();
function frame() {
  const t = reduceMotion ? 0 : clock.getElapsedTime();
  shared.uTime.value = t;
  flowerA.rotation.z = 0.02 * Math.sin(t * 0.5);
  flowerA.rotation.x = -0.08 + 0.015 * Math.sin(t * 0.37);
  flowerB.rotation.z = 0.3 + 0.025 * Math.sin(t * 0.45 + 1.0);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// handy for poking at the scene from the console
window.passiflora = { scene, camera, controls, shared };
frame();
