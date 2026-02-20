(() => {
    'use strict';

    const PHI = (1 + Math.sqrt(5)) / 2;
    const INV_PHI = 1 / PHI;
    const PI = Math.PI;
    const TAU = 2 * PI;

    const SCHEMES = {
        classic: { t0: ['#e6735a', '#d45d44'], t1: ['#3db8a2', '#2d9480'], bg: '#08081a' },
        warm: { t0: ['#f4845f', '#e05a3a'], t1: ['#f7d08a', '#e8b84d'], bg: '#1a0e08' },
        ocean: { t0: ['#48bfe3', '#3a86b4'], t1: ['#5390d9', '#3f6daa'], bg: '#060d1a' },
        neon: { t0: ['#ff006e', '#cc0058'], t1: ['#8338ec', '#6929bd'], bg: '#0a0a14' },
        pastel: { t0: ['#ffb4a2', '#e5a090'], t1: ['#a2d2ff', '#88b8e8'], bg: '#121218' },
        monochrome: { t0: ['#d4d4d8', '#a1a1aa'], t1: ['#71717a', '#52525b'], bg: '#0a0a0f' },
    };

    const canvas = document.getElementById('penrose-canvas');
    const ctx = canvas.getContext('2d');
    let dpr = 1;
    let triangles = [];

    let vx = 0, vy = 0, vs = 1, vr = 0, ar = 0;
    let dragging = false, dsx = 0, dsy = 0, dvx = 0, dvy = 0;
    let hlIdx = -1;

    const $ = id => document.getElementById(id);

    function resize() {
        dpr = window.devicePixelRatio || 1;
        canvas.width = innerWidth * dpr;
        canvas.height = innerHeight * dpr;
        canvas.style.width = innerWidth + 'px';
        canvas.style.height = innerHeight + 'px';
    }

    /* ── Deflation: exact Rosetta Code formulas ──────────────
     *  Type 0 (golden triangle, 36-72-72):
     *    P = A + (B - A) / φ
     *    → (0, C, P, B),  (1, P, C, A)
     *
     *  Type 1 (golden gnomon, 36-36-108):
     *    Q = B + (A - B) / φ
     *    R = B + (C - B) / φ
     *    → (1, Q, R, B),  (0, R, Q, A),  (1, C, A, R)
     * ─────────────────────────────────────────────────────── */
    function deflate(tris) {
        const out = [];
        for (const t of tris) {
            const [ax, ay] = t.A, [bx, by] = t.B, [cx, cy] = t.C;
            if (t.type === 0) {
                const px = ax + (bx - ax) * INV_PHI;
                const py = ay + (by - ay) * INV_PHI;
                out.push(
                    { type: 0, A: [cx, cy], B: [px, py], C: [bx, by] },
                    { type: 1, A: [px, py], B: [cx, cy], C: [ax, ay] },
                );
            } else {
                const qx = bx + (ax - bx) * INV_PHI;
                const qy = by + (ay - by) * INV_PHI;
                const rx = bx + (cx - bx) * INV_PHI;
                const ry = by + (cy - by) * INV_PHI;
                out.push(
                    { type: 1, A: [qx, qy], B: [rx, ry], C: [bx, by] },
                    { type: 0, A: [rx, ry], B: [qx, qy], C: [ax, ay] },
                    { type: 1, A: [cx, cy], B: [ax, ay], C: [rx, ry] },
                );
            }
        }
        return out;
    }

    /* ── Initial configurations ──────────────────────────────── */
    function initSun() {
        // 10 type-0 (golden triangle) around center = "sun" vertex
        const R = 300, tris = [];
        for (let i = 0; i < 10; i++) {
            let B = [R * Math.cos((2 * i - 1) * PI / 10), R * Math.sin((2 * i - 1) * PI / 10)];
            let C = [R * Math.cos((2 * i + 1) * PI / 10), R * Math.sin((2 * i + 1) * PI / 10)];
            if (i % 2 === 0) { const tmp = B; B = C; C = tmp; }
            tris.push({ type: 0, A: [0, 0], B, C });
        }
        return tris;
    }

    function initStar() {
        // 10 type-1 (gnomon) around center = "star" vertex
        const R = 300, tris = [];
        for (let i = 0; i < 10; i++) {
            let B = [R * Math.cos((2 * i - 1) * PI / 10), R * Math.sin((2 * i - 1) * PI / 10)];
            let C = [R * Math.cos((2 * i + 1) * PI / 10), R * Math.sin((2 * i + 1) * PI / 10)];
            if (i % 2 === 0) { const tmp = B; B = C; C = tmp; }
            tris.push({ type: 1, A: [0, 0], B, C });
        }
        return tris;
    }

    function initSingle() {
        const R = 300, a = PI / 5;
        return [
            { type: 0, A: [0, 0], B: [R, 0], C: [R * Math.cos(a), R * Math.sin(a)] },
            { type: 0, A: [0, 0], B: [R * Math.cos(-a), R * Math.sin(-a)], C: [R, 0] },
        ];
    }

    /* ── Edge utilities for rhombus outline detection ────────── */
    function ek(p1, p2) {
        const x1 = Math.round(p1[0] * 100), y1 = Math.round(p1[1] * 100);
        const x2 = Math.round(p2[0] * 100), y2 = Math.round(p2[1] * 100);
        return (x1 < x2 || (x1 === x2 && y1 < y2))
            ? `${x1},${y1}|${x2},${y2}` : `${x2},${y2}|${x1},${y1}`;
    }

    function buildEdgeInfo(tris) {
        // For each edge, track which triangle types touch it
        const map = new Map();
        for (const t of tris) {
            const edges = [[t.A, t.B], [t.B, t.C], [t.A, t.C]];
            for (const [p, q] of edges) {
                const k = ek(p, q);
                if (!map.has(k)) map.set(k, []);
                map.get(k).push(t.type);
            }
        }
        return map;
    }

    function isInterior(edgeMap, p1, p2) {
        const k = ek(p1, p2);
        const types = edgeMap.get(k);
        // Interior = shared by exactly 2 triangles of the same type
        return types && types.length === 2 && types[0] === types[1];
    }

    /* ── Generate ────────────────────────────────────────────── */
    function generate() {
        const depth = +$('depth').value;
        const shape = $('init-shape').value;

        let tris = shape === 'star' ? initStar()
            : shape === 'sun' ? initSun()
                : initSingle();

        for (let i = 0; i < depth; i++) tris = deflate(tris);
        triangles = tris;

        // Stats: type 0 pairs → thin rhombi, type 1 pairs → fat rhombi
        let n0 = 0, n1 = 0;
        for (const t of tris) t.type === 0 ? n0++ : n1++;
        const thin = Math.round(n0 / 2), fat = Math.round(n1 / 2);
        $('tile-count').textContent = `Tiles: ${thin + fat} (${fat} fat, ${thin} thin)`;
        $('tile-ratio').textContent = `Fat/Thin → φ: ${fat && thin ? (fat / thin).toFixed(4) : '—'}`;
        hlIdx = -1;
    }

    /* ── Render ──────────────────────────────────────────────── */
    function getColors() {
        const s = $('color-scheme').value;
        if (s === 'custom') return {
            t0: [$('color-thin1').value, $('color-thin2').value],
            t1: [$('color-thick1').value, $('color-thick2').value],
            bg: '#08081a',
        };
        return SCHEMES[s] || SCHEMES.classic;
    }

    function render() {
        const W = canvas.width, H = canvas.height, c = getColors();
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(dpr, dpr);
        ctx.translate(vx, vy);
        ctx.scale(vs, vs);
        ctx.rotate(vr + ar);

        const sw = +$('stroke-width').value;
        const sc = $('stroke-color').value;
        const mode = $('fill-mode').value;
        const arcs = $('show-arcs').checked;
        const edgeMap = buildEdgeInfo(triangles);

        // Fill
        for (let i = 0; i < triangles.length; i++) {
            const t = triangles[i];
            const cp = t.type === 0 ? c.t0 : c.t1;
            ctx.beginPath();
            ctx.moveTo(t.A[0], t.A[1]);
            ctx.lineTo(t.B[0], t.B[1]);
            ctx.lineTo(t.C[0], t.C[1]);
            ctx.closePath();
            if (mode !== 'wireframe') {
                if (mode === 'gradient') {
                    const g = ctx.createLinearGradient(t.A[0], t.A[1], (t.B[0] + t.C[0]) / 2, (t.B[1] + t.C[1]) / 2);
                    g.addColorStop(0, cp[0]); g.addColorStop(1, cp[1]);
                    ctx.fillStyle = g;
                } else {
                    ctx.fillStyle = i === hlIdx ? lighten(cp[0], 40) : cp[0];
                }
                ctx.fill();
            }
        }

        // Stroke — skip interior edges (same-type shared edges)
        if (sw > 0) {
            ctx.strokeStyle = sc;
            ctx.lineWidth = sw / vs;
            ctx.lineJoin = 'round';
            const drawn = new Set();
            for (const t of triangles) {
                const edges = [[t.A, t.B], [t.B, t.C], [t.A, t.C]];
                for (const [p, q] of edges) {
                    const k = ek(p, q);
                    if (drawn.has(k)) continue;
                    if (isInterior(edgeMap, p, q)) continue;
                    drawn.add(k);
                    ctx.beginPath();
                    ctx.moveTo(p[0], p[1]);
                    ctx.lineTo(q[0], q[1]);
                    ctx.stroke();
                }
            }
        }

        // Arcs
        if (arcs) drawArcs();

        // Highlight
        if (hlIdx >= 0 && hlIdx < triangles.length) {
            const t = triangles[hlIdx];
            const cp = t.type === 0 ? c.t0 : c.t1;
            ctx.save();
            ctx.shadowColor = cp[0]; ctx.shadowBlur = 18 / vs;
            ctx.strokeStyle = lighten(cp[0], 60); ctx.lineWidth = 2.5 / vs;
            ctx.beginPath();
            ctx.moveTo(t.A[0], t.A[1]); ctx.lineTo(t.B[0], t.B[1]); ctx.lineTo(t.C[0], t.C[1]);
            ctx.closePath(); ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    function drawArcs() {
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.2 / vs;
        ctx.strokeStyle = '#ffffffaa';
        for (const t of triangles) {
            const r = Math.hypot(t.B[0] - t.A[0], t.B[1] - t.A[1]) * INV_PHI;
            const a1 = Math.atan2(t.B[1] - t.A[1], t.B[0] - t.A[0]);
            const a2 = Math.atan2(t.C[1] - t.A[1], t.C[0] - t.A[0]);
            let da = a2 - a1;
            if (da > PI) da -= TAU;
            if (da < -PI) da += TAU;
            ctx.beginPath();
            ctx.arc(t.A[0], t.A[1], r, a1, a1 + da, da < 0);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function lighten(hex, n) {
        const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + n);
        const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + n);
        const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + n);
        return `rgb(${r},${g},${b})`;
    }

    /* ── Interaction ─────────────────────────────────────────── */
    canvas.addEventListener('mousedown', e => {
        dragging = true; dsx = e.clientX; dsy = e.clientY; dvx = vx; dvy = vy;
    });
    canvas.addEventListener('mousemove', e => {
        if (!dragging) return;
        vx = dvx + e.clientX - dsx; vy = dvy + e.clientY - dsy;
    });
    canvas.addEventListener('mouseup', e => {
        const wasDrag = Math.abs(e.clientX - dsx) > 3 || Math.abs(e.clientY - dsy) > 3;
        dragging = false;
        if (!wasDrag) click(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', () => dragging = false);
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const f = e.deltaY > 0 ? 0.92 : 1.08;
        const old = vs;
        vs = Math.max(0.02, Math.min(80, vs * f));
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        vx = cx - (cx - vx) * (vs / old);
        vy = cy - (cy - vy) * (vs / old);
        $('scale').value = vs; $('scale-val').textContent = vs.toFixed(1);
    }, { passive: false });

    let td = 0, tm = null;
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (e.touches.length === 1) {
            dragging = true; dsx = e.touches[0].clientX; dsy = e.touches[0].clientY; dvx = vx; dvy = vy;
        } else if (e.touches.length === 2) {
            dragging = false;
            td = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            tm = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && dragging) {
            vx = dvx + e.touches[0].clientX - dsx; vy = dvy + e.touches[0].clientY - dsy;
        } else if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const m = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
            vs = Math.max(0.02, Math.min(80, vs * d / td));
            vx += m.x - tm.x; vy += m.y - tm.y;
            td = d; tm = m;
            $('scale').value = vs; $('scale-val').textContent = vs.toFixed(1);
        }
    }, { passive: false });
    canvas.addEventListener('touchend', () => dragging = false);

    function click(cx, cy) {
        const rect = canvas.getBoundingClientRect();
        let wx = cx - rect.left - rect.width / 2 - vx;
        let wy = cy - rect.top - rect.height / 2 - vy;
        wx /= vs; wy /= vs;
        const rot = -(vr + ar), cosR = Math.cos(rot), sinR = Math.sin(rot);
        const rx = wx * cosR - wy * sinR, ry = wx * sinR + wy * cosR;
        hlIdx = -1;
        for (let i = 0; i < triangles.length; i++) {
            const t = triangles[i], v = [t.A, t.B, t.C];
            let inside = false;
            for (let a = 0, b = 2; a < 3; b = a++) {
                const [xi, yi] = v[a], [xj, yj] = v[b];
                if (((yi > ry) !== (yj > ry)) && (rx < (xj - xi) * (ry - yi) / (yj - yi) + xi)) inside = !inside;
            }
            if (inside) { hlIdx = i; break; }
        }
    }

    /* ── Controls ────────────────────────────────────────────── */
    $('controls-toggle').addEventListener('click', () => $('controls-panel').classList.toggle('hidden'));
    $('depth').addEventListener('input', () => { $('depth-val').textContent = $('depth').value; generate(); });
    $('tiling-type').addEventListener('change', generate);
    $('init-shape').addEventListener('change', generate);
    $('color-scheme').addEventListener('change', () => $('custom-colors').classList.toggle('hidden', $('color-scheme').value !== 'custom'));
    $('stroke-width').addEventListener('input', () => $('stroke-val').textContent = (+$('stroke-width').value).toFixed(1));
    $('rotation').addEventListener('input', () => { vr = +$('rotation').value * PI / 180; $('rotation-val').textContent = $('rotation').value + '°'; });
    $('scale').addEventListener('input', () => { vs = +$('scale').value; $('scale-val').textContent = vs.toFixed(1); });
    $('anim-speed').addEventListener('input', () => $('speed-val').textContent = (+$('anim-speed').value).toFixed(1));
    $('reset-btn').addEventListener('click', () => {
        vx = vy = 0; vs = 1; vr = ar = 0; hlIdx = -1;
        $('rotation').value = 0; $('rotation-val').textContent = '0°';
        $('scale').value = 1; $('scale-val').textContent = '1.0';
    });
    $('export-btn').addEventListener('click', () => {
        render();
        const a = document.createElement('a');
        a.download = `penrose-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    });
    setTimeout(() => $('tooltip').classList.add('hidden'), 100);

    /* ── Loop ────────────────────────────────────────────────── */
    let lt = 0;
    function loop(t) {
        const dt = (t - lt) / 1000; lt = t;
        if ($('animate-rotation').checked) ar += dt * (+$('anim-speed').value) * 0.1;
        render();
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    resize();
    generate();
    requestAnimationFrame(loop);
})();
