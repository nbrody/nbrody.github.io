// main.js — Dead & Company at Sphere.
//
// Every setting lives in a form control in #controls, so the Graphics Studio
// stage, its phone remote and playlist payloads drive the show the same way the
// panel does. Look direction and zoom are kept as floats here and mirrored into
// their sliders, so dragging, pinching and tilting stay smooth.

import { SCENES } from './scenes.js';
import { VERT, COMMON, SCENE_HEAD, SCENE_MAIN, COMPOSITE } from './shaders.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

const canvas = $('dome');
const statusEl = $('status');
const embedded = window.self !== window.top;
if (embedded) document.documentElement.classList.add('embedded');

// Seats: eye position (dome units, ~70 m each), a comfortable pitch, and how
// steeply the rows in front fall away. The floating seat has no rows around it.
const SEATS = {
  floor: { pos: [0, -0.5257, -0.3], pitch: 18, rake: 0, rows: true },
  lower: { pos: [0, -0.4, 0.2], pitch: 10, rake: 0.6, rows: true },
  mid: { pos: [0, -0.25, 0.44], pitch: 10, rake: 0.6, rows: true },
  upper: { pos: [0, -0.08, 0.64], pitch: 6, rake: 0.65, rows: true },
  center: { pos: [0, -0.02, 0.05], pitch: 22, rake: 0, rows: false },
};

let statusTimer = 0;
function say(msg, ms = 4000) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { statusEl.hidden = true; }, ms);
}

// ── controls ────────────────────────────────────────────────────────────────
const sceneSelect = $('scene');
for (const [i, s] of SCENES.entries()) sceneSelect.add(new Option(s.title, s.id, i === 0, i === 0));

function showValue(input) {
  const out = document.querySelector(`label[for="${input.id}"] output`);
  if (out) out.textContent = Number(input.value).toFixed(Number(input.step) < 1 ? 2 : 0);
}
for (const input of document.querySelectorAll('#controls input[type=range]')) {
  showValue(input);
  input.addEventListener('input', () => showValue(input));
}
const num = (id) => Number($(id).value);
const on = (id) => $(id).checked;

const look = { yaw: num('yaw'), pitch: num('pitch'), fov: num('fov') };
function setLook(key, value, fromSlider = false) {
  const v = key === 'yaw' ? wrap180(value) : clamp(value, Number($(key).min), Number($(key).max));
  look[key] = v;
  if (!fromSlider) { $(key).value = Math.round(v); showValue($(key)); }
}
for (const key of ['yaw', 'pitch', 'fov']) $(key).addEventListener('input', () => setLook(key, num(key), true));

let seat = SEATS[$('seat').value] || SEATS.mid;
const camPos = seat.pos.slice();
function setSeat(name, jump = false) {
  seat = SEATS[name] || SEATS.mid;
  $('seat').value = name;
  setLook('pitch', seat.pitch);
  if (jump) camPos.splice(0, 3, ...seat.pos);
}
$('seat').addEventListener('input', () => setSeat($('seat').value));
function nextSeat() {
  const names = Object.keys(SEATS);
  setSeat(names[(names.indexOf($('seat').value) + 1) % names.length]);
}
function recenter() { setLook('yaw', 0); setLook('pitch', seat.pitch); setLook('fov', 100); }

// ── show state ──────────────────────────────────────────────────────────────
let paused = false;
let time = 0;        // global clock (twinkles, drift)
let beats = 0;
let current = 0;     // scene on the dome
let incoming = -1;   // scene fading in, or −1
let wanted = 0;      // scene asked for (starts once its program is ready)
let fade = 1;
let sceneClock = SCENES.map(() => 0);
let inScene = 0;     // seconds since the current scene was asked for
let flash = 0;
let bolt = [0, 1];

const caption = $('caption');
let captionTimer = 0;
function showCaption(s) {
  if (!on('captions')) return;
  caption.querySelector('b').textContent = s.title;
  caption.querySelector('span').textContent = s.sub;
  caption.classList.add('show');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => caption.classList.remove('show'), 7000);
}
$('captions').addEventListener('input', () => { if (!on('captions')) caption.classList.remove('show'); });

