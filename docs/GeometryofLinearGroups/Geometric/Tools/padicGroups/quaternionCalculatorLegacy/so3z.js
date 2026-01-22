
import { ProjectiveQuaternion } from './projectiveQuaternion.js';
import { QMath } from './generatorComputation.js';

// Generators for SO3(Z) ~ S4
// i, j, 1+i, 1+j
const RAW_GENERATORS = [
    [0, 1, 0, 0], // i
    [0, 0, 1, 0], // j
    [1, 1, 0, 0], // 1+i
    [1, 0, 1, 0]  // 1+j
];

export async function generateSO3Z() {
    const group = [];
    const seen = new Set();
    const queue = [new ProjectiveQuaternion(1, 0, 0, 0)]; // Identity

    // Add identity first
    const id = new ProjectiveQuaternion(1, 0, 0, 0);
    group.push({
        pq: id,
        name: '1',
        raw: [1, 0, 0, 0]
    });
    seen.add(id.hash());

    // BFS to find all 24 elements
    let index = 0;
    while (index < group.length) {
        const current = group[index];
        index++;

        for (let i = 0; i < RAW_GENERATORS.length; i++) {
            const genArr = RAW_GENERATORS[i];
            const genPQ = ProjectiveQuaternion.fromArray(genArr);
            const nextPQ = current.pq.multiply(genPQ);

            if (!seen.has(nextPQ.hash())) {
                seen.add(nextPQ.hash());

                // Construct a nice name/label
                // This is hard to do automatically nicely, but we store the raw value
                // We'll format it later
                group.push({
                    pq: nextPQ,
                    raw: nextPQ.toArray() // This might be normalized, maybe better to keep track of integer coords?
                    // ProjectiveQuaternion normalizes. 
                    // For SO3(Z), elements like 1+i+j+k (norm 4) exist.
                    // The standard Hurwitz units are:
                    // 8 permutations of (+/-1, 0, 0, 0) -> Norm 1
                    // 16 permutations of (+/-1/2, +/-1/2, +/-1/2, +/-1/2) -> Norm 1 (Hurwitz)
                    // But we are using integer quaternions mod center.
                    // The integer ones with norm 1: 1, i, j, k (and negatives) -> 4 elements in P(H)
                    // The ones with norm 2: 1+i, 1+j, etc. -> 12 elements?
                    // The ones with norm 4: 1+i+j+k -> 8 elements?
                    // Total 24.
                });
            }
        }
    }

    // Sort them nicely
    // 1. Identity
    // 2. Norm 1 (i, j, k)
    // 3. Norm 2 (1+i, etc)
    // 4. Norm 4 (1+i+j+k)
    // Note: ProjectiveQuaternion.toArray() returns normalized floats or integers if simple?
    // ProjectiveQuaternion normalize makes first non-zero positive. It doesn't scale to integers.
    // Let's rely on resizing to integers for display.

    const cleanGroup = group.map(g => {
        // Try to recover integer form
        // If x,y,z,w are effectively integers/halves
        const arr = g.pq.toArray();

        // Find scaler to make them close to integers
        // Try multiplying by 1, 2. (Since norms are 1, 2, 4, coeffs are like 1 or 0.5)
        let bestArr = arr;
        let bestError = Infinity;

        for (let s of [1, 2]) { // 1+i+j+k is (0.5, 0.5, 0.5, 0.5) normalized?
            // Wait, ProjectiveQuaternion(1,1,1,1) -> (1,1,1,1) if not unit normalized.
            // My ProjectiveQuaternion class DOES NOT normalize to unit length by default (lines 39-41 comments).
            // It just handles sign.
            // So they should be integers already!
            bestArr = arr;
            break;
        }

        return {
            pq: g.pq,
            q: bestArr, // Should be integer-ish
            norm: QMath.normSq(bestArr)
        };
    });

    // Sort by norm, then lexicographically
    cleanGroup.sort((a, b) => {
        if (a.norm !== b.norm) return a.norm - b.norm;
        for (let i = 0; i < 4; i++) {
            if (Math.abs(a.q[i] - b.q[i]) > 0.1) return b.q[i] - a.q[i]; // arbitrary stable sort
        }
        return 0;
    });

    return cleanGroup;
}

// Convert quaternion to rotation matrix (as array of 3 vectors aka columns)
// v -> q v q^-1
export function getRotationMatrix(q) {
    // Basis vectors
    const bases = [
        [0, 1, 0, 0], // x (pure quaternion)
        [0, 0, 1, 0], // y
        [0, 0, 0, 1]  // z
    ];

    const pq = ProjectiveQuaternion.fromArray(q);

    return bases.map(v => {
        const res = pq.act(v); // returns new PQ
        return [res.x, res.y, res.z]; // extract vector part
    });
}