/**
 * gauss.js — exact arithmetic for SO₂(ℚ), the rotations of the plane with
 * rational entries.  Shared by the deck and both visualizations.
 *
 * A rational rotation is  (1/c)·[[a, −b], [b, a]]  with  a² + b² = c²  and
 * gcd(a, b, c) = 1.  We write it as the complex number (a + bi)/c, so that
 * composing rotations is multiplying.
 *
 * Unique factorisation in ℤ[i] gives the whole structure.  Every prime
 * p ≡ 1 (mod 4) is  p = x² + y²  (x > y > 0)  = π·π̄  with  π = x + yi,  and
 *
 *        r_p = π / π̄ = ((x² − y²) + 2xy·i) / p .
 *
 * Every rational rotation is uniquely  u · ∏ r_p^{n_p}  with u ∈ {1, i, −1, −i},
 * and its denominator in lowest terms is  ∏ p^{|n_p|}.  Writing
 * β = ∏ π_p^{n_p}  (π̄_p when n_p < 0) the rotation is u·β/β̄, and it carries
 * the sub-grid β̄·ℤ[i] exactly onto the sub-grid β·ℤ[i]: those are precisely
 * the grid points that land on grid points, 1/c of the grid.
 *
 * Exact quantities are BigInt; angles (for drawing only) are floats.
 * Exponent vectors are arrays of [p, n] pairs.
 */
