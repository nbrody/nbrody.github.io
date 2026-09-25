import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  $('status').textContent = 'This crystal needs WebGL. Try a browser with hardware acceleration enabled.';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
$('canvasHost').append(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.055;
orbit.autoRotateSpeed = 0.22;
orbit.enablePan = false;
orbit.minDistance = 5;
orbit.maxDistance = 110;
let interactionUntil = 0;
orbit.addEventListener('start', () => { interactionUntil = Infinity; });
orbit.addEventListener('end', () => { interactionUntil = performance.now() + 4000; });

const paletteColors = {
  aurora: ['#244d92', '#4ac2ae', '#d0a4f4'],
  pearl: ['#7065ae', '#c2addd', '#fbe5bf'],
  ember: ['#781e47', '#e66e42', '#ffdb8a'],
  blueprint: ['#183777', '#438aeb', '#bdedff'],
};
const presets = {
  aurora: { waveMode: '0', palette: 'aurora', volume: '0', nSlider: 7, aSlider: 0.6, kSlider: 0.65, wSlider: 0.12, rSlider: 0.16, speedSlider: 0.55, layerSlider: 0.3, glowSlider: 0.65 },
  pearl: { waveMode: '1', palette: 'pearl', volume: '1', nSlider: 8, aSlider: 0.85, kSlider: 0.8, wSlider: 0, rSlider: 0.2, speedSlider: 0.38, layerSlider: 0.16, glowSlider: 0.8 },
  ember: { waveMode: '2', palette: 'ember', volume: '0', nSlider: 6, aSlider: 0.75, kSlider: 0.95, wSlider: 0.08, rSlider: 0.19, speedSlider: 0.7, layerSlider: 0.4, glowSlider: 0.85 },
  architect: { waveMode: '3', palette: 'blueprint', volume: '3', nSlider: 9, aSlider: 0.8, kSlider: 0.5, wSlider: 0, rSlider: 0.14, speedSlider: 0.45, layerSlider: 0.25, glowSlider: 0.35 },
};
const uniforms = {
  uTime: { value: 0 }, uAngle: { value: 0 }, uPhase: { value: 0 },
  uAmplitude: { value: 0.6 }, uFrequency: { value: 0.65 }, uLayer: { value: 0.3 },
  uMode: { value: 0 }, uRadius: { value: 0.16 }, uGlow: { value: 0.65 },
  uHeight: { value: innerHeight * renderer.getPixelRatio() },
  uLow: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() },
};
// Each point is a shaded sphere impostor. Wave motion stays on the GPU, so
// changing the lattice size never creates thousands of per-frame JS matrices.
const vertexShader = `
uniform float uTime, uAngle, uPhase, uAmplitude, uFrequency, uLayer, uMode, uRadius, uHeight;
varying float vWave, vDistance;
void main() {
  vec3 p = position;
  vec2 d = vec2(cos(uAngle), sin(uAngle));
  float along = dot(p.xz, d) * uFrequency;
  float across = dot(p.xz, vec2(-d.y, d.x)) * uFrequency;
  float t = uTime + uPhase;
  float layer = p.y * uLayer;
  float wave = sin(along + layer - t);
  if (uMode > 0.5 && uMode < 1.5) wave = sin(length(p.xz) * uFrequency + layer - t);
  if (uMode > 1.5 && uMode < 2.5) wave = 0.5 * (sin(along + layer - t) + sin(across - layer - t * 0.83));
  if (uMode > 2.5) wave = cos(along + layer) * cos(across * 0.7) * sin(t);
  p = p * 1.6 + vec3(0., uAmplitude * wave, 0.);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float pulse = 0.87 + 0.13 * (wave * 0.5 + 0.5);
  gl_PointSize = clamp(uRadius * pulse * uHeight * projectionMatrix[1][1] / max(0.1, -mv.z), 1.5, 180.);
  #ifdef HALO
    gl_PointSize *= 4.5;
  #endif
  vWave = wave * 0.5 + 0.5;
  vDistance = -mv.z;
}`;
const fragmentShader = `
uniform vec3 uLow, uMid, uHigh;
uniform float uGlow;
varying float vWave, vDistance;
void main() {
  vec2 p = gl_PointCoord * 2. - 1.;
  float r2 = dot(p,p);
  if (r2 > 1.) discard;
  vec3 color = mix(uLow, uMid, smoothstep(0.,0.55,vWave));
  color = mix(color, uHigh, smoothstep(0.48,1.,vWave));
  float depth = clamp(1.3 - vDistance / 100., 0.25, 1.);
  #ifdef HALO
    float halo = exp(-r2 * 6.5) * (1. - smoothstep(0.65,1.,r2));
    gl_FragColor = vec4(color * depth, halo * uGlow * 0.19);
  #else
    vec3 normal = vec3(p.x, -p.y, sqrt(1. - r2));
    float light = max(0.,dot(normal, normalize(vec3(-0.4,0.65,1.))));
    float spec = pow(max(0.,dot(normal,normalize(vec3(-0.25,0.4,1.)))),24.);
    float rim = pow(1. - normal.z,2.5);
    vec3 lit = color * (0.4 + 0.75 * light) + vec3(0.65,0.82,0.9) * spec * 0.3 + color * rim * 0.25;
    gl_FragColor = vec4(lit * depth, 1. - smoothstep(0.78, 1., r2));
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const coreMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true });
const haloMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, defines: { HALO: 1 }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
let core, halo, geometry;
const guides = new THREE.Group();
scene.add(guides);
let bounds;
let previousN;
const edgeMaterial = new THREE.LineBasicMaterial({ color: '#527685', transparent: true, opacity: 0.19 });
const floorMaterial = new THREE.LineBasicMaterial({ color: '#41646e', transparent: true, opacity: 0.18 });
let floor;
const direction = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4, '#8bd6c2', 0.8, 0.3);
guides.add(direction);

function rebuild() {
  const N = +$('nSlider').value;
  const volume = +$('volume').value;
  if (previousN && previousN !== N) camera.position.multiplyScalar((N * 1.6 + 2) / (previousN * 1.6 + 2));
  previousN = N;
  const positions = [];
  for (let x = -N; x <= N; x++) for (let y = -N; y <= N; y++) for (let z = -N; z <= N; z++) {
    if (volume === 1 && x*x + y*y + z*z > N*N) continue;
    if (volume === 2 && y !== 0) continue;
    if (volume === 3 && x !== 0 && y !== 0 && z !== 0) continue;
    positions.push(x, y, z);
  }
  if (core) { scene.remove(core, halo); geometry.dispose(); }
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  core = new THREE.Points(geometry, coreMaterial);
  halo = new THREE.Points(geometry, haloMaterial);
  core.frustumCulled = halo.frustumCulled = false;
  scene.add(core, halo);
  if (bounds) { guides.remove(bounds, floor); bounds.geometry.dispose(); floor.geometry.dispose(); }
  const box = new THREE.BoxGeometry(N * 3.2 + 1.6, N * 3.2 + 2.4, N * 3.2 + 1.6);
  bounds = new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMaterial);
  box.dispose();
  const extent = N * 1.6 + 0.8;
  const vertices = [];
  for (let i = -N; i <= N; i++) {
    vertices.push(-extent, -extent - 0.5, i * 1.6, extent, -extent - 0.5, i * 1.6);
    vertices.push(i * 1.6, -extent - 0.5, -extent, i * 1.6, -extent - 0.5, extent);
  }
  floor = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), floorMaterial);
  guides.add(bounds, floor);
  direction.position.set(0, -extent - 0.4, 0);
  direction.setLength(extent * 0.8, 0.6, 0.25);
  $('pointCount').textContent = `${(positions.length / 3).toLocaleString()} lattice points · N = ${N}`;
  renderer.domElement.dataset.pointCount = positions.length / 3;
}
function home(view = 'home') {
  const N = +$('nSlider').value;
  // Account for narrow viewports: the whole crystal should fit beside the sidebar.
  const distance = (N * 1.6 + 2) * 4.4 / Math.min(1, camera.aspect);
  const vector = view === 'top' ? new THREE.Vector3(0, 1, 0.001) : view === 'front' ? new THREE.Vector3(0, 0.03, 1) : new THREE.Vector3(1.2, 0.85, 1.55);
  camera.position.copy(vector.normalize().multiplyScalar(distance));
  orbit.maxDistance = Math.max(110, distance * 2);
  camera.far = Math.max(300, distance * 3);
  camera.updateProjectionMatrix();
  orbit.target.set(0,0,0);
  orbit.update();
}
function updatePalette() {
  const colors = paletteColors[$('palette').value];
  ['uLow','uMid','uHigh'].forEach((key, i) => uniforms[key].value.set(colors[i]));
}
const numericUniforms = { aSlider: 'uAmplitude', kSlider: 'uFrequency', rSlider: 'uRadius', layerSlider: 'uLayer', phaseSlider: 'uPhase', waveMode: 'uMode', glowSlider: 'uGlow' };
let applyingPreset = false;
let sceneSeconds = 0;
function syncControl(node) {
  if (numericUniforms[node.id]) uniforms[numericUniforms[node.id]].value = +node.value;
  if (node.id === 'palette') updatePalette();
  if (node.id === 'nSlider' || node.id === 'volume') rebuild();
  if (node.id === 'guidesToggle') guides.visible = node.checked;
  if (node.type === 'range') {
    const output = document.querySelector(`label[for="${node.id}"] output`);
    if (output) output.textContent = Number(node.value).toFixed(node.step === '1' ? 0 : 2);
  }
  if (!applyingPreset && Object.keys(presets.aurora).includes(node.id)) $('scenePreset').value = 'custom';
}
function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;
  applyingPreset = true;
  for (const [id, value] of Object.entries(preset)) { $(id).value = value; syncControl($(id)); }
  $('scenePreset').value = name;
  sceneSeconds = 0;
  applyingPreset = false;
  home();
}
for (const node of document.querySelectorAll('input, select')) {
  if (node.id === 'scenePreset') node.addEventListener('input', () => applyPreset(node.value));
  else node.addEventListener('input', () => syncControl(node));
}
$('homeView').onclick = () => home();
$('topView').onclick = () => { $('orbitToggle').checked = false; home('top'); };
$('frontView').onclick = () => { $('orbitToggle').checked = false; home('front'); };
$('restartWave').onclick = () => { uniforms.uTime.value = 0; uniforms.uAngle.value = 0; $('phaseSlider').value = 0; syncControl($('phaseSlider')); };
window.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); $('playToggle').checked = !$('playToggle').checked; }
  if (e.key.toLowerCase() === 'r') home();
});

applyPreset('aurora');
for (const input of document.querySelectorAll('input[type=range]')) {
  const output = document.querySelector(`label[for="${input.id}"] output`);
  if (output) output.textContent = Number(input.value).toFixed(input.step === '1' ? 0 : 2);
}
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { $('playToggle').checked = false; $('orbitToggle').checked = false; }
const clock = new THREE.Clock();
let lastAspect = camera.aspect;
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  uniforms.uHeight.value = innerHeight * renderer.getPixelRatio();
  if (Math.abs(camera.aspect - lastAspect) > 0.25) home();
  lastAspect = camera.aspect;
});
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); $('status').hidden = false; $('status').textContent = 'Graphics paused. Reload this visualization to restore it.'; });
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (document.hidden) return;
  const playing = $('playToggle').checked;
  if (playing) {
    uniforms.uTime.value += dt * +$('speedSlider').value * 1.4;
    uniforms.uAngle.value += dt * +$('wSlider').value;
    sceneSeconds += dt;
    if ($('tourToggle').checked && sceneSeconds > 24) {
      const names = Object.keys(presets);
      applyPreset(names[(names.indexOf($('scenePreset').value) + 1) % names.length]);
    }
  }
  orbit.autoRotate = $('orbitToggle').checked && playing && performance.now() > interactionUntil;
  orbit.update(dt);
  direction.setDirection(new THREE.Vector3(Math.cos(uniforms.uAngle.value), 0, Math.sin(uniforms.uAngle.value)));
  renderer.render(scene, camera);
  // Expose lightweight rendering health for integration checks, not animation state.
  if (performance.now() - last > 1000) { renderer.domElement.dataset.drawCalls = renderer.info.render.calls; last = performance.now(); }
}
animate();
$('status').hidden = true;
