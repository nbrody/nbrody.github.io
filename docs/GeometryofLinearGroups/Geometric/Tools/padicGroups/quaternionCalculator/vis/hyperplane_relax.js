// hyperplane_relax.js - Let the hyperplane graphs of the folded complex settle into a
// nice embedding, using the energy and isotopy-guarded flow of the Spatial Graph
// Relaxer (docs/topology/spatialGraphs).
//
// It runs only while the view shows the hyperplanes alone (no squares, no
// 1-skeleton), folded, with the slices at ¼ and ¾ (the double covers) or at ½ (the
// hyperplanes themselves). The graph is read off the folded patches exactly as the
// view draws it: each slice runs between the points of two edges where it meets
// them, and when both families are shown a vertical and a horizontal slice of the
// same square share the point where they cross. Outside those views the drawing
// goes back to the slices of the patches; returning to the same view resumes the
// relaxed shape.

import * as THREE from 'three';
import { TubeBatch, COLORS } from './vis_folded.js';
import { buildGraph, graphToText, catmullRom, resample } from '../../../../../../topology/spatialGraphs/js/model.js';
import { Relaxer } from '../../../../../../topology/spatialGraphs/js/engine.js';
import { detectSymmetry } from '../../../../../../topology/spatialGraphs/js/symmetry.js';

const TS = 48;          // tube segments per edge
const SAMPLES = 32;     // points per unit of slice parameter when reading the graph off
const RELAXER_URL = new URL('../../../../../../topology/spatialGraphs/', import.meta.url).href;

export class HyperplaneRelax {
    constructor(view, { onStatus } = {}) {
        this.view = view;
        this.onStatus = onStatus || (() => { });
        this.enabled = false;
        this.group = new THREE.Group();
        this.shown = false;
        this.key = null;
        this.g = null;
        this.relaxer = null;
        this.error = '';
        this.statusAt = 0;
    }

    // ----- public -----

    setEnabled(on) {
        this.enabled = on;
        if (!on && this.shown) this._hide();
        this.view._dirty = true;
        this._status(true);
    }

    /** True when the view shows nothing but hyperplanes, folded, at ¼ ¾ or at ½. */
    eligible() {
        const v = this.view, P = v.params;
        return !!v.cx && !P.squares && !P.edges && (P.vertical || P.horizontal)
            && P.fold >= 0.999 && (P.cover <= 0.001 || P.cover >= 0.999) && !v._tweens.cover && !v._tweens.fold;
    }

    get active() { return this.enabled && this.shown && !!this.g; }

    /** Throw the relaxed shape away and start again from the slices of the complex. */
    restart() {
        this.key = null;
        this.view._dirty = true;
    }

    /** Called by the view every animation frame, before it renders. */
    frame() {
        const ok = this.enabled && this.eligible();
        const changed = ok !== this.wasOk;
        this.wasOk = ok;
        if (!ok) {
            if (this.shown) this._hide();
            this._status(changed);
            return;
        }
        const key = this._key();
        if (key !== this.key) {
            this.key = key;
            this._build();
        }
        if (!this.g) { this._status(changed); return; }
        if (!this.shown) this._show();
        const r = this.relaxer;
        if (this.running) {
            const t0 = performance.now();
            while (performance.now() - t0 < 10) {
                r.step();
                if (r.settled) break;
            }
            if (this.g.N !== this.drawnN) this._allocate();
            this._draw();
            // big graphs creep downhill for a long time: call it settled when the energy
            // has dropped by less than 0.1% over the last thousand steps
            const E = r.cache ? r.cache.E : NaN;
            this.trace.push([r.it, E]);
            while (this.trace.length > 2 && this.trace[1][0] <= r.it - 1000) this.trace.shift();
            const [it0, E0] = this.trace[0];
            const slow = r.it - it0 >= 900 && Math.abs(E0 - E) < 1e-3 * Math.abs(E);
            if (r.it > 600 && (r.settled || slow)) {
                this.running = false;
                try { this.sym = detectSymmetry(this.g); } catch (e) { this.sym = null; }
                this._status(true);
            }
        }
        this._status();
    }

