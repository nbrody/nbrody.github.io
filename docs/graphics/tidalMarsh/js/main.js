import { MarshSim } from './simulation.js';
import { makeSlider, buildPresetButtons, PRESETS } from './ui.js';

const SIM_RES = 256;

// Off-screen buffer at simulation resolution; we draw into the visible canvas
// scaled up with image-smoothing disabled for crisp pixel-perfect render.
const offCanvas = document.createElement('canvas');
offCanvas.width = SIM_RES;
offCanvas.height = SIM_RES;
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const meta  = document.getElementById('metaReadout');
const hint  = document.getElementById('hintOverlay');

const sim = new MarshSim(SIM_RES, SIM_RES);

// ---- Sizing (the visible canvas fills the stage) ----
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
}
resize();
new ResizeObserver(resize).observe(stage);

function blit() {
    sim.render(offCtx);
    // Fit the SIM_RES square inside the canvas, centred, preserving aspect.
    const cw = canvas.width, ch = canvas.height;
    const side = Math.min(cw, ch);
    const ox = (cw - side) * 0.5, oy = (ch - side) * 0.5;
    ctx.fillStyle = '#0c0a07';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(offCanvas, ox, oy, side, side);
}

// ---- Sliders ----
const physHost = document.getElementById('physSliders');
makeSlider(physHost, {
    name: 'K', sub: 'erode', min: 0.02, max: 0.6, step: 0.005,
    value: sim.params.K, format: v => v.toFixed(3),
    onChange: v => sim.setParam('K', v),
});
makeSlider(physHost, {
    name: 'm', sub: 'A^m', min: 0.30, max: 0.90, step: 0.01,
    value: sim.params.m, format: v => v.toFixed(2),
    onChange: v => sim.setParam('m', v),
});
makeSlider(physHost, {
    name: 'n', sub: 'S^n', min: 0.5, max: 2.0, step: 0.05,
    value: sim.params.n, format: v => v.toFixed(2),
    onChange: v => sim.setParam('n', v),
});

const slopeHost = document.getElementById('slopeSliders');
makeSlider(slopeHost, {
    name: 'D', sub: 'creep', min: 0.0, max: 0.6, step: 0.01,
    value: sim.params.D, format: v => v.toFixed(2),
    onChange: v => sim.setParam('D', v),
});
makeSlider(slopeHost, {
    name: 'U', sub: 'supply', min: 0.0, max: 0.005, step: 0.0001,
    value: sim.params.U, format: v => v.toFixed(4),
    onChange: v => sim.setParam('U', v),
});
const slSlider = makeSlider(slopeHost, {
    name: 'sea', min: -0.30, max: 0.40, step: 0.01,
    value: sim.params.seaLevel, format: v => v.toFixed(2),
    onChange: v => sim.setParam('seaLevel', v),
});

const integHost = document.getElementById('integSliders');
makeSlider(integHost, {
    name: 'Δt', min: 0.1, max: 1.5, step: 0.05,
    value: sim.params.dt, format: v => v.toFixed(2),
    onChange: v => sim.setParam('dt', v),
});
makeSlider(integHost, {
    name: 'n', sub: 'steps', min: 1, max: 8, step: 1,
    value: sim.params.stepsPerFrame, format: v => v.toFixed(0) + '/f',
    onChange: v => sim.setParam('stepsPerFrame', Math.round(v)),
});

// ---- Presets ----
buildPresetButtons(document.getElementById('presetRow'), (key, p) => {
    for (const [k, v] of Object.entries(p)) {
        if (k === 'label') continue;
        sim.setParam(k, v);
    }
    // Reflect in sliders (we only need to refresh ones whose value changed —
    // simplest path is to rebuild, but to keep code small we just update the
    // visual labels; the sliders read directly from sim only on input.)
    rebuildSliders();
    sim.initRandom();
    hint.classList.add('hidden');
});

