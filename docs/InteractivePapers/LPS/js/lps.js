// Exact math for the LPS walkthrough: quaternions, the groups PSL2/PGL2(F_q),
// the graphs X^{p,q} and Y^{p,q}, counts r_Q(n), spectra.
// Pure functions, no DOM: node imports this file in tests/lps.test.mjs.

// ───────────────────────── small number theory ─────────────────────────

export function isPrime(n) {
  if (n < 2 || n % 1) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export function modpow(b, e, m) {
  let r = 1, x = ((b % m) + m) % m;
  while (e > 0) {
    if (e & 1) r = (r * x) % m;
    x = (x * x) % m;
    e >>= 1;
  }
  return r;
}

/** Legendre symbol (a/q) for an odd prime q: 1, -1 or 0. */
export function legendre(a, q) {
  const r = modpow(a, (q - 1) / 2, q);
  return r === 0 ? 0 : r === 1 ? 1 : -1;
}

/** Primes ≡ 1 (mod 4) in [lo, hi]. */
export function primes1mod4(lo, hi) {
  const out = [];
  for (let n = Math.max(5, lo); n <= hi; n++) if (n % 4 === 1 && isPrime(n)) out.push(n);
  return out;
}

/** An integer i with i² ≡ −1 (mod q); q ≡ 1 (mod 4). The smallest one, so the choice is reproducible. */
export function sqrtMinusOne(q) {
  for (let i = 2; i < q; i++) if ((i * i + 1) % q === 0) return i;
  throw new Error(`no square root of -1 mod ${q}`);
}

export function sigma(n) { // sum of divisors
  let s = 0;
  for (let d = 1; d * d <= n; d++) if (n % d === 0) { s += d; if (d * d !== n) s += n / d; }
  return s;
}

/** Jacobi (1.2): r_4(n) = 8 Σ_{d | n, 4 ∤ d} d. */
export function jacobiR4(n) {
  let s = 0;
  for (let d = 1; d <= n; d++) if (n % d === 0 && d % 4 !== 0) s += d;
  return 8 * s;
}

export function isqrt(n) { // exact floor(sqrt(n)) for 0 ≤ n < 2^53
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

// ───────────────────────── quaternions ─────────────────────────
// α = a0 + a1 i + a2 j + a3 k, stored as [a0, a1, a2, a3].

export const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qconj = (a) => [a[0], -a[1], -a[2], -a[3]];
export const qnorm = (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3];
export const qeq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/** All 8(p+1) integer solutions of a0²+a1²+a2²+a3² = p. */
export function allFourSquares(p) {
  const b = isqrt(p), out = [];
  for (let a0 = -b; a0 <= b; a0++) for (let a1 = -b; a1 <= b; a1++) for (let a2 = -b; a2 <= b; a2++) {
    const r = p - a0 * a0 - a1 * a1 - a2 * a2;
    if (r < 0) continue;
    const a3 = isqrt(r);
    if (a3 * a3 !== r) continue;
    out.push([a0, a1, a2, a3]);
    if (a3) out.push([a0, a1, a2, -a3]);
  }
  return out;
}

/**
 * The generators S of §2–3: the p+1 solutions with a0 > 0 odd and a1, a2, a3 even,
 * ordered as conjugate pairs α1, ᾱ1, α2, ᾱ2, … (p ≡ 1 mod 4).
 */
export function generators(p) {
  const sols = allFourSquares(p).filter((a) => a[0] > 0 && a[0] % 2 === 1 && a.slice(1).every((x) => x % 2 === 0));
  sols.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || y[3] - x[3]);
  const used = new Set(), out = [];
  const key = (a) => a.join(',');
  for (const a of sols) {
    if (used.has(key(a))) continue;
    const c = qconj(a);
    used.add(key(a)); used.add(key(c));
    out.push(a, c);
  }
  return out;
}

/** Index of the inverse (conjugate) generator: inv[i] = j with S[j] = conj(S[i]). */
export function inverseIndex(S) {
  return S.map((a) => S.findIndex((b) => qeq(b, qconj(a))));
}

/** Matrix (2.1) of a quaternion mod q, with i² ≡ −1. Entries in [0, q). Returned as [a, b, c, d]. */
export function quatToMatrix(a, q, i = sqrtMinusOne(q)) {
  const m = (x) => ((x % q) + q) % q;
  return [m(a[0] + i * a[1]), m(a[2] + i * a[3]), m(-a[2] + i * a[3]), m(a[0] - i * a[1])];
}

/**
 * Peel generators off the right of α (N(α) = p^k, α ≡ 1 mod 2), following Lemma 3.1.
 * Returns { sign, r, word, steps } with α = sign · p^r · S[word[0]] ⋯ S[word[m−1]]
 * and steps[t] = how many generators divided at that step (Lemma 3.1 says exactly one).
 */
export function factorQuaternion(alpha, p, S = generators(p)) {
  let a = alpha.slice(), n = qnorm(a), r = 0;
  const word = [], steps = [];
  const divisible = (x) => x.every((c) => c % p === 0);
  while (n > 1) {
    if (divisible(a)) { a = a.map((c) => c / p); n /= p * p; r++; continue; }
    let hit = -1, count = 0;
    for (let s = 0; s < S.length; s++) {
      const t = qmul(a, qconj(S[s]));
      if (divisible(t)) { count++; if (hit < 0) hit = s; }
    }
    steps.push(count);
    if (hit < 0) return null;
    a = qmul(a, qconj(S[hit])).map((c) => c / p);
    n /= p;
    word.unshift(hit);
  }
  if (n !== 1 || Math.abs(a[0]) !== 1 || a[1] || a[2] || a[3]) return null;
  return { sign: a[0], r, word, steps };
}

/** Product S[w0] ⋯ S[w_{m−1}] as an integer quaternion. */
export function wordToQuaternion(word, S) {
  let a = [1, 0, 0, 0];
  for (const s of word) a = qmul(a, S[s]);
  return a;
}

/** Freely reduce a word (inv = inverseIndex(S)). */
export function reduceWord(word, inv) {
  const out = [];
  for (const s of word) {
    if (out.length && out[out.length - 1] === inv[s]) out.pop();
    else out.push(s);
  }
  return out;
}

// ───────────────────────── r_Q(n) ─────────────────────────

/** r_Q(N) for Q = x1² + 4q²(x2² + x3² + x4²) (1.3)–(1.4). Cost ~ (N/4q²)^{3/2}. */
export function rQ(N, q) {
  const c = 4 * q * q, B = isqrt(Math.floor(N / c));
  let cnt = 0;
  for (let x2 = 0; x2 <= B; x2++) {
    const r2 = N - c * x2 * x2;
    if (r2 < 0) break;
    const w2 = x2 ? 2 : 1;
    for (let x3 = 0; x3 <= B; x3++) {
      const r3 = r2 - c * x3 * x3;
      if (r3 < 0) break;
      const w3 = w2 * (x3 ? 2 : 1);
      for (let x4 = 0; x4 <= B; x4++) {
        const r4 = r3 - c * x4 * x4;
        if (r4 < 0) break;
        const x1 = isqrt(r4);
        if (x1 * x1 === r4) cnt += w3 * (x4 ? 2 : 1) * (x1 ? 2 : 1);
      }
    }
  }
  return cnt;
}

/** Work estimate for rQ (number of inner iterations, roughly). */
export const rQCost = (N, q) => Math.pow(N / (4 * q * q), 1.5) * 0.6 + 1;

/** The quaternions counted by r_Q(N) with some x2, x3, x4 ≠ 0, as α = x1 + 2q(x2 i + x3 j + x4 k). */
export function nontrivialSolutions(N, q, limit = 64) {
  const c = 4 * q * q, B = isqrt(Math.floor(N / c)), out = [];
  for (let x2 = -B; x2 <= B; x2++) for (let x3 = -B; x3 <= B; x3++) for (let x4 = -B; x4 <= B; x4++) {
    if (!x2 && !x3 && !x4) continue;
    const r = N - c * (x2 * x2 + x3 * x3 + x4 * x4);
    if (r < 0) continue;
    const x1 = isqrt(r);
    if (x1 * x1 !== r) continue;
    out.push([x1, 2 * q * x2, 2 * q * x3, 2 * q * x4]);
    if (out.length >= limit) return out;
  }
  return out;
}

/** The main term C(p^k) of (1.5), with c1 = c2 = 4/(q(q²−1)) from (4.19)–(4.20). */
export function mainTerm(p, q, k) {
  if (legendre(p, q) === -1 && k % 2) return 0;
  return (4 / (q * (q * q - 1))) * ((Math.pow(p, k + 1) - 1) / (p - 1));
}

// ───────────────────────── the group and the Cayley graph X^{p,q} ─────────────────────────

function invTable(q) {
  const inv = new Int32Array(q);
  for (let x = 1; x < q; x++) inv[x] = modpow(x, q - 2, q);
  return inv;
}

/** Normalize a 2×2 matrix mod q projectively: first nonzero entry becomes 1. Returns an integer key. */
function projKey(a, b, c, d, q, inv) {
  const s = a ? a : b ? b : c ? c : d;
  const t = inv[s];
  return ((((a * t) % q) * q + ((b * t) % q)) * q + ((c * t) % q)) * q + ((d * t) % q);
}

/**
 * Build X^{p,q}: the Cayley graph of φ(Λ(2)) ⊂ PGL2(F_q) with edges x ~ s·x.
 * Returns { p, q, k, n, S, inv, mats, nbr, part, psl } where nbr[v*k + s] is the vertex s·v,
 * part[v] ∈ {0,1} is the parity of the BFS distance (the bipartition when there is one),
 * and psl = (p/q) = 1.
 */
export function buildX(p, q) {
  const S = generators(p), k = S.length, inv = invTable(q), I = sqrtMinusOne(q);
  const mats = S.map((a) => quatToMatrix(a, q, I));
  const ids = new Map(), elems = [];
  const add = (a, b, c, d) => {
    const key = projKey(a, b, c, d, q, inv);
    let id = ids.get(key);
    if (id === undefined) { id = elems.length / 4; ids.set(key, id); elems.push(a, b, c, d); }
    return id;
  };
  add(1, 0, 0, 1);
  const nbrList = [];
  for (let v = 0; v * 4 < elems.length; v++) {
    const a = elems[4 * v], b = elems[4 * v + 1], c = elems[4 * v + 2], d = elems[4 * v + 3];
    for (let s = 0; s < k; s++) {
      const [x, y, z, w] = mats[s]; // s · v
      nbrList.push(add((x * a + y * c) % q, (x * b + y * d) % q, (z * a + w * c) % q, (z * b + w * d) % q));
    }
  }
  const n = elems.length / 4;
  const nbr = Int32Array.from(nbrList);
  const part = new Int8Array(n).fill(-1), dist = new Int32Array(n).fill(-1);
  part[0] = 0; dist[0] = 0;
  const queue = [0];
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    for (let s = 0; s < k; s++) {
      const v = nbr[u * k + s];
      if (dist[v] < 0) { dist[v] = dist[u] + 1; part[v] = dist[v] & 1; queue.push(v); }
    }
  }
  return { p, q, k, n, S, inv: inverseIndex(S), mats, nbr, part, dist, elems: Int32Array.from(elems), psl: legendre(p, q) === 1 };
}

