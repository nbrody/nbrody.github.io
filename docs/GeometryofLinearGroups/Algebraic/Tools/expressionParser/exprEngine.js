/**
 * exprEngine.js — read a formula (LaTeX from MathQuill, or plain text) and evaluate it.
 *
 *  • Numerically, in complex floating point (principal branches throughout).
 *  • Exactly, whenever the value lies in Q̄(π, e, x_1, …): radicals, roots of unity, i, conjugation,
 *    |·|, Re, Im, trigonometric values at rational multiples of π, e^{iπr}, and logarithms or inverse
 *    trigonometric values that turn out to be rational (multiples of π) are all reduced to arithmetic in
 *    a number field K built by ../zariskiClosure/pgl2Engine.js (FieldBuilder). π, e and free variables
 *    are formal indeterminates; since π and e are each transcendental, a nonconstant rational function
 *    in one of them is transcendental. Algebraic results get their minimal polynomial, field data and a
 *    closed form; polynomials in free variables are expanded (and factored over Q when univariate).
 *
 * Depends on ../numberRings/ringEngine.js and ../zariskiClosure/pgl2Engine.js.
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const NR = isNode ? require('../numberRings/ringEngine.js') : root.NumberRingEngine;
const PG = isNode ? require('../zariskiClosure/pgl2Engine.js') : root.PGL2Engine;
const X = NR._internal, PX = PG._internal;
const { Rat, R0, R1 } = X;
const Rint = (n) => new Rat(BigInt(n));
const MAX_DEGREE = 48;      // largest tensor dimension FieldBuilder may build
const MAX_TERMS = 4000;     // largest polynomial we expand

// ─────────────────────── tokenizer (LaTeX or plain text) ───────────────────────

const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
    'exp', 'ln', 'log', 'sqrt', 'cbrt', 'root', 'abs', 're', 'im', 'arg', 'conj', 'gcd', 'lcm', 'binom']);
const ALIASES = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', Re: 're', Im: 'im', operatorname: null };
const WORDS = ['arcsin', 'arccos', 'arctan', 'binom', 'omega', 'sqrt', 'cbrt', 'root', 'sinh', 'cosh', 'tanh', 'asin', 'acos',
    'atan', 'zeta', 'conj', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'exp', 'abs', 'arg', 'gcd', 'lcm', 'log', 'pi', 'ln', 'Re', 'Im'];
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'rho', 'varrho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega']);
const UNI_GREEK = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'η': 'eta', 'θ': 'theta', 'κ': 'kappa',
    'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'φ': 'phi', 'χ': 'chi', 'ψ': 'psi' };
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const SKIP_CMDS = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle', 'thinspace', 'medspace', 'thickspace', 'limits']);
const SIZE_CMDS = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr']);

function tokenize(src) {
    const s = String(src).replace(/[−–]/g, '-').replace(/[·×∙⋅]/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^');
    const toks = [];
    let i = 0;
    const push = (t, extra) => toks.push(Object.assign({ t }, extra));
    const word = (w) => {
        const f = ALIASES[w] !== undefined ? ALIASES[w] : w;
        if (FUNCS.has(f)) return push('fn', { f });
        if (w === 'pi') return push('pi');
        if (w === 'zeta') return push('zeta');
        if (w === 'omega') return push('omega');
        return false;
    };
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9.]/.test(c)) {
            let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
            const txt = s.slice(i, j);
            if (!/^\d+(\.\d*)?$|^\.\d+$/.test(txt)) throw new Error(`can't read the number "${txt}"`);
            const [ip, fp = ''] = txt.split('.');
            push('num', { v: new Rat(BigInt((ip || '0') + fp), 10n ** BigInt(fp.length)) });
            i = j; continue;
        }
        if (c === '\\') {
            let j = i + 1;
            if (/[A-Za-z]/.test(s[j] || '')) { while (j < s.length && /[A-Za-z]/.test(s[j])) j++; } else j++;
            const cmd = s.slice(i + 1, j);
            i = j;
            if (SKIP_CMDS.has(cmd)) continue;
            if (SIZE_CMDS.has(cmd)) {
                const side = /l$|^left$/.test(cmd) ? 'L' : /r$|^right$/.test(cmd) ? 'R' : null;
                while (/\s/.test(s[i] || '')) i++;
                if (s[i] === '.') { i++; continue; }
                if (s[i] === '|') { push('|', { side }); i++; continue; }
                if (s.startsWith('\\{', i)) { push(side === 'R' ? ')' : '('); i += 2; continue; }
                if (s.startsWith('\\}', i)) { push(')'); i += 2; continue; }
                const m = /^\\(lvert|rvert|vert)/.exec(s.slice(i));
                if (m) { push('|', { side }); i += m[0].length; continue; }
                continue; // the delimiter itself is read next
            }
            if (cmd === '{') { push('('); continue; }
            if (cmd === '}') { push(')'); continue; }
            if (cmd === '|' || cmd === 'vert' || cmd === 'mid') { push('|', { side: null }); continue; }
            if (cmd === 'lvert') { push('|', { side: 'L' }); continue; }
            if (cmd === 'rvert') { push('|', { side: 'R' }); continue; }
            if (cmd === 'cdot' || cmd === 'times' || cmd === 'ast') { push('op', { v: '*' }); continue; }
            if (cmd === 'div') { push('op', { v: '/' }); continue; }
            if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') { push('frac'); continue; }
            if (cmd === 'binom' || cmd === 'dbinom' || cmd === 'tbinom') { push('binom'); continue; }
            if (cmd === 'sqrt') { push('sqrt'); continue; }
            if (cmd === 'overline' || cmd === 'bar') { push('overline'); continue; }
            if (cmd === 'infty') throw new Error('∞ is not a number');
            if (cmd === 'operatorname' || cmd === 'mathrm' || cmd === 'text' || cmd === 'mathit' || cmd === 'rm' || cmd === 'textrm') {
                while (/\s/.test(s[i] || '')) i++;
                let w;
                if (s[i] === '{') { const k = s.indexOf('}', i); if (k < 0) throw new Error(`missing "}" after \\${cmd}`); w = s.slice(i + 1, k).trim(); i = k + 1; }
                else { w = s[i] || ''; i++; }
                if (w === 'i' || w === 'e') { push('letter', { c: w, tex: w }); continue; }
                if (word(w) !== false) continue;
                if (/^[A-Za-z]$/.test(w)) { push('letter', { c: w, tex: w }); continue; }
                throw new Error(`unknown function "${w}"`);
            }
            if (GREEK.has(cmd)) { push('letter', { c: `\\${cmd}`, tex: `\\${cmd}` }); continue; }
            if (word(cmd) !== false) continue;
            if (cmd === 'Re' || cmd === 'Im') { push('fn', { f: cmd.toLowerCase() }); continue; }
            throw new Error(`unknown command \\${cmd}`);
        }
        if (c === '√') { push('sqrt'); i++; continue; }
        if (c === '∛') { push('sqrt', { idx: 3 }); i++; continue; }
        if (c === '∜') { push('sqrt', { idx: 4 }); i++; continue; }
        if (c === 'π') { push('pi'); i++; continue; }
        if (c === 'ω') { push('omega'); i++; continue; }
        if (c === 'ζ') { push('zeta'); i++; continue; }
        if (UNI_GREEK[c]) { push('letter', { c: `\\${UNI_GREEK[c]}`, tex: `\\${UNI_GREEK[c]}` }); i++; continue; }
        if (SUPER[c]) {
            let j = i, t = '';
            while (j < s.length && SUPER[s[j]]) { t += SUPER[s[j]]; j++; }
            push('op', { v: '^' }); push('{');
            if (t[0] === '-') { push('op', { v: '-' }); t = t.slice(1); }
            if (!t) throw new Error('a superscript minus needs a number after it');
            push('num', { v: new Rat(BigInt(t)) }); push('}');
            i = j; continue;
        }
        if (/[A-Za-z]/.test(c)) {
            let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
            const run = s.slice(i, j);
            let k = 0;
            while (k < run.length) { // split the run into known words and single letters
                const w = WORDS.find((x) => run.startsWith(x, k));
                if (w) { word(w); k += w.length; } else { push('letter', { c: run[k], tex: run[k] }); k++; }
            }
            i = j; continue;
        }
        if ('+-*/^_!,'.includes(c)) { push('op', { v: c }); i++; continue; }
        if ('()[]{}'.includes(c)) { push(c); i++; continue; }
        if (c === '|') { push('|', { side: null }); i++; continue; }
        if (c === "'") throw new Error('primes (′) are not supported');
        throw new Error(`unexpected character "${c}"`);
    }
    return toks;
}

// ─────────────────────── parser → AST ───────────────────────
// num {v} · i · const {c: 'pi'|'e'} · zeta {n} · var {name, tex} · neg · add/sub/mul/div {a, b} · pow {a, e}
// call {f, args, index?, base?}

const describe = (tk) => !tk ? 'end of input' : tk.t === 'op' ? `"${tk.v}"` : tk.t === 'num' ? 'a number' : tk.t === 'letter' ? `"${tk.tex}"` : tk.t === 'fn' ? `"${tk.f}"` : `"${tk.t}"`;

