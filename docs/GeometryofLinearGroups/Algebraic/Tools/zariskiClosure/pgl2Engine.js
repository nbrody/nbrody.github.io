/**
 * pgl2Engine.js — Zariski closures of finitely generated subgroups Γ = ⟨g_1, …, g_r⟩ of PGL_2(Q̄).
 *
 *  1. Entries may use i, sqrt(·), cbrt(·), zeta_n, ω. Each radical is adjoined to the field of
 *     entries K by a compositum computation (Trager-style, via the tensor algebra), choosing the
 *     factor that matches its principal complex value, so relations like √-2 = i√2 hold.
 *  2. Over Q̄ the closure is classified exactly: the K-span of Γ decides reducibility (Burnside);
 *     orders of elements come from Kronecker's theorem on tr²/det - 2; imprimitive groups are
 *     detected through a regular semisimple element; primitive finite groups (A4, S4, A5) by
 *     enumeration.
 *  3. For Zariski-dense Γ: the invariant trace field k = Q(tr Ad Γ) is read off the Q-span of
 *     Ad(Γ); the invariant quaternion algebra is A = (tr²G − 4, tr[G,H] − 2)_k for G = g²/det g,
 *     H = h²/det h (Maclachlan–Reid 3.6.2); its ramification uses tame symbols at odd primes, a
 *     finite local search at dyadic primes and the real embeddings. The Q-form of the closure is
 *     Res_{k/Q} PGL_1(A), and Γ is unbounded exactly at the primes S where tr²/det fails to be
 *     integral on words of length ≤ 3, so Γ^{(2)} lies in an S-arithmetic group of PGL_1(A).
 *
 * Depends on ../numberRings/ringEngine.js.
 */
(function (root) {
'use strict';
const NR = (typeof module !== 'undefined' && module.exports) ? require('../numberRings/ringEngine.js') : root.NumberRingEngine;
const X = NR._internal;
const { Rat, R0, R1, PolyAlg } = X;
const Rint = (n) => new Rat(BigInt(n));

// ─────────────────────── complex doubles (only for choosing embeddings and labels) ───────────────────────

const cx = (re, im = 0) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const q = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
const cabs = (a) => Math.hypot(a.re, a.im);
function csqrt(a) {
    const r = cabs(a);
    if (r === 0) return cx(0);
    const re = Math.sqrt((r + a.re) / 2), im = Math.sqrt(Math.max(0, (r - a.re) / 2));
    return cx(re, a.im < 0 ? -im : im);
}
function ccbrt(a) {
    if (Math.abs(a.im) <= 1e-13 * Math.max(1, Math.abs(a.re))) return cx(Math.cbrt(a.re));
    const r = Math.cbrt(cabs(a)), t = Math.atan2(a.im, a.re) / 3;
    return cx(r * Math.cos(t), r * Math.sin(t));
}
function ratToNum(r) {
    let n = r.n, d = r.d;
    const shift = Math.max(0, Math.max(n.toString().length, d.toString().length) - 300);
    if (shift) { const s = 10n ** BigInt(shift); n /= s; d /= s; if (d === 0n) d = 1n; }
    return Number(n) / Number(d);
}
function evalPolyC(coeffs, z) { // coeffs low→high (Rat)
    let acc = cx(0);
    for (let i = coeffs.length - 1; i >= 0; i--) acc = cadd(cmul(acc, z), cx(ratToNum(coeffs[i])));
    return acc;
}
/** |p(z)| relative to the size of its terms: ≈ 0 iff z is (numerically) a root. */
function relResidual(coeffs, z) {
    let scale = 0, pw = 1;
    const r = cabs(z);
    for (const c of coeffs) { scale += Math.abs(ratToNum(c)) * pw; pw *= r; }
    return cabs(evalPolyC(coeffs, z)) / (scale || 1);
}

// ─────────────────────── parsing ───────────────────────

const SUPERSCRIPT = { '²': 2, '³': 3 };
function tokenize(src) {
    const s = src.replace(/[−–]/g, '-').replace(/[·×]/g, '*').replace(/\*\*/g, '^');
    const toks = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9.]/.test(c)) {
            let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
            const txt = s.slice(i, j);
            if (!/^\d+(\.\d*)?$|^\.\d+$/.test(txt)) throw new Error(`can't read the number "${txt}"`);
            const [ip, fp = ''] = txt.split('.');
            toks.push({ t: 'num', v: new Rat(BigInt((ip || '0') + fp), 10n ** BigInt(fp.length)) });
            i = j; continue;
        }
        if (c === '√') { toks.push({ t: 'fn', f: 'sqrt' }); i++; continue; }
        if (c === '∛') { toks.push({ t: 'fn', f: 'cbrt' }); i++; continue; }
        if (c === 'ω') { toks.push({ t: 'zeta', n: 3 }); i++; continue; }
        if (c === 'ζ' || /[A-Za-z]/.test(c)) {
            let j = i; while (j < s.length && /[A-Za-zζ]/.test(s[j])) j++;
            const word = s.slice(i, j);
            if (word === 'zeta' || word === 'ζ' || word === 'z') {
                let k = j; if (s[k] === '_') k++;
                let m = k; while (m < s.length && /\d/.test(s[m])) m++;
                if (m === k) throw new Error(`write ${word} with an index, e.g. ${word}_5`);
                const n = parseInt(s.slice(k, m), 10);
                if (n < 1 || n > 200) throw new Error('roots of unity ζ_n need 1 ≤ n ≤ 200');
                toks.push({ t: 'zeta', n }); i = m; continue;
            }
            if (word === 'sqrt' || word === 'cbrt') { toks.push({ t: 'fn', f: word }); i = j; continue; }
            if (word === 'omega' || word === 'w') { toks.push({ t: 'zeta', n: 3 }); i = j; continue; }
            if (/^[iI]+$/.test(word)) { for (let t = 0; t < word.length; t++) toks.push({ t: 'i' }); i = j; continue; }
            throw new Error(`unknown symbol "${word}" — use numbers, i, sqrt(·), cbrt(·), zeta_n or ω`);
        }
        if (SUPERSCRIPT[c]) { toks.push({ t: '^' }, { t: 'num', v: Rint(SUPERSCRIPT[c]) }); i++; continue; }
        const map = { '⟨': '<', '⟩': '>', '[': '[', ']': ']' };
        if ('+-*/^()[],;<>'.includes(c) || map[c]) { toks.push({ t: map[c] || c }); i++; continue; }
        throw new Error(`unexpected character "${c}"`);
    }
    return toks;
}

/** Parse "<((a,b),(c,d)), …>" (or [[a,b],[c,d]], or a 4-tuple) into generators: arrays of 4 expression ASTs. */
function parseGenerators(src) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i];
    const at = (t) => toks[i] && toks[i].t === t;
    const eat = (t) => { if (at(t)) { i++; return true; } return false; };
    const closing = { '(': ')', '[': ']', '<': '>' };

    // ── expressions ──
    const startsPrimary = (tk) => tk && ['num', 'i', 'zeta', 'fn', '('].includes(tk.t);
    function primary() {
        const tk = toks[i++];
        if (!tk) throw new Error('an entry ends too early');
        if (tk.t === 'num') return { t: 'num', v: tk.v };
        if (tk.t === 'i') return { t: 'i' };
        if (tk.t === 'zeta') return { t: 'zeta', n: tk.n };
        if (tk.t === 'fn') return { t: 'fn', f: tk.f, a: primary() };
        if (tk.t === '(') { const e = expr(); if (!eat(')')) throw new Error('missing ")"'); return e; }
        throw new Error(`unexpected "${tk.t}" inside an entry`);
    }
    function expo() {
        if (eat('-')) return { t: 'neg', a: expo() };
        if (eat('+')) return expo();
        const b = primary();
        return eat('^') ? { t: 'pow', a: b, e: expo() } : b;
    }
    function power() { const b = primary(); return eat('^') ? { t: 'pow', a: b, e: expo() } : b; }
    function unary() { if (eat('-')) return { t: 'neg', a: unary() }; if (eat('+')) return unary(); return power(); }
    function term() {
        let a = unary();
        for (;;) {
            if (eat('*')) a = { t: 'mul', a, b: unary() };
            else if (eat('/')) a = { t: 'div', a, b: unary() };
            else if (startsPrimary(peek()) && !(peek().t === '(' && isTuple(i))) a = { t: 'mul', a, b: power() };
            else return a;
        }
    }
    function expr() {
        let a = term();
        for (;;) {
            if (eat('+')) a = { t: 'add', a, b: term() };
            else if (eat('-')) a = { t: 'sub', a, b: term() };
            else return a;
        }
    }
    // ── tuples ──
    function isTuple(j) { // does the bracket opening at j contain a top-level separator?
        const open = toks[j].t;
        if (open === '[') return true;
        let depth = 0;
        for (let k = j; k < toks.length; k++) {
            const t = toks[k].t;
            if (t === '(' || t === '[') depth++;
            else if (t === ')' || t === ']') { depth--; if (depth === 0) return false; }
            else if ((t === ',' || t === ';') && depth === 1) return true;
        }
        return false;
    }
    function item() {
        if ((at('(') || at('[')) && isTuple(i)) {
            const open = toks[i++].t;
            const items = seq(closing[open]);
            if (!eat(closing[open])) throw new Error(`missing "${closing[open]}"`);
            return { t: 'tuple', items };
        }
        return expr();
    }
    function seq(end) {
        const items = [];
        while (i < toks.length && !at(end)) {
            items.push(item());
            if (eat(',') || eat(';')) continue;
            if (at('(') || at('[')) continue; // juxtaposed tuples
            if (!at(end) && i < toks.length) throw new Error(`unexpected "${peek().t === 'num' ? 'number' : peek().t}"`);
        }
        return items;
    }
    const wrapped = eat('<');
    const top = seq(wrapped ? '>' : null);
    if (wrapped && !eat('>')) throw new Error('missing ">" at the end');
    if (i < toks.length) throw new Error(`unexpected "${peek().t}" after the generators`);

    const flat = (node) => (node.t === 'tuple' ? node.items.flatMap(flat) : [node]);
    const gens = [];
    const take = (node) => {
        const f = flat(node);
        if (f.length === 4) { gens.push(f); return; }
        if (node.t === 'tuple' && node.items.every((c) => flat(c).length === 4)) { node.items.forEach((c) => gens.push(flat(c))); return; }
        throw new Error(`each generator must be a 2×2 matrix (found ${f.length} entr${f.length === 1 ? 'y' : 'ies'})`);
    };
    top.forEach(take);
    if (!gens.length) throw new Error('enter at least one generator');
    return gens;
}

const astKey = (a) => {
    switch (a.t) {
        case 'num': return `${a.v.n}/${a.v.d}`;
        case 'i': return 'i';
        case 'zeta': return `z${a.n}`;
        case 'fn': return `${a.f}(${astKey(a.a)})`;
        case 'neg': return `-(${astKey(a.a)})`;
        case 'pow': return `(${astKey(a.a)})^(${astKey(a.e)})`;
        default: return `(${astKey(a.a)}${{ add: '+', sub: '-', mul: '*', div: '/' }[a.t]}${astKey(a.b)})`;
    }
};
function astTex(a, prec = 0) {
    const wrap = (s, p) => (p < prec ? `\\left(${s}\\right)` : s);
    switch (a.t) {
        case 'num': return X.ratTex(a.v);
        case 'i': return 'i';
        case 'zeta': return a.n === 3 ? '\\omega' : `\\zeta_{${a.n}}`;
        case 'fn': return a.f === 'sqrt' ? `\\sqrt{${astTex(a.a)}}` : `\\sqrt[3]{${astTex(a.a)}}`;
        case 'neg': return wrap(`-${astTex(a.a, 2)}`, 1);
        case 'add': return wrap(`${astTex(a.a, 1)} + ${astTex(a.b, 1)}`, 1);
        case 'sub': return wrap(`${astTex(a.a, 1)} - ${astTex(a.b, 2)}`, 1);
        case 'mul': return wrap(`${astTex(a.a, 2)}\\,${astTex(a.b, 2)}`, 2);
        case 'div': return `\\frac{${astTex(a.a)}}{${astTex(a.b)}}`;
        case 'pow': return `{${astTex(a.a, 3)}}^{${astTex(a.e)}}`;
    }
    return '?';
}
const hasAtom = (a) => a.t === 'i' || a.t === 'zeta' || a.t === 'fn' || ['a', 'b', 'e'].some((k) => a[k] && hasAtom(a[k]));
function constExponent(a) {
    if (hasAtom(a)) throw new Error('exponents must be integers');
    const v = evalWith(a, ratOps);
    if (!v.isInt() || (v.n < 0n ? -v.n : v.n) > 10000n) throw new Error('exponents must be (smallish) integers');
    return v.n;
}
function evalWith(a, D) {
    switch (a.t) {
        case 'num': return D.num(a.v);
        case 'i': case 'zeta': case 'fn': return D.atom(a);
        case 'neg': return D.neg(evalWith(a.a, D));
        case 'add': return D.add(evalWith(a.a, D), evalWith(a.b, D));
        case 'sub': return D.sub(evalWith(a.a, D), evalWith(a.b, D));
        case 'mul': return D.mul(evalWith(a.a, D), evalWith(a.b, D));
        case 'div': return D.div(evalWith(a.a, D), evalWith(a.b, D));
        case 'pow': return D.pow(evalWith(a.a, D), constExponent(a.e));
    }
    throw new Error('internal: bad expression');
}
const ratOps = {
    num: (r) => r, atom: () => { throw new Error('exponents must be integers'); },
    neg: (x) => x.neg(), add: (x, y) => x.add(y), sub: (x, y) => x.sub(y), mul: (x, y) => x.mul(y), div: (x, y) => x.div(y),
    pow: (x, k) => { let r = R1, b = x, e = k; if (e < 0n) { b = R1.div(x); e = -e; } while (e > 0n) { if (e & 1n) r = r.mul(b); b = b.mul(b); e >>= 1n; } return r; },
};
const numOps = {
    num: (r) => cx(ratToNum(r)),
    atom: (a) => atomNumeric(a, numOps),
    neg: (x) => cx(-x.re, -x.im), add: cadd, sub: csub, mul: cmul,
    div: (x, y) => { if (cabs(y) === 0) throw new Error('division by zero'); return cdiv(x, y); },
    pow: (x, k) => { let r = cx(1), b = x, e = Number(k); if (e < 0) { b = cdiv(cx(1), x); e = -e; } while (e > 0) { if (e & 1) r = cmul(r, b); b = cmul(b, b); e >>= 1; } return r; },
};
function atomNumeric(a, D) {
    if (a.t === 'i') return cx(0, 1);
    if (a.t === 'zeta') return cx(Math.cos(2 * Math.PI / a.n), Math.sin(2 * Math.PI / a.n));
    const v = evalWith(a.a, D);
    return a.f === 'sqrt' ? csqrt(v) : ccbrt(v);
}