/** Is the graph bipartite (every edge crosses the BFS parity)? */
export function isBipartite(X) {
  const { n, k, nbr, part } = X;
  for (let v = 0; v < n; v++) for (let s = 0; s < k; s++) if (part[nbr[v * k + s]] === part[v]) return false;
  return true;
}

/** Sphere sizes |S(r)| around the identity (vertex-transitive, so this is every vertex). */
export function sphereSizes(X) {
  const counts = [];
  for (let v = 0; v < X.n; v++) counts[X.dist[v]] = (counts[X.dist[v]] || 0) + 1;
  return counts;
}

/**
 * Girth = shortest nontrivial reduced word that is the identity (a non-backtracking
 * closed walk at e). Loops give 1, repeated edges 2. Returns { girth, word }.
 */
export function girth(X) {
  const { n, k, nbr, inv } = X;
  // states (vertex, last letter); BFS over non-backtracking walks from e
  const seen = new Int32Array(n * k).fill(-1);
  const back = new Int32Array(n * k).fill(-1);
  let frontier = [];
  for (let s = 0; s < k; s++) {
    const v = nbr[s];
    if (v === 0) return { girth: 1, word: [s] };
    const st = v * k + s;
    if (seen[st] < 0) { seen[st] = 1; back[st] = -1; frontier.push(st); }
  }
  for (let len = 1; frontier.length && len < 64; len++) {
    const next = [];
    for (const st of frontier) {
      const v = (st / k) | 0, last = st % k;
      for (let s = 0; s < k; s++) {
        if (s === inv[last]) continue;
        const w = nbr[v * k + s];
        if (w === 0) {
          // walk order s1, s2, …, sL; the element is sL ⋯ s1, so return the product order
          const walk = [s];
          for (let x = st; x >= 0; x = back[x]) walk.unshift(x % k);
          return { girth: len + 1, word: walk.reverse() };
        }
        const ns = w * k + s;
        if (seen[ns] < 0) { seen[ns] = len + 1; back[ns] = st; next.push(ns); }
      }
    }
    frontier = next;
  }
  return { girth: Infinity, word: null };
}