function parse(src) {
    const toks = tokenize(src);
    if (!toks.length) return null;
    let i = 0, absDepth = 0;
    const peek = () => toks[i];
    const at = (t) => toks[i] && toks[i].t === t;
    const atOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const eat = (t) => (at(t) ? (i++, true) : false);
    const eatOp = (v) => (atOp(v) ? (i++, true) : false);
    const expect = (t, what) => { if (!eat(t)) throw new Error(`expected ${what} but found ${describe(peek())}`); };
    const bin = (t, a, b) => ({ t, a, b });

    function expr() {
        let a = term();
        for (;;) {
            if (eatOp('+')) a = bin('add', a, term());
            else if (eatOp('-')) a = bin('sub', a, term());
            else return a;
        }
    }
    function startsFactor() {
        const tk = peek();
        if (!tk) return false;
        if (['num', 'letter', 'pi', 'zeta', 'omega', 'fn', 'frac', 'sqrt', 'binom', 'overline', '(', '[', '{'].includes(tk.t)) return true;
        if (tk.t === '|') return tk.side === 'L' || (tk.side === null && absDepth === 0);
        return false;
    }
    function term() {
        let a = unary();
        for (;;) {
            if (eatOp('*')) a = bin('mul', a, unary());
            else if (eatOp('/')) a = bin('div', a, unary());
            else if (startsFactor()) a = bin('mul', a, power());
            else return a;
        }
    }
    function unary() {
        if (eatOp('-')) return { t: 'neg', a: unary() };
        if (eatOp('+')) return unary();
        return power();
    }
    function power() {
        const b = postfix();
        return eatOp('^') ? { t: 'pow', a: b, e: exponent() } : b;
    }
    function exponent() {
        if (eatOp('-')) return { t: 'neg', a: exponent() };
        if (eatOp('+')) return exponent();
        return power();
    }
    function postfix() {
        let a = primary();
        while (eatOp('!')) a = { t: 'call', f: 'fact', args: [a] };
        return a;
    }
    function group(what) { // {…}, (…), or a single primary
        if (eat('{')) { const e = expr(); expect('}', '"}"'); return e; }
        if (!peek()) throw new Error(`${what} is missing`);
        return postfix();
    }
    let subPow = null; // a power typed inside a subscript, as MathQuill does with \zeta_{5^4}
    function subscript() { // text of a subscript: x_1, x_{12}, a_n
        let txt = '';
        subPow = null;
        const piece = (tk) => {
            if (tk.t === 'num') { if (!tk.v.isInt()) throw new Error('subscripts must be whole numbers or letters'); return `${tk.v.n}`; }
            if (tk.t === 'letter') return tk.c;
            throw new Error(`can't use ${describe(tk)} in a subscript`);
        };
        if (eat('{')) {
            while (!at('}')) {
                if (!peek()) throw new Error('missing "}" in a subscript');
                if (txt && eatOp('^')) { subPow = expr(); break; }
                txt += piece(toks[i++]);
            }
            expect('}', '"}"');
        } else {
            if (!peek()) throw new Error('a subscript is missing');
            txt = piece(toks[i++]);
        }
        if (!txt) throw new Error('empty subscript');
        return txt;
    }
    const withSubPow = (node) => { const p = subPow; subPow = null; return p ? { t: 'pow', a: node, e: p } : node; };
    function args() { // ( a, b, … )
        const open = peek().t, close = open === '(' ? ')' : open === '[' ? ']' : '}';
        i++;
        const list = [expr()];
        while (eatOp(',')) list.push(expr());
        expect(close, `"${close}"`);
        return list;
    }
    function primary() {
        const tk = toks[i++];
        if (!tk) throw new Error('the expression ends too early');
        switch (tk.t) {
            case 'num': return { t: 'num', v: tk.v };
            case '(': { const e = expr(); expect(')', '")"'); return Object.assign({}, e, { paren: true }); }
            case '[': { const e = expr(); expect(']', '"]"'); return e; }
            case '{': { const e = expr(); expect('}', '"}"'); return e; }
            case '|': {
                if (tk.side === 'R') throw new Error('unexpected "|"');
                absDepth++;
                const e = expr();
                absDepth--;
                if (!at('|') || peek().side === 'L') throw new Error('missing closing "|"');
                i++;
                return { t: 'call', f: 'abs', args: [e] };
            }
            case 'pi': return { t: 'const', c: 'pi' };
            case 'omega': return { t: 'zeta', n: 3 };
            case 'zeta': {
                if (!eatOp('_')) throw new Error('write ζ with an index, e.g. ζ_5');
                const txt = subscript();
                if (!/^\d+$/.test(txt)) throw new Error('the index of ζ_n must be a whole number');
                const n = parseInt(txt, 10);
                if (n < 1 || n > 1000) throw new Error('ζ_n needs 1 ≤ n ≤ 1000');
                return withSubPow({ t: 'zeta', n });
            }
            case 'letter': {
                if (tk.c === 'i') return { t: 'i' };
                if (tk.c === 'e') return { t: 'const', c: 'e' };
                if (eatOp('_')) {
                    const sub = subscript();
                    return withSubPow({ t: 'var', name: `${tk.c}_${sub}`, tex: `${tk.tex}_{${sub}}` });
                }
                return { t: 'var', name: tk.c, tex: tk.tex };
            }
            case 'frac': { const a = group('a numerator'); const b = group('a denominator'); return bin('div', a, b); }
            case 'binom': {
                if (at('(')) { const l = args(); if (l.length !== 2) throw new Error('binom takes two arguments'); return { t: 'call', f: 'binom', args: l }; }
                const a = group('the top of a binomial'); const b = group('the bottom of a binomial');
                return { t: 'call', f: 'binom', args: [a, b] };
            }
            case 'overline': return { t: 'call', f: 'conj', args: [group('the argument of a bar')] };
            case 'sqrt': {
                let index = tk.idx ? { t: 'num', v: Rint(tk.idx) } : null;
                if (!index && eat('[')) { index = expr(); expect(']', '"]"'); }
                let rad;
                if (atOp('-')) { i++; rad = { t: 'neg', a: postfix() }; } else rad = group('a radicand');
                return index ? { t: 'call', f: 'root', args: [rad], index } : { t: 'call', f: 'sqrt', args: [rad] };
            }
            case 'fn': return application(tk.f);
        }
        throw new Error(`unexpected ${describe(tk)}`);
    }
    function application(f) {
        let base = null, pw = null;
        if (f === 'log' && eatOp('_')) base = group('the base of the logarithm');
        if (eatOp('^')) pw = exponent();
        let list;
        if (at('(') || at('[')) list = args();
        else if (!startsFactor() && (pw || base)) {
            // MathQuill keeps typing inside \sin^{…} or \log_{…}: \sin^{2\left(x\right)} means \sin^2(x)
            const src = pw || base;
            if (!(src.t === 'mul' && src.b.paren)) throw new Error(`${f} needs an argument`);
            list = [src.b];
            if (pw) pw = src.a; else base = src.a;
        } else {
            if (!startsFactor()) throw new Error(`${f} needs an argument`);
            let a = power(); // \sin 2x = sin(2x); stop at the next function
            while (startsFactor() && !at('fn')) a = bin('mul', a, power());
            list = [a];
        }
        const arity = { root: [2, 2], gcd: [2, 20], lcm: [2, 20], binom: [2, 2], log: [1, 2] }[f] || [1, 1];
        if (list.length < arity[0] || list.length > arity[1]) throw new Error(`${f} takes ${arity[0] === arity[1] ? arity[0] : `${arity[0]}–${arity[1]}`} argument${arity[1] > 1 ? 's' : ''}`);
        let node;
        if (f === 'root') node = { t: 'call', f: 'root', args: [list[0]], index: list[1] };
        else if (f === 'cbrt') node = { t: 'call', f: 'root', args: list, index: { t: 'num', v: Rint(3) } };
        else if (f === 'log' && list.length === 2) node = { t: 'call', f: 'log', args: [list[0]], base: list[1] };
        else node = { t: 'call', f, args: list, base };
        if (pw) {
            const inverse = { sin: 'arcsin', cos: 'arccos', tan: 'arctan' }[f];
            if (inverse && pw.t === 'neg' && pw.a.t === 'num' && pw.a.v.eq(R1)) return { t: 'call', f: inverse, args: list };
            return { t: 'pow', a: node, e: pw };
        }
        return node;
    }

    const ast = expr();
    if (i < toks.length) throw new Error(`unexpected ${describe(peek())}`);
    return ast;
}

/** A variable name such as x, x_1, \alpha, t_{n}. */
function parseName(src) {
    const a = parse(src);
    if (!a) return null;
    if (a.t !== 'var') {
        if (a.t === 'i' || (a.t === 'const')) throw new Error(`${a.t === 'i' ? 'i' : a.c === 'pi' ? 'π' : 'e'} is reserved`);
        throw new Error('a name is a letter, optionally with a subscript');
    }
    return a;
}

// ─────────────────────── AST → TeX ───────────────────────

const FN_TEX = { sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', arcsin: '\\arcsin',
    arccos: '\\arccos', arctan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', exp: '\\exp', ln: '\\ln', log: '\\log',
    arg: '\\arg', gcd: '\\gcd', lcm: '\\operatorname{lcm}', re: '\\operatorname{Re}', im: '\\operatorname{Im}' };
const fracTex = (r) => (r.isInt() ? `${r.n}` : `${r.n < 0n ? '-' : ''}\\frac{${r.n < 0n ? -r.n : r.n}}{${r.d}}`);