function goTo(index) {
  const i = ((index % SCENES.length) + SCENES.length) % SCENES.length;
  sceneSelect.value = SCENES[i].id;
  inScene = 0;
  if (i === wanted) return;
  wanted = i;
  requestProgram(i);
}
sceneSelect.addEventListener('input', () => {
  const i = SCENES.findIndex((s) => s.id === sceneSelect.value);
  if (i < 0) sceneSelect.value = SCENES[wanted].id;
  else goTo(i);
});
$('prevScene').addEventListener('click', () => goTo(wanted - 1));
$('nextScene').addEventListener('click', () => goTo(wanted + 1));
$('randomScene').addEventListener('click', () => goTo(wanted + 1 + Math.floor(Math.random() * (SCENES.length - 1))));

function strike(az) {
  flash = 1;
  bolt = [az ?? (Math.random() - 0.5) * 2.4, 1 + Math.random() * 97];
}
$('lightningBtn').addEventListener('click', () => strike());

function setPaused(p) {
  paused = p;
  $('playPause').textContent = paused ? '▶ Play' : '❚❚ Pause';
}
$('playPause').addEventListener('click', () => setPaused(!paused));
$('recenter').addEventListener('click', recenter);

// ── WebGL ───────────────────────────────────────────────────────────────────
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
if (!gl) {
  say('This show needs WebGL 2. Turn on hardware acceleration or try another browser.', 0);
  throw new Error('WebGL 2 unavailable');
}
const parallel = gl.getExtension('KHR_parallel_shader_compile');
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function startProgram(fragment) {
  const p = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fragment]].map(([type, src]) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
    return s;
  });
  gl.linkProgram(p);
  return { p, shaders, ok: null, u: {} };
}
// With KHR_parallel_shader_compile this never blocks; without it the first check waits for the driver.
function isReady(entry, label) {
  if (entry.ok !== null) return entry.ok;
  if (parallel && !gl.getProgramParameter(entry.p, parallel.COMPLETION_STATUS_KHR)) return false;
  if (!gl.getProgramParameter(entry.p, gl.LINK_STATUS)) {
    const log = entry.shaders.map((s) => gl.getShaderInfoLog(s)).join('\n') || gl.getProgramInfoLog(entry.p);
    entry.ok = false;
    console.error(`${label}:\n${log}`);
    say(`The ${label} shader failed to compile on this device.`, 0);
    return false;
  }
  for (let i = 0, n = gl.getProgramParameter(entry.p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const { name } = gl.getActiveUniform(entry.p, i);
    entry.u[name] = gl.getUniformLocation(entry.p, name);
  }
  for (const s of entry.shaders) gl.deleteShader(s);
  entry.ok = true;
  return true;
}

const composite = startProgram(COMMON + COMPOSITE);
const scenePrograms = new Map();
function requestProgram(i) {
  if (!scenePrograms.has(i)) scenePrograms.set(i, startProgram(COMMON + SCENE_HEAD + SCENES[i].glsl + SCENE_MAIN));
  return scenePrograms.get(i);
}
const sceneReady = (i) => isReady(requestProgram(i), SCENES[i].title);
requestProgram(0);

// Compile the rest in the background, one at a time when the driver can't overlap them.
let warmIndex = 1;
function warmUp() {
  if (warmIndex >= SCENES.length) return;
  if (parallel) { while (warmIndex < SCENES.length) requestProgram(warmIndex++); return; }
  requestProgram(warmIndex);
  sceneReady(warmIndex++);
  setTimeout(warmUp, 120);
}

function set(entry, name, ...v) {
  const loc = entry.u[name];
  if (loc === undefined) return;
  if (v.length === 1) gl.uniform1f(loc, v[0]);
  else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
  else gl.uniform3f(loc, v[0], v[1], v[2]);
}

// Screen-content target: mipmapped so the composite can read the screen's average light and glow.
let target = null;
function ensureTarget(w, h) {
  if (target && target.w === w && target.h === h) return;
  if (target) { gl.deleteTexture(target.tex); gl.deleteFramebuffer(target.fbo); }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  target = { tex, fbo, w, h };
}

// ── resolution ──────────────────────────────────────────────────────────────
let dynScale = 0.85;
function resize() {
  const q = $('quality').value;
  const budget = { low: 0.45e6, medium: 0.9e6, high: 2.1e6, auto: 1.6e6 }[q] || 1.2e6;
  const w = Math.max(1, canvas.clientWidth || innerWidth), h = Math.max(1, canvas.clientHeight || innerHeight);
  let f = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / (w * h)));
  if (q === 'auto') f *= dynScale;
  canvas.width = Math.max(2, Math.round(w * f));
  canvas.height = Math.max(2, Math.round(h * f));
}
// Resizing clears the canvas, so it waits for the start of the next frame, which redraws at once.
let needResize = true;
addEventListener('resize', () => { needResize = true; });
$('quality').addEventListener('input', () => { dynScale = 0.85; needResize = true; });

