// Runs Regina (WebAssembly) off the main thread.
// Messages in: {id, fn, args}. Messages out: {id, result} or {id, error}.
import createRegina from '../wasm/regina.js';

const ready = createRegina({
  locateFile: (p) => new URL('../wasm/' + p, import.meta.url).href,
  print: () => {},
  printErr: () => {},
});

ready.then(
  (R) => postMessage({ ready: true, version: JSON.parse(R.version()) }),
  (e) => postMessage({ ready: false, error: String(e) })
);

onmessage = async (ev) => {
  const { id, fn, args } = ev.data;
  try {
    const R = await ready;
    if (typeof R[fn] !== 'function') throw new Error('Unknown engine function ' + fn);
    const out = JSON.parse(R[fn](...args));
    if (out && out.error) postMessage({ id, error: out.error });
    else postMessage({ id, result: out });
  } catch (e) {
    postMessage({ id, error: e && e.message ? e.message : String(e) });
  }
};
