// ═══════════════════════════════════════════════════════════
// ℝ²/ℤ² — Lattice Action on the Plane
// ═══════════════════════════════════════════════════════════

// ── COLORS ──
const C = {
    bg: '#060a14', text: '#f1f5f9', muted: '#94a3b8', dim: '#475569',
    accent: '#7c8aff', teal: '#2dd4bf', warm: '#f59e0b', rose: '#f472b6',
    purple: '#a78bfa', green: '#34d399',
    grid: 'rgba(148,163,184,0.10)', axis: 'rgba(148,163,184,0.28)',
};

const ANIM_MS = 700;
const GLUE_ANIM_MS = 5000;

// ── STEPS ──
const STEPS = [
    { desc: 'The plane \u211d\u00b2 \u2014 an infinite flat surface extending in all directions.' },
    { desc: 'The shift (x, y) \u21a6 (x + 1, y) moves every point one unit to the right \u2014 a rigid motion of the plane.' },
    { desc: 'The shift (x, y) \u21a6 (x, y + 1) moves every point one unit up \u2014 another rigid motion.' },
    { desc: 'Composing these shifts, we can translate by any integer vector (m, n). The group \u2124\u00b2 acts on \u211d\u00b2.' },
    { desc: 'The orbit of (0, 0) is the integer lattice: all points (m, n) with m, n \u2208 \u2124.' },
    { desc: 'Slide the lattice to the right. After shifting by exactly 1, every point lands on a lattice point \u2014 the orbit returns to itself.' },
    { desc: 'Each orbit has exactly one representative in the unit square [0, 1)\u00b2. The left and right edges are identified, as are the top and bottom.' },
    { desc: 'Gluing the left and right edges \u2014 the teal sides come together to form a cylinder.' },
    { desc: 'Now gluing the top and bottom edges \u2014 the rose ends of the cylinder meet, forming a torus.' },
    { desc: '\u211d\u00b2 / \u2124\u00b2 \u2245 T\u00b2. The space of orbits of \u211d\u00b2 under translation by \u2124\u00b2 is the torus.' },
];
const TOTAL = STEPS.length;

// ── STATE ──
let step = 0, t = 1, animStart = 0;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W = 800, H = 500;
let UNIT = 60;
let baseUnit = 60;
let viewCX = 0, viewCY = 0;

// ── EASING & MATH ──
function ease(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ── COORDINATE SYSTEM ──
function worldToScreen(wx, wy) {
    return {
        x: W / 2 + (wx - viewCX) * UNIT,
        y: H / 2 - (wy - viewCY) * UNIT,
    };
}
function screenToWorld(sx, sy) {
    return {
        x: (sx - W / 2) / UNIT + viewCX,
        y: -(sy - H / 2) / UNIT + viewCY,
    };
}

// ══════════════════════════════════════════════════════════
// DRAWING HELPERS
// ══════════════════════════════════════════════════════════

function drawGrid(alpha, offsetX, offsetY) {
    if (alpha === undefined) alpha = 1;
    if (offsetX === undefined) offsetX = 0;
    if (offsetY === undefined) offsetY = 0;
    ctx.globalAlpha = alpha;

    const tl = screenToWorld(0, 0);
    const br = screenToWorld(W, H);
    const iMin = Math.floor(tl.x - offsetX) - 1;
    const iMax = Math.ceil(br.x - offsetX) + 1;
    const jMin = Math.floor(br.y - offsetY) - 1;
    const jMax = Math.ceil(tl.y - offsetY) + 1;

    // Vertical grid lines
    for (let i = iMin; i <= iMax; i++) {
        const sx = worldToScreen(i + offsetX, 0).x;
        if (sx < -10 || sx > W + 10) continue;
        const isAxis = (i === 0);
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
        ctx.strokeStyle = isAxis ? C.axis : C.grid;
        ctx.lineWidth = isAxis ? 1.5 : 1;
        ctx.stroke();
    }

    // Horizontal grid lines
    for (let j = jMin; j <= jMax; j++) {
        const sy = worldToScreen(0, j + offsetY).y;
        if (sy < -10 || sy > H + 10) continue;
        const isAxis = (j === 0);
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy);
        ctx.strokeStyle = isAxis ? C.axis : C.grid;
        ctx.lineWidth = isAxis ? 1.5 : 1;
        ctx.stroke();
    }

    // X-axis labels (below the x-axis)
    const axisScreenY = worldToScreen(0, offsetY).y;
    ctx.textBaseline = 'top';
    for (let i = iMin; i <= iMax; i++) {
        const sx = worldToScreen(i + offsetX, 0).x;
        if (sx < 20 || sx > W - 20) continue;
        const isOrigin = (i === 0);
        ctx.font = (isOrigin ? '600 13' : '400 11') + 'px Inter, sans-serif';
        ctx.fillStyle = isOrigin ? C.text : C.dim;
        ctx.textAlign = 'center';
        ctx.fillText(i.toString(), sx, axisScreenY + 6);
    }

    // Y-axis labels (left of the y-axis)
    const axisScreenX = worldToScreen(offsetX, 0).x;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let j = jMin; j <= jMax; j++) {
        if (j === 0) continue;
        const sy = worldToScreen(0, j + offsetY).y;
        if (sy < 20 || sy > H - 20) continue;
        ctx.font = '400 11px Inter, sans-serif';
        ctx.fillStyle = C.dim;
        ctx.fillText(j.toString(), axisScreenX - 8, sy);
    }

    ctx.globalAlpha = 1;
}

