// algGroups.js
// Geometry of Linear Groups — Algebraic Groups utilities
// Defines AlgGroup, with a Monte Carlo / symbolic pipeline to approximate the
// Zariski-closure of a finitely generated subgroup of an algebraic (linear) group.
// 
// Dependencies (optional but used when available):
//   - polynomialRings.js  (exposes a polynomial ring + parser utilities)
//   - grobner.js          (exposes grobnerBasis / radical / eliminate / saturate)
//
// This file is designed to be robust even if the above utilities are not present.
// In that case, it will still produce generators for the vanishing ideal as strings,
// and provide evaluation-based testing. When grobner.js is available, it refines
// the generators via Gröbner/radical/saturation operations.
//
// Author: (c) 2025, Nic + ChatGPT
// License: MIT

/* eslint-disable no-undef */

let PR = null;
let GB = null;
try {
  // Prefer ESM
  // eslint-disable-next-line import/no-unresolved
  PR = await import('./polynomialRings.js').then(m => m.default || m).catch(() => null);
} catch (e) {
  // noop; PR stays null
}
try {
  // eslint-disable-next-line import/no-unresolved
  GB = await import('./grobner.js').then(m => m.default || m).catch(() => null);
} catch (e) {
  // noop; GB stays null
}

// ------------------------------
// Small exact rational arithmetic
// ------------------------------
class Q {
  constructor(num = 0n, den = 1n) {
    if (typeof num === 'number') num = BigInt(num);
    if (typeof den === 'number') den = BigInt(den);
    if (typeof num === 'string') {
      if (num.includes('/')) {
        const [a, b] = num.split('/');
        num = BigInt(a.trim());
        den = BigInt((b ?? '1').trim());
      } else {
        num = BigInt(num);
      }
    }
    if (typeof den === 'string') den = BigInt(den);
    if (den === 0n) throw new Error('Division by zero in Q');
    const s = den < 0n ? -1n : 1n;
    num = num * s;
    den = den * s;
    const g = Q.#gcd(Q.#abs(num), Q.#abs(den));
    this.n = num / g;
    this.d = den / g;
  }
  static from(x) {
    if (x instanceof Q) return x;
    if (typeof x === 'bigint') return new Q(x, 1n);
    if (typeof x === 'number') return new Q(BigInt(x), 1n);
    if (typeof x === 'string') return new Q(x);
    throw new Error('Unsupported type for Q');
  }
  static zero() { return new Q(0n, 1n); }
  static one() { return new Q(1n, 1n); }
  static #abs(a) { return a < 0n ? -a : a; }
  static #gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
  add(b) { b = Q.from(b); return new Q(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(b) { b = Q.from(b); return new Q(this.n * b.d - b.n * this.d, this.d * b.d); }
  mul(b) { b = Q.from(b); return new Q(this.n * b.n, this.d * b.d); }
  div(b) { b = Q.from(b); if (b.n === 0n) throw new Error('Division by zero'); return new Q(this.n * b.d, this.d * b.n); }
  neg() { return new Q(-this.n, this.d); }
  isZero() { return this.n === 0n; }
  eq(b) { b = Q.from(b); return this.n === b.n && this.d === b.d; }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  toNumber() { return Number(this.n) / Number(this.d); }
}

// ------------------------------
// Basic exact matrix arithmetic over Q
// ------------------------------
const MatQ = {
  I(n) {
    const A = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? Q.one() : Q.zero())));
    return A;
  },
  from(A) {
    return A.map(row => row.map(Q.from));
  },
  mul(A, B) {
    const n = A.length, m = B[0].length, k = B.length;
    const C = Array.from({ length: n }, () => Array.from({ length: m }, () => Q.zero()));
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < k; t++) {
        const a = A[i][t];
        if (a.isZero()) continue;
        for (let j = 0; j < m; j++) {
          C[i][j] = C[i][j].add(a.mul(B[t][j]));
        }
      }
    }
    return C;
  },
  det(A) {
    // Fractional Gaussian elimination (copies input)
    const n = A.length;
    const M = A.map(r => r.map(Q.from));
    let det = Q.one();
    for (let i = 0, r = 0; i < n; i++, r++) {
      // find pivot
      let piv = r;
      while (piv < n && M[piv][i].isZero()) piv++;
      if (piv === n) return Q.zero();
      if (piv !== r) {
        const tmp = M[piv]; M[piv] = M[r]; M[r] = tmp;
        det = det.neg();
      }
      const p = M[r][i];
      det = det.mul(p);
      // normalize row
      for (let j = i; j < n; j++) M[r][j] = M[r][j].div(p);
      // eliminate
      for (let rr = r + 1; rr < n; rr++) {
        const f = M[rr][i];
        if (f.isZero()) continue;
        for (let j = i; j < n; j++) {
          M[rr][j] = M[rr][j].sub(f.mul(M[r][j]));
        }
      }
    }
    return det;
  },
  inv(A) {
    const n = A.length;
    const M = A.map((row, i) => [...row.map(Q.from), ...MatQ.I(n)[i]]);
    // Gauss-Jordan
    for (let i = 0; i < n; i++) {
      // pivot
      let piv = i;
      while (piv < n && M[piv][i].isZero()) piv++;
      if (piv === n) throw new Error('Matrix is singular; cannot invert');
      if (piv !== i) { const tmp = M[piv]; M[piv] = M[i]; M[i] = tmp; }
      const p = M[i][i];
      // normalize
      for (let j = 0; j < 2 * n; j++) M[i][j] = M[i][j].div(p);
      // eliminate
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = M[r][i];
        if (f.isZero()) continue;
        for (let j = 0; j < 2 * n; j++) {
          M[r][j] = M[r][j].sub(f.mul(M[i][j]));
        }
      }
    }
    // extract right half
    return M.map(row => row.slice(n));
  },
  key(A) {
    // canonical string key for dedup
    return A.map(row => row.map(q => Q.from(q).toString()).join(',')).join(';');
  }
};

