/**
 * intlin.js — exact integer linear algebra on BigInt matrices (arrays of rows), for the
 * presentations of elementary groups (elementary.js):
 *
 *   hnf(A)          U·A = H, row echelon with positive pivots, U unimodular
 *   leftKernel(A)   a basis of { x ∈ ℤ^m : x·A = 0 }
 *   snf(A)          P·A·Q = D diagonal with d₁ | d₂ | …, P and Q unimodular (and Q⁻¹)
 *   quotient(B, k)  ℤ^k / (row span of B) as ⊕ ℤ/dⱼ, with a basis and coordinates
 *   intRelations    integer relations among real vectors, by floating-point LLL (candidates only:
 *                   the caller verifies every one exactly)
 */

export const babs = (x) => (x < 0n ? -x : x);
export const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
export const blcm = (a, b) => (a === 0n || b === 0n ? 0n : babs((a / bgcd(a, b)) * b));
/** [g, s, t] with s·a + t·b = g = gcd(a, b) ≥ 0. */
export function egcd(a, b) {
    let [r0, r1, s0, s1, t0, t1] = [a, b, 1n, 0n, 0n, 1n];
    while (r1 !== 0n) {
        const q = r0 / r1;
        [r0, r1] = [r1, r0 - q * r1];
        [s0, s1] = [s1, s0 - q * s1];
        [t0, t1] = [t1, t0 - q * t1];
    }
    return r0 < 0n ? [-r0, -s0, -t0] : [r0, s0, t0];
}
/** ⌊a / b⌋ for BigInts (b ≠ 0). */
export function floorDiv(a, b) {
    const q = a / b;
    return (a % b !== 0n && ((a < 0n) !== (b < 0n))) ? q - 1n : q;
}
export const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)));
const copy = (A) => A.map((r) => r.slice());

/** rows r, s ← (a·r + b·s, c·r + d·s) */
function combineRows(M, r, s, a, b, c, d) {
    const R = M[r], S = M[s];
    M[r] = R.map((x, j) => a * x + b * S[j]);
    M[s] = R.map((x, j) => c * x + d * S[j]);
}

/**
 * Hermite normal form by rows: { H, U, rank, pivots } with U·A = H, U unimodular (m×m), the first
 * `rank` rows of H nonzero in echelon form with positive pivots, entries above a pivot in [0, pivot),
 * and the other rows zero.
 */
export function hnf(A) {
    const m = A.length, n = m ? A[0].length : 0;
    const H = copy(A), U = identity(m), pivots = [];
    let r = 0;
    for (let j = 0; j < n && r < m; j++) {
        for (let i = r + 1; i < m; i++) {
            if (H[i][j] === 0n) continue;
            const a = H[r][j], b = H[i][j];
            const [g, s, t] = egcd(a, b);
            const ag = a / g, bg = b / g;
            combineRows(H, r, i, s, t, -bg, ag);
            combineRows(U, r, i, s, t, -bg, ag);
        }
        if (H[r][j] === 0n) continue;
        if (H[r][j] < 0n) { H[r] = H[r].map((x) => -x); U[r] = U[r].map((x) => -x); }
        for (let i = 0; i < r; i++) {
            const q = floorDiv(H[i][j], H[r][j]);
            if (q) { H[i] = H[i].map((x, c) => x - q * H[r][c]); U[i] = U[i].map((x, c) => x - q * U[r][c]); }
        }
        pivots.push(j);
        r++;
    }
    return { H, U, rank: r, pivots };
}

/** A basis (rows, in Hermite form) of the left kernel { x : x·A = 0 } of an m×n matrix. */
export function leftKernel(A) {
    const m = A.length;
    if (!m) return [];
    if (!A[0].length) return identity(m);
    const { U, rank } = hnf(A);
    const K = U.slice(rank);
    return K.length ? hnf(K).H.slice(0, K.length).filter((r) => r.some((x) => x !== 0n)) : [];
}

/** The rank over ℚ. */
export const rankOf = (A) => (A.length && A[0].length ? hnf(A).rank : 0);

