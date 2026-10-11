// forms.js — rational invariants of integral quadratic forms.
//
// For a form f of signature (n, 1) the group O′(f, ℤ) is an arithmetic
// lattice in Isom(ℍⁿ), and two such lattices are commensurable (up to
// isometry) iff the forms are SIMILAR over ℚ: f ≅ λg for some λ ∈ ℚ>0.
// Everything here is decided exactly through the classical local invariants
// (discriminant, Hasse–Witt invariants, Hilbert symbols), following Serre,
// "A Course in Arithmetic", Ch. IV, with ε(f) = ∏_{i<j} (a_i, a_j).

import { diagonalizeQ } from './linalg.js';

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
    if (n === 0) return 0;
    let r = n < 0 ? -1 : 1;
    for (const [p, e] of factorize(n)) if (e % 2) r *= p;
    return r;
}

const modp = (a, m) => ((a % m) + m) % m;

function powmod(b, e, m) {
    let r = 1n, x = BigInt(modp(b, m)); const M = BigInt(m); let E = BigInt(e);
    while (E > 0n) { if (E & 1n) r = (r * x) % M; x = (x * x) % M; E >>= 1n; }
    return Number(r);
}

export function legendre(a, p) {
    a = modp(a, p);
    if (a === 0) return 0;
    return powmod(a, (p - 1) / 2, p) === 1 ? 1 : -1;
}

function valuation(n, p) {
    let v = 0;
    while (n !== 0 && n % p === 0) { n /= p; v++; }
    return [v, n];
}

/** Hilbert symbol (a, b)_p for nonzero integers a, b; p a prime or Infinity. */
export function hilbert(a, b, p) {
    if (p === Infinity) return (a < 0 && b < 0) ? -1 : 1;
    const [al, u] = valuation(a, p), [be, w] = valuation(b, p);
    if (p !== 2) {
        let r = ((al * be) % 2 && ((p - 1) / 2) % 2) ? -1 : 1;
        if (be % 2) r *= legendre(u, p);
        if (al % 2) r *= legendre(w, p);
        return r;
    }
    const eps = x => modp((x - 1) / 2, 2);
    const om = x => modp((x * x - 1) / 8, 2);
    const e = eps(u) * eps(w) + al * om(w) + be * om(u);
    return e % 2 ? -1 : 1;
}

/** Is the squarefree integer a a square in ℚ_p? */
export function isSquareQp(a, p) {
    if (p === Infinity) return a > 0;
    if (a % p === 0) return false;            // squarefree ⇒ odd valuation
    if (p === 2) return modp(a, 8) === 1;
    return legendre(a, p) === 1;
}

/**
 * Local data of the form with integer Gram matrix G: the diagonal over ℚ as
 * squarefree integers, the squarefree discriminant, and the primes where
 * anything interesting can happen (2 and the primes dividing the diagonal).
 */
export function localData(G) {
    const diag = diagonalizeQ(G).map(x => {
        const n = Number(x.n), d = Number(x.d);
        if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new Error('form too large for exact invariants');
        return squarefree(squarefree(n) * squarefree(d));
    });
    if (diag.some(x => x === 0)) throw new Error('degenerate form');
    const disc = squarefree(diag.reduce((s, x) => squarefree(s * x), 1));
    const primes = new Set([2]);
    for (const a of diag) for (const [p] of factorize(a)) primes.add(p);
    const hasse = p => {
        let e = 1;
        for (let i = 0; i < diag.length; i++) for (let j = i + 1; j < diag.length; j++) e *= hilbert(diag[i], diag[j], p);
        return e;
    };
    return { diag, disc, primes: [...primes].sort((a, b) => a - b), hasse, m: diag.length };
}

/** Is the form isotropic over ℚ_p (Serre IV.2.2 Thm 6)? */
export function isotropicAt(L, p) {
    const { diag, disc: d, m } = L;
    if (p === Infinity) return diag.some(x => x > 0) && diag.some(x => x < 0);
    const e = L.hasse(p);
    if (m === 2) return isSquareQp(squarefree(-d), p);
    if (m === 3) return hilbert(-1, -d, p) === e;
    if (m === 4) return !(isSquareQp(d, p) && e === -hilbert(-1, -1, p));
    return true;
}

