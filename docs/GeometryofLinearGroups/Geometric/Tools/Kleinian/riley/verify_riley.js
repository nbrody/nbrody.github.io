
const Polynomial = require('./polynomial.js');

// Mock the Polynomial class if it's not fully compatible with node (it should be fine though)
// Actually, I need to read polynomial.js first to make sure it exports correctly or just copy it.
// I'll assume I can require it if I'm in the same directory, but I'm not.
// I will paste a minimal Polynomial class here for the script.

class Poly {
    constructor(coeffs) {
        this.coeffs = coeffs; // [c0, c1, c2...]
    }

    static fromConstant(c) {
        return new Poly([c]);
    }

    add(other) {
        const len = Math.max(this.coeffs.length, other.coeffs.length);
        const newCoeffs = new Array(len).fill(0);
        for (let i = 0; i < len; i++) {
            const a = this.coeffs[i] || 0;
            const b = other.coeffs[i] || 0;
            newCoeffs[i] = a + b;
        }
        return new Poly(newCoeffs);
    }

    subtract(other) {
        const len = Math.max(this.coeffs.length, other.coeffs.length);
        const newCoeffs = new Array(len).fill(0);
        for (let i = 0; i < len; i++) {
            const a = this.coeffs[i] || 0;
            const b = other.coeffs[i] || 0;
            newCoeffs[i] = a - b;
        }
        return new Poly(newCoeffs);
    }

