// Webs: oriented graphs in the unit disk with labelled edges, drawn as
// diagrams, so they may be knotted in D² × [-1, 1].
//   W = { verts: {id: {id, x, y, bd?, cr?}}, edges: {id: {id, a, b, label, pts, ov?}} }
// Edge e runs from vertex e.a to vertex e.b along the polyline e.pts
// (pts[0] = pos(a), pts[last] = pos(b)).  Boundary vertices (bd) sit on the
// unit circle.  A circle component is a loop edge at a bivalent vertex.
// A crossing is a 4-valent vertex (cr) where two strands pass; e.ov = [o0, o1]
// says whether the edge is over (+1) or under (-1) at its a- and b-ends
// (0 at ordinary vertices).
import { S, normLabel, flowZero, labelOK } from './config.js';
import * as G from './geom.js';

export const emptyWeb = () => ({ verts: {}, edges: {} });
export const cloneWeb = W => structuredClone(W);
export const vpos = (W, id) => [W.verts[id].x, W.verts[id].y];

export function incid(W) {
  const inc = {};
  for (const id in W.verts) inc[id] = [];
  for (const id in W.edges) {
    const e = W.edges[id];
    (inc[e.a] ||= []).push({ e: id, end: 0 });
    (inc[e.b] ||= []).push({ e: id, end: 1 });
  }
  return inc;
}

// unit direction in which the edge leaves its endpoint (end 0 = at e.a)
export function dartDir(e, end) {
  const p = e.pts, n = p.length, o = end ? p[n - 1] : p[0];
  for (let k = 1; k < n; k++) {
    const q = end ? p[n - 1 - k] : p[k];
    if (G.dist(o, q) > 0.015 || k === n - 1) return G.unit(G.sub(q, o));
  }
  return [1, 0];
}

// darts at v in counterclockwise order
export function rot(W, inc, v) {
  return inc[v]
    .map(x => { const d = dartDir(W.edges[x.e], x.end); return { ...x, ang: Math.atan2(d[1], d[0]) }; })
    .sort((p, q) => p.ang - q.ang);
}

// flow into a vertex carried by an incident edge
export const fIn = (E, end) => (end ? E.label : -E.label);

export function flowAt(W, inc, v) {
  let f = 0;
  for (const { e, end } of inc[v]) f += fIn(W.edges[e], end);
  return f;
}

export const isLoopVertex = (W, inc, v) => !W.verts[v].bd && inc[v].length === 2 && inc[v][0].e === inc[v][1].e;
export const isCircleEdge = (W, inc, id) => { const e = W.edges[id]; return e.a === e.b && isLoopVertex(W, inc, e.a); };
export const isTri = (W, inc, v) => !W.verts[v].bd && !W.verts[v].cr && inc[v].length === 3;

export const ovOf = e => e.ov || [0, 0];
export const ovAt = (e, end) => (e.ov ? e.ov[end] : 0);

// the depth (height in D² × [-1, 1]) of an edge's points: the over strand rises
// to +DEPTH at a crossing and the under strand dips to -DEPTH; ordinary
// vertices stay at depth 0 (the bumps never reach the far end of an edge)
export const DEPTH = 0.1;
export function edgeDepth(e) {
  const o = ovOf(e), n = e.pts.length;
  if (!o[0] && !o[1]) return new Array(n).fill(0);
  const c = G.cumLen(e.pts), L = c[n - 1];
  const r = Math.min(0.22, L / 2.5);
  const phi = u => (u >= r ? 0 : 0.5 * (1 + Math.cos(Math.PI * u / r)));
  return c.map(s => DEPTH * (o[0] * phi(s) + o[1] * phi(L - s)));
}

// the two strands through a crossing: pairs of opposite darts (in rotation)
export function crossingStrands(W, inc, v) {
  const R = rot(W, inc, v);
  if (R.length !== 4) return null;
  const pairs = [[R[0], R[2]], [R[1], R[3]]];
  return pairs.map(([x, y]) => ({ x, y, ov: ovAt(W.edges[x.e], x.end) }));
}

// reverse an edge, keeping its meaning (only legitimate in sl(N))
export function flipEdge(W, id) {
  const e = W.edges[id];
  [e.a, e.b] = [e.b, e.a];
  e.pts = G.rev(e.pts);
  if (e.ov) e.ov = [e.ov[1], e.ov[0]];
  if (S.mode === 'sl') e.label = S.N - e.label;
  else e.label = -e.label;
}

