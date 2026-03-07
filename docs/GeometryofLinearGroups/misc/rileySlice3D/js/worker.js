// ============================================================
//  worker.js — Web Worker for discreteness computation
//  BFS over reduced words in <U, L> ⊂ SL(3,R)
// ============================================================

// 3×3 matrices stored as Float64Array(9), row-major: mat[r*3 + c]

function mat3Mul(A, B, out) {
    for (let r = 0; r < 3; r++) {
        const r3 = r * 3;
        for (let c = 0; c < 3; c++) {
            out[r3 + c] = A[r3] * B[c] + A[r3 + 1] * B[3 + c] + A[r3 + 2] * B[6 + c];
        }
    }
}

function frobDistSq(M) {
    // ||M - I||_F^2
    let s = 0;
    for (let i = 0; i < 9; i++) {
        const d = M[i] - ((i % 4 === 0) ? 1 : 0);
        s += d * d;
    }
    return s;
}

function buildGenerators(a, b, c) {
    const ac = a * c;
    return [
        new Float64Array([1, a, b, 0, 1, c, 0, 0, 1]),         // U   (index 0)
        new Float64Array([1, 0, 0, a, 1, 0, b, c, 1]),         // L   (index 1)
        new Float64Array([1, -a, ac - b, 0, 1, -c, 0, 0, 1]),  // U⁻¹ (index 2)
        new Float64Array([1, 0, 0, -a, 1, 0, ac - b, -c, 1]),  // L⁻¹ (index 3)
    ];
}

// Inverse pairing: gen i cancels with gen (i ^ 2)
// 0 (U) <-> 2 (U⁻¹),  1 (L) <-> 3 (L⁻¹)

function computeMinDist(a, b, c, maxDepth, epsSq) {
    const gens = buildGenerators(a, b, c);
    let minDistSq = Infinity;

    // Frontier: array of { mat: Float64Array(9), lastGen: int }
    // Level 1: all 4 generators
    let frontier = [];
    for (let g = 0; g < 4; g++) {
        const d = frobDistSq(gens[g]);
        if (d < minDistSq) minDistSq = d;
        if (minDistSq < epsSq) return Math.sqrt(minDistSq);
        frontier.push({ mat: new Float64Array(gens[g]), lastGen: g });
    }

    const tmp = new Float64Array(9);

    for (let depth = 2; depth <= maxDepth; depth++) {
        const next = [];
        for (let fi = 0; fi < frontier.length; fi++) {
            const node = frontier[fi];
            const inv = node.lastGen ^ 2;
            for (let g = 0; g < 4; g++) {
                if (g === inv) continue;
                mat3Mul(node.mat, gens[g], tmp);
                const d = frobDistSq(tmp);
                if (d < minDistSq) minDistSq = d;
                if (minDistSq < epsSq) return Math.sqrt(minDistSq);
                next.push({ mat: new Float64Array(tmp), lastGen: g });
            }
        }
        frontier = next;
    }

    return Math.sqrt(minDistSq);
}

// ── 8-fold symmetry ────────────────────────────────────────
// Sign symmetries (ε₁ε₂ε₃ = +1):
//   (a,b,c), (-a,b,-c), (-a,-b,c), (a,-b,-c)
// Swap symmetry: (a,b,c) <-> (c,b,a)
// Full orbit of (a,b,c):
//   (a,b,c), (-a,b,-c), (-a,-b,c), (a,-b,-c),
//   (c,b,a), (-c,b,-a), (-c,-b,a), (c,-b,-a)

function gridIndex(ix, iy, iz, res) {
    return ix * res * res + iy * res + iz;
}

function coordToIndex(val, lo, step) {
    return Math.round((val - lo) / step);
}

self.onmessage = function (e) {
    const { resolution: res, depth, epsilon } = e.data;
    const lo = -2, hi = 2;
    const step = (hi - lo) / (res - 1);
    const epsSq = epsilon * epsilon;

    const data = new Float32Array(res * res * res);
    data.fill(NaN); // NaN = not yet computed

    // Count fundamental domain points for progress
    let totalPoints = 0;
    for (let ia = 0; ia < res; ia++) {
        const a = lo + ia * step;
        if (a < 0) continue;
        for (let ib = 0; ib < res; ib++) {
            const b = lo + ib * step;
            if (b < 0) continue;
            for (let ic = 0; ic < res; ic++) {
                const c = lo + ic * step;
                if (Math.abs(c) > a + step * 0.01) continue; // |c| <= a
                totalPoints++;
            }
        }
    }

    let pointsDone = 0;
    let lastProgress = 0;

    // Compute fundamental domain
    for (let ia = 0; ia < res; ia++) {
        const a = lo + ia * step;
        if (a < 0) continue;

        for (let ib = 0; ib < res; ib++) {
            const b = lo + ib * step;
            if (b < 0) continue;

            for (let ic = 0; ic < res; ic++) {
                const c = lo + ic * step;
                if (Math.abs(c) > a + step * 0.01) continue;

                const minDist = computeMinDist(a, b, c, depth, epsSq);
                const logVal = Math.log(Math.max(minDist, 1e-15));

                // Write to all 8 symmetric images
                const orbits = [
                    [a, b, c], [-a, b, -c], [-a, -b, c], [a, -b, -c],
                    [c, b, a], [-c, b, -a], [-c, -b, a], [c, -b, -a],
                ];

                for (const [oa, ob, oc] of orbits) {
                    const ja = coordToIndex(oa, lo, step);
                    const jb = coordToIndex(ob, lo, step);
                    const jc = coordToIndex(oc, lo, step);
                    if (ja >= 0 && ja < res && jb >= 0 && jb < res && jc >= 0 && jc < res) {
                        data[gridIndex(ja, jb, jc, res)] = logVal;
                    }
                }

                pointsDone++;
                const pct = pointsDone / totalPoints;
                if (pct - lastProgress > 0.02) {
                    lastProgress = pct;
                    self.postMessage({ type: 'progress', percent: pct });
                }
            }
        }
    }

    // Transfer the buffer (zero-copy)
    const buffer = data.buffer;
    self.postMessage({ type: 'result', data, resolution: res }, [buffer]);
};
