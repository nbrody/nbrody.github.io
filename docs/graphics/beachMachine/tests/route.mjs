// One ball down one route, logged every quarter second: where it is, its
// speed, and on a flume how far up the wall it rides and how wet it is.
//   node tests/route.mjs [route] [balls-in-a-row]     (route: water, castle, gong, …)
import { buildMachine } from '../js/sim/layout.js';

const route = process.argv[2] ?? 'castle';
const n = +(process.argv[3] ?? 1);
const m = buildMachine({ balls: 0 });
const { world } = m;
if (m.warnings.length) console.log('BUILD WARNINGS:\n  ' + m.warnings.join('\n  '));
for (const [ff, out] of m.routes[route]) ff.lock = out;
const { Ball } = await import('../../ballMachine/js/sim/world.js');
const balls = [];
for (let i = 0; i < n; i++) { const b = new Ball(i + 1, 0, i + 1); world.balls.push(b); balls.push(b); }
const deg = 180 / Math.PI;
const log = [];
let next = 0, placed = 0;
const b = balls[0];
const stats = { maxPhi: 0, maxV: 0, splashV: 0, orbits: 0 };
let lastAng = null;
for (let t = 0; t < 60; t += 0.001) {
  if (placed < n && t >= placed * 1.5) { world.placeOnTrack(balls[placed], m.lift.exit, 0.001, m.lift.exit.v0); placed++; }
  world.step(0.001);
  for (const e of world.drainEvents()) {
    if (e.type === 'sound' || e.ball !== 1) continue;
    log.push(`t=${t.toFixed(2)} ${e.type.toUpperCase()} ${JSON.stringify(e)}`);
  }
  if (b.mode === 'track' && b.track.flume) { stats.maxPhi = Math.max(stats.maxPhi, Math.abs(b.phi) * deg); stats.maxV = Math.max(stats.maxV, b.v); }
  if (b.mode === 'surface' && b.surf.kind === 'pool') {
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
  if (b.mode === 'track' && b.track === m.collector) { log.push(`t=${t.toFixed(2)} home in the return channel`); break; }
}
console.log(log.join('\n'));
console.log(`max flume speed ${stats.maxV.toFixed(2)} m/s, max wall angle ${stats.maxPhi.toFixed(0)}°, ${Math.abs(stats.orbits).toFixed(1)} turns round the drain`);
console.log('stats', world.stats);
