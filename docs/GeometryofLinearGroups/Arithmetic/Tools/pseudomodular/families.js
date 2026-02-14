/**
 * families.js — Canvas illustrations for the Hyperbolic Jigsaws article
 */

const COLORS = {
    bg: '#0f172a',
    axis: '#4b5563',
    grid: '#1f2937',
    side1: '#6366f1',
    side2: '#8b5cf6',
    side3: '#a78bfa',
    match: '#34d399',
    cusp: '#fbbf24',
    cuspGlow: 'rgba(251,191,36,0.3)',
    text: '#9ca3af',
    textBright: '#e5e7eb',
    accent: '#818cf8',
    fill1: 'rgba(99,102,241,0.12)',
    fill2: 'rgba(139,92,246,0.12)',
    killerFill: 'rgba(99,102,241,0.25)',
    killerStroke: '#6366f1',
    covered: 'rgba(52,211,153,0.15)',
};

// ─── Utility ──────────────────────────────────────────────

function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
}

function drawSemicircle(ctx, cx, cy, r, color, lw) {
    if (r < 0.5 || r > 3000) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.stroke();
}

function drawFilledSemicircle(ctx, cx, cy, r, fillColor, strokeColor, lw) {
    if (r < 0.5 || r > 3000) return;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.stroke();
}

