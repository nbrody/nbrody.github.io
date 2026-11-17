// node --test tests/bigTrees.test.mjs
// Trees with large residue fields (covering.js bigMode). A group over ℚ(∛13) whose S has primes above 4093,
// 13337 and 299333 used to stop the search: choosePlaces built trees' Place for every prime above p, and the
// one of degree 2 above 13337 (where Γ is bounded) refused its residue field F_13337² as "too large to draw".
// Now no neighbour of a large tree is listed, the fast local model reaches primes past 200000, and the search
// still collects elements fixing o, one of infinite order being what settles every tree (main.js autoCovering).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../../Geometric/Tools/padicGroups/trees/js/localField.js');
const { readJob } = await import('../../Geometric/Tools/discretenessAlgorithm/js/finite.js');
const { CoveringProblem, choosePlaces, runCovering, BIG_VALENCE } = await import('../js/covering.js');
const { infiniteOrderWord } = await import('../js/cusps.js');

const setup = (mats, S) => {
    const job = { poly: 'w^3-13', mats, S, sameField: true };
    const { F, mats: M } = readJob({ GlobalField }, job);
    const ch = choosePlaces({ Place }, F, M, S, true);
    return { F, M, ch };
};

test('the residue field cap is opt-in: drawing keeps it, computing need not', () => {
    const { F } = setup([['1', '1', '0', '1']], []);
    assert.throws(() => new Place(F, 13337n, 1), /too large to draw/);                       // F_13337², for drawing
    const P = new Place(F, 13337n, 1, { maxResidue: Infinity });
    assert.equal(P.q, 13337 * 13337);
    assert.equal(P.dist(P.canon(F.zero(), 0), P.child(P.canon(F.zero(), 0), 12345)), 1);
});

test('a random group over ℚ(∛13): the seven primes of S are found, with fast models at 4093, 13337, 299333', () => {
    const mats = [['w^2', 'w^2+w+1', '2*w^2+6*w-1', 'w^2'], ['w^2-w+1', '-w^2-1', 'w^2+1', 'w^2-w+1'], ['-w^2+1', 'w^2+2', '-2*w^2+w', '-w+1']];
    const S = [['2', 1, 1], ['2', 1, 2], ['3', 3, 1], ['11', 1, 1], ['4093', 1, 1], ['13337', 1, 1], ['299333', 1, 1]].map(([p, e, f]) => ({ p, e, f }));
    const { F, M, ch } = setup(mats, S);
    assert.ok(!ch.error, ch.error);
    assert.deepEqual(ch.places.map((P) => `${P.p}:${P.f}`), ['2:1', '2:2', '3:1', '11:1', '4093:1', '13337:1', '299333:1']);
    const P = new CoveringProblem(F, ch.places, M, { arch: [], metric: 'log' });
    assert.deepEqual(P.big, [false, false, false, false, true, true, true]);
    assert.equal(P.bigMode, true);
    assert.equal(P.targets.size, 0);                                // nothing listed
    assert.equal(P.reps.length, 1);
    assert.deepEqual(P.fast.slice(4).map(Boolean), [true, true, true]);
    // g₂ moves o one step at 299333 and nowhere else
    const T = P.act(P.gens[1], P.o);
    assert.deepEqual(T.map((vt, j) => P.places[j].dist(P.o[j], vt)), [0, 0, 0, 0, 0, 0, 1]);
});

test('ℚ(∛13), S = {𝔭 | 299333}: the search lists no neighbours and still finds Γ_o, with an element of infinite order', () => {
    const mats = [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['5*w^2+24*w-24', '0', '0', '1']];
    const { F, M, ch } = setup(mats, [{ p: '299333', e: 1, f: 1 }]);
    const P = new CoveringProblem(F, ch.places, M, { arch: [], metric: 'log' });
    assert.ok(P.places[0].q + 1 > BIG_VALENCE);
    const res = runCovering(P, { seconds: 4, beamWidth: 200, flashSize: 20 });
    assert.equal(res.status, 'budget');                             // never "covered": there is no covering here
    const words = P.stabilizerElements(50).map((e) => e.word);
    assert.ok(words.length > 0);
    const a = infiniteOrderWord(mats, [-13n, 0n, 0n, 1n], words);
    assert.ok(a && a.word.length, 'an element of infinite order fixing o');
});