function texOf(a, prec = 0) {
    const wrap = (s, cond) => (cond ? `\\left(${s}\\right)` : s);
    switch (a.t) {
        case 'num': return wrap(fracTex(a.v), (a.v.n < 0n && prec > 1) || (!a.v.isInt() && prec > 3));
        case 'i': return 'i';
        case 'const': return a.c === 'pi' ? '\\pi' : 'e';
        case 'zeta': return a.n === 3 ? '\\omega' : `\\zeta_{${a.n}}`;
        case 'var': return a.tex;
        case 'atom': return a.tex;
        case 'neg': return wrap(`-${texOf(a.a, 2)}`, prec > 1);
        case 'add': return wrap(`${texOf(a.a, 1)} + ${texOf(a.b, 1)}`, prec > 1);
        case 'sub': return wrap(`${texOf(a.a, 1)} - ${texOf(a.b, 2)}`, prec > 1);
        case 'mul': {
            const right = texOf(a.b, 2);
            const dot = /^[0-9-]/.test(right) || (a.b.t === 'pow' && a.b.a.t === 'num') || (a.a.t === 'div' && a.b.t === 'div');
            return wrap(`${texOf(a.a, 2)}${dot ? ' \\cdot ' : ' '}${right}`, prec > 2);
        }
        case 'div': return wrap(`\\frac{${texOf(a.a)}}{${texOf(a.b)}}`, prec > 3);
        case 'pow': {
            if (a.a.t === 'const' && a.a.c === 'e') return `e^{${texOf(a.e)}}`;
            if (a.a.t === 'call' && FN_TEX[a.a.f] && !a.a.base) return wrap(`${FN_TEX[a.a.f]}^{${texOf(a.e)}}\\left(${a.a.args.map((y) => texOf(y)).join(', ')}\\right)`, prec > 3);
            return `{${texOf(a.a, 4)}}^{${texOf(a.e)}}`;
        }
        case 'call': {
            const x = a.args.map((y) => texOf(y));
            switch (a.f) {
                case 'sqrt': return `\\sqrt{${x[0]}}`;
                case 'root': return `\\sqrt[${texOf(a.index)}]{${x[0]}}`;
                case 'abs': return `\\left|${x[0]}\\right|`;
                case 'conj': return `\\overline{${x[0]}}`;
                case 'fact': return `${texOf(a.args[0], 4)}!`;
                case 'binom': return `\\binom{${x[0]}}{${x[1]}}`;
                case 'exp': return `e^{${x[0]}}`;
                case 'log': if (a.base) return wrap(`\\log_{${texOf(a.base)}}\\left(${x[0]}\\right)`, prec > 3); break;
            }
            return wrap(`${FN_TEX[a.f] || `\\operatorname{${a.f}}`}\\left(${x.join(', ')}\\right)`, prec > 3);
        }
    }
    return '?';
}

// ─────────────────────── variables ───────────────────────

function freeVars(a, out = new Map()) {
    if (!a) return out;
    if (a.t === 'var' && !out.has(a.name)) out.set(a.name, a.tex);
    for (const k of ['a', 'b', 'e', 'index', 'base']) if (a[k]) freeVars(a[k], out);
    if (a.args) a.args.forEach((y) => freeVars(y, out));
    return out;
}
function substitute(a, defs, stack = []) {
    if (!a) return a;
    if (a.t === 'var' && defs.has(a.name)) {
        if (stack.includes(a.name)) throw new Error(`the definition of ${a.name} refers to itself`);
        return substitute(defs.get(a.name), defs, stack.concat([a.name]));
    }
    const out = Object.assign({}, a);
    for (const k of ['a', 'b', 'e', 'index', 'base']) if (a[k]) out[k] = substitute(a[k], defs, stack);
    if (a.args) out.args = a.args.map((y) => substitute(y, defs, stack));
    return out;
}

// ─────────────────────── complex floating point ───────────────────────

const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const csub = (a, b) => C(a.re - b.re, a.im - b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cabs = (a) => Math.hypot(a.re, a.im);
function cdiv(a, b) {
    const q = b.re * b.re + b.im * b.im;
    if (q === 0) throw new Error('division by zero');
    return C((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q);
}
const cexp = (a) => { const r = Math.exp(a.re); return C(r * Math.cos(a.im), r * Math.sin(a.im)); };
function clog(a) { if (a.re === 0 && a.im === 0) throw new Error('log of zero'); return C(Math.log(cabs(a)), Math.atan2(a.im === 0 ? 0 : a.im, a.re)); }
const isRealish = (a) => Math.abs(a.im) <= 1e-14 * Math.max(1, Math.abs(a.re));
function cpowInt(a, k) {
    let r = C(1), b = a, e = Math.abs(k);
    while (e > 0) { if (e & 1) r = cmul(r, b); b = cmul(b, b); e = Math.floor(e / 2); }
    return k < 0 ? cdiv(C(1), r) : r;
}
function cpow(a, w) {
    if (isRealish(w) && Number.isInteger(w.re) && Math.abs(w.re) <= 1e6) return cpowInt(a, w.re);
    if (a.re === 0 && a.im === 0) { if (w.re > 0) return C(0); throw new Error('0 to a non-positive power'); }
    return cexp(cmul(w, clog(a)));
}
const csqrt = (a) => PX.croot(a, 2);
const csin = (a) => C(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im));
const ccos = (a) => C(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im));
const csinh = (a) => C(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im));
const ccosh = (a) => C(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im));
const I = C(0, 1);
function casin(z) { // −i log(iz + √(1 − z²)), real for z ∈ [−1, 1]
    if (isRealish(z) && Math.abs(z.re) <= 1) return C(Math.asin(z.re));
    return cmul(C(0, -1), clog(cadd(cmul(I, z), csqrt(csub(C(1), cmul(z, z))))));
}
function cacos(z) { if (isRealish(z) && Math.abs(z.re) <= 1) return C(Math.acos(z.re)); return csub(C(Math.PI / 2), casin(z)); }
function catan(z) {
    if (isRealish(z)) return C(Math.atan(z.re));
    return cmul(C(0, 0.5), csub(clog(csub(C(1), cmul(I, z))), clog(cadd(C(1), cmul(I, z)))));
}
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function cgamma(z) {
    if (z.re < 0.5) return cdiv(C(Math.PI), cmul(csin(cmul(C(Math.PI), z)), cgamma(csub(C(1), z))));
    z = csub(z, C(1));
    let x = C(LANCZOS[0]);
    for (let k = 1; k < 9; k++) x = cadd(x, cdiv(C(LANCZOS[k]), cadd(z, C(k))));
    const t = cadd(z, C(7.5));
    return cmul(cmul(C(Math.sqrt(2 * Math.PI)), cpow(t, cadd(z, C(0.5)))), cmul(cexp(cmul(C(-1), t)), x));
}
const intOf = (z, what) => {
    if (!isRealish(z) || Math.abs(z.re - Math.round(z.re)) > 1e-9 * Math.max(1, Math.abs(z.re))) throw new Error(`${what} needs whole numbers`);
    return Math.round(z.re);
};
const igcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

function numeric(a) {
    switch (a.t) {
        case 'num': return C(ratToNum(a.v));
        case 'i': return I;
        case 'const': return C(a.c === 'pi' ? Math.PI : Math.E);
        case 'zeta': return C(Math.cos(2 * Math.PI / a.n), Math.sin(2 * Math.PI / a.n));
        case 'var': throw new Error(`${a.name} has no value`);
        case 'atom': return C(a.num.re, a.num.im);
        case 'neg': { const v = numeric(a.a); return C(-v.re, -v.im); }
        case 'add': return cadd(numeric(a.a), numeric(a.b));
        case 'sub': return csub(numeric(a.a), numeric(a.b));
        case 'mul': return cmul(numeric(a.a), numeric(a.b));
        case 'div': return cdiv(numeric(a.a), numeric(a.b));
        case 'pow': return a.a.t === 'const' && a.a.c === 'e' ? cexp(numeric(a.e)) : cpow(numeric(a.a), numeric(a.e));
        case 'call': {
            const x = a.args.map(numeric), z = x[0];
            switch (a.f) {
                case 'sqrt': return csqrt(z);
                case 'root': { const n = intOf(numeric(a.index), 'the index of a root'); if (n < 1) throw new Error('root index must be positive'); return PX.croot(z, n); }
                case 'abs': return C(cabs(z));
                case 'conj': return C(z.re, -z.im);
                case 're': return C(z.re);
                case 'im': return C(z.im);
                case 'arg': if (!z.re && !z.im) throw new Error('arg(0) is undefined'); return C(Math.atan2(z.im === 0 ? 0 : z.im, z.re));
                case 'exp': return cexp(z);
                case 'ln': return clog(z);
                case 'log': return a.base ? cdiv(clog(z), clog(numeric(a.base))) : clog(z);
                case 'sin': return csin(z);
                case 'cos': return ccos(z);
                case 'tan': return cdiv(csin(z), ccos(z));
                case 'sec': return cdiv(C(1), ccos(z));
                case 'csc': return cdiv(C(1), csin(z));
                case 'cot': return cdiv(ccos(z), csin(z));
                case 'sinh': return csinh(z);
                case 'cosh': return ccosh(z);
                case 'tanh': return cdiv(csinh(z), ccosh(z));
                case 'arcsin': return casin(z);
                case 'arccos': return cacos(z);
                case 'arctan': return catan(z);
                case 'fact': {
                    if (isRealish(z) && Number.isInteger(z.re)) {
                        if (z.re < 0) throw new Error('factorial of a negative integer');
                        let r = 1; for (let k = 2; k <= z.re && r < Infinity; k++) r *= k; return C(r);
                    }
                    return cgamma(cadd(z, C(1)));
                }
                case 'binom': {
                    const k = intOf(x[1], 'binom’s lower entry');
                    if (k < 0) return C(0);
                    let r = C(1);
                    for (let j = 0; j < k; j++) r = cdiv(cmul(r, csub(z, C(j))), C(j + 1));
                    return r;
                }
                case 'gcd': return C(x.map((y) => intOf(y, 'gcd')).reduce(igcd));
                case 'lcm': return C(x.map((y) => intOf(y, 'lcm')).reduce((p, q) => (p && q ? Math.abs(p / igcd(p, q) * q) : 0)));
            }
        }
    }
    throw new Error('internal: cannot evaluate');
}
function ratToNum(r) {
    let n = r.n, d = r.d;
    const shift = Math.max(0, Math.max(n.toString().length, d.toString().length) - 300);
    if (shift) { const s = 10n ** BigInt(shift); n /= s; d /= s; if (d === 0n) return n > 0n ? Infinity : -Infinity; }
    return Number(n) / Number(d);
}