// ---------------------------------------------------------------- validation

export function findCrossings(W) {
  const cell = 0.07, grid = new Map(), segs = [];
  for (const id in W.edges) {
    const p = W.edges[id].pts;
    for (let i = 0; i < p.length - 1; i++) {
      const s = { id, i, a: p[i], b: p[i + 1], n: p.length };
      segs.push(s);
      const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / cell), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / cell);
      const y0 = Math.floor(Math.min(s.a[1], s.b[1]) / cell), y1 = Math.floor(Math.max(s.a[1], s.b[1]) / cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x * 7919 + y;
        let L = grid.get(k); if (!L) grid.set(k, L = []);
        L.push(s);
      }
    }
  }
  const hits = new Map();
  for (const L of grid.values()) {
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const s = L[i], t = L[j];
      if (s.id === t.id && Math.abs(s.i - t.i) <= 1) continue;
      if (G.segsCross(s.a, s.b, t.a, t.b)) {
        const key = s.id < t.id ? s.id + '|' + t.id : t.id + '|' + s.id;
        if (!hits.has(key)) hits.set(key, { e1: s.id, e2: t.id, at: G.mid(s.a, s.b) });
      }
    }
  }
  return [...hits.values()];
}

export function validate(W) {
  const probs = [], inc = incid(W), bad = new Set(), badE = new Set();
  const P = (msg, o = {}) => { probs.push({ msg, ...o }); if (o.v) bad.add(o.v); if (o.e) badE.add(o.e); };
  for (const id in W.verts) {
    const v = W.verts[id], d = inc[id].length;
    if (v.bd) { if (d !== 1) P(d === 0 ? 'boundary point with no edge' : 'boundary point with several edges', { v: id }); continue; }
    if (d === 0) { P('isolated vertex', { v: id }); continue; }
    if (d === 1) { P('dangling edge end', { v: id }); continue; }
    if (v.cr) {
      const st = d === 4 ? crossingStrands(W, inc, id) : null;
      if (!st) { P('a crossing needs exactly four edge ends', { v: id }); continue; }
      if (!((st[0].ov === 1 && st[1].ov === -1) || (st[0].ov === -1 && st[1].ov === 1))
        || st.some(s => ovAt(W.edges[s.y.e], s.y.end) !== s.ov)) P('a crossing needs one strand over and the other under', { v: id });
      for (const s of st) if (!flowZero(fIn(W.edges[s.x.e], s.x.end) + fIn(W.edges[s.y.e], s.y.end))) P('a strand changes label or direction at a crossing', { v: id });
      continue;
    }
    if (inc[id].some(x => ovAt(W.edges[x.e], x.end))) P('over/under data at an ordinary vertex', { v: id });
    if (d > 3) P(`vertex of degree ${d} (webs are trivalent)`, { v: id });
    if (d === 2 && !isLoopVertex(W, inc, id)) P('bivalent vertex (will be merged)', { v: id, warn: true });
    if (!flowZero(flowAt(W, inc, id))) P(`flow not conserved (net ${flowAt(W, inc, id)} in)`, { v: id });
  }
  for (const id in W.edges) {
    const e = W.edges[id];
    if (!labelOK(e.label)) P(`label ${e.label} out of range`, { e: id });
    for (let i = 1; i < e.pts.length - 1; i++) if (G.len(e.pts[i]) > 1.0005) { P('edge leaves the disk', { e: id }); break; }
  }
  for (const c of findCrossings(W)) P('edges cross without a marked crossing', { e: c.e1, at: c.at, e2: c.e2 });
  return { ok: !probs.some(p => !p.warn), probs, bad, badE };
}

