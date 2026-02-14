/**
 * math.js — Core mathematics for pseudomodular groups Δ(u², 2τ)
 *
 * References:
 *   D.D. Long & A.W. Reid, "Pseudomodular surfaces"
 *   J. Differential Geometry 62 (2002) 209–228.
 */

// ─── Rational Arithmetic ──────────────────────────────────────

function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
}

/** Parse a string like "5/7", "3", "0.5" into { num, den } */
function parseRational(s) {
    s = s.trim();
    if (s.includes('/')) {
        const parts = s.split('/');
        const n = parseInt(parts[0], 10);
        const d = parseInt(parts[1], 10);
        if (isNaN(n) || isNaN(d) || d === 0) return null;
        const g = gcd(Math.abs(n), Math.abs(d));
        const sign = (d < 0) ? -1 : 1;
        return { num: sign * n / g, den: sign * d / g };
    }
    const v = parseFloat(s);
    if (isNaN(v)) return null;
    // Convert decimal to fraction (limited precision)
    if (Number.isInteger(v)) return { num: v, den: 1 };
    // Try to find a small denominator
    for (let d = 1; d <= 10000; d++) {
        const n = Math.round(v * d);
        if (Math.abs(n / d - v) < 1e-12) {
            const g = gcd(Math.abs(n), d);
            return { num: n / g, den: d / g };
        }
    }
    return null;
}

function rationalToFloat(r) { return r.num / r.den; }

function rationalToString(r) {
    if (r.den === 1) return `${r.num}`;
    return `${r.num}/${r.den}`;
}

// ─── 2×2 Matrix Operations ─────────────────────────────────────
// Matrices as [a, b, c, d] representing [[a, b], [c, d]]

function matMul(m1, m2) {
    return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3]
    ];
}

function matInv(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(det) < 1e-15) return null;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
}

function matDet(m) {
    return m[0] * m[3] - m[1] * m[2];
}

function matTrace(m) {
    return m[0] + m[3];
}

function matIdentity() {
    return [1, 0, 0, 1];
}

function matEqual(m1, m2, eps = 1e-9) {
    return Math.abs(m1[0] - m2[0]) < eps &&
        Math.abs(m1[1] - m2[1]) < eps &&
        Math.abs(m1[2] - m2[2]) < eps &&
        Math.abs(m1[3] - m2[3]) < eps;
}

// ─── Möbius Transformations ────────────────────────────────────

function mobiusReal(m, x) {
    if (!Number.isFinite(x)) {
        return Math.abs(m[2]) < 1e-14 ? Infinity : m[0] / m[2];
    }
    const den = m[2] * x + m[3];
    if (Math.abs(den) < 1e-14) return Infinity;
    return (m[0] * x + m[1]) / den;
}

function mobiusComplex(m, z) {
    const numRe = m[0] * z.re + m[1];
    const numIm = m[0] * z.im;
    const denRe = m[2] * z.re + m[3];
    const denIm = m[2] * z.im;
    const denAbs2 = denRe * denRe + denIm * denIm;
    if (denAbs2 < 1e-28) return { re: Infinity, im: Infinity };
    return {
        re: (numRe * denRe + numIm * denIm) / denAbs2,
        im: (numIm * denRe - numRe * denIm) / denAbs2
    };
}

function classifyElement(m) {
    const tr = Math.abs(matTrace(m));
    if (Math.abs(tr - 2) < 1e-8) return 'parabolic';
    if (tr > 2) return 'hyperbolic';
    return 'elliptic';
}

/** Fixed point(s) of a Möbius transformation on ℝ ∪ {∞} */
function fixedPoints(m) {
    const a = m[0], b = m[1], c = m[2], d = m[3];
    if (Math.abs(c) < 1e-14) {
        // c = 0: infinity is fixed, other fixed point is b/(d-a) if a ≠ d
        if (Math.abs(a - d) < 1e-14) return [Infinity]; // identity-like
        return [Infinity, b / (d - a)];
    }
    // Solve c*x² + (d-a)*x - b = 0
    const disc = (d - a) * (d - a) + 4 * b * c;
    if (disc < -1e-14) return []; // no real fixed points
    if (disc < 1e-14) {
        return [(a - d) / (2 * c)];
    }
    const s = Math.sqrt(disc);
    return [
        (a - d + s) / (2 * c),
        (a - d - s) / (2 * c)
    ];
}

