/**
 * math.js — Lorentzian geometry, SO(2,1), crooked planes, and Margulis invariants
 * 
 * Inner product: <v, w> = v[0]*w[0] + v[1]*w[1] - v[2]*w[2]
 * SO(2,1) preserves this form (signature 2,1).
 * 
 * Generators are obtained via the adjoint representation:
 *   SL(2,Z) → SO(2,1) via Ad: g ↦ (X ↦ gXg⁻¹)
 * on sl(2,R) with orthogonal basis {E+F, H, E−F} giving form diag(1,1,-1).
 */

/* =========================================
   VECTOR / MATRIX OPERATIONS
   ========================================= */

export function lorentzDot(v, w) {
    return v[0] * w[0] + v[1] * w[1] - v[2] * w[2];
}

export function lorentzNormSq(v) { return lorentzDot(v, v); }

export function lorentzCross(u, v) {
    return [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        -(u[0] * v[1] - u[1] * v[0])
    ];
}

export function vecAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function vecScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function vecLen(a) { return Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2); }
export function vecNormalize(a) { const l = vecLen(a); return l > 1e-12 ? vecScale(a, 1 / l) : [0, 0, 0]; }
export function eucDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export function matVec(M, v) {
    return [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
    ];
}

export function matMul(A, B) {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            for (let k = 0; k < 3; k++)
                C[i][j] += A[i][k] * B[k][j];
    return C;
}

export function matTranspose(M) {
    return [
        [M[0][0], M[1][0], M[2][0]],
        [M[0][1], M[1][1], M[2][1]],
        [M[0][2], M[1][2], M[2][2]]
    ];
}

