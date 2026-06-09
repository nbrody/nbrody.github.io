// Hopf Fibration Visualization
// S^3 ⊂ R^4 → S^2 ⊂ R^3, projected to R^3 by stereographic projection.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- State ----------
const state = {
  shells: 1,
  fibersPerShell: 12,
  resolution: 120,
  rotXW: 0,
  rotYZ: 0,
  rotZW: 0,
  autoXW: false,
  autoYZ: false,
  autoZW: false,
  flowSpeed: 1.0,
  tubeRadius: 0.12,
  projScale: 4.0,
  orthographic: false,
  cameraAutoOrbit: true,
  wander: false,
  wanderTime: 0,
  active: { theta: Math.PI / 2, phi: 0 },
};

// Pseudo-random per-fiber drift constants (deterministic for a given index).
function fiberDrift(idx) {
  const a = Math.sin(idx * 12.9898) * 43758.5453;
  const b = Math.sin(idx * 78.233) * 12345.6789;
  const c = Math.sin(idx * 39.4123) * 9876.54321;
  const d = Math.sin(idx * 5.7281) * 54321.0;
  return {
    thetaAmp: 0.25 + 0.25 * (a - Math.floor(a)),
    thetaFreq: 0.3 + 0.6 * (b - Math.floor(b)),
    thetaPhase: 2 * Math.PI * (c - Math.floor(c)),
    phiRate: 0.15 + 0.3 * (d - Math.floor(d)),
  };
}

// ---------- Three.js setup ----------
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x04060c, 1);

const scene = new THREE.Scene();

let camera;
function makeCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  if (state.orthographic) {
    const s = 5;
    camera = new THREE.OrthographicCamera(-s * aspect, s * aspect, s, -s, 0.1, 200);
  } else {
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
  }
  camera.position.set(7, 5, 9);
  camera.lookAt(0, 0, 0);
}
makeCamera();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = state.cameraAutoOrbit;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(5, 8, 6);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc084fc, 0.35);
rimLight.position.set(-6, -4, -3);
scene.add(rimLight);

const originGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.04, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
);
scene.add(originGlow);

const fiberGroup = new THREE.Group();
scene.add(fiberGroup);

// ---------- Math: Hopf fibers ----------
// For p = (sin θ cos φ, sin θ sin φ, cos θ) on S^2, the Hopf fiber is
//   F(ψ) = ( cos(θ/2) cos(ψ+φ),
//            cos(θ/2) sin(ψ+φ),
//            sin(θ/2) cos(ψ),
//            sin(θ/2) sin(ψ) )    ∈ S^3 ⊂ R^4.
// We apply optional R^4 rotations and stereographically project from (0,0,0,1).

function hopfPoint(theta, phi, psi, out) {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  out[0] = c * Math.cos(psi + phi);
  out[1] = c * Math.sin(psi + phi);
  out[2] = s * Math.cos(psi);
  out[3] = s * Math.sin(psi);
  return out;
}

function rotateXW(v, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const x = v[0], w = v[3];
  v[0] = ca * x - sa * w;
  v[3] = sa * x + ca * w;
}
function rotateYZ(v, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const y = v[1], z = v[2];
  v[1] = ca * y - sa * z;
  v[2] = sa * y + ca * z;
}
function rotateZW(v, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const z = v[2], w = v[3];
  v[2] = ca * z - sa * w;
  v[3] = sa * z + ca * w;
}

// Stereographic projection R^4 \ {(0,0,0,1)} → R^3, with denom clamped so fibers
// passing close to the pole stay finite (slight near-pole distortion).
function stereo(v, scale, out) {
  let d = 1 - v[3];
  const eps = 0.02;
  if (Math.abs(d) < eps) d = d < 0 ? -eps : eps;
  const k = scale / d;
  out.set(v[0] * k, v[1] * k, v[2] * k);
}

function buildFiber(theta, phi, radius, color, segments) {
  const pts = new Array(segments);
  const tmp4 = [0, 0, 0, 0];
  const tmp3 = new THREE.Vector3();
  for (let i = 0; i < segments; i++) {
    const psi = (i / segments) * Math.PI * 2;
    hopfPoint(theta, phi, psi, tmp4);
    rotateXW(tmp4, state.rotXW);
    rotateYZ(tmp4, state.rotYZ);
    rotateZW(tmp4, state.rotZW);
    stereo(tmp4, state.projScale, tmp3);
    pts[i] = tmp3.clone();
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const geom = new THREE.TubeGeometry(curve, segments, radius, 12, true);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.2,
    emissive: color,
    emissiveIntensity: 0.18,
  });
  return new THREE.Mesh(geom, mat);
}

function fiberColor(theta, phi) {
  const hue = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
  const light = 0.45 + 0.2 * Math.cos(theta);
  return new THREE.Color().setHSL(hue, 0.8, light);
}