// ------------------------------------------------------
// Polynomial variables & monomials for n x n matrix space
// ------------------------------------------------------
function matrixVarNames(n) {
  const vars = [];
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      vars.push(`x_${i}_${j}`);
    }
  }
  return vars;
}

function* monomialsUpToDeg(nvars, d) {
  // Yields exponent vectors e in N^{nvars} with sum(e) <= d
  const e = Array(nvars).fill(0);
  function rec(pos, degLeft) {
    if (pos === nvars) { yield e.slice(); return; }
    for (let t = 0; t <= degLeft; t++) {
      e[pos] = t;
      rec(pos + 1, degLeft - t);
    }
  }
  return rec(0, d);
}

// Build monomial string from exponent vector
function monomialToString(vars, exp) {
  const parts = [];
  for (let i = 0; i < vars.length; i++) {
    const k = exp[i];
    if (k === 0) continue;
    if (k === 1) parts.push(vars[i]);
    else parts.push(`${vars[i]}^${k}`);
  }
  return parts.length ? parts.join('*') : '1';
}

// Determinant polynomial det(X) in variables x_{i,j}
function detSymbolic(n, vars) {
  // Laplace expansion by permutations (n! terms). OK for n<=4. For n>4 we
  // produce a formal "det" symbol to be used only for saturation string.
  if (n > 4) return 'detX'; // fallback symbol
  const idx = (i, j) => vars[(i - 1) * n + (j - 1)];
  // Generate permutations
  const permute = (arr) => {
    if (arr.length <= 1) return [arr];
    const res = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permute(rest)) res.push([arr[i], ...p]);
    }
    return res;
  };
  const perms = permute([...Array(n)].map((_, i) => i + 1));
  const terms = perms.map(p => {
    // sign
    let inv = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (p[i] > p[j]) inv++;
    const sgn = inv % 2 === 0 ? '' : '-';
    const mon = p.map((j, i) => idx(i + 1, j)).join('*');
    return sgn + mon;
  });
  return terms.join(' + ').replace(/\+\s-\s/g, '- ');
}

