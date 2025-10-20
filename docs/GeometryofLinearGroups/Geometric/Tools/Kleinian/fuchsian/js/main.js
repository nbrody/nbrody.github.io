/**
 * Main application module: 2D Canvas rendering for Poincaré Disk
 */

import { PoincareRenderer } from './renderer2D.js';
import {
    getExternalVectorsPayload,
    getExternalFacesPayload,
    normalizeFacesMeta,
    vectorsToTextarea,
    computeEdgeCycleByPairings,
    formatAngle
} from './utils.js';
import { renderGutter, highlightGutterFaces, showFaceMeta, setupPager, setupPanelToggle } from './ui.js';
import { setupMatrixInput, getMatricesFromUI, Complex } from './matrixInput.js';
import { generateGroupElements } from './dirichletUtils.js';


// Constants
const MAX_PLANES_CONST = 256;

// Default vectors for initial render (2D hyperbolic space)
const defaultVectors = [
    " 2, 0, -1",
    "-2, 0, -1",
    " 0, 2, -1",
    " 0,-2, -1",
].join('\n');

// Global state
let renderer;
let _currentSphereCenters = [];
let _currentSphereRadii = [];
let _currentPlaneNormals = [];
let _currentFaceIdsByLine = [];
let _currentWordsByLine = []; // Store word metadata for each line
let _generatedWords = []; // Store words from matrix generation (not displayed in textarea)
let _facesMetaById = [];
let _paletteMode = 0;
let _currentCovectors = []; // Store covectors for vertex computation

// Simple 2D vector class
class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    clone() {
        return new Vec2(this.x, this.y);
    }
}

// Helper function: Check if a point satisfies an SDF constraint
function satisfiesSDF(point, cov, eps = 1e-6) {
    const [x, y] = point;
    const [vx, vy, vw] = cov;

    const nSq = vx * vx + vy * vy;
    const wSq = vw * vw;

    if (Math.abs(vw) < 1e-6) {
        // Line through origin: normal·point <= 0 means in half-space
        const dot = vx * x + vy * y;
        return dot <= eps;
    } else {
        // Circle: point must be outside the circle
        const cx = vx / vw;
        const cy = vy / vw;
        const r = Math.sqrt(nSq / wSq - 1);
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        const rSq = r * r;
        return distSq >= rSq - eps;
    }
}

// Helper function: Check if a geodesic has a point in the fundamental domain
// AND passes through the INTERIOR of the disk (not just touching the boundary)
function hasPointInFundamentalDomain(targetCov, allCovectors, faceIndices, targetIdx) {
    const [vx, vy, vw] = targetCov;
    const eps = 1e-6;
    const boundaryEps = 1e-3; // Points must be strictly inside, not near boundary

    // Sample points along the geodesic
    const numSamples = 100;

    if (Math.abs(vw) < 1e-6) {
        // Line through origin
        const dx = -vy;
        const dy = vx;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) return false;

        const dirX = dx / len;
        const dirY = dy / len;

        // Sample along the line from -1 to +1
        for (let i = 0; i <= numSamples; i++) {
            const t = -1 + (2 * i / numSamples);
            const px = t * dirX;
            const py = t * dirY;

            // Check if STRICTLY in interior of unit disk
            const r = Math.sqrt(px * px + py * py);
            if (r >= 1.0 - boundaryEps) continue; // Must be in interior, not on boundary

            // Check if this point is in the fundamental domain
            let inDomain = true;
            for (const idx of faceIndices) {
                if (idx === targetIdx) continue; // Skip the target SDF itself

                const cov = allCovectors[idx];
                if (!satisfiesSDF([px, py], cov, eps)) {
                    inDomain = false;
                    break;
                }
            }

            if (inDomain) return true;
        }
    } else {
        // Circle
        const cx = vx / vw;
        const cy = vy / vw;
        const nSq = vx * vx + vy * vy;
        const wSq = vw * vw;
        const r = Math.sqrt(nSq / wSq - 1);

        // Sample around the circle
        for (let i = 0; i <= numSamples; i++) {
            const angle = (i / numSamples) * 2 * Math.PI;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);

            // Check if STRICTLY in interior of unit disk
            const diskR = Math.sqrt(px * px + py * py);
            if (diskR >= 1.0 - boundaryEps) continue; // Must be in interior, not on boundary

            // Check if this point is in the fundamental domain
            let inDomain = true;
            for (const idx of faceIndices) {
                if (idx === targetIdx) continue; // Skip the target SDF itself

                const cov = allCovectors[idx];
                if (!satisfiesSDF([px, py], cov, eps)) {
                    inDomain = false;
                    break;
                }
            }

            if (inDomain) return true;
        }
    }

    return false;
}

