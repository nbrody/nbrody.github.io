// The notebook's connection to its Python kernel: a sandboxed process the
// server keeps alive while the notebook is open (server/kernels.mjs inside
// alphaCentaur, python/server.mjs on its own). The page starts a session,
// listens to it with server-sent events, and posts messages to it.
//
//   spec = {start, base, headers, body}
//   POST start (body)                → {session}
//   GET  base + session + '/events'  → one JSON kernel message per event
//   POST base + session + '/send'      {msg}
//   POST base + session + '/interrupt'
//   POST base + session + '/stop'
export class KernelClient {
  constructor(spec, onMessage) {
    this.spec = spec;
    this.onMessage = onMessage;
    this.session = null;
    this.events = null;
    this.closed = false;
    this.leave = () => this.stop(true);
  }
  url(path) { return `${this.spec.base}${encodeURIComponent(this.session)}/${path}`; }
  async post(url, body, keepalive = false) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.spec.headers || {}) },
      body: JSON.stringify(body ?? {}),
      keepalive,
    });
    let data = null;
    try { data = await res.json(); } catch { /* an empty reply */ }
    if (!res.ok) throw new Error(data?.error || `The kernel server answered ${res.status}.`);
    return data;
  }
  async start() {
    const { session } = await this.post(this.spec.start, this.spec.body || {});
    if (this.closed) { this.post(`${this.spec.base}${encodeURIComponent(session)}/stop`, {}, true).catch(() => {}); return; }
    this.session = session;
    const events = new EventSource(this.url('events'));
    this.events = events;
    events.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg);
      if (msg.type === 'dead') this.disconnect();
    };
    // EventSource retries on its own; once it gives up, the session is gone.
    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED && this.events === events && !this.closed) {
        this.disconnect();
        this.onMessage({ type: 'dead', reason: 'exited', message: 'The connection to the kernel closed.' });
      }
    };
    addEventListener('pagehide', this.leave);
  }
  // Messages go one at a time, in order: a sync must arrive before the run after it.
  send(msg) {
    this.chain = (this.chain || Promise.resolve()).then(() => {
      if (!this.session || this.closed) return;
      return this.post(this.url('send'), { msg }).catch(e => this.onMessage({ type: 'log', text: `Could not reach the kernel: ${e.message}\n` }));
    });
    return this.chain;
  }
  interrupt() {
    if (!this.session || this.closed) return Promise.resolve();
    return this.post(this.url('interrupt'), {}).catch(() => {});
  }
  disconnect() {
    this.events?.close();
    this.events = null;
    removeEventListener('pagehide', this.leave);
  }
  // Ends the session (keepalive so it still reaches the server as the page closes).
  stop(keepalive = false) {
    if (this.closed) return;
    this.closed = true;
    const session = this.session;
    this.disconnect();
    if (session) this.post(`${this.spec.base}${encodeURIComponent(session)}/stop`, {}, keepalive).catch(() => {});
  }
}
