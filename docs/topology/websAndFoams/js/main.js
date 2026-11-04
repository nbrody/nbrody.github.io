import { S, setSettings, labelOK, labelColor, normLabel, flowToLabel } from './config.js';
import * as G from './geom.js';
import { validate, incid, vpos, clearance, isCircleEdge, crossingStrands, edgeDepth } from './web.js';
import { applyOp, MOVE_INFO, digonSplits } from './moves.js';
import { replay, buildFoam, sliceFoam, chainSegments } from './foam.js';
import { FoamView } from './view3d.js';
import { WebEditor, drawWeb, drawDisk, viewT } from './editor.js';
import { PRESETS } from './presets.js';

const $ = s => document.querySelector(s);
const LS_KEY = 'websAndFoams.v1';

const WEB_TOOLS = [
  ['draw', 'Draw', 'd', 'Drag from a boundary point, vertex, edge or empty space to draw an edge (it is oriented the way you drag). A closed loop becomes a circle. Click empty space for a lone vertex.'],
  ['move', 'Move', 'm', 'Drag vertices; drag the middle of an edge to bend it. Boundary points slide along the circle (in both webs).'],
  ['circle', 'Circle', 'c', 'Click (or drag out a radius) in a region to add a circle.'],
  ['flip', 'Flip', 'f', 'Click an edge to reverse its orientation.'],
  ['label', 'Label', 'l', 'Click an edge to give it the current label.'],
  ['cross', 'Crossing', 'x', 'Click a crossing to switch which strand passes over. (Drawing across an edge makes a crossing.)'],
  ['erase', 'Erase', 'e', 'Click a vertex or an edge to delete it; a strand goes with its crossings.'],
];
const FOAM_TOOLS = [
  ['iso', 'Isotopy', 'i', 'Drag vertices or edges of this frame: inserts (or extends) an isotopy step, reshaping the foam above.'],
  ['cup', 'Cup', 'c', 'Click in a region: a circle is born (minimum of a facet).'],
  ['cap', 'Cap', 'x', 'Click an empty circle: it dies (maximum of a facet).'],
  ['saddle', 'Saddle', 's', 'Click a point on one strand, then a point on an oppositely oriented strand across the same region.'],
  ['zip', 'Zip', 'z', 'Click two strands across a region: they merge along a new edge, carving a binding minimum.'],
  ['unzip', 'Unzip', 'u', 'Click an edge joining two trivalent vertices whose legs pair up: the H opens into two strands.'],
  ['dbirth', 'Digon +', 'b', 'Click an edge: it sprouts a digon (choose the labels of the two arcs).'],
  ['ddeath', 'Digon −', 'n', 'Click an edge of an empty digon: the digon collapses to an edge.'],
  ['tbirth', 'Theta +', 't', 'Click in a region: a theta web is born.'],
  ['tdeath', 'Theta −', 'y', 'Click an edge of an isolated theta web: it disappears.'],
  ['assoc', 'I ↔ H', 'h', 'Click an edge joining two trivalent vertices: rotate it (associativity, a singular vertex of the foam).'],
  ['dot', 'Dot', 'o', 'Click an edge to put a dot on its facet (shift-click removes one). You can also click facets in the 3D view.'],
  ['lift', 'Slide', 'g', 'Drag a strand to slide it over everything else (hold shift to slide it under): an isotopy in space, covering Reidemeister II, III and IV.'],
  ['r1', 'Kink +', 'k', 'Click an edge to twist it into a small curl (Reidemeister I) on the side of the cursor.'],
  ['r1d', 'Kink −', 'j', 'Click the loop of an empty curl to straighten it (Reidemeister I).'],
  ['r5', 'Twist +', 'v', 'Click in the corner between two legs at a trivalent vertex: the legs trade places, crossing once (Reidemeister V).'],
  ['r5d', 'Twist −', 'w', 'Click an edge of a twist (the little bigon between a vertex and the crossing beside it) to undo it (Reidemeister V).'],
];

let state, R, F;
const ui = {
  tab: 'foam', frame: 0, h: 0, sliceMode: false, toolW: 'draw', toolF: 'saddle',
  label: 1, ccw: true, ta: 1, tb: 1, selFacet: -1, slabH: 0.55, showGhost: true, overNew: true, kinkOver: true, twistOver: true, space: false,
  v0: null, v1: null, hint: null, hintBad: false,
};
const undoStack = [], redoStack = [];

// ------------------------------------------------------------------ state

function loadPreset(i) {
  const P = PRESETS[i].make();
  state = { N: P.N, mode: P.mode, W0: P.W0, W1: P.W1, ops: P.ops || [], dots: P.dots || [], nid: 100, nop: 100 };
  ui.frame = 0; ui.selFacet = -1; ui.sliceMode = false;
  ui.tab = 'foam';
  flash(PRESETS[i].blurb);
}

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (s && s.W0 && s.W1 && Array.isArray(s.ops)) { state = s; state.dots ||= []; return true; }
  } catch (e) { /* ignore */ }
  return false;
}

function pushUndo() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 300) undoStack.shift();
  redoStack.length = 0;
}
function commit(fn) { pushUndo(); if (fn() === 'abort') { undoStack.pop(); return; } save(); recompute(); }
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(state)); state = JSON.parse(undoStack.pop()); save(); recompute(); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(state)); state = JSON.parse(redoStack.pop()); save(); recompute(); }

const newId = p => p + (state.nid++);
const topIndex = () => R.frames.length - 1 + (F && F.complete ? 1 : 0);
const frameWeb = k => (k < R.frames.length ? R.frames[k] : R.top);
const maxLabel = () => (S.mode === 'sl' ? S.N - 1 : S.N);

// ------------------------------------------------------------- recompute

let rafPending = false, fastMode = false;
function scheduleRecompute(fast = true) {
  fastMode = fastMode || fast;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; const f = fastMode; fastMode = false; recompute({ fast: f }); });
}

function recompute(o = {}) {
  setSettings({ N: state.N, mode: state.mode });
  ui.label = Math.min(ui.label, maxLabel());
  ui.v0 = validate(state.W0); ui.v1 = validate(state.W1);
  const t0 = performance.now();
  R = replay(state);
  F = buildFoam(R, { slabH: ui.slabH });
  ui.buildMs = performance.now() - t0;
  ui.frame = Math.max(0, Math.min(ui.frame, topIndex()));
  if (!ui.sliceMode) ui.h = F.frameZ[ui.frame] ?? 0;
  if (ui.selFacet >= F.facets.length) ui.selFacet = -1;
  view.setFoam(F, { dots: dotPositions(), boundary: boundaryPts(), ghost: !F.complete && ui.showGhost ? Object.values(R.top.edges).map(e => e.pts) : null, refit: o.refit });
  view.setSelected(ui.selFacet);
  updateSlice();
  renderTabs(); renderTools(); renderTimeline(); renderInfo();
  editor.draw();
}

