// linalg.js — small exact linear algebra over ℤ and ℚ.
//
// Lattice data (Gram matrices, roots, reflections) are small integers, so
// plain Numbers are used wherever products stay far below 2^53; anything that
// can grow (determinants, kernels, products of many reflections) uses BigInt.

export const big = x => (typeof x === 'bigint' ? x : BigInt(x));
export const absB = x => (x < 0n ? -x : x);

export function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
}
export function gcdB(a, b) {
    a = absB(a); b = absB(b);
    while (b) [a, b] = [b, a % b];
    return a;
}
export const gcdList = v => v.reduce((g, x) => gcd(g, x), 0);
export const gcdListB = v => v.reduce((g, x) => gcdB(g, x), 0n);
export const mod = (a, m) => ((a % m) + m) % m;

export function primitive(v) {
    const g = gcdList(v);
    return g > 1 ? v.map(x => x / g) : v.slice();
}

// ---------------- Number matrices ----------------

export const identity = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const transpose = M => M[0].map((_, j) => M.map(r => r[j]));
export const matVec = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
export const matMul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
export const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
/** B(u, v) = uᵀ A v */
export const bil = (A, u, v) => { let s = 0; for (let i = 0; i < u.length; i++) { if (!u[i]) continue; let t = 0; for (let j = 0; j < v.length; j++) t += A[i][j] * v[j]; s += u[i] * t; } return s; };

// ---------------- BigInt matrices ----------------

export const toBigM = M => M.map(r => r.map(big));
export const toBigV = v => v.map(big);
export const identityB = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)));
export const matMulB = (A, B) => A.map(r => B[0].map((_, j) => { let s = 0n; for (let k = 0; k < r.length; k++) s += r[k] * B[k][j]; return s; }));
export const matVecB = (M, v) => M.map(r => { let s = 0n; for (let j = 0; j < v.length; j++) s += r[j] * v[j]; return s; });
export const bilB = (A, u, v) => { let s = 0n; for (let i = 0; i < u.length; i++) { if (!u[i]) continue; let t = 0n; for (let j = 0; j < v.length; j++) t += A[i][j] * v[j]; s += u[i] * t; } return s; };

/** Determinant by fraction-free Bareiss elimination. */
export function detB(M0) {
    const n = M0.length;
    if (n === 0) return 1n;
    const M = M0.map(r => r.map(big));
    let sign = 1n, prev = 1n;
    for (let k = 0; k < n - 1; k++) {
        if (M[k][k] === 0n) {
            let p = k + 1;
            while (p < n && M[p][k] === 0n) p++;
            if (p === n) return 0n;
            [M[k], M[p]] = [M[p], M[k]];
            sign = -sign;
        }
        for (let i = k + 1; i < n; i++) {
            for (let j = k + 1; j < n; j++) {
                M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prev;
            }
        }
        prev = M[k][k];
    }
    return sign * M[n - 1][n - 1];
}

/**
 * Inverse of an integer matrix as adj/det: returns { adj, det } (BigInt),
 * M⁻¹ = adj / det. Computed by Gauss–Jordan over ℚ with a common denominator.
 */
export function adjugateB(M0) {
    const n = M0.length;
    const det = detB(M0);
    if (det === 0n) throw new Error('singular matrix');
    // Solve M X = det·I by fraction-free elimination on [M | det·I].
    const A = M0.map((r, i) => [...r.map(big), ...Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))]);
    // Rational Gauss–Jordan with fractions per row (num BigInt, den BigInt).
    const R = A.map(r => ({ v: r, d: 1n }));
    for (let c = 0; c < n; c++) {
        let p = c;
        while (p < n && R[p].v[c] === 0n) p++;
        if (p === n) throw new Error('singular');
        [R[c], R[p]] = [R[p], R[c]];
        const piv = R[c];
        for (let i = 0; i < n; i++) {
            if (i === c || R[i].v[c] === 0n) continue;
            const a = R[i].v[c], b = piv.v[c];
            // row_i ← b·row_i − a·row_c   (both rows scaled consistently)
            R[i].v = R[i].v.map((x, j) => x * b - a * piv.v[j]);
            const g = gcdListB(R[i].v);
            if (g > 1n) R[i].v = R[i].v.map(x => x / g);
        }
    }
    // now row i: v[i]·x_i = v[n..2n) (as a row of M⁻¹ scaled by v[i])
    const adj = [];
    for (let i = 0; i < n; i++) {
        const r = R[i].v, s = r[i];
        adj.push(r.slice(n).map(x => (x * det) / s));
    }
    return { adj, det };
}

/** Exact solve of M x = b over ℚ; returns {num: BigInt[], den: BigInt} or null if singular. */
export function solveRational(M, b) {
    const n = M.length;
    const A = M.map((r, i) => [...r.map(big), big(b[i])]);
    for (let c = 0; c < n; c++) {
        let p = c;
        while (p < n && A[p][c] === 0n) p++;
        if (p === n) return null;
        [A[c], A[p]] = [A[p], A[c]];
        for (let i = 0; i < n; i++) {
            if (i === c || A[i][c] === 0n) continue;
            const a = A[i][c], bb = A[c][c];
            A[i] = A[i].map((x, j) => x * bb - a * A[c][j]);
            const g = gcdListB(A[i]);
            if (g > 1n) A[i] = A[i].map(x => x / g);
        }
    }
    // x_i = A[i][n] / A[i][i]; common denominator
    let den = 1n;
    for (let i = 0; i < n; i++) { const d = absB(A[i][i]); den = den / gcdB(den, d) * d; }
    const num = A.map((r, i) => (r[n] * (den / r[i])));
    const g = gcdB(gcdListB(num), den);
    return { num: num.map(x => x / g), den: den / g };
}