// ── camera ──────────────────────────────────────────────────────────────────
const view = { yaw: look.yaw, pitch: look.pitch, fov: look.fov };
function cameraBasis(yawDeg, pitchDeg) {
  const y = yawDeg * DEG, p = pitchDeg * DEG;
  const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const r = [Math.cos(y), 0, Math.sin(y)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return [...r, ...u, ...f];
}
function lensFov() {
  const fish = $('lens').value === 'fisheye';
  return (fish ? view.fov : Math.min(view.fov, 140)) * DEG;
}
// The dome azimuth under a point on the canvas (for aiming lightning with a double-tap).
function azimuthAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const m = Math.max(rect.width, rect.height);
  const px = (2 * (clientX - rect.left) - rect.width) / m, py = (rect.height - 2 * (clientY - rect.top)) / m;
  const fov = lensFov();
  let d;
  if ($('lens').value === 'fisheye') {
    const r = Math.hypot(px, py), th = r * fov / 2;
    d = r > 1e-6 ? [px / r * Math.sin(th), py / r * Math.sin(th), Math.cos(th)] : [0, 0, 1];
  } else {
    d = [px * Math.tan(fov / 2), py * Math.tan(fov / 2), 1];
  }
  const B = cameraBasis(view.yaw, view.pitch);
  const w = [0, 1, 2].map((k) => B[k] * d[0] + B[3 + k] * d[1] + B[6 + k] * d[2]);
  const n = Math.hypot(...w);
  const rd = w.map((v) => v / n);
  const b = camPos[0] * rd[0] + camPos[1] * rd[1] + camPos[2] * rd[2];
  const c = camPos[0] ** 2 + camPos[1] ** 2 + camPos[2] ** 2 - 1;
  const t = -b + Math.sqrt(Math.max(b * b - c, 0));
  return Math.atan2(camPos[0] + rd[0] * t, -(camPos[2] + rd[2] * t));
}

// ── touch, mouse and keys ───────────────────────────────────────────────────
const pointers = new Map();
let pinch = null;
let lastTap = { t: 0, x: 0, y: 0 };
function dismissHint() { $('hintOverlay').classList.add('gone'); }
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dismissHint();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: look.fov };
  }
  const now = performance.now();
  if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
    strike(azimuthAt(e.clientX, e.clientY));
    lastTap.t = 0;
  } else {
    lastTap = { t: now, x: e.clientX, y: e.clientY };
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size === 1) {
    const k = view.fov / Math.max(canvas.clientWidth, canvas.clientHeight);
    setLook('yaw', look.yaw - (cur.x - prev.x) * k);
    setLook('pitch', look.pitch + (cur.y - prev.y) * k);
  } else if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    setLook('fov', pinch.fov * pinch.dist / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1));
  }
});
const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setLook('fov', look.fov * Math.exp(e.deltaY * 0.001)); }, { passive: false });

