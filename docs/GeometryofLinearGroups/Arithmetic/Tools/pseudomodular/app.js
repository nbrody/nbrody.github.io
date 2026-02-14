/**
 * app.js — Pseudomodular Group Explorer
 * Interactive visualization of killer intervals and group action for Δ(u², 2τ).
 */

const M = window.PseudoMath;

// ─── State ────────────────────────────────────────────────────
const state = {
    u2: null,    // rational { num, den }
    tau: null,   // rational { num, den }
    u2f: 0,      // float
    tauf: 0,     // float
    generators: null,
    cusps: [],
    intervals: [],
    coverage: null,
    currentView: 'intervals',

    // Canvas state
    intervalView: { offsetX: 0, scale: 1, hovered: -1 },
    uhpView: { offsetX: 0, offsetY: 0, scale: 80 },
    fdView: { offsetX: 0, offsetY: 0, scale: 120 },

    // Animation
    animate: true,
    animSpeed: 5,
    animTime: 0,
    animElements: [],   // group elements to animate
    animPhase: 0,
    animActive: false,
};

// ─── DOM References ──────────────────────────────────────────
const uInput = document.getElementById('u-input');
const tauInput = document.getElementById('tau-input');
const computeBtn = document.getElementById('compute-btn');
const paramValidity = document.getElementById('param-validity');
const depthSlider = document.getElementById('max-depth');
const depthValue = document.getElementById('depth-value');
const denomSlider = document.getElementById('max-denom');
const denomValue = document.getElementById('denom-value');
const animToggle = document.getElementById('animate-toggle');
const speedSlider = document.getElementById('anim-speed');
const speedValue = document.getElementById('speed-value');
const generatorDisplay = document.getElementById('generator-display');
const resultsDisplay = document.getElementById('results-display');
const canvasCoords = document.getElementById('canvas-coords');
const canvasStatus = document.getElementById('canvas-status');
const togglePanel = document.getElementById('toggle-panel');

const intervalCanvas = document.getElementById('interval-canvas');
const uhpCanvas = document.getElementById('uhp-canvas');
const fdomainCanvas = document.getElementById('fundomain-canvas');

const intervalCtx = intervalCanvas.getContext('2d');
const uhpCtx = uhpCanvas.getContext('2d');
const fdomainCtx = fdomainCanvas.getContext('2d');

// ─── Color Palettes ──────────────────────────────────────────
const COLORS = {
    bg: '#0a0e1a',
    axis: '#4b5563',
    grid: '#1f2937',
    intervalFill: 'rgba(99, 102, 241, 0.25)',
    intervalStroke: '#6366f1',
    intervalHover: 'rgba(167, 139, 250, 0.4)',
    coveredFill: 'rgba(52, 211, 153, 0.15)',
    uncoveredFill: 'rgba(248, 113, 113, 0.2)',
    uncoveredStroke: '#f87171',
    cusp: '#fbbf24',
    cuspGlow: 'rgba(251, 191, 36, 0.3)',
    text: '#9ca3af',
    textBright: '#e5e7eb',
    accent: '#818cf8',
    geodesic: '#6366f1',
    geodesicAlt: '#8b5cf6',
    fundomain: 'rgba(99, 102, 241, 0.2)',
    fundomainBorder: '#a78bfa',
    orbitPoint: '#34d399',
    animTrail: 'rgba(129, 140, 248, 0.12)',
};

function depthColor(depth, maxDepth) {
    const t = Math.min(depth / Math.max(maxDepth, 1), 1);
    const h = 240 + t * 60;  // blue → purple
    const s = 80 - t * 20;
    const l = 65 - t * 20;
    return `hsla(${h}, ${s}%, ${l}%, 0.35)`;
}

function depthStrokeColor(depth, maxDepth) {
    const t = Math.min(depth / Math.max(maxDepth, 1), 1);
    const h = 240 + t * 60;
    const s = 80 - t * 20;
    const l = 60;
    return `hsl(${h}, ${s}%, ${l}%)`;
}

// ─── Initialization ──────────────────────────────────────────

function init() {
    resizeCanvases();
    setupEventListeners();
    validateParams();
    updateSliderDisplays();
    requestAnimationFrame(animationLoop);
}