// Merge edges through bivalent (non-loop) vertices.  mkId(g, h) names the
// merged edge.  Returns the list of [oldId, newId] identifications.
export function mergeBivalent(W, mkId) {
  const unions = [];
  for (let guard = 0; guard < 10000; guard++) {
    const inc = incid(W);
    let did = false;
    for (const v in W.verts) {
      if (W.verts[v].bd || W.verts[v].cr) continue;
      const I = inc[v];
      if (I.length !== 2 || I[0].e === I[1].e) continue;
      let [x, y] = I;
      if (x.end === 0 && y.end === 1) [x, y] = [y, x];
      if (!(x.end === 1 && y.end === 0)) {
        // both in or both out: only sl(N) lets us reverse one of them
        if (S.mode !== 'sl') continue;
        if (x.end === 0) { flipEdge(W, x.e); x = { e: x.e, end: 1 }; }
        else { flipEdge(W, y.e); y = { e: y.e, end: 0 }; }
      }
      const g = W.edges[x.e], h = W.edges[y.e];
      if (g.b !== v || h.a !== v || g.label !== h.label) continue;
      const id = mkId(g, h);
      const ne = { id, a: g.a, b: h.b, label: g.label, pts: g.pts.concat(h.pts.slice(1)) };
      const ov = [ovAt(g, 0), ovAt(h, 1)];
      if (ov[0] || ov[1]) ne.ov = ov;
      delete W.edges[g.id]; delete W.edges[h.id]; delete W.verts[v];
      W.edges[id] = ne;
      if (g.id !== id) unions.push([g.id, id]);
      if (h.id !== id) unions.push([h.id, id]);
      did = true;
      break;
    }
    if (!did) break;
  }
  return unions;
}

// ------------------------------------------------- planar map + canonical form

function analyze(W) {
  const inc = incid(W), V = W.verts, E = W.edges;
  const darts = [], circles = [];
  for (const id in E) {
    if (isCircleEdge(W, inc, id)) { circles.push(id); continue; }
    const e = E[id], nl = normLabel(e.label);
    const mk = end => {
      const tail = end ? e.b : e.a, head = end ? e.a : e.b;
      const sign = nl.half ? '~' : ((end === 0) !== nl.rev ? '+' : '-');
      let ang;
      if (V[tail].bd) ang = Math.atan2(-V[tail].y, -V[tail].x);
      else { const d = dartDir(e, end); ang = Math.atan2(d[1], d[0]); }
      const o = ovAt(e, end), crs = o > 0 ? '^' : o < 0 ? 'v' : '';
      return { e: id, end, tail, head, tok: nl.lab + sign + crs, pts: end ? G.rev(e.pts) : e.pts, ang };
    };
    const d0 = mk(0), d1 = mk(1);
    d0.alpha = d1; d1.alpha = d0;
    darts.push(d0, d1);
  }
  const bps = Object.values(V).filter(v => v.bd)
    .map(v => ({ id: v.id, a: Math.atan2(v.y, v.x) })).sort((p, q) => p.a - q.a);
  const m = bps.length;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  for (let i = 0; i < m; i++) {
    const p = bps[i], q = bps[(i + 1) % m];
    let a0 = p.a, a1 = q.a;
    if (a1 <= a0) a1 += 2 * Math.PI;
    const n = Math.max(4, Math.ceil((a1 - a0) / 0.05)), arc = [];
    for (let j = 0; j <= n; j++) { const t = a0 + (a1 - a0) * j / n; arc.push([Math.cos(t), Math.sin(t)]); }
    const f = { e: 'W' + i, end: 0, tail: p.id, head: q.id, tok: 'W', pts: arc, ang: wrap(p.a + Math.PI / 2), wall: true };
    const b = { e: 'W' + i, end: 1, tail: q.id, head: p.id, tok: 'W', pts: G.rev(arc), ang: wrap(q.a - Math.PI / 2), wall: true };
    f.alpha = b; b.alpha = f;
    darts.push(f, b);
  }
  const at = {};
  for (const d of darts) (at[d.tail] ||= []).push(d);
  for (const v in at) {
    const L = at[v].sort((p, q) => p.ang - q.ang);
    L.forEach((d, i) => { d.next = L[(i + 1) % L.length]; d.prev = L[(i - 1 + L.length) % L.length]; });
  }
  // faces (face on the left of each dart; bounded faces come out counterclockwise)
  const faces = [];
  for (const d of darts) {
    if (d.face != null) continue;
    const f = { id: faces.length, darts: [] };
    let x = d, guard = 0;
    do { x.face = f.id; f.darts.push(x); x = x.alpha.prev; } while (x !== d && ++guard < 100000);
    const poly = [];
    for (const y of f.darts) for (let i = poly.length ? 1 : 0; i < y.pts.length; i++) poly.push(y.pts[i]);
    f.poly = poly; f.area = G.signedArea(poly);
    faces.push(f);
  }
  // components
  const par = {};
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const v in at) par[v] = v;
  for (const d of darts) { const a = find(d.tail), b = find(d.head); if (a !== b) par[a] = b; }
  const comps = new Map();
  for (const v in at) { const r = find(v); if (!comps.has(r)) comps.set(r, { key: 'G' + r, verts: [], darts: [], faces: new Set() }); comps.get(r).verts.push(v); }
  for (const d of darts) { const c = comps.get(find(d.tail)); c.darts.push(d); c.faces.add(d.face); }
  const rootKey = m ? 'G' + find(bps[0].id) : null;
  // containers: bounded faces of graph components and interiors of circles
  const containers = [];
  for (const c of comps.values()) for (const fi of c.faces) {
    const f = faces[fi];
    if (f.area > 1e-12) containers.push({ key: 'F' + fi, owner: c.key, poly: f.poly, area: f.area });
  }
  for (const id of circles) {
    const p = E[id].pts;
    containers.push({ key: 'C' + id, owner: 'C' + id, poly: p, area: Math.abs(G.signedArea(p)) });
  }
  const floating = [];
  for (const c of comps.values()) if (c.key !== rootKey) floating.push({ key: c.key, kind: 'G', comp: c, pt: [V[c.verts[0]].x, V[c.verts[0]].y] });
  for (const id of circles) floating.push({ key: 'C' + id, kind: 'C', eid: id, pt: E[id].pts[0] });
  const children = new Map();
  for (const X of floating) {
    let best = null;
    for (const C of containers) {
      if (C.owner === X.key) continue;
      if ((!best || C.area < best.area) && G.pointInPoly(X.pt, C.poly)) best = C;
    }
    const key = best ? best.key : 'D';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(X);
  }
  const A = { W, inc, darts, faces, comps, circles, children, bps, rootKey, codes: new Map(), roots: new Map() };
  return A;
}

