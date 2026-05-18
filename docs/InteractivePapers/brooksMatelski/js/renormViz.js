// §3 — Renormalization: a square grid in the dynamical plane re-mapped by the n-th iterate of f_c(z) = z^2 + c.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cmul, cadd } from './complex.js';

export function makeRenormViz(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);

    const w0 = container.clientWidth || 800, h0 = container.clientHeight || 420;
    const camera = new THREE.PerspectiveCamera(40, w0/h0, 0.05, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableRotate = false;
    controls.enableZoom = true;
    controls.enablePan = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    // Two layered grids
    const baseGroup = new THREE.Group();
    const transGroup = new THREE.Group();
    scene.add(baseGroup);
    scene.add(transGroup);

    function buildBaseGrid() {
        baseGroup.clear();
        const mat = new THREE.LineBasicMaterial({ color: 0x445080, transparent: true, opacity: 0.6 });
        const range = 2.0, N = 20;
        for (let i = 0; i <= N; i++) {
            const t = -range + (i/N)*2*range;
            const pts1 = [new THREE.Vector3(t, -range, 0), new THREE.Vector3(t, range, 0)];
            const pts2 = [new THREE.Vector3(-range, t, 0), new THREE.Vector3(range, t, 0)];
            baseGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), mat));
            baseGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), mat));
        }
        // Unit circle
        const circPts = Array.from({ length: 128 }, (_, i) => {
            const a = (i/127)*Math.PI*2;
            return new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
        });
        baseGroup.add(new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(circPts),
            new THREE.LineBasicMaterial({ color: 0x9bb1ff, transparent: true, opacity: 0.5 })
        ));
    }

    function applyIter(z, c, n) {
        let w = [z[0], z[1]];
        for (let k = 0; k < n; k++) {
            w = cadd(cmul(w, w), c);
            if (Math.hypot(w[0], w[1]) > 50) return null;
        }
        return w;
    }

    function buildTransformedGrid(c, n) {
        transGroup.clear();
        const range = 2.0, N = 22;
        const denseN = 80;
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xffc46b, transparent: true, opacity: 0.85
        });
        // Horizontals
        for (let i = 0; i <= N; i++) {
            const y = -range + (i/N)*2*range;
            const pts = [];
            for (let j = 0; j <= denseN; j++) {
                const x = -range + (j/denseN)*2*range;
                const w = applyIter([x, y], c, n);
                if (!w) { if (pts.length > 1) {
                    transGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
                } pts.length = 0; continue; }
                pts.push(new THREE.Vector3(w[0], w[1], 0));
            }
            if (pts.length > 1) transGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        }
        // Verticals
        for (let i = 0; i <= N; i++) {
            const x = -range + (i/N)*2*range;
            const pts = [];
            for (let j = 0; j <= denseN; j++) {
                const y = -range + (j/denseN)*2*range;
                const w = applyIter([x, y], c, n);
                if (!w) { if (pts.length > 1) {
                    transGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
                } pts.length = 0; continue; }
                pts.push(new THREE.Vector3(w[0], w[1], 0));
            }
            if (pts.length > 1) transGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        }
        // Rescale to fit
        const box = new THREE.Box3().setFromObject(transGroup);
        if (isFinite(box.max.x) && isFinite(box.min.x)) {
            const sx = Math.max(box.max.x - box.min.x, 0.1);
            const sy = Math.max(box.max.y - box.min.y, 0.1);
            const scale = 3.4 / Math.max(sx, sy);
            transGroup.scale.set(scale, scale, 1);
            const cx = (box.max.x + box.min.x) / 2;
            const cy = (box.max.y + box.min.y) / 2;
            transGroup.position.set(-cx*scale, -cy*scale, 0);
        }
    }

    buildBaseGrid();

    function setParams(c, step) {
        buildTransformedGrid(c, step);
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

    return { setParams };
}
