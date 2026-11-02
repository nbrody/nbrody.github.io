/**
 * The Delaunay domain: a canonical fundamental domain dual to the Dirichlet
 * domain, whose corners are copies of the basepoint (and, for an orbifold,
 * points on the axes of its rotations).
 *
 * The Dirichlet domain D at p is one cell of the Voronoi tessellation of the
 * orbit Γp. Its dual, the Delaunay tessellation of Γp, is just as canonical:
 * one cell round each vertex w of the Voronoi tessellation, the convex hull
 * of the orbit points nearest to w. Duality swaps dimensions:
 *
 *     Delaunay cells           ↔  vertex cycles of D,
 *     faces between two cells  ↔  edge cycles of D,
 *     Delaunay edges [p, g·p]  ↔  face pairings of D.
 *
 * For a lattice in ℝ³ the cells are the six tetrahedra of a parallelepiped
 * spanned by an obtuse superbase: the parallelepiped lives on the Delaunay
 * side of the duality, the permutohedron on the Dirichlet side.
 *
 * Pieces. A cell with a symmetry (round an elliptic axis) must be cut before
 * one piece of it can go into a fundamental domain, and the cut has to match
 * the cells round it. The barycentric subdivision of the Delaunay
 * tessellation does this for every group at once: its simplices are flags
 * (orbit point ⊂ Delaunay edge ⊂ face ⊂ cell), each has exactly one orbit
 * point as a corner, so Γ acts on them freely (p has trivial stabilizer),
 * and moving that corner to p identifies the simplices up to Γ with the
 * FLAGS OF D: (vertex w ⊂ edge e ⊂ face F) ↔ the simplex
 *
 *     (p,  midpoint of [p, q_F],  centre of the face dual to e,  centre of the cell dual to w),
 *
 * centres being barycentres of corners (on the hyperboloid), so equivariant.
 * At an ideal vertex w the cell is infinite (the cusp's horospherical
 * lattice coned to w) and its "centre" is w itself.
 *
 * Gluing. Two pieces are adjacent across one of their four facets; one of
 * these (a change of orbit point) goes through the pairing of F. Kruskal
 * glues inside each Delaunay cell first — whole Delaunay edges, then whole
 * faces, then faces across the longest Delaunay edge (for a cusp's lattice,
 * the parallelogram on a reduced basis) — so a cell without symmetry comes
 * back whole and a cell with one comes back as a single wedge; then across
 * the Delaunay faces, the SHORTEST Dirichlet edge first. A Dirichlet edge of
 * length zero is a degenerate position where several Delaunay cells are one
 * polytope, and gluing across short edges first puts them back together, so
 * the domain does not jump when the basepoint crosses one. For a planar
 * lattice the result is the parallelogram on a reduced basis; for a closed
 * surface of genus g a 4g-gon (the Dirichlet domain at a generic point has
 * 12g − 6 sides).
 *
 * The boundary. Facets whose two sides are not both in the domain are paired
 * by group elements. Neighbouring facets paired by the same element form one
 * side of the face pairing (it may bend: two Delaunay triangles paired as a
 * unit). A face as drawn is a flat part of one side, so lines go where a
 * pairing ends (even across a flat join) and, thinner, where a side bends;
 * the subdivision itself is never drawn. A facet lying in a mirror is paired
 * with itself. Relators: each edge cycle (corner cycle in the plane) gives
 * (its product)^m with m the product's order, and a side paired with itself
 * by an involution gives s² = 1.
 *
 * Everything is in the HOME frame of the Dirichlet domain, in Klein
 * coordinates, where hyperbolic convex hulls are Euclidean. Plain data in,
 * plain data out: no DOM, so the tests run it in Node.
 */
import * as THREE from 'three';
import { Matrix2x2, pslKey, distFromIdentityPSL, lorentzMatrix, reduceWord, invertWord, translationTowards } from './math.js';
import { buildPolyhedron, ballToKlein, polyhedronVolume } from './polyhedron.js';
import { computeCanonicalDomain } from './canonical.js';

const PT_TOL = 1e-6;        // Klein distance for "the same point"
const WALL_TOL = 1e-7;      // normalized Klein residual for "on the wall"
const ID_TOL = 1e-6;        // distance from ±I for "the identity"
const STAR_CAP = 512;       // cells round one point before we give up
const PLANE_NUDGE = 0.12;    // how far along the plane a symmetric basepoint is moved (2D)

// ---------------- group elements ----------------

/** A group element: matrix (home frame) and word in the typed generators. */
class El {
    constructor(m, w) { this.m = m; this.w = w; this._L = null; }
    static id() { return new El(Matrix2x2.identity(), []); }
    get L() { return this._L || (this._L = lorentzMatrix(this.m)); }
    mul(o) { return new El(this.m.mul(o.m).normalized(), reduceWord([...this.w, ...o.w])); }
    inv() { return new El(this.m.inv().normalized(), invertWord(this.w)); }
    /** Klein point (finite or ideal) → its image. */
    apply(k) {
        const L = this.L, x = k.x, y = k.y, z = k.z;
        const T = L[12] * x + L[13] * y + L[14] * z + L[15];
        return new THREE.Vector3(
            (L[0] * x + L[1] * y + L[2] * z + L[3]) / T,
            (L[4] * x + L[5] * y + L[6] * z + L[7]) / T,
            (L[8] * x + L[9] * y + L[10] * z + L[11]) / T);
    }
    isIdentity() { return distFromIdentityPSL(this.m) < ID_TOL; }
}

