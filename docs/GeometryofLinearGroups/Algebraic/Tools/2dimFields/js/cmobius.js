// Floating-point Möbius maps of ℂ̂ = the sphere at infinity of ℍ³, as complex 2×2 matrices
// [a, b, c, d] with entries [re, im]; PSL₂(ℂ) acts on ℍ³ by orientation-preserving isometries.
export const cm = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
export const ca = (x, y) => [x[0] + y[0], x[1] + y[1]];
export const cs = (x, y) => [x[0] - y[0], x[1] - y[1]];
export const csc = (x, k) => [x[0] * k, x[1] * k];
export const cdiv = (x, y) => { const n = y[0] * y[0] + y[1] * y[1]; return [(x[0] * y[0] + x[1] * y[1]) / n, (x[1] * y[0] - x[0] * y[1]) / n]; };
export function csqrt([x, y]) {
    const r = Math.hypot(x, y), u = Math.sqrt((r + x) / 2), v = Math.sqrt(Math.max(0, (r - x) / 2));
    return [u, y < 0 ? -v : v];
}
const cexp = ([x, y]) => { const e = Math.exp(x); return [e * Math.cos(y), e * Math.sin(y)]; };
const clog = ([x, y]) => [Math.log(Math.hypot(x, y)), Math.atan2(y, x)];
const csinh = (z) => csc(cs(cexp(z), cexp(csc(z, -1))), 0.5);

export const CID = [[1, 0], [0, 0], [0, 0], [1, 0]];
export const cmul = (A, B) => [
    ca(cm(A[0], B[0]), cm(A[1], B[2])), ca(cm(A[0], B[1]), cm(A[1], B[3])),
    ca(cm(A[2], B[0]), cm(A[3], B[2])), ca(cm(A[2], B[1]), cm(A[3], B[3])),
];
export const cdet = (A) => cs(cm(A[0], A[3]), cm(A[1], A[2]));
// scaled to determinant 1
export function cnorm(A) { const k = cdiv([1, 0], csqrt(cdet(A))); return A.map((x) => cm(x, k)); }
export const cinv = (A) => cnorm([A[3], csc(A[1], -1), csc(A[2], -1), A[0]]);
// A·(P, Q) for a boundary point given as a vector
export const capply = (A, [P, Q]) => [ca(cm(A[0], P), cm(A[1], Q)), ca(cm(A[2], P), cm(A[3], Q))];

// The point (P : Q) of ℂ̂ on the unit sphere: (2 Re PQ̄, 2 Im PQ̄, |P|² − |Q|²)/(|P|² + |Q|²), ∞ at the north pole.
export function sphereOf([P, Q]) {
    const P2 = P[0] * P[0] + P[1] * P[1], Q2 = Q[0] * Q[0] + Q[1] * Q[1], n = P2 + Q2;
    const re = P[0] * Q[0] + P[1] * Q[1], im = P[1] * Q[0] - P[0] * Q[1];
    return [2 * re / n, 2 * im / n, (P2 - Q2) / n];
}

// The one-parameter path s ↦ hˢ in PSL₂(ℂ) from the identity to h: with tr h = 2 cosh μ,
//     hˢ = (sinh((1 − s)μ)·I + sinh(sμ)·h) / sinh μ,
// a screw motion along an axis of ℍ³ (a rotation when μ is imaginary), or I + s(h − I) when h is parabolic.
export function cpath(h) {
    h = cnorm(h);
    let tr = ca(h[0], h[3]);
    if (tr[0] < 0) { h = h.map((x) => csc(x, -1)); tr = csc(tr, -1); }        // ±h: the shorter way round
    const disc = cs(cm(tr, tr), [4, 0]);
    if (Math.hypot(...disc) < 1e-10) return (s) => h.map((x, i) => ca(csc(cs(x, CID[i]), s), CID[i]));
    let lam = csc(ca(tr, csqrt(disc)), 0.5);                                    // an eigenvalue, |λ| ≥ 1
    if (Math.hypot(...lam) < 1) lam = cdiv([1, 0], lam);
    const mu = clog(lam), sh = csinh(mu);
    return (s) => {
        const a = cdiv(csinh(csc(mu, 1 - s)), sh), b = cdiv(csinh(csc(mu, s)), sh);
        return h.map((x, i) => ca(cm(b, x), cm(a, CID[i])));
    };
}
