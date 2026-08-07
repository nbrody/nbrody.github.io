// verify.mjs — Node sanity checks for the Long-Reid Racer math core.
// Run:  node tests/verify.mjs   (from the longReidRacer3 folder; no deps)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const LRMath = require('../js/math.js');
globalThis.LRMath = LRMath; // cayley.js and solution.js expect the browser global
const Cayley = require('../js/cayley.js');
const SOLUTION_WORD = require('../js/solution.js');

const { Mat2, GEN, INVERSE_LABEL } = LRMath;

let failures = 0;
function check(name, cond, detail = '') {
    const ok = Boolean(cond);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
}

function det(m) {
    // determinant of M = N / (2^e2 3^e3) as an exact pair {num, den}
    const n = m.n;
    const num = n[0] * n[3] - n[1] * n[2];
    const den = (2n ** BigInt(2 * m.e2)) * (3n ** BigInt(2 * m.e3));
    return { num, den };
}

// --- generator sanity ---
for (const label of ['a', 'A', 'b', 'B']) {
    const d = det(GEN[label]);
    check(`det ${label} = 1`, d.num === d.den, `${d.num}/${d.den}`);
}
check('a·A = I', GEN.a.mul(GEN.A).isIdentity());
check('b·B = I', GEN.b.mul(GEN.B).isIdentity());

// --- the relator: [a,b]^2 = -I on the whole Magnus curve ---
const comm = GEN.a.mul(GEN.b).mul(GEN.A).mul(GEN.B);
check('[a,b]^2 = -I', comm.mul(comm).isNegIdentity());

// --- generator heights (b has denominator 8, a has denominator 3) ---
check('height(a) = 1', GEN.a.height === 1);
check('height(b) = 3', GEN.b.height === 3);

// --- solution word ---
check('solution has length 82', SOLUTION_WORD.length === 82, `length ${SOLUTION_WORD.length}`);

let reduced = true;
for (let i = 1; i < SOLUTION_WORD.length; i++) {
    if (SOLUTION_WORD[i] === INVERSE_LABEL[SOLUTION_WORD[i - 1]]) reduced = false;
}
check('solution is freely reduced', reduced);

let w = Mat2.identity();
let maxHeight = 0;
for (const label of SOLUTION_WORD) {
    w = w.mul(GEN[label]);
    maxHeight = Math.max(maxHeight, w.height);
}
check('solution lands at height 0 (integer matrix)', w.height === 0,
    `e2 = ${w.e2}, e3 = ${w.e3}`);
check('solution is not ±I', !w.isPlusMinusIdentity());
const wDet = det(w);
check('solution det = 1', wDet.num === wDet.den, `${wDet.num}/${wDet.den}`);

const trace = w.n[0] + w.n[3];
const absTrace = trace < 0n ? -trace : trace;
check('solution has |trace| > 2 (infinite order)', absTrace > 2n,
    `trace = ${trace}`);
console.log(`      solution matrix: [[${w.n[0]}, ${w.n[1]}], [${w.n[2]}, ${w.n[3]}]]`);
console.log(`      max height along the drive: ${maxHeight}`);

// --- Cayley ball size: free group => 1 + 4 + 12 + 36 + 108 = 161 at depth 4 ---
const ball = Cayley.build(Mat2.identity(), 4);
check('depth-4 ball has 161 nodes', ball.nodes.length === 161, `${ball.nodes.length} nodes`);

// --- undo consistency: random walk forward then exact inverse walk back ---
let m = Mat2.identity();
const walk = [];
let seed = 7;
for (let i = 0; i < 40; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const label = ['a', 'A', 'b', 'B'][seed % 4];
    walk.push(label);
    m = m.mul(GEN[label]);
}
for (let i = walk.length - 1; i >= 0; i--) {
    m = m.mul(GEN[INVERSE_LABEL[walk[i]]]);
}
check('40-step walk undoes to I exactly', m.isIdentity());

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
