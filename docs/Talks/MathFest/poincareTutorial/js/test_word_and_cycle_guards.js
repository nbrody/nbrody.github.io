/**
 * Regression tests for MathFest Poincaré workbench hang/OOM guards.
 *
 * Run: node docs/Talks/MathFest/poincareTutorial/js/test_word_and_cycle_guards.js
 */
import assert from 'assert';
import { parseWord, MAX_WORD_EXPONENT } from './word.js';
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

check('parseWord expands modest exponents', () => {
    assert.deepStrictEqual(parseWord('a^3', 2), [1, 1, 1]);
    assert.deepStrictEqual(parseWord('a^{-2}', 2), [-1, -1]);
    assert.deepStrictEqual(parseWord('g1^4', 2), [1, 1, 1, 1]);
    assert.deepStrictEqual(parseWord('a b A', 2), [1, 2, -1]);
});

check('parseWord accepts the exponent cap', () => {
    const w = parseWord(`a^${MAX_WORD_EXPONENT}`, 1);
    assert.strictEqual(w.length, MAX_WORD_EXPONENT);
});

check('parseWord rejects exponents above the cap (tab-kill path)', () => {
    assert.throws(
        () => parseWord('a^1000000000', 2),
        /exceeds the limit/
    );
    assert.throws(
        () => parseWord(`a^${MAX_WORD_EXPONENT + 1}`, 2),
        /exceeds the limit/
    );
});

check('cycleOrderFromAngleSum accepts exact 2π/m', () => {
    const { m, orderCheckable } = cycleOrderFromAngleSum(2 * Math.PI / 5);
    assert.strictEqual(m, 5);
    assert.strictEqual(orderCheckable, true);
});

check('cycleOrderFromAngleSum rejects Σθ = 0 (was infinite P^m loop)', () => {
    const { m, orderCheckable } = cycleOrderFromAngleSum(0);
    assert.strictEqual(orderCheckable, false);
    assert.ok(m === null || !Number.isFinite(m) || m > MAX_CYCLE_ORDER);
});

check('cycleOrderFromAngleSum rejects tiny Σθ (multi-million loop)', () => {
    const { orderCheckable, m } = cycleOrderFromAngleSum(1e-8);
    assert.strictEqual(orderCheckable, false);
    assert.ok(m === null || m > MAX_CYCLE_ORDER);
});

check('cycleOrderFromAngleSum rejects negative / NaN sums', () => {
    assert.strictEqual(cycleOrderFromAngleSum(-0.1).orderCheckable, false);
    assert.strictEqual(cycleOrderFromAngleSum(NaN).orderCheckable, false);
});

if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll guards OK');
