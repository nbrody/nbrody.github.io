// node tests/quaternionIndex.test.mjs — coset enumeration in Λ = N(𝒪[1/S])/k^× for totally definite quaternion algebras
// (quaternionIndex.js, quatOrders.js). Against the SO₃ project's indices (SO3DecisionAlgorithm README: ⟨1+2i, 3+2j⟩ →
// 2304, level 96; ⟨1+i+j, 1+2i⟩ → 48, level 8; LPS → 24; ⟨2+2i+j−k, 1+i+j⟩ → 12; ⟨2+i+j+k, 1−i−k⟩ → 192), and
// against the congruence sandwich: [Λ̄_N : Γ̄_N] ≤ [Λ : Γ] always, so a level N with equality confirms an index
// independently of the presentation; and against stabilizers whose index is an orbit size, counted directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { definiteIndex, indexFromQuaternions, enumerateFelsch } from '../js/quaternionIndex.js';
import * as Ord from '../js/quatOrders.js';
import { enumerateGeneral } from '../js/bianchi.js';

// x = a₀ + a₁I + a₂J + a₃K in (−1, β) as a matrix over ℚ(w), w² = −1: (a₀ + a₁w, a₂ + a₃w; β(a₂ − a₃w), a₀ − a₁w)
const t = (c0, c1) => `${c0}+${c1}*w`.replace(/\+-/g, '-');
const q = (be) => (a0, a1, a2, a3) => [t(a0, a1), t(a2, a3), t(be * a2, -be * a3), t(a0, -a1)];
const H = q(-1), poly = [1n, 0n, 1n];
const two = (level) => [{ p: '2', level }];

test('Hurwitz quaternions: the SO₃ project\'s indices and levels', () => {
    const cases = [
        { gens: [H(1, 2, 0, 0), H(3, 0, 2, 0)], S: [5, 13], lp: [{ p: '2', level: 4 }, { p: '3', level: 1 }], index: 2304, level: '96' },
        { gens: [H(1, 1, 1, 0), H(1, 2, 0, 0)], S: [3, 5], lp: two(3), index: 48, level: '8' },
        { gens: [H(1, 2, 0, 0), H(1, 0, 2, 0), H(1, 0, 0, 2)], S: [5], lp: two(1), index: 24, level: '2' },
        { gens: [H(2, 2, 1, -1), H(1, 1, 1, 0)], S: [3, 5], lp: two(2), index: 12, level: '8' },
        { gens: [H(2, 1, 1, 1), H(1, -1, 0, -1)], S: [3, 7], lp: two(4), index: 192, level: '16' },
        { gens: [H(1, 2, 0, 0), H(1, 0, 2, 0), H(3, 2, 0, 0), H(3, 0, 2, 0)], S: [5, 13], lp: two(4), index: 96, level: '16' },
        { gens: [H(1, 2, 0, 0), H(1, 0, 2, 0), H(1, 0, 0, 2), H(3, 2, 0, 0), H(3, 0, 2, 0)], S: [5, 13], lp: two(1), index: 24, level: '2' },
    ];
    for (const c of cases) {
        const r = definiteIndex(c.gens, poly, c.S, { levelPrimes: c.lp });
        assert.equal(r.index, c.index, `${JSON.stringify(c.gens)}: ${r.error || r.limit || ''}`);
        assert.equal(r.disc, '2');
        assert.equal(r.reps, 1);
        assert.equal(r.stabilizer, 24);                       // SO₃(ℤ): the Hurwitz units with 1 + i
        assert.equal(r.level && r.level.N, c.level);
    }
});

test('an edge inversion at 3: the subgroup with even valuations, confirmed by its level', () => {
    // i + j + 2k (norm 6) inverts an edge of T₄; the other two fix it, so Γ is bounded at 3
    const r = definiteIndex([H(0, 1, 1, 2), H(0, -2, -1, 0), H(-2, -3, 0, 0)], poly, [5, 13], { levelPrimes: [{ p: '2', level: 2 }, { p: '3', level: 1 }] });
    assert.equal(r.kernelIndex, 2);
    assert.deepEqual(r.bad, ['3']);
    assert.equal(r.index, 192);
    assert.equal(r.level && r.level.N, '24');
});

