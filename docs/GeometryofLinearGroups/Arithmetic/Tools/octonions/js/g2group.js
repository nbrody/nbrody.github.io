// Explicit arithmetic in Γ_N = G₂(ℤ[1/N]) = Aut(𝕆[1/N]).
//
// • An element g is an automorphism of the rational octonions, stored as the matrix of g in
//   the real coordinates (1, e1, …, e7): integer numerators M and a common denominator Q.
//   It is built from a basic triple: g(e1), g(e2), g(e3) determine g, since e4 = e1e2,
//   e5 = e2e3, e6 = e3e4, e7 = e4e5.  G₂ is orthogonal, so g⁻¹ = gᵀ.
// • Hyperspecial vertices of ∏_p B(G₂(ℚ_p)) are maximal orders R = g𝕆.  The position of R
//   at p, a·ω_s + b·ω_ℓ, is read off the p-adic elementary divisors of R relative to 𝕆,
//   which are ±(a+2b), ±(a+b), ±b, 0, 0 (the pairings of λ with the weights of the 8-dim
//   representation: 0, 0 and the six short roots).
// • The vertex one short (resp. long) step from 𝕆 toward T = r𝕆 is given by lattice
//   operations (derived in a common apartment, where T has exponents c and the step vertex
//   has exponents f(c) for an odd step function f, written as a min of maxima):
//     short:  (p⁻¹𝕆 ∩ pᵇT) + (𝕆 ∩ p⁻ᵇT) + p𝕆                              (needs a ≥ 1)
//     long:   (p⁻²𝕆 ∩ p^{a+b−1}T) + (p⁻¹𝕆 ∩ T) + (𝕆 ∩ p^{1−b}T) + (p𝕆 ∩ p^{1−a−b}T) + p²𝕆   (b ≥ 1)
//   These are basis-free, hence valid in general; tests/ check the results are maximal
//   orders at the predicted positions.
// • An isomorphism 𝕆 → R is found by searching basic triples among the 126 imaginary units of R
//   in a fixed order; the first one found is the canonical "G₂-prime" for that vertex, so a
//   factorization g = h₁⋯h_m·u (u ∈ Aut(𝕆) ≅ G₂(𝔽₂)) is canonical for each ordering of steps.

import * as O from "./octavian.js";
import { vectorsOfNorm, H_BASIS } from "./lattice.js";

const { abs, gcd } = O;
const B = (x) => BigInt(x);

// ---------------------------------------------------------------------------------------
// Fractions {n, d} with d > 0.

const F = (n, d = 1n) => {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
};
const F0 = F(0n), F1 = F(1n);
const fadd = (x, y) => F(x.n * y.d + y.n * x.d, x.d * y.d);
const fsub = (x, y) => F(x.n * y.d - y.n * x.d, x.d * y.d);
const fmul = (x, y) => F(x.n * y.n, x.d * y.d);
const fdiv = (x, y) => F(x.n * y.d, x.d * y.n);
const lcm = (a, b) => (a / gcd(a, b)) * b;
function vpInt(n, p) { n = abs(n); if (!n) return Infinity; let v = 0; while (n % p === 0n) { n /= p; v++; } return v; }
const vpF = (x, p) => (x.n === 0n ? Infinity : vpInt(x.n, p) - vpInt(x.d, p));

function matInv(A) {
  const n = A.length;
  const M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? F1 : F0))));
  for (let c = 0; c < n; c++) {
    let piv = -1;
    for (let r = c; r < n; r++) if (M[r][c].n !== 0n) { piv = r; break; }
    if (piv < 0) throw new Error("singular matrix");
    [M[c], M[piv]] = [M[piv], M[c]];
    const inv = fdiv(F1, M[c][c]);
    M[c] = M[c].map((x) => fmul(x, inv));
    for (let r = 0; r < n; r++) if (r !== c && M[r][c].n !== 0n) {
      const f = M[r][c];
      M[r] = M[r].map((x, k) => fsub(x, fmul(f, M[c][k])));
    }
  }
  return M.map((r) => r.slice(n));
}
const matMulF = (A, Bm) => A.map((r) => Bm[0].map((_, j) => r.reduce((s, x, k) => fadd(s, fmul(x, Bm[k][j])), F0)));

