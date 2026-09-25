import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// One small shader: a color gradient and simple directional shading.
const vertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */`
  uniform vec3 baseColor;
  uniform vec3 tipColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec3 color = mix(baseColor, tipColor, smoothstep(0.2, 1.0, vUv.y));
    float light = 0.65 + 0.35 * abs(dot(normalize(vNormal), normalize(vec3(-0.4, 0.6, 1.0))));
    gl_FragColor = vec4(color * light, 1.0);
    #include <colorspace_fragment>
  }
`;
function material(base, tip = base) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, side: THREE.DoubleSide,
    uniforms: { baseColor: { value: new THREE.Color(base) }, tipColor: { value: new THREE.Color(tip) } }
  });
}
const canvas = document.querySelector('canvas');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (error) {
  document.querySelector('#status').textContent = 'WebGL is needed to display this flower.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#192b25');
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 16;
function reset() { camera.position.set(0, -2.5, 9); controls.target.set(0, 0, 0); controls.update(); }
reset();
document.querySelector('#reset').onclick = reset;

const petalMaterial = material('#e0e5bb', '#99b276');
const purpleMaterial = material('#402044', '#b6a0ef');
const greenMaterial = material('#adbd59');
const darkMaterial = material('#583047');
function add(geometry, mat, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(x, y, z);
  scene.add(object);
  return object;
}

// Ten flat ellipses, arranged like the spokes of a wheel.
const petalGeometry = new THREE.CircleGeometry(1, 32);
for (let i = 0; i < 10; i++) {
  const angle = i * Math.PI / 5;
  const petal = add(petalGeometry, petalMaterial, Math.cos(angle) * 1.22, Math.sin(angle) * 1.22, -0.05);
  petal.scale.set(0.36, 1.0, 1);
  petal.rotation.z = angle - Math.PI / 2;
}

// Just one ring of straight cylinders; their UVs carry the purple gradient.
const filamentGeometry = new THREE.CylinderGeometry(0.016, 0.024, 1.35, 6);
for (let i = 0; i < 64; i++) {
  const angle = i * Math.PI * 2 / 64;
  const filament = add(filamentGeometry, purpleMaterial, Math.cos(angle) * 1.18, Math.sin(angle) * 1.18, 0.08);
  filament.rotation.z = angle - Math.PI / 2;
}
add(new THREE.CircleGeometry(0.55, 48), darkMaterial, 0, 0, 0.10);
add(new THREE.CircleGeometry(0.38, 32), greenMaterial, 0, 0, 0.12);

// A short upright stalk, five oval anthers, and three round stigma tips.
const stalk = add(new THREE.CylinderGeometry(0.065, 0.065, 0.65, 12), greenMaterial, 0, 0, 0.43);
stalk.rotation.x = Math.PI / 2;
const sphere = new THREE.SphereGeometry(1, 16, 10);
function arm(angle, radius, height, mat) {
  const stick = add(new THREE.CylinderGeometry(0.035, 0.035, radius, 8), mat,
    Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, height);
  stick.rotation.z = angle - Math.PI / 2;
}
for (let i = 0; i < 5; i++) {
  const angle = i * Math.PI * 2 / 5;
  arm(angle, 0.52, 0.55, greenMaterial);
  const anther = add(sphere, greenMaterial, Math.cos(angle) * 0.52, Math.sin(angle) * 0.52, 0.55);
  anther.scale.set(0.18, 0.08, 0.06);
  anther.rotation.z = angle + Math.PI / 2;
}
for (let i = 0; i < 3; i++) {
  const angle = i * Math.PI * 2 / 3 + 0.5;
  arm(angle, 0.4, 0.8, darkMaterial);
  add(sphere, greenMaterial, Math.cos(angle) * 0.4, Math.sin(angle) * 0.4, 0.8).scale.setScalar(0.085);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / Math.min(1, camera.aspect)));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
document.querySelector('#status').hidden = true;
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
