/* ================================================================
   Spaces Gallery — Interactive Canvas Visualizations
   ================================================================
   Renders five metric spaces:
     1. The Line   (ℝ)
     2. The Plane   (ℝ²)
     3. The Sphere  (S²)
     4. A Tree      (T₃)
     5. Hyperbolic  (ℍ²) — Poincaré disk
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
    };

    /* ── Utility ────────────────────────────────────────── */
    const TAU = Math.PI * 2;
    const dpr = window.devicePixelRatio || 1;

    function setupCanvas(id) {
        const canvas = document.getElementById(id);
        const rect = canvas.getBoundingClientRect();
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { canvas, ctx, w: rect.width, h: rect.height };
    }

    /* ──────────────────────────────────────────────────────
       1. THE LINE
       ────────────────────────────────────────────────────── */
    function drawLine(time) {
        const { ctx, w, h } = line;
        ctx.clearRect(0, 0, w, h);

        const cy = h / 2;
        const margin = 30;

        // Subtle grid lines (vertical)
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 0.5;
        const spacing = (w - 2 * margin) / 12;
        for (let i = 0; i <= 12; i++) {
            const x = margin + i * spacing;
            ctx.beginPath();
            ctx.moveTo(x, cy - 60);
            ctx.lineTo(x, cy + 60);
            ctx.stroke();
        }

        // Main axis
        ctx.strokeStyle = C.dim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin, cy);
        ctx.lineTo(w - margin, cy);
        ctx.stroke();

        // Tick marks and labels
        ctx.fillStyle = C.text;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = -6; i <= 6; i++) {
            const x = w / 2 + i * spacing;
            ctx.strokeStyle = (i === 0) ? C.accent : C.dim;
            ctx.lineWidth = (i === 0) ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(x, cy - 6);
            ctx.lineTo(x, cy + 6);
            ctx.stroke();
            if (i % 2 === 0) {
                ctx.fillText(i.toString(), x, cy + 12);
            }
        }

        // Arrows at endpoints
        ctx.fillStyle = C.dim;
        // Left arrow
        ctx.beginPath();
        ctx.moveTo(margin, cy);
        ctx.lineTo(margin + 8, cy - 5);
        ctx.lineTo(margin + 8, cy + 5);
        ctx.fill();
        // Right arrow
        ctx.beginPath();
        ctx.moveTo(w - margin, cy);
        ctx.lineTo(w - margin - 8, cy - 5);
        ctx.lineTo(w - margin - 8, cy + 5);
        ctx.fill();

        // Animated points — two points with a distance arc
        const t = time * 0.0006;
        const px = w / 2 + Math.sin(t) * spacing * 3;
        const qx = w / 2 + Math.cos(t * 0.7 + 1) * spacing * 2;

        // Distance line
        const gdist = ctx.createLinearGradient(Math.min(px, qx), 0, Math.max(px, qx), 0);
        gdist.addColorStop(0, C.teal);
        gdist.addColorStop(1, C.accent);
        ctx.strokeStyle = gdist;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px, cy - 20);
        ctx.lineTo(qx, cy - 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Distance label
        const dist = Math.abs(px - qx) / spacing;
        ctx.fillStyle = C.teal;
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`d = ${dist.toFixed(1)}`, (px + qx) / 2, cy - 24);

        // Points
        drawGlowDot(ctx, px, cy, 6, C.accent);
        drawGlowDot(ctx, qx, cy, 6, C.teal);
    }

    /* ──────────────────────────────────────────────────────
       2. THE PLANE
       ────────────────────────────────────────────────────── */
    function drawPlane(time) {
        const { ctx, w, h } = plane;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const cellSize = Math.min(w, h) / 10;

        // Grid
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 0.5;
        for (let x = cx % cellSize; x < w; x += cellSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = cy % cellSize; y < h; y += cellSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = C.gridBold;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

        // Animated triangle showing distance
        const t = time * 0.0004;
        const ax = cx + Math.cos(t) * cellSize * 2.5;
        const ay = cy + Math.sin(t * 1.3) * cellSize * 1.8;
        const bx = cx + Math.cos(t + 2.5) * cellSize * 2;
        const by = cy + Math.sin(t * 0.8 + 1.5) * cellSize * 2.2;

        // Distance line
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, C.accent);
        g.addColorStop(1, C.warm);
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);

        // Right-angle marker showing dx, dy
        ctx.strokeStyle = 'rgba(124,138,255,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);

        // Δx, Δy labels
        ctx.fillStyle = 'rgba(124,138,255,0.4)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Δx', (ax + bx) / 2, ay - 4);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Δy', bx + 6, (ay + by) / 2);

        // Distance label
        const d = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2) / cellSize;
        ctx.fillStyle = C.warm;
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const angle = Math.atan2(by - ay, bx - ax);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.fillText(`d = ${d.toFixed(1)}`, 0, -8);
        ctx.restore();

        // Points
        drawGlowDot(ctx, ax, ay, 6, C.accent);
        drawGlowDot(ctx, bx, by, 6, C.warm);

        // Scatter some faint constellation dots
        ctx.fillStyle = 'rgba(124,138,255,0.12)';
        const seed = 42;
        for (let i = 0; i < 30; i++) {
            const rx = seededRand(seed + i * 3) * w;
            const ry = seededRand(seed + i * 3 + 1) * h;
            const rr = 1 + seededRand(seed + i * 3 + 2) * 2;
            ctx.beginPath();
            ctx.arc(rx, ry, rr, 0, TAU);
            ctx.fill();
        }
    }

    /* ──────────────────────────────────────────────────────
       3. THE SPHERE
       ────────────────────────────────────────────────────── */
    function drawSphere(time) {
        const { ctx, w, h } = sphere;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) * 0.34;
        const t = time * 0.0003;

        // Ambient glow
        const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.4);
        glow.addColorStop(0, 'rgba(124,138,255,0.06)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        // Sphere outline
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.stroke();

        // Subtle sphere shading
        const shading = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
        shading.addColorStop(0, 'rgba(124,138,255,0.08)');
        shading.addColorStop(0.7, 'rgba(124,138,255,0.03)');
        shading.addColorStop(1, 'rgba(6,10,20,0.3)');
        ctx.fillStyle = shading;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();

        // Latitude lines
        ctx.strokeStyle = 'rgba(124,138,255,0.12)';
        ctx.lineWidth = 0.7;
        for (let lat = -60; lat <= 60; lat += 30) {
            const latRad = lat * Math.PI / 180;
            const ry = R * Math.cos(latRad);
            const yOff = R * Math.sin(latRad);
            drawEllipse(ctx, cx, cy - yOff, ry, ry * 0.3, t);
        }

        // Equator (bolder)
        ctx.strokeStyle = 'rgba(124,138,255,0.25)';
        ctx.lineWidth = 1;
        drawEllipse(ctx, cx, cy, R, R * 0.3, t);

        // Longitude lines
        ctx.strokeStyle = 'rgba(124,138,255,0.1)';
        ctx.lineWidth = 0.7;
        for (let lon = 0; lon < 180; lon += 30) {
            const lonRad = lon * Math.PI / 180 + t;
            drawMeridian(ctx, cx, cy, R, lonRad);
        }

        // Two animated points on sphere surface + great circle arc
        const phi1 = t * 1.3;
        const theta1 = Math.PI * 0.35;
        const phi2 = t * 0.9 + 2;
        const theta2 = Math.PI * 0.6;

        const p1 = sphereProject(cx, cy, R, phi1, theta1, t);
        const p2 = sphereProject(cx, cy, R, phi2, theta2, t);

        // Great circle arc between the two points
        drawGreatCircleArc(ctx, cx, cy, R, phi1, theta1, phi2, theta2, t);

        // Points
        if (p1.z > 0) drawGlowDot(ctx, p1.x, p1.y, 5, C.teal);
        if (p2.z > 0) drawGlowDot(ctx, p2.x, p2.y, 5, C.rose);
        if (p1.z <= 0) drawGlowDot(ctx, p1.x, p1.y, 3, 'rgba(45,212,191,0.3)');
        if (p2.z <= 0) drawGlowDot(ctx, p2.x, p2.y, 3, 'rgba(244,114,182,0.3)');
    }

    /* ──────────────────────────────────────────────────────
       4. A TREE (3-regular)
       ────────────────────────────────────────────────────── */
    function drawTree(time) {
        const { ctx, w, h } = tree;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const t = time * 0.0002;

        // Build a 3-regular tree from center
        const nodes = [];
        const edges = [];
        const depth = 5;
        const baseLen = Math.min(w, h) * 0.18;

        function addBranch(x, y, angle, len, d, parentIdx) {
            if (d > depth || len < 4) return;
            const nx = x + Math.cos(angle) * len;
            const ny = y + Math.sin(angle) * len;
            const idx = nodes.length;
            nodes.push({ x: nx, y: ny, depth: d });
            edges.push({ from: parentIdx, to: idx, depth: d });

            const spread = 0.7 + 0.1 * Math.sin(t + d);
            const shrink = 0.58;
            addBranch(nx, ny, angle - spread, len * shrink, d + 1, idx);
            addBranch(nx, ny, angle + spread, len * shrink, d + 1, idx);
        }

        const rootIdx = 0;
        nodes.push({ x: cx, y: cy, depth: 0 });

        // 3 branches from root
        const branchCount = 3;
        for (let i = 0; i < branchCount; i++) {
            const angle = -Math.PI / 2 + (i * TAU / branchCount) + t * 0.3;
            addBranch(cx, cy, angle, baseLen, 1, rootIdx);
        }

        // Draw edges with depth-based color
        for (const e of edges) {
            const fromN = nodes[e.from];
            const toN = nodes[e.to];
            const alpha = 0.6 - e.depth * 0.08;
            ctx.strokeStyle = `rgba(124,138,255,${Math.max(alpha, 0.08)})`;
            ctx.lineWidth = Math.max(2.5 - e.depth * 0.35, 0.5);
            ctx.beginPath();
            ctx.moveTo(fromN.x, fromN.y);
            ctx.lineTo(toN.x, toN.y);
            ctx.stroke();
        }

        // Draw nodes
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const r = Math.max(4 - n.depth * 0.5, 1.2);
            const alpha = 0.9 - n.depth * 0.12;

            if (i === 0) {
                drawGlowDot(ctx, n.x, n.y, 6, C.accent);
            } else {
                ctx.fillStyle = `rgba(124,138,255,${Math.max(alpha, 0.15)})`;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, TAU);
                ctx.fill();
            }
        }

        // Highlight a path (from root to a deep node) to show distance
        const pulse = (Math.sin(t * 3) + 1) / 2;
        if (nodes.length > 10) {
            // Trace a path through the tree
            let pathNode = Math.min(Math.floor(3 + pulse * 8), nodes.length - 1);
            // Find path to root
            const path = [];
            // Simple: trace edges
            let current = pathNode;
            path.push(current);
            for (let e = edges.length - 1; e >= 0; e--) {
                if (edges[e].to === current) {
                    current = edges[e].from;
                    path.push(current);
                    if (current === 0) break;
                }
            }

            // Draw path highlight
            ctx.strokeStyle = C.teal;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4, 3]);
            for (let i = 0; i < path.length - 1; i++) {
                const a = nodes[path[i]];
                const b = nodes[path[i + 1]];
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Endpoints
            drawGlowDot(ctx, nodes[path[0]].x, nodes[path[0]].y, 5, C.teal);

            // Distance label
            ctx.fillStyle = C.teal;
            ctx.font = '500 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const ep = nodes[path[0]];
            ctx.fillText(`d = ${path.length - 1}`, ep.x, ep.y - 12);
        }
    }

    /* ──────────────────────────────────────────────────────
       5. HYPERBOLIC SPACE (Poincaré disk)
       ────────────────────────────────────────────────────── */
    function drawHyperbolic(time) {
        const { ctx, w, h } = hyp;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) * 0.38;
        const t = time * 0.00025;

        // Disk boundary
        const diskGlow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.1);
        diskGlow.addColorStop(0, 'rgba(124,138,255,0.04)');
        diskGlow.addColorStop(0.8, 'rgba(124,138,255,0.02)');
        diskGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = diskGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.1, 0, TAU);
        ctx.fill();

        // Disk fill
        ctx.fillStyle = 'rgba(13,19,33,0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();

        // Boundary circle
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.stroke();

        // Boundary label
        ctx.fillStyle = 'rgba(124,138,255,0.3)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('∂∞', cx, cy + R + 6);

        // Hyperbolic geodesics (arcs / diameters through the disk)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.clip();

        // Draw a {7,3} tiling approximation — hyperbolic geodesics
        ctx.strokeStyle = 'rgba(124,138,255,0.12)';
        ctx.lineWidth = 0.7;

        // Concentric "hyperbolic circles" (visually shrink near boundary)
        for (let r = 0.2; r < 1; r += 0.2) {
            const vizR = R * Math.tanh(r);
            ctx.beginPath();
            ctx.arc(cx, cy, vizR, 0, TAU);
            ctx.stroke();
        }

        // Radial geodesics (diameters)
        for (let a = 0; a < Math.PI; a += Math.PI / 7) {
            const ang = a + t * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
            ctx.lineTo(cx - Math.cos(ang) * R, cy - Math.sin(ang) * R);
            ctx.stroke();
        }

        // Curved geodesics (arcs of circles orthogonal to boundary)
        ctx.strokeStyle = 'rgba(124,138,255,0.1)';
        ctx.lineWidth = 0.6;
        for (let i = 0; i < 14; i++) {
            const baseAngle = (i / 14) * TAU + t * 0.3;
            const offset = 0.35 + 0.15 * Math.sin(i * 1.7);
            drawHypGeodesic(ctx, cx, cy, R, baseAngle, baseAngle + offset * Math.PI);
        }

        // Additional curved geodesics for richer tiling feel
        ctx.strokeStyle = 'rgba(167,139,250,0.08)';
        for (let i = 0; i < 21; i++) {
            const a1 = (i / 21) * TAU + t * 0.2;
            const a2 = a1 + (0.5 + 0.3 * Math.cos(i * 2.3)) * Math.PI;
            drawHypGeodesic(ctx, cx, cy, R, a1, a2);
        }

        ctx.restore();

        // Animated hyperbolic triangle
        const triAngle = t * 0.8;
        const pts = [
            hypPoint(cx, cy, R, 0.3, triAngle),
            hypPoint(cx, cy, R, 0.4, triAngle + 2.2),
            hypPoint(cx, cy, R, 0.25, triAngle + 4.0),
        ];

        // Triangle edges (geodesic arcs)
        ctx.strokeStyle = C.violet;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        for (let i = 0; i < 3; i++) {
            const a = pts[i], b = pts[(i + 1) % 3];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Triangle vertices
        pts.forEach((p, i) => {
            drawGlowDot(ctx, p.x, p.y, 4, [C.violet, C.teal, C.rose][i]);
        });

        // Angle sum note (< 180° in hyperbolic)
        ctx.fillStyle = 'rgba(167,139,250,0.5)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('∑ angles < π', cx, cy + R * 0.7);
    }

    /* ──────────────────────────────────────────────────────
       Helper Drawing Functions
       ────────────────────────────────────────────────────── */

    function drawGlowDot(ctx, x, y, r, color) {
        // Outer glow
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, color);
        g.addColorStop(0.4, color.replace(')', ',0.3)').replace('rgb', 'rgba').replace('rgba(', 'rgba('));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, TAU);
        ctx.fill();

        // Core
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();

        // Bright center
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.35, 0, TAU);
        ctx.fill();
    }

    function drawEllipse(ctx, cx, cy, rx, ry, rotation) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rotation || 0, 0, TAU);
        ctx.stroke();
    }

    function drawMeridian(ctx, cx, cy, R, lonRad) {
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 3) {
            const latRad = lat * Math.PI / 180;
            const x3d = R * Math.cos(latRad) * Math.cos(lonRad);
            const y3d = R * Math.sin(latRad);
            const z3d = R * Math.cos(latRad) * Math.sin(lonRad);
            const proj = 1 / (1 + z3d / (R * 3));
            const sx = cx + x3d * proj;
            const sy = cy - y3d * proj;
            if (lat === -90) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
    }

    function sphereProject(cx, cy, R, phi, theta, viewRot) {
        const x3d = R * Math.sin(theta) * Math.cos(phi);
        const y3d = R * Math.cos(theta);
        const z3d = R * Math.sin(theta) * Math.sin(phi);
        // Simple rotation around Y
        const cr = Math.cos(viewRot);
        const sr = Math.sin(viewRot);
        const rx = x3d * cr - z3d * sr;
        const rz = x3d * sr + z3d * cr;

        const scale = 1 / (1 + rz / (R * 3));
        return {
            x: cx + rx * scale,
            y: cy - y3d * scale,
            z: rz
        };
    }

    function drawGreatCircleArc(ctx, cx, cy, R, phi1, theta1, phi2, theta2, viewRot) {
        ctx.strokeStyle = 'rgba(45,212,191,0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        let first = true;
        for (let i = 0; i <= 30; i++) {
            const t = i / 30;
            const phi = phi1 + (phi2 - phi1) * t;
            const theta = theta1 + (theta2 - theta1) * t;
            const p = sphereProject(cx, cy, R, phi, theta, viewRot);
            if (first) { ctx.moveTo(p.x, p.y); first = false; }
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawHypGeodesic(ctx, cx, cy, R, angle1, angle2) {
        // Points on boundary
        const p1x = cx + R * Math.cos(angle1);
        const p1y = cy + R * Math.sin(angle1);
        const p2x = cx + R * Math.cos(angle2);
        const p2y = cy + R * Math.sin(angle2);

        // Find circle orthogonal to boundary through these two points
        const mx = (p1x + p2x) / 2 - cx;
        const my = (p1y + p2y) / 2 - cy;
        const dm = Math.sqrt(mx * mx + my * my);

        if (dm < 1) {
            // Nearly a diameter
            ctx.beginPath();
            ctx.moveTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);
            ctx.stroke();
            return;
        }

        // Perpendicular bisector of the chord
        const dx = p2x - p1x;
        const dy = p2y - p1y;
        const midx = (p1x + p2x) / 2;
        const midy = (p1y + p2y) / 2;

        // The center of the geodesic arc lies on the line through (midx, midy) perpendicular to the chord
        // and on the radical axis. For orthogonal circles, the arc center satisfies:
        // |center - disk_center|² = R² + r² where r is the arc radius
        // Simpler: use the perpendicular bisector parameterized by t
        const perpx = -dy;
        const perpy = dx;

        // Solve for t such that the circle through p1, p2 is orthogonal to the boundary
        // (center - cx)² + (center - cy)² = R² + arcR²
        // And the arc goes through p1 and p2
        const a = perpx * perpx + perpy * perpy;
        const b = 2 * ((midx - cx) * perpx + (midy - cy) * perpy);
        const c = (midx - cx) ** 2 + (midy - cy) ** 2 - R * R;

        const disc = b * b - 4 * a * c;
        if (disc < 0) return;

        const tParam = (-b + Math.sqrt(disc)) / (2 * a);
        const arcCx = midx + perpx * tParam;
        const arcCy = midy + perpy * tParam;
        const arcR = Math.sqrt((p1x - arcCx) ** 2 + (p1y - arcCy) ** 2);

        const startAngle = Math.atan2(p1y - arcCy, p1x - arcCx);
        const endAngle = Math.atan2(p2y - arcCy, p2x - arcCx);

        // Determine direction
        let sa = startAngle;
        let ea = endAngle;
        let diff = ea - sa;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;

        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, sa, sa + diff, diff < 0);
        ctx.stroke();
    }

    function hypPoint(cx, cy, R, hypR, angle) {
        // Map hyperbolic radius to Poincaré disk radius
        const diskR = R * Math.tanh(hypR);
        return {
            x: cx + diskR * Math.cos(angle),
            y: cy + diskR * Math.sin(angle)
        };
    }

    function seededRand(seed) {
        let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    /* ──────────────────────────────────────────────────────
       Animation Loop
       ────────────────────────────────────────────────────── */
    let line, plane, sphere, tree, hyp;
    let running = true;

    function init() {
        line   = setupCanvas('canvas-line');
        plane  = setupCanvas('canvas-plane');
        sphere = setupCanvas('canvas-sphere');
        tree   = setupCanvas('canvas-tree');
        hyp    = setupCanvas('canvas-hyperbolic');

        function frame(time) {
            if (!running) return;
            drawLine(time);
            drawPlane(time);
            drawSphere(time);
            drawTree(time);
            drawHyperbolic(time);
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    function handleResize() {
        line   = setupCanvas('canvas-line');
        plane  = setupCanvas('canvas-plane');
        sphere = setupCanvas('canvas-sphere');
        tree   = setupCanvas('canvas-tree');
        hyp    = setupCanvas('canvas-hyperbolic');
    }

    window.addEventListener('resize', () => {
        clearTimeout(window._spacesResize);
        window._spacesResize = setTimeout(handleResize, 200);
    });

    document.addEventListener('DOMContentLoaded', init);
    // Fallback if DOM already loaded
    if (document.readyState !== 'loading') init();

})();
