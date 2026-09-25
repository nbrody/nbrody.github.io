// ═══════════════════════════════════════════════════════════════════
//  Ice Wall — controls, scenes, animation clock
//
//  `target` holds what the panel says; `cur` eases toward it every frame
//  (slowly during scene changes), so scenes, the tour and remote edits
//  all glide instead of cutting. Palettes cross-fade the same way.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const LOOK = window.IceWallLook;
  const $ = (id) => document.getElementById(id);
  const url = new URLSearchParams(location.search);
  const embedded = url.has('embedded');          // set by the Graphics Studio stage
  const TAU = Math.PI * 2;

  const canvas = $('glCanvas');
  const status = $('status');

  function showStatus(text, error = false) {
    if (!status.isConnected) document.body.append(status);
    status.classList.remove('gone');
    status.classList.toggle('error', error);
    status.textContent = text;
  }

  // ─── state ───
  const DISPLAY = { led: false, ledDensity: 100, grain: 0.35, quality: 'auto' };
  const target = { ...LOOK.BASE, ...DISPLAY };
  const NUMERIC = Object.keys(target).filter((k) => typeof target[k] === 'number');
  const cur = Object.fromEntries(NUMERIC.map((k) => [k, target[k]]));
  cur.waterAmt = target.water ? 1 : 0;
  cur.starsAmt = target.stars ? 1 : 0;
  cur.sweepAmt = target.lightSweep ? 1 : 0;
  cur.patternGate = 1;                 // fracture fades out and back in when the block pattern changes
  let shownPattern = target.pattern;
  const NOT_LOOK = new Set(Object.keys(DISPLAY));

  let sceneId = 'linq';
  let paused = false;
  let tour = false;
  let tourClock = 0;
  let glide = 0;               // seconds of slow easing left (after a scene change)
  let dirty = true;

  // animation phases (kept bounded; see uniforms())
  const phase = { flow: 0, drift: 0, water: 0, width: 0, sweep: 0, glint: 0, time: 0 };

  // ─── palette cross-fade ───
  let rampTo = LOOK.buildRamp(target.palette, target.hue);
  let rampFrom = rampTo;
  let rampCur = rampTo.slice();
  let rampMix = 1;
  let rampHue = target.hue;
  let rampPalette = target.palette;
  let waterTo = LOOK.waterTint(target.palette, target.hue), waterFrom = waterTo, waterCur = waterTo.slice();
  let rampDirty = true;

  // ─── renderer ───
  let renderer;
  try {
    renderer = new window.IceWallRenderer(canvas, { noFloat: url.has('nofloat') });
  } catch (err) {
    fail(err);
    return;
  }

  function fail(err) {
    console.error(err);
    showStatus(String(err.message || err).split('\n')[0], true);
  }

  // ─── controls ───
  const FORMAT = {
    pct: (v) => `${Math.round(v * 100)}%`,
    deg: (v) => `${Math.round(v)}°`,
    sdeg: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}°`,
    x: (v) => `${v.toFixed(2)}×`,
    f1: (v) => v.toFixed(1),
    f2: (v) => v.toFixed(2),
    f3: (v) => v.toFixed(3),
    int: (v) => `${Math.round(v)}`,
  };
  const inputs = [...document.querySelectorAll('[data-key]')];
  const byKey = Object.fromEntries(inputs.map((el) => [el.dataset.key, el]));

  // options generated from the look tables
  const sceneSelect = $('sceneSelect');
  for (const s of LOOK.SCENES) sceneSelect.add(new Option(s.name, s.id));
  sceneSelect.add(new Option('Custom', 'custom'));
  const paletteSelect = $('paletteSelect');
  for (const [id, p] of Object.entries(LOOK.PALETTES)) paletteSelect.add(new Option(p.name, id));

  const swatches = $('swatches');
  for (const [id, p] of Object.entries(LOOK.PALETTES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.palette = id;
    b.title = p.name;
    b.setAttribute('aria-label', `${p.name} palette`);
    b.style.background = LOOK.cssGradient(id);
    b.addEventListener('click', () => {
      paletteSelect.value = id;
      paletteSelect.dispatchEvent(new Event('input', { bubbles: true }));
      paletteSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    swatches.append(b);
  }

  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return parseFloat(el.value);
    return el.value;
  }

  function paintInput(el) {
    const key = el.dataset.key;
    const v = target[key];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (String(el.value) !== String(v)) el.value = v;
    if (el.type === 'range') {
      const out = el.closest('.field')?.querySelector('output');
      if (out) out.textContent = (FORMAT[el.dataset.fmt] || FORMAT.f2)(parseFloat(el.value));
      const lo = parseFloat(el.min), hi = parseFloat(el.max);
      el.style.setProperty('--fill', `${((parseFloat(el.value) - lo) / (hi - lo)) * 100}%`);
    }
  }

  function paintAll() {
    inputs.forEach(paintInput);
    sceneSelect.value = sceneId;
    for (const b of swatches.children) b.classList.toggle('active', b.dataset.palette === target.palette);
    $('ledDensityGroup').classList.toggle('dim', !target.led);
  }

  function setScene(id) {
    sceneId = id;
    sceneSelect.value = id;
  }

  function onInput(e) {
    const el = e.target;
    const key = el.dataset.key;
    if (!key) return;
    const v = readInput(el);
    if (typeof target[key] === 'number' && !Number.isFinite(v)) return;
    target[key] = v;
    paintInput(el);
    if (key === 'palette') for (const b of swatches.children) b.classList.toggle('active', b.dataset.palette === v);
    if (key === 'led') $('ledDensityGroup').classList.toggle('dim', !v);
    if (key === 'quality') resize();
    if (!NOT_LOOK.has(key) && sceneId !== 'custom') setScene('custom');
    glide = 0;                         // a hand on the controls takes over from any scene glide
    dirty = true;
  }
  for (const el of inputs) {
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
  }

  sceneSelect.addEventListener('change', () => {
    if (sceneSelect.value !== 'custom') applyScene(sceneSelect.value);
  });
  $('tourToggle').addEventListener('change', (e) => {
    tour = e.target.checked;
    tourClock = 0;
  });

  // ─── scenes ───
  function applyScene(id, { instant = false } = {}) {
    const scene = LOOK.SCENES.find((s) => s.id === id);
    if (!scene) return;
    Object.assign(target, LOOK.BASE, scene.params);
    setScene(id);
    paintAll();
    glide = instant ? 0 : 3.5;
    if (instant) snapToTarget();
    tourClock = 0;
    dirty = true;
  }

  function nextScene(step = 1) {
    const list = LOOK.SCENES;
    const i = list.findIndex((s) => s.id === sceneId);
    applyScene(list[(i + step + list.length) % list.length].id);
  }

  function surprise() {
    const r = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const blocks = Math.random() < 0.35;
    const bricks = blocks && Math.random() < 0.3;
    Object.assign(target, LOOK.BASE, {
      palette: pick(Object.keys(LOOK.PALETTES)),
      hue: Math.random() < 0.3 ? Math.round(r(-35, 35)) : 0,
      exposure: r(0.95, 1.1),
      frost: r(0.3, 1), clump: r(0.75, 1.45), relief: r(0.8, 1.45), macro: r(0.5, 1.5),
      fracture: blocks ? r(0.6, 1) : r(0, 0.35), blockDensity: r(3.5, 9), crack: r(0.035, 0.09),
      jitter: blocks && Math.random() < 0.4 ? r(0, 0.3) : r(0.7, 1), cellTint: r(0.1, 0.55),
      pattern: bricks ? 'bricks' : 'floes', joint: bricks || (blocks && Math.random() < 0.25) ? r(0.6, 1) : 0,
      speed: r(0.25, 0.8), warp: r(0.6, 1.8), drift: r(0.15, 0.6),
      lightAngle: Math.round(r(0, 360)), lightHeight: Math.round(r(18, 50)),
      sparkle: r(0.3, 1.3), bloom: r(0.3, 0.9),
      water: Math.random() < 0.6, waterX: r(0.2, 0.8), waterWidth: r(0.04, 0.13),
      waterSpeed: r(2, 5), meander: r(0.2, 1),
    });
    setScene('custom');
    paintAll();
    glide = 2.5;
    dirty = true;
  }

  function snapToTarget() {
    for (const k of NUMERIC) cur[k] = target[k];
    cur.waterAmt = target.water ? 1 : 0;
    cur.starsAmt = target.stars ? 1 : 0;
    cur.sweepAmt = target.lightSweep ? 1 : 0;
    cur.patternGate = 1;
    shownPattern = target.pattern;
    rampPalette = target.palette;
    rampHue = cur.hue;
    rampTo = LOOK.buildRamp(target.palette, cur.hue);
    rampCur = rampTo.slice();
    rampMix = 1;
    waterTo = LOOK.waterTint(target.palette, cur.hue);
    waterCur = waterTo.slice();
    rampDirty = true;
  }

  // ─── pause / panel / snapshot ───
  const pauseBtn = $('pauseBtn');
  function setPaused(p) {
    paused = p;
    pauseBtn.textContent = paused ? 'Play' : 'Pause';
    pauseBtn.classList.toggle('on', paused);
    dirty = true;
  }
  pauseBtn.addEventListener('click', () => setPaused(!paused));

  function setPanel(show) {
    $('controls').classList.toggle('hidden', !show);
    document.body.classList.toggle('panel-hidden', !show);
  }
  $('hidePanel').addEventListener('click', () => setPanel(false));
  $('showPanel').addEventListener('click', () => setPanel(true));
  if (embedded) document.body.classList.add('embedded');

  function snapshot() {
    draw();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `ice-wall-${sceneId}-${stamp}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }
  $('screenshotBtn').addEventListener('click', snapshot);
  $('randomBtn').addEventListener('click', surprise);

  // ─── pointer: place the meltwater ───
  let dragging = false;
  function placeWater(e) {
    const rect = canvas.getBoundingClientRect();
    target.waterX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (!target.water) target.water = true;
    paintInput(byKey.waterX);
    paintInput(byKey.water);
    if (sceneId !== 'custom') setScene('custom');
    glide = 0;
    dirty = true;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    placeWater(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (dragging) placeWater(e); });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ─── keyboard ───
  function toggleKey(key) {
    target[key] = !target[key];
    paintInput(byKey[key]);
    if (key === 'led') $('ledDensityGroup').classList.toggle('dim', !target.led);
    if (!NOT_LOOK.has(key) && sceneId !== 'custom') setScene('custom');
    glide = 0;
    dirty = true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text')) return;
    switch (e.key.toLowerCase()) {
      case 'h': setPanel($('controls').classList.contains('hidden')); break;
      case ' ': e.preventDefault(); setPaused(!paused); break;
      case 'n': nextScene(e.shiftKey ? -1 : 1); break;
      case 'w': toggleKey('water'); break;
      case 'l': toggleKey('led'); break;
      case 'r': surprise(); break;
      default: return;
    }
  });

  // ─── sizing & adaptive quality ───
  const MAX_AUTO_PIXELS = 2.4e6;
  const size = { cw: 0, ch: 0, rw: 0, rh: 0 };
  let autoScale = 1, autoCeil = 1, autoMax = 1;
  const perf = { acc: 0, n: 0, lastDrop: -1e9 };

  function renderScale() {
    switch (target.quality) {
      case 'high': return 1;
      case 'balanced': return 0.7;
      case 'fast': return 0.5;
      default: return autoScale;
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, canvas.clientWidth || window.innerWidth);
    const cssH = Math.max(1, canvas.clientHeight || window.innerHeight);
    size.cw = Math.max(1, Math.round(cssW * dpr));
    size.ch = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== size.cw || canvas.height !== size.ch) {
      canvas.width = size.cw;
      canvas.height = size.ch;
    }
    autoMax = Math.min(1, Math.sqrt(MAX_AUTO_PIXELS / (size.cw * size.ch)));
    autoScale = Math.min(autoScale, autoMax, autoCeil);
    if (autoScale < 0.4) autoScale = Math.min(autoMax, 0.4);
    const s = renderScale();
    size.rw = Math.max(8, Math.round(size.cw * s));
    size.rh = Math.max(8, Math.round(size.ch * s));
    $('resolution').textContent = `${size.rw}×${size.rh}`;
    dirty = true;
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  function adapt(dt, now) {
    if (target.quality !== 'auto' || paused) return;
    perf.acc += dt; perf.n++;
    if (perf.acc < 1.5) return;
    const ms = (perf.acc / perf.n) * 1000;
    perf.acc = 0; perf.n = 0;
    if (ms > 26 && autoScale > 0.4) {
      autoCeil = autoScale;
      autoScale = Math.max(0.4, autoScale * 0.85);
      perf.lastDrop = now;
      resize();
    } else if (ms < 17.5 && autoScale < Math.min(autoMax, autoCeil * 0.95) && now - perf.lastDrop > 8000) {
      autoScale = Math.min(autoMax, autoCeil * 0.95, autoScale * 1.08);
      resize();
    }
  }

  // ─── per-frame easing ───
  const ease = (x) => x * x * (3 - 2 * x);
  function advance(dt) {
    const tau = glide > 0 ? 1.2 : 0.12;
    glide = Math.max(0, glide - dt);
    const k = 1 - Math.exp(-dt / tau);
    let moving = false;
    for (const key of NUMERIC) {
      const d = target[key] - cur[key];
      if (Math.abs(d) > 1e-4 * (1 + Math.abs(target[key]))) { cur[key] += d * k; moving = true; }
      else cur[key] = target[key];
    }
    const kb = 1 - Math.exp(-dt / (glide > 0 ? 1.0 : 0.35));
    for (const [amt, key] of [['waterAmt', 'water'], ['starsAmt', 'stars'], ['sweepAmt', 'lightSweep']]) {
      const goal = target[key] ? 1 : 0;
      const d = goal - cur[amt];
      if (Math.abs(d) > 1e-3) { cur[amt] += d * kb; moving = true; } else cur[amt] = goal;
    }

    const gateGoal = shownPattern === target.pattern ? 1 : 0;
    if (Math.abs(gateGoal - cur.patternGate) > 1e-3) {
      cur.patternGate += (gateGoal - cur.patternGate) * (1 - Math.exp(-dt / 0.22));
      if (!gateGoal && cur.patternGate < 0.02) shownPattern = target.pattern;
      moving = true;
    } else cur.patternGate = gateGoal;

    // palette: cross-fade on change, rebuild as the hue eases
    if (target.palette !== rampPalette) {
      rampFrom = rampCur.slice();
      waterFrom = waterCur.slice();
      rampPalette = target.palette;
      rampHue = cur.hue;
      rampTo = LOOK.buildRamp(rampPalette, rampHue);
      waterTo = LOOK.waterTint(rampPalette, rampHue);
      rampMix = 0;
      accentDirty = true;
    } else if (Math.abs(cur.hue - rampHue) > 0.05) {
      rampHue = cur.hue;
      rampTo = LOOK.buildRamp(rampPalette, rampHue);
      waterTo = LOOK.waterTint(rampPalette, rampHue);
      if (rampMix >= 1) { rampCur = rampTo.slice(); waterCur = waterTo.slice(); rampDirty = true; }
      accentDirty = true;
    }
    if (rampMix < 1) {
      rampMix = Math.min(1, rampMix + dt / (glide > 0 ? 2.8 : 0.9));
      const m = ease(rampMix);
      for (let i = 0; i < rampCur.length; i++) rampCur[i] = rampFrom[i] + (rampTo[i] - rampFrom[i]) * m;
      for (let i = 0; i < 3; i++) waterCur[i] = waterFrom[i] + (waterTo[i] - waterFrom[i]) * m;
      rampDirty = true;
    }
    if (rampDirty) moving = true;

    if (!paused) {
      phase.flow += dt * cur.speed * 0.1;
      phase.drift += dt * cur.drift * 0.02;
      phase.water += dt * cur.waterSpeed * 0.9;
      phase.width += dt * 0.05;
      phase.sweep += dt * TAU / 48;
      phase.glint = (phase.glint + dt) % (TAU * 1000);
      phase.time = (phase.time + dt) % (TAU * 1000);
      if (phase.water > 1e5) phase.water -= 1e5;
      if (tour) {
        tourClock += dt;
        if (tourClock > 30) nextScene();
      }
    }
    return moving;
  }

  // ─── uniforms ───
  const circle = (t, r, a) => [r * Math.cos(t / r + a), r * Math.sin(t / r + a)];
  function uniforms() {
    const span = 1 / cur.scale;
    const aspect = size.cw / size.ch;
    const R = 30;
    const center = [R * Math.sin(phase.drift / R), R * Math.sin((0.71 * phase.drift) / R + 1.3)];
    const f = phase.flow;
    const sweep = cur.sweepAmt * Math.sin(phase.sweep);
    const az = ((cur.lightAngle + 24 * sweep) * Math.PI) / 180;
    const el = ((cur.lightHeight + 5 * cur.sweepAmt * Math.sin(phase.sweep * 0.71 + 1)) * Math.PI) / 180;
    const light = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
    const texel = span / size.rh;
    const reach = 0.25 * Math.max(1, cur.relief);
    const grow = Math.max(1.12, Math.pow(reach / (1.25 * texel), 1 / 17));
    const top = LOOK.sampleRamp(rampCur, 0.97);
    const glint = top.map((v) => 0.5 * v + 0.5);
    return {
      renderW: size.rw, renderH: size.rh, canvasW: size.cw, canvasH: size.ch,
      uView: [center[0], center[1], span * aspect, span],
      uPhaseA: [...circle(f, 60, 0), ...circle(f * 0.8, 47, 1.3)],
      uPhaseB: [...circle(f * 1.2, 53, 2.1), ...circle(f * 0.9, 44, 4.2)],
      uTime: phase.time,
      uWarp: cur.warp,
      uMacro: cur.macro,
      uFrost: cur.frost,
      uFrostRelief: 0.42,
      uClump: cur.clump,
      uFracture: cur.fracture * cur.patternGate,
      uBlockDensity: cur.blockDensity,
      uCrack: cur.crack,
      uJitter: cur.jitter,
      uJoint: cur.joint,
      uPattern: shownPattern === 'bricks' ? 1 : 0,
      uLight: light,
      uBump: cur.relief,
      uShadow: cur.shadow,
      uShadowGrow: grow,
      uAO: 1.0,
      uSparkle: cur.sparkle,
      uExposure: cur.exposure,
      uCellTint: cur.cellTint,
      uGrainAmt: 0.22,
      uGlintTime: phase.glint,
      uGlintColor: glint,
      uSSSColor: LOOK.sampleRamp(rampCur, 0.6).map((v) => v * 0.9),
      uGlowColor: LOOK.sampleRamp(rampCur, 0.42).map((v) => v * 1.3),
      uSkyColor: LOOK.sampleRamp(rampCur, 0.86),
      uWaterTint: waterCur,
      uWaterA: [cur.waterX, cur.waterWidth, cur.waterAmt, cur.meander],
      uWaterB: [phase.water, phase.width],
      uBloomThresh: 0.78,
      uScale: size.rh / size.ch,
      uBloom: cur.bloom,
      uStars: cur.starsAmt,
      uStarColor: glint,
      uLed: target.led ? 1 : 0,
      uLedRows: cur.ledDensity,
      uGrain: cur.grain * 0.035,
      uVignette: 0.28,
      uFrame: frameNo,
    };
  }

  // ─── UI accent follows the palette ───
  let accentClock = 0;
  let accentDirty = false;
  function paintAccent() {
    accentDirty = false;
    const root = document.documentElement.style;
    root.setProperty('--accent', LOOK.linearToHex(LOOK.sampleRamp(rampTo, 0.62)));
    root.setProperty('--accent-strong', LOOK.linearToHex(LOOK.sampleRamp(rampTo, 0.42)));
    root.setProperty('--accent-soft', LOOK.linearToHex(LOOK.sampleRamp(rampTo, 0.86)));
  }

  // ─── frame loop ───
  let frameNo = 0;
  let last = performance.now();
  let fps = { frames: 0, clock: 0 };
  let first = true;
  let lost = false;

  function draw() {
    if (rampDirty) { renderer.setRamp(rampCur); rampDirty = false; }
    renderer.render(uniforms());
    frameNo++;
    dirty = false;
    if (first) {
      first = false;
      status.classList.add('gone');
      setTimeout(() => status.remove(), 800);
    }
  }

  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, raw);
    last = now;
    const moving = advance(dt);
    if (!lost && (!paused || moving || dirty)) {
      try { draw(); } catch (err) { fail(err); return; }
      fps.frames++;
    }
    fps.clock += dt;
    if (fps.clock > 0.5) {
      $('fpsCounter').textContent = paused && !moving ? 'paused' : `${Math.round(fps.frames / fps.clock)} fps`;
      fps.frames = 0; fps.clock = 0;
    }
    // a hidden page's frames are throttled, not slow: don't let them lower the quality
    if (!document.hidden && raw < 0.5) adapt(raw, now);
    accentClock += dt;
    if (accentClock > 0.25 && accentDirty) { accentClock = 0; paintAccent(); }
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    showStatus('Graphics context lost…');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    try {
      renderer = new window.IceWallRenderer(canvas, { noFloat: url.has('nofloat') });
      rampDirty = true;
      dirty = true;
      first = true;
    } catch (err) { fail(err); }
  });

  // ─── boot ───
  const startScene = url.get('scene');
  applyScene(LOOK.SCENES.some((s) => s.id === startScene) ? startScene : 'linq', { instant: true });
  paintAccent();
  resize();
  if (!embedded) setTimeout(() => $('instructions').classList.add('faded'), 9000);
  if (!embedded && window.innerWidth > 0 && window.innerWidth <= 640) setPanel(false);   // phones: art first
  requestAnimationFrame(frame);

  // for tests, thumbnails and the console
  window.iceWall = {
    target, cur, phase, renderer: () => renderer,
    applyScene, nextScene, surprise, setPaused, snapshot,
    /** Advance the clock by `seconds` in fixed steps and draw (for frozen-rAF environments). */
    step(seconds = 1 / 60, steps = 1) {
      for (let i = 0; i < steps; i++) advance(seconds / steps);
      draw();
    },
    draw,
  };
})();
