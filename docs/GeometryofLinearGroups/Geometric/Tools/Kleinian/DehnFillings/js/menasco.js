// menasco.js — the two ideal polyhedra of an alternating diagram (Menasco, after Thurston).
import { standardPlacement, placeAcross } from './develop.js';
//
// Put a crossing arc at every crossing and cut S³ ∖ K along the two checkerboard surfaces: two
// balls remain, P⁺ above the projection plane and P⁻ below. Shrinking every overpass (every
// underpass) to a point makes P⁺ (P⁻) an ideal polyhedron:
//   ideal vertices  the crossings (the overpass, or underpass, through each one)
//   edges           the edges of the projection graph: along the graph edge e, P⁺ carries the
//                   crossing arc at e's under-end and P⁻ the one at its over-end, both oriented
//                   (under → over) from e's over-end to its under-end
//   faces           the regions; region F of P⁺ is glued to region F of P⁻ by the identity of
//                   the region, which moves every corner one step around F (the twist)
// Two-sided regions collapse to single edges. For the figure-eight both polyhedra become
// tetrahedra, and the result is Thurston's triangulation (SnapPy's m004).

/** The diagram's combinatorics, from foldData's visits and faces. */
export function diagram(fold) {
    const visits = fold.visits.map(([type, crossing, sign]) => ({ type, crossing, sign }));
    const M = visits.length, n = fold.crossings.length;
    for (let k = 0; k < M; k++) {
        if (visits[k].type === visits[(k + 1) % M].type) throw new Error('the diagram is not alternating');
    }
    const from = (k) => visits[k].crossing, to = (k) => visits[(k + 1) % M].crossing;
    const overEnd = (k) => (visits[k].type === 'O' ? from(k) : to(k));
    const underEnd = (k) => (visits[k].type === 'O' ? to(k) : from(k));
    const dart = (d) => {
        const k = d >> 1, fwd = (d & 1) === 0;
        return { edge: k, from: fwd ? from(k) : to(k), to: fwd ? to(k) : from(k) };
    };
    const faces = fold.faces.map((f, i) => {
        const ds = f.darts.map(dart);
        return {
            index: i,
            darts: f.darts,
            edges: ds.map((d) => d.edge),
            corners: ds.map((d) => d.from),
            plus: ds.map((d) => overEnd(d.edge)),       // the vertices of F in P⁺
            minus: ds.map((d) => underEnd(d.edge)),     // and in P⁻
            outer: f.outer,
            bigon: f.darts.length === 2,
        };
    });
    // checkerboard: the two sides of every edge get different colors
    const side = new Map();
    faces.forEach((F) => F.darts.forEach((d) => side.set(d, F.index)));
    const color = new Array(faces.length).fill(-1);
    color[0] = 0;
    const queue = [0];
    while (queue.length) {
        const i = queue.shift();
        for (const d of faces[i].darts) {
            const j = side.get(d ^ 1);
            if (color[j] < 0) { color[j] = 1 - color[i]; queue.push(j); }
            else if (color[j] === color[i]) throw new Error('the regions are not 2-colorable');
        }
    }
    faces.forEach((F) => { F.shaded = color[F.index] === 1; });
    // the under-strand edges at each crossing (where the crossing arc's lower end sits) and the
    // over-strand edges (its upper end)
    const underEdges = Array.from({ length: n }, () => []), overEdges = Array.from({ length: n }, () => []);
    for (let k = 0; k < M; k++) {
        underEdges[underEnd(k)].push(k);
        overEdges[overEnd(k)].push(k);
    }
    return { n, M, visits, faces, from, to, overEnd, underEnd, underEdges, overEdges };
}

/**
 * Combinatorial isomorphisms from a triangulation `A` (array of {nbr, glu}) to a census
 * triangulation `B` (Triangulation.tets), as { tetMap, perm } with perm[t][v] the vertex of
 * B's tetrahedron tetMap[t] that vertex v of A's tetrahedron t goes to. Orientation-preserving
 * maps (even permutations, both sides in SnapPea's convention) come first.
 */
