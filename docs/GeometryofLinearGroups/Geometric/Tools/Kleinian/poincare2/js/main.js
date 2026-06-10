import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    Matrix2x2, formatWordMathJax, reduceWord, invertWord,
    getCayleyGraph, wallSD, covToGeom
} from './math.js';
import { computeCanonicalDomain } from './canonical.js';
import { certifyDomain } from './certifier.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { setupMatrixInput, getMatricesFromUI } from './matrixInput.js';
import { setupControlPanel, updateToggleBtn, colorPalettes, getPaletteSettings } from './controlPanel.js';
import { mirrorFragmentShader, mirrorDefaults } from './mirror.js';
import { exportDomainAs3MF } from './export3mf.js';

// --- Three.js setup ---
const container = document.getElementById('viz-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.5, 1.5, 2.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;
controls.addEventListener('start', () => {
    controls.autoRotate = false;
    updateToggleBtn(document.getElementById('auto-rotate'), false);
});

const geometry = new THREE.BoxGeometry(2.5, 2.5, 2.5);
let currentMaxFaces = 96;
let currentDepth = 8;
let viewMatrix = Matrix2x2.identity();
let animatingIsometry = false;

let currentMatrices = [];
let currentGenerators = [];   // interleaved [g, g^-1, ...]

const initialDomain = computeCanonicalDomain([], viewMatrix, currentMaxFaces);
const initialPalette = getPaletteSettings();

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_cameraPos: { value: new THREE.Vector3() },
        u_faces: { value: initialDomain.facesBuffer },
        u_faceCount: { value: initialDomain.count },
        u_time: { value: 0 },
        u_opacity: { value: 1.0 },
        u_colorMode: { value: initialPalette.mode },
        u_colorOffset: { value: initialPalette.offset.clone() },
        u_colorFreq: { value: initialPalette.freq },
        u_showTiling: { value: false },
        u_maxBounces: { value: mirrorDefaults.maxBounces },
        u_edgeLightWidth: { value: mirrorDefaults.edgeLightWidth },
        u_lightIntensity: { value: mirrorDefaults.lightIntensity }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.BackSide
});

const mesh = new THREE.Mesh(geometry, material);
mesh.renderOrder = -1;
scene.add(mesh);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

const cayleyGroup = new THREE.Group();
cayleyGroup.visible = false;
scene.add(cayleyGroup);
let cayleyMode = 'off';

const wallsGroup = new THREE.Group();
wallsGroup.visible = false;
scene.add(wallsGroup);
let wallsOpacity = 0;
let showTiedye = false;
let mirrorMode = false;

function setMirrorMode(enabled) {
    mirrorMode = enabled;
    material.fragmentShader = mirrorMode ? mirrorFragmentShader : fragmentShader;
    material.needsUpdate = true;
    updateToggleBtn(document.getElementById('toggle-mirror'), mirrorMode);
}

const generatorColors = [
    0x38bdf8, 0xf472b6, 0xfbbf24, 0x22c55e,
    0xa78bfa, 0xfb7185, 0x34d399, 0xf97316
];

// --- Domain state ---
let cachedDomain = null;
let stdGenerators = [];       // [{matrix, word, kind, isParabolic, wallIndex}]
let cumulativeWord = [];
let certToken = 0;            // staleness token for deferred certification

function updateDomain(opts = {}) {
    cachedDomain = computeCanonicalDomain(currentGenerators, viewMatrix, currentMaxFaces, {
        maxDepth: currentDepth,
        skipPairings: opts.fast === true
    });
    material.uniforms.u_faces.value = cachedDomain.facesBuffer;
    material.uniforms.u_faceCount.value = cachedDomain.count;
    window.__domain = cachedDomain;   // debug handle
    return cachedDomain;
}

