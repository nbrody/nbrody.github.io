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
 *  2′. Commuting loxodromics. Two that commute share an axis and translate
 *     along it by ℓ, ℓ′; a discrete group needs ℓ/ℓ′ ∈ ℚ. With tr²/det
 *     rational this is decided exactly — multipliers that are rational, or
 *     norm-1 elements of real quadratic fields (see axisTest).
 *
 *  3. Jørgensen's inequality. If ⟨A, B⟩ is discrete and non-elementary then
 *     |tr²A − 4| + |tr[A,B] − 2| ≥ 1. If tr[A,B] ≠ 2 (no common fixed point)
 *     and tr A, tr B ≠ 0 (neither swaps two points), ⟨A, B⟩ is non-elementary
 *     or finite; and a finite group with |tr²A − 4| < 1 has an element of
 *     order ≥ 7, so it is cyclic or dihedral — already excluded. With A
 *     parabolic this is Shimizu's lemma: |c| ≥ 1 for B = (a b; c d) in the
 *     frame where A = (1 1; 0 1).
 *
 *  4. Shimizu at a cusp, found by a Ford-domain search. Short words rarely
 *     violate Shimizu's lemma near the boundary of a deformation space (for
 *     ⟨(1 ∛4·ω; 0 1), (1 0; 1 1)⟩ the shortest violation found has 137
 *     letters). In the frame where a parabolic P is z ↦ z + 1, an element
 *     g = (a b; c d) not fixing ∞ has the isometric circle |cz + d| = 1 of
 *     radius 1/|c|, and Shimizu's lemma bounds every radius by 1 in a
 *     discrete group. The faces of the Ford domain at P's cusp are closed
 *     under products f·Pᵏ·g (k = 0, ±1, ±2), keeping the visible circles
 *     (power cells, as in riley-slice/fordCore.js); for a discrete group the
 *     faces settle, for a non-discrete one the products reach a circle of
 *     radius > 1, and that element goes through test 3, exactly.
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

// ---------------- the same in LaTeX ----------------
// An exact certificate also comes as `tex`: one sentence per computation, as text with $…$ math.

/** g_{1}^{2}g_{2}^{-1} — runs compressed to powers; long words cut with ⋯. */
export function wordTex(w, max = 16) {
    if (!w || !w.length) return 'e';
    const parts = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const n = (j - i) * Math.sign(w[i]);
        parts.push(`g_{${Math.abs(w[i])}}${n === 1 ? '' : `^{${n}}`}`);
        i = j;
    }
    return parts.length > max ? `${parts.slice(0, max).join('')}\\cdots` : parts.join('');
}
/** A number as show() gives it: 9/4 → \tfrac{9}{4}, "≈ 1.75 − 2i" → \approx 1.75 - 2i. */
const numTex = (s) => String(s).replace(/≈\s*/, '\\approx ').replace(/−/g, '-')
    .replace(/(\d+)\/(\d+)/g, '\\tfrac{$1}{$2}').replace(/(?<![\d.])1i/g, 'i');
