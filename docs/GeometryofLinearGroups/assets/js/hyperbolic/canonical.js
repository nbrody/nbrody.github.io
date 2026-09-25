/**
 * Canonical Dirichlet domain pipeline.
 *
 * Given generators of a subgroup G < PSL(2,C) (orientation-reversing elements
 * allowed) and a view isometry V, we compute:
 *
 *  1. The orbit of the basepoint under G out to a word-length / beam budget.
 *  2. The basepoint stabilizer H = G ∩ Stab(p), closed up into a finite group.
 *  3. If H is nontrivial, a generically perturbed basepoint q = p + ε·v.
 *     ALL walls are then built as bisectors Bis(q, g·q) at q:
 *       - for h ∈ H the wall Bis(q, hq) passes EXACTLY through p (h fixes p),
 *         so these are the walls of a fundamental cone for H at p;
 *       - for other g the wall is the Dirichlet bisector at p up to O(ε).
 *     This makes the domain an EXACT convex fundamental polyhedron (it is the
 *     Dirichlet domain at q), so every face pairs facewise via g^{-1} — no
 *     piecewise corrections — while converging to "Dirichlet domain at p
 *     ∩ fundamental cone for H" as ε → 0.
 *  4. Walls accepted incrementally by an EXACT face test: in the Klein model the
 *     domain is a Euclidean polyhedron, and a candidate bisector contributes a
 *     face iff its half-space is violated at a vertex of the current domain or
 *     on the part of the sphere at infinity the domain still reaches. (A test
 *     that samples points on the candidate wall can miss a small face; a wall
 *     it rejects is never reconsidered, which once left the FLMS manifold's
 *     domain two faces short.) Then a joint pruning pass.
 *  5. Face-pairing assignment: wall of g pairs to the wall of g^{-1} via g^{-1},
 *     with words in the user's generators — plus completion passes that add
 *     walls revealed by transporting vertices through the pairings, and, for a
 *     compact domain, a Dirichlet check over every element that could reach it.
 */
// Relative (not the bare 'three' specifier) so the engine also loads in a Web
// Worker, where import maps do not apply. Same URL as the pages' import maps.
import * as THREE from '../../../Geometric/Tools/Kleinian/vendor/three/three.module.js';
import {
    Complex, Matrix2x2, pslKey, distFromIdentityPSL,
    imageOfOriginUHS, uhsToBall, ballToUHS, applyMatrixToBall, applyMatrixToUHS,
    hypDistProxy, hypDist, bisectorCov, covToGeom, wallSD,
    projectToWall, reduceWord, invertWord, lorentzMatrix, lorentzApply
} from './math.js';
import { buildPolyhedron, kleinToBall, ballToKlein } from './polyhedron.js';

const STABILIZER_CAP = 130;       // |H| cap (largest finite case is A5 ≅ 60 in PSL)
const STAB_TOL = 1e-7;            // squared Euclidean dist for "fixes basepoint"
const CUT_TOL = 1e-10;            // Klein residual that counts as cutting the domain
const ON_DOMAIN_TOL = 1e-8;       // Klein residual still counted as "in the domain"

// Deterministic generic direction for the cone-defining perturbation.
const GENERIC_DIR = new THREE.Vector3(0.5320397, 0.3141593, 0.7853982).normalize();
const PERTURB_EPS = 0.12;

// ---------------- Phase 1: orbit search ----------------

/**
 * Beam search over the group, collecting orbit elements sorted by distance.
 * Returns { orbit: [{matrix, word, orbitPt, dist}], stabilizers: [{matrix, word}],
 *           words: Map(pslKey → shortest word found) }.
 */
function searchOrbit(generators, { maxDepth, beamWidth, maxOrbit }) {
    // Everything here is in the BASEPOINT FRAME: the beam starts at the
    // identity, the basepoint is the ball origin (image of (0,0,1) ∈ UHS),
    // and all elements are pure words in the user's generators. The view
    // matrix only enters later, when geometry is built.
    const origin = new THREE.Vector3(0, 0, 0);
    const numGens = generators.length;
    const words = new Map([[pslKey(Matrix2x2.identity()), []]]);
    const orbit = [];
    const stabilizers = [];

    let beam = [{ matrix: Matrix2x2.identity(), word: [], lastGenIdx: -1 }];

    for (let depth = 1; depth <= maxDepth; depth++) {
        const candidates = [];
        for (const entry of beam) {
            for (let i = 0; i < numGens; i++) {
                // Generators interleaved [g1, g1^-1, g2, g2^-1, ...]; skip backtracking
                if (entry.lastGenIdx >= 0 && i === (entry.lastGenIdx ^ 1)) continue;
                const next = entry.matrix.mul(generators[i]);
                const key = pslKey(next);
                if (words.has(key)) continue;
                const base = (i >> 1) + 1;
                const genIdx = (i & 1) === 0 ? base : -base;
                const word = [...entry.word, genIdx];
                words.set(key, word);          // BFS by depth: first word is shortest

                const orbitPt = uhsToBall(imageOfOriginUHS(next));
                const dist = hypDistProxy(origin, orbitPt);
                candidates.push({ matrix: next, word, lastGenIdx: i, orbitPt, dist });
            }
        }
        if (candidates.length === 0) break;
        candidates.sort((a, b) => a.dist - b.dist);
        beam = candidates.slice(0, beamWidth);

        for (const entry of beam) {
            if (entry.orbitPt.lengthSq() < STAB_TOL) {
                stabilizers.push({ matrix: entry.matrix, word: entry.word });
            } else if (orbit.length < maxOrbit) {
                orbit.push(entry);
            }
        }
    }

    orbit.sort((a, b) => a.dist - b.dist);
    return { orbit, stabilizers, words };
}

