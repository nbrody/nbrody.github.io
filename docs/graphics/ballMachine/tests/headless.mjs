// Headless run of the machine: build it, report track diagnostics, simulate
// for a while and summarise what happened.  node tests/headless.mjs [seconds] [balls]
import { buildMachine } from '../js/sim/layout.js';

const secs = +(process.argv[2] ?? 300);
const nBalls = +(process.argv[3] ?? 30);
const t0 = performance.now();
const m = buildMachine({ balls: nBalls });
const { world } = m;
console.log(`built in ${(performance.now() - t0).toFixed(0)} ms: ${world.tracks.length} tracks, ${world.colliders.length} colliders, ${world.devices.length} devices`);
if (m.warnings.length) console.log('BUILD WARNINGS:\n  ' + m.warnings.join('\n  '));

// --- track diagnostics
let total = 0;
const rows = [];
for (const t of world.tracks) {
  total += t.L;
  let vmax = 0, gmax = 0, bankMax = 0;
  for (let i = 0; i < t.n; i++) {
    const v = t.vnom[i];
    vmax = Math.max(vmax, v);
    const k = Math.hypot(t.K[3 * i], t.K[3 * i + 1], t.K[3 * i + 2]);
    gmax = Math.max(gmax, v * v * k / 9.81);
    const uy = t.U[3 * i + 1];
    bankMax = Math.max(bankMax, Math.acos(Math.max(-1, Math.min(1, uy))) * 180 / Math.PI);
  }
  rows.push({ name: t.name, L: t.L.toFixed(2), y0: t.start.y.toFixed(2), y1: t.end.y.toFixed(2), v0: t.v0.toFixed(2), vEnd: t.vEnd.toFixed(2), vmax: vmax.toFixed(2), g: gmax.toFixed(2), bank: bankMax.toFixed(0), stall: t.stall >= 0 ? t.stall.toFixed(2) : '' });
}
console.table(rows);
console.log(`total track length ${total.toFixed(1)} m`);

// --- simulate
const counts = {};
const sounds = {};
const branchCount = {};
const warns = [];
const melodyTimes = {}; // ball -> [t of each marimba note]
const t1 = performance.now();
const dt = 1 / 60;
let lastReport = 0;
for (let t = 0; t < secs; t += dt) {
  world.advance(dt);
  for (const e of world.drainEvents()) {
    counts[e.type] = (counts[e.type] || 0) + 1;
    if (e.type === 'sound') sounds[e.instrument] = (sounds[e.instrument] || 0) + 1;
    if (e.type === 'branch') branchCount[e.branch] = (branchCount[e.branch] || 0) + 1;
    if (e.type === 'warn') warns.push(e);
    if (e.type === 'sound' && e.instrument === 'marimba') {
      (melodyTimes[e.t.toFixed(0)] ||= []);
    }
  }
  if (world.t - lastReport > 60) {
    lastReport = world.t;
    const modes = {};
    for (const b of world.balls) modes[b.mode] = (modes[b.mode] || 0) + 1;
    const q = world.balls.filter((b) => b.mode === 'track' && b.track === m.collector && b.s > m.collector.L - 1.2 && Math.abs(b.v) < 0.05).length;
    console.log(`t=${world.t.toFixed(0)}s modes=${JSON.stringify(modes)} queue≈${q} lifted=${m.lift.lifted}`);
  }
}
const el = (performance.now() - t1) / 1000;
console.log(`simulated ${secs}s in ${el.toFixed(2)}s (${(secs / el).toFixed(0)}x realtime)`);
console.log('events', counts);
console.log('sounds', sounds);
console.log('branches', branchCount);
console.log('stats', world.stats);
const wsum = {};
for (const w of warns) { const k = `${w.why} @ ${w.track || JSON.stringify(w.at)}`; wsum[k] = (wsum[k] || 0) + 1; }
console.log('warnings', wsum);
// idle balls outside the queue
const stuck = world.balls.filter((b) => b.mode === 'track' && b.idle > 5 && !(b.track === m.collector));
if (stuck.length) console.log('IDLE BALLS:', stuck.map((b) => `${b.id}@${b.track.name}:${b.s.toFixed(2)}`).join(', '));
for (const [k, d] of Object.entries(m.devices)) {
  if (d && d.plays !== undefined) console.log(`${k}: plays=${d.plays}`);
}
console.log('bucket tips', m.devices.bucket.tips, 'wheel turned', (m.devices.wheel.turned / (2 * Math.PI)).toFixed(1), 'rev');
