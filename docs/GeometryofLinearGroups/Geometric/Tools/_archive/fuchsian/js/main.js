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
import { renderGutter, highlightGutterFaces, showFaceMeta, setupTabs, setupPanelToggle } from './ui.js';
import { setupMatrixInput, getMatricesFromUI, Complex, Matrix2 } from './matrixInput.js';
import { generateGroupElements } from './dirichletUtils.js';
import { runExactCertificate } from './exactCertificate.js';

// The domain/orbit pipeline centers the Dirichlet domain at the disk origin = i. If a short
// word fixes i (e.g. S=[[0,-1],[1,0]] in the modular/Hecke groups), that domain degenerates
// and the tiling collapses. Detect this and conjugate the group by a generic isometry so the
// effective basepoint is interior — the rendered tessellation is then an isometric copy.
function perturbIfBasepointFixed(matrices) {
    const gi = m => { // g·i = u + v i, entries real
        const a = m.a.re, b = m.b.re, c = m.c.re, d = m.d.re, den = c * c + d * d || 1e-30;
        return { u: (b * d + a * c) / den, v: (a * d - b * c) / den };
    };
    const sym = [];
    matrices.forEach(m => { sym.push(m); sym.push(m.inverse()); });
    const words = [...sym];
    for (const a of sym) for (const b of sym) words.push(a.multiply(b));
    const fixesI = words.some(m => m && !m.isIdentity() && Math.hypot(gi(m).u, gi(m).v - 1) < 1e-6);
    if (!fixesI) return matrices;

    // c: z ↦ s·z — move the basepoint UP the imaginary axis (i ↦ s·i), off the elliptic fixed
    // point but STAYING on the axis. This preserves the symmetry of symmetric groups: e.g. for
    // PSL(2,Z) / Hecke groups the Dirichlet domain at iy (y>1) is the standard {|x|<λ/2, |z|>1}.
    // A horizontal shift would move the basepoint off the symmetry axis and skew the cell.
    const s = 1.3, rs = Math.sqrt(s);
    const C = new Matrix2(new Complex(rs), new Complex(0), new Complex(0), new Complex(1 / rs));
    const Ci = C.inverse();
    return matrices.map(g => Ci.multiply(g).multiply(C));
}


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
let _generatedWords = []; // Store words from matrix generation
let _generatedMatrices = []; // Store matrices from generation
let _facesMetaById = [];
let _paletteMode = 0;

function getReal(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return val.re ?? 0;
}
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

// (Removed: satisfiesSDF / hasPointInFundamentalDomain — the old per-geodesic point-sampling
// face filter. Faces are now found robustly by activeDirichletFaces below.)

/**
 * Robustly determine the faces of the Dirichlet (Voronoi) cell of the basepoint.
 *
 * Each covector (a,b,c) is a bisector half-plane: a point of the hyperboloid (mx,my,mw)
 * is inside when a·mx + b·my + c·mw ≤ 0. Dividing by mw>0 gives the *Klein* coordinates
 * k=(mx/mw, my/mw) and a plain linear half-plane  a·kx + b·ky + c ≤ 0.  The cell is the
 * intersection of these half-planes with the open unit (Klein) disk.
 *
 * A face k is *active* (it actually bounds the cell) iff the portion of its boundary line that
 * lies inside every other half-plane — and inside the disk — is a non-degenerate segment. We
 * test that directly by 1-D interval clipping along each line. This is robust even for faces
 * that only graze the cell near the ideal boundary (which a polygon-edge scan can miss), and
 * it replaces the old point-sampling filter that silently dropped genuine faces.
 */