// ---------------- Phase 2: stabilizer closure ----------------

/**
 * Close the found stabilizer elements into a group (BFS over products).
 * Returns { elements: [{matrix, word}], capped: bool }.
 * elements[0] is the identity. If discrete, H is finite (≤ 60 in PSL(2,C)
 * for non-elementary stabilizers of a point: cyclic, dihedral, A4, S4, A5).
 */
function closeStabilizer(stabGens) {
    const identity = { matrix: Matrix2x2.identity(), word: [] };
    if (stabGens.length === 0) return { elements: [identity], capped: false };

    const seen = new Map([[pslKey(identity.matrix), identity]]);
    const queue = [identity];
    let head = 0;
    let capped = false;

    while (head < queue.length) {
        const cur = queue[head++];
        for (const g of stabGens) {
            const next = cur.matrix.mul(g.matrix).normalized();
            const key = pslKey(next);
            if (seen.has(key)) continue;
            if (seen.size >= STABILIZER_CAP) { capped = true; break; }
            const entry = { matrix: next, word: reduceWord([...cur.word, ...g.word]) };
            seen.set(key, entry);
            queue.push(entry);
        }
        if (capped) break;
    }
    return { elements: [...seen.values()], capped };
}

// ---------------- exact domain geometry ----------------

/**
 * How far the half-space of covector W is violated on the closed domain
 * `poly`: the maximum of (n·k − c)/|n| over the closure of the domain in the
 * closed Klein ball. A linear function on a compact convex set peaks at an
 * extreme point — a vertex (finite or ideal), or a point of the sphere at
 * infinity the domain reaches: the pole of n if the domain reaches it, else a
 * point on one of the free arcs bounding that region. `null` poly = whole ball.
 */
export function maxViolation(poly, W) {
    const n = new THREE.Vector3(W.x, W.y, W.z), c = W.w, nl = n.length();
    if (!poly || poly.planes.length === 0) return (nl - c) / nl;
    let best = -Infinity;
    for (const v of poly.vertices) best = Math.max(best, n.dot(v.k) - c);
    if (poly.freeArcs.length) {
        // The pole of n on the sphere, if the domain's closure contains it.
        const pole = n.clone().multiplyScalar(1 / nl);
        if (poly.planes.every(P => P.n.dot(pole) - P.c <= ON_DOMAIN_TOL * P.n.length())) {
            best = Math.max(best, nl - c);
        }
        // Otherwise on a free arc: maximise n·(center + ρ(u cosθ + v sinθ)).
        for (const fa of poly.freeArcs) {
            const A = fa.rho * n.dot(fa.u), B = fa.rho * n.dot(fa.v);
            const base = n.dot(fa.center) - c;
            const peak = Math.atan2(B, A);
            for (const [a, b] of fa.arcs) {
                const cands = [a, b];
                for (const t of [peak, peak + 2 * Math.PI, peak - 2 * Math.PI]) {
                    if (t > a && t < b) cands.push(t);
                }
                for (const t of cands) best = Math.max(best, base + A * Math.cos(t) + B * Math.sin(t));
            }
        }
    }
    return best / nl;
}

/** Is the ball point p in the closed domain (Klein half-spaces, tolerance)? */
function outsideWall(p, walls) {
    const k = ballToKlein(p);
    let worst = ON_DOMAIN_TOL, idx = -1;
    for (let j = 0; j < walls.length; j++) {
        const W = walls[j].cov;
        const r = (W.x * k.x + W.y * k.y + W.z * k.z - W.w) / Math.hypot(W.x, W.y, W.z);
        if (r > worst) { worst = r; idx = j; }
    }
    return idx;          // -1: inside (within tolerance)
}

/**
 * Interior points of face i (ball model): the centroid of its boundary points
 * (vertices and free-arc points), and points halfway from it to each of them.
 */
