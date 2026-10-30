// alphaPy's kernel in the browser: a Web Worker running Pyodide (Python and
// python-flint, numpy and matplotlib compiled to WebAssembly), with alphaPy's own
// runtime (python/kernel/alphapy, copied to kernel/ by scripts/build-web-demo.mjs).
// It speaks the same JSON messages as python/kernel/kernel_main.py; the page's
// side is python/js/browser-kernel.js. Pyodide comes from the jsdelivr CDN
// (Pyodide 0.29.5 is the release that has python-flint) and is cached by the
// browser after the first visit.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/';
importScripts(PYODIDE + 'pyodide.js');

const post = msg => postMessage(JSON.stringify(msg));
const log = text => post({ type: 'log', text: text + '\n' });
const base = new URL('./', self.location.href);

// Messages that arrive while Python is loading wait their turn.
let handle = null;
const waiting = [];
onmessage = e => { if (handle) handle(e.data); else waiting.push(e.data); };

(async () => {
  try {
    log('Loading Python into your browser (a few seconds the first time)…');
    const py = await loadPyodide({ indexURL: PYODIDE });
    const files = await (await fetch(new URL('files.json', base))).json();
    for (const path of files) {
      const text = await (await fetch(new URL('kernel/' + path, base))).text();
      const dir = '/kernel/' + path.split('/').slice(0, -1).join('/');
      py.FS.mkdirTree(dir);
      py.FS.writeFile('/kernel/' + path, text);
    }
    log('Loading numpy, matplotlib and python-flint…');
    await py.loadPackage(['numpy', 'matplotlib', 'python-flint']);
    py.runPython(await (await fetch(new URL('driver.py', base))).text());
    const pyHandle = py.globals.get('handle');
    handle = raw => {
      try { pyHandle(raw); } catch (e) { log(`alphaPy kernel: ${e.message}`); post({ type: 'idle' }); }
    };
    waiting.splice(0).forEach(handle);
  } catch (e) {
    post({ type: 'dead', reason: 'exited', message: `the in-browser Python did not start (${e.message || e})` });
  }
})();
