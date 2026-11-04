/**
 * Face colors that keep neighbors apart.
 *
 * The faces of a domain fall into pairing classes: a face and the face it is
 * glued to are one class and wear one color. Each class takes a color from a
 * pool drawn from the palette, chosen so that
 *   - classes whose faces touch get colors far apart. Hue and chroma count
 *     double against lightness here, because the lighting already shifts
 *     lightness from face to face: two tints of one hue read as one color;
 *   - classes that do not touch still avoid near-duplicates, so the colors
 *     keep telling the pairings apart;
 *   - the palette's own colors, and its earlier ones, come first.
 * The search is deterministic: one domain and one palette always give the
 * same colors.
 */
import { rgbToOklab } from './paletteColors.js';

// How much a contact between two faces counts.
const EDGE = 1;          // a shared edge (3D) or corner (plane polygon)
const TANGENT = 0.7;     // they touch at one point at infinity (a cusp)
const CORNER = 0.2;      // a shared vertex and nothing more (3D)
const MAX_WEIGHT = 3;    // cap on the contacts summed over two classes

const L_WEIGHT = 0.5;    // lightness against hue and chroma, between neighbors
const NEAR = 0.11;       // neighbors closer than about this (OKLab) cost a lot
const DUPLICATE = 0.06;  // any two classes closer than about this cost a little
const DUPLICATE_WEIGHT = 0.35;
const RESTART_WORK = 2e6;   // the restarts' budget, in units of k²·(pool size)

const KEY = 65536;
function contactMap() {
    const C = new Map();
    const put = (i, j, w) => {
        if (i === j || i < 0 || j < 0) return;
        const key = i < j ? i * KEY + j : j * KEY + i;
        if (!(C.get(key) >= w)) C.set(key, w);
    };
    const list = () => [...C].map(([key, w]) => [Math.floor(key / KEY), key % KEY, w]);
    return { C, put, list };
}

/**
 * Which walls of a Dirichlet (or Ford) polyhedron touch: [i, j, weight] for
 * walls sharing an edge, touching at a cusp, or sharing only a vertex. For a
 * Fuchsian group the polyhedron is a prism over the plane polygon, so its
 * edges are the polygon's corners and its tangencies the polygon's cusps.
 */
export function polyhedronContacts(poly) {
    if (!poly) return [];
    const { C, put, list } = contactMap();
    for (const e of poly.edges || []) put(e.i, e.j, EDGE);
    for (const v of poly.vertices || []) {
        const ws = v.walls || [];
        for (let x = 0; x < ws.length; x++) for (let y = x + 1; y < ws.length; y++) put(ws[x], ws[y], CORNER);
    }
    // Walls tangent at a point at infinity that the domain reaches: no edge
    // between them, but they meet on screen.
    const P = poly.planes || [];
    for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
            if ((C.get(i * KEY + j) || 0) >= TANGENT) continue;
            const k = tangentPoint(P[i], P[j]);
            if (!k) continue;
            const inside = P.every((p, m) => m === i || m === j ||
                p.n.x * k[0] + p.n.y * k[1] + p.n.z * k[2] - p.c <= 1e-6 * Math.hypot(p.n.x, p.n.y, p.n.z));
            if (inside) put(i, j, TANGENT);
        }
    }
    return list();
}

/** The point where two Klein planes n·k = c meet the sphere only, or null. */
function tangentPoint(p, q) {
    const a = p.n, b = q.n;
    const d = [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x];
    const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const aa = a.x * a.x + a.y * a.y + a.z * a.z, bb = b.x * b.x + b.y * b.y + b.z * b.z;
    if (dd < 1e-12 * aa * bb) return null;
    // The point of the line nearest the origin (it lies in span(a, b)).
    const ab = a.x * b.x + a.y * b.y + a.z * b.z;
    const s = (p.c * bb - q.c * ab) / dd, t = (q.c * aa - p.c * ab) / dd;
    const k = [s * a.x + t * b.x, s * a.y + t * b.y, s * a.z + t * b.z];
    const r2 = k[0] * k[0] + k[1] * k[1] + k[2] * k[2];
    return Math.abs(r2 - 1) < 1e-6 ? k : null;
}