function drawPoint2D(wx, wy, r, fillColor, glowColor, alpha, label, labelPos) {
    if (alpha === undefined) alpha = 1;
    const s = worldToScreen(wx, wy);
    if (s.x < -50 || s.x > W + 50 || s.y < -50 || s.y > H + 50) return;
    ctx.globalAlpha = alpha;

    if (glowColor) {
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3);
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fillColor; ctx.fill();
    ctx.strokeStyle = glowColor || fillColor; ctx.lineWidth = 1.5; ctx.stroke();

    if (label) {
        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        const above = (!labelPos || labelPos === 'above');
        ctx.textBaseline = above ? 'bottom' : 'top';
        ctx.fillText(label, s.x, above ? s.y - r - 6 : s.y + r + 6);
    }
    ctx.globalAlpha = 1;
}

function drawArrow2D(wx1, wy1, wx2, wy2, color, width, alpha) {
    if (width === undefined) width = 2;
    if (alpha === undefined) alpha = 1;
    const s1 = worldToScreen(wx1, wy1);
    const s2 = worldToScreen(wx2, wy2);
    const dx = s2.x - s1.x, dy = s2.y - s1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x - ux * 8, s2.y - uy * 8);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s2.x, s2.y);
    ctx.lineTo(s2.x - ux * 10 + uy * 5, s2.y - uy * 10 - ux * 5);
    ctx.lineTo(s2.x - ux * 10 - uy * 5, s2.y - uy * 10 + ux * 5);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1;
}

function drawText(txt, x, y, size, color, alpha, align) {
    if (alpha === undefined) alpha = 1;
    if (align === undefined) align = 'center';
    ctx.globalAlpha = alpha;
    ctx.font = '600 ' + size + 'px Inter, sans-serif';
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
    ctx.globalAlpha = 1;
}

function drawLatticePoints(offsetX, offsetY, color, glowColor, alpha, baseR) {
    if (offsetX === undefined) offsetX = 0;
    if (offsetY === undefined) offsetY = 0;
    if (color === undefined) color = C.accent;
    if (glowColor === undefined) glowColor = 'rgba(124,138,255,0.3)';
    if (alpha === undefined) alpha = 1;
    if (baseR === undefined) baseR = 5;

    const tl = screenToWorld(0, 0);
    const br = screenToWorld(W, H);
    const iMin = Math.floor(tl.x - offsetX) - 1;
    const iMax = Math.ceil(br.x - offsetX) + 1;
    const jMin = Math.floor(br.y - offsetY) - 1;
    const jMax = Math.ceil(tl.y - offsetY) + 1;

    for (let i = iMin; i <= iMax; i++) {
        for (let j = jMin; j <= jMax; j++) {
            drawPoint2D(i + offsetX, j + offsetY, baseR, color, glowColor, alpha);
        }
    }
}

// ══════════════════════════════════════════════════════════
// RENDER STEPS
// ══════════════════════════════════════════════════════════