/** The saturation in ℤ^k of the row span of B (rows): the integer vectors in its ℚ-span. */
export function saturate(B, k) {
    if (!B.length) return [];
    // the ℚ-span is the left kernel of a basis of the orthogonal complement
    const Bt = Array.from({ length: k }, (_, j) => B.map((r) => r[j]));
    const perp = leftKernel(Bt);                 // y with Σ_j y_j B[i][j] = 0 for every i
    if (!perp.length) return identity(k);
    const P = Array.from({ length: k }, (_, j) => perp.map((r) => r[j]));
    return leftKernel(P);
}

/**
 * Smith normal form: { D, P, Q, Qi } with P·A·Q = D, D[i][i] = dᵢ ≥ 0, d₁ | d₂ | …, zero off the
 * diagonal; P, Q unimodular and Qi = Q⁻¹.
 */
export function snf(A0) {
    const m = A0.length, n = m ? A0[0].length : 0;
    const A = copy(A0), P = identity(m), Q = identity(n), Qi = identity(n);
    const rowAdd = (dst, src, c) => { for (const M of [A, P]) M[dst] = M[dst].map((x, j) => x + c * M[src][j]); };
    const rowSwap = (a, b) => { for (const M of [A, P]) [M[a], M[b]] = [M[b], M[a]]; };
    const rowNeg = (a) => { for (const M of [A, P]) M[a] = M[a].map((x) => -x); };
    // column a += c·column b; Q likewise; Qi: row b −= c·row a
    const colAdd = (a, b, c) => {
        for (const M of [A, Q]) for (const row of M) row[a] += c * row[b];
        Qi[b] = Qi[b].map((x, j) => x - c * Qi[a][j]);
    };
    const colSwap = (a, b) => {
        for (const M of [A, Q]) for (const row of M) [row[a], row[b]] = [row[b], row[a]];
        [Qi[a], Qi[b]] = [Qi[b], Qi[a]];
    };
    for (let t = 0; t < Math.min(m, n); t++) {
        for (;;) {
            // the smallest nonzero entry of the remaining block, moved to (t, t)
            let bi = -1, bj = -1, bv = 0n;
            for (let i = t; i < m; i++) for (let j = t; j < n; j++) {
                const v = babs(A[i][j]);
                if (v && (!bv || v < bv)) { bv = v; bi = i; bj = j; }
            }
            if (bi < 0) return finish();
            if (bi !== t) rowSwap(t, bi);
            if (bj !== t) colSwap(t, bj);
            let clean = true;
            for (let i = t + 1; i < m; i++) {
                if (!A[i][t]) continue;
                rowAdd(i, t, -floorDiv(A[i][t], A[t][t]));
                if (A[i][t]) clean = false;
            }
            for (let j = t + 1; j < n; j++) {
                if (!A[t][j]) continue;
                colAdd(j, t, -floorDiv(A[t][j], A[t][t]));
                if (A[t][j]) clean = false;
            }
            if (!clean) continue;
            // divisibility of the rest by the pivot
            let bad = -1;
            for (let i = t + 1; i < m && bad < 0; i++) for (let j = t + 1; j < n; j++) if (A[i][j] % A[t][t] !== 0n) { bad = i; break; }
            if (bad < 0) break;
            rowAdd(t, bad, 1n);
        }
        if (A[t][t] < 0n) rowNeg(t);
    }
    return finish();
    function finish() {
        for (let t = 0; t < Math.min(m, n); t++) if (A[t][t] < 0n) rowNeg(t);
        return { D: A, P, Q, Qi };
    }
}

/**
 * ℤ^k modulo the row span of B. Returns { orders: [d₀, …] (0 for ℤ), basis: rows of ℤ^k (the
 * generator of each cyclic factor, as an exponent vector), coords(e) (an exponent vector in the new
 * generators, reduced mod the orders), coordsOf: the coordinates of each unit vector }. Factors
 * of order 1 are dropped.
 */
