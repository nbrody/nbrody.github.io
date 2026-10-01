/* Runs pgl2Engine off the main thread. Message in: { id, src }; out: { id, result }. */
importScripts('../numberRings/ringEngine.js', 'pgl2Engine.js');

self.onmessage = (e) => {
    const { id, src } = e.data;
    let result;
    try {
        result = self.PGL2Engine.analyze(src);
    } catch (err) {
        result = { ok: false, error: err.message };
    }
    self.postMessage({ id, result });
};
