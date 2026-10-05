// Run from the trees directory:  node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../../../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../js/localField.js');
const { makeLetters, computeOrbit, stabilizerWords, linkPermutation, cycles, translationLength, wordString } = await import('../js/groupWords.js');
const { generateTree } = await import('../js/treeGeneration.js');
const { EXAMPLES } = await import('../js/examples.js');
const { readGroup } = await import('../../../../../assets/js/hyperbolic/expr.js');

const mat = (F, entries) => { const [a, b, c, d] = entries.map((s) => F.parse(s)); return { a, b, c, d }; };
const O = { k: 0, lo: 0, d: [] };

test('a free group acts freely on the orbit of ⌊0⌋₀ (ℚ₃)', () => {
    const F = new GlobalField(null), P = new Place(F, 3);
    const letters = makeLetters(P, [mat(F, ['3', '0', '0', '1']), mat(F, ['5', '-4', '2', '-1'])]);
    const { orbitMap, wordCount } = computeOrbit(P, O, letters, 4);
    assert.equal(wordCount, 1 + 4 + 12 + 36 + 108);
    assert.equal(orbitMap.size, wordCount);            // every reduced word moves ⌊0⌋₀ somewhere new
    // the recorded words really reach their vertices
    const g = letters.map((l) => l.g);
    for (const [id, e] of orbitMap) {
        for (const w of e.words) {
            let v = O;
            for (let i = w.length - 1; i >= 0; i--) v = P.act(g[w[i]], v);
            assert.equal(P.id(v), id, wordString(letters, w));
        }
    }
});

test('the stabilizer of ⌊0⌋₀ in PGL₂(ℤ[i]) acts on P¹(F₉) by Möbius maps', () => {
    const F = new GlobalField({ gen: 'i', poly: 'i^2+1' }), P = new Place(F, 3);
    const mats = [mat(F, ['1', '1', '0', '1']), mat(F, ['1', 'i', '0', '1']), mat(F, ['0', '-1', '1', '0']), mat(F, ['3', '0', '0', '1'])];
    const letters = makeLetters(P, mats);
    const orbit = computeOrbit(P, O, letters, 2);
    const stab = stabilizerWords(orbit.orbitMap, P.id(O));
    assert.ok(stab.length > 0);
    const label = (i) => (i === 0 ? '∞' : P.digitLabel(i - 1));
    const permOf = (w) => linkPermutation(P, orbit.actor, w, O);
    // x ↦ x + 1: fixes ∞, three 3-cycles
    const t = permOf([0]);
    assert.equal(t[0], 0);
    assert.deepEqual(cycles(t).map((c) => c.length), [3, 3, 3]);
    // x ↦ −1/x swaps ∞ and 0 and fixes ±i
    const s = permOf([4]);
    assert.equal(label(s[0]), '0');
    assert.equal(label(s[1]), '∞');
    const fixed = s.map((x, i) => (x === i ? label(i) : null)).filter(Boolean).sort();
    assert.deepEqual(fixed, ['2 i', 'i']);
    // translation lengths
    assert.deepEqual(mats.map((m) => translationLength(P, m)), [0, 0, 0, 1]);
});

test('a hyperbolic element at one prime above 5 is elliptic at the other', () => {
    const F = new GlobalField({ gen: 'i', poly: 'i^2+1' });
    const m = mat(F, ['2+i', '0', '0', '1']);
    const ls = [0, 1].map((idx) => translationLength(new Place(F, 5, idx), m)).sort();
    assert.deepEqual(ls, [0, 1]);
});

test('the drawn tree contains the orbit and stays within budget', () => {
    for (const ex of EXAMPLES) {
        const extra = [['1', ex.vertex[0], '0', '1']];
        if (ex.primeOf) extra.push(['1', ex.primeOf, '0', '1']);
        const read = readGroup({ mats: ex.mats.concat(extra), consts: ex.consts || [] });
        assert.ok(read.exact, `${ex.name}: ${read.reason}`);
        const F = GlobalField.fromTower(read.field, { primes: [BigInt(ex.p)] });
        const all = read.gens.map((M) => ({ a: F.fromT(M.a), b: F.fromT(M.b), c: F.fromT(M.c), d: F.fromT(M.d) }));
        const mats = all.slice(0, ex.mats.length);
        let idx = ex.prime || 0;
        if (ex.primeOf) idx = F.primesAbove(BigInt(ex.p)).findIndex((_, i) => new Place(F, ex.p, i).val(all[all.length - 1].b) > 0);
        assert.ok(idx >= 0, ex.name);
        const P = new Place(F, ex.p, idx);
        const letters = makeLetters(P, mats);
        const base = P.canon(all[ex.mats.length].b, Number(ex.vertex[1]));
        const orbit = computeOrbit(P, base, letters, ex.L);
        const verts = [...orbit.orbitMap.values()].map((e) => e.vertex);
        const tree = generateTree(P, verts, { radius: ex.r, budget: 3200 });
        const ids = new Set();
        const walk = (n, parent) => {
            ids.add(n.id);
            if (parent) assert.equal(P.dist(parent.vt, n.vt), 1, 'tree edges are tree edges');
            n.children.forEach((c) => walk(c, n));
        };
        walk(tree.root, null);
        for (const v of verts) assert.ok(ids.has(P.id(v)), `${ex.name}: orbit vertex ${P.label(v)} drawn`);
        assert.equal(ids.size, tree.size, `${ex.name}: every included vertex hangs from the root`);
        assert.ok(tree.size <= 3200 + 6000, ex.name);
    }
});
