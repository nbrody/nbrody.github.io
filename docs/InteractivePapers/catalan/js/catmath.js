// Exact arithmetic for the Catalan walkthrough: BigInt rationals, the paper's
// parameters (2), Chebyshev rows (3), and the rational moment arrays (9)-(19).
// No DOM here, so node can import and test everything.

// ---------- BigInt rationals ----------

export function bgcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export class Q {
  constructor(n, d = 1n) {
    if (typeof n === 'number') n = BigInt(n);
    if (typeof d === 'number') d = BigInt(d);
    if (d === 0n) throw new Error('Q: zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d);
    if (g > 1n) { n /= g; d /= g; }
    this.n = n; this.d = d;
  }
  static of(n, d = 1n) { return new Q(n, d); }
  add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Q(this.n * o.n, this.d * o.d); }
  div(o) { return new Q(this.n * o.d, this.d * o.n); }
  neg() { const q = Object.create(Q.prototype); q.n = -this.n; q.d = this.d; return q; }
  mulInt(k) { return new Q(this.n * BigInt(k), this.d); }
  isZero() { return this.n === 0n; }
  sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
  eq(o) { return this.n === o.n && this.d === o.d; }
  toNumber() { return bigRatioToNumber(this.n, this.d); }
  toString() { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
}
Q.ZERO = new Q(0n);
Q.ONE = new Q(1n);

// n/d as a double, robust for huge numerators and denominators.
export function bigRatioToNumber(n, d) {
  if (n === 0n) return 0;
  const neg = (n < 0n) !== (d < 0n);
  if (n < 0n) n = -n;
  if (d < 0n) d = -d;
  const ln = n.toString(2).length, ld = d.toString(2).length;
  const shift = ln - ld - 60;
  let q;
  if (shift > 0) q = Number((n) / (d << BigInt(shift))) * 2 ** shift;
  else q = Number((n << BigInt(-shift)) / d) * 2 ** shift;
  return neg ? -q : q;
}

// p-adic valuation of a nonzero BigInt
export function vpInt(x, p) {
  if (x === 0n) return Infinity;
  if (x < 0n) x = -x;
  const P = BigInt(p);
  let v = 0;
  while (x % P === 0n) { x /= P; v++; }
  return v;
}
export function vpQ(q, p) { return q.n === 0n ? Infinity : vpInt(q.n, p) - vpInt(q.d, p); }

export function modInv(a, m) {
  a = ((a % m) + m) % m;
  let [r0, r1, s0, s1] = [m, a, 0, 1];
  while (r1) { const k = Math.floor(r0 / r1); [r0, r1] = [r1, r0 - k * r1]; [s0, s1] = [s1, s0 - k * s1]; }
  if (r0 !== 1) throw new Error('not invertible');
  return ((s0 % m) + m) % m;
}

// Residue of p^k * q modulo M = p^e (requires v_p(q) + k >= 0). Returns a Number in [0, M).
export function scaledResidue(q, p, k, e) {
  const P = BigInt(p);
  let n = q.n, d = q.d, v = k;
  while (d % P === 0n) { d /= P; v--; }
  if (n === 0n) return 0;
  if (v < 0) {
    // numerator must supply the missing powers
    let w = 0; let nn = n < 0n ? -n : n;
    while (nn % P === 0n && w < -v) { nn /= P; w++; }
    if (w < -v) return NaN; // not integral
    n /= P ** BigInt(-v); v = 0;
  }
  const M = BigInt(p) ** BigInt(e);
  const num = ((n * P ** BigInt(v)) % M + M) % M;
  const den = Number(((d % M) + M) % M);
  return Number(num) * modInv(den, Number(M)) % Number(M);
}

// ---------- parameters (2) ----------

export function params(N) {
  const n = 48 * N, a = 11 * N, b = 7 * N, q = 4 * N, g = 4 * N, h = 2 * N;
  const L = n + a, C = L + g, H = C + h, A = a + 2 * g;
  return { N, n, a, b, q, g, h, L, C, H, A };
}

// ---------- Chebyshev polynomials as BigInt coefficient arrays (low degree first) ----------

export function chebT(d) {
  let a = [1n], b = [0n, 1n];
  if (d === 0) return a;
  for (let k = 1; k < d; k++) {
    const c = new Array(k + 2).fill(0n);
    for (let i = 0; i < b.length; i++) c[i + 1] += 2n * b[i];
    for (let i = 0; i < a.length; i++) c[i] -= a[i];
    a = b; b = c;
  }
  return b;
}
export function chebU(d) { // U_d, with U_{-1} = 0
  if (d < 0) return [];
  let a = [1n], b = [0n, 2n];
  if (d === 0) return a;
  for (let k = 1; k < d; k++) {
    const c = new Array(k + 2).fill(0n);
    for (let i = 0; i < b.length; i++) c[i + 1] += 2n * b[i];
    for (let i = 0; i < a.length; i++) c[i] -= a[i];
    a = b; b = c;
  }
  return b;
}

function binomRow(h) { // coefficients of (1-t)^h
  const r = [1n];
  for (let k = 1; k <= h; k++) r.push(-r[k - 1] * BigInt(h - k + 1) / BigInt(k));
  return r;
}

// P_r and D_r as BigInt coefficient arrays of length H (degree < H), eq. (3).
export function rowPolys(par, r) {
  const { g, h, C, H } = par;
  const d = Math.abs(r - g);
  const T = chebT(d), U = chebU(d - 1);
  const base = new Array(H).fill(0n), baseD = new Array(H).fill(0n);
  // t^(C-1) T_d(1/t) = sum_k T[k] t^(C-1-k)
  for (let k = 0; k < T.length; k++) if (T[k]) base[C - 1 - k] += T[k];
  const sg = r > g ? 1n : r < g ? -1n : 0n;
  for (let k = 0; k < U.length; k++) if (U[k]) baseD[C - 1 - k] += sg * U[k];
  const bin = binomRow(h);
  const P = new Array(H).fill(0n), D = new Array(H).fill(0n);
  for (let i = 0; i < H; i++) {
    if (base[i]) for (let v = 0; v <= h && i + v < H; v++) P[i + v] += base[i] * bin[v];
    if (baseD[i]) for (let v = 0; v <= h && i + v < H; v++) D[i + v] += baseD[i] * bin[v];
  }
  return { P, D, d };
}

// ---------- scalar sequences (9), (18) ----------

export function centralC(l) { // c_l = 4^-l binom(2l, l)
  let num = 1n;
  for (let k = 1; k <= l; k++) num = num * BigInt(l + k) / BigInt(k);
  return new Q(num, 4n ** BigInt(l));
}

// Memoised tables up to a size
export function scalarTables(size) {
  const c = [], m = [];
  for (let l = 0; l <= size; l++) c.push(centralC(l));
  for (let i = 0; i <= size; i++) {
    if (i % 2) m.push(Q.ZERO);
    else m.push(new Q(2n).div(new Q(BigInt(i + 1)).mul(c[i / 2])));
  }
  return { c, m, cAt: (z) => (Number.isInteger(z) && z >= 0 && z <= size ? c[z] : Q.ZERO), mAt: (i) => (i < 0 ? Q.ZERO : m[i]) };
}

// Boundary arrays k^-_d, k^+_d by the recurrences (11) with starts (13).
export function boundaryArrays(size, tabs) {
  const { mAt } = tabs;
  const km = [Q.ZERO, new Q(2n)], kp = [Q.ZERO, Q.ZERO];
  for (let d = 2; d <= size; d++) {
    km.push(km[d - 2].mulInt(d - 1).add(mAt(d - 2)).add(mAt(d - 1)).div(new Q(BigInt(d))));
    kp.push(kp[d - 2].mulInt(d - 2).add(new Q(2n, BigInt(d - 1))).div(new Q(BigInt(d - 1))));
  }
  return { km, kp };
}

// Harmonic sums B^(1)_i, B^(2)_i
export function harmonics(size) {
  const B1 = [Q.ZERO], B2 = [Q.ZERO];
  for (let i = 1; i <= size; i++) {
    B1.push(B1[i - 1].add(new Q(1n, BigInt(i))));
    B2.push(B2[i - 1].add(new Q(1n, BigInt(i) * BigInt(i))));
  }
  return { B1, B2 };
}

// The rational arrays M^0(i, j) for -1 <= i < I, 0 <= j < J (row index shifted by 1),
// via the diagonal recurrence M^0(i,j) = M^0(i-1,j-1) - m_{i-1}/j and the boundary values,
// plus Z^0(i, j) for 0 <= i < I, 0 <= j < J. Eq. (14)-(16).
export function momentArrays(I, J) {
  const size = Math.max(I, J) + 2;
  const tabs = scalarTables(size);
  const { km, kp } = boundaryArrays(size, tabs);
  const { B1, B2 } = harmonics(size);
  const M0 = []; // M0[i+1][j]
  for (let i = -1; i < I; i++) {
    const row = new Array(J);
    for (let j = 0; j < J; j++) {
      if (i === -1) row[j] = kp[j + 1];
      else if (j === 0) row[j] = km[i];
      else if (i === 0) row[j] = kp[j];
      else row[j] = M0[i][j - 1].sub(tabs.mAt(i - 1).div(new Q(BigInt(j))));
    }
    M0.push(row);
  }
  const Z0 = [];
  for (let i = 0; i < I; i++) {
    const row = new Array(J);
    for (let j = 0; j < J; j++) row[j] = i === j ? B2[i].neg() : B1[i].sub(B1[j]).div(new Q(BigInt(i - j)));
    Z0.push(row);
  }
  return { tabs, km, kp, B1, B2, M0: (i, j) => M0[i + 1][j], Z0: (i, j) => Z0[i][j], M0rows: M0, Z0rows: Z0 };
}

// ---------- floating point constants ----------

export const CATALAN = 0.915965594177219015054603514932384110774;
export const ZETA2 = Math.PI * Math.PI / 6;

// Coefficients of the raw entry F_j(r) = rat + gco*G + zco*zeta(2) with Z-weight w (paper: w = 3/2).
// Only the G and zeta(2) parts are computed here (cheap: c_l has 2-power denominators).
export function irrationalParts(P, D, j, tabs, w = new Q(3n, 2n)) {
  let gco = Q.ZERO, zco = Q.ZERO;
  for (let i = 0; i < P.length; i++) {
    if (!P[i]) continue;
    const pi = new Q(P[i]);
    const cg = tabs.cAt((i - j) / 2);
    if (!cg.isZero()) gco = gco.add(pi.mul(cg));
    const cz = tabs.cAt((j - i - 1) / 2);
    if (!cz.isZero()) zco = zco.add(pi.mul(cz));
  }
  gco = gco.mulInt(4);
  zco = zco.mul(new Q(3n, 2n));
  if (D[j]) zco = zco.sub(w.mul(new Q(D[j])));
  return { gco, zco };
}

// ---------- numerical quadrature of the moments (independent check of (17)) ----------

// phi_j(t) = int_0^1 s^j/(1-ts) ds; log1mt = log(1-t), passed in so it stays accurate near t = 1
export function phi(j, t, log1mt = Math.log1p(-t)) {
  if (Math.abs(t) < 0.9) {
    let s = 0, tk = 1;
    for (let k = 0; k < 4000; k++) {
      const term = tk / (j + k + 1);
      s += term;
      if (Math.abs(term) < 1e-18 * Math.abs(s) && k > 5) break;
      tk *= t;
    }
    return s;
  }
  let s = -log1mt, tk = 1;
  for (let k = 1; k <= j; k++) { tk *= t; s -= tk / k; }
  return s / Math.pow(t, j + 1);
}

// tanh-sinh on [a, b] of f
export function tanhSinh(f, a, b, levels = 7) {
  const c = (a + b) / 2, r = (b - a) / 2;
  let h = 1, sum = 0;
  // returns [1 - u, weight] with 1 - tanh(sh) computed without cancellation
  const node = (k) => {
    const sh = Math.PI / 2 * Math.sinh(k), ch = Math.PI / 2 * Math.cosh(k);
    const e = Math.exp(-2 * sh);
    return [2 * e / (1 + e), ch / Math.cosh(sh) ** 2];
  };
  const add = (k) => {
    const [om, w] = node(k);
    const d = r * om;
    if (!(d > 0) || !(w > 0)) return 0;
    return w * (f(b - d) + f(a + d));
  };
  sum = Math.PI / 2 * f(c);
  for (let k = h; k < 3.2; k += h) sum += add(k);
  let est = sum * h * r;
  for (let lev = 0; lev < levels; lev++) {
    h /= 2;
    for (let k = h; k < 3.2; k += 2 * h) sum += add(k);
    est = sum * h * r;
  }
  return est;
}

// M(i,j) by quadrature: t = ±cos(phi), d mu = |t| d phi on each half. The log singularity at
// t = 1 sits at phi = 0, where tanh-sinh nodes are exact, and 1 - cos(phi) = 2 sin^2(phi/2).
export function momentQuad(i, j) {
  const fPos = (ph) => {
    const t = Math.cos(ph), s = Math.sin(ph / 2);
    return t * Math.pow(t, i) * phi(j, t, Math.log(2 * s * s));
  };
  const fNeg = (ph) => { const t = -Math.cos(ph); return -t * Math.pow(t, i) * phi(j, t); };
  return tanhSinh(fPos, 0, Math.PI / 2) + tanhSinh(fNeg, 0, Math.PI / 2);
}
export function zQuad(i, j) {
  // Z(i,j) = sum_u 1/((i+u+1)(j+u+1)); exact closed forms are what we test, so use the series with a tail estimate
  let s = 0;
  const U = 200000;
  for (let u = 0; u < U; u++) s += 1 / ((i + u + 1) * (j + u + 1));
  // tail ~ 1/(U + (i+j)/2 + 1)
  return s + 1 / (U + (i + j) / 2 + 1);
}

// ---------- small primes ----------
export function primesUpTo(n) {
  const sieve = new Uint8Array(n + 1);
  const out = [];
  for (let i = 2; i <= n; i++) {
    if (!sieve[i]) { out.push(i); for (let k = i * i; k <= n; k += i) sieve[k] = 1; }
  }
  return out;
}

// ---------- Lemma 3.1: digit reductions ----------

// E(t) = (1 - t^2)^((p-1)/2) mod p, coefficients E_0..E_{p-1}
export function digitPoly(p) {
  const E = new Array(p).fill(0), s = (p - 1) / 2;
  let b = 1; // binom(s, k) mod p
  for (let k = 0; k <= s; k++) {
    E[2 * k] = (((k % 2 ? -b : b) % p) + p) % p;
    b = b * ((s - k) % p) % p * modInv(k + 1, p) % p;
  }
  return E;
}

// For every 0 <= i, j < H: valuation of M^0(i,j) (or Z^0) at p, and whether the congruence (31) holds.
// Returns { v: Int8Array (clamped to [-3, 1]), ok: Uint8Array, holds, total }.
export function digitCheck(A, H, p, which = 'M') {
  const E = digitPoly(p);
  const v = new Int8Array(H * H), ok = new Uint8Array(H * H);
  let holds = 0;
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < H; j++) {
      const x = which === 'M' ? A.M0(i, j) : A.Z0(i, j);
      const vv = vpQ(x, p);
      v[i * H + j] = Math.max(-3, Math.min(1, vv === Infinity ? 1 : vv));
      const lhs = scaledResidue(x, p, 2, 1);
      let rhs;
      const jp = Math.floor(j / p);
      if (which === 'M') {
        const ell = j % p, d = (((j - i - 1) % p) + p) % p;
        const ip = (i + 1 + d - ell) / p - 1;
        rhs = E[d] * scaledResidue(A.M0(ip, jp), p, 0, 1) % p;
      } else {
        rhs = (i - j) % p === 0 ? scaledResidue(A.Z0(Math.floor(i / p), jp), p, 0, 1) : 0;
      }
      if (lhs === rhs) { ok[i * H + j] = 1; holds++; }
    }
  }
  return { v, ok, holds, total: H * H, E };
}

