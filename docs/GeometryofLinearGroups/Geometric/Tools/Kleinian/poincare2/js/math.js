import * as THREE from 'three';

export class Complex {
    constructor(re, im = 0) { this.re = re; this.im = im; }
    add(c) { return new Complex(this.re + c.re, this.im + c.im); }
    sub(c) { return new Complex(this.re - c.re, this.im - c.im); }
    mul(c) {
        if (typeof c === 'number') return new Complex(this.re * c, this.im * c);
        return new Complex(this.re * c.re - this.im * c.im, this.re * c.im + this.im * c.re);
    }
    div(c) {
        if (typeof c === 'number') return new Complex(this.re / c, this.im / c);
        const den = c.re * c.re + c.im * c.im;
        return new Complex((this.re * c.re + this.im * c.im) / den, (this.im * c.re - this.re * c.im) / den);
    }
    conj() { return new Complex(this.re, -this.im); }
    normSq() { return this.re * this.re + this.im * this.im; }
    static from(z) {
        if (z instanceof Complex) return z;
        if (typeof z === 'number') return new Complex(z);
        return new Complex(z.re || 0, z.im || 0);
    }
}

export class Matrix2x2 {
    constructor(a, b, c, d) {
        this.a = Complex.from(a);
        this.b = Complex.from(b);
        this.c = Complex.from(c);
        this.d = Complex.from(d);
    }
    mul(m) {
        return new Matrix2x2(
            this.a.mul(m.a).add(this.b.mul(m.c)), this.a.mul(m.b).add(this.b.mul(m.d)),
            this.c.mul(m.a).add(this.d.mul(m.c)), this.c.mul(m.b).add(this.d.mul(m.d))
        );
    }
    inv() {
        const det = this.a.mul(this.d).sub(this.b.mul(this.c));
        return new Matrix2x2(
            this.d.div(det), this.b.mul(-1).div(det),
            this.c.mul(-1).div(det), this.a.div(det)
        );
    }
    log() {
        let tr = this.a.add(this.d);
        // tr = 2*cosh(phi)
        // For SL2C, log is defined except at -I

        // Characteristic equation: lambda^2 - tr*lambda + 1 = 0
        // lambda = (tr +/- sqrt(tr^2 - 4)) / 2
        const tr2minus4 = tr.mul(tr).sub(new Complex(4));
        const sqrtTr2minus4 = Complex.sqrt(tr2minus4);
        const l1 = tr.add(sqrtTr2minus4).div(2);

        const phi = Complex.log(l1); // phi = log(eigenvalue)
        const norm = phi.normSq();

        // Parabolic case: eigenvalue ≈ 1, so phi ≈ 0
        // For parabolic M = I + N where N is nilpotent, log(M) = N = M - I
        if (norm < 1e-10) {
            return new Matrix2x2(
                this.a.sub(new Complex(1)), this.b,
                this.c, this.d.sub(new Complex(1))
            );
        }

        // General case: use (M - (tr/2)*I) * (phi / sinh(phi))
        const k2 = tr.div(2);
        const diff = new Matrix2x2(this.a.sub(k2), this.b, this.c, this.d.sub(k2));

        // sinh(phi) = (l1 - 1/l1)/2
        const sphi = l1.sub(new Complex(1).div(l1)).div(2);
        const factor = phi.div(sphi);

        return new Matrix2x2(
            diff.a.mul(factor), diff.b.mul(factor),
            diff.c.mul(factor), diff.d.mul(factor)
        );
    }
    static exp(X) {
        // X has trace 0. det(X) = -a^2 - bc.
        // lambda^2 = -det(X) = a^2 + bc.
        const detX = X.a.mul(X.a).add(X.b.mul(X.c)); // Trace 0 => d = -a, so -ad = a^2. -det = -ad-bc = a^2+bc
        const phi = Complex.sqrt(detX);
        const norm = phi.normSq();

        let s, c;
        if (norm < 1e-10) {
            s = new Complex(1);
            c = new Complex(1);
        } else {
            // exp(X) = cosh(phi)*I + (sinh(phi)/phi)*X
            // cosh(phi) = (exp(phi) + exp(-phi))/2
            const ep = Complex.exp(phi);
            const em = new Complex(1).div(ep);
            c = ep.add(em).div(2);
            s = ep.sub(em).div(2).div(phi);
        }

        return new Matrix2x2(
            c.add(X.a.mul(s)), X.b.mul(s),
            X.c.mul(s), c.add(X.d.mul(s))
        );
    }
}

