// node --test tests/cusps.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cuspCertificate, parsePoly } from '../js/cusps.js';

// valuations at the primes of S come from ringEngine.js
globalThis.NumberRingEngine = createRequire(import.meta.url)('../../Algebraic/Tools/numberRings/ringEngine.js');

const r2 = { poly: [-2n, 0n, 1n], root: { re: Math.SQRT2, im: 0 } };

test('ringEngine text in w', () => {
    assert.deepEqual(parsePoly('w^2+2*w-1/2', 3), { num: [-1n, 4n, 2n], den: 2n });
    assert.deepEqual(parsePoly('-w', 2), { num: [0n, -1n], den: 1n });
});

test('PSL₂(ℤ[√2]) and ⟨(√2 1; 1 √2), (1 2; 0 1)⟩ have a lattice of unipotents at a cusp', () => {
    for (const gens of [[['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0']], [['w', '1', '1', 'w'], ['1', '2', '0', '1']]]) {
        const c = cuspCertificate(gens, r2.poly, r2.root, { maxElements: 20000, seconds: 20 });
        assert.equal(c.found, true);
        assert.equal(c.rank, 2);
    }
});

test('a Hecke group over ℚ(√2) (discrete, infinite covolume) has rank 1 only', () => {
    const c = cuspCertificate([['1', 'w', '0', '1'], ['0', '-1', '1', '0']], r2.poly, r2.root, { maxElements: 20000, seconds: 20 });
    assert.equal(c.found, false);
});

test('S ≠ ∅, any field (Vaserstein for O_S): a parabolic and multipliers that generate K and cover S', () => {
    const Q = { poly: [0n, 1n], root: { re: 0, im: 0 } }, qi = { poly: [1n, 0n, 1n], root: { re: 0, im: 1 } };
    const rows = (k) => k.split('|').map((m) => m.split(','));
    // PGL₂(ℤ[½]) and a group of index 160 in PGL₂(ℤ[1/21]) over ℚ; index 1344 in PGL₂(ℤ[i][1/(1+2i), 1/3])
    for (const [F, key, S] of [[Q, '1,1,0,1|0,-1,1,0|2,0,0,1', ['2']], [Q, '1,-2,1,1|2,-1,3,2', ['3', '7']], [qi, '-1,1+w,w,-1|-1-w,w,w,-1+w', ['3', '5']]]) {
        const c = cuspCertificate(rows(key), F.poly, F.root, { maxElements: 100000, seconds: 60 });
        assert.equal(c.found, true, key);
        assert.deepEqual(c.S, S, key);
    }
    // ⟨(0 1; 1 −2), (0 2; 3 0)⟩ ≅ ℤ ∗ ℤ/2 (it looks thin): no certificate
    assert.equal(cuspCertificate(rows('0,1,1,-2|0,2,3,0'), Q.poly, Q.root, { maxElements: 60000, seconds: 30 }).found, false);
});
