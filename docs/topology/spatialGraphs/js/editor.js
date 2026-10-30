// editor.js — draw a spatial graph as a diagram: strands in the plane, and at
// each crossing a choice of which strand passes over.
//
// Draw a stroke from anywhere to anywhere: its ends become vertices, or land on
// existing vertices, or split an existing edge there. A stroke that ends where it
// began is a loop. Click a crossing to flip it. Vertices of degree 2 are drawn
// hollow: they are just points on a strand and disappear in ℝ³.
//
// Crossings are found geometrically every time the diagram changes. A crossing
// remembers which strand is over by that strand's direction at the crossing, and
// is matched to the previous frame's crossings by position, so it survives moves,
// splits and erasures nearby.

const PICK_V = 13, PICK_E = 9, PICK_X = 11;      // CSS px

export class DiagramEditor {
    constructor(canvas, { color = () => '#818cf8', onChange = () => {} } = {}) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this.color = color;
        this.onChange = onChange;
        this.tool = 'draw';
        this.verts = [];        // { id, x, y }
        this.edges = [];        // { id, a, b, pts: [[x,y],…] } (pts include both ends)
        this.cross = [];        // { x, y, e, f, se, sf, ta, tb, overT: [dx,dy] }
        this.nextId = 1;
        this.undoStack = [];
        this.stroke = null;
        this.drag = null;
        this.hover = null;
        this.theme = 'dark';
        this.bindEvents();
        new ResizeObserver(() => this.resize()).observe(canvas);
        this.resize();
    }

    // ------------------------------------------------------------ geometry

    resize() {
        const r = this.cv.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.cv.width = Math.max(1, Math.round(r.width * dpr));
        this.cv.height = Math.max(1, Math.round(r.height * dpr));
        this.w = r.width; this.h = r.height; this.dpr = dpr;
        this.draw();
    }

    /** logical [-1,1]² (y up) ↔ CSS px */
    toPx(p) { const s = 0.5 * Math.min(this.w, this.h) * 0.94; return [this.w / 2 + p[0] * s, this.h / 2 - p[1] * s]; }
    toL(px, py) { const s = 0.5 * Math.min(this.w, this.h) * 0.94; return [(px - this.w / 2) / s, -(py - this.h / 2) / s]; }
    pxPerUnit() { return 0.5 * Math.min(this.w, this.h) * 0.94; }

    vertex(id) { return this.verts.find(v => v.id === id); }
    degree(id) { let d = 0; for (const e of this.edges) { if (e.a === id) d++; if (e.b === id) d++; } return d; }

    /** Recompute crossings, inheriting over/under from the previous ones. */
    recompute(fresh = new Set()) {
        const prev = this.cross;
        const found = [];
        const E = this.edges;
        const cum = E.map(e => { const c = [0]; for (let k = 1; k < e.pts.length; k++) c.push(c[k - 1] + dist(e.pts[k], e.pts[k - 1])); return c; });
        for (let i = 0; i < E.length; i++) for (let j = i; j < E.length; j++) {
            const P = E[i].pts, Q = E[j].pts;
            for (let a = 0; a + 1 < P.length; a++) {
                for (let b = (i === j ? a + 2 : 0); b + 1 < Q.length; b++) {
                    const hit = segInt(P[a], P[a + 1], Q[b], Q[b + 1]);
                    if (!hit) continue;
                    const [t, u] = hit;
                    if (i === j && E[i].a === E[i].b && a === 0 && b === Q.length - 2) continue;
                    const x = P[a][0] + t * (P[a + 1][0] - P[a][0]), y = P[a][1] + t * (P[a + 1][1] - P[a][1]);
                    found.push({
                        x, y, e: E[i].id, f: E[j].id,
                        se: cum[i][a] + t * dist(P[a], P[a + 1]), sf: cum[j][b] + u * dist(Q[b], Q[b + 1]),
                        ta: unit(sub(P[a + 1], P[a])), tb: unit(sub(Q[b + 1], Q[b])),
                    });
                }
            }
        }
        // inherit
        const used = new Set();
        for (const c of found) {
            let best = null, bd = 0.12;
            prev.forEach((p, k) => {
                if (used.has(k)) return;
                const d = Math.hypot(p.x - c.x, p.y - c.y);
                if (d < bd) { bd = d; best = k; }
            });
            if (best !== null) {
                used.add(best);
                const o = prev[best].overT;
                c.aOver = Math.abs(dot2(o, c.ta)) >= Math.abs(dot2(o, c.tb));
            } else {
                // a new crossing: the strand just drawn goes over (for one stroke crossing itself, its later part)
                const ei = this.edges.findIndex(e => e.id === c.e), fi = this.edges.findIndex(e => e.id === c.f);
                if (fresh.has(c.e) !== fresh.has(c.f)) c.aOver = fresh.has(c.e);
                else if (c.e === c.f) c.aOver = c.se > c.sf;
                else c.aOver = ei > fi;
            }
            c.overT = c.aOver ? c.ta : c.tb;
        }
        this.cross = found;
    }

    // ------------------------------------------------------------ editing

    snapshot() {
        this.undoStack.push(JSON.stringify({ v: this.verts, e: this.edges, c: this.cross, n: this.nextId }));
        if (this.undoStack.length > 80) this.undoStack.shift();
    }

    undo() {
        const s = this.undoStack.pop();
        if (!s) return;
        const o = JSON.parse(s);
        this.verts = o.v; this.edges = o.e; this.cross = o.c; this.nextId = o.n;
        this.changed();
    }

    clear() {
        if (!this.edges.length && !this.verts.length) return;
        this.snapshot();
        this.verts = []; this.edges = []; this.cross = [];
        this.changed();
    }

    load(data) {
        this.verts = data.verts.map(v => ({ ...v }));
        this.edges = data.edges.map(e => ({ ...e, pts: e.pts.map(p => p.slice()) }));
        this.nextId = 1 + Math.max(0, ...this.verts.map(v => v.id), ...this.edges.map(e => e.id));
        this.cross = [];
        this.recompute();
        if (data.over) for (const c of this.cross) { c.aOver = data.over(c); c.overT = c.aOver ? c.ta : c.tb; }
        this.changed(false);
    }

    changed(recompute = true, fresh) {
        if (recompute) this.recompute(fresh);
        this.draw();
        this.onChange(this);
    }

    addVertex(p) { const v = { id: this.nextId++, x: p[0], y: p[1] }; this.verts.push(v); return v; }

    /** Split edge `e` at the point nearest p; returns the new vertex. */
    splitEdge(e, p) {
        const { k, t } = nearestOnPoly(e.pts, p);
        const q = lerp(e.pts[k], e.pts[k + 1], t);
        const v = this.addVertex(q);
        const left = [...e.pts.slice(0, k + 1), q], right = [q, ...e.pts.slice(k + 1)];
        const e2 = { id: this.nextId++, a: v.id, b: e.b, pts: right };
        e.b = v.id; e.pts = left;
        this.edges.push(e2);
        return v;
    }

    removeEdge(e) {
        this.edges = this.edges.filter(f => f !== e);
        this.verts = this.verts.filter(v => this.degree(v.id) > 0);
    }

    removeVertex(v) {
        this.edges = this.edges.filter(e => e.a !== v.id && e.b !== v.id);
        this.verts = this.verts.filter(u => u !== v && this.degree(u.id) > 0);
    }

    // ------------------------------------------------------------ picking

    pickVertex(px, py) {
        let best = null, bd = PICK_V;
        for (const v of this.verts) {
            const [x, y] = this.toPx([v.x, v.y]);
            const d = Math.hypot(x - px, y - py);
            if (d < bd) { bd = d; best = v; }
        }
        return best;
    }

    pickEdge(px, py, tol = PICK_E) {
        let best = null, bd = tol;
        const p = this.toL(px, py), s = this.pxPerUnit();
        for (const e of this.edges) {
            const { d } = nearestOnPoly(e.pts, p);
            if (d * s < bd) { bd = d * s; best = e; }
        }
        return best;
    }

    pickCrossing(px, py) {
        let best = null, bd = PICK_X;
        for (const c of this.cross) {
            const [x, y] = this.toPx([c.x, c.y]);
            const d = Math.hypot(x - px, y - py);
            if (d < bd) { bd = d; best = c; }
        }
        return best;
    }

    // ------------------------------------------------------------ events

    bindEvents() {
        const cv = this.cv;
        const pos = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
        cv.addEventListener('pointerdown', ev => {
            if (ev.button !== 0) return;
            cv.setPointerCapture(ev.pointerId);
            const [px, py] = pos(ev);
            this.down = { px, py, moved: false };
            if (this.tool === 'draw') {
                this.stroke = { pts: [this.toL(px, py)], startPx: [px, py] };
            } else if (this.tool === 'move') {
                const v = this.pickVertex(px, py);
                const e = v ? null : this.pickEdge(px, py, 14);
                if (v || e) {
                    this.snapshot();
                    if (v) this.drag = { v, last: this.toL(px, py) };
                    else {
                        const { k, t } = nearestOnPoly(e.pts, this.toL(px, py));
                        const c = [0];
                        for (let i = 1; i < e.pts.length; i++) c.push(c[i - 1] + dist(e.pts[i], e.pts[i - 1]));
                        this.drag = { e, s0: c[k] + t * dist(e.pts[k], e.pts[k + 1]), cum: c, last: this.toL(px, py) };
                    }
                }
            }
            this.draw();
        });
        cv.addEventListener('pointermove', ev => {
            const [px, py] = pos(ev);
            if (this.down && Math.hypot(px - this.down.px, py - this.down.py) > 4) this.down.moved = true;
            if (this.stroke) {
                const p = this.toL(px, py);
                const last = this.stroke.pts[this.stroke.pts.length - 1];
                if (dist(p, last) * this.pxPerUnit() > 3) this.stroke.pts.push(p);
                this.draw();
                return;
            }
            if (this.drag) {
                const p = this.toL(px, py);
                const d = sub(p, this.drag.last);
                this.drag.last = p;
                if (this.drag.v) this.moveVertex(this.drag.v, d);
                else this.moveEdgePoint(this.drag, d);
                this.recompute();
                this.draw();
                return;
            }
            const hv = this.pickCrossing(px, py) ? 'cross' : this.tool === 'erase' ? (this.pickVertex(px, py) || this.pickEdge(px, py)) : null;
            if (hv !== this.hover) { this.hover = hv; cv.style.cursor = hv ? 'pointer' : ''; this.draw(); }
            this.hoverPx = [px, py];
        });
        const end = ev => {
            const [px, py] = pos(ev);
            const click = this.down && !this.down.moved;
            if (this.stroke) {
                const s = this.stroke;
                this.stroke = null;
                if (click) this.click(px, py);
                else this.finishStroke(s, [px, py]);
            } else if (this.drag) {
                this.drag = null;
                this.changed();
            } else if (click) {
                this.click(px, py);
            }
            this.down = null;
            this.draw();
        };
        cv.addEventListener('pointerup', end);
        cv.addEventListener('pointercancel', () => { this.stroke = null; this.drag = null; this.down = null; this.draw(); });
    }

    click(px, py) {
        const c = this.pickCrossing(px, py);
        if (c) {
            this.snapshot();
            c.aOver = !c.aOver;
            c.overT = c.aOver ? c.ta : c.tb;
            this.changed(false);
            return;
        }
        if (this.tool === 'erase') {
            const v = this.pickVertex(px, py);
            if (v) { this.snapshot(); this.removeVertex(v); this.changed(); return; }
            const e = this.pickEdge(px, py);
            if (e) { this.snapshot(); this.removeEdge(e); this.changed(); }
        }
    }

    finishStroke(s, endPx) {
        const scale = this.pxPerUnit();
        let pts = s.pts;
        if (pts.length < 2 || polyLen(pts) * scale < 14) return;
        this.snapshot();
        const resolve = (px, p, avoid) => {
            const v = this.pickVertex(px[0], px[1]);
            if (v) return v;
            const e = this.pickEdge(px[0], px[1]);
            if (e && e !== avoid) return this.splitEdge(e, p);
            return null;
        };
        let A = resolve(s.startPx, pts[0]);
        const closesUp = dist(pts[0], pts[pts.length - 1]) * scale < PICK_V && polyLen(pts) * scale > 60;
        if (!A) A = this.addVertex(pts[0]);
        let B = closesUp ? A : resolve(endPx, pts[pts.length - 1]);
        if (!B) B = this.addVertex(pts[pts.length - 1]);
        // smooth the hand-drawn stroke, then pin its ends to the vertices
        pts = resamplePoly(chaikin(chaikin(resamplePoly(pts, 0.022))), 0.016);
        pts[0] = [A.x, A.y];
        pts[pts.length - 1] = [B.x, B.y];
        if (pts.length < 3) pts.splice(1, 0, lerp(pts[0], pts[pts.length - 1], 0.5));
        const e = { id: this.nextId++, a: A.id, b: B.id, pts };
        this.edges.push(e);
        this.changed(true, new Set([e.id]));
    }

    moveVertex(v, d) {
        v.x += d[0]; v.y += d[1];
        for (const e of this.edges) {
            if (e.a !== v.id && e.b !== v.id) continue;
            const c = [0];
            for (let i = 1; i < e.pts.length; i++) c.push(c[i - 1] + dist(e.pts[i], e.pts[i - 1]));
            const L = c[c.length - 1] || 1;
            e.pts = e.pts.map((p, i) => {
                let w = 0;
                if (e.a === v.id) w += Math.pow(1 - c[i] / L, 2);
                if (e.b === v.id) w += Math.pow(c[i] / L, 2);
                w = Math.min(1, w);
                return [p[0] + w * d[0], p[1] + w * d[1]];
            });
            if (e.a === v.id) e.pts[0] = [v.x, v.y];
            if (e.b === v.id) e.pts[e.pts.length - 1] = [v.x, v.y];
        }
    }

    moveEdgePoint(drag, d) {
        const e = drag.e, c = drag.cum, L = c[c.length - 1];
        const sig = Math.min(0.18, 0.3 * L);
        e.pts = e.pts.map((p, i) => {
            if (i === 0 || i === e.pts.length - 1) return p;
            let ds = Math.abs(c[i] - drag.s0);
            if (e.a === e.b) ds = Math.min(ds, L - ds);
            const w = Math.exp(-(ds * ds) / (2 * sig * sig));
            const endFade = Math.min(1, c[i] / (0.15 * L), (L - c[i]) / (0.15 * L));
            return [p[0] + w * endFade * d[0], p[1] + w * endFade * d[1]];
        });
    }

    // ------------------------------------------------------------ drawing

    draw() {
        const ctx = this.ctx, dpr = this.dpr || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        const light = this.theme === 'light';
        const bg = light ? '#f7f8fc' : '#0a0e1a';
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.w, this.h);
        // dot grid
        ctx.fillStyle = light ? 'rgba(23,28,43,0.10)' : 'rgba(255,255,255,0.07)';
        const step = this.pxPerUnit() / 8;
        for (let x = this.w / 2 % step; x < this.w; x += step) for (let y = this.h / 2 % step; y < this.h; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);

        const W = 3.2;
        const strokePoly = (pts, col, width) => {
            ctx.beginPath();
            pts.forEach((p, i) => { const [x, y] = this.toPx(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.stroke();
        };
        const colorOf = id => this.color(this.edges.findIndex(e => e.id === id));
        this.edges.forEach((e, i) => strokePoly(e.pts, this.color(i), W));
        // over-strands: a halo in the background colour, then the strand again
        for (const c of this.cross) {
            const id = c.aOver ? c.e : c.f, s = c.aOver ? c.se : c.sf;
            const e = this.edges.find(f => f.id === id);
            if (!e) continue;
            const piece = subPoly(e.pts, s - 0.075, s + 0.075, e.a === e.b);
            strokePoly(piece, bg, W + 7);
            strokePoly(piece, colorOf(id), W);
        }
        // hovered crossing
        if (this.hover === 'cross' && this.hoverPx) {
            const c = this.pickCrossing(...this.hoverPx);
            if (c) {
                const [x, y] = this.toPx([c.x, c.y]);
                ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI);
                ctx.strokeStyle = light ? 'rgba(99,102,241,0.6)' : 'rgba(165,180,252,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
            }
        } else if (this.hover && this.tool === 'erase') {
            const h = this.hover;
            if (h.pts) strokePoly(h.pts, 'rgba(251,113,133,0.55)', W + 5);
        }
        // vertices
        for (const v of this.verts) {
            const [x, y] = this.toPx([v.x, v.y]);
            const deg = this.degree(v.id);
            ctx.beginPath();
            if (deg === 2) {
                ctx.arc(x, y, 3.6, 0, 2 * Math.PI);
                ctx.fillStyle = bg; ctx.fill();
                ctx.lineWidth = 1.6; ctx.strokeStyle = light ? '#545d75' : '#9aa5bd'; ctx.stroke();
            } else {
                ctx.arc(x, y, 5.6, 0, 2 * Math.PI);
                ctx.fillStyle = light ? '#171c2b' : '#eef1f8'; ctx.fill();
            }
        }
        // the stroke in progress
        if (this.stroke) strokePoly(this.stroke.pts, light ? 'rgba(23,28,43,0.55)' : 'rgba(238,241,248,0.6)', W);
        if (!this.edges.length && !this.stroke) {
            ctx.fillStyle = light ? '#8b93a8' : '#5e6880';
            ctx.font = '500 13px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Draw strands with the pointer.', this.w / 2, this.h / 2 - 9);
            ctx.fillText('End on a strand to make a vertex there.', this.w / 2, this.h / 2 + 11);
        }
    }

    // ------------------------------------------------------------ to and from ℝ³

    /** The diagram as a spec, lifted to ℝ³: over-strands rise, under-strands dip. */
    toSpec() {
        if (!this.edges.length) throw new Error('The diagram is empty.');
        const S = 2.4, H = 0.16;
        const bumps = new Map(this.edges.map(e => [e.id, []]));
        for (const c of this.cross) {
            bumps.get(c.e).push({ s: c.se, sign: c.aOver ? 1 : -1 });
            bumps.get(c.f).push({ s: c.sf, sign: c.aOver ? -1 : 1 });
        }
        const spec = { name: 'Diagram', dense: true, vertices: this.verts.filter(v => this.degree(v.id) > 0).map(v => ({ id: String(v.id), pos: [S * v.x, S * v.y, 0] })), edges: [] };
        for (const e of this.edges) {
            const fine = resamplePoly(e.pts, 0.006);
            const c = [0];
            for (let i = 1; i < fine.length; i++) c.push(c[i - 1] + dist(fine[i], fine[i - 1]));
            const L = c[c.length - 1];
            const list = bumps.get(e.id).sort((p, q) => p.s - q.s);
            list.forEach((b, k) => {
                const gapL = k > 0 ? b.s - list[k - 1].s : Infinity, gapR = k + 1 < list.length ? list[k + 1].s - b.s : Infinity;
                b.w = Math.min(0.11, 0.45 * gapL, 0.45 * gapR, 0.8 * b.s, 0.8 * (L - b.s));
            });
            const pts = fine.map((p, i) => {
                let z = 0;
                for (const b of list) {
                    const u = (c[i] - b.s) / b.w;
                    if (Math.abs(u) < 1) z += b.sign * H * (1 - u * u) * (1 - u * u);
                }
                return [S * p[0], S * p[1], z];
            });
            spec.edges.push({ a: String(e.a), b: String(e.b), way: pts.slice(1, -1) });
        }
        return spec;
    }

    /**
     * Load the projection of a 3D graph: `proj(node) → [x, y, depth]` (depth: smaller is nearer).
     */
    fromGraph(g, proj) {
        this.snapshot();
        const P = [];
        for (let i = 0; i < g.N; i++) P.push(proj(i));
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
        for (const p of P) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
        const sc = 1.7 / Math.max(maxx - minx, maxy - miny, 1e-9);
        const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
        const L = i => [(P[i][0] - cx) * sc, -(P[i][1] - cy) * sc];
        const verts = [], edges = [];
        let id = 1;
        const vid = new Map();
        g.vertexNodes.forEach(n => { const p = L(n); verts.push({ id, x: p[0], y: p[1] }); vid.set(n, id++); });
        for (const e of g.edges) {
            const nd = e.nodes;
            if (e.circle && !vid.has(nd[0])) { const p = L(nd[0]); verts.push({ id, x: p[0], y: p[1] }); vid.set(nd[0], id++); }
            edges.push({ id: id++, a: vid.get(nd[0]), b: vid.get(nd[nd.length - 1]), pts: nd.map(L), depth: nd.map(i => P[i][2]) });
        }
        const depthAt = (e, s) => {
            const pts = e.pts; let acc = 0;
            for (let k = 1; k < pts.length; k++) {
                const l = dist(pts[k], pts[k - 1]);
                if (acc + l >= s) { const t = (s - acc) / (l || 1); return e.depth[k - 1] + t * (e.depth[k] - e.depth[k - 1]); }
                acc += l;
            }
            return e.depth[e.depth.length - 1];
        };
        const byId = new Map(edges.map(e => [e.id, e]));
        this.load({ verts, edges: edges.map(({ depth, ...e }) => e), over: c => depthAt(byId.get(c.e), c.se) < depthAt(byId.get(c.f), c.sf) });
        this.onChange(this);
    }

    stats() {
        const real = this.verts.filter(v => this.degree(v.id) !== 2).length;
        return { vertices: real, strands: this.edges.length, crossings: this.cross.length };
    }
}