// Parse input and update renderer
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

    const lineKinds = [];
    const lineLocalIdx = [];
    const wordsByLine = [];
    const covRowsByLine = []; // raw covectors [x,y,t], oriented with t<=0
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
            if (!(typeof PSL2RtoSDF !== 'undefined' && PSL2RtoSDF)) {
                errorMessage.textContent = `Matrix input requires PSL2RtoSO21.js to be loaded.`;
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
                const so21 = PSL2RtoSDF.PSL2RtoSO21(a, b, c, d);
                let cov;
                try {
                    const result = PSL2RtoSDF.sDF_autoFromSO21(so21);
                    cov = result?.row || null;
                } catch (e) {
                    cov = null;
                }
                // Fallback to Dirichlet bisector if needed
                if (!cov || !Array.isArray(cov) || cov.length !== 3 || cov.some(v => !Number.isFinite(v)) ||
                    (Math.abs(cov[0]) + Math.abs(cov[1]) + Math.abs(cov[2]) < 1e-12)) {
                    let yx = 0, yy = 0, yw = 1;
                    if (Array.isArray(so21) && so21.length === 3 && Array.isArray(so21[0])) {
                        yx = so21[0][2]; yy = so21[1][2]; yw = so21[2][2];
                    } else if (Array.isArray(so21) && so21.length === 9) {
                        yx = so21[2]; yy = so21[5]; yw = so21[8];
                    }
                    cov = [0 - yx, 0 - yy, 1 - yw];
                }
                if (!cov || cov.length !== 3 || cov.some(v => !Number.isFinite(v))) {
                    throw new Error('Invalid sDF from PSL2RtoSO21');
                }
                let [vx, vy, vw] = cov;
                if (vw > 0) { vx = -vx; vy = -vy; vw = -vw; }
                // Validate spacelike then store raw row
                const nSq = vx * vx + vy * vy;
                const wSq = vw * vw;
                if (nSq <= wSq) {
                    errorMessage.textContent = `Matrix-derived vector is not spacelike.`;
                    renderGutter(lines.length, null, null, _paletteMode);
                    return;
                }
                covRowsByLine.push([vx, vy, vw]);
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

        // Default: parse as [x, y, t]
        const coords = cleanLine.split(',').map(s => parseFloat(s.trim()));
        if (coords.length !== 3 || coords.some(isNaN)) {
            errorMessage.textContent = `Invalid format: "${cleanLine}" (expected x, y, t)`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        const [vx, vy, vw] = coords;
        if (vw > 0) {
            errorMessage.textContent = `Final coordinate must be nonpositive (t <= 0).`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        const nSq = vx * vx + vy * vy;
        const wSq = vw * vw;

        if (nSq <= wSq) {
            errorMessage.textContent = `Vector is not spacelike (x² + y² must be > t²).`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        covRowsByLine.push([vx, vy, vw]);
        wordsByRawLine.push(word);
        lineKinds.push('raw');
        lineLocalIdx.push(covRowsByLine.length - 1);
        wordsByLine.push(word);
    }

    // Filter covectors by strict support
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

    // Rebuild sphere/plane arrays from survivors only
    const sphereCentersFiltered = [];
    const sphereRadiiFiltered = [];
    const planeNormalsFiltered = [];
    const faceMatricesFiltered = [];
    const faceIdsByLine = new Array(lines.length).fill(undefined);

    const idxSet = new Set(survivorsIdx);
    const rawIndexToFaceId = new Map();
    for (const iRaw of survivorsIdx) {
        const row = covRowsByLine[iRaw];
        let [ax, ay, aw] = row;
        if (aw > 0) { ax = -ax; ay = -ay; aw = -aw; }
        const nSq = ax * ax + ay * ay;
        const wSq = aw * aw;
        if (Math.abs(aw) < 1e-6) {
            // Line through origin in 2D disk: store unit normal
            if (nSq < 1e-12) continue; // skip degenerate
            const fid = sphereCentersFiltered.length + planeNormalsFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            const norm = Math.sqrt(nSq);
            planeNormalsFiltered.push(new Vec2(ax / norm, ay / norm));
            faceMatricesFiltered.push(null); // No matrix data from vector input
        } else {
            // Circle in 2D disk: center = (ax/aw, ay/aw), radius = sqrt(nSq/wSq - 1)
            if (nSq <= wSq) continue; // skip non-spacelike (safety)
            const center = new Vec2(ax / aw, ay / aw);
            const r = Math.sqrt(nSq / wSq - 1);
            const fid = sphereCentersFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            sphereCentersFiltered.push(center);
            sphereRadiiFiltered.push(r);
            faceMatricesFiltered.push(null); // No matrix data from vector input
        }
    }

    // Map original lines to face ids
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
    _currentSphereCenters = sphereCentersFiltered;
    _currentSphereRadii = sphereRadiiFiltered;
    _currentPlaneNormals = planeNormalsFiltered;
    _currentFaceIdsByLine = faceIdsByLine.slice();
    _currentWordsByLine = wordsByLine.slice();

    // Update renderer
    if (renderer) {
        renderer.setGeometry(_currentSphereCenters, _currentSphereRadii, _currentPlaneNormals, faceMatricesFiltered);
        renderer.paletteMode = _paletteMode;
        renderer.render();
    }

    renderGutter(lines.length, faceIdsByLine, wordsByLine, _paletteMode);
    const metaElR = document.getElementById('selected-face-meta');
    if (metaElR) metaElR.textContent = '';
}

// Convert matrices to vector format
async function updateFromMatrices() {
    const errorMessage = document.getElementById('matrix-error-message');
    if (errorMessage) errorMessage.textContent = '';

    try {
        const matrices = getMatricesFromUI();
        if (matrices.length === 0) {
            if (errorMessage) errorMessage.textContent = 'Please add at least one matrix.';
            return;
        }

        // Check if PSL2RtoSDF is available
        if (typeof PSL2RtoSDF === 'undefined' || !PSL2RtoSDF) {
            if (errorMessage) errorMessage.textContent = 'PSL2RtoSO21.js is required for matrix conversion.';
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

        // Step 2: Convert ALL group elements to covectors
        console.log('Converting all group elements to covectors...');
        const allCovectors = [];
        const allWords = [];
        const allSO21Matrices = [];

        for (const item of groupElements) {
            const mat = item.m;
            const word = item.word || '';

            const a = mat.a.re;
            const b = mat.b.re;
            const c = mat.c.re;
            const d = mat.d.re;

            const so21 = PSL2RtoSDF.PSL2RtoSO21(a, b, c, d);
            let cov;
            try {
                const result = PSL2RtoSDF.sDF_autoFromSO21(so21);
                cov = result?.row || null;
            } catch (e) {
                cov = null;
            }

            // Fallback to Dirichlet bisector if needed
            if (!cov || !Array.isArray(cov) || cov.length !== 3 || cov.some(v => !Number.isFinite(v)) ||
                (Math.abs(cov[0]) + Math.abs(cov[1]) + Math.abs(cov[2]) < 1e-12)) {
                let yx = 0, yy = 0, yw = 1;
                if (Array.isArray(so21) && so21.length === 3 && Array.isArray(so21[0])) {
                    yx = so21[0][2]; yy = so21[1][2]; yw = so21[2][2];
                } else if (Array.isArray(so21) && so21.length === 9) {
                    yx = so21[2]; yy = so21[5]; yw = so21[8];
                }
                cov = [0 - yx, 0 - yy, 1 - yw];
            }

            if (!cov || cov.length !== 3 || cov.some(v => !Number.isFinite(v))) {
                console.warn('Invalid sDF for group element', word);
                continue;
            }

            let [vx, vy, vw] = cov;
            if (vw > 0) { vx = -vx; vy = -vy; vw = -vw; }

            allCovectors.push([vx, vy, vw]);
            allWords.push(word);
            allSO21Matrices.push(so21);
        }

        console.log(`Converted ${allCovectors.length} group elements to covectors`);

        // Step 3: Filter covectors to keep only face-defining ones
        console.log('Filtering face-defining covectors...');
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

        // Step 4: Filter to only standard generators (geodesics that touch the fundamental domain)
        console.log('Filtering to standard generators only...');
        const standardGeneratorIndices = [];

        for (const idx of faceIndices) {
            const cov = allCovectors[idx];
            const [vx, vy, vw] = cov;

            // Check if this geodesic has a point on the fundamental domain
            // by testing if there exists a point P where:
            // - This SDF is zero: F(P) = 0
            // - All other SDFs are non-negative (in fundamental domain)

            if (hasPointInFundamentalDomain(cov, allCovectors, faceIndices, idx)) {
                standardGeneratorIndices.push(idx);
            }
        }

        console.log(`Found ${standardGeneratorIndices.length} standard generators out of ${faceIndices.length} faces`);

        if (standardGeneratorIndices.length === 0) {
            if (errorMessage) {
                errorMessage.textContent = 'No standard generators found. Try increasing word length.';
            }
            return;
        }

        // Step 5: Build vectorsWithMeta from standard generators only
        const vectorsWithMeta = standardGeneratorIndices.map(idx => ({
            vector: allCovectors[idx],
            word: allWords[idx],
            matrix: allSO21Matrices[idx]
        }));

        // Step 6: Format and populate page 2 with vectors
        const vectorsEl = document.getElementById('vectors');
        if (vectorsEl) {
            const lines = vectorsWithMeta.map(item => {
                const [vx, vy, vw] = item.vector;
                return `${vx.toFixed(6)}, ${vy.toFixed(6)}, ${vw.toFixed(6)}`;
            });
            vectorsEl.value = lines.join('\n');

            // Store words separately (not in textarea)
            _generatedWords = vectorsWithMeta.map(item => item.word);

            await updateFromInput(false);

            // After updateFromInput has run and assigned face IDs, populate _facesMetaById
            // and update renderer with matrix data
            _facesMetaById = [];
            const faceMatrices = [];

            for (let lineIdx = 0; lineIdx < vectorsWithMeta.length; lineIdx++) {
                const faceId = _currentFaceIdsByLine[lineIdx];
                if (faceId !== undefined) {
                    _facesMetaById[faceId] = {
                        word: vectorsWithMeta[lineIdx].word,
                        matrix: vectorsWithMeta[lineIdx].matrix
                    };
                    // Ensure faceMatrices array is large enough
                    while (faceMatrices.length <= faceId) {
                        faceMatrices.push(null);
                    }
                    faceMatrices[faceId] = vectorsWithMeta[lineIdx].matrix;
                }
            }

            // Update renderer with matrix data
            if (renderer) {
                renderer.setGeometry(_currentSphereCenters, _currentSphereRadii, _currentPlaneNormals, faceMatrices);
                renderer.paletteMode = _paletteMode;
                renderer.render();
            }

            // Compute and display vertex angle sums
            displayVertexAngleSums();
        }

        console.log(`Successfully generated ${vectorsWithMeta.length} vectors with metadata`);

    } catch (e) {
        console.error(e);
        if (errorMessage) {
            errorMessage.textContent = e.message || 'Error processing matrices.';
        }
    }
}

// Initialize canvas renderer
async function init() {
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('container');

    // Set canvas size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Create renderer
    renderer = new PoincareRenderer(canvas);

    // Listen for face selection events from renderer
    canvas.addEventListener('faceSelected', (e) => {
        const faceId = e.detail.faceId;
        const mappedFaceId = e.detail.mappedFaceId;
        handleFaceSelection(faceId, mappedFaceId);
    });

    // Listen for angle calculation events
    canvas.addEventListener('angleBetweenFaces', (e) => {
        const { faceId1, faceId2 } = e.detail;
        handleAngleCalculation(faceId1, faceId2);
    });

    // Listen for vertex selection events
    canvas.addEventListener('vertexSelected', (e) => {
        const vertexId = e.detail.vertexId;
        handleVertexSelection(vertexId);
    });

    setupEventHandlers();
    await setupUI();
}

function handleFaceSelection(faceId, mappedFaceId = -1) {
    const normalOut = document.getElementById('selected-face-normal');
    const lineIndex = _currentFaceIdsByLine.findIndex(fid => fid === faceId);
    let vecText = "";
    if (lineIndex !== -1) {
        const lines = (document.getElementById('vectors').value || "").split('\n').filter(l => l.trim() !== "");
        vecText = lines[lineIndex].trim();
    }

    if (normalOut) {
        if (vecText) {
            normalOut.textContent = `Face: [${vecText}]`;
        } else {
            normalOut.textContent = `Face ${faceId}`;
        }
    }

    showFaceMeta(faceId, lineIndex, _facesMetaById);
    highlightGutterFaces([faceId], _currentFaceIdsByLine);

    const edgeOut = document.getElementById('selected-edge');
    if (edgeOut) {
        if (mappedFaceId >= 0) {
            const mappedLineIndex = _currentFaceIdsByLine.findIndex(fid => fid === mappedFaceId);
            const mappedWord = _facesMetaById[mappedFaceId]?.word || `Face ${mappedFaceId}`;
            edgeOut.textContent = `This geodesic maps to: ${mappedWord}`;
        } else {
            edgeOut.textContent = '';
        }
    }
}

// Calculate angle between two geodesics
function calculateAngleBetweenGeodesics(faceId1, faceId2) {
    const numSpheres = _currentSphereCenters.length;

    // Get geodesic data for both faces
    let geo1, geo2;

    if (faceId1 < numSpheres) {
        geo1 = { type: 'circle', center: _currentSphereCenters[faceId1], radius: _currentSphereRadii[faceId1] };
    } else {
        geo1 = { type: 'line', normal: _currentPlaneNormals[faceId1 - numSpheres] };
    }

    if (faceId2 < numSpheres) {
        geo2 = { type: 'circle', center: _currentSphereCenters[faceId2], radius: _currentSphereRadii[faceId2] };
    } else {
        geo2 = { type: 'line', normal: _currentPlaneNormals[faceId2 - numSpheres] };
    }

    // Find intersection points
    const intersections = findGeodesicIntersections(geo1, geo2);

    if (intersections.length === 0) {
        return null; // No intersection
    }

    // Use the first intersection point (they're in the unit disk)
    const intersection = intersections[0];

    // Calculate tangent vectors at intersection
    const tangent1 = getTangentVector(geo1, intersection);
    const tangent2 = getTangentVector(geo2, intersection);

    if (!tangent1 || !tangent2) return null;

    // Calculate angle between tangents
    const dot = tangent1.x * tangent2.x + tangent1.y * tangent2.y;
    const mag1 = Math.sqrt(tangent1.x * tangent1.x + tangent1.y * tangent1.y);
    const mag2 = Math.sqrt(tangent2.x * tangent2.x + tangent2.y * tangent2.y);

    const cosAngle = dot / (mag1 * mag2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    const angleDeg = angleRad * 180 / Math.PI;

    return { angleRad, angleDeg, intersection };
}

// Find intersection points between two geodesics
function findGeodesicIntersections(geo1, geo2) {
    const intersections = [];
    const eps = 1e-9;

    if (geo1.type === 'line' && geo2.type === 'line') {
        // Two lines through origin: only intersect at origin
        intersections.push({ x: 0, y: 0 });
    } else if (geo1.type === 'line' && geo2.type === 'circle') {
        // Line and circle
        const { normal } = geo1;
        const { center, radius } = geo2;

        // Line: normal.x * x + normal.y * y = 0
        // Circle: (x - cx)^2 + (y - cy)^2 = r^2

        // Parametric line: (t * (-normal.y), t * normal.x)
        const dx = -normal.y;
        const dy = normal.x;

        // Substitute into circle equation
        const a = dx * dx + dy * dy;
        const b = 2 * (dx * (-center.x) + dy * (-center.y));
        const c = center.x * center.x + center.y * center.y - radius * radius;

        const discriminant = b * b - 4 * a * c;
        if (discriminant >= -eps) {
            const t1 = (-b + Math.sqrt(Math.max(0, discriminant))) / (2 * a);
            const t2 = (-b - Math.sqrt(Math.max(0, discriminant))) / (2 * a);

            const p1 = { x: t1 * dx, y: t1 * dy };
            const p2 = { x: t2 * dx, y: t2 * dy };

            if (p1.x * p1.x + p1.y * p1.y < 1.0 + eps) intersections.push(p1);
            if (Math.abs(t1 - t2) > eps && p2.x * p2.x + p2.y * p2.y < 1.0 + eps) intersections.push(p2);
        }
    } else if (geo1.type === 'circle' && geo2.type === 'line') {
        return findGeodesicIntersections(geo2, geo1);
    } else if (geo1.type === 'circle' && geo2.type === 'circle') {
        // Two circles
        const { center: c1, radius: r1 } = geo1;
        const { center: c2, radius: r2 } = geo2;

        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < eps || d > r1 + r2 + eps || d < Math.abs(r1 - r2) - eps) {
            return intersections; // No intersection
        }

        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));

        const px = c1.x + a * dx / d;
        const py = c1.y + a * dy / d;

        const p1 = { x: px + h * (-dy) / d, y: py + h * dx / d };
        const p2 = { x: px - h * (-dy) / d, y: py - h * dx / d };

        if (p1.x * p1.x + p1.y * p1.y < 1.0 + eps) intersections.push(p1);
        if (h > eps && p2.x * p2.x + p2.y * p2.y < 1.0 + eps) intersections.push(p2);
    }

    return intersections;
}

// Get tangent vector to geodesic at a point
function getTangentVector(geo, point) {
    if (geo.type === 'line') {
        // Tangent to a line is just the direction of the line
        return { x: -geo.normal.y, y: geo.normal.x };
    } else {
        // Tangent to circle at point p is perpendicular to radius at p
        const { center } = geo;
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        // Perpendicular: (-dy, dx)
        return { x: -dy, y: dx };
    }
}

function handleAngleCalculation(faceId1, faceId2) {
    const result = calculateAngleBetweenGeodesics(faceId1, faceId2);

    const edgeOut = document.getElementById('selected-edge');
    if (!edgeOut) return;

    if (result) {
        const { angleDeg } = result;
        edgeOut.textContent = `Angle between geodesics: ${angleDeg.toFixed(2)}°`;
    } else {
        edgeOut.textContent = 'Geodesics do not intersect in the disk';
    }
}

// Find all vertices of the fundamental domain
function findFundamentalDomainVertices() {
    const vertices = [];
    const numFaces = _currentSphereCenters.length + _currentPlaneNormals.length;
    const eps = 1e-6;

    console.log(`Finding vertices from ${numFaces} faces...`);

    // Check all pairs of geodesics for intersections
    for (let i = 0; i < numFaces; i++) {
        for (let j = i + 1; j < numFaces; j++) {
            const numSpheres = _currentSphereCenters.length;

            let geo1, geo2;
            if (i < numSpheres) {
                geo1 = { type: 'circle', center: _currentSphereCenters[i], radius: _currentSphereRadii[i] };
            } else {
                geo1 = { type: 'line', normal: _currentPlaneNormals[i - numSpheres] };
            }

            if (j < numSpheres) {
                geo2 = { type: 'circle', center: _currentSphereCenters[j], radius: _currentSphereRadii[j] };
            } else {
                geo2 = { type: 'line', normal: _currentPlaneNormals[j - numSpheres] };
            }

            const intersections = findGeodesicIntersections(geo1, geo2);

            for (const pt of intersections) {
                // Check if this point is on the boundary of the fundamental domain
                // It should satisfy equality (distance ~ 0) for faces i and j,
                // and inequality (in half-space) for all other faces

                if (!isOnFundamentalDomainBoundary(pt, i, j)) {
                    continue;
                }

                // Get the word labels for these faces
                const word1 = _facesMetaById[i]?.word || `F${i}`;
                const word2 = _facesMetaById[j]?.word || `F${j}`;

                // This is a vertex of the fundamental domain
                vertices.push({
                    point: pt,
                    faces: [i, j],
                    angle: null,  // Will be computed later
                    label: `(${word1}, ${word2})`  // For debugging
                });

                console.log(`  Found vertex ${vertices.length - 1} at (${pt.x.toFixed(4)}, ${pt.y.toFixed(4)}) on faces ${word1} and ${word2}`);
            }
        }
    }

    // Compute angles at each vertex
    for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i];
        const [f1, f2] = vertex.faces;
        const result = calculateAngleBetweenGeodesics(f1, f2);
        if (result) {
            vertex.angle = result.angleRad;
            console.log(`  Vertex ${i}: angle = ${(vertex.angle * 180 / Math.PI).toFixed(2)}°`);
        }
    }

    return vertices;
}

