// Elementary foams.  Each op takes the web at the bottom of a slab to the web
// at its top and describes the piece of foam inside the slab, in slab
// coordinates [x, y, tau] with tau in [0, 1]:
//   involvedE / involvedV  bottom-frame edges / vertices the piece accounts for
//                          (everything else is extruded straight up)
//   partial   [{node, pts}]          extruded sub-polylines of involved edges
//   patches   [{node, kind, loop}]   disks spanning a closed boundary loop
//   seams     3D polylines (bindings), sing: singular vertices
//   unions    [[edgeId, edgeId]]     facet identifications
// Ops never resample their output curves, so neighbouring slabs share exact
// boundary points and the welded foam has honest Euler characteristics.
import { S, SP, LROWS, normLabel, flowToLabel, labelOK, flowZero } from './config.js';
import * as G from './geom.js';
import { cloneWeb, incid, rot, fIn, isTri, isCircleEdge, isLoopVertex, flipEdge, mergeBivalent, vpos, clearance, crossesWeb, ovAt, ovOf, crossingStrands, validate } from './web.js';

export class MoveError extends Error {}
const fail = msg => { throw new MoveError(msg); };

export const MOVE_INFO = {
  cup:    { name: 'cup',        desc: 'birth of a circle (minimum of a facet)' },
  cap:    { name: 'cap',        desc: 'death of a circle (maximum of a facet)' },
  saddle: { name: 'saddle',     desc: 'saddle between two oppositely oriented strands' },
  zip:    { name: 'zip',        desc: 'two strands merge along a new binding (binding minimum)' },
  unzip:  { name: 'unzip',      desc: 'an H splits into two strands (binding maximum)' },
  dbirth: { name: 'digon +',    desc: 'an edge sprouts a digon (binding minimum)' },
  ddeath: { name: 'digon −',    desc: 'a digon collapses to an edge (binding maximum)' },
  tbirth: { name: 'theta +',    desc: 'a theta web is born (binding minimum)' },
  tdeath: { name: 'theta −',    desc: 'a theta web dies (binding maximum)' },
  assoc:  { name: 'I ↔ H',      desc: 'associativity: a singular vertex' },
  iso:    { name: 'isotopy',    desc: 'planar isotopy' },
  lift:   { name: 'slide',      desc: 'a strand slides over (or under) the rest of the web: Reidemeister II, III and IV moves' },
  r1:     { name: 'kink +',     desc: 'Reidemeister I: a strand twists into a small curl' },
  r1d:    { name: 'kink −',     desc: 'Reidemeister I: a curl straightens out' },
  r5:     { name: 'twist +',    desc: 'Reidemeister V: two legs at a vertex trade places, crossing once' },
  r5d:    { name: 'twist −',    desc: 'Reidemeister V: a twist at a vertex comes undone' },
};

// ------------------------------------------------------------------ helpers

const at = (pts, t) => pts.map(p => [p[0], p[1], t]);
function vert(p, up = true) {
  const out = [];
  for (let j = 0; j <= LROWS; j++) out.push([p[0], p[1], j / LROWS]);
  return up ? out : out.reverse();
}
const rev3 = a => a.slice().reverse();
const same3 = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7 && Math.abs(a[2] - b[2]) < 1e-7;

// concatenate sides sharing endpoints into a closed loop (no repeated point)
function loopOf(sides) {
  const out = [];
  for (const s of sides) {
    for (let i = 0; i < s.length; i++) {
      if (i === 0 && out.length) {
        if (!same3(out[out.length - 1], s[0])) console.warn('loop gap', out[out.length - 1], s[0]);
        continue;
      }
      out.push(s[i]);
    }
  }
  if (same3(out[0], out[out.length - 1])) out.pop();
  else console.warn('loop not closed', out[0], out[out.length - 1]);
  return out;
}

// A binding arc over the planar path xy: from (xy[0], base) through the apex
// height and back to (xy[last], base).  Vertical tangents at both ends.
function seamArc(xy, base, apex, n = 22) {
  const c = G.cumLen(xy), L = c[c.length - 1];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const phi = Math.PI * i / n, s = (1 - Math.cos(phi)) / 2;
    const p = G.pointAtLen(xy, c, s * L);
    out.push([p[0], p[1], base + (apex - base) * Math.sin(phi)]);
  }
  out[0] = [xy[0][0], xy[0][1], base];
  out[n] = [xy[xy.length - 1][0], xy[xy.length - 1][1], base];
  return out;
}

function seg3(a, b, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  out[0] = a.slice(); out[n] = b.slice();
  return out;
}

const cat = (...parts) => {
  const out = [];
  for (const p of parts) for (let i = out.length ? 1 : 0; i < p.length; i++) out.push(p[i]);
  return out;
};

class Ctx {
  constructor(W, op) {
    this.W0 = W; this.W = cloneWeb(W); this.op = op;
    this.piece = { involvedE: [], involvedV: [], partial: [], patches: [], seams: [], sing: [], unions: [], morphs: [] };
    this.nm = 0; this.np = 0;
  }
  id(tag) { return `${this.op.uid}:${tag}`; }
  edge(id) { const e = this.W.edges[id]; if (!e) fail('that edge no longer exists'); return e; }
  involve(...ids) { for (const i of ids) if (this.W0.edges[i] && !this.piece.involvedE.includes(i)) this.piece.involvedE.push(i); }
  involveV(...ids) { for (const i of ids) if (this.W0.verts[i] && !this.piece.involvedV.includes(i)) this.piece.involvedV.push(i); }
  union(a, b) { this.piece.unions.push([a, b]); }
  partial(node, pts) { if (pts.length >= 2) this.piece.partial.push({ node, pts }); }
  // a sheet whose slice moves from the curve `bottom` to the curve `top`
  morph(node, bottom, top) { if (bottom.length >= 2 && top.length >= 2) this.piece.morphs.push({ node, bottom, top }); }
  patch(node, loop, kind = 'harm', extra = {}) { this.piece.patches.push({ node, kind, loop, ...extra }); }
  seam(p) { this.piece.seams.push(p); }
  addEdge(e) { if (e.ov && !e.ov[0] && !e.ov[1]) delete e.ov; this.W.edges[e.id] = e; return e; }
  addVert(id, p) { this.W.verts[id] = { id, x: p[0], y: p[1] }; return id; }
  finish() {
    const un = mergeBivalent(this.W, () => this.id('m' + (this.nm++)));
    for (const u of un) this.union(u[0], u[1]);
  }
}

// edge from vertex u to vertex v carrying flow f in the u -> v direction
// ov = over/under flags at the u- and v-ends
function edgeWithFlow(ctx, id, u, v, f, pts, ov = [0, 0]) {
  const L = flowToLabel(f);
  if (!L) fail(f === 0 || S.mode === 'sl' ? 'the new edge would carry zero flow' : `label ${Math.abs(f)} exceeds N = ${S.N}`);
  return L.flip ? ctx.addEdge({ id, a: v, b: u, label: L.label, pts: G.rev(pts), ov: [ov[1], ov[0]] })
                : ctx.addEdge({ id, a: u, b: v, label: L.label, pts, ov: [ov[0], ov[1]] });
}

// Split an edge at polyline index idx with a new bivalent vertex.
function splitEdge(ctx, eid, idx) {
  const e = ctx.edge(eid), m = ctx.id('sv');
  ctx.addVert(m, e.pts[idx]);
  const a = ctx.addEdge({ id: ctx.id('sa'), a: e.a, b: m, label: e.label, pts: e.pts.slice(0, idx + 1), ov: [ovAt(e, 0), 0] });
  const b = ctx.addEdge({ id: ctx.id('sb'), a: m, b: e.b, label: e.label, pts: e.pts.slice(idx), ov: [0, ovAt(e, 1)] });
  delete ctx.W.edges[eid];
  ctx.union(eid, a.id); ctx.union(eid, b.id);
  return [a.id, b.id];
}

const halfWin = (e, target) => {
  const sp = G.polyLen(e.pts) / (e.pts.length - 1);
  return Math.max(1, Math.min(Math.floor((e.pts.length - 3) / 2), Math.round(target / sp)));
};
const clampIdx = (e, i, k) => Math.max(k + 1, Math.min(e.pts.length - 2 - k, i));

// Two marked points (on one or two edges) for saddle and zip.  The windows
// cut out of the strands grow with the distance between the points, so the
// band of a saddle spans the region it crosses.
function twoPoints(ctx, op, [lo, frac, hi]) {
  ctx.involve(op.e1, op.e2);
  let e1 = ctx.edge(op.e1), e2 = ctx.edge(op.e2);
  let i1 = G.indexAtFrac(e1.pts, op.s1), i2 = G.indexAtFrac(e2.pts, op.s2);
  const target = Math.max(lo, Math.min(hi, frac * G.dist(e1.pts[i1], e2.pts[i2])));
  let a = op.e1, b = op.e2;
  if (op.e1 === op.e2) {
    if (i1 > i2) [i1, i2] = [i2, i1];
    const k = halfWin(e1, target);
    if (i2 - i1 < 2 * k + 4) fail('the two points are too close together');
    const im = (i1 + i2) >> 1;
    [a, b] = splitEdge(ctx, op.e1, im);
    i2 -= im;
    e1 = ctx.edge(a); e2 = ctx.edge(b);
  }
  const k1 = halfWin(e1, target), k2 = halfWin(e2, target);
  if (e1.pts.length < 2 * k1 + 3 || e2.pts.length < 2 * k2 + 3) fail('edge too short');
  i1 = clampIdx(e1, i1, k1); i2 = clampIdx(e2, i2, k2);
  return { a, b, i1, i2, k1, k2 };
}

