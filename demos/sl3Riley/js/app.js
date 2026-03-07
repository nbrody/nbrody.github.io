// ── Main Application Controller ──
// Uses a pool of Web Workers for parallel computation.

import { marchingCubes } from './marching.js';
import { initScene, buildMesh, toggleWire, toggleClip, toggleBox } from './scene.js';

// Expose toggle functions to HTML onclick handlers
window.toggleWire = toggleWire;
window.toggleClip = toggleClip;
window.toggleBox = toggleBox;

// H key toggles all UI overlays
window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
        const els = document.querySelectorAll('#ui, #status, #progress');
        const hidden = document.getElementById('ui').style.display === 'none';
        els.forEach(el => el.style.display = hidden ? '' : 'none');
    }
});


// ── Slider live updates ──
document.getElementById('res').oninput = e =>
    document.getElementById('resVal').textContent = e.target.value;
document.getElementById('depth').oninput = e =>
    document.getElementById('depthVal').textContent = e.target.value;
document.getElementById('maxExp').oninput = e =>
    document.getElementById('maxExpVal').textContent = e.target.value;
document.getElementById('thresh').oninput = e =>
    document.getElementById('threshVal').textContent = (e.target.value / 100).toFixed(2);

// ── Worker pool ──
const NUM_WORKERS = Math.max(1, navigator.hardwareConcurrency || 4);
let workerPool = [];

function ensureWorkers() {
    if (workerPool.length === NUM_WORKERS) return;
    // Terminate any existing workers
    workerPool.forEach(w => w.terminate());
    workerPool = [];
    for (let i = 0; i < NUM_WORKERS; i++) {
        workerPool.push(new Worker('js/worker.js'));
    }
}

// ── Main computation ──
let computeId = 0; // to discard stale results if user re-clicks

async function compute() {
    const thisId = ++computeId;
    const N = parseInt(document.getElementById('res').value);
    const maxAlt = parseInt(document.getElementById('depth').value);
    const maxExp = parseInt(document.getElementById('maxExp').value);
    const threshold = parseInt(document.getElementById('thresh').value) / 100;

    // Update display values
    document.getElementById('resVal').textContent = N;
    document.getElementById('depthVal').textContent = maxAlt;
    document.getElementById('maxExpVal').textContent = maxExp;
    document.getElementById('threshVal').textContent = threshold.toFixed(2);

    const prog = document.getElementById('progress');
    prog.style.display = 'block';
    const fill = document.getElementById('progFill');
    const ptext = document.getElementById('progText');

    ensureWorkers();

    const field = new Float32Array(N * N * N);
    const total = N;
    let completed = 0;

    // Divide z-slabs among workers
    const slabsPerWorker = Math.ceil(N / NUM_WORKERS);

    const t0 = performance.now();

    await new Promise((resolve) => {
        let pending = 0;

        for (let w = 0; w < NUM_WORKERS; w++) {
            const zStart = w * slabsPerWorker;
            const zEnd = Math.min(zStart + slabsPerWorker, N);
            if (zStart >= N) continue;

            pending++;
            const worker = workerPool[w];

            worker.onmessage = (e) => {
                if (thisId !== computeId) return; // stale

                const { zStart: zs, result } = e.data;
                // Copy worker result into field (fast typed array bulk copy)
                field.set(result, zs * N * N);

                completed += (Math.min(zs + slabsPerWorker, N) - zs);
                const pct = Math.round(completed / total * 100);
                fill.style.width = pct + '%';
                ptext.textContent = `${completed} / ${total} z-slabs (${NUM_WORKERS} workers)`;

                pending--;
                if (pending === 0) resolve();
            };

            worker.postMessage({ zStart, zEnd, N, maxAlt, maxExp, threshold });
        }
    });

    if (thisId !== computeId) return; // stale

    const dt = ((performance.now() - t0) / 1000).toFixed(2);
    ptext.textContent = 'Building mesh…';
    await new Promise(r => setTimeout(r, 20));

    const result = marchingCubes(field, N, 0.5, [-2.1, -2.1, -2.1], [2.1, 2.1, 2.1]);
    buildMesh(result.verts, result.faces);

    prog.style.display = 'none';
    document.getElementById('status').textContent =
        `${result.faces.length} tris · ${N}³ · ${maxAlt} alt · ±${maxExp} · ${dt}s · ${NUM_WORKERS}w`;
}

window.compute = compute;

// ── Init ──
initScene();
setTimeout(compute, 500);