// Details of one cell for the readout
export function digitCell(A, p, i, j, which = 'M') {
  const E = digitPoly(p);
  const x = which === 'M' ? A.M0(i, j) : A.Z0(i, j);
  const ell = j % p, d = (((j - i - 1) % p) + p) % p, jp = Math.floor(j / p);
  const ip = (i + 1 + d - ell) / p - 1;
  const lhs = scaledResidue(x, p, 2, 1);
  if (which === 'M') {
    const red = scaledResidue(A.M0(ip, jp), p, 0, 1);
    return { x, v: vpQ(x, p), ell, d, ip, jp, Ed: E[d], red, lhs, rhs: E[d] * red % p };
  }
  const same = (i - j) % p === 0, I = Math.floor(i / p);
  const red = same ? scaledResidue(A.Z0(I, jp), p, 0, 1) : 0;
  return { x, v: vpQ(x, p), ell, d, ip: I, jp, same, red, lhs, rhs: red };
}

// ---------- §3.2-3.3: p-adic classes of the raw columns ----------

// v_p of p^2 * F_j(r), computed modulo p^3 (the G term is p-integral and is dropped).
// Returns vals[j - b][r] in {-2, -1, 0, 1} (1 meaning v_p(F) >= 1) for b <= j < L.
export function rawColumnValuations(A, par, p, rows) {
  const { b, L, H, n } = par;
  const M3 = p * p * p, half3 = 3 * modInv(2, M3) % M3;
  const mod = (x) => ((x % M3) + M3) % M3;
  const mulmod = (x, y) => (x * y) % M3; // exact: M3 < 2^22 so x*y < 2^44
  const Mt = [], Zt = [];
  for (let i = 0; i < H; i++) {
    const rm = new Array(L - b), rz = new Array(L - b);
    for (let j = b; j < L; j++) { rm[j - b] = scaledResidue(A.M0(i, j), p, 2, 3); rz[j - b] = scaledResidue(A.Z0(i, j), p, 2, 3); }
    Mt.push(rm); Zt.push(rz);
  }
  const Pm = rows.map(({ P }) => P.map((c) => Number(((c % BigInt(M3)) + BigInt(M3)) % BigInt(M3))));
  const Dm = rows.map(({ D }) => D.map((c) => Number(((c % BigInt(M3)) + BigInt(M3)) % BigInt(M3))));
  const res = []; // res[j-b][r] residue of p^2 F mod p^3
  for (let j = b; j < L; j++) {
    const col = new Array(n);
    for (let r = 0; r < n; r++) {
      let s = 0;
      const P = Pm[r], D = Dm[r];
      for (let i = 0; i < H; i++) {
        if (P[i]) s = (s + mulmod(P[i], Mt[i][j - b])) % M3;
        if (D[i]) s = (s - mulmod(mulmod(D[i], half3), Zt[i][j - b]) + M3) % M3;
      }
      col[r] = s;
    }
    res.push(col);
  }
  const vOf = (x) => { if (x === 0) return 1; let v = -2; while (x % p === 0) { x /= p; v++; } return v; };
  const colClass = (col) => col.reduce((m, x) => Math.min(m, vOf(x)), 1);
  return { res, vOf, colClass, M3 };
}

