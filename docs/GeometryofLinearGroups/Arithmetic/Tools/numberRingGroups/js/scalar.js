// Exact ordered fields for the convex geometry of the Voronoi cones.
//   QF   — Q (BigInt fractions), for totally real and CM fields.
//   KCubic(nf) — a cubic field K ordered by its real embedding τ, for cubic fields with a complex place.
// Interface: zero, one, add, sub, mul, div, neg, sign, isZero, eq, fromBig, toNum, key, normalizeVec.
import { RI } from './ring.js';
import { bigRatio } from './nf.js';

const { Rat, R0, R1, bgcd } = RI;
const babs = (x) => (x < 0n ? -x : x);

export const QF = {
    kind: 'Q',
    zero: R0,
    one: R1,
    add: (a, b) => a.add(b),
    sub: (a, b) => a.sub(b),
    mul: (a, b) => (a.n === 0n || b.n === 0n ? R0 : a.mul(b)),
    div: (a, b) => a.div(b),
    neg: (a) => a.neg(),
    sign: (a) => a.sign(),
    isZero: (a) => a.n === 0n,
    eq: (a, b) => a.n === b.n && a.d === b.d,
    fromBig: (n) => new Rat(BigInt(n)),
    fromRat: (r) => r,
    toNum: (a) => bigRatio(a.n, a.d),
    key: (a) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`),
    tex: (a) => (a.d === 1n ? `${a.n}` : `${a.n < 0n ? '-' : ''}\\tfrac{${babs(a.n)}}{${a.d}}`),
    /** a positive multiple of v with coprime integer coordinates */
    normalizeVec(v) {
        let L = 1n;
        for (const x of v) if (x.d !== 1n) L = L / bgcd(L, x.d) * x.d;
        const w = v.map((x) => x.n * (L / x.d));
        let g = 0n;
        for (const x of w) { if (x) g = bgcd(g, x); if (g === 1n) break; }
        if (g === 0n) return v;
        return w.map((x) => new Rat(x / g));
    },
};

// ------------------------------------------------------------------ cubic fields ordered by τ
// Elements: { v: [BigInt, BigInt, BigInt], d: BigInt } meaning (v0 + v1 θ + v2 θ²)/d, θ³ = −g2θ² − g1θ − g0.
export class KCubic {
    constructor(nf) {
        this.kind = 'K';
        this.nf = nf;
        const g = nf.g;
        this.g = g;
        // θ³ and θ⁴ in the power basis
        this.t3 = [-g[0], -g[1], -g[2]];
        this.t4 = [g[2] * g[0], g[2] * g[1] - g[0], g[2] * g[2] - g[1]];
        this.tau = nf.roots[0][0];                     // the real root, a double
        this.zero = { v: [0n, 0n, 0n], d: 1n };
        this.one = { v: [1n, 0n, 0n], d: 1n };
        // an isolating rational interval for τθ, refined on demand
        this.lo = null; this.hi = null;
        // ω-coordinates → power basis: x·B with B over a common denominator
        let D = 1n; for (const row of nf.B) for (const t of row) D = D / bgcd(D, t.d) * t.d;
        this.Bnum = nf.B.map((row) => row.map((t) => t.n * (D / t.d)));
        this.Bden = D;
    }
    red(a) {
        let { v, d } = a;
        if (d < 0n) { v = v.map((x) => -x); d = -d; }
        let g = d;
        for (const x of v) { if (g === 1n) break; if (x) g = bgcd(g, x); }
        return g === 1n ? { v, d } : { v: v.map((x) => x / g), d: d / g };
    }
    fromO(x) { const n = 3, v = [0n, 0n, 0n]; for (let i = 0; i < n; i++) if (x[i]) for (let k = 0; k < n; k++) v[k] += x[i] * this.Bnum[i][k]; return this.red({ v, d: this.Bden }); }
    fromK(a) { const b = this.fromO(a.v); return this.red({ v: b.v, d: b.d * a.d }); }
    fromBig(n) { return { v: [BigInt(n), 0n, 0n], d: 1n }; }
    fromRat(r) { return this.red({ v: [r.n, 0n, 0n], d: r.d }); }
    add(a, b) { return this.red({ v: [a.v[0] * b.d + b.v[0] * a.d, a.v[1] * b.d + b.v[1] * a.d, a.v[2] * b.d + b.v[2] * a.d], d: a.d * b.d }); }
    sub(a, b) { return this.red({ v: [a.v[0] * b.d - b.v[0] * a.d, a.v[1] * b.d - b.v[1] * a.d, a.v[2] * b.d - b.v[2] * a.d], d: a.d * b.d }); }
    neg(a) { return { v: a.v.map((x) => -x), d: a.d }; }
    isZero(a) { return a.v[0] === 0n && a.v[1] === 0n && a.v[2] === 0n; }
    eq(a, b) { return a.v[0] * b.d === b.v[0] * a.d && a.v[1] * b.d === b.v[1] * a.d && a.v[2] * b.d === b.v[2] * a.d; }
    mulPoly(a, b) {
        const [a0, a1, a2] = a, [b0, b1, b2] = b;
        const c0 = a0 * b0, c1 = a0 * b1 + a1 * b0, c2 = a0 * b2 + a1 * b1 + a2 * b0, c3 = a1 * b2 + a2 * b1, c4 = a2 * b2;
        const { t3, t4 } = this;
        return [c0 + c3 * t3[0] + c4 * t4[0], c1 + c3 * t3[1] + c4 * t4[1], c2 + c3 * t3[2] + c4 * t4[2]];
    }
    mul(a, b) { if (this.isZero(a) || this.isZero(b)) return this.zero; return this.red({ v: this.mulPoly(a.v, b.v), d: a.d * b.d }); }
    inv(a) {
        // multiplication matrix of v (columns v, vθ, vθ²), inverse via the adjugate
        const c0 = a.v, c1 = this.mulPoly(c0, [0n, 1n, 0n]), c2 = this.mulPoly(c1, [0n, 1n, 0n]);
        const M = [[c0[0], c1[0], c2[0]], [c0[1], c1[1], c2[1]], [c0[2], c1[2], c2[2]]];
        const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
        if (det === 0n) throw new Error('division by zero');
        // first column of adj(M): solves M x = e0 up to det
        const x = [M[1][1] * M[2][2] - M[1][2] * M[2][1], -(M[1][0] * M[2][2] - M[1][2] * M[2][0]), M[1][0] * M[2][1] - M[1][1] * M[2][0]];
        return this.red({ v: x.map((t) => t * a.d), d: det });
    }
    div(a, b) { return this.mul(a, this.inv(b)); }
    toNum(a) { const t = this.tau; return (bigRatio(a.v[0], 1n) + bigRatio(a.v[1], 1n) * t + bigRatio(a.v[2], 1n) * t * t) / bigRatio(a.d, 1n); }
    sign(a) {
        if (this.isZero(a)) return 0;
        const t = this.tau, x0 = bigRatio(a.v[0], 1n), x1 = bigRatio(a.v[1], 1n) * t, x2 = bigRatio(a.v[2], 1n) * t * t;
        const s = x0 + x1 + x2, scale = Math.abs(x0) + Math.abs(x1) + Math.abs(x2);
        if (Number.isFinite(s) && Math.abs(s) > 1e-9 * scale) return Math.sign(s);
        return this.exactSign(a.v);
    }
    key(a) { return `${a.v[0]},${a.v[1]},${a.v[2]}/${a.d}`; }
    /** sign of p(τθ), p = v0 + v1 x + v2 x² ≠ 0, by refining an isolating interval of τθ */
    exactSign(v) {
        const g = this.g.map((x) => new Rat(x));
        const ev = (p, x) => p.reduceRight((acc, c) => acc.mul(x).add(c), R0);
        const pv = v.map((x) => new Rat(x));
        if (!this.lo) {
            const t = this.tau, w = 1e-6 * Math.max(1, Math.abs(t));
            const toRat = (x) => new Rat(BigInt(Math.round(x * 2 ** 40)), 2n ** 40n);
            this.lo = toRat(t - w); this.hi = toRat(t + w);
            if (ev(g, this.lo).sign() * ev(g, this.hi).sign() >= 0) throw new Error('internal: real root isolation');
        }
        for (let it = 0; it < 4000; it++) {
            const a = ev(pv, this.lo), b = ev(pv, this.hi);
            // p is at most quadratic: constant sign on [lo, hi] if the endpoint signs agree and the
            // vertex −v1/(2v2) is outside (or p is linear)
            if (a.sign() !== 0 && a.sign() === b.sign()) {
                if (pv[2].isZero()) return a.sign();
                const vert = pv[1].neg().div(pv[2].mul(new Rat(2n)));
                if (vert.sub(this.lo).sign() <= 0 || vert.sub(this.hi).sign() >= 0) return a.sign();
            }
            const mid = this.lo.add(this.hi).div(new Rat(2n));
            if (ev(g, mid).sign() === ev(g, this.lo).sign()) this.lo = mid; else this.hi = mid;
        }
        throw new Error('internal: exact sign did not converge');
    }
    tex(a) { return this.nf.tex(this.nf.fromPower(a.v.map((x) => new Rat(x, a.d)))); }
    /** a positive multiple of v: divide by |first nonzero coordinate| */
    normalizeVec(v) {
        const i = v.findIndex((x) => !this.isZero(x));
        if (i < 0) return v;
        let s = v[i];
        if (this.sign(s) < 0) s = this.neg(s);
        const si = this.inv(s);
        return v.map((x) => this.mul(x, si));
    }
}