const sameEl = (a, b) => a.m.anti === b.m.anti && distFromIdentityPSL(a.m.mul(b.m.inv()).normalized()) < ID_TOL;

/** Hyperbolic distance between finite Klein points. */
export function kleinDist(a, b) {
    const den = Math.sqrt(Math.max(1e-300, (1 - a.lengthSq()) * (1 - b.lengthSq())));
    return Math.acosh(Math.max(1, (1 - a.dot(b)) / den));
}

const isIdeal = (k) => 1 - k.lengthSq() < 1e-7;

// ---------------- union–find ----------------

function makeUF(n) {
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    return { find, union: (a, b) => { a = find(a); b = find(b); if (a === b) return false; parent[Math.max(a, b)] = Math.min(a, b); return true; } };
}

// ---------------- the Dirichlet data ----------------

/** The 2D polygon D ∩ P of a Fuchsian group's domain (P = the plane y = 0). */
function planarPolygon(walls) {
    const lines = walls.map(w => {
        const a = w.cov.x, b = w.cov.z, c = w.cov.w;
        return { a, b, c, n2: a * a + b * b };
    });
    const vertices = [];
    const sides = [];
    let free = false;
    const vertexAt = (x, z, m) => {
        const k = new THREE.Vector3(x, 0, z);
        let v = vertices.findIndex(u => u.k.distanceTo(k) < 1e-7);
        if (v < 0) { vertices.push({ k, ideal: false, walls: [], sides: 0 }); v = vertices.length - 1; }
        if (!vertices[v].walls.includes(m)) vertices[v].walls.push(m);
        vertices[v].sides++;
        return v;
    };
    lines.forEach((L, m) => {
        if (!(L.c * L.c < L.n2 * (1 - 1e-12))) return;         // misses the disk
        const s = 1 / Math.sqrt(L.n2);
        const px = L.a * L.c / L.n2, pz = L.b * L.c / L.n2;
        const dx = -L.b * s, dz = L.a * s;
        const R = Math.sqrt(Math.max(0, 1 - px * px - pz * pz));
        let lo = -R, hi = R, empty = false;
        lines.forEach((K, j) => {
            if (j === m || empty) return;
            const ad = K.a * dx + K.b * dz, rhs = K.c - (K.a * px + K.b * pz);
            const scale = Math.sqrt(K.n2);
            if (Math.abs(ad) < 1e-12 * scale) { if (rhs < -1e-10 * scale) empty = true; return; }
            const t = rhs / ad;
            if (ad > 0) { if (t < hi) hi = t; } else if (t > lo) lo = t;
        });
        if (empty || hi - lo <= 1e-9) return;
        const a = vertexAt(px + lo * dx, pz + lo * dz, m), b = vertexAt(px + hi * dx, pz + hi * dz, m);
        sides.push({
            id: sides.length, i: m, j: m, extra: [], a, b, lo, hi,
            p0: new THREE.Vector3(px, 0, pz), d: new THREE.Vector3(dx, 0, dz)
        });
    });
    for (const v of vertices) {
        v.ideal = isIdeal(v.k);
        // A point of the circle at infinity reached by only one side is the end of a free arc.
        if (v.ideal && v.sides < 2) free = true;
        if (v.ideal) v.k.normalize();
    }
    // Walls through each vertex (not only the sides that end there).
    for (const v of vertices) {
        lines.forEach((L, m) => {
            if (!v.walls.includes(m) && Math.abs(L.a * v.k.x + L.b * v.k.z - L.c) < 1e-7 * Math.sqrt(L.n2)) v.walls.push(m);
        });
    }
    return { vertices, edges: sides, finiteVolume: !free && sides.length > 0 };
}

// ---------------- convex hulls (small point sets) ----------------

/**
 * Faces of the convex hull of a few points in 3-space, as planes
 * {n, c, idx: [point indices on the plane]} with every point at n·x ≤ c.
 * Brute force over triples, which is plenty for the dozen-odd corners of a
 * Delaunay cell.
 */
export function hullFaces(pts, tol = 1e-9) {
    const faces = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
        const u = pts[j].clone().sub(pts[i]), v = pts[k].clone().sub(pts[i]);
        const nr = new THREE.Vector3().crossVectors(u, v);
        const len = nr.length();
        if (len < 1e-12) continue;
        nr.multiplyScalar(1 / len);
        let c = nr.dot(pts[i]);
        let pos = 0, neg = 0;
        for (let m = 0; m < n; m++) {
            const s = nr.dot(pts[m]) - c;
            if (s > tol) pos++; else if (s < -tol) neg++;
        }
        if (pos && neg) continue;
        if (pos) { nr.negate(); c = -c; }
        if (faces.some(f => f.n.dot(nr) > 1 - 1e-9 && Math.abs(f.c - c) < 1e-9)) continue;
        const idx = [];
        for (let m = 0; m < n; m++) if (Math.abs(nr.dot(pts[m]) - c) <= tol) idx.push(m);
        faces.push({ n: nr, c, idx });
    }
    return faces;
}

