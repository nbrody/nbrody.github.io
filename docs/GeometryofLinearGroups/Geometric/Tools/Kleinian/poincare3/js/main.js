import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getDirichletFaces, getCayleyGraph, getStdGenerators, formatWordMathJax, reduceWord, Matrix2x2, getBisectorSphere } from './math.js';
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
        u_colorFreq: { value: initialPalette.freq },
        u_showTiling: { value: false }
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

// Walls Group (hemisphere bisectors)
const wallsGroup = new THREE.Group();
wallsGroup.visible = false;
scene.add(wallsGroup);
let wallsOpacity = 0;
let showTiedye = false;

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
// Create a spherical cap mesh for a hyperbolic bisector
// The bisector is a sphere orthogonal to the unit sphere
function createBisectorWall(p1, p2, color) {
    // Skip if points are too close or on boundary
    if (p1.distanceTo(p2) < 0.001) return null;
    if (p1.lengthSq() > 0.999 || p2.lengthSq() > 0.999) return null;

    // Get the proper hyperbolic bisector sphere
    const bisector = getBisectorSphere(p1, p2);
    const center = new THREE.Vector3(bisector.x, bisector.y, bisector.z);
    const radius = Math.abs(bisector.w);

    // Skip degenerate cases
    if (radius < 0.001 || radius > 100) return null;

    // The bisector sphere intersects the unit sphere orthogonally
    // The intersection circle has radius: sqrt(R^2 - (d^2 - 1)) where d = |center|
    // For orthogonal spheres: |center|^2 = R^2 + 1, so the cap angle is:
    // cos(theta) = 1/|center| (where theta is from center toward unit sphere)

    const centerDist = center.length();
    if (centerDist < 0.001) return null;

    // Compute the angular extent of the cap (portion inside unit ball)
    // The sphere intersects unit sphere at angle theta from center direction
    // where cos(theta) = (|C|^2 + R^2 - 1) / (2 * |C| * R)
    // For orthogonal case: |C|^2 = R^2 + 1, so cos(theta) = R / |C|
    const cosTheta = radius / centerDist;
    const thetaMax = Math.acos(Math.min(1, Math.max(-1, cosTheta)));

    // Create a partial sphere geometry (spherical cap)
    // We want the portion of the sphere that's inside the unit ball
    // This is a cap from phi=0 to phi=thetaMax
    const segments = 32;
    const rings = 16;

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    // Generate vertices for spherical cap
    for (let i = 0; i <= rings; i++) {
        const phi = (i / rings) * thetaMax;  // From pole to edge
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * Math.PI * 2;

            // Point on unit sphere centered at origin
            const x = sinPhi * Math.cos(theta);
            const y = sinPhi * Math.sin(theta);
            const z = cosPhi;

            vertices.push(x * radius, y * radius, z * radius);
        }
    }

    // Generate indices
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segments; j++) {
            const a = i * (segments + 1) + j;
            const b = a + segments + 1;

            indices.push(a, b, a + 1);
            indices.push(b, b + 1, a + 1);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: wallsOpacity * 0.4,  // Max opacity of 0.4 when fully visible
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, mat);

    // Position at center and orient so the cap points toward origin
    mesh.position.copy(center);

    // Rotate so +Z (the pole) points toward origin
    const toOrigin = center.clone().negate().normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toOrigin);

    return mesh;
}

