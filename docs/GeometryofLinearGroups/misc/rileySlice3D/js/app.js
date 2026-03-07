// ============================================================
//  app.js — Entry point for Riley Slice 3D visualization
// ============================================================

import { RileyRenderer } from './renderer.js';

let renderer;
let worker = null;
let gridData = null;
let currentResolution = 48;

// ── DOM refs ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
    viewer: $('viewer'),
    resolution: $('resolution'),
    depth: $('depth'),
    depthVal: $('depthVal'),
    computeBtn: $('computeBtn'),
    progressContainer: $('progressContainer'),
    progressBar: $('progressBar'),
    progressText: $('progressText'),
    threshLow: $('threshLow'),
    threshLowVal: $('threshLowVal'),
    threshHigh: $('threshHigh'),
    threshHighVal: $('threshHighVal'),
    pointSize: $('pointSize'),
    pointSizeVal: $('pointSizeVal'),
    opacity: $('opacity'),
    opacityVal: $('opacityVal'),
    clipEnabled: $('clipEnabled'),
    clipAxis: $('clipAxis'),
    clipPos: $('clipPos'),
    clipPosVal: $('clipPosVal'),
    colormap: $('colormap'),
    infoBar: $('info-bar'),
};

// ── Init ───────────────────────────────────────────────────
function init() {
    renderer = new RileyRenderer(els.viewer);
    wireUI();
    loop();
}

function loop() {
    renderer.render();
    requestAnimationFrame(loop);
}

// ── UI Wiring ──────────────────────────────────────────────
function wireUI() {
    // Slider displays
    const sliderPairs = [
        ['depth', 'depthVal', (v) => v],
        ['threshLow', 'threshLowVal', (v) => parseFloat(v).toFixed(1)],
        ['threshHigh', 'threshHighVal', (v) => parseFloat(v).toFixed(1)],
        ['pointSize', 'pointSizeVal', (v) => parseFloat(v).toFixed(2)],
        ['opacity', 'opacityVal', (v) => parseFloat(v).toFixed(2)],
        ['clipPos', 'clipPosVal', (v) => parseFloat(v).toFixed(2)],
    ];

    for (const [sliderId, valId, fmt] of sliderPairs) {
        els[sliderId].addEventListener('input', () => {
            els[valId].textContent = fmt(els[sliderId].value);
        });
    }

    // Display-only controls (no recomputation needed)
    const displayControls = ['threshLow', 'threshHigh', 'pointSize', 'opacity'];
    for (const id of displayControls) {
        els[id].addEventListener('input', debounce(updateDisplay, 80));
    }

    // Colormap
    els.colormap.addEventListener('change', () => {
        renderer.setColormap(els.colormap.value);
        updateDisplay();
    });

    // Clipping
    els.clipEnabled.addEventListener('change', updateClipping);
    els.clipAxis.addEventListener('change', updateClipping);
    els.clipPos.addEventListener('input', () => {
        els.clipPosVal.textContent = parseFloat(els.clipPos.value).toFixed(2);
        updateClipping();
    });

    // Compute
    els.computeBtn.addEventListener('click', startComputation);
}

function debounce(fn, ms) {
    let timer;
    return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

// ── Computation ────────────────────────────────────────────
function startComputation() {
    if (worker) worker.terminate();

    const resolution = parseInt(els.resolution.value);
    const depth = parseInt(els.depth.value);
    const epsilon = 1e-4;

    currentResolution = resolution;
    gridData = null;

    els.computeBtn.disabled = true;
    els.progressContainer.classList.add('visible');
    els.progressBar.style.width = '0%';
    els.progressText.textContent = '0%';

    worker = new Worker('js/worker.js?v=2');
    worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
            const pct = Math.round(msg.percent * 100);
            els.progressBar.style.width = pct + '%';
            els.progressText.textContent = pct + '%';
        } else if (msg.type === 'result') {
            gridData = msg.data;
            currentResolution = msg.resolution;
            els.progressBar.style.width = '100%';
            els.progressText.textContent = 'Done!';
            els.computeBtn.disabled = false;

            // Compute stats for info bar
            let minVal = Infinity, maxVal = -Infinity, count = 0;
            for (let i = 0; i < gridData.length; i++) {
                const v = gridData[i];
                if (!isNaN(v)) {
                    if (v < minVal) minVal = v;
                    if (v > maxVal) maxVal = v;
                    count++;
                }
            }
            els.infoBar.textContent =
                `${currentResolution}\u00B3 grid \u00B7 ` +
                `log(min dist) range: [${minVal.toFixed(2)}, ${maxVal.toFixed(2)}]`;

            updateDisplay();

            setTimeout(() => {
                els.progressContainer.classList.remove('visible');
            }, 1500);
        }
    };

    worker.onerror = (e) => {
        console.error('Worker error:', e);
        els.computeBtn.disabled = false;
        els.progressText.textContent = 'Error!';
    };

    worker.postMessage({ resolution, depth, epsilon });
}

// ── Display update (no recomputation) ──────────────────────
function updateDisplay() {
    if (!gridData) return;
    renderer.updatePointCloud(
        gridData,
        currentResolution,
        parseFloat(els.threshLow.value),
        parseFloat(els.threshHigh.value),
        parseFloat(els.pointSize.value),
        parseFloat(els.opacity.value),
    );
}

function updateClipping() {
    renderer.setClipping(
        els.clipAxis.value,
        parseFloat(els.clipPos.value),
        els.clipEnabled.checked,
    );
}

// ── Bootstrap ──────────────────────────────────────────────
init();
