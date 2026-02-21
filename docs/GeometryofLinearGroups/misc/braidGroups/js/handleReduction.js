/**
 * Dehornoy's Handle Reduction Algorithm
 * 
 * Solves the word problem for the braid group Bₙ:
 * given a braid word w, determines whether w represents the trivial braid.
 * 
 * A "handle" in a braid word is a subword of the form
 *     σᵢᵉ · u · σᵢ⁻ᵉ
 * where u contains no occurrence of σᵢ±¹ (u lives in ⟨σⱼ : j ≠ i⟩),
 * and e ∈ {+1, -1}.
 * 
 * Handle reduction replaces such a handle by substituting the interior u:
 * each σⱼᶠ in u with |i − j| = 1 is replaced by σᵢᵉ σⱼᶠ σᵢ⁻ᵉ, and
 * generators with |i − j| ≥ 2 are left unchanged. The boundary σᵢᵉ and σᵢ⁻ᵉ
 * are removed. The result is then freely reduced.
 * 
 * Theorem (Dehornoy 1997, Larue):
 *   Handle reduction always terminates, and the resulting word is the 
 *   empty word if and only if the original braid is trivial.
 * 
 * For pure braids (those with trivial induced permutation), this gives
 * a complete solution to the word problem in PBₙ.
 * 
 * References:
 *   - P. Dehornoy, "A fast method for comparing braids", Adv. Math. 125 (1997)
 *   - P. Dehornoy, "Braid-based cryptography" (2004), §2 for exposition
 */


/**
 * Parse a generator symbol into { index, sign }.
 * @param {string} sym - e.g. 's3' or 'S2'
 * @returns {{ index: number, sign: number } | null}
 */
function parseSymbol(sym) {
    const match = sym.match(/^([sS])(\d+)$/);
    if (!match) return null;
    return {
        index: parseInt(match[2]),
        sign: match[1] === 's' ? 1 : -1
    };
}


/**
 * Create a symbol from index and sign.
 * @param {number} index
 * @param {number} sign - +1 or -1
 * @returns {string}
 */
function makeSymbol(index, sign) {
    return `${sign > 0 ? 's' : 'S'}${index}`;
}


/**
 * Freely reduce a braid word: cancel adjacent inverse pairs σᵢσᵢ⁻¹ and σᵢ⁻¹σᵢ.
 * Repeats until stable.
 * 
 * @param {string[]} word
 * @returns {string[]} freely reduced word
 */
function freeReduce(word) {
    let changed = true;
    let w = [...word];
    while (changed) {
        changed = false;
        const newW = [];
        let i = 0;
        while (i < w.length) {
            if (i < w.length - 1) {
                const a = parseSymbol(w[i]);
                const b = parseSymbol(w[i + 1]);
                if (a && b && a.index === b.index && a.sign === -b.sign) {
                    i += 2;
                    changed = true;
                    continue;
                }
            }
            newW.push(w[i]);
            i++;
        }
        w = newW;
    }
    return w;
}


/**
 * Find the first handle in the word.
 * 
 * A handle is: w[left] = σᵢᵉ, w[right] = σᵢ⁻ᵉ, with no σᵢ±¹ in between.
 * We search for the smallest generator index i that has a handle,
 * and for that i, we pick the leftmost handle.
 * 
 * @param {string[]} word
 * @param {number} n - number of strands
 * @returns {{ left: number, right: number, genIndex: number, sign: number } | null}
 */
function findHandle(word, n) {
    for (let i = 1; i < n; i++) {
        // Collect all occurrences of σᵢ±¹
        const occurrences = [];
        for (let pos = 0; pos < word.length; pos++) {
            const p = parseSymbol(word[pos]);
            if (p && p.index === i) {
                occurrences.push({ pos, sign: p.sign });
            }
        }

        // Look for first pair of consecutive occurrences with opposite signs
        for (let k = 0; k < occurrences.length - 1; k++) {
            const a = occurrences[k];
            const b = occurrences[k + 1];
            if (a.sign !== b.sign) {
                return {
                    left: a.pos,
                    right: b.pos,
                    genIndex: i,
                    sign: a.sign
                };
            }
        }
    }

    return null;
}


