// ────────────────────────────────────────────────────────────────
//  analysis.js — combinatorics of a finite hat patch
//
//  Everything the tour needs to know about the patch: which hats
//  touch, the distinct ways two hats can meet (and the ones that fit
//  but never occur), the distinct first coronas, the supertile
//  hierarchy, near-periods, and the (A, B) edge decomposition that
//  lets the whole tiling morph through the Tile(a, b) family.
// ────────────────────────────────────────────────────────────────

const LABELS = ['H1', 'H', 'T', 'P', 'F'];
const KINDS = ['H', 'T', 'P', 'F'];

// Hat outline with the length-2 side split, so the tiling is edge-to-edge.
const HAT14 = [
    hat_outline[0], hat_outline[1], hat_outline[2],
    pt((hat_outline[2].x + hat_outline[3].x) / 2, (hat_outline[2].y + hat_outline[3].y) / 2),
    ...hat_outline.slice(3)
];
// 1 for unit edges, 0 for √3 edges (edge i runs from vertex i to i+1).
const HAT_EDGE_UNIT = HAT14.map((p, i) => {
    const q = HAT14[(i + 1) % 14];
    return mag(q.x - p.x, q.y - p.y) < 1.5 ? 1 : 0;
});
// Partial sums of unit edges (aVec) and √3 edges (bVec): HAT14[i] = aVec[i] + bVec[i].
const HAT_AVEC = [], HAT_BVEC = [];
(() => {
    let a = pt(0, 0), b = pt(0, 0);
    for (let i = 0; i < 14; i++) {
        HAT_AVEC.push(a); HAT_BVEC.push(b);
        const e = psub(HAT14[(i + 1) % 14], HAT14[i]);
        if (HAT_EDGE_UNIT[i]) a = padd(a, e); else b = padd(b, e);
    }
})();

// The 8 kites of the canonical hat: [hex centre x, y, direction k].
// Hex centres of the kite grid sit on the lattice spanned by (3, √3), (0, 2√3).
const HAT_KITES = [[0, 0, 0], [0, 0, 1], [0, 0, 4], [0, 0, 5],
                   [3, -2 * hr3, 1], [3, -2 * hr3, 2], [3, 2 * hr3, 3], [3, 2 * hr3, 4]];
function kitePoly(cx, cy, k) {
    const a = PI / 3 * k, r3 = sqrt(3), d = PI / 6;
    return [pt(cx, cy),
            pt(cx + r3 * cos(a - d), cy + r3 * sin(a - d)),
            pt(cx + 2 * cos(a), cy + 2 * sin(a)),
            pt(cx + r3 * cos(a + d), cy + r3 * sin(a + d))];
}
const HAT_KITE_POLYS = HAT_KITES.map(([x, y, k]) => kitePoly(x, y, k));
const HAT_KITE_CENTROIDS = HAT_KITE_POLYS.map(P =>
    pt((P[0].x + P[1].x + P[2].x + P[3].x) / 4, (P[0].y + P[1].y + P[2].y + P[3].y) / 4));

function polyCentroid(P) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        const c = p.x * q.y - q.x * p.y;
        A += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
    }
    return pt(cx / (3 * A), cy / (3 * A));
}
function polyArea(P) {
    let A = 0;
    for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        A += p.x * q.y - q.x * p.y;
    }
    return A / 2;
}
const HAT_CENTROID = polyCentroid(HAT14);
const HAT_AREA = polyArea(HAT14);

// Tile(a, b) outline, with unit edges scaled by α and √3 edges by β
// (the hat is α = β = 1; the paper's Tile(a, b) is α = a, β = b/√3).
function tileShape(alpha, beta) {
    return HAT14.map((_, i) => pt(alpha * HAT_AVEC[i].x + beta * HAT_BVEC[i].x,
                                  alpha * HAT_AVEC[i].y + beta * HAT_BVEC[i].y));
}

const keyPt = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
const detOf = T => T[0] * T[4] - T[1] * T[3];
// Tiling vertices lie on the lattice ½·hexPt(ℤ²); pack them into integers.
const latKey = (x, y) => (Math.round(4 * x) + 2048) * 4096 + Math.round(4 * y / sqrt(3)) + 2048;
// A placement relative to the canonical hat: orientation + translation.
function relKey(T) {
    const r = ((Math.round(Math.atan2(T[3], T[0]) / (PI / 3)) % 6) + 6) % 6;
    const o = r + (detOf(T) < 0 ? 6 : 0);
    return (o * 4096 + Math.round(2 * T[2]) + 2048) * 4096 + Math.round(T[5] / hr3) + 2048;
}

