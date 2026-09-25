// One ball down the water slide, logged: speed, how far up the flume wall it
// rides, how wet it is, then the splash, the whirlpool and the drain.
//   node tests/water.mjs [balls-in-a-row]
import { buildMachine } from '../js/sim/layout.js';

const n = +(process.argv[2] ?? 1);
const m = buildMachine({ balls: 0 });
const { world } = m;
if (m.warnings.length) console.log('BUILD WARNINGS:\n  ' + m.warnings.join('\n  '));
for (const [ff, out] of m.routes.water) ff.lock = out;
const { Ball } = await import('../js/sim/world.js');
const balls = [];
for (let i = 0; i < n; i++) {
  const b = new Ball(i + 1, 0, i + 1);
  world.balls.push(b); balls.push(b);
}
const deg = 180 / Math.PI;
const log = [];
let next = 0;
const b = balls[0];
const stats = { maxPhi: 0, maxV: 0, splashV: 0, orbits: 0 };
let lastAng = null, poolIn = null, poolOut = null, placed = 0;
for (let t = 0; t < 40; t += 0.001) {
  // release the balls from the top of the lift one by one
  if (placed < n && t >= placed * 1.5) { world.placeOnTrack(balls[placed], m.lift.exit, 0.001, 0.06); placed++; }
  world.step(0.001);
  for (const e of world.drainEvents()) {
    if (e.type === 'splash' && e.ball === 1) { stats.splashV = e.v; log.push(`t=${t.toFixed(2)} SPLASH v=${e.v}`); }
    if (e.type === 'drain' && e.ball === 1) { poolOut = t; log.push(`t=${t.toFixed(2)} DRAIN`); }
    if (e.type === 'warn') log.push(`t=${t.toFixed(2)} WARN ${JSON.stringify(e)}`);
  }
  if (b.mode === 'track' && b.track.flume) {
    stats.maxPhi = Math.max(stats.maxPhi, Math.abs(b.phi) * deg);
    stats.maxV = Math.max(stats.maxV, b.v);
  }
  if (b.mode === 'surface' && b.surf.kind === 'pool') {
    if (poolIn === null) poolIn = t;
    const a = Math.atan2(b.p.z - b.surf.cz, b.p.x - b.surf.cx);
    if (lastAng !== null) { let d = a - lastAng; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; stats.orbits += d / (2 * Math.PI); }
    lastAng = a;
  }
  if (t >= next) {
    next += 0.25;
    const where = b.mode === 'track' ? `${b.track.name}@${b.s.toFixed(2)}` : b.mode === 'surface' ? `${b.surf.name} r=${Math.hypot(b.p.x - b.surf.cx, b.p.z - b.surf.cz).toFixed(3)}` : b.mode;
    const extra = b.mode === 'track' && b.track.flume ? ` phi=${(b.phi * deg).toFixed(0)}° wet=${b.wet.toFixed(2)} u=${b.track.flume.u[Math.round(b.s / b.track.ds)]?.toFixed(2)}` : '';
    log.push(`t=${t.toFixed(2)} ${where} v=${b.speed.toFixed(2)} y=${b.p.y.toFixed(2)}${extra}`);
  }
  if (b.mode === 'track' && b.track === m.collector) { log.push(`t=${t.toFixed(2)} home in the return trough`); break; }
}
console.log(log.join('\n'));
console.log(`max speed ${stats.maxV.toFixed(2)} m/s, max wall angle ${stats.maxPhi.toFixed(0)}°, splash at ${stats.splashV} m/s, ` +
  `pool ${poolIn !== null && poolOut !== null ? (poolOut - poolIn).toFixed(2) + ' s' : '?'}, ${Math.abs(stats.orbits).toFixed(1)} turns round the drain`);
console.log('stats', world.stats);
