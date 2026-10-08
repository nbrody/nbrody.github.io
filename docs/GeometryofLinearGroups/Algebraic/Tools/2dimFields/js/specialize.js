// Specializing t ↦ a ∈ ℚ^×.
//
// Matrices over ℚ[t, 1/t] — our frames g_v and, after clearing denominators, every generator —
// can be evaluated at t = a, landing in GL₂(ℚ), which acts on a single hyperbolic plane. The
// plane X(v) is identified with that plane through its frame, z ↦ g_v(a)·z. This is not the
// limit that builds the tree (the local maps are reductions at t = ∞, where
// g_{γv}(T)⁻¹ γ(T) g_v(T) → h as T → ∞), so the collapsed picture carries its own action:
// γ acts on it by γ(a).
import { Q, gcd } from './rational.js';

const qpow = (q, k) => {
    const b = k < 0 ? q.inv() : q;
    let r = Q.ONE;
    for (let i = 0; i < Math.abs(k); i++) r = r.mul(b);
    return r;
};
// The value at t = a of a Laurent polynomial in π = 1/t.
export function evalAt(x, a) {
    const pa = a.inv();
    let s = Q.ZERO;
    for (let i = 0; i < x.c.length; i++) s = s.add(x.c[i].mul(qpow(pa, x.v + i)));
    return s;
}
export const specMat = (M, a) => M.map((x) => evalAt(x, a));
export const qdet = (A) => A[0].mul(A[3]).sub(A[1].mul(A[2]));
export const qmul = (A, B) => [
    A[0].mul(B[0]).add(A[1].mul(B[2])), A[0].mul(B[1]).add(A[1].mul(B[3])),
    A[2].mul(B[0]).add(A[3].mul(B[2])), A[2].mul(B[1]).add(A[3].mul(B[3])),
];

function egcd(a, b) {
    let [r0, r1, s0, s1, t0, t1] = [a, b, 1n, 0n, 0n, 1n];
    while (r1 !== 0n) {
        const q = r0 / r1;
        [r0, r1] = [r1, r0 - q * r1];
        [s0, s1] = [s1, s0 - q * s1];
        [t0, t1] = [t1, t0 - q * t1];
    }
    return r0 < 0n ? [-r0, -s0, -t0] : [r0, s0, t0];
}

// M(Farey) depends only on the lattice M·ℤ² up to scaling, because PGL₂(ℤ) is the symmetry group
// of the Farey tessellation. Its Hermite normal form [[x, y], [0, G]], scaled to be primitive,
// names that lattice: two planes land as the same tessellation exactly when their keys agree.
export function latticeKey(M) {
    let L = 1n;
    for (const x of M) L = L / gcd(L, x.d) * x.d;
    const [A, B, C, D] = M.map((x) => x.n * (L / x.d));
    const [G, s, t] = egcd(C, D);                  // (C, D)·U = (0, G) for a unimodular U
    let x = (A * D - B * C) / G, y = A * s + B * t;
    if (x < 0n) x = -x;
    y = ((y % x) + x) % x;
    const k = gcd(gcd(x, y), G);
    return `${x / k},${y / k},${G / k}`;
}