// ─────────────────────── the field of entries K, built by adjoining radicals ───────────────────────

class FieldBuilder {
    constructor() {
        this.alg = new PolyAlg([R0, R1]); // Q = Q[x]/(x)
        this.num = cx(0);                  // complex value of the generator θ of K
        this.atoms = new Map();            // key → { val (K-coords), num, tex, deg }
        this.order = [];                   // atom keys in adjunction order
    }
    get n() { return this.alg.n; }
    ops() {
        const K = this.alg, self = this;
        return {
            num: (r) => K.fromRat(r),
            atom: (a) => { const at = self.atoms.get(astKey(a)); if (!at) throw new Error('internal: missing atom'); return at.val; },
            neg: (x) => K.neg(x), add: (x, y) => K.add(x, y), sub: (x, y) => K.sub(x, y), mul: (x, y) => K.mul(x, y),
            div: (x, y) => K.mul(x, K.inv(y)), pow: (x, k) => K.pow(x, k),
        };
    }
    /** Adjoin every radical occurring in ast (innermost first). */
    ensureAtoms(a) {
        for (const k of ['a', 'b']) if (a[k]) this.ensureAtoms(a[k]);
        if (a.t !== 'i' && a.t !== 'zeta' && a.t !== 'fn') return;
        const key = astKey(a);
        if (this.atoms.has(key)) return;
        let m, num;
        if (a.t === 'i') { m = [R1, R0, R1]; num = cx(0, 1); }
        else if (a.t === 'zeta') { m = [Rint(-1)].concat(new Array(a.n - 1).fill(R0), [R1]); num = atomNumeric(a, numOps); }
        else {
            const arg = evalWith(a.a, this.ops()), argNum = evalWith(a.a, numOps);
            num = a.f === 'sqrt' ? csqrt(argNum) : ccbrt(argNum);
            if (this.alg.isZero(arg)) { this.register(key, a, this.alg.fromRat(R0), num, 1); return; }
            const mp = this.alg.minpoly(arg), r = a.f === 'sqrt' ? 2 : 3;
            m = new Array((mp.length - 1) * r + 1).fill(R0);
            mp.forEach((c, j) => { m[j * r] = c; });
        }
        const before = this.n;
        const val = this.adjoin(m, num);
        this.register(key, a, val, num, this.n / before);
    }
    register(key, a, val, num, deg) {
        this.atoms.set(key, { val, num, tex: astTex(a), deg });
        this.order.push(key);
    }
    /** Adjoin a root α of m (choose the factor matching αNum); returns α in the new field. */
    adjoin(m, aNum) {
        let mq = X.qpTrim(m.map(X.ratOf));
        const g = X.qpXgcd(mq, X.qpDeriv(mq))[0];
        if (X.qpDeg(g) > 0) mq = X.qpDivmod(mq, g)[0];
        const fac = pickFactor(mq, aNum);
        if (fac.length === 2) return this.alg.fromRat(fac[0].neg()); // rational
        const n = this.n, k = fac.length - 1;
        if (n === 1) {
            const c = this.alg.m[0].neg().div(this.alg.m[1]); // old θ (rational)
            const newAlg = new PolyAlg(fac);
            this.remap(newAlg, newAlg.fromRat(c), aNum);
            return newAlg.gen();
        }
        // compositum through the tensor algebra Q[x]/(F) ⊗ Q[z]/(m): find s with γ = z + s·x primitive
        const F = X.qpMonic(this.alg.m);
        const dim = n * k;
        const tmul = (u, v) => {
            const P = Array.from({ length: 2 * n - 1 }, () => new Array(2 * k - 1).fill(R0));
            for (let i1 = 0; i1 < n; i1++) for (let j1 = 0; j1 < k; j1++) {
                const a = u[i1 * k + j1]; if (a.isZero()) continue;
                for (let i2 = 0; i2 < n; i2++) for (let j2 = 0; j2 < k; j2++) {
                    const b = v[i2 * k + j2]; if (b.isZero()) continue;
                    P[i1 + i2][j1 + j2] = P[i1 + i2][j1 + j2].add(a.mul(b));
                }
            }
            for (const row of P) for (let b = 2 * k - 2; b >= k; b--) { const c = row[b]; if (c.isZero()) continue; row[b] = R0; for (let t = 0; t < k; t++) row[b - k + t] = row[b - k + t].sub(c.mul(fac[t])); }
            for (let a = 2 * n - 2; a >= n; a--) for (let b = 0; b < k; b++) { const c = P[a][b]; if (c.isZero()) continue; P[a][b] = R0; for (let t = 0; t < n; t++) P[a - n + t][b] = P[a - n + t][b].sub(c.mul(F[t])); }
            const out = new Array(dim).fill(R0);
            for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = P[i][j];
            return out;
        };
        const unit = (i, j) => { const v = new Array(dim).fill(R0); v[i * k + j] = R1; return v; };
        for (const s of [1, -1, 2, -2, 3, -3, 4, 5, 7, 11]) {
            const gamma = unit(0, 1).map((x, idx) => (idx === k ? x.add(Rint(s)) : x)); // z + s·x
            // Krylov: 1, γ, γ², … — primitive iff they span the algebra
            const pows = [unit(0, 0)];
            for (let j = 1; j < dim; j++) pows.push(tmul(pows[j - 1], gamma));
            if (!independent(pows)) continue;
            const xs = X.ratSolveRows(pows, unit(1, 0)), zs = X.ratSolveRows(pows, unit(0, 1));
            const top = X.ratSolveRows(pows, tmul(pows[dim - 1], gamma));
            const charpoly = top.map((c) => c.neg()).concat([R1]); // γ^dim = Σ top_j γ^j
            const gNum = cadd(aNum, cmul(cx(s), this.num));
            const G = pickFactor(charpoly, gNum);
            const newAlg = new PolyAlg(G);
            const thetaImg = newAlg.reduce(xs), alphaImg = newAlg.reduce(zs);
            this.remap(newAlg, thetaImg, gNum);
            return alphaImg;
        }
        throw new Error('internal: no primitive element for the compositum');
    }
    /** Move every stored value along θ ↦ thetaImg in the new field. */
    remap(newAlg, thetaImg, newNum) {
        const map = (u) => { let acc = newAlg.fromRat(R0); for (let i = u.length - 1; i >= 0; i--) acc = newAlg.add(newAlg.mul(acc, thetaImg), newAlg.fromRat(u[i])); return acc; };
        for (const at of this.atoms.values()) at.val = map(at.val);
        this.alg = newAlg; this.num = newNum;
    }
    /** Monomials in the adjoined atoms forming a Q-basis of K (for display). */
    displayBasis() {
        if (this._basis && this._basis.n === this.n) return this._basis;
        let monos = [{ tex: '', val: this.alg.one(), num: cx(1) }];
        for (const key of this.order) {
            const at = this.atoms.get(key);
            if (at.deg <= 1) continue;
            const next = [];
            for (const mo of monos) {
                let v = mo.val, tex = mo.tex;
                for (let e = 0; e < at.deg; e++) {
                    next.push({ val: v, tex: e === 0 ? tex : tex + (tex ? '\\,' : '') + (at.tex.length > 1 && e > 1 ? `{${at.tex}}^{${e}}` : e > 1 ? `${at.tex}^{${e}}` : at.tex) });
                    v = this.alg.mul(v, at.val);
                }
            }
            monos = next;
        }
        if (monos.length !== this.n) monos = Array.from({ length: this.n }, (_, j) => ({ tex: j ? `\\theta^{${j}}` : '', val: this.alg.pow(this.alg.gen(), j) }));
        this._basis = { n: this.n, monos, rows: monos.map((m) => m.val) };
        return this._basis;
    }
    /** TeX for an element of K in terms of the atoms, e.g. \frac{1 + 2i}{5}. */
    tex(v) {
        const B = this.displayBasis();
        const c = X.ratSolveRows(B.rows, v);
        if (!c) return '?';
        let den = 1n; for (const x of c) den = X.blcm(den, x.d);
        const parts = [];
        c.forEach((x, j) => {
            const num = x.n * (den / x.d);
            if (!num) return;
            const a = num < 0n ? -num : num, mono = B.monos[j].tex;
            parts.push({ neg: num < 0n, s: mono ? (a === 1n ? mono : `${a}${/^[\\{]/.test(mono) && !/^\\[a-z]/.test(mono) ? '\\,' : ''}${mono}`) : `${a}` });
        });
        if (!parts.length) return '0';
        const numTex = parts.map((t, k) => (k === 0 ? (t.neg ? '-' : '') + t.s : (t.neg ? ' - ' : ' + ') + t.s)).join('');
        if (den === 1n) return numTex;
        if (parts.length === 1) return `${parts[0].neg ? '-' : ''}\\frac{${parts[0].s}}{${den}}`;
        return `\\frac{${numTex}}{${den}}`;
    }
    numeric(v) { return evalPolyC(v, this.num); }
}
function independent(rows) {
    const ech = [];
    for (const r of rows) {
        let w = r.slice();
        for (const e of ech) { const t = w[e.piv]; if (!t.isZero()) { const f = t.div(e.vec[e.piv]); w = w.map((x, i) => x.sub(f.mul(e.vec[i]))); } }
        const piv = w.findIndex((x) => !x.isZero());
        if (piv < 0) return false;
        ech.push({ vec: w, piv });
    }
    return true;
}
/** The irreducible factor (monic, over Q) of a squarefree polynomial vanishing at z. */
function pickFactor(poly, z) {
    let den = 1n; for (const c of poly) den = X.blcm(den, c.d);
    const ints = X.zPrimitive(poly.map((c) => c.n * (den / c.d)));
    const facs = ints.length <= 2 ? [ints] : X.zFactorSquarefree(ints);
    let best = null;
    for (const f of facs) {
        const q = X.qpMonic(f.map((x) => new Rat(x)));
        const r = relResidual(q, z);
        if (!best || r < best.r) best = { q, r };
    }
    return best.q;
}

// ─────────────────────── 2×2 matrices over K (arrays [a, b, c, d]) ───────────────────────

function M2(K) {
    const z = () => K.fromRat(R0);
    return {
        mul: (A, B) => [
            K.add(K.mul(A[0], B[0]), K.mul(A[1], B[2])), K.add(K.mul(A[0], B[1]), K.mul(A[1], B[3])),
            K.add(K.mul(A[2], B[0]), K.mul(A[3], B[2])), K.add(K.mul(A[2], B[1]), K.mul(A[3], B[3])),
        ],
        det: (A) => K.sub(K.mul(A[0], A[3]), K.mul(A[1], A[2])),
        tr: (A) => K.add(A[0], A[3]),
        adj: (A) => [A[3], K.neg(A[1]), K.neg(A[2]), A[0]],
        scale: (A, c) => A.map((x) => K.mul(x, c)),
        isScalar: (A) => K.isZero(A[1]) && K.isZero(A[2]) && K.isZero(K.sub(A[0], A[3])),
        projEq: (A, B) => {
            for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (!K.isZero(K.sub(K.mul(A[i], B[j]), K.mul(A[j], B[i])))) return false;
            return true;
        },
        key: (A) => { // projective normal form
            const j = A.findIndex((x) => !K.isZero(x)), inv = K.inv(A[j]);
            return A.map((x) => K.mul(x, inv).map((r) => `${r.n}/${r.d}`).join(',')).join('|');
        },
        id: () => [K.one(), z(), z(), K.one()],
    };
}

// ─────────────────────── exact real-root utilities (Sturm) ───────────────────────

function sturm(f) {
    const seq = [f, X.qpDeriv(f)];
    while (X.qpDeg(seq[seq.length - 1]) > 0) {
        const r = X.qpDivmod(seq[seq.length - 2], seq[seq.length - 1])[1];
        if (!r.length) break;
        seq.push(X.qpScale(r, Rint(-1)));
    }
    return seq;
}
function qpEvalRat(p, x) { let acc = R0; for (let i = p.length - 1; i >= 0; i--) acc = acc.mul(x).add(p[i]); return acc; }
function signChanges(seq, x) {
    let c = 0, prev = 0;
    for (const p of seq) { const s = qpEvalRat(p, x).sign(); if (!s) continue; if (prev && s !== prev) c++; prev = s; }
    return c;
}
const squarefree = (f) => { const g = X.qpXgcd(f, X.qpDeriv(f))[0]; return X.qpDeg(g) > 0 ? X.qpDivmod(f, g)[0] : f; };
/** Number of roots of f in the half-open interval (lo, hi]. */
function rootsIn(f, lo, hi) { const s = sturm(squarefree(f)); return signChanges(s, lo) - signChanges(s, hi); }
/** Isolating intervals (lo, hi] with exactly one real root each, for squarefree g. */
function isolateRealRoots(g) {
    let B = R0; for (const c of g.slice(0, -1)) { const a = c.abs().div(g[g.length - 1].abs()); if (a.sign() > 0 && ratToNum(a.sub(B)) > 0) B = a; }
    B = B.add(R1).add(R1);
    const seq = sturm(g), out = [];
    const rec = (lo, hi, depth) => {
        const cnt = signChanges(seq, lo) - signChanges(seq, hi);
        if (cnt === 0) return;
        if (cnt === 1 || depth > 200) { out.push([lo, hi]); return; }
        const mid = lo.add(hi).div(Rint(2));
        rec(lo, mid, depth + 1); rec(mid, hi, depth + 1);
    };
    rec(B.neg(), B, 0);
    return out;
}
/** Sign of A(θ) at the real root θ of g isolated in (lo, hi]. */
function signAtRoot(A, g, lo, hi) {
    const As = squarefree(A), gs = sturm(g);
    for (let it = 0; it < 400; it++) {
        if (rootsIn(As, lo, hi) === 0 && !qpEvalRat(As, hi).isZero()) return qpEvalRat(A, hi).sign();
        const mid = lo.add(hi).div(Rint(2));
        if (signChanges(gs, lo) - signChanges(gs, mid) === 1) hi = mid; else lo = mid;
    }
    throw new Error('internal: could not separate a real root');
}

// ─────────────────────── element orders ───────────────────────

/** Finite order forces tr²/det = 2 + ζ + ζ⁻¹ ∈ [0, 4] in every embedding; this screens the rest out. */
const maybeFiniteNum = (tau) => Math.abs(tau.im) < 1e-7 * Math.max(1, Math.abs(tau.re)) && tau.re > -1e-7 && tau.re < 4 + 1e-7;

