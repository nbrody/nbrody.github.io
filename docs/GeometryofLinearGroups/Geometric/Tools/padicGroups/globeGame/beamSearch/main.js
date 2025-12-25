import * as THREE from 'three';
import { BEACON_SC, BEACON_NASH, MAT_L_FLOAT, MAT_U_FLOAT, MAT_L_EXACT, MAT_LINV_EXACT, MAT_U_EXACT, MAT_UINV_EXACT } from '../constants.js';
import { matMul3 } from '../math.js';

// --- Setup Vectors ---
const R_EARTH = 3958.7613;

function getNormalizedVec(beacon) {
    const v = new THREE.Vector3(beacon.a / beacon.den, beacon.c / beacon.den, -beacon.b / beacon.den);
    return v.normalize();
}

const vSC = getNormalizedVec(BEACON_SC);
const vNash = getNormalizedVec(BEACON_NASH);

// Replicate Initial Rotation from scene.js
// SC at 36.9741, -122.0308
const lat = THREE.MathUtils.degToRad(36.9741);
const lon = THREE.MathUtils.degToRad(-122.0308);
const phi = Math.PI / 2 - lat;
const theta = lon + Math.PI;
const vSC_Sphere = new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
).normalize();

// qCenter rotates vSC_Sphere to (0,0,1)
const q0 = new THREE.Quaternion().setFromUnitVectors(vSC_Sphere, new THREE.Vector3(0, 0, 1));
const m0 = new THREE.Matrix4().makeRotationFromQuaternion(q0);

// Initial positions in World Space
// Target: Character is fixed at World(SC_Start).
// SC_Start_World = R0 * SC_Local.
// Wait, vSC from constants IS the local vector?
// Let's verify. BEACON_SC is used to place beacon on Earth.
// scene.js: `v` (used for Q) is computed from Lat/Lon. `SCBeacon` is computed from A,B,C.
// They should be the same point.
// So vSC_Sphere ~ vSC (from constants).
// We want M * (R0 * vNash) ~= (R0 * vSC).
// Let vNashWorld0 = vNash.applyMatrix4(m0)
// Let vTarget = vSC.applyMatrix4(m0) (Which is approx (0,0,1))
const vNashWorld0 = vNash.clone().applyMatrix4(m0);
const vTarget = vSC.clone().applyMatrix4(m0);

// Generators
const GENS = [
    { name: 'L', m: MAT_L_FLOAT, mx: MAT_L_EXACT, inv: 'R' },
    { name: 'R', m: MAT_L_FLOAT.clone().invert(), mx: MAT_LINV_EXACT, inv: 'L' },
    { name: 'U', m: MAT_U_FLOAT, mx: MAT_U_EXACT, inv: 'D' },
    { name: 'D', m: MAT_U_FLOAT.clone().invert(), mx: MAT_UINV_EXACT, inv: 'U' }
];

// --- Search Logic ---

function getPadicDepth(mat) {
    // Check one entry, e.g. [0][0]. Or max of all.
    // L uses 5, U uses 13.
    // We just count powers of 5 and 13 in the denominator of the first entry (usually representative enough)
    // Actually, we should check the common denominator.
    // math.js Frac has .d (BigInt).
    let d = mat[0][0].d;
    // Simply counting factors:
    let depth5 = 0;
    let depth13 = 0;
    while (d % 5n === 0n) { d /= 5n; depth5++; }
    while (d % 13n === 0n) { d /= 13n; depth13++; }
    return depth5 + depth13;
}

