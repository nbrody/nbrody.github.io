// Exact input: the field tower (tower.js), factoring over ℚ (zfactor.js) and
// the reader of constants and entries (expr.js).
//
//   node --test --import ./tests/register.mjs tests/tower.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { Frac } = await import('../js/exact.js');
const { factorQ } = await import('../../../../../assets/js/hyperbolic/zfactor.js');
const { TowerField, cosMinpoly, cyclotomic, serializeTowerContext, deserializeTowerContext } = await import('../js/tower.js');
const { readGroup, numericPolyRoots } = await import('../js/expr.js');
const { exampleLibrary } = await import('../js/groupLibrary.js');

const F = (n, d = 1) => new Frac(BigInt(n), BigInt(d));
const poly = (f) => f.map(String).join(',');
const S = ['0', '-1', '1', '0'];
const near = (z, re, im = 0, tol = 1e-9) => Math.hypot(z.re - re, z.im - im) < tol;

test('factoring over ℚ', () => {
    // x⁴ − 1 = (x − 1)(x + 1)(x² + 1)
    const f = factorQ([F(-1), F(0), F(0), F(0), F(1)]).map(poly).sort();
    assert.deepEqual(f, ['-1,1', '1,0,1', '1,1'].sort());
    // irreducible: x⁴ − 10x² + 1, the minimal polynomial of √2 + √3
    assert.equal(factorQ([F(1), F(0), F(-10), F(0), F(1)]).length, 1);
    // repeated factors are dropped: (x − 1/2)²
    assert.deepEqual(factorQ([F(1, 4), F(-1), F(1)]).map(poly), ['-1/2,1']);
});

test('cyclotomic and cosine minimal polynomials', () => {
    assert.equal(poly(cyclotomic(12)), '1,0,-1,0,1');
    assert.equal(poly(cosMinpoly(5)), '-1/4,1/2,1');              // cos 72° = (√5 − 1)/4
    assert.equal(poly(cosMinpoly(7)), '-1/8,-1/2,1/2,1');         // 8c³ + 4c² − 4c − 1
});

test('adjoinRoot keeps only the irreducible factor through the given root', () => {
    const K = new TowerField();
    const one = K.one(), zero = K.zero();
    const s2 = K.adjoinRoot([K.fromInt(-2), zero, one], { re: 1.414, im: 0 });
    const s3 = K.adjoinRoot([K.fromInt(-3), zero, one], { re: 1.732, im: 0 });
    assert.equal(K.deg, 4);
    // √6 is already in ℚ(√2, √3): no new level
    const s6 = K.adjoinRoot([K.fromInt(-6), zero, one], { re: 2.449, im: 0 });
    assert.equal(K.deg, 4);
    assert.ok(s6.equals(s2.mul(s3)));
    // and the negative root is −√6
    const m6 = K.adjoinRoot([K.fromInt(-6), zero, one], { re: -2.449, im: 0 });
    assert.ok(m6.equals(s2.mul(s3).neg()));
    // inverses are exact
    const x = s2.add(s3).add(one);
    assert.ok(x.mul(x.inv()).equals(one));
});

test('readGroup: exact fields, as small as the input allows', () => {
    const deg = (state) => { const r = readGroup(state); assert.ok(r.exact, r.reason); return r.field.deg; };
    assert.equal(deg({ mats: [['1', '\\frac{-1+\\sqrt{-3}}{2}', '0', '1'], ['1', '0', '1', '1']] }), 2);
    assert.equal(deg({ mats: [['1', '2\\cos(\\frac{\\pi}{n})', '0', '1'], S], consts: [['n', '7']] }), 3);
    assert.equal(deg({ mats: [['1', 'e^{2\\pi i/5}', '0', '1'], S] }), 4);                 // ζ₅ alone, no i
    assert.equal(deg({ mats: [['1', '2\\cos(t)', '0', '1'], S], consts: [['t', '\\frac{\\pi}{5}']] }), 2);
    assert.equal(deg({ mats: [['1', '\\sqrt[3]{-8}+\\frac{3}{4}', '0', '1'], S] }), 1);      // real cube root
    assert.equal(deg({ mats: [['1', '0.31415-0.78426i', '0', '1'], S] }), 2);              // decimals are exact
    // multi-letter constant names, and a root whose polynomial uses an earlier constant
    assert.equal(deg({ mats: [['bb', '0', '0', '1'], S], consts: [['zz', '\\sqrt{2}'], { name: 'bb', poly: 'bb^2-zz\\cdot bb+1', near: { re: 0.7, im: 0.7 } }] }), 4);
});

test('readGroup: a root row picks the root nearest its hint', () => {
    const r = readGroup({ mats: [['1', 'w', '0', '1'], S], consts: [{ name: 'w', poly: 'w^2+w+1', near: { re: -0.5, im: -0.8 } }] });
    assert.ok(r.exact);
    assert.ok(near(r.entries[0][1], -0.5, -Math.sqrt(3) / 2));
    assert.equal(r.roots[0].roots.length, 2);
    assert.ok(near(r.roots[0].roots[r.roots[0].index], -0.5, -Math.sqrt(3) / 2));
});