export function isomorphisms(A, B) {
    if (A.length !== B.length) return [];
    const perms = [];
    const rec = (p, rest) => { if (!rest.length) perms.push(p); else rest.forEach((x, i) => rec([...p, x], rest.filter((_, j) => j !== i))); };
    rec([], [0, 1, 2, 3]);
    const parity = (p) => { let c = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) c++; return c & 1; };
    const found = [];
    for (let c0 = 0; c0 < B.length; c0++) {
        for (const p0 of perms) {
            const tetMap = new Array(A.length).fill(-1), perm = new Array(A.length).fill(null);
            tetMap[0] = c0; perm[0] = p0;
            const queue = [0];
            let ok = true;
            while (queue.length && ok) {
                const t = queue.shift();
                for (let f = 0; f < 4 && ok; f++) {
                    const u = A[t].nbr[f], s = A[t].glu[f];
                    const c = tetMap[t], phi = perm[t];
                    const cf = phi[f];
                    const cu = B[c].nbr[cf], tau = B[c].glu[cf];
                    // φ_u = τ ∘ φ_t ∘ s⁻¹
                    const phiU = new Array(4);
                    for (let i = 0; i < 4; i++) phiU[s[i]] = tau[phi[i]];
                    if (tetMap[u] < 0) {
                        if (tetMap.includes(cu)) { ok = false; break; }
                        tetMap[u] = cu; perm[u] = phiU; queue.push(u);
                    } else if (tetMap[u] !== cu || perm[u].some((x, i) => x !== phiU[i])) ok = false;
                }
            }
            if (ok && tetMap.every((x) => x >= 0)) found.push({ tetMap, perm, orientation: parity(perm[0]) === 0 ? 1 : -1 });
        }
    }
    return found.sort((x, y) => y.orientation - x.orientation);
}

/**
 * Everything the Fold view needs for a census entry with fold data: the diagram, its ideal
 * triangulation (and shapes, from tools/menasco_shapes.py), and the isomorphisms to the census
 * triangulation when it is the same one (the figure-eight), which tie the Fold view's colors and
 * arrows to the Polyhedron view's.
 */
export function foldModel(fold, tri) {
    const D = diagram(fold);
    let MT;
    try { MT = menascoTriangulation(D); } catch (err) { return { D, supported: false, why: err.message }; }
    if (!fold.shapes || fold.shapes.length !== MT.tets.length) return { D, MT, supported: false, why: 'no shapes for the diagram triangulation (run tools/menasco_shapes.py)' };
    const isos = isomorphisms(MT.tets, tri.tets);
    return { D, MT, isos, supported: true };
}

/** The twist regions (chains of crossings joined by two-sided regions), with alternating signs along each chain. */
export function twistRegions(D) {
    const nb = Array.from({ length: D.n }, () => []);
    for (const F of D.faces) if (F.bigon) { const [u, v] = F.corners; nb[u].push(v); nb[v].push(u); }
    const cls = new Array(D.n).fill(-1), sign = new Array(D.n).fill(0);
    let c = 0;
    for (let s = 0; s < D.n; s++) {
        if (cls[s] >= 0) continue;
        // start from an end of the chain
        let start = s;
        const seen = new Set([s]);
        for (let x = s; ;) { const y = nb[x].find((w) => !seen.has(w)); if (y === undefined) break; seen.add(y); x = y; start = x; }
        const queue = [start];
        cls[start] = c; sign[start] = 1;
        while (queue.length) {
            const x = queue.shift();
            for (const y of nb[x]) if (cls[y] < 0) { cls[y] = c; sign[y] = -sign[x]; queue.push(y); }
        }
        c++;
    }
    return { cls, sign, count: c };
}

