/**
 * Certificates that a group is NOT discrete.
 *
 * Poincaré's theorem (certifier.js) proves a group discrete; when the check
 * fails, that alone proves nothing. This module searches short words, and
 * the elements the domain search met, for something no discrete subgroup of
 * PSL₂(ℂ) contains:
 *
 *  1. An elliptic of infinite order. W is elliptic iff t = tr²W/det W is real
 *     with 0 ≤ t < 4; it rotates about its axis by θ with t = 4cos²(θ/2). A
 *     finite order m makes e^{iθ} a primitive m-th root of unity and a root
 *     of x² − (t − 2)x + 1, so φ(m) ≤ 2[ℚ(t):ℚ] ≤ 2[K:ℚ]. If Wᵐ ≠ 1 for every
 *     such m, the powers of W are dense in a circle of rotations.
 *
 *  2. A cusp group that is not discrete. The parabolics fixing a point ξ
 *     translate the horospheres at ξ; in a frame with ξ = ∞, P = (1 τ_P; 0 1).
 *     With N_P = 2P/tr P − 1 (nilpotent, ∝ τ_P), two parabolics at ξ have
 *     N_Q = ρ·N_P with ρ = τ_Q/τ_P in K, exactly. A discrete group translates
 *     by a lattice of rank ≤ 2, so
 *       – the ratios ρ span a ℚ-vector space of dimension ≤ 2, and
 *       – if the dimension is 2, its basis {1, ρ} has ρ ∉ ℝ (a real ρ makes
 *         ⟨P, Q⟩ ≅ ℤ² translate a line densely).
 *     An element g fixing ξ conjugates P to a parabolic translating by μτ_P,
 *     where μ ∈ K is g's multiplier at ξ: g·N_P·g⁻¹ = μ·N_P. Discreteness
 *     forces μ⁴ = 1 or μ⁶ = 1: if |μ| ≠ 1 the translations μ^{±n}τ shrink
 *     to 0, and otherwise τ·ℤ[μ] is a lattice only for those orders (the
 *     crystallographic restriction). Allowed multipliers rotate the
 *     translations, and those join the span. Two loxodromics with exactly one
 *     common fixed point enter through their commutator, parabolic there.
 *
 *  3. Jørgensen's inequality. If ⟨A, B⟩ is discrete and non-elementary then
 *     |tr²A − 4| + |tr[A,B] − 2| ≥ 1. If tr[A,B] ≠ 2 (no common fixed point)
 *     and tr A, tr B ≠ 0 (neither swaps two points), ⟨A, B⟩ is non-elementary
 *     or finite; and a finite group with |tr²A − 4| < 1 has an element of
 *     order ≥ 7, so it is cyclic or dihedral — already excluded. With A
 *     parabolic this is Shimizu's lemma: |c| ≥ 1 for B = (a b; c d) in the
 *     frame where A = (1 1; 0 1).
 *
 * The search is floating point; with an exact context { field, gens } every
 * candidate is re-checked over the number field K. Identities, parabolicity,
 * finite orders, common fixed points, ℚ-ranks and the multiplier's order are
 * exact. The inequalities (0 ≤ t < 4, Jørgensen's sum) are floating-point
 * comparisons with a margin, and realness is exact when K has complex
 * conjugation or the number is rational. A realness test that only checked
 * |Im| < 10⁻¹⁰ is not a proof: an exact certificate requires realness itself
 * to be exact. Without an exact context the result is numerical evidence,
 * not a proof.
 */
import { Matrix2x2, Complex, pslKey, distFromIdentityPSL, uhsToBall, reduceWord, invertWord } from './math.js';
import { exactFromWord, ExactMat, Frac, minimalPolynomial, polyString } from './exact.js';

const TWO_PI = 2 * Math.PI;
const MARGIN = 1e-9;          // floating-point margin on the inequalities
const CUSP_TOL = 1e-6;        // chordal distance for "the same fixed point" (screening)

// ---------------- words ----------------

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** g1²·g2⁻¹ — runs compressed to powers. */
export function wordText(w, max = 80) {
    if (!w || !w.length) return 'e';
    const parts = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const n = (j - i) * Math.sign(w[i]);
        parts.push(`g${Math.abs(w[i])}${n === 1 ? '' : String(n).split('').map(ch => SUP[ch]).join('')}`);
        i = j;
    }
    const s = parts.join('·');
    return s.length > max ? `${s.slice(0, max)}… (length ${w.length})` : s;
}

/** A word as a base for a power: g2ⁿ, but (g1·g2)ⁿ. */
const paren = (w) => (w.length > 1 && new Set(w).size > 1 ? `(${wordText(w)})` : wordText(w));
/** x^2 − 2 → x² − 2 */
const supPoly = (s) => s.replace(/\^(-?\d+)/g, (_, n) => n.split('').map(ch => SUP[ch]).join(''));

