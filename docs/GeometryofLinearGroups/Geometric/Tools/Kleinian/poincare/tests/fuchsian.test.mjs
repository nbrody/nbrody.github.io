// Fuchsian groups: the 17 decision-path examples of the retired Fuchsian
// Discreteness Calculator (Tools/_archive/fuchsianDiscreteness) decided end to
// end, the commuting-loxodromic test of js/nondiscrete.js (axisTest), and the
// classical certificates of js/classical.js for domains the certifier cannot
// finish (cusps where two walls only touch, as for Γ(2)).
//
//   node --test --import ./tests/register.mjs tests/fuchsian.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const { Matrix2x2: M } = await import('../js/math.js');
const { serializeTowerContext } = await import('../js/tower.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { runCompute, matToArr } = await import('../js/compute.js');
const { findNondiscreteness } = await import('../js/nondiscrete.js');
const { classicalDiscreteness } = await import('../js/classical.js');

const read = (mats) => buildGroup({ mats, anti: [], consts: [] });

function compute(mats) {
    const { matrices, exactCtx } = read(mats);
    assert.ok(exactCtx, 'entries read exactly');
    const input = {
        gens: matrices.map(matToArr), origGens: matrices.map(matToArr),
        B: matToArr(M.identity()), maxFaces: 96, maxDepth: 8, fullDirichlet: false,
        exact: serializeTowerContext(exactCtx), ford: null,
    };
    return runCompute(JSON.parse(JSON.stringify(input))).report;
}

const S = ['0', '-1', '1', '0'];
const T = ['1', '1', '0', '1'];
const D = true, ND = false;
// name, generators, discrete? — as in fuchsianDiscreteness/js/examples.js
const EXAMPLES = [
    ['Modular PSL₂(ℤ)', [S, T], D],
    ['Infinite-order elliptic', [['1', '-2', '1', '1']], ND],
    ['Incommensurable axes', [['2', '0', '0', '1'], ['3', '0', '0', '1']], ND],
    ['Dense parabolics (Shimizu)', [T, ['1', '0', '1/2', '1']], ND],
    ['Sanov Γ(2)', [['1', '2', '0', '1'], ['1', '0', '2', '1']], D],
    ['Finite cyclic, order 4', [['1', '-1', '1', '1']], D],
    ['Hecke-style commutator', [T, ['1', '0', '2/3', '1']], ND],
    ['Γ₀(2)', [T, ['1', '0', '2', '1']], D],
    ['Γ₀(3)', [T, ['1', '0', '3', '1']], D],
    ['Γ(3)', [['1', '3', '0', '1'], ['1', '0', '3', '1'], ['4', '-3', '3', '-2']], D],
    ['Schottky', [['3', '0', '0', '1/3'], ['5/3', '4/3', '4/3', '5/3']], D],
    ['Long–Reid', [['3', '0', '0', '1/3'], ['41/4', '1/4', '9/8', '1/8']], D],
    ['Magnus curve, t = 2', [['2', '0', '0', '1'], ['5', '2', '2', '1']], D],
    ['Hecke H(4)', [['1', '\\sqrt{2}', '0', '1'], S], D],
    ['Hecke H(5)', [['1', '\\frac{1+\\sqrt{5}}{2}', '0', '1'], S], D],
    ['Hecke H(6)', [['1', '\\sqrt{3}', '0', '1'], S], D],
    ['Hecke H(7)', [['1', '2\\cos(\\frac{\\pi}{7})', '0', '1'], S], D],
];

for (const [name, mats, discrete] of EXAMPLES) {
    test(`decided as the Fuchsian Discreteness Calculator did: ${name}`, () => {
        const rep = compute(mats);
        if (discrete) {
            assert.ok(rep.status === 'verified' || rep.classical, `${name}: status ${rep.status}, no classical certificate`);
            assert.ok(!(rep.nondiscrete && rep.nondiscrete.exact), `${name}: no proof of non-discreteness`);
        } else {
            assert.equal(rep.status, 'nondiscrete', `${name}: an exact certificate of non-discreteness`);
            assert.equal(rep.classical, null);
        }
    });
}

// ---------------- commuting loxodromics (nondiscrete.js) ----------------

function axis(mats) {
    const { matrices, exactCtx } = read(mats);
    return { exact: findNondiscreteness(matrices, exactCtx), float: findNondiscreteness(matrices, null) };
}

test('commuting loxodromics with rational, independent multipliers 2 and 3', () => {
    const { exact, float } = axis([['2', '0', '0', '1'], ['3', '0', '0', '1']]);
    assert.equal(exact.kind, 'axis');
    assert.equal(exact.exact, true);
    assert.match(exact.text, /coprime factors 2, 3/);
    assert.equal(float.kind, 'axis');
    assert.equal(float.exact, false);
});

test('commuting loxodromics with dependent multipliers 2 and 4: no certificate', () => {
    const { exact, float } = axis([['2', '0', '0', '1'], ['4', '0', '0', '1']]);
    assert.equal(exact.found, false);
    assert.equal(float.found, false);
});

test('a unit and a non-unit of norm 1 in ℚ(√5) on a common axis', () => {
    // (2 1; 1 1) and (2 1; 1 1) + 2: λ + 1/λ = 7 ∈ ℤ, λ′ + 1/λ′ = 27/11 ∉ ℤ
    const { exact } = axis([['2', '1', '1', '1'], ['4', '1', '1', '3']]);
    assert.equal(exact.kind, 'axis');
    assert.equal(exact.exact, true);
    assert.match(exact.text, /algebraic integer/);
});

test('two units of ℚ(√5) on a common axis are dependent: no certificate', () => {
    // (3 1; 1 2) = (2 1; 1 1) + 1 has λ′² = λ
    const { exact } = axis([['2', '1', '1', '1'], ['3', '1', '1', '2']]);
    assert.equal(exact.found, false);
});

// ---------------- classical certificates (classical.js) ----------------

const classical = (mats) => classicalDiscreteness(read(mats).exactCtx);

test('Γ(2) is discrete by ping-pong (|ab| = 4), where the domain leaves its cusps unresolved', () => {
    const rep = compute([['1', '2', '0', '1'], ['1', '0', '2', '1']]);
    assert.equal(rep.classical.kind, 'parabolic-pair');
    assert.equal(rep.entries[0].text, '— Discrete: a classical certificate —');
});

test('⟨z + 1⟩ and ⟨z + 1, z + ½⟩ are cyclic', () => {
    for (const mats of [[T], [T, ['1', '1/2', '0', '1']]]) {
        const rep = compute(mats);
        assert.ok(rep.status === 'verified' || (rep.classical && rep.classical.kind === 'cyclic-parabolic'), `status ${rep.status}`);
    }
    assert.equal(classical([T, ['1', '1/2', '0', '1']]).kind, 'cyclic-parabolic');
});

test('Fricke: the commutator subgroup of PSL₂(ℤ), tr[A, B] = −2', () => {
    const r = classical([['1', '1', '1', '2'], ['1', '-1', '-1', '2']]);
    assert.equal(r.kind, 'fricke');
    assert.match(r.headline, /−2/);
});

test('Hecke: a parabolic and an involution with λ² = 4, and λ² = 2', () => {
    assert.equal(classical([['1', '2', '0', '1'], S]).kind, 'hecke');
    assert.match(classical([['1', '1', '0', '1'], ['0', '-1', '2', '0']]).headline, /2cos\(π\/4\)/);
});

test('classical certificates never claim a non-discrete or out-of-scope group', () => {
    const none = [
        [['1', '-2', '1', '1']],                                   // elliptic of infinite order
        [['2', '0', '0', '1'], ['3', '0', '0', '1']],              // incommensurable axes
        [T, ['1', '0', '1/2', '1']],                               // Shimizu
        [T, ['1', '0', '2/3', '1']],                               // κ = 13/9 ∈ (−2, 2)
        [T, ['1', '\\sqrt{2}', '0', '1']],                         // irrational entries: out of scope
        [['2', '0', '0', '1'], ['3', '0', '0', '1'], ['0', '1', '1', '0']], // det < 0: out of scope
    ];
    for (const mats of none) assert.equal(classical(mats), null, JSON.stringify(mats));
});