function togglePanel(open = document.body.classList.contains('panel-hidden')) {
  document.body.classList.toggle('panel-hidden', !open);
  $('panelToggle').setAttribute('aria-expanded', String(open));
}
$('panelToggle').addEventListener('click', () => togglePanel());
if (!embedded && matchMedia('(max-width: 700px)').matches) togglePanel(false);

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest('input, select, textarea, button')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPaused(!paused); }
  else if (k === 'n') goTo(wanted + 1);
  else if (k === 'p') goTo(wanted - 1);
  else if (k === 'l') strike();
  else if (k === 'a') $('autopilot').checked = !on('autopilot');
  else if (k === 's') nextSeat();
  else if (k === 'r') recenter();
  else if (k === 'h' && !embedded) togglePanel();
  else if (k === 'arrowleft' || k === 'arrowright') setLook('yaw', look.yaw + (k === 'arrowleft' ? -6 : 6));
  else if (k === 'arrowup' || k === 'arrowdown') setLook('pitch', look.pitch + (k === 'arrowup' ? 4 : -4));
  else return;
  dismissHint();
});

// ── tilt to look (the viewing device's own motion sensor) ────────────────────
let tiltRef = null, gotOrientation = false;
function qmul(a, b) {
  return [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
// Device orientation → where the back of the screen points (y up, −z north).
function deviceForward(alpha, beta, gamma, orient) {
  const [x, y, z] = [beta / 2, alpha / 2, -gamma / 2];
  const [c1, c2, c3, s1, s2, s3] = [Math.cos(x), Math.cos(y), Math.cos(z), Math.sin(x), Math.sin(y), Math.sin(z)];
  let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  q = qmul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  q = qmul(q, [0, 0, Math.sin(-orient / 2), Math.cos(-orient / 2)]);
  const [qx, qy, qz, qw] = q, v = [0, 0, -1];
  const ix = qw * v[0] + qy * v[2] - qz * v[1], iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0], iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [ix * qw - iw * qx - iy * qz + iz * qy, iy * qw - iw * qy - iz * qx + ix * qz, iz * qw - iw * qz - ix * qy + iy * qx];
}
function onOrient(e) {
  if (e.alpha == null) return;
  gotOrientation = true;
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const f = deviceForward(e.alpha * DEG, e.beta * DEG, e.gamma * DEG, angle * DEG);
  const yaw = Math.atan2(f[0], -f[2]) / DEG, pitch = Math.asin(clamp(f[1], -1, 1)) / DEG;
  if (!tiltRef) tiltRef = { yaw0: yaw, view: look.yaw };
  setLook('yaw', tiltRef.view + yaw - tiltRef.yaw0);
  setLook('pitch', pitch);
}
async function setTilt(enable) {
  removeEventListener('deviceorientation', onOrient);
  tiltRef = null;
  if (!enable) return;
  try {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('This device has no motion sensor.');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' &&
        (await DeviceOrientationEvent.requestPermission()) !== 'granted') throw new Error('Motion access was declined.');
    gotOrientation = false;
    addEventListener('deviceorientation', onOrient);
    say('Tilt to look around. Tap Recenter view to reset.');
    setTimeout(() => {
      if (on('tilt') && !gotOrientation) { $('tilt').checked = false; setTilt(false); say('No motion sensor reported. Tilt works on phones and tablets.'); }
    }, 2000);
  } catch (err) {
    $('tilt').checked = false;
    say(err.message);
  }
}
$('tilt').addEventListener('change', () => setTilt(on('tilt')));

