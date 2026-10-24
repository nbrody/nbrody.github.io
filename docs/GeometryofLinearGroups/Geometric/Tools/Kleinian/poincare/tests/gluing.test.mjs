// The gluing walk behind the edge / vertex highlights (js/gluing.js): edge
// classes must be the certificate's edge cycles, flips must be detected,
// vertex classes must give the right stabilizer orders, and in a Ford domain
// the classes must still partition the edges.
//
//   node --test --import ./tests/register.mjs tests/gluing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const { Matrix2x2: M } = await import('../js/math.js');
const { serializeTowerContext } = await import('../js/tower.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');
const { runCompute, matToArr } = await import('../js/compute.js');
const { deserializeDomain } = await import('../js/domain.js');
const G = await import('../js/gluing.js');

function computePreset(name, ford = null) {
    const ex = exampleLibrary.find(e => e.name === name);
    assert.ok(ex, name);
    const { matrices, exactCtx } = buildGroup({ mats: ex.mats, anti: ex.anti || [], consts: ex.consts || [] });
    const input = {
        gens: matrices.map(matToArr), origGens: matrices.map(matToArr),
        B: matToArr(M.identity()), maxFaces: 96, maxDepth: ex.depth || 8, fullDirichlet: false,
        exact: exactCtx ? serializeTowerContext(exactCtx) : null, ford,
    };
    const out = runCompute(JSON.parse(JSON.stringify(input)));
    return { out, H: deserializeDomain(out.domain), F: out.ford && out.ford.domain ? deserializeDomain(out.ford.domain) : null };
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

test('edge classes are the certificate\'s edge cycles', () => {
    for (const name of ['Jorgensen fibered (n=2)', 'Weeks manifold (closed)', 'PSL(2,Z[w])', 'Right-angled dodecahedron (12 mirrors)']) {
        const { out, H } = computePreset(name);
        assert.equal(out.report.status, 'verified', name);
        for (const c of out.report.edgeCycles) {
            for (const id of c.edges) {
                const cls = G.edgeClass(H, id).map(x => x.id);
                assert.ok(sameSet(cls, c.edges), `${name}: edge ${id} → [${cls}] vs cycle [${c.edges}]`);
            }
        }
    }
});

test('a cycle that flips its edge has direction 0; the others carry a direction', () => {
    const { out, H } = computePreset('Jorgensen fibered (n=2)');
    for (const c of out.report.edgeCycles) {
        const cls = G.edgeClass(H, c.edges[0]);
        // A flip traverses each edge from both sides: twice as many steps as edges.
        const flipped = c.pairs.length === 2 * c.edges.length;
        assert.equal(cls.every(x => x.dir === 0), flipped, `cycle [${c.edges}]`);
        if (!flipped) assert.ok(cls.every(x => x.dir === 1 || x.dir === -1));
    }
});

test('carried reference points sit at the same distance along every edge of a cycle', () => {
    const { out, H } = computePreset('Weeks manifold (closed)');
    for (const c of out.report.edgeCycles) {
        const cls = G.edgeClass(H, c.edges[0]);
        const spans = cls.map(x => {
            const { s } = G.edgeFlowSamples(H.poly.edges[x.id], x.ref, x.dir, 32);
            return [Math.min(...s), Math.max(...s)];
        });
        // Glued edges are isometric and the pulse coordinate is carried along:
        // the same range of s on each.
        for (const [lo, hi] of spans) {
            assert.ok(Math.abs(lo - spans[0][0]) < 1e-6 && Math.abs(hi - spans[0][1]) < 1e-6, `cycle [${c.edges}]: ${lo}..${hi} vs ${spans[0]}`);
        }
    }
});

test('vertex classes give the vertex stabilizer orders', () => {
    const orders = (name) => {
        const { H } = computePreset(name);
        const seen = new Set(), out = [];
        H.poly.vertices.forEach((v, i) => {
            if (v.ideal || seen.has(i)) return;
            const cls = G.vertexClass(H, i);
            cls.forEach(u => seen.add(u));
            out.push(G.vertexStabilizer(H, cls).order);
        });
        return out.sort((a, b) => a - b);
    };
    // A closed manifold: every vertex class is a free orbit.
    assert.ok(orders('Weeks manifold (closed)').every(k => k === 1));
    // Right angles at the dodecahedron's 20 corners: (ℤ/2)³ each.
    assert.deepEqual(orders('Right-angled dodecahedron (12 mirrors)'), Array(20).fill(8));
    // The Bianchi orbifold PSL(2,ℤ[ω]): finite vertices with A₄ and S₃ stabilizers.
    assert.deepEqual(orders('PSL(2,Z[w])'), [1, 6, 12, 12]);
});

test('Ford domain: edge and vertex classes partition the skeleton', () => {
    const { F } = computePreset('Figure eight knot group', { cusp: 0 });
    assert.ok(F);
    const edgeSets = F.poly.edges.map(e => G.edgeClass(F, e.id, { ford: true }).map(x => x.id).sort((a, b) => a - b).join(','));
    edgeSets.forEach((s, i) => {
        for (const j of s.split(',').map(Number)) assert.equal(edgeSets[j], s, `edge ${i} and ${j}`);
    });
    assert.ok(edgeSets.some(s => s.includes(',')), 'some edges are glued');
    const vSets = F.poly.vertices.map((v, i) => (v.ideal ? null : G.vertexClass(F, i, { ford: true }).sort((a, b) => a - b).join(',')));
    vSets.forEach((s, i) => {
        if (s) for (const j of s.split(',').map(Number)) assert.equal(vSets[j], s, `vertex ${i} and ${j}`);
    });
});

test('unwrapping: the cells around an edge close up after (cycle length × m) steps, a full turn', () => {
    for (const name of ['Jorgensen fibered (n=2)', 'PSL(2,Z[w])', 'Right-angled dodecahedron (12 mirrors)', 'SO₃(Z[2<sup>1/3</sup>])']) {
        const { out, H } = computePreset(name);
        for (const c of out.report.edgeCycles) {
            const r = G.edgeTiles(H, c.edges[0]);
            assert.ok(r.closed, `${name}: walk round [${c.edges}] closes`);
            assert.equal(r.tiles.length, c.pairs.length * c.m, `${name}: cells round [${c.edges}]`);
            assert.ok(Math.abs(r.angle - 2 * Math.PI) < 1e-6, `${name}: angles round [${c.edges}] add up to ${r.angle}`);
            // Every cell holds the start edge: T carries its local edge onto it.
            for (const t of r.tiles) assert.ok(c.edges.includes(t.edge));
        }
    }
});

test('unwrapping: the cells at a vertex number (cycle size × stabilizer order)', () => {
    for (const name of ['Weeks manifold (closed)', 'Right-angled dodecahedron (12 mirrors)', 'PSL(2,Z[w])']) {
        const { H } = computePreset(name);
        H.poly.vertices.forEach((v, i) => {
            if (v.ideal) return;
            const cls = G.vertexClass(H, i);
            const r = G.vertexTiles(H, i);
            assert.ok(r.complete, `${name}: vertex ${i}`);
            assert.equal(r.tiles.length, cls.length * G.vertexStabilizer(H, cls).order, `${name}: cells at vertex ${i}`);
        });
    }
});

test('unwrapping in a Ford domain: genuine edges close up, chimney-cut ones do not', () => {
    const { F } = computePreset('Figure eight knot group', { cusp: 0 });
    let closed = 0, cut = 0;
    for (const e of F.poly.edges) {
        const r = G.edgeTiles(F, e.id, { ford: true });
        if (r.closed) { closed++; assert.ok(Math.abs(r.angle - 2 * Math.PI) < 1e-6); } else cut++;
    }
    assert.ok(closed > 0 && cut > 0, `${closed} closed, ${cut} cut`);
});

test('angles read as fractions of π', async () => {
    const { piText, angleText } = await import('../js/format.js');
    assert.equal(piText(4 / 4), 'π');
    assert.equal(piText(2 / 1), '2π');
    assert.equal(piText(4 / 8), 'π/2');
    assert.equal(piText(4 / 6), '2π/3');
    assert.equal(piText(4 / 1), '4π');
    assert.equal(piText(0.538), null);
    assert.deepEqual(angleText(Math.PI / 2), { main: 'π/2', sub: '90°', exact: true });
    assert.equal(angleText(1.69).exact, false);
});
