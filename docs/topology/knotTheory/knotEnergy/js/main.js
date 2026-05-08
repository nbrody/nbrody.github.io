// App glue: builds the initial knot, wires the UI, and runs the animation
// loop alongside the energy-minimisation steps.
//
// Wrapped in an IIFE so our `const`s don't collide with top-level
// declarations from the other module scripts (multiple classic <script>
// tags share one global lexical environment, and a top-level `const X`
// in any of them would conflict with another top-level `const X` here).

(function () {
'use strict';

const KNOT_PRESETS     = window.KnotLib.KNOT_PRESETS;
const fromGaussCode    = window.KnotLib.fromGaussCode;
const parseGaussCode   = window.KnotLib.parseGaussCode;
const KnotChain        = window.KnotPhysics.KnotChain;
const Mosaic           = window.KnotMosaic;

const state = {
    chain: null,
    scene: null,
    running: false,
    stepsPerFrame: 4,
};

function loadPreset(key) {
    const preset = KNOT_PRESETS[key];
    if (!preset) return;
    const pts = preset.build(preset.n);
    state.chain = new KnotChain(pts);
    applyChainParams();
    setHud(preset.name);
    drawEnergyGraph();
    setRunning(true);
}

function applyChainParams() {
    state.chain.params.kRepel  = parseFloat($('repel-slider').value);
    state.chain.params.kSpring = parseFloat($('spring-slider').value);
    state.chain.params.kTube   = parseFloat($('tube-slider').value);
    state.scene.setTubeRadius(parseFloat($('radius-slider').value));
    state.scene.updateTube(state.chain.points);
    state.scene.frame(state.chain.points);
}

function loadMosaicGrid(grid, label) {
    let polygons;
    try {
        polygons = Mosaic.mosaicToPolygons(grid);
    } catch (e) {
        flashError(e.message);
        return;
    }
    if (polygons.length === 0) {
        flashError('Mosaic produced no closed loops');
        return;
    }
    // The energy minimiser is single-component. Pick the longest loop.
    let pts = polygons[0];
    for (const p of polygons) if (p.length > pts.length) pts = p;
    // Resample to a denser polygon so the minimiser has room to wiggle.
    const target = Math.max(160, pts.length * 4);
    const resampled = resampleClosed(pts, target);
    state.chain = new KnotChain(resampled);
    applyChainParams();
    const extra = polygons.length > 1 ? ` · +${polygons.length - 1} more component(s)` : '';
    const tag = label || `Mosaic ${grid[0].length}×${grid.length}`;
    setHud(`${tag}${extra}`);
    drawEnergyGraph();
    setRunning(true);    // start the gradient descent immediately
}

// Even-arc-length resample of a closed polygon to M points.
function resampleClosed(pts, M) {
    const N = pts.length;
    const lens = [0];
    for (let i = 0; i < N; i++) {
        lens.push(lens[i] + pts[i].distanceTo(pts[(i + 1) % N]));
    }
    const total = lens[N];
    const step = total / M;
    const out = [];
    let seg = 0;
    for (let k = 0; k < M; k++) {
        const tgt = k * step;
        while (seg < N && lens[seg + 1] < tgt) seg++;
        const t = (tgt - lens[seg]) / (lens[seg + 1] - lens[seg] + 1e-12);
        const a = pts[seg], b = pts[(seg + 1) % N];
        out.push(new THREE.Vector3(
            a.x + t * (b.x - a.x),
            a.y + t * (b.y - a.y),
            a.z + t * (b.z - a.z),
        ));
    }
    return out;
}

function loadGauss(text) {
    let pts;
    try {
        pts = fromGaussCode(text);
    } catch (e) {
        flashError(e.message);
        return;
    }
    state.chain = new KnotChain(pts);
    applyChainParams();
    setHud(`Gauss code · ${parseGaussCode(text).length / 2} crossings`);
    drawEnergyGraph();
    setRunning(true);
}

function $(id) { return document.getElementById(id); }

function setHud(text) {
    $('hud-info').textContent = text;
}

function flashError(msg)   { flashMsg(msg, 'error'); }
function flashSuccess(msg) { flashMsg(msg, 'success'); }
function flashMsg(msg, tone) {
    const el = $('error-banner');
    el.textContent = msg;
    el.classList.toggle('success', tone === 'success');
    el.classList.add('show');
    clearTimeout(flashMsg._t);
    flashMsg._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function setRunning(on) {
    state.running = on;
    $('play-btn').textContent = on ? 'Pause' : 'Run';
    $('play-btn').classList.toggle('active', on);
}

// ---- Energy graph (tiny inline canvas) --------------------------------

function drawEnergyGraph() {
    const cv = $('energy-graph');
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    const hist = state.chain ? state.chain.energyHistory : [];
    if (hist.length < 2) return;

    const min = Math.min(...hist), max = Math.max(...hist);
    const span = (max - min) || 1;

    ctx.strokeStyle = '#6c8aff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
        const x = (i / (hist.length - 1)) * w;
        const y = h - ((hist[i] - min) / span) * (h - 4) - 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    $('energy-readout').textContent = hist[hist.length - 1].toFixed(2);
    $('length-readout').textContent = state.chain.totalLength().toFixed(2);
}

// ---- Main loop --------------------------------------------------------

function tick() {
    if (state.chain && state.running) {
        for (let s = 0; s < state.stepsPerFrame; s++) state.chain.step();
        state.scene.updateTube(state.chain.points);
        if (!tick._lastDraw || performance.now() - tick._lastDraw > 50) {
            drawEnergyGraph();
            tick._lastDraw = performance.now();
        }
    }
    state.scene.render();
    requestAnimationFrame(tick);
}

// ---- DOM wiring -------------------------------------------------------

function init() {
    const canvas = $('canvas');
    state.scene = new window.KnotScene(canvas);

    const sel = $('preset-select');
    for (const [key, preset] of Object.entries(KNOT_PRESETS)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = preset.name;
        sel.appendChild(opt);
    }
    sel.addEventListener('change', e => loadPreset(e.target.value));

    $('play-btn').addEventListener('click', () => setRunning(!state.running));
    $('step-btn').addEventListener('click', () => {
        if (!state.chain) return;
        state.chain.step();
        state.scene.updateTube(state.chain.points);
        drawEnergyGraph();
    });
    $('reset-btn').addEventListener('click', () => {
        const key = sel.value;
        const customText = $('gauss-input').value.trim();
        if ($('input-mode-gauss').checked && customText) loadGauss(customText);
        else loadPreset(key);
    });

    $('repel-slider').addEventListener('input', e => {
        if (state.chain) state.chain.params.kRepel = parseFloat(e.target.value);
        $('repel-val').textContent = parseFloat(e.target.value).toFixed(2);
    });
    $('spring-slider').addEventListener('input', e => {
        if (state.chain) state.chain.params.kSpring = parseFloat(e.target.value);
        $('spring-val').textContent = parseFloat(e.target.value).toFixed(1);
    });
    $('tube-slider').addEventListener('input', e => {
        if (state.chain) state.chain.params.kTube = parseFloat(e.target.value);
        $('tube-val').textContent = parseFloat(e.target.value).toFixed(1);
    });
    $('radius-slider').addEventListener('input', e => {
        const r = parseFloat(e.target.value);
        state.scene.setTubeRadius(r);
        if (state.chain) state.scene.updateTube(state.chain.points);
        $('radius-val').textContent = r.toFixed(2);
    });
    $('speed-slider').addEventListener('input', e => {
        state.stepsPerFrame = parseInt(e.target.value, 10);
        $('speed-val').textContent = e.target.value;
    });

    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.scene.setColor(btn.dataset.color);
        });
    });

    function syncInputMode() {
        const mode = $('input-mode-preset').checked ? 'preset'
                  : $('input-mode-gauss' ).checked ? 'gauss'
                  : 'mosaic';
        $('preset-row').style.display = mode === 'preset' ? '' : 'none';
        $('gauss-row' ).style.display = mode === 'gauss'  ? '' : 'none';
        $('mosaic-row').style.display = mode === 'mosaic' ? '' : 'none';
    }
    $('input-mode-preset').addEventListener('change', syncInputMode);
    $('input-mode-gauss' ).addEventListener('change', syncInputMode);
    $('input-mode-mosaic').addEventListener('change', syncInputMode);

    $('gauss-load-btn').addEventListener('click', () => {
        loadGauss($('gauss-input').value.trim());
    });

    setupMosaicEditor();

    $('toggle-panel-btn').addEventListener('click', () => {
        $('ui-panel').classList.toggle('hidden');
    });
    $('close-panel-btn').addEventListener('click', () => {
        $('ui-panel').classList.add('hidden');
    });

    // If the page was opened with #mosaic=N:HEX..., switch into mosaic
    // mode and load that diagram instead of the default trefoil.
    const imported = parseMosaicHash(location.hash);
    if (imported) {
        $('input-mode-mosaic').checked = true;
        $('input-mode-mosaic').dispatchEvent(new Event('change'));
        const N = imported.length;
        $('mosaic-size-select').value = String(N);
        setMosaicSize(N);
        for (let j = 0; j < N; j++)
            for (let i = 0; i < N; i++) mosaic.grid[j][i] = imported[j][i];
        renderMosaic();
        loadMosaicGrid(mosaic.grid, `Imported ${N}×${N} mosaic`);
    } else {
        sel.value = 'trefoil';
        loadPreset('trefoil');
    }
    setRunning(true);
    tick();
}

