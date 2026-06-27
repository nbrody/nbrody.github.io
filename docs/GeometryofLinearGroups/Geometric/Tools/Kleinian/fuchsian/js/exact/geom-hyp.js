/**
 * geom-hyp.js — Floating-point hyperbolic geometry for the Dirichlet-domain builder.
 *
 * Models used:
 *   UHP        z = {x,y}, y>0
 *   Hyperboloid X = [x0,x1,x2] with ⟨X,X⟩ = −x0²+x1²+x2² = −1, x0>0
 *   Klein      p = [p1,p2] = [x1/x0, x2/x0] in the open unit disk (geodesics are chords)
 *
 * A Dirichlet face for group element g, basepoint o, is the bisector of o and g·o:
 *   { X : ⟨X, v⟩ = 0 },  v = O − Q  (O,Q the hyperboloid lifts of o, g·o)
 * with the domain on the side ⟨X,v⟩ ≥ 0. In Klein coordinates this is the Euclidean
 * half-plane  n·p ≥ d  with n = (v1,v2), d = v0 — so the whole domain is a convex
 * Euclidean polygon (intersection of half-planes ∩ unit disk).
 */

export const O_UHP_DEFAULT = { x: 0, y: 1 };

/** Möbius (or anti-Möbius if det<0) action of a Mat2Q on a UHP point. */
export function mobius(mat, z) {
    const { a, b, c, d } = mat.floats();
    const det = a * d - b * c;
    let zx = z.x, zy = z.y;
    if (det < 0) zy = -zy;                       // orientation-reversing: use z̄
    const nx = a * zx + b, ny = a * zy;
    const dx = c * zx + d, dy = c * zy;
    const den = dx * dx + dy * dy || 1e-300;
    return { x: (nx * dx + ny * dy) / den, y: (ny * dx - nx * dy) / den };
}

export function uhpToHyper(z) {
    const { x, y } = z, A = x * x + y * y;
    return [(A + 1) / (2 * y), (A - 1) / (2 * y), x / y];
}
export function hyperToUhp(X) { const k = X[0] - X[1]; return { x: X[2] / k, y: 1 / k }; }
export function inner3(X, Y) { return -X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; }
export function hyperToKlein(X) { return [X[1] / X[0], X[2] / X[0]]; }
export function kleinToUhp(p) {
    const s = Math.sqrt(Math.max(1e-18, 1 - p[0] * p[0] - p[1] * p[1]));
    return hyperToUhp([1 / s, p[0] / s, p[1] / s]);
}

/**
 * Dirichlet face of `mat` for basepoint `oUhp`.
 * Returns { v (covector), n,d (Klein half-plane n·p ≥ d), q (image on hyperboloid), dist }.
 */
export function faceOf(mat, oUhp) {
    const O = uhpToHyper(oUhp);
    const q = uhpToHyper(mobius(mat, oUhp));
    const v = [O[0] - q[0], O[1] - q[1], O[2] - q[2]];
    return { v, n: [v[1], v[2]], d: v[0], q, dist: -inner3(O, q) };  // dist = cosh(d(o,go))
}

/** Klein point → Poincaré-disk point w (boundary points map to themselves). */
export function kleinToDisk(p) {
    const r2 = p[0] * p[0] + p[1] * p[1];
    const k = 1 + Math.sqrt(Math.max(0, 1 - r2));
    return { re: p[0] / k, im: p[1] / k };
}

/**
 * Action of a Mat2Q on the Poincaré disk (well-defined on the closed disk incl. boundary).
 * Disk matrix D = C M C⁻¹, C = [[1,−i],[1,i]] the Cayley UHP→disk map. det<0 ⇒ anti-Möbius.
 */
export function diskMobius(mat, w) {
    const { a, b, c, d } = mat.floats();
    const reflect = (a * d - b * c) < 0;
    let wr = w.re, wi = reflect ? -w.im : w.im;
    // Disk automorphism matrix D = C M C⁻¹ has SU(1,1) form [[α,β],[β̄,ᾱ]]:
    const D11 = { re: (a + d) / 2, im: (b - c) / 2 };          // α
    const D12 = { re: (a - d) / 2, im: -(b + c) / 2 };         // β
    const D21 = { re: (a - d) / 2, im: (b + c) / 2 };          // β̄
    const D22 = { re: (a + d) / 2, im: -(b - c) / 2 };         // ᾱ
    const mul = (p, q) => ({ re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re });
    const add = (p, q) => ({ re: p.re + q.re, im: p.im + q.im });
    const W = { re: wr, im: wi };
    const num = add(mul(D11, W), D12), den = add(mul(D21, W), D22);
    const dd = den.re * den.re + den.im * den.im || 1e-300;
    return { re: (num.re * den.re + num.im * den.im) / dd, im: (num.im * den.re - num.re * den.im) / dd };
}

/** Hyperbolic angle (radians) at the meeting of two Klein-line faces with covectors v,w. */
export function faceAngle(v, w) {
    // interior angle θ satisfies cos θ = −⟨v,w⟩ / sqrt(⟨v,v⟩⟨w,w⟩)  (spacelike covectors)
    const vv = inner3(v, v), ww = inner3(w, w), vw = inner3(v, w);
    const c = -vw / Math.sqrt(Math.max(1e-18, vv * ww));
    return Math.acos(Math.max(-1, Math.min(1, c)));
}
