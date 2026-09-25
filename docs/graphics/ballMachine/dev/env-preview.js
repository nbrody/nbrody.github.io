// Preview harness for js/environment.js — orbit camera, time-of-day controls, stats,
// and a placeholder "machine" (painted supports + chrome/steel/brass to judge reflections).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildEnvironment } from '../js/environment.js';

const errEl = document.getElementById('err');
window.addEventListener('error', (e) => { errEl.textContent += `${e.message}\n`; });
window.addEventListener('unhandledrejection', (e) => { errEl.textContent += `${e.reason}\n`; });

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(0.5, 1.7, 11.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3.6, 0);
controls.enableDamping = true;
controls.update();

// ------------------------------------------------------ placeholder machine ---
const machine = new THREE.Group();
machine.name = 'placeholder-machine';
{
  const paint = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.05 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd7dde2, roughness: 0.16, metalness: 1 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9ad55, roughness: 0.22, metalness: 1 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true;
    machine.add(m);
    return m;
  };
  const Y = 0.25;
  add(new THREE.CylinderGeometry(4.9, 5.0, 0.12, 96), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 }), 0, Y + 0.06, 0);
  add(new THREE.BoxGeometry(0.5, 7.5, 0.5), paint(0xc8272b), 1.8, Y + 3.75, -1.2);        // red tower (lift)
  add(new THREE.CylinderGeometry(0.3, 0.3, 6, 24), paint(0xf2c21a), -2.2, Y + 3, 0.8);     // yellow
  add(new THREE.CylinderGeometry(0.25, 0.25, 5, 24), paint(0x1f5fbf), 0.5, Y + 2.5, 2.4);  // blue
  add(new THREE.BoxGeometry(0.6, 4, 0.6), paint(0x2f9a45), -1.0, Y + 2, -2.8);             // green
  add(new THREE.CylinderGeometry(0.18, 0.18, 6.8, 20), paint(0xf07a1a), -3.4, Y + 3.4, -1.4); // orange
  add(new THREE.TorusGeometry(1.2, 0.06, 16, 64), paint(0xf07a1a), 2.6, 4.2, 1.6, 0, 0.6, 0);
  // stainless helix rail
  const pts = [];
  for (let i = 0; i <= 400; i++) { const t = i / 400, a = t * Math.PI * 6; pts.push(new THREE.Vector3(Math.cos(a) * 3.5, 0.9 + t * 5.8, Math.sin(a) * 3.5)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  add(new THREE.TubeGeometry(curve, 600, 0.03, 8), steel, 0, 0, 0);
  add(new THREE.TubeGeometry(curve, 600, 0.03, 8), steel, 0, 0.09, 0);
  for (let i = 0; i < 7; i++) add(new THREE.SphereGeometry(0.045, 20, 14), steel, ...curve.getPoint(0.1 + i * 0.12).add(new THREE.Vector3(0, 0.08, 0)).toArray());
  add(new THREE.SphereGeometry(0.55, 64, 48), chrome, -3.2, 1.2, 2.6);
  add(new THREE.SphereGeometry(0.4, 64, 48), chrome, 3.0, 5.2, -2.2);
  add(new THREE.SphereGeometry(0.35, 48, 32), brass, 0, 7.4, 0);
  // brass bell
  const bell = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; bell.push(new THREE.Vector2(0.05 + 0.32 * Math.pow(t, 1.8) + 0.05 * Math.sin(t * Math.PI), 0.55 * (1 - t))); }
  add(new THREE.LatheGeometry(bell, 48), brass, -2.5, 5.6, -1.6);
  scene.add(machine);
}

// -------------------------------------------------------------- environment ---
const t0 = performance.now();
const env = buildEnvironment(scene, renderer, { timeOfDay: Number(params.get('t') ?? 17.5), quality: params.get('q') || 'high' });
const buildMs = performance.now() - t0;
console.log(`[env-preview] buildEnvironment ${buildMs.toFixed(0)} ms`, env.stats);

// ------------------------------------------------------------------- UI ---
const tod = document.getElementById('tod');
const timeEl = document.getElementById('time');
const statsEl = document.getElementById('stats');
const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
function setTime(h) {
  env.setTimeOfDay(h);
  tod.value = String(h);
  timeEl.textContent = fmt(env.timeOfDay);
}
tod.addEventListener('input', () => setTime(Number(tod.value)));
const presets = { Morning: 8, Noon: 12.5, Golden: 17.5, Dusk: 19.3, Night: 22 };
const presetBox = document.getElementById('presets');
for (const [name, h] of Object.entries(presets)) {
  const b = document.createElement('button');
  b.textContent = `${name} ${fmt(h)}`;
  b.onclick = () => setTime(h);
  presetBox.appendChild(b);
}
const VIEWS = {
  eye: [[0.5, 1.7, 11.8], [0, 3.6, 0]],
  low: [[4.3, 0.42, 5.5], [-2, 2.2, -2]],
  dome: [[0.8, 1.6, 7.2], [0, 17, -3.5]],
  inside: [[1.2, 3.2, 0.8], [10, 4.6, 7]],
  insideUp: [[0.6, 2.4, -0.4], [-6.5, 12.5, -8]],
  overview: [[7.2, 13.0, 7.8], [0, 2.5, 0]],
  plants: [[9.6, 1.6, 3.2], [12.5, 3.2, -4]],
  path: [[0, 1.65, -12.8], [0, 3.2, 0]],
  gallery: [[-7.5, 9.8, 5.5], [8, 7, -6]],
};
const viewBox = document.getElementById('views');
function setView(name) {
  const v = VIEWS[name];
  if (!v) return;
  camera.position.set(...v[0]);
  controls.target.set(...v[1]);
  controls.update();
}
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => setView(name);
  viewBox.appendChild(b);
}
document.getElementById('machine').addEventListener('change', (e) => { machine.visible = e.target.checked; });
const animateEl = document.getElementById('animate');
const rotateEl = document.getElementById('rotate');