function resizeCanvases() {
    const area = document.getElementById('canvas-area');
    const w = area.clientWidth;
    const h = area.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    [intervalCanvas, uhpCanvas, fdomainCanvas].forEach(c => {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = w + 'px';
        c.style.height = h + 'px';
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    // Initialize view centers
    state.intervalView.offsetX = w / 2;
    state.uhpView.offsetX = w / 2;
    state.uhpView.offsetY = h * 0.75;
    state.fdView.offsetX = w / 2;
    state.fdView.offsetY = h * 0.65;

    draw();
}

// ─── Event Listeners ─────────────────────────────────────────

function setupEventListeners() {
    window.addEventListener('resize', resizeCanvases);

    computeBtn.addEventListener('click', compute);
    uInput.addEventListener('input', validateParams);
    tauInput.addEventListener('input', validateParams);

    depthSlider.addEventListener('input', updateSliderDisplays);
    denomSlider.addEventListener('input', updateSliderDisplays);
    speedSlider.addEventListener('input', () => {
        state.animSpeed = parseInt(speedSlider.value);
        speedValue.textContent = speedSlider.value;
    });
    animToggle.addEventListener('change', () => {
        state.animate = animToggle.checked;
    });

    togglePanel.addEventListener('click', () => {
        document.getElementById('control-panel').classList.toggle('collapsed');
    });

    // Viz tabs
    document.querySelectorAll('.viz-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.viz-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const view = tab.dataset.view;
            state.currentView = view;
            intervalCanvas.style.display = view === 'intervals' ? 'block' : 'none';
            uhpCanvas.style.display = view === 'uhp' ? 'block' : 'none';
            fdomainCanvas.style.display = view === 'fundomain' ? 'block' : 'none';
            draw();
        });
    });

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            uInput.value = btn.dataset.u2;
            tauInput.value = btn.dataset.tau;
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            validateParams();
            compute();
        });
    });

    // Canvas interactions
    setupCanvasInteractions(intervalCanvas, 'intervalView', false);
    setupCanvasInteractions(uhpCanvas, 'uhpView', false);
    setupCanvasInteractions(fdomainCanvas, 'fdView', false);

    // Mouse move for hover on interval canvas
    intervalCanvas.addEventListener('mousemove', handleIntervalHover);
    intervalCanvas.addEventListener('mouseleave', () => {
        state.intervalView.hovered = -1;
        draw();
    });
}

function setupCanvasInteractions(canvas, viewKey, is1D) {
    let dragging = false, startX, startY;

    canvas.addEventListener('mousedown', e => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    window.addEventListener('mouseup', () => { dragging = false; });

    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const view = state[viewKey];
        view.offsetX += e.clientX - startX;
        if (!is1D) view.offsetY += e.clientY - startY;
        startX = e.clientX;
        startY = e.clientY;
        draw();
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoom = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const view = state[viewKey];
        const mx = e.clientX;
        const my = e.clientY;

        view.offsetX = mx - zoom * (mx - view.offsetX);
        if (!is1D) view.offsetY = my - zoom * (my - view.offsetY);
        view.scale *= zoom;
        draw();
    });
}

function handleIntervalHover(e) {
    if (state.intervals.length === 0) return;
    const rect = intervalCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const view = state.intervalView;
    const w = intervalCanvas.clientWidth;
    const h = intervalCanvas.clientHeight;

    // Convert pixel to math coordinate
    const mathX = (mx - view.offsetX) / view.scale;

    // Find closest interval
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < state.intervals.length; i++) {
        const iv = state.intervals[i];
        if (mathX >= iv.left && mathX <= iv.right) {
            const dist = Math.abs(mathX - iv.center);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
    }

    if (bestIdx !== state.intervalView.hovered) {
        state.intervalView.hovered = bestIdx;
        if (bestIdx >= 0) {
            const iv = state.intervals[bestIdx];
            const frac = iv.cusp;
            canvasCoords.textContent =
                `Cusp: ${frac.num}/${frac.den} ≈ ${iv.cuspValue.toFixed(6)} | ` +
                `Interval: (${iv.left.toFixed(4)}, ${iv.right.toFixed(4)}) | Width: ${(2 * iv.halfWidth).toFixed(6)}`;
        } else {
            canvasCoords.textContent = '';
        }
        draw();
    }
}

function updateSliderDisplays() {
    depthValue.textContent = depthSlider.value;
    denomValue.textContent = denomSlider.value;
    speedValue.textContent = speedSlider.value;
}

