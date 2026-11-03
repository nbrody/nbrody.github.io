// node tests/lps.test.mjs  — checks js/lps.js against the paper's statements
// and against the independent Python checks in notes/checks/.
import * as L from '../js/lps.js';

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; console.log('FAIL', msg); }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const t0 = Date.now();

// (1.2) and §2: p+1 generators, conjugate pairs, Jacobi
for (const p of [5, 13, 17, 29, 37, 41, 53, 61]) {
  const S = L.generators(p);
  ok(S.length === p + 1, `|S| = p+1 for p=${p}`);
  ok(L.allFourSquares(p).length === 8 * (p + 1), `8(p+1) solutions for p=${p}`);
  ok(L.jacobiR4(p) === 8 * (p + 1), `Jacobi r4(${p})`);
  const inv = L.inverseIndex(S);
  ok(inv.every((j, i) => j >= 0 && inv[j] === i && (j === i + 1 || j === i - 1)), `pairs adjacent p=${p}`);
  for (const q of [5, 13, 17, 29]) {
    if (q === p) continue;
    const I = L.sqrtMinusOne(q);
    for (let s = 0; s < S.length; s++) {
      const [a, b, c, d] = L.quatToMatrix(S[s], q, I);
      ok(((a * d - b * c) % q + q) % q === p % q, `det = p mod q (p=${p}, q=${q})`);
      const [e, f, g, h] = L.quatToMatrix(S[inv[s]], q, I);
      // product with the conjugate is the scalar p
      const m = [(a * e + b * g) % q, (a * f + b * h) % q, (c * e + d * g) % q, (c * f + d * h) % q];
      ok(m[1] === 0 && m[2] === 0 && m[0] === m[3] && m[0] === p % q, `conj = inverse (p=${p}, q=${q})`);
    }
  }
}

// Lemma 3.1 / Corollary 3.2: factor random reduced words; exactly one generator divides each time
for (const p of [5, 13, 17]) {
  const S = L.generators(p), inv = L.inverseIndex(S);
  let seed = 7;
  const rnd = (m) => (seed = (seed * 1103515245 + 12345) % 2147483648) % m;
  for (let trial = 0; trial < 200; trial++) {
    const len = 1 + rnd(p === 5 ? 18 : 10);
    const word = [];
    while (word.length < len) {
      const s = rnd(S.length);
      if (word.length && inv[s] === word[word.length - 1]) continue;
      word.push(s);
    }
    const a = L.wordToQuaternion(word, S);
    const f = L.factorQuaternion(a, p, S);
    ok(f && f.r === 0 && f.sign === 1 && f.word.join() === word.join(), `factor word p=${p} len=${len}`);
    ok(f && f.steps.every((c) => c === 1), `unique divisor each step p=${p}`);
    const f2 = L.factorQuaternion(a.map((x) => -p * x), p, S);
    ok(f2 && f2.r === 1 && f2.sign === -1 && f2.word.join() === word.join(), `factor ±p·word p=${p}`);
  }
  // every α ≡ 1 (2) with N(α) = p^k factors (count matches Lemma 3.1's count)
  const k = 2, N = p ** k, b = L.isqrt(N);
  let count = 0, good = 0;
  for (let a0 = -b; a0 <= b; a0++) for (let a1 = -b; a1 <= b; a1 += 1) for (let a2 = -b; a2 <= b; a2++) {
    const r = N - a0 * a0 - a1 * a1 - a2 * a2;
    if (r < 0) continue;
    const a3 = L.isqrt(r);
    if (a3 * a3 !== r) continue;
    for (const s3 of a3 ? [a3, -a3] : [0]) {
      const al = [a0, a1, a2, s3];
      if (a0 % 2 === 0 || a1 % 2 || a2 % 2 || s3 % 2) continue;
      count++;
      if (L.factorQuaternion(al, p, S)) good++;
    }
  }
  // ±(reduced words of length 2) ∪ ±p : 2((p+1)p + 1)
  ok(count === 2 * ((p + 1) * p + 1) && good === count, `all α≡1(2) of norm p² factor, p=${p}: ${good}/${count}`);
}