// Check if a point is on the boundary of the fundamental domain
function isOnFundamentalDomainBoundary(point, face1, face2) {
    const eps = 1e-5;
    const { x, y } = point;

    // Check if point is in unit disk
    const r = Math.sqrt(x * x + y * y);
    if (r >= 1.0 - eps) return false; // On or outside boundary circle

    let onBoundaryCount = 0;

    // Check all faces
    const numSpheres = _currentSphereCenters.length;
    const numFaces = numSpheres + _currentPlaneNormals.length;

    for (let faceId = 0; faceId < numFaces; faceId++) {
        let distToFace;

        if (faceId < numSpheres) {
            // Circle: SDF is distance to center minus radius
            // Fundamental domain is where SDF >= 0 (outside circle)
            const center = _currentSphereCenters[faceId];
            const radius = _currentSphereRadii[faceId];
            const dx = x - center.x;
            const dy = y - center.y;
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            distToFace = distToCenter - radius;
        } else {
            // Line: SDF is -normal·point
            // Fundamental domain is where SDF >= 0, i.e., normal·point <= 0
            const normal = _currentPlaneNormals[faceId - numSpheres];
            distToFace = -(normal.x * x + normal.y * y);
        }

        if (faceId === face1 || faceId === face2) {
            // Should be on this face (distance ~ 0)
            if (Math.abs(distToFace) < eps) {
                onBoundaryCount++;
            } else {
                return false; // Not on expected boundary
            }
        } else {
            // Should be in the half-space (distance >= 0)
            if (distToFace < -eps) {
                return false; // Outside fundamental domain
            }
        }
    }

    return onBoundaryCount === 2;
}