// --------------------------------------
// Nullspace over Q (returns basis vectors)
// --------------------------------------
function nullspace_Q(A /* rows of Q */, cols) {
  // A is m x n matrix over Q; Gaussian elimination to RREF, then extract nullspace basis.
  const m = A.length;
  const n = cols ?? (A[0]?.length || 0);
  const M = Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => Q.from(A[i][j])));
  let row = 0;
  const pivots = Array(n).fill(-1);
  for (let col = 0; col < n && row < m; col++) {
    // find pivot
    let r = row;
    while (r < m && M[r][col].isZero()) r++;
    if (r === m) continue;
    // swap
    if (r !== row) { const tmp = M[r]; M[r] = M[row]; M[row] = tmp; }
    // normalize
    const p = M[row][col];
    for (let j = col; j < n; j++) M[row][j] = M[row][j].div(p);
    // eliminate
    for (let i = 0; i < m; i++) {
      if (i === row) continue;
      const f = M[i][col];
      if (f.isZero()) continue;
      for (let j = col; j < n; j++) {
        M[i][j] = M[i][j].sub(f.mul(M[row][j]));
      }
    }
    pivots[col] = row;
    row++;
  }
  const pivotCols = pivots.map((r, c) => (r !== -1 ? c : -1)).filter(c => c !== -1);
  const freeCols = [...Array(n)].map((_, i) => i).filter(i => !pivotCols.includes(i));
  // basis vector per free column
  const basis = [];
  for (const fcol of freeCols) {
    const v = Array(n).fill(Q.zero());
    v[fcol] = Q.one();
    // solve pivot columns: v[pcol] = -sum_j (M[pivotRow][j] * v[j])
    for (let pcol = n - 1; pcol >= 0; pcol--) {
      const prow = pivots[pcol];
      if (prow === -1) continue;
      let s = Q.zero();
      for (let j = pcol + 1; j < n; j++) {
        if (M[prow][j].isZero()) continue;
        s = s.add(M[prow][j].mul(v[j]));
      }
      v[pcol] = s.neg(); // because pivot row is [0.., 1, *, *, ...]
    }
    basis.push(v);
  }
  return basis;
}

// ----------------------------------------------
// Build vanishing polynomials from sample points
// ----------------------------------------------
function polynomialsVanishingOnPoints(points, vars, degreeBound = 2) {
  // points: Array of matrices (n x n) over Q
  const n = points[0].length;
  const nvars = vars.length; // n^2
  // Build monomial list up to degree d
  const exps = [];
  for (const e of monomialsUpToDeg(nvars, degreeBound)) exps.push(e);
  // Evaluate each monomial at each point, produce linear system A * c = 0
  // Arrange row per point, col per monomial
  const A = [];
  for (const M of points) {
    // flatten entries to v = [x_11, x_12, ..., x_nn] as Q
    const x = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) x.push(Q.from(M[i][j]));
    const row = [];
    for (const e of exps) {
      // value = prod_k x_k^{e_k}
      let val = Q.one();
      for (let k = 0; k < e.length; k++) {
        const ek = e[k];
        if (ek === 0) continue;
        // repeated multiply (small degrees)
        for (let t = 0; t < ek; t++) val = val.mul(x[k]);
      }
      row.push(val);
    }
    A.push(row);
  }
  const N = nullspace_Q(A);
  // Convert nullspace vectors to polynomials: sum_i c_i * monomial_i(vars)
  const polys = N.map(coeffs => {
    const terms = [];
    for (let i = 0; i < coeffs.length; i++) {
      const c = coeffs[i];
      if (Q.from(c).isZero()) continue;
      const mon = monomialToString(vars, exps[i]);
      const cstr = Q.from(c).toString();
      if (mon === '1') {
        terms.push(`${cstr}`);
      } else if (cstr === '1') {
        terms.push(`${mon}`);
      } else if (cstr === '-1') {
        terms.push(`-${mon}`);
      } else {
        terms.push(`(${cstr})*${mon}`);
      }
    }
    // Join as sum; normalize leading sign
    let s = terms.join(' + ');
    s = s.replace(/\+\s-\s/g, '- ');
    return s.length ? s : '0';
  }).filter(f => f !== '0');
  return polys;
}

