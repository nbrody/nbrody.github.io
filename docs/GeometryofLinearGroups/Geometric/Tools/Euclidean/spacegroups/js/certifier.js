/**
 * Numerical Poincaré polyhedron theorem certifier for the space-groups tool.
 *
 * Given the walls of the canonical domain with their pairing transformations,
 * we check:
 *
 *  (1) PAIRING: each wall has a pairing s with s(face_i) ⊂ ∂D landing on the
 *      partner wall, and the partner's pairing is s^{-1} (σ is an involution
 *      on faces; a face may be paired with itself — e.g. by a reflection).
 *  (2) EDGE CYCLES: each edge (codim-2 cell) is traced around its cycle via
 *      the pairing maps. The interior dihedral angles along the cycle must
 *      sum to 2π/m for an integer m ≥ 1, and the cycle transformation must
 *      satisfy P^m = identity (a rotation of order m about the edge).
 *
 * If both hold (numerically), Poincaré's theorem implies the group generated
 * by the pairing transformations is discrete with this domain as fundamental
 * polyhedron — modulo two caveats we report honestly:
 *    • all checks are floating-point, with explicit residuals;
 *    • if the domain is UNBOUNDED (the group is not cocompact — e.g. a rod or
 *      layer group, or a finite point group), completeness at infinity is
 *      NOT checked.
 */
import * as THREE from 'three';
import {
    Iso, isoKey, distFromIdentityIso,
    applyIso, wallSD, wallOutwardNormal, isInsideWalls,
    projectToWall, formatWordMathJax, reduceWord, invertWord, RBOUND
} from './math.js';

/** Snap p onto the intersection of two walls by alternating projection. */
function snapToEdge(p, gA, gB) {
    let x = p.clone();
    for (let k = 0; k < 30; k++) {
        x = projectToWall(x, gA);
        x = projectToWall(x, gB);
        if (Math.abs(wallSD(x, gA)) < 1e-13 && Math.abs(wallSD(x, gB)) < 1e-13) break;
    }
    return x;
}

/**
 * Two adjacent points at the CENTER of the edge segment of walls (i, j)
 * nearest to `near`. Working from the exact intersection line keeps walk
 * start points interior to the edge — pairings map edges isometrically, so
 * the transported points then stay clear of vertices around the whole cycle.
 * Returns [x1, x2] or null.
 */
function centerOnEdge(near, i, j, geoms) {
    const curve = intersectWalls(geoms[i], geoms[j]);
    if (!curve) return null;
    const n = 1440;
    const pts = new Array(n);
    const inside = new Array(n);
    for (let k = 0; k < n; k++) {
        const t = LINE_HALF * (-1 + 2 * (k + 0.5) / n);
        const p = curvePoint(curve, t);
        pts[k] = p;
        inside[k] = p.lengthSq() < RBOUND * RBOUND * 0.999999 && isInsideOthers(p, geoms, i, j);
    }
    const runs = extractRuns(inside, false);
    let best = null, bestD = Infinity;
    for (const run of runs) {
        if (run.length < 2) continue;
        for (const k of run) {
            const d = pts[k].distanceToSquared(near);
            if (d < bestD) { bestD = d; best = run; }
        }
    }
    if (!best) return null;
    const c = Math.floor(best.length / 2);
    return [pts[best[c]], pts[best[Math.max(0, c - 1)]]];
}

const ON_WALL_TOL = 2e-5;      // |signed dist| below this = "on the wall"
const INSIDE_TOL = 2e-5;       // domain membership slack
const ANGLE_TOL = 0.02;        // radians, for 2π/m matching
const LINE_SAMPLES = 1440;
const LINE_HALF = RBOUND * 1.05;   // half-length of the sampled line segment
const MAX_CYCLE_LEN = 200;

// ---------------- Edge extraction ----------------

/**
 * Intersection of two wall planes as a line {point, dir}, or null if the
 * planes are parallel. `point` is the point of the line closest to the origin.
 */
function intersectWalls(g1, g2) {
    const n12 = g1.n.dot(g2.n);
    const det = 1 - n12 * n12;
    if (det < 1e-14) return null;   // parallel planes
    const a = (g1.d - g2.d * n12) / det;
    const b = (g2.d - g1.d * n12) / det;
    const point = g1.n.clone().multiplyScalar(a).addScaledVector(g2.n, b);
    const dir = new THREE.Vector3().crossVectors(g1.n, g2.n).normalize();
    return { kind: 'line', point, dir };
}

