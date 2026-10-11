// LLL.js — Lenstra–Lenstra–Lovász lattice reduction (floating-point variant)
// Geometry of Linear Groups / Geometric / Tools / Euclidean
//
// This module exports a single function `lll(basis, opts)` plus a few helpers.
// The implementation is robust, readable, and suitable for small-to-medium dimensions.
// It optionally tracks the unimodular transform U s.t. B_out = U * B_in.
//
// API
// ----
// lll(basis, opts?) -> {
//   basis: number[][],   // reduced basis (row vectors)
//   U?: number[][],      // unimodular transform if opts.computeU === true
//   mu: number[][],      // Gram–Schmidt coefficients μ_{i,j}
//   Bstar: number[][],   // orthogonalized vectors b*_i
//   BstarNorm2: number[],// squared norms ||b*_i||^2
//   swaps: number,       // number of swaps performed
//   reductions: number   // number of size-reduction updates
// }
//
// Options:
//   delta: number in (1/4, 1], default 0.99. (Use 0.75 for classical LLL.)
//   eta:   number in [0, 0.5], default 0.5 (size reduction threshold; 0.5 = nearest integer)
//   computeU: boolean, default false — track the integer transformation U
//   maxIters: optional safety cap on iterations
//   eps: small tolerance for rank/zero checks (default 1e-12)
//
// Notes
// -----
// * Basis is an array of row vectors (m x n). Entries may be numbers, bigint, or numeric strings.
// * The algorithm uses floating-point for Gram–Schmidt; for exact arithmetic see fplll et al.
// * If the basis is not full rank (some b*_i ~ 0), the code throws an informative error.

/* eslint-disable no-param-reassign */

function toNumber(x) {
  if (typeof x === 'number') return x;
  if (typeof x === 'bigint') return Number(x);
  if (typeof x === 'string') return Number(x);
  return Number(x);
}

function cloneMatrix(A) {
  return A.map(row => row.slice());
}

function zeros(n) { return Array(n).fill(0); }

function dot(a, b) {
  const n = a.length;
  let s = 0;
  // Kahan-like compensated sum for mild stability
  let c = 0;
  for (let i = 0; i < n; i++) {
    const y = a[i] * b[i] - c;
    const t = s + y;
    c = (t - s) - y;
    s = t;
  }
  return s;
}

function addScaled(a, b, s) {
  // a += s * b (in-place)
  for (let i = 0; i < a.length; i++) a[i] += s * b[i];
}

function subScaled(a, b, s) {
  // a -= s * b (in-place)
  for (let i = 0; i < a.length; i++) a[i] -= s * b[i];
}

function norm2(a) { return dot(a, a); }

function roundNearest(x) { return Math.round(x); }

// Gram–Schmidt orthogonalization
// Given basis B (rows), compute b*_i, mu_{i,j}, and ||b*_i||^2.
export function gramSchmidt(B) {
  const m = B.length;
  const n = B[0].length;
  const Bstar = Array.from({ length: m }, () => zeros(n));
  const mu = Array.from({ length: m }, () => zeros(m));
  const BstarNorm2 = Array(m).fill(0);

  for (let i = 0; i < m; i++) {
    // Start with original vector
    Bstar[i] = B[i].slice();
    for (let j = 0; j < i; j++) {
      const denom = BstarNorm2[j];
      const coeff = denom === 0 ? 0 : dot(B[i], Bstar[j]) / denom; // μ_{i,j}
      mu[i][j] = coeff;
      // subtract projection onto b*_j
      subScaled(Bstar[i], Bstar[j], coeff);
    }
    BstarNorm2[i] = norm2(Bstar[i]);
  }
  return { Bstar, mu, BstarNorm2 };
}

// Reduce vector i against previous vectors using nearest-integer coefficients.
function sizeReduce(B, U, mu, i, eta = 0.5) {
  let reductions = 0;
  for (let k = i - 1; k >= 0; k--) {
    const mik = mu[i][k];
    if (Math.abs(mik) > eta) {
      const r = roundNearest(mik);
      if (r !== 0) {
        // b_i <- b_i - r b_k
        subScaled(B[i], B[k], r);
        if (U) subScaled(U[i], U[k], r); // track unimodular transform
        reductions++;
      }
    }
  }
  return reductions;
}

