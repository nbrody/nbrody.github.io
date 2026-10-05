/**
 * expr.js — reading generators and constants (LaTeX from MathQuill, or plain text).
 *
 *   readGroup({ mats, anti, consts }) → { exact, field, gens, entries, roots, reason, … }
 *
 * mats are 2×2 matrices of entry strings; consts is a list of rows, of two kinds:
 *
 *   ['p', '\\frac{1+\\sqrt{5}}{2}']                   p is the value of an expression
 *   { name: 'w', poly: 'w^2+w+1', near: {re, im} }    w is the root of a polynomial nearest `near`
 *
 * A row may use the rows above it; a polynomial's coefficients may be any earlier constants.
 *
 * Everything is first read EXACTLY into a tower of number fields (tower.js). Rationals (decimals
 * included), i, radicals, roots of unity, cos/sin/tan at rational multiples of π, e^{iπr}, complex
 * conjugation, |·|, Re and Im all become elements of the tower. If a value is not algebraic (π
 * itself, e, cos 1, …) or the field would grow past the degree cap, the whole group is read again
 * in floating point, and `reason` says why. Exactness is all or nothing: the certifier needs every
 * generator in one field.
 *
 * The tokenizer and parser follow Algebraic/Tools/expressionParser/exprEngine.js, with one change:
 * a run of letters is split into the longest defined names first, so multi-letter constants (mm,
 * xx) read as single symbols.
 */

import { Frac, ExactMat } from './exact.js';
import { TowerField, NotExact, cyclotomic, cosMinpoly, complexRoots, sortRoots, nearestIndex, fracNum } from './tower.js';

const F0 = new Frac(0n), F1 = new Frac(1n);
const Fint = (n) => new Frac(BigInt(n));

// ---------------- tokenizer ----------------

const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
    'exp', 'ln', 'log', 'sqrt', 'cbrt', 'root', 'abs', 're', 'im', 'arg', 'conj']);
const ALIASES = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', Re: 're', Im: 'im', nthRoot: 'root', nthroot: 'root' };
const WORDS = ['arcsin', 'arccos', 'arctan', 'nthRoot', 'nthroot', 'omega', 'sqrt', 'cbrt', 'root', 'sinh', 'cosh', 'tanh',
    'asin', 'acos', 'atan', 'zeta', 'conj', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'exp', 'abs', 'arg', 'log', 'pi', 'ln', 'Re', 'Im'];
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'rho', 'varrho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega']);
const UNI_GREEK = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'η': 'eta', 'θ': 'theta', 'κ': 'kappa',
    'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'φ': 'phi', 'χ': 'chi', 'ψ': 'psi' };
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const SKIP_CMDS = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle', 'thinspace', 'medspace', 'thickspace', 'limits']);
const SIZE_CMDS = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr']);