// segments of an edge to ignore when testing a new curve against it
const skipRange = (i0, i1) => { const s = new Set(); for (let i = i0; i <= i1; i++) s.add(i); return s; };
// the segments of an edge within the window of points i-k .. i+k
const winSkip = (i, k) => skipRange(i - k, i + k - 1);

function tooClose(W, q, skip, eps = 0.006, endGap = 0.02) {
  const c = G.cumLen(q), L = c[c.length - 1];
  for (let i = 1; i < q.length - 1; i++) {
    if (c[i] < endGap || L - c[i] < endGap) continue;
    for (const id in W.edges) {
      const sk = skip[id];
      if (sk === true) continue;
      const P = W.edges[id].pts;
      for (let j = 0; j < P.length - 1; j++) {
        if (sk && sk.has(j)) continue;
        const a = P[j], b = P[j + 1];
        if (Math.min(a[0], b[0]) - eps > q[i][0] || Math.max(a[0], b[0]) + eps < q[i][0] || Math.min(a[1], b[1]) - eps > q[i][1] || Math.max(a[1], b[1]) + eps < q[i][1]) continue;
        const ab = G.sub(b, a), t = Math.max(0, Math.min(1, G.dot(G.sub(q[i], a), ab) / (G.dot(ab, ab) || 1e-18)));
        if (G.dist(G.lerp(a, b, t), q[i]) < eps) return true;
      }
    }
  }
  return false;
}

// the straight segment between the two marked points must stay in one region
function checkAcross(ctx, p1, p2, skip) {
  const seg = G.line(p1, p2, 6);
  if (crossesWeb(ctx.W, seg, skip)) fail('the two strands must face each other across a single region');
}

// New curves may touch existing ones at their endpoints (the strict crossing
// test ignores that) but must not cross anything, or each other, or themselves,
// and away from their ends they must keep clear of the rest of the web.
function checkCurves(ctx, curves, skip) {
  for (const q of curves) {
    const hit = crossesWeb(ctx.W, q, skip);
    if (hit) fail(hit === 'boundary' ? 'the new curve would leave the disk' : 'the new curve would cross another edge');
    if (G.selfCrosses(q)) fail('the new curve would cross itself');
    if (tooClose(ctx.W, q, skip)) fail('the new curve would run into another edge');
  }
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
    if (G.polysCross(curves[i], curves[j])) fail('the new curves would cross each other');
  }
}

// --------------------------------------------------------------------- ops

const OPS = {};

OPS.cup = (ctx, op) => {
  const p = op.p;
  if (G.len(p) > 0.97) fail('outside the disk');
  const room = clearance(ctx.W, p);
  const r = op.r || Math.min(0.14, 0.55 * room);
  if (r < 0.025 || r >= room) fail('not enough room here for a circle');
  const nl = op.label || 1;
  if (!labelOK(nl)) fail('bad label');
  const pts = G.circlePts(p, r, op.ccw !== false);
  const q = ctx.addVert(ctx.id('q'), pts[0]);
  const e = ctx.addEdge({ id: ctx.id('c'), a: q, b: q, label: nl, pts });
  ctx.patch(e.id, null, 'cup', { ring: pts.slice(0, -1), center: p, text: 0.3 });
};

OPS.cap = (ctx, op) => {
  const inc = incid(ctx.W);
  const e = ctx.edge(op.e);
  if (!isCircleEdge(ctx.W, inc, op.e)) fail('only a circle (no trivalent vertices) can be capped');
  for (const id in ctx.W.verts) {
    if (id === e.a) continue;
    if (G.pointInPoly(vpos(ctx.W, id), e.pts)) fail('the circle is not empty');
  }
  for (const id in ctx.W.edges) {
    if (id === op.e) continue;
    if (G.pointInPoly(ctx.W.edges[id].pts[0], e.pts)) fail('the circle is not empty');
  }
  ctx.involve(op.e); ctx.involveV(e.a);
  ctx.patch(op.e, null, 'cap', { ring: e.pts.slice(0, -1), text: 0.7 });
  delete ctx.W.edges[op.e]; delete ctx.W.verts[e.a];
};

OPS.saddle = (ctx, op) => {
  const T = twoPoints(ctx, op, [0.045, 0.22, 0.2]);
  let A = ctx.edge(T.a), B = ctx.edge(T.b);
  let { i1, i2 } = T;
  const { k1, k2 } = T;
  const nA = normLabel(A.label), nB = normLabel(B.label);
  if (nA.lab !== nB.lab) fail(`labels differ (${A.label} vs ${B.label})`);
  if (nA.rev !== nB.rev && !nA.half) { flipEdge(ctx.W, T.b); B = ctx.edge(T.b); i2 = B.pts.length - 1 - i2; }
  if (S.mode === 'gl' && A.label !== B.label) fail('labels differ');
  const p1 = A.pts[i1], p2 = B.pts[i2];
  const t1 = G.tangentAt(A.pts, i1), t2 = G.tangentAt(B.pts, i2), nv = G.sub(p2, p1);
  if (G.len(nv) < 1e-3) fail('pick two different points');
  if (!nA.half && Math.sign(G.cross(t1, nv)) !== Math.sign(G.cross(t2, G.mul(nv, -1))))
    fail('the strands must run in opposite directions across the face');
  const A1 = A.pts[i1 - k1], B1 = A.pts[i1 + k1], A2 = B.pts[i2 - k2], B2 = B.pts[i2 + k2];
  // two bridges across the face, each joining window ends on the same side
  const u = G.unit(nv);
  const brA = G.connector(A1, u, B2, u);            // A1 -> B2
  const brB = G.connector(A2, G.mul(u, -1), B1, G.mul(u, -1));  // A2 -> B1
  const skip = { [T.a]: winSkip(i1, k1), [T.b]: winSkip(i2, k2) };
  checkAcross(ctx, p1, p2, skip);
  checkCurves(ctx, [brA, brB], skip);
  const f1 = ctx.addEdge({ id: ctx.id('f1'), a: A.a, b: B.b, label: A.label, pts: cat(A.pts.slice(0, i1 - k1 + 1), brA, B.pts.slice(i2 + k2)), ov: [ovAt(A, 0), ovAt(B, 1)] });
  const f2 = ctx.addEdge({ id: ctx.id('f2'), a: B.a, b: A.b, label: A.label, pts: cat(B.pts.slice(0, i2 - k2 + 1), brB, A.pts.slice(i1 + k1)), ov: [ovAt(B, 0), ovAt(A, 1)] });
  delete ctx.W.edges[A.id]; delete ctx.W.edges[B.id];
  ctx.W.edges[f1.id] = f1; ctx.W.edges[f2.id] = f2;
  ctx.partial(A.id, A.pts.slice(0, i1 - k1 + 1)); ctx.partial(A.id, A.pts.slice(i1 + k1));
  ctx.partial(B.id, B.pts.slice(0, i2 - k2 + 1)); ctx.partial(B.id, B.pts.slice(i2 + k2));
  ctx.patch(A.id, loopOf([
    at(A.pts.slice(i1 - k1, i1 + k1 + 1), 0), vert(B1), at(G.rev(brB), 1), vert(A2, false),
    at(B.pts.slice(i2 - k2, i2 + k2 + 1), 0), vert(B2), at(G.rev(brA), 1), vert(A1, false),
  ]));
  ctx.union(A.id, B.id); ctx.union(A.id, f1.id); ctx.union(A.id, f2.id);
};

