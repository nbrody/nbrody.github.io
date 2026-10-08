// Read a matrix entry — a rational function of t over ℚ — from MathQuill's LaTeX. Accepts numbers
// and decimals, t, + − · × /, implicit products, powers t^{n} with n of either sign,
// parentheses (with or without \left \right), and \frac{…}{…}. Returns { num, den }, reduced,
// with den monic.
import { Q } from './rational.js';
import { padd, pneg, pmul, pscale, pdivmod, pgcd, trim } from './poly.js';

// The coefficient field: ℚ by default; kengine.js passes ℚ(i) or ℚ(ω), whose generator may then
// be typed (i, or \omega in MathQuill).
const QF = { zero: Q.ZERO, one: Q.ONE, fromQ: (q) => q, theta: null, thetaTok: null, intOf: (x) => (x.d === 1n ? x.n : null) };

function tokenize(src, F) {
    const s = src.replace(/\\left|\\right/g, '').replace(/\\[,;:! ]|\\quad|\\qquad/g, ' ');
    const out = [];
    for (let i = 0; i < s.length;) {
        const ch = s[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (/[0-9.]/.test(ch)) {
            const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
            if (!m) throw new Error(`cannot read "${s.slice(i, i + 6)}"`);
            out.push({ k: 'num', q: F.fromQ(Q.decimal(m[1])) });
            i += m[1].length;
            continue;
        }
        if (ch === '\\') {
            // the longest known command at the front, so that \omegat reads as \omega t
            const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
            const word = m ? m[1] : s[i + 1];
            const cmd = ['tfrac', 'dfrac', 'frac', 'cdot', 'times', 'ast', 'omega'].find((c) => word.startsWith(c)) || word;
            i += 1 + cmd.length;
            if (cmd === 'cdot' || cmd === 'times' || cmd === 'ast') out.push({ k: '*' });
            else if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') out.push({ k: 'frac' });
            else if (cmd === 'omega' && F.thetaTok === 'omega') out.push({ k: 'theta' });
            else throw new Error(cmd === 'omega' ? 'ω is only defined over ℚ(ω)' : `unknown command \\${cmd}`);
            continue;
        }
        if (ch === 't') { out.push({ k: 't' }); i++; continue; }
        if (ch === 'i' && F.thetaTok === 'i') { out.push({ k: 'theta' }); i++; continue; }
        if (ch === 'ω' && F.thetaTok === 'omega') { out.push({ k: 'theta' }); i++; continue; }
        if ('+-*/^(){}[]'.includes(ch)) { out.push({ k: ch === '[' ? '(' : ch === ']' ? ')' : ch }); i++; continue; }
        if (ch === '−') { out.push({ k: '-' }); i++; continue; }
        if (ch === 'i' || ch === 'ω') throw new Error(`${ch} is only defined over ${ch === 'i' ? 'ℚ(i)' : 'ℚ(ω)'}: choose that field in the View tab`);
        throw new Error(/[a-zA-Z]/.test(ch) ? `only the variable t is allowed (found "${ch}")` : `unexpected "${ch}"`);
    }
    return out;
}

// ---------- k(t) as reduced fractions ----------
function fractions(F) {
    function norm(n, d) {
        d = trim(d);
        if (!d.length) throw new Error('division by zero');
        n = trim(n);
        if (!n.length) return { num: [], den: [F.one] };
        const g = pgcd(n, d);
        if (g.length > 1) { n = pdivmod(n, g)[0]; d = pdivmod(d, g)[0]; }
        const lc = d[d.length - 1].inv();
        return { num: pscale(n, lc), den: pscale(d, lc) };
    }
    return {
        C: (q) => norm([q], [F.one]),
        add: (x, y) => norm(padd(pmul(x.num, y.den), pmul(y.num, x.den)), pmul(x.den, y.den)),
        neg: (x) => ({ num: pneg(x.num), den: x.den }),
        mul: (x, y) => norm(pmul(x.num, y.num), pmul(x.den, y.den)),
        div: (x, y) => { if (!y.num.length) throw new Error('division by zero'); return norm(pmul(x.num, y.den), pmul(x.den, y.num)); },
        constOf: (x) => (x.num.length <= 1 && x.den.length === 1 ? (x.num[0] || F.zero) : null),
    };
}

export function parseRat(src, F) {
    if (!F || typeof F !== 'object') F = QF;                // (also when called as .map(parseRat))
    const { C, add, neg, mul, div, constOf } = fractions(F);
    const toks = tokenize(String(src || ''), F);
    if (!toks.length) throw new Error('empty entry');
    let i = 0;
    const peek = () => toks[i] && toks[i].k;
    const want = (k) => { if (peek() !== k) throw new Error(`expected "${k}"`); i++; };
    const startsFactor = (k) => k === 'num' || k === 't' || k === 'theta' || k === '(' || k === '{' || k === 'frac';
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
            const ei = e ? F.intOf(e) : null;
            if (ei === null || ei > 64n || ei < -64n) throw new Error('exponents must be whole numbers from −64 to 64');
            let r = C(F.one);
            const n = ei < 0n ? -ei : ei;
            for (let k = 0n; k < n; k++) r = mul(r, b);
            b = ei < 0n ? div(C(F.one), r) : r;
        }
        return b;
    }
    function atom() {
        const k = peek();
        if (k === 'num') return C(toks[i++].q);
        if (k === 't') { i++; return { num: [F.zero, F.one], den: [F.one] }; }
        if (k === 'theta') { i++; return C(F.theta); }
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
export function parsePoly(src, F) {
    const { num, den } = parseRat(src, F);
    if (den.length > 1) throw new Error('expected a polynomial in t');
    return num;
}
