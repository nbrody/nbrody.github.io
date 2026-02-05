import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getDirichletFaces, getCayleyGraph, getStdGenerators, Matrix2x2 } from './math.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { setupMatrixInput, getGeneratorsFromUI, getMatricesFromUI } from './matrixInput.js';
import { setupControlPanel, updateToggleBtn, colorPalettes, getPaletteSettings } from './controlPanel.js';

// --- Three.js Setup ---
const container = document.getElementById('viz-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.5, 1.5, 2.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

// Stop auto-rotate on interaction
controls.addEventListener('start', () => {
    controls.autoRotate = false;
    updateToggleBtn(document.getElementById('auto-rotate'), false);
});

// Raymarching Proxy Geometry
const geometry = new THREE.BoxGeometry(2.5, 2.5, 2.5);
let currentMaxFaces = 64;
let currentDepth = 6;
let viewMatrix = new Matrix2x2(1, 0, 0, 1);
let animatingIsometry = false;

// Store current generators (will be updated from UI)
let currentGenerators = [];
let currentMatrices = [];

const { faces: facesArr, count: actualCount } = getDirichletFaces([], viewMatrix, currentMaxFaces);

// Initial palette settings
const initialPalette = getPaletteSettings();

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_cameraPos: { value: new THREE.Vector3() },
        u_faces: { value: facesArr },
        u_faceCount: { value: actualCount },
        u_time: { value: 0 },
        u_opacity: { value: 1.0 },
        u_colorMode: { value: initialPalette.mode },
        u_colorOffset: { value: initialPalette.offset.clone() },
        u_colorFreq: { value: initialPalette.freq }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.BackSide
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// Cayley Graph Objects
const cayleyGroup = new THREE.Group();
cayleyGroup.visible = false;
scene.add(cayleyGroup);
let showCayley = false;
let showPolyhedron = true;

// Generator colors for Cayley graph edges
const generatorColors = [
    0x38bdf8, // Light Blue
    0xf472b6, // Pink
    0xfbbf24, // Amber
    0x22c55e, // Green
    0xa78bfa, // Purple
    0xfb7185, // Rose
    0x34d399, // Emerald
    0xf97316  // Orange
];

function getHyperbolicGeodesic(p1, p2, segments = 16) {
    const cross = new THREE.Vector3().crossVectors(p1, p2);
    if (cross.length() < 1e-6) {
        return [p1, p2];
    }

    const v1 = p1.clone();
    const v2 = p2.clone();
    const v3 = new THREE.Vector3().crossVectors(p1, p2);

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
        const p = new THREE.Vector3().lerpVectors(r1, r2, t).normalize().multiplyScalar(radius).add(center);
        arcPoints.push(p);
    }
    return arcPoints;
}

function updateCayley() {
    cayleyGroup.clear();
    if (currentGenerators.length === 0) return;

    const { points, edges } = getCayleyGraph(currentGenerators, currentDepth, viewMatrix);

    // Vertices - deduplicate by position for visualization
    const ptGeom = new THREE.SphereGeometry(0.015, 8, 8);
    const ptMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: true,
        depthWrite: false
    });
    const seenPositions = new Set();

    points.forEach(p => {
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
        if (!seenPositions.has(key)) {
            seenPositions.add(key);
            const pt = new THREE.Mesh(ptGeom, ptMat);
            pt.position.copy(p);
            const distToBoundary = 1.0 - p.length();
            pt.scale.setScalar(Math.max(0.1, distToBoundary * 1.5));
            cayleyGroup.add(pt);
        }
    });

    // Determine number of generator types (half the generators since we have inverses)
    const numMatrices = currentMatrices.length;

    // Create a separate LineSegments object for each type
    for (let type = 0; type < numMatrices; type++) {
        const typeEdges = edges.filter(e => e.type === type);
        if (typeEdges.length === 0) continue;

        const edgePoints = [];
        for (const { u, v } of typeEdges) {
            // Skip degenerate edges (both endpoints at same position - from stabilizers)
            const dist = points[u].distanceTo(points[v]);
            if (dist < 1e-5) continue;

            const geodesic = getHyperbolicGeodesic(points[u], points[v]);
            for (let i = 0; i < geodesic.length - 1; i++) {
                edgePoints.push(geodesic[i], geodesic[i + 1]);
            }
        }

        if (edgePoints.length === 0) continue;

        const lineGeom = new THREE.BufferGeometry().setFromPoints(edgePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: generatorColors[type % generatorColors.length],
            transparent: true,
            opacity: 0.8,
            depthTest: true,
            depthWrite: false  // Don't write to depth but do read it
        });
        const lines = new THREE.LineSegments(lineGeom, lineMat);
        cayleyGroup.add(lines);
    }
}


function updateIsometryButtons() {
    const container = document.getElementById('isometry-controls');
    if (!container) return;
    container.innerHTML = '';

    currentMatrices.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.setAttribute('data-gen', idx);
        btn.textContent = `g${idx + 1}`;
        btn.addEventListener('click', (e) => animateIsometry(idx, e));
        container.appendChild(btn);
    });
}