OPS.zip = (ctx, op) => {
  const T = twoPoints(ctx, op, [0.07, 0.2, 0.16]);
  let A = ctx.edge(T.a), B = ctx.edge(T.b);
  let { i1, i2 } = T;
  const { k1, k2 } = T;
  const p1 = A.pts[i1], p2 = B.pts[i2], nv = G.sub(p2, p1);
  if (G.len(nv) < 1e-3) fail('pick two different points');
  let t1 = G.tangentAt(A.pts, i1), t2 = G.tangentAt(B.pts, i2);
  let par = Math.sign(G.cross(t1, nv)) !== Math.sign(G.cross(t2, G.mul(nv, -1)));
  if (!par && S.mode === 'sl') { flipEdge(ctx.W, T.b); B = ctx.edge(T.b); i2 = B.pts.length - 1 - i2; t2 = G.tangentAt(B.pts, i2); par = true; }
  const flow = A.label + (par ? B.label : -B.label);       // along the rung, left to right
  const L1 = A.pts[i1 - k1], R1 = A.pts[i1 + k1];
  const L2 = par ? B.pts[i2 - k2] : B.pts[i2 + k2], R2 = par ? B.pts[i2 + k2] : B.pts[i2 - k2];
  const M = G.mid(p1, p2);
  const v1p = G.lerp(M, G.mid(L1, L2), 0.75), v2p = G.lerp(M, G.mid(R1, R2), 0.75);
  if (G.dist(v1p, v2p) < 0.02) fail('strands too close to zip');
  const u = G.unit(G.sub(v2p, v1p)), mu = G.mul(u, -1);
  const tA = i => G.tangentAt(A.pts, i), tB = i => { const t = G.tangentAt(B.pts, i); return par ? t : G.mul(t, -1); };
  // all curves oriented left -> right
  const cL1 = G.connector(L1, tA(i1 - k1), v1p, u);
  const cR1 = G.connector(v2p, u, R1, tA(i1 + k1));
  const cL2 = G.connector(L2, tB(par ? i2 - k2 : i2 + k2), v1p, u);
  const cR2 = G.connector(v2p, u, R2, tB(par ? i2 + k2 : i2 - k2));
  const rung = G.line(v1p, v2p, 6);
  const skip = { [T.a]: winSkip(i1, k1), [T.b]: winSkip(i2, k2) };
  checkAcross(ctx, p1, p2, skip);
  checkCurves(ctx, [cL1, cR1, cL2, cR2, rung], skip);
  const v1 = ctx.addVert(ctx.id('v1'), v1p), v2 = ctx.addVert(ctx.id('v2'), v2p);
  delete ctx.W.edges[A.id]; delete ctx.W.edges[B.id];
  const aL = ctx.addEdge({ id: ctx.id('aL'), a: A.a, b: v1, label: A.label, pts: cat(A.pts.slice(0, i1 - k1 + 1), cL1), ov: [ovAt(A, 0), 0] });
  const aR = ctx.addEdge({ id: ctx.id('aR'), a: v2, b: A.b, label: A.label, pts: cat(cR1, A.pts.slice(i1 + k1)), ov: [0, ovAt(A, 1)] });
  let bL, bR;
  if (par) {
    bL = ctx.addEdge({ id: ctx.id('bL'), a: B.a, b: v1, label: B.label, pts: cat(B.pts.slice(0, i2 - k2 + 1), cL2), ov: [ovAt(B, 0), 0] });
    bR = ctx.addEdge({ id: ctx.id('bR'), a: v2, b: B.b, label: B.label, pts: cat(cR2, B.pts.slice(i2 + k2)), ov: [0, ovAt(B, 1)] });
  } else {
    bR = ctx.addEdge({ id: ctx.id('bR'), a: B.a, b: v2, label: B.label, pts: cat(B.pts.slice(0, i2 - k2 + 1), G.rev(cR2)), ov: [ovAt(B, 0), 0] });
    bL = ctx.addEdge({ id: ctx.id('bL'), a: v1, b: B.b, label: B.label, pts: cat(G.rev(cL2), B.pts.slice(i2 + k2)), ov: [0, ovAt(B, 1)] });
  }
  const c = edgeWithFlow(ctx, ctx.id('r'), v1, v2, flow, rung);
  const seam = seamArc(rung, 1, 0.42);
  ctx.seam(seam);
  ctx.partial(A.id, A.pts.slice(0, i1 - k1 + 1)); ctx.partial(A.id, A.pts.slice(i1 + k1));
  ctx.partial(B.id, B.pts.slice(0, i2 - k2 + 1)); ctx.partial(B.id, B.pts.slice(i2 + k2));
  ctx.patch(c.id, loopOf([at(rung, 1), rev3(seam)]));
  const winA = A.pts.slice(i1 - k1, i1 + k1 + 1);
  const winB = par ? B.pts.slice(i2 - k2, i2 + k2 + 1) : G.rev(B.pts.slice(i2 - k2, i2 + k2 + 1));
  ctx.patch(A.id, loopOf([at(winA, 0), vert(R1), at(G.rev(cR1), 1), rev3(seam), at(G.rev(cL1), 1), vert(L1, false)]));
  ctx.patch(B.id, loopOf([at(winB, 0), vert(R2), at(G.rev(cR2), 1), rev3(seam), at(G.rev(cL2), 1), vert(L2, false)]));
  ctx.union(A.id, aL.id); ctx.union(A.id, aR.id); ctx.union(B.id, bL.id); ctx.union(B.id, bR.id);
};

// the three darts at a trivalent vertex, starting with the given edge end
function aroundH(ctx, eid) {
  const W = ctx.W, inc = incid(W), c = ctx.edge(eid);
  const v1 = c.a, v2 = c.b;
  if (v1 === v2) fail('a loop edge');
  if (!isTri(W, inc, v1) || !isTri(W, inc, v2)) fail('both ends must be trivalent vertices');
  const R1 = rot(W, inc, v1), R2 = rot(W, inc, v2);
  const i1 = R1.findIndex(d => d.e === eid && d.end === 0), i2 = R2.findIndex(d => d.e === eid && d.end === 1);
  return { c, v1, v2, l1: R1[(i1 + 1) % 3], l2: R1[(i1 + 2) % 3], r1: R2[(i2 + 1) % 3], r2: R2[(i2 + 2) % 3] };
}

// polyline of a leg oriented away from its vertex, cut where it gets far enough
function legCut(ctx, d, v, r) {
  const E = ctx.W.edges[d.e];
  const Q = d.end === 0 ? E.pts : G.rev(E.pts);
  const vp = vpos(ctx.W, v);
  let j = 1;
  while (j < Q.length - 2 && G.dist(Q[j], vp) < r) j++;
  const n = Q.length;
  const nearSegs = d.end === 0 ? skipRange(0, j - 1) : skipRange(n - 1 - j, n - 2);
  return { E, Q, j, P: Q[j], near: Q.slice(0, j + 1), far: Q.slice(j), farV: d.end === 0 ? E.b : E.a, nearSegs };
}

// skip sets for curves replacing the near ends of some legs (and edge c entirely)
function legSkip(c, legs) {
  const skip = c ? { [c]: true } : {};
  for (const g of legs) {
    const prev = skip[g.E.id];
    if (prev === true) continue;
    skip[g.E.id] = prev ? new Set([...prev, ...g.nearSegs]) : new Set(g.nearSegs);
  }
  return skip;
}

OPS.unzip = (ctx, op) => {
  const H = aroundH(ctx, op.e);
  const { c, v1, v2, l1, l2, r1, r2 } = H;
  const E = id => ctx.W.edges[id];
  // strands: (l2, r1) on the right of c, (r2, l1) on the left
  if (!flowZero(fIn(E(l2.e), l2.end) + fIn(E(r1.e), r1.end)) || !flowZero(fIn(E(r2.e), r2.end) + fIn(E(l1.e), l1.end)))
    fail('the legs do not pair up into strands (labels/orientations differ)');
  if (l2.e === r2.e || l1.e === r1.e) fail('legs are tangled');
  const clen = G.polyLen(c.pts);
  const delta = Math.max(0.018, Math.min(0.05, 0.28 * clen));
  const cc = G.cumLen(c.pts);
  let j0 = 1; while (j0 < c.pts.length - 2 && cc[j0] < 1.4 * delta) j0++;
  let j1 = c.pts.length - 2; while (j1 > j0 && cc[cc.length - 1] - cc[j1] < 1.4 * delta) j1--;
  const core = j1 > j0 ? c.pts.slice(j0, j1 + 1) : [G.pointAtLen(c.pts, cc, clen * 0.45), G.pointAtLen(c.pts, cc, clen * 0.55)];
  const right = G.offsetPts(core, -delta), left = G.offsetPts(core, delta);
  const u0 = G.unit(G.sub(core[core.length - 1], core[0]));
  const nu0 = G.mul(u0, -1);
  const legs = {};
  for (const [d, v] of [[l1, v1], [l2, v1], [r1, v2], [r2, v2]]) legs[d.e + '/' + d.end] = legCut(ctx, d, v, 2.4 * delta);
  const Lg = d => legs[d.e + '/' + d.end];
  const inward = g => G.mul(G.tangentAt(g.Q, g.j), -1);
  const outward = g => G.tangentAt(g.Q, g.j);
  // middle of a strand: from leg a's cut point, along the offset path, to leg b's cut point
  const strandMid = (ga, path, gb) => cat(G.connector(ga.P, inward(ga), path[0], G.unit(G.sub(path[Math.min(1, path.length - 1)], path[0]))),
                                          path, G.connector(path[path.length - 1], G.unit(G.sub(path[path.length - 1], path[Math.max(0, path.length - 2)])), gb.P, outward(gb)));
  const gl2 = Lg(l2), gr1 = Lg(r1), gr2 = Lg(r2), gl1 = Lg(l1);
  const midR = strandMid(gl2, right, gr1);           // v1 side -> v2 side
  const midL = strandMid(gr2, G.rev(left), gl1);     // v2 side -> v1 side
  checkCurves(ctx, [midR, midL], legSkip(c.id, [gl1, gl2, gr1, gr2]));
  const arch = seamArc(c.pts, 0, 0.56);
  ctx.seam(arch);
  ctx.involve(c.id, l1.e, l2.e, r1.e, r2.e); ctx.involveV(v1, v2);
  ctx.patch(c.id, loopOf([at(c.pts, 0), rev3(arch)]));
  const mk = (tag, ga, mid, gb, side) => {
    // the new strand runs ga.far (reversed) -> mid -> gb.far
    let pts, aV, bV, loop = false, ov = [0, 0];
    if (ga.E.id === gb.E.id) {
      // both ends on the same edge: the strand closes up into a circle
      const n = ga.Q.length;
      const jb = n - 1 - gb.j;
      if (jb <= ga.j + 1) fail('edge too short');
      const dm = ga.Q.slice(ga.j, jb + 1);                     // from ga.P to gb.P along the edge
      ctx.partial(ga.E.id, dm);
      pts = cat(mid, G.rev(dm));
      const q = ctx.addVert(ctx.id('q' + tag), pts[0]);
      aV = bV = q; loop = true;
    } else {
      ctx.partial(ga.E.id, ga.far); ctx.partial(gb.E.id, gb.far);
      pts = cat(G.rev(ga.far), mid, gb.far);
      aV = ga.farV; bV = gb.farV;
      ov = [ovAt(ga.E, 1 - side[0].end), ovAt(gb.E, 1 - side[1].end)];
    }
    // flow along the strand: what enters the H through leg a
    const da = side[0];
    const f = fIn(ga.E, da.end);
    const e = edgeWithFlow(ctx, ctx.id(tag), aV, bV, f, pts, ov);
    ctx.union(ga.E.id, e.id); ctx.union(gb.E.id, e.id);
    ctx.patch(e.id, loopOf([
      at(G.rev(ga.near), 0), side[2] ? arch : rev3(arch), at(gb.near, 0), vert(gb.P), at(G.rev(mid), 1), vert(ga.P, false),
    ]));
    return loop;
  };
  // the leg records hold on to the old edge objects, so they can go now
  for (const id of [c.id, l1.e, l2.e, r1.e, r2.e]) delete ctx.W.edges[id];
  delete ctx.W.verts[v1]; delete ctx.W.verts[v2];
  mk('s1', gl2, midR, gr1, [l2, r1, true]);
  mk('s2', gr2, midL, gl1, [r2, l1, false]);
};

