/**
 * Web Worker running the domain / certificate / invariants pipeline off the
 * main thread, so the page stays responsive while a large domain is built.
 * Messages: {id, input} in; {id, result} or {id, error} out.
 */
let runCompute = null;

self.onmessage = async (ev) => {
    const { id, input, version } = ev.data;
    try {
        if (!runCompute) {
            // Versioned import so a new release is not served from a stale cache.
            ({ runCompute } = await import(`./compute.js${version ? `?v=${version}` : ''}`));
        }
        const result = runCompute(input);
        self.postMessage({ id, result });
    } catch (e) {
        self.postMessage({ id, error: e && e.message ? e.message : String(e) });
    }
};
