/* Navier–Stokes (Stable Fluids) — Jos Stam style solver
 *
 * Grid: (N+2) x (N+2) cells, with a 1-cell border for boundary handling.
 * State: u (x-vel), v (y-vel), and three dye channels r,g,b.
 * Step: addForces -> velocity diffuse -> velocity project -> velocity advect
 *       -> velocity project -> dye diffuse -> dye advect.
 * Optional: vorticity confinement for crisper eddies.
 */

(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  // ── DOM controls ─────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const ui = {
    res: $('res'), resVal: $('resVal'),
    visc: $('visc'), viscVal: $('viscVal'),
    diff: $('diff'), diffVal: $('diffVal'),
    dt: $('dt'), dtVal: $('dtVal'),
    fade: $('fade'), fadeVal: $('fadeVal'),
    vort: $('vort'), vortVal: $('vortVal'),
    brush: $('brush'), brushVal: $('brushVal'),
    force: $('force'), forceVal: $('forceVal'),
    palette: $('palette'),
    display: $('display'),
    playBtn: $('playBtn'),
    resetBtn: $('resetBtn'),
    splatBtn: $('splatBtn'),
    boundaryBtn: $('boundaryBtn'),
    statRes: $('statRes'),
    statStep: $('statStep'),
    statMs: $('statMs'),
    statSpd: $('statSpd'),
    uiToggle: $('uiToggle'),
  };

  // ── Sim state ────────────────────────────────────────────────
  let N = 160;          // interior grid resolution (square)
  let dt = 0.10;
  let visc = 0.0;
  let diff = 0.0;
  let fade = 0.992;
  let vortStrength = 2.0;
  let brushSize = 3;
  let forceScale = 6;
  let palette = 'aurora';
  let displayMode = 'dye';
  let walls = true;
  let running = true;
  let step = 0;

  // Fields are flat (N+2)*(N+2) Float32Arrays, indexed by IX(i,j).
  let u, v, u0, v0;
  let dr, dg, db, dr0, dg0, db0;
  let pField, divField, curlField;

  // Render bitmap (one byte per pixel × 4)
  let img;

  function IX(i, j) { return i + (N + 2) * j; }

  function allocate() {
    const sz = (N + 2) * (N + 2);
    u = new Float32Array(sz); v = new Float32Array(sz);
    u0 = new Float32Array(sz); v0 = new Float32Array(sz);
    dr = new Float32Array(sz); dg = new Float32Array(sz); db = new Float32Array(sz);
    dr0 = new Float32Array(sz); dg0 = new Float32Array(sz); db0 = new Float32Array(sz);
    pField = new Float32Array(sz);
    divField = new Float32Array(sz);
    curlField = new Float32Array(sz);
    img = ctx.createImageData(N, N);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  }

  // ── Boundary handling ────────────────────────────────────────
  // b: 0 = scalar (mirror), 1 = u (negate at vertical walls),
  //    2 = v (negate at horizontal walls).
  function setBnd(b, x) {
    if (walls) {
      for (let i = 1; i <= N; i++) {
        x[IX(0, i)]     = b === 1 ? -x[IX(1, i)]     : x[IX(1, i)];
        x[IX(N + 1, i)] = b === 1 ? -x[IX(N, i)]     : x[IX(N, i)];
        x[IX(i, 0)]     = b === 2 ? -x[IX(i, 1)]     : x[IX(i, 1)];
        x[IX(i, N + 1)] = b === 2 ? -x[IX(i, N)]     : x[IX(i, N)];
      }
    } else {
      // Periodic wrap
      for (let i = 1; i <= N; i++) {
        x[IX(0, i)]     = x[IX(N, i)];
        x[IX(N + 1, i)] = x[IX(1, i)];
        x[IX(i, 0)]     = x[IX(i, N)];
        x[IX(i, N + 1)] = x[IX(i, 1)];
      }
    }
    x[IX(0, 0)]         = 0.5 * (x[IX(1, 0)]     + x[IX(0, 1)]);
    x[IX(0, N + 1)]     = 0.5 * (x[IX(1, N + 1)] + x[IX(0, N)]);
    x[IX(N + 1, 0)]     = 0.5 * (x[IX(N, 0)]     + x[IX(N + 1, 1)]);
    x[IX(N + 1, N + 1)] = 0.5 * (x[IX(N, N + 1)] + x[IX(N + 1, N)]);
  }

  // Implicit diffusion via Gauss–Seidel (linear solver).
  function linSolve(b, x, x0, a, c, iters = 12) {
    const cinv = 1 / c;
    for (let k = 0; k < iters; k++) {
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          x[IX(i, j)] = (x0[IX(i, j)] +
            a * (x[IX(i - 1, j)] + x[IX(i + 1, j)] +
                 x[IX(i, j - 1)] + x[IX(i, j + 1)])) * cinv;
        }
      }
      setBnd(b, x);
    }
  }

  function diffuse(b, x, x0, rate) {
    const a = dt * rate * N * N;
    if (a === 0) {
      x.set(x0);
      setBnd(b, x);
    } else {
      linSolve(b, x, x0, a, 1 + 4 * a);
    }
  }

  // Semi-Lagrangian advection.
  function advect(b, d, d0, uu, vv) {
    const dt0 = dt * N;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        let x = i - dt0 * uu[IX(i, j)];
        let y = j - dt0 * vv[IX(i, j)];
        if (x < 0.5) x = 0.5;
        if (x > N + 0.5) x = N + 0.5;
        if (y < 0.5) y = 0.5;
        if (y > N + 0.5) y = N + 0.5;
        const i0 = x | 0, i1 = i0 + 1;
        const j0 = y | 0, j1 = j0 + 1;
        const s1 = x - i0, s0 = 1 - s1;
        const t1 = y - j0, t0 = 1 - t1;
        d[IX(i, j)] =
          s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
          s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
      }
    }
    setBnd(b, d);
  }

  // Hodge projection: subtract gradient of pressure to enforce ∇·u = 0.
  function project(uu, vv, p, divg) {
    const h = 1 / N;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        divg[IX(i, j)] = -0.5 * h * (
          uu[IX(i + 1, j)] - uu[IX(i - 1, j)] +
          vv[IX(i, j + 1)] - vv[IX(i, j - 1)]
        );
        p[IX(i, j)] = 0;
      }
    }
    setBnd(0, divg); setBnd(0, p);
    linSolve(0, p, divg, 1, 4, 16);
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        uu[IX(i, j)] -= 0.5 * (p[IX(i + 1, j)] - p[IX(i - 1, j)]) / h;
        vv[IX(i, j)] -= 0.5 * (p[IX(i, j + 1)] - p[IX(i, j - 1)]) / h;
      }
    }
    setBnd(1, uu); setBnd(2, vv);
  }

  // Vorticity confinement (Fedkiw et al.) — re-injects swirl lost to diffusion.
  function confineVorticity(strength) {
    if (strength <= 0) return;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        curlField[IX(i, j)] = 0.5 * (
          (v[IX(i + 1, j)] - v[IX(i - 1, j)]) -
          (u[IX(i, j + 1)] - u[IX(i, j - 1)])
        );
      }
    }
    for (let j = 2; j <= N - 1; j++) {
      for (let i = 2; i <= N - 1; i++) {
        const dwdx = 0.5 * (Math.abs(curlField[IX(i + 1, j)]) - Math.abs(curlField[IX(i - 1, j)]));
        const dwdy = 0.5 * (Math.abs(curlField[IX(i, j + 1)]) - Math.abs(curlField[IX(i, j - 1)]));
        const len = Math.hypot(dwdx, dwdy) + 1e-5;
        const nx = dwdx / len;
        const ny = dwdy / len;
        const w = curlField[IX(i, j)];
        u[IX(i, j)] += dt * strength * (ny * w);
        v[IX(i, j)] += dt * strength * (-nx * w);
      }
    }
    setBnd(1, u); setBnd(2, v);
  }

  // ── Step ─────────────────────────────────────────────────────
  function velStep() {
    // u0/v0 are the "previous" values; swap then run.
    let tmp;
    diffuse(1, u0, u, visc);
    diffuse(2, v0, v, visc);
    project(u0, v0, pField, divField);
    advect(1, u, u0, u0, v0);
    advect(2, v, v0, u0, v0);
    project(u, v, pField, divField);
    confineVorticity(vortStrength);
  }

  function dyeStep() {
    diffuse(0, dr0, dr, diff);
    diffuse(0, dg0, dg, diff);
    diffuse(0, db0, db, diff);
    advect(0, dr, dr0, u, v);
    advect(0, dg, dg0, u, v);
    advect(0, db, db0, u, v);
    if (fade < 1) {
      for (let k = 0; k < dr.length; k++) {
        dr[k] *= fade; dg[k] *= fade; db[k] *= fade;
      }
    }
  }

  // ── Palettes (dye injection color picker) ────────────────────
  function paletteColor(t) {
    // t ∈ [0, 1]
    switch (palette) {
      case 'aurora': {
        // teal -> blue -> magenta
        const r = 0.43 * smooth(t, 0.55, 1.0) + 0.05;
        const g = 0.95 * smooth(t, 0.0, 0.55) + 0.10 * smooth(t, 0.55, 1.0);
        const b = 0.55 * smooth(t, 0.0, 0.4) + 0.95 * smooth(t, 0.4, 1.0);
        return [r, g, b];
      }
      case 'ember': {
        const r = 0.95;
        const g = 0.25 + 0.55 * t;
        const b = 0.05 + 0.10 * t;
        return [r, g, b];
      }
      case 'ocean': {
        return [0.05 + 0.15 * t, 0.45 + 0.35 * t, 0.85 - 0.15 * t];
      }
      case 'ink': {
        const v = 0.85 - 0.4 * t;
        return [v * 0.92, v * 0.95, v];
      }
      case 'rainbow': {
        // HSL with H rotating around the wheel
        return hslToRgb(t, 0.85, 0.55);
      }
    }
    return [1, 1, 1];
  }
  function smooth(t, a, b) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    const x = (t - a) / (b - a);
    return x * x * (3 - 2 * x);
  }
  function hslToRgb(h, s, l) {
    const k = (n) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)];
  }

  // ── Rendering ────────────────────────────────────────────────
  function renderToImage() {
    const data = img.data;
    if (displayMode === 'dye') {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = IX(i + 1, j + 1);
          const p = (i + j * N) << 2;
          data[p]     = clamp255(dr[k]);
          data[p + 1] = clamp255(dg[k]);
          data[p + 2] = clamp255(db[k]);
        }
      }
    } else if (displayMode === 'speed') {
      // normalize to current max
      let m = 1e-6;
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const k = IX(i, j);
          const s = u[k] * u[k] + v[k] * v[k];
          if (s > m) m = s;
        }
      }
      const inv = 1 / Math.sqrt(m);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = IX(i + 1, j + 1);
          const s = Math.sqrt(u[k] * u[k] + v[k] * v[k]) * inv;
          const c = paletteColor(s);
          const p = (i + j * N) << 2;
          data[p]     = (c[0] * 255) | 0;
          data[p + 1] = (c[1] * 255) | 0;
          data[p + 2] = (c[2] * 255) | 0;
        }
      }
    } else if (displayMode === 'vort') {
      // recompute curl
      let m = 1e-6;
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const w = 0.5 * (
            (v[IX(i + 1, j)] - v[IX(i - 1, j)]) -
            (u[IX(i, j + 1)] - u[IX(i, j - 1)])
          );
          curlField[IX(i, j)] = w;
          if (Math.abs(w) > m) m = Math.abs(w);
        }
      }
      const inv = 1 / m;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const w = curlField[IX(i + 1, j + 1)] * inv;
          const r = w > 0 ? Math.min(255, w * 320) : 0;
          const b = w < 0 ? Math.min(255, -w * 320) : 0;
          const g = Math.min(255, Math.abs(w) * 80);
          const p = (i + j * N) << 2;
          data[p]     = r | 0;
          data[p + 1] = g | 0;
          data[p + 2] = b | 0;
        }
      }
    } else if (displayMode === 'press') {
      let lo = Infinity, hi = -Infinity;
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const p = pField[IX(i, j)];
          if (p < lo) lo = p; if (p > hi) hi = p;
        }
      }
      const range = Math.max(1e-6, hi - lo);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const t = (pField[IX(i + 1, j + 1)] - lo) / range;
          const c = paletteColor(t);
          const p = (i + j * N) << 2;
          data[p]     = (c[0] * 255) | 0;
          data[p + 1] = (c[1] * 255) | 0;
          data[p + 2] = (c[2] * 255) | 0;
        }
      }
    }

    // Blit to canvas with up-scaling (offscreen ImageData -> canvas pattern).
    blit();
  }
  function clamp255(x) { return x < 0 ? 0 : x > 1 ? 255 : (x * 255) | 0; }

  // Use an offscreen canvas to upscale our N×N image to fill the viewport.
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');

  function blit() {
    if (offCanvas.width !== N || offCanvas.height !== N) {
      offCanvas.width = N;
      offCanvas.height = N;
    }
    offCtx.putImageData(img, 0, 0);
    // Smooth interpolation on the upscale for non-pixel modes.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
  }

  // ── Input ────────────────────────────────────────────────────
  let pointerDown = false;
  let lastX = 0, lastY = 0;
  let pointerHueT = Math.random();
  let pendingForces = []; // {gx, gy, fu, fv, hue}

  function pointerToGrid(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    return { gx: 1 + Math.floor(x * N), gy: 1 + Math.floor(y * N), nx: x, ny: y };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    pointerDown = true;
    canvas.setPointerCapture(ev.pointerId);
    pointerHueT = Math.random();
    const p = pointerToGrid(ev);
    lastX = p.nx; lastY = p.ny;
    addSplat(p.gx, p.gy, 0, 0, paletteColor(pointerHueT), brushSize);
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!pointerDown) return;
    const p = pointerToGrid(ev);
    const dx = (p.nx - lastX) * forceScale;
    const dy = (p.ny - lastY) * forceScale;
    lastX = p.nx; lastY = p.ny;
    pointerHueT = (pointerHueT + 0.01) % 1;
    pendingForces.push({
      gx: p.gx, gy: p.gy, fu: dx, fv: dy, color: paletteColor(pointerHueT),
    });
    ev.preventDefault();
  });
  const endPointer = (ev) => {
    pointerDown = false;
    try { canvas.releasePointerCapture(ev.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { pointerDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function addSplat(gx, gy, fu, fv, color, radius) {
    const r2 = radius * radius;
    for (let dj = -radius; dj <= radius; dj++) {
      const j = gy + dj;
      if (j < 1 || j > N) continue;
      for (let di = -radius; di <= radius; di++) {
        const i = gx + di;
        if (i < 1 || i > N) continue;
        const d2 = di * di + dj * dj;
        if (d2 > r2) continue;
        const w = Math.exp(-d2 / (r2 * 0.5));
        const k = IX(i, j);
        u[k] += fu * w;
        v[k] += fv * w;
        dr[k] = Math.min(2.0, dr[k] + color[0] * w * 1.4);
        dg[k] = Math.min(2.0, dg[k] + color[1] * w * 1.4);
        db[k] = Math.min(2.0, db[k] + color[2] * w * 1.4);
      }
    }
  }

  function applyPendingForces() {
    while (pendingForces.length) {
      const f = pendingForces.shift();
      addSplat(f.gx, f.gy, f.fu, f.fv, f.color, brushSize);
    }
  }

  function randomSplats(count = 6) {
    for (let i = 0; i < count; i++) {
      const gx = 1 + ((Math.random() * N) | 0);
      const gy = 1 + ((Math.random() * N) | 0);
      const ang = Math.random() * Math.PI * 2;
      const mag = 0.8 + Math.random() * 2.4;
      addSplat(gx, gy,
        Math.cos(ang) * mag, Math.sin(ang) * mag,
        paletteColor(Math.random()),
        brushSize + 2);
    }
  }

  // ── Reset / resize ───────────────────────────────────────────
  function reset() {
    allocate();
    step = 0;
    ui.statRes.textContent = `${N}×${N}`;
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // ── Main loop ────────────────────────────────────────────────
  let lastFrame = performance.now();
  function frame(now) {
    const elapsed = now - lastFrame;
    lastFrame = now;

    if (running) {
      const t0 = performance.now();
      applyPendingForces();
      velStep();
      dyeStep();
      const t1 = performance.now();
      step++;
      ui.statStep.textContent = step;
      ui.statMs.textContent = (t1 - t0).toFixed(1);
      // peak speed
      let m = 0;
      for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
          const k = IX(i, j);
          const s = u[k] * u[k] + v[k] * v[k];
          if (s > m) m = s;
        }
      }
      ui.statSpd.textContent = Math.sqrt(m).toFixed(2);
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

  bindRange(ui.res, ui.resVal, (v) => v | 0, (v) => {
    N = v | 0;
    reset();
  });
  bindRange(ui.visc, ui.viscVal, (v) => v.toFixed(5), (v) => { visc = v; });
  bindRange(ui.diff, ui.diffVal, (v) => v.toFixed(5), (v) => { diff = v; });
  bindRange(ui.dt, ui.dtVal, (v) => v.toFixed(2), (v) => { dt = v; });
  bindRange(ui.fade, ui.fadeVal, (v) => v.toFixed(3), (v) => { fade = v; });
  bindRange(ui.vort, ui.vortVal, (v) => v.toFixed(1), (v) => { vortStrength = v; });
  bindRange(ui.brush, ui.brushVal, (v) => v | 0, (v) => { brushSize = v | 0; });
  bindRange(ui.force, ui.forceVal, (v) => (v | 0).toString(), (v) => { forceScale = v; });

  ui.palette.addEventListener('change', () => { palette = ui.palette.value; });
  ui.display.addEventListener('change', () => { displayMode = ui.display.value; });

  ui.playBtn.addEventListener('click', () => {
    running = !running;
    ui.playBtn.textContent = running ? 'Pause' : 'Play';
    ui.playBtn.classList.toggle('primary', running);
  });
  ui.resetBtn.addEventListener('click', reset);
  ui.splatBtn.addEventListener('click', () => randomSplats(8));
  ui.boundaryBtn.addEventListener('click', () => {
    walls = !walls;
    ui.boundaryBtn.textContent = `Walls: ${walls ? 'on' : 'off'}`;
  });

  ui.uiToggle.addEventListener('click', () => {
    document.body.classList.toggle('ui-open');
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { ui.playBtn.click(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') { reset(); }
    else if (e.key === 'u' || e.key === 'U') { ui.uiToggle.click(); }
    else if (e.key === 's' || e.key === 'S') { randomSplats(8); }
  });

  window.addEventListener('resize', resizeCanvas);

  // ── Boot ─────────────────────────────────────────────────────
  resizeCanvas();
  reset();
  // Seed with a few splats so there's something on screen immediately.
  randomSplats(5);
  requestAnimationFrame(frame);
})();