// ── Build and analyse a patch ─────────────────────────────────
function analyzePatch(level) {
    const tiles = buildTiling(level);
    const root = tiles[0];

    // Walk the hierarchy, remembering each hat's ancestors.
    const hats = [];
    const levels = [];            // levels[k] = supertiles of level k (1 … level)
    for (let k = 0; k <= level; k++) levels.push([]);
    const path = new Array(level + 1).fill(-1);
    (function walk(geom, T, lev) {
        if (geom instanceof HatTile) {
            hats.push({ label: geom.label, T, anc: path.slice() });
            return;
        }
        const id = levels[lev].length;
        levels[lev].push({ kind: geom.kind, shape: geom.shape.map(p => transPt(T, p)), hats: [] });
        path[lev] = id;
        for (const ch of geom.children) walk(ch.geom, mul(T, ch.T), lev - 1);
    })(root, ident, level);

    const n = hats.length;
    const verts = new Float64Array(n * 28);
    const cx = new Float64Array(n), cy = new Float64Array(n);
    const labelIdx = new Uint8Array(n), refl = new Uint8Array(n), rot = new Uint8Array(n), code = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
        const h = hats[i], T = h.T;
        for (let v = 0; v < 14; v++) {
            const p = transPt(T, HAT14[v]);
            verts[i * 28 + v * 2] = p.x; verts[i * 28 + v * 2 + 1] = p.y;
        }
        const c = transPt(T, HAT_CENTROID);
        cx[i] = c.x; cy[i] = c.y;
        labelIdx[i] = LABELS.indexOf(h.label);
        refl[i] = detOf(T) < 0 ? 1 : 0;
        rot[i] = ((Math.round(Math.atan2(T[3], T[0]) / (PI / 3)) % 6) + 6) % 6;
        code[i] = rot[i] + 6 * refl[i];
        for (let k = 1; k <= level; k++) levels[k][h.anc[k]].hats.push(i);
    }
    for (let k = 1; k <= level; k++) for (const s of levels[k]) {
        const c = polyCentroid(s.shape);
        s.cx = c.x; s.cy = c.y;
    }

    // Vertex and edge incidence. Interior edges are met exactly twice.
    const vertHats = new Map();   // vertex key → [hat, …]
    const openEdge = new Map();   // edge key → the one hat seen so far
    const neighbors = Array.from({ length: n }, () => []);
    const touching = Array.from({ length: n }, () => []);
    const link = (L, a, b) => { if (!L[a].includes(b)) L[a].push(b); };
    const vkey = (i, v) => latKey(verts[i * 28 + v * 2], verts[i * 28 + v * 2 + 1]);
    for (let i = 0; i < n; i++) {
        const ks = [];
        for (let v = 0; v < 14; v++) ks.push(vkey(i, v));
        for (let v = 0; v < 14; v++) {
            const a = ks[v], b = ks[(v + 1) % 14];
            const ek = a < b ? a * 16777216 + b : b * 16777216 + a;
            const j = openEdge.get(ek);
            if (j === undefined) openEdge.set(ek, i);
            else { openEdge.delete(ek); link(neighbors, i, j); link(neighbors, j, i); }
            const vh = vertHats.get(a);
            if (vh) vh.push(i); else vertHats.set(a, [i]);
        }
    }
    const boundary = new Uint8Array(n);
    for (const i of openEdge.values()) boundary[i] = 1;
    for (const hs of vertHats.values())
        for (const a of hs) for (const b of hs) if (a !== b) link(touching, a, b);

    // Depth from the patch boundary (hats with a free edge are depth 0).
    const depth = new Int32Array(n).fill(-1);
    let frontier = [];
    for (let i = 0; i < n; i++) if (boundary[i]) { depth[i] = 0; frontier.push(i); }
    while (frontier.length) {
        const next = [];
        for (const i of frontier) for (const j of touching[i])
            if (depth[j] < 0) { depth[j] = depth[i] + 1; next.push(j); }
        frontier = next;
    }

    // Relative placement of hat j in hat i's frame, in canonical units.
    const invT = hats.map(h => inv(h.T));
    const rel = (i, j) => mul(invT[i], hats[j].T);

    // Distinct ways two hats share an edge.
    const pairMap = new Map();
    for (let i = 0; i < n; i++) {
        if (depth[i] < 1) continue;
        for (const j of neighbors[i]) {
            const R = rel(i, j), k = relKey(R);
            if (!pairMap.has(k)) pairMap.set(k, { rel: R, key: k, count: 0, refl: detOf(R) < 0 });
            pairMap.get(k).count++;
        }
    }
    const pairs = [...pairMap.values()].sort((a, b) => b.count - a.count);

    // Distinct first coronas (every hat touching the centre hat).
    const coronaMap = new Map();
    const coronaType = new Int32Array(n).fill(-1);
    const coronaKeys = new Array(n);
    for (let i = 0; i < n; i++) {
        if (depth[i] < 2) continue;
        const ks = touching[i].map(j => relKey(rel(i, j))).sort();
        const k = ks.join(';');
        coronaKeys[i] = k;
        if (!coronaMap.has(k)) coronaMap.set(k, {
            key: k, count: 0, rep: i,
            rels: touching[i].map(j => rel(i, j)), labels: touching[i].map(j => labelIdx[j])
        });
        coronaMap.get(k).count++;
    }
    const coronas = [...coronaMap.values()].sort((a, b) => b.count - a.count);
    coronas.forEach((c, id) => { c.id = id; });
    for (let i = 0; i < n; i++) if (coronaKeys[i]) coronaType[i] = coronaMap.get(coronaKeys[i]).id;

    // A chain of nested H supertiles, root → level 1: of all such chains, the one
    // whose innermost H lies nearest the middle of the patch. It is the zoom of the
    // Fibonacci chapter, and its innermost hat is the centre of the whole tour.
    for (let k = 1; k < level; k++) for (const s of levels[k]) {
        s.parent = hats[s.hats[0]].anc[k + 1];
        (levels[k + 1][s.parent].kids ||= []).push(levels[k].indexOf(s));
    }
    const mid = levels[level][0];
    let chain = [0], chainD = Infinity;
    (function descend(k, path) {
        if (k === 0) {
            const s = levels[1][path[path.length - 1]];
            const d = mag(s.cx - mid.cx, s.cy - mid.cy);
            if (d < chainD) { chainD = d; chain = path.slice(); }
            return;
        }
        for (const id of levels[k + 1][path[path.length - 1]].kids || [])
            if (levels[k][id].kind === 'H') descend(k - 1, [...path, id]);
    })(level - 1, [0]);
    // The innermost chain hat (Fibonacci zoom target), and the tour's centre:
    // the unreflected hat farthest from the patch boundary, so views stay covered.
    let chainHat = -1, best = Infinity;
    const inner = levels[1][chain[chain.length - 1]];
    for (const i of inner.hats) {
        const d = mag(cx[i] - inner.cx, cy[i] - inner.cy);
        if (!refl[i] && d < best) { best = d; chainHat = i; }
    }
    let center = 0;
    best = -Infinity;
    for (let i = 0; i < n; i++) {
        if (refl[i]) continue;
        const score = depth[i] - 1e-3 * mag(cx[i] - mid.cx, cy[i] - mid.cy);
        if (score > best) { best = score; center = i; }
    }
    const dist = new Float64Array(n);
    for (let i = 0; i < n; i++) dist[i] = mag(cx[i] - cx[center], cy[i] - cy[center]);

    // Hats in edge-graph BFS order from the centre (for growth).
    const hop = new Int32Array(n).fill(-1);
    hop[center] = 0;
    frontier = [center];
    while (frontier.length) {
        const next = [];
        for (const i of frontier) for (const j of neighbors[i])
            if (hop[j] < 0) { hop[j] = hop[i] + 1; next.push(j); }
        frontier = next;
    }

    // Tile(a, b) morph: split each hat's anchor into unit-edge and √3-edge parts
    // by walking shared vertices outward from the centre.
    const A = new Float64Array(2 * n), B = new Float64Array(2 * n);
    const known = new Uint8Array(n);
    const vertAB = new Map();
    const lin = (T, p) => pt(T[0] * p.x + T[1] * p.y, T[3] * p.x + T[4] * p.y);
    let morphConflicts = 0;
    const settle = i => {
        const T = hats[i].T;
        for (let v = 0; v < 14; v++) {
            const a = lin(T, HAT_AVEC[v]), b = lin(T, HAT_BVEC[v]);
            const ab = [A[2 * i] + a.x, A[2 * i + 1] + a.y, B[2 * i] + b.x, B[2 * i + 1] + b.y];
            const k = vkey(i, v);
            const old = vertAB.get(k);
            if (!old) vertAB.set(k, ab);
            else if (Math.abs(old[0] - ab[0]) + Math.abs(old[1] - ab[1]) > 1e-6) morphConflicts++;
        }
    };
    known[center] = 1;
    settle(center);
    const queue = [center];
    for (let q = 0; q < queue.length; q++) {
        const i = queue[q];
        for (const j of touching[i]) {
            if (known[j]) continue;
            const T = hats[j].T;
            for (let v = 0; v < 14; v++) {
                const ab = vertAB.get(vkey(j, v));
                if (!ab) continue;
                const a = lin(T, HAT_AVEC[v]), b = lin(T, HAT_BVEC[v]);
                A[2 * j] = ab[0] - a.x; A[2 * j + 1] = ab[1] - a.y;
                B[2 * j] = ab[2] - b.x; B[2 * j + 1] = ab[3] - b.y;
                break;
            }
            known[j] = 1;
            settle(j);
            queue.push(j);
        }
    }

    return {
        level, n, hats, verts, cx, cy, labelIdx, refl, rot, code,
        neighbors, touching, boundary, depth, pairs, coronas, coronaType,
        center, chainHat, dist, hop, A, B, morphConflicts, levels, chain,
        fits: enumerateFits(pairMap),
        nearPeriods: findNearPeriods(hats, cx, cy, code, center)
    };
}