/**
 * The dictionary between the diagram and the triangulation:
 *   regionSlot(F)      the color slot of region F (its census face pair, or its order)
 *   arc[u]             the edge class of the crossing arc at u, and the sign relating its
 *                      under → over orientation to the class's orientation
 *   classAlong(s, k)   the same for the edge of half s along graph edge k (oriented over-end →
 *                      under-end): P⁺ carries the arc at k's under-end, P⁻ the one at its over-end
 * With an isomorphism to the census triangulation the classes and face pairs are the census ones
 * (as in the Polyhedron view); without, a class is a twist region (arcs alternate along it).
 */
export function dictionary(model, tri, iso = null) {
    const { D, MT } = model;
    const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    if (iso) {
        const regionPair = new Map();
        MT.halves.faces.forEach((F, i) => {
            const b = MT.boundary[0][i][0];
            const t = b.tet, f = [0, 1, 2, 3].find((j) => !b.labels.includes(MT.tets[t].labels[j]));
            regionPair.set(F.index, tri.pairOf[iso.tetMap[t]][iso.perm[t][f]]);
        });
        const classAlong = (side, k) => {
            const a = D.overEnd(k), b = D.underEnd(k);
            const t = MT.tets.findIndex((T) => T.side === side && T.labels.includes(a) && T.labels.includes(b));
            const pa = iso.perm[t][MT.tets[t].labels.indexOf(a)], pb = iso.perm[t][MT.tets[t].labels.indexOf(b)];
            const c = iso.tetMap[t];
            const e = EDGES.findIndex(([x, y]) => (x === pa && y === pb) || (x === pb && y === pa));
            const cls = tri.edgeOf[c][e];
            const occ = tri.edgeClasses[cls].find((o) => o.tet === c && o.edge === e);
            return { cls, sign: occ.a === pa ? 1 : -1 };
        };
        const arc = Array.from({ length: D.n }, (_, u) => classAlong(0, D.underEdges[u][0]));
        return { regionPair, pairColor: true, arc, classAlong };
    }
    const T = twistRegions(D);
    const regionPair = new Map();
    MT.halves.faces.forEach((F, i) => regionPair.set(F.index, i));
    const arc = Array.from({ length: D.n }, (_, u) => ({ cls: T.cls[u], sign: T.sign[u] }));
    const classAlong = (side, k) => arc[side ? D.overEnd(k) : D.underEnd(k)];
    return { regionPair, pairColor: false, arc, classAlong };
}

// ---------------- any alternating diagram: P± cut into tetrahedra ----------------
//
// After the two-sided regions collapse, a twist region of t crossings leaves t − 2 two-valent
// vertices in each half, so the halves are no longer polyhedra with geodesic realizations and
// must be cut into ideal tetrahedra. Each half is coned from one of its vertices v: a tetrahedron
// over every fan triangle of every face not containing v. That covers the half when every other
// vertex lies on a face missing v, and no edge has both of its faces through v (which would leave
// a zero-volume pillow). Each region is then triangulated twice, by the fans of its two copies;
// the apexes are chosen so that the twist matches them wherever possible, and where it cannot a
// stack of flip tetrahedra turns one fan into the other. Orientations are made consistent last.

/** The polyhedron structure of both halves: faces with their vertex cycles and boundary edges. */
export function halves(D) {
    // graph edges merged across two-sided regions: one polyhedron edge per class
    const parent = Array.from({ length: D.M }, (_, k) => k);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const F of D.faces) if (F.bigon) parent[find(F.edges[0])] = find(F.edges[1]);
    const faces = D.faces.filter((F) => !F.bigon);
    const sides = [0, 1].map((s) => faces.map((F) => {
        const cyc = s ? F.minus : F.plus;
        const k = cyc.length;
        // the polyhedron edge between cyc[j] and cyc[j+1]: the graph edge of F joining them
        const edges = cyc.map((x, j) => {
            const y = cyc[(j + 1) % k];
            const e = F.edges.find((g) => { const a = D.overEnd(g), b = D.underEnd(g); return (a === x && b === y) || (a === y && b === x); });
            if (e === undefined) throw new Error('a face edge is missing');
            return find(e);
        });
        return { F, cyc, edges };
    }));
    // each polyhedron edge has two faces
    for (const S of sides) {
        const count = new Map();
        S.forEach((f, i) => f.edges.forEach((e) => count.set(e, [...(count.get(e) || []), i])));
        for (const [e, fs] of count) if (fs.length !== 2) throw new Error(`edge ${e} has ${fs.length} faces`);
        S.edgeFaces = count;
    }
    // the twist: on region F, P⁺'s vertex plus[j] is glued to P⁻'s vertex minus[j]
    const tau = faces.map((F) => { const m = new Map(); F.plus.forEach((x, j) => m.set(x, F.minus[j])); return m; });
    return { faces, sides, tau, n: D.n };
}

