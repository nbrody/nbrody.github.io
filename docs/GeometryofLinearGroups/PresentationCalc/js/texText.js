/**
 * texText.js — mathematics written in plain Unicode (the trees' decisions, the Fuchsian pair test,
 * Poincaré's homology) as text with $…$ math, for KaTeX, one sentence per line.
 *
 *   g₁·g₂⁻¹·g₁³          →  $g_{1}g_{2}^{-1}g_{1}^{3}$
 *   ⟨g₁, g₂ | (g₁·g₂)³⟩  →  $\langle g_{1}, g_{2} \mid (g_{1}g_{2})^{3} \rangle$
 *   ℤ/2 ∗ ℤ/3, PGL₂(K), ℚ₃, 𝒪_𝔭
 *
 * Only these constructs become math; the rest stays text.
 */
const SUBS = '₀₁₂₃₄₅₆₇₈₉', SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const subD = (s) => [...s].map((c) => SUBS.indexOf(c)).join('');
const supD = (s) => [...s].map((c) => (c === '⁻' ? '-' : SUPS.indexOf(c))).join('');

const LETTER = `g[${SUBS}]+(?:⁻?[${SUPS}]+)?`;
const WORD = new RegExp(`\\(?${LETTER}(?:·?${LETTER})*\\)?(?:⁻?[${SUPS}]+)?`, 'g');

/** The Unicode inside a math span, as TeX. */
export function innerTex(s) {
    return String(s)
        .replace(new RegExp(`g([${SUBS}]+)(⁻?[${SUPS}]+)?`, 'g'), (_, a, e) => `g_{${subD(a)}}${e ? `^{${supD(e)}}` : ''}`)
        .replace(new RegExp(`\\)(⁻?[${SUPS}]+)`, 'g'), (_, e) => `)^{${supD(e)}}`)
        .replace(/·/g, '')
        .replace(/P([GS])L₂/g, '\\mathrm{P$1L}_2')
        .replace(/ℤ/g, '\\mathbb{Z}').replace(/ℝ/g, '\\mathbb{R}').replace(/ℂ/g, '\\mathbb{C}')
        .replace(new RegExp(`ℚ([${SUBS}]+)`, 'g'), (_, d) => `\\mathbb{Q}_{${subD(d)}}`).replace(/ℚ/g, '\\mathbb{Q}')
        .replace(/𝒪_?𝔭/g, '\\mathcal{O}_{\\mathfrak{p}}').replace(/𝒪/g, '\\mathcal{O}').replace(/𝔭/g, '\\mathfrak{p}')
        .replace(/∗/g, '\\ast ').replace(/⊕/g, '\\oplus ').replace(/ℓ/g, '\\ell ').replace(/−/g, '-')
        .replace(/\|/g, '\\mid ').replace(/≤/g, '\\le ').replace(/≥/g, '\\ge ')
        .replace(/⁻¹/g, '^{-1}').replace(/\bmin\(/g, '\\min(');
}

const RULES = [
    /⟨[^⟩]*⟩/g,                                              // ⟨…⟩, a presentation or a group
    /min\(ℓ\(xy\), ℓ\(x⁻¹y\)\) > ℓ\(y\) − ℓ\(x\)/g,           // Conder's Nielsen test
    /ℤ(?:\/\d+)?(?:\s*[∗⊕]\s*ℤ(?:\/\d+)?)+/g,                // free products and sums
    /P[GS]L₂\([^)]*\)/g,
    new RegExp(`ℚ[${SUBS}]+`, 'g'),
    WORD,
];

/** One piece of text with $…$ around the math it contains (text already with $…$ is left alone). */
export function mathLine(text) {
    const s = String(text ?? '');
    if (s.includes('$')) return s;
    const held = [];
    let out = s;
    for (const re of RULES) {
        out = out.replace(re, (m) => {
            held.push(m.startsWith('⟨') ? `\\langle ${innerTex(m.slice(1, -1))} \\rangle` : innerTex(m));
            return `\u0000${held.length - 1}\u0000`;
        });
    }
    return out.replace(/\u0000(\d+)\u0000/g, (_, k) => `$${held[+k]}$`);
}

/** Text as sentences, one per line, each with $…$ math. */
export function mathLines(text) {
    const s = String(text ?? '').trim();
    if (!s) return [];
    return s.split(/(?<=[.!?])\s+(?=[A-Z⟨(ΓΛℤℚ$])/).map(mathLine);
}
