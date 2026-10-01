/**
 * ringEngine.js — exact arithmetic for subrings of number fields.
 *
 * Given K = Q[x]/(f) and elements β_1..β_k of K, describe R = Z[β_1, …, β_k]:
 *   • its fraction field L = Q(β_1, …, β_k) ⊆ K,
 *   • the ring of integers O_L (Round 2, Pohst–Zassenhaus),
 *   • the set S of primes of L at which some β_i has a pole,
 *   • the order R_0 = R ∩ O_L and the index [O_{L,S} : R] = [O_L : R_0].
 *
 * Facts used (R ⊆ L finitely generated, D = rational primes under S):
 *   R is integrally closed in O_{L,S}, the quotient O_{L,S}/R is finite, and
 *   R = R_0[1/s] for any s ∈ R_0 whose prime divisors are exactly S.
 *   Away from D, R_0 agrees with the order Z[c_i β_i] (c_i clears denominators).
 *   At p ∈ D, the p-adic closure of R is ∏_{𝔭∈S} L_𝔭 × Z_p[β e_T], so R_0 is
 *   computed there from integral approximations of the β_i at the primes T above p
 *   that are not in S.
 *
 * Everything is BigInt-exact. Works in the browser (global NumberRingEngine),
 * in a Web Worker (importScripts) and in Node (module.exports).
 */
(function (root) {
'use strict';

// ───────────────────────────── integers ─────────────────────────────

const babs = (a) => (a < 0n ? -a : a);
function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function blcm(a, b) { return (a === 0n || b === 0n) ? 0n : babs((a / bgcd(a, b)) * b); }
function egcd(a, b) {
    let r0 = a, r1 = b, s0 = 1n, s1 = 0n, t0 = 0n, t1 = 1n;
    while (r1 !== 0n) {
        const q = r0 / r1;
        [r0, r1] = [r1, r0 - q * r1];
        [s0, s1] = [s1, s0 - q * s1];
        [t0, t1] = [t1, t0 - q * t1];
    }
    return r0 < 0n ? [-r0, -s0, -t0] : [r0, s0, t0];
}
const bmod = (a, m) => { const r = a % m; return r < 0n ? r + m : r; };
function modInv(a, m) {
    const [g, x] = egcd(bmod(a, m), m);
    if (g !== 1n) throw new Error('internal: non-invertible residue');
    return bmod(x, m);
}
function modPow(b, e, m) {
    let r = 1n % m; b = bmod(b, m);
    while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; }
    return r;
}
function vpInt(n, p) { if (n === 0n) return Infinity; n = babs(n); let v = 0; while (n % p === 0n) { n /= p; v++; } return v; }
function floorDiv(a, b) { const q = a / b; return (a % b !== 0n && a < 0n) ? q - 1n : q; } // b > 0
function isqrt(n) { // floor(√n), Newton's method
    if (n < 2n) return n;
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
const pw = (p, k) => p ** BigInt(k);

const SMALL_PRIMES = (() => {
    const lim = 50000, sieve = new Uint8Array(lim + 1), ps = [];
    for (let i = 2; i <= lim; i++) if (!sieve[i]) { ps.push(i); for (let j = i * i; j <= lim; j += i) sieve[j] = 1; }
    return ps;
})();

function isProbablePrime(n) {
    if (n < 2n) return false;
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
    for (const p of bases) { if (n === p) return true; if (n % p === 0n) return false; }
    let d = n - 1n, s = 0;
    while (!(d & 1n)) { d >>= 1n; s++; }
    outer: for (const a of bases) {
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        for (let r = 1; r < s; r++) { x = x * x % n; if (x === n - 1n) continue outer; }
        return false;
    }
    return true;
}

function pollardBrent(n, budget) {
    if (n % 2n === 0n) return 2n;
    let spent = 0;
    for (let c = 1n; c < 30n; c++) {
        const f = (v) => (v * v + c) % n;
        let y = 2n, r = 1n, q = 1n, g = 1n, x = 2n, ys = 2n;
        const m = 128n;
        while (g === 1n) {
            x = y;
            for (let i = 0n; i < r; i++) y = f(y);
            let k = 0n;
            while (k < r && g === 1n) {
                ys = y;
                const lim = m < r - k ? m : r - k;
                for (let i = 0n; i < lim; i++) { y = f(y); q = q * babs(x - y) % n; }
                g = bgcd(q, n); k += m; spent += Number(lim);
                if (spent > budget) return null;
            }
            r *= 2n;
        }
        if (g === n) { do { ys = f(ys); g = bgcd(babs(x - ys), n); } while (g === 1n); }
        if (g !== n) return g;
    }
    return null;
}

/** Factor |n| (n ≠ 0). Returns { factors: [[p, e], …] ascending, complete }. */
function factorInt(n, budget = 2e6) {
    n = babs(n);
    const res = new Map();
    let complete = true;
    const add = (p, e = 1) => res.set(p, (res.get(p) || 0) + e);
    for (const sp of SMALL_PRIMES) {
        const p = BigInt(sp);
        if (p * p > n) break;
        if (n % p === 0n) { let e = 0; while (n % p === 0n) { n /= p; e++; } add(p, e); }
    }
    const stack = n > 1n ? [n] : [];
    const bound = BigInt(SMALL_PRIMES[SMALL_PRIMES.length - 1]) ** 2n;
    while (stack.length) {
        const m = stack.pop();
        if (m === 1n) continue;
        if (m < bound || isProbablePrime(m)) { add(m); continue; }
        const r = isqrt(m);
        if (r * r === m) { stack.push(r, r); continue; }
        const d = pollardBrent(m, budget);
        if (!d) { complete = false; add(m); continue; }
        stack.push(d, m / d);
    }
    const factors = [...res.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return { factors, complete };
}
function primeDivisors(n) {
    const { factors, complete } = factorInt(n);
    if (!complete) throw new Error(`could not factor ${n}; try elements with smaller denominators`);
    return factors.map(([p]) => p);
}
/** Prime divisors for display only: cheap, may omit a large unfactored part. */
function knownPrimeDivisors(n) {
    const { factors, complete } = factorInt(n, 2e5);
    return { primes: factors.filter(([p]) => !complete ? isProbablePrime(p) : true).map(([p]) => `${p}`), complete };
}

// Deterministic pseudo-random numbers (xorshift32) so results are reproducible.
function makeRng(seed = 0x9e3779b9) {
    let s = seed >>> 0;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
    return {
        int: (k) => next() % k,
        mod: (p) => { let x = 0n; const bits = p.toString(2).length + 16; for (let b = 0; b < bits; b += 32) x = (x << 32n) | BigInt(next()); return x % p; },
    };
}

// ───────────────────────────── rationals ─────────────────────────────

class Rat {
    constructor(n, d = 1n) {
        if (d === 0n) throw new Error('division by zero');
        if (d < 0n) { n = -n; d = -d; }
        if (d !== 1n) { const g = bgcd(n, d); if (g > 1n) { n /= g; d /= g; } }
        this.n = n; this.d = d;
    }
    add(o) { return this.d === 1n && o.d === 1n ? new Rat(this.n + o.n) : new Rat(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return this.d === 1n && o.d === 1n ? new Rat(this.n - o.n) : new Rat(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Rat(this.n * o.n, this.d * o.d); }
    div(o) { if (o.n === 0n) throw new Error('division by zero'); return new Rat(this.n * o.d, this.d * o.n); }
    neg() { return new Rat(-this.n, this.d); }
    abs() { return this.n < 0n ? this.neg() : this; }
    isZero() { return this.n === 0n; }
    isInt() { return this.d === 1n; }
    eq(o) { return this.n === o.n && this.d === o.d; }
    sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
}
const R0 = new Rat(0n), R1 = new Rat(1n);
const ratOf = (x) => (x instanceof Rat ? x : new Rat(BigInt(x)));

// ─────────────────────── polynomials over Q (Rat[], low → high) ───────────────────────

function qpTrim(a) { let k = a.length; while (k > 0 && a[k - 1].isZero()) k--; return k === a.length ? a : a.slice(0, k); }
const qpDeg = (a) => a.length - 1;
function qpAdd(a, b) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push((a[i] || R0).add(b[i] || R0)); return qpTrim(r); }
function qpSub(a, b) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push((a[i] || R0).sub(b[i] || R0)); return qpTrim(r); }
function qpScale(a, c) { return qpTrim(a.map((x) => x.mul(c))); }
function qpMul(a, b) {
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(R0);
    for (let i = 0; i < a.length; i++) { if (a[i].isZero()) continue; for (let j = 0; j < b.length; j++) r[i + j] = r[i + j].add(a[i].mul(b[j])); }
    return qpTrim(r);
}
function qpDivmod(a, b) {
    const db = qpDeg(b), lb = b[db];
    let r = a.slice();
    const q = new Array(Math.max(0, r.length - db)).fill(R0);
    while (r.length && qpDeg(r) >= db) {
        const k = qpDeg(r) - db, c = r[r.length - 1].div(lb);
        q[k] = c;
        for (let i = 0; i <= db; i++) r[i + k] = r[i + k].sub(c.mul(b[i]));
        r = qpTrim(r);
    }
    return [qpTrim(q), r];
}
const qpMonic = (a) => (a.length ? qpScale(a, R1.div(a[a.length - 1])) : a);
function qpXgcd(a, b) { // s a + t b = g, g monic
    let [r0, r1, s0, s1, t0, t1] = [a, b, [R1], [], [], [R1]];
    while (r1.length) {
        const [q, r] = qpDivmod(r0, r1);
        [r0, r1] = [r1, r];
        [s0, s1] = [s1, qpSub(s0, qpMul(q, s1))];
        [t0, t1] = [t1, qpSub(t0, qpMul(q, t1))];
    }
    const c = R1.div(r0[r0.length - 1]);
    return [qpScale(r0, c), qpScale(s0, c), qpScale(t0, c)];
}
const qpDeriv = (a) => qpTrim(a.slice(1).map((c, i) => c.mul(new Rat(BigInt(i + 1)))));

/** Number of real roots of a squarefree polynomial (Sturm). */
function realRootCount(f) {
    if (qpDeg(f) < 1) return 0;
    const seq = [f, qpDeriv(f)];
    while (qpDeg(seq[seq.length - 1]) > 0) {
        const r = qpDivmod(seq[seq.length - 2], seq[seq.length - 1])[1];
        if (!r.length) break;
        seq.push(qpScale(r, new Rat(-1n)));
    }
    const changes = (signs) => { let c = 0, prev = 0; for (const s of signs) { if (!s) continue; if (prev && s !== prev) c++; prev = s; } return c; };
    const atPos = seq.map((p) => p[p.length - 1].sign());
    const atNeg = seq.map((p) => p[p.length - 1].sign() * (qpDeg(p) % 2 ? -1 : 1));
    return changes(atNeg) - changes(atPos);
}

// ─────────────────────── the algebra Q[x]/(m) ───────────────────────

class PolyAlg {
    constructor(m) { this.m = qpTrim(m); this.n = qpDeg(this.m); }
    pad(p) { const r = p.slice(0, this.n); while (r.length < this.n) r.push(R0); return r; }
    reduce(p) { return this.pad(qpDivmod(qpTrim(p), this.m)[1]); }
    one() { const v = new Array(this.n).fill(R0); v[0] = R1; return v; }
    gen() { return this.n === 1 ? [this.m[0].neg().div(this.m[1])] : this.reduce([R0, R1]); }
    fromRat(r) { const v = new Array(this.n).fill(R0); v[0] = r; return v; }
    add(u, v) { return u.map((x, i) => x.add(v[i])); }
    sub(u, v) { return u.map((x, i) => x.sub(v[i])); }
    neg(u) { return u.map((x) => x.neg()); }
    scale(u, c) { return u.map((x) => x.mul(c)); }
    mul(u, v) { return this.reduce(qpMul(qpTrim(u), qpTrim(v))); }
    isZero(u) { return u.every((x) => x.isZero()); }
    inv(u) {
        const ut = qpTrim(u);
        if (!ut.length) throw new Error('division by zero');
        const [g, s] = qpXgcd(ut, this.m);
        if (qpDeg(g) > 0) throw new Error('division by a zero divisor');
        return this.reduce(s);
    }
    pow(u, k) {
        let e = BigInt(k);
        if (e < 0n) { u = this.inv(u); e = -e; }
        let r = this.one(), b = u;
        while (e > 0n) { if (e & 1n) r = this.mul(r, b); b = this.mul(b, b); e >>= 1n; }
        return r;
    }
    /** Monic minimal polynomial over Q (Krylov). */
    minpoly(u) {
        const n = this.n, basis = [];
        let p = this.one();
        for (let k = 0; k <= n; k++) {
            let vec = p.slice();
            let comb = new Array(n + 1).fill(R0); comb[k] = R1;
            for (const b of basis) {
                const t = vec[b.piv];
                if (t.isZero()) continue;
                const f = t.div(b.vec[b.piv]);
                vec = vec.map((x, i) => x.sub(f.mul(b.vec[i])));
                comb = comb.map((x, i) => x.sub(f.mul(b.comb[i])));
            }
            const piv = vec.findIndex((x) => !x.isZero());
            if (piv < 0) return qpMonic(qpTrim(comb));
            basis.push({ vec, comb, piv });
            p = this.mul(p, u);
        }
        throw new Error('internal: minimal polynomial not found');
    }
}

// ─────────────────────── rational linear algebra ───────────────────────

function ratVecMat(v, M) {
    const n = M[0].length, out = new Array(n).fill(R0);
    for (let i = 0; i < v.length; i++) {
        const vi = ratOf(v[i]);
        if (vi.isZero()) continue;
        for (let j = 0; j < n; j++) if (!M[i][j].isZero()) out[j] = out[j].add(vi.mul(M[i][j]));
    }
    return out;
}
function ratInverse(M) {
    const n = M.length;
    const A = M.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? R1 : R0))));
    for (let c = 0; c < n; c++) {
        let r = c; while (r < n && A[r][c].isZero()) r++;
        if (r === n) throw new Error('internal: singular matrix');
        [A[c], A[r]] = [A[r], A[c]];
        const inv = R1.div(A[c][c]);
        A[c] = A[c].map((x) => x.mul(inv));
        for (let i = 0; i < n; i++) {
            if (i === c || A[i][c].isZero()) continue;
            const f = A[i][c];
            A[i] = A[i].map((x, j) => x.sub(f.mul(A[c][j])));
        }
    }
    return A.map((r) => r.slice(n));
}
/** Solve x·P = v for x (P has independent rows). */
function ratSolveRows(P, v) {
    const d = P.length, n = v.length;
    const A = [];
    for (let j = 0; j < n; j++) { const row = []; for (let i = 0; i < d; i++) row.push(P[i][j]); row.push(v[j]); A.push(row); }
    const piv = [];
    let rank = 0;
    for (let c = 0; c < d; c++) {
        let r = rank; while (r < n && A[r][c].isZero()) r++;
        if (r === n) continue;
        [A[rank], A[r]] = [A[r], A[rank]];
        const inv = R1.div(A[rank][c]);
        A[rank] = A[rank].map((x) => x.mul(inv));
        for (let i = 0; i < n; i++) if (i !== rank && !A[i][c].isZero()) { const f = A[i][c]; A[i] = A[i].map((x, j) => x.sub(f.mul(A[rank][j]))); }
        piv.push(c); rank++;
    }
    for (let i = rank; i < n; i++) if (!A[i][d].isZero()) return null;
    const x = new Array(d).fill(R0);
    piv.forEach((c, i) => { x[c] = A[i][d]; });
    return x;
}
function detInt(M) { // Bareiss
    const n = M.length;
    if (!n) return 1n;
    const A = M.map((r) => r.slice());
    let sign = 1n, prev = 1n;
    for (let k = 0; k < n - 1; k++) {
        if (A[k][k] === 0n) {
            let r = k + 1; while (r < n && A[r][k] === 0n) r++;
            if (r === n) return 0n;
            [A[k], A[r]] = [A[r], A[k]]; sign = -sign;
        }
        for (let i = k + 1; i < n; i++) for (let j = k + 1; j < n; j++) A[i][j] = (A[i][j] * A[k][k] - A[i][k] * A[k][j]) / prev;
        prev = A[k][k];
    }
    return sign * A[n - 1][n - 1];
}

