// node --test tests/charSets.test.mjs
// Step 1's table (charSets.js): each generator at each place, and its characteristic set. The
// expected answers are worked out by hand; tree vertices are checked against the action itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.NumberRingEngine = require('../../Algebraic/Tools/numberRings/ringEngine.js');
const { GlobalField, Place } = await import('../../Geometric/Tools/padicGroups/trees/js/localField.js');
const { generatorTable } = await import('../js/charSets.js');
const deps = { GlobalField, Place, NR: globalThis.NumberRingEngine };

const R = { key: 'inf1', kind: 'real', root: { re: 0, im: 0 }, label: '\\mathbb{R}' };
const table = (mats, gens, extra = {}) => generatorTable(deps, {
    poly: null, mats, gens, arch: [R],
    numbers: mats.flatMap((m) => m.map((s) => s.replace(/^-/, '').split('/')[1] || '1')).concat(extra.numbers || []), ...extra,
});
const cell = (T, g, key) => T.rows[g][T.columns.findIndex((c) => c.key === key)];
const text = (c) => c.lines.join(' ');

test('PSL₂(ℤ): S and U are torsion at ℝ, with their fixed points; no prime is unbounded', () => {
    const T = table([['0', '-1', '1', '0'], ['0', '-1', '1', '1']], [{ type: 'elliptic', order: 2 }, { type: 'elliptic', order: 3 }], { numbers: [] });
    assert.deepEqual(T.columns.map((c) => c.kind), ['real']);
    assert.equal(T.rows[0][0].cls, 'torsion');
    assert.match(text(T.rows[0][0]), /rotation by \$\\pi\$ about the point \$z_0 = i\$/);
    assert.equal(T.rows[1][0].cls, 'torsion');
    assert.match(text(T.rows[1][0]), /\\frac\{2\\pi\}\{3\}/);
    assert.match(text(T.rows[1][0]), /-\\tfrac\{1\}\{2\} \+ \\tfrac\{1\}\{2\}\\sqrt\{3\}\\,i/);
});

test('a hyperbolic element of SL₂(ℤ): the axis from (1 − √5)/2 to the golden ratio', () => {
    const T = table([['2', '1', '1', '1']], [{ type: 'hyperbolic', order: null }], { numbers: [] });
    const c = T.rows[0][0];
    assert.equal(c.cls, 'hyperbolic');
    assert.match(text(c), /\\ell \\approx 1\.92485/);          // 2 arccosh(3/2)
    assert.match(text(c), /from \$\\tfrac\{1\}\{2\} - \\tfrac\{1\}\{2\}\\sqrt\{5\}\$ to \$\\tfrac\{1\}\{2\} \+ \\tfrac\{1\}\{2\}\\sqrt\{5\}\$/);
});

test('the Borel group ⟨(1 1; 0 1), (2 0; 0 1)⟩: parabolic and hyperbolic at ℝ, elliptic and hyperbolic in T₃', () => {
    const T = table([['1', '1', '0', '1'], ['2', '0', '0', '1']], [{ type: 'parabolic', order: null }, { type: 'hyperbolic', order: null }], { numbers: ['2'] });
    assert.deepEqual(T.columns.map((c) => c.key), ['inf1', 'p2_0']);
    assert.equal(T.columns[1].space, 'T_{3}');
    assert.equal(cell(T, 0, 'inf1').cls, 'parabolic');
    assert.match(text(cell(T, 0, 'inf1')), /fixes the point \$\\infty\$/);
    assert.equal(cell(T, 1, 'inf1').cls, 'hyperbolic');
    assert.match(text(cell(T, 1, 'inf1')), /from \$0\$ to \$\\infty\$/);       // z ↦ 2z: ∞ attracts at ℝ
    const u = cell(T, 0, 'p2_0');
    assert.equal(u.cls, 'elliptic');
    assert.match(text(u), /fixes \$o = \\lfloor 0 \\rfloor_\{0\}\$/);
    assert.match(text(u), /unipotent, so it also fixes the end \$\\infty\$/);
    const h = cell(T, 1, 'p2_0');
    assert.equal(h.cls, 'hyperbolic');
    assert.match(text(h), /\\ell = -v\(\\operatorname\{tr\}\^2\/\\det\) = 1\$ edge/);
    assert.match(text(h), /from the end \$\\xi_- = \\infty\$ to the attracting end \$\\xi_\+ = 0\$/);   // 2-adically, 0 attracts
});

