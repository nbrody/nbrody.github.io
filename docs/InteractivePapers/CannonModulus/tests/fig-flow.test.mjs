// node tests/fig-flow.test.mjs — Figure 7 (Lemma 5.3): the explicit tree satisfies (5.8)/(5.9) and
// (5.21), its exact aggregates match full enumeration, Jensen holds, and the threshold is 1/11.
import {
  BSTAR, TAU, GAMMA, BETA, QDIM, THRESHOLD, LAMBDA, DELTA0, C_BAD, C_GOOD, C_LIN, T_GOOD_MAX,
  schedule, budgetReport, envelope, family, transitionOk, flowOk, rootNode, sampleFlow, flowExponent, mix,
} from '../js/fig-flow.js';

let pass = 0, fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log('FAIL', msg)));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

// ── the exponents (5.7) and the threshold
ok(BSTAR === 0.5 && TAU === 0.05, 'b* = 1/2, τ = 1/20');
ok(near(BETA, TAU / (4 * (QDIM + 1))) && near(GAMMA, BETA / 2), 'β = τ/(4(Q+1)), γ = β/2');
ok(near(THRESHOLD, 1 / 11, 1e-15), 'τ/(b*+τ) = 1/11');
ok(near(C_BAD, Math.exp(-LAMBDA / 2)) && near(C_GOOD, Math.exp(LAMBDA / 20)) && near(C_LIN * C_LIN, Math.exp(-2 * GAMMA * LAMBDA)), 'transition constants a^{−b*D}, a^{τD}, a^{−γD}');
ok(T_GOOD_MAX < 1 && near(C_GOOD * T_GOOD_MAX * T_GOOD_MAX, C_LIN * T_GOOD_MAX), 'a^{−(τ+γ)D}: the two good bounds cross there');

// ── families: (5.8) at not-good nodes, (5.9) at good nodes, Σp = 1, the quadratic bound saturated
const S0 = schedule({ eps: 0.37, rule: 'adversary', G: 12 });
for (let i = 0; i < 3000; i++) {
  const n = i % 12, m = Math.floor((i * 7) % (n + 1));
  const node = { n, m, bad: i % 3 === 0, seed: mix(i, 99) };
  const kids = family(node, S0);
  const sum = kids.reduce((s, k) => s + k.p, 0);
  ok(Math.abs(sum - 1) < 1e-12, `Σp = 1 #${i} (${sum})`);
  ok(kids.every((k) => transitionOk(node.bad, k)), `transition bounds #${i} (${node.bad ? 'not good' : 'good'})`);
  const c = node.bad ? C_BAD : C_GOOD;
  ok(kids.every((k) => near(k.p, c * k.t * k.t, 1e-12)), `quadratic bound saturated #${i}`);
  // the bad block has exactly the schedule's mass
  const mc = m + (node.bad ? 1 : 0), f = S0.f[n + 1][mc];
  ok(near(kids.filter((k) => k.bad).reduce((s, k) => s + k.p, 0), f, 1e-12), `not-good block mass = f #${i}`);
  // the bounds are not vacuous: a violating child is rejected
  ok(!transitionOk(node.bad, { t: 0.3, p: 1.01 * c * 0.09 + 1e-9 }), `violation detected #${i}`);
}
// a not-good node gives Σ t² = a^{b*D} (squares grow), a good one Σ t² = a^{−τD}
{
  const kidsB = family({ n: 0, m: 0, bad: true, seed: 5 }, S0), kidsG = family({ n: 0, m: 0, bad: false, seed: 5 }, S0);
  ok(near(kidsB.reduce((s, k) => s + k.t * k.t, 0), Math.exp(BSTAR * LAMBDA), 1e-12), 'Σt² = a^{b*D} below a node that is not good');
  ok(near(kidsG.reduce((s, k) => s + k.t * k.t, 0), Math.exp(-TAU * LAMBDA), 1e-12), 'Σt² = a^{−τD} below a good node');
}