// ─────────────────────── Hermite normal form over Z ───────────────────────

/**
 * Row HNF of the lattice spanned by integer rows (length n). Pivots move right,
 * are positive, and entries above a pivot lie in [0, pivot). If M is given the
 * lattice must contain M·Z^n; entries are then reduced mod M along the way.
 */
function hnf(rows, n, M = null) {
    const piv = new Array(n).fill(null);
    const red = M ? (x) => bmod(x, M) : null;
    const insert = (v) => {
        for (let c = 0; c < n; c++) {
            if (v[c] === 0n) continue;
            const h = piv[c];
            if (!h) {
                if (v[c] < 0n) for (let j = c; j < n; j++) v[j] = -v[j];
                if (red) for (let j = c + 1; j < n; j++) v[j] = red(v[j]);
                piv[c] = v;
                return;
            }
            const a = h[c], b = v[c];
            if (b % a === 0n) {
                const q = b / a;
                for (let j = c; j < n; j++) v[j] -= q * h[j];
                if (red) for (let j = c + 1; j < n; j++) v[j] = red(v[j]);
                continue;
            }
            const [g, x, y] = egcd(a, b), A = a / g, B = b / g;
            const nh = new Array(n).fill(0n), nv = new Array(n).fill(0n);
            for (let j = c; j < n; j++) { nh[j] = x * h[j] + y * v[j]; nv[j] = A * v[j] - B * h[j]; }
            if (red) for (let j = c + 1; j < n; j++) { nh[j] = red(nh[j]); nv[j] = red(nv[j]); }
            piv[c] = nh; v = nv;
        }
    };
    for (const r of rows) insert(red ? r.map(red) : r.slice());
    if (M) for (let j = 0; j < n; j++) { const v = new Array(n).fill(0n); v[j] = M; insert(v); }
    const out = [], cols = [];
    for (let c = 0; c < n; c++) if (piv[c]) { out.push(piv[c]); cols.push(c); }
    for (let i = 0; i < out.length; i++) {
        const r = out[i];
        for (let k = i + 1; k < out.length; k++) {
            const c = cols[k], q = floorDiv(r[c], out[k][c]);
            if (q) for (let j = c; j < n; j++) r[j] -= q * out[k][j];
        }
    }
    return out;
}
const pivotCol = (row) => row.findIndex((x) => x !== 0n);
function hnfEq(A, B) { return A.length === B.length && A.every((r, i) => r.every((x, j) => x === B[i][j])); }
function hnfContains(H, v) {
    v = v.slice();
    for (const h of H) {
        const c = pivotCol(h);
        if (v[c] % h[c] !== 0n) return false;
        const q = v[c] / h[c];
        if (q) for (let j = c; j < v.length; j++) v[j] -= q * h[j];
    }
    return v.every((x) => x === 0n);
}
const hnfContainsAll = (H, rows) => rows.every((r) => hnfContains(H, r));
const hnfIndex = (H) => H.reduce((acc, r) => acc * r[pivotCol(r)], 1n); // full rank only
const unitVec = (n, i, s = 1n) => { const v = new Array(n).fill(0n); v[i] = s; return v; };
const identityHNF = (n) => Array.from({ length: n }, (_, i) => unitVec(n, i));