// ─── Validation ──────────────────────────────────────────────

function validateParams() {
    const u2 = M.parseRational(uInput.value);
    const tau = M.parseRational(tauInput.value);

    if (!u2 || !tau) {
        paramValidity.className = 'param-info invalid';
        paramValidity.textContent = 'Enter valid rationals for u² and τ.';
        computeBtn.disabled = true;
        return false;
    }

    const u2f = M.rationalToFloat(u2);
    const tauf = M.rationalToFloat(tau);

    if (u2f <= 0) {
        paramValidity.className = 'param-info invalid';
        paramValidity.textContent = 'u² must be positive.';
        computeBtn.disabled = true;
        return false;
    }

    if (tauf <= u2f + 1) {
        paramValidity.className = 'param-info invalid';
        paramValidity.textContent = `Need τ > u² + 1. Currently τ = ${tauf}, u²+1 = ${u2f + 1}.`;
        computeBtn.disabled = true;
        return false;
    }

    state.u2 = u2;
    state.tau = tau;
    state.u2f = u2f;
    state.tauf = tauf;

    paramValidity.className = 'param-info valid';
    paramValidity.textContent = `✓ Valid: τ - u² - 1 = ${(tauf - u2f - 1).toFixed(6)} > 0`;
    computeBtn.disabled = false;

    updateGeneratorDisplay();
    return true;
}

function updateGeneratorDisplay() {
    if (!state.u2 || !state.tau) return;
    const u2s = M.rationalToString(state.u2);
    const taus = M.rationalToString(state.tau);

    generatorDisplay.innerHTML =
        `$g_1 = \\frac{1}{\\sqrt{${taus} - 1 - ${u2s}}}` +
        `\\begin{pmatrix} ${taus} - 1 & ${u2s} \\\\ 1 & 1 \\end{pmatrix}$` +
        `<br><br>` +
        `$g_2 = \\frac{1}{\\sqrt{${taus} - 1 - ${u2s}}}` +
        `\\begin{pmatrix} \\sqrt{${u2s}} & \\sqrt{${u2s}} \\\\` +
        ` 1/\\sqrt{${u2s}} & (${taus} - ${u2s})/\\sqrt{${u2s}} \\end{pmatrix}$`;

    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([generatorDisplay]);
    }
}

// ─── Computation ─────────────────────────────────────────────

function compute() {
    if (!validateParams()) return;

    computeBtn.disabled = true;
    computeBtn.textContent = 'Computing...';
    computeBtn.classList.add('computing');
    canvasStatus.textContent = 'Computing...';

    // Use setTimeout to allow UI update
    setTimeout(() => {
        const gens = M.computeGenerators(state.u2f, state.tauf);
        if (!gens) {
            resultsDisplay.innerHTML = '<p class="placeholder-text" style="color: var(--danger);">Invalid parameters.</p>';
            computeBtn.disabled = false;
            computeBtn.textContent = 'Compute Killer Intervals';
            computeBtn.classList.remove('computing');
            return;
        }

        state.generators = gens;
        const maxDepth = parseInt(depthSlider.value);
        const maxDenom = parseInt(denomSlider.value);

        // Enumerate cusps
        state.cusps = M.enumerateCusps(gens.g1, gens.g2, maxDepth, maxDenom);

        // Compute killer intervals
        state.intervals = M.computeKillerIntervals(state.cusps, state.tauf);

        // Compute coverage
        state.coverage = M.computeCoverage(state.intervals, state.tauf);

        // Build animation elements
        buildAnimElements();

        // Update UI
        updateResults();
        resetViews();
        draw();

        computeBtn.disabled = false;
        computeBtn.textContent = 'Compute Killer Intervals';
        computeBtn.classList.remove('computing');
        canvasStatus.textContent = `${state.cusps.length} cusps found`;
    }, 50);
}

