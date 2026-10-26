// node --test tests/*.test.mjs   (from Arithmetic/Tools/numberRingGroups)
//
// Known values: H_1 of SL_2(Z), GL_2(Z), PSL_2(Z); H_1(PSL_2(O_{-d})) for d = 1, 2, 3, 7, 11, 19 (Swan
// 1971; Fine, Algebraic theory of the Bianchi groups); fundamental units. Hilbert modular groups have
// finite abelianization (congruence subgroup property, Serre), so the free rank of H_1(PGL_2) and
// H_1(PSL_2) must be 0 for real quadratic and cubic fields, and that of H_1(GL_2) must be the unit rank.
// Regression values (from this engine) are marked as such.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll } from '../js/engine.js';
import { evalWord, wordFor } from '../js/brown.js';
import { quotient } from '../../../../PresentationCalc/js/intlin.js';
import { latexToPlain } from '../js/latexInput.js';

const ab = (a) => `${a.rank}|${a.torsion.join(',')}`;

test('Q: GL_2(Z), SL_2(Z), PGL_2(Z), PSL_2(Z)', () => {
    const R = computeAll('x');
    assert.equal(ab(R.GL2.abelianization), '0|2,2');
    assert.equal(ab(R.SL2.abelianization), '0|12');
    assert.equal(ab(R.PGL2.abelianization), '0|2,2');
    assert.equal(ab(R.PSL2.abelianization), '0|6');
    assert.equal(R.complex.length, 1);
});

const SWAN = { 'x^2+1': '0|2,2', 'x^2+2': '1|6', 'x^2-x+1': '0|3', 'x^2+7': '1|2', 'x^2+11': '1|3', 'x^2+19': '1|' };
for (const [f, want] of Object.entries(SWAN)) {
    test(`H_1(PSL_2(O)) for ${f} (Swan)`, () => {
        const R = computeAll(f);
        assert.equal(ab(R.PSL2.abelianization), want);
    });
}

test('class number two: Q(√-5), Q(√-6) (regression)', () => {
    assert.equal(ab(computeAll('x^2+5').PSL2.abelianization), '2|2,6');
    assert.equal(ab(computeAll('x^2+6').PSL2.abelianization), '2|6');
});

for (const [f, unit] of [['x^2-2', '1 + a'], ['x^2-3', '2 + a'], ['x^2-x-1', 'a'], ['x^3-2', '-1 + a']]) {
    test(`units and finite abelianizations for ${f}`, () => {
        const R = computeAll(f);
        assert.deepEqual(R.field.fundamental, [unit]);
        assert.equal(R.PGL2.abelianization.rank, 0);
        assert.equal(R.PSL2.abelianization.rank, 0);
        assert.equal(R.SL2.abelianization.rank, 0);
        assert.equal(R.GL2.abelianization.rank, 1);
    });
}

test('Hilbert modular regressions: PSL_2 over Q(√5), Q(√2), Q(√3), Q(√13)', () => {
    assert.equal(ab(computeAll('x^2-x-1').PSL2.abelianization), '0|');
    assert.equal(ab(computeAll('x^2-2').PSL2.abelianization), '0|2,2');
    assert.equal(ab(computeAll('x^2-3').PSL2.abelianization), '0|2,6');
    assert.equal(ab(computeAll('x^2-13').PSL2.abelianization), '0|3,3');
});

test('CM quartic: Q(ζ_5) has unit rank 1 and one cell orbit with stabilizer A_5 in PGL_2', () => {
    const R = computeAll('x^4+x^3+x^2+x+1');
    assert.equal(R.field.w, 10);
    assert.equal(R.field.fundamental.length, 1);
    assert.equal(R.complex.length, 1);
    assert.equal(R.complex[0].pglStab.name, 'A5');
    assert.equal(R.PGL2.abelianization.rank, 0);
});

// Two words for the same matrix (a random word, and the walk's word) must agree in the
// abelianization of the presented group: a missing relation would usually show up here.
for (const f of ['x^2+5', 'x^2-x-1', 'x^2+23', 'x^3-x-1']) {
    test(`walk words agree with random words in H_1 of the presented GL_2 (${f})`, () => {
        const R = computeAll(f);
        const { space, cx, P } = R._internal;
        const L = P.letters.length;
        const vec = (w) => { const v = new Array(L).fill(0n); for (const x of w) v[Math.abs(x) - 1] += x > 0 ? 1n : -1n; return v; };
        const Q = quotient(P.relators.map(vec), L);
        let seed = 11;
        const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        for (let t = 0; t < 12; t++) {
            const w = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => { const x = 1 + Math.floor(rng() * L); return rng() < 0.5 ? x : -x; });
            const g = evalWord(space, P.letters, w);
            const w2 = wordFor(cx, P, g, { rng });
            assert.equal(space.matKey(evalWord(space, P.letters, w2)), space.matKey(g));
            assert.deepEqual(Q.coords(vec(w)), Q.coords(vec(w2)));
        }
    });
}

test('LaTeX input', () => {
    assert.equal(latexToPlain('x^{2}+5', { variable: 'x' }).replace(/\s/g, ''), 'x^(2)+5');
    assert.equal(latexToPlain('\\frac{1+\\sqrt{-5}}{2}', { gen: ['\\sqrt{-5}', 'a'] }).replace(/\s/g, ''), '((1+(a))/(2))');
    assert.equal(latexToPlain('\\frac{2+2i}{2}', { gen: ['i', 'a'] }).replace(/\s/g, ''), '((2+2(a))/(2))');
    assert.throws(() => latexToPlain('x^2+y', { variable: 'x' }));
});
