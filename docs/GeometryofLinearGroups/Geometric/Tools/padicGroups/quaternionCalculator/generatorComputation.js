// Quaternion Math Library
export const QMath = {
    multiply: (q1, q2) => {
        const [w1, x1, y1, z1] = q1;
        const [w2, x2, y2, z2] = q2;
        return [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        ];
    },
    conjugate: (q) => [q[0], -q[1], -q[2], -q[3]],
    normSq: (q) => q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2,
    inverse: (q) => {
        const n2 = QMath.normSq(q);
        if (n2 === 0) return [0, 0, 0, 0];
        const [w, x, y, z] = QMath.conjugate(q);
        return [w / n2, x / n2, y / n2, z / n2];
    },
    areEqual: (q1, q2, epsilon = 1e-9) => {
        return q1.every((val, i) => Math.abs(val - q2[i]) < epsilon);
    }
};

// Generate all quaternions with norm = p (where p is an odd prime)
export function generateQuaternionsOfNorm(p) {
    const quaternions = [];
    const maxCoeff = Math.ceil(Math.sqrt(p));

    // Search for all (w, x, y, z) where w^2 + x^2 + y^2 + z^2 = p
    for (let w = -maxCoeff; w <= maxCoeff; w++) {
        for (let x = -maxCoeff; x <= maxCoeff; x++) {
            for (let y = -maxCoeff; y <= maxCoeff; y++) {
                for (let z = -maxCoeff; z <= maxCoeff; z++) {
                    if (w*w + x*x + y*y + z*z === p) {
                        quaternions.push([w, x, y, z]);
                    }
                }
            }
        }
    }

    return quaternions;
}

// Remove duplicates up to sign and choose canonical representative
export function removeDuplicatesUpToSign(quaternions) {
    const unique = [];
    const seen = new Set();

    for (const q of quaternions) {
        // Create a canonical key: use absolute values sorted
        const absQ = q.map(Math.abs).sort((a, b) => b - a);
        const key = absQ.join(',');

        if (!seen.has(key)) {
            seen.add(key);
            // Normalize: make first non-zero component positive
            const normalized = [...q];
            const firstNonZeroIdx = normalized.findIndex(x => x !== 0);
            if (firstNonZeroIdx >= 0 && normalized[firstNonZeroIdx] < 0) {
                for (let i = 0; i < normalized.length; i++) {
                    normalized[i] *= -1;
                }
            }
            unique.push(normalized);
        }
    }

    return unique;
}

// Compute all relations between generators
// A relation is: a * b = bp * ap (possibly up to sign)
export function computeRelations(generators) {
    const relations = [];
    const genKeys = Object.keys(generators);
    const relationSet = new Set(); // To avoid duplicates

    console.log(`Computing relations for ${genKeys.length} generators...`);

    // For each pair (a, b)
    for (const aKey of genKeys) {
        // Skip conjugate generators (those ending in *)
        if (aKey.endsWith('*')) continue;

        for (const bKey of genKeys) {
            if (bKey.endsWith('*')) continue;

            const a = generators[aKey].q;
            const b = generators[bKey].q;
            const ab = QMath.multiply(a, b);

            // Try to find bp, ap such that ab = bp * ap
            let found = false;
            for (const bpKey of genKeys) {
                if (found) break;
                for (const apKey of genKeys) {
                    const bp = generators[bpKey].q;
                    const ap = generators[apKey].q;
                    const bpap = QMath.multiply(bp, ap);

                    // Check if equal or equal up to sign
                    if (QMath.areEqual(ab, bpap) || QMath.areEqual(ab, bpap.map(x => -x))) {
                        // Found a relation
                        const relKey = `${aKey},${bKey},${bpKey},${apKey}`;
                        if (!relationSet.has(relKey)) {
                            relationSet.add(relKey);
                            relations.push({ a: aKey, b: bKey, bp: bpKey, ap: apKey });
                        }
                        found = true;
                        break;
                    }
                }
            }
        }
    }

    console.log(`Found ${relations.length} relations`);
    return relations;
}

// Generate colors for generators
export function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 360 / count) % 360;
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
}

// Format quaternion for display
export function formatQuaternion(q) {
    const [w, x, y, z] = q;
    const parts = [];
    if (w !== 0) parts.push(String(w));
    const term = (coef, sym) => {
        if (coef === 0) return;
        const sign = coef > 0 ? (parts.length ? '+' : '') : '';
        const abs = Math.abs(coef);
        parts.push(`${sign}${coef < 0 ? '-' : ''}${abs}${sym}`);
    };
    term(x, 'i');
    term(y, 'j');
    term(z, 'k');
    return parts.length > 0 ? parts.join('') : '0';
}