const conjugateWord = (g, w) => reduceWord([...g, ...w, ...invertWord(g)]);
const commutatorWord = (a, b) => reduceWord([...a, ...b, ...invertWord(a), ...invertWord(b)]);

// ---------------- floating point ----------------

const cabs = (z) => Math.hypot(z.re, z.im);
const FOUR = new Complex(4), TWO = new Complex(2);

function element(M, word) {
    const N = M.normalized();
    const tr = N.a.add(N.d);
    const t = tr.mul(tr);
    let type;
    if (N.anti) type = 'anti';
    else if (distFromIdentityPSL(N) < 1e-9) type = 'id';
    else if (cabs(t.sub(FOUR)) < 1e-8) type = 'par';
    else if (Math.abs(t.im) < 1e-8 * Math.max(1, cabs(t)) && t.re > -1e-8 && t.re < 4) type = 'ell';
    else type = 'lox';
    return { M: N, word, tr, t, type };
}

/** Möbius image of z ∈ ℂ ∪ {∞} (null = ∞) under an orientation-preserving M. */
function mobius(M, z) {
    const s = Math.max(cabs(M.a), cabs(M.b), cabs(M.c), cabs(M.d));
    if (z === null) return cabs(M.c) < 1e-13 * s ? null : M.a.div(M.c);
    const den = M.c.mul(z).add(M.d);
    if (cabs(den) < 1e-13 * s * Math.max(1, cabs(z))) return null;
    return M.a.mul(z).add(M.b).div(den);
}

function chordal(z, w) {
    if (z === null && w === null) return 0;
    if (z === null) return 2 / Math.sqrt(1 + w.normSq());
    if (w === null) return 2 / Math.sqrt(1 + z.normSq());
    return 2 * cabs(z.sub(w)) / Math.sqrt((1 + z.normSq()) * (1 + w.normSq()));
}

const fixesNum = (M, z) => chordal(mobius(M, z), z) < 1e-7;

function parabolicFix(M) {
    const s = Math.max(cabs(M.a), cabs(M.b), cabs(M.c), cabs(M.d));
    return cabs(M.c) < 1e-12 * s ? null : M.a.sub(M.d).div(M.c.mul(2));
}

function fixedPoints(M) {
    const s = Math.max(cabs(M.a), cabs(M.b), cabs(M.c), cabs(M.d));
    const dma = M.d.sub(M.a);
    if (cabs(M.c) < 1e-12 * s) return cabs(dma) < 1e-12 * s ? [null] : [null, M.b.div(dma)];
    const disc = Complex.sqrt(dma.mul(dma).add(M.b.mul(M.c).mul(4)));
    const c2 = M.c.mul(2);
    return [M.a.sub(M.d).add(disc).div(c2), M.a.sub(M.d).sub(disc).div(c2)];
}

/** A boundary point as ball coordinates [x, y, z] (for highlighting). */
const ballPoint = (z) => {
    if (z === null) return [0, 0, 1];
    const v = uhsToBall({ x: z.re, y: z.im, t: 0 });
    return [v.x, v.y, v.z];
};

/** N = 2M/tr M − 1 for a normalized parabolic, as [n11, n12, n21, n22]. */
function nhatNum(M) {
    const s = M.a.add(M.d).div(2);
    return [M.a.sub(s).div(s), M.b.div(s), M.c.div(s), M.d.sub(s).div(s)];
}

const argmaxAbs = (v) => v.reduce((k, x, i) => (cabs(x) > cabs(v[k]) ? i : k), 0);

function multiplierNum(g, N, k) {
    const X = g.mul(new Matrix2x2(N[0], N[1], N[2], N[3])).mul(g.inv());
    return [X.a, X.b, X.c, X.d][k].div(N[k]);
}

/** p/q with q ≤ maxDen within tol of x, from the continued fraction; or null. */
function nearRational(x, maxDen = 1000, tol = 1e-9) {
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
    for (let it = 0; it < 40; it++) {
        const a = Math.floor(y);
        [h0, h1] = [h1, a * h1 + h0];
        [k0, k1] = [k1, a * k1 + k0];
        if (k1 > maxDen) return null;
        if (Math.abs(x - h1 / k1) <= tol * Math.max(1, Math.abs(x))) return { p: h1, q: k1 };
        const f = y - a;
        if (f < 1e-15) return null;
        y = 1 / f;
    }
    return null;
}

const fmtNum = (v, digits = 8) => {
    const r = +v.re.toPrecision(digits), i = +v.im.toPrecision(digits);
    if (Math.abs(v.im) <= 1e-12 * Math.max(1, Math.abs(v.re))) return `${r}`;
    if (Math.abs(v.re) <= 1e-12 * Math.abs(v.im)) return `${i}i`;
    return `${r} ${i < 0 ? '−' : '+'} ${Math.abs(i)}i`;
};
const piMultiple = (theta) => `${+(theta / Math.PI).toPrecision(8)}π`;
/** "= 4" or "≈ 1.2 + 0.3i" (show() already prefixes approximations with ≈). */
const eq = (s) => (s.startsWith('≈') ? s : `= ${s}`);

