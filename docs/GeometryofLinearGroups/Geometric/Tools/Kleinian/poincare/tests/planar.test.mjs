// The plane picture (js/planar.js): which groups lie in PGL₂(ℝ), and the
// fundamental polygon as the slice of the 3D domain by the plane over ℝ.
//
//   node --test --import ./tests/register.mjs tests/planar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { Matrix2x2: M, Complex: C } = await import('../js/math.js');
const { isRealGroup, planarEdgeMidpoints } = await import('../js/planar.js');
const { computeCanonicalDomain } = await import('../js/canonical.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');

const preset = (name) => {
    const ex = exampleLibrary.find(e => e.name === name);
    const consts = [...(name === 'Hecke group' ? [['n', '5']] : []), ...(ex.consts || [])];
    return buildGroup({ mats: ex.mats, anti: ex.anti || [], consts }).matrices;
};

test('groups in PGL₂(ℝ), up to scalars and with mirrors', () => {
    for (const name of ['Modular group', 'Surface group', 'Surface group 2', 'Long-Reid Group', 'Hecke group',
        '(2,3,7) triangle group (cocompact Fuchsian)', 'Ideal triangle kaleidoscope (3 mirrors)', 'Modular kaleidoscope (2,3,∞ mirrors)']) {
        assert.ok(isRealGroup(preset(name)), name);
    }
    for (const name of ['Figure eight knot group', 'Apollonian Gasket', 'Weeks manifold (closed)', 'Z[i] kaleidoscope (mirror box)']) {
        assert.ok(!isRealGroup(preset(name)), name);
    }
    // det < 0 is real up to the scalar i: normalized, its entries are imaginary
    const flip = new M(new C(1), new C(0), new C(0), new C(-1)).normalized();
    assert.ok(isRealGroup([flip]));
    assert.ok(!isRealGroup([new M(new C(1), new C(0, 1), new C(0), new C(1))]));
});

test('the fundamental polygon: one edge per wall, on the plane, inside the disk', () => {
    for (const name of ['Modular group', '(2,3,7) triangle group (cocompact Fuchsian)', 'Ideal triangle kaleidoscope (3 mirrors)', 'Surface group 2']) {
        const gens = preset(name).flatMap(g => [g, g.inv().normalized()]);
        const D = computeCanonicalDomain(gens, M.identity(), 96, { maxDepth: 8 });
        const mids = planarEdgeMidpoints(D);
        const edges = mids.filter(Boolean);
        assert.equal(edges.length, D.walls.length, `${name}: every face meets the plane in an edge`);
        for (const p of edges) {
            assert.equal(p.y, 0);
            assert.ok(p.lengthSq() < 1, `${name}: edge midpoint inside the disk`);
        }
    }
});
