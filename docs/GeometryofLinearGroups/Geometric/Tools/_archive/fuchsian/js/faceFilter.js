/**
 * Face-defining covector filter for polyhedral cones in R^{2,1}
 * (Hyperbolic 2-Space)
 */

/**
 * Find an interior point of the polyhedral cone (all SDFs <= 0)
 * We use the convention that the basepoint [0, 0, 1] is typically inside.
 */
function findInteriorPoint(covectors, eps = 1e-6) {
    const candidates = [
        [0, 0, 1],          // Standard basepoint
        [0.05, 0.05, 1.0025],
        [-0.05, 0.05, 1.0025],
        [0.05, -0.05, 1.0025],
        [-0.05, -0.05, 1.0025],
        [0.1, 0, 1.005],
        [0, 0.1, 1.005],
        [-0.1, 0, 1.005],
        [0, -0.1, 1.005]
    ];

    for (const p of candidates) {
        let allPositive = true;
        for (const cov of covectors) {
            // Euclidean dot (assuming cov is already eta-applied)
            const val = cov[0] * p[0] + cov[1] * p[1] + cov[2] * p[2];
            if (val > eps) {
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
 */
function samplePointsOnHyperplane(cov, interiorPoint, numSamples = 30) {
    const [a, b, c] = cov;
    const [x0, y0, w0] = interiorPoint;

    // We want a*x + b*y + c*w = 0
    // Project interior point onto hyperplane (Euclidean projection in R3)
    const dist = a * x0 + b * y0 + c * w0;
    const covNormSq = a * a + b * b + c * c;
    if (covNormSq < 1e-12) return [];

    const scale = dist / covNormSq;
    const projected = [
        x0 - scale * a,
        y0 - scale * b,
        w0 - scale * c
    ];

    // Build orthonormal basis for hyperplane in R3
    const basis = [];
    const candidates = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];

    for (const candidate of candidates) {
        const vDotCov = candidate[0] * a + candidate[1] * b + candidate[2] * c;
        const proj = [
            candidate[0] - vDotCov / covNormSq * a,
            candidate[1] - vDotCov / covNormSq * b,
            candidate[2] - vDotCov / covNormSq * c
        ];

        const normSq = proj[0] ** 2 + proj[1] ** 2 + proj[2] ** 2;
        if (normSq > 1e-12) {
            const norm = Math.sqrt(normSq);
            basis.push([proj[0] / norm, proj[1] / norm, proj[2] / norm]);
            if (basis.length === 2) break;
        }
    }

    if (basis.length < 2) return [projected];

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
                projected[0] + t1 * basis[0][0] + t2 * basis[1][0],
                projected[1] + t1 * basis[0][1] + t2 * basis[1][1],
                projected[2] + t1 * basis[0][2] + t2 * basis[1][2]
            ];
            // Ensure point is in the future cone (w > 0)
            if (p[2] > 0.1) samples.push(p);
            if (samples.length >= numSamples) break;
        }
        if (samples.length >= numSamples) break;
    }

    return samples;
}

/**
 * Filter covectors
 */
function filterFaceDefiningCovectorsCone(covectors, options = {}) {
    const eps = options.eps || 1e-9;
    const strictMargin = options.strict_margin || 1e-9;

    if (covectors.length === 0) return [];

    const interiorPoint = findInteriorPoint(covectors, strictMargin);
    const faceDefining = [];

    // If no interior point found, keep all for safety
    if (!interiorPoint) {
        console.warn("No interior point found for face filtering");
        return covectors.map((_, i) => i);
    }

    for (let i = 0; i < covectors.length; i++) {
        const cov = covectors[i];
        const samples = samplePointsOnHyperplane(cov, interiorPoint, 40);
        let hasWitness = false;

        for (const p of samples) {
            // Verify on plane
            const onPlane = Math.abs(cov[0] * p[0] + cov[1] * p[1] + cov[2] * p[2]);
            if (onPlane > 1e-6) continue;

            // Check if inside all others
            let allInside = true;
            for (let j = 0; j < covectors.length; j++) {
                if (i === j) continue;
                const cj = covectors[j];
                const val = cj[0] * p[0] + cj[1] * p[1] + cj[2] * p[2];
                if (val > eps) {
                    allInside = false;
                    break;
                }
            }
            if (allInside) {
                hasWitness = true;
                break;
            }
        }

        if (hasWitness) {
            faceDefining.push(i);
        }
    }

    return faceDefining;
}

// Global export
if (typeof window !== 'undefined') {
    window.filterFaceDefiningCovectorsCone = filterFaceDefiningCovectorsCone;
}
