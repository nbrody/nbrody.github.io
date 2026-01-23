/**
 * Face-defining covector filter for polyhedral cones in R^{3,1}
 *
 * Given a collection of covectors (hyperplanes), determines which ones
 * actually define faces of the polyhedral cone formed by their intersection.
 *
 * A covector [a,b,c,d] defines a face iff there exists a witness point p
 * such that:
 * - p is on the hyperplane: a*x + b*y + c*z + d*w = 0
 * - p is strictly inside all other half-spaces: a_j*x + b_j*y + c_j*z + d_j*w > 0 for all j ≠ i
 */

/**
 * Minkowski inner product for signature (+,+,+,-)
 */
function minkowskiDot(v1, v2) {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2] - v1[3] * v2[3];
}

/**
 * Find an interior point of the polyhedral cone (all SDFs > 0)
 * Try several candidate points
 */
function findInteriorPoint(covectors, eps = 1e-6) {
    const candidates = [
        [0, 0, 0, 1],      // Standard basepoint
        [0.1, 0, 0, 1],
        [0, 0.1, 0, 1],
        [0, 0, 0.1, 1],
        [0.1, 0.1, 0, 1],
        [0.1, 0.1, 0.1, 1],
        [-0.1, 0, 0, 1],
        [0, -0.1, 0, 1]
    ];

    for (const p of candidates) {
        let allPositive = true;
        for (const cov of covectors) {
            const val = cov[0]*p[0] + cov[1]*p[1] + cov[2]*p[2] + cov[3]*p[3];
            if (val < eps) {
                allPositive = false;
                break;
            }
        }
        if (allPositive) return p;
    }

    // If no candidate works, try to find one by averaging
    // Take the mean of all hyperplane normals (pointing inward)
    let sum = [0, 0, 0, 0];
    for (const cov of covectors) {
        sum[0] += cov[0];
        sum[1] += cov[1];
        sum[2] += cov[2];
        sum[3] += cov[3];
    }

    // Normalize and offset from origin
    const norm = Math.sqrt(sum[0]**2 + sum[1]**2 + sum[2]**2 + sum[3]**2);
    if (norm > 1e-12) {
        const p = [
            -sum[0]/norm * 0.1,
            -sum[1]/norm * 0.1,
            -sum[2]/norm * 0.1,
            1.0 - sum[3]/norm * 0.1
        ];

        // Verify it's interior
        let allPositive = true;
        for (const cov of covectors) {
            const val = cov[0]*p[0] + cov[1]*p[1] + cov[2]*p[2] + cov[3]*p[3];
            if (val < eps) {
                allPositive = false;
                break;
            }
        }
        if (allPositive) return p;
    }

    return null;
}

/**
 * Sample points on the hyperplane near the interior point
 * Strategy: project interior point onto hyperplane, then sample nearby
 */
function samplePointsOnHyperplane(cov, interiorPoint, numSamples = 20) {
    const [a, b, c, d] = cov;
    const [x0, y0, z0, w0] = interiorPoint;

    // Project interior point onto hyperplane
    const dist = a*x0 + b*y0 + c*z0 + d*w0;
    const covNormSq = a*a + b*b + c*c + d*d;
    if (covNormSq < 1e-12) return [];

    const scale = dist / covNormSq;
    const projected = [
        x0 - scale * a,
        y0 - scale * b,
        z0 - scale * c,
        w0 - scale * d
    ];

    // Build orthonormal basis for hyperplane
    const basis = [];
    const candidates = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
    ];

    for (const candidate of candidates) {
        const vDotCov = candidate[0]*a + candidate[1]*b + candidate[2]*c + candidate[3]*d;
        const proj = [
            candidate[0] - vDotCov/covNormSq * a,
            candidate[1] - vDotCov/covNormSq * b,
            candidate[2] - vDotCov/covNormSq * c,
            candidate[3] - vDotCov/covNormSq * d
        ];

        const normSq = proj[0]**2 + proj[1]**2 + proj[2]**2 + proj[3]**2;
        if (normSq > 1e-12) {
            const norm = Math.sqrt(normSq);
            basis.push([proj[0]/norm, proj[1]/norm, proj[2]/norm, proj[3]/norm]);
            if (basis.length === 3) break;
        }
    }

    if (basis.length < 3) return [projected];

    // Sample points around the projection
    const samples = [projected];
    const radius = 0.5;
    const steps = Math.ceil(Math.sqrt(numSamples));

    for (let i = -steps; i <= steps; i++) {
        for (let j = -steps; j <= steps; j++) {
            if (i === 0 && j === 0) continue;
            const t1 = (i / steps) * radius;
            const t2 = (j / steps) * radius;
            const p = [
                projected[0] + t1*basis[0][0] + t2*basis[1][0],
                projected[1] + t1*basis[0][1] + t2*basis[1][1],
                projected[2] + t1*basis[0][2] + t2*basis[1][2],
                projected[3] + t1*basis[0][3] + t2*basis[1][3]
            ];
            samples.push(p);
            if (samples.length >= numSamples) break;
        }
        if (samples.length >= numSamples) break;
    }

    return samples;
}

