/**
 * quatOrders.js — exact arithmetic for a quaternion algebra over a number field k and its orders, for the
 * exact step of the Presentation Calculator (quaternionIndex.js).
 *
 *   KField     k = ℚ(θ) = ℚ[t]/(g): elements { v: BigInt[n], d } on the power basis of θ. O_k comes from the
 *              ring engine (Round 2). Traces, norms, inverses, real embeddings; the units (a basis of U/U²,
 *              by 2-saturation), generators of principal ideals with a proven search bound, and the check
 *              that k has class number one (Minkowski's bound).
 *   QAlgebra   A = (α, β)_k with α, β ∈ ℤ[θ], on the ℚ-basis θ^a·e_c (e = 1, I, J, K = IJ): flat vectors
 *              { v: BigInt[4n], d }. The form Tr_{k/ℚ}∘nrd is positive definite when A is totally definite.
 *   lattices   full-rank ℤ-lattices in ℚ^D by their Hermite normal forms: equal lattices are equal objects.
 *              Sums, duals, intersections, coordinates.
 *   orders     the ring a lattice generates; maximal orders by index-q steps inside the dual lattice (none
 *              left ⟺ maximal at q); LLL and Fincke–Pohst for a Gram matrix.
 *
 * Everything that decides anything is BigInt-exact; floating point only steers searches (LLL, embeddings),
 * and every element they produce is checked exactly.
 */
import * as NRmod from '../../Algebraic/Tools/numberRings/ringEngine.js';

const engine = () => {
    const m = NRmod && NRmod.default && NRmod.default._internal ? NRmod.default : globalThis.NumberRingEngine || (globalThis.self && globalThis.self.NumberRingEngine);
    if (!m || !m._internal) throw new Error('the number ring engine is not loaded');
    return m._internal;
};

// ───────────────────────── integers and rationals ─────────────────────────

export const babs = (x) => (x < 0n ? -x : x);
export const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
export const blcm = (a, b) => (a === 0n || b === 0n ? 0n : babs((a / bgcd(a, b)) * b));
export const floorDiv = (a, b) => { const q = a / b; return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q; };
export const vp = (x, p) => { if (x === 0n) return Infinity; let v = 0; x = babs(x); while (x % p === 0n) { x /= p; v++; } return v; };
export const modn = (x, m) => ((x % m) + m) % m;
/** a rational [n, d], d > 0, in lowest terms */
export const Q = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return [n / g, d / g]; };
export const qadd = (a, b) => Q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const qsub = (a, b) => Q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
export const qmul = (a, b) => Q(a[0] * b[0], a[1] * b[1]);
export const qdiv = (a, b) => Q(a[0] * b[1], a[1] * b[0]);
const qnum = (a) => Number(a[0]) / Number(a[1]);
/** the prime factors of a nonzero BigInt, ascending (the ring engine's factorization) */
export const primesOf = (n) => (babs(n) <= 1n ? [] : engine().factorInt(babs(n)).factors.map(([p]) => BigInt(p)).sort((a, b) => (a < b ? -1 : 1)));
const isPrimeSmall = (p) => { if (p < 2) return false; for (let d = 2; d * d <= p; d++) if (p % d === 0) return false; return true; };

/** det of a square integer matrix (Bareiss). */
export function detBig(M) {
    const n = M.length;
    if (!n) return 1n;
    const A = M.map((r) => r.slice());
    let prev = 1n, sign = 1n;
    for (let k = 0; k < n - 1; k++) {
        if (A[k][k] === 0n) {
            let p = k + 1; while (p < n && A[p][k] === 0n) p++;
            if (p === n) return 0n;
            [A[k], A[p]] = [A[p], A[k]]; sign = -sign;
        }
        for (let i = k + 1; i < n; i++) {
            for (let j = k + 1; j < n; j++) A[i][j] = (A[i][j] * A[k][k] - A[i][k] * A[k][j]) / prev;
            A[i][k] = 0n;
        }
        prev = A[k][k];
    }
    return sign * A[n - 1][n - 1];
}

/** x with M x = b over ℚ (M: rows of rationals [n, d], square, invertible), or null. */
export function solveRat(M, b) {
    const n = M.length;
    const A = M.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
        let p = c; while (p < n && A[p][c][0] === 0n) p++;
        if (p === n) return null;
        [A[c], A[p]] = [A[p], A[c]];
        const piv = A[c][c];
        for (let j = c; j <= n; j++) A[c][j] = qdiv(A[c][j], piv);
        for (let i = 0; i < n; i++) if (i !== c && A[i][c][0] !== 0n) {
            const f = A[i][c];
            for (let j = c; j <= n; j++) A[i][j] = qsub(A[i][j], qmul(f, A[c][j]));
        }
    }
    return A.map((r) => r[n]);
}

// ───────────────────────── k = ℚ(θ) ─────────────────────────

/** Complex roots of a monic real polynomial (Durand–Kerner, then Newton). c: Numbers, low → high. */
export function polyRoots(c) {
    const n = c.length - 1;
    const ev = (z) => { let re = 1, im = 0; for (let k = n - 1; k >= 0; k--) { const r = re * z.re - im * z.im + c[k], i = re * z.im + im * z.re; re = r; im = i; } return { re, im }; };
    const R = 1 + Math.max(...c.slice(0, n).map(Math.abs));
    let z = Array.from({ length: n }, (_, k) => ({ re: R * 0.9 * Math.cos(2 * Math.PI * k / n + 0.4), im: R * 0.9 * Math.sin(2 * Math.PI * k / n + 0.4) }));
    for (let it = 0; it < 2000; it++) {
        let move = 0;
        z = z.map((zi, i) => {
            let num = ev(zi), den = { re: 1, im: 0 };
            z.forEach((zj, j) => { if (j !== i) { const dr = zi.re - zj.re, di = zi.im - zj.im; den = { re: den.re * dr - den.im * di, im: den.re * di + den.im * dr }; } });
            const m = den.re * den.re + den.im * den.im || 1e-300;
            const q = { re: (num.re * den.re + num.im * den.im) / m, im: (num.im * den.re - num.re * den.im) / m };
            move = Math.max(move, Math.hypot(q.re, q.im));
            return { re: zi.re - q.re, im: zi.im - q.im };
        });
        if (move < 1e-14 * R) break;
    }
    return z;
}