test('discriminant 7: a maximal order away from the basis, confirmed by the level', () => {
    const B7 = q(-7);
    const r = definiteIndex([B7(0, -1, 0, 1), B7(-1, 6, 1, 0)], poly, [2, 11], { levelPrimes: [{ p: '3' }, { p: '5' }, { p: '7' }], congruenceSeconds: 10, congruenceBudget: 5e7 });
    assert.equal(r.disc, '7');
    assert.equal(r.stabilizer, 4);
    assert.equal(r.index, 360);
    assert.equal(r.level && r.level.N, '315');
});

/** Γ = the stabilizer in Λ of a rank-one idempotent of 𝒪/ℓ𝒪 under conjugation: its index is the orbit, counted here. */
function idempotentStabilizer(be, Sp, ell, gens0 = null, opts0 = {}) {
    const B = q(be);
    const r0 = definiteIndex(gens0 || [B(1, 1, 0, 0), B(1, 0, 1, 0), B(0, 1, 0, 1)], opts0.poly || poly, Sp, { seconds: 0.01, debug: true, ...opts0 });
    const { K, QA, reps } = r0.debug;
    const O0 = reps[0].L, basis = Ord.elemsOf(O0);
    const gensL = reps.flatMap((r) => r.U.gens.filter((x) => QA.key(x) !== QA.key(QA.one()))).concat(reps.flatMap((r) => r.nbr.flatMap((m) => [...m.values()].map((a) => a.lam))));
    const inv = (a) => { let [x, y, s0, s1] = [Ord.modn(a, ell), ell, 1n, 0n]; while (y) { const k = x / y; [x, y] = [y, x - k * y]; [s0, s1] = [s1, s0 - k * s1]; } return s0; };
    const modv = (x) => Ord.coordsIn(O0, x).map((c) => Ord.modn(c[0] * inv(c[1]), ell));
    const el = (w) => Ord.normFlat(basis.reduce((acc, b, i) => acc.map((c, j) => c + w[i] * b.v[j]), new Array(QA.D).fill(0n)), basis[0].d);
    const act = (g, v) => modv(QA.conjBy(g, el(v)));
    let e = null, seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return BigInt(seed % Number(ell)); };
    const oneV = modv(QA.one());
    for (let tries = 0; tries < 20000 && !e; tries++) {
        const v = basis.map(() => rnd()), v2 = modv(QA.mul(el(v), el(v)));
        if (v2.every((c, i) => c === v[i]) && v.some((c) => c) && v.some((c, i) => c !== oneV[i])) e = v;
    }
    const key = (v) => v.join(',');
    const orbit = new Map([[key(e), { v: e, t: QA.one() }]]), queue = [e];
    while (queue.length) { const v = queue.shift(), tv = orbit.get(key(v)).t; for (const g of gensL) { const w = act(g, v); if (!orbit.has(key(w))) { orbit.set(key(w), { v: w, t: QA.prim(QA.mul(g, tv)) }); queue.push(w); } } }
    const sch = [];
    for (const { v, t: tv } of orbit.values()) for (const g of gensL) sch.push(QA.prim(QA.mul(QA.mul(QA.conj(orbit.get(key(act(g, v))).t), g), tv)));
    return { orbit: orbit.size, reps: reps.length, U: reps.map((r) => r.U.order), r: indexFromQuaternions({ ...r0.debug.QD, quats: sch }, Sp, { ...opts0, levelPrimes: [{ p: String(ell) }], seconds: 20, congruenceSeconds: 20, congruenceBudget: 5e7 }) };
}

