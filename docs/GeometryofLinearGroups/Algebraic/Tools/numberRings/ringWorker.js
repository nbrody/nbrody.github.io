/* Runs ringEngine off the main thread. Message in: { id, f, elements }; out: { id, result }. */
importScripts('ringEngine.js');

self.onmessage = (e) => {
    const { id, f, elements } = e.data;
    let result;
    try {
        result = self.NumberRingEngine.compute(f, elements);
    } catch (err) {
        result = { ok: false, error: err.message };
    }
    self.postMessage({ id, result });
};