// Recompute Gram–Schmidt data from 0..upto (inclusive)
function recomputeGSUpTo(B, upto) {
  const Bb = B.slice(0, upto + 1);
  const { Bstar, mu, BstarNorm2 } = gramSchmidt(Bb);
  return { Bstar, mu, BstarNorm2 };
}

export function lll(inputBasis, opts = {}) {
  const {
    delta = 0.99, // 0.75 classical; 0.99 often yields stronger reduction
    eta = 0.5,    // nearest-integer size reduction
    computeU = false,
    maxIters = 100000,
    eps = 1e-12,
  } = opts;

  if (!(delta > 0.25 && delta <= 1)) throw new Error('LLL: delta must be in (1/4, 1]');
  if (!(eta >= 0 && eta <= 0.5)) throw new Error('LLL: eta must be in [0, 0.5]');

  if (!Array.isArray(inputBasis) || inputBasis.length === 0) {
    throw new Error('LLL: basis must be a non-empty array of row vectors');
  }
  const m = inputBasis.length;
  const n = inputBasis[0].length;
  for (const v of inputBasis) {
    if (!Array.isArray(v) || v.length !== n) throw new Error('LLL: all basis vectors must have the same dimension');
  }

  // Convert to numeric matrix
  const B = inputBasis.map(v => v.map(toNumber));
  const U = computeU ? identity(m) : null;

  // Initial GS
  let { Bstar, mu, BstarNorm2 } = gramSchmidt(B);
  for (let i = 0; i < m; i++) {
    if (BstarNorm2[i] < eps) {
      throw new Error(`LLL: basis appears rank-deficient near index ${i} (‖b*_i‖^2 ≈ 0)`);
    }
  }

  let i = 1;
  let swaps = 0;
  let reductions = 0;
  let iters = 0;

  while (i < m) {
    if (++iters > maxIters) throw new Error('LLL: exceeded maxIters — possible non-termination due to numerical issues');

    // Size-reduce b_i against previous vectors
    reductions += sizeReduce(B, U, mu, i, eta);

    // Recompute GS for the prefix 0..i (since b_i changed)
    {
      const gs = recomputeGSUpTo(B, i);
      // splice updated rows back
      for (let r = 0; r <= i; r++) {
        Bstar[r] = gs.Bstar[r];
        BstarNorm2[r] = gs.BstarNorm2[r];
        for (let c = 0; c <= i; c++) mu[r][c] = gs.mu[r][c] || 0;
      }
    }
    if (BstarNorm2[i] < eps) {
      throw new Error(`LLL: basis became rank-deficient at i=${i} during reduction`);
    }

    // Lovász condition
    const lhs = BstarNorm2[i];
    const rhs = (delta - mu[i][i - 1] * mu[i][i - 1]) * BstarNorm2[i - 1];

    if (lhs >= rhs - 1e-18) {
      // Condition satisfied — proceed
      i += 1;
    } else {
      // Swap b_i and b_{i-1}
      const tmp = B[i]; B[i] = B[i - 1]; B[i - 1] = tmp;
      if (U) { const tu = U[i]; U[i] = U[i - 1]; U[i - 1] = tu; }
      swaps += 1;

      // Recompute GS up to i (since both rows changed)
      const gs = recomputeGSUpTo(B, i);
      for (let r = 0; r <= i; r++) {
        Bstar[r] = gs.Bstar[r];
        BstarNorm2[r] = gs.BstarNorm2[r];
        for (let c = 0; c <= i; c++) mu[r][c] = gs.mu[r][c] || 0;
      }

      // Step back, but not below 1
      i = Math.max(i - 1, 1);
    }
  }

  return { basis: B, U, mu, Bstar, BstarNorm2, swaps, reductions };
}

function identity(n) {
  const I = Array.from({ length: n }, (_, i) => {
    const row = Array(n).fill(0);
    row[i] = 1;
    return row;
  });
  return I;
}

// Convenience wrapper for a plain basis (no diagnostics)
export default function lll_default(basis, opts) {
  return lll(basis, opts).basis;
}

// ---- Small example (commented): ----
// const B = [
//   [1, 1, 1],
//   [1, 0, 2],
//   [1, 2, 3]
// ];
// const { basis: R } = lll(B, { delta: 0.99, eta: 0.5 });
// console.log(R);