test('several vertex orbits: class numbers 2 and 3 over ℚ (Eichler masses 5/12 and 11/12)', () => {
    const a = idempotentStabilizer(-11, [2, 3], 5n);
    assert.equal(a.reps, 2);
    assert.deepEqual(a.U, [4, 6]);                            // 1/4 + 1/6 = 5/12 = (11 − 1)/24
    assert.equal(a.r.index, a.orbit);
    assert.equal(a.r.level && a.r.level.N, '5');
    const b = idempotentStabilizer(-23, [2, 3], 5n);
    assert.equal(b.reps, 3);
    assert.deepEqual(b.U.slice().sort((x, y) => x - y), [2, 4, 6]);   // 1/2 + 1/4 + 1/6 = 11/12 = (23 − 1)/24
    assert.equal(b.r.index, b.orbit);
    assert.equal(b.r.level && b.r.level.N, '5');
});

test('icosians over ℚ(√5): Λ(2) acts simply transitively, index 60 = |A₅|', () => {
    const f = JSON.parse(fs.readFileSync(new URL('./fixtures/icosians.json', import.meta.url), 'utf8'));
    const opts = { field: f.k, ram: [], levelPrimes: two(1), seconds: 20, congruenceSeconds: 20 };
    const r0 = definiteIndex(f.rows, f.poly.map(BigInt), f.S, { ...opts, seconds: 0.01, debug: true });
    assert.equal(r0.k, 2);
    assert.equal(r0.reps, 1);
    assert.equal(r0.stabilizer, 60);
    const { QA, K, O } = r0.debug;
    // the elements of 𝒪 of norm 𝔭 (𝔭 above 11, 19) congruent to a scalar mod 2𝒪
    const E = Ord.lll(Ord.elemsOf(O), (a, b) => QA.bil(a, b));
    const G = E.map((a) => E.map((b) => { const x = QA.bil(a, b); return Number(x[0]) / Number(x[1]); }));
    const twoO = Ord.latScale(O, 2n);
    const gensFor = (s) => {
        const P = K.primesAbove(BigInt(s.p)).find((c) => c.H.every((row, i) => row.every((x, j) => BigInt(x) === BigInt(s.H[i][j]))));
        const nu = K.positiveGenerators(P.L);
        const bound = Math.max(...nu.map((x) => Number(K.trace(x)[0]) / Number(K.trace(x)[1]))) + 1e-9;
        const out = [];
        for (const c of Ord.shortVectors(G, bound)) {
            const v = new Array(QA.D).fill(0n);
            c.forEach((ci, i) => { if (ci) for (let j = 0; j < QA.D; j++) v[j] += BigInt(ci) * E[i].v[j]; });
            const x = Ord.normFlat(v, E[0].d);
            if (!nu.some((t2) => K.eq(t2, QA.nrd(x)))) continue;
            for (const [a, b] of [[1n, 0n], [0n, 1n], [1n, 1n]]) {
                const lam = K.add(K.scale(K.okBasis[0], a), K.scale(K.okBasis[1], b));
                if (Ord.contains(twoO, QA.fromBlocks(QA.blocks(x).map((bl, i) => (i === 0 ? K.sub(bl, lam) : bl))))) { out.push(x); break; }
            }
        }
        return out;
    };
    const g11 = gensFor(f.S[0]), g19 = gensFor(f.S[1]);
    assert.equal(g11.length, 24);                             // 2·12: the 12 neighbours of o in T₁₂, up to sign
    assert.equal(g19.length, 40);
    const one = indexFromQuaternions({ K, QA, quats: g11 }, [f.S[0]], opts);
    assert.equal(one.index, 60);
    assert.equal(one.level && one.level.N, '2');
    const both = indexFromQuaternions({ K, QA, quats: g11.concat(g19) }, f.S, opts);
    assert.equal(both.index, 60);
    assert.equal(both.level && both.level.N, '2');
});

