// A foam is a movie: the bottom web W0, a list of elementary moves, and (when
// the last frame is isotopic to W1) a final isotopy onto the top web.  This
// module replays the movie and turns it into facet meshes, bindings and
// singular vertices, with Euler characteristics read off the welded meshes.
//
// Webs may be knotted (diagrams with crossings), so the foam lives in
// D² × [-1, 1] × [0, 1].  Mesh points are [X, Y, Z, D]: (X, Y, Z) is the
// projected foam in D² × [0, 1] (Y is time) and D is the depth of the web
// point in D² × [-1, 1].  Slicing at a time gives the web in space.
import { S, LROWS, normLabel } from './config.js';
import * as G from './geom.js';
import { applyOp } from './moves.js';
import { cloneWeb, mergeBivalent, isoMap, incid, isCircleEdge, validate, edgeDepth, crossingStrands } from './web.js';

export function prepareWeb(W) {
  const X = cloneWeb(W);
  mergeBivalent(X, g => g.id);
  return X;
}

function prefixIds(W, pre) {
  const X = { verts: {}, edges: {} };
  const vid = id => (W.verts[id].bd ? id : pre + id);
  for (const id in W.verts) X.verts[vid(id)] = { ...W.verts[id], id: vid(id) };
  for (const id in W.edges) { const e = W.edges[id]; X.edges[pre + id] = { ...e, id: pre + id, a: vid(e.a), b: vid(e.b) }; }
  return X;
}

export function replay(state) {
  const frames = [prepareWeb(state.W0)];
  const pieces = [];
  let error = null;
  for (let k = 0; k < state.ops.length; k++) {
    try {
      const r = applyOp(frames[k], state.ops[k]);
      frames.push(r.W); pieces.push(r.piece);
    } catch (err) {
      if (!(err && err.constructor && err.constructor.name === 'MoveError')) console.error(err);
      error = { k, msg: err.message || String(err) };
      break;
    }
  }
  // the top web gets its own id namespace (W0 and W1 may reuse ids), except
  // for the boundary points, which the two webs share
  const top = prefixIds(prepareWeb(state.W1), 'T·');
  const end = frames[frames.length - 1];
  const map = isoMap(end, top);
  return { frames, pieces, error, top, map, valid: frames.map(f => validate(f)) };
}

// ------------------------------------------------------------- mesh helpers

class UF {
  constructor() { this.p = new Map(); }
  find(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r);
    while (this.p.get(x) !== r) { const n = this.p.get(x); this.p.set(x, r); x = n; }
    return r;
  }
  union(a, b) { const x = this.find(a), y = this.find(b); if (x !== y) this.p.set(x, y); }
}

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const key2 = p => Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6);

// depths of every edge point of a web, keyed by position (crossing points have
// one entry per strand end; a neighbouring point tells them apart)
function depthIndex(W) {
  const m = new Map();
  for (const id in W.edges) {
    const e = W.edges[id], D = edgeDepth(e), P = e.pts;
    for (let i = 0; i < P.length; i++) {
      const k = key2(P[i]);
      let L = m.get(k); if (!L) m.set(k, L = []);
      L.push({ D: D[i], nb: [P[i - 1], P[i + 1]] });
    }
  }
  return m;
}
function lookD(idx, p, nb) {
  const L = idx.get(key2(p));
  if (!L) return null;
  if (L.length === 1 || !nb) return L[0].D;
  let best = L[0], bd = Infinity;
  for (const x of L) for (const q of x.nb) if (q) { const d = G.dist(q, nb); if (d < bd) { bd = d; best = x; } }
  return best.D;
}
// fill unknown values (null) by interpolating along the polyline
function fillGaps(pts, D) {
  const c = G.cumLen(pts);
  const known = [];
  D.forEach((d, i) => { if (d != null) known.push(i); });
  if (!known.length) return D.map(() => 0);
  return D.map((d, i) => {
    if (d != null) return d;
    let a = -1, b = -1;
    for (const k of known) { if (k < i) a = k; else if (b < 0) b = k; }
    if (a < 0) return D[b];
    if (b < 0) return D[a];
    const t = (c[i] - c[a]) / ((c[b] - c[a]) || 1);
    return D[a] + (D[b] - D[a]) * t;
  });
}
function depthAlong(idx, pts) {
  return fillGaps(pts, pts.map((p, i) => lookD(idx, p, pts[i + 1] || pts[i - 1])));
}

