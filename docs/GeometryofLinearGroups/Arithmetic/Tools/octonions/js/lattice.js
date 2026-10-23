// Lattices in O ⊗ Q, stored as integer row bases in doubled coordinates.
//
// The key fact used throughout (Rehm 1993; checked in tests/): for a primitive octavian α
// and m | N(α), the lattice αO + mO is a scaled copy √m·E8, and its 240 minimal vectors
// are exactly the left divisors of α of norm m.  So divisor-finding = shortest vectors.
// We find them by exact integral LLL followed by Fincke–Pohst enumeration on the Gram
// matrix divided by m, which is an integral E8 Gram matrix — tiny numbers, so the floating
// enumeration is safe whatever the size of α.

import { hermiteRows, abs, mul, O_BASIS, scale } from "./octavian.js";

const dot = (u, v) => {
  let s = 0n;
  for (let i = 0; i < u.length; i++) s += u[i] * v[i];
  return s;
};

export const hnf = hermiteRows;

// Canonical key for a full-rank lattice (its Hermite normal form).
export const latticeKey = (rows) => hnf(rows).map((r) => r.join(",")).join(";");

// Exact integral LLL (Cohen, "A Course in Computational Algebraic Number Theory",
// Algorithm 2.6.7) with δ = 3/4 and the standard dot product.  Written 1-indexed to match
// the book: bb[1..n], d[0..n], lam[k][j] for 1 ≤ j < k ≤ n.
export function lll(basis) {
  const n = basis.length;
  const bb = [null, ...basis.map((v) => v.slice())];
  const d = new Array(n + 1).fill(0n);
  const lam = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0n));
  const roundDiv = (x, y) => { // nearest integer to x / y for y > 0
    let q = x / y, r = x - q * y;
    if (r < 0n) { q -= 1n; r += y; }
    return 2n * r >= y ? q + 1n : q;
  };
  const red = (k, l) => {
    if (2n * abs(lam[k][l]) > d[l]) {
      const q = roundDiv(lam[k][l], d[l]);
      const bk = bb[k], bl = bb[l];
      for (let t = 0; t < bk.length; t++) bk[t] -= q * bl[t];
      lam[k][l] -= q * d[l];
      for (let i = 1; i < l; i++) lam[k][i] -= q * lam[l][i];
    }
  };
  let kmax = 1;
  const swap = (k) => {
    [bb[k], bb[k - 1]] = [bb[k - 1], bb[k]];
    for (let j = 1; j <= k - 2; j++) [lam[k][j], lam[k - 1][j]] = [lam[k - 1][j], lam[k][j]];
    const l = lam[k][k - 1];
    const Bv = (d[k - 2] * d[k] + l * l) / d[k - 1];
    for (let i = k + 1; i <= kmax; i++) {
      const t = lam[i][k];
      lam[i][k] = (d[k] * lam[i][k - 1] - l * t) / d[k - 1];
      lam[i][k - 1] = (Bv * t + l * lam[i][k]) / d[k];
    }
    d[k - 1] = Bv;
  };
  d[0] = 1n;
  d[1] = dot(bb[1], bb[1]);
  let k = 2;
  while (k <= n) {
    if (k > kmax) {
      kmax = k;
      for (let j = 1; j <= k; j++) {
        let u = dot(bb[k], bb[j]);
        for (let i = 1; i < j; i++) u = (d[i] * u - lam[k][i] * lam[j][i]) / d[i - 1];
        if (j < k) lam[k][j] = u;
        else {
          if (u === 0n) throw new Error("LLL: vectors are linearly dependent");
          d[k] = u;
        }
      }
    }
    red(k, k - 1);
    if (4n * d[k] * d[k - 2] < 3n * d[k - 1] * d[k - 1] - 4n * lam[k][k - 1] * lam[k][k - 1]) {
      swap(k);
      k = Math.max(2, k - 1);
    } else {
      for (let l = k - 2; l >= 1; l--) red(k, l);
      k++;
    }
  }
  return bb.slice(1);
}

