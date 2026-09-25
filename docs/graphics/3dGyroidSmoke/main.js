import { createMidiController } from '../gyroidSmoke/midi.js';
import { createVolume } from './volume.js';
import { noteSource, cameraPosition, DEFAULT_CAMERA } from './scene.js';

const $ = id => document.getElementById(id);
const canvas = $('roomCanvas'), status = $('renderStatus');
const midi = createMidiController();
const camera = { ...DEFAULT_CAMERA };
const STEP = 1 / 30;
export let volume = null;

try {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This room needs WebGL 2. Enable hardware acceleration or try another browser.');
  const [simulation, response] = await Promise.all([createVolume(gl), fetch(new URL('./room.glsl', import.meta.url))]);
  volume = simulation;
  if (!response.ok) throw new Error('Could not load the room shader. Reload to try again.');
  const fragment = await response.text();
  const vertex = `#version 300 es
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
      throw new Error(`Room shader could not compile: ${message}`);
    }
    return shader;
  }
  const program = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Room shader could not link: ${gl.getProgramInfoLog(program)}`);
  const vao = gl.createVertexArray();
  const uniforms = Object.fromEntries(['uResolution', 'uVolume', 'uEye', 'uOpacity', 'uBend', 'uTime', 'uSteps'].map(name => [name, gl.getUniformLocation(program, name)]));
  let music = midi.update(performance.now(), 0);
  let dirty = true, hasSmoke = false, frame = 0, time = 0, accumulator = 0;
  let totalEmission = 0, lastReadout = 0, lastStats = 0, draws = 0, canReadStats = true;

  function resize() {
    const budget = { low: 160000, balanced: 350000, high: 700000 }[$('quality').value];
    const factor = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budget / (innerWidth * innerHeight)));
    const width = Math.max(1, Math.round(innerWidth * factor)), height = Math.max(1, Math.round(innerHeight * factor));
    if (width !== canvas.width || height !== canvas.height) { canvas.width = width; canvas.height = height; }
    dirty = true;
  }
  function present() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, volume.texture);
    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
    gl.uniform3fv(uniforms.uEye, cameraPosition(camera));
    gl.uniform1f(uniforms.uOpacity, Number($('opacity').value));
    gl.uniform1f(uniforms.uBend, music.bend);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform1i(uniforms.uSteps, { low: 56, balanced: 80, high: 112 }[$('quality').value]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.dataset.ready = 'true';
    canvas.dataset.frame = String(frame); canvas.dataset.time = time.toFixed(3);
    canvas.dataset.midiEnergy = music.energy.toFixed(4);
    canvas.dataset.midiNotes = String(music.activeCount); canvas.dataset.midiDemo = String(music.playing);
    canvas.dataset.emission = totalEmission.toFixed(4);
    canvas.dataset.camera = JSON.stringify(camera);
    canvas.dataset.grid = volume.dimensions.join('×');
    status.hidden = true; dirty = false; draws++;
  }
  function clearRoom() {
    if (gl.isContextLost()) return;
    volume.clear(); hasSmoke = false; frame = 0; time = 0; accumulator = 0; totalEmission = 0;
    $('roomFill').value = 'Empty room — play a note';
    canvas.dataset.coverage = '0';
    dirty = true;
    present();
  }
  function resetCamera() { Object.assign(camera, DEFAULT_CAMERA); dirty = true; }
  for (const node of document.querySelectorAll('input:not([data-midi]):not([readonly]), select:not([data-midi])')) {
    const sync = () => {
      const output = document.querySelector(`label[for="${node.id}"] output`);
      if (output) output.textContent = Number(node.value).toFixed(2);
      if (node.id === 'quality') resize();
      if (node.id === 'animate') accumulator = 0;
      dirty = true;
    };
    node.addEventListener('input', sync); sync();
  }
  $('clearRoom').addEventListener('click', clearRoom);
  $('resetCamera').addEventListener('click', resetCamera);
  $('capture').addEventListener('click', () => {
    if (gl.isContextLost()) return;
    present();
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = '3d-gyroid-smoke.png'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  });

  const pointers = new Map();
  let pinchDistance = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    pinchDistance = pointers.size === 2 ? Math.hypot(...[...pointers.values()][0].map((v, i) => v - [...pointers.values()][1][i])) : 0;
  });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size === 1) {
      camera.yaw -= (event.clientX - previous[0]) * 0.006;
      camera.pitch = Math.max(0.06, Math.min(1.15, camera.pitch + (event.clientY - previous[1]) * 0.005));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchDistance > 0 && distance > 0) camera.distance = Math.max(8.5, Math.min(24, camera.distance * pinchDistance / distance));
      pinchDistance = distance;
    }
    dirty = true;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => { pointers.delete(event.pointerId); pinchDistance = 0; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    camera.distance = Math.max(8.5, Math.min(24, camera.distance * Math.exp(event.deltaY * 0.001)));
    dirty = true;
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === ' ') {
      event.preventDefault(); $('animate').checked = !$('animate').checked;
      $('animate').dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (event.key.toLowerCase() === 'r') clearRoom();
    if (event.key.toLowerCase() === 'h') $('controls').hidden = !$('controls').hidden;
  });
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); midi.reset();
    status.hidden = false;
    status.textContent = 'Graphics paused. The room will restart empty when the graphics context is restored.';
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('animate').checked = false;
  resize(); clearRoom();
  let previous = performance.now();
  function render(now) {
    requestAnimationFrame(render);
    const elapsed = Math.max(0, (now - previous) / 1000); previous = now;
    if (document.hidden || gl.isContextLost()) { accumulator = 0; return; }
    music = midi.update(now, elapsed);
    if (music.changed) dirty = true;
    const sources = music.voices.map(voice => noteSource(voice, music.strength)).filter(source => source.strength > 0.0005);
    if ($('animate').checked && (hasSmoke || sources.length)) {
      accumulator = Math.min(accumulator + elapsed, STEP * 2);
      while (accumulator >= STEP) {
        time += STEP;
        volume.step(STEP, time, {
          speed: Number($('flowSpeed').value), curl: Number($('curl').value) + music.modulation * 0.8,
          pulse: Number($('pulse').value), diffusion: Number($('diffusion').value),
          injection: Number($('injection').value) * (1 + 0.4 * music.pressure), sources,
        });
        const emitted = sources.reduce((sum, source) => sum + source.strength, 0) * Number($('injection').value) * STEP;
        totalEmission += emitted; hasSmoke ||= emitted > 0; frame++;
        accumulator -= STEP; dirty = true;
      }
    } else accumulator = 0;
    if (dirty) present();
    if (now - lastStats > 3000 && hasSmoke && canReadStats) {
      try {
        const stats = volume.sampleStats({ stride: 8 });
        const coverage = 100 * stats.occupiedFraction;
        $('roomFill').value = `About ${coverage.toFixed(1)}% of room contains smoke`;
        canvas.dataset.coverage = coverage.toFixed(2);
      } catch {
        // Rendering can work on drivers that do not offer float readback.
        canReadStats = false; $('roomFill').value = 'Smoke is accumulating';
      }
      lastStats = now;
    }
    if (hasSmoke && totalEmission > 0 && $('roomFill').value.startsWith('Empty')) $('roomFill').value = 'Smoke is accumulating';
    if (now - lastReadout > 1000) {
      $('readout').textContent = `${canvas.width} × ${canvas.height} · ${$('animate').checked ? `${Math.round(draws * 1000 / (now - lastReadout))} fps` : 'paused'}`;
      lastReadout = now; draws = 0;
    }
  }
  requestAnimationFrame(render);
} catch (error) {
  status.hidden = false; status.textContent = error.message;
  console.error('3D Gyroid Smoke:', error);
}
