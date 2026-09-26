/**
 * quat.js — integer quaternions and the rational rotations they define.
 * Shared by the deck and the scenes of SO₃(ℚ), part 3 (part 2's module plus
 * the local picture: how a rotation acts on each tree T_{p+1}).
 *
 * A quaternion is an array [a, b, c, d] = a + bi + cj + dk, with
 * i² = j² = k² = ijk = −1.  Conjugation v ↦ q v q̄ / N(q) fixes the real
 * part, so it rotates the pure quaternions ℝ³ = {bi + cj + dk}; for an
 * integer q the matrix R_q is rational with denominator N(q) (before
 * cancelling), and every rational rotation arises this way.
 *
 * Primes (Nic's normalization, one per class of associates under
 * {±1, ±i, ±j, ±k}):  for an odd prime p the set A_p of quaternions of norm p
 * with a > 0 and
 *     q ≡ 1        (mod 2)   if p ≡ 1 (mod 4),
 *     q ≡ 1 + i + j (mod 2)   if p ≡ 3 (mod 4).
 * Jacobi: there are 8(p + 1) quaternions of norm p, so |A_p| = p + 1.
 * Hurwitz: a primitive q has a unique left divisor of norm p (up to units),
 * whence metacommutation: for π ∈ A_p, σ ∈ A_q there are unique σ' ∈ A_q,
 * π' ∈ A_p with πσ = ±σ'π'.
 *
 * Numbers throughout: every size shown in the talk stays far below 2^53.
 */
