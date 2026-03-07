/**
 * app.js — Main entry point for the Martelli 5-Manifold interactive
 * Imports and initializes all visualization modules.
 */

import { plotRoots } from './js/roots.js';
import { initAnosov } from './js/anosov.js';
import { drawCoxeterDiagram, drawCoxeterDiagramReduced } from './js/coxeter.js';
import { initHantscheWendt } from './js/hantzsche-wendt.js';
import { initFigureEight } from './js/figure-eight.js';

// ===== UI: Section toggle =====
function toggleSection(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    content.classList.toggle('active');
}
window.toggleSection = toggleSection;

// ===== Anosov animation controls =====
const anosovState = { running: false, frameId: null, startTime: null };

function toggleAnimation() {
    const btn = document.getElementById('playBtn');
    if (anosovState.running) {
        anosovState.running = false;
        if (anosovState.frameId) cancelAnimationFrame(anosovState.frameId);
        btn.innerHTML = `
            <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play Animation`;
    } else {
        anosovState.running = true;
        anosovState.startTime = Date.now();
        btn.innerHTML = `
            <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            Pause`;
        runAnosovLoop();
    }
}
window.toggleAnimation = toggleAnimation;

function resetAnimation() {
    anosovState.running = false;
    anosovState.startTime = null;
    if (anosovState.frameId) cancelAnimationFrame(anosovState.frameId);
    const btn = document.getElementById('playBtn');
    btn.innerHTML = `
        <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Play Animation`;
    // Draw initial state
    initAnosov(document.getElementById('anosovCanvas'), 0);
}
window.resetAnimation = resetAnimation;

function runAnosovLoop() {
    if (!anosovState.running) return;
    const elapsed = Date.now() - anosovState.startTime;
    const duration = 8000; // total animation duration in ms
    let t = Math.min(elapsed / duration, 1.0);

    const canvas = document.getElementById('anosovCanvas');
    initAnosov(canvas, t);

    if (t < 1.0) {
        anosovState.frameId = requestAnimationFrame(runAnosovLoop);
    } else {
        anosovState.running = false;
        const btn = document.getElementById('playBtn');
        btn.innerHTML = `
            <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Replay`;
    }
}

// ===== Initialization =====
window.addEventListener('load', () => {
    plotRoots();
    initAnosov(document.getElementById('anosovCanvas'), 0);
    drawCoxeterDiagram();
    drawCoxeterDiagramReduced();
    initHantscheWendt();
    initFigureEight();

    // Open the first section by default
    const firstHeader = document.getElementById('header-roots');
    if (firstHeader) {
        firstHeader.classList.add('active');
        firstHeader.nextElementSibling.classList.add('active');
    }
});
