// Knotted webs: crossings, sliding strands (R2/R3/R4), kinks (R1).
const base = new URL('../js/', import.meta.url).href;
const { setSettings } = await import(base + 'config.js');
const G = await import(base + 'geom.js');
const { validate, canonCode, isoMap } = await import(base + 'web.js');
const { applyOp } = await import(base + 'moves.js');
const { replay, buildFoam, sliceFoam } = await import(base + 'foam.js');
setSettings({ N: 3, mode: 'sl' });

const bd = (id, deg) => ({ id, x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180), bd: true });
const E = (id, a, b, pts, ov) => ({ id, a, b, label: 1, pts: G.resample(pts), ...(ov ? { ov } : {}) });
// an X: strand A (225° -> 45°) over strand B (315° -> 135°), plus a vertical strand C on the right
function cross() {
  const W = { verts: {}, edges: {} };
  for (const v of [bd('a0', 225), bd('a1', 45), bd('b0', 315), bd('b1', 135), bd('c0', 345), bd('c1', 15)]) W.verts[v.id] = v;
  W.verts.X = { id: 'X', x: 0, y: 0, cr: true };
  const p = id => [W.verts[id].x, W.verts[id].y];
  W.edges.A1 = E('A1', 'a0', 'X', [p('a0'), [0, 0]], [0, 1]);
  W.edges.A2 = E('A2', 'X', 'a1', [[0, 0], p('a1')], [1, 0]);
  W.edges.B1 = E('B1', 'b0', 'X', [p('b0'), [0, 0]], [0, -1]);
  W.edges.B2 = E('B2', 'X', 'b1', [[0, 0], p('b1')], [-1, 0]);
  W.edges.C = E('C', 'c0', 'c1', G.smooth(G.resample([p('c0'), [0.62, -0.08], [0.62, 0.08], p('c1')], 0.01), 8));
  return W;
}
const W0 = cross();
const show = (tag, W) => { const v = validate(W); console.log(tag, v.ok ? 'valid' : 'INVALID: ' + v.probs.filter(p => !p.warn).map(p => p.msg).join('; '), '| crossings', Object.values(W.verts).filter(x => x.cr).length, '| edges', Object.keys(W.edges).length); return v.ok; };
show('W0', W0);
let W = W0;
const steps = [];
const go = (op) => { op.uid = 'o' + (steps.length + 1); try { const r = applyOp(W, op); W = r.W; steps.push(op); show(op.type + ' ' + (op.note || ''), W); } catch (e) { console.log(op.type, 'FAILED:', e.message); } };
// slide strand C left across the X (over everything): two new crossings with A, two with B? (C passes over X region)
go({ type: 'lift', e: 'C', s: 0.5, d: [-0.75, 0], level: 1, note: '(C over the X)' });
// sliding the under strand B over something must fail
const b2 = Object.keys(W.edges).find(id => W.edges[id].b === 'b1');
go({ type: 'lift', e: b2, s: 0.97, d: [-0.05, 0.1], level: 1, note: '(B near its end: free)' });
const bX = Object.keys(W.edges).find(id => W.edges[id].a === 'X' && W.edges[id].ov && W.edges[id].ov[0] < 0);
go({ type: 'lift', e: bX, s: 0.1, d: [0.15, 0.25], level: 1, note: '(should fail: B is under A here)' });
// slide C back to the right
const cid = Object.keys(W.edges).find(id => W.edges[id].a === 'c0');
go({ type: 'lift', e: cid, s: 0.97, d: [0.0, 0.0001], level: 1, note: '(tiny)' });
const cmid = (() => { let best = null, bx = 1; for (const id in W.edges) { const e = W.edges[id]; if (!e.ov) continue; const m = e.pts[Math.floor(e.pts.length / 2)]; if (m[0] < bx && Math.abs(m[1]) < 0.15 && e.ov[0] > 0 && e.ov[1] > 0) { bx = m[0]; best = id; } } return best; })();
go({ type: 'lift', e: cmid, s: 0.5, d: [0.8, 0], level: 1, note: '(C back to the right)' });
// a kink on C and its removal
const c2 = Object.keys(W.edges).find(id => W.edges[id].a === 'c0');
go({ type: 'r1', e: c2, s: 0.5, side: 1, over: 1, note: '(kink)' });
const loop = Object.keys(W.edges).find(id => W.edges[id].a === W.edges[id].b && W.verts[W.edges[id].a].cr);
go({ type: 'r1d', e: loop, note: '(unkink)' });
console.log('end ≅ start (as diagrams):', !!isoMap(W, W0));
// the whole movie as a foam
const st = { N: 3, mode: 'sl', W0, W1: W0, ops: steps, dots: [] };
const R = replay(st); const F = buildFoam(R, { slabH: 0.5 });
console.log('replay error', R.error, 'complete', F.complete, 'knotted', F.knotted);
console.log('facets', F.facets.map(f => `[χ${f.chi} b${f.b} g${f.genus}]`).join(' '), 'χ', F.chi);
// slices carry depth: at a crossing of the original X, A at +, B at -
const sl = sliceFoam(F, F.frameZ[0] + 0.01);
let near = [];
for (const f of sl.facets) for (const s of f.segs) for (const p of s) if (Math.hypot(p[0], p[1]) < 0.02) near.push(p[2].toFixed(3));
console.log('depths near the X at t≈0:', [...new Set(near)].sort().join(' '));

// Reidemeister V on a theta web: twist two legs at a vertex, then untwist
{
  const { incid, rot } = await import(base + 'web.js');
  let T = applyOp({ verts: {}, edges: {} }, { uid: 't0', type: 'tbirth', p: [0, 0], a: 1, b: 1 }).W;
  const T0 = T;
  const steps5 = [{ uid: 't0', type: 'tbirth', p: [0, 0], a: 1, b: 1 }];
  const v = 't0:v1', R = rot(T, incid(T), v);
  const tw = { uid: 't1', type: 'r5', v, a: R[0].e, b: R[1].e, over: 1 };
  try { T = applyOp(T, tw).W; steps5.push(tw); show('r5 (twist)', T); } catch (e) { console.log('r5 FAILED', e.message); }
  const bigonEdge = Object.keys(T.edges).find(id => { const e = T.edges[id]; return (e.a === v && T.verts[e.b].cr) || (e.b === v && T.verts[e.a].cr); });
  const un = { uid: 't2', type: 'r5d', e: bigonEdge };
  try { T = applyOp(T, un).W; steps5.push(un); show('r5d (untwist)', T); } catch (e) { console.log('r5d FAILED', e.message); }
  console.log('untwisted ≅ theta:', !!isoMap(T, T0));
  steps5.push({ uid: 't3', type: 'tdeath', e: Object.keys(T.edges)[0] });
  const R5 = replay({ N: 3, mode: 'sl', W0: { verts: {}, edges: {} }, W1: { verts: {}, edges: {} }, ops: steps5, dots: [] });
  const F5 = buildFoam(R5, { slabH: 0.5 });
  console.log('theta with a twist: error', R5.error, 'complete', F5.complete, 'facets', F5.facets.map(f => `[χ${f.chi} b${f.b} g${f.genus}]`).join(' '), 'bindings', JSON.stringify(F5.seamInfo));
}