export class KField {
    /** g: BigInt[], monic, integral, irreducible (low → high). */
    constructor(g) {
        this.g = g.map(BigInt);
        const n = this.n = this.g.length - 1;
        if (this.g[n] !== 1n) throw new Error('internal: the minimal polynomial of θ is not monic');
        // Tr(θ^k), k ≤ 2n − 2 (Newton's identities)
        const tr = [BigInt(n)];
        for (let k = 1; k <= 2 * n; k++) {
            let s = 0n;
            if (k <= n) { for (let i = 1; i < k; i++) s += this.g[n - i] * tr[k - i]; s += BigInt(k) * this.g[n - k]; }
            else for (let i = 1; i <= n; i++) s += this.g[n - i] * tr[k - i];
            tr.push(-s);
        }
        this.trPow = tr;
        // the places at ∞: real roots (sorted), and one root of each complex-conjugate pair (im > 0)
        const roots = polyRoots(this.g.map(Number)), isReal = (r) => Math.abs(r.im) < 1e-7 * (1 + Math.abs(r.re));
        this.roots = roots.filter(isReal).map((r) => r.re).sort((a, b) => a - b);
        this.croots = roots.filter((r) => !isReal(r) && r.im > 0).sort((a, b) => a.re - b.re || a.im - b.im);
        this.r1 = this.roots.length; this.r2 = this.croots.length;
        if (this.r1 + 2 * this.r2 !== n) throw new Error('internal: the roots of the minimal polynomial were not separated');
        this.real = this.r2 === 0;
        // O_k (ring engine): basis rows on θ^j, as elements
        if (n === 1) { this.okBasis = [this.one]; this.disc = 1n; }
        else {
            const X = engine(), mo = X.maximalOrderFor(this.g);
            this.mo = mo;
            this.disc = mo.disc;
            this.okBasis = mo.O.B.map((row) => this.fromRats(row.map((x) => [x.n, x.d])));
        }
        this.okMat = this.okBasis.map((b) => this.ratVec(b));               // rows: O_k basis on θ^j
    }
    get zero() { return { v: new Array(this.n).fill(0n), d: 1n }; }
    get one() { const v = new Array(this.n).fill(0n); v[0] = 1n; return { v, d: 1n }; }
    norm1(v, d) { let g = d; for (const x of v) g = bgcd(g, x); if (d < 0n) g = -g; return g === 1n ? { v, d } : { v: v.map((x) => x / g), d: d / g }; }
    fromInt(a) { const v = new Array(this.n).fill(0n); v[0] = BigInt(a); return { v, d: 1n }; }
    fromRats(qs) { const D = qs.reduce((l, q) => blcm(l, q[1]), 1n); return this.norm1(qs.map((q) => q[0] * (D / q[1])), D); }
    ratVec(x) { return x.v.map((c) => Q(c, x.d)); }
    isZero(x) { return x.v.every((c) => c === 0n); }
    eq(x, y) { return x.d === y.d && x.v.every((c, i) => c === y.v[i]); }
    add(x, y) { return this.norm1(x.v.map((c, i) => c * y.d + y.v[i] * x.d), x.d * y.d); }
    sub(x, y) { return this.norm1(x.v.map((c, i) => c * y.d - y.v[i] * x.d), x.d * y.d); }
    neg(x) { return { v: x.v.map((c) => -c), d: x.d }; }
    scale(x, k) { return this.norm1(x.v.map((c) => c * BigInt(k)), x.d); }
    divInt(x, k) { return this.norm1(x.v, x.d * BigInt(k)); }
    /** polynomial product mod g, integer coefficients */
    mulRaw(a, b) {
        const n = this.n, g = this.g, r = new Array(2 * n - 1).fill(0n);
        for (let i = 0; i < n; i++) { if (!a[i]) continue; for (let j = 0; j < n; j++) if (b[j]) r[i + j] += a[i] * b[j]; }
        for (let k = 2 * n - 2; k >= n; k--) { const c = r[k]; if (!c) continue; for (let j = 0; j < n; j++) r[k - n + j] -= c * g[j]; r[k] = 0n; }
        return r.slice(0, n);
    }
    mul(x, y) { return this.norm1(this.mulRaw(x.v, y.v), x.d * y.d); }
    /** the matrix of multiplication by x on θ^j (columns), integer, with denominator x.d */
    mulMatrix(x) { const cols = []; let t = this.one.v; for (let j = 0; j < this.n; j++) { cols.push(this.mulRaw(x.v, t)); t = this.mulRaw(t, [0n, 1n, ...new Array(Math.max(0, this.n - 2)).fill(0n)].slice(0, this.n)); } return this.n === 1 ? [[x.v[0]]] : Array.from({ length: this.n }, (_, r) => cols.map((c) => c[r])); }
    inv(x) {
        if (this.isZero(x)) throw new Error('division by zero in k');
        if (this.n === 1) return this.norm1([x.d], x.v[0]);
        const M = this.mulMatrix(x).map((r) => r.map((c) => Q(c, x.d)));
        const e = new Array(this.n).fill(null).map((_, i) => Q(i === 0 ? 1n : 0n));
        return this.fromRats(solveRat(M, e));
    }
    div(x, y) { return this.mul(x, this.inv(y)); }
    trace(x) { let s = 0n; x.v.forEach((c, j) => { s += c * this.trPow[j]; }); return Q(s, x.d); }
    norm(x) { return Q(detBig(this.mulMatrix(x)), x.d ** BigInt(this.n)); }
    /** the real embeddings */
    sigma(x) { return this.roots.map((r) => { let s = 0, p = 1; for (const c of x.v) { s += Number(c) * p; p *= r; } return s / Number(x.d); }); }
    /** the complex embeddings, one per conjugate pair, as { re, im } */
    sigmaC(x) {
        return this.croots.map((r) => {
            let re = 0, im = 0, pr = 1, pi = 0;
            for (const c of x.v) { const cn = Number(c); re += cn * pr; im += cn * pi; [pr, pi] = [pr * r.re - pi * r.im, pr * r.im + pi * r.re]; }
            return { re: re / Number(x.d), im: im / Number(x.d) };
        });
    }
    /** log |σ| at each place at ∞ (real places, then complex) */
    logs(x) { return this.sigma(x).map((s) => Math.log(Math.abs(s))).concat(this.sigmaC(x).map((z) => Math.log(Math.hypot(z.re, z.im)))); }
    /** positive at the real places listed (all of them by default) */
    totallyPositive(x, places = null) { if (this.isZero(x)) return false; const s = this.sigma(x); return (places || s.map((_, i) => i)).every((i) => s[i] > 0); }
    /** T2(x) = Σ |σ(x)|² over all embeddings: the Gram matrix of the elements E (floats; exact over a totally real field) */
    t2GramOf(E) {
        if (this.real) return E.map((a) => E.map((b) => qnum(this.trace(this.mul(a, b)))));
        const R = E.map((a) => this.sigma(a)), C = E.map((a) => this.sigmaC(a));
        return E.map((_, i) => E.map((__, j) => R[i].reduce((s, x, t) => s + x * R[j][t], 0) + 2 * C[i].reduce((s, z, t) => s + z.re * C[j][t].re + z.im * C[j][t].im, 0)));
    }
    /** coordinates on the O_k basis (rationals) */
    okCoords(x) {
        if (this.n === 1) return [Q(x.v[0], x.d)];
        const M = this.okMat[0].map((_, j) => this.okMat.map((row) => row[j]));   // columns = basis
        return solveRat(M, this.ratVec(x));
    }
    inOk(x) { return this.n === 1 ? x.d === 1n : this.okCoords(x).every((c) => c[1] === 1n); }
    fromOk(c) { let s = this.zero; c.forEach((ci, i) => { if (ci) s = this.add(s, this.scale(this.okBasis[i], ci)); }); return s; }

