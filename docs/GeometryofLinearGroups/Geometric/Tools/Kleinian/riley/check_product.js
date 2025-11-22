
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

// Words found
// 0/1: STST
// 1/1: STSt

function getMatrix(word) {
    let M = [[one, zero], [zero, one]]; // Identity
    for (const char of word) {
        if (char === 'S') M = matMul(M, S);
        else if (char === 'T') M = matMul(M, T);
        else if (char === 's') M = matMul(M, Sinv);
        else if (char === 't') M = matMul(M, Tinv);
    }
    return M;
}

const W01 = getMatrix('STST');
const W11 = getMatrix('STSt'); // t = T^-1

console.log("Tr(W01):", matTrace(W01).toString());
console.log("Tr(W11):", matTrace(W11).toString());

const W12 = matMul(W01, W11);
console.log("Tr(W12) = Tr(W01 * W11):", matTrace(W12).toString());

const target12 = new Polynomial([2, 0, 0, 0, 1]); // 2 + z^4
console.log("Target 1/2:", target12.toString());

// Check if Tr(W12) matches target (up to sign)
const diff = matTrace(W12).subtract(target12);
console.log("Diff:", diff.toString());

const sum = matTrace(W12).add(target12);
console.log("Sum:", sum.toString());