// Valuations at p of the elementary divisors of a rational matrix (Smith form over ℤ_(p)).
function localExps(A, p) {
  A = A.map((r) => r.slice());
  const n = A.length, out = [];
  for (let k = 0; k < n; k++) {
    let bi = -1, bj = -1, bv = Infinity;
    for (let i = k; i < n; i++) for (let j = k; j < n; j++) {
      const v = vpF(A[i][j], p);
      if (v < bv) { bv = v; bi = i; bj = j; }
    }
    if (bv === Infinity) throw new Error("singular transition matrix");
    [A[k], A[bi]] = [A[bi], A[k]];
    for (const r of A) [r[k], r[bj]] = [r[bj], r[k]];
    out.push(bv);
    const piv = A[k][k];
    for (let r = k + 1; r < n; r++) if (A[r][k].n !== 0n) {
      const f = fdiv(A[r][k], piv);
      for (let c = k; c < n; c++) A[r][c] = fsub(A[r][c], fmul(f, A[k][c]));
    }
  }
  return out.sort((x, y) => x - y);
}

// ---------------------------------------------------------------------------------------
// Rational lattices in doubled coordinates: rows B (integers, Hermite form) over den.

function normLat(rows, den) {
  const H = O.hermiteRows(rows);
  if (H.length !== 8) throw new Error("lattice is not of full rank");
  let g = den;
  for (const r of H) for (const x of r) g = gcd(g, x);
  return { B: H.map((r) => r.map((x) => x / g)), den: den / g };
}
const latOf = (rows, den = 1n) => normLat(rows.map((r) => r.slice()), den);
export const O_LAT = latOf(O.O_BASIS);
function latRowsF(L) { return L.B.map((r) => r.map((x) => F(x, L.den))); }
function latFromF(rows) {
  let D = 1n;
  for (const r of rows) for (const x of r) D = lcm(D, x.d);
  return normLat(rows.map((r) => r.map((x) => x.n * (D / x.d))), D);
}
export function latEquals(L, M) {
  if (L.den !== M.den) return false;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (L.B[i][j] !== M.B[i][j]) return false;
  return true;
}
export const latKey = (L) => L.den + ":" + L.B.map((r) => r.join(",")).join(";");
function latScale(L, p, k) { // p^k L
  const pk = p ** B(Math.abs(k));
  return k >= 0 ? normLat(L.B.map((r) => r.map((x) => x * pk)), L.den) : normLat(L.B, L.den * pk);
}
function latSum(...Ls) {
  let D = 1n;
  for (const L of Ls) D = lcm(D, L.den);
  const rows = [];
  for (const L of Ls) for (const r of L.B) rows.push(r.map((x) => x * (D / L.den)));
  return normLat(rows, D);
}
const dualCache = new Map();
function latDual(L) {
  const k = latKey(L);
  if (dualCache.has(k)) return dualCache.get(k);
  const inv = matInv(latRowsF(L));
  const T = inv[0].map((_, j) => inv.map((r) => r[j]));
  const D = latFromF(T);
  if (dualCache.size > 2000) dualCache.clear();
  dualCache.set(k, D);
  return D;
}
const latMeet = (L, M) => latDual(latSum(latDual(L), latDual(M)));

// Coordinates of a doubled-coordinate vector v/q in the basis of L; null unless integral.
function makeMember(L) {
  const inv = matInv(latRowsF(L));
  return (d, q) => {
    for (let j = 0; j < 8; j++) {
      let s = F0;
      for (let i = 0; i < 8; i++) if (d[i]) s = fadd(s, fmul(F(d[i], q), inv[i][j]));
      if (s.d !== 1n) return false;
    }
    return true;
  };
}

// Is the lattice an order (contains 1, closed under multiplication)?
export function isOrder(L) {
  const mem = makeMember(L);
  if (!mem(O.ONE, 1n)) return false;
  for (const x of L.B) for (const y of L.B) {
    const raw = O.mulAny(x, y); // doubled coords of product = raw / (2 den²)
    if (!mem(raw, 2n * L.den * L.den)) return false;
  }
  return true;
}

