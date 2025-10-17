/**
 * Main application module: Three.js setup, rendering, and event handling
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import { 
    easeInOutQuad, 
    getExternalVectorsPayload, 
    getExternalFacesPayload, 
    normalizeFacesMeta,
    vectorsToTextarea,
    computeEdgeCycleByPairings,
    formatAngle
} from './utils.js';
import { 
    raySphereIntersectCPU, 
    sceneSDFWithIdCPU, 
    sceneSDFTop2CPU, 
    sceneSDFTop3CPU,
    getNormalCPU,
    computeRayFromMouse,
    computeDihedralAngle
} from './geometry.js';
import { renderGutter, highlightGutterFaces, showFaceMeta, setupPager, setupPanelToggle, showFaceLabel3D, updateFaceLabelPosition, hideFaceLabel3D, getCurrentLabelFaceId } from './ui.js';
import { setupMatrixInput, getMatricesFromUI, Complex } from './matrixInput.js';
import { generateGroupElements, computeDelaunayNeighbors } from './dirichletUtils.js';
import { polyhedronLibrary } from '../../assets/polyhedronLibrary.js';

// Constants
const MAX_PLANES_CONST = 256;
const CPU_MAX_STEPS = 200;
const CPU_MAX_DIST = 10.0;
const CPU_HIT_THRESHOLD = 0.001;

// Default vectors for initial render
const defaultVectors = [
    " 2, 0, 0, -1",
    "-2, 0, 0, -1",
    " 0, 2, 0, -1",
    " 0,-2, 0, -1",
    " 0, 0, 2, -1",
    " 0, 0,-2, -1",
].join('\n');

// Global state
let scene, camera, renderer, controls, material, uniforms;
let boundarySphere;
let _currentSphereCenters = [];
let _currentSphereRadii = [];
let _currentPlaneNormals = [];
let _currentFaceIdsByLine = [];
let _currentWordsByLine = []; // Store word metadata for each line
let _generatedWords = []; // Store words from matrix generation (not displayed in textarea)
let _facesMetaById = [];
let _paletteMode = 0;
let _popActive = false;
let _popStart = 0;
const _popDurationMs = 600;

// Animation helpers
function triggerPop(faceId) {
    if (!Number.isFinite(faceId)) return;
    uniforms.u_selected_face_id.value = Math.floor(faceId);
    uniforms.u_pop_strength.value = 1.0;
    _popActive = true;
    _popStart = performance.now();
}

function flyCameraToDirection(dir, durationMs = 450) {
    const start = performance.now();
    const startPos = camera.position.clone();
    const endPos = dir.clone().normalize().multiplyScalar(1.8);
    const target = new THREE.Vector3(0, 0, 0);
    controls.enabled = false;
    controls.target.copy(target);
    function step(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const k = easeInOutQuad(t);
        camera.position.lerpVectors(startPos, endPos, k);
        camera.lookAt(target);
        renderer.render(scene, camera);
        if (t < 1) requestAnimationFrame(step); else { controls.enabled = true; }
    }
    requestAnimationFrame(step);
}

function lookHeadOnAtFaceId(faceId) {
    if (!Number.isFinite(faceId)) return;
    const numSpheres = _currentSphereCenters.length;
    let dir;
    if (faceId < numSpheres) {
        dir = _currentSphereCenters[faceId]?.clone();
    } else {
        const i = faceId - numSpheres;
        dir = _currentPlaneNormals[i]?.clone();
    }
    if (!dir) return;
    if (dir.lengthSq() < 1e-9) return;
    flyCameraToDirection(dir);
}

// Compute the center position of a face (for 3D label positioning)
function getFaceCenter(faceId) {
    if (!Number.isFinite(faceId) || faceId < 0) return null;
    const numSpheres = _currentSphereCenters.length;

    if (faceId < numSpheres) {
        // For spherical faces, use the sphere center
        return _currentSphereCenters[faceId]?.clone();
    } else {
        // For planar faces, use a point on the plane close to origin
        const i = faceId - numSpheres;
        const normal = _currentPlaneNormals[i];
        if (!normal) return null;

        // Project origin onto the plane and move slightly in normal direction
        // The plane passes through origin with given normal, so we just use the normal direction
        return normal.clone().multiplyScalar(0.3);
    }
}

// Parse input and update uniforms
async function updateFromInput(clearGeneratedWords = true) {
    const vectorText = document.getElementById('vectors').value.trim();
    const lines = vectorText.split('\n').filter(line => line.trim() !== '');
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = '';

    // Clear generated words if this is a manual update
    if (clearGeneratedWords) {
        _generatedWords = [];
    }

    if (lines.length > MAX_PLANES_CONST) {
        errorMessage.textContent = `Error: Max ${MAX_PLANES_CONST} vectors allowed.`;
        renderGutter(lines.length, null, null, _paletteMode);
        _currentSphereCenters = [];
        _currentSphereRadii = [];
        _currentPlaneNormals = [];
        _currentFaceIdsByLine = [];
        return;
    }

    const sphereCenters = [];
    const sphereRadii = [];
    const planeNormals = [];
    const lineKinds = [];
    const lineLocalIdx = [];
    const wordsByLine = [];
    // New: collect raw covectors for strict support filtering
    const covRowsByLine = []; // raw covectors [a,b,c,d], oriented with w<=0
    const wordsByRawLine = []; // word metadata parallel to covRowsByLine

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        // Extract word from comment (anything after #) or from generated words
        const parts = line.split('#');
        const cleanLine = parts[0].trim();
        let word = parts.length > 1 ? parts[1].trim() : '';
        // If no comment found, check if we have a generated word for this line
        if (!word && _generatedWords && _generatedWords[lineIdx]) {
            word = _generatedWords[lineIdx];
        }
        if (!cleanLine) continue;

        // Check for matrix input: (a, b, c, d)
        const parenMatch = cleanLine.match(/^\s*\(\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*\)\s*$/);
        if (parenMatch) {
            if (!(typeof PSL2CtoSDF !== 'undefined' && PSL2CtoSDF)) {
                errorMessage.textContent = `Matrix input requires PSL2CtoSDF.js to be loaded.`;
                renderGutter(lines.length, null, null, _paletteMode);
                return;
            }
            const a = parseFloat(parenMatch[1]);
            const b = parseFloat(parenMatch[2]);
            const c = parseFloat(parenMatch[3]);
            const d = parseFloat(parenMatch[4]);
            if ([a, b, c, d].some(x => Number.isNaN(x))) {
                errorMessage.textContent = `Invalid matrix coefficients in line: "${cleanLine}"`;
                renderGutter(lines.length, null, null, _paletteMode);
                return;
            }
            try {
                const A = PSL2CtoSDF.C(a, 0), B = PSL2CtoSDF.C(b, 0), Cc = PSL2CtoSDF.C(c, 0), D = PSL2CtoSDF.C(d, 0);
                const so31 = PSL2CtoSDF.PSL2CtoSO31(A, B, Cc, D);
                let cov;
                try {
                    const result = PSL2CtoSDF.sDF_autoFromSO31(so31);
                    cov = result?.row || null;
                } catch (e) {
                    cov = null;
                }
                // Fallback to Dirichlet bisector if needed
                if (!cov || !Array.isArray(cov) || cov.length !== 4 || cov.some(v => !Number.isFinite(v)) ||
                    (Math.abs(cov[0]) + Math.abs(cov[1]) + Math.abs(cov[2]) + Math.abs(cov[3]) < 1e-12)) {
                    let yx = 0, yy = 0, yz = 0, yw = 1;
                    if (Array.isArray(so31) && so31.length === 4 && Array.isArray(so31[0])) {
                        yx = so31[0][3]; yy = so31[1][3]; yz = so31[2][3]; yw = so31[3][3];
                    } else if (Array.isArray(so31) && so31.length === 16) {
                        yx = so31[3]; yy = so31[7]; yz = so31[11]; yw = so31[15];
                    }
                    cov = [0 - yx, 0 - yy, 0 - yz, 1 - yw];
                }
                if (!cov || cov.length !== 4 || cov.some(v => !Number.isFinite(v))) {
                    throw new Error('Invalid sDF from PSL2CtoSDF');
                }
                let [vx, vy, vz, vw] = cov;
                if (vw > 0) { vx = -vx; vy = -vy; vz = -vz; vw = -vw; }
                // Validate spacelike then store raw row; conversion happens after filtering
                const v = new THREE.Vector4(vx, vy, vz, vw);
                const n = new THREE.Vector3(v.x, v.y, v.z);
                const nSq = n.lengthSq();
                const wSq = v.w * v.w;
                if (nSq <= wSq) {
                    errorMessage.textContent = `Matrix-derived vector is not spacelike.`;
                    renderGutter(lines.length, null, null, _paletteMode);
                    return;
                }
                covRowsByLine.push([vx, vy, vz, vw]);
                wordsByRawLine.push(word);
                lineKinds.push('raw');
                lineLocalIdx.push(covRowsByLine.length - 1);
                wordsByLine.push(word);
                continue;
            } catch (e) {
                console.warn(e);
                errorMessage.textContent = `Failed to convert matrix to sDF in line: "${cleanLine}"`;
                renderGutter(lines.length, null, null, _paletteMode);
                return;
            }
        }

        // Default: parse as [x, y, z, t]
        const coords = cleanLine.split(',').map(s => parseFloat(s.trim()));
        if (coords.length !== 4 || coords.some(isNaN)) {
            errorMessage.textContent = `Invalid format: "${cleanLine}"`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        const v = new THREE.Vector4(...coords);
        if (v.w > 0) {
            errorMessage.textContent = `Final coordinate must be nonpositive (w <= 0).`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        const n = new THREE.Vector3(v.x, v.y, v.z);
        const nSq = n.lengthSq();
        const wSq = v.w * v.w;

        if (nSq <= wSq) {
            errorMessage.textContent = `Vector is not spacelike.`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        covRowsByLine.push([v.x, v.y, v.z, v.w]);
        wordsByRawLine.push(word);
        lineKinds.push('raw');
        lineLocalIdx.push(covRowsByLine.length - 1);
        wordsByLine.push(word);
    }

    // === New: Filter covectors by strict support (keep only faces with a witness point) ===
    let survivorsIdx = [];
    const filterFn = (typeof window !== 'undefined' && typeof window.filterFaceDefiningCovectorsCone === 'function')
        ? window.filterFaceDefiningCovectorsCone
        : null;

    if (covRowsByLine.length > 0) {
        if (filterFn) {
            try {
                survivorsIdx = filterFn(covRowsByLine.slice(), { eps: 1e-9, initBox: 1e6, strict_margin: 1e-9 });
            } catch (e) {
                console.warn('filterFaceDefiningCovectorsCone failed, falling back to keeping all:', e);
                survivorsIdx = covRowsByLine.map((_, i) => i);
            }
        } else {
            // Fallback: keep all if filter utility is not available
            survivorsIdx = covRowsByLine.map((_, i) => i);
        }
    }

    // Rebuild sphere/plane arrays from survivors only, and map line -> face id
    const sphereCentersFiltered = [];
    const sphereRadiiFiltered = [];
    const planeNormalsFiltered = [];
    const faceIdsByLine = new Array(lines.length).fill(undefined);

    const idxSet = new Set(survivorsIdx);
    const rawIndexToFaceId = new Map();
    for (const iRaw of survivorsIdx) {
        const row = covRowsByLine[iRaw];
        let [ax, ay, az, aw] = row;
        if (aw > 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
        const n = new THREE.Vector3(ax, ay, az);
        const nSq = n.lengthSq();
        const wSq = aw * aw;
        if (Math.abs(aw) < 1e-6) {
            // Plane through origin: store unit normal
            if (n.lengthSq() < 1e-12) continue; // skip degenerate
            const fid = sphereCentersFiltered.length + planeNormalsFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            planeNormalsFiltered.push(n.clone().normalize());
        } else {
            // Sphere: center = n/aw, radius = sqrt(n^2/w^2 - 1)
            if (nSq <= wSq) continue; // skip non-spacelike (safety)
            const center = n.clone().divideScalar(aw);
            const r = Math.sqrt(nSq / wSq - 1);
            const fid = sphereCentersFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            sphereCentersFiltered.push(center);
            sphereRadiiFiltered.push(r);
        }
    }

    // Map original lines to face ids (only for lines that produced raw covectors kept by the filter)
    for (let i = 0; i < lineKinds.length; i++) {
        if (lineKinds[i] !== 'raw') { faceIdsByLine[i] = undefined; continue; }
        const rawIdx = lineLocalIdx[i];
        if (idxSet.has(rawIdx)) {
            faceIdsByLine[i] = rawIndexToFaceId.get(rawIdx);
        } else {
            faceIdsByLine[i] = undefined; // filtered out
        }
    }

    // Update global state
    _currentSphereCenters = sphereCentersFiltered.map(v => v.clone());
    _currentSphereRadii = sphereRadiiFiltered.slice();
    _currentPlaneNormals = planeNormalsFiltered.map(v => v.clone());
    _currentFaceIdsByLine = faceIdsByLine.slice();
    _currentWordsByLine = wordsByLine.slice();

    // Update uniforms
    uniforms.u_num_sphere_planes.value = sphereCentersFiltered.length;
    for (let i = 0; i < MAX_PLANES_CONST; i++) {
        uniforms.u_sphere_centers.value[i].set(0, 0, 0);
        if (i < sphereCentersFiltered.length) {
            uniforms.u_sphere_centers.value[i].copy(sphereCentersFiltered[i]);
            uniforms.u_sphere_radii.value[i] = sphereRadiiFiltered[i];
        }
    }

    uniforms.u_num_euclidean_planes.value = planeNormalsFiltered.length;
    for (let i = 0; i < MAX_PLANES_CONST; i++) {
        uniforms.u_plane_normals.value[i].set(0, 0, 0);
        if (i < planeNormalsFiltered.length) {
            uniforms.u_plane_normals.value[i].copy(planeNormalsFiltered[i]);
        }
    }

    renderGutter(lines.length, faceIdsByLine, wordsByLine, _paletteMode);
    const metaElR = document.getElementById('selected-face-meta');
    if (metaElR) metaElR.textContent = '';
}

// Convert matrices to vector format using direct covector filtering
async function updateFromMatrices() {
    const errorMessage = document.getElementById('matrix-error-message');
    if (errorMessage) errorMessage.textContent = '';

    try {
        const matrices = getMatricesFromUI();
        if (matrices.length === 0) {
            if (errorMessage) errorMessage.textContent = 'Please add at least one matrix.';
            return;
        }

        // Check if PSL2CtoSDF is available
        if (typeof PSL2CtoSDF === 'undefined' || !PSL2CtoSDF) {
            if (errorMessage) errorMessage.textContent = 'PSL2CtoSDF.js is required for matrix conversion.';
            return;
        }

        const wordLength = parseInt(document.getElementById('wordLength')?.value) || 4;

        // Step 1: Generate all group elements up to word length
        console.log(`Generating group elements up to word length ${wordLength}...`);
        const groupElements = generateGroupElements(matrices, wordLength);
        console.log(`Generated ${groupElements.length} group elements`);

        if (groupElements.length === 0) {
            if (errorMessage) {
                errorMessage.textContent = 'No group elements generated. Check your matrices.';
            }
            return;
        }

        // Step 2: Convert ALL group elements to covectors (including stabilizers!)
        console.log('Converting all group elements to covectors...');
        const allCovectors = [];
        const allWords = [];
        const allMatrices = [];

        for (const item of groupElements) {
            const mat = item.m;
            const word = item.word || '';

            const A = PSL2CtoSDF.C(mat.a.re, mat.a.im);
            const B = PSL2CtoSDF.C(mat.b.re, mat.b.im);
            const C = PSL2CtoSDF.C(mat.c.re, mat.c.im);
            const D = PSL2CtoSDF.C(mat.d.re, mat.d.im);

            const so31 = PSL2CtoSDF.PSL2CtoSO31(A, B, C, D);
            let cov;
            try {
                const result = PSL2CtoSDF.sDF_autoFromSO31(so31);
                cov = result?.row || null;
            } catch (e) {
                cov = null;
            }

            // Fallback to Dirichlet bisector if needed
            if (!cov || !Array.isArray(cov) || cov.length !== 4 || cov.some(v => !Number.isFinite(v)) ||
                (Math.abs(cov[0]) + Math.abs(cov[1]) + Math.abs(cov[2]) + Math.abs(cov[3]) < 1e-12)) {
                let yx = 0, yy = 0, yz = 0, yw = 1;
                if (Array.isArray(so31) && so31.length === 4 && Array.isArray(so31[0])) {
                    yx = so31[0][3]; yy = so31[1][3]; yz = so31[2][3]; yw = so31[3][3];
                } else if (Array.isArray(so31) && so31.length === 16) {
                    yx = so31[3]; yy = so31[7]; yz = so31[11]; yw = so31[15];
                }
                cov = [0 - yx, 0 - yy, 0 - yz, 1 - yw];
            }

            if (!cov || cov.length !== 4 || cov.some(v => !Number.isFinite(v))) {
                console.warn('Invalid sDF for group element', word);
                continue;
            }

            let [vx, vy, vz, vw] = cov;
            if (vw > 0) { vx = -vx; vy = -vy; vz = -vz; vw = -vw; }

            allCovectors.push([vx, vy, vz, vw]);
            allWords.push(word);
            allMatrices.push(mat);
        }

        console.log(`Converted ${allCovectors.length} group elements to covectors`);

        // Step 3: Filter covectors to keep only face-defining ones
        console.log('Filtering face-defining covectors (including stabilizers)...');
        let faceIndices = [];

        if (typeof window.filterFaceDefiningCovectorsCone === 'function') {
            try {
                faceIndices = window.filterFaceDefiningCovectorsCone(allCovectors, {
                    eps: 1e-9,
                    strict_margin: 1e-9
                });
            } catch (e) {
                console.warn('Face filtering failed, keeping all covectors:', e);
                faceIndices = allCovectors.map((_, i) => i);
            }
        } else {
            console.warn('filterFaceDefiningCovectorsCone not available, keeping all covectors');
            faceIndices = allCovectors.map((_, i) => i);
        }

        console.log(`Found ${faceIndices.length} face-defining covectors out of ${allCovectors.length}`);

        if (faceIndices.length === 0) {
            if (errorMessage) {
                errorMessage.textContent = 'No faces found. Try increasing word length or check your matrices.';
            }
            return;
        }

        // Step 4: Build vectorsWithMeta from face-defining covectors only
        const vectorsWithMeta = faceIndices.map(idx => ({
            vector: allCovectors[idx],
            word: allWords[idx],
            matrix: allMatrices[idx]
        }));

        // Step 5: Format and populate page 2 with vectors (store words and metadata separately)
        const vectorsEl = document.getElementById('vectors');
        if (vectorsEl) {
            const lines = vectorsWithMeta.map(item => {
                const [vx, vy, vz, vw] = item.vector;
                return `${vx.toFixed(6)}, ${vy.toFixed(6)}, ${vz.toFixed(6)}, ${vw.toFixed(6)}`;
            });
            vectorsEl.value = lines.join('\n');

            // Store words separately (not in textarea)
            _generatedWords = vectorsWithMeta.map(item => item.word);

            await updateFromInput(false);

            // After updateFromInput has run and assigned face IDs, populate _facesMetaById
            // Map from line index to face ID, then store metadata
            _facesMetaById = [];
            for (let lineIdx = 0; lineIdx < vectorsWithMeta.length; lineIdx++) {
                const faceId = _currentFaceIdsByLine[lineIdx];
                if (faceId !== undefined) {
                    _facesMetaById[faceId] = {
                        word: vectorsWithMeta[lineIdx].word,
                        matrix: vectorsWithMeta[lineIdx].matrix
                    };
                }
            }
        }

        console.log(`Successfully generated ${vectorsWithMeta.length} vectors with metadata`);

    } catch (e) {
        console.error(e);
        if (errorMessage) {
            errorMessage.textContent = e.message || 'Error processing matrices.';
        }
    }
}

// Initialize Three.js scene
async function init() {
    const container = document.getElementById('container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 1.8);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.6;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222233, 0.8);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(3, 3, 5);
    scene.add(dirLight);

    const boundaryMat = new THREE.MeshPhongMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.4,
        shininess: 120,
        specular: 0xffffff,
        side: THREE.DoubleSide
    });

    const sphereGeom = new THREE.SphereGeometry(1, 64, 64);
    boundarySphere = new THREE.Mesh(sphereGeom, boundaryMat);
    boundarySphere.renderOrder = 0;

    // Load shaders from external files
    const vertexShaderResponse = await fetch('./shaders/vertex.glsl');
    const fragmentShaderResponse = await fetch('./shaders/fragment.glsl');
    const vertexShader = await vertexShaderResponse.text();
    const fragmentShader = await fragmentShaderResponse.text();

    const initialSphereCenters = Array.from({ length: MAX_PLANES_CONST }, () => new THREE.Vector3());
    const initialSphereRadii = new Float32Array(MAX_PLANES_CONST);
    const initialPlaneNormals = Array.from({ length: MAX_PLANES_CONST }, () => new THREE.Vector3());

    uniforms = {
        u_resolution: { value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height) },
        u_cameraPosition: { value: camera.position },
        u_inverseViewProjectionMatrix: { value: new THREE.Matrix4() },
        u_num_sphere_planes: { value: 0 },
        u_sphere_centers: { value: initialSphereCenters },
        u_sphere_radii: { value: initialSphereRadii },
        u_num_euclidean_planes: { value: 0 },
        u_plane_normals: { value: initialPlaneNormals },
        u_palette_mode: { value: _paletteMode },
        u_selected_face_id: { value: -1 },
        u_pop_strength: { value: 0.0 },
        u_hover_offset: { value: 0.0 },
        u_edge_width: { value: 0.015 },
        u_edge_boost: { value: 0.6 },
        u_edge_global: { value: 0.20 },
        u_edge_select_boost: { value: 0.45 },
        u_selected_edge_faces: { value: new THREE.Vector2(-1, -1) },
        u_selected_vertex_pos: { value: new THREE.Vector3(0,0,0) },
        u_selected_vertex_radius: { value: 0.0 },
    };

    material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
    });

    const hyperbolicGroup = new THREE.Group();
    hyperbolicGroup.add(boundarySphere);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.renderOrder = 1;
    hyperbolicGroup.add(quad);
    hyperbolicGroup.position.set(0, 0, 0);
    scene.add(hyperbolicGroup);

    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);

    setupEventHandlers();
    await setupUI();
    animate();
}

function setupEventHandlers() {
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('resize', () => {
        const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
        renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
    });

    document.getElementById('render-btn').addEventListener('click', updateFromInput);

    // Auto-rotate checkbox
    const autoRotateCheckbox = document.getElementById('auto-rotate');
    if (autoRotateCheckbox) {
        autoRotateCheckbox.checked = controls.autoRotate;
        autoRotateCheckbox.addEventListener('change', (e) => {
            controls.autoRotate = e.target.checked;
        });
    }

    // Boundary toggle
    const boundaryToggle = document.getElementById('toggle-boundary');
    if (boundaryToggle) {
        boundarySphere.visible = boundaryToggle.checked;
        boundaryToggle.addEventListener('change', (e) => {
            boundarySphere.visible = e.target.checked;
        });
    }

    // Palette selector
    const paletteSelect = document.getElementById('palette-select');
    if (paletteSelect) {
        paletteSelect.addEventListener('change', () => {
            const v = paletteSelect.value;
            const map = { 'colorful': 0, 'vaporwave': 1, 'uc': 2, 'halloween': 3, 'tie-dye': 4, 'sunset': 5 };
            _paletteMode = map[v] ?? 0;
            uniforms.u_palette_mode.value = _paletteMode;
            const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
            renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
        });
    }

    setupCanvasClickHandlers();
    setupGutterClickHandlers();
}

function setupCanvasClickHandlers() {
    const normalOut = document.getElementById('selected-face-normal');
    let lastClickedFaceIdCanvas = null;

    renderer.domElement.addEventListener('click', (ev) => {
        if (!_currentSphereCenters.length && !_currentPlaneNormals.length) return;

        const { ro, rd } = computeRayFromMouse(ev.clientX, ev.clientY, renderer, camera);
        const span = raySphereIntersectCPU(ro, rd, 1.0);
        
        if (!span) {
            if (normalOut) normalOut.textContent = "";
            uniforms.u_selected_face_id.value = -1;
            uniforms.u_hover_offset.value = 0.0;
            highlightGutterFaces([], _currentFaceIdsByLine);
            hideFaceLabel3D();
            lastClickedFaceIdCanvas = null;
            return;
        }

        // Alt-click for vertex picking
        if (ev.altKey) {
            let tV = Math.max(0, span.t0);
            let pV = ro.clone().addScaledVector(rd, tV);
            let hitV = false;
            for (let i = 0; i < CPU_MAX_STEPS; i++) {
                if ((span.t1 > 0 && tV > span.t1) || tV > CPU_MAX_DIST) break;
                const { sdf } = sceneSDFWithIdCPU(pV, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
                if (Math.abs(sdf) < CPU_HIT_THRESHOLD) { hitV = true; break; }
                const step = Math.max(Math.abs(sdf), 0.001);
                tV += step; pV.addScaledVector(rd, step);
            }
            if (hitV) {
                const { bestId, secondId, thirdId, bestVal, secondVal, thirdVal } = sceneSDFTop3CPU(pV, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
                const gap1 = Math.max(0, bestVal - secondVal);
                const gap2 = Math.max(0, secondVal - thirdVal);
                const EDGE_EPS = uniforms.u_edge_width.value * 1.2;
                if (bestId >= 0 && secondId >= 0 && thirdId >= 0 && gap1 < EDGE_EPS && gap2 < EDGE_EPS) {
                    uniforms.u_selected_vertex_pos.value.copy(pV);
                    uniforms.u_selected_vertex_radius.value = 0.03;
                    highlightGutterFaces([bestId, secondId, thirdId], _currentFaceIdsByLine);
                    if (normalOut) normalOut.textContent = `Vertex ≈ (${pV.x.toFixed(3)}, ${pV.y.toFixed(3)}, ${pV.z.toFixed(3)})`;
                    uniforms.u_selected_edge_faces.value.set(-1, -1);
                    hideFaceLabel3D();
                    return;
                }
            }
        }

        let t = Math.max(0, span.t0);
        let p = ro.clone().addScaledVector(rd, t);
        let hit = false;
        let hitId = -1;

        for (let i = 0; i < CPU_MAX_STEPS; i++) {
            if ((span.t1 > 0 && t > span.t1) || t > CPU_MAX_DIST) break;
            const { sdf, id } = sceneSDFWithIdCPU(p, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
            if (Math.abs(sdf) < CPU_HIT_THRESHOLD) {
                hit = true;
                hitId = id;
                break;
            }
            const step = Math.max(Math.abs(sdf), 0.001);
            t += step;
            p.addScaledVector(rd, step);
        }

        if (!hit) {
            if (normalOut) normalOut.textContent = "";
            uniforms.u_selected_face_id.value = -1;
            uniforms.u_hover_offset.value = 0.0;
            highlightGutterFaces([], _currentFaceIdsByLine);
            lastClickedFaceIdCanvas = null;
            return;
        }

        const lineIndex = _currentFaceIdsByLine.findIndex(fid => fid === hitId);
        let vecText = "";
        if (lineIndex !== -1) {
            const lines = (document.getElementById('vectors').value || "").split('\n').filter(l => l.trim() !== "");
            vecText = lines[lineIndex].trim();
        }

        let n = getNormalCPU(p, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
        if (n.dot(rd.clone().negate()) < 0) n = n.negate();

        if (normalOut) {
            if (vecText) {
                normalOut.textContent = `Face: [${vecText}]`;
            } else {
                normalOut.textContent = `3D unit normal ≈ (${n.x.toFixed(4)}, ${n.y.toFixed(4)}, ${n.z.toFixed(4)})`;
            }
        }

        const edgeOut = document.getElementById('selected-edge');
        if (ev.shiftKey && lastClickedFaceIdCanvas !== null && lastClickedFaceIdCanvas !== hitId) {
            highlightGutterFaces([lastClickedFaceIdCanvas, hitId], _currentFaceIdsByLine);
            const theta = computeDihedralAngle(lastClickedFaceIdCanvas, hitId, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
            if (edgeOut) {
                const nice = formatAngle(theta);
                edgeOut.textContent = `Edge: faces ${lastClickedFaceIdCanvas} & ${hitId} — hyperbolic dihedral angle ≈ ${nice}`;
            }
            const cyc = computeEdgeCycleByPairings(lastClickedFaceIdCanvas, hitId, _facesMetaById);
            if (cyc && cyc.length && isFinite(theta)) {
                const list = Array.from({length: cyc.length}, () => formatAngle(theta));
                const total = cyc.length * theta;
                const niceTotal = formatAngle(total);
                edgeOut.textContent += ` — cycle length ${cyc.length}; angles: [${list.join(', ')}]; total = ${niceTotal}`;
            }
            uniforms.u_selected_edge_faces.value.set(lastClickedFaceIdCanvas, hitId);
            hideFaceLabel3D();
            lastClickedFaceIdCanvas = null;
            return;
        } else {
            lastClickedFaceIdCanvas = hitId;
            uniforms.u_selected_edge_faces.value.set(-1, -1);
        }

        uniforms.u_selected_vertex_radius.value = 0.0;
        uniforms.u_selected_face_id.value = Math.floor(hitId);
        uniforms.u_hover_offset.value = 0.035;
        triggerPop(hitId);
        showFaceMeta(hitId, lineIndex, _facesMetaById);
        highlightGutterFaces([hitId], _currentFaceIdsByLine);
        if (edgeOut) edgeOut.textContent = '';

        // Show 3D label on polyhedron
        const faceCenter = getFaceCenter(hitId);
        if (faceCenter) {
            showFaceLabel3D(hitId, _facesMetaById, faceCenter, camera, renderer);
        }
    });
}

function setupGutterClickHandlers() {
    const gutterDiv = document.getElementById('vector-gutter');
    if (!gutterDiv) return;

    let lastClickedFaceId = null;

    gutterDiv.addEventListener('click', (e) => {
        const box = e.target.closest('.box');
        if (!box) return;
        const line = parseInt(box.dataset.line, 10);
        if (!Number.isInteger(line)) return;
        const faceId = _currentFaceIdsByLine[line];
        if (faceId === undefined) return;

        const edgeOut = document.getElementById('selected-edge');
        if (e.shiftKey && lastClickedFaceId !== null && lastClickedFaceId !== faceId) {
            highlightGutterFaces([lastClickedFaceId, faceId], _currentFaceIdsByLine);
            const theta = computeDihedralAngle(lastClickedFaceId, faceId, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
            if (edgeOut) {
                const nice = formatAngle(theta);
                edgeOut.textContent = `Edge: faces ${lastClickedFaceId} & ${faceId} — hyperbolic dihedral angle ≈ ${nice}`;
            }
            const cyc = computeEdgeCycleByPairings(lastClickedFaceId, faceId, _facesMetaById);
            if (cyc && cyc.length && isFinite(theta)) {
                const list = Array.from({length: cyc.length}, () => formatAngle(theta));
                const total = cyc.length * theta;
                const niceTotal = formatAngle(total);
                edgeOut.textContent += ` — cycle length ${cyc.length}; angles: [${list.join(', ')}]; total = ${niceTotal}`;
            }
            uniforms.u_selected_edge_faces.value.set(lastClickedFaceId, faceId);
            hideFaceLabel3D();
            lastClickedFaceId = null;
        } else {
            lastClickedFaceId = faceId;
            uniforms.u_selected_face_id.value = Math.floor(faceId);
            uniforms.u_hover_offset.value = 0.035;
            lookHeadOnAtFaceId(faceId);
            triggerPop(faceId);
            highlightGutterFaces([faceId], _currentFaceIdsByLine);
            if (edgeOut) edgeOut.textContent = '';
            uniforms.u_selected_edge_faces.value.set(-1, -1);
            showFaceMeta(faceId, line, _facesMetaById);

            // Show 3D label on polyhedron
            const faceCenter = getFaceCenter(faceId);
            if (faceCenter) {
                showFaceLabel3D(faceId, _facesMetaById, faceCenter, camera, renderer);
            }
        }
    });
}

async function setupUI() {
    const externalPayload = getExternalVectorsPayload();
    const vectorsEl = document.getElementById('vectors');
    const select = document.getElementById('example-select');

    // Populate vector examples dropdown
    if (typeof polyhedronLibrary !== 'undefined' && Array.isArray(polyhedronLibrary.polyhedra)) {
        polyhedronLibrary.polyhedra.forEach((item, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = item.name || `Example ${idx + 1}`;
            select.appendChild(opt);
        });
    }

    _facesMetaById = normalizeFacesMeta(getExternalFacesPayload());

    const vectorsTA = document.getElementById('vectors');
    const gutterDiv = document.getElementById('vector-gutter');
    if (vectorsTA && gutterDiv) {
        vectorsTA.addEventListener('scroll', () => {
            gutterDiv.scrollTop = vectorsTA.scrollTop;
        });
        vectorsTA.addEventListener('input', () => {
            const lines = vectorsTA.value.split('\n').filter(l => l.trim() !== '');
            renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
        });
    }

    // Example selector change handler
    select.addEventListener('change', (e) => {
        const i = parseInt(e.target.value, 10);
        if (Number.isInteger(i) && polyhedronLibrary.polyhedra[i]) {
            const { vectors } = polyhedronLibrary.polyhedra[i];
            document.getElementById('vectors').value = vectorsToTextarea(vectors);
            updateFromInput();
        }
    });

    setupPager();
    setupPanelToggle();

    // Setup matrix input
    setupMatrixInput();

    // Render from matrices button
    const renderFromMatricesBtn = document.getElementById('render-from-matrices-btn');
    if (renderFromMatricesBtn) {
        renderFromMatricesBtn.addEventListener('click', updateFromMatrices);
    }

    // Initialize: Load a random group example and generate polyhedron
    if (!externalPayload) {
        await loadRandomGroupExample();
    } else {
        vectorsEl.value = externalPayload;
        renderGutter((vectorsEl.value || '').split('\n').filter(l => l.trim() !== '').length, null, null, _paletteMode);
    }
}

// Load and render a random group example from the library
async function loadRandomGroupExample() {
    try {
        // Import the group library
        const { exampleLibrary } = await import('./matrixInput.js');

        if (!exampleLibrary || exampleLibrary.length === 0) {
            // Fallback to default vectors
            document.getElementById('vectors').value = defaultVectors;
            await updateFromInput();
            return;
        }

        // Randomly select an example
        const randomIndex = Math.floor(Math.random() * exampleLibrary.length);
        const example = exampleLibrary[randomIndex];

        console.log(`Initializing with random group example: ${example.name}`);

        // Set the dropdown to the selected example
        const matrixSelect = document.getElementById('matrix-example-select');
        if (matrixSelect) {
            matrixSelect.value = String(randomIndex);
        }

        // Load the matrices into the UI
        const container = document.getElementById('matrixInputs');
        if (container) {
            container.innerHTML = '';
            const { addMatrixInput } = await import('./matrixInput.js');
            example.mats.forEach(vals => addMatrixInput(vals.map(v => String(v).replace(/\*\*/g, '^'))));
        }

        // Generate the polyhedron from the matrices
        await updateFromMatrices();

    } catch (e) {
        console.error('Failed to load random group example:', e);
        // Fallback to default vectors
        document.getElementById('vectors').value = defaultVectors;
        await updateFromInput();
    }
}

function onWindowResize() {
    const container = document.getElementById('container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    uniforms.u_resolution.value.set(renderer.domElement.width, renderer.domElement.height);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    camera.updateMatrixWorld();
    const inverseViewProjectionMatrix = new THREE.Matrix4().multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    uniforms.u_inverseViewProjectionMatrix.value.copy(inverseViewProjectionMatrix);
    uniforms.u_cameraPosition.value.copy(camera.position);

    if (_popActive) {
        const now = performance.now();
        const t = Math.min(1, (now - _popStart) / _popDurationMs);
        const strength = 1.0 - t;
        uniforms.u_pop_strength.value = Math.max(0, strength);
        if (t >= 1) {
            _popActive = false;
            uniforms.u_pop_strength.value = 0.0;
        }
    }

    // Update 3D label position if visible
    const currentLabelId = getCurrentLabelFaceId();
    if (currentLabelId >= 0) {
        const faceCenter = getFaceCenter(currentLabelId);
        if (faceCenter) {
            updateFaceLabelPosition(faceCenter, camera, renderer);
        }
    }

    renderer.render(scene, camera);
}

// Start the application
init();
