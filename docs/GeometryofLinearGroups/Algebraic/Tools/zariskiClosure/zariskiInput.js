/**
 * zariskiInput.js — the Zariski Closure page's structured input, as in Kleinian/poincare: generators as
 * 2×2 grids of entries (LaTeX from MathQuill, or plain text), named constants, and an optional number
 * field K = ℚ(w) given by a minimal polynomial and a choice of embedding.
 *
 * Entries are read by the Expression Parser's LaTeX parser and lowered to the exact atoms of pgl2Engine:
 * the field generator becomes a root of its polynomial at the chosen complex value, and radicals, i, ζ_n,
 * |·|, conjugates and trigonometric values at rational multiples of π mix freely with it.
 *
 * Depends on ../numberRings/ringEngine.js, pgl2Engine.js and ../expressionParser/exprEngine.js.
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const NR = isNode ? require('../numberRings/ringEngine.js') : root.NumberRingEngine;
const PG = isNode ? require('./pgl2Engine.js') : root.PGL2Engine;
const EE = isNode ? require('../expressionParser/exprEngine.js') : root.ExprEngine;
const X = NR._internal, EI = EE._internal;
const { Rat, R0 } = X;
const ENTRY = ['(1,1)', '(1,2)', '(2,1)', '(2,2)'];

// ─────────────────────── the number field ───────────────────────

/** Complex roots of an integer polynomial (BigInt, low → high): Durand–Kerner, then Newton; real roots first. */
function polyRoots(F) {
    const n = F.length - 1, lead = Number(F[n]), c = F.map((x) => Number(x) / lead);
    if (n === 1) return [{ re: -c[0], im: 0 }];
    const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
    const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
    const div = (a, b) => { const q = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / q, im: (a.im * b.re - a.re * b.im) / q }; };
    const ev = (z) => { let p = { re: 1, im: 0 }, d = { re: 0, im: 0 }; for (let k = n - 1; k >= 0; k--) { d = { re: d.re * z.re - d.im * z.im + p.re, im: d.re * z.im + d.im * z.re + p.im }; p = { re: p.re * z.re - p.im * z.im + c[k], im: p.re * z.im + p.im * z.re }; } return { p, d }; };
    const R = 1 + Math.max(...c.slice(0, n).map(Math.abs));
    let z = Array.from({ length: n }, (_, k) => ({ re: R * 0.8 * Math.cos(2 * Math.PI * k / n + 0.4), im: R * 0.8 * Math.sin(2 * Math.PI * k / n + 0.4) }));
    for (let it = 0; it < 3000; it++) {
        let moved = 0;
        z = z.map((zk, k) => {
            let den = { re: 1, im: 0 };
            z.forEach((zj, j) => { if (j !== k) den = mul(den, sub(zk, zj)); });
            const step = div(ev(zk).p, den);
            moved = Math.max(moved, Math.hypot(step.re, step.im));
            return sub(zk, step);
        });
        if (moved < 1e-14 * R) break;
    }
    z = z.map((r) => { for (let k = 0; k < 3; k++) { const { p, d } = ev(r); if (d.re || d.im) r = sub(r, div(p, d)); } return r; });
    const scale = Math.max(1, ...z.map((r) => Math.hypot(r.re, r.im)));
    const real = z.filter((r) => Math.abs(r.im) < 1e-9 * scale).map((r) => ({ re: r.re, im: 0 })).sort((a, b) => a.re - b.re);
    const key = (x) => Math.round(x / scale * 1e8);
    const cpx = z.filter((r) => Math.abs(r.im) >= 1e-9 * scale).sort((a, b) => key(a.re) - key(b.re) || b.im - a.im);
    return real.concat(cpx);
}

