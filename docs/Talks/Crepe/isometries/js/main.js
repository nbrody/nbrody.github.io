/**
 * Entry point — init, animation loop, step switching, draw dispatcher.
 */
import { state } from './state.js';
import { initDrawing, resizeCanvas } from './drawing.js';
import { drawStep0, drawStep1, drawStep2, drawStep3, drawStep4, drawStep5, drawStep6 } from './steps.js';
import { wireEvents } from './events.js';

/* ── Draw dispatcher ───────────────────────────────── */

function draw() {
    [drawStep0, drawStep1, drawStep2, drawStep3, drawStep4, drawStep5, drawStep6][state.step]();
}

/* ── Step switching ────────────────────────────────── */

function switchStep(step) {
    stopAnim();
    state.step = step;
    state.invPhase = 'idle'; state.invT = 0;
    state.compPhase = 'idle'; state.compT = 0;
    state.pmPhase = 'idle'; state.pmT = 0;

    document.querySelectorAll('.nav-tab').forEach(t =>
        t.classList.toggle('active', +t.dataset.step === step));

    document.querySelectorAll('.narrative-card').forEach(c =>
        c.classList.toggle('hidden', +c.dataset.step !== step));

    draw();
}

/* ── Animation helpers ─────────────────────────────── */

let animRAF = null;

function animateProp(prop, duration, cb) {
    state[prop] = 0;
    state.animating = true;
    const t0 = performance.now();
    (function loop(now) {
        state[prop] = Math.min((now - t0) / 1000 / duration, 1);
        draw();
        if (state[prop] < 1) { animRAF = requestAnimationFrame(loop); }
        else { state.animating = false; if (cb) cb(); }
    })(t0);
}

function stopAnim() {
    if (animRAF) cancelAnimationFrame(animRAF);
    animRAF = null;
    state.animating = false;
}

/* ── Boot ──────────────────────────────────────────── */

initDrawing(document.getElementById('viz-canvas'));
resizeCanvas();
wireEvents({ draw, switchStep, animateProp, stopAnim });
window.addEventListener('resize', () => { resizeCanvas(); draw(); });
draw();