// Decode a #mosaic=N:HEX... URL hash into a 2D grid (or null if invalid).
// Each tile index 0..10 is encoded as one base-16 character.
function parseMosaicHash(hash) {
    const m = (hash || '').match(/[#&]mosaic=(\d+):([0-9A-Fa-f]+)/);
    if (!m) return null;
    const N = parseInt(m[1], 10);
    const s = m[2];
    if (N < 2 || N > 12) return null;
    if (s.length !== N * N) return null;
    const grid = [];
    for (let j = 0; j < N; j++) {
        const row = [];
        for (let i = 0; i < N; i++) {
            const v = parseInt(s[j * N + i], 16);
            if (isNaN(v) || v < 0 || v >= Mosaic.TILE_COUNT) return null;
            row.push(v);
        }
        grid.push(row);
    }
    return grid;
}

// Encode a 2D grid back into the URL-hash format (counterpart of parseMosaicHash).
function encodeMosaicHash(grid) {
    const N = grid.length;
    let s = '';
    for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) s += grid[j][i].toString(16).toUpperCase();
    return `#mosaic=${N}:${s}`;
}

// ---- Mosaic editor ----------------------------------------------------

const mosaic = {
    grid: null,                      // grid[j][i] = tile index
    selectedTile: 4,                 // start with arc_nw selected
    cellPx: 56,
    palettePx: 40,
};

function setupMosaicEditor() {
    buildPalette();
    setMosaicSize(parseInt($('mosaic-size-select').value, 10));
    loadExampleMosaic();

    $('mosaic-size-select').addEventListener('change', e => {
        setMosaicSize(parseInt(e.target.value, 10));
        loadExampleMosaic();
    });
    $('mosaic-clear-btn').addEventListener('click', () => {
        for (let j = 0; j < mosaic.grid.length; j++)
            for (let i = 0; i < mosaic.grid[0].length; i++) mosaic.grid[j][i] = 0;
        renderMosaic();
    });
    $('mosaic-shape-select').addEventListener('change', e => {
        const key = e.target.value;
        if (!key) return;
        const shape = MOSAIC_SHAPES[key];
        if (!shape) return;
        // Resize grid to fit the shape, then load it.
        const N = shape.grid.length;
        $('mosaic-size-select').value = String(N);
        setMosaicSize(N);
        for (let j = 0; j < N; j++)
            for (let i = 0; i < N; i++) mosaic.grid[j][i] = shape.grid[j][i];
        renderMosaic();
        e.target.value = '';
    });
    $('mosaic-load-btn').addEventListener('click', () => loadMosaicGrid(mosaic.grid));
    $('mosaic-share-btn').addEventListener('click', () => {
        const url = location.origin + location.pathname + encodeMosaicHash(mosaic.grid);
        navigator.clipboard.writeText(url).then(
            () => flashSuccess('Share link copied to clipboard'),
            () => flashError('Could not copy: ' + url),
        );
    });
}

const MOSAIC_SHAPES = {
    unknot3:  { name: 'Unknot 3×3',  grid: [
        [5, 1, 6],
        [2, 0, 2],
        [3, 1, 4],
    ]},
    unknot4:  { name: 'Unknot 4×4',  grid: [
        [5, 1, 1, 6],
        [2, 0, 0, 2],
        [2, 0, 0, 2],
        [3, 1, 1, 4],
    ]},
    trefoil5: { name: 'Trefoil 3₁',  grid: [
        [0, 5, 1, 6, 0],
        [5, 8, 1, 7, 6],
        [2, 3, 6, 2, 2],
        [3, 1, 7, 4, 2],
        [0, 0, 3, 1, 4],
    ]},
    figure85: { name: 'Figure-8 4₁', grid: [
        [0, 5, 1, 6, 0],
        [5, 7, 6, 2, 0],
        [2, 3, 7, 8, 6],
        [3, 1, 8, 4, 2],
        [0, 0, 3, 1, 4],
    ]},
    hopf5:    { name: 'Hopf link',   grid: [
        [5, 6, 0, 5, 6],
        [3, 4, 0, 3, 4],
        [0, 0, 0, 0, 0],
        [5, 6, 0, 5, 6],
        [3, 4, 0, 3, 4],
    ]},
};

function buildPalette() {
    const root = $('mosaic-palette');
    root.innerHTML = '';
    for (let t = 0; t < Mosaic.TILE_COUNT; t++) {
        const btn = document.createElement('button');
        btn.className = 'mosaic-palette-btn';
        btn.dataset.tile = String(t);
        btn.title = Mosaic.TILE_NAMES[t];
        const c = document.createElement('canvas');
        const px = mosaic.palettePx;
        c.width = px * window.devicePixelRatio;
        c.height = px * window.devicePixelRatio;
        c.style.width = px + 'px';
        c.style.height = px + 'px';
        const ctx = c.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, px, px);
        Mosaic.drawTile(ctx, t, 0, 0, px, '#6c8aff', 3, '#0a0e1a');
        btn.appendChild(c);
        btn.addEventListener('click', () => {
            mosaic.selectedTile = t;
            highlightPaletteSelection();
        });
        root.appendChild(btn);
    }
    highlightPaletteSelection();
}

