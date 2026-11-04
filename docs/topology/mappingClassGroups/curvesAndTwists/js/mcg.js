// mcg.js — the Humphries curves, words in Dehn twists, and presentations of Mod(S_g).
// Words are in functional order: T_1 T_2 means "T_2 first, then T_1".
import { Curve } from './curve.js';
import { twist, sameCurve, intersectionNumber } from './twist.js';

// π₁-words of the chain c_1 … c_{2g+1} and of c_0 (letters: 2k−1 = a_k, 2k = b_k)
export function chainWords(g) {
    const w = { c0: [3], c1: [1], c2: [2] };
    for (let k = 1; k < g; k++) {
        w['c' + (2 * k + 1)] = [2 * k - 1, 2 * k, -(2 * k + 1), -2 * k];   // d_k = a_k b_k a_{k+1}⁻¹ b_k⁻¹
        w['c' + (2 * k + 2)] = [2 * k + 2];                // b_{k+1}
    }
    w['c' + (2 * g + 1)] = [2 * g - 1];                    // a_g
    return w;
}

export function curveFromWord(S, word) {
    const c = Curve.fromWord(S, word);
    c.relax({ maxSteps: 3000 });
    return c;
}

// ---------------------------------------------------------------- twist words
// A twist word is an array of {c: curve name, e: ±1}. The text form is like
// "(1 2 3)^4 -0 b0": numbers are c_i, other names are auxiliary curves, "-" inverts.
export function parseTwists(text) {
    const toks = text.match(/\(|\)|\^-?\d+|-?[A-Za-z_]*\d*/g).filter(Boolean);
    let i = 0;
    function seq() {
        const out = [];
        while (i < toks.length && toks[i] !== ')') {
            let item;
            const t = toks[i++];
            if (t === '(') { item = seq(); i++; }
            else {
                const neg = t[0] === '-';
                const name = neg ? t.slice(1) : t;
                item = [{ c: /^\d+$/.test(name) ? 'c' + name : name, e: neg ? -1 : 1 }];
            }
            if (i < toks.length && toks[i][0] === '^') {
                const p = parseInt(toks[i++].slice(1), 10);
                const base = p < 0 ? invert(item) : item;
                item = [];
                for (let r = 0; r < Math.abs(p); r++) item = item.concat(base);
            }
            out.push(...item);
        }
        return out;
    }
    return seq();
}
export const invert = w => w.slice().reverse().map(x => ({ c: x.c, e: -x.e }));

export function twistTex(w) {
    // group runs of equal letters as powers
    const parts = [];
    for (let i = 0; i < w.length;) {
        let j = i, s = 0;
        while (j < w.length && w[j].c === w[i].c && Math.sign(w[j].e) === Math.sign(w[i].e)) { s += w[j].e; j++; }
        const sub = /^c\d+$/.test(w[i].c) ? w[i].c.slice(1) : /^g\d+$/.test(w[i].c) ? `\\gamma_{${w[i].c.slice(1)}}` : w[i].c.replace(/^([a-z]+)(\d+)$/, '$1_$2');
        parts.push(`T_{${sub}}` + (s === 1 ? '' : `^{${s}}`));
        i = j;
    }
    return parts.length ? parts.join(' ') : '1';
}

// apply a twist word to a curve (rightmost letter first)
export function applyTwists(word, x, curves, opts = {}) {
    for (let i = word.length - 1; i >= 0; i--) {
        const c = curves[word[i].c];
        if (!c) throw new Error('unknown curve ' + word[i].c);
        if (sameCurve(x, c) !== 0) continue;
        x = twist(x, c, word[i].e, opts);
        if (opts.onStep) opts.onStep(word.length - i, word.length);
    }
    return x;
}