export function matInverse(M) {
    const [[a, b, c], [d, e, f], [g, h, i]] = M;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return null;
    const invDet = 1 / det;
    return [
        [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
        [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
        [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet]
    ];
}

export function matIdentity() {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

export function matLerp(A, B, t) {
    return A.map((row, i) => row.map((val, j) => val * (1 - t) + B[i][j] * t));
}


/* =========================================
   SO(2,1) GENERATORS via Adjoint Representation
   
   SL(2,R) acts on sl(2,R) by conjugation: Ad(g)(X) = gXg⁻¹.
   Basis: u₁ = E+F, u₂ = H, u₃ = E−F.
   The trace form B(X,Y) = tr(XY) gives diag(2, 2, −2) ∼ diag(1, 1, −1).
   
   We use two hyperbolic elements of SL(2,Z):
     g₁ = [[2,1],[1,1]]  (trace 3)
     g₂ = [[1,1],[1,2]]  (trace 3, transpose of g₁)
   ========================================= */

function adjointRep(g) {
    const [a, b, c, d] = [g[0][0], g[0][1], g[1][0], g[1][1]];
    return [
        [
            (a * a - b * b + d * d - c * c) / 2,
            c * d - a * b,
            (a * a + b * b - d * d - c * c) / 2
        ],
        [
            b * d - a * c,
            a * d + b * c,
            -b * d - a * c
        ],
        [
            (a * a - b * b - d * d + c * c) / 2,
            -a * b - c * d,
            (a * a + b * b + d * d + c * c) / 2
        ]
    ];
}

const g1_sl2 = [[2, 1], [1, 1]]; // trace = 3
const g2_sl2 = [[1, 1], [1, 2]]; // trace = 3 (transpose of g₁)

export const A1 = adjointRep(g1_sl2);
export const A2 = adjointRep(g2_sl2);

// Log the matrices for reference
console.log("SO(2,1) generators via Ad(SL(2,Z)):");
console.log("A1 =", A1.map(r => r.map(x => x.toFixed(2)).join(', ')).join(' | '));
console.log("A2 =", A2.map(r => r.map(x => x.toFixed(2)).join(', ')).join(' | '));


/* =========================================
   EIGENVECTOR ANALYSIS
   ========================================= */

/**
 * For a hyperbolic element A of SO₀(2,1), find eigenvectors:
 * - v⁺: expanding (eigenvalue λ > 1, lightlike)
 * - v⁻: contracting (eigenvalue 1/λ, lightlike)
 * - v⁰: neutral (eigenvalue 1, spacelike — the "axis")
 */
export function eigendata(A) {
    const a = A[0][0], b = A[0][1], c = A[0][2];
    const d = A[1][0], e = A[1][1], f = A[1][2];
    const g = A[2][0], h = A[2][1], k = A[2][2];

    const tr = a + e + k;
    const cof = (a * e - b * d) + (a * k - c * g) + (e * k - f * h);
    const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);

    const eigenvalues = solveCubic(1, -tr, cof, -det);

    // Find eigenvalue closest to 1 → neutral
    let neutralIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < eigenvalues.length; i++) {
        const dist = Math.abs(eigenvalues[i] - 1);
        if (dist < minDist) { minDist = dist; neutralIdx = i; }
    }

    const lambda0 = eigenvalues[neutralIdx];
    const others = eigenvalues.filter((_, i) => i !== neutralIdx);

    let lambdaPlus, lambdaMinus;
    if (Math.abs(others[0]) >= Math.abs(others[1])) {
        lambdaPlus = others[0];
        lambdaMinus = others[1];
    } else {
        lambdaPlus = others[1];
        lambdaMinus = others[0];
    }

    const vPlus = eigenVector(A, lambdaPlus);
    const vMinus = eigenVector(A, lambdaMinus);
    const v0 = eigenVector(A, lambda0);

    return {
        lambdaPlus, lambdaMinus, lambda0,
        vPlus, vMinus, v0,
        logLambda: Math.log(Math.abs(lambdaPlus))
    };
}

function solveCubic(a3, a2, a1, a0) {
    const a = a2 / a3, b = a1 / a3, c = a0 / a3;
    const p = b - a * a / 3;
    const q = 2 * a * a * a / 27 - a * b / 3 + c;
    const disc = q * q / 4 + p * p * p / 27;

    const roots = [];
    if (disc > 1e-12) {
        const u = Math.cbrt(-q / 2 + Math.sqrt(disc));
        const v = Math.cbrt(-q / 2 - Math.sqrt(disc));
        roots.push(u + v - a / 3);
    } else if (Math.abs(disc) < 1e-12) {
        const u = Math.cbrt(-q / 2);
        roots.push(2 * u - a / 3);
        roots.push(-u - a / 3);
    } else {
        const r = Math.sqrt(-p * p * p / 27);
        const theta = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
        const m = 2 * Math.cbrt(r);
        roots.push(m * Math.cos(theta / 3) - a / 3);
        roots.push(m * Math.cos((theta + 2 * Math.PI) / 3) - a / 3);
        roots.push(m * Math.cos((theta + 4 * Math.PI) / 3) - a / 3);
    }
    return roots;
}

/** Find eigenvector of 3×3 matrix for eigenvalue λ, via null space of (M - λI) */
function eigenVector(M, lambda) {
    const N = [
        [M[0][0] - lambda, M[0][1], M[0][2]],
        [M[1][0], M[1][1] - lambda, M[1][2]],
        [M[2][0], M[2][1], M[2][2] - lambda]
    ];

    const r0 = N[0], r1 = N[1], r2 = N[2];

    // Try all row-pair cross products, pick the one with largest norm
    const candidates = [
        eucCross(r0, r1),
        eucCross(r0, r2),
        eucCross(r1, r2)
    ];

    let best = candidates[0];
    let bestNorm = eucDot(best, best);
    for (let i = 1; i < candidates.length; i++) {
        const n = eucDot(candidates[i], candidates[i]);
        if (n > bestNorm) { best = candidates[i]; bestNorm = n; }
    }

    if (bestNorm < 1e-20) {
        // All rows zero or proportional — eigenspace is 2D+
        // Return a basis vector orthogonal to any non-zero row
        const nonZeroRow = [r0, r1, r2].find(r => eucDot(r, r) > 1e-20) || [1, 0, 0];
        if (Math.abs(nonZeroRow[0]) > 0.5) best = eucCross(nonZeroRow, [0, 1, 0]);
        else best = eucCross(nonZeroRow, [1, 0, 0]);
    }

    return vecNormalize(best);
}

function eucCross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}


/* =========================================
   MARGULIS INVARIANT AND TRANSLATIONS
   ========================================= */

/**
 * Choose translational parts b₁, b₂ so that the Margulis invariants
 * α(γᵢ) = ⟨bᵢ, vᵢ⁰⟩ are both positive (necessary for properness).
 * 
 * Simplest choice: bᵢ = scale · vᵢ⁰.
 */