/** A greedy independent set (vertices in a fixed pseudo-random order). */
export function greedyIndependentSet(X, seed = 1) {
  const { n, k, nbr } = X;
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const blocked = new Uint8Array(n);
  let size = 0;
  for (const v of order) {
    if (blocked[v]) continue;
    let loop = false;
    for (let t = 0; t < k; t++) if (nbr[v * k + t] === v) loop = true;
    if (loop) continue;
    size++;
    blocked[v] = 1;
    for (let t = 0; t < k; t++) blocked[nbr[v * k + t]] = 1;
  }
  return size;
}

// ───────────────────────── Y^{p,q} on P^1(F_q) ─────────────────────────

/** Y^{p,q}: points 0..q−1 and ∞ = q; ξ ~ γξ for γ ∈ S. nbr[x*k + s] = image of x. */
export function buildY(p, q) {
  const S = generators(p), k = S.length, inv = invTable(q), I = sqrtMinusOne(q);
  const mats = S.map((a) => quatToMatrix(a, q, I));
  const n = q + 1, nbr = new Int32Array(n * k);
  const act = ([a, b, c, d], z) => {
    if (z === q) return c === 0 ? q : (a * inv[c]) % q;
    const num = (a * z + b) % q, den = (c * z + d) % q;
    return den === 0 ? q : (num * inv[den]) % q;
  };
  for (let z = 0; z < n; z++) for (let s = 0; s < k; s++) nbr[z * k + s] = act(mats[s], z);
  return { p, q, k, n, S, mats, nbr };
}

