/**
 * tower.js — exact arithmetic in a tower of number fields
 *
 *     ℚ = L₀ ⊂ L₁ ⊂ … ⊂ L_m = K,     L_k = L_{k−1}[y_k] / (P_k(y_k)),
 *
 * one level per adjoined number: a constant, a radical, i, a root of unity,
 * cos(πr), the root of a polynomial. No primitive element of K is ever
 * formed. An element of level k is an array of d_k = deg P_k elements of
 * level k−1, so coefficients stay as small as the numbers the user typed.
 *
 * Each P_k is monic and IRREDUCIBLE over L_{k−1}: adjoinRoot keeps only the
 * factor that has the requested complex number as a root (Trager's method:
 * factor over ℚ the minimal polynomial of a generic element y + s·θ of
 * L[y]/(P), then take a gcd over L). So K is a field and every zero test is
 * exact.
 *
 * Each level also stores the complex value of y_k under the chosen embedding
 * K ↪ ℂ, so each element's floating-point value agrees with it by
 * construction. Complex conjugation, needed for orientation-reversing
 * generators, is the automorphism σ with σ(y_k) = the element whose value is
 * the conjugate of y_k's. When K is not closed under conjugation,
 * ensureConj() adjoins the missing conjugates.
 *
 * TElem has the interface of exact.js's KElem (add, mul, inv, isZero,
 * equals, conj, embed, and the flat ℚ-coordinates `c`), so ExactMat, the
 * certifier and the invariant trace field work over a tower unchanged.
 */

import { Frac, ExactMat } from './exact.js';
import { factorQ, isSquarefreeModP } from './zfactor.js';

const F0 = new Frac(0n), F1 = new Frac(1n);

/** Thrown when a value is not an algebraic number this engine can represent. */
export class NotExact extends Error {
    constructor(message) { super(message); this.name = 'NotExact'; }
}

// ---------------- complex doubles ----------------

const cx = (re, im = 0) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cabs = (a) => Math.hypot(a.re, a.im);
function cdiv(a, b) {
    const q = b.re * b.re + b.im * b.im;
    return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q);
}

/** A rational as a double, safe for numerators and denominators past 1e308. */
export function fracNum(f) {
    let p = f.p, q = f.q;
    const shift = Math.max(0, Math.max(p.toString().length, q.toString().length) - 300);
    if (shift) {
        const s = 10n ** BigInt(shift);
        p /= s; q /= s;
        if (q === 0n) return p > 0n ? Infinity : p < 0n ? -Infinity : 0;
    }
    return Number(p) / Number(q);
}

/** All complex roots of a polynomial with complex coefficients (low → high). */
export function complexRoots(coeffs) {
    let a = coeffs.slice();
    while (a.length > 1 && cabs(a[a.length - 1]) === 0) a.pop();
    const n = a.length - 1;
    if (n < 1) return [];
    const lead = a[n];
    a = a.map(c => cdiv(c, lead));
    if (n === 1) return [cx(-a[0].re, -a[0].im)];
    const ev = (z) => {
        let p = cx(1), d = cx(0);
        for (let k = n - 1; k >= 0; k--) { d = cadd(cmul(d, z), p); p = cadd(cmul(p, z), a[k]); }
        return { p, d };
    };
    const R = 1 + Math.max(...a.slice(0, n).map(cabs));
    let z = Array.from({ length: n }, (_, k) => cx(0.8 * R * Math.cos(2 * Math.PI * k / n + 0.4), 0.8 * R * Math.sin(2 * Math.PI * k / n + 0.4)));
    for (let it = 0; it < 2000; it++) {
        let moved = 0;
        z = z.map((zk, k) => {
            let den = cx(1);
            z.forEach((zj, j) => { if (j !== k) den = cmul(den, csub(zk, zj)); });
            const step = cdiv(ev(zk).p, den);
            moved = Math.max(moved, cabs(step));
            return csub(zk, step);
        });
        if (moved < 1e-15 * R) break;
    }
    return z.map(r => newton(ev, r));
}
function newton(ev, r) {
    for (let k = 0; k < 4; k++) {
        const { p, d } = ev(r);
        if (cabs(d) === 0) break;
        const s = cdiv(p, d);
        if (!Number.isFinite(s.re) || !Number.isFinite(s.im)) break;
        r = csub(r, s);
    }
    return r;
}
/** Roots in a stable display order: real roots ascending, then the rest by real part. */
export function sortRoots(roots) {
    const scale = Math.max(1, ...roots.map(cabs));
    const real = roots.filter(r => Math.abs(r.im) < 1e-9 * scale).map(r => cx(r.re, 0)).sort((x, y) => x.re - y.re);
    const key = (x) => Math.round(x / scale * 1e8);
    const cpx = roots.filter(r => Math.abs(r.im) >= 1e-9 * scale).sort((x, y) => key(x.re) - key(y.re) || y.im - x.im);
    return real.concat(cpx);
}
/** Index of the entry of `roots` nearest z. */
export function nearestIndex(roots, z) {
    let best = 0, bd = Infinity;
    roots.forEach((r, i) => { const d = Math.hypot(r.re - z.re, r.im - z.im); if (d < bd) { bd = d; best = i; } });
    return best;
}