// Extend Complex with sqrt, log, exp
Complex.sqrt = function (c) {
    const r = Math.sqrt(Math.sqrt(c.re * c.re + c.im * c.im));
    const theta = Math.atan2(c.im, c.re) / 2;
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
};
Complex.log = function (c) {
    const r = Math.sqrt(c.re * c.re + c.im * c.im);
    const theta = Math.atan2(c.im, c.re);
    return new Complex(Math.log(r), theta);
};
Complex.exp = function (c) {
    const r = Math.exp(c.re);
    return new Complex(r * Math.cos(c.im), r * Math.sin(c.im));
};

// Image of origin (0,0,1) in Upper Half Space
export function imageOfOriginUHS(m) {
    const denom = m.c.normSq() + m.d.normSq();
    const u = m.a.mul(m.c.conj()).add(m.b.mul(m.d.conj()));
    return { x: u.re / denom, y: u.im / denom, t: 1.0 / denom };
}

// Map UHS (x, y, t) to Poincare Ball (X, Y, Z)
export function uhsToBall(p) {
    const normSq = p.x * p.x + p.y * p.y;
    const denom = normSq + (p.t + 1) * (p.t + 1);
    return new THREE.Vector3(
        (2 * p.x) / denom,
        (2 * p.y) / denom,
        (normSq + p.t * p.t - 1) / denom
    );
}

// Poincare Ball (X, Y, Z) to Minkowski (x0, x1, x2, x3)
export function poincareToMinkowski(p) {
    const p2 = p.x * p.x + p.y * p.y + p.z * p.z;
    const factor = 1 / (1 - p2);
    return {
        x0: (1 + p2) * factor,
        x1: 2 * p.x * factor,
        x2: 2 * p.y * factor,
        x3: 2 * p.z * factor
    };
}

export function getBisectorSphere(p1, p2) {
    const v1 = poincareToMinkowski(p1);
    const v2 = poincareToMinkowski(p2);

    // Minkowski normal to the bisecting plane: n = v1 - v2
    const n0 = v1.x0 - v2.x0;
    const n = new THREE.Vector3(v1.x1 - v2.x1, v1.x2 - v2.x2, v1.x3 - v2.x3);

    // Plane in ball model: n0(1 + |p|^2) - 2 * n . p = 0
    // If n0 != 0: |p|^2 - 2 (n/n0) . p + 1 = 0
    // This is a sphere with center C = n/n0 and radius R = sqrt(|C|^2 - 1)

    // Smoothly handle the plane case (n0 approach 0)
    let safeN0 = n0;
    if (Math.abs(safeN0) < 1e-10) safeN0 = 1e-10;

    const center = n.clone().divideScalar(safeN0);
    const radSq = center.lengthSq() - 1;
    const radius = Math.sqrt(Math.max(0, radSq));

    // The side containing p1 is where n . v < 0 (if n = v1-v2)
    // Store orientation in radius sign (w)
    const sign = safeN0 > 0 ? 1 : -1;
    return new THREE.Vector4(center.x, center.y, center.z, sign * radius);
}

