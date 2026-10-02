// Run from the trees directory:  node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../../../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place, latexToPlain } = await import('../js/localField.js');

const mat = (F, entries) => {
    const [a, b, c, d] = entries.map((s) => F.parse(s));
    return { a, b, c, d };
};
const mmul = (F, m, n) => ({
    a: F.add(F.mul(m.a, n.a), F.mul(m.b, n.c)), b: F.add(F.mul(m.a, n.b), F.mul(m.b, n.d)),
    c: F.add(F.mul(m.c, n.a), F.mul(m.d, n.c)), d: F.add(F.mul(m.c, n.b), F.mul(m.d, n.d)),
});

/** Vertices of the ball of radius r about v. */
function ball(P, v, r) {
    const seen = new Map([[P.id(v), v]]);
    let frontier = [v];
    for (let i = 0; i < r; i++) {
        const next = [];
        for (const u of frontier) for (const w of P.neighbors(u)) {
            const id = P.id(w);
            if (!seen.has(id)) { seen.set(id, w); next.push(w); }
        }
        frontier = next;
    }
    return [...seen.values()];
}

/** The axioms: canonical labels, isometry, action, inverse, valence. */
function checkPlace(P, mats, { radius = 2, maxVerts = 120 } = {}) {
    const F = P.F;
    const gens = mats.map((m) => P.prepare(m));
    const invs = mats.map((m) => P.prepare(P.adjugate(m)));
    const prods = [];
    for (let i = 0; i < mats.length; i++) for (let j = 0; j < mats.length; j++) prods.push([i, j, P.prepare(mmul(F, mats[i], mats[j]))]);
    const o = { k: 0, lo: 0, d: [] };
    let verts = ball(P, o, radius);
    verts = verts.concat(ball(P, { k: 3, lo: -1, d: [1, 0, 0, 1] .map((x) => x % P.q)}, 1));
    verts = verts.filter((v) => !(v.d.length && v.d[0] === 0)).slice(0, maxVerts);
    for (const v of verts) {
        // canonical labels round-trip
        assert.deepEqual(P.canon(P.elem(v), v.k), v, `round trip ${P.id(v)}`);
        // valence
        assert.equal(P.neighbors(v).length, P.q + 1);
        for (const u of P.neighbors(v)) assert.equal(P.dist(u, v), 1);
    }
    for (let gi = 0; gi < gens.length; gi++) {
        const g = gens[gi], gInv = invs[gi];
        const imgs = verts.map((v) => P.act(g, v));
        for (let i = 0; i < verts.length; i++) {
            // inverse
            assert.deepEqual(P.act(gInv, imgs[i]), verts[i], `g⁻¹g·v = v for ${P.id(verts[i])}`);
            for (let j = i + 1; j < verts.length; j += 3) {
                assert.equal(P.dist(imgs[i], imgs[j]), P.dist(verts[i], verts[j]), 'isometry');
            }
        }
    }
    for (const [i, j, gh] of prods) {
        for (const v of verts.slice(0, 40)) {
            assert.deepEqual(P.act(gh, v), P.act(gens[i], P.act(gens[j], v)), `(g${i}g${j})·v = g${i}·(g${j}·v)`);
        }
    }
}

test('ℚ at 3: the familiar labels, an isometric action', () => {
    const F = new GlobalField(null);
    const P = new Place(F, 3);
    assert.equal(P.q, 3);
    assert.equal(P.e, 1);
    // ⌊q⌋_k labels in ℤ[1/3] ∩ [0, 3^k)
    assert.equal(P.label(P.canon(F.parse('-1/3'), 0)), '2/3');
    assert.equal(P.label(P.canon(F.parse('1/2'), 0)), '0');
    assert.equal(P.label(P.canon(F.parse('1/2'), -1)), '0');     // the old canonicalizeQ gave 1/6 here
    assert.equal(P.label(P.canon(F.parse('1/2'), 2)), '5');      // 1/2 ≡ 5 mod 9
    assert.equal(P.label(P.canon(F.parse('7/18'), 1)), '17/9');   // 7·2⁻¹ ≡ 17 mod 27
    checkPlace(P, [mat(F, ['3', '0', '0', '1']), mat(F, ['5', '-4', '2', '-1'])]);
});

