// A number field K = Q(a) and its ring of integers O, for the Voronoi computation.
//
// Elements of O are BigInt coordinate vectors in an integral basis ω_0 … ω_{n−1} (Round 2, from the
// shared ringEngine). Elements of K are { v: BigInt[], d: BigInt } (coordinates over a common
// denominator). Multiplication uses the integer structure constants of O.
//
// The field types the engine handles, and why: the cone of positive definite binary Hermitian forms
// over K⊗R needs a rational structure on which the vectors q(v) = v v* (v ∈ O²) have exact coordinates.
//   • totally real K: symmetric matrices over K (q(v) has coordinates in O),
//   • CM fields: Hermitian matrices over K for its complex conjugation c (an automorphism of K),
//   • cubic fields with one complex place: the coordinates of q(v) all lie in the real cubic field
//     τ(K) (τ the real place), using |σ(x)|² = N(x)/τ(x) and an explicit formula for Im σ(x)σ̄(y).
// Other fields with complex places would need the Galois closure.
import { RE, RI } from './ring.js';
import { leftKernel } from '../../../../PresentationCalc/js/intlin.js';
import { shortVectors } from './lattice.js';

const { Rat, R0, R1, ratInverse, ratVecMat, detInt, bgcd, blcm } = RI;
const babs = (x) => (x < 0n ? -x : x);

// ---------------------------------------------------------------- complex helpers (Number pairs)
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cabs = (a) => Math.hypot(a[0], a[1]);
export const ratNum = (r) => bigRatio(r.n, r.d);
/** n/d as a Number without overflow for large BigInts */
export function bigRatio(n, d) {
    const nb = babs(n).toString(2).length, db = babs(d).toString(2).length;
    const sh = Math.max(0, Math.max(nb, db) - 1000);
    if (!sh) return Number(n) / Number(d);
    return Number(n >> BigInt(sh)) / Number(d >> BigInt(sh));
}

/** Complex roots of a monic polynomial with BigInt coefficients (low → high), Aberth–Ehrlich + Newton. */
function polyRoots(g) {
    const n = g.length - 1;
    const c = g.map((x) => Number(x));
    const ev = (z) => { let p = [1, 0], dp = [0, 0]; for (let k = n - 1; k >= 0; k--) { dp = cadd(cmul(dp, z), p); p = cadd(cmul(p, z), [c[k], 0]); } return [p, dp]; };
    let R = 1; for (let k = 0; k < n; k++) R = Math.max(R, 1 + Math.abs(c[k]));
    let z = Array.from({ length: n }, (_, k) => { const t = 2 * Math.PI * k / n + 0.4; return [0.5 * R * Math.cos(t), 0.5 * R * Math.sin(t)]; });
    for (let it = 0; it < 2000; it++) {
        let moved = 0;
        const nz = z.map((zi, i) => {
            const [p, dp] = ev(zi);
            if (cabs(p) === 0) return zi;
            const ratio = cdiv(p, dp);
            let s = [0, 0];
            for (let j = 0; j < n; j++) if (j !== i) s = cadd(s, cdiv([1, 0], csub(zi, z[j])));
            const w = cdiv(ratio, csub([1, 0], cmul(ratio, s)));
            moved = Math.max(moved, cabs(w) / Math.max(1, cabs(zi)));
            return csub(zi, w);
        });
        z = nz;
        if (moved < 1e-15) break;
    }
    // Newton polish
    z = z.map((zi) => { for (let t = 0; t < 5; t++) { const [p, dp] = ev(zi); if (cabs(dp) === 0) break; zi = csub(zi, cdiv(p, dp)); } return zi; });
    return z;
}

export class NumberField {
    /**
     * src: a polynomial in one variable (plain text, e.g. "x^2 + 1"), irreducible over Q.
     * opts.name: TeX for the root a (default "a").
     */
    constructor(src, { name = null } = {}) {
        const field = RE.defineField(src);
        this.src = src;
        this.field = field;
        const sub = field.sub;
        this.subData = sub;
        this.n = sub.d;
        this.r1 = field.r1;
        this.r2 = field.r2;
        this.g = sub.g.map((x) => BigInt(x));               // monic min. poly of θ = c·a
        this.thetaScale = sub.thetaScale;
        this.disc = sub.disc;
        this.certified = sub.certified;
        this.name = name || 'a';
        this.F = field.F;                                    // the user's polynomial (primitive integral)
        const O = sub.O;
        this.B = O.B;                                        // ω_i in θ-power coordinates (Rat)
        this.Binv = O.Binv;
        this.C = O.C;                                        // structure constants: ω_i ω_j = Σ C[i][j][k] ω_k
        this.oneO = O.one.map((x) => BigInt(x));
        const n = this.n;
        this.tr = Array.from({ length: n }, (_, i) => { let s = 0n; for (let j = 0; j < n; j++) s += this.C[i][j][j]; return s; });
        this.places();
        this.kind = this.r2 === 0 ? 'real' : null;
        if (this.r1 === 0 && n >= 2) this.findCM();
        if (!this.kind && n === 3 && this.r1 === 1) { this.kind = 'cubic'; this.setupCubic(); }
        this.rootsOfUnity();
    }

