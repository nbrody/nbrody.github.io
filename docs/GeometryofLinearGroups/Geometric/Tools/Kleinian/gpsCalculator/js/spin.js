// spin.js — O′(f) → PGL₂ through the even Clifford algebra, exactly.
//
// Diagonalize f over ℚ as ⟨a₀, a₁, …, a_n⟩ with a₀ < 0 (orthogonal basis b_i,
// f(b_i) = a_i). In the Clifford algebra, E_i = b₀b_i (i ≥ 1) anticommute with
// E_i² = q_i = −a₀a_i > 0, and they generate C₀(f). Splitting it over a
// multiquadratic field K:
//     n = 3:  M₁ = (0 q₁; 1 0),  M₂ = (0 −q₁c; c 0) with c² = −q₂/q₁,  M₃ = diag(d, −d), d² = q₃;
//     n = 2:  M₁ = (0 q₁; 1 0),  M₂ = diag(d, −d), d² = q₂.
// For a vector u write U(u) = a₀y₀ + Σ y_i M_i (y = coordinates of u in the
// orthogonal basis) and α(U) = a₀y₀ − Σ y_i M_i. The product of reflections
// s_u s_v (s_u x = −u x u⁻¹) acts on V through
//     A(u, v) = U(u) · α(U(v))  ∈ PGL₂(K),
// on ℍ³ as a Möbius transformation (n = 3) and on ℍ² (n = 2). The 2 × 2 matrix
// is conjugate (by a real diagonal matrix, an isometry) to the one acting on
// the Hermitian model X ↦ A X A*: so traces agree with the Lorentz matrices,
// |tr A|²/|det A| = tr(s_u s_v) for n = 3 and tr² A / det A − 1 = tr(s_u s_v)
// for n = 2. The tests check this.

import { MultiQuad, kmat, polyToTex, invertFrac } from './multiquad.js';
import { frac, fadd, fmul, bil } from './linalg.js';

const absB = (x) => (x < 0n ? -x : x);
const gcdB = (a, b) => { a = absB(a); b = absB(b); while (b) [a, b] = [b, a % b]; return a; };

/** An orthogonal basis of ℚ^m for the form A (integer vectors, primitive), the timelike one first. */
export function orthogonalBasis(A) {
    const m = A.length;
    const B = (u, v) => { let s = frac(0n); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (A[i][j]) s = fadd(s, fmul(fmul(u[i], v[j]), frac(BigInt(A[i][j])))); return s; };
    const E = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => frac(i === j ? 1n : 0n)));
    let pool = E.slice();
    const basis = [];
    while (pool.length) {
        // a vector of nonzero norm: some pool vector, or the sum of two
        let idx = pool.findIndex((u) => B(u, u).n !== 0n);
        let u;
        if (idx >= 0) { u = pool[idx]; pool.splice(idx, 1); } else {
            let found = null;
            for (let i = 0; i < pool.length && !found; i++) for (let j = i + 1; j < pool.length; j++) {
                const w = pool[i].map((x, t) => fadd(x, pool[j][t]));
                if (B(w, w).n !== 0n) { found = { w, i }; break; }
            }
            if (!found) throw new Error('degenerate form');
            u = found.w; pool.splice(found.i, 1);
        }
        const nu = B(u, u);
        // project the rest off u
        pool = pool.map((x) => {
            const c = B(x, u);
            if (c.n === 0n) return x;
            const t = { n: c.n * nu.d, d: c.d * nu.n };
            return x.map((xi, i) => fadd(xi, fmul(frac(-t.n, t.d), u[i])));
        });
        basis.push(u);
    }
    // integral, primitive
    const ints = basis.map((u) => {
        let L = 1n;
        for (const x of u) L = (L / gcdB(L, x.d)) * x.d;
        let v = u.map((x) => (x.n * L) / x.d);
        let g = 0n;
        for (const x of v) g = gcdB(g, x);
        if (g > 1n) v = v.map((x) => x / g);
        return v;
    });
    const norms = ints.map((v) => BigInt(bil(A, v.map(Number), v.map(Number))));
    const neg = norms.findIndex((x) => x < 0n);
    if (neg < 0 || norms.filter((x) => x < 0n).length !== 1) throw new Error('the form must have signature (n, 1)');
    if (neg) { [ints[0], ints[neg]] = [ints[neg], ints[0]]; [norms[0], norms[neg]] = [norms[neg], norms[0]]; }
    return { B: ints, a: norms };
}

