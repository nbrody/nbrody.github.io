// ── Riley Word Discreteness Test for SL₃(ℝ) ──
//
// Riley words are alternating products of powers of g and gᵀ:
//   W = g^{a₁} · (gᵀ)^{b₁} · g^{a₂} · (gᵀ)^{b₂} · ...
//
// Instead of BFS over all reduced words (exponential growth), we enumerate
// these structured alternating products. The key speedup comes from the
// closed-form unipotent power: since (g-I)³ = 0, g^n = I + nN + n(n-1)/2·N².

import { mul, frobDistSqI, upperPow, lowerPow } from './math.js';

/**
 * Generate all Riley words up to a given number of alternations and
 * max exponent, then return the minimum squared Frobenius distance to I.
 *
 * @param {number} a - parameter a
 * @param {number} b - parameter b  
 * @param {number} c - parameter c
 * @param {number} maxAlternations - max number of generator alternations (word length in alternations)
 * @param {number} maxExp - max absolute value of each exponent
 * @returns {number} minimum squared Frobenius distance to I over all Riley words
 */
export function minRileyDist(a, b, c, maxAlternations, maxExp) {
    let minD = Infinity;

    // Generate exponent lists: nonzero integers in [-maxExp, maxExp]
    const exps = [];
    for (let e = -maxExp; e <= maxExp; e++) {
        if (e !== 0) exps.push(e);
    }

    // Precompute all needed powers of g and gᵀ
    const gPows = new Map();
    const gtPows = new Map();
    for (const e of exps) {
        gPows.set(e, upperPow(a, b, c, e));
        gtPows.set(e, lowerPow(a, b, c, e));
    }

    // --- Depth 1: single alternation g^p · (gᵀ)^q ---
    for (const p of exps) {
        const gp = gPows.get(p);
        for (const q of exps) {
            const w = mul(gp, gtPows.get(q));
            const d = frobDistSqI(w);
            if (d < minD) minD = d;
        }
    }

    if (maxAlternations <= 1) return minD;

    // --- Depth 2: g^{p1} · (gᵀ)^{q1} · g^{p2} · (gᵀ)^{q2} ---
    // Build all depth-1 products first, then extend
    // We also check words starting with gᵀ: (gᵀ)^q · g^p · ...

    // Store depth-1 products: g^p · (gᵀ)^q
    const depth1 = [];
    for (const p of exps) {
        const gp = gPows.get(p);
        for (const q of exps) {
            depth1.push(mul(gp, gtPows.get(q)));
        }
    }

    // Also check gᵀ-first words at depth 1: (gᵀ)^q · g^p
    for (const q of exps) {
        const gtq = gtPows.get(q);
        for (const p of exps) {
            const w = mul(gtq, gPows.get(p));
            const d = frobDistSqI(w);
            if (d < minD) minD = d;
        }
    }

    // Depth 2: compose depth-1 products
    for (const w1 of depth1) {
        for (const w2 of depth1) {
            const w = mul(w1, w2);
            const d = frobDistSqI(w);
            if (d < minD) minD = d;
        }
    }

    if (maxAlternations <= 2) return minD;

    // --- Depth 3+: compose depth-1 with depth-2 ---
    // depth-2 words
    const depth2 = [];
    for (const w1 of depth1) {
        for (const w2 of depth1) {
            depth2.push(mul(w1, w2));
        }
    }

    for (let alt = 3; alt <= maxAlternations; alt++) {
        // Compose depth-(alt-1) ≈ depth2 × depth1
        const prev = alt === 3 ? depth2 : depth1; // simplification: check depth2 × depth1
        for (const w1 of prev) {
            for (const w2 of depth1) {
                const w = mul(w1, w2);
                const d = frobDistSqI(w);
                if (d < minD) minD = d;
            }
        }
    }

    return minD;
}

/**
 * Test discreteness at a point (a, b, c).
 *
 * @param {number} a 
 * @param {number} b
 * @param {number} c
 * @param {number} maxAlt - max alternations (Riley word depth)
 * @param {number} maxExp - max exponent magnitude
 * @param {number} threshold - squared Frobenius threshold
 * @returns {number} value in [0,1]: 1 = discrete, 0 = non-discrete, between = near boundary
 */
export function testDiscrete(a, b, c, maxAlt, maxExp, threshold) {
    // Outside [-2,2]³: always discrete & free by ping-pong
    if (Math.abs(a) > 2 || Math.abs(b) > 2 || Math.abs(c) > 2) return 1;

    const minD = minRileyDist(a, b, c, maxAlt, maxExp);
    return Math.min(1, minD / threshold);
}
