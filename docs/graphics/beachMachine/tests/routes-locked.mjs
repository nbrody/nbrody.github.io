// Send every ball down one route at a time (as the Route picker does) and
// check nothing jams, derails or gets lost.  node tests/routes-locked.mjs [seconds] [balls]
import { buildMachine } from '../js/sim/layout.js';

const secs = +(process.argv[2] ?? 180), nBalls = +(process.argv[3] ?? 30);
let bad = 0;
for (const route of ['marimba', 'bells', 'daredevil', 'water', 'castle', 'gong', 'random']) {
  const m = buildMachine({ balls: nBalls });
  const { world } = m;
  if (route === 'random') for (const ff of Object.values(m.flipflops)) ff.random = ff.name !== 'F5';
  else for (const [ff, out] of m.routes[route]) ff.lock = out;
  const warns = {};
  for (let t = 0; t < secs; t += 1 / 30) {
    world.advance(1 / 30);
    for (const e of world.drainEvents()) if (e.type === 'warn') { const k = `${e.why} @ ${e.track || ''}`; warns[k] = (warns[k] || 0) + 1; }
  }
  const stuck = world.balls.filter((b) => b.mode === 'track' && b.idle > 8 && b.track !== m.collector && b.track !== m.devices.bucket?.feed);
  const s = world.stats;
  const ok = !s.derails && !s.lost && !stuck.length;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${route.padEnd(9)} lifted ${m.lift.lifted}  derails ${s.derails} lost ${s.lost}  stuck ${stuck.map((b) => `${b.id}@${b.track.name}:${b.s.toFixed(2)}`).join(' ') || 0}  ${JSON.stringify(warns)}`);
}
process.exit(bad ? 1 : 0);