// ------------------------------
// Gröbner + ideal utilities (opt)
// ------------------------------
function tryBuildRing(vars, order = 'grevlex') {
  if (!PR) return null;
  // Try a few common constructors
  if (typeof PR.PolynomialRing === 'function') {
    try { return PR.PolynomialRing('QQ', vars, { order }); } catch {}
    try { return PR.PolynomialRing(vars, { order }); } catch {}
  }
  if (typeof PR.polyRing === 'function') {
    try { return PR.polyRing({ coeff: 'QQ', vars, order }); } catch {}
  }
  return null;
}

function tryParsePoly(ring, s) {
  if (!ring || !PR) return null;
  if (typeof ring.parse === 'function') { try { return ring.parse(s); } catch {} }
  if (typeof PR.parse === 'function') { try { return PR.parse(ring, s); } catch {} }
  return null;
}

function idealFromStrings(ring, strs) {
  if (!ring) return { type: 'string', generators: strs.slice() };
  const gens = [];
  for (const s of strs) {
    const p = tryParsePoly(ring, s);
    if (!p) return { type: 'string', generators: strs.slice() }; // fallback completely
    gens.push(p);
  }
  if (PR.Ideal) { return new PR.Ideal(ring, gens); }
  return { type: 'ring+gens', ring, generators: gens };
}

function tryGrobnerBasis(idealLike) {
  if (!GB) return null;
  if (GB.grobnerBasis) {
    try { return GB.grobnerBasis(idealLike); } catch {}
  }
  if (typeof idealLike.grobnerBasis === 'function') {
    try { return idealLike.grobnerBasis(); } catch {}
  }
  return null;
}

function tryRadical(idealLike) {
  if (!GB) return null;
  if (GB.radical) {
    try { return GB.radical(idealLike); } catch {}
  }
  if (typeof idealLike.radical === 'function') {
    try { return idealLike.radical(); } catch {}
  }
  return null;
}

function trySaturate(idealLike, ring, detStr) {
  // Implement saturation I : det^∞ via elimination if available:
  // Introduce new var t, J = I + < t*det - 1 >, eliminate t.
  if (!GB || !ring) return null;
  const allVars = ring.vars ? ring.vars.slice() : (ring.variables || []);
  const t = 't_aux_saturation';
  if (allVars.includes(t)) return null; // avoid clash
  // Build extended ring
  const extRing = tryBuildRing([...allVars, t], 'lex');
  if (!extRing) return null;
  const parsedDet = tryParsePoly(extRing, detStr);
  if (!parsedDet) return null;
  const one = tryParsePoly(extRing, '1');
  const tSym = tryParsePoly(extRing, t);
  const tDetMinus1 = GB.sub ? GB.sub(GB.mul(tSym, parsedDet), one)
    : tryParsePoly(extRing, `(${t})*(${detStr}) - 1`);
  const J = (PR && PR.Ideal) ? new PR.Ideal(extRing, [
    ...(idealLike.generators || idealLike),
    tDetMinus1
  ]) : { type: 'ring+gens', ring: extRing, generators: [...(idealLike.generators || idealLike), tDetMinus1] };
  // Eliminate t
  if (GB.eliminate) {
    try { return GB.eliminate(J, [t]); } catch {}
  }
  if (GB.grobnerBasis) {
    try {
      const GBJ = GB.grobnerBasis(J, { order: 'lex', eliminate: [t] });
      return GBJ;
    } catch {}
  }
  return null;
}