function kidsOf(A, key) { return A.children.get(key) || []; }

function circleCode(A, eid) {
  const e = A.W.edges[eid], nl = normLabel(e.label);
  const ccw = (G.signedArea(e.pts) > 0) !== nl.rev;
  const o = nl.half ? '~' : (ccw ? 'L' : 'R');
  return `O${nl.lab}${o}{${kidsOf(A, 'C' + eid).map(x => codeOf(A, x)).sort().join(',')}}`;
}

function bfs(A, root) {
  const vnum = new Map(), fnum = new Map(), entry = new Map();
  const vorder = [], dorder = [], forder = [], toks = [];
  vnum.set(root.tail, 0); entry.set(root.tail, root); vorder.push(root.tail);
  const queue = [root.tail];
  const V = A.W.verts;
  while (queue.length) {
    const v = queue.shift(), e0 = entry.get(v);
    const tk = [];
    let d = e0, guard = 0;
    do {
      if (!vnum.has(d.head)) { vnum.set(d.head, vnum.size); entry.set(d.head, d.alpha); vorder.push(d.head); queue.push(d.head); }
      if (!fnum.has(d.face)) { fnum.set(d.face, fnum.size); forder.push(d.face); }
      tk.push(vnum.get(d.head) + ':' + d.tok + ':' + fnum.get(d.face));
      dorder.push(d);
      d = d.next;
    } while (d !== e0 && ++guard < 1000);
    toks.push((V[v].bd ? 'b' + v : V[v].cr ? 'x' : 'v') + '(' + tk.join(',') + ')');
  }
  const fcodes = forder.map(fi => '[' + kidsOf(A, 'F' + fi).map(x => codeOf(A, x)).sort().join(',') + ']');
  return { code: toks.join('') + '/' + fcodes.join(''), vorder, dorder, forder };
}

function codeOf(A, X) {
  if (A.codes.has(X.key)) return A.codes.get(X.key);
  let code;
  if (X.kind === 'C') code = circleCode(A, X.eid);
  else {
    let best = null;
    for (const d of X.comp.darts) {
      const r = bfs(A, d);
      if (!best || r.code < best.code) best = { code: r.code, root: d };
    }
    code = 'G' + best.code;
    A.roots.set(X.key, best.root);
  }
  A.codes.set(X.key, code);
  return code;
}

function topCode(A) {
  if (!A.rootKey) return 'D{' + kidsOf(A, 'D').map(x => codeOf(A, x)).sort().join(',') + '}';
  const b0 = A.bps[0].id;
  const root = A.darts.find(d => d.wall && d.tail === b0 && d.end === 0);
  A.topRoot = root;
  return 'B' + bfs(A, root).code;
}

export function canonCode(W) {
  try { return topCode(analyze(W)); } catch (err) { console.warn('canon failed', err); return null; }
}