// ─── Group Generators for Δ(u², 2τ) ───────────────────────────
// From Long-Reid:
//   g₁ = (1/√(τ-1-u²)) · [[τ-1, u²], [1, 1]]
//   g₂ = (1/√(τ-1-u²)) · [[u, u], [1/u, (τ-u²)/u]]
// where u = √(u²)

function computeGenerators(u2, tau) {
    const scale2 = tau - 1 - u2;
    if (scale2 <= 0) return null; // Invalid parameters

    const scale = Math.sqrt(scale2);
    const u = Math.sqrt(u2);

    const g1 = [
        (tau - 1) / scale, u2 / scale,
        1 / scale, 1 / scale
    ];

    const g2 = [
        u / scale, u / scale,
        1 / (u * scale), (tau - u2) / (u * scale)
    ];

    return { g1, g2, scale, u };
}

/** Compute the commutator [g1, g2^{-1}] = g1 * g2^{-1} * g1^{-1} * g2 */
function computeCommutator(g1, g2) {
    const g2inv = matInv(g2);
    const g1inv = matInv(g1);
    if (!g2inv || !g1inv) return null;
    return matMul(matMul(matMul(g1, g2inv), g1inv), g2);
}

// ─── Cusp Orbits and Killer Intervals ──────────────────────────

/**
 * Enumerate cusp orbit by BFS on group elements up to maxDepth.
 * Returns an array of { cusp, word, matrix } where cusp ∈ ℚ ∪ {∞}
 */
function enumerateCusps(g1, g2, maxDepth, maxDenom) {
    const g1inv = matInv(g1);
    const g2inv = matInv(g2);
    if (!g1inv || !g2inv) return [];

    const gens = [
        { mat: g1, label: 'g₁' },
        { mat: g1inv, label: 'g₁⁻¹' },
        { mat: g2, label: 'g₂' },
        { mat: g2inv, label: 'g₂⁻¹' }
    ];

    const cusps = new Map(); // key -> { cusp, word, matrix }
    const queue = [{ mat: matIdentity(), word: 'e', depth: 0 }];
    const visited = new Set();
    const MAX_QUEUE = 100000;

    function matKeyRound(m) {
        return m.map(x => x.toFixed(5)).join(',');
    }

    function cuspKey(x) {
        if (!Number.isFinite(x)) return 'inf';
        // Round to avoid floating-point duplicates
        const r = Math.round(x * 1e8) / 1e8;
        return r.toString();
    }

    // The "base cusp" is infinity (parabolic fixed point)
    cusps.set('inf', { cusp: Infinity, word: 'e', matrix: matIdentity() });
    visited.add(matKeyRound(matIdentity()));

    while (queue.length > 0) {
        const { mat, word, depth } = queue.shift();
        if (depth >= maxDepth) continue;

        for (const gen of gens) {
            const newMat = matMul(gen.mat, mat);
            const mkey = matKeyRound(newMat);
            if (visited.has(mkey)) continue;
            visited.add(mkey);

            const newWord = depth === 0 && word === 'e' ? gen.label :
                gen.label + '·' + word;

            // Image of infinity under this group element
            const cusp = mobiusReal(newMat, Infinity);
            const key = cuspKey(cusp);

            if (!cusps.has(key)) {
                // Check denominator bound for rational cusps
                if (Number.isFinite(cusp)) {
                    // Find best rational approximation
                    const frac = findRational(cusp, maxDenom);
                    if (frac && Math.abs(frac.num / frac.den - cusp) < 1e-8) {
                        cusps.set(key, {
                            cusp: frac.num / frac.den,
                            rational: frac,
                            word: word === 'e' ? gen.label : gen.label + '·' + word,
                            matrix: newMat,
                            depth: depth + 1
                        });
                    }
                }
            }

            // Also map 0 (another natural cusp)
            const cusp0 = mobiusReal(newMat, 0);
            const key0 = cuspKey(cusp0);
            if (!cusps.has(key0) && Number.isFinite(cusp0)) {
                const frac0 = findRational(cusp0, maxDenom);
                if (frac0 && Math.abs(frac0.num / frac0.den - cusp0) < 1e-8) {
                    cusps.set(key0, {
                        cusp: frac0.num / frac0.den,
                        rational: frac0,
                        word: (word === 'e' ? gen.label : gen.label + '·' + word) + '(0)',
                        matrix: newMat,
                        depth: depth + 1
                    });
                }
            }

            if (queue.length < MAX_QUEUE) {
                queue.push({ mat: newMat, word: newWord, depth: depth + 1 });
            }
        }
    }

    return Array.from(cusps.values());
}