/**
 * The Clifford data of the form A (n = 2 or 3), over a field K containing the
 * square roots in `extra` (radicands, e.g. the gluing radical of a hybrid).
 */
export function spinSetup(A, extra = []) {
    const m = A.length, n = m - 1;
    if (n !== 2 && n !== 3) throw new Error('the spin isomorphism is used for n = 2 and 3');
    const { B, a } = orthogonalBasis(A);
    const q = a.map((ai) => -a[0] * ai);                // q[0] unused
    const rads = n === 3 ? [-q[1] * q[2], q[3]] : [q[2]];
    const K = new MultiQuad([...rads, ...extra]);
    const r = (x) => K.rat(x);
    let M;
    if (n === 3) {
        const c = K.scale(K.sqrt(-q[1] * q[2]), frac(1n, q[1]));      // c² = −q₂/q₁
        const d = K.sqrt(q[3]);
        M = [
            [K.zero(), r(q[1]), K.one(), K.zero()],
            [K.zero(), K.neg(K.scale(c, frac(q[1]))), c, K.zero()],
            [d, K.zero(), K.zero(), K.neg(d)],
        ];
    } else {
        const d = K.sqrt(q[2]);
        M = [
            [K.zero(), r(q[1]), K.one(), K.zero()],
            [d, K.zero(), K.zero(), K.neg(d)],
        ];
    }
    // coordinates in the orthogonal basis: y = B⁻¹ u (columns of B are the b_i)
    const Bcols = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => frac(B[j][i])));
    const Binv = invertFrac(Bcols);
    return { A, n, m, B, a, q, K, M, Binv };
}

/** A vector with rational or K entries, as K elements. */
function asK(S, u) {
    return u.map((x) => (Array.isArray(x) ? x : S.K.rat(typeof x === 'object' && x !== null && 'n' in x ? x : BigInt(x))));
}

function Umat(S, u, sign) {
    const K = S.K;
    const uk = asK(S, u);
    const y = S.Binv.map((row) => row.reduce((s, c, j) => K.add(s, K.scale(uk[j], c)), K.zero()));
    const a0y0 = K.scale(y[0], frac(S.a[0]));
    let U = [a0y0, K.zero(), K.zero(), a0y0];
    for (let i = 1; i < S.m; i++) {
        const t = kmat.scale(K, S.M[i - 1], y[i]);
        U = sign > 0 ? kmat.add(K, U, t) : kmat.sub(K, U, t);
    }
    return U;
}

/** The PGL₂(K) image of s_u s_v. */
export function spinPair(S, u, v) {
    return kmat.mul(S.K, Umat(S, u, 1), Umat(S, v, -1));
}

/** Divide a matrix by the content of its coordinates (a rational scalar: the same element of PGL₂). */
export function primitiveMat(K, X) {
    let L = 1n, g = 0n;
    for (const e of X) for (const c of e) if (c.n !== 0n) L = (L / gcdB(L, c.d)) * c.d;
    for (const e of X) for (const c of e) if (c.n !== 0n) g = gcdB(g, (c.n * L) / c.d);
    if (g === 0n) return X;
    return X.map((e) => K.scale(e, frac(L, g)));
}

/**
 * Generators of the rotation subgroup W⁺ of the reflection group in the walls
 * `roots` (vectors with rational or K entries): s_b s_j for a base wall b and
 * every other wall j. Returns PGL₂(K) matrices with labels.
 */
export function rotationGenerators(S, roots, { base = 0, labels = null } = {}) {
    const out = [];
    roots.forEach((r, j) => {
        if (j === base) return;
        out.push({ mat: primitiveMat(S.K, spinPair(S, roots[base], r)), label: labels ? `s_{${labels[base]}}s_{${labels[j]}}` : `s_{${base + 1}}s_{${j + 1}}`, pair: [base, j] });
    });
    return out;
}

/**
 * poincare's input state for matrices over K: entries as polynomials in the
 * primitive element w = Σ √m_i, with the constant "w root of P(w)" placed at
 * its value under the principal embedding.
 */