function updateWalls() {
    wallsGroup.clear();
    if (currentGenerators.length === 0) return;

    const { points, edges } = getCayleyGraph(currentGenerators, currentDepth, viewMatrix);
    const numMatrices = currentMatrices.length;

    // Track seen bisectors to avoid duplicates
    const seenBisectors = new Set();

    for (const { u, v, type } of edges) {
        const p1 = points[u];
        const p2 = points[v];

        // Create a key for this bisector (order-independent)
        const key1 = `${p1.x.toFixed(4)},${p1.y.toFixed(4)},${p1.z.toFixed(4)}`;
        const key2 = `${p2.x.toFixed(4)},${p2.y.toFixed(4)},${p2.z.toFixed(4)}`;
        const bisectorKey = key1 < key2 ? `${key1}-${key2}` : `${key2}-${key1}`;

        if (seenBisectors.has(bisectorKey)) continue;
        seenBisectors.add(bisectorKey);

        const color = generatorColors[type % generatorColors.length];
        const wall = createBisectorWall(p1, p2, color);
        if (wall) {
            wallsGroup.add(wall);
        }
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
    return count;  // Return actual face count
}

// Store standard generators for animation
let stdGenerators = [];
let actualFaceCount = 0;
let cumulativeWord = [];  // Track the word representing the current viewMatrix

function updateCurrentElementDisplay() {
    const display = document.getElementById('current-element-display');
    if (!display) return;

    const reducedWord = reduceWord(cumulativeWord);
    const wordLatex = formatWordMathJax(reducedWord);
    display.innerHTML = `\\(${wordLatex}\\)`;

    // Trigger MathJax to re-render
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([display]);
    }
}

function updateStdGeneratorsList() {
    const container = document.getElementById('std-generators-list');
    if (!container) return;

    // Use the actual face count, not maxFaces
    stdGenerators = getStdGenerators(currentGenerators, viewMatrix, actualFaceCount);

    // Associate each generator's face with its index in u_faces
    const uniformFaces = material.uniforms.u_faces.value;
    stdGenerators.forEach(gen => {
        if (gen.face) {
            // Find matching face in uniforms
            for (let i = 0; i < actualFaceCount; i++) {
                const uf = uniformFaces[i];
                const dx = Math.abs(gen.face.x - uf.x);
                const dy = Math.abs(gen.face.y - uf.y);
                const dz = Math.abs(gen.face.z - uf.z);
                const dr = Math.abs(Math.abs(gen.face.w) - Math.abs(uf.w));
                if (dx < 0.001 && dy < 0.001 && dz < 0.001 && dr < 0.001) {
                    gen.faceUniformIdx = i;
                    break;
                }
            }
        }
    });

    container.innerHTML = '';

    if (stdGenerators.length === 0) {
        container.innerHTML = '<p class="empty-message">No standard generators found</p>';
        return;
    }

    stdGenerators.forEach((gen, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item' + (gen.isStabilizer ? ' stabilizer' : '') + (gen.isParabolic ? ' parabolic' : '');

        const wordSpan = document.createElement('span');
        wordSpan.className = 'std-gen-word';
        const wordLatex = formatWordMathJax(gen.wordArr);
        wordSpan.innerHTML = `\\(${wordLatex}\\)`;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'std-gen-type';
        typeSpan.textContent = gen.isStabilizer ? 'stabilizer' : (gen.isParabolic ? 'cusp' : 'face');

        item.appendChild(wordSpan);
        item.appendChild(typeSpan);

        // Click to animate this isometry
        item.addEventListener('click', (e) => {
            animateStdGenerator(idx, e);
        });

        container.appendChild(item);
    });

    // Trigger MathJax to render the words
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]);
    }

    // Update the current element display
    updateCurrentElementDisplay();
}

function animateStdGenerator(idx, event) {
    if (animatingIsometry || idx >= stdGenerators.length) return;

    const gen = stdGenerators[idx];
    let g = gen.matrix;
    let wordToAppend = [...gen.wordArr];

    // Use inverse if Cmd/Ctrl is held
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv();
        // Invert the word: reverse and negate each index
        wordToAppend = gen.wordArr.slice().reverse().map(idx => -idx);
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
            if (wallsOpacity > 0) updateWalls();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingIsometry = false;
                // Append to cumulative word and reduce
                cumulativeWord = reduceWord([...cumulativeWord, ...wordToAppend]);
                updateStdGeneratorsList();
            }
        }
        requestAnimationFrame(step);
    } catch (e) {
        console.error('Animation error:', e);
        animatingIsometry = false;
    }
}

