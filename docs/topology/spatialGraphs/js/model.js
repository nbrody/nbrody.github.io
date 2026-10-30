// model.js — spatial graphs as bead chains.
//
// A *spec* is what the user (or an example, or the diagram editor) hands us:
//
//   { name,
//     vertices: [{ id, pos: [x,y,z] | null }],
//     edges:    [{ a, b, way: [[x,y,z], …] }],     // a → b through optional waypoints
//     circles:  [{ way: [[x,y,z], …] }],           // closed curves with no vertex
//     layout:   'random' | 'moment' | 'spectral',  // for vertices given without a position
//     seed }
//
// buildGraph() turns it into a SpatialGraph: every edge becomes a chain of
// beads (polyline nodes) between its two vertex nodes. Vertices of degree 2
// carry no topology, so they are suppressed — their two edges are merged —
// and a cycle made only of degree-2 vertices becomes a circle with a hidden
// base bead. What remains is the topological graph: real vertices (degree
// ≠ 2), arcs between them, and circles.

export const KIND_BEAD = 0, KIND_VERTEX = 1, KIND_BASE = 2;

export class SpatialGraph {
    constructor() {
        this.N = 0;
        this.x = new Float64Array(0);       // 3N positions
        this.kind = new Uint8Array(0);      // KIND_*
        this.edges = [];                    // { nodes:number[], circle, a, b, name }
        this.vertexNodes = [];              // real vertex v → node index
        this.vertexNames = [];
        this.name = '';
    }

    clone() {
        const g = new SpatialGraph();
        g.N = this.N;
        g.x = this.x.slice();
        g.kind = this.kind.slice();
        g.edges = this.edges.map(e => ({ ...e, nodes: e.nodes.slice() }));
        g.vertexNodes = this.vertexNodes.slice();
        g.vertexNames = this.vertexNames.slice();
        g.name = this.name;
        g.rebuild();
        return g;
    }

    /** Derived arrays: segments, bead-graph adjacency, bending triples, vertex stars. */
    rebuild() {
        const N = this.N;
        const segA = [], segB = [], segE = [];
        const triples = [];
        for (let ei = 0; ei < this.edges.length; ei++) {
            const nd = this.edges[ei].nodes;
            for (let k = 0; k + 1 < nd.length; k++) { segA.push(nd[k]); segB.push(nd[k + 1]); segE.push(ei); }
            for (let k = 1; k + 1 < nd.length; k++) triples.push(nd[k - 1], nd[k], nd[k + 1]);
            if (this.edges[ei].circle) triples.push(nd[nd.length - 2], nd[0], nd[1]);
        }
        this.S = segA.length;
        this.segA = Int32Array.from(segA);
        this.segB = Int32Array.from(segB);
        this.segE = Int32Array.from(segE);
        this.triples = Int32Array.from(triples);

        // CSR adjacency of the bead graph (for the Sobolev preconditioner)
        const deg = new Int32Array(N);
        for (let s = 0; s < this.S; s++) { deg[this.segA[s]]++; deg[this.segB[s]]++; }
        const off = new Int32Array(N + 1);
        for (let i = 0; i < N; i++) off[i + 1] = off[i] + deg[i];
        const adj = new Int32Array(off[N]);
        const fill = off.slice(0, N);
        for (let s = 0; s < this.S; s++) {
            const a = this.segA[s], b = this.segB[s];
            adj[fill[a]++] = b; adj[fill[b]++] = a;
        }
        this.adjOff = off; this.adj = adj; this.deg = deg;

        // vertex stars: the first bead along every edge-end at each real vertex
        this.stars = this.vertexNodes.map(() => []);
        const vOf = new Int32Array(N).fill(-1);
        this.vertexNodes.forEach((n, v) => { vOf[n] = v; });
        this.vertexOf = vOf;
        for (const e of this.edges) {
            if (e.circle) continue;
            const nd = e.nodes;
            this.stars[e.a].push(nd[1]);
            this.stars[e.b].push(nd[nd.length - 2]);
        }
    }

    segLength(s, x = this.x) {
        const a = 3 * this.segA[s], b = 3 * this.segB[s];
        return Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]);
    }

    totalLength(x = this.x) {
        let L = 0;
        for (let s = 0; s < this.S; s++) L += this.segLength(s, x);
        return L;
    }

    edgeLength(ei, x = this.x) {
        const nd = this.edges[ei].nodes;
        let L = 0;
        for (let k = 0; k + 1 < nd.length; k++) {
            const a = 3 * nd[k], b = 3 * nd[k + 1];
            L += Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]);
        }
        return L;
    }

    /** Points of edge ei, in order (a circle repeats its base at the end). */
    edgePoints(ei, x = this.x) {
        return this.edges[ei].nodes.map(n => [x[3 * n], x[3 * n + 1], x[3 * n + 2]]);
    }

    counts() {
        const arcs = this.edges.filter(e => !e.circle).length;
        const circles = this.edges.length - arcs;
        const V = this.vertexNodes.length;
        // connected components of the topological graph (circles are their own)
        const parent = [...Array(V).keys()];
        const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        for (const e of this.edges) if (!e.circle) parent[find(e.a)] = find(e.b);
        const roots = new Set();
        for (let v = 0; v < V; v++) roots.add(find(v));
        const components = roots.size + circles;
        const degrees = this.stars.map(s => s.length);
        return { V, arcs, circles, components, betti: arcs - V + components, degrees };
    }
}