function tokenize(src, names) {
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
            push('num', { v: new Frac(BigInt((ip || '0') + fp), 10n ** BigInt(fp.length)) });
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
                continue;
            }
            if (cmd === '{') { push('('); continue; }
            if (cmd === '}') { push(')'); continue; }
            if (cmd === '|' || cmd === 'vert' || cmd === 'mid') { push('|', { side: null }); continue; }
            if (cmd === 'lvert') { push('|', { side: 'L' }); continue; }
            if (cmd === 'rvert') { push('|', { side: 'R' }); continue; }
            if (cmd === 'cdot' || cmd === 'times' || cmd === 'ast') { push('op', { v: '*' }); continue; }
            if (cmd === 'div') { push('op', { v: '/' }); continue; }
            if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') { push('frac'); continue; }
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
                if (/^[A-Za-z]+$/.test(w) && (w.length === 1 || names.has(w))) { push('letter', { c: w, tex: w }); continue; }
                throw new Error(`unknown function "${w}"`);
            }
            if (GREEK.has(cmd)) { push('letter', { c: `\\${cmd}`, tex: `\\${cmd}` }); continue; }
            if (word(cmd) !== false) continue;
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
            push('num', { v: Fint(t) }); push('}');
            i = j; continue;
        }
        if (/[A-Za-z]/.test(c)) {
            let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
            const run = s.slice(i, j);
            let k = 0;
            while (k < run.length) {       // longest defined name or known word first, else one letter
                let best = null, isName = false;
                for (const w of WORDS) if (run.startsWith(w, k) && (!best || w.length > best.length)) { best = w; isName = false; }
                for (const nm of names) if (run.startsWith(nm, k) && (!best || nm.length > best.length)) { best = nm; isName = true; }
                if (best && !isName) { word(best); k += best.length; }
                else if (best) { push('letter', { c: best, tex: best }); k += best.length; }
                else { push('letter', { c: run[k], tex: run[k] }); k++; }
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

// ---------------- parser → AST ----------------
// num {v} · i · const {c: 'pi'|'e'} · zeta {n} · var {name, tex} · neg · add/sub/mul/div {a, b} · pow {a, e}
// call {f, args, index?, base?}

const describeTok = (tk) => !tk ? 'end of input' : tk.t === 'op' ? `"${tk.v}"` : tk.t === 'num' ? 'a number'
    : tk.t === 'letter' ? `"${tk.tex}"` : tk.t === 'fn' ? `"${tk.f}"` : `"${tk.t}"`;

/** Parse src into an AST (null for an empty string). `names`: the multi-letter names in scope. */
export function parse(src, names = new Set()) {
    const toks = tokenize(src, names);
    if (!toks.length) return null;
    let i = 0, absDepth = 0;
    const peek = () => toks[i];
    const at = (t) => toks[i] && toks[i].t === t;
    const atOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const eat = (t) => (at(t) ? (i++, true) : false);
    const eatOp = (v) => (atOp(v) ? (i++, true) : false);
    const expect = (t, what) => { if (!eat(t)) throw new Error(`expected ${what} but found ${describeTok(peek())}`); };
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
        if (['num', 'letter', 'pi', 'zeta', 'omega', 'fn', 'frac', 'sqrt', 'overline', '(', '[', '{'].includes(tk.t)) return true;
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
        const b = primary();
        return eatOp('^') ? { t: 'pow', a: b, e: exponent() } : b;
    }
    function exponent() {
        if (eatOp('-')) return { t: 'neg', a: exponent() };
        if (eatOp('+')) return exponent();
        return power();
    }
    function group(what) {
        if (eat('{')) { const e = expr(); expect('}', '"}"'); return e; }
        if (!peek()) throw new Error(`${what} is missing`);
        return primary();
    }
    let subPow = null;    // a power typed inside a subscript, as MathQuill does with \zeta_{5^4}
    function subscript() {
        let txt = '';
        subPow = null;
        const piece = (tk) => {
            if (tk.t === 'num') { if (tk.v.q !== 1n) throw new Error('subscripts must be whole numbers or letters'); return `${tk.v.p}`; }
            if (tk.t === 'letter') return tk.c;
            throw new Error(`can't use ${describeTok(tk)} in a subscript`);
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
    function args() {
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
            case '(': { const e = expr(); expect(')', '")"'); return e; }
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
            case 'overline': return { t: 'call', f: 'conj', args: [group('the argument of a bar')] };
            case 'sqrt': {
                let index = tk.idx ? { t: 'num', v: Fint(tk.idx) } : null;
                if (!index && eat('[')) { index = expr(); expect(']', '"]"'); }
                let rad;
                if (atOp('-')) { i++; rad = { t: 'neg', a: primary() }; } else rad = group('a radicand');
                return index ? { t: 'call', f: 'root', args: [rad], index } : { t: 'call', f: 'sqrt', args: [rad] };
            }
            case 'fn': return application(tk.f);
        }
        throw new Error(`unexpected ${describeTok(tk)}`);
    }
    function application(f) {
        let base = null, pw = null;
        if (f === 'log' && eatOp('_')) base = group('the base of the logarithm');
        if (eatOp('^')) pw = exponent();
        let list;
        if (at('(') || at('[')) list = args();
        else if (!startsFactor() && (pw || base)) {
            const src = pw || base;
            if (!(src.t === 'mul')) throw new Error(`${f} needs an argument`);
            list = [src.b];
            if (pw) pw = src.a; else base = src.a;
        } else {
            if (!startsFactor()) throw new Error(`${f} needs an argument`);
            let a = power();
            while (startsFactor() && !at('fn')) a = bin('mul', a, power());
            list = [a];
        }
        const arity = { root: [2, 2], log: [1, 2] }[f] || [1, 1];
        if (list.length < arity[0] || list.length > arity[1]) {
            throw new Error(`${f} takes ${arity[0] === arity[1] ? arity[0] : `${arity[0]}–${arity[1]}`} argument${arity[1] > 1 ? 's' : ''}`);
        }
        let node;
        if (f === 'root') node = { t: 'call', f: 'root', args: [list[0]], index: list[1] };
        else if (f === 'cbrt') node = { t: 'call', f: 'root', args: list, index: { t: 'num', v: Fint(3) } };
        else if (f === 'log' && list.length === 2) node = { t: 'call', f: 'log', args: [list[0]], base: list[1] };
        else node = { t: 'call', f, args: list, base };
        if (pw) {
            const inverse = { sin: 'arcsin', cos: 'arccos', tan: 'arctan' }[f];
            if (inverse && pw.t === 'neg' && pw.a.t === 'num' && pw.a.v.equals(F1)) return { t: 'call', f: inverse, args: list };
            return { t: 'pow', a: node, e: pw };
        }
        return node;
    }

    const ast = expr();
    if (i < toks.length) throw new Error(`unexpected ${describeTok(peek())}`);
    return ast;
}

/**
 * A constant's name: letters (one or more), a Greek letter, optionally with a
 * subscript — x, mm, x_1, x_{12}, \alpha. Returns { name, tex } or null when empty.
 */
export function parseName(src) {
    const s = String(src || '').replace(/\s+/g, '').replace(/\\(?:operatorname|mathrm|text|mathit)\{([^}]*)\}/g, '$1');
    if (!s) return null;
    const m = /^(\\[A-Za-z]+|[A-Za-z]+)(?:_(?:\{([A-Za-z0-9]+)\}|([A-Za-z0-9])))?$/.exec(s);
    if (!m) throw new Error('a name is a letter or letters, optionally with a subscript (w, mm, x_1, \\alpha)');
    const head = m[1], sub = m[2] || m[3];
    if (head.startsWith('\\')) {
        if (head === '\\pi') throw new Error('π is reserved');
        if (!GREEK.has(head.slice(1))) throw new Error(`${head} can't be used as a name`);
    } else {
        if (head === 'i' || head === 'e') throw new Error(`${head} is reserved`);
        if (WORDS.includes(head) || FUNCS.has(head)) throw new Error(`${head} is a function name`);
    }
    return { name: sub ? `${head}_${sub}` : head, tex: sub ? `${head}_{${sub}}` : head };
}

// ---------------- printing (labels of field levels) ----------------

const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const supNum = (n) => String(n).split('').map(ch => SUP_DIGITS[+ch] ?? ch).join('');
const subNum = (n) => String(n).split('').map(ch => SUB_DIGITS[+ch] ?? ch).join('');
const GREEK_UNI = Object.fromEntries(Object.entries(UNI_GREEK).map(([u, w]) => [w, u]));
function plainName(name) {
    const [head, sub] = name.split('_');
    const h = head.startsWith('\\') ? (GREEK_UNI[head.slice(1)] || head.slice(1)) : head;
    return sub ? h + (/^\d+$/.test(sub) ? subNum(sub) : `_${sub}`) : h;
}
const FN_TEX = { sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', arcsin: '\\arcsin',
    arccos: '\\arccos', arctan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', exp: '\\exp', ln: '\\ln', log: '\\log',
    arg: '\\arg', re: '\\operatorname{Re}', im: '\\operatorname{Im}' };
const fracTex = (r) => (r.q === 1n ? `${r.p}` : `${r.p < 0n ? '-' : ''}\\frac{${r.p < 0n ? -r.p : r.p}}{${r.q}}`);

export function texOf(a, prec = 0) {
    const wrap = (s, cond) => (cond ? `\\left(${s}\\right)` : s);
    switch (a.t) {
        case 'num': return wrap(fracTex(a.v), (a.v.p < 0n && prec > 1) || (a.v.q !== 1n && prec > 3));
        case 'i': return 'i';
        case 'const': return a.c === 'pi' ? '\\pi' : 'e';
        case 'zeta': return a.n === 3 ? '\\omega' : `\\zeta_{${a.n}}`;
        case 'var': return a.tex;
        case 'neg': return wrap(`-${texOf(a.a, 2)}`, prec > 1);
        case 'add': return wrap(`${texOf(a.a, 1)} + ${texOf(a.b, 1)}`, prec > 1);
        case 'sub': return wrap(`${texOf(a.a, 1)} - ${texOf(a.b, 2)}`, prec > 1);
        case 'mul': {
            const right = texOf(a.b, 2);
            const dot = /^[0-9-]/.test(right) || (a.b.t === 'pow' && a.b.a.t === 'num');
            return wrap(`${texOf(a.a, 2)}${dot ? ' \\cdot ' : ' '}${right}`, prec > 2);
        }
        case 'div': return wrap(`\\frac{${texOf(a.a)}}{${texOf(a.b)}}`, prec > 3);
        case 'pow': {
            if (a.a.t === 'const' && a.a.c === 'e') return `e^{${texOf(a.e)}}`;
            return `{${texOf(a.a, 4)}}^{${texOf(a.e)}}`;
        }
        case 'call': {
            const x = a.args.map((y) => texOf(y));
            switch (a.f) {
                case 'sqrt': return `\\sqrt{${x[0]}}`;
                case 'root': return `\\sqrt[${texOf(a.index)}]{${x[0]}}`;
                case 'abs': return `\\left|${x[0]}\\right|`;
                case 'conj': return `\\overline{${x[0]}}`;
                case 'exp': return `e^{${x[0]}}`;
                case 'log': if (a.base) return wrap(`\\log_{${texOf(a.base)}}\\left(${x[0]}\\right)`, prec > 3); break;
            }
            return wrap(`${FN_TEX[a.f] || `\\operatorname{${a.f}}`}\\left(${x.join(', ')}\\right)`, prec > 3);
        }
    }
    return '?';
}

export function textOf(a, prec = 0) {
    const wrap = (s, cond) => (cond ? `(${s})` : s);
    switch (a.t) {
        case 'num': return wrap(a.v.toString(), (a.v.p < 0n && prec > 1) || (a.v.q !== 1n && prec > 2));
        case 'i': return 'i';
        case 'const': return a.c === 'pi' ? 'π' : 'e';
        case 'zeta': return a.n === 3 ? 'ω' : `ζ${subNum(a.n)}`;
        case 'var': return plainName(a.name);
        case 'neg': return wrap(`−${textOf(a.a, 3)}`, prec > 1);
        case 'add': return wrap(`${textOf(a.a, 1)}+${textOf(a.b, 1)}`, prec > 1);
        case 'sub': return wrap(`${textOf(a.a, 1)}−${textOf(a.b, 2)}`, prec > 1);
        case 'mul': return wrap(`${textOf(a.a, 2)}${a.b.t === 'num' ? '·' : ''}${textOf(a.b, 3)}`, prec > 2);
        case 'div': return wrap(`${textOf(a.a, 3)}/${textOf(a.b, 3)}`, prec > 2);
        case 'pow': {
            const e = a.e.t === 'num' && a.e.v.q === 1n && a.e.v.p >= 0n ? supNum(a.e.v.p) : `^${textOf(a.e, 4)}`;
            return `${textOf(a.a, 4)}${e}`;
        }
        case 'call': {
            const x = a.args.map((y) => textOf(y));
            switch (a.f) {
                case 'sqrt': return radText(2, a.args[0]);
                case 'root': return a.index.t === 'num' ? radText(Number(a.index.v.p), a.args[0]) : `root(${x[0]}, ${textOf(a.index)})`;
                case 'abs': return `|${x[0]}|`;
                case 'conj': return `conj(${x[0]})`;
            }
            return `${a.f}(${x.join(', ')})`;
        }
    }
    return '?';
}
function radText(r, arg) {
    const simple = arg.t === 'num' ? arg.v.p >= 0n && arg.v.q === 1n : arg.t === 'var' || arg.t === 'i';
    const body = simple ? textOf(arg) : `(${textOf(arg)})`;
    return (r === 2 ? '√' : r === 3 ? '∛' : r === 4 ? '∜' : `${supNum(r)}√`) + body;
}
function radTex(r, arg) {
    return r === 2 ? `\\sqrt{${texOf(arg)}}` : `\\sqrt[${r}]{${texOf(arg)}}`;
}
function piText(q) {           // qπ for a rational q, as text and TeX
    const num = q.p, den = q.q;
    const n = num === 1n ? '' : num === -1n ? '−' : `${num}`;
    const text = den === 1n ? `${n}π` : `${n}π/${den}`;
    const nt = num === 1n ? '' : num === -1n ? '-' : `${num}`;
    const tex = den === 1n ? `${nt}\\pi` : `\\frac{${nt}\\pi}{${den}}`;
    return { text, tex };
}

// ---------------- complex floating point ----------------

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
const realish = (a) => Math.abs(a.im) <= 1e-13 * Math.max(1, Math.abs(a.re));
function clog(a) {
    if (a.re === 0 && a.im === 0) throw new Error('log of zero');
    return C(Math.log(cabs(a)), Math.atan2(realish(a) ? 0 : a.im, a.re));
}
function cpowInt(a, k) {
    let r = C(1), b = a, e = Math.abs(k);
    while (e > 0) { if (e & 1) r = cmul(r, b); b = cmul(b, b); e = Math.floor(e / 2); }
    return k < 0 ? cdiv(C(1), r) : r;
}
function cpow(a, w) {
    if (realish(w) && Number.isInteger(w.re) && Math.abs(w.re) <= 1e6) return cpowInt(a, w.re);
    if (a.re === 0 && a.im === 0) { if (w.re > 0) return C(0); throw new Error('0 to a non-positive power'); }
    return cexp(cmul(w, clog(a)));
}
/**
 * The r-th root of a: the principal value, except that `realOdd` takes the
 * real root of a real number for odd r (∛(−8) = −2, as \sqrt[3]{} is read).
 * A number within rounding of the negative real axis counts as on it.
 */
export function croot(a, r, realOdd = false) {
    if (realOdd && r % 2 === 1 && realish(a)) return C(Math.sign(a.re) * Math.pow(Math.abs(a.re), 1 / r));
    const m = Math.pow(cabs(a), 1 / r), t = Math.atan2(realish(a) ? 0 : a.im, a.re) / r;
    return C(m * Math.cos(t), m * Math.sin(t));
}
const csin = (a) => C(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im));
const ccos = (a) => C(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im));
const csinh = (a) => C(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im));
const ccosh = (a) => C(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im));
const I = C(0, 1);
function casin(z) {
    if (realish(z) && Math.abs(z.re) <= 1) return C(Math.asin(z.re));
    return cmul(C(0, -1), clog(cadd(cmul(I, z), croot(csub(C(1), cmul(z, z)), 2))));
}
function cacos(z) { if (realish(z) && Math.abs(z.re) <= 1) return C(Math.acos(z.re)); return csub(C(Math.PI / 2), casin(z)); }
function catan(z) {
    if (realish(z)) return C(Math.atan(z.re));
    return cmul(C(0, 0.5), csub(clog(csub(C(1), cmul(I, z))), clog(cadd(C(1), cmul(I, z)))));
}
const intOf = (z, what) => {
    if (!realish(z) || Math.abs(z.re - Math.round(z.re)) > 1e-9 * Math.max(1, Math.abs(z.re))) throw new Error(`${what} must be a whole number`);
    return Math.round(z.re);
};

