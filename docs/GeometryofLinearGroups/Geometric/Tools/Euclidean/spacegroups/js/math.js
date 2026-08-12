/**
 * Core algebra + Euclidean geometry primitives for the space-groups tool.
 *
 * Group elements are isometries of R^3 in Seitz form {R | t}: x -> Rx + t,
 * with R orthogonal (det = ±1). Walls (perpendicular-bisector planes) are
 * stored as covectors W = (n1, n2, n3, d) with |n| = 1, meaning the plane
 * n·x = d, oriented so the DOMAIN side is F(p) = n·p - d < 0.
 *
 * Everything happens inside a bounding sphere of radius RBOUND: unbounded
 * Dirichlet domains (non-cocompact groups) are clipped there for display.
 */
import * as THREE from 'three';

export const RBOUND = 3.0;

// ---------------- 3x3 matrix helpers (row-major arrays of 9) ----------------

export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mat3Mul(a, b) {
    const c = new Array(9);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            c[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
        }
    }
    return c;
}

export function mat3T(a) {
    return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

export function mat3Det(a) {
    return a[0] * (a[4] * a[8] - a[5] * a[7])
        - a[1] * (a[3] * a[8] - a[5] * a[6])
        + a[2] * (a[3] * a[7] - a[4] * a[6]);
}

export function mat3Inv(a) {
    const det = mat3Det(a);
    if (Math.abs(det) < 1e-14) return null;
    const inv = 1 / det;
    return [
        (a[4] * a[8] - a[5] * a[7]) * inv, (a[2] * a[7] - a[1] * a[8]) * inv, (a[1] * a[5] - a[2] * a[4]) * inv,
        (a[5] * a[6] - a[3] * a[8]) * inv, (a[0] * a[8] - a[2] * a[6]) * inv, (a[2] * a[3] - a[0] * a[5]) * inv,
        (a[3] * a[7] - a[4] * a[6]) * inv, (a[1] * a[6] - a[0] * a[7]) * inv, (a[0] * a[4] - a[1] * a[3]) * inv
    ];
}

export function mat3Apply(a, v) {
    return new THREE.Vector3(
        a[0] * v.x + a[1] * v.y + a[2] * v.z,
        a[3] * v.x + a[4] * v.y + a[5] * v.z,
        a[6] * v.x + a[7] * v.y + a[8] * v.z
    );
}

/** Rotation matrix about unit axis u by angle th (Rodrigues). */
export function rotAbout(u, th) {
    const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
    const x = u.x, y = u.y, z = u.z;
    return [
        c + x * x * C, x * y * C - z * s, x * z * C + y * s,
        y * x * C + z * s, c + y * y * C, y * z * C - x * s,
        z * x * C - y * s, z * y * C + x * s, c + z * z * C
    ];
}

/** Re-orthonormalize a near-orthogonal matrix (Gram–Schmidt on rows). */
export function orthonormalize(a) {
    let r0 = new THREE.Vector3(a[0], a[1], a[2]);
    let r1 = new THREE.Vector3(a[3], a[4], a[5]);
    let r2 = new THREE.Vector3(a[6], a[7], a[8]);
    r0.normalize();
    r1.addScaledVector(r0, -r1.dot(r0)).normalize();
    r2.addScaledVector(r0, -r2.dot(r0)).addScaledVector(r1, -r2.dot(r1)).normalize();
    return [r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, r2.x, r2.y, r2.z];
}

// ---------------- Euclidean isometries {R | t} ----------------

export class Iso {
    /** R: array of 9 (row-major), t: THREE.Vector3 (or {x,y,z}). */
    constructor(R, t) {
        this.R = R;
        this.t = new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0);
    }
    mul(o) {
        return new Iso(mat3Mul(this.R, o.R), mat3Apply(this.R, o.t).add(this.t));
    }
    inv() {
        const Rt = mat3T(this.R);
        return new Iso(Rt, mat3Apply(Rt, this.t).negate());
    }
    apply(p) {
        return mat3Apply(this.R, p).add(this.t);
    }
    det() { return mat3Det(this.R); }
    /** Kill accumulated float drift in the orthogonal part. */
    normalized() {
        return new Iso(orthonormalize(this.R), this.t.clone());
    }
    static identity() { return new Iso(I3.slice(), new THREE.Vector3()); }
    static translation(v) { return new Iso(I3.slice(), new THREE.Vector3(v.x, v.y, v.z)); }
}