/**
 * Reduce a single handle by Dehornoy's substitution.
 * 
 * Given handle σᵢᵉ · u · σᵢ⁻ᵉ (positions left..right):
 *   - Remove σᵢᵉ and σᵢ⁻ᵉ
 *   - For each σⱼᶠ in u with |i-j| = 1: replace with σᵢᵉ σⱼᶠ σᵢ⁻ᵉ
 *   - For each σⱼᶠ in u with |i-j| ≥ 2: leave unchanged
 *   - Free reduce the result
 * 
 * @param {string[]} word
 * @param {{ left, right, genIndex, sign }} handle
 * @returns {string[]} word after handle reduction
 */
function reduceHandle(word, handle) {
    const { left, right, genIndex: i, sign: e } = handle;

    const before = word.slice(0, left);
    const interior = word.slice(left + 1, right);
    const after = word.slice(right + 1);

    // Build the substituted interior
    const substituted = [];
    for (const sym of interior) {
        const p = parseSymbol(sym);
        if (!p) {
            substituted.push(sym);
            continue;
        }
        const j = p.index;
        if (Math.abs(i - j) >= 2) {
            // Commutes with σᵢ — pass through unchanged
            substituted.push(sym);
        } else if (Math.abs(i - j) === 1) {
            // Adjacent: replace σⱼᶠ with σᵢᵉ σⱼᶠ σᵢ⁻ᵉ
            substituted.push(makeSymbol(i, e));
            substituted.push(sym);
            substituted.push(makeSymbol(i, -e));
        }
        // j === i shouldn't occur in a valid handle interior
    }

    return freeReduce([...before, ...substituted, ...after]);
}


/**
 * Run Dehornoy's handle reduction algorithm on a braid word.
 * 
 * Repeatedly finds and reduces handles until none remain.
 * The result is the empty word iff the original braid is trivial.
 * 
 * @param {string[]} word - Array of generator symbols, e.g. ['s1', 'S2', 's1']
 * @param {number} n - Number of strands
 * @param {object} [options]
 * @param {number} [options.maxSteps=10000] - Safety limit on iterations
 * @param {function} [options.onStep] - Callback({ word, handle, stepNumber }) after each step
 * @returns {{ 
 *   result: string[], 
 *   isTrivial: boolean, 
 *   steps: Array<{ word: string[], handle: object, stepNumber: number }>,
 *   terminated: boolean 
 * }}
 */
export function handleReduction(word, n, options = {}) {
    const maxSteps = options.maxSteps || 10000;
    const onStep = options.onStep || null;

    let w = freeReduce([...word]);
    const steps = [];
    let stepNumber = 0;

    while (stepNumber < maxSteps) {
        if (w.length === 0) break;

        const handle = findHandle(w, n);
        if (!handle) break;

        stepNumber++;
        const stepInfo = {
            word: [...w],
            handle: { ...handle },
            stepNumber
        };
        steps.push(stepInfo);
        if (onStep) onStep(stepInfo);

        w = reduceHandle(w, handle);
    }

    return {
        result: w,
        isTrivial: w.length === 0,
        steps,
        terminated: stepNumber < maxSteps
    };
}


/**
 * Check if a braid word represents the trivial braid.
 * 
 * @param {string[]} word
 * @param {number} n
 * @returns {boolean}
 */
export function isTrivialBraid(word, n) {
    return handleReduction(word, n).isTrivial;
}


/**
 * Format a handle reduction result for display.
 * 
 * @param {object} result - Output of handleReduction()
 * @returns {string}
 */
export function formatHandleReductionResult(result) {
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    const formatSym = (sym) => {
        const p = parseSymbol(sym);
        if (!p) return sym;
        const sub = String(p.index).split('').map(d => subs[parseInt(d)]).join('');
        return p.sign > 0 ? `σ${sub}` : `σ${sub}⁻¹`;
    };

    if (result.isTrivial) {
        return `Trivial braid (reduced to ε in ${result.steps.length} step${result.steps.length !== 1 ? 's' : ''})`;
    }

    if (!result.terminated) {
        return `Did not terminate within step limit`;
    }

    const finalWord = result.result.map(formatSym).join('·');
    return `Non-trivial → ${finalWord} (${result.steps.length} step${result.steps.length !== 1 ? 's' : ''}, final length ${result.result.length})`;
}
