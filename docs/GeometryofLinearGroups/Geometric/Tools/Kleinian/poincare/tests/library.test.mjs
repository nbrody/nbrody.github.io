// Regression suite for the domain engine: every library preset goes through
// runCompute (the Web Worker's entry point) and must reproduce its status,
// face count, volume and H₁; plus unit checks on the polyhedron, the
// presentation tools and the arithmetic invariants.
//
//   node --test --import ./tests/register.mjs tests/library.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// matrixInput.js evaluates entries with the page's global math.js.
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
globalThis.math = require('../../vendor/mathjs/math.min.js');

const { Matrix2x2: M, Complex } = await import('../js/math.js');
const { NumberField, parsePoly, parseKElem, ExactMat, serializeExactContext } = await import('../js/exact.js');
const { latexToExpr, evalComplexExpression } = await import('../js/matrixInput.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');
const { runCompute, matToArr } = await import('../js/compute.js');
const { computeCanonicalDomain } = await import('../js/canonical.js');
const { checkEuler, polyhedronVolume } = await import('../js/polyhedron.js');
const P = await import('../js/presentation.js');

/** Parse a preset exactly as the page does (constants, exact field, embedding). */
function loadPreset(ex) {
    const consts = {};
    if (ex.name === 'Hecke group') consts.n = 5;
    for (const [name, latex] of ex.consts || []) {
        const v = evalComplexExpression(latexToExpr(latex), consts);
        consts[name] = v.im === 0 ? v.re : math.complex(v.re, v.im);
    }
    let field = null;
    const exactGens = [];
    if (ex.exact) {
        const gen = ex.exact.gen || 'w';
        field = new NumberField(parsePoly(ex.exact.minpoly, gen), gen);
        if (ex.exact.root) {
            let best = 0, bd = Infinity;
            field.roots.forEach((r, i) => {
                const d = Math.hypot(r.re - ex.exact.root.re, r.im - ex.exact.root.im);
                if (d < bd) { bd = d; best = i; }
            });
            field.rootIndex = best;
        }
        if (ex.exact.conj) field.setConjugation(ex.exact.conj);
    }
    const mats = ex.mats.map((vals, i) => {
        const anti = !!(ex.anti && ex.anti[i]);
        let z;
        if (field) {
            const K = vals.map(v => parseKElem(latexToExpr(String(v)), field));
            exactGens.push(new ExactMat(...K, anti));
            z = K.map(e => { const v = e.embed(); return new Complex(v.re, v.im); });
        } else {
            z = vals.map(v => evalComplexExpression(latexToExpr(String(v)), consts));
        }
        return new M(...z, anti).normalized();
    });
    return { mats, exactCtx: field ? { field, gens: exactGens } : null };
}

function compute(mats, { exactCtx = null, depth = 8, ford = null } = {}) {
    const input = {
        gens: mats.map(matToArr), origGens: mats.map(matToArr),
        B: matToArr(M.identity()), maxFaces: 96, maxDepth: depth, fullDirichlet: false,
        exact: exactCtx ? serializeExactContext(exactCtx) : null, ford,
    };
    // Through JSON, like the postMessage to the worker.
    return runCompute(JSON.parse(JSON.stringify(input)));
}