// ---------------------------------------------------------------- helpers

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Centripetal Catmull–Rom through pts; `closed` wraps around. Returns a dense polyline. */
export function catmullRom(pts, perSpan, closed) {
    const n = pts.length;
    if (n < 2) return pts.slice();
    const P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const out = [];
    const spans = closed ? n : n - 1;
    for (let i = 0; i < spans; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        const t01 = Math.pow(dist(p0, p1), 0.5) || 1e-4;
        const t12 = Math.pow(dist(p1, p2), 0.5) || 1e-4;
        const t23 = Math.pow(dist(p2, p3), 0.5) || 1e-4;
        for (let k = 0; k < perSpan; k++) {
            const u = k / perSpan;
            const out3 = [0, 0, 0];
            for (let c = 0; c < 3; c++) {
                // tangents (Barry–Goldman, centripetal), scaled to the span
                let m1 = (p1[c] - p0[c]) / t01 - (p2[c] - p0[c]) / (t01 + t12) + (p2[c] - p1[c]) / t12;
                let m2 = (p2[c] - p1[c]) / t12 - (p3[c] - p1[c]) / (t12 + t23) + (p3[c] - p2[c]) / t23;
                m1 *= t12; m2 *= t12;
                const a = 2 * p1[c] - 2 * p2[c] + m1 + m2;
                const b = -3 * p1[c] + 3 * p2[c] - 2 * m1 - m2;
                out3[c] = ((a * u + b) * u + m1) * u + p1[c];
            }
            out.push(out3);
        }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
}

/** Resample a dense polyline to `segs` equal-arclength segments (closed: `segs` points, no repeat). */
export function resample(poly, segs, closed) {
    const pts = closed ? [...poly, poly[0]] : poly;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
    const L = cum[cum.length - 1];
    const out = [];
    let j = 0;
    const count = closed ? segs : segs + 1;
    for (let k = 0; k < count; k++) {
        const s = (k / segs) * L;
        while (j < pts.length - 2 && cum[j + 1] < s) j++;
        const t = (s - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]);
        const p = pts[j], q = pts[j + 1];
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]);
    }
    if (!closed) out[out.length - 1] = pts[pts.length - 1].slice();
    return out;
}

function polyLength(poly, closed) {
    let L = 0;
    for (let i = 1; i < poly.length; i++) L += dist(poly[i], poly[i - 1]);
    if (closed) L += dist(poly[0], poly[poly.length - 1]);
    return L;
}

// ---------------------------------------------------------------- layout

function jacobiEigen(A, n) {
    // symmetric eigen-decomposition; returns { values, vectors (columns) }
    const a = A.map(r => r.slice());
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
        let off = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
        if (off < 1e-20) break;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
            if (Math.abs(a[p][q]) < 1e-14) continue;
            const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
            const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < n; k++) {
                const akp = a[k][p], akq = a[k][q];
                a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
            }
            for (let k = 0; k < n; k++) {
                const apk = a[p][k], aqk = a[q][k];
                a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
            }
            for (let k = 0; k < n; k++) {
                const vkp = v[k][p], vkq = v[k][q];
                v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
            }
        }
    }
    return { values: a.map((r, i) => r[i]), vectors: v };
}