function solveBeam(width, maxDepth, pWeight, onUpdate) {
    // Beam: { matrix: THREE.Matrix4, exact: Array, word: [], lastGen: null, score: Number }
    let beam = [{
        matrix: new THREE.Matrix4(), // Identity
        // exact: null, // Optimization: Don't track exact until end? 
        // Actually, we need exact for p-adic depth.
        // But matrix mult is expensive.
        // Let's assume we can track p-adic depth just by counting moves?
        // L/R adds +1 to 5-depth. U/D adds +1 to 13-depth.
        // This is a good approximation (length of word).
        // Let's rely on word length for p-adic cost for speed.
        // We will reconstruct exact matrix only for results.
        depth: 0,
        word: [],
        lastGen: null
    }];

    let bestSolution = null;
    let bestDist = Infinity;

    // Run search
    (async () => {
        for (let d = 0; d < maxDepth; d++) {
            let nextBeam = [];

            for (const node of beam) {
                // Expand
                for (const g of GENS) {
                    if (node.lastGen === g.inv) continue; // No backtrack

                    const newMat = node.matrix.clone().multiply(g.m); // Post-multiply or Pre?
                    // main.js: q.premultiply(moveQ) => M_new = M_move * M_old
                    // So we should PRE-multiply.
                    const newMatPre = g.m.clone().multiply(node.matrix);

                    const newWord = [...node.word, g.name];

                    // Calc Distance
                    // v_current = M * v_start
                    const vCurr = vNashWorld0.clone().applyMatrix4(newMatPre);
                    const dot = vCurr.dot(vTarget); // dot in [-1, 1]
                    const distMiles = Math.acos(Math.max(-1, Math.min(1, dot))) * R_EARTH;

                    // Score
                    // score = Miles + weight * length
                    const score = distMiles + (pWeight * (node.depth + 1));

                    nextBeam.push({
                        matrix: newMatPre,
                        depth: node.depth + 1,
                        word: newWord,
                        lastGen: g.name,
                        dist: distMiles,
                        score: score
                    });

                    if (distMiles < bestDist) {
                        bestDist = distMiles;
                        bestSolution = { word: newWord, dist: distMiles, depth: node.depth + 1 };
                    }
                }
            }

            // Sort and prune
            nextBeam.sort((a, b) => a.score - b.score);
            beam = nextBeam.slice(0, width);

            // Notify UI
            onUpdate(d + 1, beam[0], bestSolution);

            // Yield to UI
            await new Promise(r => setTimeout(r, 0));
        }
    })();
}

// --- UI Binding ---

const btn = document.getElementById('startBtn');
const resultsList = document.getElementById('resultsList');
const statusEl = document.getElementById('status');

btn.addEventListener('click', () => {
    const width = parseInt(document.getElementById('beamWidth').value) || 1000;
    const depth = parseInt(document.getElementById('maxDepth').value) || 12;
    const pWeight = parseFloat(document.getElementById('padicWeight').value) || 0;

    btn.disabled = true;
    resultsList.innerHTML = '';
    statusEl.textContent = 'Searching...';

    solveBeam(width, depth, pWeight, (currentDepth, bestInBeam, globalBest) => {
        statusEl.textContent = `Depth ${currentDepth}/${depth}. Best Dist: ${globalBest.dist.toFixed(2)} miles`;

        // Add row for global best found so far (if new)
        // Or just list the top of the beam?
        // Let's list the top few of the current beam to show progress

        // Actually, let's keep a history of "Best Solutions Found"
        // Clear list and show top 5 candidates of this generation
        /*
        resultsList.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'result-row';
        row.innerHTML = `
            <div class="word">${globalBest.word.join('')}</div>
            <div class="dist">${globalBest.dist.toFixed(4)}</div>
            <div class="padic">${globalBest.depth}</div>
        `;
        resultsList.appendChild(row);
        */

        // Better: Append the best result of this depth
        const row = document.createElement('div');
        row.className = 'result-row';
        if (bestInBeam.dist < 500) row.classList.add('highlight'); // Highlight plausible solutions
        row.innerHTML = `
           <div class="word">${bestInBeam.word.join('')}</div>
           <div class="dist">${bestInBeam.dist.toFixed(2)}</div>
           <div class="padic">${bestInBeam.depth}</div>
       `;
        // Prepend
        resultsList.insertBefore(row, resultsList.firstChild);

        if (currentDepth === depth) {
            btn.disabled = false;
            statusEl.textContent = 'Done.';
        }
    });
});
