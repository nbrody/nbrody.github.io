/* 2D scalar wave equation
 *   ∂²u/∂t² = c² ∇²u
 * solved with the leapfrog finite-difference scheme:
 *   u^{n+1}[i,j] = 2 u^n[i,j] − u^{n-1}[i,j] + κ² · (Σ neighbours − 4 u^n[i,j])
 * where κ = c·dt/h.  CFL bound in 2D: κ ≤ 1/√2.
 *
 * Walls: a `mask` byte array; mask=1 forces u=0 (perfect reflectors).
 * Sources: a list of {i,j,freq,amp} that drive u sinusoidally each step.
 * Boundaries: reflective (Dirichlet u=0), absorbing (Mur first-order),
 * or periodic (wrap).
 */

(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  const $ = (id) => document.getElementById(id);
  const ui = {
    res: $('res'), resVal: $('resVal'),
    speed: $('speed'), speedVal: $('speedVal'),
    damp: $('damp'), dampVal: $('dampVal'),
    amp: $('amp'), ampVal: $('ampVal'),
    pulseWidth: $('pulseWidth'), pulseWidthVal: $('pulseWidthVal'),
    brush: $('brush'), brushVal: $('brushVal'),
    bndSeg: $('bndSeg'),
    toolSeg: $('toolSeg'),
    freq: $('freq'), freqVal: $('freqVal'),
    palette: $('palette'),
    playBtn: $('playBtn'),
    resetBtn: $('resetBtn'),
    clearWallsBtn: $('clearWallsBtn'),
    clearAllBtn: $('clearAllBtn'),
    preset: $('preset'),
    statRes: $('statRes'),
    statStep: $('statStep'),
    statMs: $('statMs'),
    statAmp: $('statAmp'),
    uiToggle: $('uiToggle'),
  };

  // ── Sim state ────────────────────────────────────────────────
  let N = 300;
  let kappa = 0.50;
  let damping = 0.0005;
  let pulseAmp = 1.0;
  let pulseWidth = 3;
  let brushSize = 5;
  let boundary = 'reflect';
  let tool = 'pulse';
  let sourceFreq = 0.10;
  let palette = 'diverging';
  let running = true;
  let step = 0;

  let u, uPrev, uNext;       // Float32Array (N+2)*(N+2)
  let mask;                  // Uint8Array; 1 = wall
  let sources = [];          // {i, j, freq, amp, phase0}
  let img;

  function IX(i, j) { return i + (N + 2) * j; }

  function allocate() {
    const sz = (N + 2) * (N + 2);
    u = new Float32Array(sz);
    uPrev = new Float32Array(sz);
    uNext = new Float32Array(sz);
    mask = new Uint8Array(sz);
    sources = [];
    img = ctx.createImageData(N, N);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  }

  // ── Step ─────────────────────────────────────────────────────
  function applyMurAbsorbingBoundaries(uOld, uNewArr) {
    // Mur 1st-order: u_b^{n+1} = u_{b+1}^n + (κ-1)/(κ+1) (u_{b+1}^{n+1} - u_b^n)
    const c = (kappa - 1) / (kappa + 1);
    for (let i = 1; i <= N; i++) {
      uNewArr[IX(i, 0)]     = uOld[IX(i, 1)]     + c * (uNewArr[IX(i, 1)]     - uOld[IX(i, 0)]);
      uNewArr[IX(i, N + 1)] = uOld[IX(i, N)]     + c * (uNewArr[IX(i, N)]     - uOld[IX(i, N + 1)]);
      uNewArr[IX(0, i)]     = uOld[IX(1, i)]     + c * (uNewArr[IX(1, i)]     - uOld[IX(0, i)]);
      uNewArr[IX(N + 1, i)] = uOld[IX(N, i)]     + c * (uNewArr[IX(N, i)]     - uOld[IX(N + 1, i)]);
    }
  }

  function applyReflectiveBoundaries(uNewArr) {
    // u = 0 at the border (Dirichlet) — reflectors flip phase.
    for (let i = 0; i <= N + 1; i++) {
      uNewArr[IX(i, 0)] = 0;
      uNewArr[IX(i, N + 1)] = 0;
      uNewArr[IX(0, i)] = 0;
      uNewArr[IX(N + 1, i)] = 0;
    }
  }

  function applyPeriodicBoundaries(uNewArr) {
    for (let i = 1; i <= N; i++) {
      uNewArr[IX(0, i)]     = uNewArr[IX(N, i)];
      uNewArr[IX(N + 1, i)] = uNewArr[IX(1, i)];
      uNewArr[IX(i, 0)]     = uNewArr[IX(i, N)];
      uNewArr[IX(i, N + 1)] = uNewArr[IX(i, 1)];
    }
  }

  function leapfrogStep() {
    const k2 = kappa * kappa;
    const dampFactor = 1 - damping;
    // Inner stencil
    for (let j = 1; j <= N; j++) {
      const row = (N + 2) * j;
      for (let i = 1; i <= N; i++) {
        const idx = i + row;
        if (mask[idx]) {
          uNext[idx] = 0;
          continue;
        }
        const lap = u[idx + 1] + u[idx - 1] + u[idx + (N + 2)] + u[idx - (N + 2)] - 4 * u[idx];
        uNext[idx] = (2 * u[idx] - uPrev[idx] + k2 * lap) * dampFactor;
      }
    }
    // Boundaries
    if (boundary === 'reflect') applyReflectiveBoundaries(uNext);
    else if (boundary === 'absorb') applyMurAbsorbingBoundaries(u, uNext);
    else /* wrap */ applyPeriodicBoundaries(uNext);

    // Sources: drive uNext sinusoidally
    for (const s of sources) {
      const k = IX(s.i, s.j);
      if (mask[k]) continue;
      uNext[k] = s.amp * Math.sin((step + 1) * s.freq * 2 * Math.PI + s.phase0);
    }

    // Rotate buffers
    const tmp = uPrev;
    uPrev = u;
    u = uNext;
    uNext = tmp;
    step++;
  }

  // ── Pulse / wall painting ────────────────────────────────────
  function dropPulse(gx, gy, amp, width) {
    const r = Math.max(2, width * 2);
    const sigma2 = (width * width) || 1;
    for (let dj = -r; dj <= r; dj++) {
      const j = gy + dj;
      if (j < 1 || j > N) continue;
      for (let di = -r; di <= r; di++) {
        const i = gx + di;
        if (i < 1 || i > N) continue;
        const k = IX(i, j);
        if (mask[k]) continue;
        const w = Math.exp(-(di * di + dj * dj) / (2 * sigma2));
        u[k] += amp * w;
        uPrev[k] += amp * w; // matched pair => initial velocity zero
      }
    }
  }

  function paintWall(gx, gy, value) {
    const r = brushSize;
    const r2 = r * r;
    for (let dj = -r; dj <= r; dj++) {
      const j = gy + dj;
      if (j < 1 || j > N) continue;
      for (let di = -r; di <= r; di++) {
        const i = gx + di;
        if (i < 1 || i > N) continue;
        if (di * di + dj * dj > r2) continue;
        const k = IX(i, j);
        mask[k] = value;
        if (value) {
          u[k] = 0; uPrev[k] = 0;
        }
      }
    }
  }

  function placeSource(gx, gy) {
    sources.push({
      i: gx, j: gy,
      freq: sourceFreq,
      amp: pulseAmp,
      phase0: 0,
    });
  }

  function clearWalls() {
    mask.fill(0);
  }
  function clearField() {
    u.fill(0); uPrev.fill(0); uNext.fill(0);
    sources.length = 0;
    step = 0;
  }

  // ── Presets ──────────────────────────────────────────────────
  function preset(name) {
    clearWalls();
    clearField();
    if (name === 'pulse') {
      dropPulse((N >> 1), (N >> 1), pulseAmp, pulseWidth);
    } else if (name === 'doubleSlit') {
      buildSlitWall(2);
      sources.push({ i: 8, j: N >> 1, freq: 0.10, amp: pulseAmp, phase0: 0 });
    } else if (name === 'singleSlit') {
      buildSlitWall(1);
      sources.push({ i: 8, j: N >> 1, freq: 0.10, amp: pulseAmp, phase0: 0 });
    } else if (name === 'lens') {
      buildSlitWall(3);
      sources.push({ i: 8, j: N >> 1, freq: 0.08, amp: pulseAmp, phase0: 0 });
    } else if (name === 'cavity') {
      const m = N >> 1;
      const side = (N * 0.4) | 0;
      // hollow rectangle: walls everywhere except a thin opening
      for (let i = m - side; i <= m + side; i++) {
        paintWall(i, m - side, 1);
        paintWall(i, m + side, 1);
      }
      for (let j = m - side; j <= m + side; j++) {
        paintWall(m - side, j, 1);
        paintWall(m + side, j, 1);
      }
      // Drop pulse inside
      dropPulse(m - 5, m + 8, pulseAmp, 2);
    } else if (name === 'twoSrc') {
      const m = N >> 1;
      const sep = Math.max(8, (N * 0.12) | 0);
      sources.push({ i: m, j: m - sep, freq: 0.08, amp: pulseAmp, phase0: 0 });
      sources.push({ i: m, j: m + sep, freq: 0.08, amp: pulseAmp, phase0: 0 });
    }
  }

  function buildSlitWall(slits) {
    const wallI = (N * 0.32) | 0;
    const m = N >> 1;
    const wallThickness = 3;
    // Solid wall
    for (let dj = 0; dj <= N; dj++) {
      for (let dt = 0; dt < wallThickness; dt++) {
        paintWallCell(wallI + dt, dj + 1, 1);
      }
    }
    // Carve slits
    const slitWidth = Math.max(2, (N * 0.025) | 0);
    if (slits === 1) {
      carveGap(wallI, m, slitWidth, wallThickness);
    } else if (slits === 2) {
      const sep = Math.max(8, (N * 0.10) | 0);
      carveGap(wallI, m - sep, slitWidth, wallThickness);
      carveGap(wallI, m + sep, slitWidth, wallThickness);
    } else if (slits === 3) {
      const sep = Math.max(8, (N * 0.16) | 0);
      carveGap(wallI, m - sep, slitWidth, wallThickness);
      carveGap(wallI, m,       slitWidth, wallThickness);
      carveGap(wallI, m + sep, slitWidth, wallThickness);
    }
  }
  function paintWallCell(i, j, v) {
    if (i < 1 || i > N || j < 1 || j > N) return;
    const k = IX(i, j);
    mask[k] = v;
    if (v) { u[k] = 0; uPrev[k] = 0; }
  }
  function carveGap(wallI, centerJ, halfWidth, thickness) {
    for (let dt = 0; dt < thickness; dt++) {
      for (let dj = -halfWidth; dj <= halfWidth; dj++) {
        paintWallCell(wallI + dt, centerJ + dj, 0);
      }
    }
  }

  // ── Color palettes ───────────────────────────────────────────
  function colorize(t) {
    // t ∈ [-1, 1]
    const mag = Math.min(1, Math.abs(t));
    if (palette === 'diverging') {
      if (t > 0) {
        return [Math.min(255, 30 + mag * 240) | 0,
                Math.min(255, 50 + mag * 90) | 0,
                Math.min(255, 90 + mag * 30) | 0];
      } else {
        return [Math.min(255, 30 + mag * 30) | 0,
                Math.min(255, 80 + mag * 130) | 0,
                Math.min(255, 100 + mag * 200) | 0];
      }
    } else if (palette === 'thermal') {
      const x = (t + 1) * 0.5; // [0,1]
      const r = Math.min(255, Math.max(0, x * 510 - 64)) | 0;
      const g = Math.min(255, Math.max(0, x * 510 - 200)) | 0;
      const b = Math.min(255, Math.max(0, (x - 0.5) * 510)) | 0;
      return [r, g, b];
    } else if (palette === 'viridis') {
      const x = (t + 1) * 0.5;
      const r = Math.min(255, Math.max(0, (-0.30 + 4.50 * x - 5.20 * x * x + 1.10 * x * x * x) * 255)) | 0;
      const g = Math.min(255, Math.max(0, (-0.20 + 2.20 * x + 0.40 * x * x - 0.50 * x * x * x) * 255)) | 0;
      const b = Math.min(255, Math.max(0, ( 0.40 + 1.20 * x - 3.30 * x * x + 1.40 * x * x * x) * 255)) | 0;
      return [r, g, b];
    }
    // monochrome
    const v = Math.min(255, mag * 255) | 0;
    return [v, v, v];
  }

  function renderToImage() {
    const data = img.data;
    // Auto-scale by max |u| but with a soft floor so static fields aren't oversaturated.
    let maxA = 1e-3;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const a = Math.abs(u[IX(i, j)]);
        if (a > maxA) maxA = a;
      }
    }
    const scale = 1 / Math.max(0.4, maxA);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = IX(i + 1, j + 1);
        const p = (i + j * N) << 2;
        if (mask[k]) {
          data[p] = 200; data[p + 1] = 210; data[p + 2] = 230;
        } else {
          const t = u[k] * scale;
          const c = colorize(t);
          data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2];
        }
      }
    }
    blit();
  }

  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');
  function blit() {
    if (offCanvas.width !== N || offCanvas.height !== N) {
      offCanvas.width = N;
      offCanvas.height = N;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
  }

  // ── Input ────────────────────────────────────────────────────
  let pointerDown = false;
  let dragMode = null; // 'pulse'|'wall'|'erase'|'src'

  function pointerToGrid(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    return { gx: Math.max(1, Math.min(N, 1 + Math.floor(x * N))),
             gy: Math.max(1, Math.min(N, 1 + Math.floor(y * N))) };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    pointerDown = true;
    try { canvas.setPointerCapture(ev.pointerId); } catch {}
    const p = pointerToGrid(ev);
    // Shift forces wall painting; otherwise use the active tool.
    dragMode = ev.shiftKey ? 'wall' : tool;
    actAtPoint(p, dragMode, true);
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!pointerDown) return;
    const p = pointerToGrid(ev);
    actAtPoint(p, dragMode, false);
  });
  const endPointer = (ev) => {
    pointerDown = false; dragMode = null;
    try { canvas.releasePointerCapture(ev.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { pointerDown = false; dragMode = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function actAtPoint(p, mode, isFirst) {
    if (mode === 'pulse') {
      // Drop pulses while dragging, but throttle so it doesn't saturate.
      if (isFirst || Math.random() < 0.18) {
        dropPulse(p.gx, p.gy, pulseAmp, pulseWidth);
      }
    } else if (mode === 'wall') {
      paintWall(p.gx, p.gy, 1);
    } else if (mode === 'erase') {
      paintWall(p.gx, p.gy, 0);
    } else if (mode === 'src') {
      if (isFirst) placeSource(p.gx, p.gy);
    }
  }

  // ── Reset / resize ───────────────────────────────────────────
  function reset() {
    allocate();
    step = 0;
    ui.statRes.textContent = `${N}×${N}`;
    dropPulse(N >> 1, N >> 1, pulseAmp, pulseWidth);
  }
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // ── Main loop ────────────────────────────────────────────────
  function frame() {
    if (running) {
      const t0 = performance.now();
      // Take a couple of substeps so the wave moves at a comfortable speed
      // even on high-refresh displays.
      const substeps = 2;
      for (let s = 0; s < substeps; s++) leapfrogStep();
      const t1 = performance.now();
      ui.statStep.textContent = step;
      ui.statMs.textContent = (t1 - t0).toFixed(1);
      let m = 0;
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const a = Math.abs(u[IX(i, j)]);
          if (a > m) m = a;
        }
      }
      ui.statAmp.textContent = m.toFixed(2);
    }
    renderToImage();
    requestAnimationFrame(frame);
  }

  // ── Wire UI ──────────────────────────────────────────────────
  function bindRange(input, label, fmt, onChange) {
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      label.textContent = fmt(v);
      onChange(v);
    });
    label.textContent = fmt(parseFloat(input.value));
  }

  bindRange(ui.res, ui.resVal, (v) => v | 0, (v) => { N = v | 0; reset(); });
  bindRange(ui.speed, ui.speedVal, (v) => v.toFixed(2), (v) => { kappa = v; });
  bindRange(ui.damp, ui.dampVal, (v) => v.toFixed(4), (v) => { damping = v; });
  bindRange(ui.amp, ui.ampVal, (v) => v.toFixed(2), (v) => { pulseAmp = v; });
  bindRange(ui.pulseWidth, ui.pulseWidthVal, (v) => v | 0, (v) => { pulseWidth = v | 0; });
  bindRange(ui.brush, ui.brushVal, (v) => v | 0, (v) => { brushSize = v | 0; });
  bindRange(ui.freq, ui.freqVal, (v) => v.toFixed(2), (v) => {
    sourceFreq = v;
    for (const s of sources) s.freq = v;
  });

  // Segmented controls
  ui.bndSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-bnd]');
    if (!b) return;
    boundary = b.dataset.bnd;
    [...ui.bndSeg.querySelectorAll('button')].forEach(x => x.classList.toggle('active', x === b));
  });
  ui.toolSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tool]');
    if (!b) return;
    tool = b.dataset.tool;
    [...ui.toolSeg.querySelectorAll('button')].forEach(x => x.classList.toggle('active', x === b));
    document.body.classList.toggle('tool-wall', tool === 'wall' || tool === 'erase');
  });

  ui.palette.addEventListener('change', () => { palette = ui.palette.value; });
  ui.preset.addEventListener('change', () => {
    const p = ui.preset.value;
    if (p) preset(p);
    ui.preset.value = '';
  });

  ui.playBtn.addEventListener('click', () => {
    running = !running;
    ui.playBtn.textContent = running ? 'Pause' : 'Play';
    ui.playBtn.classList.toggle('primary', running);
  });
  ui.resetBtn.addEventListener('click', reset);
  ui.clearWallsBtn.addEventListener('click', clearWalls);
  ui.clearAllBtn.addEventListener('click', () => { clearField(); clearWalls(); });

  ui.uiToggle.addEventListener('click', () => {
    document.body.classList.toggle('ui-open');
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { ui.playBtn.click(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') { reset(); }
    else if (e.key === 'u' || e.key === 'U') { ui.uiToggle.click(); }
    else if (e.key === 'c' || e.key === 'C') { clearField(); }
  });

  window.addEventListener('resize', resizeCanvas);

  // ── Boot ─────────────────────────────────────────────────────
  resizeCanvas();
  reset();
  requestAnimationFrame(frame);
})();
