const { Polynomial } = require('./polynomial.js');

/**
 * Riley word searcher using Beam Search.
 * 
 * Generators:
 * S = [[0, -1], [1, 0]]
 * T = [[1, z], [0, 1]]
 */

const zero = new Polynomial([0]);
const one = new Polynomial([1]);
const mone = new Polynomial([-1]);
const z = new Polynomial([0, 1]);

const S = [[zero, mone], [one, zero]];
const T = [[one, z], [zero, one]];
const Tinv = [[one, new Polynomial([0, -1])], [zero, one]];
const Sinv = [[zero, one], [mone, zero]];

const generators = [
    { name: 'S', mat: S },
    { name: 'T', mat: T },
    { name: 's', mat: Sinv },
    { name: 't', mat: Tinv }
];

function matMul(A, B) {
    return [
        [A[0][0].multiply(B[0][0]).add(A[0][1].multiply(B[1][0])), A[0][0].multiply(B[0][1]).add(A[0][1].multiply(B[1][1]))],
        [A[1][0].multiply(B[0][0]).add(A[1][1].multiply(B[1][0])), A[1][0].multiply(B[0][1]).add(A[1][1].multiply(B[1][1]))]
    ];
}

function matTrace(A) {
    return A[0][0].add(A[1][1]);
}

function checkMatch(poly, target) {
    const diff = poly.subtract(target);
    const isZero = diff.coeffs.every(c => Math.abs(c) < 1e-9);
    if (isZero) return 1;
    const sum = poly.add(target);
    const isZeroNeg = sum.coeffs.every(c => Math.abs(c) < 1e-9);
    if (isZeroNeg) return -1;
    return 0;
}

/**
 * Beam Search algorithm to find words matching a target polynomial trace.
 * Uses polynomial evaluation at a sample point as a heuristic.
 */
function beamSearch(target, beamWidth = 500, maxDepth = 24) {
    const z0 = 2.5;
    const targetVal = target.evaluateComplex(z0, 0).re;
    const identityMat = [[one, zero], [zero, one]];
    let beam = [{ word: '', mat: identityMat, score: Infinity }];

    for (let depth = 1; depth <= maxDepth; depth++) {
        let candidates = [];
        for (let state of beam) {
            const last = state.word.length > 0 ? state.word[state.word.length - 1] : null;

            for (let gen of generators) {
                // Pruning: Skip trivial inverses
                if ((last === 'S' && gen.name === 's') || (last === 's' && gen.name === 'S') ||
                    (last === 'T' && gen.name === 't') || (last === 't' && gen.name === 'T')) continue;

                const newWord = state.word + gen.name;
                const newMat = matMul(state.mat, gen.mat);
                const tr = matTrace(newMat);

                const match = checkMatch(tr, target);
                if (match !== 0) return { word: newWord, sign: match, tr: tr };

                if (depth < maxDepth) {
                    const val = tr.evaluateComplex(z0, 0).re;
                    // Heuristic: Minimize distance to target or its negation
                    const score = Math.min(Math.abs(val - targetVal), Math.abs(val + targetVal));
                    candidates.push({ word: newWord, mat: newMat, score: score });
                }
            }
        }
        candidates.sort((a, b) => a.score - b.score);
        beam = candidates.slice(0, beamWidth);
        if (beam.length === 0) break;
    }
    return null;
}

const targets = [
    { name: '0/1', poly: new Polynomial([2, 0, -1]) },        // 2 - z^2
    { name: '1/1', poly: new Polynomial([2, 0, 1]) },         // 2 + z^2
    { name: '1/2', poly: new Polynomial([2, 0, 0, 0, 1]) },   // 2 + z^4
    { name: '1/3', poly: new Polynomial([2, 0, 1, 0, -2, 0, 1]) } // 2 + z^2 - 2z^4 + z^6
];

console.log("Riley words search via Beam Search...");
const start = Date.now();

for (const target of targets) {
    process.stdout.write(`Searching for word with trace ±(${target.poly.toString()})... `);
    const result = beamSearch(target.poly, 2000, 24);
    if (result) {
        console.log(`FOUND! [${result.word}] (Sign: ${result.sign})`);
    } else {
        console.log("NOT FOUND within depth 24.");
    }
}

console.log(`\nSearch finished in ${((Date.now() - start) / 1000).toFixed(2)}s.`);
