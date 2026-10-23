// node tests/run.mjs — checks every arithmetic claim the page relies on.
import * as O from "../js/octavian.js";
import * as L from "../js/lattice.js";
import * as F from "../js/factor.js";
import * as G from "../js/g2.js";
import * as GG from "../js/g2group.js";
import { LINES, productOf, e8Projection } from "../js/fanoE8.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); }
}
// deterministic RNG so failures reproduce
let seed = 12345;
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

console.log("Octavian order");
{
  const U = L.vectorsOfNorm(O.O_BASIS, 1n, 1n);
  check("240 units", U.length === 240);
  let closed = true;
  for (const a of O.O_BASIS) for (const b of O.O_BASIS) if (!O.isValid(O.mul(a, b))) closed = false;
  check("closed under multiplication", closed);
  let alt = true, comp = true;
  for (let t = 0; t < 200; t++) {
    const x = U[Math.floor(rng() * 240)], y = U[Math.floor(rng() * 240)];
    const z = O.add(x, O.scale(2n, y));
    if (!O.equals(O.mul(O.mul(z, z), y), O.mul(z, O.mul(z, y)))) alt = false;
    if (O.norm(O.mul(z, y)) !== O.norm(z) * O.norm(y)) comp = false;
  }
  check("alternative (z z) y = z (z y)", alt);
  check("norm is multiplicative", comp);
  check("Hurwitz units ½(1+e1+e2+e4) ∈ O", O.isValid(O.parse("(1+e1+e2+e4)/2")));
  for (const p of [2n, 3n, 5n, 7n]) check(`240(p³+1) primes of norm ${p}`, L.vectorsOfNorm(O.O_BASIS, p, 1n).length === Number(240n * (p ** 3n + 1n)));
  check("parse coordinate list", O.equals(O.parse("1/2, 1/2, 1/2, 0, 1/2, 0, 0, 0"), O.parse("½(1+e1+e2+e4)")));
  check("parse rejects non-octavian", (() => { try { O.parse("(1+e3+e5+e7)/2"); return false; } catch (e) { return true; } })());
}

console.log("Divisors = minimal vectors of αO + mO");
{
  const P3 = L.vectorsOfNorm(O.O_BASIS, 3n, 1n);
  for (let t = 0; t < 4; t++) {
    const a = F.randomPrimitive([3n, 5n, 7n], rng);
    for (const m of [3n, 5n, 7n, 15n, 21n, 35n]) {
      const ld = F.leftDivisors(a, m), rd = F.rightDivisors(a, m);
      const okL = ld.length === 240 && ld.every((b) => F.leftDivides(b, a));
      const okR = rd.length === 240 && rd.every((b) => F.rightDivides(b, a));
      if (!okL || !okR) check(`divisors of norm ${m}`, false, `${ld.length}/${rd.length}`);
      const nPrim = rd.filter(O.isPrimary).length;
      if (nPrim !== 1) check(`unique primary right divisor of norm ${m}`, false, String(nPrim));
    }
    // brute force: every prime of norm 3 dividing a on the left is in the lattice list
    const brute = P3.filter((b) => F.leftDivides(b, a)).map(O.key).sort();
    const lat = F.leftDivisors(a, 3n).map(O.key).sort();
    check(`brute-force left divisors of norm 3 agree (trial ${t + 1})`, brute.join("|") === lat.join("|"));
  }
  const a = F.randomPrimitive([3n, 3n, 5n], rng);
  check("prime power: 240 divisors of norm 9 and one primary", F.rightDivisors(a, 9n).length === 240 && F.rightDivisors(a, 9n).filter(O.isPrimary).length === 1);
}