// harmonic extension of a closed boundary loop (any number of coordinates)
function harmonicDisk(loop, R, zfun) {
  const M = loop.length, dim = loop[0].length;
  const cum = [0];
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + d3(loop[i - 1], loop[i % M]));
  const T = cum[M] || 1;
  const th = cum.slice(0, M).map(c => 2 * Math.PI * c / T);
  const K = 256, NH = 40;
  const g = Array.from({ length: dim }, () => new Float64Array(K));
  let i = 0;
  for (let k = 0; k < K; k++) {
    const t = 2 * Math.PI * k / K;
    while (i < M - 1 && th[i + 1] <= t) i++;
    const t0 = th[i], t1 = i + 1 < M ? th[i + 1] : 2 * Math.PI;
    const a = loop[i], b = loop[(i + 1) % M], s = (t - t0) / ((t1 - t0) || 1);
    for (let c = 0; c < dim; c++) g[c][k] = a[c] + (b[c] - a[c]) * s;
  }
  const A = Array.from({ length: dim }, () => []), B = Array.from({ length: dim }, () => []);
  for (let n = 0; n <= NH; n++) {
    const ca = new Array(dim).fill(0), cb = new Array(dim).fill(0);
    for (let k = 0; k < K; k++) {
      const ph = 2 * Math.PI * k * n / K, co = Math.cos(ph), si = Math.sin(ph);
      for (let c = 0; c < dim; c++) { ca[c] += g[c][k] * co; cb[c] += g[c][k] * si; }
    }
    for (let c = 0; c < dim; c++) { A[c].push(ca[c] / K); B[c].push(cb[c] / K); }
  }
  const cs = th.map(t => { const r = []; for (let n = 0; n <= NH; n++) r.push([Math.cos(n * t), Math.sin(n * t)]); return r; });
  const centre = A.map(a => a[0]);
  const verts = [centre.slice()];
  for (let j = 1; j < R; j++) {
    const r = j / R;
    const rp = [1]; for (let n = 1; n <= NH; n++) rp.push(rp[n - 1] * r);
    for (let ii = 0; ii < M; ii++) {
      const p = centre.slice();
      for (let n = 1; n <= NH; n++) {
        const [co, si] = cs[ii][n];
        for (let c = 0; c < dim; c++) p[c] += 2 * rp[n] * (A[c][n] * co + B[c][n] * si);
      }
      verts.push(p);
    }
  }
  for (let ii = 0; ii < M; ii++) verts.push(loop[ii].slice());
  if (zfun) {
    verts[0][1] = zfun(0);
    for (let j = 1; j < R; j++) for (let ii = 0; ii < M; ii++) verts[1 + (j - 1) * M + ii][1] = zfun(j / R);
  }
  const tris = [];
  const V = (j, ii) => 1 + (j - 1) * M + (ii % M);
  for (let ii = 0; ii < M; ii++) tris.push([0, V(1, ii), V(1, ii + 1)]);
  for (let j = 1; j < R; j++) for (let ii = 0; ii < M; ii++) {
    tris.push([V(j, ii), V(j + 1, ii), V(j + 1, ii + 1)]);
    tris.push([V(j, ii), V(j + 1, ii + 1), V(j, ii + 1)]);
  }
  return { verts, tris };
}

function zipper(A, B, out) {
  const fa = cumFr(A), fb = cumFr(B);
  let i = 0, j = 0;
  while (i < A.length - 1 || j < B.length - 1) {
    if (j === B.length - 1 || (i < A.length - 1 && fa[i + 1] <= fb[j + 1])) { out.push([A[i], A[i + 1], B[j]]); i++; }
    else { out.push([A[i], B[j + 1], B[j]]); j++; }
  }
}
function cumFr(P) {
  const c = [0];
  for (let i = 1; i < P.length; i++) c.push(c[i - 1] + d3(P[i - 1], P[i]));
  const L = c[c.length - 1] || 1;
  return c.map(x => x / L);
}

// rows of world points -> triangles (as point triples)
function stripTris(rows, out) {
  for (let j = 0; j < rows.length - 1; j++) {
    const A = rows[j], B = rows[j + 1];
    if (A.length === B.length) {
      for (let i = 0; i < A.length - 1; i++) { out.push([A[i], B[i], B[i + 1]]); out.push([A[i], B[i + 1], A[i + 1]]); }
    } else zipper(A, B, out);
  }
}