    /** a prime of k from the ring engine's HNF rows (O_k coordinates): the ideal as a lattice in ℚ^n (θ-coords) */
    primeLattice(p, H) {
        const P = BigInt(p);
        const gens = this.okBasis.map((b) => this.scale(b, P));
        if (H) for (const r of H) gens.push(this.fromOk(r.map(BigInt)));
        return lattice(gens.map((x) => ({ v: x.v, d: x.d })));
    }
    /** the primes above p (ring engine), each { p, e, f, L (lattice), pr } */
    primesAbove(p) {
        const P = BigInt(p);
        if (this.n === 1) return [{ p: P, e: 1, f: 1, L: lattice([{ v: [P], d: 1n }]), H: [[P]] }];
        const X = engine();
        return X.primesAbove(this.mo.O, P).map((pr) => ({ p: P, e: pr.e, f: pr.f, pr, H: pr.H, L: this.primeLattice(P, pr.H) }));
    }
    /** v_𝔭(x) for x ∈ k^× (𝔭 from primesAbove) */
    valuation(x, P) {
        if (this.n === 1) return vp(x.v[0], P.p) - vp(x.d, P.p);
        const X = engine();
        const c = this.okCoords(x);
        return X.valuationSV(this.mo.O, P.pr, X.toSV(c.map((q) => new X.Rat(q[0], q[1]))));
    }
    /** N(𝔞) for an integral ideal lattice (θ-coords) */
    idealNorm(L) {
        const okL = lattice(this.okBasis.map((x) => ({ v: x.v, d: x.d })));
        return qdiv(latDet(L), latDet(okL));
    }
    /** the ideal generated by elements (O_k-span), as a lattice in ℚ^n */
    idealOf(elems) {
        const gens = [];
        for (const x of elems) if (!this.isZero(x)) for (const w of this.okBasis) gens.push(this.mul(x, w));
        return lattice(gens);
    }
    idealMul(A, B) { const gens = []; for (const a of elemsOf(A)) for (const b of elemsOf(B)) gens.push(this.mul(a, b)); return lattice(gens); }