/** Find the best rational approximation p/q with |q| ≤ maxDen */
function findRational(x, maxDen) {
    if (!Number.isFinite(x)) return null;

    let bestNum = Math.round(x);
    let bestDen = 1;
    let bestErr = Math.abs(x - bestNum);

    for (let q = 1; q <= maxDen; q++) {
        const p = Math.round(x * q);
        const err = Math.abs(x - p / q);
        if (err < bestErr - 1e-14) {
            bestErr = err;
            bestNum = p;
            bestDen = q;
        }
        if (bestErr < 1e-12) break;
    }

    if (bestErr > 1e-6) return null;
    const g = gcd(Math.abs(bestNum), bestDen);
    return { num: bestNum / g, den: bestDen / g };
}

/**
 * Compute the killer interval for a cusp α₀/β₀.
 *
 * A killer interval I(α₀/β₀, k) = (α₀/β₀ - 1/(k·β₀²), α₀/β₀ + 1/(k·β₀²))
 *
 * The contraction constant k is found by examining which group element
 * maps ∞ to α₀/β₀ and checking how much the derivative contracts.
 *
 * For a matrix g = [[a,b],[c,d]] mapping ∞ → a/c = α₀/β₀,
 * the contraction constant is |det(g)| · c² = (ad-bc) · c².
 * Since det(g) = 1 for our normalized generators, k = c².
 * But more precisely, k = |ad - bc| / det interpretation.
 *
 * Actually, for the matrix that maps ∞ ↦ α/β, if g = [[a,b],[c,d]],
 * then g(∞) = a/c. The stabilizer of ∞ in Γ is generated by
 * z ↦ z + 2τ (the commutator). The killer interval around a/c has
 * half-width 2τ/(2c²) = τ/c² (by the theory of Ford circles/isometric circles).
 *
 * Actually: the killer interval for cusp p/q (in lowest terms) w.r.t.
 * the translation z ↦ z+2τ is (p/q - τ/q², p/q + τ/q²).
 * This comes from the isometric circle of the group element.
 */
