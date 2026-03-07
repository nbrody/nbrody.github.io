import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    Mat3, genA, genB, genT, gens, genLabels, genIdxToWord, wordToGenIdx,
    evalWord, wordToLatex, reduceWord, treeDepth, enumerate, growthCounts,
    normalize, eigenvectors, fmtEntryPlain
} from './math.js';

// ===== Three.js Scene =====
const container = document.getElementById('viz-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 100);
camera.position.set(2.2, 1.6, 2.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0x020617, 1);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const pLight = new THREE.PointLight(0xffffff, 0.8);
pLight.position.set(4, 4, 4);
scene.add(pLight);

// ===== Groups for different visualizations =====
const orbitGroup = new THREE.Group();
const axisGroup = new THREE.Group();
scene.add(orbitGroup);
scene.add(axisGroup);

// Semi-transparent solid sphere (occludes backside points)
const sphereSolid = new THREE.Mesh(
    new THREE.SphereGeometry(0.99, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x0a0f1a, transparent: true, opacity: 0.65, depthWrite: true })
);
scene.add(sphereSolid);

// Unit sphere wireframe
const sphereGeo = new THREE.SphereGeometry(1, 48, 24);
const sphereWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(sphereGeo),
    new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.12 })
);
scene.add(sphereWire);

// Coordinate axes on sphere (great circles)
function addGreatCircle(normal, color) {
    const pts = [];
    const n = normalize(normal);
    // Find perpendicular vectors
    let u = Math.abs(n[0]) < 0.9 ? [1,0,0] : [0,1,0];
    u = normalize([
        u[1]*n[2]-u[2]*n[1], u[2]*n[0]-u[0]*n[2], u[0]*n[1]-u[1]*n[0]
    ]);
    const v = [
        n[1]*u[2]-n[2]*u[1], n[2]*u[0]-n[0]*u[2], n[0]*u[1]-n[1]*u[0]
    ];
    for (let i = 0; i <= 128; i++) {
        const θ = (i / 128) * 2 * Math.PI;
        pts.push(new THREE.Vector3(
            Math.cos(θ)*u[0]+Math.sin(θ)*v[0],
            Math.cos(θ)*u[1]+Math.sin(θ)*v[1],
            Math.cos(θ)*u[2]+Math.sin(θ)*v[2]
        ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    axisGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 })));
}
addGreatCircle([1,0,0], 0x64748b);
addGreatCircle([0,1,0], 0x64748b);
addGreatCircle([0,0,1], 0x64748b);

// Coordinate axis markers
function addAxisMarker(pos, color, label) {
    const geo = new THREE.SphereGeometry(0.055, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    axisGroup.add(mesh);
    // Antipodal
    const mesh2 = new THREE.Mesh(geo.clone(), mat.clone());
    mesh2.position.set(-pos[0], -pos[1], -pos[2]);
    axisGroup.add(mesh2);
}
addAxisMarker([1,0,0], 0xef4444, 'e₁');
addAxisMarker([0,1,0], 0x22c55e, 'e₂');
addAxisMarker([0,0,1], 0x3b82f6, 'e₃');

// Eigenvector markers for t
const tEvecs = eigenvectors(genT);
const evecColors = [0xfbbf24, 0xf97316, 0xa78bfa]; // dominant, recessive, neutral
tEvecs.sort((a,b) => Math.abs(b.eigenvalue) - Math.abs(a.eigenvalue));
tEvecs.forEach((ev, i) => {
    const geo = new THREE.SphereGeometry(0.045, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: evecColors[i] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...ev.eigenvector);
    axisGroup.add(mesh);
    const mesh2 = new THREE.Mesh(geo.clone(), mat.clone());
    mesh2.position.set(-ev.eigenvector[0], -ev.eigenvector[1], -ev.eigenvector[2]);
    axisGroup.add(mesh2);
});

// ===== Orbit Computation & Rendering =====
// Color palette: tree depth → color
const depthColors = [
    0x38bdf8, // 0 t's (identity coset)
    0xf472b6, // 1 t
    0xfbbf24, // 2 t's
    0x22c55e, // 3 t's
    0xa78bfa, // 4 t's
    0xfb7185, // 5+
    0x34d399,
    0xf97316,
];

let currentMaxLen = 4;
let currentMode = 'sphere'; // 'sphere' | 'growth' | 'cayley'
let basePoint = normalize([1, 0.6, 0.3]);

function getColor(depth) {
    return depthColors[Math.min(depth, depthColors.length - 1)];
}

function rebuildOrbit() {
    orbitGroup.clear();

    if (currentMode === 'sphere') {
        buildSphereOrbit();
    } else if (currentMode === 'cayley') {
        buildCayleyEmbed();
    }
    updateGrowthChart();
    updateWordResult();
}

function buildSphereOrbit() {
    const { elts } = enumerate(currentMaxLen);

    // Instanced rendering for performance
    const ptGeo = new THREE.SphereGeometry(0.032, 8, 8);
    const groups = new Map(); // depth -> [positions]
    for (const [, { mat, word }] of elts) {
        const p = normalize(mat.apply(basePoint));
        const d = treeDepth(word);
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d).push(p);
    }

    for (const [depth, positions] of groups) {
        const instancedMesh = new THREE.InstancedMesh(
            ptGeo,
            new THREE.MeshStandardMaterial({
                color: getColor(depth),
                roughness: 0.3,
                metalness: 0.5
            }),
            positions.length
        );
        const dummy = new THREE.Object3D();
        positions.forEach((p, i) => {
            dummy.position.set(p[0], p[1], p[2]);
            const scale = 1.0 - 0.08 * Math.min(depth, 5);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });
        orbitGroup.add(instancedMesh);
    }
}