function render(now) {
    var duration = (step === 7 || step === 8) ? GLUE_ANIM_MS : ANIM_MS;
    if (t < 1) t = Math.min(1, (now - animStart) / duration);
    var e = ease(t);

    // Reset view each frame (steps may override)
    UNIT = baseUnit;
    viewCX = 0; viewCY = 0;

    ctx.clearRect(0, 0, W, H);

    switch (step) {
        case 0: renderPlane(e); break;
        case 1: renderShiftRight(e); break;
        case 2: renderShiftUp(e); break;
        case 3: renderCompositions(e); break;
        case 4: renderOrbit(e); break;
        case 5: renderSliding(e); break;
        case 6: renderZoomSquare(e); break;
        case 7: renderGlueCylinder(e); break;
        case 8: renderGlueTorus(e); break;
        case 9: renderFinalTorus(e); break;
    }

    requestAnimationFrame(render);
}

// ── Step 0: The Plane ──
function renderPlane(e) {
    drawGrid(e);
    const s = worldToScreen(0, 0);
    drawText('\u211d\u00b2', s.x + 24, s.y - 22, 28, C.accent, e);
}

// ── Step 1: Shift Right ──
function renderShiftRight(e) {
    const slideX = e;
    drawGrid(Math.max(0.12, 1 - e * 1.2)); // ghost
    drawGrid(1, slideX, 0); // sliding

    // Shift arrow (on the sliding grid's origin)
    if (e < 0.95) {
        const a = Math.min(1, e * 3);
        drawArrow2D(slideX * 0.3, 0.4, slideX * 0.3 + 0.6, 0.4, C.teal, 2.5, a * 0.8);
    }

    drawText('(x, y) \u21a6 (x + 1, y)', W / 2, H * 0.88, 18, C.teal, e);
}

// ── Step 2: Shift Up ──
function renderShiftUp(e) {
    var slideY = e;
    drawGrid(Math.max(0.12, 1 - e * 1.2)); // ghost
    drawGrid(1, 0, slideY); // sliding

    if (e < 0.95) {
        var a = Math.min(1, e * 3);
        drawArrow2D(-0.4, slideY * 0.3, -0.4, slideY * 0.3 + 0.6, C.rose, 2.5, a * 0.8);
    }

    drawText('(x, y) \u21a6 (x, y + 1)', W / 2, H * 0.88, 18, C.rose, e);
}

// ── Step 3: Compositions ──
function renderCompositions(e) {
    drawGrid();

    // Origin dot
    drawPoint2D(0, 0, 6, C.accent, 'rgba(124,138,255,0.3)', 1);

    var targets = [
        { m: 1,  n: 0,  col: C.teal,   delay: 0 },
        { m: 0,  n: 1,  col: C.rose,   delay: 0.06 },
        { m: -1, n: 0,  col: C.teal,   delay: 0.12 },
        { m: 0,  n: -1, col: C.rose,   delay: 0.18 },
        { m: 1,  n: 1,  col: C.warm,   delay: 0.26 },
        { m: -1, n: 1,  col: C.purple, delay: 0.34 },
        { m: 2,  n: 1,  col: C.green,  delay: 0.42 },
        { m: -1, n: -2, col: C.warm,   delay: 0.50 },
        { m: 3,  n: -1, col: C.purple, delay: 0.58 },
        { m: -2, n: 3,  col: C.green,  delay: 0.66 },
    ];

    for (var i = 0; i < targets.length; i++) {
        var T = targets[i];
        var localE = ease(Math.max(0, Math.min(1, (e - T.delay) / 0.3)));
        if (localE <= 0) continue;

        drawArrow2D(0, 0, T.m, T.n, T.col, 2, localE * 0.7);
        drawPoint2D(T.m, T.n, 4, T.col, T.col, localE);

        // Coordinate label near the target point
        var s = worldToScreen(T.m, T.n);
        ctx.globalAlpha = localE;
        ctx.font = '500 11px Inter, sans-serif';
        ctx.fillStyle = T.col;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('(' + T.m + ', ' + T.n + ')', s.x + 10, s.y - 8);
        ctx.globalAlpha = 1;
    }

    drawText('\u2124\u00b2 acts on \u211d\u00b2 by translation', W / 2, H * 0.90, 16, C.accent, e);
}