/** Complex floating-point value of an AST; scope maps names to { re, im }. */
export function numeric(a, scope = new Map()) {
    const ev = (b) => numeric(b, scope);
    switch (a.t) {
        case 'num': return C(fracNum(a.v));
        case 'i': return I;
        case 'const': return C(a.c === 'pi' ? Math.PI : Math.E);
        case 'zeta': return C(Math.cos(2 * Math.PI / a.n), Math.sin(2 * Math.PI / a.n));
        case 'var': {
            const v = scope.get(a.name);
            if (!v) throw new Error(`unknown symbol ${plainName(a.name)}`);
            return v;
        }
        case 'neg': { const v = ev(a.a); return C(-v.re, -v.im); }
        case 'add': return cadd(ev(a.a), ev(a.b));
        case 'sub': return csub(ev(a.a), ev(a.b));
        case 'mul': return cmul(ev(a.a), ev(a.b));
        case 'div': return cdiv(ev(a.a), ev(a.b));
        case 'pow': return a.a.t === 'const' && a.a.c === 'e' ? cexp(ev(a.e)) : cpow(ev(a.a), ev(a.e));
        case 'call': {
            const x = a.args.map(ev), z = x[0];
            switch (a.f) {
                case 'sqrt': return croot(z, 2);
                case 'root': {
                    const n = intOf(ev(a.index), 'the index of a root');
                    if (n < 1) throw new Error('the index of a root must be positive');
                    return croot(z, n, true);
                }
                case 'abs': return C(cabs(z));
                case 'conj': return C(z.re, -z.im);
                case 're': return C(z.re);
                case 'im': return C(z.im);
                case 'arg': if (!z.re && !z.im) throw new Error('arg(0) is undefined'); return C(Math.atan2(realish(z) ? 0 : z.im, z.re));
                case 'exp': return cexp(z);
                case 'ln': return clog(z);
                case 'log': return a.base ? cdiv(clog(z), clog(ev(a.base))) : clog(z);
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
            }
        }
    }
    throw new Error('cannot evaluate this expression');
}

