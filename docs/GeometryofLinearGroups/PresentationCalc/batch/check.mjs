// Regression: the curated examples' categories (js/examples.js) against the headless pipeline.
//   node batch/check.mjs [--fast]
import { runGroup } from './pipeline.mjs';
import { CURATED } from '../js/examples.js';
const fast = process.argv.includes('--fast');
const want = { 'S-arithmetic: certified': 'sarith', 'Discrete at a place': 'discrete', 'Not Zariski dense': 'notdense', 'No certificate': 'open' };
let bad = 0;
for (const ex of CURATED) {
    const t0 = Date.now();
    const r = runGroup({ mats: ex.mats, anti: ex.mats.map(() => false), consts: ex.consts || [] }, fast ? { beamSeconds: 20 } : {});
    const ok = r.verdict === want[ex.cat];
    if (!ok) bad++;
    const disc = (r.places || []).filter((p) => p.status === 'discrete').map((p) => `${p.kind === 'finite' ? 'Q' + p.p : p.kind}: ${p.headline}`).join('; ');
    console.log(`${ok ? 'ok ' : 'BAD'} ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${r.verdict.padEnd(8)} ${r.why ? `(${r.why}) ` : ''}${ex.name}${disc ? '  — ' + disc : ''}`);
}
console.log(bad ? `${bad} mismatches` : 'all match');
process.exit(bad ? 1 : 0);