console.log("Factorization along orderings and bracketings");
{
  const primes = [3n, 5n, 7n, 11n, 3n];
  const a = F.randomPrimitive(primes, rng);
  let allOk = true;
  const seen = new Set();
  for (const tree of [F.leftComb(5), F.rightComb(5), F.balanced(5), F.randomTree(5), F.randomTree(5)]) {
    const ft = F.normalizeSigns(F.factorize(a, primes, tree));
    if (!O.equals(F.evaluate(ft), a)) allOk = false;
    const vals = F.leafValues(ft);
    if (!vals.every((v, i) => O.norm(v) === primes[i])) allOk = false;
    if (!vals.slice(1).every(O.isPrimary)) allOk = false;
    seen.add(vals.map(O.key).join("|"));
  }
  check("every bracketing reproduces α, leaves 2..k primary", allOk);
  check("different bracketings give different factors", seen.size > 1);
  // 240^{k-1}: enumerate all metamigrations for k = 3
  const pr = [3n, 5n, 7n];
  const c = F.randomPrimitive(pr, rng);
  for (const tree of [F.leftComb(3), F.rightComb(3)]) {
    const paths = F.internalNodes(F.factorize(c, pr, tree)).map((n) => n.path);
    const s = new Set();
    let ok = true;
    for (let i = 0; i < 240; i++) for (let j = 0; j < 240; j++) {
      const ft = F.factorize(c, pr, tree, { [paths[0]]: i, [paths[1]]: j });
      if (!O.equals(F.evaluate(ft), c)) ok = false;
      s.add(F.leafValues(ft).map(O.key).join("|"));
    }
    check(`240² distinct factorizations for ${F.treeToString(tree)}`, ok && s.size === 57600, String(s.size));
  }
  // norm with a factor 2
  const b = F.randomPrimitive([2n, 3n, 5n], rng);
  const fb = F.factorize(b, [2n, 3n, 5n], F.balanced(3));
  check("factor of norm 2 handled", O.equals(F.evaluate(fb), b));
  // big primes
  const big = [1000003n, 999983n, 7n];
  const g = F.randomPrimitive(big, rng);
  check("seven-digit primes", O.equals(F.evaluate(F.factorize(g, big, F.rightComb(3))), g));
}

console.log("Non-associativity phenomena");
{
  let notTrans = 0, total = 0, latDiff = 0;
  for (let t = 0; t < 40; t++) {
    const pr = [3n, 5n, 7n];
    const a = F.randomPrimitive(pr, rng);
    const ft = F.factorize(a, pr, F.leftComb(3));
    const pi1 = F.leafValues(ft)[0];
    total++;
    if (!F.leftDivides(pi1, a)) notTrans++;
    const x = F.randomPrime(3n, rng), y = F.randomPrime(5n, rng);
    const xyO = L.hnf(O.O_BASIS.map((e) => O.mul(O.mul(x, y), e)));
    const x_yO = L.hnf(O.O_BASIS.map((e) => O.mul(x, O.mul(y, e))));
    if (!L.sameLattice(xyO, x_yO)) latDiff++;
  }
  check(`left divisibility not transitive (${notTrans}/${total} first factors fail to divide α)`, notTrans > total / 2);
  check(`x(yO) ≠ (xy)O (${latDiff}/40)`, latDiff === 40);
  // Moufang transport: (uα)(Ou) = u(αO)u
  let mouf = true;
  for (let t = 0; t < 10; t++) {
    const u = F.randomPrime(5n, rng), a = F.randomPrimitive([3n, 7n], rng);
    const lhs = L.hnf(O.O_BASIS.flatMap((e) => O.O_BASIS.slice(0, 2).map(() => O.mul(O.mul(u, a), O.mul(e, u)))));
    const rhs = L.hnf(O.O_BASIS.map((e) => O.mul(O.mul(u, O.mul(a, e)), u)));
    if (!L.sameLattice(lhs, rhs)) mouf = false;
  }
  check("Moufang transport (uα)(Ou) = u(αO)u", mouf);
  // Hurwitz comparison: same factors for every bracketing
  F.setRing("H");
  const q = F.randomPrimitive([3n, 5n, 7n, 11n], rng);
  const facs = [F.leftComb(4), F.rightComb(4), F.balanced(4)].map((t) => F.leafValues(F.normalizeSigns(F.factorize(q, [3n, 5n, 7n, 11n], t))).map(O.key).join("|"));
  check("in ℍ the factorization is independent of bracketing", new Set(facs).size === 1);
  F.setRing("O");
  const facsO = [F.leftComb(4), F.rightComb(4), F.balanced(4)].map((t) => F.leafValues(F.normalizeSigns(F.factorize(q, [3n, 5n, 7n, 11n], t))).map(O.key).join("|"));
  check("…and the octavian factorization of a quaternion agrees with it", new Set(facsO).size === 1 && facsO[0] === facs[0]);
}

