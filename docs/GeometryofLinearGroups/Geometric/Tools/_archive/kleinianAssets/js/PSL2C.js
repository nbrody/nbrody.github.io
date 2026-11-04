/**
 * @fileoverview A comprehensive library for PSL(2,C) group analysis.
 *
 * This script provides functions to:
 * 1.  Take a set of 2x2 complex generator matrices for a Kleinian group.
 * 2.  Generate group elements ("words") up to a specified length.
 * 3.  Map each group element from PSL(2,C) to its corresponding Lorentz
 * transformation in SO+(3,1).
 * 4.  Calculate the sDF (signed-distance function) covector for each transformation.
 * 5.  Apply a geometric filtering algorithm to identify which of these covectors
 * define the faces of the fundamental polyhedron in hyperbolic 3-space.
 */

// --- Core Complex Number and Matrix Helpers ---
const C = (re, im = 0) => ({ re, im });
const cAdd = (z, w) => C(z.re + w.re, z.im + w.im);
const cSub = (z, w) => C(z.re - w.re, z.im - w.im);
const cMul = (z, w) => C(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re);
const cConj = (z) => C(z.re, -z.im);
const cNeg = (z) => C(-z.re, -z.im);
const cDiv = (z, w) => {
    const den = w.re * w.re + w.im * w.im;
    if (den === 0) throw new Error('Division by zero in complex division');
    return C((z.re * w.re + z.im * w.im) / den, (z.im * w.re - z.re * w.im) / den);
};
const cEq = (z, w, tol = 1e-9) => Math.abs(z.re - w.re) <= tol && Math.abs(z.im - w.im) <= tol;
const cDet2 = (A) => cSub(cMul(A[0][0], A[1][1]), cMul(A[0][1], A[1][0]));
const cInv2 = (A) => {
    const det = cDet2(A);
    const invDet = cDiv(C(1, 0), det);
    return [
        [cMul(A[1][1], invDet), cMul(cNeg(A[0][1]), invDet)],
        [cMul(cNeg(A[1][0]), invDet), cMul(A[0][0], invDet)]
    ];
};
const cMatMul2 = (A, B) => [
    [cAdd(cMul(A[0][0], B[0][0]), cMul(A[0][1], B[1][0])), cAdd(cMul(A[0][0], B[0][1]), cMul(A[0][1], B[1][1]))],
    [cAdd(cMul(A[1][0], B[0][0]), cMul(A[1][1], B[1][0])), cAdd(cMul(A[1][0], B[0][1]), cMul(A[1][1], B[1][1]))]
];
const cMatAdjoint2 = (A) => [
    [cConj(A[0][0]), cConj(A[1][0])],
    [cConj(A[0][1]), cConj(A[1][1])]
];
const matEq2 = (A, B, tol = 1e-9) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (!cEq(A[i][j], B[i][j], tol)) return false;
    return true;
};
const matKey2 = (A) => {
    const f = z => `${(+z.re.toFixed(9))}:${(+z.im.toFixed(9))}`;
    return `${f(A[0][0])}|${f(A[0][1])}|${f(A[1][0])}|${f(A[1][1])}`;
};


/**
 * Generates group elements (words) from a set of generator matrices.
 *
 * @param {Array<Array<Array<{re: number, im: number}>>>} generatorMatrices - An array of 2x2 generator matrices.
 * @param {number} maxWordLength - The maximum length of words to generate.
 * @returns {Array<{m: Array<Array<{re: number, im: number}>>, word: string}>} An array of objects,
 * each containing a matrix `m` and its string representation `word`.
 */
function generateWords2x2Complex(generatorMatrices, maxWordLength) {
    const initial = [];
    generatorMatrices.forEach((G, i) => {
        initial.push({ m: G, word: `g${i + 1}` });
        try {
            initial.push({ m: cInv2(G), word: `g${i + 1}⁻¹` });
        } catch (_) { /* Skip non-invertible */ }
    });

    const seen = new Map();
    const out = [];
    const I = [[C(1, 0), C(0, 0)], [C(0, 0), C(1, 0)]];
    const Ikey = matKey2(I);

    const pushObj = (o) => {
        const k = matKey2(o.m);
        if (!seen.has(k)) {
            seen.set(k, o);
            if (k !== Ikey) out.push(o);
        }
    };
    initial.forEach(pushObj);

    let frontier = [...initial];
    for (let l = 1; l < maxWordLength; l++) {
        const nextFrontier = [];
        for (const w of frontier) {
            for (const s of initial) {
                const m = cMatMul2(w.m, s.m);
                const obj = { m, word: `${w.word}⋅${s.word}` };
                const k = matKey2(m);
                if (!seen.has(k) && !matEq2(m, I)) {
                    seen.set(k, obj);
                    out.push(obj);
                    nextFrontier.push(obj);
                }
            }
        }
        frontier = nextFrontier;
    }
    return out;
}