/** Lattice spanned by rational vectors: { den, H } meaning (1/den)·rowspan(H). */
function ratLattice(vecs, n) {
    let den = 1n;
    for (const v of vecs) for (const x of v) den = blcm(den, x.d);
    const H = hnf(vecs.map((v) => v.map((x) => x.n * (den / x.d))), n);
    let g = den;
    for (const r of H) for (const x of r) g = bgcd(g, x);
    if (g > 1n) { den /= g; for (const r of H) for (let j = 0; j < n; j++) r[j] /= g; }
    return { den, H };
}
const ratLatticeRows = (L) => L.H.map((r) => r.map((x) => new Rat(x, L.den)));

// ─────────────────────── linear algebra over F_p ───────────────────────

/** Basis of { x ∈ F_p^m : Σ x_i·rows_i = 0 }. */
function leftKernelModP(rows, p) {
    const m = rows.length;
    if (!m) return [];
    const k = rows[0].length;
    const A = rows.map((r, i) => { const a = new Array(k + m).fill(0n); for (let j = 0; j < k; j++) a[j] = bmod(r[j], p); a[k + i] = 1n; return a; });
    let rank = 0;
    for (let c = 0; c < k && rank < m; c++) {
        let r = rank; while (r < m && A[r][c] === 0n) r++;
        if (r === m) continue;
        [A[rank], A[r]] = [A[r], A[rank]];
        const inv = modInv(A[rank][c], p);
        for (let j = c; j < k + m; j++) A[rank][j] = A[rank][j] * inv % p;
        for (let i = rank + 1; i < m; i++) {
            const f = A[i][c];
            if (f) for (let j = c; j < k + m; j++) A[i][j] = bmod(A[i][j] - f * A[rank][j], p);
        }
        rank++;
    }
    return A.slice(rank).map((r) => r.slice(k));
}
function rrefModP(rows, p) {
    const n = rows.length ? rows[0].length : 0;
    const A = rows.map((r) => r.map((x) => bmod(x, p))).filter((r) => r.some((x) => x));
    const pivots = [];
    let rank = 0;
    for (let c = 0; c < n && rank < A.length; c++) {
        let r = rank; while (r < A.length && A[r][c] === 0n) r++;
        if (r === A.length) continue;
        [A[rank], A[r]] = [A[r], A[rank]];
        const inv = modInv(A[rank][c], p);
        A[rank] = A[rank].map((x) => x * inv % p);
        for (let i = 0; i < A.length; i++) {
            if (i === rank || !A[i][c]) continue;
            const f = A[i][c];
            A[i] = A[i].map((x, j) => bmod(x - f * A[rank][j], p));
        }
        pivots.push(c); rank++;
    }
    return { rows: A.slice(0, rank), pivots };
}

// ─────────────────────── polynomials over F_p (BigInt[], low → high) ───────────────────────

function fpTrim(a) { let k = a.length; while (k > 0 && a[k - 1] === 0n) k--; return k === a.length ? a : a.slice(0, k); }
const fpNorm = (a, p) => fpTrim(a.map((x) => bmod(x, p)));
function fpAdd(a, b, p) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(bmod((a[i] || 0n) + (b[i] || 0n), p)); return fpTrim(r); }
function fpSub(a, b, p) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(bmod((a[i] || 0n) - (b[i] || 0n), p)); return fpTrim(r); }
function fpMul(a, b, p) {
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(0n);
    for (let i = 0; i < a.length; i++) { if (!a[i]) continue; for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; }
    return fpNorm(r, p);
}
function fpDivmod(a, b, p) {
    const db = b.length - 1, inv = modInv(b[db], p);
    let r = a.slice();
    const q = new Array(Math.max(0, r.length - db)).fill(0n);
    while (r.length && r.length - 1 >= db) {
        const k = r.length - 1 - db, c = r[r.length - 1] * inv % p;
        q[k] = c;
        for (let i = 0; i <= db; i++) r[i + k] = bmod(r[i + k] - c * b[i], p);
        r = fpTrim(r);
    }
    return [fpTrim(q), r];
}
const fpMonic = (a, p) => { if (!a.length) return a; const inv = modInv(a[a.length - 1], p); return a.map((x) => x * inv % p); };
function fpGcd(a, b, p) { while (b.length) [a, b] = [b, fpDivmod(a, b, p)[1]]; return fpMonic(a, p); }
function fpXgcd(a, b, p) { // s a + t b = g (monic)
    let [r0, r1, s0, s1, t0, t1] = [a, b, [1n], [], [], [1n]];
    while (r1.length) {
        const [q, r] = fpDivmod(r0, r1, p);
        [r0, r1] = [r1, r];
        [s0, s1] = [s1, fpSub(s0, fpMul(q, s1, p), p)];
        [t0, t1] = [t1, fpSub(t0, fpMul(q, t1, p), p)];
    }
    const c = modInv(r0[r0.length - 1], p);
    const sc = (x) => fpNorm(x.map((y) => y * c), p);
    return [sc(r0), sc(s0), sc(t0)];
}
const fpRem = (a, m, p) => fpDivmod(a, m, p)[1];
function fpPowMod(base, e, m, p) {
    let r = fpRem([1n], m, p), b = fpRem(base, m, p);
    while (e > 0n) { if (e & 1n) r = fpRem(fpMul(r, b, p), m, p); b = fpRem(fpMul(b, b, p), m, p); e >>= 1n; }
    return r;
}
const fpDeriv = (a, p) => fpNorm(a.slice(1).map((c, i) => c * BigInt(i + 1)), p);
function fpEval(a, x, p) { let r = 0n; for (let i = a.length - 1; i >= 0; i--) r = (r * x + a[i]) % p; return r; }

/** Distinct-degree factorisation of a monic squarefree f: [[product, degree], …]. */
function fpDDF(f, p) {
    const res = [], X = [0n, 1n];
    let rem = f, h = X, d = 0;
    while (rem.length - 1 >= 2 * (d + 1)) {
        d++;
        h = fpPowMod(h, p, rem, p);
        const g = fpGcd(rem, fpSub(h, X, p), p);
        if (g.length > 1) { res.push([g, d]); rem = fpDivmod(rem, g, p)[0]; h = fpRem(h, rem, p); }
    }
    if (rem.length > 1) res.push([rem, rem.length - 1]);
    return res;
}
/** Equal-degree splitting (Cantor–Zassenhaus; trace map in characteristic 2). */
function fpEDF(g, d, p, rng) {
    const n = g.length - 1;
    if (n === d) return [g];
    for (let tries = 0; tries < 400; tries++) {
        const a = fpTrim(Array.from({ length: n }, () => rng.mod(p)));
        if (a.length < 2) continue;
        let b;
        if (p === 2n) { b = a; let t = a; for (let i = 1; i < d; i++) { t = fpRem(fpMul(t, t, p), g, p); b = fpAdd(b, t, p); } }
        else b = fpSub(fpPowMod(a, (pw(p, d) - 1n) / 2n, g, p), [1n], p);
        const h = fpGcd(g, b, p);
        if (h.length > 1 && h.length < g.length) return fpEDF(h, d, p, rng).concat(fpEDF(fpDivmod(g, h, p)[0], d, p, rng));
    }
    throw new Error('internal: equal-degree factorisation failed');
}
function fpFactorSquarefree(f, p, rng) {
    const out = [];
    for (const [g, d] of fpDDF(fpMonic(f, p), p)) out.push(...fpEDF(g, d, p, rng));
    return out;
}
/** Roots of a polynomial over F_p that splits into distinct linear factors. */
function fpRoots(mu, p, rng) {
    mu = fpMonic(mu, p);
    if (mu.length === 2) return [bmod(-mu[0], p)];
    if (p <= 3000n) { const r = []; for (let x = 0n; x < p; x++) if (fpEval(mu, x, p) === 0n) r.push(x); return r; }
    return fpEDF(mu, 1, p, rng).map((l) => bmod(-l[0], p));
}

// ─────────────────────── factoring over Z (Zassenhaus) ───────────────────────

const zTrim = (a) => { let k = a.length; while (k > 0 && a[k - 1] === 0n) k--; return a.slice(0, k); };
function zMul(a, b) { const r = new Array(a.length + b.length - 1).fill(0n); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; return zTrim(r); }
const zContent = (a) => a.reduce((g, x) => bgcd(g, x), 0n);
function zPrimitive(a) { const c = zContent(a); let r = a.map((x) => x / c); if (r[r.length - 1] < 0n) r = r.map((x) => -x); return r; }
const zEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const symmetric = (a, m) => a.map((x) => { x = bmod(x, m); return x > m / 2n ? x - m : x; });
function zPolyMulMod(a, b, m) { return zMul(a, b).map((x) => bmod(x, m)); }

