// Mandelbrot viewer — WebGL2 fragment shader.
// Two precision modes: FP32 (snappy) and emulated double-single (deep zoom).

(() => {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) {
    document.body.innerHTML = '<p style="color:#fff;padding:24px;font-family:sans-serif">WebGL2 is required.</p>';
    return;
  }

  // ---------- Shaders ----------
  const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const PALETTE_GLSL = `
vec3 palette(float t, int which, float shift, float cycles) {
  float u = fract(t * cycles + shift);
  // Inigo Quilez cosine palettes: a + b * cos(2pi*(c*u + d))
  vec3 a, b, c, d;
  if (which == 0) { // Plasma
    a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.0, 0.33, 0.67);
  } else if (which == 1) { // Sunset
    a = vec3(0.5); b = vec3(0.5); c = vec3(1.0, 1.0, 0.5); d = vec3(0.80, 0.90, 0.30);
  } else if (which == 2) { // Ocean
    a = vec3(0.0, 0.2, 0.4); b = vec3(0.5, 0.5, 0.6); c = vec3(1.0); d = vec3(0.0, 0.10, 0.20);
  } else if (which == 3) { // Fire
    a = vec3(0.5, 0.2, 0.1); b = vec3(0.5); c = vec3(1.0, 0.6, 0.4); d = vec3(0.0, 0.15, 0.20);
  } else if (which == 4) { // Twilight
    a = vec3(0.6, 0.5, 0.7); b = vec3(0.4, 0.5, 0.4); c = vec3(1.0); d = vec3(0.30, 0.20, 0.50);
  } else { // Mono
    a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.0);
  }
  return clamp(a + b * cos(6.28318530718 * (c * u + d)), 0.0, 1.0);
}`;

  // Single precision shader.
  const FRAG_FP32 = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform vec2 u_center;   // complex center
uniform float u_scale;   // half-height in complex plane
uniform int u_maxIter;
uniform int u_palette;
uniform float u_shift;
uniform float u_cycles;
out vec4 outColor;
${PALETTE_GLSL}

void main() {
  vec2 frag = gl_FragCoord.xy - 0.5 * u_res;
  float aspect = u_res.x / u_res.y;
  vec2 c = u_center + vec2(frag.x / u_res.y, frag.y / u_res.y) * (2.0 * u_scale);

  // Cardioid + period-2 bulb test (skip cheaply known interior)
  float xc = c.x, yc = c.y;
  float q = (xc - 0.25) * (xc - 0.25) + yc * yc;
  bool inside = (q * (q + (xc - 0.25)) < 0.25 * yc * yc) ||
                ((xc + 1.0) * (xc + 1.0) + yc * yc < 0.0625);

  vec3 col;
  if (inside) {
    col = vec3(0.0);
  } else {
    vec2 z = vec2(0.0);
    int n = 0;
    float esc = 256.0;
    for (int i = 0; i < 100000; i++) {
      if (i >= u_maxIter) break;
      float x2 = z.x * z.x;
      float y2 = z.y * z.y;
      if (x2 + y2 > esc) break;
      z = vec2(x2 - y2 + c.x, 2.0 * z.x * z.y + c.y);
      n++;
    }
    if (n >= u_maxIter) {
      col = vec3(0.0);
    } else {
      // Smooth iteration count.
      float mag2 = z.x * z.x + z.y * z.y;
      float mu = float(n) + 1.0 - log(0.5 * log(mag2)) / log(2.0);
      float t = mu / float(u_maxIter);
      col = palette(sqrt(t), u_palette, u_shift, u_cycles);
    }
  }
  outColor = vec4(col, 1.0);
}`;

  // Emulated double-single arithmetic — vec2(hi, lo) represents one number.
  // Uses bitcast splitting to defeat compiler simplification.
  const FRAG_DD = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_res;
uniform vec2 u_centerHi;  // re_hi, im_hi
uniform vec2 u_centerLo;  // re_lo, im_lo
uniform vec2 u_scaleDS;   // (hi, lo)
uniform int u_maxIter;
uniform int u_palette;
uniform float u_shift;
uniform float u_cycles;
out vec4 outColor;
${PALETTE_GLSL}

// Split a float into 12-bit hi half via bit masking — defeats compiler folding.
float split12(float a) {
  uint bits = floatBitsToUint(a);
  bits = bits & 0xfffff000u;
  return uintBitsToFloat(bits);
}

vec2 ds_set(float a) { return vec2(a, 0.0); }

// Knuth/Dekker 2Sum.
vec2 ds_add(vec2 a, vec2 b) {
  float s = a.x + b.x;
  float bb = s - a.x;
  float err = (a.x - (s - bb)) + (b.x - bb);
  err += a.y + b.y;
  vec2 r;
  r.x = s + err;
  r.y = err - (r.x - s);
  return r;
}

vec2 ds_sub(vec2 a, vec2 b) { return ds_add(a, vec2(-b.x, -b.y)); }

// Two-product without FMA, using bitcast splitter.
vec2 two_prod(float a, float b) {
  float p = a * b;
  float a_hi = split12(a);
  float a_lo = a - a_hi;
  float b_hi = split12(b);
  float b_lo = b - b_hi;
  float err = ((a_hi * b_hi - p) + a_hi * b_lo + a_lo * b_hi) + a_lo * b_lo;
  return vec2(p, err);
}

vec2 ds_mul(vec2 a, vec2 b) {
  vec2 P = two_prod(a.x, b.x);
  P.y += a.x * b.y + a.y * b.x;
  vec2 r;
  r.x = P.x + P.y;
  r.y = P.y - (r.x - P.x);
  return r;
}

float ds_compare(vec2 a, float b) { return a.x - b; }

void main() {
  vec2 frag = gl_FragCoord.xy - 0.5 * u_res;
  // pixelScale = (2 * u_scaleDS) / u_res.y
  float invH = 1.0 / u_res.y;
  vec2 px = ds_mul(u_scaleDS, ds_set(2.0 * frag.x * invH));
  vec2 py = ds_mul(u_scaleDS, ds_set(2.0 * frag.y * invH));
  vec2 cx = ds_add(vec2(u_centerHi.x, u_centerLo.x), px);
  vec2 cy = ds_add(vec2(u_centerHi.y, u_centerLo.y), py);

  // Interior test in single precision (just an optimization).
  float xc = cx.x, yc = cy.x;
  float q = (xc - 0.25) * (xc - 0.25) + yc * yc;
  bool inside = (q * (q + (xc - 0.25)) < 0.25 * yc * yc) ||
                ((xc + 1.0) * (xc + 1.0) + yc * yc < 0.0625);

  vec3 col;
  if (inside) {
    col = vec3(0.0);
  } else {
    vec2 zx = ds_set(0.0);
    vec2 zy = ds_set(0.0);
    int n = 0;
    for (int i = 0; i < 100000; i++) {
      if (i >= u_maxIter) break;
      vec2 zx2 = ds_mul(zx, zx);
      vec2 zy2 = ds_mul(zy, zy);
      vec2 mag = ds_add(zx2, zy2);
      if (mag.x > 256.0) break;
      vec2 nzx = ds_add(ds_sub(zx2, zy2), cx);
      vec2 nzy = ds_add(ds_mul(ds_set(2.0), ds_mul(zx, zy)), cy);
      zx = nzx;
      zy = nzy;
      n++;
    }
    if (n >= u_maxIter) {
      col = vec3(0.0);
    } else {
      vec2 zx2 = ds_mul(zx, zx);
      vec2 zy2 = ds_mul(zy, zy);
      float mag2 = zx2.x + zy2.x;
      float mu = float(n) + 1.0 - log(0.5 * log(mag2)) / log(2.0);
      float t = mu / float(u_maxIter);
      col = palette(sqrt(t), u_palette, u_shift, u_cycles);
    }
  }
  outColor = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      console.error(src);
      throw new Error('shader compile');
    }
    return sh;
  }
  function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      throw new Error('link');
    }
    return p;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const progFP = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_FP32));
  const progDD = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_DD));

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uFP = {
    res: gl.getUniformLocation(progFP, 'u_res'),
    center: gl.getUniformLocation(progFP, 'u_center'),
    scale: gl.getUniformLocation(progFP, 'u_scale'),
    maxIter: gl.getUniformLocation(progFP, 'u_maxIter'),
    palette: gl.getUniformLocation(progFP, 'u_palette'),
    shift: gl.getUniformLocation(progFP, 'u_shift'),
    cycles: gl.getUniformLocation(progFP, 'u_cycles'),
  };
  const uDD = {
    res: gl.getUniformLocation(progDD, 'u_res'),
    centerHi: gl.getUniformLocation(progDD, 'u_centerHi'),
    centerLo: gl.getUniformLocation(progDD, 'u_centerLo'),
    scaleDS: gl.getUniformLocation(progDD, 'u_scaleDS'),
    maxIter: gl.getUniformLocation(progDD, 'u_maxIter'),
    palette: gl.getUniformLocation(progDD, 'u_palette'),
    shift: gl.getUniformLocation(progDD, 'u_shift'),
    cycles: gl.getUniformLocation(progDD, 'u_cycles'),
  };

  // ---------- Double-single helpers (JS) ----------
  function splitHiLo(v) {
    const hi = Math.fround(v);
    const lo = Math.fround(v - hi);
    return [hi, lo];
  }

  // ---------- View state ----------
  const HOME = { cx: -0.5, cy: 0.0, scale: 1.4 };
  const view = { cx: HOME.cx, cy: HOME.cy, scale: HOME.scale };

  // ---------- Presets ----------
  // scale = half-height of view in complex plane. zoom = 1.4 / scale.
  const PRESETS = [
    { id: 'home', name: 'Home', sub: '1×', cx: -0.5, cy: 0, scale: 1.4 },
    { id: 'seahorse', name: 'Seahorse Valley', sub: '~10⁶×', cx: -0.7436438870371587, cy: 0.13182590420535, scale: 1.4e-6 },
    { id: 'elephant', name: 'Elephant Valley', sub: '~10³×', cx: 0.275, cy: 0.006, scale: 1.4e-3 },
    { id: 'spiral', name: 'Spiral', sub: '~10³×', cx: -0.7269, cy: 0.1889, scale: 1.4e-3 },
    { id: 'tendrils', name: 'Tendrils', sub: '~10⁴×', cx: -0.10109636384562, cy: 0.95628651080914, scale: 1.4e-4 },
    { id: 'mini', name: 'Mini-Mandelbrot', sub: '~10⁵×', cx: -1.769383178, cy: 0.00423685, scale: 1.4e-5 },
    { id: 'island', name: 'Julia Island', sub: '~10⁶×', cx: -1.768778833, cy: -0.001738996, scale: 1.4e-6 },
    { id: 'lightning', name: 'Lightning', sub: '~10⁴×', cx: -1.7497, cy: 0, scale: 1.4e-4 },
    { id: 'misiurewicz', name: 'Misiurewicz', sub: '~10³×', cx: -0.77568377, cy: 0.13646737, scale: 1.4e-3 },
    { id: 'deep1', name: 'Deep Spiral', sub: '~10⁸×', cx: -0.7436447860, cy: 0.1318252536, scale: 1.4e-8 },
  ];

  // ---------- UI refs ----------
  const ui = {
    iter: document.getElementById('iter'),
    iterval: document.getElementById('iterval'),
    palette: document.getElementById('palette'),
    shift: document.getElementById('shift'),
    shiftval: document.getElementById('shiftval'),
    cycles: document.getElementById('cycles'),
    cyclesval: document.getElementById('cyclesval'),
    autoiter: document.getElementById('autoiter'),
    dd: document.getElementById('dd'),
    re: document.getElementById('re'),
    im: document.getElementById('im'),
    zoom: document.getElementById('zoom'),
    prec: document.getElementById('prec'),
    reset: document.getElementById('reset'),
    screenshot: document.getElementById('screenshot'),
    presets: document.getElementById('presets'),
    panel: document.getElementById('panel'),
    togglePanel: document.getElementById('toggle-panel'),
    showPanel: document.getElementById('show-panel'),
    hint: document.getElementById('hint'),
  };

  // Build preset buttons
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="ttl">${p.name}</span><span class="sub">${p.sub}</span>`;
    b.addEventListener('click', () => animateTo(p));
    ui.presets.appendChild(b);
  }

  // ---------- Render loop ----------
  let dirty = true;
  let interactingUntil = 0;
  let lastFullRender = 0;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const w = Math.floor(window.innerWidth * DPR);
    const h = Math.floor(window.innerHeight * DPR);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    dirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  function autoIters() {
    if (!ui.autoiter.checked) return parseInt(ui.iter.value, 10);
    // Heuristic: more iters as we zoom in. zoom = 1.4 / scale.
    const zoom = 1.4 / view.scale;
    const base = 256;
    const extra = Math.max(0, Math.log10(zoom)) * 220;
    const v = Math.min(8000, Math.round(base + extra));
    ui.iter.value = v;
    ui.iterval.textContent = v;
    return v;
  }

  function shouldUseDD() {
    if (ui.dd.checked) return true;
    // Auto-engage when FP32 starts losing precision.
    // float32 has ~7 decimal digits. Pixel size = 2*scale/h.
    return view.scale < 1.5e-5;
  }

  function render() {
    const interacting = performance.now() < interactingUntil;
    const w = canvas.width;
    const h = canvas.height;
    gl.viewport(0, 0, w, h);

    const useDD = shouldUseDD();
    const iters = autoIters();
    const interactIters = interacting ? Math.min(iters, 350) : iters;
    const palette = parseInt(ui.palette.value, 10);
    const shift = parseFloat(ui.shift.value);
    const cycles = parseFloat(ui.cycles.value);

    if (useDD) {
      gl.useProgram(progDD);
      gl.uniform2f(uDD.res, w, h);
      const [crh, crl] = splitHiLo(view.cx);
      const [cih, cil] = splitHiLo(view.cy);
      const [sh, sl] = splitHiLo(view.scale);
      gl.uniform2f(uDD.centerHi, crh, cih);
      gl.uniform2f(uDD.centerLo, crl, cil);
      gl.uniform2f(uDD.scaleDS, sh, sl);
      gl.uniform1i(uDD.maxIter, interactIters);
      gl.uniform1i(uDD.palette, palette);
      gl.uniform1f(uDD.shift, shift);
      gl.uniform1f(uDD.cycles, cycles);
    } else {
      gl.useProgram(progFP);
      gl.uniform2f(uFP.res, w, h);
      gl.uniform2f(uFP.center, view.cx, view.cy);
      gl.uniform1f(uFP.scale, view.scale);
      gl.uniform1i(uFP.maxIter, interactIters);
      gl.uniform1i(uFP.palette, palette);
      gl.uniform1f(uFP.shift, shift);
      gl.uniform1f(uFP.cycles, cycles);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!interacting) lastFullRender = performance.now();

    // HUD
    const zoom = 1.4 / view.scale;
    ui.re.textContent = view.cx.toPrecision(12);
    ui.im.textContent = view.cy.toPrecision(12);
    ui.zoom.textContent = zoom < 1000 ? zoom.toFixed(2) + '×' : zoom.toExponential(2) + '×';
    ui.prec.textContent = useDD ? 'DD (emulated)' : 'FP32';
  }

  function frame() {
    if (dirty || performance.now() < interactingUntil + 50) {
      render();
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function markDirty() { dirty = true; }
  function bumpInteract(ms = 120) { interactingUntil = performance.now() + ms; markDirty(); }

  // ---------- Input: mouse + touch ----------
  function pointerToComplex(px, py) {
    const rect = canvas.getBoundingClientRect();
    const fx = (px - rect.left) * DPR - canvas.width / 2;
    const fy = -((py - rect.top) * DPR - canvas.height / 2); // flip y
    return {
      x: view.cx + (fx / canvas.height) * (2 * view.scale),
      y: view.cy + (fy / canvas.height) * (2 * view.scale),
    };
  }

  const pointers = new Map(); // pointerId -> {x, y}
  let lastPinchDist = 0;
  let lastPinchMid = null;

  function zoomAroundClient(cx, cy, k) {
    const p = pointerToComplex(cx, cy);
    view.scale *= k;
    view.scale = Math.max(1e-15, Math.min(view.scale, 100));
    const p2 = pointerToComplex(cx, cy);
    view.cx += p.x - p2.x;
    view.cy += p.y - p2.y;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add('dragging');
    lastPinchDist = 0;
    lastPinchMid = null;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };

    if (pointers.size === 1) {
      const dx = (cur.x - prev.x) * DPR;
      const dy = (cur.y - prev.y) * DPR;
      view.cx -= (dx / canvas.height) * (2 * view.scale);
      view.cy += (dy / canvas.height) * (2 * view.scale);
      bumpInteract();
    }
    pointers.set(e.pointerId, cur);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinchDist > 0 && lastPinchMid) {
        zoomAroundClient(mid.x, mid.y, lastPinchDist / dist);
        // Pan by mid-point delta too.
        const ddx = (mid.x - lastPinchMid.x) * DPR;
        const ddy = (mid.y - lastPinchMid.y) * DPR;
        view.cx -= (ddx / canvas.height) * (2 * view.scale);
        view.cy += (ddy / canvas.height) * (2 * view.scale);
        bumpInteract();
      }
      lastPinchDist = dist;
      lastPinchMid = mid;
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { lastPinchDist = 0; lastPinchMid = null; }
    if (pointers.size === 0) canvas.classList.remove('dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    markDirty();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0015);
    zoomAroundClient(e.clientX, e.clientY, k);
    bumpInteract();
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    const p = pointerToComplex(e.clientX, e.clientY);
    animateTo({ cx: p.x, cy: p.y, scale: view.scale * 0.25 });
  });

  // ---------- Animated zoom-to-preset ----------
  let anim = null;
  function animateTo(target, durationMs = 1800) {
    cancelAnimation();
    const start = { cx: view.cx, cy: view.cy, scale: view.scale };
    const t0 = performance.now();
    // Log-interpolation for scale; linear-in-screen-space for center.
    const logS0 = Math.log(start.scale), logS1 = Math.log(target.scale);
    function step(now) {
      const t = Math.min(1, (now - t0) / durationMs);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      view.scale = Math.exp(logS0 + (logS1 - logS0) * e);
      view.cx = start.cx + (target.cx - start.cx) * e;
      view.cy = start.cy + (target.cy - start.cy) * e;
      bumpInteract();
      if (t < 1) anim = requestAnimationFrame(step);
      else { anim = null; markDirty(); }
    }
    anim = requestAnimationFrame(step);
  }
  function cancelAnimation() { if (anim) cancelAnimationFrame(anim); anim = null; }

  // ---------- UI wiring ----------
  ui.iter.addEventListener('input', () => { ui.iterval.textContent = ui.iter.value; ui.autoiter.checked = false; markDirty(); });
  ui.palette.addEventListener('input', markDirty);
  ui.shift.addEventListener('input', () => { ui.shiftval.textContent = parseFloat(ui.shift.value).toFixed(2); markDirty(); });
  ui.cycles.addEventListener('input', () => { ui.cyclesval.textContent = parseFloat(ui.cycles.value).toFixed(1); markDirty(); });
  ui.autoiter.addEventListener('change', markDirty);
  ui.dd.addEventListener('change', markDirty);
  ui.reset.addEventListener('click', () => animateTo(HOME, 900));

  ui.screenshot.addEventListener('click', () => {
    // Force a clean full-quality render before grabbing.
    interactingUntil = 0;
    render();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mandelbrot_${view.cx.toFixed(8)}_${view.cy.toFixed(8)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });

  ui.togglePanel.addEventListener('click', () => {
    ui.panel.classList.add('hidden');
    ui.showPanel.classList.add('visible');
  });
  ui.showPanel.addEventListener('click', () => {
    ui.panel.classList.remove('hidden');
    ui.showPanel.classList.remove('visible');
  });

  // Fade hint after a few seconds
  setTimeout(() => ui.hint.classList.add('fade'), 4000);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') { animateTo(HOME, 900); }
    else if (e.key === 'h' || e.key === 'H') {
      ui.panel.classList.toggle('hidden');
      ui.showPanel.classList.toggle('visible');
    }
  });
})();
