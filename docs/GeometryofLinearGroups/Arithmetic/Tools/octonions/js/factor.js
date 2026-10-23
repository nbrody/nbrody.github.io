// Factorization of primitive octavians along a prescribed prime ordering and bracketing.
//
// Theorem (Conway–Smith §10, Rehm 1993).  Let α be a primitive octavian with
// N(α) = p₁p₂⋯p_k (primes in any order, repeats allowed) and fix a bracketing T of a
// k-fold product.  Then α has exactly 240^{k−1} factorizations α = [π₁π₂⋯π_k]_T with
// N(π_i) = p_i.  At each internal node a product x of norm m·n splits as x = βγ with
// N(β) = m, N(γ) = n in exactly 240 ways: γ runs over the minimal vectors of Ox + nO.
//
// Normalization ("primary", after Rehm): at every node take the right factor γ ≡ 1 mod 2O
// with first nonzero coordinate positive — unique when n is odd.  Then every leaf except
// the first is ≡ 1 mod 2 (primary up to sign) and the unit sits in the first leaf.
// Other choices at a node are the "metamigrations" of that node, indexed 0..239.

import * as O from "./octavian.js";
import { vectorsOfNorm, leftLattice, rightLattice, H_BASIS, inHurwitz } from "./lattice.js";
export { inHurwitz };

// The ring we factor in: the octavians O (240 units) or, for comparison, the Hurwitz
// quaternions H ⊂ O on ⟨1, e1, e2, e4⟩ (24 units, associative).
let RING = "O";
export function setRing(r) { RING = r === "H" ? "H" : "O"; }
export const getRing = () => RING;
const ringBasis = () => (RING === "H" ? H_BASIS : O.O_BASIS);
export const unitCount = () => (RING === "H" ? 24 : 240);

// ---------------------------------------------------------------------------------------
// Integer factorization (BigInt): trial division, then Miller–Rabin + Pollard–Brent rho.

const SMALL_PRIMES = (() => {
  const s = [], sieve = new Uint8Array(20000);
  for (let i = 2; i < 20000; i++) if (!sieve[i]) { s.push(BigInt(i)); for (let j = i * i; j < 20000; j += i) sieve[j] = 1; }
  return s;
})();