/** Positions for n vertices with edge list E (pairs of indices). */
export function layoutVertices(n, E, mode = 'random', seed = 1) {
    const rnd = mulberry32(seed);
    if (n === 1) return [[0, 0, 0]];
    if (mode === 'moment') {
        // points on the moment curve: no four coplanar, so straight edges never meet
        return Array.from({ length: n }, (_, i) => {
            const t = 2 * (i / (n - 1)) - 1;
            return [1.6 * t, 1.6 * t * t - 0.6, 1.6 * t * t * t];
        });
    }
    if (mode === 'spectral' && n >= 4) {
        const L = Array.from({ length: n }, () => new Array(n).fill(0));
        for (const [i, j] of E) {
            if (i === j) continue;
            L[i][j] -= 1; L[j][i] -= 1; L[i][i] += 1; L[j][j] += 1;
        }
        const { values, vectors } = jacobiEigen(L, n);
        const order = values.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
        const cols = order.slice(1, 4);
        const pos = Array.from({ length: n }, (_, i) => cols.map(c => vectors[i][c]));
        let r = 0;
        for (const p of pos) r = Math.max(r, Math.hypot(...p));
        return pos.map(p => p.map(c => (1.5 * c) / (r || 1) + 0.04 * (rnd() - 0.5)));
    }
    // random points in a ball, kept apart a little
    const pos = [];
    for (let i = 0; i < n; i++) {
        let best = null, bestD = -1;
        for (let tries = 0; tries < 30; tries++) {
            let p;
            do { p = [2 * rnd() - 1, 2 * rnd() - 1, 2 * rnd() - 1]; } while (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > 1);
            const d = pos.reduce((m, q) => Math.min(m, dist(p, q)), Infinity);
            if (d > bestD) { bestD = d; best = p; }
        }
        pos.push(best.map(c => 1.5 * c));
    }
    return pos;
}

// ---------------------------------------------------------------- build

/**
 * Spec → SpatialGraph. opts: { totalBeads, minSegs (per edge, default 5) }.
 * Throws with a readable message when the result is not an embedding.
 */
export function buildGraph(spec, opts = {}) {
    // a random layout can put two straight edges nearly on top of each other: try other seeds
    const random = (spec.vertices || []).some(v => !v.pos) && (spec.layout || 'random') === 'random';
    let g = buildOnce(spec, opts);
    for (let k = 1; random && k < 12 && minClearance(g) < 0.12 * g.totalLength() / g.N; k++) {
        g = buildOnce({ ...spec, seed: (spec.seed ?? 1) + 101 * k }, opts);
    }
    if (minClearance(g) < 1e-6 * g.totalLength()) throw new Error('Two edges meet: this is not an embedding.');
    return g;
}

/** Least distance between two segments that share no bead (brute force). */
export function minClearance(g) {
    let best = Infinity;
    for (let I = 0; I < g.S; I++) for (let J = I + 1; J < g.S; J++) {
        const a = g.segA[I], b = g.segB[I], c = g.segA[J], d = g.segB[J];
        if (c === a || c === b || d === a || d === b) continue;
        best = Math.min(best, segSegDist(g.x, a, b, c, d));
    }
    return best;
}