/** K = ℚ(w) from { gen, poly }: the name of w, its minimal polynomial and the menu of embeddings. */
function defineField(spec) {
    const genSrc = String(spec.gen || '').trim() || 'w';
    let nm;
    try { nm = EE.parseName(genSrc); } catch (e) { throw new Error(`generator: ${e.message}`); }
    if (!nm) throw new Error('name the generator, e.g. w');
    const polySrc = String(spec.poly || '').trim();
    if (!polySrc) throw new Error(`enter the minimal polynomial of ${nm.name}`);
    const letters = new Set();
    (function walk(a) { if (a.t === 'var') letters.add(a.name); for (const k of ['a', 'b', 'e']) if (a[k]) walk(a[k]); })(NR.parseExpr(polySrc));
    if (letters.size && /^[A-Za-z]$/.test(nm.name) && !letters.has(nm.name)) throw new Error(`write the polynomial in ${nm.name}`);
    let field;
    try { field = NR.defineField(polySrc); }
    catch (e) { throw new Error(e.message.replace(/\bf = /g, '').replace(/\bf\b/g, 'the polynomial').replace(/\bx\b/g, nm.name)); }
    const F = field.F;
    return {
        name: nm.name, tex: nm.tex, n: F.length - 1, F,
        poly: F.map((x) => new Rat(x)),
        polyTex: X.polyTex(F, nm.tex),
        roots: polyRoots(F),
        r1: field.r1, r2: field.r2,
    };
}
/** The embeddings of a field spec, for the page's menu: { ok, roots, n, polyTex } or { ok: false, error }. */
function fieldRoots(spec) {
    try { const K = defineField(spec); return { ok: true, roots: K.roots, n: K.n, polyTex: K.polyTex, name: K.name, r1: K.r1, r2: K.r2 }; }
    catch (e) { return { ok: false, error: e.message }; }
}
function pickRoot(roots, spec) {
    if (spec.root && Number.isFinite(spec.root.re)) {
        let best = 0, bd = Infinity;
        roots.forEach((r, i) => { const d = Math.hypot(r.re - spec.root.re, r.im - (spec.root.im || 0)); if (d < bd) { bd = d; best = i; } });
        return best;
    }
    const i = parseInt(spec.rootIndex, 10);
    return i >= 0 && i < roots.length ? i : 0;
}

// ─────────────────────── entries ───────────────────────

function located(where, msg) { const e = new Error(msg); e.where = where; return e; }
const freeLetters = (L, out = []) => {
    if (L.t === 'var') { if (!out.some((v) => v.name === L.name)) out.push(L); return out; }
    for (const k of ['a', 'b']) if (L[k]) freeLetters(L[k], out);
    return out;
};

/** Read one entry: parse, substitute constants and the field generator, lower to exact atoms. */
function readEntry(src, defs, hasField) {
    let ast = EE.parse(String(src || ''));
    if (!ast) return { t: 'num', v: R0 };
    ast = EI.substitute(ast, defs);
    let L;
    try { L = EI.lower(ast); }
    catch (e) { throw new Error(e instanceof EI.NotExact ? `not an algebraic number with an exact form here (${e.message})` : e.message); }
    const free = freeLetters(L);
    if (free.length) {
        const v = free[0];
        if (v.special) throw new Error(`${v.special === 'pi' ? 'π' : 'e'} is transcendental; entries must be algebraic numbers`);
        throw new Error(`unknown symbol ${v.name}: define it as a constant${hasField ? '' : ' or as the generator of a number field'}`);
    }
    return L;
}

/**
 * state = { gens: [[e11, e12, e21, e22], …], consts?: [[name, value], …], field?: { gen, poly, rootIndex?, root? } }
 * → the pgl2Engine analysis, plus { fieldDef } or { ok: false, error, where }.
 */