// ---------------- the levels ----------------

class RatLevel {
    constructor() { this.k = 0; this.d = 1; this.N = 1; }
    zero() { return F0; }
    one() { return F1; }
    fromFrac(f) { return f; }
    add(a, b) { return a.add(b); }
    sub(a, b) { return a.sub(b); }
    neg(a) { return a.neg(); }
    mul(a, b) { return a.mul(b); }
    inv(a) { if (a.isZero()) throw new Error('division by zero'); return F1.div(a); }
    isZero(a) { return a.isZero(); }
    eq(a, b) { return a.equals(b); }
    embed(a) { return cx(fracNum(a)); }
    flat(a, out) { out.push(a); }
    unflat(arr, off = 0) { return arr[off] || F0; }
    rational(a) { return a; }
}

class ExtLevel {
    /** P: monic polynomial over `base` (array of base elements, low → high), irreducible. */
    constructor(base, P, value, info = {}) {
        this.base = base;
        this.k = base.k + 1;
        this.P = P;
        this.d = P.length - 1;
        this.N = base.N * this.d;
        this.value = value;
        this.text = info.text || `y${this.k}`;
        this.tex = info.tex || this.text;
        this.conjOf = info.conjOf ?? null;     // this level is the conjugate of level conjOf
    }
    zero() { const B = this.base; return Array.from({ length: this.d }, () => B.zero()); }
    one() { const z = this.zero(); z[0] = this.base.one(); return z; }
    fromBase(b) { const z = this.zero(); z[0] = b; return z; }
    fromFrac(f) { return this.fromBase(this.base.fromFrac(f)); }
    gen() { const z = this.zero(); z[1] = this.base.one(); return z; }
    add(a, b) { const B = this.base; return a.map((x, i) => B.add(x, b[i])); }
    sub(a, b) { const B = this.base; return a.map((x, i) => B.sub(x, b[i])); }
    neg(a) { const B = this.base; return a.map(x => B.neg(x)); }
    mul(a, b) {
        const B = this.base, d = this.d, P = this.P;
        const r = Array.from({ length: 2 * d - 1 }, () => B.zero());
        for (let i = 0; i < d; i++) {
            if (B.isZero(a[i])) continue;
            for (let j = 0; j < d; j++) {
                if (B.isZero(b[j])) continue;
                r[i + j] = B.add(r[i + j], B.mul(a[i], b[j]));
            }
        }
        for (let t = 2 * d - 2; t >= d; t--) {         // y^d = −(P_0 + … + P_{d−1} y^{d−1})
            const c = r[t];
            if (B.isZero(c)) continue;
            for (let j = 0; j < d; j++) {
                if (!B.isZero(P[j])) r[t - d + j] = B.sub(r[t - d + j], B.mul(c, P[j]));
            }
        }
        return r.slice(0, d);
    }
    inv(a) {
        const F = this.base;
        let r0 = this.P.slice(), r1 = pTrim(F, a.slice());
        if (!r1.length) throw new Error('division by zero');
        let s0 = [], s1 = [F.one()];
        while (r1.length) {
            const [q, r] = pDivmod(F, r0, r1);
            [r0, r1] = [r1, r];
            [s0, s1] = [s1, pSub(F, s0, pMul(F, q, s1))];
        }
        if (r0.length !== 1) throw new Error('internal: a level of the field tower is reducible');
        const c = F.inv(r0[0]);
        const s = pDivmod(F, s0, this.P)[1];
        const out = this.zero();
        s.forEach((x, j) => { out[j] = F.mul(x, c); });
        return out;
    }
    isZero(a) { const B = this.base; return a.every(x => B.isZero(x)); }
    eq(a, b) { const B = this.base; return a.every((x, i) => B.eq(x, b[i])); }
    embed(a) {
        const B = this.base;
        let acc = cx(0);
        for (let j = this.d - 1; j >= 0; j--) acc = cadd(cmul(acc, this.value), B.embed(a[j]));
        return acc;
    }
    flat(a, out) { for (const x of a) this.base.flat(x, out); }
    unflat(arr, off = 0) { const B = this.base; return Array.from({ length: this.d }, (_, j) => B.unflat(arr, off + j * B.N)); }
    rational(a) {
        const B = this.base;
        for (let j = 1; j < this.d; j++) if (!B.isZero(a[j])) return null;
        return B.rational(a[0]);
    }
}