/** Order of g in PGL_2 (Infinity if infinite). */
function elementOrder(F, M, g) {
    const K = F.alg;
    if (M.isScalar(g)) return 1;
    const tau = K.mul(K.mul(M.tr(g), M.tr(g)), K.inv(M.det(g)));
    const t = K.sub(tau, K.fromRat(Rint(2)));
    if (K.isZero(K.sub(tau, K.fromRat(Rint(4))))) return Infinity; // parabolic
    if (!maybeFiniteNum(F.numeric(tau))) return Infinity;
    const mp = K.minpoly(t);
    if (!mp.every((c) => c.isInt())) return Infinity;
    // Kronecker: t = ζ + ζ⁻¹ for a root of unity ζ iff every conjugate is real and in [−2, 2]
    const deg = mp.length - 1;
    const inside = rootsIn(mp, Rint(-2), Rint(2)) + (qpEvalRat(mp, Rint(-2)).isZero() ? 1 : 0);
    if (inside !== deg) return Infinity;
    // find n numerically, then confirm g^n is scalar
    const tn = F.numeric(t).re, ang = Math.acos(Math.max(-1, Math.min(1, tn / 2))) / (2 * Math.PI);
    for (let n = 2; n <= 2000; n++) {
        const j = Math.round(ang * n);
        if (Math.abs(ang * n - j) > 1e-7) continue;
        let P = g; for (let e = 1; e < n; e++) P = M.mul(P, g);
        if (M.isScalar(P)) return n;
    }
    return Infinity;
}

// ─────────────────────── main analysis ───────────────────────

function analyze(src) {
    const asts = parseGenerators(src);
    if (asts.length > 8) throw new Error('at most 8 generators, please');
    const F = new FieldBuilder();
    for (const g of asts) for (const e of g) F.ensureAtoms(e);
    if (F.n > 32) throw new Error(`the entries generate a field of degree ${F.n}; please keep it at most 32`);
    const K = F.alg, M = M2(K), ops = F.ops();
    const mats = asts.map((g) => g.map((e) => evalWith(e, ops)));
    mats.forEach((g, i) => { if (K.isZero(M.det(g))) throw new Error(`g${sub(i + 1)} is singular`); });

    const tauOf = (g) => K.mul(K.mul(M.tr(g), M.tr(g)), K.inv(M.det(g)));
    const gens = mats.map((g, i) => {
        const tau = tauOf(g), tn = F.numeric(tau);
        const order = elementOrder(F, M, g);
        let type;
        if (M.isScalar(g)) type = 'identity';
        else if (K.isZero(K.sub(tau, K.fromRat(Rint(4))))) type = 'parabolic';
        else if (Math.abs(tn.im) < 1e-9 && tn.re >= -1e-12 && tn.re < 4) type = 'elliptic';
        else if (Math.abs(tn.im) < 1e-9 && tn.re > 4) type = 'hyperbolic';
        else type = 'loxodromic';
        return {
            tex: `\\begin{pmatrix} ${F.tex(g[0])} & ${F.tex(g[1])} \\\\ ${F.tex(g[2])} & ${F.tex(g[3])} \\end{pmatrix}`,
            detTex: F.tex(M.det(g)), tauTex: F.tex(tau), type, order: order === Infinity ? null : order, index: i,
        };
    });
    const field = {
        n: F.n,
        atoms: F.order.filter((k) => F.atoms.get(k).deg > 1).map((k) => F.atoms.get(k).tex),
        polyTex: F.n > 1 ? X.polyTex(F.alg.m.map((c) => c.div(F.alg.m[F.alg.m.length - 1]))) : null,
    };
    const live = mats.filter((g) => !M.isScalar(g));
    const out = { ok: true, field, gens };
    out.closure = classify(F, M, live);
    if (out.closure.kind === 'dense') out.arith = arithmetic(F, M, live);
    return out;
}
const sub = (k) => String(k).split('').map((ch) => '₀₁₂₃₄₅₆₇₈₉'[+ch]).join('');

/** K-dimension of the K-span of the group generated by gens (≤ 4). */
function spanDim(K, M, gens) {
    const basis = [];
    const reduce = (A) => {
        let v = A.slice();
        for (const b of basis) { const t = v[b.piv]; if (K.isZero(t)) continue; const f = K.mul(t, K.inv(b.v[b.piv])); v = v.map((x, i) => K.sub(x, K.mul(f, b.v[i]))); }
        return v;
    };
    const queue = [M.id()];
    const add = (A) => { const v = reduce(A); const piv = v.findIndex((x) => !K.isZero(x)); if (piv < 0) return false; basis.push({ v, piv }); return true; };
    add(M.id());
    while (queue.length && basis.length < 4) { const A = queue.shift(); for (const g of gens) { const B = M.mul(A, g); if (add(B)) queue.push(B); } }
    return basis.length;
}

function classify(F, M, gens) {
    const K = F.alg;
    if (!gens.length) return { kind: 'trivial', tex: '\\{1\\}', dim: 0, summary: 'Every generator is scalar, so the group is trivial in PGL₂.' };
    const orders = gens.map((g) => elementOrder(F, M, g));
    const commute = (a, b) => M.projEq(M.mul(a, b), M.mul(b, a));
    const tauOf = (g) => K.mul(K.mul(M.tr(g), M.tr(g)), K.inv(M.det(g)));
    const isParabolic = (g) => K.isZero(K.sub(tauOf(g), K.fromRat(Rint(4))));
    const isInvolution = (g) => K.isZero(M.tr(g));
    const lcm = (a, b) => { const g = (x, y) => (y ? g(y, x % y) : x); return a / g(a, b) * b; };

    if (spanDim(K, M, gens) < 4) { // reducible: a common fixed point in P¹(Q̄)
        const abelian = gens.every((a) => gens.every((b) => commute(a, b)));
        if (abelian && gens.every(isParabolic)) return { kind: 'unipotent', tex: '\\mathbb{G}_a', dim: 1, summary: 'The generators are parabolic with a common fixed point, so ⟨S⟩ is unipotent: its Zariski closure is a one-parameter unipotent group 𝔾ₐ (conjugate to upper unitriangular matrices).' };
        if (abelian) {
            if (orders.every((o) => o !== Infinity)) {
                const m = orders.reduce(lcm, 1);
                return { kind: 'finite', tex: `C_{${m}}`, dim: 0, order: m, summary: `The generators are commuting elliptic elements of finite order, so ⟨S⟩ is the finite cyclic group of order ${m}.` };
            }
            return { kind: 'torus', tex: '\\mathbb{G}_m', dim: 1, summary: 'The generators commute and are simultaneously diagonalizable, with an element of infinite order: the Zariski closure is a maximal torus 𝔾ₘ.' };
        }
        const finiteChars = gens.every((g, i) => isParabolic(g) || orders[i] !== Infinity);
        if (finiteChars) {
            const m = gens.map((g, i) => (isParabolic(g) ? 1 : orders[i])).reduce(lcm, 1);
            return { kind: 'unipotent-ext', tex: m > 1 ? `\\mathbb{G}_a \\rtimes \\mu_{${m}}` : '\\mathbb{G}_a', dim: 1, summary: `⟨S⟩ fixes a point of P¹ and is non-abelian, but every generator acts on the fixed line by a root of unity: the closure is 𝔾ₐ extended by a cyclic group of order ${m}.` };
        }
        return { kind: 'borel', tex: 'B = \\mathbb{G}_a \\rtimes \\mathbb{G}_m', dim: 2, summary: '⟨S⟩ fixes a point of P¹ and is not virtually abelian, so its Zariski closure is a Borel subgroup (conjugate to the upper-triangular matrices).' };
    }

    // irreducible: look for a regular semisimple element g (not parabolic, not an involution)
    if (!gens.some(isParabolic)) {
        const words = gens.slice();
        for (const a of gens) for (const b of gens) words.push(M.mul(a, b));
        for (const a of gens) for (const b of gens) for (const c of gens) words.push(M.mul(M.mul(a, b), c));
        const g = words.find((w) => !M.isScalar(w) && !isParabolic(w) && !isInvolution(w));
        if (g) {
            const gi = M.adj(g);
            const inNormalizer = gens.every((h) => {
                const conj = M.mul(M.mul(h, g), M.adj(h));
                return M.projEq(conj, g) || M.projEq(conj, gi);
            });
            if (inNormalizer) {
                const infinite = words.some((w) => !M.isScalar(w) && !isInvolution(w) && elementOrder(F, M, w) === Infinity);
                if (infinite) return { kind: 'normalizer', tex: 'N(T) = \\mathbb{G}_m \\rtimes \\mathbb{Z}/2', dim: 1, summary: '⟨S⟩ preserves a pair of points of P¹ and contains an element of infinite order: its Zariski closure is the normalizer of a maximal torus.' };
                const all = enumerate(M, gens, 20000);
                if (all) {
                    const name = finiteName(F, M, all, gens);
                    return { kind: 'finite', tex: name.tex, dim: 0, order: all.length, summary: `⟨S⟩ is finite: ${name.words} of order ${all.length}, so it is its own Zariski closure.` };
                }
            }
        }
    }
    // primitive: finite (A4, S4, A5) or dense. First look numerically for an element of infinite order.
    if (hasInfiniteOrderWord(F, M, gens)) return { kind: 'dense', tex: '\\mathrm{PGL}_2', dim: 3, summary: '⟨S⟩ is irreducible, not virtually abelian and infinite, so it is Zariski dense in PGL₂.' };
    const fin = enumerate(M, gens, 61);
    if (fin) {
        const n = fin.length;
        const name = finiteName(F, M, fin, gens);
        return { kind: 'finite', tex: name.tex, dim: 0, order: n, summary: `⟨S⟩ is finite: ${name.words} of order ${n}, so it is its own Zariski closure.` };
    }
    return { kind: 'dense', tex: '\\mathrm{PGL}_2', dim: 3, summary: '⟨S⟩ is irreducible, not virtually abelian and infinite, so it is Zariski dense in PGL₂.' };
}
function hasInfiniteOrderWord(F, M, gens) {
    const num = gens.map((g) => g.map((x) => F.numeric(x)));
    const mulN = (A, B) => [cadd(cmul(A[0], B[0]), cmul(A[1], B[2])), cadd(cmul(A[0], B[1]), cmul(A[1], B[3])), cadd(cmul(A[2], B[0]), cmul(A[3], B[2])), cadd(cmul(A[2], B[1]), cmul(A[3], B[3]))];
    const tauN = (A) => { const tr = cadd(A[0], A[3]), det = csub(cmul(A[0], A[3]), cmul(A[1], A[2])); return cdiv(cmul(tr, tr), det); };
    let layer = num;
    for (let len = 1; len <= 6; len++) {
        if (layer.some((A) => !maybeFiniteNum(tauN(A)))) return true;
        if (len === 6) break;
        const next = [];
        for (const A of layer) for (const g of num) { next.push(mulN(A, g)); if (next.length > 3000) break; }
        layer = next;
    }
    return false;
}
function enumerate(M, gens, limit) {
    const seen = new Map(), queue = [M.id()];
    seen.set(M.key(M.id()), M.id());
    while (queue.length) {
        const A = queue.shift();
        for (const g of gens) {
            const B = M.mul(A, g), key = M.key(B);
            if (seen.has(key)) continue;
            seen.set(key, B); queue.push(B);
            if (seen.size >= limit) return null;
        }
    }
    return [...seen.values()];
}
function finiteName(F, M, elems, gens) {
    const n = elems.length;
    const orders = elems.map((g) => elementOrder(F, M, g));
    const maxOrd = Math.max(...orders);
    if (orders.includes(n)) return { tex: `C_{${n}}`, words: 'a cyclic group' };
    if (n === 4) return { tex: 'V_4', words: 'the Klein four-group' };
    if (maxOrd === n / 2 && orders.filter((o) => o === 2).length >= n / 2) return { tex: `D_{${n / 2}}`, words: `the dihedral group` };
    if (n === 12) return { tex: 'A_4', words: 'the tetrahedral group A₄' };
    if (n === 24) return { tex: 'S_4', words: 'the octahedral group S₄' };
    if (n === 60) return { tex: 'A_5', words: 'the icosahedral group A₅' };
    void gens;
    return { tex: `G_{${n}}`, words: 'a finite group' };
}

// ─────────────────────── arithmetic data of a Zariski-dense group ───────────────────────

