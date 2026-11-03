// node tests/fig-sb.test.mjs — Figure 1's Severi–Brauer view: under either splitting i ↦ j of H ⊗ F_p,
// the generators are rank one mod p and α ↦ ker α̃ is a bijection onto P¹(F_p) swapping with images under conjugation.
import { severiBrauer, sqrtsMinusOne, P_CHOICES } from '../js/fig-generators.js';
import { primes1mod4 } from '../js/lps.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
for (const p of [...new Set([...P_CHOICES, ...primes1mod4(5, 151)])]) {
  const roots = sqrtsMinusOne(p);
  ok(roots.length === 2 && roots.every((j) => (j * j + 1) % p === 0), `two square roots of −1 mod ${p}`);
  for (const j of roots) {
    const sb = severiBrauer(p, j);
    ok(sb.rank1, `rank one mod ${p} (j=${j})`);
    ok(sb.bijection && sb.at.every((s) => s >= 0), `bijection onto P¹(F_${p}) (j=${j})`);
    ok(sb.swap, `ker of conjugate = image (p=${p}, j=${j})`);
    ok(sb.noFix, `no pair collapses (p=${p}, j=${j})`);
  }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
