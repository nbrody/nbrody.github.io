// hyperbolic.js — CP¹ = ∂H³ as the unit sphere, Möbius maps as isometries of the ball,
// conformal centering, and the Klein and Poincaré models.
//
// The upper half-space point (0, 0, 1) is the centre of the ball and ∞ the north pole, as in
// poincare: the boundary point z goes to (2 Re z, 2 Im z, |z|² − 1) / (|z|² + 1).

import { C, ONE, ZERO, abs, abs2, mul, conj, scale, mmul, madj, mapply, IDENT, mpowReal, mtrace, fixedPoints } from './complex.js';

/** The unit vector of a CP¹ point [x, y]. */
export function toSphere(p) {
    const [x, y] = p;
    const nx = abs2(x), ny = abs2(y), s = nx + ny;
    const xy = mul(x, conj(y));
    return [2 * xy.re / s, 2 * xy.im / s, (nx - ny) / s];
}
/** The CP¹ point of a unit vector. */
export function fromSphere(u) {
    const [a, b, c] = u;
    if (c > 1 - 1e-15) return [ONE, ZERO];
    return [C(a / (1 - c), b / (1 - c)), ONE];
}

/** The rotation (in SU(2)) taking the direction u to the north pole. */
function rotateToNorth(u) {
    const p = fromSphere(u);
    if (abs(p[1]) < 1e-15) return IDENT;
    const w = p[0];
    const b = 1 / Math.sqrt(1 + abs2(w));
    const a = scale(conj(w), b);
    return [a, C(b, 0), C(-b, 0), conj(a)];
}

/** The boost (in SL₂ℂ) translating the ball by hyperbolic distance d in direction u (a unit vector). */
export function boost(u, d) {
    const R = rotateToNorth(u);
    const e = Math.exp(d / 2);
    // moving toward the north pole: z ↦ e^{d} z
    const D = [C(e, 0), ZERO, ZERO, C(1 / e, 0)];
    return mmul(madj(R), mmul(D, R));
}

/**
 * The Möbius map that puts the conformal barycentre of the points at the centre of the ball:
 * iterate "move the Euclidean centroid (a point of the Klein model) to the origin".
 */
export function centering(points, { iters = 40, tol = 1e-9 } = {}) {
    let G = IDENT;
    for (let k = 0; k < iters; k++) {
        const us = points.map((p) => toSphere(mapply(G, p)));
        const m = [0, 0, 0];
        for (const u of us) { m[0] += u[0]; m[1] += u[1]; m[2] += u[2]; }
        m[0] /= us.length; m[1] /= us.length; m[2] /= us.length;
        const r = Math.hypot(...m);
        if (r < tol) break;
        const d = Math.atanh(Math.min(r, 0.999999));
        G = mmul(boost(m.map((x) => x / r), -0.9 * d), G);
    }
    return G;
}

/** Klein → Poincaré ball. */
export function kleinToPoincare(k) {
    const r2 = k[0] * k[0] + k[1] * k[1] + k[2] * k[2];
    const s = 1 / (1 + Math.sqrt(Math.max(0, 1 - r2)));
    return [k[0] * s, k[1] * s, k[2] * s];
}

/** A point of the model for a point of the Klein ball (identity in the Klein model). */
export const modelPoint = (k, model) => (model === 'poincare' ? kleinToPoincare(k) : k);

/** Points along the geodesic between two points of the closed Klein ball, in the model. */
export function geodesicPoints(a, b, model, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const k = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        out.push(modelPoint(k, model));
    }
    return out;
}

/** A^s for a Möbius map A, along the shorter of ±A. */
export function mobiusPath(A, s) {
    const t = mtrace(A);
    const B = t.re < 0 ? A.map((x) => scale(x, -1)) : A;
    return mpowReal(B, s);
}

export { fixedPoints, mapply, mmul, madj };