// --- Status banner + certificate ---
function setBanner(state, text) {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    banner.className = 'status-banner ' + state;   // 'verified' | 'warning' | 'failed' | 'pending'
    banner.innerHTML = '';
    if (text) {
        const span = document.createElement('span');
        span.className = 'status-banner-text';
        span.textContent = text;
        banner.appendChild(span);
        const close = document.createElement('button');
        close.className = 'status-banner-close';
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = '\u00d7';
        close.addEventListener('click', () => { banner.style.display = 'none'; });
        banner.appendChild(close);
    }
    banner.style.display = text ? 'flex' : 'none';
}

function setCertLog(lines) {
    const el = document.getElementById('cert-log');
    if (!el) return;
    el.textContent = lines.join('\n');
}

function runCertifier() {
    if (!cachedDomain || cachedDomain.count === 0) {
        setBanner('warning', currentGenerators.length ? 'No domain faces found.' : '');
        return;
    }
    const token = ++certToken;
    setBanner('pending', 'Verifying domain (Poincaré conditions)…');
    // Defer so the UI paints first
    setTimeout(() => {
        if (token !== certToken) return;
        try {
            const report = certifyDomain(cachedDomain.walls, cachedDomain.basepoint);
            if (token !== certToken) return;
            setCertLog(report.log);
            if (report.status === 'verified') {
                setBanner('verified', `✓ Discrete: all Poincaré conditions verified numerically (${cachedDomain.count} faces).`);
            } else if (report.status === 'incomplete') {
                setBanner('warning', `✓ All resolvable Poincaré conditions pass (${cachedDomain.count} faces) — see certificate for caveats (cusps / near-degenerate edges).`);
            } else {
                setBanner('failed', '✗ Discreteness NOT verified — see certificate log. Try a larger word length, or the group may be non-discrete.');
            }
            if (cachedDomain.stabilizer.capped) {
                setBanner('failed', '✗ Basepoint stabilizer did not close into a finite group — the group is likely NOT discrete.');
            }
        } catch (e) {
            console.error('Certifier error:', e);
            setBanner('warning', 'Certifier error: ' + e.message);
        }
    }, 30);
}

// --- Standard generators UI ---
function updateStdGeneratorsList() {
    const container = document.getElementById('std-generators-list');
    const stabInfo = document.getElementById('stabilizer-info');
    if (!container || !cachedDomain) return;

    // The standard geometric generators are the face-pairing transformations.
    // Keep one per {s, s^-1} pair.
    stdGenerators = [];
    const taken = new Set();
    cachedDomain.walls.forEach((w, i) => {
        if (taken.has(i)) return;
        const pairing = w.pairing;
        if (!pairing) {
            stdGenerators.push({ matrix: w.elem, word: w.word, kind: w.kind, isParabolic: w.isParabolic, wallIndex: i, unpaired: true });
            return;
        }
        taken.add(i);
        if (pairing.partner >= 0) taken.add(pairing.partner);
        stdGenerators.push({
            // pairing.alg is the pure word s = g^{-1} in the basepoint frame;
            // list the generator g whose wall is Bis(q, g·q).
            matrix: pairing.alg.inv().normalized(),
            sMatrix: pairing.alg,
            word: invertWord(pairing.word),
            kind: w.kind,
            isParabolic: w.isParabolic,
            wallIndex: i,
            partnerIndex: pairing.partner
        });
    });

    stdGenerators.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'cone' ? -1 : 1;
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        for (let i = 0; i < a.word.length; i++) {
            if (a.word[i] !== b.word[i]) return a.word[i] - b.word[i];
        }
        return 0;
    });

    // Stabilizer summary
    if (stabInfo) {
        const H = cachedDomain.stabilizer;
        if (H.order <= 1) {
            stabInfo.innerHTML = '<span class="stab-trivial">Basepoint stabilizer: trivial</span>';
        } else {
            const capNote = H.capped ? ' <strong class="stab-warning">(did not close — likely non-discrete!)</strong>' : '';
            stabInfo.innerHTML = `Basepoint stabilizer: order <strong>${H.order}</strong>${capNote}` +
                `<br><span class="stab-note">Domain = Dirichlet domain ∩ fundamental cone for the stabilizer.</span>`;
        }
    }

    container.innerHTML = '';
    if (stdGenerators.length === 0) {
        container.innerHTML = '<p class="empty-message">No faces — click Refresh to compute.</p>';
        return;
    }

    stdGenerators.forEach((gen, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item'
            + (gen.kind === 'cone' ? ' stabilizer' : '')
            + (gen.isParabolic ? ' parabolic' : '')
            + (gen.unpaired ? ' unpaired' : '');

        const wordSpan = document.createElement('span');
        wordSpan.className = 'std-gen-word';
        wordSpan.innerHTML = `\\(${formatWordMathJax(gen.word)}\\)`;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'std-gen-type';
        typeSpan.textContent = gen.unpaired ? 'unpaired!'
            : (gen.kind === 'cone' ? 'rotation' : (gen.isParabolic ? 'cusp' : 'face'));

        item.appendChild(wordSpan);
        item.appendChild(typeSpan);
        item.addEventListener('click', (e) => animateStdGenerator(idx, e));
        container.appendChild(item);
    });

    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]);
    }
    updateCurrentElementDisplay();
}