// ── Step 4: Orbit of Origin ──
function renderOrbit(e) {
    drawGrid();

    // Lattice points expanding outward from origin
    var tl = screenToWorld(0, 0);
    var br = screenToWorld(W, H);
    var iMin = Math.floor(tl.x) - 1;
    var iMax = Math.ceil(br.x) + 1;
    var jMin = Math.floor(br.y) - 1;
    var jMax = Math.ceil(tl.y) + 1;

    var maxDist = 0;
    for (var i = iMin; i <= iMax; i++) {
        for (var j = jMin; j <= jMax; j++) {
            var d = Math.sqrt(i * i + j * j);
            if (d > maxDist) maxDist = d;
        }
    }

    for (var i = iMin; i <= iMax; i++) {
        for (var j = jMin; j <= jMax; j++) {
            var dist = Math.sqrt(i * i + j * j);
            var delay = dist / (maxDist + 1) * 0.7;
            var localE = ease(Math.max(0, Math.min(1, (e - delay) / 0.25)));
            if (localE <= 0) continue;

            var isOrigin = (i === 0 && j === 0);
            var r = isOrigin ? 7 : 5;
            drawPoint2D(i, j, r, C.accent, 'rgba(124,138,255,0.3)', localE);
        }
    }

    // Origin label
    drawPoint2D(0, 0, 8, C.accent, 'rgba(124,138,255,0.5)', e, '(0, 0)');

    drawText('Orbit of (0, 0) = \u2124\u00b2', W / 2, H * 0.90, 18, C.accent, e);
}

// ── Step 5: Sliding Orbit ──
function renderSliding(e) {
    drawGrid();

    // Auto-slide the lattice to the right, looping 0 \u2192 1
    var period = 4000; // ms for one full cycle
    var now = performance.now();
    var rawT = (now % period) / period;
    var slideX = rawT;

    // Draw lattice at offset
    drawLatticePoints(slideX, 0, C.accent, 'rgba(124,138,255,0.3)', 1, 5);

    // Highlight the fundamental domain [0,1)^2
    var s00 = worldToScreen(0, 0);
    var s11 = worldToScreen(1, 1);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = C.teal;
    ctx.fillRect(s00.x, s11.y, s11.x - s00.x, s00.y - s11.y);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5;
    ctx.strokeRect(s00.x, s11.y, s11.x - s00.x, s00.y - s11.y);
    ctx.globalAlpha = 1;

    // Label for [0,1)^2
    drawText('[0, 1)\u00b2', (s00.x + s11.x) / 2, s11.y - 14, 13, C.teal);

    // Highlight the lattice point inside [0,1)^2
    var repX = slideX % 1;
    drawPoint2D(repX, 0, 7, C.teal, 'rgba(45,212,191,0.4)', 1);

    // Offset readout
    drawText('offset = (' + slideX.toFixed(2) + ', 0)', W / 2, H * 0.90, 14, C.accent);

    // "Same orbit!" flash when offset is near 0 or 1
    if (slideX > 0.92 || slideX < 0.08) {
        var dist = slideX > 0.5 ? 1 - slideX : slideX;
        var flash = Math.max(0, 1 - dist * 13);
        drawText('Same orbit!', W / 2, H * 0.10, 24, C.warm, flash);
    }
}