function arithmetic(F, M, gens) {
    const K = F.alg, n = K.n;
    const fmt = (v) => F.tex(v);
    // Ad(g) on sl_2 with basis E, F, H (coordinates of [[h, e], [f, -h]] are (e, f, h))
    const Ad = (g) => {
        const gi = M.adj(g), dinv = K.inv(M.det(g));
        const basis = [[K.fromRat(R0), K.one(), K.fromRat(R0), K.fromRat(R0)], [K.fromRat(R0), K.fromRat(R0), K.one(), K.fromRat(R0)], [K.one(), K.fromRat(R0), K.fromRat(R0), K.neg(K.one())]];
        const cols = basis.map((Xm) => { const Y = M.scale(M.mul(M.mul(g, Xm), gi), dinv); return [Y[1], Y[2], Y[0]]; });
        return [0, 1, 2].map((r) => [0, 1, 2].map((c) => cols[c][r]));
    };
    const mul3 = (A, B) => A.map((row, i) => [0, 1, 2].map((j) => row.reduce((acc, a, t) => K.add(acc, K.mul(a, B[t][j])), K.fromRat(R0))));
    const flat3 = (A) => A.flat().flat();
    const adGens = gens.flatMap((g) => [Ad(g), Ad(M.adj(g))]);
    // Q-span of Ad(Γ): close span{1} under right multiplication by the generators
    const ech = [], span = [];
    const unflat3 = (w) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => w.slice((r * 3 + c) * n, (r * 3 + c + 1) * n)));
    const tryAdd = (A) => {
        let w = flat3(A);
        for (const e of ech) { const t = w[e.piv]; if (!t.isZero()) { const f = t.div(e.vec[e.piv]); w = w.map((x, i) => x.sub(f.mul(e.vec[i]))); } }
        const piv = w.findIndex((x) => !x.isZero());
        if (piv < 0) return false;
        // rescale to a primitive integral vector: same Q-span, much smaller numbers
        let den = 1n, g = 0n;
        for (const x of w) den = X.blcm(den, x.d);
        const ints = w.map((x) => x.n * (den / x.d));
        for (const v of ints) g = X.bgcd(g, v);
        w = ints.map((v) => new Rat(v / g));
        ech.push({ vec: w, piv }); span.push(unflat3(w)); return true;
    };
    const I3 = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === c ? K.one() : K.fromRat(R0))));
    tryAdd(I3);
    for (let q = 0; q < span.length; q++) for (const A of adGens) tryAdd(mul3(span[q], A));
    const traces = span.map((A) => K.add(K.add(A[0][0], A[1][1]), A[2][2]));
    // words of length ≤ 3 (letters g_i^{±1}) and their invariants tr²/det ∈ k
    const letters = gens.flatMap((g) => [g, M.adj(g)]);
    const words = [];
    for (const a of letters) { words.push(a); for (const b of letters) { words.push(M.mul(a, b)); for (const c of letters) words.push(M.mul(M.mul(a, b), c)); } }
    const tauOf = (g) => K.mul(K.mul(M.tr(g), M.tr(g)), K.inv(M.det(g)));
    const tauVals = [], seenT = new Set();
    for (const w of words) { const t = tauOf(w), key = t.map((r) => `${r.n}/${r.d}`).join(','); if (!seenT.has(key)) { seenT.add(key); tauVals.push(t); } }
    const size = (v) => v.reduce((acc, r) => acc + r.n.toString().length + r.d.toString().length, 0);
    // the invariant trace field k ⊆ K (spanned by the traces of Ad Γ), generated preferably by a small tr²/det
    const ksub = X.subfieldData(K, tauVals.slice().sort((x, y) => size(x) - size(y)).concat(traces.filter((t) => !K.isZero(t))), false);
    const d = ksub.d;
    if (span.length !== 9 * d) throw new Error(`internal: span of Ad Γ has dimension ${span.length}, expected ${9 * d}`);
    const toK = (v) => { const x = X.ratSolveRows(ksub.P, v); if (!x) throw new Error('internal: element not in the trace field'); return x; }; // K-coords → θ_k-coords
    const kAlg = ksub.nf.alg, Ok = ksub.O;

    // the quaternion algebra A = (tr²G − 4, tr[G, H] − 2)_k with G = g²/det g ∈ Γ^{(2)}
    const sq = (g) => M.scale(M.mul(g, g), K.inv(M.det(g)));
    let hilbert = null;
    search: for (const u of words) {
        const G = sq(u), a = K.sub(K.mul(M.tr(G), M.tr(G)), K.fromRat(Rint(4)));
        if (K.isZero(a)) continue;
        for (const w of words) {
            const H = sq(w), C = M.mul(M.mul(G, H), M.mul(M.adj(G), M.adj(H)));
            const b = K.sub(M.tr(C), K.fromRat(Rint(2)));
            if (!K.isZero(b)) { hilbert = { a, b, G, H }; break search; }
        }
    }
    if (!hilbert) throw new Error('internal: no irreducible pair found for the quaternion algebra');
    const aK = toK(hilbert.a), bK = toK(hilbert.b);

    // S = primes of k where tr²/det fails to be integral on short words (Γ is unbounded exactly there)
    const ringDesc = NR.describeRing(K, tauVals, { format: fmt, subName: 'k', fullName: 'k', genTex: [] });
    const Sp = ringDesc.R.integral ? [] : ringDesc.R.local.map((l) => BigInt(l.p));
    const ram = ramification(ksub, aK, bK, Sp);
    const tauSV = tauVals.filter((t) => !K.isZero(t)).map((t) => X.toSV(Ok.toCoords(toK(t))));
    const toKTex = (x) => fmt(X.toA(ksub, x));
    const Splaces = ram.places.filter((pl) => pl.kind === 'finite' && Sp.includes(BigInt(pl.p)) && tauSV.some((t) => X.valuationSV(Ok, pl.pr, t) < 0));
    for (const pl of ram.places) if (pl.kind === 'finite') pl.tex = d === 1 ? pl.p : X.twoElement(ksub, pl.pr, toKTex);
    Splaces.forEach((pl) => { pl.inS = true; });
    const saturated = Sp.map((p) => ram.places.filter((pl) => pl.kind === 'finite' && pl.p === `${p}`).every((pl) => pl.inS));

    // the ring O_{k,S}
    let ringTex;
    const inv = (ps) => ps.map((p) => `\\tfrac{1}{${p}}`).join(',\\, ');
    if (!Sp.length) ringTex = d === 1 ? '\\mathbb{Z}' : '\\mathcal{O}_k';
    else if (d === 1) ringTex = `\\mathbb{Z}\\left[${inv(Sp)}\\right]`;
    else if (saturated.every(Boolean)) ringTex = `\\mathcal{O}_k\\left[${inv(Sp)}\\right]`;
    else if (ringDesc.R.sTex) ringTex = `\\mathcal{O}_k\\left[\\tfrac{1}{${ringDesc.R.sTex}}\\right]`;
    else ringTex = '\\mathcal{O}_{k,S}';

    // the Q-form G = PGL_1(A) and where it is non-compact
    const split = ram.places.every((pl) => pl.ramified === false);
    const ramified = ram.places.filter((pl) => pl.ramified);
    const hamilton = d === 1 && ramified.length === 2 && ramified.some((pl) => pl.kind === 'real') && ramified.some((pl) => pl.p === '2');
    const Gtex = split ? '\\mathrm{PGL}_2' : hamilton ? '\\mathrm{PU}_2' : '\\mathrm{PGL}_1(A)';
    const reals = ram.places.filter((pl) => pl.kind === 'real');
    const r2 = (d - reals.length) / 2;
    const factors = [];
    const realSplit = reals.filter((pl) => pl.ramified === false).length;
    if (realSplit) factors.push(`\\mathrm{PGL}_2(\\mathbb{R})${realSplit > 1 ? `^{${realSplit}}` : ''}`);
    if (r2) factors.push(`\\mathrm{PGL}_2(\\mathbb{C})${r2 > 1 ? `^{${r2}}` : ''}`);
    for (const pl of Splaces) if (pl.ramified === false) factors.push(d === 1 ? `\\mathrm{PGL}_2(\\mathbb{Q}_{${pl.p}})` : `\\mathrm{PGL}_2(k_{${pl.tex}})`);
    const compactAt = Splaces.filter((pl) => pl.ramified).map((pl) => pl.tex);

    // does ⟨S⟩ literally lie in PGL_2(O_{K,S}) (scheme points: v(det) = 2·min v(entries) off S)?
    const defects = K.n <= 12 ? integralityDefects(F, M, gens, tauVals, ringDesc) : null;
    const literal = defects ? defects.size === 0 : null;

    // places with unbounded orbits, and the congruence closure at the places where Γ is bounded
    const spaces = symmetricSpaces(d, ram, Splaces);
    const ctx = { F, M, K, n, d, gens, words, tauVals, sq, ksub, Ok, kAlg, toK, ram, Splaces, ringDesc, defects, fmt: toKTex, hilbert };
    let congruence;
    if (api._internal.debug.keep) api._internal.debug.ctx = ctx;
    try { congruence = congruenceClosure(ctx); } catch (err) { congruence = { error: err.message }; }
    return {
        spaces, congruence,
        k: describeField(ksub, F, d, reals.length),
        A: {
            split, hamilton, determined: ram.determined,
            aTex: simplifySymbolEntry(aK, ksub, F), bTex: simplifySymbolEntry(bK, ksub, F),
            ram: ramified.map((pl) => ({ kind: pl.kind, tex: pl.tex, approx: pl.approx, byParity: !!pl.byParity })),
            undetermined: ram.places.filter((pl) => pl.ramified === null).map((pl) => pl.tex),
        },
        G: { tex: Gtex, dim: 3 * d },
        ring: { tex: ringTex, S: Splaces.map((pl) => ({ tex: pl.tex, p: pl.p, e: pl.e, f: pl.f })), d, orderIndex: ringDesc.R.index },
        head: `\\langle S \\rangle \\le ${Gtex}\\left(${ringTex}\\right)`,
        lattice: factors,
        compactAt,
        literal,
    };
}

function describeField(ksub, F, d, r1) {
    if (d === 1) return { d, tex: '\\mathbb{Q}', r1: 1, r2: 0 };
    const g = ksub.g;
    const thetaTex = F.tex(ksub.theta);
    if (d === 2) {
        const disc = g[1] * g[1] - 4n * g[0];
        const D = squarefreePart(disc);
        return { d, tex: D === -1n ? '\\mathbb{Q}(i)' : `\\mathbb{Q}(\\sqrt{${D}})`, thetaTex, minpolyTex: X.polyTex(g), discTex: X.numTex(ksub.disc), r1, r2: (d - r1) / 2 };
    }
    return { d, tex: '\\mathbb{Q}(\\theta)', thetaTex, minpolyTex: X.polyTex(g), discTex: X.numTex(ksub.disc), r1, r2: (d - r1) / 2 };
}
function squarefreePart(n) {
    if (n === 0n) return 0n;
    const sign = n < 0n ? -1n : 1n;
    let r = 1n;
    for (const [p, e] of X.factorInt(n).factors) if (e % 2) r *= p;
    return sign * r;
}
/** Hilbert-symbol entry with its rational content reduced modulo squares. */
function simplifySymbolEntry(v, ksub, F) {
    let num = 0n, den = 1n;
    for (const x of v) { num = X.bgcd(num, x.n); den = X.blcm(den, x.d); }
    const c = new Rat(num, den), q = squarefreePart(c.n * c.d); // c > 0 and c ≡ q mod squares
    const w = v.map((x) => x.div(c).mul(new Rat(q)));
    if (w.slice(1).every((x) => x.isZero())) return `${w[0].n}`;
    return F.tex(X.ratVecMat(w, ksub.P));
}

// ── ramification of (a, b)_k ──
function ramification(ksub, aT, bT, extraPrimes = []) { // aT, bT: θ_k-power coordinates
    const O = ksub.O, d = ksub.d, kAlg = ksub.nf.alg;
    const places = [];
    // real places
    if (d === 1) {
        places.push({ kind: 'real', tex: '\\infty', ramified: aT[0].sign() < 0 && bT[0].sign() < 0 });
    } else {
        const g = ksub.g.map((x) => new Rat(x));
        const A = X.qpTrim(aT), B = X.qpTrim(bT);
        isolateRealRoots(g).forEach(([lo, hi], j) => {
            const ram = signAtRoot(A, g, lo, hi) < 0 && signAtRoot(B, g, lo, hi) < 0;
            const approx = (ratToNum(lo) + ratToNum(hi)) / 2;
            places.push({ kind: 'real', tex: `\\infty_{${j + 1}}`, approx, ramified: ram });
        });
    }
    // finite places: primes dividing 2·N(a)·N(b)
    const svA = X.toSV(O.toCoords(aT)), svB = X.toSV(O.toCoords(bT));
    const normQ = (sv) => { const N = O.norm(sv.v); return new Rat(N, sv.den ** BigInt(d)); };
    const cand = new Set(['2', ...extraPrimes.map(String)]);
    let complete = true;
    for (const N of [normQ(svA), normQ(svB)]) for (const part of [N.n, N.d]) {
        const f = X.factorInt(part); if (!f.complete) complete = false;
        for (const [p] of f.factors) cand.add(`${p}`);
    }
    for (const ps of [...cand].map(BigInt).sort((x, y) => (x < y ? -1 : 1))) {
        for (const pr of X.primesAbove(O, ps)) {
            let sym;
            if (ps !== 2n) sym = tameSymbol(O, kAlg, pr, aT, bT);
            else sym = dyadicSymbol(O, kAlg, pr, aT, bT);
            places.push({ kind: 'finite', p: `${ps}`, e: pr.e, f: pr.f, pr, ramified: sym === null ? null : sym === -1 });
        }
    }
    // parity: the number of ramified places is even
    const unknown = places.filter((pl) => pl.ramified === null);
    if (unknown.length === 1) {
        const known = places.filter((pl) => pl.ramified === true).length;
        unknown[0].ramified = known % 2 === 1;
        unknown[0].byParity = true;
    }
    return { places, complete, determined: places.every((pl) => pl.ramified !== null) };
}

// arithmetic in O/𝔭^M (O-coordinates, reduced against the HNF of 𝔭^M)
function localRing(O, pr, M) {
    const n = O.n, p = pr.p;
    const K = Math.ceil(M / pr.e);
    let PM = X.identityHNF(n);
    for (let i = 0; i < M; i++) PM = X.idealMul(O, PM, pr.H, p ** BigInt(K));
    const reduce = (x) => {
        x = x.slice();
        for (const h of PM) { const c = h.findIndex((v) => v !== 0n); const q = X.floorDiv(x[c], h[c]); if (q) for (let j = c; j < n; j++) x[j] -= q * h[j]; }
        return x;
    };
    const mul = (x, y) => reduce(O.mul(x, y));
    const pow = (x, e) => { let r = reduce(O.one), b = reduce(x); while (e > 0n) { if (e & 1n) r = mul(r, b); b = mul(b, b); e >>= 1n; } return r; };
    const Np = p ** BigInt(pr.f);
    const unitGroupOrder = (Np - 1n) * Np ** BigInt(M - 1);
    /** Residue of a 𝔭-integral element given as { v, den } (O-coordinates). */
    const residue = (sv) => {
        const t = X.vpInt(sv.den, p);
        let num = sv.v, den = O.one.map((x) => x * sv.den);
        if (t > 0) { // multiply numerator and denominator by (b/p)^{e t}
            const E = pr.e * t, mod = p ** BigInt(E + K + 1), pE = p ** BigInt(E);
            const cE = O.powMod(pr.b, BigInt(E), mod);
            num = O.mulMod(num, cE, mod).map((x) => x / pE);
            den = O.mulMod(den, cE, mod).map((x) => x / pE);
        }
        const dr = reduce(den);
        if (X.hnfContains(pr.H, dr)) throw new Error('internal: denominator is not a unit');
        return mul(reduce(num), pow(dr, unitGroupOrder - 1n));
    };
    return { PM, reduce, mul, pow, residue, Np, size: PM.reduce((acc, h) => acc * h[h.findIndex((v) => v !== 0n)], 1n) };
}
function kElem(kAlg, O, coords) { return X.toSV(O.toCoords(coords)); }
/** (a, b)_𝔭 at an odd prime: the tame symbol. Returns ±1. */
function tameSymbol(O, kAlg, pr, aT, bT) {
    const al = X.valuationSV(O, pr, kElem(kAlg, O, aT)), be = X.valuationSV(O, pr, kElem(kAlg, O, bT));
    if (!al && !be) return 1;
    let u = kAlg.mul(kAlg.pow(aT, be), kAlg.pow(bT, -al));
    if ((al * be) % 2) u = kAlg.neg(u);
    const L = localRing(O, pr, 1);
    const r = L.pow(L.residue(kElem(kAlg, O, u)), (L.Np - 1n) / 2n);
    const one = L.reduce(O.one);
    return r.every((x, i) => x === one[i]) ? 1 : -1;
}
/** (a, b)_𝔭 at a dyadic prime by a finite search for a primitive zero of a x² + b y² − z² mod 𝔭^{2e+3}. */
function dyadicSymbol(O, kAlg, pr, aT, bT) {
    const e = pr.e, M = 2 * e + 3;
    if (pr.f * M > 10) return null; // too large to search; settled by parity if possible
    const p = pr.p;
    const cp = kAlg.scale(X.ratVecMat(pr.b, O.B), new Rat(1n, p)); // b/p: valuation −1 at 𝔭
    const normalize = (x) => {
        let v = X.valuationSV(O, pr, kElem(kAlg, O, x));
        if (v < 0) { const m = Math.ceil(-v / (2 * e)); x = kAlg.scale(x, new Rat(p ** BigInt(2 * m))); v += 2 * e * m; }
        const t = Math.floor(v / 2);
        if (t > 0) x = kAlg.mul(x, kAlg.pow(cp, 2 * t));
        return x;
    };
    const L = localRing(O, pr, M);
    const a = L.residue(kElem(kAlg, O, normalize(aT))), b = L.residue(kElem(kAlg, O, normalize(bT)));
    // all residues mod 𝔭^M
    const piv = L.PM.map((h) => h[h.findIndex((v) => v !== 0n)]);
    const all = [];
    const rec = (j, acc) => { if (j === O.n) { all.push(acc.slice()); return; } for (let x = 0n; x < piv[j]; x++) { acc[j] = x; rec(j + 1, acc); } };
    rec(0, new Array(O.n).fill(0n));
    const key = (x) => x.join(',');
    const squares = new Set(all.map((z) => key(L.mul(z, z))));
    const isUnit = all.map((x) => !X.hnfContains(pr.H, x));
    const ax = all.map((x) => L.mul(a, L.mul(x, x))), by = all.map((y) => L.mul(b, L.mul(y, y)));
    for (let i = 0; i < all.length; i++) for (let j = 0; j < all.length; j++) {
        if (!isUnit[i] && !isUnit[j]) continue;
        if (squares.has(key(L.reduce(ax[i].map((v, t) => v + by[j][t]))))) return 1;
    }
    return -1;
}

