/**
 * texText.js — mathematics written in plain Unicode (the trees' decisions, the Fuchsian pair test,
 * Poincaré's homology, the Zariski engine's sentences, example names) as text with $…$ math, for
 * KaTeX, one sentence per line.
 *
 *   g₁·g₂⁻¹·g₁³          →  $g_{1}g_{2}^{-1}g_{1}^{3}$
 *   ⟨g₁, g₂ | (g₁·g₂)³⟩  →  $\langle g_{1}, g_{2} \mid (g_{1}g_{2})^{3} \rangle$
 *   ℤ/2 ∗ ℤ/3, PGL₂(ℤ[½]), ℚ₃, 𝒪_𝔭, Γ₀(3), Γ⁽²⁾, ℂ₁, 𝔭₂ ∣ 5, P¹, 𝔾ₐ, S-arithmetic
 *
 * Only these constructs become math; the rest stays text, and text already inside $…$ is left alone.
 */
const SUBS = '₀₁₂₃₄₅₆₇₈₉', SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUB_LETTERS = { 'ₐ': 'a', 'ₘ': 'm', 'ₒ': 'o', 'ₚ': 'p', 'ₙ': 'n', 'ᵢ': 'i' };
const subD = (s) => [...s].map((c) => (SUBS.includes(c) ? SUBS.indexOf(c) : SUB_LETTERS[c] ?? c)).join('');
const supD = (s) => [...s].map((c) => (c === '⁻' ? '-' : c === '⁽' ? '(' : c === '⁾' ? ')' : SUPS.indexOf(c))).join('');

const GREEK = {
    Γ: '\\Gamma', Λ: '\\Lambda', Δ: '\\Delta', Σ: '\\Sigma', Ω: '\\Omega', Φ: '\\Phi',
    α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', θ: '\\theta', κ: '\\kappa',
    λ: '\\lambda', μ: '\\mu', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', φ: '\\varphi', χ: '\\chi', ψ: '\\psi', ω: '\\omega',
};
const BB = { 'ℚ': 'Q', 'ℤ': 'Z', 'ℝ': 'R', 'ℂ': 'C', 'ℍ': 'H', 'ℙ': 'P', '𝔾': 'G', '𝔽': 'F', 'ℕ': 'N' };
const FRAC = { '½': '\\tfrac12', '⅓': '\\tfrac13', '¼': '\\tfrac14', '⅕': '\\tfrac15', '⅙': '\\tfrac16', '⅔': '\\tfrac23', '¾': '\\tfrac34' };
const SYMBOLS = {
    '∗': '\\ast ', '⊕': '\\oplus ', '⋊': '\\rtimes ', '×': '\\times ', '∩': '\\cap ', '∪': '\\cup ', '≅': '\\cong ',
    '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '∈': '\\in ', '⊂': '\\subset ', '⊆': '\\subseteq ', '∣': '\\mid ', '|': '\\mid ',
    '↦': '\\mapsto ', '→': '\\to ', '≈': '\\approx ', '∞': '\\infty ', '−': '-', 'ℓ': '\\ell ', '𝒪': '\\mathcal{O}',
    '𝔭': '\\mathfrak{p}', '𝔮': '\\mathfrak{q}', '⟨': '\\langle ', '⟩': '\\rangle ', '·': '\\cdot ', '…': '\\ldots ', '⋯': '\\cdots ',
};
const charClass = (o) => `[${Object.keys(o).join('')}]`;