/** Hyperbolic volume of the convex hull of Klein points (the hull must contain the Klein origin). */
export function cellVolume(pts) {
    const walls = hullFaces(pts).map(f => {
        const s = 1 / Math.sqrt(Math.max(1e-300, f.n.lengthSq() - f.c * f.c));
        return { cov: new THREE.Vector4(f.n.x * s, f.n.y * s, f.n.z * s, f.c * s) };
    });
    return polyhedronVolume(buildPolyhedron(walls));
}

// ---------------- hyperboloid helpers ----------------

/** Klein point → unit hyperboloid vector [x, y, z, t]. */
const hyp = (k) => { const s = 1 / Math.sqrt(Math.max(1e-14, 1 - k.lengthSq())); return [k.x * s, k.y * s, k.z * s, s]; };

/** Barycentre of finite Klein points: their hyperboloid vectors summed and normalized. */
function barycentre(pts) {
    const s = [0, 0, 0, 0];
    for (const k of pts) { const h = hyp(k); for (let i = 0; i < 4; i++) s[i] += h[i]; }
    return new THREE.Vector3(s[0] / s[3], s[1] / s[3], s[2] / s[3]);
}

/** The boost taking the Klein point p to the origin, applied to Klein points (finite or ideal). */
function boostToOrigin(p) {
    const [x, y, z, t] = hyp(p);
    const sh = Math.hypot(x, y, z);
    if (sh < 1e-14) return (k) => k.clone();
    const n = [x / sh, y / sh, z / sh], ch = t;
    return (k) => {
        const v = [k.x, k.y, k.z], w = 1;
        const nv = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
        const out = v.map((vi, i) => vi + (ch - 1) * nv * n[i] - sh * w * n[i]);
        const ow = ch * w - sh * nv;
        return new THREE.Vector3(out[0] / ow, out[1] / ow, out[2] / ow);
    };
}

/** Hyperbolic volume of a simplex of Klein points with p as a corner. */
export function simplexVolume(pts, p) {
    const to = boostToOrigin(p);
    return cellVolume(pts.map(to));
}

/** Plane through three Klein points: unit normal n and offset c (n·k = c). */
function planeOf(a, b, c) {
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const l = n.length();
    if (l < 1e-14) return null;
    n.multiplyScalar(1 / l);
    return { n, c: n.dot(a) };
}

/** Order of an isometry (1 for the identity), up to `max`; 0 if none. */
function orderOf(P, max = 120) {
    if (P.isIdentity()) return 1;
    let Q = P;
    for (let k = 2; k <= max; k++) {
        Q = Q.mul(P);
        if (Q.isIdentity()) return k;
    }
    return 0;
}

// ---------------- the construction ----------------

/**
 * @param home  the Dirichlet domain in its home frame: { walls: [{cov, elem,
 *              word, pairing: {partner}}], poly, conePoint }. Its centre p must
 *              have a trivial stabilizer (the canonical domain's centre does).
 * @param opts  { dim: 2 | 3 — 2 for the plane picture of a Fuchsian group;
 *                frame: an isometry (Matrix2x2) applied to the result, when
 *                `home` was computed in a moved frame }
 * @returns { ok: false, reason, message } or {
 *     ok: true, dim, basepoint, centre (Klein, the barycentre of the domain),
 *     simplices: [{ pts (Dirichlet frame), ideal, T }],     the pieces, one per flag of D
 *     raw: [{ pts, ideal, kinds, el, partner, side, node, inward, vi, region, face }],
 *                                                         boundary facets
 *     sides: [{ parts, el, pair, sign }],                 face-pairing regions
 *     pairs: [{ minus, plus, el }],                       s_k maps minus → plus
 *     faces: [{ parts }],                                 geometric faces (flat regions)
 *     lines: [{ a, b, kind: 'edge'|'fold', chain }],      where the boundary bends
 *     chains: [{ segs, a, b }],                           edges of the side structure
 *     vertices: [{ k, ideal, kind, corner }],
 *     cycles: [{ letters, m, chains }],                   relators (letters)^m, letters in matrix order
 *     relators: [{ enc, m }], convex, stats
 *   }
 */
