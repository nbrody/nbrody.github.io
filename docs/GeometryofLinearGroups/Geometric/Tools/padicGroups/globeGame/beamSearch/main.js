import * as THREE from 'three';

// --- Configuration ---
const vStart = new THREE.Vector3(1, 0, 0);
const R_EARTH = 3958.7613;

function getGenerators() {
    const gens = [];
    const seen = new Set();

    function addQuat(a, b, c, d, p) {
        // Restriction: Only use quaternions where the first coordinate (a) is odd.
        // For norm 5 and 13, exactly one entry is odd. This forces b,c,d even.
        if (Math.abs(a) % 2 === 0) return;

        // Quaternions represent the same rotation if q2 = -q1
        // Normalize to a > 0
        if (a < 0) {
            a = -a; b = -b; c = -c; d = -d;
        }
        const key = `${a},${b},${c},${d}`;
        if (seen.has(key)) return;
        seen.add(key);

        const m = new THREE.Matrix4();
        const N = p;
        // Correcting formula
        m.set(
            (a * a + b * b - c * c - d * d) / N, 2 * (b * c - a * d) / N, 2 * (b * d + a * c) / N, 0,
            2 * (b * c + a * d) / N, (a * a - b * b + c * c - d * d) / N, 2 * (c * d - a * b) / N, 0,
            2 * (b * d - a * c) / N, 2 * (c * d + a * b) / N, (a * a - b * b - c * c + d * d) / N, 0,
            0, 0, 0, 1
        );

        gens.push({
            name: `(${a},${b},${c},${d})`,
            m: m,
            quat: [a, b, c, d],
            p: p
        });
    }

    function findForNorm(p) {
        const limit = Math.ceil(Math.sqrt(p));
        for (let a = -limit; a <= limit; a++) {
            for (let b = -limit; b <= limit; b++) {
                for (let c = -limit; c <= limit; c++) {
                    const d2 = p - a * a - b * b - c * c;
                    if (d2 >= 0) {
                        const d = Math.round(Math.sqrt(d2));
                        if (a * a + b * b + c * c + d * d === p) {
                            addQuat(a, b, c, d, p);
                            if (d !== 0) addQuat(a, b, c, -d, p);
                        }
                    }
                }
            }
        }
    }

    findForNorm(5);
    findForNorm(13);
    return gens;
}

const GENS = getGenerators();
console.log(`Initialized with ${GENS.length} generators.`);

function solveBeam(targetVec, width, maxDepth, pWeight, onUpdate) {
    let beam = [{
        matrix: new THREE.Matrix4(), // Identity
        depth: 0,
        word: [],
        lastQuat: null
    }];

    let bestSolution = null;
    let bestDist = Infinity;

    (async () => {
        for (let d = 0; d < maxDepth; d++) {
            let nextBeam = [];

            for (const node of beam) {
                for (const g of GENS) {
                    // Primitive check: avoid immediate inverse
                    // Since q and -q are normalized, we check for identity-ish
                    // Actually, let's just use the matrix multiplication directly

                    // M_new = M_gen * M_old
                    const newMat = g.m.clone().multiply(node.matrix);
                    const newWord = [...node.word, g.name];

                    // First column of M is M * (1,0,0)
                    const vCurr = vStart.clone().applyMatrix4(newMat);
                    const dot = vCurr.dot(targetVec);
                    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                    const distMiles = angle * R_EARTH;

                    // Scoring
                    const score = distMiles + (pWeight * (node.depth + 1));

                    nextBeam.push({
                        matrix: newMat,
                        depth: node.depth + 1,
                        word: newWord,
                        dist: distMiles,
                        score: score
                    });

                    if (distMiles < bestDist) {
                        bestDist = distMiles;
                        bestSolution = { word: newWord, dist: distMiles, depth: node.depth + 1 };
                    }
                }
            }

            nextBeam.sort((a, b) => a.score - b.score);
            beam = nextBeam.slice(0, width);

            onUpdate(d + 1, beam[0], bestSolution);
            if (bestDist < 1e-10) break; // Found exact match
            await new Promise(r => setTimeout(r, 0));
        }
    })();
}

// --- UI Binding ---

const btn = document.getElementById('startBtn');
const resultsList = document.getElementById('resultsList');
const statusEl = document.getElementById('status');

btn.addEventListener('click', () => {
    const nx = BigInt(document.getElementById('targetNx').value);
    const ny = BigInt(document.getElementById('targetNy').value);
    const nz = BigInt(document.getElementById('targetNz').value);
    const k = parseInt(document.getElementById('targetK').value);
    const N = 65n ** BigInt(k);
    const Nf = Number(N);

    // Verify normalization
    const normSq = nx * nx + ny * ny + nz * nz;
    if (normSq !== N * N) {
        statusEl.textContent = `Error: x^2+y^2+z^2 = ${normSq}, expected N^2 = ${N * N}`;
        statusEl.style.color = '#ff7b72';
        return;
    }
    statusEl.style.color = '#8b949e';

    const targetVec = new THREE.Vector3(Number(nx) / Nf, Number(ny) / Nf, Number(nz) / Nf);
    const width = parseInt(document.getElementById('beamWidth').value) || 1000;
    const depth = parseInt(document.getElementById('maxDepth').value) || 16;
    const pWeight = parseFloat(document.getElementById('padicWeight').value) || 0;

    btn.disabled = true;
    resultsList.innerHTML = '';
    statusEl.textContent = 'Searching...';

    solveBeam(targetVec, width, depth, pWeight, (currentDepth, bestInBeam, globalBest) => {
        statusEl.textContent = `Depth ${currentDepth}/${depth}. Best Dist: ${globalBest.dist.toFixed(4)} miles`;

        const row = document.createElement('div');
        row.className = 'result-row';
        if (bestInBeam.dist < 0.1) row.classList.add('highlight');
        row.innerHTML = `
            <div class="word">${bestInBeam.word.join('·')}</div>
            <div class="dist">${bestInBeam.dist.toFixed(6)}</div>
            <div class="padic">${bestInBeam.depth}</div>
        `;
        resultsList.insertBefore(row, resultsList.firstChild);

        if (currentDepth === depth || globalBest.dist < 1e-10) {
            btn.disabled = false;
            statusEl.textContent = globalBest.dist < 1e-10 ? 'Exact solution found!' : 'Done.';
        }
    });
});
