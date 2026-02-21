/**
 * Induced Permutation — Bₙ → Sₙ
 * 
 * Every braid determines a permutation via the canonical surjection
 *   Bₙ → Sₙ,   σᵢ ↦ (i  i+1)
 * 
 * The kernel of this map is the pure braid group PBₙ.
 * 
 * A braid word is a list of symbols like 's1', 'S2', 's3', etc.
 * Both σᵢ and σᵢ⁻¹ map to the same transposition (i, i+1).
 */


/**
 * Compute the permutation induced by a braid word.
 * 
 * @param {string[]} symbols - Array of generator symbols, e.g. ['s1', 'S2', 's3']
 * @param {number} n - Number of strands
 * @returns {number[]} perm - The permutation as an array of length n,
 *   where perm[i] is the image of strand i (0-indexed).
 *   So perm = [2, 0, 1] means strand 0 → 2, strand 1 → 0, strand 2 → 1.
 */
export function inducedPermutation(symbols, n) {
    // Start with the identity permutation
    const perm = Array.from({ length: n }, (_, i) => i);

    for (const sym of symbols) {
        // Extract the generator index: 's3' → 3, 'S2' → 2
        const match = sym.match(/[sS](\d+)/);
        if (!match) continue;
        const i = parseInt(match[1]); // 1-indexed

        // Apply transposition (i-1, i) in 0-indexed terms
        if (i >= 1 && i < n) {
            const a = i - 1;
            const b = i;
            [perm[a], perm[b]] = [perm[b], perm[a]];
        }
    }

    return perm;
}


/**
 * Check whether a permutation is the identity.
 * @param {number[]} perm
 * @returns {boolean}
 */
export function isIdentityPermutation(perm) {
    return perm.every((val, idx) => val === idx);
}


/**
 * Convert a permutation to cycle notation string.
 * E.g. [1, 2, 0, 3] → "(1 2 3)" (using 1-indexed labels).
 * The identity returns "e" (the identity element).
 * 
 * @param {number[]} perm - 0-indexed permutation array
 * @returns {string} cycle notation (1-indexed for display)
 */
export function permutationToCycleNotation(perm) {
    const n = perm.length;
    const visited = new Array(n).fill(false);
    const cycles = [];

    for (let i = 0; i < n; i++) {
        if (visited[i] || perm[i] === i) {
            visited[i] = true;
            continue;
        }
        // Trace the cycle starting at i
        const cycle = [];
        let j = i;
        while (!visited[j]) {
            visited[j] = true;
            cycle.push(j + 1); // 1-indexed for display
            j = perm[j];
        }
        if (cycle.length > 1) {
            cycles.push(cycle);
        }
    }

    if (cycles.length === 0) return 'e';
    return cycles.map(c => `(${c.join(' ')})`).join('');
}


/**
 * Format a permutation as a two-line notation string.
 * E.g. for [2, 0, 1]:
 *   ⎛1 2 3⎞
 *   ⎝3 1 2⎠
 * 
 * @param {number[]} perm - 0-indexed permutation
 * @returns {string} two-line notation (1-indexed for display)
 */
export function permutationToTwoLine(perm) {
    const n = perm.length;
    const top = Array.from({ length: n }, (_, i) => i + 1);
    const bot = perm.map(x => x + 1);
    return `⎛${top.join(' ')}⎞\n⎝${bot.join(' ')}⎠`;
}
