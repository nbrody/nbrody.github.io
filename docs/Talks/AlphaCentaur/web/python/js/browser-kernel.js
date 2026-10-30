// A kernel that runs in the browser instead of on a server: a Web Worker with
// Pyodide (webdemo/pykernel/worker.js), used when the page sets
//   globalThis.alphaPyBrowserKernel = { worker: '<address of worker.js>' }
// before the editor starts (scripts/build-web-demo.mjs does this for the web
// demo). It has KernelClient's interface and sends and receives the same JSON
// messages as python/kernel/kernel_main.py. A browser can't interrupt Python
// that is running, so Interrupt stops the worker; Restart starts a new one.
export class BrowserKernelClient {
  constructor(spec, onMessage) {
    this.spec = spec;
    this.onMessage = onMessage;
    this.worker = null;
    this.closed = false;
  }
  async start() {
    const worker = new Worker(new URL(this.spec.browser.worker, location.href));
    this.worker = worker;
    worker.onmessage = e => {
      if (this.worker !== worker) return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg);
    };
    worker.onerror = e => {
      if (this.worker !== worker || this.closed) return;
      this.disconnect();
      this.onMessage({ type: 'dead', reason: 'exited', message: `the in-browser Python could not run (${e.message || 'unknown error'})` });
    };
  }
  send(msg) {
    this.worker?.postMessage(JSON.stringify(msg));
    return Promise.resolve();
  }
  interrupt() {
    if (!this.worker || this.closed) return Promise.resolve();
    this.disconnect();
    this.onMessage({ type: 'dead', reason: 'killed', message: 'interrupted (a browser can only interrupt Python by stopping it); press Restart' });
    return Promise.resolve();
  }
  disconnect() {
    this.worker?.terminate();
    this.worker = null;
  }
  stop() {
    this.closed = true;
    this.disconnect();
  }
}