// ─────────────────────── exact evaluation ───────────────────────

class NotExact extends Error {
    constructor(kind, message) { super(message); this.kind = kind; } // kind: transcendental | unsupported
}
const num = (v) => ({ t: 'num', v: v instanceof Rat ? v : Rint(v) });
const PI = { t: 'var', name: 'π', tex: '\\pi', special: 'pi' };
const E = { t: 'var', name: 'e', tex: 'e', special: 'e' };
const hasVar = (a) => a.t === 'var' || ['a', 'b'].some((k) => a[k] && hasVar(a[k]));

/** e^{iπr} for rational r, as ζ_n^k. */
function expIPi(r) {
    const n0 = 2n * r.d, k0 = r.n;
    const g = X.bgcd(k0 < 0n ? -k0 : k0, n0);
    const n = n0 / (g || 1n);
    let k = (k0 / (g || 1n)) % n; if (k < 0n) k += n;
    if (n === 1n) return num(1);
    if (n === 2n) return num(-1);
    if (n > 1000n) throw new NotExact('unsupported', 'that root of unity has too large an order');
    const z = { t: 'zeta', n: Number(n) };
    return k === 1n ? z : { t: 'pow', a: z, e: num(k) };
}
const cosPi = (r) => { const w = expIPi(r); return { t: 'div', a: { t: 'add', a: w, b: { t: 'pow', a: w, e: num(-1) } }, b: num(2) }; };
const sinPi = (r) => cosPi(new Rat(1n, 2n).sub(r));

function radical(L, n, principal) {
    if (hasVar(L)) throw new NotExact('unsupported', 'roots of non-constant expressions are not polynomials');
    if (n === 1) return L;
    if (n === 2) return { t: 'fn', f: 'sqrt', a: L };
    if (n === 3 && !principal) return { t: 'fn', f: 'cbrt', a: L };
    return { t: 'fn', f: 'root', r: n, principal: !!principal, a: L };
}
/** Complex conjugate, pushed through field operations; radicals become conjugation atoms. */
function conjNode(L) {
    switch (L.t) {
        case 'num': return L;
        case 'i': return { t: 'neg', a: L };
        case 'zeta': return { t: 'pow', a: L, e: num(-1) };
        case 'var':
            if (L.special) return L;
            throw new NotExact('unsupported', `the conjugate of ${L.name} depends on whether it is real`);
        case 'conj': return L.a;
        case 'neg': return { t: 'neg', a: conjNode(L.a) };
        case 'add': case 'sub': case 'mul': case 'div': return { t: L.t, a: conjNode(L.a), b: conjNode(L.b) };
        case 'pow': return { t: 'pow', a: conjNode(L.a), e: L.e };
    }
    return { t: 'conj', a: L };
}

/** "sin of x is not a rational function of x" when L involves free variables. */
function freeMsg(L, what) {
    const names = [];
    (function scan(a) { if (a.t === 'var' && !a.special && !names.includes(a.name)) names.push(a.name); for (const k of ['a', 'b']) if (a[k]) scan(a[k]); })(L);
    if (!names.length) return null;
    return `${what} of an expression in ${names.join(', ')} is not a rational function of ${names.length > 1 ? 'them' : names[0]}`;
}
/** Evaluate a lowered AST in K(π, e, free variables). */
function exactEval(L) {
    const vars = [];
    (function collect(a) {
        if (a.t === 'var') { if (!vars.some((v) => v.name === a.name)) vars.push({ name: a.name, tex: a.tex, special: a.special }); return; }
        for (const k of ['a', 'b']) if (a[k]) collect(a[k]);
    })(L);
    const rank = (v) => (v.special === 'pi' ? 1 : v.special === 'e' ? 2 : 0);
    vars.sort((u, v) => rank(u) - rank(v)); // free variables first (stable), then π, then e
    const Lz = unifyZetas(L);
    const F = new PG.FieldBuilder();
    F.maxDegree = MAX_DEGREE;
    F.ensureAtoms(Lz);
    const P = polyRing(F.alg, vars.length);
    const idx = new Map(vars.map((v, j) => [v.name, j]));
    const ev = (a) => {
        switch (a.t) {
            case 'num': return P.rf(P.constant(F.alg.fromRat(a.v)));
            case 'i': case 'zeta': case 'fn': case 'conj': {
                const at = F.atoms.get(PX.astKey(a));
                if (!at) throw new Error('internal: missing atom');
                return P.rf(P.constant(at.val));
            }
            case 'var': return P.rf(P.variable(idx.get(a.name)));
            case 'neg': return P.rfNeg(ev(a.a));
            case 'add': return P.rfAdd(ev(a.a), ev(a.b));
            case 'sub': return P.rfAdd(ev(a.a), P.rfNeg(ev(a.b)));
            case 'mul': return P.rfMul(ev(a.a), ev(a.b));
            case 'div': return P.rfDiv(ev(a.a), ev(a.b));
            case 'pow': return P.rfPow(ev(a.a), a.e.v.n);
        }
        throw new Error('internal: bad lowered expression');
    };
    return { F, vars, P, rf: ev(Lz) };
}

/** Rewrite every ζ_n (and i, if there are any ζ's) as a power of a single ζ_N, avoiding composita of cyclotomic fields. */
function unifyZetas(L) {
    const orders = new Set();
    let hasI = false;
    (function scan(a) { if (a.t === 'zeta') orders.add(a.n); if (a.t === 'i') hasI = true; for (const k of ['a', 'b']) if (a[k]) scan(a[k]); })(L);
    if (!orders.size || (orders.size === 1 && !hasI)) return L;
    let N = 1n;
    for (const n of orders) N = X.blcm(N, BigInt(n));
    if (hasI) N = X.blcm(N, 4n);
    if (N > 1000n || eulerPhi(Number(N)) > MAX_DEGREE) return L;
    const z = { t: 'zeta', n: Number(N) };
    const rw = (a) => {
        if (a.t === 'zeta') return a.n === Number(N) ? z : { t: 'pow', a: z, e: num(Number(N) / a.n) };
        if (a.t === 'i' && hasI) return { t: 'pow', a: z, e: num(Number(N) / 4) };
        const out = Object.assign({}, a);
        for (const k of ['a', 'b']) if (a[k]) out[k] = rw(a[k]);
        return out;
    };
    return rw(L);
}
function eulerPhi(n) { let r = n; for (let p = 2; p * p <= n; p++) if (n % p === 0) { while (n % p === 0) n /= p; r -= r / p; } if (n > 1) r -= r / n; return r; }

