// The Delaunay domain (js/delaunay.js): the Delaunay cells of the basepoint's
// orbit, cut along their barycentric subdivision where they have a symmetry,
// one piece from each orbit, glued into a fundamental polyhedron. Checked
// against the Dirichlet domain of the same group: the same volume, the same
// H₁ from its own presentation, a sphere for a boundary, pairings that carry
// facets onto facets, and relators that hold.
//
//   node --test --import ./tests/register.mjs tests/delaunay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const THREE = await import('three');
const { Matrix2x2: M, translationTowards, distFromIdentityPSL } = await import('../js/math.js');
const { serializeTowerContext } = await import('../js/tower.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');
const { runCompute, matToArr, arrToMat } = await import('../js/compute.js');
const { buildPolyhedron } = await import('../js/polyhedron.js');
const { isRealGroup } = await import('../js/planar.js');
const { computeDelaunayDomain, delaunayVolume, planarHome } = await import('../js/delaunay.js');
const P = await import('../js/presentation.js');

const preset = (name) => {
    const ex = exampleLibrary.find(e => e.name === name);
    assert.ok(ex, `no preset ${name}`);
    const consts = [...(ex.name === 'Hecke group' ? [['n', '5']] : []), ...(ex.consts || [])];
    return { ...buildGroup({ mats: ex.mats, anti: ex.anti || [], consts }), depth: ex.depth || 8 };
};

/** The Dirichlet domain at the basepoint B·j, as the page holds it (home frame). */
function dirichlet({ matrices, exactCtx, depth = 8 }, B = M.identity()) {
    const Bi = B.inv();
    const gens = matrices.map(m => Bi.mul(m).mul(B).normalized());
    const out = runCompute(JSON.parse(JSON.stringify({
        gens: gens.map(matToArr), origGens: matrices.map(matToArr), B: matToArr(B), maxFaces: 96, maxDepth: depth,
        fullDirichlet: false, exact: exactCtx ? serializeTowerContext(exactCtx) : null,
    })));
    const walls = out.domain.walls.map(w => ({
        cov: new THREE.Vector4(...w.cov), elem: arrToMat(w.elem), word: w.word,
        pairing: w.pairing ? { alg: arrToMat(w.pairing.alg), word: w.pairing.word, partner: w.pairing.partner } : null
    }));
    const home = { walls, poly: buildPolyhedron(walls), conePoint: new THREE.Vector3(...out.domain.conePoint), stabilizer: out.domain.stabilizer };
    return { out, home, gens };
}

/** The Delaunay domain as the page computes it: in the plane for a group in PGL₂(ℝ). */
function delaunay(grp, B) {
    const { out, home, gens } = dirichlet(grp, B);
    const dim = isRealGroup(grp.matrices) ? 2 : 3;
    if (dim === 3) return { out, R: computeDelaunayDomain(home, { dim }) };
    const ph = planarHome(home, gens, {});
    return { out, R: computeDelaunayDomain(ph.home, { dim, frame: ph.frame }) };
}

const h1 = (R) => P.abelianizationString(P.abelianization({ n: R.pairs.length, relators: R.relators }));
const isId = (m) => distFromIdentityPSL(m) < 1e-6;

/** Every pairing carries each facet onto its partner, corner by corner. */
function checkPairings(R) {
    for (const f of R.raw) {
        const g = R.raw[f.partner];
        f.pts.forEach((q, i) => {
            const img = f.el.apply(q), want = g.pts[i];
            const d = f.ideal[i] ? img.clone().normalize().distanceTo(want.clone().normalize()) : img.distanceTo(want);
            assert.ok(d < 1e-6, `pairing misses a corner by ${d}`);
        });
    }
}

/** Each relator, multiplied out in the face pairings, is the identity. */
function checkRelators(R) {
    for (const r of R.relators) {
        let X = M.identity();
        for (const x of r.enc) {
            const g = R.pairs[Math.abs(x) - 1].el.m;
            X = X.mul(x > 0 ? g : g.inv()).normalized();
        }
        let Y = M.identity();
        for (let k = 0; k < r.m; k++) Y = Y.mul(X).normalized();
        assert.ok(isId(Y), `relator ${r.enc.join(' ')}^${r.m} is not the identity`);
    }
    assert.ok(R.cycles.every(c => c.ok), 'every cycle closes up');
}

function check(R, out) {
    assert.ok(R.ok, R.message);
    assert.equal(h1(R), out.invariants.h1String);
    checkPairings(R);
    checkRelators(R);
    if (R.dim === 3) {
        const vol = delaunayVolume(R);
        assert.ok(Math.abs(vol - out.invariants.volume) < 1e-6 * out.invariants.volume, `volume ${vol} vs ${out.invariants.volume}`);
        const S = R.stats;
        assert.equal(S.vertices + S.conePoints + S.idealVertices - S.edges + S.faces, 2, 'the boundary is a sphere');
    }
}