function buildOnce(spec, opts) {
    const verts = (spec.vertices || []).map(v => ({ id: String(v.id), pos: v.pos ? v.pos.slice() : null }));
    const byId = new Map(verts.map((v, i) => [v.id, i]));
    const rawEdges = [];
    for (const e of spec.edges || []) {
        for (const id of [e.a, e.b]) {
            if (!byId.has(String(id))) { byId.set(String(id), verts.length); verts.push({ id: String(id), pos: null }); }
        }
        rawEdges.push({ a: byId.get(String(e.a)), b: byId.get(String(e.b)), way: (e.way || []).map(p => p.slice()) });
    }

    // positions for vertices given without one
    const missing = verts.map((v, i) => (v.pos ? -1 : i)).filter(i => i >= 0);
    if (missing.length) {
        const idx = new Map(missing.map((v, k) => [v, k]));
        const E = rawEdges.filter(e => idx.has(e.a) && idx.has(e.b)).map(e => [idx.get(e.a), idx.get(e.b)]);
        const pos = layoutVertices(missing.length, E, spec.layout || 'random', spec.seed ?? 1);
        missing.forEach((v, k) => { verts[v].pos = pos[k]; });
    }

    // bow parallel edges and loops that have no waypoints, so they don't coincide
    bowBundles(verts, rawEdges);

    // polylines through each edge: [posA, …way, posB]
    let edges = rawEdges.map(e => ({ a: e.a, b: e.b, poly: [verts[e.a].pos, ...e.way, verts[e.b].pos], dense: !!spec.dense }));
    const circles = (spec.circles || []).map(c => ({ poly: c.way.map(p => p.slice()), dense: !!spec.dense }));

    // suppress degree-2 vertices
    const degree = () => {
        const d = new Array(verts.length).fill(0);
        for (const e of edges) { d[e.a]++; d[e.b]++; }
        return d;
    };
    for (let guard = 0; guard < 10000; guard++) {
        const d = degree();
        const v = d.findIndex(x => x === 2);
        if (v < 0) break;
        const inc = edges.filter(e => e.a === v || e.b === v);
        if (inc.length === 1) {
            // a loop at a degree-2 vertex: a circle based there
            const e = inc[0];
            edges = edges.filter(f => f !== e);
            circles.push({ poly: e.poly.slice(0, -1), dense: e.dense, base: true });
            d[v] = 0;
            verts[v].dead = true;
            continue;
        }
        const [e1, e2] = inc;
        const p1 = e1.b === v ? e1.poly : e1.poly.slice().reverse();      // … → v
        const s1 = e1.b === v ? e1.a : e1.b;
        const p2 = e2.a === v ? e2.poly : e2.poly.slice().reverse();      // v → …
        const s2 = e2.a === v ? e2.b : e2.a;
        edges = edges.filter(f => f !== e1 && f !== e2);
        edges.push({ a: s1, b: s2, poly: [...p1, ...p2.slice(1)], dense: e1.dense && e2.dense });
        verts[v].dead = true;
    }

    // keep vertices of degree ≥ 1 (degree 0 ones are dropped)
    const d = degree();
    const keep = [];
    const newIndex = new Array(verts.length).fill(-1);
    verts.forEach((v, i) => { if (!v.dead && d[i] > 0) { newIndex[i] = keep.length; keep.push(v); } });
    edges = edges.map(e => ({ ...e, a: newIndex[e.a], b: newIndex[e.b] }));

    if (edges.length + circles.length === 0) throw new Error('The graph has no edges.');

    // smooth and measure
    // sparse waypoints are interpolated smoothly; dense polylines (diagrams, saved shapes) are used as they are
    const smooth = (poly, closed, dense) => (dense ? poly.slice() : catmullRom(poly, 24, closed));
    const curves = [];
    for (const e of edges) curves.push({ kind: 'arc', a: e.a, b: e.b, poly: smooth(e.poly, false, e.dense) });
    for (const c of circles) curves.push({ kind: 'circle', poly: smooth(c.poly, true, c.dense) });
    const lengths = curves.map(c => polyLength(c.poly, c.kind === 'circle'));
    const Ltot = lengths.reduce((s, x) => s + x, 0);
    const m = curves.length;
    const totalBeads = opts.totalBeads || Math.max(64, Math.min(320, 18 * m) + Math.min(240, 90 * circles.length));
    const h = Ltot / totalBeads;

    const g = new SpatialGraph();
    g.name = spec.name || '';
    const X = [], K = [];
    keep.forEach((v, i) => { X.push(...v.pos); K.push(KIND_VERTEX); g.vertexNodes.push(i); g.vertexNames.push(v.id); });
    const minSegs = c => (c.kind === 'circle' ? 10 : (c.a === c.b ? 9 : (opts.minSegs ?? 5)));
    curves.forEach((c, ci) => {
        const closed = c.kind === 'circle';
        // exact: keep the given points as beads (thinned later, safely, by coarsen)
        const segs = Math.max(minSegs(c), Math.round(lengths[ci] / h));
        const pts = opts.exact ? (closed ? c.poly : c.poly) : resample(c.poly, segs, closed);
        const nodes = [];
        if (closed) {
            for (const p of pts) { nodes.push(X.length / 3); X.push(...p); K.push(KIND_BEAD); }
            K[nodes[0]] = KIND_BASE;
            nodes.push(nodes[0]);
            g.edges.push({ nodes, circle: true, a: -1, b: -1 });
        } else {
            nodes.push(g.vertexNodes[c.a]);
            for (let k = 1; k < pts.length - 1; k++) { nodes.push(X.length / 3); X.push(...pts[k]); K.push(KIND_BEAD); }
            nodes.push(g.vertexNodes[c.b]);
            g.edges.push({ nodes, circle: false, a: c.a, b: c.b });
        }
    });
    g.N = X.length / 3;
    g.x = Float64Array.from(X);
    g.kind = Uint8Array.from(K);
    nameEdges(g);
    g.rebuild();
    if (opts.exact) coarsen(g, totalBeads, c => minSegs(c));
    return g;
}

/**
 * Thin out the beads of g toward `totalBeads` without changing its isotopy class:
 * a bead is removed only when moving it onto the chord between its neighbours
 * moves it by less than 0.45 × the distance from its two segments to every
 * segment they share no bead with — the same guard as a relaxation step, made local.
 * Edges keep at least minSegs(edge) segments.
 */
