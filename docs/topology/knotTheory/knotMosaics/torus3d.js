/**
 * torus3d.js — Three.js torus folding with 3D tube strands
 */
(function () {
    let scene, camera, renderer, controls;
    let mainGroup, baseGeoms = [];
    let animId = null, isFolded = false;

    const FOLD_DURATION = 2000;

    // Geometry storage for morphing
    // { mesh, geom, flatPositions, normals, type }
    let morphTargets = [];

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function init() {
        const c = document.getElementById('cube-canvas');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0e1a);
        camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
        camera.position.set(0, 2, 5);
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

    function buildModel() {
        if (mainGroup) scene.remove(mainGroup);
        mainGroup = new THREE.Group(); scene.add(mainGroup);
        morphTargets = [];

        const showGrid = !document.getElementById('cube-hide-grid').checked;
        const st = window.getAppState();
        const gs = st.gridSize;

        // 1. Surface Plane (highly subdivided for smooth bending)
        const planeGeo = new THREE.PlaneGeometry(1, 1, gs * 8, gs * 8);
        const tc = window.renderTorusTexture(showGrid, false);
        const tex = new THREE.CanvasTexture(tc);
        tex.minFilter = THREE.LinearFilter;
        const planeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        mainGroup.add(planeMesh);
        registerMorph(planeMesh);

        // Grid lines (edges) - disabled for torus to avoid z-fighting issues during bend
        // unless we want a border

        // 2. 3D Tube Strands
        const cs = 1 / gs;
        const tubeR = cs * 0.07;
        const zB = tubeR * 1.5, zO = tubeR * 4.5;
        const mat = new THREE.MeshStandardMaterial({
            color: st.strandColor, roughness: 0.35, metalness: 0.1,
            emissive: new THREE.Color(st.strandColor), emissiveIntensity: 0.15
        });

        for (let r = 0; r < gs; r++) {
            for (let c = 0; c < gs; c++) {
                const ti = st.grid[r]?.[c] ?? 0;
                if (ti <= 0) continue;
                tileCurves(ti, r, c, gs, zB, zO).forEach(cv => {
                    const segs = cv.getPoints ? 24 : 4;
                    const tubeGeo = new THREE.TubeGeometry(cv, segs, tubeR, 8, false);
                    const mesh = new THREE.Mesh(tubeGeo, mat);
                    mainGroup.add(mesh);
                    registerMorph(mesh);
                });
            }
        }

        isFolded = false;
        applyFold(0); // flat
    }

    function tileCurves(ti, row, col, gs, zB, zO) {
        const cs = 1 / gs, h = cs / 2;
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

    // ── Morphing Logic ──
    function registerMorph(mesh) {
        const geom = mesh.geometry;
        const posAttr = geom.attributes.position;
        const flatPositions = new Float32Array(posAttr.array);
        morphTargets.push({ mesh, geom, flatPositions });
    }

    // fold t: 0 to 1
    function applyFold(t) {
        // We do a continuous morph:
        // t=0 to 0.5: roll flat plane into a cylinder along X
        // t=0.5 to 1.0: roll cylinder into a torus along Y

        const fold1 = Math.min(t * 2, 1.0);       // Cylinder phase
        const fold2 = Math.max(0, (t * 2) - 1.0); // Torus phase

        const R_minor = 1.0 / (2.0 * Math.PI);
        const R_major = 2.0 * R_minor;

        for (const target of morphTargets) {
            const { geom, flatPositions } = target;
            const posAttr = geom.attributes.position;
            const arr = posAttr.array;

            for (let i = 0; i < arr.length; i += 3) {
                const px = flatPositions[i];
                const py = flatPositions[i + 1];
                const pz = flatPositions[i + 2];

                // Base coordinates (flat)
                let x = px;
                let y = py;
                let z = pz;

                // Phase 1: Cylinder (bend around Y axis, so X rolls up)
                if (fold1 > 0) {
                    // u goes -0.5 to 0.5
                    const angle1 = px * 2.0 * Math.PI * fold1;
                    const r1 = R_minor + pz; // thickness pushes outward

                    // Linear blend for intermediate states
                    // If fold1=1, x = R_minor * sin, z = R_minor * cos. 
                    // But we want it to sit at z=pz initially.
                    const targetX = r1 * Math.sin(angle1);
                    const targetZ = r1 * Math.cos(angle1) - R_minor;

                    x = px * (1 - fold1) + targetX * fold1;
                    z = pz * (1 - fold1) + targetZ * fold1;
                }

                // Phase 2: Torus (bend around X axis, so Y rolls up)
                if (fold2 > 0) {
                    const angle2 = py * 2.0 * Math.PI * fold2;
                    // Current distance from rotation center:
                    // Torus major axis is at z = -R_minor
                    // We rotate the Y-Z plane around (x=0, z=-R_minor - R_major)

                    const cy = 0;
                    const cz = -R_minor - R_major; // center of the torus hole

                    const dy = y - cy;
                    const dz = z - cz;
                    const dist = Math.sqrt(dy * dy + dz * dz); // should be R_major + offset

                    // Actually, simpler mapping:
                    // Treat y as the angle, and push everything out by R_major
                    const t_angle2 = py * 2.0 * Math.PI * fold2;
                    // Distance from tube center to current point
                    const tube_x = x;
                    const tube_z = z + R_minor; // relative to tube center

                    const R_current = R_major + tube_z;

                    const targetTorusY = R_current * Math.sin(t_angle2);
                    const targetTorusZ = R_current * Math.cos(t_angle2) - R_major - R_minor;

                    y = y * (1 - fold2) + targetTorusY * fold2;
                    z = z * (1 - fold2) + targetTorusZ * fold2;
                }

                arr[i] = x;
                arr[i + 1] = y;
                arr[i + 2] = z;
            }

            posAttr.needsUpdate = true;
            geom.computeVertexNormals();
        }
    }

    // ── Animation ──
    function animateFold(fold) {
        const s = fold ? 0 : 1;
        const e = fold ? 1 : 0;

        const t0 = performance.now();
        function step(now) {
            const t = Math.min((now - t0) / FOLD_DURATION, 1);
            const p = ease(t);
            applyFold(s + (e - s) * p);

            controls.update();
            renderer.render(scene, camera);
            if (t < 1) {
                animId = requestAnimationFrame(step);
            } else {
                isFolded = fold;
                controls.target.set(0, 0, fold ? -(1.0 / (2.0 * Math.PI)) * 3 : 0);
                controls.update();
                loop();
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

    // ── Grid Toggle ──
    function updateTextures(strandsOnly) {
        if (!mainGroup || morphTargets.length === 0) return;
        const planeTarget = morphTargets[0]; // the first one is the plane

        const tc = window.renderTorusTexture(!strandsOnly, strandsOnly);
        const tex = new THREE.CanvasTexture(tc);
        tex.minFilter = THREE.LinearFilter;

        planeTarget.mesh.material.map = tex;
        planeTarget.mesh.material.transparent = strandsOnly;
        planeTarget.mesh.visible = !strandsOnly; // Can just hide it completely
        planeTarget.mesh.material.needsUpdate = true;
    }

    function onResize() {
        if (!renderer) return;
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    }

    // ── Public API ──
    window.openTorusFold = function () {
        const uiBtn = document.getElementById('cube-unfold-btn');
        uiBtn.textContent = 'Unfold';
        uiBtn.onclick = () => {
            animateFold(!isFolded);
            uiBtn.textContent = isFolded ? 'Unfold' : 'Fold';
        };

        document.getElementById('cube-overlay').style.display = 'block';
        document.getElementById('cube-hide-grid').checked = false;

        if (!renderer) init();
        onResize();
        buildModel();
        loop();
        setTimeout(() => {
            animateFold(true);
            uiBtn.textContent = 'Unfold';
        }, 300);
    };

    // Override the close logic to handle torus
    const originalClose = window.closeCubeFold;
    window.closeCubeFold = function () {
        document.getElementById('cube-overlay').style.display = 'none';
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        if (originalClose) originalClose();
    };

    // Handle the existing toggle so it works for both depending on what's active
    const domToggle = document.getElementById('cube-hide-grid');
    const oldChange = domToggle.onchange;
    domToggle.addEventListener('change', e => {
        if (state.surface === 'torus') {
            updateTextures(e.target.checked);
        }
        // cube3d's listener will also run, but it won't crash if it checks existence
    });

    window.addEventListener('resize', onResize);
})();