// Every preset of finite covolume whose Dirichlet domain is certified.
const FINITE = [
    'Jorgensen fibered (n=2)', 'Jorgensen fibered (n=3)', 'Jorgensen fibered (n=4)', 'Borromean rings group',
    'Index-6 subgroup of PSL(2,Z[i])', 'Figure eight knot group', 'PSL(2,Z[w])', 'PSL(2,Z[√-5])',
    'SO₃(Z[2<sup>1/3</sup>])', 'Weeks manifold (closed)', 'Meyerhoff manifold (closed)', 'FLMS',
    'Z[i] kaleidoscope (mirror box)', 'Right-angled dodecahedron (12 mirrors)',
    // in the plane
    'Modular group', 'Hecke group', '(2,3,7) triangle group (cocompact Fuchsian)', 'Bolza surface (genus 2)',
    'Genus-2 surface (generic basepoint)', 'Ideal triangle kaleidoscope (3 mirrors)', 'Modular kaleidoscope (2,3,∞ mirrors)',
];
for (const name of FINITE) {
    test(`Delaunay domain: ${name}`, () => {
        const { out, R } = delaunay(preset(name));
        check(R, out);
    });
}

test('closed manifolds: far fewer face pairings than the Dirichlet domain', () => {
    for (const [name, pairs] of [['Weeks manifold (closed)', 5], ['Meyerhoff manifold (closed)', 5], ['FLMS', 5]]) {
        const { out, R } = delaunay(preset(name));
        assert.equal(R.stats.pairs, pairs, name);
        assert.ok(R.stats.pairs < out.domain.walls.length / 2);
        assert.equal(R.stats.conePoints, 0, 'a manifold has no cone points');
    }
});

test('orbifolds: cells with a symmetry are cut, and the cycles carry the orders', () => {
    const { R } = delaunay(preset('(2,3,7) triangle group (cocompact Fuchsian)'));
    assert.deepEqual([...R.stats.cellSymmetry].sort((a, b) => a - b), [1, 3, 7]);
    assert.deepEqual(R.relators.map(r => r.m).filter(m => m > 1).sort((a, b) => a - b), [2, 3, 7]);
    const J = delaunay(preset('Jorgensen fibered (n=3)')).R;
    assert.ok(J.relators.some(r => r.m === 3));
    // A reflection group's Delaunay domain is its chamber: every face a mirror.
    const D = delaunay(preset('Right-angled dodecahedron (12 mirrors)')).R;
    assert.equal(D.stats.faces, 12);
    assert.equal(D.stats.pairs, 12);
    assert.equal(D.stats.conePoints, 20);
});

test('Delaunay domain at random basepoints (Weeks, figure eight, PSL(2,Z[w]))', () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const name of ['Weeks manifold (closed)', 'Figure eight knot group', 'PSL(2,Z[w])']) {
        const grp = preset(name);
        for (let t = 0; t < 3; t++) {
            const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
            const { out, R } = delaunay(grp, translationTowards(dir, 0.2 + 0.8 * rnd()));
            if (out.report.status !== 'verified') continue;
            check(R, out);
        }
    }
});

test('genus-2 surface: an octagon with one relator of length 8, against the Dirichlet 18-gon', () => {
    const { out, R } = delaunay(preset('Genus-2 surface (generic basepoint)'));
    assert.equal(out.domain.walls.length, 18);
    assert.equal(R.stats.faces, 8);
    assert.equal(R.stats.pairs, 4);
    assert.equal(R.stats.cells, 6, 'six Delaunay triangles (4g − 2)');
    assert.ok(R.convex);
    assert.equal(R.relators.length, 1);
    assert.equal(R.relators[0].enc.length, 8);
    // At the centre of the regular octagon the Delaunay cell is itself a regular octagon.
    assert.deepEqual(delaunay(preset('Bolza surface (genus 2)')).R.stats.cellSizes, [8]);
});

test('cusped surfaces (punctured torus, Γ(2))', () => {
    for (const [mats, sides, ideal] of [
        [[['1', '1', '1', '2'], ['1', '-1', '-1', '2']], 6, 1],
        [[['1', '2', '0', '1'], ['1', '0', '2', '1']], 6, 3],
    ]) {
        const grp = buildGroup({ mats, anti: [], consts: [] });
        const { out, R } = delaunay(grp, translationTowards(new THREE.Vector3(0.6, 0, 0.8), 0.3));
        check(R, out);
        assert.equal(R.stats.faces, sides);
        assert.equal(R.stats.idealVertices, ideal);
    }
});

test('Delaunay domain declines infinite covolume', () => {
    const { R } = delaunay(preset('quasiSchottky'));
    assert.equal(R.ok, false);
    assert.equal(R.reason, 'infinite');
});
