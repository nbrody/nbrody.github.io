import { createMidiController } from './midi.js';

const $ = id => document.getElementById(id);
const canvas = $('smokeCanvas');
const status = $('renderStatus');
const inputs = [...document.querySelectorAll('input:not([data-midi]), select:not([data-midi])')];
const defaults = Object.fromEntries(inputs.map(node => [node.id, node.type === 'checkbox' ? node.checked : node.value]));
const STEP = 1 / 60;
// Shader indices are offset by one: 'auto' is -1 (empty MIDI room or wash).
const START_STATES = ['auto', 'wash', 'rings', 'stripes', 'checker', 'spiral', 'wheel', 'gyroid', 'yinyang'];
const midi = createMidiController();
let music = midi.update(performance.now(), 0);

try {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This smoke needs WebGL 2. Enable hardware acceleration or try another browser.');

  const [common, ...sources] = await Promise.all(['common.glsl', 'buffer.glsl', 'image.glsl', 'map.glsl', 'compose.glsl'].map(async path => {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error(`Could not load ${path}. Reload to try again.`);
    return response.text();
  }));
  const vertexSource = `#version 300 es
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;
  const header = `#version 300 es
    precision highp float;
    precision highp int;
    uniform vec3 iResolution;
    uniform float iTime;
    uniform int iFrame;
    uniform sampler2D iChannel0;
    uniform sampler2D iChannel1;
    uniform float uCurl, uPulse, uScale, uPalette;
    uniform float uRelief, uLightAngle, uExposure, uSaturation;
    uniform vec4 uMidiNotes[8];
    uniform float uMidiEnergy;
    uniform bool uMidiMode;
    uniform int uStart;
    uniform float uFlowGain;
    uniform vec2 uMapSize;
    uniform float uBlur;
    out vec4 outputColor;
  `;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${message}`);
    }
    return shader;
  }
  function makeProgram(source, shared = '') {
    const program = gl.createProgram();
    const shaders = [compile(gl.VERTEX_SHADER, vertexSource), compile(gl.FRAGMENT_SHADER, `${header}\n${shared}\n${source}\nvoid main() { mainImage(outputColor, gl_FragCoord.xy); }`)];
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shader linking failed: ${gl.getProgramInfoLog(program)}`);
    const names = ['iResolution', 'iTime', 'iFrame', 'iChannel0', 'iChannel1', 'uCurl', 'uPulse', 'uScale', 'uPalette', 'uRelief', 'uLightAngle', 'uExposure', 'uSaturation', 'uMidiNotes[0]', 'uMidiEnergy', 'uMidiMode', 'uStart', 'uFlowGain', 'uMapSize', 'uBlur'];
    return { program, uniforms: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) };
  }
  const [flow, lighting, mapStep, compose] = sources.map((source, i) => makeProgram(source, i === 1 ? '' : common));
  gl.bindVertexArray(gl.createVertexArray());
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  // Static high-pass noise, histogram-equalized to keep the supplied cubic
  // sampling radius uniformly driven. Generated locally; no texture download.
  function makeNoise() {
    const size = 1024, mask = size - 1;
    const white = new Uint8Array(size * size);
    let seed = 0x6714ab3d;
    for (let i = 0; i < white.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      white[i] = seed >>> 24;
    }
    const filtered = new Uint16Array(white.length), histogram = new Uint32Array(2041);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const value = 1020 + 4 * white[i] - white[y * size + ((x + 1) & mask)] - white[y * size + ((x - 1) & mask)] - white[((y + 1) & mask) * size + x] - white[((y - 1) & mask) * size + x];
      filtered[i] = value; histogram[value]++;
    }
    const lookup = new Uint8Array(histogram.length);
    let sum = 0;
    for (let i = 0; i < histogram.length; i++) {
      lookup[i] = Math.round((sum + histogram[i] / 2) * 255 / white.length);
      sum += histogram[i];
    }
    for (let i = 0; i < white.length; i++) white[i] = lookup[filtered[i]];
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, white);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  }
  const noise = makeNoise();
  let floatingPoint = !!gl.getExtension('EXT_color_buffer_float');
  let targets = [], current = 0, frame = 0, time = 0, accumulator = 0, dirty = true;
  let midiMode = $('midiEnabled').checked;

  function destroyTarget(target) {
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }
  function makeTarget(width, height, map = false) {
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (map) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, floatingPoint ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, floatingPoint ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      destroyTarget({ texture, framebuffer });
      throw new Error('Could not allocate smoke textures. Try a smaller browser window.');
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  }
  function use(pass) {
    gl.useProgram(pass.program);
    const u = pass.uniforms;
    gl.uniform3f(u.iResolution, canvas.width, canvas.height, 1);
    gl.uniform1f(u.iTime, time);
    gl.uniform1i(u.iFrame, frame);
    gl.uniform1i(u.iChannel0, 0);
    gl.uniform1i(u.iChannel1, 1);
    gl.uniform4fv(u['uMidiNotes[0]'], music.notes);
    gl.uniform1f(u.uMidiEnergy, music.energy);
    gl.uniform1i(u.uMidiMode, midiMode);
    gl.uniform1i(u.uStart, START_STATES.indexOf($('startState').value) - 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targets[current].texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noise);
  }
  function simulate() {
    const next = 1 - current;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[next].framebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    use(flow);
    for (const [id, name] of [['curl', 'uCurl'], ['pulse', 'uPulse'], ['scale', 'uScale'], ['palette', 'uPalette']]) gl.uniform1f(flow.uniforms[name], Number($(id).value));
    gl.uniform1f(flow.uniforms.uCurl, Number($('curl').value) * (1 + music.energy * 1.1) + music.modulation * 1.8);
    gl.uniform1f(flow.uniforms.uPulse, Number($('pulse').value) + music.energy * 1.4);
    gl.uniform1f(flow.uniforms.uPalette, Number($('palette').value) + music.energy * (music.pitch - 48) / 18);
    gl.uniform1f(flow.uniforms.uFlowGain, flowGain(time, flowParams()));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    current = next;
    frame++;
    dirty = true;
  }
  function flowParams() {
    return {
      curl: Number($('curl').value), pulse: Number($('pulse').value), scale: Number($('scale').value),
      hold: Number($('startHold').value), structured: START_STATES.indexOf($('startState').value) > 1,
    };
  }
  function flowGain(t, params) {
    const ramp = params.structured && params.hold > 0 ? Math.min(1, t / params.hold) : 1;
    return ramp * ramp * (3 - 2 * ramp);
  }

  // Backward mode. The ambient velocity depends only on position and time, so
  // the smoke after n steps is exactly the start frame seen through a flow map
  // G_n (map.glsl). Maps are built forward once at half resolution, keeping a
  // checkpoint every MAP_EVERY steps; playback rebuilds G_n from the nearest
  // checkpoint below it, so running time backwards costs at most
  // MAP_EVERY - 1 half-resolution steps per frame. MIDI notes do not stir
  // this mode; they would make the flow depend on what was played.
  // BLUR_RATE: compose blur radius, in start-frame pixels per step of age.
  const MAP_EVERY = 10, BUILD_BUDGET = 60, BLUR_RATE = 0.1;
  let reverse = null;
  const wantsReverse = () => floatingPoint && $('direction').value !== 'forward';
  function stepMap(source, n, target) {
    const params = reverse.params;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    use(mapStep);
    const u = mapStep.uniforms;
    gl.uniform1f(u.iTime, n * STEP);
    gl.uniform1f(u.uCurl, params.curl);
    gl.uniform1f(u.uPulse, params.pulse);
    gl.uniform1f(u.uScale, params.scale);
    gl.uniform1f(u.uFlowGain, flowGain(n * STEP, params));
    gl.uniform2f(u.uMapSize, target.width, target.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return target;
  }
  const otherScratch = source => reverse.scratch[source === reverse.scratch[0] ? 1 : 0];
  function startReverse() {
    const width = Math.ceil(canvas.width / 2), height = Math.ceil(canvas.height / 2);
    const total = Math.max(MAP_EVERY, Math.round(Number($('reverseTime').value) / STEP));
    const all = [];
    try {
      // Checkpoint 0 is the identity map: zero displacement, cleared on creation.
      for (let i = 0; i <= Math.floor(total / MAP_EVERY) + 2; i++) all.push(makeTarget(width, height, true));
    } catch (error) {
      all.forEach(destroyTarget);
      throw error;
    }
    reverse = {
      params: flowParams(), total, n: total, dir: -1, built: 0,
      scratch: all.splice(-2), checkpoints: all, cache: null,
    };
    reverse.buildFrom = reverse.checkpoints[0];
    time = total * STEP;
  }
  function disposeReverse() {
    if (!reverse) return;
    [...reverse.checkpoints, ...reverse.scratch].forEach(destroyTarget);
    reverse = null;
  }
  function buildReverse(budget) {
    const r = reverse;
    for (; budget > 0 && r.built < r.total; budget--) {
      const n = r.built + 1;
      const target = n % MAP_EVERY === 0 ? r.checkpoints[n / MAP_EVERY] : otherScratch(r.buildFrom);
      r.buildFrom = stepMap(r.buildFrom, n, target);
      r.built = n;
    }
    return r.built >= r.total;
  }
  function mapAt(n) {
    const r = reverse;
    const base = n - n % MAP_EVERY;
    let source = r.checkpoints[base / MAP_EVERY], from = base;
    if (r.cache && r.cache.n <= n && r.cache.n >= base) ({ target: source, n: from } = r.cache);
    for (let k = from + 1; k <= n; k++) source = stepMap(source, k, otherScratch(source));
    r.cache = { n, target: source };
    return source;
  }
  function composeReverse() {
    const map = mapAt(reverse.n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[current].framebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const saved = time;
    time = 0; // the wash start state is drawn as it was at frame zero
    use(compose);
    time = saved;
    gl.uniform1f(compose.uniforms.uPalette, Number($('palette').value));
    gl.uniform1f(compose.uniforms.uScale, Number($('scale').value));
    gl.uniform1f(compose.uniforms.uBlur, BLUR_RATE * reverse.n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, map.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    dirty = true;
  }
  // Advance playback by one step; returns false once backward playback has
  // assembled the start frame and handed over to the live flow.
  function advanceReverse() {
    const r = reverse;
    if (r.n === 0 && r.dir < 0) {
      if ($('direction').value === 'backward') {
        restart(true);
        return false;
      }
      r.dir = 1;
    } else if (r.n === r.total && r.dir > 0) r.dir = -1;
    r.n += r.dir;
    time = r.n * STEP;
    return true;
  }

  function present() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    use(lighting);
    for (const [id, name] of [['relief', 'uRelief'], ['exposure', 'uExposure'], ['saturation', 'uSaturation']]) gl.uniform1f(lighting.uniforms[name], Number($(id).value));
    gl.uniform1f(lighting.uniforms.uLightAngle, Number($('lightAngle').value) * Math.PI / 180 + music.bend * Math.PI * 0.75);
    gl.uniform1f(lighting.uniforms.uExposure, Number($('exposure').value) * (1 + 0.32 * music.energy + 0.18 * music.pressure));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.dataset.ready = 'true';
    canvas.dataset.frame = String(frame);
    canvas.dataset.time = time.toFixed(3);
    canvas.dataset.precision = floatingPoint ? 'float16' : 'byte';
    canvas.dataset.midiEnergy = music.energy.toFixed(4);
    canvas.dataset.midiNotes = String(music.activeCount);
    canvas.dataset.midiDemo = String(music.playing);
    canvas.dataset.midiMode = String(midiMode);
    canvas.dataset.reverse = reverse ? `${reverse.built < reverse.total ? 'building' : reverse.dir < 0 ? 'assembling' : 'dissolving'} ${reverse.n}/${reverse.total}` : '';
    status.hidden = true;
    dirty = false;
  }
  // live: begin the ordinary flow even if a backward direction is selected
  // (used when backward playback finishes assembling).
  function restart(live = false) {
    if (gl.isContextLost()) return;
    disposeReverse();
    time = 0; frame = 0; accumulator = 0;
    if (!live && wantsReverse()) {
      startReverse();
      return;
    }
    // Clear both feedback buffers: switching modes or restarting must never
    // carry the full-screen palette into a fresh MIDI room.
    gl.clearColor(0, 0, 0, 0);
    for (const target of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    simulate();
    present();
  }
  function syncMidiMode() {
    const enabled = $('midiEnabled').checked;
    if (enabled === midiMode) return;
    midiMode = enabled;
    music = midi.update(performance.now(), 0);
    restart();
  }
  function resize() {
    if (gl.isContextLost()) return;
    const budgets = { low: 220000, balanced: 600000, high: 1250000 };
    const factor = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budgets[$('quality').value] / (innerWidth * innerHeight)));
    const width = Math.max(1, Math.round(innerWidth * factor)), height = Math.max(1, Math.round(innerHeight * factor));
    if (width === canvas.width && height === canvas.height && targets.length) return;
    const previous = targets, oldCurrent = current;
    const fresh = [];
    try {
      fresh.push(makeTarget(width, height));
      fresh.push(makeTarget(width, height));
    } catch (error) {
      fresh.forEach(destroyTarget);
      if (previous.length || !floatingPoint) throw error;
      floatingPoint = false;
      fresh.length = 0;
      fresh.push(makeTarget(width, height));
      fresh.push(makeTarget(width, height));
    }
    // Resample the unlit state so a resize or quality change preserves the flow.
    if (previous.length) {
      const old = previous[oldCurrent];
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, old.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fresh[0].framebuffer);
      gl.blitFramebuffer(0, 0, old.width, old.height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    }
    targets = fresh; current = 0;
    canvas.width = width; canvas.height = height;
    previous.forEach(destroyTarget);
    if (!previous.length) simulate();
    if (reverse) restart();
    dirty = true;
  }
  function sync(node) {
    const output = document.querySelector(`label[for="${node.id}"] output`);
    if (output) output.textContent = node.id === 'lightAngle' ? `${node.value}°` : node.id === 'startHold' || node.id === 'reverseTime' ? `${Number(node.value).toFixed(1)} s` : Number(node.value).toFixed(2);
    if (node.id === 'quality') resize();
    if (node.id === 'animate' || node.id === 'speed') accumulator = 0;
    dirty = true;
  }
  for (const node of inputs) node.addEventListener('input', () => sync(node));
  $('midiEnabled').addEventListener('input', syncMidiMode);
  $('restart').addEventListener('click', () => restart());
  // A start state only means something at frame zero, so choosing one restarts.
  // In backward mode the flow map does not depend on the pattern, so a new
  // start state simply reassembles into the new shape.
  $('startState').addEventListener('change', () => { if (reverse) dirty = true; else restart(); });
  $('direction').addEventListener('change', () => restart());
  // Backward maps are built from a snapshot of the flow; rebuild on release.
  for (const id of ['curl', 'pulse', 'scale', 'startHold', 'reverseTime']) $(id).addEventListener('change', () => { if (reverse) restart(); });
  if (!floatingPoint) {
    $('direction').disabled = true;
    $('direction').title = 'Backward playback needs float render targets, which this device lacks.';
  }
  $('reset').addEventListener('click', () => {
    midi.reset();
    music = midi.update(performance.now(), 0);
    for (const node of inputs) {
      if (node.type === 'checkbox') node.checked = defaults[node.id];
      else node.value = defaults[node.id];
      sync(node);
    }
    restart();
  });
  $('capture').addEventListener('click', () => {
    if (gl.isContextLost()) return;
    present();
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'gyroid-smoke.png'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  });
  window.addEventListener('keydown', event => {
    if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault(); $('animate').checked = !$('animate').checked;
      $('animate').dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (event.key.toLowerCase() === 'r') restart();
    if (event.key.toLowerCase() === 'b' && !$('direction').disabled) {
      const select = $('direction');
      select.selectedIndex = (select.selectedIndex + 1) % select.length;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (event.key.toLowerCase() === 's') {
      const select = $('startState');
      select.selectedIndex = (select.selectedIndex + (event.shiftKey ? select.length - 1 : 1)) % select.length;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (event.key.toLowerCase() === 'h') $('controls').hidden = !$('controls').hidden;
  });
  window.addEventListener('resize', () => {
    try { resize(); } catch (error) { status.hidden = false; status.textContent = error.message; }
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    status.hidden = false;
    status.textContent = 'Graphics paused. The smoke will restart when the graphics context is restored.';
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('animate').checked = false;
  resize();
  for (const node of inputs) sync(node);
  let previous = performance.now(), lastReadout = 0, draws = 0;
  function render(now) {
    requestAnimationFrame(render);
    const elapsed = Math.max(0, (now - previous) / 1000);
    previous = now;
    if (document.hidden || gl.isContextLost()) { accumulator = 0; return; }
    music = midi.update(now, elapsed);
    // The shared demo controller can enable MIDI programmatically. Detect that
    // transition too, without resetting the room when a demo loops or stops.
    syncMidiMode();
    if (music.changed) dirty = true;
    if (reverse) {
      if (reverse.built < reverse.total) {
        // Spread the scramble over a few frames; show it once it is complete.
        if (buildReverse(BUILD_BUDGET)) composeReverse();
      } else if ($('animate').checked && Number($('speed').value) > 0) {
        accumulator = Math.min(accumulator + elapsed * Number($('speed').value), STEP * 4);
        let moved = false, live = false;
        while (accumulator >= STEP && !live) {
          accumulator -= STEP;
          live = !advanceReverse();
          moved = true;
        }
        if (moved && !live) composeReverse();
      } else if (dirty) composeReverse();
    } else if ($('animate').checked && Number($('speed').value) > 0) {
      // Bound catch-up work after slow frames; simulation time follows actual
      // completed steps instead of jumping ahead when the tab is suspended.
      accumulator = Math.min(accumulator + elapsed * Number($('speed').value), STEP * 4);
      while (accumulator >= STEP) {
        time += STEP;
        simulate();
        accumulator -= STEP;
      }
    }
    if (dirty) { present(); draws++; }
    if (now - lastReadout >= 1000) {
      const fps = Math.round(draws * 1000 / (now - lastReadout));
      $('readout').textContent = `${canvas.width} × ${canvas.height} · ${reverse && reverse.built < reverse.total ? 'scrambling… · ' : ''}${$('animate').checked && Number($('speed').value) > 0 ? `${fps} fps` : 'paused'}`;
      lastReadout = now; draws = 0;
    }
  }
  requestAnimationFrame(render);
} catch (error) {
  status.hidden = false;
  status.textContent = error.message;
  console.error('Gyroid Smoke:', error);
}