// ── Step 6: Zoom into Unit Square ──
function renderZoomSquare(e) {
    // Animate zoom into [0,1]² centered at (0.5, 0.5)
    var targetUnit = Math.min(W, H) * 0.38;
    UNIT = lerp(baseUnit, targetUnit, e);
    viewCX = lerp(0, 0.5, e);
    viewCY = lerp(0, 0.5, e);

    drawGrid();

    // Fundamental domain fill
    var s00 = worldToScreen(0, 0);
    var s11 = worldToScreen(1, 1);
    var sqW = s11.x - s00.x, sqH = s00.y - s11.y;
    ctx.globalAlpha = 0.06 * e;
    ctx.fillStyle = C.accent;
    ctx.fillRect(s00.x, s11.y, sqW, sqH);
    ctx.globalAlpha = 1;

    // Lattice points
    drawLatticePoints(0, 0, C.accent, 'rgba(124,138,255,0.25)', e * 0.5, 4);

    // Edge highlights — left/right in teal, top/bottom in rose
    var edgeAlpha = ease(Math.max(0, (e - 0.3) / 0.5));

    // Left edge (x=0)
    ctx.globalAlpha = edgeAlpha;
    ctx.strokeStyle = C.teal; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s00.x, s00.y); ctx.lineTo(s00.x, s11.y); ctx.stroke();
    // Right edge (x=1)
    ctx.beginPath(); ctx.moveTo(s11.x, s00.y); ctx.lineTo(s11.x, s11.y); ctx.stroke();
    // Bottom edge (y=0)
    ctx.strokeStyle = C.rose;
    ctx.beginPath(); ctx.moveTo(s00.x, s00.y); ctx.lineTo(s11.x, s00.y); ctx.stroke();
    // Top edge (y=1)
    ctx.beginPath(); ctx.moveTo(s00.x, s11.y); ctx.lineTo(s11.x, s11.y); ctx.stroke();
    ctx.globalAlpha = 1;

    // Identification arrows
    var arrowAlpha = ease(Math.max(0, (e - 0.5) / 0.4));
    if (arrowAlpha > 0.01) {
        // Left↔Right curved arrow above
        var midY = (s00.y + s11.y) / 2;
        var arcR = sqW / 2;
        ctx.globalAlpha = arrowAlpha * 0.6;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((s00.x + s11.x) / 2, s11.y - 10, arcR, Math.PI * 0.05, Math.PI * 0.95);
        ctx.stroke();
        ctx.setLineDash([]);
        drawText('\u2261', (s00.x + s11.x) / 2, s11.y - arcR - 18, 18, C.teal, arrowAlpha);

        // Top↔Bottom curved arrow on the right
        var arcR2 = sqH / 2;
        ctx.globalAlpha = arrowAlpha * 0.6;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = C.rose; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s11.x + 10, (s00.y + s11.y) / 2, arcR2, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.stroke();
        ctx.setLineDash([]);
        drawText('\u2261', s11.x + arcR2 + 18, (s00.y + s11.y) / 2, 18, C.rose, arrowAlpha);
        ctx.globalAlpha = 1;
    }

    drawText('[0, 1)\u00b2', (s00.x + s11.x) / 2, (s00.y + s11.y) / 2, 20, C.accent, e);
}

// ══════════════════════════════════════════════════════════
// THREE.JS TORUS SCENE (Steps 7–8)
// ══════════════════════════════════════════════════════════

var glCanvas = document.getElementById('gl-canvas');
var tScene, tCamera, tRenderer;
var tInited = false;
var surfaceGeo, surfaceMesh, gridLines, edgeLines;

var SEG = 48;
var FLAT_SIZE = 3.0;
var TORUS_R = 1.2; // major radius (ring center → tube center)
// tube radius r = FLAT_SIZE / (2π) ≈ 0.477, derived from isometric bending

function torusVertexPos(s, t, cyl, tor) {
    // ── Phase 1: Bend s-direction into tube (isometric curvature bending) ──
    // Curvature κ₁ goes from 0 (flat) to 2π/L (closed cylinder).
    // At intermediate values the sheet is a partial circular arc — always embedded.
    var L = FLAT_SIZE;
    var K1 = cyl * 2 * Math.PI / L;
    var d1 = (s - 0.5) * L;
    var a1 = K1 * d1; // angle from midpoint

    var cross_x, cross_y, axH;
    if (K1 < 1e-6) {
        cross_x = d1;
        cross_y = 0;
        axH = 0;
    } else {
        var R1 = 1 / K1;
        // Bending: midpoint (s=0.5) stays at origin, sheet arcs upward
        cross_x = R1 * Math.sin(a1);
        axH = R1;
        cross_y = -R1 * Math.cos(a1); // offset from axis at y = axH
    }

    // ── Phase 2: Bend t-direction into ring ──
    // The cylinder axis (along z) curves into a circle of radius TORUS_R
    // in the xz-plane. Non-isometric: the sheet stretches to fit the ring.
    var beta = tor * 2 * Math.PI * (t - 0.5);
    var cos_b = Math.cos(beta), sin_b = Math.sin(beta);

    var ax_x, ax_z;
    if (tor < 1e-6) {
        ax_x = 0;
        ax_z = (t - 0.5) * L;
    } else {
        ax_x = TORUS_R * Math.sin(beta);
        // Smoothly blend from straight axis to circular arc
        ax_z = lerp((t - 0.5) * L, TORUS_R * (1 - Math.cos(beta)), tor);
    }

    // Rotate cross-section to stay perpendicular to the curving axis
    var px = ax_x + cross_x * cos_b;
    var py = axH * (1 - tor) + cross_y; // gradually center y as torus forms
    var pz = ax_z - cross_x * sin_b - TORUS_R * tor; // center z

    return [px, py, pz];
}