export function computeDelaunayDomain(home, { dim = 3, frame = null } = {}) {
    const fail = (reason, message) => ({ ok: false, reason, message });
    if (!home || !home.walls || !home.walls.length) return fail('empty', 'No domain yet.');
    const walls = home.walls.map((w, i) => {
        const n = new THREE.Vector3(w.cov.x, w.cov.y, w.cov.z);
        const g = new El(w.elem, (w.word || []).slice());
        return { i, n, c: w.cov.w, nl: n.length(), g, gi: g.inv(), partner: w.pairing ? w.pairing.partner : -1 };
    });
    if (walls.some(w => w.partner < 0)) return fail('unpaired', 'Some face has no pairing (the certificate failed).');
    const poly = dim === 2 ? planarPolygon(home.walls) : home.poly;
    if (!poly.finiteVolume) {
        return fail('infinite', dim === 2
            ? 'The polygon reaches the circle at infinity in an arc: the surface has infinite area.'
            : 'The domain reaches the sphere at infinity in an open patch: the group has infinite covolume.');
    }
    const p = ballToKlein(home.conePoint);
    if (dim === 2 && Math.abs(p.y) > 1e-9) return fail('offplane', 'Put the basepoint on the plane.');
    for (const w of walls) w.q = w.g.apply(p);

    const V = poly.vertices, E = poly.edges;
    const res = (m, k) => (walls[m].n.dot(k) - walls[m].c) / walls[m].nl;
    const wallsAt = (k) => walls.filter(w => Math.abs(res(w.i, k)) < WALL_TOL).map(w => w.i);
    const findVertex = (k) => {
        let best = -1, bd = PT_TOL;
        for (let v = 0; v < V.length; v++) { const d = V[v].k.distanceTo(k); if (d < bd) { bd = d; best = v; } }
        return best;
    };
    const edgeByEnds = new Map();
    for (const e of E) edgeByEnds.set(e.a < e.b ? `${e.a},${e.b}` : `${e.b},${e.a}`, e.id);
    const edgeOf = (a, b) => edgeByEnds.get(a < b ? `${a},${b}` : `${b},${a}`);
    const edgePoint = (e, t) => e.p0.clone().addScaledVector(e.d, t);

    /** The cells hD containing the point x of D̄, by walking across the walls through it. */
    const starOf = (x) => {
        const out = [{ h: El.id(), y: x }];
        const seen = new Set([pslKey(out[0].h.m)]);
        for (let qi = 0; qi < out.length; qi++) {
            const { h, y } = out[qi];
            for (const m of wallsAt(y)) {
                const h2 = h.mul(walls[m].g);
                const key = pslKey(h2.m);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ h: h2, y: walls[m].gi.apply(y) });
                if (out.length > STAR_CAP) throw new Error('too many cells meet at one point');
            }
        }
        return out;
    };

    try {
        // ---- barycentres of the Delaunay cells, faces and edges round p ----
        // Delaunay cell dual to the vertex w of D: the orbit points nearest w.
        const bC = V.map(v => (v.ideal ? v.k.clone().normalize() : null));
        const cellSize = V.map(() => 0);
        V.forEach((v, w) => {
            if (v.ideal) return;
            const S = starOf(v.k);
            cellSize[w] = S.length;
            bC[w] = barycentre(S.map(s => s.h.apply(p)));
        });
        // Delaunay face dual to the edge e of D (3D): the orbit points nearest e.
        const bE = dim === 3 ? E.map(e => barycentre(starOf(edgePoint(e, 0.5 * (e.lo + e.hi))).map(s => s.h.apply(p)))) : [];
        // Delaunay edge [p, q_F] dual to the face F of D: its midpoint (on F).
        const bW = walls.map(w => barycentre([p, w.q]));

        // ---- the pieces: one simplex per flag of D ----
        // 3D flag (w, e, F): vertex w ∈ edge e ⊂ face F; simplex (p, b_F, b_e, b_w).
        // 2D flag (w, e): vertex w of side e; triangle (p, b_e, b_w).
        const flags = [], flagIndex = new Map();
        const key3 = (w, e, F) => `${w}|${e}|${F}`;
        for (const e of E) {
            const Fs = dim === 3 ? [e.i, e.j] : [e.i];
            for (const F of Fs) for (const w of [e.a, e.b]) {
                const k = key3(w, e.id, F);
                if (flagIndex.has(k)) continue;
                flagIndex.set(k, flags.length);
                const pts = dim === 3 ? [p, bW[F], bE[e.id], bC[w]] : [p, bW[F], bC[w]];
                const kinds = dim === 3 ? ['orbit', 'edge', 'face', V[w].ideal ? 'cusp' : 'cell'] : ['orbit', 'edge', V[w].ideal ? 'cusp' : 'cell'];
                flags.push({ w, e: e.id, F, pts, kinds, ideal: kinds.map(x => x === 'cusp') });
            }
        }
        const flagOf = (w, e, F) => flagIndex.get(key3(w, e, F));
        // Edges of face F at vertex w (3D) / sides at vertex w (2D).
        const atVertex = new Map();
        for (const e of E) {
            const Fs = dim === 3 ? [e.i, e.j] : [e.i];
            for (const F of Fs) for (const w of [e.a, e.b]) {
                const k = dim === 3 ? `${F}|${w}` : `${w}`;
                if (!atVertex.has(k)) atVertex.set(k, []);
                atVertex.get(k).push(e.id);
            }
        }

        // ---- adjacency between pieces ----
        // Each link: simplex n1 and h·(simplex n2) share the facet at indices
        // `shared` of n1 (the same indices of n2); `opp` is the remaining corner.
        // Within a Delaunay cell first (whole Delaunay edges, then whole faces,
        // then faces joined across the longest Delaunay edge), then across the
        // Delaunay faces, shortest Dirichlet edge first.
        const B = 1e6;
        const links = [];
        const seenLink = new Set();
        const addLink = (n1, n2, h, shared, weight, type) => {
            if (n2 === undefined) throw new Error('a neighbouring piece is missing');
            const k = n1 <= n2 ? `${n1}:${n2}:${type}` : `${n2}:${n1}:${type}`;
            if (seenLink.has(k)) return;
            seenLink.add(k);
            const all = dim === 3 ? [0, 1, 2, 3] : [0, 1, 2];
            links.push({ n1, n2, h, shared, opp: all.find(i => !shared.includes(i)), weight, type });
        };
        const other = (e, w) => (E[e].a === w ? E[e].b : E[e].a);
        flags.forEach((f, n) => {
            const e = E[f.e];
            // 1: across the Delaunay face dual to e (the other end of e).
            const w1 = other(f.e, f.w);
            const finiteEdge = !V[e.a].ideal && !V[e.b].ideal;
            addLink(n, flagOf(w1, f.e, f.F), El.id(), dim === 3 ? [0, 1, 2] : [0, 1],
                finiteEdge ? kleinDist(V[e.a].k, V[e.b].k) : B + f.e * 1e-9, 1);
            if (dim === 3) {
                // 2: the other edge of F at w (two faces of the cell sharing the Delaunay edge [p, q_F]).
                const es = (atVertex.get(`${f.F}|${f.w}`) || []).filter(x => x !== f.e);
                if (es.length !== 1) throw new Error('a face of the domain is not a polygon at a vertex');
                addLink(n, flagOf(f.w, es[0], f.F), El.id(), [0, 1, 3], -2 * B - kleinDist(p, walls[f.F].q), 2);
                // 3: the other face of D along e.
                const F2 = e.i === f.F ? e.j : e.i;
                addLink(n, flagOf(f.w, f.e, F2), El.id(), [0, 2, 3], -3 * B, 3);
            } else {
                const es = (atVertex.get(`${f.w}`) || []).filter(x => x !== f.e);
                if (es.length !== 1) throw new Error('a corner of the polygon has more than two sides');
                addLink(n, flagOf(f.w, es[0], E[es[0]].i), El.id(), [0, 2], -3 * B, 3);
            }
            // 4: across the far end of the Delaunay edge [p, q_F] (through the pairing of F).
            const s = walls[f.F].gi;
            const w2 = findVertex(s.apply(V[f.w].k)), o2 = findVertex(s.apply(V[w1].k));
            const e2 = w2 >= 0 && o2 >= 0 ? edgeOf(w2, o2) : undefined;
            if (e2 === undefined) throw new Error('a face pairing does not carry the domain onto itself');
            addLink(n, flagOf(w2, e2, walls[f.F].partner), walls[f.F].g, dim === 3 ? [1, 2, 3] : [1, 2], -4 * B, 4);
        });

        // ---- Kruskal and development ----
        const N = flags.length;
        const order = links.map((_, i) => i).sort((a, b) => links[a].weight - links[b].weight || a - b);
        const uf = makeUF(N);
        const tree = [];
        for (const i of order) if (uf.union(links[i].n1, links[i].n2)) tree.push(i);
        for (let n = 0; n < N; n++) if (uf.find(n) !== uf.find(0)) return fail('disconnected', 'The pieces do not connect up.');
        const T = new Array(N).fill(null);
        T[0] = El.id();
        const adj = Array.from({ length: N }, () => []);
        for (const i of tree) { adj[links[i].n1].push(i); adj[links[i].n2].push(i); }
        const queue = [0];
        while (queue.length) {
            const n = queue.shift();
            for (const i of adj[n]) {
                const L = links[i];
                if (L.n1 === n && !T[L.n2]) { T[L.n2] = T[n].mul(L.h); queue.push(L.n2); }
                else if (L.n2 === n && !T[L.n1]) { T[L.n1] = T[n].mul(L.h.inv()); queue.push(L.n1); }
            }
        }

        // The copy shown: the one whose centre lies in D (as canonical as D itself).
        const placedAll = [];
        flags.forEach((f, n) => f.pts.forEach((q, i) => { if (!f.ideal[i]) placedAll.push(T[n].apply(q)); }));
        let b = barycentre(placedAll);
        let shift = El.id();
        for (let it = 0; it < 64; it++) {
            let worst = 1e-9, m = -1;
            for (const w of walls) { const r = res(w.i, b); if (r > worst) { worst = r; m = w.i; } }
            if (m < 0) break;
            b = walls[m].gi.apply(b);
            shift = walls[m].gi.mul(shift);
        }
        const F0 = frame ? new El(frame, []) : El.id();
        shift = F0.mul(shift);
        for (let n = 0; n < N; n++) T[n] = shift.mul(T[n]);
        const centre = F0.apply(b);

        // ---- the boundary: facets whose two sides are not both in the domain ----
        const raw = [];
        let mirrors = 0;
        for (const L of links) {
            const P1 = T[L.n1], P2 = T[L.n2].mul(L.h.inv());
            const g = P2.mul(P1.inv());                    // side-1 facet → side-2 facet
            if (g.isIdentity()) continue;
            const f1 = flags[L.n1], f2 = flags[L.n2];
            const pts1 = L.shared.map(i => P1.apply(f1.pts[i]));
            const ideal = L.shared.map(i => f1.ideal[i]), kinds = L.shared.map(i => f1.kinds[i]);
            const in1 = P1.apply(f1.pts[L.opp]);
            if (L.n1 === L.n2) {
                // A mirror: the facet lies in the fixed plane of a reflection, paired with itself.
                mirrors++;
                raw.push({ pts: pts1, ideal, kinds, el: g, partner: raw.length, side: -1, node: L.n1, inward: in1, mirror: true });
                continue;
            }
            const pts2 = L.shared.map(i => P2.apply(f1.pts[i]));
            const in2 = T[L.n2].apply(f2.pts[L.opp]);
            const id = raw.length;
            raw.push({ pts: pts1, ideal, kinds, el: g, partner: id + 1, side: -1, node: L.n1, inward: in1 });
            raw.push({ pts: pts2, ideal, kinds, el: g.inv(), partner: id, side: 1, node: L.n2, inward: in2 });
        }

        // ---- shared vertices ----
        const verts = [];
        const vertexOf = (k, ideal, kind) => {
            for (let i = 0; i < verts.length; i++) if (verts[i].k.distanceTo(k) < 1e-6) return i;
            verts.push({ k: ideal ? k.clone().normalize() : k.clone(), ideal, kind });
            return verts.length - 1;
        };
        for (const f of raw) f.vi = f.pts.map((q, i) => vertexOf(q, f.ideal[i], f.kinds[i]));

        // ---- adjacency of boundary facets ----
        const ekey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
        const atSeg = new Map();
        raw.forEach((f, i) => {
            f.segs = dim === 2 ? [] : f.vi.map((a, j) => [a, f.vi[(j + 1) % f.vi.length]]);
            for (const [a, b] of f.segs) {
                const k = ekey(a, b);
                if (!atSeg.has(k)) atSeg.set(k, []);
                atSeg.get(k).push(i);
            }
        });
        const atVert = new Map();
        raw.forEach((f, i) => f.vi.forEach(v => { if (!atVert.has(v)) atVert.set(v, []); atVert.get(v).push(i); }));
        // Pieces meeting along a segment (3D) or at a point (2D).
        const neighbours = [];
        if (dim === 3) for (const [, list] of atSeg) { if (list.length === 2) neighbours.push(list); }
        else for (const [, list] of atVert) { if (list.length === 2) neighbours.push(list); }

        const planes = raw.map(f => {
            if (dim === 2) {
                const [A, Bp] = f.pts, d = Bp.clone().sub(A);
                const n = new THREE.Vector3(-d.z, 0, d.x).normalize();
                return { n, c: n.dot(A) };
            }
            return planeOf(f.pts[0], f.pts[1], f.pts[2]);
        });
        const flat = (i, j) => {
            const a = planes[i], bq = planes[j];
            if (!a || !bq || Math.abs(a.n.dot(bq.n)) < 1 - 1e-9) return false;
            return raw[j].pts.every(q => Math.abs(a.n.dot(q) - a.c) < 1e-8);
        };

        // Face-pairing regions ("sides"): neighbouring facets paired by the same element.
        const sf = makeUF(raw.length);
        for (const [i, j] of neighbours) {
            if (raw[i].partner === j || !sameEl(raw[i].el, raw[j].el)) continue;
            if (dim === 2 && !flat(i, j)) continue;
            sf.union(i, j);
        }
        const sideOf = new Map(), sides = [];
        raw.forEach((f, i) => {
            const r = sf.find(i);
            if (!sideOf.has(r)) { sideOf.set(r, sides.length); sides.push({ parts: [], el: f.el }); }
            f.region = sideOf.get(r);
            sides[f.region].parts.push(i);
        });
        const pairs = [], pairOfSide = new Array(sides.length).fill(-1);
        sides.forEach((S, si) => {
            if (pairOfSide[si] >= 0) return;
            const piece = raw[S.parts[0]];
            const other = raw[piece.partner].region;
            const minus = piece.side < 0 || other === si ? si : other, plus = minus === si ? other : si;
            pairOfSide[minus] = pairOfSide[plus] = pairs.length;
            pairs.push({ minus, plus, el: sides[minus].el });
        });
        sides.forEach((S, si) => { S.pair = pairOfSide[si]; S.sign = pairs[S.pair].minus === si ? -1 : 1; });

        // Faces as drawn: neighbouring facets that meet at the angle π AND are
        // paired by the same element (so the subdivision is never drawn, but a
        // change of pairing always is, flat or not).
        const gf = makeUF(raw.length);
        for (const [i, j] of neighbours) if (raw[i].region === raw[j].region && flat(i, j)) gf.union(i, j);
        const faceOf = new Map(), faces = [];
        raw.forEach((f, i) => {
            const r = gf.find(i);
            if (!faceOf.has(r)) { faceOf.set(r, faces.length); faces.push({ parts: [] }); }
            f.face = faceOf.get(r);
            faces[f.face].parts.push(i);
        });

        // ---- edges of the side structure, chained through straight joints ----
        const collinear = (a, m, c) => {
            const u = verts[m].k.clone().sub(verts[a].k), v = verts[c].k.clone().sub(verts[m].k);
            return new THREE.Vector3().crossVectors(u, v).length() < 1e-9 * Math.max(1e-6, u.length() * v.length()) && u.dot(v) > 0;
        };
        const regionsAt = (list) => [...new Set(list.map(i => raw[i].region))].sort((x, y) => x - y).join(',');
        let chains = [];
        const segChain = new Map();
        if (dim === 3) {
            const segs = [];
            for (const [k, list] of atSeg) {
                if (new Set(list.map(i => raw[i].region)).size < 2) continue;
                const [a, b2] = k.split(',').map(Number);
                segs.push({ k, a, b: b2, list, regions: regionsAt(list) });
            }
            const byVert = new Map();
            segs.forEach((s, i) => [s.a, s.b].forEach(v => { if (!byVert.has(v)) byVert.set(v, []); byVert.get(v).push(i); }));
            const cu = makeUF(segs.length);
            for (const [v, list] of byVert) {
                if (list.length !== 2) continue;
                const [s, t] = list.map(i => segs[i]);
                if (s.regions !== t.regions) continue;
                const a = s.a === v ? s.b : s.a, c = t.a === v ? t.b : t.a;
                if (collinear(a, v, c)) cu.union(list[0], list[1]);
            }
            const ci = new Map();
            segs.forEach((s, i) => {
                const r = cu.find(i);
                if (!ci.has(r)) { ci.set(r, chains.length); chains.push({ segs: [], ends: new Map() }); }
                const C = chains[ci.get(r)];
                C.segs.push(s.k);
                segChain.set(s.k, ci.get(r));
                for (const v of [s.a, s.b]) C.ends.set(v, (C.ends.get(v) || 0) + 1);
            });
            chains = chains.map(C => {
                const ends = [...C.ends.entries()].filter(([, c]) => c === 1).map(([v]) => v);
                return { segs: C.segs, a: ends[0], b: ends[1] };
            });
        }

        // ---- corners (2D): where the boundary turns or the pairing changes (the
        // fold point of a side paired with itself is one). The walk goes round each.
        if (dim === 2) {
            for (const [v, list] of atVert) {
                const bends = list.length !== 2 || !flat(list[0], list[1]);
                if (bends || new Set(list.map(i => raw[i].region)).size >= 2) verts[v].walk = verts[v].corner = true;
            }
        }

        // ---- lines to draw: where one pairing meets another (an edge), or where
        // one pairing bends (a fold); never across a flat join inside a pairing ----
        const lines = [];
        if (dim === 3) {
            for (const [k, list] of atSeg) {
                if (list.length !== 2) continue;
                const same = raw[list[0]].region === raw[list[1]].region;
                if (same && flat(list[0], list[1])) continue;
                const [a, b2] = k.split(',').map(Number);
                lines.push({ a, b: b2, kind: same ? 'fold' : 'edge', chain: segChain.has(k) ? segChain.get(k) : -1 });
            }
        }

        // ---- cycles: round each edge (3D) or corner (2D) through the pairings ----
        const letterOf = (i) => { const S = sides[raw[i].region]; return S.sign < 0 ? S.pair + 1 : -(S.pair + 1); };
        const cycles = [];
        if (dim === 3) {
            // Walk segment by segment: an edge folded in half by an involution is
            // one straight chain whose two halves are glued to each other, so the
            // walk round one half comes back through the other. A straight edge
            // split at a midpoint gives two parallel walks; one is kept.
            const done = new Set();
            const seenChains = new Set();
            for (const k0 of segChain.keys()) {
                for (const p0 of atSeg.get(k0)) {
                    if (done.has(`${k0}:${p0}`)) continue;
                    const letters = [], els = [], visited = [];
                    let k = k0, piece = p0, guard = 0, ok = true;
                    while (guard++ < 400) {
                        done.add(`${k}:${piece}`);
                        visited.push(segChain.get(k));
                        const F = raw[piece], G = raw[F.partner];
                        const [a, b2] = k.split(',').map(Number);
                        const k2 = ekey(G.vi[F.vi.indexOf(a)], G.vi[F.vi.indexOf(b2)]);
                        letters.push(letterOf(piece));
                        els.push(F.el);
                        if (!segChain.has(k2)) { ok = false; break; }
                        done.add(`${k2}:${F.partner}`);
                        const next = atSeg.get(k2).find(i => i !== F.partner);
                        if (next === undefined) { ok = false; break; }
                        k = k2; piece = next;
                        if (done.has(`${k}:${piece}`)) break;
                    }
                    const sig = [...new Set(visited)].sort((x, y) => x - y).join(',');
                    if (seenChains.has(sig)) continue;
                    seenChains.add(sig);
                    cycles.push({ letters, els, chains: [...new Set(visited)], ok });
                }
            }
        } else {
            const done = new Set();
            for (const [v0, list] of atVert) {
                if (!verts[v0].walk || verts[v0].ideal) continue;
                for (const f0 of list) {
                    if (done.has(`${v0}:${f0}`)) continue;
                    const letters = [], els = [], corners = [];
                    let v = v0, f = f0, guard = 0, ok = true;
                    while (guard++ < 400) {
                        const F = raw[f], G = raw[F.partner];
                        const w = G.vi[F.vi.indexOf(v)];
                        done.add(`${v}:${f}`);
                        done.add(`${w}:${F.partner}`);
                        letters.push(letterOf(f));
                        els.push(F.el);
                        corners.push(v);
                        const next = (atVert.get(w) || []).find(i => i !== F.partner && raw[i].region !== G.region) ??
                            (atVert.get(w) || []).find(i => i !== F.partner);
                        if (next === undefined) { ok = false; break; }
                        v = w; f = next;
                        if (done.has(`${v}:${f}`)) break;
                    }
                    cycles.push({ letters, els, corners, ok });
                }
            }
        }
        // The relation of a cycle is (its product)^m, m the order of the product.
        for (const c of cycles) {
            let P = El.id();
            for (const g of c.els) P = g.mul(P);
            c.m = orderOf(P);
            if (!c.m) c.ok = false;
            c.letters = c.letters.slice().reverse();         // matrix order: last applied first
            delete c.els;
        }
        const relators = cycles.filter(c => c.ok && c.letters.length).map(c => ({ enc: c.letters, m: c.m }));
        // A side paired with itself by an involution: s² = 1.
        pairs.forEach((P, k) => {
            if (P.minus === P.plus && P.el.mul(P.el).isIdentity()) relators.push({ enc: [k + 1], m: 2 });
        });

        // ---- convexity: every corner on the inner side of every facet ----
        let convex = true;
        for (let i = 0; i < raw.length && convex; i++) {
            const pl = planes[i];
            if (!pl) continue;
            const s = Math.sign(pl.n.dot(raw[i].inward) - pl.c) || -1;
            if (verts.some(v => s * (pl.n.dot(v.k) - pl.c) < -1e-7)) convex = false;
        }

        // ---- the Delaunay cells, up to the group: vertex cycles of D ----
        const vc = makeUF(V.length);
        V.forEach((v, u) => { for (const m of v.walls) { const u2 = findVertex(walls[m].gi.apply(v.k)); if (u2 >= 0) vc.union(u, u2); } });
        const classes = new Map();
        V.forEach((v, u) => { const r = vc.find(u); if (!classes.has(r)) classes.set(r, []); classes.get(r).push(u); });
        const cellInfo = [], cuspInfo = [];
        for (const [, us] of classes) {
            if (V[us[0]].ideal) { cuspInfo.push(us.length); continue; }
            const size = cellSize[us[0]];
            cellInfo.push({ size, symmetry: Math.round(size / us.length) });
        }

        // Geometric edges: runs of bending lines through straight joints; their
        // ends are the corners.
        let geoEdges = 0;
        if (dim === 3) {
            const E3 = lines;
            const at = new Map();
            E3.forEach((l, i) => [l.a, l.b].forEach(v => { if (!at.has(v)) at.set(v, []); at.get(v).push(i); }));
            const lu = makeUF(E3.length);
            for (const [v, list] of at) {
                if (list.length !== 2) continue;
                const [l1, l2] = list.map(i => E3[i]);
                if (collinear(l1.a === v ? l1.b : l1.a, v, l2.a === v ? l2.b : l2.a)) lu.union(list[0], list[1]);
            }
            geoEdges = new Set(E3.map((_, i) => lu.find(i))).size;
            for (const [v, list] of at) {
                const straight = list.length === 2 && lu.find(list[0]) === lu.find(list[1]);
                if (!straight) verts[v].corner = true;
            }
        }
        const corners = verts.filter(v => v.corner);
        const simplices = flags.map((f, n) => ({ pts: f.pts, ideal: f.ideal, T: T[n] }));
        return {
            ok: true, dim, basepoint: F0.apply(p), centre, simplices, raw, sides, pairs, faces, lines, chains,
            vertices: verts, cycles, relators, convex,
            stats: {
                cells: cellInfo.length, cellSizes: cellInfo.map(c => c.size), cellSymmetry: cellInfo.map(c => c.symmetry),
                cusps: cuspInfo.length, pieces: flags.length, facets: raw.length,
                faces: faces.length, sides: sides.length, pairs: pairs.length, mirrors,
                edges: geoEdges, chains: chains.length, cycles: cycles.length,
                vertices: corners.filter(v => v.kind === 'orbit').length,
                conePoints: corners.filter(v => !v.ideal && v.kind !== 'orbit').length,
                idealVertices: corners.filter(v => v.ideal).length,
                dirichlet: { faces: home.walls.length, vertices: V.length, edges: E.length }
            }
        };
    } catch (err) {
        return fail('error', err.message);
    }
}

