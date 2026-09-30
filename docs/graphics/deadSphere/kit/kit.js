// kit.js — the runtime behind each full-sphere scene page.
//
// A scene page holds its own controls in <aside id="controls"> and calls
//   startSphere({ glsl, uniforms, yaw, pitch, keys, onFrame })
// The kit adds the shared View / Groove / Show controls, the canvas and the
// render loop. Every setting is a form control, so the Graphics Studio stage,
// its phone remote and playlist payloads drive a scene the way its panel does.
// Look direction and zoom are floats here, mirrored into their sliders, so
// dragging, pinching and tilting stay smooth.

import { VERT, HEAD, MAIN } from './glsl.js';

export const $ = (id) => document.getElementById(id);
export const num = (id) => Number($(id).value);
export const on = (id) => $(id).checked;
const DEG = Math.PI / 180;

function showValue(input) {
  const out = document.querySelector(`label[for="${input.id}"] output`);
  if (out) out.textContent = Number(input.value).toFixed(Number(input.step) < 1 ? 2 : 0);
}
/** Show a value on a slider without firing its input event (for values the scene drives itself). */
export function mirror(id, value) {
  $(id).value = value;
  showValue($(id));
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

const range = (id, label, min, max, step, value) =>
  `<label for="${id}">${label} <output></output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
const check = (id, label, checked = false) =>
  `<label for="${id}"><input id="${id}" type="checkbox"${checked ? ' checked' : ''}> ${label}</label>`;

function sharedControls(yaw, pitch, fov) {
  return `
  <fieldset data-control-group="View"><legend>View</legend>
    <label for="lens">Lens</label>
    <select id="lens"><option value="rect">Natural</option><option value="fisheye">Fisheye (immersive)</option></select>
    ${range('yaw', 'Look left / right (°)', -180, 180, 1, yaw)}
    ${range('pitch', 'Look up / down (°)', -89, 89, 1, pitch)}
    ${range('fov', 'Field of view (°)', 30, 170, 1, fov)}
    ${check('autoLook', 'Let the gaze drift', true)}
    ${check('tilt', 'Tilt this device to look')}
    <button id="recenter" type="button">Recenter view</button>
  </fieldset>
  <fieldset data-control-group="Groove"><legend>Groove</legend>
    ${range('bpm', 'Tempo (BPM)', 60, 180, 1, 112)}
    ${range('pulse', 'Beat pulse', 0, 1, 0.01, 0.7)}
    ${range('speed', 'Motion speed', 0, 2, 0.01, 1)}
    ${range('trip', 'Trip (warp)', 0, 1, 0.01, 0.15)}
    ${range('hue', 'Color shift (°)', -180, 180, 1, 0)}
    ${check('listen', 'React to music in the room (microphone)')}
  </fieldset>
  <fieldset data-control-group="Show"><legend>Show</legend>
    <div class="row">
      <button id="lightningBtn" type="button">⚡ Lightning</button>
      <button id="playPause" type="button">❚❚ Pause</button>
    </div>
    <label for="quality">Render quality</label>
    <select id="quality"><option value="auto" selected>Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
  </fieldset>`;
}

/**
 * Run a scene. `glsl` defines `vec3 scene(vec3 d, float t)` and declares its
 * own uniforms; `uniforms` maps each of those names to a getter called every
 * frame. `keys` maps extra keyboard shortcuts to actions, and `onFrame(state, dt)`
 * runs before each frame for scenes that keep their own clocks.
 */
export function startSphere({ glsl, uniforms = {}, yaw = 0, pitch = 12, fov = 100, keys = {}, onFrame } = {}) {
  const embedded = window.self !== window.top;
  if (embedded) document.documentElement.classList.add('embedded');

  // ── page furniture ──────────────────────────────────────────────────────────
  const panel = $('controls');
  const footer = panel.querySelector('footer');
  const shared = sharedControls(yaw, pitch, fov);
  footer ? footer.insertAdjacentHTML('beforebegin', shared) : panel.insertAdjacentHTML('beforeend', shared);
  document.body.insertAdjacentHTML('afterbegin', `
    <canvas id="dome" aria-label="${document.title}: a scene all around you. Drag to look around."></canvas>
    <div id="status" role="status">Tuning up…</div>
    <div id="hintOverlay">Drag to look around · pinch or scroll to zoom · double-tap for lightning</div>
    <button id="panelToggle" type="button" data-studio-ignore aria-controls="controls" aria-expanded="true" title="Controls (H)">☰</button>`);
  const canvas = $('dome');
  const statusEl = $('status');
  let statusTimer = 0;
  function say(msg, ms = 4000) {
    statusEl.textContent = msg;
    statusEl.hidden = false;
    clearTimeout(statusTimer);
    if (ms) statusTimer = setTimeout(() => { statusEl.hidden = true; }, ms);
  }

  for (const input of panel.querySelectorAll('input[type=range]')) {
    showValue(input);
    input.addEventListener('input', () => showValue(input));
  }

  // ── look ────────────────────────────────────────────────────────────────────
  const look = { yaw: num('yaw'), pitch: num('pitch'), fov: num('fov') };
  const view = { ...look };
  function setLook(key, value, fromSlider = false) {
    const v = key === 'yaw' ? wrap180(value) : clamp(value, Number($(key).min), Number($(key).max));
    look[key] = v;
    if (!fromSlider) mirror(key, Math.round(v));
  }
  for (const key of ['yaw', 'pitch', 'fov']) $(key).addEventListener('input', () => setLook(key, num(key), true));
  function recenter() { setLook('yaw', yaw); setLook('pitch', pitch); setLook('fov', fov); }
  $('recenter').addEventListener('click', recenter);

  // ── show state ──────────────────────────────────────────────────────────────
  const state = { paused: false, time: 0, sceneTime: 0, beats: 0, flash: 0 };
  let bolt = [0, 1];
  function strike(az) {
    state.flash = 1;
    bolt = [az ?? (Math.random() - 0.5) * 2.4, 1 + Math.random() * 97];
  }
  function setPaused(p) {
    state.paused = p;
    $('playPause').textContent = p ? '▶ Play' : '❚❚ Pause';
  }
  $('lightningBtn').addEventListener('click', () => strike());
  $('playPause').addEventListener('click', () => setPaused(!state.paused));

  // ── WebGL ───────────────────────────────────────────────────────────────────
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) {
    say('This scene needs WebGL 2. Turn on hardware acceleration or try another browser.', 0);
    return;
  }
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, HEAD + glsl + MAIN]].map(([type, src]) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(program, s);
    return s;
  });
  gl.linkProgram(program);
  const loc = {};
  let linked = null;   // null while the driver compiles, then true / false
  function ready() {
    if (linked !== null) return linked;
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
    linked = !!gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      console.error(shaders.map((s) => gl.getShaderInfoLog(s)).join('\n') || gl.getProgramInfoLog(program));
      say('This scene failed to compile on this device.', 0);
      return false;
    }
    for (let i = 0, n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const { name } = gl.getActiveUniform(program, i);
      loc[name] = gl.getUniformLocation(program, name);
    }
    shaders.forEach((s) => gl.deleteShader(s));
    gl.useProgram(program);
    return true;
  }
  function set(name, v) {
    const l = loc[name];
    if (l === undefined) return;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else gl.uniform3f(l, v[0], v[1], v[2]);
  }

  // ── resolution ──────────────────────────────────────────────────────────────
  // Resizing clears the canvas, so it waits for the start of the next frame, which redraws at once.
  let dynScale = 0.85, needResize = true;
  function resize() {
    const q = $('quality').value;
    const budget = { low: 0.5e6, medium: 1e6, high: 2.2e6, auto: 1.8e6 }[q] || 1.2e6;
    const w = Math.max(1, canvas.clientWidth || innerWidth), h = Math.max(1, canvas.clientHeight || innerHeight);
    let f = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / (w * h)));
    if (q === 'auto') f *= dynScale;
    canvas.width = Math.max(2, Math.round(w * f));
    canvas.height = Math.max(2, Math.round(h * f));
  }
  addEventListener('resize', () => { needResize = true; });
  $('quality').addEventListener('input', () => { dynScale = 0.85; needResize = true; });

  // ── camera ──────────────────────────────────────────────────────────────────
  function basis(yawDeg, pitchDeg) {
    const y = yawDeg * DEG, p = pitchDeg * DEG;
    const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
    const r = [Math.cos(y), 0, Math.sin(y)];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return [...r, ...u, ...f];
  }
  const fisheye = () => $('lens').value === 'fisheye';
  const lensFov = () => (fisheye() ? view.fov : Math.min(view.fov, 140)) * DEG;
  // Azimuth under a point on the canvas, for aiming lightning with a double-tap.
  function azimuthAt(x, y) {
    const rect = canvas.getBoundingClientRect();
    const m = Math.max(rect.width, rect.height);
    const px = (2 * (x - rect.left) - rect.width) / m, py = (rect.height - 2 * (y - rect.top)) / m;
    const fovR = lensFov();
    let d;
    if (fisheye()) {
      const r = Math.hypot(px, py), th = r * fovR / 2;
      d = r > 1e-6 ? [px / r * Math.sin(th), py / r * Math.sin(th), Math.cos(th)] : [0, 0, 1];
    } else {
      d = [px * Math.tan(fovR / 2), py * Math.tan(fovR / 2), 1];
    }
    const B = basis(view.yaw, view.pitch);
    const w = [0, 1, 2].map((k) => B[k] * d[0] + B[3 + k] * d[1] + B[6 + k] * d[2]);
    return Math.atan2(w[0], -w[2]);
  }

  // ── touch, mouse and keys ───────────────────────────────────────────────────
  const pointers = new Map();
  let pinch = null, lastTap = { t: 0, x: 0, y: 0 };
  const dismissHint = () => $('hintOverlay').classList.add('gone');
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
    if (k === ' ') { e.preventDefault(); setPaused(!state.paused); }
    else if (k === 'l') strike();
    else if (k === 'r') recenter();
    else if (k === 'h' && !embedded) togglePanel();
    else if (k === 'arrowleft' || k === 'arrowright') setLook('yaw', look.yaw + (k === 'arrowleft' ? -6 : 6));
    else if (k === 'arrowup' || k === 'arrowdown') setLook('pitch', look.pitch + (k === 'arrowup' ? 4 : -4));
    else if (keys[k]) keys[k]();
    else return;
    dismissHint();
  });

  // ── tilt to look (the viewing device's own motion sensor) ────────────────────
  let tiltRef = null, gotOrientation = false;
  const qmul = (a, b) => [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
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
    const yaw = Math.atan2(f[0], -f[2]) / DEG;
    if (!tiltRef) tiltRef = { yaw0: yaw, view: look.yaw };
    setLook('yaw', tiltRef.view + yaw - tiltRef.yaw0);
    setLook('pitch', Math.asin(clamp(f[1], -1, 1)) / DEG);
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
  const mic = { ctx: null, stream: null, analyser: null, bins: null, avg: 0.05, level: 0, pulse: 0, last: 0 };
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
      say(mic.ctx.state === 'running' ? 'Listening: the scene follows the music in the room.' : 'Tap the scene once to start listening.');
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
    if (bass > mic.avg * 1.25 + 0.04 && state.time - mic.last > 0.22) {
      mic.pulse = 1;
      mic.last = state.time;
      state.beats -= (state.beats - Math.round(state.beats)) * 0.5;   // pull the beat clock toward the kick
    }
    mic.pulse *= Math.exp(-dt * 7);
  }

  // ── frame ───────────────────────────────────────────────────────────────────
  let last = performance.now(), frameMs = 16, lastTune = 0, started = false;
  function update(dt) {
    if (!state.paused) {
      state.time += dt;
      state.beats += dt * num('bpm') / 60;
      state.sceneTime += dt * num('speed');
    }
    hearRoom(dt);
    onFrame?.(state, state.paused ? 0 : dt);
    state.flash *= Math.exp(-dt * 3.2);
    const drift = on('autoLook') && pointers.size === 0 ? 1 : 0;
    const tYaw = look.yaw + drift * (14 * Math.sin(state.time * 0.05) + 5 * Math.sin(state.time * 0.13));
    const tPitch = look.pitch + drift * 5 * Math.sin(state.time * 0.07);
    const k = 1 - Math.exp(-dt * (pointers.size ? 18 : 5));
    view.yaw = wrap180(view.yaw + wrap180(tYaw - view.yaw) * k);
    view.pitch = clamp(view.pitch + (tPitch - view.pitch) * k, -89.5, 89.5);
    view.fov += (look.fov - view.fov) * k;
  }
  function render() {
    const w = canvas.width, h = canvas.height, fovR = lensFov();
    gl.viewport(0, 0, w, h);
    set('uRes', [w, h]);
    gl.uniformMatrix3fv(loc.uCamRot, false, basis(view.yaw, view.pitch));
    set('uFov', fovR);
    if (loc.uLens) gl.uniform1i(loc.uLens, fisheye() ? 1 : 0);
    set('uPix', (fisheye() ? fovR : 2 * Math.tan(fovR / 2)) / Math.max(w, h));
    set('uTime', state.time);
    set('uSceneTime', state.sceneTime);
    set('uBeat', state.beats);
    const kick = Math.exp(-(state.beats - Math.floor(state.beats)) * 5);
    set('uPulse', (mic.analyser ? Math.max(mic.pulse, kick * 0.2) : kick) * num('pulse'));
    set('uLevel', mic.analyser ? mic.level : 0.45 + 0.25 * Math.sin(state.beats * Math.PI / 16));
    set('uHue', num('hue') * DEG);
    set('uTrip', num('trip'));
    set('uFlash', state.flash * (0.55 + 0.45 * Math.sin(state.time * 90)));
    set('uBolt', bolt);
    for (const [name, get] of Object.entries(uniforms)) set(name, get());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (document.hidden || gl.isContextLost() || !ready()) return;
    if (needResize) { needResize = false; resize(); }
    update(dt);
    render();
    frameMs += (dt * 1000 - frameMs) * 0.05;
    if (!started) {
      started = true;
      canvas.dataset.ready = 'true';
      statusEl.hidden = true;
      setTimeout(dismissHint, 7000);
    }
    if ($('quality').value === 'auto' && now - lastTune > 1500) {
      lastTune = now;
      const before = dynScale;
      if (frameMs > 24 && dynScale > 0.4) dynScale = Math.max(0.4, dynScale * 0.85);
      else if (frameMs < 15 && dynScale < 1) dynScale = Math.min(1, dynScale * 1.08);
      if (dynScale !== before) needResize = true;
    }
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); say('Graphics paused. Reload to bring the scene back.', 0); });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $('autoLook').checked = false;
    $('trip').value = 0;
    showValue($('trip'));
  }
  requestAnimationFrame(frame);

  // For tests and thumbnails.
  window.__sphere = {
    ready: () => canvas.dataset.ready === 'true',
    seek(seconds) { state.sceneTime = seconds; },
    strike,
    get state() { return { ...state, view: { ...view } }; },
  };
  return { state, strike, say };
}