console.log("Primary primes and the spread mod p");
{
  for (const p of [3n, 5n]) {
    const all = L.vectorsOfNorm(O.O_BASIS, p, 1n);
    const prim = all.filter(O.isPrimary);
    check(`p³+1 primary primes of norm ${p}`, prim.length === Number(p ** 3n + 1n));
    const U = L.vectorsOfNorm(O.O_BASIS, 1n, 1n);
    const cover = new Set();
    let sum = 0;
    for (const pi of prim) for (const e of U) { cover.add(O.key(O.mul(e, pi))); sum++; }
    check(`unit orbits of primary primes partition the primes of norm ${p}`, cover.size === all.length && sum === all.length);
    // the solids Oπ mod p partition the nonzero isotropic vectors mod p
    const P = Number(p), vecs = new Set();
    let count = 0;
    for (const pi of prim) {
      const sol = L.rightLattice(pi, p);
      // enumerate solid = (Oπ + pO)/pO: combinations of the HNF rows mod p, reduced in O-basis coords
      const rowsMod = sol.map((r) => G.reduceModP(r, P));
      const basis = [];
      for (const r of rowsMod) { if (r.some((x) => x)) basis.push(r); }
      // row-reduce mod p to a 4-dim basis
      const red = [];
      for (const r of basis) {
        let v = r.slice();
        for (const b of red) { const piv = b.findIndex((x) => x); if (v[piv]) { const f = v[piv]; v = v.map((x, i) => (((x - f * b[i]) % P) + P) % P); } }
        const piv = v.findIndex((x) => x);
        if (piv >= 0) { const inv = modInv(v[piv], P); v = v.map((x) => (x * inv) % P); red.forEach((b, j) => { if (b[piv]) { const f = b[piv]; red[j] = b.map((x, i) => (((x - f * v[i]) % P) + P) % P); } }); red.push(v); }
      }
      if (red.length !== 4) { check("solid has dimension 4", false, String(red.length)); break; }
      for (let c = 1; c < P ** 4; c++) {
        let m = c; const coef = [];
        for (let i = 0; i < 4; i++) { coef.push(m % P); m = Math.floor(m / P); }
        const v = new Array(8).fill(0).map((_, k) => coef.reduce((s, x, i) => s + x * red[i][k], 0) % P);
        vecs.add(v.join(","));
        count++;
      }
    }
    check(`solids Oπ/pO (π primary) partition the ${(p ** 4n - 1n) * (p ** 3n + 1n)} nonzero isotropic vectors mod ${p}`, vecs.size === count && count === Number((p ** 4n - 1n) * (p ** 3n + 1n)));
  }
}
function modInv(a, p) { for (let x = 1; x < p; x++) if ((a * x) % p === 1) return x; return 0; }

console.log("G₂ buildings");
{
  for (const p of [2, 3, 5]) {
    const H = G.cayleyHexagon(p);
    const n = Number(G.hexagonSize(p));
    const lv = G.hexagonLevels(H);
    const sizes = [];
    for (const v of lv.level.values()) sizes[v] = (sizes[v] || 0) + 1;
    const expect = [1, p + 1, p * (p + 1), p ** 2 * (p + 1), p ** 3 * (p + 1), p ** 4 * (p + 1), p ** 5];
    check(`H(${p}): ${n} points, ${n} lines, ${p + 1} per point/line, distance layers ${expect.join(",")}`,
      H.points.length === n && H.lines.length === n && H.pointLines.every((l) => l.length === p + 1) && H.lines.every((l) => l.length === p + 1) && sizes.join() === expect.join());
  }
  check("hyperspecial counts p=2: 126 short, 2016 long", G.hyperspecialCount(2, 1, 0) === 126n && G.hyperspecialCount(2, 0, 1) === 2016n);
  check("positions via Weyl group", G.position([3, -1]).join() === "1,1" && G.position([-2, -2]).join() === "0,2" && G.position([0, 2]).join() === "2,0");
  // trace classes of isotropic points (orbit sizes of G₂(F_p))
  for (const p of [2, 3]) {
    let t0 = 0, t1 = 0;
    const x = new Array(8).fill(0);
    for (let n = 1; n < p ** 8; n++) {
      let m = n;
      for (let i = 0; i < 8; i++) { x[i] = m % p; m = Math.floor(m / p); }
      if (G.normModP(x, p)) continue;
      if (G.traceModP(x, p)) t1++; else t0++;
    }
    check(`p=${p}: ${(p ** 6 - 1) / (p - 1)} trace-zero and ${p ** 3 * (p ** 3 + 1)} idempotent points`, t0 / (p - 1) === (p ** 6 - 1) / (p - 1) && t1 / (p - 1) === p ** 3 * (p ** 3 + 1));
  }
}