/** Can side S be coned from v? */
function coneOK(S, v, n) {
    for (let w = 0; w < n; w++) {
        if (w === v) continue;
        if (!S.some((f) => f.cyc.includes(w) && !f.cyc.includes(v))) return false;
    }
    for (const [, fs] of S.edgeFaces) {
        const [a, b] = fs;
        if (S[a].cyc.includes(v) && S[b].cyc.includes(v)) {
            // allowed only if the edge itself ends at v
            const e = [...S.edgeFaces].find(([, x]) => x === fs)[0];
            const j = S[a].edges.indexOf(e);
            const x = S[a].cyc[j], y = S[a].cyc[(j + 1) % S[a].cyc.length];
            if (x !== v && y !== v) return false;
        }
    }
    return true;
}

/** Triangulations of a k-gon (vertex indices 0…k−1) as sets of diagonals; shortest flip path between two. */
function flipPath(k, from, to) {
    const key = (ds) => ds.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)).sort().join(',');
    const start = from.map((d) => d.slice()), goal = key(to);
    const prev = new Map([[key(start), null]]);
    const queue = [start];
    const adjacent = (a, b) => (b - a + k) % k === 1 || (a - b + k) % k === 1;
    while (queue.length) {
        const T = queue.shift();
        const kT = key(T);
        if (kT === goal) {
            const path = [];
            for (let s = kT; prev.get(s); s = prev.get(s).from) path.unshift(prev.get(s).flip);
            return path;
        }
        // each diagonal sits in two triangles; flipping it swaps it for the other diagonal of their quad
        const edgesOf = (x) => {
            const nb = new Set();
            for (let y = 0; y < k; y++) if (y !== x && (adjacent(x, y) || T.some(([a, b]) => (a === x && b === y) || (a === y && b === x)))) nb.add(y);
            return nb;
        };
        for (let i = 0; i < T.length; i++) {
            const [p, q] = T[i];
            const np = edgesOf(p), nq = edgesOf(q);
            const common = [...np].filter((x) => nq.has(x));
            // the two triangles on diagonal pq: the common neighbors on either side of pq
            const sideOf = (x) => { const a = (x - p + k) % k, b = (q - p + k) % k; return a < b; };
            const left = common.filter(sideOf), right = common.filter((x) => !sideOf(x));
            for (const r of left) for (const s of right) {
                // pqr and pqs must be triangles of T: no diagonal of T crosses them
                const tri = (a, b, c) => [[a, b], [b, c], [a, c]].every(([x, y]) => adjacent(x, y) || T.some(([u, w]) => (u === x && w === y) || (u === y && w === x)))
                    && !T.some(([u, w]) => crosses(k, [u, w], [a, b]) || crosses(k, [u, w], [b, c]) || crosses(k, [u, w], [a, c]));
                if (!tri(p, q, r) || !tri(p, q, s)) continue;
                const U = T.slice(); U[i] = [r, s];
                const kU = key(U);
                if (!prev.has(kU)) { prev.set(kU, { from: kT, flip: { p, q, r, s } }); queue.push(U); }
            }
        }
    }
    throw new Error('no flip path');
}
function crosses(k, [a, b], [c, d]) {
    if (a === c || a === d || b === c || b === d) return false;
    const between = (x, u, v) => { const s = (x - u + k) % k, t = (v - u + k) % k; return s > 0 && s < t; };
    return between(c, a, b) !== between(d, a, b);
}
/** The fan of a k-gon from vertex A, as diagonals. */
const fanDiagonals = (k, A) => { const out = []; for (let j = 2; j <= k - 2; j++) out.push([A, (A + j) % k]); return out; };