OPS.dbirth = (ctx, op) => {
  const e = ctx.edge(op.e);
  ctx.involve(op.e);
  const p = op.p, q = op.q;                   // signed labels of left / right arcs (+ = along e)
  if (!p || !q) fail('choose the digon labels');
  if (S.mode === 'gl' ? p + q !== e.label : !flowZero(p + q - e.label)) fail('digon labels must add up to the edge label');
  const k = halfWin(e, 0.07);
  if (e.pts.length < 2 * k + 3) fail('edge too short');
  const i = clampIdx(e, G.indexAtFrac(e.pts, op.s), k);
  const win = e.pts.slice(i - k, i + k + 1);
  const wl = G.polyLen(win);
  const h = 0.42 * wl;
  const arcL = G.bulge(win, h), arcR = G.bulge(win, -h);
  checkCurves(ctx, [arcL, arcR], { [op.e]: winSkip(i, k) });
  const v1 = ctx.addVert(ctx.id('v1'), win[0]), v2 = ctx.addVert(ctx.id('v2'), win[win.length - 1]);
  delete ctx.W.edges[op.e];
  const eL = ctx.addEdge({ id: ctx.id('eL'), a: e.a, b: v1, label: e.label, pts: e.pts.slice(0, i - k + 1), ov: [ovAt(e, 0), 0] });
  const eR = ctx.addEdge({ id: ctx.id('eR'), a: v2, b: e.b, label: e.label, pts: e.pts.slice(i + k), ov: [0, ovAt(e, 1)] });
  const dL = edgeWithFlow(ctx, ctx.id('dL'), v1, v2, p, arcL);
  const dR = edgeWithFlow(ctx, ctx.id('dR'), v1, v2, q, arcR);
  const seam = seamArc(win, 1, 0.4);
  ctx.seam(seam);
  ctx.partial(op.e, e.pts.slice(0, i - k + 1)); ctx.partial(op.e, e.pts.slice(i + k));
  ctx.patch(op.e, loopOf([at(win, 0), vert(win[win.length - 1]), rev3(seam), vert(win[0], false)]));
  ctx.patch(dL.id, loopOf([at(arcL, 1), rev3(seam)]));
  ctx.patch(dR.id, loopOf([at(arcR, 1), rev3(seam)]));
  ctx.union(op.e, eL.id); ctx.union(op.e, eR.id);
};

OPS.ddeath = (ctx, op) => {
  const W = ctx.W, inc = incid(W), e = ctx.edge(op.e);
  const v1 = e.a, v2 = e.b;
  if (v1 === v2) fail('not a digon edge');
  if (!isTri(W, inc, v1) || !isTri(W, inc, v2)) fail('not a digon edge');
  const R1 = rot(W, inc, v1);
  const ie = R1.findIndex(d => d.e === op.e && d.end === 0);
  // the other digon edge is a rotation neighbour of e at v1 that also ends at v2
  let d = null, g1 = null;
  for (const s of [1, 2]) {
    const x = R1[(ie + s) % 3];
    const X = W.edges[x.e];
    if (x.e !== op.e && (x.end === 0 ? X.b : X.a) === v2 && !d) d = x;
  }
  if (!d) fail('this edge does not bound a digon');
  g1 = R1.find(x => x.e !== op.e && x.e !== d.e);
  const g2 = incid(W)[v2].find(x => x.e !== op.e && x.e !== d.e);
  if (!g1 || !g2) fail('not a digon');
  if (g1.e === g2.e) fail('this is a theta web: use theta −');
  const D = W.edges[d.e];
  const eP = e.pts, dP = d.end === 0 ? D.pts : G.rev(D.pts);        // both from v1 to v2
  const poly = cat(eP, G.rev(dP));
  for (const id in W.verts) if (id !== v1 && id !== v2 && G.pointInPoly(vpos(W, id), poly)) fail('the digon is not empty');
  for (const id in W.edges) if (id !== op.e && id !== d.e && G.pointInPoly(W.edges[id].pts[Math.floor(W.edges[id].pts.length / 2)], poly)) fail('the digon is not empty');
  const G1 = W.edges[g1.e], G2 = W.edges[g2.e];
  if (!flowZero(fIn(G1, g1.end) + fIn(G2, g2.end))) fail('the outer legs do not match');
  // the new edge runs down the middle of the digon (or along e if the
  // average of the two sides is not a clean curve)
  let n = Math.max(eP.length, dP.length) - 1;
  const a = G.resampleN(eP, n), b = G.resampleN(dP, n);
  let midl = a.map((p, i) => G.mid(p, b[i]));
  midl[0] = eP[0].slice(); midl[n] = eP[eP.length - 1].slice();
  if (G.selfCrosses(midl) || G.polysCross(midl, eP) || G.polysCross(midl, dP)) { midl = G.copyPts(eP); n = midl.length - 1; }
  const q1 = g1.end === 1 ? G1.pts : G.rev(G1.pts);       // towards v1
  const q2 = g2.end === 0 ? G2.pts : G.rev(G2.pts);       // away from v2
  const far1 = g1.end === 1 ? G1.a : G1.b, far2 = g2.end === 0 ? G2.b : G2.a;
  const arch = seamArc(midl, 0, 0.56);
  ctx.seam(arch);
  ctx.involve(op.e, d.e, g1.e, g2.e); ctx.involveV(v1, v2);
  ctx.partial(g1.e, G1.pts); ctx.partial(g2.e, G2.pts);
  ctx.patch(op.e, loopOf([at(eP, 0), rev3(arch)]));
  ctx.patch(d.e, loopOf([at(dP, 0), rev3(arch)]));
  for (const id of [op.e, d.e, g1.e, g2.e]) delete W.edges[id];
  delete W.verts[v1]; delete W.verts[v2];
  const f = fIn(G1, g1.end);
  const ne = edgeWithFlow(ctx, ctx.id('e'), far1, far2, f, cat(q1, midl, q2), [ovAt(G1, 1 - g1.end), ovAt(G2, 1 - g2.end)]);
  ctx.patch(ne.id, loopOf([arch, vert(midl[n]), at(G.rev(midl), 1), vert(midl[0], false)]));
  ctx.union(g1.e, ne.id); ctx.union(g2.e, ne.id);
};

OPS.tbirth = (ctx, op) => {
  const p = op.p;
  if (G.len(p) > 0.95) fail('outside the disk');
  const room = clearance(ctx.W, p);
  const r = Math.min(0.13, 0.5 * room);
  if (r < 0.03) fail('not enough room here for a theta');
  const a = op.a || 1, b = op.b || 1;
  const v1p = [p[0] - r, p[1]], v2p = [p[0] + r, p[1]];
  const middle = G.line(v1p, v2p, 8);                       // runs in +x, so its left normal is +y
  const top = G.bulge(middle, 0.75 * r), bot = G.bulge(middle, -0.75 * r);
  const v1 = ctx.addVert(ctx.id('v1'), v1p), v2 = ctx.addVert(ctx.id('v2'), v2p);
  const tE = edgeWithFlow(ctx, ctx.id('t'), v1, v2, a, top);
  const bE = edgeWithFlow(ctx, ctx.id('b'), v1, v2, b, bot);
  const mE = edgeWithFlow(ctx, ctx.id('m'), v2, v1, a + b, G.rev(middle));
  const seam = seamArc(middle, 1, 0.35);
  ctx.seam(seam);
  ctx.patch(tE.id, loopOf([at(top, 1), rev3(seam)]));
  ctx.patch(bE.id, loopOf([at(bot, 1), rev3(seam)]));
  ctx.patch(mE.id, loopOf([at(middle, 1), rev3(seam)]));
};

