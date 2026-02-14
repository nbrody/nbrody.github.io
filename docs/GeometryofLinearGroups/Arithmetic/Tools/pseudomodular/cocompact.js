/**
 * cocompact.js — Interactive height reduction for G = <S, D, A> acting on QP^1
 */

// ─── Matrix Arithmetic ───────────────────────────────────

function matMul(a, b) {
    return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]
    ];
}
function matInv(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
}
function act(m, p, q) {
    return [m[0] * p + m[1] * q, m[2] * p + m[3] * q];
}
function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
}
function red(p, q) {
    if (q === 0) return [1, 0];
    if (q < 0) { p = -p; q = -q; }
    const g = gcd(Math.abs(p), q);
    return [p / g, q / g];
}

// Generators
const S = [0, -1, 1, 0];
const D = [2, 0, 0, 1];
const A = [5, 2, 2, 1];
const Dinv = matInv(D);
const Ainv = matInv(A);

const GENS = [S, D, Dinv, A, Ainv];
const GEN_NAMES = ['S', 'D', 'D⁻¹', 'A', 'A⁻¹'];

// ─── BFS Reducer ──────────────────────────────────────────

function bfsReduce(p0, q0, maxNodes = 100000) {
    let [p, q] = red(p0, q0);
    if (q === 0) return { ok: true, path: [], states: [[p, q]] };

    const queue = [[p, q, []]];
    const visited = new Set();
    visited.add(p + '/' + q);
    let count = 0;

    while (queue.length > 0 && count < maxNodes) {
        const [cp, cq, path] = queue.shift();
        count++;

        for (let i = 0; i < GENS.length; i++) {
            const [np, nq] = red(...act(GENS[i], cp, cq));
            if (nq === 0) {
                const fullPath = [...path, GEN_NAMES[i]];
                // Reconstruct states
                const states = [[p, q]];
                let [tp, tq] = [p, q];
                for (const step of fullPath) {
                    const idx = GEN_NAMES.indexOf(step);
                    [tp, tq] = red(...act(GENS[idx], tp, tq));
                    states.push([tp, tq]);
                }
                return { ok: true, path: fullPath, states };
            }
            const key = np + '/' + nq;
            if (visited.has(key)) continue;
            if (Math.abs(nq) > 500 || Math.abs(np) > 2000) continue;
            visited.add(key);
            queue.push([np, nq, [...path, GEN_NAMES[i]]]);
        }
    }
    return { ok: false, path: [], states: [[p, q]] };
}

// ─── UI ───────────────────────────────────────────────────

const COLORS = {
    bg: '#0f172a', axis: '#4b5563', text: '#9ca3af',
    textBright: '#e5e7eb', accent: '#818cf8', accentBright: '#a5b4fc',
    success: '#34d399', cusp: '#fbbf24', danger: '#f87171',
    dot: '#6366f1', dotGlow: 'rgba(99,102,241,0.3)',
    arrow: '#4b5563', path: '#8b5cf6',
};

function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
}

function formatFrac(p, q) {
    if (q === 0) return '∞';
    if (q === 1) return p.toString();
    return p + '/' + q;
}

function renderReduction(result) {
    const out = document.getElementById('reduction-output');
    if (!result.ok) {
        out.innerHTML = '<span style="color:var(--danger)">Could not reduce (search limit reached).</span>';
        return;
    }

    let html = '';
    for (let i = 0; i < result.states.length; i++) {
        const [p, q] = result.states[i];
        const isLast = i === result.states.length - 1;
        const cls = isLast ? 'frac-final' : 'frac';
        html += `<span class="${cls}">${formatFrac(p, q)}</span>`;
        if (q > 0) html += ` <span class="height-tag">[h=${q}]</span>`;

        if (i < result.path.length) {
            html += `<span class="arrow"> —<span class="gen-label">${result.path[i]}</span>→ </span>`;
        }
    }
    html += `<br><span style="color:var(--success);font-size:0.85rem">✓ Reached ∞ in ${result.path.length} steps.</span>`;
    out.innerHTML = html;
}

