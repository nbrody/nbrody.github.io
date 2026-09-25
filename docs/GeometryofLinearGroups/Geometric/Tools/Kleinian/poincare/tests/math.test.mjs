import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix2x2 as M, Complex as C, pslKey, getCayleyGraph, applyMatrixToBall } from '../js/math.js';
import { readBoundedInteger } from '../js/controlPanel.js';

const T = new M(1, 1, 0, 1);
const S = new M(0, -1, 1, 0);
const gens = [T, T.inv(), S, S.inv()];
const negative = m => new M(...[m.a,m.b,m.c,m.d].map(z => z.mul(-1)), m.anti);

test('PSL keys identify signs and sub-precision signed zero', () => {
    assert.equal(pslKey(S), pslKey(negative(S)));
    assert.equal(pslKey(new M(1, new C(-1e-7, 1e-7), 0, 1)), pslKey(M.identity()));
    assert.equal(pslKey(new M(new C(-1e-7), -1, 1, 0)), pslKey(S));
    assert.equal(pslKey(new M(new C(1e-7), -1, 1, 0)), pslKey(S));
    assert.notEqual(pslKey(new M(1, 0, 0, 1, true)), pslKey(M.identity()));
    assert.notEqual(pslKey(T), pslKey(M.identity()));
});

test('modular Cayley graph closes relations and honors budgets', () => {
    const graph = getCayleyGraph(gens, 2);
    assert.equal(graph.points.length, 10);
    assert.ok(graph.edges.every(e => e.u < 10 && e.v < 10 && e.u !== e.v));
    assert.equal(getCayleyGraph(gens, 8, M.identity(), 7).points.length, 7);
    assert.equal(getCayleyGraph(gens, 0).points.length, 1);
    assert.deepEqual(getCayleyGraph([], 5), { points: [], edges: [] });
});

test('view changes preserve topology and transform every orbit point', () => {
    const graph = getCayleyGraph(gens, 4);
    for (const view of [new M(1, new C(0.3, 0.2), 0, 1), new M(1, 0, 0, 1, true)]) {
        const moved = getCayleyGraph(gens, 4, view);
        assert.deepEqual(moved.edges, graph.edges);
        graph.points.forEach((p, i) => assert.ok(applyMatrixToBall(view, p).distanceTo(moved.points[i]) < 1e-10));
    }
});

test('cached graph skips enumeration, survives caller mutations, and invalidates changed generators', () => {
    const graph = getCayleyGraph(gens, 5);
    const mul = M.prototype.mul;
    let calls = 0;
    M.prototype.mul = function (m) { calls++; return mul.call(this, m); };
    try {
        const cached = getCayleyGraph(gens, 5, T);
        assert.equal(calls, graph.points.length, 'only project cached matrices');
        cached.edges[0].u = -10;
        cached.points[0].set(5, 5, 5);
        assert.deepEqual(getCayleyGraph(gens, 5).edges, graph.edges);
    } finally { M.prototype.mul = mul; }
    const changed = gens.map(m => new M(m.a, m.b, m.c, m.d, m.anti));
    changed[0].b = new C(2);
    assert.notDeepEqual(getCayleyGraph(changed, 5), graph);
});

test('search inputs clamp finite integer limits and recover from blank/invalid input', () => {
    for (const [value, expected] of [['100000',14], ['-5',1], ['3.8',3], ['',8], ['Infinity',8], ['NaN',8]]) {
        const input = {value, min:'1', max:'14'};
        assert.equal(readBoundedInteger(input, 8), expected);
        assert.equal(input.value, String(expected));
    }
    assert.equal(readBoundedInteger({value:'999',min:'1',max:'256'},96),256);
});

test('canonical domains keep their face pairings for modular and figure-eight groups', async () => {
    const { computeCanonicalDomain } = await import('../js/canonical.js');
    const { certifyDomain } = await import('../js/certifier.js');
    for (const [base, faces, stabilizer] of [
        [[T,S],5,2],
        [[new M(1,new C(-.5,Math.sqrt(3)/2),0,1),new M(1,0,1,1)],12,1]
    ]) {
        const generators = base.flatMap(g => [g,g.inv().normalized()]);
        const domain = computeCanonicalDomain(generators);
        assert.equal(domain.count, faces);
        assert.equal(domain.stabilizer.order, stabilizer);
        assert.equal(domain.walls.filter(w => w.pairing).length, faces);
        assert.ok(domain.walls.every(w => w.cov.toArray().every(Number.isFinite)));
        if (faces === 12) assert.equal(certifyDomain(domain.walls,domain.conePoint).ok, true);
    }
});
