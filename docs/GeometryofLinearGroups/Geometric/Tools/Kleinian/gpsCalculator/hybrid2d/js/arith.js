// arith.js — exact arithmetic invariants of ternary quadratic forms over Q.
//
// A form f = ⟨s1, c, −s3⟩ (diagonal, signature (2,1)) determines the even
// Clifford quaternion algebra C0(f) = (−s1·c, s1·s3 / Q).  Two such forms are
// similar over Q iff their even Clifford algebras are isomorphic, and the
// lattices O(f1,Z), O(f2,Z) are widely commensurable in PGL2(R) iff the
// algebras agree, i.e. iff their ramification sets coincide.  The group is
// non-cocompact (cusped) iff f is isotropic over Q iff C0(f) splits (empty
// ramification).

export function factorize(n) {
    n = Math.abs(n);
    const f = new Map();
    if (n < 2) return f;
    for (let p = 2; p * p <= n; p += (p === 2 ? 1 : 2)) {
        while (n % p === 0) { f.set(p, (f.get(p) || 0) + 1); n /= p; }
    }
    if (n > 1) f.set(n, (f.get(n) || 0) + 1);
    return f;
}

export function squarefree(n) {
    const sign = n < 0 ? -1 : 1;
    let r = sign;
    for (const [p, e] of factorize(n)) if (e % 2) r *= p;
    return r;
}

function mod(a, m) { return ((a % m) + m) % m; }

export function legendre(a, p) {          // p an odd prime
    a = mod(a, p);
    if (a === 0) return 0;
    let r = 1, base = a, e = (p - 1) / 2;  // Euler's criterion by fast pow
    while (e > 0) {
        if (e & 1) r = (r * base) % p;
        base = (base * base) % p;
        e >>= 1;
    }
    return r === 1 ? 1 : -1;
}

function valuation(n, p) {
    let v = 0;
    while (n % p === 0) { n /= p; v++; }
    return [v, n];
}

// Hilbert symbol (a,b)_p for nonzero integers a,b; p a prime or Infinity.
export function hilbert(a, b, p) {
    if (p === Infinity) return (a < 0 && b < 0) ? -1 : 1;
    if (p !== 2) {
        const [al, u] = valuation(a, p), [be, w] = valuation(b, p);
        let r = (al * be) % 2 && ((p - 1) / 2) % 2 ? -1 : 1;
        if (be % 2) r *= legendre(u, p);
        if (al % 2) r *= legendre(w, p);
        return r;
    }
    const [al, u] = valuation(a, 2), [be, w] = valuation(b, 2);
    const eps = x => mod((x - 1) / 2, 2);            // x odd
    const om = x => mod((x * x - 1) / 8, 2);
    const e = eps(u) * eps(w) + al * om(w) + be * om(u);
    return e % 2 ? -1 : 1;
}

// Ramification set of the quaternion algebra (a,b / Q): the places where the
// Hilbert symbol is −1.  Always a finite set of even cardinality.
export function ramSet(a, b) {
    a = squarefree(a); b = squarefree(b);
    const places = new Set([2]);
    for (const [p] of factorize(a)) places.add(p);
    for (const [p] of factorize(b)) places.add(p);
    const ram = [];
    if (hilbert(a, b, Infinity) === -1) ram.push(Infinity);
    for (const p of [...places].sort((x, y) => x - y)) {
        if (hilbert(a, b, p) === -1) ram.push(p);
    }
    if (ram.length % 2 !== 0) throw new Error(`odd ramification set for (${a},${b})`);
    return ram;
}

// Invariants of the piece with form ⟨s1, c, −s3⟩.
export function pieceInvariants(s1, c, s3) {
    const qa = -s1 * c, qb = s1 * s3;
    const ram = ramSet(qa, qb);
    return {
        form: [s1, c, -s3],
        algebra: [squarefree(qa), squarefree(qb)],
        ram,
        cusped: ram.length === 0,          // isotropic over Q ⇔ C0 splits
        disc: squarefree(-s1 * c * s3),
    };
}

export function sameSet(r1, r2) {
    return r1.length === r2.length && r1.every((v, i) => v === r2[i]);
}

export function ramString(ram) {
    if (ram.length === 0) return '∅  (split — B ≅ M₂(ℚ))';
    return '{ ' + ram.map(p => p === Infinity ? '∞' : p).join(', ') + ' }';
}