// ---------------- polynomials over a level (arrays of level elements, low → high) ----------------

function pTrim(F, a) { let k = a.length; while (k > 0 && F.isZero(a[k - 1])) k--; return a.slice(0, k); }
function pMonic(F, a) { const inv = F.inv(a[a.length - 1]); return a.map(x => F.mul(x, inv)); }
function pSub(F, a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push(F.sub(i < a.length ? a[i] : F.zero(), i < b.length ? b[i] : F.zero()));
    return pTrim(F, out);
}
function pMul(F, a, b) {
    if (!a.length || !b.length) return [];
    const out = Array.from({ length: a.length + b.length - 1 }, () => F.zero());
    for (let i = 0; i < a.length; i++) {
        if (F.isZero(a[i])) continue;
        for (let j = 0; j < b.length; j++) out[i + j] = F.add(out[i + j], F.mul(a[i], b[j]));
    }
    return pTrim(F, out);
}
function pDivmod(F, a, b) {
    const db = b.length - 1, inv = F.inv(b[db]);
    let r = pTrim(F, a.slice());
    const q = Array.from({ length: Math.max(0, r.length - db) }, () => F.zero());
    while (r.length && r.length - 1 >= db) {
        const k = r.length - 1 - db, c = F.mul(r[r.length - 1], inv);
        q[k] = c;
        for (let i = 0; i <= db; i++) r[i + k] = F.sub(r[i + k], F.mul(c, b[i]));
        r = pTrim(F, r);
    }
    return [pTrim(F, q), r];
}
function pGcd(F, a, b) {
    a = pTrim(F, a); b = pTrim(F, b);
    while (b.length) [a, b] = [b, pDivmod(F, a, b)[1]];
    return a.length ? pMonic(F, a) : a;
}
function pDeriv(F, a) {
    return pTrim(F, a.slice(1).map((c, i) => F.mul(c, F.fromFrac(new Frac(BigInt(i + 1))))));
}

// ---------------- elements ----------------

export class TElem {
    constructor(K, v, k) { this.K = K; this.v = v; this.k = k; }
    get level() { return this.K.levels[this.k]; }
    _pair(o) {
        const k = Math.max(this.k, o.k), K = this.K;
        return [K.liftV(this.v, this.k, k), K.liftV(o.v, o.k, k), K.levels[k], k];
    }
    add(o) { const [a, b, L, k] = this._pair(o); return new TElem(this.K, L.add(a, b), k); }
    sub(o) { const [a, b, L, k] = this._pair(o); return new TElem(this.K, L.sub(a, b), k); }
    mul(o) { const [a, b, L, k] = this._pair(o); return new TElem(this.K, L.mul(a, b), k); }
    neg() { return new TElem(this.K, this.level.neg(this.v), this.k); }
    inv() { return new TElem(this.K, this.level.inv(this.v), this.k); }
    div(o) { return this.mul(o.inv()); }
    pow(n) {
        if (n < 0) return this.inv().pow(-n);
        let r = new TElem(this.K, this.level.one(), this.k), b = this;
        while (n > 0) {
            if (n & 1) r = r.mul(b);
            n >>= 1;
            if (n) b = b.mul(b);
        }
        return r;
    }
    isZero() { return this.level.isZero(this.v); }
    equals(o) { const [a, b, L] = this._pair(o); return L.eq(a, b); }
    embed() { return this.level.embed(this.v); }
    /** The rational number this is, or null. */
    rational() { return this.level.rational(this.v); }
    /** Coordinates over ℚ in the monomial basis of the top level. */
    get c() {
        const K = this.K;
        if (this._c && this._ch === K.height) return this._c;
        const out = [];
        K.levels[K.height].flat(K.liftV(this.v, this.k, K.height), out);
        this._c = out; this._ch = K.height;
        return out;
    }
    /** Complex conjugation, through the automorphism σ of K. */
    conj() { return this.K.conjugate(this); }
    /** A canonical key (equal elements give equal keys at any height). */
    key() {
        const c = this.c;
        let n = c.length;
        while (n > 0 && c[n - 1].isZero()) n--;
        return c.slice(0, n).join(',');
    }
    toString() {
        const r = this.rational();
        if (r) return r.toString();
        const e = this.embed();
        return `≈ ${e.re.toPrecision(8)}${e.im ? ` ${e.im < 0 ? '−' : '+'} ${Math.abs(e.im).toPrecision(8)}i` : ''}`;
    }
}

