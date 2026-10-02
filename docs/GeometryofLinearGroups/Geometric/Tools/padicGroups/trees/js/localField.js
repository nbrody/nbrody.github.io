/**
 * localField.js — the local field a Bruhat–Tits tree is built over.
 *
 * A global field K = ℚ(w) (ℚ itself when no field is given) and a prime 𝔭 of K
 * above p determine the completion K_𝔭: ramification index e, residue field
 * F_q with q = p^f, and a uniformizer π. The tree of PGL₂(K_𝔭) is
 * (q+1)-regular, and the link of every vertex is P¹(F_q).
 *
 *   f = e = 1   K_𝔭 = ℚ_p. The prime is an embedding K ↪ ℚ_p, w ↦ α, where α
 *               is the Hensel lift of a root of the minimal polynomial mod p.
 *   f > 1       links grow to P¹(F_{p^f}): e.g. ℚ(i) at 3 has a 10-regular tree.
 *   e > 1       π ≠ p; the ℚ_p-tree sits inside with its edges cut into e.
 *
 * A vertex is a ball ⌊x⌋_k = x + π^k 𝒪_𝔭, labelled by the π-adic digits of x:
 *     x = Σ_{lo ≤ j < k} r[d_j] π^j,   d_j ∈ {0, …, q−1},
 * where r[0] = 0, r[1], …, r[q−1] ∈ 𝒪_K reduce to the q elements of F_q. With
 * K = ℚ these are the familiar labels x ∈ ℤ[1/p] ∩ [0, p^k). Distances and the
 * tree's neighbours are pure digit combinatorics; only the group action needs
 * the field.
 *
 * Everything is exact. Elements are kept in coordinates on a p-maximal order
 * O (Round 2), and v_𝔭 comes from an anti-uniformizer of 𝔭 in O
 * (numberRings/ringEngine.js, loaded as the global NumberRingEngine).
 */

const NR = globalThis.NumberRingEngine;
if (!NR) throw new Error('localField.js needs numberRings/ringEngine.js (NumberRingEngine) loaded first');
const X = NR._internal;
const { Rat, R0, R1, bgcd, blcm, bmod, modInv, vpInt, pw, ratVecMat, ratInverse, rrefModP, idealMul,
    valuationSV, primesAbove, unitVec, twoElement, isProbablePrime } = X;
const { parseExpr } = NR;

// ───────────────────────── elements: { v: BigInt[] (O-coordinates), den } ─────────────────────────