// --- Group Setup (Jorgensen Group n) ---
// Kept for backward compatibility
export function getJorgensenGenerators(n) {
    const psi = (1 + Math.sqrt(17 - 8 * Math.cos(Math.PI / n))) / 2;
    const theta = Math.PI / (2 * n);
    const lambda = new Complex(Math.cos(theta), Math.sin(theta));
    const lambdaInv = lambda.conj();
    const rho = (Math.sqrt(psi + 2) + Math.sqrt(psi - 2)) / 2;
    const denomX = 2 * Math.sqrt(psi - 2);
    const x = new Complex(Math.sqrt(3 - psi) / denomX, Math.sqrt(psi + 1) / denomX);

    const T = new Matrix2x2(rho, 0, 0, 1 / rho);
    const xSq = x.mul(x);
    const onePlusXSq = new Complex(1 + xSq.re, xSq.im);
    const X = new Matrix2x2(
        lambda.mul(x).mul(-1),
        onePlusXSq.mul(-1),
        1,
        lambdaInv.mul(x)
    );

    const Y = T.mul(X.inv()).mul(T.inv()).mul(X);

    return [T, T.inv(), X, X.inv(), Y, Y.inv()];
}

// Alias for backward compatibility
export const getGenerators = getJorgensenGenerators;

/**
 * Create a normalized key for a matrix in PSL(2,C) for exploration.
 */
function exploreMatrixKey(m) {
    const a = m.a, b = m.b, c = m.c, d = m.d;
    let signFlip = false;
    const entries = [a, b, c, d];
    for (const e of entries) {
        const norm = e.re * e.re + e.im * e.im;
        if (norm > 1e-12) {
            if (e.re < -1e-9 || (Math.abs(e.re) < 1e-9 && e.im < -1e-9)) {
                signFlip = true;
            }
            break;
        }
    }
    const s = signFlip ? -1 : 1;
    const fmt = (z) => `${(s * z.re).toFixed(5)},${(s * z.im).toFixed(5)}`;
    return `[${fmt(a)}|${fmt(b)}|${fmt(c)}|${fmt(d)}]`;
}

// --- Dirichlet domain utilities ---

/**
 * Monotone proxy for hyperbolic distance in the Poincaré ball model.
 * cosh(d(p,q)) = 1 + 2|p-q|^2 / ((1-|p|^2)(1-|q|^2))
 * We return the ratio, which is monotone in d and avoids acosh.
 */
function hypDistProxy(p, q) {
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const pNormSq = p.x * p.x + p.y * p.y + p.z * p.z;
    const qNormSq = q.x * q.x + q.y * q.y + q.z * q.z;
    const denom = (1 - pNormSq) * (1 - qNormSq);
    if (denom <= 0) return Infinity;
    return distSq / denom;
}

/**
 * Signed distance from a point to a face (bisector sphere) in the ball model.
 * Matches the shader's sdFace function.
 */
export function sdFace(p, face) {
    const cx = face.x, cy = face.y, cz = face.z;
    const r = face.w;
    const s = r > 0 ? 1 : -1;
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    return s * (Math.sqrt(dx * dx + dy * dy + dz * dz) - Math.abs(r));
}

/**
 * Check if a point is inside the current domain (unit ball ∩ all accepted half-spaces).
 */
function isInsideDomain(px, py, pz, acceptedFaces, numFaces) {
    if (px * px + py * py + pz * pz >= 1.0) return false;
    for (let i = 0; i < numFaces; i++) {
        const f = acceptedFaces[i];
        const dx = px - f.x, dy = py - f.y, dz = pz - f.z;
        const r = f.w;
        const s = r > 0 ? 1 : -1;
        if (s * (Math.sqrt(dx * dx + dy * dy + dz * dz) - Math.abs(r)) > 1e-6) return false;
    }
    return true;
}

/**
 * Check if a bisector sphere is redundant (doesn't intersect the current domain).
 * Tests the closest point to basepoint on the sphere, plus a ring of 8 samples.
 * Used during incremental beam search for fast early filtering.
 */
