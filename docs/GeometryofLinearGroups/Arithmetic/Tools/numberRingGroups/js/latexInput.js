// MathQuill LaTeX → the plain syntax of ringEngine's parser (x^2 + 1, (1 + a)/2, …).
// gen: TeX names of the field generator that stand for the root a (e.g. "\\sqrt{-5}", "\\omega", "i").

function readGroup(s, i) {
    // s[i] === '{' → [content, index after the matching '}']
    let depth = 0;
    for (let j = i; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') { depth--; if (depth === 0) return [s.slice(i + 1, j), j + 1]; }
    }
    throw new Error('unbalanced braces');
}

export function latexToPlain(src, { gen = [], variable = null } = {}) {
    let s = src.replace(/\\left|\\right/g, '').replace(/\\cdot|\\times/g, '*').replace(/\\[,;:! ]|\\quad|\\qquad/g, ' ').replace(/−/g, '-');
    // generator names that are commands (\sqrt{-5}, \omega, \zeta_{5}, …) first, longest first
    const names = [...gen].filter(Boolean).sort((u, v) => v.length - u.length);
    for (const g of names) if (g.startsWith('\\')) s = s.split(g).join(' (a) ');
    s = s.replace(/\\alpha/g, ' (a) ');
    // \frac{X}{Y} → ((X)/(Y)), innermost by recursion
    const unfrac = (t) => {
        let out = '';
        for (let i = 0; i < t.length;) {
            if (t.startsWith('\\frac', i) || t.startsWith('\\dfrac', i) || t.startsWith('\\tfrac', i)) {
                i += t.startsWith('\\frac', i) ? 5 : 6;
                while (t[i] === ' ') i++;
                const [a, j] = t[i] === '{' ? readGroup(t, i) : [t[i], i + 1];
                let k = j; while (t[k] === ' ') k++;
                const [b, l] = t[k] === '{' ? readGroup(t, k) : [t[k], k + 1];
                out += `((${unfrac(a)})/(${unfrac(b)}))`;
                i = l;
            } else { out += t[i]; i++; }
        }
        return out;
    };
    s = unfrac(s);
    const cmd0 = /\\([a-zA-Z]+)/.exec(s);
    if (cmd0) throw new Error(`“\\${cmd0[1]}” is not understood here`);
    // single-letter names (a, i, …)
    for (const g of names) if (!g.startsWith('\\') && g !== 'a') s = s.split(g).join(' (a) ');
    s = s.replace(/[{]/g, '(').replace(/[}]/g, ')');
    const cmd = /\\([a-zA-Z]+)/.exec(s);
    if (cmd) throw new Error(`“\\${cmd[1]}” is not understood here`);
    if (variable) {
        const letters = new Set((s.match(/[A-Za-z]/g) || []));
        letters.delete(variable);
        if (letters.size) throw new Error(`use the single variable ${variable}`);
    }
    return s.trim();
}
