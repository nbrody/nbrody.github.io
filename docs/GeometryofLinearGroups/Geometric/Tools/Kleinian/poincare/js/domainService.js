/**
 * Client for the domain worker, with a main-thread fallback.
 *
 * Requests are coalesced: while one computation runs, only the most recent
 * pending request is kept (older ones resolve as `{stale: true}`), which is
 * what a slider being dragged wants. If a module worker cannot be created —
 * file:// pages, old browsers — the same pipeline runs on the main thread.
 */
export function createDomainService({ version = '' } = {}) {
    let worker = null;
    let useWorker = true;
    let busy = false;
    let pending = null;              // {input, resolve}
    let nextId = 1;
    const inflight = new Map();

    function spawn() {
        try {
            worker = new Worker(new URL(`./domainWorker.js${version ? `?v=${version}` : ''}`, import.meta.url),
                { type: 'module' });
            worker.onmessage = (ev) => {
                const { id, result, error } = ev.data;
                const job = inflight.get(id);
                inflight.delete(id);
                if (job) job.resolve(error ? { error } : { result });
                finish();
            };
            worker.onerror = (ev) => {
                // A load failure (no module-worker support): fall back for good.
                ev.preventDefault?.();
                console.warn('[domain worker] unavailable, computing on the main thread:', ev.message || ev);
                useWorker = false;
                worker = null;
                for (const job of inflight.values()) runLocal(job.input).then(job.resolve);
                inflight.clear();
                busy = false;
                drain();
            };
        } catch (e) {
            useWorker = false;
            worker = null;
        }
    }

    async function runLocal(input) {
        await new Promise(r => setTimeout(r, 0));    // let the page paint first
        try {
            const { runCompute } = await import(`./compute.js${version ? `?v=${version}` : ''}`);
            return { result: runCompute(input) };
        } catch (e) {
            return { error: e.message };
        }
    }

    function finish() {
        busy = false;
        drain();
    }

    function drain() {
        if (busy || !pending) return;
        const job = pending;
        pending = null;
        busy = true;
        if (useWorker && !worker) spawn();
        if (useWorker && worker) {
            const id = nextId++;
            inflight.set(id, job);
            worker.postMessage({ id, input: job.input, version });
        } else {
            runLocal(job.input).then((res) => { job.resolve(res); finish(); });
        }
    }

    return {
        /** Resolve with {result} | {error} | {stale: true}. */
        request(input) {
            return new Promise((resolve) => {
                if (pending) pending.resolve({ stale: true });
                pending = { input, resolve };
                drain();
            });
        },
        get busy() { return busy; },
        get usingWorker() { return useWorker && !!worker; }
    };
}