(function (root) {
    'use strict';

    // ── arithmetic ──────────────────────────────────────────────────
    const mul = ([a1, b1, c1, d1], [a2, b2, c2, d2]) => [
        a1 * a2 - b1 * b2 - c1 * c2 - d1 * d2,
        a1 * b2 + b1 * a2 + c1 * d2 - d1 * c2,
        a1 * c2 - b1 * d2 + c1 * a2 + d1 * b2,
        a1 * d2 + b1 * c2 - c1 * b2 + d1 * a2,
    ];
    const conj = ([a, b, c, d]) => [a, -b, -c, -d];
    const neg = (q) => q.map((v) => -v);
    const norm = ([a, b, c, d]) => a * a + b * b + c * c + d * d;
    const eq = (x, y) => x[0] === y[0] && x[1] === y[1] && x[2] === y[2] && x[3] === y[3];
    const eqpm = (x, y) => eq(x, y) || eq(x, neg(y));
    const prod = (qs) => qs.reduce((x, y) => mul(x, y), [1, 0, 0, 0]);

    function gcd(a, b) {
        a = Math.abs(a); b = Math.abs(b);
        while (b) [a, b] = [b, a % b];
        return a;
    }
    function isPrime(n) {
        if (n < 2) return false;
        for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
        return true;
    }
    function factor(n) {
        const out = [];
        for (let d = 2; d * d <= n; d++) {
            let e = 0;
            while (n % d === 0) { n /= d; e++; }
            if (e) out.push([d, e]);
        }
        if (n > 1) out.push([n, 1]);
        return out;
    }
    const oddPart = (n) => { while (n > 0 && n % 2 === 0) n /= 2; return n; };
    /** Primitive (content 1) representative with the first non-zero entry positive: a key for q up to ℚ×. */
    function projective(q) {
        let g = 0;
        for (const v of q) g = gcd(g, v);
        let r = q.map((v) => v / g);
        const i = r.findIndex((v) => v !== 0);
        if (r[i] < 0) r = neg(r);
        return r;
    }
    const pkey = (q) => projective(q).join(',');

    // ── rotations ───────────────────────────────────────────────────
    /** Euler–Rodrigues: integer numerators of N(q)·R_q, R_q v = q v q̄ / N(q). */
    function rotNumerators([a, b, c, d]) {
        return [
            [a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c)],
            [2 * (b * c + a * d), a * a - b * b + c * c - d * d, 2 * (c * d - a * b)],
            [2 * (b * d - a * c), 2 * (c * d + a * b), a * a - b * b - c * c + d * d],
        ];
    }
    /** R_q in lowest terms: {M, den} with R_q = M / den. */
    function rot(q) {
        const M = rotNumerators(q), N = norm(q);
        let g = N;
        for (const r of M) for (const x of r) g = gcd(g, x);
        return { M: M.map((r) => r.map((x) => x / g)), den: N / g };
    }
    function rotFloat(q) {
        const N = norm(q);
        return rotNumerators(q).map((r) => r.map((x) => x / N));
    }
    const apply = (R, [x, y, z]) => [
        R[0][0] * x + R[0][1] * y + R[0][2] * z,
        R[1][0] * x + R[1][1] * y + R[1][2] * z,
        R[2][0] * x + R[2][1] * y + R[2][2] * z,
    ];
    const matMul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
    /** Axis (unit) and angle ∈ [0, π] of the rotation R_q (q ≠ 0). */
    function axisAngle(q) {
        const [a, b, c, d] = q;
        const s = Math.hypot(b, c, d);
        if (s < 1e-12) return { axis: [0, 0, 1], angle: 0 };
        let angle = 2 * Math.atan2(s, Math.abs(a));
        const sg = a < 0 ? -1 : 1;           // q and −q are the same rotation
        return { axis: [sg * b / s, sg * c / s, sg * d / s], angle };
    }
    /** Rotation matrix by angle t about the unit axis u (Rodrigues). */
    function axisRot([x, y, z], t) {
        const c = Math.cos(t), s = Math.sin(t), C = 1 - c;
        return [
            [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
            [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
            [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
        ];
    }

    // ── counting (Jacobi) ──────────────────────────────────────────
    function allNorm(n) {
        const out = [], r = Math.floor(Math.sqrt(n));
        for (let a = -r; a <= r; a++)
            for (let b = -r; b <= r; b++)
                for (let c = -r; c <= r; c++) {
                    const d2 = n - a * a - b * b - c * c;
                    if (d2 < 0) continue;
                    const d = Math.round(Math.sqrt(d2));
                    if (d * d !== d2) continue;
                    out.push([a, b, c, d]);
                    if (d) out.push([a, b, c, -d]);
                }
        return out;
    }
    /** Jacobi's four-square formula r₄(n) = 8 Σ_{d | n, 4 ∤ d} d. */
    function jacobi4(n) {
        let s = 0;
        for (let d = 1; d <= n; d++) if (n % d === 0 && d % 4) s += d;
        return 8 * s;
    }
    /** Jacobi's two-square formula r₂(n) = 4 Σ_{d | n} χ₋₄(d). */
    function jacobi2(n) {
        let s = 0;
        for (let d = 1; d <= n; d += 2) if (n % d === 0) s += d % 4 === 1 ? 1 : -1;
        return 4 * s;
    }
    function r2(n) {
        let c = 0;
        const r = Math.floor(Math.sqrt(n));
        for (let a = -r; a <= r; a++) {
            const b2 = n - a * a, b = Math.round(Math.sqrt(b2));
            if (b * b === b2) c += b ? 2 : 1;
        }
        return c;
    }

    // ── primes of norm p, normalized ────────────────────────────────
    const A_CACHE = new Map();
    function A(p) {
        if (A_CACHE.has(p)) return A_CACHE.get(p);
        const odd = (v) => Math.abs(v) % 2 === 1;
        const set = allNorm(p).filter(([a, b, c, d]) => a > 0 && (p % 4 === 1
            ? odd(a) && !odd(b) && !odd(c) && !odd(d)
            : odd(a) && odd(b) && odd(c) && !odd(d)));
        // a pleasant order: by real part, then lexicographically, inverse pairs adjacent
        set.sort((x, y) => (x[0] - y[0]) || (Math.abs(y[1]) - Math.abs(x[1])) || (Math.abs(y[2]) - Math.abs(x[2])) ||
            (Math.abs(y[3]) - Math.abs(x[3])) || (y[1] - x[1]) || (y[2] - x[2]) || (y[3] - x[3]));
        const ordered = [];
        for (const q of set) {
            if (ordered.some((r) => eq(r, q))) continue;
            ordered.push(q);
            const inv = conj(q);
            if (!eq(inv, q) && set.some((r) => eq(r, inv))) ordered.push(inv);
        }
        A_CACHE.set(p, ordered);
        return ordered;
    }
    /** Index of x in the normalized set S, up to sign; −1 if absent. */
    const indexIn = (S, x) => S.findIndex((a) => eqpm(a, x));

    // ── metacommutation ────────────────────────────────────────────
    /** πσ = sign · σ'π' with σ' ∈ A_{N(σ)}, π' ∈ A_{N(π)} (Hurwitz's theorem). */
    function metacommute(pi, sg) {
        const p = norm(pi), q = norm(sg), x = mul(pi, sg);
        for (const s2 of A(q)) {
            const y = mul(conj(s2), x);
            if (!y.every((v) => v % q === 0)) continue;
            const p2 = y.map((v) => v / q);
            const i = indexIn(A(p), p2);
            if (i < 0) continue;
            const pn = A(p)[i];
            return { s2, p2: pn, sign: eq(p2, pn) ? 1 : -1, product: x };
        }
        return null;
    }
    /** The permutation of A_p induced by metacommuting past σ, with its cycle type and sign. */
    function metaPerm(p, sg) {
        const Ap = A(p);
        const perm = Ap.map((pi) => indexIn(Ap, metacommute(pi, sg).p2));
        const seen = perm.map(() => false), cycles = [];
        let sign = 1;
        for (let i = 0; i < perm.length; i++) {
            if (seen[i]) continue;
            let len = 0, j = i;
            while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
            cycles.push(len);
            if (len % 2 === 0) sign = -sign;
        }
        return { perm, cycles: cycles.sort((a, b) => b - a), sign };
    }
    function legendre(a, p) {
        a = ((a % p) + p) % p;
        if (a === 0) return 0;
        let r = 1, e = (p - 1) / 2, x = a;
        while (e) { if (e & 1) r = (r * x) % p; x = (x * x) % p; e >>= 1; }
        return r === 1 ? 1 : -1;
    }

    // ── trees ──────────────────────────────────────────────────────
    /**
     * The ball of radius `depth` in the Cayley tree of ⟨A⟩ (A symmetric, free):
     * nodes {q, gen, parent, depth, word} for the reduced words g·a (right multiplication).
     */
    function tree(Ap, depth) {
        const inv = Ap.map((a) => indexIn(Ap, conj(a)));
        const nodes = [{ q: [1, 0, 0, 0], gen: -1, parent: -1, depth: 0, word: [] }];
        let frontier = [0];
        for (let L = 1; L <= depth; L++) {
            const next = [];
            for (const i of frontier) {
                const n = nodes[i];
                Ap.forEach((a, g) => {
                    if (n.gen >= 0 && g === inv[n.gen]) return;   // no backtracking
                    nodes.push({ q: mul(n.q, a), gen: g, parent: i, depth: L, word: n.word.concat(g) });
                    next.push(nodes.length - 1);
                });
            }
            frontier = next;
        }
        return { nodes, inv };
    }

    // ── part 3: the local picture at an odd prime p ─────────────────
    /** The exponent of p in n (∞ for n = 0). */
    function vp(n, p) {
        n = Math.abs(n);
        if (!n) return Infinity;
        let e = 0;
        while (n % p === 0) { n /= p; e++; }
        return e;
    }
    function squarefree(n) {
        n = Math.abs(n);
        let r = 1;
        for (let d = 2; d * d <= n; d++) {
            let e = 0;
            while (n % d === 0) { n /= d; e++; }
            if (e % 2) r *= d;
        }
        return r * n;
    }
    /**
     * The axis of R_q and its field: q = a + v with v = bi + cj + dk; the
     * rotations about v are the norm-one elements of K = ℚ(√−|v|²).
     */
    function axisField(q) {
        const n = q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
        const sf = n ? squarefree(n) : 0;
        return { n, sf, torsion: sf === 1 ? 4 : sf === 3 ? 6 : 2 };
    }
    /** Does p split in K = ℚ(√−sf)?  (p odd) */
    const splits = (sf, p) => sf % p !== 0 && legendre(-sf, p) === 1;
    /**
     * How R_q acts on the tree T_{p+1} (p odd).  With q primitive, a = Re q:
     *   hyperbolic, translation length ℓ = v_p(N q) − 2 v_p(a), if ℓ > 0;
     *   otherwise elliptic, fixing a line if p splits in K (a 'line'), and a
     *   bounded set if not ('bounded'; an edge midpoint when v_p(N q) is odd).
     * d = v_p(N q) is the distance from o to R_q·o: the power of p in the denominator.
     * Never parabolic: the discriminant (2a)² − 4N = −4|v|² is never 0.
     */
    function localType(q, p) {
        q = projective(q);
        const { n, sf } = axisField(q);
        const d = vp(norm(q), p);
        if (!n) return { type: 'id', d: 0 };
        const ell = d - 2 * vp(q[0], p);
        if (ell > 0) return { type: 'hyp', ell, d };
        return { type: splits(sf, p) ? 'line' : 'bounded', d, inversion: d % 2 === 1 };
    }

    /**
     * Exact arithmetic with BigInt, for the tree pictures (powers such as
     * (3 + 2j)^100 overflow doubles).  pWord(q, p): the reduced A_p-word of
     * the p-part of q — the vertex q·o of T_{p+1} (Hurwitz: the normalized
     * left divisor of norm p is unique, so the letters are forced).
     */
    const big = (() => {
        const B = BigInt;
        const from = (q) => q.map((v) => B(v));
        const mulB = ([a1, b1, c1, d1], [a2, b2, c2, d2]) => [
            a1 * a2 - b1 * b2 - c1 * c2 - d1 * d2,
            a1 * b2 + b1 * a2 + c1 * d2 - d1 * c2,
            a1 * c2 - b1 * d2 + c1 * a2 + d1 * b2,
            a1 * d2 + b1 * c2 - c1 * b2 + d1 * a2,
        ];
        const conjB = ([a, b, c, d]) => [a, -b, -c, -d];
        const normB = ([a, b, c, d]) => a * a + b * b + c * c + d * d;
        const absB = (x) => (x < 0n ? -x : x);
        const gcdB = (a, b) => { a = absB(a); b = absB(b); while (b) [a, b] = [b, a % b]; return a; };
        const prim = (q) => { let g = 0n; for (const v of q) g = gcdB(g, v); return g > 1n ? q.map((v) => v / g) : q; };
        const AB = new Map();
        const Ab = (p) => { if (!AB.has(p)) AB.set(p, A(p).map(from)); return AB.get(p); };
        function pWord(q, p, maxLen = Infinity) {
            const P = B(p), Ap = Ab(p), word = [];
            let x = prim(q);
            while (normB(x) % P === 0n && word.length < maxLen) {
                let hit = -1;
                for (let i = 0; i < Ap.length && hit < 0; i++) {
                    const y = mulB(conjB(Ap[i]), x);
                    if (y[0] % P === 0n && y[1] % P === 0n && y[2] % P === 0n && y[3] % P === 0n) { hit = i; x = y.map((v) => v / P); }
                }
                if (hit < 0) throw new Error('pWord: no left divisor');
                word.push(hit);
            }
            return word;
        }
        function pow(q, n) {
            let r = [1n, 0n, 0n, 0n], b = q;
            while (n > 0) { if (n & 1) r = prim(mulB(r, b)); b = prim(mulB(b, b)); n >>= 1; }
            return r;
        }
        return { from, mul: mulB, conj: conjB, norm: normB, prim, pWord, pow };
    })();

    // ── formatting ─────────────────────────────────────────────────
    const UNITS = ['', 'i', 'j', 'k'];
    function terms(q) {
        const out = [];
        q.forEach((v, t) => {
            if (!v) return;
            const mag = Math.abs(v);
            out.push({ neg: v < 0, body: t === 0 ? String(mag) : (mag === 1 ? '' : String(mag)) + UNITS[t] });
        });
        return out;
    }
    /** "1 + 2i − j" (Unicode minus). */
    function str(q, spaced = false) {
        const ts = terms(q);
        if (!ts.length) return '0';
        const sp = spaced ? ' ' : '';
        return ts.map((t, i) => (i === 0 ? (t.neg ? '−' : '') : sp + (t.neg ? '−' : '+') + sp) + t.body).join('');
    }
    /** TeX form. */
    function tex(q) {
        const ts = terms(q);
        if (!ts.length) return '0';
        return ts.map((t, i) => (i === 0 ? (t.neg ? '-' : '') : (t.neg ? '-' : '+')) + t.body).join('');
    }
    /** HTML with italic units. */
    function html(q) {
        return str(q, true).replace(/([ijk])/g, '<i>$1</i>');
    }
    const minus = (s) => String(s).replace(/-/g, '−');

    const Quat = {
        mul, conj, neg, norm, eq, eqpm, prod, gcd, isPrime, factor, oddPart, projective, pkey,
        rotNumerators, rot, rotFloat, apply, matMul, axisAngle, axisRot,
        allNorm, jacobi4, jacobi2, r2, A, indexIn, metacommute, metaPerm, legendre, tree,
        vp, squarefree, axisField, splits, localType, big,
        str, tex, html, minus,
    };
    root.Quat = Quat;
    if (typeof module !== 'undefined' && module.exports) module.exports = Quat;
})(typeof window !== 'undefined' ? window : globalThis);
