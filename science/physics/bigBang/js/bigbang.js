/* ============================================================================
 * Big Bang & Cosmic Web
 * ----------------------------------------------------------------------------
 * A particle-mesh structure-formation toy. Matter is born at a hot singularity,
 * expands into a periodic (toroidal) universe, cools, and gravitationally
 * collapses into the filaments and clusters of the cosmic web.
 *
 * Gravity is approximated with a particle-mesh (PM) method:
 *   1. deposit particle mass onto a coarse grid (cloud-in-cell),
 *   2. smooth the density field (box-blur ≈ softened gravitational potential),
 *   3. accelerate each particle up the smoothed-density gradient (toward mass).
 * A drag term mimics the damping of peculiar velocities by cosmic expansion,
 * letting structure freeze out instead of bouncing apart.
 * ========================================================================== */
(() => {
  "use strict";

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });

  // ── Simulation state ──────────────────────────────────────────────────────
  const S = {
    // domain (device pixels)
    W: 0, H: 0, dpr: 1,
    // particles
    n: 9000,
    px: null, py: null, vx: null, vy: null, temp: null, dens: null,
    // gravity grid
    gx: 0, gy: 0, cell: 0,
    rho: null, fld: null, tmpA: null, tmpB: null, fx: null, fy: null,
    meanRho: 1,
    // params
    grav: 1.0, reach: 6, drag: 0.30, energy: 1.0, speed: 1.0,
    trail: 0.82, colorMode: "temp",
    // clock
    time: 0, paused: false,
    // pointer attractor
    pointerActive: false, pmx: 0, pmy: 0,
  };

  // ── Glow sprites (pre-rendered, tinted by palette) ─────────────────────────
  const SPRITE_N = 64, SPRITE_R = 14;
  let sprites = [];

  function buildSprites(mode) {
    sprites = [];
    for (let i = 0; i < SPRITE_N; i++) {
      const t = i / (SPRITE_N - 1);
      const [r, g, b] = paletteColor(mode, t);
      const c = document.createElement("canvas");
      c.width = c.height = SPRITE_R * 2;
      const cx = c.getContext("2d");
      const grad = cx.createRadialGradient(SPRITE_R, SPRITE_R, 0, SPRITE_R, SPRITE_R, SPRITE_R);
      grad.addColorStop(0.0, `rgba(${r},${g},${b},1)`);
      grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
      grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
      cx.fillStyle = grad;
      cx.fillRect(0, 0, c.width, c.height);
      sprites.push(c);
    }
  }

  // Palettes return [r,g,b] in 0..255 for t in [0,1].
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ramp(stops, t) {
    // stops: array of [pos, r, g, b]
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const u = (t - a[0]) / (b[0] - a[0] || 1);
        return [lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
      }
    }
    const l = stops[stops.length - 1];
    return [l[1], l[2], l[3]];
  }
  function paletteColor(mode, t) {
    if (mode === "density") {
      // void → filament → cluster core (deep blue → cyan → gold → white)
      return ramp([
        [0.00, 18, 22, 60],
        [0.35, 40, 90, 200],
        [0.60, 80, 220, 235],
        [0.82, 255, 214, 120],
        [1.00, 255, 255, 245],
      ], t).map(Math.round);
    }
    if (mode === "speed") {
      return ramp([
        [0.00, 30, 60, 160],
        [0.45, 120, 200, 255],
        [0.75, 180, 255, 210],
        [1.00, 255, 255, 255],
      ], t).map(Math.round);
    }
    // temperature (blackbody-ish): cool red → orange → white → blue-white
    return ramp([
      [0.00, 120, 24, 16],
      [0.28, 235, 92, 30],
      [0.52, 255, 180, 90],
      [0.74, 255, 246, 220],
      [0.90, 205, 226, 255],
      [1.00, 150, 196, 255],
    ], t).map(Math.round);
  }

  // ── Sizing ──────────────────────────────────────────────────────────────
  function resize() {
    S.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    S.W = Math.max(2, Math.floor(window.innerWidth * S.dpr));
    S.H = Math.max(2, Math.floor(window.innerHeight * S.dpr));
    canvas.width = S.W;
    canvas.height = S.H;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    rebuildGrid();
    // clear to space
    ctx.fillStyle = "#000308";
    ctx.fillRect(0, 0, S.W, S.H);
  }

  function rebuildGrid() {
    // ~ one cell per 14 CSS px, scaled by dpr; bounded for performance
    const target = 14 * S.dpr;
    S.gx = Math.max(24, Math.min(180, Math.round(S.W / target)));
    S.gy = Math.max(24, Math.min(180, Math.round(S.H / target)));
    const N = S.gx * S.gy;
    S.rho = new Float32Array(N);
    S.fld = new Float32Array(N);
    S.tmpA = new Float32Array(N);
    S.tmpB = new Float32Array(N);
    S.fx = new Float32Array(N);
    S.fy = new Float32Array(N);
    S.cellW = S.W / S.gx;
    S.cellH = S.H / S.gy;
  }

  // ── Big Bang: (re)seed all particles at the hot singularity ───────────────
  function bigBang(n) {
    if (n) S.n = n;
    const N = S.n;
    S.px = new Float32Array(N);
    S.py = new Float32Array(N);
    S.vx = new Float32Array(N);
    S.vy = new Float32Array(N);
    S.temp = new Float32Array(N);
    S.dens = new Float32Array(N);

    const cx = S.W * 0.5, cy = S.H * 0.5;
    // Initial blast speed scales with domain so it fills the box quickly.
    const base = Math.min(S.W, S.H) * 0.011 * S.energy;
    const seedR = Math.min(S.W, S.H) * 0.012;

    for (let i = 0; i < N; i++) {
      const ang = Math.random() * Math.PI * 2;
      // concentrate near the centre, with a soft radial falloff
      const r = seedR * Math.pow(Math.random(), 0.5);
      S.px[i] = cx + Math.cos(ang) * r;
      S.py[i] = cy + Math.sin(ang) * r;
      // outward Hubble-like flow + thermal scatter
      const spd = base * (0.55 + Math.random() * 0.9);
      const jitter = base * 0.45;
      S.vx[i] = Math.cos(ang) * spd + (Math.random() - 0.5) * jitter;
      S.vy[i] = Math.sin(ang) * spd + (Math.random() - 0.5) * jitter;
      S.temp[i] = 1.0;
    }
    S.time = 0;
    // wipe the screen so old trails don't linger through the flash
    ctx.fillStyle = "#000308";
    ctx.fillRect(0, 0, S.W, S.H);
  }

  // ── Gravity (particle-mesh) ───────────────────────────────────────────────
  function wrapIdx(i, m) { return i < 0 ? i + m : (i >= m ? i - m : i); }

  function computeGravity() {
    const { gx, gy, rho } = S;
    const N = gx * gy;
    rho.fill(0);

    // Cloud-in-cell deposit (periodic).
    const n = S.n;
    for (let i = 0; i < n; i++) {
      let cx = S.px[i] / S.cellW - 0.5;
      let cy = S.py[i] / S.cellH - 0.5;
      let x0 = Math.floor(cx), y0 = Math.floor(cy);
      const tx = cx - x0, ty = cy - y0;
      const xa = wrapIdx(x0, gx), xb = wrapIdx(x0 + 1, gx);
      const ya = wrapIdx(y0, gy), yb = wrapIdx(y0 + 1, gy);
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty, w11 = tx * ty;
      rho[ya * gx + xa] += w00;
      rho[ya * gx + xb] += w10;
      rho[yb * gx + xa] += w01;
      rho[yb * gx + xb] += w11;
    }
    S.meanRho = n / N;

    // Smooth density → softened potential proxy. More passes = longer reach.
    S.fld.set(rho);
    const passes = S.reach | 0;
    for (let p = 0; p < passes; p++) {
      boxBlurH(S.fld, S.tmpA, gx, gy);
      boxBlurV(S.tmpA, S.fld, gx, gy);
    }

    // Gradient of the smoothed field (central differences, periodic).
    const fld = S.fld, fx = S.fx, fy = S.fy;
    for (let y = 0; y < gy; y++) {
      const yp = wrapIdx(y + 1, gy) * gx;
      const ym = wrapIdx(y - 1, gy) * gx;
      const yr = y * gx;
      for (let x = 0; x < gx; x++) {
        const xp = wrapIdx(x + 1, gx);
        const xm = wrapIdx(x - 1, gx);
        fx[yr + x] = (fld[yr + xp] - fld[yr + xm]) * 0.5;
        fy[yr + x] = (fld[yp + x] - fld[ym + x]) * 0.5;
      }
    }
  }

  function boxBlurH(src, dst, w, h) {
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 0; x < w; x++) {
        const a = src[r + wrapIdx(x - 1, w)];
        const b = src[r + x];
        const c = src[r + wrapIdx(x + 1, w)];
        dst[r + x] = (a + b + c) * (1 / 3);
      }
    }
  }
  function boxBlurV(src, dst, w, h) {
    for (let y = 0; y < h; y++) {
      const ym = wrapIdx(y - 1, h) * w;
      const yp = wrapIdx(y + 1, h) * w;
      const yr = y * w;
      for (let x = 0; x < w; x++) {
        dst[yr + x] = (src[ym + x] + src[yr + x] + src[yp + x]) * (1 / 3);
      }
    }
  }

  // Bilinear sample of a grid field at pixel position (periodic).
  function sample(field, px, py) {
    const { gx, gy } = S;
    let cx = px / S.cellW - 0.5;
    let cy = py / S.cellH - 0.5;
    let x0 = Math.floor(cx), y0 = Math.floor(cy);
    const tx = cx - x0, ty = cy - y0;
    const xa = wrapIdx(x0, gx), xb = wrapIdx(x0 + 1, gx);
    const ya = wrapIdx(y0, gy), yb = wrapIdx(y0 + 1, gy);
    const v00 = field[ya * gx + xa], v10 = field[ya * gx + xb];
    const v01 = field[yb * gx + xa], v11 = field[yb * gx + xb];
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty)
         + v01 * (1 - tx) * ty + v11 * tx * ty;
  }

  // ── Physics step ──────────────────────────────────────────────────────────
  function step(dt) {
    computeGravity();

    const n = S.n, W = S.W, H = S.H;
    // Force normalised by mean density so behaviour is count-independent.
    // Scaled by domain so reach in pixels feels consistent across screens.
    const gNorm = S.grav * (Math.min(W, H) * 0.9) / (S.meanRho + 1e-3);
    const aMax = Math.min(W, H) * 0.06; // accel clamp (stability)
    const dragF = Math.max(0, 1 - S.drag * dt);

    // pointer attractor params
    const pull = S.pointerActive ? Math.min(W, H) * 0.9 * S.grav * 1.6 : 0;
    const pmx = S.pmx, pmy = S.pmy;
    const pSoft = Math.min(W, H) * 0.06;
    const pR2 = (Math.min(W, H) * 0.22) ** 2;

    let tempSum = 0;

    for (let i = 0; i < n; i++) {
      const px = S.px[i], py = S.py[i];

      // gravity from the smoothed-density gradient (uphill = toward mass)
      let ax = sample(S.fx, px, py) * gNorm;
      let ay = sample(S.fy, px, py) * gNorm;

      // optional pointer attractor
      if (pull > 0) {
        let dx = pmx - px, dy = pmy - py;
        // shortest wrapped distance
        if (dx > W * 0.5) dx -= W; else if (dx < -W * 0.5) dx += W;
        if (dy > H * 0.5) dy -= H; else if (dy < -H * 0.5) dy += H;
        const d2 = dx * dx + dy * dy;
        if (d2 < pR2) {
          const inv = 1 / (d2 + pSoft * pSoft);
          ax += dx * inv * pull;
          ay += dy * inv * pull;
        }
      }

      // clamp acceleration
      const am = Math.hypot(ax, ay);
      if (am > aMax) { const s = aMax / am; ax *= s; ay *= s; }

      let vx = (S.vx[i] + ax * dt) * dragF;
      let vy = (S.vy[i] + ay * dt) * dragF;
      S.vx[i] = vx; S.vy[i] = vy;

      // integrate + wrap (toroidal universe)
      let nx = px + vx * dt, ny = py + vy * dt;
      if (nx < 0) nx += W; else if (nx >= W) nx -= W;
      if (ny < 0) ny += H; else if (ny >= H) ny -= H;
      S.px[i] = nx; S.py[i] = ny;

      // local density (for colour + gravitational heating)
      const d = sample(S.rho, nx, ny) / (S.meanRho + 1e-3); // ~1 = average
      S.dens[i] = d;

      // temperature: expansion cools it, compression in clusters reheats cores
      const heat = Math.max(0, d - 1.0) * 0.10;
      let temp = S.temp[i];
      temp += (-0.45 * temp + heat) * dt;
      if (temp < 0) temp = 0; else if (temp > 1.25) temp = 1.25;
      S.temp[i] = temp;
      tempSum += temp;
    }

    S.meanTemp = tempSum / n;
    S.time += dt;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function render() {
    // motion-blur fade for trails
    const fade = 1 - S.trail;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0, 3, 8, ${Math.max(0.04, fade)})`;
    ctx.fillRect(0, 0, S.W, S.H);

    // additive glow
    ctx.globalCompositeOperation = "lighter";
    const n = S.n, mode = S.colorMode;
    const half = SPRITE_R;
    // particle draw size: a touch larger early (hot plasma) shrinking as it cools
    const youth = Math.max(0, 1 - S.time * 0.25);
    const size = (SPRITE_R * (0.85 + youth * 0.9)) * S.dpr * 0.42;

    for (let i = 0; i < n; i++) {
      let v;
      if (mode === "density") {
        v = Math.min(1, S.dens[i] * 0.32);
      } else if (mode === "speed") {
        const sp = Math.hypot(S.vx[i], S.vy[i]);
        v = Math.min(1, sp / (Math.min(S.W, S.H) * 0.02 + 1e-3));
      } else { // temp
        v = Math.min(1, S.temp[i]);
      }
      let idx = (v * (SPRITE_N - 1)) | 0;
      if (idx < 0) idx = 0; else if (idx >= SPRITE_N) idx = SPRITE_N - 1;
      // brighten dense cores a touch regardless of mode
      const alpha = 0.30 + 0.55 * Math.min(1, S.dens[i] * 0.25 + v * 0.5);
      ctx.globalAlpha = alpha;
      const s = sprites[idx];
      ctx.drawImage(s, S.px[i] - size, S.py[i] - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Big Bang flash: brilliant central burst that fades over the first moment
    if (S.time < 1.6) {
      const f = Math.max(0, 1 - S.time / 1.6);
      const cx = S.W * 0.5, cy = S.H * 0.5;
      const R = Math.max(S.W, S.H) * (0.12 + (1 - f) * 0.7);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, `rgba(255,255,255,${0.85 * f})`);
      g.addColorStop(0.25, `rgba(210,228,255,${0.5 * f})`);
      g.addColorStop(1, "rgba(120,160,255,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S.W, S.H);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // ── Epoch / cosmic-time narration ─────────────────────────────────────────
  function epochInfo(t) {
    if (t < 0.25) return { name: "Singularity", time: "t = 0" };
    if (t < 1.6)  return { name: "The Big Bang", time: "first light" };
    if (t < 5)    return { name: "Inflation & Expansion", time: "matter streams outward" };
    if (t < 14)   return { name: "Recombination — it cools", time: "gravity awakens" };
    if (t < 32)   return { name: "Gravitational Collapse", time: "ripples grow" };
    return { name: "The Cosmic Web", time: "filaments & clusters" };
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  let last = performance.now();
  let fpsEMA = 60;
  function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsEMA = fpsEMA * 0.9 + (1 / Math.max(1e-3, real)) * 0.1;

    if (!S.paused) {
      // fixed-ish step scaled by the time-flow control
      const dt = 0.7 * S.speed;
      step(dt);
    }
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  const el = (id) => document.getElementById(id);
  const epochName = el("epochName"), epochTime = el("epochTime"), epochBox = el("epoch");
  const statEpoch = el("statEpoch"), statTime = el("statTime"),
        statCount = el("statCount"), statTemp = el("statTemp"), statFps = el("statFps");

  let hudTick = 0;
  function updateHUD() {
    if (hudTick++ % 6) return; // throttle DOM writes
    const info = epochInfo(S.time);
    epochName.textContent = info.name;
    epochTime.textContent = info.time;
    epochBox.style.opacity = S.time > 60 ? "0.35" : "1";
    statEpoch.textContent = info.name;
    statTime.textContent = S.time.toFixed(1);
    statCount.textContent = S.n.toLocaleString();
    statTemp.textContent = (S.meanTemp || 0).toFixed(2);
    statFps.textContent = Math.round(fpsEMA);
  }

  // ── Controls ────────────────────────────────────────────────────────────
  function bindSlider(id, valId, apply, fmt) {
    const input = el(id), out = el(valId);
    const set = () => {
      const v = parseFloat(input.value);
      apply(v);
      out.textContent = fmt ? fmt(v) : v;
    };
    input.addEventListener("input", set);
    set();
  }

  bindSlider("count", "countVal", (v) => { S.pendingCount = v; }, (v) => v.toLocaleString());
  // count only takes effect on Big Bang; reflect immediately and rebang
  el("count").addEventListener("change", () => bigBang(S.pendingCount));

  bindSlider("grav", "gravVal", (v) => { S.grav = v; }, (v) => v.toFixed(2));
  bindSlider("reach", "reachVal", (v) => { S.reach = v; });
  bindSlider("drag", "dragVal", (v) => { S.drag = v; }, (v) => v.toFixed(2));
  bindSlider("energy", "energyVal", (v) => { S.energy = v; }, (v) => v.toFixed(2));
  bindSlider("speed", "speedVal", (v) => { S.speed = v; }, (v) => v.toFixed(2));
  bindSlider("trail", "trailVal", (v) => { S.trail = v; }, (v) => v.toFixed(2));

  // color-by segmented control
  el("colorSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-color]");
    if (!btn) return;
    el("colorSeg").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    S.colorMode = btn.dataset.color;
    buildSprites(S.colorMode);
  });

  // buttons
  const playBtn = el("playBtn");
  function setPaused(p) { S.paused = p; playBtn.textContent = p ? "Play" : "Pause"; }
  playBtn.addEventListener("click", () => setPaused(!S.paused));
  el("bangBtn").addEventListener("click", () => { bigBang(S.pendingCount || S.n); setPaused(false); });

  // UI toggle
  const uiToggle = el("uiToggle");
  uiToggle.addEventListener("click", () => document.body.classList.toggle("ui-open"));

  // keyboard
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); setPaused(!S.paused); }
    else if (k === "b") { bigBang(S.pendingCount || S.n); setPaused(false); }
    else if (k === "u") { document.body.classList.toggle("ui-open"); }
  });

  // pointer: tug matter into a cluster
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    S.pmx = cx * S.dpr; S.pmy = cy * S.dpr;
  }
  canvas.addEventListener("pointerdown", (e) => {
    S.pointerActive = true; pointerPos(e); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => { if (S.pointerActive) pointerPos(e); });
  const endPtr = () => { S.pointerActive = false; };
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);

  // resize (re-seed only if the domain wasn't initialised yet)
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { resize(); }, 150);
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  S.pendingCount = S.n;
  buildSprites(S.colorMode);
  resize();
  bigBang(S.n);
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