/**
 * Find a point on the hyperplane defined by covector that is strictly inside
 * all other half-spaces, or determine that no such point exists.
 *
 * @param {number} idx - Index of the covector to test
 * @param {Array<Array<number>>} covectors - List of covectors [a,b,c,d]
 * @param {Array<number>} interiorPoint - A point strictly inside the cone
 * @param {number} eps - Strictness margin for interior test
 * @returns {boolean} - True if this covector defines a face
 */
function testFaceDefining(idx, covectors, interiorPoint, eps = 1e-9) {
    const cov = covectors[idx];

    // Sample points on this hyperplane
    const samples = samplePointsOnHyperplane(cov, interiorPoint, 25);

    // Check if any sample is a valid witness point
    for (const p of samples) {
        // Verify p is on the hyperplane
        const [a, b, c, d] = cov;
        const onPlane = Math.abs(a*p[0] + b*p[1] + c*p[2] + d*p[3]);
        if (onPlane > 1e-6) continue;

        // Check if p is strictly inside all other half-spaces
        let allInside = true;
        for (let j = 0; j < covectors.length; j++) {
            if (j === idx) continue;

            const [aj, bj, cj, dj] = covectors[j];
            const val = aj*p[0] + bj*p[1] + cj*p[2] + dj*p[3];

            if (val < eps) {
                allInside = false;
                break;
            }
        }

        if (allInside) {
            return true;
        }
    }

    return false;
}

/**
 * Sample points on hyperplane for stabilizers (hyperplanes through basepoint)
 * These have the form [a, b, c, d≈0] and we sample in the {w=1} slice
 */
function sampleStabilizerHyperplane(cov, interiorPoint, numSamples = 40) {
    const [a, b, c, d] = cov;

    // For a stabilizer, we work in 3D space with points [x,y,z,1]
    // The constraint is a*x + b*y + c*z + d ≈ 0 (d should be small)

    // Build orthonormal basis for the plane a*x + b*y + c*z + d = 0 in R^3
    // First, find any point on the plane
    let basePoint3D = [0, 0, 0];
    const normSq = a*a + b*b + c*c;
    if (normSq < 1e-12) return [[0, 0, 0, 1]];

    // Find a point on the plane by setting two coords to 0
    if (Math.abs(a) > 1e-9) {
        basePoint3D = [-d/a, 0, 0];
    } else if (Math.abs(b) > 1e-9) {
        basePoint3D = [0, -d/b, 0];
    } else if (Math.abs(c) > 1e-9) {
        basePoint3D = [0, 0, -d/c];
    }

    // Build orthonormal basis for the plane
    const basis = [];
    const candidates3D = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];

    for (const v3D of candidates3D) {
        // Project onto plane: v - (v·n / n·n) * n
        const vDotN = v3D[0]*a + v3D[1]*b + v3D[2]*c;
        const proj = [
            v3D[0] - vDotN/normSq * a,
            v3D[1] - vDotN/normSq * b,
            v3D[2] - vDotN/normSq * c
        ];

        const pNormSq = proj[0]**2 + proj[1]**2 + proj[2]**2;
        if (pNormSq > 1e-12) {
            const pNorm = Math.sqrt(pNormSq);
            basis.push([proj[0]/pNorm, proj[1]/pNorm, proj[2]/pNorm]);
            if (basis.length === 2) break;
        }
    }

    if (basis.length < 2) return [[basePoint3D[0], basePoint3D[1], basePoint3D[2], 1]];

    // Sample points around basePoint3D in the plane
    const samples = [];
    const radii = [0.05, 0.15, 0.3, 0.5]; // Multiple radii for better coverage
    const angles = 8;

    for (const radius of radii) {
        for (let k = 0; k < angles; k++) {
            const theta = (2 * Math.PI * k) / angles;
            const t1 = radius * Math.cos(theta);
            const t2 = radius * Math.sin(theta);
            const p = [
                basePoint3D[0] + t1*basis[0][0] + t2*basis[1][0],
                basePoint3D[1] + t1*basis[0][1] + t2*basis[1][1],
                basePoint3D[2] + t1*basis[0][2] + t2*basis[1][2],
                1
            ];
            samples.push(p);
            if (samples.length >= numSamples) break;
        }
        if (samples.length >= numSamples) break;
    }

    // Always include the basepoint
    samples.push([0, 0, 0, 1]);

    return samples;
}

