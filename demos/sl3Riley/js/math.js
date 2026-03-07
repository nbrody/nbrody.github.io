// ── 3×3 Matrix Utilities for SL₃(ℝ) Riley Slice ──

/** Multiply two 3×3 matrices (stored as flat Float64Array[9] for speed). */
export function mul(A, B) {
    return new Float64Array([
        A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
        A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
        A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8]
    ]);
}

/** Squared Frobenius distance to the identity matrix. */
export function frobDistSqI(M) {
    let s = 0;
    for (let i = 0; i < 9; i++) {
        const v = M[i] - (i % 4 === 0 ? 1 : 0); // diagonal at 0,4,8
        s += v * v;
    }
    return s;
}

/** Identity matrix. */
export const ID = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/**
 * Compute g^n for upper triangular unipotent g parameterized by (a,b,c).
 *
 * g = [[1, a, b],
 *      [0, 1, c],
 *      [0, 0, 1]]
 *
 * Since (g-I)³ = 0, we have g^n = I + n·N + n(n-1)/2·N²
 * where N = [[0,a,b],[0,0,c],[0,0,0]], N² = [[0,0,ac],[0,0,0],[0,0,0]].
 *
 * g^n = [[1, na, nb + n(n-1)/2·ac],
 *        [0, 1,  nc               ],
 *        [0, 0,  1                ]]
 */
export function upperPow(a, b, c, n) {
    return new Float64Array([
        1, n * a, n * b + n * (n - 1) / 2 * a * c,
        0, 1, n * c,
        0, 0, 1
    ]);
}

/**
 * Compute (gᵀ)^n for lower triangular unipotent gᵀ parameterized by (a,b,c).
 *
 * gᵀ = [[1, 0, 0],
 *        [a, 1, 0],
 *        [b, c, 1]]
 *
 * (gᵀ)^n = [[1,   0, 0],
 *            [na,  1, 0],
 *            [nb + n(n-1)/2·ac, nc, 1]]
 */
export function lowerPow(a, b, c, n) {
    return new Float64Array([
        1, 0, 0,
        n * a, 1, 0,
        n * b + n * (n - 1) / 2 * a * c, n * c, 1
    ]);
}
