// fold_data.mjs — the diagram data behind the Fold view: how a knot's planar diagram is laid
// out, and how the 3D knot relaxes out of it. Writes js/foldData.js.
//
// For each alternating knot in FOLD_IDS this records, in the coordinates of tools/knot_curves.mjs
// (the knot normalized to length 30, centered):
//   visits    the signed Gauss code: [type 'O'|'U', crossing index, sign] in knot order
//   crossings planar positions of the crossings
//   edges     edge k runs from visit k to visit k+1: its planar polyline (crossing, two
//             subdivision points, crossing)
//   faces     the regions, as cycles of darts (2k = edge k forwards, 2k+1 backwards) with the
//             region on the right, the Tutte center of each bounded region, and which is outer
//   knot      the knot polygon of Knot Energy's Gauss-code layout, the edge each sample lies on,
//             and snapshots of the Möbius-energy relaxation (the same run as knot_curves.mjs)
//
// The layout is Knot Energy's (topology/knotTheory/knotEnergy/js/knots.js): signs fix the cyclic
// order at each crossing, the planar map is drawn by Tutte's barycentric method, and the over-
// and under-strands are lifted to ±0.6. It is reproduced here so that its internals are kept.
//
// Usage:  node tools/fold_data.mjs [--fresh]      (after make_census.py and knot_curves.mjs)
//         python3 tools/menasco_shapes.py         (SnapPy: check each triangulation, solve for its shapes)
//         node tools/fold_data.mjs                (again, to embed the shapes; layouts are cached)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../vendor/three/three.module.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KE = path.resolve(HERE, '../../../../../../topology/knotTheory/knotEnergy/js');
const FOLD_IDS = ['4_1', '5_2', '6_1', '6_2', '6_3', '7_2', '7_3', '7_4'];
const SNAP_STEPS = [0, 3, 8, 16, 30, 55, 100, 170, 280, 450, 700, 1050, 1500, 2200];

const ctx = { THREE, window: {}, console, Math, Float64Array, Int32Array, Uint8Array, Array, Map, Set, Error };
vm.createContext(ctx);
for (const f of ['knots.js', 'physics.js']) {
    vm.runInContext(fs.readFileSync(path.join(KE, f), 'utf8') + '\n;globalThis.KnotChain = typeof KnotChain !== "undefined" ? KnotChain : globalThis.KnotChain;', ctx, { filename: f });
}
const { parseGaussCode, gaussSigns, gaussFaces, KnotChain } = ctx;
const TAU = 2 * Math.PI;