function drawReductionCanvas(result) {
    const canvas = document.getElementById('reduction-canvas');
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    if (!result || !result.ok || result.states.length < 2) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Enter p/q and click "Reduce" to see the visualization.', w / 2, h / 2);
        return;
    }

    const states = result.states;
    const maxQ = Math.max(...states.map(s => Math.abs(s[1])));
    const minX = Math.min(...states.map(s => s[1] === 0 ? 0 : s[0] / s[1]));
    const maxX = Math.max(...states.map(s => s[1] === 0 ? 0 : s[0] / s[1]));
    const rangeX = Math.max(maxX - minX, 2);

    const margin = { l: 50, r: 30, t: 30, b: 40 };
    const plotW = w - margin.l - margin.r;
    const plotH = h - margin.t - margin.b;

    const toCanvasX = (x) => margin.l + ((x - minX + rangeX * 0.1) / (rangeX * 1.2)) * plotW;
    const toCanvasY = (q) => margin.t + (1 - q / (maxQ * 1.15)) * plotH;

    // Axes
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.l, margin.t);
    ctx.lineTo(margin.l, h - margin.b);
    ctx.lineTo(w - margin.r, h - margin.b);
    ctx.stroke();

    // Y-axis label
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('height (denominator)', 0, 0);
    ctx.restore();

    // X-axis label
    ctx.fillText('value on ℝ', w / 2, h - 8);

    // Y ticks
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    const yStep = Math.max(1, Math.ceil(maxQ / 5));
    for (let yv = 0; yv <= maxQ; yv += yStep) {
        const cy = toCanvasY(yv);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(yv.toString(), margin.l - 6, cy + 4);
        ctx.strokeStyle = 'rgba(75,85,99,0.3)';
        ctx.beginPath();
        ctx.moveTo(margin.l, cy);
        ctx.lineTo(w - margin.r, cy);
        ctx.stroke();
    }

    // Draw path
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < states.length; i++) {
        const [p, q] = states[i];
        const x = q === 0 ? (states[i - 1] ? states[i - 1][0] / states[i - 1][1] : 0) : p / q;
        const cx = toCanvasX(x);
        const cy = toCanvasY(q);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw dots
    for (let i = 0; i < states.length; i++) {
        const [p, q] = states[i];
        const x = q === 0 ? (states[i - 1] ? states[i - 1][0] / states[i - 1][1] : 0) : p / q;
        const cx = toCanvasX(x);
        const cy = toCanvasY(q);

        // Glow
        ctx.fillStyle = COLORS.dotGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();

        // Dot
        const isFirst = i === 0;
        const isLast = i === states.length - 1;
        ctx.fillStyle = isLast ? COLORS.success : isFirst ? COLORS.cusp : COLORS.dot;
        ctx.beginPath();
        ctx.arc(cx, cy, isFirst || isLast ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = COLORS.textBright;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        const label = formatFrac(p, q);
        ctx.fillText(label, cx, cy - 12);

        // Gen label on arrow
        if (i < result.path.length) {
            const [np, nq] = states[i + 1];
            const nx = nq === 0 ? x : np / nq;
            const ncx = toCanvasX(nx);
            const ncy = toCanvasY(nq);
            const mx = (cx + ncx) / 2;
            const my = (cy + ncy) / 2;
            ctx.fillStyle = COLORS.accent;
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.fillText(result.path[i], mx, my - 6);
        }
    }
}

function runReduction() {
    const pStr = document.getElementById('p-input').value.trim();
    const qStr = document.getElementById('q-input').value.trim();
    let p = parseInt(pStr) || 0;
    let q = parseInt(qStr) || 1;
    if (q === 0) { q = 1; }
    const result = bfsReduce(p, q);
    renderReduction(result);
    drawReductionCanvas(result);
}

function runBatch() {
    const out = document.getElementById('batch-output');
    let html = '';
    let ok = 0, fail = 0;
    const maxQ = 30;

    for (let q = 1; q <= maxQ; q++) {
        for (let p = -maxQ; p <= maxQ; p++) {
            if (gcd(Math.abs(p), q) !== 1) continue;
            const r = bfsReduce(p, q);
            if (r.ok) {
                ok++;
                html += `<div class="batch-row">` +
                    `<span class="batch-frac">${formatFrac(p, q)}</span>` +
                    `<span class="batch-steps batch-ok">${r.path.length} steps</span>` +
                    `<span class="batch-path">${r.path.join(' ')}</span></div>`;
            } else {
                fail++;
                html += `<div class="batch-row">` +
                    `<span class="batch-frac">${formatFrac(p, q)}</span>` +
                    `<span class="batch-fail">FAIL</span></div>`;
            }
        }
    }

    const summary = `<div style="margin-bottom:8px;color:var(--success);font-weight:600;">` +
        `✓ ${ok} / ${ok + fail} rationals with q ≤ ${maxQ} successfully reduced to ∞.` +
        (fail > 0 ? ` <span style="color:var(--danger)">${fail} failures.</span>` : '') +
        `</div>`;
    out.innerHTML = summary + html;
}

// ─── Init ─────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reduce-btn').addEventListener('click', runReduction);
    document.getElementById('batch-btn').addEventListener('click', runBatch);

    document.getElementById('p-input').addEventListener('keydown', e => { if (e.key === 'Enter') runReduction(); });
    document.getElementById('q-input').addEventListener('keydown', e => { if (e.key === 'Enter') runReduction(); });

    // Auto-run with default values
    runReduction();
});

window.addEventListener('resize', () => {
    const canvas = document.getElementById('reduction-canvas');
    if (canvas && canvas._lastResult) drawReductionCanvas(canvas._lastResult);
});