/** Frobenius-style distance of an isometry from the identity. */
export function distFromIdentityIso(m) {
    let s = 0;
    for (let i = 0; i < 9; i++) {
        const d = m.R[i] - I3[i];
        s += d * d;
    }
    s += m.t.lengthSq();
    return Math.sqrt(s);
}

/** Dedup key for an isometry (12 rounded numbers). */
export function isoKey(m, digits = 5) {
    const clamp = (v) => Math.abs(v) < 1e-9 ? 0 : v;
    const parts = [];
    for (let i = 0; i < 9; i++) parts.push(clamp(m.R[i]).toFixed(digits));
    parts.push(clamp(m.t.x).toFixed(digits), clamp(m.t.y).toFixed(digits), clamp(m.t.z).toFixed(digits));
    return parts.join(',');
}

/** Image of the origin under m. */
export function imageOfOrigin(m) {
    return m.t.clone();
}

/** Action of m on a point (alias, mirrors poincare2's applyMatrixToBall). */
export function applyIso(m, p) {
    return m.apply(p);
}

/** Euclidean distance and its monotone proxy (squared distance). */
export function eucDist(p, q) {
    return p.distanceTo(q);
}
export function eucDistProxy(p, q) {
    return p.distanceToSquared(q);
}

// ---------------- Isometry classification ----------------

/**
 * Classify a Euclidean isometry into its crystallographic type.
 * Returns { type, angle?, axis?, order? } with type one of:
 * 'identity' | 'translation' | 'rotation' | 'screw' |
 * 'reflection' | 'glide' | 'rotoreflection' | 'inversion'
 */
export function classifyIso(m, tol = 1e-6) {
    const R = m.R, t = m.t;
    const det = mat3Det(R);
    const tr = R[0] + R[4] + R[8];

    const orderOf = (th) => {
        for (let k = 2; k <= 12; k++) {
            if (Math.abs(th - 2 * Math.PI / k) < 1e-4) return k;
        }
        return null;
    };

    if (det > 0) {
        const cos = Math.max(-1, Math.min(1, (tr - 1) / 2));
        const th = Math.acos(cos);
        if (th < tol) {
            return t.length() < tol
                ? { type: 'identity' }
                : { type: 'translation', vector: t.clone() };
        }
        const u = properAxis(R, th);
        const pitch = t.dot(u);
        const base = { angle: th, axis: u, order: orderOf(th) };
        return Math.abs(pitch) < tol
            ? { type: 'rotation', ...base }
            : { type: 'screw', ...base, pitch };
    }

    // det = -1: R = rot(u, th) ∘ (reflection through plane ⊥ u), tr = 2cos(th) - 1
    const cos = Math.max(-1, Math.min(1, (tr + 1) / 2));
    const th = Math.acos(cos);
    const u = improperAxis(R);
    if (th < tol) {
        const glideVec = t.clone().addScaledVector(u, -t.dot(u));
        return glideVec.length() < tol
            ? { type: 'reflection', axis: u }
            : { type: 'glide', axis: u, vector: glideVec };
    }
    if (Math.abs(th - Math.PI) < tol) {
        return { type: 'inversion' };
    }
    return { type: 'rotoreflection', angle: th, axis: u, order: orderOf(th) };
}

