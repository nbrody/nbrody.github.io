// node tests/fig-duals.test.mjs — the math behind Figure S4 (unitary duals, Satake parameters, a_p of curves).
import * as L from '../js/lps.js';
import {
  casimir, discreteSeries, plancherelR, satake, lambdaFromZ, satoTate, kestenTheta, kestenThetaClosed,
  spectrumSummary, CURVES, discriminant, countPoints, apOf, curveData, angleHistogram,
} from '../js/fig-duals.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const t0 = Date.now();

// discrete series and Casimir: D_k at s = k/2, λ = (k/2)(1 − k/2); D_2 shares λ = 0 with the trivial rep (s = 1)
const ds = discreteSeries(6);
ok(ds.map((d) => d.k).join() === '2,4,6', 'D_2, D_4, D_6');
for (const d of ds) ok(close(d.lambda, casimir(d.k / 2)), `Casimir of D_${d.k}`);
ok(ds[0].lambda === 0 && casimir(1) === 0 && casimir(0) === 0, 'D_2 and the trivial rep share λ = 0');
ok(close(ds[1].lambda, -2) && close(ds[2].lambda, -6), 'D_4 at −2, D_6 at −6');
ok(ds.every((d) => d.dim === d.k - 1 && d.dim % 2 === 1), 'SO(3) partners have odd dimension k − 1');
// principal series s = 1/2 + ir has λ = 1/4 + r²; complementary s ∈ (1/2, 1) has λ ∈ (0, 1/4)
for (const r of [0.1, 1, 3.7]) ok(close(casimir(0.5 + 0) + r * r, 0.25 + r * r), 'principal series');
for (const s of [0.55, 0.8, 0.99]) { const l = casimir(s); ok(l > 0 && l < 0.25, `complementary s=${s}`); }
// Plancherel density: 0 up to 1/4, increasing, → 1/2
ok(plancherelR(0.2) === 0 && plancherelR(0.25) === 0, 'no Plancherel mass below 1/4');
let mono = true;
for (let i = 1; i < 200; i++) if (plancherelR(0.25 + i * 0.05) < plancherelR(0.25 + (i - 1) * 0.05)) mono = false;
ok(mono && plancherelR(50) > 0.4999, 'Plancherel density increases to 1/2');

// Satake parameters: λ = √p (z + 1/z)
for (const p of [5, 13, 17, 29]) {
  const R = 2 * Math.sqrt(p), k = p + 1;
  for (let i = 0; i <= 40; i++) {
    const lam = -R + (2 * R * i) / 40, z = satake(lam, p);
    ok(z.kind === 'tempered' && close(Math.hypot(z.re, z.im), 1) && close(lambdaFromZ(z.re, z.im, p), lam, 1e-9), `tempered ⇒ |z| = 1 (p=${p}, λ=${lam.toFixed(2)})`);
    ok(close(R * Math.cos(z.theta), lam, 1e-9), 'λ = 2√p cos θ');
  }
  const t = satake(k, p), sg = satake(-k, p);
  ok(t.kind === 'trivial' && close(t.re, Math.sqrt(p)), `trivial at z = √p (p=${p})`);
  ok(sg.kind === 'sign' && close(sg.re, -Math.sqrt(p)), `sign at z = −√p (p=${p})`);
  for (const lam of [R + 0.3, (R + k) / 2, k - 0.01]) {
    const z = satake(lam, p);
    ok(z.kind === 'complementary' && z.re > 1 && z.re < Math.sqrt(p) && close(lambdaFromZ(z.re, 0, p), lam, 1e-9), `complementary ⇒ 1 < z < √p (p=${p})`);
    const zn = satake(-lam, p);
    ok(zn.kind === 'complementary' && zn.re < -1 && close(lambdaFromZ(zn.re, 0, p), -lam, 1e-9), 'and its mirror');
  }
  ok(satake(k + 1, p).kind === 'outside', 'beyond p+1: not unitary');
}

// Kesten–McKay in θ: change of variables = closed form, total mass 1; Sato–Tate total mass 1;
// Kesten–McKay → Sato–Tate as p → ∞
const integ = (f, n = 4000) => { let s = 0; for (let i = 0; i < n; i++) s += f((Math.PI * (i + 0.5)) / n); return (s * Math.PI) / n; };
for (const p of [2, 5, 13, 17, 101]) {
  let maxd = 0;
  for (let i = 1; i < 100; i++) { const th = (Math.PI * i) / 100; maxd = Math.max(maxd, Math.abs(kestenTheta(th, p) - kestenThetaClosed(th, p))); }
  ok(maxd < 1e-9, `Kesten–McKay in θ: two formulas agree (p=${p})`);
  ok(close(integ((th) => kestenThetaClosed(th, p)), 1, 1e-5), `Kesten–McKay mass 1 (p=${p})`);
}
ok(close(integ(satoTate), 1, 1e-6), 'Sato–Tate mass 1');
{
  let d = 0;
  for (let i = 1; i < 100; i++) { const th = (Math.PI * i) / 100; d = Math.max(d, Math.abs(kestenThetaClosed(th, 1e6) - satoTate(th))); }
  ok(d < 1e-5, 'Kesten–McKay → Sato–Tate as p → ∞');
}

