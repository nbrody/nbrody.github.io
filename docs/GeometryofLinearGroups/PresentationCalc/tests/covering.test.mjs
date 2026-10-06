// Run from the PresentationCalc directory (Node 22+):
//   node --test tests/*.test.mjs
// Uses trees' local fields in place, as the page's worker does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../../Geometric/Tools/padicGroups/trees/js/localField.js');
const {
    CoveringProblem, runCovering, choosePlaces, fastPlace, makeRing, integralMatrix, normalizeM, mulM, wordMatrix,
} = await import('../js/covering.js');
const { FlashBeam, concatWords, invertWord } = await import('../js/flashbeam.js');

const field = (poly) => new GlobalField(poly ? { gen: 'w', poly } : null);
const mats = (F, ms) => ms.map((m) => { const [a, b, c, d] = m.map((s) => F.parse(s)); return { a, b, c, d }; });
/** a + bi + cj + dk as (a + bi, c + di; −c + di, a − bi) over ℚ(w), w² = −1. */
const quat = (a, b, c, d) => [`${a}+${b}*w`, `${c}+${d}*w`, `${-c}+${d}*w`, `${a}-${b}*w`];

function cover(poly, ms, S, sameField, opts = {}) {
    const F = field(poly);
    const M = mats(F, ms);
    const ch = choosePlaces({ Place }, F, M, S, sameField);
    assert.ok(!ch.error, ch.error);
    const P = new CoveringProblem(F, ch.places, M, opts);
    const res = runCovering(P, { seconds: opts.seconds ?? 20 });
    return { F, P, res };
}

test('free reduction of words', () => {
    assert.deepEqual(concatWords([1, 2, -3], [3, -2, 1]), [1, 1]);
    assert.deepEqual(concatWords([1, 2], [-2, -1]), []);
    assert.deepEqual(invertWord([1, -2, 3]), [-3, 2, -1]);
});

test('the fast local model agrees with trees’ exact action', () => {
    for (const [poly, p, idx] of [[null, 2n, 0], [null, 3n, 0], ['w^2+1', 5n, 0], ['w^2+1', 5n, 1], ['w^2+1', 13n, 1], ['w^2-2', 7n, 0]]) {
        const F = field(poly);
        const P = new Place(F, p, idx);
        const fp = fastPlace(F, P);
        assert.ok(fp, `fast model at ${p}`);
        const R = makeRing(F);
        const gens = mats(F, poly ? [['3+w', '2', '1', 'w'], ['1', '5*w', '0', '7'], ['2', '1', '1', '1']] : [['3', '2', '1', '1'], ['1', '5', '0', '7'], ['4', '1', '6', '1']])
            .map((m) => integralMatrix(F, m));
        // vertices: a ball around o
        const o = P.canon(F.zero(), 0);
        const verts = [o];
        for (let i = 0; i < 2; i++) for (const v of verts.slice()) for (const u of P.neighbors(v)) verts.push(u);
        let M = gens[0];
        for (let step = 0; step < 6; step++) {
            M = normalizeM(mulM(R, M, gens[step % gens.length]));
            const g = fp.prepare(M);
            const ex = P.prepare({ a: { v: M[0], den: 1n }, b: { v: M[1], den: 1n }, c: { v: M[2], den: 1n }, d: { v: M[3], den: 1n } });
            for (const v of verts) {
                const fast = g && fp.act(g, v);
                if (!fast) continue;
                assert.equal(P.id(fast), P.id(P.act(ex, v)), `${poly || 'ℚ'} at ${p}#${idx}`);
            }
            for (const e of M) if (e.some((t) => t)) assert.equal(fp.val(e), P.val({ v: e, den: 1n }));
        }
    }
});