// ------------------------------------------------------------ loop & stats ---
const clock = new THREE.Clock();
let elapsed = 0, frameTimes = [], lastInfo = { calls: 0, triangles: 0 };
function frame(dt) {
  elapsed += dt;
  if (animateEl.checked) setTime((env.timeOfDay + dt * 0.4) % 24);
  if (rotateEl.checked) { controls.autoRotate = true; controls.autoRotateSpeed = 0.6; } else controls.autoRotate = false;
  controls.update();
  env.update(dt, elapsed, camera);
  renderer.render(scene, camera);
  lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, lines: renderer.info.render.lines };
}
function measure() {
  // three r169 resets renderer.info *after* the shadow pass, so count manually:
  // full frame (shadow + main) vs. main pass only (shadow map reused).
  const info = renderer.info;
  info.autoReset = false;
  info.reset();
  renderer.shadowMap.autoUpdate = true;
  renderer.render(scene, camera);
  const full = { calls: info.render.calls, triangles: info.render.triangles };
  info.reset();
  renderer.shadowMap.autoUpdate = false;
  renderer.render(scene, camera);
  const main = { calls: info.render.calls, triangles: info.render.triangles };
  renderer.shadowMap.autoUpdate = true;
  info.autoReset = true;
  // environment-only share of the main pass
  const machineVisible = machine.visible;
  machine.visible = false;
  info.autoReset = false; info.reset();
  renderer.shadowMap.autoUpdate = true;
  renderer.render(scene, camera);
  const envFull = { calls: info.render.calls, triangles: info.render.triangles };
  info.autoReset = true;
  machine.visible = machineVisible;
  return { main, shadow: { calls: full.calls - main.calls, triangles: full.triangles - main.triangles }, full, envOnlyFull: envFull, memory: { ...info.memory }, programs: info.programs.length };
}
let lastStats = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = performance.now();
  frame(dt);
  frameTimes.push(performance.now() - t);
  if (frameTimes.length > 60) frameTimes.shift();
  if (t - lastStats > 500) {
    lastStats = t;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    statsEl.textContent =
      `draw calls  ${lastInfo.calls}\ntriangles   ${lastInfo.triangles.toLocaleString()}\npoints      ${lastInfo.points}\n` +
      `programs    ${renderer.info.programs.length}   geoms ${renderer.info.memory.geometries}  tex ${renderer.info.memory.textures}\n` +
      `cpu frame   ${avg.toFixed(2)} ms   build ${buildMs.toFixed(0)} ms\nenv maps    ${env.stats.envRegenerations}   time ${fmt(env.timeOfDay)}`;
  }
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// hooks for automated inspection (render on demand when the pane is hidden)
window.__preview = {
  THREE, renderer, scene, camera, controls, env, machine, setView, setTime, measure, VIEWS,
  renderNow(n = 1) { for (let i = 0; i < n; i++) frame(1 / 60); env.flushEnvMap(); frame(1 / 60); return lastInfo; },
  /** Render only the sub-rectangle (x0,y0)-(x1,y1) of the current view full-frame.
   *  Coordinates are in screenshot space (shotW px wide; the pane scales screenshots down). */
  zoom(x0, y0, x1, y1, shotW = 800) {
    const W = window.innerWidth, H = window.innerHeight;
    const k = W / shotW;
    x0 *= k; y0 *= k; x1 *= k; y1 *= k;
    let w = x1 - x0, h = y1 - y0;
    const aspect = W / H;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    camera.setViewOffset(W, H, x0, y0, w, h);
    this.renderNow(1);
  },
  unzoom() { camera.clearViewOffset(); this.renderNow(1); },
  /** GPU time per frame (ms) via EXT_disjoint_timer_query_webgl2; renders `frames` frames. */
  async gpuTime(frames = 40, pixelRatio = null) {
    const gl = renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const prevPR = renderer.getPixelRatio();
    if (pixelRatio) renderer.setPixelRatio(pixelRatio);
    const qs = [];
    for (let i = 0; i < frames; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      frame(1 / 60);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      qs.push(q);
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 300));
    const t = [];
    for (const q of qs) {
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) t.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (pixelRatio) renderer.setPixelRatio(prevPR);
    t.sort((a, b) => a - b);
    return { samples: t.length, medianMs: +(t[t.length >> 1] ?? NaN).toFixed(2), p90Ms: +(t[Math.floor(t.length * 0.9)] ?? NaN).toFixed(2), buffer: `${size.x}x${size.y}` };
  },
  panel(show) { document.getElementById('panel').style.display = show ? '' : 'none'; },
};