function updateCurrentElementDisplay() {
    const display = document.getElementById('current-element-display');
    if (!display) return;
    display.innerHTML = `\\(${formatWordMathJax(reduceWord(cumulativeWord))}\\)`;
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([display]);
    }
}

// --- Cayley graph ---
function getHyperbolicGeodesic(p1, p2, segments = 16) {
    const cross = new THREE.Vector3().crossVectors(p1, p2);
    if (cross.length() < 1e-6) return [p1, p2];

    const v1 = p1.clone(), v2 = p2.clone(), v3 = cross;
    const d1 = (p1.lengthSq() + 1) / 2;
    const d2 = (p2.lengthSq() + 1) / 2;
    const d3 = 0;
    const detM = (v1.x * (v2.y * v3.z - v2.z * v3.y) -
        v1.y * (v2.x * v3.z - v2.z * v3.x) +
        v1.z * (v2.x * v3.y - v2.y * v3.x));
    if (Math.abs(detM) < 1e-9) return [p1, p2];

    const center = new THREE.Vector3(
        (d1 * (v2.y * v3.z - v2.z * v3.y) - v1.y * (d2 * v3.z - v2.z * d3) + v1.z * (d2 * v3.y - v2.y * d3)) / detM,
        (v1.x * (d2 * v3.z - v2.z * d3) - d1 * (v2.x * v3.z - v2.z * v3.x) + v1.z * (v2.x * d3 - d2 * v3.x)) / detM,
        (v1.x * (v2.y * d3 - d2 * v3.y) - v1.y * (v2.x * d3 - d2 * v3.x) + d1 * (v2.x * v3.y - v2.y * v3.x)) / detM
    );
    const radius = Math.sqrt(Math.max(0, center.lengthSq() - 1));
    const r1 = p1.clone().sub(center);
    const r2 = p2.clone().sub(center);
    const arcPoints = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        arcPoints.push(new THREE.Vector3().lerpVectors(r1, r2, t).normalize().multiplyScalar(radius).add(center));
    }
    return arcPoints;
}

function buildTGenerators() {
    const tGens = [];
    const seen = new Set();
    for (const gen of stdGenerators) {
        if (gen.unpaired) continue;
        const wordKey = gen.word.join(',');
        const invKey = invertWord(gen.word).join(',');
        if (seen.has(wordKey) || seen.has(invKey)) continue;
        seen.add(wordKey);
        tGens.push(gen);
    }
    const generators = [];
    for (const g of tGens) {
        generators.push(g.matrix);
        generators.push(g.matrix.inv().normalized());
    }
    return { generators, numTypes: tGens.length };
}