function highlightPaletteSelection() {
    document.querySelectorAll('.mosaic-palette-btn').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.tile, 10) === mosaic.selectedTile);
    });
}

function setMosaicSize(n) {
    mosaic.grid = Array.from({ length: n }, () => new Array(n).fill(0));
    // Scale cell size so the grid fits within the panel width.
    mosaic.cellPx = Math.max(28, Math.floor(260 / n));
    renderMosaic();
}

function renderMosaic() {
    const root = $('mosaic-grid');
    root.innerHTML = '';
    const N = mosaic.grid.length;
    root.style.gridTemplateColumns = `repeat(${N}, ${mosaic.cellPx}px)`;

    const mismatches = Mosaic.findMismatches(mosaic.grid);

    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const cell = document.createElement('div');
        cell.className = 'mosaic-cell';
        cell.style.width  = mosaic.cellPx + 'px';
        cell.style.height = mosaic.cellPx + 'px';

        const c = document.createElement('canvas');
        c.width  = mosaic.cellPx * window.devicePixelRatio;
        c.height = mosaic.cellPx * window.devicePixelRatio;
        c.style.width  = mosaic.cellPx + 'px';
        c.style.height = mosaic.cellPx + 'px';
        const ctx = c.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        Mosaic.drawTile(ctx, mosaic.grid[j][i], 0, 0, mosaic.cellPx, '#6c8aff', 2.5, 'rgba(0,0,0,0)');
        cell.appendChild(c);

        // Mismatch indicators on the four edges.
        for (const side of ['N','S','W','E']) {
            if (mismatches.has(`${i}|${j}|${side}`)) {
                const e = document.createElement('div');
                e.className = `mosaic-edge mosaic-edge-${side}`;
                cell.appendChild(e);
            }
        }

        cell.addEventListener('click', () => {
            mosaic.grid[j][i] = mosaic.selectedTile;
            renderMosaic();
        });
        cell.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            mosaic.grid[j][i] = 0;
            renderMosaic();
        });

        root.appendChild(cell);
    }
}

