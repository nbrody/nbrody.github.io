// Run from the discretenessAlgorithm directory (Node 22+):
//   node --test --import ./tests/register.mjs 'tests/*.test.mjs'
// Uses poincare's and trees' modules in place, as the page does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../../../Algebraic/Tools/numberRings/ringEngine.js');
const { buildGroup } = await import('../../Kleinian/poincare/js/matrixInput.js');
const { exampleLibrary } = await import('../../Kleinian/poincare/js/groupLibrary.js');
const { GlobalField, Place } = await import('../../padicGroups/trees/js/localField.js');
const { decide, serializeDecision } = await import('../../padicGroups/trees/js/discreteness.js');
const { fieldModel, poincareStateFor, integralize, normQ, polyInW } = await import('../js/field.js');
const { archCertificate } = await import('../js/certificates.js');
const { runFinite } = await import('../js/finite.js');
const { CURATED } = await import('../js/examples.js');
const { Frac } = await import('../../Kleinian/poincare/js/exact.js');

const deps = { NR: globalThis.NumberRingEngine, GlobalField, Place, decide, serializeDecision };
const read = (g) => buildGroup({ mats: g.mats, anti: g.anti || [], consts: g.consts || [] }).exactCtx;
const curated = (prefix) => CURATED.find((e) => e.name.startsWith(prefix));
const preset = (name) => {
    const ex = exampleLibrary.find((e) => e.name === name);
    return { ...ex, consts: [...(ex.name === 'Hecke group' ? [['n', '5']] : []), ...(ex.consts || [])] };
};

/** The certificate at every place at ∞, keyed 'inf1', … ('inf1' is the user's embedding). */
function archCerts(g) {
    const ctx = read(g);
    const m = fieldModel(ctx);
    const out = {};
    for (const a of m.arch) {
        const st = a.isDefault ? g : poincareStateFor(m, a.root);
        out[a.key] = { kind: a.kind, cert: archCertificate(read(st)) };
    }
    return { m, out };
}

function finite(g) {
    const m = fieldModel(read(g));
    const msgs = [];
    runFinite(deps, {
        poly: m.degree > 1 ? m.polySrc : null, mats: m.mats.map((r) => r.map((e) => e.src)),
        numbers: m.numbers, seconds: 10,
    }, (x) => msgs.push(x));
    return { m, generic: msgs.find((x) => x.type === 'generic'), places: msgs.filter((x) => x.type === 'place') };
}

test('integral monic polynomial of a scaled primitive element', () => {
    // θ = √2/3: x² − 2/9 → w = 3θ, w² − 2
    const { D, poly } = integralize([new Frac(-2n, 9n), new Frac(0n), new Frac(1n)]);
    assert.equal(D, 3n);
    assert.deepEqual(poly, [-2n, 0n, 1n]);
    // x³ + x/2 + 1/4: D = 2 → w³ + 2w + 2
    const r = integralize([new Frac(1n, 4n), new Frac(1n, 2n), new Frac(0n), new Frac(1n)]);
    assert.equal(r.D, 2n);
    assert.deepEqual(r.poly, [2n, 2n, 0n, 1n]);
});

test('norms and formatting in ℚ(w)', () => {
    const f = [1n, 0n, 1n];                                       // w² + 1
    assert.equal(normQ([new Frac(2n), new Frac(1n)], f).toString(), '5');      // N(2 + i) = 5
    assert.equal(polyInW([new Frac(1n), new Frac(-3n), new Frac(1n, 2n)], 'tex'), '\\frac{1}{2}w^{2} - 3w + 1');
    assert.equal(polyInW([new Frac(1n), new Frac(-3n), new Frac(1n, 2n)], 'src'), '1/2*w^2-3*w+1');
});

test('the field of definition is as small as PGL₂ allows', () => {
    // (2,3,7): entries in a degree-12 tower, defined over a sextic
    const t237 = fieldModel(read(preset('(2,3,7) triangle group (cocompact Fuchsian)')));
    assert.equal(t237.degree, 6);
    assert.deepEqual(t237.signature, [2, 2]);
    // Dense circles: degree 4 → ℚ(i)
    const dc = fieldModel(read(preset('Dense circles')));
    assert.equal(dc.degree, 2);
    assert.equal(dc.polySrc, 'w^2+1');
    // √2·(rational matrix) is projectively rational
    const q = fieldModel(read({ mats: [['\\sqrt{2}', '0', '0', '2\\sqrt{2}'], ['1', '1', '0', '1']] }));
    assert.equal(q.degree, 1);
    // ℚ(i) is written with w² + 1, from the tower's own i, and the given entries are kept
    const g = fieldModel(read(curated('ℚ(i): Schottky')));
    assert.equal(g.polySrc, 'w^2+1');
    assert.equal(g.mats[0][0].src, '24*w-7');
});

test('places at ∞: the user embedding comes first, conjugate pairs once', () => {
    const hecke = fieldModel(read(preset('Hecke group')));
    assert.deepEqual(hecke.signature, [2, 0]);
    assert.ok(hecke.arch[0].isDefault);
    assert.ok(Math.abs(hecke.arch[0].root.re - 1.618034) < 1e-5);
    const weeks = fieldModel(read(preset('Weeks manifold (closed)')));
    assert.deepEqual(weeks.signature, [0, 3]);
    assert.equal(weeks.arch.length, 3);
});

