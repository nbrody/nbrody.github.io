/* Daily Math Atelier — exact BigInt arithmetic, rationals, continued fractions, SL2(Z), Gaussian integers */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  const bi = v => (typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v))));
  const abs = a => { const x = bi(a); return x < 0n ? -x : x; };

  function gcd(a, b) {
    let x = abs(a), y = abs(b);
    while (y !== 0n) { const t = x % y; x = y; y = t; }
    return x;
  }

  function lcm(a, b) {
    const x = abs(a), y = abs(b);
    return x === 0n || y === 0n ? 0n : (x / gcd(x, y)) * y;
  }

  function egcd(a, b) {
    let oldR = bi(a), r = bi(b);
    let oldS = 1n, s = 0n;
    let oldT = 0n, t = 1n;
    while (r !== 0n) {
      const q = oldR / r;
      [oldR, r] = [r, oldR - q * r];
      [oldS, s] = [s, oldS - q * s];
      [oldT, t] = [t, oldT - q * t];
    }
    if (oldR < 0n) return { g: -oldR, x: -oldS, y: -oldT };
    return { g: oldR, x: oldS, y: oldT };
  }

  function isPrime(n) {
    const x = bi(n);
    if (x < 2n) return false;
    if (x === 2n || x === 3n) return true;
    if (x % 2n === 0n || x % 3n === 0n) return false;
    for (let i = 5n; i * i <= x; i += 6n) {
      if (x % i === 0n || x % (i + 2n) === 0n) return false;
    }
    return true;
  }

  function factor(n) {
    let x = abs(n);
    const out = [];
    if (x < 2n) return out;
    for (const p of [2n, 3n]) {
      let e = 0;
      while (x % p === 0n) { x /= p; e++; }
      if (e) out.push([p, e]);
    }
    for (let p = 5n; p * p <= x; p += 6n) {
      for (const d of [p, p + 2n]) {
        let e = 0;
        while (x % d === 0n) { x /= d; e++; }
        if (e) out.push([d, e]);
      }
    }
    if (x > 1n) out.push([x, 1]);
    return out;
  }

  function divisors(n) {
    const facs = factor(n);
    let divs = [1n];
    for (const [p, e] of facs) {
      const next = [];
      let pow = 1n;
      for (let k = 0; k <= e; k++) {
        for (const d of divs) next.push(d * pow);
        pow *= p;
      }
      divs = next;
    }
    return divs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  function cfrac(num, den) {
    let a = bi(num), b = bi(den);
    if (b === 0n) throw new RangeError('Zero denominator');
    if (b < 0n) { a = -a; b = -b; }
    const out = [];
    while (b !== 0n) {
      let q = a / b;
      let r = a % b;
      if (r < 0n) { r += b; q -= 1n; }
      out.push(Number(q));
      a = b;
      b = r;
    }
    return out;
  }

  function cfracFloat(x, maxTerms = 14, tol = 1e-11) {
    let v = x;
    const out = [];
    for (let i = 0; i < maxTerms; i++) {
      const a = Math.floor(v);
      out.push(a);
      const frac = v - a;
      if (Math.abs(frac) < tol) break;
      v = 1 / frac;
      if (!Number.isFinite(v) || Math.abs(v) > 1e12) break;
    }
    return out;
  }

  function convergents(terms) {
    let p0 = 0n, p1 = 1n, q0 = 1n, q1 = 0n;
    const out = [];
    for (const t of terms) {
      const a = bi(t);
      const p = a * p1 + p0;
      const q = a * q1 + q0;
      out.push(Q.of(p, q));
      p0 = p1; p1 = p;
      q0 = q1; q1 = q;
    }
    return out;
  }

  function farey(n) {
    const out = [Q.of(0n, 1n)];
    let a = 0, b = 1, c = 1, d = n;
    while (c <= n) {
      const k = Math.floor((n + b) / d);
      const na = k * c - a, nb = k * d - b;
      a = c; b = d; c = na; d = nb;
      out.push(Q.of(BigInt(a), BigInt(b)));
    }
    return out;
  }

  const mat2 = {
    of: (a, b, c, d) => [bi(a), bi(b), bi(c), bi(d)],
    id: () => [1n, 0n, 0n, 1n],
    mul: (A, B) => [
      A[0] * B[0] + A[1] * B[2],
      A[0] * B[1] + A[1] * B[3],
      A[2] * B[0] + A[3] * B[2],
      A[2] * B[1] + A[3] * B[3],
    ],
    det: A => A[0] * A[3] - A[1] * A[2],
    inv: A => {
      const d = A[0] * A[3] - A[1] * A[2];
      if (d !== 1n && d !== -1n) throw new RangeError('mat2.inv requires det = +-1');
      return d === 1n ? [A[3], -A[1], -A[2], A[0]] : [-A[3], A[1], A[2], -A[0]];
    },
    pow: (A, k) => {
      let n = BigInt(k);
      let base = A.slice();
      if (n < 0n) { base = mat2.inv(base); n = -n; }
      let res = mat2.id();
      while (n > 0n) {
        if (n & 1n) res = mat2.mul(res, base);
        n >>= 1n;
        if (n > 0n) base = mat2.mul(base, base);
      }
      return res;
    },
    apply: (A, q) => Q.of(A[0] * q.n + A[1] * q.d, A[2] * q.n + A[3] * q.d),
  };

  const Q = {
    of(n, d = 1n) {
      let a = bi(n), b = bi(d);
      if (b === 0n) throw new RangeError('Zero denominator');
      if (b < 0n) { a = -a; b = -b; }
      const g = gcd(a, b);
      return { n: a / g, d: b / g };
    },
    add: (a, b) => Q.of(a.n * b.d + b.n * a.d, a.d * b.d),
    sub: (a, b) => Q.of(a.n * b.d - b.n * a.d, a.d * b.d),
    mul: (a, b) => Q.of(a.n * b.n, a.d * b.d),
    div: (a, b) => Q.of(a.n * b.d, a.d * b.n),
    neg: a => ({ n: -a.n, d: a.d }),
    eq: (a, b) => a.n === b.n && a.d === b.d,
    cmp: (a, b) => {
      const diff = a.n * b.d - b.n * a.d;
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    },
    toNumber: a => Number(a.n) / Number(a.d),
    toString: a => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`),
    toTex: a => (a.d === 1n ? String(a.n) : (a.n < 0n ? `-\\frac{${-a.n}}{${a.d}}` : `\\frac{${a.n}}{${a.d}}`)),
  };

  // Nearest-integer rounding helper for BigInt division: round(num / den)
  function divRoundInt(num, den) {
    let a = num, b = den;
    if (b < 0n) { a = -a; b = -b; }
    return a >= 0n ? (a + b / 2n) / b : -((-a + b / 2n) / b);
  }

  const Zi = {
    of: (re, im = 0n) => ({ re: bi(re), im: bi(im) }),
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    conj: a => ({ re: a.re, im: -a.im }),
    norm: a => a.re * a.re + a.im * a.im,
    eq: (a, b) => a.re === b.re && a.im === b.im,
    divRound(a, b) {
      const nb = Zi.norm(b);
      if (nb === 0n) throw new RangeError('Division by zero in Z[i]');
      const p = Zi.mul(a, Zi.conj(b));
      return { re: divRoundInt(p.re, nb), im: divRoundInt(p.im, nb) };
    },
    gcd(a, b) {
      let x = Zi.of(a.re, a.im), y = Zi.of(b.re, b.im);
      while (y.re !== 0n || y.im !== 0n) {
        const q = Zi.divRound(x, y);
        const r = Zi.sub(x, Zi.mul(q, y));
        x = y;
        y = r;
      }
      return x;
    },
  };

  DM.ex = { abs, gcd, lcm, egcd, isPrime, factor, divisors, cfrac, cfracFloat, convergents, farey, mat2 };
  DM.Q = Q;
  DM.Zi = Zi;
})(typeof window !== 'undefined' ? window : globalThis);
