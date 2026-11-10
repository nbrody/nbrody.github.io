// Face colors (js/faceColoring.js): faces glued by a pairing share one color,
// and faces that touch get colors far apart. Checked on every preset's
// Dirichlet domain and on Delaunay domains (3D and in the plane) against the
// old rule (class k takes palette color k), and the search against brute
// force on small graphs.
//
//   node --test --import ./tests/register.mjs tests/faceColoring.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const THREE = await import('three');
const { Matrix2x2: M } = await import('../js/math.js');
const { serializeTowerContext } = await import('../js/tower.js');
const { buildGroup } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');
const { runCompute, matToArr, arrToMat } = await import('../js/compute.js');
const { buildPolyhedron } = await import('../js/polyhedron.js');
const { isRealGroup } = await import('../js/planar.js');
const { computeDelaunayDomain, planarHome } = await import('../js/delaunay.js');
const { discreteClassColor, discretePool, rgbToOklab } = await import('../js/paletteColors.js');
const FC = await import('../js/faceColoring.js');

const HIROSHIGE = ['#a2d2d6', '#e88542', '#376794', '#f5a03e', '#6eb5cd', '#ffd88e', '#e65a4c', '#ffc335'];

const pool = (colors) => (k) => discretePool(colors, k);

const preset = (ex) => {
    const consts = [...(ex.name === 'Hecke group' ? [['n', '5']] : []), ...(ex.consts || [])];
    return { ...buildGroup({ mats: ex.mats, anti: ex.anti || [], consts }), depth: ex.depth || 8 };
};

function dirichlet({ matrices, exactCtx, depth = 8 }) {
    const out = runCompute(JSON.parse(JSON.stringify({
        gens: matrices.map(matToArr), origGens: matrices.map(matToArr), B: matToArr(M.identity()), maxFaces: 96, maxDepth: depth,
        fullDirichlet: false, exact: exactCtx ? serializeTowerContext(exactCtx) : null,
    })));
    const walls = out.domain.walls.map(w => ({
        cov: new THREE.Vector4(...w.cov), elem: arrToMat(w.elem), word: w.word,
        pairing: w.pairing ? { alg: arrToMat(w.pairing.alg), word: w.pairing.word, partner: w.pairing.partner } : null
    }));
    return { out, gens: matrices, home: { walls, poly: buildPolyhedron(walls), conePoint: new THREE.Vector3(...out.domain.conePoint), stabilizer: out.domain.stabilizer } };
}

const partnerOf = (walls) => walls.map(w => (w.pairing ? w.pairing.partner : -1));

/** Old rule: class k → palette color k (then lighter, darker…). */
const oldColors = (classes) => classes.map(c => discreteClassColor(HIROSHIGE, c));

const domains = [];
for (const ex of exampleLibrary) {
    let d;
    try { d = dirichlet(preset(ex)); } catch (e) { continue; }
    if (!d.out.domain || !d.out.domain.walls.length) continue;
    domains.push({ name: ex.name, ...d });
}

test('paired faces share a color, and the result never varies', () => {
    for (const { name, home } of domains) {
        const partner = partnerOf(home.walls);
        const contacts = FC.polyhedronContacts(home.poly);
        const a = FC.colorClasses(partner, contacts, pool(HIROSHIGE));
        const b = FC.colorClasses(partner, contacts, pool(HIROSHIGE));
        assert.deepEqual(a.colors, b.colors, name);
        partner.forEach((j, i) => { if (j >= 0) assert.deepEqual(a.colors[i], a.colors[j], `${name}: face ${i} and its partner ${j}`); });
        // Different classes never share a color while the pool has room.
        const seen = new Map();
        a.classes.forEach((c, i) => {
            const key = a.colors[i].map(x => x.toFixed(4)).join();
            if (seen.has(key)) assert.equal(seen.get(key), c, `${name}: two classes share a color`);
            seen.set(key, c);
        });
    }
});

