// Prime Quaternion Filters
// Implements the filtering approach from primeQuaternions.html
// to get canonical representatives of quaternions of norm p

import { ProjectiveQuaternion } from './projectiveQuaternion.js';

/**
 * Find a solution (x, y) to x² + y² ≡ -1 (mod p)
 * When p ≡ 1 (mod 4), we use y = 0 and find x² ≡ -1 (mod p)
 * This solution establishes a bijection between F_p P¹ and quaternions of norm p
 */
export function findXYSolution(p) {
    // When p ≡ 1 (mod 4), use y = 0
    if (p % 4 === 1) {
        for (let x = 1; x < p; x++) {
            if ((x * x) % p === (p - 1)) {
                console.log(`p=${p} ≡ 1 (mod 4): Using y=0, found x=${x} where x² ≡ -1 (mod ${p})`);
                console.log(`  Verification: ${x}² = ${x*x} ≡ ${(x*x) % p} (mod ${p})`);
                return { x, y: 0 };
            }
        }
    }

    // Otherwise, find general solution
    for (let x = 0; x < p; x++) {
        for (let y = 1; y < p; y++) {  // Start y from 1 to prefer non-zero y
            if ((x * x + y * y) % p === (p - 1)) {
                console.log(`Found solution for p=${p}: (x,y) = (${x},${y}), verification: ${x}² + ${y}² = ${x*x + y*y} ≡ ${(x*x + y*y) % p} (mod ${p})`);
                return { x, y };
            }
        }
    }
    return null; // Should not happen for odd primes
}

/**
 * Given a solution (x₀, y₀) to x² + y² ≡ -1 (mod p),
 * this determines an isomorphism from the F_p quaternion algebra to M_2(F_p).
 *
 * The quaternion q = a + bi + cj + dk maps to a 2×2 matrix.
 * Elements of norm p correspond to rank 1 matrices (trace p, determinant 0).
 * A rank 1 matrix annihilates a 1-dimensional subspace of F_p²,
 * which corresponds to a point in F_p P¹.
 */

/**
 * Compute the 2×2 matrix representation of a quaternion modulo p
 * using the solution (x₀, y₀) to x² + y² ≡ -1 (mod p)
 *
 * Matrix basis:
 *   1 → [[1, 0], [0, 1]]
 *   i → [[x, y], [y, -x]]
 *   j → [[-y, x], [x, y]]
 *   k = ij → [[0, -1], [1, 0]]
 *
 * So q = a + bi + cj + dk maps to:
 *   [[a + bx - cy,  by + cx - d],
 *    [by + cx + d,  a - bx + cy]]
 */
function quaternionToMatrix(q, x0, y0, p) {
    const [a, b, c, d] = q;

    const m11 = ((a + b * x0 - c * y0) % p + p) % p;
    const m12 = ((b * y0 + c * x0 - d) % p + p) % p;
    const m21 = ((b * y0 + c * x0 + d) % p + p) % p;
    const m22 = ((a - b * x0 + c * y0) % p + p) % p;

    return [[m11, m12], [m21, m22]];
}

/**
 * Modular inverse using extended Euclidean algorithm
 */
function modInverse(a, m) {
    a = ((a % m) + m) % m;
    let [old_r, r] = [a, m];
    let [old_s, s] = [1, 0];

    while (r !== 0) {
        const quotient = Math.floor(old_r / r);
        [old_r, r] = [r, old_r - quotient * r];
        [old_s, s] = [s, old_s - quotient * s];
    }

    return old_r === 1 ? ((old_s % m) + m) % m : null;
}

/**
 * Convert projective coordinates [x:y] to F_p P¹ label {0, 1, ..., p-1, ∞}
 */
function projectiveToP1Label(x, y, p) {
    // [1:0] → ∞
    if (y === 0) {
        return '∞';
    }

    // [x:y] where y≠0 → x * y^(-1) mod p
    const yInv = modInverse(y, p);
    if (yInv === null) {
        return '∞'; // Shouldn't happen if y≠0
    }

    const label = (x * yInv) % p;
    return label.toString();
}

/**
 * Find the kernel of a 2×2 matrix over F_p
 * Returns a point in P¹(F_p) as an element of {0, 1, ..., p-1, ∞}
 */
