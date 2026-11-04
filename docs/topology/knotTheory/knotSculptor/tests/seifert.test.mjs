// Node test for js/seifert.js:  node tests/seifert.test.mjs
// Plain asserts; prints the measured numbers.

import assert from 'node:assert/strict';
import { solidAngleGrid, marchLevel, crossingGlobe } from '../js/seifert.js';

// --- test knots --------------------------------------------------------------

function sample(N, f) {
  const out = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = f((2 * Math.PI * i) / N);
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
  return out;
}
const circle = [sample(128, (t) => [0.1 * Math.cos(t), 0.1 * Math.sin(t), 0])];
const trefoil = [sample(200, (t) => [
  0.05 * (Math.sin(t) + 2 * Math.sin(2 * t)),
  0.05 * (Math.cos(t) - 2 * Math.cos(2 * t)),
  0.05 * -Math.sin(3 * t),
])];
const hopf = [
  sample(128, (t) => [0.08 * Math.cos(t), 0.08 * Math.sin(t), 0]),
  sample(128, (t) => [0.08 + 0.08 * Math.cos(t), 0, 0.08 * Math.sin(t)]),
];
const figureEight = [sample(200, (t) => [
  0.04 * (2 + Math.cos(2 * t)) * Math.cos(3 * t),
  0.04 * (2 + Math.cos(2 * t)) * Math.sin(3 * t),
  0.04 * Math.sin(4 * t),
])];

// --- mesh analysis -----------------------------------------------------------

function distToLink(link, x, y, z) {
  let best = Infinity;
  for (const c of link) {
    const n = c.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = c[3 * i], ay = c[3 * i + 1], az = c[3 * i + 2];
      const dx = c[3 * j] - ax, dy = c[3 * j + 1] - ay, dz = c[3 * j + 2] - az;
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz);
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy, z - az - t * dz));
    }
  }
  return best;
}