/** The Unicode inside a math span, as TeX. */
export function innerTex(s) {
    return String(s)
        // words in the generators: g₁·g₂⁻¹ → g_{1}g_{2}^{-1}
        .replace(new RegExp(`g([${SUBS}]+)(⁻?[${SUPS}]+)?`, 'g'), (_, a, e) => `g_{${subD(a)}}${e ? `^{${supD(e)}}` : ''}`)
        .replace(/·(?=g_\{)/g, '')
        .replace(/\bP¹/g, 'ℙ¹')
        .replace(/\b(P?[GS]L|P?S[OU]|PU)([₀-₉]+)/g, (_, G, n) => `\\mathrm{${G}}_{${subD(n)}}`)
        .replace(/√−(\d+)/g, '\\sqrt{-$1}').replace(/√(\d+|[A-Za-z])/g, '\\sqrt{$1}')
        .replace(/\bmin\(/g, '\\min(').replace(/\bdiag\(/g, '\\mathrm{diag}(').replace(/\btr\b/g, '\\operatorname{tr}').replace(/\bdet\b/g, '\\det')
        .replace(new RegExp(charClass(BB), 'gu'), (c) => `\\mathbb{${BB[c]}}`)
        .replace(new RegExp(charClass(FRAC), 'g'), (c) => FRAC[c])
        .replace(new RegExp(charClass(GREEK), 'g'), (c) => `${GREEK[c]} `)
        .replace(/𝒪_?𝔭/gu, '\\mathcal{O}_{\\mathfrak{p}}')
        .replace(/⁻¹/g, '^{-1}')
        .replace(new RegExp(`(?:⁻?[${SUPS}]+|⁽[${SUPS}]+⁾)`, 'g'), (e) => `^{${supD(e)}}`)
        .replace(new RegExp(`[${SUBS}ₐₘₒₚₙᵢ]+`, 'g'), (d) => `_{${subD(d)}}`)
        .replace(new RegExp(charClass(SYMBOLS), 'gu'), (c) => SYMBOLS[c])
        .replace(/ +(?=[_^])/g, '').replace(/ {2,}/g, ' ').trim();
}

const SB = `[${SUBS}ₐₘₒₚ]`, SP = `(?:⁻?[${SUPS}]+|⁽[${SUPS}]+⁾)`;
const ARG = '(?:\\((?:[^()]|\\([^()]*\\))*\\)|\\[[^\\]]*\\])';
const LETTER = `g[${SUBS}]+(?:⁻?[${SUPS}]+)?`;
const WORD = `\\(?${LETTER}(?:·?${LETTER})*\\)?(?:⁻?[${SUPS}]+)?`;
const ATOM = [
    '⟨[^⟩]*⟩',
    `(?:P?[GS]L|P?S[OU]|PU)[${SUBS}]+${ARG}?`,
    `(?:[ℚℤℝℂℍℙ𝔽ℕℓ]|𝔾|𝒪|𝔭)(?:${SB}|${SP})*(?:${ARG})*(?:\\/\\d+)?(?:${SB}|${SP})*`,
    `[ΓΛΔ](?:${SB}|${SP})*${ARG}?`,
    WORD,
    `\\bP¹`,
    `\\b[A-Za-z]${SB}+(?![A-Za-z])`,
    `\\b[A-Za-z]${SP}(?![A-Za-z])`,
    `\\bdiag${ARG}`,
    '\\b[A-Za-z](?=\\s*=\\s*[\\d−-])',
    `[${Object.keys(FRAC).join('')}]`,
    '∞',
].join('|');
/** Math atoms, joined by relations and operations: ℤ[1/6] ⋊ ℤ, Γ ≅ ℤ/2 ∗ ℤ/3, 𝔭 ∣ 5. */
const RUN = new RegExp(`(?:${ATOM})(?:\\s*[⋊∗×⊕∩≅≤≥≠∈⊂⊆∣=]\\s*(?:${ATOM}|−?\\d+(?!\\d|\\.\\d|\\s*[A-Za-z])))*`, 'gu');

const RULES = [
    /min\(ℓ\(xy\), ℓ\(x⁻¹y\)\) > ℓ\(y\) − ℓ\(x\)/g,           // Conder's Nielsen test
    RUN,
];

/** Text outside $…$ with $…$ put around the math it contains. */
function mathText(s) {
    const held = [];
    let out = s.replace(/\bS-(?=arithmetic|integers?\b|units?\b)/g, () => { held.push('S'); return `\u0000${held.length - 1}\u0000-`; });
    for (const re of RULES) {
        out = out.replace(re, (m) => {
            held.push(m.startsWith('⟨') && m.endsWith('⟩') && !/⟩.*⟨/.test(m) ? `\\langle ${innerTex(m.slice(1, -1))} \\rangle` : innerTex(m));
            return `\u0000${held.length - 1}\u0000`;
        });
    }
    return out.replace(/\u0000(\d+)\u0000/g, (_, k) => `$${held[+k]}$`);
}

/** One piece of text with $…$ around the math it contains (math already inside $…$ is left alone). */
export function mathLine(text) {
    return String(text ?? '').split(/(\$[^$]*\$)/).map((part) => (part.startsWith('$') && part.endsWith('$') && part.length > 1 ? part : mathText(part))).join('');
}

/** Text as sentences, one per line, each with $…$ math. */
export function mathLines(text) {
    const s = String(text ?? '').trim();
    if (!s) return [];
    return s.split(/(?<=[.!?])\s+(?=[A-Z⟨(ΓΛℤℚ$])/).map(mathLine);
}
