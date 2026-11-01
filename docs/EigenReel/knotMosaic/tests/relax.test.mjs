// node tests/relax.test.mjs [key…] — relax library mosaics, report time, frames, and the smallest strand gap.
import { LIBRARY, curves } from '../mosaic.js';
import { buildLink, step, snapshot, minGap, record } from '../relax.js';

const keys = process.argv.slice(2);
let fail = 0;
for (const e of LIBRARY) {
  if (keys.length && !keys.includes(e.key)) continue;
  const g = e.grid();
  const { comps } = curves(g);
  const link = buildLink(comps, { h: 0.2, tubeR: +(process.env.TR || 0.11), alpha: +(process.env.AL || 4), bend: +(process.env.BM || 0.02) });
  const g0 = minGap(link, 4);
  let gMin = g0, tGap = 0;
  const t0 = performance.now();
  const frames = record(link, {
    onFrame: () => { const t = performance.now(); gMin = Math.min(gMin, minGap(link, 4)); tGap += performance.now() - t; },
  });
  const ms = performance.now() - t0 - tGap;
  const f = frames[frames.length - 1];
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < f.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], f[i + c]); hi[c] = Math.max(hi[c], f[i + c]); }
  const h = link.chains[0].h, r = link.chains[0].tubeR;
  console.log(`${e.key.padEnd(11)} n=${String(link.n).padStart(4)} steps=${String(link.steps).padStart(5)} frames=${String(frames.length).padStart(4)} ${ms.toFixed(0).padStart(6)} ms  gap0=${g0.toFixed(3)} minGap=${gMin.toFixed(3)} (h=${h.toFixed(3)} r=${r.toFixed(3)})  box=${hi.map((v, c) => (v - lo[c]).toFixed(2)).join('×')}  E=${link.energy.toFixed(2)}`);
  if (gMin < 0.4) { fail++; console.log('   FAIL: strands came too close'); }
}
process.exit(fail ? 1 : 0);