// ---------------- the pool of elements ----------------

/**
 * Distinct orientation-preserving non-identity elements: reduced words by
 * length (breadth first, up to `cap`), then the extra words. Sorted by length.
 */
function enumerate(gens, { maxLen, cap, words }) {
    const letters = [];
    gens.forEach((g, i) => {
        letters.push({ l: i + 1, M: g });
        letters.push({ l: -(i + 1), M: g.inv() });
    });
    const seen = new Set([pslKey(Matrix2x2.identity())]);
    const pool = [];
    const add = (M, word) => {
        const el = element(M, word);
        const key = pslKey(el.M);
        if (seen.has(key)) return null;
        seen.add(key);
        pool.push(el);
        return el;
    };
    let layer = [{ M: Matrix2x2.identity(), word: [] }];
    for (let len = 1; len <= maxLen && layer.length && pool.length < cap; len++) {
        const next = [];
        outer: for (const e of layer) {
            for (const L of letters) {
                if (e.word.length && e.word[e.word.length - 1] === -L.l) continue;
                const el = add(e.M.mul(L.M), [...e.word, L.l]);
                if (el) next.push(el);
                if (pool.length >= cap) break outer;
            }
        }
        layer = next;
    }
    for (const w0 of words) {
        const w = reduceWord(w0 || []);
        if (!w.length || w.length > 64 || w.some(l => !gens[Math.abs(l) - 1])) continue;
        let M = Matrix2x2.identity();
        for (const l of w) M = M.mul(l > 0 ? gens[l - 1] : gens[-l - 1].inv());
        add(M, w);
    }
    return pool.filter(e => e.type !== 'id' && e.type !== 'anti')
        .sort((a, b) => a.word.length - b.word.length);
}

/**
 * One pass over pairs: Jørgensen candidates (numerically), and pairs with a
 * common fixed point whose commutator is parabolic.
 */
function pairPass(pool, deadline) {
    const jcands = [], commuting = [];
    const n = pool.length;
    for (let j = 1; j < n; j++) {
        if ((j & 63) === 0 && Date.now() > deadline) break;
        const B = pool[j], Bm = B.M;
        for (let i = 0; i < j; i++) {
            const A = pool[i], Am = A.M;
            const trAB = Am.a.mul(Bm.a).add(Am.b.mul(Bm.c)).add(Am.c.mul(Bm.b)).add(Am.d.mul(Bm.d));
            const prod = A.tr.mul(B.tr).mul(trAB);
            // Fricke: tr[A,B] = tr²A + tr²B + tr²AB − trA·trB·trAB − 2
            const kappa = A.t.add(B.t).add(trAB.mul(trAB)).sub(prod).sub(TWO);
            const k2 = cabs(kappa.sub(TWO));
            const scale = 1 + cabs(A.t) + cabs(B.t) + trAB.normSq() + cabs(prod);
            if (k2 < 1e-10 * scale) {
                if (commuting.length < 40 && (A.type === 'lox' || B.type === 'lox') && A.type !== 'par' && B.type !== 'par') {
                    commuting.push([A, B]);
                }
                continue;
            }
            if (jcands.length >= 40) continue;
            const jA = cabs(A.t.sub(FOUR)) + k2, jB = cabs(B.t.sub(FOUR)) + k2;
            if (Math.min(jA, jB) >= 1 - 1e-6 - 1e-12 * scale) continue;
            if (cabs(A.tr) < 1e-9 || cabs(B.tr) < 1e-9) continue;
            jcands.push(jA <= jB ? [A, B] : [B, A]);
        }
    }
    return { jcands, commuting };
}

// ---------------- exact side ----------------

/** Gaussian elimination over ℚ on coordinate vectors (padded: a tower that grows keeps old coordinates as a prefix). */
class QSpan {
    constructor() { this.rows = []; }
    insert(coords) {
        const F0 = new Frac(0n);
        let r = coords.slice();
        for (const row of this.rows) {
            const n = Math.max(r.length, row.v.length);
            while (r.length < n) r.push(F0);
            const c = r[row.pivot];
            if (c.isZero()) continue;
            const f = c.div(row.v[row.pivot]);
            for (let i = 0; i < row.v.length; i++) if (!row.v[i].isZero()) r[i] = r[i].sub(row.v[i].mul(f));
        }
        const pivot = r.findIndex(x => !x.isZero());
        if (pivot < 0) return false;
        this.rows.push({ v: r, pivot });
        return true;
    }
    get dim() { return this.rows.length; }
}