function updateCayley() {
    cayleyGroup.clear();
    if (cayleyMode === 'off') return;

    let generators, numTypes;
    let depth = currentDepth;
    if (cayleyMode === 'T') {
        if (stdGenerators.length === 0) return;
        const t = buildTGenerators();
        generators = t.generators;
        numTypes = t.numTypes;
        if (numTypes > 20) depth = Math.min(depth, 2);
        else if (numTypes > 10) depth = Math.min(depth, 3);
        else if (numTypes > 5) depth = Math.min(depth, 4);
    } else {
        if (currentGenerators.length === 0) return;
        generators = currentGenerators;
        numTypes = currentMatrices.length;
    }
    if (generators.length === 0) return;

    const { points, edges } = getCayleyGraph(generators, depth, viewMatrix, 15000);

    const ptGeom = new THREE.SphereGeometry(0.015, 8, 8);
    const ptMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const seenPositions = new Set();
    points.forEach(p => {
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
        if (seenPositions.has(key)) return;
        seenPositions.add(key);
        const pt = new THREE.Mesh(ptGeom, ptMat);
        pt.position.copy(p);
        pt.scale.setScalar(Math.max(0.1, (1 - p.length()) * 1.5));
        pt.renderOrder = 1;
        cayleyGroup.add(pt);
    });

    for (let type = 0; type < numTypes; type++) {
        const typeEdges = edges.filter(e => e.type === type);
        if (typeEdges.length === 0) continue;
        const edgePoints = [];
        for (const { u, v } of typeEdges) {
            if (points[u].distanceTo(points[v]) < 1e-5) continue;
            const geo = getHyperbolicGeodesic(points[u], points[v]);
            for (let i = 0; i < geo.length - 1; i++) edgePoints.push(geo[i], geo[i + 1]);
        }
        if (edgePoints.length === 0) continue;
        const lineGeom = new THREE.BufferGeometry().setFromPoints(edgePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: generatorColors[type % generatorColors.length],
            transparent: true, opacity: 0.8, depthWrite: false
        });
        const lines = new THREE.LineSegments(lineGeom, lineMat);
        lines.renderOrder = 1;
        cayleyGroup.add(lines);
    }
}

// --- Walls (translucent meshes of accepted domain walls) ---
function createWallMesh(wall, color) {
    const geom = wall.geom;
    let mesh = null;

    if (geom.type === 'plane') {
        // Disk: plane through origin ∩ unit ball = unit disk
        const g = new THREE.CircleGeometry(1, 64);
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: wallsOpacity * 0.4,
            side: THREE.DoubleSide, depthWrite: false
        });
        mesh = new THREE.Mesh(g, mat);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), geom.n);
    } else {
        const { c: center, r: radius } = geom;
        const centerDist = center.length();
        if (centerDist < 0.001 || radius > 100) return null;
        const cosTheta = Math.min(1, radius / centerDist);
        const thetaMax = Math.acos(Math.min(1, Math.max(-1, cosTheta)));

        const segments = 32, rings = 16;
        const g = new THREE.BufferGeometry();
        const vertices = [], indices = [];
        for (let i = 0; i <= rings; i++) {
            const phi = (i / rings) * thetaMax;
            const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
            for (let j = 0; j <= segments; j++) {
                const th = (j / segments) * Math.PI * 2;
                vertices.push(sinPhi * Math.cos(th) * radius, sinPhi * Math.sin(th) * radius, cosPhi * radius);
            }
        }
        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < segments; j++) {
                const a = i * (segments + 1) + j;
                const b = a + segments + 1;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: wallsOpacity * 0.4,
            side: THREE.DoubleSide, depthWrite: false
        });
        mesh = new THREE.Mesh(g, mat);
        mesh.position.copy(center);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), center.clone().negate().normalize());
    }
    return mesh;
}