// Position of M relative to L at p: [a, b] with M at a·ω_s + b·ω_ℓ.  Also returns the exponents.
export function positionAt(L, M, p) {
  p = B(p);
  const A = matMulF(latRowsF(M), matInv(latRowsF(L)));
  const c = localExps(A, p);
  const b = c[5], a = c[6] - c[5];
  const ok = c[7] === a + 2 * b && c[3] === 0 && c[4] === 0 && c.every((x, i) => x === -c[7 - i]) && a >= 0 && b >= 0;
  if (!ok) throw new Error("not a pair of G₂ vertices at p = " + p + " (exponents " + c.join(",") + ")");
  return [a, b];
}
// Primes at which M ≠ L (denominators of the transition matrix or its inverse).
export function support(L, M) {
  const A = matMulF(latRowsF(M), matInv(latRowsF(L)));
  const Ai = matInv(A);
  let D = 1n;
  for (const r of A.concat(Ai)) for (const x of r) D = lcm(D, x.d);
  const ps = [];
  for (let q = 2n; q * q <= D; q++) if (D % q === 0n) { ps.push(q); while (D % q === 0n) D /= q; }
  if (D > 1n) ps.push(D);
  return ps;
}

// The vertex one step from L = 𝕆 toward T at p (kind "s" short or "l" long).
export function stepVertex(T, p, kind) {
  p = B(p);
  const L = O_LAT;
  const [a, b] = positionAt(L, T, p);
  if (kind === "s") {
    if (a < 1) throw new Error("no short step left at p = " + p);
    return latSum(latMeet(latScale(L, p, -1), latScale(T, p, b)), latMeet(L, latScale(T, p, -b)), latScale(L, p, 1));
  }
  if (b < 1) throw new Error("no long step left at p = " + p);
  return latSum(
    latMeet(latScale(L, p, -2), latScale(T, p, a + b - 1)),
    latMeet(latScale(L, p, -1), T),
    latMeet(L, latScale(T, p, 1 - b)),
    latMeet(latScale(L, p, 1), latScale(T, p, 1 - a - b)),
    latScale(L, p, 2));
}

// ---------------------------------------------------------------------------------------
// Rational octonions: doubled coordinates d over q.

const RO = (d, q = 1n) => {
  if (q < 0n) { d = d.map((x) => -x); q = -q; }
  let g = q;
  for (const x of d) g = gcd(g, x);
  return { d: d.map((x) => x / g), q: q / g };
};
export const roOf = (d) => RO(d.slice(), 1n);
export const roMul = (x, y) => RO(O.mulAny(x.d, y.d), 2n * x.q * y.q);
const roDot = (x, y) => x.d.reduce((s, v, i) => s + v * y.d[i], 0n); // sign of B(x, y)
const roKey = (x) => x.q + ":" + x.d.join(",");
export const roEquals = (x, y) => x.q === y.q && x.d.every((v, i) => v === y.d[i]);

// Format a rational octonion with a common denominator: "(3 + e₁ − 2e₅)/5", "½(…)".
export function roFormat(x) {
  // real coordinates = d / (2q)
  let D = 2n * x.q, g = D;
  for (const v of x.d) g = gcd(g, v);
  const n = x.d.map((v) => v / g);
  D /= g;
  const SUBS = ["", "e₁", "e₂", "e₃", "e₄", "e₅", "e₆", "e₇"];
  let s = "";
  n.forEach((c, i) => {
    if (!c) return;
    const mag = abs(c);
    const term = i === 0 ? mag.toString() : (mag === 1n ? "" : mag.toString()) + SUBS[i];
    s += s ? (c < 0n ? " − " : " + ") + term : (c < 0n ? "−" : "") + term;
  });
  if (!s) s = "0";
  if (D === 1n) return s;
  if (D === 2n) return "½(" + s + ")";
  return "(" + s + ")/" + D;
}