test('ℚ: canonical labels agree with x mod p^k', () => {
    const F = new GlobalField(null);
    for (const p of [2, 3, 5, 7]) {
        const P = new Place(F, p);
        for (const s of ['1/2', '-1/3', '7/18', '22/7', '-5', '1/25', '3/8', '0']) {
            const x = F.parse(s);
            for (let k = -3; k <= 4; k++) {
                const vt = P.canon(x, k);
                const y = P.elem(vt);
                const diff = F.sub(x, y);
                assert.ok(P.val(diff) >= k, `${s} at k=${k}, p=${p}`);
                // label in [0, p^k) ∩ ℤ[1/p]
                const yv = y.v[0] * F.O.one[0];
                assert.ok(yv >= 0n, 'nonnegative');
                const den = y.den;
                let dd = den; while (dd % BigInt(p) === 0n) dd /= BigInt(p);
                assert.equal(dd, 1n, 'denominator a power of p');
            }
        }
    }
});

test('ℚ(i): 5 splits, 3 is inert, 2 ramifies', () => {
    const F = new GlobalField({ gen: 'i', poly: 'i^2+1' });
    const at5 = F.primesAbove(5n), at3 = F.primesAbove(3n), at2 = F.primesAbove(2n);
    assert.deepEqual(at5.map((p) => [p.e, p.f]), [[1, 1], [1, 1]]);
    assert.deepEqual(at3.map((p) => [p.e, p.f]), [[1, 2]]);
    assert.deepEqual(at2.map((p) => [p.e, p.f]), [[2, 1]]);

    const P3 = new Place(F, 3);
    assert.equal(P3.q, 9);
    assert.equal(P3.valence, 10);
    assert.ok(P3.residueGeneratedByGen);
    assert.deepEqual(P3.residuePoly, [1n, 0n, 1n]);              // ī² + 1 = 0 in F_9
    assert.equal(P3.digitLabel(4), '1 + i');                     // 1 + 1·3 → 1 + i
    const P2 = new Place(F, 2);
    assert.equal(P2.q, 2);
    assert.equal(P2.val(F.parse('2')), 2);
    assert.equal(P2.val(P2.pi), 1);
    assert.equal(P2.val(F.parse('1/(1+i)^3')), -3);

    const mats = [mat(F, ['1', '1', '0', '1']), mat(F, ['1', 'i', '0', '1']), mat(F, ['2+i', '0', '0', '1']), mat(F, ['0', '-1', '1', '0'])];
    for (let idx = 0; idx < 2; idx++) checkPlace(new Place(F, 5, idx), mats);
    checkPlace(P3, mats, { radius: 1 });
    checkPlace(P2, mats);
});

test('ℚ(i) at 5: the two embeddings see 2 + i differently', () => {
    const F = new GlobalField({ gen: 'i', poly: 'i^2+1' });
    const o = { k: 0, lo: 0, d: [] };
    const g = mat(F, ['2+i', '0', '0', '1']);
    const d = [0, 1].map((idx) => { const P = new Place(F, 5, idx); return P.dist(o, P.act(P.prepare(g), o)); });
    assert.deepEqual(d.sort(), [0, 1]);
    // the root of i^2+1 in ℚ_5 under each embedding: i ↦ 2 + 1·5 + 2·5² + … or 3 + 3·5 + 2·5² + …
    const roots = [0, 1].map((idx) => { const P = new Place(F, 5, idx); return P.canon(F.parse('i'), 6); });
    for (const r of roots) assert.equal(r.d.length, 6);
    const lows = roots.map((r) => r.d[0]).sort();
    assert.deepEqual(lows, [2, 3]);
    // residues of an element with a pole at the other prime: 1/(2 − i) at (2 + i)
    for (let idx = 0; idx < 2; idx++) {
        const P = new Place(F, 5, idx);
        const x = F.parse('1/(2-i)');
        const vx = P.val(x);
        const vt = P.canon(x, vx + 4);
        assert.ok(P.val(F.sub(x, P.elem(vt))) >= vx + 4);
    }
});

