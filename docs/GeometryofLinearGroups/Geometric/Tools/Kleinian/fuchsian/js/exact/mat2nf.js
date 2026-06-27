/**
 * mat2nf.js — 2×2 matrices over a number field K=ℚ(α) with a fixed real embedding, in PGL₂(K).
 * Exposes the same interface as Mat2Q (mul, inv, det, tr, key, isIdentity, floats, classify),
 * so domain.js / poincare.js / geom-hyp.js work unchanged.
 *
 * classify() uses the real embedding to locate t = tr²/det in [0,4) (elliptic), and the
 * rigorous Niven/Kronecker criterion for finite order: an elliptic is finite-order iff
 * β = t−2 is an algebraic integer all of whose conjugates are real and lie in [−2,2]
 * (i.e. β = ζ+ζ⁻¹ for a root of unity ζ).
 */
import { BigRational } from './rational.js';

const Q = n => new BigRational(BigInt(n));
const reAt = (elem, em) => elem.evaluateAt(em).re;

/** β = ζ+ζ⁻¹ for a root of unity ζ  ⟺  β is a totally-real algebraic integer, all conjugates in [−2,2]. */
function isCosOfRationalAngle(beta, field) {
    if (!beta.isIntegral()) return false;
    for (const r of field.roots()) {
        const v = beta.evaluateAt(r);
        if (Math.abs(v.im) > 1e-6) return false;
        if (v.re < -2 - 1e-6 || v.re > 2 + 1e-6) return false;
    }
    return true;
}

function tDisplay(t, re) {
    return { toLatex: () => re.toFixed(5), toString: () => `${t.toString()} ≈ ${re.toFixed(5)}`, toNumber: () => re };
}

export class Mat2NF {
    constructor(field, embed, a, b, c, d) {
        this.field = field; this.embed = embed;
        this.a = a; this.b = b; this.c = c; this.d = d;   // NFElement entries (not canonicalized)
    }

    static identity(field, embed) {
        const o = field.one(), z = field.zero();
        return new Mat2NF(field, embed, o, z, z, o);
    }

    det() { return this.a.mul(this.d).sub(this.b.mul(this.c)); }
    tr() { return this.a.add(this.d); }

    mul(o) {
        return new Mat2NF(this.field, this.embed,
            this.a.mul(o.a).add(this.b.mul(o.c)), this.a.mul(o.b).add(this.b.mul(o.d)),
            this.c.mul(o.a).add(this.d.mul(o.c)), this.c.mul(o.b).add(this.d.mul(o.d)));
    }
    inv() { return new Mat2NF(this.field, this.embed, this.d, this.b.neg(), this.c.neg(), this.a); }

    isIdentity() { return this.b.isZero() && this.c.isZero() && !this.a.isZero() && this.a.equals(this.d); }

    /** Canonical PGL key: divide through by the first nonzero entry, serialize coeff vectors. */
    key() {
        const es = [this.a, this.b, this.c, this.d];
        let piv = es.find(e => !e.isZero());
        const inv = piv.inv();
        return es.map(e => e.mul(inv).coeffs.map(c => `${c.num}/${c.den}`).join(',')).join('|');
    }

    /** Real-embedding entries (for the Möbius action / geometry — scale-invariant). */
    floats() {
        return { a: reAt(this.a, this.embed), b: reAt(this.b, this.embed), c: reAt(this.c, this.embed), d: reAt(this.d, this.embed) };
    }

    classify() {
        const F = this.field, em = this.embed;
        const D = this.det(), Dre = reAt(D, em), T = this.tr();
        if (Math.abs(Dre) < 1e-12) return { kind: 'singular', t: null, orientationReversing: false };
        const t = T.mul(T).div(D), tre = reAt(t, em);
        const tdisp = tDisplay(t, tre);
        if (this.isIdentity()) return { kind: 'identity', order: 1, infiniteOrder: false, t: tdisp, orientationReversing: false };

        if (Dre > 0) {
            if (tre < 4 - 1e-9) {
                const beta = t.sub(F.fromRational(Q(2)));
                const finite = isCosOfRationalAngle(beta, F);
                const order = finite ? Math.max(2, Math.round(2 * Math.PI / Math.acos(Math.max(-1, Math.min(1, tre / 2 - 1))))) : null;
                return { kind: 'elliptic', order, infiniteOrder: !finite, t: tdisp, orientationReversing: false };
            }
            if (tre < 4 + 1e-9) return { kind: 'parabolic', order: null, infiniteOrder: true, t: tdisp, orientationReversing: false };
            return { kind: 'hyperbolic', order: null, infiniteOrder: true, t: tdisp, orientationReversing: false };
        }
        const involution = this.mul(this).isIdentity();
        return { kind: involution ? 'reflection' : 'glide', order: involution ? 2 : null, infiniteOrder: !involution, t: tdisp, orientationReversing: true };
    }

    // ---- float helpers for the renderer (mirror Mat2Q) ----
    isometricCircle() {
        const { a, b, c, d } = this.floats();
        if (Math.abs(c) < 1e-12) return null;
        const det = a * d - b * c;
        return { cx: -d / c, r: Math.sqrt(Math.abs(det)) / Math.abs(c) };
    }
    boundaryFixedPoints() {
        const { a, b, c, d } = this.floats();
        if (Math.abs(c) < 1e-12) return Math.abs(a - d) < 1e-12 ? [Infinity] : [b / (a - d), Infinity];
        const disc = (a - d) * (a - d) + 4 * b * c;
        if (disc < 0) return [];
        const s = Math.sqrt(disc);
        return [((a - d) - s) / (2 * c), ((a - d) + s) / (2 * c)];
    }
    ellipticFixedPoint() {
        const { a, b, c, d } = this.floats();
        if (Math.abs(c) < 1e-12) return null;
        const disc = (a - d) * (a - d) + 4 * b * c;
        if (disc >= 0) return null;
        return { re: (a - d) / (2 * c), im: Math.sqrt(-disc) / (2 * Math.abs(c)) };
    }
    toLatex() {
        const f = this.floats(), r = x => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(4));
        return `\\begin{pmatrix} ${r(f.a)} & ${r(f.b)} \\\\ ${r(f.c)} & ${r(f.d)} \\end{pmatrix}`;
    }
    toString() { return this.key(); }
}
