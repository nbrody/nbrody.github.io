// Certificates of non-discreteness (js/nondiscrete.js): each kind of witness,
// exact and floating point, no false positive on any (discrete) preset, and
// the end-to-end report when Poincaré's conditions fail.
//
//   node --test --import ./tests/register.mjs tests/nondiscrete.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const { Matrix2x2: M } = await import('../js/math.js');
const { serializeTowerContext } = await import('../js/tower.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');
const { runCompute, matToArr } = await import('../js/compute.js');
const { findNondiscreteness } = await import('../js/nondiscrete.js');

const read = (mats, consts = []) => buildGroup({ mats, anti: [], consts });

/** The witness found exactly and in floating point. */
function witness(mats, opts = {}) {
    const { matrices, exactCtx } = read(mats);
    assert.ok(exactCtx, 'entries read exactly');
    return {
        exact: findNondiscreteness(matrices, exactCtx, opts),
        float: findNondiscreteness(matrices, null, opts),
    };
}

const T = ['1', '1', '0', '1'];

test('an elliptic of infinite order: tr²/det = 16/5', () => {
    const { exact, float } = witness([T, ['2+i', '0', '0', '2-i']]);
    assert.equal(exact.found && exact.exact, true);
    assert.equal(exact.kind, 'elliptic');
    assert.deepEqual(exact.words, [[2]]);
    assert.ok(Math.abs(exact.angle - 2 * Math.acos(Math.sqrt(16 / 5) / 2)) < 1e-12);
    assert.equal(float.found, true);
    assert.equal(float.exact, false);
    assert.equal(float.kind, 'elliptic');
});

test('two parabolics at one cusp with ratio √2', () => {
    const { exact, float } = witness([T, ['1', '\\sqrt{2}', '0', '1']]);
    assert.equal(exact.kind, 'cusp');
    assert.equal(exact.exact, true);
    assert.deepEqual(exact.words, [[1], [2]]);
    assert.match(exact.text, /x² − 2/);
    assert.equal(float.kind, 'cusp');
    assert.equal(float.exact, false);
});

test('three parabolics at one cusp with ℚ-independent translations 1, i, √2', () => {
    const { exact } = witness([T, ['1', 'i', '0', '1'], ['1', '\\sqrt{2}', '0', '1']]);
    assert.equal(exact.kind, 'cusp');
    assert.equal(exact.words.length, 3);
    assert.match(exact.headline, /independent over ℚ/);
});

test('a rotation of order 3 at a cusp whose translations are ℤ[i]', () => {
    // ⟨z+1, z+i, ωz⟩: the translations 1, i, ω span a rank-3 group.
    const { exact, float } = witness([T, ['1', 'i', '0', '1'], ['\\frac{-1+\\sqrt{3}i}{2}', '0', '0', '1']]);
    assert.equal(exact.kind, 'cusp');
    assert.equal(exact.words.length, 3);
    assert.equal(float.kind, 'cusp');
});

test('a loxodromic fixing a cusp: ⟨z+1, 4z⟩', () => {
    const { exact } = witness([T, ['2', '0', '0', '1/2']]);
    assert.equal(exact.kind, 'cusp');
    assert.match(exact.headline, /loxodromic/);
    assert.match(exact.text, /μ = 4/);
});

test('a rotation of order 5 at a cusp (crystallographic restriction)', () => {
    const c = '\\cos(\\frac{\\pi}{5})', s = '\\sin(\\frac{\\pi}{5})';
    const { exact } = witness([T, [`${c}+i${s}`, '0', '0', `${c}-i${s}`]]);
    assert.equal(exact.kind, 'cusp');
    assert.match(exact.text, /order 5/);
});

test('two loxodromics with exactly one common fixed point: through their commutator', () => {
    const { exact } = witness([['2', '0', '0', '1/2'], ['3', '1', '0', '1/3']]);
    assert.equal(exact.kind, 'cusp');
    assert.match(exact.headline, /loxodromic/);
});