/**
 * Which sides of a Delaunay domain touch (see delaunay.js): sides sharing a
 * segment (3D) or a corner (2D) touch along an edge; in 3D, sides sharing
 * only a vertex touch at a corner.
 */
export function delaunayContacts(R) {
    if (!R || !R.ok) return [];
    const { put, list } = contactMap();
    const at = new Map();
    const add = (key, r) => {
        let s = at.get(key);
        if (!s) at.set(key, (s = new Set()));
        s.add(r);
    };
    for (const f of R.raw) {
        if (R.dim === 3) for (const [a, b] of f.segs || []) add(a < b ? `${a},${b}` : `${b},${a}`, f.region);
        for (const v of f.vi || []) add(`v${v}`, f.region);
    }
    for (const [key, set] of at) {
        if (set.size < 2) continue;
        const w = key[0] !== 'v' || R.dim === 2 ? EDGE : CORNER;
        const rs = [...set];
        for (let x = 0; x < rs.length; x++) for (let y = x + 1; y < rs.length; y++) put(rs[x], rs[y], w);
    }
    return list();
}

/**
 * Pairing classes and their colors.
 * @param partner   each face's partner index (−1 if none)
 * @param contacts  [i, j, weight] for faces that touch
 * @param pool      k ↦ [{ rgb, cost }], at least k candidate colors
 * @returns { classes (class per face), colors (rgb per face), count }
 */
export function colorClasses(partner, contacts, pool) {
    const n = partner.length;
    const classes = new Array(n).fill(-1);
    let k = 0;
    partner.forEach((j, i) => {
        if (classes[i] >= 0) return;
        classes[i] = k;
        if (j >= 0 && j < n && classes[j] < 0) classes[j] = k;
        k++;
    });
    const W = new Float64Array(k * k);
    for (const [a, b, w] of contacts || []) {
        if (a >= n || b >= n) continue;
        const ca = classes[a], cb = classes[b];
        if (ca === cb) continue;                 // glued: one color anyway
        W[ca * k + cb] = W[cb * k + ca] = Math.min(MAX_WEIGHT, W[ca * k + cb] + w);
    }
    const P = pool(k);
    const pick = assignColors(k, W, P);
    return { classes, colors: classes.map(c => P[pick[c]].rgb), count: k };
}

/**
 * Color index (into `pool`) per class, minimising
 *   Σ_neighbors W·near(c_a, c_b) + Σ_pairs dup(c_a, c_b) + Σ cost(c_a)
 * over one-to-one choices: a greedy start (busiest classes first) and then
 * moves and swaps until nothing improves.
 */