/** m with φ(m) ≤ bound (φ(m) ≥ √(m/2), so m ≤ 2·bound² suffices). */
function ordersUpTo(bound) {
    const phi = (m) => {
        let r = m, x = m;
        for (let p = 2; p * p <= x; p++) {
            if (x % p) continue;
            while (x % p === 0) x /= p;
            r -= r / p;
        }
        if (x > 1) r -= r / x;
        return r;
    };
    const out = [];
    for (let m = 2; m <= 2 * bound * bound + 2; m++) if (phi(m) <= bound) out.push(m);
    return out;
}

class Exact {
    constructor(ctx, { allowConj, deadline, maxEvals }) {
        this.K = ctx.field;
        this.gens = ctx.gens;
        this.deg0 = this.K.deg;
        this.allowConj = allowConj;
        this.triedConj = false;
        this.deadline = deadline;
        this.maxEvals = maxEvals;
        this.evals = 0;                 // exact matrix products so far
        this.one = this.K.one();
        this.two = this.K.fromFrac(new Frac(2n));
        this.four = this.K.fromFrac(new Frac(4n));
        this._orders = null;
        this.cache = new Map([['', ExactMat.identity(this.K)]]);
        this.letters = new Map();
    }
    over() { return this.evals >= this.maxEvals || Date.now() > this.deadline; }
    get orders() { return this._orders || (this._orders = ordersUpTo(2 * this.deg0)); }
    letter(l) {
        let L = this.letters.get(l);
        if (!L) {
            L = l > 0 ? this.gens[l - 1] : exactFromWord([l], this.gens, this.K);
            this.letters.set(l, L);
        }
        return L;
    }
    /**
     * The exact matrix of a word, extending the longest cached prefix: the
     * pool is breadth first, so a new word usually costs one product.
     */
    wordMat(w) {
        const key = w.join(',');
        if (this.cache.has(key)) return this.cache.get(key);
        let k = w.length - 1;
        while (k > 0 && !this.cache.has(w.slice(0, k).join(','))) k--;
        let M = this.cache.get(w.slice(0, k).join(','));
        for (let i = k; i < w.length; i++) {
            M = M.mul(this.letter(w[i]));
            this.evals++;
            this.cache.set(w.slice(0, i + 1).join(','), M);
        }
        return M;
    }
    /** The exact matrix of a pool element (cached), or null. */
    of(el) {
        if (el.E !== undefined) return el.E;
        if (this.over()) return null;
        try { el.E = this.wordMat(el.word); } catch (e) { el.E = null; }
        return el.E;
    }
    tr(E) { return E.a.add(E.d); }
    /** tr²/det — the projective invariant. */
    tsq(E) { const t = this.tr(E); return t.mul(t).div(E.det()); }
    isParabolic(E) { return !E.isProjectiveIdentity() && this.tsq(E).equals(this.four); }
    isRational(x) {
        if (typeof x.rational === 'function') return x.rational() !== null;
        return x.c.slice(1).every(c => c.isZero());
    }
    realAt(x) {
        if (this.isRational(x)) return { real: true, exact: true };
        const K = this.K;
        // Any field the reader will build (degree ≤ 32). ensureConj throws
        // rather than searching when adjoining the conjugate would be huge.
        if (!K.hasConj() && this.allowConj && !this.triedConj && typeof K.ensureConj === 'function' && K.deg <= 32) {
            this.triedConj = true;
            try { K.ensureConj(); } catch (e) { /* too large: decide numerically */ }
        }
        if (K.hasConj()) {
            try { return { real: x.conj().equals(x), exact: true }; } catch (e) { /* numerically below */ }
        }
        const v = x.embed();
        return { real: Math.abs(v.im) <= 1e-10 * Math.max(1, Math.hypot(v.re, v.im)), exact: false };
    }
    /** N = 2E/tr E − 1 of a parabolic. */
    nhat(E) {
        const s = this.tr(E).div(this.two);
        const si = s.inv();
        return [E.a.sub(s).mul(si), E.b.mul(si), E.c.mul(si), E.d.sub(s).mul(si)];
    }
    /** ρ with N2 = ρ·N1, or null when they are not proportional (different fixed points). */
    ratio(N1, N2) {
        const k = N1.findIndex(x => !x.isZero());
        const rho = N2[k].div(N1[k]);
        return N1.every((x, i) => N2[i].equals(rho.mul(x))) ? rho : null;
    }
    /** μ with g·N·g⁻¹ = μ·N (g fixes the cusp of N), or null. */
    multiplier(Eg, N) {
        const Nm = new ExactMat(N[0], N[1], N[2], N[3]);
        const X = Eg.mul(Nm).mul(Eg.adj());
        const di = Eg.det().inv();
        return this.ratio(N, [X.a, X.b, X.c, X.d].map(x => x.mul(di)));
    }
    coords(x) {
        if (typeof x.rational === 'function') return x.c.slice();
        const out = x.c.slice();
        while (out.length < this.K.deg) out.push(new Frac(0n));
        return out;
    }
    show(x) {
        if (this.isRational(x)) return typeof x.rational === 'function' ? x.rational().toString() : (x.c[0] || new Frac(0n)).toString();
        return `≈ ${fmtNum(x.embed())}`;
    }
    minpolyText(x) {
        try { return supPoly(polyString(minimalPolynomial(x))); } catch (e) { return null; }
    }
}

