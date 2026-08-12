// ═══════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════

import { RileyRenderer } from './renderer.js';
import { setupInteraction } from './interaction.js';
import { setupUI } from './ui.js';
import { setupInfoPanel, updateHoverInfo, initializeLegend } from './infoPanel.js';

let renderer;

// ─── Point selection → export to the Poincaré domain viewer ───
// Selection is stored in screen-plane coordinates. The exported group
// depends on the view:
//   classical ρ:  ?riley=ρ   →  ⟨(1 ρ; 0 1), (1 0; 1 1)⟩
//   symmetric z:  ?rileyz=z  →  ⟨(1 z; 0 1), (0 −1; 1 0)⟩
let selection = null;

function selectionExport() {
    if (!selection) return null;
    const sym = renderer.currentParam === 1;
    return {
        label: sym ? 'z' : 'ρ',
        param: sym ? 'rileyz' : 'riley',
        re: selection.x,
        im: selection.y
    };
}

function fmtNum(v) {
    return String(Number(v.toPrecision(8)));
}

function updateSelectionPanel() {
    const panel = document.getElementById('selectionPanel');
    const info = document.getElementById('selectionInfo');
    if (!panel || !info) return;
    if (!selection) {
        panel.style.display = 'none';
        return;
    }
    const v = selectionExport();
    const sign = v.im >= 0 ? '+' : '−';
    info.textContent = `${v.label} = ${fmtNum(v.re)} ${sign} ${fmtNum(Math.abs(v.im))}i`;
    panel.style.display = 'flex';
}

function updateSelectionMarker() {
    const marker = document.getElementById('selectionMarker');
    if (!marker) return;
    if (!selection) {
        marker.style.display = 'none';
        return;
    }
    const pos = renderer.complexToCss(selection.x, selection.y);
    marker.style.display = 'block';
    marker.style.left = pos.x + 'px';
    marker.style.top = pos.y + 'px';
}

function setSelection(sel) {
    selection = sel;
    updateSelectionPanel();
    updateSelectionMarker();
}

function setupSelection(canvas) {
    document.getElementById('exportPoincareBtn')?.addEventListener('click', () => {
        const v = selectionExport();
        if (!v) return;
        window.open(`../poincare2/index.html?${v.param}=${fmtNum(v.re)},${fmtNum(v.im)}`, '_blank');
    });
    document.getElementById('clearSelectionBtn')?.addEventListener('click', () => setSelection(null));
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') setSelection(null);
    });
    // ρ means something different in the two parametrizations
    document.getElementById('paramSelect')?.addEventListener('change', () => setSelection(null));
}

function init() {
    const canvas = document.getElementById('glcanvas');
    renderer = new RileyRenderer(canvas);

    // Optional initial state from URL: ?param=1&zoom=0.2&x=0&y=0&depth=6
    const qs = new URLSearchParams(location.search);
    if (qs.get('param') === '1') {
        renderer.currentParam = 1;
        renderer.zoom = 0.22;
        document.getElementById('paramSelect').value = '1';
    }
    if (qs.has('zoom')) renderer.zoom = parseFloat(qs.get('zoom')) || renderer.zoom;
    if (qs.has('x')) renderer.centerX = parseFloat(qs.get('x')) || 0;
    if (qs.has('y')) renderer.centerY = parseFloat(qs.get('y')) || 0;
    if (qs.has('depth')) {
        const d = Math.max(3, Math.min(8, parseInt(qs.get('depth')) || 6));
        const slider = document.getElementById('depthSlider');
        slider.value = String(d);
        document.getElementById('depthVal').textContent = String(d);
    }

    setupInteraction(canvas, renderer, (clientX, clientY) => {
        setSelection(renderer.cssToComplex(clientX, clientY));
    });
    setupUI(renderer);
    setupInfoPanel();
    setupSelection(canvas);
    
    // Initialize legend (safe to call multiple times)
    try {
        initializeLegend();
    } catch (e) {
        console.error('Failed to initialize legend:', e);
    }

    // Setup hover info updates
    canvas.addEventListener('mousemove', (e) => {
        updateHoverInfo(e, canvas, renderer);
    });

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
    updateSelectionMarker(); // track pan/zoom
    requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
