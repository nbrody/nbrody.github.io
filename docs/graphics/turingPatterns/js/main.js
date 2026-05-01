import { GrayScott } from './simulation.js';
import { makeSlider, buildPresetButtons, PRESETS } from './ui.js';

const canvas   = document.getElementById('sim');
const stage    = document.getElementById('stage');
const meta     = document.getElementById('metaReadout');
const brushOut = document.getElementById('brushReadout');
const toolOut  = document.getElementById('toolReadout');
const hintOver = document.getElementById('hintOverlay');

const SIM_RES = 512;

let sim;
try {
    sim = new GrayScott(canvas, { width: SIM_RES, height: SIM_RES });
} catch (e) {
    document.body.innerHTML = `<div style="padding:32px;color:#ebdfc6;font-family:Manrope,sans-serif">
        <h2>WebGL2 with float framebuffers is required.</h2>
        <p style="color:#9a8e74">${e.message}</p></div>`;
    throw e;
}

// ---- Sizing ----
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
}
resize();
const ro = new ResizeObserver(() => { resize(); sim.render(); });
ro.observe(stage);

// ---- Simulation parameters ----
const paramHost = document.getElementById('paramSliders');
const fSlider = makeSlider(paramHost, {
    name: 'F', sub: 'feed', min: 0.0, max: 0.10, step: 0.0005, value: sim.params.F,
    format: v => v.toFixed(4),
    onChange: v => sim.setParam('F', v),
});
const kSlider = makeSlider(paramHost, {
    name: 'k', sub: 'kill', min: 0.03, max: 0.075, step: 0.0005, value: sim.params.k,
    format: v => v.toFixed(4),
    onChange: v => sim.setParam('k', v),
});

const diffHost = document.getElementById('diffSliders');
const duSlider = makeSlider(diffHost, {
    name: 'D', sub: 'u', min: 0.05, max: 0.30, step: 0.005, value: sim.params.Du,
    format: v => v.toFixed(3),
    onChange: v => sim.setParam('Du', v),
});
const dvSlider = makeSlider(diffHost, {
    name: 'D', sub: 'v', min: 0.02, max: 0.20, step: 0.005, value: sim.params.Dv,
    format: v => v.toFixed(3),
    onChange: v => sim.setParam('Dv', v),
});

const integHost = document.getElementById('integSliders');
const dtSlider = makeSlider(integHost, {
    name: 'Δt', min: 0.2, max: 1.4, step: 0.05, value: sim.params.dt,
    format: v => v.toFixed(2),
    onChange: v => sim.setParam('dt', v),
});
const stepsSlider = makeSlider(integHost, {
    name: 'n', sub: 'steps', min: 1, max: 60, step: 1, value: sim.params.stepsPerFrame,
    format: v => v.toFixed(0) + '/f',
    onChange: v => sim.setParam('stepsPerFrame', Math.round(v)),
});

// ---- Brush ----
const brushHost = document.getElementById('brushSliders');
let brush = {
    radius: 0.04,
    tool: 'freehand',  // freehand | rect | circle | erase
    strong: false,
};
const brushSlider = makeSlider(brushHost, {
    name: 'r', sub: 'size', min: 0.005, max: 0.20, step: 0.005, value: brush.radius,
    format: v => (v * 100).toFixed(1) + '%',
    onChange: v => { brush.radius = v; },
});

// ---- Presets ----
const presetRow = document.getElementById('presetRow');
buildPresetButtons(presetRow, (key, val) => {
    fSlider.set(val.F);
    kSlider.set(val.k);
});

// ---- Initial-state buttons ----
document.querySelectorAll('button[data-init]').forEach(btn => {
    btn.addEventListener('click', () => {
        const which = btn.dataset.init;
        if (which === 'empty') sim.initEmpty();
        else if (which === 'random') sim.initRandom(0.06);
        else if (which === 'centerSeed') sim.initCenterSeed(0.06);
        else if (which === 'splatter') sim.initSplatter(28);
        sim.render();
        meta.textContent = `${sim.steps.toLocaleString()} steps`;
    });
});

// ---- Tool buttons ----
document.querySelectorAll('button[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('button[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        brush.tool = btn.dataset.tool;
        toolOut.textContent = brush.tool;
        if (brush.tool === 'erase') {
            brushOut.textContent = 'erase · drag on canvas';
        } else if (brush.tool === 'rect') {
            brushOut.textContent = 'paint v · drag rectangle';
        } else if (brush.tool === 'circle') {
            brushOut.textContent = 'paint v · drag circle';
        } else {
            brushOut.textContent = 'paint v · drag on canvas';
        }
    });
});