(function (root) {
    'use strict';

    const big = (x) => (typeof x === 'bigint' ? x : BigInt(x));
    const absB = (x) => (x < 0n ? -x : x);
    const modB = (a, m) => ((a % m) + m) % m;

    function gcdB(a, b) {
        a = absB(a); b = absB(b);
        while (b) [a, b] = [b, a % b];
        return a;
    }

    function gcd(a, b) {
        a = Math.abs(a); b = Math.abs(b);
        while (b) [a, b] = [b, a % b];
        return a;
    }

    function isPrime(n) {
        if (n < 2) return false;
        if (n % 2 === 0) return n === 2;
        for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
        return true;
    }

    /** Prime factorisation of a positive integer by trial division → [[p, e], …]. */
    function factor(n) {
        n = absB(big(n));
        const out = [];
        for (let d = 2n; d * d <= n; d += (d === 2n ? 1n : 2n)) {
            let e = 0;
            while (n % d === 0n) { n /= d; e++; }
            if (e) out.push([Number(d), e]);
        }
        if (n > 1n) out.push([Number(n), 1]);
        return out;
    }

    /** p = x² + y² with x > y > 0 — exists, and is unique, for primes p ≡ 1 (mod 4). */
    function twoSquares(p) {
        for (let y = 1; 2 * y * y < p; y++) {
            const x = Math.round(Math.sqrt(p - y * y));
            if (x * x + y * y === p) return [x, y];
        }
        return null;
    }

    const GEN = new Map();
    /** The generating rotation r_p = ((x² − y²) + 2xy·i)/p of a prime p ≡ 1 (mod 4). */
    function generator(p) {
        let g = GEN.get(p);
        if (!g) {
            const xy = twoSquares(p);
            if (!xy) throw new Error(p + ' is not a sum of two squares');
            const [x, y] = xy;
            const a = x * x - y * y, b = 2 * x * y;
            g = { p, x, y, a, b, angle: Math.atan2(b, a) };
            GEN.set(p, g);
        }
        return g;
    }

    /** The first `count` primes ≡ 1 (mod 4): 5, 13, 17, 29, 37, 41, … */
    function splitPrimes(count) {
        const out = [];
        for (let n = 5; out.length < count; n += 4) if (isPrime(n)) out.push(n);
        return out;
    }

    // ── Gaussian integers as [re, im] BigInt pairs ───────────────────
    const gmul = (z, w) => [z[0] * w[0] - z[1] * w[1], z[0] * w[1] + z[1] * w[0]];
    function gpow(z, k) {
        let r = [1n, 0n];
        for (let j = 0; j < k; j++) r = gmul(r, z);
        return r;
    }
    const UNITS = [[1n, 0n], [0n, 1n], [-1n, 0n], [0n, -1n]];   // iᵘ
    const unitIndex = (u) => ((u % 4) + 4) % 4;

    /** β = ∏ π_p^{n_p} (π̄_p for n_p < 0), so that ∏ r_p^{n_p} = β/β̄ = β²/N(β). */
    function beta(exps) {
        let z = [1n, 0n];
        for (const [p, n] of exps) {
            if (!n) continue;
            const g = generator(p);
            z = gmul(z, gpow([big(g.x), big(n > 0 ? g.y : -g.y)], Math.abs(n)));
        }
        return z;
    }

    /** Exact value of u·∏ r_p^{n_p} as (re + im·i)/den, in lowest terms. */
    function rotation(exps, u = 0) {
        const b = beta(exps);
        const den = b[0] * b[0] + b[1] * b[1];
        const num = gmul(UNITS[unitIndex(u)], gmul(b, b));
        return { re: num[0], im: num[1], den };
    }

    /** Angle (radians, float) of u·∏ r_p^{n_p}. */
    function angleOf(exps, u = 0) {
        let t = unitIndex(u) * Math.PI / 2;
        for (const [p, n] of exps) if (n) t += n * generator(p).angle;
        return t;
    }

    /**
     * Factor the rotation (a + bi)/c, where a² + b² = c², as u·∏ r_p^{n_p}.
     * → {ok: true, a, b, c (lowest terms, BigInt), u, exps}  or  {ok: false, reason}.
     */
    function factorRotation(a, b, c) {
        a = big(a); b = big(b); c = big(c);
        if (c === 0n) return { ok: false, reason: 'c must be non-zero' };
        if (a * a + b * b !== c * c) return { ok: false, reason: 'a² + b² ≠ c²: that is not a rotation' };
        if (c < 0n) { a = -a; b = -b; c = -c; }
        const g = gcdB(gcdB(a, b), c);
        a /= g; b /= g; c /= g;
        const exps = [];
        for (const [p, e] of factor(c)) {
            if (p % 4 !== 1) return { ok: false, reason: 'internal: prime ' + p + ' in a denominator' };
            const { x, y } = generator(p);
            const P = big(p), X = big(x), Y = big(y);
            // π = x + yi divides a + bi  ⇔  (a + bi)(x − yi) ≡ 0  (mod p)
            const plus = modB(a * X + b * Y, P) === 0n && modB(b * X - a * Y, P) === 0n;
            exps.push([p, plus ? e : -e]);
        }
        const w = rotation(exps, 0);
        for (let u = 0; u < 4; u++) {
            const z = gmul(UNITS[u], [w.re, w.im]);
            if (z[0] === a && z[1] === b) return { ok: true, a, b, c, u, exps };
        }
        return { ok: false, reason: 'internal: no unit matched' };
    }

    /**
     * Every rational point of the unit circle with denominator ≤ C, as
     * {a, b, c, angle} (Numbers).  Euclid: m > n > 0 coprime, m − n odd.
     */
    function rationalPoints(C) {
        const pts = [[1, 0, 1], [0, 1, 1], [-1, 0, 1], [0, -1, 1]];
        for (let m = 2; m * m + 1 <= C; m++) {
            for (let n = 1; n < m; n++) {
                const c = m * m + n * n;
                if (c > C) break;
                if ((m - n) % 2 === 0 || gcd(m, n) !== 1) continue;
                const A = m * m - n * n, B = 2 * m * n;
                for (const [x, y] of [[A, B], [B, A]])
                    for (const sx of [1, -1])
                        for (const sy of [1, -1]) pts.push([sx * x, sy * y, c]);
            }
        }
        return pts.map(([a, b, c]) => ({ a, b, c, angle: Math.atan2(b, a) }));
    }

    /** Does the rotation (a + bi)/c carry the grid point (x, y) to a grid point? */
    function landsOnGrid(a, b, c, x, y) {
        return (a * x - b * y) % c === 0 && (b * x + a * y) % c === 0;
    }

    // ── formatting ───────────────────────────────────────────────────
    const minus = (s) => String(s).replace(/-/g, '−');
    const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴',
                  5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄',
                  5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
    const supStr = (n) => String(n).split('').map((ch) => SUP[ch] || ch).join('');
    const subStr = (n) => String(n).split('').map((ch) => SUB[ch] || ch).join('');

    const live = (exps) => exps.filter(([, n]) => n);

    /** −r₅⁻¹ r₁₃⁻¹  as TeX. */
    function wordTeX(u, exps) {
        const parts = live(exps).map(([p, n]) => `r_{${p}}` + (n === 1 ? '' : `^{${n}}`));
        const k = unitIndex(u);
        if (!parts.length) return ['1', 'i', '-1', '-i'][k];
        return ['', 'i\\,', '-', '-i\\,'][k] + parts.join('\\,');
    }

    /** −r₅⁻¹ r₁₃⁻¹  as HTML. */
    function wordHTML(u, exps) {
        const parts = live(exps).map(([p, n]) =>
            `r<sub>${p}</sub>` + (n === 1 ? '' : `<sup>${minus(n)}</sup>`));
        const k = unitIndex(u);
        if (!parts.length) return ['1', '<i>i</i>', '−1', '−<i>i</i>'][k];
        return ['', '<i>i</i> ', '−', '−<i>i</i> '][k] + parts.join(' ');
    }

    /** −r₅⁻¹r₁₃⁻¹  as plain Unicode (canvas labels). */
    function wordText(u, exps) {
        const parts = live(exps).map(([p, n]) => 'r' + subStr(p) + (n === 1 ? '' : supStr(n)));
        const k = unitIndex(u);
        if (!parts.length) return ['1', 'i', '−1', '−i'][k];
        return ['', 'i·', '−', '−i·'][k] + parts.join('');
    }

    /** "5²·13" for a factorisation [[5, 2], [13, 1]]. */
    function factorText(fs) {
        if (!fs.length) return '1';
        return fs.map(([p, e]) => p + (e > 1 ? supStr(e) : '')).join('·');
    }

    /** (a + bi)/c as HTML: "(253 + 204<i>i</i>)/325". */
    function complexHTML(re, im, den) {
        re = big(re); im = big(im); den = big(den);
        let num;
        if (im === 0n) num = minus(re);
        else if (re === 0n) num = (im === 1n ? '' : im === -1n ? '−' : minus(im)) + '<i>i</i>';
        else num = `${minus(re)} ${im < 0n ? '−' : '+'} ${absB(im) === 1n ? '' : absB(im)}<i>i</i>`;
        if (den === 1n) return num;
        return `(${num})/${den}`;
    }

    const Gauss = {
        big, gcd, gcdB, isPrime, factor, twoSquares, generator, splitPrimes,
        gmul, gpow, UNITS, beta, rotation, angleOf, factorRotation,
        rationalPoints, landsOnGrid,
        minus, supStr, subStr, wordTeX, wordHTML, wordText, factorText, complexHTML,
    };
    root.Gauss = Gauss;
    if (typeof module !== 'undefined' && module.exports) module.exports = Gauss;
})(typeof window !== 'undefined' ? window : globalThis);