function boundaryPts() { return Object.values(state.W0.verts).filter(v => v.bd).map(v => [v.x, v.y]); }

function dotPositions() {
  const out = [];
  const perFacet = new Map();
  for (const d of state.dots) {
    const f = F.facetOfEdge(d.eid);
    if (f < 0 || !d.n) continue;
    const fa = F.facets[f];
    const P = fa.positions, nV = P.length / 3;
    let base = d.at;
    if (!base) {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < nV; i++) { cx += P[3 * i]; cy += P[3 * i + 1]; cz += P[3 * i + 2]; }
      base = [cx / nV, cy / nV, cz / nV];
    }
    const order = [];
    for (let i = 0; i < nV; i++) order.push([Math.hypot(P[3 * i] - base[0], P[3 * i + 1] - base[1], P[3 * i + 2] - base[2]), i]);
    order.sort((a, b) => a[0] - b[0]);
    const taken = perFacet.get(f) || [];
    let count = 0;
    for (const [, i] of order) {
      const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
      if (taken.every(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.075)) { taken.push(p); out.push(p); if (++count >= d.n) break; }
    }
    perFacet.set(f, taken);
  }
  return out;
}

function facetDots() {
  const m = new Map();
  for (const d of state.dots) { const f = F.facetOfEdge(d.eid); if (f >= 0) m.set(f, (m.get(f) || 0) + d.n); }
  return m;
}

function updateSlice() {
  const exact = !ui.sliceMode;
  const slice = exact ? null : sliceFoam(F, ui.h);
  ui.slice = slice;
  const curves = exact ? Object.values(frameWeb(ui.frame).edges).map(e => e.pts) : null;
  view.setSlice(ui.h, slice, curves);
  if (ui.space) view.setSpace(spaceWeb(exact, slice));
  const hs = $('#inH');
  hs.max = String(Math.max(0.001, F.totalH));
  hs.value = String(ui.h);
  renderReadout();
  editor.draw();
}

// the web in space at the current height: polylines [x, y, depth] per facet
function spaceWeb(exact, slice) {
  const lines = [], verts = [];
  if (exact) {
    const W = frameWeb(ui.frame), inc = incid(W);
    for (const id in W.edges) {
      const e = W.edges[id], D = edgeDepth(e);
      lines.push({ facet: F.facetOfEdge(id), label: normLabel(e.label).lab, pts: e.pts.map((p, i) => [p[0], p[1], D[i]]) });
    }
    for (const v in W.verts) if (!W.verts[v].bd && !W.verts[v].cr && inc[v].length === 3) verts.push([W.verts[v].x, W.verts[v].y, 0]);
  } else {
    for (const f of slice.facets) for (const pts of chainSegments(f.segs)) lines.push({ facet: f.facet, label: f.label, pts });
    for (const v of slice.verts) verts.push(v);
  }
  return { lines, verts, boundary: boundaryPts() };
}

function selectFrame(k) {
  ui.frame = Math.max(0, Math.min(k, topIndex()));
  ui.sliceMode = false;
  ui.h = F.frameZ[ui.frame] ?? 0;
  if (ui.tab !== 'foam') ui.tab = 'foam';
  editor.pending = null; editor.preview = null;
  updateSlice(); renderTabs(); renderTools(); renderTimeline();
}

// ------------------------------------------------------------ 2D context