function facePoints(poly, i, maxCount = 12) {
    const f = poly.faces[i];
    const bdry = f.vertices.map(v => poly.vertices[v].k);
    const fa = poly.freeArcs.find(x => x.wall === i);
    if (fa) {
        for (const [a, b] of fa.arcs) {
            for (const t of [a, 0.5 * (a + b), b]) {
                bdry.push(fa.center.clone().addScaledVector(fa.u, fa.rho * Math.cos(t))
                    .addScaledVector(fa.v, fa.rho * Math.sin(t)));
            }
        }
    }
    if (bdry.length === 0) return [];
    const g = bdry.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / bdry.length);
    // Push g onto the wall's plane (it is already there up to rounding).
    const P = poly.planes[i], nn = P.n.lengthSq();
    g.addScaledVector(P.n, (P.c - P.n.dot(g)) / nn);
    const out = [kleinToBall(g)];
    for (const q of bdry) {
        if (out.length >= maxCount) break;
        const m = g.clone().lerp(q, 0.5);
        if (m.lengthSq() < 1 - 1e-9) out.push(kleinToBall(m));
    }
    return out;
}

// ---------------- Phase 3+4: wall assembly ----------------

function makeWall(cov, cand) {
    const tr = cand.matrix.a.add(cand.matrix.d);
    const tr2m4 = tr.mul(tr).sub(new Complex(4));
    return {
        cov, geom: covToGeom(cov),
        elem: cand.matrix, word: cand.word,
        kind: cand.kind,
        // Parabolic ⇔ tr² = 4 (det 1, non-identity, orientation-preserving —
        // the trace test does not classify anti elements)
        isParabolic: cand.kind === 'face' && !cand.matrix.anti && tr2m4.normSq() < 1e-12
    };
}

const covClose = (a, b) =>
    Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7 &&
    Math.abs(a.z - b.z) < 1e-7 && Math.abs(a.w - b.w) < 1e-7;

/**
 * Remove walls that contribute no face — no edge and no free arc on the
 * sphere at infinity — rebuilding the polyhedron until stable. Returns it.
 */
function pruneWalls(walls) {
    let poly = buildPolyhedron(walls);
    for (let pass = 0; pass < 20; pass++) {
        const keep = walls.map((_, i) =>
            poly.faces[i].edges.length > 0 || poly.freeArcs.some(fa => fa.wall === i));
        if (keep.every(Boolean)) break;
        for (let i = walls.length - 1; i >= 0; i--) if (!keep[i]) walls.splice(i, 1);
        poly = buildPolyhedron(walls);
    }
    return poly;
}

/**
 * Assign face pairings.
 * The wall of g is Bis(q, gq); s = g^{-1} maps it to Bis(g^{-1}q, q), the wall
 * of g^{-1}. (An order-2 elliptic pairs a wall with itself: partner === i.)
 * Mutates walls, setting wall.pairing = {matrix, alg, word, partner, residual}
 * (or null). Algebra lives in the basepoint frame; the GEOMETRIC pairing on the
 * displayed walls is the conjugate V·g^{-1}·V^{-1}.
 */
function assignPairings(walls, poly, vMat, vInv) {
    const keyToWall = new Map(walls.map((w, j) => [pslKey(w.elem), j]));
    const wallOfElement = (m) => {
        const j = keyToWall.get(pslKey(m));
        if (j !== undefined) return j;
        let best = -1, bestD = 1e-6;
        for (let k = 0; k < walls.length; k++) {
            const d = distFromIdentityPSL(m.mul(walls[k].elem.inv()).normalized());
            if (d < bestD) { bestD = d; best = k; }
        }
        return best;
    };

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const sAlg = w.elem.inv().normalized();
        const sGeom = vMat.mul(sAlg).mul(vInv).normalized();
        const partner = wallOfElement(sAlg);
        if (partner < 0) { w.pairing = null; continue; }

        // The image of the face must lie on the partner wall, inside the domain.
        const samples = facePoints(poly, i, 8);
        let worst = 0, ok = samples.length > 0;
        for (const p of samples) {
            const q = applyMatrixToBall(sGeom, p);
            if (q.lengthSq() >= 1) { ok = false; break; }
            const onPartner = Math.abs(wallSD(q, walls[partner].geom));
            let maxSd = -Infinity;
            for (let j = 0; j < walls.length; j++) maxSd = Math.max(maxSd, wallSD(q, walls[j].geom));
            worst = Math.max(worst, maxSd, onPartner);
            if (maxSd > 1e-4 || onPartner > 1e-4) { ok = false; break; }
        }
        if (!ok) { w.pairing = null; continue; }
        w.pairing = { matrix: sGeom, alg: sAlg, word: reduceWord(invertWord(w.word)), partner, residual: worst };
    }
}

/**
 * Completion: transport points of each face through its pairing s = g^{-1}.
 * For a genuine Dirichlet domain the image of the face is the partner face.
 * An image that escapes past wall k reveals the missing wall of g·k: for x on
 * the wall of g, d(x, g·k·q) < d(x, q). A missing partner wall is the wall of
 * g^{-1} itself. A vertex whose image lands inside the domain but on no vertex
 * means some wall through the source vertex is missing; the orbit supplies it.
 * Returns the proposals (not yet added).
 */
