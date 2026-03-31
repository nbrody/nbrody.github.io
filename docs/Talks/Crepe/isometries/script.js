/* ================================================================
   Isometries Visualizer — Main Script
   Four modes: Line, Plane, Sphere, Hyperbolic Plane
   ================================================================ */

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────
    const state = {
        mode: 'line',
        animating: false,
        animProgress: 0,
        animSpeed: 1,
        // line
        lineIsometry: 'translation',
        lineTranslate: 2,
        lineReflectCenter: 0,
        // plane
        planeIsometry: 'translation',
        planeDirection: 0,
        planeDistance: 2,
        planeAngle: 45,
        planeCx: 0,
        planeCy: 0,
        planeMirrorAngle: 0,
        planeGlideAngle: 0,
        planeGlideDist: 2,
        // sphere
        sphereLat: 90,
        sphereLon: 0,
        sphereAngle: 60,
        // hyperbolic
        hypIsometry: 'h-translation',
        hypDirection: 0,
        hypDistance: 0.5,
        hypAngle: 30,
        hypBoundaryPoint: 0,
        hypStrength: 0.3,
    };

    // ── DOM refs ──────────────────────────────────────────
    const canvas = document.getElementById('viz-canvas');
    const ctx = canvas.getContext('2d');
    const threeContainer = document.getElementById('three-container');
    const infoText = document.getElementById('info-text');
    const btnAnimate = document.getElementById('btn-animate');
    const btnReset = document.getElementById('btn-reset');

    // ── Canvas sizing ─────────────────────────────────────
    function resizeCanvas() {
        const main = document.getElementById('viz-main');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = main.clientWidth * dpr;
        canvas.height = main.clientHeight * dpr;
        canvas.style.width = main.clientWidth + 'px';
        canvas.style.height = main.clientHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        if (state.mode === 'sphere') resizeSphere();
        draw();
    });

    // ── Color palette ─────────────────────────────────────
    const colors = {
        grid: 'rgba(124, 138, 255, 0.08)',
        gridMajor: 'rgba(124, 138, 255, 0.18)',
        accent: '#7c8aff',
        accentWarm: '#f59e0b',
        accentTeal: '#2dd4bf',
        accentRose: '#f472b6',
        accentViolet: '#a78bfa',
        original: 'rgba(124, 138, 255, 0.6)',
        transformed: 'rgba(245, 158, 11, 0.85)',
        axis: 'rgba(45, 212, 191, 0.5)',
        point: '#7c8aff',
        pointTransformed: '#f59e0b',
        geodesic: 'rgba(124, 138, 255, 0.25)',
        diskBorder: 'rgba(124, 138, 255, 0.3)',
    };

    // ── Coordinate system helpers ─────────────────────────
    function getViewport() {
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        return { w, h, cx: w / 2, cy: h / 2 };
    }

    function getScale(mode) {
        const { w, h } = getViewport();
        const s = Math.min(w, h);
        if (mode === 'line') return s / 14;
        if (mode === 'plane') return s / 14;
        if (mode === 'hyperbolic') return s / 2.6;
        return s / 12;
    }

    function toScreen(x, y, scale) {
        const { cx, cy } = getViewport();
        return [cx + x * scale, cy - y * scale];
    }

    // ══════════════════════════════════════════════════════
    //  SHAPE DEFINITIONS — a letter "F" for orientation
    // ══════════════════════════════════════════════════════

    // The "F" shape helps visualize orientation (distinguishes from its reflection)
    function getFShape() {
        // An "F" centered roughly around (0,0), unit-ish size
        return [
            { x: 0, y: 0 },
            { x: 0, y: 1.6 },
            { x: 0.9, y: 1.6 },
            { x: 0.9, y: 1.3 },
            { x: 0.3, y: 1.3 },
            { x: 0.3, y: 1.0 },
            { x: 0.7, y: 1.0 },
            { x: 0.7, y: 0.7 },
            { x: 0.3, y: 0.7 },
            { x: 0.3, y: 0 },
        ];
    }

    // Transform shape by applying (x,y) -> (ax+by+tx, cx+dy+ty)
    function transformShape(shape, a, b, c, d, tx, ty) {
        return shape.map(p => ({
            x: a * p.x + b * p.y + tx,
            y: c * p.x + d * p.y + ty,
        }));
    }

    function lerpShape(s1, s2, t) {
        return s1.map((p, i) => ({
            x: p.x + (s2[i].x - p.x) * t,
            y: p.y + (s2[i].y - p.y) * t,
        }));
    }

    function drawShape(ctx, shape, scale, fillColor, strokeColor = null, lineWidth = 2) {
        if (shape.length === 0) return;
        ctx.beginPath();
        const [sx, sy] = toScreen(shape[0].x, shape[0].y, scale);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < shape.length; i++) {
            const [px, py] = toScreen(shape[i].x, shape[i].y, scale);
            ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }

    // ══════════════════════════════════════════════════════
    //  GRID DRAWING
    // ══════════════════════════════════════════════════════

    function drawGrid2D(scale) {
        const { w, h, cx, cy } = getViewport();
        const range = Math.ceil(Math.max(w, h) / scale / 2) + 1;

        ctx.lineWidth = 1;
        for (let i = -range; i <= range; i++) {
            const isMajor = i === 0;
            ctx.strokeStyle = isMajor ? colors.gridMajor : colors.grid;
            ctx.lineWidth = isMajor ? 1.5 : 0.5;

            // Vertical
            const x = cx + i * scale;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();

            // Horizontal
            const y = cy + i * scale;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
    }

    function drawLineGrid(scale) {
        const { w, cx, cy } = getViewport();
        const range = Math.ceil(w / scale / 2) + 1;

        // Number line
        ctx.strokeStyle = colors.gridMajor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

        // Ticks
        for (let i = -range; i <= range; i++) {
            const x = cx + i * scale;
            ctx.strokeStyle = i === 0 ? colors.accent : colors.gridMajor;
            ctx.lineWidth = i === 0 ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(x, cy - 8); ctx.lineTo(x, cy + 8); ctx.stroke();

            // Labels
            if (Math.abs(i) <= 8) {
                ctx.fillStyle = colors.accent;
                ctx.font = '11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(i.toString(), x, cy + 24);
            }
        }
    }

    // ══════════════════════════════════════════════════════
    //  LINE MODE
    // ══════════════════════════════════════════════════════

    function drawLine() {
        const { w, h, cx, cy } = getViewport();
        const scale = getScale('line');
        ctx.clearRect(0, 0, w, h);

        drawLineGrid(scale);

        const t = state.animating ? easeInOut(state.animProgress) : 0;

        // Points along the line to show
        const pts = [];
        for (let i = -6; i <= 6; i++) pts.push(i);

        // Draw original points  
        pts.forEach(p => {
            const [sx, sy] = toScreen(p, 0, scale);
            ctx.beginPath();
            ctx.arc(sx, sy, 6, 0, Math.PI * 2);
            ctx.fillStyle = colors.original;
            ctx.fill();
        });

        // Transformed points
        if (state.lineIsometry === 'translation') {
            const offset = state.lineTranslate * t;
            pts.forEach(p => {
                const tp = p + offset;
                const [sx, sy] = toScreen(tp, 0, scale);
                ctx.beginPath();
                ctx.arc(sx, sy - 18, 6, 0, Math.PI * 2);
                ctx.fillStyle = colors.transformed;
                ctx.fill();
            });

            // Arrow showing translation
            if (t > 0) {
                const [ax, ay] = toScreen(0, 0, scale);
                const [bx, by] = toScreen(offset, 0, scale);
                drawArrow(ctx, ax, ay - 40, bx, by - 40, colors.accentWarm, 2);
            }

            infoText.textContent = `Translation: x ↦ x + ${state.lineTranslate.toFixed(1)}`;
        } else {
            // Reflection: x -> 2c - x
            const c = state.lineReflectCenter;
            pts.forEach(p => {
                const reflected = 2 * c - p;
                const tp = p + (reflected - p) * t;
                const [sx, sy] = toScreen(tp, 0, scale);
                ctx.beginPath();
                ctx.arc(sx, sy - 18, 6, 0, Math.PI * 2);
                ctx.fillStyle = colors.transformed;
                ctx.fill();
            });

            // Reflection axis
            const [rx, ry] = toScreen(c, 0, scale);
            ctx.strokeStyle = colors.accentTeal;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(rx, cy - 60);
            ctx.lineTo(rx, cy + 60);
            ctx.stroke();
            ctx.setLineDash([]);

            infoText.textContent = `Reflection about x = ${c.toFixed(1)}: x ↦ ${(2 * c).toFixed(1)} − x`;
        }
    }

    // ══════════════════════════════════════════════════════
    //  PLANE MODE
    // ══════════════════════════════════════════════════════

    function getPlaneTransform(t) {
        const type = state.planeIsometry;
        if (type === 'translation') {
            const θ = state.planeDirection * Math.PI / 180;
            const d = state.planeDistance * t;
            return { a: 1, b: 0, c: 0, d: 1, tx: d * Math.cos(θ), ty: d * Math.sin(θ) };
        }
        if (type === 'rotation') {
            const θ = state.planeAngle * Math.PI / 180 * t;
            const cos = Math.cos(θ), sin = Math.sin(θ);
            const px = state.planeCx, py = state.planeCy;
            return {
                a: cos, b: -sin, c: sin, d: cos,
                tx: px - cos * px + sin * py,
                ty: py - sin * px - cos * py,
            };
        }
        if (type === 'reflection') {
            const θ = state.planeMirrorAngle * Math.PI / 180;
            const cos2 = Math.cos(2 * θ), sin2 = Math.sin(2 * θ);
            // Full reflection matrix, interpolated from identity
            const a = 1 + (cos2 - 1) * t;
            const b = sin2 * t;
            const cc = sin2 * t;
            const d2 = 1 + (-cos2 - 1) * t;
            return { a, b: b, c: cc, d: d2, tx: 0, ty: 0 };
        }
        if (type === 'glide') {
            const θ = state.planeGlideAngle * Math.PI / 180;
            const cos2 = Math.cos(2 * θ), sin2 = Math.sin(2 * θ);
            // Reflection part
            const ra = 1 + (cos2 - 1) * t;
            const rb = sin2 * t;
            const rc = sin2 * t;
            const rd = 1 + (-cos2 - 1) * t;
            // Translation along mirror line
            const gd = state.planeGlideDist * t;
            return { a: ra, b: rb, c: rc, d: rd, tx: gd * Math.cos(θ), ty: gd * Math.sin(θ) };
        }
        return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    }

    function drawPlane() {
        const { w, h } = getViewport();
        const scale = getScale('plane');
        ctx.clearRect(0, 0, w, h);

        drawGrid2D(scale);

        const t = state.animating ? easeInOut(state.animProgress) : 0;
        const tf = getPlaneTransform(t);

        // Original "F" shape positioned at (1, 0.5)
        const baseShape = getFShape().map(p => ({ x: p.x + 0.5, y: p.y - 0.3 }));
        const transformedShape = transformShape(baseShape, tf.a, tf.b, tf.c, tf.d, tf.tx, tf.ty);

        // Draw original
        drawShape(ctx, baseShape, scale, 'rgba(124, 138, 255, 0.15)', colors.accent, 2);

        // Draw transformed
        drawShape(ctx, transformedShape, scale, 'rgba(245, 158, 11, 0.2)', colors.accentWarm, 2);

        // Draw some reference points and their images
        const refPoints = [
            { x: 0, y: 0 }, { x: 2, y: 2 }, { x: -2, y: 1 },
            { x: 3, y: -1 }, { x: -1, y: -2 }, { x: 1, y: 3 },
        ];

        refPoints.forEach(p => {
            const [sx, sy] = toScreen(p.x, p.y, scale);
            ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2);
            ctx.fillStyle = colors.original; ctx.fill();

            const tp = { x: tf.a * p.x + tf.b * p.y + tf.tx, y: tf.c * p.x + tf.d * p.y + tf.ty };
            const [tsx, tsy] = toScreen(tp.x, tp.y, scale);
            ctx.beginPath(); ctx.arc(tsx, tsy, 4, 0, Math.PI * 2);
            ctx.fillStyle = colors.transformed; ctx.fill();

            if (t > 0.01) {
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tsx, tsy); ctx.stroke();
            }
        });

        // Visual aids depending on type
        if (state.planeIsometry === 'rotation') {
            const [pcx, pcy] = toScreen(state.planeCx, state.planeCy, scale);
            ctx.beginPath(); ctx.arc(pcx, pcy, 6, 0, Math.PI * 2);
            ctx.fillStyle = colors.accentTeal; ctx.fill();
            ctx.strokeStyle = 'rgba(45, 212, 191, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(pcx, pcy, 3 * scale, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (state.planeIsometry === 'reflection' || state.planeIsometry === 'glide') {
            const θ = (state.planeIsometry === 'reflection' ? state.planeMirrorAngle : state.planeGlideAngle) * Math.PI / 180;
            const len = 8;
            const [x1, y1] = toScreen(-len * Math.cos(θ), -len * Math.sin(θ), scale);
            const [x2, y2] = toScreen(len * Math.cos(θ), len * Math.sin(θ), scale);
            ctx.strokeStyle = colors.accentTeal;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 5]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Info
        const type = state.planeIsometry;
        if (type === 'translation') {
            infoText.textContent = `Translation: direction ${state.planeDirection}°, distance ${state.planeDistance.toFixed(1)}`;
        } else if (type === 'rotation') {
            infoText.textContent = `Rotation: ${state.planeAngle}° about (${state.planeCx.toFixed(1)}, ${state.planeCy.toFixed(1)})`;
        } else if (type === 'reflection') {
            infoText.textContent = `Reflection: mirror line at ${state.planeMirrorAngle}°`;
        } else {
            infoText.textContent = `Glide reflection: mirror ${state.planeGlideAngle}°, glide ${state.planeGlideDist.toFixed(1)}`;
        }
    }

    // ══════════════════════════════════════════════════════
    //  SPHERE MODE (Three.js)
    // ══════════════════════════════════════════════════════

    let sphereScene, sphereCamera, sphereRenderer, sphereMesh, sphereAxisHelper;
    let sphereOrbitPoints = [];
    let sphereInitialized = false;

    function initSphere() {
        if (sphereInitialized) return;
        sphereInitialized = true;

        sphereScene = new THREE.Scene();

        const main = document.getElementById('viz-main');
        const w = main.clientWidth;
        const h = main.clientHeight;
        sphereCamera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
        sphereCamera.position.set(0, 0, 3.5);

        sphereRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        sphereRenderer.setPixelRatio(window.devicePixelRatio);
        sphereRenderer.setSize(w, h);
        sphereRenderer.setClearColor(0x060a14, 1);
        threeContainer.appendChild(sphereRenderer.domElement);

        // Sphere wireframe
        const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
        const sphereWireGeo = new THREE.WireframeGeometry(sphereGeo);
        const wireframeMat = new THREE.LineBasicMaterial({
            color: 0x7c8aff,
            transparent: true,
            opacity: 0.12,
        });
        const wireframe = new THREE.LineSegments(sphereWireGeo, wireframeMat);
        sphereScene.add(wireframe);

        // Solid sphere with texture-like appearance
        const sphereMat = new THREE.MeshPhongMaterial({
            color: 0x1a1f3e,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            shininess: 60,
        });
        sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        sphereScene.add(sphereMesh);

        // Latitude/longitude lines 
        for (let lat = -60; lat <= 60; lat += 30) {
            const latRad = lat * Math.PI / 180;
            const r = Math.cos(latRad);
            const y = Math.sin(latRad);
            const curve = new THREE.BufferGeometry();
            const pts = [];
            for (let i = 0; i <= 64; i++) {
                const θ = (i / 64) * Math.PI * 2;
                pts.push(r * Math.cos(θ), y, r * Math.sin(θ));
            }
            curve.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const line = new THREE.Line(curve, new THREE.LineBasicMaterial({
                color: 0x7c8aff, transparent: true, opacity: 0.08
            }));
            sphereScene.add(line);
        }
        for (let lon = 0; lon < 180; lon += 30) {
            const lonRad = lon * Math.PI / 180;
            const curve = new THREE.BufferGeometry();
            const pts = [];
            for (let i = 0; i <= 64; i++) {
                const φ = (i / 64) * Math.PI * 2;
                pts.push(Math.cos(φ) * Math.cos(lonRad), Math.sin(φ), Math.cos(φ) * Math.sin(lonRad));
            }
            curve.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const line = new THREE.Line(curve, new THREE.LineBasicMaterial({
                color: 0x7c8aff, transparent: true, opacity: 0.08
            }));
            sphereScene.add(line);
        }

        // Equator
        const eqGeo = new THREE.BufferGeometry();
        const eqPts = [];
        for (let i = 0; i <= 128; i++) {
            const θ = (i / 128) * Math.PI * 2;
            eqPts.push(Math.cos(θ), 0, Math.sin(θ));
        }
        eqGeo.setAttribute('position', new THREE.Float32BufferAttribute(eqPts, 3));
        sphereScene.add(new THREE.Line(eqGeo, new THREE.LineBasicMaterial({
            color: 0x7c8aff, transparent: true, opacity: 0.25
        })));

        // Lights
        sphereScene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const key = new THREE.DirectionalLight(0xccd0ff, 0.8);
        key.position.set(3, 4, 5);
        sphereScene.add(key);

        // Reference points on the sphere — a pattern we can see rotate
        createSpherePoints();

        // Mouse rotation of viewing angle
        let isDragging = false;
        let prevMouse = { x: 0, y: 0 };
        let sphereRotation = { x: 0.3, y: 0 };

        sphereRenderer.domElement.addEventListener('pointerdown', e => {
            isDragging = true;
            prevMouse = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('pointermove', e => {
            if (!isDragging) return;
            const dx = e.clientX - prevMouse.x;
            const dy = e.clientY - prevMouse.y;
            sphereRotation.y += dx * 0.005;
            sphereRotation.x += dy * 0.005;
            sphereRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, sphereRotation.x));
            prevMouse = { x: e.clientX, y: e.clientY };
            updateSphereCamera(sphereRotation);
        });
        window.addEventListener('pointerup', () => { isDragging = false; });

        updateSphereCamera(sphereRotation);
    }

    function updateSphereCamera(rot) {
        const dist = 3.5;
        sphereCamera.position.x = dist * Math.sin(rot.y) * Math.cos(rot.x);
        sphereCamera.position.y = dist * Math.sin(rot.x);
        sphereCamera.position.z = dist * Math.cos(rot.y) * Math.cos(rot.x);
        sphereCamera.lookAt(0, 0, 0);
        if (!state.animating) drawSphere();
    }

    function createSpherePoints() {
        // Create a grid of points on the sphere
        sphereOrbitPoints.forEach(p => sphereScene.remove(p));
        sphereOrbitPoints = [];

        const pointGeo = new THREE.SphereGeometry(0.03, 8, 8);

        // Fibonacci sphere points
        const N = 60;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < N; i++) {
            const y = 1 - (i / (N - 1)) * 2;
            const r = Math.sqrt(1 - y * y);
            const θ = goldenAngle * i;
            const x = r * Math.cos(θ);
            const z = r * Math.sin(θ);

            // Color based on position
            const hue = (i / N) * 360;
            const mat = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(hue / 360, 0.7, 0.55),
                shininess: 40,
            });
            const mesh = new THREE.Mesh(pointGeo, mat);
            mesh.position.set(x, y, z);
            mesh.userData.originalPos = new THREE.Vector3(x, y, z);
            sphereScene.add(mesh);
            sphereOrbitPoints.push(mesh);
        }

        // Also add a distinctive "F" shape on the sphere (projected)
        const fPoints = getFShape();
        const fScale = 0.15;
        fPoints.forEach((p, i) => {
            // Map F onto sphere near the "front"
            const fx = p.x * fScale;
            const fy = (p.y - 0.8) * fScale;  // center it
            const len = Math.sqrt(1 + fx * fx + fy * fy);
            const sx = fx / len, sy = fy / len, sz = 1 / len;

            const mat = new THREE.MeshPhongMaterial({
                color: 0xf59e0b,
                shininess: 60,
                emissive: 0x3d2700,
            });
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat);
            mesh.position.set(sx, sy, sz);
            mesh.userData.originalPos = new THREE.Vector3(sx, sy, sz);
            sphereScene.add(mesh);
            sphereOrbitPoints.push(mesh);
        });
    }

    let sphereAxisLine = null;

    function drawSphere() {
        if (!sphereInitialized) return;

        const t = state.animating ? easeInOut(state.animProgress) : 0;

        // Compute rotation axis
        const latRad = state.sphereLat * Math.PI / 180;
        const lonRad = state.sphereLon * Math.PI / 180;
        const axis = new THREE.Vector3(
            Math.cos(latRad) * Math.cos(lonRad),
            Math.sin(latRad),
            Math.cos(latRad) * Math.sin(lonRad)
        ).normalize();

        const angle = state.sphereAngle * Math.PI / 180 * t;

        // Build rotation quaternion
        const quat = new THREE.Quaternion().setFromAxisAngle(axis, angle);

        // Apply to all orbit points
        sphereOrbitPoints.forEach(mesh => {
            const pos = mesh.userData.originalPos.clone();
            pos.applyQuaternion(quat);
            mesh.position.copy(pos);
        });

        // Draw rotation axis
        if (sphereAxisLine) sphereScene.remove(sphereAxisLine);
        const axGeo = new THREE.BufferGeometry().setFromPoints([
            axis.clone().multiplyScalar(-1.4),
            axis.clone().multiplyScalar(1.4),
        ]);
        sphereAxisLine = new THREE.Line(axGeo, new THREE.LineBasicMaterial({
            color: 0x2dd4bf,
            transparent: true,
            opacity: 0.6,
        }));
        sphereScene.add(sphereAxisLine);

        sphereRenderer.render(sphereScene, sphereCamera);

        infoText.textContent = `Rotation: ${state.sphereAngle}° about axis (lat ${state.sphereLat}°, lon ${state.sphereLon}°)`;
    }

    function resizeSphere() {
        if (!sphereInitialized) return;
        const main = document.getElementById('viz-main');
        const w = main.clientWidth;
        const h = main.clientHeight;
        sphereCamera.aspect = w / h;
        sphereCamera.updateProjectionMatrix();
        sphereRenderer.setSize(w, h);
    }

    // ══════════════════════════════════════════════════════
    //  HYPERBOLIC MODE (Poincaré Disk)
    // ══════════════════════════════════════════════════════

    // Möbius transformation: z → (az + b) / (cz + d) where a,b,c,d are complex
    function complexMul(a, b) {
        return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
    }
    function complexAdd(a, b) {
        return { re: a.re + b.re, im: a.im + b.im };
    }
    function complexDiv(a, b) {
        const denom = b.re * b.re + b.im * b.im;
        return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
    }
    function complexConj(a) {
        return { re: a.re, im: -a.im };
    }
    function complexAbs(a) {
        return Math.sqrt(a.re * a.re + a.im * a.im);
    }
    function complexExp(a) {
        const r = Math.exp(a.re);
        return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) };
    }
    function complexFromPolar(r, θ) {
        return { re: r * Math.cos(θ), im: r * Math.sin(θ) };
    }

    // Möbius transformation on the Poincaré disk:
    // Hyperbolic translation by distance d in direction θ:
    //   z → (z - a) / (1 - conj(a)·z)  where a = tanh(d/2) · e^{iθ}
    // (This moves the origin by 'a', i.e., the inverse translation)
    // Better: z → (z + a) / (1 + conj(a)·z) which translates origin to a

    function hypTranslation(z, a) {
        // f(z) = (z + a) / (1 + conj(a) * z)
        const num = complexAdd(z, a);
        const den = complexAdd({ re: 1, im: 0 }, complexMul(complexConj(a), z));
        return complexDiv(num, den);
    }

    function hypRotation(z, angle) {
        const eiθ = complexFromPolar(1, angle);
        return complexMul(eiθ, z);
    }

    // Parabolic: fixes a boundary point. We conjugate so the boundary point is at 1,
    // move to upper half plane, do z -> z + t, move back.
    // Simpler approach: directly in disk model
    function hypParabolic(z, boundaryθ, strength) {
        const p = complexFromPolar(1, boundaryθ);
        // Cayley transform centered at p: 
        // w = (z - p) / (z - conj(p))  -- doesn't quite work for disk
        // Use the fact that a parabolic fixing p can be written as:
        // f(z) = ((1 + it/2)z + it/2 · p) / (-it/2 · conj(p) · z + (1 - it/2))
        // when p is on the unit circle
        const t = strength;
        const a = { re: 1, im: t / 2 };
        const b = complexMul({ re: 0, im: t / 2 }, p);
        const c = complexMul({ re: 0, im: -t / 2 }, complexConj(p));
        const d = { re: 1, im: -t / 2 };
        const num = complexAdd(complexMul(a, z), b);
        const den = complexAdd(complexMul(c, z), d);
        return complexDiv(num, den);
    }

    function getHypTransform(t) {
        const type = state.hypIsometry;
        return (z) => {
            if (type === 'h-translation') {
                const θ = state.hypDirection * Math.PI / 180;
                const d = state.hypDistance * t;
                const a = complexFromPolar(Math.tanh(d / 2), θ);
                return hypTranslation(z, a);
            }
            if (type === 'h-rotation') {
                return hypRotation(z, state.hypAngle * Math.PI / 180 * t);
            }
            if (type === 'h-parabolic') {
                const bθ = state.hypBoundaryPoint * Math.PI / 180;
                return hypParabolic(z, bθ, state.hypStrength * t);
            }
            return z;
        };
    }

    // Draw a hyperbolic geodesic arc between two points in the Poincaré disk
    function drawGeodesicArc(ctx, z1, z2, cx, cy, scale, color, width) {
        // If both points are close to origin or nearly collinear with origin, draw straight line
        const cross = z1.re * z2.im - z1.im * z2.re;
        if (Math.abs(cross) < 0.001) {
            const [sx1, sy1] = [cx + z1.re * scale, cy - z1.im * scale];
            const [sx2, sy2] = [cx + z2.re * scale, cy - z2.im * scale];
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
            return;
        }

        // Compute the circle passing through z1 and z2 that is orthogonal to the unit circle
        // The center of the geodesic circle satisfies:
        // |C - z1|² = |C - z2|² and |C|² - r² = 1
        const d = 2 * cross;
        const cx2 = ((z2.im) * (z1.re * z1.re + z1.im * z1.im + 1) -
                      (z1.im) * (z2.re * z2.re + z2.im * z2.im + 1)) / d;
        const cy2 = ((z1.re) * (z2.re * z2.re + z2.im * z2.im + 1) -
                      (z2.re) * (z1.re * z1.re + z1.im * z1.im + 1)) / d;
        const r = Math.sqrt((cx2 - z1.re) * (cx2 - z1.re) + (cy2 - z1.im) * (cy2 - z1.im));

        // Convert to screen coords
        const scx = cx + cx2 * scale;
        const scy = cy - cy2 * scale;
        const sr = r * scale;

        // Compute angles
        const a1 = Math.atan2(-(cy - z1.im * scale - (cy - cy2 * scale)), 
                               cx + z1.re * scale - (cx + cx2 * scale));
        const a2 = Math.atan2(-(cy - z2.im * scale - (cy - cy2 * scale)), 
                               cx + z2.re * scale - (cx + cx2 * scale));

        // Simplify: angles in screen coords
        const ang1 = Math.atan2(z1.im - cy2, z1.re - cx2);
        const ang2 = Math.atan2(z2.im - cy2, z2.re - cx2);

        // Draw the shorter arc
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();

        // We draw using parametric plot instead of arc to handle direction correctly
        const steps = 24;
        let startA = -ang1; // flip for screen y
        let endA = -ang2;
        // Normalize
        let diff = endA - startA;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        endA = startA + diff;

        for (let i = 0; i <= steps; i++) {
            const a = startA + (endA - startA) * i / steps;
            const px = scx + sr * Math.cos(a);
            const py = scy + sr * Math.sin(a);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    // Generate a {7,3} tiling of the Poincaré disk
    function drawHyperbolicTiling(cx, cy, scale, transform, t) {
        // Generate vertices of a regular hyperbolic heptagon centered at origin
        const p = 7; // polygon sides
        const q = 3; // meeting at vertex

        // The Euclidean radius of the vertices of a regular {p,q} polygon in the Poincaré disk:
        // r = sqrt( (cos(π/q) - sin(π/p)) / (cos(π/q) + sin(π/p)) )  if using angles,
        // or more precisely:
        // cosh(d) = cos(π/q) / sin(π/p), then r = tanh(d/2)
        const coshD = Math.cos(Math.PI / q) / Math.sin(Math.PI / p);
        const d = Math.acosh(coshD);
        const r = Math.tanh(d / 2);

        // Generate the vertices of the central heptagon
        const centralVerts = [];
        for (let i = 0; i < p; i++) {
            const θ = (2 * Math.PI * i) / p + Math.PI / 2;
            centralVerts.push({ re: r * Math.cos(θ), im: r * Math.sin(θ) });
        }

        // Draw the central polygon (and its transform)
        drawHypPolygon(ctx, centralVerts, cx, cy, scale, 'rgba(124, 138, 255, 0.06)', 'rgba(124, 138, 255, 0.15)', 1);

        // Draw transformed central polygon
        if (t > 0.001) {
            const tverts = centralVerts.map(z => transform(z));
            drawHypPolygon(ctx, tverts, cx, cy, scale, 'rgba(245, 158, 11, 0.04)', 'rgba(245, 158, 11, 0.12)', 1);
        }

        // Generate reflected copies using Möbius reflections through edges
        // For a {7,3} tiling, we reflect the central polygon through each of its edges
        const allPolygons = [centralVerts];
        const edgeMidpoints = [];

        // Compute midpoints and reflect through each edge
        for (let i = 0; i < p; i++) {
            const v1 = centralVerts[i];
            const v2 = centralVerts[(i + 1) % p];
            // Midpoint in hyperbolic sense: Möbius midpoint
            const mid = hypTranslation({ re: 0, im: 0 },
                complexFromPolar(Math.tanh(d / 4),
                    Math.atan2((v1.im + v2.im) / 2, (v1.re + v2.re) / 2)));

            // Reflect each vertex through the geodesic edge (v1, v2)
            // Use the hyperbolic reflection formula
            const reflected = reflectPolygonThroughEdge(centralVerts, v1, v2);
            if (reflected) {
                allPolygons.push(reflected);
            }
        }

        // Draw the first ring of reflected polygons
        for (let i = 1; i < allPolygons.length; i++) {
            const poly = allPolygons[i];
            drawHypPolygon(ctx, poly, cx, cy, scale, 'rgba(124, 138, 255, 0.03)', 'rgba(124, 138, 255, 0.1)', 0.5);

            if (t > 0.001) {
                const tpoly = poly.map(z => transform(z));
                drawHypPolygon(ctx, tpoly, cx, cy, scale, 'rgba(245, 158, 11, 0.02)', 'rgba(245, 158, 11, 0.08)', 0.5);
            }

            // Second ring: reflect each first-ring polygon through its edges
            for (let j = 0; j < p; j++) {
                const v1 = poly[j];
                const v2 = poly[(j + 1) % p];
                const reflected2 = reflectPolygonThroughEdge(poly, v1, v2);
                if (reflected2 && !isDuplicatePolygon(reflected2, allPolygons)) {
                    // Check if it's still mostly inside the disk
                    const maxR = Math.max(...reflected2.map(z => complexAbs(z)));
                    if (maxR < 0.98) {
                        drawHypPolygon(ctx, reflected2, cx, cy, scale, 'rgba(124, 138, 255, 0.02)', 'rgba(124, 138, 255, 0.06)', 0.3);
                        if (t > 0.001) {
                            const tr2 = reflected2.map(z => transform(z));
                            drawHypPolygon(ctx, tr2, cx, cy, scale, 'rgba(245, 158, 11, 0.01)', 'rgba(245, 158, 11, 0.05)', 0.3);
                        }
                    }
                }
            }
        }
    }

    function reflectPolygonThroughEdge(polygon, v1, v2) {
        // Hyperbolic reflection through the geodesic line through v1 and v2
        // Formula: reflect z through the geodesic from v1 to v2 in the Poincaré disk
        // Using Möbius transformation: first map v1 to 0, reflect through the resulting geodesic line, map back
        const reflected = polygon.map(z => {
            return hypReflectThroughGeodesic(z, v1, v2);
        });
        // Verify all points are inside the disk
        if (reflected.some(z => complexAbs(z) > 0.999)) return null;
        return reflected;
    }

    function hypReflectThroughGeodesic(z, v1, v2) {
        // Map v1 to origin: w = (z - v1) / (1 - conj(v1) * z)
        const z1 = hypTranslation(z, { re: -v1.re, im: -v1.im });
        const w2 = hypTranslation(v2, { re: -v1.re, im: -v1.im });

        // Now reflect through the geodesic line from 0 to w2
        // A geodesic through 0 is a straight line (diameter)
        // Reflect z1 through the line at angle atan2(w2.im, w2.re)
        const θ = Math.atan2(w2.im, w2.re);
        const cos2θ = Math.cos(2 * θ);
        const sin2θ = Math.sin(2 * θ);
        const reflected = {
            re: cos2θ * z1.re + sin2θ * z1.im,
            im: sin2θ * z1.re - cos2θ * z1.im,
        };

        // Map back: inverse of the translation that sent v1 to 0
        return hypTranslation(reflected, v1);
    }

    function isDuplicatePolygon(poly, existingPolygons) {
        // Check if the center of this polygon is close to the center of any existing one
        const center = { re: 0, im: 0 };
        poly.forEach(z => { center.re += z.re; center.im += z.im; });
        center.re /= poly.length;
        center.im /= poly.length;

        return existingPolygons.some(existing => {
            const ec = { re: 0, im: 0 };
            existing.forEach(z => { ec.re += z.re; ec.im += z.im; });
            ec.re /= existing.length;
            ec.im /= existing.length;
            const dist = Math.sqrt((center.re - ec.re) ** 2 + (center.im - ec.im) ** 2);
            return dist < 0.05;
        });
    }

    function drawHypPolygon(ctx, verts, cx, cy, scale, fillColor, strokeColor, lineWidth) {
        ctx.beginPath();
        // For geodesic edges, we use the arc drawing, but for simplicity of fill, use straight lines
        verts.forEach((z, i) => {
            const [sx, sy] = [cx + z.re * scale, cy - z.im * scale];
            i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    function drawHyperbolic() {
        const { w, h, cx, cy } = getViewport();
        const scale = getScale('hyperbolic');
        ctx.clearRect(0, 0, w, h);

        const t = state.animating ? easeInOut(state.animProgress) : 0;
        const transform = getHypTransform(t);

        // Draw Poincaré disk boundary
        ctx.beginPath();
        ctx.arc(cx, cy, scale, 0, Math.PI * 2);
        ctx.strokeStyle = colors.diskBorder;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Subtle fill
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale);
        grad.addColorStop(0, 'rgba(13, 19, 33, 0.3)');
        grad.addColorStop(0.8, 'rgba(13, 19, 33, 0.6)');
        grad.addColorStop(1, 'rgba(124, 138, 255, 0.05)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, scale, 0, Math.PI * 2);
        ctx.fill();

        // Geodesic grid (hyperbolic lines through origin)
        for (let i = 0; i < 8; i++) {
            const θ = (i / 8) * Math.PI;
            const [x1, y1] = toScreen(Math.cos(θ), Math.sin(θ), scale);
            const [x2, y2] = toScreen(-Math.cos(θ), -Math.sin(θ), scale);
            ctx.strokeStyle = colors.geodesic;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }

        // Hyperbolic concentric circles (at various hyperbolic radii)
        [0.3, 0.7, 1.2, 1.8].forEach(r => {
            const eucR = Math.tanh(r / 2) * scale;
            ctx.strokeStyle = colors.geodesic;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(cx, cy, eucR, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Draw a regular {7,3} tiling of the Poincaré disk
        drawHyperbolicTiling(cx, cy, scale, transform, t);


        // Grid of points in the hyperbolic plane
        const pointSet = [];
        // Ring pattern  
        for (let ring = 0; ring < 5; ring++) {
            const hypR = 0.4 + ring * 0.4;  // hyperbolic radius
            const eucR = Math.tanh(hypR / 2); // Euclidean radius in disk
            const nPts = Math.max(6, ring * 6 + 6);
            for (let i = 0; i < nPts; i++) {
                const θ = (i / nPts) * Math.PI * 2;
                pointSet.push({ re: eucR * Math.cos(θ), im: eucR * Math.sin(θ) });
            }
        }
        // Origin
        pointSet.push({ re: 0, im: 0 });

        // Draw original points
        pointSet.forEach(z => {
            if (complexAbs(z) >= 0.999) return;
            const [sx, sy] = toScreen(z.re, z.im, scale);
            ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2);
            ctx.fillStyle = colors.original; ctx.fill();
        });

        // Draw transformed points
        pointSet.forEach(z => {
            if (complexAbs(z) >= 0.999) return;
            const tz = transform(z);
            if (complexAbs(tz) >= 1.0) return; // outside disk, skip
            const [sx, sy] = toScreen(tz.re, tz.im, scale);
            ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2);
            ctx.fillStyle = colors.transformed; ctx.fill();
        });

        // Draw "F" shape in the disk
        const fPts = getFShape().map(p => ({
            re: p.x * 0.08 + 0.05,
            im: (p.y - 0.8) * 0.08,
        }));

        // Original F
        ctx.beginPath();
        fPts.forEach((z, i) => {
            const [sx, sy] = toScreen(z.re, z.im, scale);
            i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(124, 138, 255, 0.15)';
        ctx.fill();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Transformed F — we need to transform each vertex, but draw as straight lines
        // (geodesic segments would be ideal, but straight approximation works for nearby points)
        const tfPts = fPts.map(z => transform(z));
        ctx.beginPath();
        tfPts.forEach((z, i) => {
            if (complexAbs(z) >= 1) return;
            const [sx, sy] = toScreen(z.re, z.im, scale);
            i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
        ctx.fill();
        ctx.strokeStyle = colors.accentWarm;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw geodesic from origin in the translation direction (for translation)
        if (state.hypIsometry === 'h-translation') {
            const θ = state.hypDirection * Math.PI / 180;
            ctx.strokeStyle = colors.accentTeal;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            const [x1, y1] = toScreen(Math.cos(θ), Math.sin(θ), scale);
            const [x2, y2] = toScreen(-Math.cos(θ), -Math.sin(θ), scale);
            ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Mark the fixed boundary point for parabolic
        if (state.hypIsometry === 'h-parabolic') {
            const bθ = state.hypBoundaryPoint * Math.PI / 180;
            const [bx, by] = toScreen(Math.cos(bθ), Math.sin(bθ), scale);
            ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2);
            ctx.fillStyle = colors.accentTeal; ctx.fill();
            ctx.strokeStyle = 'rgba(45, 212, 191, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.stroke();
        }

        // Info
        const type = state.hypIsometry;
        if (type === 'h-translation') {
            infoText.textContent = `Hyperbolic translation: direction ${state.hypDirection}°, distance ${state.hypDistance.toFixed(2)}`;
        } else if (type === 'h-rotation') {
            infoText.textContent = `Hyperbolic rotation: ${state.hypAngle}° about the origin`;
        } else {
            infoText.textContent = `Parabolic isometry: fixed point at ${state.hypBoundaryPoint}°, strength ${state.hypStrength.toFixed(2)}`;
        }
    }

    // ══════════════════════════════════════════════════════
    //  UTILITIES
    // ══════════════════════════════════════════════════════

    function easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function drawArrow(ctx, x1, y1, x2, y2, color, width) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 10;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
    }

    // ══════════════════════════════════════════════════════
    //  DRAW DISPATCHER
    // ══════════════════════════════════════════════════════

    function draw() {
        if (state.mode === 'line') drawLine();
        else if (state.mode === 'plane') drawPlane();
        else if (state.mode === 'sphere') drawSphere();
        else if (state.mode === 'hyperbolic') drawHyperbolic();
    }

    // ══════════════════════════════════════════════════════
    //  ANIMATION LOOP
    // ══════════════════════════════════════════════════════

    let animRAF = null;
    let lastAnimTime = 0;

    function startAnimation() {
        state.animating = true;
        state.animProgress = 0;
        lastAnimTime = performance.now();
        btnAnimate.classList.add('playing');
        btnAnimate.querySelector('.btn-icon').textContent = '⏸';
        animLoop();
    }

    function stopAnimation() {
        state.animating = false;
        if (animRAF) cancelAnimationFrame(animRAF);
        animRAF = null;
        btnAnimate.classList.remove('playing');
        btnAnimate.querySelector('.btn-icon').textContent = '▶';
        draw();
    }

    function animLoop() {
        const now = performance.now();
        const dt = (now - lastAnimTime) / 1000;
        lastAnimTime = now;

        state.animProgress += dt * state.animSpeed * 0.5;

        if (state.animProgress >= 1) {
            state.animProgress = 1;
            draw();
            // Hold at end for a moment then loop
            setTimeout(() => {
                if (state.animating) {
                    state.animProgress = 0;
                    animLoop();
                }
            }, 400);
            return;
        }

        draw();
        animRAF = requestAnimationFrame(animLoop);
    }

    // ══════════════════════════════════════════════════════
    //  MODE SWITCHING
    // ══════════════════════════════════════════════════════

    function switchMode(mode) {
        state.mode = mode;
        stopAnimation();

        // Update tab active state
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        // Show/hide control groups
        document.querySelectorAll('.controls-group').forEach(g => {
            g.style.display = g.dataset.for === mode ? '' : 'none';
        });

        // Toggle canvas vs three.js
        if (mode === 'sphere') {
            canvas.style.display = 'none';
            threeContainer.style.display = 'block';
            initSphere();
            resizeSphere();
        } else {
            canvas.style.display = 'block';
            threeContainer.style.display = 'none';
            resizeCanvas();
        }

        draw();
    }

    // ══════════════════════════════════════════════════════
    //  EVENT WIRING
    // ══════════════════════════════════════════════════════

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // Animate button
    btnAnimate.addEventListener('click', () => {
        if (state.animating) stopAnimation();
        else startAnimation();
    });

    // Reset button
    btnReset.addEventListener('click', () => {
        stopAnimation();
        state.animProgress = 0;
        draw();
    });

    // Animation speed
    document.getElementById('anim-speed').addEventListener('input', e => {
        state.animSpeed = parseFloat(e.target.value);
        document.getElementById('speed-val').textContent = state.animSpeed.toFixed(1) + '×';
    });

    // ── Line Controls ─────────────────────────────────────
    document.querySelectorAll('[data-for="line"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-for="line"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.lineIsometry = btn.dataset.isometry;
            document.getElementById('line-translation-amt').style.display = btn.dataset.isometry === 'translation' ? '' : 'none';
            document.getElementById('line-reflection-center').style.display = btn.dataset.isometry === 'reflection' ? '' : 'none';
            draw();
        });
    });

    document.getElementById('line-translate').addEventListener('input', e => {
        state.lineTranslate = parseFloat(e.target.value);
        document.getElementById('line-t-val').textContent = state.lineTranslate.toFixed(1);
        draw();
    });

    document.getElementById('line-reflect-center').addEventListener('input', e => {
        state.lineReflectCenter = parseFloat(e.target.value);
        document.getElementById('line-r-val').textContent = state.lineReflectCenter.toFixed(1);
        draw();
    });

    // ── Plane Controls ────────────────────────────────────
    document.querySelectorAll('[data-for="plane"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-for="plane"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.planeIsometry = btn.dataset.isometry;
            document.querySelectorAll('.plane-param').forEach(p => p.style.display = 'none');
            const paramId = {
                translation: 'plane-translate-params',
                rotation: 'plane-rotate-params',
                reflection: 'plane-reflect-params',
                glide: 'plane-glide-params',
            }[btn.dataset.isometry];
            if (paramId) document.getElementById(paramId).style.display = '';
            draw();
        });
    });

    const planeInputs = [
        ['plane-direction', 'planeDirection', 'plane-dir-val', v => v + '°'],
        ['plane-distance', 'planeDistance', 'plane-dist-val', v => parseFloat(v).toFixed(1)],
        ['plane-angle', 'planeAngle', 'plane-angle-val', v => v + '°'],
        ['plane-cx', 'planeCx', 'plane-cx-val', v => parseFloat(v).toFixed(1)],
        ['plane-cy', 'planeCy', 'plane-cy-val', v => parseFloat(v).toFixed(1)],
        ['plane-mirror-angle', 'planeMirrorAngle', 'plane-mirror-val', v => v + '°'],
        ['plane-glide-angle', 'planeGlideAngle', 'plane-glide-angle-val', v => v + '°'],
        ['plane-glide-dist', 'planeGlideDist', 'plane-glide-dist-val', v => parseFloat(v).toFixed(1)],
    ];

    planeInputs.forEach(([inputId, stateKey, labelId, fmt]) => {
        document.getElementById(inputId).addEventListener('input', e => {
            state[stateKey] = parseFloat(e.target.value);
            document.getElementById(labelId).textContent = fmt(e.target.value);
            draw();
        });
    });

    // ── Sphere Controls ───────────────────────────────────
    const sphereInputs = [
        ['sphere-lat', 'sphereLat', 'sphere-lat-val', v => v + '°'],
        ['sphere-lon', 'sphereLon', 'sphere-lon-val', v => v + '°'],
        ['sphere-angle', 'sphereAngle', 'sphere-angle-val', v => v + '°'],
    ];

    sphereInputs.forEach(([inputId, stateKey, labelId, fmt]) => {
        document.getElementById(inputId).addEventListener('input', e => {
            state[stateKey] = parseFloat(e.target.value);
            document.getElementById(labelId).textContent = fmt(e.target.value);
            draw();
        });
    });

    // Sphere presets
    document.querySelectorAll('[data-for="sphere"] .btn-toggle[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const presets = {
                x90: { lat: 0, lon: 0, angle: 90 },
                y120: { lat: 90, lon: 0, angle: 120 },
                z45: { lat: 0, lon: 90, angle: 45 },
                irrational: { lat: 35, lon: 45, angle: 137 }, // Golden angle-ish
            };
            const p = presets[btn.dataset.preset];
            if (!p) return;
            state.sphereLat = p.lat;
            state.sphereLon = p.lon;
            state.sphereAngle = p.angle;
            document.getElementById('sphere-lat').value = p.lat;
            document.getElementById('sphere-lon').value = p.lon;
            document.getElementById('sphere-angle').value = p.angle;
            document.getElementById('sphere-lat-val').textContent = p.lat + '°';
            document.getElementById('sphere-lon-val').textContent = p.lon + '°';
            document.getElementById('sphere-angle-val').textContent = p.angle + '°';
            draw();
        });
    });

    // ── Hyperbolic Controls ───────────────────────────────
    document.querySelectorAll('[data-for="hyperbolic"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-for="hyperbolic"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.hypIsometry = btn.dataset.isometry;
            document.querySelectorAll('.hyp-param').forEach(p => p.style.display = 'none');
            const paramId = {
                'h-translation': 'hyp-translate-params',
                'h-rotation': 'hyp-rotate-params',
                'h-parabolic': 'hyp-parabolic-params',
            }[btn.dataset.isometry];
            if (paramId) document.getElementById(paramId).style.display = '';
            draw();
        });
    });

    const hypInputs = [
        ['hyp-direction', 'hypDirection', 'hyp-dir-val', v => v + '°'],
        ['hyp-distance', 'hypDistance', 'hyp-dist-val', v => parseFloat(v).toFixed(2)],
        ['hyp-angle', 'hypAngle', 'hyp-angle-val', v => v + '°'],
        ['hyp-boundary-point', 'hypBoundaryPoint', 'hyp-bp-val', v => v + '°'],
        ['hyp-strength', 'hypStrength', 'hyp-str-val', v => parseFloat(v).toFixed(2)],
    ];

    hypInputs.forEach(([inputId, stateKey, labelId, fmt]) => {
        document.getElementById(inputId).addEventListener('input', e => {
            state[stateKey] = parseFloat(e.target.value);
            document.getElementById(labelId).textContent = fmt(e.target.value);
            draw();
        });
    });

    // ── Keyboard shortcuts ────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (state.animating) stopAnimation();
            else startAnimation();
        }
        if (e.key === 'r' || e.key === 'R') {
            stopAnimation();
            state.animProgress = 0;
            draw();
        }
        if (e.key === '1') switchMode('line');
        if (e.key === '2') switchMode('plane');
        if (e.key === '3') switchMode('sphere');
        if (e.key === '4') switchMode('hyperbolic');
    });

    // ══════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════

    resizeCanvas();
    draw();

})();
