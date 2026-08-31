/**
 * Parse a word in the generators for the Poincaré workbench.
 *
 * Accepts lower case for a generator and upper case for its inverse
 * (`a b A B`), or explicit `g1`, `g2`, … , with optional `'` and `^n` /
 * `^{-n}` exponents. Separators are optional.
 *
 * Exponents are capped so a typed `a^1000000000` cannot allocate a
 * billion-entry word and freeze the tab.
 */

/** Max |exponent| accepted after `^`. Generous for real words, tiny vs OOM. */
export const MAX_WORD_EXPONENT = 10000;

/**
 * @param {string} str
 * @param {number} nGens number of input generators (g1..gn)
 * @returns {number[]} signed 1-based generator indices
 */
export function parseWord(str, nGens) {
    const s = String(str || '');
    const out = [];
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (/[\s*,.·]/.test(ch)) { i++; continue; }
        let idx, sign = 1;
        if (ch === 'g' || ch === 'G') {
            const m = /^[gG]_?\{?(\d+)\}?/.exec(s.slice(i));
            if (!m) throw new Error(`expected a generator number after “${ch}”`);
            idx = parseInt(m[1], 10);
            i += m[0].length;
        } else if (/[a-z]/.test(ch)) {
            idx = ch.charCodeAt(0) - 96;          // a → 1
            i++;
        } else if (/[A-Z]/.test(ch)) {
            idx = ch.charCodeAt(0) - 64;          // A → g₁⁻¹
            sign = -1;
            i++;
        } else {
            throw new Error(`unexpected character “${ch}”`);
        }
        if (!(idx >= 1 && idx <= nGens)) {
            throw new Error(`g${idx} is not a generator of this group (it has ${nGens})`);
        }
        while (s[i] === "'" || s[i] === '′') { sign = -sign; i++; }
        let exp = 1;
        if (s[i] === '^') {
            i++;
            const m = /^\s*\{?\s*(-?\d+)\s*\}?/.exec(s.slice(i));
            if (!m) throw new Error('expected an integer exponent after “^”');
            exp = parseInt(m[1], 10);
            i += m[0].length;
            if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_WORD_EXPONENT) {
                throw new Error(
                    `exponent |${exp}| exceeds the limit of ${MAX_WORD_EXPONENT}`);
            }
        }
        const total = sign * exp;
        for (let k = 0; k < Math.abs(total); k++) out.push(total >= 0 ? idx : -idx);
    }
    return out;
}