// ── schedules: conservation, exact bad mass, Jensen, the lemma
const cases = [];
for (const rule of ['adversary', 'honest']) for (const eps of [0, 0.02, 0.05, 1 / 11, 0.12, 0.2, 0.3, 0.5, 0.7, 1]) cases.push({ rule, eps });
for (const { rule, eps } of cases) {
  const S = schedule({ eps, rule, G: 60 });
  const tag = `${rule} ε=${eps.toFixed(3)}`;
  ok(S.w.every((wn) => near(wn.reduce((a, b) => a + b, 0), 1, 1e-12)), `${tag}: every level has total probability 1`);
  ok(S.w.every((wn, n) => near(wn.reduce((a, x, m) => a + m * x, 0), S.M[n], 1e-10)), `${tag}: Σ P_i m_i = Σ_{k<n} ε_k (conservation)`);
  if (rule === 'adversary') ok(S.bad.every((b, n) => n === 0 || near(b, eps, 1e-12)), `${tag}: bad mass ε at every n ≥ 1`);
  ok(S.f.every((fn) => fn.every((x) => x >= 0 && x <= 1)), `${tag}: fractions in [0,1]`);
  // Jensen: Σ_m w(m) a^{D(...)} ≥ a^{D(... Σ m w(m) ...)}
  ok(S.lnE.every((x, n) => x >= S.lnJ[n] - 1e-12), `${tag}: Jensen at every n`);
  // the adversary keeps m even: spread at most 1
  if (rule === 'adversary') ok(S.w.every((wn) => { const sup = [...wn.keys()].filter((m) => wn[m] > 1e-15); return Math.max(...sup) - Math.min(...sup) <= 1; }), `${tag}: m spread ≤ 1`);
  for (const k of [4, 10, 16, 24]) {
    const lnB = k * Math.LN2, R = budgetReport(S, lnB);
    ok(R.lemmaOk, `${tag}: within budget ⇒ average ≤ 1/11 + O(1/n) (E0 = 2^${k})`);
    ok(R.jensenOk, `${tag}: Jensen report`);
    if (R.nJ !== null) ok(R.nE !== null && R.nE <= R.nJ, `${tag}: energy leaves the budget no later than Jensen's bound`);
    // the equivalence behind the envelope: lnJ_n > lnB iff average > envelope
    for (let n = 1; n <= 60; n++) ok((S.lnJ[n] > lnB) === (S.avg[n] > envelope(n, lnB)) || Math.abs(S.lnJ[n] - lnB) < 1e-9, `${tag}: Jensen bound vs envelope at n=${n}`);
  }
}
// the adversary at 1/2 loses at a finite generation; at 1/11 it stays within budget
{
  const lnB = 10 * Math.LN2;
  const Rh = budgetReport(schedule({ eps: 0.5 }), lnB);
  ok(Rh.nE !== null && Rh.nE > 5 && Rh.nE < 40, `adversary at 1/2 breaks the budget at n = ${Rh.nE}`);
  ok(Rh.nJ !== null, `adversary at 1/2: Jensen's bound alone breaks it at n = ${Rh.nJ}`);
  const R11 = budgetReport(schedule({ eps: 1 / 11 }), lnB);
  ok(R11.nE === null, 'adversary at 1/11 stays within budget');
  const S11 = schedule({ eps: 1 / 11, G: 400 });
  ok(S11.lnJ.slice(1).every((x) => Math.abs(x - S11.lnJ[1]) < 1e-9), 'at 1/11 the Jensen exponent is constant from n = 1');
  const Rhon = budgetReport(schedule({ eps: 0.05, rule: 'honest' }), lnB);
  ok(Rhon.nE === null, 'honest flow stays within budget');
  // any ε > 1/11 breaks any budget eventually (here 2^16 Δ0², 2000 generations)
  for (const eps of [0.1, 0.15, 0.3]) {
    const S = schedule({ eps, G: 2000 });
    const R = budgetReport(S, 16 * Math.LN2);
    ok(R.nJ !== null && Math.abs(R.nJ - R.predicted) <= 1, `ε=${eps}: breaks at ${R.nJ} (predicted ${R.predicted})`);
  }
}

