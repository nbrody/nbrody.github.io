/**
 * Worker for the presentation of an S-arithmetic Γ over ℚ (sarithPresentation.js): Λ on its
 * standard generators, the congruence description, and Γ's presentation by Reidemeister–Schreier.
 *
 * Over ℚ(√−1), ℚ(√−2), ℚ(√−3) (kind 'bianchi'), the same from bianchiPresentation.js.
 *
 * In:  { id, rows, S, levels, C, maxIndex, seconds } or { id, kind: 'bianchi', d, polySrc, rows, maxIndex, seconds }
 * Out: { id, result } or { id, error }.
 */
import { presentationReport } from './sarithPresentation.js';
import { presentationReportBianchi } from './bianchiPresentation.js';
import { wordMatrices } from './bianchi.js';

self.onmessage = (ev) => {
    const { id, kind, d, polySrc, rows, S, levels, C, maxIndex, seconds } = ev.data;
    try {
        if (kind === 'bianchi') {
            const gens = wordMatrices(d, rows, rows.map((_, i) => [i + 1]), polySrc);
            if (!gens) throw new Error('the entries are not in the ring');
            self.postMessage({ id, result: presentationReportBianchi(d, gens, { maxIndex, seconds }) });
            return;
        }
        self.postMessage({ id, result: presentationReport(rows, S, { levels, C, maxIndex, seconds }) });
    }
    catch (e) { self.postMessage({ id, error: e.message || String(e) }); }
};