function updateResults() {
    const cov = state.coverage;
    const pct = (cov.coverage * 100).toFixed(2);
    const covColor = cov.coverage > 0.999 ? 'var(--success)' :
        cov.coverage > 0.8 ? 'var(--warning)' : 'var(--danger)';

    let html = `
    <div class="stat-row">
      <span class="stat-label">Cusps found</span>
      <span class="stat-value">${state.cusps.length}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Intervals</span>
      <span class="stat-value">${state.intervals.length}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Coverage of $[0, 2\\tau]$</span>
      <span class="stat-value" style="color:${covColor}">${pct}%</span>
    </div>
    <div class="coverage-bar">
      <div class="coverage-fill" style="width:${pct}%; background:${covColor};"></div>
    </div>
  `;

    if (cov.uncovered.length > 0 && cov.coverage < 0.999) {
        html += `<div style="margin-top:10px; font-size:0.75rem; color:var(--danger);">`;
        html += `<strong>${cov.uncovered.length} gap(s):</strong><br>`;
        cov.uncovered.slice(0, 5).forEach(g => {
            html += `(${g.left.toFixed(4)}, ${g.right.toFixed(4)})<br>`;
        });
        if (cov.uncovered.length > 5) html += `...and ${cov.uncovered.length - 5} more`;
        html += `</div>`;
    } else if (cov.coverage > 0.999) {
        html += `<div style="margin-top:10px; font-size:0.82rem; color:var(--success); font-weight:600;">
      ✓ Full coverage! Group is likely pseudomodular.
    </div>`;
    }

    // Commutator info
    if (state.generators) {
        const comm = M.computeCommutator(state.generators.g1, state.generators.g2);
        if (comm) {
            const tr = M.matTrace(comm);
            html += `<div class="stat-row" style="margin-top:8px;">
        <span class="stat-label">tr([g₁,g₂⁻¹])</span>
        <span class="stat-value">${tr.toFixed(6)}</span>
      </div>`;
        }
    }

    resultsDisplay.innerHTML = html;
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([resultsDisplay]);
    }
}

function resetViews() {
    const w = intervalCanvas.clientWidth;
    const h = intervalCanvas.clientHeight;

    // For interval view: fit [0, 2τ] into canvas
    const range = 2 * state.tauf;
    const margin = range * 0.15;
    state.intervalView.scale = (w * 0.8) / (range + 2 * margin);
    state.intervalView.offsetX = w * 0.1 + margin * state.intervalView.scale;

    // For UHP view
    state.uhpView.offsetX = w * 0.35;
    state.uhpView.offsetY = h * 0.8;
    state.uhpView.scale = Math.min(w, h) * 0.12;

    // For fundamental domain view
    state.fdView.offsetX = w * 0.4;
    state.fdView.offsetY = h * 0.75;
    state.fdView.scale = Math.min(w, h) * 0.15;
}

// ─── Animation ───────────────────────────────────────────────

function buildAnimElements() {
    if (!state.generators) return;
    const { g1, g2 } = state.generators;
    const g1inv = M.matInv(g1);
    const g2inv = M.matInv(g2);

    // Build group elements up to depth 4 for animation
    state.animElements = [];
    const queue = [{ mat: M.matIdentity(), depth: 0 }];
    const seen = new Set();
    seen.add(matKey(M.matIdentity()));

    const gens = [g1, g1inv, g2, g2inv];

    while (queue.length > 0) {
        const { mat, depth } = queue.shift();
        if (depth >= 4) continue;

        for (const g of gens) {
            const newMat = M.matMul(g, mat);
            const key = matKey(newMat);
            if (seen.has(key)) continue;
            seen.add(key);
            state.animElements.push(newMat);
            queue.push({ mat: newMat, depth: depth + 1 });
        }
    }
}

function matKey(m) {
    return m.map(x => x.toFixed(6)).join(',');
}

// ─── Drawing ─────────────────────────────────────────────────

function draw() {
    switch (state.currentView) {
        case 'intervals': drawIntervals(); break;
        case 'uhp': drawUHP(); break;
        case 'fundomain': drawFundomain(); break;
    }
}

// ─── Killer Intervals View ──────────────────────────────────

