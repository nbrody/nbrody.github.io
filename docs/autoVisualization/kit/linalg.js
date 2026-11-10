/* AutoViz kit · linalg — small dense real linear algebra (vectors are arrays, matrices are
   arrays of rows). Enough for reflection groups, projections of root systems, frames in ℝⁿ,
   spectra of symmetric matrices. Exposed as AV.la. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});

  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const scale = (a, k) => a.map(x => x * k);
  const axpy = (k, x, y) => y.map((yi, i) => yi + k * x[i]);          // y + k·x
  const norm = a => Math.sqrt(dot(a, a));
  const normalize = a => { const n = norm(a) || 1; return a.map(x => x / n); };
  const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Reflection in the hyperplane orthogonal to a (a need not be unit).
  const reflect = (x, a) => { const k = 2 * dot(x, a) / dot(a, a); return x.map((xi, i) => xi - k * a[i]); };

  const zeros = (r, c = r) => Array.from({ length: r }, () => new Array(c).fill(0));
  const eye = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  const transpose = A => A[0].map((_, j) => A.map(r => r[j]));
  const mul = (A, B) => A.map(row => B[0].map((_, j) => { let s = 0; for (let k = 0; k < row.length; k++) s += row[k] * B[k][j]; return s; }));
  const mulVec = (A, x) => A.map(row => dot(row, x));
  const maxAbsDiff = (A, B) => { let e = 0; A.forEach((r, i) => r.forEach((x, j) => { e = Math.max(e, Math.abs(x - B[i][j])); })); return e; };
  // Matrix whose columns are f(e_1), …, f(e_n) — the matrix of a linear map given as a function.
  const ofMap = (f, n) => transpose(eye(n).map(f));

  function pow(A, k) {
    let R = eye(A.length), B = A;
    while (k > 0) { if (k & 1) R = mul(R, B); B = mul(B, B); k >>= 1; }
    return R;
  }
  // Smallest k ≥ 1 with A^k = I (within tol), or 0 if none up to maxK.
  function orderOf(A, maxK = 500, tol = 1e-9) {
    const I = eye(A.length);
    let P = I;
    for (let k = 1; k <= maxK; k++) { P = mul(A, P); if (maxAbsDiff(P, I) < tol) return k; }
    return 0;
  }

  // Gaussian elimination with partial pivoting.
  function det(A) {
    const a = A.map(r => r.slice()), n = a.length;
    let d = 1;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      if (Math.abs(a[p][i]) < 1e-300) return 0;
      if (p !== i) { [a[p], a[i]] = [a[i], a[p]]; d = -d; }
      d *= a[i][i];
      for (let r = i + 1; r < n; r++) { const f = a[r][i] / a[i][i]; for (let c = i; c < n; c++) a[r][c] -= f * a[i][c]; }
    }
    return d;
  }
  function inv(A) {
    const n = A.length, a = A.map((r, i) => [...r, ...eye(n)[i]]);
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
      if (Math.abs(a[p][i]) < 1e-300) throw new Error('singular matrix');
      [a[p], a[i]] = [a[i], a[p]];
      const piv = a[i][i];
      for (let c = 0; c < 2 * n; c++) a[i][c] /= piv;
      for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i]; if (f) for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[i][c]; }
    }
    return a.map(r => r.slice(n));
  }
  const solve = (A, b) => mulVec(inv(A), b);

  // Lower-triangular L with G = L Lᵀ (G symmetric positive definite). Rows of L realise a Gram matrix.
  function cholesky(G) {
    const n = G.length, L = zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = G[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) throw new Error('Gram matrix not positive definite'); L[i][i] = Math.sqrt(s); }
      else L[i][j] = s / L[j][j];
    }
    return L;
  }

  // Orthonormalise a list of vectors in order (modified Gram–Schmidt); drops none.
  function gramSchmidt(vs) {
    const out = [];
    for (const v of vs) {
      let w = v.slice();
      for (const o of out) w = axpy(-dot(w, o), o, w);
      out.push(normalize(w));
    }
    return out;
  }

  // Cyclic Jacobi eigen-decomposition of a symmetric matrix; eigenpairs sorted by value, largest first.
  function jacobi(S, tol = 1e-26) {
    const n = S.length, a = S.map(r => r.slice()), V = eye(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < tol) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
        for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
        for (let k = 0; k < n; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
      }
    }
    return a.map((_, i) => ({ value: a[i][i], vector: V.map(r => r[i]) })).sort((x, y) => y.value - x.value);
  }

  // Rotate a frame (array of orthonormal vectors) in the plane of its members i and j.
  function rotateFrame(frame, i, j, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), A = frame[i], B = frame[j];
    frame[i] = A.map((x, k) => c * x + s * B[k]);
    frame[j] = B.map((x, k) => -s * A[k] + c * x);
    return frame;
  }
  // Interpolate two orthonormal frames (componentwise lerp, re-orthonormalised).
  const lerpFrame = (F, G, t) => gramSchmidt(F.map((v, k) => lerp(v, G[k], t)));

  // Largest principal angle (radians) between the planes spanned by (u1,v1) and (u2,v2), all unit + orthogonal pairs.
  function planeAngle(u1, v1, u2, v2) {
    const a = dot(u1, u2), b = dot(u1, v2), c = dot(v1, u2), d = dot(v1, v2);
    const p = a * a + c * c, q = b * b + d * d, r = a * b + c * d;
    const lo = (p + q) / 2 - Math.sqrt(((p - q) / 2) ** 2 + r * r);
    return Math.acos(Math.min(1, Math.sqrt(Math.max(0, lo))));
  }

  AV.la = {
    dot, add, sub, scale, axpy, norm, normalize, lerp, cross, reflect,
    zeros, eye, transpose, mul, mulVec, maxAbsDiff, ofMap, pow, orderOf, det, inv, solve,
    cholesky, gramSchmidt, jacobi, rotateFrame, lerpFrame, planeAngle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
