// linking.test.mjs — the linking number used to find the Seifert longitude on the 3D knot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkingNumber } from '../js/linking.js';

const circle = (n, f) => Array.from({ length: n }, (_, i) => f((2 * Math.PI * i) / n));

test('a right-handed meridian of an oriented axis links it +1', () => {
    // a long loop whose middle runs up the z-axis, closed far away
    const axis = [[0, 0, -50], [0, 0, 50], [50, 0, 50], [50, 0, -50]];
    const fine = [];
    for (let k = 0; k < 4; k++) { const a = axis[k], b = axis[(k + 1) % 4]; for (let i = 0; i < 50; i++) fine.push(a.map((x, d) => x + (b[d] - x) * i / 50)); }
    const mer = circle(64, (t) => [Math.cos(t), Math.sin(t), 0]);          // counterclockwise seen from +z
    assert.equal(linkingNumber(fine, mer), 1);
    assert.equal(linkingNumber(mer, fine), 1);
    assert.equal(linkingNumber(fine, mer.slice().reverse()), -1);
});

test('Hopf link and unlinked circles', () => {
    const a = circle(80, (t) => [Math.cos(t), Math.sin(t), 0]);
    const b = circle(80, (t) => [1 + Math.cos(t), 0, Math.sin(t)]);
    assert.equal(Math.abs(linkingNumber(a, b)), 1);
    const c = circle(80, (t) => [5 + Math.cos(t), 0, Math.sin(t)]);
    assert.equal(linkingNumber(a, c), 0);
});
