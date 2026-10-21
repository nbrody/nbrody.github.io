// The congruence closure written out (js/congruenceShape.js): lattices and counts checked by brute
// force, and the descriptions of a few closures.
import test from 'node:test';
import assert from 'node:assert/strict';

const { describeClosure, patternTex, modLConditionsTex, _internal: I } = await import('../js/congruenceShape.js');
const { _index } = await import('../js/congruence.js');
const md = (x, q) => ((x % q) + q) % q;

test('the lattice of a set of congruences, and its matrices of determinant 1, by brute force', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const q of [4, 8, 9, 5, 7, 25, 27, 13]) for (let t = 0; t < 12; t++) {
        const conds = [];
        for (let i = 0, k = 1 + Math.floor(rand() * 3); i < k; i++) {
            const f = [0, 1, 2, 3].map(() => Math.floor(rand() * 5) - 2);
            if (f.every((x) => !x)) f[2] = 1;
            const divs = []; for (let m = 2; m <= q; m++) if (q % m === 0) divs.push(m);
            conds.push({ f, m: divs[Math.floor(rand() * divs.length)] });
        }
        const holds = (v) => conds.every((c) => md(c.f[0] * v[0] + c.f[1] * v[1] + c.f[2] * v[2] + c.f[3] * v[3], c.m) === 0);
        let all = 0, sl = 0;
        for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) for (let c = 0; c < q; c++) for (let d = 0; d < q; d++) {
            if (!holds([a, b, c, d])) continue;
            all++;
            if (md(a * d - b * c, q) === 1 % q) sl++;
        }
        const B = I.latticeOfConds(conds, q);
        assert.equal(q ** 4 / B.reduce((s, r, i) => s * r[i], 1), all, `q = ${q}: the size of the lattice mod q`);
        assert.equal(I.slInHull(B, q, 1e9), sl / (q > 2 ? 2 : 1), `q = ${q}: its matrices of determinant 1`);
    }
});

test('Γ₀(3) and diag(2, 1): the closure is Γ₀(3) at 3, with no redundant condition', () => {
    const D = describeClosure([['1', '1', '0', '1'], ['1', '0', '3', '1'], ['2', '0', '0', '1']], [2], [3]);
    const [x] = D.local;
    assert.ok(x.exact);
    assert.deepEqual(x.conds, [{ f: [0, 0, 1, 0], m: 3 }]);
    assert.deepEqual(x.fixed, [[1, 0]]);
    assert.equal(patternTex(x.conds).matrix, '\\begin{pmatrix} a & b \\\\ 3c & d \\end{pmatrix}');
    assert.deepEqual(D.classes.basis, ['2']);
});

test('⟨T², L², diag(3, 1)⟩: the closure is Γ(2) mod 8 (a ≡ d is implied and dropped)', () => {
    const D = describeClosure([['1', '2', '0', '1'], ['1', '0', '2', '1'], ['3', '0', '0', '1']], [3], [8]);
    const [x] = D.local;
    assert.ok(x.exact);
    assert.equal(Math.round(x.ambient / x.order), 6);
    const P = patternTex(x.conds);
    assert.equal(P.matrix, '\\begin{pmatrix} a & 2b \\\\ 2c & d \\end{pmatrix}');
    assert.deepEqual(P.side, []);
});

test('⟨(0 −1; 1 1), (−7 0; −1 −4)⟩: full at 3, the stabilizer of [3 : 1] at 13, cut out prime by prime', () => {
    const rows = [['0', '-1', '1', '1'], ['-7', '0', '-1', '-4']];
    const J = _index(rows, [2, 7], [3, 13]);
    assert.equal(J.image, 1872, 'the joint image in SL₂(ℤ/39)/±1: 24 · 156 / 2');
    const D = describeClosure(rows, [2, 7], [3, 13], { jointOrder: J.image });
    const [x3, x13] = D.local;
    assert.ok(x3.exact && x3.conds.length === 0);
    assert.ok(x13.exact);
    assert.equal(Math.round(x13.ambient / x13.order), 14);
    assert.deepEqual(x13.fixed, [[3, 1]]);
    assert.equal(D.linked, 1);
});

test('⟨(1 −1; 1 2), (3 0; −1 −3)⟩ mod 8 · 31: a cyclic group mod 2, and Γ_H(31) for the fifth powers', () => {
    const D = describeClosure([['1', '-1', '1', '2'], ['3', '0', '-1', '-3']], [3], [8, 31]);
    const [x8, x31] = D.local;
    // mod 8: only g mod 2 matters, and it lies in the subgroup of order 3 of SL₂(𝔽₂)
    assert.equal(x8.modL.kind, 'cyclic');
    assert.equal(x8.modL.order, 3);
    assert.ok(x8.modL.cartan && x8.byModL && x8.kernel === x8.fullKernel);
    // mod 31: no linear description, but it fixes [25 : 1] with eigenvalue a fifth power there
    assert.ok(!x31.exact && x31.byModL);
    assert.deepEqual(x31.modL.points, [[25, 1]]);
    assert.equal(x31.modL.power, 5);
    assert.deepEqual(x31.modL.units, [1, 5, 6, 25, 26, 30]);
    assert.equal(x31.modL.order, x31.order);
    assert.deepEqual(modLConditionsTex(x31.modL, 31), ['g \\binom{25}{1} \\equiv \\lambda \\binom{25}{1} \\pmod{31}', '\\lambda \\in (\\mathbb{F}_{31}^{\\times})^{5}']);
});

test('the image mod ℓ by Dickson type, against its order', () => {
    const { shapeModL } = I;
    // the upper triangular group mod 7: the whole Borel (the eigenvalue 2 and −1 give all of 𝔽₇^×)
    const B = shapeModL([[1, 1, 0, 1], [2, 0, 0, 4], [6, 0, 0, 6]], 7, null, 1e5);
    assert.equal(B.kind, 'borel');
    assert.deepEqual(B.points, [[1, 0]]);
    assert.equal(B.power, 1);
    assert.equal(B.order, 21);
    // the diagonal group mod 13 with entries ±1, ±5 (fourth roots of unity): split, power 3
    const C = shapeModL([[5, 0, 0, 8], [12, 0, 0, 12]], 13, null, 1e5);
    assert.equal(C.kind, 'split');
    assert.equal(C.power, 3);
    assert.equal(C.order, 2);
    // A₄ in PSL₂(𝔽₅): the binary tetrahedral group, i, j and ω = (−1 + i + j + ij)/2
    const A4 = shapeModL([[2, 0, 0, 3], [0, 1, 4, 0], [3, 4, 3, 1], [4, 0, 0, 4]], 5, null, 1e5);
    assert.equal(A4.kind, 'A4');
    assert.equal(A4.order, 12);
    // its Q₈ alone, V₄: i fixes 0 and ∞ and j swaps them, so it lies in the normalizer of a split Cartan
    const V4 = shapeModL([[2, 0, 0, 3], [0, 1, 4, 0], [4, 0, 0, 4]], 5, null, 1e5);
    assert.equal(V4.kind, 'split-normalizer');
    assert.equal(V4.order, 4);
});

test('a level ℓ^k that only copies its image mod ℓ: the kernel of reduction is trivial', () => {
    const D = describeClosure([['1', '-3', '-2', '-1'], ['1', '-2', '-1', '-2']], [2, 7], [9]);
    const [x] = D.local;
    assert.equal(x.modL.kind, 'full');
    assert.equal(x.kernel, 1);
    assert.equal(x.fullKernel, 27);
    assert.ok(!x.byModL);
});
