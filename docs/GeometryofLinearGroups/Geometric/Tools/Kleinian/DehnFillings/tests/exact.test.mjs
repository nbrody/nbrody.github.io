// exact.test.mjs — the exact holonomy in exact/<id>.json (tools/make_exact.py) agrees with the
// floating-point holonomy of js/develop.js, projectively and in the same frame.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CENSUS } from '../js/census.js';
import { Triangulation } from '../js/triangulation.js';
import { Solver } from '../js/solver.js';
import { holonomy } from '../js/develop.js';
import { C, add, sub, mul, div, abs, scale, neg, mmul, madj, fixedPoints, affine, ONE, ZERO } from '../js/complex.js';

const DIR = new URL('../exact/', import.meta.url);

/** Parse the polynomials make_exact.py writes: sums of ±\frac{a}{b}w^{k}, ±a w^{k}, ±\frac{w^{k}}{b}, ±\frac{a}{b}. */
export function parsePoly(s) {
    const terms = [];
    let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        if ((ch === '+' || ch === '-') && depth === 0 && cur !== '') { terms.push(cur); cur = ''; }
        cur += ch;
    }
    if (cur) terms.push(cur);
    const coeffs = [];
    for (let t of terms) {
        let sign = 1;
        if (t[0] === '+') t = t.slice(1);
        else if (t[0] === '-') { sign = -1; t = t.slice(1); }
        let c, k, m;
        if ((m = /^\\frac\{(\d+)\}\{(\d+)\}(?:w(?:\^\{(\d+)\})?)?$/.exec(t))) { c = +m[1] / +m[2]; k = t.includes('w') ? (m[3] ? +m[3] : 1) : 0; }
        else if ((m = /^\\frac\{w(?:\^\{(\d+)\})?\}\{(\d+)\}$/.exec(t))) { c = 1 / +m[2]; k = m[1] ? +m[1] : 1; }
        else if ((m = /^(\d*)w(?:\^\{(\d+)\})?$/.exec(t))) { c = m[1] ? +m[1] : 1; k = m[2] ? +m[2] : 1; }
        else if ((m = /^(\d+)$/.exec(t))) { c = +m[1]; k = 0; }
        else throw new Error(`cannot read the term "${t}"`);
        coeffs[k] = (coeffs[k] || 0) + sign * c;
    }
    for (let i = 0; i < coeffs.length; i++) coeffs[i] = coeffs[i] || 0;
    return coeffs;
}
const evalPoly = (c, w) => { let r = C(0, 0); for (let k = c.length - 1; k >= 0; k--) r = add(mul(r, w), C(c[k], 0)); return r; };
const derivPoly = (c) => c.slice(1).map((x, k) => (k + 1) * x);
function rootNear(c, near) {
    let w = C(near[0], near[1]);
    const d = derivPoly(c);
    for (let i = 0; i < 60; i++) w = sub(w, div(evalPoly(c, w), evalPoly(d, w)));
    return w;
}
/** Are two 2×2 matrices proportional? (relative size of the 2×2 minors of [A; B]) */
function proportional(A, B) {
    const na = Math.max(...A.map(abs)), nb = Math.max(...B.map(abs));
    let worst = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        worst = Math.max(worst, abs(sub(mul(A[i], B[j]), mul(A[j], B[i]))) / (na * nb));
    }
    return worst;
}
const conjBy = (T, G) => mmul(mmul(T, G), madj(T));

for (const e of CENSUS) {
    const file = new URL(`${e.id}.json`, DIR);
    if (!fs.existsSync(file)) continue;
    const X = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tri = new Triangulation(e), sol = new Solver(tri);
    const check = (rec, z, frame, label = '') => {
        const coeffs = parsePoly(rec.poly);
        assert.equal(coeffs.length - 1, rec.degree);
        const w = rootNear(coeffs, rec.near);
        const H = holonomy(tri, z);
        rec.mats.forEach((M, g) => {
            const exact = M.map((s) => evalPoly(parsePoly(s), w));
            const float = conjBy(frame(H), H.simple[g + 1]);
            const d = proportional(exact, float);
            assert.ok(d < 1e-5, `${label} generator ${g + 1}: ${d}`);
        });
    };
    if (X.complete) {
        test(`${e.id}: exact cusped holonomy`, () => {
            const z = sol.shapes(sol.completeState());
            check(X.complete, z, (H) => {
                const M = H.periph[0].m;
                const p = affine(fixedPoints(M)[0]);
                const Xm = p === null ? [ONE, ZERO, ZERO, ONE] : [ZERO, ONE, ONE, neg(p)];
                const Mp = conjBy(Xm, M);
                const mu = div(Mp[1], Mp[3]);
                return mmul([ONE, ZERO, ZERO, mu], Xm);
            });
        });
    }
    const fills = Object.entries(X.fillings || {});
    if (fills.length) {
        test(`${e.id}: exact holonomy of ${fills.length} fillings`, () => {
            for (const [key, rec] of fills) {
                const [p, q] = key.split('/').map(Number);
                const r = sol.solve([{ p, q, t: 1 }], { N: 16 });
                assert.ok(r.ok, key);
                check(rec, r.frame.z, () => [C(2, 0), C(1 / 3, 0), ZERO, ONE], key);
            }
        });
    }
}

test('the polynomial reader', () => {
    assert.deepEqual(parsePoly('w^{2}-w+1'), [1, -1, 1]);
    assert.deepEqual(parsePoly('\\frac{2}{7}w-\\frac{3}{7}'), [-3 / 7, 2 / 7]);
    assert.deepEqual(parsePoly('-\\frac{w^{3}}{5}+2w^{2}-4'), [-4, 0, 2, -1 / 5]);
    assert.deepEqual(parsePoly('1'), [1]);
    assert.deepEqual(parsePoly('0'), [0]);
});

export { scale };
