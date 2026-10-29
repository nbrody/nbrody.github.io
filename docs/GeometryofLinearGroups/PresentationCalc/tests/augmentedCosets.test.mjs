// node --test tests/augmentedCosets.test.mjs
// Augmented coset enumeration (felsch.js enumerateFelschAugmented / expressGenerators): every label is
// checked in a faithful matrix model of the group, so a wrong label cannot pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateFelsch, enumerateFelschAugmented, expressGenerators } from '../js/felsch.js';
import { ringPresentation, indexInPGL2O } from '../js/numberRingIndex.js';
import { evalWord } from '../../Arithmetic/Tools/numberRingGroups/js/brown.js';

// PSL₂(ℤ) = ⟨a, b | a², b³⟩, faithful on matrices up to sign
const mm = (X, Y) => [X[0] * Y[0] + X[1] * Y[2], X[0] * Y[1] + X[1] * Y[3], X[2] * Y[0] + X[3] * Y[2], X[2] * Y[1] + X[3] * Y[3]];
const adj = (X) => [X[3], -X[1], -X[2], X[0]];
const pm = (X, Y) => X.every((x, i) => x === Y[i]) || X.every((x, i) => x === -Y[i]);
const GEN = [[0n, -1n, 1n, 0n], [0n, -1n, 1n, 1n]];             // a, b
const letterMat = (x) => (x & 1 ? adj(GEN[x >> 1]) : GEN[x >> 1]);
const wordMat = (w) => w.reduce((M, x) => mm(M, letterMat(x)), [1n, 0n, 0n, 1n]);
const REL = [[0, 0], [2, 2, 2]];

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const randomWord = (len) => Array.from({ length: len }, () => Math.floor(rand() * 4));

test('PSL₂(ℤ): random generating sets, a and b in terms of them', () => {
    let tried = 0;
    for (let trial = 0; trial < 400 && tried < 25; trial++) {
        const S = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => randomWord(1 + Math.floor(rand() * 6)));
        const plain = enumerateFelsch(2, REL, S, { seconds: 2 });
        if (plain.index !== 1) continue;
        tried++;
        const r = expressGenerators(2, REL, S, { seconds: 5 });
        assert.equal(r.index, 1);
        const Smat = S.map(wordMat);
        r.words.forEach((w, k) => {
            const M = w.reduce((X, s) => mm(X, s > 0 ? Smat[s - 1] : adj(Smat[-s - 1])), [1n, 0n, 0n, 1n]);
            assert.ok(pm(M, GEN[k]), `generator ${k} from ${JSON.stringify(S)}`);
        });
    }
    assert.ok(tried >= 10);
});

test('PSL₂(ℤ): Schreier generators t_c·x·t_{c·x}⁻¹ = L(c, x) at finite index', () => {
    let tried = 0;
    for (let trial = 0; trial < 400 && tried < 20; trial++) {
        const S = Array.from({ length: 2 }, () => randomWord(2 + Math.floor(rand() * 5)));
        const r = enumerateFelschAugmented(2, REL, S, { seconds: 2, maxCosets: 5000 });
        if (!r.index || r.index < 2 || r.index > 60) continue;
        tried++;
        const Smat = S.map(wordMat);
        // t_c from the definitions (original coset numbers)
        const tMemo = new Map([[0, [1n, 0n, 0n, 1n]]]);
        const t = (c) => { if (tMemo.has(c)) return tMemo.get(c); const [p, x] = r.defs[c]; const M = mm(t(p), letterMat(x)); tMemo.set(c, M); return M; };
        r.table.forEach((row, ci) => row.forEach((d, x) => {
            const w = r.expand(r.labels[ci][x]);
            const L = w.reduce((X, s) => mm(X, s > 0 ? Smat[s - 1] : adj(Smat[-s - 1])), [1n, 0n, 0n, 1n]);
            const lhs = mm(mm(t(r.live[ci]), letterMat(x)), adj(t(r.live[d])));
            assert.ok(pm(lhs, L));
        }));
    }
    assert.ok(tried >= 5);
});

test('PGL₂(O_k) over ℚ(√5) and ℚ(√−5): its generators in terms of random generating sets', () => {
    for (const poly of ['w^2-w-1', 'w^2+5']) {
        const L = ringPresentation(poly);
        const { space, PGL, relators, nGens } = L;
        const gens = PGL.gens;
        let tried = 0;
        for (let trial = 0; trial < 200 && tried < 6; trial++) {
            // a generating set: each generator times a random word, plus the last few generators
            const S = gens.map((_, k) => [2 * k].concat(randomWordIn(nGens, Math.floor(rand() * 3))));
            if (enumerateFelsch(nGens, relators, S, { seconds: 2 }).index !== 1) continue;
            tried++;
            const r = expressGenerators(nGens, relators, S, { seconds: 10 });
            assert.equal(r.index, 1);
            const Smat = S.map((w) => evalWord(space, gens, w.map((x) => (x & 1 ? -((x >> 1) + 1) : (x >> 1) + 1))));
            r.words.forEach((w, k) => {
                const M = w.reduce((X, s) => space.matMul(X, s > 0 ? Smat[s - 1] : space.matInv(Smat[-s - 1])), space.identity());
                const D = space.matMul(M, space.matInv(gens[k].mat));
                const K = space.nf;
                assert.ok(K.isZero(D[0][1]) && K.isZero(D[1][0]) && K.eq(D[0][0], D[1][1]), `${poly}: generator ${k + 1}`);
            });
        }
        assert.ok(tried >= 3, poly);
    }
});
function randomWordIn(nGens, len) { return Array.from({ length: len }, () => Math.floor(rand() * 2 * nGens)); }

