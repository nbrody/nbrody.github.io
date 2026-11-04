// Words: braid words (signed generator indices ±1, ±2, …) and words in the
// free group π1 (signed letters ±1 = x_1^{±1}, …), their LaTeX, and the
// Artin action of the braid group on π1.

'use strict';

export function freeReduce(w) {
    const st = [];
    for (const c of w) {
        if (st.length && st[st.length - 1] === -c) st.pop();
        else st.push(c);
    }
    return st;
}

export function cyclicReduce(w) {
    const st = freeReduce(w);
    let i = 0, j = st.length - 1;
    while (i < j && st[i] === -st[j]) { i++; j--; }
    return st.slice(i, j + 1);
}

export function inverse(w) {
    return w.slice().reverse().map(c => -c);
}

// letters ordered a < b < c < … < ā < b̄ < …
function rank(c) { return c > 0 ? c : 1000 - c; }

// least rotation (Booth), as an index
function leastRotation(w) {
    const n = w.length;
    if (n === 0) return 0;
    const s = w.concat(w).map(rank);
    const f = new Array(2 * n).fill(-1);
    let k = 0;
    for (let j = 1; j < 2 * n; j++) {
        const sj = s[j];
        let i = f[j - k - 1];
        while (i !== -1 && sj !== s[k + i + 1]) {
            if (sj < s[k + i + 1]) k = j - i - 1;
            i = f[i];
        }
        if (sj !== s[k + i + 1]) {
            if (sj < s[k]) k = j;
            f[j - k] = -1;
        } else f[j - k] = i + 1;
    }
    return k;
}

function rotate(w, k) { return w.slice(k).concat(w.slice(0, k)); }

function lexLess(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (rank(a[i]) !== rank(b[i])) return rank(a[i]) < rank(b[i]);
    }
    return a.length < b.length;
}

// A representative of the unoriented free homotopy class: the least rotation
// of w or of w⁻¹.
export function canonicalCyclic(w) {
    const r = cyclicReduce(w);
    const a = rotate(r, leastRotation(r));
    const ri = inverse(r);
    const b = rotate(ri, leastRotation(ri));
    return lexLess(b, a) ? b : a;
}

export function sameCyclic(u, v) {
    const a = canonicalCyclic(u), b = canonicalCyclic(v);
    return a.length === b.length && a.every((c, i) => c === b[i]);
}

// σ_i (i ≥ 1, sign ±1) acting on π1 of the plane minus punctures 1..n, with
// x_j the loop crossing the upward ray from puncture j left to right. For the
// counterclockwise half twist σ_i: x_i ↦ x_{i+1}, x_{i+1} ↦ x_{i+1}⁻¹ x_i x_{i+1}.
// (Checked against the solver in tests/engine.test.mjs.)
export function artin(w, i, sign) {
    const out = [];
    for (const c of w) {
        const j = Math.abs(c), s = Math.sign(c);
        let img;
        if (sign < 0) {
            if (j === i) img = [i, i + 1, -i];
            else if (j === i + 1) img = [i];
            else img = [j];
        } else {
            if (j === i) img = [i + 1];
            else if (j === i + 1) img = [-(i + 1), i, i + 1];
            else img = [j];
        }
        if (s < 0) img = inverse(img);
        out.push(...img);
    }
    return cyclicReduce(out);
}

export function artinWord(w, braid) {
    let u = w;
    for (const g of braid) u = artin(u, Math.abs(g), Math.sign(g));
    return u;
}

// ------------------------------------------------------------------ LaTeX

export function letterTex(c) {
    const j = Math.abs(c);
    const base = j <= 26 ? String.fromCharCode(96 + j) : `x_{${j}}`;
    return c > 0 ? base : `\\bar{${base}}`;
}

// π1 word, compressed into powers, truncated after maxLetters letters
export function wordTex(w, maxLetters = 80) {
    if (!w.length) return '1';
    const parts = [];
    let shown = 0;
    for (let k = 0; k < w.length && shown < maxLetters;) {
        let m = 1;
        while (k + m < w.length && w[k + m] === w[k]) m++;
        parts.push(m > 1 ? `${letterTex(w[k])}^{${m}}` : letterTex(w[k]));
        shown += m;
        k += m;
    }
    let s = parts.join('\\,');
    if (shown < w.length) s += '\\,\\cdots';
    return s;
}

