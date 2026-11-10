// Promise wrapper around the Regina worker. Calls run one at a time; stop()
// kills the worker (Regina cannot be interrupted mid-computation) and starts
// a fresh one.

const listeners = new Set();
let worker = null;
let readyPromise = null;
let nextId = 1;
const pending = new Map();
let queue = Promise.resolve();
let busyCount = 0;
let generation = 0; // bumped by stop(), so cancelled calls don't touch busyCount

function emit(state, info) { for (const f of listeners) f(state, info); }

function start() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  emit('loading');
  readyPromise = new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const m = ev.data;
      if ('ready' in m) {
        if (m.ready) { emit('ready', m.version); resolve(m.version); }
        else { emit('error', m.error); reject(new Error(m.error)); }
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if ('error' in m) {
        // After running out of memory (or a wasm abort) the engine's state is
        // unreliable, so start a fresh one.
        const fatal = /bad_alloc|memory|abort|RuntimeError|unreachable/i.test(m.error);
        p.reject(new Error(fatal ? 'Regina ran out of memory on this computation (the engine has been restarted).' : m.error));
        if (fatal) restart();
      } else p.resolve(m.result);
    };
    worker.onerror = (e) => { emit('error', e.message); reject(new Error(e.message || 'Worker failed')); };
  });
  readyPromise.catch(() => {});
}

export function onStatus(f) { listeners.add(f); }
export function ready() { if (!worker) start(); return readyPromise; }

export function call(fn, ...args) {
  if (!worker) start();
  const run = async () => {
    await readyPromise;
    const gen = generation;
    busyCount++; emit('busy', fn);
    try {
      return await new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, fn, args });
      });
    } finally {
      if (gen === generation) { busyCount--; if (busyCount === 0) emit('ready'); }
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

function restart() {
  if (worker) worker.terminate();
  for (const p of pending.values()) p.reject(new Error('Stopped'));
  pending.clear();
  busyCount = 0;
  generation++;
  queue = Promise.resolve();
  start();
}

export function stop() { restart(); }
