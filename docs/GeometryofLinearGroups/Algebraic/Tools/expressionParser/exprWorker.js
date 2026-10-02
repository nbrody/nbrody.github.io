/* Runs exprEngine off the main thread. Message in: { id, expr, vars }; out: { id, result }. */
importScripts('../numberRings/ringEngine.js', '../zariskiClosure/pgl2Engine.js', 'exprEngine.js');

self.onmessage = (e) => {
    const { id, expr, vars } = e.data;
    let result;
    try {
        result = self.ExprEngine.evaluate(expr, vars);
    } catch (err) {
        result = { ok: false, error: err.message, vars: [] };
    }
    self.postMessage({ id, result });
};