function henselLift(F, facs, p, k) { // F ≡ lc · ∏ facs (mod p), facs monic → lifts mod p^k
    const pk = pw(p, k);
    if (facs.length === 1) { const inv = modInv(F[F.length - 1], pk); return [F.map((x) => bmod(x * inv, pk))]; }
    const g0 = facs[0];
    let h0 = [bmod(F[F.length - 1], p)];
    for (let i = 1; i < facs.length; i++) h0 = fpMul(h0, facs[i], p);
    const [, s, t] = fpXgcd(g0, h0, p);
    let g = g0.slice(), h = h0.slice();
    for (let j = 1; j < k; j++) {
        const pj = pw(p, j);
        const diff = zTrim(zMul(g, h).map((x, i) => bmod((F[i] || 0n) - x, pw(p, j + 1))));
        const e = fpNorm(diff.map((x) => x / pj), p);
        const te = fpMul(t, e, p);
        const [q, dg] = fpDivmod(te, g0, p);
        const dh = fpAdd(fpMul(s, e, p), fpMul(q, h0, p), p);
        g = g.map((x, i) => x + pj * (dg[i] || 0n));
        h = Array.from({ length: Math.max(h.length, dh.length) }, (_, i) => (h[i] || 0n) + pj * (dh[i] || 0n));
    }
    return [g.map((x) => bmod(x, pk))].concat(henselLift(h.map((x) => bmod(x, pk)), facs.slice(1), p, k));
}
function* combinations(n, k, start = 0, acc = []) {
    if (acc.length === k) { yield acc.slice(); return; }
    for (let i = start; i < n; i++) { acc.push(i); yield* combinations(n, k, i + 1, acc); acc.pop(); }
}
/** Irreducible factors of a primitive squarefree F ∈ Z[x]. */
function zFactorSquarefree(F) {
    const n = F.length - 1;
    if (n <= 1) return [F];
    const rng = makeRng(12345), lc = F[n];
    let best = null, tried = 0;
    for (const sp of SMALL_PRIMES) {
        const p = BigInt(sp);
        if (lc % p === 0n) continue;
        const fp = fpMonic(fpNorm(F, p), p);
        if (fpGcd(fp, fpDeriv(fp, p), p).length > 1) continue;
        const facs = fpFactorSquarefree(fp, p, rng);
        if (facs.length === 1) return [F];
        if (!best || facs.length < best.facs.length) best = { p, facs };
        if (++tried >= 8) break;
    }
    const { p, facs } = best;
    let norm2 = 0n; for (const c of F) norm2 += c * c;
    const bound = 2n * babs(lc) * pw(2n, n) * (isqrt(norm2) + 1n);
    let k = 1; while (pw(p, k) <= bound) k++;
    const pk = pw(p, k);
    let rest = henselLift(F, facs, p, k), f = F;
    const result = [];
    for (let s = 1; 2 * s <= rest.length;) {
        let found = false;
        for (const T of combinations(rest.length, s)) {
            const lcf = f[f.length - 1], inT = new Set(T);
            let G = [bmod(lcf, pk)], H = [bmod(lcf, pk)];
            rest.forEach((g, i) => { if (inT.has(i)) G = zPolyMulMod(G, g, pk); else H = zPolyMulMod(H, g, pk); });
            const Gp = zPrimitive(zTrim(symmetric(G, pk))), Hp = zPrimitive(zTrim(symmetric(H, pk)));
            const prod = zMul(Gp, Hp);
            if (zEq(prod, f) || zEq(prod.map((x) => -x), f)) {
                result.push(Gp); f = Hp; rest = rest.filter((_, i) => !inT.has(i)); found = true; break;
            }
        }
        if (!found) s++;
    }
    result.push(f);
    return result;
}

// ─────────────────────── number fields Q[y]/(g), g monic integral ───────────────────────

class NumField {
    constructor(g) {
        this.g = g;
        const n = this.n = g.length - 1;
        this.alg = new PolyAlg(g.map((x) => new Rat(x)));
        const tr = [BigInt(n)];
        for (let k = 1; k <= 2 * n - 2; k++) {
            let s = 0n;
            if (k <= n) { for (let i = 1; i < k; i++) s += g[n - i] * tr[k - i]; s += BigInt(k) * g[n - k]; }
            else for (let i = 1; i <= n; i++) s += g[n - i] * tr[k - i];
            tr.push(-s);
        }
        const T = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => tr[i + j]));
        this.disc = detInt(T);
    }
    mul(u, v) { return this.alg.mul(u, v); }
    one() { return this.alg.one(); }
}

/** An order with Z-basis B (rows, power-basis coordinates) and integer structure constants. */
class Order {
    constructor(nf, B) {
        this.nf = nf; this.B = B;
        const n = this.n = nf.n;
        this.Binv = ratInverse(B);
        this.C = Array.from({ length: n }, () => new Array(n));
        for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
            const c = ratVecMat(nf.mul(B[i], B[j]), this.Binv).map((x) => { if (!x.isInt()) throw new Error('internal: lattice is not a ring'); return x.n; });
            this.C[i][j] = this.C[j][i] = c;
        }
        this.one = ratVecMat(nf.one(), this.Binv).map((x) => x.n);
    }
    toCoords(v) { return ratVecMat(v, this.Binv); }
    fromCoords(c) { return ratVecMat(c, this.B); }
    mul(x, y) {
        const n = this.n, z = new Array(n).fill(0n);
        for (let i = 0; i < n; i++) {
            if (!x[i]) continue;
            for (let j = 0; j < n; j++) {
                if (!y[j]) continue;
                const xy = x[i] * y[j], c = this.C[i][j];
                for (let k = 0; k < n; k++) if (c[k]) z[k] += xy * c[k];
            }
        }
        return z;
    }
    mulMod(x, y, M) { return this.mul(x, y).map((v) => bmod(v, M)); }
    powMod(x, e, M) {
        let r = this.one.map((v) => bmod(v, M)), b = x.map((v) => bmod(v, M));
        while (e > 0n) { if (e & 1n) r = this.mulMod(r, b, M); b = this.mulMod(b, b, M); e >>= 1n; }
        return r;
    }
    norm(x) { return detInt(Array.from({ length: this.n }, (_, i) => this.mul(x, unitVec(this.n, i)))); }
}

function canonicalBasis(vecs, n) { return ratLatticeRows(ratLattice(vecs, n)); }

// ── Round 2 ──
function pRadical(O, p) {
    const n = O.n;
    let q = p; while (q < BigInt(n)) q *= p;
    const frob = []; for (let i = 0; i < n; i++) frob.push(O.powMod(unitVec(n, i), q, p));
    return hnf(leftKernelModP(frob, p), n, p);
}
function pMaximal(O, p) {
    for (let guard = 0; guard < 64; guard++) {
        const n = O.n, I = pRadical(O, p);
        const Ginv = ratInverse(I.map((r) => r.map((x) => new Rat(x))));
        const rows = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (const gj of I) {
                for (const x of ratVecMat(O.mul(unitVec(n, i), gj), Ginv)) {
                    if (!x.isInt()) throw new Error('internal: radical is not an ideal');
                    row.push(bmod(x.n, p));
                }
            }
            rows.push(row);
        }
        const ker = leftKernelModP(rows, p);
        if (!ker.length) return O;
        const U = hnf(ker, n, p), invp = new Rat(1n, p);
        O = new Order(O.nf, canonicalBasis(U.map((r) => O.fromCoords(r).map((x) => x.mul(invp))), n));
    }
    throw new Error('internal: Round 2 did not terminate');
}
function maximalOrder(nf) {
    const n = nf.n;
    let O = new Order(nf, Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? R1 : R0))));
    const { factors, complete } = factorInt(nf.disc);
    let certified = complete;
    for (const [p, e] of factors) {
        if (e < 2) continue;
        if (!isProbablePrime(p)) { certified = false; continue; }
        O = pMaximal(O, p);
    }
    let index = 1n; // [O_L : Z[θ]]
    const det = O.B.reduce((acc, r, i) => acc.mul(r[i]), R1); // HNF: triangular
    index = det.d / babs(det.n);
    return { O, certified, index, disc: nf.disc / (index * index) };
}

// ── prime decomposition in a maximal order ──
function quotientAlgebra(A, p, n) {
    const W = rrefModP(A, p), piv = new Set(W.pivots);
    const free = []; for (let j = 0; j < n; j++) if (!piv.has(j)) free.push(j);
    const reduce = (v) => {
        v = v.map((x) => bmod(x, p));
        W.rows.forEach((row, r) => { const t = v[W.pivots[r]]; if (t) for (let j = 0; j < n; j++) v[j] = bmod(v[j] - t * row[j], p); });
        return v;
    };
    return { free, reduce, dim: free.length };
}
function antiUniformizer(O, P, p) {
    const n = O.n, rows = [];
    for (let i = 0; i < n; i++) { const row = []; for (const pj of P) for (const x of O.mul(unitVec(n, i), pj)) row.push(bmod(x, p)); rows.push(row); }
    return leftKernelModP(rows, p)[0];
}
/** v_𝔭 of a nonzero integral element y (O-coordinates). */
function valuationInt(O, pr, y) {
    if (y.every((x) => x === 0n)) return Infinity;
    const p = pr.p;
    let v = 0;
    if (pr.e !== undefined) while (y.every((x) => x % p === 0n)) { y = y.map((x) => x / p); v += pr.e; }
    for (let guard = 0; guard < 100000; guard++) {
        const z = O.mul(y, pr.b);
        if (!z.every((x) => x % p === 0n)) return v;
        y = z.map((x) => x / p); v++;
    }
    throw new Error('internal: valuation did not terminate');
}
const valuationSV = (O, pr, s) => valuationInt(O, pr, s.v) - pr.e * vpInt(s.den, pr.p);

