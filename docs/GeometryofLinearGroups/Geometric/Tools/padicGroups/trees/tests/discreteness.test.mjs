// Run from the trees directory:  node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../../../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../js/localField.js');
const { decide, elementOrder, evaluateWord, projKey, maxElementOrder } = await import('../js/discreteness.js');

const mat = (F, e) => { const [a, b, c, d] = e.map((s) => F.parse(s)); return { a, b, c, d }; };
const O = { k: 0, lo: 0, d: [] };
const run = (F, p, mats, idx = 0, base = O) => {
    const P = new Place(F, p, idx);
    const ms = mats.map((m) => mat(F, m));
    const r = decide(P, ms, base, { seconds: 20 });
    // every certificate's words must evaluate to its matrices
    for (const b of r.basis || []) assert.equal(projKey(F, evaluateWord(F, ms, b.w)), projKey(F, b.x), 'basis marking');
    if (r.witness) assert.equal(projKey(F, evaluateWord(F, ms, r.witness.w)), projKey(F, r.witness.x), 'witness marking');
    return r;
};

test('orders of elements of PGL₂(K)', () => {
    const Q = new GlobalField(null);
    assert.equal(maxElementOrder(1), 6);
    assert.equal(elementOrder(Q, mat(Q, ['0', '-1', '1', '0'])), 2);
    assert.equal(elementOrder(Q, mat(Q, ['0', '-1', '1', '1'])), 3);          // cube is −I
    assert.equal(elementOrder(Q, mat(Q, ['1', '-1', '1', '1'])), 4);          // tr²/det = 2
    assert.equal(elementOrder(Q, mat(Q, ['1', '-1', '1', '2'])), 6);          // tr²/det = 3
    assert.equal(elementOrder(Q, mat(Q, ['1', '1', '0', '1'])), null);
    assert.equal(elementOrder(Q, mat(Q, ['2', '0', '0', '1'])), null);
    const K = new GlobalField({ gen: 'w', poly: 'w^2-w-1' });               // w = 2cos(π/5)
    assert.equal(elementOrder(K, mat(K, ['w', '-1', '1', '0'])), 5);           // order 10 in SL₂
});

test('ℚ₃: the default pair is free and discrete', () => {
    const F = new GlobalField(null);
    const r = run(F, 3, [['3', '0', '0', '1'], ['5', '-4', '2', '-1']]);
    assert.equal(r.verdict, 'discrete');
    assert.equal(r.kind, 'free');
    assert.equal(r.freeRank, 2);
});

test('nondiscrete: a unipotent, a unit diagonal, PSL₂(ℤ) at 3', () => {
    const F = new GlobalField(null);
    let r = run(F, 3, [['1', '1', '0', '1'], ['3', '0', '0', '1']]);
    assert.equal(r.verdict, 'nondiscrete');
    assert.deepEqual(r.witness.w, [1]);
    r = run(F, 3, [['2', '0', '0', '1'], ['1', '3', '0', '1']]);
    assert.equal(r.verdict, 'nondiscrete');
    r = run(F, 3, [['0', '-1', '1', '0'], ['1', '-1', '1', '0']]);    // generates PSL₂(ℤ), inside PGL₂(ℤ₃)
    assert.equal(r.verdict, 'nondiscrete');
    assert.equal(r.method, 'bounded');
});

test('finite groups are discrete', () => {
    const F = new GlobalField(null);
    const r = run(F, 5, [['0', '-1', '1', '0'], ['0', '1', '1', '0']]);  // Klein four-group in PGL₂(ℚ)
    assert.equal(r.verdict, 'discrete');
    assert.equal(r.kind, 'finite');
    assert.equal(r.order, 4);
    const s3 = run(F, 7, [['0', '-1', '1', '-1'], ['0', '1', '1', '0']]); // S₃
    assert.equal(s3.order, 6);
});

test('torsion: the infinite dihedral group via a congruence kernel', () => {
    const F = new GlobalField(null);
    const r = run(F, 3, [['0', '1', '1', '0'], ['3', '0', '0', '1']]);
    assert.equal(r.verdict, 'discrete');
    assert.equal(r.kind, 'virtually-free');
    assert.ok(r.kernel && r.kernel.ell !== 3);
});

test('number fields: the two primes above 5 in ℚ(i)', () => {
    const F = new GlobalField({ gen: 'i', poly: 'i^2+1' });
    const mats = [['2+i', '0', '0', '1'], ['1', '5', '0', '1'], ['1', '0', '5', '1']];
    const verdicts = [0, 1].map((idx) => run(F, 5, mats, idx).verdict);
    assert.ok(verdicts.every((v) => v === 'nondiscrete'));   // unipotents of infinite order
    // a Schottky group over the inert prime 3: hyperbolics of length 4 with axes 0∞, (1, 1+3i), (i, i+3)
    const r = run(F, 3, [['81', '0', '0', '1'], ['80-3i', '-80-240i', '80', '-80-243i'], ['-3+80i', '80-240i', '80', '-243-80i']]);
    assert.equal(r.verdict, 'discrete', r.reason);
    assert.equal(r.freeRank, 3);
});

test('rank three: a Schottky group at 2', () => {
    // conjugates of diag(256, 1) with axes 0∞, 1–3 and 2–6
    const F = new GlobalField(null);
    const r = run(F, 2, [['256', '0', '0', '1'], ['253', '-765', '255', '-767'], ['506', '-3060', '255', '-1534']]);
    assert.equal(r.verdict, 'discrete', r.reason);
    assert.equal(r.kind, 'free');
    assert.equal(r.freeRank, 3);
    assert.equal(r.method, 'markowitz');
    // the same group from a different base vertex
    const s = run(F, 2, [['256', '0', '0', '1'], ['253', '-765', '255', '-767'], ['506', '-3060', '255', '-1534']], 0, { k: 3, lo: 0, d: [1, 1, 0] });
    assert.equal(s.verdict, 'discrete', s.reason);
    // adding a short word of the generators changes nothing
    const t = run(F, 2, [['256', '0', '0', '1'], ['253', '-765', '255', '-767'], ['506', '-3060', '255', '-1534'], ['253*256', '-765', '255*256', '-767']]);
    assert.equal(t.verdict, 'discrete', t.reason);
    assert.equal(t.freeRank, 3);
});

test('free verdicts agree with the orbit: reduced words move the base vertex injectively', async () => {
    const { makeLetters, computeOrbit } = await import('../js/groupWords.js');
    const cases = [
        [null, 3, [['3', '0', '0', '1'], ['5', '-4', '2', '-1']]],
        [null, 2, [['256', '0', '0', '1'], ['253', '-765', '255', '-767'], ['506', '-3060', '255', '-1534']]],
        [{ gen: 'i', poly: 'i^2+1' }, 3, [['81', '0', '0', '1'], ['80-3i', '-80-240i', '80', '-80-243i'], ['-3+80i', '80-240i', '80', '-243-80i']]],
    ];
    for (const [spec, p, ms] of cases) {
        const F = new GlobalField(spec), P = new Place(F, p);
        const mats = ms.map((m) => mat(F, m));
        const r = decide(P, mats, O, { seconds: 20 });
        assert.equal(r.verdict, 'discrete');
        const orbit = computeOrbit(P, O, makeLetters(P, mats), 4);
        assert.equal(orbit.orbitMap.size, orbit.wordCount, `free action on the orbit (${JSON.stringify(ms)})`);
    }
});
