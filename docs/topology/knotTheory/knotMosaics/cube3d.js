/**
 * cube3d.js — Three.js cube folding with 3D tube strands + elbow connectors
 * Uses global THREE and THREE.OrbitControls from CDN.
 */
(function () {
    let scene, camera, renderer, controls;
    let cubeGroup, pivots = {}, meshes = {}, strandGroups = {}, elbowGroup;
    let animId = null, isFolded = false;

    const FOLD_DURATION = 1500;
    const FACES = ['front', 'top', 'bottom', 'left', 'right', 'back'];
    const FOLD_TARGETS = {
        top: { axis: 'x', angle: -Math.PI / 2 },
        bottom: { axis: 'x', angle: Math.PI / 2 },
        left: { axis: 'y', angle: -Math.PI / 2 },
        right: { axis: 'y', angle: Math.PI / 2 },
        back: { axis: 'y', angle: Math.PI / 2 },
    };

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    // ── Scene ──
    function init() {
        const c = document.getElementById('cube-canvas');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0e1a);
        camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
        camera.position.set(0, 1.5, 5);
        renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true });
        renderer.setSize(innerWidth, innerHeight);
        renderer.setPixelRatio(devicePixelRatio);
        controls = new THREE.OrbitControls(camera, c);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const d = new THREE.DirectionalLight(0xffffff, 0.7);
        d.position.set(3, 4, 5); scene.add(d);
        const d2 = new THREE.DirectionalLight(0x8888ff, 0.3);
        d2.position.set(-2, -1, 3); scene.add(d2);
    }

    function faceParent(n) { return n === 'front' ? cubeGroup : pivots[n]; }

    // ── Build Net ──
    function buildNet() {
        if (cubeGroup) scene.remove(cubeGroup);
        cubeGroup = new THREE.Group(); scene.add(cubeGroup);
        pivots = {}; meshes = {}; strandGroups = {};

        const geo = new THREE.PlaneGeometry(1, 1);
        FACES.forEach(n => {
            const tc = window.renderFaceTexture(n, true);
            const tex = new THREE.CanvasTexture(tc);
            tex.minFilter = THREE.LinearFilter;
            meshes[n] = new THREE.Mesh(geo.clone(),
                new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        });

        meshes.front.position.set(0, 0, 0);
        cubeGroup.add(meshes.front);

        [['top', 0, 0.5, 0, 0.5], ['bottom', 0, -0.5, 0, -0.5],
        ['left', -0.5, 0, -0.5, 0], ['right', 0.5, 0, 0.5, 0]].forEach(([n, px, py, mx, my]) => {
            pivots[n] = new THREE.Group();
            pivots[n].position.set(px, py, 0);
            cubeGroup.add(pivots[n]);
            meshes[n].position.set(mx, my, 0);
            pivots[n].add(meshes[n]);
        });

        pivots.back = new THREE.Group();
        pivots.back.position.set(1, 0, 0);
        pivots.right.add(pivots.back);
        meshes.back.position.set(0.5, 0, 0);
        pivots.back.add(meshes.back);

        FACES.forEach(n => {
            const e = new THREE.LineSegments(
                new THREE.EdgesGeometry(geo),
                new THREE.LineBasicMaterial({ color: 0x3a4570 }));
            e.name = 'edge'; meshes[n].add(e);
        });

        buildStrands();
        buildElbows();
        isFolded = false;
        Object.keys(pivots).forEach(n => pivots[n].rotation.set(0, 0, 0));
    }

    // ── 3D Tube Strands ──
    function buildStrands() {
        const st = window.getAppState();
        const fs = st.faceSize, cs = 1 / fs;
        const tubeR = cs * 0.07;
        const zB = tubeR * 1.5, zO = tubeR * 4.5;
        const mat = new THREE.MeshStandardMaterial({
            color: st.strandColor, roughness: 0.35, metalness: 0.1,
            emissive: new THREE.Color(st.strandColor), emissiveIntensity: 0.15
        });

        FACES.forEach(n => {
            const g = new THREE.Group();
            strandGroups[n] = g;
            faceParent(n).add(g);
            g.position.copy(meshes[n].position);

            for (let r = 0; r < fs; r++) {
                for (let c = 0; c < fs; c++) {
                    const ti = st.grid[n]?.[r]?.[c] ?? 0;
                    if (ti <= 0) continue;
                    tileCurves(ti, r, c, fs, zB, zO).forEach(cv => {
                        const segs = cv.getPoints ? 24 : 4;
                        g.add(new THREE.Mesh(
                            new THREE.TubeGeometry(cv, segs, tubeR, 8, false), mat));
                    });
                }
            }
        });
    }

    function tileCurves(ti, row, col, fs, zB, zO) {
        const cs = 1 / fs, h = cs / 2;
        const x0 = -0.5 + col * cs, y0 = 0.5 - row * cs;
        const N = [x0 + h, y0], S = [x0 + h, y0 - cs], W = [x0, y0 - h], E = [x0 + cs, y0 - h];
        const TL = [x0, y0], TR = [x0 + cs, y0], BL = [x0, y0 - cs], BR = [x0 + cs, y0 - cs];

        const tile = TILE_TYPES[ti];
        if (!tile) return [];
        switch (tile.id) {
            case 'horizontal': return [ln(W, E, zB)];
            case 'vertical': return [ln(N, S, zB)];
            case 'arc_ne': return [arc(TR, Math.PI, 1.5 * Math.PI, h, zB)];
            case 'arc_nw': return [arc(TL, 0, -Math.PI / 2, h, zB)];
            case 'arc_se': return [arc(BR, Math.PI, Math.PI / 2, h, zB)];
            case 'arc_sw': return [arc(BL, 0, Math.PI / 2, h, zB)];
            case 'cross_pos': return [ln(N, S, zB), ln(W, E, zO)];
            case 'cross_neg': return [ln(W, E, zB), ln(N, S, zO)];
            case 'double_arc_nesw': return [arc(TR, Math.PI, 1.5 * Math.PI, h, zB), arc(BL, 0, Math.PI / 2, h, zB)];
            case 'double_arc_nwse': return [arc(TL, 0, -Math.PI / 2, h, zB), arc(BR, Math.PI, Math.PI / 2, h, zB)];
            default: return [];
        }
    }

    function ln(a, b, z) {
        return new THREE.LineCurve3(new THREE.Vector3(a[0], a[1], z), new THREE.Vector3(b[0], b[1], z));
    }
    function arc(ctr, sa, ea, r, z, n) {
        n = n || 20;
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const a = sa + (i / n) * (ea - sa);
            pts.push(new THREE.Vector3(ctr[0] + r * Math.cos(a), ctr[1] + r * Math.sin(a), z));
        }
        return new THREE.CatmullRomCurve3(pts);
    }

    // ── Elbow connectors ──
    // For each strand endpoint at a face edge, add a quarter-circle tube
    // curving from z=zBase to z=0, extending slightly past the edge.
    // When folded, elbows from adjacent faces meet at cube edges.
    function buildElbows() {
        if (elbowGroup) { elbowGroup.parent?.remove(elbowGroup); }
        const st = window.getAppState();
        const fs = st.faceSize, cs = 1 / fs;
        const tubeR = cs * 0.07;
        const zB = tubeR * 1.5;
        const mat = new THREE.MeshStandardMaterial({
            color: st.strandColor, roughness: 0.35, metalness: 0.1,
            emissive: new THREE.Color(st.strandColor), emissiveIntensity: 0.15
        });

        FACES.forEach(name => {
            const g = strandGroups[name];
            if (!g) return;

            for (let r = 0; r < fs; r++) {
                for (let c = 0; c < fs; c++) {
                    const ti = st.grid[name]?.[r]?.[c] ?? 0;
                    if (ti <= 0) continue;
                    const tile = TILE_TYPES[ti];
                    if (!tile) continue;
                    const h = cs / 2;
                    const x0 = -0.5 + c * cs, y0 = 0.5 - r * cs;

                    // Check each edge: if tile connects AND cell is at face boundary
                    if (tile.connections.N && r === 0) {
                        addElbow(g, x0 + h, 0.5, zB, tubeR, 'N', mat);
                    }
                    if (tile.connections.S && r === fs - 1) {
                        addElbow(g, x0 + h, -0.5, zB, tubeR, 'S', mat);
                    }
                    if (tile.connections.E && c === fs - 1) {
                        addElbow(g, 0.5, y0 - h, zB, tubeR, 'E', mat);
                    }
                    if (tile.connections.W && c === 0) {
                        addElbow(g, -0.5, y0 - h, zB, tubeR, 'W', mat);
                    }
                }
            }
        });
    }

    function addElbow(group, ex, ey, zB, tubeR, edge, mat) {
        // Quarter-circle from (ex, ey, zB) curving out past the edge to (ex±zB, ey, 0)
        const pts = [];
        const n = 10;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const angle = (Math.PI / 2) * (1 - t); // from 90° down to 0°
            const z = zB * Math.sin(angle);
            const outward = zB * Math.cos(angle);
            let x = ex, y = ey;
            if (edge === 'N') y += outward;
            else if (edge === 'S') y -= outward;
            else if (edge === 'E') x += outward;
            else if (edge === 'W') x -= outward;
            pts.push(new THREE.Vector3(x, y, z));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(curve, 10, tubeR, 8, false);
        group.add(new THREE.Mesh(tube, mat));
    }

    // ── Fold Animation ──
    function animateFold(fold) {
        const s = {}, e = {};
        Object.keys(FOLD_TARGETS).forEach(n => {
            const ft = FOLD_TARGETS[n];
            s[n] = fold ? 0 : ft.angle;
            e[n] = fold ? ft.angle : 0;
        });
        const t0 = performance.now();
        function step(now) {
            const t = Math.min((now - t0) / FOLD_DURATION, 1);
            const p = ease(t);
            Object.keys(FOLD_TARGETS).forEach(n => {
                const ft = FOLD_TARGETS[n];
                const a = s[n] + (e[n] - s[n]) * p;
                if (ft.axis === 'x') pivots[n].rotation.x = a;
                else pivots[n].rotation.y = a;
            });
            controls.update(); renderer.render(scene, camera);
            if (t < 1) { animId = requestAnimationFrame(step); }
            else {
                isFolded = fold;
                controls.target.set(0, 0, fold ? -0.5 : 0);
                controls.update(); loop();
            }
        }
        if (animId) cancelAnimationFrame(animId);
        animId = requestAnimationFrame(step);
    }

    function loop() {
        if (animId) cancelAnimationFrame(animId);
        (function run() {
            controls.update(); renderer.render(scene, camera);
            animId = requestAnimationFrame(run);
        })();
    }

    // ── Toggle Grid ──
    function setStrandsOnly(on) {
        FACES.forEach(n => { meshes[n].visible = !on; });
    }

    function onResize() {
        if (!renderer) return;
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    }

    // ── Public API ──
    window.openCubeFold = function () {
        document.getElementById('cube-overlay').style.display = 'block';
        document.getElementById('cube-hide-grid').checked = false;
        if (!renderer) init();
        onResize(); buildNet(); loop();
        setTimeout(() => animateFold(true), 300);
    };

    window.closeCubeFold = function () {
        document.getElementById('cube-overlay').style.display = 'none';
        if (animId) { cancelAnimationFrame(animId); animId = null; }
    };

    document.getElementById('cube-close-btn').addEventListener('click', window.closeCubeFold);
    document.getElementById('cube-unfold-btn').addEventListener('click', () => animateFold(!isFolded));
    document.getElementById('cube-hide-grid').addEventListener('change', e => setStrandsOnly(e.target.checked));
    window.addEventListener('resize', onResize);
})();
