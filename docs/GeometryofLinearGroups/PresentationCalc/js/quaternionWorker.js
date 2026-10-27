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

self.onmessage = (ev) => {
    const { id, rows, poly, S, opts } = ev.data;
    let result;
    try { result = definiteIndex(rows, poly.map(BigInt), S, opts || {}); }
    catch (e) { result = { index: null, error: e.message || String(e) }; }
    self.postMessage({ id, result: result ? JSON.parse(JSON.stringify(result)) : null });
};
