/**
 * Regression: perfectSqrt must stay O(log n) for large BigInt discriminants.
 * Run: node --experimental-default-type=module js/test_perfect_sqrt.js
 */
import { analyzeDiscreteness } from './engine.js';
import { Mat2Q } from './mat2.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

// Mirror of the fixed helper via the elementary-axis path that calls it.
function checkLargeAxis() {
    // diag(10^40+1, 1) and diag(2, 1) share {0,∞}; disc(A) = 10^80.
    // The old Math.sqrt(Number(n)) seed froze here for minutes+.
    const A = new Mat2Q(10n ** 40n + 1n, 0n, 0n, 1n);
    const B = new Mat2Q(2n, 0n, 0n, 1n);
    const t0 = Date.now();
    const res = analyzeDiscreteness([A, B]);
    const ms = Date.now() - t0;
    assert(ms < 2000, `large-axis analysis took ${ms}ms (expected <2s)`);
    assert(res.verdict === 'non-discrete', `expected non-discrete, got ${res.verdict}`);
    assert(res.kind === 'elementary-axis', `expected elementary-axis, got ${res.kind}`);
    console.log(`ok large-axis in ${ms}ms → ${res.verdict}/${res.kind}`);
}

function checkHugeCrashCase() {
    // Number(disc) was Infinity → BigInt(Infinity) threw.
    const A = new Mat2Q(10n ** 200n, 0n, 0n, 1n);
    const B = new Mat2Q(3n, 0n, 0n, 1n);
    const t0 = Date.now();
    const res = analyzeDiscreteness([A, B]);
    const ms = Date.now() - t0;
    assert(ms < 2000, `huge-entry analysis took ${ms}ms (expected <2s)`);
    assert(res.verdict === 'non-discrete', `expected non-discrete, got ${res.verdict}`);
    console.log(`ok huge-entry in ${ms}ms → ${res.verdict}/${res.kind}`);
}

function checkSmallPreserved() {
    const A = new Mat2Q(2n, 0n, 0n, 1n);
    const B = new Mat2Q(3n, 0n, 0n, 1n);
    const res = analyzeDiscreteness([A, B]);
    assert(res.verdict === 'non-discrete' && res.kind === 'elementary-axis',
        `small incommensurable axes broken: ${res.verdict}/${res.kind}`);
    console.log('ok small incommensurable axes');
}

checkSmallPreserved();
checkLargeAxis();
checkHugeCrashCase();
console.log('all perfectSqrt regressions passed');