function initTorus() {
    if (tInited) return;
    tInited = true;

    tScene = new THREE.Scene();
    tCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    tCamera.position.set(0, 2.5, 4.5);
    tCamera.lookAt(0, 0.3, 0);

    tRenderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
    tRenderer.setClearColor(0x060a14, 1);
    tRenderer.setPixelRatio(window.devicePixelRatio);

    tScene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var dLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dLight.position.set(3, 5, 4);
    tScene.add(dLight);
    var dLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dLight2.position.set(-3, -2, -3);
    tScene.add(dLight2);

    buildTorusMeshes();
}

function buildTorusMeshes() {
    var S = SEG;
    var vertCount = (S + 1) * (S + 1);

    // Surface geometry
    surfaceGeo = new THREE.BufferGeometry();
    var positions = new Float32Array(vertCount * 3);

    for (var j = 0; j <= S; j++) {
        for (var i = 0; i <= S; i++) {
            var idx = j * (S + 1) + i;
            var s = i / S, t = j / S;
            var p = torusVertexPos(s, t, 0, 0);
            positions[idx * 3] = p[0];
            positions[idx * 3 + 1] = p[1];
            positions[idx * 3 + 2] = p[2];
        }
    }

    surfaceGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    var indices = [];
    for (var j = 0; j < S; j++) {
        for (var i = 0; i < S; i++) {
            var a = j * (S + 1) + i;
            var b = a + 1;
            var c = a + (S + 1);
            var d = c + 1;
            indices.push(a, b, c, c, b, d);
        }
    }
    surfaceGeo.setIndex(indices);
    surfaceGeo.computeVertexNormals();

    // Dark surface matching the 2D canvas background
    surfaceMesh = new THREE.Mesh(surfaceGeo, new THREE.MeshStandardMaterial({
        color: 0x151d2e,
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
    }));
    tScene.add(surfaceMesh);

    // Grid wireframe (shares position buffer) — matches 2D grid aesthetic
    var gridIdx = [];
    var gridStep = Math.max(1, Math.round(S / 8));
    for (var j = 0; j <= S; j += gridStep) {
        for (var i = 0; i < S; i++) {
            gridIdx.push(j * (S + 1) + i, j * (S + 1) + i + 1);
        }
    }
    for (var i = 0; i <= S; i += gridStep) {
        for (var j = 0; j < S; j++) {
            gridIdx.push(j * (S + 1) + i, (j + 1) * (S + 1) + i);
        }
    }
    var gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', surfaceGeo.attributes.position);
    gridGeo.setIndex(gridIdx);
    gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
        color: 0x94a3b8, transparent: true, opacity: 0.18,
    }));
    tScene.add(gridLines);

    // Boundary edge highlights
    var leftIdx = [], rightIdx = [], botIdx = [], topIdx = [];
    for (var j = 0; j < S; j++) {
        leftIdx.push(j * (S + 1), (j + 1) * (S + 1));
        rightIdx.push(j * (S + 1) + S, (j + 1) * (S + 1) + S);
    }
    for (var i = 0; i < S; i++) {
        botIdx.push(i, i + 1);  // row j=0
        topIdx.push(S * (S + 1) + i, S * (S + 1) + i + 1);  // row j=S
    }
    function makeEdgeLine(idx, color) {
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', surfaceGeo.attributes.position);
        g.setIndex(idx);
        var l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: color, linewidth: 2 }));
        tScene.add(l);
        return l;
    }
    edgeLines = {
        left: makeEdgeLine(leftIdx, 0x2dd4bf),
        right: makeEdgeLine(rightIdx, 0x2dd4bf),
        bottom: makeEdgeLine(botIdx, 0xf472b6),
        top: makeEdgeLine(topIdx, 0xf472b6),
    };
}