function drawDot(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawLabel(ctx, text, x, y, color, font, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = font || '11px Inter, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.fillText(text, x, y);
}

// ─── Figure 1: Jigsaw Tile ────────────────────────────────

function drawTileFigure() {
    const canvas = document.getElementById('tile-canvas');
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);

    const axisY = h * 0.78;
    const scale = w * 0.12;
    const ox = w * 0.5;

    // Ideal triangle with vertices at -2, 0, 3 on real axis
    const v = [-2, 0, 3];
    const px = v.map(x => ox + x * scale);

    // Draw real axis
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    // Edge colors for each side
    const edgeColors = [COLORS.side1, COLORS.side2, COLORS.side3];
    const kLabels = ['k₁', 'k₂', 'k₃'];

    // Draw geodesic edges (semicircles between vertices)
    const edges = [[0, 1], [1, 2], [0, 2]];
    edges.forEach(([i, j], idx) => {
        const a = v[i], b = v[j];
        const center = (a + b) / 2;
        const radius = Math.abs(b - a) / 2;
        const cx = ox + center * scale;
        const r = radius * scale;

        // Fill
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = edgeColors[idx];
        ctx.beginPath();
        ctx.arc(cx, axisY, r, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        drawSemicircle(ctx, cx, axisY, r, edgeColors[idx], 2);

        // Label the side parameter
        const angle = Math.PI * 0.5;
        const labelR = r * 0.6;
        const lx = cx;
        const ly = axisY - labelR;

        // Draw parameter label
        const labelOffsets = [{ x: -12, y: 8 }, { x: 12, y: 8 }, { x: 0, y: -10 }];
        drawLabel(ctx, kLabels[idx], lx + labelOffsets[idx].x, ly + labelOffsets[idx].y,
            edgeColors[idx], 'bold 13px Inter, sans-serif');
    });

    // Draw vertices with dots
    v.forEach((x, i) => {
        const vx = ox + x * scale;
        drawDot(ctx, vx, axisY, 5, COLORS.cusp);
        drawLabel(ctx, x.toString(), vx, axisY + 18, COLORS.textBright, '11px JetBrains Mono, monospace');
    });

    // Marked vertex indicators (small triangles)
    const markSides = [0, 1, 0]; // which vertex of each edge is marked
    edges.forEach(([i, j], idx) => {
        const markV = markSides[idx] === 0 ? v[i] : v[j];
        const mx = ox + markV * scale;
        ctx.fillStyle = edgeColors[idx];
        ctx.beginPath();
        ctx.moveTo(mx, axisY - 8);
        ctx.lineTo(mx - 4, axisY - 14);
        ctx.lineTo(mx + 4, axisY - 14);
        ctx.closePath();
        ctx.fill();
    });

    // Title
    drawLabel(ctx, 'Jigsaw Tile Δ(k₁, k₂, k₃)', w / 2, 24, COLORS.textBright, '13px Inter, sans-serif');

    // Balancing condition
    drawLabel(ctx, 'Balanced: k₁ · k₂ · k₃ = 1', w / 2, 46, COLORS.text, '11px Inter, sans-serif');
}

// ─── Figure 2: Gluing ─────────────────────────────────────

function drawGluingFigure() {
    const canvas = document.getElementById('gluing-canvas');
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);

    const axisY = h * 0.8;
    const scale = w * 0.065;
    const ox = w * 0.35;

    // Two triangles sharing an edge
    // Triangle 1: vertices at -3, 0, 2
    // Triangle 2: vertices at 0, 2, 5
    // Shared edge: 0 to 2

    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    // Triangle 1 edges: (-3,0), (0,2), (-3,2)
    const t1Edges = [[-3, 0], [0, 2], [-3, 2]];
    const t1Colors = [COLORS.side1, COLORS.match, COLORS.side3];

    t1Edges.forEach(([a, b], i) => {
        const center = (a + b) / 2, radius = Math.abs(b - a) / 2;
        const cx = ox + center * scale, r = radius * scale;
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = t1Colors[i];
        ctx.beginPath(); ctx.arc(cx, axisY, r, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        drawSemicircle(ctx, cx, axisY, r, t1Colors[i], i === 1 ? 3 : 1.5);
    });

    // Triangle 2 edges: (0,2) shared, (2,5), (0,5)
    const t2Edges = [[2, 5], [0, 5]];
    const t2Colors = [COLORS.side2, COLORS.side3];

    t2Edges.forEach(([a, b], i) => {
        const center = (a + b) / 2, radius = Math.abs(b - a) / 2;
        const cx = ox + center * scale, r = radius * scale;
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = t2Colors[i];
        ctx.beginPath(); ctx.arc(cx, axisY, r, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        drawSemicircle(ctx, cx, axisY, r, t2Colors[i], 1.5);
    });

    // Vertices
    [-3, 0, 2, 5].forEach(x => {
        drawDot(ctx, ox + x * scale, axisY, 4, COLORS.cusp);
        drawLabel(ctx, x.toString(), ox + x * scale, axisY + 16, COLORS.text, '10px JetBrains Mono, monospace');
    });

    // Gluing label
    const sharedCx = ox + 1 * scale;
    const sharedR = 1 * scale;
    drawLabel(ctx, 'shared edge (k = k\')', sharedCx, axisY - sharedR - 12,
        COLORS.match, 'bold 11px Inter, sans-serif');

    // Arrow showing "shear = log k"
    ctx.strokeStyle = COLORS.match;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sharedCx, axisY - sharedR - 6);
    ctx.lineTo(sharedCx, axisY - sharedR + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels for each triangle
    drawLabel(ctx, 'Δ', ox + (-1) * scale, axisY - 2 * scale + 20,
        COLORS.side1, 'bold 14px Inter, sans-serif');
    drawLabel(ctx, 'Δ\'', ox + 3 * scale, axisY - 1.5 * scale + 10,
        COLORS.side2, 'bold 14px Inter, sans-serif');

    // Result arrow
    const arrowX = w * 0.68;
    ctx.strokeStyle = COLORS.textBright;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(arrowX, h * 0.45);
    ctx.lineTo(arrowX + 30, h * 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX + 25, h * 0.45 - 6);
    ctx.lineTo(arrowX + 33, h * 0.45);
    ctx.lineTo(arrowX + 25, h * 0.45 + 6);
    ctx.closePath();
    ctx.fill();

    // Result: ideal quadrilateral
    const ox2 = w * 0.82;
    const quadVerts = [-2, 0, 1.5, 3.5];
    const quadEdges = [[-2, 0], [0, 1.5], [1.5, 3.5], [-2, 3.5]];
    const quadColors = [COLORS.side1, COLORS.side2, COLORS.side3, COLORS.accent];

    quadEdges.forEach(([a, b], i) => {
        const center = (a + b) / 2, radius = Math.abs(b - a) / 2;
        const cx = ox2 + center * (scale * 0.7), r = radius * (scale * 0.7);
        drawSemicircle(ctx, cx, axisY, r, quadColors[i], 1.5);
    });

    quadVerts.forEach(x => {
        drawDot(ctx, ox2 + x * (scale * 0.7), axisY, 3, COLORS.cusp);
    });

    drawLabel(ctx, 'Ideal quadrilateral', ox2, axisY + 28, COLORS.text, '10px Inter, sans-serif');

    // Title
    drawLabel(ctx, 'Gluing two tiles along a matching side', w * 0.35, 22, COLORS.textBright, '12px Inter, sans-serif');
}

// ─── Figure 3: Killer Intervals ───────────────────────────

function drawKillerFigure() {
    const canvas = document.getElementById('killer-canvas');
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);

    const axisY = h * 0.72;
    const scale = w * 0.08;
    const ox = w * 0.12;

    // Draw real axis
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(20, axisY);
    ctx.lineTo(w - 20, axisY);
    ctx.stroke();

    // Draw killer intervals as Ford-circle-like semicircles
    // Cusp p/q → semicircle of radius proportional to 1/q²
    const cusps = [
        { p: 0, q: 1 }, { p: 1, q: 1 }, { p: 2, q: 1 }, { p: 3, q: 1 }, { p: 4, q: 1 }, { p: 5, q: 1 },
        { p: 6, q: 1 }, { p: 7, q: 1 }, { p: 8, q: 1 }, { p: 9, q: 1 }, { p: 10, q: 1 },
        { p: 1, q: 2 }, { p: 3, q: 2 }, { p: 5, q: 2 }, { p: 7, q: 2 }, { p: 9, q: 2 },
        { p: 1, q: 3 }, { p: 2, q: 3 }, { p: 4, q: 3 }, { p: 5, q: 3 }, { p: 7, q: 3 }, { p: 8, q: 3 },
        { p: 1, q: 4 }, { p: 3, q: 4 }, { p: 5, q: 4 }, { p: 7, q: 4 },
        { p: 1, q: 5 }, { p: 2, q: 5 }, { p: 3, q: 5 }, { p: 4, q: 5 }, { p: 6, q: 5 }, { p: 7, q: 5 }, { p: 8, q: 5 }, { p: 9, q: 5 },
    ];

    const tau = 1; // unit Ford circles

    // Covered background for [0, 2τ]
    const x0 = ox;
    const x2t = ox + 10 * scale;
    ctx.fillStyle = COLORS.covered;
    ctx.fillRect(x0, axisY - h * 0.6, x2t - x0, h * 0.6);

    // Draw intervals
    cusps.forEach(({ p, q }) => {
        const x = p / q;
        if (x < -0.5 || x > 10.5) return;
        const halfW = tau / (q * q);
        const cx = ox + x * scale;
        const r = halfW * scale;

        const t = Math.min(q / 5, 1);
        const hue = 240 + t * 40;
        const fillColor = `hsla(${hue}, 70%, 60%, 0.15)`;
        const strokeColor = `hsla(${hue}, 70%, 60%, 0.6)`;

        drawFilledSemicircle(ctx, cx, axisY, r, fillColor, strokeColor, 1);

        // Cusp dot
        drawDot(ctx, cx, axisY, q <= 2 ? 3 : 2, COLORS.cusp);
    });

    // Tick marks
    for (let i = 0; i <= 10; i++) {
        const px = ox + i * scale;
        ctx.strokeStyle = COLORS.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, axisY - 4);
        ctx.lineTo(px, axisY + 4);
        ctx.stroke();
        drawLabel(ctx, i.toString(), px, axisY + 16, COLORS.text, '10px JetBrains Mono, monospace');
    }

    // Annotations
    drawLabel(ctx, 'width ~ 1/q²', w * 0.75, 30, COLORS.accent, '12px Inter, sans-serif');

    // Arrow pointing to a specific interval
    const annotCx = ox + 0.5 * scale;
    const annotR = 1 * scale;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(w * 0.75, 40);
    ctx.lineTo(annotCx + annotR * 0.5, axisY - annotR * 0.8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels for some cusp fractions
    const labelCusps = [{ p: 0, q: 1, l: '0' }, { p: 1, q: 1, l: '1' }, { p: 1, q: 2, l: '½' }, { p: 1, q: 3, l: '⅓' }, { p: 2, q: 3, l: '⅔' }];
    labelCusps.forEach(({ p, q, l }) => {
        const cx = ox + (p / q) * scale;
        const r = tau / (q * q) * scale;
        drawLabel(ctx, l, cx, axisY - r - 6, COLORS.cusp, '10px JetBrains Mono, monospace');
    });

    drawLabel(ctx, 'Killer intervals (Ford circles for PSL(2,ℤ))', w / 2, h - 12, COLORS.text, '11px Inter, sans-serif');
}

// ─── Initialize ───────────────────────────────────────────

function initFigures() {
    drawTileFigure();
    drawGluingFigure();
    drawKillerFigure();
}

window.addEventListener('DOMContentLoaded', initFigures);
window.addEventListener('resize', initFigures);
