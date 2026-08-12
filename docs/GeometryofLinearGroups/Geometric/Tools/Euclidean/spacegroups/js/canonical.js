/**
 * Canonical Dirichlet domain pipeline for the space-groups tool.
 *
 * Given generators of a subgroup G < Isom(R^3) and a basepoint p (the image of
 * the origin under the view isometry), we compute:
 *
 *  1. The orbit of p under G out to a word-length / beam budget.
 *  2. The basepoint stabilizer H = G ∩ Stab(p), closed up into a finite group
 *     (for discrete G this is a finite subgroup of O(3), order ≤ 120).
 *  3. If H is nontrivial, a generically perturbed basepoint q = p + ε·v.
 *     ALL walls are then built as bisectors Bis(q, g·q) at q:
 *       - for h ∈ H the wall Bis(q, hq) passes EXACTLY through p (h fixes p),
 *         so these are the walls of a fundamental cone for H at p;
 *       - for other g the wall is the Dirichlet bisector at p up to O(ε).
 *     This makes the domain an EXACT convex fundamental polyhedron (it is the
 *     Dirichlet domain at q), so every face pairs facewise via g^{-1}.
 *  4. Walls accepted incrementally by a strict face-contribution test,
 *     then a joint pruning pass.
 *  5. Face-pairing assignment: wall of g pairs to the wall of g^{-1} via g^{-1},
 *     with words in the user's generators.
 */
import * as THREE from 'three';
import {
    Iso, isoKey, distFromIdentityIso, classifyIso,
    imageOfOrigin, applyIso, eucDistProxy,
    bisectorCov, covToGeom, wallSD, isInsideWalls,
    sampleWallPoints, wallContributes, faceViolation, refineOnWall, projectToWall,
    reduceWord, invertWord, RBOUND
} from './math.js';
import { findEdges } from './certifier.js';

const STABILIZER_CAP = 130;       // |H| cap (largest finite subgroup of O(3) is order 120)
const STAB_TOL = 1e-7;            // squared Euclidean dist for "fixes basepoint"

// Deterministic generic direction for the cone-defining perturbation.
const GENERIC_DIR = new THREE.Vector3(0.5320397, 0.3141593, 0.7853982).normalize();
const PERTURB_EPS = 0.12;

// ---------------- Phase 1: orbit search ----------------

/**
 * Beam search over the group, collecting orbit elements sorted by distance.
 * Returns { orbit: [{matrix, word, orbitPt, dist}], stabilizers: [{matrix, word}] }
 */