function buildCayleyEmbed() {
    const { elts, edges } = enumerate(currentMaxLen);
    const keyToPos = new Map();
    const ptGeo = new THREE.SphereGeometry(0.025, 6, 6);

    // Embed in R^3: use log of absolute coordinates, preserving sign
    for (const [key, { mat, word }] of elts) {
        const raw = mat.apply(basePoint);
        // Log-compress: sign(x) * log(1 + |x|) — spreads things out well
        const pos = raw.map(x => Math.sign(x) * Math.log1p(Math.abs(x)) * 0.8);
        keyToPos.set(key, pos);
        const d = treeDepth(word);
        const mesh = new THREE.Mesh(ptGeo, new THREE.MeshStandardMaterial({
            color: getColor(d), roughness: 0.3, metalness: 0.5
        }));
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.scale.setScalar(0.6);
        orbitGroup.add(mesh);
    }

    // Edges
    const edgeColors = [0x38bdf8, 0xf472b6, 0xfbbf24]; // a, b, t
    const seenEdges = new Set();
    for (const { src, tgt, type } of edges) {
        const ek = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`;
        if (seenEdges.has(ek)) continue;
        seenEdges.add(ek);
        const p1 = keyToPos.get(src), p2 = keyToPos.get(tgt);
        if (!p1 || !p2) continue;
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1[0],p1[1],p1[2]),
            new THREE.Vector3(p2[0],p2[1],p2[2])
        ]);
        orbitGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: edgeColors[type] || 0x666666,
            transparent: true,
            opacity: type === 2 ? 0.8 : 0.3 // t-edges brighter
        })));
    }
}

// ===== Growth Chart (2D Canvas) =====
function updateGrowthChart() {
    const canvas = document.getElementById('growth-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.clientWidth * 2;
    const H = canvas.height = canvas.clientHeight * 2;
    ctx.clearRect(0, 0, W, H);

    const counts = growthCounts(currentMaxLen);
    const cumulative = counts.map((_, i) => counts.slice(0, i+1).reduce((a,b) => a+b, 0));

    // Draw
    const pad = { l: 60, r: 20, t: 20, b: 40 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const maxVal = Math.max(...cumulative, 1);

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.lineTo(W - pad.r, H - pad.b);
    ctx.stroke();

    // Grid lines and labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${Math.round(H/16)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    for (let i = 0; i <= currentMaxLen; i++) {
        const x = pad.l + (i / currentMaxLen) * plotW;
        ctx.fillText(i.toString(), x, H - pad.b + 30);
    }
    ctx.textAlign = 'right';
    const nTicks = 4;
    for (let i = 0; i <= nTicks; i++) {
        const val = Math.round(maxVal * i / nTicks);
        const y = H - pad.b - (val / maxVal) * plotH;
        ctx.fillText(val.toString(), pad.l - 10, y + 5);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(W - pad.r, y);
        ctx.stroke();
    }

    // Cumulative growth bars
    for (let i = 0; i <= currentMaxLen; i++) {
        const x = pad.l + (i / currentMaxLen) * plotW;
        const barW = plotW / (currentMaxLen + 1) * 0.7;
        const barH = (cumulative[i] / maxVal) * plotH;
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(x - barW/2, H - pad.b - barH, barW, barH);
    }

    // Sphere counts as line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= currentMaxLen; i++) {
        const x = pad.l + (i / currentMaxLen) * plotW;
        const y = H - pad.b - (counts[i] / maxVal) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legend
    ctx.font = `${Math.round(H/20)}px Inter, sans-serif`;
    ctx.fillStyle = '#6366f1';
    ctx.textAlign = 'left';
    ctx.fillText('|Ball(n)|', pad.l + 10, pad.t + 25);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('|Sphere(n)|', pad.l + 10, pad.t + 50);

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('word length n', W/2, H - 2);
}

// ===== Word Evaluator =====
function parseWord(str) {
    // Parse strings like "a b t^-1 a^2 b^-3"
    const tokens = str.trim().split(/\s+/);
    const word = [];
    for (const tok of tokens) {
        if (!tok) continue;
        const match = tok.match(/^([abt])\^?\{?(-?\d+)\}?$/);
        const matchSimple = tok.match(/^([abt])$/);
        const matchInv = tok.match(/^([abt])\^-1$/) || tok.match(/^([abt])⁻¹$/);
        let gen, exp;
        if (match) {
            gen = match[1]; exp = parseInt(match[2]);
        } else if (matchSimple) {
            gen = matchSimple[1]; exp = 1;
        } else if (matchInv) {
            gen = matchInv[1]; exp = -1;
        } else {
            return null; // parse error
        }
        const idx = gen === 'a' ? 1 : gen === 'b' ? 2 : 3;
        for (let i = 0; i < Math.abs(exp); i++) {
            word.push(exp > 0 ? idx : -idx);
        }
    }
    return word;
}

function updateWordResult() {
    const input = document.getElementById('word-input');
    const resultEl = document.getElementById('word-result');
    if (!input || !resultEl) return;

    const str = input.value.trim();
    if (!str) {
        resultEl.innerHTML = '<span class="dim">Enter a word to evaluate</span>';
        return;
    }
    const word = parseWord(str);
    if (!word) {
        resultEl.innerHTML = '<span class="error-text">Parse error. Use: a b t a^-1 b^2 t^-1</span>';
        return;
    }
    const reduced = reduceWord(word);
    const M = evalWord(reduced);
    const isId = M.isIdentity();
    const latex = wordToLatex(reduced);

    const matrixRows = M.e.map(row =>
        row.map(x => `<td>${fmtEntryPlain(x)}</td>`).join('')
    ).map(r => `<tr>${r}</tr>`).join('');

    resultEl.innerHTML = `
        <div class="word-latex">\\(${latex}\\)</div>
        <table class="matrix-display">${matrixRows}</table>
        <div class="word-info">
            det = ${fmtEntryPlain(M.det())} &nbsp;|&nbsp;
            tr = ${fmtEntryPlain(M.trace())} &nbsp;|&nbsp;
            ρ = ${M.spectralRadius().toFixed(4)}
        </div>
        <div class="identity-check ${isId ? 'is-identity' : 'not-identity'}">
            ${isId ? '= I (identity!)' : '≠ I'}
        </div>
    `;
    if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([resultEl]);
    }
}

// ===== Ping-Pong Animation =====
let pingPongRunning = false;
let pingPongPoint = null;
let pingPongTrail = [];
let pingPongMesh = null;
let trailGroup = new THREE.Group();
scene.add(trailGroup);

function startPingPong() {
    if (pingPongRunning) { stopPingPong(); return; }
    pingPongRunning = true;
    pingPongPoint = normalize([0.5, 0.7, 0.5]);
    pingPongTrail = [pingPongPoint];
    trailGroup.clear();

    const btn = document.getElementById('pingpong-btn');
    if (btn) { btn.textContent = 'Stop'; btn.classList.add('active'); }

    // Create point mesh
    const geo = new THREE.SphereGeometry(0.04, 12, 12);
    pingPongMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pingPongMesh.position.set(...pingPongPoint);
    trailGroup.add(pingPongMesh);

    // Sequence: alternately apply random diagonal element and t^±1
    const seq = buildPingPongSequence(20);
    animatePingPongStep(seq, 0);
}

function stopPingPong() {
    pingPongRunning = false;
    const btn = document.getElementById('pingpong-btn');
    if (btn) { btn.textContent = 'Ping-Pong'; btn.classList.remove('active'); }
}

function buildPingPongSequence(len) {
    const seq = [];
    for (let i = 0; i < len; i++) {
        if (i % 2 === 0) {
            // Random non-identity element of <a,b>
            let j, k;
            do { j = Math.floor(Math.random()*5)-2; k = Math.floor(Math.random()*5)-2; }
            while (j === 0 && k === 0);
            const word = [];
            for (let x = 0; x < Math.abs(j); x++) word.push(j > 0 ? 1 : -1);
            for (let x = 0; x < Math.abs(k); x++) word.push(k > 0 ? 2 : -2);
            seq.push({ word, label: `a^{${j}}b^{${k}}`, isDiag: true });
        } else {
            const n = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random()*2)+1);
            const word = [];
            for (let x = 0; x < Math.abs(n); x++) word.push(n > 0 ? 3 : -3);
            seq.push({ word, label: n > 0 ? `t^{${n}}` : `t^{${n}}`, isDiag: false });
        }
    }
    return seq;
}

function animatePingPongStep(seq, idx) {
    if (!pingPongRunning || idx >= seq.length) { stopPingPong(); return; }

    const { word, isDiag } = seq[idx];
    const M = evalWord(word);
    const startPt = [...pingPongPoint];
    const endPt = normalize(M.apply(pingPongPoint));
    const duration = 600;
    const startTime = performance.now();

    function step(now) {
        if (!pingPongRunning) return;
        const t = Math.min((now - startTime) / duration, 1);
        const eased = t * t * (3 - 2 * t);

        // Interpolate on sphere (slerp-like)
        const mid = normalize([
            startPt[0] * (1-eased) + endPt[0] * eased,
            startPt[1] * (1-eased) + endPt[1] * eased,
            startPt[2] * (1-eased) + endPt[2] * eased,
        ]);
        pingPongMesh.position.set(...mid);
        pingPongMesh.material.color.set(isDiag ? 0x38bdf8 : 0xfbbf24);

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            pingPongPoint = endPt;
            // Add trail marker
            const geo = new THREE.SphereGeometry(0.015, 6, 6);
            const marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                color: isDiag ? 0x38bdf8 : 0xfbbf24,
                transparent: true, opacity: 0.6
            }));
            marker.position.set(...endPt);
            trailGroup.add(marker);
            // Draw trail line
            if (pingPongTrail.length > 0) {
                const prev = pingPongTrail[pingPongTrail.length - 1];
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(...prev), new THREE.Vector3(...endPt)
                ]);
                trailGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
                    color: isDiag ? 0x38bdf8 : 0xfbbf24,
                    transparent: true, opacity: 0.3
                })));
            }
            pingPongTrail.push(endPt);
            setTimeout(() => animatePingPongStep(seq, idx + 1), 200);
        }
    }
    requestAnimationFrame(step);
}


// ===== UI Setup =====
function initUI() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
            // Re-render growth chart when Evidence tab becomes visible
            if (btn.dataset.tab === 'evidence') {
                requestAnimationFrame(() => updateGrowthChart());
            }
        });
    });

    // Collapse
    document.getElementById('collapse-btn')?.addEventListener('click', () => {
        document.getElementById('control-panel')?.classList.toggle('collapsed');
    });

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            sphereWire.visible = currentMode === 'sphere';
            sphereSolid.visible = currentMode === 'sphere';
            axisGroup.visible = currentMode === 'sphere';
            rebuildOrbit();
        });
    });

    // Word length
    document.getElementById('wordLength')?.addEventListener('change', (e) => {
        currentMaxLen = Math.max(1, Math.min(8, parseInt(e.target.value) || 4));
        rebuildOrbit();
    });

    // Word evaluator
    document.getElementById('word-input')?.addEventListener('input', updateWordResult);
    document.getElementById('eval-btn')?.addEventListener('click', updateWordResult);

    // Ping pong
    document.getElementById('pingpong-btn')?.addEventListener('click', startPingPong);

    // Auto-rotate toggle
    document.getElementById('auto-rotate')?.addEventListener('click', (e) => {
        controls.autoRotate = !controls.autoRotate;
        e.target.classList.toggle('active', controls.autoRotate);
    });

    // Populate generator display
    populateGeneratorDisplay();
}

function populateGeneratorDisplay() {
    const el = document.getElementById('gen-display');
    if (!el) return;
    el.innerHTML = `
        <div class="gen-item">
            <span class="gen-name" style="color:#38bdf8">a</span>
            <span class="gen-matrix">\\(${genA.toLatex()}\\)</span>
        </div>
        <div class="gen-item">
            <span class="gen-name" style="color:#f472b6">b</span>
            <span class="gen-matrix">\\(${genB.toLatex()}\\)</span>
        </div>
        <div class="gen-item">
            <span class="gen-name" style="color:#fbbf24">t</span>
            <span class="gen-matrix">\\(${genT.toLatex()}\\)</span>
        </div>
    `;
    if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([el]);
    }
}

// ===== Animation Loop =====
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

// Stop auto-rotate on interaction
controls.addEventListener('start', () => {
    controls.autoRotate = false;
    document.getElementById('auto-rotate')?.classList.remove('active');
});

// ===== Init =====
initUI();
setTimeout(() => rebuildOrbit(), 100);
animate();
