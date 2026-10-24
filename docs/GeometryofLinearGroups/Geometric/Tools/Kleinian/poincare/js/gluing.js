/**
 * How the face pairings glue the boundary of the domain: the class of an edge
 * or a vertex (its edge cycle, its vertex cycle), found by carrying it across
 * every face it lies on, in the HOME frame. Works for the Dirichlet domain,
 * where each face has one pairing, and for the Ford domain, where a face piece
 * is carried across and then folded back into the chimney.
 *
 * Edges also record HOW they are carried: a reference point (the transported
 * hyperbolic midpoint, or finite end) and a direction, so that the picture can
 * run pulses along every edge of the class in step. An edge the gluing
 * reverses (a flip by the cycle element) gets direction 0.
 */
import * as THREE from 'three';
import { Matrix2x2, applyMatrixToBall, invertWord, distFromIdentityPSL, pslKey } from './math.js';
import { kleinToBall, ballToKlein } from './polyhedron.js';

const LINE_TOL = 1e-6;       // Klein distance from a carried point to an edge
const POINT_TOL = 1e-6;      // Klein distance for "the same vertex"
const FOLD_TOL = 1e-7;       // Ford: how far past a chimney wall forces a fold
const MAX_CLASS = 400;

/** Chimney walls of a Ford domain: those of elements fixing ∞ (c = 0). */
function chimneyWalls(H) {
    return H.walls.map((w, j) => (Math.sqrt(w.elem.normalized().c.normSq()) < 1e-9 ? j : -1)).filter(j => j >= 0);
}

/**
 * Ford domain, home frame: the element pairing the piece of face i through
 * the ball point p — g⁻¹ for the wall of g, then the chimney translations
 * folding the image back. Returns { matrix, word }.
 */
export function fordPairingHome(H, i, p, tol = 1e-9) {
    const vertical = chimneyWalls(H);
    const w = H.walls[i];
    let M = w.elem.inv().normalized();
    let word = invertWord(w.word);
    if (vertical.includes(i)) return { matrix: M, word };
    let y = applyMatrixToBall(M, p);
    for (let it = 0; it < 64; it++) {
        const ky = ballToKlein(y);
        let worst = tol, k = -1;
        for (const j of vertical) {
            const W = H.walls[j].cov;
            const r = (W.x * ky.x + W.y * ky.y + W.z * ky.z - W.w) / Math.hypot(W.x, W.y, W.z);
            if (r > worst) { worst = r; k = j; }
        }
        if (k < 0) break;
        const s = H.walls[k].elem.inv().normalized();
        y = applyMatrixToBall(s, y);
        M = s.mul(M).normalized();
        word = [...invertWord(H.walls[k].word), ...word];
    }
    return { matrix: M, word };
}

/** The isometry carrying face i across at ball point p, or null. */
function pairingAt(H, i, p, ford) {
    if (ford) return fordPairingHome(H, i, p, FOLD_TOL).matrix;
    const w = H.walls[i];
    return w.pairing && w.pairing.partner >= 0 ? w.pairing.matrix : null;
}

const kPoint = (e, t) => e.p0.clone().addScaledVector(e.d, t);

/** The edge whose segment holds Klein point k (closest), with its parameter. */
function locateEdge(poly, k) {
    let best = null, bestD = LINE_TOL;
    for (const e of poly.edges) {
        const rel = k.clone().sub(e.p0);
        const t = rel.dot(e.d);
        const span = e.hi - e.lo;
        if (t < e.lo + 1e-4 * span || t > e.hi - 1e-4 * span) continue;
        const perp = rel.addScaledVector(e.d, -t).length();
        if (perp < bestD) { bestD = perp; best = { e, t }; }
    }
    return best;
}

/** Index of the vertex at Klein point k, or -1. */
function locateVertex(poly, k) {
    let best = -1, bestD = POINT_TOL;
    poly.vertices.forEach((v, i) => {
        const d = v.k.distanceTo(k);
        if (d < bestD) { bestD = d; best = i; }
    });
    return best;
}

/** Hyperbolic distance between two ball points. */
export function ballDistance(p, q) {
    const a = 1 - p.lengthSq(), b = 1 - q.lengthSq();
    if (a <= 0 || b <= 0) return Infinity;
    return Math.acosh(1 + 2 * p.distanceToSquared(q) / (a * b));
}

