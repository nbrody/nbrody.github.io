// node --test tests/elementary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { elementaryPresentation, _internal } from '../js/elementary.js';
import { multRelations, numberField } from '../js/numfield.js';
import { snf, hnf, leftKernel, quotient } from '../js/intlin.js';

// valuations over number fields come from ringEngine.js
globalThis.NumberRingEngine = createRequire(import.meta.url)('../../Algebraic/Tools/numberRings/ringEngine.js');

const rows = (k) => k.split('|').map((m) => m.split(','));
const run = (kind, k, field = {}) => elementaryPresentation({ rows: rows(k), kind, ...field });
const r2 = { poly: [-2n, 0n, 1n], root: { re: Math.SQRT2, im: 0 } };
const qi = { poly: [1n, 0n, 1n], root: { re: 0, im: 1 } };

test('integer linear algebra: Hermite and Smith forms, kernels, quotients', () => {
    const A = [[2n, 4n, 4n], [-6n, 6n, 12n], [10n, -4n, -16n]];
    const { D, P, Q } = snf(A);
    const mul = (X, Y) => X.map((r) => Y[0].map((_, j) => r.reduce((s, x, k) => s + x * Y[k][j], 0n)));
    assert.deepEqual(mul(mul(P, A), Q), D);
    assert.deepEqual([D[0][0], D[1][1], D[2][2]], [2n, 6n, 12n]);
    const H = hnf(A);
    assert.deepEqual(mul(H.U, A), H.H);
    for (const x of leftKernel([[1n, 2n], [2n, 4n], [3n, 6n]])) assert.deepEqual(mul([x], [[1n, 2n], [2n, 4n], [3n, 6n]])[0], [0n, 0n]);
    // ℤ² / ⟨(2, 0), (0, 3)⟩ ≅ ℤ/6
    assert.deepEqual(quotient([[2n, 0n], [0n, 3n]], 2).orders, [6n]);
});

test('multiplicative relations: exact over ℚ, units over ℚ(√2), roots of unity over ℚ(i)', () => {
    const Q = numberField([0n, 1n]);
    const L = multRelations(Q, [Q.rat(4n), Q.rat(2n), Q.rat(-8n)]).L;
    // 4 = 2², −8 = −2³: relations (1, −2, 0) and (0, 6, −2)... the lattice has rank 2 and index 2 for the sign
    assert.equal(L.length, 2);
    const K = numberField(r2.poly, r2.root);
    const u = K.el([1n, 1n]);                                   // 1 + √2
    const rel = multRelations(K, [u, K.mul(u, u), K.rat(-1n)]);
    assert.equal(rel.L.length, 2);
    const G = numberField(qi.poly, qi.root);
    const i = G.el([0n, 1n]);
    const r = multRelations(G, [i, G.rat(-1n)]);
    assert.equal(r.torsion, 4);
});

test('ℤ[1/6] ⋊ ℤ: ⟨(1 1; 0 1), diag(3, 2)⟩ — the ℤ[1/6]-presentation, not finitely presented', () => {
    const E = run('borel', '1,1,0,1|3,0,0,2');
    assert.equal(E.structure, '\\mathbb{Z}[\\tfrac{1}{6}] \\rtimes \\mathbb{Z}');
    assert.deepEqual(E.gens.map((g) => `${g.name}=${g.wordTex}`), ['u=g_{1}', 't=g_{2}']);
    assert.deepEqual(E.relations, ['t\\, u\\, t^{-1} = u^{3/2}']);
    assert.equal(E.finitelyPresented, false);
    assert.equal(E.ordinary.finite, false);
    assert.deepEqual(E.ordinary.relators, ['t\\, u^{2}\\, t^{-1} = u^{3}']);
});

test('BS(1, 2) is finitely presented; with −1 a P. Hall extension', () => {
    const E = run('borel', '1,1,0,1|2,0,0,1');
    assert.equal(E.finitelyPresented, true);
    assert.equal(E.ordinary.finite, true);
    assert.deepEqual(E.ordinary.relators, ['t\\, u\\, t^{-1} = u^{2}']);
    const F = run('borel', '-1,0,0,1|1,1,0,1|2,0,0,1');
    assert.match(F.structure, /\\mathbb\{Z\}\/2/);
    assert.ok(F.ordinary.relators.includes('z\\, u\\, z^{-1} = u^{-1}'));
});

test('split and non-split extensions of ℤ² by a ℤ[1/N]', () => {
    const split = run('borel', '3,1,0,2|5,0,0,1');                  // moved lifts commute
    assert.equal(split.split, true);
    assert.equal(split.finitelyPresented, false);
    const non = run('borel', '3,0,0,1|5,1,0,1');                    // [t₁, t₂] = u
    assert.equal(non.split, false);
    assert.equal(non.finitelyPresented, true);
    assert.ok(non.relations.includes('[t_{1}, t_{2}] = u'));
});

test('finite, unipotent, tori and their normalizers', () => {
    assert.equal(run('finite', '0,1,1,0|0,-1,1,-1').structure, 'D_{3}');
    assert.equal(run('finite', '0,-1,1,1').structure, '\\mathbb{Z}/3');
    const U = run('unipotent', '1,2,0,1|1,3,0,1');
    assert.equal(U.structure, '\\mathbb{Z}');
    assert.deepEqual(U.given, ['g_{1} = u^{2}', 'g_{2} = u^{3}']);
    assert.equal(run('normalizer', '2,0,0,1|0,1,1,0').structure, 'D_{\\infty}');
    assert.equal(run('torus', '2,0,0,1|3,0,0,1|-1,0,0,1').structure, '\\mathbb{Z}^{2} \\times \\mathbb{Z}/2');
    assert.equal(run('torus', '2,1,1,1|5,3,3,2').structure, '\\mathbb{Z}');                  // non-split over ℚ
    assert.equal(run('torus', '3,-4,4,3|0,-1,1,0').structure, '\\mathbb{Z} \\times \\mathbb{Z}/2');
    assert.equal(run('unipotent-ext', '-1,1,0,1|1,1,0,1').structure, '\\mathbb{Z} \\rtimes \\mathbb{Z}/2');
});

test('number fields: ℤ[1/2]² ⋊ (ℤ × ℤ/4) over ℚ(i), units over ℚ(√2)', () => {
    const B = run('borel', 'w,0,0,1|1,1,0,1|2,0,0,1', qi);
    assert.equal(B.structure, '\\mathbb{Z}[\\tfrac{1}{2}]^{2} \\rtimes (\\mathbb{Z} \\times \\mathbb{Z}/4)');
    assert.equal(run('unipotent', '1,1,0,1|1,w,0,1|1,1+w,0,1', r2).structure, '\\mathbb{Z}^{2}');
    const T = run('torus', '1+w,0,0,1|3+2*w,0,0,1|-1,0,0,1', r2);
    assert.equal(T.structure, '\\mathbb{Z} \\times \\mathbb{Z}/2');
    assert.ok(T.unitGap > 0.1);
});

test('Laurent expansions in the multipliers give the module elements', () => {
    // 1/6 in ℤ[(3/2)^±1]: Σ n_e (3/2)^e = 1/6
    const P = _internal.laurent({ n: 1n, q: 6n }, 3n, 2n);
    let num = 0n, den = 1n;
    for (const [e, n] of P) {
        const [a, b] = e >= 0 ? [3n ** BigInt(e), 2n ** BigInt(e)] : [2n ** BigInt(-e), 3n ** BigInt(-e)];
        num = num * b + n * a * den; den *= b;
    }
    assert.equal(num * 6n, den);
});