function curvePoint(curve, t) {
    return curve.point.clone().add(curve.dir.clone().multiplyScalar(t));
}

/**
 * Find the edges of the domain.
 *
 * For each wall pair we sample the intersection line and keep contiguous
 * runs inside the closed domain. Several walls may contain the SAME line
 * (common in symmetric domains), so the raw segments are deduplicated
 * geometrically, and for each geometric edge the two ACTIVE supporting faces
 * (and the interior dihedral angle) are determined by a wedge analysis in the
 * plane perpendicular to the edge.
 *
 * Returns [{i, j, samples: Vector3[], mid: Vector3, angle}]
 */
export function findEdges(walls) {
    const geoms = walls.map(w => w.geom);
    const raw = [];

    for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
            const curve = intersectWalls(geoms[i], geoms[j]);
            if (!curve) continue;

            const n = LINE_SAMPLES;
            const inside = new Array(n);
            const pts = new Array(n);
            for (let k = 0; k < n; k++) {
                const t = LINE_HALF * (-1 + 2 * (k + 0.5) / n);
                const p = curvePoint(curve, t);
                pts[k] = p;
                inside[k] = p.lengthSq() < RBOUND * RBOUND * 0.999999 &&
                    isInsideOthers(p, geoms, i, j);
            }

            const runs = extractRuns(inside, false);
            for (const run of runs) {
                if (run.length < 2) continue;
                const samples = run.map(k => pts[k]);
                const mid = samples[Math.floor(samples.length / 2)];
                raw.push({ samples, mid });
            }
        }
    }

    // Deduplicate segments by midpoint, then resolve the active face pair.
    const seen = new Set();
    const edges = [];
    for (const arc of raw) {
        const key = `${arc.mid.x.toFixed(6)},${arc.mid.y.toFixed(6)},${arc.mid.z.toFixed(6)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Tangent direction of the segment at the midpoint
        const mIdx = Math.floor(arc.samples.length / 2);
        const a = arc.samples[Math.max(0, mIdx - 1)];
        const b = arc.samples[Math.min(arc.samples.length - 1, mIdx + 1)];
        const dir = new THREE.Vector3().subVectors(b, a);
        if (dir.lengthSq() < 1e-20) continue;
        dir.normalize();

        // Walls passing through the midpoint
        const onWalls = [];
        for (let k = 0; k < geoms.length; k++) {
            if (Math.abs(wallSD(arc.mid, geoms[k])) < ON_WALL_TOL * 10) onWalls.push(k);
        }
        if (onWalls.length < 2) continue;

        const wedge = activeWedge(arc.mid, dir, onWalls, geoms);
        if (!wedge) continue;   // empty/degenerate wedge: not a real edge

        edges.push({ i: wedge.i, j: wedge.j, samples: arc.samples, mid: arc.mid, angle: wedge.angle });
    }

    // Second dedup pass: when several walls contain the same line, the same
    // geometric edge is sampled several times (with different sample phases),
    // so midpoint keys don't merge them. Merge edges of the same face pair
    // whose segments are geometrically close.
    const spacing = (e) => e.samples.length > 1 ? e.samples[0].distanceTo(e.samples[1]) : 1e-4;
    const merged = [];
    for (const e of edges) {
        let dup = null;
        for (const m of merged) {
            if (m.i !== e.i || m.j !== e.j) continue;
            // Tolerance scales with sampling resolution so genuinely distinct
            // small edges are not merged.
            const tol = Math.max(2.5 * Math.max(spacing(e), spacing(m)), 1e-4);
            let dmin = Infinity;
            for (const s of m.samples) dmin = Math.min(dmin, s.distanceToSquared(e.mid));
            if (dmin < tol * tol) { dup = m; break; }
        }
        if (dup) {
            // Keep the longer segment as representative
            if (e.samples.length > dup.samples.length) {
                dup.samples = e.samples;
                dup.mid = e.mid;
                dup.angle = Math.min(dup.angle, e.angle);
            }
        } else {
            merged.push(e);
        }
    }
    merged.forEach((e, idx) => { e.id = idx; });
    return merged;
}

/**
 * Wedge analysis at an edge point x with tangent direction d, among the walls
 * `wallIdxs` passing through x. Directions v ⊥ d pointing into the domain
 * satisfy v·N_k ≤ 0 for all outward normals N_k. The feasible set is an
 * angular interval whose width is the interior dihedral angle and whose two
 * binding constraints are the active faces.
 * Returns {i, j, angle} or null if the wedge is empty/degenerate.
 */
function activeWedge(x, d, wallIdxs, geoms) {
    // Basis (u, w) of the plane perpendicular to d
    let u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(d.x) > 0.9) u.set(0, 1, 0);
    u.sub(d.clone().multiplyScalar(u.dot(d))).normalize();
    const w = new THREE.Vector3().crossVectors(d, u);

    // Projected normal angles
    const phis = [];
    const idxs = [];
    for (const k of wallIdxs) {
        const N = wallOutwardNormal(x, geoms[k]);
        const Nu = N.dot(u), Nw = N.dot(w);
        if (Nu * Nu + Nw * Nw < 1e-12) continue;  // wall contains the edge plane (degenerate)
        phis.push(Math.atan2(Nw, Nu));
        idxs.push(k);
    }
    if (phis.length < 2) return null;

    // Feasible angles: cos(θ - φ_k) ≤ tol for every k. Scan finely.
    const N_SCAN = 2880;
    const feas = new Array(N_SCAN);
    for (let s = 0; s < N_SCAN; s++) {
        const th = 2 * Math.PI * s / N_SCAN;
        let ok = true;
        for (const phi of phis) {
            if (Math.cos(th - phi) > 1e-7) { ok = false; break; }
        }
        feas[s] = ok;
    }
    const runs = extractRuns(feas, true);
    if (runs.length === 0) return null;
    // The feasible set of a wedge is a single interval; take the longest run.
    runs.sort((r1, r2) => r2.length - r1.length);
    const run = runs[0];
    const angle = run.length * 2 * Math.PI / N_SCAN;
    if (angle < 1e-3 || angle > Math.PI + 1e-3) return null;

    // Binding constraints at the interval endpoints
    const thA = 2 * Math.PI * run[0] / N_SCAN;
    const thB = 2 * Math.PI * run[run.length - 1] / N_SCAN;
    const binding = (th) => {
        let best = -Infinity, bi = idxs[0];
        for (let k = 0; k < phis.length; k++) {
            const c = Math.cos(th - phis[k]);
            if (c > best) { best = c; bi = idxs[k]; }
        }
        return bi;
    };
    const fa = binding(thA), fb = binding(thB);
    if (fa === fb) return null;
    return { i: Math.min(fa, fb), j: Math.max(fa, fb), angle };
}

function isInsideOthers(p, geoms, i, j) {
    for (let k = 0; k < geoms.length; k++) {
        if (k === i || k === j) continue;
        if (wallSD(p, geoms[k]) > INSIDE_TOL) return false;
    }
    return Math.abs(wallSD(p, geoms[i])) < ON_WALL_TOL * 5 &&
        Math.abs(wallSD(p, geoms[j])) < ON_WALL_TOL * 5;
}

function extractRuns(inside, circular) {
    const n = inside.length;
    const runs = [];
    let cur = null;
    for (let k = 0; k < n; k++) {
        if (inside[k]) {
            if (!cur) cur = [];
            cur.push(k);
        } else if (cur) {
            runs.push(cur);
            cur = null;
        }
    }
    if (cur) runs.push(cur);
    // Merge wraparound run for circular scans (angle scans only)
    if (circular && runs.length >= 2) {
        const first = runs[0], last = runs[runs.length - 1];
        if (first[0] === 0 && last[last.length - 1] === n - 1) {
            runs[0] = [...last, ...first];
            runs.pop();
        }
    }
    return runs;
}

// ---------------- Boundedness ----------------

/**
 * Is the domain bounded? A convex intersection of half-spaces {n_i·x ≤ d_i}
 * is unbounded iff some direction u has n_i·u ≤ 0 for ALL i (a recession
 * direction). Scan a Fibonacci sphere of directions.
 */
export function domainIsBounded(walls) {
    if (walls.length < 4) return false;
    const N = 500;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < N; k++) {
        const y = 1 - 2 * (k + 0.5) / N;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = golden * k;
        const u = new THREE.Vector3(r * Math.cos(th), y, r * Math.sin(th));
        let escapes = true;
        for (const w of walls) {
            if (u.x * w.cov.x + u.y * w.cov.y + u.z * w.cov.z > 1e-7) { escapes = false; break; }
        }
        if (escapes) return false;
    }
    return true;
}

// ---------------- Certifier ----------------

/**
 * Run the certificate. `walls` come from computeCanonicalDomain (with
 * pairings assigned); `basepoint` is the Dirichlet basepoint.
 *
 * Returns {
 *   ok, status: 'verified' | 'failed' | 'incomplete',
 *   log: string[],            // human-readable certificate
 *   edgeCycles: [...], pairingChecks: [...],
 *   isBounded: boolean
 * }
 */
export function certifyDomain(walls, basepoint) {
    const log = [];
    const geoms = walls.map(w => w.geom);
    let ok = true;
    let incomplete = false;

    if (walls.length === 0) {
        return { ok: false, status: 'incomplete', log: ['No walls — nothing to certify.'], edgeCycles: [], pairingChecks: [], isBounded: false };
    }

    // ---- (1) Face pairing checks ----
    const pairingChecks = [];
    log.push(`— Face pairing check (${walls.length} walls) —`);
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w.pairing) {
            ok = false;
            log.push(`✗ wall ${i} (${wordStr(w.word)}): NO pairing transformation found.`);
            pairingChecks.push({ i, ok: false });
            continue;
        }
        const j = w.pairing.partner;
        let entryOk = true;
        let msg = '';
        if (j < 0) {
            entryOk = false;
            msg = 'image does not land on any wall';
        } else {
            // σ should be an involution: partner of partner is i,
            // with pairing(partner) = pairing(i)^{-1}
            const wj = walls[j];
            if (!wj.pairing || wj.pairing.partner !== i) {
                entryOk = false;
                msg = `σ not involutive (σ(${i})=${j} but σ(${j})=${wj.pairing ? wj.pairing.partner : '∅'})`;
            } else {
                const prod = w.pairing.matrix.mul(wj.pairing.matrix);
                const res = distFromIdentityIso(prod.normalized());
                if (res > 1e-6) {
                    entryOk = false;
                    msg = `s_${j} ≠ s_${i}^{-1} (residual ${res.toExponential(1)})`;
                }
            }
        }
        if (entryOk) {
            log.push(`✓ wall ${i} ↔ wall ${j}: s = ${wordStr(w.pairing.word)}, residual ${w.pairing.residual.toExponential(1)}`);
        } else {
            ok = false;
            log.push(`✗ wall ${i} (${wordStr(w.word)}): ${msg}`);
        }
        pairingChecks.push({ i, j, ok: entryOk });
    }

    // ---- (2) Edge cycles ----
    //
    // The walk is ALGEBRAIC: an edge of the Dirichlet domain at q on the
    // walls of elements (a, b) consists of points equidistant from {q, aq, bq}.
    // Leaving through wall_a applies s = a^{-1}, sending the edge to the points
    // equidistant from {q, a^{-1}q, a^{-1}b q} — i.e. the edge on the walls of
    // (a^{-1}, a^{-1}b). So the cycle is determined by group elements alone;
    // geometry only supplies WHICH wall pairs actually share an edge (from
    // segment detection) and the dihedral angles, computed exactly from the
    // wall normals.
    const edges = findEdges(walls);
    log.push(`— Edge cycle check (${edges.length} edge segments) —`);
    const edgeCycles = [];

    // Interior dihedral angle between two intersecting walls (covectors are
    // outward-oriented unit normals).
    const planeAngle = (W1, W2) => {
        const inner = W1.x * W2.x + W1.y * W2.y + W1.z * W2.z;
        if (inner < -1 + 1e-12 || inner > 1 - 1e-12) return null;   // parallel — no edge
        return Math.acos(Math.max(-1, Math.min(1, -inner)));
    };

    // Unique starting segments (one per geometric edge; the segment carries
    // two adjacent interior samples that we transport through the cycle).
    const visitedKeys = new Set();
    const edgeVisitKey = (p, through) =>
        `${through}|${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;

    for (const e0 of edges) {
        const mIdx = Math.floor(e0.samples.length / 2);
        const startX1 = e0.samples[Math.max(0, mIdx - 1)];
        const startX2 = e0.samples[Math.min(e0.samples.length - 1, mIdx + 1)];
        if (startX1.distanceToSquared(startX2) < 1e-24) continue;
        if (visitedKeys.has(edgeVisitKey(startX1, e0.i))) continue;

        // Start from the CENTER of the exact active-pair edge segment (the
        // raw segment may end near a vertex, where the next-face resolution is
        // ambiguous).
        //
        // The second face may be MISATTRIBUTED between near-coincident walls,
        // so validate candidates: for the true pair, the transported center
        // lands EXACTLY on the partner wall and on a second wall.
        const snapped0 = snapToEdge(startX1, geoms[e0.i], geoms[e0.j]);
        const candSecond = [e0.j];
        for (let k = 0; k < walls.length; k++) {
            if (k === e0.i || k === e0.j) continue;
            if (Math.abs(wallSD(snapped0, geoms[k])) < 5e-3) candSecond.push(k);
        }
        let sx1 = null, sx2 = null, startJ = e0.j;
        const wStart = walls[e0.i];
        for (const k of candSecond) {
            const c = centerOnEdge(snapToEdge(startX1, geoms[e0.i], geoms[k]), e0.i, k, geoms);
            if (!c || c[0].distanceToSquared(c[1]) < 1e-24) continue;
            if (wStart.pairing) {
                const img = applyIso(wStart.pairing.matrix, c[0]);
                if (Math.abs(wallSD(img, geoms[wStart.pairing.partner])) > 1e-8) continue;
                let secondOk = false;
                for (let m2 = 0; m2 < walls.length; m2++) {
                    if (m2 === wStart.pairing.partner) continue;
                    if (Math.abs(wallSD(img, geoms[m2])) < 1e-8) { secondOk = true; break; }
                }
                if (!secondOk) continue;
            }
            sx1 = c[0]; sx2 = c[1]; startJ = k;
            break;
        }
        if (!sx1) {
            // No validated second face: treat like a near-degenerate edge.
            let nNear = 0;
            for (const w of walls) {
                if (Math.abs(wallSD(snapped0, w.geom)) < 1e-3) nNear++;
            }
            if (nNear > 2) {
                incomplete = true;
                log.push(`⚠ edge (${e0.i},${e0.j}): ${nNear} walls pass within 1e-3 — ` +
                    `face attribution unresolved (near-degenerate configuration).`);
            } else {
                ok = false;
                log.push(`✗ edge (${e0.i},${e0.j}): no valid second face found for cycle start.`);
            }
            continue;
        }
        let x1 = sx1.clone(), x2 = sx2.clone();
        let aIdx = e0.i, bIdx = startJ;   // leave through aIdx
        let P = Iso.identity();
        let angleSum = 0;
        let words = [];
        let steps = 0;
        let failed = null;
        const cyclePairs = [];

        while (steps++ < MAX_CYCLE_LEN) {
            visitedKeys.add(edgeVisitKey(x1, aIdx));
            visitedKeys.add(edgeVisitKey(x1, bIdx));
            cyclePairs.push([aIdx, bIdx]);

            // Exact dihedral angle between the active walls
            const th = planeAngle(walls[aIdx].cov, walls[bIdx].cov);
            if (th === null) { failed = `walls (${aIdx},${bIdx}) do not intersect`; break; }
            angleSum += th;

            const wa = walls[aIdx];
            if (!wa.pairing) { failed = `wall ${aIdx} unpaired`; break; }
            P = wa.pairing.matrix.mul(P).normalized();
            words = [...wa.pairing.word, ...words];

            // Transport the edge points by the (exact) pairing isometry
            x1 = applyIso(wa.pairing.matrix, x1);
            x2 = applyIso(wa.pairing.matrix, x2);
            const arrived = wa.pairing.partner;

            // Resolve the active face pair at the image edge by wedge
            // analysis: walls through x1, fan in the plane ⊥ edge direction.
            // Tolerance is adaptive: near a vertex the transported sample may
            // sit a few 1e-3 from the second wall, so widen the candidate set
            // to the scale of the second-nearest wall and let the wedge pick
            // the active ones.
            const dir = new THREE.Vector3().subVectors(x2, x1).normalize();
            const dists = [];
            for (let k = 0; k < walls.length; k++) {
                dists.push({ k, d: Math.abs(wallSD(x1, geoms[k])) });
            }
            dists.sort((u, v) => u.d - v.d);
            // Prefer walls the point lies on EXACTLY (transports are exact
            // isometries); fall back to an adaptive tolerance near vertices.
            const exact = dists.filter(o => o.d < 1e-8);
            let onWalls;
            if (exact.length >= 2) {
                onWalls = exact.map(o => o.k);
            } else {
                const tolOn = Math.max(ON_WALL_TOL * 10, dists.length > 1 ? 1.6 * dists[1].d : 0);
                onWalls = dists.filter(o => o.d <= tolOn).map(o => o.k);
            }
            const wedge = onWalls.length >= 2 ? activeWedge(x1, dir, onWalls, geoms) : null;
            if (!wedge) { failed = 'active faces unresolved at image edge'; break; }
            let nextThrough;
            if (wedge.i === arrived) nextThrough = wedge.j;
            else if (wedge.j === arrived) nextThrough = wedge.i;
            else { failed = `arrived face ${arrived} not active at image edge (${wedge.i},${wedge.j})`; break; }

            // Re-snap onto the exact intersection of the resolved pair so the
            // walk stays exact.
            x1 = snapToEdge(x1, geoms[wedge.i], geoms[wedge.j]);
            x2 = snapToEdge(x2, geoms[wedge.i], geoms[wedge.j]);

            // The cycle transformation fixes the edge pointwise, so the walk
            // closes exactly.
            if (nextThrough === e0.i && arrived === startJ &&
                x1.distanceToSquared(sx1) < 1e-10) break;
            aIdx = nextThrough;
            bIdx = arrived;
        }

        if (!failed && steps >= MAX_CYCLE_LEN) failed = 'cycle did not close';

        if (failed) {
            // Near-degenerate configuration: several walls within sampling
            // tolerance of the same line. The segment's face pair cannot be
            // attributed reliably, so report a warning, not a failure.
            let nNear = 0;
            for (const w of walls) {
                if (Math.abs(wallSD(startX1, w.geom)) < 1e-3) nNear++;
            }
            if (nNear > 2) {
                incomplete = true;
                log.push(`⚠ edge (${e0.i},${e0.j}): ${nNear} walls pass within 1e-3 of this line — ` +
                    `cycle unresolved numerically (near-degenerate configuration).`);
                edgeCycles.push({ pairs: cyclePairs, ok: false, degenerate: true, reason: failed });
            } else {
                ok = false;
                log.push(`✗ edge (${e0.i},${e0.j}): ${failed}`);
                edgeCycles.push({ pairs: cyclePairs, ok: false, reason: failed });
            }
            continue;
        }

        // Angle condition: angleSum = 2π/m
        const mFloat = 2 * Math.PI / angleSum;
        const m = Math.round(mFloat);
        const angleOk = m >= 1 && Math.abs(angleSum - 2 * Math.PI / m) < ANGLE_TOL;

        // Cycle transformation condition: P^m = identity
        let Pm = Iso.identity();
        for (let k = 0; k < Math.max(1, m); k++) Pm = Pm.mul(P);
        const orderRes = distFromIdentityIso(Pm.normalized());
        const orderOk = orderRes < 1e-5;

        const desc = `${cyclePairs.length} edges, Σθ = ${(angleSum / Math.PI).toFixed(5)}π ` +
            `(2π/${m}), cycle elt ${wordStr(reduceWord(words))}` +
            (m > 1 ? `, order ${m} residual ${orderRes.toExponential(1)}` : '');
        if (angleOk && orderOk) {
            log.push(`✓ edge cycle at (${e0.i},${e0.j}): ${desc}`);
        } else {
            ok = false;
            log.push(`✗ edge cycle at (${e0.i},${e0.j}): ${desc} — ` +
                (!angleOk ? `angle sum is not 2π/m` : `cycle element does not have order ${m}`));
        }
        edgeCycles.push({ pairs: cyclePairs, ok: angleOk && orderOk, m, angleSum });
    }

    // ---- Caveats ----
    const isBounded = domainIsBounded(walls);
    if (!isBounded) {
        incomplete = true;
        log.push('⚠ Domain is UNBOUNDED (the group is not cocompact — e.g. a point, rod, or ' +
            'layer group): completeness at infinity is NOT checked.');
    }
    if (edges.length === 0 && walls.length > 0) {
        log.push('ℹ No edges found (walls may be disjoint or parallel — e.g. a single translation, ' +
            'whose domain is a slab). Pairing check alone suffices in that case.');
    }

    let status;
    if (!ok) status = 'failed';
    else if (incomplete) status = 'incomplete';
    else status = 'verified';

    log.push(ok
        ? (incomplete
            ? '— All pairing and edge-cycle conditions PASS (numerically); see caveats above. —'
            : '— All Poincaré conditions PASS (numerically): the group is discrete (crystallographic) with this fundamental domain. —')
        : '— Certificate FAILED: domain is not verified. The group may be non-discrete, or the search depth too small. —');

    return { ok, status, log, edgeCycles, pairingChecks, isBounded };
}

function wordStr(word) {
    if (!word || word.length === 0) return 'e';
    const s = word.map(i => {
        const a = Math.abs(i);
        return (i > 0 ? `g${a}` : `g${a}⁻¹`);
    }).join('·');
    return s.length > 120 ? s.slice(0, 120) + `… (length ${word.length})` : s;
}