function transportProposals(walls, poly, ctx) {
    const { vMat, vInv, propose, orbitCandidates, q0 } = ctx;
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const sAlg = w.elem.inv().normalized();
        const sGeom = vMat.mul(sAlg).mul(vInv).normalized();
        const pts = facePoints(poly, i, 10);
        // Missing partner wall.
        const keyS = pslKey(sAlg);
        if (!walls.some(w2 => pslKey(w2.elem) === keyS) && pts.length) {
            propose(sAlg, invertWord(w.word));
        }
        // Finite vertices of the face first: they are where a missing wall
        // must cut, since a half-space that cuts a polytope cuts off a vertex.
        const verts = poly.faces[i].vertices
            .filter(v => !poly.vertices[v].ideal)
            .map(v => kleinToBall(poly.vertices[v].k));
        for (const x of [...verts, ...pts]) {
            const y = applyMatrixToBall(sGeom, x);
            if (y.lengthSq() >= 1) continue;
            const k = outsideWall(y, walls);
            if (k >= 0) propose(w.elem.mul(walls[k].elem), [...w.word, ...walls[k].word]);
        }
        for (const x of verts) {
            const y = applyMatrixToBall(sGeom, x);
            if (y.lengthSq() >= 1 || outsideWall(y, walls) >= 0) continue;
            const ky = ballToKlein(y);
            if (poly.vertices.some(v => v.k.distanceToSquared(ky) < 1e-10)) continue;
            // Image is not a vertex: scan the orbit for a wall cutting x.
            const dq = hypDist(x, applyMatrixToBall(vMat, q0));
            for (const c of orbitCandidates) {
                const gq = applyMatrixToBall(vMat.mul(c.matrix).normalized(), q0);
                if (hypDist(x, gq) < dq - 1e-9) { propose(c.matrix, c.word); break; }
            }
        }
    }
}

/**
 * Dirichlet check for a COMPACT domain of radius R about q: any wall that cuts
 * the domain comes from an element with d(q, gq) < 2R, and every such element
 * is a product of face pairings whose partial products stay within 3R (the
 * tiles crossed by the geodesic from q to gq). Walk that ball of the Cayley
 * graph and propose every element whose bisector beats q at some vertex.
 */
function dirichletProposals(walls, poly, ctx) {
    const { vMat, q0, propose } = ctx;
    const qV = applyMatrixToBall(vMat, q0);
    const verts = poly.vertices.map(v => kleinToBall(v.k));
    if (verts.length === 0) return;
    const R = Math.max(...verts.map(v => hypDist(v, qV)));
    if (!Number.isFinite(R) || R > 6) return;          // large domains: skip
    const moves = walls.filter(w => w.pairing).map(w => ({ m: w.pairing.alg, word: w.pairing.word }));
    const seen = new Set([pslKey(Matrix2x2.identity())]);
    let frontier = [{ m: Matrix2x2.identity(), word: [] }];
    const LIMIT = 20000;
    for (let depth = 0; depth < 40 && frontier.length && seen.size < LIMIT; depth++) {
        const next = [];
        for (const f of frontier) {
            for (const mv of moves) {
                const g = f.m.mul(mv.m).normalized();
                const key = pslKey(g);
                if (seen.has(key)) continue;
                seen.add(key);
                const gq = applyMatrixToBall(vMat.mul(g).normalized(), q0);
                const d = hypDist(qV, gq);
                if (d > 3 * R + 1e-6) continue;
                const word = reduceWord([...f.word, ...mv.word]);
                next.push({ m: g, word });
                if (d < 2 * R && verts.some(v => hypDist(v, gq) < hypDist(v, qV) - 1e-9)) {
                    propose(g, word);
                }
            }
        }
        frontier = next;
    }
}

// ---------------- Public entry point ----------------

// Pre-allocated 256-covector buffer for the shader
const _paddedBuffer = new Array(256);
for (let i = 0; i < 256; i++) _paddedBuffer[i] = new THREE.Vector4(0, 0, 0.099, 0.0995);
const EMPTY_WALL = new THREE.Vector4(0.0, 0.0, 100.0, 99.995);  // far-away sphere ≈ no-op

/**
 * Compute the canonical Dirichlet domain.
 *
 * @param {Matrix2x2[]} generators - interleaved [g1, g1^-1, g2, g2^-1, ...], det 1
 * @param {Matrix2x2} viewMat - view isometry (det 1); walls are built in its frame
 * @param {number} maxFaces - cap on accepted walls
 * @param {Object} options - { maxDepth, beamWidth, maxOrbit, skipPairings, fullDirichlet }
 * @returns {{
 *   facesBuffer: THREE.Vector4[], count: number,
 *   walls: Array, stabilizer: { elements, capped, order },
 *   basepoint: THREE.Vector3, conePoint: THREE.Vector3, q0: THREE.Vector3,
 *   poly, orbit, words, notes: string[]
 * }}
 *   `poly` is the exact polyhedron (polyhedron.js) in the frame of viewMat;
 *   `orbit` the elements found by the search, `words` a table of the shortest
 *   word found for each element (keyed by pslKey).
 */