/**
 * Computes a 4-element covector from a single 2x2 complex matrix.
 * This is the core mapping from PSL(2,C) to SO+(3,1) and the sDF calculation.
 *
 * @param {Array<Array<{re: number, im: number}>>} g2x2 - A 2x2 matrix.
 * @returns {Array<number> | null} The 4-element covector, or null if it's undefined (e.g., for the identity).
 */
function getCovectorForMatrix(g2x2) {
    // Helper: Map 4-vector to Hermitian matrix
    const hermitianFromVec = (v) => {
        const [x, y, z, t] = v;
        return [[C(t + z, 0), C(x, y)], [C(x, -y), C(t - z, 0)]];
    };
    // Helper: Map Hermitian matrix to 4-vector
    const vecFromHermitian = (H) => {
        const x = H[0][1].re;
        const y = H[0][1].im;
        const z = (H[0][0].re - H[1][1].re) / 2;
        const t = (H[0][0].re + H[1][1].re) / 2;
        return [x, y, z, t];
    };

    const gAdjoint = cMatAdjoint2(g2x2);
    const basisVectors4d = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const ETA_DIAG = [-1, -1, -1, 1];

    const lambdaColumns = basisVectors4d.map(v => {
        const H = hermitianFromVec(v);
        const H_transformed = cMatMul2(cMatMul2(g2x2, H), gAdjoint);
        return vecFromHermitian(H_transformed);
    });

    const Lambda = Array.from({ length: 4 }, (_, r) => lambdaColumns.map(col => col[r]));

    for (let j = 3; j >= 0; j--) {
        const e_j = basisVectors4d[j];
        const g_inv_col_j = Array(4).fill(0).map((_, i) => ETA_DIAG[i] * Lambda[j][i] * ETA_DIAG[j]);
        const w = g_inv_col_j;
        const s_j = ETA_DIAG[j];
        const denom = s_j * (w[j] - 1);

        if (Math.abs(denom) > 1e-8) {
            const u = w.map((val, idx) => val - e_j[idx]);
            let row = u.map((val, idx) => val * ETA_DIAG[idx]);

            let lastNonzeroIdx = -1;
            for (let k = 3; k >= 0; k--) {
                if (Math.abs(row[k]) > 1e-12) {
                    lastNonzeroIdx = k;
                    break;
                }
            }
            if (lastNonzeroIdx !== -1 && row[lastNonzeroIdx] > 0) {
                row = row.map(val => -val);
            }
            return row;
        }
    }
    return null; // Covector is undefined (e.g., for Identity)
}

/**
 * Filters a list of covectors to find those that define faces of a convex polyhedron.
 * This is a JavaScript implementation of the cone-based filtering algorithm.
 *
 * @param {Array<Array<number>>} rows - An array of 4-element covectors [a,b,c,d].
 * @returns {Array<number>} An array of indices corresponding to the face-defining rows.
 */
