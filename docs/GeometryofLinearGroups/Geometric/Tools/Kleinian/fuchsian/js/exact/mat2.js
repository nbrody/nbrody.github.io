/**
 * mat2.js — Exact 2×2 matrices over ℚ, viewed in PGL₂(ℚ) (up to nonzero scalar).
 *
 * Internally each element is stored as a *canonical primitive integer* representative:
 * entries are BigInt, the gcd of the four entries is 1, and the sign is fixed so the
 * leading nonzero entry (in order a,b,c,d) is positive. Two matrices are equal in
 * PGL₂(ℚ) iff their canonical reps agree, so key() is an exact equality test.
 *
 * Classification of the Möbius action on ℍ² uses the scale-invariant rational
 *      t = tr² / det  ∈ ℚ.
 * For det>0 (orientation preserving): t∈[0,4) elliptic, t=4 parabolic, t>4 hyperbolic.
 * By Niven's theorem, 2cos(πq) is rational (for rational q) only for values 0,±1,±2,
 * so a *rational* elliptic has finite order iff t ∈ {0,1,2,3}, with
 *      t=0 → order 2,  t=1 → order 3,  t=2 → order 4,  t=3 → order 6.
 * Any rational elliptic with t∈(0,4)\{1,2,3} (or t irrational-looking, impossible here)
 * therefore has INFINITE order — an exact certificate of non-discreteness.
 */

import { BigRational } from './rational.js';

function babs(x) { return x < 0n ? -x : x; }
function bgcd(a, b) {
    a = babs(a); b = babs(b);
    while (b !== 0n) { const t = b; b = a % b; a = t; }
    return a;
}
function blcm(a, b) {
    a = babs(a); b = babs(b);
    if (a === 0n || b === 0n) return 0n;
    return (a / bgcd(a, b)) * b;
}

const R0 = new BigRational(0n), R1 = new BigRational(1n), R2 = new BigRational(2n),
    R3 = new BigRational(3n), R4 = new BigRational(4n);

export class Mat2Q {
    /** @param a,b,c,d  BigInt | number (integers). Canonicalized on construction. */
    constructor(a, b, c, d) {
        a = toBig(a); b = toBig(b); c = toBig(c); d = toBig(d);
        let g = bgcd(bgcd(a, b), bgcd(c, d));
        if (g === 0n) g = 1n;                 // guard against the zero matrix
        a /= g; b /= g; c /= g; d /= g;
        const lead = a !== 0n ? a : b !== 0n ? b : c !== 0n ? c : d;
        if (lead < 0n) { a = -a; b = -b; c = -c; d = -d; }
        this.a = a; this.b = b; this.c = c; this.d = d;
    }

    /** Build from four BigRational entries by clearing denominators. */
    static fromRationals(ra, rb, rc, rd) {
        let L = 1n;
        for (const r of [ra, rb, rc, rd]) L = blcm(L, r.den);
        if (L === 0n) L = 1n;
        return new Mat2Q(
            ra.num * (L / ra.den), rb.num * (L / rb.den),
            rc.num * (L / rc.den), rd.num * (L / rd.den)
        );
    }

    static identity() { return new Mat2Q(1n, 0n, 0n, 1n); }

    det() { return this.a * this.d - this.b * this.c; }   // BigInt
    tr() { return this.a + this.d; }                       // BigInt

    mul(o) {
        return new Mat2Q(
            this.a * o.a + this.b * o.c, this.a * o.b + this.b * o.d,
            this.c * o.a + this.d * o.c, this.c * o.b + this.d * o.d
        );
    }

    /** Inverse in PGL₂ = adjugate (no division needed up to scalar). */
    inv() { return new Mat2Q(this.d, -this.b, -this.c, this.a); }

    key() { return `${this.a},${this.b},${this.c},${this.d}`; }
    equals(o) { return this.a === o.a && this.b === o.b && this.c === o.c && this.d === o.d; }
    isIdentity() { return this.a === 1n && this.b === 0n && this.c === 0n && this.d === 1n; }

    /** The scale-invariant rational invariant t = tr²/det. */
    tInvariant() {
        const T = this.tr(), D = this.det();
        return new BigRational(T * T, D);
    }

