/* ================================================================
   Spaces — Step-through Slideshow
   ================================================================
   7 slides, each showing one model of a metric space:
     0. The Line   (ℝ)
     1. The Plane   (ℝ²)
     2. 3-Space     (ℝ³)
     3. The Sphere  (S²)
     4. A Tree      (iframe → treeIsoms)
     5. Escher      (image)
     6. Product     (iframe → productOfTrees)
   ================================================================ */

(() => {
    'use strict';

    /* ── Palette ────────────────────────────────────────── */
    const C = {
        bg:       '#060a14',
        grid:     'rgba(124,138,255,0.07)',
        gridBold: 'rgba(124,138,255,0.14)',
        accent:   '#7c8aff',
        warm:     '#f59e0b',
        teal:     '#2dd4bf',
        rose:     '#f472b6',
        violet:   '#a78bfa',
        text:     '#94a3b8',
        dim:      'rgba(124,138,255,0.25)',
        white:    '#f1f5f9',
        line:     'rgba(124,138,255,0.4)',
        muted:    '#64748b',
    };

    const TAU = Math.PI * 2;
    const dpr = window.devicePixelRatio || 1;

    /* ── Steps ──────────────────────────────────────────── */
    const STEPS = [
        { id: 'canvas-line',    desc: 'ℝ — the real number line. Distance = |x − y|.' },
        { id: 'canvas-plane',   desc: 'ℝ² — the Euclidean plane. Distance = √(Δx² + Δy²).' },
        { id: 'canvas-3space',  desc: 'ℝ³ — three-dimensional Euclidean space.' },
        { id: 'canvas-sphere',  desc: 'S² — the sphere. Distance = great circle arc length.' },
        { id: 'slide-tree',     desc: 'A tree — distance = number of edges on the unique path.' },
        { id: 'slide-escher',   desc: 'ℍ² — hyperbolic space. Escher\'s Circle Limit IV.' },
        { id: 'slide-product',  desc: 'T₃ × T₄ — the product of two trees.' },
    ];
    const TOTAL = STEPS.length;

    /* ── State ──────────────────────────────────────────── */
    let step = 0;

    /* ── Canvas setup ──────────────────────────────────── */
    const canvases = {};

    function setupCanvas(id) {
        const canvas = document.getElementById(id);
        if (!canvas || canvas.tagName !== 'CANVAS') return null;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { canvas, ctx, w: rect.width, h: rect.height };
    }

    function initCanvases() {
        canvases.line    = setupCanvas('canvas-line');
        canvases.plane   = setupCanvas('canvas-plane');
        canvases.space3d = setupCanvas('canvas-3space');
        canvases.sphere  = setupCanvas('canvas-sphere');
    }

    /* ── Glowing dot helper ────────────────────────────── */
    function drawGlowDot(ctx, x, y, r, color) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, color);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill();
    }

    function seededRand(seed) {
        let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    /* ──────────────────────────────────────────────────────
       0. THE LINE
       ────────────────────────────────────────────────────── */
    function drawLine(time) {
        const s = canvases.line;
        if (!s) return;
        const { ctx, w, h } = s;
        ctx.clearRect(0, 0, w, h);

        const cy = h / 2;
        const margin = 40;
        const spacing = (w - 2 * margin) / 12;

        // Grid
        ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
        for (let i = 0; i <= 12; i++) {
            const x = margin + i * spacing;
            ctx.beginPath(); ctx.moveTo(x, cy - 80); ctx.lineTo(x, cy + 80); ctx.stroke();
        }

        // Main axis
        ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(margin, cy); ctx.lineTo(w - margin, cy); ctx.stroke();

        // Ticks & labels
        ctx.fillStyle = C.text;
        ctx.font = '500 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (let i = -6; i <= 6; i++) {
            const x = w / 2 + i * spacing;
            ctx.strokeStyle = (i === 0) ? C.accent : C.dim;
            ctx.lineWidth = (i === 0) ? 2.5 : 1;
            ctx.beginPath(); ctx.moveTo(x, cy - 8); ctx.lineTo(x, cy + 8); ctx.stroke();
            if (i % 2 === 0) ctx.fillText(i.toString(), x, cy + 14);
        }

        // Arrows
        ctx.fillStyle = C.dim;
        ctx.beginPath(); ctx.moveTo(margin, cy); ctx.lineTo(margin + 10, cy - 6); ctx.lineTo(margin + 10, cy + 6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w - margin, cy); ctx.lineTo(w - margin - 10, cy - 6); ctx.lineTo(w - margin - 10, cy + 6); ctx.fill();

        // Animated distance
        const t = time * 0.0006;
        const px = w / 2 + Math.sin(t) * spacing * 3;
        const qx = w / 2 + Math.cos(t * 0.7 + 1) * spacing * 2;

        ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(px, cy - 25); ctx.lineTo(qx, cy - 25); ctx.stroke();
        ctx.setLineDash([]);

        const dist = Math.abs(px - qx) / spacing;
        ctx.fillStyle = C.teal;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`d = ${dist.toFixed(1)}`, (px + qx) / 2, cy - 30);

        drawGlowDot(ctx, px, cy, 7, C.accent);
        drawGlowDot(ctx, qx, cy, 7, C.teal);
    }

    /* ──────────────────────────────────────────────────────
       1. THE PLANE
       ────────────────────────────────────────────────────── */
    function drawPlane(time) {
        const s = canvases.plane;
        if (!s) return;
        const { ctx, w, h } = s;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const cell = Math.min(w, h) / 10;

        // Grid
        ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
        for (let x = cx % cell; x < w; x += cell) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = cy % cell; y < h; y += cell) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = C.gridBold; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

        // Animated distance
        const t = time * 0.0004;
        const ax = cx + Math.cos(t) * cell * 2.5;
        const ay = cy + Math.sin(t * 1.3) * cell * 1.8;
        const bx = cx + Math.cos(t + 2.5) * cell * 2;
        const by = cy + Math.sin(t * 0.8 + 1.5) * cell * 2.2;

        // Right-angle construction
        ctx.strokeStyle = 'rgba(124,138,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.fillStyle = 'rgba(124,138,255,0.4)';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('Δx', (ax + bx) / 2, ay - 4);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('Δy', bx + 6, (ay + by) / 2);

        // Distance line
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, C.accent); g.addColorStop(1, C.warm);
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);

        const d = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2) / cell;
        ctx.fillStyle = C.warm;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const angle = Math.atan2(by - ay, bx - ax);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(angle);
        ctx.fillText(`d = ${d.toFixed(1)}`, 0, -10);
        ctx.restore();

        drawGlowDot(ctx, ax, ay, 7, C.accent);
        drawGlowDot(ctx, bx, by, 7, C.warm);
    }

    /* ──────────────────────────────────────────────────────
       2. THREE-SPACE (ℝ³ with wireframe cube grid)
       ────────────────────────────────────────────────────── */
    function draw3Space(time) {
        const s = canvases.space3d;
        if (!s) return;
        const { ctx, w, h } = s;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const t = time * 0.0003;
        const scale = Math.min(w, h) * 0.12;

        // Simple 3D → 2D projection (oblique)
        function project(x, y, z) {
            const rotY = t * 0.4;
            const rotX = 0.35;
            // Rotate around Y
            const cx1 = x * Math.cos(rotY) - z * Math.sin(rotY);
            const cz1 = x * Math.sin(rotY) + z * Math.cos(rotY);
            // Rotate around X
            const cy1 = y * Math.cos(rotX) - cz1 * Math.sin(rotX);
            const cz2 = y * Math.sin(rotX) + cz1 * Math.cos(rotX);

            const perspective = 1 / (1 - cz2 * 0.08);
            return {
                x: cx + cx1 * scale * perspective,
                y: cy - cy1 * scale * perspective,
                z: cz2
            };
        }

        // Draw grid lines along each axis
        const range = 3;

        // Axes
        const axisColors = [C.teal, C.warm, C.accent];
        const axisEnds = [
            [[range + 0.5, 0, 0], [-range - 0.5, 0, 0]],
            [[0, range + 0.5, 0], [0, -range - 0.5, 0]],
            [[0, 0, range + 0.5], [0, 0, -range - 0.5]],
        ];

        // Grid lines (parallel to each axis)
        ctx.lineWidth = 0.5;
        for (let a = -range; a <= range; a++) {
            for (let b = -range; b <= range; b++) {
                // Lines along x
                const p1 = project(-range, a, b);
                const p2 = project(range, a, b);
                ctx.strokeStyle = (a === 0 && b === 0) ? C.gridBold : C.grid;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                // Lines along y
                const p3 = project(a, -range, b);
                const p4 = project(a, range, b);
                ctx.strokeStyle = (a === 0 && b === 0) ? C.gridBold : C.grid;
                ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
                // Lines along z
                const p5 = project(a, b, -range);
                const p6 = project(a, b, range);
                ctx.strokeStyle = (a === 0 && b === 0) ? C.gridBold : C.grid;
                ctx.beginPath(); ctx.moveTo(p5.x, p5.y); ctx.lineTo(p6.x, p6.y); ctx.stroke();
            }
        }

        // Bold axes
        axisEnds.forEach(([end1, end2], i) => {
            const p1 = project(...end1);
            const p2 = project(...end2);
            ctx.strokeStyle = axisColors[i]; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        });

        // Animated distance in 3D
        const px = [Math.sin(t * 1.1) * 2, Math.cos(t * 0.9) * 1.5, Math.sin(t * 0.7 + 1) * 1.5];
        const qx = [Math.cos(t * 0.8 + 2) * 1.8, Math.sin(t * 1.2 + 1) * 2, Math.cos(t * 0.6 + 3) * 1.2];

        const pp = project(...px);
        const pq = project(...qx);

        ctx.strokeStyle = C.rose; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(pq.x, pq.y); ctx.stroke();
        ctx.setLineDash([]);

        const d3 = Math.sqrt((px[0] - qx[0]) ** 2 + (px[1] - qx[1]) ** 2 + (px[2] - qx[2]) ** 2);
        ctx.fillStyle = C.rose;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`d = ${d3.toFixed(1)}`, (pp.x + pq.x) / 2, Math.min(pp.y, pq.y) - 12);

        drawGlowDot(ctx, pp.x, pp.y, 6, C.accent);
        drawGlowDot(ctx, pq.x, pq.y, 6, C.rose);

        // Axis labels
        const labels = ['x', 'y', 'z'];
        axisEnds.forEach(([end], i) => {
            const p = project(end[0] * 1.15, end[1] * 1.15, end[2] * 1.15);
            ctx.fillStyle = axisColors[i];
            ctx.font = '600 14px "JetBrains Mono", monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(labels[i], p.x, p.y);
        });
    }

    /* ──────────────────────────────────────────────────────
       3. THE SPHERE
       ────────────────────────────────────────────────────── */
    function drawSphere(time) {
        const s = canvases.sphere;
        if (!s) return;
        const { ctx, w, h } = s;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) * 0.34;
        const t = time * 0.0003;

        // Ambient glow
        const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.4);
        glow.addColorStop(0, 'rgba(124,138,255,0.06)'); glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

        // Outline
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

        // Shading
        const shading = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
        shading.addColorStop(0, 'rgba(124,138,255,0.08)');
        shading.addColorStop(0.7, 'rgba(124,138,255,0.03)');
        shading.addColorStop(1, 'rgba(6,10,20,0.3)');
        ctx.fillStyle = shading; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

        // Latitudes
        ctx.strokeStyle = 'rgba(124,138,255,0.12)'; ctx.lineWidth = 0.7;
        for (let lat = -60; lat <= 60; lat += 30) {
            const latRad = lat * Math.PI / 180;
            const ry = R * Math.cos(latRad);
            const yOff = R * Math.sin(latRad);
            ctx.beginPath(); ctx.ellipse(cx, cy - yOff, ry, ry * 0.3, t, 0, TAU); ctx.stroke();
        }

        // Equator
        ctx.strokeStyle = 'rgba(124,138,255,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.3, t, 0, TAU); ctx.stroke();

        // Meridians
        ctx.strokeStyle = 'rgba(124,138,255,0.1)'; ctx.lineWidth = 0.7;
        for (let lon = 0; lon < 180; lon += 30) {
            const lonRad = lon * Math.PI / 180 + t;
            ctx.beginPath();
            for (let lat = -90; lat <= 90; lat += 3) {
                const latRad = lat * Math.PI / 180;
                const x3d = R * Math.cos(latRad) * Math.cos(lonRad);
                const y3d = R * Math.sin(latRad);
                const z3d = R * Math.cos(latRad) * Math.sin(lonRad);
                const proj = 1 / (1 + z3d / (R * 3));
                const sx = cx + x3d * proj;
                const sy = cy - y3d * proj;
                if (lat === -90) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
        }

        // Animated great-circle points
        function sphereProject(phi, theta) {
            const x3d = R * Math.sin(theta) * Math.cos(phi);
            const y3d = R * Math.cos(theta);
            const z3d = R * Math.sin(theta) * Math.sin(phi);
            const cr = Math.cos(t), sr = Math.sin(t);
            const rx = x3d * cr - z3d * sr;
            const rz = x3d * sr + z3d * cr;
            const sc = 1 / (1 + rz / (R * 3));
            return { x: cx + rx * sc, y: cy - y3d * sc, z: rz };
        }

        const p1 = sphereProject(t * 1.3, Math.PI * 0.35);
        const p2 = sphereProject(t * 0.9 + 2, Math.PI * 0.6);

        // Great-circle arc
        ctx.strokeStyle = 'rgba(45,212,191,0.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const frac = i / 30;
            const phi = t * 1.3 + ((t * 0.9 + 2) - t * 1.3) * frac;
            const theta = Math.PI * 0.35 + (Math.PI * 0.6 - Math.PI * 0.35) * frac;
            const p = sphereProject(phi, theta);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke(); ctx.setLineDash([]);

        if (p1.z > 0) drawGlowDot(ctx, p1.x, p1.y, 6, C.teal);
        else drawGlowDot(ctx, p1.x, p1.y, 3, 'rgba(45,212,191,0.3)');
        if (p2.z > 0) drawGlowDot(ctx, p2.x, p2.y, 6, C.rose);
        else drawGlowDot(ctx, p2.x, p2.y, 3, 'rgba(244,114,182,0.3)');
    }

    /* ──────────────────────────────────────────────────────
       Navigation
       ────────────────────────────────────────────────────── */
    function goTo(n) {
        if (n < 0 || n >= TOTAL) return;
        step = n;
        updateUI();
        // Notify parent
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'spacesState', step, total: TOTAL }, '*');
        }
    }
    window.next = () => goTo(step + 1);
    window.prev = () => goTo(step - 1);

    function updateUI() {
        // Show/hide slides
        STEPS.forEach((s, i) => {
            const el = document.getElementById(s.id);
            if (!el) return;
            if (el.tagName === 'CANVAS') {
                el.classList.toggle('active', i === step);
            } else {
                el.classList.toggle('active', i === step);
            }
        });

        // Description
        const descEl = document.getElementById('description');
        if (descEl) descEl.textContent = STEPS[step].desc;

        // Buttons
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        if (prevBtn) prevBtn.disabled = step === 0;
        if (nextBtn) nextBtn.disabled = step === TOTAL - 1;

        // Dots
        const dotsEl = document.getElementById('dots');
        if (dotsEl) {
            dotsEl.innerHTML = '';
            for (let i = 0; i < TOTAL; i++) {
                const d = document.createElement('div');
                d.className = 'dot' + (i === step ? ' active' : '');
                d.onclick = () => goTo(i);
                dotsEl.appendChild(d);
            }
        }
    }

    /* ── Keyboard ──────────────────────────────────────── */
    const isEmbedded = new URLSearchParams(window.location.search).get('embed') === 'true';
    if (!isEmbedded) {
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.next(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); window.prev(); }
        });
    }

    /* ── postMessage ───────────────────────────────────── */
    window.addEventListener('message', e => {
        if (e.data === 'next' || e.data === 'right') window.next();
        if (e.data === 'prev' || e.data === 'left') window.prev();
        if (e.data && e.data.type === 'goTo' && typeof e.data.step === 'number') {
            goTo(e.data.step);
        }
    });

    /* ── Animation Loop ────────────────────────────────── */
    const drawFns = [drawLine, drawPlane, draw3Space, drawSphere];

    function frame(time) {
        // Only draw the active canvas step
        if (step < drawFns.length) {
            drawFns[step](time);
        }
        requestAnimationFrame(frame);
    }

    /* ── Init ──────────────────────────────────────────── */
    function init() {
        initCanvases();

        // Nav buttons
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        if (prevBtn) prevBtn.addEventListener('click', window.prev);
        if (nextBtn) nextBtn.addEventListener('click', window.next);

        updateUI();
        requestAnimationFrame(frame);

        // Notify parent of initial state
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'spacesState', step, total: TOTAL }, '*');
        }
    }

    function handleResize() {
        initCanvases();
    }

    window.addEventListener('resize', () => {
        clearTimeout(window._spacesResize);
        window._spacesResize = setTimeout(handleResize, 200);
    });

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState !== 'loading') init();

})();