// ---------------- the tower ----------------

export class TowerField {
    constructor({ maxDegree = 32 } = {}) {
        this.levels = [new RatLevel()];
        this.maxDegree = maxDegree;
        this.sigma = null;              // σ(y_k) for k = 1 … m (index 0 unused), when configured
        this.conjIsIdentity = false;
        this._conjBasis = null;
    }
    get height() { return this.levels.length - 1; }
    get deg() { return this.levels[this.height].N; }
    wrap(v, k = this.height) { return new TElem(this, v, k); }
    zero() { return this.wrap(this.levels[0].zero(), 0); }
    one() { return this.wrap(this.levels[0].one(), 0); }
    fromFrac(f) { return this.wrap(f, 0); }
    fromInt(n) { return this.fromFrac(new Frac(BigInt(n))); }
    /** y_k, the generator of level k. */
    gen(k) { return this.wrap(this.levels[k].gen(), k); }
    liftV(v, from, to) {
        for (let t = from + 1; t <= to; t++) v = this.levels[t].fromBase(v);
        return v;
    }
    lift(x) { return x.k === this.height ? x : this.wrap(this.liftV(x.v, x.k, this.height)); }

    describe() {
        return this.height ? `ℚ(${this.levels.slice(1).map(L => L.text).join(', ')})` : 'ℚ';
    }
    tex() {
        return this.height ? `\\mathbb{Q}(${this.levels.slice(1).map(L => L.tex).join(', ')})` : '\\mathbb{Q}';
    }
    hasConj() { return this.conjIsIdentity || !!this.sigma; }

    /**
     * Adjoin the root of P near `approx` (P: TElem coefficients, low → high).
     * Returns that root as an element, adding a level only when it is not
     * already in the field. info: { text, tex, conjOf } names the new level.
     */
    adjoinRoot(coeffs, approx, info = {}) {
        const L = this.levels[this.height];
        let P = pTrim(L, coeffs.map(c => this.lift(c).v));
        if (P.length < 2) throw new Error('the polynomial has no roots');
        P = pMonic(L, P);
        if (P.length > 2) {
            const g = pGcd(L, P, pDeriv(L, P));
            if (g.length > 1) P = pMonic(L, pDivmod(L, P, g)[0]);
        }
        const alpha = this._refine(P, L, approx);
        const G = P.length === 2 ? P : this._factorFor(P, L, alpha);
        if (G.length === 2) return this.wrap(L.neg(G[0]));
        const N = L.N * (G.length - 1);
        if (N > this.maxDegree) {
            throw new NotExact(`the numbers involved generate a field of degree ${N} (more than ${this.maxDegree})`);
        }
        this.levels.push(new ExtLevel(L, G, this._refine(G, L, alpha), info));
        this.sigma = null; this._conjBasis = null;
        return this.gen(this.height);
    }

    /** The root of P (over level L) nearest z, polished by Newton's method. */
    _refine(P, L, z) {
        const pc = P.map(c => L.embed(c));
        const roots = complexRoots(pc);
        return roots.length ? roots[nearestIndex(roots, z)] : z;
    }