/** Hasse–Minkowski: isotropic over ℚ iff isotropic at every place. */
export function isotropicQ(G) {
    const L = localData(G);
    if (!isotropicAt(L, Infinity)) return false;
    return L.primes.every(p => isotropicAt(L, p));
}

/** Rational isometry f ≅ g (same dimension, discriminant, signature, Hasse invariants). */
function isometricQ(La, Lb) {
    if (La.m !== Lb.m || La.disc !== Lb.disc) return false;
    const pos = L => L.diag.filter(x => x > 0).length;
    if (pos(La) !== pos(Lb)) return false;
    const primes = new Set([...La.primes, ...Lb.primes]);
    for (const p of primes) if (La.hasse(p) !== Lb.hasse(p)) return false;
    return true;
}

function scaleForm(G, lam) { return G.map(r => r.map(x => x * lam)); }

/**
 * Similarity over ℚ with a POSITIVE scalar (so the signature is kept):
 * f ≅ λ·g for some λ ∈ ℚ>0. This is exactly commensurability of O′(f,ℤ) and
 * O′(g,ℤ) up to conjugation in Isom(ℍⁿ).
 */
export function similarQ(Gf, Gg) {
    const Lf = localData(Gf), Lg = localData(Gg);
    if (Lf.m !== Lg.m) return false;
    const m = Lf.m;
    if (m % 2 === 1) {
        // d(λg) = λ^m d(g) ≡ λ d(g): the only candidate is λ = d(f)/d(g)
        const lam = squarefree(Lf.disc * Lg.disc);
        if (lam < 0) return false;
        return isometricQ(Lf, localData(scaleForm(Gg, lam)));
    }
    if (Lf.disc !== Lg.disc) return false;
    // c_p(λg) = c_p(g)·(λ, δ)_p with δ = (−1)^{m(m−1)/2} d. A λ > 0 with the
    // prescribed symbols exists iff the symbols agree wherever δ is a square.
    const delta = squarefree(((m * (m - 1) / 2) % 2 ? -1 : 1) * Lf.disc);
    const primes = new Set([...Lf.primes, ...Lg.primes]);
    for (const p of primes) {
        const eps = Lf.hasse(p) * Lg.hasse(p);
        if (eps === -1 && (delta === 1 || isSquareQp(delta, p))) return false;
    }
    if (delta === 1) return [...primes].every(p => Lf.hasse(p) === Lg.hasse(p));
    return true;
}

/** Ramification set of the quaternion algebra (a, b / ℚ). */
export function ramSet(a, b) {
    a = squarefree(a); b = squarefree(b);
    const places = new Set([2]);
    for (const [p] of factorize(a)) places.add(p);
    for (const [p] of factorize(b)) places.add(p);
    const ram = [];
    if (hilbert(a, b, Infinity) === -1) ram.push(Infinity);
    for (const p of [...places].sort((x, y) => x - y)) if (hilbert(a, b, p) === -1) ram.push(p);
    return ram;
}

/**
 * Commensurability invariants of O′(f, ℤ), in the language of the dimension:
 *   n = 2: the quaternion algebra C₀(f) over ℚ (Fuchsian case);
 *   n = 3: k = ℚ(√d) and the primes above which the invariant quaternion
 *          algebra A = C₀(f) over k ramifies (Kleinian case);
 *   n ≥ 4: the discriminant and the Hasse–Witt invariants.
 */
export function describeForm(G) {
    const L = localData(G);
    const m = L.m, n = m - 1;
    const cusped = isotropicQ(G);
    const out = { n, diag: L.diag, disc: L.disc, cusped, kind: 'general' };
    if (m === 3) {
        const [q1, q2, q3] = L.diag;
        const a = squarefree(-q1 * q2), b = squarefree(-q1 * q3);
        out.kind = 'fuchsian';
        out.algebra = [a, b];
        out.ram = ramSet(a, b);
    } else if (m === 4) {
        out.kind = 'kleinian';
        out.field = L.disc;                  // k = ℚ(√disc), disc < 0
        const ram = [];
        for (const p of L.primes) if (isSquareQp(L.disc, p) && !isotropicAt(L, p)) ram.push(p);
        out.ramAbove = ram;                 // A ramifies at both primes of k above each p
    } else {
        out.hasse = L.primes.map(p => [p, L.hasse(p)]).filter(([, e]) => e === -1).map(([p]) => p);
    }
    return out;
}
