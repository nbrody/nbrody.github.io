// Khet AI client — a thin async wrapper around the AI Web Worker.
// Keeps all heavy MCTS/NN work off the main thread. If the browser can't
// spawn a module worker (e.g. opened from file://), it transparently falls
// back to running the AI in-thread so the game still works.

import { KhetGame } from './engine.js';

export class AIClient {
    constructor(weightsUrl) {
        this.weightsUrl = weightsUrl;
        this.loaded = false;
        this.worker = null;
        this.reqId = 0;
        this.pending = new Map();   // reqId → { resolve, onProgress }
        this._fallback = null;      // in-thread { nn, makeAI } if no worker

        this.ready = this._start();
    }

    async _start() {
        try {
            this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = (e) => this._onMessage(e.data);
            this.worker.onerror = () => { /* surfaced via fallback on first move */ };
            const loaded = await new Promise((resolve) => {
                this._readyResolve = resolve;
                this.worker.postMessage({ type: 'init', weightsUrl: this.weightsUrl });
                // If the worker never reports back (CSP/file://), fall back.
                setTimeout(() => resolve(null), 8000);
            });
            if (loaded === null) throw new Error('worker init timed out');
            this.loaded = loaded;
            return loaded;
        } catch (err) {
            console.warn('AI worker unavailable, running in-thread:', err);
            return this._startFallback();
        }
    }

    async _startFallback() {
        const [{ KhetAI }, { KhetNN }] = await Promise.all([
            import('./ai.js'),
            import('./nn.js'),
        ]);
        const nn = new KhetNN();
        this.loaded = await nn.loadWeights(this.weightsUrl);
        this._fallback = { nn, KhetAI, cache: new Map() };
        return this.loaded;
    }

    _onMessage(msg) {
        if (msg.type === 'ready') {
            if (this._readyResolve) this._readyResolve(msg.loaded);
            return;
        }
        const entry = this.pending.get(msg.reqId);
        if (!entry) return;
        if (msg.type === 'progress') {
            entry.onProgress?.(msg);
        } else if (msg.type === 'result') {
            this.pending.delete(msg.reqId);
            entry.resolve(msg.move);
        }
    }

    /**
     * Choose a move for the side to play in `game`.
     * @returns {Promise<object|null>} the chosen move
     */
    chooseMove(game, difficulty, onProgress) {
        if (this._fallback) return this._chooseFallback(game, difficulty, onProgress);

        const reqId = ++this.reqId;
        return new Promise((resolve) => {
            this.pending.set(reqId, { resolve, onProgress });
            this.worker.postMessage({ type: 'move', reqId, state: game.serialize(), difficulty });
        });
    }

    async _chooseFallback(game, difficulty, onProgress) {
        const { nn, KhetAI, cache } = this._fallback;
        let ai = cache.get(difficulty);
        if (!ai) { ai = new KhetAI(difficulty, nn); cache.set(difficulty, ai); }
        ai.onProgress = onProgress || null;
        // Yield once so the "thinking" UI can paint before we block the thread.
        await new Promise((r) => setTimeout(r, 16));
        const clone = KhetGame.fromSerialized(game.serialize());
        const move = ai.chooseMove(clone);
        ai.onProgress = null;
        return move;
    }
}
