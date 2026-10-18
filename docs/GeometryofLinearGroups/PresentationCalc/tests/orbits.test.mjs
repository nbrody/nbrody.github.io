// node --test tests/orbits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Folded, normalForm, normalBlocks } from '../js/stallings.js';
import { SubPGL2Z, Tree } from '../js/bsfold.js';
import { orbitDecide } from '../js/orbits.js';

const rows = (key) => key.split('|').map((m) => m.split(','));
const sub = (ms) => { const H = new SubPGL2Z(); for (const m of ms) H.add(m.map(BigInt)); return H; };

test('normal forms multiply back, also for huge parabolic powers', () => {
    for (const m of [[2, 1, 1, 1], [5, 3, 3, 2], [13, 8, 8, 5], [1, 0, 0, 1]]) assert.ok(Array.isArray(normalForm(m.map(BigInt))));
    const big = [1n, 10n ** 30n, 0n, 1n];
    assert.deepEqual(normalBlocks(big), [10n ** 30n]);
    assert.throws(() => normalForm(big), /too long/);
});

test('Stallings folding: indices agree with Todd–Coxeter', () => {
    assert.equal(sub([[1, 1, 0, 1], [0, -1, 1, 0], [-1, 0, 0, 1]]).stats().index, 1);
    assert.equal(sub([[1, 2, 0, 1], [1, 0, 2, 1]]).stats().index, 12);                       // Γ(2)
    assert.equal(sub([[1, 1, 0, 1], [7, -2, 11, -3], [8, -3, 11, -4], [-1, 0, 0, 1]]).stats().index, 12);   // Γ₀(11)±
    assert.equal(sub([[1, 3, 0, 1], [1, 0, 3, 1]]).stats().finite, false);
});

test('membership of torsion and of words whose block form is not reduced', () => {
    const H = sub([[0, 1, -1, -1]]);                                                       // ⟨U⟩, U³ = 1: block form T⁰ S T¹ = s s u
    assert.equal(H.has([0n, 1n, -1n, -1n]), true);
    assert.equal(sub([[0, -1, 1, 1]]).has([0n, -1n, 1n, 1n]), true);
    assert.equal(sub([[0, -1, 1, 0]]).has([1n, 1n, 0n, 1n]), false);
});

test('membership through T-powers with cycle detection', () => {
    const H = sub([[1, 2, 0, 1], [1, 0, 2, 1]]);                                         // Γ(2) ∌ T, ∋ T^(2k)
    assert.equal(H.has([1n, 10n ** 40n, 0n, 1n]), true);
    assert.equal(H.has([1n, 10n ** 40n + 1n, 0n, 1n]), false);
});

test('the tree: neighbours, indices and paths', () => {
    const T = new Tree(3), o = T.canon(0, 0n, 1n);
    for (let i = 0; i <= 3; i++) assert.equal(T.index(o, T.neighbour(o, i)), i);
    assert.equal(T.dist(o, T.act([9n, 0n, 0n, 1n], o)), 2);
});

test('vertex orbits on one tree: exact indices', () => {
    const cases = [
        ['1,1,0,1|0,-1,1,0|-1,0,0,1|0,1,2,0', ['2'], 1],
        ['1,1,0,1|0,-1,1,0|2,0,0,1', ['2'], 2],
        ['1,1,0,1|1,0,3,1|2,0,0,1', ['2'], 8],
        ['0,1,1,-2|0,1,2,0', ['2'], 720],
        ['0,1,1,-2|1,-2,-2,-1', ['5'], 288],
    ];
    for (const [k, S, index] of cases) {
        const r = orbitDecide(rows(k), S, { seconds: 20 });
        assert.equal(r.verdict, 'sarith', k);
        assert.equal(r.index, index, k);
    }
});

test('vertex orbits on a product of trees: exact indices', () => {
    const cases = [
        ['1,1,0,1|0,-1,1,0|-1,0,0,1|0,1,2,0|0,1,3,0', ['2', '3'], 1],      // PGL₂(ℤ[1/6])
        ['1,1,0,1|0,-1,1,0|2,0,0,1|3,0,0,1', ['2', '3'], 2],
        ['0,1,1,-2|0,1,2,0', ['2'], 720],
        ['1,-2,1,-3|2,1,3,-5', ['13'], 504],
        ['0,3,3,-1|1,1,2,-5', ['3', '7'], 15840],                          // also Todd–Coxeter's
    ];
    for (const [k, S, index] of cases) {
        const r = orbitDecide(rows(k), S, { seconds: 60 });
        assert.equal(r.verdict, 'sarith', k);
        assert.equal(r.index, index, k);
    }
});

test('fold-first enumeration: index 24 in PGL₂(ℤ[1/65]), where HLT order runs out of time', async () => {
    const { orbitFoldDecide, orbitDecideAuto } = await import('../js/orbits.js');
    const rows = '1,-3,1,2|3,-2,2,3'.split('|').map((m) => m.split(','));
    const f = orbitFoldDecide(rows, ['5', '13'], { seconds: 60 });
    assert.equal(f.status, 'closed');
    assert.equal(f.verdict, 'sarith');
    assert.equal(f.index, 24);                                    // coset enumeration's index
    // the two orders close different groups; the automatic choice gets both
    for (const [key, S, index] of [['1,-1,0,3|3,-1,1,3', ['2', '3', '5'], 364], ['0,2,2,-3|1,-2,0,1', ['2'], 2]]) {
        const r = orbitDecideAuto(key.split('|').map((m) => m.split(',')), S, { seconds: 40 });
        assert.equal(r.index, index, key);
    }
});

test('an odd valuation outside S whose inverted edge is not at o: K is conjugated there', async () => {
    // (1 −3; 3 −1) has det 8 and inverts an edge at distance 1 from o in T₂; the even part fixes
    // both its ends, so it is conjugated to fix o (both in coset enumeration and in the orbits)
    const { exactIndexCheck } = await import('../js/sarithIndex.js');
    const { orbitFoldDecide } = await import('../js/orbits.js');
    const r = rows('1,-3,3,-1|1,0,0,-3');
    const tc = exactIndexCheck(r, ['3'], { seconds: 20 });
    assert.equal(tc.index, 60);
    assert.equal(tc.kernelIndex, 2);
    assert.deepEqual(tc.conjugatedAt, ['2']);
    const f = orbitFoldDecide(r, ['3'], { seconds: 60 });
    assert.equal(f.verdict, 'sarith');
    assert.equal(f.index, 60);
});