// Apply a matrix to a point in the Poincaré disk
function applyMatrixToDiskPoint(matrix, point) {
    if (!matrix || !point) return null;

    const { x, y } = point;

    // Convert disk point to Minkowski space
    // In the Poincaré disk model, point (x,y) corresponds to Minkowski point
    // using the map: (x,y) -> (x,y,1) normalized to the hyperboloid

    // Actually, we need to use the correct embedding
    // Point (x,y) in the disk corresponds to the Minkowski point:
    // (2x/(1-r²), 2y/(1-r²), (1+r²)/(1-r²)) where r² = x²+y²

    const rSq = x * x + y * y;
    if (rSq >= 1.0) return null;

    const denom = 1 - rSq;
    const mx = 2 * x / denom;
    const my = 2 * y / denom;
    const mt = (1 + rSq) / denom;

    // Apply the matrix via SO(2,1) action
    const a = matrix.a?.re ?? matrix.a;
    const b = matrix.b?.re ?? matrix.b;
    const c = matrix.c?.re ?? matrix.c;
    const d = matrix.d?.re ?? matrix.d;

    // Apply using symmetric matrix conjugation
    const h11 = mt + mx;
    const h12 = my;
    const h22 = mt - mx;

    // Compute g H
    const gh11 = a * h11 + b * h12;
    const gh12 = a * h12 + b * h22;
    const gh21 = c * h11 + d * h12;
    const gh22 = c * h12 + d * h22;

    // Compute g H g^T
    const result11 = gh11 * a + gh12 * c;
    const result12 = gh11 * b + gh12 * d;
    const result22 = gh21 * b + gh22 * d;

    // Extract Minkowski coordinates
    const tPrime = (result11 + result22) / 2;
    const xPrime = (result11 - result22) / 2;
    const yPrime = result12;

    // Convert back to disk coordinates
    // (x,y,t) -> (x/(1+t), y/(1+t))
    const diskX = xPrime / (1 + tPrime);
    const diskY = yPrime / (1 + tPrime);

    return { x: diskX, y: diskY };
}