function updateDomain() {
    const { faces, count } = getDirichletFaces(currentGenerators, viewMatrix, currentMaxFaces);
    material.uniforms.u_faces.value = faces;
    material.uniforms.u_faceCount.value = count;
}

// Store standard generators for animation
let stdGenerators = [];

function updateStdGeneratorsList() {
    const container = document.getElementById('std-generators-list');
    if (!container) return;

    stdGenerators = getStdGenerators(currentGenerators, viewMatrix, currentMaxFaces);
    container.innerHTML = '';

    if (stdGenerators.length === 0) {
        container.innerHTML = '<p class="empty-message">No standard generators found</p>';
        return;
    }

    stdGenerators.forEach((gen, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item' + (gen.isStabilizer ? ' stabilizer' : '');

        const wordSpan = document.createElement('span');
        wordSpan.className = 'std-gen-word';
        wordSpan.textContent = gen.word;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'std-gen-type';
        typeSpan.textContent = gen.isStabilizer ? 'stabilizer' : 'face pairing';

        item.appendChild(wordSpan);
        item.appendChild(typeSpan);

        // Click to animate this isometry
        item.addEventListener('click', (e) => {
            animateStdGenerator(idx, e);
        });

        container.appendChild(item);
    });
}

function animateStdGenerator(idx, event) {
    if (animatingIsometry || idx >= stdGenerators.length) return;

    let g = stdGenerators[idx].matrix;

    // Use inverse if Cmd/Ctrl is held
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv();
    }

    try {
        const X = g.log();
        const startView = viewMatrix;
        const duration = 1000;
        const startTime = performance.now();
        animatingIsometry = true;

        function step(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = t * t * (3 - 2 * t);

            const tX = new Matrix2x2(
                X.a.mul(eased), X.b.mul(eased),
                X.c.mul(eased), X.d.mul(eased)
            );
            const gt = Matrix2x2.exp(tX);
            viewMatrix = startView.mul(gt);

            updateDomain();
            if (showCayley) updateCayley();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingIsometry = false;
            }
        }
        requestAnimationFrame(step);
    } catch (e) {
        console.error('Animation error:', e);
        animatingIsometry = false;
    }
}

function refreshFromUI() {
    const errorEl = document.getElementById('matrix-error-message');
    try {
        currentMatrices = getMatricesFromUI();
        currentGenerators = getGeneratorsFromUI();

        // Update word length from input
        const wordLengthInput = document.getElementById('wordLength');
        if (wordLengthInput) {
            currentDepth = parseInt(wordLengthInput.value) || 6;
        }

        if (errorEl) errorEl.textContent = '';

        // Reset view matrix when generators change
        viewMatrix = new Matrix2x2(1, 0, 0, 1);

        updateDomain();
        updateIsometryButtons();
        updateStdGeneratorsList();
        if (showCayley) updateCayley();
    } catch (e) {
        if (errorEl) errorEl.textContent = e.message;
        console.error('Error parsing matrices:', e);
    }
}

function animateIsometry(genIndex, event) {
    if (animatingIsometry || genIndex >= currentMatrices.length) return;

    let g = currentMatrices[genIndex];

    // Use inverse if Cmd/Ctrl is held
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv();
    }

    try {
        const X = g.log();
        const startView = viewMatrix;
        const duration = 1000;
        const startTime = performance.now();
        animatingIsometry = true;

        function step(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = t * t * (3 - 2 * t);

            const tX = new Matrix2x2(
                X.a.mul(eased), X.b.mul(eased),
                X.c.mul(eased), X.d.mul(eased)
            );
            const gt = Matrix2x2.exp(tX);
            viewMatrix = startView.mul(gt);

            updateDomain();
            if (showCayley) updateCayley();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingIsometry = false;
            }
        }
        requestAnimationFrame(step);
    } catch (e) {
        console.error('Animation error:', e);
        animatingIsometry = false;
    }
}

// --- UI Setup ---
function initUI() {
    setupControlPanel({
        onOpacityChange: (opacity) => {
            material.uniforms.u_opacity.value = opacity;
            mesh.visible = opacity > 0;
        },
        onCayleyToggle: (btn) => {
            showCayley = !showCayley;
            cayleyGroup.visible = showCayley;
            updateToggleBtn(btn, showCayley);
            if (showCayley) updateCayley();
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
        },
        onWordLengthChange: (depth) => {
            currentDepth = depth;
            if (showCayley) updateCayley();
        },
        onPaletteChange: (paletteKey) => {
            const palette = colorPalettes[paletteKey];
            material.uniforms.u_colorMode.value = palette.mode;
            material.uniforms.u_colorOffset.value.copy(palette.offset);
            material.uniforms.u_colorFreq.value = palette.freq;
        },
        controls,
        mesh,
        cayleyGroup,
        material
    });
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

// Initialize
initUI();
setupMatrixInput(refreshFromUI);

// Initial refresh after a short delay to let MathQuill initialize
setTimeout(() => {
    refreshFromUI();
}, 200);

animate(0);
