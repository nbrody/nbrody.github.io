// §6 — Julia set companion. A canvas for the (c-plane) Mandelbrot picker on the left, 3D Julia height on the right.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function paletteCosmic(t) {
    const a = [0.5, 0.5, 0.5];
    const b = [0.5, 0.5, 0.5];
    const c = [1.0, 1.0, 1.0];
    const d = [0.0, 0.33, 0.67];
    const tau = 6.2831853;
    return [
        a[0] + b[0]*Math.cos(tau*(c[0]*t + d[0])),
        a[1] + b[1]*Math.cos(tau*(c[1]*t + d[1])),
        a[2] + b[2]*Math.cos(tau*(c[2]*t + d[2])),
    ];
}

function computeJuliaField(N, c, maxIter, range = 1.6) {
    const field = new Float32Array(N * N);
    const xMin = -range, xMax = range, yMin = -range, yMax = range;
    const xR = xMax - xMin, yR = yMax - yMin;
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            let x = xMin + (px/(N-1))*xR;
            let y = yMin + (py/(N-1))*yR;
            let n = 0;
            while (x*x + y*y <= 256 && n < maxIter) {
                const xt = x*x - y*y + c[0];
                y = 2*x*y + c[1];
                x = xt;
                n++;
            }
            if (n === maxIter) {
                field[py*N + px] = 1.0;
            } else {
                const log_zn = Math.log(x*x + y*y) / 2;
                const nu = Math.log(log_zn / Math.LN2) / Math.LN2;
                const smooth = n + 1 - nu;
                field[py*N + px] = Math.min(1, smooth / maxIter);
            }
        }
    }
    return field;
}

export function makeJuliaPicker(canvas, onPick) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const xMin = -2.2, xMax = 0.8, yMin = -1.3, yMax = 1.3;
    const xR = xMax - xMin, yR = yMax - yMin;

    // Render Mandelbrot once
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const ITER = 100;
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const x0 = xMin + (px/W)*xR;
            const y0 = yMax - (py/H)*yR;
            // cardioid / period-2 quick test
            const xq = x0 - 0.25;
            const q = xq*xq + y0*y0;
            const inside = q*(q + xq) < 0.25*y0*y0 || (x0+1)*(x0+1) + y0*y0 < 0.0625;
            let n = 0, x = 0, y = 0;
            if (!inside) {
                while (x*x + y*y <= 256 && n < ITER) {
                    const xt = x*x - y*y + x0;
                    y = 2*x*y + y0;
                    x = xt;
                    n++;
                }
            } else { n = ITER; }
            const idx = (py*W + px) * 4;
            if (n === ITER) {
                data[idx] = 12; data[idx+1] = 14; data[idx+2] = 30;
            } else {
                const log_zn = Math.log(x*x + y*y) / 2;
                const nu = Math.log(log_zn / Math.LN2) / Math.LN2;
                const smooth = (n + 1 - nu) / ITER;
                const rgb = paletteCosmic(Math.min(1, smooth));
                data[idx]   = Math.min(255, Math.round(255*rgb[0]));
                data[idx+1] = Math.min(255, Math.round(255*rgb[1]));
                data[idx+2] = Math.min(255, Math.round(255*rgb[2]));
            }
            data[idx+3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    let pinned = false;
    let pinnedC = null;
    let currentC = [-0.7269, 0.1889];

    function drawCrosshair(c, pinnedDot) {
        ctx.putImageData(img, 0, 0);
        const px = ((c[0] - xMin) / xR) * W;
        const py = ((yMax - c[1]) / yR) * H;
        ctx.strokeStyle = pinnedDot ? '#ff8aff' : '#ffe9b3';
        ctx.lineWidth = pinnedDot ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(px - 9, py); ctx.lineTo(px + 9, py);
        ctx.moveTo(px, py - 9); ctx.lineTo(px, py + 9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI*2);
        ctx.stroke();
        // also paint last pinned
        if (pinnedDot && pinnedC && pinnedC !== c) {
            const ppx = ((pinnedC[0] - xMin) / xR) * W;
            const ppy = ((yMax - pinnedC[1]) / yR) * H;
            ctx.strokeStyle = '#ff8aff';
            ctx.beginPath();
            ctx.arc(ppx, ppy, 4, 0, Math.PI*2);
            ctx.stroke();
        }
    }

    function evt(e) {
        const r = canvas.getBoundingClientRect();
        const px = (e.clientX - r.left) * (W / r.width);
        const py = (e.clientY - r.top)  * (H / r.height);
        const cx = xMin + (px/W)*xR;
        const cy = yMax - (py/H)*yR;
        return [cx, cy];
    }

    canvas.addEventListener('mousemove', (e) => {
        if (pinned) return;
        const c = evt(e);
        currentC = c;
        drawCrosshair(c, false);
        onPick(c, false);
    });
    canvas.addEventListener('click', (e) => {
        const c = evt(e);
        pinned = !pinned;
        if (pinned) {
            pinnedC = c;
            currentC = c;
        } else {
            pinnedC = null;
        }
        drawCrosshair(c, pinned);
        onPick(c, pinned);
    });

    function setPin(p) {
        pinned = p;
        if (!p) pinnedC = null;
        drawCrosshair(currentC, pinned);
    }

    drawCrosshair(currentC, false);
    return { setPin };
}

export function makeJulia3D(container, opts = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);

    const w0 = container.clientWidth || 600, h0 = container.clientHeight || 460;
    const camera = new THREE.PerspectiveCamera(40, w0/h0, 0.05, 100);
    camera.position.set(2.4, 2.0, 2.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xc4d2ff, 0.9);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8aff, 0.35);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    let mesh = null;

    function build(c, N, maxIter, height) {
        const field = computeJuliaField(N, c, maxIter);
        const colorData = new Uint8Array(N * N * 4);
        for (let i = 0; i < N*N; i++) {
            const v = field[i];
            const rgb = (v >= 1) ? [0.05, 0.06, 0.14] : paletteCosmic(v);
            colorData[i*4]     = Math.min(255, Math.round(255*rgb[0]));
            colorData[i*4 + 1] = Math.min(255, Math.round(255*rgb[1]));
            colorData[i*4 + 2] = Math.min(255, Math.round(255*rgb[2]));
            colorData[i*4 + 3] = 255;
        }
        const tex = new THREE.DataTexture(colorData, N, N, THREE.RGBAFormat);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        const range = 1.6;
        const geom = new THREE.PlaneGeometry(2*range, 2*range, N-1, N-1);
        geom.rotateX(-Math.PI/2);
        const pos = geom.attributes.position;
        for (let py = 0; py < N; py++) {
            for (let px = 0; px < N; px++) {
                const v = field[py*N + px];
                let h = v >= 1 ? 0 : Math.pow(v, 0.5) * height;
                pos.setY(py*N + px, h);
            }
        }
        geom.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05 });
        if (mesh) {
            mesh.geometry.dispose();
            mesh.material.map.dispose();
            mesh.material.dispose();
            scene.remove(mesh);
        }
        mesh = new THREE.Mesh(geom, mat);
        scene.add(mesh);
    }

    function setParams(c, maxIter, height) {
        build(c, opts.N || 240, maxIter, height);
    }

    build(opts.c || [-0.7269, 0.1889], opts.N || 240, opts.maxIter || 200, opts.height || 0.5);

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