// Find which vertex a point is closest to
function findClosestVertex(point, vertices) {
    const eps = 1e-3; // Increased tolerance for numerical precision
    let minDist = Infinity;
    let closestIdx = -1;

    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i].point;
        const dx = point.x - v.x;
        const dy = point.y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }

    if (minDist < eps) {
        return closestIdx;
    } else {
        // Log when we can't find a close vertex
        console.log(`  Warning: No vertex found close to (${point.x.toFixed(4)}, ${point.y.toFixed(4)}), closest is ${minDist.toFixed(6)} away`);
        return -1;
    }
}

// Compute vertex cycles under side-pairing
function computeVertexCycles(vertices) {
    const n = vertices.length;
    const visited = new Array(n).fill(false);
    const cycles = [];

    console.log(`Computing vertex cycles for ${n} vertices...`);

    for (let i = 0; i < n; i++) {
        if (visited[i]) continue;

        const cycle = [];
        const queue = [i];
        visited[i] = true;

        while (queue.length > 0) {
            const idx = queue.shift();
            const vertex = vertices[idx];
            cycle.push(idx);

            // For each face this vertex lies on, apply the transformation
            // The side-pairing g maps vertices on geodesic G_g to vertices on geodesic G_{g^-1}
            for (const faceId of vertex.faces) {
                const matrix = _facesMetaById[faceId]?.matrix;
                if (!matrix) continue;

                // Apply the transformation to this vertex
                const mappedPoint = applyMatrixToDiskPoint(matrix, vertex.point);
                if (!mappedPoint) continue;

                // Find closest vertex to the mapped point
                const mappedIdx = findClosestVertex(mappedPoint, vertices);
                if (mappedIdx >= 0 && !visited[mappedIdx]) {
                    console.log(`  Vertex ${idx} on face ${faceId} maps to vertex ${mappedIdx}`);
                    visited[mappedIdx] = true;
                    queue.push(mappedIdx);
                }
            }
        }

        if (cycle.length > 0) {
            cycles.push(cycle);
            console.log(`  Cycle ${cycles.length}: ${cycle.length} vertices`);
        }
    }

    return cycles;
}