// resample a polyline and a value along it to m segments
function resampleWith(P, D, m) {
  const c = G.cumLen(P), L = c[c.length - 1];
  const outP = [], outD = [];
  let k = 0;
  for (let i = 0; i <= m; i++) {
    const s = L * i / m;
    while (k < c.length - 2 && c[k + 1] < s) k++;
    const t = (s - c[k]) / ((c[k + 1] - c[k]) || 1);
    outP.push(G.lerp(P[k], P[k + 1], Math.max(0, Math.min(1, t))));
    outD.push(D[k] + (D[k + 1] - D[k]) * Math.max(0, Math.min(1, t)));
  }
  outP[0] = P[0].slice(); outD[0] = D[0];
  outP[m] = P[P.length - 1].slice(); outD[m] = D[D.length - 1];
  return [outP, outD];
}

function rotateLoop(top, start) {
  // top: closed polyline (first = last); rotate so it starts near `start`
  const P = top.slice(0, -1);
  let bi = 0, bd = Infinity;
  P.forEach((p, i) => { const d = G.dist(p, start); if (d < bd) { bd = d; bi = i; } });
  const R = P.slice(bi).concat(P.slice(0, bi));
  R.push(R[0].slice());
  return R;
}

// ------------------------------------------------------------------ builder

export function buildFoam(R, opts = {}) {
  const H = opts.slabH || 0.5;
  const { frames, pieces, top, map } = R;
  const slabs = pieces.map((p, k) => ({ bottom: frames[k], top: frames[k + 1], piece: p, kind: 'move' }));
  const complete = !!map;
  if (complete) slabs.push({ bottom: frames[frames.length - 1], top, piece: { morph: true, map }, kind: 'snap' });

  const uf = new UF();
  const labelOf = {};
  const allWebs = frames.concat([top]);
  for (const W of allWebs) {
    for (const id in W.edges) labelOf[id] = W.edges[id].label;
    // a strand keeps its facet through a crossing
    const inc = incid(W);
    for (const v in W.verts) {
      if (!W.verts[v].cr) continue;
      const st = crossingStrands(W, inc, v);
      if (st) for (const s of st) uf.union(s.x.e, s.y.e);
    }
  }
  const idxCache = new Map();
  const dIndex = W => { let x = idxCache.get(W); if (!x) idxCache.set(W, x = depthIndex(W)); return x; };
  const nodeTris = new Map();            // node -> list of [p, q, r] world triangles
  const seams = [], sing = [], slabInfo = [], doubles = [];
  const pushTris = (node, list) => {
    let L = nodeTris.get(node);
    if (!L) nodeTris.set(node, L = []);
    for (const t of list) L.push(t);
  };

  slabs.forEach((sl, k) => {
    const z0 = k * H;
    const W4 = (p, t, d) => [p[0], z0 + t * H, -p[1], d];
    const tau = j => j / LROWS;
    const Wb = sl.bottom, Wt = sl.top, P = sl.piece;
    const bI = dIndex(Wb), tI = dIndex(Wt);
    const incB = incid(Wb);
    slabInfo.push({ z0, z1: z0 + H, kind: sl.kind });
    // crossing trajectories, drawn as double lines of the projected foam
    const crossLine = (a, b) => { const s = []; for (let j = 0; j <= LROWS; j++) { const q = G.lerp(a, b, tau(j)); s.push([q[0], z0 + tau(j) * H, -q[1]]); } doubles.push(s); };
    const morphRows = (bp, bD, tp, tD, out) => {
      const rows = [];
      if (bp.length === tp.length) {
        for (let j = 0; j <= LROWS; j++) { const t = tau(j); rows.push(bp.map((p, i) => W4(G.lerp(p, tp[i], t), t, bD[i] + (tD[i] - bD[i]) * t))); }
      } else {
        const m = Math.max(bp.length, tp.length) - 1;
        const [Bm, BD] = resampleWith(bp, bD, m), [Tm, TD] = resampleWith(tp, tD, m);
        rows.push(bp.map((p, i) => W4(p, 0, bD[i])));
        for (let j = 1; j < LROWS; j++) { const t = tau(j); rows.push(Bm.map((p, i) => W4(G.lerp(p, Tm[i], t), t, BD[i] + (TD[i] - BD[i]) * t))); }
        rows.push(tp.map((p, i) => W4(p, 1, tD[i])));
      }
      stripTris(rows, out);
    };

    if (P.morph) {
      const M = P.map;
      for (const id in Wb.edges) {
        const eb = Wb.edges[id];
        let tid = id, flip = false;
        if (M) { const m = M.edges[id]; if (!m) continue; tid = m.to; flip = m.flip; }
        const et = Wt.edges[tid];
        if (!et) continue;
        let tp = flip ? G.rev(et.pts) : et.pts;
        let tD = flip ? edgeDepth(et).reverse() : edgeDepth(et);
        if (eb.a === eb.b) { tp = rotateLoop(tp, eb.pts[0]); tD = tp.map(() => 0); }
        const tl = []; morphRows(eb.pts, edgeDepth(eb), tp, tD, tl); pushTris(id, tl);
        uf.union(id, tid);
      }
      for (const v in Wb.verts) {
        const tv = M ? M.verts[v] : v;
        if (!tv || !Wt.verts[tv]) continue;
        const a = [Wb.verts[v].x, Wb.verts[v].y], b = [Wt.verts[tv].x, Wt.verts[tv].y];
        if (Wb.verts[v].cr) { crossLine(a, b); continue; }
        if (Wb.verts[v].bd || incB[v].length !== 3) continue;
        const s = []; for (let j = 0; j <= LROWS; j++) s.push(W4(G.lerp(a, b, tau(j)), tau(j), 0));
        seams.push(s);
      }
      return;
    }
    const invE = new Set(P.involvedE), invV = new Set(P.involvedV);
    for (const id in Wb.edges) {
      if (invE.has(id)) continue;
      const e = Wb.edges[id], pts = e.pts, D = edgeDepth(e), rows = [];
      for (let j = 0; j <= LROWS; j++) rows.push(pts.map((p, i) => W4(p, tau(j), D[i])));
      const tl = []; stripTris(rows, tl); pushTris(id, tl);
    }
    for (const v in Wb.verts) {
      if (invV.has(v) || Wb.verts[v].bd) continue;
      const p = [Wb.verts[v].x, Wb.verts[v].y];
      if (Wb.verts[v].cr) { if (Wt.verts[v] && Wt.verts[v].cr) crossLine(p, p); continue; }
      if (incB[v].length !== 3) continue;
      const s = [];
      for (let j = 0; j <= LROWS; j++) s.push(W4(p, tau(j), 0));
      seams.push(s);
    }
    for (const { node, pts } of P.partial) {
      const Db = depthAlong(bI, pts), Dt = depthAlong(tI, pts), rows = [];
      for (let j = 0; j <= LROWS; j++) { const t = tau(j); rows.push(pts.map((p, i) => W4(p, t, Db[i] + (Dt[i] - Db[i]) * t))); }
      const tl = []; stripTris(rows, tl); pushTris(node, tl);
    }
    for (const { node, bottom, top: tpts } of P.morphs || []) {
      const tl = []; morphRows(bottom, depthAlong(bI, bottom), tpts, depthAlong(tI, tpts), tl); pushTris(node, tl);
    }
    // bindings get their depth by interpolating between their endpoints, so
    // every patch that shares a binding sees the same values
    const seamD = new Map();
    const endD = q => (q[2] <= 1e-9 ? lookD(bI, q) : q[2] >= 1 - 1e-9 ? lookD(tI, q) : null) ?? 0;
    for (const s of P.seams) {
      const d0 = endD(s[0]), d1 = endD(s[s.length - 1]);
      const c = []; let acc = 0;
      s.forEach((q, i) => { if (i) acc += d3(s[i - 1], q); c.push(acc); });
      s.forEach((q, i) => seamD.set(q, d0 + (d1 - d0) * (c[i] / (acc || 1))));
    }
    const loopD = loop => loop.map((q, i) => {
      if (seamD.has(q)) return seamD.get(q);
      const nb = loop[(i + 1) % loop.length], nbq = Math.abs(nb[2] - q[2]) < 1e-9 ? nb : null;
      if (q[2] <= 1e-9) return lookD(bI, q, nbq) ?? lookD(tI, q) ?? 0;
      if (q[2] >= 1 - 1e-9) return lookD(tI, q, nbq) ?? lookD(bI, q) ?? 0;
      const db = lookD(bI, q), dt = lookD(tI, q);
      return (db ?? dt ?? 0) + ((dt ?? db ?? 0) - (db ?? dt ?? 0)) * q[2];
    });
    for (const pa of P.patches) {
      let disk;
      if (pa.kind === 'cup' || pa.kind === 'cap') {
        const tb = pa.kind === 'cup' ? 1 : 0;
        const ring = pa.ring.map(p => W4(p, tb, lookD(tb ? tI : bI, p) ?? 0));
        const zf = pa.kind === 'cup' ? (r => z0 + (pa.text + (1 - pa.text) * r * r) * H) : (r => z0 + pa.text * (1 - r * r) * H);
        disk = harmonicDisk(ring, 9, zf);
      } else {
        const D = loopD(pa.loop);
        disk = harmonicDisk(pa.loop.map((q, i) => W4(q, q[2], D[i])), 10);
      }
      pushTris(pa.node, disk.tris.map(t => [disk.verts[t[0]], disk.verts[t[1]], disk.verts[t[2]]]));
      uf.find(pa.node);
    }
    for (const [a, b] of P.unions) uf.union(a, b);
    for (const s of P.seams) seams.push(s.map(q => W4(q, q[2], seamD.get(q) ?? 0)));
    for (const q of P.sing) sing.push(W4(q, q[2], 0));
  });

  // ---- facets: weld, orient, measure
  const groups = new Map();
  for (const node of nodeTris.keys()) {
    const r = uf.find(node);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(node);
  }
  // mesh edges along bindings: a facet never continues across one
  const seamPairs = new Set();
  for (const sm of seams) for (let i = 0; i < sm.length - 1; i++) {
    const a = key4(sm[i]), b = key4(sm[i + 1]);
    seamPairs.add(a + '|' + b); seamPairs.add(b + '|' + a);
  }
  const facets = [];
  let fi = 0;
  for (const [root, nodes] of groups) {
    const tris = [];
    for (const n of nodes) for (const t of nodeTris.get(n)) tris.push(t);
    const mesh = weldMesh(tris, false, seamPairs);
    const lab = labelOf[root] ?? labelOf[nodes.find(n => labelOf[n] != null)] ?? 1;
    facets.push({ id: fi++, root, nodes, label: normLabel(lab).lab, ...mesh });
  }
  facets.sort((a, b) => (a.minZ - b.minZ) || (a.label - b.label));
  facets.forEach((f, i) => { f.id = i; });
  const facetOf = new Map();
  for (const f of facets) for (const n of f.nodes) facetOf.set(n, f.id);
  const facetOfEdge = id => {
    if (facetOf.has(id)) return facetOf.get(id);
    const r = uf.find(id);
    const f = facets.find(F => F.root === r);
    return f ? f.id : -1;
  };

  const all = weldMesh(facets.flatMap(f => f.triList), true);
  const seamInfo = seamComponents(seams);
  const knotted = allWebs.some(W => Object.values(W.verts).some(v => v.cr));
  return {
    H, slabs: slabInfo, complete, facets, facetOfEdge, seams, sing, doubles, knotted,
    chi: all.chi, seamInfo, totalH: slabs.length * H,
    frameZ: frames.map((_, k) => k * H).concat(complete ? [slabs.length * H] : []),
  };
}

