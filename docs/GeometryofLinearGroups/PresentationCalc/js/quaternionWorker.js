/**
 * Worker for step 3 when the quaternion algebra is totally definite over a totally real field: coset
 * enumeration in Λ = N(𝒪[1/S])/k^× (quaternionIndex.js), off the page's thread (building Λ can take seconds).
 * ringEngine.js must be evaluated first (it sets the global NumberRingEngine), so it is imported first.
 *
 * In:  { id, rows, poly, S, opts }  rows: the generators as ringEngine text in w; poly: of w (strings, low → high);
 *      S: step 1's primes ({ p, e, f, H }); opts: { field, ram, levelPrimes, seconds, … } (definiteIndex)
 * Out: { id, result } (definiteIndex's record, or { index: null, error }).
 */
import '../../Algebraic/Tools/numberRings/ringEngine.js';
import { definiteIndex } from './quaternionIndex.js';
import { quaternionPresentation } from './quaternionPresentation.js';

let cached = null;

self.onmessage = (ev) => {
    const { id, cmd, rows, poly, S, opts } = ev.data;
    if (cmd === 'presentation') {
        try {
            const pres = quaternionPresentation(rows, poly.map(BigInt), S, { ...(opts || {}), precomputed: cached });
            self.postMessage({ id, result: JSON.parse(JSON.stringify({ kind: 'quaternion', pres }, (k, v) => (typeof v === 'bigint' ? String(v) : v))) });
        } catch (e) {
            self.postMessage({ id, error: e.message || String(e) });
        }
        return;
    }
    let result;
    try {
        const full = definiteIndex(rows, poly.map(BigInt), S, { ...(opts || {}), debug: true });
        cached = full && full.debug ? full : null;
        if (full && full.debug) {
            const { debug, ...rest } = full;
            result = rest;
        } else {
            result = full;
        }
    } catch (e) {
        cached = null;
        result = { index: null, error: e.message || String(e) };
    }
    self.postMessage({ id, result: result ? JSON.parse(JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v))) : null });
};