function isFaceRedundant(bisector, acceptedFaces, numFaces, basepoint) {
    if (numFaces === 0) return false;

    const cx = bisector.x, cy = bisector.y, cz = bisector.z;
    const R = Math.abs(bisector.w);
    if (R < 1e-12) return true;

    // Direction from sphere center toward basepoint
    let dx = basepoint.x - cx, dy = basepoint.y - cy, dz = basepoint.z - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-12) return true;
    dx /= dist; dy /= dist; dz /= dist;

    // Primary sample: closest point on sphere to basepoint
    const px = cx + R * dx, py = cy + R * dy, pz = cz + R * dz;
    if (isInsideDomain(px, py, pz, acceptedFaces, numFaces)) return false;

    // Build tangent frame at the primary point for ring samples
    // Choose an "up" vector not parallel to dir
    let ux, uy, uz;
    if (Math.abs(dx) < 0.9) {
        // Cross dir with (1,0,0)
        ux = 0; uy = dz; uz = -dy;
    } else {
        // Cross dir with (0,1,0)
        ux = -dz; uy = 0; uz = dx;
    }
    let len = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= len; uy /= len; uz /= len;
    // Second tangent: dir × u
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;

    // Ring at ~30° from primary direction
    const cosA = Math.cos(Math.PI / 6);  // cos(30°)
    const sinA = Math.sin(Math.PI / 6);  // sin(30°)

    for (let k = 0; k < 8; k++) {
        const theta = k * Math.PI * 0.25;
        const ct = Math.cos(theta), st = Math.sin(theta);
        // Direction on sphere: cosA * dir + sinA * (cos(theta)*u + sin(theta)*v)
        const rx = cosA * dx + sinA * (ct * ux + st * vx);
        const ry = cosA * dy + sinA * (ct * uy + st * vy);
        const rz = cosA * dz + sinA * (ct * uz + st * vz);
        const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const sx = cx + R * rx / rl, sy = cy + R * ry / rl, sz = cz + R * rz / rl;
        if (isInsideDomain(sx, sy, sz, acceptedFaces, numFaces)) return false;
    }

    return true;
}

/**
 * Dense redundancy check for post-processing pruning.
 * Uses many more sample points across the bisector sphere (multiple rings at
 * different latitudes) to reliably determine whether ANY part of the bisector
 * sphere touches the domain boundary.
 *
 * @param {number} faceIdx - Index of the face to test within otherFaces
 * @param {THREE.Vector4[]} allFaces - All currently accepted faces
 * @param {number} numFaces - Number of valid faces in allFaces
 * @param {number} faceIdx - Index of the face we're testing for redundancy
 * @param {THREE.Vector3} basepoint - The basepoint of the domain
 * @returns {boolean} true if the face is redundant (does not contribute to domain boundary)
 */
