import './hyperboloidModel.js';
import './psl2CO31.js';
import { psl2CO31, O31inv } from './psl2CO31.js';

// Apply the isometry g to the point p in the hyperboloid model.
// g is a 4x4 matrix, p is a point in the hyperboloid model.
function gpAction(g, p) {
  // Multiply 4×4 (or n×n) matrix g by column vector p
  // Returns a new vector of the same length as p
  return g.map(row => row.reduce((sum, a, j) => sum + a * p[j], 0));
}

// Lorentzian inner product on R^{3,1}
function B(v, w) {
    return v[0]*w[0] + v[1]*w[1] + v[2]*w[2] - v[3]*w[3];
}

// For g in O(3,1), its associated normal vector is determined by first
// finding the rlex-first standard basis vector e_i so that g(e_i) != e_i,
// and then computing (g^-1 - I)(e_i). 
export function normalVector(g) {
    const I = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
    const gInv = O31inv(g);
    // Use reverse-lexicographic order: e_3, e_2, e_1, e_0
    for (let i = 3; i >= 0; i--) {
        const e_i = [0,0,0,0];
        e_i[i] = 1;
        // Check rlex-first e_i such that g(e_i) != e_i
        const fixed = gpAction(g, e_i).every((val, idx) => val === e_i[idx]);
        if (!fixed) {
            // Return (g^{-1} - I)(e_i)
            const diff = e_i.map((val, idx) => val - gpAction(gInv, e_i)[idx]);
            return diff;
        }
    }
    return [0,0,0,0]; // g is identity
}

const g = psl2CO31([[0, -1], [1, 0]]); 
const h = psl2CO31([[1, 2], [0, 1]]); 
console.log(
    normalVector(h),

    B(normalVector(h), [0,0,0,1]) // should be positive
);

// Now suppose I have a collection of normal vectors n_i . The region in R^{3,1} for which B(n_i, x) >= 0 for all i
// is a convex polyhedral cone, which we will call Pc. A vector n_i actually determines a face of Pc if there is some x in Pc
// for which B(n_i, x) = 0. We can check this by checking if there is some x in Pc for which B(n_i, x) < 0; if so, then n_i 
// does not determine a face. We can find such an x by linear programming.

/**
 * faces(S[, opts]) -> returns the subset of S that are "faces" in R^{3,1}
 * with bilinear form B=diag(1,1,1,-1).
 *
 * A vector v in S is a face if there exists x in R^{3,1} with B(v,x) < 0
 * and B(w,x) >= 0 for all other w in S\{v}.
 *
 * This function checks feasibility for each v by trying to find x such that
 *   B(v,x) <= -1    and    B(w,x) >= 0  for all w != v.
 * (The -1 margin fixes strictness; existence is scale-invariant.)
 *
 * Method: perceptron-style updates on the equivalent Euclidean dot-product
 * system using the map φ(w) = (w1, w2, w3, -w4) so that B(w,x) = φ(w)·x.
 *
 * @param {Array<Array<number>>} S - array of 4-vectors [a,b,c,d]
 * @param {Object} [opts]
 *   - maxIter: maximum perceptron iterations per candidate (default 20000)
 *   - lr: learning rate (default 1)
 *   - tol: numerical tolerance for final verification (default 1e-9)
 *   - normalize: whether to ℓ2-normalize φ(w) vectors (default true)
 * @returns {Array<Array<number>>} subset of S that are faces
 */
function faces(S, opts = {}) {
    const maxIter = opts.maxIter ?? 20000;
    const lr = opts.lr ?? 1;
    const tol = opts.tol ?? 1e-9;
    const normalize = opts.normalize ?? true;

    if (!Array.isArray(S) || S.length === 0) return [];

    // φ(w) = (w1, w2, w3, -w4), so that B(w, x) = φ(w)·x (Euclidean dot)
    const phi = w => [w[0], w[1], w[2], -w[3]];

    // Optionally normalize φ(w) to improve convergence.
    const phis = S.map(w => {
        const p = phi(w);
        if (!normalize) return p;
        const n = Math.hypot(p[0], p[1], p[2], p[3]);
        return n > 0 ? p.map(x => x / n) : p;
    });

    // Dot product
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

    // Single-candidate feasibility: find x with constraints:
    //   y_i * (φ_i · x) >= margin_i, where
    //   for target v: y=-1, margin=1  (i.e., φ_v·x <= -1)
    //   for others:   y=+1, margin=0  (i.e., φ_w·x >= 0)
    function feasibleForIndex(i) {
        const n = S.length;
        const y = new Array(n).fill(1);
        const margin = new Array(n).fill(0);
        y[i] = -1;
        margin[i] = 1;

        // Initialize x = 0
        let x = [0, 0, 0, 0];

        // Perceptron-style updates
        // When a constraint y_k * (φ_k·x) < margin_k is violated,
        // update x ← x + lr * y_k * φ_k.
        let updated = true;
        let iter = 0;

        while (iter < maxIter) {
            updated = false;
            for (let k = 0; k < n; k++) {
                const val = dot(phis[k], x);
                if (y[k] * val < margin[k] - 1e-12) { // small slack to push progress
                    // Update step
                    const scale = lr * y[k];
                    x = [x[0] + scale * phis[k][0],
                    x[1] + scale * phis[k][1],
                    x[2] + scale * phis[k][2],
                    x[3] + scale * phis[k][3]];
                    updated = true;
                }
            }
            if (!updated) break;
            iter++;
        }

        // Verify with original constraints & requested tolerance.
        // Use exact B(w,x) via φ(w)·x; check:
        //   for k != i: φ(w_k)·x >= 0 - tol
        //   for k == i: φ(v)·x <= -1 + tol  (strictness ensured by -1 margin)
        const okOthers = phis.every((pw, k) => k === i || dot(pw, x) >= -tol);
        const okFace = dot(phis[i], x) <= -1 + tol;

        return okOthers && okFace ? x : null;
    }

    const out = [];
    for (let i = 0; i < S.length; i++) {
        const x = feasibleForIndex(i);
        if (x) out.push(S[i]);
    }
    return out;
}