export function coarsen(g, totalBeads, minSegsOf = () => 5, guard = 0.45) {
    const h = g.totalLength() / Math.max(1, totalBeads);
    const target = g.edges.map((e, ei) => Math.max(minSegsOf(e.circle ? { kind: 'circle' } : { a: e.a, b: e.b }), Math.round(g.edgeLength(ei) / h)));
    for (let pass = 0; pass < 60; pass++) {
        const x = g.x;
        // spatial hash of segments by midpoint
        let maxLen = 0;
        for (let s = 0; s < g.S; s++) maxLen = Math.max(maxLen, g.segLength(s));
        const cell = 2 * maxLen + 1e-9;
        const grid = new Map();
        const keyOf = (i, j, k) => ((i + 4096) * 8192 + (j + 4096)) * 8192 + (k + 4096);
        for (let s = 0; s < g.S; s++) {
            const a = 3 * g.segA[s], b = 3 * g.segB[s];
            const kk = keyOf(Math.floor((x[a] + x[b]) / (2 * cell)), Math.floor((x[a + 1] + x[b + 1]) / (2 * cell)), Math.floor((x[a + 2] + x[b + 2]) / (2 * cell)));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(s);
        }
        // candidates: interior beads of edges with more than their target, straightest first
        const cands = [];
        g.edges.forEach((e, ei) => {
            const nd = e.nodes;
            if (nd.length - 1 <= target[ei]) return;
            for (let k = 1; k + 1 < nd.length; k++) {
                if (g.kind[nd[k]] !== KIND_BEAD) continue;
                // how far the bead must move to lie on the chord between its neighbours
                const i = 3 * nd[k - 1], j = 3 * nd[k], l = 3 * nd[k + 1];
                const cx_ = x[l] - x[i], cy_ = x[l + 1] - x[i + 1], cz_ = x[l + 2] - x[i + 2];
                const c2 = cx_ * cx_ + cy_ * cy_ + cz_ * cz_ || 1e-30;
                const t = ((x[j] - x[i]) * cx_ + (x[j + 1] - x[i + 1]) * cy_ + (x[j + 2] - x[i + 2]) * cz_) / c2;
                if (t <= 0.02 || t >= 0.98) continue;          // folded back: leave it
                const foot = [x[i] + t * cx_, x[i + 1] + t * cy_, x[i + 2] + t * cz_];
                const disp = Math.hypot(x[j] - foot[0], x[j + 1] - foot[1], x[j + 2] - foot[2]);
                cands.push({ ei, node: nd[k], disp, foot });
            }
        });
        if (!cands.length) break;
        cands.sort((p, q) => p.disp - q.disp);
        const touched = new Set(), dead = new Set();
        const segsLeft = g.edges.map(e => e.nodes.length - 1);
        const clearOf = (n0, n1, need) => {
            // is every segment sharing no bead with [n0, n1] farther than `need` from it?
            const a = 3 * n0, b = 3 * n1;
            const ci = Math.floor((x[a] + x[b]) / (2 * cell)), cj = Math.floor((x[a + 1] + x[b + 1]) / (2 * cell)), ck = Math.floor((x[a + 2] + x[b + 2]) / (2 * cell));
            const reach = 1;
            for (let di = -reach; di <= reach; di++) for (let dj = -reach; dj <= reach; dj++) for (let dk = -reach; dk <= reach; dk++) {
                const list = grid.get(keyOf(ci + di, cj + dj, ck + dk));
                if (!list) continue;
                for (const s of list) {
                    const c = g.segA[s], d = g.segB[s];
                    if (c === n0 || c === n1 || d === n0 || d === n1) continue;
                    if (segSegDist(x, n0, n1, c, d) < need) return false;
                }
            }
            return true;
        };
        let merged = 0;
        for (const c of cands) {
            if (segsLeft[c.ei] <= target[c.ei] || touched.has(c.node)) continue;
            const nd = g.edges[c.ei].nodes, k = nd.indexOf(c.node);
            const prev = nd[k - 1], next = nd[k + 1];
            if (touched.has(prev) || touched.has(next)) continue;
            const need = c.disp / guard;
            // a real corner: keep it. (need ≤ maxLen keeps every segment within need of this
            // one inside the neighbouring hash cells: midpoints differ by ≤ need + maxLen ≤ cell)
            if (need > 0.5 * cell) continue;
            if (!clearOf(prev, c.node, need) || !clearOf(c.node, next, need)) continue;
            // move the bead onto the chord (then dropping it changes nothing)
            const j = 3 * c.node;
            for (let q = 0; q < 3; q++) x[j + q] = c.foot[q];
            touched.add(prev); touched.add(next); touched.add(c.node);
            dead.add(c.node);
            segsLeft[c.ei]--;
            merged++;
        }
        if (!merged) break;
        for (const e of g.edges) e.nodes = e.nodes.filter(n => !dead.has(n));
        dropBeads(g, dead);
        g.rebuild();
    }
    return g;
}

/** Remove the given bead indices and renumber. */
function dropBeads(g, dead) {
    const map = new Int32Array(g.N).fill(-1);
    let n = 0;
    for (let i = 0; i < g.N; i++) if (!dead.has(i)) map[i] = n++;
    const X = new Float64Array(3 * n), K = new Uint8Array(n);
    for (let i = 0; i < g.N; i++) {
        const j = map[i];
        if (j < 0) continue;
        X[3 * j] = g.x[3 * i]; X[3 * j + 1] = g.x[3 * i + 1]; X[3 * j + 2] = g.x[3 * i + 2];
        K[j] = g.kind[i];
    }
    for (const e of g.edges) e.nodes = e.nodes.map(i => map[i]);
    g.vertexNodes = g.vertexNodes.map(i => map[i]);
    g.x = X; g.kind = K; g.N = n;
}