// ---------------- 1. elliptics of infinite order ----------------

const rotationAngle = (t) => 2 * Math.acos(Math.min(1, Math.sqrt(Math.max(0, t)) / 2));

function ellipticTest(pool, X) {
    for (const el of pool) {
        if (el.type !== 'ell') continue;
        if (X) {
            if (X.over()) return null;
            const E = X.of(el);
            if (!E || E.isProjectiveIdentity()) continue;
            const t = X.tsq(E);
            if (t.equals(X.four)) continue;
            const tv = t.embed();
            if (!(tv.re > MARGIN && tv.re < 4 - MARGIN)) {
                // t = 0 is a half-turn; anything else out of [0, 4) is not elliptic
                if (!t.isZero()) continue;
            }
            const real = X.realAt(t);
            // |Im| < 10⁻¹⁰ is not a proof that t is real: a loxodromic whose
            // trace invariant sits that close to ℝ would be called an elliptic
            // of infinite order, and ⟨it⟩ is discrete.
            if (!real.real || !real.exact) continue;
            const theta = rotationAngle(tv.re);
            let order = null;
            for (const m of X.orders) {
                const k = m * theta / TWO_PI;
                if (Math.abs(k - Math.round(k)) > 1e-6) continue;
                if (E.pow(m).isProjectiveIdentity()) { order = m; break; }
            }
            if (order) continue;
            const W = wordText(el.word), Wp = paren(el.word), bound = 2 * X.deg0;
            const tText = X.isRational(t) ? `= ${X.show(t)}` : `${X.show(t)}${X.minpolyText(t) ? ` (a root of ${X.minpolyText(t)})` : ''}`;
            return {
                kind: 'elliptic', exact: true, words: [el.word],
                headline: `${W} is an elliptic of infinite order`,
                lines: [
                    `${W} is elliptic: tr²/det ${tText} is real and lies in (0, 4), so it rotates about its axis by θ ≈ ${piMultiple(theta)}.`,
                    `A finite order m would make e^{iθ} a primitive m-th root of unity of degree ≤ 2 over ℚ(tr²/det), so φ(m) ≤ ${bound}; no such m has ${Wp}ᵐ = 1 (checked exactly). ${W} has infinite order.`,
                    `Its powers rotate by multiples of θ, which are dense in the circle and accumulate at the identity: the group is not discrete.`,
                ],
                points: fixedPoints(el.M).map(ballPoint), angle: theta,
            };
        }
        const theta = rotationAngle(el.t.re);
        if (nearRational(theta / TWO_PI, 10000)) continue;
        const W = wordText(el.word);
        return {
            kind: 'elliptic', exact: false, words: [el.word],
            headline: `${W} looks like an elliptic of infinite order`,
            lines: [
                `${W} is elliptic (numerically: tr² ≈ ${fmtNum(el.t)}), rotating by θ ≈ ${piMultiple(theta)}.`,
                `θ/2π is not within 10⁻⁹ of any fraction with denominator ≤ 10000, so ${W} appears to have infinite order — its powers would accumulate at the identity.`,
                `The entries are floating point, so this is numerical evidence, not a proof.`,
            ],
            points: fixedPoints(el.M).map(ballPoint), angle: theta,
        };
    }
    return null;
}

// ---------------- 2. cusp groups ----------------

function multiplierLines(pWord, gWord, mu, muNum, orderText) {
    const P = wordText(pWord), pp = paren(pWord), g = wordText(gWord), gp = paren(gWord);
    const r = cabs(muNum);
    if (Math.abs(r - 1) > 1e-9) {
        return {
            headline: `${g} is loxodromic and fixes the cusp of the parabolic ${P}`,
            lines: [
                `${g} fixes the fixed point of the parabolic ${P} and multiplies its translation by μ ${eq(mu)}, |μ| ≈ ${+r.toPrecision(8)} ≠ 1.`,
                `The parabolics ${gp}ⁿ·${pp}·${gp}⁻ⁿ translate by μⁿτ, which shrinks to 0 as n → ${r < 1 ? '+' : '−'}∞: non-trivial elements converging to the identity, so the group is not discrete.`,
            ],
        };
    }
    return {
        headline: `${g} rotates about an axis ending at the cusp of ${P} by an angle no lattice allows`,
        lines: [
            `${g} fixes the fixed point of the parabolic ${P} and rotates about it by arg μ ≈ ${piMultiple(Math.atan2(muNum.im, muNum.re))} (μ ${eq(mu)}, ${orderText}).`,
            `The conjugates ${gp}ⁿ·${pp}·${gp}⁻ⁿ translate by μⁿτ, and τ·ℤ[μ] is a lattice only when μ has order 1, 2, 3, 4 or 6 (the crystallographic restriction): here the translations are dense, so the group is not discrete.`,
        ],
    };
}