// The column bookkeeping of (38) and Lemma 3.3 for one prime: which raw columns pair,
// which are central, and the resulting loss bound (integer).
export function primeLoss(par, p, mode = 'paper') {
  const { n, a, b, q, L, H, A } = par;
  const pos = (y) => Math.max(y, 0);
  if (mode === 'none') return 2 * n;
  if (p <= H / 2) {
    const d0 = pos(Math.min(p, L - p, A) - Math.max(b, H - 2 * p));
    return 2 * n - pos(d0 - q);
  }
  const K = L - p, J = H - p;
  const R = pos(K) + pos(K - A) + pos(J - Math.max(b, K));
  const Bp = pos(Math.min(A, K) - b);
  const e = pos(Math.min(b, J) - Math.max(0, K));
  if (mode === 'paper') return Math.min(2 * n, n + R, 2 * R + Bp + e);
  // 'one': central columns keep denominator p (no elimination)
  const c = pos(Math.min(p, L) - Math.max(b, J));
  return Math.min(2 * n, n + R, 2 * R + Bp + c);
}

// The limiting loss function d(x) of (43), evaluated from the integer formulas at a large N.
export function lossCurve(mode = 'paper', Nref = 2400, samples = 1300) {
  const par = params(Nref);
  const xs = [], ys = [];
  for (let k = 0; k <= samples; k++) {
    const x = 65 * k / samples;
    const p = Math.max(1, Math.round(x * Nref));
    xs.push(x);
    ys.push(primeLoss(par, p, mode) / Nref);
  }
  return { xs, ys };
}