/**
 * The ideal triangulation of S³ ∖ K from the two halves: tets with side (0 = P⁺, including its
 * flip tetrahedra; 1 = P⁻), the crossing at each vertex, and gluings. Chooses the cone vertices
 * and fan apexes to use as few tetrahedra as possible.
 */
export function menascoTriangulation(D) {
    const Hh = halves(D);
    const { faces, sides, tau, n } = Hh;
    let best = null;
    for (let vp = 0; vp < n; vp++) {
        if (!coneOK(sides[0], vp, n)) continue;
        for (let vm = 0; vm < n; vm++) {
            if (!coneOK(sides[1], vm, n)) continue;
            // fan apexes (as indices into the face's cycle; the cycles of a region agree index by index)
            const apex = faces.map((F, i) => {
                const k = F.plus.length;
                const ip = sides[0][i].cyc.indexOf(vp), im = sides[1][i].cyc.indexOf(vm);
                if (ip >= 0 && im >= 0) return [ip, im];
                if (ip >= 0) return [ip, ip];
                if (im >= 0) return [im, im];
                return [0, 0].map(() => (k > 3 ? 0 : 0));
            });
            let tets = 0, flips = 0;
            faces.forEach((F, i) => {
                const k = F.plus.length;
                if (!sides[0][i].cyc.includes(vp)) tets += k - 2;
                if (!sides[1][i].cyc.includes(vm)) tets += k - 2;
                if (k > 3 && apex[i][0] !== apex[i][1]) flips += flipPath(k, fanDiagonals(k, apex[i][0]), fanDiagonals(k, apex[i][1])).length;
            });
            const score = tets + flips;
            if (!best || score < best.score) best = { vp, vm, apex, score, tets, flips };
        }
    }
    if (!best) throw new Error('no cone vertices work for this diagram');
    return build(D, Hh, best);
}