test('PGL₂(ℤ[½]) is covered at once, and the certificate checks', () => {
    const { P, res } = cover(null, [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']], [{ p: 2, e: 1, f: 1 }], true);
    assert.equal(res.status, 'covered');
    assert.equal(P.reps.length, 1);
    assert.ok(res.verify.ok);
    assert.equal(res.verify.checked, 3);
    assert.ok(P.stabilizerElements(4).length >= 2, 'T and S fix o');
});

test('type-preserving PSL₂(ℤ[1/5]) needs two representatives', () => {
    const { P, res } = cover(null, [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['25', '0', '0', '1']], [{ p: 5, e: 1, f: 1 }], true);
    assert.equal(res.status, 'covered');
    assert.equal(P.reps.length, 2);
    assert.ok(res.verify.ok);
});

test('Hurwitz quaternions ⟨1+2i, 1+2j, 3+2i, 3+2j⟩ cover T₆ × T₁₄', () => {
    const { P, res } = cover('w^2+1', [quat(1, 2, 0, 0), quat(1, 0, 2, 0), quat(3, 2, 0, 0), quat(3, 0, 2, 0)],
        [{ p: 5, e: 1, f: 1 }, { p: 13, e: 1, f: 1 }], false, { seconds: 60 });
    assert.equal(P.places.length, 2, 'one prime of ℚ(i) above each of 5 and 13');
    assert.equal(res.status, 'covered');
    assert.ok(res.verify.ok);
    assert.equal(res.verify.checked, P.targets.size);
});

test('a forged certificate is rejected', () => {
    const { P, res } = cover(null, [['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']], [{ p: 2, e: 1, f: 1 }], true);
    assert.equal(res.status, 'covered');
    const cert = P.certificate();
    const bad = { ...cert, witnesses: cert.witnesses.map((w, i) => (i === 0 ? { ...w, word: [1] } : w)) };
    const v = P.verify(bad);
    assert.equal(v.ok, false);
    const missing = { ...cert, witnesses: cert.witnesses.slice(1) };
    assert.equal(P.verify(missing).ok, false);
});

test('choosing places: local degree 1 only', () => {
    // 3 is inert in ℚ(i): a group over ℚ(i) with trace field ℚ, unbounded at 3, is not handled
    const F = field('w^2+1');
    const M = mats(F, [quat(1, 1, 1, 0), quat(1, 2, 0, 0)]);
    const ch = choosePlaces({ Place }, F, M, [{ p: 3, e: 1, f: 1 }], false);
    assert.ok(ch.error && /local degree/.test(ch.error), ch.error);
});

test('FlashBeam keeps the flash balanced and the beam stratified', () => {
    // a toy problem: integers under +1/−1, score |x − 37|, stratum by sign
    let found = null;
    const node = (x, word) => ({ state: x, word, key: String(x), score: Math.abs(x - 37), stratum: x < 0 ? 1 : 0 });
    const problem = {
        identity: () => node(0, []),
        generators: () => [node(1, [1]), node(-1, [-1])],
        multiply: (a, b) => node(a.state + b.state, concatWords(a.word, b.word)),
        isIdentity: (n) => n.state === 0,
        visit: (n) => { if (n.state === 37) found = n; },
        done: () => !!found,
    };
    const beam = new FlashBeam(problem, { beamWidth: 20, flashSize: 4, strata: [0.5, 0.5] });
    for (let i = 0; i < 40 && !found; i++) beam.step();
    assert.ok(found, 'reached 37');
    assert.ok(found.word.length < 40, 'the flash takes long steps');
});

test('wordMatrix multiplies out a word', () => {
    const F = field(null);
    const R = makeRing(F);
    const [T, S] = mats(F, [['1', '1', '0', '1'], ['0', '-1', '1', '0']]).map((m) => integralMatrix(F, m));
    const one = integralMatrix(F, { a: F.one(), b: F.zero(), c: F.zero(), d: F.one() });
    // (ST)³ = 1 in PSL₂(ℤ)
    const M = wordMatrix(R, [T, S], [2, 1, 2, 1, 2, 1], one);
    assert.ok(M[1].every((t) => t === 0n) && M[2].every((t) => t === 0n) && M[0].every((t, i) => t === M[3][i]));
});