// ---------------- exact evaluation into a field tower ----------------

/**
 * Values during exact evaluation are x + c·π with x, c in the tower (c null
 * when 0): the π part lets cos(π/n), e^{2πi/7} and constants like t = π/5 be
 * read, while a value with a genuine π part is transcendental.
 */
class ExactReader {
    constructor(maxDegree) {
        this.K = new TowerField({ maxDegree });
        this.memo = new Map();
        this.usedConj = false;
    }
    V(x, c = null) { return { x, c: c && !c.isZero() ? c : null }; }
    alg(v) {
        if (v.c) throw new NotExact('π is transcendental');
        return v.x;
    }

    ev(a, scope) {
        const K = this.K, ev = (b) => this.ev(b, scope);
        switch (a.t) {
            case 'num': return this.V(K.fromFrac(a.v));
            case 'i': return this.V(this.zetaGen(4));
            case 'const':
                if (a.c === 'pi') return this.V(K.zero(), K.one());
                throw new NotExact('e is transcendental');
            case 'zeta': return this.V(this.zetaGen(a.n));
            case 'var': {
                const v = scope.get(a.name);
                if (!v) throw new Error(`unknown symbol ${plainName(a.name)}`);
                return v;
            }
            case 'neg': { const v = ev(a.a); return this.V(v.x.neg(), v.c && v.c.neg()); }
            case 'add': case 'sub': {
                const p = ev(a.a), q = ev(a.b), op = a.t === 'add' ? 'add' : 'sub';
                const c = p.c && q.c ? p.c[op](q.c) : p.c ? p.c : q.c ? (op === 'add' ? q.c : q.c.neg()) : null;
                return this.V(p.x[op](q.x), c);
            }
            case 'mul': {
                const p = ev(a.a), q = ev(a.b);
                if (p.c && q.c) throw new NotExact('π² is transcendental');
                const c = p.c ? p.c.mul(q.x) : q.c ? q.c.mul(p.x) : null;
                return this.V(p.x.mul(q.x), c);
            }
            case 'div': {
                const p = ev(a.a), q = ev(a.b);
                if (q.c) throw new NotExact('π is transcendental');
                if (q.x.isZero()) throw new Error('division by zero');
                const r = q.x.inv();
                return this.V(p.x.mul(r), p.c && p.c.mul(r));
            }
            case 'pow': return this.power(a, scope);
            case 'call': return this.call(a, scope);
        }
        throw new Error('cannot evaluate this expression');
    }