function build(D, Hh, choice) {
    const { faces, sides, tau } = Hh;
    const tets = [];
    const glue = (t, f, u, g, map) => {
        // vertices of t's face f go to u's vertices through the crossing map `map`
        const s = new Array(4);
        for (let i = 0; i < 4; i++) if (i !== f) {
            const j = tets[u].labels.indexOf(map(tets[t].labels[i]));
            if (j < 0 || j === g) throw new Error('bad gluing');
            s[i] = j;
        }
        s[f] = g;
        if (tets[t].nbr[f] !== undefined || tets[u].nbr[g] !== undefined) throw new Error('face glued twice');
        tets[t].nbr[f] = u; tets[t].glu[f] = s;
        const inv = new Array(4);
        s.forEach((j, i) => { inv[j] = i; });
        tets[u].nbr[g] = t; tets[u].glu[g] = inv;
    };
    const id = (x) => x;
    const faceOf = (t, labels3) => [0, 1, 2, 3].find((i) => !labels3.includes(tets[t].labels[i]));
    // boundary triangles of each region on each side: { labels (in that side's crossings), tet }
    const boundary = [0, 1].map(() => faces.map(() => []));
    for (const side of [0, 1]) {
        const v = side ? choice.vm : choice.vp;
        const S = sides[side];
        const fanTets = S.map(() => []);           // per face: tets of its fan triangles, in order
        S.forEach((f, i) => {
            const k = f.cyc.length;
            const a = f.cyc.includes(v) ? f.cyc.indexOf(v) : choice.apex[i][side];
            const order = Array.from({ length: k }, (_, j) => f.cyc[(a + j) % k]);
            f.order = order;
            if (f.cyc.includes(v)) return;
            for (let j = 1; j <= k - 2; j++) {
                const t = tets.length;
                tets.push({ side, flip: false, labels: [v, order[0], order[j], order[j + 1]], nbr: [], glu: [], face: i });
                fanTets[i].push(t);
                boundary[side][i].push({ labels: [order[0], order[j], order[j + 1]], tet: t });
            }
            // consecutive fan tetrahedra share the diagonal's cone face
            for (let j = 0; j + 1 < fanTets[i].length; j++) {
                const t = fanTets[i][j], u = fanTets[i][j + 1];
                glue(t, faceOf(t, [v, order[0], order[j + 2]]), u, faceOf(u, [v, order[0], order[j + 2]]), id);
            }
        });
        // across each polyhedron edge xy (not at v): the cone faces vxy of the two faces' tetrahedra,
        // or a boundary triangle of a face through v
        for (const [e, [i1, i2]] of S.edgeFaces) {
            const j = S[i1].edges.indexOf(e);
            const x = S[i1].cyc[j], y = S[i1].cyc[(j + 1) % S[i1].cyc.length];
            if (x === v || y === v) continue;
            const tetWith = (i) => fanTets[i].find((t) => tets[t].labels.includes(x) && tets[t].labels.includes(y));
            const has1 = S[i1].cyc.includes(v), has2 = S[i2].cyc.includes(v);
            if (!has1 && !has2) {
                const t = tetWith(i1), u = tetWith(i2);
                glue(t, faceOf(t, [v, x, y]), u, faceOf(u, [v, x, y]), id);
            } else {
                const [iv, io] = has1 ? [i1, i2] : [i2, i1];   // face iv contains v: its triangle vxy is boundary
                const t = tetWith(io);
                boundary[side][iv].push({ labels: [v, x, y], tet: t });
            }
        }
    }
    // order each region's boundary triangles along its fan, and stack flips where the fans differ
    let flips = 0;
    faces.forEach((F, i) => {
        const k = F.plus.length;
        const cur = boundary[0][i].map((b) => ({ labels: b.labels.slice(), tet: b.tet }));
        const A0 = sides[0][i].order[0], A1 = sides[1][i].order[0];
        const ia0 = F.plus.indexOf(A0), ia1 = F.minus.indexOf(A1);
        if (k > 3 && ia0 !== ia1) {
            const path = flipPath(k, fanDiagonals(k, ia0), fanDiagonals(k, ia1));
            for (const { p, q, r, s } of path) {
                const [P, Q, R, Sx] = [p, q, r, s].map((j) => F.plus[j]);
                const t = tets.length;
                tets.push({ side: 0, flip: true, labels: [P, Q, R, Sx], nbr: [], glu: [], face: i });
                flips++;
                // the two current triangles pqr and pqs are glued to the flip tetrahedron's faces
                for (const tri of [[P, Q, R], [P, Q, Sx]]) {
                    const at = cur.findIndex((c) => tri.every((x) => c.labels.includes(x)));
                    const c = cur[at];
                    glue(c.tet, faceOf(c.tet, tri), t, faceOf(t, tri), id);
                    cur.splice(at, 1);
                }
                cur.push({ labels: [P, R, Sx], tet: t }, { labels: [Q, R, Sx], tet: t });
            }
        }
        // glue across the region: P⁺'s triangle xyz to P⁻'s triangle τx τy τz
        const T = tau[i];
        for (const c of cur) {
            const img = c.labels.map((x) => T.get(x));
            const m = boundary[1][i].find((b) => img.every((x) => b.labels.includes(x)));
            if (!m) throw new Error('the two fans of a region do not match');
            glue(c.tet, faceOf(c.tet, c.labels), m.tet, faceOf(m.tet, img), (x) => T.get(x));
        }
        boundary[0][i] = cur;
    });
    for (const t of tets) if (t.nbr.length !== 4 || t.nbr.some((x) => x === undefined)) throw new Error('a face is not glued');
    orient(tets);
    return { tets, choice, flips, boundary, halves: Hh };
}