export function computeTranslations(scale = 1.0) {
    const ed1 = eigendata(A1);
    const ed2 = eigendata(A2);

    const norm1 = lorentzDot(ed1.v0, ed1.v0);
    const norm2 = lorentzDot(ed2.v0, ed2.v0);

    // Ensure α > 0: b = scale * sign(⟨v⁰,v⁰⟩) * v⁰
    const b1 = vecScale(ed1.v0, scale * Math.sign(norm1));
    const b2 = vecScale(ed2.v0, scale * Math.sign(norm2));

    const alpha1 = lorentzDot(b1, ed1.v0);
    const alpha2 = lorentzDot(b2, ed2.v0);

    return { b1, b2, alpha1, alpha2, eigen1: ed1, eigen2: ed2 };
}


/* =========================================
   CROOKED PLANE GEOMETRY
   ========================================= */

/**
 * Build a crooked plane C(dir, vertex).
 * 
 * Components:
 * 1. STEM: the timelike/null part of (vertex + dir⊥), the region between
 *    the two null lines in dir⊥, forming a "wedge" at vertex.
 * 2. Two WINGS: half-planes hanging from each null line, extending in ±dir.
 */
export function buildCrookedPlane(dir, vertex, size = 2.5) {
    const nSq = lorentzDot(dir, dir);
    const n = vecScale(dir, 1 / Math.sqrt(Math.abs(nSq)));

    // Find two independent vectors in n⊥ (Lorentz-orthogonal to n)
    let w = [0, 0, 1];
    let proj = lorentzDot(w, n) / lorentzDot(n, n);
    w = vecSub(w, vecScale(n, proj));
    if (vecLen(w) < 1e-8) {
        w = [1, 0, 0];
        proj = lorentzDot(w, n) / lorentzDot(n, n);
        w = vecSub(w, vecScale(n, proj));
    }

    let u = [0, 1, 0];
    proj = lorentzDot(u, n) / lorentzDot(n, n);
    u = vecSub(u, vecScale(n, proj));
    if (Math.abs(lorentzDot(w, w)) > 1e-10) {
        proj = lorentzDot(u, w) / lorentzDot(w, w);
        u = vecSub(u, vecScale(w, proj));
    }
    if (vecLen(u) < 1e-8) {
        u = [1, 0, 0];
        proj = lorentzDot(u, n) / lorentzDot(n, n);
        u = vecSub(u, vecScale(n, proj));
        if (Math.abs(lorentzDot(w, w)) > 1e-10) {
            proj = lorentzDot(u, w) / lorentzDot(w, w);
            u = vecSub(u, vecScale(w, proj));
        }
    }

    // Null directions in n⊥: solve <aw + bu, aw + bu> = 0
    const ww = lorentzDot(w, w);
    const wu = lorentzDot(w, u);
    const uu = lorentzDot(u, u);
    const disc = wu * wu - ww * uu;

    let null1, null2;
    if (disc >= 0 && Math.abs(ww) > 1e-10) {
        const sqDisc = Math.sqrt(Math.max(0, disc));
        const a1 = (-wu + sqDisc) / ww;
        const a2 = (-wu - sqDisc) / ww;
        null1 = vecNormalize(vecAdd(vecScale(w, a1), u));
        null2 = vecNormalize(vecAdd(vecScale(w, a2), u));
    } else {
        null1 = vecNormalize(w);
        null2 = vecNormalize(u);
    }

    const S = size;
    const triangles = [];

    // --- STEM: fan from vertex between null1 and null2 ---
    const stemSegs = 20;
    for (let i = 0; i < stemSegs; i++) {
        const t0 = i / stemSegs;
        const t1 = (i + 1) / stemSegs;
        const v0 = vecAdd(vecScale(null1, 1 - t0), vecScale(null2, t0));
        const v1 = vecAdd(vecScale(null1, 1 - t1), vecScale(null2, t1));
        // Positive side
        triangles.push([[...vertex], vecAdd(vertex, vecScale(v0, S)), vecAdd(vertex, vecScale(v1, S))]);
        // Negative side
        triangles.push([[...vertex], vecAdd(vertex, vecScale(v0, -S)), vecAdd(vertex, vecScale(v1, -S))]);
    }

    // --- WINGS ---
    const wingSegs = 10;
    for (let i = 0; i < wingSegs; i++) {
        const t0 = (i / wingSegs) * S;
        const t1 = ((i + 1) / wingSegs) * S;

        // Wing 1: along ±null1, extending in +n
        for (const sgn of [1, -1]) {
            triangles.push([
                vecAdd(vertex, vecScale(null1, sgn * t0)),
                vecAdd(vertex, vecAdd(vecScale(null1, sgn * t0), vecScale(n, S))),
                vecAdd(vertex, vecScale(null1, sgn * t1))
            ]);
            triangles.push([
                vecAdd(vertex, vecScale(null1, sgn * t1)),
                vecAdd(vertex, vecAdd(vecScale(null1, sgn * t0), vecScale(n, S))),
                vecAdd(vertex, vecAdd(vecScale(null1, sgn * t1), vecScale(n, S)))
            ]);
        }

        // Wing 2: along ±null2, extending in -n
        for (const sgn of [1, -1]) {
            triangles.push([
                vecAdd(vertex, vecScale(null2, sgn * t0)),
                vecAdd(vertex, vecAdd(vecScale(null2, sgn * t0), vecScale(n, -S))),
                vecAdd(vertex, vecScale(null2, sgn * t1))
            ]);
            triangles.push([
                vecAdd(vertex, vecScale(null2, sgn * t1)),
                vecAdd(vertex, vecAdd(vecScale(null2, sgn * t0), vecScale(n, -S))),
                vecAdd(vertex, vecAdd(vecScale(null2, sgn * t1), vecScale(n, -S)))
            ]);
        }
    }

    return { triangles, vertex: [...vertex], dir: [...n], null1, null2 };
}


