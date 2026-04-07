/**
 * 3-Adic Solenoid — Full Visualization
 * 
 * ═══════════════════════════════════════════════════════════════
 * MATHEMATICAL BACKGROUND
 * ═══════════════════════════════════════════════════════════════
 *
 * ℤ₃ = inverse limit of ℤ/3ⁿ  ≅  Cantor set
 *
 * Nested-disk picture: big disk → 3 sub-disks (residues mod 3)
 * → 3² → 3³ → …
 *
 * The "+1" map (odometer) permutes the Cantor set:
 *   (a₀,a₁,a₂,…) ↦ (a₀+1 mod 3, a₁+carry, a₂+carry, …)
 *
 * The 3-adic solenoid Sol₃ = mapping torus of +1:
 *   (ℤ₃ × [0,1]) / ((x,1) ~ (x+1,0))
 *   = inverse limit S¹ ←×3 S¹ ←×3 S¹ ← …
 * ═══════════════════════════════════════════════════════════════
 */

const P = 3;

const DIGIT_COLORS = [
    { h: 165, s: 78, l: 48 },   // 0 — teal
    { h: 275, s: 68, l: 58 },   // 1 — violet
    { h: 28,  s: 92, l: 52 },   // 2 — amber
];

// Nested-disk layout
const SUB_RATIO  = 0.35;
const SUB_OFFSET = 0.50;
const SUB_ANGLES = [
    Math.PI / 2,
    Math.PI / 2 - 2 * Math.PI / 3,
    Math.PI / 2 + 2 * Math.PI / 3,
];

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════

function diskGeometry(addr, cx, cy, R) {
    let x = cx, y = cy, r = R;
    for (let i = 0; i < addr.length; i++) {
        const d = addr[i];
        x += r * SUB_OFFSET * Math.cos(SUB_ANGLES[d]);
        y += r * SUB_OFFSET * Math.sin(SUB_ANGLES[d]);
        r *= SUB_RATIO;
    }
    return { x, y, r };
}

function addOne(addr) {
    const out = addr.slice();
    for (let i = 0; i < out.length; i++) {
        out[i] = (out[i] + 1) % P;
        if (out[i] !== 0) return out;
    }
    return out;
}

function addN(addr, n) {
    let a = addr.slice();
    for (let i = 0; i < n; i++) a = addOne(a);
    return a;
}

function intToAddr(n, len) {
    const a = [];
    for (let i = 0; i < len; i++) { a.push(n % P); n = Math.floor(n / P); }
    return a;
}

function addrToInt(addr) {
    let v = 0, m = 1;
    for (const d of addr) { v += d * m; m *= P; }
    return v;
}

/** List all addresses at a given depth */
function allAddrs(depth) {
    if (depth === 0) return [[]];
    const result = [];
    const count = Math.pow(P, depth);
    for (let i = 0; i < count; i++) result.push(intToAddr(i, depth));
    return result;
}

/**
 * Arc-interpolate the +1 operation on an address.
 * Returns {x, y, r} at time t ∈ [0, 1].
 *
 * Each digit independently traces a 120° arc at its nesting level:
 *  - Carrying digits (value 2) sweep 2→0
 *  - The incrementing digit sweeps d→d+1
 *  - Higher digits don't move
 */