export function computeCanonicalDomain(generators = [], viewMat = Matrix2x2.identity(), maxFaces = 96, options = {}) {
    const {
        maxDepth = 8,
        beamWidth = 600,
        maxOrbit = 6000,
        skipPairings = false,
        fullDirichlet = false
    } = options;

    const basepoint = uhsToBall(imageOfOriginUHS(viewMat));
    const notes = [];

    if (!generators || generators.length === 0) {
        for (let i = 0; i < 256; i++) _paddedBuffer[i].copy(EMPTY_WALL);
        return {
            facesBuffer: _paddedBuffer, count: 0, walls: [],
            stabilizer: { elements: [], capped: false, order: 1 },
            basepoint, conePoint: basepoint.clone(), q0: new THREE.Vector3(),
            poly: buildPolyhedron([]), orbit: [], words: new Map(), notes
        };
    }

    // Phase 1: orbit of the basepoint in the basepoint frame (pure words);
    // stabilizer elements fix the frame origin.
    const { orbit, stabilizers, words } = searchOrbit(generators, { maxDepth, beamWidth, maxOrbit });

    // Phase 2: stabilizer closure
    const { elements: H, capped } = closeStabilizer(stabilizers);

    // Phase 3: perturbed basepoint q0 (basepoint frame). If the stabilizer is
    // nontrivial, nudge in a fixed generic direction. All walls are bisectors
    // at q = V(q0), so the polyhedron is the exact (view-transformed)
    // Dirichlet domain at q0: stabilizer walls pass exactly through the
    // basepoint (forming a fundamental cone for H), the rest are the
    // basepoint-bisectors up to O(ε).
    const hasStab = H.length > 1;
    const vInv = viewMat.inv().normalized();
    // fullDirichlet: render the full (symmetric) Dirichlet domain D(p) instead
    // of the canonical fundamental domain. We then DON'T perturb the basepoint
    // and DON'T add the stabilizer cone walls — at the true basepoint those
    // bisectors are degenerate (h·p = p), so D(p) is H-invariant and symmetric
    // (it is |H| copies of a fundamental domain).
    const usePerturb = hasStab && !fullDirichlet;
    const q0 = usePerturb
        ? GENERIC_DIR.clone().multiplyScalar(PERTURB_EPS)
        : new THREE.Vector3(0, 0, 0);
    const conePoint = applyMatrixToBall(viewMat, q0);

    // Word lengths: a completion proposal is a product of wall elements, so its
    // concatenated word can double every pass. Prefer the shortest word the
    // search found for the same element, and refuse proposals whose word is
    // still long — past this length the float matrix is not trustworthy either.
    const wordCap = Math.max(24, 6 * maxDepth);
    const shortest = (m, word) => {
        const w = words.get(pslKey(m));
        return w && w.length <= word.length ? w.slice() : reduceWord(word);
    };

    // Candidate walls: stabilizer elements first (their walls bound the cone
    // and pass through the basepoint), then orbit elements by distance.
    const candidates = [];
    if (!fullDirichlet) {
        for (const h of H) {
            if (distFromIdentityPSL(h.matrix) < 1e-7) continue;  // skip identity
            candidates.push({ matrix: h.matrix, word: h.word, kind: 'cone' });
        }
    }
    for (const entry of orbit) {
        candidates.push({ matrix: entry.matrix, word: entry.word, kind: 'face' });
    }

    // Phase 4: exact incremental acceptance. Wall of word w (displayed):
    // Bis(V·q0, V·w·q0).
    const walls = [];
    let poly = buildPolyhedron(walls);
    const covFor = (m) => bisectorCov(conePoint, applyMatrixToBall(viewMat.mul(m).normalized(), q0));
    for (const cand of candidates) {
        if (walls.length >= maxFaces) { notes.push(`face cap of ${maxFaces} reached`); break; }
        const cov = covFor(cand.matrix);
        if (!cov || walls.some(w => covClose(w.cov, cov))) continue;
        if (maxViolation(poly, cov) <= CUT_TOL) continue;
        walls.push(makeWall(cov, cand));
        poly = buildPolyhedron(walls);
    }

    // Phase 5: joint pruning (a later wall can make an earlier one redundant).
    poly = pruneWalls(walls);

    // Phase 6: pairings, with completion — walls revealed by transporting the
    // faces through their pairings are added, then prune/pair again until
    // stable.
    if (!skipPairings) {
        assignPairings(walls, poly, viewMat, vInv);
        const tooLong = new Set();
        for (let iter = 0; iter < 24; iter++) {
            const toAdd = new Map();
            const propose = (matrix, word) => {
                const m = matrix.normalized();
                const key = pslKey(m);
                if (distFromIdentityPSL(m) < 1e-7 || toAdd.has(key)) return;
                if (walls.some(w => pslKey(w.elem) === key)) return;
                const wd = shortest(m, word);
                if (wd.length > wordCap) { tooLong.add(key); return; }
                toAdd.set(key, { matrix: m, word: wd });
            };
            const ctx = { vMat: viewMat, vInv, propose, orbitCandidates: orbit, q0 };
            transportProposals(walls, poly, ctx);
            if (toAdd.size === 0 && poly.finiteVolume) dirichletProposals(walls, poly, ctx);
            let added = 0;
            for (const { matrix, word } of toAdd.values()) {
                if (walls.length >= maxFaces) { notes.push(`face cap of ${maxFaces} reached`); break; }
                const cov = covFor(matrix);
                if (!cov || walls.some(w => covClose(w.cov, cov))) continue;
                if (maxViolation(poly, cov) <= CUT_TOL) continue;
                const isStab = uhsToBall(imageOfOriginUHS(matrix)).lengthSq() < STAB_TOL;
                walls.push(makeWall(cov, { matrix, word, kind: isStab ? 'cone' : 'face' }));
                poly = buildPolyhedron(walls);
                added++;
            }
            if (added === 0) break;
            poly = pruneWalls(walls);
            assignPairings(walls, poly, viewMat, vInv);
        }
        if (tooLong.size) {
            notes.push(`${tooLong.size} completion proposal(s) skipped: words longer than ${wordCap} letters`);
        }
    }

    // Shader buffer
    const count = Math.min(walls.length, 256);
    for (let i = 0; i < 256; i++) {
        if (i < count) _paddedBuffer[i].copy(walls[i].cov);
        else _paddedBuffer[i].copy(EMPTY_WALL);
    }

    return {
        facesBuffer: _paddedBuffer, count, walls,
        stabilizer: { elements: H, capped, order: H.length },
        basepoint, conePoint, q0, poly, orbit, words, notes
    };
}

