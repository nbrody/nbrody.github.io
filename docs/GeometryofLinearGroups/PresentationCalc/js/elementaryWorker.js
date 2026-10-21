/**
 * Worker for the presentation of a Γ that is not Zariski dense (elementary.js).
 *
 * In:  { id, rows, poly, root, kind }   Out: { id, result } or { id, error }.
 */
import '../../Algebraic/Tools/numberRings/ringEngine.js';      // valuations over number fields (numfield.js)
import { elementaryPresentation } from './elementary.js';

self.onmessage = (ev) => {
    const { id, rows, poly, root, kind } = ev.data;
    try {
        self.postMessage({ id, result: elementaryPresentation({ rows, poly: poly.map(BigInt), root, kind }) });
    } catch (e) { self.postMessage({ id, error: e.message || String(e) }); }
};
