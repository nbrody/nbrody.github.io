// cascade-worker.mjs — evaluates batches of family parameters for build-cascade.mjs.
import { parentPort } from 'node:worker_threads';
import { classifySim, familySim } from './xia-lib.mjs';

let fam = null;
parentPort.on('message', (msg) => {
  if (msg.type === 'family') { fam = msg.fam; parentPort.postMessage({ id: msg.id, ok: true }); return; }
  const out = msg.ps.map(p => {
    // Step budget: long temporary captures near a triple collision count as a failed bounce.
    const r = classifySim(familySim(fam, p), 30, { maxSteps: 150000 });
    return { score: r.score, enc: r.enc };
  });
  parentPort.postMessage({ id: msg.id, out });
});
