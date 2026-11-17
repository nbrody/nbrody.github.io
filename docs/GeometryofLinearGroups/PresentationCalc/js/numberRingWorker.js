/**
 * Worker for coset enumeration in PGL₂(O_k) on the Voronoi presentation (numberRingIndex.js), off the
 * page's thread: building the presentation can take several seconds for cubic fields.
 *
 * numberRingIndex.js loads the ring engine with a top-level await, and a module worker that is still
 * evaluating drops the messages it receives; so this module has no static imports, listens at once,
 * and queues messages until the engine has loaded.
 *
 * In:  { id, poly (text in w), rows (generators as ringEngine text), words (letters ±(i+1)), seconds, express }
 * Out: { id, result } (indexInPGL2O's record, { applies: false }, or { index: null, error }).
 */
let mod = null, presMod = null, failed = null;
const queue = [];
function handle(data) {
    const { id, cmd, poly, polySrc, rows, words, seconds, wordSeconds, express, maxIndex } = data;
    if (cmd === 'presentation') {
        try {
            if (failed) throw new Error(failed);
            const p = polySrc ?? poly;
            const L = mod.ringPresentation(p, { cache: true, seconds: seconds ?? 60 });
            const R = presMod.presentationReportNumberRing(p, rows, { maxIndex: maxIndex ?? 20000, seconds: seconds ?? 20, presentation: L });
            self.postMessage({ id, result: JSON.parse(JSON.stringify(R, (k, v) => (typeof v === 'bigint' ? String(v) : v))) });
        } catch (e) {
            self.postMessage({ id, error: e.message || String(e) });
        }
        return;
    }
    let result;
    try {
        if (failed) throw new Error(failed);
        if (!mod.numberRingApplies(poly)) result = { applies: false };
        else {
            const L = mod.ringPresentation(poly, { cache: true, seconds: seconds ?? 60 });
            result = { applies: true, ...mod.indexInPGL2O(poly, rows, words, { seconds: seconds ?? 20, wordSeconds: wordSeconds ?? 20, express: !!express, presentation: L }) };
        }
    } catch (e) { result = { index: null, error: e.message || String(e) }; }
    self.postMessage({ id, result: JSON.parse(JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v))) });
}
self.onmessage = (ev) => { if ((mod && presMod) || failed) handle(ev.data); else queue.push(ev.data); };
Promise.all([import('./numberRingIndex.js'), import('./numberRingPresentation.js')])
    .then(([m, pm]) => { mod = m; presMod = pm; })
    .catch((e) => { failed = `the presentation engine failed to load: ${e.message || e}`; })
    .finally(() => { for (const d of queue.splice(0)) handle(d); });
