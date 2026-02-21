// ═══════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════

import { RileyRenderer } from './renderer.js';
import { setupInteraction } from './interaction.js';
import { setupUI } from './ui.js';

let renderer;

function init() {
    const canvas = document.getElementById('glcanvas');
    renderer = new RileyRenderer(canvas);

    setupInteraction(canvas, renderer);
    setupUI(renderer);

    // Initial shader compilation
    const initialDepth = parseInt(document.getElementById('depthSlider').value);
    renderer.buildProgram(initialDepth);

    // Start animation loop
    requestAnimationFrame(loop);
}

function loop() {
    if (renderer.needsRender) {
        renderer.render();
    }
    requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