// --- Double-click to animate face pairing ---
function sdFace(p, face) {
    // Signed distance to a face (bisector sphere)
    // Matches shader: s * (length(p - c) - abs(r))
    const center = new THREE.Vector3(face.x, face.y, face.z);
    const r = face.w;
    const s = r > 0 ? 1 : -1;
    return s * (p.distanceTo(center) - Math.abs(r));
}

function mapSDF(p, faces, faceCount) {
    // Returns {d, bestId} - matches shader map() function
    // Domain is intersection of half-spaces, so we use max
    let d = p.length() - 1.0;  // Start with unit ball distance
    let bestId = -1;

    for (let i = 0; i < faceCount; i++) {
        const df = sdFace(p, faces[i]);
        if (df > d) {
            d = df;
            bestId = i;
        }
    }
    return { d, bestId };
}

function findClickedFace(ray) {
    // Raymarch along the ray to find where we hit the domain boundary
    const faces = material.uniforms.u_faces.value;
    const faceCount = material.uniforms.u_faceCount.value;

    if (faceCount === 0) return -1;

    const EPSILON = 0.002;
    const MAX_DIST = 10;
    let t = 0.01;  // Start slightly forward

    for (let iter = 0; iter < 200; iter++) {
        const p = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));

        // If we're way outside, early exit
        if (p.length() > 2.0) {
            t += 0.05;
            if (t > MAX_DIST) return -1;
            continue;
        }

        const { d, bestId } = mapSDF(p, faces, faceCount);

        // We're on the surface when d is close to 0
        if (Math.abs(d) < EPSILON && bestId >= 0) {
            return bestId;
        }

        // Step by the absolute distance (we might be inside or outside)
        const stepSize = Math.max(EPSILON, Math.abs(d) * 0.9);
        t += stepSize;

        if (t > MAX_DIST) return -1;
    }
    return -1;
}

function handleDoubleClick(event) {
    if (animatingIsometry) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const faceIdx = findClickedFace(raycaster.ray);
    if (faceIdx < 0) return;

    // Find the stdGenerator that matches this face by uniform index
    for (let i = 0; i < stdGenerators.length; i++) {
        const gen = stdGenerators[i];
        if (gen.faceUniformIdx === faceIdx) {
            // Apply inverse so that clicking on a face moves it to its paired face
            // Create a fake event with ctrlKey set to invert the isometry
            const inverseEvent = { metaKey: true, ctrlKey: true };
            animateStdGenerator(i, inverseEvent);
            return;
        }
    }
}

// Add double-click listener
renderer.domElement.addEventListener('dblclick', handleDoubleClick);

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

        // Reset view matrix and cumulative word when generators change
        viewMatrix = new Matrix2x2(1, 0, 0, 1);
        cumulativeWord = [];

        actualFaceCount = updateDomain();
        updateIsometryButtons();
        updateStdGeneratorsList();
        if (showCayley) updateCayley();
        if (wallsOpacity > 0) updateWalls();
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
            if (wallsOpacity > 0) updateWalls();

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
        onPolyhedronOpacity: (opacity) => {
            material.uniforms.u_opacity.value = opacity;
            mesh.visible = opacity > 0;
        },
        onWallsOpacity: (opacity) => {
            wallsOpacity = opacity;
            wallsGroup.visible = opacity > 0;
            // Update all existing wall materials
            wallsGroup.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = opacity * 0.4;
                }
            });
            // Rebuild walls if turning on and empty
            if (opacity > 0 && wallsGroup.children.length === 0) {
                updateWalls();
            }
        },
        onCayleyToggle: (btn) => {
            showCayley = !showCayley;
            cayleyGroup.visible = showCayley;
            updateToggleBtn(btn, showCayley);
            if (showCayley) updateCayley();
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
        },
        onWordLengthChange: (depth) => {
            currentDepth = depth;
            if (showCayley) updateCayley();
            if (wallsOpacity > 0) updateWalls();
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