// An isotopy (rel boundary) from Wa to Wb as maps of vertices and edges, or null.
// edges: {idA: {to: idB, flip}} with flip when the index directions disagree.
export function isoMap(Wa, Wb) {
  let A, B, ca, cb;
  try { A = analyze(Wa); B = analyze(Wb); ca = topCode(A); cb = topCode(B); } catch (err) { console.warn(err); return null; }
  if (ca !== cb) return null;
  const maps = { verts: {}, edges: {} };
  const matchGraph = (ra, rb) => {
    const ba = bfs(A, ra), bb = bfs(B, rb);
    ba.vorder.forEach((v, i) => { maps.verts[v] = bb.vorder[i]; });
    ba.dorder.forEach((d, i) => {
      const t = bb.dorder[i];
      if (!d.wall && !maps.edges[d.e]) maps.edges[d.e] = { to: t.e, flip: d.end !== t.end };
    });
    ba.forder.forEach((fi, i) => matchKids('F' + fi, 'F' + bb.forder[i]));
  };
  const matchKids = (ka, kb) => {
    const xa = kidsOf(A, ka).map(x => [codeOf(A, x), x]).sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
    const xb = kidsOf(B, kb).map(x => [codeOf(B, x), x]).sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
    xa.forEach(([, X], i) => {
      const Y = xb[i][1];
      if (X.kind === 'C') {
        const e = Wa.edges[X.eid], f = Wb.edges[Y.eid];
        maps.edges[X.eid] = { to: Y.eid, flip: (G.signedArea(e.pts) > 0) !== (G.signedArea(f.pts) > 0) };
        maps.verts[e.a] = f.a;
        matchKids('C' + X.eid, 'C' + Y.eid);
      } else matchGraph(A.roots.get(X.key), B.roots.get(Y.key));
    });
  };
  if (A.rootKey) matchGraph(A.topRoot, B.topRoot);
  else matchKids('D', 'D');
  return maps;
}

// faces of the web inside the disk, as polygons (for hit-testing regions)
export function facePolys(W) {
  const A = analyze(W);
  return A.faces.filter(f => f.area > 0).map(f => f.poly);
}

// The face on one side of an edge: side +1 = left of e (as it runs a -> b),
// -1 = right.  Returns its boundary darts {e, end, tail, head} in order, the
// polygon and the signed area.
export function faceBeside(W, eid, side) {
  const A = analyze(W);
  const d = A.darts.find(x => x.e === eid && x.end === (side > 0 ? 0 : 1));
  if (!d) return null;
  const f = A.faces[d.face];
  const k = f.darts.indexOf(d);
  const ds = f.darts.slice(k).concat(f.darts.slice(0, k));
  return { darts: ds.map(x => ({ e: x.e, end: x.end, tail: x.tail, head: x.head, wall: !!x.wall })), poly: f.poly, area: f.area };
}

// --------------------------------------------------------------- misc helpers

export function nearestEdge(W, p, maxD = Infinity) {
  let best = null;
  for (const id in W.edges) {
    const c = G.closestOnPoly(W.edges[id].pts, p);
    if (c.d < maxD && (!best || c.d < best.d)) best = { id, ...c };
  }
  return best;
}

export function nearestVertex(W, p, maxD = Infinity, filter = null) {
  let best = null;
  for (const id in W.verts) {
    if (filter && !filter(W.verts[id])) continue;
    const d = G.dist(p, vpos(W, id));
    if (d < maxD && (!best || d < best.d)) best = { id, d };
  }
  return best;
}

// distance from p to everything drawn in the web (edges and the boundary circle)
export function clearance(W, p) {
  let d = 1 - G.len(p);
  for (const id in W.edges) d = Math.min(d, G.closestOnPoly(W.edges[id].pts, p).d);
  return d;
}

// does the polyline q cross any edge (ignoring the given edge ids / segment sets)?
export function crossesWeb(W, q, skip = {}) {
  for (const id in W.edges) {
    const s = skip[id];
    if (s === true) continue;
    if (G.polysCross(q, W.edges[id].pts, null, s || null)) return id;
  }
  for (let i = 1; i < q.length - 1; i++) if (G.len(q[i]) > 0.995) return 'boundary';
  return null;
}

export function webStats(W) {
  const inc = incid(W);
  let tri = 0, bd = 0, circ = 0;
  for (const v in W.verts) { if (W.verts[v].bd) bd++; else if (inc[v].length === 3) tri++; }
  for (const e in W.edges) if (isCircleEdge(W, inc, e)) circ++;
  return { tri, bd, circ, edges: Object.keys(W.edges).length };
}