/** Rotation axis of a proper rotation R (angle th > 0). */
export function properAxis(R, th) {
    if (Math.abs(th - Math.PI) > 1e-4) {
        // Antisymmetric part
        const u = new THREE.Vector3(R[7] - R[5], R[2] - R[6], R[3] - R[1]);
        if (u.lengthSq() > 1e-16) return u.normalize();
    }
    // th ≈ π: axis from the dominant column of R + I
    let best = new THREE.Vector3(), bestL = -1;
    for (let j = 0; j < 3; j++) {
        const v = new THREE.Vector3(R[j] + (j === 0 ? 1 : 0), R[3 + j] + (j === 1 ? 1 : 0), R[6 + j] + (j === 2 ? 1 : 0));
        if (v.lengthSq() > bestL) { bestL = v.lengthSq(); best = v; }
    }
    return bestL > 1e-16 ? best.normalize() : new THREE.Vector3(0, 0, 1);
}

/** Unit eigenvector of an improper R with eigenvalue -1 (the mirror normal). */
export function improperAxis(R) {
    // Columns of (R - I)ᵀ(R + I)... simplest robust route: dominant column of I - R'
    // where R' = -R is proper: -R has +1 eigenvector = our -1 eigenvector.
    const M = [
        R[0] + 1, R[1], R[2],
        R[3], R[4] + 1, R[5],
        R[6], R[7], R[8] + 1
    ];
    // Kernel of M: cross products of row pairs
    const r0 = new THREE.Vector3(M[0], M[1], M[2]);
    const r1 = new THREE.Vector3(M[3], M[4], M[5]);
    const r2 = new THREE.Vector3(M[6], M[7], M[8]);
    const cands = [
        new THREE.Vector3().crossVectors(r0, r1),
        new THREE.Vector3().crossVectors(r0, r2),
        new THREE.Vector3().crossVectors(r1, r2)
    ];
    let best = cands[0];
    for (const c of cands) if (c.lengthSq() > best.lengthSq()) best = c;
    if (best.lengthSq() > 1e-16) return best.clone().normalize();
    // R = -I (inversion): any direction works
    return new THREE.Vector3(0, 0, 1);
}

// ---------------- Animation paths ----------------
//
// isoPath(g) returns a function s ∈ [0,1] -> affine map {B (mat3), c (Vector3)}
// with path(0) = identity and path(1) = g.
//   det g = +1 : the screw path (rigid at every s).
//   det g = -1 : the "flip through the mirror" path — rotate about the
//                rotoreflection axis while the axis-component scales 1 -> -1.
//                Not an isometry mid-way (det crosses 0), but it is the
//                natural visual for a motion that cannot be done rigidly.
// The u-scale is clamped away from 0 so the affine map stays invertible.

const FLIP_MIN = 0.04;