function updateTorusGeometry(cyl, tor) {
    var S = SEG;
    var posAttr = surfaceGeo.attributes.position;
    for (var j = 0; j <= S; j++) {
        for (var i = 0; i <= S; i++) {
            var idx = j * (S + 1) + i;
            var s = i / S, t = j / S;
            var p = torusVertexPos(s, t, cyl, tor);
            posAttr.setXYZ(idx, p[0], p[1], p[2]);
        }
    }
    posAttr.needsUpdate = true;
    surfaceGeo.computeVertexNormals();
}

function resizeTorus() {
    if (!tRenderer) return;
    var rect = glCanvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    glCanvas.width = rect.width * dpr;
    glCanvas.height = rect.height * dpr;
    tRenderer.setSize(rect.width, rect.height);
    tCamera.aspect = rect.width / rect.height;
    tCamera.updateProjectionMatrix();
}

function showGLCanvas(show) {
    glCanvas.style.display = show ? 'block' : 'none';
}

// ── Step 7: Glue left/right → Cylinder ──
function renderGlueCylinder(e) {
    initTorus();
    resizeTorus();
    showGLCanvas(true);
    canvas.style.transition = 'opacity 0.5s';
    canvas.style.opacity = '0';

    // e: 0→0.1 hold flat, 0.1→0.85 roll, 0.85→1 hold cylinder
    var cylFrac = 0;
    if (e < 0.1) cylFrac = 0;
    else if (e < 0.85) cylFrac = ease((e - 0.1) / 0.75);
    else cylFrac = 1;

    updateTorusGeometry(cylFrac, 0);

    // Teal edges fade as they merge
    if (edgeLines) {
        edgeLines.left.material.opacity = 1 - cylFrac * 0.7;
        edgeLines.right.material.opacity = 1 - cylFrac * 0.7;
        edgeLines.left.material.transparent = true;
        edgeLines.right.material.transparent = true;
        edgeLines.bottom.material.opacity = 1;
        edgeLines.top.material.opacity = 1;
        edgeLines.bottom.material.transparent = false;
        edgeLines.top.material.transparent = false;
    }

    // Camera — track the geometry center (axis rises as sheet bends)
    var r_tube = FLAT_SIZE / (2 * Math.PI);
    var geoCenterY = r_tube * cylFrac; // axis height during bending
    var now = performance.now() * 0.00025;
    var camDist = 4.5;
    var camY = geoCenterY + lerp(3.0, 2.0, cylFrac);
    tCamera.position.set(
        camDist * Math.sin(now + Math.PI * 0.25),
        camY,
        camDist * Math.cos(now + Math.PI * 0.25)
    );
    tCamera.lookAt(0, geoCenterY, 0);

    tRenderer.render(tScene, tCamera);

    // 2D overlay
    ctx.clearRect(0, 0, W, H);
    if (cylFrac > 0.8) {
        var a = ease((cylFrac - 0.8) / 0.2);
        drawText('Cylinder', W / 2, H * 0.90, 20, C.teal, a);
    }
}

// ── Step 8: Glue top/bottom → Torus ──
function renderGlueTorus(e) {
    initTorus();
    resizeTorus();
    showGLCanvas(true);
    canvas.style.opacity = '0';

    // e: 0→0.1 hold cylinder, 0.1→0.85 bend, 0.85→1 hold torus
    var torFrac = 0;
    if (e < 0.1) torFrac = 0;
    else if (e < 0.85) torFrac = ease((e - 0.1) / 0.75);
    else torFrac = 1;

    updateTorusGeometry(1, torFrac);

    // Rose edges fade as they merge; teal already merged
    if (edgeLines) {
        edgeLines.left.material.opacity = 0.3;
        edgeLines.right.material.opacity = 0.3;
        edgeLines.left.material.transparent = true;
        edgeLines.right.material.transparent = true;
        edgeLines.bottom.material.opacity = 1 - torFrac * 0.7;
        edgeLines.top.material.opacity = 1 - torFrac * 0.7;
        edgeLines.bottom.material.transparent = true;
        edgeLines.top.material.transparent = true;
    }

    // Camera — geometry centers at y as tor increases
    var r_tube = FLAT_SIZE / (2 * Math.PI);
    var geoCenterY = r_tube * (1 - torFrac); // axis lowers to 0 as torus forms
    var geoCenterZ = -TORUS_R * torFrac; // z shifts as ring centers
    var now = performance.now() * 0.00025;
    var camDist = lerp(4.5, 5.0, torFrac);
    var camY = geoCenterY + lerp(2.0, 2.2, torFrac);
    tCamera.position.set(
        camDist * Math.sin(now + Math.PI * 0.25),
        camY,
        geoCenterZ + camDist * Math.cos(now + Math.PI * 0.25)
    );
    tCamera.lookAt(0, geoCenterY, geoCenterZ);

    tRenderer.render(tScene, tCamera);

    // 2D overlay
    ctx.clearRect(0, 0, W, H);
    if (torFrac > 0.8) {
        var a = ease((torFrac - 0.8) / 0.2);
        drawText('T\u00b2', W / 2, H * 0.88, 28, C.accent, a);
    }
}

