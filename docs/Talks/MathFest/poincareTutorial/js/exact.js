/**
 * exact.js — exact arithmetic over a user-defined number field.
 *
 * K = Q[w]/(f(w)) for a user-supplied minimal polynomial f with rational
 * coefficients. Elements are polynomials in w of degree < deg f with BigInt
 * rational coefficients; a chosen complex root of f gives the embedding
 * K ↪ C used for all floating-point geometry, so the floats and the exact
 * values agree by construction.
 *
 * The certifier uses this layer to verify the ALGEBRAIC halves of the
 * Poincaré conditions exactly (pairing involutions s_i·s_j ≡ I and edge
 * cycle relations P^m ≡ I, projectively in PGL2(K)); the combinatorics and
 * dihedral angles remain floating point.
 */

// ---------------- Rationals (BigInt) ----------------

function bgcd(a, b) {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b) { [a, b] = [b, a % b]; }
    return a;
}

export class Frac {
    constructor(p, q = 1n) {
        p = BigInt(p); q = BigInt(q);
        if (q === 0n) throw new Error('division by zero (rational)');
        if (q < 0n) { p = -p; q = -q; }
        const g = bgcd(p, q) || 1n;
        this.p = p / g; this.q = q / g;
    }
    add(o) { return new Frac(this.p * o.q + o.p * this.q, this.q * o.q); }
    sub(o) { return new Frac(this.p * o.q - o.p * this.q, this.q * o.q); }
    mul(o) { return new Frac(this.p * o.p, this.q * o.q); }
    div(o) { return new Frac(this.p * o.q, this.q * o.p); }
    neg() { return new Frac(-this.p, this.q); }
    isZero() { return this.p === 0n; }
    equals(o) { return this.p === o.p && this.q === o.q; }
    toNumber() { return Number(this.p) / Number(this.q); }
    toString() { return this.q === 1n ? `${this.p}` : `${this.p}/${this.q}`; }
}
const F0 = new Frac(0n), F1 = new Frac(1n);

/** Exact rational from a JS number (integers and finite decimals). */
export function fracFromNumber(v) {
    if (Number.isInteger(v)) return new Frac(BigInt(v));
    const s = String(v);
    const m = s.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!m) throw new Error(`cannot represent ${v} exactly`);
    const sign = m[1] === '-' ? -1n : 1n;
    const intPart = m[2], fracPart = m[3] || '';
    const exp = m[4] ? parseInt(m[4], 10) : 0;
    let p = BigInt(intPart + fracPart) * sign;
    let q = 10n ** BigInt(fracPart.length);
    if (exp > 0) p *= 10n ** BigInt(exp);
    else if (exp < 0) q *= 10n ** BigInt(-exp);
    return new Frac(p, q);
}

// ---------------- Polynomials over Q ----------------
// Represented as arrays of Frac, index = degree, trimmed.

function ptrim(a) {
    let n = a.length;
    while (n > 0 && a[n - 1].isZero()) n--;
    return a.slice(0, n);
}
function padd(a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((a[i] || F0).add(b[i] || F0));
    return ptrim(out);
}
function psub(a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((a[i] || F0).sub(b[i] || F0));
    return ptrim(out);
}
function pmul(a, b) {
    if (a.length === 0 || b.length === 0) return [];
    const out = new Array(a.length + b.length - 1).fill(F0);
    for (let i = 0; i < a.length; i++)
        for (let j = 0; j < b.length; j++)
            out[i + j] = out[i + j].add(a[i].mul(b[j]));
    return ptrim(out);
}
function pscale(a, c) { return ptrim(a.map(x => x.mul(c))); }

/** Remainder of a mod b (b nonzero). */
function pmod(a, b) {
    let r = a.slice();
    const db = b.length - 1, lead = b[db];
    while (r.length - 1 >= db && r.length > 0) {
        const dr = r.length - 1;
        const c = r[dr].div(lead);
        for (let i = 0; i <= db; i++) {
            r[dr - db + i] = r[dr - db + i].sub(b[i].mul(c));
        }
        r = ptrim(r);
    }
    return r;
}

