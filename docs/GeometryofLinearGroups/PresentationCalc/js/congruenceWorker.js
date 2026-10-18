/**
 * Worker for step 1's congruence line: the joint congruence closure (congruence.js) over ℚ.
 *
 * In:  { id, rows, S, C, cap, seconds }   (rows: the generators' entries as rational strings;
 *      S: the primes where Γ is unbounded; C: the Zariski engine's congruence closure)
 * Out: { id, result } or { id, error }.
 */
import { congruenceClosure } from './congruence.js';

self.onmessage = (ev) => {
    const { id, rows, S, C, cap, seconds } = ev.data;
    try { self.postMessage({ id, result: congruenceClosure(rows, S, C, { cap, seconds }) }); }
    catch (e) { self.postMessage({ id, error: e.message || String(e) }); }
};