// ------------------------------
// AlgGroup Class
// ------------------------------
export class AlgGroup {
  /**
   * @param {number} n  size of the matrices (group ⊂ GL_n)
   * @param {Object} opts
   *    opts.name: string label
   *    opts.definingIdeal: array of strings (polys in x_{i,j}) or an Ideal from PR
   *    opts.order: monomial order for rings / GB
   */
  constructor(n, opts = {}) {
    if (!Number.isInteger(n) || n < 1) throw new Error('AlgGroup: n must be a positive integer');
    this.n = n;
    this.name = opts.name || `Subgroup of GL_${n}`;
    this.vars = matrixVarNames(n);
    this.order = opts.order || 'grevlex';
    // definingIdeal can be strings or PR.Ideal-compatible
    this.definingIdeal = opts.definingIdeal || [];
    this.generators = []; // subgroup generators (matrices over Q)
    // Try instantiate a polynomial ring if available
    this.ring = tryBuildRing(this.vars, this.order);
  }

  /**
   * Add a generator matrix (array of arrays) with integer/rational entries.
   * Entries may be integers, JS numbers, strings like "a/b", or Q instances.
   */
  addGenerator(M) {
    const n = this.n;
    if (!Array.isArray(M) || M.length !== n || M.some(r => !Array.isArray(r) || r.length !== n)) {
      throw new Error(`Generator must be an ${n}x${n} matrix`);
    }
    const MM = MatQ.from(M);
    this.generators.push(MM);
    return this;
  }

  /**
   * Return the determinant polynomial string det(X) for saturation.
   */
  detPolynomialString() {
    return detSymbolic(this.n, this.vars);
  }

  /**
   * Generate unique subgroup elements by words up to length L (including inverses).
   * Returns an array of matrices (over Q).
   */
  enumerateWords(L = 4, maxCount = 2000) {
    if (this.generators.length === 0) return [];
    const gens = this.generators;
    const invs = gens.map(g => MatQ.inv(g));
    const dic = new Map();
    const out = [];

    function push(M) {
      const k = MatQ.key(M);
      if (dic.has(k)) return;
      dic.set(k, true);
      out.push(M);
    }

    const I = MatQ.I(this.n);
    push(I);

    let frontier = [I];
    for (let ell = 1; ell <= L; ell++) {
      const next = [];
      for (const W of frontier) {
        for (let i = 0; i < gens.length; i++) {
          const M1 = MatQ.mul(W, gens[i]);
          const M2 = MatQ.mul(W, invs[i]);
          if (out.length < maxCount) { push(M1); next.push(M1); }
          if (out.length < maxCount) { push(M2); next.push(M2); }
          if (out.length >= maxCount) break;
        }
        if (out.length >= maxCount) break;
      }
      frontier = next;
      if (out.length >= maxCount) break;
    }
    return out;
  }