const app = {
  view2d() {
    if (!state) return null;
    if (ui.tab === 'W0' || ui.tab === 'W1') {
      return { kind: 'web', web: state[ui.tab], tool: ui.toolW, opts: ui, valid: ui.tab === 'W0' ? ui.v0 : ui.v1 };
    }
    if (ui.sliceMode) return { kind: 'slice', slice: ui.slice || sliceFoam(F, ui.h) };
    const k = ui.frame;
    const isTop = k > R.frames.length - 1;
    return {
      kind: 'frame', web: frameWeb(k), tool: ui.toolF, opts: ui, readOnly: isTop,
      valid: isTop ? ui.v1 : R.valid[k],
      ghost: !F.complete && k === R.frames.length - 1 && ui.showGhost ? R.top : null,
    };
  },
  hint(msg, bad = false) {
    if (ui.hint === msg && ui.hintBad === bad) return;
    ui.hint = msg; ui.hintBad = bad;
    const el = $('#hint');
    el.textContent = msg || '';
    el.classList.toggle('bad', !!bad);
    el.classList.toggle('show', !!msg);
  },
  moveName: t => MOVE_INFO[t] ? MOVE_INFO[t].name : t,
  signedLabel(x) { const L = flowToLabel(x); return L ? `${L.label}${L.flip ? ' ←' : ' →'}` : '0'; },
  digonChoices: lab => digonSplits(lab),
  dotHint(eid) {
    const f = F.facetOfEdge(eid);
    return f >= 0 ? `facet #${f} (label ${F.facets[f].label}, ${facetDots().get(f) || 0} dots): click to add a dot, shift-click to remove` : null;
  },

  // ---- web editing (W0 / W1)
  beginEdit() { pushUndo(); },
  endEdit() { save(); recompute(); },
  webMoveVertex(id, p) {
    const W = state[ui.tab], v = W.verts[id];
    if (v.bd) {
      const a = Math.atan2(p[1], p[0]), q = [Math.cos(a), Math.sin(a)];
      for (const X of [state.W0, state.W1]) if (X.verts[id]) moveVertexIn(X, id, q);
    } else {
      const r = G.len(p), q = r > 0.97 ? G.mul(p, 0.97 / r) : p;
      moveVertexIn(W, id, q);
    }
    scheduleRecompute();
  },
  webSetEdgePts(id, pts) {
    const W = state[ui.tab], e = W.edges[id];
    pts[0] = vpos(W, e.a); pts[pts.length - 1] = vpos(W, e.b);
    e.pts = pts;
    scheduleRecompute();
  },
  webDraw(start, end, path) {
    commit(() => {
      const W = state[ui.tab];
      const a = resolveAnchor(W, start, path[0]);
      const endPt = path[path.length - 1];
      const ee = editor.hitTest(W, endPt, { loopVerts: true });
      const b = resolveAnchor(W, ee, endPt);
      let pts = [vpos(W, a)];
      for (const p of path.slice(1, -1)) if (G.dist(p, pts[pts.length - 1]) > 0.012) pts.push(p);
      pts.push(vpos(W, b));
      if (a === b && pts.length < 6) { flash('That loop is too small.', true); return 'abort'; }
      if (W.verts[a].cr || W.verts[b].cr) { flash('A crossing already has its four ends.', true); return 'abort'; }
      if (pts.length > 3) pts = G.smooth(pts, 3);
      pts = G.resample(pts);
      pts[0] = vpos(W, a); pts[pts.length - 1] = vpos(W, b);
      if (G.selfCrosses(pts)) { flash('An edge cannot cross itself: draw a curl with Kink + in the movie instead.', true); return 'abort'; }
      // crossing existing edges makes crossings, the new strand passing over (or under)
      const hits = [];
      for (const id in W.edges) for (const X of G.intersections(pts, W.edges[id].pts)) hits.push({ id, ...X, u0: X.i + X.t });
      hits.sort((p, q) => p.u0 - q.u0);
      for (const h of hits) for (const v in W.verts) {
        if (v === a || v === b) continue;
        if (G.dist(h.pt, vpos(W, v)) < 0.025) { flash('Cross edges away from their vertices.', true); return 'abort'; }
      }
      for (let k = 1; k < hits.length; k++) if (G.dist(hits[k].pt, hits[k - 1].pt) < 0.025) { flash('Those crossings are too close together.', true); return 'abort'; }
      const o = ui.overNew ? 1 : -1;
      const cids = hits.map(h => {
        const c = newId('x');
        W.verts[c] = { id: c, x: h.pt[0], y: h.pt[1], cr: true };
        splitForCrossing(W, edgeThroughPt(W, h.pt), h.pt, c, -o);
        return c;
      });
      let P = pts;
      for (let k = hits.length - 1; k >= 0; k--) P = G.insertOnSegment(P, hits[k].i, hits[k].pt).pts;
      const cut = [0];
      let cur = 0;
      for (const h of hits) { while (!G.same(P[cur], h.pt, 1e-12)) cur++; cut.push(cur); }
      cut.push(P.length - 1);
      const vs = [a, ...cids, b];
      for (let k = 0; k < vs.length - 1; k++) {
        const id = newId('e');
        const e = { id, a: vs[k], b: vs[k + 1], label: ui.label, pts: P.slice(cut[k], cut[k + 1] + 1) };
        const ov = [k > 0 ? o : 0, k < vs.length - 2 ? o : 0];
        if (ov[0] || ov[1]) e.ov = ov;
        W.edges[id] = e;
      }
      if (hits.length) flash(`${hits.length} crossing${hits.length > 1 ? 's' : ''}, the new strand ${o > 0 ? 'over' : 'under'} (the Crossing tool switches them).`);
    });
  },
  webCircle(c, r) {
    const W = state[ui.tab];
    const room = clearance(W, c);
    const rr = r ? Math.min(r, 0.98 * room) : Math.min(0.16, 0.6 * room);
    if (rr < 0.02) { flash('Not enough room for a circle here.', true); return; }
    commit(() => {
      const pts = G.circlePts(c, rr, ui.ccw);
      const q = newId('q'), id = newId('e');
      W.verts[q] = { id: q, x: pts[0][0], y: pts[0][1] };
      W.edges[id] = { id, a: q, b: q, label: ui.label, pts };
    });
  },
  webClick(tool, h) {
    const W = state[ui.tab];
    if (tool === 'erase') {
      if (h.type === 'v') commit(() => deleteVertex(h.id));
      else if (h.type === 'e') commit(() => deleteEdge(W, h.id));
    } else if (tool === 'flip' && h.type === 'e') commit(() => flipRaw(W.edges[h.id]));
    else if (tool === 'cross') {
      const v = h.type === 'v' ? h.id : null;
      if (v && W.verts[v].cr) app.webToggleCrossing(v);
      else flash('Click on a crossing.', true);
    }
    else if (tool === 'label' && h.type === 'e') commit(() => { W.edges[h.id].label = ui.label; });
    else if (tool === 'draw') {
      if (h.type === 'face') commit(() => { const id = newId('v'); W.verts[id] = { id, x: h.pt[0], y: h.pt[1] }; });
      else if (h.type === 'bd') commit(() => addBoundary(h.ang));
    }
  },

  // ---- foam moves
  tryMove(op) {
    const k = ui.frame;
    if (k > R.frames.length - 1) return { ok: false, err: 'This is the target web W₁: pick a frame of the movie to add moves.' };
    try { const r = applyOp(R.frames[k], { ...op, uid: '~' }); return { ok: true, W: r.W }; }
    catch (err) { return { ok: false, err: err.message || String(err) }; }
  },
  applyMove(op) {
    const t = app.tryMove(op);
    if (!t.ok) { flash(t.err, true); return false; }
    const k = ui.frame;
    commit(() => {
      op.uid = 'o' + (state.nop++);
      state.ops.splice(k, 0, op);
      ui.frame = k + 1; ui.sliceMode = false;
    });
    app.hint(null);
    return true;
  },
  isoBegin() {
    const k = ui.frame;
    if (k > R.frames.length - 1) { flash('W₁ is fixed; edit it on its own tab.', true); editor.drag = null; return; }
    pushUndo();
    if (k >= 1 && state.ops[k - 1] && state.ops[k - 1].type === 'iso') ui.isoOp = state.ops[k - 1];
    else {
      ui.isoOp = { uid: 'o' + (state.nop++), type: 'iso', verts: {}, edges: {} };
      state.ops.splice(k, 0, ui.isoOp);
      ui.frame = k + 1;
    }
  },
  isoUpdate(d) {
    if (!ui.isoOp) return;
    Object.assign(ui.isoOp.verts, d.verts || {});
    for (const id in (d.edges || {})) ui.isoOp.edges[id] = d.edges[id].map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]);
    for (const id in (d.verts || {})) ui.isoOp.verts[id] = [+d.verts[id][0].toFixed(5), +d.verts[id][1].toFixed(5)];
    scheduleRecompute();
  },
  isoEnd() { ui.isoOp = null; save(); recompute(); },
  addDot(eid, pt, sign) {
    const f = F.facetOfEdge(eid);
    if (f < 0) return;
    const at = pt ? [pt[0], F.frameZ[ui.frame] ?? 0, -pt[1]] : null;
    changeDots(f, eid, sign, at);
  },
  openPopup, closePopup, flash: (m, b) => flash(m, b),
  webToggleCrossing(id) {
    const W = state[ui.tab];
    if (!W.verts[id] || !W.verts[id].cr) return;
    commit(() => {
      for (const eid in W.edges) {
        const e = W.edges[eid];
        if (!e.ov) continue;
        if (e.a === id) e.ov[0] = -e.ov[0];
        if (e.b === id) e.ov[1] = -e.ov[1];
      }
    });
  },
};

function changeDots(f, eid, sign, at) {
  commit(() => {
    if (sign > 0) state.dots.push({ eid, n: 1, at });
    else {
      for (let i = state.dots.length - 1; i >= 0; i--) {
        const d = state.dots[i];
        if (F.facetOfEdge(d.eid) === f && d.n > 0) { d.n--; if (!d.n) state.dots.splice(i, 1); return; }
      }
    }
  });
}

