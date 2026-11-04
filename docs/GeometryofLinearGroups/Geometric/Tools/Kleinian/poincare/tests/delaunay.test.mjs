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
const { Matrix2x2: M, translationTowards, distFromIdentityPSL, lorentzMatrix, lorentzApply } = await import('../js/math.js');
const { ballToKlein } = await import('../js/polyhedron.js');
const CUSPS = await import('../js/cusps.js');
const { serializeTowerContext } = await import('../js/tower.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');
const { runCompute, matToArr, arrToMat } = await import('../js/compute.js');
const { buildPolyhedron } = await import('../js/polyhedron.js');
const { isRealGroup } = await import('../js/planar.js');
const { computeDelaunayDomain, delaunayVolume, planarHome, delaunayEdgesNear, segmentDistance, GRID_CLIP, planarSides, planarTileOf } = await import('../js/delaunay.js');
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

test('honeycomb edges: each grid cell lists the nearest segment, with true lower bounds', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const name of ['Weeks manifold (closed)', 'Figure eight knot group']) {
        const { home } = dirichlet(preset(name));
        const R = computeDelaunayDomain(home, { dim: 3 });
        const segs = delaunayEdgesNear(R, home, () => [1, 1, 1]);
        assert.ok(segs && segs.grid, name);
        const G = segs.grid, n = G.n, kap = Math.tanh(G.far + GRID_CLIP);
        assert.ok(segs.every(s => 2 * s.r <= 0.75 + 1e-9), 'edges come in short pieces');
        let checked = 0;
        for (let t = 0; t < 3000; t++) {
            // A random point of a random listed cell (cut off where the shader stops using the grid).
            const g = [0, 1, 2].map(() => Math.floor(rnd() * n)), c = g[0] + n * (g[1] + n * g[2]);
            const cnt = G.cells[2 * c + 1];
            if (cnt < 0) continue;
            let k = g.map((v, i) => G.lo[i] + G.size[i] * (v + rnd()) / n);
            const r = Math.hypot(...k);
            if (r >= kap) k = k.map(x => x * kap * (1 - 1e-9) / r);
            if (k.some((x, i) => Math.floor((x - G.lo[i]) / G.size[i] * n) !== g[i])) continue;
            const s = 1 / Math.sqrt(1 - k.reduce((a, x) => a + x * x, 0)), X = [...k.map(x => x * s), s];
            const ds = segs.map(sg => segmentDistance(X, sg));
            const off = G.cells[2 * c];
            let listed = Infinity;
            for (let j = 0; j < cnt; j++) {
                const i = G.list[2 * (off + j)], lb = G.list[2 * (off + j) + 1];
                assert.ok(lb <= ds[i] + 1e-9, 'a lower bound that is not one');
                listed = Math.min(listed, ds[i]);
            }
            assert.ok(listed <= Math.min(...ds) + 1e-9, `${name}: cell ${c} misses the nearest segment`);
            checked++;
        }
        assert.ok(checked > 300, `${name}: only ${checked} points checked`);
    }
});

test('cusp markers: glued ideal vertices get horoballs the gluings carry onto each other', () => {
    const { cuspNull, horoballInBall, kleinToHyperboloid, delaunayOrbit } = CUSPS;
    const close = (A, B) => Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z, A.w - B.w) < 1e-6 * B.w;
    const unit = (k) => k.clone().normalize();
    let delaunayPairs = 0, dirichletPairs = 0;
    for (const name of ['Figure eight knot group', 'Borromean rings group', 'Index-6 subgroup of PSL(2,Z[i])', 'PSL(2,Z[w])',
        'Modular group', 'Ideal triangle kaleidoscope (3 mirrors)', 'Modular kaleidoscope (2,3,∞ mirrors)', 'Z[i] kaleidoscope (mirror box)']) {
        const grp = preset(name);
        // Delaunay: each pairing carries the horoball at a facet's ideal corner onto its partner's.
        const { R } = delaunay(grp);
        const orbit = delaunayOrbit(R);
        // Nearest for real: the orbit one pairing further out has no point inside the largest empty horoball.
        const further = R.pairs.flatMap(({ el }) => [el, el.inv()]).flatMap(g => orbit.map(P => {
            const X = lorentzApply(g.L, new THREE.Vector4(...P));
            return [X.x, X.y, X.z, X.w];
        }));
        for (const v of R.vertices.filter(v => v.ideal)) {
            const N = cuspNull(unit(v.k), orbit, 0);
            const depth = Math.min(...further.map(P => N.w * P[3] - (N.x * P[0] + N.y * P[1] + N.z * P[2])));
            assert.ok(depth > 1 - 1e-9, `${name}: an orbit point inside the horoball at a cusp (${depth})`);
        }
        for (const f of R.raw) {
            const g = R.raw[f.partner];
            f.pts.forEach((q, i) => {
                if (!f.ideal[i]) return;
                const N = lorentzApply(f.el.L, cuspNull(unit(q), orbit)), want = cuspNull(unit(g.pts[i]), orbit);
                assert.ok(close(N, want), `${name}: Delaunay cusp horoballs disagree`);
                delaunayPairs++;
            });
        }
        // Dirichlet: the same with the Dirichlet centre, for every wall element carrying one ideal vertex to another.
        const { home } = dirichlet(grp);
        const C = [kleinToHyperboloid(ballToKlein(home.conePoint))];
        const ideal = home.poly.vertices.filter(v => v.ideal).map(v => unit(v.k));
        for (const w of home.walls) {
            const L = lorentzMatrix(w.elem);
            for (const x of ideal) {
                const N = lorentzApply(L, cuspNull(x, C));
                const y = ideal.find(z => horoballInBall(N).xi.distanceTo(z) < 1e-7);
                if (!y) continue;
                assert.ok(close(N, cuspNull(y, C)), `${name}: Dirichlet cusp horoballs disagree`);
                dirichletPairs++;
            }
        }
    }
    assert.ok(delaunayPairs > 20 && dirichletPairs > 20, `${delaunayPairs} / ${dirichletPairs} gluings checked`);
});

test('plane: the tile under a point, found by walking to it (double-click)', () => {
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const name of ['Genus-2 surface (generic basepoint)', '(2,3,7) triangle group (cocompact Fuchsian)', 'Modular group', 'Modular kaleidoscope (2,3,∞ mirrors)']) {
        const { R } = delaunay(preset(name));
        const sides = planarSides(R);
        let far = 0;
        for (let t = 0; t < 400; t++) {
            // A point of the disc anywhere out to a hyperbolic distance of about 4 from the centre.
            const a = 2 * Math.PI * rnd(), r = 0.999 * Math.sqrt(rnd());
            const k = new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a));
            const { el, crossed } = planarTileOf(R, k);
            const q = el.inv().apply(k);
            const worst = Math.max(...sides.map(sd => sd.s * (sd.n.dot(q) - sd.c)));
            assert.ok(worst < 1e-6, `${name}: the walk's tile misses the point by ${worst}`);
            if (crossed > 2) far++;
        }
        assert.ok(far > 50, `${name}: only ${far} points more than two tiles out`);
    }
});

test('Delaunay domain declines infinite covolume', () => {
    const { R } = delaunay(preset('quasiSchottky'));
    assert.equal(R.ok, false);
    assert.equal(R.reason, 'infinite');
});