function primesAbove(O, p) {
    const n = O.n, rng = makeRng(Number(p % 1000003n) + 7);
    const oneVec = O.one;
    const found = [], stack = [pRadical(O, p)];
    while (stack.length) {
        const A = stack.pop();
        const Q = quotientAlgebra(A, p, n);
        const frobRows = Q.free.map((j) => {
            const ep = Q.reduce(O.powMod(unitVec(n, j), p, p));
            return Q.free.map((c) => bmod(ep[c] - (c === j ? 1n : 0n), p));
        });
        const fixed = leftKernelModP(frobRows, p).map((y) => { const v = new Array(n).fill(0n); Q.free.forEach((c, t) => { v[c] = y[t]; }); return v; });
        if (fixed.length <= 1) { found.push({ H: A, f: Q.dim }); continue; }
        const one = Q.reduce(oneVec), k0 = one.findIndex((x) => x !== 0n);
        const x = fixed.find((v) => { const t = v[k0] * modInv(one[k0], p) % p; return v.some((vi, i) => bmod(vi - t * one[i], p) !== 0n); });
        // minimal polynomial of x in O/A — it splits into distinct linear factors
        const basis = [];
        let pwr = one, mu = null;
        for (let k = 0; k <= Q.dim && !mu; k++) {
            let vec = Q.free.map((c) => pwr[c]), comb = new Array(Q.dim + 1).fill(0n); comb[k] = 1n;
            for (const b of basis) {
                const t = vec[b.piv];
                if (!t) continue;
                const f = t * modInv(b.vec[b.piv], p) % p;
                vec = vec.map((v, i) => bmod(v - f * b.vec[i], p));
                comb = comb.map((v, i) => bmod(v - f * b.comb[i], p));
            }
            const piv = vec.findIndex((v) => v !== 0n);
            if (piv < 0) mu = fpTrim(comb);
            else { basis.push({ vec, comb, piv }); pwr = Q.reduce(O.mulMod(pwr, x, p)); }
        }
        for (const r of fpRoots(mu, p, rng)) {
            const y = x.map((v, i) => bmod(v - r * one[i], p));
            const gens = A.slice();
            for (let i = 0; i < n; i++) gens.push(O.mulMod(y, unitVec(n, i), p));
            stack.push(hnf(gens, n, p));
        }
    }
    const primes = found.map(({ H, f }) => {
        const pr = { p, H, f, b: antiUniformizer(O, H, p) };
        pr.e = valuationInt(O, pr, O.one.map((x) => x * p));
        return pr;
    });
    primes.sort((a, b) => (a.f - b.f) || (a.e - b.e) || cmpRows(a.H, b.H));
    return primes;
}
function cmpRows(A, B) {
    for (let i = 0; i < Math.min(A.length, B.length); i++) for (let j = 0; j < A[i].length; j++) if (A[i][j] !== B[i][j]) return A[i][j] < B[i][j] ? -1 : 1;
    return 0;
}

// ── ideals and closures (O-coordinates) ──
function idealMul(O, A, B, M) { const g = []; for (const a of A) for (const b of B) g.push(O.mulMod(a, b, M)); return hnf(g, O.n, M); }
function closureMod(O, gens, start, M) {
    let H = hnf(start.concat([O.one]), O.n, M);
    for (;;) {
        const rows = H.slice();
        for (const r of H) for (const g of gens) rows.push(O.mulMod(r, g, M));
        const H2 = hnf(rows, O.n, M);
        if (hnfEq(H2, H)) return H;
        H = H2;
    }
}
/** The order Z[gens] for integral gens (O-coordinates). */
function closureInt(O, gens) {
    const n = O.n;
    let H = hnf([O.one], n), M = null;
    for (;;) {
        const rows = H.slice();
        for (const r of H) for (const g of gens) rows.push(M ? O.mulMod(r, g, M) : O.mul(r, g));
        let H2 = hnf(rows, n, M);
        if (!M && H2.length === n) { M = hnfIndex(H2); H2 = hnf(H2, n, M); }
        if (hnfEq(H2, H)) return H;
        H = H2;
    }
}

// ── the local order at a prime p under S whose fibre is not entirely in S ──
function separator(O, p, S, T) {
    let J = identityHNF(O.n);
    for (const s of S) J = idealMul(O, J, s.H, p);
    let z = new Array(O.n).fill(0n);
    for (const q of T) {
        let A = J;
        for (const q2 of T) if (q2 !== q) A = idealMul(O, A, q2.H, p);
        const r = A.find((row) => !hnfContains(q.H, row));
        z = z.map((x, i) => x + r[i]);
    }
    return z.map((x) => bmod(x, p));
}
function localOrder(O, p, S, T, betas) {
    const n = O.n;
    const z = separator(O, p, S, T);
    const tCache = new Map();
    const Tpower = (k) => {
        if (k === 0) return identityHNF(n);
        if (!tCache.has(k)) {
            const M = pw(p, k);
            let A = identityHNF(n);
            for (const q of T) for (let i = 0; i < q.e * k; i++) A = idealMul(O, A, q.H, M);
            tCache.set(k, A);
        }
        return tCache.get(k);
    };
    const maxPole = Math.max(...S.map((s) => s.pole));
    for (let k = 1; k <= 40; k++) {
        const pk = pw(p, k);
        let E = 1n;
        for (const q of T) { const Nq = pw(p, q.f); E = blcm(E, (Nq - 1n) * pw(Nq, q.e * k - 1)); }
        const EE = E * ((BigInt(maxPole) + E - 1n) / E);
        let K = k; for (const s of S) K = Math.max(K, Math.ceil(s.pole / s.e));
        const u = O.powMod(z, EE, pw(p, K));        // ≡ 1 at T, divisible by every pole order at S
        const gens = betas.map((b) => {
            const a = vpInt(b.den, p), pa = pw(p, a), m = b.den / pa;
            const w = O.mul(u, b.v);
            if (w.some((x) => x % pa !== 0n)) throw new Error('internal: approximation is not integral');
            const minv = modInv(bmod(m, pk), pk);
            return w.map((x) => bmod((x / pa) * minv, pk));
        });
        const Lp = closureMod(O, gens, Tpower(k), pk);
        if (hnfContainsAll(Lp, Tpower(k - 1))) return Lp;
    }
    throw new Error('internal: local order did not stabilise');
}

// ─────────────────────── parsing ───────────────────────

function tokenize(src) {
    const s = src.replace(/[−–]/g, '-').replace(/[·×]/g, '*').replace(/\*\*/g, '^');
    const toks = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9.]/.test(c)) {
            let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
            const txt = s.slice(i, j);
            if (!/^\d+(\.\d*)?$|^\.\d+$/.test(txt)) throw new Error(`can't read the number "${txt}"`);
            toks.push({ t: 'num', v: txt }); i = j; continue;
        }
        if (/[A-Za-zα-ωΑ-Ω]/.test(c)) {
            let j = i; while (j < s.length && /[A-Za-zα-ωΑ-Ω]/.test(s[j])) j++;
            const word = s.slice(i, j);
            if (word.length > 1 && word !== 'alpha' && word !== 'theta') {
                if (/^sqrt|^cbrt|^exp|^log|^sin|^cos|^pi$/.test(word)) throw new Error(`"${word}" isn't supported — write elements as polynomials in the root (e.g. a^2, (1 + a)/2)`);
                for (const ch of word) toks.push({ t: 'id', v: ch }); // ab → a·b
            } else toks.push({ t: 'id', v: word });
            i = j; continue;
        }
        if ('+-*/^()'.includes(c)) { toks.push({ t: c }); i++; continue; }
        throw new Error(`unexpected character "${c}"`);
    }
    return toks;
}
function parseExpr(src) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i], eat = (t) => { if (toks[i] && toks[i].t === t) { i++; return true; } return false; };
    const startsPrimary = (tk) => tk && (tk.t === 'num' || tk.t === 'id' || tk.t === '(');
    function primary() {
        const tk = toks[i++];
        if (!tk) throw new Error('expression ends too early');
        if (tk.t === 'num') {
            const [ip, fp = ''] = tk.v.split('.');
            return { t: 'num', v: new Rat(BigInt((ip || '0') + fp), pw(10n, fp.length)) };
        }
        if (tk.t === 'id') return { t: 'var', name: tk.v };
        if (tk.t === '(') { const e = expr(); if (!eat(')')) throw new Error('missing ")"'); return e; }
        throw new Error(`unexpected "${tk.t}"`);
    }
    function expo() {
        if (eat('-')) return { t: 'neg', a: expo() };
        if (eat('+')) return expo();
        const b = primary();
        return eat('^') ? { t: 'pow', a: b, e: expo() } : b;
    }
    function power() { const b = primary(); return eat('^') ? { t: 'pow', a: b, e: expo() } : b; }
    function unary() { if (eat('-')) return { t: 'neg', a: unary() }; if (eat('+')) return unary(); return power(); }
    function term() {
        let a = unary();
        for (;;) {
            if (eat('*')) a = { t: 'mul', a, b: unary() };
            else if (eat('/')) a = { t: 'div', a, b: unary() };
            else if (startsPrimary(peek())) a = { t: 'mul', a, b: power() };
            else return a;
        }
    }
    function expr() {
        let a = term();
        for (;;) {
            if (eat('+')) a = { t: 'add', a, b: term() };
            else if (eat('-')) a = { t: 'sub', a, b: term() };
            else return a;
        }
    }
    if (!toks.length) throw new Error('empty expression');
    const ast = expr();
    if (i < toks.length) throw new Error(`unexpected "${toks[i].t === 'num' || toks[i].t === 'id' ? toks[i].v : toks[i].t}"`);
    return ast;
}
function astVars(ast, set = new Set()) {
    if (ast.t === 'var') set.add(ast.name);
    for (const k of ['a', 'b', 'e']) if (ast[k]) astVars(ast[k], set);
    return set;
}
function constExponent(ast) {
    if (astVars(ast).size) throw new Error('exponents must be integers');
    const v = evalAst(ast, ratDomain);
    if (!v.isInt()) throw new Error('exponents must be integers');
    if (babs(v.n) > 100000n) throw new Error('exponent too large');
    return v.n;
}
function evalAst(ast, D) {
    switch (ast.t) {
        case 'num': return D.fromRat(ast.v);
        case 'var': return D.gen();
        case 'neg': return D.neg(evalAst(ast.a, D));
        case 'add': return D.add(evalAst(ast.a, D), evalAst(ast.b, D));
        case 'sub': return D.sub(evalAst(ast.a, D), evalAst(ast.b, D));
        case 'mul': return D.mul(evalAst(ast.a, D), evalAst(ast.b, D));
        case 'div': return D.div(evalAst(ast.a, D), evalAst(ast.b, D));
        case 'pow': return D.pow(evalAst(ast.a, D), constExponent(ast.e));
    }
    throw new Error('internal: bad expression');
}
const ratDomain = {
    fromRat: (r) => r, gen: () => { throw new Error('unexpected variable'); },
    neg: (a) => a.neg(), add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b), div: (a, b) => a.div(b),
    pow: (a, k) => { let r = R1, b = a, e = k; if (e < 0n) { b = R1.div(a); e = -e; } while (e > 0n) { if (e & 1n) r = r.mul(b); b = b.mul(b); e >>= 1n; } return r; },
};
const polyDomain = {
    fromRat: (r) => qpTrim([r]), gen: () => [R0, R1],
    neg: (a) => qpScale(a, new Rat(-1n)), add: qpAdd, sub: qpSub, mul: qpMul,
    div: (a, b) => { if (qpDeg(b) > 0) throw new Error('the field polynomial cannot contain division by x'); if (!b.length) throw new Error('division by zero'); return qpScale(a, R1.div(b[0])); },
    pow: (a, k) => { if (k < 0n) throw new Error('negative powers are not allowed in the polynomial'); let r = [R1]; for (let i = 0n; i < k; i++) r = qpMul(r, a); return r; },
};
function fieldDomain(K) {
    return {
        fromRat: (r) => K.fromRat(r), gen: () => K.gen(),
        neg: (a) => K.neg(a), add: (a, b) => K.add(a, b), sub: (a, b) => K.sub(a, b), mul: (a, b) => K.mul(a, b),
        div: (a, b) => K.mul(a, K.inv(b)), pow: (a, k) => K.pow(a, k),
    };
}