// X^{p,q}: order, bipartite, Ramanujan, girth, (4.15)
const python = { // from notes/checks (independent Python implementation)
  '13,5': { lam: 4.0, girth: 4, rq: [2, 0, 2, 0, 830, 0, 176718] },
  '5,13': { lam: 4.249721, girth: 8, rq: [2, 0, 2, 0, 2, 0, 2] },
  '17,13': { lam: 7.850855, girth: 3, rq: [2, 0, 2, 12, 98, 2604, 46286] },
};
for (const [key, ref] of Object.entries(python)) {
  const [p, q] = key.split(',').map(Number);
  const X = L.buildX(p, q);
  ok(X.n === L.orderX(p, q), `|X| (${key}) = ${X.n}`);
  ok(L.isBipartite(X) === (L.legendre(p, q) === -1), `bipartite iff (p/q) = -1 (${key})`);
  const t1 = Date.now();
  const lam = L.spectrumX(X);
  const ms = Date.now() - t1;
  ok(near(lam[0], p + 1, 1e-9), `top eigenvalue p+1 (${key})`);
  ok(near(L.lambdaX(lam, p + 1), ref.lam, 1e-5), `λ(X) = ${L.lambdaX(lam, p + 1).toFixed(6)} (${key}, ${ms} ms)`);
  ok(L.lambdaX(lam, p + 1) <= 2 * Math.sqrt(p) + 1e-9, `Ramanujan (${key})`);
  const g = L.girth(X);
  ok(g.girth === ref.girth, `girth ${g.girth} (${key})`);
  ok(g.girth >= L.girthBound(p, q), `girth ≥ Theorem 3.4 bound (${key})`);
  const M = (() => { // the girth word is a scalar matrix mod q
    let m = [1, 0, 0, 1];
    for (const s of g.word) {
      const [a, b, c, d] = X.mats[s];
      m = [(m[0] * a + m[1] * c) % q, (m[0] * b + m[1] * d) % q, (m[2] * a + m[3] * c) % q, (m[2] * b + m[3] * d) % q];
    }
    return m;
  })();
  ok(M[1] === 0 && M[2] === 0 && M[0] === M[3], `girth word is scalar mod q (${key})`);
  for (let t = 0; t < ref.rq.length; t++) {
    const r = L.rQ(p ** t, q);
    ok(r === ref.rq[t], `rQ(${p}^${t}) = ${r} (${key})`);
    ok(near(L.spectralSide(lam, t, p), r, 1e-7), `(4.15) at t=${t} (${key}): ${L.spectralSide(lam, t, p)} vs ${r}`);
  }
  const sph = L.sphereSizes(X);
  ok(sph.reduce((a, b) => a + b, 0) === X.n, `spheres cover X (${key})`);
  ok(sph.length - 1 <= L.diameterBound(p, X.n), `diameter ${sph.length - 1} ≤ ${L.diameterBound(p, X.n).toFixed(2)} (${key})`);
  // Proposition 4.3 / (4.4): moments equal tree closed walks below the girth
  const rho = L.treeClosedWalks(p + 1, 12);
  for (let l = 0; l < Math.min(12, g.girth); l++) {
    let m = 0;
    for (const x of lam) m += x ** l;
    ok(near(m / lam.length, rho[l], 1e-8), `moment ${l} = ρ(${l}) (${key})`);
  }
}

// rQ against the Python table, and the main term (1.5)
const rqRef = { '13,17': [[6, 4418], [7, 53088]], '5,29': [[9, 432], [10, 2162], [11, 11136]], '29,5': [[4, 24506], [5, 710400]] };
for (const [key, rows] of Object.entries(rqRef)) {
  const [p, q] = key.split(',').map(Number);
  for (const [k, r] of rows) {
    ok(L.rQ(p ** k, q) === r, `rQ(${p}^${k}) = ${r} for q=${q}`);
    ok(Math.abs(r - L.mainTerm(p, q, k)) <= p ** (k / 2), `|r − C| ≤ p^{k/2} at (${key}), k=${k}`);
  }
}

// Kesten: the density has the tree's moments
for (const k of [6, 14, 18]) {
  const rho = L.treeClosedWalks(k, 8), R = 2 * Math.sqrt(k - 1), N = 200000;
  for (const l of [0, 2, 4, 6]) {
    let s = 0;
    for (let i = 0; i < N; i++) { const t = -R + (2 * R * (i + 0.5)) / N; s += t ** l * L.kestenDensity(t, k); }
    s *= (2 * R) / N;
    ok(near(s, rho[l], 2e-3), `Kesten moment ${l}, k=${k}: ${s.toFixed(3)} vs ${rho[l]}`);
  }
}

// Y^{p,q}: Theorem 4.4
for (const [p, q] of [[5, 13], [5, 29], [13, 17], [17, 13], [29, 37], [5, 101]]) {
  const Y = L.buildY(p, q);
  const lam = L.symEigenvalues(L.denseAdjacency(Y), Y.n);
  ok(Y.n === q + 1 && near(lam[0], p + 1, 1e-9), `Y order and top eigenvalue (${p},${q})`);
  ok(lam[Y.n - 1] > -(p + 1) + 1e-6, `−(p+1) not an eigenvalue of Y (${p},${q})`);
  ok(L.lambdaX(lam, p + 1) <= 2 * Math.sqrt(p) + 1e-9, `Y Ramanujan (${p},${q}): ${L.lambdaX(lam, p + 1).toFixed(4)}`);
}

// Proposition 5.2 on a PSL case
{
  const X = L.buildX(5, 29);
  ok(X.n === 12180 && !L.isBipartite(X), 'X^{5,29} order 12180, not bipartite');
  const sz = L.greedyIndependentSet(X);
  ok(sz <= (2 * Math.sqrt(5) / 6) * X.n, `greedy independent set ${sz} ≤ Alon bound ${(2 * Math.sqrt(5) / 6 * X.n).toFixed(0)}`);
  const sph = L.sphereSizes(X);
  ok(sph.length - 1 <= L.diameterBound(5, X.n), `diam X^{5,29} = ${sph.length - 1} ≤ ${L.diameterBound(5, X.n).toFixed(2)}`);
  const g = L.girth(X);
  ok(g.girth >= L.girthBound(5, 29), `girth X^{5,29} = ${g.girth} ≥ ${L.girthBound(5, 29).toFixed(2)}`);
}

console.log(`${passes} passed, ${fails} failed in ${Date.now() - t0} ms`);
process.exit(fails ? 1 : 0);