/**
 * Test if a stabilizer covector defines a face
 */
function testStabilizerFaceDefining(idx, covectors, eps = 1e-9) {
    const cov = covectors[idx];

    // Sample points on this hyperplane (in the {w=1} slice)
    const samples = sampleStabilizerHyperplane(cov, null, 40);

    // Check if any sample is a valid witness point
    for (const p of samples) {
        // Verify p is on the hyperplane (be more lenient due to numerical errors)
        const [a, b, c, d] = cov;
        const onPlane = Math.abs(a*p[0] + b*p[1] + c*p[2] + d*p[3]);
        if (onPlane > 1e-4) continue;

        // Check if p is weakly inside all other half-spaces
        // Use a more lenient tolerance for stabilizers
        let allInside = true;
        for (let j = 0; j < covectors.length; j++) {
            if (j === idx) continue;

            const [aj, bj, cj, dj] = covectors[j];
            const val = aj*p[0] + bj*p[1] + cj*p[2] + dj*p[3];

            // More lenient: accept if nearly on boundary or inside
            if (val < -1e-6) {
                allInside = false;
                break;
            }
        }

        if (allInside) {
            return true;
        }
    }

    return false;
}

/**
 * Filter a list of covectors to keep only those that define faces of the polyhedral cone.
 *
 * @param {Array<Array<number>>} covectors - List of covectors [a,b,c,d] where each defines a half-space
 * @param {Object} options - Options for filtering
 * @param {number} options.eps - Strictness margin for interior test (default 1e-9)
 * @param {number} options.strict_margin - Additional margin for strict inequality (default 1e-9)
 * @returns {Array<number>} - Indices of covectors that define faces
 */
function filterFaceDefiningCovectorsCone(covectors, options = {}) {
    const eps = options.eps || 1e-9;
    const strictMargin = options.strict_margin || 1e-9;

    if (covectors.length === 0) return [];

    const basepoint = [0, 0, 0, 1];

    // Separate covectors into stabilizers and non-stabilizers
    const stabilizers = [];
    const nonStabilizers = [];

    for (let i = 0; i < covectors.length; i++) {
        const cov = covectors[i];
        const val = cov[0]*basepoint[0] + cov[1]*basepoint[1] + cov[2]*basepoint[2] + cov[3]*basepoint[3];

        // Be more lenient in detecting stabilizers - use relative tolerance
        const covNorm = Math.sqrt(cov[0]**2 + cov[1]**2 + cov[2]**2 + cov[3]**2);
        const relativeVal = covNorm > 1e-12 ? Math.abs(val) / covNorm : Math.abs(val);

        if (relativeVal < 0.01) {  // Relative tolerance of 1%
            // This hyperplane passes through or very near the basepoint
            stabilizers.push(i);
            console.log(`Stabilizer ${i}: val=${val.toFixed(6)}, relVal=${relativeVal.toFixed(6)}, cov=[${cov.map(x=>x.toFixed(4)).join(',')}]`);
        } else {
            nonStabilizers.push(i);
        }
    }

    console.log(`Found ${stabilizers.length} stabilizers, ${nonStabilizers.length} non-stabilizers out of ${covectors.length} total`);

    const faceDefining = [];

    // Handle non-stabilizers
    if (nonStabilizers.length > 0) {
        const interiorPoint = findInteriorPoint(covectors, strictMargin);

        if (interiorPoint) {
            for (const globalIdx of nonStabilizers) {
                if (testFaceDefining(globalIdx, covectors, interiorPoint, strictMargin)) {
                    faceDefining.push(globalIdx);
                }
            }
        } else {
            // Fallback: keep all non-stabilizers
            faceDefining.push(...nonStabilizers);
        }
    }

    // Handle stabilizers - test them separately
    for (const globalIdx of stabilizers) {
        if (testStabilizerFaceDefining(globalIdx, covectors, strictMargin)) {
            faceDefining.push(globalIdx);
        }
    }

    return faceDefining.sort((a, b) => a - b);
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.filterFaceDefiningCovectorsCone = filterFaceDefiningCovectorsCone;
    window.findInteriorPoint = findInteriorPoint;
    window.testFaceDefining = testFaceDefining;
    window.testStabilizerFaceDefining = testStabilizerFaceDefining;
}

// Export for Node.js/modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        filterFaceDefiningCovectorsCone,
        findInteriorPoint,
        testFaceDefining,
        testStabilizerFaceDefining,
        minkowskiDot
    };
}
