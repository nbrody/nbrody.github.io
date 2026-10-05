// Run from the trees directory:  node --test tests/*.test.mjs
// Fields read by expr.js into a tower (as in Kleinian/poincare), then made into trees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../../../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../js/localField.js');
const { readGroup } = await import('../../../../../assets/js/hyperbolic/expr.js');
const { decide } = await import('../js/discreteness.js');

/** Read { mats, consts } exactly and make the field and matrices. */
function read(state) {
    const r = readGroup(state);
    assert.ok(r.exact, r.reason);
    const F = GlobalField.fromTower(r.field);
    const mats = r.gens.map((M) => ({ a: F.fromT(M.a), b: F.fromT(M.b), c: F.fromT(M.c), d: F.fromT(M.d) }));
    return { F, mats, K: r.field };
}
const efs = (F, p) => F.primesAbove(BigInt(p)).map((q) => `${q.e}${q.f}`).sort().join(' ');

test('ℚ(√2, i) splits primes as ℚ(ζ₈) does', () => {
    const { F } = read({ mats: [['\\sqrt{2}', 'i', '0', '1']] });
    assert.equal(F.n, 4);
    assert.equal(F.tower.height, 2);
    const Z = new GlobalField({ gen: 'w', poly: 'w^4+1' });
    for (const p of [2, 3, 5, 7, 17, 41]) assert.equal(efs(F, p), efs(Z, p), `p = ${p}`);
});

test('labels read back through expr.js', () => {
    const { F, mats } = read({ mats: [['\\sqrt{2}', 'i', '0', '1']], consts: [['t', '3/4']] });
    const x = F.add(F.mul(mats[0].a, mats[0].b), F.fromInt(2));          // 2 + √2·i
    assert.equal(F.format(x), '2 + √2·i');
    const back = readGroup({ mats: [['1', F.source(x), '0', '1'], ['\\sqrt{2}', 'i', '0', '1']] });
    const G = GlobalField.fromTower(back.field);
    assert.equal(G.format(G.fromT(back.gens[0].b)), '2 + √2·i');
    assert.equal(F.tex(x), '2 + \\sqrt{2} i');
});

test('root rows and value rows become levels of the tower', () => {
    const { F, K } = read({
        mats: [['w', '1', '0', '1'], ['s', '0', '0', '1']],
        consts: [{ name: 'w', poly: 'w^3-2', near: { re: 1.26, im: 0 } }, ['s', '\\sqrt{-3}']],
    });
    assert.equal(F.n, 6);
    assert.deepEqual(K.levels.slice(1).map((L) => L.text), ['w', 's']);
    // ℚ(∛2, √−3) is the splitting field of x³ − 2: 2 and 3 are totally ramified, 5 = 𝔭₁𝔭₂ with f = 2
    assert.equal(efs(F, 2), '32');          // e = 3 from ∛2, f = 2 from √−3
    assert.equal(efs(F, 3), '61');          // totally ramified
    assert.equal(efs(F, 5), '12 12 12');    // Frobenius of order 2 in S₃
    assert.deepEqual(F.minpolyQ(F.gens[0].elem), [-2n, 0n, 0n, 1n]);
});

test('the action axioms over a two-level tower', () => {
    const { F, mats } = read({ mats: [['\\sqrt{2}', '0', '0', '1'], ['1', 'i', '0', '1'], ['0', '-1', '1', '0'], ['1+i', '3', '1', '\\sqrt{2}']] });
    for (const p of [2, 3, 7]) {
        for (let idx = 0; idx < F.primesAbove(BigInt(p)).length; idx++) {
            const P = new Place(F, p, idx);
            const o = { k: 0, lo: 0, d: [] };
            const gs = mats.map((m) => P.prepare(m));
            const inv = mats.map((m) => P.prepare(P.adjugate(m)));
            const ball = [o, ...P.neighbors(o), ...P.children(P.children(o)[1])];
            for (const v of ball) {
                assert.deepEqual(P.canon(P.elem(v), v.k), v, 'canonical labels');
                gs.forEach((g, i) => assert.deepEqual(P.act(inv[i], P.act(g, v)), v, 'inverse'));
            }
            for (const g of gs) {
                const img = ball.map((v) => P.act(g, v));
                for (let i = 0; i < ball.length; i++) for (let j = i + 1; j < ball.length; j += 2) {
                    assert.equal(P.dist(img[i], img[j]), P.dist(ball[i], ball[j]), 'isometry');
                }
            }
        }
    }
});

test('discreteness over a tower: a Schottky pair over ℚ(√2) at 7', () => {
    // λ = (3+√2)⁴, a power of a uniformizer at one prime above 7, and a conjugate of diag(λ, 1) with axis (1, 8)
    const L = '(3+\\sqrt{2})^4';
    const { F, mats } = read({ mats: [[L, '0', '0', '1'], [`${L}-8`, `8-8${L}`, `${L}-1`, `1-8${L}`]] });
    const verdicts = F.primesAbove(7n).map((_, idx) => decide(new Place(F, 7, idx), mats, { k: 0, lo: 0, d: [] }, { seconds: 20 }).verdict).sort();
    assert.deepEqual(verdicts, ['discrete', 'nondiscrete']);
});