// Built-in mosaic examples keyed by grid size. Tile indices match
// mosaic.js: 0 blank, 1 ─, 2 │, 3 ╮ (N-E), 4 ╭ (N-W), 5 ╯ (S-E),
// 6 ╰ (S-W), 7 ⊕, 8 ⊖, 9 ⟋, 10 ⟍.
//
// Note that for a closed loop the corner cell's arc curls *away* from
// that corner. So the top-left cell of a loop needs `5` (S+E sides:
// the arc sits in the SE corner of the cell), the top-right needs `6`,
// the bottom-left `3`, and the bottom-right `4`.
const MOSAIC_EXAMPLES = {
    3: [
        [5, 1, 6],
        [2, 0, 2],
        [3, 1, 4],
    ],
    4: [
        [5, 1, 1, 6],
        [2, 0, 0, 2],
        [2, 0, 0, 2],
        [3, 1, 1, 4],
    ],
    // Trefoil (3₁) — taken from the sibling knotMosaics tool's library.
    5: [
        [0, 5, 1, 6, 0],
        [5, 8, 1, 7, 6],
        [2, 3, 6, 2, 2],
        [3, 1, 7, 4, 2],
        [0, 0, 3, 1, 4],
    ],
    6: [
        [5, 1, 1, 1, 1, 6],
        [2, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 2],
        [3, 1, 1, 1, 1, 4],
    ],
    7: [
        [5, 1, 1, 1, 1, 1, 6],
        [2, 0, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 0, 2],
        [2, 0, 0, 0, 0, 0, 2],
        [3, 1, 1, 1, 1, 1, 4],
    ],
};

function loadExampleMosaic() {
    const N = mosaic.grid.length;
    const example = MOSAIC_EXAMPLES[N];
    if (!example) return;
    for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) mosaic.grid[j][i] = example[j][i];
    renderMosaic();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
