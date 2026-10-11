// vinberg.js — Vinberg's algorithm in any dimension.
//
// Input: an integral lattice (ℤ^m, A) of signature (n, 1), m = n + 1.
// A ROOT is a primitive e with k = f(e) > 0 whose reflection
//     s_e(x) = x − (2B(x, e)/k) e
// preserves ℤ^m, i.e. k | 2(Ae)_i for every i. The roots generate the
// maximal reflection subgroup W ⊴ O′(A, ℤ); Vinberg's algorithm builds a
// fundamental chamber
//     P = { x : B(x, e_j) ≤ 0 for all walls e_j }
// by accepting roots in order of their distance from a basepoint p₀, each
// one provided it makes a non-obtuse angle with every root accepted before.
// The chamber is finished as soon as it has finite volume, which is decided
// exactly: every extreme ray of the cone { B(·, e_j) ≤ 0 } must be timelike or
// lightlike (a vertex inside ℍⁿ or on the sphere at infinity).
//
// If a root `wall` with B(wall, p₀) = 0 is supplied, the first batch (the
// root system of p₀^⊥, a finite reflection group) is cut by a Weyl chamber
// adjacent to wall^⊥, so that `wall` itself becomes a wall of P.

import { bil, gcdList, crossB, detB, big, kernelOfRow, lll } from './linalg.js';

/** All nonzero integer x with xᵀQx ≤ R (Fincke–Pohst), Q real positive definite. */
export function shortVectors(Q, R, cap = 4e6) {
    const m = Q.length;
    const q = Q.map(r => r.slice());
    // Fincke–Pohst quadratic decomposition: Q(x) = Σ q_ii (x_i + Σ_{j>i} q_ij x_j)²
    for (let i = 0; i < m; i++) {
        for (let k = 0; k < i; k++) q[i][i] -= q[k][k] * q[k][i] * q[k][i];
        if (!(q[i][i] > 0)) throw new Error('majorant not positive definite');
        for (let j = i + 1; j < m; j++) {
            let s = Q[i][j];
            for (let k = 0; k < i; k++) s -= q[k][k] * q[k][i] * q[k][j];
            q[i][j] = s / q[i][i];
        }
    }
    const out = [];
    const x = new Array(m).fill(0);
    const eps = 1e-9 * (1 + R);
    const rec = (i, T) => {
        let c = 0;
        for (let j = i + 1; j < m; j++) c -= q[i][j] * x[j];
        const w = Math.sqrt(Math.max(0, (T + eps) / q[i][i]));
        const lo = Math.ceil(c - w), hi = Math.floor(c + w);
        for (let xi = lo; xi <= hi; xi++) {
            x[i] = xi;
            const d = xi - c;
            const T2 = T - q[i][i] * d * d;
            if (T2 < -eps) continue;
            if (i === 0) {
                if (x.some(t => t !== 0)) {
                    out.push(x.slice());
                    if (out.length > cap) throw new Error('enumeration too large');
                }
            } else rec(i - 1, T2);
        }
        x[i] = 0;
    };
    rec(m - 1, R);
    return out;
}

/** Is e a root of (ℤ^m, A)? */
export function isRoot(A, e) {
    if (gcdList(e) !== 1) return false;
    const Ae = A.map(r => r.reduce((s, x, j) => s + x * e[j], 0));
    const k = e.reduce((s, x, i) => s + x * Ae[i], 0);
    if (k <= 0) return false;
    return Ae.every(t => (2 * t) % k === 0);
}

/** The reflection matrix s_e (integer, acting on column vectors). */
export function reflectionMatrix(A, e) {
    const m = A.length;
    const Ae = A.map(r => r.reduce((s, x, j) => s + x * e[j], 0));
    const k = e.reduce((s, x, i) => s + x * Ae[i], 0);
    // s(x) = x − (2 Aeᵀx / k) e
    return Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) =>
        (i === j ? 1 : 0) - (2 * Ae[j] / k) * e[i]));
}

const keyOf = v => v.join(',');

/** Exponent bound for root norms: k | 2(Ae)_i for all i forces k | 2·|det A|. */
function normBound(A) {
    return 2 * Math.abs(Number(detB(A)));
}

/**
 * Extreme rays of the cone { x : (A e_j)·x ≤ 0 } (BigInt, primitive), or null
 * if the cone is not pointed (the walls do not yet span).
 */
