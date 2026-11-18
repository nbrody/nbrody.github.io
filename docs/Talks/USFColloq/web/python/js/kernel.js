// Static/demo KernelClient for AlphaPy: replays recorded marimo cell outputs
// (mo.md, matplotlib figures, python-flint tables, widgets) immediately on load.
const RECORDED_URL = new URL('../../data/python/ping_pong_recorded.json', import.meta.url);

export class KernelClient {
  constructor(spec, onMessage) {
    this.spec = spec;
    this.onMessage = onMessage;
    this.closed = false;
    this.recorded = [];
    this.cellIds = [];
  }
  async start() {
    try {
      const r = await fetch(RECORDED_URL);
      if (r.ok) this.recorded = await r.json();
    } catch {}
    if (this.closed) return;
    const ready = this.recorded.find(m => m.type === 'ready') || { type: 'ready', python: '3.13', flint: '0.9.0' };
    setTimeout(() => { if (!this.closed) this.onMessage(ready); }, 10);
  }
  send(msg) {
    if (this.closed || !msg) return Promise.resolve();
    if (msg.type === 'sync' && Array.isArray(msg.cells)) {
      this.cellIds = msg.cells.map(c => c.id);
      const mapId = id => {
        const m = /^cell_(\d+)$/.exec(String(id));
        return m && this.cellIds[+m[1]] ? this.cellIds[+m[1]] : id;
      };
      const graph = this.recorded.find(m => m.type === 'graph');
      if (graph) {
        this.onMessage({
          type: 'graph',
          cells: (graph.cells || []).map(c => ({ ...c, id: mapId(c.id) })),
        });
      }
      return Promise.resolve();
    }
    if (msg.type === 'run_all' || msg.type === 'run') {
      const mapId = id => {
        const m = /^cell_(\d+)$/.exec(String(id));
        return m && this.cellIds[+m[1]] ? this.cellIds[+m[1]] : id;
      };
      const want = msg.type === 'run' && Array.isArray(msg.ids) ? new Set(msg.ids) : null;
      setTimeout(() => {
        if (this.closed) return;
        for (const m of this.recorded) {
          if (m.type === 'ready' || m.type === 'graph') continue;
          if (m.type === 'queued') {
            const ids = (m.ids || []).map(mapId).filter(id => !want || want.has(id));
            if (ids.length) this.onMessage({ ...m, ids });
          } else if (m.type === 'cell' || m.type === 'console') {
            const id = mapId(m.id);
            if (!want || want.has(id)) this.onMessage({ ...m, id });
          } else if (m.type === 'idle') {
            this.onMessage(m);
          }
        }
      }, 20);
    }
    return Promise.resolve();
  }
  interrupt() { return Promise.resolve(); }
  disconnect() {}
  stop() { this.closed = true; }
}