    // ------------------------------------------------------------ O arithmetic
    zero() { return new Array(this.n).fill(0n); }
    one() { return this.oneO.slice(); }
    unit(i) { const v = this.zero(); v[i] = 1n; return v; }
    fromInt(k) { return this.oneO.map((x) => x * BigInt(k)); }
    add(x, y) { return x.map((a, i) => a + y[i]); }
    sub(x, y) { return x.map((a, i) => a - y[i]); }
    neg(x) { return x.map((a) => -a); }
    scale(x, k) { return x.map((a) => a * k); }
    isZero(x) { return x.every((a) => a === 0n); }
    eq(x, y) { return x.every((a, i) => a === y[i]); }
    isOne(x) { return this.eq(x, this.oneO); }
    key(x) { return x.join(','); }
    mul(x, y) {
        const n = this.n, z = new Array(n).fill(0n), C = this.C;
        for (let i = 0; i < n; i++) {
            const xi = x[i];
            if (!xi) continue;
            const Ci = C[i];
            for (let j = 0; j < n; j++) {
                const yj = y[j];
                if (!yj) continue;
                const c = Ci[j], p = xi * yj;
                for (let k = 0; k < n; k++) if (c[k]) z[k] += p * c[k];
            }
        }
        return z;
    }
    pow(x, e) { let r = this.one(), b = x; while (e > 0) { if (e & 1) r = this.mul(r, b); b = this.mul(b, b); e >>= 1; } return r; }
    /** rows: coordinates of x·ω_j, so that (x·y) = y·M */
    multMatrix(x) { return Array.from({ length: this.n }, (_, j) => this.mul(x, this.unit(j))); }
    norm(x) { return detInt(this.multMatrix(x)); }
    trace(x) { let s = 0n; for (let i = 0; i < this.n; i++) s += x[i] * this.tr[i]; return s; }
    /** x⁻¹ ∈ K as { v, d } */
    inv(x) {
        const M = this.multMatrix(x).map((r) => r.map((t) => new Rat(t)));
        const y = ratVecMat(this.oneO, ratInverse(M));
        return kNorm(y);
    }
    /** x / y for x, y ∈ O: an element of O, or null */
    divExact(x, y) {
        const q = this.kmul({ v: x, d: 1n }, this.inv(y));
        return q.d === 1n ? q.v : null;
    }
    isUnit(x) { return babs(this.norm(x)) === 1n; }

    // ------------------------------------------------------------ K arithmetic
    kmul(a, b) { return kReduce({ v: this.mul(a.v, b.v), d: a.d * b.d }); }
    kadd(a, b) { return kReduce({ v: a.v.map((x, i) => x * b.d + b.v[i] * a.d), d: a.d * b.d }); }
    ksub(a, b) { return kReduce({ v: a.v.map((x, i) => x * b.d - b.v[i] * a.d), d: a.d * b.d }); }
    kO(x) { return { v: x.slice(), d: 1n }; }
    /** θ-power coordinates (Rat) of an O element or K element */
    toPower(x) {
        const k = x.v ? x : { v: x, d: 1n };
        const p = ratVecMat(k.v, this.B);
        return k.d === 1n ? p : p.map((t) => t.div(new Rat(k.d)));
    }
    fromPower(p) { return kNorm(ratVecMat(p, this.Binv)); }