    power(a, scope) {
        const K = this.K;
        if (a.a.t === 'const' && a.a.c === 'e') return this.V(this.expAst(a.e, scope));
        const ez = this.ev(a.e, scope);
        const r = ez.c ? null : ez.x.rational();
        if (!r) throw new NotExact('an irrational exponent gives a transcendental number');
        const b = this.ev(a.a, scope);
        if (b.c) {
            if (r.equals(F1)) return b;
            if (r.isZero()) return this.V(K.one());
            throw new NotExact('a power of π is transcendental');
        }
        if (r.q > 1000n || r.p > 100000n || r.p < -100000n) throw new NotExact('the exponent is too large');
        const n = Number(r.p), q = Number(r.q);
        let x = b.x;
        if (x.isZero()) {
            if (n <= 0) throw new Error('0 to a non-positive power');
            return this.V(K.zero());
        }
        if (q > 1) x = this.radical(x, q, false, { text: `(${textOf(a.a)})^(1/${q})`, tex: `{${texOf(a.a, 4)}}^{1/${q}}` });
        return this.V(x.pow(n));
    }

    call(a, scope) {
        const K = this.K, ev = (b) => this.ev(b, scope);
        const arg = a.args[0];
        switch (a.f) {
            case 'sqrt':
                return this.V(this.radical(this.alg(ev(arg)), 2, false, { text: radText(2, arg), tex: radTex(2, arg) }));
            case 'root': {
                const iv = ev(a.index), r = iv.c ? null : iv.x.rational();
                if (!r || r.q !== 1n || r.p < 1n || r.p > 1000n) throw new Error('the index of a root must be a positive whole number');
                const n = Number(r.p);
                return this.V(this.radical(this.alg(ev(arg)), n, true, { text: radText(n, arg), tex: radTex(n, arg) }));
            }
            case 'conj': return this.V(this.conj(this.alg(ev(arg))));
            case 're': { const x = this.alg(ev(arg)); return this.V(x.add(this.conj(x)).mul(K.fromFrac(new Frac(1n, 2n)))); }
            case 'im': {
                const x = this.alg(ev(arg));
                return this.V(x.sub(this.conj(x)).mul(this.zetaGen(4)).mul(K.fromFrac(new Frac(-1n, 2n))));
            }
            case 'abs': {
                const x = this.alg(ev(arg));
                const q = x.rational();
                if (q) return this.V(K.fromFrac(q.p < 0n ? q.neg() : q));
                return this.V(this.radical(x.mul(this.conj(x)), 2, false, { text: `|${textOf(arg)}|`, tex: `\\left|${texOf(arg)}\\right|` }));
            }
            case 'exp': return this.V(this.expAst(arg, scope));
            case 'sin': case 'cos': case 'tan': case 'sec': case 'csc': case 'cot': {
                const z = ev(arg);
                if (!z.c) {
                    if (!z.x.isZero()) throw new NotExact('a trigonometric value at a nonzero algebraic number is transcendental (Lindemann–Weierstrass)');
                    return this.V(this.trig(a.f, F0));
                }
                const q = z.x.isZero() ? z.c.rational() : null;
                if (!q) throw new NotExact('trigonometric values are exact only at rational multiples of π');
                return this.V(this.trig(a.f, q));
            }
        }
        throw new NotExact(`${a.f} is evaluated numerically`);
    }

    conj(x) {
        this.usedConj = true;
        this.K.ensureConj();
        return x.conj();
    }

    /**
     * e^z. An exponent of the form iπr is read symbolically first (gaussPi), so
     * e^{2πi/5} is ζ₅ without adjoining i on the way; anything else is
     * evaluated and passed to expOf.
     */
    expAst(z, scope) {
        const g = gaussPi(z, scope);
        if (g) {
            if (!g.a.isZero() || !g.b.isZero()) throw new NotExact('e^α is transcendental for algebraic α ≠ 0 (Lindemann–Weierstrass)');
            if (!g.c.isZero()) throw new NotExact('e^{rπ} is transcendental for real r ≠ 0');
            return this.unitRoot(g.d);
        }
        return this.expOf(this.ev(z, scope));
    }

    /** e^z for z = x + cπ: algebraic only for z = iπr (a root of unity) or z = 0. */
    expOf(z) {
        const K = this.K;
        if (!z.x.isZero()) throw new NotExact('e^α is transcendental for algebraic α ≠ 0 (Lindemann–Weierstrass)');
        if (!z.c) return K.one();
        const real = z.c.rational();
        if (real) throw new NotExact('e^{rπ} is transcendental for real r ≠ 0');
        const r = z.c.mul(this.zetaGen(4)).neg().rational();       // z = iπr  ⇒  r = −i·c
        if (!r) throw new NotExact('e^z is exact only for z = iπr with r rational');
        return this.unitRoot(r);
    }

    /** e^{iπr} for rational r, as a power of a primitive root of unity. */
    unitRoot(r) {
        const h = r.mul(new Frac(1n, 2n));                   // e^{2πi h}
        let k = h.p % h.q; if (k < 0n) k += h.q;
        const m = Number(h.q);
        if (m > 400) throw new NotExact(`a root of unity of order ${m} is too large`);
        return this.zetaGen(m).pow(Number(k));
    }

    /** ζ_m = e^{2πi/m}. */
    zetaGen(m) {
        const key = `zeta:${m}`;
        if (this.memo.has(key)) return this.memo.get(key);
        const K = this.K;
        let v;
        if (m === 1) v = K.one();
        else if (m === 2) v = K.fromInt(-1);
        else {
            const value = C(Math.cos(2 * Math.PI / m), Math.sin(2 * Math.PI / m));
            const label = m === 4 ? { text: 'i', tex: 'i' } : m === 3 ? { text: 'ω', tex: '\\omega' } : { text: `ζ${subNum(m)}`, tex: `\\zeta_{${m}}` };
            let P;
            const c = this.memo.get(`cos:${m}`);
            if (c) P = [K.one(), c.mul(K.fromInt(-2)), K.one()];       // y² − 2cos(2π/m)·y + 1
            else P = cyclotomic(m).map(f => K.fromFrac(f));
            v = K.adjoinRoot(P, value, label);
        }
        this.memo.set(key, v);
        return v;
    }

