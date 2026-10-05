/**
 * Worker for the finite places: trees' exact local fields and discreteness
 * decision (padicGroups/trees/js), driven by finite.js. ringEngine.js must be
 * evaluated before localField.js reads the global NumberRingEngine, so it is
 * imported first, for its side effect (as trees/js/decideWorker.js does).
 *
 * In: { id, job }. Out: { id, msg } per step (finite.js), then { id, msg: { type: 'done' } },
 * or { id, error }.
 */
import '../../../../Algebraic/Tools/numberRings/ringEngine.js';
import { GlobalField, Place } from '../../padicGroups/trees/js/localField.js';
import { decide, serializeDecision } from '../../padicGroups/trees/js/discreteness.js';
import { runFinite } from './finite.js';

self.onmessage = (ev) => {
    const { id, job } = ev.data;
    const deps = { NR: self.NumberRingEngine, GlobalField, Place, decide, serializeDecision };
    try {
        runFinite(deps, job, (msg) => self.postMessage({ id, msg }));
    } catch (e) {
        self.postMessage({ id, error: e.message || String(e) });
    }
};