function isFaceRedundantDense(allFaces, numFaces, faceIdx, basepoint) {
    if (numFaces <= 1) return false;

    const bisector = allFaces[faceIdx];
    const cx = bisector.x, cy = bisector.y, cz = bisector.z;
    const R = Math.abs(bisector.w);
    if (R < 1e-12) return true;

    // Direction from sphere center toward basepoint
    let dx = basepoint.x - cx, dy = basepoint.y - cy, dz = basepoint.z - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-12) return true;
    dx /= dist; dy /= dist; dz /= dist;

    // Build tangent frame
    let ux, uy, uz;
    if (Math.abs(dx) < 0.9) {
        ux = 0; uy = dz; uz = -dy;
    } else {
        ux = -dz; uy = 0; uz = dx;
    }
    let len = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= len; uy /= len; uz /= len;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;

    // Build the "other faces" array excluding faceIdx
    const otherFaces = [];
    for (let i = 0; i < numFaces; i++) {
        if (i !== faceIdx) otherFaces.push(allFaces[i]);
    }
    const otherCount = otherFaces.length;

    // Check point against all faces EXCEPT faceIdx
    function isInsideOtherFaces(px, py, pz) {
        if (px * px + py * py + pz * pz >= 1.0) return false;
        for (let i = 0; i < otherCount; i++) {
            const f = otherFaces[i];
            const fdx = px - f.x, fdy = py - f.y, fdz = pz - f.z;
            const r = f.w;
            const s = r > 0 ? 1 : -1;
            if (s * (Math.sqrt(fdx * fdx + fdy * fdy + fdz * fdz) - Math.abs(r)) > 1e-6) return false;
        }
        return true;
    }

    // Test point on sphere given direction (rx, ry, rz)
    function testDir(rx, ry, rz) {
        const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rl < 1e-12) return false;
        const sx = cx + R * rx / rl, sy = cy + R * ry / rl, sz = cz + R * rz / rl;
        return isInsideOtherFaces(sx, sy, sz);
    }

    // Primary: closest point on sphere to basepoint (pole of the cap)
    if (testDir(dx, dy, dz)) return false;

    // Multiple rings at different latitudes from the pole
    // Angles from pole: 10°, 25°, 40°, 55°, 70°, 85°
    const latitudes = [10, 25, 40, 55, 70, 85];
    const samplesPerRing = 12;

    for (const latDeg of latitudes) {
        const lat = latDeg * Math.PI / 180;
        const cosL = Math.cos(lat);
        const sinL = Math.sin(lat);

        for (let k = 0; k < samplesPerRing; k++) {
            const theta = (k + (latDeg % 20 === 0 ? 0 : 0.5)) * (2 * Math.PI / samplesPerRing);
            const ct = Math.cos(theta), st = Math.sin(theta);
            const rx = cosL * dx + sinL * (ct * ux + st * vx);
            const ry = cosL * dy + sinL * (ct * uy + st * vy);
            const rz = cosL * dz + sinL * (ct * uz + st * vz);
            if (testDir(rx, ry, rz)) return false;
        }
    }

    return true;
}

/**
 * Post-processing pass: prune faces that are redundant given ALL other faces.
 * This catches faces that were non-redundant when first added during incremental
 * beam search, but became redundant as later faces were added.
 *
 * Also removes the corresponding pairings entries.
 * Iterates until stable (no more faces can be removed).
 */
function pruneRedundantFaces(acceptedFaces, pairings, basepoint) {
    let changed = true;
    while (changed) {
        changed = false;
        const numFaces = acceptedFaces.length;

        // Check in reverse order so that removing doesn't shift earlier indices
        for (let i = numFaces - 1; i >= 0; i--) {
            if (isFaceRedundantDense(acceptedFaces, acceptedFaces.length, i, basepoint)) {
                acceptedFaces.splice(i, 1);
                pairings.splice(i, 1);
                changed = true;
            }
        }
    }

    // Re-index faceIndex in pairings after pruning
    for (let i = 0; i < pairings.length; i++) {
        pairings[i].faceIndex = i;
    }
}

// Pre-allocated buffer to avoid GC pressure during animation
const _paddedBuffer = new Array(256);
for (let i = 0; i < 256; i++) _paddedBuffer[i] = new THREE.Vector4(10, 0, 0, 0.1);

/**
 * Compute the Dirichlet domain using beam search with redundancy detection.
 * Returns both faces (for shader) and face-pairing elements (for UI).
 *
 * @param {Matrix2x2[]} generators - [g1, g1^-1, g2, g2^-1, ...]
 * @param {Matrix2x2} viewMat - Current view isometry
 * @param {number} maxFaces - Hard cap on accepted faces
 * @param {Object} [options] - { maxDepth: 25, beamWidth: 1024, barrenLimit: 3 }
 * @returns {{ faces: THREE.Vector4[], count: number, pairings: Array, stabilizers: Array }}
 */
