/**
 * Runs the discreteness decision off the main thread. The page sends the
 * tower of number fields with the generators (tower.js's plain-data form), the
 * prime and the base vertex; the worker rebuilds the same field and place —
 * the construction is deterministic, so the base vertex's digits agree — and
 * replies with the decision, matrices formatted as text and TeX.
 */
import '../../../../../Algebraic/Tools/numberRings/ringEngine.js';   // sets self.NumberRingEngine
import { deserializeTowerContext } from '../../../../../assets/js/hyperbolic/tower.js';
import { GlobalField, Place } from './localField.js';
import { decide, serializeDecision } from './discreteness.js';

self.onmessage = (ev) => {
    const { id, tower, p, primeIndex, base, seconds } = ev.data;
    try {
        const { field, gens } = deserializeTowerContext(tower);
        const F = GlobalField.fromTower(field, { primes: [BigInt(p)] });
        const place = new Place(F, BigInt(p), primeIndex);
        const mats = gens.map((M) => ({ a: F.fromT(M.a), b: F.fromT(M.b), c: F.fromT(M.c), d: F.fromT(M.d) }));
        const r = decide(place, mats, base, { seconds });
        self.postMessage({ id, ok: true, result: serializeDecision(F, r) });
    } catch (e) {
        self.postMessage({ id, ok: false, error: e.message || String(e) });
    }
};