    /** The monic irreducible factor over L of the squarefree P having alpha as a root. */
    _factorFor(P, L, alpha) {
        const n = L.N;
        const rat = P.map(c => L.rational(c));
        if (rat.every(Boolean)) {
            // Rational coefficients: factor over ℚ first.
            const fq = pickFactor(factorQ(rat), alpha);
            P = fq.map(c => L.fromFrac(c));
            const e = fq.length - 1;
            if (e === 1 || n === 1 || gcd(e, n) === 1) return P;     // [L(α):L] = e when gcd(e, n) = 1
        }
        return this._trager(P, L, alpha);
    }

    /**
     * Split P over L with a generic element γ = y + s·θ of A = L[y]/(P): when
     * the ℚ-minimal polynomial χ of γ has degree dim A, A ≅ ℚ[x]/(χ), and
     * the factor χ_j vanishing at γ's value picks out the component of A
     * containing alpha: that component's factor of P is gcd(P, χ_j(γ)).
     */
    _trager(P, L, alpha) {
        const A = new ExtLevel(L, P, alpha);
        const N = A.N;
        if (N > SPLIT_MAX) {
            throw new NotExact(`the numbers involved may generate a field of degree up to ${N}, too large to decide exactly`);
        }
        const gens = [];
        for (let k = 1; k <= this.height; k++) gens.push(this.lift(this.gen(k)));
        const thetas = [[1, 1, 1, 1, 1, 1], [1, 2, 3, 5, 7, 11], [1, -1, 2, -3, 5, -7]].map(cs => {
            let t = this.zero();
            gens.forEach((g, i) => { t = t.add(g.mul(this.fromInt(cs[i % cs.length]))); });
            return this.lift(t);
        });
        for (const theta of thetas) {
            for (const s of [1, -1, 2, 3, -2, 5]) {
                const st = theta.mul(this.fromInt(s));
                const gamma = A.add(A.gen(), A.fromBase(st.v));
                const chi = charpolyQ(A, gamma, N);
                if (!isSquarefreeModP(chi)) continue;       // γ does not (provably) generate A
                const g = cadd(alpha, st.embed());
                const facs = factorQ(chi, { squarefree: true });
                if (facs.length === 1) return P;            // A is a field: P is irreducible over L
                const chij = pickFactor(facs, g);
                let R = A.zero();
                for (let i = chij.length - 1; i >= 0; i--) R = A.add(A.mul(R, gamma), A.fromFrac(chij[i]));
                const G = pGcd(L, P, R);
                if (G.length >= 2 && G.length <= P.length) return G;
            }
        }
        throw new NotExact('could not separate the roots of a polynomial over the field');
    }

    // ---- complex conjugation ----

    /** σ of a level-j value as an element (needs sigma[1..j]). */
    _sigmaV(v, j, imgs) {
        if (j === 0) return this.fromFrac(v);
        const L = this.levels[j];
        let acc = this.zero(), pw = this.one();
        for (let t = 0; t < L.d; t++) {
            if (!L.base.isZero(v[t])) acc = acc.add(this._sigmaV(v[t], j - 1, imgs).mul(pw));
            if (t + 1 < L.d) pw = pw.mul(imgs[j]);
        }
        return acc;
    }

    /**
     * Make complex conjugation an automorphism σ of K, adjoining the
     * conjugates of levels whose conjugates are not yet in K.
     */
    ensureConj() {
        if (this.sigma && this.sigma.length === this.levels.length) return;
        const imgs = [null];
        for (let k = 1; k < this.levels.length; k++) {
            const L = this.levels[k], yk = this.gen(k);
            if (L.conjOf != null) { imgs[k] = this.gen(L.conjOf); continue; }
            const target = cx(L.value.re, -L.value.im);
            const sP = L.P.map(c => this._sigmaV(c, k - 1, imgs));
            const fixed = sP.every((c, i) => c.equals(this.wrap(L.P[i], k - 1)));
            const scale = Math.max(1, cabs(L.value));
            if (fixed && Math.abs(L.value.im) <= 1e-12 * scale) { imgs[k] = yk; continue; }
            if (fixed && L.d === 2) {
                const other = this.wrap(L.P[1], k - 1).neg().sub(yk);    // the other root of y² + P₁y + P₀
                const ov = other.embed();
                if (Math.hypot(ov.re - target.re, ov.im - target.im) <= 1e-9 * scale) { imgs[k] = other; continue; }
            }
            imgs[k] = this.adjoinRoot(sP, target, { text: `conj(${L.text})`, tex: `\\overline{${L.tex}}`, conjOf: k });
        }
        this.sigma = imgs;
        this.conjIsIdentity = imgs.every((e, k) => k === 0 || e.equals(this.gen(k)));
        this._conjBasis = null;
    }