export function isoPath(g) {
    const det = g.det();
    if (det > 0) {
        const cls = classifyIso(g);
        if (cls.type === 'identity' || cls.type === 'translation') {
            const t = g.t.clone();
            return (s) => ({ B: I3.slice(), c: t.clone().multiplyScalar(s) });
        }
        const u = cls.axis, th = cls.angle;
        const pitch = g.t.dot(u);
        // Axis point c0 (⊥ u): solve ((I - R) + u uᵀ) c0 = t_perp
        const tPerp = g.t.clone().addScaledVector(u, -pitch);
        const M = new Array(9);
        for (let i = 0; i < 9; i++) M[i] = (i % 4 === 0 ? 1 : 0) - g.R[i];
        const uu = [u.x * u.x, u.x * u.y, u.x * u.z, u.y * u.x, u.y * u.y, u.y * u.z, u.z * u.x, u.z * u.y, u.z * u.z];
        for (let i = 0; i < 9; i++) M[i] += uu[i];
        const Minv = mat3Inv(M);
        const c0 = Minv ? mat3Apply(Minv, tPerp) : new THREE.Vector3();
        return (s) => {
            const B = rotAbout(u, th * s);
            const c = c0.clone().sub(mat3Apply(B, c0)).addScaledVector(u, pitch * s);
            return { B, c };
        };
    }

    // Improper: R = rot(u, th) ∘ (I - 2uuᵀ)
    const u = improperAxis(g.R);
    const tr = g.R[0] + g.R[4] + g.R[8];
    const th = Math.acos(Math.max(-1, Math.min(1, (tr + 1) / 2)));
    const uu = [u.x * u.x, u.x * u.y, u.x * u.z, u.y * u.x, u.y * u.y, u.y * u.z, u.z * u.x, u.z * u.y, u.z * u.z];
    const scaleAlongU = (lam) => {
        const B = I3.slice();
        for (let i = 0; i < 9; i++) B[i] += (lam - 1) * uu[i];
        return B;
    };
    const lamOf = (s) => {
        let lam = 1 - 2 * s;
        if (Math.abs(lam) < FLIP_MIN) lam = lam >= 0 ? FLIP_MIN : -FLIP_MIN;
        return s >= 1 ? -1 : (s <= 0 ? 1 : lam);
    };

    if (th > 1e-6) {
        // Rotoreflection: unique fixed point c0 = (I - R)^{-1} t
        const M = new Array(9);
        for (let i = 0; i < 9; i++) M[i] = (i % 4 === 0 ? 1 : 0) - g.R[i];
        const Minv = mat3Inv(M);
        const c0 = Minv ? mat3Apply(Minv, g.t) : new THREE.Vector3();
        return (s) => {
            const B = mat3Mul(rotAbout(u, th * s), scaleAlongU(lamOf(s)));
            const c = c0.clone().sub(mat3Apply(B, c0));
            return { B, c };
        };
    }
    // Reflection / glide: plane n·x = d with n = u, d = (t·u)/2, glide v ⊥ u
    const d = g.t.dot(u) / 2;
    const v = g.t.clone().addScaledVector(u, -g.t.dot(u));
    return (s) => {
        const lam = lamOf(s);
        const B = scaleAlongU(lam);
        const c = u.clone().multiplyScalar((1 - lam) * d).addScaledVector(v, s);
        return { B, c };
    };
}

/** Compose affine maps a∘b (apply b first). Iso instances work as {B:R, c:t}. */
export function composeAffine(a, b) {
    const aB = a.B || a.R, aC = a.c || a.t;
    const bB = b.B || b.R, bC = b.c || b.t;
    return { B: mat3Mul(aB, bB), c: mat3Apply(aB, bC).add(aC) };
}

/**
 * Transform a plane covector W = (n, d) by an invertible affine map {B, c}:
 * image plane has raw normal B^{-T} n, then renormalized. Orientation (sign
 * of F) is preserved.
 */
export function transformPlaneCov(W, aff) {
    const Binv = mat3Inv(aff.B);
    if (!Binv) return W.clone();
    const BinvT = mat3T(Binv);
    const m0 = mat3Apply(BinvT, new THREE.Vector3(W.x, W.y, W.z));
    const e0 = W.w + m0.dot(aff.c);
    const k = m0.length();
    if (k < 1e-14) return W.clone();
    return new THREE.Vector4(m0.x / k, m0.y / k, m0.z / k, e0 / k);
}

/** THREE.Matrix4 from an affine map {B, c} (for overlay group transforms). */
export function affineToMatrix4(aff) {
    const B = aff.B, c = aff.c;
    const m = new THREE.Matrix4();
    m.set(
        B[0], B[1], B[2], c.x,
        B[3], B[4], B[5], c.y,
        B[6], B[7], B[8], c.z,
        0, 0, 0, 1
    );
    return m;
}

// ---------------- Walls as plane covectors ----------------

/**
 * Perpendicular-bisector plane between p1, p2 as a covector
 * (THREE.Vector4: xyz = unit normal, w = offset), oriented so the
 * p1-side is the domain side (F < 0).
 */