// Volumes are SnapPy's (or Humbert's formula for the Bianchi groups); the
// Dirichlet-domain quadrature is good to ~1e-7 relative.
const EXPECT = {
    'Apollonian Gasket': { faces: 11, h1: 'ℤ ⊕ ℤ/2' },
    'quasiSchottky': { faces: 4, h1: 'ℤ²' },
    'Modular group': { faces: 5, h1: 'ℤ/6' },
    'Borromean rings group': { faces: 16, vol: 7.327724753, h1: 'ℤ³', cusps: 3, tf: 'x^2 + 64', arith: true },
    'Index-6 subgroup of PSL(2,Z[i])': { faces: 8, vol: 6 * 0.3053218647, h1: 'ℤ ⊕ ℤ/2 ⊕ ℤ/2', arith: true },
    'Z[i] congruence': { faces: 16, h1: 'ℤ² ⊕ ℤ/2' },
    'Surface group': { faces: 9, h1: 'ℤ²' },
    'Surface group 2': { faces: 7, h1: 'ℤ/2 ⊕ ℤ/2 ⊕ ℤ/2' },
    'Long-Reid Group': { faces: 9, h1: 'ℤ²' },
    'Figure eight knot group': { faces: 12, vol: 2.029883213, h1: 'ℤ', cusps: 1 },
    'Dense circles': { faces: 11, h1: 'ℤ ⊕ ℤ/4' },
    'P(1/3)': { faces: 18, h1: 'ℤ ⊕ ℤ/2' },
    'Riley group (z ≈ 1.529+0.257i)': { faces: 20, h1: 'ℤ ⊕ ℤ/2' },
    'P(2/5)': { faces: 23, h1: 'ℤ ⊕ ℤ/2', tf: 'x^3 − 3x^2 + 5x − 4' },
    'Hecke group': { faces: 5, h1: 'ℤ/10' },
    'PSL(2,Z[w])': { faces: 10, vol: 0.1691569344, h1: 'ℤ/3', tf: 'x^2 + x + 1', arith: true },
    'PSL(2,Z[√-5])': { faces: 33, vol: 4.2039693, h1: 'ℤ² ⊕ ℤ/2 ⊕ ℤ/6', tf: 'x^2 + 8x + 36', arith: true },
    'SO₃(Z[2<sup>1/3</sup>])': { faces: 15, vol: 0.2885349657, h1: 'ℤ/2 ⊕ ℤ/2', tf: 'x^3 − 4', arith: true },
    '(2,3,7) triangle group (cocompact Fuchsian)': { faces: 5, h1: '0' },
    'Weeks manifold (closed)': { faces: 26, vol: 0.9427073628, h1: 'ℤ/5 ⊕ ℤ/5', tf: 'x^3 + x^2 − 1', arith: true },
    'Meyerhoff manifold (closed)': { faces: 24, vol: 0.9813688289, h1: 'ℤ/5' },
    'FLMS': { faces: 28, vol: 1.4236119003, h1: 'ℤ/35', arith: false },
    'Ideal triangle kaleidoscope (3 mirrors)': { faces: 3, h1: 'ℤ/2 ⊕ ℤ/2 ⊕ ℤ/2' },
    'Modular kaleidoscope (2,3,∞ mirrors)': { faces: 3, h1: 'ℤ/2 ⊕ ℤ/2' },
    'Z[i] kaleidoscope (mirror box)': { faces: 5, vol: 0.3053218647 / 2, h1: 'ℤ/2 ⊕ ℤ/2 ⊕ ℤ/2' },
    'Right-angled dodecahedron (12 mirrors)': { faces: 12, vol: 4.3062076007, h1: Array(12).fill('ℤ/2').join(' ⊕ ') },
    'Right-angled dodecahedron (exact, 12 mirrors)': { faces: 12, vol: 4.3062076007, h1: Array(12).fill('ℤ/2').join(' ⊕ ') },
};
// Presets that must NOT verify: a geometrically infinite fiber group (its
// Dirichlet domain has infinitely many faces) and an unidentified example.
const MUST_FAIL = ['Figure eight fiber', 'Jorgensen fibered (n=2)'];

test('every library preset is covered by this suite', () => {
    const names = exampleLibrary.map(e => e.name);
    for (const n of names) assert.ok(n in EXPECT || MUST_FAIL.includes(n), `no expectation for preset “${n}”`);
    for (const n of [...Object.keys(EXPECT), ...MUST_FAIL]) assert.ok(names.includes(n), `stale expectation “${n}”`);
});

for (const ex of exampleLibrary) {
    const want = EXPECT[ex.name];
    if (!want) continue;
    test(`preset: ${ex.name}`, () => {
        const { mats, exactCtx } = loadPreset(ex);
        const out = compute(mats, { exactCtx, depth: ex.depth || 8 });
        const inv = out.invariants;
        assert.equal(out.report.status, 'verified');
        assert.equal(out.domain.walls.length, want.faces);
        assert.ok(out.report.membership.every(m => m.ok), 'every input generator is a product of face pairings');
        assert.ok(inv.presentationComplete);
        assert.equal(inv.h1String, want.h1);
        if (want.vol != null) {
            assert.ok(Math.abs(inv.volume - want.vol) < 2e-6 * Math.max(1, want.vol), `volume ${inv.volume} vs ${want.vol}`);
        } else {
            assert.equal(inv.volume, null, 'infinite volume');
        }
        if (want.cusps != null) assert.equal(out.report.cusps.length, want.cusps);
        if (want.tf) assert.equal(inv.traceField.minpoly, want.tf);
        if (want.arith != null) assert.equal(inv.traceField.arithmetic, want.arith);
    });
}

for (const name of MUST_FAIL) {
    test(`preset does not verify: ${name}`, () => {
        const ex = exampleLibrary.find(e => e.name === name);
        const { mats, exactCtx } = loadPreset(ex);
        const out = compute(mats, { exactCtx, depth: ex.depth || 8 });
        assert.notEqual(out.report.status, 'verified');
        assert.equal(out.invariants.presentationComplete, false);
    });
}

