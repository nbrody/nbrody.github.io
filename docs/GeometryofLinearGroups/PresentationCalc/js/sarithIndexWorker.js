/**
 * Worker for exact coset enumeration at the start of step 3:
 *   · over ℚ (kind = 'q'): [PGL₂(ℤ[1/S]) : Γ] via sarithIndex.js exactIndexCheck;
 *   · over ℚ(√−1), ℚ(√−2), ℚ(√−3) (kind = 'bianchi'): [PGL₂(O[1/S]) : Γ] via bianchi.js indexInPGL2OS.
 *
 * Running this off the main thread keeps the page responsive when Todd–Coxeter reaches its time or coset cap,
 * and allows step 3's exact check to scale with the user's "Time limits" setting.
 */
import { exactIndexCheck } from './sarithIndex.js';
import { bianchiRing, wordMatrices, indexInPGL2OS } from './bianchi.js';

self.onmessage = (ev) => {
    const { id, kind, rows, S, polySrc, seconds = 4, express = true, maxCosets = 1500000 } = ev.data;
    let result = null;
    try {
        if (kind === 'bianchi') {
            const d = bianchiRing(polySrc);
            if (d) {
                const gens = wordMatrices(d, rows, rows.map((_, i) => [i + 1]), polySrc);
                if (gens) {
                    const r = indexInPGL2OS(d, gens, { seconds, maxCosets });
                    result = {
                        index: r.index ?? null,
                        limit: r.limit ?? null,
                        error: r.error ?? null,
                        S: r.S || [],
                        kernelIndex: 1,
                        ms: r.ms ?? null,
                        ring: d,
                    };
                }
            }
        } else {
            result = exactIndexCheck(rows, S, { seconds, express });
        }
    } catch (e) {
        result = { index: null, error: e && e.message ? e.message : String(e) };
    }
    self.postMessage({
        id,
        result: result ? JSON.parse(JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v))) : null,
    });
};
