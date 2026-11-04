// node tests/fig-example.test.mjs — the figure's math, checked against the paper's claim.
import { squares } from '../js/fig-example.js';
let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log('FAIL', msg)));
for (const a of [0.5, 1, 2, 3]) for (const [x, y] of squares(-a, a)) ok(y >= 0 && Math.abs(y - x * x) < 1e-12, `x=${x}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