/** Hyperbolic volume of the domain: the sum over its pieces (each has p as a corner). */
export function delaunayVolume(R) {
    let vol = 0;
    for (const s of R.simplices) vol += simplexVolume(s.pts, s.pts[0]);
    return vol;
}

/**
 * The Dirichlet domain the plane picture is built from: one centred at a
 * point of the plane P (y = 0) with trivial stabilizer. The home domain
 * itself when its centre is such a point; otherwise — the basepoint is fixed
 * by an elliptic, and the canonical domain's centre was nudged off P — the
 * Dirichlet domain at a point nudged a little ALONG P. Returns { home, frame }:
 * pass both to computeDelaunayDomain (frame carries the result back home).
 * `gens` are the home-frame generators.
 */
export function planarHome(home, gens, { maxFaces = 96, maxDepth = 8 } = {}) {
    const onPlane = Math.abs(home.conePoint.y) < 1e-9;
    if (onPlane && !(home.stabilizer && home.stabilizer.order > 1)) return { home, frame: null };
    for (const angle of [0.7, 2.1, 3.6, 5.0]) {
        const T = translationTowards(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), PLANE_NUDGE);
        const Ti = T.inv().normalized();
        const moved = gens.flatMap(g => { const c = Ti.mul(g).mul(T).normalized(); return [c, c.inv().normalized()]; });
        const D = computeCanonicalDomain(moved, Matrix2x2.identity(), maxFaces, { maxDepth });
        if (D.stabilizer.order > 1 || !D.walls.length || D.walls.some(w => !w.pairing)) continue;
        return { home: { walls: D.walls, poly: D.poly, conePoint: D.conePoint, stabilizer: D.stabilizer }, frame: T };
    }
    return { home, frame: null };
}
