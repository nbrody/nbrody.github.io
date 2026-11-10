/**
 * Regression tests for the Leavitt calculator exponent cap.
 *
 * The header advertises `^` syntax. Typing `s0^1000000000` (or `s0^` plus
 * hundreds of zeros, which parseInt maps to Infinity) used to run
 *   for (i = 0; i < n; i++) r = mul(r, X)
 * on the main thread and freeze the tab.
 *
 * Run: node docs/InteractivePapers/nonsofic/calculator/js/test_exponent_guard.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, 'leavitt.js'), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(src + '\nthis.Leavitt = Leavitt;', ctx);
const L = ctx.Leavitt;

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

check('exports MAX_EXPONENT', () => {
    assert.strictEqual(L.MAX_EXPONENT, 10000);
});

check('s0^3 expands to s000', () => {
    const el = L.parse('s0^3');
    assert.strictEqual(L.toSyntax(el), 's000');
});

check('1^n is still 1', () => {
    assert.ok(L.equalsOne(L.parse('1^8')));
});

check('s0^0 is 1', () => {
    assert.ok(L.equalsOne(L.parse('s0^0')));
});

check('pow accepts the exponent cap', () => {
    const one = L.make([L.mono('', '')]);
    const r = L.pow(one, L.MAX_EXPONENT);
    assert.ok(L.equalsOne(r));
});

check('parse rejects a^1000000000 (tab-kill path)', () => {
    assert.throws(() => L.parse('s0^1000000000'), /exceeds the limit/);
});

check('parse rejects exponent just above the cap', () => {
    assert.throws(() => L.parse('s0^' + (L.MAX_EXPONENT + 1)), /exceeds the limit/);
});

check('parse rejects digit strings that parseInt maps to Infinity', () => {
    assert.throws(() => L.parse('s0^' + '1' + '0'.repeat(400)), /exceeds the limit/);
});

check('pow itself refuses Infinity / non-integers', () => {
    const x = L.parse('s0');
    assert.throws(() => L.pow(x, Infinity), /exceeds the limit/);
    assert.throws(() => L.pow(x, 1.5), /exceeds the limit/);
    assert.throws(() => L.pow(x, -1), /exceeds the limit/);
});

check('missing exponent still errors', () => {
    assert.throws(() => L.parse('s0^'), /expected exponent/);
});

if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll exponent guards OK');
