// ============================================================
//  scene3d.js — Three.js 3D Pentagram Map Renderer
//  Receives state from app.js via window.PentagramState.
// ============================================================

(() => {
    'use strict';

    // ── Wait for Three.js ────────────────────────────────────
    function waitForThree(cb) {
        if (typeof THREE !== 'undefined') cb();
        else setTimeout(() => waitForThree(cb), 50);
    }

    waitForThree(init);

    // ── Scene globals ────────────────────────────────────────
    let renderer, scene, camera;
    let layerGroup;       // Group containing all slab meshes
    let edgeGroup;        // Group containing polygon edge lines
    let diagGroup;        // Group containing diagonal lines (spiral mode)
    let lastBuiltIter = -1;
    let lastBuiltSpiral = -1;
    let lastBuiltPaletteKey = null;

    const LAYER_DEPTH = 80;   // z-distance between consecutive polygon layers
    const SCALE = 1.0;  // world-space polygon coords → Three.js units (already centred)
    const SLAB_BACK = 6000; // how far back the initial slab extends (the "half-space")
    const CAM_OFFSET = 420;  // camera sits this far in front of the current layer

    // ── Colour helpers ───────────────────────────────────────
    function hexToThreeColor(hex) {
        return new THREE.Color(hex);
    }

    function paletteColor(pal, index) {
        return hexToThreeColor(pal.colors[index % pal.colors.length]);
    }

    // ── Build a THREE.Shape from a polygon array {x,y} ──────
    function polygonToShape(poly) {
        const shape = new THREE.Shape();
        shape.moveTo(poly[0].x * SCALE, -poly[0].y * SCALE); // flip y for Three.js
        for (let i = 1; i < poly.length; i++) {
            shape.lineTo(poly[i].x * SCALE, -poly[i].y * SCALE);
        }
        shape.closePath();
        return shape;
    }

    // ── Subtract inner shape from outer shape (ring/annulus) ─
    //    Returns an ExtrudeGeometry representing the frame
    //    between polygon[i] and polygon[i+1].
    function buildSlabGeometry(outerPoly, innerPoly, thickness) {
        const outerShape = polygonToShape(outerPoly);
        const innerShape = polygonToShape(innerPoly);
        outerShape.holes.push(innerShape);

        const geo = new THREE.ExtrudeGeometry(outerShape, {
            depth: thickness,
            bevelEnabled: false,
        });
        return geo;
    }

    // ── Build a capped slab for the deepest (last) layer ────
    function buildCapGeometry(poly, thickness) {
        const shape = polygonToShape(poly);
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: false,
        });
        return geo;
    }

    // ── Build the initial infinite slab (before any cuts) ───
    //    This is a big box extruded far back, with the base
    //    polygon as a hole — so only the "outside" rim is solid.
    //    We fake it as a large square with the polygon as a hole.
    function buildInitialSlab(basePoly, z0, pal) {
        // Large outer boundary
        const outerShape = new THREE.Shape();
        const BIG = 2000;
        outerShape.moveTo(-BIG, -BIG);
        outerShape.lineTo(BIG, -BIG);
        outerShape.lineTo(BIG, BIG);
        outerShape.lineTo(-BIG, BIG);
        outerShape.closePath();

        // Hole = the innermost polygon
        const hole = polygonToShape(basePoly);
        outerShape.holes.push(hole);

        const geo = new THREE.ExtrudeGeometry(outerShape, {
            depth: SLAB_BACK,
            bevelEnabled: false,
        });

        const mat = new THREE.MeshPhongMaterial({
            color: paletteColor(pal, 0),
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = z0 - SLAB_BACK;
        return mesh;
    }

    // ── Build polygon edge loop as a Line ────────────────────
    function buildEdgeLine(poly, z, color, lineWidth) {
        const points = poly.map(p => new THREE.Vector3(p.x * SCALE, -p.y * SCALE, z));
        points.push(points[0].clone()); // close
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: lineWidth || 2 });
        return new THREE.Line(geo, mat);
    }

    // ── Build diagonal lines for spiral animation ───────────
    function buildDiagonalLines(poly, z, skip, limit, color) {
        const n = poly.length;
        const points = [];
        for (let i = 0; i < limit; i++) {
            const a = poly[i];
            const b = poly[(i + skip) % n];
            points.push(new THREE.Vector3(a.x * SCALE, -a.y * SCALE, z));
            points.push(new THREE.Vector3(b.x * SCALE, -b.y * SCALE, z));
        }
        if (points.length === 0) return null;
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineSegmentsGeometry
            ? new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
            : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
        return new THREE.LineSegments(geo, mat);
    }

    // ── Build partial inner polygon (spiral: cut so far) ────
    function buildSpiralPartialEdge(poly, skip, limit, z, color) {
        // Compute intersection points 0..limit-1
        const n = poly.length;
        const pts = [];
        for (let i = 0; i < limit; i++) {
            const a1 = poly[i];
            const a2 = poly[(i + skip) % n];
            const b1 = poly[(i + 1) % n];
            const b2 = poly[(i + 1 + skip) % n];
            if (i < limit - 1) {
                const ip = intersect2D(a1, a2, b1, b2);
                pts.push(new THREE.Vector3(ip.x * SCALE, -ip.y * SCALE, z));
            }
        }
        if (pts.length < 2) return null;
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
        return new THREE.Line(geo, mat);
    }

    function intersect2D(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < 1e-10) return { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }

    // ── Main rebuild — called whenever polygon state changes ─
    function rebuildScene() {
        const state = window.PentagramState;
        if (!state) return;

        const { polygonHistory, spiralCounter, currentPaletteKey, PALETTES, skipValue, spiralMode } = state;
        const pal = PALETTES[currentPaletteKey];
        const iters = polygonHistory.length;

        // Nothing to draw
        if (iters === 0) return;

        // Clear old geometry
        clearGroup(layerGroup);
        clearGroup(edgeGroup);
        clearGroup(diagGroup);

        const skip = skipValue;
        const bgColor = new THREE.Color(pal.bg);
        renderer.setClearColor(bgColor, 1);
        scene.background = bgColor;

        // ── 1. Initial half-space slab (outermost boundary) ─
        const initMesh = buildInitialSlab(polygonHistory[0], 0, pal);
        layerGroup.add(initMesh);

        // ── 2. Annular slabs for each consecutive pair ───────
        for (let i = 0; i < iters - 1; i++) {
            const outer = polygonHistory[i];
            const inner = polygonHistory[i + 1];
            const z = -i * LAYER_DEPTH;
            const depth = LAYER_DEPTH;

            const geo = buildSlabGeometry(outer, inner, depth);
            const colorHex = pal.colors[i % pal.colors.length];
            const mat = new THREE.MeshPhongMaterial({
                color: hexToThreeColor(colorHex),
                transparent: true,
                opacity: 0.72,
                side: THREE.DoubleSide,
                shininess: 60,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.z = z;
            layerGroup.add(mesh);
        }

        // ── 3. Innermost solid cap ───────────────────────────
        const lastPoly = polygonHistory[iters - 1];
        const lastZ = -(iters - 1) * LAYER_DEPTH;
        const capGeo = buildCapGeometry(lastPoly, LAYER_DEPTH * 2);
        const capColor = paletteColor(pal, iters - 1);
        const capMat = new THREE.MeshPhongMaterial({
            color: capColor,
            transparent: true,
            opacity: 0.88,
            side: THREE.FrontSide,
            shininess: 80,
        });
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.position.z = lastZ;
        layerGroup.add(capMesh);

        // ── 4. Edge lines for each polygon ───────────────────
        for (let i = 0; i < iters; i++) {
            const z = -i * LAYER_DEPTH;
            const color = paletteColor(pal, i);
            const line = buildEdgeLine(polygonHistory[i], z + 0.5, color, 2);
            edgeGroup.add(line);
        }

        // ── 5. Spiral overlay on the current layer ───────────
        if (spiralMode && iters > 0) {
            const curPoly = polygonHistory[iters - 1];
            const curZ = lastZ + 0.5;
            const sc = Math.max(0, spiralCounter);

            const diagColor = paletteColor(pal, iters);

            if (sc > 0) {
                const diagLines = buildDiagonalLines(curPoly, curZ, skip, sc, diagColor);
                if (diagLines) diagGroup.add(diagLines);

                const partialEdge = buildSpiralPartialEdge(curPoly, skip, sc, curZ + 0.5, paletteColor(pal, iters + 1));
                if (partialEdge) diagGroup.add(partialEdge);
            }
        }

        // Record what we built
        lastBuiltIter = iters;
        lastBuiltSpiral = state.spiralCounter;
        lastBuiltPaletteKey = currentPaletteKey;
    }

    // ── Clear a Group's children ─────────────────────────────
    function clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            group.remove(child);
        }
    }

    // ── Smooth camera target ─────────────────────────────────
    const camTarget = { z: 300 };  // current smooth position
    const camTargetPos = { z: 300 }; // desired position

    // ── Init Three.js scene ──────────────────────────────────
    function init() {
        const container = document.getElementById('canvas3d-container');
        if (!container) return;

        // ── Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = false;
        container.appendChild(renderer.domElement);

        // ── Scene
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x0a0e1a, 0.0006);

        // ── Camera — looks down -Z (into the tunnel)
        camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 1, 20000);
        camera.position.set(0, 0, CAM_OFFSET); // starts in front of layer 0
        camera.lookAt(0, 0, -10000);

        // Allow manual orbit if user drags (simple mouse handler)
        setupOrbit(container);

        // ── Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(0, 400, 600);
        scene.add(dirLight);

        const backLight = new THREE.DirectionalLight(0x8080ff, 0.35);
        backLight.position.set(0, -200, -400);
        scene.add(backLight);

        // ── Groups
        layerGroup = new THREE.Group();
        edgeGroup = new THREE.Group();
        diagGroup = new THREE.Group();
        scene.add(layerGroup);
        scene.add(edgeGroup);
        scene.add(diagGroup);

        // ── Resize handler
        window.addEventListener('resize', onResize);

        // ── Tick
        animate();
    }

    // ── Simple orbit (drag to rotate scene slightly) ─────────
    let orbitDragging = false;
    let orbitLast = { x: 0, y: 0 };
    const orbitAngle = { x: 0, y: 0 }; // extra rotation applied to groups

    function setupOrbit(container) {
        container.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            orbitDragging = true;
            orbitLast = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mousemove', e => {
            if (!orbitDragging) return;
            const dx = e.clientX - orbitLast.x;
            const dy = e.clientY - orbitLast.y;
            orbitAngle.y += dx * 0.004;
            orbitAngle.x += dy * 0.004;
            orbitLast = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => { orbitDragging = false; });

        // Scroll to zoom (offset camera along z)
        container.addEventListener('wheel', e => {
            e.preventDefault();
            camTargetPos.z += e.deltaY * 0.5;
        }, { passive: false });
    }

    // ── Animation loop ────────────────────────────────────────
    let frameId;
    function animate() {
        frameId = requestAnimationFrame(animate);

        const state = window.PentagramState;
        if (state) {
            const iters = state.polygonHistory.length;
            const spiralNow = state.spiralCounter;

            // Rebuild geometry when state changes
            if (iters !== lastBuiltIter ||
                spiralNow !== lastBuiltSpiral ||
                state.currentPaletteKey !== lastBuiltPaletteKey) {
                rebuildScene();
            }

            // ── Camera target: sit just in front of the current (innermost) layer
            if (state.autoZoom) {
                const targetLayerZ = -(iters - 1) * LAYER_DEPTH + CAM_OFFSET;
                camTargetPos.z = targetLayerZ;
            }

            // Smooth camera z
            camTarget.z += (camTargetPos.z - camTarget.z) * 0.06;
            camera.position.z = camTarget.z;

            // Apply gentle orbit rotation to layer groups
            layerGroup.rotation.y += (orbitAngle.y - layerGroup.rotation.y) * 0.08;
            layerGroup.rotation.x += (orbitAngle.x - layerGroup.rotation.x) * 0.08;
            edgeGroup.rotation.copy(layerGroup.rotation);
            diagGroup.rotation.copy(layerGroup.rotation);
        }

        renderer.render(scene, camera);
    }

    // ── Resize ────────────────────────────────────────────────
    function onResize() {
        const container = document.getElementById('canvas3d-container');
        if (!container || !renderer) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    // ── Public API ───────────────────────────────────────────
    window.Scene3D = { rebuildScene };

})();