// For a fixed p and q, signedDistance allows us to compute the 
// bisector (the points x where this is zero), and the half-spaces
// (the nonnegative half-space is the one containing q).
// It is normalized so that sND(p, q, p) = 1, sND(p, q, q) = -1.
export function signedNormalizedDistance(p,q,x) { 
    return (hypDist(q, x) - hypDist(p, x)) / hypDist(p, q);
}
// For a fixed basepoint, signedDistanceVector allows us to compute
// the signed distance from a point to a set of points.
function signedDistanceVector(basepoint, points, x) {
  return points.map(p => signedDistance(basepoint, p, x));
}

// The polyhedron is the set of points x so that 
// min(signedDistanceVector(basepoint, points, x)) >= 0.


// computeFaces takes in a basepoint and a set of points, and 
// returns the set of points that actually determine a face.
// This is equivalent to saying that the signed distance function
// evaluates to zero is somewhere on the polyhedron
function computeFaces(basepoint, points) {
    const faces = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const distToBase = dist(basepoint, p);
        if (distToBase < EPS) continue; // too close to basepoint
        let isFace = true;
        for (let j = 0; j < points.length; j++) {
            if (i === j) continue;
            const q = points[j];
            if (dist(basepoint, q) < EPS) continue; // skip too close to basepoint
            if (signedDistance(basepoint, p, q) < -EPS) {
                isFace = false;
                break;
            }
        }
        if (isFace) faces.push(p);
    }
    return faces;
}


// If we have a set of isometries, we remove redundant ones.
// We accomplish this by computing the faces of the polyhedron
// centered at the basepoint, and defined in terms of the image 
// of the basepoint under the isometries. The function returns
// the isometries that actually determine a face.
export function removeRedundantIsometries(basepoint, isometries) {
    if (!Array.isArray(isometries) || isometries.length === 0) {
        throw new Error("isometries must be a nonempty array of isometries");
    }
    const points = isometries.map(iso => iso.basepoint);
    const faces = computeFaces(basepoint, points);
    return isometries.filter(iso => faces.includes(iso.basepoint));
}


// This function takes in a set of generators in O(3,1)
// and first symmetrizes them. We initialize T_0 = gens,
// and recursively compute T_{i+1} = isometryFaces(T_0 T_i).
// If we ever have T_{i+1} = T_i, we stop, and return (T_i, i).
// Set a threshold for the number of iterations to prevent infinite loops
export function findFacePairings(gens, options = {}) {
    if (!Array.isArray(gens) || gens.length === 0) {
        throw new Error("gens must be a nonempty array of isometries");
    }

    // Replaces gens with gens U gens^-1 U identity
    gens = gens.inverse().concat(gens).concat(Identity);

    const { maxIterations = 200 } = options;
    let T = computeIsometryFaces(gens);
    let i = 0;

    while (i < maxIterations) {
        const expanded = T.flatMap(iso => iso.face.map(
            f => ({ basepoint: iso.isometry.basepoint, points: f })
        ));
        const nextT = computeIsometryFaces(expanded);

        if (nextT.length === 0 || JSON.stringify(nextT) === JSON.stringify(T)) {
            return { faces: T, iterations: i };
        }

        T = nextT;
        i++;
    }

    // Stop due to iteration cap
    return { faces: T, iterations: i, stopped: "maxIterations" };
}

// This function takes in a set of generators in O(3,1) and
// computes the polyhedron they generate, returned as a set of 
// linear functionals on R^{3,1} together with the face-pairings.
export function gensToPolyhedron(gens) {
    if (!Array.isArray(gens) || gens.length === 0) {
        throw new Error("gens must be a nonempty array of isometries");
    }

    const basepoint = { x: 0, y: 0, z: 0, t: 1 }; // default basepoint
    const faces = removeRedundantIsometries(basepoint, gens);
    const facePairings = findFacePairings(faces);

    return {
        polyhedron: facePairings.faces,
        facePairings: facePairings.iterations,
        stopped: facePairings.stopped
    };
}