/**
 * Re-express an already-computed domain under a different view isometry.
 *
 * The wall SET is chosen entirely in the basepoint frame — searchOrbit walks
 * pure words, and the contribution/pruning tests run on the conjugated
 * configuration — so the polyhedron displayed under a view matrix M is exactly
 * M·D: the same walls moved rigidly. Rebuilding each covector as
 * Bis(M·q0, M·g·q0) from the stored group element is therefore EXACT, not an
 * approximation, and it skips the orbit search, the face-contribution tests
 * and the pairing completion — a full recompute becomes a few hundred matrix
 * products, which is what makes per-frame flight and animation affordable.
 *
 * Mutates `domain` in place (facesBuffer is the shared shader buffer) and
 * returns it. Combinatorics — pairing partners, words, wall kinds — are
 * view-independent and survive untouched; only the geometry is rebuilt, and
 * `domain.poly` (built in the old frame) is dropped.
 */
export function retargetDomain(domain, viewMat) {
    if (!domain || !domain.walls || domain.walls.length === 0) return domain;
    if (domain.mode === 'ford') return retargetByLorentz(domain, viewMat);
    const { q0 } = domain;
    if (!q0) return domain;
    const conePoint = applyMatrixToBall(viewMat, q0);
    if (conePoint.lengthSq() >= 1) return domain;      // numerically off the ball
    const vInv = viewMat.inv().normalized();
    for (const w of domain.walls) {
        const gq = applyMatrixToBall(viewMat.mul(w.elem).normalized(), q0);
        const cov = bisectorCov(conePoint, gq);
        if (!cov) continue;
        w.cov = cov;
        w.geom = covToGeom(cov);
        // pairing.alg is the basepoint-frame element; its geometric conjugate
        // moves with the view (see assignPairings).
        if (w.pairing) w.pairing.matrix = viewMat.mul(w.pairing.alg).mul(vInv).normalized();
    }
    domain.conePoint = conePoint;
    domain.basepoint = uhsToBall(imageOfOriginUHS(viewMat));
    domain.poly = null;
    const count = Math.min(domain.walls.length, 256);
    for (let i = 0; i < count; i++) _paddedBuffer[i].copy(domain.walls[i].cov);
    return domain;
}

/**
 * Retarget any domain whose walls are stored in a home frame (`cov0`): walls
 * move by the Lorentz matrix of the view, exactly like points (the Minkowski
 * form is invariant), and pairings by conjugation.
 */
function retargetByLorentz(domain, viewMat) {
    const L = lorentzMatrix(viewMat);
    const vInv = viewMat.inv().normalized();
    for (const w of domain.walls) {
        const W = lorentzApply(L, w.cov0);
        const n = Math.sqrt(Math.max(1e-300, W.x * W.x + W.y * W.y + W.z * W.z - W.w * W.w));
        w.cov = W.multiplyScalar(1 / n);
        w.geom = covToGeom(w.cov);
        if (w.pairing) w.pairing.matrix = viewMat.mul(w.pairing.alg).mul(vInv).normalized();
    }
    domain.conePoint = applyMatrixToBall(viewMat, domain.ref);
    domain.basepoint = domain.conePoint.clone();
    domain.poly = null;
    const count = Math.min(domain.walls.length, 256);
    for (let i = 0; i < count; i++) _paddedBuffer[i].copy(domain.walls[i].cov);
    return domain;
}

