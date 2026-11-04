// 2D web canvas: draws webs, frames and slices, and turns pointer gestures
// into web edits (W0 / W1 tabs) or foam moves (movie tab).
import { S, SP, labelColor, normLabel } from './config.js';
import * as G from './geom.js';
import { incid, vpos, isCircleEdge, nearestEdge, nearestVertex, clearance, rot } from './web.js';
import { chainSegments } from './foam.js';

// ------------------------------------------------------------------ drawing

export function viewT(w, h, pad = 0.04) {
  const s = (Math.min(w, h) / 2) * (1 - pad) / 1.04;
  return { s, cx: w / 2, cy: h / 2 };
}
const toS = (T, p) => [T.cx + p[0] * T.s, T.cy - p[1] * T.s];

function pathPts(ctx, T, pts) {
  ctx.beginPath();
  const a = toS(T, pts[0]);
  ctx.moveTo(a[0], a[1]);
  for (let i = 1; i < pts.length; i++) { const b = toS(T, pts[i]); ctx.lineTo(b[0], b[1]); }
}

// the drawn part of an edge: under-strands stop short of their crossings
function drawnPts(e, gap) {
  const o = e.ov;
  if (!o || (o[0] >= 0 && o[1] >= 0)) return e.pts;
  const c = G.cumLen(e.pts), L = c[c.length - 1];
  const s0 = o[0] < 0 ? gap : 0, s1 = o[1] < 0 ? L - gap : L;
  if (s1 - s0 < L * 0.1) return [];
  const out = [G.pointAtLen(e.pts, c, s0)];
  for (let i = 1; i < e.pts.length - 1; i++) if (c[i] > s0 && c[i] < s1) out.push(e.pts[i]);
  out.push(G.pointAtLen(e.pts, c, s1));
  return out;
}

export function edgeWidth(label, thin) {
  const k = normLabel(label).lab;
  return thin ? 0.8 + 0.6 * k : 1.5 + 1.2 * k;
}