function exactCusp(c, pool, X) {
    let base = null, N1 = null;
    for (const p of c.pars) {
        if (X.over()) return null;
        const E = X.of(p);
        if (E && X.isParabolic(E)) { base = p; N1 = X.nhat(E); break; }
    }
    if (!base) return null;
    const P = wordText(base.word);
    const points = [ballPoint(c.fix)];

    // Elements fixing the cusp: their multipliers must be 4th or 6th roots of unity.
    const mults = [];
    for (const g of pool) {
        if (g.type === 'par' || !fixesNum(g.M, c.fix)) continue;
        const Eg = X.of(g);
        if (!Eg) continue;
        const mu = X.multiplier(Eg, N1);
        if (!mu || mu.equals(X.one)) continue;
        const m2 = mu.mul(mu), m4 = m2.mul(m2);
        if (m4.equals(X.one) || m4.mul(m2).equals(X.one)) { mults.push({ word: g.word, mu }); continue; }
        let order = null;
        for (const m of X.orders) if (mu.pow(m).equals(X.one)) { order = m; break; }
        const { headline, lines } = multiplierLines(base.word, g.word, X.show(mu), mu.embed(),
            order ? `a root of unity of order ${order}` : 'not a root of unity');
        return {
            kind: 'cusp', exact: true, words: [base.word, g.word], headline,
            lines: [lines[0], 'The common fixed point and μ are exact (g·N·g⁻¹ = μ·N over K, for the nilpotent part N of the parabolic), and so are μ⁴ ≠ 1 and μ⁶ ≠ 1.', lines[1]],
            points,
        };
    }

    // The translations as a ℚ-space, closed under the allowed multipliers:
    // parabolics in order of length until the rank reaches 3.
    const span = new QSpan();
    const basis = [];
    const push = (t) => {
        if (!span.insert(X.coords(t.rho))) return false;
        basis.push(t);
        return true;
    };
    const close = () => {
        for (let changed = true; changed && basis.length < 3;) {
            changed = false;
            for (const m of mults) {
                for (const b of basis.slice()) {
                    if (basis.length >= 3) return;
                    if (push({ word: conjugateWord(m.word, b.word), rho: m.mu.mul(b.rho) })) changed = true;
                }
            }
        }
    };
    push({ word: base.word, rho: X.one });
    close();
    for (const p of c.pars) {
        if (basis.length >= 3 || X.over()) break;
        if (p === base) continue;
        const E = X.of(p);
        if (!E || !X.isParabolic(E)) continue;
        const rho = X.ratio(N1, X.nhat(E));
        if (rho && push({ word: p.word, rho })) close();
    }
    if (basis.length >= 3) {
        const W = basis.slice(0, 3).map(b => wordText(b.word));
        return {
            kind: 'cusp', exact: true, words: basis.slice(0, 3).map(b => b.word),
            headline: `${W.join(', ')} are parabolics at one cusp with translations independent over ℚ`,
            lines: [
                `${W.join(', ')} are parabolic with a common fixed point (exact: their nilpotent parts are proportional over K).`,
                `In the frame where that point is ∞ they translate by τ, ρ₂τ, ρ₃τ with 1, ρ₂ ${eq(X.show(basis[1].rho))}, ρ₃ ${eq(X.show(basis[2].rho))} linearly independent over ℚ (exact).`,
                `So they generate a free abelian group of rank 3 of translations of ℂ ≅ ℝ², which is never discrete: the group is not discrete.`,
            ],
            points,
        };
    }
    if (basis.length === 2) {
        const rho = basis[1].rho;
        const real = X.realAt(rho);
        // Same gate as the elliptic test. A lattice ℤ + ℤρ with Im ρ ≠ 0 is
        // discrete; a purely numerical "ρ is real" must not certify otherwise.
        if (real.real && real.exact) {
            const Q = wordText(basis[1].word);
            const mp = X.minpolyText(rho);
            return {
                kind: 'cusp', exact: true, words: [basis[0].word, basis[1].word],
                headline: `the parabolics ${P} and ${Q} share a cusp and translate it by a real irrational ratio`,
                lines: [
                    `${P} and ${Q} are parabolic with the same fixed point (exact: their nilpotent parts are proportional over K).`,
                    `In the frame where it is ∞ they translate by τ and ρτ with ρ ${eq(X.show(rho))}${mp ? `, a root of ${mp}` : ''}: irrational and real (both exact).`,
                    `So ⟨${P}, ${Q}⟩ ≅ ℤ² translates a line densely — its elements accumulate at the identity: the group is not discrete.`,
                ],
                points,
            };
        }
    }
    return null;
}

