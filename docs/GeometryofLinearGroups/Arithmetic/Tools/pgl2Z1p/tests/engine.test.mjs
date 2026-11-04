// node tests/engine.test.mjs
import {
  Q, M, mmul, minv, mprod, primitive, toQ, projEqual, generators, power, parseWord, randomWord,
  origin, canonVertex, vertexOf, act, treeDistance, geodesicFromOrigin, normalForm, evalNormalForm,
  lambdaWord, wordMatrix, conjugateByT, randomLowerCongruence, inUpperCongruence, bdet, babs,
} from "../js/exact.js";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error("FAIL:", msg); } }

// deterministic rng
let seed = 12345;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const PRIMES = [2, 3, 5, 7, 11];

for (const p of PRIMES) {
  const G = generators(p);
  const o = origin(p);

  // ---- vertex basics
  ok(vertexOf(G.t, p).key === canonVertex(p, 0, 1).key, `t·o = ⌊0⌋_1 (p=${p})`);
  ok(vertexOf(minv(G.t), p).key === canonVertex(p, 0, -1).key, `t⁻¹·o = ⌊0⌋_-1 (p=${p})`);
  ok(vertexOf(G.J, p).key === o.key && vertexOf(G.S, p).key === o.key && vertexOf(G.R, p).key === o.key, `Λ fixes o (p=${p})`);
  // σ t σ = t⁻¹ in PGL₂ — the fold relation
  ok(projEqual(mprod(G.J, G.t, G.J), minv(G.t)), `σtσ = t⁻¹ (p=${p})`);
  ok(projEqual(mmul(G.W, G.W), M(1, 0, 0, 1)), `W_p² = 1 (p=${p})`);
  ok(projEqual(mmul(G.J, G.t), G.W), `W_p = σt (p=${p})`);
  ok(vertexOf(G.W, p).key === canonVertex(p, 0, -1).key && act(G.W, canonVertex(p, 0, -1)).key === o.key, `W_p flips [t⁻¹o, o] (p=${p})`);

  // neighbours of o are T^j t o and t^{-1} o, all at distance 1
  const nbrs = o.neighbors();
  ok(nbrs.length === p + 1, "p+1 neighbours");
  for (const v of nbrs) ok(treeDistance(o, v) === 1, `neighbour at distance 1 (p=${p}, ${v.key})`);
  for (let j = 0; j < p; j++) ok(vertexOf(mmul(power(G.T, j), G.t), p).key === o.child(j).key, `T^${j} t o = ⌊${j}⌋_1`);

  // parent/child consistency and digit()
  for (let trial = 0; trial < 50; trial++) {
    const w = parseWord(randomWord(8, rng), p).matrix;
    const v = vertexOf(w, p);
    for (let j = 0; j < p; j++) {
      const c = v.child(j);
      ok(c.parent().key === v.key, "child's parent");
      ok(c.digit() === j, "digit()");
      ok(treeDistance(v, c) === 1, "child distance 1");
    }
  }

  // ---- normal form round trips
  for (let trial = 0; trial < 300; trial++) {
    const src = randomWord(2 + Math.floor(rng() * 12), rng);
    const g = parseWord(src, p).matrix;
    const nf = normalForm(g, p);
    ok(projEqual(evalNormalForm(nf), g), `normal form reproduces g (p=${p}, ${src})`);
    ok(babs(bdet(nf.lambda)) === 1n, `λ ∈ PGL₂(ℤ) (p=${p}, ${src})`);
    // path is a geodesic: consecutive vertices adjacent, endpoints at distance e
    const tgt = vertexOf(g, p);
    ok(nf.target.key === tgt.key, `walk ends at g·o (p=${p}, ${src})`);
    ok(treeDistance(o, tgt) === nf.e, `d(o, g·o) = v_p(det) (p=${p}, ${src})`);
    // agrees with the digit expansion of q in ⌊q⌋_n
    const geo = geodesicFromOrigin(tgt);
    ok(geo.m === nf.m && geo.k === nf.k && geo.digits.join() === nf.digits.join(), `digits match ⌊q⌋_n (p=${p}, ${src})`);
    // constraint: j_1 ≠ 0 if m, k > 0
    if (nf.m > 0 && nf.k > 0) ok(nf.digits[0] !== 0, "j₁ ≠ 0");
    // uniqueness: g·λ' has the same prefix for λ' ∈ Λ
    const lp = parseWord("S T^2 R T^-1 S", p).matrix;
    const nf2 = normalForm(mmul(g, lp), p);
    ok(nf2.steps.map((s) => s.letter).join() === nf.steps.map((s) => s.letter).join(), "prefix independent of right Λ factor");
    // prefix of the word = ⌊q⌋_n
    const W = mmul(evalNormalForm(nf), minv(toQ(nf.lambda)));
    ok(projEqual(W, tgt.matrix()), `prefix word equals [[pⁿ,q],[0,1]] (p=${p}, ${src})`);
    // λ as a word in S, T, R
    const lw = lambdaWord(nf.lambda);
    ok(projEqual(wordMatrix(lw, p), toQ(nf.lambda)), `λ word (p=${p})`);
  }

  // ---- conjugation t Λ₀(p) t⁻¹ = Λ⁰(p)
  for (let trial = 0; trial < 100; trial++) {
    const g = randomLowerCongruence(p, 8, rng);
    const h = conjugateByT(g, p);
    ok(inUpperCongruence(h, p), "conjugate lies in Λ⁰(p)");
    ok(projEqual(toQ(h), mprod(G.t, toQ(g), minv(G.t))), "conjugate formula");
    // Λ₀(p) fixes o and t⁻¹o; Λ⁰(p) fixes o and t·o
    ok(act(toQ(g), canonVertex(p, 0, -1)).key === canonVertex(p, 0, -1).key, "Λ₀(p) fixes t⁻¹o");
    ok(act(toQ(h), canonVertex(p, 0, 1)).key === canonVertex(p, 0, 1).key, "Λ⁰(p) fixes t·o");
  }

  // ---- canonical reps: same vertex for q differing by pⁿℤ_p
  const v1 = canonVertex(p, new Q(4n, 15n), -1);
  ok(v1.q.cmp(0) >= 0, "canonical q ≥ 0");
}

// specific examples from the thesis figure (p general)
for (const p of [3, 5]) {
  const v = canonVertex(p, new Q(BigInt(p - 1), BigInt(p)), 0);
  ok(v.children().map((c) => c.q.toString()).join() === Array.from({ length: p }, (_, j) => new Q(BigInt(p - 1 + j * p), BigInt(p)).toString()).join(), "Fig 2.2 children of ⌊(p-1)/p⌋_0");
}

// rejects non-members
let threw = false;
try { normalForm(M(1, 1, 1, 3), 2); } catch { threw = true; }   // det 2
ok(!threw, "det-2 matrix is in PGL₂(ℤ[1/2])");
threw = false;
try { normalForm(M(1, 0, 0, 3), 2); } catch { threw = true; }
ok(threw, "diag(1,3) rejected for p = 2");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