/** Extended gcd in Q[x]: returns {g, u} with u·a ≡ g (mod m), g the gcd. */
function pextgcd(a, m) {
    let r0 = m.slice(), r1 = a.slice();
    let u0 = [], u1 = [F1];
    while (r1.length > 0) {
        // quotient of r0 by r1
        let q = [], r = r0.slice();
        const d1 = r1.length - 1, lead = r1[d1];
        while (r.length - 1 >= d1 && r.length > 0) {
            const dr = r.length - 1;
            const c = r[dr].div(lead);
            const qi = new Array(dr - d1 + 1).fill(F0); qi[dr - d1] = c;
            q = padd(q, qi);
            r = psub(r, pmul(qi, r1));
        }
        [r0, r1] = [r1, r];
        [u0, u1] = [u1, psub(u0, pmul(q, u1))];
    }
    return { g: r0, u: u0 };
}

// ---------------- The number field ----------------

export class NumberField {
    /**
     * @param minpoly Poly (array of Frac), degree ≥ 1, in the generator.
     * @param genName display name of the generator, e.g. 'w'.
     */
    constructor(minpoly, genName) {
        if (!minpoly || minpoly.length < 2) throw new Error('minimal polynomial must have degree ≥ 1');
        this.f = minpoly;
        this.gen = genName;
        this.deg = minpoly.length - 1;
        this.roots = polyComplexRoots(minpoly.map(c => c.toNumber()));
        this.rootIndex = 0;
    }
    describe() {
        return this.deg === 1 ? 'Q' : `Q(${this.gen})`;
    }
    elem(poly) { return new KElem(this, pmod(ptrim(poly), this.f)); }
    zero() { return this.elem([]); }
    one() { return this.elem([F1]); }
    fromFrac(fr) { return this.elem([fr]); }
    generator() { return this.elem([F0, F1]); }
    root() { return this.roots[Math.min(this.rootIndex, this.roots.length - 1)]; }
}

export class KElem {
    constructor(field, coeffs) { this.K = field; this.c = coeffs; }
    add(o) { return new KElem(this.K, padd(this.c, o.c)); }
    sub(o) { return new KElem(this.K, psub(this.c, o.c)); }
    neg() { return new KElem(this.K, pscale(this.c, new Frac(-1n))); }
    mul(o) { return this.K.elem(pmul(this.c, o.c)); }
    inv() {
        if (this.c.length === 0) throw new Error('division by zero in the field');
        const { g, u } = pextgcd(this.c, this.K.f);
        if (g.length !== 1) throw new Error('element not invertible — is the minimal polynomial irreducible?');
        return this.K.elem(pscale(u, F1.div(g[0])));
    }
    div(o) { return this.mul(o.inv()); }
    pow(n) {
        if (n < 0) return this.inv().pow(-n);
        let r = this.K.one(), b = this;
        while (n > 0) {
            if (n & 1) r = r.mul(b);
            b = b.mul(b); n >>= 1;
        }
        return r;
    }
    isZero() { return this.c.length === 0; }
    equals(o) {
        if (this.c.length !== o.c.length) return false;
        return this.c.every((x, i) => x.equals(o.c[i]));
    }
    /** Complex embedding at the field's chosen root. */
    embed() {
        const a = this.K.root();
        let re = 0, im = 0;                     // Horner from the top
        for (let i = this.c.length - 1; i >= 0; i--) {
            const nre = re * a.re - im * a.im + this.c[i].toNumber();
            im = re * a.im + im * a.re;
            re = nre;
        }
        return { re, im };
    }
    toString() {
        if (this.c.length === 0) return '0';
        const g = this.K.gen;
        return this.c.map((co, i) => {
            if (co.isZero()) return null;
            const term = i === 0 ? '' : (i === 1 ? g : `${g}^${i}`);
            return term ? `(${co})${term}` : `${co}`;
        }).filter(Boolean).join(' + ');
    }
}

