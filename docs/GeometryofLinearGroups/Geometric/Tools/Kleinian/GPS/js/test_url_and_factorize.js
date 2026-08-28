/**
 * Regression: non-finite / overflow qf URL params must not hang the GPS page.
 * Run: node docs/GeometryofLinearGroups/Geometric/Tools/Kleinian/GPS/js/test_url_and_factorize.js
 */
import assert from 'node:assert/strict';
import { factorize, pieceInvariants } from './arith.js';

function withTimeout(ms, fn) {
    return Promise.race([
        Promise.resolve().then(fn),
        new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms)),
    ]);
}

// factorize must terminate on non-finite input
await withTimeout(500, () => {
    assert.equal(factorize(Infinity).size, 0);
    assert.equal(factorize(-Infinity).size, 0);
    assert.equal(factorize(NaN).size, 0);
});

// Sanity: ordinary factorization still works
{
    const f = factorize(12);
    assert.equal(f.get(2), 2);
    assert.equal(f.get(3), 1);
}

// pieceInvariants must not hang when fed Infinity (defensive layer)
await withTimeout(500, () => {
    const inv = pieceInvariants(1, Infinity, 2);
    assert.ok(Array.isArray(inv.ram));
});

// Mirror readURL clamp for qf params (same bounds as readQFInputs)
function clampInt(raw, d, lo, hi) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return d;
    return Math.max(lo, Math.min(hi, Math.round(v)));
}

assert.equal(clampInt('Infinity', 1, 1, 100), 1);
assert.equal(clampInt('1e309', 1, 1, 100), 1);
assert.equal(clampInt('NaN', 3, 1, 100), 3);
assert.equal(clampInt('7', 1, 1, 100), 7);
assert.equal(clampInt('999', 1, 1, 100), 100);
assert.equal(clampInt('-5', 1, 1, 30), 1);

// Clamped values are safe for the invariants path
await withTimeout(500, () => {
    const a = clampInt('Infinity', 1, 1, 100);
    const inv = pieceInvariants(1, a, 2);
    assert.ok(inv.ram.length >= 0);
});

console.log('ok — GPS url/factorize guards');