function modpow(b, e, m) {
  let r = 1n; b %= m;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
export function isProbablePrime(n) {
  n = BigInt(n);
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES.slice(0, 50)) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, s = 0;
  while (!(d & 1n)) { d >>= 1n; s++; }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]) {
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let r = 1; r < s; r++) { x = (x * x) % n; if (x === n - 1n) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}
function rho(n) {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 50n; c++) {
    let y = 2n, x = 2n, g = 1n, q = 1n, ys = 2n, r = 1n;
    const f = (v) => (v * v + c) % n;
    do {
      x = y;
      for (let i = 0n; i < r; i++) y = f(y);
      let k = 0n;
      do {
        ys = y;
        for (let i = 0n; i < 64n && i < r - k; i++) { y = f(y); q = (q * O.abs(x - y)) % n; }
        g = O.gcd(q, n);
        k += 64n;
      } while (k < r && g === 1n);
      r *= 2n;
    } while (g === 1n && r < 1n << 22n);
    if (g === n) {
      do { ys = f(ys); g = O.gcd(O.abs(x - ys), n); } while (g === 1n);
    }
    if (g !== n && g !== 1n) return g;
  }
  throw new Error("could not factor " + n);
}
// Returns sorted list of [p, e] with p BigInt.
export function factorInteger(n) {
  n = BigInt(n);
  const out = new Map();
  const addp = (p, e = 1) => out.set(p, (out.get(p) || 0) + e);
  for (const p of SMALL_PRIMES) {
    if (p * p > n) break;
    while (n % p === 0n) { addp(p); n /= p; }
  }
  const stack = n > 1n ? [n] : [];
  while (stack.length) {
    const m = stack.pop();
    if (isProbablePrime(m)) { addp(m); continue; }
    const f = rho(m);
    stack.push(f, m / f);
  }
  return [...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
// Flat list of primes with multiplicity, ascending.
export function primeList(n) {
  const L = [];
  for (const [p, e] of factorInteger(n)) for (let i = 0; i < e; i++) L.push(p);
  return L;
}

// ---------------------------------------------------------------------------------------
// Divisors

const cache = new Map();
function cached(kind, a, m, f) {
  const k = RING + kind + "|" + O.key(a) + "|" + m;
  if (!cache.has(k)) {
    if (cache.size > 4000) cache.clear();
    cache.set(k, f());
  }
  return cache.get(k);
}

// Left divisors of norm m: minimal vectors of αO + mO  (β with β̄α ∈ mO).
export const leftDivisors = (a, m) => cached("L", a, m, () => vectorsOfNorm(leftLattice(a, BigInt(m), ringBasis()), BigInt(m)));
// Right divisors of norm m: minimal vectors of Oα + mO  (γ with αγ̄ ∈ mO).
export const rightDivisors = (a, m) => cached("R", a, m, () => vectorsOfNorm(rightLattice(a, BigInt(m), ringBasis()), BigInt(m)));

export const leftDivides = (b, a) => O.divisibleBy(O.mul(O.conj(b), a), O.norm(b));
export const rightDivides = (b, a) => O.divisibleBy(O.mul(a, O.conj(b)), O.norm(b));

// Canonical order on a list of divisors: primary first, then its negative, then the rest by
// (≡1 mod 2, lex-descending).  For even norm (no primary element) lex-descending.
function rankDivisors(list) {
  const score = (v) => (O.isOneMod2(v) ? (O.lexPositive(v) ? 0 : 1) : 2);
  return list.slice().sort((x, y) => score(x) - score(y) || -O.lexCompare(x, y));
}

// All 240 ways to write x = β·γ with N(β) = m, N(γ) = n (m·n = N(x), x primitive).
// Ordered so that index 0 is the normalized ("primary") choice.
export function splits(x, m, n) {
  m = BigInt(m); n = BigInt(n);
  return cached("S", x, m + "/" + n, () => {
    let pairs;
    if (n % 2n === 1n || m % 2n === 0n) {
      // normalize the right factor
      const gs = rankDivisors(rightDivisors(x, n));
      pairs = gs.map((g) => {
        const b = O.divInt(O.mul(x, O.conj(g)), n);
        return { left: b, right: g, normalized: "right" };
      });
    } else {
      // right norm even but left odd: normalize the left factor instead
      const bs = rankDivisors(leftDivisors(x, m));
      pairs = bs.map((b) => {
        const g = O.divInt(O.mul(O.conj(b), x), m);
        return { left: b, right: g, normalized: "left" };
      });
    }
    for (const p of pairs) {
      if (!p.left || !p.right || !O.equals(O.mul(p.left, p.right), x)) throw new Error("split failed (is α primitive?)");
    }
    return pairs;
  });
}

// ---------------------------------------------------------------------------------------
// Bracketings: binary trees over leaf positions 0..k−1.
//   leaf:  { leaf: i }      internal: { l: Tree, r: Tree }

export const leaf = (i) => ({ leaf: i });
export const node = (l, r) => ({ l, r });
export const isLeaf = (t) => t.leaf !== undefined;
export function leaves(t) { return isLeaf(t) ? [t.leaf] : leaves(t.l).concat(leaves(t.r)); }
export function countInternal(t) { return isLeaf(t) ? 0 : 1 + countInternal(t.l) + countInternal(t.r); }

export function leftComb(k) { let t = leaf(0); for (let i = 1; i < k; i++) t = node(t, leaf(i)); return t; }
export function rightComb(k) { let t = leaf(k - 1); for (let i = k - 2; i >= 0; i--) t = node(leaf(i), t); return t; }
export function balanced(k, lo = 0) {
  if (k === 1) return leaf(lo);
  const h = Math.floor(k / 2);
  return node(balanced(h, lo), balanced(k - h, lo + h));
}
// Relabel leaves left-to-right 0..k−1 (after rotations they stay in order anyway).
export function relabel(t, start = { i: 0 }) {
  if (isLeaf(t)) return leaf(start.i++);
  const l = relabel(t.l, start);
  return node(l, relabel(t.r, start));
}
// Random bracketing (uniform over split points recursively — not uniform over Catalan, fine).
export function randomTree(k, lo = 0) {
  if (k === 1) return leaf(lo);
  const s = 1 + Math.floor(Math.random() * (k - 1));
  return node(randomTree(s, lo), randomTree(k - s, lo + s));
}
// Paths address internal nodes: "" root, "L", "R", "LR", …
export function nodeAt(t, path) { for (const c of path) t = c === "L" ? t.l : t.r; return t; }
export function replaceAt(t, path, sub) {
  if (!path) return sub;
  return path[0] === "L" ? node(replaceAt(t.l, path.slice(1), sub), t.r) : node(t.l, replaceAt(t.r, path.slice(1), sub));
}
// Associativity moves.  rotateRight: ((A B) C) → (A (B C)) ; rotateLeft: (A (B C)) → ((A B) C).
export function canRotateRight(t, path) { const n = nodeAt(t, path); return !isLeaf(n) && !isLeaf(n.l); }
export function canRotateLeft(t, path) { const n = nodeAt(t, path); return !isLeaf(n) && !isLeaf(n.r); }
export function rotateRight(t, path) {
  const n = nodeAt(t, path);
  return replaceAt(t, path, node(n.l.l, node(n.l.r, n.r)));
}
export function rotateLeft(t, path) {
  const n = nodeAt(t, path);
  return replaceAt(t, path, node(node(n.l, n.r.l), n.r.r));
}
export function treeToString(t, names) {
  if (isLeaf(t)) return names ? names[t.leaf] : "π" + (t.leaf + 1);
  return "(" + treeToString(t.l, names) + "·" + treeToString(t.r, names) + ")";
}
export function catalan(n) { let c = 1n; for (let i = 0n; i < BigInt(n); i++) c = (c * 2n * (2n * i + 1n)) / (i + 2n); return c; }

// ---------------------------------------------------------------------------------------
// The factorization itself.
//
// factorize(α, primes, tree, choices) → annotated tree:
//   internal: { path, l, r, value, norm, interval:[i,j], choice, splitCount }
//   leaf:     { path, leaf, value, norm, prime }
// `primes[i]` is the norm of leaf i; `choices` maps node path → metamigration index.

export function factorize(alpha, primes, tree, choices = {}) {
  const ps = primes.map((p) => BigInt(p));
  const normOf = (t) => leaves(t).reduce((acc, i) => acc * ps[i], 1n);
  const rec = (t, x, path) => {
    const lv = leaves(t);
    const interval = [lv[0], lv[lv.length - 1]];
    if (isLeaf(t)) return { path, leaf: t.leaf, value: x, norm: ps[t.leaf], prime: ps[t.leaf], interval };
    const m = normOf(t.l), n = normOf(t.r);
    const S = splits(x, m, n);
    const choice = Math.min(choices[path] || 0, S.length - 1);
    const s = S[choice];
    return {
      path, value: x, norm: m * n, interval, choice, splitCount: S.length, normalized: s.normalized,
      l: rec(t.l, s.left, path + "L"),
      r: rec(t.r, s.right, path + "R"),
    };
  };
  return rec(tree, alpha, "");
}

// Signs are central, so they can be moved freely: make every leaf after the first
// lex-positive when it is ≡ 1 mod 2, pushing the accumulated sign into the first leaf,
// then recompute the internal products.  (With this, a quaternion input gives literally the
// same factors for every bracketing.)
export function normalizeSigns(ft) {
  const lv = [];
  const walk = (t) => { if (isLeaf(t)) lv.push(t); else { walk(t.l); walk(t.r); } };
  walk(ft);
  let flips = 0;
  for (let i = 1; i < lv.length; i++) {
    if (O.isOneMod2(lv[i].value) && !O.lexPositive(lv[i].value)) { lv[i].value = O.neg(lv[i].value); flips++; }
  }
  if (flips % 2) lv[0].value = O.neg(lv[0].value);
  const re = (t) => { if (!isLeaf(t)) { re(t.l); re(t.r); t.value = O.mul(t.l.value, t.r.value); } };
  re(ft);
  return ft;
}

export function leafValues(ft) { return isLeaf(ft) ? [ft.value] : leafValues(ft.l).concat(leafValues(ft.r)); }
export function evaluate(ft) { return isLeaf(ft) ? ft.value : O.mul(evaluate(ft.l), evaluate(ft.r)); }
export function internalNodes(ft, out = []) {
  if (!isLeaf(ft)) { out.push(ft); internalNodes(ft.l, out); internalNodes(ft.r, out); }
  return out;
}

// Split a leaf of odd norm p as ε·π with π primary (π = the primary right divisor of the leaf).
export function unitPrimary(value) {
  const p = O.norm(value);
  if (p % 2n === 0n) return null;
  const pi = rightDivisors(value, p).find(O.isPrimary);
  if (!pi) return null;
  const eps = O.divInt(O.mul(value, O.conj(pi)), p);
  return { unit: eps, primary: pi };
}

// Describe a unit compactly: ±e_i or ½(±1 ± … ) as formatted text.
export const formatUnit = (u) => O.format(u);

// Square root mod an odd prime (Tonelli–Shanks); null if a is a non-residue.
function sqrtMod(a, p) {
  a = ((a % p) + p) % p;
  if (a === 0n) return 0n;
  if (modpow(a, (p - 1n) / 2n, p) !== 1n) return null;
  let q = p - 1n, s = 0n;
  while (!(q & 1n)) { q >>= 1n; s++; }
  let z = 2n;
  while (modpow(z, (p - 1n) / 2n, p) !== p - 1n) z++;
  let m = s, c = modpow(z, q, p), t = modpow(a, q, p), r = modpow(a, (q + 1n) / 2n, p);
  while (t !== 1n) {
    let i = 0n, tt = t;
    while (tt !== 1n) { tt = (tt * tt) % p; i++; }
    const b = modpow(c, 1n << (m - i - 1n), p);
    m = i; c = (b * b) % p; t = (t * c) % p; r = (r * b) % p;
  }
  return r;
}
const randBig = (rng, span) => BigInt(Math.floor(rng() * (2 * span + 1)) - span);

// Random prime of norm p: take a random x and solve N(x + t) ≡ 0 (mod p) for t ∈ Z, then pick
// a random left divisor of norm p of z = x + t (the 240 minimal vectors of zO + pO).
export function randomPrime(p, rng = Math.random) {
  p = BigInt(p);
  for (let tries = 0; tries < 10000; tries++) {
    let x = O.ZERO;
    for (const r of ringBasis()) x = O.add(x, O.scale(randBig(rng, 9), r));
    let z = null;
    if (p === 2n) {
      for (const t of [0n, 1n]) { const w = O.add(x, O.scale(t, O.ONE)); if (O.norm(w) % 2n === 0n) { z = w; break; } }
    } else {
      // N(x + t) = t² + tr(x)·t + N(x)
      const tr = O.trace(x), nx = O.norm(x);
      const disc = tr * tr - 4n * nx;
      const s = sqrtMod(disc, p);
      if (s === null) continue;
      const inv2 = (p + 1n) / 2n;
      const t = (((-tr + (rng() < 0.5 ? s : -s)) % p + p) * inv2) % p;
      z = O.add(x, O.scale(t, O.ONE));
    }
    if (!z || O.isZero(z) || O.norm(z) % p !== 0n || O.divisibleBy(z, p)) continue;
    // make z primitive (divide out content) so the divisor theory applies
    const c = O.content(z);
    if (c > 1n) { z = O.divInt(z, c); if (O.norm(z) % p !== 0n) continue; }
    const ds = leftDivisors(z, p);
    return ds[Math.floor(rng() * ds.length)];
  }
  throw new Error("could not find a prime of norm " + p);
}
// Random primitive octavian of norm ∏ primes (built as a left-nested product of random primes).
export function randomPrimitive(primes, rng = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let a = O.ONE;
    for (const p of primes) a = O.mul(a, randomPrime(p, rng));
    if (O.isPrimitive(a)) return a;
  }
  throw new Error("could not build a primitive octavian");
}
