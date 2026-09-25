/**
 * Exact combinatorics of a convex hyperbolic polyhedron, computed in the
 * Klein model.
 *
 * A wall covector W = (w1, w2, w3, w0) cuts out the half-space ⟨X, W⟩ < 0 of
 * the hyperboloid. In the Klein model, where the hyperboloid point X is a
 * multiple of (k, 1), that is the Euclidean half-space
 *
 *        n·k < c,     n = (w1, w2, w3),  c = w0,
 *
 * so the domain is an honest Euclidean convex polyhedron inside the unit ball:
 * faces are flat polygons, edges are straight segments, and an ideal vertex is
 * a point of the unit sphere where three or more face planes meet. Everything
 * below is therefore linear algebra — no sampling. In particular an edge of any
 * length is found, which a sampled search along wall∩wall circles cannot
 * guarantee (a short edge falls between the samples, and its cycle then goes
 * unchecked by the certifier).
 *
 * Normalised covectors have |n|² − c² = 1, so |n| ≥ 1 and the residual
 * n·k − c is a well-scaled measure of how far k is from the plane.
 */
// Relative (not the bare 'three' specifier) so the engine also loads in a Web
// Worker, where import maps do not apply. Same URL as the pages' import maps.
import * as THREE from '../../../Geometric/Tools/Kleinian/vendor/three/three.module.js';

const PLANE_TOL = 1e-9;       // |n·k − c| below this: k lies on the plane
const PARALLEL_TOL = 1e-12;   // |n_i × n_j|² below this: parallel planes
const LEN_TOL = 1e-9;         // Klein-parameter length of a genuine edge
const VERTEX_TOL = 1e-7;      // Klein distance for merging vertices
const IDEAL_TOL = 1e-9;       // 1 − |k|² below this: on the sphere at infinity
const ANGLE_TOL = 1e-9;       // radians, for wedge degeneracy
const ARC_SLACK_TOL = 1e-10;  // Klein distance a short free arc must clear the other walls by

// ---------------- model changes ----------------

/** Poincaré-ball point → Klein-model point. */
export function ballToKlein(p) {
    const s = 2 / (1 + p.x * p.x + p.y * p.y + p.z * p.z);
    return new THREE.Vector3(p.x * s, p.y * s, p.z * s);
}

/** Klein-model point → Poincaré-ball point (points on the sphere stay put). */
export function kleinToBall(k) {
    const r2 = k.x * k.x + k.y * k.y + k.z * k.z;
    const f = 1 / (1 + Math.sqrt(Math.max(0, 1 - r2)));
    return new THREE.Vector3(k.x * f, k.y * f, k.z * f);
}

const plane = (W) => ({ n: new THREE.Vector3(W.x, W.y, W.z), c: W.w });

// ---------------- arcs on a circle ----------------

/**
 * Feasible set of θ ∈ [0, 2π) for the constraints  A cos θ + B sin θ ≤ C.
 * Each constraint is an arc (or everything / nothing), and the intersection of
 * arcs is returned as a list of disjoint [a, b] intervals with a < b, measured
 * in radians from θ = 0. Used for the parts of a wall's boundary circle that
 * the other walls leave free.
 */