function moveVertexIn(W, id, q) {
  const v = W.verts[id];
  v.x = q[0]; v.y = q[1];
  for (const eid in W.edges) {
    const e = W.edges[eid];
    if (e.a === id) e.pts = G.deformEnd(e.pts, true, q);
    if (e.b === id) e.pts = G.deformEnd(e.pts, false, q);
    if (e.a === id) e.pts[0] = q.slice();
    if (e.b === id) e.pts[e.pts.length - 1] = q.slice();
  }
}

function addBoundary(ang) {
  const id = newId('b');
  for (const W of [state.W0, state.W1]) W.verts[id] = { id, x: Math.cos(ang), y: Math.sin(ang), bd: true };
  return id;
}

function resolveAnchor(W, h, p) {
  if (h.type === 'v') return h.id;
  if (h.type === 'bd' || h.type === 'out') return addBoundary(Math.atan2(p[1], p[0]));
  if (h.type === 'e') return splitAt(W, h.id, h.pt);
  const id = newId('v');
  W.verts[id] = { id, x: p[0], y: p[1] };
  return id;
}

function splitAt(W, eid, pt) {
  const e = W.edges[eid], c = G.closestOnPoly(e.pts, pt);
  const vid = newId('v');
  W.verts[vid] = { id: vid, x: c.pt[0], y: c.pt[1] };
  const p1 = e.pts.slice(0, c.i + 1), p2 = e.pts.slice(c.i + 1);
  if (G.dist(p1[p1.length - 1], c.pt) > 1e-6) p1.push(c.pt.slice()); else p1[p1.length - 1] = c.pt.slice();
  if (!p2.length || G.dist(p2[0], c.pt) > 1e-6) p2.unshift(c.pt.slice()); else p2[0] = c.pt.slice();
  const nid = newId('e');
  W.edges[nid] = { id: nid, a: vid, b: e.b, label: e.label, pts: G.resample(p2.length > 1 ? p2 : [c.pt, c.pt]) };
  if (e.ov && e.ov[1]) W.edges[nid].ov = [0, e.ov[1]];
  e.b = vid; e.pts = G.resample(p1.length > 1 ? p1 : [c.pt, c.pt]);
  if (e.ov) { e.ov = [e.ov[0], 0]; if (!e.ov[0]) delete e.ov; }
  return vid;
}

// split an edge exactly at a point of its polyline, at crossing c
function splitForCrossing(W, eid, pt, c, flag) {
  const e = W.edges[eid], cl = G.closestOnPoly(e.pts, pt);
  const { pts, k } = G.insertOnSegment(e.pts, cl.i, pt);
  const nid = newId('e');
  const o = e.ov || [0, 0];
  W.edges[nid] = { id: nid, a: c, b: e.b, label: e.label, pts: pts.slice(k), ov: [flag, o[1]] };
  e.b = c; e.pts = pts.slice(0, k + 1); e.ov = [o[0], flag];
}

function edgeThroughPt(W, pt) {
  let best = null, bd = 1e-7;
  for (const id in W.edges) { const d = G.closestOnPoly(W.edges[id].pts, pt).d; if (d < bd) { bd = d; best = id; } }
  return best;
}

// Deleting an edge takes the whole strand through its crossings; the other
// strands at those crossings close up again.
function deleteEdge(W, id) {
  const chain = new Set([id]), crossed = [];
  const walk = (eid, end) => {
    for (let guard = 0; guard < 1000; guard++) {
      const E = W.edges[eid], v = end ? E.b : E.a;
      if (!W.verts[v] || !W.verts[v].cr) return;
      const st = crossingStrands(W, incid(W), v);
      if (!st) return;
      const s = st.find(t => (t.x.e === eid && t.x.end === end) || (t.y.e === eid && t.y.end === end));
      if (!s) return;
      const m = s.x.e === eid && s.x.end === end ? s.y : s.x;
      crossed.push(v);
      if (chain.has(m.e)) return;
      chain.add(m.e);
      eid = m.e; end = 1 - m.end;
    }
  };
  walk(id, 1); walk(id, 0);
  const ends = [];
  for (const e of chain) { const E = W.edges[e]; ends.push(E.a, E.b); delete W.edges[e]; }
  for (const v of new Set(crossed)) {
    if (!W.verts[v]) continue;
    const inc = incid(W)[v] || [];
    if (inc.length === 2 && inc[0].e !== inc[1].e) {
      let [x, y] = inc;
      if (x.end === 0 && y.end === 1) [x, y] = [y, x];
      const g = W.edges[x.e], h = W.edges[y.e];
      if (x.end === 1 && y.end === 0) {
        const ov = [g.ov ? g.ov[0] : 0, h.ov ? h.ov[1] : 0];
        W.edges[g.id] = { id: g.id, a: g.a, b: h.b, label: g.label, pts: g.pts.concat(h.pts.slice(1)), ...(ov[0] || ov[1] ? { ov } : {}) };
        delete W.edges[h.id];
        delete W.verts[v];
        continue;
      }
    }
    if (!inc.length) { delete W.verts[v]; continue; }
    delete W.verts[v].cr;
    for (const x of inc) { const E = W.edges[x.e]; if (E.ov) { E.ov[x.end] = 0; if (!E.ov[0] && !E.ov[1]) delete E.ov; } }
  }
  const inc = incid(W);
  for (const v of ends) if (W.verts[v] && !W.verts[v].bd && (!inc[v] || !inc[v].length)) delete W.verts[v];
}

function deleteVertex(id) {
  const W0 = state[ui.tab === 'W0' ? 'W0' : 'W1'];
  if (W0.verts[id] && W0.verts[id].cr) {
    // erasing a crossing removes the strand passing over it
    const over = Object.values(W0.edges).find(e => (e.a === id && e.ov && e.ov[0] > 0) || (e.b === id && e.ov && e.ov[1] > 0));
    if (over) deleteEdge(W0, over.id);
    return;
  }
  const webs = W0.verts[id].bd ? [state.W0, state.W1] : [state[ui.tab]];
  for (const W of webs) {
    if (!W.verts[id]) continue;
    for (const eid of Object.keys(W.edges)) { const e = W.edges[eid]; if (e.a === id || e.b === id) deleteEdge(W, eid); }
    delete W.verts[id];
  }
}

function flipRaw(e) { [e.a, e.b] = [e.b, e.a]; e.pts = G.rev(e.pts); if (e.ov) e.ov = [e.ov[1], e.ov[0]]; }

// ------------------------------------------------------------------ popup