// ─────────────────────── formatting (TeX) ───────────────────────

const ratTex = (r) => (r.isInt() ? `${r.n}` : `\\tfrac{${r.n}}{${r.d}}`);
/** Polynomial in descending degree, e.g. x^{3} - 2. */
function polyTex(c, v = 'x') {
    c = c.map(ratOf);
    const parts = [];
    for (let i = c.length - 1; i >= 0; i--) {
        if (c[i].isZero()) continue;
        const a = c[i].abs(), neg = c[i].sign() < 0;
        const mono = i === 0 ? '' : i === 1 ? v : `${v}^{${i}}`;
        const coef = i === 0 ? ratTex(a) : (a.eq(R1) ? '' : ratTex(a));
        parts.push({ neg, s: coef + mono });
    }
    if (!parts.length) return '0';
    return parts.map((t, k) => (k === 0 ? (t.neg ? '-' : '') + t.s : (t.neg ? ' - ' : ' + ') + t.s)).join('');
}
/** Element of K given by coordinates in 1, a, a², … — ascending degree over a common denominator. */
function elemTex(v, name = 'a') {
    let den = 1n;
    for (const x of v) den = blcm(den, x.d);
    const nums = v.map((x) => x.n * (den / x.d));
    const parts = [];
    nums.forEach((c, i) => {
        if (!c) return;
        const a = babs(c), mono = i === 0 ? '' : i === 1 ? name : `${name}^{${i}}`;
        parts.push({ neg: c < 0n, s: i === 0 ? `${a}` : (a === 1n ? mono : `${a}${mono}`) });
    });
    if (!parts.length) return '0';
    const num = parts.map((t, k) => (k === 0 ? (t.neg ? '-' : '') + t.s : (t.neg ? ' - ' : ' + ') + t.s)).join('');
    if (den === 1n) return num;
    if (parts.length === 1) return (parts[0].neg ? '-' : '') + `\\frac{${parts[0].s}}{${den}}`;
    return `\\frac{${num}}{${den}}`;
}
/** Does this element need parentheses after a coefficient ring, as in ℤ·(1 + a)? */
const needsParens = (t) => !/^-?\\frac\{[^{}]*\}\{\d+\}$/.test(t) && /\s[+-]\s/.test(t);
function factorTex(n) {
    if (n === 0n) return '0';
    const { factors, complete } = factorInt(n, 2e5);
    if (!complete || babs(n) === 1n || (factors.length === 1 && factors[0][1] === 1)) return null;
    const s = factors.map(([p, e]) => (e === 1 ? `${p}` : `${p}^{${e}}`)).join(' \\cdot ');
    return (n < 0n ? '-' : '') + s;
}
const numTex = (n) => { const f = factorTex(n); return f ? `${n} = ${f}` : `${n}`; };

// ─────────────────────── fields and subfields ───────────────────────

/** Smallest c ≥ 1 with c·β integral, from β's monic minimal polynomial. */
function integralScale(mp) {
    const m = mp.length - 1;
    let den = 1n; for (const x of mp) den = blcm(den, x.d);
    if (den === 1n) return { c: 1n, primes: [] };
    const primes = primeDivisors(den);
    let c = 1n;
    for (const q of primes) {
        let a = 0;
        for (let j = 0; j < m; j++) { const v = vpInt(mp[j].d, q); if (v > 0) a = Math.max(a, Math.ceil(v / (m - j))); }
        c *= pw(q, a);
    }
    return { c, primes };
}

const nfCache = new Map();
function maximalOrderFor(g) {
    const key = g.join(',');
    if (!nfCache.has(key)) {
        const nf = new NumField(g);
        nfCache.set(key, { nf, ...maximalOrder(nf) });
        if (nfCache.size > 40) nfCache.delete(nfCache.keys().next().value);
    }
    return nfCache.get(key);
}

/**
 * The subfield L of K generated by gens (a-coordinates), with an integral primitive
 * element θ, its minimal polynomial g, the matrix P of θ^j in a-coordinates and O_L.
 */
function subfieldData(K, gens, preferGen) {
    const n = K.n;
    const ech = [];
    const addVec = (v) => {
        let w = v.slice();
        for (const e of ech) { const t = w[e.piv]; if (!t.isZero()) { const f = t.div(e.vec[e.piv]); w = w.map((x, i) => x.sub(f.mul(e.vec[i]))); } }
        const piv = w.findIndex((x) => !x.isZero());
        if (piv < 0) return false;
        ech.push({ vec: w, piv }); return true;
    };
    addVec(K.one());
    const queue = [K.one()];
    while (queue.length) { const v = queue.shift(); for (const g of gens) { const w = K.mul(v, g); if (addVec(w)) queue.push(w); } }
    const d = ech.length;
    const cands = [], source = [];
    if (preferGen && d === n) { cands.push(K.gen()); source.push(-1); }
    gens.forEach((g, i) => { cands.push(g); source.push(i); });
    for (let t = 2; t < 60 && gens.length > 1; t++) {
        let s = K.fromRat(R0), c = R1;
        for (const g of gens) { s = K.add(s, K.scale(g, c)); c = c.mul(new Rat(BigInt(t))); }
        cands.push(s); source.push(null);
    }
    if (d === 1) { cands.unshift(K.one()); source.unshift(null); }
    for (let ci = 0; ci < cands.length; ci++) {
        const th = cands[ci];
        const mp = K.minpoly(th);
        if (mp.length - 1 !== d) continue;
        const { c } = integralScale(mp);
        const theta = K.scale(th, new Rat(c));
        const g = mp.map((x, j) => x.mul(new Rat(pw(c, d - j)))).map((x) => x.n);
        const P = [K.one()];
        for (let j = 1; j < d; j++) P.push(K.mul(P[j - 1], theta));
        const mo = maximalOrderFor(g);
        return { d, theta, g, P, thetaGen: source[ci], thetaScale: c, ...mo };
    }
    throw new Error('internal: no primitive element found');
}

