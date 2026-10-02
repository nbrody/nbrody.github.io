/**
 * Runs the discreteness decision off the main thread. The page sends the
 * field, prime, generators (as exact plain text) and base vertex; the reply is
 * the decision with matrices formatted as text and TeX.
 */
import '../../../../../Algebraic/Tools/numberRings/ringEngine.js';   // sets self.NumberRingEngine
import { GlobalField, Place } from './localField.js';
import { decide, serializeDecision } from './discreteness.js';

self.onmessage = (ev) => {
    const { id, spec, p, primeIndex, mats, base, seconds } = ev.data;
    try {
        const F = new GlobalField(spec);
        const place = new Place(F, BigInt(p), primeIndex);
        const ms = mats.map((m) => { const [a, b, c, d] = m.map((s) => F.parse(s)); return { a, b, c, d }; });
        const r = decide(place, ms, base, { seconds });
        self.postMessage({ id, ok: true, result: serializeDecision(F, r) });
    } catch (e) {
        self.postMessage({ id, ok: false, error: e.message || String(e) });
    }
};
