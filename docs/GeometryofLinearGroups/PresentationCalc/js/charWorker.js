/**
 * Worker for step 1's table: each generator at each place, and its characteristic set (charSets.js).
 * ringEngine.js is imported first, for its side effect: localField.js reads the global
 * NumberRingEngine when it loads (as the discreteness tool's finiteWorker.js does).
 *
 * In:  { id, job } (charSets.js's job). Out: { id, result } or { id, error }.
 */
import '../../Algebraic/Tools/numberRings/ringEngine.js';
import { GlobalField, Place } from '../../Geometric/Tools/padicGroups/trees/js/localField.js';
import { generatorTable } from './charSets.js';

self.onmessage = (ev) => {
    const { id, job } = ev.data;
    try {
        self.postMessage({ id, result: generatorTable({ GlobalField, Place, NR: self.NumberRingEngine }, job) });
    } catch (e) {
        self.postMessage({ id, error: e && e.message ? e.message : String(e) });
    }
};