/** Is every generator in PGL_2(O_{K,S}) as a group scheme: v_𝔓(det) = 2 min v_𝔓(entries) for 𝔓 ∉ S? */
/** Primes 𝔓 ∤ S of K at which some generator is not in PGL_2(O_𝔓) as a group scheme (v(det) ≠ 2·min v(entries)). */
function integralityDefects(F, M, gens, tauVals, ringDesc) {
    const K = F.alg;
    const Ksub = X.subfieldData(K, [K.gen()], true);
    const O = Ksub.O;
    const sv = (v) => X.toSV(O.toCoords(X.ratSolveRows(Ksub.P, v)));
    const sat = new Set((ringDesc.R.local || []).filter((l) => l.saturated).map((l) => l.p));
    const cand = new Set();
    const addNorm = (v) => {
        if (K.isZero(v)) return;
        const mp = K.minpoly(v);
        for (const c of [mp[0]]) for (const part of [c.n, c.d]) for (const [p] of X.factorInt(part).factors) cand.add(`${p}`);
        for (const c of mp) for (const [p] of X.factorInt(c.d).factors) cand.add(`${p}`);
    };
    for (const g of gens) { g.forEach(addNorm); addNorm(M.det(g)); }
    const tauSV = tauVals.map(sv);
    const bad = new Set();
    for (const ps of cand) {
        if (sat.has(ps)) continue;
        for (const pr of X.primesAbove(O, BigInt(ps))) {
            if (tauSV.some((t) => !t.v.every((x) => x === 0n) && X.valuationSV(O, pr, t) < 0)) continue; // 𝔓 lies over S
            for (const g of gens) {
                const vals = g.filter((x) => !K.isZero(x)).map((x) => X.valuationSV(O, pr, sv(x)));
                if (X.valuationSV(O, pr, sv(M.det(g))) !== 2 * Math.min(...vals)) { bad.add(ps); break; }
            }
        }
    }
    return bad;
}

// ─────────────────────── symmetric spaces with unbounded orbits ───────────────────────

/**
 * Γ ⊂ G(k) = PGL_1(A)(k) is unbounded at a real place where A splits (Zariski dense ⇒ not in a compact
 * subgroup of PGL_2(R)), at every complex place (a bounded image would lie in PU(2), forcing real
 * traces), and at the finite places in S; it is bounded everywhere else.
 */
function symmetricSpaces(d, ram, Splaces) {
    const reals = ram.places.filter((pl) => pl.kind === 'real');
    const r2 = (d - reals.length) / 2;
    const factors = [], bounded = [];
    for (const pl of reals) {
        if (pl.ramified === false) factors.push({ kind: 'real', space: '\\mathbb{H}^2', place: pl.tex });
        else bounded.push(pl.tex);
    }
    for (let j = 0; j < r2; j++) factors.push({ kind: 'complex', space: '\\mathbb{H}^3', place: r2 > 1 ? `\\mathbb{C}_{${j + 1}}` : '\\mathbb{C}' });
    for (const pl of Splaces) {
        const q = BigInt(pl.p) ** BigInt(pl.f);
        factors.push({ kind: 'tree', space: `T_{${q + 1n}}`, place: pl.tex, q: `${q}` });
    }
    const counts = new Map();
    for (const f of factors) counts.set(f.space, (counts.get(f.space) || 0) + 1);
    const productTex = [...counts.entries()].map(([sp, c]) => (c > 1 ? `\\left(${sp}\\right)^{${c}}` : sp)).join(' \\times ');
    return { factors, bounded, productTex };
}

// ─────────────────────── the congruence closure ───────────────────────

const ratAbsLess = (a, b) => a.abs().sub(b.abs()).sign() < 0;
/** N_{k/Q}(x) for x in θ_k-coordinates. */
function normToQ(kAlg, x, d) {
    const mp = kAlg.minpoly(x), deg = mp.length - 1;
    let c = mp[0];
    if (deg % 2) c = c.neg();
    let N = R1;
    for (let i = 0; i < d / deg; i++) N = N.mul(c);
    return N;
}
function primesOfRat(r) {
    const out = new Set();
    let complete = true;
    for (const part of [r.n, r.d]) {
        if (part === 0n) continue;
        const f = X.factorInt(part);
        if (!f.complete) complete = false;
        for (const [p] of f.factors) if (X.isProbablePrime(p)) out.add(`${p}`);
    }
    return { primes: out, complete };
}

/**
 * The closure of Γ in ∏_{𝔭∉S} G(k_𝔭), prime by prime. Away from a finite candidate set every local closure
 * contains the image P_𝔭 of SL_1 of a maximal order (Dickson + Serre's lifting lemma); the candidates are
 * checked by computing the image of Γ modulo 𝔭^m at a Γ-fixed vertex.
 */
function congruenceClosure(ctx) {
    const { K, M, gens, words, tauVals, sq, ksub, Ok, kAlg, toK, ram, Splaces, ringDesc, d } = ctx;
    const isZk = (x) => x.every((c) => c.isZero());
    const two = K.fromRat(Rint(2));
    // pairs (X, Y) in Γ^{(2)} with tr[X, Y] ≠ 2, from words of length ≤ 2
    const short = words.filter((_, i) => i < 200).slice(0, 24);
    const sqs = short.map(sq);
    const pairs = [];
    for (let i = 0; i < sqs.length; i++) for (let j = i + 1; j < sqs.length; j++) {
        const Xm = sqs[i], Ym = sqs[j];
        const c = K.sub(M.tr(M.mul(M.mul(Xm, Ym), M.mul(M.adj(Xm), M.adj(Ym)))), two);
        if (K.isZero(c)) continue;
        pairs.push({ X: Xm, Y: Ym, c: toK(c), t: [M.tr(Xm), M.tr(Ym), M.tr(M.mul(Xm, Ym))].map(toK) });
        if (pairs.length >= 60) break;
    }
    ctx.pairs = pairs;

    // candidate rational primes, with reasons
    const reasons = new Map();
    let complete = true;
    const add = (p, why) => { const key = `${p}`; if (!reasons.has(key)) reasons.set(key, new Set()); reasons.get(key).add(why); };
    for (const p of ['2', '3', '5']) add(p, 'small residue field');
    for (const pl of ram.places) if (pl.kind === 'finite' && pl.ramified) add(pl.p, 'A ramified');
    for (const [p] of X.factorInt(ksub.disc).factors) add(p, 'ramified in k');
    // the pair with the smallest norm of tr[X,Y] − 2: away from its primes Γ^{(2)} fixes a unique vertex and its image is not Borel/dihedral
    let best = null;
    for (const pp of pairs) { const N = normToQ(kAlg, pp.c, d); if (!best || ratAbsLess(N, best.N)) best = { N, pp }; }
    if (!best) throw new Error('internal: no irreducible pair');
    { const f = primesOfRat(best.N); if (!f.complete) complete = false; f.primes.forEach((p) => add(p, 'reducible pair')); }
    // a word with tr²/det outside {0, 1, 2, 3, 4, roots of t² − 3t + 1}: away from its primes the image is not A4, S4, A5
    let bestW = null;
    for (const tK of tauVals) {
        const t = toK(tK);
        let P = kAlg.fromRat(R1);
        for (const c of [0, 1, 2, 3, 4]) P = kAlg.mul(P, kAlg.sub(t, kAlg.fromRat(Rint(c))));
        P = kAlg.mul(P, kAlg.add(kAlg.sub(kAlg.mul(t, t), kAlg.scale(t, Rint(3))), kAlg.fromRat(R1)));
        if (isZk(P)) continue;
        const N = normToQ(kAlg, P, d);
        if (!bestW || ratAbsLess(N, bestW)) bestW = N;
    }
    if (bestW) { const f = primesOfRat(bestW); if (!f.complete) complete = false; f.primes.forEach((p) => add(p, 'exceptional subgroups')); }
    // the trace ring: away from primes dividing [O_k : R ∩ O_k] the residues of tr²/det generate the residue field
    const idx = BigInt(ringDesc.R.index);
    if (idx > 1n) { const f = X.factorInt(idx); if (!f.complete) complete = false; for (const [p] of f.factors) add(p, 'trace ring'); }
    // cosmetic primes: the matrices are not integral there although Γ is bounded
    if (ctx.defects) for (const p of ctx.defects) add(p, 'cosmetic');

    // local analysis at every prime of k above a candidate, outside S
    const inS = (pr) => Splaces.some((pl) => X.hnfEq(pl.pr.H, pr.H) && `${pl.p}` === `${pr.p}`);
    const ramAt = (pr) => ram.places.some((pl) => pl.kind === 'finite' && pl.ramified && `${pl.p}` === `${pr.p}` && X.hnfEq(pl.pr.H, pr.H));
    const checked = [];
    const cands = [...reasons.keys()].map(BigInt).sort((a, b) => (a < b ? -1 : 1));
    for (const p of cands) {
        for (const pr of X.primesAbove(Ok, p)) {
            if (inS(pr)) continue;
            let res;
            try { res = localClosure(ctx, pr, ramAt(pr)); } catch (err) { res = { p: `${p}`, q: `${p ** BigInt(pr.f)}`, status: 'unknown', note: err.message }; }
            res.reasons = [...reasons.get(`${p}`)];
            res.tex = d === 1 ? `${p}` : X.twoElement(ksub, pr, ctx.fmt);
            checked.push(res);
        }
    }
    // determinant classes (k = Q): Γ meets the square classes generated by tr²/det of words of length ≤ 2
    let dets = null;
    if (d === 1) {
        const vecs = [];
        for (const tK of tauVals.slice(0, 40)) {
            const t = toK(tK)[0];
            if (t.isZero()) continue;
            vecs.push(squarefreePart(t.n * t.d));
        }
        dets = squareClassBasis(vecs).map(String);
    }
    const bad = checked.filter((c) => c.status !== 'full' && c.status !== 'full-partial');
    const total = bad.every((c) => c.index) ? bad.reduce((acc, c) => acc * BigInt(c.index), 1n) : null;
    return { checked, candidates: cands.map(String), complete, dets, totalIndex: total === null ? null : `${total}`, allFull: !bad.length };
}
/** A basis (as squarefree integers) of the subgroup of Q^×/(Q^×)² generated by squarefree integers. */
function squareClassBasis(vals) {
    const supp = (v) => new Set([...(v < 0n ? ['-1'] : []), ...X.factorInt(v < 0n ? -v : v).factors.map(([p]) => `${p}`)]);
    const xor = (a, b) => { const c = new Set(a); for (const x of b) { if (c.has(x)) c.delete(x); else c.add(x); } return c; };
    const order = (x) => (x === '-1' ? -1n : BigInt(x));
    const rows = []; // { set, lead } with distinct leads (largest element)
    for (const v of vals) {
        let s = supp(v);
        for (const r of rows) if (s.has(r.lead)) s = xor(s, r.set);
        if (!s.size) continue;
        const lead = [...s].sort((a, b) => (order(a) < order(b) ? 1 : -1))[0];
        for (const r of rows) if (r.set.has(lead)) r.set = xor(r.set, s);
        rows.push({ set: s, lead });
    }
    return rows.map((r) => [...r.set].reduce((acc, x) => acc * order(x), 1n)).sort((a, b) => (a < b ? -1 : 1));
}

/** A uniformizer of k at 𝔭, in θ_k-coordinates. */
function uniformizer(Ok, pr) {
    if (pr.e === 1) return Ok.fromCoords(Ok.one.map((x) => x * pr.p));
    for (const r of pr.H) if (X.valuationInt(Ok, pr, r) === 1) return Ok.fromCoords(r);
    for (const r of pr.H) for (const s of pr.H) { const t = r.map((x, i) => x + s[i]); if (X.valuationInt(Ok, pr, t) === 1) return Ok.fromCoords(t); }
    throw new Error('internal: no uniformizer');
}

/** Schreier generators of the subgroup of elements with even parity (index ≤ 2). */
function evenSubgroup(elts, par, mul, inv) {
    const t = par.findIndex(Boolean);
    if (t < 0) return elts.slice();
    const T = elts[t], Ti = inv(T), out = [];
    elts.forEach((s, i) => {
        if (!par[i]) { out.push(s); out.push(mul(mul(T, s), Ti)); }
        else { if (i !== t) out.push(mul(s, Ti)); out.push(mul(T, s)); }
    });
    return out;
}

// structure constants of O⟨1, X, Y, XY⟩ for X, Y with det 1 and t1 = tr X, t2 = tr Y, t3 = tr XY
function pairStructure(kAlg, t) {
    const [t1, t2, t3] = t, z = kAlg.fromRat(R0), o = kAlg.fromRat(R1), m1 = kAlg.fromRat(Rint(-1));
    const neg = (x) => kAlg.neg(x);
    const S = [[], [], [], []];
    for (let j = 0; j < 4; j++) { S[0][j] = [z, z, z, z]; S[0][j][j] = o; S[j][0] = [z, z, z, z]; S[j][0][j] = o; }
    S[1][1] = [m1, t1, z, z];
    S[1][2] = [z, z, z, o];
    S[1][3] = [z, z, m1, t1];
    S[2][1] = [kAlg.sub(t3, kAlg.mul(t1, t2)), t2, t1, m1];
    S[2][2] = [m1, z, t2, z];
    S[2][3] = [neg(t1), o, t3, z];
    S[3][1] = [neg(t2), t3, o, z];
    S[3][2] = [z, m1, z, t2];
    S[3][3] = [m1, z, z, t3];
    return S;
}
/**
 * A 4-dimensional algebra over a commutative ring R: structure constants S (S[i][j] = coordinates of b_i b_j),
 * trace coefficients trCoef (tr b_i) and the coordinates `unit` of 1 — or the matrix basis E11, E12, E21, E22 when S is null.
 */
