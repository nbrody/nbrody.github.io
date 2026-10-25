/* Runs the Zariski Closure analysis off the main thread. Message in: { id, state, opts? } (or { id, src } for text); out: { id, result }.
   opts = { congruence: false } skips the congruence closure (the Presentation Calculator runs it separately). */
importScripts('../numberRings/ringEngine.js', 'pgl2Engine.js', '../expressionParser/exprEngine.js', 'zariskiInput.js');

self.onmessage = (e) => {
    const { id, state, src, opts } = e.data;
    let result;
    try {
        result = state ? self.ZariskiInput.analyze(state, opts || {}) : self.PGL2Engine.analyze(src);
    } catch (err) {
        result = { ok: false, error: err.message };
    }
    self.postMessage({ id, result });
};