function drawIntervals() {
    const ctx = intervalCtx;
    const w = intervalCanvas.clientWidth;
    const h = intervalCanvas.clientHeight;
    const view = state.intervalView;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    if (state.intervals.length === 0) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Select parameters and click "Compute" to visualize killer intervals', w / 2, h / 2);
        return;
    }

    // Animation: progressively reveal intervals by depth
    const animPhase = state.animate ? (state.animTime * state.animSpeed * 0.0005) : Infinity;

    const toX = (x) => view.offsetX + x * view.scale;
    const fromX = (px) => (px - view.offsetX) / view.scale;

    const tau = state.tauf;
    const yCenter = h * 0.5;
    const bandHeight = h * 0.25;

    // ── Draw range [0, 2τ] background
    const x0 = toX(0);
    const x2t = toX(2 * tau);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(x0, yCenter - bandHeight, x2t - x0, 2 * bandHeight);

    // ── Draw range boundaries
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [0, 2 * tau].forEach(x => {
        const px = toX(x);
        ctx.beginPath();
        ctx.moveTo(px, yCenter - bandHeight - 20);
        ctx.lineTo(px, yCenter + bandHeight + 20);
        ctx.stroke();
    });
    ctx.setLineDash([]);

    // Labels for range
    ctx.fillStyle = COLORS.textBright;
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0', toX(0), yCenter + bandHeight + 36);
    ctx.fillText(`2τ = ${(2 * tau).toFixed(2)}`, toX(2 * tau), yCenter + bandHeight + 36);

    // ── Draw coverage/gap regions
    if (state.coverage) {
        // Covered (merged intervals)
        ctx.fillStyle = COLORS.coveredFill;
        for (const iv of state.coverage.merged) {
            const xl = toX(Math.max(iv.left, 0));
            const xr = toX(Math.min(iv.right, 2 * tau));
            ctx.fillRect(xl, yCenter - bandHeight, xr - xl, 2 * bandHeight);
        }

        // Uncovered gaps
        for (const gap of state.coverage.uncovered) {
            const xl = toX(gap.left);
            const xr = toX(gap.right);
            ctx.fillStyle = COLORS.uncoveredFill;
            ctx.fillRect(xl, yCenter - bandHeight, xr - xl, 2 * bandHeight);
            ctx.strokeStyle = COLORS.uncoveredStroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(xl, yCenter - bandHeight, xr - xl, 2 * bandHeight);
        }
    }

    // ── Draw intervals as layered arcs/bars
    const maxDepth = Math.max(...state.intervals.map(iv => iv.depth || 0), 1);

    // Sort by width (widest first for layering)
    const sorted = state.intervals
        .map((iv, i) => ({ ...iv, idx: i }))
        .sort((a, b) => (b.right - b.left) - (a.right - a.left));

    for (const iv of sorted) {
        // Animated reveal: skip intervals whose depth hasn't been reached yet
        const revealT = (iv.depth || 0) - animPhase;
        if (revealT > 0) continue;
        const fadeIn = Math.min(1, -revealT * 2);

        const xl = toX(iv.left);
        const xr = toX(iv.right);
        const iw = xr - xl;

        // Skip if off-screen
        if (xr < -10 || xl > w + 10) continue;

        // Vertical position based on denominator (smaller denom = closer to center)
        const q = iv.cusp.den;
        const yOff = Math.min(q * 8, bandHeight * 0.85);

        const isHovered = iv.idx === view.hovered;

        // Draw interval bar
        ctx.globalAlpha = fadeIn;
        ctx.fillStyle = isHovered ? COLORS.intervalHover : depthColor(iv.depth || 0, maxDepth);
        const barH = isHovered ? 6 : 4;
        ctx.fillRect(xl, yCenter - yOff - barH / 2, iw, barH);

        // Draw interval arc (semicircle above the line)
        ctx.strokeStyle = isHovered ? COLORS.accent : depthStrokeColor(iv.depth || 0, maxDepth);
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.globalAlpha = fadeIn * (isHovered ? 1 : 0.6);
        ctx.beginPath();
        const cx = (xl + xr) / 2;
        const r = iw / 2;
        if (r > 0.5 && r < 5000) {
            ctx.arc(cx, yCenter, r, Math.PI, 0);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Draw cusp marker
        const cuspX = toX(iv.cuspValue);
        ctx.globalAlpha = fadeIn;
        ctx.fillStyle = isHovered ? COLORS.cusp : COLORS.cuspGlow;
        ctx.beginPath();
        ctx.arc(cuspX, yCenter, isHovered ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label for hovered
        if (isHovered) {
            ctx.fillStyle = COLORS.cusp;
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            const fracStr = `${iv.cusp.num}/${iv.cusp.den}`;
            ctx.fillText(fracStr, cuspX, yCenter - yOff - 12);
        }
    }

    // ── Draw number line
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, yCenter);
    ctx.lineTo(w, yCenter);
    ctx.stroke();

    // Tick marks
    const xMin = fromX(0);
    const xMax = fromX(w);
    const tickStep = niceTickStep((xMax - xMin) / 10);
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    for (let t = Math.ceil(xMin / tickStep) * tickStep; t <= xMax; t += tickStep) {
        const px = toX(t);
        ctx.beginPath();
        ctx.moveTo(px, yCenter - 4);
        ctx.lineTo(px, yCenter + 4);
        ctx.strokeStyle = COLORS.axis;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (Math.abs(t) > 1e-10 || tickStep < 1) {
            ctx.fillText(formatTick(t), px, yCenter + 18);
        }
    }

    // ── Legend
    drawIntervalLegend(ctx, w, h);
}