/** "= 9/4" or "≈ 1.75", in TeX. */
const eqTex = (s) => (String(s).startsWith('≈') ? numTex(s) : `= ${numTex(s)}`);
/** polyString's x^3 − 2x^2 + 3/2x in TeX. */
const polyTex = (s) => String(s).replace(/−/g, '-').replace(/(\d+)\/(\d+)/g, '\\tfrac{$1}{$2}').replace(/\^(-?\d+)/g, '^{$1}');
const piTex = (theta) => `${+(theta / Math.PI).toPrecision(8)}\\pi`;

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
    /** The value at the chosen embedding: in high precision when the field offers it (an element
        reached by a long word has huge coordinates, and a double evaluation cancels). */
    num(x) { return typeof x.embedHP === 'function' ? x.embedHP(256) : x.embed(); }
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
        const v = this.num(x);
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
        return `≈ ${fmtNum(this.num(x))}`;
    }
    minpolyText(x) {
        try { return supPoly(polyString(minimalPolynomial(x))); } catch (e) { return null; }
    }
    minpolyTex(x) {
        try { return polyTex(polyString(minimalPolynomial(x))); } catch (e) { return null; }
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
            const tv = X.num(t);
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
            const mp = X.isRational(t) ? null : X.minpolyTex(t);
            return {
                kind: 'elliptic', exact: true, words: [el.word],
                headline: `${W} is an elliptic of infinite order`,
                lines: [
                    `${W} is elliptic: tr²/det ${tText} is real and lies in (0, 4), so it rotates about its axis by θ ≈ ${piMultiple(theta)}.`,
                    `A finite order m would make e^{iθ} a primitive m-th root of unity of degree ≤ 2 over ℚ(tr²/det), so φ(m) ≤ ${bound}; no such m has ${Wp}ᵐ = 1 (checked exactly). ${W} has infinite order.`,
                    `Its powers rotate by multiples of θ, which are dense in the circle and accumulate at the identity: the group is not discrete.`,
                ],
                tex: [
                    `Let $W = ${wordTex(el.word)}$ and $t = \\operatorname{tr}^2 W/\\det W$. Then $t ${eqTex(X.show(t))}$${mp ? `, a root of $${mp}$` : ''}.`,
                    `This $t$ is real${real.exact ? '' : ' (numerically, $|\\operatorname{Im} t| < 10^{-10}$)'} and lies in $(0, 4)$, so $W$ is elliptic.`,
                    `$W$ rotates about its axis by the angle $\\theta$ with $t = 4\\cos^2(\\theta/2)$, which is $\\theta \\approx ${piTex(theta)}$.`,
                    `If $W$ had finite order $m$, then $e^{i\\theta}$ would be a primitive $m$-th root of unity of degree at most $2$ over $\\mathbb{Q}(t)$, so $\\varphi(m) \\le ${bound}$.`,
                    `No such $m$ has $W^m = 1$ (checked exactly), so $W$ has infinite order.`,
                    'The powers of $W$ rotate by the multiples of $\\theta$, which are dense in the circle, so they accumulate at the identity. The group is not discrete.',
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

/** multiplierLines in TeX, for an exact multiplier μ (exactCusp). */
function multiplierTex(pWord, gWord, muShow, muNum, order) {
    const r = cabs(muNum);
    const head = [
        `Let $P = ${wordTex(pWord)}$, a parabolic, and $g = ${wordTex(gWord)}$. Then $g$ fixes the fixed point of $P$, and $gPg^{-1}$ translates by $\\mu$ times the translation $\\tau$ of $P$, with $\\mu ${eqTex(muShow)}$.`,
        'The fixed point and $\\mu$ are exact: $gNg^{-1} = \\mu N$ over $K$ for the nilpotent part $N$ of $P$. So are $\\mu^4 \\ne 1$ and $\\mu^6 \\ne 1$.',
    ];
    if (Math.abs(r - 1) > 1e-9) {
        return [...head,
            `Here $|\\mu| \\approx ${+r.toPrecision(8)} \\ne 1$, so $g$ is loxodromic.`,
            `The parabolics $g^nPg^{-n}$ translate by $\\mu^n\\tau$, which tends to $0$ as $n \\to ${r < 1 ? '+' : '-'}\\infty$. These are non-trivial elements converging to the identity, so the group is not discrete.`,
        ];
    }
    return [...head,
        `Here $|\\mu| = 1$: $g$ rotates about an axis ending at that point by $\\arg\\mu \\approx ${piTex(Math.atan2(muNum.im, muNum.re))}$, and $\\mu$ is ${order ? `a root of unity of order $${order}$` : 'not a root of unity'}.`,
        'The conjugates $g^nPg^{-n}$ translate by $\\mu^n\\tau$. By the crystallographic restriction, $\\tau\\,\\mathbb{Z}[\\mu]$ is a lattice only when $\\mu$ has order $1$, $2$, $3$, $4$ or $6$, so these translations are dense and the group is not discrete.',
    ];
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
        const { headline, lines } = multiplierLines(base.word, g.word, X.show(mu), X.num(mu),
            order ? `a root of unity of order ${order}` : 'not a root of unity');
        return {
            kind: 'cusp', exact: true, words: [base.word, g.word], headline,
            lines: [lines[0], 'The common fixed point and μ are exact (g·N·g⁻¹ = μ·N over K, for the nilpotent part N of the parabolic), and so are μ⁴ ≠ 1 and μ⁶ ≠ 1.', lines[1]],
            tex: multiplierTex(base.word, g.word, X.show(mu), X.num(mu), order),
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
            tex: [
                `The parabolics $${basis.slice(0, 3).map((b) => wordTex(b.word)).join(',\\ ')}$ have a common fixed point: their nilpotent parts are proportional over $K$ (exact).`,
                `In the frame where that point is $\\infty$, they translate by $\\tau$, $\\rho_2\\tau$ and $\\rho_3\\tau$, with $\\rho_2 ${eqTex(X.show(basis[1].rho))}$ and $\\rho_3 ${eqTex(X.show(basis[2].rho))}$.`,
                'The numbers $1$, $\\rho_2$, $\\rho_3$ are linearly independent over $\\mathbb{Q}$ (exact).',
                'So these parabolics generate a free abelian group of rank $3$ of translations of $\\mathbb{C} \\cong \\mathbb{R}^2$, which is never discrete. The group is not discrete.',
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
                tex: [
                    `The parabolics $P = ${wordTex(basis[0].word)}$ and $Q = ${wordTex(basis[1].word)}$ have the same fixed point: their nilpotent parts are proportional over $K$ (exact).`,
                    `In the frame where that point is $\\infty$, they translate by $\\tau$ and $\\rho\\tau$, with $\\rho ${eqTex(X.show(rho))}$${X.minpolyTex(rho) ? `, a root of $${X.minpolyTex(rho)}$` : ''}.`,
                    `This $\\rho$ is irrational (exact) and real${real.exact ? ' (exact)' : ' (numerically, $|\\operatorname{Im}\\rho| < 10^{-10}$)'}.`,
                    'So $\\langle P, Q\\rangle \\cong \\mathbb{Z}^2$ translates a line densely, and its elements accumulate at the identity. The group is not discrete.',
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

// ---------------- 2′. commuting loxodromics ----------------

/* Two loxodromics that commute share their axis. In the frame where it runs
   from 0 to ∞ they are z ↦ λz and z ↦ λ′z and translate along it by
   ℓ = log|λ| and ℓ′ = log|λ′|; a discrete group translates the axis by the
   multiples of one length, so ℓ/ℓ′ must be rational. λ is a root of
   x² − (t − 2)x + 1 with t = tr²/det, and when t is rational (outside [0, 4])
   it is real and decided exactly:
     – λ, λ′ rational: ℓ/ℓ′ ∈ ℚ iff |λ|, |λ′| are multiplicatively dependent,
       i.e. their exponent vectors over a gcd-free basis are proportional;
     – otherwise λ lies in ℚ(√Δ), Δ = t(t − 4), with norm λλ̄ = 1. A relation
       λᵐ = ±λ′ⁿ with one side rational would make the other equal to its
       conjugate, so |λ| = 1: a rational λ is independent of an irrational
       λ′, and so are irrational ones from different fields (ΔΔ′ not a
       square). In one field, an algebraic integer λ (t − 2 ∈ ℤ) is a unit,
       and a unit is independent of a non-integer (whose powers are never
       integral); two units are dependent (rank 1), and two non-integers are
       left undecided.
   With ℓ/ℓ′ irrational the translations mℓ + nℓ′ come arbitrarily close to 0. */

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
function bsqrt(n) {                                 // ⌊√n⌋ for n ≥ 0
    if (n < 2n) return n;
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (x * x > n) x--;
    while ((x + 1n) * (x + 1n) <= n) x++;
    return x;
}
/** √r for a rational square r ≥ 0, or null. */
function fracSqrt(r) {
    if (r.p < 0n) return null;
    const a = bsqrt(r.p), b = bsqrt(r.q);
    return a * a === r.p && b * b === r.q ? new Frac(a, b) : null;
}
/** Pairwise coprime b > 1 such that every x is a product of their powers (no factoring). */
function gcdFreeBasis(xs) {
    let B = [...new Set(xs.filter(x => x > 1n))];
    for (let changed = true; changed;) {
        changed = false;
        search: for (let i = 0; i < B.length; i++) {
            for (let j = i + 1; j < B.length; j++) {
                const g = bgcd(B[i], B[j]);
                if (g === 1n) continue;
                const rest = [B[i] / g, B[j] / g, g].filter(x => x > 1n);
                B = [...new Set(B.filter((_, k) => k !== i && k !== j).concat(rest))];
                changed = true;
                break search;
            }
        }
    }
    return B.sort((a, b) => (a < b ? -1 : 1));
}
const valuation = (n, p) => { let k = 0; for (n = babs(n); n % p === 0n; n /= p) k++; return k; };

/** The real multiplier data of a loxodromic with rational t = tr²/det ∉ [0, 4]. */
function realMultiplier(tFrac) {
    const two = new Frac(2n), four = new Frac(4n);
    const s = tFrac.sub(two);                       // λ + 1/λ
    const disc = tFrac.mul(tFrac.sub(four));        // Δ = t(t − 4) = s² − 4
    const root = fracSqrt(disc);
    const lambda = root ? s.add(root).div(two) : null;
    return { s, disc, lambda, integral: s.q === 1n };
}

/** The proof as sentences: plain text, or (with reasonTex, the reason's TeX sentences) TeX. */
function axisLines(A, B, reason, lens, reasonTex = null) {
    const a = wordText(A.word), b = wordText(B.word), ap = paren(A.word), bp = paren(B.word);
    // a short near-relation, from the continued fraction of ℓ/ℓ′
    let witness = '';
    const conv = (() => {
        let x = lens[0] / lens[1], h0 = 0, h1 = 1, k0 = 1, k1 = 0, best = null;
        for (let i = 0; i < 12; i++) {
            const q = Math.floor(x);
            [h0, h1] = [h1, q * h1 + h0];
            [k0, k1] = [k1, q * k1 + k0];
            if (k1 > 60 || Math.abs(h1) > 60) break;
            best = { m: k1, n: -h1, d: Math.abs(k1 * lens[0] - h1 * lens[1]) };
            const f = x - q;
            if (f < 1e-12) break;
            x = 1 / f;
        }
        return best;
    })();
    if (conv && conv.m > 1 && conv.d > 0) {
        witness = ` (for example ${ap}${conv.m === 1 ? '' : supPoly(`^${conv.m}`)}·${bp}${supPoly(`^${conv.n}`)} moves along the axis by only ≈ ${+conv.d.toPrecision(4)})`;
    }
    if (reasonTex) {
        return [
            `Let $A = ${wordTex(A.word)}$ and $B = ${wordTex(B.word)}$. They are loxodromic and commute: $[A, B] = 1$ (exact).`,
            "So they share an axis. In the frame where it runs from $0$ to $\\infty$, they are $z \\mapsto \\lambda z$ and $z \\mapsto \\lambda' z$, and they translate along it by $\\ell = \\log|\\lambda|$ and $\\ell' = \\log|\\lambda'|$.",
            ...reasonTex,
            `So $\\ell/\\ell'$ is irrational, and the products $A^mB^n$ translate along the axis by $m\\ell + n\\ell'$, which come arbitrarily close to $0$${conv && conv.m > 1 && conv.d > 0 ? ` (for example, $A^{${conv.m}}B^{${conv.n}}$ moves along the axis by only $\\approx ${+conv.d.toPrecision(4)}$)` : ''}.`,
            'Non-trivial elements accumulate at the identity, so the group is not discrete.',
        ];
    }
    return [
        `${a} and ${b} are loxodromic and commute (exact: [${a}, ${b}] = 1), so they share an axis; in the frame where it runs from 0 to ∞ they are z ↦ λz and z ↦ λ′z, translating along it by ℓ = log|λ| and ℓ′ = log|λ′|.`,
        reason,
        `So ℓ/ℓ′ is irrational: the products ${ap}ᵐ·${bp}ⁿ translate along the axis by mℓ + nℓ′, which come arbitrarily close to 0${witness}. Non-trivial elements accumulate at the identity: the group is not discrete.`,
    ];
}

function exactAxis(A, B, X) {
    const EA = X.of(A), EB = X.of(B);
    if (!EA || !EB) return null;
    if (!EA.mul(EB).mul(EA.adj()).mul(EB.adj()).isProjectiveIdentity()) return null;
    const tA = X.tsq(EA), tB = X.tsq(EB);
    if (!X.isRational(tA) || !X.isRational(tB)) return null;
    const rat = (x) => (typeof x.rational === 'function' ? x.rational() : (x.c[0] || new Frac(0n)));
    const fa = rat(tA), fb = rat(tB);
    const outside = (f) => f.p < 0n || f.p > 4n * f.q;           // t < 0 or t > 4: loxodromic
    if (!outside(fa) || !outside(fb)) return null;
    const ma = realMultiplier(fa), mb = realMultiplier(fb);
    const lam = (m) => (m.lambda ? `λ = ${m.lambda}` : `λ = (${m.s} ± √(${m.disc}))/2`);
    const fT = (f) => numTex(String(f));
    const lamT = (m) => (m.lambda ? fT(m.lambda) : `\\frac{${fT(m.s)} \\pm \\sqrt{${fT(m.disc)}}}{2}`);
    let reason = null, reasonTex = null;
    if (ma.lambda && mb.lambda) {
        const absF = (f) => new Frac(babs(f.p), f.q);
        const la = absF(ma.lambda), lb = absF(mb.lambda);
        const basis = gcdFreeBasis([la.p, la.q, lb.p, lb.q]);
        const vec = (f) => basis.map(p => valuation(f.p, p) - valuation(f.q, p));
        const va = vec(la), vb = vec(lb);
        let independent = false;
        for (let i = 0; i < basis.length && !independent; i++) {
            for (let j = i + 1; j < basis.length; j++) if (va[i] * vb[j] !== va[j] * vb[i]) { independent = true; break; }
        }
        if (!independent) return null;
        const show = (v) => `(${v.join(', ')})`;
        reason = `λ ${eq(String(ma.lambda))} and λ′ ${eq(String(mb.lambda))} are rational (tr²/det = ${fa} and ${fb}, exact), and |λ|, |λ′| are multiplicatively independent: over the coprime factors ${basis.join(', ')} their exponent vectors ${show(va)} and ${show(vb)} are not proportional (exact).`;
        reasonTex = [
            `Here $\\operatorname{tr}^2/\\det$ is $${fT(fa)}$ for $A$ and $${fT(fb)}$ for $B$, so $\\lambda = ${fT(ma.lambda)}$ and $\\lambda' = ${fT(mb.lambda)}$ are rational (exact).`,
            `Over the coprime factors $${basis.join(', ')}$, the exponent vectors of $|\\lambda|$ and $|\\lambda'|$ are $${show(va)}$ and $${show(vb)}$, which are not proportional (exact). So $|\\lambda|$ and $|\\lambda'|$ are multiplicatively independent.`,
        ];
    } else if (ma.lambda || mb.lambda) {
        const [r, q] = ma.lambda ? [ma, mb] : [mb, ma];
        reason = `${lam(r).replace('λ', ma.lambda ? 'λ' : 'λ′')} is rational and ${ma.lambda ? 'λ′' : 'λ'} = (${q.s} ± √(${q.disc}))/2 is not (exact). A relation λᵐ = ±λ′ⁿ would make that power rational, hence equal to its conjugate — the inverse power, as the norm is 1 — and force |λ′| = 1, impossible for a loxodromic.`;
        const [rn, qn] = ma.lambda ? ['\\lambda', "\\lambda'"] : ["\\lambda'", '\\lambda'];
        reasonTex = [
            `Here $${rn} = ${lamT(r)}$ is rational and $${qn} = ${lamT(q)}$ is not (exact).`,
            `A relation $\\lambda^m = \\pm\\lambda'^n$ would make that power rational, hence equal to its conjugate, which is the inverse power since the norm is $1$. That forces $|${qn}| = 1$, which is impossible for a loxodromic.`,
        ];
    } else {
        const same = fracSqrt(ma.disc.mul(mb.disc)) !== null;
        if (!same) {
            reason = `λ = (${ma.s} ± √(${ma.disc}))/2 and λ′ = (${mb.s} ± √(${mb.disc}))/2 lie in different real quadratic fields (the product of the discriminants is not a square, exact). A relation λᵐ = ±λ′ⁿ would put that power in both fields, so in ℚ, and make it equal to its conjugate, the inverse power: |λ| = 1, impossible for a loxodromic.`;
            reasonTex = [
                `Here $\\lambda = ${lamT(ma)}$ and $\\lambda' = ${lamT(mb)}$ lie in different real quadratic fields: the product of the discriminants is not a square (exact).`,
                "A relation $\\lambda^m = \\pm\\lambda'^n$ would put that power in both fields, hence in $\\mathbb{Q}$, and make it equal to its conjugate, the inverse power. Then $|\\lambda| = 1$, which is impossible for a loxodromic.",
            ];
        } else if (ma.integral !== mb.integral) {
            const [u, n] = ma.integral ? ['λ', 'λ′'] : ['λ′', 'λ'];
            reason = `λ and λ′ lie in the same real quadratic field ℚ(√(${ma.disc})) with norm 1; ${u} is an algebraic integer (λ + 1/λ = ${ma.integral ? ma.s : mb.s} ∈ ℤ), so a unit, and ${n} is not (${n} + 1/${n} = ${ma.integral ? mb.s : ma.s} ∉ ℤ, exact). No power of ${n} is integral, so no power of it is a power of ${u}.`;
            const [uT, nT] = ma.integral ? ['\\lambda', "\\lambda'"] : ["\\lambda'", '\\lambda'];
            reasonTex = [
                `Here $\\lambda$ and $\\lambda'$ lie in the same real quadratic field $\\mathbb{Q}(\\sqrt{${fT(ma.disc)}})$, with norm $1$.`,
                `$${uT} + 1/${uT} = ${fT(ma.integral ? ma.s : mb.s)} \\in \\mathbb{Z}$, so $${uT}$ is an algebraic integer, hence a unit; $${nT} + 1/${nT} = ${fT(ma.integral ? mb.s : ma.s)} \\notin \\mathbb{Z}$, so $${nT}$ is not (exact).`,
                `No power of $${nT}$ is integral, so no power of $${nT}$ is a power of $${uT}$.`,
            ];
        } else return null;
    }
    const lens = [Math.log(Math.abs(numLambda(A))), Math.log(Math.abs(numLambda(B)))];
    return {
        kind: 'axis', exact: true, words: [A.word, B.word],
        headline: `${wordText(A.word)} and ${wordText(B.word)} share an axis and translate along it by lengths with an irrational ratio`,
        lines: axisLines(A, B, reason, lens),
        tex: axisLines(A, B, reason, lens, reasonTex),
        points: fixedPoints(A.M).map(ballPoint),
    };
}

/** |λ| from the floating-point matrix: λ + 1/λ = t − 2. */
function numLambda(el) {
    const s = el.t.sub(TWO);
    const r = Complex.sqrt(s.mul(s).sub(FOUR));
    const l1 = s.add(r).div(2), l2 = s.sub(r).div(2);
    return Math.max(cabs(l1), cabs(l2));
}

function axisTest(commuting, X) {
    for (const [A, B] of commuting) {
        if (A.type !== 'lox' || B.type !== 'lox') continue;
        if (X) {
            if (X.over()) return null;
            const r = exactAxis(A, B, X);
            if (r) return r;
            continue;
        }
        // floating point: both fixed points shared, translation lengths with an irrational-looking ratio
        const C = A.M.mul(B.M).mul(A.M.inv()).mul(B.M.inv());
        if (distFromIdentityPSL(C.normalized()) > 1e-9) continue;
        const la = Math.log(numLambda(A)), lb = Math.log(numLambda(B));
        if (!(Math.abs(la) > 1e-9 && Math.abs(lb) > 1e-9) || nearRational(la / lb, 1000)) continue;
        return {
            kind: 'axis', exact: false, words: [A.word, B.word],
            headline: `${wordText(A.word)} and ${wordText(B.word)} appear to share an axis and translate along it by lengths with an irrational ratio`,
            lines: [
                `${wordText(A.word)} and ${wordText(B.word)} are loxodromic and commute (numerically), translating along their common axis by ℓ ≈ ${+la.toPrecision(10)} and ℓ′ ≈ ${+lb.toPrecision(10)}.`,
                `ℓ/ℓ′ ≈ ${+(la / lb).toPrecision(12)} is not within 10⁻⁹ of a fraction with denominator ≤ 1000, so the translations mℓ + nℓ′ would come arbitrarily close to 0.`,
                'The entries are floating point, so this is numerical evidence, not a proof.',
            ],
            points: fixedPoints(A.M).map(ballPoint),
        };
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
            tex: [
                `Let $P = ${wordTex(A.word)}$, which is parabolic, and $g = ${wordTex(B.word)}$.`,
                `In the frame where $P = \\left(\\begin{smallmatrix}1&1\\\\0&1\\end{smallmatrix}\\right)$, write $g = \\left(\\begin{smallmatrix}a&b\\\\c&d\\end{smallmatrix}\\right)$. Then $|c| = \\sqrt{|\\operatorname{tr}[P, g] - 2|} \\approx ${+Math.sqrt(k2).toPrecision(8)} < 1$, and $c \\ne 0$ because $\\operatorname{tr}[P, g] \\ne 2$.`,
                "By Shimizu's lemma (Jørgensen's inequality for a parabolic), $\\langle P, g\\rangle$ is not discrete, so neither is the group.",
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
        tex: [
            `Let $A = ${wordTex(A.word)}$ and $B = ${wordTex(B.word)}$. Then $|\\operatorname{tr}^2 A - 4| + |\\operatorname{tr}[A, B] - 2| \\approx ${+J.toPrecision(8)} < 1$.`,
            'Since $\\operatorname{tr}[A, B] \\ne 2$, $A$ and $B$ have no common fixed point; since neither trace is $0$, neither swaps a pair of points. A finite group would need an element of order at least $7$, and so be cyclic or dihedral. So $\\langle A, B\\rangle$ is non-elementary.',
            "By Jørgensen's inequality, $\\langle A, B\\rangle$ is not discrete, so neither is the group.",
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
            return { ...r, exact: false, value: A.type === 'par' ? k2 : J, words: [A.word, B.word], lines: [...r.lines, 'The entries are floating point, so this is numerical evidence, not a proof.'], tex: null, points: fixedPoints(A.M).map(ballPoint) };
        }
        if (X.over()) return null;
        const EA = X.of(A), EB = X.of(B);
        if (!EA || !EB) continue;
        const trA = X.tr(EA), trB = X.tr(EB);
        const tA = X.tsq(EA);
        // Shimizu's lemma (A parabolic) needs only c ≠ 0, i.e. tr[A, B] ≠ 2; Jørgensen's inequality
        // also needs ⟨A, B⟩ non-elementary, which the nonzero traces give
        if (!tA.equals(X.four) && (trA.isZero() || trB.isZero())) continue;
        const C = EA.mul(EB).mul(EA.adj()).mul(EB.adj());
        const kappa = X.tr(C).div(EA.det().mul(EB.det()));
        if (kappa.equals(X.two)) continue;
        const kv = X.num(kappa), tv = X.num(tA);
        const k2 = Math.hypot(kv.re - 2, kv.im), J = Math.hypot(tv.re - 4, tv.im) + k2;
        if (J >= 1 - MARGIN) continue;
        const parabolic = tA.equals(X.four);
        const r = jorgensenText(A, B, J, k2, parabolic);
        const how = parabolic ? 'Parabolicity and tr[A, B] ≠ 2 are exact' : 'tr[A, B] ≠ 2 and the traces ≠ 0 are exact';
        const prec = typeof kappa.embedHP === 'function' ? ' (the value evaluated with 256 bits)' : '';
        const howTex = parabolic ? 'Parabolicity and $\\operatorname{tr}[P, g] \\ne 2$ are exact' : '$\\operatorname{tr}[A, B] \\ne 2$ and the nonzero traces are exact';
        return {
            ...r, exact: true, value: parabolic ? k2 : J, words: [A.word, B.word], lines: [...r.lines, `${how}; the sum is compared with 1 in floating point${prec}.`],
            tex: [...r.tex, `${howTex}; the ${parabolic ? 'value' : 'sum'} is compared with $1$ in floating point${prec ? ', evaluated with $256$ bits' : ''}.`],
            points: fixedPoints(A.M).map(ballPoint),
        };
    }
    return null;
}

// ---------------- 4. Shimizu at a cusp, by a Ford-domain search ----------------

/* Exact visibility of isometric circles {x ∈ [0, 1), y, r} modulo z ↦ z + 1 (riley-slice/fordCore.js):
   circle i is a face iff r_i² − |p − c_i|² ≥ r_j² − |p − c_j|² somewhere on its disk, for every other
   circle j and translate. The differences are affine in p, so the region is a polygon (a power cell)
   cut by half-planes. */
const VREL = 1e-9;
function clipPoly(poly, u, v, w) {                 // keep u x + v y ≥ w
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
        const P = poly[i], Q = poly[(i + 1) % n];
        const fp = u * P[0] + v * P[1] - w, fq = u * Q[0] + v * Q[1] - w;
        if (fp >= 0) out.push(P);
        if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return out;
}
function maxPower(poly, c) {                       // max of r² − |p − c|² over the polygon
    const n = poly.length;
    if (n < 3) return -Infinity;
    let inside = true, d2 = Infinity;
    for (let i = 0; i < n; i++) {
        const P = poly[i], Q = poly[(i + 1) % n];
        const ex = Q[0] - P[0], ey = Q[1] - P[1];
        if (ex * (c.y - P[1]) - ey * (c.x - P[0]) < 0) inside = false;
        const L2 = ex * ex + ey * ey;
        let t = L2 > 0 ? ((c.x - P[0]) * ex + (c.y - P[1]) * ey) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = P[0] + t * ex - c.x, dy = P[1] + t * ey - c.y;
        d2 = Math.min(d2, dx * dx + dy * dy);
    }
    return inside ? c.r * c.r : c.r * c.r - d2;
}
/** The faces among circles: those inside one bigger circle go first, then the power cells. */
function visibleCircles(items) {
    const order = items.map((_, i) => i).filter(i => items[i].r > 0 && isFinite(items[i].r)).sort((a, b) => items[b].r - items[a].r);
    const kept = [];
    for (const i of order) {
        const c = items[i];
        let inside = false;
        for (const k of kept) {
            const d = items[k];
            if (d.r - c.r <= VREL * c.r) break;
            let dx = Math.abs(c.x - d.x); if (dx > 0.5) dx = 1 - dx;
            if (Math.hypot(dx, c.y - d.y) <= d.r - c.r + VREL * c.r) { inside = true; break; }
        }
        if (!inside) kept.push(i);
    }
    const C = kept.map(i => items[i]), out = [];
    for (let i = 0; i < C.length; i++) {
        const ci = C[i], ki = ci.r * ci.r - ci.x * ci.x - ci.y * ci.y;
        let poly = [[ci.x - ci.r, ci.y - ci.r], [ci.x + ci.r, ci.y - ci.r], [ci.x + ci.r, ci.y + ci.r], [ci.x - ci.r, ci.y + ci.r]];
        let dead = false;
        for (let j = 0; j < C.length && !dead; j++) {
            const cj = C[j], rs = ci.r + cj.r, dy = cj.y - ci.y;
            if (Math.abs(dy) >= rs) continue;
            for (let k = Math.ceil(ci.x - cj.x - rs); k <= Math.floor(ci.x - cj.x + rs); k++) {
                if (j === i && k === 0) continue;
                const xj = cj.x + k, d = Math.hypot(xj - ci.x, dy);
                if (d >= rs) continue;
                if (d <= cj.r - ci.r + VREL * ci.r) {
                    if (Math.abs(cj.r - ci.r) > VREL * ci.r || j < i) { dead = true; break; }
                    continue;
                }
                if (d <= ci.r - cj.r) continue;
                const kj = cj.r * cj.r - xj * xj - cj.y * cj.y;
                poly = clipPoly(poly, 2 * (ci.x - xj), 2 * (ci.y - cj.y), kj - ki);
                if (poly.length < 3) { dead = true; break; }
            }
        }
        if (!dead && maxPower(poly, ci) > VREL * ci.r * ci.r) out.push(ci);
    }
    return out;
}

/**
 * A Ford-domain search at the cusp of the parabolic pool element P: the element with the largest
 * isometric circle beyond radius 1 (in the frame P = z ↦ z + 1), as a pool element, or null when
 * the faces settle (or the budget runs out) first.
 */
function fordShimizu(P, gens, pool, deadline, { maxFaces = 150, maxRounds = 40, maxLen = 600 } = {}) {
    const fix = parabolicFix(P.M);
    const one = new Complex(1), zero = new Complex(0);
    let K = fix === null ? Matrix2x2.identity() : new Matrix2x2(zero, new Complex(-1), one, fix.mul(new Complex(-1)));
    const Pk = K.mul(P.M).mul(K.inv()).normalized();
    if (cabs(Pk.c) > 1e-9 * (cabs(Pk.a) + cabs(Pk.b))) return null;
    const tau = Pk.b.div(Pk.a), st = Complex.sqrt(tau);
    K = new Matrix2x2(one.div(st), zero, zero, st).mul(K);           // ξ ↦ ∞, then z ↦ z/τ: P = z + 1
    const Ki = K.inv();
    const T = (k) => new Matrix2x2(one, new Complex(k), zero, one);
    const make = (F, word) => {
        const c2 = F.c.normSq(), s2 = F.a.normSq() + F.b.normSq() + F.d.normSq();
        if (!(c2 > 1e-20 * (1 + s2))) return null;                   // fixes ∞
        const ctr = F.d.div(F.c);
        const x = -ctr.re;
        return { F, word, x: x - Math.floor(x), y: -ctr.im, r: 1 / Math.sqrt(c2) };
    };
    const keyOf = (it) => `${Math.round(it.x * 1e7)},${Math.round(it.y * 1e7)},${Math.round(it.r * 1e7)}`;
    // seeds: the generators and the pool's words, in the frame
    const seeds = [];
    gens.forEach((g, i) => { seeds.push(make(K.mul(g).mul(Ki).normalized(), [i + 1])); seeds.push(make(K.mul(g.inv()).mul(Ki).normalized(), [-(i + 1)])); });
    for (const el of pool.slice(0, 200)) seeds.push(make(K.mul(el.M).mul(Ki).normalized(), el.word));
    let faces = visibleCircles(seeds.filter(Boolean));
    const pw = (k) => (k > 0 ? Array(k).fill(P.word).flat() : Array(-k).fill(invertWord(P.word)).flat());
    const found = (it) => element(Ki.mul(it.F).mul(K), it.word);
    let best = faces.find(f => f.r > 1 + 1e-6);
    if (best) return found(best);
    for (let round = 0; round < maxRounds && Date.now() < deadline; round++) {
        const have = new Set(faces.map(keyOf));
        const cand = faces.slice();
        for (const f of faces) for (const g of faces) for (const k of [0, 1, -1, 2, -2]) {
            if (f.word.length + g.word.length + Math.abs(k) * P.word.length > maxLen) continue;
            const it = make(f.F.mul(T(k)).mul(g.F).normalized(), null);
            if (!it) continue;
            const key = keyOf(it);
            if (have.has(key)) continue;
            have.add(key);
            it.word = reduceWord([...f.word, ...pw(k), ...g.word]);
            if (!it.word.length) continue;
            if (it.r > 1 + 1e-6 && (!best || it.r > best.r)) best = it;
            cand.push(it);
        }
        if (best) return found(best);
        const next = visibleCircles(cand);
        const same = next.length === faces.length && next.every(f => have.has(keyOf(f)) && faces.some(g => keyOf(g) === keyOf(f)));
        faces = next;
        if (same || faces.length > maxFaces) return null;
    }
    return null;
}

/**
 * |tr[P, g] − 2| for words P, g in the (floating-point) generators, recomputed with 200-bit fixed
 * point from the doubles: a long word's double product can cancel c to nothing and fake a large
 * isometric circle. The generators are taken as exact binary numbers (to 2⁻²⁰⁰), so only the
 * input's own rounding remains.
 */
function shimizuValueHP(gens, pWord, gWord) {
    const BITS = 200n, S = 2 ** 200;
    const big = (x) => BigInt(Math.round(x * S));                     // exact but for entries below 2⁻²⁰⁰
    const cxv = (z) => ({ re: big(z.re), im: big(z.im) });
    const mulc = (a, b) => ({ re: (a.re * b.re - a.im * b.im) >> BITS, im: (a.re * b.im + a.im * b.re) >> BITS });
    const addc = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
    const neg = (a) => ({ re: -a.re, im: -a.im });
    const mat = (g) => [cxv(g.a), cxv(g.b), cxv(g.c), cxv(g.d)];
    const mm = (A, B) => [addc(mulc(A[0], B[0]), mulc(A[1], B[2])), addc(mulc(A[0], B[1]), mulc(A[1], B[3])), addc(mulc(A[2], B[0]), mulc(A[3], B[2])), addc(mulc(A[2], B[1]), mulc(A[3], B[3]))];
    const adj = (A) => [A[3], neg(A[1]), neg(A[2]), A[0]];                // the inverse (det 1)
    const L = gens.map((g) => mat(g.normalized()));
    const one = { re: 1n << BITS, im: 0n }, zero = { re: 0n, im: 0n };
    const word = (w) => w.reduce((M, l) => mm(M, l > 0 ? L[l - 1] : adj(L[-l - 1])), [one, zero, zero, one]);
    const A = word(pWord), B = word(gWord);
    const C = mm(mm(mm(A, B), adj(A)), adj(B));
    const t = addc(C[0], C[3]);
    const re = Number(t.re - 2n * one.re) / S, im = Number(t.im) / S;
    return Math.hypot(re, im);
}

/** Test 4: at the cusps of the shortest parabolics, a Ford-domain search for a Shimizu violation, checked by test 3. */
function fordShimizuTest(pool, gens, X, deadline) {
    const pars = pool.filter(e => e.type === 'par'), cusps = [];
    for (const p of pars) {
        const fix = parabolicFix(p.M);
        if (cusps.some(c => chordal(c.fix, fix) < CUSP_TOL)) continue;
        cusps.push({ fix, P: p });
        if (cusps.length >= 3) break;
    }
    for (const { P } of cusps) {
        if (Date.now() > deadline || (X && X.over())) return null;
        const g = fordShimizu(P, gens, pool, deadline);
        if (!g) continue;
        // without an exact field, the double products of a long word are not to be trusted: recheck
        if (!X) {
            const v = shimizuValueHP(gens, P.word, g.word);
            if (!(v < 1 - 1e-6) || v < 1e-12) continue;
        }
        const r = jorgensenTest([[P, g]], X);
        if (!r) continue;
        const lines = r.lines.slice();
        lines.splice(1, 0, `${wordText(g.word)} (${g.word.length} letters) was found by closing the faces of the Ford domain at the cusp of ${wordText(P.word)} under products f·${paren(P.word)}ᵏ·g: its isometric circle has radius ${+(1 / Math.sqrt(r.value)).toPrecision(6)} > 1 in the frame where ${wordText(P.word)} = z ↦ z + 1.`);
        const tex = r.tex ? r.tex.slice() : null;
        if (tex) tex.splice(1, 0, `The element $g$, of ${g.word.length} letters, was found by closing the faces of the Ford domain at the cusp of $P$ under the products $fP^kh$. Its isometric circle has radius $\\approx ${+(1 / Math.sqrt(r.value)).toPrecision(6)} > 1$ in the frame where $P$ is $z \\mapsto z + 1$.`);
        return { ...r, lines, tex, search: 'ford' };
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
 *           fordSearch: test 4, the Ford-domain search at cusps (default on);
 *           budgetMs; allowConj: the field may adjoin complex conjugates
 *           (it is modified — pass a copy)
 *
 * Returns { found: true, exact, kind: 'elliptic' | 'cusp' | 'axis' | 'shimizu' |
 * 'jorgensen', headline, lines, text, tex (exact certificates: the proof in LaTeX, one
 * sentence per computation, as text with $…$ math), words, points (ball coordinates of the
 * relevant fixed points, in the gens' frame), angle (elliptic), value (|c|²
 * for Shimizu, the sum for Jørgensen), checked } or { found: false, checked }.
 */
export function findNondiscreteness(gens, exactCtx = null, opts = {}) {
    const { words = [], maxLen = 12, cap = 600, budgetMs = 2500, maxEvals = 8000, allowConj = false, fordSearch = true } = opts;
    const t0 = Date.now(), deadline = t0 + budgetMs;
    if (!gens.length) return { found: false, checked: 0 };
    const G = gens.map(g => g.normalized());
    const pool = enumerate(G, { maxLen, cap, words });
    const X = exactCtx && exactCtx.field && exactCtx.gens && exactCtx.gens.length === gens.length
        ? new Exact(exactCtx, { allowConj, deadline, maxEvals }) : null;
    const { jcands, commuting } = pairPass(pool, deadline);
    const r = ellipticTest(pool, X) || cuspTest(pool, commuting, X) || axisTest(commuting, X) || jorgensenTest(jcands, X)
        || (fordSearch ? fordShimizuTest(pool, G, X, deadline) : null);
    const base = { checked: pool.length, exactUsed: !!X, ms: Date.now() - t0 };
    if (!r) return { found: false, ...base, timedOut: Date.now() > deadline || !!(X && X.evals >= X.maxEvals) };
    return { found: true, ...r, text: r.lines.join(' '), ...base };
}