/** Knot Energy's gaussToPolygon, keeping the layout it computes along the way. */
function layout(text, samplesPerArc = 26, lift = 0.6, radius = 4) {
    const visits = parseGaussCode(text);
    const M = visits.length;
    const index = new Map();
    const cross = visits.map((v) => { if (!index.has(v.crossing)) index.set(v.crossing, index.size); return index.get(v.crossing); });
    const n = index.size;
    const signs = gaussSigns(visits, cross, n);
    const faces = gaussFaces(visits, cross, signs);
    const walks = faces.map((face) => face.flatMap((d) => {
        const k = d >> 1, a = n + 2 * k;
        return d & 1 ? [cross[(k + 1) % M], a + 1, a] : [cross[k], a, a + 1];
    }));
    const isSimple = (w) => new Set(w).size === w.length;
    let outer = -1;
    walks.forEach((w, i) => { if (isSimple(w) && (outer < 0 || w.length > walks[outer].length)) outer = i; });
    let V = n + 2 * M;
    const adj = [];
    const link = (u, v) => { (adj[u] = adj[u] || new Set()).add(v); (adj[v] = adj[v] || new Set()).add(u); };
    for (let k = 0; k < M; k++) { const a = n + 2 * k; link(cross[k], a); link(a, a + 1); link(a + 1, cross[(k + 1) % M]); }
    const centreOf = new Array(walks.length).fill(-1);
    walks.forEach((w, i) => {
        if (i === outer) return;
        const centre = V++;
        centreOf[i] = centre;
        if (isSimple(w)) { for (const u of w) link(centre, u); return; }
        const ring = w.map(() => V++), L = w.length;
        w.forEach((u, j) => { link(ring[j], u); link(ring[j], w[(j + 1) % L]); link(ring[j], ring[(j + 1) % L]); link(ring[j], centre); });
    });
    const X = new Float64Array(V), Y = new Float64Array(V);
    const slot = new Int32Array(V).fill(-1);
    const wo = walks[outer];
    wo.forEach((u, j) => { const t = (j / wo.length) * TAU; X[u] = radius * Math.cos(t); Y[u] = radius * Math.sin(t); });
    const onCircle = new Set(wo), free = [];
    for (let u = 0; u < V; u++) if (!onCircle.has(u)) { slot[u] = free.length; free.push(u); }
    const m = free.length;
    const A = free.map(() => new Float64Array(m));
    const bx = new Float64Array(m), by = new Float64Array(m);
    free.forEach((u, r) => {
        A[r][r] = adj[u].size;
        for (const v of adj[u]) { if (slot[v] < 0) { bx[r] += X[v]; by[r] += Y[v]; } else A[r][slot[v]] -= 1; }
    });
    for (let p = 0; p < m; p++) for (let r = p + 1; r < m; r++) {
        const f = A[r][p] / A[p][p];
        if (f === 0) continue;
        for (let c = p; c < m; c++) A[r][c] -= f * A[p][c];
        bx[r] -= f * bx[p]; by[r] -= f * by[p];
    }
    for (let p = m - 1; p >= 0; p--) {
        let sx = bx[p], sy = by[p];
        for (let c = p + 1; c < m; c++) { sx -= A[p][c] * bx[c]; sy -= A[p][c] * by[c]; }
        bx[p] = sx / A[p][p]; by[p] = sy / A[p][p];
    }
    free.forEach((u, r) => { X[u] = bx[r]; Y[u] = by[r]; });
    // the knot polygon, exactly as gaussToPolygon makes it, remembering the edge of every sample
    const poly = [], polyEdge = [];
    for (let k = 0; k < M; k++) {
        const k1 = (k + 1) % M, a = n + 2 * k;
        const ids = [cross[k], a, a + 1, cross[k1]];
        const z0 = visits[k].type === 'O' ? lift : -lift;
        const z1 = visits[k1].type === 'O' ? lift : -lift;
        const seg = [1, 2, 3].map((q) => Math.hypot(X[ids[q]] - X[ids[q - 1]], Y[ids[q]] - Y[ids[q - 1]]));
        const tot = seg[0] + seg[1] + seg[2] + 1e-12;
        let s = 0;
        for (let q = 0; q < 3; q++) {
            poly.push(new THREE.Vector3(X[ids[q]], Y[ids[q]], z0 + (z1 - z0) * s / tot));
            polyEdge.push(k);
            s += seg[q];
        }
    }
    const P = poly.length, total = M * samplesPerArc;
    let len = 0;
    for (let i = 0; i < P; i++) len += poly[i].distanceTo(poly[(i + 1) % P]);
    const pts = [], edgeOf = [];
    for (let i = 0; i < P; i++) {
        const p = poly[i], q = poly[(i + 1) % P];
        const cnt = Math.max(1, Math.round(total * p.distanceTo(q) / len));
        for (let j = 0; j < cnt; j++) { pts.push(p.clone().lerp(q, j / cnt)); edgeOf.push(polyEdge[i]); }
    }
    return { visits, cross, signs, faces, outer, n, M, X, Y, centreOf, pts, edgeOf };
}