/** Multivariate polynomials over K (Map: exponent key → K element) and their quotients {n, d}. */
function polyRing(K, nv) {
    const zeroKey = new Array(nv).fill(0).join(',');
    const parse = (k) => (nv ? k.split(',').map(Number) : []);
    const key = (e) => e.join(',');
    const isZeroK = (c) => K.isZero(c);
    const constant = (c) => (isZeroK(c) ? new Map() : new Map([[zeroKey, c]]));
    const variable = (j) => { const e = new Array(nv).fill(0); e[j] = 1; return new Map([[key(e), K.one()]]); };
    const add = (p, q) => {
        const r = new Map(p);
        for (const [k, c] of q) { const s = r.has(k) ? K.add(r.get(k), c) : c; if (isZeroK(s)) r.delete(k); else r.set(k, s); }
        return r;
    };
    const neg = (p) => new Map([...p].map(([k, c]) => [k, K.neg(c)]));
    const scale = (p, c) => (isZeroK(c) ? new Map() : new Map([...p].map(([k, x]) => [k, K.mul(x, c)])));
    const mul = (p, q) => {
        if (p.size * q.size > 4 * MAX_TERMS * MAX_TERMS) throw new NotExact('unsupported', 'the expansion is too large');
        let r = new Map();
        for (const [k1, c1] of p) {
            const e1 = parse(k1);
            for (const [k2, c2] of q) {
                const e = parse(k2).map((x, j) => x + e1[j]), k = key(e);
                const s = r.has(k) ? K.add(r.get(k), K.mul(c1, c2)) : K.mul(c1, c2);
                if (isZeroK(s)) r.delete(k); else r.set(k, s);
            }
        }
        if (r.size > MAX_TERMS) throw new NotExact('unsupported', `the expansion has more than ${MAX_TERMS} terms`);
        return r;
    };
    const constOf = (p) => (p.size === 0 ? K.fromRat(R0) : p.size === 1 && p.has(zeroKey) ? p.get(zeroKey) : null);
    const cmpExp = (a, b) => { // graded lex, larger first
        const da = a.reduce((s, x) => s + x, 0), db = b.reduce((s, x) => s + x, 0);
        if (da !== db) return db - da;
        for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return b[j] - a[j];
        return 0;
    };
    const lead = (p) => { let best = null; for (const k of p.keys()) { const e = parse(k); if (!best || cmpExp(e, best) < 0) best = e; } return best; };
    const divExact = (p, q) => { // p / q if q divides p, else null
        const lq = lead(q), cq = K.inv(q.get(key(lq)));
        let r = p, quo = new Map(), steps = 0;
        while (r.size) {
            if (++steps > 2000) return null;
            const lr = lead(r);
            if (lr.some((x, j) => x < lq[j])) return null;
            const e = lr.map((x, j) => x - lq[j]);
            const t = new Map([[key(e), K.mul(r.get(key(lr)), cq)]]);
            quo = add(quo, t);
            r = add(r, neg(mul(t, q)));
        }
        return quo;
    };
    // univariate gcd (both in the single variable j) over K
    const usedVars = (p) => { const s = new Set(); for (const k of p.keys()) parse(k).forEach((x, j) => { if (x) s.add(j); }); return s; };
    const toU = (p, j) => { const a = []; for (const [k, c] of p) { const d = parse(k)[j]; while (a.length <= d) a.push(K.fromRat(R0)); a[d] = c; } return a; };
    const fromU = (a, j) => { const r = new Map(); a.forEach((c, d) => { if (!isZeroK(c)) { const e = new Array(nv).fill(0); e[j] = d; r.set(key(e), c); } }); return r; };
    const uTrim = (a) => { let k = a.length; while (k > 0 && isZeroK(a[k - 1])) k--; return a.slice(0, k); };
    const uMod = (a, b) => {
        a = a.slice(); const db = b.length - 1, inv = K.inv(b[db]);
        for (let d = a.length - 1; d >= db; d--) {
            if (isZeroK(a[d])) continue;
            const f = K.mul(a[d], inv);
            for (let t = 0; t <= db; t++) a[d - db + t] = K.sub(a[d - db + t], K.mul(f, b[t]));
        }
        return uTrim(a.slice(0, db));
    };
    const uGcd = (a, b) => { a = uTrim(a); b = uTrim(b); while (b.length) [a, b] = [b, uMod(a, b)]; return a; };
    const rf = (p) => ({ n: p, d: constant(K.one()) });
    const normalize = (x) => {
        const c = constOf(x.d);
        if (c) return { n: scale(x.n, K.inv(c)), d: constant(K.one()) };
        const q = divExact(x.n, x.d);
        if (q) return { n: q, d: constant(K.one()) };
        let { n, d } = x;
        const vs = new Set([...usedVars(n), ...usedVars(d)]);
        if (vs.size === 1) {
            const j = [...vs][0], g = uGcd(toU(n, j), toU(d, j));
            if (g.length > 1) { const G = fromU(g, j); n = divExact(n, G); d = divExact(d, G); }
        }
        const lc = d.get(key(lead(d)));
        return { n: scale(n, K.inv(lc)), d: scale(d, K.inv(lc)) };
    };
    const one = () => constant(K.one());
    const sameD = (x, y) => x.d.size === y.d.size && [...x.d].every(([k, c]) => y.d.has(k) && K.isZero(K.sub(c, y.d.get(k))));
    return {
        nv, constant, variable, constOf, lead, parse, rf, usedVars,
        rfNeg: (x) => ({ n: neg(x.n), d: x.d }),
        rfAdd: (x, y) => (sameD(x, y) ? normalize({ n: add(x.n, y.n), d: x.d }) : normalize({ n: add(mul(x.n, y.d), mul(y.n, x.d)), d: mul(x.d, y.d) })),
        rfMul: (x, y) => normalize({ n: mul(x.n, y.n), d: mul(x.d, y.d) }),
        rfDiv: (x, y) => { if (!y.n.size) throw new Error('division by zero'); return normalize({ n: mul(x.n, y.d), d: mul(x.d, y.n) }); },
        rfPow: (x, k) => {
            let e = k < 0n ? -k : k;
            if (k < 0n) { if (!x.n.size) throw new Error('division by zero'); x = { n: x.d, d: x.n }; }
            const nonConst = !constOf(x.n) || !constOf(x.d);
            if (nonConst && e > 400n) throw new NotExact('unsupported', 'that power is too large to expand');
            let r = { n: one(), d: one() }, b = x;
            while (e > 0n) { if (e & 1n) r = normalize({ n: mul(r.n, b.n), d: mul(r.d, b.d) }); e >>= 1n; if (e) b = normalize({ n: mul(b.n, b.n), d: mul(b.d, b.d) }); }
            return r;
        },
    };
}

// ── lowering: user AST → FieldBuilder AST with formal variables ──

/** The exact value of L if it is a constant in K: { F, v } or null. */
function constValue(L) {
    const { F, P, rf } = exactEval(L);
    if (P.constOf(rf.d) === null) return null;
    const c = P.constOf(rf.n);
    if (c === null) return null;
    return { F, v: K_div(F, c, P.constOf(rf.d)) };
}
const K_div = (F, a, b) => F.alg.mul(a, F.alg.inv(b));
const ratOfK = (v) => (v.slice(1).every((x) => x.isZero()) ? v[0] : null);
function tryConst(L) { try { return constValue(L); } catch (e) { if (e instanceof NotExact) return null; throw e; } }
function rationalValue(a) {
    let L;
    try { L = lower(a); } catch (e) { if (e instanceof NotExact) return null; throw e; }
    const cv = tryConst(L);
    return cv ? ratOfK(cv.v) : null;
}
function algebraicZero(L) { const cv = tryConst(L); return cv ? cv.F.alg.isZero(cv.v) : false; }

/** Write L = c0 + c1·π (c0, c1 ∈ K, no other variables); null otherwise. */
function piLinear(L) {
    const { F, vars, P, rf } = exactEval(L);
    const d = P.constOf(rf.d);
    if (d === null || vars.some((v) => v.special !== 'pi')) return null;
    const j = vars.findIndex((v) => v.special === 'pi');
    let c0 = F.alg.fromRat(R0), c1 = F.alg.fromRat(R0);
    for (const [k, c] of rf.n) {
        const e = P.parse(k), deg = j < 0 ? 0 : e[j];
        if (deg === 0) c0 = c; else if (deg === 1) c1 = c; else return null;
    }
    const inv = F.alg.inv(d);
    return { F, c0: F.alg.mul(c0, inv), c1: F.alg.mul(c1, inv) };
}
/** c = i·r with r rational? Returns r (sign from the embedding) or null. */
function imagRational(F, c) {
    if (F.alg.isZero(c)) return R0;
    const sq = ratOfK(F.alg.mul(c, c));
    if (!sq || sq.sign() >= 0) return null;
    const r2 = sq.neg(), rn = isqrt(r2.n), rd = isqrt(r2.d);
    if (rn * rn !== r2.n || rd * rd !== r2.d) return null;
    const r = new Rat(rn, rd);
    return F.numeric(c).im >= 0 ? r : r.neg();
}
function isqrt(n) { if (n < 2n) return n; let x = BigInt(Math.floor(Math.sqrt(Number(n)))); while (x * x > n) x--; while ((x + 1n) * (x + 1n) <= n) x++; return x; }

/** Best rational approximation p/q of x with q ≤ qmax (continued fractions). */
function guessRational(x, qmax = 1000) {
    if (!isFinite(x)) return null;
    let h0 = 1, h1 = 0, k0 = 0, k1 = 1, y = x;
    for (let it = 0; it < 40; it++) {
        const a = Math.floor(y);
        const h2 = a * h0 + h1, k2 = a * k0 + k1;
        if (k2 > qmax) break;
        h1 = h0; h0 = h2; k1 = k0; k0 = k2;
        if (Math.abs(x - h0 / k0) < 1e-12 * Math.max(1, Math.abs(x))) return new Rat(BigInt(h0), BigInt(k0));
        if (y - a < 1e-15) break;
        y = 1 / (y - a);
    }
    return null;
}
const numericOrNull = (a) => { try { return numeric(a); } catch (e) { return null; } };
const transcendental = (why) => new NotExact('transcendental', why);
const LINDEMANN = 'by the Lindemann–Weierstrass theorem, sin α, cos α and tan α are transcendental for algebraic α ≠ 0';
const HERMITE = 'by the Hermite–Lindemann theorem, e^α is transcendental for algebraic α ≠ 0';
const LOG = 'by the Hermite–Lindemann theorem, log α is transcendental for algebraic α ≠ 0, 1';
const GELFOND = 'by the Gelfond–Schneider theorem, α^β is transcendental for algebraic α ≠ 0, 1 and irrational algebraic β';

function lower(a) {
    switch (a.t) {
        case 'num': case 'i': return a;
        case 'zeta': return a.n === 1 ? num(1) : a.n === 2 ? num(-1) : a;
        case 'const': return a.c === 'pi' ? PI : E;
        case 'var': return { t: 'var', name: a.name, tex: a.tex };
        case 'atom': return a.node; // an already-lowered atom, e.g. the generator of a user-defined number field
        case 'neg': return keepTranscendence(a, () => ({ t: 'neg', a: lower(a.a) }));
        case 'add': case 'sub': case 'mul': case 'div': return keepTranscendence(a, () => ({ t: a.t, a: lower(a.a), b: lower(a.b) }));
        case 'pow': return lowerPow(a);
        case 'call': return lowerCall(a);
    }
    throw new Error('internal: unknown node');
}
/** algebraic ± T, algebraic·T, T/algebraic, … stay transcendental; anything else becomes "no exact value". */
function keepTranscendence(a, build) {
    try { return build(); } catch (err) {
        if (!(err instanceof NotExact) || err.kind !== 'transcendental') throw err;
        const sides = ['a', 'b'].filter((k) => a[k]);
        let ok = sides.length === 1;
        if (sides.length === 2) {
            const bad = sides.filter((k) => { try { lower(a[k]); return false; } catch (e) { return e instanceof NotExact; } });
            if (bad.length === 1) {
                const other = a[bad[0] === 'a' ? 'b' : 'a'];
                let cv = null;
                try { cv = tryConst(lower(other)); } catch (e) { cv = null; }
                ok = !!cv && (a.t === 'add' || a.t === 'sub' || !cv.F.alg.isZero(cv.v));
            }
        }
        if (ok) throw err;
        throw new NotExact('unsupported', `it involves a transcendental number (${err.message.replace(/^by the /, 'see the ')})`);
    }
}
function lowerPow(a) {
    if (a.a.t === 'const' && a.a.c === 'e') return lowerExp(a.e);
    const r = rationalValue(a.e);
    if (r) {
        if (r.isInt()) {
            if ((r.n < 0n ? -r.n : r.n) > 100000n) throw new NotExact('unsupported', 'that exponent is too large');
            return keepTranscendence(a, () => ({ t: 'pow', a: lower(a.a), e: num(r) }));
        }
        if (r.d > 1000n) throw new NotExact('unsupported', 'that fractional power has too large a denominator');
        const B = lower(a.a);
        return { t: 'pow', a: radical(B, Number(r.d), true), e: num(r.n) };
    }
    // irrational exponent
    let base = null, ex = null;
    try { base = tryConst(lower(a.a)); ex = tryConst(lower(a.e)); } catch (e) { if (!(e instanceof NotExact)) throw e; }
    if (base && base.F.alg.isZero(K_sub1(base))) return num(1);
    if (base && ex && !base.F.alg.isZero(base.v)) throw transcendental(GELFOND);
    throw new NotExact('unsupported', 'powers with irrational exponents are not algebraic in general');
}
const K_sub1 = (cv) => cv.F.alg.sub(cv.v, cv.F.alg.one());