    // ------------------------------------------------------------ embeddings
    places() {
        const n = this.n;
        const roots = polyRoots(this.g);
        const real = roots.filter((z) => Math.abs(z[1]) < 1e-9 * Math.max(1, cabs(z))).map((z) => [z[0], 0]).sort((a, b) => a[0] - b[0]);
        const cx = roots.filter((z) => z[1] > 1e-9 * Math.max(1, cabs(z))).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (real.length !== this.r1 || cx.length !== this.r2) throw new Error('internal: root finding disagrees with the signature');
        this.roots = real.concat(cx);                         // one per place
        this.allRoots = real.concat(cx, cx.map((z) => [z[0], -z[1]]));
        const evalAt = (z) => this.B.map((row) => { let s = [0, 0], p = [1, 0]; for (let k = 0; k < n; k++) { s = cadd(s, [ratNum(row[k]) * p[0], ratNum(row[k]) * p[1]]); p = cmul(p, z); } return s; });
        this.omegaAt = this.roots.map(evalAt);                // omegaAt[place][i] = σ(ω_i)
        this.omegaAll = this.allRoots.map(evalAt);
    }
    /** σ(x) at each place (complex pairs), x ∈ O or K */
    embed(x) {
        const k = x.v ? x : { v: x, d: 1n };
        const d = 1 / bigRatio(k.d, 1n);
        return this.omegaAt.map((w) => { let s = [0, 0]; for (let i = 0; i < this.n; i++) if (k.v[i]) { const c = bigRatio(k.v[i], 1n); s = cadd(s, [c * w[i][0], c * w[i][1]]); } return [s[0] * d, s[1] * d]; });
    }
    /** log|σ(x)| at each place (doubled at complex places) */
    logEmbed(x) { return this.embed(x).map((z, j) => (j < this.r1 ? 1 : 2) * Math.log(cabs(z))); }

    // ------------------------------------------------------------ CM structure
    findCM() {
        const n = this.n;
        // c(θ) has coordinates x with Σ_i x_i σ(ω_i) = conj σ(θ) at every embedding
        const thetaO = this.fromPower([R0, R1].concat(new Array(Math.max(0, n - 2)).fill(R0)).slice(0, n));
        if (thetaO.d !== 1n) return;
        const A = this.omegaAll.map((row, j) => row.map((w) => w.slice()).concat([[this.allRoots[j][0], -this.allRoots[j][1]]]));
        // complex Gaussian elimination
        for (let col = 0; col < n; col++) {
            let piv = col; for (let r = col + 1; r < n; r++) if (cabs(A[r][col]) > cabs(A[piv][col])) piv = r;
            [A[col], A[piv]] = [A[piv], A[col]];
            if (cabs(A[col][col]) < 1e-12) return;
            for (let r = 0; r < n; r++) {
                if (r === col) continue;
                const f = cdiv(A[r][col], A[col][col]);
                for (let c2 = col; c2 <= n; c2++) A[r][c2] = csub(A[r][c2], cmul(f, A[col][c2]));
            }
        }
        const x = A.map((row, i) => cdiv(row[n], row[i]));
        if (x.some((z) => Math.abs(z[1]) > 1e-6 || Math.abs(z[0] - Math.round(z[0])) > 1e-6)) return;
        const ct = x.map((z) => BigInt(Math.round(z[0])));
        // exact checks: g(cθ) = 0, cθ ≠ θ, c(cθ) = θ, and numerically conjugation at every embedding
        let gv = this.zero(), p = this.one();
        for (let k = 0; k <= n; k++) { gv = this.add(gv, this.scale(p, this.g[k])); p = this.mul(p, ct); }
        if (!this.isZero(gv) || this.eq(ct, thetaO.v)) return;
        const ev = this.omegaAll.map((w, j) => { let s = [0, 0]; ct.forEach((t, i) => { s = cadd(s, [Number(t) * w[i][0], Number(t) * w[i][1]]); }); return cabs(csub(s, [this.allRoots[j][0], -this.allRoots[j][1]])); });
        if (Math.max(...ev) > 1e-6 * Math.max(1, ...this.allRoots.map(cabs))) return;
        // c on the integral basis: c(ω_i) = Σ_k B[i][k] (cθ)^k
        const pows = [this.one()];
        for (let k = 1; k < n; k++) pows.push(this.mul(pows[k - 1], ct));
        const Cc = this.B.map((row) => {
            let acc = { v: this.zero(), d: 1n };
            row.forEach((r, k) => { if (!r.isZero()) acc = this.kadd(acc, { v: this.scale(pows[k], r.n), d: r.d }); });
            if (acc.d !== 1n) throw new Error('internal: conjugation does not preserve O');
            return acc.v;
        });
        this.kind = 'cm';
        this.Cc = Cc;
        this.conjTheta = ct;
        // O⁺ = { x : c(x) = x }: the left kernel of (Cc − I)
        const M = Cc.map((r, i) => r.map((t, j) => t - (i === j ? 1n : 0n)));
        const Kb = leftKernel(M);
        if (Kb.length * 2 !== n) throw new Error('internal: the maximal real subfield has the wrong degree');
        this.Oplus = Kb;
        this.m = Kb.length;
        this.oplusPivots = Kb.map((r) => r.findIndex((t) => t !== 0n));
    }
    conj(x) {
        if (this.kind !== 'cm') return x.slice();
        const n = this.n, z = new Array(n).fill(0n);
        for (let i = 0; i < n; i++) if (x[i]) { const r = this.Cc[i]; for (let j = 0; j < n; j++) if (r[j]) z[j] += x[i] * r[j]; }
        return z;
    }
    /** coordinates of x ∈ O⁺ in the basis Oplus (exact; throws if x ∉ O⁺) */
    toOplus(x) {
        const y = [], r = x.slice();
        this.Oplus.forEach((row, k) => {
            const p = this.oplusPivots[k];
            if (r[p] % row[p] !== 0n) throw new Error('internal: not in O⁺');
            const t = r[p] / row[p];
            y.push(t);
            if (t) for (let j = 0; j < this.n; j++) r[j] -= t * row[j];
        });
        if (r.some((t) => t !== 0n)) throw new Error('internal: not in O⁺');
        return y;
    }