  /**
   * Compute a set of polynomial generators (as strings) vanishing on the subgroup sample.
   * @param {Object} options
   *   - wordLength: length of words to enumerate
   *   - degreeBound: monomial degree bound for interpolation
   *   - includeDefiningIdeal: whether to add group-defining equations
   *   - saturateByDet: ensure we describe a subset of GL_n (default true)
   *   - reduceGroebner: attempt Grobner basis reduction if available (default true)
   *   - radicalize: attempt radical if available (default true)
   *   - sampleLimit: cap number of sampled elements
   */
  zariskiClosure(options = {}) {
    const {
      wordLength = 4,
      degreeBound = 2,
      includeDefiningIdeal = true,
      saturateByDet = true,
      reduceGroebner = true,
      radicalize = true,
      sampleLimit = 1200,
    } = options;

    if (this.generators.length === 0) {
      throw new Error('AlgGroup.zariskiClosure: no generators provided');
    }

    const points = this.enumerateWords(wordLength, sampleLimit);
    if (points.length === 0) {
      throw new Error('AlgGroup.zariskiClosure: no points generated');
    }

    // Interpolate vanishing polynomials up to degreeBound
    const vanishingStrings = polynomialsVanishingOnPoints(points, this.vars, degreeBound);

    // Compose with defining ideal of G if requested
    const defIdealStrs = [];
    if (includeDefiningIdeal && Array.isArray(this.definingIdeal) && this.definingIdeal.length) {
      for (const s of this.definingIdeal) {
        if (typeof s === 'string') defIdealStrs.push(s);
      }
    }

    // Initial ideal (as strings)
    let genStrs = [...vanishingStrings, ...defIdealStrs];

    // If ring & parser exist, translate to an ideal-like object
    let idealLike = idealFromStrings(this.ring, genStrs);

    // Optionally saturate by det(X)
    let detStr = this.detPolynomialString();
    if (saturateByDet) {
      if (this.n <= 4) {
        // we can meaningfully parse detStr
        const sat = trySaturate(idealLike, this.ring, detStr);
        if (sat) idealLike = sat;
        // else: if saturation unsupported, just append a guard polynomial
        // Note: "detX" symbol for n>4 is handled below
      } else {
        // For n>4, we can't easily expand det; add formal guard that det != 0
        // by introducing the relation t*detX - 1 with a fresh "detX" symbol.
        // As parser likely can't handle it, leave as comment in metadata.
        genStrs.push('// Saturation by det(X) requested but n>4; using a formal guard.');
      }
    }

    // Optional Gröbner reduction
    let gb = null;
    if (reduceGroebner) {
      gb = tryGrobnerBasis(idealLike);
      if (gb) idealLike = gb;
    }

    // Optional radical
    let rad = null;
    if (radicalize) {
      rad = tryRadical(idealLike);
      if (rad) idealLike = rad;
    }

    // Ensure we always have something to return in string form
    let generatorsOut = genStrs.slice();
    if (this.ring && (idealLike?.generators || Array.isArray(idealLike))) {
      // Try stringify ring polynomials if possible
      const gens = idealLike.generators || idealLike;
      const toStr = (p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p.toString === 'function') return p.toString();
        return String(p);
      };
      generatorsOut = gens.map(toStr);
    }