// Build a map of which faces pair with which
function buildFacePairingMap() {
    const pairing = new Map();
    const numFaces = _currentSphereCenters.length + _currentPlaneNormals.length;

    for (let faceId = 0; faceId < numFaces; faceId++) {
        const matrix = _facesMetaById[faceId]?.matrix;
        if (!matrix) continue;

        // Find the paired face (the one with the inverse matrix)
        const pairedFaceId = findPairedFace(faceId, matrix);
        if (pairedFaceId >= 0) {
            pairing.set(faceId, pairedFaceId);
        }
    }

    return pairing;
}

// Find which face corresponds to the inverse of the given matrix
function findPairedFace(sourceFaceId, matrix) {
    const numFaces = _currentSphereCenters.length + _currentPlaneNormals.length;

    // Compute inverse matrix
    const a = matrix.a?.re ?? matrix.a;
    const b = matrix.b?.re ?? matrix.b;
    const c = matrix.c?.re ?? matrix.c;
    const d = matrix.d?.re ?? matrix.d;

    const det = a * d - b * c;
    if (Math.abs(det) < 1e-10) return -1;

    const invA = d / det;
    const invB = -b / det;
    const invC = -c / det;
    const invD = a / det;

    // Find the face with the closest matrix
    let minDist = Infinity;
    let pairedFaceId = -1;

    for (let faceId = 0; faceId < numFaces; faceId++) {
        if (faceId === sourceFaceId) continue;

        const otherMatrix = _facesMetaById[faceId]?.matrix;
        if (!otherMatrix) continue;

        const oa = otherMatrix.a?.re ?? otherMatrix.a;
        const ob = otherMatrix.b?.re ?? otherMatrix.b;
        const oc = otherMatrix.c?.re ?? otherMatrix.c;
        const od = otherMatrix.d?.re ?? otherMatrix.d;

        // Check both ±M since PSL(2,R)
        const dist1 = Math.sqrt(
            (oa - invA) ** 2 + (ob - invB) ** 2 + (oc - invC) ** 2 + (od - invD) ** 2
        );
        const dist2 = Math.sqrt(
            (oa + invA) ** 2 + (ob + invB) ** 2 + (oc + invC) ** 2 + (od + invD) ** 2
        );

        const dist = Math.min(dist1, dist2);

        if (dist < minDist) {
            minDist = dist;
            pairedFaceId = faceId;
        }
    }

    return minDist < 0.1 ? pairedFaceId : -1;
}