/**
 * Four crooked planes forming a fundamental domain.
 * C_i^+ at vertex +b_i/2, C_i^- at vertex -b_i/2, direction = v_i^0.
 * γ_i maps C_i^- → C_i^+.
 */
export function computeCrookedPlanes(translationScale = 1.0, planeSize = 2.5) {
    const data = computeTranslations(translationScale);
    const { b1, b2, eigen1, eigen2 } = data;

    const dir1 = eigen1.v0;
    const dir2 = eigen2.v0;

    const v1plus = vecScale(b1, 0.5);
    const v1minus = vecScale(b1, -0.5);
    const v2plus = vecScale(b2, 0.5);
    const v2minus = vecScale(b2, -0.5);

    return {
        planes: [
            { ...buildCrookedPlane(dir1, v1plus, planeSize), label: 'C₁⁺', gen: 0 },
            { ...buildCrookedPlane(dir1, v1minus, planeSize), label: 'C₁⁻', gen: 1 },
            { ...buildCrookedPlane(dir2, v2plus, planeSize), label: 'C₂⁺', gen: 2 },
            { ...buildCrookedPlane(dir2, v2minus, planeSize), label: 'C₂⁻', gen: 3 }
        ],
        pairings: [
            { from: 1, to: 0, matrix: A1, translation: b1, label: 'γ₁: C₁⁻ → C₁⁺' },
            { from: 3, to: 2, matrix: A2, translation: b2, label: 'γ₂: C₂⁻ → C₂⁺' }
        ],
        data
    };
}


export function applyAffineToTriangles(triangles, A, b) {
    return triangles.map(tri =>
        tri.map(v => vecAdd(matVec(A, v), b))
    );
}

export function interpolateAffine(A, b, t) {
    const I = matIdentity();
    const At = matLerp(I, A, t);
    const bt = vecScale(b, t);
    return { matrix: At, translation: bt };
}

export function getGenerators(translationScale = 1.0) {
    const data = computeTranslations(translationScale);
    const { b1, b2 } = data;

    const A1inv = matInverse(A1);
    const A2inv = matInverse(A2);

    const b1inv = vecScale(matVec(A1inv, b1), -1);
    const b2inv = vecScale(matVec(A2inv, b2), -1);

    return {
        generators: [
            { matrix: A1, translation: b1, label: 'γ₁' },
            { matrix: A1inv, translation: b1inv, label: 'γ₁⁻¹' },
            { matrix: A2, translation: b2, label: 'γ₂' },
            { matrix: A2inv, translation: b2inv, label: 'γ₂⁻¹' }
        ],
        data
    };
}