export function extremeRays(A, walls) {
    const m = A.length, n = m - 1;
    const cov = walls.map(e => A.map(r => r.reduce((s, x, j) => s + x * e[j], 0)).map(big));
    if (rankB(cov) < m) return null;
    const rays = new Map();
    const idx = new Array(n);
    const choose = (start, d) => {
        if (d === n) {
            const rows = idx.map(i => cov[i]);
            let r = crossB(rows);
            if (r.every(t => t === 0n)) return;
            const vals = cov.map(c => c.reduce((s, x, i) => s + x * r[i], 0n));
            let sgn = 0;
            if (vals.every(t => t <= 0n)) sgn = 1;
            else if (vals.every(t => t >= 0n)) sgn = -1;
            else return;
            r = r.map(t => t * BigInt(sgn));
            const g = r.reduce((a, t) => { let x = t < 0n ? -t : t; while (x) [a, x] = [x, a % x]; return a; }, 0n);
            r = r.map(t => t / g);
            const k = r.join(',');
            if (!rays.has(k)) rays.set(k, { r, walls: vals.map((t, j) => (t === 0n ? j : -1)).filter(j => j >= 0) });
            return;
        }
        for (let i = start; i <= walls.length - (n - d); i++) { idx[d] = i; choose(i + 1, d + 1); }
    };
    choose(0, 0);
    return [...rays.values()];
}

function rankB(rows) {
    const M = rows.map(r => r.slice());
    let rank = 0;
    const cols = M[0] ? M[0].length : 0;
    for (let c = 0; c < cols && rank < M.length; c++) {
        let p = rank;
        while (p < M.length && M[p][c] === 0n) p++;
        if (p === M.length) continue;
        [M[rank], M[p]] = [M[p], M[rank]];
        for (let i = rank + 1; i < M.length; i++) {
            if (M[i][c] === 0n) continue;
            const a = M[i][c], b = M[rank][c];
            M[i] = M[i].map((x, j) => x * b - a * M[rank][j]);
        }
        rank++;
    }
    return rank;
}

/** Decide finite volume from the extreme rays. */
function finiteVolume(A, walls, p0) {
    const rays = extremeRays(A, walls);
    if (!rays || rays.length === 0) return { finite: false, rays };
    const AB = A.map(r => r.map(big));
    const p0B = p0.map(big);
    for (const ray of rays) {
        const fr = bilBig(AB, ray.r, ray.r);
        if (fr > 0n) return { finite: false, rays };
        if (bilBig(AB, ray.r, p0B) >= 0n) return { finite: false, rays };
    }
    return { finite: true, rays };
}
const bilBig = (A, u, v) => { let s = 0n; for (let i = 0; i < u.length; i++) for (let j = 0; j < v.length; j++) s += u[i] * A[i][j] * v[j]; return s; };

/**
 * Vinberg's algorithm.
 * @param A      integer Gram matrix, signature (n,1)
 * @param p0     timelike integer basepoint (f(p0) < 0)
 * @param opts   { wall: root with B(wall,p0)=0 to keep as a wall, maxRoots, maxT, onProgress }
 *
 * Candidates are enumerated level by level: the roots with B(e, p₀) = −t form
 * a translate e_t + L₀ of the positive definite lattice L₀ = p₀^⊥ ∩ ℤ^m, and
 * there f(e) = k becomes the ellipsoid shell q₀(x + c) = k + t²/|f(p₀)|. Since
 * the distance key t²/k of every root at level t is at least t²/k_max, all
 * roots with key below (T+1)²/k_max are known once levels 1…T are listed.
 */