// LaTeX with a common denominator: \tfrac{1}{5}(3e_{2} + 4e_{4}).
export function roFormatTex(x) {
  let D = 2n * x.q, g = D;
  for (const v of x.d) g = gcd(g, v);
  const n = x.d.map((v) => v / g);
  D /= g;
  const s = O.linCombTex(n);
  if (D === 1n) return s;
  const single = n.filter((v) => v).length === 1;
  if (single) { // one term: write it as a fraction
    const i = n.findIndex((v) => v), c = n[i];
    const num = (abs(c) === 1n && i ? "" : abs(c).toString()) + (i ? "e_{" + i + "}" : "");
    return (c < 0n ? "-" : "") + "\\tfrac{" + (num || "1") + "}{" + D + "}";
  }
  return (D === 2n ? "\\tfrac12" : "\\tfrac{1}{" + D + "}") + "\\left(" + s + "\\right)";
}

// ---------------------------------------------------------------------------------------
// G₂ elements: g(x) = (M x)/Q in real coordinates.

export const G_ID = { M: Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1n : 0n))), Q: 1n };
function gReduce(M, Q) {
  let g = Q;
  for (const r of M) for (const x of r) g = gcd(g, x);
  return { M: M.map((r) => r.map((x) => x / g)), Q: Q / g };
}
// From a basic triple of rational octonions (images of e1, e2, e3).
export function fromTriple(u1, u2, u3) {
  const im = [null, u1, u2, u3];
  im[4] = roMul(u1, u2);
  im[5] = roMul(u2, u3);
  im[6] = roMul(u3, im[4]);
  im[7] = roMul(im[4], im[5]);
  im[0] = roOf(O.ONE);
  // real coords of im[j] = d / (2q); common denominator
  let Q = 1n;
  for (const x of im) Q = lcm(Q, 2n * x.q);
  const M = Array.from({ length: 8 }, () => new Array(8).fill(0n));
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) M[i][j] = im[j].d[i] * (Q / (2n * im[j].q));
  return gReduce(M, Q);
}
export function gCompose(g, h) { // g ∘ h
  const M = g.M.map((r) => h.M[0].map((_, j) => r.reduce((s, x, k) => s + x * h.M[k][j], 0n)));
  return gReduce(M, g.Q * h.Q);
}
export const gInverse = (g) => ({ M: g.M[0].map((_, j) => g.M.map((r) => r[j])), Q: g.Q });
export const gEquals = (g, h) => g.Q === h.Q && g.M.every((r, i) => r.every((x, j) => x === h.M[i][j]));
// g applied to a rational octonion (doubled coords d/q): doubled coords (M d)/(q Q).
export function gApply(g, x) {
  const d = g.M.map((r) => r.reduce((s, v, k) => s + v * x.d[k], 0n));
  return RO(d, x.q * g.Q);
}
export const gImage = (g, j) => { const e = new Array(8).fill(0n); e[j] = 2n; return gApply(g, RO(e, 1n)); };
// g applied to a lattice (rows are row vectors: r ↦ r Mᵀ).
export function gApplyLat(g, L) {
  const rows = L.B.map((r) => g.M.map((row) => row.reduce((s, v, k) => s + v * r[k], 0n)));
  return normLat(rows, L.den * g.Q);
}
export const gVertex = (g) => gApplyLat(g, O_LAT);
// Check that g is an automorphism (on basis products).
export function isAutomorphism(g) {
  const im = [];
  for (let j = 0; j < 8; j++) im.push(gImage(g, j));
  for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
    const prod = roMul(roOf(O.basisUnit(i)), roOf(O.basisUnit(j)));
    if (!roEquals(gApply(g, prod), roMul(im[i], im[j]))) return false;
  }
  return true;
}
// g from user input: three rational octonions forming a basic triple.
export function parseTriple(s1, s2, s3) {
  const u = [s1, s2, s3].map((s, i) => {
    const r = O.parseRational(s);
    const x = RO(r.d, r.q);
    if (x.d[0] !== 0n) throw new Error(`g(e${i + 1}) must be purely imaginary`);
    if (x.d.reduce((t, v) => t + v * v, 0n) !== 4n * x.q * x.q) throw new Error(`g(e${i + 1}) must have norm 1`);
    return x;
  });
  if (roDot(u[0], u[1]) !== 0n) throw new Error("g(e₂) must be orthogonal to g(e₁)");
  const w = roMul(u[0], u[1]);
  if (roDot(u[2], u[0]) !== 0n || roDot(u[2], u[1]) !== 0n || roDot(u[2], w) !== 0n) throw new Error("g(e₃) must be orthogonal to g(e₁), g(e₂) and g(e₁)g(e₂)");
  return fromTriple(...u);
}
export const gKey = (g) => g.Q + ":" + g.M.map((r) => r.join(",")).join(";");
export const gFormatTex = (g) => [1, 2, 3].map((j) => `e_{${j}} \\mapsto ${roFormatTex(gImage(g, j))}`);
export const gFormat = (g) => [1, 2, 3].map((j) => `e${"₁₂₃"[j - 1]} ↦ ${roFormat(gImage(g, j))}`);

