// node tests/zeta.test.mjs — ζ_k(2) (zeta.js) against closed forms and Sage/PARI's values, and rational recognition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Z = require('../js/zeta.js');
const close = (x, y, rel) => assert.ok(Math.abs(x - y) <= rel * Math.abs(y), `${x} vs ${y}`);

test('ζ(2) and the quadratic fields, by L(2, χ_D)', () => {
    close(Z.zetaK2({ d: 1 }).value, Math.PI ** 2 / 6, 1e-15);
    // ℚ(i): ζ(2)·Catalan's constant; ℚ(√−3): ζ(2)·L(2, χ₋₃)
    close(Z.zetaK2({ d: 2, minpoly: ['1', '0', '1'], disc: '-4' }).value, (Math.PI ** 2 / 6) * 0.915965594177219015, 1e-13);
    close(Z.zetaK2({ d: 2, minpoly: ['1', '-1', '1'], disc: '-3' }).value, (Math.PI ** 2 / 6) * 0.781302412896486296, 1e-13);
    // the figure-eight knot complement: 12 · covol PSL₂(ℤ[ω]) = 12 · 3^{3/2} ζ_K(2) / 4π²
    const z3 = Z.zetaK2({ d: 2, minpoly: ['1', '-1', '1'], disc: '-3' }).value;
    close(12 * 3 ** 1.5 * z3 / (4 * Math.PI ** 2), 2.029883212819307, 1e-12);
});

test('the Euler product for cubic and quintic fields (Sage/PARI values)', () => {
    close(Z.zetaK2({ d: 3, minpoly: ['-1', '-1', '0', '1'], disc: '-23' }).value, 1.11000100602502, 2e-7);
    close(Z.zetaK2({ d: 5, minpoly: ['-1', '3', '-3', '3', '-2', '1'], disc: '1609' }).value, 1.04389381638084, 2e-7);
});

test('distinct-degree factorization and the Kronecker symbol', () => {
    // x³ − x − 1: irreducible mod 13 (no roots), a root and a quadratic mod 5 (x = 2), three roots mod 59
    assert.deepEqual(Z.factorDegrees([-1, -1, 0, 1], 13), [3]);
    assert.deepEqual(Z.factorDegrees([-1, -1, 0, 1], 5), [1, 2]);
    assert.deepEqual(Z.factorDegrees([-1, -1, 0, 1], 59).sort(), [1, 1, 1]);
    assert.equal(Z.kronecker(-4, 3), -1);
    assert.equal(Z.kronecker(-3, 7), 1);
    assert.equal(Z.kronecker(-8, 2), 0);
});

test('rational recognition', () => {
    assert.deepEqual(Z.rational(12.0000001), { num: 12, den: 1 });
    assert.deepEqual(Z.rational(7 / 3 * (1 + 1e-7)), { num: 7, den: 3 });
    assert.equal(Z.rational(Math.PI, { maxDen: 48, rel: 1e-9 }), null);
});