/**
 * A copy of a domain whose walls can be retargeted without disturbing the
 * original: combinatorics are shared, geometry (cov/geom/pairing.matrix) is
 * per copy. The copy writes into the shared shader buffer when retargeted.
 */
export function cloneDomain(domain) {
    if (!domain) return domain;
    const walls = domain.walls.map(w => ({
        ...w,
        cov: w.cov.clone(),
        geom: w.geom,
        pairing: w.pairing ? { ...w.pairing } : null
    }));
    return {
        ...domain, walls,
        conePoint: domain.conePoint.clone(),
        basepoint: domain.basepoint.clone()
    };
}

/** Write a domain's covectors into the shared shader buffer. */
export function loadFacesBuffer(domain) {
    const walls = domain ? domain.walls : [];
    const count = Math.min(walls.length, 256);
    for (let i = 0; i < 256; i++) {
        if (i < count) _paddedBuffer[i].copy(walls[i].cov);
        else _paddedBuffer[i].copy(EMPTY_WALL);
    }
    return { facesBuffer: _paddedBuffer, count };
}

// ---------------- Ford domains ----------------

/**
 * The Ford domain of a group with a cusp at ∞ (generators given in that frame).
 *
 * For g = (a b; c d) with c ≠ 0, the isometric sphere of g⁻¹ is the hemisphere
 * over g(∞) = a/c of radius 1/|c|; g⁻¹ carries it to the isometric sphere of
 * g. The Ford domain is the region above every isometric sphere, intersected
 * with a fundamental chimney for Stab(∞) — its Dirichlet domain on C at a
 * generic point z₀. It is the limit of Dirichlet domains as the centre rises
 * up the cusp: the classical picture seen from the cusp.
 *
 * Every element of a coset g·Stab(∞) shares one isometric sphere, so where the
 * chimney cuts a sphere, its pieces are paired by DIFFERENT elements h·g⁻¹.
 * One pairing per wall is then not well defined, and the Poincaré certificate
 * stays with the Dirichlet domain; the Ford domain is exact geometry for
 * display, with its volume as a cross-check. `pairingAt(i, p)` returns the
 * element pairing the piece of face i through the point p.
 *
 * Each hemisphere is written as the bisector of two points exchanged by the
 * inversion in it, (ζ, 2R) and (ζ, R/2): a normalised covector whose upper
 * side is the domain side.
 */