export function assignColors(k, W, pool) {
    const m = pool.length;
    if (!k) return [];
    if (m < k) throw new Error('assignColors: the pool is smaller than the number of classes');
    const lab = pool.map(p => rgbToOklab(p.rgb));
    const near = new Float64Array(m * m), dup = new Float64Array(m * m);
    for (let x = 0; x < m; x++) {
        for (let y = x + 1; y < m; y++) {
            const dL = lab[x][0] - lab[y][0], da = lab[x][1] - lab[y][1], db = lab[x][2] - lab[y][2];
            const dn2 = (L_WEIGHT * dL) ** 2 + da * da + db * db;
            const d2 = dL * dL + da * da + db * db;
            near[x * m + y] = near[y * m + x] = Math.exp(-dn2 / (NEAR * NEAR));
            dup[x * m + y] = dup[y * m + x] = DUPLICATE_WEIGHT * Math.exp(-d2 / (DUPLICATE * DUPLICATE));
        }
        near[x * m + x] = 1;
        dup[x * m + x] = DUPLICATE_WEIGHT;
    }
    const cost = pool.map(p => p.cost || 0);
    const col = new Int32Array(k).fill(-1), owner = new Int32Array(m).fill(-1);

    // Cost of class a wearing color c, against every colored class but `skip`.
    const marginal = (a, c, skip) => {
        let s = cost[c];
        const row = c * m, wa = a * k;
        for (let b = 0; b < k; b++) {
            const cb = col[b];
            if (b === a || b === skip || cb < 0) continue;
            s += dup[row + cb] + W[wa + b] * near[row + cb];
        }
        return s;
    };

    // Greedy: next the class most tied to the colored ones (ties: the busiest).
    const total = new Float64Array(k), tied = new Float64Array(k);
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) total[a] += W[a * k + b];
    for (let step = 0; step < k; step++) {
        let a = -1;
        for (let x = 0; x < k; x++) {
            if (col[x] >= 0) continue;
            if (a < 0 || tied[x] > tied[a] + 1e-12 || (Math.abs(tied[x] - tied[a]) <= 1e-12 && total[x] > total[a] + 1e-12)) a = x;
        }
        let best = -1, bestCost = Infinity;
        for (let c = 0; c < m; c++) {
            if (owner[c] >= 0) continue;
            const v = marginal(a, c, -1);
            if (v < bestCost - 1e-12) { bestCost = v; best = c; }
        }
        col[a] = best; owner[best] = a;
        for (let b = 0; b < k; b++) tied[b] += W[a * k + b];
    }

    // Improve: move a class to a free color, or swap two classes' colors,
    // until no single move helps.
    const descend = () => {
        for (let pass = 0; pass < 30; pass++) {
            let improved = false;
            for (let a = 0; a < k; a++) {
                const ca = col[a];
                const here = marginal(a, ca, -1);
                let bestD = -1e-9, bestC = -1;
                for (let c = 0; c < m; c++) {
                    if (c === ca) continue;
                    const b = owner[c];
                    const d = b < 0
                        ? marginal(a, c, -1) - here
                        : marginal(a, c, b) + marginal(b, ca, a) - marginal(a, ca, b) - marginal(b, c, a);
                    if (d < bestD) { bestD = d; bestC = c; }
                }
                if (bestC >= 0) { give(a, bestC); improved = true; }
            }
            if (!improved) break;
        }
    };
    // Class a takes color c; whoever wore c takes a's old color.
    const give = (a, c) => {
        const ca = col[a], b = owner[c];
        if (b >= 0) { col[b] = ca; owner[ca] = b; } else owner[ca] = -1;
        col[a] = c; owner[c] = a;
    };
    const objective = () => {
        let s = 0;
        for (let a = 0; a < k; a++) {
            const row = col[a] * m;
            s += cost[col[a]];
            for (let b = a + 1; b < k; b++) s += dup[row + col[b]] + W[a * k + b] * near[row + col[b]];
        }
        return s;
    };
    descend();

    // Single moves stall in local minima, so restart from the best so far with
    // a few classes moved at random (seeded: the result never varies), as many
    // times as the size allows.
    const best = Int32Array.from(col);
    let bestJ = objective();
    let seed = 0x2545f491 ^ (k * 2654435761);
    const rand = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rounds = Math.max(3, Math.min(60, Math.floor(RESTART_WORK / (k * k * m))));
    for (let r = 0; r < rounds; r++) {
        col.set(best);
        owner.fill(-1);
        for (let a = 0; a < k; a++) owner[col[a]] = a;
        const shake = 2 + (r % 3);
        for (let t = 0; t < shake; t++) {
            const a = Math.floor(rand() * k), c = Math.floor(rand() * m);
            if (c !== col[a]) give(a, c);
        }
        descend();
        const J = objective();
        if (J < bestJ - 1e-12) { bestJ = J; best.set(col); }
    }
    return Array.from(best);
}

/**
 * Smallest color distance between touching classes (the same metric as the
 * search), and between any two classes — for tests and the console.
 */
export function separation(rgbs, classes, contacts) {
    const lab = rgbs.map(rgbToOklab);
    let touching = Infinity, any = Infinity;
    const d = (x, y, wL) => Math.hypot(wL * (lab[x][0] - lab[y][0]), lab[x][1] - lab[y][1], lab[x][2] - lab[y][2]);
    for (const [a, b, w] of contacts) {
        if (classes[a] === classes[b] || w < TANGENT) continue;
        touching = Math.min(touching, d(a, b, L_WEIGHT));
    }
    for (let x = 0; x < rgbs.length; x++) for (let y = x + 1; y < rgbs.length; y++) {
        if (classes[x] !== classes[y]) any = Math.min(any, d(x, y, 1));
    }
    return { touching, any };
}