    multiply(other) {
        const newLen = this.coeffs.length + other.coeffs.length - 1;
        const newCoeffs = new Array(newLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                newCoeffs[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }
        return new Poly(newCoeffs);
    }

    toString() {
        return this.coeffs.map((c, i) => c !== 0 ? `${c}z^${i}` : '').filter(x => x).join(' + ');
    }
}

// Matrix mult
function matMul(A, B) {
    return [
        [A[0][0].multiply(B[0][0]).add(A[0][1].multiply(B[1][0])), A[0][0].multiply(B[0][1]).add(A[0][1].multiply(B[1][1]))],
        [A[1][0].multiply(B[0][0]).add(A[1][1].multiply(B[1][0])), A[1][0].multiply(B[0][1]).add(A[1][1].multiply(B[1][1]))]
    ];
}

function matTrace(A) {
    return A[0][0].add(A[1][1]);
}

// Generators from rileyPolynomials.js
// L = [[1, 0], [z, 1]]
// R = [[1, z], [0, 1]]
// But wait, the polynomials in the file are in terms of z, but maybe z represents something else?
// Let's try to match Q(0/1) = 2 - z^2.
// If we use L as defined, tr(L) = 2.
// If we use L = [[1, 0], [-z^2, 1]], tr(L) = 2.

// Let's try the generators from the HTML description:
// S = [[0, -1], [1, 0]]
// T = [[1, z], [0, 1]] (using z instead of t)

const zero = new Poly([0]);
const one = new Poly([1]);
const mone = new Poly([-1]);
const z = new Poly([0, 1]); // z
const z2 = new Poly([0, 0, 1]); // z^2

const S = [
    [zero, mone],
    [one, zero]
];

const T = [
    [one, z],
    [zero, one]
];

// Let's compute traces of some words
// 0/1 -> S?
// 1/1 -> T?
// 1/0 -> ?

console.log("Tr(S):", matTrace(S).toString());
console.log("Tr(T):", matTrace(T).toString());

const ST = matMul(S, T);
console.log("Tr(ST):", matTrace(ST).toString());

const STS = matMul(matMul(S, T), S);
console.log("Tr(STS):", matTrace(STS).toString());

const TST = matMul(matMul(T, S), T);
console.log("Tr(TST):", matTrace(TST).toString());

const STinv = matMul(S, [[one, new Poly([0, -1])], [zero, one]]); // ST^-1
console.log("Tr(ST^-1):", matTrace(STinv).toString());


// Let's try to match the polynomials:
// Q(0/1) = 2 - z^2
// Q(1/1) = 2 + z^2
// Q(1/2) = 2 + z^4

// Maybe the variable in the polynomial is not the trace parameter directly?
// What if the generators are:
// A = [[1, 0], [w, 1]]
// B = [[1, w], [0, 1]]
// where w = z (from polynomial).
// Then tr(AB) = 2 + w^2. Matches Q(1/1) if we identify 1/1 with AB?
// tr(A) = 2.
// tr(B) = 2.

// What if 0/1 corresponds to A B^-1?
// A B^-1 = [[1, 0], [w, 1]] [[1, -w], [0, 1]] = [[1, -w], [w, -w^2 + 1]].
// Trace = 2 - w^2. Matches Q(0/1)!

// So:
// 0/1 -> A B^-1 (Trace 2 - z^2)
// 1/1 -> A B (Trace 2 + z^2)
// Let's check 1/2.
// 1/2 is the mediant.
// Maybe it corresponds to A B A B^-1?
// Or maybe the words concatenate?
// 0/1 (L) -> A B^-1
// 1/1 (R) -> A B
// 1/2 (LR) -> (A B^-1) (A B) = A B^-1 A B.
// Let's check trace of A B^-1 A B.

const A = [
    [one, zero],
    [z, one]
];
const B = [
    [one, z],
    [zero, one]
];

const Binv = [
    [one, new Poly([0, -1])],
    [zero, one]
];

const W_0_1 = matMul(A, Binv);
console.log("Tr(W_0_1):", matTrace(W_0_1).toString()); // Should be 2 - z^2

const W_1_1 = matMul(A, B);
console.log("Tr(W_1_1):", matTrace(W_1_1).toString()); // Should be 2 + z^2

const W_1_2 = matMul(W_0_1, W_1_1);
console.log("Tr(W_1_2) (product):", matTrace(W_1_2).toString());

// Let's check if the recursion holds for traces.
// Tr(XY) = Tr(X)Tr(Y) - Tr(XY^-1)
// We want Q(1/2) = 8 - Q(0/1)Q(1/1) - Q(diff).
// Diff of 1/2 is (1-0)/(2-1) = 1/1.
// So Q(1/2) = 8 - Q(0/1)Q(1/1) - Q(1/1).
// Let's check if this matches 2 + z^4.
// Q(0/1) = 2 - z^2
// Q(1/1) = 2 + z^2
// 8 - (2-z^2)(2+z^2) - (2+z^2)
// = 8 - (4 - z^4) - 2 - z^2
// = 8 - 4 + z^4 - 2 - z^2
// = 2 + z^4 - z^2.
// This is NOT 2 + z^4.
// The code says Q(1/2) = 2 + z^4.
// So the recursion in the code gives 2 + z^4.
// My manual calculation of the recursion:
// 8 - (2-z^2)(2+z^2) - Q(diff)
// diff of 1/2 is 1/1?
// p=1, q=2.
// Neighbors: 0/1 and 1/1.
// diffP = |1-0| = 1.
// diffQ = |1-1| = 0.
// Wait, diff is (b-a)/(d-c).
// Neighbors of 1/2 are 0/1 and 1/1.
// a=0, c=1. b=1, d=1.
// diff = (1-0)/(1-1) = 1/0.
// 1/0 is infinity.
// The code handles this?
// In the code:
// diffP = Math.abs(f2.p - f1.p) = 1.
// diffQ = Math.abs(f2.q - f1.q) = 0.
// "if (diff.q === 0) continue;"
// So it skips this pair!
// It must find another pair.
// For 1/2, are there other neighbors?
// 0/1 and 1/1 are the only parents in Farey tree.
// But maybe it uses other neighbors?
// Ah, 1/2 neighbors:
// 0/1 (0/1 < 1/2)
// 1/1 (1/2 < 1/1)
// Is there another?
// Maybe 1/0?
// The code iterates `denom < q`.
// For q=2, denom=1.
// fractions: 0/1, 1/1.
// Pairs: (0/1, 1/1).
// Mediant: 1/2.
// Diff: 1/0.
// Code skips 1/0.
// So how does it compute 1/2?
// "if (p === 1 && q === 2)" -> Base case!
// Line 47 in rileyPolynomials.js:
// "if (p === 1 && q === 2) ... return poly;"
// So 1/2 is a base case.

// Let's look at 1/3.
// Neighbors: 0/1 and 1/2.
// Mediant: 1/3.
// Diff: (1-0)/(2-1) = 1/1.
// So Q(1/3) = 8 - Q(0/1)Q(1/2) - Q(1/1).
// Q(0/1) = 2 - z^2
// Q(1/2) = 2 + z^4
// Q(1/1) = 2 + z^2
// Q(1/3) = 8 - (2-z^2)(2+z^4) - (2+z^2)
// = 8 - (4 + 2z^4 - 2z^2 - z^6) - 2 - z^2
// = 8 - 4 - 2z^4 + 2z^2 + z^6 - 2 - z^2
// = 2 + z^2 - 2z^4 + z^6.

// Now let's check if there is a word W for 1/3 such that tr(W) = Q(1/3).
// 0/1 -> A B^-1
// 1/2 -> ?
// 1/1 -> A B

// Hypothesis:
// The word for p/q is $W_{p/q}$.
// $W_{mediant} = W_{left} W_{right}$.
// Then $Q(mediant) = \text{tr}(W_{left} W_{right})$?
// If $Q = \text{tr}$, then $Q_{med} = Q_L Q_R - Q_{diff}$.
// But we have $Q_{med} = 8 - Q_L Q_R - Q_{diff}$.
// This suggests $Q = -\text{tr}$?
// If $Q = -\text{tr}$, then $-\text{tr}_{med} = 8 - (-\text{tr}_L)(-\text{tr}_R) - (-\text{tr}_{diff})$.
// $-\text{tr}_{med} = 8 - \text{tr}_L \text{tr}_R + \text{tr}_{diff}$.
// $\text{tr}_{med} = \text{tr}_L \text{tr}_R - \text{tr}_{diff} - 8$.
// Still not matching $\text{tr}_{med} = \text{tr}_L \text{tr}_R - \text{tr}_{diff}$.
// Unless the "8" comes from the trace of the identity or something?
// Or maybe $Q = C - \text{tr}$?
// Let $Q = 2 - \text{tr}$. (Wait, I tried this before).
// $2 - \text{tr}_{med} = 8 - (2-\text{tr}_L)(2-\text{tr}_R) - (2-\text{tr}_{diff})$.
// $2 - \text{tr}_{med} = 8 - (4 - 2\text{tr}_L - 2\text{tr}_R + \text{tr}_L\text{tr}_R) - 2 + \text{tr}_{diff}$.
// $2 - \text{tr}_{med} = 2 + 2\text{tr}_L + 2\text{tr}_R - \text{tr}_L\text{tr}_R + \text{tr}_{diff}$.
// $\text{tr}_{med} = \text{tr}_L\text{tr}_R - \text{tr}_{diff} - 2\text{tr}_L - 2\text{tr}_R$.
// Still no.

// What if the recursion is different?
// Maybe $Q(p/q)$ is not the trace of $W_{p/q}$ but related?
// The "8" is very suspicious.
// 8 = 2 * 2 * 2?
// Maybe it's related to the dimension?

// Let's check the script output for traces of A B^-1 and A B.