    /** The view redrew its own objects: keep its slices hidden under ours. */
    afterUpdate() {
        if (!this.shown) return;
        this._hideOriginals();
        this._placeLabels();
    }

    /** Colours follow the view's (by hyperplane or by square; the selected square lit). */
    paint() {
        if (!this.tubes) return;
        this.info.forEach((inf, t) => this.tubes.setColor(t, this.view._arcColor(inf.family, inf.s)));
        this.tubes.commit(true);
    }

    /** Square under the ray, or −1. */
    pick(raycaster) {
        if (!this.tubes) return -1;
        this.tubes.geometry.computeBoundingSphere();
        const hit = raycaster.intersectObject(this.tubes.mesh, false)[0];
        if (!hit) return -1;
        return this.info[Math.floor(hit.faceIndex / this.tubes.trisPerTube)].s;
    }

    /** Points to fit the camera to. */
    points() {
        if (!this.g) return [];
        const x = this.g.x, out = [];
        for (let i = 0; i < this.g.N; i++) out.push([x[3 * i], x[3 * i + 1], x[3 * i + 2]]);
        return out;
    }

    /** The current graph in the Spatial Graph Relaxer, in a new tab. */
    async openInRelaxer() {
        if (!this.g) return;
        const text = `name ${this.name}\n${graphToText(this.g)}`;
        let code = 't' + b64(new TextEncoder().encode(text));
        if (typeof CompressionStream !== 'undefined') {
            const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            code = 'z' + b64(new Uint8Array(await new Response(stream).arrayBuffer()));
        }
        window.open(`${RELAXER_URL}#g=${code}`, '_blank', 'noopener');
    }

    // ----- building the graph -----

    _key() {
        const v = this.view, P = v.params;
        if (this.shapeRef !== v.shape) { this.shapeRef = v.shape; this.shapeId = (this.shapeId || 0) + 1; }
        return [this.shapeId, P.kappa, P.vertical ? 'v' : '', P.horizontal ? 'h' : '', P.cover >= 0.999 ? 'half' : 'quarters'].join('|');
    }

    /** The hyperplane graph shown now, as a spatial-graph spec. */
    _spec() {
        const v = this.view, cx = v.cx, P = v.params;
        const half = P.cover >= 0.999;
        const slices = half ? [0.5] : [0.25, 0.75];
        const fams = [];
        if (P.vertical) fams.push('v');
        if (P.horizontal) fams.push('h');
        const both = fams.length === 2;
        const at = (s, u, w) => v._folded(s, u, w, [0, 0, 0]);
        // a point a quarter, half or three quarters of the way along an edge, in its own orientation
        const endKey = (tag, g, a) => `${tag}${g.edge}@${Math.round(4 * (g.sign > 0 ? a : 1 - a))}`;
        const crossKey = (s, u, w) => `c${s}_${u}_${w}`;     // no ':' or ',' — the text format splits on them
        const verts = new Map();
        const edges = [], info = [];
        cx.squares.forEach((sq, s) => {
            for (const fam of fams) {
                const [g0, g1] = fam === 'v' ? [cx.A[sq.bottom], cx.A[sq.top]] : [cx.B[sq.left], cx.B[sq.right]];
                const tag = fam === 'v' ? 'h' : 'v';
                for (const a of slices) {
                    // the slice at a: u = a (vertical) or v = a (horizontal), parametrised by t
                    const pt = (t) => (fam === 'v' ? at(s, a, t) : at(s, t, a));
                    const uv = (t) => (fam === 'v' ? [a, t] : [t, a]);
                    const ids = [endKey(tag, g0, a)], ts = [0];
                    if (both) for (const b of slices) { ts.push(b); ids.push(crossKey(s, ...uv(b))); }
                    ts.push(1); ids.push(endKey(tag, g1, a));
                    ts.forEach((t, k) => { if (!verts.has(ids[k])) verts.set(ids[k], pt(t)); });
                    for (let k = 0; k + 1 < ts.length; k++) {
                        const n = Math.max(4, Math.ceil(SAMPLES * (ts[k + 1] - ts[k])));
                        const way = [];
                        for (let i = 1; i < n; i++) way.push(pt(ts[k] + (ts[k + 1] - ts[k]) * i / n));
                        edges.push({ a: ids[k], b: ids[k + 1], way });
                        info.push({ family: fam, s });
                    }
                }
            }
        });
        const what = `${both ? 'vertical and horizontal' : fams[0] === 'v' ? 'vertical' : 'horizontal'} ${half ? 'hyperplane' : 'double-cover'} graph${both ? 's' : ''}`;
        this.name = `X_${cx.p},${cx.q}: ${what}`;
        this.what = what;
        return { spec: { name: this.name, dense: true, vertices: [...verts].map(([id, pos]) => ({ id, pos })), edges }, info };
    }