    /**
     * Units: n − 1 independent units by a T2 search, 2-saturated (no product of them, nor −1 times one, is a
     * square), so that ±∏ εᵢ^{aᵢ} (aᵢ ∈ {0, 1}) represent U/U². Also ρ, a bound for the sup-norm covering
     * radius of their log lattice. Returns { units, classes, rho }.
     */
    unitData() {
        if (this._units) return this._units;
        const n = this.n;
        if (n === 1) return (this._units = { units: [], classes: [this.one, this.neg(this.one)], rho: 0 });
        const rank = this.r1 + this.r2 - 1;
        const G = this.t2GramOf(this.okBasis);
        const found = [];
        const logs = (x) => this.logs(x);
        const indep = (vecs) => {
            // rank of the log vectors (Gram–Schmidt)
            const B = [];
            for (const v of vecs) {
                let w = v.slice();
                for (const b of B) { const t = w.reduce((s, x, i) => s + x * b[i], 0) / b.reduce((s, x) => s + x * x, 0); w = w.map((x, i) => x - t * b[i]); }
                if (Math.hypot(...w) > 1e-6) B.push(w); else return false;
            }
            return true;
        };
        for (let bound = 2 * n + 1; found.length < rank; bound *= 2) {
            if (bound > 1e7) throw new Error('could not find the units of k');
            const vecs = shortVectors(G, bound, { max: 2e6 });
            for (const c of vecs) {
                const x = this.fromOk(c.map(BigInt));
                const N = this.norm(x);
                if (N[1] !== 1n || babs(N[0]) !== 1n) continue;
                if (found.some((u) => this.eq(u, x) || this.eq(u, this.neg(x)))) continue;
                if (indep(found.map(logs).concat([logs(x)]))) found.push(x);
                if (found.length === rank) break;
            }
        }
        // 2-saturate: replace a generator while some ±product is a square
        let units = found;
        for (let guard = 0; guard < 64; guard++) {
            let changed = false;
            const m = units.length;
            for (let mask = 1; mask < 1 << (m + 1) && !changed; mask++) {
                let u = this.one;
                for (let i = 0; i < m; i++) if (mask & (1 << i)) u = this.mul(u, units[i]);
                if (mask & (1 << m)) u = this.neg(u);
                const y = this.sqrt(u);
                if (!y) continue;
                // y² = ±∏_{i ∈ mask} εᵢ: replace the last εᵢ in the mask by y·∏ (others)⁻¹
                const t = [...Array(m).keys()].filter((i) => mask & (1 << i)).pop();
                if (t === undefined) continue;                              // −1 a square: roots of unity, below
                let w = y;
                for (let i = 0; i < m; i++) if (i !== t && mask & (1 << i)) w = this.mul(w, this.inv(units[i]));
                units = units.map((e, i) => (i === t ? w : e));
                changed = true;
            }
            if (!changed) break;
        }
        // U/U²: ±∏ εᵢ^{aᵢ} (the torsion of a field with a complex place may be larger than ±1: its odd part
        // is a square, and an even part beyond ±1 needs a root of unity of order 4 or more, checked here)
        const tors = this.real ? null : this.evenRootOfUnity();
        if (tors) units = units.concat([tors]);
        const classes = [];
        const m2 = units.length;
        for (let mask = 0; mask < 1 << (m2 + 1); mask++) {
            let u = this.one;
            for (let i = 0; i < m2; i++) if (mask & (1 << i)) u = this.mul(u, units[i]);
            if (mask & (1 << m2)) u = this.neg(u);
            if (!classes.some((c) => this.sqrt(this.div(u, c)))) classes.push(u);      // distinct modulo squares
        }
        const rho = 0.5 * units.reduce((s, u) => s + Math.max(...logs(u).map(Math.abs)), 0);
        return (this._units = { units, classes, rho });
    }
    /**
     * A unit u (a product of the fundamental units) with u²ν balanced: log|σ(u²ν)| as close as rounding allows to
     * log|N ν|/n at every place at ∞. Keeps projective representatives small (k-scaling by units is free).
     */
    balanceUnit(nu) {
        const U = this.unitData().units;
        if (!U.length) return null;
        const r = this.r1 + this.r2, v = this.logs(nu), w = (i) => (i < this.r1 ? 1 : 2);
        const mean = v.reduce((s, x, i) => s + w(i) * x, 0) / this.n;
        const L = U.map((u) => this.logs(u));
        // least squares: Σ m_j·2L_j ≈ mean − v (rows: places), then round
        const t = v.map((x) => mean - x);
        const m = L.length;
        const A = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => L[a].reduce((s, x, i) => s + 4 * x * L[b][i], 0)));
        const rhs = Array.from({ length: m }, (_, a) => L[a].reduce((s, x, i) => s + 2 * x * t[i], 0));
        for (let c = 0; c < m; c++) {
            let p = c; for (let i = c + 1; i < m; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
            [A[c], A[p]] = [A[p], A[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
            for (let i = 0; i < m; i++) if (i !== c) { const f = A[i][c] / A[c][c]; for (let j = c; j < m; j++) A[i][j] -= f * A[c][j]; rhs[i] -= f * rhs[c]; }
        }
        const ms = rhs.map((x, i) => Math.round(x / A[i][i]));
        if (ms.every((x) => !x) || ms.some((x) => !Number.isFinite(x))) return null;
        let u = this.one;
        ms.forEach((e, j) => { const b = e > 0 ? U[j] : this.inv(U[j]); for (let k = 0; k < Math.abs(e); k++) u = this.mul(u, b); });
        void r;
        return u;
    }
    /** a root of unity ζ of 2-power order ≥ 4 generating the 2-part of the torsion modulo ±1, or null */
    evenRootOfUnity() {
        // roots of unity are the units with all |σ| = 1: T2 = n
        const vecs = shortVectors(this.t2GramOf(this.okBasis), this.n + 1e-6, { max: 1e5 });
        let best = null, bestOrd = 2;
        for (const c of vecs) {
            const x = this.fromOk(c.map(BigInt));
            let y = x, ord = 1;
            while (!this.eq(y, this.one) && ord < 200) { y = this.mul(y, x); ord++; }
            if (ord >= 200) continue;
            let o2 = 1; while (ord % (2 * o2) === 0) o2 *= 2;
            if (o2 > bestOrd) { bestOrd = o2; let z = x; for (let t = 1; t < ord / o2; t++) z = this.mul(z, x); best = z; }
        }
        return best;
    }
    /** √x in O_k when x ∈ O_k is a square, else null */
    sqrt(x) {
        if (this.r1 && !this.totallyPositive(x)) return null;
        const n = this.n, r1 = this.r1, r2 = this.r2;
        const s = this.sigma(x).map(Math.sqrt);
        const sc = this.sigmaC(x).map((z) => { const m = Math.hypot(z.re, z.im), re = Math.sqrt((m + z.re) / 2), im = Math.sign(z.im || 1) * Math.sqrt(Math.max(0, (m - z.re) / 2)); return { re, im }; });
        const ER = this.okBasis.map((b) => this.sigma(b)), EC = this.okBasis.map((b) => this.sigmaC(b));
        for (let signs = 0; signs < 1 << (r1 + r2 - 1); signs++) {
            const sg = (j) => (j > 0 && signs & (1 << (j - 1)) ? -1 : 1);
            // equations: real embeddings, then Re and Im of each complex one
            const rows = [];
            for (let j = 0; j < r1; j++) rows.push(ER.map((e) => e[j]).concat([sg(j) * s[j]]));
            for (let j = 0; j < r2; j++) { const t = sg(r1 + j); rows.push(EC.map((e) => e[j].re).concat([t * sc[j].re])); rows.push(EC.map((e) => e[j].im).concat([t * sc[j].im])); }
            const M = rows;
            for (let c = 0; c < n; c++) {
                let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
                [M[c], M[p]] = [M[p], M[c]];
                for (let i = 0; i < n; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; }
            }
            const cf = M.map((r, i) => Math.round(r[n] / r[i]));
            if (cf.some((v) => !Number.isFinite(v))) continue;
            const y = this.fromOk(cf.map(BigInt));
            if (this.eq(this.mul(y, y), x)) return y;
        }
        return null;
    }
    /**
     * A generator of the integral ideal L, or null when it is not principal. The search is exhaustive up to
     * T2 ≤ n·N(𝔞)^{2/n}·e^{2ρ} (some generator times a unit is that small).
     */
    generator(L) {
        if (L.den !== 1n) { const g = this.generator(latScale(L, L.den)); return g ? this.divInt(g, L.den) : null; }
        const N = this.idealNorm(L);
        if (N[1] !== 1n) throw new Error('internal: the ideal is not integral');
        if (this.n === 1) return { v: [L.H[0][0] / L.den], d: 1n };
        const { rho } = this.unitData();
        const bound = this.n * Math.pow(Number(N[0]), 2 / this.n) * Math.exp(2 * rho) * (1 + 1e-9) + 1e-9;
        const E = elemsOf(L);
        const G = this.t2GramOf(E);
        for (const c of shortVectors(G, bound, { max: 5e6 })) {
            let x = this.zero;
            c.forEach((ci, i) => { if (ci) x = this.add(x, this.scale(E[i], BigInt(ci))); });
            const M = this.norm(x);
            if (M[1] === 1n && babs(M[0]) === N[0]) return x;
        }
        return null;
    }
    /** the generators of L positive at the real places listed (all), modulo squares of units: [] when none */
    positiveGenerators(L, places = null) {
        const g = this.generator(L);
        if (!g) return null;
        const out = [];
        for (const u of this.unitData().classes) { const x = this.mul(g, u); if (this.totallyPositive(x, places) && !out.some((y) => this.sqrt(this.div(x, y)))) out.push(x); }
        return out;
    }
    /** class number one (Minkowski): every prime of norm ≤ n!/nⁿ·√|d_k| is principal. */
    classNumberOne() {
        if (this.n === 1) return true;
        let fact = 1; for (let i = 2; i <= this.n; i++) fact *= i;
        const M = (4 / Math.PI) ** this.r2 * (fact / this.n ** this.n) * Math.sqrt(Math.abs(Number(this.disc)));
        for (let p = 2; p <= M; p++) {
            if (!isPrimeSmall(p)) continue;
            for (const P of this.primesAbove(p)) if (p ** P.f <= M && !this.generator(P.L)) return false;
        }
        return true;
    }
}

// ───────────────────────── A = (α, β)_k ─────────────────────────

export class QAlgebra {
    /** α, β ∈ ℤ[θ] (integral θ-coordinates), totally negative for a definite algebra */
    constructor(K, alpha, beta) {
        if (alpha.d !== 1n || beta.d !== 1n) throw new Error('internal: α, β must be integral');
        this.K = K; this.alpha = alpha; this.beta = beta;
        const n = this.n = K.n;
        this.D = 4 * n;
        this.ab = K.mul(alpha, beta);
        // the bilinear form Tr_k(⟨x, y⟩), ⟨x, y⟩ = x₀y₀ − αx₁y₁ − βx₂y₂ + αβx₃y₃, on the flat basis θ^a e_c
        const coef = [K.one, K.neg(alpha), K.neg(beta), this.ab];
        const G = Array.from({ length: this.D }, () => new Array(this.D).fill(0n));
        let den = 1n;
        const ent = [];
        for (let c = 0; c < 4; c++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
            const ta = new Array(n).fill(0n); ta[a] = 1n;
            const tb = new Array(n).fill(0n); tb[b] = 1n;
            const x = K.mul(coef[c], { v: K.mulRaw(ta, tb), d: 1n });
            const tr = K.trace(x);
            ent.push([c * n + a, c * n + b, tr]);
            den = blcm(den, tr[1]);
        }
        for (const [i, j, tr] of ent) G[i][j] = tr[0] * (den / tr[1]);
        this.G = G; this.Gden = den;                                         // Tr⟨x, y⟩ = xᵀGy / Gden
    }
    block(x, c) { return { v: x.v.slice(c * this.n, (c + 1) * this.n), d: x.d }; }
    fromBlocks(bl) {
        const D = bl.reduce((l, b) => blcm(l, b.d), 1n);
        const v = [];
        for (const b of bl) for (const c of b.v) v.push(c * (D / b.d));
        return normFlat(v, D);
    }
    blocks(x) { return [0, 1, 2, 3].map((c) => this.K.norm1(x.v.slice(c * this.n, (c + 1) * this.n), x.d)); }
    mul(x, y) {
        const K = this.K, n = this.n, m = (u, w) => K.mulRaw(u, w);
        const X = [0, 1, 2, 3].map((c) => x.v.slice(c * n, (c + 1) * n)), Y = [0, 1, 2, 3].map((c) => y.v.slice(c * n, (c + 1) * n));
        const al = this.alpha.v, be = this.beta.v, ab = this.ab.v;
        const add = (...ps) => ps.reduce((s, p) => s.map((c, i) => c + p[i]));
        const neg = (p) => p.map((c) => -c);
        const c0 = add(m(X[0], Y[0]), m(al, m(X[1], Y[1])), m(be, m(X[2], Y[2])), neg(m(ab, m(X[3], Y[3]))));
        const c1 = add(m(X[0], Y[1]), m(X[1], Y[0]), neg(m(be, m(X[2], Y[3]))), m(be, m(X[3], Y[2])));
        const c2 = add(m(X[0], Y[2]), m(X[2], Y[0]), m(al, m(X[1], Y[3])), neg(m(al, m(X[3], Y[1]))));
        const c3 = add(m(X[0], Y[3]), m(X[3], Y[0]), m(X[1], Y[2]), neg(m(X[2], Y[1])));
        return normFlat([...c0, ...c1, ...c2, ...c3], x.d * y.d);
    }
    conj(x) { const n = this.n; return { v: x.v.map((c, i) => (i < n ? c : -c)), d: x.d }; }
    /** nrd(x) = x x̄ ∈ k */
    nrd(x) { const p = this.mul(x, this.conj(x)); return this.K.norm1(p.v.slice(0, this.n), p.d); }
    trd(x) { return this.K.norm1(x.v.slice(0, this.n).map((c) => 2n * c), x.d); }
    /** Tr_{k/ℚ}⟨x, y⟩ as a rational */
    bil(x, y) {
        let s = 0n;
        const D = this.D, G = this.G;
        for (let i = 0; i < D; i++) { if (!x.v[i]) continue; const row = G[i]; for (let j = 0; j < D; j++) if (y.v[j] && row[j]) s += x.v[i] * row[j] * y.v[j]; }
        return Q(s, this.Gden * x.d * y.d);
    }
    one() { const v = new Array(this.D).fill(0n); v[0] = 1n; return { v, d: 1n }; }
    /** x·c for c ∈ k (each block) */
    scaleK(x, c) { const bl = this.blocks(x).map((b) => this.K.mul(b, c)); return this.fromBlocks(bl); }
    /** x y x⁻¹ = x y x̄ / nrd(x) */
    conjBy(x, y) { return this.scaleK(this.mul(this.mul(x, y), this.conj(x)), this.K.inv(this.nrd(x))); }
    /** the projective class of x ∈ A^× (mod k^×), as a canonical string */
    key(x) {
        const bl = this.blocks(x);
        const c = bl.findIndex((b) => !this.K.isZero(b));
        const t = this.K.inv(bl[c]);
        return bl.map((b) => { const y = this.K.mul(b, t); return `${y.v.join(',')}/${y.d}`; }).join(';');
    }
    /**
     * A small projective representative: scaled by a unit of k so that its reduced norm is balanced at ∞ (when k
     * has units of infinite order), then primitive in ℤ^D (integer coordinates, content 1).
     */
    prim(x) {
        if (this.K.n > 1 && this.K.r1 + this.K.r2 > 1) {
            const u = this.K.balanceUnit(this.nrd(x));
            if (u) x = this.scaleK(x, u);
        }
        const den = x.d, g0 = x.v.reduce((s, c) => bgcd(s, c), 0n) || 1n;
        void den;
        return { v: x.v.map((c) => c / g0), d: 1n };
    }
}
export function normFlat(v, d) { let g = d; for (const x of v) g = bgcd(g, x); if (d < 0n) g = -g; return g === 1n ? { v, d } : { v: v.map((x) => x / g), d: d / g }; }

// ───────────────────────── lattices in ℚ^D ─────────────────────────
// elements { v: BigInt[D], d }; a lattice { den, H, D }: H the HNF (upper triangular) of den·L, den minimal

export function hnf(rows, D) {
    const M = rows.map((r) => r.slice()).filter((r) => r.some((x) => x !== 0n));
    let r0 = 0;
    for (let c = 0; c < D && r0 < M.length; c++) {
        for (;;) {
            let piv = -1;
            for (let i = r0; i < M.length; i++) if (M[i][c] !== 0n && (piv < 0 || babs(M[i][c]) < babs(M[piv][c]))) piv = i;
            if (piv < 0) break;
            [M[r0], M[piv]] = [M[piv], M[r0]];
            let done = true;
            const pr = M[r0], pc = pr[c];
            for (let i = r0 + 1; i < M.length; i++) {
                const x = M[i][c];
                if (x === 0n) continue;
                const q = x / pc;
                if (q) { const row = M[i]; for (let k = c; k < D; k++) row[k] -= q * pr[k]; }
                if (M[i][c] !== 0n) done = false;
            }
            if (done) break;
        }
        if (M[r0] && M[r0][c] !== 0n) {
            if (M[r0][c] < 0n) M[r0] = M[r0].map((x) => -x);
            const pr = M[r0], pc = pr[c];
            for (let i = 0; i < r0; i++) { const q = floorDiv(M[i][c], pc); if (q) { const row = M[i]; for (let k = c; k < D; k++) row[k] -= q * pr[k]; } }
            r0++;
        }
        // drop zero rows below to keep the work small
        for (let i = M.length - 1; i >= r0; i--) if (M[i].every((x) => x === 0n)) M.splice(i, 1);
    }
    return M.slice(0, r0);
}

export function lattice(elems) {
    if (!elems.length) return null;
    const D = elems[0].v.length;
    let den = 1n;
    for (const x of elems) den = blcm(den, x.d);
    const H = hnf(elems.map((x) => x.v.map((c) => c * (den / x.d))), D);
    if (H.length < D) return null;
    let g = den;
    for (const r of H) for (const c of r) g = bgcd(g, c);
    return { den: den / g, H: H.map((r) => r.map((c) => c / g)), D };
}
export const elemsOf = (L) => L.H.map((v) => ({ v, d: L.den }));
export const latEq = (L, M) => L.den === M.den && L.H.every((r, i) => r.every((c, j) => c === M.H[i][j]));
export const latKey = (L) => `${L.den}|${L.H.map((r) => r.join(',')).join(';')}`;
export const latSum = (L, M) => lattice(elemsOf(L).concat(elemsOf(M)));
export const latScale = (L, k) => lattice(elemsOf(L).map((x) => ({ v: x.v.map((c) => c * BigInt(k)), d: x.d })));
export const latScaleQ = (L, q) => lattice(elemsOf(L).map((x) => ({ v: x.v.map((c) => c * q[0]), d: x.d * q[1] })));
/** det of the basis H/den (rational) */
export function latDet(L) { let n = 1n; for (let i = 0; i < L.D; i++) n *= L.H[i][i]; return Q(n, L.den ** BigInt(L.D)); }
/** [M : L] for L ⊆ M, or the ratio of covolumes in general */
export const latIndex = (L, M) => qdiv(latDet(L), latDet(M));

/** Coordinates of x on the basis of L (upper triangular), as rationals. */
export function coordsIn(L, x) {
    const D = L.D, out = new Array(D);
    // Σ cᵢ Hᵢ = x.v·den/x.d, solved left to right (column j involves rows i ≤ j)
    for (let j = 0; j < D; j++) {
        let n = x.v[j] * L.den, m = x.d;
        for (let i = 0; i < j; i++) { const [cn, cm] = out[i]; if (!cn || !L.H[i][j]) continue; n = n * cm - L.H[i][j] * cn * m; m *= cm; }
        out[j] = Q(n, m * L.H[j][j]);
    }
    return out;
}
export const contains = (L, x) => coordsIn(L, x).every((c) => c[1] === 1n);
export const latContains = (L, M) => elemsOf(M).every((x) => contains(L, x));

/** The dual lattice for the standard dot product: rows of (B⁻¹)ᵀ, B = H/den. */
export function latDual(L) {
    const D = L.D, H = L.H;
    // X = H⁻¹ (upper triangular, rational), column by column
    const X = Array.from({ length: D }, () => new Array(D).fill(null));
    for (let j = 0; j < D; j++) {
        for (let i = D - 1; i >= 0; i--) {
            let s = Q(i === j ? 1n : 0n);
            for (let k = i + 1; k < D; k++) if (X[k][j] && X[k][j][0] && H[i][k]) s = qsub(s, qmul(Q(H[i][k]), X[k][j]));
            X[i][j] = qdiv(s, Q(H[i][i]));
        }
    }
    // dual basis vectors: columns of den·X
    const elems = [];
    for (let j = 0; j < D; j++) {
        const col = X.map((row) => qmul(row[j], Q(L.den)));
        const dd = col.reduce((l, q) => blcm(l, q[1]), 1n);
        elems.push({ v: col.map((q) => q[0] * (dd / q[1])), d: dd });
    }
    return lattice(elems);
}
export const latIntersect = (L, M) => latDual(latSum(latDual(L), latDual(M)));

/** The lattice equal to A at q and to B at every other prime (E large enough: qᴱB ⊆ A_q ⊆ q⁻ᴱB). */
export function patchAt(A, B, q, E) {
    const Q1 = latIntersect(A, latScaleQ(B, Q(1n, q ** BigInt(E))));
    return latSum(Q1, latScale(B, q ** BigInt(E)));
}
/** E with qᴱB ⊆ A and qᴱA ⊆ B locally at q (from the q-parts of the denominators of the change of basis both ways). */
export function patchExponent(A, B, q) {
    let E = 0;
    for (const x of elemsOf(B)) for (const c of coordsIn(A, x)) if (c[0]) E = Math.max(E, vp(c[1], q));
    for (const x of elemsOf(A)) for (const c of coordsIn(B, x)) if (c[0]) E = Math.max(E, vp(c[1], q));
    return E;
}

// ───────────────────────── orders ─────────────────────────

/** |det(Tr_{k/ℚ} trd(bᵢ b̄ⱼ))| for the basis of L: an integer for an order (d_k⁴·N(𝔡)² when maximal). */
export function discOf(L, QA) {
    const E = elemsOf(L), D = L.D;
    const T = E.map((a) => E.map((b) => { const q = QA.bil(a, b); return Q(2n * q[0], q[1]); }));
    const den = T.flat().reduce((l, q) => blcm(l, q[1]), 1n);
    const det = detBig(T.map((r) => r.map((q) => q[0] * (den / q[1]))));
    return Q(babs(det), den ** BigInt(D));
}

/** The ring generated by the lattice L (which contains 1), or null when it is not integral at q (or anywhere). */
export function closeOrder(L, QA, { minDisc = null, maxIter = 40 } = {}) {
    for (let it = 0; it < maxIter; it++) {
        const E = elemsOf(L), more = E.slice();
        for (const x of E) for (const y of E) more.push(QA.mul(x, y));
        const M = lattice(more);
        if (!M) return null;
        if (latEq(M, L)) return L;
        L = M;
        const dsc = discOf(L, QA);
        if (dsc[1] !== 1n) return null;
        if (minDisc && minDisc.some(([q, v]) => vp(dsc[0], q) < v)) return null;
    }
    return null;
}

/** A basis (rows mod p) of the kernel of the integer matrix T over F_p. */
export function kernelModP(T, p) {
    const pn = BigInt(p), n = T.length;
    const M = T.map((r) => r.map((c) => modn(c, pn)));
    const inv = (a) => { let [r0, r1, s0, s1] = [a, pn, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return modn(s0, pn); };
    const pivCol = [];
    let row = 0;
    for (let c = 0; c < n && row < n; c++) {
        let p0 = row; while (p0 < n && M[p0][c] === 0n) p0++;
        if (p0 === n) continue;
        [M[row], M[p0]] = [M[p0], M[row]];
        const iv = inv(M[row][c]);
        M[row] = M[row].map((x) => (x * iv) % pn);
        for (let i = 0; i < n; i++) if (i !== row && M[i][c]) { const f = M[i][c]; M[i] = M[i].map((x, k) => modn(x - f * M[row][k], pn)); }
        pivCol.push(c); row++;
    }
    const free = [...Array(n).keys()].filter((c) => !pivCol.includes(c));
    return free.map((f) => {
        const v = new Array(n).fill(0n); v[f] = 1n;
        pivCol.forEach((c, i) => { v[c] = modn(-M[i][f], pn); });
        return v;
    });
}

/**
 * The overorders of L of index q that are orders: x = r/q with r in the radical of the trace form mod q (an
 * overorder lies in the dual), with trd(x), nrd(x) ∈ O_k; then the ring L[x]. A generator over the candidates.
 */
export function* indexQOverorders(L, QA, q, { maxCandidates = 2e5 } = {}) {
    const K = QA.K, qn = BigInt(q), E = elemsOf(L), D = L.D;
    const T = E.map((a) => E.map((b) => { const t = QA.bil(a, b); const v = 2n * t[0]; if (v % t[1]) throw new Error('internal: not an order'); return v / t[1]; }));
    const ker = kernelModP(T, q);
    const k = ker.length;
    if (!k) return;
    const total = qn ** BigInt(k);
    if (total > BigInt(maxCandidates)) throw new Error(`the order is far from maximal at ${q}`);
    const seen = new Set();
    for (let idx = 1n; idx < total; idx++) {
        const c = []; let t = idx;
        for (let i = 0; i < k; i++) { c.push(t % qn); t /= qn; }
        let top = k - 1; while (c[top] === 0n) top--;
        if (c[top] !== 1n) continue;
        const r = new Array(D).fill(0n);
        for (let i = 0; i < k; i++) if (c[i]) for (let j = 0; j < D; j++) r[j] = (r[j] + c[i] * ker[i][j]) % qn;
        const v = new Array(D).fill(0n);
        for (let j = 0; j < D; j++) if (r[j]) for (let l = 0; l < D; l++) v[l] += r[j] * L.H[j][l];
        const x = { v, d: L.den * qn };
        if (!K.inOk(QA.trd(x)) || !K.inOk(QA.nrd(x))) continue;
        const M = closeOrder(lattice(E.concat([x])), QA);
        if (!M) continue;
        const key = latKey(M);
        if (seen.has(key)) continue;
        seen.add(key);
        yield M;
    }
}

/**
 * A maximal overorder of L at q (any one; nothing changes at other primes). With target = v_q of the discriminant of
 * a maximal order (d_k⁴·N(𝔡)²), it stops there; without it, when no index-q overorder is left.
 */
export function maximalizeAt(L, QA, q, target = null) {
    for (let guard = 0; guard < 64; guard++) {
        if (target !== null && vp(discOf(L, QA)[0], BigInt(q)) <= target) return L;
        const it = indexQOverorders(L, QA, q).next();
        if (it.done) return L;
        L = it.value;
    }
    throw new Error(`maximalization at ${q} did not settle`);
}

// ───────────────────────── LLL and Fincke–Pohst ─────────────────────────

/**
 * LLL (δ = 0.99) on elements with a common denominator, for the positive form bil (rationals). The Gram matrix
 * is computed once, exactly, and updated with each row operation; Gram–Schmidt runs in floating point.
 */
export function lll(E, bil) {
    const b = E.map((x) => x.v.slice()), den = E[0].d, D = b.length;
    const G0 = E.map((x) => E.map((y) => bil(x, y)));
    const gd = G0.flat().reduce((l, q) => blcm(l, q[1]), 1n);
    const G = G0.map((r) => r.map((q) => q[0] * (gd / q[1])));               // integer, ∝ the Gram matrix
    let k = 1;
    for (let guard = 0; k < D && guard < 20000; guard++) {
        const mu = Array.from({ length: D }, () => new Array(D).fill(0)), Bs = [];
        for (let i = 0; i <= k; i++) {
            let s = Number(G[i][i]);
            for (let j = 0; j < i; j++) {
                let m = Number(G[i][j]);
                for (let l = 0; l < j; l++) m -= mu[j][l] * mu[i][l] * Bs[l];
                mu[i][j] = m / Bs[j];
                s -= mu[i][j] * mu[i][j] * Bs[j];
            }
            Bs.push(s);
        }
        let changed = false;
        for (let j = k - 1; j >= 0; j--) {
            const r = Math.round(mu[k][j]);
            if (!r) continue;
            const R = BigInt(r);
            b[k] = b[k].map((c, l) => c - R * b[j][l]);
            // G ← U G Uᵀ for row k −= R·row j
            const gkj = G[k][j], gjj = G[j][j];
            for (let i = 0; i < D; i++) if (i !== k) { G[k][i] -= R * G[j][i]; G[i][k] = G[k][i]; }
            G[k][k] = G[k][k] - 2n * R * gkj + R * R * gjj;
            changed = true;
            break;
        }
        if (changed) continue;
        if (Bs[k] < (0.99 - mu[k][k - 1] ** 2) * Bs[k - 1]) {
            [b[k], b[k - 1]] = [b[k - 1], b[k]];
            [G[k], G[k - 1]] = [G[k - 1], G[k]];
            for (const row of G) [row[k], row[k - 1]] = [row[k - 1], row[k]];
            k = Math.max(k - 1, 1);
        } else k++;
    }
    return b.map((v) => ({ v, d: den }));
}

/**
 * All integer vectors x with xᵀGx ≤ bound (G: Numbers, positive definite), by Fincke–Pohst; the caller checks
 * exact values. { max } caps the work (it throws past it).
 */
export function shortVectors(G, bound, { max = 4e6 } = {}) {
    const n = G.length, q = G.map((r) => r.slice());
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) { q[j][i] = q[i][j]; q[i][j] /= q[i][i]; }
        for (let k = i + 1; k < n; k++) for (let l = k; l < n; l++) q[k][l] -= q[k][i] * q[i][l];
    }
    const out = [], x = new Array(n).fill(0);
    let count = 0;
    const tol = 1e-9 * (1 + bound);
    const rec = (i, rem) => {
        let c = 0;
        for (let j = i + 1; j < n; j++) c -= q[i][j] * x[j];
        const r = Math.sqrt(Math.max(0, rem / q[i][i]));
        for (let xi = Math.ceil(c - r - 1e-9); xi <= Math.floor(c + r + 1e-9); xi++) {
            x[i] = xi;
            const t = xi - c, rem2 = rem - q[i][i] * t * t;
            if (rem2 < -tol) continue;
            if (i === 0) { if (++count > max) throw new Error('too many short vectors'); if (x.some((v) => v)) out.push(x.slice()); }
            else rec(i - 1, rem2);
        }
        x[i] = 0;
    };
    rec(n - 1, bound + tol);
    return out;
}