// All lattice vectors v (doubled coords) with N(v) = m, assuming N(L) ⊂ mZ, i.e. the Gram
// matrix of B(x,y) = (d·d')/2 divided by m is integral.  Returns BigInt vectors.
export function vectorsOfNorm(basisRows, m, div) {
  m = BigInt(m);
  div = div === undefined ? m : BigInt(div); // Gram is divided by div; must stay integral
  const b = lll(hnf(basisRows));
  const n = b.length;
  const G = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = dot(b[i], b[j]); // = 2·B(b_i, b_j)
    if (x % (2n * div)) throw new Error("lattice is not integral at this scale (internal error)");
    G[i][j] = Number(x / (2n * div)); // Gram of B/div; we want B(v,v)/div = 2m/div
  }
  const coeffs = shortVectors(G, Number((2n * m) / div));
  const out = [];
  for (const c of coeffs) {
    const v = new Array(b[0].length).fill(0n);
    for (let i = 0; i < n; i++) if (c[i]) {
      const ci = BigInt(c[i]);
      for (let t = 0; t < v.length; t++) v[t] += ci * b[i][t];
    }
    if (dot(v, v) === 4n * m) out.push(v);
  }
  return out;
}

// Fincke–Pohst: all integer c ≠ 0 with cᵀGc = target (G positive definite, small entries).
function shortVectors(G, target) {
  const n = G.length;
  // Cholesky-style decomposition q (Cohen Alg. 2.7.5 notation): Q(x) = Σ q_ii (x_i + Σ_{j>i} q_ij x_j)^2.
  const q = G.map((r) => r.slice());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      q[j][i] = q[i][j];
      q[i][j] = q[i][j] / q[i][i];
    }
    for (let k = i + 1; k < n; k++) for (let l = k; l < n; l++) q[k][l] -= q[k][i] * q[i][l];
  }
  const C = target + 1e-7;
  const x = new Array(n).fill(0);
  const out = [];
  const rec = (i, rem) => {
    let c = 0;
    for (let j = i + 1; j < n; j++) c += q[i][j] * x[j];
    const r = Math.sqrt(Math.max(rem, 0) / q[i][i]);
    const lo = Math.ceil(-c - r - 1e-9), hi = Math.floor(-c + r + 1e-9);
    for (let t = lo; t <= hi; t++) {
      x[i] = t;
      const used = q[i][i] * (t + c) * (t + c);
      if (used > rem + 1e-7) continue;
      if (i === 0) {
        if (x.some((v) => v)) {
          let s = 0;
          for (let a = 0; a < n; a++) for (let bb = 0; bb < n; bb++) s += x[a] * G[a][bb] * x[bb];
          if (Math.abs(s - target) < 1e-6) out.push(x.slice());
        }
      } else rec(i - 1, rem - used);
    }
    x[i] = 0;
  };
  rec(n - 1, C);
  return out;
}

// ---------------------------------------------------------------------------------------
// The lattices that matter.

// The Hurwitz order on the associative subalgebra ⟨1, e1, e2, e4⟩ (i, j, k = e1, e2, e4):
// basis ½(1+i+j+k), i, j, k in doubled coordinates.  Used for the quaternion comparison mode.
export const H_BASIS = [
  [1n, 1n, 1n, 0n, 1n, 0n, 0n, 0n],
  [0n, 2n, 0n, 0n, 0n, 0n, 0n, 0n],
  [0n, 0n, 2n, 0n, 0n, 0n, 0n, 0n],
  [0n, 0n, 0n, 0n, 2n, 0n, 0n, 0n],
];
export const inHurwitz = (a) => a[3] === 0n && a[5] === 0n && a[6] === 0n && a[7] === 0n;

// αR + mR  (left multiples)  and  Rα + mR  (right multiples), R = O (default) or Hurwitz H.
export function leftLattice(a, m, basis = O_BASIS) {
  const rows = basis.map((e) => mul(a, e));
  if (m) for (const e of basis) rows.push(scale(m, e));
  return hnf(rows);
}
export function rightLattice(a, m, basis = O_BASIS) {
  const rows = basis.map((e) => mul(e, a));
  if (m) for (const e of basis) rows.push(scale(m, e));
  return hnf(rows);
}

// Lattice equality / containment helpers.
export function sameLattice(A, B) {
  return latticeKey(A) === latticeKey(B);
}
// Index [O : L] for a full-rank lattice in doubled coords (|det L| / |det O|).
export function indexInO(rows) {
  const H = hnf(rows);
  let det = 1n, detO = 1n;
  for (let i = 0; i < 8; i++) { det *= H[i][i]; detO *= O_BASIS[i][i]; }
  return abs(det / detO);
}
// Sum and intersection-free comparison: index of L ∩ M in L, via [L+M : M] = [L : L∩M].
export function relativeIndex(L, M) {
  const S = hnf(L.concat(M));
  let dS = 1n, dM = 1n;
  const HM = hnf(M);
  for (let i = 0; i < 8; i++) { dS *= S[i][i]; dM *= HM[i][i]; }
  return abs(dM / dS);
}
