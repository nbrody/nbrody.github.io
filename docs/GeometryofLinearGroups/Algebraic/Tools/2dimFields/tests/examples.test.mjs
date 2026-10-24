// node tests/examples.test.mjs — every example parses over its field, and the Shalen examples are
// what their notes say: the twisted copy fixes the vertex named there, and the amalgamating relation holds.
import { fromPoly, mmul, adj, det, isScalar } from '../js/laurent.js';
import { parseRat } from '../js/polyParse.js';
import { polyMatrix } from '../js/poly.js';
import { classify, keyOf } from '../js/treeAction.js';
import { makeKEngine } from '../js/kengine.js';
import { EXAMPLES } from '../js/examples.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };

const engines = { i: makeKEngine('i'), omega: makeKEngine('omega') };
const engineOf = (field) => {
    if (!field) return { matrixOf: (e) => polyMatrix(e.map((s) => parseRat(s))).map(fromPoly), tree: { classify, keyOf } };
    const E = engines[field];
    return { matrixOf: (e) => E.matrixOf(e.map(E.parse)), tree: E.tree };
};
const gensOf = (name) => {
    const ex = EXAMPLES.find((e) => e.name === name);
    const E = engineOf(ex.field);
    return { E, M: ex.gens.map(E.matrixOf) };
};

// every example, over its own field (and those over ℚ over every field)
for (const ex of EXAMPLES) {
    for (const field of ex.field ? [ex.field] : [null, 'i', 'omega']) {
        let M = null;
        try { M = ex.gens.map(engineOf(field).matrixOf); } catch (err) { ok(false, `${ex.name} over ${field || 'ℚ'}: ${err.message}`); continue; }
        ok(M.every((g) => !det(g).isZero()), `${ex.name} over ${field || 'ℚ'}: invertible`);
    }
}

const com = (x, y) => mmul(mmul(x, y), mmul(adj(x), adj(y)));
const word = (s, x, y) => s.split('').map((c) => ({ x, X: adj(x), y, Y: adj(y) })[c]).reduce(mmul);
const fixedKey = (E, g) => { const c = E.tree.classify(g); return c.kind === 'elliptic' ? E.tree.keyOf(c.fixed) : null; };

{   // genus 2: [g₁, g₂] = [g₃, g₄] = (z ↦ z + 6); the first copy fixes v₀, the second v₀ → ∞ → −1
    const { E, M: [a, b, c, d] } = gensOf('Shalen: a genus-2 surface group, doubled along a cusp');
    const z6 = engineOf(null).matrixOf(['1', '6', '0', '1']);
    ok(isScalar(mmul(com(a, b), adj(z6))), 'genus 2: [g₁, g₂] = z ↦ z + 6');
    ok(isScalar(mmul(com(a, b), adj(com(c, d)))), 'genus 2: [g₁, g₂] = [g₃, g₄]');
    ok(fixedKey(E, a) === '' && fixedKey(E, b) === '', 'genus 2: g₁, g₂ fix v₀');
    ok(fixedKey(E, c) === '∞ -1' && fixedKey(E, d) === '∞ -1', 'genus 2: g₃, g₄ turn about v₀ → ∞ → −1');
}
{   // the punctured torus doubled along ⟨g₁⟩: g₃ = diag(t, 1) g₂ diag(t, 1)⁻¹ commutes past g₁ and fixes the plane at ∞
    const { E, M: [a, b, b2] } = gensOf('Shalen: a punctured torus doubled along a geodesic');
    const s = engineOf(null).matrixOf(['t', '0', '0', '1']);
    ok(isScalar(mmul(mmul(s, mmul(b, adj(s))), adj(b2))), 'geodesic: g₃ = s g₂ s⁻¹');
    ok(isScalar(mmul(mmul(s, a), adj(mmul(a, s)))), 'geodesic: s commutes with g₁');
    ok(fixedKey(E, b2) === '∞', 'geodesic: g₃ turns about the plane at ∞');
}
{   // figure-eight: the longitude is z ↦ z + 2√−3 = z + 2 + 4ω in both copies; the second copy turns about v₀ → ∞ → −1
    const { E, M: [x, y, y2] } = gensOf('Shalen: the double of the figure-eight knot complement');
    const lon = engineOf('omega').matrixOf(['1', '2+4\\omega', '0', '1']);
    ok(isScalar(mmul(word('yXYxxYXy', x, y), adj(lon))), 'figure-eight: the longitude is z ↦ z + 2√−3');
    ok(isScalar(mmul(word('yXYxxYXy', x, y2), adj(lon))), 'figure-eight: the same longitude in the second copy');
    ok(fixedKey(E, x) === '' && fixedKey(E, y) === '', 'figure-eight: g₁, g₂ fix v₀');
    ok(fixedKey(E, y2) === '∞ -1|0', 'figure-eight: g₃ turns about v₀ → ∞ → −1');
}

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