function arcInterpolate(addr, t) {
    let carries = 0;
    for (let j = 0; j < addr.length; j++) {
        if (addr[j] === 2) carries++;
        else break;
    }

    let x = 0, y = 0, r = 1;
    for (let j = 0; j < addr.length; j++) {
        let angle;
        if (j < carries) {
            const startA = SUB_ANGLES[2];
            const endA   = SUB_ANGLES[0];
            let sweep = endA - startA;
            while (sweep >  Math.PI) sweep -= 2 * Math.PI;
            while (sweep < -Math.PI) sweep += 2 * Math.PI;
            angle = startA + sweep * t;
        } else if (j === carries) {
            const from = addr[j];
            const to   = (from + 1) % P;
            const startA = SUB_ANGLES[from];
            const endA   = SUB_ANGLES[to];
            let sweep = endA - startA;
            while (sweep >  Math.PI) sweep -= 2 * Math.PI;
            while (sweep < -Math.PI) sweep += 2 * Math.PI;
            angle = startA + sweep * t;
        } else {
            angle = SUB_ANGLES[addr[j]];
        }
        x += r * SUB_OFFSET * Math.cos(angle);
        y += r * SUB_OFFSET * Math.sin(angle);
        r *= SUB_RATIO;
    }
    return { x, y, r };
}

// ════════════════════════════════════════
// 2D DISK VIEW
// ════════════════════════════════════════

class DiskView {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.maxDepth = 5;

        // The "offset" tracks how many +1 operations have been applied.
        // Rather than mutating disk positions, we shift addresses:
        // the disk that started at address `a` is now at position of `a + offset`.
        this.offset = 0;

        this.animating = false;
        this.animProgress = 0;
        this.animSpeed = 1;
        this.autoPlay = false;
        this.autoTimer = 0;
        this.stepCount = 0;
        this.showLabels = true;