    _build() {
        this._dispose();
        this.error = '';
        this.sym = null;
        let built;
        try {
            built = this._spec();
            // about eight beads an edge, fewer for the big two-family graphs, so a step stays cheap
            const m = built.spec.edges.length;
            this.minSegs = m > 120 ? 3 : 4;
            // exact: start from the slices as drawn and thin the beads only by guarded steps,
            // so the starting model is certainly the same graph in ℝ³ as the picture
            this.g = buildGraph(built.spec, { exact: true, totalBeads: Math.min(600, Math.max(64, 8 * m)), minSegs: this.minSegs });
            // keep the drawing's size and stay put around the vertex
            this.relaxer = new Relaxer(this.g, { L0: this.g.totalLength(), minSegs: this.minSegs });
        } catch (e) {
            this.g = null;
            this.relaxer = null;
            this.error = e.message;
            this._status(true);
            return;
        }
        this.info = built.info;
        this.running = true;
        this.trace = [];
        this._allocate();
        this._draw();
        this._status(true);
    }

    _allocate() {
        const v = this.view;
        if (this.tubes) { this.group.remove(this.tubes.mesh); this.tubes.dispose(); }
        if (this.balls) { this.group.remove(this.balls); this.balls.geometry.dispose(); }
        this.tubes = new TubeBatch(this.g.edges.length, TS, 10, v.mats.arcs);
        const V = this.g.vertexNodes.length;
        this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), v.mats.dots, Math.max(1, V));
        this.balls.frustumCulled = false;
        const vv = new THREE.Color(COLORS.vHyper), hh = new THREE.Color(COLORS.hHyper), cc = new THREE.Color(0.95, 0.97, 1);
        this.g.vertexNames.forEach((id, k) => this.balls.setColorAt(k, id[0] === 'c' ? cc : id[0] === 'h' ? vv : hh));
        this.group.add(this.tubes.mesh, this.balls);
        this.drawnN = this.g.N;
        this.paint();
    }

    _draw() {
        const g = this.g, v = this.view;
        const r = 0.017 * (0.6 + 0.4 * v.scale) + 0.005;
        const line = this._line || (this._line = new Float32Array((TS + 1) * 3));
        g.edges.forEach((e, t) => {
            const smooth = catmullRom(g.edgePoints(t), 3, false);
            const pts = resample(smooth, TS, false);
            pts.forEach((p, k) => { line[3 * k] = p[0]; line[3 * k + 1] = p[1]; line[3 * k + 2] = p[2]; });
            this.tubes.setTube(t, line, r);
        });
        this.tubes.commit();
        const M = new THREE.Matrix4();
        g.vertexNodes.forEach((n, k) => {
            const centre = g.vertexNames[k][0] === 'c';
            const rad = centre ? 0.03 : 0.06;
            M.makeScale(rad, rad, rad).setPosition(g.x[3 * n], g.x[3 * n + 1], g.x[3 * n + 2]);
            this.balls.setMatrixAt(k, M);
        });
        this.balls.instanceMatrix.needsUpdate = true;
        if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
        this._placeLabels();
        v._dirty = true;
    }

    _show() {
        this.view.root.add(this.group);
        this.shown = true;
        this._hideOriginals();
        this._placeLabels();
        this.view._dirty = true;
    }

    _hide() {
        this.view.root.remove(this.group);
        this.shown = false;
        this.view.update(false);        // puts the slices and labels back
    }

    _hideOriginals() {
        const v = this.view;
        for (const k of ['vArcs', 'hArcs', 'vRibbons', 'hRibbons']) if (v[k]) v[k].mesh.visible = false;
        for (const k of ['hypVerts', 'centers']) if (v[k]) v[k].visible = false;
    }

    /** Generator labels sit on the relaxed vertices they name. */
    _placeLabels() {
        const v = this.view, g = this.g;
        if (!g || !v.labels || !v.labels.visible) return;
        const index = new Map(g.vertexNames.map((id, k) => [id, g.vertexNodes[k]]));
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < g.N; i++) { cx += g.x[3 * i]; cy += g.x[3 * i + 1]; cz += g.x[3 * i + 2]; }
        cx /= g.N; cy /= g.N; cz /= g.N;
        for (const sp of v.labelSprites) {
            if (!sp.visible) continue;
            const { kind, i, lift } = sp.userData;
            const n = index.get(`${kind}${i}@${lift === undefined ? 2 : lift < 0.5 ? 1 : 3}`);
            if (n === undefined) { sp.visible = false; continue; }
            const p = [g.x[3 * n], g.x[3 * n + 1], g.x[3 * n + 2]];
            const d = [p[0] - cx, p[1] - cy, p[2] - cz], l = Math.hypot(...d) || 1;
            sp.position.set(p[0] + 0.24 * d[0] / l, p[1] + 0.24 * d[1] / l, p[2] + 0.24 * d[2] / l + 0.04);
        }
    }

    _dispose() {
        if (this.tubes) { this.group.remove(this.tubes.mesh); this.tubes.dispose(); this.tubes = null; }
        if (this.balls) { this.group.remove(this.balls); this.balls.geometry.dispose(); this.balls = null; }
        this.g = null;
        this.relaxer = null;
    }

    // ----- status -----

    _status(now = false) {
        const t = performance.now();
        if (!now && t - this.statusAt < 300) return;
        this.statusAt = t;
        this.onStatus(this.describe());
    }

    describe() {
        if (!this.enabled) return { state: 'off', html: '' };
        if (!this.eligible()) {
            return {
                state: 'waiting',
                html: 'Relaxing applies only when the hyperplanes are shown on their own (no squares, no 1-skeleton), folded, with the slices at ¼ and ¾ or at ½.'
            };
        }
        if (this.error) return { state: 'error', html: `Could not relax this graph: ${this.error}` };
        if (!this.g) return { state: 'waiting', html: '' };
        const k = this.g.counts();
        const size = `${k.V} vertices, ${k.arcs} edges`;
        const r = this.relaxer;
        if (this.running) {
            return { state: 'running', html: `Relaxing the ${this.what} (${size}) · energy ${r.cache ? r.cache.E.toFixed(2) : '…'} · step ${r.it}` };
        }
        const s = this.sym;
        let symLine = '';
        if (s) {
            const name = s.group.name.replace(/^([A-Z])(.+)$/, '$1<sub>$2</sub>');
            symLine = s.group.order > 1
                ? ` Rigid symmetry ${name} (order ${s.group.order})${s.autCount ? `: ${s.realized} of the graph's ${s.autCount} automorphisms realized` : ''}.`
                : ' No rigid symmetry.';
        }
        return { state: 'settled', html: `Settled: the ${this.what} (${size}), energy ${r.cache ? r.cache.E.toFixed(2) : ''}.${symLine} No strand passed through another, so it is the same graph in ℝ³.` };
    }
}

function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