/** Klein parameter of the hyperbolic midpoint of an edge (or of its finite end, or the Klein midpoint). */
function referenceParam(poly, e) {
    const ia = poly.vertices[e.a].ideal, ib = poly.vertices[e.b].ideal;
    if (ia && ib) return 0.5 * (e.lo + e.hi);
    if (ia) return e.hi;
    if (ib) return e.lo;
    // Bisect on the distance to the two ends.
    const A = kleinToBall(kPoint(e, e.lo)), B = kleinToBall(kPoint(e, e.hi));
    let lo = e.lo, hi = e.hi;
    for (let it = 0; it < 50; it++) {
        const m = 0.5 * (lo + hi), P = kleinToBall(kPoint(e, m));
        if (ballDistance(A, P) < ballDistance(P, B)) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
}

/**
 * The class of edge `id` under the gluing of home domain H.
 * Returns [{ id, ref, dir }]: `ref` the Klein parameter of the carried
 * reference point on that edge's line, `dir` = ±1 the direction it is carried
 * in (+1 = increasing parameter on the start edge), or 0 when the class
 * reaches the edge both ways. The start edge comes first.
 */
export function edgeClass(H, id, { ford = false } = {}) {
    const poly = H && H.poly;
    const e0 = poly && poly.edges[id];
    if (!e0) return [];
    const found = new Map([[id, { id, ref: referenceParam(poly, e0), dir: 1 }]]);
    const queue = [id];
    while (queue.length && found.size < MAX_CLASS) {
        const cur = found.get(queue.shift());
        const e = poly.edges[cur.id];
        const span = e.hi - e.lo;
        for (const face of [e.i, e.j]) {
            // A few points along the edge: a Ford face piece may be carried
            // onto different edges by different folds.
            for (const f of ford ? [0.2, 0.5, 0.8] : [0.5]) {
                const t = e.lo + f * span, dt = 0.05 * span;
                const p = kleinToBall(kPoint(e, t));
                const M = pairingAt(H, face, p, ford);
                if (!M) continue;
                const carry = (s) => ballToKlein(applyMatrixToBall(M, kleinToBall(kPoint(e, s))));
                const hit = locateEdge(poly, carry(t));
                if (!hit) continue;
                const e2 = hit.e;
                const along = (k) => k.clone().sub(e2.p0).dot(e2.d);
                const flip = along(carry(t + dt)) < hit.t;
                const dir = cur.dir === 0 ? 0 : (flip ? -cur.dir : cur.dir);
                const known = found.get(e2.id);
                if (known) {
                    if (known.dir !== dir && known.dir !== 0) { known.dir = 0; queue.push(e2.id); }
                    continue;
                }
                const refK = carry(cur.ref);
                found.set(e2.id, { id: e2.id, ref: along(refK), dir });
                queue.push(e2.id);
            }
        }
    }
    // A flip anywhere in the class reverses every edge of it on the way back.
    if ([...found.values()].some(x => x.dir === 0)) for (const x of found.values()) x.dir = 0;
    return [...found.values()];
}

/** Indices of the vertices glued to vertex `v` of home domain H (v first). */
export function vertexClass(H, v, { ford = false } = {}) {
    const poly = H && H.poly;
    if (!poly || !poly.vertices[v]) return [];
    const found = [v], seen = new Set(found);
    for (let q = 0; q < found.length && found.length < MAX_CLASS; q++) {
        const u = found[q], V = poly.vertices[u];
        const p = kleinToBall(V.k.clone().multiplyScalar(V.ideal ? 0.999999 : 1));
        for (const face of V.walls) {
            if (!poly.faces[face] || !poly.faces[face].vertices.includes(u)) continue;
            const M = pairingAt(H, face, p, ford);
            if (!M) continue;
            const w = locateVertex(poly, ballToKlein(applyMatrixToBall(M, p)));
            if (w >= 0 && !seen.has(w)) { seen.add(w); found.push(w); }
        }
    }
    return found;
}

/**
 * Order of the stabilizer of a finite vertex, from its class: the links are
 * spherical polygons with the dihedral angles at the vertex, of area
 * Σθ − (n − 2)π, and the areas over the class add up to 4π/|Stab|.
 * Returns { order, area } (order null when it does not round cleanly).
 */
export function vertexStabilizer(H, cls) {
    const poly = H.poly;
    let area = 0;
    for (const v of cls) {
        if (poly.vertices[v].ideal) return { order: null, area: null };
        const at = poly.edges.filter(e => e.a === v || e.b === v);
        if (at.length < 3) return { order: null, area: null };
        area += at.reduce((s, e) => s + e.angle, 0) - (at.length - 2) * Math.PI;
    }
    const k = 4 * Math.PI / area;
    const order = Math.round(k);
    return { order: order >= 1 && Math.abs(k - order) < 0.02 * order ? order : null, area };
}

/**
 * Samples of an edge for drawing with the signed hyperbolic distance from its
 * carried reference point (the pulse coordinate): ball points and `s` values.
 */
export function edgeFlowSamples(e, ref, dir, n = 64) {
    const shrink = 1e-6 * (e.hi - e.lo);
    const R = kleinToBall(kPoint(e, ref));
    const pts = [], s = [];
    for (let i = 0; i <= n; i++) {
        const t = e.lo + shrink + (e.hi - e.lo - 2 * shrink) * (i / n);
        const P = kleinToBall(kPoint(e, t));
        let d = ballDistance(R, P);
        if (!Number.isFinite(d)) d = 40;
        pts.push(P);
        s.push(dir === 0 ? d : dir * Math.sign(t - ref) * d);
    }
    return { pts, s };
}

/** Ball point of edge `id` to centre an unwrap on: its hyperbolic midpoint (or finite end). */
export function edgeCentre(H, id) {
    const e = H.poly.edges[id];
    return kleinToBall(kPoint(e, referenceParam(H.poly, e)));
}

/** A ball point in the middle of face i of home domain H, or null. */
export function faceCentreHome(H, i) {
    const poly = H.poly;
    const f = poly.faces[i];
    const pts = f.vertices.map(v => poly.vertices[v].k.clone());
    const fa = poly.freeArcs.find(x => x.wall === i);
    if (fa) for (const [a, b] of fa.arcs) {
        const t = 0.5 * (a + b);
        pts.push(fa.center.clone().addScaledVector(fa.u, fa.rho * Math.cos(t)).addScaledVector(fa.v, fa.rho * Math.sin(t)));
    }
    if (!pts.length) return null;
    const g = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const P = poly.planes[i];
    g.addScaledVector(P.n, (P.c - P.n.dot(g)) / P.n.lengthSq());
    if (g.lengthSq() >= 1) g.multiplyScalar(0.999 / g.length());
    return kleinToBall(g);
}

// ---------------- the cells around an edge or a vertex ----------------

const isIdentity = (T) => !T.anti && distFromIdentityPSL(T.normalized()) < 1e-6;

/**
 * The tiles of the tessellation around edge `id`, in the order a walk round
 * the edge meets them: from D, across one face at the edge into the next
 * tile, across that tile's other face at the edge, and so on until the walk
 * is back at D. Each tile is { T, edge }: tile = T·D (home frame), and T
 * carries `edge` of D onto the start edge. For a fundamental domain the walk
 * closes and the dihedral angles met add up to 2π; otherwise `closed` is
 * false (the cells overlap, or a pairing is missing).
 */
export function edgeTiles(H, id, { ford = false, max = 64 } = {}) {
    const poly = H.poly;
    const planes = poly.planes;
    let T = Matrix2x2.identity(), cur = poly.edges[id], exit = cur.i;
    let t = 0.5 * (cur.lo + cur.hi);
    const tiles = [{ T, edge: id }];
    let angle = cur.angle, closed = false;
    while (tiles.length < max) {
        const other = cur.i === exit ? cur.j : cur.i;
        const k = kPoint(cur, t);
        // A point of the exit face just off the edge, to tell which face of
        // the next tile it arrives on.
        const nA = planes[exit].n, nB = planes[other].n;
        const u = new THREE.Vector3().crossVectors(cur.d, nA).normalize();
        if (nB.dot(u) > 0) u.negate();
        const x = k.clone().addScaledVector(u, 1e-3 * Math.min(1, 1 - k.length()));
        const M = pairingAt(H, exit, kleinToBall(k), ford);
        if (!M) break;
        const hit = locateEdge(poly, ballToKlein(applyMatrixToBall(M, kleinToBall(k))));
        if (!hit) break;
        const T2 = T.mul(M.inv().normalized()).normalized();
        if (isIdentity(T2)) { closed = true; break; }
        const xk = ballToKlein(applyMatrixToBall(M, kleinToBall(x)));
        const off = (m) => Math.abs(planes[m].n.dot(xk) - planes[m].c) / planes[m].n.length();
        const arrived = off(hit.e.i) <= off(hit.e.j) ? hit.e.i : hit.e.j;
        T = T2; cur = hit.e; t = hit.t;
        exit = cur.i === arrived ? cur.j : cur.i;
        angle += cur.angle;
        tiles.push({ T, edge: cur.id });
        if (angle > 2 * Math.PI + 0.02) break;       // past a full turn: overlapping cells
    }
    return { tiles, closed, angle };
}

/**
 * The tiles of the tessellation that contain vertex `v` (finite), in the
 * order a breadth-first walk across faces at the vertex meets them, from D.
 * Each tile is { T, vertex }: tile = T·D, and T carries `vertex` of D onto v.
 */
export function vertexTiles(H, v, { ford = false, max = 120 } = {}) {
    const poly = H.poly;
    const tiles = [{ T: Matrix2x2.identity(), vertex: v }];
    const seen = new Set([pslKey(tiles[0].T)]);
    for (let q = 0; q < tiles.length && tiles.length < max; q++) {
        const { T, vertex: u } = tiles[q];
        const p = kleinToBall(poly.vertices[u].k);
        for (const face of poly.vertices[u].walls) {
            if (!poly.faces[face] || !poly.faces[face].vertices.includes(u)) continue;
            const M = pairingAt(H, face, p, ford);
            if (!M) continue;
            const w = locateVertex(poly, ballToKlein(applyMatrixToBall(M, p)));
            if (w < 0) continue;
            const T2 = T.mul(M.inv().normalized()).normalized();
            const key = pslKey(T2);
            if (seen.has(key)) continue;
            seen.add(key);
            tiles.push({ T: T2, vertex: w });
            if (tiles.length >= max) break;
        }
    }
    return { tiles, complete: tiles.length < max };
}
