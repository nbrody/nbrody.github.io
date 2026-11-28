// ============================================================
//  Schwartz Pentagram Map Explorer — app.js
// ============================================================

(() => {
    'use strict';

    // ─── Canvas ──────────────────────────────────────────────
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    let W = 0;
    let H = 0;
    let dpr = 1;

    // ─── DOM refs ────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const nSlider = $('n-slider');
    const nVal = $('n-val');
    const skipSlider = $('skip-slider');
    const skipVal = $('skip-val');
    const shapeSelect = $('shape-select');
    const reseedBtn = $('reseed-btn');
    const starRadGroup = $('star-radius-group');
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
    const morphDurationGroup = $('morph-duration-group');
    const morphSlider = $('morph-slider');
    const morphVal = $('morph-val');
    const autoRotCB = $('auto-rotate-checkbox');
    const rotateSpeedGroup = $('rotate-speed-group');
    const rotSpeedSlider = $('rotate-speed-slider');
    const rotSpeedVal = $('rotate-speed-val');

    const playBtn = $('play-btn');
    const stepBtn = $('step-btn');
    const stepBackBtn = $('step-back-btn');
    const resetBtn = $('reset-btn');
    const exportBtn = $('export-btn');
    const mode2dBtn = $('mode-2d-btn');
    const mode3dBtn = $('mode-3d-btn');
    const resetViewBtn = $('reset-view-btn');

    const iterCount = $('iter-count');
    const geomMeta = $('geom-meta');
    const interactionHint = $('interaction-hint');
    const container3d = $('canvas3d-container');

    // ─── Palettes (12 curated palettes) ──────────────────────
    function parseHexRGB(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
        ];
    }

    const PALETTES = {
        midnight: {
            name: 'Midnight',
            bg: '#0a0e1a',
            colors: ['#6c8aff', '#8b5cf6', '#c084fc'],
            vertex: '#f0abfc',
            fill: [108, 138, 255],
        },
        aurora: {
            name: 'Aurora',
            bg: '#020e1a',
            colors: ['#22d3ee', '#06b6d4', '#14b8a6'],
            vertex: '#a5f3fc',
            fill: [34, 211, 238],
        },
        ember: {
            name: 'Ember',
            bg: '#1a0808',
            colors: ['#f97316', '#ef4444', '#fbbf24'],
            vertex: '#fde68a',
            fill: [249, 115, 22],
        },
        sakura: {
            name: 'Sakura',
            bg: '#1a0a14',
            colors: ['#f472b6', '#ec4899', '#e879f9'],
            vertex: '#fce7f3',
            fill: [244, 114, 182],
        },
        forest: {
            name: 'Forest',
            bg: '#041210',
            colors: ['#34d399', '#10b981', '#6ee7b7'],
            vertex: '#a7f3d0',
            fill: [52, 211, 153],
        },
        neon: {
            name: 'Neon',
            bg: '#000000',
            colors: ['#00ff88', '#ff00ff', '#00ffff'],
            vertex: '#ffffff',
            fill: [0, 255, 136],
        },
        ocean: {
            name: 'Ocean',
            bg: '#0a1628',
            colors: ['#3b82f6', '#2563eb', '#60a5fa'],
            vertex: '#93c5fd',
            fill: [59, 130, 246],
        },
        sunset: {
            name: 'Sunset',
            bg: '#1a0f05',
            colors: ['#f59e0b', '#d97706', '#b45309'],
            vertex: '#fef3c7',
            fill: [245, 158, 11],
        },
        cyberpunk: {
            name: 'Cyberpunk',
            bg: '#0d001a',
            colors: ['#a855f7', '#7c3aed', '#e879f9'],
            vertex: '#22d3ee',
            fill: [168, 85, 247],
        },
        ivory: {
            name: 'Ivory',
            bg: '#18181b',
            colors: ['#e4e4e7', '#a1a1aa', '#d4d4d8'],
            vertex: '#fafafa',
            fill: [228, 228, 231],
        },
        candy: {
            name: 'Candy',
            bg: '#100818',
            colors: ['#fb7185', '#c084fc', '#fbbf24'],
            vertex: '#fecdd3',
            fill: [251, 113, 133],
        },
        arctic: {
            name: 'Arctic',
            bg: '#0c1425',
            colors: ['#7dd3fc', '#38bdf8', '#bae6fd'],
            vertex: '#e0f2fe',
            fill: [125, 211, 252],
        },
    };

    for (const pal of Object.values(PALETTES)) {
        pal.rgb = pal.colors.map(parseHexRGB);
    }

    let currentPaletteKey = 'midnight';

    // ─── Cached Config (zero DOM reads inside render/update) ─
    const cfg = {
        n: parseInt(nSlider.value, 10),
        skip: parseInt(skipSlider.value, 10),
        shape: shapeSelect.value,
        starRadius: parseFloat(starRadSlider.value) / 100,
        lineWidth: parseFloat(lineWSlider.value),
        vertexRadius: parseFloat(vertexRSlider.value),
        trailOpacity: parseFloat(trailOpSlider.value) / 100,
        fillOpacity: parseFloat(fillOpSlider.value) / 100,
        maxTrails: parseInt(maxTrailSlider.value, 10),
        speed: parseFloat(speedSlider.value),
        morphDuration: parseFloat(morphSlider.value),
        rotateSpeed: parseFloat(rotSpeedSlider.value) / 10,
        showDiag: diagCB.checked,
        showTri: triCB.checked,
        showGlow: glowCB.checked,
        rainbowTrail: gradientTrailCB.checked,
        normalize: normCB.checked,
        enableDrag: dragCB.checked,
        spiralMode: spiralCB.checked,
        autoZoom: autoZoomCB.checked,
        morphEnabled: morphCB.checked,
        autoRotate: autoRotCB.checked,
    };

    // ─── State ───────────────────────────────────────────────
    let is3D = false;
    let basePolygon = [];
    let polygonHistory = [];
    let currentIteration = 0;
    let historyRevision = 0;
    let isPlaying = false;
    let lastTime = 0;
    let timeAccumulator = 0;
    let dragNodeIndex = -1;
    let hoveredNodeIndex = -1;
    let isDragging = false;
    let spiralCounter = 0;

    // Loop scheduling
    let dirty = true;
    let rafId = null;
    let isPageHidden = document.hidden;
    let autoZoomSettling = false;

    // Morph state
    let morphFrom = null;
    let morphTo = null;
    let morphStartTime = 0;
    let morphing = false;

    // ─── View State (2D Pan / Zoom / Orbit) ─────────────────
    const view = {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
    };
    let isOrbiting = false;
    let isPanningView = false;
    let rightMouseUsed = false;
    let lastPointerPos = { x: 0, y: 0 };
    let pinchLastDist = 0;
    let pinchLastMid = null;

    function worldToScreen(wx, wy) {
        const cos = Math.cos(view.rotation);
        const sin = Math.sin(view.rotation);
        const rx = wx * view.scale * cos - wy * view.scale * sin;
        const ry = wx * view.scale * sin + wy * view.scale * cos;
        return {
            x: rx + W / 2 + view.x,
            y: ry + H / 2 + view.y,
        };
    }

    function screenToWorld(sx, sy) {
        const x = sx - W / 2 - view.x;
        const y = sy - H / 2 - view.y;
        const cos = Math.cos(-view.rotation);
        const sin = Math.sin(-view.rotation);
        return {
            x: (x * cos - y * sin) / view.scale,
            y: (x * sin + y * cos) / view.scale,
        };
    }

    function applyViewTransform() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(W / 2 + view.x, H / 2 + view.y);
        ctx.rotate(view.rotation);
        ctx.scale(view.scale, view.scale);
    }

    // ─── Loop Control ────────────────────────────────────────
    function needsContinuousLoop() {
        return (
            isPlaying ||
            morphing ||
            (!is3D && cfg.autoRotate && !isDragging) ||
            (!is3D && cfg.autoZoom && autoZoomSettling)
        );
    }

    function ensureLoop() {
        if (!rafId && !isPageHidden && (dirty || needsContinuousLoop())) {
            rafId = requestAnimationFrame(tick);
        }
    }

    function markDirty() {
        dirty = true;
        if (cfg.autoZoom) autoZoomSettling = true;
        ensureLoop();
    }

    // ─── Math & Geometry ─────────────────────────────────────
    function getIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < 1e-10) {
            return { x: (p2.x + p3.x) * 0.5, y: (p2.y + p3.y) * 0.5 };
        }
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        const ix = x1 + t * (x2 - x1);
        const iy = y1 + t * (y2 - y1);
        if (!Number.isFinite(ix) || !Number.isFinite(iy) || Math.abs(ix) > 1e7 || Math.abs(iy) > 1e7) {
            return { x: (p2.x + p3.x) * 0.5, y: (p2.y + p3.y) * 0.5 };
        }
        return { x: ix, y: iy };
    }

    function normalizePolygon(polygon) {
        const n = polygon.length;
        let tx = 0;
        let ty = 0;
        for (let i = 0; i < n; i++) {
            tx += polygon[i].x;
            ty += polygon[i].y;
        }
        tx /= n;
        ty /= n;

        let maxR = 0;
        for (let i = 0; i < n; i++) {
            const r = Math.hypot(polygon[i].x - tx, polygon[i].y - ty);
            if (r > maxR) maxR = r;
        }
        if (maxR < 1e-6) maxR = 1;

        const targetR = Math.min(W, H) * 0.32;
        const s = targetR / maxR;
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            out[i] = {
                x: (polygon[i].x - tx) * s,
                y: (polygon[i].y - ty) * s,
            };
        }
        return out;
    }

    function lerpPolygon(a, b, t) {
        if (a.length !== b.length) return b;
        const n = a.length;
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            out[i] = {
                x: a[i].x + (b[i].x - a[i].x) * t,
                y: a[i].y + (b[i].y - a[i].y) * t,
            };
        }
        return out;
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function computeMapStep(polygon, skip, normalize) {
        const n = polygon.length;
        const next = new Array(n);
        for (let i = 0; i < n; i++) {
            const a1 = polygon[i];
            const a2 = polygon[(i + skip) % n];
            const b1 = polygon[(i + 1) % n];
            const b2 = polygon[(i + 1 + skip) % n];
            next[i] = getIntersection(a1, a2, b1, b2);
        }
        return normalize ? normalizePolygon(next) : next;
    }

    function rotatePolygonListInPlace(polys, angleDeg) {
        const rad = (angleDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        for (let k = 0; k < polys.length; k++) {
            const poly = polys[k];
            if (!poly) continue;
            for (let i = 0; i < poly.length; i++) {
                const px = poly[i].x;
                const py = poly[i].y;
                poly[i].x = px * cos - py * sin;
                poly[i].y = px * sin + py * cos;
            }
        }
    }

    function updateStepButtons() {
        iterCount.textContent = currentIteration;
        stepBackBtn.disabled = currentIteration === 0 && spiralCounter === 0;
    }

    function rebuildHistory() {
        polygonHistory = [basePolygon];
        let current = basePolygon;
        for (let i = 0; i < currentIteration; i++) {
            current = computeMapStep(current, cfg.skip, cfg.normalize);
            polygonHistory.push(current);
        }
        updateStepButtons();
        historyRevision++;
        markDirty();
    }

    // ─── Init polygon ────────────────────────────────────────
    function initBasePolygon() {
        const n = cfg.n;
        const type = cfg.shape;
        const R = Math.min(W, H) * 0.32;

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
            const inner = cfg.starRadius;
            for (let i = 0; i < n; i++) {
                const a = (2 * Math.PI * i) / n - Math.PI / 2;
                const r = i % 2 === 0 ? R : R * inner;
                basePolygon.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
        } else if (type === 'spiral') {
            for (let i = 0; i < n; i++) {
                const a = ((2 * Math.PI * i) / n) * 1.5 - Math.PI / 2;
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

        currentIteration = is3D ? 5 : 0;
        morphing = false;
        morphFrom = null;
        morphTo = null;
        spiralCounter = 0;
        hoveredNodeIndex = -1;
        rebuildHistory();
    }

    // ─── Batched 2D Drawing ──────────────────────────────────
    function drawTriangulationLayer(polygons, startIdx, endIdx, pal, totalIters) {
        const skip = cfg.skip;
        const fillOpacity = cfg.fillOpacity;
        const trailOpacity = cfg.trailOpacity;
        const rainbow = cfg.rainbowTrail;
        const colorCount = pal.colors.length;

        if (!rainbow) {
            for (let i = startIdx; i < endIdx; i++) {
                const outer = polygons[i];
                const inner = polygons[i + 1];
                const n = outer.length;
                if (n < 3 || inner.length !== n) continue;

                for (let m = 0; m < skip; m++) {
                    const alpha = Math.max(0, Math.min(1, fillOpacity * 2.5 + 0.04 - m * 0.015));
                    if (alpha <= 0.002) continue;

                    const [r, g, b] = pal.rgb[(i + m) % colorCount];
                    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
                    ctx.beginPath();

                    if (m === 0) {
                        for (let j = 0; j < n; j++) {
                            const pj = outer[j];
                            const pj1 = outer[(j + 1) % n];
                            const qjm1 = inner[(j - 1 + n) % n];
                            ctx.moveTo(pj.x, pj.y);
                            ctx.lineTo(pj1.x, pj1.y);
                            ctx.lineTo(qjm1.x, qjm1.y);
                            ctx.closePath();
                        }
                    } else {
                        for (let j = 0; j < n; j++) {
                            const pj = outer[j];
                            const qa = inner[((j - m) % n + n) % n];
                            const qb = inner[((j - m - 1) % n + n) % n];
                            ctx.moveTo(pj.x, pj.y);
                            ctx.lineTo(qa.x, qa.y);
                            ctx.lineTo(qb.x, qb.y);
                            ctx.closePath();
                        }
                    }
                    ctx.fill();
                }
            }
        } else {
            for (let i = startIdx; i < endIdx; i++) {
                const outer = polygons[i];
                const inner = polygons[i + 1];
                const n = outer.length;
                if (n < 3 || inner.length !== n) continue;

                for (let j = 0; j < n; j++) {
                    const baseHue = ((i + j / n) / Math.max(totalIters, 1)) * 360;
                    const pj = outer[j];
                    const pj1 = outer[(j + 1) % n];
                    const qjm1 = inner[(j - 1 + n) % n];

                    const alpha0 = Math.max(0, Math.min(1, fillOpacity * 2.5 + 0.04));
                    if (alpha0 > 0.002) {
                        ctx.fillStyle = `hsla(${baseHue}, 70%, 50%, ${alpha0})`;
                        ctx.beginPath();
                        ctx.moveTo(pj.x, pj.y);
                        ctx.lineTo(pj1.x, pj1.y);
                        ctx.lineTo(qjm1.x, qjm1.y);
                        ctx.closePath();
                        ctx.fill();
                    }

                    for (let m = 1; m < skip; m++) {
                        const alpha = Math.max(0, Math.min(1, fillOpacity * 2.5 + 0.04 - m * 0.015));
                        if (alpha <= 0.002) continue;
                        const qa = inner[((j - m) % n + n) % n];
                        const qb = inner[((j - m - 1) % n + n) % n];
                        ctx.fillStyle = `hsla(${baseHue + m * 12}, 70%, ${50 - m * 5}%, ${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(pj.x, pj.y);
                        ctx.lineTo(qa.x, qa.y);
                        ctx.lineTo(qb.x, qb.y);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            }
        }

        const spokeAlpha = Math.min(1, trailOpacity * 0.6);
        if (spokeAlpha <= 0.002) return;

        ctx.lineWidth = 0.6 / view.scale;
        ctx.globalAlpha = spokeAlpha;

        for (let cIdx = 0; cIdx < colorCount; cIdx++) {
            let hasSegments = false;
            ctx.beginPath();
            for (let i = startIdx; i < endIdx; i++) {
                if (i % colorCount !== cIdx) continue;
                const outer = polygons[i];
                const inner = polygons[i + 1];
                const n = outer.length;
                if (n < 3 || inner.length !== n) continue;

                hasSegments = true;
                for (let j = 0; j < n; j++) {
                    const jm1 = (j - 1 + n) % n;
                    const jSkip = (j + skip) % n;
                    ctx.moveTo(outer[j].x, outer[j].y);
                    ctx.lineTo(inner[jm1].x, inner[jm1].y);
                    ctx.moveTo(inner[j].x, inner[j].y);
                    ctx.lineTo(outer[jSkip].x, outer[jSkip].y);
                }
            }
            if (hasSegments) {
                ctx.strokeStyle = pal.colors[cIdx];
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawTrailPolygons(polygons, startIdx, endIdx, pal, totalIters) {
        if (startIdx >= endIdx) return;

        const lineW = cfg.lineWidth / view.scale;
        const trailLineW = Math.max(0.5 / view.scale, lineW * 0.5);
        const trailOpacity = cfg.trailOpacity;
        const colorCount = pal.colors.length;

        ctx.lineWidth = trailLineW;

        let trailStart = startIdx;
        if (startIdx === 0 && endIdx > 0) {
            const base = polygons[0];
            if (base.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(base[0].x, base[0].y);
                for (let k = 1; k < base.length; k++) ctx.lineTo(base[k].x, base[k].y);
                ctx.closePath();

                ctx.globalAlpha = Math.min(1, trailOpacity * 1.2);
                ctx.strokeStyle = cfg.rainbowTrail ? 'hsl(0, 85%, 55%)' : pal.colors[0];
                ctx.stroke();
            }
            trailStart = 1;
        }

        if (trailStart < endIdx) {
            ctx.globalAlpha = Math.min(1, trailOpacity);
            if (cfg.rainbowTrail) {
                for (let i = trailStart; i < endIdx; i++) {
                    const poly = polygons[i];
                    if (poly.length < 3) continue;
                    ctx.beginPath();
                    ctx.moveTo(poly[0].x, poly[0].y);
                    for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
                    ctx.closePath();
                    const hue = (i / Math.max(totalIters, 1)) * 360;
                    ctx.strokeStyle = `hsl(${hue}, 85%, 55%)`;
                    ctx.stroke();
                }
            } else {
                for (let cIdx = 0; cIdx < colorCount; cIdx++) {
                    let hasPath = false;
                    ctx.beginPath();
                    for (let i = trailStart; i < endIdx; i++) {
                        if (i % colorCount !== cIdx) continue;
                        const poly = polygons[i];
                        if (poly.length < 3) continue;
                        hasPath = true;
                        ctx.moveTo(poly[0].x, poly[0].y);
                        for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
                        ctx.closePath();
                    }
                    if (hasPath) {
                        ctx.strokeStyle = pal.colors[cIdx];
                        ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1;
        }

        if (startIdx === 0 && polygons[0].length >= 3) {
            const base = polygons[0];
            const vr = (cfg.vertexRadius * 0.7) / view.scale;
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = pal.vertex;
            ctx.beginPath();
            for (let i = 0; i < base.length; i++) {
                const p = base[i];
                ctx.moveTo(p.x + vr, p.y);
                ctx.arc(p.x, p.y, vr, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawCurrentPolygon(polygon, pal, iterIndex, spiralLimit) {
        const n = polygon.length;
        if (n < 3) return;

        const lineW = cfg.lineWidth / view.scale;
        const vertexR = cfg.vertexRadius / view.scale;
        const edgeColor = pal.colors[iterIndex % pal.colors.length];

        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
        ctx.closePath();

        const [fr, fg, fb] = pal.fill;
        if (cfg.fillOpacity > 0) {
            ctx.fillStyle = `rgba(${fr},${fg},${fb},${cfg.fillOpacity})`;
            ctx.fill();
        }

        if (cfg.showGlow) {
            ctx.save();
            ctx.shadowColor = edgeColor;
            ctx.shadowBlur = 14 * dpr;
            ctx.lineWidth = lineW;
            ctx.strokeStyle = edgeColor;
            ctx.stroke();
            ctx.restore();
        }

        ctx.lineWidth = lineW;
        ctx.strokeStyle = edgeColor;
        ctx.stroke();

        if (cfg.showDiag || spiralLimit !== undefined) {
            const skip = cfg.skip;
            const limit = spiralLimit !== undefined ? spiralLimit : n;

            if (limit > 0) {
                ctx.beginPath();
                for (let i = 0; i < limit; i++) {
                    ctx.moveTo(polygon[i].x, polygon[i].y);
                    ctx.lineTo(polygon[(i + skip) % n].x, polygon[(i + skip) % n].y);
                }
                ctx.lineWidth = 0.65 / view.scale;
                ctx.globalAlpha = 0.28;
                ctx.strokeStyle = edgeColor;
                ctx.setLineDash([5 / view.scale, 5 / view.scale]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            }

            if (spiralLimit !== undefined && spiralLimit > 0) {
                const innerPoints = [];
                for (let i = 0; i < limit; i++) {
                    if (i < limit - 1 || limit === n) {
                        innerPoints.push(
                            getIntersection(
                                polygon[i],
                                polygon[(i + skip) % n],
                                polygon[(i + 1) % n],
                                polygon[(i + 1 + skip) % n]
                            )
                        );
                    }
                }

                if (innerPoints.length > 0) {
                    const nextColor = pal.colors[(iterIndex + 1) % pal.colors.length];
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
                    ctx.beginPath();
                    for (let i = 0; i < innerPoints.length; i++) {
                        const pt = innerPoints[i];
                        ctx.moveTo(pt.x + vertexR, pt.y);
                        ctx.arc(pt.x, pt.y, vertexR, 0, Math.PI * 2);
                    }
                    ctx.fill();
                }
            }
        }

        if (cfg.showGlow) {
            ctx.save();
            ctx.shadowColor = pal.vertex;
            ctx.shadowBlur = 8 * dpr;
            ctx.fillStyle = pal.vertex;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const p = polygon[i];
                ctx.moveTo(p.x + vertexR, p.y);
                ctx.arc(p.x, p.y, vertexR, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.restore();
        } else {
            ctx.fillStyle = pal.vertex;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const p = polygon[i];
                ctx.moveTo(p.x + vertexR, p.y);
                ctx.arc(p.x, p.y, vertexR, 0, Math.PI * 2);
            }
            ctx.fill();
        }
    }

    function drawHoveredBaseVertex(pal) {
        if (!cfg.enableDrag || hoveredNodeIndex < 0 || hoveredNodeIndex >= basePolygon.length) {
            return;
        }
        const p = basePolygon[hoveredNodeIndex];
        const haloR = (cfg.vertexRadius + 5) / view.scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.lineWidth = 1.5 / view.scale;
        ctx.strokeStyle = pal.vertex;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function render2D(pal, morphBlended) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, W, H);

        if (polygonHistory.length === 0) return;

        let polygons = polygonHistory;
        if (morphBlended) {
            polygons = polygonHistory.slice(0, -1);
            polygons.push(morphBlended);
        }

        const totalIters = polygons.length;
        const maxTrails = cfg.maxTrails;

        applyViewTransform();

        if (cfg.showTri && totalIters >= 2) {
            const limitIters = totalIters - 1;
            const start = Math.max(0, limitIters - maxTrails);
            drawTriangulationLayer(polygons, start, limitIters, pal, totalIters);
        }

        const trailStart = Math.max(0, totalIters - maxTrails);
        drawTrailPolygons(polygons, trailStart, totalIters - 1, pal, totalIters);

        drawCurrentPolygon(
            polygons[totalIters - 1],
            pal,
            totalIters - 1,
            cfg.spiralMode ? spiralCounter : undefined
        );

        drawHoveredBaseVertex(pal);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ─── Shared state for scene3d.js ─────────────────────────
    const pentagramState = {
        polygonHistory,
        spiralCounter,
        currentPaletteKey,
        PALETTES,
        skipValue: cfg.skip,
        spiralMode: cfg.spiralMode,
        autoZoom: cfg.autoZoom,
        showTriangulation: cfg.showTri,
        showDiagonals: cfg.showDiag,
        maxTrails: cfg.maxTrails,
        autoRotate: cfg.autoRotate,
        rotateSpeed: cfg.rotateSpeed,
        isPlaying: false,
        is3D: false,
        historyRevision: 0,
    };
    window.PentagramState = pentagramState;

    function publishState() {
        pentagramState.polygonHistory = polygonHistory;
        pentagramState.spiralCounter = spiralCounter;
        pentagramState.currentPaletteKey = currentPaletteKey;
        pentagramState.skipValue = cfg.skip;
        pentagramState.spiralMode = cfg.spiralMode;
        pentagramState.autoZoom = cfg.autoZoom;
        pentagramState.showTriangulation = cfg.showTri;
        pentagramState.showDiagonals = cfg.showDiag;
        pentagramState.maxTrails = cfg.maxTrails;
        pentagramState.autoRotate = cfg.autoRotate;
        pentagramState.rotateSpeed = cfg.rotateSpeed;
        pentagramState.isPlaying = isPlaying;
        pentagramState.is3D = is3D;
        pentagramState.historyRevision = historyRevision;
    }

    // ─── Main Loop ───────────────────────────────────────────
    function tick(timestamp) {
        rafId = null;
        if (isPageHidden) return;

        const dt = lastTime ? Math.min(timestamp - lastTime, 100) : 16.67;
        lastTime = timestamp;

        if (!is3D && cfg.autoRotate && !isDragging) {
            const angleDeg = cfg.rotateSpeed * (dt / 16.67);
            rotatePolygonListInPlace(polygonHistory, angleDeg);
            if (morphing) {
                rotatePolygonListInPlace([morphFrom, morphTo], angleDeg);
            }
            dirty = true;
        }

        if (isPlaying && !morphing) {
            const n = basePolygon.length || 1;
            const interval = cfg.spiralMode ? 1000 / (cfg.speed * n) : 1000 / cfg.speed;
            timeAccumulator += dt;
            let stepsThisFrame = 0;
            while (timeAccumulator >= interval && stepsThisFrame < 20) {
                if (cfg.spiralMode) {
                    spiralCounter++;
                    if (spiralCounter >= n) {
                        advanceStep();
                        spiralCounter = 0;
                    } else {
                        updateStepButtons();
                    }
                } else {
                    advanceStep();
                }
                timeAccumulator -= interval;
                stepsThisFrame++;
                dirty = true;
            }
            if (stepsThisFrame >= 20) {
                timeAccumulator = 0;
            }
        }

        let morphBlended = null;
        if (morphing && morphFrom && morphTo) {
            const elapsed = timestamp - morphStartTime;
            const t = Math.min(elapsed / cfg.morphDuration, 1);
            const et = easeInOutCubic(t);
            morphBlended = lerpPolygon(morphFrom, morphTo, et);
            if (t >= 1) {
                morphing = false;
                morphFrom = null;
                morphTo = null;
            }
            dirty = true;
        }

        if (!is3D && cfg.autoZoom && polygonHistory.length > 0 && !isDragging && !isOrbiting && !isPanningView) {
            const currPoly = morphBlended || polygonHistory[polygonHistory.length - 1];
            const nCoords = currPoly.length;
            if (nCoords > 0) {
                let cx = 0;
                let cy = 0;
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

                const settled =
                    Math.abs(targetX - view.x) < 0.25 &&
                    Math.abs(targetY - view.y) < 0.25 &&
                    Math.abs(targetScale - view.scale) / Math.max(targetScale, 1e-6) < 0.001;

                if (settled) {
                    view.scale = targetScale;
                    view.x = targetX;
                    view.y = targetY;
                    autoZoomSettling = false;
                } else {
                    autoZoomSettling = true;
                }
                dirty = true;
            }
        } else {
            autoZoomSettling = false;
        }

        publishState();

        const pal = PALETTES[currentPaletteKey];
        if (!is3D && dirty) {
            render2D(pal, morphBlended);
            dirty = false;
        }

        if (dirty || needsContinuousLoop()) {
            rafId = requestAnimationFrame(tick);
        } else {
            lastTime = 0;
        }
    }

    function advanceStep() {
        const prevPoly = polygonHistory[polygonHistory.length - 1];
        const nextPoly = computeMapStep(prevPoly, cfg.skip, cfg.normalize);
        polygonHistory.push(nextPoly);
        currentIteration++;
        updateStepButtons();

        if (!is3D && cfg.morphEnabled) {
            morphFrom = prevPoly;
            morphTo = nextPoly;
            morphStartTime = performance.now();
            morphing = true;
        }
        markDirty();
    }

    function stepForward() {
        if (cfg.spiralMode) {
            spiralCounter++;
            if (spiralCounter >= basePolygon.length) {
                advanceStep();
                spiralCounter = 0;
            } else {
                updateStepButtons();
                markDirty();
            }
        } else {
            advanceStep();
            spiralCounter = 0;
        }
        publishState();
    }

    function stepBackward() {
        if (cfg.spiralMode && spiralCounter > 0) {
            spiralCounter--;
        } else if (polygonHistory.length > 1) {
            polygonHistory.pop();
            currentIteration--;
            spiralCounter = 0;
            morphing = false;
            morphFrom = null;
            morphTo = null;
            historyRevision++;
        } else {
            return;
        }
        updateStepButtons();
        markDirty();
        publishState();
    }

    // ─── Resize ──────────────────────────────────────────────
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        if (basePolygon.length === 0) {
            initBasePolygon();
        } else {
            markDirty();
        }
    }

    // ─── Palette Grid (Poincaré chrome stays consistent) ─────
    function applyPaletteTheme(key) {
        const pal = PALETTES[key];
        if (!pal) return;
        currentPaletteKey = key;

        const swatches = document.querySelectorAll('.palette-swatch');
        swatches.forEach(s => {
            const active = s.dataset.key === key;
            s.classList.toggle('active', active);
            s.setAttribute('aria-pressed', String(active));
        });

        publishState();
        markDirty();
    }

    function buildPaletteGrid() {
        const grid = $('palette-grid');
        grid.innerHTML = '';
        for (const key of Object.keys(PALETTES)) {
            const pal = PALETTES[key];
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'palette-swatch' + (key === currentPaletteKey ? ' active' : '');
            swatch.style.background =
                `linear-gradient(135deg, ${pal.bg} 30%, ${pal.colors[0]}, ${pal.colors[1]})`;
            swatch.title = pal.name;
            swatch.setAttribute('aria-label', `${pal.name} palette`);
            swatch.setAttribute('aria-pressed', String(key === currentPaletteKey));
            swatch.dataset.key = key;
            swatch.addEventListener('click', () => applyPaletteTheme(key));
            grid.appendChild(swatch);
        }
        applyPaletteTheme(currentPaletteKey);
    }

    // ─── Tabs (roving tabindex + arrow keys via PoincareUI) ─
    function initTabKeyboard() {
        const tablist = document.querySelector('.panel-tabs');
        const tabs = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
        if (!tablist || tabs.length === 0) return;

        document.addEventListener('panel:tab', e => {
            const activeName = e.detail && e.detail.tab;
            tabs.forEach(t => {
                t.tabIndex = t.dataset.tab === activeName ? 0 : -1;
            });
        });

        tablist.addEventListener('keydown', e => {
            const currentIdx = tabs.indexOf(document.activeElement);
            if (currentIdx === -1) return;
            let nextIdx = -1;
            if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabs.length;
            else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') nextIdx = 0;
            else if (e.key === 'End') nextIdx = tabs.length - 1;

            if (nextIdx !== -1) {
                e.preventDefault();
                const target = tabs[nextIdx];
                if (window.PoincareUI) {
                    window.PoincareUI.selectTab(target.dataset.tab, target);
                }
                target.focus();
            }
        });
    }

    // ─── Pointer, Wheel, Touch on 2D Canvas ──────────────────
    function getPointerPos(e, touchIndex = 0) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches.length > touchIndex) {
            return {
                x: e.touches[touchIndex].clientX - rect.left,
                y: e.touches[touchIndex].clientY - rect.top,
            };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function findHitVertex(mx, my) {
        const worldPos = screenToWorld(mx, my);
        const threshold = 22 / view.scale;
        let best = -1;
        let bestD = threshold;
        for (let i = 0; i < basePolygon.length; i++) {
            const d = Math.hypot(basePolygon[i].x - worldPos.x, basePolygon[i].y - worldPos.y);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    function updateCanvasCursor(pointer) {
        if (isDragging) {
            canvas.style.cursor = 'grabbing';
        } else if (isPanningView || isOrbiting) {
            canvas.style.cursor = 'move';
        } else if (cfg.enableDrag && pointer) {
            const hit = findHitVertex(pointer.x, pointer.y);
            if (hit !== hoveredNodeIndex) {
                hoveredNodeIndex = hit;
                markDirty();
            }
            canvas.style.cursor = hit !== -1 ? 'grab' : 'crosshair';
        } else {
            if (hoveredNodeIndex !== -1) {
                hoveredNodeIndex = -1;
                markDirty();
            }
            canvas.style.cursor = 'crosshair';
        }
    }

    canvas.addEventListener('contextmenu', e => {
        if (rightMouseUsed) e.preventDefault();
    });

    canvas.addEventListener('mousedown', e => {
        const pointer = getPointerPos(e);
        lastPointerPos = pointer;
        rightMouseUsed = false;

        if (e.button === 2 || e.shiftKey || e.metaKey || e.ctrlKey) {
            if (e.button === 2) rightMouseUsed = true;
            isOrbiting = true;
            updateCanvasCursor(pointer);
            return;
        }

        if (e.button !== 0) return;

        if (cfg.enableDrag) {
            const hit = findHitVertex(pointer.x, pointer.y);
            if (hit !== -1) {
                isDragging = true;
                dragNodeIndex = hit;
                hoveredNodeIndex = hit;
                setPlaying(false);
                updateCanvasCursor(pointer);
                return;
            }
        }

        isPanningView = true;
        updateCanvasCursor(pointer);
    });

    window.addEventListener('mousemove', e => {
        if (is3D) return;
        const pointer = getPointerPos(e);
        const dx = pointer.x - lastPointerPos.x;
        const dy = pointer.y - lastPointerPos.y;

        if (isOrbiting) {
            view.rotation += dx * 0.008;
            lastPointerPos = pointer;
            markDirty();
            return;
        }

        if (isPanningView) {
            view.x += dx;
            view.y += dy;
            lastPointerPos = pointer;
            markDirty();
            return;
        }

        if (isDragging && dragNodeIndex !== -1) {
            basePolygon[dragNodeIndex] = screenToWorld(pointer.x, pointer.y);
            rebuildHistory();
            lastPointerPos = pointer;
            return;
        }

        if (e.target === canvas) {
            updateCanvasCursor(pointer);
        } else if (hoveredNodeIndex !== -1) {
            hoveredNodeIndex = -1;
            markDirty();
        }
        lastPointerPos = pointer;
    });

    window.addEventListener('mouseup', () => {
        const wasInteracting = isDragging || isOrbiting || isPanningView;
        isDragging = false;
        dragNodeIndex = -1;
        isOrbiting = false;
        isPanningView = false;
        if (wasInteracting) updateCanvasCursor(lastPointerPos);
    });

    canvas.addEventListener('dblclick', () => {
        resetView();
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = Math.pow(1.0018, -e.deltaY);
        const pointer = getPointerPos(e);
        const before = screenToWorld(pointer.x, pointer.y);
        view.scale = Math.max(1e-4, Math.min(1e7, view.scale * factor));
        const afterScreen = worldToScreen(before.x, before.y);
        view.x += pointer.x - afterScreen.x;
        view.y += pointer.y - afterScreen.y;
        markDirty();
    }, { passive: false });

    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            isDragging = false;
            isPanningView = false;
            dragNodeIndex = -1;
            const p0 = getPointerPos(e, 0);
            const p1 = getPointerPos(e, 1);
            pinchLastDist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
            pinchLastMid = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
            return;
        }

        if (e.touches.length === 1) {
            const pointer = getPointerPos(e, 0);
            lastPointerPos = pointer;
            if (cfg.enableDrag) {
                const hit = findHitVertex(pointer.x, pointer.y);
                if (hit !== -1) {
                    isDragging = true;
                    dragNodeIndex = hit;
                    hoveredNodeIndex = hit;
                    setPlaying(false);
                    return;
                }
            }
            isPanningView = true;
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && pinchLastMid) {
            e.preventDefault();
            const p0 = getPointerPos(e, 0);
            const p1 = getPointerPos(e, 1);
            const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
            const mid = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };

            const before = screenToWorld(pinchLastMid.x, pinchLastMid.y);
            const factor = dist / pinchLastDist;
            view.scale = Math.max(1e-4, Math.min(1e7, view.scale * factor));
            const afterScreen = worldToScreen(before.x, before.y);
            view.x += mid.x - afterScreen.x;
            view.y += mid.y - afterScreen.y;

            pinchLastDist = dist;
            pinchLastMid = mid;
            markDirty();
            return;
        }

        if (e.touches.length === 1) {
            const pointer = getPointerPos(e, 0);
            if (isDragging && dragNodeIndex !== -1) {
                e.preventDefault();
                basePolygon[dragNodeIndex] = screenToWorld(pointer.x, pointer.y);
                rebuildHistory();
                lastPointerPos = pointer;
            } else if (isPanningView) {
                e.preventDefault();
                view.x += pointer.x - lastPointerPos.x;
                view.y += pointer.y - lastPointerPos.y;
                lastPointerPos = pointer;
                markDirty();
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        if (e.touches.length < 2) {
            pinchLastMid = null;
        }
        if (e.touches.length === 0) {
            isDragging = false;
            isPanningView = false;
            dragNodeIndex = -1;
            hoveredNodeIndex = -1;
            markDirty();
        }
    });

    // ─── Controls & Contextual Sync ──────────────────────────
    function setPlaying(nextPlaying) {
        isPlaying = nextPlaying;
        playBtn.classList.toggle('on', isPlaying);
        playBtn.innerHTML = isPlaying
            ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect class="solid" x="3.5" y="3" width="3" height="10" rx="0.8"/><rect class="solid" x="9.5" y="3" width="3" height="10" rx="0.8"/></svg><span class="pill-label">Pause</span>'
            : '<svg viewBox="0 0 16 16" aria-hidden="true"><polygon class="solid" points="4.5,3 13,8 4.5,13"/></svg><span class="pill-label">Play</span>';
        publishState();
        ensureLoop();
    }

    function syncContextualControls() {
        const isStar = cfg.shape === 'star';
        const isRandom = cfg.shape === 'random-convex' || cfg.shape === 'irregular';
        starRadGroup.hidden = !isStar;
        reseedBtn.hidden = !isRandom;
        morphDurationGroup.hidden = !cfg.morphEnabled;
        rotateSpeedGroup.hidden = !cfg.autoRotate;
        geomMeta.textContent = `${cfg.n}-gon · skip ${cfg.skip}`;
        interactionHint.innerHTML = is3D
            ? 'Drag to orbit · Scroll to dolly · Double-click reset · <kbd>Space</kbd> play'
            : 'Drag vertices · Drag canvas to pan · Scroll to zoom · <kbd>Space</kbd> play';
    }

    function syncSkipMax() {
        const maxSkip = Math.floor(cfg.n / 2);
        skipSlider.max = maxSkip;
        skipSlider.disabled = maxSkip <= 2;
        if (cfg.skip > maxSkip) {
            cfg.skip = maxSkip;
            skipSlider.value = maxSkip;
            skipVal.textContent = maxSkip;
        }
    }

    function resetView() {
        if (is3D && window.Scene3D) {
            window.Scene3D.resetView();
        } else {
            view.x = 0;
            view.y = 0;
            view.scale = 1;
            view.rotation = 0;
            markDirty();
        }
    }

    function resetAll() {
        view.x = 0;
        view.y = 0;
        view.scale = 1;
        view.rotation = 0;
        initBasePolygon();
        if (is3D && window.Scene3D) {
            window.Scene3D.resetView();
        }
    }

    playBtn.addEventListener('click', () => setPlaying(!isPlaying));
    stepBtn.addEventListener('click', stepForward);
    stepBackBtn.addEventListener('click', stepBackward);
    resetBtn.addEventListener('click', resetAll);
    resetViewBtn.addEventListener('click', resetView);
    reseedBtn.addEventListener('click', () => initBasePolygon());

    const sliderBindings = [
        [nSlider, nVal, null, v => {
            cfg.n = parseInt(v, 10);
            syncSkipMax();
            syncContextualControls();
            initBasePolygon();
        }],
        [skipSlider, skipVal, null, v => {
            cfg.skip = parseInt(v, 10);
            syncContextualControls();
            rebuildHistory();
        }],
        [starRadSlider, starRadVal, v => (v / 100).toFixed(2), v => {
            cfg.starRadius = parseFloat(v) / 100;
            initBasePolygon();
        }],
        [lineWSlider, lineWVal, null, v => { cfg.lineWidth = parseFloat(v); markDirty(); }],
        [vertexRSlider, vertexRVal, null, v => { cfg.vertexRadius = parseFloat(v); markDirty(); }],
        [trailOpSlider, trailOpVal, v => (v / 100).toFixed(2), v => { cfg.trailOpacity = parseFloat(v) / 100; markDirty(); }],
        [fillOpSlider, fillOpVal, v => (v / 100).toFixed(2), v => { cfg.fillOpacity = parseFloat(v) / 100; markDirty(); }],
        [speedSlider, speedVal, null, v => { cfg.speed = parseFloat(v); }],
        [maxTrailSlider, maxTrailVal, null, v => { cfg.maxTrails = parseInt(v, 10); publishState(); markDirty(); }],
        [morphSlider, morphVal, null, v => { cfg.morphDuration = parseFloat(v); }],
        [rotSpeedSlider, rotSpeedVal, v => (v / 10).toFixed(1), v => { cfg.rotateSpeed = parseFloat(v) / 10; publishState(); }],
    ];

    sliderBindings.forEach(([slider, display, fmt, cb]) => {
        slider.addEventListener('input', () => {
            display.textContent = fmt ? fmt(slider.value) : slider.value;
            if (cb) cb(slider.value);
        });
    });

    shapeSelect.addEventListener('change', () => {
        cfg.shape = shapeSelect.value;
        syncContextualControls();
        initBasePolygon();
    });

    diagCB.addEventListener('change', () => { cfg.showDiag = diagCB.checked; publishState(); markDirty(); });
    triCB.addEventListener('change', () => { cfg.showTri = triCB.checked; publishState(); markDirty(); });
    glowCB.addEventListener('change', () => { cfg.showGlow = glowCB.checked; markDirty(); });
    gradientTrailCB.addEventListener('change', () => { cfg.rainbowTrail = gradientTrailCB.checked; markDirty(); });
    normCB.addEventListener('change', () => { cfg.normalize = normCB.checked; rebuildHistory(); });
    dragCB.addEventListener('change', () => {
        cfg.enableDrag = dragCB.checked;
        if (!cfg.enableDrag) hoveredNodeIndex = -1;
        markDirty();
    });
    spiralCB.addEventListener('change', () => {
        cfg.spiralMode = spiralCB.checked;
        if (!cfg.spiralMode) spiralCounter = 0;
        updateStepButtons();
        publishState();
        markDirty();
    });
    autoZoomCB.addEventListener('change', () => {
        cfg.autoZoom = autoZoomCB.checked;
        publishState();
        markDirty();
    });
    morphCB.addEventListener('change', () => {
        cfg.morphEnabled = morphCB.checked;
        syncContextualControls();
    });
    autoRotCB.addEventListener('change', () => {
        cfg.autoRotate = autoRotCB.checked;
        syncContextualControls();
        publishState();
        markDirty();
    });

    exportBtn.addEventListener('click', () => {
        let dataUrl = null;
        if (is3D && window.Scene3D && window.Scene3D.captureDataURL) {
            dataUrl = window.Scene3D.captureDataURL();
        } else {
            render2D(PALETTES[currentPaletteKey], null);
            dataUrl = canvas.toDataURL('image/png');
        }
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `pentagram_${is3D ? '3d_' : ''}iter${currentIteration}.png`;
        a.click();
    });

    // ─── Mode Toggle (2D ↔ 3D) ───────────────────────────────
    function setMode(nextIs3D) {
        if (is3D === nextIs3D) return;
        is3D = nextIs3D;

        mode2dBtn.classList.toggle('active', !is3D);
        mode2dBtn.setAttribute('aria-pressed', String(!is3D));
        mode3dBtn.classList.toggle('active', is3D);
        mode3dBtn.setAttribute('aria-pressed', String(is3D));

        if (is3D) {
            if (currentIteration < 5) {
                currentIteration = 5;
                rebuildHistory();
            }
            canvas.style.display = 'none';
            container3d.style.display = 'block';
            publishState();

            if (window.Scene3D) {
                window.Scene3D.init();
                window.Scene3D.setActive(true);
            }
        } else {
            if (window.Scene3D) {
                window.Scene3D.setActive(false);
            }
            canvas.style.display = '';
            container3d.style.display = 'none';
            publishState();
            markDirty();
        }
        syncContextualControls();
    }

    function initModeToggle() {
        mode2dBtn.addEventListener('click', () => setMode(false));
        mode3dBtn.addEventListener('click', () => setMode(true));
    }

    // ─── Keyboard Shortcuts ──────────────────────────────────
    window.addEventListener('keydown', e => {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
            return;
        }
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.code === 'Space') {
            if (tag === 'BUTTON') return;
            e.preventDefault();
            setPlaying(!isPlaying);
        } else if (e.key === 'ArrowRight' || e.key === 's' || e.key === 'S') {
            e.preventDefault();
            stepForward();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            stepBackward();
        } else if (e.key === 'r' || e.key === 'R') {
            resetAll();
        } else if (e.key === '0') {
            resetView();
        } else if (e.key === '3') {
            setMode(!is3D);
        } else if (e.key === 'h' || e.key === 'H') {
            const panel = $('control-panel');
            if (panel && window.PoincareUI) {
                window.PoincareUI.setCollapsed(!panel.classList.contains('collapsed'));
            }
        }
    });

    // ─── Page Visibility ─────────────────────────────────────
    document.addEventListener('visibilitychange', () => {
        isPageHidden = document.hidden;
        if (isPageHidden) {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            lastTime = 0;
        } else {
            lastTime = 0;
            if (!is3D) markDirty();
            else ensureLoop();
        }
    });

    // ─── Boot ────────────────────────────────────────────────
    window.addEventListener('resize', resize);
    buildPaletteGrid();
    initTabKeyboard();
    initModeToggle();
    syncSkipMax();
    syncContextualControls();
    resize();
    ensureLoop();
})();