test('the field layer: units, class number one and positive generators over ℚ(√5)', () => {
    const K = new Ord.KField([176n, -28n, 1n]);                // θ = 14 ± 2√5
    assert.equal(K.disc, 5n);
    const { units, classes } = K.unitData();
    assert.equal(units.length, 1);
    assert.equal(classes.length, 4);
    const N = K.norm(units[0]);
    assert.equal(N[1], 1n);
    assert.equal(N[0] === 1n || N[0] === -1n, true);
    assert.equal(K.classNumberOne(), true);
    for (const P of K.primesAbove(11)) {
        const g = K.positiveGenerators(P.L);
        assert.equal(g.length, 1);                            // the unit τ has norm −1: positive units are squares
        assert.deepEqual(K.norm(g[0]), [11n, 1n]);
    }
});

test('Felsch and HLT agree', () => {
    const r = definiteIndex([H(1, 2, 0, 0), H(3, 0, 2, 0)], poly, [5, 13], { debug: true });
    const { rels, words, nGens } = r.debug;
    const f = enumerateFelsch(nGens, rels, words), g = enumerateGeneral(nGens, rels, words, { seconds: 30, maxCosets: 3e6 });
    assert.equal(f.index, 2304);
    assert.equal(g.index, 2304);
    assert.ok(f.defined < g.defined / 10);
});