function feasibleArcs(constraints) {
    let arcs = [[0, 2 * Math.PI]];
    for (const { A, B, C } of constraints) {
        const R = Math.hypot(A, B);
        if (R < 1e-15) {
            if (C < -PLANE_TOL) return [];
            continue;
        }
        if (C >= R) continue;                 // always satisfied
        if (C <= -R) return [];               // never satisfied
        // R cos(θ − φ) ≤ C  ⇔  θ − φ ∈ [δ, 2π − δ],  δ = acos(C/R)
        const phi = Math.atan2(B, A);
        const delta = Math.acos(C / R);
        let lo = phi + delta, hi = phi + 2 * Math.PI - delta;
        lo = ((lo % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        hi = lo + (2 * Math.PI - 2 * delta);
        const allowed = hi <= 2 * Math.PI ? [[lo, hi]] : [[lo, 2 * Math.PI], [0, hi - 2 * Math.PI]];
        const next = [];
        for (const [a, b] of arcs) {
            for (const [c, d] of allowed) {
                const x = Math.max(a, c), y = Math.min(b, d);
                if (y > x) next.push([x, y]);
            }
        }
        arcs = next;
        if (arcs.length === 0) return [];
    }
    return arcs;
}

// ---------------- the polyhedron ----------------

/**
 * Build the combinatorial polyhedron of the walls.
 *
 * @param walls  [{cov: Vector4}] with ⟨cov, cov⟩ = 1, domain side ⟨X,cov⟩ < 0
 * @returns {{
 *   planes, vertices: [{k, ideal, walls:number[]}],
 *   edges: [{id, i, j, extra:number[], p0, d, lo, hi, a, b, angle}],
 *   faces: [{wall, edges:number[], vertices:number[]}],
 *   freeArcs: [{wall, arcs}], finiteVolume: boolean
 * }}
 *   Edges carry the ACTIVE face pair (i, j): when three or more planes contain
 *   the same line, a wedge analysis picks the two that actually bound the
 *   domain there, and the rest are listed in `extra`. Endpoints `a`, `b` index
 *   `vertices` (a at parameter lo, b at hi; the point is p0 + t·d).
 */
export function buildPolyhedron(walls) {
    const P = walls.map(w => plane(w.cov));
    const nW = P.length;
    const vertices = [];
    const edges = [];

    const findVertex = (k) => {
        for (let v = 0; v < vertices.length; v++) {
            if (vertices[v].k.distanceToSquared(k) < VERTEX_TOL * VERTEX_TOL) return v;
        }
        const incident = [];
        for (let m = 0; m < nW; m++) {
            if (Math.abs(P[m].n.dot(k) - P[m].c) < 1e-7 * P[m].n.length()) incident.push(m);
        }
        vertices.push({ k: k.clone(), ideal: 1 - k.lengthSq() < 1e-7, walls: incident });
        return vertices.length - 1;
    };

    for (let i = 0; i < nW; i++) {
        for (let j = i + 1; j < nW; j++) {
            const ni = P[i].n, nj = P[j].n, ci = P[i].c, cj = P[j].c;
            const d = new THREE.Vector3().crossVectors(ni, nj);
            const dd = d.lengthSq();
            if (dd < PARALLEL_TOL * ni.lengthSq() * nj.lengthSq()) continue;
            // Point of the line nearest the origin (it lies in span(ni, nj)).
            const nn = ni.dot(nj);
            const p0 = ni.clone().multiplyScalar(ci * nj.lengthSq() - cj * nn)
                .addScaledVector(nj, cj * ni.lengthSq() - ci * nn)
                .multiplyScalar(1 / dd);
            const r2 = p0.lengthSq();
            if (r2 >= 1 - IDEAL_TOL) continue;              // the line misses the ball
            const dir = d.multiplyScalar(1 / Math.sqrt(dd));
            const R = Math.sqrt(1 - r2);                    // p0 ⊥ dir
            let lo = -R, hi = R;
            const containing = [i, j];
            let empty = false;
            for (let m = 0; m < nW && !empty; m++) {
                if (m === i || m === j) continue;
                const a = P[m].n.dot(dir), b = P[m].c - P[m].n.dot(p0);
                const scale = P[m].n.length();
                if (Math.abs(a) < 1e-12 * scale) {
                    if (b < -PLANE_TOL * scale) empty = true;             // line outside
                    else if (b <= PLANE_TOL * scale) containing.push(m);  // plane contains line
                    continue;
                }
                const t = b / a;
                if (a > 0) { if (t < hi) hi = t; }
                else if (t > lo) lo = t;
                if (hi - lo <= LEN_TOL) empty = true;
            }
            if (empty || hi - lo <= LEN_TOL) continue;

            // Several planes through one line: only the lowest pair emits it,
            // and a wedge analysis in the normal plane picks the active faces.
            let ai = i, aj = j, extra = [];
            if (containing.length > 2) {
                containing.sort((x, y) => x - y);
                if (containing[0] !== i || containing[1] !== j) continue;
                const wedge = activePair(dir, containing.map(m => P[m].n), containing);
                if (!wedge) continue;                       // flat or empty: not an edge
                ai = wedge.i; aj = wedge.j;
                extra = containing.filter(m => m !== ai && m !== aj);
            }
            const ka = p0.clone().addScaledVector(dir, lo);
            const kb = p0.clone().addScaledVector(dir, hi);
            const Wi = walls[ai].cov, Wj = walls[aj].cov;
            const ip = Wi.x * Wj.x + Wi.y * Wj.y + Wi.z * Wj.z - Wi.w * Wj.w;
            edges.push({
                id: edges.length,
                i: Math.min(ai, aj), j: Math.max(ai, aj), extra,
                p0, d: dir, lo, hi,
                a: findVertex(ka), b: findVertex(kb),
                angle: Math.acos(Math.max(-1, Math.min(1, -ip)))
            });
        }
    }

    // Free arcs: the parts of each wall's circle on the sphere at infinity that
    // no other wall cuts away. Any of positive length means the closure of the
    // domain contains an open patch of the sphere — infinite volume. Conversely
    // a free region always borders some wall circle, so none means the domain
    // meets the sphere only at its ideal vertices.
    const freeArcs = [];
    for (let m = 0; m < nW; m++) {
        const { n, c } = P[m];
        const nl2 = n.lengthSq();
        const rho2 = 1 - (c * c) / nl2;
        if (rho2 <= 0) continue;
        const rho = Math.sqrt(rho2);
        const center = n.clone().multiplyScalar(c / nl2);
        const nh = n.clone().normalize();
        const u = Math.abs(nh.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        u.addScaledVector(nh, -u.dot(nh)).normalize();
        const v = new THREE.Vector3().crossVectors(nh, u);
        const cons = [];
        for (let l = 0; l < nW; l++) {
            if (l === m) continue;
            const nlv = P[l].n;
            cons.push({ A: rho * nlv.dot(u), B: rho * nlv.dot(v), C: P[l].c - nlv.dot(center) });
        }
        // Drop slivers: a wall circle tangent to another at an ideal point
        // (parallel planes in the upper half-space meet only at ∞) and outside
        // it elsewhere keeps, after rounding, an arc of length ~√ε around the
        // tangency that hugs the other circle all along. A genuine short arc
        // stands clear of the other walls inside it (clearance ~ its length ×
        // crossing angle). Long arcs are kept as they are: those may touch
        // another circle at an interior point (a necklace of tangent circles).
        const clearance = (t) => {
            const ct = Math.cos(t), st = Math.sin(t);
            let slack = Infinity;
            for (let l = 0, q = 0; l < nW; l++) {
                if (l === m) continue;
                const k = cons[q++];
                slack = Math.min(slack, (k.C - k.A * ct - k.B * st) / P[l].n.length());
            }
            return slack;
        };
        const arcs = feasibleArcs(cons).filter(([a, b]) => {
            if (b - a <= 1e-7) return false;
            if (b - a >= 1e-4) return true;
            return [0.25, 0.5, 0.75].some(f => clearance(a + f * (b - a)) > ARC_SLACK_TOL);
        });
        if (arcs.length) freeArcs.push({ wall: m, arcs, center, rho, u, v });
    }

    // Faces: the edges bounding each wall.
    const faces = P.map((_, m) => ({ wall: m, edges: [], vertices: [] }));
    for (const e of edges) {
        for (const m of [e.i, e.j]) {
            faces[m].edges.push(e.id);
            for (const v of [e.a, e.b]) if (!faces[m].vertices.includes(v)) faces[m].vertices.push(v);
        }
    }

    return {
        planes: P, vertices, edges, faces, freeArcs,
        finiteVolume: nW > 0 && freeArcs.length === 0
    };
}

/**
 * Active faces at a line contained in several planes. In the plane normal to
 * the line, each wall allows the half-plane {w : n·w ≤ 0}; the intersection is
 * a wedge whose two bounding constraints are the active faces. Returns null
 * when the wedge is empty or flat (the line lies inside a face).
 */
function activePair(dir, normals, idxs) {
    let u = Math.abs(dir.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    u.addScaledVector(dir, -u.dot(dir)).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    // Feasible directions θ with cos(θ − φ) ≤ 0: the arc [φ + π/2, φ + 3π/2].
    let L = null, U = null, iL = -1, iU = -1;
    normals.forEach((n, k) => {
        const phi = Math.atan2(n.dot(v), n.dot(u));
        let lo = phi + Math.PI / 2, hi = lo + Math.PI;
        if (L === null) { L = lo; U = hi; iL = iU = k; return; }
        // Bring this arc next to the current one (arcs are convex, ≤ π long).
        while (lo > U) { lo -= 2 * Math.PI; hi -= 2 * Math.PI; }
        while (hi < L) { lo += 2 * Math.PI; hi += 2 * Math.PI; }
        if (lo > L) { L = lo; iL = k; }
        if (hi < U) { U = hi; iU = k; }
    });
    const width = U - L;
    if (width <= ANGLE_TOL || width >= Math.PI - ANGLE_TOL || iL === iU) return null;
    return { i: idxs[iU], j: idxs[iL], angle: width };
}

// ---------------- derived data ----------------

/** Klein point at parameter t of an edge. */
export function edgePoint(e, t) {
    return e.p0.clone().addScaledVector(e.d, t);
}

/** Ball-model samples along an edge (a geodesic arc), for drawing. */
export function edgeSamples(e, n = 32) {
    const out = [];
    // Pull ideal endpoints a hair inside so the samples stay finite.
    const shrink = 1e-6 * (e.hi - e.lo);
    for (let s = 0; s <= n; s++) {
        const t = e.lo + shrink + (e.hi - e.lo - 2 * shrink) * (s / n);
        out.push(kleinToBall(edgePoint(e, t)));
    }
    return out;
}

/** Ball-model midpoint of an edge (Klein midpoint; interior for any edge). */
export function edgeMidpoint(e) {
    return kleinToBall(edgePoint(e, 0.5 * (e.lo + e.hi)));
}

/**
 * Consistency of the face structure. Every vertex of a face must meet exactly
 * two of that face's edges; for a finite-volume polyhedron (a closed 3-cell)
 * Euler's formula V − E + F = 2 must hold, counting ideal vertices. Returns
 * {ok, V, E, F, problems: string[]}.
 */
export function checkEuler(poly) {
    const problems = [];
    const facesUsed = poly.faces.filter(f => f.edges.length > 0);
    for (const f of facesUsed) {
        for (const v of f.vertices) {
            const vtx = poly.vertices[v];
            let deg = 0;
            for (const eid of f.edges) {
                const e = poly.edges[eid];
                if (e.a === v) deg++;
                if (e.b === v) deg++;
            }
            // An edge running into the free sphere ends at a point that is
            // not a polyhedron vertex; it only has one face edge there.
            if (deg !== 2 && !(vtx.ideal && !poly.finiteVolume)) {
                problems.push(`face ${f.wall}: vertex ${v} meets ${deg} of its edges (expected 2)`);
            }
        }
    }
    const V = poly.vertices.length, E = poly.edges.length, F = facesUsed.length;
    let eulerOk = true;
    if (poly.finiteVolume) {
        eulerOk = V - E + F === 2;
        if (!eulerOk) problems.push(`V − E + F = ${V} − ${E} + ${F} = ${V - E + F}, expected 2`);
        const unused = poly.faces.filter(f => f.edges.length === 0).map(f => f.wall);
        if (unused.length) problems.push(`walls with no edges in a finite-volume domain: ${unused.join(', ')}`);
    }
    return { ok: problems.length === 0, eulerOk, V, E, F, problems };
}

// ---------------- volume ----------------

// Gauss–Legendre nodes/weights on [0, 1].
function gaussLegendre(n) {
    const x = [], w = [];
    for (let i = 1; i <= n; i++) {
        let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 0;
        for (let it = 0; it < 100; it++) {
            let p1 = 1, p2 = 0;
            for (let j = 1; j <= n; j++) {
                const p3 = p2; p2 = p1;
                p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
            }
            pp = n * (z * p1 - p2) / (z * z - 1);
            const z1 = z;
            z = z1 - p1 / pp;
            if (Math.abs(z - z1) < 1e-15) break;
        }
        x.push(0.5 * (1 - z));
        w.push(1 / ((1 - z * z) * pp * pp));
    }
    return { x, w };
}
const GL = gaussLegendre(28);

// ∫₀^ρ r²/(1−r²)² dr: the Klein volume element dk/(1−|k|²)² integrated along a ray.
function radial(rho) {
    return rho / (2 * (1 - rho * rho)) - 0.5 * Math.atanh(rho);
}

/**
 * ∫ over the flat triangle (S, A, B) of radial(|x|)·h/|x|³ — the volume of the
 * cone from the Klein origin over that triangle, where h is the distance from
 * the origin to the triangle's plane. S is the (possibly ideal) corner that the
 * Duffy map collapses, which cancels the 1/(1 − |x|) singularity there.
 */
function coneOverTriangle(S, A, B, h) {
    const SA = A.clone().sub(S), SB = B.clone().sub(S);
    const jac = new THREE.Vector3().crossVectors(SA, SB).length();
    if (jac < 1e-300) return 0;
    let sum = 0;
    const x = new THREE.Vector3();
    for (let a = 0; a < GL.x.length; a++) {
        const s = GL.x[a];
        for (let b = 0; b < GL.x.length; b++) {
            const t = GL.x[b];
            x.copy(S).addScaledVector(SA, s * (1 - t)).addScaledVector(SB, s * t);
            const r = Math.min(x.length(), 1 - 1e-16);
            sum += GL.w[a] * GL.w[b] * s * radial(r) * h / (r * r * r);
        }
    }
    return sum * jac;
}

/**
 * Hyperbolic volume of a FINITE-VOLUME polyhedron whose closure contains the
 * Klein origin (true of a Dirichlet domain in its home frame, where the
 * origin is the centre or, with a stabilizer cone, the cone's apex). The cone
 * from the origin over each face is fanned into triangles from the face's
 * centroid; triangles touching an ideal vertex are split so that each has at
 * most one singular corner, which the Duffy map then absorbs.
 * Returns NaN if the polyhedron is not of finite volume.
 */
export function polyhedronVolume(poly) {
    if (!poly.finiteVolume) return NaN;
    let vol = 0;
    for (const f of poly.faces) {
        if (f.edges.length === 0) continue;
        const { n, c } = poly.planes[f.wall];
        const h = c / n.length();                 // origin on the domain side: c ≥ 0
        if (h <= 1e-12) continue;                 // a cone face through the origin
        const pts = f.vertices.map(v => poly.vertices[v].k);
        const g = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
        for (const eid of f.edges) {
            const e = poly.edges[eid];
            const A = poly.vertices[e.a], B = poly.vertices[e.b];
            if (A.ideal && B.ideal) {
                const M = A.k.clone().add(B.k).multiplyScalar(0.5);
                vol += coneOverTriangle(A.k, M, g, h) + coneOverTriangle(B.k, g, M, h);
            } else if (A.ideal) {
                vol += coneOverTriangle(A.k, B.k, g, h);
            } else if (B.ideal) {
                vol += coneOverTriangle(B.k, g, A.k, h);
            } else {
                vol += coneOverTriangle(g, A.k, B.k, h);
            }
        }
    }
    return vol;
}
