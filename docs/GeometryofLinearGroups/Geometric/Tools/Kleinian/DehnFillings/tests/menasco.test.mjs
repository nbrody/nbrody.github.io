// menasco.test.mjs — Menasco's two polyhedra of each alternating census knot, cut into ideal
// tetrahedra (js/menasco.js): valid, consistently oriented triangulations whose SnapPy shapes
// (tools/menasco_shapes.py) solve the gluing equations with the knot's volume; the figure-eight's
// is SnapPy's m004 triangulation, with a consistent diagram ↔ triangulation dictionary.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FOLD } from '../js/foldData.js';
import { CENSUS } from '../js/census.js';
import { Triangulation } from '../js/triangulation.js';
import { Solver } from '../js/solver.js';
import { diagram, foldModel, dictionary, developHalves, twistRegions } from '../js/menasco.js';
import { abs, sub, mul } from '../js/complex.js';

const parity = (p) => { let c = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) c++; return c & 1; };

test('the figure-eight diagram: 4 crossings, 6 regions, two of them two-sided, checkerboard', () => {
    const D = diagram(FOLD['4_1']);
    assert.equal(D.n, 4);
    assert.equal(D.faces.length, D.n + 2);
    assert.equal(D.faces.filter((F) => F.bigon).length, 2);
});

for (const [id, fold] of Object.entries(FOLD)) {
    const entry = CENSUS.find((e) => e.id === id);
    const tri = new Triangulation(entry);

    test(`${id}: the regions are checkerboard and glued with a one-step twist`, () => {
        const D = diagram(fold);
        assert.equal(D.faces.length, D.n + 2);
        const sideOf = new Map();
        D.faces.forEach((F) => F.darts.forEach((d) => sideOf.set(d, F)));
        for (let k = 0; k < D.M; k++) assert.notEqual(sideOf.get(2 * k).shaded, sideOf.get(2 * k + 1).shaded);
        for (const F of D.faces) {
            assert.deepEqual([...F.plus].sort(), [...F.corners].sort());
            assert.deepEqual([...F.minus].sort(), [...F.corners].sort());
            const k = F.corners.length;
            const shift = F.minus.map((x) => (F.plus.indexOf(x) - F.minus.indexOf(x) + k) % k);
            assert.ok(shift.every((s) => s === shift[0]) && shift[0] !== 0, `region ${F.index} twist`);
        }
    });

    test(`${id}: P⁺ ∪ P⁻ cut into tetrahedra solves the gluing equations with the knot's volume`, () => {
        const model = foldModel(fold, tri);
        assert.ok(model.supported, model.why);
        const tets = model.MT.tets;
        // closed up, and every gluing reverses orientation
        for (const T of tets) for (let f = 0; f < 4; f++) {
            const u = T.nbr[f], s = T.glu[f];
            assert.equal(parity(s), 1);
            const back = tets[u].glu[s[f]];
            assert.ok([0, 1, 2, 3].every((i) => back[s[i]] === i));
        }
        // SnapPy's shapes solve our edge equations, and the volume is the census knot's
        const pseudo = {
            nTet: tets.length, nCusp: 0, root: 0, pres: { nOrig: 0 }, cuspRows: [], shapes: fold.shapes,
            tets: tets.map((T) => ({ nbr: T.nbr, glu: T.glu, cusp: [0, 0, 0, 0], gen: [0, 0, 0, 0], m: [], l: [] })),
        };
        const sol = new Solver(new Triangulation(pseudo));
        const st = sol.completeState();
        // (modulo 2πi: at negatively oriented tetrahedra, as in 7₃ and 7₄, principal-branch logs can put
        // an edge equation off by a multiple of 2πi although the shapes solve it)
        const res = sol.residual(st, sol.equations([]));
        assert.ok(res.every((r) => Math.abs(r.re) < 1e-9 && Math.abs(r.im / (2 * Math.PI) - Math.round(r.im / (2 * Math.PI))) < 1e-9));
        if (fold.shapes.every(([, im]) => im > 0)) assert.ok(Math.max(...res.map(abs)) < 1e-9, 'all positively oriented: the log form holds exactly');
        assert.ok(Math.abs(sol.frame(st, 0, []).volume - entry.volume) < 1e-8);
        // developing the halves gives every crossing one position per half
        const dev = developHalves(model.MT, fold.shapes);
        for (let t = 0; t < tets.length; t++) {
            if (!dev.P[t]) continue;
            tets[t].labels.forEach((x, i) => {
                const p = dev.P[t][i], q = dev.pos[tets[t].side].get(x);
                const d = abs(sub(mul(p[0], q[1]), mul(q[0], p[1])));
                assert.ok(d < 1e-8 * (abs(p[0]) + abs(p[1])) * (abs(q[0]) + abs(q[1])), `tet ${t} vertex ${i}`);
            });
        }
        assert.equal(dev.pos[0].size, model.D.n);
        assert.equal(dev.pos[1].size, model.D.n);
    });

    test(`${id}: the dictionary is consistent (twist regions, edges carry their crossing arcs)`, () => {
        const model = foldModel(fold, tri);
        const D = model.D;
        for (const iso of [null, ...model.isos]) {
            const dict = dictionary(model, tri, iso);
            for (const B of D.faces.filter((F) => F.bigon)) {
                const [u, v] = B.corners;
                assert.equal(dict.arc[u].cls, dict.arc[v].cls);
                assert.equal(dict.arc[u].sign, -dict.arc[v].sign);
            }
            for (let k = 0; k < D.M; k++) {
                assert.deepEqual(dict.classAlong(0, k), dict.arc[D.underEnd(k)]);
                assert.deepEqual(dict.classAlong(1, k), dict.arc[D.overEnd(k)]);
            }
        }
        assert.equal(new Set(twistRegions(D).cls).size, twistRegions(D).count);
    });
}

test('the figure-eight\'s triangulation is SnapPy\'s m004, with its face pairs and edge classes', () => {
    const tri = new Triangulation(CENSUS.find((e) => e.id === '4_1'));
    const model = foldModel(FOLD['4_1'], tri);
    assert.equal(model.MT.tets.length, 2);
    assert.equal(model.isos.length, 8);                       // the symmetries of m004
    assert.equal(model.isos.filter((i) => i.orientation === 1).length, 4);
    for (const iso of model.isos) {
        const dict = dictionary(model, tri, iso);
        assert.deepEqual([...dict.regionPair.values()].sort(), [0, 1, 2, 3]);
        const bigons = model.D.faces.filter((F) => F.bigon);
        assert.notEqual(dict.arc[bigons[0].corners[0]].cls, dict.arc[bigons[1].corners[0]].cls);
    }
});

test('5₂: four positively oriented tetrahedra, its twist region of three crossings coned correctly', () => {
    const fold = FOLD['5_2'];
    const tri = new Triangulation(CENSUS.find((e) => e.id === '5_2'));
    const model = foldModel(fold, tri);
    assert.equal(model.MT.tets.length, 4);
    assert.ok(fold.shapes.every(([, im]) => im > 0));
    assert.deepEqual(twistRegions(model.D).cls.reduce((m, c) => { m[c] = (m[c] || 0) + 1; return m; }, []).sort(), [2, 3]);
});