test('Jørgensen and Shimizu, when no short elliptic is available', () => {
    // A = diag(11/10, 10/11), B = (2 1; 1 1): |tr²A − 4| + |tr[A,B] − 2| ≈ 0.045
    const j = witness([['11/10', '0', '0', '10/11'], ['2', '1', '1', '1']], { maxLen: 1 });
    assert.equal(j.exact.kind, 'jorgensen');
    assert.equal(j.exact.exact, true);
    assert.equal(j.float.kind, 'jorgensen');
    // Shimizu: ⟨z + 1, z/(cz + 1)⟩ with c = i/2 (the commutator, an elliptic, has length 4)
    const s = witness([T, ['1', '0', '\\frac{i}{2}', '1']], { maxLen: 2 });
    assert.equal(s.exact.kind, 'shimizu');
    assert.ok(Math.abs(s.exact.value - 0.25) < 1e-12);
});

test('Shimizu at a cusp by a Ford-domain search: ⟨(1 ∛4·ω; 0 1), (1 0; 1 1)⟩, just outside the Riley slice', () => {
    // ρ = ∛4·ω has |ρ| ≈ 1.587, under 1% inside the complement of the Riley slice along arg ρ = 2π/3;
    // no word of length ≤ 16 breaks Shimizu's lemma, but closing the Ford domain's faces at a cusp
    // reaches one (about 90 letters), and the 256-bit evaluation makes it exact
    const { exact, float } = witness([['1', '4^{1/3}\\omega', '0', '1'], ['1', '0', '1', '1']]);
    assert.equal(exact.found && exact.exact, true);
    assert.equal(exact.kind, 'shimizu');
    assert.ok(exact.value < 1);
    assert.match(exact.text, /Ford domain/);
    assert.equal(float.found, true);
    assert.equal(float.kind, 'shimizu');
    // inside the slice (ρ = 2·∛4·ω, the Keen–Series normalization) nothing is found
    const inside = witness([['1', '2\\cdot 4^{1/3}\\omega', '0', '1'], ['1', '0', '1', '1']]);
    assert.equal(inside.exact.found, false);
    assert.equal(inside.float.found, false);
});

test('no false positive on any preset (all discrete), exact or floating point', () => {
    for (const ex of exampleLibrary) {
        const consts = [...(ex.name === 'Hecke group' ? [['n', '5']] : []), ...(ex.consts || [])];
        const { matrices, exactCtx } = buildGroup({ mats: ex.mats, anti: ex.anti || [], consts });
        for (const ctx of [exactCtx, null]) {
            const r = findNondiscreteness(matrices, ctx, { allowConj: true });
            assert.equal(r.found, false, `${ex.name} (${ctx ? 'exact' : 'float'}): ${r.headline}`);
        }
    }
});

function compute(mats, exactCtx) {
    const input = {
        gens: mats.map(matToArr), origGens: mats.map(matToArr),
        B: matToArr(M.identity()), maxFaces: 96, maxDepth: 8, fullDirichlet: false,
        exact: exactCtx ? serializeTowerContext(exactCtx) : null, ford: null,
    };
    return runCompute(JSON.parse(JSON.stringify(input)));
}

test('runCompute: a failed certificate gets the proof of non-discreteness first', () => {
    const { matrices, exactCtx } = read([T, ['1', '\\sqrt{2}', '0', '1'], ['0', '-1', '1', '0']]);
    const out = compute(matrices, exactCtx);
    assert.equal(out.report.status, 'nondiscrete');
    assert.equal(out.report.nondiscrete.exact, true);
    assert.equal(out.report.entries[0].kind, 'head');
    assert.match(out.report.entries[0].text, /NOT discrete/);
    assert.equal(out.report.entries[1].ref.points.length > 0, true);
    // Floating point only: evidence, and the status stays 'failed'.
    const fl = compute(matrices, null);
    assert.equal(fl.report.status, 'failed');
    assert.equal(fl.report.nondiscrete.exact, false);
    // A certified group is never searched.
    const ok = compute([T, ['0', '-1', '1', '0']].map(m => read([m]).matrices[0]), null);
    assert.equal(ok.report.status, 'verified');
    assert.equal(ok.report.nondiscrete, null);
});