function activeDirichletFaces(covectors) {
    // Deduplicate identical bisector lines (same orbit point reached by different words).
    const uniq = [];
    const seen = new Set();
    for (let i = 0; i < covectors.length; i++) {
        const c = covectors[i];
        if (!c || c.length !== 3 || !c.every(Number.isFinite)) continue;
        const n = Math.hypot(c[0], c[1], c[2]) || 1;
        const key = `${Math.round(c[0] / n * 1e4)},${Math.round(c[1] / n * 1e4)},${Math.round(c[2] / n * 1e4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push({ c, i });
    }

    const active = [];
    for (const { c: ck, i: idx } of uniq) {
        const [a, b, c] = ck;
        const ab2 = a * a + b * b;
        if (ab2 < 1e-15) continue;                       // covector with no spatial part
        // A point of line k:  p0 = -c·(a,b)/|.. |² ;  direction d = (-b, a).
        const p0x = -c * a / ab2, p0y = -c * b / ab2, dx = -b, dy = a;

        // Clip the parameter t to "inside every other half-plane".
        let tmin = -Infinity, tmax = Infinity, feasible = true;
        for (const { c: cj } of uniq) {
            if (cj === ck) continue;
            const A = cj[0] * dx + cj[1] * dy;           // d(constraint)/dt
            const B = -(cj[0] * p0x + cj[1] * p0y + cj[2]);
            if (Math.abs(A) < 1e-12) { if (B < -1e-9) { feasible = false; break; } }  // parallel, fully outside
            else if (A > 0) { if (B / A < tmax) tmax = B / A; }
            else { if (B / A > tmin) tmin = B / A; }
        }
        if (!feasible || tmax - tmin <= 1e-6) continue;

        // Intersect with the open unit (Klein) disk:  |p0 + t·d|² < 1.
        const qa = dx * dx + dy * dy, qb = 2 * (p0x * dx + p0y * dy), qc = p0x * p0x + p0y * p0y - 1;
        const disc = qb * qb - 4 * qa * qc;
        if (disc <= 0) continue;                          // line misses the disk
        const sq = Math.sqrt(disc);
        tmin = Math.max(tmin, (-qb - sq) / (2 * qa));
        tmax = Math.min(tmax, (-qb + sq) / (2 * qa));

        if (tmax - tmin > 1e-6) active.push(idx);         // non-empty edge ⇒ active face
    }
    return active;
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
        _generatedMatrices = [];
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
    const matricesByLine = []; // Store matrix data for each line

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
        let matrix = (_generatedMatrices && _generatedMatrices[lineIdx]) ? _generatedMatrices[lineIdx] : null;
        if (!cleanLine) continue;

        // Check for matrix input: (a, b, c, d)
        const parenMatch = cleanLine.match(/^\s*\(\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*\)\s*$/);
        if (parenMatch) {
            if (!(typeof PGL2RtoSDF !== 'undefined' && PGL2RtoSDF)) {
                errorMessage.textContent = `Matrix input requires PGL2RtoO21.js to be loaded.`;
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
                const so21 = PGL2RtoSDF.PGL2RtoO21(a, b, c, d);
                let cov;
                try {
                    const result = PGL2RtoSDF.sDF_autoFromO21(so21);
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
                    // Correct Minkowski bisector fallback
                    cov = [-yx, -yy, yw - 1];
                }
                if (!cov || cov.length !== 3 || cov.some(v => !Number.isFinite(v))) {
                    throw new Error('Invalid sDF from PGL2RtoO21');
                }
                let [vx, vy, vw] = cov;
                // Reference point: origin [0, 0, 1] in Minkowski space
                // Dot product <Origin, Covector> should be <= 0
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
                matricesByLine.push({ a, b, c, d }); // Store matrix
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
        // For raw vectors, we don't force flip but warn if they are oriented towards infinity
        if (vw > 1.0) {
            errorMessage.textContent = `Warning: Final coordinate t > 1.0 may be pointing at infinity.`;
        }

        const nSq = vx * vx + vy * vy;
        const wSq = vw * vw;

        if (nSq <= wSq) {
            errorMessage.textContent = `Vector is not spacelike (x² + y² must be > t²).`;
            renderGutter(lines.length, null, null, _paletteMode);
            return;
        }

        let [ax, ay, aw] = [vx, vy, vw];
        const qVal = ax * ax + ay * ay - aw * aw;
        if (qVal > 1e-12) {
            const norm = Math.sqrt(qVal);
            ax /= norm; ay /= norm; aw /= norm;
        }
        if (aw > 0) { ax = -ax; ay = -ay; aw = -aw; }

        covRowsByLine.push([ax, ay, aw]);
        wordsByRawLine.push(word);
        matricesByLine.push(matrix);
        lineKinds.push('raw');
        lineLocalIdx.push(covRowsByLine.length - 1);
        wordsByLine.push(word);
    }

    // Keep only the covectors that actually bound the Dirichlet (Voronoi) cell — the active
    // faces of the half-plane intersection. (Robust line-clipping; the previous
    // filterFaceDefiningCovectorsCone sampling heuristic silently dropped genuine faces, e.g.
    // far faces that graze the cell near the ideal boundary.)
    let survivorsIdx = [];
    if (covRowsByLine.length > 0) {
        survivorsIdx = activeDirichletFaces(covRowsByLine.slice());
        if (survivorsIdx.length === 0) survivorsIdx = covRowsByLine.map((_, i) => i);  // safety net
    }

    // Rebuild sphere/plane arrays from survivors only
    const sphereCentersFiltered = [];
    const sphereRadiiFiltered = [];
    const planeNormalsFiltered = [];
    const faceMatricesFiltered = [];
    const faceCovectorsFiltered = [];
    const rawIndexToFaceId = new Map();

    // First pass: Circles
    for (const iRaw of survivorsIdx) {
        const row = covRowsByLine[iRaw];
        let [ax, ay, aw] = row;
        if (Math.abs(aw) >= 1e-6) {
            const nSq = ax * ax + ay * ay;
            const wSq = aw * aw;
            if (nSq <= wSq) continue;

            const center = new Vec2(ax / aw, ay / aw);
            const r = Math.sqrt(nSq / wSq - 1);

            const fid = sphereCentersFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            sphereCentersFiltered.push(center);
            sphereRadiiFiltered.push(r);
            faceCovectorsFiltered.push([ax, ay, aw]);
            faceMatricesFiltered.push(matricesByLine[iRaw]);
        }
    }

    // Second pass: Lines
    const numSpheres = sphereCentersFiltered.length;
    for (const iRaw of survivorsIdx) {
        const row = covRowsByLine[iRaw];
        let [ax, ay, aw] = row;
        if (Math.abs(aw) < 1e-6) {
            const nSq = ax * ax + ay * ay;
            if (nSq < 1e-12) continue;

            const fid = numSpheres + planeNormalsFiltered.length;
            rawIndexToFaceId.set(iRaw, fid);
            const norm = Math.sqrt(nSq);
            planeNormalsFiltered.push(new Vec2(ax / norm, ay / norm));
            faceCovectorsFiltered.push([ax, ay, aw]);
            faceMatricesFiltered.push(matricesByLine[iRaw]);
        }
    }

    // Map original lines to face ids
    const faceIdsByLine = new Array(lineKinds.length).fill(undefined);
    const idxSet = new Set(survivorsIdx);

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
    _currentCovectors = faceCovectorsFiltered;

    // Populate _facesMetaById for metadata display and animations
    _facesMetaById = [];
    for (const iRaw of survivorsIdx) {
        const fid = rawIndexToFaceId.get(iRaw);
        if (fid !== undefined) {
            _facesMetaById[fid] = {
                word: wordsByRawLine[iRaw],
                matrix: matricesByLine[iRaw]
            };
        }
    }

    // Update renderer
    if (renderer) {
        renderer.setGeometry(_currentSphereCenters, _currentSphereRadii, _currentPlaneNormals, faceMatricesFiltered, faceCovectorsFiltered);
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

    // Exact discreteness/indiscreteness certificate (independent of the float pipeline).
    runExactCertificate();

    try {
        const matrices = perturbIfBasepointFixed(getMatricesFromUI());
        if (matrices.length === 0) {
            if (errorMessage) errorMessage.textContent = 'Please add at least one matrix.';
            return;
        }

        // Check if PGL2RtoSDF is available
        if (typeof PGL2RtoSDF === 'undefined' || !PGL2RtoSDF) {
            if (errorMessage) errorMessage.textContent = 'PGL2RtoO21.js is required for matrix conversion.';
            return;
        }

        const wordLength = parseInt(document.getElementById('wordLength')?.value) || 4;
        if (renderer) renderer.cayleyDepth = wordLength;   // "Word Length" also drives the Cayley graph BFS depth

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
        const allMatrices = []; // Store PSL(2,R) matrices for renderer

        for (const item of groupElements) {
            const mat = item.m;
            const word = item.word || '';

            const a = getReal(mat.a);
            const b = getReal(mat.b);
            const c = getReal(mat.c);
            const d = getReal(mat.d);

            // Normalize determinant to +/- 1
            const det = a * d - b * c;
            const scale = (Math.abs(det) > 1e-12) ? (1 / Math.sqrt(Math.abs(det))) : 1;

            // Dirichlet/Voronoi bisector face for this element, computed DIRECTLY (the previous
            // sDF_autoFromO21 path fell back to non-timelike pivots for some elements, yielding
            // covectors that were not the basepoint bisector and cut into the cell).
            //
            // Basepoint o = (0,0,1). The face is the perpendicular bisector of [o, g⁻¹·o], so that
            // the stored matrix g — applied FORWARD (H ↦ g·H·gᵀ) by the renderer's pull-back —
            // maps the neighbouring tile across this face back onto the fundamental domain.
            // With g normalised (det = ±1), g⁻¹ ∝ [[D,−B],[−C,A]] and  g⁻¹·o  comes from g⁻¹(g⁻¹)ᵀ:
            const A = a * scale, B = b * scale, C = c * scale, D = d * scale;
            const n1 = D * D + B * B, n2 = C * C + A * A;
            const Px = (n1 - n2) / 2, Py = -(C * D + A * B), Pw = (n1 + n2) / 2;
            // Renderer convention: inside = { cov·m ≤ 0 }, with cov = (Px, Py, 1−Pw).
            let cov = [Px, Py, 1 - Pw];

            // Degenerate (element fixes the basepoint ⇒ no bisector): skip it.
            const covNormSq = Px * Px + Py * Py - (1 - Pw) * (1 - Pw);
            if (!cov.every(Number.isFinite) || covNormSq < 1e-12) {
                continue;
            }

            let [vx, vy, vw] = cov;

            // Normalize covector: <v, v> = vx^2 + vy^2 - vw^2 = 1
            const q = vx * vx + vy * vy - vw * vw;
            if (q > 1e-12) {
                const norm = Math.sqrt(q);
                vx /= norm; vy /= norm; vw /= norm;
            }

            // Force origin (0,0,1) to be on the negative side (inside)
            // <(0,0,1), (vx, vy, vw)> = vw (in Euclidean dot for renderer)
            if (vw > 0) { vx = -vx; vy = -vy; vw = -vw; }

            allCovectors.push([vx, vy, vw]);
            allWords.push(word);
            allMatrices.push({ a, b, c, d });
        }

        console.log(`Converted ${allCovectors.length} group elements to covectors`);

        // Step 3+4: Determine the active Dirichlet (Voronoi) faces by intersecting the bisector
        // half-planes into the actual cell polygon. This is the set of group elements whose
        // bisector with the basepoint bounds the cell — i.e. the true side-pairing generators.
        // (The old point-sampling filter dropped genuine faces, so the rendered region wasn't the
        // Voronoi cell of the basepoint orbit — e.g. it kept only 4 of the 6 faces for (2,3,7).)
        console.log('Building Dirichlet (Voronoi) cell from bisector half-planes...');
        const standardGeneratorIndices = activeDirichletFaces(allCovectors);

        console.log(`Active Voronoi faces: ${standardGeneratorIndices.length} of ${allCovectors.length}`);

        if (standardGeneratorIndices.length === 0) {
            if (errorMessage) {
                errorMessage.textContent = 'No Dirichlet faces found. Try increasing word length or check your matrices.';
            }
            return;
        }

        // Step 5: Build vectorsWithMeta from standard generators only
        const vectorsWithMeta = standardGeneratorIndices.map(idx => ({
            vector: allCovectors[idx],
            word: allWords[idx],
            matrix: allMatrices[idx]
        }));

        // Step 6: Format and populate page 2 with vectors
        const vectorsEl = document.getElementById('vectors');
        if (vectorsEl) {
            const lines = vectorsWithMeta.map(item => {
                const [vx, vy, vw] = item.vector;
                return `${vx.toFixed(6)}, ${vy.toFixed(6)}, ${vw.toFixed(6)}`;
            });
            vectorsEl.value = lines.join('\n');

            // Store metadata separately so it persists through updateFromInput
            _generatedWords = vectorsWithMeta.map(item => item.word);
            _generatedMatrices = vectorsWithMeta.map(item => item.matrix);

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

    // Size the canvas backing store at the device pixel ratio (capped at 2×) so the render is
    // crisp on HiDPI / Retina displays instead of being upscaled from CSS-pixel resolution.
    // CSS keeps the canvas at the container size (inline style width/height: 100%); only the
    // backing store is enlarged.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(container.clientWidth * dpr);
    canvas.height = Math.round(container.clientHeight * dpr);

    // Create renderer
    renderer = new PoincareRenderer(canvas);

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

function setupEventHandlers() {
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('resize', () => {
        const lines = (document.getElementById('vectors').value || '').split('\n').filter(l => l.trim() !== '');
        renderGutter(lines.length, _currentFaceIdsByLine, _currentWordsByLine, _paletteMode);
    });

    // Toggle buttons
    const fundamentalDomainToggle = document.getElementById('toggle-fundamental-domain-btn');
    const boundaryToggle = document.getElementById('toggle-boundary-btn');
    const domainOrbitToggle = document.getElementById('toggle-domain-orbit-btn');
    const cayleyGraphToggle = document.getElementById('toggle-cayley-graph-btn');
    const modelToggle = document.getElementById('model-toggle');

    // Sync initial renderer state with UI button classes
    if (renderer) {
        if (fundamentalDomainToggle) renderer.showFundamentalDomain = fundamentalDomainToggle.classList.contains('active');
        if (boundaryToggle) renderer.showBoundary = boundaryToggle.classList.contains('active');
        if (domainOrbitToggle) renderer.showDomainOrbit = domainOrbitToggle.classList.contains('active');
        if (cayleyGraphToggle) renderer.showCayleyGraph = cayleyGraphToggle.classList.contains('active');
        // Initial model (Poincaré disk vs upper half-plane)
        const activeModel = modelToggle?.querySelector('.seg-btn.active');
        if (activeModel) renderer.isUpperHalfPlane = activeModel.dataset.model === 'uhp';
    }

    // Refresh button - triggers updateFromMatrices
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', updateFromMatrices);
    }

    // Fundamental domain toggle listener
    if (fundamentalDomainToggle) {
        fundamentalDomainToggle.addEventListener('click', () => {
            fundamentalDomainToggle.classList.toggle('active');
            if (renderer) {
                renderer.showFundamentalDomain = fundamentalDomainToggle.classList.contains('active');
                renderer.render();
            }
        });
    }

    // Boundary toggle listener
    if (boundaryToggle) {
        boundaryToggle.addEventListener('click', () => {
            boundaryToggle.classList.toggle('active');
            if (renderer) {
                renderer.showBoundary = boundaryToggle.classList.contains('active');
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

    // Region coloring-logic selector (how the tessellation tiles are colored)
    const coloringSelect = document.getElementById('coloring-select');
    if (coloringSelect) {
        if (renderer) renderer.colorMode = coloringSelect.value;
        coloringSelect.addEventListener('change', () => {
            if (renderer) {
                renderer.colorMode = coloringSelect.value;
                renderer.render();
            }
        });
    }

    // Edge thickness slider (screen-pixel width of the tessellation edges)
    const edgeWidthInput = document.getElementById('edge-width');
    if (edgeWidthInput) {
        if (renderer) renderer.edgeWidth = parseFloat(edgeWidthInput.value);
        edgeWidthInput.addEventListener('input', () => {
            if (renderer) {
                renderer.edgeWidth = parseFloat(edgeWidthInput.value);
                renderer.render();
            }
        });
    }

    // Domain orbit toggle listener
    if (domainOrbitToggle) {
        domainOrbitToggle.addEventListener('click', () => {
            domainOrbitToggle.classList.toggle('active');
            if (renderer) {
                const isActive = domainOrbitToggle.classList.contains('active');
                renderer.showDomainOrbit = isActive;
                renderer.render();
            }
        });
    }

    // Cayley graph toggle listener
    if (cayleyGraphToggle) {
        cayleyGraphToggle.addEventListener('click', () => {
            cayleyGraphToggle.classList.toggle('active');
            if (renderer) {
                renderer.showCayleyGraph = cayleyGraphToggle.classList.contains('active');
                renderer.render();
            }
        });
    }

    // Model toggle (Poincaré disk / Upper half-plane)
    if (modelToggle) {
        modelToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.seg-btn');
            if (!btn) return;
            modelToggle.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
            if (renderer) {
                renderer.toggleUpperHalfPlane(btn.dataset.model === 'uhp');
            }
        });
    }

    setupGutterClickHandlers();

    // Add delegator for isometry animation triggers in metadata panel
    const metaPanel = document.getElementById('selected-face-meta');
    if (metaPanel) {
        metaPanel.addEventListener('click', (e) => {
            const trigger = e.target.closest('.clickable-isometry');
            if (trigger) {
                const faceId = parseInt(trigger.dataset.faceId, 10);
                const matrix = _facesMetaById[faceId]?.matrix;
                if (matrix && renderer) {
                    renderer.animateIsometry(matrix);
                }
            }
        });
    }
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

        // Check if clicked on the word specifically for animation
        const wordTrigger = e.target.closest('.gutter-word');
        if (wordTrigger) {
            const matrix = _facesMetaById[faceId]?.matrix;
            if (matrix && renderer) {
                renderer.animateIsometry(matrix);
                return;
            }
        }

        if (renderer) {
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


    setupTabs();
    setupPanelToggle();

    // Setup matrix input
    setupMatrixInput();



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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.resize(Math.round(container.clientWidth * dpr), Math.round(container.clientHeight * dpr));
    }
}

// Start the application
init();
