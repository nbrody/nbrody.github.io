// ============================================================
//  Schwartz Pentagram Map Explorer — app.js
// ============================================================

(() => {
    'use strict';

    // ─── Canvas ──────────────────────────────────────────────
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let W, H;

    // ─── DOM refs ────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const nSlider = $('n-slider');
    const nVal = $('n-val');
    const skipSlider = $('skip-slider');
    const skipVal = $('skip-val');
    const shapeSelect = $('shape-select');
    const starRadSlider = $('star-radius-slider');
    const starRadVal = $('star-radius-val');

    const lineWSlider = $('line-width-slider');
    const lineWVal = $('line-width-val');
    const vertexRSlider = $('vertex-radius-slider');
    const vertexRVal = $('vertex-radius-val');
    const trailOpSlider = $('trail-opacity-slider');
    const trailOpVal = $('trail-opacity-val');
    const fillOpSlider = $('fill-opacity-slider');
    const fillOpVal = $('fill-opacity-val');
    const trailCB = $('trail-checkbox');
    const diagCB = $('diag-checkbox');
    const glowCB = $('glow-checkbox');
    const gradientTrailCB = $('gradient-trail-checkbox');
    const triCB = $('triangulation-checkbox');
    const normCB = $('normalize-checkbox');
    const dragCB = $('drag-checkbox');

    const speedSlider = $('speed-slider');
    const speedVal = $('speed-val');
    const maxTrailSlider = $('max-trail-slider');
    const maxTrailVal = $('max-trail-val');
    const spiralCB = $('spiral-checkbox');
    const autoZoomCB = $('auto-zoom-checkbox');
    const morphCB = $('morph-checkbox');
    const morphSlider = $('morph-slider');
    const morphVal = $('morph-val');
    const autoRotCB = $('auto-rotate-checkbox');
    const rotSpeedSlider = $('rotate-speed-slider');
    const rotSpeedVal = $('rotate-speed-val');

    const playBtn = $('play-btn');
    const stepBtn = $('step-btn');
    const resetBtn = $('reset-btn');
    const exportBtn = $('export-btn');

    const iterCount = $('iter-count');

    // ─── Palettes (12 curated palettes) ──────────────────────
    const PALETTES = {
        midnight: {
            name: 'Midnight',
            bg: '#0a0e1a',
            colors: ['#6c8aff', '#8b5cf6', '#c084fc'],
            vertex: '#f0abfc',
            fill: [108, 138, 255],
            swatch: 'linear-gradient(135deg, #0a0e1a 30%, #6c8aff, #8b5cf6)',
        },
        aurora: {
            name: 'Aurora',
            bg: '#020e1a',
            colors: ['#22d3ee', '#06b6d4', '#14b8a6'],
            vertex: '#a5f3fc',
            fill: [34, 211, 238],
            swatch: 'linear-gradient(135deg, #020e1a 30%, #22d3ee, #14b8a6)',
        },
        ember: {
            name: 'Ember',
            bg: '#1a0808',
            colors: ['#f97316', '#ef4444', '#fbbf24'],
            vertex: '#fde68a',
            fill: [249, 115, 22],
            swatch: 'linear-gradient(135deg, #1a0808 30%, #f97316, #ef4444)',
        },
        sakura: {
            name: 'Sakura',
            bg: '#1a0a14',
            colors: ['#f472b6', '#ec4899', '#e879f9'],
            vertex: '#fce7f3',
            fill: [244, 114, 182],
            swatch: 'linear-gradient(135deg, #1a0a14 30%, #f472b6, #e879f9)',
        },
        forest: {
            name: 'Forest',
            bg: '#041210',
            colors: ['#34d399', '#10b981', '#6ee7b7'],
            vertex: '#a7f3d0',
            fill: [52, 211, 153],
            swatch: 'linear-gradient(135deg, #041210 30%, #34d399, #6ee7b7)',
        },
        neon: {
            name: 'Neon',
            bg: '#000000',
            colors: ['#00ff88', '#ff00ff', '#00ffff'],
            vertex: '#ffffff',
            fill: [0, 255, 136],
            swatch: 'linear-gradient(135deg, #000000 30%, #00ff88, #ff00ff)',
        },
        ocean: {
            name: 'Ocean',
            bg: '#0a1628',
            colors: ['#3b82f6', '#2563eb', '#60a5fa'],
            vertex: '#93c5fd',
            fill: [59, 130, 246],
            swatch: 'linear-gradient(135deg, #0a1628 30%, #3b82f6, #60a5fa)',
        },
        sunset: {
            name: 'Sunset',
            bg: '#1a0f05',
            colors: ['#f59e0b', '#d97706', '#b45309'],
            vertex: '#fef3c7',
            fill: [245, 158, 11],
            swatch: 'linear-gradient(135deg, #1a0f05 30%, #f59e0b, #d97706)',
        },
        cyberpunk: {
            name: 'Cyberpunk',
            bg: '#0d001a',
            colors: ['#a855f7', '#7c3aed', '#e879f9'],
            vertex: '#22d3ee',
            fill: [168, 85, 247],
            swatch: 'linear-gradient(135deg, #0d001a 30%, #a855f7, #e879f9)',
        },
        ivory: {
            name: 'Ivory',
            bg: '#18181b',
            colors: ['#e4e4e7', '#a1a1aa', '#d4d4d8'],
            vertex: '#fafafa',
            fill: [228, 228, 231],
            swatch: 'linear-gradient(135deg, #18181b 30%, #e4e4e7, #a1a1aa)',
        },
        candy: {
            name: 'Candy',
            bg: '#100818',
            colors: ['#fb7185', '#c084fc', '#fbbf24'],
            vertex: '#fecdd3',
            fill: [251, 113, 133],
            swatch: 'linear-gradient(135deg, #100818 30%, #fb7185, #c084fc)',
        },
        arctic: {
            name: 'Arctic',
            bg: '#0c1425',
            colors: ['#7dd3fc', '#38bdf8', '#bae6fd'],
            vertex: '#e0f2fe',
            fill: [125, 211, 252],
            swatch: 'linear-gradient(135deg, #0c1425 30%, #7dd3fc, #bae6fd)',
        },
    };

    let currentPaletteKey = 'midnight';

    // ─── State ───────────────────────────────────────────────
    let basePolygon = [];
    let polygonHistory = [];
    let currentIteration = 0;
    let isPlaying = false;
    let lastTime = 0;
    let timeAccumulator = 0;
    let dragNodeIndex = -1;
    let isDragging = false;
    let spiralCounter = 0;

    // Morph state
    let morphFrom = null;
    let morphTo = null;
    let morphStartTime = 0;
    let morphing = false;

    // Auto-rotate state
    let rotAngle = 0;

    // ─── View State (Orbit Controls) ─────────────────────────
    const view = {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0
    };
    let isOrbiting = false;
    let isPanningView = false;
    let lastPointerPos = { x: 0, y: 0 };

    function worldToScreen(wx, wy) {
        const cos = Math.cos(view.rotation);
        const sin = Math.sin(view.rotation);
        const rx = wx * view.scale * cos - wy * view.scale * sin;
        const ry = wx * view.scale * sin + wy * view.scale * cos;
        return {
            x: rx + W / 2 + view.x,
            y: ry + H / 2 + view.y
        };
    }

    function screenToWorld(sx, sy) {
        let x = sx - W / 2 - view.x;
        let y = sy - H / 2 - view.y;
        const cos = Math.cos(-view.rotation);
        const sin = Math.sin(-view.rotation);
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        return {
            x: rx / view.scale,
            y: ry / view.scale
        };
    }

    function applyViewTransform() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(W / 2 + view.x, H / 2 + view.y);
        ctx.rotate(view.rotation);
        ctx.scale(view.scale, view.scale);
    }

    function resetViewTransform() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ─── Utilities ───────────────────────────────────────────
    function getIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < 1e-10) return { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }

    function normalizePolygon(polygon) {
        const n = polygon.length;
        let tx = 0, ty = 0;
        for (const p of polygon) { tx += p.x; ty += p.y; }
        tx /= n; ty /= n;

        let maxR = 0;
        for (const p of polygon) {
            const r = Math.hypot(p.x - tx, p.y - ty);
            if (r > maxR) maxR = r;
        }
        if (maxR < 1e-6) maxR = 1;

        const targetR = Math.min(W, H) * 0.32;
        // In world space, we just center at 0,0 and scale so R is about targetR
        const s = targetR / maxR;
        return polygon.map(p => ({
            x: (p.x - tx) * s,
            y: (p.y - ty) * s,
        }));
    }

    function lerpPolygon(a, b, t) {
        if (a.length !== b.length) return b;
        return a.map((p, i) => ({
            x: p.x + (b[i].x - p.x) * t,
            y: p.y + (b[i].y - p.y) * t,
        }));
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // ─── Generalized Pentagram Map step ──────────────────────
    // The "skip-k" pentagram map: for each vertex i, take the
    // diagonal from vertex (i) to vertex (i+skip), and intersect
    // it with the diagonal from vertex (i-1) to vertex (i-1+skip).
    //
    // Classic Schwartz pentagram = skip 2 on a convex polygon.
    function computeMapStep(polygon) {
        const n = polygon.length;
        const skip = parseInt(skipSlider.value);
        const next = [];
        for (let i = 0; i < n; i++) {
            // Diagonal through vertex i and vertex i+skip
            const a1 = polygon[i];
            const a2 = polygon[(i + skip) % n];
            // Diagonal through vertex i+1 and vertex i+1+skip
            const b1 = polygon[(i + 1) % n];
            const b2 = polygon[(i + 1 + skip) % n];
            next.push(getIntersection(a1, a2, b1, b2));
        }
        if (normCB.checked) return normalizePolygon(next);
        return next;
    }

    function rebuildHistory() {
        polygonHistory = [basePolygon];
        let current = basePolygon;
        for (let i = 0; i < currentIteration; i++) {
            current = computeMapStep(current);
            polygonHistory.push(current);
        }
        iterCount.textContent = currentIteration;
    }

    // ─── Init polygon ────────────────────────────────────────
    function initBasePolygon() {
        const n = parseInt(nSlider.value);
        const type = shapeSelect.value;
        const R = Math.min(W, H) * 0.32;
        // Vertices are now in "world space" (centered at 0,0)

        basePolygon = [];
        if (type === 'regular') {
            for (let i = 0; i < n; i++) {
                const a = (2 * Math.PI * i) / n - Math.PI / 2;
                basePolygon.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
            }
        } else if (type === 'random-convex') {
            const angles = [];
            for (let i = 0; i < n; i++) angles.push(Math.random() * Math.PI * 2);
            angles.sort((a, b) => a - b);
            for (let i = 0; i < n; i++) {
                basePolygon.push({ x: Math.cos(angles[i]) * R, y: Math.sin(angles[i]) * R });
            }
        } else if (type === 'star') {
            const inner = parseFloat(starRadSlider.value) / 100;
            for (let i = 0; i < n; i++) {
                const a = (2 * Math.PI * i) / n - Math.PI / 2;
                const r = (i % 2 === 0) ? R : R * inner;
                basePolygon.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
        } else if (type === 'spiral') {
            for (let i = 0; i < n; i++) {
                const a = (2 * Math.PI * i) / n * 1.5 - Math.PI / 2;
                const r = R * (0.3 + 0.7 * (i / n));
                basePolygon.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
        } else if (type === 'irregular') {
            for (let i = 0; i < n; i++) {
                const a = (2 * Math.PI * i) / n - Math.PI / 2;
                const r = R * (0.3 + 0.7 * Math.random());
                basePolygon.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
        }
        currentIteration = 0;
        morphing = false;
        rotAngle = 0;
        spiralCounter = 0;
        rebuildHistory();
    }

    // ─── Auto-rotate base polygon ────────────────────────────
    function rotateBase(angleDeg) {
        const rad = angleDeg * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        basePolygon = basePolygon.map(p => {
            return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
        });
    }

    // ─── Drawing ─────────────────────────────────────────────
    function hslColor(hue, s = 80, l = 60) {
        return `hsl(${hue}, ${s}%, ${l}%)`;
    }

    function paletteEdgeColor(pal, iterIndex) {
        const c = pal.colors;
        return c[iterIndex % c.length];
    }

    function drawPolygon(polygon, pal, iterIndex, totalIters, isCurrent, isBase, spiralLimit) {
        if (polygon.length < 3) return;
        const n = polygon.length;

        const trailOpacity = parseFloat(trailOpSlider.value) / 100;
        const fillOpacity = parseFloat(fillOpSlider.value) / 100;
        const lineW = parseFloat(lineWSlider.value);
        const vertexR = parseFloat(vertexRSlider.value);
        const showGlow = glowCB.checked;
        const rainbowTrail = gradientTrailCB.checked;

        let edgeColor;
        if (rainbowTrail && !isCurrent) {
            const hue = (iterIndex / Math.max(totalIters, 1)) * 360;
            edgeColor = hslColor(hue, 85, 55);
        } else {
            edgeColor = paletteEdgeColor(pal, iterIndex);
        }

        // Build path
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
        ctx.closePath();

        if (isCurrent) {
            // Fill
            const [fr, fg, fb] = pal.fill;
            ctx.fillStyle = `rgba(${fr},${fg},${fb},${fillOpacity})`;
            ctx.fill();

            // Glow
            if (showGlow) {
                ctx.save();
                ctx.shadowColor = edgeColor;
                ctx.shadowBlur = 18;
                ctx.lineWidth = lineW;
                ctx.strokeStyle = edgeColor;
                ctx.stroke();
                ctx.restore();
            }

            ctx.lineWidth = lineW;
            ctx.strokeStyle = edgeColor;
            ctx.stroke();
        } else {
            const alpha = isBase ? trailOpacity * 1.2 : trailOpacity;
            ctx.lineWidth = Math.max(0.5, lineW * 0.5);
            ctx.globalAlpha = Math.min(1, alpha);
            ctx.strokeStyle = edgeColor;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Diagonals
        if (isCurrent && (diagCB.checked || spiralLimit !== undefined)) {
            const skip = parseInt(skipSlider.value);
            const limit = spiralLimit !== undefined ? spiralLimit : n;

            ctx.beginPath();
            for (let i = 0; i < limit; i++) {
                ctx.moveTo(polygon[i].x, polygon[i].y);
                ctx.lineTo(polygon[(i + skip) % n].x, polygon[(i + skip) % n].y);
            }
            ctx.lineWidth = 0.6;
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = edgeColor;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;

            if (spiralLimit !== undefined && spiralLimit > 0) {
                const innerPoints = [];
                for (let i = 0; i < limit; i++) {
                    const a1 = polygon[i];
                    const a2 = polygon[(i + skip) % n];
                    const b1 = polygon[(i + 1) % n];
                    const b2 = polygon[(i + 1 + skip) % n];
                    if (i < limit - 1 || limit === n) {
                        innerPoints.push(getIntersection(a1, a2, b1, b2));
                    }
                }

                if (innerPoints.length > 0) {
                    ctx.globalAlpha = 1;
                    const nextColor = paletteEdgeColor(pal, iterIndex + 1);
                    ctx.strokeStyle = nextColor;
                    ctx.lineWidth = lineW;

                    ctx.beginPath();
                    ctx.moveTo(innerPoints[0].x, innerPoints[0].y);
                    for (let i = 1; i < innerPoints.length; i++) {
                        ctx.lineTo(innerPoints[i].x, innerPoints[i].y);
                    }
                    if (limit === n) ctx.closePath();
                    ctx.stroke();

                    ctx.fillStyle = nextColor;
                    for (let i = 0; i < innerPoints.length; i++) {
                        ctx.beginPath();
                        ctx.arc(innerPoints[i].x, innerPoints[i].y, vertexR, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        // Vertices
        if (isCurrent || isBase) {
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.arc(polygon[i].x, polygon[i].y, isCurrent ? vertexR : vertexR * 0.7, 0, Math.PI * 2);
                if (showGlow && isCurrent) {
                    ctx.shadowColor = pal.vertex;
                    ctx.shadowBlur = 10;
                }
                ctx.fillStyle = pal.vertex;
                if (!isCurrent) ctx.globalAlpha = 0.35;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
            }
        }
    }

    // ─── Triangulation drawing ────────────────────────────────
    // Draw the natural triangulation arising from the pentagram map
    // diagonals. Between polygon P (outer) and its image Q (inner):
    //
    //   Q_i = intersection of diagonal D_i and D_{i+1}
    //   D_i = line from P_i to P_{i+skip}
    //
    // Each diagonal D_j has segments:
    //   near:  P_j → Q_{j-1}
    //   mid:   Q_{j-1} → Q_j  (= edge of Q, lies on D_j)
    //   far:   Q_j → P_{j+skip}
    //
    // These segments carve the annular region P↔Q into triangles:
    //   Side triangle at edge P_j–P_{j+1}:
    //       (P_j,  P_{j+1},  Q_{j-1})
    //   Spike fan at vertex P_j (k-1 triangles for skip k):
    //       (P_j,  Q_{j-m},  Q_{j-m-1})  for m = 1 … k-1
    //
    function drawTriangulation(outer, inner, pal, iterIndex, totalIters) {
        if (outer.length !== inner.length || outer.length < 3) return;
        const n = outer.length;
        const skip = parseInt(skipSlider.value);
        const fillOpacity = parseFloat(fillOpSlider.value) / 100;
        const trailOpacity = parseFloat(trailOpSlider.value) / 100;
        const rainbowTrail = gradientTrailCB.checked;

        const mod = i => ((i % n) + n) % n;

        // Helper to get triangle fill color
        function triColor(j, shade) {
            const alpha = fillOpacity * 2.5 + 0.04 - shade * 0.015;
            if (rainbowTrail) {
                const hue = ((iterIndex + j / n) / Math.max(totalIters, 1)) * 360;
                return `hsla(${hue + shade * 12}, 70%, ${50 - shade * 5}%, ${alpha})`;
            }
            const c = pal.colors[(iterIndex + shade) % pal.colors.length];
            return hexToRGBA(c, alpha);
        }

        function fillTri(a, b, c, color) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }

        for (let j = 0; j < n; j++) {
            // Side triangle: P_j, P_{j+1}, Q_{j-1}
            const Pj = outer[j];
            const Pj1 = outer[mod(j + 1)];
            const Qjm1 = inner[mod(j - 1)];

            fillTri(Pj, Pj1, Qjm1, triColor(j, 0));

            // Spike fan: (k-1) triangles from P_j through Q_{j-1}…Q_{j-k}
            for (let m = 1; m <= skip - 1; m++) {
                const Qa = inner[mod(j - m)];
                const Qb = inner[mod(j - m - 1)];
                fillTri(Pj, Qa, Qb, triColor(j, m));
            }
        }

        // Draw the diagonal segments (spokes) P_j→Q_{j-1} and Q_j→P_{j+skip}
        ctx.beginPath();
        for (let j = 0; j < n; j++) {
            // Near segment: P_j to Q_{j-1}
            ctx.moveTo(outer[j].x, outer[j].y);
            ctx.lineTo(inner[mod(j - 1)].x, inner[mod(j - 1)].y);
            // Far segment: Q_j to P_{j+skip}
            ctx.moveTo(inner[j].x, inner[j].y);
            ctx.lineTo(outer[mod(j + skip)].x, outer[mod(j + skip)].y);
        }
        ctx.lineWidth = 0.6;
        ctx.globalAlpha = trailOpacity * 0.6;
        ctx.strokeStyle = pal.colors[iterIndex % pal.colors.length];
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function hexToRGBA(hex, alpha) {
        // Support #rrggbb
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ─── Main loop ───────────────────────────────────────────
    function update(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = timestamp - lastTime;
        lastTime = timestamp;

        const pal = PALETTES[currentPaletteKey];
        canvas.style.backgroundColor = pal.bg;

        ctx.clearRect(0, 0, W, H);

        // Auto-rotate
        if (autoRotCB.checked && !isDragging) {
            const rSpeed = parseFloat(rotSpeedSlider.value) / 10;
            rotateBase(rSpeed);
            rebuildHistory();
        }

        // Auto-play iterations
        if (isPlaying && !morphing) {
            const speed = parseFloat(speedSlider.value);
            const n = basePolygon.length;
            const interval = spiralCB.checked ? 1000 / (speed * n) : 1000 / speed;
            timeAccumulator += dt;
            while (timeAccumulator > interval) {
                if (spiralCB.checked) {
                    spiralCounter++;
                    if (spiralCounter >= n) {
                        advanceStep();
                        spiralCounter = 0;
                    }
                } else {
                    advanceStep();
                }
                timeAccumulator -= interval;
            }
        }

        // Morph interpolation
        let displayPolygons = [...polygonHistory];
        if (morphing && morphFrom && morphTo) {
            const duration = parseFloat(morphSlider.value);
            const elapsed = timestamp - morphStartTime;
            const t = Math.min(elapsed / duration, 1);
            const et = easeInOutCubic(t);
            const blended = lerpPolygon(morphFrom, morphTo, et);
            displayPolygons[displayPolygons.length - 1] = blended;
            if (t >= 1) morphing = false;
        }

        // Auto-Zoom
        if (autoZoomCB.checked && displayPolygons.length > 0 && !isDragging && !isOrbiting && !isPanningView) {
            const currPoly = displayPolygons[displayPolygons.length - 1];
            const nCoords = currPoly.length;
            if (nCoords > 0) {
                let cx = 0, cy = 0;
                for (let i = 0; i < nCoords; i++) {
                    cx += currPoly[i].x;
                    cy += currPoly[i].y;
                }
                cx /= nCoords;
                cy /= nCoords;

                let maxR = 0;
                for (let i = 0; i < nCoords; i++) {
                    const r = Math.hypot(currPoly[i].x - cx, currPoly[i].y - cy);
                    if (r > maxR) maxR = r;
                }
                if (maxR < 1e-6) maxR = 1;

                const targetR = Math.min(W, H) * 0.32;
                const targetScale = targetR / maxR;

                const cos = Math.cos(view.rotation);
                const sin = Math.sin(view.rotation);
                const targetX = -(cx * cos - cy * sin) * targetScale;
                const targetY = -(cx * sin + cy * cos) * targetScale;

                const lerpT = 1 - Math.exp(-dt * 0.005);
                view.scale += (targetScale - view.scale) * lerpT;
                view.x += (targetX - view.x) * lerpT;
                view.y += (targetY - view.y) * lerpT;
            }
        }

        // Draw
        const showTrails = trailCB.checked;
        const showTri = triCB.checked;
        const maxTrails = parseInt(maxTrailSlider.value);
        const totalIters = displayPolygons.length;

        applyViewTransform();

        // --- Triangulation layer (drawn first, behind edges) ---
        if (showTri && displayPolygons.length >= 2) {
            let limitIters = totalIters - 1;
            const start = showTrails ? Math.max(0, limitIters - maxTrails) : Math.max(0, limitIters - 1);
            for (let i = start; i < limitIters; i++) {
                drawTriangulation(displayPolygons[i], displayPolygons[i + 1], pal, i, totalIters);
            }
        }

        // --- Polygon edges layer ---
        if (showTrails) {
            const start = Math.max(0, totalIters - maxTrails);
            for (let i = start; i < totalIters - 1; i++) {
                drawPolygon(displayPolygons[i], pal, i, totalIters, false, i === 0);
            }
        } else if (displayPolygons.length > 1) {
            drawPolygon(displayPolygons[0], pal, 0, totalIters, false, true);
        }

        if (displayPolygons.length > 0) {
            drawPolygon(
                displayPolygons[displayPolygons.length - 1],
                pal, totalIters - 1, totalIters,
                true,
                totalIters === 1,
                spiralCB.checked ? spiralCounter : undefined
            );
        }

        resetViewTransform();

        requestAnimationFrame(update);
    }

    function advanceStep() {
        const prevPoly = polygonHistory[polygonHistory.length - 1];
        currentIteration++;
        rebuildHistory();
        const nextPoly = polygonHistory[polygonHistory.length - 1];

        if (morphCB.checked) {
            morphFrom = prevPoly;
            morphTo = nextPoly;
            morphStartTime = performance.now();
            morphing = true;
        }
    }

    // ─── Resize ──────────────────────────────────────────────
    function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;
        if (basePolygon.length === 0) initBasePolygon();
    }

    // ─── Palette grid ────────────────────────────────────────
    function buildPaletteGrid() {
        const grid = $('palette-grid');
        grid.innerHTML = '';
        for (const key of Object.keys(PALETTES)) {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch' + (key === currentPaletteKey ? ' active' : '');
            swatch.style.background = PALETTES[key].swatch;
            swatch.title = PALETTES[key].name;
            swatch.dataset.key = key;
            swatch.addEventListener('click', () => {
                currentPaletteKey = key;
                grid.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
            grid.appendChild(swatch);
        }
    }

    // ─── Tab switching ───────────────────────────────────────
    function initTabs() {
        const tabs = document.querySelectorAll('.tab');
        const contents = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                $('tab-' + tab.dataset.tab).classList.add('active');
            });
        });
    }

    // ─── Panel toggle ────────────────────────────────────────
    function initPanelToggle() {
        const panel = $('ui-panel');
        const toggleBtn = $('toggle-panel-btn');
        const closeBtn = $('close-panel-btn');

        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
            toggleBtn.style.display = 'flex';
        });
        toggleBtn.addEventListener('click', () => {
            panel.classList.remove('hidden');
            toggleBtn.style.display = 'none';
        });
    }

    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function findHitVertex(mx, my) {
        // mx, my are screen coordinates. Convert to world before checking distance.
        const worldPos = screenToWorld(mx, my);
        const threshold = 25 / view.scale; // threshold scales with view
        let best = -1, bestD = threshold;
        for (let i = 0; i < basePolygon.length; i++) {
            const d = Math.hypot(basePolygon[i].x - worldPos.x, basePolygon[i].y - worldPos.y);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    canvas.addEventListener('mousedown', e => {
        const pointer = getPointerPos(e);
        lastPointerPos = pointer;

        if (e.metaKey || e.ctrlKey) {
            // Orbit Controls
            if (e.button === 0 && !e.shiftKey) {
                isOrbiting = true;
            } else {
                isPanningView = true;
            }
            return;
        }

        if (!dragCB.checked) return;
        const hit = findHitVertex(pointer.x, pointer.y);
        if (hit !== -1) {
            isDragging = true;
            dragNodeIndex = hit;
            isPlaying = false;
            updatePlayBtn();
        }
    });

    window.addEventListener('mousemove', e => {
        const pointer = getPointerPos(e);
        const dx = pointer.x - lastPointerPos.x;
        const dy = pointer.y - lastPointerPos.y;

        if (isOrbiting) {
            // Orbit around center (just rotation in 2D)
            const rotationSensitivity = 0.01;
            view.rotation += dx * rotationSensitivity;
            lastPointerPos = pointer;
            return;
        }

        if (isPanningView) {
            view.x += dx;
            view.y += dy;
            lastPointerPos = pointer;
            return;
        }

        if (isDragging && dragNodeIndex !== -1) {
            const worldPos = screenToWorld(pointer.x, pointer.y);
            basePolygon[dragNodeIndex] = worldPos;
            rebuildHistory();
        }
        lastPointerPos = pointer;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        dragNodeIndex = -1;
        isOrbiting = false;
        isPanningView = false;
    });

    canvas.addEventListener('wheel', e => {
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY;
            const factor = Math.pow(1.1, delta / 100);

            // Zoom toward mouse
            const pointer = getPointerPos(e);
            const before = screenToWorld(pointer.x, pointer.y);
            view.scale *= factor;
            const after = screenToWorld(pointer.x, pointer.y);

            view.x += (after.x - before.x) * view.scale;
            view.y += (after.y - before.y) * view.scale; // Simple zoom-to-mouse

            // Wait, proper zoom to mouse needs more careful accounting for rotation.
            // Simplified for now: just scale
        }
    }, { passive: false });

    // Touch support (basic)
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length > 1) {
            // Could implement pinch zoom here
            return;
        }
        const pointer = getPointerPos(e);
        lastPointerPos = pointer;

        if (!dragCB.checked) return;
        const hit = findHitVertex(pointer.x, pointer.y);
        if (hit !== -1) {
            isDragging = true;
            dragNodeIndex = hit;
            isPlaying = false;
            updatePlayBtn();
        }
    }, { passive: true });

    window.addEventListener('touchmove', e => {
        if (isDragging && dragNodeIndex !== -1) {
            e.preventDefault();
            const pointer = getPointerPos(e);
            const worldPos = screenToWorld(pointer.x, pointer.y);
            basePolygon[dragNodeIndex] = worldPos;
            rebuildHistory();
        }
    }, { passive: false });

    window.addEventListener('touchend', () => { isDragging = false; dragNodeIndex = -1; });

    // ─── Controls ────────────────────────────────────────────
    function updatePlayBtn() {
        playBtn.innerHTML = isPlaying
            ? '<span class="btn-icon">⏸</span> Pause'
            : '<span class="btn-icon">▶</span> Play';
    }

    playBtn.addEventListener('click', () => { isPlaying = !isPlaying; updatePlayBtn(); });
    stepBtn.addEventListener('click', () => {
        if (spiralCB.checked) {
            spiralCounter++;
            if (spiralCounter >= basePolygon.length) {
                advanceStep();
                spiralCounter = 0;
            }
        } else {
            advanceStep();
            spiralCounter = 0;
        }
    });
    resetBtn.addEventListener('click', () => { initBasePolygon(); });

    // Slider readouts
    const sliderBindings = [
        [nSlider, nVal, null, () => { syncSkipMax(); initBasePolygon(); }],
        [skipSlider, skipVal, null, () => rebuildHistory()],
        [starRadSlider, starRadVal, v => (v / 100).toFixed(2), () => initBasePolygon()],
        [lineWSlider, lineWVal, null],
        [vertexRSlider, vertexRVal, null],
        [trailOpSlider, trailOpVal, v => (v / 100).toFixed(2)],
        [fillOpSlider, fillOpVal, v => (v / 100).toFixed(2)],
        [speedSlider, speedVal, null],
        [maxTrailSlider, maxTrailVal, null],
        [morphSlider, morphVal, null],
        [rotSpeedSlider, rotSpeedVal, v => (v / 10).toFixed(1)],
    ];

    sliderBindings.forEach(([slider, display, fmt, cb]) => {
        slider.addEventListener('input', () => {
            display.textContent = fmt ? fmt(slider.value) : slider.value;
            if (cb) cb();
        });
    });

    shapeSelect.addEventListener('change', () => initBasePolygon());
    normCB.addEventListener('change', () => rebuildHistory());
    spiralCB.addEventListener('change', () => {
        if (!spiralCB.checked) spiralCounter = 0;
    });

    // Keep skip max coherent with n
    function syncSkipMax() {
        const n = parseInt(nSlider.value);
        const maxSkip = Math.floor(n / 2);
        skipSlider.max = maxSkip;
        if (parseInt(skipSlider.value) > maxSkip) {
            skipSlider.value = maxSkip;
            skipVal.textContent = maxSkip;
        }
    }

    // Export
    exportBtn.addEventListener('click', () => {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `pentagram_iter${currentIteration}.png`;
        a.click();
    });

    // ─── Boot ────────────────────────────────────────────────
    window.addEventListener('resize', resize);
    buildPaletteGrid();
    initTabs();
    initPanelToggle();
    syncSkipMax();
    resize();
    requestAnimationFrame(update);
})();
