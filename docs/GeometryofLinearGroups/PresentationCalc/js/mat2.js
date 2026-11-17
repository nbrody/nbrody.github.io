/**
 * mat2.js — exact 2×2 projective BigInt matrices [a, b, c, d] in PGL₂(ℚ).
 *
 * Shared primitive across index, presentation, congruence, orbit, and batch modules.
 * Canonical representatives are primitive (gcd of entries = 1) with first nonzero entry > 0.
 */

export const babs = (x) => (x < 0n ? -x : x);

export function bgcd(a, b) {
    a = babs(a); b = babs(b);
    while (b) [a, b] = [b, a % b];
    return a;
}

export const blcm = (a, b) => (!a || !b ? 0n : babs((a / bgcd(a, b)) * b));

export const ONE = [1n, 0n, 0n, 1n];
export const J = [-1n, 0n, 0n, 1n];

export const rawMul = (A, B) => [
    A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
];

export const adj = (A) => [A[3], -A[1], -A[2], A[0]];
export const det = (A) => A[0] * A[3] - A[1] * A[2];
export const tr = (A) => A[0] + A[3];

/** Primitive representative in PGL₂(ℚ): gcd(entries) = 1 and first nonzero entry > 0. */
export function prim(A) {
    const g = bgcd(bgcd(A[0], A[1]), bgcd(A[2], A[3]));
    if (g === 0n) throw new Error('zero matrix');
    const f = A.find((x) => x !== 0n);
    const s = f < 0n ? -g : g;
    return s === 1n ? [A[0], A[1], A[2], A[3]] : [A[0] / s, A[1] / s, A[2] / s, A[3] / s];
}

export const mul = (A, B) => prim(rawMul(A, B));
export const inv = (A) => prim(adj(A));
export const isScalar = (A) => A[1] === 0n && A[2] === 0n && A[0] === A[3] && A[0] !== 0n;
export const projEq = (A, B) => {
    const P = prim(A), Q = prim(B);
    return P[0] === Q[0] && P[1] === Q[1] && P[2] === Q[2] && P[3] === Q[3];
};
export const key = (A) => prim(A).join(',');
export const height2 = (A) => { const P = prim(A); return P[0] * P[0] + P[1] * P[1] + P[2] * P[2] + P[3] * P[3]; };

export function pow(A, k) {
    let e = BigInt(k);
    if (e === 0n) return ONE;
    let B = e < 0n ? inv(A) : prim(A);
    if (e < 0n) e = -e;
    let R = ONE;
    while (e > 0n) {
        if (e & 1n) R = mul(R, B);
        e >>= 1n;
        if (e) B = mul(B, B);
    }
    return R;
}

export function vp(x, p) {
    p = BigInt(p);
    x = babs(BigInt(x));
    if (x === 0n) return Infinity;
    let v = 0;
    while (x % p === 0n) { x /= p; v++; }
    return v;
}

/** Parse a 4-entry row of rational strings ("a", "a/b") into a primitive integer matrix, or null. */
export function parseRationalMatrix(row) {
    if (!Array.isArray(row) || row.length !== 4) return null;
    const num = [], den = [];
    for (const s of row) {
        const m = /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(String(s));
        if (!m) return null;
        const d = BigInt(m[2] || '1');
        if (d === 0n) return null;
        num.push(BigInt(m[1]));
        den.push(d);
    }
    const L = den.reduce((l, d) => blcm(l, d), 1n);
    const M = num.map((n, i) => n * (L / den[i]));
    if (det(M) === 0n) return null;
    return prim(M);
}

/** Evaluate a signed generator word (±1, ±2, …) on projective matrices `gens`. */
export function evalWord(gens, w) {
    let M = ONE;
    for (const x of w) M = mul(M, x > 0 ? gens[x - 1] : inv(gens[-x - 1]));
    return M;
}
