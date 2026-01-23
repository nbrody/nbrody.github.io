/**
 * Main application module: Three.js setup, rendering, and event handling
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import { VRButton } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/webxr/VRButton.js';
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
import { renderGutter, highlightGutterFaces, showFaceMeta, setupPager, setupPanelToggle, showFaceLabel3D, updateFaceLabelPosition, hideFaceLabel3D, getCurrentLabelFaceId, showEdgeLabel3D, updateEdgeLabelPosition, hideEdgeLabel3D, getCurrentEdgeLabelPosition } from './ui.js';
import { setupMatrixInput, getMatricesFromUI, Complex } from './matrixInput.js';
import { generateGroupElements, computeDelaunayNeighbors } from './dirichletUtils.js';
import { polyhedronLibrary } from '../../assets/polyhedronLibrary.js';
import { exportPolyhedronAs3MF } from './export3mf.js';
import { buildCayleyGraph, toggleCayleyGraph, clearCayleyGraph } from './cayleyGraph.js';
import { PoincareCertifier } from './poincareCertifier.js';

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
let polyhedronQuad;
let _currentSphereCenters = [];
let _currentSphereRadii = [];
let _currentPlaneNormals = [];
let _currentFaceIdsByLine = [];
let _currentWordsByLine = []; // Store word metadata for each line
let _generatedWords = []; // Store words from matrix generation (not displayed in textarea)
let _facesMetaById = [];
let _paletteMode = 0;
let _currentMatrices = [];
let _popActive = false;
let _popStart = 0;
const _popDurationMs = 600;

// Reusable objects to avoid GC overhead
const _inverseViewProjectionMatrix = new THREE.Matrix4();
const _viewProjectionMatrix = new THREE.Matrix4();

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
        // For spherical faces, find a point on the sphere surface inside the ball
        const center = _currentSphereCenters[faceId];
        const radius = _currentSphereRadii[faceId];
        if (!center || !radius) return null;

        // The sphere equation is |p - center| = radius
        // We want a point on this sphere that's also inside the ball
        // Find the closest point on the sphere to the origin
        const centerDist = center.length();

        if (centerDist < radius) {
            // Origin is inside the sphere - take point toward origin
            const dir = center.clone().normalize();
            return dir.multiplyScalar(Math.max(0.3, centerDist - radius + 0.1));
        } else {
            // Origin is outside sphere - take the closest point on sphere to origin
            const dir = center.clone().normalize();
            const closestPoint = dir.multiplyScalar(centerDist - radius);
            // Ensure it's inside the ball
            if (closestPoint.length() < 0.95) {
                return closestPoint;
            } else {
                // Fallback: use a point scaled down toward origin
                return dir.multiplyScalar(0.5);
            }
        }
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

// Find a point on the edge between two faces
// The edge is where both SDFs are approximately 0
function findEdgePoint(faceId1, faceId2, initialGuess = null) {
    if (!Number.isFinite(faceId1) || !Number.isFinite(faceId2)) return null;

    // Start from initial guess or origin
    let p = initialGuess ? initialGuess.clone() : new THREE.Vector3(0, 0, 0);

    // Use gradient descent to find a point where both SDFs are close to 0
    // and all other SDFs are >= 0
    const maxIterations = 50;
    const stepSize = 0.05;

    for (let iter = 0; iter < maxIterations; iter++) {
        const { sdf: sdf1 } = sceneSDFWithIdCPU(p, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);

        // Get normals for both faces
        const eps = 0.001;
        const px = p.clone().add(new THREE.Vector3(eps, 0, 0));
        const py = p.clone().add(new THREE.Vector3(0, eps, 0));
        const pz = p.clone().add(new THREE.Vector3(0, 0, eps));

        const { bestId, bestVal } = sceneSDFTop2CPU(p, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
        const { bestVal: vx } = sceneSDFTop2CPU(px, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
        const { bestVal: vy } = sceneSDFTop2CPU(py, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
        const { bestVal: vz } = sceneSDFTop2CPU(pz, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);

        const grad = new THREE.Vector3(
            (vx - bestVal) / eps,
            (vy - bestVal) / eps,
            (vz - bestVal) / eps
        );

        // Move towards the inside of the polyhedron (negative gradient)
        if (grad.lengthSq() > 1e-6) {
            p.addScaledVector(grad.normalize(), -stepSize * Math.abs(bestVal));
        }

        // Check if we found a good edge point
        const { bestId: id1, secondId: id2, bestVal: d1, secondVal: d2 } = sceneSDFTop2CPU(p, _currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);

        if ((id1 === faceId1 && id2 === faceId2) || (id1 === faceId2 && id2 === faceId1)) {
            if (Math.abs(d1) < 0.02 && Math.abs(d2) < 0.02) {
                return p;
            }
        }
    }

    // Fallback: return a point roughly between the face centers
    const center1 = getFaceCenter(faceId1);
    const center2 = getFaceCenter(faceId2);
    if (center1 && center2) {
        return center1.clone().add(center2).multiplyScalar(0.5).normalize().multiplyScalar(0.5);
    }

    return p;
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

    // === Filter covectors by strict support, but ALWAYS keep elliptic elements ===
    let survivorsIdx = [];
    const filterFn = (typeof window !== 'undefined' && typeof window.filterFaceDefiningCovectorsCone === 'function')
        ? window.filterFaceDefiningCovectorsCone
        : null;

    if (covRowsByLine.length > 0) {
        // Separate elliptic (|w| ≈ 0) from non-elliptic covectors
        const ellipticIdx = [];
        const nonEllipticIdx = [];
        const nonEllipticCovs = [];

        for (let i = 0; i < covRowsByLine.length; i++) {
            const [vx, vy, vz, vw] = covRowsByLine[i];
            // Elliptic elements have w ≈ 0 (planes through origin)
            if (Math.abs(vw) < 1e-6) {
                ellipticIdx.push(i);
            } else {
                nonEllipticIdx.push(i);
                nonEllipticCovs.push(covRowsByLine[i]);
            }
        }

        console.log(`Found ${ellipticIdx.length} elliptic elements (always kept) and ${nonEllipticIdx.length} non-elliptic elements`);

        // Always keep all elliptic elements
        survivorsIdx = [...ellipticIdx];

        // Filter non-elliptic elements strictly
        if (nonEllipticCovs.length > 0 && filterFn) {
            try {
                // Use strict margin to ensure only faces with witness points are kept
                const filteredNonElliptic = filterFn(nonEllipticCovs, { eps: 1e-9, initBox: 1e6, strict_margin: 1e-6 });
                // Map back to original indices
                for (const localIdx of filteredNonElliptic) {
                    survivorsIdx.push(nonEllipticIdx[localIdx]);
                }
                console.log(`Filtered non-elliptic to ${filteredNonElliptic.length} faces with witness points`);
            } catch (e) {
                console.warn('filterFaceDefiningCovectorsCone failed for non-elliptic, keeping all:', e);
                survivorsIdx = survivorsIdx.concat(nonEllipticIdx);
            }
        } else if (nonEllipticCovs.length > 0) {
            // Fallback: keep all non-elliptic if filter not available
            console.warn('filterFaceDefiningCovectorsCone not available - keeping all non-elliptic covectors');
            survivorsIdx = survivorsIdx.concat(nonEllipticIdx);
        }

        console.log(`Total: ${survivorsIdx.length} faces (${ellipticIdx.length} elliptic + ${survivorsIdx.length - ellipticIdx.length} non-elliptic)`);
    }

    // Rebuild sphere/plane arrays from survivors only, and map line -> face id
    // IMPORTANT: Process spheres first, then planes, to ensure correct face ID numbering
    // (Spheres get IDs 0..N-1, planes get IDs N..N+M-1)
    const sphereCentersFiltered = [];
    const sphereRadiiFiltered = [];
    const planeNormalsFiltered = [];
    const faceIdsByLine = new Array(lines.length).fill(undefined);

    const idxSet = new Set(survivorsIdx);
    const rawIndexToFaceId = new Map();

    // First pass: process all spheres (w ≠ 0)
    for (const iRaw of survivorsIdx) {
        const row = covRowsByLine[iRaw];
        let [ax, ay, az, aw] = row;
        if (aw > 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
        const n = new THREE.Vector3(ax, ay, az);
        const nSq = n.lengthSq();
        const wSq = aw * aw;

        if (Math.abs(aw) >= 1e-6 && nSq > wSq) {
            // Sphere: center = n/aw, radius = sqrt(n^2/w^2 - 1)
            const center = n.clone().divideScalar(aw);
            const r = Math.sqrt(nSq / wSq - 1);
            const fid = sphereCentersFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            sphereCentersFiltered.push(center);
            sphereRadiiFiltered.push(r);
        }
    }

    // Second pass: process all planes (w ≈ 0)
    for (const iRaw of survivorsIdx) {
        const row = covRowsByLine[iRaw];
        let [ax, ay, az, aw] = row;
        if (aw > 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
        const n = new THREE.Vector3(ax, ay, az);

        if (Math.abs(aw) < 1e-6) {
            // Plane through origin: store unit normal
            if (n.lengthSq() < 1e-12) continue; // skip degenerate
            const fid = sphereCentersFiltered.length + planeNormalsFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            planeNormalsFiltered.push(n.clone().normalize());
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

// Helper function to deduplicate covectors
function deduplicateCovectors(covectors, words, matrices) {
    const uniqueCovectors = [];
    const uniqueWords = [];
    const uniqueMatrices = [];

    for (let i = 0; i < covectors.length; i++) {
        const cov = covectors[i];
        const [vx, vy, vz, vw] = cov;
        const norm = Math.sqrt(vx * vx + vy * vy + vz * vz + vw * vw);
        if (norm < 1e-12) continue; // skip degenerate

        // Normalize: unit vector with w <= 0
        let [nx, ny, nz, nw] = [vx / norm, vy / norm, vz / norm, vw / norm];
        if (nw > 0) { nx = -nx; ny = -ny; nz = -nz; nw = -nw; }

        // Check if this normalized covector already exists
        let isDuplicate = false;
        for (let j = 0; j < uniqueCovectors.length; j++) {
            const [ux, uy, uz, uw] = uniqueCovectors[j];
            const unorm = Math.sqrt(ux * ux + uy * uy + uz * uz + uw * uw);
            const [unx, uny, unz, unw] = [ux / unorm, uy / unorm, uz / unorm, uw / unorm];

            // Check if they're the same (allowing for numerical tolerance)
            const diff = Math.sqrt(
                Math.pow(nx - unx, 2) +
                Math.pow(ny - uny, 2) +
                Math.pow(nz - unz, 2) +
                Math.pow(nw - unw, 2)
            );

            if (diff < 1e-6) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            uniqueCovectors.push(cov);
            uniqueWords.push(words[i]);
            uniqueMatrices.push(matrices[i]);
        }
    }

    return { uniqueCovectors, uniqueWords, uniqueMatrices };
}

// Convert matrices to vector format using direct covector filtering
async function updateFromMatrices() {
    const errorMessage = document.getElementById('matrix-error-message');
    if (errorMessage) errorMessage.textContent = '';

    try {
        const matrices = getMatricesFromUI();
        _currentMatrices = matrices; // Store for later use
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

        // Step 2: Convert all group elements to covectors
        console.log('Converting group elements to covectors...');
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

        // Step 3: Deduplicate covectors
        console.log('Deduplicating covectors...');
        const { uniqueCovectors, uniqueWords, uniqueMatrices } = deduplicateCovectors(
            allCovectors, allWords, allMatrices
        );
        console.log(`Deduplicated to ${uniqueCovectors.length} unique covectors`);

        // Step 4: Filter to keep covectors with witness points, but ALWAYS keep elliptic elements
        console.log('Filtering for faces with witness points, keeping all elliptics...');
        let faceIndices = [];

        // Separate elliptic (|w| ≈ 0) from non-elliptic covectors
        const ellipticIndices = [];
        const nonEllipticIndices = [];
        const nonEllipticCovectors = [];

        for (let i = 0; i < uniqueCovectors.length; i++) {
            const [vx, vy, vz, vw] = uniqueCovectors[i];
            // Elliptic elements have w ≈ 0 (planes through origin)
            if (Math.abs(vw) < 1e-6) {
                ellipticIndices.push(i);
            } else {
                nonEllipticIndices.push(i);
                nonEllipticCovectors.push(uniqueCovectors[i]);
            }
        }

        console.log(`Found ${ellipticIndices.length} elliptic elements (always kept) and ${nonEllipticIndices.length} non-elliptic elements`);

        // Always keep all elliptic elements
        faceIndices = [...ellipticIndices];

        // Filter non-elliptic elements
        if (nonEllipticCovectors.length > 0 && typeof window.filterFaceDefiningCovectorsCone === 'function') {
            try {
                // Use very strict filtering to ensure each face has a witness point
                const filteredNonElliptic = window.filterFaceDefiningCovectorsCone(nonEllipticCovectors, {
                    eps: 1e-9,
                    strict_margin: 1e-6  // Stricter margin to ensure witness point exists
                });
                // Map back to original indices
                for (const localIdx of filteredNonElliptic) {
                    faceIndices.push(nonEllipticIndices[localIdx]);
                }
                console.log(`Strict filtering found ${filteredNonElliptic.length} non-elliptic faces with witness points`);
            } catch (e) {
                console.warn('Strict face filtering failed, trying lenient filter:', e);
                try {
                    const filteredNonElliptic = window.filterFaceDefiningCovectorsCone(nonEllipticCovectors, {
                        eps: 1e-9,
                        strict_margin: 1e-9
                    });
                    for (const localIdx of filteredNonElliptic) {
                        faceIndices.push(nonEllipticIndices[localIdx]);
                    }
                } catch (e2) {
                    console.warn('All filtering failed, keeping all non-elliptic covectors:', e2);
                    faceIndices = faceIndices.concat(nonEllipticIndices);
                }
            }
        } else if (nonEllipticCovectors.length > 0) {
            console.warn('filterFaceDefiningCovectorsCone not available - keeping all non-elliptic covectors');
            faceIndices = faceIndices.concat(nonEllipticIndices);
        }

        console.log(`Total: ${faceIndices.length} faces (${ellipticIndices.length} elliptic + ${faceIndices.length - ellipticIndices.length} non-elliptic)`);

        if (faceIndices.length === 0) {
            if (errorMessage) {
                errorMessage.textContent = 'No faces found. Try increasing word length or check your matrices.';
            }
            return;
        }

        // Step 5: Build vectorsWithMeta from face-defining covectors only
        const vectorsWithMeta = faceIndices.map(idx => ({
            vector: uniqueCovectors[idx],
            word: uniqueWords[idx],
            matrix: uniqueMatrices[idx]
        }));

        // Step 6: Format and populate textarea with vectors (store words and metadata separately)
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

        // Rebuild Cayley graph if it's currently visible
        const cayleyGraphBtn = document.getElementById('show-cayley-graph');
        if (cayleyGraphBtn && cayleyGraphBtn.classList.contains('active')) {
            const wordLength = parseInt(document.getElementById('wordLength')?.value) || 4;
            console.log('Rebuilding Cayley graph after matrix generation...');
            buildCayleyGraph(matrices, wordLength, scene, PSL2CtoSDF, _facesMetaById, _paletteMode);
            console.log('Cayley graph rebuilt');
        }

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
    // Use pixelRatio=1 for much better performance (4x speedup on Retina displays)
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.6;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222233, 0.8);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(3, 3, 5);
    scene.add(dirLight);

    // Initialize uniforms first so they can be shared
    const initialSphereCenters = Array.from({ length: MAX_PLANES_CONST }, () => new THREE.Vector3());
    const initialSphereRadii = new Float32Array(MAX_PLANES_CONST);
    const initialPlaneNormals = Array.from({ length: MAX_PLANES_CONST }, () => new THREE.Vector3());

    uniforms = {
        u_resolution: { value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height) },
        u_cameraPosition: { value: camera.position },
        u_inverseViewProjectionMatrix: { value: new THREE.Matrix4() },
        u_viewProjectionMatrix: { value: new THREE.Matrix4() },
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
        u_selected_vertex_pos: { value: new THREE.Vector3(0, 0, 0) },
        u_selected_vertex_radius: { value: 0.0 },
        u_polyhedron_opacity: { value: 1.0 },
        u_boundary_mode: { value: 0.0 }, // 0 = full glass, 1 = inside only (cross-hatch)
    };

    // Boundary Shader
    // Renders the part of the sphere at infinity that is INSIDE the polyhedron
    // with a cross-hatched pattern.
    const boundaryVertexShader = `
        varying vec3 vPos;
        varying vec2 vUv;
        void main() {
            vPos = position;
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const boundaryFragmentShader = `
        varying vec3 vPos;
        varying vec2 vUv;
        uniform vec3 u_sphere_centers[${MAX_PLANES_CONST}];
        uniform float u_sphere_radii[${MAX_PLANES_CONST}];
        uniform vec3 u_plane_normals[${MAX_PLANES_CONST}];
        uniform int u_num_sphere_planes;
        uniform int u_num_euclidean_planes;
        uniform float u_boundary_mode; // 0 = full glass, 1 = inside only (not used here, controlled by JS)

        void main() {
            float maxSdf = -10000.0;
            
            // Spheres: inside if dist > r (exterior of bisector sphere)
            for (int i = 0; i < ${MAX_PLANES_CONST}; i++) {
                if (i >= u_num_sphere_planes) break;
                vec3 c = u_sphere_centers[i];
                float r = u_sphere_radii[i];
                float d = r - length(vPos - c);
                if (d > maxSdf) maxSdf = d;
            }
            
            // Planes: inside if dot(p, n) < 0
            for (int i = 0; i < ${MAX_PLANES_CONST}; i++) {
                if (i >= u_num_euclidean_planes) break;
                vec3 n = u_plane_normals[i];
                float d = dot(vPos, n);
                if (d > maxSdf) maxSdf = d;
            }
            
            // Base color
            vec3 color = vec3(0.53, 0.66, 1.0); // #88aaff
            float alpha = 0.3;
            
            // Lighting
            vec3 normal = normalize(vPos);
            vec3 light = normalize(vec3(1.0, 1.0, 1.0));
            float diff = max(dot(normal, light), 0.3);
            
            if (maxSdf < 0.0) {
                // Inside polyhedron: Cross-hatch pattern
                // Use UV coordinates or position for hatching
                // Simple grid based on UV
                float scale = 40.0;
                float lineThickness = 0.1;
                float gridX = step(1.0 - lineThickness, fract(vUv.x * scale));
                float gridY = step(1.0 - lineThickness, fract(vUv.y * scale));
                float grid = max(gridX, gridY);
                
                if (grid > 0.5) {
                    // Hatch lines are opaque(r)
                    gl_FragColor = vec4(color * 1.2, 0.8);
                } else {
                    // Space between lines is transparent
                    gl_FragColor = vec4(color * (0.6 + 0.4 * diff), 0.2);
                }
            } else {
                // Outside polyhedron: Standard glass look
                gl_FragColor = vec4(color * (0.6 + 0.4 * diff), 0.15);
            }
        }
    `;

    const boundaryMat = new THREE.ShaderMaterial({
        vertexShader: boundaryVertexShader,
        fragmentShader: boundaryFragmentShader,
        uniforms: uniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const sphereGeom = new THREE.SphereGeometry(1, 64, 64);
    boundarySphere = new THREE.Mesh(sphereGeom, boundaryMat);
    boundarySphere.renderOrder = 0;

    // Load shaders from external files for the main polyhedron
    const vertexShaderResponse = await fetch('./shaders/vertex.glsl');
    const fragmentShaderResponse = await fetch('./shaders/fragment.glsl');
    const vertexShader = await vertexShaderResponse.text();
    const fragmentShader = await fragmentShaderResponse.text();

    material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: true,  // Enable depth writing for proper occlusion
        depthTest: true,
    });

    const hyperbolicGroup = new THREE.Group();
    hyperbolicGroup.add(boundarySphere);
    // Use a large box instead of a quad to allow raymarching in VR
    polyhedronQuad = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), material);
    polyhedronQuad.material.side = THREE.BackSide; // Render from inside the box
    polyhedronQuad.renderOrder = 1;
    hyperbolicGroup.add(polyhedronQuad);
    hyperbolicGroup.position.set(0, 0, 0);
    scene.add(hyperbolicGroup);

    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);

    setupEventHandlers();
    await setupUI();
    renderer.setAnimationLoop(animate);
}

function setupEventHandlers() {
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('resize', () => {
        const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
        renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
    });

    // Refresh button - calls appropriate render function based on active tab
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const groupTab = document.getElementById('tab-group');
            const polyhedronTab = document.getElementById('tab-polyhedron');

            if (groupTab && groupTab.classList.contains('active')) {
                // Group tab - generate from matrices
                updateFromMatrices();
            } else if (polyhedronTab && polyhedronTab.classList.contains('active')) {
                // Polyhedron tab - render from vectors
                updateFromInput();
            }
        });
    }

    // Keep old button handlers for backward compatibility
    const renderBtn = document.getElementById('render-btn');
    if (renderBtn) {
        renderBtn.addEventListener('click', updateFromInput);
    }

    // Export .3MF button
    const export3mfBtn = document.getElementById('export-3mf-btn');
    if (export3mfBtn) {
        export3mfBtn.addEventListener('click', () => {
            if (_currentSphereCenters.length === 0 && _currentPlaneNormals.length === 0) {
                alert('Please render a polyhedron first before exporting.');
                return;
            }
            exportPolyhedronAs3MF(_currentSphereCenters, _currentSphereRadii, _currentPlaneNormals);
        });
    }

    // Certificate generation button
    const certBtn = document.getElementById('generate-certificate-btn');
    if (certBtn) {
        certBtn.addEventListener('click', async () => {
            const output = document.getElementById('certificate-output');
            const status = document.getElementById('cert-status');
            const details = document.getElementById('cert-details');

            if (output) output.classList.remove('hidden');
            if (status) status.textContent = "Running analysis...";
            if (details) details.textContent = "";

            // Get matrices
            const matrices = _currentMatrices;
            if (!matrices || matrices.length === 0) {
                if (status) status.textContent = "Error: No matrices defined.";
                return;
            }

            try {
                // Import Certifier dynamically
                const { PoincareCertifier } = await import('./poincareCertifier.js');
                const wordLength = parseInt(document.getElementById('wordLength')?.value) || 3;

                const certifier = new PoincareCertifier(matrices, wordLength);
                const result = await certifier.run();

                if (result.success) {
                    if (status) {
                        status.textContent = "SUCCESS: Poincaré Polyhedron Theorem satisfied.";
                        status.className = "text-sm font-bold mb-2 text-green-400";
                    }
                    if (details) details.textContent = result.details || result.log.join('\n');
                } else {
                    if (status) {
                        status.textContent = "FAILURE: Conditions not met.";
                        status.className = "text-sm font-bold mb-2 text-red-400";
                    }
                    if (details) details.textContent = (result.error || "") + "\n\nLog:\n" + result.log.join('\n');
                }

            } catch (e) {
                console.error(e);
                if (status) status.textContent = "Error running certification.";
                if (details) details.textContent = e.toString();
            }
        });
    }

    // Polyhedron slider (draggable opacity control)
    const polyhedronSlider = document.getElementById('show-polyhedron');
    if (polyhedronSlider) {
        const fill = polyhedronSlider.querySelector('.polyhedron-slider-fill');
        let isDragging = false;

        function updateOpacity(clientX) {
            const rect = polyhedronSlider.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            let opacity = x / rect.width;

            // Snap to 0 or 1 at edges
            if (opacity < 0.05) opacity = 0;
            if (opacity > 0.95) opacity = 1;

            fill.style.width = (opacity * 100) + '%';
            uniforms.u_polyhedron_opacity.value = opacity;
            polyhedronQuad.visible = opacity > 0;
        }

        // Initialize
        const initialOpacity = parseFloat(polyhedronSlider.getAttribute('data-opacity')) || 1;
        fill.style.width = (initialOpacity * 100) + '%';
        uniforms.u_polyhedron_opacity.value = initialOpacity;
        polyhedronQuad.visible = initialOpacity > 0;

        polyhedronSlider.addEventListener('mousedown', (e) => {
            isDragging = true;
            updateOpacity(e.clientX);
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                updateOpacity(e.clientX);
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // Auto-rotate button
    const autoRotateBtn = document.getElementById('auto-rotate');
    if (autoRotateBtn) {
        autoRotateBtn.addEventListener('click', () => {
            autoRotateBtn.classList.toggle('active');
            controls.autoRotate = autoRotateBtn.classList.contains('active');
        });
    }

    // Boundary toggle button
    const boundaryToggleBtn = document.getElementById('toggle-boundary');
    if (boundaryToggleBtn) {
        // Start with boundary visible (has 'active' class in HTML)
        boundarySphere.visible = boundaryToggleBtn.classList.contains('active');
        boundaryToggleBtn.addEventListener('click', () => {
            boundaryToggleBtn.classList.toggle('active');
            boundarySphere.visible = boundaryToggleBtn.classList.contains('active');
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

            // Rebuild Cayley graph with new colors if visible
            const cayleyGraphBtn = document.getElementById('show-cayley-graph');
            if (cayleyGraphBtn && cayleyGraphBtn.classList.contains('active') && _currentMatrices.length > 0) {
                const wordLength = parseInt(document.getElementById('wordLength')?.value) || 4;
                console.log('Rebuilding Cayley graph with new palette...');
                buildCayleyGraph(_currentMatrices, wordLength, scene, PSL2CtoSDF, _facesMetaById, _paletteMode);
            }
        });
    }

    // Cayley graph toggle button
    const cayleyGraphBtn = document.getElementById('show-cayley-graph');
    if (cayleyGraphBtn) {
        cayleyGraphBtn.addEventListener('click', () => {
            cayleyGraphBtn.classList.toggle('active');
            const isActive = cayleyGraphBtn.classList.contains('active');

            if (isActive) {
                // Build and show Cayley graph
                const matrices = getMatricesFromUI();
                if (matrices.length === 0) {
                    alert('Please add matrices first before showing the Cayley graph.');
                    cayleyGraphBtn.classList.remove('active');
                    return;
                }

                if (typeof PSL2CtoSDF === 'undefined' || !PSL2CtoSDF) {
                    alert('PSL2CtoSDF.js is required for Cayley graph visualization.');
                    cayleyGraphBtn.classList.remove('active');
                    return;
                }

                const wordLength = parseInt(document.getElementById('wordLength')?.value) || 4;
                console.log('Building Cayley graph with word length:', wordLength);
                buildCayleyGraph(matrices, wordLength, scene, PSL2CtoSDF, _facesMetaById, _paletteMode);
                console.log('Cayley graph build complete');
            } else {
                // Hide Cayley graph
                toggleCayleyGraph(false);
                console.log('Cayley graph hidden');
            }
        });
    }

    // View model toggle buttons (3-way toggle)
    const viewPoincareBtn = document.getElementById('view-poincare');
    const viewUpperHalfspaceBtn = document.getElementById('view-upper-halfspace');
    const viewInsideBtn = document.getElementById('view-inside');

    if (viewPoincareBtn && viewUpperHalfspaceBtn && viewInsideBtn) {
        const viewButtons = [viewPoincareBtn, viewUpperHalfspaceBtn, viewInsideBtn];

        viewPoincareBtn.addEventListener('click', () => {
            // Remove active from all buttons
            viewButtons.forEach(btn => btn.classList.remove('active'));
            // Set this one active
            viewPoincareBtn.classList.add('active');

            // TODO: Implement Poincaré ball view
            // - This is the default view (already implemented)
            // - Camera looks at the unit ball from outside
            // - Geometry is rendered using the ball model
            console.log('Poincaré ball view selected');
        });

        viewUpperHalfspaceBtn.addEventListener('click', () => {
            // Remove active from all buttons
            viewButtons.forEach(btn => btn.classList.remove('active'));
            // Set this one active
            viewUpperHalfspaceBtn.classList.add('active');

            // TODO: Implement upper half-space view
            // - Apply the Cayley transform to convert ball → half-space
            // - Map sphere boundary at z=0 to horizontal plane
            // - Interior of ball → upper half-space (z > 0)
            // - Transform all geometry (vertices, faces) using:
            //   (x,y,z) in ball → (x',y',z') in half-space where
            //   x' = 2x/(1-z), y' = 2y/(1-z), z' = (1+z)/(1-z)
            // - Update camera position to look down at half-space
            // - Modify shader to use half-space distance functions
            console.log('Upper half-space view selected (not yet implemented)');
        });

        viewInsideBtn.addEventListener('click', () => {
            // Remove active from all buttons
            viewButtons.forEach(btn => btn.classList.remove('active'));
            // Set this one active
            viewInsideBtn.classList.add('active');

            // TODO: Implement inside view
            // - Move camera inside the Poincaré ball (near center)
            // - Enable first-person navigation controls
            // - Reverse face culling so we see inside of polyhedron
            // - Optionally: use VR-style stereoscopic rendering
            // - Faces appear as "walls" from inside
            // - May need to adjust fog/depth settings for immersive feel
            console.log('Inside view selected (not yet implemented)');
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
            hideEdgeLabel3D();
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
                    hideEdgeLabel3D();
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
            hideFaceLabel3D();
            hideEdgeLabel3D();
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
            const nice = formatAngle(theta);

            if (edgeOut) {
                edgeOut.textContent = `Edge: faces ${lastClickedFaceIdCanvas} & ${hitId} — hyperbolic dihedral angle ≈ ${nice}`;
            }

            let cycleInfo = null;
            const cyc = computeEdgeCycleByPairings(lastClickedFaceIdCanvas, hitId, _facesMetaById);
            if (cyc && cyc.length && isFinite(theta)) {
                const list = Array.from({ length: cyc.length }, () => formatAngle(theta));
                const total = cyc.length * theta;
                const niceTotal = formatAngle(total);
                const cycleText = `Cycle length ${cyc.length}; total = ${niceTotal}`;
                cycleInfo = cycleText;
                if (edgeOut) {
                    edgeOut.textContent += ` — ${cycleText}`;
                }
            }

            uniforms.u_selected_edge_faces.value.set(lastClickedFaceIdCanvas, hitId);
            hideFaceLabel3D();

            // Show 3D edge label on the edge
            const edgePoint = findEdgePoint(lastClickedFaceIdCanvas, hitId, p);
            if (edgePoint) {
                showEdgeLabel3D(lastClickedFaceIdCanvas, hitId, nice, cycleInfo, edgePoint, camera, renderer);
            }

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

        // Show 3D label on polyhedron - use actual hit point from click
        hideEdgeLabel3D();
        showFaceLabel3D(hitId, _facesMetaById, p, camera, renderer);
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
            const nice = formatAngle(theta);

            if (edgeOut) {
                edgeOut.textContent = `Edge: faces ${lastClickedFaceId} & ${faceId} — hyperbolic dihedral angle ≈ ${nice}`;
            }

            let cycleInfo = null;
            const cyc = computeEdgeCycleByPairings(lastClickedFaceId, faceId, _facesMetaById);
            if (cyc && cyc.length && isFinite(theta)) {
                const list = Array.from({ length: cyc.length }, () => formatAngle(theta));
                const total = cyc.length * theta;
                const niceTotal = formatAngle(total);
                const cycleText = `Cycle length ${cyc.length}; total = ${niceTotal}`;
                cycleInfo = cycleText;
                if (edgeOut) {
                    edgeOut.textContent += ` — ${cycleText}`;
                }
            }

            uniforms.u_selected_edge_faces.value.set(lastClickedFaceId, faceId);
            hideFaceLabel3D();

            // Show 3D edge label on the edge
            const edgePoint = findEdgePoint(lastClickedFaceId, faceId);
            if (edgePoint) {
                showEdgeLabel3D(lastClickedFaceId, faceId, nice, cycleInfo, edgePoint, camera, renderer);
            }

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
            hideEdgeLabel3D();
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
        updateFromInput();
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
    if (controls && !renderer.xr.isPresenting) controls.update();

    // Update u_cameraPosition for both VR and Desktop
    uniforms.u_cameraPosition.value.copy(camera.position);

    camera.updateMatrixWorld();
    _inverseViewProjectionMatrix.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    uniforms.u_inverseViewProjectionMatrix.value.copy(_inverseViewProjectionMatrix);

    // Compute viewProjectionMatrix for depth writing
    _viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.u_viewProjectionMatrix.value.copy(_viewProjectionMatrix);

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

    // Update 3D label positions if visible (Desktop only usually)
    if (!renderer.xr.isPresenting) {
        const currentLabelId = getCurrentLabelFaceId();
        if (currentLabelId >= 0) {
            const faceCenter = getFaceCenter(currentLabelId);
            if (faceCenter) {
                updateFaceLabelPosition(faceCenter, camera, renderer);
            }
        }

        const currentEdgePos = getCurrentEdgeLabelPosition();
        if (currentEdgePos) {
            updateEdgeLabelPosition(currentEdgePos, camera, renderer);
        }
    }

    renderer.render(scene, camera);
}

// Start the application
init();