// ── Every way a second hat can sit against the canonical hat ──
// on the kite grid without overlapping it; tagged legal if that
// placement actually occurs in the tiling.
function enumerateFits(pairMap) {
    const kiteKey = p => keyPt(p.x, p.y);
    const own = new Set(HAT_KITE_CENTROIDS.map(kiteKey));
    // Kite centroids of the grid near the hat, to test grid alignment.
    const grid = new Set();
    for (let m = -8; m <= 8; m++) for (let q = -8; q <= 8; q++) {
        const hx = 3 * m, hy = 2 * hr3 * m + 4 * hr3 * q;
        for (let k = 0; k < 6; k++) {
            const P = kitePoly(hx, hy, k);
            grid.add(keyPt((P[0].x + P[1].x + P[2].x + P[3].x) / 4, (P[0].y + P[1].y + P[2].y + P[3].y) / 4));
        }
    }
    const seen = new Map();
    for (const F of [ident, [1, 0, 0, 0, -1, 0]]) {
        const shape = HAT14.map(p => transPt(F, p));
        for (let e = 0; e < 14; e++) {
            const p0 = HAT14[e], p1 = HAT14[(e + 1) % 14];
            for (let f = 0; f < 14; f++) {
                if (HAT_EDGE_UNIT[f] !== HAT_EDGE_UNIT[e]) continue;
                const f0 = shape[f], f1 = shape[(f + 1) % 14];
                // Lay edge f along edge e both ways; the kite test rejects the
                // one that puts the new hat on top of the old.
                for (const [q0, q1] of [[p1, p0], [p0, p1]]) {
                    const T = mul(matchTwo(f0, f1, q0, q1), F);
                    const cs = HAT_KITE_CENTROIDS.map(c => kiteKey(transPt(T, c)));
                    if (!cs.every(k => grid.has(k))) continue;
                    if (cs.some(k => own.has(k))) continue;
                    const k = relKey(T);
                    if (!seen.has(k)) seen.set(k, { rel: T, key: k, legal: pairMap.has(k), refl: detOf(T) < 0 });
                }
            }
        }
    }
    return [...seen.values()];
}

