// hyperbolic.js — Hyperbolic geometry utilities for the upper half plane
// Matrices stored as flat arrays [a, b, c, d] representing ((a,b),(c,d))

// ---- Mobius transforms ----

// Apply Mobius transform M to complex number z = {re, im}
// M(z) = (az + b) / (cz + d)
export function mobius(M, z) {
    const [a, b, c, d] = M;
    const numRe = a * z.re + b;
    const numIm = a * z.im;
    const denRe = c * z.re + d;
    const denIm = c * z.im;
    const denAbs2 = denRe * denRe + denIm * denIm;
    if (denAbs2 < 1e-15) return { re: Infinity, im: Infinity };
    return {
        re: (numRe * denRe + numIm * denIm) / denAbs2,
        im: (numIm * denRe - numRe * denIm) / denAbs2
    };
}

// Apply Mobius transform to a real number (or Infinity)
export function mobiusReal(M, x) {
    const [a, b, c, d] = M;
    if (!isFinite(x)) return Math.abs(c) < 1e-12 ? Infinity : a / c;
    const den = c * x + d;
    if (Math.abs(den) < 1e-12) return Infinity;
    return (a * x + b) / den;
}

// ---- 2x2 matrix operations ----

export function matMul(M1, M2) {
    return [
        M1[0] * M2[0] + M1[1] * M2[2],
        M1[0] * M2[1] + M1[1] * M2[3],
        M1[2] * M2[0] + M1[3] * M2[2],
        M1[2] * M2[1] + M1[3] * M2[3]
    ];
}

// Inverse for det=1 matrices: inv([[a,b],[c,d]]) = [[d,-b],[-c,a]]
export function matInv(M) {
    return [M[3], -M[1], -M[2], M[0]];
}

// General inverse (for any det)
export function matInvGeneral(M) {
    const det = matDet(M);
    return [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det];
}

export function matDet(M) {
    return M[0] * M[3] - M[1] * M[2];
}

export function trace(M) {
    return M[0] + M[3];
}

// Normalize sign for PSL: ensure c > 0, or c == 0 and d > 0
export function normalizePSL(M) {
    if (M[2] < -1e-9 || (Math.abs(M[2]) < 1e-9 && M[3] < 0)) {
        return [-M[0], -M[1], -M[2], -M[3]];
    }
    return [M[0], M[1], M[2], M[3]];
}

export function isHyperbolic(M) {
    return Math.abs(trace(M)) > 2 + 1e-9;
}

export function isParabolic(M) {
    return Math.abs(Math.abs(trace(M)) - 2) < 1e-9;
}

export function isElliptic(M) {
    return Math.abs(trace(M)) < 2 - 1e-9;
}

// Fixed points of a Mobius transformation on the real line
// Solves cz^2 + (d - a)z - b = 0
export function fixedPoints(M) {
    const [a, b, c, d] = M;
    if (Math.abs(c) < 1e-12) {
        // c = 0: one fixed point at infinity
        if (Math.abs(d - a) < 1e-12) return [Infinity, Infinity]; // identity-like
        return [b / (a - d), Infinity];
    }
    const disc = (a - d) * (a - d) + 4 * b * c;
    if (disc < -1e-9) return [NaN, NaN]; // elliptic (no real fixed points)
    const s = Math.sqrt(Math.max(0, disc));
    return [((a - d) - s) / (2 * c), ((a - d) + s) / (2 * c)];
}

// ---- Geodesic geometry ----

// Given two endpoints on the real line, compute the semicircle data
export function geodesicArc(x1, x2) {
    if (!isFinite(x1) && !isFinite(x2)) return null;
    if (!isFinite(x1) || !isFinite(x2)) {
        return { type: 'vertical', x: isFinite(x1) ? x1 : x2 };
    }
    const center = (x1 + x2) / 2;
    const radius = Math.abs(x2 - x1) / 2;
    return { type: 'arc', center, radius, x1: Math.min(x1, x2), x2: Math.max(x1, x2) };
}

// Identity matrix
export function identity() {
    return [1, 0, 0, 1];
}

// Standard PSL_2(Z) generators
export const S = [0, -1, 1, 0];
export const T = [1, 1, 0, 1];
export const Tinv = [1, -1, 0, 1];
