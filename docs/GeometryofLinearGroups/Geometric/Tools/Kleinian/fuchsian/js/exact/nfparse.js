/**
 * nfparse.js — detect a single algebraic atom (√d or 2cos(π/q)) across matrix entries,
 * build the field ℚ(α), and parse each entry to an NFElement (expression in α).
 */
import { BigRational } from './rational.js';
import { buildField, sqrtData } from './nffield.js';

/** Scan all entry LaTeX strings for atoms. → null (pure ℚ) | {atom} | {error}. */
export function detectAtom(latexes) {
    const sigs = new Map();           // signature → atom
    for (const L of latexes) {
        const s = String(L || '');
        let m;
        const reSqrt = /\\sqrt\s*\{\s*(\d+)\s*\}/g;
        while ((m = reSqrt.exec(s))) {
            const d = parseInt(m[1], 10), { D } = sqrtData(d) || {};
            if (D && D !== 1) sigs.set('sqrt:' + D, { kind: 'sqrt', d: D });
        }
        if (/\\cos/.test(s)) {
            const mq = s.match(/\\frac\s*\{\s*\\pi\s*\}\s*\{\s*(\d+)\s*\}/) || s.match(/\\?pi\s*\/\s*(\d+)/);
            if (mq) { const q = parseInt(mq[1], 10); if (q >= 3) sigs.set('cos2:' + q, { kind: 'cos2', q }); }
        }
    }
    if (sigs.size === 0) return null;
    if (sigs.size > 1) return { error: 'multiple', sigs: [...sigs.keys()] };
    return { atom: [...sigs.values()][0] };
}

export function makeContext(atom) {
    const f = buildField(atom);       // { field, embed, alpha, label, degree }
    return { ...f, atom };
}

// ---- expression parser over NFElement, with '@' = the field generator α ----
function replaceAtoms(latex, ctx) {
    let s = String(latex || '');
    if (ctx.atom.kind === 'cos2') {
        s = s.replace(/(2\s*)?\\cos\s*(?:\\left)?\s*\(?\s*\\frac\s*\{\s*\\pi\s*\}\s*\{\s*\d+\s*\}\s*(?:\\right)?\s*\)?/g,
            (mm, two) => (two ? '(@)' : '((@)/2)'));
    } else if (ctx.atom.kind === 'sqrt') {
        s = s.replace(/\\sqrt\s*\{\s*(\d+)\s*\}/g, (mm, dd) => {
            const { k } = sqrtData(parseInt(dd, 10));      // √d = k·√D, α=√D
            return k === 1 ? '(@)' : `(${k}*(@))`;
        });
    }
    return s;
}
function preprocess(s) {
    s = s.replace(/\\left|\\right/g, '').replace(/−/g, '-').replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/');
    let prev;
    do { prev = s; s = s.replace(/\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '(($1)/($2))'); } while (s !== prev);
    s = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)');
    s = s.replace(/[{}\\]/g, '').replace(/\s+/g, '');
    return s;
}
function numToRat(tok) {
    if (tok.includes('.')) { const [i, f] = tok.split('.'); return new BigRational(BigInt((i || '0') + (f || '')), 10n ** BigInt((f || '').length)); }
    return new BigRational(BigInt(tok));
}
function tokenize(s) {
    const t = []; let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === ' ') { i++; continue; }
        if ('+-*/()^@'.includes(c)) { t.push(c); i++; continue; }
        if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; t.push(s.slice(i, j)); i = j; continue; }
        throw new Error(`Unexpected character "${c}"`);
    }
    return t;
}

export function parseEntry(latex, ctx) {
    const F = ctx.field;
    const toks = tokenize(preprocess(replaceAtoms(latex, ctx)));
    let pos = 0;
    const peek = () => toks[pos], next = () => toks[pos++];
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(); const r = term(); v = op === '+' ? v.add(r) : v.sub(r); } return v; }
    function term() {
        let v = factor();
        for (; ;) { const t = peek(); if (t === '*' || t === '/') { next(); const r = factor(); v = t === '*' ? v.mul(r) : v.div(r); } else if (t === '(' || t === '@' || (t !== undefined && /^[0-9.]/.test(t))) { v = v.mul(factor()); } else break; }
        return v;
    }
    function factor() { if (peek() === '-') { next(); return factor().neg(); } if (peek() === '+') { next(); return factor(); } return power(); }
    function power() { let b = primary(); if (peek() === '^') { next(); const e = factor(); if (!e.isRational() || !e.coeffs[0].isInteger()) throw new Error('integer powers only'); b = b.pow(Number(e.coeffs[0].num)); } return b; }
    function primary() {
        const t = peek();
        if (t === '(') { next(); const v = expr(); if (next() !== ')') throw new Error('missing )'); return v; }
        if (t === '@') { next(); return ctx.alpha; }
        if (t !== undefined && /^[0-9.]/.test(t)) return F.fromRational(numToRat(next()));
        throw new Error('expected number or α');
    }
    if (toks.length === 0) return F.fromRational(new BigRational(0n));
    const v = expr();
    if (pos < toks.length) throw new Error(`unexpected "${peek()}"`);
    return v;
}
