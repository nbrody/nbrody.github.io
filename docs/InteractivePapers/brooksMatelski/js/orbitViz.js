// §4 — 3D orbit visualization of z_{n+1} = z_n^2 + c. Height = iteration index.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { cmul, cadd } from './complex.js';

export function makeOrbitViz(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);

    const w0 = container.clientWidth || 600, h0 = container.clientHeight || 460;
    const camera = new THREE.PerspectiveCamera(40, w0/h0, 0.05, 200);
    camera.position.set(5, 4, 7);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 1.5);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xc4d2ff, 0.7);
    key.position.set(3, 4, 5);
    scene.add(key);

    // Floor plane (the c-plane visualisation): a faint grid disc
    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(2.5, 64),
        new THREE.MeshBasicMaterial({ color: 0x101732, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI/2;
    scene.add(floor);
    // Floor wireframe
    const floorWire = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.RingGeometry(0.001, 2.5, 64, 5)),
        new THREE.LineBasicMaterial({ color: 0x33406c, transparent: true, opacity: 0.55 })
    );
    floorWire.rotation.x = -Math.PI/2;
    scene.add(floorWire);

    // Origin marker (z=0)
    const origin = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(origin);

    // Axes labels (simple lines)
    const ax = new THREE.AxesHelper(1.2);
    ax.position.set(0, 0.001, 0);
    scene.add(ax);

    // The orbit polyline + markers
    let orbitLine = null;
    const dotsGeo = new THREE.BufferGeometry();
    dotsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const dotsMat = new THREE.PointsMaterial({ color: 0xffe9b3, size: 0.06, sizeAttenuation: true });
    const dots = new THREE.Points(dotsGeo, dotsMat);
    scene.add(dots);

    function buildOrbit(c, length, zScale) {
        if (orbitLine) {
            orbitLine.geometry.dispose();
            scene.remove(orbitLine);
            orbitLine = null;
        }
        const pts = [];
        const dotPos = [];
        let z = [0, 0];
        pts.push(z[0], 0, z[1]);
        dotPos.push(z[0], 0, z[1]);
        let escaped = false;
        for (let i = 1; i <= length; i++) {
            z = cadd(cmul(z, z), c);
            const r = Math.hypot(z[0], z[1]);
            if (r > 6) { escaped = true; break; }
            pts.push(z[0], i * zScale, z[1]);
            if (i % 1 === 0) dotPos.push(z[0], i * zScale, z[1]);
        }

        const colors = [];
        for (let i = 0; i < pts.length / 3; i++) {
            const t = i / Math.max(1, (pts.length/3 - 1));
            // gradient from cool to warm
            const r = 0.4 + 0.6*t;
            const g = 0.7 - 0.3*t;
            const b = 1.0 - 0.7*t;
            colors.push(r, g, b);
        }

        const geo = new LineGeometry();
        geo.setPositions(pts);
        geo.setColors(colors);
        const mat = new LineMaterial({
            linewidth: 3,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            worldUnits: false,
        });
        mat.resolution.set(container.clientWidth, container.clientHeight);
        orbitLine = new Line2(geo, mat);
        orbitLine.computeLineDistances();
        scene.add(orbitLine);

        dotsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dotPos), 3));
        dotsGeo.attributes.position.needsUpdate = true;

        return escaped;
    }

    let last = { c: [-0.7269, 0.1889], length: 120, zScale: 0.5 };

    function setParams(c, length, zScale) {
        last = { c, length, zScale };
        return buildOrbit(c, length, zScale);
    }

    function resize() {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w/h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (orbitLine) orbitLine.material.resolution.set(w, h);
    }
    new ResizeObserver(resize).observe(container);

    function tick() {
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    tick();

    buildOrbit(last.c, last.length, last.zScale);

    return { setParams };
}

// ─── companion c-plane picker canvas ───
export function makeOrbitPicker(canvas, onPick) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const xMin = -2.1, xMax = 0.8, yMin = -1.2, yMax = 1.2;
    const xRange = xMax - xMin, yRange = yMax - yMin;

    // Pre-rendered Mandelbrot escape-time
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const ITER = 80;
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const x0 = xMin + (px/W)*xRange;
            const y0 = yMax - (py/H)*yRange;
            let x = 0, y = 0, n = 0;
            while (x*x + y*y <= 4 && n < ITER) {
                const xt = x*x - y*y + x0;
                y = 2*x*y + y0;
                x = xt;
                n++;
            }
            const idx = (py*W + px) * 4;
            if (n === ITER) {
                data[idx] = 20; data[idx+1] = 24; data[idx+2] = 48;
            } else {
                const t = n / ITER;
                data[idx]   = 30 + 200 * Math.pow(t, 0.5);
                data[idx+1] = 30 + 120 * Math.pow(t, 0.7);
                data[idx+2] = 60 + 180 * (1 - Math.pow(t, 0.6));
            }
            data[idx+3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    // Overlay crosshair
    function drawCrosshair(c) {
        ctx.putImageData(img, 0, 0);
        const px = ((c[0] - xMin) / xRange) * W;
        const py = ((yMax - c[1]) / yRange) * H;
        ctx.strokeStyle = '#ffe9b3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py);
        ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI*2);
        ctx.stroke();
    }

    function evt(e) {
        const r = canvas.getBoundingClientRect();
        const px = (e.clientX - r.left) * (W / r.width);
        const py = (e.clientY - r.top)  * (H / r.height);
        const cx = xMin + (px/W)*xRange;
        const cy = yMax - (py/H)*yRange;
        return [cx, cy];
    }

    let dragging = false;
    canvas.addEventListener('mousedown', e => { dragging = true; const c = evt(e); drawCrosshair(c); onPick(c); });
    canvas.addEventListener('mousemove', e => { if (!dragging) return; const c = evt(e); drawCrosshair(c); onPick(c); });
    window.addEventListener('mouseup', () => { dragging = false; });

    drawCrosshair([-0.7269, 0.1889]);
}