        // Pre-computed: for each (depth, address) → geometry
        this.geoCache = {};

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.rebuild();
    }

    resize() {
        const dpr = window.devicePixelRatio;
        this.canvas.width  = this.canvas.clientWidth  * dpr;
        this.canvas.height = this.canvas.clientHeight * dpr;
        this.cx = this.canvas.width / 2;
        this.cy = this.canvas.height / 2;
        this.R  = Math.min(this.canvas.width, this.canvas.height) * 0.38;
    }

    rebuild() {
        // Pre-compute geometry for all addresses at each depth
        this.geoCache = {};
        for (let d = 1; d <= this.maxDepth; d++) {
            const addrs = allAddrs(d);
            for (const a of addrs) {
                const key = a.toString();
                this.geoCache[key] = diskGeometry(a, 0, 0, 1);
            }
        }
        this.animating = false;
    }

    setDepth(d) {
        this.maxDepth = Math.max(1, Math.min(7, d));
        this.rebuild();
    }

    /**
     * Trigger +1 animation.
     *
     * The animation moves each disk from its CURRENT position
     * (= position of addr + offset) to its NEW position
     * (= position of addr + offset + 1).
     *
     * After animation completes, offset increments by 1.
     */
    triggerPlusOne() {
        if (this.animating) return;
        this.animating = true;
        this.animProgress = 0;
        this.stepCount++;
    }

    update(dt) {
        if (this.animating) {
            this.animProgress += dt * this.animSpeed * 0.8;
            if (this.animProgress >= 1) {
                this.animProgress = 0;
                this.animating = false;
                this.offset++;
            }
        }

        if (this.autoPlay && !this.animating) {
            this.autoTimer += dt * this.animSpeed;
            if (this.autoTimer > 0.4) {
                this.autoTimer = 0;
                this.triggerPlusOne();
            }
        }


    }

    draw() {
        const { ctx, canvas, cx: CX, cy: CY, R } = this;

        // Background
        const bgGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, R * 1.5);
        bgGrad.addColorStop(0, '#0d1321');
        bgGrad.addColorStop(0.7, '#080e1a');
        bgGrad.addColorStop(1, '#060a14');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ease parameter for animation
        const t = this.animating ? this._easeInOut(this.animProgress) : 0;

        // Draw outer ring
        this._ring(ctx, CX, CY, R);

        // Draw all disks for each depth
        for (let d = 1; d <= this.maxDepth; d++) {
            const count = Math.pow(P, d);

            for (let i = 0; i < count; i++) {
                const addr = intToAddr(i, d);

                // Current position: where addr + offset sits
                const curAddr = addN(addr, this.offset);
                const curGeo = this._geo(curAddr);

                let x, y, r;
                if (this.animating) {
                    const geo = this._arcInterpolate(curAddr, t);
                    x = geo.x;
                    y = geo.y;
                    r = geo.r;
                } else {
                    x = curGeo.x;
                    y = curGeo.y;
                    r = curGeo.r;
                }

                this._disk(ctx, CX + x * R, CY - y * R, r * R, d);
            }
        }

        // Labels (show original address labels when not animating)
        if (this.showLabels && !this.animating) {
            for (let d = 1; d <= Math.min(2, this.maxDepth); d++) {
                const count = Math.pow(P, d);
                for (let i = 0; i < count; i++) {
                    const addr = intToAddr(i, d);
                    const curAddr = addN(addr, this.offset);
                    const geo = this._geo(curAddr);
                    const sr = geo.r * R;
                    if (sr < 10) continue;

                    const sx = CX + geo.x * R;
                    const sy = CY - geo.y * R;
                    const hue = this._depthHue(d);
                    const dpr = window.devicePixelRatio;
                    const sz = Math.max(8, Math.min(15, sr * 0.28)) * dpr;
                    ctx.font = `600 ${sz}px Inter`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = `hsla(${hue}, 55%, 87%, 0.75)`;
                    ctx.fillText(curAddr.join(''), sx, sy);
                }
            }
        }

        this._counter(ctx);
    }

    /** Get geometry for an address, using cache */
    _geo(addr) {
        const key = addr.toString();
        if (this.geoCache[key]) return this.geoCache[key];
        return diskGeometry(addr, 0, 0, 1);
    }

    /** Delegate to standalone arcInterpolate */
    _arcInterpolate(addr, t) {
        return arcInterpolate(addr, t);
    }

    _ring(ctx, x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(124, 138, 255, 0.12)';
        ctx.lineWidth = 1.5 * window.devicePixelRatio;
        ctx.stroke();
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(124, 138, 255, 0.025)');
        g.addColorStop(1, 'rgba(124, 138, 255, 0.003)');
        ctx.fillStyle = g;
        ctx.fill();
    }

    /** Rainbow hue for a given depth: red(0°) → purple(280°) */
    _depthHue(depth) {
        return (depth - 1) / Math.max(1, this.maxDepth - 1) * 280;
    }

    _disk(ctx, sx, sy, sr, depth) {
        if (sr < 0.3) return;
        const h = this._depthHue(depth);
        const a = Math.max(0.10, 0.60 - depth * 0.05);

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h}, 78%, 58%, ${a})`;
        ctx.fill();
    }

    _counter(ctx) {
        const dpr = window.devicePixelRatio;
        ctx.font = `500 ${11 * dpr}px Inter`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        const mod = Math.pow(3, Math.min(this.maxDepth, 4));
        const current = this.offset + (this.animating ? 1 : 0);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.fillText(
            `+${current}  (mod ${mod} = ${current % mod})`,
            this.canvas.width - 20 * dpr, 30 * dpr
        );
    }



    _easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
}


// ════════════════════════════════════════
// SOLENOID CURVE — Analytic path for TubeGeometry
// ════════════════════════════════════════

/**
 * Custom THREE.Curve that evaluates the solenoid strand path
 * directly via arcInterpolate. No control-point array needed —
 * the curve is mathematically exact at any parameter value.
 *
 * The strand traces the full orbit of +1 on the 3-adic integers
 * at a given depth: N = 3^depth positions, wrapping N times
 * around a torus of major radius R and cross-section radius r.
 */
class SolenoidCurve extends THREE.Curve {
    constructor(orbit, majorR, crossR) {
        super();
        this.orbit = orbit;
        this.majorR = majorR;
        this.crossR = crossR;
        this.N = orbit.length;
    }

    getPoint(frac, optionalTarget) {
        const target = optionalTarget || new THREE.Vector3();
        const theta = frac * 2 * Math.PI * this.N;

        const legF = frac * this.N;
        const legIdx = Math.min(Math.floor(legF), this.N - 1);
        const legT = Math.min(legF - legIdx, 1);

        const pos = arcInterpolate(this.orbit[legIdx], legT);
        const r3d = this.majorR + pos.x * this.crossR;

        target.set(
            r3d * Math.cos(theta),
            pos.y * this.crossR,
            r3d * Math.sin(theta)
        );
        return target;
    }

    // Skip arc-length parameterization (uniform-in-θ is correct here)
    getPointAt(u, optionalTarget) {
        return this.getPoint(u, optionalTarget);
    }
}


// ════════════════════════════════════════
// 3D SOLENOID VIEW
// ════════════════════════════════════════

class SolenoidView {
    constructor(container, diskView) {
        this.container = container;
        this.diskView = diskView;
        this.visible = false;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
        this.camera.position.set(2, 3.5, 6);

        this.renderer = new THREE.WebGLRenderer({
            canvas: container.querySelector('#three-canvas'),
            antialias: true, alpha: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x060a14, 1);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enabled = false;
        this.controls.target.set(0, 0, 0);

        this.group = new THREE.Group();
        this.scene.add(this.group);

        // Lighting
        this.scene.add(new THREE.AmbientLight(0x8899bb, 0.5));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.8);
        d1.position.set(5, 7, 6);
        this.scene.add(d1);
        const d2 = new THREE.DirectionalLight(0x7c8aff, 0.3);
        d2.position.set(-5, -3, -6);
        this.scene.add(d2);
        const pt = new THREE.PointLight(0xa78bfa, 0.4, 20);
        pt.position.set(0, 4, 0);
        this.scene.add(pt);

        this.built = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    show() {
        this.visible = true;
        this.controls.enabled = true;
        if (!this.built) {
            this.buildSolenoid();
            this.built = true;
        }
    }

    hide() {
        this.visible = false;
        this.controls.enabled = false;
    }

    /**
     * BUILD THE SOLENOID — Layered cycling approach.
     *
     * Depth 0: solid dark torus (the full disk cross-section).
     * Depth k (1–6): InstancedMesh spheres tracing the 3^k disks
     *   through one +1 revolution. The 3^k tubes join end-to-end
     *   to form ONE strand wrapping 3^k times around the torus.
     *
     * Layers auto-cycle with crossfade transitions.
     */
    buildSolenoid() {
        while (this.group.children.length) {
            const c = this.group.children[0];
            this.group.remove(c);
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        }

        const majorR = 2.0;
        const crossR = 0.75;
        const maxSolDepth = 6;

        this.layers = [];

        // ── Thin central axis torus (always visible) ──
        const axGeo = new THREE.TorusGeometry(majorR, 0.012, 12, 128);
        const axMat = new THREE.MeshBasicMaterial({
            color: 0x7c8aff, transparent: true, opacity: 0.18
        });
        const axMesh = new THREE.Mesh(axGeo, axMat);
        axMesh.rotation.x = Math.PI / 2;
        this.group.add(axMesh);

        // ── Cross-section outline at θ=0 (always visible) ──
        const ringPts = [];
        for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * 2 * Math.PI;
            ringPts.push(new THREE.Vector3(
                majorR + crossR * Math.cos(a),
                crossR * Math.sin(a), 0
            ));
        }
        this.group.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(ringPts),
            new THREE.LineBasicMaterial({
                color: 0x7c8aff, transparent: true, opacity: 0.2
            })
        ));

        // ══ DEPTH 0: Solid dark torus ══
        const d0Geo = new THREE.TorusGeometry(majorR, crossR * 0.97, 32, 100);
        const d0Mat = new THREE.MeshStandardMaterial({
            color: 0x0d1321,
            emissive: new THREE.Color(0x080e1a),
            metalness: 0.1, roughness: 0.6,
            transparent: true, opacity: 1,
        });
        const d0Mesh = new THREE.Mesh(d0Geo, d0Mat);
        d0Mesh.rotation.x = Math.PI / 2;
        this.group.add(d0Mesh);
        this.layers.push({ mesh: d0Mesh, mat: d0Mat, depth: 0 });

        // ══ DEPTHS 1–6: Tube strand layers ══
        // Each strand traces the full +1 orbit (3^k positions),
        // wrapping 3^k times around the torus.
        // SolenoidCurve evaluates arcInterpolate directly — no
        // control-point array, so sampling is unlimited.

        for (let d = 1; d <= maxSolDepth; d++) {
            const N = Math.pow(P, d);

            // Build orbit: the sequence of addresses visited by +1
            const orbit = [];
            let addr = intToAddr(0, d);
            for (let i = 0; i < N; i++) {
                orbit.push(addr.slice());
                addr = addOne(addr);
            }

            // Analytic curve — exact at any parameter value
            const curve = new SolenoidCurve(orbit, majorR, crossR);

            // Generous tube segment count: 24 segments per revolution
            const tubeSegments = N * 24;
            const diskR = Math.pow(SUB_RATIO, d);
            const tubeR = Math.max(0.003, diskR * crossR * 0.65);
            const radSeg = Math.max(3, 8 - d);

            const geo = new THREE.TubeGeometry(
                curve, tubeSegments, tubeR, radSeg, false
            );

            // Rainbow color: red → purple
            const hue = (d - 1) / Math.max(1, maxSolDepth - 1) * 280;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue / 360, 0.78, 0.55),
                emissive: new THREE.Color().setHSL(hue / 360, 0.3, 0.12),
                metalness: 0.2, roughness: 0.35,
                transparent: true, opacity: 0,
                side: THREE.DoubleSide,
                depthWrite: false,
            });

            const mesh = new THREE.Mesh(geo, mat);
            this.group.add(mesh);
            this.layers.push({ mesh, mat, depth: d });
        }

        // Start with depth 0 visible, others hidden
        this.targetDepth = 0;
    }

    /**
     * Show all layers up to (and including) depth d.
     * The newest layer is brightest; older layers dim for context.
     */
    showUpToDepth(d) {
        if (!this.built) { this.buildSolenoid(); this.built = true; }
        this.targetDepth = d;
        for (var i = 0; i < this.layers.length; i++) {
            var layer = this.layers[i];
            if (layer.depth === 0) {
                // Hide the solid torus once strands appear — it occludes them
                layer.mesh.visible = (d === 0);
                layer.mat.opacity = (d === 0) ? 1 : 0;
            } else if (layer.depth <= d) {
                layer.mesh.visible = true;
                var recency = 1 - (d - layer.depth) * 0.22;
                layer.mat.opacity = Math.max(0.18, recency);
                layer.mat.depthWrite = (layer.depth === d);
            } else {
                layer.mesh.visible = false;
                layer.mat.opacity = 0;
            }
        }
    }

    update(dt) {
        if (!this.visible) return;
        this.controls.update();
        this.group.rotation.y += dt * 0.09;
    }

    render() {
        if (!this.visible) return;
        this.renderer.render(this.scene, this.camera);
    }
}


// ════════════════════════════════════════
// NARRATIVE STEPS
// ════════════════════════════════════════

function solStep(app) {
    app.diskCanvas.style.opacity = '0';
    app.diskCanvas.style.pointerEvents = 'none';
    app.diskView.autoPlay = false;
    app.showDiskUI(false);
    app.hideSpeed();
    app.showLegend();
    app.solView.show();
}

const STEPS = [
    {
        desc: 'The ring \\(\\mathbb{Z}_3\\) of <em>3-adic integers</em> is a Cantor set: each disk subdivides into <strong>3</strong> sub-disks, one per residue class.',
        setup: (app) => {
            app.diskCanvas.style.opacity = '1';
            app.diskCanvas.style.pointerEvents = 'auto';
            app.diskView.showLabels = true;
            app.diskView.autoPlay = false;
            app.solView.hide();
            app.showDiskUI(true);
            app.hideSpeed();
            app.hideLegend();
        }
    },
    {
        desc: 'The <strong class="key">+1</strong> map is an "odometer": increment the first digit and carry. Press <strong class="key">+1</strong> or <strong class="key">spacebar</strong> to step.',
        setup: (app) => {
            app.diskCanvas.style.opacity = '1';
            app.diskCanvas.style.pointerEvents = 'auto';
            app.diskView.showLabels = true;
            app.diskView.autoPlay = false;
            app.solView.hide();
            app.showDiskUI(true);
            app.hideSpeed();
            app.hideLegend();
        }
    },
    {
        desc: 'Playing continuously: at depth \\(k\\), each disk cycles through all \\(3^k\\) positions. The orbit is <em>equidistributed</em> — this is the profinite topology at work.',
        setup: (app) => {
            app.diskCanvas.style.opacity = '1';
            app.diskCanvas.style.pointerEvents = 'auto';
            app.diskView.showLabels = false;
            app.diskView.autoPlay = true;
            app.solView.hide();
            app.showDiskUI(true);
            app.showSpeed();
            app.hideLegend();
        }
    },
    {
        desc: 'The <em>3-adic solenoid</em> \\(\\operatorname{Sol}_3\\) wraps this cross-section around a torus, twisting by +1 each revolution.',
        setup: (app) => {
            solStep(app);
            app.hideLegend();
            app.solView.showUpToDepth(0);
        }
    },
    {
        desc: 'The circle \\(S^1\\) covers itself 3-to-1 via \\(z \\mapsto z^3\\). Its mapping torus is a tube winding <strong>3 times</strong> inside the big torus.',
        setup: (app) => {
            solStep(app);
            app.solView.showUpToDepth(1);
        }
    },
    {
        desc: 'Repeat: wrap 3 times around <em>that</em> tube. Now a thinner strand winds <strong>9 times</strong> around the torus.',
        setup: (app) => {
            solStep(app);
            app.solView.showUpToDepth(2);
        }
    },
    {
        desc: 'Again: <strong>27 times</strong> around. Each strand nests inside the previous one — a fractal of circles.',
        setup: (app) => {
            solStep(app);
            app.solView.showUpToDepth(3);
        }
    },
    {
        desc: '\\(\\operatorname{Sol}_3 = \\varprojlim\\, (S^1 \\xleftarrow{\\times 3} S^1 \\xleftarrow{\\times 3} \\cdots)\\) — the <em>inverse limit of circles</em>. Each approximation wraps \\(3^k\\) times around.',
        setup: (app) => {
            solStep(app);
            app.solView.showUpToDepth(5);
        }
    },
];


// ════════════════════════════════════════
// APP
// ════════════════════════════════════════

class App {
    constructor() {
        this.step = 0;
        this.diskCanvas = document.getElementById('disk-canvas');
        this.diskView = new DiskView(this.diskCanvas);
        this.solView = new SolenoidView(
            document.getElementById('canvas-wrap'),
            this.diskView
        );
        this.lastT = 0;

        this._buildDots();
        this._bindControls();
        this.goTo(0);
        requestAnimationFrame(t => this._loop(t));
    }

    _buildDots() {
        const el = document.getElementById('dots');
        el.innerHTML = '';
        STEPS.forEach((_, i) => {
            const d = document.createElement('div');
            d.className = 'dot' + (i === 0 ? ' active' : '');
            d.addEventListener('click', () => this.goTo(i));
            el.appendChild(d);
        });
    }

    goTo(i) {
        this.step = Math.max(0, Math.min(STEPS.length - 1, i));
        const s = STEPS[this.step];

        const desc = document.getElementById('description');
        desc.innerHTML = s.desc;
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise)
            MathJax.typesetPromise([desc]).catch(() => {});

        document.querySelectorAll('.dot').forEach((d, j) =>
            d.classList.toggle('active', j === this.step));
        document.getElementById('prev-btn').disabled = this.step === 0;
        document.getElementById('next-btn').disabled = this.step === STEPS.length - 1;

        s.setup(this);
    }

    showDiskUI(show) {
        document.getElementById('ctrl-panel').style.display = show ? 'flex' : 'none';
        document.getElementById('depth-ctrl').style.display = show ? 'flex' : 'none';
    }

    showSpeed() { document.getElementById('speed-panel').style.display = 'flex'; }
    hideSpeed() { document.getElementById('speed-panel').style.display = 'none'; }
    showLegend() { document.getElementById('solenoid-legend').style.display = 'flex'; }
    hideLegend() { document.getElementById('solenoid-legend').style.display = 'none'; }

    _bindControls() {
        const $ = id => document.getElementById(id);

        $('prev-btn').addEventListener('click', () => this.goTo(this.step - 1));
        $('next-btn').addEventListener('click', () => this.goTo(this.step + 1));

        $('btn-plus1').addEventListener('click', () => this.diskView.triggerPlusOne());

        $('btn-auto').addEventListener('click', () => {
            this.diskView.autoPlay = !this.diskView.autoPlay;
            const b = $('btn-auto');
            b.textContent = this.diskView.autoPlay ? '⏸' : '▶';
            b.classList.toggle('active-toggle', this.diskView.autoPlay);
        });

        $('btn-labels').addEventListener('click', () => {
            this.diskView.showLabels = !this.diskView.showLabels;
            $('btn-labels').classList.toggle('active-toggle', this.diskView.showLabels);
        });

        $('btn-depth-minus').addEventListener('click', () => {
            this.diskView.setDepth(this.diskView.maxDepth - 1);
            $('depth-label').textContent = 'd=' + this.diskView.maxDepth;
        });
        $('btn-depth-plus').addEventListener('click', () => {
            this.diskView.setDepth(this.diskView.maxDepth + 1);
            $('depth-label').textContent = 'd=' + this.diskView.maxDepth;
        });

        $('speed-slider').addEventListener('input', e => {
            this.diskView.animSpeed = parseFloat(e.target.value);
        });

        document.addEventListener('keydown', e => {
            if (e.key === ' ') { e.preventDefault(); this.diskView.triggerPlusOne(); }
            else if (e.key === 'a') $('btn-auto').click();
            else if (e.key === 'ArrowRight') this.goTo(this.step + 1);
            else if (e.key === 'ArrowLeft') this.goTo(this.step - 1);
            else if (e.key === ']' || e.key === '+') $('btn-depth-plus').click();
            else if (e.key === '[' || e.key === '-') $('btn-depth-minus').click();
            else if (e.key === 'l') $('btn-labels').click();
        });

        window.addEventListener('message', e => {
            if (e.data === 'next') this.goTo(this.step + 1);
            else if (e.data === 'prev') this.goTo(this.step - 1);
            else if (e.data === 'plus1') this.diskView.triggerPlusOne();
            else if (e.data === 'auto') $('btn-auto').click();
            else if (typeof e.data === 'object' && e.data.type === 'goTo') this.goTo(e.data.step);
        });
    }

    _loop(t) {
        const dt = Math.min(0.1, (t - this.lastT) / 1000);
        this.lastT = t;

        this.diskView.update(dt);
        this.solView.update(dt);
        this.diskView.draw();
        this.solView.render();

        requestAnimationFrame(t2 => this._loop(t2));
    }
}

// ── INIT ──
window.addEventListener('load', () => {
    const s = document.createElement('style');
    s.textContent = '.key{color:#7c8aff;font-weight:600}.accent{color:#7c8aff}';
    document.head.appendChild(s);
    new App();
});