    /** cos(2π/m), adjoined through its real minimal polynomial (or read off ζ_m). */
    cosGen(m) {
        const key = `cos:${m}`;
        if (this.memo.has(key)) return this.memo.get(key);
        const K = this.K;
        let v;
        const z = this.memo.get(`zeta:${m}`);
        if (m <= 2) v = K.fromInt(m === 1 ? 1 : -1);
        else if (z) v = z.add(z.inv()).mul(K.fromFrac(new Frac(1n, 2n)));
        else {
            const { text, tex } = piText(new Frac(2n, BigInt(m)));
            v = K.adjoinRoot(cosMinpoly(m).map(f => K.fromFrac(f)), C(Math.cos(2 * Math.PI / m)),
                { text: `cos(${text})`, tex: `\\cos${tex}` });
        }
        this.memo.set(key, v);
        return v;
    }

    /** cos, sin, … at qπ. */
    trig(f, q) {
        const K = this.K;
        const cosAt = (r) => {                                   // cos(rπ) = cos(2πk/m)
            const h = r.mul(new Frac(1n, 2n));
            let k = h.p % h.q; if (k < 0n) k += h.q;
            const m = Number(h.q);
            if (m > 400) throw new NotExact(`cos(${r}π) lies in a field of too large a degree`);
            if (m <= 2 || m === 3 || m === 4 || m === 6) {
                const vals = { 1: [1], 2: [1, -1], 3: [1, -0.5, -0.5], 4: [1, 0, -1, 0], 6: [1, 0.5, -0.5, -1, -0.5, 0.5] }[m];
                const v = vals[Number(k)];
                return K.fromFrac(v === 0.5 ? new Frac(1n, 2n) : v === -0.5 ? new Frac(-1n, 2n) : Fint(v));
            }
            const z = this.memo.get(`zeta:${m}`);
            if (z) { const w = z.pow(Number(k)); return w.add(w.inv()).mul(K.fromFrac(new Frac(1n, 2n))); }
            // 2cos(kθ) = V_k(2cos θ), V₀ = 2, V₁ = t, V_{j+1} = t·V_j − V_{j−1}
            const t = this.cosGen(m).mul(K.fromInt(2));
            let V0 = K.fromInt(2), V1 = t;
            if (k === 0n) return K.one();
            for (let j = 1; j < Number(k); j++) { const V2 = t.mul(V1).sub(V0); V0 = V1; V1 = V2; }
            return V1.mul(K.fromFrac(new Frac(1n, 2n)));
        };
        const half = new Frac(1n, 2n);
        const cos = () => cosAt(q), sin = () => cosAt(half.sub(q));
        const nz = (x, what) => { if (x.isZero()) throw new Error(`${what} is undefined here`); return x; };
        switch (f) {
            case 'cos': return cos();
            case 'sin': return sin();
            case 'tan': return sin().div(nz(cos(), 'tan'));
            case 'sec': return nz(cos(), 'sec').inv();
            case 'csc': return nz(sin(), 'csc').inv();
            case 'cot': return cos().div(nz(sin(), 'cot'));
        }
        throw new Error('internal: unknown trigonometric function');
    }

    /** An r-th root of x: principal, or the real root of a real x for odd r when realOdd. */
    radical(x, r, realOdd, label) {
        const K = this.K;
        if (x.isZero()) return K.zero();
        const q = x.rational();
        if (q) {
            const s = ratRoot(q, r, realOdd);
            if (s) return K.fromFrac(s);
        }
        const key = `rad:${r}:${realOdd ? 1 : 0}:${x.key()}`;
        if (this.memo.has(key)) return this.memo.get(key);
        const approx = croot(x.embed(), r, realOdd);
        const P = [x.neg(), ...new Array(r - 1).fill(K.zero()), K.one()];
        const v = K.adjoinRoot(P, approx, label);
        this.memo.set(key, v);
        return v;
    }
}

/**
 * The AST as a + b·i + (c + d·i)·π with a, b, c, d rational, or null. Constants
 * qualify when their value is rational plus a rational multiple of π.
 */
function gaussPi(a, scope) {
    const Z = { a: F0, b: F0, c: F0, d: F0 };
    const gp = (b) => gaussPi(b, scope);
    switch (a.t) {
        case 'num': return { ...Z, a: a.v };
        case 'i': return { ...Z, b: F1 };
        case 'const': return a.c === 'pi' ? { ...Z, c: F1 } : null;
        case 'var': {
            const v = scope.get(a.name);
            if (!v) return null;
            const x = v.x.rational(), c = v.c ? v.c.rational() : F0;
            return x && c ? { ...Z, a: x, c } : null;
        }
        case 'neg': { const v = gp(a.a); return v && { a: v.a.neg(), b: v.b.neg(), c: v.c.neg(), d: v.d.neg() }; }
        case 'add': case 'sub': {
            const u = gp(a.a), v = gp(a.b);
            if (!u || !v) return null;
            const op = a.t === 'add' ? 'add' : 'sub';
            return { a: u.a[op](v.a), b: u.b[op](v.b), c: u.c[op](v.c), d: u.d[op](v.d) };
        }
        case 'mul': {
            const u = gp(a.a), v = gp(a.b);
            if (!u || !v) return null;
            const uPi = !u.c.isZero() || !u.d.isZero(), vPi = !v.c.isZero() || !v.d.isZero();
            if (uPi && vPi) return null;
            const gm = (p, q, r, s) => [p.mul(r).sub(q.mul(s)), p.mul(s).add(q.mul(r))];   // (p+qi)(r+si)
            const [a0, b0] = gm(u.a, u.b, v.a, v.b);
            const [c1, d1] = gm(u.a, u.b, v.c, v.d), [c2, d2] = gm(u.c, u.d, v.a, v.b);
            return { a: a0, b: b0, c: c1.add(c2), d: d1.add(d2) };
        }
        case 'div': {
            const u = gp(a.a), v = gp(a.b);
            if (!u || !v || !v.c.isZero() || !v.d.isZero()) return null;
            const n = v.a.mul(v.a).add(v.b.mul(v.b));
            if (n.isZero()) return null;
            const ra = v.a.div(n), rb = v.b.neg().div(n);                             // 1/(a+bi)
            const gm = (p, q) => [p.mul(ra).sub(q.mul(rb)), p.mul(rb).add(q.mul(ra))];
            const [a0, b0] = gm(u.a, u.b), [c0, d0] = gm(u.c, u.d);
            return { a: a0, b: b0, c: c0, d: d0 };
        }
    }
    return null;
}

