// Read a matrix entry — a rational function of t over ℚ — from MathQuill's LaTeX. Accepts numbers
// and decimals, t, + − · × /, implicit products, powers t^{n} with n of either sign,
// parentheses (with or without \left \right), and \frac{…}{…}. Returns { num, den }, reduced,
// with den monic.
import { Q } from './rational.js';
import { padd, pneg, pmul, pscale, pdivmod, pgcd, trim } from './poly.js';

function tokenize(src) {
    const s = src.replace(/\\left|\\right/g, '').replace(/\\[,;:! ]|\\quad|\\qquad/g, ' ');
    const out = [];
    for (let i = 0; i < s.length;) {
        const ch = s[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (/[0-9.]/.test(ch)) {
            const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
            if (!m) throw new Error(`cannot read "${s.slice(i, i + 6)}"`);
            out.push({ k: 'num', q: Q.decimal(m[1]) });
            i += m[1].length;
            continue;
        }
        if (ch === '\\') {
            const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
            const cmd = m ? m[1] : s[i + 1];
            i += m ? m[0].length : 2;
            if (cmd === 'cdot' || cmd === 'times' || cmd === 'ast') out.push({ k: '*' });
            else if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') out.push({ k: 'frac' });
            else throw new Error(`unknown command \\${cmd}`);
            continue;
        }
        if (ch === 't') { out.push({ k: 't' }); i++; continue; }
        if ('+-*/^(){}[]'.includes(ch)) { out.push({ k: ch === '[' ? '(' : ch === ']' ? ')' : ch }); i++; continue; }
        if (ch === '−') { out.push({ k: '-' }); i++; continue; }
        throw new Error(/[a-zA-Z]/.test(ch) ? `only the variable t is allowed (found "${ch}")` : `unexpected "${ch}"`);
    }
    return out;
}

// ---------- ℚ(t) as reduced fractions ----------
function norm(n, d) {
    d = trim(d);
    if (!d.length) throw new Error('division by zero');
    n = trim(n);
    if (!n.length) return { num: [], den: [Q.ONE] };
    const g = pgcd(n, d);
    if (g.length > 1) { n = pdivmod(n, g)[0]; d = pdivmod(d, g)[0]; }
    const lc = d[d.length - 1].inv();
    return { num: pscale(n, lc), den: pscale(d, lc) };
}
const C = (q) => norm([q], [Q.ONE]);
const add = (x, y) => norm(padd(pmul(x.num, y.den), pmul(y.num, x.den)), pmul(x.den, y.den));
const neg = (x) => ({ num: pneg(x.num), den: x.den });
const mul = (x, y) => norm(pmul(x.num, y.num), pmul(x.den, y.den));
const div = (x, y) => { if (!y.num.length) throw new Error('division by zero'); return norm(pmul(x.num, y.den), pmul(x.den, y.num)); };
const constOf = (x) => (x.num.length <= 1 && x.den.length === 1 ? (x.num[0] || Q.ZERO) : null);

export function parseRat(src) {
    const toks = tokenize(String(src || ''));
    if (!toks.length) throw new Error('empty entry');
    let i = 0;
    const peek = () => toks[i] && toks[i].k;
    const want = (k) => { if (peek() !== k) throw new Error(`expected "${k}"`); i++; };
    const startsFactor = (k) => k === 'num' || k === 't' || k === '(' || k === '{' || k === 'frac';

    function expr() {
        let a = term();
        while (peek() === '+' || peek() === '-') {
            const op = toks[i++].k, b = term();
            a = add(a, op === '+' ? b : neg(b));
        }
        return a;
    }
    function term() {
        let a = unary();
        for (;;) {
            if (peek() === '*') { i++; a = mul(a, unary()); }
            else if (peek() === '/') { i++; a = div(a, unary()); }
            else if (startsFactor(peek())) a = mul(a, power());
            else return a;
        }
    }
    function unary() {
        if (peek() === '-') { i++; return neg(unary()); }
        if (peek() === '+') { i++; return unary(); }
        return power();
    }
    function power() {
        let b = atom();
        while (peek() === '^') {
            i++;
            let e;
            if (peek() === '{') { i++; e = constOf(expr()); want('}'); }
            else if (peek() === 'num') e = toks[i++].q;
            else if (peek() === '-' && toks[i + 1] && toks[i + 1].k === 'num') { i++; e = toks[i++].q.neg(); }
            else throw new Error('exponents must be whole numbers');
            if (!e || e.d !== 1n || e.n > 64n || e.n < -64n) throw new Error('exponents must be whole numbers from −64 to 64');
            let r = C(Q.ONE);
            const n = e.n < 0n ? -e.n : e.n;
            for (let k = 0n; k < n; k++) r = mul(r, b);
            b = e.n < 0n ? div(C(Q.ONE), r) : r;
        }
        return b;
    }
    function atom() {
        const k = peek();
        if (k === 'num') return C(toks[i++].q);
        if (k === 't') { i++; return { num: [Q.ZERO, Q.ONE], den: [Q.ONE] }; }
        if (k === '(' || k === '{') {
            i++;
            const a = expr();
            want(k === '(' ? ')' : '}');
            return a;
        }
        if (k === 'frac') {
            i++;
            want('{'); const num = expr(); want('}');
            want('{'); const den = expr(); want('}');
            return div(num, den);
        }
        throw new Error(k ? `unexpected "${k}"` : 'incomplete entry');
    }

    const a = expr();
    if (i < toks.length) throw new Error(`unexpected "${toks[i].k}"`);
    return a;
}

// A polynomial entry, or an error if the entry has a denominator.
export function parsePoly(src) {
    const { num, den } = parseRat(src);
    if (den.length > 1) throw new Error('expected a polynomial in t');
    return num;
}