function lowerExp(z) {
    const L = lower(z);
    const pl = (() => { try { return piLinear(L); } catch (e) { if (e instanceof NotExact) return null; throw e; } })();
    if (pl) {
        const { F, c0, c1 } = pl;
        const r = imagRational(F, c1), a0 = ratOfK(c0);
        if (r !== null && a0 !== null && a0.isInt()) {
            const rot = expIPi(r);
            if (a0.isZero()) return rot;
            const ek = { t: 'pow', a: E, e: num(a0) };
            return rot.t === 'num' && rot.v.eq(R1) ? ek : { t: 'mul', a: ek, b: rot };
        }
        if (r !== null && !F.alg.isZero(c0)) throw transcendental(HERMITE); // e^{α}·(root of unity), α ≠ 0 algebraic
        if (F.alg.isZero(c0) && r === null) throw transcendental(`by the Gelfond–Schneider theorem: e^{βπ} = (−1)^{−iβ} is transcendental for algebraic β with iβ irrational`);
    }
    throw new NotExact('unsupported', freeMsg(L, 'e^{(·)}') || 'e to this power has no exact form here');
}
function lowerTrig(f, z) {
    const L = lower(z);
    const pl = (() => { try { return piLinear(L); } catch (e) { if (e instanceof NotExact) return null; throw e; } })();
    if (pl) {
        const r = ratOfK(pl.c1);
        if (r !== null && pl.F.alg.isZero(pl.c0)) {
            const s = sinPi(r), c = cosPi(r), one = num(1);
            const div = (p, q) => ({ t: 'div', a: p, b: q });
            return { sin: s, cos: c, tan: div(s, c), sec: div(one, c), csc: div(one, s), cot: div(c, s) }[f];
        }
        if (pl.F.alg.isZero(pl.c1) && !pl.F.alg.isZero(pl.c0)) throw transcendental(LINDEMANN);
    }
    throw new NotExact('unsupported', freeMsg(L, f) || `${f} of this argument has no exact form here`);
}
/** arcsin, arccos, arctan, arg, ln: a rational multiple of π (or iπ) when lucky; transcendental otherwise. */
function lowerInverse(a) {
    const z = a.args[0];
    const L = lower(z);
    const cv = tryConst(L);
    if (!cv) throw new NotExact('unsupported', `${a.f} of a non-constant has no exact form here`);
    const val = numericOrNull(a);
    const check = (cand) => { try { return algebraicZero({ t: 'sub', a: L, b: cand }); } catch (e) { return false; } };
    if (a.f === 'ln' || (a.f === 'log' && !a.base)) {
        if (cv.F.alg.isZero(K_sub1(cv))) return num(0);
        if (val && Math.abs(val.re) < 1e-12) { // a root of unity: log = iπr
            const r = guessRational(val.im / Math.PI);
            if (r && check(expIPi(r))) return { t: 'mul', a: { t: 'mul', a: num(r), b: { t: 'i' } }, b: PI };
        }
        if (cv.F.alg.isZero(cv.v)) throw new Error('log of zero');
        throw transcendental(LOG);
    }
    if (!val || !isRealish(val)) throw new NotExact('unsupported', `${a.f} here is not real; no exact form`);
    const r = guessRational(val.re / Math.PI);
    if (r) {
        const forward = {
            arcsin: () => check(sinPi(r)), arccos: () => check(cosPi(r)),
            arctan: () => { try { return algebraicZero({ t: 'sub', a: { t: 'mul', a: L, b: cosPi(r) }, b: sinPi(r) }); } catch (e) { return false; } },
            arg: () => { try { return algebraicZero({ t: 'sub', a: L, b: { t: 'mul', a: radical({ t: 'mul', a: L, b: conjNode(L) }, 2), b: expIPi(r) } }); } catch (e) { return false; } },
        }[a.f];
        if (forward()) return r.isZero() ? num(0) : { t: 'mul', a: num(r), b: PI };
    }
    if (a.f === 'arg' && cv.F.alg.isZero(cv.v)) throw new Error('arg(0) is undefined');
    const fwd = { arg: 'e^{iθ} = z/|z|', arctan: 'tan θ', arcsin: 'sin θ', arccos: 'cos θ' }[a.f];
    throw transcendental(`by the Lindemann–Weierstrass theorem: if θ were algebraic and nonzero, ${fwd} could not be algebraic`);
}
function lowerLogBase(a) {
    const L = lower(a.args[0]), B = lower(a.base);
    const x = tryConst(L), b = tryConst(B);
    if (!x || !b) throw new NotExact('unsupported', 'logarithms of non-constants have no exact form here');
    if (b.F.alg.isZero(b.v) || b.F.alg.isZero(K_sub1(b))) throw new Error('the base of a logarithm must not be 0 or 1');
    if (x.F.alg.isZero(x.v)) throw new Error('log of zero');
    const val = numericOrNull(a);
    if (val && isRealish(val)) {
        const r = guessRational(val.re);
        if (r && r.d <= 200n && (r.n < 0n ? -r.n : r.n) <= 2000n) { // x^q = b^p
            try { if (algebraicZero({ t: 'sub', a: { t: 'pow', a: L, e: num(r.d) }, b: { t: 'pow', a: B, e: num(r.n) } })) return num(r); } catch (e) { /* fall through */ }
        }
    }
    throw transcendental('by the Gelfond–Schneider theorem, log_β α is rational or transcendental for algebraic α, β');
}
function lowerCall(a) {
    const one = () => lower(a.args[0]);
    switch (a.f) {
        case 'sqrt': return radical(one(), 2, false);
        case 'root': {
            const r = rationalValue(a.index);
            if (!r || !r.isInt() || r.n < 1n || r.n > 1000n) throw new NotExact('unsupported', 'root indices must be whole numbers');
            return radical(one(), Number(r.n), false);
        }
        case 'conj': return conjNode(one());
        case 'abs': {
            const L = one(), cv = tryConst(L), q = cv && ratOfK(cv.v);
            if (q) return num(q.abs());
            return radical({ t: 'mul', a: L, b: conjNode(L) }, 2, false);
        }
        case 're': { const L = one(); return { t: 'div', a: { t: 'add', a: L, b: conjNode(L) }, b: num(2) }; }
        case 'im': { const L = one(); return { t: 'div', a: { t: 'sub', a: L, b: conjNode(L) }, b: { t: 'mul', a: num(2), b: { t: 'i' } } }; }
        case 'exp': return lowerExp(a.args[0]);
        case 'sinh': case 'cosh': case 'tanh': {
            const p = lowerExp(a.args[0]), m = lowerExp({ t: 'neg', a: a.args[0] });
            const s = { t: 'sub', a: p, b: m }, c = { t: 'add', a: p, b: m };
            return a.f === 'sinh' ? { t: 'div', a: s, b: num(2) } : a.f === 'cosh' ? { t: 'div', a: c, b: num(2) } : { t: 'div', a: s, b: c };
        }
        case 'sin': case 'cos': case 'tan': case 'sec': case 'csc': case 'cot': return lowerTrig(a.f, a.args[0]);
        case 'ln': case 'arcsin': case 'arccos': case 'arctan': case 'arg': return lowerInverse(a);
        case 'log': return a.base ? lowerLogBase(a) : lowerInverse(a);
        case 'fact': {
            const r = rationalValue(a.args[0]);
            if (!r || !r.isInt()) throw new NotExact('unsupported', 'factorials of non-integers (Γ values) have no exact form here');
            if (r.n < 0n) throw new Error('factorial of a negative integer');
            if (r.n > 5000n) throw new NotExact('unsupported', 'that factorial is too large');
            let f = 1n; for (let k = 2n; k <= r.n; k++) f *= k;
            return num(new Rat(f));
        }
        case 'binom': {
            const k = rationalValue(a.args[1]);
            if (!k || !k.isInt()) throw new NotExact('unsupported', 'the lower entry of a binomial must be a whole number');
            if (k.n < 0n) return num(0);
            if (k.n > 500n) throw new NotExact('unsupported', 'that binomial coefficient is too large to expand');
            const n = lower(a.args[0]);
            let node = num(1), fk = 1n;
            for (let j = 0n; j < k.n; j++) { node = { t: 'mul', a: node, b: j ? { t: 'sub', a: n, b: num(new Rat(j)) } : n }; fk *= j + 1n; }
            return { t: 'div', a: node, b: num(new Rat(fk)) };
        }
        case 'gcd': case 'lcm': {
            const vals = a.args.map(rationalValue);
            if (vals.some((v) => !v || !v.isInt())) throw new NotExact('unsupported', `${a.f} is only defined here for whole numbers`);
            const g = vals.reduce((x, y) => (a.f === 'gcd' ? X.bgcd(x, y.n < 0n ? -y.n : y.n) : (x === 0n || y.n === 0n ? 0n : X.blcm(x, y.n < 0n ? -y.n : y.n))), a.f === 'gcd' ? 0n : 1n);
            return num(new Rat(g));
        }
    }
    throw new NotExact('unsupported', `no exact rule for ${a.f}`);
}

