// Exact projective integer (Lipschitz) quaternion arithmetic over BigInt,
// plus the Lubotzky-Phillips-Sarnak factorisation at a prime p = 1 (mod 4).
//
// A quaternion is a length-4 BigInt array [w,x,y,z] = w + xi + yj + zk,
// i^2=j^2=k^2=-1, ij=k.  We work projectively (mod rational scalars); the
// canonical representative is the primitive integer tuple with first nonzero
// coordinate positive.

const Z0 = 0n, Z1 = 1n;

export function bgcd(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export function qmul(A, B) {
  const [w1, x1, y1, z1] = A, [w2, x2, y2, z2] = B;
  return [
    w1*w2 - x1*x2 - y1*y2 - z1*z2,
    w1*x2 + x1*w2 + y1*z2 - z1*y2,
    w1*y2 - x1*z2 + y1*w2 + z1*x2,
    w1*z2 + x1*y2 - y1*x2 + z1*w2,
  ];
}

export const qconj = (A) => [A[0], -A[1], -A[2], -A[3]];
export const qnorm = (A) => A[0]*A[0] + A[1]*A[1] + A[2]*A[2] + A[3]*A[3];

export function content(A) {
  let g = Z0;
  for (const v of A) { g = bgcd(g, v); if (g === Z1) break; }
  return g;
}

export function primitive(A) {
  const g = content(A);
  if (g <= Z1) return A;
  return [A[0]/g, A[1]/g, A[2]/g, A[3]/g];
}

export function canonical(A) {
  const q = primitive(A);
  for (const v of q) {
    if (v !== Z0) return v < Z0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
  }
  return q;
}

export const keyOf = (A) => canonical(A).join(",");
export const isOne = (A) => { const q = canonical(A); return q[0] === Z1 && q[1] === Z0 && q[2] === Z0 && q[3] === Z0; };
export const ONE = [Z1, Z0, Z0, Z0];

export function vP(n, p) {                 // p-adic valuation of a BigInt
  n = n < 0n ? -n : n;
  if (n === Z0) return Infinity;
  let d = 0;
  while (n % p === Z0) { n /= p; d++; }
  return d;
}

// --- LPS generators at p (p prime, p = 1 mod 4) -------------------------
// The p+1 quaternions of norm p with w odd, w>0, and x,y,z even.  They pair
// off by conjugation into (p+1)/2 free generators x_1..x_r and inverses.

export function lpsGenerators(p) {
  const P = BigInt(p);
  const gens = [];
  const bound = Math.floor(Math.sqrt(p));
  for (let w = 1; w <= bound; w += 2) {            // w odd > 0
    const rem = p - w*w;
    if (rem < 0) break;
    for (let x = -bound; x <= bound; x++) {        // x,y,z even
      if (x % 2 !== 0) continue;
      const r2 = rem - x*x; if (r2 < 0) continue;
      for (let y = -bound; y <= bound; y++) {
        if (y % 2 !== 0) continue;
        const r3 = r2 - y*y; if (r3 < 0) continue;
        const zz = Math.round(Math.sqrt(r3));
        for (const z of (zz === 0 ? [0] : [zz, -zz])) {
          if (z % 2 !== 0) continue;
          if (x*x + y*y + z*z === rem) {
            gens.push([BigInt(w), BigInt(x), BigInt(y), BigInt(z)]);
          }
        }
      }
    }
  }
  // dedup
  const seen = new Set(), G = [];
  for (const g of gens) { const k = g.join(","); if (!seen.has(k)) { seen.add(k); G.push(g); } }
  // build conjugate-inverse index map
  const idx = new Map(); G.forEach((g, i) => idx.set(g.join(","), i));
  const INV = G.map((g) => idx.get(qconj(g).join(",")));
  return { gens: G, conj: G.map(qconj), inv: INV, rank: G.length / 2, p: P };
}

// Letter labels: positive generators get a..; we expose an index alphabet.
// For the free group we only need: generator index -> (letterId, isPositive).
// We canonicalise each conjugate pair {i, INV[i]} to a single positive letter.
export function letterScheme(L) {
  const pos = [];                     // representative index for each pair
  const letterOf = new Array(L.gens.length).fill(-1);
  const signOf = new Array(L.gens.length).fill(1);
  for (let i = 0; i < L.gens.length; i++) {
    if (letterOf[i] !== -1) continue;
    const j = L.inv[i];
    const id = pos.length;
    pos.push(i);
    letterOf[i] = id; signOf[i] = 1;
    letterOf[j] = id; signOf[j] = -1;
  }
  return { pos, letterOf, signOf, nLetters: pos.length };
}

// Factor a primitive quaternion of norm p^k into a reduced word.
// Returns an array of "directed letter" indices in 0..2*nLetters-1, where
// directed = 2*letter + (isPositive?0:1).
export function lpsFactor(qPrim, L, scheme) {
  const p = L.p;
  const k = vP(qnorm(qPrim), p);
  let cur = qPrim;
  const wordRev = [];
  for (let step = 0; step < k; step++) {
    let found = -1, nxt = null;
    for (let i = 0; i < L.gens.length; i++) {
      const prod = qmul(cur, L.conj[i]);
      if (prod[0] % p === Z0 && prod[1] % p === Z0 && prod[2] % p === Z0 && prod[3] % p === Z0) {
        if (wordRev.length && i === L.inv[wordRev[wordRev.length - 1]]) continue;
        found = i; nxt = [prod[0]/p, prod[1]/p, prod[2]/p, prod[3]/p];
        break;
      }
    }
    if (found === -1) {
      for (let i = 0; i < L.gens.length; i++) {
        const prod = qmul(cur, L.conj[i]);
        if (prod[0] % p === Z0 && prod[1] % p === Z0 && prod[2] % p === Z0 && prod[3] % p === Z0) {
          found = i; nxt = [prod[0]/p, prod[1]/p, prod[2]/p, prod[3]/p]; break;
        }
      }
    }
    if (found === -1) return null;          // not a power of p
    wordRev.push(found);
    cur = primitive(nxt);
  }
  // translate generator indices to directed letters and reduce
  const directed = [];
  for (let t = wordRev.length - 1; t >= 0; t--) {
    const gi = wordRev[t];
    const d = 2 * scheme.letterOf[gi] + (scheme.signOf[gi] === 1 ? 0 : 1);
    directed.push(d);
  }
  return directed;
}