export function braidTex(b, maxGens = 40) {
    if (!b.length) return '1';
    const parts = [];
    let k = 0;
    while (k < b.length && parts.length < maxGens) {
        let m = 1;
        while (k + m < b.length && b[k + m] === b[k]) m++;
        const i = Math.abs(b[k]), e = Math.sign(b[k]) * m;
        parts.push(e === 1 ? `\\sigma_{${i}}` : `\\sigma_{${i}}^{${e}}`);
        k += m;
    }
    let s = parts.join('');
    if (k < b.length) s += '\\cdots';
    return s;
}

// Parse a braid word typed in MathQuill, e.g.
//   \sigma_1\sigma_2^{-1}   \left(\sigma_1\sigma_2^{-1}\right)^3   \sigma_{12}^2
// Also accepts s_1 for σ_1. Returns signed indices or throws.
export function parseBraid(tex) {
    let s = String(tex)
        .replace(/\\left|\\right/g, '')
        .replace(/\\cdot|\\,|\\ |\\:|\\;|\\!|~/g, ' ')
        .replace(/\\sigma|σ|\\operatorname\{s\}/g, 's')
        .replace(/\\lbrack|\\\[/g, '(').replace(/\\rbrack|\\\]/g, ')')
        .replace(/\\\{/g, '(').replace(/\\\}/g, ')')
        .replace(/\[/g, '(').replace(/\]/g, ')');
    let pos = 0;
    const peek = () => { while (s[pos] === ' ') pos++; return s[pos]; };
    const fail = msg => { throw new Error(msg); };
    const readInt = () => {
        peek();
        let sign = 1;
        if (s[pos] === '-') { sign = -1; pos++; peek(); }
        else if (s[pos] === '+') { pos++; peek(); }
        const m = /^\d+/.exec(s.slice(pos));
        if (!m) fail('Expected a number.');
        pos += m[0].length;
        return sign * parseInt(m[0], 10);
    };
    const readGroupInt = () => {          // {12} or a single digit
        if (peek() === '{') { pos++; const v = readInt(); if (peek() !== '}') fail('Expected }.'); pos++; return v; }
        peek();
        if (s[pos] === '-') { pos++; const m = /^\d/.exec(s.slice(pos)); if (!m) fail('Expected a number.'); pos++; return -parseInt(m[0], 10); }
        const m = /^\d/.exec(s.slice(pos));
        if (!m) fail('Expected a number.');
        pos++;
        return parseInt(m[0], 10);
    };
    const parseSeq = () => {
        const out = [];
        for (;;) {
            const c = peek();
            if (c === undefined || c === ')' || c === '}') return out;
            let item;
            if (c === 's') {
                pos++;
                if (peek() !== '_') fail('Write generators as \\sigma_i.');
                pos++;
                const i = readGroupInt();
                if (i < 1) fail('Generator indices start at 1.');
                item = [i];
            } else if (c === '(' || c === '{') {
                pos++;
                item = parseSeq();
                const close = peek();
                if (close !== ')' && close !== '}') fail('Unbalanced parentheses.');
                pos++;
            } else if (c === '1') { pos++; item = []; }
            else fail(`Unexpected “${c}”.`);
            if (peek() === '^') {
                pos++;
                const e = readGroupInt();
                const base = item;
                item = [];
                const piece = e < 0 ? base.slice().reverse().map(g => -g) : base;
                for (let k = 0; k < Math.abs(e); k++) item.push(...piece);
            }
            out.push(...item);
            if (out.length > 5000) fail('That braid word is too long.');
        }
    };
    const w = parseSeq();
    if (peek() !== undefined) fail('Unbalanced parentheses.');
    return w;
}

// integers in a MathQuill field: "(-5;3)", "-5, 3", "(1,2;-1,0)"
export function parseIntLists(tex) {
    const s = String(tex).replace(/\\left|\\right/g, '').replace(/[(){}\[\]]/g, ' ').replace(/\\,/g, ' ');
    const halves = s.split(';');
    const nums = part => (part.match(/[-−]?\s*\d+/g) || []).map(t => parseInt(t.replace(/[\s−]/g, m => (m === '−' ? '-' : '')), 10));
    return halves.map(nums);
}