export function poincareState(K, mats, { depth = 8, faces = 96, bp = null } = {}) {
    // power-basis coordinates of each entry, the matrix scaled by a rational so they are coprime integers
    const coordsOf = (M) => {
        const cs = M.map((e) => (K.k === 0 ? [e[0]] : K.asPoly(e)));
        let L = 1n, g = 0n;
        for (const c of cs) for (const x of c) if (x.n !== 0n) L = (L / gcdB(L, x.d)) * x.d;
        for (const c of cs) for (const x of c) if (x.n !== 0n) g = gcdB(g, (x.n * L) / x.d);
        if (g === 0n) return cs;
        return cs.map((c) => c.map((x) => frac((x.n * L) / x.d, g)));
    };
    const st = { v: 1, mats: mats.map((M) => coordsOf(M).map((c) => polyToTex(c, 'w'))), anti: mats.map(() => false), consts: [], depth, faces };
    if (bp && bp.every(Number.isFinite) && Math.hypot(...bp) < 0.995) st.bp = bp.map((x) => +x.toFixed(6));
    if (K.k) {
        const { thetaVal } = K.powerBasis();
        st.consts = [{ name: 'w', poly: K.polyTex('w'), near: { re: thetaVal.re, im: thetaVal.im } }];
    }
    return st;
}

/** The #s= permalink hash of a poincare state (base64url JSON, as poincare's permalink.js). */
export function stateHash(st) {
    const bytes = new TextEncoder().encode(JSON.stringify(st));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return '#s=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Numeric value of a 2 × 2 matrix over K (principal embedding). */
export function numMat(K, X) { return X.map((e) => K.num(e)); }

/**
 * poincare's ball coordinates of the point of ℍⁿ given by the timelike vector p
 * (real, lattice coordinates). The matrices M_i are D(√q_i σ_i)D⁻¹ for
 * D = diag(√q₁, 1) (n = 3: σ₁, σ₂, σ₃; n = 2: σ₁, σ₃), so x ↦ D·H(x)·D with
 * H(x) = a₀y₀ + Σ y_i √q_i σ_i is equivariant for X ↦ A X A*, poincare's
 * action on Hermitian matrices [[t + z, x + iy], [x − iy, t − z]].
 */
export function basepointBall(S, p) {
    const y = S.Binv.map((row) => row.reduce((s, c, j) => s + (Number(c.n) / Number(c.d)) * p[j], 0));
    const a0 = Number(S.a[0]);
    const sq = S.q.map((q) => Math.sqrt(Math.abs(Number(q))));
    // H = [[h00, h01], [conj h01, h11]]
    let h00 = a0 * y[0], h11 = a0 * y[0], re = 0, im = 0;
    if (S.n === 3) {
        re = y[1] * sq[1]; im = -y[2] * sq[2];
        h00 += y[3] * sq[3]; h11 -= y[3] * sq[3];
    } else {
        re = y[1] * sq[1];
        h00 += y[2] * sq[2]; h11 -= y[2] * sq[2];
    }
    // D H D, D = diag(√q₁, 1)
    const d = sq[1];
    h00 *= d * d; re *= d; im *= d;
    if (h00 + h11 < 0) { h00 = -h00; h11 = -h11; re = -re; im = -im; }
    const det = h00 * h11 - re * re - im * im;
    if (!(det > 0)) return null;
    const s = Math.sqrt(det);
    const t = (h00 + h11) / (2 * s), z = (h00 - h11) / (2 * s), x = re / s, yy = im / s;
    return [x / (1 + t), yy / (1 + t), z / (1 + t)];
}

/** A point inside a polytope: the sum of its vertices, finite ones normalized to f = −1. */
export function interiorPoint(A, verts, filter = null) {
    const m = A.length;
    const s = new Array(m).fill(0);
    for (const v of verts) {
        if (filter && !filter(v)) continue;
        const r = v.r.map(Number);
        let f = 0;
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) f += A[i][j] * r[i] * r[j];
        const c = f < -1e-12 ? 1 / Math.sqrt(-f) : 1;
        for (let i = 0; i < m; i++) s[i] += c * r[i];
    }
    return s;
}
