/**
 * rparse.js — Parse a MathQuill/LaTeX (or plain) string into an EXACT BigRational.
 *
 * Supports integers, decimals (1.25 → 5/4), + - * / , \frac{}{}, parentheses,
 * unary minus, implicit multiplication (2(3)), and integer powers a^n.
 * Throws on anything non-rational (e.g. \sqrt) — matrix entries must lie in ℚ.
 */

import { BigRational } from './rational.js';

function preprocess(s) {
    if (s == null) return '';
    s = String(s);
    s = s.replace(/\\left|\\right/g, '');
    s = s.replace(/−/g, '-');                 // unicode minus
    s = s.replace(/\\cdot|\\times/g, '*');
    s = s.replace(/\\div/g, '/');
    // \frac{A}{B} → ((A)/(B)), iterated for nesting (MUST precede backslash stripping)
    let prev;
    do {
        prev = s;
        s = s.replace(/\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '(($1)/($2))');
    } while (s !== prev);
    s = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)');  // a^{...} → a^(...)
    s = s.replace(/\\[,!;: ]/g, '');                // LaTeX thin/explicit spaces
    s = s.replace(/[{}\\]/g, '');                   // drop leftover braces / stray backslashes
    s = s.replace(/\s+/g, '');                      // collapse remaining whitespace
    return s;
}

function tokenize(s) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (ch === ' ') { i++; continue; }
        if ('+-*/()^'.includes(ch)) { toks.push(ch); i++; continue; }
        if (/[0-9.]/.test(ch)) {
            let j = i;
            while (j < s.length && /[0-9.]/.test(s[j])) j++;
            toks.push(s.slice(i, j));
            i = j;
            continue;
        }
        throw new Error(`Unexpected character "${ch}" — entries must be rational numbers`);
    }
    return toks;
}

function numberToRational(tok) {
    if (!/^\d*\.?\d*$/.test(tok) || tok === '.' || tok === '')
        throw new Error(`Bad number "${tok}"`);
    if (tok.includes('.')) {
        const [intPart, fracPart] = tok.split('.');
        const num = BigInt((intPart || '0') + (fracPart || ''));
        const den = 10n ** BigInt((fracPart || '').length);
        return new BigRational(num, den);
    }
    return new BigRational(BigInt(tok));
}

class Parser {
    constructor(toks) { this.toks = toks; this.pos = 0; }
    peek() { return this.toks[this.pos]; }
    next() { return this.toks[this.pos++]; }

    parse() {
        const v = this.expr();
        if (this.pos < this.toks.length) throw new Error(`Unexpected "${this.peek()}"`);
        return v;
    }
    expr() {
        let v = this.term();
        while (this.peek() === '+' || this.peek() === '-') {
            const op = this.next();
            const rhs = this.term();
            v = op === '+' ? v.add(rhs) : v.sub(rhs);
        }
        return v;
    }
    term() {
        let v = this.factor();
        for (;;) {
            const t = this.peek();
            if (t === '*' || t === '/') {
                this.next();
                const rhs = this.factor();
                v = t === '*' ? v.mul(rhs) : v.div(rhs);
            } else if (t === '(' || (t !== undefined && /^[0-9.]/.test(t))) {
                v = v.mul(this.factor());   // implicit multiplication
            } else break;
        }
        return v;
    }
    factor() {
        if (this.peek() === '-') { this.next(); return this.factor().neg(); }
        if (this.peek() === '+') { this.next(); return this.factor(); }
        return this.power();
    }
    power() {
        let base = this.primary();
        if (this.peek() === '^') {
            this.next();
            const exp = this.factor();
            if (!exp.isInteger()) throw new Error('Only integer powers are supported');
            base = base.pow(Number(exp.num));
        }
        return base;
    }
    primary() {
        const t = this.peek();
        if (t === '(') {
            this.next();
            const v = this.expr();
            if (this.next() !== ')') throw new Error('Missing ")"');
            return v;
        }
        if (t !== undefined && /^[0-9.]/.test(t)) return numberToRational(this.next());
        throw new Error('Expected a number');
    }
}

/** Parse a string to BigRational. Empty → 0. Throws on malformed/irrational input. */
export function parseRational(input) {
    const s = preprocess(input);
    if (s === '') return new BigRational(0n);
    const toks = tokenize(s);
    if (toks.length === 0) return new BigRational(0n);
    return new Parser(toks).parse();
}
