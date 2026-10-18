// node --test tests/descent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { descendToQ, descendToReal } from '../js/descent.js';
import { field, parsePoly } from '../js/cusps.js';

/** tr²/det of a matrix given as ringEngine text over ℚ(w), as a rational [n, m] (null if not rational) */
function tau(row, poly) {
    const K = field(poly), d = K.d;
    const q = row.map((s) => parsePoly(s, d));
    const L = q.reduce((l, e) => { let a = l, b = e.den; while (b) [a, b] = [b, a % b]; return (l / a) * e.den; }, 1n);
    const [a, b, c, e] = q.map((x) => x.num.map((v) => v * (L / x.den)));
    const t = K.add(a, e), dt = K.sub(K.mul(a, e), K.mul(b, c));
    const r = K.divide(K.mul(t, t), dt);
    return r.num.slice(1).every((x) => x === 0n) ? [r.num[0], r.den] : null;
}
const eqQ = (x, y) => x[0] * y[1] === y[0] * x[1];

test('trace field ℚ, split algebra: conjugated into PGL₂(ℚ), tr²/det preserved', () => {
    const qi = [1n, 0n, 1n];
    const g = [['0', '-w', 'w', '-1'], ['-1', 'w', '-w', '1']];
    const D = descendToQ(g, qi);
    assert.ok(D.mats);
    for (const [i, row] of D.mats.entries()) {
        assert.ok(row.every((x) => /^-?\d+$/.test(x)));
        assert.ok(eqQ(tau(g[i], qi), tau(row, [0n, 1n])));
    }
    // Hamilton's quaternions are a division algebra: no conjugation into PGL₂(ℚ)
    assert.ok(descendToQ([['1+2w', '0', '0', '1-2w'], ['3', '2', '-2', '3']], qi).error);
});

test('an indefinite division algebra over ℚ: embedded in PGL₂(ℚ(√a)), tr²/det preserved', () => {
    const m2 = [2n, 0n, 1n];
    const g = [['0', '1', '1', '-1'], ['w', '1', '-1', '-w']];          // A ramified at 2 and 13
    assert.ok(descendToQ(g, m2).error);
    const D = descendToReal(g, m2);
    assert.ok(D.mats);
    const L = [-D.d, 0n, 1n];
    for (const [i, row] of D.mats.entries()) assert.ok(eqQ(tau(g[i], m2), tau(row, L)), `generator ${i + 1}`);
});
