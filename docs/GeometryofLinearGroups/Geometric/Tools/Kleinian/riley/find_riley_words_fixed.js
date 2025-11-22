
// Polynomial class for operations
class Polynomial {
    constructor(coeffs) {
        // coeffs[i] is coefficient of z^i
        this.coeffs = coeffs.slice();
        this.trim();
    }

    trim() {
        while (this.coeffs.length > 1 && Math.abs(this.coeffs[this.coeffs.length - 1]) < 1e-10) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) {
            this.coeffs = [0];
        }
    }

    static fromConstant(c) {
        return new Polynomial([c]);
    }

    add(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = new Array(maxLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            result[i] += this.coeffs[i];
        }
        for (let i = 0; i < other.coeffs.length; i++) {
            result[i] += other.coeffs[i];
        }
        return new Polynomial(result);
    }

    subtract(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = new Array(maxLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            result[i] += this.coeffs[i];
        }
        for (let i = 0; i < other.coeffs.length; i++) {
            result[i] -= other.coeffs[i];
        }
        return new Polynomial(result);
    }

    multiply(other) {
        const result = new Array(this.coeffs.length + other.coeffs.length - 1).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }
        return new Polynomial(result);
    }

    toString() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (Math.abs(coeff) < 1e-10) continue;

            let term = '';
            const absCoeff = Math.abs(coeff);

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1) {
                    term = 'z';
                } else {
                    term = `${absCoeff}z`;
                }
            } else {
                if (absCoeff === 1) {
                    term = `z^${i}`;
                } else {
                    term = `${absCoeff}z^${i}`;
                }
            }

            if (coeff < 0) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }
}

// Generators
// S = [[0, -1], [1, 0]]
// T = [[1, z], [0, 1]]

const zero = new Polynomial([0]);
const one = new Polynomial([1]);
const mone = new Polynomial([-1]);
const z = new Polynomial([0, 1]);

const S = [
    [zero, mone],
    [one, zero]
];

const T = [
    [one, z],
    [zero, one]
];

const Tinv = [
    [one, new Polynomial([0, -1])],
    [zero, one]
];

const Sinv = [
    [zero, one],
    [mone, zero]
];

// Matrix multiplication
function matMul(A, B) {
    return [
        [A[0][0].multiply(B[0][0]).add(A[0][1].multiply(B[1][0])), A[0][0].multiply(B[0][1]).add(A[0][1].multiply(B[1][1]))],
        [A[1][0].multiply(B[0][0]).add(A[1][1].multiply(B[1][0])), A[1][0].multiply(B[0][1]).add(A[1][1].multiply(B[1][1]))]
    ];
}

function matTrace(A) {
    return A[0][0].add(A[1][1]);
}

// Target polynomials
// Q(0/1) = 2 - z^2
// Q(1/1) = 2 + z^2
// Q(1/2) = 2 + z^4

const target01 = new Polynomial([2, 0, -1]);
const target11 = new Polynomial([2, 0, 1]);
const target12 = new Polynomial([2, 0, 0, 0, 1]);

// BFS for words
const queue = [
    { word: 'S', mat: S },
    { word: 'T', mat: T },
    { word: 's', mat: Sinv }, // s = S^-1
    { word: 't', mat: Tinv }  // t = T^-1
];

const visited = new Set();
// Limit depth
const maxDepth = 6;

console.log("Searching for words matching Riley polynomials...");

function checkMatch(poly, target, name) {
    // Check if poly == target or poly == -target
    const diff = poly.subtract(target);
    const isZero = diff.coeffs.every(c => Math.abs(c) < 1e-9);
    if (isZero) return 1;

    const sum = poly.add(target);
    const isZeroNeg = sum.coeffs.every(c => Math.abs(c) < 1e-9);
    if (isZeroNeg) return -1;

    return 0;
}

let found01 = false;
let found11 = false;
let found12 = false;

let count = 0;
while (queue.length > 0) {
    const current = queue.shift();
    const w = current.word;
    const M = current.mat;

    if (w.length > maxDepth) continue;

    const tr = matTrace(M);

    if (!found01) {
        const m = checkMatch(tr, target01, '0/1');
        if (m !== 0) {
            console.log(`Found match for 0/1: ${w} (sign: ${m})`);
            found01 = true;
        }
    }
    if (!found11) {
        const m = checkMatch(tr, target11, '1/1');
        if (m !== 0) {
            console.log(`Found match for 1/1: ${w} (sign: ${m})`);
            found11 = true;
        }
    }
    if (!found12) {
        const m = checkMatch(tr, target12, '1/2');
        if (m !== 0) {
            console.log(`Found match for 1/2: ${w} (sign: ${m})`);
            found12 = true;
        }
    }

    if (found01 && found11 && found12) break;

    // Add neighbors
    // Generators: S, T, s, t
    // Optimization: Don't invert previous generator (e.g. S s)
    const last = w[w.length - 1];

    if (last !== 's') queue.push({ word: w + 'S', mat: matMul(M, S) });
    if (last !== 't') queue.push({ word: w + 'T', mat: matMul(M, T) });
    if (last !== 'S') queue.push({ word: w + 's', mat: matMul(M, Sinv) });
    if (last !== 'T') queue.push({ word: w + 't', mat: matMul(M, Tinv) });
}

if (!found01) console.log("Did not find match for 0/1");
if (!found11) console.log("Did not find match for 1/1");
if (!found12) console.log("Did not find match for 1/2");