function chooseBasePoints() {
  const list = [];
  const N = state.shells;
  const t = state.wanderTime;
  let idx = 0;
  for (let s = 0; s < N; s++) {
    const theta0 = ((s + 1) / (N + 1)) * Math.PI;
    const fibers = state.fibersPerShell;
    for (let i = 0; i < fibers; i++) {
      const phi0 = (i / fibers) * Math.PI * 2;
      let theta = theta0, phi = phi0;
      if (state.wander) {
        const d = fiberDrift(idx);
        theta = theta0 + d.thetaAmp * Math.sin(t * d.thetaFreq + d.thetaPhase);
        // Clamp θ away from poles to keep parameterization stable.
        const eps = 0.05;
        theta = Math.max(eps, Math.min(Math.PI - eps, theta));
        phi = phi0 + t * d.phiRate;
      }
      list.push({ theta, phi, theta0, phi0, active: false });
      idx++;
    }
  }
  list.push({ theta: state.active.theta, phi: state.active.phi, active: true });
  return list;
}

function rebuildFibers() {
  while (fiberGroup.children.length) {
    const c = fiberGroup.children.pop();
    c.geometry?.dispose();
    c.material?.dispose();
  }
  const base = chooseBasePoints();
  const segments = state.resolution;
  for (const { theta, phi, theta0, phi0, active } of base) {
    const color = active ? new THREE.Color(0x00f0ff) : fiberColor(theta0, phi0);
    const radius = active ? state.tubeRadius : state.tubeRadius * 0.45;
    const mesh = buildFiber(theta, phi, radius, color, segments);
    if (active) mesh.material.emissiveIntensity = 0.55;
    fiberGroup.add(mesh);
  }
}

