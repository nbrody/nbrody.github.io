/**
 * Worker for the presentation of an S-arithmetic Γ over ℚ (sarithPresentation.js): Λ on its
 * standard generators, the congruence description, and Γ's presentation by Reidemeister–Schreier.
 *
 * Over ℚ(√−1), ℚ(√−2), ℚ(√−3) (kind 'bianchi'), the same from bianchiPresentation.js; and for a Γ of finite
 * index in PGL₂(O_k) (kind 'numberRing'), from Voronoi's presentation (numberRingPresentation.js).
 *
 * When step 3 decided Γ by coset enumeration in Λ = N(𝒪[1/S])/k^× (kind 'quaternion'), from that
 * presentation of Λ (quaternionPresentation.js).
 *
 * In:  { id, rows, S, levels, C, maxIndex, seconds }, { id, kind: 'bianchi', d, polySrc, rows, maxIndex, seconds },
 *      { id, kind: 'numberRing', polySrc, rows, maxIndex, seconds }
 *      or { id, kind: 'quaternion', rows, poly, S, opts } (as quaternionWorker.js)
 * Out: { id, result } or { id, error }.
 */
import { presentationReport } from './sarithPresentation.js';
import { presentationReportBianchi } from './bianchiPresentation.js';
import { wordMatrices } from './bianchi.js';

self.onmessage = async (ev) => {
    const { id, kind, d, polySrc, rows, S, levels, C, maxIndex, seconds } = ev.data;
    try {
        // ringEngine.js sets the global NumberRingEngine, which quaternionIndex.js needs: loaded first
        if (kind === 'quaternion') {
            await import('../../Algebraic/Tools/numberRings/ringEngine.js');
            const { quaternionPresentation } = await import('./quaternionPresentation.js');
            const { poly, opts } = ev.data;
            const pres = quaternionPresentation(rows, poly.map(BigInt), S, opts || {});
            self.postMessage({ id, result: JSON.parse(JSON.stringify({ kind: 'quaternion', pres }, (k, v) => (typeof v === 'bigint' ? String(v) : v))) });
            return;
        }
        // PGL₂(O_k) from Voronoi's algorithm: loaded here, since the ring engine loads with a top-level await
        if (kind === 'numberRing') {
            const { presentationReportNumberRing } = await import('./numberRingPresentation.js');
            const R = presentationReportNumberRing(polySrc, rows, { maxIndex, seconds });
            self.postMessage({ id, result: JSON.parse(JSON.stringify(R, (k, v) => (typeof v === 'bigint' ? String(v) : v))) });
            return;
        }
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
