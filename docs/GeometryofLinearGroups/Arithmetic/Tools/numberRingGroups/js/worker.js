// Module worker: runs the computation off the main thread and keeps its state for word queries.
import { computeAll } from './engine.js';
import { summarize, wordForEntries, randomEntries } from './report.js';

let current = null;
self.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === 'compute') {
        current = null;
        try {
            let last = 0;
            const progress = (p) => { const t = Date.now(); if (t - last > 120 || p.phase === 'done') { last = t; self.postMessage({ type: 'progress', ...p }); } };
            const R = computeAll(msg.src, { name: msg.name || null, seconds: msg.seconds || 120, progress });
            current = R;
            self.postMessage({ type: 'result', id: msg.id, data: summarize(R) });
        } catch (e) {
            self.postMessage({ type: 'error', id: msg.id, message: e.message || String(e) });
        }
    } else if (msg.type === 'random') {
        if (current) self.postMessage({ type: 'random', entries: randomEntries(current) });
    } else if (msg.type === 'word') {
        try {
            if (!current) throw new Error('compute a field first');
            const out = wordForEntries(current, msg.entries);
            self.postMessage({ type: 'word', id: msg.id, ...out });
        } catch (e) {
            self.postMessage({ type: 'word-error', id: msg.id, message: e.message || String(e) });
        }
    }
};
self.postMessage({ type: 'ready' });
