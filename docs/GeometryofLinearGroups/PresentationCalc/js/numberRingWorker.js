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
let mod = null, failed = null;
const queue = [];
function handle(data) {
    const { id, poly, rows, words, seconds, wordSeconds, express } = data;
    let result;
    try {
        if (failed) throw new Error(failed);
        if (!mod.numberRingApplies(poly)) result = { applies: false };
        else result = { applies: true, ...mod.indexInPGL2O(poly, rows, words, { seconds: seconds ?? 20, wordSeconds: wordSeconds ?? 20, express: !!express }) };
    } catch (e) { result = { index: null, error: e.message || String(e) }; }
    self.postMessage({ id, result: JSON.parse(JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v))) });
}
self.onmessage = (ev) => { if (mod || failed) handle(ev.data); else queue.push(ev.data); };
import('./numberRingIndex.js')
    .then((m) => { mod = m; })
    .catch((e) => { failed = `the presentation engine failed to load: ${e.message || e}`; })
    .finally(() => { for (const d of queue.splice(0)) handle(d); });