// ── listen to the room ──────────────────────────────────────────────────────
const mic = { ctx: null, stream: null, analyser: null, bins: null, bass: 0, avg: 0.05, level: 0, pulse: 0, last: 0 };
async function setListen(enable) {
  if (!enable) {
    mic.stream?.getTracks().forEach((t) => t.stop());
    mic.ctx?.close();
    Object.assign(mic, { ctx: null, stream: null, analyser: null });
    return;
  }
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    mic.ctx = new AudioContext();
    mic.analyser = mic.ctx.createAnalyser();
    mic.analyser.fftSize = 1024;
    mic.analyser.smoothingTimeConstant = 0.5;
    mic.ctx.createMediaStreamSource(mic.stream).connect(mic.analyser);
    mic.bins = new Uint8Array(mic.analyser.frequencyBinCount);
    await mic.ctx.resume();
    say(mic.ctx.state === 'running' ? 'Listening: the show follows the music in the room.' : 'Tap the show once to start listening.');
  } catch (err) {
    $('listen').checked = false;
    setListen(false);
    say(`Microphone unavailable: ${err.message}`);
  }
}
$('listen').addEventListener('change', () => setListen(on('listen')));
addEventListener('pointerdown', () => { if (mic.ctx?.state === 'suspended') mic.ctx.resume(); });
function hearRoom(dt) {
  if (!mic.analyser) return;
  mic.analyser.getByteFrequencyData(mic.bins);
  let bass = 0, all = 0;
  for (let i = 1; i <= 6; i++) bass += mic.bins[i];
  for (let i = 1; i <= 200; i++) all += mic.bins[i];
  bass /= 6 * 255;
  all /= 200 * 255;
  mic.avg += (bass - mic.avg) * Math.min(1, dt * 1.5);
  mic.level += (clamp(all * 2.2, 0, 1) - mic.level) * Math.min(1, dt * 6);
  if (bass > mic.avg * 1.25 + 0.04 && time - mic.last > 0.22) {
    mic.pulse = 1;
    mic.last = time;
    beats -= (beats - Math.round(beats)) * 0.5;   // pull the beat clock toward the kick
  }
  mic.pulse *= Math.exp(-dt * 7);
}

// ── frame ───────────────────────────────────────────────────────────────────
let last = performance.now(), frameMs = 16, lastTune = 0, ready = false;
function update(dt) {
  const speed = num('speed');
  if (!paused) {
    time += dt;
    beats += dt * num('bpm') / 60;
    for (const i of new Set([current, incoming])) if (i >= 0) sceneClock[i] += dt * speed;
    inScene += dt;
    if (on('autopilot') && inScene > num('sceneSeconds')) goTo(wanted + 1);
  }
  hearRoom(dt);
  if (incoming < 0 && wanted !== current && sceneReady(wanted)) {
    incoming = wanted;
    fade = 0;
    sceneClock[incoming] = 0;
    showCaption(SCENES[incoming]);
  }
  if (incoming >= 0) {
    fade += dt / 3.5;
    if (fade >= 1) { current = incoming; incoming = -1; fade = 1; }
  }
  flash *= Math.exp(-dt * 3.2);
  // follow the target look smoothly; drift adds a slow wander on top
  const drift = on('autoLook') && pointers.size === 0 ? 1 : 0;
  const tYaw = look.yaw + drift * (14 * Math.sin(time * 0.05) + 5 * Math.sin(time * 0.13));
  const tPitch = look.pitch + drift * 5 * Math.sin(time * 0.07);
  const k = 1 - Math.exp(-dt * (pointers.size ? 18 : 5));
  view.yaw = wrap180(view.yaw + wrap180(tYaw - view.yaw) * k);
  view.pitch += (tPitch - view.pitch) * k;
  view.fov += (look.fov - view.fov) * k;
  const kp = 1 - Math.exp(-dt * 1.2);
  for (let i = 0; i < 3; i++) camPos[i] += (seat.pos[i] - camPos[i]) * kp;
}

function commonUniforms(entry, w, h) {
  const fov = lensFov();
  const fish = $('lens').value === 'fisheye';
  const bob = seat.rows ? 0.0006 * Math.sin(beats * Math.PI) * num('pulse') : 0;
  set(entry, 'uRes', w, h);
  set(entry, 'uCamPos', camPos[0], camPos[1] + bob, camPos[2]);
  gl.uniformMatrix3fv(entry.u.uCamRot, false, cameraBasis(view.yaw, view.pitch));
  set(entry, 'uFov', fov);
  if (entry.u.uLens) gl.uniform1i(entry.u.uLens, fish ? 1 : 0);
  set(entry, 'uPix', (fish ? fov : 2 * Math.tan(fov / 2)) / Math.max(w, h));
  set(entry, 'uTime', time);
  set(entry, 'uBeat', beats);
  const kick = Math.exp(-(beats - Math.floor(beats)) * 5);
  const pulse = mic.analyser ? Math.max(mic.pulse, kick * 0.2) : kick;
  set(entry, 'uPulse', pulse * num('pulse'));
  set(entry, 'uLevel', mic.analyser ? mic.level : 0.45 + 0.25 * Math.sin(beats * Math.PI / 16));
}