function nameEdges(g) {
    let arc = 0, circ = 0;
    for (const e of g.edges) e.name = e.circle ? `c${++circ}` : `e${++arc}`;
}

/** Give coincident straight edges (parallel bundles, bare loops) some waypoints so they separate. */
function bowBundles(verts, rawEdges) {
    const centroid = [0, 0, 0];
    for (const v of verts) for (let c = 0; c < 3; c++) centroid[c] += v.pos[c] / verts.length;
    const groups = new Map();
    rawEdges.forEach(e => {
        if (e.way.length) return;
        const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    });
    let scale = 0;
    for (const e of rawEdges) if (e.a !== e.b) scale = Math.max(scale, dist(verts[e.a].pos, verts[e.b].pos));
    scale = scale || 1.5;
    for (const list of groups.values()) {
        const e0 = list[0];
        const A = verts[e0.a].pos, B = verts[e0.b].pos;
        if (e0.a === e0.b) {
            // loops: petals pointing away from the centroid, rotated around it
            let out = sub(A, centroid);
            if (Math.hypot(...out) < 1e-6) out = [0, 0, 1];
            // each petal leans out along its own axis a_k and is flat across b_k ⟂ (u, w_k),
            // so two petals only share the vertex
            const u = normalize(out), [p, q] = perpBasis(u);
            const r = 0.45 * scale;
            const lean = list.length > 1 ? 0.8 : 0;
            list.forEach((e, k) => {
                const th = (2 * Math.PI * k) / list.length;
                const w = [0, 1, 2].map(c => Math.cos(th) * p[c] + Math.sin(th) * q[c]);
                const a = normalize([0, 1, 2].map(c => u[c] + lean * w[c]));
                const b = normalize([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
                const at = (s, t) => [0, 1, 2].map(c => A[c] + r * (s * a[c] + t * b[c]));
                e.way = [at(0.6, 0.45), at(1.3, 0.3), at(1.3, -0.3), at(0.6, -0.45)];
            });
            continue;
        }
        if (list.length < 2) continue;
        const ax = normalize(sub(B, A));
        const [p, q] = perpBasis(ax);
        const mid = [0, 1, 2].map(c => (A[c] + B[c]) / 2);
        const len = dist(A, B);
        list.forEach((e, k) => {
            const th = (2 * Math.PI * k) / list.length + 0.3;
            const off = [0, 1, 2].map(c => 0.35 * len * (Math.cos(th) * p[c] + Math.sin(th) * q[c]));
            const way = [mid.map((m, c) => m + off[c])];
            e.way = e.a === e0.a ? way : way.reverse();
        });
    }
}

function normalize(v) { const l = Math.hypot(...v) || 1; return v.map(c => c / l); }
function perpBasis(u) {
    const t = Math.abs(u[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    const p = normalize([u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]]);
    const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
    return [p, q];
}

// ---------------------------------------------------------------- named graphs

/** Edge lists for a few named families; returns { n, E } or null. */
export function namedGraph(name) {
    const s = name.trim().toLowerCase().replace(/\s+/g, '');
    let m;
    const range = n => [...Array(n).keys()];
    if ((m = s.match(/^k(\d+)$/))) {
        const n = +m[1]; const E = [];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([i, j]);
        return { n, E };
    }
    if ((m = s.match(/^k(\d+),(\d+)$/))) {
        const a = +m[1], b = +m[2]; const E = [];
        for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) E.push([i, a + j]);
        return { n: a + b, E };
    }
    if ((m = s.match(/^c(\d+)$/))) { const n = +m[1]; return { n, E: range(n).map(i => [i, (i + 1) % n]) }; }
    if ((m = s.match(/^w(\d+)$/))) {
        const n = +m[1]; const E = range(n).map(i => [i, (i + 1) % n]);
        range(n).forEach(i => E.push([i, n]));
        return { n: n + 1, E };
    }
    if ((m = s.match(/^theta(\d*)$/))) { const k = +(m[1] || 3); return { n: 2, E: range(k).map(() => [0, 1]) }; }
    if ((m = s.match(/^bouquet(\d*)$/))) { const k = +(m[1] || 2); return { n: 1, E: range(k).map(() => [0, 0]) }; }
    if (s === 'handcuff') return { n: 2, E: [[0, 0], [0, 1], [1, 1]] };
    if (s === 'petersen') {
        const E = [];
        for (let i = 0; i < 5; i++) { E.push([i, (i + 1) % 5]); E.push([i, i + 5]); E.push([5 + i, 5 + ((i + 2) % 5)]); }
        return { n: 10, E };
    }
    if ((m = s.match(/^prism(\d+)$/))) {
        const n = +m[1]; const E = [];
        for (let i = 0; i < n; i++) { E.push([i, (i + 1) % n]); E.push([n + i, n + ((i + 1) % n)]); E.push([i, n + i]); }
        return { n: 2 * n, E };
    }
    if ((m = s.match(/^mobius(\d+)$/))) {
        // Möbius ladder with k rungs: a 2k-cycle plus its long diagonals
        const k = +m[1], n = 2 * k; const E = [];
        for (let i = 0; i < n; i++) E.push([i, (i + 1) % n]);
        for (let i = 0; i < k; i++) E.push([i, i + k]);
        return { n, E };
    }
    if (s === 'cube' || s === 'q3') {
        const E = [];
        for (let i = 0; i < 8; i++) for (let b = 0; b < 3; b++) { const j = i ^ (1 << b); if (i < j) E.push([i, j]); }
        return { n: 8, E };
    }
    if (s === 'octahedron') {
        const E = [];
        for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if ((i >> 1) !== (j >> 1)) E.push([i, j]);
        return { n: 6, E };
    }
    if (s === 'dodecahedron') {
        // two pentagons, a 10-cycle between them
        const E = [];
        for (let i = 0; i < 5; i++) {
            E.push([i, (i + 1) % 5]);                    // inner pentagon 0..4
            E.push([i, 5 + 2 * i]);                      // spokes to the middle ring 5..14
            E.push([15 + i, 15 + ((i + 1) % 5)]);        // outer pentagon 15..19
            E.push([6 + 2 * i, 15 + i]);
        }
        for (let i = 0; i < 10; i++) E.push([5 + i, 5 + ((i + 1) % 10)]);
        return { n: 20, E };
    }
    if (s === 'heawood') {
        const E = [];
        for (let i = 0; i < 14; i++) E.push([i, (i + 1) % 14]);
        for (let i = 0; i < 14; i += 2) E.push([i, (i + 5) % 14]);
        return { n: 14, E };
    }
    return null;
}

// ---------------------------------------------------------------- text format

export const TEXT_HELP = `# one item per line; # starts a comment
vertex A 0 0 0          # a vertex (omit x y z for an automatic layout)
edge A B                # a straight-ish edge from A to B
edge A B : 1 1 0, 2 0 1 # …through waypoints
circle 1 0 0, 0 1 0.3, -1 0 0, 0 -1 -0.3   # a closed curve, no vertex
A-B B-C C-A             # shorthand edges
graph K5                # Kn, Km,n, Cn, Wn, petersen, cube, prism5, mobius4, theta3, …
layout random 7         # random | moment | spectral, then a seed`;

export function parseText(text) {
    const spec = { vertices: [], edges: [], circles: [], layout: 'random', seed: 1 };
    const vIndex = new Map();
    const ensureV = id => {
        if (!vIndex.has(id)) { vIndex.set(id, spec.vertices.length); spec.vertices.push({ id, pos: null }); }
        return spec.vertices[vIndex.get(id)];
    };
    const parsePts = (s, line) => s.split(/[,;]/).map(t => t.trim()).filter(Boolean).map(t => {
        const nums = t.split(/\s+/).map(Number);
        if (nums.length !== 3 || nums.some(x => !Number.isFinite(x))) throw new Error(`line ${line}: “${t}” is not a point x y z`);
        return nums;
    });
    text.split('\n').forEach((raw, i) => {
        const line = i + 1;
        const s = raw.replace(/#.*/, '').trim();
        if (!s) return;
        const [head, ...rest] = s.split(/\s+/);
        const h = head.toLowerCase();
        if (h === 'vertex' || h === 'v') {
            if (!rest.length) throw new Error(`line ${line}: vertex needs a name`);
            if (/[:,]/.test(rest[0])) throw new Error(`line ${line}: a vertex name cannot contain “:” or “,”`);
            const v = ensureV(rest[0]);
            if (rest.length >= 4) {
                const p = rest.slice(1, 4).map(Number);
                if (p.some(x => !Number.isFinite(x))) throw new Error(`line ${line}: bad coordinates`);
                v.pos = p;
            }
        } else if (h === 'edge' || h === 'e') {
            const [lhs, rhs] = s.slice(head.length).split(':');
            const ids = lhs.trim().split(/\s+/);
            if (ids.length !== 2) throw new Error(`line ${line}: edge needs two vertex names`);
            ensureV(ids[0]); ensureV(ids[1]);
            spec.edges.push({ a: ids[0], b: ids[1], way: rhs ? parsePts(rhs, line) : [] });
        } else if (h === 'circle' || h === 'c') {
            const pts = parsePts(s.slice(head.length), line);
            if (pts.length < 3) throw new Error(`line ${line}: a circle needs at least 3 points`);
            spec.circles.push({ way: pts });
        } else if (h === 'graph') {
            const g = namedGraph(rest.join(''));
            if (!g) throw new Error(`line ${line}: unknown graph “${rest.join(' ')}”`);
            const base = spec.vertices.length;
            for (let k = 0; k < g.n; k++) ensureV(String(base + k));
            for (const [a, b] of g.E) spec.edges.push({ a: String(base + a), b: String(base + b), way: [] });
        } else if (h === 'layout') {
            if (rest[0]) spec.layout = rest[0].toLowerCase();
            if (rest[1]) spec.seed = +rest[1] || 1;
        } else if (h === 'name') {
            spec.name = rest.join(' ');
        } else if (/^[^\s-]+-[^\s-]+$/.test(head)) {
            for (const tok of s.split(/\s+/)) {
                const mm = tok.match(/^([^\s-]+)-([^\s-]+)$/);
                if (!mm) throw new Error(`line ${line}: “${tok}” is not an edge like A-B`);
                ensureV(mm[1]); ensureV(mm[2]);
                spec.edges.push({ a: mm[1], b: mm[2], way: [] });
            }
        } else {
            throw new Error(`line ${line}: don't know “${head}”`);
        }
    });
    if (!spec.edges.length && !spec.circles.length) throw new Error('No edges or circles.');
    return spec;
}

/** Current embedding → text (dense waypoints, so it reloads to the same shape). */
export function graphToText(g) {
    const f = v => (Math.abs(v) < 5e-5 ? '0' : v.toFixed(4).replace(/\.?0+$/, ''));
    const P = n => `${f(g.x[3 * n])} ${f(g.x[3 * n + 1])} ${f(g.x[3 * n + 2])}`;
    const lines = [];
    if (g.name) lines.push(`name ${g.name}`);
    g.vertexNodes.forEach((n, v) => lines.push(`vertex ${g.vertexNames[v]} ${P(n)}`));
    for (const e of g.edges) {
        const nd = e.nodes;
        const step = Math.max(1, Math.floor(nd.length / 40));
        if (e.circle) {
            const pts = [];
            for (let k = 0; k < nd.length - 1; k += step) pts.push(P(nd[k]));
            lines.push(`circle ${pts.join(', ')}`);
        } else {
            const pts = [];
            for (let k = step; k < nd.length - 1; k += step) pts.push(P(nd[k]));
            lines.push(`edge ${g.vertexNames[e.a]} ${g.vertexNames[e.b]}${pts.length ? ' : ' + pts.join(', ') : ''}`);
        }
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------- distances

/** Distance between segments [a,b] and [c,d] (node indices into x). */
export function segSegDist(x, a, b, c, d) {
    return segSegClosest(x, a, b, c, d)[0];
}

/** [distance, s, t, px−qx, py−qy, pz−qz]: closest points p = a + s(b−a), q = c + t(d−c). */
export function segSegClosest(x, a, b, c, d) {
    a *= 3; b *= 3; c *= 3; d *= 3;
    const d1x = x[b] - x[a], d1y = x[b + 1] - x[a + 1], d1z = x[b + 2] - x[a + 2];
    const d2x = x[d] - x[c], d2y = x[d + 1] - x[c + 1], d2z = x[d + 2] - x[c + 2];
    const rx = x[a] - x[c], ry = x[a + 1] - x[c + 1], rz = x[a + 2] - x[c + 2];
    const A = d1x * d1x + d1y * d1y + d1z * d1z;
    const E = d2x * d2x + d2y * d2y + d2z * d2z;
    const F = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    if (A <= 1e-18 && E <= 1e-18) { s = t = 0; }
    else if (A <= 1e-18) { s = 0; t = clamp01(F / E); }
    else {
        const C = d1x * rx + d1y * ry + d1z * rz;
        if (E <= 1e-18) { t = 0; s = clamp01(-C / A); }
        else {
            const B = d1x * d2x + d1y * d2y + d1z * d2z;
            const den = A * E - B * B;
            s = den > 1e-18 ? clamp01((B * F - C * E) / den) : 0;
            t = (B * s + F) / E;
            if (t < 0) { t = 0; s = clamp01(-C / A); }
            else if (t > 1) { t = 1; s = clamp01((B - C) / A); }
        }
    }
    const px = x[a] + d1x * s - (x[c] + d2x * t);
    const py = x[a + 1] + d1y * s - (x[c + 1] + d2y * t);
    const pz = x[a + 2] + d1z * s - (x[c + 2] + d2z * t);
    return [Math.hypot(px, py, pz), s, t, px, py, pz];
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