// `link` and `tube` (radius) are used to restrict the shading check to what the
// knot tube does not cover.
function analyze({ positions, indices, normals }, link, tube) {
  const V = positions.length / 3, F = indices.length / 3;
  const edges = new Map(); // key -> [count, forward (lo->hi), backward]
  const key = (a, b) => (a < b ? a * V + b : b * V + a);
  for (let f = 0; f < F; f++) {
    for (let x = 0; x < 3; x++) {
      const a = indices[3 * f + x], b = indices[3 * f + (x + 1) % 3];
      const k = key(a, b);
      let e = edges.get(k);
      if (!e) edges.set(k, (e = [0, 0, 0, a < b ? a : b, a < b ? b : a]));
      e[0]++;
      if (a < b) e[1]++; else e[2]++;
    }
  }
  let overused = 0, inconsistent = 0;
  const bAdj = new Map();
  const addB = (a, b) => { if (!bAdj.has(a)) bAdj.set(a, []); bAdj.get(a).push(b); };
  for (const [count, fwd, , lo, hi] of edges.values()) {
    if (count > 2) overused++;
    if (count === 2 && fwd !== 1) inconsistent++;
    if (count === 1) { addB(lo, hi); addB(hi, lo); }
  }
  // Boundary loops: connected components of the boundary graph (each vertex degree 2).
  let badBoundaryVerts = 0;
  for (const nb of bAdj.values()) if (nb.length !== 2) badBoundaryVerts++;
  const visited = new Set();
  let loops = 0;
  for (const v of bAdj.keys()) {
    if (visited.has(v)) continue;
    loops++;
    const stack = [v];
    visited.add(v);
    while (stack.length) {
      const w = stack.pop();
      for (const u of bAdj.get(w)) if (!visited.has(u)) { visited.add(u); stack.push(u); }
    }
  }
  // Connected components of the triangle mesh.
  const parent = Int32Array.from({ length: V }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let f = 0; f < F; f++) {
    const a = find(indices[3 * f]), b = find(indices[3 * f + 1]), c = find(indices[3 * f + 2]);
    parent[a] = b; parent[find(c)] = find(b);
  }
  const roots = new Set();
  for (let v = 0; v < V; v++) roots.add(find(v));
  // Pinched vertices: incident triangles split into more than one edge-connected fan.
  const inc = Array.from({ length: V }, () => []);
  for (let f = 0; f < F; f++) for (let x = 0; x < 3; x++) inc[indices[3 * f + x]].push(f);
  let pinched = 0;
  for (let v = 0; v < V; v++) {
    const fs = inc[v];
    const p = fs.map((_, i) => i);
    const fd = (x) => { while (p[x] !== x) x = p[x] = p[p[x]]; return x; };
    for (let a = 0; a < fs.length; a++) for (let b = a + 1; b < fs.length; b++) {
      const A = [0, 1, 2].map((x) => indices[3 * fs[a] + x]).filter((w) => w !== v);
      const B = [0, 1, 2].map((x) => indices[3 * fs[b] + x]).filter((w) => w !== v);
      if (A.some((w) => B.includes(w))) p[fd(a)] = fd(b);
    }
    const groups = new Set(fs.map((_, i) => fd(i)));
    if (groups.size > 1) pinched++;
  }
  // Vertex normals agree with the face winding: area of visible triangles (all
  // corners outside the tube) whose normal opposes their vertex normals.
  let normalDisagree = 0, badArea = 0, visArea = 0;
  const outside = new Uint8Array(V);
  for (let v = 0; v < V; v++) outside[v] = !link || distToLink(link, positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]) > tube ? 1 : 0;
  for (let f = 0; f < F; f++) {
    const [a, b, c] = [indices[3 * f], indices[3 * f + 1], indices[3 * f + 2]];
    const ux = positions[3 * b] - positions[3 * a], uy = positions[3 * b + 1] - positions[3 * a + 1], uz = positions[3 * b + 2] - positions[3 * a + 2];
    const vx = positions[3 * c] - positions[3 * a], vy = positions[3 * c + 1] - positions[3 * a + 1], vz = positions[3 * c + 2] - positions[3 * a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-12) continue;
    let s = 0;
    for (const w of [a, b, c]) s += (fx * normals[3 * w] + fy * normals[3 * w + 1] + fz * normals[3 * w + 2]) / fl;
    const visible = outside[a] && outside[b] && outside[c];
    if (visible) visArea += fl / 2;
    if (s < 0) { normalDisagree++; if (visible) badArea += fl / 2; }
  }
  const badShading = visArea > 0 ? badArea / visArea : 0;
  return {
    V, E: edges.size, F, chi: V - edges.size + F, loops, components: roots.size,
    overused, inconsistent, badBoundaryVerts, pinched, normalDisagree, badShading,
  };
}

