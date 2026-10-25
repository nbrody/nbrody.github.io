// node tests/specialize.test.mjs
// A pole of a built-in entry must not be scaled into SL₂(ℂ): cnorm divides by √det and returns NaN.
import { makeKEngine } from '../js/kengine.js';
import { EXAMPLES } from '../js/examples.js';
import { specMatC } from '../js/specialize.js';
import { cSingular, cnorm, cpath } from '../js/cmobius.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const finiteMat = (M) => M.every((z) => Number.isFinite(z[0]) && Number.isFinite(z[1]));

const ex = EXAMPLES.find((e) => e.name === 'Rational functions of t');
for (const field of ['i', 'omega']) {
    const E = makeKEngine(field);
    const [g1, g2] = ex.gens.map((g) => E.matrixOf(g.map(E.parse)));
    const at = (M, z) => specMatC(M, z);
    const pole1 = at(g1, [1, 0]), pole2 = at(g2, [-1, 0]);
    ok(cSingular(pole1), `${field}: g₁ at t = 1 is the pole of t/(t−1)`);
    ok(cSingular(pole2), `${field}: g₂ at t = −1 is the pole of 1/(1+t)`);
    ok(!finiteMat(cnorm(pole1)), `${field}: scaling the pole is not a finite matrix`);
    for (const z of [[2, 0], [Math.PI, 0], [0.5, 1]]) {
        const M = at(g1, z);
        ok(!cSingular(M) && finiteMat(cnorm(M)), `${field}: g₁ at ${z} still acts`);
        const step = cpath(cnorm(M))(0.5);
        ok(finiteMat(step), `${field}: the screw motion of g₁ at ${z} stays finite`);
    }
}

// Every shipped example, at the default t = π and at t = 1, except the two poles above.
for (const field of ['i', 'omega']) {
    const E = makeKEngine(field);
    for (const ex2 of EXAMPLES) {
        if (ex2.field && ex2.field !== field) continue;
        const Ms = ex2.gens.map((g) => E.matrixOf(g.map(E.parse)));
        for (const z of [[Math.PI, 0], [1, 0], [-1, 0]]) {
            Ms.forEach((M, i) => {
                const pole = ex2 === ex && ((i === 0 && z[0] === 1 && z[1] === 0) || (i === 1 && z[0] === -1 && z[1] === 0));
                if (pole) return;
                ok(!cSingular(specMatC(M, z)), `${ex2.name} over ${field}: g${i + 1} at ${z} is invertible`);
            });
        }
    }
}

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