// Exact piecewise d(x) of the paper, eq. (43)
export function dPaper(x) {
  if (x < 0) return 96;
  if (x <= 25) return 96;
  if (x <= 29) return 146 - 2 * x;
  if (x <= 32.5) return 88;
  if (x <= 34.5) return 153 - 2 * x;
  if (x <= 40) return 222 - 4 * x;
  if (x <= 58) return 182 - 3 * x;
  if (x <= 59) return 124 - 2 * x;
  if (x <= 65) return 65 - x;
  return 0;
}

// ---------- Section 4: palindromic bases, Kronecker factorization, the mod-q certificate ----------

export function powmod(a, e, m) { let r = 1; a %= m; while (e > 0) { if (e & 1) r = r * a % m; a = a * a % m; e >>= 1; } return r; }

// a = (a_{l i}) with Q_i = sum_l a_{l i} U_l over F_p, and b = a Pi. Eq. (49)-(50).
export function palindromicMatrices(p) {
  const binom = []; // binom[n][k] mod p for n < p
  for (let n = 0; n < p; n++) { binom.push([1]); for (let k = 1; k <= n; k++) binom[n].push(((binom[n - 1][k - 1] || 0) + (binom[n - 1][k] || 0)) % p); }
  const U = []; // U[l] coefficients in degrees 0..2p-2
  for (let l = 0; l < p; l++) {
    const c = new Array(2 * p - 1).fill(0), two = powmod(2, l, p);
    for (let k = 0; k <= p - 1 - l; k++) c[l + 2 * k] = two * binom[p - 1 - l][k] % p;
    U.push(c);
  }
  const a = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    const rem = new Array(2 * p - 1).fill(0);
    for (let j = 0; j <= p - i - 1; j++) rem[i + 2 * j] = 1; // Q_i
    for (let l = 0; l < p; l++) {
      const coef = rem[l] * modInv(powmod(2, l, p), p) % p;
      a[l][i] = coef;
      if (coef) for (let k = 0; k < 2 * p - 1; k++) rem[k] = ((rem[k] - coef * U[l][k]) % p + p) % p;
    }
  }
  const b = Array.from({ length: p }, (_, l) => Array.from({ length: p }, (_, i) => (i === 0 ? 0 : a[l][p - i])));
  // check (51) in the form Q_i + w^p Q'_i = w^i (1 - w^2)^{p-1}, via the U-expansions
  let identityOk = true;
  for (let i = 0; i < p && identityOk; i++) {
    const lhs = new Array(3 * p - 1).fill(0);
    for (let l = 0; l < p; l++) for (let k = 0; k < 2 * p - 1; k++) {
      lhs[k] = (lhs[k] + a[l][i] * U[l][k]) % p;
      lhs[k + p] = (lhs[k + p] + b[l][i] * U[l][k]) % p;
    }
    const rhs = new Array(3 * p - 1).fill(0);
    for (let j = 0; j < p; j++) rhs[i + 2 * j] = (j % 2 ? p - binom[p - 1][j] : binom[p - 1][j]) % p;
    for (let k = 0; k < 3 * p - 1; k++) if (lhs[k] !== rhs[k]) { identityOk = false; break; }
  }
  let diagOk = true;
  for (let i = 0; i < p; i++) {
    if (a[i][i] !== modInv(powmod(2, i, p), p)) diagOk = false;
    for (let l = 0; l < i; l++) if (a[l][i]) diagOk = false;
  }
  return { a, b, identityOk, diagOk };
}

