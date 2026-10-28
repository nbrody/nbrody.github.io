// node --test tests/cosetPresentation.test.mjs
// The modified Todd–Coxeter algorithm (felsch.js subgroupPresentation): a presentation of a
// finite-index subgroup H on its own generators. Checked independently of the code:
//  · finite groups: every relator is trivial in the regular permutation representation, and coset
//    enumeration of the new presentation gives a group of order |G|/[G : H] — so it presents H;
//  · subgroups of PSL₂(ℤ): every relator is trivial on matrices, and H₁ agrees with Kurosh's theorem
//    (H is a free product of e₂ copies of ℤ/2, e₃ of ℤ/3 and a free group of rank r, from the table).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateFelsch, enumerateFelschAugmented, subgroupPresentation } from '../js/felsch.js';
import { abelianInvariants } from '../js/presentation.js';

let seed = 11;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const randomWord = (nGens, len) => Array.from({ length: len }, () => Math.floor(rand() * 2 * nGens));
const toLetters = (w) => w.map((x) => (x > 0 ? 2 * (x - 1) : 2 * (-x - 1) + 1));     // ±(s+1) → felsch letters

const FINITE = [
    { name: 'S₄', n: 2, rels: [[0, 0], [2, 2, 2], [0, 2, 0, 2, 0, 2, 0, 2]], order: 24 },
    { name: 'A₅', n: 2, rels: [[0, 0], [2, 2, 2], [0, 2, 0, 2, 0, 2, 0, 2, 0, 2]], order: 60 },
    // PSL(2, 7) = ⟨a, b | a², b³, (ab)⁷, [a, b]⁴⟩
    { name: 'PSL(2,7)', n: 2, rels: [[0, 0], [2, 2, 2], [0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2], [0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2, 0, 3, 0, 2]], order: 168 },
];

for (const G of FINITE) {
    test(`${G.name}: random subgroups, presented on their own generators`, () => {
        const reg = enumerateFelschAugmented(G.n, G.rels, [], { seconds: 5 });
        assert.equal(reg.index, G.order);
        const act = (w) => Array.from({ length: G.order }, (_, c) => w.reduce((d, x) => reg.table[d][x], c));
        for (let trial = 0; trial < 25; trial++) {
            const H = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => randomWord(G.n, 1 + Math.floor(rand() * 6)));
            const P = subgroupPresentation(G.n, G.rels, H, { seconds: 5 });
            assert.ok(P.index, JSON.stringify(P));
            // every relator is the identity in G
            for (const r of P.relators) {
                const w = r.flatMap((s) => (s > 0 ? H[s - 1] : H[-s - 1].slice().reverse().map((x) => x ^ 1)));
                assert.ok(act(w).every((d, c) => d === c), `${G.name} ${JSON.stringify(H)}: relator ${r}`);
            }
            // the presented group has order |H|
            const E = enumerateFelsch(H.length, P.relators.map(toLetters), [], { seconds: 5 });
            assert.equal(E.index, G.order / P.index, `${G.name} ${JSON.stringify(H)}`);
        }
    });
}

// PSL₂(ℤ) = ⟨a, b | a², b³⟩ on matrices up to sign
const mm = (X, Y) => [X[0] * Y[0] + X[1] * Y[2], X[0] * Y[1] + X[1] * Y[3], X[2] * Y[0] + X[3] * Y[2], X[2] * Y[1] + X[3] * Y[3]];
const adj = (X) => [X[3], -X[1], -X[2], X[0]];
const GEN = [[0n, -1n, 1n, 0n], [0n, -1n, 1n, 1n]];
const letterMat = (x) => (x & 1 ? adj(GEN[x >> 1]) : GEN[x >> 1]);
const wordMat = (w) => w.reduce((M, x) => mm(M, letterMat(x)), [1n, 0n, 0n, 1n]);
const isPm1 = (M) => M[1] === 0n && M[2] === 0n && M[0] === M[3] && (M[0] === 1n || M[0] === -1n);

test('PSL₂(ℤ): finite-index subgroups, relators trivial and H₁ as Kurosh says', () => {
    const REL = [[0, 0], [2, 2, 2]];
    let tried = 0;
    for (let trial = 0; trial < 500 && tried < 30; trial++) {
        const H = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => randomWord(2, 1 + Math.floor(rand() * 7)));
        const P = subgroupPresentation(2, REL, H, { seconds: 3, maxCosets: 20000 });
        if (!P.index || P.index > 200) continue;
        tried++;
        const Hm = H.map(wordMat);
        for (const r of P.relators) {
            const M = r.reduce((X, s) => mm(X, s > 0 ? Hm[s - 1] : adj(Hm[-s - 1])), [1n, 0n, 0n, 1n]);
            assert.ok(isPm1(M), `relator ${r} of ${JSON.stringify(H)}`);
        }
        // Kurosh: e₂ cosets fixed by a, e₃ by b, and rank r = 1 + n/6 − e₂/2 − 2e₃/3
        const n = P.index;
        const e2 = P.table.filter((row, c) => row[0] === c).length, e3 = P.table.filter((row, c) => row[2] === c).length;
        const rank = (6 + n - 3 * e2 - 4 * e3) / 6;
        const ab = abelianInvariants(H.length, P.relators);
        assert.equal(ab.rank, rank, JSON.stringify(H));
        const tors = ab.torsion.map(Number);
        const twos = tors.filter((d) => d % 2 === 0).length, threes = tors.filter((d) => d % 3 === 0).length;
        assert.deepEqual([twos, threes], [e2, e3], `${JSON.stringify(H)}: torsion ${tors}`);
    }
    assert.ok(tried >= 15);
});

test('rewrite: an element of H, read through the table, comes out as a word in its generators', () => {
    const REL = [[0, 0], [2, 2, 2]];
    let H, P;
    do {                                                                 // a subgroup of finite index
        H = Array.from({ length: 2 }, () => randomWord(2, 2 + Math.floor(rand() * 5)));
        P = subgroupPresentation(2, REL, H, { seconds: 2, maxCosets: 20000 });
    } while (!P.index || P.index < 3 || P.index > 100);
    const Hm = H.map(wordMat);
    for (let t = 0; t < 40; t++) {
        // a random word in the h's, written in a and b, then rewritten back
        const u = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => (Math.floor(rand() * 2) + 1) * (rand() < 0.5 ? -1 : 1));
        const w = u.flatMap((s) => (s > 0 ? H[s - 1] : H[-s - 1].slice().reverse().map((x) => x ^ 1)));
        const v = P.rewrite(w);
        const M = v.reduce((X, s) => mm(X, s > 0 ? Hm[s - 1] : adj(Hm[-s - 1])), [1n, 0n, 0n, 1n]);
        const N = wordMat(w);
        assert.ok(isPm1(mm(M, adj(N))), `${u} → ${v}`);
    }
});