/**
 * Generalised cross product: the vector r with r·u = det[rows…, u] for the
 * n×(n+1) integer matrix `rows`, i.e. a generator of the (rational) kernel
 * when the rows are independent. BigInt.
 */
export function crossB(rows) {
    const m = rows[0].length;
    const out = [];
    for (let i = 0; i < m; i++) {
        const minor = rows.map(r => r.filter((_, j) => j !== i));
        const d = detB(minor);
        out.push(i % 2 === 0 ? d : -d);
    }
    return out;
}

/**
 * ℤ-basis of { x ∈ ℤ^m : w·x = 0 } for an integer row w ≠ 0, by unimodular
 * column operations (extended Euclid). Returns m−1 vectors.
 */
export function kernelOfRow(w) {
    const m = w.length;
    const U = identity(m);               // columns of U
    const a = w.slice();
    // reduce to a single nonzero entry in position piv
    for (;;) {
        const nz = [];
        for (let i = 0; i < m; i++) if (a[i] !== 0) nz.push(i);
        if (nz.length <= 1) break;
        nz.sort((i, j) => Math.abs(a[i]) - Math.abs(a[j]));
        const p = nz[0];
        for (const i of nz.slice(1)) {
            const q = Math.trunc(a[i] / a[p]);
            if (q === 0) continue;
            a[i] -= q * a[p];
            for (let r = 0; r < m; r++) U[r][i] -= q * U[r][p];
        }
    }
    const piv = a.findIndex(x => x !== 0);
    const basis = [];
    for (let j = 0; j < m; j++) if (j !== piv) basis.push(U.map(r => r[j]));
    return basis;
}

/** LLL-reduce integer vectors (rows) w.r.t. the positive definite Gram G (Numbers). */
export function lll(basis, G = null, delta = 0.99) {
    const b = basis.map(v => v.slice());
    const n = b.length;
    const ip = (u, v) => (G ? bil(G, u, v) : dot(u, v));
    const gso = () => {
        const bs = [], mu = Array.from({ length: n }, () => new Array(n).fill(0)), Bn = [];
        for (let i = 0; i < n; i++) {
            let v = b[i].slice();
            for (let j = 0; j < i; j++) {
                mu[i][j] = ip(b[i], bs[j]) / Bn[j];
                v = v.map((x, t) => x - mu[i][j] * bs[j][t]);
            }
            bs.push(v); Bn.push(ip(v, v));
        }
        return { bs, mu, Bn };
    };
    let k = 1, guard = 0;
    while (k < n && guard++ < 10000) {
        let { mu, Bn } = gso();
        for (let j = k - 1; j >= 0; j--) {
            const q = Math.round(mu[k][j]);
            if (q) { b[k] = b[k].map((x, t) => x - q * b[j][t]); ({ mu, Bn } = gso()); }
        }
        if (Bn[k] >= (delta - mu[k][k - 1] ** 2) * Bn[k - 1]) k++;
        else { [b[k], b[k - 1]] = [b[k - 1], b[k]]; k = Math.max(k - 1, 1); }
    }
    return b;
}

// ---------------- rationals ----------------

export function frac(n, d = 1n) {
    n = big(n); d = big(d);
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdB(n, d) || 1n;
    return { n: n / g, d: d / g };
}
export const fadd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const fsub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const fmul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const fdiv = (a, b) => frac(a.n * b.d, a.d * b.n);

/**
 * Diagonalise the symmetric rational form with integer Gram G over ℚ
 * (symmetric Gaussian elimination, with the x ↦ x + y trick for zero pivots).
 * Returns the diagonal entries as fractions {n, d}.
 */
export function diagonalizeQ(G0) {
    let G = G0.map(r => r.map(x => frac(x)));
    const diag = [];
    while (G.length) {
        const n = G.length;
        let p = G.findIndex((r, i) => r[i].n !== 0n);
        if (p < 0) {
            // all diagonal zero: find an off-diagonal nonzero and replace e_i by e_i + e_j
            let found = null;
            for (let i = 0; i < n && !found; i++) for (let j = i + 1; j < n; j++) if (G[i][j].n !== 0n) { found = [i, j]; break; }
            if (!found) { for (let i = 0; i < n; i++) diag.push(frac(0)); break; }
            const [i, j] = found;
            // new basis vector e_i' = e_i + e_j: (i,i) becomes G_ii + 2G_ij + G_jj
            const H = G.map(r => r.slice());
            for (let t = 0; t < n; t++) if (t !== i) { H[i][t] = fadd(G[i][t], G[j][t]); H[t][i] = H[i][t]; }
            H[i][i] = fadd(fadd(G[i][i], G[j][j]), fmul(frac(2), G[i][j]));
            G = H;
            continue;
        }
        const a = G[p][p];
        diag.push(a);
        const rest = [];
        for (let i = 0; i < n; i++) {
            if (i === p) continue;
            const row = [];
            for (let j = 0; j < n; j++) {
                if (j === p) continue;
                row.push(fsub(G[i][j], fdiv(fmul(G[i][p], G[p][j]), a)));
            }
            rest.push(row);
        }
        G = rest;
    }
    return diag;
}

/** Signature (pos, neg, zero) of a symmetric integer matrix, exactly. */
export function signature(G) {
    const d = diagonalizeQ(G);
    let pos = 0, neg = 0, zero = 0;
    for (const x of d) { if (x.n > 0n) pos++; else if (x.n < 0n) neg++; else zero++; }
    return { pos, neg, zero, diag: d };
}