const key4 = p => Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5) + ',' + Math.round((p[3] || 0) * 1e5);

// Weld triangles by position.  For a single facet the abstract surface is
// glued only along edges that are not bindings (two sheets of one facet may
// meet along a binding without the facet passing through it), so its χ,
// boundary and orientability are computed on that glued surface.
function weldMesh(tris, statsOnly = false, seamPairs = null) {
  const idx = new Map(), pos = [], keys = [], T = [];
  const id = p => { const k = key4(p); let i = idx.get(k); if (i === undefined) { i = pos.length; idx.set(k, i); pos.push(p); keys.push(k); } return i; };
  for (const t of tris) {
    const a = id(t[0]), b = id(t[1]), c = id(t[2]);
    if (a === b || b === c || a === c) continue;
    T.push([a, b, c]);
  }
  const ekey = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const edges = new Map();
  T.forEach((t, ti) => { for (let s = 0; s < 3; s++) { const k = ekey(t[s], t[(s + 1) % 3]); let L = edges.get(k); if (!L) edges.set(k, L = []); L.push(ti); } });
  const F = T.length;
  if (statsOnly) return { chi: pos.length - edges.size + F };
  const isSeam = k => seamPairs && seamPairs.has(keys[Math.floor(k / 4194304)] + '|' + keys[k % 4194304]);
  const glued = k => edges.get(k).length === 2 && !isSeam(k);
  // corners (triangle, slot) are the same surface vertex when joined by glued edges
  const cp = new Int32Array(3 * F).map((_, i) => i);
  const cf = x => { while (cp[x] !== x) { cp[x] = cp[cp[x]]; x = cp[x]; } return x; };
  const cu = (x, y) => { x = cf(x); y = cf(y); if (x !== y) cp[x] = y; };
  for (const [k, L] of edges) {
    if (!glued(k)) continue;
    const a = Math.floor(k / 4194304), b = k % 4194304, [t1, t2] = L;
    cu(3 * t1 + T[t1].indexOf(a), 3 * t2 + T[t2].indexOf(a));
    cu(3 * t1 + T[t1].indexOf(b), 3 * t2 + T[t2].indexOf(b));
  }
  const vclass = new Set();
  for (let i = 0; i < 3 * F; i++) vclass.add(cf(i));
  let E = 0;
  const bpar = new Map();
  const bf = x => { while (bpar.get(x) !== x) { bpar.set(x, bpar.get(bpar.get(x))); x = bpar.get(x); } return x; };
  const badd = (x, y) => { if (!bpar.has(x)) bpar.set(x, x); if (!bpar.has(y)) bpar.set(y, y); const p = bf(x), q = bf(y); if (p !== q) bpar.set(p, q); };
  for (const [k, L] of edges) {
    if (glued(k)) { E++; continue; }
    const a = Math.floor(k / 4194304), b = k % 4194304;
    for (const t of L) { E++; badd(cf(3 * t + T[t].indexOf(a)), cf(3 * t + T[t].indexOf(b))); }
  }
  const chi = vclass.size - E + F;
  const roots = new Set(); for (const v of bpar.keys()) roots.add(bf(v));
  const b = roots.size;
  // consistent orientation by flood fill across glued edges
  const flip = new Int8Array(F), seen = new Uint8Array(F);
  let orientable = true;
  for (let s = 0; s < F; s++) {
    if (seen[s]) continue;
    seen[s] = 1;
    const stack = [s];
    while (stack.length) {
      const t = stack.pop(), tv = T[t];
      for (let e = 0; e < 3; e++) {
        const a = tv[e], c = tv[(e + 1) % 3];
        const k = ekey(a, c);
        if (!glued(k)) continue;
        const L = edges.get(k);
        const u = L[0] === t ? L[1] : L[0];
        const uv = T[u];
        const dirT = flip[t] ? -1 : 1;
        const ka = uv.indexOf(a), kc = uv.indexOf(c);
        const dirU = ((kc - ka + 3) % 3 === 1) ? 1 : -1;
        const want = -dirT;
        if (!seen[u]) { seen[u] = 1; flip[u] = (dirU === want) ? 0 : 1; stack.push(u); }
        else if ((flip[u] ? -dirU : dirU) !== want) orientable = false;
      }
    }
  }
  const V = pos.length;
  const P = new Float32Array(V * 3), N = new Float32Array(V * 3), Dp = new Float32Array(V), I = new Uint32Array(F * 3);
  let minZ = Infinity;
  pos.forEach((p, i) => { P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; Dp[i] = p[3] || 0; if (p[1] < minZ) minZ = p[1]; });
  T.forEach((t, i) => {
    const [a, b2, c] = flip[i] ? [t[0], t[2], t[1]] : t;
    I[3 * i] = a; I[3 * i + 1] = b2; I[3 * i + 2] = c;
    const ux = pos[b2][0] - pos[a][0], uy = pos[b2][1] - pos[a][1], uz = pos[b2][2] - pos[a][2];
    const vx = pos[c][0] - pos[a][0], vy = pos[c][1] - pos[a][1], vz = pos[c][2] - pos[a][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b2, c]) { N[3 * q] += nx; N[3 * q + 1] += ny; N[3 * q + 2] += nz; }
  });
  for (let i = 0; i < V; i++) {
    const l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1;
    N[3 * i] /= l; N[3 * i + 1] /= l; N[3 * i + 2] /= l;
  }
  const genus = orientable ? (2 - chi - b) / 2 : null;
  return { positions: P, normals: N, depth: Dp, indices: I, chi, b, genus, orientable, minZ, triList: tris, nV: V };
}