test('ℚ(∛2) at 5: a degree-one and a degree-two prime', () => {
    const F = new GlobalField({ gen: 'a', poly: 'a^3-2' });
    const prs = F.primesAbove(5n);
    assert.deepEqual(prs.map((p) => [p.e, p.f]), [[1, 1], [1, 2]]);
    const mats = [mat(F, ['a', '1', '0', '1']), mat(F, ['1', '0', 'a^2', '1']), mat(F, ['5', '0', '0', '1'])];
    checkPlace(new Place(F, 5, 0), mats);
    const P = new Place(F, 5, 1);
    assert.equal(P.q, 25);
    checkPlace(P, mats, { radius: 1, maxVerts: 60 });
});

test('index divisors: ℚ(√−3) as w²+3 at 2, ℚ(√5) as w²−5 at 2 and 5', () => {
    const F = new GlobalField({ gen: 'w', poly: 'w^2+3' });
    const P = new Place(F, 2);
    assert.equal(P.f, 2);                                       // 2 is inert in ℚ(√−3)
    assert.equal(P.q, 4);
    checkPlace(P, [mat(F, ['1', 'w', '0', '1']), mat(F, ['w', '1', '1', '0']), mat(F, ['(1+w)/2', '0', '0', '1'])]);
    const G = new GlobalField({ gen: 'w', poly: 'w^2-5' });
    assert.deepEqual(G.primesAbove(2n).map((p) => [p.e, p.f]), [[1, 2]]);
    assert.deepEqual(G.primesAbove(5n).map((p) => [p.e, p.f]), [[2, 1]]);
    assert.deepEqual(G.primesAbove(11n).map((p) => [p.e, p.f]), [[1, 1], [1, 1]]);
    const P5 = new Place(G, 5);
    assert.equal(G.format(P5.pi), 'w');
    checkPlace(P5, [mat(G, ['1', '1', '0', '1']), mat(G, ['w', '0', '0', '1']), mat(G, ['(1+w)/2', '1', '1', '0'])]);
    checkPlace(new Place(G, 2), [mat(G, ['1', '1', '0', '1']), mat(G, ['(1+w)/2', '1', '1', '1'])], { radius: 1 });
});

test('a ramified prime next to another prime above p', () => {
    // find a cubic with p = 𝔭²𝔮
    let found = null;
    outer: for (const poly of ['w^3-w^2-2w-8', 'w^3+w+3', 'w^3-3w-1', 'w^3+2w+3', 'w^3-w+3', 'w^3+3w^2+3', 'w^3-12', 'w^3+w^2+5']) {
        let F;
        try { F = new GlobalField({ gen: 'w', poly }); } catch (e) { continue; }
        for (const p of [2n, 3n, 5n, 7n]) {
            const prs = F.primesAbove(p);
            if (prs.length === 2 && prs.some((q) => q.e === 2)) { found = { F, p, idx: prs.findIndex((q) => q.e === 2) }; break outer; }
        }
    }
    assert.ok(found, 'no test field found');
    const { F, p, idx } = found;
    const mats = [mat(F, ['w', '1', '1', '0']), mat(F, ['1', 'w^2', '0', '1']), mat(F, ['1/w', '0', '1', '1'])];
    for (let i = 0; i < 2; i++) checkPlace(new Place(F, p, i), mats);
    const P = new Place(F, p, idx);
    assert.equal(P.val(P.pi), 1);
});

test('LaTeX entries', () => {
    const F = new GlobalField({ gen: 'w', poly: 'w^2-2' });
    const read = (s) => F.format(F.parse(latexToPlain(s)));
    assert.equal(read('\\frac{1}{2}w'), '1/2 w');
    assert.equal(read('\\left(1+w\\right)^{2}'), '3 + 2 w');
    assert.equal(read('w^{-1}'), '1/2 w');
    assert.equal(read('2\\cdot w-\\frac{w}{2}'), '3/2 w');
    assert.throws(() => F.parse(latexToPlain('\\sqrt{2}')), /sqrt/);
    assert.throws(() => F.parse('i'), /unknown symbol i/);
    const Q = new GlobalField(null);
    assert.equal(Q.format(Q.parse(latexToPlain('\\frac{-4}{6}'))), '−2/3');
    assert.throws(() => new GlobalField({ gen: 'w', poly: 'w^2-4' }), /reducible/);
});
