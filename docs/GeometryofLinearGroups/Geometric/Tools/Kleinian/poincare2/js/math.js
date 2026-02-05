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

/**
 * Compute Dirichlet domain faces for the given generators.
 * Uses matrix-based exploration to handle generators that fix the basepoint.
 * @param {Matrix2x2[]} generators - Array of generators (including inverses)
 * @param {Matrix2x2} viewMat - Current view matrix
 * @param {number} maxFaces - Maximum number of faces to return
 */
export function getDirichletFaces(generators = [], viewMat = new Matrix2x2(1, 0, 0, 1), maxFaces = 100) {
    // If no generators provided, return empty
    if (!generators || generators.length === 0) {
        const result = [];
        for (let i = 0; i < 256; i++) {
            result.push(new THREE.Vector4(10, 0, 0, 0.1));
        }
        return { faces: result, count: 0 };
    }

    const queue = [{ matrix: viewMat, depth: 0 }];
    const faces = [];
    const seenMatrices = new Set();  // Track explored matrices
    const seenFaces = new Set();     // Track unique face locations

    // Basepoint translated by viewMat
    const startQ = uhsToBall(imageOfOriginUHS(viewMat));
    seenMatrices.add(exploreMatrixKey(viewMat));

    let head = 0;
    while (head < queue.length) {
        const { matrix, depth } = queue[head++];
        if (depth >= 8) continue;

        for (const g of generators) {
            const next = matrix.mul(g);
            const matKey = exploreMatrixKey(next);

            if (!seenMatrices.has(matKey)) {
                seenMatrices.add(matKey);
                queue.push({ matrix: next, depth: depth + 1 });

                // Get the orbit point for this matrix
                const q = uhsToBall(imageOfOriginUHS(next));

                // Only create face if this point is different from basepoint
                const distSq = q.clone().sub(startQ).lengthSq();
                if (distSq > 1e-8) {
                    // Create face key based on the orbit point location
                    const faceKey = `${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)}`;

                    if (!seenFaces.has(faceKey)) {
                        seenFaces.add(faceKey);
                        faces.push(getBisectorSphere(startQ, q));
                    }
                }
            }
        }
    }

    // Sort by geodesic distance to the basepoint
    faces.sort((f1, f2) => {
        const c1 = new THREE.Vector3(f1.x, f1.y, f1.z);
        const r1 = Math.abs(f1.w);
        const d1 = Math.abs(c1.distanceTo(startQ) - r1);

        const c2 = new THREE.Vector3(f2.x, f2.y, f2.z);
        const r2 = Math.abs(f2.w);
        const d2 = Math.abs(c2.distanceTo(startQ) - r2);

        return d1 - d2;
    });

    const totalBuffer = 256;
    const actualCount = Math.min(maxFaces, faces.length);
    const result = faces.slice(0, actualCount);

    while (result.length < totalBuffer) {
        result.push(new THREE.Vector4(10, 0, 0, 0.1));
    }
    return { faces: result, count: actualCount };
}

/**
 * Find standard generators: group elements that map the polyhedron to share a face with itself.
 * These are the elements g such that the bisector between basepoint and g(basepoint)
 * is a face of the Dirichlet domain.
 * @param {Matrix2x2[]} generators - Array of generators (including inverses)
 * @param {Matrix2x2} viewMat - Current view matrix
 * @param {number} maxFaces - Maximum number of faces to consider
 * @returns {Array} Array of {matrix, face, isStabilizer} objects
 */
export function getStdGenerators(generators = [], viewMat = new Matrix2x2(1, 0, 0, 1), maxFaces = 100) {
    if (!generators || generators.length === 0) {
        return [];
    }

    const queue = [{ matrix: viewMat, depth: 0, word: '' }];
    const stdGens = [];
    const seenMatrices = new Set();
    const seenFaces = new Set();

    const startQ = uhsToBall(imageOfOriginUHS(viewMat));
    seenMatrices.add(exploreMatrixKey(viewMat));

    let head = 0;
    while (head < queue.length && stdGens.length < maxFaces) {
        const { matrix, depth, word } = queue[head++];
        if (depth >= 8) continue;

        for (let i = 0; i < generators.length; i++) {
            const g = generators[i];
            const next = matrix.mul(g);
            const matKey = exploreMatrixKey(next);
            const genLabel = i < generators.length / 2
                ? String.fromCharCode(65 + i)  // A, B, C, ...
                : String.fromCharCode(97 + (i - generators.length / 2));  // a, b, c, ... (inverses)
            const nextWord = word + genLabel;

            if (!seenMatrices.has(matKey)) {
                seenMatrices.add(matKey);
                queue.push({ matrix: next, depth: depth + 1, word: nextWord });

                const q = uhsToBall(imageOfOriginUHS(next));
                const distSq = q.clone().sub(startQ).lengthSq();

                // Check if this is a stabilizer (fixes basepoint)
                if (distSq < 1e-8) {
                    stdGens.push({
                        matrix: next,
                        word: nextWord,
                        isStabilizer: true,
                        face: null
                    });
                } else {
                    // Check if this creates a new face
                    const faceKey = `${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)}`;
                    if (!seenFaces.has(faceKey)) {
                        seenFaces.add(faceKey);
                        const face = getBisectorSphere(startQ, q);
                        stdGens.push({
                            matrix: next,
                            word: nextWord,
                            isStabilizer: false,
                            face: face
                        });
                    }
                }
            }
        }
    }

    // Sort by word length, then alphabetically
    stdGens.sort((a, b) => {
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        return a.word.localeCompare(b.word);
    });

    return stdGens;
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
 */
export function getCayleyGraph(generators = [], maxDepth = 4, viewMat = new Matrix2x2(1, 0, 0, 1)) {
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