const fieldCache = new Map();
function defineField(fStr) {
    const key = fStr.replace(/\s+/g, '');
    if (fieldCache.has(key)) return fieldCache.get(key);
    const ast = parseExpr(fStr);
    const vars = astVars(ast);
    if (vars.size > 1) throw new Error(`use a single variable in f (found ${[...vars].join(', ')})`);
    const fq = evalAst(ast, polyDomain);
    if (qpDeg(fq) < 1) throw new Error('f must have degree at least 1');
    if (qpDeg(fq) > 24) throw new Error('degree above 24 is not supported');
    let den = 1n; for (const x of fq) den = blcm(den, x.d);
    const F = zPrimitive(fq.map((x) => x.n * (den / x.d)));
    const Fq = F.map((x) => new Rat(x));
    if (qpDeg(qpXgcd(Fq, qpDeriv(Fq))[0]) > 0) throw new Error(`f = ${plainPoly(F)} has a repeated factor, so it is not irreducible`);
    const facs = zFactorSquarefree(F);
    if (facs.length > 1) {
        throw new Error(`f is reducible over Q: f = ${F[F.length - 1] < 0n ? '-' : ''}${facs.map((h) => `(${plainPoly(h)})`).join('')}`);
    }
    const K = new PolyAlg(Fq);
    const sub = subfieldData(K, [K.gen()], true);
    const r1 = realRootCount(Fq);
    const field = { key, F, K, n: K.n, sub, r1, r2: (K.n - r1) / 2 };
    fieldCache.set(key, field);
    if (fieldCache.size > 20) fieldCache.delete(fieldCache.keys().next().value);
    return field;
}
function plainPoly(F) { return polyTex(F).replace(/\^\{(\d+)\}/g, '^$1').replace(/\\tfrac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2'); }

// ─────────────────────── the ring ───────────────────────

function toSV(c) { // Rat coords → { v: BigInt[], den }
    let den = 1n; for (const x of c) den = blcm(den, x.d);
    return { v: c.map((x) => x.n * (den / x.d)), den };
}

function analyzeRing(sub, betaA) {
    const O = sub.O, n = O.n;
    const toL = (v) => { const x = ratSolveRows(sub.P, v); if (!x) throw new Error('internal: element outside its field'); return x; };
    const betas = betaA.map((v) => toSV(O.toCoords(toL(v))));
    const info = betaA.map((v, i) => {
        const mp = sub.K.minpoly(v);
        const { c, primes } = integralScale(mp);
        return { mp, c, primes, sv: betas[i] };
    });
    const intGens = info.map(({ c, sv }) => sv.v.map((x) => { const y = x * c; if (y % sv.den) throw new Error('internal: scaling failed'); return y / sv.den; }));
    const Lambda = closureInt(O, intGens);
    const m = hnfIndex(Lambda);
    const D = [...new Set(info.flatMap((x) => x.primes).map(String))].map(BigInt).sort((a, b) => (a < b ? -1 : 1));
    if (!D.length) return { O, info, D, R0: Lambda, index: m, Lambda, local: [] };

    let mPrime = m; for (const p of D) while (mPrime % p === 0n) mPrime /= p;
    const lattices = [];
    if (mPrime > 1n) lattices.push({ H: hnf(Lambda.concat(identityHNF(n).map((r) => r.map((x) => x * mPrime))), n, mPrime), idx: mPrime });
    const local = [];
    for (const p of D) {
        const primes = primesAbove(O, p);
        const vals = betas.map((b) => primes.map((pr) => valuationSV(O, pr, b)));
        primes.forEach((pr, j) => {
            pr.pole = Math.max(0, ...vals.map((row) => -row[j]));
            pr.inS = pr.pole > 0;
        });
        const S = primes.filter((pr) => pr.inS), T = primes.filter((pr) => !pr.inS);
        let idx = 1n;
        if (T.length) {
            const Lp = localOrder(O, p, S, T, betas);
            idx = hnfIndex(Lp);
            if (idx > 1n) lattices.push({ H: Lp, idx });
        }
        local.push({ p, primes, vals, saturated: !T.length, localIndex: idx });
    }
    const total = lattices.reduce((a, l) => a * l.idx, 1n);
    let R0 = identityHNF(n);
    if (total > 1n) {
        const gens = [];
        for (const l of lattices) { const mult = total / l.idx; for (const r of l.H) gens.push(r.map((x) => x * mult)); }
        R0 = hnf(gens, n, total);
    }
    return { O, info, D, R0, index: total, Lambda, local };
}

/** Look for s ∈ R_0 whose prime divisors are exactly S (then R = R_0[1/s]). */
function findSUnit(ring, betaL, nfMul) {
    const { O, R0, local, D } = ring;
    const n = O.n;
    const nonsat = local.filter((l) => !l.saturated);
    let satProd = 1n; for (const l of local) if (l.saturated) satProd *= l.p;
    if (!nonsat.length) return { s: unitVec(n, 0).map((_, i) => O.one[i] * satProd), isInteger: true, value: satProd };
    const Sp = nonsat.flatMap((l) => l.primes.filter((pr) => pr.inS));
    const Tp = nonsat.flatMap((l) => l.primes.filter((pr) => !pr.inS));
    const check = (x) => {
        if (x.every((c) => c === 0n) || !hnfContains(R0, x)) return null;
        let N = babs(O.norm(x));
        for (const p of D) while (N % p === 0n) N /= p;
        if (N !== 1n) return null;
        if (Tp.some((q) => valuationInt(O, q, x) !== 0)) return null;
        return Sp.map((pr) => valuationInt(O, pr, x) > 0);
    };
    const pool = [];
    for (const b of betaL) { try { const inv = O.toCoords(nfMul.inv(b)); if (inv.every((x) => x.isInt())) pool.push(inv.map((x) => x.n)); } catch (e) { /* zero */ } }
    // small vectors of R_0 ∩ ∏_{𝔭 ∈ S} 𝔭^t
    let Mmod = 1n; for (const l of nonsat) Mmod *= l.p;
    for (let t = 1; t <= 2 && pool.length < 400; t++) {
        let J = R0;
        for (const pr of Sp) {
            let P = identityHNF(n); const M = pw(pr.p, t * 1);
            for (let i = 0; i < t; i++) P = idealMul(O, P, pr.H, M);
            J = intersectLattices(J, P, n);
        }
        const red = lllReduce(J);
        const k = Math.min(n, n <= 4 ? 4 : 6), range = n <= 4 ? 2 : 1;
        const coeffs = new Array(k).fill(-range);
        for (;;) {
            if (coeffs.some((c) => c)) { const x = new Array(n).fill(0n); coeffs.forEach((c, i) => { if (c) for (let j = 0; j < n; j++) x[j] += BigInt(c) * red[i][j]; }); pool.push(x); }
            let i = 0; while (i < k && coeffs[i] === range) { coeffs[i] = -range; i++; }
            if (i === k) break; coeffs[i]++;
        }
    }
    const covered = new Array(Sp.length).fill(false);
    let s = O.one.slice();
    const seen = new Set();
    for (const x of pool) {
        const key = x.join(','); if (seen.has(key)) continue; seen.add(key);
        const cov = check(x);
        if (!cov || !cov.some((c, i) => c && !covered[i])) continue;
        s = O.mul(s, x);
        cov.forEach((c, i) => { if (c) covered[i] = true; });
        if (covered.every(Boolean)) return { s: s.map((v) => v * satProd), isInteger: false };
    }
    return null;
}
function intersectLattices(A, B, n) { // A ∩ B for full-rank lattices in Z^n: dual of (dual A + dual B)
    const dualRows = (M) => { const I = ratInverse(M); return I.map((_, i) => I.map((row) => row[i])); };
    const DA = dualRows(A.map((r) => r.map((x) => new Rat(x)))), DB = dualRows(B.map((r) => r.map((x) => new Rat(x))));
    const L = ratLattice(dualRows(ratLatticeRows(ratLattice(DA.concat(DB), n))), n);
    if (L.den !== 1n) throw new Error('internal: intersection not integral');
    return L.H;
}
function lllReduce(H) { // floating-point LLL on the coordinate vectors, for candidate search only
    const b = H.map((r) => r.slice());
    const k = b.length, f = (v) => v.map(Number);
    const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
    let bf = b.map(f);
    const gs = () => { const bs = [], mu = Array.from({ length: k }, () => new Array(k).fill(0)); for (let i = 0; i < k; i++) { let v = bf[i].slice(); for (let j = 0; j < i; j++) { mu[i][j] = dot(bf[i], bs[j]) / dot(bs[j], bs[j]); v = v.map((x, t) => x - mu[i][j] * bs[j][t]); } bs.push(v); } return { bs, mu }; };
    let i = 1, guard = 0;
    while (i < k && guard++ < 2000) {
        let { bs, mu } = gs();
        for (let j = i - 1; j >= 0; j--) {
            const q = Math.round(mu[i][j]);
            if (q) { b[i] = b[i].map((x, t) => x - BigInt(q) * b[j][t]); bf = b.map(f); ({ bs, mu } = gs()); }
        }
        if (dot(bs[i], bs[i]) >= (0.75 - mu[i][i - 1] ** 2) * dot(bs[i - 1], bs[i - 1])) i++;
        else { [b[i], b[i - 1]] = [b[i - 1], b[i]]; bf = b.map(f); i = Math.max(i - 1, 1); }
    }
    return b;
}

// ── two-element presentations of primes ──
function twoElement(sub, pr, toATex) {
    const O = sub.O, n = O.n, p = pr.p;
    if (n === 1) return `${p}`;
    if (pr.f === n) return `(${p})`;
    const test = (x) => {
        const gens = identityHNF(n).map((r) => r.map((v) => v * p));
        for (let i = 0; i < n; i++) gens.push(O.mulMod(x, unitVec(n, i), p));
        return hnfEq(hnf(gens, n, p), pr.H);
    };
    const cands = [];
    // c + ω for ω in the triangular display basis: gives (2, 1 + i), (5, 2 + a), …
    try {
        const nK = sub.P[0].length;
        const nice = basisA(sub, identityHNF(n), nK).map((v) => sub.O.toCoords(ratSolveRows(sub.P, v)));
        const ints = nice.filter((c) => c.every((x) => x.isInt())).map((c) => c.map((x) => x.n));
        const half = p / 2n > 6n ? 6n : p / 2n;
        for (const w of ints.slice(1)) for (let c = 0n; c <= half; c++) for (const sgn of c ? [1n, -1n] : [1n]) cands.push(w.map((x, i) => x + sgn * c * O.one[i]));
    } catch (e) { /* fall through */ }
    // Kummer–Dedekind candidates h(θ)
    try {
        const gp = fpNorm(sub.g, p), dg = fpDeriv(gp, p);
        const rad = dg.length ? fpDivmod(gp, fpGcd(gp, dg, p), p)[0] : null;
        const facs = rad && fpGcd(rad, fpDeriv(rad, p), p).length === 1 && rad.length > 1 ? fpFactorSquarefree(rad, p, makeRng(5)) : [];
        {
            for (const h of facs) {
                const hs = symmetric(h, p).map((x) => new Rat(x));
                const thetaPoly = Array.from({ length: n }, (_, j) => hs[j] || R0);
                const c = O.toCoords(thetaPoly);
                if (c.every((x) => x.isInt())) cands.push(c.map((x) => x.n));
            }
        }
    } catch (e) { /* fall through to search */ }
    for (const r of pr.H) cands.push(symmetric(r, p));
    for (let i = 0; i < pr.H.length; i++) for (let j = i + 1; j < pr.H.length; j++) {
        cands.push(symmetric(pr.H[i].map((x, t) => x + pr.H[j][t]), p));
        cands.push(symmetric(pr.H[i].map((x, t) => x - pr.H[j][t]), p));
    }
    const rng = makeRng(99);
    for (let t = 0; t < 300; t++) {
        const x = new Array(n).fill(0n);
        for (const r of pr.H) { const c = BigInt(rng.int(3) - 1); for (let j = 0; j < n; j++) x[j] += c * r[j]; }
        cands.push(symmetric(x, p));
    }
    let best = null;
    for (let i = 0; i < cands.length; i++) {
        if (best && i > 160) break;
        const x = cands[i];
        if (x.every((v) => v === 0n) || !test(x)) continue;
        const tex = toATex(x);
        const score = tex.length + (tex.match(/\d+/g) || []).reduce((acc, t) => acc + Number(t), 0); // short, small coefficients
        if (!best || score < best.score) best = { tex, score };
    }
    return best ? `(${p},\\ ${best.tex})` : `\\text{prime of norm } ${p}^{${pr.f}}`;
}

// ─────────────────────── top level ───────────────────────

const toA = (sub, c) => ratVecMat(sub.O.fromCoords(c), sub.P); // O-coords → K-coords
function basisA(sub, H, n) { // canonical triangular basis in K-coordinates (ascending)
    const rows = H.map((r) => toA(sub, r).slice().reverse());
    return ratLatticeRows(ratLattice(rows, n)).map((r) => r.reverse()).reverse();
}

function compute(fStr, elemStrs) {
    const field = defineField(fStr);
    const { K, n, sub: kSub } = field;
    const aName = 'a';
    const fieldOut = {
        n, r1: field.r1, r2: field.r2,
        polyTex: polyTex(field.F),
        discTex: numTex(kSub.disc),
        integralBasis: basisA(kSub, identityHNF(n), n).map((v) => elemTex(v, aName)),
        aIntegral: field.F[n] === 1n || field.F[n] === -1n,
        certified: kSub.certified,
    };
    fieldOut.zA = fieldOut.aIntegral && kSub.index === 1n && kSub.theta.every((x, i) => x.eq(K.gen()[i]));
    fieldOut.isQ = n === 1;

    // elements
    const elements = [], values = [], valueRow = [];
    let elemError = false;
    for (const s of elemStrs) {
        if (!s.trim()) { elements.push({ empty: true }); continue; }
        try {
            const ast = parseExpr(s);
            const vars = astVars(ast);
            if (vars.size > 1) throw new Error(`use a single letter for the root (found ${[...vars].join(', ')})`);
            const v = evalAst(ast, fieldDomain(K));
            values.push(v); valueRow.push(elements.length);
            const mp = K.minpoly(v);
            const { c, primes } = integralScale(mp);
            elements.push({ tex: elemTex(v, aName), minpolyTex: polyTex(mp), integral: c === 1n, poles: primes.map(String) });
        } catch (e) {
            elemError = true;
            elements.push({ error: e.message });
        }
    }
    const out = { ok: true, field: fieldOut, elements };
    if (elemError) return out;
    out.ring = describeRing(K, values, { genTex: elements.filter((e) => e.tex).map((e) => e.tex), valueRow }).R;
    return out;
}

/**
 * Describe R = Z[values] for values in K (a PolyAlg). opts.format turns K-coordinates into TeX
 * (default: polynomial in a); opts.subName names a proper subfield (default L).
 */
function describeRing(K, values, opts = {}) {
    const n = K.n;
    const fmt = opts.format || ((v) => elemTex(v, 'a'));
    const genTex = opts.genTex || values.map(fmt);
    const valueRow = opts.valueRow || values.map((_, i) => i);
    const L = opts.subName || 'L';
    const sub = subfieldData(K, values, true);
    const d = sub.d;
    sub.K = K;
    const ring = analyzeRing(sub, values);
    const toATex = (x) => fmt(toA(sub, x));
    const full = opts.fullName || 'K';
    const Oname = d === 1 ? '\\mathbb{Z}' : `\\mathcal{O}_${d === n ? full : L}`;
    const Fname = d === 1 ? '\\mathbb{Q}' : d === n ? full : L;
    const R = {
        nameTex: genTex.length ? `R = \\mathbb{Z}\\left[${genTex.join(',\\ ')}\\right]` : 'R = \\mathbb{Z}',
        d, Oname, Fname,
        integral: !ring.D.length,
        index: `${ring.index}`,
        indexTex: numTex(ring.index),
        certified: sub.certified,
    };
    const basis = basisA(sub, ring.R0, n).map(fmt);
    const zsum = basis.map((t) => (t === '1' ? '\\mathbb{Z}' : `\\mathbb{Z}\\,${needsParens(t) ? `(${t})` : t}`)).join(' \\oplus ');
    R.basisTex = basis;
    R.zsumTex = zsum;
    if (d < n) {
        const gi = sub.thetaGen !== null && sub.thetaGen >= 0 ? valueRow[sub.thetaGen] : null;
        R.subfield = { d, thetaTex: fmt(sub.theta), minpolyTex: polyTex(sub.g), genIndex: gi, scale: `${sub.thetaScale}` };
    }
    R.OLbasis = d > 1 && d < n ? basisA(sub, identityHNF(d), n).map(fmt) : null;
    R.OLdiscTex = d > 1 && d < n ? numTex(sub.disc) : null;
    if (R.integral) {
        R.discTex = numTex(sub.disc * ring.index * ring.index);
        if (ring.index === 1n) { R.kind = 'maximal'; R.headTex = `R = ${Oname}`; }
        else { R.kind = 'order'; R.headTex = `R = ${zsum}`; }
        R.badPrimes = knownPrimeDivisors(ring.index);
    } else {
        const sunit = findSUnit(ring, values.map((v) => toL(sub, v)), sub.nf.alg);
        const r0Tex = ring.index === 1n ? Oname : `\\left(${zsum}\\right)`;
        if (sunit) {
            if (!sunit.isInteger) { // present s with a positive constant term
                const sa = toA(sub, sunit.s), lead = sa.find((x) => !x.isZero());
                if (lead && lead.sign() < 0) sunit.s = sunit.s.map((x) => -x);
            }
            const sTex = sunit.isInteger ? `${sunit.value}` : toATex(sunit.s);
            R.sTex = sTex;
            R.headTex = `R = ${r0Tex}\\left[\\frac{1}{${sTex}}\\right]`;
        } else R.headTex = ring.index === 1n ? `R = \\mathcal{O}_{${Fname},S}` : `R = \\left(${zsum}\\right)\\left[${genTex.join(',\\ ')}\\right]`;
        R.kind = ring.index === 1n ? 'S-integers' : 'S-order';
        R.badPrimes = knownPrimeDivisors(ring.index);
        R.local = ring.local.map((l) => ({
            p: `${l.p}`,
            saturated: l.saturated,
            primes: l.primes.map((pr) => ({ tex: twoElement(sub, pr, toATex), e: pr.e, f: pr.f, inS: pr.inS, pole: pr.pole })),
        }));
        R.inverted = ring.local.filter((l) => l.saturated).map((l) => `${l.p}`);
        R.allSaturated = ring.local.every((l) => l.saturated);
    }
    return { R, sub, ring };
}
function toL(sub, v) { return ratSolveRows(sub.P, v); }

const api = {
    compute, defineField, parseExpr, describeRing,
    // building blocks shared with other tools (zariskiClosure) and tests
    _internal: {
        Rat, R0, R1, ratOf, factorInt, primeDivisors, isProbablePrime, zFactorSquarefree, zPrimitive, subfieldData, analyzeRing,
        maximalOrderFor, primesAbove, valuationInt, valuationSV, toSV, hnf, hnfIndex, hnfContains, hnfEq, idealMul, closureInt,
        identityHNF, unitVec, PolyAlg, NumField, Order, ratVecMat, ratInverse, ratSolveRows, ratLattice, ratLatticeRows,
        evalAst, fieldDomain, elemTex, polyTex, numTex, factorTex, ratTex, integralScale, realRootCount, rrefModP, leftKernelModP,
        qpTrim, qpDeg, qpAdd, qpSub, qpMul, qpScale, qpDivmod, qpMonic, qpXgcd, qpDeriv, twoElement, toA,
        bgcd, blcm, bmod, modInv, modPow, vpInt, floorDiv, pw, babs, makeRng, fpRoots, fpNorm, symmetric,
    },
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NumberRingEngine = api;
})(typeof self !== 'undefined' ? self : this);
