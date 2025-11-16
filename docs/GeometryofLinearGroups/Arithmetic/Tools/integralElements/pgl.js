/**
 * PGL(2,A) - Projective General Linear Group
 * Handles matrices modulo scalar multiplication
 */

import { Rational } from './rational.js';
import { multiplyMatrices, invertMatrix, matrixAvoidsPrimes } from './matrixUtils.js';

/**
 * Compute GCD of two integers using Euclidean algorithm
 */
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        const temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

/**
 * Compute GCD of an array of integers
 */
function gcdArray(arr) {
    if (arr.length === 0) return 1;
    return arr.reduce((acc, val) => gcd(acc, val), arr[0]);
}

/**
 * Compute LCM of two integers
 */
function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
}

/**
 * Compute LCM of an array of integers
 */
function lcmArray(arr) {
    if (arr.length === 0) return 1;
    return arr.reduce((acc, val) => lcm(acc, val), arr[0]);
}

/**
 * PGL element - represents an equivalence class of 2x2 matrices
 * Two matrices are equivalent if they differ by a nonzero scalar
 */
export class PGLElement {
    /**
     * Create a PGL element from a 2x2 matrix
     * Automatically normalizes to canonical form
     */
    constructor(matrix) {
        this.matrix = this.normalize(matrix);
    }

    /**
     * Normalize a matrix to canonical form
     * Strategy: Clear denominators, then divide by GCD of all entries
     * This gives a matrix with integer entries with GCD 1
     */
    normalize(matrix) {
        // Extract all numerators and denominators
        const entries = [
            matrix[0][0], matrix[0][1],
            matrix[1][0], matrix[1][1]
        ];

        // Find LCM of all denominators to clear them
        const denominators = entries.map(r => r.denominator);
        const commonDenom = lcmArray(denominators);

        // Multiply all entries by commonDenom to get integers
        const intEntries = entries.map(r => r.numerator * (commonDenom / r.denominator));

        // Find GCD of all integer entries
        const nonzeroEntries = intEntries.filter(x => x !== 0);
        if (nonzeroEntries.length === 0) {
            throw new Error('Zero matrix is not in PGL');
        }

        const entriesGCD = gcdArray(nonzeroEntries.map(Math.abs));

        // Divide by GCD to get canonical form
        const normalized = [
            [
                new Rational(intEntries[0] / entriesGCD, 1),
                new Rational(intEntries[1] / entriesGCD, 1)
            ],
            [
                new Rational(intEntries[2] / entriesGCD, 1),
                new Rational(intEntries[3] / entriesGCD, 1)
            ]
        ];

        // Ensure consistent sign: make first nonzero entry positive
        let firstNonzero = null;
        for (let i = 0; i < 4; i++) {
            const row = Math.floor(i / 2);
            const col = i % 2;
            if (normalized[row][col].numerator !== 0) {
                firstNonzero = normalized[row][col];
                break;
            }
        }

        if (firstNonzero && firstNonzero.numerator < 0) {
            // Negate all entries
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 2; j++) {
                    normalized[i][j] = normalized[i][j].neg();
                }
            }
        }

        return normalized;
    }

    /**
     * Get string representation for comparison
     */
    toString() {
        const m = this.matrix;
        return `[${m[0][0]}, ${m[0][1]}, ${m[1][0]}, ${m[1][1]}]`;
    }

    /**
     * Check equality with another PGL element
     */
    equals(other) {
        if (!(other instanceof PGLElement)) return false;

        const m1 = this.matrix;
        const m2 = other.matrix;

        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                if (!m1[i][j].equals(m2[i][j])) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Get a representative matrix (the normalized one)
     */
    getMatrix() {
        return this.matrix;
    }

    /**
     * Check if this element is in PGL(2,A) for a given localization
     * (i.e., avoids certain primes)
     */
    isInPGLA(primesToAvoid = new Set()) {
        return matrixAvoidsPrimes(this.matrix, primesToAvoid);
    }

    /**
     * Multiply two PGL elements
     */
    multiply(other) {
        const product = multiplyMatrices(this.matrix, other.matrix);
        return new PGLElement(product);
    }

    /**
     * Invert a PGL element
     */
    inverse() {
        const inv = invertMatrix(this.matrix);
        return new PGLElement(inv);
    }
}

/**
 * Create PGL element from matrix
 */
export function toPGL(matrix) {
    return new PGLElement(matrix);
}

/**
 * Check if matrix is in PGL(2,A) (just checks if entries avoid primes)
 */
export function isInPGLA(matrix, primesToAvoid = new Set()) {
    const pglElem = new PGLElement(matrix);
    return matrixAvoidsPrimes(pglElem.matrix, primesToAvoid);
}