function openPopup(x, y, items, title) {
  const el = $('#popup');
  el.innerHTML = (title ? `<div class="ptitle">${title}</div>` : '') + items.map((it, i) => `<button data-i="${i}">${it.label}</button>`).join('');
  el.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  el.style.top = Math.min(y, window.innerHeight - 40 - 32 * items.length) + 'px';
  el.classList.add('show');
  editor.popupOpen = true;
  el.querySelectorAll('button').forEach(b => b.onclick = ev => { ev.stopPropagation(); closePopup(); items[+b.dataset.i].run(); });
}
function closePopup() { $('#popup').classList.remove('show'); if (editor) editor.popupOpen = false; }

let flashT = 0;
function flash(msg, bad = false) {
  const el = $('#msg');
  el.textContent = msg;
  el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(flashT);
  flashT = setTimeout(() => { el.className = ''; }, bad ? 4200 : 5200);
}

// ---------------------------------------------------------------- render UI

const sub = n => String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');

function frameName(k) {
  const nf = R.frames.length;
  if (k === 0) return '<b>F₀ = W₀</b>';
  if (k >= nf) return '<b>W₁</b>';
  return `<b>F${sub(k)}</b> <span class="dim">after ${MOVE_INFO[state.ops[k - 1].type].name}</span>`;
}