/** All complex roots of a float-coefficient polynomial (Durand–Kerner). */
function polyComplexRoots(coeffs) {
    const n = coeffs.length - 1;
    if (n === 1) return [{ re: -coeffs[0] / coeffs[1], im: 0 }];
    const a = coeffs.map(c => c / coeffs[n]);     // monic
    const roots = [];
    for (let k = 0; k < n; k++) {
        const th = 2 * Math.PI * k / n + 0.7;
        roots.push({ re: 0.4 + Math.cos(th), im: 0.9 * Math.sin(th) + 0.4 });
    }
    const cmul = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
    const csub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
    const cdiv = (x, y) => {
        const d = y.re * y.re + y.im * y.im;
        return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d };
    };
    const peval = (z) => {
        let out = { re: a[n], im: 0 };            // Horner from the top
        for (let i = n - 1; i >= 0; i--) {
            out = cmul(out, z);
            out.re += a[i];
        }
        return out;
    };
    for (let iter = 0; iter < 300; iter++) {
        let moved = 0;
        for (let k = 0; k < n; k++) {
            let denom = { re: 1, im: 0 };
            for (let j = 0; j < n; j++) {
                if (j !== k) denom = cmul(denom, csub(roots[k], roots[j]));
            }
            const delta = cdiv(peval(roots[k]), denom);
            roots[k] = csub(roots[k], delta);
            moved = Math.max(moved, Math.hypot(delta.re, delta.im));
        }
        if (moved < 1e-14) break;
    }
    // canonical order: by real part, then imaginary
    roots.sort((x, y) => (x.re - y.re) || (x.im - y.im));
    return roots.map(r => ({ re: r.re, im: Math.abs(r.im) < 1e-12 ? 0 : r.im }));
}

// ---------------- Parsing (math.js AST → exact values) ----------------

/**
 * Parse an expression string into a polynomial in `genName` over Q
 * (no reduction — used for the minimal polynomial itself).
 */
export function parsePoly(exprString, genName) {
    const node = window.math.parse(exprString);
    const walk = (nd) => {
        switch (nd.type) {
            case 'ConstantNode': return [fracFromNumber(nd.value)];
            case 'SymbolNode':
                if (nd.name === genName) return [F0, F1];
                throw new Error(`unknown symbol '${nd.name}' (the field generator is '${genName}')`);
            case 'ParenthesisNode': return walk(nd.content);
            case 'OperatorNode': {
                if (nd.fn === 'unaryMinus') return pscale(walk(nd.args[0]), new Frac(-1n));
                const A = walk(nd.args[0]), B = walk(nd.args[1]);
                switch (nd.fn) {
                    case 'add': return padd(A, B);
                    case 'subtract': return psub(A, B);
                    case 'multiply': return pmul(A, B);
                    case 'divide':
                        if (B.length !== 1) throw new Error('polynomial division not allowed in the minimal polynomial');
                        return pscale(A, F1.div(B[0]));
                    case 'pow': {
                        if (B.length > 1 || (B[0] && B[0].q !== 1n)) throw new Error('exponent must be a nonnegative integer');
                        const e = B.length ? Number(B[0].p) : 0;
                        if (e < 0) throw new Error('exponent must be a nonnegative integer');
                        let r = [F1];
                        for (let i = 0; i < e; i++) r = pmul(r, A);
                        return r;
                    }
                }
                throw new Error(`unsupported operator '${nd.op}'`);
            }
            default:
                throw new Error(`unsupported expression (${nd.type}) in exact mode`);
        }
    };
    return ptrim(walk(node));
}

/**
 * Parse an expression string into an element of K. Supports rationals,
 * + − × ÷, integer powers, and the field generator. Anything else (sqrt,
 * i, decimals that aren't finite, …) throws with a helpful message.
 */