function updateWalls() {
    wallsGroup.clear();
    if (!cachedDomain) return;
    cachedDomain.walls.forEach((w, i) => {
        const color = w.kind === 'cone' ? 0xffffff : generatorColors[i % generatorColors.length];
        const m = createWallMesh(w, color);
        if (m) wallsGroup.add(m);
    });
}

// --- Isometry animation ---
function animateMatrix(g, wordToAppend, onDone) {
    try {
        const X = g.log();
        const startView = viewMatrix;
        const duration = 1000;
        const startTime = performance.now();
        animatingIsometry = true;

        function step(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = t * t * (3 - 2 * t);
            const tX = new Matrix2x2(X.a.mul(eased), X.b.mul(eased), X.c.mul(eased), X.d.mul(eased));
            viewMatrix = startView.mul(Matrix2x2.exp(tX));

            updateDomain({ fast: true });
            if (cayleyMode !== 'off') updateCayley();
            if (wallsOpacity > 0) updateWalls();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingIsometry = false;
                cumulativeWord = reduceWord([...cumulativeWord, ...wordToAppend]);
                updateDomain();          // full recompute with pairings
                updateStdGeneratorsList();
                if (wallsOpacity > 0) updateWalls();
                runCertifier();
                if (onDone) onDone();
            }
        }
        requestAnimationFrame(step);
    } catch (e) {
        console.error('Animation error:', e);
        animatingIsometry = false;
    }
}

function animateStdGenerator(idx, event) {
    if (animatingIsometry || idx >= stdGenerators.length) return;
    const gen = stdGenerators[idx];
    let g = gen.matrix;
    let word = [...gen.word];
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv().normalized();
        word = invertWord(gen.word);
    }
    animateMatrix(g, word);
}

function animateIsometry(genIndex, event) {
    if (animatingIsometry || genIndex >= currentMatrices.length) return;
    let g = currentMatrices[genIndex];
    let word = [genIndex + 1];
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv().normalized();
        word = [-(genIndex + 1)];
    }
    animateMatrix(g, word);
}

// --- Face picking (double-click) ---
function mapSDF(p) {
    const walls = cachedDomain ? cachedDomain.walls : [];
    let d = p.length() - 1.0;
    let bestId = -1;
    for (let i = 0; i < walls.length; i++) {
        const df = wallSD(p, walls[i].geom);
        if (df > d) { d = df; bestId = i; }
    }
    return { d, bestId };
}

function findClickedWall(ray) {
    if (!cachedDomain || cachedDomain.count === 0) return -1;
    const EPSILON = 0.002, MAX_DIST = 10;
    let t = 0.01;
    for (let iter = 0; iter < 200; iter++) {
        const p = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
        if (p.length() > 2.0) {
            t += 0.05;
            if (t > MAX_DIST) return -1;
            continue;
        }
        const { d, bestId } = mapSDF(p);
        if (Math.abs(d) < EPSILON && bestId >= 0) return bestId;
        t += Math.max(EPSILON, Math.abs(d) * 0.9);
        if (t > MAX_DIST) return -1;
    }
    return -1;
}

function handleDoubleClick(event) {
    if (animatingIsometry || !cachedDomain) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const wallIdx = findClickedWall(raycaster.ray);
    if (wallIdx < 0) return;
    const wall = cachedDomain.walls[wallIdx];
    if (!wall.pairing) return;
    // Apply the pairing transformation: moves this face onto its partner.
    animateMatrix(wall.pairing.alg, wall.pairing.word);
}
renderer.domElement.addEventListener('dblclick', handleDoubleClick);

// --- UI plumbing ---
function updateIsometryButtons() {
    const c = document.getElementById('isometry-controls');
    if (!c) return;
    c.innerHTML = '';
    currentMatrices.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.textContent = `g${idx + 1}`;
        btn.addEventListener('click', (e) => animateIsometry(idx, e));
        c.appendChild(btn);
    });
}