    // ------------------------------------------------------------ mixed cubic fields
    setupCubic() {
        const n = 3, g = this.g;
        // x^# = N(x)/x is a quadratic map O → O: x^# = Σ_{i≤j} x_i x_j A[i][j]
        const adjOf = (x) => { const M = this.multMatrix(x).map((r) => r.map((t) => new Rat(t))); const N = detInt(this.multMatrix(x)); return ratVecMat(this.oneO, ratInverse(M)).map((t) => { const u = t.mul(new Rat(N)); if (!u.isInt()) throw new Error('internal: adjugate'); return u.n; }); };
        const sharp = (x) => (this.isZero(x) ? this.zero() : adjOf(x));
        this.sharpCoef = Array.from({ length: n }, () => new Array(n).fill(null));
        for (let i = 0; i < n; i++) this.sharpCoef[i][i] = sharp(this.unit(i));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const s = sharp(this.add(this.unit(i), this.unit(j)));
            this.sharpCoef[i][j] = this.sub(this.sub(s, this.sharpCoef[i][i]), this.sharpCoef[j][j]);
        }
        // S(θ^p, θ^q) for p < q: P^p h_{q−p−1}(e, P), with e = θ₂+θ₃ = −g₂ − θ and P = θ₂θ₃ = g₁ − θe
        // (θ₁ = τθ real, θ₂,θ₃ complex); then Im σ(x)σ̄(y) = −Im(σθ)·τ(S(x, y)).
        const th = { v: this.fromPower([R0, R1, R0]).v, d: this.fromPower([R0, R1, R0]).d };
        const kconst = (k) => ({ v: this.scale(this.oneO, BigInt(k)), d: 1n });
        const e = this.ksub(kconst(-g[2]), th);
        const P = this.ksub(kconst(g[1]), this.kmul(th, e));
        const h = [kconst(1), e];
        h.push(this.ksub(this.kmul(e, h[1]), this.kmul(P, h[0])));
        const Ppow = [kconst(1), P];
        const Smon = (p, q) => {
            if (p === q) return kconst(0);
            if (p > q) { const t = Smon(q, p); return { v: this.neg(t.v), d: t.d }; }
            return this.kmul(Ppow[p], h[q - p - 1]);
        };
        // bilinear extension to the integral basis: ω_i = Σ_p B[i][p] θ^p
        this.Scoef = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
            let acc = kconst(0);
            for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) {
                const c = this.B[i][p].mul(this.B[j][q]);
                if (c.isZero()) continue;
                const t = Smon(p, q);
                acc = this.kadd(acc, kReduce({ v: this.scale(t.v, c.n), d: t.d * c.d }));
            }
            return acc;
        }));
        this.iota = this.roots[1][1];                          // Im σθ
    }
    /** x^# = N(x)/x (cubic fields) */
    sharp(x) {
        const n = 3, z = this.zero();
        for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const t = x[i] * x[j]; if (t) { const c = this.sharpCoef[i][j]; for (let k = 0; k < n; k++) z[k] += t * c[k]; } }
        return z;
    }
    /** B(x, y) = (x+y)^# − x^# − y^#, with τB(x, y) = 2 Re σ(x)σ̄(y) */
    sharpPair(x, y) {
        const n = 3, z = this.zero();
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const t = x[i] * y[j];
            if (!t) continue;
            if (i === j) { const c = this.sharpCoef[i][i]; for (let k = 0; k < n; k++) z[k] += 2n * t * c[k]; }
            else { const c = this.sharpCoef[Math.min(i, j)][Math.max(i, j)]; for (let k = 0; k < n; k++) z[k] += t * c[k]; }
        }
        return z;
    }
    /** S(x, y) ∈ K with Im σ(x)σ̄(y) = −Im(σθ)·τ(S(x, y)) (cubic fields) */
    Spair(x, y) {
        let acc = { v: this.zero(), d: 1n };
        for (let i = 0; i < 3; i++) if (x[i]) for (let j = 0; j < 3; j++) if (y[j] && i !== j) {
            const t = this.Scoef[i][j];
            acc = this.kadd(acc, { v: this.scale(t.v, x[i] * y[j]), d: t.d });
        }
        return acc;
    }

    // ------------------------------------------------------------ roots of unity
    rootsOfUnity() {
        const n = this.n;
        if (this.r1 > 0 || this.kind !== 'cm') {
            this.mu = [this.one(), this.neg(this.one())];
            this.zeta = this.neg(this.one());
            this.w = 2;
            return;
        }
        // x ∈ O with Tr(x x̄) = n are exactly the roots of unity
        const T = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Number(this.trace(this.mul(this.unit(i), this.conj(this.unit(j)))))));
        const sv = shortVectors(T, n);
        const found = [];
        for (const x of sv) if (this.trace(this.mul(x, this.conj(x))) === BigInt(n)) { found.push(x); found.push(this.neg(x)); }
        const order = (x) => { let p = x, k = 1; while (!this.isOne(p)) { p = this.mul(p, x); k++; if (k > 1000) throw new Error('internal: root of unity'); } return k; };
        this.w = found.length;
        this.zeta = found.find((x) => order(x) === this.w);
        if (!this.zeta) throw new Error('internal: no generator of the roots of unity');
        this.mu = [this.one()];
        for (let k = 1; k < this.w; k++) this.mu.push(this.mul(this.mu[k - 1], this.zeta));
    }

    // ------------------------------------------------------------ TeX
    /** a-coordinates (Rat) of x ∈ O (BigInt[]) or K ({v, d}) */
    toA(x) {
        const k = x.v ? x : { v: x, d: 1n };
        const a = RI.toA(this.subData, k.v.map((t) => new Rat(t)));
        return k.d === 1n ? a : a.map((t) => t.div(new Rat(k.d)));
    }
    tex(x) { return elemTexA(this.toA(x), this.name); }
    polyTex() { return RI.polyTex(this.F.map((t) => new Rat(BigInt(t))), 'x'); }
}

