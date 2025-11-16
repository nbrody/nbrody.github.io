/**
 * Matrix utility functions
 */

import { Rational } from './rational.js';

/**
 * Multiply two 2x2 rational matrices
 */
export function multiplyMatrices(m1, m2) {
    return [
        [
            m1[0][0].mul(m2[0][0]).add(m1[0][1].mul(m2[1][0])),
            m1[0][0].mul(m2[0][1]).add(m1[0][1].mul(m2[1][1]))
        ],
        [
            m1[1][0].mul(m2[0][0]).add(m1[1][1].mul(m2[1][0])),
            m1[1][0].mul(m2[0][1]).add(m1[1][1].mul(m2[1][1]))
        ]
    ];
}

/**
 * Invert a 2x2 rational matrix
 */
export function invertMatrix(m) {
    // For matrix [[a, b], [c, d]], inverse is (1/det) * [[d, -b], [-c, a]]
    const det = m[0][0].mul(m[1][1]).sub(m[0][1].mul(m[1][0]));

    if (det.numerator === 0) {
        throw new Error('Matrix is singular (determinant is zero)');
    }

    const detInv = new Rational(det.denominator, det.numerator);

    return [
        [m[1][1].mul(detInv), m[0][1].neg().mul(detInv)],
        [m[1][0].neg().mul(detInv), m[0][0].mul(detInv)]
    ];
}

/**
 * Convert matrix to string for comparison
 */
export function matrixToString(m) {
    return `${m[0][0].toString()},${m[0][1].toString()},${m[1][0].toString()},${m[1][1].toString()}`;
}

/**
 * Compute prime factorization of a positive integer
 */
export function primeFactors(n) {
    n = Math.abs(Math.floor(n));
    if (n <= 1) return [];

    const factors = [];
    let d = 2;

    while (d * d <= n) {
        while (n % d === 0) {
            if (!factors.includes(d)) {
                factors.push(d);
            }
            n /= d;
        }
        d++;
    }

    if (n > 1) {
        factors.push(n);
    }

    return factors;
}

/**
 * Get all primes that appear in denominators of matrix entries
 * or in the numerator of the determinant
 */
export function getInvertedPrimes(matrices) {
    const primes = new Set();

    for (const matrix of matrices) {
        // Extract primes from denominators of matrix entries
        for (const row of matrix) {
            for (const entry of row) {
                if (entry.denominator > 1) {
                    const factors = primeFactors(entry.denominator);
                    factors.forEach(p => primes.add(p));
                }
            }
        }

        // Compute determinant: ad - bc
        const a = matrix[0][0];
        const b = matrix[0][1];
        const c = matrix[1][0];
        const d = matrix[1][1];

        const det = a.mul(d).sub(b.mul(c));

        // Extract primes from numerator of determinant
        // (these appear in denominator when taking inverse)
        if (det.numerator !== 0) {
            const factors = primeFactors(Math.abs(det.numerator));
            factors.forEach(p => primes.add(p));
        }

        // Also extract primes from denominator of determinant
        if (det.denominator > 1) {
            const factors = primeFactors(det.denominator);
            factors.forEach(p => primes.add(p));
        }
    }

    return Array.from(primes).sort((a, b) => a - b);
}

/**
 * Get primes used by a single matrix
 */
export function getPrimesUsedByMatrix(matrix) {
    const primes = new Set();

    // Extract primes from denominators of matrix entries
    for (const row of matrix) {
        for (const entry of row) {
            if (entry.denominator > 1) {
                const factors = primeFactors(entry.denominator);
                factors.forEach(p => primes.add(p));
            }
        }
    }

    // Compute determinant
    const a = matrix[0][0];
    const b = matrix[0][1];
    const c = matrix[1][0];
    const d = matrix[1][1];

    const det = a.mul(d).sub(b.mul(c));

    // Extract primes from numerator of determinant
    if (det.numerator !== 0) {
        const factors = primeFactors(Math.abs(det.numerator));
        factors.forEach(p => primes.add(p));
    }

    // Also extract primes from denominator of determinant
    if (det.denominator > 1) {
        const factors = primeFactors(det.denominator);
        factors.forEach(p => primes.add(p));
    }

    return Array.from(primes);
}

/**
 * Check if a matrix avoids a set of primes (doesn't use any of them)
 */
export function matrixAvoidsPrimes(matrix, primesToAvoid) {
    const usedPrimes = getPrimesUsedByMatrix(matrix);
    return !usedPrimes.some(p => primesToAvoid.has(p));
}

/**
 * Check if a rational number is a unit in the localization A
 * A rational a/b (in lowest terms) is a unit in A = Z[1/p : p in S] if and only if
 * both a and b only have prime factors from S (the inverted primes).
 *
 * primesToAvoid are the primes NOT inverted, so invertedPrimes = all primes - primesToAvoid
 */
export function isUnitInA(rational, primesToAvoid) {
    const num = Math.abs(rational.numerator);
    const denom = rational.denominator;

    // Get prime factors of numerator and denominator
    const numFactors = primeFactors(num);
    const denomFactors = primeFactors(denom);

    // Check if any prime factor is in the "avoid" set
    // (i.e., check if all prime factors are in the inverted set)
    const allFactors = [...new Set([...numFactors, ...denomFactors])];

    // All prime factors must be inverted (NOT in primesToAvoid)
    return !allFactors.some(p => primesToAvoid.has(p));
}

/**
 * Get the power of a prime p in the denominator of a rational number
 */
function getPowerInDenominator(rational, prime) {
    let d = rational.denominator;
    let power = 0;
    while (d % prime === 0) {
        power++;
        d /= prime;
    }
    return power;
}

/**
 * Compute the distance of a matrix from the identity in the product of p-adic trees
 * Distance is a + b where the matrix can be written as 1/2^a * 1/3^b * (integer matrix)
 * This is the maximum power of 2 and 3 appearing in denominators of matrix entries
 */
export function getMatrixDistance(matrix) {
    let maxPowerOf2 = 0;
    let maxPowerOf3 = 0;

    for (const row of matrix) {
        for (const entry of row) {
            maxPowerOf2 = Math.max(maxPowerOf2, getPowerInDenominator(entry, 2));
            maxPowerOf3 = Math.max(maxPowerOf3, getPowerInDenominator(entry, 3));
        }
    }

    return maxPowerOf2 + maxPowerOf3;
}