function svNorm(v, den) {
    if (den < 0n) { den = -den; v = v.map((x) => -x); }
    if (den !== 1n) {
        let g = den;
        for (const x of v) { if (x !== 0n) { g = bgcd(g, x); if (g === 1n) break; } }
        if (g > 1n) { v = v.map((x) => x / g); den /= g; }
    }
    return { v, den };
}
const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const SUBSCRIPT = { '-': '₋', 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
export const sup = (n) => String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
export const sub = (n) => String(n).split('').map((c) => SUBSCRIPT[c] ?? c).join('');

/** LaTeX from MathQuill (or plain text) → the plain syntax of ringEngine's parser. */
export function latexToPlain(latex) {
    let s = String(latex ?? '').trim();
    if (!s) return '';
    s = s.replace(/\\left|\\right|\\displaystyle|\\[,;:! ]|\\quad|\\qquad/g, ' ');
    let prev;
    do {
        prev = s;
        s = s.replace(/\\[dt]?frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '(($1)/($2))');
        s = s.replace(/\\sqrt\s*\[((?:[^{}]|\{[^{}]*\})*)\]\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, 'sqrt($2)');
        s = s.replace(/\\sqrt\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, 'sqrt($1)');
    } while (s !== prev);
    const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
        theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ',
        upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', pi: 'π' };
    s = s.replace(/\\([a-zA-Z]+)/g, (m, w) => {
        if (GREEK[w]) return GREEK[w];
        if (w === 'cdot' || w === 'times') return '*';
        if (w === 'div') return '/';
        if (w === 'operatorname' || w === 'mathrm' || w === 'text') return '';
        return w; // sqrt, sin, … : the parser explains these are not field elements
    });
    s = s.replace(/[{\[]/g, '(').replace(/[}\]]/g, ')');
    return s;
}

/** Monic-polynomial display helpers, plain and TeX, ascending powers (a + b w + c w²). */
function fmtCoeffTerm(c, mono, tex, first) {
    // c: Rat ≠ 0; mono: '' or the monomial string
    const neg = c.n < 0n;
    const a = neg ? c.neg() : c;
    let coef;
    if (mono && a.n === 1n && a.d === 1n) coef = '';
    else if (tex) coef = a.d === 1n ? `${a.n}` : `\\tfrac{${a.n}}{${a.d}}`;
    else coef = a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`;
    const body = coef && mono ? (tex ? `${coef}${mono}` : `${coef} ${mono}`) : (coef || mono);
    if (first) return (neg ? (tex ? '-' : '−') : '') + body;
    return (neg ? (tex ? ' - ' : ' − ') : ' + ') + body;
}

// ───────────────────────── the global field ─────────────────────────

export class GlobalField {
    /**
     * spec = { gen: 'w', poly: 'w^2+1' }, or null for ℚ.
     */
    constructor(spec = null) {
        this.isQ = !spec;
        if (this.isQ) {
            this.gen = null;
            this.field = NR.defineField('x');
        } else {
            const gen = String(spec.gen || 'w').trim() || 'w';
            if (!/^([A-Za-z]|alpha|theta|[α-ωΑ-Ω])$/.test(gen)) {
                throw new Error('name the generator with a single letter, e.g. w (or α)');
            }
            this.gen = gen;
            const polySrc = String(spec.poly || '').trim();
            if (!polySrc) throw new Error(`enter the minimal polynomial of ${gen}`);
            let ast;
            try { ast = parseExpr(polySrc); } catch (e) { throw new Error(`minimal polynomial: ${e.message}`); }
            const letters = new Set();
            (function walk(a) { if (a.t === 'var') letters.add(a.name); for (const k of ['a', 'b', 'e']) if (a[k]) walk(a[k]); })(ast);
            for (const L of letters) if (L !== gen) throw new Error(`write the minimal polynomial in ${gen} (found ${L})`);
            try { this.field = NR.defineField(polySrc); }
            catch (e) {
                throw new Error(e.message.replace(/\bf = /g, '').replace(/\bf\b/g, 'the polynomial').replace(/\bx\b/g, gen));
            }
        }
        const S = this.field.sub;
        this.n = this.field.n;
        this.K = this.field.K;                   // PolyAlg: coordinates in 1, w, …, w^{n−1}
        this.O = S.O;                            // maximal order, rows in θ-coordinates
        this.subData = S;
        const Pinv = ratInverse(S.P);            // K-coords → θ-coords
        this.M_KO = matMul(Pinv, S.O.Binv);      // K-coords → O-coords
        this.M_OK = matMul(S.O.B, S.P);          // O-coords → K-coords
        this.Fint = this.field.F;                // primitive integral polynomial (BigInt, low → high)
        this._primes = new Map();
        this._zero = { v: new Array(this.n).fill(0n), den: 1n };
        this._one = this.fromRat(R1);
    }

    describe() { return this.isQ ? 'ℚ' : `ℚ(${this.gen})`; }
    describeTex() { return this.isQ ? '\\mathbb{Q}' : `\\mathbb{Q}(${this.genTex()})`; }
    genTex() {
        const g = this.gen;
        const map = { 'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ζ': '\\zeta', 'θ': '\\theta', 'ω': '\\omega', 'φ': '\\varphi', alpha: '\\alpha', theta: '\\theta' };
        return map[g] || g;
    }
    polyPlain() { return this.isQ ? '' : polyString(this.Fint, this.gen); }
    polyTex() { return this.isQ ? '' : X.polyTex(this.Fint, this.genTex()); }

    // ── conversions ──
    fromK(c) {                                    // Rat[] in w-coordinates
        const o = ratVecMat(c, this.M_KO);
        let den = 1n; for (const x of o) den = blcm(den, x.d);
        return svNorm(o.map((x) => x.n * (den / x.d)), den);
    }
    toK(x) {
        const c = ratVecMat(x.v.map((t) => new Rat(t, x.den)), this.M_OK);
        return c;
    }
    fromRat(r) { return this.fromK(this.K.fromRat(r)); }
    fromInt(n) { return this.fromRat(new Rat(BigInt(n))); }
    generator() { return this.isQ ? null : this.fromK(this.K.gen()); }
    zero() { return this._zero; }
    one() { return this._one; }

    // ── arithmetic ──
    add(a, b) {
        if (a.den === b.den) return svNorm(a.v.map((x, i) => x + b.v[i]), a.den);
        const L = blcm(a.den, b.den), fa = L / a.den, fb = L / b.den;
        return svNorm(a.v.map((x, i) => x * fa + b.v[i] * fb), L);
    }
    sub(a, b) {
        if (a.den === b.den) return svNorm(a.v.map((x, i) => x - b.v[i]), a.den);
        const L = blcm(a.den, b.den), fa = L / a.den, fb = L / b.den;
        return svNorm(a.v.map((x, i) => x * fa - b.v[i] * fb), L);
    }
    neg(a) { return { v: a.v.map((x) => -x), den: a.den }; }
    mul(a, b) {
        if (this.n === 1) return svNorm([a.v[0] * b.v[0] * this.O.C[0][0][0]], a.den * b.den);
        return svNorm(this.O.mul(a.v, b.v), a.den * b.den);
    }
    scaleInt(a, m) { return svNorm(a.v.map((x) => x * m), a.den); }
    divInt(a, m) { return svNorm(a.v, a.den * m); }
    inv(a) {
        if (this.isZero(a)) throw new Error('division by zero');
        if (this.n === 1) {
            const one = this.O.one[0];                // coordinates of 1 (±1)
            // a = t·b with b the basis element; a⁻¹ = (1/t)·b⁻¹ and b = one⁻¹·1
            return svNorm([a.den * one * one], a.v[0]);
        }
        return this.fromK(this.K.inv(this.toK(a)));
    }
    div(a, b) { return this.mul(a, this.inv(b)); }
    pow(a, k) {
        let e = BigInt(k), base = a, r = this.one();
        if (e < 0n) { base = this.inv(a); e = -e; }
        while (e > 0n) { if (e & 1n) r = this.mul(r, base); base = this.mul(base, base); e >>= 1n; }
        return r;
    }
    isZero(a) { return a.v.every((x) => x === 0n); }
    equals(a, b) { return a.den === b.den && a.v.every((x, i) => x === b.v[i]); }
    key(a) { return `${a.v.join(',')}/${a.den}`; }

    // ── reading and writing ──
    /**
     * Parse a plain-text expression (see latexToPlain for LaTeX input) to an element.
     * scope: Map name → element (named constants).
     */
    parse(src, scope = null) {
        const text = String(src ?? '').trim();
        if (!text) return this.zero();
        const ast = parseExpr(text);
        const K = this.K;
        const walk = (a) => {
            switch (a.t) {
                case 'num': return K.fromRat(a.v);
                case 'var': {
                    if (scope && scope.has(a.name)) return this.toK(scope.get(a.name));
                    if (a.name === this.gen) return K.gen();
                    if (this.isQ) throw new Error(`unknown symbol ${a.name}: define it as a constant, or turn on a number field generated by ${a.name}`);
                    throw new Error(`unknown symbol ${a.name} (the field generator is ${this.gen})`);
                }
                case 'neg': return K.neg(walk(a.a));
                case 'add': return K.add(walk(a.a), walk(a.b));
                case 'sub': return K.sub(walk(a.a), walk(a.b));
                case 'mul': return K.mul(walk(a.a), walk(a.b));
                case 'div': {
                    const d = walk(a.b);
                    if (K.isZero(d)) throw new Error('division by zero');
                    return K.mul(walk(a.a), K.inv(d));
                }
                case 'pow': {
                    const e = walk(a.e);
                    if (e.slice(1).some((x) => !x.isZero()) || !e[0].isInt()) throw new Error('exponents must be integers');
                    if (e[0].n > 10000n || e[0].n < -10000n) throw new Error('exponent too large');
                    const b = walk(a.a);
                    if (e[0].n < 0n && K.isZero(b)) throw new Error('division by zero');
                    return K.pow(b, e[0].n);
                }
            }
            throw new Error('internal: bad expression');
        };
        return this.fromK(walk(ast));
    }

    /** Plain text, re-readable by parse(): "1/3 + 2 w − w^2". */
    format(x) { return this._fmt(x, false); }
    /** LaTeX. */
    tex(x) { return this._fmt(x, true); }
    _fmt(x, tex) {
        const c = this.toK(x);
        const g = tex ? this.genTex() : (this.gen || 'x');
        const parts = [];
        for (let i = 0; i < c.length; i++) {
            if (c[i].isZero()) continue;
            const mono = i === 0 ? '' : i === 1 ? g : (tex ? `${g}^{${i}}` : `${g}^${i}`);
            parts.push(fmtCoeffTerm(c[i], mono, tex, parts.length === 0));
        }
        return parts.length ? parts.join('') : '0';
    }
    /** Short display size, for choosing nice representatives. */
    height(x) { return this.format(x).length; }

    // ── primes ──
    primesAbove(p) {
        const key = String(p);
        if (!this._primes.has(key)) this._primes.set(key, primesAbove(this.O, BigInt(p)));
        return this._primes.get(key);
    }
    /** "(5, w − 2)": the prime as a two-element ideal, TeX. */
    primeTex(pr) {
        try {
            const toTex = (ocoords) => this.tex(svNorm(ocoords.map((t) => BigInt(t)), 1n));
            return twoElement(this.subData, pr, toTex);
        } catch (e) { return `\\mathfrak{p}`; }
    }
}

function matMul(A, B) {
    const n = A.length, m = B[0].length, k = B.length;
    const out = [];
    for (let i = 0; i < n; i++) {
        const row = new Array(m).fill(R0);
        for (let t = 0; t < k; t++) {
            if (A[i][t].isZero()) continue;
            for (let j = 0; j < m; j++) if (!B[t][j].isZero()) row[j] = row[j].add(A[i][t].mul(B[t][j]));
        }
        out.push(row);
    }
    return out;
}

function polyString(F, x) {
    const parts = [];
    for (let i = F.length - 1; i >= 0; i--) {
        if (F[i] === 0n) continue;
        const neg = F[i] < 0n, a = neg ? -F[i] : F[i];
        const mono = i === 0 ? '' : i === 1 ? x : `${x}^${i}`;
        const coef = mono && a === 1n ? '' : `${a}`;
        const body = coef + mono;
        parts.push(parts.length ? `${neg ? ' − ' : ' + '}${body}` : `${neg ? '−' : ''}${body}`);
    }
    return parts.join('') || '0';
}

/** Solve x·M = r over F_p for square invertible M (rows); returns x. */
function solveModP(M, r, p) {
    const n = M.length;
    // Transpose system: Mᵀ xᵀ = rᵀ
    const A = [];
    for (let j = 0; j < n; j++) { const row = []; for (let i = 0; i < n; i++) row.push(bmod(M[i][j], p)); row.push(bmod(r[j], p)); A.push(row); }
    for (let c = 0; c < n; c++) {
        let piv = c; while (piv < n && A[piv][c] === 0n) piv++;
        if (piv === n) throw new Error('internal: singular residue basis');
        [A[c], A[piv]] = [A[piv], A[c]];
        const inv = modInv(A[c][c], p);
        A[c] = A[c].map((x) => x * inv % p);
        for (let i = 0; i < n; i++) {
            if (i === c || A[i][c] === 0n) continue;
            const f = A[i][c];
            A[i] = A[i].map((x, j) => bmod(x - f * A[c][j], p));
        }
    }
    return A.map((row) => row[n]);
}

// ───────────────────────── the place 𝔭 | p ─────────────────────────

export const MAX_RESIDUE_FIELD = 1 << 16;

export class Place {
    /**
     * @param F      GlobalField
     * @param p      prime (BigInt or number)
     * @param index  which prime above p (in the order of F.primesAbove(p))
     */
    constructor(F, p, index = 0) {
        p = BigInt(p);
        if (p < 2n || !isProbablePrime(p)) throw new Error(`${p} is not prime`);
        this.F = F;
        this.p = p;
        const primes = F.primesAbove(p);
        if (!primes.length) throw new Error(`no prime of ${F.describe()} above ${p}`);
        this.index = Math.min(Math.max(0, index | 0), primes.length - 1);
        this.primes = primes;
        const pr = this.pr = primes[this.index];
        this.e = pr.e;
        this.f = pr.f;
        const qBig = pw(p, this.f);
        if (qBig > BigInt(MAX_RESIDUE_FIELD)) throw new Error(`the residue field F_${p}^${this.f} is too large to draw`);
        this.q = Number(qBig);
        this.pNum = Number(p);
        const O = F.O, n = F.n;

        // residue map O → O/𝔭 ≅ F_p^f: reduce modulo the rows of 𝔭/pO
        const R = rrefModP(pr.H, p);
        this._rref = R;
        const piv = new Set(R.pivots);
        this._free = [];
        for (let j = 0; j < n; j++) if (!piv.has(j)) this._free.push(j);
        if (this._free.length !== this.f) throw new Error('internal: residue degree mismatch');

        // separator: s ≡ 1 mod 𝔭 and s ∈ 𝔮 for the other primes 𝔮 | p
        this._others = primes.filter((q) => q !== pr);
        this._sep = null;
        this._sepPow = [F.one()];
        this._eOthers = Math.max(0, ...this._others.map((q) => q.e));
        if (this._others.length) this._sep = this._separator();

        // residue representatives r[0..q−1] = Σ c_j β_j, β a basis of the residue field
        this._chooseResidueBasis();
        this._digitCache = new Map();

        // uniformizer
        this._chooseUniformizer();
        this._piPow = new Map([[0, F.one()], [1, this.pi]]);
        this.piInv = this.e === 1 ? F.divInt(F.one(), p) : F.inv(this.pi);
        this._piPow.set(-1, this.piInv);

        this._elemCache = new Map();
    }

    get valence() { return this.q + 1; }

    // ── valuation and residues ──
    val(x) {
        if (this.F.isZero(x)) return Infinity;
        return valuationSV(this.F.O, this.pr, x);
    }

    /** Residue vector in F_p^f (coordinates on the free columns) of a p-integral element. */
    _residueVecIntegral(x) {
        const p = this.p;
        const dinv = x.den === 1n ? 1n : modInv(bmod(x.den, p), p);
        const v = x.v.map((t) => bmod(t, p) * dinv % p);
        const { rows, pivots } = this._rref;
        rows.forEach((row, r) => {
            const t = v[pivots[r]];
            if (t) for (let j = 0; j < v.length; j++) v[j] = bmod(v[j] - t * row[j], p);
        });
        return this._free.map((j) => v[j]);
    }
    /** Residue vector of an element with v_𝔭 ≥ 0 (poles at the other primes above p are allowed). */
    residueVec(x) {
        let t = vpInt(x.den, this.p);
        if (t > 0) {
            if (!this._sep) throw new Error('internal: element is not 𝔭-integral');
            x = this.F.mul(x, this._sepPower(t * this._eOthers));
            t = vpInt(x.den, this.p);
            if (t > 0) throw new Error('internal: separator did not clear the poles');
        }
        return this._residueVecIntegral(x);
    }
    /** Digit index (0 … q−1) of the residue of x, v_𝔭(x) ≥ 0. */
    residueIndex(x) {
        const r = this.residueVec(x);
        if (r.every((t) => t === 0n)) return 0;
        const c = this.f === 1 ? [r[0] * this._betaInv[0][0] % this.p] : solveModP(this._betaRes, r, this.p);
        let idx = 0, mult = 1;
        for (let j = 0; j < this.f; j++) { idx += Number(c[j]) * mult; mult *= this.pNum; }
        return idx;
    }
    /** r[i]: the residue representative with digit index i. */
    digit(i) {
        if (i === 0) return this.F.zero();
        let d = this._digitCache.get(i);
        if (d) return d;
        let acc = this.F.zero(), t = i;
        for (let j = 0; j < this.f; j++) {
            const c = t % this.pNum; t = (t - c) / this.pNum;
            if (c) acc = this.F.add(acc, this.F.scaleInt(this._beta[j], BigInt(c)));
        }
        this._digitCache.set(i, acc);
        return acc;
    }
    digitLabel(i) { return this.F.format(this.digit(i)); }
    digitTex(i) { return this.F.tex(this.digit(i)); }

    piPow(j) {
        let x = this._piPow.get(j);
        if (x) return x;
        const step = j > 0 ? this.pi : this.piInv;
        const near = j > 0 ? j - 1 : j + 1;
        x = this.F.mul(this.piPow(near), step);
        this._piPow.set(j, x);
        return x;
    }
    _divPi(x) { return this.e === 1 ? this.F.divInt(x, this.p) : this.F.mul(x, this.piInv); }

    _sepPower(m) {
        while (this._sepPow.length <= m) this._sepPow.push(this.F.mul(this._sepPow[this._sepPow.length - 1], this._sep));
        return this._sepPow[m];
    }

    _separator() {
        const F = this.F, O = F.O, n = F.n, p = this.p;
        let J = this._others[0].H;
        for (const q of this._others.slice(1)) J = idealMul(O, J, q.H, p);
        // residues of J's rows; solve Σ λ_i res(J_i) = res(1)
        const res = J.map((row) => this._residueVecIntegral({ v: row.slice(), den: 1n }));
        const target = this._residueVecIntegral(F.one());
        // Gaussian elimination over F_p on the augmented system resᵀ λ = target
        const m = J.length, f = this.f;
        const A = [];
        for (let j = 0; j < f; j++) { const row = []; for (let i = 0; i < m; i++) row.push(res[i][j]); row.push(target[j]); A.push(row); }
        const pivCols = [];
        let r = 0;
        for (let c = 0; c < m && r < f; c++) {
            let k = r; while (k < f && A[k][c] === 0n) k++;
            if (k === f) continue;
            [A[r], A[k]] = [A[k], A[r]];
            const inv = modInv(A[r][c], p);
            A[r] = A[r].map((x) => x * inv % p);
            for (let i = 0; i < f; i++) if (i !== r && A[i][c]) { const t = A[i][c]; A[i] = A[i].map((x, j) => bmod(x - t * A[r][j], p)); }
            pivCols.push(c); r++;
        }
        const lambda = new Array(m).fill(0n);
        pivCols.forEach((c, i) => { lambda[c] = A[i][m]; });
        const s = new Array(n).fill(0n);
        J.forEach((row, i) => { if (lambda[i]) for (let j = 0; j < n; j++) s[j] += lambda[i] * row[j]; });
        const sep = svNorm(s, 1n);
        const chk = this._residueVecIntegral(sep);
        if (!chk.every((t, j) => t === target[j])) throw new Error('internal: separator');
        return sep;
    }

    _chooseResidueBasis() {
        const F = this.F, p = this.p, f = this.f;
        const cands = [F.one()];
        if (!F.isQ) {
            const w = F.generator();
            let pw_ = F.one();
            for (let k = 1; k < F.n; k++) { pw_ = F.mul(pw_, w); cands.push(pw_); }
        }
        for (let i = 0; i < F.n; i++) cands.push(svNorm(unitVec(F.n, i), 1n));
        const beta = [], res = [];
        for (const c of cands) {
            if (beta.length === f) break;
            if (vpInt(c.den, p) > 0) continue;       // only p-integral representatives
            const r = this._residueVecIntegral(c);
            // independent of the residues chosen so far?
            const trial = res.concat([r]);
            const { rows } = rrefModP(trial.map((x) => x.slice()), p);
            if (rows.length === trial.length) { beta.push(c); res.push(r); }
        }
        if (beta.length !== f) throw new Error('internal: no residue basis');
        this._beta = beta;
        this._betaRes = res;
        this._betaInv = f === 1 ? [[modInv(res[0][0], p)]] : null;
        // Is the residue field generated by w̄ (β_j = w^j)? Then F_q = F_p[w̄]/(ḡ).
        this.residueGeneratedByGen = !F.isQ && f > 1 && beta.every((b, j) => j === 0 || F.equals(b, F.pow(F.generator(), j)));
        if (this.residueGeneratedByGen) {
            const wf = F.pow(F.generator(), f);
            this.residuePoly = vpInt(wf.den, p) === 0 ? (() => {
                const c = solveModP(res, this._residueVecIntegral(wf), p);
                // w̄^f = Σ c_j w̄^j  →  ḡ(x) = x^f − Σ c_j x^j
                return c.map((t) => bmod(-t, p)).concat([1n]);
            })() : null;
        }
    }

    _chooseUniformizer() {
        const F = this.F, p = this.p;
        if (this.e === 1) { this.pi = F.fromInt(p); return; }
        const cands = [];
        const push = (x) => { if (x && !F.isZero(x)) cands.push(x); };
        if (!F.isQ) {
            const w = F.generator();
            const powers = [w];
            for (let k = 2; k < F.n; k++) powers.push(F.mul(powers[powers.length - 1], w));
            for (const b of powers) {
                for (let r = 0n; r < p && r <= 12n; r++) {
                    push(F.sub(b, F.fromInt(r)));
                    if (r) push(F.add(b, F.fromInt(r)));
                }
            }
        }
        for (let i = 0; i < F.n; i++) {
            const b = svNorm(unitVec(F.n, i), 1n);
            for (let r = 0n; r < p && r <= 12n; r++) { push(F.sub(b, F.fromInt(r))); if (r) push(F.add(b, F.fromInt(r))); }
        }
        for (const row of this.pr.H) push(svNorm(row.slice(), 1n));
        let best = null, bestScore = Infinity;
        for (const c of cands) {
            if (this.val(c) !== 1) continue;
            const score = F.height(c);
            if (score < bestScore) { best = c; bestScore = score; }
        }
        if (!best) {
            // a ℤ-combination of the generators of 𝔭 has valuation exactly 1
            const rng = X.makeRng(97);
            for (let t = 0; t < 2000 && !best; t++) {
                const s = new Array(F.n).fill(0n);
                for (const row of this.pr.H) { const c = BigInt(rng.int(5) - 2); for (let j = 0; j < F.n; j++) s[j] += c * row[j]; }
                const x = svNorm(s, 1n);
                if (!F.isZero(x) && this.val(x) === 1) best = x;
            }
        }
        if (!best) throw new Error('internal: no uniformizer found');
        this.pi = best;
    }

    // ── vertices ⌊x⌋_k = { k, lo, d } with x = Σ r[d_i] π^{lo+i} ──

    /** The canonical vertex ⌊x⌋_k. */
    canon(x, k) {
        const F = this.F;
        if (!Number.isFinite(k)) throw new Error('internal: infinite level');
        if (F.isZero(x)) return { k, lo: k, d: [] };
        const v = this.val(x);
        if (v >= k) return { k, lo: k, d: [] };
        const d = [];
        let y = F.mul(x, this.piPow(-v));
        for (let j = v; j < k; j++) {
            if (F.isZero(y)) { while (d.length < k - v) d.push(0); break; }
            const di = this.residueIndex(y);
            d.push(di);
            if (j + 1 < k) y = this._divPi(di ? F.sub(y, this.digit(di)) : y);
        }
        return { k, lo: v, d };
    }
    id(vt) { return `${vt.k}:${vt.lo}:${vt.d.join('.')}`; }
    /** The label x of ⌊x⌋_k as an element of K. */
    elem(vt) {
        const id = this.id(vt);
        let x = this._elemCache.get(id);
        if (x) return x;
        x = this.F.zero();
        for (let i = 0; i < vt.d.length; i++) {
            if (vt.d[i]) x = this.F.add(x, this.F.mul(this.digit(vt.d[i]), this.piPow(vt.lo + i)));
        }
        if (this._elemCache.size > 200000) this._elemCache.clear();
        this._elemCache.set(id, x);
        return x;
    }
    label(vt) { return this.F.format(this.elem(vt)); }
    labelTex(vt) { return this.F.tex(this.elem(vt)); }

    digitAt(vt, j) { return (j < vt.lo || j >= vt.k) ? 0 : vt.d[j - vt.lo]; }
    /**
     * Whether ⌊x⌋_k lies on the ℚ_p-tree, for an unramified place (e = 1): the
     * digits r[0..p−1] are the integers 0..p−1, so this says x ∈ ℚ_p.
     */
    isRational(vt) { return this.e === 1 && vt.d.every((di) => di < this.pNum); }
    /** Tree distance. */
    dist(a, b) {
        const m = Math.min(a.k, b.k);
        for (let j = Math.min(a.lo, b.lo); j < m; j++) {
            if (this.digitAt(a, j) !== this.digitAt(b, j)) return a.k + b.k - 2 * j;
        }
        return Math.abs(a.k - b.k);
    }
    parent(vt) {
        const k = vt.k - 1;
        if (k <= vt.lo) return { k, lo: k, d: [] };
        return { k, lo: vt.lo, d: vt.d.slice(0, k - vt.lo) };
    }
    child(vt, r) {
        const k = vt.k + 1;
        if (!vt.d.length) return r ? { k, lo: vt.k, d: [r] } : { k, lo: k, d: [] };
        return { k, lo: vt.lo, d: vt.d.concat([r]) };
    }
    children(vt) { const out = []; for (let r = 0; r < this.q; r++) out.push(this.child(vt, r)); return out; }
    neighbors(vt) { return [this.parent(vt)].concat(this.children(vt)); }
    /** The point of P¹(F_q) naming neighbour u of vt: '∞' for the parent, else the digit index. */
    linkPoint(vt, u) {
        if (u.k === vt.k - 1) return Infinity;
        return this.digitAt(u, vt.k);
    }
    /** The ancestor of vt at level j ≤ vt.k. */
    ancestor(vt, j) {
        if (j >= vt.k) return vt;
        if (j <= vt.lo) return { k: j, lo: j, d: [] };
        return { k: j, lo: vt.lo, d: vt.d.slice(0, j - vt.lo) };
    }

    // ── the action of PGL₂(K) ──

    /** Precompute a generator matrix [[a, b], [c, d]] (elements of K). */
    prepare(m) {
        const F = this.F;
        const det = F.sub(F.mul(m.a, m.d), F.mul(m.b, m.c));
        if (F.isZero(det)) throw new Error('matrix has determinant 0');
        const g = { a: m.a, b: m.b, c: m.c, d: m.d, det, vdet: this.val(det), vc: this.val(m.c), cache: new Map() };
        g.aOverC = F.isZero(m.c) ? null : F.div(m.a, m.c);
        return g;
    }
    /** Projective inverse (the adjugate). */
    adjugate(m) { const F = this.F; return { a: m.d, b: F.neg(m.b), c: F.neg(m.c), d: m.a }; }

    /** g · ⌊x⌋_k. */
    act(g, vt) {
        const F = this.F, k = vt.k;
        const x = this.elem(vt);
        const D = F.add(F.mul(g.c, x), g.d);
        const vD = this.val(D);
        const vC = g.vc + k;                       // v(c·π^k), Infinity when c = 0
        if (vC < vD) {
            const kk = g.vdet + k - 2 * vC;
            let w = g.cache.get(kk);
            if (!w) { w = this.canon(g.aOverC, kk); g.cache.set(kk, w); }
            return w;
        }
        const kk = g.vdet + k - 2 * vD;
        const B = F.add(F.mul(g.a, x), g.b);
        return this.canon(F.div(B, D), kk);
    }
}

/**
 * A minimal polynomial (in `gen`) of a field in which p is inert of degree k,
 * so that K_𝔭 is the unramified extension ℚ_{p^k}: the simplest candidate that works.
 */
export function unramifiedPolynomial(p, k, gen = 'w') {
    p = BigInt(p);
    if (k === 1) return `${gen}`;
    // w^k + c·w^j + a·w + b (1 < j < k), simplest first: small coefficients,
    // then pure radicals w^k − n, then fewer terms and minus signs.
    const B = 6, cands = [];
    const js = [0]; for (let j = k - 1; j >= 2; j--) js.push(j);
    for (const j of js) for (let a = -B; a <= B; a++) for (let b = -B; b <= B; b++) for (const c of j ? [1, -1] : [0]) {
        if (b === 0) continue;
        let t = `${gen}^${k}`;
        if (c) t += ` ${c < 0 ? '-' : '+'} ${gen}^${j}`;
        if (a) t += ` ${a < 0 ? '-' : '+'} ${Math.abs(a) === 1 ? '' : Math.abs(a)}${gen}`;
        t += ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}`;
        const terms = (a ? 1 : 0) + (c ? 1 : 0);
        cands.push({ t, key: [Math.abs(a) + Math.abs(b) + Math.abs(c), terms, (a < 0) + (b < 0) + (c < 0), Math.abs(b), j ? k - j : 0] });
    }
    const cmp = (x, y) => { for (let i = 0; i < x.key.length; i++) if (x.key[i] !== y.key[i]) return x.key[i] - y.key[i]; return 0; };
    cands.sort(cmp);
    for (const { t: poly } of cands.slice(0, 600)) {
        try {
            const F = new GlobalField({ gen, poly });
            const prs = F.primesAbove(p);
            if (prs.length === 1 && prs[0].f === k) return poly.replace(/\s+/g, '');
        } catch (e) { /* reducible: next */ }
    }
    throw new Error(`no simple polynomial found for the unramified extension of degree ${k}`);
}