OPS.tdeath = (ctx, op) => {
  const W = ctx.W, inc = incid(W), e = ctx.edge(op.e);
  const v1 = e.a, v2 = e.b;
  if (v1 === v2 || !isTri(W, inc, v1) || !isTri(W, inc, v2)) fail('not an edge of a theta web');
  const ids = inc[v1].map(x => x.e);
  if (new Set(ids).size !== 3 || !ids.every(id => { const x = W.edges[id]; return (x.a === v1 && x.b === v2) || (x.a === v2 && x.b === v1); }))
    fail('not an edge of a theta web');
  const paths = ids.map(id => { const x = W.edges[id]; return { id, pts: x.a === v1 ? x.pts : G.rev(x.pts) }; });
  // the middle edge is the one inside the cycle formed by the other two
  let mi = 0;
  for (let i = 0; i < 3; i++) {
    const o = paths.filter((_, j) => j !== i);
    const poly = cat(o[0].pts, G.rev(o[1].pts));
    const pt = paths[i].pts[Math.floor(paths[i].pts.length / 2)];
    if (G.pointInPoly(pt, poly)) { mi = i; break; }
  }
  const outer = cat(paths[(mi + 1) % 3].pts, G.rev(paths[(mi + 2) % 3].pts));
  for (const id in W.verts) if (id !== v1 && id !== v2 && G.pointInPoly(vpos(W, id), outer)) fail('the theta is not empty');
  for (const id in W.edges) if (!ids.includes(id) && G.pointInPoly(W.edges[id].pts[0], outer)) fail('the theta is not empty');
  const midl = paths[mi].pts;
  const arch = seamArc(midl, 0, 0.6);
  ctx.seam(arch);
  ctx.involve(...ids); ctx.involveV(v1, v2);
  for (const P of paths) ctx.patch(P.id, loopOf([at(P.pts, 0), rev3(arch)]));
  for (const id of ids) delete W.edges[id];
  delete W.verts[v1]; delete W.verts[v2];
};

OPS.assoc = (ctx, op) => {
  const H = aroundH(ctx, op.e);
  const { c, v1, v2, l1, l2, r1, r2 } = H;
  const W = ctx.W, E = id => W.edges[id];
  if (new Set([l1.e, l2.e, r1.e, r2.e]).size < 4) fail('a leg runs between the two vertices (digon): reduce it first');
  // new pairing: w1 = {l2, r1} (right of c), w2 = {r2, l1} (left of c)
  const F1 = fIn(E(l2.e), l2.end) + fIn(E(r1.e), r1.end);   // flow into w1 from its legs
  const p1 = vpos(W, v1), p2 = vpos(W, v2);
  const cc = G.cumLen(c.pts), M = G.pointAtLen(c.pts, cc, cc[cc.length - 1] / 2);
  const u = G.unit(G.sub(p2, p1)), nrm = G.perp(u);
  const h = Math.max(0.05, Math.min(0.14, 0.5 * G.dist(p1, p2)));
  const w1p = G.sub(M, G.mul(nrm, h)), w2p = G.add(M, G.mul(nrm, h));
  const legs = [[l1, v1, w2p], [l2, v1, w1p], [r1, v2, w1p], [r2, v2, w2p]].map(([d, v, w]) => {
    const g = legCut(ctx, d, v, Math.max(1.6 * h, 0.08));
    const tOut = G.tangentAt(g.Q, g.j);
    const newNear = G.connector(w, G.unit(G.sub(g.P, w)), g.P, tOut);    // from w to the cut point
    return { d, v, w, g, newNear };
  });
  const dline = G.line(w1p, w2p, 6);
  checkCurves(ctx, [dline, ...legs.map(L => L.newNear)], legSkip(c.id, legs.map(L => L.g)));
  for (const L of legs) {
    for (const K of legs) if (K !== L && G.polysCross(L.newNear.slice(1), K.newNear.slice(1))) fail('legs would cross');
    if (G.polysCross(L.newNear.slice(1), dline.slice(1, -1))) fail('legs would cross the new edge');
  }
  const S0 = [M[0], M[1], 0.5];
  const s1 = seg3([p1[0], p1[1], 0], S0), s2 = seg3([p2[0], p2[1], 0], S0);
  const t1 = seg3(S0, [w1p[0], w1p[1], 1]), t2 = seg3(S0, [w2p[0], w2p[1], 1]);
  ctx.seam(s1); ctx.seam(s2); ctx.seam(t1); ctx.seam(t2);
  ctx.piece.sing.push(S0);
  ctx.involve(c.id, l1.e, l2.e, r1.e, r2.e); ctx.involveV(v1, v2);
  ctx.patch(c.id, loopOf([at(c.pts, 0), s2, rev3(s1)]));
  const w1 = ctx.addVert(ctx.id('w1'), w1p), w2 = ctx.addVert(ctx.id('w2'), w2p);
  delete W.edges[c.id]; delete W.verts[v1]; delete W.verts[v2];
  // the legs bring flow F1 into w1, so the new edge carries F1 from w1 to w2
  if (flowZero(F1)) fail('the rotated edge would carry zero flow: this H unzips instead');
  const dE = edgeWithFlow(ctx, ctx.id('d'), w1, w2, F1, dline);
  ctx.patch(dE.id, loopOf([at(dline, 1), rev3(t2), t1]));
  for (const L of legs) {
    const { d, v, w, g, newNear } = L;
    const wid = G.same(w, w1p) ? w1 : w2;
    const Eg = g.E;
    const newPts = cat(newNear, g.far);                        // from w outwards
    ctx.partial(Eg.id, g.far);
    const sv = v === v1 ? s1 : s2, tw = G.same(w, w1p) ? t1 : t2;
    ctx.patch(Eg.id, loopOf([at(G.rev(g.near), 0), sv, tw, at(newNear, 1), vert(g.P, false)]));
    if (d.end === 0) { Eg.a = wid; Eg.pts = newPts; } else { Eg.b = wid; Eg.pts = G.rev(newPts); }
  }
};

// ------------------------------------------------ crossings: R1 and sliding

// the other end, at crossing v, of the strand arriving along (eid, end)
function mateEnd(W, v, eid, end) {
  const st = crossingStrands(W, incid(W), v);
  if (!st) fail('not a crossing');
  for (const s of st) {
    if (s.x.e === eid && s.x.end === end) return { e: s.y.e, end: s.y.end };
    if (s.y.e === eid && s.y.end === end) return { e: s.x.e, end: s.x.end };
  }
  fail('broken crossing');
}

// join two edge ends that meet at a vertex into a single edge
function joinEnds(ctx, a, b, id) {
  const W = ctx.W;
  if (a.e === b.e) fail('cannot join an edge to itself');
  if (a.end === 0 && b.end === 1) [a, b] = [b, a];
  if (a.end !== 1) { if (S.mode !== 'sl') fail('strand orientations disagree'); flipEdge(W, a.e); a = { e: a.e, end: 1 }; }
  if (b.end !== 0) { if (S.mode !== 'sl') fail('strand orientations disagree'); flipEdge(W, b.e); b = { e: b.e, end: 0 }; }
  const g = W.edges[a.e], h = W.edges[b.e];
  if (g.label !== h.label) fail('labels change along a strand');
  delete W.edges[g.id]; delete W.edges[h.id];
  ctx.addEdge({ id, a: g.a, b: h.b, label: g.label, pts: g.pts.concat(h.pts.slice(1)), ov: [ovAt(g, 0), ovAt(h, 1)] });
  ctx.union(g.id, id); ctx.union(h.id, id);
  return id;
}

// split edge eid at the point pt of its polyline, at the new crossing vertex cid
function splitAtPoint(ctx, eid, pt, cid, flag) {
  const e = ctx.edge(eid);
  const c = G.closestOnPoly(e.pts, pt);
  const { pts, k } = G.insertOnSegment(e.pts, c.i, pt);
  const a = ctx.addEdge({ id: ctx.id('p' + ctx.np++), a: e.a, b: cid, label: e.label, pts: pts.slice(0, k + 1), ov: [ovAt(e, 0), flag] });
  const b = ctx.addEdge({ id: ctx.id('p' + ctx.np++), a: cid, b: e.b, label: e.label, pts: pts.slice(k), ov: [flag, ovAt(e, 1)] });
  delete ctx.W.edges[eid];
  ctx.union(eid, a.id); ctx.union(eid, b.id);
  return [a.id, b.id];
}

// the edge of W whose polyline passes through pt (after earlier splits)
function edgeThrough(W, pt) {
  let best = null, bd = 1e-7;
  for (const id in W.edges) { const d = G.closestOnPoly(W.edges[id].pts, pt).d; if (d < bd) { bd = d; best = id; } }
  return best;
}

// The maximal strand through crossings that contains edge eid, as oriented
// steps; cyclic if it closes up without meeting an ordinary vertex.
function strandChain(W, eid) {
  const steps = [{ e: eid, fwd: true }];
  let cyclic = false;
  let cur = { e: eid, end: 1 };
  for (let guard = 0; guard < 1000; guard++) {
    const E = W.edges[cur.e], v = cur.end ? E.b : E.a;
    if (!W.verts[v].cr) break;
    const m = mateEnd(W, v, cur.e, cur.end);
    if (m.e === eid && m.end === 0) { cyclic = true; break; }
    steps.push({ e: m.e, fwd: m.end === 0 });
    cur = { e: m.e, end: 1 - m.end };
  }
  if (!cyclic) {
    cur = { e: eid, end: 0 };
    for (let guard = 0; guard < 1000; guard++) {
      const E = W.edges[cur.e], v = cur.end ? E.b : E.a;
      if (!W.verts[v].cr) break;
      const m = mateEnd(W, v, cur.e, cur.end);
      steps.unshift({ e: m.e, fwd: m.end === 1 });
      cur = { e: m.e, end: 1 - m.end };
    }
  }
  return { steps, cyclic };
}

// lay the steps of a chain end to end
function chainPoly(W, steps) {
  const P = [], nodes = [];
  steps.forEach((st, k) => {
    const E = W.edges[st.e];
    const pts = st.fwd ? E.pts : G.rev(E.pts);
    if (k === 0) { pts.forEach(p => P.push([p[0], p[1]])); nodes.push({ v: st.fwd ? E.a : E.b, i: 0, flag: ovAt(E, st.fwd ? 0 : 1) }); }
    else for (let i = 1; i < pts.length; i++) P.push([pts[i][0], pts[i][1]]);
    nodes.push({ v: st.fwd ? E.b : E.a, i: P.length - 1, flag: ovAt(E, st.fwd ? 1 : 0), from: st.e });
  });
  return { P, nodes };
}

