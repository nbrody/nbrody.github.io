/**
 * Display helpers: words and matrices as LaTeX, complex numbers as text.
 * Words are truncated for display — a pairing word can in principle be very
 * long, and typesetting it in full would stall MathJax.
 */
import { formatWordMathJax } from './math.js';

export const WORD_DISPLAY_MAX = 36;

/** LaTeX for a word in the generators g_i, truncated past `max` letters. */
export function wordTex(word, max = WORD_DISPLAY_MAX) {
    if (!word || word.length === 0) return 'e';
    if (word.length <= max) return formatWordMathJax(word);
    return `${formatWordMathJax(word.slice(0, max))}\\,\\cdots\\ {\\scriptstyle(\\text{length } ${word.length})}`;
}

/** Plain-text word (g1·g2⁻¹…), truncated. */
export function wordText(word, max = 60) {
    if (!word || word.length === 0) return 'e';
    const s = word.slice(0, max).map(i => `g${Math.abs(i)}${i < 0 ? '⁻¹' : ''}`).join('·');
    return word.length > max ? `${s}… (length ${word.length})` : s;
}

function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

function asRational(x, maxDen = 64, tol = 1e-7) {
    for (let q = 1; q <= maxDen; q++) {
        const p = Math.round(x * q);
        if (Math.abs(x - p / q) < tol) {
            const g = gcdInt(p, q);
            return { p: p / g, q: q / g };
        }
    }
    return null;
}

function simplifySqrt(n) {
    let m = 1;
    for (let f = 2; f * f <= n; f++) while (n % (f * f) === 0) { n /= f * f; m *= f; }
    return { m, k: n };
}

/** Exact LaTeX for a real number (integer / rational / √-surd) or null. */
export function exactReal(x) {
    if (Math.abs(x) < 1e-9) return '0';
    const rat = asRational(x);
    if (rat) return rat.q === 1 ? `${rat.p}` : `${rat.p < 0 ? '-' : ''}\\tfrac{${Math.abs(rat.p)}}{${rat.q}}`;
    const sq = asRational(x * x);
    if (sq && sq.p > 0) {
        const { m, k } = simplifySqrt(sq.p * sq.q);
        if (k === 1) return null;
        const g = gcdInt(m, sq.q), num = m / g, den = sq.q / g;
        const sign = x < 0 ? '-' : '';
        const rad = num === 1 ? `\\sqrt{${k}}` : `${num}\\sqrt{${k}}`;
        return den === 1 ? `${sign}${rad}` : `${sign}\\tfrac{${rad}}{${den}}`;
    }
    return null;
}

/** x·π as text in lowest terms ("π/2", "2π/3", "π", "4π"), or null if x is no small fraction. */
export function piText(x, maxDen = 24, tol = 1e-6) {
    if (Math.abs(x) < tol) return '0';
    const r = asRational(x, maxDen, tol);
    if (!r) return null;
    const sign = r.p < 0 ? '−' : '', p = Math.abs(r.p);
    return `${sign}${p === 1 ? '' : p}π${r.q === 1 ? '' : `/${r.q}`}`;
}

/**
 * An angle (radians) for display: { main, sub } — a fraction of π with its
 * degrees beside it when it is one ("π/2", "90°"), else degrees with the
 * multiple of π ("96.83°", "≈ 0.538π").
 */
export function angleText(theta) {
    const deg = theta * 180 / Math.PI;
    const frac = piText(theta / Math.PI);
    if (frac) return { main: frac, sub: `${+deg.toFixed(4)}°`, exact: true };
    return { main: `${deg.toFixed(2)}°`, sub: `≈ ${(theta / Math.PI).toFixed(4)}π`, exact: false };
}

const decReal = (x) => `${+x.toFixed(4)}`;

export function exactComplex(z) {
    const re = exactReal(z.re) ?? decReal(z.re);
    if (Math.abs(z.im) < 1e-9) return re;
    const imMag = exactReal(Math.abs(z.im)) ?? decReal(Math.abs(z.im));
    const imTerm = (imMag === '1' ? '' : imMag) + 'i';
    if (Math.abs(z.re) < 1e-9) return (z.im < 0 ? '-' : '') + imTerm;
    return re + (z.im < 0 ? ' - ' : ' + ') + imTerm;
}

/** \(pmatrix\), with "∘ conj" for orientation-reversing elements. */
export function matrixLatex(m) {
    if (!m) return '';
    const conj = m.anti ? ' \\circ \\overline{\\phantom{z}}' : '';
    return `\\(\\begin{pmatrix} ${exactComplex(m.a)} & ${exactComplex(m.b)} \\\\ ` +
        `${exactComplex(m.c)} & ${exactComplex(m.d)} \\end{pmatrix}${conj}\\)`;
}

/** "a ± bi" with fixed digits. */
export function complexStr(re, im, digits = 6) {
    const r = re.toFixed(digits), i = Math.abs(im).toFixed(digits);
    if (Math.abs(im) < 0.5 * 10 ** -digits) return r;
    return `${r} ${im < 0 ? '−' : '+'} ${i}i`;
}

export function typeset(els) {
    const list = (Array.isArray(els) ? els : [els]).filter(Boolean);
    if (list.length && window.MathJax && window.MathJax.typesetPromise) {
        return window.MathJax.typesetPromise(list).catch(() => { });
    }
    return Promise.resolve();
}

export function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