function algebraOps(R, S, trCoef, unit) {
    const zero4 = () => [R.zero, R.zero, R.zero, R.zero];
    const mul = S ? (x, y) => {
        const out = zero4();
        for (let i = 0; i < 4; i++) { if (R.isZero(x[i])) continue; for (let j = 0; j < 4; j++) { if (R.isZero(y[j])) continue; const c = R.mul(x[i], y[j]); const s = S[i][j]; for (let l = 0; l < 4; l++) if (!R.isZero(s[l])) out[l] = R.add(out[l], R.mul(c, s[l])); } }
        return out;
    } : (x, y) => [R.add(R.mul(x[0], y[0]), R.mul(x[1], y[2])), R.add(R.mul(x[0], y[1]), R.mul(x[1], y[3])), R.add(R.mul(x[2], y[0]), R.mul(x[3], y[2])), R.add(R.mul(x[2], y[1]), R.mul(x[3], y[3]))];
    const tr = S ? (x) => x.reduce((acc, c, i) => R.add(acc, R.mul(trCoef[i], c)), R.zero) : (x) => R.add(x[0], x[3]);
    const one = S ? (unit || [R.one, R.zero, R.zero, R.zero]) : [R.one, R.zero, R.zero, R.one];
    const scale = (x, c) => x.map((v) => R.mul(v, c));
    const conj = S ? (x) => { const t = tr(x); return one.map((o, i) => R.sub(R.mul(t, o), x[i])); } : (x) => [x[3], R.neg(x[1]), R.neg(x[2]), x[0]];
    const iu = one.findIndex((o) => R.isUnit(o)), ouInv = S ? R.inv(one[iu]) : null;
    const nrd = S ? (x) => R.mul(mul(x, conj(x))[iu], ouInv) : (x) => R.sub(R.mul(x[0], x[3]), R.mul(x[1], x[2]));
    // x is scalar iff x − (x_iu / one_iu)·1 vanishes
    const isScalar = S ? (x) => { const c = R.mul(x[iu], ouInv); return x.every((v, i) => R.isZero(R.sub(v, R.mul(c, one[i])))); } : (x) => R.isZero(x[1]) && R.isZero(x[2]) && R.isZero(R.sub(x[0], x[3]));
    return { mul, tr, one, conj, nrd, scale, isScalar };
}
const kRing = (kAlg) => ({
    zero: kAlg.fromRat(R0), one: kAlg.fromRat(R1), two: kAlg.fromRat(Rint(2)),
    add: (a, b) => kAlg.add(a, b), sub: (a, b) => kAlg.sub(a, b), mul: (a, b) => kAlg.mul(a, b), neg: (a) => kAlg.neg(a),
    isZero: (a) => a.every((c) => c.isZero()), isUnit: (a) => !a.every((c) => c.isZero()), inv: (a) => kAlg.inv(a),
});

/** Data at one prime: generators of (the even part of) Γ as units of a Γ-stable maximal order, in coordinates over k. */
function localSpec(ctx, pr, ramifiedA) {
    const { K, M, gens, kAlg, toK, Ok } = ctx;
    const pi = uniformizer(Ok, pr);
    const val = (x) => (x.every((c) => c.isZero()) ? Infinity : X.valuationSV(Ok, pr, X.toSV(Ok.toCoords(x))));
    const Rk = kRing(kAlg);
    if (ctx.d === ctx.n) {
        // K = k: the matrices themselves, moved to a vertex fixed by Γ (a Γ-stable lattice)
        const A = algebraOps(Rk, null);
        const mats = gens.map((g) => g.map(toK));
        const par = mats.map((m) => Math.abs(val(A.nrd(m))) % 2 === 1);
        const evs = evenSubgroup(mats, par, A.mul, A.conj).map((m) => {
            const v = val(A.nrd(m));
            return A.scale(m, kAlg.pow(pi, -(v / 2)));
        });
        const lat = stableLattice(evs, kAlg, val, pi);
        const P = [lat.u0, Rk.zero, lat.x, kAlg.pow(pi, lat.b)];
        const detP = A.nrd(P), Pinv = A.scale(A.conj(P), kAlg.inv(detP));
        const local = evs.map((m) => A.mul(A.mul(Pinv, m), P));
        const standard = lat.a === 0 && lat.b === 0 && val(lat.x) >= 0;
        return { S: null, gens: local, inverts: par.some(Boolean), lattice: standard ? null : lat, pi };
    }
    // K ≠ k: work in A over k, in the basis 1, G, H, GH; take the order generated by Γ and enlarge it to a maximal one
    const { G, H } = ctx.hilbert;
    const t0 = [M.tr(G), M.tr(H), M.tr(M.mul(G, H))].map(toK);
    const A = algebraOps(Rk, pairStructure(kAlg, t0), [Rk.two, ...t0]);
    const basisK = [M.id(), G, H, M.mul(G, H)];
    const coordsOf = (g) => {
        const c = solveLinear(K, basisK, g);
        const j = c.findIndex((x) => !K.isZero(x)), inv = K.inv(c[j]);
        return c.map((x) => toK(K.mul(x, inv)));
    };
    const elts = gens.map(coordsOf);
    const par = elts.map((x) => Math.abs(val(A.nrd(x))) % 2 === 1);
    const evs = evenSubgroup(elts, par, A.mul, A.conj).map((x) => A.scale(x, kAlg.pow(pi, -(val(A.nrd(x)) / 2))));
    const ord = orderTools(A, kAlg, val, pi);
    let Lam = ord.closure([A.one], evs);
    if (!Lam) return null;
    const target = ramifiedA ? 2 : 0;
    let v = ord.discVal(Lam), enlarged = 0;
    const q = pr.p ** BigInt(pr.f);
    while (v > target) {
        if (q > 7n) return { deficient: true, inverts: par.some(Boolean), orderDisc: v, pi };
        const reps = residueReps(Ok, pr);
        const bigger = ord.enlarge(Lam, reps, v);
        if (!bigger) return { deficient: true, inverts: par.some(Boolean), orderDisc: v, pi };
        Lam = bigger; v = ord.discVal(Lam); enlarged++;
    }
    // structure constants of the maximal order Λ in its own basis
    const basis = Lam.basis;
    const solveB = (x) => solveField(Rk, basis, x);
    const S = basis.map((bi) => basis.map((bj) => solveB(A.mul(bi, bj))));
    return {
        S, trCoef: basis.map((b) => A.tr(b)), unit: solveB(A.one),
        gens: evs.map(solveB), inverts: par.some(Boolean), lattice: null, pi, enlarged, generatedMaximal: enlarged === 0,
    };
}
/** Solve Σ c_i B_i = v over a field R (B: 4 vectors). */
function solveField(R, B, v) {
    const rows = [0, 1, 2, 3].map((e) => B.map((b) => b[e]).concat([v[e]]));
    const piv = [];
    let r = 0;
    for (let c = 0; c < 4; c++) {
        let i = r; while (i < 4 && R.isZero(rows[i][c])) i++;
        if (i === 4) continue;
        [rows[r], rows[i]] = [rows[i], rows[r]];
        const inv = R.inv(rows[r][c]);
        rows[r] = rows[r].map((x) => R.mul(x, inv));
        for (let i2 = 0; i2 < 4; i2++) if (i2 !== r && !R.isZero(rows[i2][c])) { const f = rows[i2][c]; rows[i2] = rows[i2].map((x, j) => R.sub(x, R.mul(f, rows[r][j]))); }
        piv.push(c); r++;
    }
    const out = [R.zero, R.zero, R.zero, R.zero];
    piv.forEach((c, i) => { out[c] = rows[i][4]; });
    return out;
}
/** Residue representatives of O_k/𝔭, as θ_k-coordinates. */
function residueReps(Ok, pr) {
    const L = localRing(Ok, pr, 1);
    const piv = L.PM.map((row) => row[row.findIndex((v) => v !== 0n)]);
    const out = [];
    const rec = (j, acc) => { if (j === acc.length) { out.push(Ok.fromCoords(acc)); return; } for (let x = 0n; x < piv[j]; x++) { acc[j] = x; rec(j + 1, acc.slice()); } };
    rec(0, Ok.one.map(() => 0n));
    return out;
}
/**
 * O_𝔭-lattices in A (4-dimensional over k) in echelon form, orders generated by elements, discriminants,
 * and one-step enlargement inside π⁻¹Λ.
 */
function orderTools(A, kAlg, val, pi) {
    const Rk = kRing(kAlg);
    const isZ = (x) => Rk.isZero(x);
    const span = (vecs) => {
        let rest = vecs.filter((v) => !v.every(isZ)).map((v) => v.slice());
        const basis = [], pivots = [];
        for (let c = 0; c < 4 && rest.length; c++) {
            let best = null, bv = Infinity;
            for (const v of rest) if (!isZ(v[c])) { const w = val(v[c]); if (w < bv) { bv = w; best = v; } }
            if (!best) continue;
            const sc = kAlg.mul(kAlg.pow(pi, bv), kAlg.inv(best[c]));
            const b = best.map((x) => kAlg.mul(x, sc));
            const next = [];
            for (const v of rest) {
                if (v === best) continue;
                const f = kAlg.mul(v[c], kAlg.pow(pi, -bv));
                const w = v.map((x, i) => kAlg.sub(x, kAlg.mul(f, b[i])));
                if (!w.every(isZ)) next.push(w);
            }
            basis.push(b); pivots.push(bv); rest = next;
        }
        return { basis, pivots, rank: basis.length, vol: pivots.reduce((a, x) => a + x, 0) };
    };
    // the order generated by `start` and `gens` (closure under right multiplication); null if unbounded
    const closure = (start, gens) => {
        let L = span(start);
        for (let it = 0; it < 60; it++) {
            const vecs = L.basis.slice();
            for (const b of L.basis) for (const g of gens) vecs.push(A.mul(b, g));
            const L2 = span(vecs);
            if (L2.pivots.some((x) => x < -6)) return null;
            if (L2.rank === L.rank && L2.vol === L.vol) return L2;
            L = L2;
        }
        return null;
    };
    const det4 = (Mx) => { // Gaussian elimination over k
        const m = Mx.map((r) => r.slice());
        let det = Rk.one;
        for (let c = 0; c < 4; c++) {
            let r = c; while (r < 4 && isZ(m[r][c])) r++;
            if (r === 4) return Rk.zero;
            if (r !== c) { [m[r], m[c]] = [m[c], m[r]]; det = kAlg.neg(det); }
            det = kAlg.mul(det, m[c][c]);
            const inv = kAlg.inv(m[c][c]);
            for (let i = c + 1; i < 4; i++) if (!isZ(m[i][c])) { const f = kAlg.mul(m[i][c], inv); m[i] = m[i].map((x, j) => kAlg.sub(x, kAlg.mul(f, m[c][j]))); }
        }
        return det;
    };
    const discVal = (L) => val(det4(L.basis.map((bi) => L.basis.map((bj) => A.tr(A.mul(bi, bj))))));
    // an order Λ' with Λ ⊊ Λ' ⊆ π⁻¹Λ generated by Λ and one element (exists whenever Λ is not maximal)
    const enlarge = (L, reps, v0) => {
        const pinv = kAlg.pow(pi, -1);
        const idx = new Array(4).fill(0);
        for (;;) {
            let k2 = 0; while (k2 < 4 && idx[k2] === reps.length - 1) { idx[k2] = 0; k2++; }
            if (k2 === 4) return null;
            idx[k2]++;
            let x = [Rk.zero, Rk.zero, Rk.zero, Rk.zero];
            idx.forEach((r, i) => { if (r) x = x.map((c, j) => kAlg.add(c, kAlg.mul(reps[r], L.basis[i][j]))); });
            x = x.map((c) => kAlg.mul(c, pinv));
            if (val(A.tr(x)) < 0 || val(A.nrd(x)) < 0) continue;
            const L2 = closure(L.basis.concat([x]), L.basis.concat([x]));
            if (L2 && L2.rank === 4 && discVal(L2) < v0) return L2;
        }
    };
    return { span, closure, discVal, enlarge };
}
/** Solve Σ c_i B_i = Z for c ∈ K^4 (2×2 matrices over K). */
function solveLinear(K, B, Z) {
    const rows = [0, 1, 2, 3].map((e) => B.map((b) => b[e]).concat([Z[e]]));
    const piv = [];
    let r = 0;
    for (let c = 0; c < 4; c++) {
        let i = r; while (i < 4 && K.isZero(rows[i][c])) i++;
        if (i === 4) continue;
        [rows[r], rows[i]] = [rows[i], rows[r]];
        const inv = K.inv(rows[r][c]);
        rows[r] = rows[r].map((x) => K.mul(x, inv));
        for (let i2 = 0; i2 < 4; i2++) if (i2 !== r && !K.isZero(rows[i2][c])) { const f = rows[i2][c]; rows[i2] = rows[i2].map((x, j) => K.sub(x, K.mul(f, rows[r][j]))); }
        piv.push(c); r++;
    }
    const out = [0, 1, 2, 3].map(() => K.fromRat(R0));
    piv.forEach((c, i) => { out[c] = rows[i][4]; });
    return out;
}
/** A lattice in k_𝔭² fixed by the given matrices (unit determinants): basis u = (π^a, x), w = (0, π^b). */
function stableLattice(mats, kAlg, val, pi) {
    const Rk = kRing(kAlg);
    const apply = (g, v) => [kAlg.add(kAlg.mul(g[0], v[0]), kAlg.mul(g[1], v[1])), kAlg.add(kAlg.mul(g[2], v[0]), kAlg.mul(g[3], v[1]))];
    const invs = mats.map((g) => { const dt = kAlg.sub(kAlg.mul(g[0], g[3]), kAlg.mul(g[1], g[2])), di = kAlg.inv(dt); return [g[3], kAlg.neg(g[1]), kAlg.neg(g[2]), g[0]].map((x) => kAlg.mul(x, di)); });
    const all = mats.concat(invs);
    const span = (vecs) => {
        let a = Infinity, z = null;
        for (const v of vecs) if (!Rk.isZero(v[0])) { const w = val(v[0]); if (w < a) { a = w; z = v; } }
        const pa = kAlg.pow(pi, a), sc = kAlg.mul(pa, kAlg.inv(z[0]));
        const u = [pa, kAlg.mul(z[1], sc)];
        let b = Infinity;
        for (const v of vecs) { const s = kAlg.sub(v[1], kAlg.mul(kAlg.mul(v[0], kAlg.inv(u[0])), u[1])); if (!Rk.isZero(s)) b = Math.min(b, val(s)); }
        return { a, b, u0: u[0], x: u[1] };
    };
    let L = span([[Rk.one, Rk.zero], [Rk.zero, Rk.one]]);
    for (let it = 0; it < 200; it++) {
        const u = [L.u0, L.x], w = [Rk.zero, kAlg.pow(pi, L.b)];
        const vecs = [u, w];
        for (const g of all) vecs.push(apply(g, u), apply(g, w));
        const L2 = span(vecs);
        const dx = kAlg.sub(L2.x, L.x);
        if (L2.a === L.a && L2.b === L.b && (Rk.isZero(dx) || val(dx) >= L.b)) return L;
        L = L2;
    }
    throw new Error('internal: no stable lattice found');
}