export function vinberg(A, p0, opts = {}) {
    const m = A.length, n = m - 1;
    const maxRoots = opts.maxRoots ?? 48;
    const maxT = opts.maxT ?? 400;
    const B = (u, v) => bil(A, u, v);
    const f0 = B(p0, p0);
    if (!(f0 < 0)) throw new Error('basepoint must be timelike');
    const kmax = normBound(A);
    const a = A.map(r => r.reduce((s, x, j) => s + x * p0[j], 0));     // B(e, p₀) = a·e
    const ga = gcdList(a);
    // L₀ = p₀^⊥ ∩ ℤ^m, LLL-reduced for its (positive definite) form
    let L0 = kernelOfRow(a);
    const g0of = Bs => Bs.map(x => Bs.map(y => B(x, y)));
    L0 = lll(L0, A);
    const g0 = g0of(L0);
    // u with a·u = ga (extended Euclid on the row)
    const u = rowSolution(a, ga);

    // ---- batch 0: the finite root system of p₀^⊥ ----
    const zero = shortVectors(g0, kmax).map(x => combo(L0, x)).filter(e => isRoot(A, e));
    const accepted = [];
    if (zero.length) {
        const q = genericChamberPoint(A, p0, zero, opts.wall);
        const neg = zero.filter(e => B(e, q) < 0);
        const negKeys = new Set(neg.map(keyOf));
        const simple = neg.filter(x => !neg.some(y => {
            const c = x.map((t, i) => t - y[i]);
            return c.some(t => t !== 0) && negKeys.has(keyOf(c));
        }));
        accepted.push(...simple);
    }
    if (opts.wall && !accepted.some(e => keyOf(e) === keyOf(opts.wall))) {
        throw new Error('internal: the hypersurface root is not a wall of the first batch');
    }

    // ---- later batches, in order of distance ----
    let status = accepted.length >= m ? finiteVolume(A, accepted, p0) : { finite: false };
    let batches = 1;
    const pending = [];
    // g0⁻¹ for the centres
    const g0inv = invertSmall(g0);
    for (let T = 1; !status.finite; T++) {
        if (T > maxT || accepted.length >= maxRoots) {
            return {
                ok: false, roots: accepted,
                reason: `the chamber did not close (${accepted.length} walls after scanning ${T - 1} levels of B(e, p₀)) — the form is probably not reflective`,
            };
        }
        if (T % ga === 0) {
            // particular solution e_T with B(e_T, p₀) = −T, and the centre c = g0⁻¹ B(e_T, L₀)
            const eT = u.map(x => -(T / ga) * x);
            const bt = L0.map(b => B(eT, b));
            const c = g0inv.map(r => r.reduce((s, x, j) => s + x * bt[j], 0));
            const rho = kmax + T * T / -f0;
            let shell;
            try { shell = shortVectorsCentered(g0, c, rho); }
            catch (err) { return { ok: false, roots: accepted, reason: `the search budget ran out at level t = ${T} with ${accepted.length} walls — the form is probably not reflective` }; }
            if (opts.deadline && Date.now() > opts.deadline) return { ok: false, roots: accepted, reason: `time limit reached at level t = ${T} with ${accepted.length} walls — the form is probably not reflective` };
            for (const x of shell) {
                const e = eT.map((t, i) => t + L0.reduce((s, b, j) => s + x[j] * b[i], 0));
                const k = B(e, e);
                if (k <= 0 || k > kmax) continue;
                if (!isRoot(A, e)) continue;
                pending.push({ e, t: T, k });
            }
        }
        // every root with key < (T+1)²/kmax is now known
        pending.sort((x, y) => x.t * x.t * y.k - y.t * y.t * x.k || keyOf(x.e).localeCompare(keyOf(y.e)));
        let i = 0;
        while (i < pending.length && !status.finite) {
            const c0 = pending[i];
            if (c0.t * c0.t * kmax >= (T + 1) * (T + 1) * c0.k) break;
            let j = i;
            while (j < pending.length && pending[j].t * pending[j].t * c0.k === c0.t * c0.t * pending[j].k) j++;
            const prior = accepted.slice();
            const batch = [];
            for (let c = i; c < j; c++) {
                const e = pending[c].e;
                if (prior.every(r => B(e, r) <= 0)) batch.push(e);
            }
            if (batch.length) {
                accepted.push(...batch);
                batches++;
                if (accepted.length >= m) status = finiteVolume(A, accepted, p0);
            }
            i = j;
            if (accepted.length > maxRoots) break;
        }
        pending.splice(0, i);
        if (opts.onProgress) opts.onProgress({ roots: accepted.length, T });
    }
    return { ok: true, roots: accepted, rays: status.rays, p0, batches };
}

const combo = (basis, x) => basis[0].map((_, i) => basis.reduce((s, b, j) => s + x[j] * b[i], 0));

/** An integer u with a·u = gcd(a). */
function rowSolution(a, g) {
    const m = a.length;
    const U = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
    const w = a.slice();
    for (;;) {
        const nz = [];
        for (let i = 0; i < m; i++) if (w[i] !== 0) nz.push(i);
        if (nz.length <= 1) break;
        nz.sort((i, j) => Math.abs(w[i]) - Math.abs(w[j]));
        const p = nz[0];
        for (const i of nz.slice(1)) {
            const q = Math.trunc(w[i] / w[p]);
            if (!q) continue;
            w[i] -= q * w[p];
            for (let r = 0; r < m; r++) U[r][i] -= q * U[r][p];
        }
    }
    const piv = w.findIndex(x => x !== 0);
    const col = U.map(r => r[piv]);
    return w[piv] === g ? col : col.map(x => -x);
}

