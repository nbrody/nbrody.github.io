// node tests/fig-counts.test.mjs — the math behind Figures 3, 6 and 8.
import * as L from '../js/lps.js';
import { rQWithSolution, trivialCount, wordTex, quatTex, PAIRS as GIRTH_PAIRS } from '../js/fig-girth.js';
import { mainConstant, normError, hypotheticalTerm, leavesBandAt, PAIRS as MAIN_PAIRS } from '../js/fig-mainterm.js';
import { ballData, treeSphere, PAIRS as BALL_PAIRS } from '../js/fig-balls.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const t0 = Date.now();

// rQSteps agrees with lps.rQ, and its solution is a genuine nontrivial solution
for (const q of [5, 13, 17, 29]) for (const p of [5, 13, 17, 29]) {
  if (p === q) continue;
  for (let t = 0; t <= 8; t++) {
    const N = p ** t;
    if (L.rQCost(N, q) > 3e6) break;
    const { count, solution } = rQWithSolution(N, q);
    ok(count === L.rQ(N, q), `rQSteps = rQ (${p}^${t}, q=${q})`);
    if (solution) {
      ok(L.qnorm(solution) === N && solution.slice(1).some((x) => x) && solution.slice(1).every((x) => x % (2 * q) === 0), `solution valid (${p}^${t}, q=${q})`);
    } else ok(count === trivialCount(t) || count === 0, `no nontrivial solution ⇒ trivial count (${p}^${t}, q=${q})`);
  }
}

// Figure 3: first nontrivial t = girth (BFS), ≥ Theorem 3.4, and the factored word is a reduced relation
for (const [p, q] of GIRTH_PAIRS) {
  let first = null, sol = null;
  for (let t = 0; t < 20 && first === null; t++) {
    const r = rQWithSolution(p ** t, q);
    if (r.count > trivialCount(t)) { first = t; sol = r.solution; }
  }
  const X = L.buildX(p, q);
  const g = L.girth(X).girth;
  ok(first === g, `first nontrivial t ${first} = girth ${g} (${p},${q})`);
  ok(first >= L.girthBound(p, q), `girth ≥ bound (${p},${q})`);
  const f = L.factorQuaternion(sol, p, L.generators(p));
  ok(f && f.r === 0 && f.word.length === first && f.steps.every((c) => c === 1), `relation factors to a reduced word of length ${first} (${p},${q})`);
  const inv = L.inverseIndex(L.generators(p));
  ok(f && L.reduceWord(f.word, inv).length === f.word.length, `relation is reduced (${p},${q})`);
  // the word evaluates to a scalar matrix mod q
  let m = [1, 0, 0, 1];
  for (const s of f.word) {
    const [a, b, c, d] = X.mats[s];
    m = [(m[0] * a + m[1] * c) % q, (m[0] * b + m[1] * d) % q, (m[2] * a + m[3] * c) % q, (m[2] * b + m[3] * d) % q];
  }
  ok(m[1] === 0 && m[2] === 0 && m[0] === m[3], `relation is the identity in PGL2 (${p},${q})`);
  ok(typeof wordTex(f.word) === 'string' && quatTex(sol).length > 0, 'TeX helpers');
}
ok(wordTex([0, 0, 3]) === '\\alpha_{1}^{2}\\,\\bar\\alpha_{2}', 'wordTex powers and bars');

// Figure 6: the error stays within p^{k/2}; the hypothetical term matches sinh form and leaves the band
for (const [p, q] of MAIN_PAIRS) {
  ok(Math.abs(mainConstant(q) - 4 / (q * (q * q - 1))) < 1e-15, 'constant');
  for (let k = 1; k <= 12; k++) {
    const N = p ** k;
    if (L.rQCost(N, q) > 6e7) break;
    const e = normError(L.rQ(N, q), p, q, k);
    ok(Math.abs(e) <= 1, `|r−C|/p^{k/2} = ${e.toFixed(3)} ≤ 1 (${p},${q}) k=${k}`);
  }
  const n = L.orderX(p, q), bip = L.legendre(p, q) === -1;
  for (const frac of [0.2, 0.6, 0.95]) {
    const lam = 2 * Math.sqrt(p) + frac * (p + 1 - 2 * Math.sqrt(p));
    const mu = Math.acosh(lam / (2 * Math.sqrt(p)));
    for (let k = 1; k <= 20; k++) {
      const want = bip && k % 2 ? 0 : (bip ? 2 : 1) * (2 / n) * Math.sinh((k + 1) * mu) / Math.sinh(mu);
      const got = hypotheticalTerm(lam, p, q, k);
      ok(Math.abs(got - want) <= 1e-9 * Math.max(1, want), `hypothetical term sinh form (${p},${q}) k=${k}`);
    }
    const ks = leavesBandAt(lam, p, q);
    ok(ks !== null && hypotheticalTerm(lam, p, q, ks) > 1 && (ks === 1 || hypotheticalTerm(lam, p, q, ks - 1) <= 1 || bip), `leaves the band at k=${ks} (${p},${q}, frac ${frac})`);
  }
}

// Figure 8
for (const [p, q] of BALL_PAIRS) {
  const d = ballData(p, q);
  ok(d.n === L.orderX(p, q), `n (${p},${q})`);
  ok(d.agree, `spheres = tree for r ≤ ⌊(g−1)/2⌋ (${p},${q})`);
  ok(d.spheres[d.treeLike + 1] === undefined || d.spheres[d.treeLike + 1] <= treeSphere(p, d.treeLike + 1), `spheres ≤ tree just past (${p},${q})`);
  ok(d.diam <= d.upper, `diam ${d.diam} ≤ ${d.upper.toFixed(2)} (${p},${q})`);
  ok(d.diam + 1 >= d.lower - Math.log((p + 1) / (p - 1)) / Math.log(p) - 1, `diam not below log_p n − O(1) (${p},${q})`);
  if (d.psl) ok(d.indep <= d.alon, `greedy ${d.indep} ≤ Alon ${d.alon.toFixed(0)} (${p},${q})`);
  console.log(`  (${p},${q}) n=${d.n} g=${d.girth} diam=${d.diam} bound=${d.upper.toFixed(2)} indep=${d.indep} alon=${d.alon.toFixed(0)}`);
}

console.log(`${passes} passed, ${fails} failed in ${Date.now() - t0} ms`);
process.exit(fails ? 1 : 0);