/** The finite ring O_k/𝔭^m with the operations the enumeration needs (lookup tables when it is small). */
const ringCache = new Map();
function residueRing(Ok, pr, m) {
    const key = `${pr.p}|${pr.H.map((r) => r.join(',')).join(';')}|${m}`;
    if (ringCache.has(key)) return ringCache.get(key);
    const R = smallRing(Ok, pr, m) || bigRing(Ok, pr, m);
    ringCache.set(key, R);
    if (ringCache.size > 60) ringCache.delete(ringCache.keys().next().value);
    return R;
}
function smallRing(Ok, pr, m) {
    const L = localRing(Ok, pr, m);
    if (L.size > 1024n) return null;
    const piv = L.PM.map((row) => row[row.findIndex((v) => v !== 0n)]);
    const elems = [];
    const rec = (j, acc) => { if (j === acc.length) { elems.push(acc.slice()); return; } for (let x = 0n; x < piv[j]; x++) { acc[j] = x; rec(j + 1, acc); } };
    rec(0, Ok.one.map(() => 0n));
    const N = elems.length, index = new Map(elems.map((x, i) => [x.join(','), i]));
    const idx = (x) => index.get(L.reduce(x).join(','));
    const addT = new Uint16Array(N * N), mulT = new Uint16Array(N * N);
    for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
        addT[i * N + j] = addT[j * N + i] = idx(elems[i].map((x, t) => x + elems[j][t]));
        mulT[i * N + j] = mulT[j * N + i] = index.get(L.mul(elems[i], elems[j]).join(','));
    }
    const zero = idx(Ok.one.map(() => 0n)), one = idx(Ok.one);
    const negT = new Uint16Array(N), invT = new Int32Array(N).fill(-1), unitT = new Uint8Array(N), sqT = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
        negT[i] = idx(elems[i].map((x) => -x));
        unitT[i] = X.hnfContains(pr.H, elems[i]) ? 0 : 1;
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (mulT[i * N + j] === one) { invT[i] = j; break; }
    for (let i = 0; i < N; i++) if (unitT[i]) sqT[mulT[i * N + i]] = 1;
    let units = 0, squares = 0;
    for (let i = 0; i < N; i++) { units += unitT[i]; squares += sqT[i]; }
    return {
        L, q: L.Np, m, size: L.size, small: true,
        zero, one, two: addT[one * N + one],
        add: (a, b) => addT[a * N + b], sub: (a, b) => addT[a * N + negT[b]], neg: (a) => negT[a], mul: (a, b) => mulT[a * N + b],
        isZero: (a) => a === zero, isUnit: (a) => unitT[a] === 1, inv: (a) => invT[a],
        isSquare: (a) => sqT[a] === 1, squareClasses: BigInt(units / squares), vec: (a) => elems[a],
        fromK: (x) => index.get(L.residue(X.toSV(Ok.toCoords(x))).join(',')),
        fromInt: (c) => idx(Ok.one.map((x) => BigInt(c) * x)),
        key: (a) => a,
    };
}
function bigRing(Ok, pr, m) {
    const L = localRing(Ok, pr, m);
    const one = L.reduce(Ok.one), zero = one.map(() => 0n);
    const q = L.Np, unitOrder = (q - 1n) * q ** BigInt(m - 1);
    const invCache = new Map();
    const R = {
        L, q, m, size: L.size,
        zero, one, two: L.reduce(Ok.one.map((x) => 2n * x)),
        add: (a, b) => L.reduce(a.map((x, i) => x + b[i])),
        sub: (a, b) => L.reduce(a.map((x, i) => x - b[i])),
        neg: (a) => L.reduce(a.map((x) => -x)),
        mul: (a, b) => L.mul(a, b),
        isZero: (a) => a.every((x) => x === 0n),
        isUnit: (a) => !X.hnfContains(pr.H, a),
        inv: (a) => { const k2 = a.join(','); if (!invCache.has(k2)) invCache.set(k2, L.pow(a, unitOrder - 1n)); return invCache.get(k2); },
        fromK: (x) => L.residue(X.toSV(Ok.toCoords(x))),
        fromInt: (c) => L.reduce(Ok.one.map((x) => BigInt(c) * x)),
        key: (a) => a.join(','), vec: (a) => a,
        unitOrder,
    };
    // square classes of units
    if (pr.p !== 2n) {
        const h = (q - 1n) / 2n;
        R.isSquare = (u) => X.hnfContains(pr.H, L.reduce(L.pow(u, h).map((x, i) => x - one[i])));
        R.squareClasses = 2n;
    } else {
        const piv = L.PM.map((row) => row[row.findIndex((v) => v !== 0n)]);
        const squares = new Set();
        let units = 0n;
        const rec = (j, acc) => {
            if (j === acc.length) { if (R.isUnit(acc)) { units++; squares.add(L.mul(acc, acc).join(',')); } return; }
            for (let x = 0n; x < piv[j]; x++) { acc[j] = x; rec(j + 1, acc); }
        };
        rec(0, zero.slice());
        R.isSquare = (u) => squares.has(u.join(','));
        R.squareClasses = units / BigInt(squares.size);
    }
    return R;
}

/** The image of the generators in (Λ/𝔭^m Λ)^× modulo scalars; null if it exceeds cap. */
function imageMod(spec, Ok, pr, m, cap) {
    const R = residueRing(Ok, pr, m);
    const S = spec.S ? spec.S.map((row) => row.map((c) => c.map(R.fromK))) : null;
    const A = algebraOps(R, S, spec.S ? spec.trCoef.map(R.fromK) : null, spec.S ? spec.unit.map(R.fromK) : null);
    const gens = spec.gens.map((g) => g.map(R.fromK));
    const keyOf = (x) => {
        const i = x.findIndex((c) => R.isUnit(c));
        const inv = R.inv(x[i]);
        return x.map((c) => R.key(R.mul(c, inv))).join('|');
    };
    const seen = new Set([keyOf(A.one)]), queue = [A.one];
    let squareCount = 1;
    while (queue.length) {
        const x = queue.pop();
        for (const g of gens) {
            const y = A.mul(x, g), k2 = keyOf(y);
            if (seen.has(k2)) continue;
            seen.add(k2); queue.push(y);
            if (R.isSquare(A.nrd(y))) squareCount++;
            if (seen.size > cap) return null;
        }
    }
    return { size: seen.size, square: squareCount, R, A, gens };
}

/** Dickson's criteria for the image mod 𝔭 to contain PSL_2(F_q) (q ≥ 7, q ≠ 9, A split at 𝔭). */
function dicksonFull(spec, Ok, pr) {
    const R = residueRing(Ok, pr, 1);
    const S = spec.S ? spec.S.map((row) => row.map((c) => c.map(R.fromK))) : null;
    const A = algebraOps(R, S, spec.S ? spec.trCoef.map(R.fromK) : null, spec.S ? spec.unit.map(R.fromK) : null);
    const gens = spec.gens.map((g) => g.map(R.fromK));
    const letters = gens.concat(gens.map((g) => A.scale(A.conj(g), R.inv(A.nrd(g)))));
    const words = letters.slice();
    for (const a of letters) for (const b of letters) { words.push(A.mul(a, b)); if (words.length > 120) break; }
    const tau = (w) => R.mul(R.mul(A.tr(w), A.tr(w)), R.inv(A.nrd(w)));
    // (a) an irreducible pair of elements of the image of Γ^{(2)}
    const sqs = words.slice(0, 24).map((w) => A.scale(A.mul(w, w), R.inv(A.nrd(w))));
    let irreducible = false;
    for (let i = 0; i < sqs.length && !irreducible; i++) for (let j = i + 1; j < sqs.length; j++) {
        const c = A.tr(A.mul(A.mul(sqs[i], sqs[j]), A.mul(A.conj(sqs[i]), A.conj(sqs[j]))));
        if (!R.isZero(R.sub(c, R.two))) { irreducible = true; break; }
    }
    // (b) an element that does not occur in A4, S4 or A5
    const E = [0, 1, 2, 3, 4].map((c) => R.fromInt(c));
    let nonExceptional = false;
    for (const w of words) {
        const t = tau(w);
        const inE = E.some((e) => R.isZero(R.sub(t, e))) || R.isZero(R.add(R.sub(R.mul(t, t), R.mul(R.fromInt(3), t)), R.one));
        if (!inE || (pr.p >= 7n && R.isZero(R.sub(t, E[4])) && !A.isScalar(w))) { nonExceptional = true; break; }
    }
    // (c) the residues of tr²/det generate F_q
    const pv = R.L.PM.map((row) => row[row.findIndex((v) => v !== 0n)]);
    const cols = pv.map((v, i) => (v === pr.p ? i : -1)).filter((i) => i >= 0);
    const vec = (x) => { const v = R.vec(x); return cols.map((i) => X.bmod(v[i], pr.p)); };
    const basis = [];
    const addVec = (x) => {
        let v = vec(x);
        for (const b of basis) { const t = v[b.piv]; if (t) { const f = t * X.modInv(b.v[b.piv], pr.p) % pr.p; v = v.map((y, i) => X.bmod(y - f * b.v[i], pr.p)); } }
        const piv = v.findIndex((y) => y !== 0n);
        if (piv < 0) return false;
        basis.push({ v, piv, x }); return true;
    };
    addVec(R.one);
    for (const w of words) addVec(tau(w));
    for (let i = 0; i < basis.length; i++) for (let j = 0; j <= i; j++) addVec(R.mul(basis[i].x, basis[j].x));
    const generates = basis.length === pr.f;
    return { full: irreducible && nonExceptional && generates, irreducible, nonExceptional, generates };
}

/**
 * Is the level-1 kernel of the closure full, i.e. does Γ̄ ∩ Γ(𝔭) map onto Γ(𝔭)/Γ(𝔭²) (modulo scalars)?
 * Sampled from w^{ord(w)} for short words w and their conjugates; split 𝔭, p odd, small residue rings only.
 * For p odd the bracket [L_1, L_i] = L_{i+1} then fills every deeper level, so Γ̄ ⊇ Γ(𝔭).
 */
function level1KernelFull(spec, Ok, pr) { return levelKernelFull(spec, Ok, pr, 1, 3 * pr.f); }
/**
 * Same at level i, for the part P (square reduced norm): does Γ̄ ∩ P ∩ Γ(𝔭^i) map onto (P ∩ Γ(𝔭^i))/Γ(𝔭^{i+1})
 * modulo scalars? `dim` is the F_p-dimension of that quotient.
 */
function levelKernelFull(spec, Ok, pr, lev, dim) {
    const R1 = residueRing(Ok, pr, 1), Ri = residueRing(Ok, pr, lev), R2 = residueRing(Ok, pr, lev + 1);
    if (!R1.small) return false;
    const alg = (R) => {
        const S = spec.S ? spec.S.map((row) => row.map((c) => c.map(R.fromK))) : null;
        return algebraOps(R, S, spec.S ? spec.trCoef.map(R.fromK) : null, spec.S ? spec.unit.map(R.fromK) : null);
    };
    const A1 = alg(Ri), A2 = alg(R2), Ares = alg(R1);
    const g1 = spec.gens.map((g) => g.map(Ri.fromK)), g2 = spec.gens.map((g) => g.map(R2.fromK));
    const inv2 = (x) => A2.scale(A2.conj(x), R2.inv(A2.nrd(x)));
    // words of length ≤ 4 in the generators and their inverses, tracked mod 𝔭 and mod 𝔭²
    // (short words can all be torsion, e.g. in triangle groups, and then w^{ord w} = 1 says nothing)
    const letters = g1.map((x, i) => [x, g2[i]]).concat(g1.map((x, i) => [A1.conj(x), A2.conj(g2[i])]));
    let layer = letters.slice();
    const words = letters.slice();
    const budget = lev === 1 ? 200 : 60;
    for (let len = 2; len <= 4 && words.length < 2 * budget; len++) {
        const next = [];
        for (const [a1, a2] of layer) for (const [b1, b2] of letters) next.push([A1.mul(a1, b1), A2.mul(a2, b2)]);
        layer = next.slice(0, budget);
        words.push(...layer);
    }
    const q = Number(R1.q), p = Number(pr.p), f = pr.f;
    const maxOrd = (q + 1) * q ** (lev - 1) * p;
    // division by π^i: 𝔭^i/𝔭^{i+1} ≅ F_q
    let pi2 = R2.one; for (let t = 0; t < lev; t++) pi2 = R2.mul(pi2, R2.fromK(spec.pi));
    const divPi = new Map();
    for (let a = 0; a < Number(R1.size); a++) {
        const lift = R2.fromK(Ok.fromCoords(R1.vec(a))); // canonical representative of a, as an element of O/𝔭²
        divPi.set(R2.key(R2.mul(pi2, lift)), a);
    }
    const piv = R1.L.PM.map((row) => row[row.findIndex((v) => v !== 0n)]);
    const cols = piv.map((v, i) => (v === pr.p ? i : -1)).filter((i) => i >= 0);
    const fp = (a) => cols.map((i) => Number(X.bmod(R1.vec(a)[i], pr.p)));
    const basis = [];
    const addVec = (v) => {
        v = v.slice();
        for (const b of basis) { const t = v[b.piv]; if (t) { let inv = 1; while ((inv * b.v[b.piv]) % p !== 1) inv++; const c = (t * inv) % p; for (let i = 0; i < v.length; i++) v[i] = ((v[i] - c * b.v[i]) % p + p) % p; } }
        const piv2 = v.findIndex((x) => x !== 0);
        if (piv2 >= 0) { basis.push({ v, piv: piv2 }); return true; }
        return false;
    };
    const classOf = (y) => { // y ≡ scalar mod 𝔭: return the F_p-vector of (y/s − 1)/π, or null
        const iu = y.findIndex((c) => R2.isUnit(c));
        if (iu < 0) return null;
        const yy = A2.scale(y, R2.mul(R2.inv(y[iu]), A2.one[iu]));
        const z = yy.map((c, i) => R2.sub(c, A2.one[i]));
        const parts = z.map((c) => divPi.get(R2.key(c)));
        if (parts.some((c) => c === undefined)) return null;
        return parts.flatMap(fp);
    };
    // the scalar line π^i·F_q·1 (classes are taken modulo scalars)
    for (let a = 0; a < Number(R1.size); a++) addVec(Ares.one.flatMap((o) => fp(R1.mul(a, o))));
    // the Γ-submodule generated by the sampled classes: conjugate new kernel elements until nothing new appears
    const conjugators = [...g2, ...g2.map(inv2)];
    const queue = [];
    const need = 4 * f;
    const offer = (y) => { const v = classOf(y); if (v && addVec(v)) queue.push(y); };
    // the classes of P ∩ Γ(𝔭^i) (square reduced norm) form a subspace W; for p odd it is everything,
    // for p = 2 it is found by testing every class. The kernel is full on P iff W ⊆ span of the sampled classes.
    let W = null;
    if (pr.p === 2n) {
        if (q ** 4 > 70000) return false;
        const reps = [];
        for (let a = 0; a < Number(R1.size); a++) reps.push(a);
        W = [];
        const lift = (a) => R2.fromK(Ok.fromCoords(R1.vec(a)));
        const idx = [0, 0, 0, 0];
        for (;;) {
            const y = A2.one.map((o, i) => R2.add(o, R2.mul(pi2, lift(idx[i]))));
            if (R2.isSquare(A2.nrd(y))) W.push(idx.flatMap((a) => fp(a)));
            let t = 0; while (t < 4 && idx[t] === reps.length - 1) { idx[t] = 0; t++; }
            if (t === 4) break;
            idx[t]++;
        }
    }
    const inSpan = (v) => {
        v = v.slice();
        for (const b of basis) { const t = v[b.piv]; if (t) { let inv = 1; while ((inv * b.v[b.piv]) % p !== 1) inv++; const c = (t * inv) % p; for (let i = 0; i < v.length; i++) v[i] = ((v[i] - c * b.v[i]) % p + p) % p; } }
        return v.every((x) => x === 0);
    };
    const done = () => (W ? W.every(inSpan) : basis.length >= need);
    for (const [w1, w2] of words) {
        let ord = 1, P = w1;
        while (!A1.isScalar(P) && ord <= maxOrd) { P = A1.mul(P, w1); ord++; }
        if (ord > maxOrd) continue;
        let y = A2.one;
        for (let i = 0; i < ord; i++) y = A2.mul(y, w2);
        offer(y);
        while (queue.length && basis.length < need) {
            const z = queue.pop();
            for (const c of conjugators) offer(A2.mul(A2.mul(c, z), A2.conj(c)));
        }
        if (basis.length >= need || (W && done())) return true;
    }
    return done();
}

