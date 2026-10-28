// node --test tests/graphOfGroups.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationReport, presentationOverQ } from '../js/sarithPresentation.js';

const rows = (k) => k.split('|').map((m) => m.split(','));
const graph = (k, S) => presentationReport(rows(k), S, { maxIndex: 20000, seconds: 10 }).graph;

test('⟨T, S, diag(2, 1)⟩: PSL₂(ℤ) amalgamated with ⟨Γ₀(2), σ⟩, σ = (0 1; −2 0)', () => {
    const G = graph('1,1,0,1|0,-1,1,0|2,0,0,1', ['2']);
    assert.equal(G.tree.vertices.length, 1);
    assert.equal(G.tree.vertices[0].index, 2);
    assert.deepEqual(G.tree.edges.map((e) => e.kind), ['inversion']);
    const s = G.gens.find((g) => g.kind === 'inversion');
    assert.deepEqual(s.M, ['0', '1', '-2', '0']);
    assert.ok(G.gens.every((g) => g.word));
});

test('⟨T, S, diag(25, 1)⟩: an amalgam of two conjugates of PSL₂(ℤ) along Γ₀(5)', () => {
    const G = graph('1,1,0,1|0,-1,1,0|25,0,0,1', ['5']);
    assert.equal(G.tree.vertices.length, 2);
    assert.deepEqual(G.tree.edges.map((e) => e.kind), ['tree']);
    assert.deepEqual(G.tree.vertices[1].h, ['0', '1', '5', '0']);
    assert.equal(G.given.length, 3);
});

test('S = {2, 3}: the vertex groups decompose again along 2', () => {
    const G = graph('1,1,0,1|0,-1,1,0|2,0,0,1|3,0,0,1', ['2', '3']);
    assert.equal(G.tree.prime, '3');
    assert.equal(G.tree.vertices[0].sub.leaf, false);
    assert.equal(G.tree.vertices[0].sub.prime, '2');
    assert.equal(G.gens.filter((g) => g.kind === 'inversion').length, 2);
});

test('a congruence subgroup: ⟨(1 2; 0 1), (1 0; 2 1), diag(3, 1)⟩ (index 12, free vertex group)', () => {
    const G = graph('1,2,0,1|1,0,2,1|3,0,0,1', ['3']);
    assert.equal(G.tree.vertices[0].index, 12);
    assert.deepEqual(G.tree.vertices[0].sub.gens.length, 2);
});

// ── independent checks: every relator and every word multiplied out here ──

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const Q = {
    mul: (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]],
    adj: (A) => [A[3], -A[1], -A[2], A[0]],
    one: [1n, 0n, 0n, 1n],
    prim: (A) => { const g = A.reduce((s, x) => bgcd(s, x), 0n); return g > 1n ? A.map((x) => x / g) : A; },
    isScalar: (A) => A[1] === 0n && A[2] === 0n && A[0] === A[3],
    projEq: (A, B) => { for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (A[a] * B[b] !== A[b] * B[a]) return false; return true; },
};
/** the given generators as primitive integer matrices */
const givenQ = (k) => rows(k).map((r) => {
    const q = r.map((e) => e.split('/').map(BigInt)), L = q.reduce((l, [, d = 1n]) => (l / bgcd(l, d)) * d, 1n);
    return Q.prim(q.map(([n, d = 1n]) => n * (L / d)));
});
function checkGraph(G, given, A, matOf) {
    const ev = (w, mats) => w.reduce((M, x) => A.prim(A.mul(M, x > 0 ? mats[x - 1] : A.adj(mats[-x - 1]))), A.one);
    const nice = G.gens.map((g) => matOf(g.M));
    for (const r of G.relators) assert.ok(A.isScalar(ev(r, nice)), `relator ${r}`);
    G.gens.forEach((g, k) => {
        assert.ok(g.word, `${g.name} has a word in g₁, g₂, …`);
        assert.ok(A.projEq(ev(g.word, given), nice[k]), `${g.name} = its word`);
    });
    G.given.forEach((w, i) => assert.ok(A.projEq(ev(w, nice), given[i]), `g${i + 1} = its Bass–Serre word`));
}
const qGraph = (k, S) => {
    const R = presentationReport(rows(k), S, { maxIndex: 20000, seconds: 10 });
    assert.ok(R.graph && !R.graph.error, R.graph && R.graph.error);
    checkGraph(R.graph, givenQ(k), Q, (M) => M.map(BigInt));
    return R;
};

test('odd valuations: ⟨T, (0 1; 3 0), D₂⟩ is K = Γ ∩ PGL₂(ℤ[1/2]) and one coset representative u', () => {
    const R = qGraph('1,1,0,1|0,1,3,0|2,0,0,1', ['2']);
    assert.equal(R.pres.kernelIndex, 2);
    const G = R.graph;
    assert.deepEqual(G.hall, { count: 1, kernelIndex: 2 });
    const u = G.gens.filter((g) => g.kind === 'coset');
    assert.deepEqual(u.map((g) => [g.name, g.word]), [['u', [2]]]);
    assert.deepEqual(G.given[1], [G.gens.indexOf(u[0]) + 1]);
    assert.deepEqual(G.tree.edges.map((e) => e.kind), ['inversion']);
});

