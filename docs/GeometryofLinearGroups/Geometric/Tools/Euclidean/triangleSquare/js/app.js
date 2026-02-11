// app.js — UI wiring for triangle-square tiling calculator

import { parseRational, computeTiling, computePeriods, computeDisplayMatrix, validateMatrix } from './tiling.js';
import { TilingRenderer } from './canvas.js';

// ─── State ───
let renderer = null;

const PRESETS = [
    {
        label: 'Red plane',
        matrix: [[1, 0, 0, 0], [0, 1, 0, 0]]
    },
    {
        label: 'Blue plane',
        matrix: [[0, 0, 1, 0], [0, 0, 0, 1]]
    },
    {
        label: 'Twisted',
        matrix: [[1, 0, 0, 1], [0, 1, 1, 0]]
    },
    {
        label: 'Scaled',
        matrix: [[1, 0, 2, 0], [0, 1, 0, 2]]
    },
    {
        label: 'Mixed',
        matrix: [[2, 1, 1, 0], [0, 1, 1, 2]]
    },
    {
        label: 'Rational',
        matrix: [['1', '0', '1/2', '0'], ['0', '1', '0', '1/3']]
    },
    {
        label: 'Asymmetric',
        matrix: [[1, 0, 1, 1], [0, 1, 0, 1]]
    },
];

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
    buildMatrixGrid();
    buildPresets();

    document.getElementById('btn-compute').addEventListener('click', compute);
    document.getElementById('btn-reset-view').addEventListener('click', () => {
        if (renderer) renderer.resetView();
    });

    document.getElementById('show-edges').addEventListener('change', e => {
        if (renderer) renderer.showEdges = e.target.checked;
    });
    document.getElementById('show-periods').addEventListener('change', e => {
        if (renderer) renderer.showPeriods = e.target.checked;
    });
    document.getElementById('fill-opacity').addEventListener('input', e => {
        if (renderer) renderer.fillOpacity = parseInt(e.target.value) / 100;
    });

    // Load "Twisted" preset by default
    loadPreset(PRESETS[2]);
});

// ─── Matrix Grid ───

function buildMatrixGrid() {
    const grid = document.getElementById('matrix-grid');
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'mat-entry ' + (c < 2 ? 'col-red' : 'col-blue');
            input.dataset.row = r;
            input.dataset.col = c;
            input.value = '0';

            // Enter key triggers compute
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') compute();
            });

            grid.appendChild(input);
        }
    }
}

// ─── Presets ───

function buildPresets() {
    const container = document.getElementById('presets');
    for (const preset of PRESETS) {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
            loadPreset(preset);
            compute();
        });
        container.appendChild(btn);
    }
}

function loadPreset(preset) {
    const inputs = document.querySelectorAll('#matrix-grid .mat-entry');
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
            inputs[r * 4 + c].value = String(preset.matrix[r][c]);
        }
    }
}

// ─── Parse Matrix ───

function getMatrixFromUI() {
    const inputs = document.querySelectorAll('#matrix-grid .mat-entry');
    const v1 = [], v2 = [];
    for (let c = 0; c < 4; c++) {
        const val1 = parseRational(inputs[c].value);
        const val2 = parseRational(inputs[4 + c].value);
        if (val1 === null || val2 === null) return null;
        v1.push(val1);
        v2.push(val2);
    }
    return [v1, v2];
}

// ─── Compute ───

function compute() {
    hideMsg();

    const matrix = getMatrixFromUI();
    if (!matrix) {
        showMsg('Invalid entries. Use integers or fractions like 1/2, -3/4.');
        return;
    }

    const [v1, v2] = matrix;

    if (!validateMatrix(v1, v2)) {
        showMsg('The two rows must be linearly independent.');
        return;
    }

    // Show canvas card
    const canvasCard = document.getElementById('canvas-card');
    canvasCard.classList.remove('hidden');

    // Initialize renderer if needed
    if (!renderer) {
        const canvas = document.getElementById('tiling-canvas');
        renderer = new TilingRenderer(canvas);
    }

    try {
        // Compute tiling for a reasonable range
        const result = computeTiling(v1, v2, 8);

        // Compute periods
        const periods = computePeriods(v1, v2);

        renderer.setTiling(result.tiles, periods, result.displayMatrix);
        renderer.resetView();

        displayInfo(result.tiles, periods);
    } catch (err) {
        showMsg('Computation error: ' + err.message);
        console.error(err);
    }
}

// ─── Info Display ───

function displayInfo(tiles, periods) {
    const redCount = tiles.filter(t => t.type === 'red').length;
    const blueCount = tiles.filter(t => t.type === 'blue').length;
    const yellowCount = tiles.filter(t => t.type === 'yellow').length;

    let html = '';
    html += `<p><strong>Tiles in view:</strong> ${tiles.length} `;
    html += `(<span style="color:#ef4444">${redCount} red</span>, `;
    html += `<span style="color:#3b82f6">${blueCount} blue</span>, `;
    html += `<span style="color:#facc15">${yellowCount} yellow</span>)</p>`;

    if (periods) {
        const D = computeDisplayMatrix(
            getMatrixFromUI()[0],
            getMatrixFromUI()[1]
        );
        const dp1 = [
            D[0][0] * periods[0][0] + D[0][1] * periods[0][1],
            D[1][0] * periods[0][0] + D[1][1] * periods[0][1]
        ];
        const dp2 = [
            D[0][0] * periods[1][0] + D[0][1] * periods[1][1],
            D[1][0] * periods[1][0] + D[1][1] * periods[1][1]
        ];
        const len1 = Math.sqrt(dp1[0] * dp1[0] + dp1[1] * dp1[1]);
        const len2 = Math.sqrt(dp2[0] * dp2[0] + dp2[1] * dp2[1]);
        html += `<p><strong>Period vectors</strong> (lengths ${len1.toFixed(3)}, ${len2.toFixed(3)}):</p>`;
        html += `<p style="font-size:0.9rem;color:#b6c4ff;">\\(\\mathbf{p}_1 = (${fmt(periods[0][0])},\\; ${fmt(periods[0][1])})\\), `;
        html += `\\(\\mathbf{p}_2 = (${fmt(periods[1][0])},\\; ${fmt(periods[1][1])})\\)</p>`;
    } else {
        html += `<p style="color:#ff8a9a;">Could not compute period lattice (degenerate projection).</p>`;
    }

    document.querySelector('#tiling-info .result-box__content').innerHTML = html;
    document.getElementById('info-card').classList.remove('hidden');

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([document.getElementById('tiling-info')]).catch(() => {});
    }
}

function fmt(x) {
    if (Math.abs(x - Math.round(x)) < 1e-8) return String(Math.round(x));
    return x.toFixed(4);
}

// ─── Validation Messages ───

function showMsg(text) {
    const el = document.getElementById('validation-msg');
    el.textContent = text;
    el.className = 'validation-msg error';
}

function hideMsg() {
    const el = document.getElementById('validation-msg');
    el.className = 'validation-msg hidden';
}