/** An exact rational r-th root of q matching the principal (or real-odd) branch, else null. */
function ratRoot(q, r, realOdd) {
    const neg = q.p < 0n;
    if (neg && !(realOdd && r % 2 === 1)) return null;
    const a = iroot(neg ? -q.p : q.p, r), b = iroot(q.q, r);
    if (a === null || b === null) return null;
    return new Frac(neg ? -a : a, b);
}
function iroot(n, r) {
    if (n < 2n) return n;
    let x = BigInt(Math.round(Math.pow(Number(n), 1 / r)));
    for (const d of [x - 1n, x, x + 1n]) if (d >= 0n && d ** BigInt(r) === n) return d;
    if (Number.isFinite(Number(n))) return null;
    // very large n: Newton
    x = 1n << BigInt(Math.ceil(n.toString(2).length / r));
    for (;;) {
        const y = ((BigInt(r) - 1n) * x + n / x ** BigInt(r - 1)) / BigInt(r);
        if (y >= x) break;
        x = y;
    }
    return x ** BigInt(r) === n ? x : null;
}

// ---------------- polynomials in a named variable ----------------

function mentions(a, name) {
    if (!a) return false;
    if (a.t === 'var' && a.name === name) return true;
    for (const k of ['a', 'b', 'e', 'index', 'base']) if (a[k] && mentions(a[k], name)) return true;
    return !!(a.args && a.args.some(y => mentions(y, name)));
}

/** Coefficients (low → high) of the AST as a polynomial in `name`, over the ring R. */
function polyOf(a, name, R) {
    if (!mentions(a, name)) return [R.leaf(a)];
    const add = (p, q, sub = false) => {
        const out = [];
        for (let i = 0; i < Math.max(p.length, q.length); i++) {
            const x = i < p.length ? p[i] : R.zero(), y = i < q.length ? q[i] : R.zero();
            out.push(sub ? R.sub(x, y) : R.add(x, y));
        }
        return out;
    };
    const mul = (p, q) => {
        const out = Array.from({ length: p.length + q.length - 1 }, () => R.zero());
        p.forEach((x, i) => q.forEach((y, j) => { out[i + j] = R.add(out[i + j], R.mul(x, y)); }));
        return out;
    };
    switch (a.t) {
        case 'var': return [R.zero(), R.one()];
        case 'neg': return polyOf(a.a, name, R).map(x => R.neg(x));
        case 'add': return add(polyOf(a.a, name, R), polyOf(a.b, name, R));
        case 'sub': return add(polyOf(a.a, name, R), polyOf(a.b, name, R), true);
        case 'mul': return mul(polyOf(a.a, name, R), polyOf(a.b, name, R));
        case 'div': {
            if (mentions(a.b, name)) throw new Error(`divide only by constants in a polynomial in ${plainName(name)}`);
            const d = R.leaf(a.b);
            return polyOf(a.a, name, R).map(x => R.div(x, d));
        }
        case 'pow': {
            if (mentions(a.e, name)) throw new Error(`the exponents of ${plainName(name)} must be whole numbers`);
            const n = R.int(a.e);
            if (n < 0 || n > 200) throw new Error(`the exponents of ${plainName(name)} must be whole numbers from 0 to 200`);
            const b = polyOf(a.a, name, R);
            let out = [R.one()];
            for (let k = 0; k < n; k++) out = mul(out, b);
            return out;
        }
    }
    throw new Error(`${plainName(name)} must appear polynomially (only + − × and whole powers)`);
}

/** Numerical roots of a polynomial in `name` with numeric coefficients (no constants). */
export function numericPolyRoots(src, name) {
    const ast = parse(src, new Set(name.length > 1 ? [name] : []));
    if (!ast) return [];
    const scope = new Map();
    const R = {
        leaf: (b) => numeric(b, scope), zero: () => C(0), one: () => C(1),
        add: cadd, sub: csub, mul: cmul, neg: (x) => C(-x.re, -x.im), div: cdiv,
        int: (b) => intOf(numeric(b, scope), 'an exponent'),
    };
    const pc = polyOf(ast, name, R);
    while (pc.length > 1 && cabs(pc[pc.length - 1]) === 0) pc.pop();
    return complexRoots(pc);
}

// ---------------- reading a group ----------------

const ENTRY = ['(1,1)', '(1,2)', '(2,1)', '(2,2)'];
const located = (where, prefix, e) => {
    const err = new Error(`${prefix}: ${e.message}`);
    err.where = where;
    return err;
};

/** Normalize a constants row: ['name', 'expr'] or { name, poly, near } → { kind, nameSrc, src, near }. */
function rowOf(row) {
    if (Array.isArray(row)) return { kind: 'value', nameSrc: row[0], src: row[1] };
    if (row && typeof row === 'object') {
        if ('poly' in row) return { kind: 'root', nameSrc: row.name, src: row.poly, near: row.near || null };
        return { kind: 'value', nameSrc: row.name, src: row.value };
    }
    throw new Error('internal: unreadable constant');
}

/**
 * Read a group: state = { mats: [[e11, e12, e21, e22], …], anti?: [bool], consts?: [row, …] }.
 * Returns
 *   { exact, field, gens, entries, roots, reason, reasonWhere }
 * with entries the complex values of every entry, gens ExactMat[] when exact,
 * and roots[i] = { roots, index } for each root row i (the menu of embeddings).
 * Syntax errors, unknown symbols and division by zero throw, with err.where
 * = { constant: i } or { gen: g, entry: k }.
 */