// ── Translations that carry many hats onto hats ───────────────
function findNearPeriods(hats, cx, cy, code, center) {
    const n = hats.length;
    const ox = cx[center], oy = cy[center];
    const W = 36, Rmax = 70;
    const win = [];
    for (let i = 0; i < n; i++) if (mag(cx[i] - ox, cy[i] - oy) < W) win.push(i);
    const byCode = Array.from({ length: 12 }, () => []);
    for (let j = 0; j < n; j++) byCode[code[j]].push(j);
    const counts = new Map();
    for (const i of win) {
        const ti = hats[i].T;
        for (const j of byCode[code[i]]) {
            const tj = hats[j].T;
            const vx = tj[2] - ti[2], vy = tj[5] - ti[5];
            if (vx * vx + vy * vy > Rmax * Rmax || (vx === 0 && vy === 0)) continue;
            const k = latKey(vx, vy);
            const c = counts.get(k);
            if (c) c.n++; else counts.set(k, { vx, vy, n: 1 });
        }
    }
    const all = [];
    for (const c of counts.values())
        all.push({ vx: c.vx, vy: c.vy, len: mag(c.vx, c.vy), frac: c.n / win.length });
    // Best shift in each distance band.
    const bands = [[2, 6], [6, 12], [12, 20], [20, 32], [32, 48], [48, 70]];
    return bands.map(([lo, hi]) => {
        let b = null;
        for (const s of all) if (s.len >= lo && s.len < hi && (!b || s.frac > b.frac)) b = s;
        return b;
    }).filter(Boolean);
}