function invertSmall(M) {
    const n = M.length;
    const X = M.map((r, i) => [...r.map(Number), ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(X[r][c]) > Math.abs(X[p][c])) p = r;
        [X[c], X[p]] = [X[p], X[c]];
        const d = X[c][c];
        for (let j = 0; j < 2 * n; j++) X[c][j] /= d;
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = X[r][c];
            if (f) for (let j = 0; j < 2 * n; j++) X[r][j] -= f * X[c][j];
        }
    }
    return X.map(r => r.slice(n));
}

/** All integer x with (x + c)ᵀ Q (x + c) ≤ R (Fincke–Pohst with a centre). */
export function shortVectorsCentered(Q, c, R, cap = 2e6) {
    const m = Q.length;
    const q = Q.map(r => r.slice());
    for (let i = 0; i < m; i++) {
        for (let k = 0; k < i; k++) q[i][i] -= q[k][k] * q[k][i] * q[k][i];
        for (let j = i + 1; j < m; j++) {
            let s = Q[i][j];
            for (let k = 0; k < i; k++) s -= q[k][k] * q[k][i] * q[k][j];
            q[i][j] = s / q[i][i];
        }
    }
    const out = [];
    const x = new Array(m).fill(0);
    const eps = 1e-9 * (1 + R);
    const rec = (i, T) => {
        // centre for coordinate i: −c_i − Σ_{j>i} q_ij (x_j + c_j)
        let cen = -c[i];
        for (let j = i + 1; j < m; j++) cen -= q[i][j] * (x[j] + c[j]);
        const w = Math.sqrt(Math.max(0, (T + eps) / q[i][i]));
        const lo = Math.ceil(cen - w), hi = Math.floor(cen + w);
        for (let xi = lo; xi <= hi; xi++) {
            x[i] = xi;
            const d = xi - cen;
            const T2 = T - q[i][i] * d * d;
            if (T2 < -eps) continue;
            if (i === 0) { out.push(x.slice()); if (out.length > cap) throw new Error('enumeration too large'); }
            else rec(i - 1, T2);
        }
        x[i] = 0;
    };
    rec(m - 1, R);
    return out;
}

/**
 * A point q of p₀^⊥ in the open Weyl chamber of the finite root system
 * `roots`; when `wall` is given, q is chosen next to wall^⊥ on its negative
 * side, so that wall^⊥ bounds that chamber.
 */
function genericChamberPoint(A, p0, roots, wall) {
    const m = A.length;
    const B = (u, v) => bil(A, u, v);
    const f0 = B(p0, p0);
    // pseudo-random but deterministic direction
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
    for (let attempt = 0; attempt < 50; attempt++) {
        let r = Array.from({ length: m }, () => rnd() * (1 + attempt));
        r = r.map((x, i) => x - (B(r, p0) / f0) * p0[i]);
        if (wall) { const fw = B(wall, wall); const c = B(r, wall) / fw; r = r.map((x, i) => x - c * wall[i]); }
        // generic: away from every other mirror
        let minGap = Infinity;
        for (const a of roots) {
            if (wall && (keyOf(a) === keyOf(wall) || keyOf(a.map(t => -t)) === keyOf(wall))) continue;
            minGap = Math.min(minGap, Math.abs(B(r, a)) / Math.sqrt(B(a, a)));
        }
        if (!(minGap > 1e-6)) continue;
        if (!wall) return r;
        const fw = B(wall, wall);
        let eps = Infinity;
        for (const a of roots) {
            const bw = Math.abs(B(wall, a));
            if (bw === 0 || keyOf(a) === keyOf(wall) || keyOf(a.map(t => -t)) === keyOf(wall)) continue;
            eps = Math.min(eps, 0.25 * Math.abs(B(r, a)) / bw);
        }
        if (!isFinite(eps)) eps = 1;
        // B(q, wall) = −eps·f(wall) < 0, and every other root keeps its sign
        return r.map((x, i) => x - eps * wall[i]);
    }
    throw new Error('could not find a generic chamber point');
}