// ---------------------------------------------------------------- K-element helpers
export function kReduce(a) {
    let g = a.d;
    for (const x of a.v) { if (g === 1n) break; g = bgcd(g, x); }
    if (a.d < 0n) g = -g;
    return g === 1n ? a : { v: a.v.map((x) => x / g), d: a.d / g };
}
function kNorm(ratVec) {
    let d = 1n; for (const x of ratVec) d = blcm(d, x.d);
    return { v: ratVec.map((x) => x.n * (d / x.d)), d };
}

/** TeX for an element given by a-coordinates, ascending powers of the named root */
export function elemTexA(v, name = 'a') {
    let den = 1n;
    for (const x of v) den = blcm(den, x.d);
    const nums = v.map((x) => x.n * (den / x.d));
    const isRadical = /\\sqrt/.test(name);
    const powName = (i) => (i === 1 ? name : isRadical ? `\\left(${name}\\right)^{${i}}` : `${name}^{${i}}`);
    const parts = [];
    nums.forEach((c, i) => {
        if (!c) return;
        const a = babs(c), mono = i === 0 ? '' : powName(i);
        parts.push({ neg: c < 0n, s: i === 0 ? `${a}` : (a === 1n ? mono : `${a}${mono}`) });
    });
    if (!parts.length) return '0';
    const num = parts.map((t, k) => (k === 0 ? (t.neg ? '-' : '') + t.s : (t.neg ? ' - ' : ' + ') + t.s)).join('');
    if (den === 1n) return num;
    if (parts.length === 1) return (parts[0].neg ? '-' : '') + `\\tfrac{${parts[0].s}}{${den}}`;
    return `\\tfrac{${num}}{${den}}`;
}

export { Rat, R0, R1 };