function arrow(ctx, T, pts, size, color) {
  const c = G.cumLen(pts), L = c[c.length - 1];
  if (L * T.s < 18) return;
  const m = G.pointAtLen(pts, c, L * 0.5), m2 = G.pointAtLen(pts, c, Math.min(L, L * 0.5 + 0.01));
  const m1 = G.pointAtLen(pts, c, Math.max(0, L * 0.5 - 0.01));
  const d = G.unit(G.sub(m2, m1));
  const p = toS(T, m), dx = d[0], dy = -d[1];
  ctx.beginPath();
  ctx.moveTo(p[0] + dx * size, p[1] + dy * size);
  ctx.lineTo(p[0] - dx * size * 0.8 - dy * size * 0.75, p[1] - dy * size * 0.8 + dx * size * 0.75);
  ctx.lineTo(p[0] - dx * size * 0.35, p[1] - dy * size * 0.35);
  ctx.lineTo(p[0] - dx * size * 0.8 + dy * size * 0.75, p[1] - dy * size * 0.8 - dx * size * 0.75);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawDisk(ctx, T, o = {}) {
  ctx.beginPath();
  ctx.arc(T.cx, T.cy, T.s, 0, 2 * Math.PI);
  ctx.fillStyle = o.fill || 'rgba(129, 140, 248, 0.045)';
  ctx.fill();
  ctx.lineWidth = o.thin ? 1 : 1.4;
  ctx.strokeStyle = o.stroke || 'rgba(165, 180, 252, 0.32)';
  ctx.stroke();
}

// o: thin, alpha, arrows, labels, verts ('all'|'real'|'none'), hoverE, hoverV,
//    bad (Set of vertex ids), badE (Set), hi (Set of edge ids to glow), color override, dash
export function drawWeb(ctx, W, T, o = {}) {
  const inc = incid(W);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.dash) ctx.setLineDash(o.dash);
  const gap = (o.thin ? 3.2 : 8) / T.s;
  for (const id in W.edges) {
    const e = W.edges[id];
    const col = o.color || labelColor(normLabel(e.label).lab);
    const w = edgeWidth(e.label, o.thin);
    const pts = drawnPts(e, gap);
    if (pts.length < 2) continue;
    if (o.hi && o.hi.has(id)) { pathPts(ctx, T, pts); ctx.strokeStyle = o.hiColor || 'rgba(255,255,255,0.55)'; ctx.lineWidth = w + 7; ctx.stroke(); }
    if (o.badE && o.badE.has(id)) { pathPts(ctx, T, pts); ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)'; ctx.lineWidth = w + 6; ctx.stroke(); }
    if (id === o.hoverE) { pathPts(ctx, T, pts); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = w + 8; ctx.stroke(); }
    if (!o.thin) { pathPts(ctx, T, pts); ctx.strokeStyle = 'rgba(5, 7, 15, 0.85)'; ctx.lineWidth = w + 2.5; ctx.stroke(); }
    pathPts(ctx, T, pts);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  ctx.setLineDash([]);
  if (o.arrows !== false) {
    for (const id in W.edges) {
      const e = W.edges[id];
      arrow(ctx, T, e.pts, o.thin ? 3.2 : 6 + normLabel(e.label).lab, o.color || labelColor(normLabel(e.label).lab));
    }
  }
  if (o.labels !== false && !o.thin) {
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const id in W.edges) {
      const e = W.edges[id];
      if (e.label === 1 && S.N <= 3 && S.mode === 'sl') continue;
      const c = G.cumLen(e.pts), L = c[c.length - 1];
      const m = G.pointAtLen(e.pts, c, L * 0.5), n = G.perp(G.unit(G.sub(G.pointAtLen(e.pts, c, L * 0.5 + 0.01), G.pointAtLen(e.pts, c, L * 0.5 - 0.01))));
      if (e.ov && (e.ov[0] || e.ov[1]) && L * T.s < 40) continue;
      const p = toS(T, G.add(m, G.mul(n, 14 / T.s)));
      ctx.fillStyle = 'rgba(5, 7, 15, 0.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = labelColor(normLabel(e.label).lab); ctx.fillText(String(e.label), p[0], p[1] + 0.5);
    }
  }
  const vmode = o.verts || 'real';
  if (vmode !== 'none') {
    for (const id in W.verts) {
      const v = W.verts[id], p = toS(T, [v.x, v.y]), d = inc[id] ? inc[id].length : 0;
      const loopV = !v.bd && d === 2 && inc[id][0].e === inc[id][1].e;
      if (loopV && vmode !== 'all') continue;
      if (v.cr) {
        if (vmode === 'all' || id === o.hoverV) { ctx.beginPath(); ctx.arc(p[0], p[1], o.thin ? 2 : 5, 0, 2 * Math.PI); ctx.strokeStyle = id === o.hoverV ? '#22d3ee' : 'rgba(165, 180, 252, 0.45)'; ctx.lineWidth = 1.2; ctx.stroke(); }
        if (o.bad && o.bad.has(id)) { ctx.beginPath(); ctx.arc(p[0], p[1], o.thin ? 4 : 8, 0, 2 * Math.PI); ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2; ctx.stroke(); }
        continue;
      }
      if (!v.bd && d === 2 && vmode !== 'all' && !loopV) { /* bivalent: show small */ }
      if (o.bad && o.bad.has(id)) { ctx.beginPath(); ctx.arc(p[0], p[1], o.thin ? 4 : 8, 0, 2 * Math.PI); ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2; ctx.stroke(); }
      if (id === o.hoverV) { ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill(); }
      ctx.beginPath();
      if (v.bd) {
        ctx.arc(p[0], p[1], o.thin ? 2 : 4.2, 0, 2 * Math.PI);
        ctx.fillStyle = '#a5b4fc'; ctx.fill();
      } else {
        const r = o.thin ? 1.6 : (d === 3 ? 3.6 : 2.6);
        ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
        ctx.fillStyle = d === 3 ? '#eef1f8' : '#9aa5bd'; ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawSlice(ctx, T, slice, o = {}) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // chain the level set into curves; pieces that rise over a crossing are
  // drawn last, with a dark halo, so the strand underneath shows a gap
  const runs = [];
  for (const f of slice.facets) {
    for (const line of chainSegments(f.segs)) {
      let cur = null;
      for (const q of line) {
        const up = (q[2] || 0) > 0.02;
        if (!cur || cur.up !== up) { const r = { up, f, pts: cur ? [cur.pts[cur.pts.length - 1]] : [] }; runs.push(r); cur = r; }
        cur.pts.push(q);
      }
    }
  }
  for (const pass of [false, true]) {
    for (const r of runs) {
      if (r.up !== pass || r.pts.length < 2) continue;
      const w = o.thin ? 1 + 0.5 * r.f.label : 1.5 + 1.2 * r.f.label;
      pathPts(ctx, T, r.pts);
      if (pass) { ctx.strokeStyle = 'rgba(5, 7, 15, 0.95)'; ctx.lineWidth = w + 6; ctx.stroke(); }
      ctx.strokeStyle = labelColor(r.f.label); ctx.lineWidth = w; ctx.stroke();
    }
  }
  for (const v of slice.verts) {
    const p = toS(T, v);
    ctx.beginPath(); ctx.arc(p[0], p[1], o.thin ? 1.6 : 3.4, 0, 2 * Math.PI); ctx.fillStyle = '#e8edf3'; ctx.fill();
  }
  ctx.restore();
}

const samePts = (p, q) => p.length === q.length && p.every((a, i) => G.same(a, q[i]));

// ------------------------------------------------------------------- editor

export class WebEditor {
  constructor(canvas, app) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.app = app;
    this.hover = null; this.drag = null; this.pending = null; this.preview = null; this.mouse = null;
    this.popupOpen = false;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.mouse = null; this.preview = null; this.draw(); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.resize();
  }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.T = viewT(this.w, this.h);
    this.draw();
  }

  toW(e) {
    const r = this.cv.getBoundingClientRect();
    return [(e.clientX - r.left - this.T.cx) / this.T.s, -(e.clientY - r.top - this.T.cy) / this.T.s];
  }

  get ctxInfo() { return this.app.view2d(); }

  hitTest(W, p, o = {}) {
    const tolV = 11 / this.T.s, tolE = 9 / this.T.s;
    const inc = incid(W);
    const v = nearestVertex(W, p, tolV, V => o.loopVerts || V.bd || !(inc[V.id].length === 2 && inc[V.id][0].e === inc[V.id][1].e));
    if (v && !o.noVerts) return { type: 'v', id: v.id, pt: vpos(W, v.id) };
    const e = nearestEdge(W, p, tolE);
    if (e) return { type: 'e', id: e.id, s: e.s, pt: e.pt, seg: e.i, t: e.t };
    const r = G.len(p);
    if (Math.abs(r - 1) < tolE) return { type: 'bd', ang: Math.atan2(p[1], p[0]), pt: [p[0] / r, p[1] / r] };
    if (r < 1) return { type: 'face', pt: p };
    return { type: 'out', pt: p };
  }

  // ------------------------------------------------------------ pointer events
  down(e) {
    if (e.button !== 0) return;
    this.app.closePopup();
    const I = this.ctxInfo;
    if (!I.web || I.readOnly) return;
    const p = this.toW(e);
    this.mouse = p;
    const tool = I.tool;
    if (I.kind === 'web') {
      const h = this.hitTest(I.web, p, { loopVerts: true });
      if (tool === 'draw') this.drag = { kind: 'draw', start: h, path: [p], startPx: [e.clientX, e.clientY] };
      else if (tool === 'move') {
        if (h.type === 'v') this.drag = { kind: 'moveV', id: h.id, started: false };
        else if (h.type === 'e') this.drag = { kind: 'bend', id: h.id, s: h.s, p0: p, started: false };
      } else if (tool === 'circle') {
        if (h.type === 'face') this.drag = { kind: 'circle', c: p, r: 0 };
      } else this.app.webClick(tool, h, e);
    } else if (I.kind === 'frame') {
      if (tool === 'lift') {
        const h = this.hitTest(I.web, p, { noVerts: true });
        if (h.type === 'e') this.drag = { kind: 'lift', e: h.id, s: h.s, p0: h.pt };
      } else if (tool === 'iso') {
        const h = this.hitTest(I.web, p);
        const inc = incid(I.web);
        if (h.type === 'v' && !I.web.verts[h.id].bd) this.drag = { kind: 'isoV', id: h.id, started: false };
        else if (h.type === 'e') {
          if (isCircleEdge(I.web, inc, h.id)) this.drag = { kind: 'isoC', id: h.id, p0: p, started: false };
          else this.drag = { kind: 'isoE', id: h.id, s: h.s, p0: p, started: false };
        }
      } else this.frameClick(I, p, e);
    }
    this.draw();
  }

  move(e) {
    const I = this.ctxInfo;
    const r = this.cv.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!this.drag && !inside) return;
    const p = this.toW(e);
    this.mouse = p;
    if (this.drag) { this.dragMove(I, p, e); return; }
    if (!I.web || this.popupOpen) { this.draw(); return; }
    if (I.kind === 'web') this.hover = this.hitTest(I.web, p, { loopVerts: true });
    else if (I.kind === 'frame') this.framePreview(I, p);
    this.draw();
  }

  dragMove(I, p, e) {
    const d = this.drag;
    if (d.kind === 'draw') {
      const last = d.path[d.path.length - 1];
      if (G.dist(last, p) * this.T.s > 2.5) d.path.push(p);
      this.hover = this.hitTest(I.web, p, { loopVerts: true });
    } else if (d.kind === 'moveV') {
      if (!d.started) { this.app.beginEdit(); d.started = true; }
      this.app.webMoveVertex(d.id, p);
    } else if (d.kind === 'bend') {
      if (!d.started) { this.app.beginEdit(); d.started = true; d.orig = G.copyPts(I.web.edges[d.id].pts); }
      this.app.webSetEdgePts(d.id, G.bump(d.orig, d.s, G.sub(p, d.p0)));
    } else if (d.kind === 'circle') {
      d.r = G.dist(p, d.c);
    } else if (d.kind === 'lift') {
      d.op = { type: 'lift', e: d.e, s: d.s, d: G.sub(p, d.p0), level: e.shiftKey ? -1 : 1 };
      const key = JSON.stringify([d.op.d.map(x => Math.round(x * 300)), d.op.level]);
      if (!this.preview || this.preview.key !== key) this.preview = { key, op: d.op, ...this.app.tryMove(d.op) };
      this.app.hint(this.preview.ok ? `release to slide the strand ${d.op.level > 0 ? 'over' : 'under'} the rest (shift: ${d.op.level > 0 ? 'under' : 'over'})` : this.preview.err, !this.preview.ok);
    } else if (d.kind === 'isoV' || d.kind === 'isoE' || d.kind === 'isoC') {
      const W = I.web;
      if (!d.started) {
        d.started = true;
        d.origV = vpos(W, d.kind === 'isoV' ? d.id : W.edges[d.id].a);
        if (d.kind !== 'isoV') d.orig = G.copyPts(W.edges[d.id].pts);
        this.app.isoBegin();
      }
      if (d.kind === 'isoV') this.app.isoUpdate({ verts: { [d.id]: p } });
      else if (d.kind === 'isoE') this.app.isoUpdate({ edges: { [d.id]: G.bump(d.orig, d.s, G.sub(p, d.p0)) } });
      else {
        const dl = G.sub(p, d.p0);
        this.app.isoUpdate({ verts: { [W.edges[d.id].a]: G.add(d.origV, dl) }, edges: { [d.id]: d.orig.map(q => G.add(q, dl)) } });
      }
    }
    this.draw();
  }

  up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const I = this.ctxInfo;
    const p = this.toW(e);
    if (d.kind === 'draw') {
      const moved = Math.hypot(e.clientX - d.startPx[0], e.clientY - d.startPx[1]);
      if (moved > 6) {
        d.path.push(p);
        this.app.webDraw(d.start, this.hitTest(I.web, p, { loopVerts: true }), d.path);
      } else this.app.webClick('draw', d.start, e);
    } else if (d.kind === 'moveV' || d.kind === 'bend') {
      if (d.started) this.app.endEdit();
    } else if (d.kind === 'circle') {
      this.app.webCircle(d.c, d.r * this.T.s > 6 ? d.r : null);
    } else if (d.kind === 'lift') {
      if (d.op && this.preview && this.preview.ok) this.app.applyMove(d.op);
      else if (this.preview && !this.preview.ok) this.app.flash(this.preview.err, true);
      this.preview = null;
    } else if (d.kind.startsWith('iso')) {
      if (d.started) this.app.isoEnd();
    }
    this.draw();
  }

  // ------------------------------------------------------------ foam tools
  frameOp(I, p, h) {
    const t = I.tool, o = I.opts;
    if (t === 'cup') return (h.type === 'face') ? { type: 'cup', p, label: o.label, ccw: o.ccw } : null;
    if (t === 'tbirth') return (h.type === 'face') ? { type: 'tbirth', p, a: o.ta, b: o.tb } : null;
    if (t === 'r5') {
      // the trivalent vertex nearest the cursor, and the corner the cursor is in
      const W = I.web, inc = incid(W);
      let v = null, bd = 42 / this.T.s;
      for (const id in W.verts) {
        const V = W.verts[id];
        if (V.bd || V.cr || inc[id].length !== 3) continue;
        const d = G.dist(p, [V.x, V.y]);
        if (d < bd) { bd = d; v = id; }
      }
      if (!v) return null;
      const R = rot(W, inc, v), ang = Math.atan2(p[1] - W.verts[v].y, p[0] - W.verts[v].x);
      const tw = 2 * Math.PI;
      for (let k = 0; k < 3; k++) {
        const a0 = R[k].ang, a1 = R[(k + 1) % 3].ang + (k === 2 ? tw : 0);
        let x = ang; while (x < a0) x += tw;
        if (x <= a1) return { type: 'r5', v, a: R[k].e, b: R[(k + 1) % 3].e, over: o.twistOver ? 1 : -1 };
      }
      return null;
    }
    if (h.type !== 'e') return null;
    if (t === 'saddle' || t === 'zip') {
      if (!this.pending) return null;
      return { type: t, e1: this.pending.e, s1: this.pending.s, e2: h.id, s2: h.s };
    }
    if (t === 'dbirth') {
      const lab = I.web.edges[h.id].label;
      const sp = this.app.digonChoices(lab);
      if (!sp.length) return { type: 'dbirth', e: h.id, s: h.s, p: 0, q: 0 };
      return { type: 'dbirth', e: h.id, s: h.s, p: sp[0][0], q: sp[0][1], choices: sp };
    }
    if (['cap', 'unzip', 'ddeath', 'tdeath', 'assoc', 'r1d', 'r5d'].includes(t)) return { type: t, e: h.id };
    if (t === 'r1') {
      const e = I.web.edges[h.id], i = Math.min(e.pts.length - 2, Math.max(0, h.seg));
      const side = G.cross(G.sub(e.pts[i + 1], e.pts[i]), G.sub(p, h.pt)) >= 0 ? 1 : -1;
      return { type: 'r1', e: h.id, s: h.s, side, over: o.kinkOver ? 1 : -1 };
    }
    return null;
  }

  framePreview(I, p) {
    const h = this.hitTest(I.web, p, { noVerts: true });
    this.hover = h;
    if (I.tool === 'lift' && !this.drag) { this.preview = null; this.app.hint(h.type === 'e' ? 'drag this strand: it slides over everything (hold shift to slide it under)' : null); return; }
    if (I.tool === 'dot' || I.tool === 'iso') { this.preview = null; this.app.hint(I.tool === 'dot' && h.type === 'e' ? this.app.dotHint(h.id) : null); return; }
    const op = this.frameOp(I, p, h);
    if (!op) {
      this.preview = null;
      this.app.hint(this.pending ? 'pick a point on the second strand (Esc cancels)' : null);
      return;
    }
    const key = JSON.stringify({ ...op, p: op.p && op.p.map(x => Math.round(x * 200)), s: op.s && Math.round(op.s * 100), s1: op.s1 && Math.round(op.s1 * 100), s2: op.s2 && Math.round(op.s2 * 100), choices: undefined });
    if (!this.preview || this.preview.key !== key) {
      const r = this.app.tryMove({ ...op, choices: undefined });
      this.preview = { key, op, ...r };
    } else this.preview.op = op;
    this.app.hint(this.preview.ok ? `click: ${this.app.moveName(op.type)}` : this.preview.err, !this.preview.ok);
  }

  frameClick(I, p, e) {
    const h = this.hitTest(I.web, p, { noVerts: true });
    const t = I.tool;
    if (t === 'dot') { if (h.type === 'e') this.app.addDot(h.id, h.pt, e.shiftKey || e.altKey ? -1 : 1); return; }
    if ((t === 'saddle' || t === 'zip') && !this.pending) {
      if (h.type === 'e') { this.pending = { e: h.id, s: h.s, pt: h.pt }; this.preview = null; this.app.hint('now pick a point on the other strand'); }
      return;
    }
    const op = this.frameOp(I, p, h);
    if (!op) { if (this.pending && h.type !== 'e') { this.pending = null; this.app.hint(null); } return; }
    if (op.choices && op.choices.length > 1) {
      this.app.openPopup(e.clientX, e.clientY, op.choices.map(([a, b]) => ({
        label: `${this.app.signedLabel(a)}  |  ${this.app.signedLabel(b)}`,
        run: () => this.app.applyMove({ type: 'dbirth', e: op.e, s: op.s, p: a, q: b }),
      })), 'digon labels (left | right)');
      return;
    }
    const ok = this.app.applyMove({ ...op, choices: undefined });
    if (ok) { this.pending = null; this.preview = null; }
  }

  cancel() { this.pending = null; this.preview = null; this.drag = null; this.app.hint(null); this.draw(); }

  // ------------------------------------------------------------------ draw
  draw() {
    const pr = this.cv.parentElement.getBoundingClientRect();
    if (Math.abs(pr.width - this.w) > 0.5 || Math.abs(pr.height - this.h) > 0.5) { this.resize(); return; }
    const ctx = this.ctx, T = this.T, I = this.ctxInfo;
    if (!T) return;
    ctx.clearRect(0, 0, this.w, this.h);
    drawDisk(ctx, T);
    if (!I) return;
    if (I.kind === 'slice') {
      drawSlice(ctx, T, I.slice);
      return;
    }
    const W = I.web;
    if (!W) return;
    if (I.ghost) drawWeb(ctx, I.ghost, T, { alpha: 0.4, arrows: false, labels: false, verts: 'none', dash: [5, 5], color: '#fbbf24' });
    const prevOK = this.preview && this.preview.ok && I.kind === 'frame';
    const hoverE = this.hover && this.hover.type === 'e' ? this.hover.id : null;
    const hoverV = this.hover && this.hover.type === 'v' ? this.hover.id : null;
    drawWeb(ctx, W, T, {
      alpha: prevOK ? 0.4 : 1, verts: I.kind === 'web' ? 'all' : 'real',
      hoverE: I.tool === 'iso' || I.kind === 'web' || I.tool === 'dot' || (this.preview && !this.preview.ok) ? hoverE : (prevOK ? null : hoverE),
      hoverV, bad: I.valid && I.valid.bad, badE: I.valid && I.valid.badE,
      hi: I.hiEdges,
    });
    if (prevOK) {
      const R = this.preview.W;
      const fresh = new Set(Object.keys(R.edges).filter(id => !W.edges[id] || !samePts(W.edges[id].pts, R.edges[id].pts)));
      drawWeb(ctx, R, T, { verts: 'real', hi: fresh, hiColor: 'rgba(34, 211, 238, 0.32)' });
    } else if (this.preview && !this.preview.ok && this.hover && this.hover.type === 'e') {
      const e = W.edges[this.hover.id];
      if (e) { ctx.save(); pathPts(ctx, T, e.pts); ctx.strokeStyle = 'rgba(251, 113, 133, 0.6)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); }
    }
    // pending first point of a two-point move
    if (this.pending && I.kind === 'frame') {
      const a = toS(T, this.pending.pt);
      ctx.beginPath(); ctx.arc(a[0], a[1], 6, 0, 2 * Math.PI); ctx.fillStyle = '#22d3ee'; ctx.fill();
      if (this.mouse) {
        const b = toS(T, this.mouse);
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
      }
    }
    // gesture feedback
    const d = this.drag;
    if (d && d.kind === 'draw' && d.path.length > 1) {
      ctx.save(); ctx.strokeStyle = labelColor(normLabel(I.opts.label).lab); ctx.lineWidth = edgeWidth(I.opts.label); ctx.globalAlpha = 0.8; ctx.lineCap = 'round';
      pathPts(ctx, T, d.path); ctx.stroke(); ctx.restore();
    }
    if (d && d.kind === 'circle') {
      const c = toS(T, d.c);
      ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(4, d.r * T.s), 0, 2 * Math.PI);
      ctx.strokeStyle = labelColor(normLabel(I.opts.label).lab); ctx.lineWidth = edgeWidth(I.opts.label); ctx.stroke();
    }
    if (I.kind === 'web' && !d && this.hover && this.hover.type === 'bd' && (I.tool === 'draw')) {
      const p = toS(T, this.hover.pt);
      ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 2 * Math.PI); ctx.strokeStyle = '#a5b4fc'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (I.kind === 'frame' && !this.drag && this.mouse && (I.tool === 'cup' || I.tool === 'tbirth') && !(this.preview && this.preview.ok)) {
      const c = toS(T, this.mouse);
      ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(251, 113, 133, 0.8)'; ctx.stroke();
    }
  }
}