function seamComponents(seams) {
  const idx = new Map(), deg = [], par = [];
  const id = p => { const k = key4(p); let i = idx.get(k); if (i === undefined) { i = deg.length; idx.set(k, i); deg.push(0); par.push(i); } return i; };
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const seen = new Set();
  for (const s of seams) for (let i = 0; i < s.length - 1; i++) {
    const a = id(s[i]), b = id(s[i + 1]);
    if (a === b) continue;
    const k = a < b ? a + ',' + b : b + ',' + a;
    if (seen.has(k)) continue;
    seen.add(k);
    deg[a]++; deg[b]++;
    const x = find(a), y = find(b); if (x !== y) par[x] = y;
  }
  const comps = new Map();
  for (let i = 0; i < deg.length; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, { odd: 0, n: 0, branch: 0 });
    const c = comps.get(r); c.n++;
    if (deg[i] === 1) c.odd++;
    if (deg[i] > 2) c.branch++;
  }
  let circles = 0, arcs = 0, graphs = 0;
  for (const c of comps.values()) { if (c.branch) graphs++; else if (c.odd) arcs++; else circles++; }
  return { circles, arcs, graphs };
}

// ------------------------------------------------------------------- slicing

// Level set of the foam at world height h: segments in web coordinates, each
// endpoint [x, y, depth], and the bindings' points (the web's vertices).
export function sliceFoam(F, h) {
  const out = [];
  for (const f of F.facets) {
    const P = f.positions, Dp = f.depth, I = f.indices, segs = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ya = P[3 * a + 1] - h, yb = P[3 * b + 1] - h, yc = P[3 * c + 1] - h;
      if ((ya > 0 && yb > 0 && yc > 0) || (ya <= 0 && yb <= 0 && yc <= 0)) continue;
      const pts = [];
      const cut = (i, j, yi, yj) => {
        if ((yi > 0) === (yj > 0)) return;
        const s = yi / (yi - yj);
        pts.push([P[3 * i] + (P[3 * j] - P[3 * i]) * s, -(P[3 * i + 2] + (P[3 * j + 2] - P[3 * i + 2]) * s), Dp[i] + (Dp[j] - Dp[i]) * s]);
      };
      cut(a, b, ya, yb); cut(b, c, yb, yc); cut(c, a, yc, ya);
      if (pts.length === 2) segs.push(pts);
    }
    if (segs.length) out.push({ facet: f.id, label: f.label, segs });
  }
  const verts = [];
  for (const s of F.seams) for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if ((a[1] - h) * (b[1] - h) < 0 || (a[1] === h && b[1] !== h)) {
      const t = (h - a[1]) / ((b[1] - a[1]) || 1);
      verts.push([a[0] + (b[0] - a[0]) * t, -(a[2] + (b[2] - a[2]) * t), (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t]);
    }
  }
  return { facets: out, verts };
}

// chain slice segments into polylines (consecutive segments share endpoints)
export function chainSegments(segs) {
  const key = p => Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6) + ',' + Math.round(p[2] * 1e6);
  const adj = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); let L = adj.get(k); if (!L) adj.set(k, L = []); L.push([i, e]); } });
  const used = new Uint8Array(segs.length), lines = [];
  const walk = (i, e, line) => {
    for (;;) {
      used[i] = 1;
      const q = segs[i][1 - e];
      line.push(q);
      const L = adj.get(key(q)).filter(([j]) => !used[j]);
      if (!L.length) return;
      [i, e] = L[0];
      e = key(segs[i][0]) === key(q) ? 0 : 1;
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    // extend backwards first by starting from an end if possible
    const line = [segs[i][0]];
    walk(i, 0, line);
    // try to extend at the front
    const front = [];
    let q = segs[i][0];
    for (;;) {
      const L = adj.get(key(q)).filter(([j]) => !used[j]);
      if (!L.length) break;
      const [j] = L[0];
      used[j] = 1;
      const s = segs[j], e = key(s[0]) === key(q) ? 0 : 1;
      q = s[1 - e];
      front.push(q);
    }
    lines.push(front.reverse().concat(line));
  }
  return lines;
}
