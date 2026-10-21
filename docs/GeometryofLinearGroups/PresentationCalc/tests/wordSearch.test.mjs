// node --test tests/wordSearch.test.mjs
// FlashBeam words (wordSearch.js flashWords) over number fields other than ℚ and the Bianchi rings,
// on covering.js's integral matrices: elements are recognized up to any scalar, units included.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../../Geometric/Tools/padicGroups/trees/js/localField.js');
const { choosePlaces, integralMatrix, wordRing, wordContext, wordMatrix, mulM } = await import('../js/covering.js');
const { flashWords } = await import('../js/wordSearch.js');

const field = (poly) => new GlobalField(poly ? { gen: 'w', poly } : null);
/** targets = words in the generators (times a scalar), found again by FlashBeam and checked exactly */
function findAgain(poly, gensSrc, S, arch, words, scale = null) {
    const F = field(poly);
    const mats = gensSrc.map((m) => { const [a, b, c, d] = m.map((s) => F.parse(s)); return { a, b, c, d }; });
    const places = S.length ? choosePlaces({ Place }, F, mats, S, true).places : [];
    const ctx = wordContext(F, places, arch);
    const ring = wordRing(ctx);
    const G = mats.map((m) => integralMatrix(F, m));
    let targets = words.map((w) => wordMatrix(ctx.R, G, w, ctx.one));
    if (scale) { const s = integralMatrix(F, { a: F.parse(scale), b: F.zero(), c: F.zero(), d: F.parse(scale) }); targets = targets.map((T) => mulM(ctx.R, T, s)); }
    const found = flashWords(G, targets, ring, { seconds: 5, beamWidth: 800 });
    found.forEach((w, j) => {
        assert.ok(w, `target ${j} found`);
        assert.ok(ring.same(wordMatrix(ctx.R, G, w, ctx.one), targets[j]), `target ${j} = its word`);
    });
}
const T = ['1', '1', '0', '1'], U = ['1', 'w', '0', '1'], S = ['0', '-1', '1', '0'];
const realQ2 = [{ re: Math.SQRT2, im: 0, kind: 'real' }, { re: -Math.SQRT2, im: 0, kind: 'real' }];

test('ℚ(√2): words in T, U, S, diag(1+√2, 1), also for targets carrying the unit 1+√2', () => {
    const words = [[4, 1, -4], [4, 4, 2, -4, -4], [3, 2, -3, 1], [1, 3, 2, 3, -1], [4, 3, 4, 2, 3, -4]];
    findAgain('w^2-2', [T, U, S, ['1+w', '0', '0', '1']], [], realQ2, words);
    findAgain('w^2-2', [T, U, S, ['1+w', '0', '0', '1']], [], realQ2, words, '1+w');
});

test('ℚ(√2) with the tree at √2, ℚ(√−5) (class number 2), ℚ(∛2) with the tree at ∛2', () => {
    findAgain('w^2-2', [T, U, S, ['w', '0', '0', '1']], [{ p: 2, e: 2, f: 1 }], realQ2, [[4, 1, -4], [4, 4, 1, -4, -4], [3, 4, 3, -4], [4, 2, 4, 3, -4, -4]]);
    findAgain('w^2+5', [T, U, S], [], [{ re: 0, im: Math.sqrt(5), kind: 'complex' }], [[1, 3, 2, -3], [2, 3, 1, 1, 3], [3, 2, 3, 2, 3, -1]], 'w');
    const c = Math.cbrt(2);
    findAgain('w^3-2', [T, U, S, ['w', '0', '0', '1']], [{ p: 2, e: 3, f: 1 }], [{ re: c, im: 0, kind: 'real' }, { re: -c / 2, im: c * Math.sqrt(3) / 2, kind: 'complex' }],
        [[4, 1, -4], [4, 4, 2, -4, -4], [3, 4, 3, -4], [4, 1, 3, -4, 2]]);
});