    /** σ(x) — a ℚ-linear map, applied through the images of the monomial basis. */
    conjugate(x) {
        if (!this.sigma || this.sigma.length !== this.levels.length) this.ensureConj();
        if (this.conjIsIdentity) return x;
        if (!this._conjBasis) {
            let imgs = [this.one()];
            for (let k = 1; k <= this.height; k++) {
                const L = this.levels[k], pows = [this.one()];
                for (let t = 1; t < L.d; t++) pows.push(pows[t - 1].mul(this.sigma[k]));
                const next = [];
                for (let t = 0; t < L.d; t++) for (const b of imgs) next.push(b.mul(pows[t]));
                imgs = next;
            }
            this._conjBasis = imgs.map(e => e.c);
        }
        const xc = x.c, N = this.deg, out = new Array(N).fill(F0);
        for (let i = 0; i < N; i++) {
            if (xc[i].isZero()) continue;
            const b = this._conjBasis[i];
            for (let j = 0; j < N; j++) if (!b[j].isZero()) out[j] = out[j].add(xc[i].mul(b[j]));
        }
        return this.wrap(this.levels[this.height].unflat(out, 0));
    }
}

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/**
 * Largest algebra L[y]/(P) the splitting step works in: its cost grows like
 * the cube of the dimension, with a degree-N factorisation over ℚ on top.
 * (A sextic field's own conjugate, the Weeks manifold's, needs 36.)
 */
const SPLIT_MAX = 40;

/** The factor (Frac coefficients) whose root is nearest z. */
function pickFactor(facs, z) {
    if (facs.length === 1) return facs[0];
    let best = facs[0], bd = Infinity;
    for (const f of facs) {
        const roots = complexRoots(f.map(c => cx(fracNum(c))));
        for (const r of roots) {
            const dd = Math.hypot(r.re - z.re, r.im - z.im);
            if (dd < bd) { bd = dd; best = f; }
        }
    }
    return best;
}

/** Tr_{L/L_{k−1}}(y^j), j < d: power sums of the roots of P (Newton's identities). */
function powerSums(L) {
    if (L._ps) return L._ps;
    const B = L.base, d = L.d, P = L.P;
    const ps = [B.fromFrac(new Frac(BigInt(d)))];
    for (let k = 1; k < d; k++) {
        let s = B.mul(B.fromFrac(new Frac(BigInt(k))), P[d - k]);
        for (let i = 1; i < k; i++) s = B.add(s, B.mul(P[d - i], ps[k - i]));
        ps.push(B.neg(s));
    }
    return (L._ps = ps);
}

/** Tr_{L/ℚ}(v), through the tower: Tr_{L/ℚ} = Tr_{L_{k−1}/ℚ} ∘ Tr_{L/L_{k−1}}. */
function traceQ(L, v) {
    if (L instanceof RatLevel) return v;
    const s = powerSums(L), B = L.base;
    let t = F0;
    for (let j = 0; j < L.d; j++) {
        if (!B.isZero(v[j])) t = t.add(traceQ(B, B.mul(v[j], s[j])));
    }
    return t;
}

/**
 * Characteristic polynomial over ℚ (monic, low → high) of multiplication by
 * x on the algebra A of dimension N, from the power sums Tr(x^k) by
 * Newton's identities — no linear algebra, so no fraction blow-up.
 */
function charpolyQ(A, x, N) {
    const p = [null];
    let pw = x;
    for (let k = 1; k <= N; k++) {
        p.push(traceQ(A, pw));
        if (k < N) pw = A.mul(pw, x);
    }
    const e = [F1];
    for (let k = 1; k <= N; k++) {
        let s = F0;
        for (let i = 1; i <= k; i++) {
            const t = e[k - i].mul(p[i]);
            s = i % 2 ? s.add(t) : s.sub(t);
        }
        e.push(s.div(new Frac(BigInt(k))));
    }
    const chi = new Array(N + 1);
    for (let k = 0; k <= N; k++) chi[N - k] = k % 2 ? e[k].neg() : e[k];
    return chi;
}