// Display vertex angle sums
function displayVertexAngleSums() {
    const vertices = findFundamentalDomainVertices();

    if (vertices.length === 0) {
        console.log('No vertices found');
        if (renderer) {
            renderer.setVertices([], [], []);
        }
        return;
    }

    console.log(`Found ${vertices.length} vertices`);

    const cycles = computeVertexCycles(vertices);

    console.log(`Found ${cycles.length} vertex cycles`);

    // Compute angle sum for each cycle
    const angleSums = [];
    for (const cycle of cycles) {
        let sum = 0;
        for (const vertexIdx of cycle) {
            const angle = vertices[vertexIdx].angle;
            if (angle !== null) {
                sum += angle;
            }
        }
        angleSums.push(sum);
    }

    // Pass vertex data to renderer
    if (renderer) {
        renderer.setVertices(vertices, cycles, angleSums);
        renderer.render();
    }

    // Display summary on page 2
    const metaEl = document.getElementById('selected-face-meta');
    if (metaEl) {
        let text = 'Vertex angle sums (as multiples of π):\n';
        for (let i = 0; i < angleSums.length; i++) {
            const multiple = angleSums[i] / Math.PI;
            text += `  Vertex cycle ${i + 1}: ${multiple.toFixed(4)}π (${cycles[i].length} vertices)\n`;
        }
        metaEl.textContent = text;
    }

    return { vertices, cycles, angleSums };
}

