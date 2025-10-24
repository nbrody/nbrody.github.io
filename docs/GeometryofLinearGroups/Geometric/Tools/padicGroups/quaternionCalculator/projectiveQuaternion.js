// ProjectiveQuaternion class
// Represents quaternions in the projective space (identifies q ~ λq for any real λ ≠ 0)

export class ProjectiveQuaternion {
    constructor(w, x, y, z) {
        // Store in normalized form
        const [nw, nx, ny, nz] = ProjectiveQuaternion.normalize([w, x, y, z]);
        this.w = nw;
        this.x = nx;
        this.y = ny;
        this.z = nz;
    }

    // Create from array
    static fromArray(arr) {
        return new ProjectiveQuaternion(arr[0], arr[1], arr[2], arr[3]);
    }

    // Normalize to canonical form
    // Choose the representative with positive first non-zero component
    // and optionally with norm 1 (or smallest integer norm)
    static normalize(q) {
        let [w, x, y, z] = q;

        // Find first non-zero component
        const firstNonZeroIdx = q.findIndex(c => Math.abs(c) > 1e-10);
        if (firstNonZeroIdx === -1) {
            return [0, 0, 0, 0]; // Zero quaternion
        }

        // Make first non-zero component positive
        if (q[firstNonZeroIdx] < 0) {
            w = -w;
            x = -x;
            y = -y;
            z = -z;
        }

        // Optionally: normalize to unit length for numerical stability
        // (or keep as integers for exact computation)
        // For now, keep as-is to preserve integer structure

        return [w, x, y, z];
    }

    // Get as array
    toArray() {
        return [this.w, this.x, this.y, this.z];
    }

    // Get as formatted string
    toString() {
        const parts = [];
        if (Math.abs(this.w) > 1e-10) parts.push(this.w.toString());

        const addTerm = (coef, sym) => {
            if (Math.abs(coef) < 1e-10) return;
            const sign = coef > 0 ? (parts.length ? '+' : '') : '';
            const abs = Math.abs(coef);
            parts.push(`${sign}${coef < 0 ? '-' : ''}${abs}${sym}`);
        };

        addTerm(this.x, 'i');
        addTerm(this.y, 'j');
        addTerm(this.z, 'k');

        return parts.length > 0 ? parts.join('') : '0';
    }

    // Norm squared
    normSq() {
        return this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z;
    }

    // Conjugate
    conjugate() {
        return new ProjectiveQuaternion(this.w, -this.x, -this.y, -this.z);
    }

    // Multiply two projective quaternions
    multiply(other) {
        const [w1, x1, y1, z1] = [this.w, this.x, this.y, this.z];
        const [w2, x2, y2, z2] = [other.w, other.x, other.y, other.z];

        return new ProjectiveQuaternion(
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        );
    }

    // Check equality in projective space
    // q1 ~ q2 iff q1 = λ·q2 for some real λ
    equals(other, epsilon = 1e-9) {
        // Check if they're proportional
        // Find a non-zero component in each
        const q1 = this.toArray();
        const q2 = other.toArray();

        // Find first non-zero in q1
        let idx1 = q1.findIndex(c => Math.abs(c) > epsilon);
        if (idx1 === -1) return q2.every(c => Math.abs(c) < epsilon);

        // Find corresponding component in q2
        if (Math.abs(q2[idx1]) < epsilon) return false;

        // Compute ratio
        const ratio = q2[idx1] / q1[idx1];

        // Check if all components match this ratio
        for (let i = 0; i < 4; i++) {
            if (Math.abs(q1[i] * ratio - q2[i]) > epsilon) {
                return false;
            }
        }

        return true;
    }

    // Hash for use in sets/maps
    // Since we normalize, we can use the normalized values
    hash() {
        // Round to avoid floating point issues
        const round = (x) => Math.round(x * 1e6) / 1e6;
        return `${round(this.w)},${round(this.x)},${round(this.y)},${round(this.z)}`;
    }

    // Act on a pure quaternion (0, x, y, z) by conjugation
    // Returns: this * v * this^(-1)
    act(v) {
        const vQuat = Array.isArray(v) ? ProjectiveQuaternion.fromArray(v) : v;
        const thisInv = this.inverse();
        return this.multiply(vQuat).multiply(thisInv);
    }

    // Inverse
    inverse() {
        const n2 = this.normSq();
        if (n2 === 0) {
            throw new Error("Cannot invert zero quaternion");
        }
        return new ProjectiveQuaternion(
            this.w / n2,
            -this.x / n2,
            -this.y / n2,
            -this.z / n2
        );
    }
}

// Helper functions for working with ProjectiveQuaternion

// Generate all projective quaternions of norm p
export function generateProjectiveQuaternionsOfNorm(p) {
    const quaternions = [];
    const maxCoeff = Math.ceil(Math.sqrt(p));
    const seen = new Set();

    for (let w = -maxCoeff; w <= maxCoeff; w++) {
        for (let x = -maxCoeff; x <= maxCoeff; x++) {
            for (let y = -maxCoeff; y <= maxCoeff; y++) {
                for (let z = -maxCoeff; z <= maxCoeff; z++) {
                    if (w*w + x*x + y*y + z*z === p) {
                        const pq = new ProjectiveQuaternion(w, x, y, z);
                        const hash = pq.hash();
                        if (!seen.has(hash)) {
                            seen.add(hash);
                            quaternions.push(pq);
                        }
                    }
                }
            }
        }
    }

    return quaternions;
}

// Compute relations between projective quaternions
export function computeProjectiveRelations(generators) {
    const relations = [];
    const genKeys = Object.keys(generators);
    const relationSet = new Set();

    console.log(`Computing projective relations for ${genKeys.length} generators...`);

    // For each pair (a, b)
    for (const aKey of genKeys) {
        if (aKey.endsWith('*')) continue;

        for (const bKey of genKeys) {
            if (bKey.endsWith('*')) continue;

            const a = generators[aKey].pq;
            const b = generators[bKey].pq;
            const ab = a.multiply(b);

            // Try to find bp, ap such that ab ~ bp * ap
            let found = false;
            for (const bpKey of genKeys) {
                if (found) break;
                for (const apKey of genKeys) {
                    const bp = generators[bpKey].pq;
                    const ap = generators[apKey].pq;
                    const bpap = bp.multiply(ap);

                    if (ab.equals(bpap)) {
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

    console.log(`Found ${relations.length} projective relations`);
    return relations;
}
