/* Daily Math Atelier — dense linear algebra, decompositions & rotations */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, s) => a.map(v => v * s);
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const norm = a => Math.hypot(...a);
  const unit = a => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : a.slice(); };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  const eye = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  const clone = M => M.map(r => r.slice());
  const transpose = M => M[0].map((_, j) => M.map(r => r[j]));
  const trace = M => M.reduce((s, r, i) => s + r[i], 0);

  function mul(A, B) {
    const m = A.length, k = A[0].length, n = B[0].length;
    const C = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let i = 0; i < m; i++) {
      for (let p = 0; p < k; p++) {
        const aip = A[i][p];
        if (aip === 0) continue;
        for (let j = 0; j < n; j++) C[i][j] += aip * B[p][j];
      }
    }
    return C;
  }

  function mv(M, v) {
    return M.map(row => dot(row, v));
  }

  function luSolve(A, rhs) {
    const n = A.length;
    const M = A.map((r, i) => [...r, ...(rhs ? [rhs[i]] : eye(n)[i])]);
    const cols = M[0].length;
    let sign = 1;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let i = col + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[piv][col])) piv = i;
      if (Math.abs(M[piv][col]) < 1e-15) return null;
      if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; sign = -sign; }
      const d = M[col][col];
      for (let j = col; j < cols; j++) M[col][j] /= d;
      for (let i = 0; i < n; i++) {
        if (i === col) continue;
        const f = M[i][col];
        if (f === 0) continue;
        for (let j = col; j < cols; j++) M[i][j] -= f * M[col][j];
      }
    }
    return { sign, inv: M.map(r => r.slice(n)) };
  }

  function det(A) {
    const n = A.length;
    const M = clone(A);
    let d = 1;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let i = col + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[piv][col])) piv = i;
      if (Math.abs(M[piv][col]) < 1e-15) return 0;
      if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; d = -d; }
      d *= M[col][col];
      for (let i = col + 1; i < n; i++) {
        const f = M[i][col] / M[col][col];
        for (let j = col + 1; j < n; j++) M[i][j] -= f * M[col][j];
      }
    }
    return d;
  }

  function inv(A) {
    const res = luSolve(A);
    return res ? res.inv : null;
  }

  function gramSchmidt(vecs) {
    const basis = [];
    for (const v of vecs) {
      let w = v.slice();
      for (const e of basis) w = sub(w, scale(e, dot(w, e)));
      const n = norm(w);
      if (n > 1e-12) basis.push(scale(w, 1 / n));
    }
    return basis;
  }

  // Symmetric Jacobi eigensolver -> { values, vectors } sorted descending by value
  function jacobi(S, maxSweeps = 60) {
    const n = S.length;
    const A = clone(S);
    const V = eye(n);
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let maxOff = 0, p = 0, q = 1;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const v = Math.abs(A[i][j]);
          if (v > maxOff) { maxOff = v; p = i; q = j; }
        }
      }
      if (maxOff < 1e-13) break;
      const app = A[p][p], aqq = A[q][q], apq = A[p][q];
      const tau = (aqq - app) / (2 * apq);
      const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      A[p][p] = app - t * apq;
      A[q][q] = aqq + t * apq;
      A[p][q] = A[q][p] = 0;
      for (let r = 0; r < n; r++) {
        if (r !== p && r !== q) {
          const arp = A[r][p], arq = A[r][q];
          A[r][p] = A[p][r] = c * arp - s * arq;
          A[r][q] = A[q][r] = s * arp + c * arq;
        }
        const vrp = V[r][p], vrq = V[r][q];
        V[r][p] = c * vrp - s * vrq;
        V[r][q] = s * vrp + c * vrq;
      }
    }
    const pairs = Array.from({ length: n }, (_, i) => ({
      val: A[i][i],
      vec: V.map(row => row[i]),
    })).sort((a, b) => b.val - a.val);
    return { values: pairs.map(x => x.val), vectors: pairs.map(x => x.vec) };
  }

  function cholesky(S) {
    const n = S.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = S[i][j];
        for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
        if (i === j) {
          if (sum <= 0) return null;
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
    return L;
  }

  const rot2 = a => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
  function rot3(axis, a) {
    const [x, y, z] = unit(axis);
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [
      [t * x * x + c,     t * x * y - s * z, t * x * z + s * y],
      [t * x * y + s * z, t * y * y + c,     t * y * z - s * x],
      [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
    ];
  }
  function rot4(i, j, a) {
    const R = eye(4);
    const c = Math.cos(a), s = Math.sin(a);
    R[i][i] = c; R[i][j] = -s; R[j][i] = s; R[j][j] = c;
    return R;
  }

  function orderOf(M, maxOrder = 64, tol = 1e-8) {
    const n = M.length, I = eye(n);
    let P = clone(M);
    for (let k = 1; k <= maxOrder; k++) {
      let err = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) err = Math.max(err, Math.abs(P[i][j] - I[i][j]));
      if (err < tol) return k;
      P = mul(P, M);
    }
    return Infinity;
  }

  DM.la = { add, sub, scale, dot, norm, unit, cross, eye, clone, transpose, trace, mul, mv, det, inv, gramSchmidt, jacobi, cholesky, rot2, rot3, rot4, orderOf };
})(typeof window !== 'undefined' ? window : globalThis);