test('odd valuations at 3 and 5: Γ₀(15) over ℤ[1/2] with both Atkin–Lehner involutions, Γ/K = (ℤ/2)²', () => {
    const G = qGraph('1,1,0,1|1,0,15,1|2,0,0,1|3,1,15,6|5,1,45,10', ['2']).graph;
    assert.deepEqual(G.hall, { count: 2, kernelIndex: 4 });
    assert.deepEqual(G.gens.filter((g) => g.kind === 'coset').map((g) => g.name), ['u_{1}', 'u_{2}']);
    assert.equal(G.tree.index, 48);
});

test('odd valuations with S = {2, 3}: the nested graph of groups of K, and u', () => {
    const G = qGraph('1,1,0,1|1,0,5,1|2,0,0,1|3,0,0,1|0,-1,5,0', ['2', '3']).graph;
    assert.equal(G.hall.count, 1);
    assert.equal(G.tree.prime, '3');
    assert.equal(G.tree.vertices[0].sub.prime, '2');
    assert.equal(G.gens.filter((g) => g.kind === 'inversion').length, 2);
});

// ── Bianchi rings ──
const { presentationReportBianchi } = await import('../js/bianchiPresentation.js');
const { parseLinear, ringOps, primitiveO } = await import('../js/bianchi.js');
const ent = (s) => { const t = parseLinear(String(s).replace(/−/g, '-')); return [t[0][0], t[1][0]]; };
const ringA = (d) => {
    const R = ringOps.O(d);
    return {
        mul: (A, B) => ringOps.mm(R, A, B), adj: (A) => ringOps.adj(R, A), one: [R.one, R.zero, R.zero, R.one],
        prim: (A) => primitiveO(R, A),
        isScalar: (A) => R.isZero(A[1]) && R.isZero(A[2]) && R.eq(A[0], A[3]),
        projEq: (A, B) => ringOps.projEq(R, A, B),
    };
};
const bGraph = (d, gens, opts = {}) => {
    const mats = gens.split('|').map((g) => g.split(',').map(ent));
    const R = presentationReportBianchi(d, mats, opts);
    assert.ok(R.graph && !R.graph.error, R.graph && R.graph.error);
    checkGraph(R.graph, mats, ringA(d), (M) => M.map(ent));
    return R;
};

test('ℤ[i]: PGL₂(ℤ[i][1/(1+i)]) = PGL₂(ℤ[i]) ∗ ⟨E, σ⟩ on T₃, the vertex group on its letters w, T, E', () => {
    const G = bGraph(1, '0,-1,1,0|1,1,0,1|1,w,0,1|w,0,0,1|1+w,0,0,1').graph;
    assert.equal(G.ring, 1);
    assert.equal(G.tree.valence, 3);
    assert.equal(G.tree.vertices.length, 1);
    assert.deepEqual(G.tree.edges.map((e) => e.kind), ['inversion']);
    assert.deepEqual(G.gens.filter((g) => g.kind === 'vertex').map((g) => g.name), ['w', 'T', 'E']);
});

test('ℤ[i]: ⟨PGL₂(ℤ[i]), diag(2i, 1)⟩ amalgamates two conjugates of PGL₂(ℤ[i]), the second by W_{1+i}', () => {
    const G = bGraph(1, '0,-1,1,0|1,1,0,1|1,w,0,1|w,0,0,1|2w,0,0,1').graph;
    assert.equal(G.tree.vertices.length, 2);
    assert.deepEqual(G.tree.edges.map((e) => e.kind), ['tree']);
    assert.deepEqual(G.tree.vertices[1].h.map((x) => ent(x)), [[0n, 0n], [1n, 0n], [1n, -1n], [0n, 0n]]);
});

test('ℤ[i] at two conjugate primes 1 ± 2i: nested trees T₆', () => {
    const G = bGraph(1, '0,-1,1,0|1,1,0,1|1,w,0,1|w,0,0,1|1+2w,0,0,1|1-2w,0,0,1').graph;
    assert.equal(G.primes.length, 2);
    assert.equal(G.tree.valence, 6);
    assert.equal(G.tree.vertices[0].sub.leaf, false);
    assert.equal(G.tree.vertices[0].sub.valence, 6);
});

test('ℤ[√−2] and ℤ[ω]: index 2 at √−2, and the inert prime 2 of ℤ[ω] (T₅)', () => {
    const G2 = bGraph(2, '1,1,0,1|1,w,0,1|0,-1,1,0|w,0,0,1').graph;
    assert.equal(G2.tree.vertices[0].index, 2);
    const G3 = bGraph(3, '1,1,0,1|1,w,0,1|1,0,2,1|w,0,0,1|2,0,0,1').graph;
    assert.equal(G3.tree.valence, 5);
});

