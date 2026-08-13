/**
 * Regression tests for the Euclidean space-groups certifier cycle-order guard.
 *
 * Without the guard, a closed edge cycle with Σθ = 0 (or ~1e-8) makes
 *   m = Math.round(2π / Σθ)
 * equal Infinity / several million, and
 *   for (k = 0; k < Math.max(1, m); k++) Pm = Pm.mul(P)
 * hangs the main thread. runCertifier() always runs after Refresh.
 *
 * Run: node docs/GeometryofLinearGroups/Geometric/Tools/Euclidean/spacegroups/js/test_cycle_order.js
 */
import assert from 'assert';
import { cycleOrderFromAngleSum, MAX_CYCLE_ORDER } from './cycleOrder.js';

let failed = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`PASS  ${name}`);
    } catch (e) {
        failed++;
        console.error(`FAIL  ${name}: ${e.message}`);
    }
}

/** Reproduce the unguarded loop bound the certifier used to feed P^m. */
function unguardedBound(angleSum) {
    const mFloat = 2 * Math.PI / angleSum;
    const m = Math.round(mFloat);
    return Math.max(1, m);
}

check('cycleOrderFromAngleSum accepts exact 2π/m', () => {
    const { m, orderCheckable } = cycleOrderFromAngleSum(2 * Math.PI / 4);
    assert.strictEqual(m, 4);
    assert.strictEqual(orderCheckable, true);
});

check('cycleOrderFromAngleSum accepts cube/hex typical orders', () => {
    assert.strictEqual(cycleOrderFromAngleSum(2 * Math.PI / 2).m, 2);
    assert.strictEqual(cycleOrderFromAngleSum(2 * Math.PI / 6).m, 6);
    assert.strictEqual(cycleOrderFromAngleSum(Math.PI / 2).orderCheckable, true);
});

check('unguarded Σθ = 0 would use Infinity as a loop bound', () => {
    const bound = unguardedBound(0);
    assert.ok(!Number.isFinite(bound), `expected Infinity, got ${bound}`);
});

check('cycleOrderFromAngleSum rejects Σθ = 0 (was infinite P^m loop)', () => {
    const { m, orderCheckable } = cycleOrderFromAngleSum(0);
    assert.strictEqual(orderCheckable, false);
    assert.ok(m === null || !Number.isFinite(m) || m > MAX_CYCLE_ORDER);
});

check('unguarded tiny Σθ would loop millions of times', () => {
    const bound = unguardedBound(1e-8);
    assert.ok(bound > 1e6, `expected huge bound, got ${bound}`);
});

check('cycleOrderFromAngleSum rejects tiny Σθ (multi-million loop)', () => {
    const { orderCheckable, m } = cycleOrderFromAngleSum(1e-8);
    assert.strictEqual(orderCheckable, false);
    assert.ok(m === null || m > MAX_CYCLE_ORDER);
});

check('cycleOrderFromAngleSum rejects negative / NaN / Infinity sums', () => {
    assert.strictEqual(cycleOrderFromAngleSum(-0.1).orderCheckable, false);
    assert.strictEqual(cycleOrderFromAngleSum(NaN).orderCheckable, false);
    assert.strictEqual(cycleOrderFromAngleSum(Infinity).orderCheckable, false);
});

check('MAX_CYCLE_ORDER is a safe integer loop bound', () => {
    assert.ok(Number.isSafeInteger(MAX_CYCLE_ORDER) && MAX_CYCLE_ORDER > 0);
    const { orderCheckable } = cycleOrderFromAngleSum(2 * Math.PI / MAX_CYCLE_ORDER);
    assert.strictEqual(orderCheckable, true);
    const over = cycleOrderFromAngleSum(2 * Math.PI / (MAX_CYCLE_ORDER + 1));
    assert.strictEqual(over.orderCheckable, false);
});

if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll cycle-order guards OK');
