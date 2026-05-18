// §5 — Mandelbrot set as a 3D height field.
// Strategy: compute escape-time on a CPU offscreen canvas (worker-free for portability),
// then feed it as a DataTexture and a displacement to a plane.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function paletteCosmic(t) {
    // cosine palette
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
function paletteEmber(t) {
    return [
        Math.min(1, Math.pow(t, 0.5)*1.3),
        Math.pow(t, 1.4)*0.9,
        Math.pow(t, 3)*0.5 + 0.05,
    ];
}
function paletteMono(t) {
    const v = Math.pow(t, 0.65);
    return [v, v, v];
}

const PALETTES = { cosmic: paletteCosmic, ember: paletteEmber, mono: paletteMono };

function computeField(N, maxIter, xMin = -2.2, xMax = 0.8, yMin = -1.3, yMax = 1.3) {
    // returns Float32Array of length N*N giving smooth iteration count in [0,1]
    const field = new Float32Array(N * N);
    const xRange = xMax - xMin, yRange = yMax - yMin;
    for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
            const x0 = xMin + (px/(N-1))*xRange;
            const y0 = yMin + (py/(N-1))*yRange;
            // Quick cardioid / period-2 bulb test
            const xq = x0 - 0.25;
            const q = xq*xq + y0*y0;
            if (q*(q + xq) < 0.25*y0*y0) { field[py*N + px] = 1.0; continue; }
            const xp = x0 + 1;
            if (xp*xp + y0*y0 < 0.0625) { field[py*N + px] = 1.0; continue; }

            let x = 0, y = 0, n = 0;
            while (x*x + y*y <= 256 && n < maxIter) {
                const xt = x*x - y*y + x0;
                y = 2*x*y + y0;
                x = xt;
                n++;
            }
            if (n === maxIter) {
                field[py*N + px] = 1.0; // interior
            } else {
                // smooth escape
                const log_zn = Math.log(x*x + y*y) / 2;
                const nu = Math.log(log_zn / Math.LN2) / Math.LN2;
                const smooth = n + 1 - nu;
                field[py*N + px] = Math.min(1, smooth / maxIter);
            }
        }
    }
    return field;
}

export function makeMandelViz(container, opts = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060f);

    const w0 = container.clientWidth || 800, h0 = container.clientHeight || 540;
    const camera = new THREE.PerspectiveCamera(38, w0/h0, 0.05, 100);
    camera.position.set(2.4, 1.8, 2.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(-0.4, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xc4d2ff, 0.9);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8aff, 0.35);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    // The mesh — a plane with displacement
    let mesh = null;
    let texture = null;
    let hoverDot = null;
    const xMin = -2.2, xMax = 0.8, yMin = -1.3, yMax = 1.3;

    function buildMesh(N, maxIter, height, palette) {
        const field = computeField(N, maxIter, xMin, xMax, yMin, yMax);
        const palFn = PALETTES[palette] || PALETTES.cosmic;

        // Build color image
        const colorData = new Uint8Array(N * N * 4);
        for (let i = 0; i < N*N; i++) {
            const v = field[i];
            const rgb = (v >= 1) ? [0.05, 0.06, 0.14] : palFn(v);
            colorData[i*4]     = Math.min(255, Math.round(255*rgb[0]));
            colorData[i*4 + 1] = Math.min(255, Math.round(255*rgb[1]));
            colorData[i*4 + 2] = Math.min(255, Math.round(255*rgb[2]));
            colorData[i*4 + 3] = 255;
        }
        const tex = new THREE.DataTexture(colorData, N, N, THREE.RGBAFormat);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;

        // Build geometry: a plane with N×N vertices, displaced in Y by f(v)
        const W = (xMax - xMin), H = (yMax - yMin);
        const geom = new THREE.PlaneGeometry(W, H, N - 1, N - 1);
        // rotate so plane lies in (x,z), with y as up
        geom.rotateX(-Math.PI/2);
        const pos = geom.attributes.position;
        for (let py = 0; py < N; py++) {
            for (let px = 0; px < N; px++) {
                const v = field[py*N + px];
                const idx = py*N + px;
                let h;
                if (v >= 1) {
                    h = 0;
                } else {
                    // log-ish scaling for crisper "shore"
                    h = Math.pow(v, 0.45) * height;
                }
                pos.setY(idx, h);
            }
        }
        geom.computeVertexNormals();
        // Recentre x so the cardioid is roughly visible
        geom.translate(xMin + W/2, 0, yMin + H/2);

        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.45,
            metalness: 0.1,
            flatShading: false,
        });

        if (mesh) {
            mesh.geometry.dispose();
            mesh.material.map.dispose();
            mesh.material.dispose();
            scene.remove(mesh);
        }
        mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { N, xMin, xMax, yMin, yMax, height, field };
        scene.add(mesh);
        texture = tex;

        // Hover dot
        if (!hoverDot) {
            hoverDot = new THREE.Mesh(
                new THREE.SphereGeometry(0.025, 12, 10),
                new THREE.MeshBasicMaterial({ color: 0xffe9b3 })
            );
            scene.add(hoverDot);
        }
    }

    buildMesh(opts.N || 384, opts.maxIter || 200, opts.height || 0.6, opts.palette || 'cosmic');

    function setParams({ N, maxIter, height, palette }) {
        buildMesh(N, maxIter, height, palette);
    }

    // Pointer raycaster for picking c
    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let pickCallback = null;

    renderer.domElement.addEventListener('pointermove', (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(ptr, camera);
        if (!mesh) return;
        const hits = raycaster.intersectObject(mesh);
        if (hits.length) {
            const p = hits[0].point;
            const c = [p.x, p.z];
            hoverDot.position.set(p.x, p.y + 0.02, p.z);
            if (pickCallback) pickCallback(c, false);
        }
    });
    renderer.domElement.addEventListener('click', (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(ptr, camera);
        if (!mesh) return;
        const hits = raycaster.intersectObject(mesh);
        if (hits.length && pickCallback) {
            const p = hits[0].point;
            pickCallback([p.x, p.z], true);
        }
    });

    function onPick(cb) { pickCallback = cb; }

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

    return { setParams, onPick };
}
