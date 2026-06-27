/**
 * worker.js — runs the discreteness analysis off the main thread.
 * Receives canonical integer matrix entries (strings), returns a wire-format result.
 */
import { Mat2Q } from './mat2.js';
import { computeAnalysis, toWire } from './compute.js';

self.onmessage = (e) => {
    const { id, entries, opts } = e.data;
    try {
        const mats = entries.map(r => new Mat2Q(r[0], r[1], r[2], r[3]));
        self.postMessage({ id, ok: true, wire: toWire(computeAnalysis(mats, opts)) });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};