export function computeFordDomain(generators = [], maxFaces = 96, options = {}) {
    const { maxDepth = 8, beamWidth = 600, maxOrbit = 6000 } = options;
    const notes = [];
    const I = Matrix2x2.identity();
    if (!generators.length) {
        return { ...computeCanonicalDomain([], I, maxFaces), mode: 'ford', ref: new THREE.Vector3() };
    }
    const { orbit, stabilizers, words } = searchOrbit(generators, { maxDepth, beamWidth, maxOrbit });
    const elems = [];
    const seen = new Set([pslKey(I)]);
    const addElem = (m, word) => {
        const M = m.normalized(), key = pslKey(M);
        if (seen.has(key)) return;
        seen.add(key);
        elems.push({ matrix: M, word });
    };
    for (let i = 0; i < generators.length; i++) {
        const base = (i >> 1) + 1;
        addElem(generators[i], [(i & 1) ? -base : base]);
    }
    for (const e of orbit) addElem(e.matrix, e.word);
    // Elements fixing the search's basepoint j are not in `orbit` — but a
    // rotation about the vertical axis through 0 fixes both j and ∞, and the
    // chimney needs it (PSL(2,Z[ω]) has order-3 rotations there).
    for (const h of closeStabilizer(stabilizers).elements) addElem(h.matrix, h.word);

    const stab = [], rest = [];
    for (const e of elems) {
        if (e.matrix.anti) continue;                   // mirrors: isometric spheres need care
        if (Math.sqrt(e.matrix.c.normSq()) < 1e-9) {
            const r = e.matrix.a.div(e.matrix.d);
            if (Math.abs(Math.sqrt(r.normSq()) - 1) > 1e-6) {
                throw new Error('∞ is fixed by a loxodromic element, so it is not a cusp: no Ford domain');
            }
            stab.push(e);
        } else rest.push(e);
    }
    if (stab.length === 0) notes.push('no element fixes ∞: the domain is the exterior of all isometric spheres');

    let maxR = 0;
    for (const e of rest) maxR = Math.max(maxR, 1 / Math.sqrt(e.matrix.c.normSq()));
    if (!(maxR > 0)) maxR = 1;
    // A generic point of C for the chimney, and a reference point high above
    // every isometric sphere (inside the domain).
    const z0 = new Complex(0.1123, 0.0719);
    const ref = uhsToBall({ x: z0.re, y: z0.im, t: 2.5 * maxR });

    const isStabElem = (M) => Math.sqrt(M.c.normSq()) < 1e-9;
    const covFor = (m) => {
        const M = m.normalized();
        if (isStabElem(M)) {
            const p = { x: z0.re, y: z0.im, t: maxR };
            return bisectorCov(uhsToBall(p), uhsToBall(applyMatrixToUHS(M, p)));
        }
        const zeta = M.a.div(M.c), R = 1 / Math.sqrt(M.c.normSq());
        return bisectorCov(uhsToBall({ x: zeta.re, y: zeta.im, t: 2 * R }),
            uhsToBall({ x: zeta.re, y: zeta.im, t: R / 2 }));
    };

    const walls = [];
    let poly = buildPolyhedron(walls);
    const tryAdd = (cand) => {
        if (walls.length >= maxFaces) return false;
        const cov = covFor(cand.matrix);
        if (!cov || walls.some(w => covClose(w.cov, cov))) return false;
        if (maxViolation(poly, cov) <= CUT_TOL) return false;
        walls.push(makeWall(cov, { ...cand, kind: 'face' }));
        poly = buildPolyhedron(walls);
        return true;
    };
    [...stab].sort((a, b) => a.matrix.b.normSq() - b.matrix.b.normSq()).forEach(tryAdd);
    [...rest].sort((a, b) => a.matrix.c.normSq() - b.matrix.c.normSq()).forEach(tryAdd);
    poly = pruneWalls(walls);

    // Fold a ball point into the chimney by the vertical walls' elements.
    const vertical = () => walls.map((w, i) => (isStabElem(w.elem.normalized()) ? i : -1)).filter(i => i >= 0);
    const foldChimney = (y, M) => {
        const vIdx = vertical();
        for (let it = 0; it < 64; it++) {
            const ky = ballToKlein(y);
            let worst = 1e-9, k = -1;
            for (const j of vIdx) {
                const W = walls[j].cov;
                const r = (W.x * ky.x + W.y * ky.y + W.z * ky.z - W.w) / Math.hypot(W.x, W.y, W.z);
                if (r > worst) { worst = r; k = j; }
            }
            if (k < 0) break;
            const s = walls[k].elem.inv().normalized();
            y = applyMatrixToBall(s, y);
            M = s.mul(M).normalized();
        }
        return { y, M };
    };
    // Completion: a face point carried across by g⁻¹ and folded into the
    // chimney must land on the floor of isometric spheres; one that lands
    // strictly above it means some sphere covering that point is missing.
    const inside = (k) => walls.every(w => {
        const W = w.cov;
        return (W.x * k.x + W.y * k.y + W.z * k.z - W.w) / Math.hypot(W.x, W.y, W.z) < -1e-9;
    });
    for (let iter = 0; iter < 12; iter++) {
        let added = 0;
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (isStabElem(w.elem.normalized())) continue;
            const pts = facePoints(poly, i, 8);
            for (const p of pts) {
                const { y } = foldChimney(applyMatrixToBall(w.elem.inv().normalized(), p), I);
                if (!inside(ballToKlein(y))) continue;
                const u = ballToUHS(y);
                // Which element's isometric sphere I(k⁻¹) covers y? |c'z + d'|² + |c'|²t² < 1 for k⁻¹.
                for (const e of rest) {
                    const K = e.matrix.inv().normalized();
                    const cz = K.c.mul(new Complex(u.x, u.y)).add(K.d);
                    if (cz.normSq() + K.c.normSq() * u.t * u.t < 1 - 1e-9 && tryAdd(e)) { added++; break; }
                }
            }
        }
        if (!added) break;
        poly = pruneWalls(walls);
    }
    for (const w of walls) { w.cov0 = w.cov.clone(); w.pairing = null; }

    const count = Math.min(walls.length, 256);
    for (let i = 0; i < 256; i++) {
        if (i < count) _paddedBuffer[i].copy(walls[i].cov);
        else _paddedBuffer[i].copy(EMPTY_WALL);
    }
    return {
        mode: 'ford',
        facesBuffer: _paddedBuffer, count, walls,
        stabilizer: { elements: [], capped: false, order: 1 },
        basepoint: ref.clone(), conePoint: ref.clone(), q0: ref.clone(), ref,
        poly, orbit, words, notes, maxRadius: maxR, z0,
        /** The element pairing the piece of face i through ball point p. */
        pairingAt(i, p) {
            const w = walls[i];
            const s0 = w.elem.inv().normalized();
            if (isStabElem(w.elem.normalized())) return { matrix: s0, word: reduceWord(invertWord(w.word)) };
            const { M } = foldChimney(applyMatrixToBall(s0, p), I);
            return { matrix: M.mul(s0).normalized(), elem: M };
        }
    };
}