// Determinant over F_p by Gaussian elimination (matrix of Numbers, copied)
export function detModP(M, p) {
  const n = M.length, A = M.map((r) => r.slice());
  let det = 1;
  for (let c = 0; c < n; c++) {
    let piv = -1;
    for (let r = c; r < n; r++) if (A[r][c] % p) { piv = r; break; }
    if (piv < 0) return 0;
    if (piv !== c) { [A[piv], A[c]] = [A[c], A[piv]]; det = (p - det) % p; }
    const inv = modInv(A[c][c], p);
    det = det * A[c][c] % p;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] * inv % p;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] = ((A[r][k] - f * A[c][k]) % p + p) % p;
    }
  }
  return det;
}

// L_p = a^T (x) B0 + b^T (x) B1, in (i, r0) x (l, k0) ordering. Eq. (59).
export function kroneckerMatrix(a, b, B0, B1, p) {
  const P = a.length, k = B0.length, n = P * k;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < P; i++) for (let l = 0; l < P; l++) {
    const x = a[l][i], y = b[l][i];
    if (!x && !y) continue;
    for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) L[i * k + r][l * k + c] = (x * B0[r][c] + y * B1[r][c]) % p;
  }
  return L;
}

// The 49 x 48 matrix B of (47) modulo a prime q > 65, by the recipe of Section 4.4.
export function certificateMatrix(q) {
  const inv = (x) => modInv(((x % q) + q) % q, q);
  const m = new Array(65).fill(0); m[0] = 2;
  for (let i = 2; i <= 64; i += 2) m[i] = i * m[i - 2] % q * inv(i + 1) % q;
  const km = new Array(65).fill(0), kp = new Array(59).fill(0); km[1] = 2;
  for (let d = 2; d <= 64; d++) km[d] = ((d - 1) * km[d - 2] + m[d - 2] + m[d - 1]) % q * inv(d) % q;
  for (let d = 2; d <= 58; d++) kp[d] = ((d - 2) * kp[d - 2] + 2 * inv(d - 1)) % q * inv(d - 1) % q;
  const Y = Array.from({ length: 65 }, () => new Array(59).fill(0));
  for (let i = 0; i <= 64; i++) for (let j = 0; j <= 58; j++) {
    if (j === 0) Y[i][0] = km[i];
    else if (i === 0) Y[0][j] = kp[j];
    else Y[i][j] = ((Y[i - 1][j - 1] - m[i - 1] * inv(j)) % q + q) % q;
  }
  const B1 = [0], B2 = [0];
  for (let i = 1; i <= 64; i++) { B1.push((B1[i - 1] + inv(i)) % q); B2.push((B2[i - 1] + inv(i * i)) % q); }
  const h32 = 3 * inv(2) % q;
  const J = Array.from({ length: 65 }, (_, i) => Array.from({ length: 59 }, (_, j) =>
    h32 * (i === j ? (q - B2[i]) % q : ((B1[i] - B1[j]) % q + q) % q * inv(i - j) % q) % q));
  // E_m = t^62 T_m(1/t), I_m = t^62 U_{m-1}(1/t) as integer arrays of length 65 (exact, then reduced)
  const shiftDown = (P) => { const R = new Array(P.length).fill(0n); for (let k = 1; k < P.length; k++) R[k - 1] = P[k]; if (P[0]) throw new Error('not divisible by t'); return R; };
  const E = [], I = [];
  const z = () => new Array(65).fill(0n);
  E.push(z()); E[0][62] = 1n; E.push(z()); E[1][61] = 1n;
  I.push(z()); I.push(z()); I[1][62] = 1n;
  for (let mm = 2; mm <= 44; mm++) {
    const e1 = shiftDown(E[mm - 1]), i1 = shiftDown(I[mm - 1]);
    E.push(e1.map((x, k) => 2n * x - E[mm - 2][k]));
    I.push(i1.map((x, k) => 2n * x - I[mm - 2][k]));
  }
  const times1mt2 = (P) => { const R = new Array(65).fill(0n); for (let k = 0; k < 65; k++) { if (!P[k]) continue; R[k] += P[k]; if (k + 1 < 65) R[k + 1] -= 2n * P[k]; if (k + 2 < 65) R[k + 2] += P[k]; } return R; };
  const Qb = BigInt(q), red = (x) => Number(((x % Qb) + Qb) % Qb);
  const B = [];
  const rowsExact = [];
  for (let r = 0; r <= 48; r++) {
    const u = Math.abs(r - 4), sg = r > 4 ? 1n : r < 4 ? -1n : 0n;
    const y = times1mt2(E[u]), zz = times1mt2(I[u]).map((x) => sg * x);
    rowsExact.push({ y, z: zz });
    const yr = y.map(red), zr = zz.map(red);
    let v = [];
    for (let j = 7; j <= 58; j++) {
      let s = 0;
      for (let i = 0; i <= 64; i++) s = (s + yr[i] * Y[i][j] - zr[i] * J[i][j] % q + q) % q;
      v.push(s);
    }
    for (let it = 0; it < 4; it++) v = v.slice(0, -1).map((x, k) => (x - v[k + 1] + q) % q);
    B.push(v);
  }
  return { B, rowsExact };
}

// Elimination rule of Section 4.4 for B0 + sigma*B1 mod q: pivots and swaps
export function certificatePivots(B, sigma, q) {
  const R = Array.from({ length: 48 }, (_, i) => B[i].map((x, k) => ((x + sigma * B[i + 1][k]) % q + q) % q));
  const pivots = [], swaps = [];
  for (let i = 0; i < 48; i++) {
    if (R[i][i] === 0) {
      let s = -1;
      for (let r = i + 1; r < 48; r++) if (R[r][i]) { s = r; break; }
      if (s < 0) { pivots.push(0); continue; }
      [R[i], R[s]] = [R[s], R[i]]; swaps.push([i, s]);
    }
    const d = R[i][i]; pivots.push(d);
    const inv = modInv(d, q);
    for (let r = i + 1; r < 48; r++) {
      const f = R[r][i] * inv % q;
      if (f) for (let k = i; k < 48; k++) R[r][k] = ((R[r][k] - f * R[i][k]) % q + q) % q;
    }
  }
  return { pivots, swaps };
}