// ---------- Resize ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
  } else {
    const s = 5;
    camera.left = -s * aspect; camera.right = s * aspect;
    camera.top = s; camera.bottom = -s;
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Base-sphere widget ----------
const baseCanvas = document.getElementById('baseSphereCanvas');
const baseCtx = baseCanvas.getContext('2d');
const baseView = { rotY: 0.6, rotX: 0.4 };

function projectSpherePoint(theta, phi) {
  let x = Math.sin(theta) * Math.cos(phi);
  let y = Math.sin(theta) * Math.sin(phi);
  let z = Math.cos(theta);
  const cy = Math.cos(baseView.rotY), sy = Math.sin(baseView.rotY);
  let x2 = cy * x + sy * z;
  let z2 = -sy * x + cy * z;
  x = x2; z = z2;
  const cx = Math.cos(baseView.rotX), sx = Math.sin(baseView.rotX);
  let y2 = cx * y - sx * z;
  z2 = sx * y + cx * z;
  y = y2; z = z2;
  return { x, y, z };
}

function drawBaseSphere() {
  const W = baseCanvas.width, H = baseCanvas.height;
  baseCtx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;

  const grad = baseCtx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  grad.addColorStop(0, 'rgba(192,132,252,0.25)');
  grad.addColorStop(1, 'rgba(9,14,28,0.9)');
  baseCtx.fillStyle = grad;
  baseCtx.beginPath();
  baseCtx.arc(cx, cy, R, 0, Math.PI * 2);
  baseCtx.fill();
  baseCtx.strokeStyle = 'rgba(255,255,255,0.18)';
  baseCtx.lineWidth = 1;
  baseCtx.stroke();

  baseCtx.strokeStyle = 'rgba(255,255,255,0.10)';
  for (let i = 1; i < 6; i++) {
    const theta = (i / 6) * Math.PI;
    baseCtx.beginPath();
    for (let j = 0; j <= 64; j++) {
      const phi = (j / 64) * Math.PI * 2;
      const p = projectSpherePoint(theta, phi);
      const sx = cx + p.x * R, sy = cy - p.y * R;
      if (j === 0) baseCtx.moveTo(sx, sy); else baseCtx.lineTo(sx, sy);
    }
    baseCtx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const phi = (i / 12) * Math.PI * 2;
    baseCtx.beginPath();
    for (let j = 0; j <= 64; j++) {
      const theta = (j / 64) * Math.PI;
      const p = projectSpherePoint(theta, phi);
      const sx = cx + p.x * R, sy = cy - p.y * R;
      if (j === 0) baseCtx.moveTo(sx, sy); else baseCtx.lineTo(sx, sy);
    }
    baseCtx.stroke();
  }

  // Dots for every fiber's base point, color-matched to the fiber.
  for (const bp of chooseBasePoints()) {
    if (bp.active) continue;
    {
      const theta = bp.theta, phi = bp.phi;
      const pt = projectSpherePoint(theta, phi);
      const px = cx + pt.x * R, py = cy - pt.y * R;
      const front = pt.z >= 0;
      const col = fiberColor(bp.theta0, bp.phi0);
      const css = `rgb(${(col.r*255)|0},${(col.g*255)|0},${(col.b*255)|0})`;
      baseCtx.globalAlpha = front ? 1.0 : 0.35;
      baseCtx.fillStyle = css;
      baseCtx.beginPath();
      baseCtx.arc(px, py, front ? 4 : 2.5, 0, Math.PI * 2);
      baseCtx.fill();
    }
  }
  baseCtx.globalAlpha = 1;

  // Active fiber marker (cyan, ringed).
  const p = projectSpherePoint(state.active.theta, state.active.phi);
  const sx = cx + p.x * R, sy = cy - p.y * R;
  const front = p.z >= 0;
  baseCtx.shadowBlur = front ? 14 : 0;
  baseCtx.shadowColor = '#00f0ff';
  baseCtx.fillStyle = front ? '#00f0ff' : 'rgba(0,240,255,0.4)';
  baseCtx.beginPath();
  baseCtx.arc(sx, sy, front ? 7 : 5, 0, Math.PI * 2);
  baseCtx.fill();
  baseCtx.shadowBlur = 0;
  baseCtx.strokeStyle = 'rgba(255,255,255,0.9)';
  baseCtx.lineWidth = 1.5;
  baseCtx.stroke();
}

let dragging = false;
let dragMoved = false;
let lastDrag = { x: 0, y: 0 };
baseCanvas.addEventListener('pointerdown', (e) => {
  dragging = true; dragMoved = false;
  lastDrag.x = e.clientX; lastDrag.y = e.clientY;
  baseCanvas.setPointerCapture(e.pointerId);
});
baseCanvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastDrag.x, dy = e.clientY - lastDrag.y;
  if (dx * dx + dy * dy > 4) dragMoved = true;
  lastDrag.x = e.clientX; lastDrag.y = e.clientY;
  baseView.rotY += dx * 0.01;
  baseView.rotX += dy * 0.01;
  baseView.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, baseView.rotX));
});
baseCanvas.addEventListener('pointerup', (e) => {
  dragging = false;
  if (!dragMoved) {
    const rect = baseCanvas.getBoundingClientRect();
    const W = baseCanvas.width, H = baseCanvas.height;
    const R = Math.min(W, H) * 0.42;
    const cx = W / 2, cy = H / 2;
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    const ux = (mx - cx) / R;
    const uy = -(my - cy) / R;
    const r2 = ux * ux + uy * uy;
    if (r2 <= 1) {
      const uz = Math.sqrt(1 - r2);
      let x = ux, y = uy, z = uz;
      const cxr = Math.cos(-baseView.rotX), sxr = Math.sin(-baseView.rotX);
      let y2 = cxr * y - sxr * z;
      let z2 = sxr * y + cxr * z;
      y = y2; z = z2;
      const cyr = Math.cos(-baseView.rotY), syr = Math.sin(-baseView.rotY);
      let x2 = cyr * x + syr * z;
      z2 = -syr * x + cyr * z;
      x = x2; z = z2;
      const theta = Math.acos(Math.max(-1, Math.min(1, z)));
      const phi = Math.atan2(y, x);
      state.active.theta = theta;
      state.active.phi = phi;
      rebuildFibers();
    }
  }
});

// ---------- Controls ----------
function bindSlider(id, badgeId, fmt, key, onChange) {
  const el = document.getElementById(id);
  const badge = document.getElementById(badgeId);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    state[key] = v;
    badge.textContent = fmt(v);
    onChange?.();
  });
  badge.textContent = fmt(state[key]);
  el.value = state[key];
}

bindSlider('shellsSlider', 'shellsValue', v => v.toFixed(0), 'shells', rebuildFibers);
bindSlider('fibersSlider', 'fibersValue', v => v.toFixed(0), 'fibersPerShell', rebuildFibers);
bindSlider('resolutionSlider', 'resolutionValue', v => v.toFixed(0), 'resolution', rebuildFibers);
bindSlider('rotXW', 'rotXWValue', v => v.toFixed(2) + ' rad', 'rotXW', rebuildFibers);
bindSlider('rotYZ', 'rotYZValue', v => v.toFixed(2) + ' rad', 'rotYZ', rebuildFibers);
bindSlider('rotZW', 'rotZWValue', v => v.toFixed(2) + ' rad', 'rotZW', rebuildFibers);
bindSlider('flowSpeedSlider', 'flowSpeedValue', v => v.toFixed(1) + '×', 'flowSpeed');
bindSlider('tubeRadiusSlider', 'tubeRadiusValue', v => v.toFixed(2), 'tubeRadius', rebuildFibers);
bindSlider('projScaleSlider', 'projScaleValue', v => v.toFixed(1), 'projScale', rebuildFibers);