function renderTabs() {
  document.querySelectorAll('#web-card .tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  $('#web-card').dataset.tab = ui.tab;
  const tag = $('#frameTag');
  if (ui.tab === 'W0') tag.innerHTML = 'Editing the bottom web <b>W₀</b>';
  else if (ui.tab === 'W1') tag.innerHTML = 'Editing the top web <b>W₁</b>';
  else if (ui.sliceMode) tag.innerHTML = `level set at height <b>${(ui.h / Math.max(F.totalH, 1e-6)).toFixed(3)}</b> <span class="dim">· read-only</span>`;
  else if (ui.frame >= R.frames.length) tag.innerHTML = '<b>W₁</b> <span class="dim">· the target (edit it on its tab)</span>';
  else tag.innerHTML = frameName(ui.frame) + (ui.frame === 0 ? ' <span class="dim">· moves here start the movie</span>' : '');
  renderReadout();
}

function renderReadout() {
  const el = $('#hReadout');
  if (!el || !F) return;
  el.innerHTML = ui.sliceMode ? `height <b>${(ui.h / Math.max(F.totalH, 1e-6)).toFixed(2)}</b>` : frameName(ui.frame).replace(/<span class="dim">after /, '<span class="dim">· ');
}

function renderTools() {
  const web = ui.tab !== 'foam';
  const list = web ? WEB_TOOLS : FOAM_TOOLS;
  const cur = web ? ui.toolW : ui.toolF;
  $('#tools').innerHTML = list.map(([id, name, key, tip]) =>
    `<button data-tool="${id}" class="seg-opt ${id === cur ? 'active' : ''}" title="${tip} [${key}]">${name}</button>`).join('');
  $('#tools').querySelectorAll('button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  const o = [];
  if (web || cur === 'cup') {
    o.push('<span class="olab">label</span>' + Array.from({ length: maxLabel() }, (_, i) => i + 1)
      .map(l => `<button class="lab ${l === ui.label ? 'on' : ''}" data-lab="${l}" style="--c:${labelColor(normLabel(l).lab)}">${l}</button>`).join(''));
  }
  if ((web && cur === 'circle') || (!web && cur === 'cup')) o.push(`<button class="mini-btn orient" title="orientation of new circles">${ui.ccw ? '↺ counterclockwise' : '↻ clockwise'}</button>`);
  if (web && cur === 'draw') o.push(`<button class="mini-btn overnew" title="what a new edge does where it crosses old ones">crosses ${ui.overNew ? 'over' : 'under'}</button>`);
  if (!web && cur === 'r1') o.push(`<button class="mini-btn kinkover" title="the first pass of the curl">first pass ${ui.kinkOver ? 'over' : 'under'}</button>`);
  if (!web && cur === 'r5') o.push(`<button class="mini-btn twistover" title="which leg ends up on top">clockwise leg ${ui.twistOver ? 'over' : 'under'}</button>`);
  if (!web && cur === 'tbirth') {
    const opts = v => Array.from({ length: maxLabel() }, (_, i) => `<option ${i + 1 === v ? 'selected' : ''}>${i + 1}</option>`).join('');
    o.push(`<span class="olab">arcs</span><select id="selTa">${opts(ui.ta)}</select><select id="selTb">${opts(ui.tb)}</select><span class="dim">the middle edge carries their sum</span>`);
  }
  o.push(`<span class="desc">${(list.find(t => t[0] === cur) || [])[3] || ''}</span>`);
  $('#opts').innerHTML = o.join('');
  $('#opts').querySelectorAll('.lab').forEach(b => b.onclick = () => { ui.label = +b.dataset.lab; renderTools(); });
  const ob = $('#opts .orient'); if (ob) ob.onclick = () => { ui.ccw = !ui.ccw; renderTools(); };
  const on = $('#opts .overnew'); if (on) on.onclick = () => { ui.overNew = !ui.overNew; renderTools(); };
  const ko = $('#opts .kinkover'); if (ko) ko.onclick = () => { ui.kinkOver = !ui.kinkOver; renderTools(); };
  const to = $('#opts .twistover'); if (to) to.onclick = () => { ui.twistOver = !ui.twistOver; renderTools(); };
  const ta = $('#selTa'); if (ta) ta.onchange = () => { ui.ta = +ta.value; };
  const tb = $('#selTb'); if (tb) tb.onchange = () => { ui.tb = +tb.value; };
}

function setTool(t) {
  if (ui.tab === 'foam') ui.toolF = t; else ui.toolW = t;
  editor.pending = null; editor.preview = null; app.hint(null);
  renderTools(); editor.draw();
}

function thumb(W, size = 64) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = size * dpr; c.height = size * dpr; c.style.width = size + 'px'; c.style.height = size + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const T = viewT(size, size, 0.06);
  drawDisk(ctx, T, { thin: true });
  if (W) drawWeb(ctx, W, T, { thin: true, labels: false, verts: 'real' });
  return c;
}

function renderTimeline() {
  const el = $('#timeline');
  el.innerHTML = '';
  const nf = R.frames.length;
  const card = (k, title, W, opts = {}) => {
    const d = document.createElement('div');
    d.className = 'fcard' + (opts.on ? ' on' : '') + (opts.cls ? ' ' + opts.cls : '');
    d.appendChild(thumb(W));
    const t = document.createElement('div'); t.className = 'ftxt';
    t.innerHTML = title;
    d.appendChild(t);
    d.onclick = opts.onclick || (() => selectFrame(k));
    return d;
  };
  const chip = (i, op, broken) => {
    const d = document.createElement('div');
    d.className = 'chip' + (broken ? ' broken' : '');
    const info = MOVE_INFO[op.type] || { name: op.type, desc: '' };
    d.innerHTML = `<span class="arr">↑</span><span class="nm" title="${info.desc}">${info.name}</span>` +
      (broken ? `<span class="err" title="${broken}">⚠</span>` : '') +
      `<span class="sp"></span>${i > 0 ? '<button class="sw" title="swap with the move below">⇅</button>' : ''}<button class="rm" title="delete this move">✕</button>`;
    d.querySelector('.rm').onclick = ev => { ev.stopPropagation(); commit(() => { state.ops.splice(i, 1); if (ui.frame > i) ui.frame--; }); };
    const sw = d.querySelector('.sw');
    if (sw) sw.onclick = ev => { ev.stopPropagation(); commit(() => { const a = state.ops[i]; state.ops[i] = state.ops[i - 1]; state.ops[i - 1] = a; }); };
    if (!broken) d.onclick = () => selectFrame(i + 1);
    return d;
  };
  const items = [];
  if (F.complete) {
    items.push(card(nf, `<b>W₁</b><br><span class="ok">reached</span>${ui.v1.ok ? '' : ' · <span class="bad">invalid</span>'}`, R.top, { on: ui.frame === nf && ui.tab === 'foam' && !ui.sliceMode }));
    const d = document.createElement('div'); d.className = 'chip auto'; d.innerHTML = '<span class="arr">↑</span><span class="nm">isotopy onto W₁</span>';
    items.push(d);
  } else {
    items.push(card(-1, '<b>W₁</b><br><span class="warn">not reached yet</span>', R.top, { cls: 'target', onclick: () => setTab('W1') }));
    const d = document.createElement('div'); d.className = 'gap';
    d.textContent = R.error ? 'the movie breaks below' : 'last frame ≇ W₁ — add moves';
    items.push(d);
  }
  if (R.error) for (let i = state.ops.length - 1; i >= R.error.k; i--) items.push(chip(i, state.ops[i], i === R.error.k ? R.error.msg : 'depends on a broken move'));
  for (let k = nf - 1; k >= 0; k--) {
    const title = k === 0
      ? `<b>F₀ = W₀</b><br><span class="dim">bottom web</span>${ui.v0.ok ? '' : ' · <span class="bad">invalid</span>'}`
      : `<b>F${sub(k)}</b>${R.valid[k].ok ? '' : ' · <span class="bad">invalid</span>'}`;
    items.push(card(k, title, R.frames[k], { on: ui.tab === 'foam' && !ui.sliceMode && ui.frame === k }));
    if (k > 0) items.push(chip(k - 1, state.ops[k - 1], null));
  }
  items.forEach(n => el.appendChild(n));
}

function boundaryReport() {
  const sig = W => {
    const inc = incid(W), out = {};
    for (const id in W.verts) {
      if (!W.verts[id].bd) continue;
      const I = inc[id];
      if (I.length !== 1) { out[id] = null; continue; }
      const e = W.edges[I[0].e], f = I[0].end ? e.label : -e.label;
      const L = flowToLabel(f);
      out[id] = L ? (L.flip ? '-' : '+') + L.label : '0';
    }
    return out;
  };
  const a = sig(state.W0), b = sig(state.W1);
  return Object.keys(a).filter(k => a[k] !== b[k]);
}

const probText = v => [...new Set(v.probs.filter(p => !p.warn).map(p => p.msg))].join('; ');

function renderStatus() {
  const el = $('#status-banner'), tx = el.querySelector('.status-banner-text');
  const bmis = boundaryReport();
  let tone, html;
  const facets = `${F.facets.length} facet${F.facets.length === 1 ? '' : 's'} · χ = ${F.chi}`;
  if (!ui.v0.ok || !ui.v1.ok) {
    tone = 'failed';
    html = `<b>${!ui.v0.ok ? 'W₀' : 'W₁'} is not a valid web</b><span class="sub">${probText(!ui.v0.ok ? ui.v0 : ui.v1)}</span>`;
  } else if (R.error) {
    tone = 'failed';
    html = `<b>Move ${R.error.k + 1} (${MOVE_INFO[state.ops[R.error.k].type].name}) no longer applies</b><span class="sub">${R.error.msg}. Delete it or undo the edit below it.</span>`;
  } else if (bmis.length) {
    tone = 'failed';
    html = `<b>W₀ and W₁ disagree at ${bmis.length} boundary point${bmis.length > 1 ? 's' : ''}</b><span class="sub">No foam can join them until the boundary data match.</span>`;
  } else if (F.complete) {
    tone = 'verified';
    html = `<b>Foam W₀ → W₁ complete</b><span class="sub">${facets} · ${state.ops.length} move${state.ops.length === 1 ? '' : 's'}</span>`;
  } else {
    tone = 'warning';
    html = `<b>The movie has not reached W₁</b><span class="sub">Its last frame is not isotopic to W₁ (shown dashed). Add moves there.</span>`;
  }
  el.className = 'status-banner ' + tone + (ui.bannerCollapsed ? ' collapsed' : '');
  tx.innerHTML = html;
}

function renderInfo() {
  renderStatus();
  const el = $('#info');
  const dots = facetDots();
  const closed = !Object.keys(R.frames[0].edges).length && !Object.keys(R.top.edges).length;
  const si = F.seamInfo;
  const bind = [si.circles && `${si.circles} circle${si.circles > 1 ? 's' : ''}`, si.arcs && `${si.arcs} arc${si.arcs > 1 ? 's' : ''}`, si.graphs && `${si.graphs} graph${si.graphs > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'none';
  const probs = [!ui.v0.ok && `W₀: ${probText(ui.v0)}`, !ui.v1.ok && `W₁: ${probText(ui.v1)}`].filter(Boolean);
  const rows = F.facets.map(f => {
    const sw = `<span class="sw" style="background:#${view.colorOf(f).getHexString()};color:#${view.colorOf(f).getHexString()}"></span>`;
    return `<tr data-f="${f.id}" class="${f.id === ui.selFacet ? 'on' : ''}"><td>${sw}${f.id}</td><td>${f.label}</td><td>${f.chi}</td><td>${f.genus == null ? '–' : f.genus}</td><td>${f.b}</td><td>${dots.get(f.id) || ''}</td></tr>`;
  }).join('');
  let sel = '';
  if (ui.selFacet >= 0) {
    const f = F.facets[ui.selFacet];
    const kind = f.b === 0 ? (f.genus === 0 ? 'a sphere' : `a closed surface of genus ${f.genus}`)
      : (f.genus === 0 && f.b === 1 ? 'a disk' : f.genus === 0 && f.b === 2 ? 'an annulus' : `genus ${f.genus}, ${f.b} boundary circles`);
    sel = `<div class="control-group"><div class="selbox">Facet <b>#${f.id}</b> · label ${f.label} · ${kind}</div>
      <div class="control-row"><button id="dotM" class="btn btn-ghost">− dot</button><button id="dotP" class="btn btn-add">+ dot</button><button id="selX" class="btn btn-ghost">Clear</button></div></div>`;
  }
  el.innerHTML = `${probs.length ? `<p class="probs">${probs.join('<br>')}</p>` : ''}
    <div class="stats">
      <div class="stat">Facets<b>${F.facets.length}</b></div>
      <div class="stat">Euler <span class="m">χ</span><b>${F.chi}</b></div>
      <div class="stat">Bindings<b>${bind}</b></div>
      <div class="stat">Singular vertices<b>${F.sing.length}</b></div>
    </div>
    ${closed && F.complete ? '<p class="label-hint">A closed foam (both webs are empty).</p>' : ''}
    ${sel}
    <div class="control-group" style="padding:8px 8px 4px">
    ${F.facets.length ? `<table class="facets"><thead><tr><th>facet</th><th>label</th><th>χ</th><th>g</th><th>∂</th><th>dots</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-message">No facets yet: add moves, or make W₀ and W₁ isotopic.</p>'}
    </div>`;
  el.querySelectorAll('tr[data-f]').forEach(tr => tr.onclick = () => selectFacet(+tr.dataset.f === ui.selFacet ? -1 : +tr.dataset.f));
  const dp = $('#dotP'), dm = $('#dotM'), sx = $('#selX');
  if (dp) dp.onclick = () => changeDots(ui.selFacet, F.facets[ui.selFacet].nodes[0], 1, null);
  if (dm) dm.onclick = () => changeDots(ui.selFacet, F.facets[ui.selFacet].nodes[0], -1, null);
  if (sx) sx.onclick = () => selectFacet(-1);
}

function selectFacet(f) {
  ui.selFacet = f;
  view.setSelected(f);
  renderInfo();
  if (f >= 0) setPanelTab('info');
}

function setTab(t) {
  ui.tab = t;
  editor.pending = null; editor.preview = null; app.hint(null);
  if (t === 'foam') ui.sliceMode = false;
  renderTabs(); renderTools(); renderTimeline(); editor.draw();
}

function setPanelTab(t) {
  document.querySelectorAll('#control-panel .tab-btn[data-ptab]').forEach(b => b.classList.toggle('active', b.dataset.ptab === t));
  document.querySelectorAll('#control-panel .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + t));
}

// keep the 3D picture centred in the gap between the floating cards
// (computed from the target layout, not measured, since the cards animate)
function updateInsets() {
  const pc = $('#control-panel').classList.contains('collapsed'), cc = $('#web-card').classList.contains('collapsed');
  document.body.classList.toggle('panel-collapsed', pc);
  document.body.classList.toggle('card-collapsed', cc);
  if (window.innerWidth <= 900) { view.setInsets(0, 0); return; }
  const left = cc ? 20 + 52 : $('#left-col').getBoundingClientRect().right;
  const right = pc ? 20 + 52 : 20 + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'));
  view.setInsets(left + 10, right + 10);
}

// ------------------------------------------------------------------- setup

const view = new FoamView($('#viz-container'), {
  onPick(f, point, e) {
    if (f >= 0 && ui.tab === 'foam' && ui.toolF === 'dot') {
      changeDots(f, F.facets[f].nodes[0], e.shiftKey || e.altKey ? -1 : 1, point);
      return;
    }
    selectFacet(f === ui.selFacet ? -1 : f);
  },
  onHover(f, e) {
    const tip = $('#facetTip');
    if (f < 0) { tip.classList.remove('show'); return; }
    const fa = F.facets[f], d = facetDots().get(f) || 0;
    tip.innerHTML = `facet #${f} · label ${fa.label} · χ ${fa.chi}${fa.genus != null ? ` · g ${fa.genus}` : ''} · ∂ ${fa.b}${d ? ` · ${d} dot${d > 1 ? 's' : ''}` : ''}`;
    tip.classList.add('show');
    if (e) placeTip(e);
  },
  onHoverMove: e => placeTip(e),
});
function placeTip(e) {
  const tip = $('#facetTip');
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top = (e.clientY + 12) + 'px';
}

const editor = new WebEditor($('#cv2d'), app);

document.querySelectorAll('#web-card .tab-btn[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.querySelectorAll('#control-panel .tab-btn[data-ptab]').forEach(b => b.onclick = () => setPanelTab(b.dataset.ptab));
$('#collapse-btn').onclick = () => { $('#control-panel').classList.toggle('collapsed'); updateInsets(); };
$('#web-collapse').onclick = () => { $('#web-card').classList.toggle('collapsed'); updateInsets(); setTimeout(() => editor.resize(), 470); };
$('#status-banner').onclick = e => {
  const el = $('#status-banner');
  if (e.target.closest('.status-banner-close')) { ui.bannerCollapsed = true; el.classList.add('collapsed'); e.stopPropagation(); return; }
  if (el.classList.contains('collapsed')) { ui.bannerCollapsed = false; el.classList.remove('collapsed'); }
};
window.addEventListener('resize', updateInsets);

$('#inH').addEventListener('input', () => {
  const h = +$('#inH').value;
  ui.h = h;
  const tol = 0.035 * ui.slabH;
  const k = F.frameZ.findIndex(z => Math.abs(z - h) < tol);
  if (k >= 0) { ui.frame = k; ui.sliceMode = false; ui.h = F.frameZ[k]; }
  else ui.sliceMode = true;
  if (ui.tab !== 'foam') ui.tab = 'foam';
  updateSlice(); renderTabs(); renderTools(); renderTimeline();
});

let playT = null;
const playIcon = s => { $('#btPlay .collapse-icon').textContent = s; };
$('#btPlay').onclick = () => {
  if (playT) { cancelAnimationFrame(playT); playT = null; playIcon('▶'); return; }
  const H = F.totalH;
  const h0 = ui.h >= H - 1e-6 ? 0 : ui.h;
  const t0 = performance.now(), speed = ui.slabH / 1.3;
  playIcon('❚❚');
  if (ui.tab !== 'foam') setTab('foam');
  const step = now => {
    const h = Math.min(H, h0 + (now - t0) / 1000 * speed);
    ui.h = h;
    const k = F.frameZ.findIndex(z => Math.abs(z - h) < 1e-9);
    ui.sliceMode = k < 0;
    if (k >= 0) ui.frame = k;
    updateSlice(); renderTabs();
    if (h < H) playT = requestAnimationFrame(step);
    else { playT = null; playIcon('▶'); ui.sliceMode = false; ui.frame = topIndex(); ui.h = F.frameZ[ui.frame]; updateSlice(); renderTabs(); renderTimeline(); }
  };
  playT = requestAnimationFrame(step);
};

document.querySelectorAll('#segView .seg-opt').forEach(b => b.onclick = () => {
  document.querySelectorAll('#segView .seg-opt').forEach(x => x.classList.toggle('active', x === b));
  ui.space = b.dataset.m === 'space';
  view.setMode(ui.space ? 'space' : 'foam');
  updateSlice();
});

const toggle = (id, key, invert = false) => {
  $(id).onclick = () => { const b = $(id); b.classList.toggle('active'); view.setStyle({ [key]: b.classList.contains('active') !== invert }); };
};
toggle('#tgTrans', 'translucent'); toggle('#tgSeams', 'showSeams'); toggle('#tgSlice', 'showSlice'); toggle('#tgCyl', 'showCyl');
document.querySelectorAll('#segColor .seg-opt').forEach(b => b.onclick = () => {
  document.querySelectorAll('#segColor .seg-opt').forEach(x => x.classList.toggle('active', x === b));
  view.setStyle({ colorBy: b.dataset.v }); renderInfo(); renderTimeline();
});
$('#btFit').onclick = () => { view.userMoved = false; view.fit(); };
$('#btTop').onclick = () => view.viewFrom('top');
$('#btSide').onclick = () => view.viewFrom('side');
$('#inSlab').oninput = e => { ui.slabH = +e.target.value; recompute({ refit: true }); };

$('#inN').onchange = e => {
  const n = Math.max(2, Math.min(9, Math.round(+e.target.value || 3)));
  e.target.value = n;
  commit(() => { state.N = n; });
};
document.querySelectorAll('#segMode .seg-opt').forEach(b => b.onclick = () => { commit(() => { state.mode = b.dataset.v; }); syncHeader(); });

// example library
function openModal(id) { $(id).hidden = false; }
function closeModals() { document.querySelectorAll('.example-modal').forEach(m => { m.hidden = true; }); }
document.querySelectorAll('.example-modal').forEach(m => {
  m.querySelector('.example-modal-backdrop').onclick = closeModals;
  m.querySelector('.example-modal-close').onclick = closeModals;
});
$('#btExamples').onclick = () => {
  const grid = $('#exampleGrid');
  if (!grid.childElementCount) {
    PRESETS.forEach((P, i) => {
      const st = P.make();
      setSettings({ N: st.N, mode: st.mode });
      const b = document.createElement('button');
      b.className = 'example-card';
      // closed foams: show the first frame that has something in it
      let W = Object.keys(st.W0.edges).length ? st.W0 : st.W1;
      if (!Object.keys(W.edges).length) {
        try { W = replay({ ...st, dots: [] }).frames.find(f => Object.keys(f.edges).length) || W; } catch (err) { /* keep blank */ }
      }
      b.appendChild(thumb(W, 54));
      const t = document.createElement('div');
      t.innerHTML = `<div class="example-name">${P.name}<span class="ex-badge">${st.mode}${sub(st.N)}</span></div><div class="example-desc">${P.blurb}</div>`;
      b.appendChild(t);
      b.onclick = () => { closeModals(); pushUndo(); loadPreset(i); save(); syncHeader(); recompute({ refit: true }); setPanelTab('movie'); };
      grid.appendChild(b);
    });
    setSettings({ N: state.N, mode: state.mode });
  }
  openModal('#examples');
};
$('#btHelp').onclick = () => openModal('#help');
$('#help-btn').onclick = () => openModal('#help');

$('#btUndo').onclick = undo;
$('#btRedo').onclick = redo;
$('#btExport').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'webs-and-foams.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#btImport').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    if (!s.W0 || !s.W1 || !Array.isArray(s.ops)) throw new Error('not a webs-and-foams file');
    pushUndo(); state = s; state.dots ||= []; state.nid ||= 1000; state.nop ||= 1000;
    save(); syncHeader(); recompute({ refit: true });
  } catch (err) { flash('Import failed: ' + err.message, true); }
  e.target.value = '';
};
$('#btClearMovie').onclick = () => { if (state.ops.length) commit(() => { state.ops = []; state.dots = []; ui.frame = 0; }); };
$('#btGhost').onclick = () => { ui.showGhost = !ui.showGhost; $('#btGhost').classList.toggle('on', ui.showGhost); recompute(); };
$('#btCopy01').onclick = () => commit(() => { copyWeb('W0', 'W1'); });
$('#btCopy10').onclick = () => commit(() => { copyWeb('W1', 'W0'); });
$('#btClearWeb').onclick = () => commit(() => {
  const W = state[ui.tab === 'W1' ? 'W1' : 'W0'];
  W.edges = {};
  for (const id of Object.keys(W.verts)) if (!W.verts[id].bd) delete W.verts[id];
});

function copyWeb(a, b) {
  state[b] = JSON.parse(JSON.stringify(state[a]));
  for (const id in state[a].verts) if (state[a].verts[id].bd) state[b].verts[id] = { ...state[a].verts[id] };
}

function syncHeader() {
  $('#inN').value = state.N;
  document.querySelectorAll('#segMode .seg-opt').forEach(b => b.classList.toggle('active', b.dataset.v === state.mode));
}

window.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (meta) return;
  if (e.key === 'Escape') { editor.cancel(); closePopup(); closeModals(); return; }
  if (e.key === 'ArrowUp' || e.key === ']') { e.preventDefault(); selectFrame(ui.frame + 1); return; }
  if (e.key === 'ArrowDown' || e.key === '[') { e.preventDefault(); selectFrame(ui.frame - 1); return; }
  if (e.key === ' ') { e.preventDefault(); $('#btPlay').click(); return; }
  if (/^[1-9]$/.test(e.key)) {
    const l = +e.key;
    if (l > maxLabel()) return;
    ui.label = l;
    const h = editor.hover;
    if (ui.tab !== 'foam' && h && h.type === 'e') commit(() => { state[ui.tab].edges[h.id].label = l; });
    renderTools();
    return;
  }
  if (ui.tab !== 'foam') {
    const h = editor.hover;
    if ((e.key === 'Delete' || e.key === 'Backspace') && h) {
      if (h.type === 'v') commit(() => deleteVertex(h.id));
      else if (h.type === 'e') commit(() => deleteEdge(state[ui.tab], h.id));
      editor.hover = null;
      return;
    }
    if (e.key === 'r' && h && h.type === 'e') { commit(() => flipRaw(state[ui.tab].edges[h.id])); return; }
  }
  const list = ui.tab === 'foam' ? FOAM_TOOLS : WEB_TOOLS;
  const t = list.find(x => x[2] === e.key.toLowerCase());
  if (t) setTool(t[0]);
});

// -------------------------------------------------------------------- go
if (!load()) loadPreset(PRESETS.findIndex(p => p.name.startsWith('Square')));
syncHeader();
updateInsets();
recompute({ refit: true });
window.wf = { get state() { return state; }, get R() { return R; }, get F() { return F; }, ui, view, recompute, loadPreset: i => { loadPreset(i); recompute({ refit: true }); } };