function matrixKernel(matrix, p) {
    const [[a, b], [c, d]] = matrix;

    // Find non-zero vector in kernel: [[a,b],[c,d]] · [[x],[y]] = [[0],[0]]
    // This gives: ax + by ≡ 0 (mod p) and cx + dy ≡ 0 (mod p)

    // Try to find a solution [x:y] where not both are 0

    // If first row is [0,0], kernel is all of F_p²
    if (a === 0 && b === 0) {
        return { x: 1, y: 0, p1Label: '∞' };
    }

    // If b ≠ 0, we can solve for y in terms of x
    // ax + by = 0 => y = -a/b · x
    // Choose x = b, y = -a (to avoid division)
    if (b !== 0) {
        const x = b;
        const y = (-a % p + p) % p;
        const p1Label = projectiveToP1Label(x, y, p);
        return { x, y, p1Label };
    }

    // If b = 0 and a ≠ 0, then ax = 0 => x = 0
    // So kernel is [0:1]
    if (a !== 0) {
        return { x: 0, y: 1, p1Label: '0' };
    }

    // Shouldn't reach here for rank 1 matrices
    return { x: 1, y: 0, p1Label: '∞' };
}

/**
 * Compute the bijection from F_p P¹ to quaternions of norm p
 * via the matrix representation and kernel computation
 */
export function computeP1ToQuaternionBijection(p, xy = null) {
    if (!xy) {
        xy = findXYSolution(p);
    }
    if (!xy) return [];

    const { x: x0, y: y0 } = xy;

    // We'll compute this by going through all quaternions of norm p
    // and finding their kernels
    // This is the inverse direction - we'll build the map as we filter

    return { x0, y0 }; // Return the solution for use in matching
}

/**
 * Find all integer quaternions (a,b,c,d) where a²+b²+c²+d² = p
 */
