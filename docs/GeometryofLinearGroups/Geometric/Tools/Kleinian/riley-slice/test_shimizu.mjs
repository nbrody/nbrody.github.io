// node --test test_shimizu.mjs
// A power of A fixes infinity, so c = 0 and the isometric radius is undefined:
// it is never a Shimizu witness. With stabTol (the pages' setting), words with
// c = 0 up to rounding are set aside too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('./fordCore.js');

const sqrt3 = Math.sqrt(3);
const figureEight = [0.5, -sqrt3 / 2]; // ρ = −ω, Riley's figure-eight group

test('powers of A are not Shimizu witnesses', () => {
    // ρ = 2 is ⟨z+1, (1 0; 2 1)⟩ ⊂ PSL₂(ℤ), ρ = 1 + i lies in PSL₂(ℤ[i]), and the
    // figure-eight group is discrete: products fixing ∞ have c ≈ 10⁻¹⁶ from rounding.
    for (const rho of [[2, 0], figureEight, [1, 1]]) {
        const fd = F.fordDomain(...rho, { stabTol: 1e-7 });
        assert.equal(fd.nondiscrete, null, `ρ = ${rho}`);
    }
    const fig = F.fordDomain(...figureEight, { stabTol: 1e-7 });
    assert.equal(fig.complete, true);
    assert.equal(fig.faces.length, 5);
});

test('a real |c| < 1 is still a witness, including the long boundary word', () => {
    for (const opts of [{}, { stabTol: 1e-7 }]) {
        const outside = F.fordDomain(0.5, 0, opts);
        assert.ok(outside.nondiscrete);
        assert.ok(Math.abs(outside.nondiscrete.r - Math.SQRT2) < 1e-12);

        const th = 2 * Math.PI / 3;
        const rad = 4 ** (1 / 3);
        const boundary = F.fordDomain(rad * Math.cos(th), rad * Math.sin(th), opts);
        assert.ok(boundary.nondiscrete);
        assert.equal(boundary.nondiscrete.word.length, 68);
        assert.ok(boundary.nondiscrete.r > 1 && boundary.nondiscrete.r < 10);
    }
});

test('discrete real ρ = 1, 2, 3, 4 get no Shimizu witness', () => {
    // (ρ = 4 sin²(π/n) or ρ = 4: A·B⁻¹ has finite order or is parabolic.)
    for (const x of [1, 2, 3, 4]) assert.equal(F.fordDomain(x, 0, { stabTol: 1e-7 }).nondiscrete, null, `ρ = ${x}`);
});
