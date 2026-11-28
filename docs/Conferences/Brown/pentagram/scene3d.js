// ============================================================
//  scene3d.js — Three.js 3D Pentagram Map Renderer
//  Initialized lazily by app.js when the user switches to 3D mode.
// ============================================================

(() => {
    'use strict';

    // ── Constants ────────────────────────────────────────────
    const LAYER_DEPTH = 120;
    const CAM_LEAD = 200;
    const CAM_INITIAL = 500;
    const SLAB_BACK = 8000;
    const MAX_LAYERS_CAP = 300;

    // ── Module state ─────────────────────────────────────────
    let renderer, scene, camera;
    let contentGroup, layerGroup, triGroup, edgeGroup, diagGroup;
    let initialized = false;
    let isActive = false;
    let animFrameId = null;
    let lastFrameTime = 0;

    let lastBuiltIter = -1;
    let lastBuiltSpiral = -1;
    let lastPaletteKey = null;
    let lastRevision = -1;
    let lastMaxLayers = -1;

    // Incremental sliding-window cursors
    let builtStart = 0;
    let builtRingEnd = 0;
    let builtEdgeEnd = 0;
    let ringEntries = []; // [{ ringMesh, triObj }]
    let edgeEntries = []; // [line]
    let capMesh = null;
    let slabMesh = null;

    // Cached palette materials
    let matCacheKey = null;
    let matCache = null;

    // Smooth camera
    let camZ = CAM_INITIAL;
    let camZTarget = CAM_INITIAL;
    let camX = 0;
    let camY = 0;
    let userScrolled = false;

    // Per-layer centroids for camera centering
    let layerCentroids = [];

    // Orbit & auto-roll
    let orbitYaw = 0;
    let orbitPitch = 0;
    let autoRoll = 0;

    // Pointer tracking (supports 1-pointer orbit & 2-pointer pinch dolly)
    const activePointers = new Map();
    let pinchLastDist = 0;

    // ── Material Cache ───────────────────────────────────────
    function disposeMaterialCache() {
        if (!matCache) return;
        const disposeList = list => {
            if (!list) return;
            for (const m of list) m.dispose();
        };
        disposeList(matCache.rings);
        disposeList(matCache.tris);
        disposeList(matCache.struts);
        disposeList(matCache.edges);
        if (matCache.slab) matCache.slab.dispose();
        if (matCache.cap) matCache.cap.dispose();
        if (matCache.diag) matCache.diag.dispose();
        if (matCache.spiral) matCache.spiral.dispose();
        matCache = null;
        matCacheKey = null;
    }

    function ensureMaterialCache(palKey, pal) {
        if (matCacheKey === palKey && matCache) return;
        disposeMaterialCache();

        matCacheKey = palKey;
        matCache = {
            rings: pal.colors.map(hex => new THREE.MeshPhongMaterial({
                color: new THREE.Color(hex),
                transparent: true,
                opacity: 0.78,
                side: THREE.DoubleSide,
                shininess: 50,
            })),
            tris: pal.colors.map(hex => new THREE.MeshPhongMaterial({
                color: new THREE.Color(hex),
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
                shininess: 40,
                depthWrite: false,
            })),
            struts: pal.colors.map(hex => new THREE.LineBasicMaterial({
                color: new THREE.Color(hex),
                transparent: true,
                opacity: 0.85,
            })),
            edges: pal.colors.map(hex => new THREE.LineBasicMaterial({
                color: new THREE.Color(hex),
            })),
            slab: new THREE.MeshPhongMaterial({
                color: new THREE.Color(pal.colors[0]),
                transparent: true,
                opacity: 0.14,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
            cap: new THREE.MeshPhongMaterial({
                color: new THREE.Color(pal.colors[0]),
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                shininess: 80,
            }),
            diag: new THREE.LineBasicMaterial({
                color: new THREE.Color(pal.colors[0]),
                transparent: true,
                opacity: 0.7,
            }),
            spiral: new THREE.LineBasicMaterial({
                color: new THREE.Color(pal.colors[1] || pal.colors[0]),
            }),
        };
    }

    // ── Disposal Helpers ─────────────────────────────────────
    function disposeObjectGeometries(obj) {
        if (!obj) return;
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
        });
    }

    function removeAndDispose(parent, obj) {
        if (!obj) return;
        parent.remove(obj);
        disposeObjectGeometries(obj);
    }

    function clearGroup(grp) {
        while (grp.children.length > 0) {
            const c = grp.children[0];
            grp.remove(c);
            disposeObjectGeometries(c);
        }
    }

    // ── Geometry Builders ────────────────────────────────────
    function polyCentroid(poly) {
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < poly.length; i++) {
            sx += poly[i].x;
            sy += -poly[i].y;
        }
        return { x: sx / poly.length, y: sy / poly.length };
    }

    function makeTriangulationGroup(outer, inner, zOuter, zInner, cIdx) {
        const group = new THREE.Group();
        const n = outer.length;

        const positions = [];
        const normals = [];

        function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz) {
            positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= len; ny /= len; nz /= len;
            normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        }

        for (let i = 0; i < n; i++) {
            const i1 = (i + 1) % n;
            const ox = outer[i].x, oy = -outer[i].y;
            const ox1 = outer[i1].x, oy1 = -outer[i1].y;
            const ix = inner[i].x, iy = -inner[i].y;
            const ix1 = inner[i1].x, iy1 = -inner[i1].y;

            pushTri(ox, oy, zOuter, ox1, oy1, zOuter, ix, iy, zInner);
            pushTri(ox1, oy1, zOuter, ix1, iy1, zInner, ix, iy, zInner);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        group.add(new THREE.Mesh(geo, matCache.tris[cIdx]));

        const linePts = [];
        for (let i = 0; i < n; i++) {
            linePts.push(outer[i].x, -outer[i].y, zOuter);
            linePts.push(inner[i].x, -inner[i].y, zInner);
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
        group.add(new THREE.LineSegments(lineGeo, matCache.struts[cIdx]));

        return group;
    }

    function polyToShape(poly) {
        const s = new THREE.Shape();
        s.moveTo(poly[0].x, -poly[0].y);
        for (let i = 1; i < poly.length; i++) s.lineTo(poly[i].x, -poly[i].y);
        s.closePath();
        return s;
    }

    function polyToPath(poly) {
        const p = new THREE.Path();
        p.moveTo(poly[0].x, -poly[0].y);
        for (let i = 1; i < poly.length; i++) p.lineTo(poly[i].x, -poly[i].y);
        p.closePath();
        return p;
    }

    function makeRingMesh(outer, inner, zPos, depth, cIdx) {
        const outerShape = polyToShape(outer);
        outerShape.holes.push(polyToPath(inner));
        const geo = new THREE.ExtrudeGeometry(outerShape, { depth, bevelEnabled: false });
        const mesh = new THREE.Mesh(geo, matCache.rings[cIdx]);
        mesh.position.z = zPos;
        return mesh;
    }

    function makeCapMesh(poly, zPos, depth, pal, iterIdx) {
        matCache.cap.color.set(pal.colors[iterIdx % pal.colors.length]);
        const shape = polyToShape(poly);
        const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        const mesh = new THREE.Mesh(geo, matCache.cap);
        mesh.position.z = zPos;
        return mesh;
    }

    function makeEdgeLine(poly, z, cIdx) {
        const n = poly.length;
        const positions = new Float32Array((n + 1) * 3);
        for (let i = 0; i < n; i++) {
            positions[i * 3] = poly[i].x;
            positions[i * 3 + 1] = -poly[i].y;
            positions[i * 3 + 2] = z;
        }
        positions[n * 3] = poly[0].x;
        positions[n * 3 + 1] = -poly[0].y;
        positions[n * 3 + 2] = z;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return new THREE.Line(geo, matCache.edges[cIdx]);
    }

    function makeDiagLines(poly, skip, limit, z, pal, colorIdx) {
        const n = poly.length;
        const positions = [];
        for (let i = 0; i < limit; i++) {
            const a = poly[i];
            const b = poly[(i + skip) % n];
            positions.push(a.x, -a.y, z, b.x, -b.y, z);
        }
        if (positions.length === 0) return null;
        matCache.diag.color.set(pal.colors[colorIdx % pal.colors.length]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return new THREE.LineSegments(geo, matCache.diag);
    }

    function intersect2D(p1, p2, p3, p4) {
        const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (Math.abs(den) < 1e-10) {
            return { x: (p2.x + p3.x) * 0.5, y: (p2.y + p3.y) * 0.5 };
        }
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }

    function makeSpiralEdge(poly, skip, limit, z, pal, colorIdx) {
        const n = poly.length;
        const pts = [];
        for (let i = 0; i < limit - 1; i++) {
            const ip = intersect2D(poly[i], poly[(i + skip) % n], poly[(i + 1) % n], poly[(i + 1 + skip) % n]);
            pts.push(new THREE.Vector3(ip.x, -ip.y, z));
        }
        if (pts.length < 2) return null;
        matCache.spiral.color.set(pal.colors[colorIdx % pal.colors.length]);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        return new THREE.Line(geo, matCache.spiral);
    }

    function makeHalfSpaceSlab(basePoly) {
        const BIG = 3000;
        const outer = new THREE.Shape();
        outer.moveTo(-BIG, -BIG);
        outer.lineTo(BIG, -BIG);
        outer.lineTo(BIG, BIG);
        outer.lineTo(-BIG, BIG);
        outer.closePath();
        outer.holes.push(polyToPath(basePoly));

        const geo = new THREE.ExtrudeGeometry(outer, { depth: SLAB_BACK, bevelEnabled: false });
        const mesh = new THREE.Mesh(geo, matCache.slab);
        mesh.position.z = -SLAB_BACK;
        return mesh;
    }

    // ── Rebuild Scene Geometry (Sliding Window + Incremental) ─
    function rebuildScene() {
        if (!initialized) return;

        const state = window.PentagramState;
        if (!state || !state.polygonHistory || state.polygonHistory.length === 0) return;

        const {
            polygonHistory: hist,
            spiralCounter,
            currentPaletteKey,
            PALETTES,
            skipValue,
            spiralMode,
            historyRevision,
            maxTrails,
        } = state;

        const pal = PALETTES[currentPaletteKey];
        if (!pal) return;

        ensureMaterialCache(currentPaletteKey, pal);

        const iters = hist.length;
        const maxLayers = Math.min(Math.max(10, maxTrails || 200), MAX_LAYERS_CAP);
        const windowStart = Math.max(0, iters - maxLayers);

        const fullRebuild =
            builtEdgeEnd === 0 ||
            currentPaletteKey !== lastPaletteKey ||
            historyRevision !== lastRevision ||
            iters < builtEdgeEnd ||
            windowStart < builtStart;

        if (fullRebuild) {
            clearGroup(layerGroup);
            clearGroup(triGroup);
            clearGroup(edgeGroup);
            ringEntries = [];
            edgeEntries = [];
            builtStart = windowStart;
            builtRingEnd = windowStart;
            builtEdgeEnd = windowStart;
            capMesh = null;
            slabMesh = null;
        }
        clearGroup(diagGroup);

        // Trim oldest layers when advancing past the sliding window
        while (builtStart < windowStart) {
            if (ringEntries.length > 0) {
                const entry = ringEntries.shift();
                removeAndDispose(layerGroup, entry.ringMesh);
                removeAndDispose(triGroup, entry.triObj);
            }
            if (edgeEntries.length > 0) {
                const edgeObj = edgeEntries.shift();
                removeAndDispose(edgeGroup, edgeObj);
            }
            if (builtStart === 0 && slabMesh) {
                removeAndDispose(layerGroup, slabMesh);
                slabMesh = null;
            }
            builtStart++;
        }

        const bgCol = new THREE.Color(pal.bg);
        renderer.setClearColor(bgCol);
        scene.background = bgCol;
        if (scene.fog) scene.fog.color.copy(bgCol);

        // Per-layer centroids for camera centering
        layerCentroids = new Array(iters);
        for (let i = 0; i < iters; i++) {
            const c = polyCentroid(hist[i]);
            layerCentroids[i] = { x: c.x, y: c.y, z: -i * LAYER_DEPTH };
        }

        // 1. Half-space slab (only when layer 0 is in window)
        if (builtStart === 0 && !slabMesh) {
            try {
                slabMesh = makeHalfSpaceSlab(hist[0]);
                layerGroup.add(slabMesh);
            } catch (err) {
                console.warn('[Scene3D] Half-space slab skipped:', err);
            }
        }

        const colorCount = pal.colors.length;

        // 2. Ring slabs + triangulation between consecutive iterations (append-only)
        for (let i = builtRingEnd; i < iters - 1; i++) {
            const zPos = -i * LAYER_DEPTH;
            const cIdx = i % colorCount;

            let ringMesh = null;
            try {
                ringMesh = makeRingMesh(hist[i], hist[i + 1], zPos, LAYER_DEPTH, cIdx);
                layerGroup.add(ringMesh);
            } catch (err) {
                // Skip degenerate/self-intersecting ring extrusions without halting edges/cap
            }

            let triObj = null;
            if (hist[i].length === hist[i + 1].length && hist[i].length >= 3) {
                try {
                    const zOuter = -i * LAYER_DEPTH + 0.5;
                    const zInner = -(i + 1) * LAYER_DEPTH + 0.5;
                    triObj = makeTriangulationGroup(hist[i], hist[i + 1], zOuter, zInner, cIdx);
                    triGroup.add(triObj);
                } catch (err) {
                    // Continue gracefully
                }
            }
            ringEntries.push({ ringMesh, triObj });
        }
        builtRingEnd = Math.max(builtRingEnd, iters - 1);

        // 3. Edge lines for every polygon in window (append-only)
        for (let i = builtEdgeEnd; i < iters; i++) {
            const z = -i * LAYER_DEPTH + 1;
            const cIdx = i % colorCount;
            const line = makeEdgeLine(hist[i], z, cIdx);
            edgeGroup.add(line);
            edgeEntries.push(line);
        }
        builtEdgeEnd = iters;

        // 4. Innermost solid cap
        if (capMesh) {
            removeAndDispose(layerGroup, capMesh);
            capMesh = null;
        }
        const capZ = -(iters - 1) * LAYER_DEPTH;
        try {
            capMesh = makeCapMesh(hist[iters - 1], capZ, LAYER_DEPTH, pal, iters - 1);
            layerGroup.add(capMesh);
        } catch (err) {
            // Continue gracefully
        }

        // 5. Diagonals / spiral preview on current front layer
        if (iters > 0) {
            const curPoly = hist[iters - 1];
            const z = capZ + 1;
            if (spiralMode && spiralCounter > 0) {
                const dl = makeDiagLines(curPoly, skipValue, spiralCounter, z, pal, iters);
                if (dl) diagGroup.add(dl);
                const se = makeSpiralEdge(curPoly, skipValue, spiralCounter, z + 0.5, pal, iters + 1);
                if (se) diagGroup.add(se);
            } else if (state.showDiagonals) {
                const dl = makeDiagLines(curPoly, skipValue, curPoly.length, z, pal, iters - 1);
                if (dl) diagGroup.add(dl);
            }
        }

        // Camera target
        const deepestZ = -(iters - 1) * LAYER_DEPTH;
        camZTarget = deepestZ + CAM_LEAD;

        lastBuiltIter = iters;
        lastBuiltSpiral = spiralCounter;
        lastPaletteKey = currentPaletteKey;
        lastRevision = historyRevision;
        lastMaxLayers = maxLayers;
    }

    function getCentroidAtZ(z) {
        if (layerCentroids.length === 0) return { x: 0, y: 0 };
        if (layerCentroids.length === 1) return { x: layerCentroids[0].x, y: layerCentroids[0].y };

        for (let i = 0; i < layerCentroids.length - 1; i++) {
            const a = layerCentroids[i];
            const b = layerCentroids[i + 1];
            if (z >= b.z && z <= a.z) {
                const t = a.z === b.z ? 0 : (a.z - z) / (a.z - b.z);
                return {
                    x: a.x + (b.x - a.x) * t,
                    y: a.y + (b.y - a.y) * t,
                };
            }
        }

        if (z < layerCentroids[layerCentroids.length - 1].z) {
            const d = layerCentroids[layerCentroids.length - 1];
            return { x: d.x, y: d.y };
        }
        return { x: layerCentroids[0].x, y: layerCentroids[0].y };
    }

    // ── Animation Loop ────────────────────────────────────────
    function animate(now) {
        if (!isActive || document.hidden) {
            animFrameId = null;
            lastFrameTime = 0;
            return;
        }
        animFrameId = requestAnimationFrame(animate);

        const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.1) : 1 / 60;
        lastFrameTime = now;

        const state = window.PentagramState;
        if (state) {
            const n = state.polygonHistory.length;
            const sc = state.spiralCounter;
            const pal = state.currentPaletteKey;
            const rev = state.historyRevision;
            const maxL = Math.min(Math.max(10, state.maxTrails || 200), MAX_LAYERS_CAP);

            if (
                n !== lastBuiltIter ||
                sc !== lastBuiltSpiral ||
                pal !== lastPaletteKey ||
                rev !== lastRevision ||
                maxL !== lastMaxLayers
            ) {
                rebuildScene();
            }

            // Toggle layer visibility instantaneously without rebuilding geometry
            triGroup.visible = !!state.showTriangulation;
            diagGroup.visible = !!state.showDiagonals || !!state.spiralMode;

            if (state.isPlaying) {
                userScrolled = false;
            }

            // Frame-rate independent exponential smoothing
            const camRate = state.isPlaying ? 2.5 : 3.8;
            const camAlpha = 1 - Math.exp(-dt * camRate);
            if (!userScrolled) {
                camZ += (camZTarget - camZ) * camAlpha;
            }

            const centroid = getCentroidAtZ(camZ);
            const xyAlpha = 1 - Math.exp(-dt * 3.8);
            camX += (centroid.x - camX) * xyAlpha;
            camY += (centroid.y - camY) * xyAlpha;

            camera.position.set(camX, camY, camZ);
            camera.lookAt(camX, camY, camZ - 10000);

            if (state.autoRotate) {
                autoRoll += ((state.rotateSpeed * Math.PI) / 180) * (dt * 60);
            }
        }

        const orbitAlpha = 1 - Math.exp(-dt * 7);
        contentGroup.rotation.y += (orbitYaw - contentGroup.rotation.y) * orbitAlpha;
        contentGroup.rotation.x += (orbitPitch - contentGroup.rotation.x) * orbitAlpha;
        contentGroup.rotation.z = autoRoll;

        renderer.render(scene, camera);
    }

    // ── Lifecycle & Controls ──────────────────────────────────
    function setActive(active) {
        isActive = !!active;
        if (!initialized) return;
        if (isActive && !document.hidden) {
            rebuildScene();
            if (!animFrameId) {
                lastFrameTime = 0;
                animFrameId = requestAnimationFrame(animate);
            }
        } else if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
            lastFrameTime = 0;
        }
    }

    function resetView() {
        orbitYaw = 0;
        orbitPitch = 0;
        autoRoll = 0;
        userScrolled = false;
        const state = window.PentagramState;
        const iters = state && state.polygonHistory ? state.polygonHistory.length : 1;
        camZTarget = -(iters - 1) * LAYER_DEPTH + CAM_LEAD;
    }

    function captureDataURL() {
        if (!initialized || !renderer || !scene || !camera) return null;
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
    }

    // ── Initialize (called lazily on first 3D toggle) ─────────
    function init() {
        if (initialized) return;

        if (typeof THREE === 'undefined') {
            console.error('[Scene3D] THREE is not defined. Three.js may not have loaded.');
            return;
        }

        const container = document.getElementById('canvas3d-container');
        if (!container) {
            console.error('[Scene3D] #canvas3d-container not found');
            return;
        }

        initialized = true;
        const W = window.innerWidth;
        const H = window.innerHeight;

        try {
            renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: false,
                preserveDrawingBuffer: false,
            });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(W, H);
            renderer.setClearColor(0x0a0e1a);
            container.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0e1a);
            scene.fog = new THREE.FogExp2(0x0a0e1a, 0.00035);

            camera = new THREE.PerspectiveCamera(55, W / H, 1, 30000);
            camera.position.set(0, 0, CAM_INITIAL);
            camera.lookAt(0, 0, -99999);

            scene.add(new THREE.AmbientLight(0xffffff, 0.55));
            const dl = new THREE.DirectionalLight(0xffffff, 1.0);
            dl.position.set(0, 300, 500);
            scene.add(dl);
            const bl = new THREE.DirectionalLight(0x6080ff, 0.45);
            bl.position.set(0, -200, -300);
            scene.add(bl);

            contentGroup = new THREE.Group();
            layerGroup = new THREE.Group();
            triGroup = new THREE.Group();
            edgeGroup = new THREE.Group();
            diagGroup = new THREE.Group();
            contentGroup.add(layerGroup, triGroup, edgeGroup, diagGroup);
            scene.add(contentGroup);

            // Pointer Events for orbit & touch pinch dolly
            container.addEventListener('pointerdown', e => {
                if (e.button !== 0 && e.pointerType === 'mouse') return;
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                try { container.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
                if (activePointers.size === 2) {
                    const pts = Array.from(activePointers.values());
                    pinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
                }
            });

            container.addEventListener('pointermove', e => {
                const prev = activePointers.get(e.pointerId);
                if (!prev) return;
                const dx = e.clientX - prev.x;
                const dy = e.clientY - prev.y;
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

                if (activePointers.size === 1) {
                    orbitYaw += dx * 0.005;
                    orbitPitch = Math.max(-0.8, Math.min(0.8, orbitPitch + dy * 0.005));
                } else if (activePointers.size === 2) {
                    const pts = Array.from(activePointers.values());
                    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
                    userScrolled = true;
                    camZ += (pinchLastDist - dist) * 2.5;
                    pinchLastDist = dist;
                }
            });

            const releasePointer = e => {
                activePointers.delete(e.pointerId);
            };
            container.addEventListener('pointerup', releasePointer);
            container.addEventListener('pointercancel', releasePointer);

            container.addEventListener('dblclick', () => resetView());

            container.addEventListener('wheel', e => {
                e.preventDefault();
                userScrolled = true;
                camZ += e.deltaY * 0.8;
            }, { passive: false });

            window.addEventListener('resize', () => {
                if (!renderer) return;
                const nw = window.innerWidth;
                const nh = window.innerHeight;
                renderer.setSize(nw, nh);
                camera.aspect = nw / nh;
                camera.updateProjectionMatrix();
            });

            document.addEventListener('visibilitychange', () => {
                if (!isActive) return;
                if (document.hidden) {
                    if (animFrameId) {
                        cancelAnimationFrame(animFrameId);
                        animFrameId = null;
                    }
                    lastFrameTime = 0;
                } else if (!animFrameId) {
                    lastFrameTime = 0;
                    animFrameId = requestAnimationFrame(animate);
                }
            });

            rebuildScene();
        } catch (err) {
            console.error('[Scene3D] Init error:', err);
            initialized = false;
        }
    }

    // ── Public API ───────────────────────────────────────────
    window.Scene3D = {
        init,
        rebuildScene,
        setActive,
        resetView,
        captureDataURL,
    };
})();
