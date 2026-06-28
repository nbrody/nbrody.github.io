// Khet AI Web Worker
// Runs the neural-network-guided MCTS off the main thread so the board never
// freezes while the AI is thinking. Communicates with main.js by message:
//
//   main → worker  { type: 'init', weightsUrl }
//   worker → main  { type: 'ready', loaded }
//   main → worker  { type: 'move', reqId, state, difficulty }
//   worker → main  { type: 'progress', reqId, iterations, total }
//   worker → main  { type: 'result', reqId, move, elapsedMs }

import { KhetGame } from './engine.js';
import { KhetAI } from './ai.js';
import { KhetNN } from './nn.js';

let nn = null;
let ai = null;
let aiDifficulty = null;

async function init(weightsUrl) {
    nn = new KhetNN();
    const loaded = await nn.loadWeights(weightsUrl);
    self.postMessage({ type: 'ready', loaded });
}

function getAI(difficulty) {
    if (!ai || aiDifficulty !== difficulty) {
        ai = new KhetAI(difficulty, nn);
        aiDifficulty = difficulty;
    }
    return ai;
}

self.onmessage = async (e) => {
    const msg = e.data;

    if (msg.type === 'init') {
        await init(msg.weightsUrl);
        return;
    }

    if (msg.type === 'move') {
        const { reqId, state, difficulty } = msg;
        if (!nn || !nn.loaded) {
            self.postMessage({ type: 'result', reqId, move: null, elapsedMs: 0 });
            return;
        }
        const game = KhetGame.fromSerialized(state);
        const engine = getAI(difficulty);

        // Throttle progress posts to keep the message channel light.
        let lastPost = 0;
        engine.onProgress = ({ iterations, total }) => {
            const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            if (t - lastPost > 120 || iterations >= total) {
                lastPost = t;
                self.postMessage({ type: 'progress', reqId, iterations, total });
            }
        };

        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const move = engine.chooseMove(game);
        const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        engine.onProgress = null;

        self.postMessage({ type: 'result', reqId, move, elapsedMs });
    }
};
