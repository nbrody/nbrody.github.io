// Laurent polynomials with integer coefficients, stored as Map(exponent → coefficient).
// Exponents may be half-integers (Jones polynomials of links with an even number of components).

export const P = {
  zero: () => new Map(),
  one: () => new Map([[0, 1]]),
  mono: (e, c = 1) => new Map(c ? [[e, c]] : []),

  from(pairs) {
    const p = new Map();
    for (const [e, c] of pairs) P.addTerm(p, e, c);
    return p;
  },

  addTerm(p, e, c) {
    if (!c) return p;
    const v = (p.get(e) || 0) + c;
    if (v) p.set(e, v); else p.delete(e);
    return p;
  },

  add(a, b) {
    const r = new Map(a);
    for (const [e, c] of b) P.addTerm(r, e, c);
    return r;
  },

  addInto(target, b, scale = 1, shift = 0) {
    for (const [e, c] of b) P.addTerm(target, e + shift, c * scale);
    return target;
  },

  scale(a, s) {
    const r = new Map();
    if (s) for (const [e, c] of a) r.set(e, c * s);
    return r;
  },

  shift(a, k) {
    const r = new Map();
    for (const [e, c] of a) r.set(e + k, c);
    return r;
  },

  mul(a, b) {
    const r = new Map();
    for (const [e1, c1] of a) for (const [e2, c2] of b) P.addTerm(r, e1 + e2, c1 * c2);
    return r;
  },

  pow(a, n) {
    let r = P.one();
    for (let i = 0; i < n; i++) r = P.mul(r, a);
    return r;
  },

  // e ↦ k·e (e.g. A ↦ t^{-1/4} is k = −1/4)
  substitute(a, k) {
    const r = new Map();
    for (const [e, c] of a) P.addTerm(r, e * k, c);
    return r;
  },

  mirror(a) { return P.substitute(a, -1); },

  isZero: a => a.size === 0,

  minExp: a => Math.min(...a.keys()),
  maxExp: a => Math.max(...a.keys()),
  span: a => (a.size ? P.maxExp(a) - P.minExp(a) : 0),

  evalAt(a, x) {
    let s = 0;
    for (const [e, c] of a) s += c * Math.pow(x, e);
    return s;
  },

  key(a) {
    return [...a.entries()].sort((x, y) => x[0] - y[0]).map(([e, c]) => `${e}:${c}`).join(',');
  },

  equal: (a, b) => P.key(a) === P.key(b),

  // a up to multiplication by ±x^k: shift so the lowest exponent is 0, sign so the lowest coefficient is positive
  normalizeUnit(a) {
    if (!a.size) return a;
    const m = P.minExp(a);
    const s = Math.sign(a.get(m));
    const r = new Map();
    for (const [e, c] of a) r.set(e - m, c * s);
    return r;
  },

  toPairs(a) { return [...a.entries()].sort((x, y) => x[0] - y[0]); },

  // Divide exactly by (x^k + 1)·x^s style divisors: general exact division for integer exponents (after scaling)
  divExact(a, b) {
    // Work with exponents scaled to integers.
    const exps = [...a.keys(), ...b.keys()];
    let scale = 1;
    while (!exps.every(e => Number.isInteger(e * scale)) && scale < 64) scale *= 2;
    const A = new Map([...a].map(([e, c]) => [Math.round(e * scale), c]));
    const B = new Map([...b].map(([e, c]) => [Math.round(e * scale), c]));
    const bMax = Math.max(...B.keys()), bLead = B.get(bMax);
    const q = new Map();
    const r = new Map(A);
    let guard = 0;
    while (r.size && guard++ < 10000) {
      const rMax = Math.max(...r.keys());
      const rMin = Math.min(...r.keys());
      const bMin = Math.min(...B.keys());
      if (rMax - bMax < rMin - bMin) break;
      const c = r.get(rMax) / bLead;
      if (!Number.isInteger(c)) throw new Error('divExact: non-integer quotient');
      const e = rMax - bMax;
      P.addTerm(q, e, c);
      for (const [be, bc] of B) P.addTerm(r, be + e, -c * bc);
    }
    if (r.size) throw new Error('divExact: nonzero remainder');
    return new Map([...q].map(([e, c]) => [e / scale, c]));
  },

  // LaTeX, highest power first. `v` is the variable name.
  tex(a, v = 't') {
    if (!a.size) return '0';
    const terms = P.toPairs(a).reverse();
    let s = '';
    terms.forEach(([e, c], i) => {
      const neg = c < 0;
      const abs = Math.abs(c);
      const sign = neg ? '-' : (i ? '+' : '');
      let mon;
      if (e === 0) mon = '';
      else if (e === 1) mon = v;
      else mon = `${v}^{${expTex(e)}}`;
      const coef = (abs === 1 && mon) ? '' : String(abs);
      s += `${i ? ' ' : ''}${sign}${i && sign ? ' ' : ''}${coef}${mon}`;
    });
    return s.trim();
  },
};

function expTex(e) {
  if (Number.isInteger(e)) return String(e);
  const n = Math.round(e * 2);
  return n < 0 ? `-${-n}/2` : `${n}/2`;
}

// Dense integer polynomials (BigInt coefficients, nonnegative exponents) for exact determinants.
export const BP = {
  norm(a) { let n = a.length; while (n > 0 && a[n - 1] === 0n) n--; return n === a.length ? a : a.slice(0, n); },
  isZero: a => a.length === 0,
  add(a, b) {
    const n = Math.max(a.length, b.length), r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = (a[i] || 0n) + (b[i] || 0n);
    return BP.norm(r);
  },
  sub(a, b) {
    const n = Math.max(a.length, b.length), r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = (a[i] || 0n) - (b[i] || 0n);
    return BP.norm(r);
  },
  mul(a, b) {
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(0n);
    for (let i = 0; i < a.length; i++) if (a[i]) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    return BP.norm(r);
  },
  divExact(a, b) {
    if (!b.length) throw new Error('division by zero');
    if (!a.length) return [];
    const r = a.slice();
    const q = new Array(Math.max(0, a.length - b.length + 1)).fill(0n);
    const lead = b[b.length - 1];
    for (let i = r.length - b.length; i >= 0; i--) {
      const c = r[i + b.length - 1];
      if (c === 0n) continue;
      if (c % lead !== 0n) throw new Error('BP.divExact: non-integer quotient');
      const k = c / lead;
      q[i] = k;
      for (let j = 0; j < b.length; j++) r[i + j] -= k * b[j];
    }
    if (r.some(x => x !== 0n)) throw new Error('BP.divExact: nonzero remainder');
    return BP.norm(q);
  },
  // Bareiss fraction-free determinant of a square matrix of BigInt polynomials.
  det(M) {
    const n = M.length;
    if (n === 0) return [1n];
    const A = M.map(r => r.map(x => x.slice()));
    let sign = 1n, prev = [1n];
    for (let k = 0; k < n - 1; k++) {
      if (!A[k][k].length) {
        let s = k + 1;
        while (s < n && !A[s][k].length) s++;
        if (s === n) return [];
        [A[k], A[s]] = [A[s], A[k]];
        sign = -sign;
      }
      for (let i = k + 1; i < n; i++) {
        for (let j = k + 1; j < n; j++) {
          A[i][j] = BP.divExact(BP.sub(BP.mul(A[k][k], A[i][j]), BP.mul(A[i][k], A[k][j])), prev);
        }
      }
      prev = A[k][k];
    }
    const d = A[n - 1][n - 1];
    return sign < 0n ? d.map(x => -x) : d;
  },
};