function niceTickStep(rough) {
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / mag;
    if (residual <= 1.5) return mag;
    if (residual <= 3.5) return 2 * mag;
    if (residual <= 7.5) return 5 * mag;
    return 10 * mag;
}

function formatTick(v) {
    if (Math.abs(v) < 1e-10) return '0';
    if (Math.abs(v - Math.round(v)) < 1e-10) return Math.round(v).toString();
    return v.toFixed(2);
}

function drawIntervalLegend(ctx, w, h) {
    const x = w - 180;
    const y = 70;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.strokeStyle = 'rgba(45, 58, 92, 0.8)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, 168, 95, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '10px Inter, sans-serif';
    const items = [
        { color: COLORS.intervalFill, label: 'Killer intervals' },
        { color: COLORS.cusp, label: 'Cusp points' },
        { color: COLORS.coveredFill, label: 'Covered region' },
        { color: COLORS.uncoveredFill, label: 'Uncovered gaps' }
    ];

    items.forEach((item, i) => {
        const iy = y + 14 + i * 20;
        ctx.fillStyle = item.color;
        ctx.fillRect(x + 10, iy, 14, 14);
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'left';
        ctx.fillText(item.label, x + 32, iy + 11);
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ─── Upper Half-Plane View ──────────────────────────────────

function drawUHP() {
    const ctx = uhpCtx;
    const w = uhpCanvas.clientWidth;
    const h = uhpCanvas.clientHeight;
    const view = state.uhpView;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const toCanvas = (x, y) => ({
        x: view.offsetX + x * view.scale,
        y: view.offsetY - y * view.scale
    });

    const fromCanvas = (px, py) => ({
        x: (px - view.offsetX) / view.scale,
        y: (view.offsetY - py) / view.scale
    });

    // Real axis
    const axisY = toCanvas(0, 0).y;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    // Grid
    const xMin = fromCanvas(0, 0).x;
    const xMax = fromCanvas(w, 0).x;
    const yMax = fromCanvas(0, 0).y;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    const gStep = niceTickStep((xMax - xMin) / 8);
    for (let x = Math.ceil(xMin / gStep) * gStep; x <= xMax; x += gStep) {
        const p = toCanvas(x, 0);
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, h);
        ctx.stroke();

        ctx.fillStyle = COLORS.text;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(x), p.x, axisY + 15);
    }

    if (!state.generators) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Compute parameters to see the upper half-plane action', w / 2, h / 2);
        return;
    }

    // ── Draw tessellation: images of i under group elements
    drawGroupAction(ctx, view, w, h, state.animTime);

    // ── Draw cusp markers on real axis
    for (const cusp of state.cusps) {
        if (!Number.isFinite(cusp.cusp)) continue;
        const p = toCanvas(cusp.cusp, 0);
        if (p.x < -10 || p.x > w + 10) continue;

        ctx.fillStyle = COLORS.cusp;
        ctx.beginPath();
        ctx.arc(p.x, axisY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Small triangle pointing up
        ctx.beginPath();
        ctx.moveTo(p.x, axisY - 6);
        ctx.lineTo(p.x - 3, axisY - 1);
        ctx.lineTo(p.x + 3, axisY - 1);
        ctx.closePath();
        ctx.fill();
    }

    // ── Draw isometric circles for generators
    if (state.generators) {
        const { g1, g2 } = state.generators;
        drawIsometricCircle(ctx, view, g1, COLORS.geodesic, w, h);
        drawIsometricCircle(ctx, view, g2, COLORS.geodesicAlt, w, h);
        drawIsometricCircle(ctx, view, M.matInv(g1), COLORS.geodesic, w, h);
        drawIsometricCircle(ctx, view, M.matInv(g2), COLORS.geodesicAlt, w, h);
    }
}

function drawIsometricCircle(ctx, view, m, color, canvasW, canvasH) {
    if (!m) return;
    const c = m[2];
    const d = m[3];
    if (Math.abs(c) < 1e-10) return;

    // Isometric circle: center at -d/c on real axis, radius 1/|c|
    const center = -d / c;
    const radius = 1 / Math.abs(c);

    const toCanvas = (x, y) => ({
        x: view.offsetX + x * view.scale,
        y: view.offsetY - y * view.scale
    });

    const p = toCanvas(center, 0);
    const r = radius * view.scale;

    if (p.x + r < 0 || p.x - r > canvasW) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, Math.PI, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function drawGroupAction(ctx, view, w, h, t) {
    if (!state.generators || state.animElements.length === 0) return;

    const toCanvas = (x, y) => ({
        x: view.offsetX + x * view.scale,
        y: view.offsetY - y * view.scale
    });

    // Animate: show orbits of the base point i = (0, 1)
    const basePoint = { re: 0, im: 1 };

    // Phase for animation
    const animPhase = state.animate ? (t * state.animSpeed * 0.001) : 0;
    const showCount = state.animate ?
        Math.min(Math.floor(animPhase * 3) + 1, state.animElements.length) :
        state.animElements.length;

    for (let i = 0; i < showCount; i++) {
        const m = state.animElements[i];
        const z = M.mobiusComplex(m, basePoint);
        if (!Number.isFinite(z.re) || !Number.isFinite(z.im) || z.im < 0.001) continue;

        const p = toCanvas(z.re, z.im);
        if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;

        // Orbit point with glow
        const alpha = state.animate ? Math.min(1, (animPhase * 3 - i) * 2) : 0.8;
        if (alpha <= 0) continue;

        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = COLORS.orbitPoint;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS.orbitPoint;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Draw base point
    const bp = toCanvas(0, 1);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('i', bp.x + 8, bp.y + 4);
}

// ─── Fundamental Domain View ────────────────────────────────

function drawFundomain() {
    const ctx = fdomainCtx;
    const w = fdomainCanvas.clientWidth;
    const h = fdomainCanvas.clientHeight;
    const view = state.fdView;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const toCanvas = (x, y) => ({
        x: view.offsetX + x * view.scale,
        y: view.offsetY - y * view.scale
    });

    // Real axis
    const axisY = toCanvas(0, 0).y;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    if (!state.generators) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Compute parameters to see the fundamental domain', w / 2, h / 2);
        return;
    }

    const u2f = state.u2f;

    // The ideal quadrilateral has vertices at -1, 0, u², ∞
    // These are cusps on ℝ ∪ {∞}
    // The geodesic edges are semicircles in the UHP connecting:
    // (-1, 0), (0, u²), and verticals at -1 and u² going to ∞

    // Edge connecting -1 and u²: big semicircle
    // Edge connecting -1 and 0: semicircle
    // Edge connecting 0 and u²: semicircle
    // The "edge to infinity" is two vertical lines at -1 and u²

    // Draw tessellated copies under group elements
    if (state.animElements.length > 0) {
        const animPhase = state.animate ? (state.animTime * state.animSpeed * 0.0008) : Infinity;
        const showCount = state.animate ?
            Math.min(Math.floor(animPhase * 2) + 1, state.animElements.length) :
            state.animElements.length;

        for (let idx = 0; idx < showCount; idx++) {
            const m = state.animElements[idx];
            const alpha = state.animate ? Math.min(0.3, (animPhase * 2 - idx) * 0.5) : 0.15;
            if (alpha <= 0) continue;
            drawIdealQuadUnderMap(ctx, view, m, u2f, alpha, w, h);
        }
    }

    // Draw the original fundamental domain
    drawIdealQuad(ctx, view, u2f, w, h);

    // Draw ideal vertex labels
    const vertices = [-1, 0, u2f];
    const labels = ['-1', '0', `u²=${u2f.toFixed(4)}`];
    ctx.fillStyle = COLORS.cusp;
    ctx.font = '11px JetBrains Mono, monospace';
    for (let i = 0; i < vertices.length; i++) {
        const p = toCanvas(vertices[i], 0);
        ctx.beginPath();
        ctx.arc(p.x, axisY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], p.x, axisY + 18);
    }

    // Infinity label
    ctx.fillStyle = COLORS.textBright;
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('∞ ↑', toCanvas((u2f - 1) / 2, 0).x, 30);

    // Edge labels
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = COLORS.accent;
    const mid01 = toCanvas(-0.5, 0.5);
    ctx.fillText('g₁', mid01.x - 15, mid01.y);
    const mid0u = toCanvas(u2f / 2, 0);
    ctx.fillText('g₂', mid0u.x + 15, mid0u.y - view.scale * u2f / 4);
}

function drawIdealQuad(ctx, view, u2, w, h) {
    const toCanvas = (x, y) => ({
        x: view.offsetX + x * view.scale,
        y: view.offsetY - y * view.scale
    });

    const yTop = 0;

    // Edge (-1, 0): semicircle center -0.5, radius 0.5
    drawSemicircle(ctx, view, -0.5, 0.5, COLORS.fundomainBorder, 2);

    // Edge (0, u²): semicircle center u²/2, radius u²/2
    drawSemicircle(ctx, view, u2 / 2, u2 / 2, COLORS.fundomainBorder, 2);

    // Edge (-1, u²): big semicircle center (u²-1)/2, radius (u²+1)/2
    drawSemicircle(ctx, view, (u2 - 1) / 2, (u2 + 1) / 2, COLORS.fundomainBorder, 2);

    // Vertical lines at -1 and u² (to "infinity")
    const p1 = toCanvas(-1, 0);
    const p2 = toCanvas(-1, 10);
    const p3 = toCanvas(u2, 0);
    const p4 = toCanvas(u2, 10);

    ctx.strokeStyle = COLORS.fundomainBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.stroke();

    // Fill the fundamental domain region
    // The region is bounded by: big arc on bottom, two verticals on sides, going to ∞
    // Interior region: between the small arcs and above the big arc
    ctx.fillStyle = COLORS.fundomain;
    ctx.beginPath();

    // Start at (-1, 0), go along big arc to (u², 0)
    const bigC = (u2 - 1) / 2;
    const bigR = (u2 + 1) / 2;
    const bigCanvasC = toCanvas(bigC, 0);
    const bigCanvasR = bigR * view.scale;
    ctx.arc(bigCanvasC.x, bigCanvasC.y, bigCanvasR, Math.PI, 0, false);

    // Go up vertical at u²
    const pu = toCanvas(u2, 8);
    ctx.lineTo(pu.x, pu.y);

    // Go across top to -1
    const pm = toCanvas(-1, 8);
    ctx.lineTo(pm.x, pm.y);

    // Go down vertical at -1 back to start
    ctx.closePath();
    ctx.fill();
}

function drawIdealQuadUnderMap(ctx, view, m, u2, alpha, canvasW, canvasH) {
    // Map the four ideal vertices under m
    const v = [-1, 0, u2, Infinity].map(x => M.mobiusReal(m, x));

    ctx.globalAlpha = alpha;

    // Draw geodesic edges between consecutive mapped vertices
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
    for (const [i, j] of pairs) {
        const a = v[i], b = v[j];
        if (!Number.isFinite(a) && !Number.isFinite(b)) {
            // Both at infinity - skip
            continue;
        }
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
            // One at infinity: vertical geodesic
            const finite = Number.isFinite(a) ? a : b;
            const p1 = { x: view.offsetX + finite * view.scale, y: view.offsetY };
            const p2 = { x: view.offsetX + finite * view.scale, y: 0 };
            ctx.strokeStyle = COLORS.geodesic;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            continue;
        }

        // Semicircle geodesic between a and b
        const center = (a + b) / 2;
        const radius = Math.abs(b - a) / 2;
        drawSemicircle(ctx, view, center, radius, COLORS.geodesic, 1);
    }

    ctx.globalAlpha = 1;
}

function drawSemicircle(ctx, view, center, radius, color, lineWidth) {
    const p = { x: view.offsetX + center * view.scale, y: view.offsetY };
    const r = radius * view.scale;

    if (r < 0.5 || r > 5000) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, Math.PI, 0);
    ctx.stroke();
}

// ─── Animation Loop ──────────────────────────────────────────

function animationLoop(timestamp) {
    state.animTime = timestamp;

    if (state.animate && state.generators) {
        draw();
    }

    requestAnimationFrame(animationLoop);
}

// ─── Boot ────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    init();

    // Trigger MathJax re-render for preset buttons
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise();
    }
});