// Drag a strand by op.d from the point op.s of edge op.e.  The moving part of
// the strand must stay over (level +1) or under (-1) everything it crosses, so
// the move is an isotopy in space; crossings appear and disappear accordingly.
OPS.lift = (ctx, op) => {
  const W = ctx.W, level = op.level < 0 ? -1 : 1, dv = op.d, dl = G.len(dv);
  if (dl < 2e-3) fail('drag the strand somewhere');
  const E0 = ctx.edge(op.e);
  let ch = strandChain(W, op.e);
  let { P, nodes } = chainPoly(W, ch.steps);
  const grab = (() => {      // arclength of the grabbed point along the chain
    const k = ch.steps.findIndex(st => st.e === op.e);
    const before = ch.steps.slice(0, k).reduce((a, st) => a + G.polyLen(W.edges[st.e].pts), 0);
    const L = G.polyLen(E0.pts);
    return before + (ch.steps[k].fwd ? op.s : 1 - op.s) * L;
  })();
  let c = G.cumLen(P), Ltot = c[c.length - 1];
  let s0 = grab;
  if (ch.cyclic) {
    // restart the cycle at the crossing farthest from the grab point
    const target = (grab + Ltot / 2) % Ltot;
    let best = 0, bd = Infinity;
    nodes.forEach((n, k) => {
      if (k >= ch.steps.length) return;
      const d0 = Math.abs(c[n.i] - target), d = Math.min(d0, Ltot - d0);
      if (d < bd) { bd = d; best = k; }
    });
    const steps = ch.steps.slice(best).concat(ch.steps.slice(0, best));
    ch = { steps, cyclic: true };
    ({ P, nodes } = chainPoly(W, steps));
    c = G.cumLen(P); Ltot = c[c.length - 1];
    // the grab point's arclength in the rotated chain
    const k = steps.findIndex(st => st.e === op.e);
    s0 = steps.slice(0, k).reduce((a, st) => a + G.polyLen(W.edges[st.e].pts), 0) + (steps[k].fwd ? op.s : 1 - op.s) * G.polyLen(E0.pts);
  }
  let ell = Math.max(0.15, Math.min(0.6, 1.5 * dl));
  if (ch.cyclic) ell = Math.min(ell, 0.42 * Ltot);
  const taper = Math.min(0.08, Ltot / 4);
  const ss = t => t * t * (3 - 2 * t);
  const w = c.map(si => {
    const u = Math.abs(si - s0);
    if (u >= ell) return 0;
    const b = 0.5 * (1 + Math.cos(Math.PI * u / ell));
    return b * ss(Math.min(1, si / taper, (Ltot - si) / taper));
  });
  w[0] = 0; w[w.length - 1] = 0;
  // crossings the bump barely touches stay put, and the strand stays rigid
  // near them so that it cannot swing round them
  const r0 = 0.045;
  for (const n of nodes.slice(1, -1)) {
    if (w[n.i] > 0.02) continue;
    for (let i = 0; i < w.length; i++) { const u = Math.abs(c[i] - c[n.i]); if (u < 2 * r0) w[i] *= ss(Math.max(0, u - r0) / r0); }
  }
  if (nodes.length && W.verts[nodes[0].v] && W.verts[nodes[0].v].cr) {
    for (let i = 0; i < w.length; i++) { const u = Math.min(c[i], Ltot - c[i]); if (u < 2 * r0) w[i] *= ss(Math.max(0, u - r0) / r0); }
  }
  let iA = 0, iB = P.length - 1;
  for (let i = 0; i < P.length; i++) { if (w[i] > 1e-9) break; iA = i; }
  for (let i = P.length - 1; i >= 0; i--) { if (w[i] > 1e-9) break; iB = i; }
  if (iB <= iA + 1) fail('nothing to move');
  const moving = nodes.filter(n => n.i > iA && n.i < iB);
  for (const n of moving) {
    if (!W.verts[n.v].cr) fail('the moving part of a strand cannot pass a vertex of its own');
    if (n.flag !== level) fail(level > 0 ? 'this part of the strand passes under something: only a strand that stays over everything can slide freely (hold shift to slide it under)'
                                         : 'this part of the strand passes over something: hold shift only for strands that stay under everything');
  }
  const Q = P.map((p, i) => [p[0] + w[i] * dv[0], p[1] + w[i] * dv[1]]);
  const mid = G.resample(Q.slice(iA, iB + 1), SP, 4);
  mid[0] = P[iA].slice(); mid[mid.length - 1] = P[iB].slice();
  const N = P.slice(0, iA + 1).concat(mid.slice(1, -1), P.slice(iB));
  if (G.selfCrosses(N)) fail('the strand would run into itself');
  for (let i = 1; i < mid.length - 1; i++) if (G.len(mid[i]) > 0.985) fail('the strand would leave the disk');
  // flow of the strand along the chain
  const st0 = ch.steps[0], F0 = W.edges[st0.e];
  const flow = st0.fwd ? F0.label : -F0.label;
  const oldChain = [...new Set(ch.steps.map(st => st.e))];
  ctx.involve(...oldChain);
  // remember the other strands' edges at the crossings that move
  const sameGeom = new Map();       // old edge id -> its polyline (the top gains points)
  const startV = nodes[0].v, endV = nodes[nodes.length - 1].v;
  for (const id of oldChain) delete W.edges[id];
  for (const n of moving) {
    const inc = incid(W)[n.v];
    if (inc.length !== 2) fail('a crossing of the strand with itself is in the way');
    for (const x of inc) if (!sameGeom.has(x.e) && ctx.W0.edges[x.e]) sameGeom.set(x.e, ctx.W0.edges[x.e].pts);
    ctx.involve(...inc.map(x => x.e));
    if (inc[0].e === inc[1].e) {          // the other strand closes up through here: a circle
      const e = W.edges[inc[0].e];
      e.ov = [0, 0]; delete e.ov;
      W.verts[n.v].cr = undefined; delete W.verts[n.v].cr;
      continue;
    }
    joinEnds(ctx, inc[0], inc[1], ctx.id('j' + ctx.np++));
    delete W.verts[n.v];
  }
  // the moved part must not touch vertices, and gets crossings where it meets edges
  for (const id in W.verts) {
    if (id === startV || id === endV) continue;
    const q = vpos(W, id);
    if (G.same(q, mid[0], 1e-9) || G.same(q, mid[mid.length - 1], 1e-9)) continue;
    if (G.closestOnPoly(mid, q).d < 0.012) fail('the strand would pass through a vertex');
  }
  const hits = [];
  for (const id in W.edges) for (const X of G.intersections(mid, W.edges[id].pts)) hits.push({ id, ...X, u0: X.i + X.t });
  hits.sort((a, b) => a.u0 - b.u0);
  for (let k = 1; k < hits.length; k++) if (G.dist(hits[k].pt, hits[k - 1].pt) < 0.015) fail('the strand would cross other strands too close together');
  const crossings = hits.map((h, k) => {
    const id = ctx.id('x' + k);
    ctx.addVert(id, h.pt); W.verts[id].cr = true;
    const host = edgeThrough(W, h.pt);
    if (!host) fail('lost track of a crossing');
    if (ctx.W0.edges[host] && !sameGeom.has(host)) sameGeom.set(host, ctx.W0.edges[host].pts);
    if (ctx.W0.edges[host]) ctx.involve(host);
    splitAtPoint(ctx, host, h.pt, id, -level);
    return { id, h };
  });
  // the new strand: N with the crossing points inserted into its moving part
  let midX = mid.map(p => p.slice());
  const midCuts = [];
  for (let k = crossings.length - 1; k >= 0; k--) {
    const { h } = crossings[k];
    const r = G.insertOnSegment(midX, h.i, h.pt);
    midX = r.pts;
  }
  // indices of the crossing points in midX (in order)
  let cursor = 0;
  for (const { h } of crossings) {
    while (cursor < midX.length && !G.same(midX[cursor], h.pt, 1e-12)) cursor++;
    midCuts.push(cursor);
  }
  const N2 = P.slice(0, iA + 1).concat(midX.slice(1, -1), P.slice(iB));
  const shift = midX.length - (iB - iA + 1);
  const cuts = [];      // [index in N2, vertex, flag]
  cuts.push([0, nodes[0].v, nodes[0].flag]);
  for (const n of nodes.slice(1, -1)) {
    if (n.i <= iA) cuts.push([n.i, n.v, n.flag]);
  }
  crossings.forEach(({ id }, k) => cuts.push([iA + midCuts[k], id, level]));
  for (const n of nodes.slice(1, -1)) if (n.i >= iB) cuts.push([n.i + shift, n.v, n.flag]);
  cuts.push([N2.length - 1, nodes[nodes.length - 1].v, nodes[nodes.length - 1].flag]);
  cuts.sort((a, b) => a[0] - b[0]);
  const fresh = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const [i0, v0, f0] = cuts[k], [i1, v1, f1] = cuts[k + 1];
    const e = edgeWithFlow(ctx, ctx.id('s' + k), v0, v1, flow, N2.slice(i0, i1 + 1), [f0, f1]);
    fresh.push(e.id);
  }
  for (const id of oldChain) for (const f of fresh) ctx.union(id, f);
  // the foam: S's fixed ends extrude, its moving middle morphs; the other
  // strands keep their shape and only gain or lose crossing points
  ctx.partial(oldChain[0], P.slice(0, iA + 1));
  ctx.partial(oldChain[oldChain.length - 1], P.slice(iB));
  ctx.morph(oldChain[0], P.slice(iA, iB + 1), midX);
  for (const [id, pts] of sameGeom) {
    let top = pts.map(p => p.slice());
    for (const { h } of crossings) {
      const cl = G.closestOnPoly(top, h.pt);
      if (cl.d < 1e-9 && !top.some(p => G.same(p, h.pt, 1e-12))) top = G.insertOnSegment(top, cl.i, h.pt).pts;
    }
    ctx.morph(id, pts, top);
  }
};