export async function findAllQuaternions(p, progressCallback = null) {
    const quats = [];
    const limit = Math.floor(Math.sqrt(p));
    const total = 2 * limit + 1;
    let progress = 0;

    for (let a = -limit; a <= limit; a++) {
        if (progressCallback) {
            progress++;
            progressCallback(progress / total);
        }
        // Allow UI to update by yielding occasionally
        if (a % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        for (let b = -limit; b <= limit; b++) {
            for (let c = -limit; c <= limit; c++) {
                const d2 = p - (a * a + b * b + c * c);
                if (d2 >= 0) {
                    const d = Math.sqrt(d2);
                    if (Number.isInteger(d)) {
                        quats.push([a, b, c, d]);
                        if (d !== 0) {
                            quats.push([a, b, c, -d]);
                        }
                    }
                }
            }
        }
    }

    return quats;
}

/**
 * Filter quaternions to canonical representatives
 * Following primeQuaternions.html approach:
 * - a > 0 (positive real part)
 * - a is odd
 * - d is even
 * This removes Q8 orbit equivalents
 */
export function filterByQ8Orbit(quaternions) {
    return quaternions.filter(([a, b, c, d]) => {
        return a > 0 && (a & 1) === 1 && (d & 1) === 0;
    });
}

/**
 * Get the sign of the second non-zero coordinate
 * Used to choose between conjugate pairs
 */
function secondNonzeroSign(q) {
    let count = 0;
    for (const x of q) {
        if (x !== 0) {
            count++;
            if (count === 2) return Math.sign(x);
        }
    }
    return 0;
}

/**
 * Conjugate a quaternion
 */
function conjugate(q) {
    return [q[0], -q[1], -q[2], -q[3]];
}

/**
 * Remove conjugate pairs, keeping only one based on sign convention
 * Keeps the one with positive second nonzero coordinate
 */
export function removeConjugatePairs(quaternions) {
    const seen = new Set();
    const result = [];

    for (const q of quaternions) {
        const key = q.join(',');
        const conj = conjugate(q);
        const keyc = conj.join(',');

        if (seen.has(key) || seen.has(keyc)) continue;

        seen.add(key);
        seen.add(keyc);

        // Choose the one with positive second nonzero coordinate
        const s = secondNonzeroSign(q);
        const chosen = (s >= 0) ? q : conj;
        result.push(chosen);
    }

    return result;
}

/**
 * Match a quaternion to its P¹ coordinate using the matrix representation
 * and kernel computation
 * Returns a label in {0, 1, ..., p-1, ∞}
 */
export function matchQuaternionToP1(q, x0, y0, p) {
    // Convert quaternion to matrix representation
    const matrix = quaternionToMatrix(q, x0, y0, p);

    // Find the kernel of this matrix
    const kernel = matrixKernel(matrix, p);

    return kernel.p1Label;
}

/**
 * Generate canonical generators for a prime p
 * This is the main function that implements the primeQuaternions.html approach
 * Returns p+1 generators with P¹ labels (conjugate pairs both included)
 */
export async function generateCanonicalGenerators(p, progressCallback = null) {
    console.log(`Generating canonical generators for prime ${p}...`);

    // Step 1: Find solution to x² + y² ≡ -1 (mod p)
    const xy = findXYSolution(p);
    console.log(`  Found solution to x²+y²≡-1 (mod ${p}): (x,y) = (${xy.x}, ${xy.y})`);

    // Step 2: Compute bijection from F_p P¹ to quaternions
    const bijection = computeP1ToQuaternionBijection(p, xy);
    console.log(`  Computed bijection: ${bijection.length} elements in F_p P¹`);

    // Step 3: Find all integer quaternions of norm p
    const allQuats = await findAllQuaternions(p, progressCallback);
    console.log(`  Found ${allQuats.length} total quaternions (expected: ${8 * (p + 1)})`);

    // Step 4: Label all quaternions with P¹ coordinates
    const labeled = allQuats.map(q => ({
        quaternion: q,
        p1Label: matchQuaternionToP1(q, bijection.x0, bijection.y0, p),
        prime: p
    }));

    // Step 5: Group by P¹ label
    const labelGroups = new Map();
    labeled.forEach(gen => {
        if (!labelGroups.has(gen.p1Label)) {
            labelGroups.set(gen.p1Label, []);
        }
        labelGroups.get(gen.p1Label).push(gen);
    });

    console.log(`  Found ${labelGroups.size} distinct P¹ labels (expected: ${p + 1})`);

    // Step 6: Select one canonical representative per P¹ label
    // Prefer quaternions satisfying Q8 orbit criteria when possible
    const canonical = [];
    labelGroups.forEach((gens, label) => {
        // Try to find one that passes Q8 filter: a > 0, a odd, d even
        let chosen = gens.find(g => {
            const [a, b, c, d] = g.quaternion;
            return a > 0 && (a & 1) === 1 && (d & 1) === 0;
        });

        // If none pass, prefer a > 0
        if (!chosen) {
            chosen = gens.find(g => g.quaternion[0] > 0);
        }

        // Otherwise take first
        if (!chosen) {
            chosen = gens[0];
        }

        canonical.push(chosen);
    });

    console.log(`  Final canonical generators: ${canonical.length} generators (expected: ${p + 1})`);
    const sortedLabels = Array.from(labelGroups.keys()).sort((a, b) => {
        if (a === '∞') return 1;
        if (b === '∞') return -1;
        return parseInt(a) - parseInt(b);
    });
    console.log(`  P¹ labels covered: ${sortedLabels.join(', ')}`);

    return canonical;
}

/**
 * Format a quaternion as a string (e.g., "1+2i+3j+4k")
 * Omits coefficient 1 for i,j,k (e.g., "i" instead of "1i")
 */
export function formatQuaternion(q) {
    const [a, b, c, d] = q;
    const parts = [];

    if (a !== 0) parts.push(`${a}`);

    if (b !== 0) {
        const sign = b > 0 && parts.length > 0 ? '+' : '';
        const coeff = Math.abs(b) === 1 ? '' : Math.abs(b);
        const neg = b < 0 ? '-' : '';
        parts.push(`${sign}${neg}${coeff}i`);
    }

    if (c !== 0) {
        const sign = c > 0 && parts.length > 0 ? '+' : '';
        const coeff = Math.abs(c) === 1 ? '' : Math.abs(c);
        const neg = c < 0 ? '-' : '';
        parts.push(`${sign}${neg}${coeff}j`);
    }

    if (d !== 0) {
        const sign = d > 0 && parts.length > 0 ? '+' : '';
        const coeff = Math.abs(d) === 1 ? '' : Math.abs(d);
        const neg = d < 0 ? '-' : '';
        parts.push(`${sign}${neg}${coeff}k`);
    }

    return parts.length > 0 ? parts.join('') : '0';
}

/**
 * Create generator object from canonical quaternions
 * Returns an object with both the quaternion and its conjugate
 */
export function createGeneratorObject(canonical, colors) {
    const generators = {};
    let colorIndex = 0;

    canonical.forEach((q, idx) => {
        const key = `g${idx + 1}`;
        const keyConj = `g${idx + 1}*`;

        generators[key] = {
            q: q,
            pq: ProjectiveQuaternion.fromArray(q),
            color: colors[colorIndex % colors.length],
            formatted: formatQuaternion(q)
        };

        generators[keyConj] = {
            q: conjugate(q),
            pq: ProjectiveQuaternion.fromArray(conjugate(q)),
            color: colors[colorIndex % colors.length],
            formatted: formatQuaternion(conjugate(q))
        };

        colorIndex++;
    });

    return generators;
}

/**
 * Generate all generators for multiple primes
 */
export async function generateGeneratorsForPrimes(primes, progressCallback = null) {
    const allCanonical = [];
    const totalPrimes = primes.length;

    for (let i = 0; i < primes.length; i++) {
        const p = primes[i];
        console.log(`\nProcessing prime ${i + 1}/${totalPrimes}: ${p}`);

        const canonical = await generateCanonicalGenerators(p, (progress) => {
            if (progressCallback) {
                const overallProgress = (i + progress) / totalPrimes;
                progressCallback(overallProgress, `Prime ${p}`);
            }
        });

        allCanonical.push({
            prime: p,
            generators: canonical
        });
    }

    return allCanonical;
}
