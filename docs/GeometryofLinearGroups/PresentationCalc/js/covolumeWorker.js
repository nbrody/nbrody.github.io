/* ζ_k(2) for Borel's volume formula (zeta.js), off the main thread. In: { id, k } (the Zariski engine's field data); out: { id, zeta } or { id, error }. */
importScripts('../../Algebraic/Tools/numberRings/ringEngine.js', 'zeta.js');

self.onmessage = (e) => {
    const { id, k } = e.data;
    try {
        self.postMessage({ id, zeta: self.Zeta.zetaK2(k) });
    } catch (err) {
        self.postMessage({ id, error: err.message });
    }
};