function bindToggle(id, key) {
  const el = document.getElementById(id);
  el.addEventListener('click', () => {
    state[key] = !state[key];
    el.classList.toggle('active', state[key]);
    el.textContent = state[key] ? '⏸' : '▶';
  });
}
bindToggle('autoRotXW', 'autoXW');
bindToggle('autoRotYZ', 'autoYZ');
bindToggle('autoRotZW', 'autoZW');

document.getElementById('toggleOrthographic').addEventListener('click', (e) => {
  state.orthographic = !state.orthographic;
  e.currentTarget.textContent = state.orthographic ? 'Orthographic View' : 'Perspective View';
  e.currentTarget.classList.toggle('active', state.orthographic);
  makeCamera();
  controls.object = camera;
  controls.update();
  resize();
});

document.getElementById('toggleAutoRotateCamera').addEventListener('click', (e) => {
  state.cameraAutoOrbit = !state.cameraAutoOrbit;
  controls.autoRotate = state.cameraAutoOrbit;
  e.currentTarget.classList.toggle('active', state.cameraAutoOrbit);
});

document.getElementById('toggleWander').addEventListener('click', (e) => {
  state.wander = !state.wander;
  e.currentTarget.classList.toggle('active', state.wander);
  if (!state.wander) rebuildFibers();
});

// ---------- Presets ----------
const presets = {
  presetHopfLink: { shells: 1, fibersPerShell: 2, resolution: 200, tubeRadius: 0.14 },
  presetSingleTorus: { shells: 1, fibersPerShell: 16, resolution: 160, tubeRadius: 0.08 },
  presetNestedTori: { shells: 3, fibersPerShell: 12, resolution: 140, tubeRadius: 0.07 },
  presetSpiral: { shells: 5, fibersPerShell: 8, resolution: 140, tubeRadius: 0.05 },
  presetDenseField: { shells: 4, fibersPerShell: 24, resolution: 120, tubeRadius: 0.04 },
};
const sliderMap = {
  shells: ['shellsSlider', 'shellsValue', v => v.toFixed(0)],
  fibersPerShell: ['fibersSlider', 'fibersValue', v => v.toFixed(0)],
  resolution: ['resolutionSlider', 'resolutionValue', v => v.toFixed(0)],
  tubeRadius: ['tubeRadiusSlider', 'tubeRadiusValue', v => v.toFixed(2)],
};
function applyPreset(id) {
  const p = presets[id];
  if (!p) return;
  Object.assign(state, p);
  for (const [k, v] of Object.entries(p)) {
    const m = sliderMap[k];
    if (m) {
      document.getElementById(m[0]).value = v;
      document.getElementById(m[1]).textContent = m[2](v);
    }
  }
  document.querySelectorAll('.btn-row button').forEach(b => {
    if (b.id.startsWith('preset')) b.classList.toggle('active', b.id === id);
  });
  rebuildFibers();
}
for (const id of Object.keys(presets)) {
  document.getElementById(id).addEventListener('click', () => applyPreset(id));
}

// ---------- HUD ----------
const hudActive = document.getElementById('hudActiveVal');
const hudRot = document.getElementById('hudRotVal');
function updateHUD() {
  hudActive.textContent = `θ=${state.active.theta.toFixed(2)}, φ=${state.active.phi.toFixed(2)}`;
  hudRot.textContent = `xw=${state.rotXW.toFixed(2)}, yz=${state.rotYZ.toFixed(2)}, zw=${state.rotZW.toFixed(2)}`;
}

// ---------- Animation loop ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  let needsRebuild = false;
  if (state.autoXW) { state.rotXW += dt * 0.4 * state.flowSpeed; needsRebuild = true; }
  if (state.autoYZ) { state.rotYZ += dt * 0.4 * state.flowSpeed; needsRebuild = true; }
  if (state.autoZW) { state.rotZW += dt * 0.4 * state.flowSpeed; needsRebuild = true; }
  if (state.wander) { state.wanderTime += dt * state.flowSpeed; needsRebuild = true; }
  if (needsRebuild) {
    const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    state.rotXW = wrap(state.rotXW);
    state.rotYZ = wrap(state.rotYZ);
    state.rotZW = wrap(state.rotZW);
    document.getElementById('rotXW').value = state.rotXW;
    document.getElementById('rotYZ').value = state.rotYZ;
    document.getElementById('rotZW').value = state.rotZW;
    document.getElementById('rotXWValue').textContent = state.rotXW.toFixed(2) + ' rad';
    document.getElementById('rotYZValue').textContent = state.rotYZ.toFixed(2) + ' rad';
    document.getElementById('rotZWValue').textContent = state.rotZW.toFixed(2) + ' rad';
    rebuildFibers();
  }

  controls.update();
  drawBaseSphere();
  updateHUD();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

rebuildFibers();
requestAnimationFrame(tick);
