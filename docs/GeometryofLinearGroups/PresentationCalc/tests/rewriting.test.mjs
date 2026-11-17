// node --test tests/rewriting.test.mjs
// Knuth–Bendix pruning of relators (rewriting.js). Dropping a relator must never change the group: on finite
// groups, coset enumeration of the pruned presentation gives the same order, and redundant relators added on
// purpose (products and conjugates of the others, powers) are found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneRelators, prunePresentation, RewritingSystem } from '../js/rewriting.js';
import { abelianInvariants } from '../js/presentation.js';
import { enumerateFelsch } from '../js/felsch.js';

const toLetters = (w) => w.map((x) => (x > 0 ? 2 * (x - 1) : 2 * (-x - 1) + 1));
const order = (n, rels) => enumerateFelsch(n, rels.map(toLetters), [], { seconds: 10 }).index;
const inv = (w) => w.slice().reverse().map((x) => -x);

test('(c a²)² follows from c² and (c a⁻¹)²: it needs an insertion, which a Dehn reduction cannot do', () => {
    const P = pruneRelators(3, [[3, 3], [3, -1, 3, -1], [3, 1, 1, 3, 1, 1]]);
    assert.equal(P.relators.length, 2);
    assert.equal(P.dropped, 1);
});

const FINITE = [
    // S₄ = ⟨a, b | a², b³, (ab)⁴⟩, A₅ = ⟨a, b | a², b³, (ab)⁵⟩, PSL(2, 7) = ⟨a, b | a², b³, (ab)⁷, [a, b]⁴⟩
    { name: 'S₄', rels: [[1, 1], [2, 2, 2], [1, 2, 1, 2, 1, 2, 1, 2]], order: 24 },
    { name: 'A₅', rels: [[1, 1], [2, 2, 2], [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]], order: 60 },
    { name: 'PSL(2,7)', rels: [[1, 1], [2, 2, 2], [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2], [1, -2, 1, 2, 1, -2, 1, 2, 1, -2, 1, 2, 1, -2, 1, 2]], order: 168 },
];

for (const G of FINITE) {
    test(`${G.name}: consequences added on purpose are dropped, and the order is unchanged`, () => {
        let seed = 7;
        const rand = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
        const extra = [];
        for (let t = 0; t < 6; t++) {
            const r = G.rels[rand(G.rels.length)], s = G.rels[rand(G.rels.length)];
            const u = [1 + rand(2)].map((x) => (rand(2) ? x : -x));
            extra.push(u.concat(r, inv(u), s));                 // a conjugate of r times s
        }
        extra.push(G.rels[2].concat(G.rels[2]));               // a square of a relator
        const all = G.rels.concat(extra);
        assert.equal(order(2, all), G.order);
        const P = pruneRelators(2, all);
        assert.equal(order(2, P.relators), G.order, 'pruning changed the group');
        assert.ok(P.relators.length <= G.rels.length, `${P.relators.length} relators kept`);
    });
}

test('a relator that does not follow is kept: dropping (ab)⁴ from S₄ would give an infinite group', () => {
    const P = pruneRelators(2, [[1, 1], [2, 2, 2], [1, 2, 1, 2, 1, 2, 1, 2]]);
    assert.equal(P.relators.length, 3);
});

test('the rewriting system of a finite group completes, and reduces a word to its normal form', () => {
    const S = new RewritingSystem(2, { maxRules: 5000, maxLen: 20 });
    for (const r of FINITE[0].rels) S.addRelator(r);
    assert.equal(S.complete(), true);
    // in S₄ every element has one normal form: breadth-first over normal forms finds exactly 24
    const forms = new Set(['']);
    let frontier = [[]];
    while (frontier.length) {
        const next = [];
        for (const w of frontier) for (const x of [1, -1, 2, -2]) {
            const v = S.reduce(w.concat([x])), k = v.join(',');
            if (!forms.has(k)) { forms.add(k); next.push(v); }
        }
        frontier = next;
        assert.ok(forms.size <= 24);
    }
    assert.equal(forms.size, 24);
});

test('inclusion overlaps and older-rule retirement: b² → 1 inside a·b²·a → c derives a² = c', () => {
    const S = new RewritingSystem(3, { maxRules: 500, maxLen: 16 });
    S.addRelator([1, 2, 2, 1, -3]); // a b² a = c (added first, longer rule)
    S.addRelator([2, 2]);           // b² = 1 (strict subword inside the LHS of the earlier rule)
    S.complete();
    assert.deepEqual(S.reduce([1, 1]), S.reduce([3]), 'inclusion critical pair must equate a² and c');
});

test('prunePresentation drops redundant relators while preserving abelianInvariants', () => {
    const base = [[1, 1], [2, 2, 2], [1, 2, 1, 2, 1, 2, 1, 2]]; // S₄
    const redundant = [[1, 1, 2, 2, 2], [2, 1, 1, -2]];
    const pres = {
        gens: [{ name: 'g1', given: 0 }, { name: 'g2', given: 1 }],
        relators: base.concat(redundant),
        abelian: abelianInvariants(2, base),
    };
    prunePresentation(pres);
    assert.ok(pres.pruned && pres.pruned.dropped >= 2);
    assert.deepEqual(abelianInvariants(2, pres.relators), pres.abelian);
    assert.equal(order(2, pres.relators), 24);
});