function refreshFromUI() {
    const errorEl = document.getElementById('matrix-error-message');
    try {
        currentMatrices = getMatricesFromUI();
        currentGenerators = [];
        for (const m of currentMatrices) {
            currentGenerators.push(m);
            currentGenerators.push(m.inv().normalized());
        }
        const wordLengthInput = document.getElementById('wordLength');
        if (wordLengthInput) currentDepth = parseInt(wordLengthInput.value) || 8;

        if (errorEl) errorEl.textContent = '';
        viewMatrix = Matrix2x2.identity();
        cumulativeWord = [];

        updateDomain();
        updateIsometryButtons();
        updateStdGeneratorsList();
        if (cayleyMode !== 'off') updateCayley();
        if (wallsOpacity > 0) updateWalls();
        runCertifier();
    } catch (e) {
        if (errorEl) errorEl.textContent = e.message;
        console.error('Error parsing matrices:', e);
    }
}

function initUI() {
    setupControlPanel({
        onOpacityChange: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onPolyhedronOpacity: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onWallsOpacity: (o) => {
            wallsOpacity = o;
            wallsGroup.visible = o > 0;
            wallsGroup.children.forEach(ch => { if (ch.material) ch.material.opacity = o * 0.4; });
            if (o > 0 && wallsGroup.children.length === 0) updateWalls();
        },
        onCayleyModeChange: (mode) => {
            cayleyMode = mode;
            cayleyGroup.visible = mode !== 'off';
            if (mode !== 'off') updateCayley();
        },
        onTiedyeToggle: (btn) => {
            showTiedye = !showTiedye;
            material.uniforms.u_showTiling.value = showTiedye;
            updateToggleBtn(btn, showTiedye);
        },
        onAutoRotateToggle: (btn) => {
            controls.autoRotate = !controls.autoRotate;
            updateToggleBtn(btn, controls.autoRotate);
        },
        onResetCamera: (autoRotateBtn) => {
            camera.position.set(2.5, 1.5, 2.5);
            camera.lookAt(0, 0, 0);
            controls.target.set(0, 0, 0);
            controls.autoRotate = false;
            updateToggleBtn(autoRotateBtn, false);
        },
        onFaceCountChange: (count) => {
            currentMaxFaces = count;
            updateDomain();
            updateStdGeneratorsList();
            runCertifier();
        },
        onWordLengthChange: (depth) => {
            currentDepth = depth;
            updateDomain();
            updateStdGeneratorsList();
            if (cayleyMode !== 'off') updateCayley();
            if (wallsOpacity > 0) updateWalls();
            runCertifier();
        },
        onPaletteChange: (paletteKey) => {
            const p = colorPalettes[paletteKey];
            material.uniforms.u_colorMode.value = p.mode;
            material.uniforms.u_colorOffset.value.copy(p.offset);
            material.uniforms.u_colorFreq.value = p.freq;
        },
        controls, mesh, cayleyGroup, material
    });

    const mirrorBtn = document.getElementById('toggle-mirror');
    if (mirrorBtn) {
        mirrorBtn.addEventListener('click', () => setMirrorMode(!mirrorMode));
    }

    const exportBtn = document.getElementById('export-3mf');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (exportBtn.disabled) return;
            const label = exportBtn.textContent;
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting…';
            try {
                // Yield a frame so the button repaints before the mesh build
                await new Promise(r => setTimeout(r, 30));
                const { vertices, triangles } = await exportDomainAs3MF(cachedDomain);
                console.log(`3MF export: ${vertices} vertices, ${triangles} triangles`);
            } catch (e) {
                console.error('3MF export failed:', e);
                setBanner('warning', '3MF export failed: ' + e.message);
            } finally {
                exportBtn.disabled = false;
                exportBtn.textContent = label;
            }
        });
    }
}

function animate(time) {
    requestAnimationFrame(animate);
    controls.update();
    material.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_time.value = time * 0.001;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

initUI();
setupMatrixInput(refreshFromUI);
setTimeout(refreshFromUI, 200);
animate(0);