export function bisectorCov(p1, p2) {
    const n = new THREE.Vector3().subVectors(p2, p1);
    const len = n.length();
    if (len < 1e-12) return null;
    n.multiplyScalar(1 / len);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    return new THREE.Vector4(n.x, n.y, n.z, n.dot(mid));
}

/** F(p) for covector W: negative on the domain side, zero on the wall. */
export function wallF(p, W) {
    return p.x * W.x + p.y * W.y + p.z * W.z - W.w;
}

/** Geometry record of a wall (all walls are planes in Euclidean space). */
export function covToGeom(W) {
    return { type: 'plane', n: new THREE.Vector3(W.x, W.y, W.z), d: W.w };
}

/** Euclidean signed distance to wall; negative on domain side. */
export function wallSD(p, geom) {
    return p.x * geom.n.x + p.y * geom.n.y + p.z * geom.n.z - geom.d;
}

/** Outward (away-from-domain) unit normal of a wall. */
export function wallOutwardNormal(p, geom) {
    return geom.n.clone();
}

/**
 * Is p in the closed domain (bounding ball ∩ all wall half-spaces)?
 * `skip` (optional) is an index to ignore.
 */
export function isInsideWalls(p, geoms, tol = 1e-6, skip = -1) {
    if (p.lengthSq() >= RBOUND * RBOUND) return false;
    for (let i = 0; i < geoms.length; i++) {
        if (i === skip) continue;
        if (wallSD(p, geoms[i]) > tol) return false;
    }
    return true;
}

/**
 * Sample points on a wall plane (inside the bounding ball), spread from the
 * projection of `basept`. Returns array of Vector3.
 */
export function sampleWallPoints(geom, basept, dense = true) {
    const out = [];
    const push = (p) => { if (p.lengthSq() < RBOUND * RBOUND * 0.999) out.push(p); };

    const n = geom.n;
    const pole = basept.clone().addScaledVector(n, geom.d - basept.dot(n));
    let u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
    u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    push(pole.clone());
    const radii = dense
        ? [0.02, 0.06, 0.13, 0.25, 0.4, 0.6, 0.85, 1.15, 1.55, 2.1, 2.8]
        : [0.05, 0.2, 0.6, 1.4, 2.4];
    const nTheta = dense ? 12 : 8;
    for (const rho of radii) {
        for (let k = 0; k < nTheta; k++) {
            const th = (k + 0.5 * (radii.indexOf(rho) % 2)) * 2 * Math.PI / nTheta;
            push(pole.clone()
                .add(u.clone().multiplyScalar(rho * Math.cos(th)))
                .add(v.clone().multiplyScalar(rho * Math.sin(th))));
        }
    }
    return out;
}

/** Project a point onto a wall plane. */
export function projectToWall(p, geom) {
    return p.clone().addScaledVector(geom.n, geom.d - p.dot(geom.n));
}

/**
 * Violation functional: max over the other walls (and the bounding sphere) of
 * the signed distance at p. Negative ⇔ p is in the interior of the face region.
 */
export function faceViolation(p, geoms, skip) {
    let m = p.length() - RBOUND;
    for (let j = 0; j < geoms.length; j++) {
        if (j === skip) continue;
        const v = wallSD(p, geoms[j]);
        if (v > m) m = v;
    }
    return m;
}

/**
 * Local pattern search ON the wall plane, minimizing the violation functional.
 * Finds interior points of sliver faces that a fixed sample grid misses.
 * Returns {p, v}.
 */