test('faces that touch are further apart than under the old rule', () => {
    let better = 0, worse = 0;
    const rows = [];
    for (const { name, home } of domains) {
        const partner = partnerOf(home.walls);
        const contacts = FC.polyhedronContacts(home.poly);
        const { classes, colors, count } = FC.colorClasses(partner, contacts, pool(HIROSHIGE));
        const now = FC.separation(colors, classes, contacts).touching, then = FC.separation(oldColors(classes), classes, contacts).touching;
        if (!Number.isFinite(now)) continue;          // no two classes touch
        rows.push(`${name}: ${count} classes, nearest neighbors ${then.toFixed(3)} → ${now.toFixed(3)}`);
        if (now > then + 1e-9) better++;
        if (now < then - 1e-9) worse++;
        // With in-between hues to draw on, neighbors stay well apart even past 8 classes.
        assert.ok(now >= 0.06, `${name}: touching faces only ${now.toFixed(3)} apart`);
    }
    assert.ok(better > 3 * worse, `better on ${better} presets, worse on ${worse}\n${rows.join('\n')}`);
});

test('a plane polygon\'s cusps count as corners', () => {
    const ex = exampleLibrary.find(e => e.name === 'PSL(2,ℤ)' || e.name === 'Modular group');
    if (!ex) return;
    const { home } = dirichlet(preset(ex));
    const contacts = FC.polyhedronContacts(home.poly);
    assert.ok(contacts.some(([, , w]) => w > 0.5 && w < 1), 'no tangency found at the cusp');
});

test('Delaunay sides that touch are found and kept apart', () => {
    let checked = 0;
    for (const { name, home, gens } of domains.slice(0, 40)) {
        if (!home.walls.length) continue;
        const dim = isRealGroup(gens) ? 2 : 3;
        let R;
        try {
            if (dim === 3) R = computeDelaunayDomain(home, { dim });
            else { const ph = planarHome(home, gens, {}); R = computeDelaunayDomain(ph.home, { dim, frame: ph.frame }); }
        } catch (e) { continue; }
        if (!R.ok) continue;
        const partner = R.sides.map((S, si) => { const P = R.pairs[S.pair]; return P.minus === si ? P.plus : P.minus; });
        const contacts = FC.delaunayContacts(R);
        // Every side of a closed surface or polyhedron touches another along an edge.
        if (R.sides.length > 1) assert.ok(contacts.some(([, , w]) => w === 1), `${name}: no touching sides`);
        const { classes, colors } = FC.colorClasses(partner, contacts, pool(HIROSHIGE));
        partner.forEach((j, i) => assert.deepEqual(colors[i], colors[j], `${name}: side ${i} and its partner`));
        const now = FC.separation(colors, classes, contacts).touching;
        if (Number.isFinite(now)) assert.ok(now >= 0.06, `${name} (Delaunay): touching sides only ${now.toFixed(3)} apart`);
        checked++;
    }
    assert.ok(checked >= 5, `only ${checked} Delaunay domains checked`);
});

test('the search finds the best colors on small graphs', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const P0 = pool(HIROSHIGE);
    for (let trial = 0; trial < 24; trial++) {
        const k = 3 + (trial % 3);
        const W = new Float64Array(k * k);
        for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (rnd() < 0.6) W[a * k + b] = W[b * k + a] = 1 + Math.floor(rnd() * 2);
        const P = P0(k), m = P.length, lab = P.map(p => rgbToOklab(p.rgb));
        const J = (col) => {
            let s = 0;
            for (let a = 0; a < k; a++) {
                s += P[col[a]].cost;
                for (let b = a + 1; b < k; b++) {
                    const x = lab[col[a]], y = lab[col[b]], dL = x[0] - y[0], da = x[1] - y[1], db = x[2] - y[2];
                    s += 0.35 * Math.exp(-(dL * dL + da * da + db * db) / 0.0036) + W[a * k + b] * Math.exp(-((0.5 * dL) ** 2 + da * da + db * db) / 0.0121);
                }
            }
            return s;
        };
        let best = Infinity;
        const col = [], used = new Array(m).fill(false);
        (function rec(a) {
            if (a === k) { best = Math.min(best, J(col)); return; }
            for (let c = 0; c < m; c++) if (!used[c]) { used[c] = true; col[a] = c; rec(a + 1); used[c] = false; }
        })(0);
        const found = J(FC.assignColors(k, W, P));
        assert.ok(found <= best + 1e-9, `trial ${trial}: ${found} vs the best ${best}`);
    }
});