// ---------------------------------------------------------------- 2D helpers

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const unit = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const polyLen = pts => pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);

function segInt(p, q, r, s) {
    const d1 = sub(q, p), d2 = sub(s, r);
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-14) return null;
    const w = sub(r, p);
    const t = (w[0] * d2[1] - w[1] * d2[0]) / den;
    const u = (w[0] * d1[1] - w[1] * d1[0]) / den;
    const eps = 1e-9;
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
    return [t, u];
}

function nearestOnPoly(pts, p) {
    let best = { d: Infinity, k: 0, t: 0 };
    for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1], ab = sub(b, a);
        const l2 = dot2(ab, ab) || 1e-12;
        const t = Math.max(0, Math.min(1, dot2(sub(p, a), ab) / l2));
        const d = dist(p, lerp(a, b, t));
        if (d < best.d) best = { d, k, t };
    }
    return best;
}

function resamplePoly(pts, step) {
    const L = polyLen(pts);
    const n = Math.max(2, Math.ceil(L / step));
    const out = [pts[0].slice()];
    let k = 0, acc = 0;
    for (let i = 1; i < n; i++) {
        const s = (L * i) / n;
        while (k + 1 < pts.length - 1 && acc + dist(pts[k], pts[k + 1]) < s) { acc += dist(pts[k], pts[k + 1]); k++; }
        const l = dist(pts[k], pts[k + 1]) || 1;
        out.push(lerp(pts[k], pts[k + 1], Math.min(1, (s - acc) / l)));
    }
    out.push(pts[pts.length - 1].slice());
    return out;
}

function chaikin(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push(lerp(a, b, 0.25), lerp(a, b, 0.75));
    }
    out.push(pts[pts.length - 1]);
    return out;
}

/** The part of a polyline between arclengths s0 and s1 (wrapping for loops). */
function subPoly(pts, s0, s1, loop) {
    const L = polyLen(pts);
    const at = s => {
        if (loop) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
        let acc = 0;
        for (let k = 1; k < pts.length; k++) {
            const l = dist(pts[k], pts[k - 1]);
            if (acc + l >= s) return lerp(pts[k - 1], pts[k], (s - acc) / (l || 1));
            acc += l;
        }
        return pts[pts.length - 1];
    };
    const out = [];
    for (let i = 0; i <= 12; i++) out.push(at(s0 + ((s1 - s0) * i) / 12));
    return out;
}
