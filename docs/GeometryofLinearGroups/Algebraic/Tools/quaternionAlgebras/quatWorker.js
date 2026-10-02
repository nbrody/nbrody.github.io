/* Runs quatEngine off the main thread. Message in: { id, f, a, b }; out: { id, result }. */
importScripts('../numberRings/ringEngine.js', '../zariskiClosure/pgl2Engine.js', 'quatEngine.js');

self.onmessage = (e) => {
    const { id, f, a, b } = e.data;
    let result;
    try {
        result = self.QuatEngine.analyze(f, a, b);
    } catch (err) {
        result = { ok: false, error: err.message };
    }
    self.postMessage({ id, result });
};