function filterFaceDefiningCovectorsCone(rows) {
    const EPS = 1e-5;
    const R = 1e6;
    const STRICT = 1e-9;

    // --- Geometric helpers ---
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm2 = (a) => Math.hypot(a[0], a[1], a[2]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
    const __cosBetween = (a, b) => {
        const da = norm2(a), db = norm2(b);
        if (da === 0 || db === 0) return 1;
        return dot3(a, b) / (da * db);
    };

    const rowsOriented = rows.map(r => [+r[0], +r[1], +r[2], -r[3]]);
    const A = rowsOriented.map(r => [r[0], r[1], r[2]]);
    const D = rowsOriented.map(r => r[3]);

    const survivors = [];

    for (let i = 0; i < rowsOriented.length; i++) {
        const ai = A[i];
        const di = D[i];
        const aNorm2 = norm2(ai);
        if (aNorm2 <= EPS) continue;

        const x0 = scale(ai, di / (aNorm2 * aNorm2));

        let u1, u2;
        {
            let helper = Math.abs(ai[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
            u1 = cross(ai, helper);
            let n1 = norm2(u1);
            if (n1 < 1e-12) { helper = [0, 0, 1]; u1 = cross(ai, helper); n1 = norm2(u1); }
            if (n1 < 1e-12) continue;
            u1 = scale(u1, 1 / n1);
            u2 = cross(ai, u1);
            const n2 = norm2(u2);
            if (n2 < 1e-12) continue;
            u2 = scale(u2, 1 / n2);
        }

        let poly = [[-R, -R], [R, -R], [R, R], [-R, R]];
        let infeasible = false;

        for (let j = 0; j < rowsOriented.length; j++) {
            if (i === j) continue;
            const aj = A[j], dj = D[j];
            const alpha = -(dot3(aj, u1));
            const beta = -(dot3(aj, u2));
            const gamma = -(dot3(aj, x0)) + dj;

            if (Math.abs(alpha) < 1e-5 && Math.abs(beta) < 1e-5) {
                if (gamma < -EPS) { infeasible = true; break; }
                continue;
            }

            const clipHalfPlane = (p_in, A_c, B_c, C_c) => {
                if (!p_in || p_in.length === 0) return [];
                const p_out = [];
                const evalPt = p => A_c * p[0] + B_c * p[1] + (C_c - STRICT);
                for (let k = 0; k < p_in.length; k++) {
                    const P = p_in[k], Q = p_in[(k + 1) % p_in.length];
                    const fP = evalPt(P), fQ = evalPt(Q);
                    if (fP >= -EPS) p_out.push(P);
                    if ((fP < -EPS && fQ >= -EPS) || (fP >= -EPS && fQ < -EPS)) {
                        const denom = (A_c * (Q[0] - P[0]) + B_c * (Q[1] - P[1]));
                        if (Math.abs(denom) > 1e-18) {
                            const t = - (A_c * P[0] + B_c * P[1] + (C_c - STRICT)) / denom;
                            p_out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
                        }
                    }
                }
                return p_out;
            }
            poly = clipHalfPlane(poly, alpha, beta, gamma);
            if (poly.length < 3) { infeasible = true; break; }
        }

        if (!infeasible) {
            survivors.push(i);
        }
    }

    const keep = [];
    const used = new Array(survivors.length).fill(false);
    for (let ii = 0; ii < survivors.length; ii++) {
        if (used[ii]) continue;
        const i = survivors[ii];
        const ni = A[i], di = D[i];
        let bestIdx = i, bestD = di;
        for (let jj = ii + 1; jj < survivors.length; jj++) {
            if (used[jj]) continue;
            const j = survivors[jj];
            const nj = A[j], dj = D[j];
            if (__cosBetween(ni, nj) > 1 - 1e-4) {
                if (dj < bestD - 1e-9) { bestD = dj; bestIdx = j; }
                used[jj] = true;
            }
        }
        used[ii] = true;
        keep.push(bestIdx);
    }

    return Array.from(new Set(keep.sort((a, b) => a - b)));
}


/**
 * Main orchestration function. Generates group elements, computes their covectors,
 * and filters them to find the face-defining ones.
 *
 * @param {Array<Array<Array<{re: number, im: number}>>>} generatorMatrices - The set of generator matrices for the group.
 * @param {number} wordLength - The maximum length of words to generate.
 * @returns {Array<{word: string, covector: Array<number>, matrix: Array<Array<{re: number, im: number}>>}>}
 * An array of objects, each representing a face of the fundamental polyhedron.
 */
function calculateFaceDefiningCovectors(generatorMatrices, wordLength) {
    // 1. Generate all group elements (words) up to the specified length
    const words = generateWords2x2Complex(generatorMatrices, wordLength);

    // 2. For each word, compute its sDF covector
    const wordsWithCovectors = words.map(wordObj => {
        const covector = getCovectorForMatrix(wordObj.m);
        return { ...wordObj, covector };
    }).filter(item => item.covector !== null); // Filter out failures (like Identity)

    // 3. Extract the covectors to pass to the filtering algorithm
    const allCovectors = wordsWithCovectors.map(item => item.covector);

    // 4. Run the filtering algorithm to get the indices of the face-defining covectors
    const faceIndices = filterFaceDefiningCovectorsCone(allCovectors);

    // 5. Use the indices to retrieve the original words and covectors
    const rawFaces = faceIndices.map(index => wordsWithCovectors[index]);

    // 6. Group faces by their normalized half-space to find the best (shortest) word for each unique face
    const __hsNormalize = (v, EPS_HS = 1e-12) => {
        let [a, b, c, d] = v;
        if (d < -EPS_HS) { a = -a; b = -b; c = -c; d = -d; }
        if (Math.abs(d) > EPS_HS) {
            const s = 1 / d; return [a * s, b * s, c * s, 1];
        } else {
            const n = Math.hypot(a, b, c) || 1; return [a / n, b / n, c / n, 0];
        }
    };
    const __hsKey = (v) => __hsNormalize(v).map(x => +x.toFixed(9)).join(',');
    const wordCost = (w) => (w.match(/⋅/g) || []).length + 1; // Cost is number of generators

    const faceMap = new Map();
    for (const face of rawFaces) {
        const key = __hsKey(face.covector);
        const existing = faceMap.get(key);
        if (!existing || wordCost(face.word) < wordCost(existing.word)) {
            faceMap.set(key, face);
        }
    }

    return Array.from(faceMap.values()).map(f => ({
        word: f.word,
        covector: f.covector,
        matrix: f.m
    }));
}