// Reidemeister I: a small curl on edge op.e at op.s, on side op.side, whose
// first pass goes over (op.over = +1) or under the second.
OPS.r1 = (ctx, op) => {
  const e = ctx.edge(op.e);
  ctx.involve(op.e);
  const k = halfWin(e, 0.11);
  if (e.pts.length < 2 * k + 3) fail('edge too short for a curl');
  const i = clampIdx(e, G.indexAtFrac(e.pts, op.s), k);
  const A = e.pts[i - k], B = e.pts[i + k];
  const L = G.dist(A, B);
  if (L < 0.08) fail('edge too short for a curl');
  const t = G.unit(G.sub(B, A)), nrm = G.mul(G.perp(t), op.side < 0 ? -1 : 1);
  const a = 0.34 * L, b = 0.42 * L, n = 48;
  const curve = [];
  for (let j = 0; j <= n; j++) {
    const u = j / n, x = L * u + a * Math.sin(2 * Math.PI * u), y = b * (1 - Math.cos(2 * Math.PI * u));
    curve.push(G.add(A, G.add(G.mul(t, x), G.mul(nrm, y))));
  }
  curve[0] = A.slice(); curve[n] = B.slice();
  const X = G.intersections(curve, curve, true);
  if (X.length !== 1) fail('could not form the curl');
  const { i: ia, j: ib, pt } = X[0];
  checkCurves(ctx, [curve.slice(0, ia + 1).concat([pt]), curve.slice(ib + 1)], { [op.e]: winSkip(i, k) });
  if (crossesWeb(ctx.W, curve, { [op.e]: winSkip(i, k) })) fail('the curl would cross another edge');
  for (const id in ctx.W.verts) if (G.pointInPoly(vpos(ctx.W, id), [pt].concat(curve.slice(ia + 1, ib + 1)))) fail('the curl would enclose a vertex');
  const o = op.over < 0 ? -1 : 1;
  const xid = ctx.id('x');
  ctx.addVert(xid, pt); ctx.W.verts[xid].cr = true;
  const pre = e.pts.slice(0, i - k + 1).concat(curve.slice(1, ia + 1), [pt]);
  const loop = [pt].concat(curve.slice(ia + 1, ib + 1), [pt]);
  const post = [pt].concat(curve.slice(ib + 1, n), e.pts.slice(i + k));
  delete ctx.W.edges[op.e];
  const e1 = ctx.addEdge({ id: ctx.id('a'), a: e.a, b: xid, label: e.label, pts: pre, ov: [ovAt(e, 0), o] });
  const lp = ctx.addEdge({ id: ctx.id('l'), a: xid, b: xid, label: e.label, pts: loop, ov: [o, -o] });
  const e3 = ctx.addEdge({ id: ctx.id('b'), a: xid, b: e.b, label: e.label, pts: post, ov: [-o, ovAt(e, 1)] });
  for (const f of [e1, lp, e3]) ctx.union(op.e, f.id);
  ctx.partial(op.e, e.pts.slice(0, i - k + 1));
  ctx.partial(op.e, e.pts.slice(i + k));
  ctx.morph(op.e, e.pts.slice(i - k, i + k + 1), curve.slice(0, ia + 1).concat([pt], curve.slice(ia + 1, ib + 1), [pt], curve.slice(ib + 1)));
};

// Reidemeister I backwards: an empty curl (a loop edge at a crossing) straightens.
OPS.r1d = (ctx, op) => {
  const W = ctx.W, lp = ctx.edge(op.e);
  const X = lp.a;
  if (lp.a !== lp.b || !W.verts[X].cr) fail('click the loop of a curl');
  const inner = lp.pts;
  for (const id in W.verts) if (id !== X && G.pointInPoly(vpos(W, id), inner)) fail('the curl is not empty');
  for (const id in W.edges) if (id !== op.e && G.pointInPoly(W.edges[id].pts[Math.floor(W.edges[id].pts.length / 2)], inner)) fail('the curl is not empty');
  const inc = incid(W)[X].filter(x => x.e !== op.e);
  if (inc.length !== 2) fail('not a curl');
  if (inc[0].e === inc[1].e) {
    // a figure eight: the other lobe closes up into a plain circle
    const other = W.edges[inc[0].e], Q = other.pts, n = Q.length;
    let j = 1; while (j < n - 3 && G.dist(Q[j], Q[0]) < 0.07) j++;
    let j2 = 1; while (j2 < n - 3 - j && G.dist(Q[n - 1 - j2], Q[0]) < 0.07) j2++;
    if (j + j2 >= n - 2) fail('curl too small');
    const conn = G.connector(Q[n - 1 - j2], G.tangentAt(Q, n - 1 - j2), Q[j], G.tangentAt(Q, j));
    checkCurves(ctx, [conn], { [op.e]: true, [other.id]: new Set([...skipRange(0, j - 1), ...skipRange(n - 1 - j2, n - 2)]) });
    const body = Q.slice(j, n - j2);
    // follow the strand: out of the other lobe's end, round the curl, into its start
    const m = mateEnd(W, X, other.id, 1);
    const innerT = m.e === op.e && m.end === 1 ? G.rev(inner) : inner;
    ctx.involve(op.e, other.id);
    ctx.partial(other.id, body);
    ctx.morph(op.e, cat(Q.slice(n - 1 - j2), innerT, Q.slice(0, j + 1)), conn);
    delete W.edges[op.e]; delete W.edges[other.id]; delete W.verts[X];
    const q = ctx.addVert(ctx.id('q'), Q[j]);
    const ne = ctx.addEdge({ id: ctx.id('c'), a: q, b: q, label: other.label, pts: cat(body, conn) });
    ctx.union(op.e, ne.id); ctx.union(other.id, ne.id);
    return;
  }
  // the strand arrives along one end and leaves along the other
  let [inE, outE] = inc;
  if (inE.end === 0 && outE.end === 1) [inE, outE] = [outE, inE];
  const gi = legCut(ctx, inE, X, 0.07), go = legCut(ctx, outE, X, 0.07);
  if (gi.E.id === go.E.id) fail('not a curl');
  // the strand runs round the curl forwards or backwards
  const mi = mateEnd(W, X, inE.e, inE.end);
  const innerT = mi.e === op.e && mi.end === 1 ? G.rev(inner) : inner;
  const fi = W.edges[inE.e], fo = W.edges[outE.e];
  const flow = fIn(fi, inE.end);
  const conn = G.connector(gi.P, G.mul(G.tangentAt(gi.Q, gi.j), -1), go.P, G.tangentAt(go.Q, go.j));
  const pts = cat(G.rev(gi.far), conn, go.far);
  checkCurves(ctx, [conn], legSkip(op.e, [gi, go]));
  ctx.involve(op.e, inE.e, outE.e);
  ctx.partial(inE.e, gi.far); ctx.partial(outE.e, go.far);
  ctx.morph(op.e, cat(G.rev(gi.near), innerT, go.near), conn);
  delete W.edges[op.e]; delete W.edges[inE.e]; delete W.edges[outE.e]; delete W.verts[X];
  const ne = edgeWithFlow(ctx, ctx.id('e'), gi.farV, go.farV, flow, pts, [ovAt(fi, 1 - inE.end), ovAt(fo, 1 - outE.end)]);
  for (const id of [op.e, inE.e, outE.e]) ctx.union(id, ne.id);
};

OPS.iso = (ctx, op) => {
  const W = ctx.W;
  for (const id in (op.verts || {})) if (W.verts[id] && !W.verts[id].bd) { W.verts[id].x = op.verts[id][0]; W.verts[id].y = op.verts[id][1]; }
  for (const id in (op.edges || {})) if (W.edges[id]) W.edges[id].pts = G.copyPts(op.edges[id]);
  for (const id in W.edges) {
    const e = W.edges[id], pa = vpos(W, e.a), pb = vpos(W, e.b);
    if (!G.same(e.pts[0], pa)) e.pts = G.deformEnd(e.pts, true, pa);
    if (!G.same(e.pts[e.pts.length - 1], pb)) e.pts = G.deformEnd(e.pts, false, pb);
    e.pts[0] = pa.slice(); e.pts[e.pts.length - 1] = pb.slice();
  }
  ctx.piece.morph = true;
};

// the direction in which a polyline (oriented away from its start) leaves it
const leaving = Q => { const o = Q[0]; for (let k = 1; k < Q.length; k++) if (G.dist(o, Q[k]) > 0.015 || k === Q.length - 1) return G.unit(G.sub(Q[k], o)); return [1, 0]; };

// cut a polyline at an intersection: the part up to the point and the part after
const cutAt = (P, X) => [P.slice(0, X.i + 1).concat([X.pt]), [X.pt].concat(P.slice(X.i + 1))];