test('readGroup: transcendental values fall back to floating point, with the reason', () => {
    const r = readGroup({ mats: [['1', '\\cos(1)', '0', '1'], S] });
    assert.equal(r.exact, false);
    assert.match(r.reason, /transcendental/);
    assert.equal(r.reasonWhere, 'g1, entry (1,2)');
    assert.ok(near(r.entries[0][1], Math.cos(1)));
    const p = readGroup({ mats: [['1', '\\pi', '0', '1'], S] });
    assert.equal(p.exact, false);
    // too large a field also falls back
    const big = readGroup({ mats: [['1', '\\sqrt{2}+\\sqrt{3}+\\sqrt{5}+\\sqrt{7}+\\sqrt{11}+\\sqrt{13}', '0', '1'], S] });
    assert.equal(big.exact, false);
    assert.match(big.reason, /degree/);
});

test('readGroup: input errors point at the field', () => {
    assert.throws(() => readGroup({ mats: [['1', 'q', '0', '1'], S] }), (e) => e.where.gen === 0 && e.where.entry === 1 && /unknown symbol q/.test(e.message));
    assert.throws(() => readGroup({ mats: [['1', '1', '0', '1'], S], consts: [['p', '\\frac{1}{0}']] }), (e) => e.where.constant === 0);
    assert.throws(() => readGroup({ mats: [['1', '2', '1', '2'], S] }), (e) => e.where.gen === 0 && /determinant 0/.test(e.message));
});

test('complex conjugation: found inside the field, or adjoined', () => {
    // ℚ(∛2·ω) is not closed under conjugation: σ needs ∛2·ω̄, and K grows to the splitting field.
    const r = readGroup({ mats: [['1', 'b', '0', '1'], S], anti: [true, false], consts: [{ name: 'b', poly: 'b^3-2', near: { re: -0.63, im: 1.09 } }] });
    assert.ok(r.exact);
    assert.equal(r.field.deg, 6);
    const b = r.gens[0].b, sb = b.conj();
    assert.ok(near(sb.embed(), b.embed().re, -b.embed().im));
    assert.ok(sb.conj().equals(b));
    assert.ok(b.mul(sb).add(b.add(sb)).conj().equals(b.mul(sb).add(b.add(sb))));      // real elements are fixed
    // ℚ(√5, √φ, i) is closed: σ fixes √5 and √φ and sends i to −i
    const d = exampleLibrary.find(e => e.name === 'Right-angled dodecahedron (12 mirrors)');
    const rd = readGroup({ mats: d.mats, anti: d.anti, consts: d.consts });
    assert.equal(rd.field.deg, 8);
    // each mirror is an involution: composing it with itself (M·M̄) is the identity
    for (const M of rd.gens) assert.ok(M.mul(M).isProjectiveIdentity());
});

test('serialization round trip (the worker boundary)', () => {
    const r = readGroup({ mats: [['p', 'q', '0', '1'], ['1', 'i', '0', '1']], anti: [true, false], consts: [['p', '\\frac{1+\\sqrt{5}}{2}'], ['q', '\\sqrt{p}']] });
    const data = JSON.parse(JSON.stringify(serializeTowerContext({ field: r.field, gens: r.gens })));
    const back = deserializeTowerContext(data);
    assert.equal(back.field.deg, r.field.deg);
    assert.equal(back.field.describe(), r.field.describe());
    for (let g = 0; g < 2; g++) {
        for (const k of ['a', 'b', 'c', 'd']) {
            assert.deepEqual(back.gens[g][k].c.map(String), r.gens[g][k].c.map(String));
            assert.ok(near(back.gens[g][k].embed(), r.gens[g][k].embed().re, r.gens[g][k].embed().im));
        }
    }
    // products (through σ, since g₁ is a mirror) agree on both sides
    const w1 = r.gens[0].mul(r.gens[1]).mul(r.gens[0].invProj());
    const w2 = back.gens[0].mul(back.gens[1]).mul(back.gens[0].invProj());
    for (const k of ['a', 'b', 'c', 'd']) assert.deepEqual(w2[k].c.map(String), w1[k].c.map(String));
    assert.ok(back.gens[0].b.conj().equals(back.gens[0].b));          // q = √φ is real
});

test('every preset with algebraic entries reads exactly', () => {
    for (const ex of exampleLibrary) {
        const consts = [...(ex.name === 'Hecke group' ? [['n', '5']] : []), ...(ex.consts || [])];
        const r = readGroup({ mats: ex.mats, anti: ex.anti || [], consts });
        assert.ok(r.exact, `${ex.name}: ${r.reason}`);
    }
});

test('legacy minimal-polynomial roots', () => {
    const roots = numericPolyRoots('w^2+w+1', 'w').sort((x, y) => (x.re - y.re) || (x.im - y.im));
    assert.ok(near(roots[1], -0.5, Math.sqrt(3) / 2));
});
