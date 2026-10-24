/**
 * Largest σ₁ among exhaustive-census records.
 *
 * Those records carry no `set` name. A random draw can lose that name when an
 * earlier line for the same key had none (export-web.mjs); the draw is still
 * listed in samples.json, and its σ₁ can sit far above the census. Counting it
 * here makes the page claim every pair up to that σ₁.
 *
 * @param {Array<{key: string, set?: string, s1?: number[]}>} recs
 * @param {Set<string>} sampleKeys keys of the random draws
 */
export function exhaustiveBound(recs, sampleKeys) {
    let bound = 0;
    for (const r of recs) {
        if (r.set || (sampleKeys && sampleKeys.has(r.key))) continue;
        if (!r.s1 || !r.s1.length) continue;
        bound = Math.max(bound, ...r.s1);
    }
    return bound;
}
