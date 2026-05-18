// §2 — Orbit of 0 under <A, B> with A(z) = z+1, B(z) = z / (1 - μ z), drawn on the Riemann sphere.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cmul, cadd, csub, cdiv, mob, matmul, matinv, C } from './complex.js';

function stereoUp(z) {
    if (!isFinite(z[0]) || !isFinite(z[1])) return new THREE.Vector3(0, 0, 1);
    const x = z[0], y = z[1];
    const d = 1 + x*x + y*y;
    if (d > 1e10) return new THREE.Vector3(0, 0, 1);
    return new THREE.Vector3(2*x/d, 2*y/d, (x*x + y*y - 1)/d);
}

export function makeTwoGenViz(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);

    const w0 = container.clientWidth || 800, h0 = container.clientHeight || 480;
    const camera = new THREE.PerspectiveCamera(40, w0/h0, 0.05, 100);
    camera.position.set(2.2, 1.4, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.rotateSpeed = 0.7;

    // Sphere
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshPhysicalMaterial({
            color: 0x0a112a, transparent: true, opacity: 0.6,
            roughness: 0.45, metalness: 0.0,
        })
    );
    scene.add(sphere);

    // Equator
    scene.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 96 }, (_, i) => {
                const t = (i/96)*Math.PI*2;
                return new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
            })
        ),
        new THREE.LineBasicMaterial({ color: 0x506496, transparent: true, opacity: 0.35 })
    ));

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xc4d2ff, 0.7);
    key.position.set(3, 4, 2);
    scene.add(key);

    // Orbit point cloud
    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const orbitMat = new THREE.PointsMaterial({
        size: 0.018, sizeAttenuation: true,
        color: 0xffc46b,
        transparent: true, opacity: 0.92,
    });
    const orbitPts = new THREE.Points(orbitGeo, orbitMat);
    scene.add(orbitPts);

    // Optional hull (isometric spheres of A^k B^±1 A^k truncated)
    const hullGroup = new THREE.Group();
    scene.add(hullGroup);

    let showHull = false;

    function buildOrbit(mu, depth) {
        // Generators in SL(2,C) with det = 1
        const A = [C(1,0), C(1,0), C(0,0), C(1,0)];
        const Ai = [C(1,0), C(-1,0), C(0,0), C(1,0)];
        // B = [[1,0],[-μ,1]], B^-1 = [[1,0],[μ,1]]
        const B  = [C(1,0), C(0,0), [-mu[0], -mu[1]], C(1,0)];
        const Bi = [C(1,0), C(0,0), [ mu[0],  mu[1]], C(1,0)];
        const gens = [A, Ai, B, Bi];

        // BFS / DFS enumeration of reduced words; avoid immediate backtracking.
        // Track (matrix, lastGen) and emit M·0 for each.
        const points = [];
        const start = [C(1,0), C(0,0), C(0,0), C(1,0)];
        // Add identity
        points.push([0, 0]);
        const stack = [[start, -1, 0]];
        const MAX = 60000;
        while (stack.length && points.length < MAX) {
            const [M, last, d] = stack.pop();
            if (d >= depth) continue;
            for (let i = 0; i < 4; i++) {
                // Don't undo last generator (avoid trivial cancellation)
                if (last >= 0 && (i ^ 1) === last) continue;
                const Mi = matmul(M, gens[i]);
                // M·0 = b/d
                const z = cdiv(Mi[1], Mi[3]);
                if (isFinite(z[0]) && isFinite(z[1]) && Math.hypot(z[0], z[1]) < 1e6) {
                    points.push(z);
                }
                stack.push([Mi, i, d+1]);
            }
        }

        // Convert to sphere positions
        const positions = new Float32Array(points.length * 3);
        let j = 0;
        for (const z of points) {
            const v = stereoUp(z);
            positions[j++] = v.x; positions[j++] = v.y; positions[j++] = v.z;
        }
        orbitGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        orbitGeo.computeBoundingSphere();

        // Hull spheres: draw isometric circles of A^k B A^-k for small k as circles on S^2
        hullGroup.clear();
        if (showHull) {
            for (let k = -4; k <= 4; k++) {
                // A^k B A^-k: maps 0 to a/(c·0 + d) where we compute
                let M = start;
                for (let t = 0; t < Math.abs(k); t++) M = matmul(M, k >= 0 ? A : Ai);
                M = matmul(M, B);
                for (let t = 0; t < Math.abs(k); t++) M = matmul(M, k >= 0 ? Ai : A);

                // Isometric circle of g = [[a,b],[c,d]]: |cz+d| = 1
                // centre = -d/c, radius = 1/|c|
                const [a, b, c, d] = M;
                if (Math.hypot(c[0], c[1]) < 1e-8) continue;
                const center = cdiv([-d[0], -d[1]], c);
                const radius = 1 / Math.hypot(c[0], c[1]);
                // Draw a circle in C and lift to S^2
                const pts = [];
                for (let i = 0; i <= 120; i++) {
                    const a2 = (i/120)*Math.PI*2;
                    const z = [center[0] + radius*Math.cos(a2), center[1] + radius*Math.sin(a2)];
                    pts.push(stereoUp(z));
                }
                hullGroup.add(new THREE.LineLoop(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    new THREE.LineBasicMaterial({ color: 0x7eb6ff, transparent: true, opacity: 0.45 })
                ));
            }
        }

        return points.length;
    }

    let lastMu = [1.91, 0.05], lastDepth = 11;
    function setParams(mu, depth, hull) {
        lastMu = mu; lastDepth = depth; showHull = !!hull;
        return buildOrbit(mu, depth);
    }

    function resize() {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w/h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    new ResizeObserver(resize).observe(container);

    function tick() {
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    tick();

    buildOrbit(lastMu, lastDepth);
    return { setParams };
}
