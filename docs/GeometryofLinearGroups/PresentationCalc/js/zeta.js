/**
 * zeta.js — the Dedekind zeta value ζ_k(2) of a number field k = ℚ(θ), numerically, for Borel's volume
 * formula (covolume.js), and the recognition of a ratio of volumes as a rational number.
 *
 *   · k = ℚ: ζ(2) = π²/6.
 *   · k quadratic, of discriminant D: ζ_k(2) = ζ(2)·L(2, χ_D), with L(2, χ_D) = |D|⁻² Σ_{a=1}^{|D|} χ_D(a) ζ(2, a/|D|)
 *     and the Hurwitz zeta values by Euler–Maclaurin: to about 15 digits.
 *   · otherwise the Euler product ∏_𝔭 (1 − N𝔭⁻²)⁻¹ over the primes 𝔭 of k above p ≤ P: for p ∤ disc(g) the residue
 *     degrees are those of the irreducible factors of the minimal polynomial g of θ mod p (distinct-degree
 *     factorization), and for p | disc(g) they come from the ring engine's prime decomposition in O_k. The rest is
 *     Σ_{p > P} p⁻² ≈ 1/(P log P), since p has on average one prime of degree 1 above it: about 7 digits for P = 2·10⁵.
 *
 * Classic script (self.Zeta, after ringEngine.js) for covolumeWorker.js, or a Node module for tests.
 */