/**
 * The exact image of Γ̄ ∩ Γ(𝔭^i) in Γ(𝔭^i)/Γ(𝔭^{i+1}) modulo scalars, by Schreier's lemma: enumerate the image mod 𝔭^i while
 * tracking representatives mod 𝔭^{i+1}; each collision of two words gives a kernel element, and these generate the kernel.
 * Returns the F_p-rank of the kernel classes (the full projective kernel has rank 3f) and the image data mod 𝔭^i.
 */
function schreierKernel(spec, Ok, pr, lev, cap) {
    const R1 = residueRing(Ok, pr, 1), Ri = residueRing(Ok, pr, lev), R2 = residueRing(Ok, pr, lev + 1);
    if (!R1.small || !R2.small) return null;
    const alg = (R) => {
        const S = spec.S ? spec.S.map((row) => row.map((c) => c.map(R.fromK))) : null;
        return algebraOps(R, S, spec.S ? spec.trCoef.map(R.fromK) : null, spec.S ? spec.unit.map(R.fromK) : null);
    };
    const Ai = alg(Ri), A2 = alg(R2);
    const gens = spec.gens.map((g) => g.map(R2.fromK));
    const down = new Map(); // R_{i+1} → R_i
    const toI = (a) => { if (!down.has(a)) down.set(a, Ri.fromK(Ok.fromCoords(R2.vec(a)))); return down.get(a); };
    const keyOf = (x) => { const y = x.map(toI); const j = y.findIndex((c) => Ri.isUnit(c)); const inv = Ri.inv(y[j]); return y.map((c) => Ri.key(Ri.mul(c, inv))).join('|'); };
    const p = Number(pr.p), f = pr.f;
    let pik = R2.one; for (let t = 0; t < lev; t++) pik = R2.mul(pik, R2.fromK(spec.pi));
    const divPi = new Map();
    for (let a = 0; a < Number(R1.size); a++) divPi.set(R2.key(R2.mul(pik, R2.fromK(Ok.fromCoords(R1.vec(a))))), a);
    const piv = R1.L.PM.map((row) => row[row.findIndex((v) => v !== 0n)]);
    const cols = piv.map((v, i) => (v === pr.p ? i : -1)).filter((i) => i >= 0);
    const fp = (a) => cols.map((i) => Number(X.bmod(R1.vec(a)[i], pr.p)));
    const basis = [];
    const addVec = (v) => {
        v = v.slice();
        for (const b of basis) { const t = v[b.piv]; if (t) { let inv = 1; while ((inv * b.v[b.piv]) % p !== 1) inv++; const c = (t * inv) % p; for (let i = 0; i < v.length; i++) v[i] = ((v[i] - c * b.v[i]) % p + p) % p; } }
        const pv = v.findIndex((x) => x !== 0);
        if (pv >= 0) basis.push({ v, piv: pv });
    };
    const one1 = alg(R1).one;
    for (let a = 0; a < Number(R1.size); a++) addVec(one1.flatMap((o) => fp(R1.mul(a, o)))); // scalars
    const classOf = (z) => { // z ≡ scalar mod 𝔭^i
        const iu = z.findIndex((c) => R2.isUnit(c));
        const zz = A2.scale(z, R2.mul(R2.inv(z[iu]), A2.one[iu]));
        const parts = zz.map((c, i) => divPi.get(R2.key(R2.sub(c, A2.one[i]))));
        return parts.some((c) => c === undefined) ? null : parts.flatMap(fp);
    };
    const inv2 = (x) => A2.scale(A2.conj(x), R2.inv(A2.nrd(x)));
    const seen = new Map([[keyOf(A2.one), A2.one]]);
    const queue = [A2.one];
    let square = 1;
    while (queue.length) {
        const x = queue.pop();
        for (const g of gens) {
            const y = A2.mul(x, g), k = keyOf(y);
            const old = seen.get(k);
            if (old) { if (basis.length < 4 * f) { const c = classOf(A2.mul(y, inv2(old))); if (c) addVec(c); } continue; }
            seen.set(k, y); queue.push(y);
            if (Ri.isSquare(Ai.nrd(y.map(toI)))) square++;
            if (seen.size > cap) return null;
        }
    }
    return { rank: basis.length - f, full: basis.length === 4 * f, size: seen.size, square };
}

/** Local closure at 𝔭 ∉ S: index of its PSL-part in P_𝔭 and the level at which it is a congruence subgroup. */
function localClosure(ctx, pr, ramifiedA) {
    const p = pr.p, e = pr.e, q = p ** BigInt(pr.f);
    const out = { p: `${p}`, q: `${q}`, e, f: pr.f, ramifiedA };
    out.cosmetic = !!(ctx.defects && ctx.defects.has(`${p}`));
    const spec = localSpec(ctx, pr, ramifiedA);
    if (!spec) { out.status = 'unknown'; out.note = 'could not compute the order generated by Γ at 𝔭'; return out; }
    out.inverts = spec.inverts;
    if (spec.deficient) {
        out.status = 'deficient';
        out.note = ramifiedA ? 'Γ generates a non-maximal order of the division algebra at 𝔭' : 'Γ preserves more than one vertex of the tree (it generates a non-maximal order), so its closure lies in an Iwahori-type subgroup';
        if (!ramifiedA) out.indexAtLeast = `${q + 1n}`;
        return out;
    }
    if (spec.enlarged) out.enlarged = spec.enlarged;
    if (ramifiedA) { out.cosmetic = false; out.inverts = false; }
    if (spec.lattice) {
        const L = spec.lattice, Rk = kRing(ctx.kAlg);
        const fmt = (x) => ctx.fmt(x);
        out.vertexTex = `\\left\\langle \\binom{${fmt(L.u0)}}{${fmt(L.x)}},\\ \\binom{0}{${fmt(ctx.kAlg.pow(spec.pi, L.b))}} \\right\\rangle`;
        void Rk;
    }
    // Dickson + Serre: full at every level
    let fullMod1 = false;
    if (!ramifiedA && q >= 7n && q !== 9n) {
        const dk = dicksonFull(spec, ctx.Ok, pr);
        out.mod1 = dk;
        fullMod1 = dk.full;
        if (dk.full && p >= 5n && e === 1) { out.status = 'full'; out.index = '1'; out.level = 0; out.how = 'dickson'; return out; }
    }
    // exact kernels (Schreier): full projective kernels at levels i0 … i0+e−1, with i0 > e/(p−1), propagate to every
    // deeper level by p-th powers (for p odd and split 𝔭 the bracket already propagates from level 1)
    {
        const i0 = !ramifiedA && p !== 2n ? 1 : Math.floor(e / Number(p - 1n)) + 1;
        const lastLevel = !ramifiedA && p !== 2n ? 1 : i0 + e - 1;
        const kernels = [];
        for (let lv = i0; lv <= lastLevel; lv++) { const sk = schreierKernel(spec, ctx.Ok, pr, lv, 250000); if (!sk) break; kernels.push(sk); }
        if (kernels.length === lastLevel - i0 + 1 && kernels.every((sk) => sk.full)) {
            const img = i0 === 1 ? imageMod(spec, ctx.Ok, pr, 1, 250000) : null;
            const sizeAt = i0 === 1 ? img : kernels[0];
            if (sizeAt) {
                const Gm = ramifiedA ? q ** BigInt(3 * i0 - 1) * (q + 1n) : q ** BigInt(3 * i0 - 2) * (q * q - 1n);
                const Pm = Gm / residueRing(ctx.Ok, pr, i0).squareClasses;
                const index = Pm / BigInt(sizeAt.square);
                out.index = `${index}`; out.status = index === 1n ? 'full' : 'deficient'; out.how = 'kernel';
                out.levels = [{ m: i0, image: `${sizeAt.square}`, full: `${Pm}` }];
                if (index === 1n) out.level = 0;
                else if (i0 === 1) out.level = 1;
                else { // find the least level with the final index, from the images below i0
                    let lvl = i0;
                    for (let m = 1; m < i0; m++) { const im = imageMod(spec, ctx.Ok, pr, m, 250000); if (!im) break; const Pmm = (ramifiedA ? q ** BigInt(3 * m - 1) * (q + 1n) : q ** BigInt(3 * m - 2) * (q * q - 1n)) / residueRing(ctx.Ok, pr, m).squareClasses; if (Pmm / BigInt(im.square) === index) { lvl = m; break; } }
                    out.level = lvl;
                }
                return out;
            }
        }
    }
    // p odd, split: if the level-1 kernel is full, everything is decided mod 𝔭
    if (!ramifiedA && p !== 2n && level1KernelFull(spec, ctx.Ok, pr)) {
        let index = 1n;
        if (!fullMod1) {
            const img = imageMod(spec, ctx.Ok, pr, 1, 250000);
            if (img) { const P1 = q * (q * q - 1n) / img.R.squareClasses; index = P1 / BigInt(img.square); out.levels = [{ m: 1, image: `${img.square}`, full: `${P1}` }]; }
            else index = null;
        }
        if (index !== null) {
            out.index = `${index}`; out.status = index === 1n ? 'full' : 'deficient'; out.level = index === 1n ? 0 : 1; out.how = 'kernel';
            return out;
        }
    }
    // explicit images mod 𝔭^m; certified once e consecutive levels m > e/(p−1) have full kernels
    // certified at level m once the kernels from m to m+e are full, m > e/(p−1), and (p = 2) unit square classes have
    // stabilised (level ≥ 2e+1): then p-th powers give all deeper levels
    const m0 = Math.max(Math.floor(e / Number(p - 1n)) + 1, p === 2n ? 2 * e + 1 : 1);
    const Psize = (m) => (ramifiedA ? q ** BigInt(3 * m - 1) * (q + 1n) : q ** BigInt(3 * m - 2) * (q * q - 1n)) / residueRing(ctx.Ok, pr, m).squareClasses;
    const pDim = (m) => { let r = Psize(m + 1) / Psize(m), k = 0; while (r > 1n) { r /= p; k++; } return k; };
    const sizes = [];
    const cap = 250000;
    const fullStep = (m) => sizes[m].H1 * sizes[m - 1].P === sizes[m - 1].H1 * sizes[m].P; // level m → m+1
    let certAt = null;
    for (let m = 1; m <= 14 && certAt === null; m++) {
        const Gm = ramifiedA ? q ** BigInt(3 * m - 1) * (q + 1n) : q ** BigInt(3 * m - 2) * (q * q - 1n);
        // when everything so far is full, the next image is about as big as the whole group: skip if hopeless
        if (sizes.length && sizes.every((sz) => sz.H1 === sz.P) && Gm / 8n > BigInt(cap)) break;
        const img = imageMod(spec, ctx.Ok, pr, m, cap);
        if (!img) break;
        sizes.push({ m, H: BigInt(img.size), H1: BigInt(img.square), P: Gm / img.R.squareClasses });
        const c = m - e; // candidate certification level
        if (c >= m0 && Array.from({ length: e }, (_, i) => c + i).every(fullStep)) certAt = c;
    }
    out.levels = sizes.map((s) => ({ m: s.m, image: `${s.H1}`, full: `${s.P}` }));
    if (!sizes.length) { out.status = 'unknown'; out.note = 'the image mod 𝔭 is too large to enumerate'; return out; }
    // sampling instead of enumeration: if the kernels at every level from M up to m0+e−1 are full, the index is the one at M
    if (certAt === null && sizes.length) {
        const M = sizes.length;
        const lv = [];
        for (let i = M; i < m0 + e; i++) lv.push(i);
        if (lv.every((i) => levelKernelFull(spec, ctx.Ok, pr, i, pDim(i)))) { certAt = M; out.how = 'kernel'; }
    }
    const certified = certAt !== null;
    const at = sizes[(certified ? certAt : sizes.length) - 1];
    const index = at.P / at.H1;
    if (certified) {
        out.index = `${index}`;
        out.status = index === 1n ? 'full' : 'deficient';
        // the level: the least m with index_m equal to the final index (index_0 = 1)
        let level = 0;
        if (index !== 1n) { level = sizes.findIndex((s) => s.P / s.H1 === index) + 1; }
        out.level = level;
    } else {
        const last = sizes[sizes.length - 1];
        if (last.P / last.H1 === 1n) { out.status = 'full-partial'; out.fullThrough = last.m; out.note = `full modulo 𝔭^${last.m}; deeper levels are too large to enumerate`; }
        else { out.status = 'deficient'; out.indexAtLeast = `${last.P / last.H1}`; out.note = 'deeper levels are too large to enumerate'; }
    }
    return out;
}

const api = { analyze, parseGenerators, FieldBuilder, _internal: { elementOrder, classify, M2, isolateRealRoots, signAtRoot, localSpec, level1KernelFull, levelKernelFull, schreierKernel, residueRing, imageMod, algebraOps, debug: {} } };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PGL2Engine = api;
})(typeof self !== 'undefined' ? self : this);