function drawScene(i, fadeIn, w, h) {
  const entry = requestProgram(i);
  gl.useProgram(entry.p);
  commonUniforms(entry, w, h);
  set(entry, 'uSceneTime', sceneClock[i]);
  set(entry, 'uFade', fadeIn);
  set(entry, 'uHue', num('hue') * DEG);
  set(entry, 'uTrip', num('trip'));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function render() {
  const w = canvas.width, h = canvas.height;
  if (!sceneReady(current) || !isReady(composite, 'venue')) return false;
  ensureTarget(w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  drawScene(current, 1, w, h);
  if (incoming >= 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawScene(incoming, fade, w, h);
    gl.disable(gl.BLEND);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.useProgram(composite.p);
  commonUniforms(composite, w, h);
  gl.uniform1i(composite.u.uScreen, 0);
  set(composite, 'uGain', num('brightness'));
  set(composite, 'uBloom', num('bloom'));
  set(composite, 'uBand', on('band') ? 1 : 0);
  set(composite, 'uCrowd', on('crowd') && seat.rows ? 1 : 0);
  set(composite, 'uRake', seat.rake);
  set(composite, 'uPhones', num('phones'));
  set(composite, 'uBeams', num('beams'));
  set(composite, 'uFlash', flash * (0.55 + 0.45 * Math.sin(time * 90)));
  set(composite, 'uBolt', bolt[0], bolt[1]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (document.hidden || gl.isContextLost()) return;
  if (needResize) { needResize = false; resize(); }
  update(dt);
  if (!render()) return;
  frameMs += (dt * 1000 - frameMs) * 0.05;
  if (!ready) {
    ready = true;
    canvas.dataset.ready = 'true';
    statusEl.hidden = true;
    showCaption(SCENES[current]);
    setTimeout(warmUp, 400);
    setTimeout(dismissHint, 7000);
  }
  canvas.dataset.scene = SCENES[current].id;
  if ($('quality').value === 'auto' && now - lastTune > 1500) {
    lastTune = now;
    const before = dynScale;
    if (frameMs > 24 && dynScale > 0.4) dynScale = Math.max(0.4, dynScale * 0.85);
    else if (frameMs < 15 && dynScale < 1) dynScale = Math.min(1, dynScale * 1.08);
    if (dynScale !== before) needResize = true;
  }
}

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); say('Graphics paused. Reload to bring the show back.', 0); });
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  $('autoLook').checked = false;
  $('trip').value = 0;
  showValue($('trip'));
}
setSeat($('seat').value, true);
view.pitch = look.pitch;
requestAnimationFrame(frame);

// For tests and thumbnails: jump straight to a scene, skipping the crossfade.
window.__sphere = {
  scenes: SCENES.map((s) => s.id),
  goTo(id, { instant = false } = {}) {
    const i = typeof id === 'number' ? id : SCENES.findIndex((s) => s.id === id);
    goTo(i);
    if (instant && sceneReady(i)) { current = wanted = i; incoming = -1; fade = 1; sceneClock[i] = 0; showCaption(SCENES[i]); }
  },
  compileAll() { return SCENES.map((s, i) => sceneReady(i) && isReady(composite, 'venue')); },
  seek(seconds) { sceneClock[current] = seconds; },
  strike,
  get state() { return { scene: SCENES[current].id, wanted: SCENES[wanted].id, fade, beats, paused, flash, view: { ...view }, camPos: camPos.slice() }; },
};