// ── the sampled flow: (5.21) at every node, (5.8)/(5.9) at every transition; sampling agrees
for (const { rule, eps } of [{ rule: 'adversary', eps: 0.5 }, { rule: 'adversary', eps: 1 / 11 }, { rule: 'honest', eps: 0.05 }, { rule: 'adversary', eps: 0.8 }]) {
  const S = schedule({ eps, rule });
  const M = sampleFlow(S, { K: 300 });
  const tag = `${rule} ε=${eps.toFixed(3)}`;
  ok(M.nodeFails === 0, `${tag}: (5.21) at all ${M.nodes} sampled nodes`);
  ok(M.transFails === 0 && M.sumFails === 0, `${tag}: (5.8)/(5.9) and Σp=1 at all ${M.transitions} transitions`);
  ok(M.nodes > 1000 && M.transitions > 5000, `${tag}: a real sample (${M.nodes} nodes, ${M.transitions} transitions)`);
  // sampled bad fraction and mean m agree with the exact aggregates (4σ)
  let worstZ = 0;
  M.perGen.forEach((g, n) => {
    const p = S.bad[n], sd = Math.sqrt(Math.max(p * (1 - p), 1e-6) / M.K);
    worstZ = Math.max(worstZ, Math.abs(g.badFrac - p) / sd);
  });
  ok(worstZ < 4.5, `${tag}: sampled bad fraction matches the schedule (worst z = ${worstZ.toFixed(2)})`);
  const n = S.G, meanErr = Math.abs(M.perGen[n].meanM - S.M[n]);
  ok(meanErr < 0.6 + 4 * Math.sqrt(S.M[n] / M.K + 0.01), `${tag}: sampled mean m ≈ Σ P_i m_i (${M.perGen[n].meanM.toFixed(2)} vs ${S.M[n].toFixed(2)})`);
}

// ── exact aggregates against full enumeration of a small tree
for (const { rule, eps } of [{ rule: 'adversary', eps: 0.5 }, { rule: 'honest', eps: 0.3 }, { rule: 'adversary', eps: 0.2 }]) {
  const G = 4, S = schedule({ eps, rule, G });
  let level = [rootNode(S)];
  for (let n = 0; n <= G; n++) {
    const P = level.reduce((s, v) => s + Math.exp(v.lnP), 0);
    const bad = level.filter((v) => v.bad).reduce((s, v) => s + Math.exp(v.lnP), 0);
    const energy = level.reduce((s, v) => s + Math.exp(2 * v.lnD), 0) / (DELTA0 * DELTA0);
    const Pm = level.reduce((s, v) => s + Math.exp(v.lnP) * v.m, 0);
    ok(near(P, 1, 1e-10), `enum ${rule} n=${n}: total probability 1`);
    ok(near(bad, S.bad[n], 1e-10), `enum ${rule} n=${n}: bad mass ${bad} = ${S.bad[n]}`);
    ok(near(Math.log(energy), S.lnE[n], 1e-9), `enum ${rule} n=${n}: ΣΔ² matches the aggregate`);
    ok(near(Pm, S.M[n], 1e-10), `enum ${rule} n=${n}: Σ P m = Σ ε_k`);
    ok(level.every((v) => flowOk(v)), `enum ${rule} n=${n}: (5.21) at all ${level.length} nodes`);
    // (5.21) quadratic part holds with equality: the cheapest tree
    ok(level.every((v) => near(2 * v.lnD, 2 * Math.log(DELTA0) + v.lnP + flowExponent(v.m, v.n), 1e-9)), `enum ${rule} n=${n}: (5.21) is an equality`);
    if (n === G) break;
    const next = [];
    for (const v of level) {
      family(v, S).forEach((k, j) => next.push({ n: n + 1, m: v.m + (v.bad ? 1 : 0), bad: k.bad, lnP: v.lnP + Math.log(k.p), lnD: v.lnD + Math.log(k.t), seed: mix(v.seed, j + 1) }));
    }
    level = next;
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