// ─────────────────────── presenting results ───────────────────────

const babs = (x) => (x < 0n ? -x : x);
function intPolyFromMonic(mp) {
    let den = 1n; for (const c of mp) den = X.blcm(den, c.d);
    return X.zPrimitive(mp.map((c) => c.n * (den / c.d)));
}
const ratsOf = (ints) => ints.map((x) => new Rat(x));
function plainPoly(ints, v = 'x') {
    const parts = [];
    for (let k = ints.length - 1; k >= 0; k--) {
        const c = ints[k]; if (!c) continue;
        const a = babs(c), mono = k === 0 ? '' : k === 1 ? v : `${v}^${k}`;
        const s = k === 0 ? `${a}` : (a === 1n ? mono : `${a}${mono}`);
        parts.push(parts.length ? (c < 0n ? ` - ${s}` : ` + ${s}`) : (c < 0n ? `-${s}` : s));
    }
    return parts.join('') || '0';
}
function ratFactorTex(r) {
    const f = (n) => { if (babs(n) <= 1n) return null; const t = X.factorTex(babs(n)); return t; };
    const nt = f(r.n), dt = r.d > 1n ? f(r.d) : null;
    if (!nt && !dt) return null;
    const num = nt || `${babs(r.n)}`, den = dt || `${r.d}`;
    return `${r.n < 0n ? '-' : ''}${r.d > 1n ? `\\frac{${num}}{${den}}` : num}`;
}
/** Closed form of a quadratic irrationality: (−b ± s√D)/(2a), choosing the sign by the embedding. */
function quadraticForm(ints, z) {
    const [c, b, a] = ints;
    const D = b * b - 4n * a * c;
    const { factors, complete } = X.factorInt(babs(D));
    if (!complete) return null;
    let s = 1n, core = D < 0n ? -1n : 1n;
    for (const [p, e] of factors) { s *= p ** BigInt(Math.floor(e / 2)); if (e % 2) core *= p; }
    // value = (−b + σ s √core) / (2a); √core = i√|core| when core < 0
    const sq = Math.sqrt(Math.abs(Number(core)));
    const plus = core > 0n ? C((-Number(b) + Number(s) * sq) / (2 * Number(a))) : C(-Number(b) / (2 * Number(a)), Number(s) * sq / (2 * Number(a)));
    const minus = core > 0n ? C((-Number(b) - Number(s) * sq) / (2 * Number(a))) : C(-Number(b) / (2 * Number(a)), -Number(s) * sq / (2 * Number(a)));
    const sigma = cabs(csub(plus, z)) <= cabs(csub(minus, z)) ? 1n : -1n;
    let p = -b, q = sigma * s, d = 2n * a;
    if (d < 0n) { p = -p; q = -q; d = -d; }
    const g = X.bgcd(X.bgcd(babs(p), babs(q)), d);
    p /= g; q /= g; d /= g;
    const rad = core === -1n ? 'i' : core < 0n ? `\\sqrt{${-core}}\\,i` : `\\sqrt{${core}}`;
    const qa = babs(q), radTerm = (qa === 1n ? '' : `${qa}`) + rad;
    let numer = p ? `${p}${q < 0n ? ' - ' : ' + '}${radTerm}` : `${q < 0n ? '-' : ''}${radTerm}`;
    if (d === 1n) return numer;
    if (!p) return `${q < 0n ? '-' : ''}\\frac{${radTerm}}{${d}}`;
    return `\\frac{${numer}}{${d}}`;
}
function cyclotomicIndex(mp, ints) {
    if (!mp.every((c) => c.isInt())) return null;
    const d = mp.length - 1;
    for (let n = 1; n <= 6 * d * d + 6; n++) {
        if (eulerPhi(n) !== d) continue;
        const phi = PX.cyclotomic(n);
        if (phi.length === mp.length && phi.every((c, j) => c.eq(mp[j]))) return n;
    }
    return null;
}
function termCount(tex) { return tex.split(/ [+-] /).length; }

function describeAlgebraic(F, v, z, inputTex) {
    const mp = F.alg.minpoly(v), ints = intPolyFromMonic(mp), d = mp.length - 1;
    const out = { kind: 'algebraic', degree: d, minpolyTex: X.polyTex(ratsOf(ints), 'x'), minpolyPlain: plainPoly(ints) };
    out.integral = mp.every((c) => c.isInt());
    out.isReal = isRealish(z) || Math.abs(z.im) < 1e-10 * Math.max(1, cabs(z));
    if (d === 1) {
        const r = mp[0].neg();
        out.rational = true;
        out.closedTex = fracTex(r);
        out.factorTex = ratFactorTex(r);
        out.isReal = true;
        return out;
    }
    const r1 = realRootCountZ(ints);
    out.signature = [r1, (d - r1) / 2];
    out.trace = fracTex(mp[d - 1].neg());
    out.norm = fracTex(d % 2 ? mp[0].neg() : mp[0]);
    if (d === 2) out.closedTex = quadraticForm(ints, z);
    if (d === 4 && ints[1] === 0n && ints[3] === 0n && out.isReal) { // biquadratic: x² satisfies a quadratic
        const y = quadraticForm([ints[0], ints[2], ints[4]], cmul(z, z));
        if (y) {
            const r = csqrt(cmul(z, z)), sign = cabs(csub(r, z)) <= cabs(cadd(r, z)) ? '' : '-';
            out.closedTex = `${sign}\\sqrt{${y}}`;
        }
    }
    const exactTex = F.n <= 24 ? F.tex(v) : '';
    out.fieldAtoms = F.order.map((k) => F.atoms.get(k)).filter((at) => at.deg > 1).map((at) => at.tex);
    out.fieldDegree = F.n;
    if (exactTex && exactTex.length <= 1500) out.exactTex = exactTex;
    if (!out.closedTex && exactTex.length <= 110 && termCount(exactTex) <= 4 && !/\\zeta|\\omega/.test(exactTex)) out.closedTex = exactTex;
    const n = cyclotomicIndex(mp, ints);
    if (n) {
        const k = Math.round(Math.atan2(z.im, z.re) / (2 * Math.PI) * n);
        out.rootOfUnity = { n, k: ((k % n) + n) % n };
    }
    return out;
}

function polyTexK(F, P, vars, p) {
    const terms = [...p].map(([k, c]) => ({ e: P.parse(k), c })).sort((x, y) => {
        const dx = x.e.reduce((s, t) => s + t, 0), dy = y.e.reduce((s, t) => s + t, 0);
        if (dx !== dy) return dy - dx;
        for (let j = 0; j < x.e.length; j++) if (x.e[j] !== y.e[j]) return y.e[j] - x.e[j];
        return 0;
    });
    if (!terms.length) return '0';
    return terms.map((t, idx) => {
        const mono = t.e.map((x, j) => (x === 0 ? '' : x === 1 ? vars[j].tex : `${vars[j].tex}^{${x}}`)).filter(Boolean).join(' ');
        const r = ratOfK(t.c);
        let s, neg = false;
        if (r) {
            neg = r.sign() < 0;
            const a = r.abs();
            if (!mono) s = fracTex(a);
            else if (a.isInt()) s = (a.eq(R1) ? '' : `${a.n}`) + mono;
            else s = `\\frac{${a.n === 1n ? '' : a.n}${mono}}{${a.d}}`;
        } else {
            let ct = F.tex(t.c);
            if (ct.startsWith('-') && termCount(ct) === 1) { neg = true; ct = ct.slice(1); }
            s = !mono ? ct : termCount(ct) > 1 ? `\\left(${ct}\\right) ${mono}` : `${ct} ${mono}`;
        }
        return idx === 0 ? (neg ? '-' : '') + s : (neg ? ' - ' : ' + ') + s;
    }).join('');
}
/** Factor a univariate polynomial with rational coefficients over Q. */
function factorOverQ(coeffs, v) {
    let den = 1n; for (const c of coeffs) den = X.blcm(den, c.d);
    const ints = coeffs.map((c) => c.n * (den / c.d));
    const prim = X.zPrimitive(ints);
    const content = new Rat(ints[ints.length - 1], 1n).div(new Rat(prim[prim.length - 1], 1n)).div(new Rat(den));
    // squarefree decomposition (Yun) over Q, then Zassenhaus
    const facs = [];
    let f = ratsOf(prim), k = 1;
    let g = X.qpXgcd(f, X.qpDeriv(f))[0];
    let w = X.qpDivmod(f, g)[0];
    while (X.qpDeg(w) > 0) {
        const y = X.qpXgcd(w, g)[0];
        const z = X.qpDivmod(w, y)[0];
        if (X.qpDeg(z) > 0) {
            for (const h of X.zFactorSquarefree(intPolyFromMonic(X.qpMonic(z)))) facs.push({ h, k });
        }
        w = y; g = X.qpDivmod(g, y)[0]; k++;
        if (k > 200) break;
    }
    // fix the constant: content · ∏ h^k must equal the original
    let prod = [R1];
    for (const { h, k: e } of facs) for (let t = 0; t < e; t++) prod = X.qpMul(prod, ratsOf(h));
    const lc = coeffs[coeffs.length - 1].div(prod[prod.length - 1]);
    const count = facs.reduce((s, x) => s + x.k, 0);
    if (count <= 1) return null;
    const key0 = (h) => [babs(h[0]), h[0] < 0n ? 0 : 1];
    facs.sort((p, q) => p.h.length - q.h.length || (key0(p.h)[0] === key0(q.h)[0] ? key0(p.h)[1] - key0(q.h)[1] : (key0(p.h)[0] < key0(q.h)[0] ? -1 : 1)));
    const body = facs.map(({ h, k: e }) => {
        const t = X.polyTex(ratsOf(h), v);
        const paren = h.length > 2 || h[0] !== 0n ? `\\left(${t}\\right)` : t;
        return e > 1 ? `${h.length === 2 && h[0] === 0n ? t : paren}^{${e}}` : (facs.length === 1 && e === 1 ? t : paren);
    }).join('');
    const lcTex = lc.eq(R1) ? '' : lc.eq(R1.neg()) ? '-' : fracTex(lc);
    return lcTex + body;
}