// Handle vertex selection
function handleVertexSelection(vertexId) {
    if (!renderer || !renderer.vertices || !renderer.vertexCycles || !renderer.vertexAngleSums) {
        return;
    }

    // Find which cycle this vertex belongs to
    let cycleIndex = -1;
    for (let i = 0; i < renderer.vertexCycles.length; i++) {
        if (renderer.vertexCycles[i].includes(vertexId)) {
            cycleIndex = i;
            break;
        }
    }

    if (cycleIndex < 0) return;

    const cycle = renderer.vertexCycles[cycleIndex];
    const angleSum = renderer.vertexAngleSums[cycleIndex];
    const vertex = renderer.vertices[vertexId];

    // Display information
    const edgeOut = document.getElementById('selected-edge');
    if (edgeOut) {
        const multiple = angleSum / Math.PI;
        const vertexAngle = vertex.angle ? (vertex.angle * 180 / Math.PI).toFixed(2) : 'N/A';
        edgeOut.textContent = `Vertex cycle ${cycleIndex + 1}: angle sum = ${multiple.toFixed(4)}π\n` +
            `This vertex: ${vertexAngle}°, cycle has ${cycle.length} vertices`;
    }

    const normalOut = document.getElementById('selected-face-normal');
    if (normalOut) {
        const { x, y } = vertex.point;
        normalOut.textContent = `Vertex at (${x.toFixed(4)}, ${y.toFixed(4)})`;
    }

    const metaEl = document.getElementById('selected-face-meta');
    if (metaEl) {
        let text = `Vertex cycle ${cycleIndex + 1} details:\n`;
        text += `  Total angle sum: ${(angleSum / Math.PI).toFixed(4)}π\n`;
        text += `  Number of vertices in cycle: ${cycle.length}\n`;
        text += `  Vertices in this cycle:\n`;
        for (const vIdx of cycle) {
            const v = renderer.vertices[vIdx];
            const vAngle = v.angle ? (v.angle * 180 / Math.PI).toFixed(2) : 'N/A';
            text += `    Vertex ${vIdx}: (${v.point.x.toFixed(4)}, ${v.point.y.toFixed(4)}), angle ${vAngle}°\n`;
        }
        metaEl.textContent = text;
    }
}

function setupEventHandlers() {
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('resize', () => {
        const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
        renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
    });

    document.getElementById('render-btn').addEventListener('click', updateFromInput);

    // Boundary toggle
    const boundaryToggle = document.getElementById('toggle-boundary');
    if (boundaryToggle) {
        boundaryToggle.addEventListener('change', (e) => {
            if (renderer) {
                renderer.showBoundary = e.target.checked;
                renderer.render();
            }
        });
    }

    // Palette selector
    const paletteSelect = document.getElementById('palette-select');
    if (paletteSelect) {
        paletteSelect.addEventListener('change', () => {
            const v = paletteSelect.value;
            const map = { 'colorful': 0, 'vaporwave': 1, 'uc': 2, 'halloween': 3, 'tie-dye': 4, 'sunset': 5 };
            _paletteMode = map[v] ?? 0;
            if (renderer) {
                renderer.paletteMode = _paletteMode;
                renderer.render();
            }
            const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
            renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
        });
    }

    // Domain orbit toggle
    const domainOrbitToggle = document.getElementById('toggle-domain-orbit');
    if (domainOrbitToggle) {
        domainOrbitToggle.addEventListener('change', (e) => {
            if (renderer) {
                renderer.showDomainOrbit = e.target.checked;
                renderer.render();
            }
        });
    }

    // Cayley graph toggle
    const cayleyGraphToggle = document.getElementById('toggle-cayley-graph');
    if (cayleyGraphToggle) {
        cayleyGraphToggle.addEventListener('change', (e) => {
            if (renderer) {
                renderer.showCayleyGraph = e.target.checked;
                renderer.render();
            }
        });
    }

    setupGutterClickHandlers();
}

function setupGutterClickHandlers() {
    const gutterDiv = document.getElementById('vector-gutter');
    if (!gutterDiv) return;

    gutterDiv.addEventListener('click', (e) => {
        const box = e.target.closest('.box');
        if (!box) return;
        const line = parseInt(box.dataset.line, 10);
        if (!Number.isInteger(line)) return;
        const faceId = _currentFaceIdsByLine[line];
        if (faceId === undefined) return;

        if (renderer) {
            renderer.selectedFaceId = faceId;
            renderer.triggerPop(faceId);
            renderer.render();
        }

        handleFaceSelection(faceId);
    });
}

async function setupUI() {
    const externalPayload = getExternalVectorsPayload();
    const vectorsEl = document.getElementById('vectors');
    const select = document.getElementById('example-select');


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


    setupPager();
    setupPanelToggle();

    // Setup matrix input
    setupMatrixInput();

    // Render from matrices button
    const renderFromMatricesBtn = document.getElementById('render-from-matrices-btn');
    if (renderFromMatricesBtn) {
        renderFromMatricesBtn.addEventListener('click', updateFromMatrices);
    }

    // Initialize: Load a random group example and generate
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

        // Generate from the matrices
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
    const canvas = document.getElementById('canvas');
    if (renderer && canvas && container) {
        renderer.resize(container.clientWidth, container.clientHeight);
    }
}

// Start the application
init();