/** Relabel tetrahedra so that every gluing reverses orientation (SnapPea's convention for oriented manifolds). */
function orient(tets) {
    const parity = (p) => { let c = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) c++; return c & 1; };
    // The fan order of the first cone tetrahedron gives the mirror image of S³'s orientation
    // (checked against SnapPy for every census knot: tools/menasco_shapes.py), so start reversed.
    const sign = new Array(tets.length).fill(0);
    sign[0] = -1;
    const queue = [0];
    while (queue.length) {
        const t = queue.shift();
        for (let f = 0; f < 4; f++) {
            const u = tets[t].nbr[f];
            const want = parity(tets[t].glu[f]) === 1 ? sign[t] : -sign[t];
            if (!sign[u]) { sign[u] = want; queue.push(u); } else if (sign[u] !== want) throw new Error('not orientable');
        }
    }
    // swap vertices 2 and 3 of every tetrahedron with sign −1
    const swap = (i) => (i === 2 ? 3 : i === 3 ? 2 : i);
    const flipT = sign.map((s) => s < 0);
    for (let t = 0; t < tets.length; t++) {
        const T = tets[t];
        const nbr = new Array(4), glu = new Array(4);
        for (let f = 0; f < 4; f++) {
            const f2 = flipT[t] ? swap(f) : f;
            const u = T.nbr[f];
            nbr[f2] = u;
            glu[f2] = new Array(4);
            for (let i = 0; i < 4; i++) {
                const j = T.glu[f][i];
                glu[f2][flipT[t] ? swap(i) : i] = flipT[u] ? swap(j) : j;
            }
        }
        T.nbr = nbr; T.glu = glu;
        if (flipT[t]) [T.labels[2], T.labels[3]] = [T.labels[3], T.labels[2]];
    }
}

/**
 * Develop the two halves with their complete shapes: P⁺'s tetrahedra (with its flip tetrahedra)
 * through their internal faces, then one P⁻ tetrahedron across a region, then the rest of P⁻.
 * Every crossing gets one position (a point of CP¹) in each half. Returns the positions and the
 * region P⁻ docks along.
 */
export function developHalves(MT, shapes) {
    const z = shapes.map(([re, im]) => ({ re, im }));
    const tets = MT.tets;
    const P = new Array(tets.length).fill(null);
    const pos = [new Map(), new Map()];
    const tri = { tets };
    const record = (t) => tets[t].labels.forEach((x, i) => { if (!pos[tets[t].side].has(x)) pos[tets[t].side].set(x, P[t][i]); });
    const spread = (start) => {
        const side = tets[start].side, queue = [start];
        while (queue.length) {
            const t = queue.shift();
            for (let f = 0; f < 4; f++) {
                const u = tets[t].nbr[f];
                if (tets[u].side !== side || P[u]) continue;
                P[u] = placeAcross(tri, z, t, f, P[t]).Q;
                record(u);
                queue.push(u);
            }
        }
    };
    const t0 = tets.findIndex((t) => t.side === 0);
    P[t0] = standardPlacement(z[t0], 0);
    record(t0);
    spread(t0);
    let dock = null;
    for (let t = 0; t < tets.length && !dock; t++) {
        if (tets[t].side !== 0) continue;
        for (let f = 0; f < 4; f++) {
            const u = tets[t].nbr[f];
            if (tets[u].side !== 1) continue;
            P[u] = placeAcross(tri, z, t, f, P[t]).Q;
            record(u);
            const labels = tets[t].labels.filter((_, j) => j !== f);
            const region = MT.boundary[0].findIndex((list) => list.some((b) => b.tet === t && labels.every((x) => b.labels.includes(x))));
            dock = { t, f, u, region };
            break;
        }
    }
    spread(dock.u);
    return { P, pos, dock };
}
