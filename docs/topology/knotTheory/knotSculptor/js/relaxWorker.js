// Module worker: runs the relaxation flow and streams frames back to the page.
import { Relaxer } from './relax.js';

let job = null;

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'start') {
    job = { id: m.id, relaxer: new Relaxer(m.components, m.options || {}), maxSteps: m.maxSteps || 4000 };
    loop(job);
  } else if (m.type === 'stop') {
    job = null;
  }
};

function loop(j) {
  if (job !== j) return;
  const t0 = performance.now();
  let info;
  while (performance.now() - t0 < 24 && !j.relaxer.converged && j.relaxer.steps < j.maxSteps) info = j.relaxer.step();
  const comps = j.relaxer.comps.map(p => Float64Array.from(p));
  const done = j.relaxer.converged || j.relaxer.steps >= j.maxSteps;
  self.postMessage({ type: 'frame', id: j.id, components: comps, steps: j.relaxer.steps, energy: info?.energy, done },
    comps.map(c => c.buffer));
  if (done) { job = null; return; }
  setTimeout(() => loop(j), 0);
}
