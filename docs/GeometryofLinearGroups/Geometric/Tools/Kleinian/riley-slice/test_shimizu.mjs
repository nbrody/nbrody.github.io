// node --test test_shimizu.mjs
// A power of A fixes infinity, so c = 0 and the isometric radius is undefined.
// Float closure was reporting that radius (∞, or ~10^15) as a Shimizu witness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('./fordCore.js');

const sqrt3 = Math.sqrt(3);
const figureEight = [0.5, -sqrt3 / 2]; // ρ = −ω, Riley's figure-eight group

test('powers of A are not Shimizu witnesses', () => {
    // ρ = 2 is ⟨z+1, (1 0; 2 1)⟩. Every non-zero c is an integer, so no
    // Shimizu witness exists; a float product of a power of A has c = 0.
    const at2 = F.fordDomain(2, 0);
    assert.equal(at2.nondiscrete, null);
    const fig = F.fordDomain(...figureEight);
    assert.equal(fig.nondiscrete, null);
    assert.equal(fig.complete, true);
    assert.equal(fig.faces.length, 5);
});

test('a real |c| < 1 is still a witness, including the long boundary word', () => {
    const outside = F.fordDomain(0.5, 0);
    assert.ok(outside.nondiscrete);
    assert.ok(outside.nondiscrete.r > 1 && outside.nondiscrete.r < 10);

    const th = 2 * Math.PI / 3;
    const rad = 4 ** (1 / 3);
    const boundary = F.fordDomain(rad * Math.cos(th), rad * Math.sin(th));
    assert.ok(boundary.nondiscrete);
    assert.equal(boundary.nondiscrete.word.length, 68);
    assert.ok(boundary.nondiscrete.r > 1 && boundary.nondiscrete.r < 10);
});

test('the real Riley interval from 1 to 4 is not declared non-discrete', () => {
    for (const x of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
        const fd = F.fordDomain(x, 0);
        assert.equal(fd.nondiscrete, null, `ρ = ${x}`);
    }
});