function analyze(state) {
    const defs = new Map(), first = [];
    let fieldDef = null;
    const hasField = !!(state.field && (String(state.field.poly || '').trim()));
    if (hasField) {
        let K;
        try { K = defineField(state.field); } catch (e) { return { ok: false, where: { field: true }, error: e.message }; }
        const ri = pickRoot(K.roots, state.field), root = K.roots[ri];
        const atom = PG.fieldGenAtom(K.name, K.tex, K.poly, root);
        first.push(atom);
        defs.set(K.name, { t: 'atom', node: atom, tex: K.tex, num: root });
        fieldDef = { name: K.name, tex: K.tex, n: K.n, polyTex: K.polyTex, root, rootIndex: ri, r1: K.r1, r2: K.r2 };
    }
    const consts = state.consts || [];
    for (let i = 0; i < consts.length; i++) {
        const [nameSrc, valSrc] = consts[i];
        if (!String(nameSrc || '').trim() && !String(valSrc || '').trim()) continue;
        try {
            const nm = EE.parseName(nameSrc);
            if (!nm) throw new Error('name the constant');
            if (defs.has(nm.name)) throw new Error(`${nm.name} is already defined`);
            const v = EE.parse(String(valSrc || ''));
            if (!v) throw new Error(`give ${nm.name} a value`);
            defs.set(nm.name, EI.substitute(v, defs));
        } catch (e) { return { ok: false, where: { constant: i }, error: `constant ${i + 1}: ${e.message}` }; }
    }
    const asts = [];
    for (let g = 0; g < state.gens.length; g++) {
        const row = [];
        for (let k = 0; k < 4; k++) {
            try { row.push(readEntry(state.gens[g][k], defs, hasField)); }
            catch (e) { return { ok: false, where: { gen: g, entry: k }, error: `g${g + 1}, entry ${ENTRY[k]}: ${e.message}` }; }
        }
        asts.push(row);
    }
    // adjoin the field only if some entry (or constant) actually uses its generator
    const usesGen = (a) => !!a && (a.t === 'gen' || ['a', 'b', 'e'].some((k) => a[k] && usesGen(a[k])));
    if (first.length && !asts.some((row) => row.some(usesGen))) { first.length = 0; if (fieldDef) fieldDef.unused = true; }
    let res;
    try { res = PG.analyzeAsts(asts, first); }
    catch (e) {
        const m = /^g(\S+) is singular/.exec(e.message);
        const g = m ? '₀₁₂₃₄₅₆₇₈₉'.indexOf(m[1].slice(-1)) - 1 : null;
        return { ok: false, where: g !== null && g >= 0 ? { gen: g } : null, error: e.message };
    }
    res.fieldDef = fieldDef;
    return res;
}

// ─────────────────────── the text format ───────────────────────

/** Split at top-level commas, respecting (), [], {}. */
function splitTop(s) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
        else if ((ch === ',' || ch === ';') && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out.map((x) => x.trim()).filter((x) => x.length);
}
/** "((a,b),(c,d))" → [a, b, c, d]; a bracket is a tuple only if it has a top-level comma. */
function flatten(s) {
    s = s.trim();
    const open = s[0], close = { '(': ')', '[': ']' }[open];
    if (close && s[s.length - 1] === close) {
        let depth = 0, matchEnd = -1;
        for (let i = 0; i < s.length; i++) {
            if ('([{'.includes(s[i])) depth++;
            else if (')]}'.includes(s[i])) { depth--; if (depth === 0) { matchEnd = i; break; } }
        }
        if (matchEnd === s.length - 1) {
            const inner = splitTop(s.slice(1, -1));
            if (inner.length > 1) return inner.flatMap(flatten);
        }
    }
    return [s];
}
const toLatex = (s) => { try { const a = EE.parse(s); return a ? EE.texOf(a) : '0'; } catch (e) { return s; } };
/** Parse "<((a,b),(c,d)), …>" into generators of LaTeX entries. */
function fromText(src) {
    let s = String(src || '').trim().replace(/^[<⟨]\s*/, '').replace(/\s*[>⟩]$/, '');
    const gens = [];
    for (const item of splitTop(s)) {
        const f = flatten(item);
        if (f.length === 4) gens.push(f);
        else if (f.length % 4 === 0 && /^[([]/.test(item)) for (let i = 0; i < f.length; i += 4) gens.push(f.slice(i, i + 4));
        else throw new Error(`each generator must be a 2×2 matrix (found ${f.length} entr${f.length === 1 ? 'y' : 'ies'} in “${item}”)`);
    }
    if (!gens.length) throw new Error('no generators found');
    return gens.map((g) => g.map(toLatex));
}

const api = { analyze, fieldRoots, fromText, toLatex, _internal: { polyRoots, defineField, splitTop, flatten } };
if (isNode) module.exports = api;
else root.ZariskiInput = api;
})(typeof self !== 'undefined' ? self : this);