const census = JSON.parse(fs.readFileSync(path.join(HERE, 'census.json'), 'utf8'));
const CACHE = path.join(HERE, 'fold_cache.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* first run */ }
const fresh = process.argv.includes('--fresh');
const out = {};
for (const id of FOLD_IDS) {
    const e = census.find((x) => x.id === id);
    if (!fresh && cache[id] && cache[id].gauss === e.gauss) { out[id] = cache[id]; console.error(`${id}: cached`); continue; }
    const L = layout(e.gauss);
    // normalize as knot_curves.mjs does: center the polygon, scale it to length 30
    const N = L.pts.length;
    let len = 0;
    const c = new THREE.Vector3();
    for (let i = 0; i < N; i++) { len += L.pts[i].distanceTo(L.pts[(i + 1) % N]); c.add(L.pts[i]); }
    c.multiplyScalar(1 / N);
    const s = 30 / len;
    const P2 = (u) => [+((L.X[u] - c.x) * s).toFixed(5), +((L.Y[u] - c.y) * s).toFixed(5)];
    const start = L.pts.map((p) => p.clone().sub(c).multiplyScalar(s));
    // relax, recording snapshots
    const chain = new KnotChain(start);
    chain.params.kRepel = 1.6; chain.params.kSpring = 6.0; chain.params.kTube = 8.0;
    chain.setTubeRadius(0.3);
    const steps = 1600 + 150 * e.crossings;
    const snaps = [];
    const snapAt = new Set(SNAP_STEPS.filter((k) => k < steps).concat([steps]));
    for (let k = 0; k <= steps; k++) {
        if (snapAt.has(k)) snaps.push({ step: k, pts: chain.points.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]) });
        if (k < steps) chain.step();
    }
    out[id] = {
        id, gauss: e.gauss,
        visits: L.visits.map((v, k) => [v.type, L.cross[k], L.signs[L.cross[k]]]),
        crossings: Array.from({ length: L.n }, (_, i) => P2(i)),
        edges: Array.from({ length: L.M }, (_, k) => {
            const a = L.n + 2 * k;
            return { from: L.cross[k], to: L.cross[(k + 1) % L.M], poly: [P2(L.cross[k]), P2(a), P2(a + 1), P2(L.cross[(k + 1) % L.M])] };
        }),
        faces: L.faces.map((darts, i) => ({ darts, centre: L.centreOf[i] >= 0 ? P2(L.centreOf[i]) : null, outer: i === L.outer })),
        lift: +(0.6 * s).toFixed(5),
        knot: { edgeOf: L.edgeOf, snapshots: snaps },
    };
    cache[id] = out[id];
    console.error(`${id}: ${L.n} crossings, ${L.faces.length} regions, ${N} samples, ${snaps.length} snapshots`);
}
fs.writeFileSync(CACHE, JSON.stringify(cache));

// the diagram's ideal triangulation (js/menasco.js), and its shapes from tools/menasco_shapes.py
const { diagram, menascoTriangulation } = await import('../js/menasco.js');
const tris = {};
let shapes = {};
try { shapes = JSON.parse(fs.readFileSync(path.join(HERE, 'menasco_shapes.json'), 'utf8')); } catch { /* not yet */ }
let missing = 0;
for (const id of FOLD_IDS) {
    const T = menascoTriangulation(diagram(out[id]));
    const gluing = T.tets.map((t) => ({ nbr: t.nbr, glu: t.glu }));
    tris[id] = gluing;
    const sh = shapes[id];
    if (sh && JSON.stringify(sh.gluing) === JSON.stringify(gluing)) out[id].shapes = sh.shapes;
    else { missing++; delete out[id].shapes; }
    console.error(`${id}: ${T.tets.length} tetrahedra (${T.flips} flips)${out[id].shapes ? '' : ' — no shapes yet'}`);
}
fs.writeFileSync(path.join(HERE, 'menasco_tris.json'), JSON.stringify(tris));
const banner = `// foldData.js — generated by tools/fold_data.mjs (and tools/menasco_shapes.py): the planar diagram of each\n// alternating knot (Knot Energy's Gauss-code layout), snapshots of its relaxation into the 3D knot, and the\n// complete hyperbolic shapes of the ideal triangulation that js/menasco.js builds from the diagram.\n`;
fs.writeFileSync(path.join(HERE, '..', 'js', 'foldData.js'), banner + 'export const FOLD = ' + JSON.stringify(out) + ';\n');
console.error(`wrote js/foldData.js${missing ? ` — run python3 tools/menasco_shapes.py, then this script again, for ${missing} missing shape sets` : ''}`);
