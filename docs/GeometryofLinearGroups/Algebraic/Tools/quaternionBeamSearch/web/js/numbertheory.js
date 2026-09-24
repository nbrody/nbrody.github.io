// Number-theory helpers for the quaternion beam-search UI / Bruhat–Tits tree.
// Designed to stay responsive on live input validation (no O(√n) trial division).

export function isqrt(n) {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

export function modpow(b, e, m) {
  b %= m; let r = 1n;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}

/** Deterministic Miller–Rabin for n < ~3.3e24 (witnesses through 37). */
export function isPrime(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (n % p === 0n) return n === p;
  }
  let d = n - 1n, r = 0n;
  while (d % 2n === 0n) { d /= 2n; r++; }
  const wit = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  for (const a of wit) {
    let x = modpow(a % n, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let i = 0n; i < r - 1n; i++) {
      x = (x * x) % n;
      if (x === n - 1n) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

function bitLength(n) {
  let b = 0n, x = n;
  while (x > 0n) { x >>= 1n; b++; }
  return Number(b);
}

/** Integer k-th root of n, or null if n is not a perfect k-th power (k ≥ 2). */
export function ithRoot(n, k) {
  if (k < 2) return null;
  if (n < 0n) return null;
  if (n < 2n) return n;
  const kk = BigInt(k);
  // initial guess from float when safe; otherwise 2^{ceil(bitlen/k)}
  let x;
  if (n < (1n << 1023n)) {
    const approx = Math.pow(Number(n), 1 / k);
    x = BigInt(Math.max(1, Math.floor(approx) + 2));
  } else {
    const bits = bitLength(n);
    x = 1n << BigInt(Math.ceil(bits / k));
  }
  // Newton: x ← ((k-1)x + n/x^{k-1}) / k
  for (;;) {
    let pk = 1n;
    for (let i = 1n; i < kk; i++) pk *= x;
    if (pk === 0n) return null;
    const y = ((kk - 1n) * x + n / pk) / kk;
    if (y >= x) {
      // verify x^k === n
      let p = 1n;
      for (let i = 0n; i < kk; i++) p *= x;
      return p === n ? x : null;
    }
    x = y;
  }
}

/**
 * Return {p, e} if n = p^e with p prime and e ≥ 1; else null.
 * Uses perfect-power roots + Miller–Rabin — O(polylog n), not O(√n).
 */
export function primePower(n) {
  if (typeof n !== "bigint") n = BigInt(n);
  if (n < 2n) return null;
  if (isPrime(n)) return { p: n, e: 1 };
  const maxE = bitLength(n);
  for (let e = maxE; e >= 2; e--) {
    const r = ithRoot(n, e);
    if (r !== null && isPrime(r)) return { p: r, e };
  }
  return null;
}

/**
 * Tonelli–Shanks square root of a quadratic residue modulo odd prime q.
 * Returns null if a is not a QR mod q. O(log² q), not O(q).
 */
export function sqrtModPrime(a, q) {
  a = ((a % q) + q) % q;
  if (a === 0n) return 0n;
  if (q === 2n) return a;
  if (modpow(a, (q - 1n) / 2n, q) !== 1n) return null; // Euler criterion
  if (q % 4n === 3n) return modpow(a, (q + 1n) / 4n, q);

  // write q-1 = 2^S * Q with Q odd
  let S = 0n, Q = q - 1n;
  while (Q % 2n === 0n) { Q /= 2n; S++; }

  // find z: quadratic non-residue
  let z = 2n;
  while (modpow(z, (q - 1n) / 2n, q) !== q - 1n) z++;

  let m = S;
  let c = modpow(z, Q, q);
  let t = modpow(a, Q, q);
  let r = modpow(a, (Q + 1n) / 2n, q);

  for (;;) {
    if (t === 0n) return 0n;
    if (t === 1n) return r;
    // find least i with t^{2^i} = 1
    let i = 1n, t2i = (t * t) % q;
    while (i < m && t2i !== 1n) { t2i = (t2i * t2i) % q; i++; }
    if (i === m && t2i !== 1n) return null; // should not happen for QR
    const b = modpow(c, 1n << (m - i - 1n), q);
    m = i;
    c = (b * b) % q;
    t = (t * c) % q;
    r = (r * b) % q;
  }
}

export function modinv(a, m) {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const qq = old_r / r;
    [old_r, r] = [r, old_r - qq * r];
    [old_s, s] = [s, old_s - qq * s];
  }
  return ((old_s % m) + m) % m;
}

/** Sqrt of a (QR) modulo q^M via Tonelli–Shanks + Hensel/Newton. */
export function sqrtModPrimePower(a, q, M) {
  const mod = q ** BigInt(M);
  let r = sqrtModPrime(a, q);
  if (r === null) return null;
  let cur = q;
  while (cur < mod) {
    cur *= cur; if (cur > mod) cur = mod;
    const inv2r = modinv((2n * r) % cur, cur);
    r = (((r - ((r * r - a) % cur) * inv2r) % cur) + cur) % cur;
  }
  return r;
}

/** Interactive-tool size bound: LPS enumeration / tree splitting stay snappy. */
export const MAX_INTERACTIVE_PRIME = 10007n;