function searchOrbit(generators, { maxDepth, beamWidth, maxOrbit }) {
    // Everything here is in the BASEPOINT FRAME: the beam starts at the
    // identity, the basepoint is the origin, and all elements are pure words
    // in the user's generators. The view isometry only enters later, when
    // geometry is built.
    const origin = new THREE.Vector3(0, 0, 0);
    const numGens = generators.length;
    const seen = new Set([isoKey(Iso.identity())]);
    const orbit = [];
    const stabilizers = [];

    let beam = [{ matrix: Iso.identity(), word: [], lastGenIdx: -1 }];

    for (let depth = 1; depth <= maxDepth; depth++) {
        const candidates = [];
        for (const entry of beam) {
            for (let i = 0; i < numGens; i++) {
                // Generators interleaved [g1, g1^-1, g2, g2^-1, ...]; skip backtracking
                if (entry.lastGenIdx >= 0 && i === (entry.lastGenIdx ^ 1)) continue;
                const next = entry.matrix.mul(generators[i]);
                const key = isoKey(next);
                if (seen.has(key)) continue;
                seen.add(key);

                const orbitPt = imageOfOrigin(next);
                const dist = eucDistProxy(origin, orbitPt);
                const base = (i >> 1) + 1;
                const genIdx = (i & 1) === 0 ? base : -base;
                candidates.push({
                    matrix: next,
                    word: [...entry.word, genIdx],
                    lastGenIdx: i,
                    orbitPt, dist
                });
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
    return { orbit, stabilizers };
}

// ---------------- Phase 2: stabilizer closure ----------------

/**
 * Close the found stabilizer elements into a group (BFS over products).
 * Returns { elements: [{matrix, word}], capped: bool }.
 * elements[0] is the identity. If discrete, H is a finite subgroup of O(3):
 * cyclic, dihedral, or the symmetry group of a Platonic solid (≤ 120).
 */
function closeStabilizer(stabGens) {
    const identity = { matrix: Iso.identity(), word: [] };
    if (stabGens.length === 0) return { elements: [identity], capped: false };

    const seen = new Map([[isoKey(identity.matrix), identity]]);
    const queue = [identity];
    let head = 0;
    let capped = false;

    while (head < queue.length) {
        const cur = queue[head++];
        for (const g of stabGens) {
            const next = cur.matrix.mul(g.matrix).normalized();
            const key = isoKey(next);
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

// ---------------- Phase 3+4+5: wall assembly ----------------

/**
 * Remove walls that no longer contribute a face, iterating to stability.
 * Mutates `walls`.
 */
function pruneWalls(walls, basepoint) {
    let changed = true;
    while (changed) {
        changed = false;
        const geoms = walls.map(w => w.geom);
        for (let i = walls.length - 1; i >= 0; i--) {
            // refine=true: local search detects sliver faces below grid resolution
            let keep = wallContributes(walls[i].geom, geoms, i, basepoint, true, -1e-5, true);
            // Completion-added walls carry a seed point near their (possibly
            // tiny) face; refine from there before giving up.
            if (!keep && walls[i].seed) {
                const r = refineOnWall(walls[i].geom, walls[i].seed, geoms, i);
                keep = r.v < -1e-7 && r.p.lengthSq() < RBOUND * RBOUND;
            }
            if (!keep) {
                walls.splice(i, 1);
                geoms.splice(i, 1);
                changed = true;
            }
        }
    }
}

/**
 * Find a few sample points in the (relative) interior of face i.
 */
function faceSamples(walls, i, basepoint, maxCount = 12) {
    const geoms = walls.map(w => w.geom);
    const pts = sampleWallPoints(walls[i].geom, basepoint, true);
    const out = [];
    // Prefer points strictly inside the other half-spaces
    for (const tol of [-1e-4, -1e-6]) {
        for (const p of pts) {
            if (isInsideWalls(p, geoms, tol, i)) {
                out.push(p);
                if (out.length >= maxCount) return out;
            }
        }
        if (out.length > 0) return out;
    }
    // Sliver face: refine from the best grid sample (and seed, if any)
    const starts = [];
    let best = null, bestV = Infinity;
    for (const p of pts) {
        const v = faceViolation(p, geoms, i);
        if (v < bestV) { bestV = v; best = p; }
    }
    if (best) starts.push(best);
    if (walls[i].seed) starts.push(walls[i].seed);
    for (const s0 of starts) {
        const r = refineOnWall(walls[i].geom, s0, geoms, i);
        if (r.v < -1e-7 && r.p.lengthSq() < RBOUND * RBOUND) { out.push(r.p); break; }
    }
    return out;
}

/**
 * Assign face pairings.
 * For a cone wall of h:        s = h^{-1}, partner = wall of h^{-1}.
 * For a Dirichlet wall of g:   s = g^{-1}, partner = wall of g^{-1}.
 * Mutates walls, setting wall.pairing = {matrix, word, partner} (or null).
 */
function assignPairings(walls, conePoint, vIso, vInv) {
    const geoms = walls.map(w => w.geom);

    // Find the wall whose defining element equals m.
    // Wall elements are pure words in the basepoint frame.
    const wallOfElement = (m) => {
        let best = -1, bestD = 1e-6;
        for (let j = 0; j < walls.length; j++) {
            const d = distFromIdentityIso(m.mul(walls[j].elem.inv()).normalized());
            if (d < bestD) { bestD = d; best = j; }
        }
        return best;
    };

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        // The wall of g is Bis(q, gq); s = g^{-1} maps it to Bis(g^{-1}q, q),
        // which is the wall of g^{-1}. (An order-2 element — e.g. a reflection
        // — pairs a wall with itself: partner === i.) Algebra lives in the
        // basepoint frame; the GEOMETRIC pairing on the displayed
        // (view-transformed) walls is the conjugate V·g^{-1}·V^{-1}.
        const sAlg = w.elem.inv().normalized();
        const sGeom = vIso.mul(sAlg).mul(vInv).normalized();
        const sWord = invertWord(w.word);
        const partner = wallOfElement(sAlg);
        if (partner < 0) { w.pairing = null; continue; }

        // Verification samples: image of the face must lie in the closed domain.
        const samples = faceSamples(walls, i, conePoint, 6);
        let worst = 0;
        let ok = samples.length > 0;
        for (const p of samples) {
            const q = applyIso(sGeom, p);
            if (q.lengthSq() >= RBOUND * RBOUND) { ok = false; break; }
            let maxSd = -Infinity;
            for (let j = 0; j < geoms.length; j++) {
                const sd = wallSD(q, geoms[j]);
                if (sd > maxSd) maxSd = sd;
            }
            worst = Math.max(worst, maxSd);
            if (maxSd > 1e-4) { ok = false; break; }
        }
        if (!ok) { w.pairing = null; continue; }

        w.pairing = { matrix: sGeom, alg: sAlg, word: reduceWord(sWord), partner, residual: worst };
    }
}

function makeWall(matrix, word, cov, seed) {
    const geom = covToGeom(cov);
    const isStab = imageOfOrigin(matrix).lengthSq() < STAB_TOL;
    return {
        cov, geom,
        elem: matrix, word,
        kind: isStab ? 'cone' : 'face',
        klass: classifyIso(matrix).type,
        seed: seed ? projectToWall(seed, geom) : undefined
    };
}

/**
 * Completion step (Epstein-style): if a sample x in the face of wall_g maps
 * under s = g^{-1} to a point y that escapes the domain past wall_k, then
 * d(x, g·k·q) < d(x, q), so the wall of element g·k is a MISSING wall that
 * cuts the claimed face. Likewise a missing partner wall is the wall of
 * g^{-1} itself. Returns the number of walls added (mutates `walls`).
 */
function completeMissingWalls(walls, conePoint, q0, vIso, vInv, maxFaces) {
    const geoms = walls.map(w => w.geom);
    const toAdd = new Map();   // isoKey -> {matrix (pure word), word, seed}

    const propose = (matrix, word, seed) => {
        const m = matrix.normalized();
        const key = isoKey(m);
        if (distFromIdentityIso(m) < 1e-7) return;
        if (walls.some(w => isoKey(w.elem) === key)) return;
        if (!toAdd.has(key)) toAdd.set(key, { matrix: m, word: reduceWord(word), seed });
    };

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const sAlg = w.elem.inv().normalized();
        const sGeom = vIso.mul(sAlg).mul(vInv).normalized();
        const sWord = invertWord(w.word);
        const samples = faceSamples(walls, i, conePoint, 8);

        // Missing partner wall (wall of g^{-1}); its face is the image of
        // face i, so seed it there.
        let havePartner = false;
        for (const w2 of walls) {
            if (distFromIdentityIso(sAlg.mul(w2.elem.inv()).normalized()) < 1e-6) { havePartner = true; break; }
        }
        if (!havePartner && samples.length > 0) {
            propose(sAlg, sWord, applyIso(sGeom, samples[0]));
        }

        // Face samples escaping the domain reveal missing walls g·k, which
        // cut the claimed face near the offending sample.
        for (const p of samples) {
            const y = applyIso(sGeom, p);
            if (y.lengthSq() >= RBOUND * RBOUND) continue;
            for (let k = 0; k < walls.length; k++) {
                if (wallSD(y, geoms[k]) > 1e-6) {
                    propose(w.elem.mul(walls[k].elem), [...w.word, ...walls[k].word], p);
                }
            }
        }
    }

    let added = 0;
    for (const { matrix, word, seed } of toAdd.values()) {
        if (walls.length >= maxFaces) break;
        const gq = applyIso(vIso.mul(matrix).normalized(), q0);
        const cov = bisectorCov(conePoint, gq);
        if (!cov) continue;
        if (walls.some(w =>
            Math.abs(w.cov.x - cov.x) < 1e-7 && Math.abs(w.cov.y - cov.y) < 1e-7 &&
            Math.abs(w.cov.z - cov.z) < 1e-7 && Math.abs(w.cov.w - cov.w) < 1e-7)) continue;
        walls.push(makeWall(matrix, word, cov, seed));
        added++;
    }
    return added;
}

/**
 * Edge-driven completion: transport the center of each detected edge through
 * its face pairing. For a true Dirichlet domain the image lies on a second
 * wall; two failure modes reveal MISSING walls (typically long products whose
 * sliver faces the acceptance grid rejected):
 *   (a) the image escapes past wall k  ->  the wall of elem_i·elem_k is missing;
 *   (b) the image lands in a face INTERIOR -> some orbit element's wall cuts
 *       the edge point; scan the orbit for it.
 * Returns the number of walls added (mutates `walls`).
 */
function edgeCompletion(walls, orbit, conePoint, q0, vIso, maxFaces) {
    const geoms = walls.map(w => w.geom);
    const wallKeys = new Set(walls.map(w => isoKey(w.elem)));
    const toAdd = new Map();   // isoKey -> {matrix, word, seed}

    const propose = (matrix, word, seed) => {
        const m = matrix.normalized();
        const key = isoKey(m);
        if (distFromIdentityIso(m) < 1e-7) return;
        if (wallKeys.has(key)) return;
        if (!toAdd.has(key)) toAdd.set(key, { matrix: m, word: reduceWord(word), seed });
    };

    const edges = findEdges(walls);
    for (const e of edges) {
        const wA = walls[e.i];
        if (!wA.pairing) continue;
        // Snap the segment center onto the exact intersection of the labeled pair
        let x = e.mid.clone();
        for (let k = 0; k < 30; k++) {
            x = projectToWall(x, geoms[e.i]);
            x = projectToWall(x, geoms[e.j]);
        }
        const y = applyIso(wA.pairing.matrix, x);
        if (y.lengthSq() >= RBOUND * RBOUND) continue;

        let secondExists = false;
        for (let k = 0; k < walls.length; k++) {
            const sd = wallSD(y, geoms[k]);
            if (sd > 1e-7) {
                propose(wA.elem.mul(walls[k].elem), [...wA.word, ...walls[k].word], x);
            } else if (k !== e.i && k !== e.j && k !== wA.pairing.partner && Math.abs(sd) < 1e-7) {
                secondExists = true;
            }
        }

        if (!secondExists && toAdd.size === 0) {
            // Image in a face interior: a wall cutting (or passing through)
            // the source point is missing — find it among the orbit.
            for (const entry of orbit) {
                if (wallKeys.has(isoKey(entry.matrix))) continue;
                const gq = applyIso(vIso.mul(entry.matrix).normalized(), q0);
                const cov = bisectorCov(conePoint, gq);
                if (!cov) continue;
                if (wallSD(x, covToGeom(cov)) > -1e-6) {
                    propose(entry.matrix, entry.word, x);
                    break;
                }
            }
        }
    }

    let added = 0;
    for (const { matrix, word, seed } of toAdd.values()) {
        if (walls.length >= maxFaces) break;
        const gq = applyIso(vIso.mul(matrix).normalized(), q0);
        const cov = bisectorCov(conePoint, gq);
        if (!cov) continue;
        if (walls.some(w =>
            Math.abs(w.cov.x - cov.x) < 1e-7 && Math.abs(w.cov.y - cov.y) < 1e-7 &&
            Math.abs(w.cov.z - cov.z) < 1e-7 && Math.abs(w.cov.w - cov.w) < 1e-7)) continue;
        walls.push(makeWall(matrix, word, cov, seed));
        added++;
    }
    return added;
}

// ---------------- Public entry point ----------------

// Pre-allocated 256-covector buffer for the shader
const _paddedBuffer = new Array(256);
for (let i = 0; i < 256; i++) _paddedBuffer[i] = new THREE.Vector4(1, 0, 0, 1000);
const EMPTY_WALL = new THREE.Vector4(1.0, 0.0, 0.0, 1000.0);  // far-away plane ≈ no-op

/**
 * Compute the canonical Dirichlet domain.
 *
 * @param {Iso[]} generators - interleaved [g1, g1^-1, g2, g2^-1, ...]
 * @param {Iso} viewIso - current view isometry (an element of G)
 * @param {number} maxFaces - cap on accepted walls
 * @param {Object} options - { maxDepth, beamWidth, maxOrbit, skipPairings, fullDirichlet }
 * @returns {{
 *   facesBuffer: THREE.Vector4[], count: number,
 *   walls: Array, stabilizer: { elements, capped, order },
 *   basepoint: THREE.Vector3, conePoint: THREE.Vector3
 * }}
 */
export function computeCanonicalDomain(generators = [], viewIso = Iso.identity(), maxFaces = 96, options = {}) {
    const {
        maxDepth = 8,
        beamWidth = 600,
        maxOrbit = 6000,
        skipPairings = false,
        fullDirichlet = false
    } = options;

    const basepoint = imageOfOrigin(viewIso);

    if (!generators || generators.length === 0) {
        for (let i = 0; i < 256; i++) _paddedBuffer[i].copy(EMPTY_WALL);
        return {
            facesBuffer: _paddedBuffer, count: 0, walls: [],
            stabilizer: { elements: [], capped: false, order: 1 },
            basepoint, conePoint: basepoint.clone()
        };
    }

    // Phase 1: orbit of the basepoint in the basepoint frame (pure words);
    // stabilizer elements fix the frame origin.
    const { orbit, stabilizers } = searchOrbit(generators, { maxDepth, beamWidth, maxOrbit });

    // Phase 2: stabilizer closure
    const { elements: H, capped } = closeStabilizer(stabilizers);

    // Phase 3: perturbed basepoint q0 (basepoint frame). If the stabilizer is
    // nontrivial, nudge in a fixed generic direction. All walls are bisectors
    // at q = V(q0), so the polyhedron is the exact (view-transformed)
    // Dirichlet domain at q0: stabilizer walls pass exactly through the
    // basepoint (forming a fundamental cone for H), the rest are the
    // basepoint-bisectors up to O(ε).
    const hasStab = H.length > 1;
    const vInv = viewIso.inv().normalized();
    // fullDirichlet: render the full (symmetric) Dirichlet domain D(p) instead
    // of the canonical fundamental domain. We then DON'T perturb the basepoint
    // and DON'T add the stabilizer cone walls — at the true basepoint those
    // bisectors are degenerate (h·p = p), so D(p) is H-invariant and symmetric
    // (it is |H| copies of a fundamental domain).
    const usePerturb = hasStab && !fullDirichlet;
    const q0 = usePerturb
        ? GENERIC_DIR.clone().multiplyScalar(PERTURB_EPS)
        : new THREE.Vector3(0, 0, 0);
    const conePoint = applyIso(viewIso, q0);

    // Candidate walls: stabilizer elements first (their walls bound the cone
    // and pass through the basepoint), then orbit elements by distance.
    const candidates = [];
    if (!fullDirichlet) {
        for (const h of H) {
            if (distFromIdentityIso(h.matrix) < 1e-7) continue;  // skip identity
            candidates.push({ matrix: h.matrix, word: h.word, kind: 'cone' });
        }
    }
    for (const entry of orbit) {
        candidates.push({ matrix: entry.matrix, word: entry.word, kind: 'face' });
    }

    // Phase 4: accept walls that contribute a face, incrementally.
    // Wall of word w (displayed): Bis(V·q0, V·w·q0).
    const walls = [];
    const geoms = [];
    const covDup = (cov) => walls.some(w =>
        Math.abs(w.cov.x - cov.x) < 1e-7 && Math.abs(w.cov.y - cov.y) < 1e-7 &&
        Math.abs(w.cov.z - cov.z) < 1e-7 && Math.abs(w.cov.w - cov.w) < 1e-7);

    for (const cand of candidates) {
        if (walls.length >= maxFaces) break;
        const gq = applyIso(viewIso.mul(cand.matrix).normalized(), q0);
        const cov = bisectorCov(conePoint, gq);
        if (!cov || covDup(cov)) continue;
        const geom = covToGeom(cov);
        const idx = walls.length;
        geoms.push(geom);
        // Quick test with sparse samples first, then dense
        if (wallContributes(geom, geoms, idx, conePoint, false) ||
            wallContributes(geom, geoms, idx, conePoint, true)) {
            walls.push({
                cov, geom,
                elem: cand.matrix, word: cand.word,
                kind: cand.kind,
                klass: classifyIso(cand.matrix).type
            });
        } else {
            geoms.pop();
        }
    }

    // Phase 5: joint pruning
    pruneWalls(walls, conePoint);

    // Phase 6: pairings, with completion — missing walls revealed by escaping
    // face images are added, then prune/pair again until stable.
    if (!skipPairings) {
        assignPairings(walls, conePoint, viewIso, vInv);
        let edgePasses = 0;
        for (let iter = 0; iter < 20; iter++) {
            let added = completeMissingWalls(walls, conePoint, q0, viewIso, vInv, maxFaces);
            // Edge-driven completion is dearer (full edge extraction), so run
            // it only when the face-sample pass finds nothing.
            if (added === 0 && edgePasses < 6) {
                edgePasses++;
                added = edgeCompletion(walls, orbit, conePoint, q0, viewIso, maxFaces);
            }
            if (added === 0) break;
            pruneWalls(walls, conePoint);
            assignPairings(walls, conePoint, viewIso, vInv);
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
        basepoint, conePoint
    };
}