export function quotient(B, k) {
    const rows = B.filter((r) => r.some((x) => x !== 0n));
    const { D, Q, Qi } = rows.length ? snf(rows) : { D: [], Q: identity(k), Qi: identity(k) };
    const orders = [];
    for (let j = 0; j < k; j++) orders.push(j < D.length && j < k ? D[j][j] : 0n);
    const keep = orders.map((d, j) => (d !== 1n ? j : -1)).filter((j) => j >= 0);
    const red = (x, d) => (d ? ((x % d) + d) % d : x);
    const coords = (e) => keep.map((j) => red(e.reduce((s, x, i) => s + x * Q[i][j], 0n), orders[j]));
    return {
        orders: keep.map((j) => orders[j]),
        basis: keep.map((j) => Qi[j].slice()),
        coords,
        coordsOf: Array.from({ length: k }, (_, i) => coords(Array.from({ length: k }, (_, t) => (t === i ? 1n : 0n)))),
    };
}

/** The inverse of a unimodular integer matrix (by Hermite form of [A | I]). */
export function unimodularInverse(A) {
    const n = A.length;
    const { U, H } = hnf(A);
    // U·A = H, and H = I for a unimodular A (positive pivots, reduced above)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (H[i][j] !== (i === j ? 1n : 0n)) throw new Error('not unimodular');
    return U;
}

/**
 * Candidate integer relations among real vectors v₁ … v_t (each of the same length s): integer
 * c ≠ 0 with Σ cᵢ vᵢ ≈ 0, by LLL on (εᵢ, C·vᵢ). Returns { relations: [c (Number[])], rest: the
 * number of reduced vectors that are not relations, minRest: the smallest |Σ cᵢ vᵢ| among them }.
 */
export function intRelations(vs, { C = 1e9, tol = 1e-3 } = {}) {
    const t = vs.length;
    if (!t) return { relations: [], rest: 0, minRest: Infinity };
    const s = vs[0].length;
    if (!s) return { relations: Array.from({ length: t }, (_, i) => Array.from({ length: t }, (_, j) => (i === j ? 1 : 0))), rest: 0, minRest: Infinity };
    const B = vs.map((v, i) => Array.from({ length: t }, (_, j) => (i === j ? 1 : 0)).concat(v.map((x) => C * x)));
    lll(B);
    const relations = [];
    let rest = 0, minRest = Infinity;
    for (const b of B) {
        const c = b.slice(0, t).map((x) => Math.round(x));
        const real = Math.hypot(...vs[0].map((_, j) => vs.reduce((acc, v, i) => acc + c[i] * v[j], 0)));
        if (c.every((x) => x === 0)) continue;
        if (real * C < tol * C ** 0.5) relations.push(c);
        else { rest++; minRest = Math.min(minRest, real); }
    }
    return { relations, rest, minRest };
}

/** In-place floating-point LLL (δ = 0.99) on the rows of B. */
export function lll(B, delta = 0.99) {
    const n = B.length;
    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    let Bs = [], mu = [];
    const gso = () => {
        Bs = []; mu = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            let v = B[i].slice();
            for (let j = 0; j < i; j++) {
                const bb = dot(Bs[j], Bs[j]);
                mu[i][j] = bb ? dot(B[i], Bs[j]) / bb : 0;
                v = v.map((x, c) => x - mu[i][j] * Bs[j][c]);
            }
            Bs.push(v);
        }
    };
    gso();
    let k = 1, guard = 0;
    while (k < n && guard++ < 100000) {
        for (let j = k - 1; j >= 0; j--) {
            const q = Math.round(mu[k][j]);
            if (q) { B[k] = B[k].map((x, c) => x - q * B[j][c]); gso(); }
        }
        const lhs = dot(Bs[k], Bs[k]), rhs = (delta - mu[k][k - 1] ** 2) * dot(Bs[k - 1], Bs[k - 1]);
        if (lhs >= rhs) k++;
        else { [B[k], B[k - 1]] = [B[k - 1], B[k]]; gso(); k = Math.max(k - 1, 1); }
    }
    return B;
}