// Reidemeister V: the neighbouring legs op.a, op.b at the trivalent vertex
// op.v trade places, crossing once next to the vertex (op.over = +1: a on top).
OPS.r5 = (ctx, op) => {
  const W = ctx.W, inc = incid(W), v = op.v;
  if (!W.verts[v] || !isTri(W, inc, v)) fail('twists happen at trivalent vertices');
  const R = rot(W, inc, v);
  if (op.a === op.b || R.filter(d => d.e === op.a).length !== 1 || R.filter(d => d.e === op.b).length !== 1) fail('pick two different legs of the vertex');
  const da = R.find(d => d.e === op.a), db = R.find(d => d.e === op.b);
  const A = ctx.edge(op.a), B = ctx.edge(op.b);
  const rho = Math.min(0.1, 0.3 * Math.min(G.polyLen(A.pts), G.polyLen(B.pts)));
  if (rho < 0.03) fail('these legs are too short to twist');
  const ga = legCut(ctx, da, v, 2.4 * rho), gb = legCut(ctx, db, v, 2.4 * rho);
  const vp = vpos(W, v);
  // the corner runs counterclockwise from leg a to leg b; the legs cross on its bisector
  const th = q => Math.atan2(q[1], q[0]);
  const thA = th(leaving(ga.Q)), thB = th(leaving(gb.Q));
  const width = ((thB - thA) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (width < 0.35) fail('the corner between these legs is too narrow to twist in');
  const thM = thA + width / 2, h = width / 2;
  const at = (ang, r) => [vp[0] + r * Math.cos(ang), vp[1] + r * Math.sin(ang)];
  const k = Math.min(0.5 * h, 0.6);
  // a starts on b's side of the bisector and ends on its own side, b the
  // other way round, so they cross once near the bisector
  const pa = G.spline([vp, at(thM + k, 0.6 * rho), at(thM - k, 1.4 * rho), ga.P], null, G.add(ga.P, G.mul(G.tangentAt(ga.Q, ga.j), 0.1)));
  const pb = G.spline([vp, at(thM - k, 0.6 * rho), at(thM + k, 1.4 * rho), gb.P], null, G.add(gb.P, G.mul(G.tangentAt(gb.Q, gb.j), 0.1)));
  const Xs = G.intersections(pa, pb).filter(x => G.dist(x.pt, vp) > 0.01);
  if (Xs.length !== 1) fail('these legs cannot be twisted here');
  {
    const X = Xs[0], ta = G.unit(G.sub(pa[X.i + 1], pa[X.i])), tb = G.unit(G.sub(pb[X.j + 1], pb[X.j]));
    if (Math.abs(G.cross(ta, tb)) < 0.3 || G.dist(X.pt, vp) < 0.025) fail('the twist would be too tight here');
  }
  // each new leg must keep clear of the rest of the web (they cross each other once, on purpose)
  const sk = legSkip(null, [ga, gb]);
  checkCurves(ctx, [pa], sk); checkCurves(ctx, [pb], sk);
  const X = Xs[0], xid = ctx.id('x');
  ctx.addVert(xid, X.pt); W.verts[xid].cr = true;
  const oA = op.over < 0 ? -1 : 1, oB = -oA;
  const [a1, a2] = cutAt(pa, X), [b1, b2] = cutAt(pb, { i: X.j, pt: X.pt });
  const rebuild = (E, d, g, near, rest, o, tag) => {
    // pieces oriented away from v: v -> X -> far vertex
    const far = cat(rest, g.far);
    const fo = ovAt(E, 1 - d.end);
    const e1 = d.end === 0 ? ctx.addEdge({ id: ctx.id(tag + '1'), a: v, b: xid, label: E.label, pts: near, ov: [0, o] })
                           : ctx.addEdge({ id: ctx.id(tag + '1'), a: xid, b: v, label: E.label, pts: G.rev(near), ov: [o, 0] });
    const e2 = d.end === 0 ? ctx.addEdge({ id: ctx.id(tag + '2'), a: xid, b: g.farV, label: E.label, pts: far, ov: [o, fo] })
                           : ctx.addEdge({ id: ctx.id(tag + '2'), a: g.farV, b: xid, label: E.label, pts: G.rev(far), ov: [fo, o] });
    ctx.union(E.id, e1.id); ctx.union(E.id, e2.id);
  };
  ctx.involve(op.a, op.b);
  ctx.partial(op.a, ga.far); ctx.partial(op.b, gb.far);
  ctx.morph(op.a, ga.near, cat(a1, a2));
  ctx.morph(op.b, gb.near, cat(b1, b2));
  delete W.edges[op.a]; delete W.edges[op.b];
  rebuild(A, da, ga, a1, a2, oA, 'a');
  rebuild(B, db, gb, b1, b2, oB, 'b');
};

// Reidemeister V backwards: the small bigon between a vertex and a crossing
// (one side of it is op.e) comes undone.
OPS.r5d = (ctx, op) => {
  const W = ctx.W, inc = incid(W), e = ctx.edge(op.e);
  let v, X;
  if (W.verts[e.a].cr && isTri(W, inc, e.b)) { X = e.a; v = e.b; }
  else if (W.verts[e.b].cr && isTri(W, inc, e.a)) { X = e.b; v = e.a; }
  else fail('click an edge of a twist: it runs from a vertex to the crossing next to it');
  const fid = Object.keys(W.edges).find(id => id !== op.e && ((W.edges[id].a === v && W.edges[id].b === X) || (W.edges[id].a === X && W.edges[id].b === v)));
  if (!fid) fail('not a twist');
  const F = W.edges[fid];
  const eX = e.a === X ? 0 : 1, fX = F.a === X ? 0 : 1;
  const mE = mateEnd(W, X, op.e, eX), mF = mateEnd(W, X, fid, fX);
  if (mE.e === fid || mF.e === op.e || mE.e === mF.e) fail('not a twist');
  const eVX = e.a === v ? e.pts : G.rev(e.pts), fVX = F.a === v ? F.pts : G.rev(F.pts);
  const poly = cat(eVX, G.rev(fVX));
  for (const id in W.verts) if (id !== v && id !== X && G.pointInPoly(vpos(W, id), poly)) fail('the twist is not empty');
  for (const id in W.edges) if (id !== op.e && id !== fid && G.pointInPoly(W.edges[id].pts[Math.floor(W.edges[id].pts.length / 2)], poly)) fail('the twist is not empty');
  const ge = legCut(ctx, mE, X, 0.06), gf = legCut(ctx, mF, X, 0.06);
  const vp = vpos(W, v);
  const ce = G.connector(vp, G.unit(G.sub(ge.P, vp)), ge.P, G.tangentAt(ge.Q, ge.j));
  const cf = G.connector(vp, G.unit(G.sub(gf.P, vp)), gf.P, G.tangentAt(gf.Q, gf.j));
  if (G.polysCross(ce, cf)) fail('cannot untwist here');
  checkCurves(ctx, [ce, cf], { ...legSkip(null, [ge, gf]), [op.e]: true, [fid]: true });
  ctx.involve(op.e, fid, mE.e, mF.e);
  ctx.partial(mE.e, ge.far); ctx.partial(mF.e, gf.far);
  ctx.morph(op.e, cat(eVX, ge.near), ce);
  ctx.morph(fid, cat(fVX, gf.near), cf);
  const made = [];
  for (const [E0, endV, m, g, conn] of [[e, 1 - eX, mE, ge, ce], [F, 1 - fX, mF, gf, cf]]) {
    // the leg runs from v along the connector and then the far part
    const ptsVF = cat(conn, g.far);
    made.push([E0, m, g, ptsVF, fIn(E0, endV), ovAt(g.E, 1 - m.end)]);
  }
  for (const id of [op.e, fid, mE.e, mF.e]) delete W.edges[id];
  delete W.verts[X];
  made.forEach(([E0, m, g, ptsVF, flowIn, fo], k) => {
    const ne = edgeWithFlow(ctx, ctx.id('l' + k), g.farV, v, flowIn, G.rev(ptsVF), [fo, 0]);
    ctx.union(E0.id, ne.id); ctx.union(m.e, ne.id);
  });
};

export function applyOp(W, op) {
  const fn = OPS[op.type];
  if (!fn) throw new MoveError('unknown move ' + op.type);
  const ctx = new Ctx(W, op);
  fn(ctx, op);
  if (op.type !== 'iso') ctx.finish();
  // safety net: a move must not spoil a valid web
  if (op.type !== 'iso') {
    const before = validate(W), after = validate(ctx.W);
    if (before.ok && !after.ok) {
      const why = after.probs.find(p => !p.warn).msg;
      if (typeof console !== 'undefined' && globalThis.__wfStrict) console.warn('internal: ' + op.type + ' produced: ' + why);
      throw new MoveError(`this move would leave an invalid web (${why})`);
    }
  }
  return { W: ctx.W, piece: ctx.piece };
}

// --------------------------------------------- candidate options for the UI

// labels (signed, relative to the edge) for the two arcs of a new digon
export function digonSplits(c) {
  const out = [];
  const N = S.N;
  if (S.mode === 'gl') {
    for (let p = -N; p <= N; p++) {
      const q = c - p;
      if (!p || !q || Math.abs(q) > N) continue;
      if (p < 0 && q < 0) continue;
      out.push([p, q]);
    }
  } else {
    for (let p = 1; p < N; p++) for (let q = 1; q < N; q++) if (flowZero(p + q - c)) out.push([p, q]);
  }
  return out;
}

export function describeSigned(x) {
  const L = flowToLabel(x);
  if (!L) return '0';
  return L.label + (L.flip ? '↓' : '↑');
}