// ---- Palette ----
document.querySelectorAll('button[data-palette]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('button[data-palette]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const map = { gold: 0, ice: 1, ember: 2, mono: 3 };
        sim.setPalette(map[btn.dataset.palette] ?? 0);
        sim.render();
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
    sim.step(100);
    sim.render();
    meta.textContent = `${sim.steps.toLocaleString()} steps`;
});

// ---- Painting on canvas ----
function clientToUv(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = 1 - (ev.clientY - rect.top) / rect.height;
    return { u: x, v: y };
}

let painting = false;
let dragStart = null;
let selectionEl = null;

function fadeHint() {
    if (hintOver) hintOver.classList.add('hidden');
}

function paintAt(p, opts = {}) {
    const mode = brush.tool === 'erase' ? 'erase' : (opts.strong ? 'strong' : 'add');
    sim.paint({
        u: p.u,
        v: p.v,
        radius: brush.radius,
        shape: 'circle',
        mode,
    });
    if (!running) sim.render();
}

function ensureSelectionEl(shape) {
    if (selectionEl) selectionEl.remove();
    selectionEl = document.createElement('div');
    selectionEl.className = 'selection-overlay' + (shape === 'circle' ? ' circle' : '');
    stage.appendChild(selectionEl);
}

function updateSelectionEl(p0, p1) {
    if (!selectionEl) return;
    const rect = canvas.getBoundingClientRect();
    const x0 = p0.clientX - rect.left, y0 = p0.clientY - rect.top;
    const x1 = p1.clientX - rect.left, y1 = p1.clientY - rect.top;
    if (selectionEl.classList.contains('circle')) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
        const r = Math.max(rx, ry);
        selectionEl.style.left = (rect.left - stage.getBoundingClientRect().left + cx - r) + 'px';
        selectionEl.style.top  = (rect.top  - stage.getBoundingClientRect().top  + cy - r) + 'px';
        selectionEl.style.width  = (2 * r) + 'px';
        selectionEl.style.height = (2 * r) + 'px';
    } else {
        const x = Math.min(x0, x1), y = Math.min(y0, y1);
        const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
        selectionEl.style.left = (rect.left - stage.getBoundingClientRect().left + x) + 'px';
        selectionEl.style.top  = (rect.top  - stage.getBoundingClientRect().top  + y) + 'px';
        selectionEl.style.width  = w + 'px';
        selectionEl.style.height = h + 'px';
    }
}

canvas.addEventListener('pointerdown', (ev) => {
    fadeHint();
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('painting');
    painting = true;
    if (brush.tool === 'rect' || brush.tool === 'circle') {
        dragStart = { clientX: ev.clientX, clientY: ev.clientY };
        ensureSelectionEl(brush.tool);
        updateSelectionEl(dragStart, dragStart);
    } else {
        paintAt(clientToUv(ev), { strong: ev.shiftKey });
    }
});

canvas.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    if (brush.tool === 'rect' || brush.tool === 'circle') {
        if (dragStart) updateSelectionEl(dragStart, { clientX: ev.clientX, clientY: ev.clientY });
    } else {
        paintAt(clientToUv(ev), { strong: ev.shiftKey });
    }
});

function finishDrag(ev) {
    if (!painting) return;
    painting = false;
    canvas.classList.remove('painting');
    if ((brush.tool === 'rect' || brush.tool === 'circle') && dragStart) {
        const p0 = clientToUv(dragStart);
        const p1 = clientToUv(ev);
        const cu = (p0.u + p1.u) / 2;
        const cv = (p0.v + p1.v) / 2;
        const ru = Math.abs(p1.u - p0.u) / 2;
        const rv = Math.abs(p1.v - p0.v) / 2;
        sim.paint({
            u: cu,
            v: cv,
            radius: Math.max(ru, rv, 0.005),
            shape: brush.tool === 'rect' ? 'rect' : 'circle',
            mode: 'strong',
        });
        if (!running) sim.render();
    }
    if (selectionEl) { selectionEl.remove(); selectionEl = null; }
    dragStart = null;
}
canvas.addEventListener('pointerup', finishDrag);
canvas.addEventListener('pointercancel', finishDrag);

// ---- Animation loop ----
function frame() {
    if (running) {
        sim.step(sim.params.stepsPerFrame);
        meta.textContent = `${sim.steps.toLocaleString()} steps`;
    }
    sim.render();
    requestAnimationFrame(frame);
}

// Start with the "Coral" preset on a random init — the user lands on a
// visibly evolving pattern instead of a static black square.
fSlider.set(PRESETS.coral.F);
kSlider.set(PRESETS.coral.k);
sim.initRandom();
sim.render();
requestAnimationFrame(frame);