export function readGroup(state, { maxDegree = 32 } = {}) {
    const mats = state.mats || [], anti = state.anti || [], rowsIn = state.consts || [];

    // 1. names and syntax
    const rows = [];
    const names = new Set();
    rowsIn.forEach((raw, i) => {
        const r = rowOf(raw);
        try {
            const nm = parseName(r.nameSrc);
            if (!nm) {
                if (String(r.src || '').trim()) throw new Error('give the constant a name');
                return;
            }
            if (rows.some(o => o.name === nm.name)) throw new Error(`${plainName(nm.name)} is defined twice`);
            rows.push({ ...r, index: i, name: nm.name, tex: nm.tex });
            if (nm.name.length > 1 && !nm.name.startsWith('\\') && !nm.name.includes('_')) names.add(nm.name);
        } catch (e) { throw located({ constant: i }, `constant ${i + 1}`, e); }
    });
    for (const r of rows) {
        try {
            r.ast = parse(r.src, names);
            if (!r.ast) throw new Error(r.kind === 'root' ? `enter a polynomial in ${plainName(r.name)}` : `give ${plainName(r.name)} a value`);
        } catch (e) { throw located({ constant: r.index }, `constant ${plainName(r.name)}`, e); }
    }
    const asts = mats.map((m, g) => [0, 1, 2, 3].map(k => {
        try { return parse(String(m[k] ?? '0'), names) || { t: 'num', v: F0 }; }
        catch (e) { throw located({ gen: g, entry: k }, `g${g + 1}, entry ${ENTRY[k]}`, e); }
    }));

    // 2. floating point: always, for the root menus and as the fallback
    const scopeN = new Map(), roots = {};
    for (const r of rows) {
        try {
            if (r.kind === 'value') scopeN.set(r.name, numeric(r.ast, scopeN));
            else {
                const R = {
                    leaf: (b) => numeric(b, scopeN), zero: () => C(0), one: () => C(1),
                    add: cadd, sub: csub, mul: cmul, neg: (x) => C(-x.re, -x.im), div: cdiv,
                    int: (b) => intOf(numeric(b, scopeN), 'an exponent'),
                };
                const pc = polyOf(r.ast, r.name, R);
                while (pc.length > 1 && cabs(pc[pc.length - 1]) === 0) pc.pop();
                if (pc.length < 2) throw new Error(`${plainName(r.name)} must appear in its polynomial`);
                const rs = sortRoots(complexRoots(pc));
                const index = r.near ? nearestIndex(rs, r.near) : 0;
                roots[r.index] = { roots: rs, index };
                r.approx = rs[index];
                scopeN.set(r.name, rs[index]);
            }
            const v = scopeN.get(r.name);
            if (!Number.isFinite(v.re) || !Number.isFinite(v.im)) throw new Error('the value is not a finite number');
        } catch (e) { throw located({ constant: r.index }, `constant ${plainName(r.name)}`, e); }
    }

    // 3. exact
    let reason = null, reasonWhere = null, exact = null;
    const where = { current: null };
    try {
        exact = readExact(rows, asts, anti, maxDegree, where);
    } catch (e) {
        if (!(e instanceof NotExact)) {
            if (where.current) throw located(where.current.where, where.current.prefix, e);
            throw e;
        }
        reason = e.message;
        reasonWhere = where.current ? where.current.label : null;
    }

    let entries;
    if (exact) {
        entries = exact.gens.map(M => [M.a, M.b, M.c, M.d].map(x => x.embed()));
    } else {
        entries = asts.map((row, g) => row.map((ast, k) => {
            try {
                const z = numeric(ast, scopeN);
                if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) throw new Error('the value is not a finite number');
                return z;
            } catch (e) { throw located({ gen: g, entry: k }, `g${g + 1}, entry ${ENTRY[k]}`, e); }
        }));
    }
    return {
        exact: !!exact,
        field: exact ? exact.field : null,
        gens: exact ? exact.gens : null,
        entries, roots, reason, reasonWhere,
    };
}

function readExact(rows, asts, anti, maxDegree, where) {
    const X = new ExactReader(maxDegree), K = X.K;
    const scope = new Map();
    for (const r of rows) {
        const label = plainName(r.name);
        where.current = { where: { constant: r.index }, prefix: `constant ${label}`, label: `constant ${label}` };
        const before = K.height;
        if (r.kind === 'value') {
            const v = X.ev(r.ast, scope);
            scope.set(r.name, v);
            // A constant that is itself a new generator names its level.
            if (!v.c && K.height > before && v.x.equals(K.gen(K.height))) {
                K.levels[K.height].text = label;
                K.levels[K.height].tex = r.tex;
            }
        } else {
            const R = {
                leaf: (b) => X.alg(X.ev(b, scope)), zero: () => K.zero(), one: () => K.one(),
                add: (x, y) => x.add(y), sub: (x, y) => x.sub(y), mul: (x, y) => x.mul(y), neg: (x) => x.neg(),
                div: (x, y) => { if (y.isZero()) throw new Error('division by zero'); return x.div(y); },
                int: (b) => {
                    const q = X.alg(X.ev(b, scope)).rational();
                    if (!q || q.q !== 1n) throw new Error('exponents must be whole numbers');
                    return Number(q.p);
                },
            };
            const P = polyOf(r.ast, r.name, R);
            const x = K.adjoinRoot(P, r.approx, { text: label, tex: r.tex });
            scope.set(r.name, X.V(x));
        }
    }
    const ents = asts.map((row, g) => row.map((ast, k) => {
        const label = `g${g + 1}, entry ${ENTRY[k]}`;
        where.current = { where: { gen: g, entry: k }, prefix: label, label };
        return X.alg(X.ev(ast, scope));
    }));
    where.current = null;
    if (anti.some(Boolean) || X.usedConj) K.ensureConj();
    const gens = ents.map((e, g) => {
        const [a, b, c, d] = e.map(x => K.lift(x));
        const M = new ExactMat(a, b, c, d, !!anti[g]);
        if (M.det().isZero()) {
            const err = new Error(`g${g + 1} has determinant 0 (not invertible)`);
            err.where = { gen: g };
            throw err;
        }
        return M;
    });
    return { field: K, gens };
}