export function computeDirichletDomain(generators = [], viewMat = new Matrix2x2(1, 0, 0, 1), maxFaces = 64, options = {}) {
    const { maxDepth = 25, beamWidth = 1024, barrenLimit = 3 } = options;

    if (!generators || generators.length === 0) {
        for (let i = 0; i < 256; i++) _paddedBuffer[i].set(10, 0, 0, 0.1);
        return { faces: _paddedBuffer, count: 0, pairings: [], stabilizers: [] };
    }

    const numGens = generators.length;
    const basepoint = uhsToBall(imageOfOriginUHS(viewMat));

    const seenMatrices = new Set();
    seenMatrices.add(exploreMatrixKey(viewMat));

    const acceptedFaces = [];
    const pairings = [];
    const stabilizers = [];

    // Beam: starts with identity (viewMat)
    let beam = [{ matrix: viewMat, wordArr: [], lastGenIdx: -1 }];
    let depthsWithoutNewFace = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
        // 1. EXPAND: multiply every beam element by every generator
        const candidates = [];

        for (const entry of beam) {
            for (let i = 0; i < numGens; i++) {
                // Generators are interleaved: [g1, g1^-1, g2, g2^-1, ...]
                // The inverse of index i is i^1 (XOR): 0↔1, 2↔3, etc.
                if (entry.lastGenIdx >= 0 && i === (entry.lastGenIdx ^ 1)) continue;

                const next = entry.matrix.mul(generators[i]);
                const matKey = exploreMatrixKey(next);
                if (seenMatrices.has(matKey)) continue;
                seenMatrices.add(matKey);

                const orbitPt = uhsToBall(imageOfOriginUHS(next));
                const dist = hypDistProxy(basepoint, orbitPt);

                // Word index: generators [g1, g1^-1, g2, g2^-1, ...]
                // Even indices are generators (positive), odd are inverses (negative)
                const base = (i >> 1) + 1;  // 1-based generator number
                const genIdx = (i & 1) === 0 ? base : -base;

                candidates.push({
                    matrix: next,
                    wordArr: [...entry.wordArr, genIdx],
                    lastGenIdx: i,
                    orbitPt,
                    dist
                });
            }
        }

        if (candidates.length === 0) break;

        // 2. SORT by hyperbolic distance proxy
        candidates.sort((a, b) => a.dist - b.dist);

        // 3. PRUNE to beam width
        beam = candidates.slice(0, beamWidth);

        // 4. CHECK each beam element for face contribution
        let newFacesThisDepth = 0;

        for (const entry of beam) {
            if (acceptedFaces.length >= maxFaces) break;

            const orbitPt = entry.orbitPt;
            const dx = orbitPt.x - basepoint.x;
            const dy = orbitPt.y - basepoint.y;
            const dz = orbitPt.z - basepoint.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            // Stabilizer check
            if (distSq < 1e-8) {
                stabilizers.push({
                    matrix: entry.matrix,
                    wordArr: entry.wordArr,
                    isStabilizer: true,
                    face: null
                });
                continue;
            }

            const bisector = getBisectorSphere(basepoint, orbitPt);

            if (!isFaceRedundant(bisector, acceptedFaces, acceptedFaces.length, basepoint)) {
                const faceIndex = acceptedFaces.length;
                acceptedFaces.push(bisector);
                pairings.push({
                    matrix: entry.matrix,
                    wordArr: entry.wordArr,
                    face: bisector,
                    faceIndex,
                    isParabolic: orbitPt.lengthSq() > 0.9025,
                    isStabilizer: false
                });
                newFacesThisDepth++;
            }
        }

        // 5. EARLY TERMINATION
        if (newFacesThisDepth === 0) {
            depthsWithoutNewFace++;
            if (depthsWithoutNewFace >= barrenLimit) break;
        } else {
            depthsWithoutNewFace = 0;
        }

        if (acceptedFaces.length >= maxFaces) break;
    }

    // 6. POST-PROCESSING: prune faces that became redundant after later faces were added
    pruneRedundantFaces(acceptedFaces, pairings, basepoint);

    // Package results into the 256-entry buffer
    const count = acceptedFaces.length;
    for (let i = 0; i < 256; i++) {
        if (i < count) {
            _paddedBuffer[i].copy(acceptedFaces[i]);
        } else {
            _paddedBuffer[i].set(10, 0, 0, 0.1);
        }
    }

    return { faces: _paddedBuffer, count, pairings, stabilizers };
}


