// Physics checks for docs/graphics/xiaTheorem (no browser needed):
//   node docs/graphics/tests/xiaTheorem.mjs
import assert from 'node:assert/strict';
import { NBody, hermite } from '../xiaTheorem/js/nbody.js';
import { SCENARIOS, byId, defaultParams } from '../xiaTheorem/js/scenarios.js';
import { CASCADE } from '../xiaTheorem/js/cascade.js';

const BROWSER = { eta: 0.5, tol: 1e-12, lenient: true };

/** Integrate to exactly time T (Hermite interpolation across the last step). */
function runTo(s, T) {
  let a = s.snapshot(), b = a;
  while (s.t < T) { a = b; s.step(); b = s.snapshot(); assert(!s.failed, 'integrator failed'); }
  return hermite(a, b, T, new Float64Array(s.x.length));
}

// 1. Kepler, e = 0.999: the regularized integrator keeps energy through 100 pericentre passes.
{
  const e = 0.999, ra = 1 + e, va = Math.sqrt(2 * (1 - e) / (1 + e));
  const s = new NBody([1, 1], [[ra / 2, 0, 0], [-ra / 2, 0, 0]], [[0, va / 2, 0], [0, -va / 2, 0]], BROWSER);
  const P = 2 * Math.PI * Math.sqrt(1 / 2);
  const x = runTo(s, 100 * P);
  assert(s.energyError() < 1e-10, `Kepler energy drift ${s.energyError()}`);
  assert(Math.abs(x[0] - ra / 2) < 1e-6, 'Kepler orbit closes after 100 periods');
}

// 2. Periodic three-body orbits return to their start after one period.
for (const sc of SCENARIOS.filter(s => s.period)) {
  const { masses, pos, vel } = sc.init(defaultParams(sc));
  const s = new NBody(masses, pos, vel, BROWSER);
  const x = runTo(s, sc.period);
  let d = 0; pos.flat().forEach((p, k) => { d = Math.max(d, Math.abs(p - x[k])); });
  assert(d < 5e-3, `${sc.id} returns (error ${d})`);
  assert(s.energyError() < 1e-9, `${sc.id} energy`);
}

// 3. Pythagorean problem: the mass-3 body is ejected, masses 4 and 5 end as a binary.
{
  const sc = byId.pythagorean, { masses, pos, vel } = sc.init({});
  const s = new NBody(masses, pos, vel, BROWSER);
  const x = runTo(s, 100);
  const r = (i, j) => Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1]);
  assert(r(0, 1) > 30 && r(0, 2) > 30 && r(1, 2) < 3, `Pythagorean outcome ${r(0, 1)}, ${r(0, 2)}, ${r(1, 2)}`);
  assert(s.energyError() < 1e-8, 'Pythagorean energy');
}

// 4. Every scenario builds finite initial data with zero total momentum.
for (const sc of SCENARIOS) {
  const { masses, pos, vel } = sc.init(defaultParams(sc));
  assert(pos.flat().concat(vel.flat()).every(Number.isFinite), `${sc.id} finite`);
  const P = [0, 1, 2].map(k => masses.reduce((a, m, i) => a + m * vel[i][k], 0));
  assert(P.every(p => Math.abs(p) < 1e-12), `${sc.id} momentum ${P}`);
}

// 5. The tuned Xia cascade replays with browser settings: resync at every
//    checkpoint, and Q₅ bounces back off alternating binaries, faster each time.
{
  assert(CASCADE.cps.length >= 2 && CASCADE.bounces.length >= 4, 'cascade present');
  let s = NBody.fromState(CASCADE.cps[0].state, BROWSER);
  let ci = 1, maxSync = 0, prevVz = s.v[14];
  const turns = [];
  const zc = (o) => (s.x[o + 2] + s.x[o + 5]) / 2;
  const tStop = CASCADE.tEnd + 0.02;
  while (s.t < tStop) {
    const before = s.snapshot();
    s.step();
    assert(!s.failed, 'cascade integrator failed');
    if (ci < CASCADE.cps.length && s.t >= CASCADE.cps[ci].t) {
      const cp = CASCADE.cps[ci++];
      // drift since the previous checkpoint at the checkpoint's exact time (sync points carry no trim)
      const x = hermite(before, s.snapshot(), cp.t, new Float64Array(15));
      const scale = Math.max(...[0, 1, 2, 3, 4].map(i => Math.hypot(x[3 * i], x[3 * i + 1], x[3 * i + 2])));
      if (!cp.trim) { let e = 0; for (let k = 0; k < 15; k++) e = Math.max(e, Math.abs(cp.state.x[k] - x[k])); maxSync = Math.max(maxSync, e / scale); }
      s = NBody.fromState(cp.state, BROWSER);
      prevVz = s.v[14];
      continue;
    }
    const vz = s.v[14];
    if (Math.sign(vz) !== Math.sign(prevVz)) {
      const near = Math.abs(s.x[14] - zc(0)) < Math.abs(s.x[14] - zc(6)) ? 'A' : 'B';
      turns.push({ t: s.t, X: near });
    }
    prevVz = vz;
  }
  const sides = turns.map(t => t.X).join('');
  const expect = CASCADE.bounces.map(b => b.X).join('');
  assert.equal(sides, expect, `bounce sequence ${sides} vs ${expect}`);
  assert(maxSync < 1e-4, `checkpoint resync drift ${maxSync}`);
  for (const b of CASCADE.bounces) assert(b.v1 >= 1.25 * b.v0 && b.a1 < b.a0, 'each bounce speeds Q₅ up and hardens its binary');
  const trims = CASCADE.cps.filter(c => c.trim).map(c => Math.abs(c.trim));
  console.log(`cascade: ${CASCADE.bounces.length} bounces (${expect}), max trim ${Math.max(0, ...trims).toExponential(1)} of a period, resync drift ${maxSync.toExponential(1)}, t* ≈ ${CASCADE.tStar?.toFixed(4)}`);
}

console.log('PASS: Kepler e=0.999, periodic orbits, Pythagorean ejection, scenario data, and the Xia cascade replay.');
