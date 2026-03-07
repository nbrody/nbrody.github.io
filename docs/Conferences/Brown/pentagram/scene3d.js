// ============================================================
//  scene3d.js — Three.js 3D Pentagram Map Renderer
//  Initialized lazily by app.js when the user switches to 3D mode.
// ============================================================

(() => {
    'use strict';

    // ── Constants ────────────────────────────────────────────
    const LAYER_DEPTH = 120;  // z-gap between polygon layers
    const CAM_LEAD = 200;    // camera leads the deepest layer by this much
    const CAM_INITIAL = 500; // camera starting z (outside the tunnel entrance)
    const SLAB_BACK = 8000;  // depth of the initial half-space slab
    const CAM_LERP_PLAY = 0.04;  // camera smoothness when playing (lower = smoother)
    const CAM_LERP_IDLE = 0.06;  // camera smoothness when idle

    // ── Module state ─────────────────────────────────────────
    let renderer, scene, camera;
    let layerGroup, edgeGroup, diagGroup;
    let initialized = false;
    let animFrameId = null;

    let lastBuiltIter = -1;
    let lastBuiltSpiral = -1;
    let lastPaletteKey = null;

    // Smooth camera
    let camZ = CAM_INITIAL;
    let camZTarget = CAM_INITIAL;
    let camX = 0, camY = 0;
    let camXTarget = 0, camYTarget = 0;
    let userScrolled = false;  // true when user manually scrolls, pauses auto-fly

    // Per-layer centroids for camera centering (populated in rebuildScene)
    let layerCentroids = [];  // [{x, y, z}, ...]

    // Orbit drag
    let orbitDragging = false;
    let orbitLast = { x: 0, y: 0 };
    let orbitYaw = 0;  // radian rotation around Y
    let orbitPitch = 0; // radian rotation around X

    // ── Helpers ──────────────────────────────────────────────
    function hexCol(hex) { return new THREE.Color(hex); }

    function palColor(pal, idx) {
        return hexCol(pal.colors[idx % pal.colors.length]);
    }

    // Compute centroid of a polygon (in scene coords: y flipped)
    function polyCentroid(poly) {
        let sx = 0, sy = 0;
        for (const p of poly) { sx += p.x; sy += -p.y; }
        return { x: sx / poly.length, y: sy / poly.length };
    }

    // Build triangulated mesh + connecting lines between two polygon layers.
    // Creates a triangle strip: for each edge segment i→i+1 of the n-gon,
    // two triangles connect the outer ring to the inner ring:
    //   Tri 1: outer[i], outer[i+1], inner[i]
    //   Tri 2: outer[i+1], inner[i+1], inner[i]
    // Also returns connecting line segments from outer[i] to inner[i].
    function makeTriangulationGroup(outer, inner, zOuter, zInner, color, opacity) {
        const group = new THREE.Group();
        const n = outer.length;

        // --- Triangle faces ---
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

            // Tri 1: outer[i], outer[i+1], inner[i]
            pushTri(ox, oy, zOuter, ox1, oy1, zOuter, ix, iy, zInner);
            // Tri 2: outer[i+1], inner[i+1], inner[i]
            pushTri(ox1, oy1, zOuter, ix1, iy1, zInner, ix, iy, zInner);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const mat = new THREE.MeshPhongMaterial({
            color, transparent: true, opacity,
            side: THREE.DoubleSide, shininess: 40,
            depthWrite: false,
        });
        group.add(new THREE.Mesh(geo, mat));

        // --- Connecting lines (struts) from outer[i] to inner[i] ---
        const linePts = [];
        for (let i = 0; i < n; i++) {
            linePts.push(outer[i].x, -outer[i].y, zOuter);
            linePts.push(inner[i].x, -inner[i].y, zInner);
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
        const lineMat = new THREE.LineBasicMaterial({
            color, transparent: true, opacity: Math.min(1, opacity * 2.5),
        });
        group.add(new THREE.LineSegments(lineGeo, lineMat));

        return group;
    }

    // Build THREE.Shape from {x,y}[] polygon. Y is flipped for Three.js.
    function polyToShape(poly) {
        const s = new THREE.Shape();
        s.moveTo(poly[0].x, -poly[0].y);
        for (let i = 1; i < poly.length; i++) s.lineTo(poly[i].x, -poly[i].y);
        s.closePath();
        return s;
    }

    // Build a THREE.Path (not Shape) for use as a hole.
    // Using Path avoids any .holes nesting issues with Shape.
    function polyToPath(poly) {
        const p = new THREE.Path();
        p.moveTo(poly[0].x, -poly[0].y);
        for (let i = 1; i < poly.length; i++) p.lineTo(poly[i].x, -poly[i].y);
        p.closePath();
        return p;
    }

    // Extrude ring between outer and inner polygon
    function makeRingMesh(outer, inner, zPos, depth, color, opacity) {
        const outerShape = polyToShape(outer);
        const holePath = polyToPath(inner);
        outerShape.holes.push(holePath);

        const geo = new THREE.ExtrudeGeometry(outerShape, { depth, bevelEnabled: false });
        const mat = new THREE.MeshPhongMaterial({
            color, transparent: true, opacity,
            side: THREE.DoubleSide, shininess: 50,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = zPos;
        return mesh;
    }

    // Solid cap for innermost layer
    function makeCapMesh(poly, zPos, depth, color) {
        const shape = polyToShape(poly);
        const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        const mat = new THREE.MeshPhongMaterial({
            color, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, shininess: 80,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = zPos;
        return mesh;
    }

    // Polygon edge loop line
    function makeEdgeLine(poly, z, color) {
        const pts = poly.map(p => new THREE.Vector3(p.x, -p.y, z));
        pts.push(pts[0].clone());
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 1 }));
    }

    // Diagonal line segments (as LineSegments — pairs of points)
    function makeDiagLines(poly, skip, limit, z, color) {
        const n = poly.length;
        const positions = [];
        for (let i = 0; i < limit; i++) {
            const a = poly[i];
            const b = poly[(i + skip) % n];
            positions.push(a.x, -a.y, z, b.x, -b.y, z);
        }
        if (positions.length === 0) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return new THREE.LineSegments(geo,
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    }

    // Partial inner polygon edge (spiral preview)
    function intersect2D(p1, p2, p3, p4) {
        const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (Math.abs(den) < 1e-10) return { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }

    function makeSpiralEdge(poly, skip, limit, z, color) {
        const n = poly.length;
        const pts = [];
        for (let i = 0; i < limit - 1; i++) {
            const ip = intersect2D(poly[i], poly[(i + skip) % n], poly[(i + 1) % n], poly[(i + 1 + skip) % n]);
            pts.push(new THREE.Vector3(ip.x, -ip.y, z));
        }
        if (pts.length < 2) return null;
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    }

    // Big outer slab (half-space) — large square with polygon hole
    function makeHalfSpaceSlab(basePoly, pal) {
        const BIG = 3000;
        const outer = new THREE.Shape();
        outer.moveTo(-BIG, -BIG); outer.lineTo(BIG, -BIG);
        outer.lineTo(BIG, BIG); outer.lineTo(-BIG, BIG);
        outer.closePath();
        outer.holes.push(polyToPath(basePoly));

        const geo = new THREE.ExtrudeGeometry(outer, { depth: SLAB_BACK, bevelEnabled: false });
        const mat = new THREE.MeshPhongMaterial({
            color: palColor(pal, 0),
            transparent: true, opacity: 0.14,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = -SLAB_BACK; // extends from -SLAB_BACK to z=0
        return mesh;
    }

    // ── Rebuild scene geometry ────────────────────────────────
    function rebuildScene() {
        if (!initialized) return;

        const state = window.PentagramState;
        if (!state || !state.polygonHistory || state.polygonHistory.length === 0) return;

        const { polygonHistory: hist, spiralCounter, currentPaletteKey, PALETTES, skipValue, spiralMode } = state;
        const pal = PALETTES[currentPaletteKey];
        if (!pal) return;

        const iters = hist.length;

        clearGroup(layerGroup);
        clearGroup(edgeGroup);
        clearGroup(diagGroup);

        const bgCol = new THREE.Color(pal.bg);
        renderer.setClearColor(bgCol);
        scene.background = bgCol;
        if (scene.fog) scene.fog.color.copy(bgCol);

        // Build per-layer centroids for camera centering
        layerCentroids = [];
        for (let i = 0; i < iters; i++) {
            const c = polyCentroid(hist[i]);
            layerCentroids.push({ x: c.x, y: c.y, z: -i * LAYER_DEPTH });
        }

        try {
            // 1. Half-space slab (the infinite outer block)
            layerGroup.add(makeHalfSpaceSlab(hist[0], pal));

            // 2. Ring slabs between consecutive iterations
            for (let i = 0; i < iters - 1; i++) {
                const zPos = -i * LAYER_DEPTH;
                const color = palColor(pal, i);
                const ring = makeRingMesh(hist[i], hist[i + 1], zPos, LAYER_DEPTH, color, 0.78);
                layerGroup.add(ring);
            }

            // 3. Innermost solid cap
            const capZ = -(iters - 1) * LAYER_DEPTH;
            const capColor = palColor(pal, iters - 1);
            layerGroup.add(makeCapMesh(hist[iters - 1], capZ, LAYER_DEPTH, capColor));

            // 4. Edge lines for every polygon
            for (let i = 0; i < iters; i++) {
                const z = -i * LAYER_DEPTH + 1; // +1 to avoid z-fighting
                edgeGroup.add(makeEdgeLine(hist[i], z, palColor(pal, i)));
            }

            // 5. Triangulated faces + connecting lines between consecutive layers
            for (let i = 0; i < iters - 1; i++) {
                if (hist[i].length !== hist[i + 1].length) continue;
                const zOuter = -i * LAYER_DEPTH + 0.5;
                const zInner = -(i + 1) * LAYER_DEPTH + 0.5;
                const color = palColor(pal, i);
                const triGroup = makeTriangulationGroup(
                    hist[i], hist[i + 1], zOuter, zInner, color, 0.35
                );
                layerGroup.add(triGroup);
            }

            // 6. Spiral diagonals on the front face of the current layer
            if (spiralMode && iters > 0) {
                const curPoly = hist[iters - 1];
                const z = capZ + 1;
                const sc = Math.max(0, spiralCounter);
                if (sc > 0) {
                    const dc = palColor(pal, iters);
                    const dl = makeDiagLines(curPoly, skipValue, sc, z, dc);
                    if (dl) diagGroup.add(dl);
                    const se = makeSpiralEdge(curPoly, skipValue, sc, z + 0.5, palColor(pal, iters + 1));
                    if (se) diagGroup.add(se);
                }
            }
        } catch (err) {
            console.error('[Scene3D] Error building geometry:', err);
        }

        // Camera target: always fly toward the deepest layer in 3D mode
        // The camera leads the cap by CAM_LEAD, creating a fly-through effect
        const deepestZ = -(iters - 1) * LAYER_DEPTH;
        camZTarget = deepestZ + CAM_LEAD;

        // Set camera XY target to centroid of deepest layer
        if (layerCentroids.length > 0) {
            const deepest = layerCentroids[layerCentroids.length - 1];
            camXTarget = deepest.x;
            camYTarget = deepest.y;
        }

        lastBuiltIter = iters;
        lastBuiltSpiral = spiralCounter;
        lastPaletteKey = currentPaletteKey;
    }

    function clearGroup(grp) {
        while (grp.children.length > 0) {
            const c = grp.children[0];
            if (c.geometry) c.geometry.dispose();
            if (c.material && c.material.dispose) c.material.dispose();
            grp.remove(c);
        }
    }

    // Interpolate camera XY based on its current Z position among layer centroids
    function getCentroidAtZ(z) {
        if (layerCentroids.length === 0) return { x: 0, y: 0 };
        if (layerCentroids.length === 1) return { x: layerCentroids[0].x, y: layerCentroids[0].y };

        // Find which two layers the camera is between
        // layerCentroids[0].z = 0, layerCentroids[1].z = -LAYER_DEPTH, etc.
        for (let i = 0; i < layerCentroids.length - 1; i++) {
            const a = layerCentroids[i];
            const b = layerCentroids[i + 1];
            if (z >= b.z && z <= a.z) {
                // Interpolate between layers a and b
                const t = (a.z === b.z) ? 0 : (a.z - z) / (a.z - b.z);
                return {
                    x: a.x + (b.x - a.x) * t,
                    y: a.y + (b.y - a.y) * t,
                };
            }
        }

        // Camera is beyond the deepest layer — use the deepest centroid
        if (z < layerCentroids[layerCentroids.length - 1].z) {
            const d = layerCentroids[layerCentroids.length - 1];
            return { x: d.x, y: d.y };
        }
        // Camera is above the first layer — use the first centroid
        return { x: layerCentroids[0].x, y: layerCentroids[0].y };
    }

    // ── Animation loop ────────────────────────────────────────
    function animate() {
        animFrameId = requestAnimationFrame(animate);

        const state = window.PentagramState;
        if (state) {
            const n = state.polygonHistory.length;
            const sc = state.spiralCounter;
            const pal = state.currentPaletteKey;

            if (n !== lastBuiltIter || sc !== lastBuiltSpiral || pal !== lastPaletteKey) {
                rebuildScene();
            }

            // When playing, reset userScrolled so camera auto-flies
            if (state.isPlaying) {
                userScrolled = false;
            }

            // Smooth camera z — the target was set in rebuildScene
            const lerpSpeed = state.isPlaying ? CAM_LERP_PLAY : CAM_LERP_IDLE;
            if (!userScrolled) {
                camZ += (camZTarget - camZ) * lerpSpeed;
            }

            // Center camera XY on the interpolated centroid at current Z
            const centroid = getCentroidAtZ(camZ);
            camX += (centroid.x - camX) * 0.06;
            camY += (centroid.y - camY) * 0.06;

            camera.position.set(camX, camY, camZ);
            // Keep looking straight ahead (-Z) from the camera's current XY
            camera.lookAt(camX, camY, camZ - 10000);
        }

        // Apply orbit rotation to content groups
        layerGroup.rotation.y += (orbitYaw - layerGroup.rotation.y) * 0.1;
        layerGroup.rotation.x += (orbitPitch - layerGroup.rotation.x) * 0.1;
        edgeGroup.rotation.copy(layerGroup.rotation);
        diagGroup.rotation.copy(layerGroup.rotation);

        renderer.render(scene, camera);
    }

    // ── Initialize (called lazily on first 3D toggle) ─────────
    function init() {
        if (initialized) return;

        // Guard: make sure Three.js is loaded
        if (typeof THREE === 'undefined') {
            console.error('[Scene3D] THREE is not defined. Three.js may not have loaded.');
            return;
        }

        initialized = true;

        const container = document.getElementById('canvas3d-container');
        if (!container) {
            console.error('[Scene3D] #canvas3d-container not found');
            return;
        }

        const W = window.innerWidth;
        const H = window.innerHeight;

        try {
            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(W, H);
            renderer.setClearColor(0x0a0e1a);
            container.appendChild(renderer.domElement);

            // Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0e1a);
            scene.fog = new THREE.FogExp2(0x0a0e1a, 0.00035);

            // Camera — at +Z, looking toward -Z (into the tunnel)
            camera = new THREE.PerspectiveCamera(55, W / H, 1, 30000);
            camera.position.set(0, 0, CAM_INITIAL);
            camera.lookAt(0, 0, -99999);

            // Lights
            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const dl = new THREE.DirectionalLight(0xffffff, 1.0);
            dl.position.set(0, 300, 500);
            scene.add(dl);
            const bl = new THREE.DirectionalLight(0x6080ff, 0.4);
            bl.position.set(0, -200, -300);
            scene.add(bl);

            // Groups
            layerGroup = new THREE.Group();
            edgeGroup = new THREE.Group();
            diagGroup = new THREE.Group();
            scene.add(layerGroup, edgeGroup, diagGroup);

            // Orbit drag on the container
            container.addEventListener('mousedown', e => {
                if (e.button !== 0) return;
                orbitDragging = true;
                orbitLast = { x: e.clientX, y: e.clientY };
            });
            window.addEventListener('mousemove', e => {
                if (!orbitDragging) return;
                orbitYaw += (e.clientX - orbitLast.x) * 0.005;
                orbitPitch += (e.clientY - orbitLast.y) * 0.005;
                orbitPitch = Math.max(-0.8, Math.min(0.8, orbitPitch));
                orbitLast = { x: e.clientX, y: e.clientY };
            });
            window.addEventListener('mouseup', () => { orbitDragging = false; });

            // Scroll to dolly camera
            container.addEventListener('wheel', e => {
                e.preventDefault();
                userScrolled = true;
                camZ += e.deltaY * 0.8;  // immediate dolly on scroll
            }, { passive: false });

            // Resize
            window.addEventListener('resize', () => {
                if (!renderer) return;
                const nw = window.innerWidth, nh = window.innerHeight;
                renderer.setSize(nw, nh);
                camera.aspect = nw / nh;
                camera.updateProjectionMatrix();
            });

            // Do first build then start loop
            rebuildScene();
            animate();
            console.log('[Scene3D] Initialized successfully');
        } catch (err) {
            console.error('[Scene3D] Init error:', err);
            // Restore 2D mode if 3D fails
            initialized = false;
        }
    }

    // ── Public API ───────────────────────────────────────────
    window.Scene3D = { init, rebuildScene };

})();