// ───────────────────────── spectra ─────────────────────────

/** Dense adjacency (with multiplicities) from a neighbour table. */
export function denseAdjacency(G) {
  const { n, k, nbr } = G, A = new Float64Array(n * n);
  for (let v = 0; v < n; v++) for (let s = 0; s < k; s++) A[v * n + nbr[v * k + s]] += 1;
  return A;
}

/** Eigenvalues of a real symmetric n×n matrix (Householder + implicit QL). Destroys `a`. Sorted descending. */
export function symEigenvalues(a, n) {
  const d = new Float64Array(n), e = new Float64Array(n);
  for (let i = n - 1; i > 0; i--) {
    const l = i - 1, ri = i * n;
    let h = 0;
    if (l > 0) {
      let scale = 0;
      for (let k = 0; k <= l; k++) scale += Math.abs(a[ri + k]);
      if (scale === 0) e[i] = a[ri + l];
      else {
        for (let k = 0; k <= l; k++) { a[ri + k] /= scale; h += a[ri + k] * a[ri + k]; }
        let f = a[ri + l];
        let g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
        e[i] = scale * g; h -= f * g; a[ri + l] = f - g; f = 0;
        for (let j = 0; j <= l; j++) {
          g = 0;
          const rj = j * n;
          for (let k = 0; k <= j; k++) g += a[rj + k] * a[ri + k];
          for (let k = j + 1; k <= l; k++) g += a[k * n + j] * a[ri + k];
          e[j] = g / h; f += e[j] * a[ri + j];
        }
        const hh = f / (h + h);
        for (let j = 0; j <= l; j++) {
          f = a[ri + j]; g = e[j] = e[j] - hh * f;
          const rj = j * n;
          for (let k = 0; k <= j; k++) a[rj + k] -= f * e[k] + g * a[ri + k];
        }
      }
    } else e[i] = a[ri + l];
    d[i] = h;
  }
  for (let i = 0; i < n; i++) d[i] = a[i * n + i];
  // implicit QL on the tridiagonal (d, e)
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  for (let l = 0; l < n; l++) {
    let iter = 0, m;
    do {
      for (m = l; m < n - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) <= 1e-15 * dd) break;
      }
      if (m !== l) {
        if (iter++ === 80) throw new Error('eigenvalues did not converge');
        let g = (d[l + 1] - d[l]) / (2 * e[l]);
        let r = Math.hypot(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
        let s = 1, c = 1, p = 0, i;
        let early = false;
        for (i = m - 1; i >= l; i--) {
          const f = s * e[i], b = c * e[i];
          e[i + 1] = r = Math.hypot(f, g);
          if (r === 0) { d[i + 1] -= p; e[m] = 0; early = true; break; }
          s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b;
          d[i + 1] = g + (p = s * r); g = c * r - b;
        }
        if (early) continue;
        d[l] -= p; e[l] = g; e[m] = 0;
      }
    } while (m !== l);
  }
  return d.sort().reverse();
}