/** every relator of the presentation on the given generators, multiplied out here */
function checkOnGiven(P, given, A) {
    assert.ok(P.onGiven, 'on the given generators');
    const mats = P.gens.map((g) => given[g.given]);
    const ev = (w) => w.reduce((M, x) => A.prim(A.mul(M, x > 0 ? mats[x - 1] : A.adj(mats[-x - 1]))), A.one);
    for (const r of P.relators) assert.ok(A.isScalar(ev(r)), `relator ${r}`);
    P.gamma.forEach((w, i) => assert.ok(A.projEq(ev(w), given[i]), `g${i + 1} = its word`));
}

test('the h’s Tietze leaves get words through the graph of groups: the presentation is on the given generators', () => {
    // over ℤ[1/5]: Reidemeister–Schreier and Tietze keep one Schreier generator …
    const k = '1,1,0,1|0,-1,1,0|25,0,0,1';
    const P0 = presentationOverQ(rows(k), ['5'], { labeled: false });
    assert.equal(P0.onGiven, false);
    // … which the labeled coset enumeration (the modified Todd–Coxeter algorithm) writes in the given ones
    const P1 = presentationOverQ(rows(k), ['5']);
    assert.equal(P1.hFrom, 'labels');
    checkOnGiven(P1, givenQ(k), Q);
    const R = qGraph(k, ['5']);
    assert.ok(R.pres.onGiven);
    checkOnGiven(R.pres, givenQ(k), Q);
    // over ℤ[i]: two of them, through the graph of groups (without labels) or the labels
    const kb = '1,2,0,1|1,2w,0,1|1,0,1+w,1|1+w,0,0,1', given = kb.split('|').map((g) => g.split(',').map(ent));
    const Rg = bGraph(1, kb, { labeled: false });
    assert.equal(Rg.pres.hFrom, 'graph');
    checkOnGiven(Rg.pres, given, ringA(1));
    const Rb = bGraph(1, kb);
    assert.equal(Rb.pres.hFrom, 'labels');
    checkOnGiven(Rb.pres, given, ringA(1));
});

test('FlashBeam over ℚ and over ℤ[i]: words for the generators of the graph of groups, near o, through a pool that keeps what it finds', async () => {
    const { flashWords, rationalWordRing } = await import('../js/wordSearch.js');
    const { bianchiWordRing } = await import('../js/bianchiPresentation.js');
    const k = '1,4,0,1|1,0,4,1|25,0,0,1';
    const gens = givenQ(k);
    const targets = qGraph(k, ['5']).graph.gens.map((g) => g.M.map(BigInt));
    const ev = (u) => u.reduce((M, x) => Q.prim(Q.mul(M, x > 0 ? gens[x - 1] : Q.adj(gens[-x - 1]))), Q.one);
    const w0 = flashWords(gens, targets, rationalWordRing, { seconds: 3 });
    w0.forEach((u, j) => { assert.ok(u, `target ${j} found`); assert.ok(Q.projEq(ev(u), targets[j]), `target ${j}`); });
    // a seed in the pool: the first target, as its word
    const w1 = flashWords(gens, targets, rationalWordRing, { seconds: 3, seeds: [{ M: targets[0], word: w0[0] }] });
    w1.forEach((u, j) => { if (u) assert.ok(Q.projEq(ev(u), targets[j]), `target ${j}`); });
    const A = ringA(1), bk = '1,2,0,1|1,2w,0,1|1,0,1+w,1|1+w,0,0,1';
    const bg = bk.split('|').map((g) => g.split(',').map(ent));
    const bt = bGraph(1, bk).graph.gens.map((g) => g.M.map(ent));
    const wb = flashWords(bg, bt, bianchiWordRing(1), { seconds: 3, beamWidth: 600 });
    const evb = (u) => u.reduce((M, x) => A.prim(A.mul(M, x > 0 ? bg[x - 1] : A.adj(bg[-x - 1]))), A.one);
    wb.forEach((u, j) => { assert.ok(u, `target ${j} found`); assert.ok(A.projEq(evb(u), bt[j]), `target ${j}`); });
});

test('the view: the graph-of-groups section and the top box, over ℚ with u and over ℤ[i]', async () => {
    const { graphSection, graphTop } = await import('../js/sarithView.js');
    const Rq = presentationReport(rows('1,1,0,1|0,1,3,0|2,0,0,1'), ['2'], { maxIndex: 20000, seconds: 10 });
    const hq = graphSection(Rq.graph, Rq.S);
    assert.match(hq, /The extension\./);
    assert.ok(graphTop(Rq.graph).names.includes('u'));
    const mats = '0,-1,1,0|1,1,0,1|1,w,0,1|w,0,0,1|1+w,0,0,1'.split('|').map((g) => g.split(',').map(ent));
    const Rb = presentationReportBianchi(1, mats);
    const hb = graphSection(Rb.graph, Rb.S);
    assert.ok(hb.includes('\\mathbb{Q}(i)_{(1-i)}'));
    assert.ok(hb.includes('0&1\\\\1-i&0'), 'σ = (0 1; 1−i 0), its entries in i');
    const top = graphTop(Rb.graph);
    assert.match(top.source, /T_\{3\}/);
    assert.ok(top.defs.every((t) => !t.includes('?')));
});
