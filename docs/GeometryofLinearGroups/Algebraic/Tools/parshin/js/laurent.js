// Laurent polynomials in π = 1/t over ℚ, and 2×2 matrices of them.
//
// SL₂(ℚ[t]) sits in SL₂(K) for K = ℚ((π)), the completion of ℚ(t) at t = ∞, whose valuation
// ring O = ℚ[[π]] has residue field ℚ. A polynomial Σ aₖtᵏ is the Laurent polynomial Σ aₖπ⁻ᵏ,
// and its valuation is −deg. Everything the tree needs (frames, the vertex γv, the local maps)
// is a finite computation with these, done exactly.
import { Q } from './rational.js';
import { primitive } from './poly.js';

// Σ c[i] π^(v+i), with c[0] and the last c nonzero; zero has c = [].
export class L {
    constructor(v, c) { this.v = v; this.c = c; }

    static make(v, c) {
        let lo = 0, hi = c.length;
        while (lo < hi && c[lo].isZero()) lo++;
        while (hi > lo && c[hi - 1].isZero()) hi--;
        return lo === hi ? L.ZERO : new L(v + lo, c.slice(lo, hi));
    }
    static of(q, k = 0) { return q.isZero() ? L.ZERO : new L(k, [q]); }   // q·πᵏ

    isZero() { return this.c.length === 0; }
    get val() { return this.c.length ? this.v : Infinity; }
    get top() { return this.v + this.c.length - 1; }
    coef(k) {
        const i = k - this.v;
        return i >= 0 && i < this.c.length ? this.c[i] : Q.ZERO;
    }
    add(o) {
        if (this.isZero()) return o;
        if (o.isZero()) return this;
        const v = Math.min(this.v, o.v), hi = Math.max(this.top, o.top), c = [];
        for (let k = v; k <= hi; k++) c.push(this.coef(k).add(o.coef(k)));
        return L.make(v, c);
    }
    neg() { return this.isZero() ? this : new L(this.v, this.c.map((x) => x.neg())); }
    sub(o) { return this.add(o.neg()); }
    mul(o) {
        if (this.isZero() || o.isZero()) return L.ZERO;
        const c = new Array(this.c.length + o.c.length - 1).fill(Q.ZERO);
        for (let i = 0; i < this.c.length; i++) {
            for (let j = 0; j < o.c.length; j++) c[i + j] = c[i + j].add(this.c[i].mul(o.c[j]));
        }
        return L.make(this.v + o.v, c);
    }
    shift(k) { return this.isZero() ? this : new L(this.v + k, this.c); }   // ·πᵏ
}
L.ZERO = new L(0, []);
L.ONE = new L(0, [Q.ONE]);
L.PI = new L(1, [Q.ONE]);

// The coefficients of π⁰ … π^(n−1) in a/b, for val(b) = 0 and val(a) ≥ 0.
export function seriesQuot(a, b, n) {
    const b0inv = b.coef(0).inv(), r = [];
    for (let k = 0; k < n; k++) {
        let s = a.coef(k);
        for (let j = 1; j <= k; j++) {
            const bj = b.coef(j);
            if (!bj.isZero()) s = s.sub(bj.mul(r[k - j]));
        }
        r.push(s.mul(b0inv));
    }
    return r;
}

// Matrices [a, b, c, d] = (a b; c d).
export const IDENTITY = [L.ONE, L.ZERO, L.ZERO, L.ONE];
export const mmul = (A, B) => [
    A[0].mul(B[0]).add(A[1].mul(B[2])), A[0].mul(B[1]).add(A[1].mul(B[3])),
    A[2].mul(B[0]).add(A[3].mul(B[2])), A[2].mul(B[1]).add(A[3].mul(B[3])),
];
export const adj = (A) => [A[3], A[1].neg(), A[2].neg(), A[0]];
export const det = (A) => A[0].mul(A[3]).sub(A[1].mul(A[2]));
// the identity of PGL₂
export const isScalar = (A) => A[1].isZero() && A[2].isZero() && A[0].sub(A[3]).isZero();

// ---------- polynomials in t (coefficient arrays by degree) ----------

export function fromPoly(a) {
    let d = a.length - 1;
    while (d >= 0 && a[d].isZero()) d--;
    if (d < 0) return L.ZERO;
    const c = [];
    for (let k = d; k >= 0; k--) c.push(a[k]);
    return L.make(-d, c);
}
// null if x has positive powers of π (is not a polynomial in t)
export function toPoly(x) {
    if (x.isZero()) return [];
    if (x.top > 0) return null;
    const a = [];
    for (let k = 0; k <= -x.v; k++) a.push(x.coef(-k));
    return a;
}

export function polyTex(a, v = 't') {
    const terms = [];
    for (let k = a.length - 1; k >= 0; k--) {
        const c = a[k];
        if (!c || c.isZero()) continue;
        const mono = k === 0 ? '' : k === 1 ? v : `${v}^{${k}}`;
        const mag = mono && c.d === 1n && (c.n === 1n || c.n === -1n) ? '' : c.texAbs();
        terms.push({ neg: c.sign() < 0, body: mag + mono });
    }
    if (!terms.length) return '0';
    return terms.map((t, i) => (i === 0 ? (t.neg ? '-' : '') : t.neg ? ' - ' : ' + ') + t.body).join('');
}
export const lTex = (x) => { const a = toPoly(x); return a ? polyTex(a) : '?'; };

// A matrix over ℚ[t] scaled within PGL₂: entries with no common factor and coprime integer coefficients.
export const normalizePGL = (A) => primitive(A.map((x) => toPoly(x))).map(fromPoly);