console.log("G₂(ℤ[1/N]) = Aut(𝕆[1/N])");
{
  const isos = GG.isoTo(GG.O_LAT, { all: true, fixFirst: true });
  check("96 automorphisms of 𝕆 with g(e₁) fixed (|Aut 𝕆| = 126·96 = 12096 = |G₂(𝔽₂)|)", isos.length === 96 && isos.every(GG.isAutomorphism));
  for (const p of [2n, 3n, 5n, 7n, 11n]) {
    const P = GG.basicPrimes(p, rng);
    const vs = GG.gVertex(P.s), vl = GG.gVertex(P.l);
    check(`p=${p}: short and long G₂-primes are automorphisms, supported at p, at positions ω_s and ω_ℓ, onto maximal orders`,
      GG.isAutomorphism(P.s) && GG.isAutomorphism(P.l) && GG.supportOf(P.s).join() === String(p) && GG.supportOf(P.l).join() === String(p) &&
      GG.positionAt(GG.O_LAT, vs, p).join() === "1,0" && GG.positionAt(GG.O_LAT, vl, p).join() === "0,1" && GG.isOrder(vs) && GG.isOrder(vl));
  }
  // the Aut(𝕆)-orbit of one short neighbour at 2 is all p + … + p⁶ = 126 of them
  const P2 = GG.basicPrimes(2n, rng).s;
  const seen = new Set();
  for (let n = 0; n < 3000 && seen.size < 127; n++) seen.add(GG.latKey(GG.gVertex(GG.gCompose(GG.randomAut(rng), P2))));
  check(`Aut(𝕆) moves one short neighbour at 2 onto exactly 126 = 2+4+…+64 maximal orders`, seen.size === 126, String(seen.size));
  // random element, all orderings
  const targets = [{ p: 2n, a: 1, b: 1 }, { p: 3n, a: 2, b: 0 }, { p: 5n, a: 0, b: 1 }];
  const g = GG.randomG2(targets, rng);
  check("random g has the requested positions", JSON.stringify(GG.positions(g, [2n, 3n, 5n])) === "[[1,1],[2,0],[0,1]]" && GG.isAutomorphism(g));
  const base = [{ p: 2n, kind: "s" }, { p: 2n, kind: "l" }, { p: 3n, kind: "s" }, { p: 3n, kind: "s" }, { p: 5n, kind: "l" }];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map((r) => [x, ...r])));
  const seenOrd = new Set(), box = new Map();
  let prodOk = true, stepOk = true, boxOk = true, nOrd = 0;
  for (const pm of perms([0, 1, 2, 3, 4])) {
    const ord = pm.map((i) => base[i]);
    const k = ord.map((s) => s.p + s.kind).join();
    if (seenOrd.has(k)) continue;
    seenOrd.add(k); nOrd++;
    const fz = GG.factorG2(g, ord);
    if (!GG.gEquals(GG.gCompose(GG.multiply(fz.factors.map((f) => f.h)), fz.unit), g)) prodOk = false;
    for (const f of fz.factors) if (GG.positionAt(GG.O_LAT, f.vertex, f.p).join() !== (f.kind === "s" ? "1,0" : "0,1")) stepOk = false;
    const cnt = {};
    fz.vertices.forEach((V, j) => {
      if (j) cnt[ord[j - 1].p + ord[j - 1].kind] = (cnt[ord[j - 1].p + ord[j - 1].kind] || 0) + 1;
      const key = JSON.stringify(Object.entries(cnt).sort());
      if (box.has(key) && box.get(key) !== GG.latKey(V)) boxOk = false;
      box.set(key, GG.latKey(V));
    });
  }
  check(`all ${nOrd} orderings: h₁⋯h_m·u = g with every hᵢ a single step`, prodOk && stepOk && nOrd === 60);
  check(`the box is canonical: the same maximal order at each of its ${box.size} vertices for every ordering`, boxOk && box.size === 24);
  const r = GG.parseTriple("e1", "(3e2+4e4)/5", "e3");
  check("hand-entered rotation by (3+4i)/5 is one short step at 5", GG.supportOf(r).join() === "5" && GG.positions(r, [5n])[0].join() === "1,0");
}

console.log("Fano plane and E₈");
{
  let ok = true;
  for (const [a, b, c] of LINES) {
    const t = productOf(a, b), u = productOf(b, c), v = productOf(c, a);
    if (!(t.sign === 1 && t.k === c && u.sign === 1 && u.k === a && v.sign === 1 && v.k === b)) ok = false;
    if (productOf(b, a).sign !== -1) ok = false;
  }
  check("the 7 Fano lines (a, a+1, a+3) are the multiplication triples, anticommuting", ok);
  const E = e8Projection();
  const rings = new Map();
  for (const [x, y] of E.xy) { const k = Math.hypot(x, y).toFixed(4); rings.set(k, (rings.get(k) || 0) + 1); }
  check("E₈: 240 roots, 6720 edges, 8 rings of 30 in the Coxeter plane", E.units.length === 240 && E.edges.length === 6720 && rings.size === 8 && [...rings.values()].every((n) => n === 30));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
