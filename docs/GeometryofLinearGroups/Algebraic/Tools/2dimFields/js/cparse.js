// A complex number typed as an expression, for specializing t over ℚ(i) and ℚ(ω), where t may be
// set to any z ∈ ℂ^× (a transcendental one keeps the specialization faithful). Accepts decimals,
// i, π (pi, \pi), e, ω (omega, \omega) = e^{2πi/3}, + − · × * / ^, implicit products, parentheses,
// and exp, log, sqrt, sin, cos (with or without a backslash). Returns [re, im].
import { cm, ca, cs, cdiv, csqrt } from './cmobius.js';

const cexp = ([x, y]) => { const r = Math.exp(x); return [r * Math.cos(y), r * Math.sin(y)]; };
const clog = ([x, y]) => [Math.log(Math.hypot(x, y)), Math.atan2(y, x)];
const FUN = {
    exp: cexp, log: clog, ln: clog, sqrt: csqrt,
    sin: ([x, y]) => [Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y)],
    cos: ([x, y]) => [Math.cos(x) * Math.cosh(y), -Math.sin(x) * Math.sinh(y)],
};
const CONST = { i: [0, 1], pi: [Math.PI, 0], 'π': [Math.PI, 0], e: [Math.E, 0], omega: [-0.5, Math.sqrt(3) / 2], 'ω': [-0.5, Math.sqrt(3) / 2] };
const NAMES = [...Object.keys(FUN), ...Object.keys(CONST)].sort((a, b) => b.length - a.length);

function tokenize(src) {
    const s = src.replace(/\\left|\\right|\\cdot|\\times/g, (m) => (m.length > 6 ? '*' : '')).replace(/\\/g, '');
    const out = [];
    for (let i = 0; i < s.length;) {
        const ch = s[i];
        if (/\s/.test(ch)) { i++; continue; }
        const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
        if (m) { out.push({ k: 'num', v: [parseFloat(m[1]), 0] }); i += m[1].length; continue; }
        const name = NAMES.find((n) => s.startsWith(n, i));
        if (name) { out.push(FUN[name] ? { k: 'fun', f: FUN[name] } : { k: 'num', v: CONST[name] }); i += name.length; continue; }
        if ('+-*/^(){}'.includes(ch)) { out.push({ k: ch === '{' ? '(' : ch === '}' ? ')' : ch }); i++; continue; }
        if (ch === '−') { out.push({ k: '-' }); i++; continue; }
        if (ch === '·' || ch === '×') { out.push({ k: '*' }); i++; continue; }
        throw new Error(`cannot read "${s.slice(i, i + 6)}"`);
    }
    return out;
}

export function parseComplex(src) {
    const toks = tokenize(String(src || ''));
    if (!toks.length) throw new Error('empty value');
    let i = 0;
    const peek = () => toks[i] && toks[i].k;
    const starts = (k) => k === 'num' || k === 'fun' || k === '(';
    function expr() {
        let a = term();
        while (peek() === '+' || peek() === '-') { const op = toks[i++].k, b = term(); a = op === '+' ? ca(a, b) : cs(a, b); }
        return a;
    }
    function term() {
        let a = unary();
        for (;;) {
            if (peek() === '*' || peek() === '/') { const op = toks[i++].k, b = unary(); a = op === '*' ? cm(a, b) : cdiv(a, b); }
            else if (starts(peek())) a = cm(a, power());          // an implicit product, as in 2i or 3pi
            else return a;
        }
    }
    function unary() {
        if (peek() === '-') { i++; const a = unary(); return [-a[0], -a[1]]; }
        if (peek() === '+') { i++; return unary(); }
        return power();
    }
    function power() {
        const a = atom();
        if (peek() !== '^') return a;
        i++;
        const b = unary();
        if (!b[1] && Number.isInteger(b[0]) && Math.abs(b[0]) <= 64) {    // exactly, for small integer powers
            let r = [1, 0];
            for (let k = 0; k < Math.abs(b[0]); k++) r = cm(r, a);
            return b[0] < 0 ? cdiv([1, 0], r) : r;
        }
        return cexp(cm(b, clog(a)));
    }
    function atom() {
        const t = toks[i++];
        if (!t) throw new Error('the value ends too soon');
        if (t.k === 'num') return t.v;
        if (t.k === '(') { const a = expr(); if (peek() !== ')') throw new Error('a parenthesis is not closed'); i++; return a; }
        if (t.k === 'fun') return t.f(peek() === '(' ? atom() : power());
        throw new Error(`unexpected "${t.k}"`);
    }
    const z = expr();
    if (i < toks.length) throw new Error(`unexpected "${toks[i].k}"`);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) throw new Error('the value is not a finite number');
    return z;
}

// z for display: up to four decimals, with the imaginary part as ±…i.
export function complexName([x, y]) {
    const f = (v) => String(Math.round(v * 1e4) / 1e4);
    if (Math.abs(y) < 5e-13) return f(x).replace('-', '−');
    const im = Math.abs(Math.abs(y) - 1) < 5e-13 ? 'i' : `${f(Math.abs(y))}i`;
    if (Math.abs(x) < 5e-13) return (y < 0 ? '−' : '') + im;
    return `${f(x).replace('-', '−')} ${y < 0 ? '−' : '+'} ${im}`;
}