/**
 * Format a word array as MathJax: [1, -2, 1] -> "g_1 g_2^{-1} g_1"
 */
export function formatWordMathJax(wordArr) {
    if (!wordArr || wordArr.length === 0) return 'e';  // Identity
    return wordArr.map(idx => {
        const absIdx = Math.abs(idx);
        return idx > 0 ? `g_{${absIdx}}` : `g_{${absIdx}}^{-1}`;
    }).join(' ');
}

/**
 * Reduce a word by cancelling adjacent inverse pairs.
 * [1, -1, 2] -> [2], [1, 2, -2, 3] -> [1, 3]
 */
export function reduceWord(wordArr) {
    const result = [];
    for (const idx of wordArr) {
        if (result.length > 0 && result[result.length - 1] === -idx) {
            result.pop();  // Cancel inverse pair
        } else {
            result.push(idx);
        }
    }
    return result;
}


/**
 * Create a normalized key for a matrix in PSL(2,C).
 * Two matrices M1 and M2 represent the same PSL(2,C) element iff M1 = ±M2.
 * We normalize by making the first non-zero entry have positive real part.
 */
function matrixKey(m) {
    // Get the entries as Complex objects
    const a = m.a, b = m.b, c = m.c, d = m.d;

    // Find the first non-zero entry to determine sign normalization
    let signFlip = false;
    const entries = [a, b, c, d];
    for (const e of entries) {
        const norm = e.re * e.re + e.im * e.im;
        if (norm > 1e-12) {
            // Flip if real part is negative, or real part is ~0 and imaginary is negative
            if (e.re < -1e-9 || (Math.abs(e.re) < 1e-9 && e.im < -1e-9)) {
                signFlip = true;
            }
            break;
        }
    }

    const s = signFlip ? -1 : 1;

    // Format each entry with sign applied
    const fmt = (z) => `${(s * z.re).toFixed(5)},${(s * z.im).toFixed(5)}`;

    return `[${fmt(a)}|${fmt(b)}|${fmt(c)}|${fmt(d)}]`;
}

/**
 * Compute Cayley graph for the given generators.
 * Uses matrix-based keys to properly handle generators that fix the basepoint.
 * @param {Matrix2x2[]} generators - Array of generators (including inverses)
 * @param {number} maxDepth - Maximum word length
 * @param {Matrix2x2} viewMat - Current view matrix
 * @param {number} maxNodes - Hard cap on number of vertices to prevent combinatorial explosion
 */
export function getCayleyGraph(generators = [], maxDepth = 4, viewMat = new Matrix2x2(1, 0, 0, 1), maxNodes = 4000) {
    // If no generators provided, return empty
    if (!generators || generators.length === 0) {
        return { points: [], edges: [] };
    }

    const queue = [{ matrix: viewMat, depth: 0, index: 0 }];
    const matrices = [viewMat]; // Store matrices for edge drawing
    const edges = [];

    const seenMatrices = new Map(); // Map from matrix key to index
    const seenEdges = new Set();
    seenMatrices.set(matrixKey(viewMat), 0);

    let head = 0;
    while (head < queue.length) {
        const { matrix, depth, index: uIdx } = queue[head++];
        if (depth >= maxDepth) continue;

        for (let genIdx = 0; genIdx < generators.length; genIdx++) {
            const g = generators[genIdx];
            const nextMat = matrix.mul(g);
            const k = matrixKey(nextMat);

            let vIdx;
            if (seenMatrices.has(k)) {
                vIdx = seenMatrices.get(k);
            } else {
                // Stop adding new nodes once we hit the cap
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
                    // Edge type based on which generator pair (0, 1, 2, ...)
                    edges.push({ u: uIdx, v: vIdx, type: Math.floor(genIdx / 2) });
                }
            }
        }
    }

    // Convert matrices to points for visualization
    const points = matrices.map(m => uhsToBall(imageOfOriginUHS(m)));

    return { points, edges };
}

