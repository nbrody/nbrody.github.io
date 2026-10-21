/**
 * Worker for step 1's congruence line: the joint congruence closure (congruence.js) over ℚ, then
 * its description (congruenceShape.js), posted separately so the index shows first.
 *
 * In:  { id, rows, S, C, cap, seconds }   (rows: the generators' entries as rational strings;
 *      S: the primes where Γ is unbounded; C: the Zariski engine's congruence closure)
 * Out: { id, result } (or { id, error }), then { id, shape } (null when there is nothing to describe).
 */
import { congruenceClosure } from './congruence.js';
import { describeClosure } from './congruenceShape.js';

self.onmessage = (ev) => {
    const { id, rows, S, C, cap, seconds } = ev.data;
    let result;
    try { result = congruenceClosure(rows, S, C, { cap, seconds }); self.postMessage({ id, result }); }
    catch (e) { self.postMessage({ id, error: e.message || String(e) }); return; }
    let shape = null;
    // a joint image too large to count still has levels, and each prime is described on its own
    if (result && ['exact', 'lower', 'too-large'].includes(result.status) && result.levels && result.levels.length) {
        try { shape = describeClosure(rows, S, result.levels, { jointOrder: result.image ?? null }); } catch (e) { shape = { error: e.message || String(e) }; }
    }
    self.postMessage({ id, shape });
};