// ---------------------------------------------------------------- presentations
// Each relation is lhs = rhs. Auxiliary curves are images of generator curves under
// twist words; they are what Wajnryb's formulas say, checked by verify() below.
export function presentation(g) {
    const rel = [], gens = [];
    const pairs = [];
    if (g === 2) {
        for (let i = 1; i <= 5; i++) gens.push('c' + i);
        for (let i = 1; i <= 5; i++) for (let j = i + 1; j <= 5; j++) pairs.push([i, j, j === i + 1]);
    } else {
        for (let i = 0; i <= 2 * g; i++) gens.push('c' + i);
        const meet = (i, j) => (i > 0 && j > 0 && Math.abs(i - j) === 1) || (i === 0 && j === 4) || (j === 0 && i === 4);
        for (let i = 0; i <= 2 * g; i++) for (let j = i + 1; j <= 2 * g; j++) pairs.push([i, j, meet(i, j)]);
    }
    for (const [i, j, m] of pairs) {
        if (m) rel.push({ kind: 'braid', lhs: `${i} ${j} ${i}`, rhs: `${j} ${i} ${j}` });
        else rel.push({ kind: 'disjoint', lhs: `${i} ${j}`, rhs: `${j} ${i}` });
    }
    const aux = {};
    if (g === 2) {
        rel.push({ kind: 'chain', name: 'Chain relation', lhs: '(1 2 3 4 5)^6', rhs: '' });
        rel.push({ kind: 'hyper', name: 'Hyperelliptic involution has order 2', lhs: '(1 2 3 4 5 5 4 3 2 1)^2', rhs: '' });
        rel.push({ kind: 'hyper', name: 'Hyperelliptic involution is central', lhs: '1 2 3 4 5 5 4 3 2 1 1', rhs: '1 1 2 3 4 5 5 4 3 2 1' });
    } else {
        Object.assign(aux, WAJNRYB_AUX(g));
        rel.push({ kind: 'chain', name: '3-chain relation', lhs: '(1 2 3)^4', rhs: '0 b0' });
        rel.push({ kind: 'lantern', name: 'Lantern relation', lhs: '0 b2 b1', rhs: '1 3 5 b3' });
        const up = Array.from({ length: 2 * g }, (_, i) => i + 1).join(' ');
        const down = Array.from({ length: 2 * g }, (_, i) => 2 * g - i).join(' ');
        rel.push({ kind: 'hyper', name: 'Hyperelliptic relation', lhs: `${down} ${up} d`, rhs: `d ${down} ${up}` });
    }
    for (const r of rel) { r.L = parseTwists(r.lhs); r.R = parseTwists(r.rhs); }
    const n = 2 * g;
    const tx = {
        chain: g === 2 ? '(T_1T_2T_3T_4T_5)^6 = 1' : '(T_1T_2T_3)^4 = T_0\\,T_{b_0}',
        lantern: 'T_0\\,T_{b_2}\\,T_{b_1} = T_1T_3T_5\\,T_{b_3}',
    };
    const iota = 'T_1T_2T_3T_4T_5^2T_4T_3T_2T_1';
    for (const r of rel) {
        if (r.kind === 'chain' || r.kind === 'lantern') r.tex = tx[r.kind];
        else if (r.kind === 'hyper' && g === 2) r.tex = /order/.test(r.name) ? `(${iota})^2 = 1` : `[${iota},\\, T_1] = 1`;
        else if (r.kind === 'hyper') r.tex = `[T_{${n}}T_{${n - 1}}\\cdots T_2T_1^2T_2\\cdots T_{${n - 1}}T_{${n}},\\, T_d] = 1`;
    }
    return { g, gens, rel, aux };
}

// Auxiliary curves for Wajnryb's presentation: name → {of, by}, the curve by(of).
// b0, b1, b2 use Wajnryb's words. b3 = a3 and d = a_g come from shifting handles:
// a_{k+1} = (T_{a_k} T_{2k} T_{2k+1} T_{2k+2})⁻¹ Δ(a_{k−1}, c_{2k−2}, …, c_{2k+2}) (a_k),
// with a_1 = c_1, a_2 = c_0 and Δ the half twist (Garside element) of a 6-chain.
const garside = xs => { const p = []; for (let m = xs.length; m >= 1; m--) p.push(xs.slice(0, m).join(' ')); return p.join(' '); };
export const meridianName = k => (k === 1 ? 'c1' : k === 2 ? 'c0' : 'a' + k);
const short = n => n.replace(/^c(\d+)$/, '$1');
export function WAJNRYB_AUX(g) {
    const aux = {
        b0: { of: 'c0', by: '4 3 2 1 1 2 3 4' },
        b1: { of: 'c0', by: '-4 -3 -5 -4' },
        b2: { of: 'b1', by: '-2 -1 -3 -2' },
    };
    for (let k = 2; k < g; k++) {
        const chain = [short(meridianName(k - 1)), 2 * k - 2, 2 * k - 1, 2 * k, 2 * k + 1, 2 * k + 2].map(String);
        aux['a' + (k + 1)] = {
            of: meridianName(k),
            by: `-${2 * k + 2} -${2 * k + 1} -${2 * k} -${short(meridianName(k))} ${garside(chain)}`,
        };
    }
    aux.b3 = { of: 'a3', by: '' };
    aux.d = { of: 'a' + g, by: '' };
    return aux;
}

// build every curve the presentation mentions
export function buildCurves(S, P, onProgress) {
    const words = chainWords(S.g);
    const curves = {};
    for (const [k, w] of Object.entries(words)) curves[k] = curveFromWord(S, w);
    for (const [k, def] of Object.entries(P.aux)) {
        if (def.curve) { curves[k] = def.curve; continue; }
        curves[k] = def.by ? applyTwists(parseTwists(def.by), curves[def.of], curves) : curves[def.of];
        if (onProgress) onProgress(k);
    }
    return curves;
}

// check lhs = rhs on the oriented test curves (Alexander method); returns per-curve results
export function verify(r, curves, tests, opts = {}) {
    const out = [];
    for (const t of tests) {
        const x = curves[t];
        const a = applyTwists(r.L, x, curves, opts), b = applyTwists(r.R, x, curves, opts);
        out.push({ test: t, same: sameCurve(a, b), La: a.length(), Lb: b.length() });
    }
    return { ok: out.every(o => o.same === 1), out };
}

export function intersectionMatrix(curves, names) {
    return names.map(a => names.map(b => (a === b ? 0 : intersectionNumber(curves[a], curves[b]))));
}
