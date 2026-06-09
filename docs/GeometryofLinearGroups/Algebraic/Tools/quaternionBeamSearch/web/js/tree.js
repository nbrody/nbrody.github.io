// Bruhat-Tits tree of PGL_2(Q_q) via a splitting H (x) Q_q = M_2(Q_q),
// valid for every odd prime q.  We pick alpha, beta in Z_q with
// alpha^2 + beta^2 = -1 and embed
//     i -> [[a, b],[b,-a]],  j -> [[0,1],[-1,0]],  k -> [[-b,a],[a,b]],
// so that  w+xi+yj+zk  ->  [[ w+xa-zb,  xb+y+za ],
//                          [ xb-y+za,  w-xa+zb ]]   with det = N(q).
// The vertex of a primitive quaternion is the kernel direction of this matrix
// mod q^n, n = v_q(N).

import { qnorm, primitive, vP } from "./quaternion.js";

function modpow(base, exp, mod) {
  base %= mod; let r = 1n;
  while (exp > 0n) { if (exp & 1n) r = (r*base) % mod; base = (base*base) % mod; exp >>= 1n; }
  return r;
}
function modinv(a, m) {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) { const qq = old_r / r; [old_r, r] = [r, old_r - qq*r]; [old_s, s] = [s, old_s - qq*s]; }
  return ((old_s % m) + m) % m;
}
// sqrt of a (a a QR) modulo q^M, q odd prime, via sqrt mod q + Hensel.
function sqrtModPrime(a, q) {
  a = ((a % q) + q) % q;
  if (a === 0n) return 0n;
  for (let r = 1n; r < q; r++) if ((r*r) % q === a) return r;
  return null;
}
function sqrtModPrimePower(a, q, M) {
  const mod = q ** BigInt(M);
  let r = sqrtModPrime(a, q);
  if (r === null) return null;
  let cur = q;
  while (cur < mod) {
    cur *= cur; if (cur > mod) cur = mod;
    // Newton: r -> r - (r^2 - a) / (2r)
    const inv2r = modinv((2n*r) % cur, cur);
    r = (((r - ((r*r - a) % cur) * inv2r) % cur) + cur) % cur;
  }
  return r;
}

export class PrimeTree {
  constructor(q, precision = 30) {
    this.q = BigInt(q);
    this.M = precision;
    this.mod = this.q ** BigInt(precision);
    // find alpha (small) with -1-alpha^2 a nonzero QR mod q, beta = sqrt
    const Q = Number(q);
    let alpha = null, beta = null;
    for (let a = 0; a < Q; a++) {
      const c = ((-1 - a*a) % Q + Q) % Q;        // -1 - a^2 mod q
      if (c === 0) continue;                       // need nonzero QR
      const target = ((-1n - BigInt(a)*BigInt(a)) % this.mod + this.mod) % this.mod;
      const b = sqrtModPrimePower(target, this.q, precision);
      if (b !== null) { alpha = BigInt(a); beta = b; break; }
    }
    if (alpha === null) throw new Error("no splitting found for q=" + q);
    this.alpha = alpha % this.mod;
    this.beta = beta % this.mod;
    // sanity: alpha^2 + beta^2 = -1 mod q^M
    const chk = (this.alpha*this.alpha + this.beta*this.beta + 1n) % this.mod;
    if (chk !== 0n) throw new Error("splitting check failed for q=" + q);
  }

  mat(A) {
    const [w, x, y, z] = A, a = this.alpha, b = this.beta, m = this.mod;
    const M00 = ((w + x*a - z*b) % m + m) % m;
    const M01 = ((x*b + y + z*a) % m + m) % m;
    const M10 = ((x*b - y + z*a) % m + m) % m;
    const M11 = ((w - x*a + z*b) % m + m) % m;
    return [M00, M01, M10, M11];
  }

  vertex(A) {
    const q = this.q;
    const n = vP(qnorm(A), q);
    if (n === 0) return "0";
    const pn = q ** BigInt(n);
    let [a, b, c, d] = this.mat(A).map((v) => ((v % pn) + pn) % pn);
    // left kernel f with f*M = 0 mod q^n: (d,-b) or (-c,a)
    for (const [al, be] of [[d, ((-b) % pn + pn) % pn], [((-c) % pn + pn) % pn, a]]) {
      if (al % q !== 0n) { return "1:" + n + ":" + ((be * modinv(al, pn)) % pn).toString(); }
      if (be % q !== 0n) { return "2:" + n + ":" + ((al * modinv(be, pn)) % pn).toString(); }
    }
    return "x:" + n;
  }

  distance(A) { return vP(qnorm(primitive(A)), this.q); }
}