    /**
     * Full classification of the action on ℍ². Returns:
     *   { kind, det, tr, t, orientationReversing, order|null, infiniteOrder }
     * kind ∈ identity | elliptic | parabolic | hyperbolic | reflection | glide | singular
     */
    classify() {
        const D = this.det(), T = this.tr();
        if (D === 0n) return { kind: 'singular', det: D, tr: T, t: null, orientationReversing: false };
        const t = new BigRational(T * T, D);
        if (this.isIdentity())
            return { kind: 'identity', det: D, tr: T, t, orientationReversing: false, order: 1, infiniteOrder: false };

        if (D > 0n) {
            const cmp = t.compareTo(R4);
            if (cmp < 0) {
                let order = null;
                if (t.equals(R0)) order = 2;
                else if (t.equals(R1)) order = 3;
                else if (t.equals(R2)) order = 4;
                else if (t.equals(R3)) order = 6;
                return { kind: 'elliptic', det: D, tr: T, t, orientationReversing: false, order, infiniteOrder: order === null };
            }
            if (cmp === 0) return { kind: 'parabolic', det: D, tr: T, t, orientationReversing: false, order: null, infiniteOrder: true };
            return { kind: 'hyperbolic', det: D, tr: T, t, orientationReversing: false, order: null, infiniteOrder: true };
        }
        // D < 0: orientation reversing — reflection (involution) or glide reflection.
        const inv = this.mul(this).isIdentity();
        return { kind: inv ? 'reflection' : 'glide', det: D, tr: T, t, orientationReversing: true, order: inv ? 2 : null, infiniteOrder: !inv };
    }

    // ---- Floating-point helpers (for plotting only; never used in decisions) ----

    floats() { return { a: Number(this.a), b: Number(this.b), c: Number(this.c), d: Number(this.d) }; }

    /** Isometric circle of z ↦ (az+b)/(cz+d): center −d/c, radius √|det|/|c|. null if c≈0. */
    isometricCircle() {
        const { a, b, c, d } = this.floats();
        if (Math.abs(c) < 1e-12) return null;
        const det = a * d - b * c;
        return { cx: -d / c, r: Math.sqrt(Math.abs(det)) / Math.abs(c) };
    }

    /** Real (boundary) fixed points for hyperbolic/parabolic; [] for elliptic. May contain Infinity. */
    boundaryFixedPoints() {
        const { a, b, c, d } = this.floats();
        if (Math.abs(c) < 1e-12) {
            if (Math.abs(a - d) < 1e-12) return [Infinity];
            return [b / (a - d), Infinity];
        }
        const disc = (a - d) * (a - d) + 4 * b * c;
        if (disc < 0) return [];
        const s = Math.sqrt(disc);
        return [((a - d) - s) / (2 * c), ((a - d) + s) / (2 * c)];
    }

    /** Interior fixed point in ℍ² for an elliptic element ({re,im} with im>0), or null. */
    ellipticFixedPoint() {
        const { a, b, c, d } = this.floats();
        if (Math.abs(c) < 1e-12) return null;
        const disc = (a - d) * (a - d) + 4 * b * c;     // < 0 for elliptic
        if (disc >= 0) return null;
        const im = Math.sqrt(-disc) / (2 * Math.abs(c));
        return { re: (a - d) / (2 * c), im };
    }

    toLatex() {
        return `\\begin{pmatrix} ${this.a} & ${this.b} \\\\ ${this.c} & ${this.d} \\end{pmatrix}`;
    }
    toString() { return `[[${this.a},${this.b}],[${this.c},${this.d}]]`; }
}

function toBig(x) {
    if (typeof x === 'bigint') return x;
    if (typeof x === 'number') return BigInt(Math.round(x));
    if (typeof x === 'string') return BigInt(x);
    throw new Error('Mat2Q entry must be bigint/number/string integer');
}

/** Rotation angle ψ∈[0,π] of an elliptic with invariant t: cos ψ = t/2 − 1. */
export function rotationAngleFromT(t) {
    const x = t.toNumber() / 2 - 1;
    return Math.acos(Math.max(-1, Math.min(1, x)));
}
