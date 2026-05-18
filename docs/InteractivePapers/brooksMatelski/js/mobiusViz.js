// §1 — Riemann sphere with a Möbius transformation visualised by its flow lines.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cmul, cadd, csub, cdiv, cexp, csqrt, C } from './complex.js';

// Stereographic projection from C∪{∞} to S^2 ⊂ R^3 (south pole = 0, north = ∞).
// Project z = x+iy to (X,Y,Z) on unit sphere centred at origin.
function stereoUp(z) {
    const x = z[0], y = z[1];
    const d = 1 + x*x + y*y;
    return new THREE.Vector3(2*x/d, 2*y/d, (x*x + y*y - 1)/d);
}

export function makeMobiusViz(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);

    const w0 = container.clientWidth || 800;
    const h0 = container.clientHeight || 460;
    const camera = new THREE.PerspectiveCamera(40, w0/h0, 0.1, 100);
    camera.position.set(2.4, 1.8, 2.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;

    // Sphere
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshPhysicalMaterial({
            color: 0x0e1430, transparent: true, opacity: 0.78,
            roughness: 0.35, metalness: 0.0, transmission: 0.05, sheen: 0.6,
            sheenColor: 0x8aa6ff,
        })
    );
    scene.add(sphere);

    // Equator wire
    const equator = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 128 }, (_, i) => {
                const t = (i/128)*Math.PI*2;
                return new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
            })
        ),
        new THREE.LineBasicMaterial({ color: 0x9bb1ff, transparent: true, opacity: 0.5 })
    );
    scene.add(equator);

    // Meridians
    for (let k = 0; k < 6; k++) {
        const ang = k * Math.PI / 6;
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const t = -Math.PI/2 + (i/64)*Math.PI;
            pts.push(new THREE.Vector3(Math.cos(t)*Math.cos(ang), Math.cos(t)*Math.sin(ang), Math.sin(t)));
        }
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x4b5c9f, transparent: true, opacity: 0.4 })
        ));
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xb9c8ff, 1.0);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xff80ff, 0.6, 10);
    rim.position.set(-3, -2, -2);
    scene.add(rim);

    // Flow line group (we'll rebuild on parameter change)
    const flowGroup = new THREE.Group();
    scene.add(flowGroup);

    // Fixed-point markers
    const fpGroup = new THREE.Group();
    scene.add(fpGroup);

    // Moving particles along flow lines
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);

    // Current state
    const state = {
        type: 'loxodromic',
        length: 0.8,
        rotation: 0.6,
        animate: true,
        // Möbius matrix M and "log" generator L so M = exp(L)
        L: null, // 2x2 complex of "off-diagonal" form for parabolic, diag for loxodromic
        fixed: [], // up to 2 complex fixed points
        traceText: '2',
    };

    function buildFlowLines() {
        flowGroup.clear();
        fpGroup.clear();
        particleGroup.clear();

        const { type } = state;
        const ell = state.length, th = state.rotation;
        // Logarithm of M: choose canonical conjugacy class form
        // - loxodromic / hyperbolic: M ~ diag(λ, 1/λ),  λ = exp((ell + i th)/2)
        // - elliptic: ell = 0
        // - parabolic: λ = ±1 (we use translation z->z+1, fixed point at ∞)
        let lineColor = 0x8aa6ff;
        let fixedPts = [];
        let flowFn;

        if (type === 'parabolic') {
            // single fixed point at ∞ (north pole). Flow: z(t) = z + t
            fixedPts = [{ z: 'N', label: '∞' }];
            flowFn = (z0, t) => [z0[0] + t, z0[1]];
            lineColor = 0xffc46b;
        } else {
            // loxodromic/elliptic/hyperbolic: fixed pts 0 and ∞ in normalised form, λ = exp(μ/2)
            const mu = type === 'elliptic' ? [0, th] : type === 'hyperbolic' ? [ell, 0] : [ell, th];
            // Flow: z(t) = exp(t * mu) * z
            fixedPts = [{ z: [0, 0], label: '0' }, { z: 'N', label: '∞' }];
            flowFn = (z0, t) => {
                const factor = cexp([mu[0]*t, mu[1]*t]);
                return cmul(factor, z0);
            };
            state.traceText = `2 cosh((${ell.toFixed(2)} + i·${th.toFixed(2)})/2)`;
            if (type === 'elliptic') state.traceText = `2 cos(${(th/2).toFixed(2)})`;
            if (type === 'hyperbolic') state.traceText = `2 cosh(${(ell/2).toFixed(2)})`;
        }
        if (type === 'parabolic') state.traceText = '±2';

        // Render fixed-point markers
        for (const fp of fixedPts) {
            const pt = fp.z === 'N' ? new THREE.Vector3(0, 0, 1) : stereoUp(fp.z);
            const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.035, 18, 14),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            dot.position.copy(pt);
            fpGroup.add(dot);
        }

        // Draw a set of seed points and flow them
        const seeds = [];
        // Radial seeds (in C) covering many radii and angles
        const radii = [0.15, 0.3, 0.5, 0.8, 1.2, 1.8, 2.8];
        const N_ang = 12;
        for (const r of radii) {
            for (let k = 0; k < N_ang; k++) {
                const ang = (k/N_ang)*Math.PI*2;
                seeds.push([r*Math.cos(ang), r*Math.sin(ang)]);
            }
        }

        const T_MAX = 6.0;
        const STEPS = 220;
        for (const s of seeds) {
            const pts = [];
            for (let i = 0; i < STEPS; i++) {
                const t = -T_MAX + (i/(STEPS-1))*2*T_MAX;
                const z = flowFn(s, t);
                if (Math.hypot(z[0], z[1]) > 1e6) break;
                pts.push(stereoUp(z));
            }
            if (pts.length < 2) continue;
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.55 })
            );
            flowGroup.add(line);
        }

        // Particles
        const PARTICLES = 80;
        const partGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLES * 3);
        partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const partMat = new THREE.PointsMaterial({ color: 0xffe9b3, size: 0.045, sizeAttenuation: true });
        const points = new THREE.Points(partGeo, partMat);
        particleGroup.add(points);
        particleGroup.userData = {
            seeds: Array.from({ length: PARTICLES }, () => {
                const r = 0.1 + Math.random()*2.5;
                const a = Math.random()*Math.PI*2;
                return [r*Math.cos(a), r*Math.sin(a)];
            }),
            offsets: Array.from({ length: PARTICLES }, () => Math.random()*T_MAX),
            flowFn,
            T_MAX,
        };
    }

    function setParams(type, length, rotation, animate) {
        state.type = type;
        state.length = length;
        state.rotation = rotation;
        state.animate = animate;
        buildFlowLines();
    }

    function getTraceText() { return state.traceText; }

    function resize() {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w/h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    new ResizeObserver(resize).observe(container);

    let lastT = performance.now();
    function tick() {
        const now = performance.now();
        const dt = (now - lastT)/1000;
        lastT = now;
        controls.update();

        if (state.animate) {
            const d = particleGroup.children[0];
            if (d) {
                const ud = particleGroup.userData;
                const pos = d.geometry.attributes.position;
                for (let i = 0; i < ud.seeds.length; i++) {
                    ud.offsets[i] = (ud.offsets[i] + dt*0.7) % ud.T_MAX;
                    const t = ud.offsets[i] - ud.T_MAX/2;
                    const z = ud.flowFn(ud.seeds[i], t);
                    let v;
                    if (Math.hypot(z[0], z[1]) > 1e6) {
                        v = new THREE.Vector3(0, 0, 1);
                    } else {
                        v = stereoUp(z);
                    }
                    pos.array[i*3] = v.x;
                    pos.array[i*3+1] = v.y;
                    pos.array[i*3+2] = v.z;
                }
                pos.needsUpdate = true;
            }
        }

        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    buildFlowLines();
    tick();

    return { setParams, getTraceText };
}
