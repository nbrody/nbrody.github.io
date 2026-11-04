// node tests/fig-singular.test.mjs — the math behind Figure S3 (the singular series).
import * as L from '../js/lps.js';
import {
  FORMS, makeForm, countsUpTo, localDensity, countDensity, mainC, mainTermParts, seriesPartials,
  spikeValue, cuspG, cusps, countingData, factor, spfSieve,
} from '../js/fig-singular.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const t0 = Date.now();

// counts by convolution agree with lps.rQ and with Jacobi
{
  const r4 = countsUpTo(FORMS.four, 600);
  for (let n = 1; n <= 600; n++) ok(r4[n] === L.jacobiR4(n), `r4 counts n=${n}`);
  for (const q of [5, 13]) {
    const f = makeForm(q), r = countsUpTo(f, 5000);
    for (let n = 0; n <= 5000; n += 7) ok(r[n] === L.rQ(n, q), `rQ counts q=${q} n=${n}`);
  }
}

// four squares: the singular series is exact (no cusp forms on Γ0(4)): C(n) = r4(n), Jacobi
for (let n = 1; n <= 500; n++) ok(close(mainC(FORMS.four, n), L.jacobiR4(n), 1e-9), `Jacobi n=${n}: C=${mainC(FORMS.four, n)} r4=${L.jacobiR4(n)}`);

// LPS form: Siegel's main term is the paper's C(p^k) = 4σ(p^k)/(q(q²−1)) or 0  (4.19)–(4.20)
let mainChecks = 0;
for (const q of [5, 13, 17]) {
  const f = makeForm(q);
  for (const p of [5, 13, 17, 29, 37]) {
    if (p === q) continue;
    for (let k = 0; k <= 4; k++) {
      const n = p ** k, C = mainC(f, n), M = L.mainTerm(p, q, k);
      ok(close(C, M, 1e-9), `C(${p}^${k}) q=${q}: siegel ${C} vs paper ${M}`);
      mainChecks++;
    }
  }
}

// closed-form local densities match counting mod ℓ^k once k is large enough
{
  const cases = [];
  for (let n = 1; n <= 200; n++) cases.push([FORMS.four, n, 2, Math.min(9, Math.max(3, Math.floor(Math.log2(n)) + 4))]);
  for (const q of [5, 13]) {
    const f = makeForm(q);
    for (let n = 1; n <= 160; n++) {
      cases.push([f, n, 2, Math.min(9, Math.max(3, Math.floor(Math.log2(n)) + 4))]);
      const v = (() => { let m = n, v = 0; while (m % q === 0) { m /= q; v++; } return v; })();
      const k = v + 2;
      if (q ** k <= 3200) cases.push([f, n, q, k]);
    }
    // good primes too
    for (const [n, l, k] of [[9, 3, 3], [27, 3, 4], [7, 7, 2], [49, 7, 3], [21, 3, 2], [11, 11, 2]]) cases.push([f, n, l, k]);
  }
  for (const [f, n, l, k] of cases) {
    const a = localDensity(f, n, l), b = countDensity(f, n, l, k);
    ok(close(a, b, 1e-9), `δ_${l}(${n}) form ${f.key}: closed ${a} vs count mod ${l}^${k} ${b}`);
  }
}

// partial sums of the singular series approach the Euler product
// (n with a high power of q needs m up to q^{v+2}, so those are left out)
for (const [f, n] of [[FORMS.four, 1], [FORMS.four, 7], [FORMS.four, 12], [FORMS.q5, 13], [FORMS.q5, 29], [FORMS.q5, 169], [FORMS.q13, 17], [FORMS.q13, 29]]) {
  const parts = mainTermParts(f, n);
  const s = seriesPartials(f, n, 400);
  const err400 = Math.abs(s[400] - parts.series), err4 = Math.abs(s[4] - parts.series);
  ok(err400 < 0.03 * parts.series + 0.06, `Σ A_m(${n}) form ${f.key}: ${s[400]} → ${parts.series}`);
  ok(err400 <= err4 + 1e-9, `partial sums improve, form ${f.key} n=${n}`);
}

// the cusp prediction: 4√det y²|θ_Q(a/m + iy)| → |G(a/m)| as y → 0
for (const [f, y] of [[FORMS.four, 1e-4], [FORMS.q5, 4e-6], [FORMS.q13, 4e-7]]) {
  for (const c of cusps(f, 4)) {
    const v = spikeValue(f, c.x, y);
    ok(Math.abs(v - c.G) < 0.03, `spike ${c.a}/${c.m} form ${f.key}: ${v} vs |G| ${c.G}`);
  }
}
// at 0 the singularity has height exactly 1 in these units; four squares: no singularity at 1/2
ok(Math.abs(Math.hypot(...cuspG(FORMS.four, 0, 1)) - 1) < 1e-12, 'G(0/1) = 1');
ok(Math.hypot(...cuspG(FORMS.four, 1, 2)) < 1e-12, 'G(1/2) = 0 for four squares');
ok(Math.hypot(...cuspG(FORMS.four, 1, 6)) < 1e-12, 'G(1/6) = 0 for four squares (m ≡ 2 mod 4)');

// the remainder is a cusp form's coefficients: bounded by c·d(n)√n; zero where C(n) = 0
const report = {};
for (const key of ['q5', 'q13', 'q17']) {
  const f = FORMS[key], d = countingData(f, f.N);
  let zeroOK = true, localObs = 0;
  for (let n = 1; n <= d.N; n++) if (d.C[n] === 0) { localObs++; if (d.r[n] !== 0) zeroOK = false; }
  ok(zeroOK, `C(n)=0 ⇒ r_Q(n)=0 (${key})`);
  ok(d.maxNorm < 3, `remainder bounded (${key}): max |b|/(d√n) = ${d.maxNorm} at n=${d.maxAt}`);
  // and it is genuinely nonzero (there are cusp forms at level 16q²)
  let nz = 0;
  for (let n = 1; n <= d.N; n++) if (d.b[n] !== 0) nz++;
  ok(nz > 0, `remainder not identically zero (${key})`);
  // compare sizes at the top of the range
  let maxC = 0;
  for (let n = 1; n <= d.N; n++) maxC = Math.max(maxC, d.C[n]);
  let tail = 0;
  for (let n = 100; n <= d.N; n++) tail = Math.max(tail, Math.abs(d.bn[n]));
  report[key] = { N: d.N, maxNorm: +d.maxNorm.toFixed(4), maxNormFrom100: +tail.toFixed(4), maxAt: d.maxAt, maxAbsB: +d.maxAbsB.toFixed(2), maxC: +maxC.toFixed(1), localObstructions: localObs, nonzeroRemainder: nz };
}
{
  const d = countingData(FORMS.four, 1500);
  ok(d.maxAbsB === 0, `four squares remainder ≡ 0 up to 1500 (max ${d.maxAbsB})`);
}

console.log(JSON.stringify(report));
console.log(`fig-singular: ${passes} passed, ${fails} failed  (${mainChecks} main-term checks; ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