// Quick rebuild — destroy and rewire so slider values reflect preset changes.
function rebuildSliders() {
    physHost.innerHTML = '';
    slopeHost.innerHTML = '';
    integHost.innerHTML = '';
    makeSlider(physHost, {
        name: 'K', sub: 'erode', min: 0.02, max: 0.6, step: 0.005,
        value: sim.params.K, format: v => v.toFixed(3),
        onChange: v => sim.setParam('K', v),
    });
    makeSlider(physHost, {
        name: 'm', sub: 'A^m', min: 0.30, max: 0.90, step: 0.01,
        value: sim.params.m, format: v => v.toFixed(2),
        onChange: v => sim.setParam('m', v),
    });
    makeSlider(physHost, {
        name: 'n', sub: 'S^n', min: 0.5, max: 2.0, step: 0.05,
        value: sim.params.n, format: v => v.toFixed(2),
        onChange: v => sim.setParam('n', v),
    });
    makeSlider(slopeHost, {
        name: 'D', sub: 'creep', min: 0.0, max: 0.6, step: 0.01,
        value: sim.params.D, format: v => v.toFixed(2),
        onChange: v => sim.setParam('D', v),
    });
    makeSlider(slopeHost, {
        name: 'U', sub: 'supply', min: 0.0, max: 0.005, step: 0.0001,
        value: sim.params.U, format: v => v.toFixed(4),
        onChange: v => sim.setParam('U', v),
    });
    makeSlider(slopeHost, {
        name: 'sea', min: -0.30, max: 0.40, step: 0.01,
        value: sim.params.seaLevel, format: v => v.toFixed(2),
        onChange: v => sim.setParam('seaLevel', v),
    });
    makeSlider(integHost, {
        name: 'Δt', min: 0.1, max: 1.5, step: 0.05,
        value: sim.params.dt, format: v => v.toFixed(2),
        onChange: v => sim.setParam('dt', v),
    });
    makeSlider(integHost, {
        name: 'n', sub: 'steps', min: 1, max: 8, step: 1,
        value: sim.params.stepsPerFrame, format: v => v.toFixed(0) + '/f',
        onChange: v => sim.setParam('stepsPerFrame', Math.round(v)),
    });
}

// ---- Initial-state buttons ----
document.querySelectorAll('[data-init]').forEach(btn => {
    btn.addEventListener('click', () => {
        const which = btn.dataset.init;
        if (which === 'random')   sim.initRandom();
        if (which === 'plateau')  sim.initPlateau();
        if (which === 'islands')  sim.initIslands();
        if (which === 'ridge')    sim.initRidge();
        hint.classList.add('hidden');
    });
});

// ---- Palette ----
document.querySelectorAll('[data-palette]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-palette]')
            .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sim.palette = btn.dataset.palette;
    });
});

// ---- Run controls ----
let running = true;
const playBtn = document.getElementById('playBtn');
playBtn.addEventListener('click', () => {
    running = !running;
    playBtn.textContent = running ? '⏸ Pause' : '▶ Play';
    playBtn.classList.toggle('active', running);
});
document.getElementById('stepBtn').addEventListener('click', () => {
    for (let i = 0; i < 50; i++) sim.step();
    blit();
    updateMeta();
});
document.getElementById('resetBtn').addEventListener('click', () => {
    sim.initRandom();
    blit();
    updateMeta();
});

function updateMeta() {
    meta.textContent = `${sim.steps.toString().padStart(5, ' ')} steps`;
}

// ---- Click on canvas: dismiss hint, allow user to "punch" a hole that
// rapidly carves a basin (fun and pedagogically clear).
canvas.addEventListener('click', (e) => {
    hint.classList.add('hidden');
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const cw = canvas.width / (window.devicePixelRatio || 1);
    const ch = canvas.height / (window.devicePixelRatio || 1);
    const side = Math.min(cw, ch);
    const ox = (cw - side) * 0.5, oy = (ch - side) * 0.5;
    const u = (cx - ox) / side, v = (cy - oy) / side;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const ix = Math.floor(u * SIM_RES);
    const iy = Math.floor(v * SIM_RES);
    // Lower a small disc — opens a new outlet that channels organize toward.
    const R = 8;
    for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
            const x = ix + di, y = iy + dj;
            if (x < 0 || y < 0 || x >= SIM_RES || y >= SIM_RES) continue;
            const r2 = di*di + dj*dj;
            if (r2 > R*R) continue;
            const k = 1 - r2 / (R*R);
            sim.h[y * SIM_RES + x] -= 0.35 * k;
        }
    }
});

// ---- Main loop ----
function frame() {
    if (running) {
        for (let i = 0; i < sim.params.stepsPerFrame; i++) sim.step();
    }
    blit();
    updateMeta();
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