/**
 * Spectrum of X^{p,q} (all n eigenvalues, descending). When X is bipartite it diagonalizes
 * A² on one side (size n/2) and takes ±square roots: the same spectrum, eight times faster.
 */
export function spectrumX(X) {
  const { n, k, nbr, part } = X;
  if (!isBipartite(X)) return symEigenvalues(denseAdjacency(X), n);
  const idx = new Int32Array(n).fill(-1);
  let m = 0;
  for (let v = 0; v < n; v++) if (part[v] === 0) idx[v] = m++;
  const M = new Float64Array(m * m);
  for (let v = 0; v < n; v++) {
    if (part[v]) continue;
    const row = idx[v] * m;
    for (let s = 0; s < k; s++) {
      const w = nbr[v * k + s];
      for (let t = 0; t < k; t++) M[row + idx[nbr[w * k + t]]] += 1;
    }
  }
  const mu = symEigenvalues(M, m);
  const out = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const r = Math.sqrt(Math.max(0, mu[i]));
    out[i] = r; out[n - 1 - i] = -r;
  }
  return out.sort().reverse();
}

/** Remark 2: H_0 = 1, H_1 = x, H_t = x H_{t−1} − p H_{t−2}  (= p^{t/2} sin((t+1)θ)/sin θ for x = 2√p cos θ). */
export function H(t, x, p) {
  if (t === 0) return 1;
  let a = 1, b = x;
  for (let s = 2; s <= t; s++) { const c = x * b - p * a; a = b; b = c; }
  return b;
}

/** (4.15), right side: (2/n) Σ_j H_t(λ_j). */
export function spectralSide(lam, t, p) {
  let s = 0;
  for (const x of lam) s += H(t, x, p);
  return (2 * s) / lam.length;
}

/** λ(X): the largest |λ| among eigenvalues other than ±k. */
export function lambdaX(lam, k, tol = 1e-7) {
  let best = 0;
  for (const x of lam) if (Math.abs(Math.abs(x) - k) > tol) best = Math.max(best, Math.abs(x));
  return best;
}

/** Kesten's density μ_k (Proposition 4.3). */
export function kestenDensity(t, k) {
  const r = 2 * Math.sqrt(k - 1);
  if (Math.abs(t) >= r) return 0;
  return Math.sqrt(k - 1 - (t * t) / 4) / (Math.PI * k * (1 - (t / k) * (t / k)));
}

/** ρ(l): closed walks of length l at a vertex of the k-regular tree (l = 0..L). Floating point. */
export function treeClosedWalks(k, L) {
  const out = [1];
  let f = [1];
  for (let l = 1; l <= L; l++) {
    const g = new Array(l + 1).fill(0);
    for (let d = 0; d < f.length; d++) {
      if (!f[d]) continue;
      if (d === 0) g[1] += k * f[0];
      else { g[d - 1] += f[d]; g[d + 1] += (k - 1) * f[d]; }
    }
    f = g;
    out.push(f[0]);
  }
  return out;
}

/** Theorem 3.4's lower bound on the girth. */
export function girthBound(p, q) {
  return legendre(p, q) === -1 ? 4 * Math.log(q) / Math.log(p) - Math.log(4) / Math.log(p) : 2 * Math.log(q) / Math.log(p);
}

/** Theorem 5.1's upper bound on the diameter. */
export function diameterBound(p, n) {
  return 2 * Math.log(n) / Math.log(p) + 2 * Math.log(2) / Math.log(p) + 1;
}

/** |X^{p,q}| from §2. */
export function orderX(p, q) {
  return legendre(p, q) === -1 ? q * (q * q - 1) : (q * (q * q - 1)) / 2;
}

// ───────────────────────── the Poincaré disk ─────────────────────────

/**
 * The hyperbolic geodesic of the unit Poincaré disk between boundary points at angles a1, a2:
 * an arc of the circle orthogonal to the boundary, or a diameter when the points are antipodal.
 * Returns { line: true } or { cx, cy, rho } in unit-disk coordinates (|c|² = 1 + ρ²).
 */
export function geodesicArc(a1, a2) {
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  const th = Math.abs(d) / 2;                   // half the angular gap, in (0, π/2]
  if (Math.PI / 2 - th < 1e-4) return { line: true };
  const m = a1 + d / 2, dist = 1 / Math.cos(th);
  return { line: false, cx: dist * Math.cos(m), cy: dist * Math.sin(m), rho: Math.tan(th) };
}