export function refineOnWall(geom, start, geoms, skip) {
    let p = projectToWall(start, geom);
    let v = faceViolation(p, geoms, skip);
    let h = 0.05;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
    const n = geom.n;
    let u = Math.abs(n.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    for (let it = 0; it < 80 && h > 1e-9; it++) {
        let improved = false;
        for (const [du, dw] of DIRS) {
            const cand = projectToWall(
                p.clone().add(u.clone().multiplyScalar(h * du)).add(w.clone().multiplyScalar(h * dw)),
                geom);
            const cv = faceViolation(cand, geoms, skip);
            if (cv < v - 1e-15) { v = cv; p = cand; improved = true; break; }
        }
        if (!improved) h *= 0.6;
        if (v < -1e-4) break;   // comfortably interior — done
    }
    return { p, v };
}

/**
 * Does the wall contribute a (codim-1) face to the domain cut out by `geoms`?
 * I.e., does some point of the wall lie STRICTLY inside all other half-spaces?
 * With `refine`, a local search is run from the best grid sample so that even
 * sliver faces (far below the grid resolution) are detected.
 */
export function wallContributes(geom, geoms, idx, basept, dense = true, tol = -1e-5, refine = false) {
    const samples = sampleWallPoints(geom, basept, dense);
    let best = null, bestV = Infinity;
    for (const p of samples) {
        const v = faceViolation(p, geoms, idx);
        if (v < tol && p.lengthSq() < RBOUND * RBOUND) return true;
        if (v < bestV) { bestV = v; best = p; }
    }
    if (refine && best) {
        const r = refineOnWall(geom, best, geoms, idx);
        if (r.v < -1e-6 && r.p.lengthSq() < RBOUND * RBOUND) return true;
    }
    return false;
}

// ---------------- Words ----------------

export function formatWordMathJax(wordArr) {
    if (!wordArr || wordArr.length === 0) return 'e';
    // Compress runs: g g g -> g^3
    const parts = [];
    let i = 0;
    while (i < wordArr.length) {
        let j = i;
        while (j < wordArr.length && wordArr[j] === wordArr[i]) j++;
        const idx = Math.abs(wordArr[i]);
        const count = j - i;
        const exp = wordArr[i] > 0 ? count : -count;
        parts.push(exp === 1 ? `g_{${idx}}` : `g_{${idx}}^{${exp}}`);
        i = j;
    }
    return parts.join(' ');
}

export function reduceWord(wordArr) {
    const result = [];
    for (const idx of wordArr) {
        if (result.length > 0 && result[result.length - 1] === -idx) result.pop();
        else result.push(idx);
    }
    return result;
}

export function invertWord(wordArr) {
    return wordArr.slice().reverse().map(i => -i);
}

// ---------------- Cayley graph ----------------

export function getCayleyGraph(generators = [], maxDepth = 4, viewIso = Iso.identity(), maxNodes = 4000) {
    if (!generators || generators.length === 0) return { points: [], edges: [] };

    const queue = [{ matrix: viewIso, depth: 0, index: 0 }];
    const matrices = [viewIso];
    const edges = [];
    const seenMatrices = new Map();
    const seenEdges = new Set();
    seenMatrices.set(isoKey(viewIso), 0);

    let head = 0;
    while (head < queue.length) {
        const { matrix, depth, index: uIdx } = queue[head++];
        if (depth >= maxDepth) continue;
        for (let genIdx = 0; genIdx < generators.length; genIdx++) {
            const nextMat = matrix.mul(generators[genIdx]);
            const k = isoKey(nextMat);
            let vIdx;
            if (seenMatrices.has(k)) {
                vIdx = seenMatrices.get(k);
            } else {
                if (matrices.length >= maxNodes) continue;
                vIdx = matrices.length;
                matrices.push(nextMat);
                seenMatrices.set(k, vIdx);
                queue.push({ matrix: nextMat, depth: depth + 1, index: vIdx });
            }
            if (uIdx !== vIdx) {
                const edgeKey = uIdx < vIdx ? `${uIdx}-${vIdx}` : `${vIdx}-${uIdx}`;
                if (!seenEdges.has(edgeKey)) {
                    seenEdges.add(edgeKey);
                    edges.push({ u: uIdx, v: vIdx, type: Math.floor(genIdx / 2) });
                }
            }
        }
    }

    const points = matrices.map(m => imageOfOrigin(m));
    return { points, edges };
}
