// node tests/presentation.test.mjs [maxGenus] — every relation of the presentation holds on the
// oriented Humphries curves (so, by the Alexander method, in Mod(S_g)); a wrong relation fails.
import { Surface } from '../js/surface.js';
import * as M from '../js/mcg.js';
import { sameCurve, selfCrossings } from '../js/twist.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok  ', msg); };
const maxG = +(process.argv[2] || 4);
for (let g = 2; g <= maxG; g++) {
    const S = new Surface(g);
    const P = M.presentation(g);
    let t0 = Date.now();
    const curves = M.buildCurves(S, P);
    for (const [k, c] of Object.entries(curves)) if (selfCrossings(c)) ok(false, `g=${g}: ${k} is not simple`);
    if (P.aux.d) ok(sameCurve(curves.d, curves['c' + (2 * g + 1)]) !== 0, `g=${g}: d is the last curve of the chain`);
    const tests = P.gens;
    for (const r of P.rel) {
        t0 = Date.now();
        const v = M.verify(r, curves, tests);
        if (r.kind === 'braid' || r.kind === 'disjoint') { if (!v.ok) ok(false, `g=${g}: ${r.lhs} = ${r.rhs}`); continue; }
        ok(v.ok, `g=${g}: ${r.name}  (${v.out.map(o => o.same).join('')}, ${Date.now() - t0} ms)`);
    }
    ok(true, `g=${g}: all ${P.rel.filter(r => r.kind === 'braid' || r.kind === 'disjoint').length} braid and disjointness relations`);
    const bad = M.verify({ L: M.parseTwists('1 2 1'), R: M.parseTwists('2 1 1') }, curves, tests);
    ok(!bad.ok, `g=${g}: a false relation fails`);
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