function numericCusp(c, pool) {
    const base = c.pars[0];
    const N1 = nhatNum(base.M), k = argmaxAbs(N1);
    const P = wordText(base.word);
    const points = [ballPoint(c.fix)];
    const caveat = 'The entries are floating point, so this is numerical evidence, not a proof.';
    const integral = (x) => Math.abs(x - Math.round(x)) < 1e-9;
    const mults = [];
    for (const g of pool) {
        if (g.type === 'par' || !fixesNum(g.M, c.fix)) continue;
        const mu = multiplierNum(g.M, N1, k);
        const turns = Math.atan2(mu.im, mu.re) / TWO_PI;
        if (Math.abs(cabs(mu) - 1) <= 1e-6 && (integral(4 * turns) || integral(6 * turns))) {
            if (mults.length < 4 && !integral(turns)) mults.push({ word: g.word, mu });
            continue;
        }
        const { headline, lines } = multiplierLines(base.word, g.word, `≈ ${fmtNum(mu)}`, mu, 'numerically');
        return { kind: 'cusp', exact: false, words: [base.word, g.word], headline, lines: [...lines, caveat], points };
    }
    // Translation ratios, with their images under the allowed rotations.
    const trans = c.pars.map(q => ({ word: q.word, rho: nhatNum(q.M)[k].div(N1[k]) }));
    for (const m of mults) {
        for (const t of trans.slice(0, 8)) trans.push({ word: conjugateWord(m.word, t.word), rho: m.mu.mul(t.rho) });
    }
    const isReal = (z) => Math.abs(z.im) <= 1e-9 * cabs(z);
    for (const t of trans.slice(1)) {
        if (!isReal(t.rho) || nearRational(t.rho.re, 1000)) continue;
        const Q = wordText(t.word);
        return {
            kind: 'cusp', exact: false, words: [base.word, t.word],
            headline: `the parabolics ${P} and ${Q} appear to share a cusp with a real irrational translation ratio`,
            lines: [
                `${P} and ${Q} are parabolic with the same fixed point (numerically).`,
                `Their translations have ratio ρ ≈ ${fmtNum(t.rho, 12)}: real, and not within 10⁻⁹ of a fraction with denominator ≤ 1000, so ⟨${P}, ${Q}⟩ would translate a line densely.`,
                caveat,
            ],
            points,
        };
    }
    // With a non-real ratio ρ, a lattice needs every ratio in ℚ + ℚρ.
    const b = trans.find(t => !isReal(t.rho));
    if (b) {
        for (const t of trans) {
            if (t === b) continue;
            const y = t.rho.im / b.rho.im, x = t.rho.re - y * b.rho.re;
            if (nearRational(x, 1000) && nearRational(y, 1000)) continue;
            const W = [base.word, b.word, t.word].map(w => wordText(w));
            return {
                kind: 'cusp', exact: false, words: [base.word, b.word, t.word],
                headline: `the translations of the parabolics ${W.join(', ')} at one cusp do not appear to lie in a lattice`,
                lines: [
                    `${W.join(', ')} are parabolic with a common fixed point (numerically).`,
                    `Their translations τ, ρτ, ρ′τ have ρ′ ≈ ${+x.toPrecision(10)} + ${+y.toPrecision(10)}·ρ, coefficients not within 10⁻⁹ of fractions with denominator ≤ 1000: they would span a dense subgroup of ℂ.`,
                    caveat,
                ],
                points,
            };
        }
    }
    return null;
}

function cuspTest(pool, commuting, X) {
    const pars = pool.filter(e => e.type === 'par');
    for (const [A, B] of commuting) {
        const word = commutatorWord(A.word, B.word);
        if (!word.length) continue;
        const el = element(A.M.mul(B.M).mul(A.M.inv()).mul(B.M.inv()), word);
        if (el.type === 'par') pars.push(el);
    }
    const cusps = [];
    for (const p of pars) {
        const fix = parabolicFix(p.M);
        let c = cusps.find(c => chordal(c.fix, fix) < CUSP_TOL);
        if (!c) cusps.push(c = { fix, pars: [] });
        c.pars.push(p);
    }
    for (const c of cusps) {
        if (X && X.over()) return null;
        const r = X ? exactCusp(c, pool, X) : numericCusp(c, pool);
        if (r) return r;
    }
    return null;
}

// ---------------- 3. Jørgensen / Shimizu ----------------

