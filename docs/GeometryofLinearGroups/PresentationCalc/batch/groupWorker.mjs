/** One worker thread of batch/run.mjs: the pipeline on one group per message. */
import { parentPort } from 'node:worker_threads';
import { runGroup } from './pipeline.mjs';

parentPort.on('message', ({ state, settings }) => {
    try {
        parentPort.postMessage({ result: runGroup(state, settings) });
    } catch (e) {
        parentPort.postMessage({ error: e && e.message ? e.message : String(e) });
    }
});
parentPort.postMessage({ ready: true });