export function parseKElem(exprString, field) {
    const node = window.math.parse(exprString);
    const walk = (nd) => {
        switch (nd.type) {
            case 'ConstantNode': return field.fromFrac(fracFromNumber(nd.value));
            case 'SymbolNode':
                if (nd.name === field.gen) return field.generator();
                if (nd.name === 'i') throw new Error(
                    `'i' is not defined — include it in the field (e.g. minimal polynomial ${field.gen}^2+1) and write entries in ${field.gen}`);
                throw new Error(`unknown symbol '${nd.name}' (the field generator is '${field.gen}')`);
            case 'ParenthesisNode': return walk(nd.content);
            case 'OperatorNode': {
                if (nd.fn === 'unaryMinus') return walk(nd.args[0]).neg();
                const A = walk(nd.args[0]);
                if (nd.fn === 'pow') {
                    const eNode = nd.args[1];
                    let sign = 1, cn = eNode;
                    if (cn.type === 'OperatorNode' && cn.fn === 'unaryMinus') { sign = -1; cn = cn.args[0]; }
                    if (cn.type === 'ParenthesisNode') cn = cn.content;
                    if (cn.type !== 'ConstantNode' || !Number.isInteger(cn.value))
                        throw new Error('exponent must be an integer in exact mode');
                    return A.pow(sign * cn.value);
                }
                const B = walk(nd.args[1]);
                switch (nd.fn) {
                    case 'add': return A.add(B);
                    case 'subtract': return A.sub(B);
                    case 'multiply': return A.mul(B);
                    case 'divide': return A.div(B);
                }
                throw new Error(`unsupported operator '${nd.op}' in exact mode`);
            }
            case 'FunctionNode':
                throw new Error(
                    `function '${nd.fn.name}' is not available in exact mode — ` +
                    `express the value in the field generator '${field.gen}'`);
            default:
                throw new Error(`unsupported expression (${nd.type}) in exact mode`);
        }
    };
    return walk(node);
}

// ---------------- Exact 2×2 matrices ----------------

export class ExactMat {
    constructor(a, b, c, d) { this.a = a; this.b = b; this.c = c; this.d = d; }
    static identity(K) { return new ExactMat(K.one(), K.zero(), K.zero(), K.one()); }
    mul(o) {
        return new ExactMat(
            this.a.mul(o.a).add(this.b.mul(o.c)), this.a.mul(o.b).add(this.b.mul(o.d)),
            this.c.mul(o.a).add(this.d.mul(o.c)), this.c.mul(o.b).add(this.d.mul(o.d)));
    }
    /** Adjugate — the inverse up to the (nonzero) determinant scalar. */
    adj() { return new ExactMat(this.d, this.b.neg(), this.c.neg(), this.a); }
    det() { return this.a.mul(this.d).sub(this.b.mul(this.c)); }
    /** Scalar multiple of the identity — i.e. trivial in PGL2(K). */
    isProjectiveIdentity() {
        return this.b.isZero() && this.c.isZero() && this.a.equals(this.d) && !this.a.isZero();
    }
    pow(n) {
        let r = new ExactMat(this.a.K.one(), this.a.K.zero(), this.a.K.zero(), this.a.K.one());
        let b = this, m = n;
        while (m > 0) {
            if (m & 1) r = r.mul(b);
            b = b.mul(b); m >>= 1;
        }
        return r;
    }
}

/**
 * Exact matrix of a word in the input generators (signed 1-based indices,
 * negative = inverse). Inverses are taken as adjugates, so everything stays
 * in the ring — all identity checks are projective, which is what PGL2 needs.
 */
export function exactFromWord(word, gens, K) {
    let M = ExactMat.identity(K);
    for (const wi of word) {
        M = M.mul(wi > 0 ? gens[wi - 1] : gens[-wi - 1].adj());
    }
    return M;
}