test('Ford domains and horoballs for cusped presets', () => {
    for (const [name, vol, H] of [['Figure eight knot group', 2.029883213, 1], ['PSL(2,Z[w])', 0.1691569344, 1],
                                  ['Borromean rings group', 7.327724753, 0.5]]) {
        const ex = exampleLibrary.find(e => e.name === name);
        const { mats, exactCtx } = loadPreset(ex);
        const out = compute(mats, { exactCtx, ford: { cusp: 0 } });
        assert.ok(!out.ford.error, out.ford.error);
        assert.ok(Math.abs(out.ford.volume - vol) < 2e-6 * vol, `${name}: Ford volume ${out.ford.volume}`);
        assert.ok(Math.abs(out.ford.horoballs.H - H) < 1e-9, `${name}: H = ${out.ford.horoballs.H}`);
        assert.ok(out.ford.horoballs.balls.length > 0);
    }
});

// ---------------- reflections, membership, tangent walls ----------------

const mk = (a, b, c, d, anti = false) => new M(a, b, c, d, anti).normalized();
const T = mk(1, 1, 0, 1), S = mk(0, -1, 1, 0);

test('PGL(2,Z) = ⟨T, S, z ↦ −z̄⟩ is the (2,3,∞) reflection triangle', () => {
    // T's wall is parallel to the mirror Re z = ½ in the upper half-space:
    // the two circles are tangent at ∞, which once left a rounding sliver
    // keeping a redundant, unpaired wall alive.
    const out = compute([T, S, mk(-1, 0, 0, 1, true)]);
    assert.equal(out.report.status, 'verified');
    assert.equal(out.domain.walls.length, 3);
    assert.equal(out.invariants.h1String, 'ℤ/2 ⊕ ℤ/2');
});

test('a generator outside the face-pairing group fails membership until the search reaches it', () => {
    // C is a reflection in PGL(2,Z) whose word in T, S is long.
    const C = mk(-127, 336, -48, 127, true);
    const short = compute([T, S, C], { depth: 8 });
    assert.equal(short.report.status, 'failed');
    assert.deepEqual(short.report.membership.map(m => m.ok), [true, true, false]);
    const long = compute([T, S, C], { depth: 24 });
    assert.equal(long.report.status, 'verified');
    assert.equal(long.domain.walls.length, 3);
});

// ---------------- polyhedron ----------------

test('right-angled dodecahedron: V − E + F = 2, dihedral angles π/2, volume', () => {
    const ex = exampleLibrary.find(e => e.name === 'Right-angled dodecahedron (12 mirrors)');
    const { mats } = loadPreset(ex);
    const gens = mats.flatMap(g => [g, g.inv().normalized()]);
    const D = computeCanonicalDomain(gens, M.identity(), 96, { maxDepth: 8 });
    const euler = checkEuler(D.poly);
    assert.ok(euler.ok, euler.problems.join('; '));
    assert.deepEqual([euler.V, euler.E, euler.F], [20, 30, 12]);
    assert.ok(D.poly.edges.every(e => Math.abs(e.angle - Math.PI / 2) < 1e-8));
    assert.ok(Math.abs(polyhedronVolume(D.poly) - 4.3062076007) < 1e-6);
});

// ---------------- presentations ----------------

test('Tietze simplification and abelianization', () => {
    const rel = (enc, m = 1) => ({ enc, m });
    // Modular group from its Dirichlet domain: ⟨s1,s2,s3 | s1², s2 s3 s1, s3³⟩ ≅ ℤ/2 * ℤ/3.
    const modular = { n: 3, relators: [rel([1], 2), rel([2, 3, 1]), rel([3], 3)] };
    const s = P.simplifyPresentation(modular);
    assert.equal(s.n, 2);
    assert.equal(P.abelianizationString(P.abelianization(modular)), 'ℤ/6');
    assert.equal(P.abelianizationString(P.abelianization({ n: s.n, relators: s.relators })), 'ℤ/6');
    // ℤ² and a free group.
    assert.equal(P.abelianizationString(P.abelianization({ n: 2, relators: [rel([1, 2, -1, -2])] })), 'ℤ²');
    assert.equal(P.abelianizationString(P.abelianization({ n: 2, relators: [] })), 'ℤ²');
    // Words: reductions and a relator's canonical form.
    assert.deepEqual(P.freeReduce([1, 2, -2, -1, 3]), [3]);
    assert.deepEqual(P.cyclicReduce([-1, 2, 3, 1]), [2, 3]);
    const tidy = P.tidyRelators([rel([1, 1, 1]), rel([2, 3, -3, 2]), rel([-1, -1, -1])]);
    assert.deepEqual(tidy.map(r => [r.enc.length, r.m]).sort(), [[1, 2], [1, 3]]);
});

test('presentation in the input generators: the modular group', () => {
    const out = compute([T, S]);
    const u = out.invariants.inUser;
    assert.equal(u.n, 2);
    // ⟨T, S | S², (TS)³ ⟩ up to the choice of relator words: H₁ = ℤ/6.
    const ab = P.abelianization({ n: u.n, relators: u.relators.map(r => ({ enc: r.enc ?? r, m: r.m ?? 1 })) });
    assert.equal(P.abelianizationString(ab), 'ℤ/6');
});