function computeKillerIntervals(cusps, tau) {
    const intervals = [];

    for (const cuspData of cusps) {
        const c = cuspData.cusp;
        if (!Number.isFinite(c)) continue;

        const frac = cuspData.rational;
        if (!frac) continue;

        const p = frac.num;
        const q = frac.den;

        // Killer interval: (p/q - τ/q², p/q + τ/q²)
        // But we need the contraction constant k specific to the group action.
        // For the standard theory: half-width = 1/(k*q²) where k depends on the
        // group element mapping ∞ to p/q.
        //
        // From the matrix g mapping ∞ → p/q:
        //   g = [[a,b],[c,d]] with a/c = p/q
        //   The isometric circle has radius 1/|c| (for det = 1 matrices)
        //   This gives killer interval half-width = 1/c² · τ_∞ where τ_∞ = 2τ
        //   But |c| relates to q: if a/c = p/q in lowest terms, then c = q·(det/...).
        //
        // For our normalized matrices with det = 1:
        //   If g(∞) = a/c = p/q and gcd(p,q) = 1, then |c| ≥ |q|.
        //   The strongest (widest) killer interval uses the element with smallest |c|.
        //
        // We use the actual matrix: half-width = 1/c² where c is the (2,1) entry.

        let halfWidth;
        if (cuspData.matrix) {
            const cEntry = Math.abs(cuspData.matrix[2]);
            if (cEntry > 1e-10) {
                // For det-1 matrices, the isometric circle radius is 1/|c|
                // The cusp width from the parabolic element with translation 2τ
                // gives killer interval half-width = τ / c²|det|
                const det = Math.abs(matDet(cuspData.matrix));
                halfWidth = tau / (cEntry * cEntry / det);
            } else {
                // c ≈ 0 means cusp at infinity
                halfWidth = tau;
            }
        } else {
            // Fallback: use q
            halfWidth = tau / (q * q);
        }

        intervals.push({
            center: c,
            halfWidth: halfWidth,
            left: c - halfWidth,
            right: c + halfWidth,
            cusp: frac,
            cuspValue: c,
            word: cuspData.word,
            depth: cuspData.depth || 0
        });
    }

    return intervals;
}

/**
 * Check what fraction of [0, 2τ] is covered by the union of killer intervals.
 * Returns { coverage, uncoveredRegions }
 */
function computeCoverage(intervals, tau) {
    const rangeLeft = 0;
    const rangeRight = 2 * tau;

    // Clip intervals to [0, 2τ] and merge
    const clipped = [];
    for (const iv of intervals) {
        const l = Math.max(iv.left, rangeLeft);
        const r = Math.min(iv.right, rangeRight);
        if (l < r) clipped.push({ left: l, right: r });
    }

    clipped.sort((a, b) => a.left - b.left);

    // Merge overlapping intervals
    const merged = [];
    for (const iv of clipped) {
        if (merged.length === 0 || iv.left > merged[merged.length - 1].right + 1e-12) {
            merged.push({ left: iv.left, right: iv.right });
        } else {
            merged[merged.length - 1].right = Math.max(merged[merged.length - 1].right, iv.right);
        }
    }

    // Compute coverage
    let coveredLength = 0;
    for (const iv of merged) {
        coveredLength += iv.right - iv.left;
    }

    const totalLength = rangeRight - rangeLeft;
    const coverage = totalLength > 0 ? coveredLength / totalLength : 0;

    // Find uncovered regions
    const uncovered = [];
    let pos = rangeLeft;
    for (const iv of merged) {
        if (iv.left > pos + 1e-12) {
            uncovered.push({ left: pos, right: iv.left });
        }
        pos = iv.right;
    }
    if (pos < rangeRight - 1e-12) {
        uncovered.push({ left: pos, right: rangeRight });
    }

    return { coverage, coveredLength, totalLength, merged, uncovered };
}

// ─── Fundamental Domain (Ideal Quadrilateral) ──────────────────

/**
 * Compute the ideal quadrilateral vertices for Δ(u², 2τ).
 * The four ideal vertices on ℝ are: -1, 0, u², ∞
 * g₁ maps edge (-1,0) → (∞, u²)
 * g₂ maps edge (∞, -1) → (0, u²)
 */
function fundamentalDomainVertices(u2) {
    return [-1, 0, u2, Infinity];
}

// ─── Export ────────────────────────────────────────────────────

window.PseudoMath = {
    parseRational,
    rationalToFloat,
    rationalToString,
    gcd,
    matMul,
    matInv,
    matDet,
    matTrace,
    matIdentity,
    matEqual,
    mobiusReal,
    mobiusComplex,
    classifyElement,
    fixedPoints,
    computeGenerators,
    computeCommutator,
    enumerateCusps,
    findRational,
    computeKillerIntervals,
    computeCoverage,
    fundamentalDomainVertices
};
