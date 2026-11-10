/* AutoViz kit · exact — BigInt number theory and exact rationals, for pictures whose
   mathematics must be right on the nose. Exposed as AV.ex (functions) and AV.Q (rationals).
   All integer arguments may be Number or BigInt; results are BigInt unless noted. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});
  const B = x => (typeof x === 'bigint' ? x : BigInt(x));
  const abs = a => (a < 0n ? -a : a);

  function gcd(a, b) { a = abs(B(a)); b = abs(B(b)); while (b) [a, b] = [b, a % b]; return a; }
  const lcm = (a, b) => (B(a) === 0n || B(b) === 0n ? 0n : abs(B(a) / gcd(a, b) * B(b)));
  // Extended Euclid: [g, x, y] with a·x + b·y = g = gcd(a, b) ≥ 0.
  function egcd(a, b) {
    a = B(a); b = B(b);
    let [r0, r1, s0, s1, t0, t1] = [a, b, 1n, 0n, 0n, 1n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; [t0, t1] = [t1, t0 - q * t1]; }
    return r0 < 0n ? [-r0, -s0, -t0] : [r0, s0, t0];
  }
  const mod = (a, m) => { a = B(a); m = B(m); const r = a % m; return r < 0n ? r + abs(m) : r; };
  function modPow(b, e, m) {
    b = mod(b, m); e = B(e); m = B(m);
    let r = 1n;
    while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; }
    return r;
  }
  function modInv(a, m) { const [g, x] = egcd(a, m); if (g !== 1n) throw new Error('not invertible'); return mod(x, m); }
  // Deterministic Miller–Rabin for n < 3.3·10²⁴.
  function isPrime(n) {
    n = B(n);
    if (n < 2n) return false;
    for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]) { if (n === p) return true; if (n % p === 0n) return false; }
    let d = n - 1n, s = 0;
    while (!(d & 1n)) { d >>= 1n; s++; }
    for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]) {
      let x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      let comp = true;
      for (let r = 1; r < s; r++) { x = x * x % n; if (x === n - 1n) { comp = false; break; } }
      if (comp) return false;
    }
    return true;
  }
  // Prime factorisation as [[p, e], …] (trial division + Pollard rho).
  function factor(n) {
    n = abs(B(n));
    const out = new Map();
    const push = p => out.set(p, (out.get(p) || 0) + 1);
    for (const p of [2n, 3n, 5n]) while (n % p === 0n) { push(p); n /= p; }
    for (let p = 7n, i = 0; p * p <= n && p < 10000n; p += [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n][i++ % 8]) while (n % p === 0n) { push(p); n /= p; }
    const rho = m => {
      if (m % 2n === 0n) return 2n;
      for (let c = 1n; ; c++) {
        let x = 2n, y = 2n, d = 1n;
        const f = v => (v * v + c) % m;
        while (d === 1n) { x = f(x); y = f(f(y)); d = gcd(x - y, m); }
        if (d !== m) return d;
      }
    };
    const split = m => { if (m === 1n) return; if (isPrime(m)) { push(m); return; } const d = rho(m); split(d); split(m / d); };
    split(n);
    return [...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  // σ_k(n): sum of k-th powers of divisors.
  function sigma(n, k = 1) {
    let s = 1n;
    for (const [p, e] of factor(n)) { let t = 1n, pk = p ** B(k); for (let i = 0; i < e; i++) t = t * pk + 1n; s *= t; }
    return s;
  }

  /* ---- exact rationals ---- */
  class Q {
    constructor(n, d = 1n) {
      n = B(n); d = B(d);
      if (d === 0n) throw new Error('zero denominator');
      if (d < 0n) { n = -n; d = -d; }
      const g = gcd(n, d) || 1n;
      this.n = n / g; this.d = d / g;
    }
    static of(x, d) { return x instanceof Q ? x : new Q(x, d == null ? 1n : d); }
    // Exact value of a JS number (every double is a dyadic rational).
    static fromNumber(x) {
      if (!isFinite(x)) throw new Error('not finite');
      let d = 1n;
      while (!Number.isInteger(x)) { x *= 2; d *= 2n; }
      return new Q(BigInt(x), d);
    }
    add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
    div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
    neg() { return new Q(-this.n, this.d); }
    inv() { return new Q(this.d, this.n); }
    pow(k) { return k >= 0 ? new Q(this.n ** B(k), this.d ** B(k)) : this.inv().pow(-k); }
    cmp(o) { o = Q.of(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
    eq(o) { return this.cmp(o) === 0; }
    sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
    isInt() { return this.d === 1n; }
    floor() { const q = this.n / this.d; return this.n < 0n && q * this.d !== this.n ? q - 1n : q; }
    abs() { return this.n < 0n ? this.neg() : this; }
    valueOf() { return Number(this.n) / Number(this.d); }
    toNumber() { return this.valueOf(); }
    toString() { const s = (this.n < 0n ? '−' : '') + abs(this.n); return this.d === 1n ? s : s + '/' + this.d; }
    // HTML fraction for readouts: <sup>n</sup>⁄<sub>d</sub>
    toHTML() { return this.d === 1n ? this.toString() : (this.n < 0n ? '−' : '') + '<sup>' + abs(this.n) + '</sup>⁄<sub>' + this.d + '</sub>'; }
  }

  // Continued fraction [a0; a1, …] of a rational (exact) or of a real (first `terms`, float).
  function contFrac(x, terms = 24) {
    if (x instanceof Q) {
      const out = [];
      let n = x.n, d = x.d;
      while (d !== 0n) { let a = n / d; if (n < 0n && a * d !== n) a -= 1n; out.push(a); [n, d] = [d, n - a * d]; }
      return out;
    }
    const out = [];
    for (let i = 0; i < terms; i++) {
      const a = Math.floor(x);
      out.push(a);
      const f = x - a;
      if (Math.abs(f) < 1e-12) break;
      x = 1 / f;
    }
    return out;
  }
  // Convergents p_k/q_k of a continued fraction, as Q.
  function convergents(cf) {
    let [p0, q0, p1, q1] = [1n, 0n, B(cf[0]), 1n];
    const out = [new Q(p1, q1)];
    for (let i = 1; i < cf.length; i++) {
      const a = B(cf[i]);
      [p0, q0, p1, q1] = [p1, q1, a * p1 + p0, a * q1 + q0];
      out.push(new Q(p1, q1));
    }
    return out;
  }
  // Farey sequence F_n as Q in increasing order.
  function farey(n) {
    const out = [];
    let [a, b, c, d] = [0n, 1n, 1n, B(n)];
    out.push(new Q(a, b));
    while (c <= B(n)) {
      const k = (B(n) + b) / d;
      [a, b, c, d] = [c, d, k * c - a, k * d - b];
      out.push(new Q(a, b));
    }
    return out;
  }
  // Stern–Brocot path of a positive rational: string of 'L'/'R' (empty for 1).
  function sternBrocot(q) {
    q = Q.of(q);
    if (q.sign() <= 0) throw new Error('positive rationals only');
    let path = '', [m, n] = [q.n, q.d];
    while (m !== n) { if (m < n) { path += 'L'; n -= m; } else { path += 'R'; m -= n; } }
    return path;
  }

  /* ---- 2×2 integer matrices [[a,b],[c,d]] over BigInt ---- */
  const m2 = {
    of: (a, b, c, d) => [[B(a), B(b)], [B(c), B(d)]],
    mul: (X, Y) => [[X[0][0] * Y[0][0] + X[0][1] * Y[1][0], X[0][0] * Y[0][1] + X[0][1] * Y[1][1]],
                    [X[1][0] * Y[0][0] + X[1][1] * Y[1][0], X[1][0] * Y[0][1] + X[1][1] * Y[1][1]]],
    det: X => X[0][0] * X[1][1] - X[0][1] * X[1][0],
    tr: X => X[0][0] + X[1][1],
    inv: X => [[X[1][1], -X[0][1]], [-X[1][0], X[0][0]]],        // adjugate = inverse in SL₂(ℤ)
    eq: (X, Y) => X[0][0] === Y[0][0] && X[0][1] === Y[0][1] && X[1][0] === Y[1][0] && X[1][1] === Y[1][1],
    pow(X, k) {
      let R = m2.of(1, 0, 0, 1), P = X;
      if (k < 0) { P = m2.inv(X); k = -k; }
      while (k > 0) { if (k & 1) R = m2.mul(R, P); P = m2.mul(P, P); k >>= 1; }
      return R;
    },
    // Apply to a rational point of ℚ ∪ {∞} (∞ is null).
    act(X, q) {
      if (q === null) return X[1][0] === 0n ? null : new Q(X[0][0], X[1][0]);
      q = Q.of(q);
      const num = X[0][0] * q.n + X[0][1] * q.d, den = X[1][0] * q.n + X[1][1] * q.d;
      return den === 0n ? null : new Q(num, den);
    },
    str: X => '[' + X.map(r => r.map(x => (x < 0n ? '−' + -x : String(x))).join(' ')).join('; ') + ']',
  };

  AV.ex = { gcd, lcm, egcd, mod, modPow, modInv, isPrime, factor, sigma, contFrac, convergents, farey, sternBrocot, m2, big: B };
  AV.Q = Q;
})(typeof window !== 'undefined' ? window : globalThis);