function jorgensenText(A, B, J, k2, parabolic) {
    const a = wordText(A.word), b = wordText(B.word);
    if (parabolic) {
        return {
            kind: 'shimizu',
            headline: `${a} is parabolic and ${b} violates Shimizu's lemma against it`,
            lines: [
                `${a} is parabolic. In the frame where ${a} = (1 1; 0 1), ${b} = (a b; c d) has |c| = √|tr[${a}, ${b}] − 2| ≈ ${+Math.sqrt(k2).toPrecision(8)} < 1, and c ≠ 0 since tr[${a}, ${b}] ≠ 2.`,
                `Shimizu's lemma (Jørgensen's inequality for a parabolic): ⟨${a}, ${b}⟩ is not discrete, so neither is the group.`,
            ],
        };
    }
    return {
        kind: 'jorgensen',
        headline: `${a} and ${b} violate Jørgensen's inequality`,
        lines: [
            `|tr²${a} − 4| + |tr[${a}, ${b}] − 2| ≈ ${+J.toPrecision(8)} < 1.`,
            `⟨${a}, ${b}⟩ is non-elementary: tr[${a}, ${b}] ≠ 2 (no common fixed point) and neither trace is 0 (neither swaps a pair of points); a finite group would need an element of order ≥ 7 and so be cyclic or dihedral.`,
            `Jørgensen's inequality then says ⟨${a}, ${b}⟩ is not discrete, so neither is the group.`,
        ],
    };
}

function jorgensenTest(jcands, X) {
    for (const [A, B] of jcands) {
        if (!X) {
            const trAB = A.M.mul(B.M);
            const kappa = A.t.add(B.t).add(trAB.a.add(trAB.d).mul(trAB.a.add(trAB.d)))
                .sub(A.tr.mul(B.tr).mul(trAB.a.add(trAB.d))).sub(TWO);
            const k2 = cabs(kappa.sub(TWO)), J = cabs(A.t.sub(FOUR)) + k2;
            const r = jorgensenText(A, B, J, k2, A.type === 'par');
            return { ...r, exact: false, value: A.type === 'par' ? k2 : J, words: [A.word, B.word], lines: [...r.lines, 'The entries are floating point, so this is numerical evidence, not a proof.'], points: fixedPoints(A.M).map(ballPoint) };
        }
        if (X.over()) return null;
        const EA = X.of(A), EB = X.of(B);
        if (!EA || !EB) continue;
        const trA = X.tr(EA), trB = X.tr(EB);
        if (trA.isZero() || trB.isZero()) continue;
        const C = EA.mul(EB).mul(EA.adj()).mul(EB.adj());
        const kappa = X.tr(C).div(EA.det().mul(EB.det()));
        if (kappa.equals(X.two)) continue;
        const tA = X.tsq(EA);
        const kv = kappa.embed(), tv = tA.embed();
        const k2 = Math.hypot(kv.re - 2, kv.im), J = Math.hypot(tv.re - 4, tv.im) + k2;
        if (J >= 1 - MARGIN) continue;
        const parabolic = tA.equals(X.four);
        const r = jorgensenText(A, B, J, k2, parabolic);
        return { ...r, exact: true, value: parabolic ? k2 : J, words: [A.word, B.word], lines: [...r.lines, 'tr[A, B] ≠ 2 and the traces ≠ 0 are exact; the sum is compared with 1 in floating point.'], points: fixedPoints(A.M).map(ballPoint) };
    }
    return null;
}

// ---------------- entry point ----------------

/**
 * Search for a certificate that ⟨gens⟩ is not discrete.
 *
 * gens      Matrix2x2[] (any frame; orientation-reversing allowed — only
 *           orientation-preserving elements are tested)
 * exactCtx  { field, gens: ExactMat[] } for the same generators (possibly in
 *           another frame: every test is conjugation-invariant), or null
 * opts      words: extra words to test (e.g. the domain search's face
 *           pairings and stabilizer); maxLen, cap: the breadth-first search;
 *           budgetMs; allowConj: the field may adjoin complex conjugates
 *           (it is modified — pass a copy)
 *
 * Returns { found: true, exact, kind: 'elliptic' | 'cusp' | 'shimizu' |
 * 'jorgensen', headline, lines, text, words, points (ball coordinates of the
 * relevant fixed points, in the gens' frame), angle (elliptic), value (|c|²
 * for Shimizu, the sum for Jørgensen), checked } or { found: false, checked }.
 */
export function findNondiscreteness(gens, exactCtx = null, opts = {}) {
    const { words = [], maxLen = 12, cap = 600, budgetMs = 2500, maxEvals = 8000, allowConj = false } = opts;
    const t0 = Date.now(), deadline = t0 + budgetMs;
    if (!gens.length) return { found: false, checked: 0 };
    const G = gens.map(g => g.normalized());
    const pool = enumerate(G, { maxLen, cap, words });
    const X = exactCtx && exactCtx.field && exactCtx.gens && exactCtx.gens.length === gens.length
        ? new Exact(exactCtx, { allowConj, deadline, maxEvals }) : null;
    const { jcands, commuting } = pairPass(pool, deadline);
    const r = ellipticTest(pool, X) || cuspTest(pool, commuting, X) || jorgensenTest(jcands, X);
    const base = { checked: pool.length, exactUsed: !!X, ms: Date.now() - t0 };
    if (!r) return { found: false, ...base, timedOut: Date.now() > deadline || !!(X && X.evals >= X.maxEvals) };
    return { found: true, ...r, text: r.lines.join(' '), ...base };
}