test('certificates at ∞ never contradict a certified domain', () => {
    // The user's embedding of these presets is discrete (poincare certifies them).
    for (const name of ['Figure eight knot group', 'Weeks manifold (closed)', 'Meyerhoff manifold (closed)',
        'Borromean rings group', 'PSL(2,Z[w])', 'Hecke group', 'Modular group', 'P(2/5)']) {
        const { out } = archCerts(preset(name));
        assert.equal(out.inf1.cert.nondiscrete, false, `${name}: false certificate at the user's embedding`);
    }
});

test('certificates at ∞: Galois conjugates', () => {
    // G₅ at n ↦ −1/φ: an elliptic of infinite order
    const h = archCerts(curated('Hecke group G₅'));
    assert.equal(h.out.inf1.cert.nondiscrete, false);
    assert.equal(h.out.inf2.cert.nondiscrete, true);
    assert.equal(h.out.inf2.cert.kind, 'elliptic');
    // Sanov over ℚ(√2): at x ↦ 1 − √2 only (there g₁g₂ has trace 2 + 2x ≈ 1.17)
    const s = archCerts(curated('Sanov subgroup'));
    const bad = Object.values(s.out).filter((x) => x.cert.nondiscrete);
    assert.equal(bad.length, 1);
    assert.equal(s.out.inf1.cert.nondiscrete, false);
    // (2,3,7): compact at the complex places
    const t = archCerts(preset('(2,3,7) triangle group (cocompact Fuchsian)'));
    for (const x of Object.values(t.out)) assert.equal(x.cert.nondiscrete, x.kind === 'complex');
    // trace 3/2: an irrational rotation
    const e = archCerts(curated('An elliptic of infinite order'));
    assert.equal(e.out.inf1.cert.kind, 'elliptic');
    // the S-arithmetic group: dense at ∞ (e.g. (½ −1; 1 0) has trace ½, an irrational rotation)
    const sa = archCerts(curated('An S-arithmetic group'));
    assert.equal(sa.out.inf1.cert.nondiscrete, true);
    // Shimizu: ⟨z ↦ z + 1, z ↦ z/(cz + 1)⟩ with c = i/2. Words of length ≤ 2 hold no elliptic
    // (the commutator, of trace 2 + c² = 7/4, has length 4), so Shimizu's lemma is what decides.
    const sh = archCertificate(read({ mats: [['1', '1', '0', '1'], ['1', '0', '\\frac{i}{2}', '1']] }), { maxLen: 2 });
    assert.equal(sh.kind, 'shimizu');
    assert.ok(Math.abs(sh.value - 0.25) < 1e-12);
});

test('finite places: bounded everywhere for PSL₂(ℤ), and infinite', () => {
    const r = finite(curated('Modular group'));
    assert.equal(r.places.length, 0);
    assert.equal(r.generic.decision.verdict, 'nondiscrete');
    assert.equal(r.generic.decision.kind, 'bounded-infinite');
});

test('finite places: Schottky at exactly one prime above 5 in ℚ(i)', () => {
    const r = finite(curated('ℚ(i): Schottky'));
    const at5 = r.places.filter((x) => x.p === '5');
    assert.equal(at5.length, 2);
    const decided = at5.filter((x) => x.status === 'decided');
    assert.equal(decided.length, 1);
    assert.equal(decided[0].decision.verdict, 'discrete');
    assert.equal(decided[0].primeOf, 'w+2');
    assert.equal(at5.find((x) => x.status === 'standard').primeOf, 'w-2');
});

test('finite places: ℚ₂ Schottky of rank 3, the 3-adic pair, and discreteness nowhere', () => {
    const s = finite(curated('A 2-adic Schottky'));
    const two = s.places.find((x) => x.p === '2');
    assert.equal(two.decision.verdict, 'discrete');
    assert.equal(two.decision.freeRank, 3);
    const c = finite(curated('A 3-adic Schottky'));
    assert.equal(c.places.find((x) => x.p === '3').decision.verdict, 'discrete');
    const n = finite(curated('An elliptic of infinite order'));
    assert.equal(n.places.find((x) => x.p === '2').decision.verdict, 'nondiscrete');
    assert.equal(n.generic.decision.verdict, 'nondiscrete');
});

test('a finite group is reported finite at the generic prime', () => {
    // S₃ = ⟨x ↦ 1/(1−x), x ↦ 1/x⟩
    const r = finite({ mats: [['0', '-1', '1', '-1'], ['0', '1', '1', '0']] });
    assert.equal(r.generic.decision.verdict, 'discrete');
    assert.equal(r.generic.decision.kind, 'finite');
    assert.equal(r.generic.decision.order, 6);
});

test('every curated example reads exactly', () => {
    for (const ex of CURATED) {
        const ctx = read(ex);
        assert.ok(ctx, `${ex.name} is not exact`);
        assert.ok(fieldModel(ctx).arch.length >= 1);
    }
});
