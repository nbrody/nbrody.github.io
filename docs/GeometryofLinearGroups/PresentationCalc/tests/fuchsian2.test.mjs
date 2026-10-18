// node --test tests/fuchsian2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fuchsianPairTest } from '../js/fuchsian2.js';

const f = (key) => fuchsianPairTest(key.split('|').map((m) => m.split(',')));

test('Hecke groups: λ = 1, 2 discrete; λ² = 1/4 not', () => {
    assert.equal(f('1,1,0,1|0,-1,1,0').status, 'discrete');             // PSL₂(ℤ)
    assert.equal(f('1,2,0,1|0,-1,1,0').status, 'discrete');             // λ = 2
    assert.equal(f('2,1,0,2|0,-1,1,0').status, 'nondiscrete');          // λ = 1/2
});

test('two parabolics: |ab| ≥ 4 discrete (Sanov), and a reflection pairing them', () => {
    assert.equal(f('1,2,0,1|1,0,2,1').status, 'discrete');              // Γ(2)-type, ab = 4
    assert.equal(f('1,-3,-2,-1|1,0,-3,1').status, 'discrete');          // involution of det −7 with T-like parabolic
});

test('Fricke: tr[A, B] ≤ −2 is discrete', () => {
    assert.equal(f('1,1,1,2|1,-1,-1,2').status, 'discrete');            // tr[A,B] = −2: punctured torus
});

test('elliptic of infinite order is not discrete', () => {
    assert.equal(f('1,-2,1,2|3,2,2,-3').status, 'nondiscrete');
    assert.equal(f('0,2,3,0|1,-1,-1,2').status, 'nondiscrete');          // [A, rAr] has trace −53/36
});