test('(1 −2; 1 1): elliptic of infinite order at ℝ, hyperbolic at ℚ₃ with 3-adic ends', () => {
    const T = table([['1', '-2', '1', '1']], [{ type: 'elliptic', order: null }], { numbers: ['3'] });
    assert.deepEqual(T.columns.map((c) => c.key), ['inf1', 'p3_0']);
    const e = cell(T, 0, 'inf1');
    assert.equal(e.cls, 'elliptic');
    assert.match(text(e), /\\theta \\approx 1\.91063/);          // arccos(−1/3)
    assert.match(text(e), /z_0 = \\sqrt\{2\}\\,i/);
    const h = cell(T, 0, 'p3_0');
    assert.equal(h.cls, 'hyperbolic');
    assert.match(text(h), /= 1\$ edge/);
    // the ends solve z² − z·0 … : c z² + (d − a) z − b = z² + 2 = 0, i.e. z = ±√−2 ∈ ℚ₃; check to 3⁻⁶
    const ends = [...text(h).matchAll(/\\xi_[-+] = ([^$]*)\$/g)].map((x) => x[1]);
    assert.equal(ends.length, 2);
    for (const s of ends) {
        const terms = s.split(' + ').filter((x) => !x.startsWith('O('));
        let z = 0n;
        for (const t of terms) {
            const m = t.match(/^(\d+)?(?: \\cdot )?(?:3(?:\^\{(-?\d+)\})?)?$/);
            const c = BigInt(m[1] ?? 1), j = t.includes('3') && !/^\d+$/.test(t) ? Number(m[2] ?? 1) : 0;
            z += c * 3n ** BigInt(j);
        }
        assert.equal((z * z + 2n) % 3n ** 6n, 0n, `ξ = ${s}`);
    }
});

test('an edge inversion at ℚ₂: (0 1; 2 0) with (2 0; 0 1) to make Γ unbounded there', () => {
    const T = table([['0', '1', '2', '0'], ['2', '0', '0', '1']], [{ type: 'elliptic', order: 2 }, { type: 'hyperbolic', order: null }], { numbers: ['2'] });
    const c = cell(T, 0, 'p2_0');
    assert.equal(c.cls, 'torsion');
    assert.match(text(c), /fixes no vertex/);
    assert.equal(cell(T, 0, 'inf1').cls, 'torsion');
    assert.match(text(cell(T, 0, 'inf1')), /reflection/);         // det = −2 < 0, tr = 0
});

test('over ℚ(√2): the two real places see different classes, and the tree over the prime above 2', () => {
    const job = {
        poly: 'w^2-2', mats: [['1', 'w', '0', '1'], ['w', '0', '0', '1']],
        gens: [{ type: 'parabolic', order: null }, { type: 'hyperbolic', order: null }],
        arch: [{ key: 'inf1', kind: 'real', root: { re: Math.SQRT2, im: 0 }, label: '\\mathbb{R}_1' },
            { key: 'inf2', kind: 'real', root: { re: -Math.SQRT2, im: 0 }, label: '\\mathbb{R}_2' }],
        numbers: ['2'],
    };
    const T = generatorTable(deps, job);
    assert.deepEqual(T.columns.map((c) => c.key), ['inf1', 'inf2', 'p2_0']);
    assert.equal(T.rows[1][0].cls, 'hyperbolic');
    // diag(√2, 1): translation length log √2 at both real places (|±√2| = √2), glide reflection at the second
    assert.match(text(T.rows[1][0]), /\\ell \\approx 0\.346574/);
    assert.match(text(T.rows[1][1]), /glide reflection/);
    assert.equal(T.rows[1][2].cls, 'hyperbolic');                // v_𝔭(t) = v(2 + √2 + 1/√2 …) < 0 at 𝔭 = (√2)
});