// ---------------------------------------------------------------------------------------
// Isomorphisms 𝕆 → R

function unitsOf(R) {
  const den2 = R.den * R.den;
  return vectorsOfNorm(R.B, den2, den2).map((v) => RO(v, R.den));
}
const isoCache = new Map();
// Canonical g with g𝕆 = R (R a maximal order isomorphic to 𝕆), or all of them if `all`.
export function isoTo(R, { all = false, rng = null, fixFirst = false } = {}) {
  const key = latKey(R);
  if (!all && !rng && isoCache.has(key)) return isoCache.get(key);
  const imag = unitsOf(R).filter((u) => u.d[0] === 0n).sort((x, y) => (roKey(x) < roKey(y) ? -1 : 1));
  if (imag.length !== 126) throw new Error("not a maximal order isomorphic to 𝕆 (" + imag.length + " imaginary units)");
  const mem = makeMember(R);
  const halfRows = O.O_BASIS.filter((r) => r.some((x) => x & 1n));
  const found = [];
  const order = (arr) => (rng ? shuffle(arr.slice(), rng) : arr);
  const firsts = fixFirst ? [imag[0]] : order(imag); // Aut(𝕆) is transitive on imaginary units, so the first u1 succeeds
  for (const u1 of firsts) {
    for (const u2 of order(imag)) {
      if (roDot(u1, u2) !== 0n) continue;
      const w = roMul(u1, u2);
      for (const u3 of order(imag)) {
        if (roDot(u3, u1) !== 0n || roDot(u3, u2) !== 0n || roDot(u3, w) !== 0n) continue;
        const g = fromTriple(u1, u2, u3);
        let ok = true;
        for (const r of halfRows) {
          const y = gApply(g, RO(r, 1n));
          if (!mem(y.d, y.q)) { ok = false; break; }
        }
        if (!ok) continue;
        if (!all) {
          if (!rng) isoCache.set(key, g);
          return g;
        }
        found.push(g);
      }
    }
  }
  if (all) return found;
  throw new Error("no isomorphism 𝕆 → R found");
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// A random element of Aut(𝕆) ≅ G₂(𝔽₂).
export const randomAut = (rng = Math.random) => isoTo(O_LAT, { rng });

// ---------------------------------------------------------------------------------------
// Positions and factorization.

export function positions(g, primes) {
  const V = gVertex(g);
  return primes.map((p) => positionAt(O_LAT, V, p));
}
export function supportOf(g) { return support(O_LAT, gVertex(g)); }

// g = h₁ h₂ ⋯ h_m · u along the given ordering of steps [{p, kind}].
export function factorG2(g, steps) {
  let r = g;
  let acc = G_ID;
  const factors = [], vertices = [O_LAT];
  for (const st of steps) {
    const T = gVertex(r);
    const v = stepVertex(T, st.p, st.kind);
    const h = isoTo(v);
    factors.push({ p: B(st.p), kind: st.kind, h, vertex: v });
    r = gCompose(gInverse(h), r);
    acc = gCompose(acc, h);
    vertices.push(gVertex(acc));
  }
  if (!latEquals(gVertex(r), O_LAT)) throw new Error("steps do not exhaust the position of g");
  return { factors, unit: r, vertices };
}
export function multiply(list) { return list.reduce((acc, g) => gCompose(acc, g), G_ID); }

// ---------------------------------------------------------------------------------------
// Seeds and random elements.

// Hurwitz-quaternion automorphisms: conjugation by a on H = ⟨1,e1,e2,e4⟩ and u3 = (b ā / p)e3.
function hurwitzSeeds(p) {
  const hs = vectorsOfNorm(H_BASIS, p, 1n);
  const out = [];
  const e = (i) => roOf(O.basisUnit(i));
  for (let i = 0; i < hs.length && out.length < 6; i += Math.max(1, Math.floor(hs.length / 24))) {
    const a = roOf(hs[i]), ainv = RO(O.conj(hs[i]), p);
    for (let j = 0; j < hs.length && out.length < 6; j += Math.max(1, Math.floor(hs.length / 12))) {
      const b = roOf(hs[j]);
      const u1 = roMul(roMul(a, e(1)), ainv), u2 = roMul(roMul(a, e(2)), ainv);
      const u3 = roMul(roMul(b, ainv), e(3));
      const g = fromTriple(u1, u2, u3);
      const sup = supportOf(g);
      if (sup.length === 1 && sup[0] === B(p)) out.push(g);
    }
  }
  return out;
}

const primeCache = new Map();
// Canonical G₂-primes of each kind at p (h with h𝕆 one short / long step from 𝕆).
export function basicPrimes(p, rng = Math.random) {
  p = B(p);
  if (primeCache.has(p)) return primeCache.get(p);
  const res = { s: null, l: null };
  let pool = hurwitzSeeds(p);
  if (!pool.length) throw new Error("no seed element found at p = " + p);
  const take = (g) => {
    const [a, b] = positionAt(O_LAT, gVertex(g), p);
    if (a >= 1 && !res.s) res.s = factorG2(g, [{ p, kind: "s" }, ...rest(a - 1, b, p)]).factors[0].h;
    if (b >= 1 && !res.l) res.l = factorG2(g, [{ p, kind: "l" }, ...rest(a, b - 1, p)]).factors[0].h;
  };
  for (const g of pool) take(g);
  for (let t = 0; t < 200 && (!res.s || !res.l); t++) {
    const g = gCompose(gCompose(pool[t % pool.length], randomAut(rng)), pool[(t * 7 + 3) % pool.length]);
    take(g);
  }
  if (!res.s || !res.l) throw new Error("could not find both kinds of G₂-prime at p = " + p);
  primeCache.set(p, res);
  return res;
}
const rest = (a, b, p) => [...Array(a).fill({ p, kind: "s" }), ...Array(b).fill({ p, kind: "l" })];

// A random g ∈ G₂(ℤ[1/N]) with g𝕆 at position (a_p, b_p) at each target prime, built as a
// random walk that only accepts steps moving straight out.
export function randomG2(targets, rng = Math.random) {
  const steps = [];
  for (const t of targets) steps.push(...rest(t.a, t.b, B(t.p)));
  shuffle(steps, rng);
  let g = G_ID;
  const pos = new Map(targets.map((t) => [String(t.p), [0, 0]]));
  for (const st of steps) {
    const P = basicPrimes(st.p, rng)[st.kind];
    const [a0, b0] = pos.get(String(st.p));
    const want = st.kind === "s" ? [a0 + 1, b0] : [a0, b0 + 1];
    let ok = false;
    for (let t = 0; t < 300; t++) {
      const cand = gCompose(gCompose(g, randomAut(rng)), P);
      const [a, b] = positionAt(O_LAT, gVertex(cand), st.p);
      if (a === want[0] && b === want[1]) { g = cand; ok = true; break; }
    }
    if (!ok) throw new Error("random walk got stuck at p = " + st.p);
    pos.set(String(st.p), want);
  }
  return gCompose(g, randomAut(rng));
}