// ─────────────────────── top level ───────────────────────

function fmtNum(z) {
    const f = (x) => {
        if (!isFinite(x)) return String(x);
        if (x === 0) return '0';
        const a = Math.abs(x);
        let s = a >= 1e15 || a < 1e-6 ? x.toExponential(14) : x.toPrecision(15);
        if (s.includes('e')) { let [m, e] = s.split('e'); m = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m; return `${m}\\times 10^{${parseInt(e, 10)}}`; }
        return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
    };
    const tiny = (x, ref) => Math.abs(x) < 1e-13 * Math.max(1, ref);
    const ref = cabs(z);
    const re = tiny(z.re, ref) ? 0 : z.re, im = tiny(z.im, ref) ? 0 : z.im;
    if (!im) return f(re);
    const imPart = Math.abs(im) === 1 ? 'i' : `${f(Math.abs(im))}\\,i`;
    if (!re) return (im < 0 ? '-' : '') + imPart;
    return `${f(re)} ${im < 0 ? '-' : '+'} ${imPart}`;
}

/**
 * evaluate(expression, variables) → result object (plain JSON).
 * variables: [{ name, value }] (LaTeX or text); a blank value leaves the variable free.
 */
function evaluate(src, variables = []) {
    const res = { ok: true, vars: [] };
    let ast;
    try { ast = parse(src); } catch (e) { return { ok: false, error: e.message, vars: [] }; }
    if (!ast) return { ok: false, empty: true, error: '', vars: [] };
    res.readTex = texOf(ast);

    const defs = new Map();
    for (const v of variables) {
        const info = { ok: true };
        res.vars.push(info);
        try {
            if (!String(v.name || '').trim()) { info.empty = true; continue; }
            const nm = parseName(v.name);
            info.name = nm.name; info.tex = nm.tex;
            if (defs.has(nm.name)) throw new Error(`${nm.name} is defined twice`);
            const val = String(v.value || '').trim() ? parse(v.value) : null;
            if (val) defs.set(nm.name, val); else info.free = true;
        } catch (e) { info.ok = false; info.error = e.message; }
    }
    let full;
    try { full = substitute(ast, defs); } catch (e) { return Object.assign(res, { ok: false, error: e.message }); }
    const free = [...freeVars(full).entries()].map(([name, tex]) => ({ name, tex }));
    res.free = free;

    if (!free.length) {
        try {
            const z = numeric(full);
            if (!isFinite(z.re) || !isFinite(z.im)) throw new Error('the value is not finite');
            res.numeric = { re: z.re, im: z.im, tex: fmtNum(z) };
        } catch (e) { res.numericError = e.message; }
    }

    try {
        const L = lower(full);
        const { F, vars, P, rf } = exactEval(L);
        const dConst = P.constOf(rf.d), nConst = P.constOf(rf.n);
        if (dConst && nConst) {
            const v = K_div(F, nConst, dConst);
            const z = res.numeric ? C(res.numeric.re, res.numeric.im) : F.numeric(v);
            res.exact = describeAlgebraic(F, v, z, res.readTex);
            if (!res.numeric) { const w = F.numeric(v); res.numeric = { re: w.re, im: w.im, tex: fmtNum(w) }; }
        } else {
            const used = new Set([...P.usedVars(rf.n), ...P.usedVars(rf.d)]);
            const usedVars = [...used].map((j) => vars[j]);
            const numTex = polyTexK(F, P, vars, rf.n);
            const isPoly = !!dConst;
            const tex = isPoly ? numTex : `\\frac{${numTex}}{${polyTexK(F, P, vars, rf.d)}}`;
            const specials = usedVars.filter((v) => v.special).map((v) => v.special);
            if (usedVars.every((v) => v.special)) {
                res.exact = specials.length === 1
                    ? { kind: 'transcendental', tex, reason: specials[0] === 'pi'
                        ? 'π is transcendental (Lindemann), so a nonconstant rational function of π with algebraic coefficients is transcendental'
                        : 'e is transcendental (Hermite), so a nonconstant rational function of e with algebraic coefficients is transcendental' }
                    : { kind: 'open', tex, reason: 'whether e and π are algebraically independent is an open problem, so it is not known whether this number is transcendental' };
            } else {
                const fv = usedVars.filter((v) => !v.special);
                res.exact = { kind: isPoly ? 'polynomial' : 'rational function', tex, vars: fv.map((v) => v.tex) };
                // univariate with rational coefficients: factor over Q
                if (usedVars.length === 1) {
                    const j = vars.indexOf(usedVars[0]);
                    const toQ = (p) => {
                        const a = [];
                        for (const [k, c] of p) { const r = ratOfK(c); if (!r) return null; const dg = P.parse(k)[j]; while (a.length <= dg) a.push(R0); a[dg] = r; }
                        return a;
                    };
                    const qn = toQ(rf.n), qd = isPoly ? [R1] : toQ(rf.d);
                    if (qn && qd) {
                        const deg = qn.length - 1;
                        res.exact.degree = deg;
                        if (deg <= 120) {
                            const fn = factorOverQ(qn, usedVars[0].tex), fd = isPoly ? null : factorOverQ(qd, usedVars[0].tex);
                            if (fn || fd) res.exact.factoredTex = isPoly ? fn : `\\frac{${fn || X.polyTex(qn, usedVars[0].tex)}}{${fd || X.polyTex(qd, usedVars[0].tex)}}`;
                            if (isPoly && deg >= 1) res.exact.realRoots = realRootCountZ(intPolyFromMonic(X.qpMonic(sqfree(qn))));
                        }
                    }
                }
                if (specials.length) res.exact.coefficientNote = `coefficients involve ${specials.map((s) => (s === 'pi' ? 'π' : 'e')).join(' and ')}`;
            }
        }
    } catch (e) {
        if (e instanceof NotExact) res.exactNote = { kind: e.kind, text: e.message };
        else if (/^this needs a field of degree/.test(e.message)) res.exactNote = { kind: 'unsupported', text: e.message };
        else if (/division by zero|log of zero|is undefined|negative integer/.test(e.message)) { res.undefined = e.message; delete res.numeric; }
        else res.exactError = e.message;
    }
    if (res.numericError && !res.undefined) res.undefined = res.numericError;
    if (free.length && !res.exact && !res.exactNote) res.exactNote = { kind: 'unsupported', text: 'no exact form' };
    return res;
}
/** Number of real roots of a squarefree integer polynomial: Sturm sequence over Z with primitive parts. */
function realRootCountZ(f) {
    const deg = (p) => p.length - 1;
    const trim = (p) => { let k = p.length; while (k > 0 && p[k - 1] === 0n) k--; return p.slice(0, k); };
    const prim = (p) => { let g = 0n; for (const c of p) g = X.bgcd(g, babs(c)); return g > 1n ? p.map((c) => c / g) : p; };
    const prem = (a, b) => { // lc(b)^(deg a − deg b + 1) · a mod b
        let r = a.slice();
        const db = deg(b), lb = b[db];
        for (let k = deg(r) - db; k >= 0; k--) {
            const c = r[k + db] || 0n;
            r = r.map((x) => x * lb);
            for (let t = 0; t <= db; t++) r[k + t] -= c * b[t];
        }
        return trim(r);
    };
    if (deg(f) < 1) return 0;
    const seq = [prim(f), prim(trim(f.slice(1).map((c, j) => c * BigInt(j + 1))))];
    while (deg(seq[seq.length - 1]) > 0) {
        const a = seq[seq.length - 2], b = seq[seq.length - 1];
        const r = prem(a, b);
        if (!r.length) break;
        const flip = b[deg(b)] < 0n && (deg(a) - deg(b) + 1) % 2 === 1;
        seq.push(prim(r).map((c) => (flip ? c : -c)));
    }
    const changes = (signs) => { let c = 0, prev = 0; for (const x of signs) { if (!x) continue; if (prev && x !== prev) c++; prev = x; } return c; };
    const sg = (x) => (x > 0n ? 1 : x < 0n ? -1 : 0);
    const atPos = seq.map((p) => sg(p[deg(p)]));
    const atNeg = seq.map((p) => sg(p[deg(p)]) * (deg(p) % 2 ? -1 : 1));
    return changes(atNeg) - changes(atPos);
}
function sqfree(f) { const g = X.qpXgcd(f, X.qpDeriv(f))[0]; return X.qpDeg(g) > 0 ? X.qpDivmod(f, g)[0] : f; }

const api = { evaluate, parse, parseName, texOf, _internal: { tokenize, lower, exactEval, numeric, substitute, freeVars, NotExact } };
if (isNode) module.exports = api;
else root.ExprEngine = api;
})(typeof self !== 'undefined' ? self : this);
