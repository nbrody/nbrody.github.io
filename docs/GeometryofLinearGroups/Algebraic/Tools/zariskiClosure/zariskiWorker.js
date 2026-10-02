/* Runs the Zariski Closure analysis off the main thread. Message in: { id, state } (or { id, src } for text); out: { id, result }. */
importScripts('../numberRings/ringEngine.js', 'pgl2Engine.js', '../expressionParser/exprEngine.js', 'zariskiInput.js');

self.onmessage = (e) => {
    const { id, state, src } = e.data;
    let result;
    try {
        result = state ? self.ZariskiInput.analyze(state) : self.PGL2Engine.analyze(src);
    } catch (err) {
        result = { ok: false, error: err.message };
    }
    self.postMessage({ id, result });
};