// ---------------- special polynomials ----------------

const cycloMemo = new Map();
/** The cyclotomic polynomial Φ_m (Frac coefficients, low → high). */
export function cyclotomic(m) {
    if (cycloMemo.has(m)) return cycloMemo.get(m);
    let f = [new Frac(-1n), ...new Array(m - 1).fill(F0), F1];          // x^m − 1
    for (let d = 1; d < m; d++) {
        if (m % d) continue;
        const g = cyclotomic(d);
        // exact division by the monic g
        const q = new Array(f.length - g.length + 1).fill(F0);
        const r = f.slice();
        for (let k = q.length - 1; k >= 0; k--) {
            const c = r[k + g.length - 1];
            q[k] = c;
            if (!c.isZero()) for (let i = 0; i < g.length; i++) r[k + i] = r[k + i].sub(c.mul(g[i]));
        }
        f = q;
    }
    cycloMemo.set(m, f);
    return f;
}

/** Monic minimal polynomial over ℚ of cos(2π/m) (m ≥ 3): Ψ_m(2y) / 2^h. */
export function cosMinpoly(m) {
    const phi = cyclotomic(m), h = (phi.length - 1) / 2;
    // Φ(x)/x^h = c_h + Σ_{j≥1} c_{h+j} (x^j + x^{−j}), and x^j + x^{−j} = V_j(t), t = x + 1/x
    let V0 = [new Frac(2n)], V1 = [F0, F1];
    let psi = [phi[h]];
    const addScaled = (a, b, c) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) out.push((a[i] || F0).add((b[i] || F0).mul(c))); return out; };
    for (let j = 1; j <= h; j++) {
        psi = addScaled(psi, V1, phi[h + j]);
        const V2 = addScaled([F0, ...V1], V0, new Frac(-1n));                // t·V_j − V_{j−1}
        V0 = V1; V1 = V2;
    }
    // substitute t = 2y and make monic
    const out = psi.map((c, i) => c.mul(new Frac(2n ** BigInt(i))));
    const lead = out[out.length - 1];
    return out.map(c => c.div(lead));
}

// ---------------- serialization (worker boundary) ----------------

const fracToPair = (f) => [f.p.toString(), f.q.toString()];
const pairToFrac = ([p, q]) => new Frac(BigInt(p), BigInt(q));

/** Plain data for an exact context { field: TowerField, gens: ExactMat[] } (structured-clone safe). */
export function serializeTowerContext(ctx) {
    if (!ctx) return null;
    const K = ctx.field;
    const flatOf = (L, v) => { const out = []; L.flat(v, out); return out.map(fracToPair); };
    const elem = (e) => e.c.map(fracToPair);
    return {
        kind: 'tower',
        levels: K.levels.slice(1).map(L => ({
            P: L.P.map(c => flatOf(L.base, c)), value: L.value, text: L.text, tex: L.tex, conjOf: L.conjOf,
        })),
        sigma: K.sigma ? K.sigma.slice(1).map(elem) : null,
        conjIsIdentity: K.conjIsIdentity,
        gens: ctx.gens.map(M => ({ a: elem(M.a), b: elem(M.b), c: elem(M.c), d: elem(M.d), anti: M.anti })),
    };
}

export function deserializeTowerContext(data) {
    if (!data) return null;
    const K = new TowerField({ maxDegree: Infinity });
    for (const L of data.levels) {
        const base = K.levels[K.height];
        const P = L.P.map(arr => base.unflat(arr.map(pairToFrac), 0));
        K.levels.push(new ExtLevel(base, P, L.value, L));
    }
    const top = K.levels[K.height];
    const elem = (arr) => K.wrap(top.unflat(arr.map(pairToFrac), 0));
    if (data.sigma) K.sigma = [null, ...data.sigma.map(elem)];
    K.conjIsIdentity = !!data.conjIsIdentity;
    const gens = data.gens.map(g => new ExactMat(elem(g.a), elem(g.b), elem(g.c), elem(g.d), g.anti));
    return { field: K, gens };
}
