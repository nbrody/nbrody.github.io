import assert from 'node:assert/strict';
import {
    M_MAX,
    DEPTH_MAX,
    MAX_ZINV_POINTS_PER_LEVEL,
    MAX_ROTATION_COS_SAMPLES,
    clampM,
    clampDepth,
    factorize,
    generateZinvM,
    generateO2Rotations,
} from './zinvMath.js';

function timed(fn) {
    const t0 = Date.now();
    const result = fn();
    return { result, ms: Date.now() - t0 };
}

// UI-advertised extremes that previously enumerated billions of a/m^k values.
const hangCases = [
    [65, 6],
    [1000, 3],
    [1000, 6],
];

for (const [m, k] of hangCases) {
    const { result, ms } = timed(() => generateZinvM(m, k));
    assert.ok(ms < 1000, `generateZinvM(${m}, ${k}) took ${ms}ms`);
    assert.ok(result.length > 10, `generateZinvM(${m}, ${k}) produced too few points`);
    const cap = MAX_ZINV_POINTS_PER_LEVEL * (k + 1) + 8;
    assert.ok(result.length <= cap, `generateZinvM(${m}, ${k}) produced ${result.length} points`);
    assert.ok(result.every(Number.isFinite), 'non-finite sample');
}

{
    const pts = generateZinvM(2, 3);
    assert.ok(pts.includes(0));
    assert.ok(pts.includes(1) || pts.includes(-1));
}

{
    const { result, ms } = timed(() => generateO2Rotations(1000, 2));
    assert.ok(ms < 1000, `generateO2Rotations(1000, 2) took ${ms}ms`);
    assert.ok(result.length <= MAX_ROTATION_COS_SAMPLES * 8);
}

assert.deepEqual(factorize(65), [5, 13]);
assert.deepEqual(factorize(1), []);
assert.deepEqual(factorize(Infinity), []);
assert.deepEqual(factorize(NaN), []);

assert.equal(clampM('1000'), 1000);
assert.equal(clampM('1001'), M_MAX);
assert.equal(clampM('1'), 2);
assert.equal(clampM('Infinity'), 65);
assert.equal(clampM('1e309'), 2); // parseInt stops at e → 1 → clamped to 2
assert.equal(clampDepth('6'), DEPTH_MAX);
assert.equal(clampDepth('99'), DEPTH_MAX);
assert.equal(clampDepth('-3'), 1);

console.log('ok');