// ── Step 9: Final Torus ──
function renderFinalTorus(e) {
    initTorus();
    resizeTorus();
    showGLCanvas(true);
    canvas.style.opacity = '0';

    updateTorusGeometry(1, 1);

    if (edgeLines) {
        edgeLines.left.material.opacity = 0.3;
        edgeLines.right.material.opacity = 0.3;
        edgeLines.bottom.material.opacity = 0.3;
        edgeLines.top.material.opacity = 0.3;
        edgeLines.left.material.transparent = true;
        edgeLines.right.material.transparent = true;
        edgeLines.bottom.material.transparent = true;
        edgeLines.top.material.transparent = true;
    }

    // Gentle orbit — torus centered at (0, 0, -TORUS_R)
    var now = performance.now() * 0.0003;
    var camDist = 5.0;
    var cz = -TORUS_R;
    tCamera.position.set(
        camDist * Math.sin(now),
        2.2 + Math.sin(now * 0.7) * 0.3,
        cz + camDist * Math.cos(now)
    );
    tCamera.lookAt(0, 0, cz);

    tRenderer.render(tScene, tCamera);

    // 2D overlay
    ctx.clearRect(0, 0, W, H);
    drawText('\u211d\u00b2 / \u2124\u00b2  \u2245  T\u00b2', W / 2, H * 0.88, 28, C.accent, e);
    if (e > 0.4) {
        var a = ease((e - 0.4) / 0.6);
        drawText('The space of orbits is the torus', W / 2, H * 0.93, 14, C.muted, a);
    }
}

// ══════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════
function goTo(n) {
    if (n < 0 || n >= TOTAL) return;
    // Hide GL canvas when leaving 3D steps
    var was3D = step >= 7 && step <= 9;
    var will3D = n >= 7 && n <= 9;
    if (was3D && !will3D) {
        showGLCanvas(false);
        canvas.style.opacity = '1';
    }
    step = n; t = 0; animStart = performance.now();
    updateUI();
}
window.next = function() { goTo(step + 1); };
window.prev = function() { goTo(step - 1); };

function updateUI() {
    document.getElementById('description').textContent = STEPS[step].desc;
    document.getElementById('prev-btn').disabled = step === 0;
    document.getElementById('next-btn').disabled = step === TOTAL - 1;

    var dotsEl = document.getElementById('dots');
    dotsEl.innerHTML = '';
    for (var i = 0; i < TOTAL; i++) {
        var d = document.createElement('div');
        d.className = 'dot' + (i === step ? ' active' : '');
        d.onclick = (function(idx) { return function() { goTo(idx); }; })(i);
        dotsEl.appendChild(d);
    }
}

// Keyboard nav
document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); window.prev(); }
});

// postMessage nav (for iframe embedding)
window.addEventListener('message', function(e) {
    if (e.data === 'next' || e.data === 'right') window.next();
    else if (e.data === 'prev' || e.data === 'left') window.prev();
    else if (typeof e.data === 'object' && e.data.type === 'goTo') goTo(e.data.step);
});

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
function resize() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width; H = rect.height;
    baseUnit = Math.max(30, Math.min(80, Math.min(W, H) / 10));
    UNIT = baseUnit;
}
window.addEventListener('resize', function() { resize(); if (tInited) resizeTorus(); });

resize();
updateUI();
requestAnimationFrame(render);