    return {
      ring: this.ring,
      variables: this.vars.slice(),
      degreeBound,
      wordLength,
      sampleCount: points.length,
      generators: generatorsOut,
      idealLike,   // May be PR.Ideal / GB object; use in other modules if needed
      notes: (this.n > 4 && saturateByDet)
        ? 'Saturation by det(X) was requested but n>4; returned ideal is not guaranteed to exclude det=0 components. Consider providing an explicit determinant symbol or enable grobner/elimination with a parser.'
        : undefined
    };
  }

  /**
   * Evaluate a polynomial string f(x_{ij}) on a matrix M and return Q.
   * This is a lightweight parser supporting +, -, *, ^ and variables x_i_j and rational coefficients.
   */
  static evalPolyStringOnMatrix(polyStr, M) {
    const n = M.length;
    const vars = {};
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) {
        vars[`x_${i}_${j}`] = Q.from(M[i - 1][j - 1]);
      }
    }
    // Tokenize very simply
    const cleaned = polyStr.replace(/\s+/g, '');
    if (!cleaned) return Q.zero();

    // Shunting-yard for +,-,*,^ with unary -
    const isVar = (t) => /^x_\d+_\d+$/.test(t);
    const isNum = (t) => /^-?\d+(\/\d+)?$/.test(t);
    // Split into tokens (numbers, vars, operators, parentheses)
    const tokens = [];
    for (let i = 0; i < cleaned.length; ) {
      const c = cleaned[i];
      if ('+-*^()'.includes(c)) { tokens.push(c); i++; continue; }
      if (c === 'x') {
        // variable
        const m = cleaned.slice(i).match(/^x_\d+_\d+/);
        if (!m) throw new Error('Parse error near ' + cleaned.slice(i, i + 8));
        tokens.push(m[0]); i += m[0].length; continue;
      }
      if (/\d/.test(c)) {
        const m = cleaned.slice(i).match(/^\d+(\/\d+)?/);
        tokens.push(m[0]); i += m[0].length; continue;
      }
      throw new Error('Unexpected character in polynomial: ' + c);
    }
    // Handle unary minus: insert 0 before leading '-' or after '('
    const norm = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '-' && (i === 0 || tokens[i - 1] === '(' || '+-*^'.includes(tokens[i - 1]))) {
        norm.push('0'); norm.push('-');
      } else {
        norm.push(t);
      }
    }
    // Precedence
    const prec = { '+': 1, '-': 1, '*': 2, '^': 3 };
    const out = [];
    const op = [];
    for (const t of norm) {
      if (isVar(t) || isNum(t)) out.push(t);
      else if (t === '(') op.push(t);
      else if (t === ')') {
        while (op.length && op[op.length - 1] !== '(') out.push(op.pop());
        if (!op.length) throw new Error('Mismatched parentheses');
        op.pop();
      } else if (['+', '-', '*', '^'].includes(t)) {
        while (op.length && ['+', '-', '*', '^'].includes(op[op.length - 1]) &&
               ((t !== '^' && prec[op[op.length - 1]] >= prec[t]) ||
                (t === '^' && prec[op[op.length - 1]] > prec[t]))) {
          out.push(op.pop());
        }
        op.push(t);
      } else {
        throw new Error('Unknown token: ' + t);
      }
    }
    while (op.length) {
      const t = op.pop();
      if (t === '(' || t === ')') throw new Error('Mismatched parentheses');
      out.push(t);
    }
    // Evaluate RPN
    const st = [];
    for (const t of out) {
      if (isNum(t)) st.push(Q.from(t));
      else if (isVar(t)) st.push(vars[t] ?? Q.zero());
      else if (t === '+') { const b = st.pop(), a = st.pop(); st.push(a.add(b)); }
      else if (t === '-') { const b = st.pop(), a = st.pop(); st.push(a.sub(b)); }
      else if (t === '*') { const b = st.pop(), a = st.pop(); st.push(a.mul(b)); }
      else if (t === '^') {
        const b = st.pop(); const a = st.pop();
        if (!(b instanceof Q) || b.d !== 1n) throw new Error('Exponent must be integer');
        let k = b.n;
        if (k < 0n) throw new Error('Negative exponents unsupported in eval');
        let res = Q.one();
        for (let i = 0n; i < k; i++) res = res.mul(a);
        st.push(res);
      } else {
        throw new Error('Unknown op: ' + t);
      }
    }
    if (st.length !== 1) throw new Error('Evaluation stack error');
    return st[0];
  }

  /**
   * Check if a matrix M satisfies all generators returned from zariskiClosure().
   * @param {*} closureResult The object returned by zariskiClosure()
   */
  static matrixSatisfiesIdeal(closureResult, M) {
    for (const f of closureResult.generators) {
      if (typeof f !== 'string') continue; // skip non-string forms in this checker
      const val = AlgGroup.evalPolyStringOnMatrix(f, M);
      if (!val.isZero()) return false;
    }
    return true;
  }
}

// ------------------------------
// Example (usage in comments)
//
// import { AlgGroup } from './algGroups.js';
//
// // Example: subgroup of GL_2 generated by two integer matrices.
// const G = new AlgGroup(2, { name: 'Example subgroup' });
// G.addGenerator([[1, 1], [0, 1]]);   // T
// G.addGenerator([[0, -1], [1, 0]]);  // S
//
// const closure = G.zariskiClosure({
//   wordLength: 4,
//   degreeBound: 2,
//   includeDefiningIdeal: true,
//   saturateByDet: true,
//   reduceGroebner: true,
//   radicalize: true,
// });
//
// console.log('Generators for ideal (strings):', closure.generators);
// // If PR/GB are available, you can pass closure.idealLike to downstream routines.
//
// // Membership test:
// const M = [[1, 1], [0, 1]];
// console.log('M in closure?', AlgGroup.matrixSatisfiesIdeal(closure, MatQ.from(M)));
//
// ------------------------------