function minAngleStats({ positions, indices }) {
  const F = indices.length / 3;
  let slivers = 0;
  for (let f = 0; f < F; f++) {
    const P = [0, 1, 2].map((x) => indices[3 * f + x]).map((v) => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]]);
    let minA = Math.PI;
    for (let x = 0; x < 3; x++) {
      const a = P[x], b = P[(x + 1) % 3], c = P[(x + 2) % 3];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const lu = Math.hypot(...u), lw = Math.hypot(...w);
      if (lu < 1e-12 || lw < 1e-12) { minA = 0; break; }
      const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (lu * lw);
      minA = Math.min(minA, Math.acos(Math.max(-1, Math.min(1, cos))));
    }
    if (minA < (10 * Math.PI) / 180) slivers++;
  }
  return { sliverFraction: slivers / F };
}

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v}`).join(' ');
function assertManifoldOriented(s) {
  assert.equal(s.overused, 0, 'edges used by more than 2 triangles');
  assert.equal(s.inconsistent, 0, 'interior edges not traversed once in each direction');
  assert.equal(s.badBoundaryVerts, 0, 'boundary vertices of degree != 2');
  assert.equal(s.pinched, 0, 'pinched vertices');
  assert.ok(s.badShading < 1e-3, `visible area with vertex normals opposing the winding: ${s.badShading}`);
}

// --- surfaces ------------------------------------------------------------------

console.log('Seifert surfaces (level 2pi)');

let t = performance.now();
const gCircle = solidAngleGrid(circle, { res: 48 });
const tCircle = performance.now() - t;
const mCircle = marchLevel(gCircle, circle, 2 * Math.PI);
const sCircle = analyze(mCircle, circle, 1.2 * gCircle.h);
// Linear interpolation of the (nonlinear) field bends the surface slightly
// within a cell or so of the knot, where the tube hides it; further in it is flat.
let maxZ = 0, maxZFar = 0;
for (let v = 0; v < sCircle.V; v++) {
  const x = mCircle.positions[3 * v], y = mCircle.positions[3 * v + 1], z = Math.abs(mCircle.positions[3 * v + 2]);
  maxZ = Math.max(maxZ, z);
  if (0.1 - Math.hypot(x, y) > 2 * gCircle.h) maxZFar = Math.max(maxZFar, z);
}
console.log(`  circle   grid ${gCircle.nx}x${gCircle.ny}x${gCircle.nz} h=${(gCircle.h * 1000).toFixed(2)}mm ${tCircle.toFixed(0)}ms | ${fmt(sCircle)} max|z|=${(maxZ / gCircle.h).toFixed(3)}h (beyond 2 cells from knot ${(maxZFar / gCircle.h).toFixed(4)}h) ${fmt(minAngleStats(mCircle))}`);
check('circle: flat disk (|z| < 0.2h everywhere, < 0.03h beyond 2 cells from the knot)', () => {
  assert.ok(maxZ < 0.2 * gCircle.h, `max |z| = ${maxZ / gCircle.h} h`);
  assert.ok(maxZFar < 0.03 * gCircle.h, `max |z| away from knot = ${maxZFar / gCircle.h} h`);
});
check('circle: boundary hugs the knot (all vertices within radius 0.1)', () => {
  let rMax = 0;
  for (let v = 0; v < sCircle.V; v++) rMax = Math.max(rMax, Math.hypot(mCircle.positions[3 * v], mCircle.positions[3 * v + 1]));
  assert.ok(rMax < 0.1 && rMax > 0.1 - 1.5 * gCircle.h, `max radius ${rMax}`);
});
check('circle: chi = 1, one boundary loop, connected', () => {
  assert.equal(sCircle.chi, 1); assert.equal(sCircle.loops, 1); assert.equal(sCircle.components, 1);
});
check('circle: manifold with boundary, consistently oriented', () => assertManifoldOriented(sCircle));
check('circle: normals point along +z or -z', () => {
  let sum = 0;
  for (let v = 0; v < sCircle.V; v++) sum += mCircle.normals[3 * v + 2];
  assert.ok(Math.abs(sum / sCircle.V) > 0.99, `mean n_z = ${sum / sCircle.V}`);
});

t = performance.now();
const gTref = solidAngleGrid(trefoil, { res: 48 });
const tTref = performance.now() - t;
t = performance.now();
const mTref = marchLevel(gTref, trefoil, 2 * Math.PI);
const tMarch = performance.now() - t;
const sTref = analyze(mTref, trefoil, 1.2 * gTref.h);
console.log(`  trefoil  grid ${gTref.nx}x${gTref.ny}x${gTref.nz} ${tTref.toFixed(0)}ms, march ${tMarch.toFixed(0)}ms | ${fmt(sTref)} ${fmt(minAngleStats(mTref))}`);
check('trefoil: connected, one boundary loop', () => { assert.equal(sTref.components, 1); assert.equal(sTref.loops, 1); });
check('trefoil: manifold, consistently oriented', () => assertManifoldOriented(sTref));
check('trefoil: chi = -1 (genus 1)', () => assert.equal(sTref.chi, -1));

const gHopf = solidAngleGrid(hopf, { res: 48 });
const mHopf = marchLevel(gHopf, hopf, 2 * Math.PI);
const sHopf = analyze(mHopf, hopf, 1.2 * gHopf.h);
console.log(`  Hopf     grid ${gHopf.nx}x${gHopf.ny}x${gHopf.nz} ${gHopf.ms.toFixed(0)}ms | ${fmt(sHopf)}`);
check('Hopf link: two boundary loops, connected', () => { assert.equal(sHopf.loops, 2); assert.equal(sHopf.components, 1); });
check('Hopf link: manifold, consistently oriented', () => assertManifoldOriented(sHopf));
check('Hopf link: chi = 0 (annulus)', () => assert.equal(sHopf.chi, 0));

// Sweep: every level the app animates.
console.log('Trefoil sweep (32 levels, 4pi(k+1/2)/32)');
{
  const rows = [];
  let tm = 0, bad = 0;
  for (let kk = 0; kk < 32; kk++) {
    const level = (4 * Math.PI * (kk + 0.5)) / 32;
    const t1 = performance.now();
    const m = marchLevel(gTref, trefoil, level);
    tm += performance.now() - t1;
    const s = analyze(m, trefoil, 1.2 * gTref.h);
    if (s.overused || s.inconsistent || s.pinched || s.badBoundaryVerts || s.badShading >= 1e-3) bad++;
    rows.push(`${kk}:chi${s.chi}/b${s.loops}/c${s.components}`);
  }
  console.log(`  ${rows.join(' ')}`);
  console.log(`  mean march ${(tm / 32).toFixed(1)}ms`);
  check('sweep: every level manifold and oriented', () => assert.equal(bad, 0));
}

// The figure-eight in this embedding has level sets of genus 1 and genus 3 (the
// solid-angle map has critical points); this is stable under refining the grid.
console.log('Figure-eight sweep (32 levels): chi/boundary loops');
{
  const g = solidAngleGrid(figureEight, { res: 48 });
  const rows = [];
  let bad = 0;
  for (let kk = 0; kk < 32; kk++) {
    const s = analyze(marchLevel(g, figureEight, (4 * Math.PI * (kk + 0.5)) / 32), figureEight, 1.2 * g.h);
    if (s.overused || s.inconsistent || s.pinched || s.badBoundaryVerts || s.badShading >= 1e-3 || s.components !== 1) bad++;
    rows.push(`${kk}:${s.chi}/b${s.loops}`);
  }
  console.log(`  ${rows.join(' ')}`);
  check('figure-eight sweep: every level connected, manifold and oriented', () => assert.equal(bad, 0));
}

// --- timing at the default resolution ----------------------------------------

{
  // A 3-component link at 160 points each is the worst case the app sends.
  const big = [0, 1, 2].map((c) => sample(400, (tt) => [
    0.12 * Math.cos(tt) + 0.06 * c, 0.12 * Math.sin(tt), 0.03 * Math.sin(3 * tt + c),
  ]));
  const t2 = performance.now();
  const g = solidAngleGrid(trefoil, { res: 48 });
  const t3 = performance.now();
  const gb = solidAngleGrid(big, { res: 48 });
  const t4 = performance.now();
  console.log(`Timing: grid res 48 trefoil (${g.nx}x${g.ny}x${g.nz}, 160 pts) ${(t3 - t2).toFixed(0)}ms; 3 comps x 160 pts (${gb.nx}x${gb.ny}x${gb.nz}) ${(t4 - t3).toFixed(0)}ms`);
}

// --- crossing globe ------------------------------------------------------------

console.log('Crossing globe (1500 directions)');
for (const [name, link, expect] of [['circle', circle, 0], ['trefoil', trefoil, 3], ['figure-eight', figureEight, 4], ['Hopf', hopf, 2]]) {
  const r = crossingGlobe(link, { count: 1500 });
  const atMin = r.counts.filter((c) => c === r.min).length;
  console.log(`  ${name.padEnd(12)} min=${r.min} max=${r.max} (${atMin} dirs at min) best=[${r.best.map((x) => x.toFixed(3)).join(', ')}] ${r.ms.toFixed(0)}ms`);
  check(`${name}: min crossings = ${expect}`, () => assert.equal(r.min, expect));
  check(`${name}: best direction achieves the min`, () => {
    let found = false;
    for (let i = 0; i < r.counts.length; i++) {
      if (r.dirs[3 * i] === r.best[0] && r.dirs[3 * i + 1] === r.best[1] && r.dirs[3 * i + 2] === r.best[2]) found = r.counts[i] === r.min;
    }
    assert.ok(found);
  });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