test('over ℚ: T, w, J, D₂ (and a, b, c, w₂) of PGL₂(ℤ[1/2]) in terms of a generating set (exactIndexCheck express)', async () => {
    const { exactIndexCheck } = await import('../js/sarithIndex.js');
    const { sarithCard } = await import('../js/sarithView.js');
    const r = exactIndexCheck([['1', '2', '0', '1'], ['0', '-1', '1', '1'], ['0', '1', '2', '0'], ['-1', '0', '0', '1']], [2], { express: true, seconds: 5 });
    assert.equal(r.index, 1);
    assert.ok(r.express && !r.express.error, r.express && r.express.error);
    assert.equal(r.express.conjugator, null);
    assert.deepEqual(r.express.letters.map((L) => L.name), ['T', 'w', 'J', 'D_{2}']);
    assert.deepEqual(r.express.coxeter.map((L) => L.name), ['a', 'b', 'c', 'w_{2}']);
    for (const L of r.express.letters) assert.ok(L.word && L.word.length <= 20);   // each checked inside by multiplying out
    const html = sarithCard({ exact: r, status: 'yes', head: ['$\\Gamma = \\Lambda$.'] }, null, 4);
    assert.match(html, /T = \\begin\{pmatrix\} 1 & 1/);
    assert.match(html, /satisfies \\\(x = L\(0, x\)/);
    assert.doesNotMatch(html, /C\\,T\\,C\^\{-1\}/);
});

test('over ℚ: a w₃-conjugate of PGL₂(ℤ[1/2]) expresses C x C⁻¹, and the card does not equate the word to x', async () => {
    const { exactIndexCheck } = await import('../js/sarithIndex.js');
    const { sarithCard } = await import('../js/sarithView.js');
    const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
    const adj = (A) => [A[3], -A[1], -A[2], A[0]];
    const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
    const prim = (A) => { const g = A.reduce((s, x) => bgcd(s, x), 0n); return g > 1n ? A.map((x) => x / g) : A; };
    const projEq = (A, B) => { for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (A[i] * B[j] !== A[j] * B[i]) return false; return true; };
    const base = [[1n, 2n, 0n, 1n], [0n, -1n, 1n, 1n], [0n, 1n, 2n, 0n], [-1n, 0n, 0n, 1n]];
    const g = [0n, 1n, 3n, 0n];
    const rows = base.map((M) => prim(mul(mul(g, M), adj(g))).map(String));
    const r = exactIndexCheck(rows, [2], { express: true, seconds: 8 });
    assert.equal(r.index, 1);
    assert.equal(r.kernelIndex, 1);
    assert.deepEqual(r.conjugatedAt, ['3']);
    assert.ok(r.express && !r.express.error, r.express && r.express.error);
    assert.deepEqual(r.express.conjugator, ['0', '1', '3', '0']);
    const C = r.express.conjugator.map(BigInt), Ci = adj(C);
    const gens = rows.map((row) => prim(row.map(BigInt)));
    const inv = (A) => prim(adj(A));
    const evalWord = (w) => w.reduce((X, x) => prim(mul(X, x > 0 ? gens[x - 1] : inv(gens[-x - 1]))), [1n, 0n, 0n, 1n]);
    for (const L of r.express.letters) {
        assert.ok(L.word && L.word.length);
        const M = evalWord(L.word), mat = L.matrix.map(BigInt);
        const target = prim(mul(mul(C, mat), Ci));
        assert.ok(projEq(M, target), `${L.name} should be C x C⁻¹`);
        if (L.name !== 'J') assert.ok(!projEq(M, mat), `${L.name} is not x itself`);
    }
    const html = sarithCard({ exact: r, status: 'yes', head: ['$\\Gamma = C\\Lambda C^{-1}$.'] }, null, 4);
    // the word is the conjugate: C T C⁻¹ = C (1 1; 0 1) C⁻¹, not the bare matrix of T
    assert.match(html, /C\\,T\\,C\^\{-1\} = C\\,\\begin\{pmatrix\} 1 & 1/);
    assert.doesNotMatch(html, /C\\,T\\,C\^\{-1\} = \\begin\{pmatrix\}/);
    assert.match(html, /C x C\^\{-1\} = L\(0, x\)/);
    assert.doesNotMatch(html, /satisfies \\\(x = L\(0, x\)/);
});

test('PGL₂(O_k) over ℚ(√2): its generators in terms of T, U, S and two diagonal units (indexInPGL2O express)', () => {
    const rows = [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['1+w', '0', '0', '1'], ['-1', '0', '0', '1']];
    const r = indexInPGL2O('w^2-2', rows, rows.map((_, i) => [i + 1]), { seconds: 20, express: true });
    assert.equal(r.index, 1);
    assert.ok(r.express && !r.express.error, r.express && r.express.error);
    for (const L of r.express.letters) assert.ok(L.word && L.word.length <= 30);
});