test('split over ℚ: Fuchsian vertex stabilizer PGL₂(ℤ), the same indices as PGL₂(ℤ[1/S]) (sarithIndex.js)', () => {
    const cases = [
        [[['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['2', '0', '0', '1']], [2], 2],
        [[['1', '2', '0', '1'], ['1', '0', '2', '1'], ['3', '0', '0', '1']], [3], 12],
        [[['1', '1', '0', '1'], ['1', '0', '3', '1'], ['2', '0', '0', '1']], [2], 8],
        [[['1', '1', '0', '1'], ['0', '-1', '1', '0'], ['25', '0', '0', '1']], [5], 4],
        [[['1', '1', '0', '1'], ['1', '0', '2', '1'], ['2', '0', '0', '3']], [2, 3], 4],
    ];
    for (const [rows, Sp, index] of cases) {
        const r = definiteIndex(rows, [0n, 1n], Sp);
        assert.equal(r.index, index, JSON.stringify(rows));
        assert.equal(r.place, 'real');
        assert.ok(Math.abs(r.covols[0] - Math.PI / 3) < 1e-9);           // PSL₂(ℤ): area π/3
    }
});

test('Bianchi groups: Kleinian vertex stabilizers PGL₂(𝒪), the same indices as PGL₂(𝒪[1/S]) (bianchi.js)', () => {
    const F = { 1: [1n, 0n, 1n], 2: [2n, 0n, 1n], 3: [1n, 1n, 1n] };
    const field = (d) => ({ minpoly: F[d].map(String), P: [['1', '0'], ['0', '1']] });
    const prime = (d, p, H) => ({ p, H });
    const cases = [
        [1, [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['1+w', '0', '0', '1']], [{ p: '2', H: [['1', '1'], ['0', '2']] }], 2, 0.1526609],
        [1, [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['1', '0', '3', '1'], ['2+w', '0', '0', '1']], null, 20, 0.1526609],
        [1, [['1', '3', '0', '1'], ['1', '3*w', '0', '1'], ['1', '0', '3', '1'], ['1+w', '0', '0', '1'], ['0', '-1', '1', '0']], [{ p: '2', H: [['1', '1'], ['0', '2']] }], 270, 0.1526609],
        [2, [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['w', '0', '0', '1']], null, 2, 0.5019205],
        [3, [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['2+w', '0', '0', '1']], null, 2, 0.0845785],
    ];
    for (const [d, rows, S0, index, covol] of cases) {
        // S: the primes of k dividing π, for the generator diag(π, 1)
        const K = new Ord.KField(F[d]);
        const pi = rows.find((r) => r[1] === '0' && r[2] === '0' && r[3] === '1')[0];
        const m = /^(-?\d+)?\+?(-?\d*)\*?w$/.exec(pi);
        const el = m ? { v: [BigInt(m[1] || '0'), BigInt(m[2] === '' ? '1' : m[2])], d: 1n } : { v: [BigInt(pi), 0n], d: 1n };
        const S = S0 || Ord.primesOf(K.norm(el)[0]).flatMap((p) => K.primesAbove(p).filter((P) => K.valuation(el, P) > 0).map((P) => ({ p: String(P.p), e: P.e, f: P.f, H: P.H.map((r) => r.map(String)) })));
        const r = definiteIndex(rows, F[d], S, { field: field(d), ram: [], seconds: 20 });
        assert.equal(r.index, index, `${d}: ${JSON.stringify(rows)}: ${r.error || r.limit || ''}`);
        assert.equal(r.place, 'complex');
        assert.ok(Math.abs(r.covols[0] - covol) < 1e-6, `${r.covols[0]} vs ${covol}`);
    }
});

test('new algebras with Fuchsian and Kleinian stabilizers: index = orbit of an idempotent, confirmed by the level', () => {
    // (−1, 3)_ℚ, ramified at 2 and 3, in M₂(ℚ(√3)): a + bi + cj + d·ij ↦ (a + c√3, −b + d√3; b + d√3, a − c√3)
    const Q3 = (a, b, c, d) => [t(a, c), t(-b, d), t(b, d), t(a, -c)];
    const fu = idempotentStabilizer(null, [5], 7n, [Q3(0, 1, 0, 0), Q3(2, 0, 1, 0), Q3(2, 1, 0, 0)], { poly: [-3n, 0n, 1n] });
    assert.equal(fu.r.place, 'real');
    assert.ok(Math.abs(fu.r.covols[0] - Math.PI / 6) < 1e-9);       // P(𝒪¹) has area 2π/3, and [U⁺ : P(𝒪¹)] = 4
    assert.equal(fu.r.index, fu.orbit);
    assert.equal(fu.r.level && fu.r.level.N, '7');
    // ℚ(√−7): PGL₂(𝒪) with 𝒪 = ℤ[(1+√−7)/2], volume half of PSL₂(𝒪)'s 0.888914
    const K7 = new Ord.KField([2n, -1n, 1n]);
    const P2 = K7.primesAbove(2n).find((P) => K7.valuation({ v: [0n, 1n], d: 1n }, P) > 0);
    const S7 = [{ p: '2', e: P2.e, f: P2.f, H: P2.H.map((r) => r.map(String)) }];
    const kl = idempotentStabilizer(null, S7, 3n, [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0'], ['w', '0', '0', '1']], { poly: [2n, -1n, 1n], field: { minpoly: ['2', '-1', '1'], P: [['1', '0'], ['0', '1']] }, ram: [] });
    assert.equal(kl.r.place, 'complex');
    assert.ok(Math.abs(kl.r.covols[0] - 0.444457) < 1e-5);
    assert.equal(kl.r.index, kl.orbit);
    assert.equal(kl.r.level && kl.r.level.N, '3');
});

test('a cubic field with one complex place: the Kleinian vertex stabilizer reaches Borel\'s covolume', () => {
    // k of discriminant −23, the algebra ramified at the real place and at (2) (norm 8), S = {𝔭₅}. The Dirichlet
    // domain's volume must equal covol(U⁺) from Borel's formula (dirichletStabilizer throws below it and keeps adding
    // elements until it matches); the input group itself has an index too large to enumerate in a test.
    const f = JSON.parse(fs.readFileSync(new URL('./fixtures/kleinianCubic.json', import.meta.url), 'utf8'));
    const r = definiteIndex(f.rows, f.poly.map(BigInt), f.S, { field: f.k, ram: f.ramFinite, levelPrimes: f.levelPrimes, seconds: 0.2, buildSeconds: 60 });
    assert.equal(r.k, 3);
    assert.equal(r.place, 'complex');
    assert.equal(r.reps, 1);
    assert.ok(Math.abs(r.covols[0] - 0.1374782) < 1e-6);
    assert.ok(r.stabGens[0] >= 2);
    assert.ok(r.gens > 0 && r.relators > 0);
});