// histogram of angles is a density
{
  const th = Array.from({ length: 1000 }, (_, i) => (Math.PI * (i + 0.5)) / 1000);
  const h = angleHistogram(th, 20);
  ok(close(h.reduce((a, b) => a + b, 0) * (Math.PI / 20), 1), 'angle histogram integrates to 1');
  ok(h.every((v) => close(v, 1 / Math.PI, 1e-9)), 'uniform angles ⇒ flat histogram');
}

// elliptic curves: discriminants, known a_p, Hasse for every good p ≤ 1000, CM vanishing
ok(discriminant(CURVES['11a'].a) === -11, 'Δ(11a) = −11');
ok(discriminant(CURVES['37a'].a) === 37, 'Δ(37a) = 37');
ok(discriminant(CURVES['32a'].a) === 64, 'Δ(y² = x³ − x) = 64');
const known = {
  '11a': { 2: -2, 3: -1, 5: 1, 7: -2, 13: 4, 17: -2, 19: 0, 23: -1, 29: 0, 31: 7 },
  '37a': { 2: -2, 3: -3, 5: -2, 7: -1, 11: -5, 13: -2 },
};
for (const [key, tab] of Object.entries(known)) for (const [p, ap] of Object.entries(tab)) ok(apOf(CURVES[key].a, +p) === ap, `a_${p}(${key}) = ${ap} (got ${apOf(CURVES[key].a, +p)})`);
// brute force agrees with the square-completion count for small odd p
for (const key of Object.keys(CURVES)) {
  const [a1, a2, a3, a4, a6] = CURVES[key].a;
  for (const p of [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]) {
    let c = 1;
    for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) if ((((y * y + a1 * x * y + a3 * y - (x * x * x + a2 * x * x + a4 * x + a6)) % p) + p) % p === 0) c++;
    ok(countPoints(CURVES[key].a, p) === c, `#E(F_${p}) by two methods (${key})`);
  }
}
for (const key of Object.keys(CURVES)) {
  const d = curveData(key, 1000);
  const N = CURVES[key].N;
  ok(d.every((r) => N % r.p !== 0), `${key}: bad primes skipped`);
  ok(d.every((r) => r.ap * r.ap <= 4 * r.p), `${key}: Hasse |a_p| ≤ 2√p for all ${d.length} good p ≤ 1000`);
  const worst = d.reduce((a, r) => (Math.abs(r.ratio) > Math.abs(a.ratio) ? r : a), d[0]);
  console.log(`  ${key}: ${d.length} good primes ≤ 1000, max |a_p|/2√p = ${Math.abs(worst.ratio).toFixed(4)} at p = ${worst.p}, a_p = 0 for ${d.filter((r) => r.ap === 0).length}`);
}
{
  const d = curveData('32a', 1000);
  ok(d.filter((r) => r.p % 4 === 3).every((r) => r.ap === 0), 'CM: a_p = 0 for p ≡ 3 mod 4');
  ok(d.filter((r) => r.p % 4 === 1).every((r) => r.ap !== 0 && r.ap % 2 === 0), 'CM: a_p even and nonzero for p ≡ 1 mod 4');
}

// the spectra of X^{p,q}: every nontrivial eigenvalue tempered, multiplicities add up
for (const [p, q] of [[13, 5], [17, 5], [29, 5], [37, 5], [41, 5]]) {
  const X = L.buildX(p, q), lam = L.spectrumX(X), s = spectrumSummary(lam, p);
  ok(s.n === X.n && s.inside + s.trivial + s.outside === s.n, `counts add up (${p},${q})`);
  ok(s.outside === 0 && s.maxRatio <= 1 + 1e-9, `X^{${p},${q}} is Ramanujan: all Satake parameters on |z| = 1`);
  ok(s.trivial === (X.psl ? 1 : 2), `one-dimensional eigenvalues: ${X.psl ? 'p+1' : '±(p+1)'} (${p},${q})`);
  console.log(`  X^{${p},${q}}: n=${s.n}, distinct=${s.groups.length}, max |λ|/2√p = ${s.maxRatio.toFixed(4)}`);
}

console.log(`fig-duals: ${passes} passed, ${fails} failed (${Date.now() - t0} ms)`);
process.exit(fails ? 1 : 0);