(function (root) {
    'use strict';
    const isNode = typeof module !== 'undefined' && module.exports;
    const NR = isNode ? require('../../Algebraic/Tools/numberRings/ringEngine.js') : root.NumberRingEngine;
    const ZETA2 = Math.PI * Math.PI / 6;

    /** ζ(2, x) = Σ_{n ≥ 0} (n + x)⁻² for x > 0 (Euler–Maclaurin after 20 terms). */
    function hurwitz2(x) {
        let s = 0;
        const N = 20;
        for (let n = 0; n < N; n++) s += 1 / ((n + x) * (n + x));
        const y = N + x;
        // ∫ + f/2 + Σ B_{2k} y^{−2k−1}  (B₂, B₄, B₆, B₈, B₁₀)
        s += 1 / y + 1 / (2 * y * y);
        const B = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66];
        for (let k = 1; k <= B.length; k++) s += B[k - 1] / y ** (2 * k + 1);
        return s;
    }

    /** The Kronecker symbol (D/n), n ≥ 1, D a discriminant. */
    function kronecker(D, n) {
        let r = 1;
        while (n % 2 === 0) {
            n /= 2;
            const m = ((D % 8) + 8) % 8;
            if (m % 2 === 0) return 0;
            if (m === 3 || m === 5) r = -r;
        }
        // Jacobi symbol (D/n), n odd
        let a = ((D % n) + n) % n;
        while (a !== 0) {
            while (a % 2 === 0) { a /= 2; if (n % 8 === 3 || n % 8 === 5) r = -r; }
            [a, n] = [n, a];
            if (a % 4 === 3 && n % 4 === 3) r = -r;
            a %= n;
        }
        return n === 1 ? r : 0;
    }

    /** L(2, χ_D) for a fundamental discriminant D. */
    function L2(D) {
        const m = Math.abs(D);
        let s = 0;
        for (let a = 1; a <= m; a++) { const c = kronecker(D, a); if (c) s += c * hurwitz2(a / m); }
        return s / (m * m);
    }

    // ── polynomials mod p (Number coefficients, low → high; p < 2^26 so products stay exact) ──
    const trim = (a) => { let n = a.length; while (n > 0 && a[n - 1] === 0) n--; return a.slice(0, n); };
    const mod = (x, p) => ((x % p) + p) % p;
    function inv(a, p) { let [r0, r1, s0, s1] = [a, p, 1, 0]; while (r1) { const q = Math.floor(r0 / r1); [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return mod(s0, p); }
    function pmod(a, f, p) { // a mod f, f monic
        a = a.slice();
        const n = f.length - 1;
        for (let i = a.length - 1; i >= n; i--) {
            const c = a[i];
            if (!c) continue;
            for (let j = 0; j <= n; j++) a[i - n + j] = mod(a[i - n + j] - c * f[j], p);
        }
        return trim(a.slice(0, n));
    }
    function pmulmod(a, b, f, p) {
        if (!a.length || !b.length) return [];
        const r = new Array(a.length + b.length - 1).fill(0);
        for (let i = 0; i < a.length; i++) { if (!a[i]) continue; for (let j = 0; j < b.length; j++) r[i + j] = (r[i + j] + a[i] * b[j]) % p; }
        return pmod(r, f, p);
    }
    function ppowmod(a, e, f, p) { let r = [1], b = pmod(a, f, p); while (e > 0) { if (e & 1) r = pmulmod(r, b, f, p); e = Math.floor(e / 2); if (e) b = pmulmod(b, b, f, p); } return r; }
    function monic(a, p) { a = trim(a); if (!a.length) return a; const c = inv(a[a.length - 1], p); return a.map((x) => (x * c) % p); }
    function pgcd(a, b, p) {
        a = trim(a); b = trim(b);
        while (b.length) { const r = b.length > 1 || b[0] ? pmodGeneral(a, b, p) : []; [a, b] = [b, r]; }
        return monic(a, p);
    }
    function pmodGeneral(a, b, p) { return pmod(a, monic(b, p), p); }
    function pdiv(a, b, p) { // exact quotient a / b, b monic
        a = a.slice();
        const n = b.length - 1, q = new Array(Math.max(0, a.length - n)).fill(0);
        for (let i = a.length - 1; i >= n; i--) {
            const c = a[i];
            if (!c) continue;
            q[i - n] = c;
            for (let j = 0; j <= n; j++) a[i - n + j] = mod(a[i - n + j] - c * b[j], p);
        }
        return trim(q);
    }
    /** Residue degrees of the irreducible factors of a squarefree monic g mod p (distinct-degree factorization). */
    function factorDegrees(g, p) {
        let f = monic(g.map((c) => mod(c, p)), p);
        const out = [];
        let xp = [0, 1];
        for (let d = 1; f.length - 1 >= 2 * d; d++) {
            xp = ppowmod(xp, p, f, p);                      // x^{p^d} mod f
            const h = xp.slice(); while (h.length < 2) h.push(0);
            h[1] = mod(h[1] - 1, p);
            const gd = pgcd(f, trim(h), p);
            const k = (gd.length - 1) / d;
            for (let i = 0; i < k; i++) out.push(d);
            if (gd.length > 1) { f = pdiv(f, gd, p); xp = pmod(xp, f, p); }
        }
        if (f.length > 1) out.push(f.length - 1);
        return out;
    }

    function primesUpTo(P) {
        const sieve = new Uint8Array(P + 1), out = [];
        for (let i = 2; i <= P; i++) { if (sieve[i]) continue; out.push(i); for (let j = i * i; j <= P; j += i) sieve[j] = 1; }
        return out;
    }

    /**
     * ζ_k(2). k = { d, minpoly: [c₀, …, c_d] (strings or BigInt, monic, integral), disc } as the Zariski engine gives
     * it. Returns { value, method, digits }.
     */
    function zetaK2(k, { P = 200000 } = {}) {
        const d = k.d;
        if (d === 1) return { value: ZETA2, method: 'exact', digits: 15 };
        const D = Number(BigInt(k.disc));
        if (d === 2) return { value: ZETA2 * L2(D), method: 'L-function', digits: 14 };
        const g = k.minpoly.map((c) => BigInt(c));
        if (g[g.length - 1] !== 1n) throw new Error('the minimal polynomial is not monic');
        const mo = NR._internal.maximalOrderFor(g);
        const bad = new Map();
        for (const [q] of NR._internal.factorInt(mo.nf.disc < 0n ? -mo.nf.disc : mo.nf.disc).factors) bad.set(BigInt(q), NR._internal.primesAbove(mo.O, BigInt(q)).map((pr) => pr.f));
        let logZ = 0;
        const gn = g.map(Number);
        for (const p of primesUpTo(P)) {
            const degs = bad.has(BigInt(p)) ? bad.get(BigInt(p)) : factorDegrees(gn, p);
            for (const f of degs) logZ -= Math.log1p(-(p ** (-2 * f)));
        }
        for (const [q, degs] of bad) if (q > BigInt(P)) for (const f of degs) logZ -= Math.log1p(-(Number(q) ** (-2 * f)));
        logZ += 1 / (P * Math.log(P));                        // the tail
        return { value: Math.exp(logZ), method: 'Euler product', digits: 7 };
    }

    /** The simplest fraction a/b (b ≤ maxDen) within rel·|x| of x, by continued fractions; or null. */
    function rational(x, { maxDen = 240, rel = 3e-6 } = {}) {
        let [h0, h1, k0, k1] = [0, 1, 1, 0], y = x;
        for (let i = 0; i < 40; i++) {
            const a = Math.floor(y);
            [h0, h1] = [h1, a * h1 + h0];
            [k0, k1] = [k1, a * k1 + k0];
            if (k1 > maxDen) break;
            if (Math.abs(h1 / k1 - x) <= rel * Math.abs(x)) return { num: h1, den: k1 };
            const frac = y - a;
            if (frac < 1e-12) break;
            y = 1 / frac;
        }
        return null;
    }

    const api = { zetaK2, rational, L2, kronecker, hurwitz2, factorDegrees, ZETA2 };
    if (isNode) module.exports = api; else root.Zeta = api;
})(typeof self !== 'undefined' ? self : this);
