/**
 * zfactor.js — factoring polynomials over ℚ.
 *
 * Zassenhaus: factor modulo a small prime (distinct- and equal-degree
 * factorisation), Hensel-lift the factors to p^k past the Mignotte-type
 * coefficient bound, then recombine. Ported from
 * Algebraic/Tools/numberRings/ringEngine.js.
 *
 * The field tower (tower.js) uses it to find the irreducible factor of a
 * polynomial that has a given complex number as a root.
 */

import { Frac } from './exact.js';

const F0 = new Frac(0n), F1 = new Frac(1n);

// ---------------- integers ----------------

const babs = (a) => (a < 0n ? -a : a);
function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
const bmod = (a, m) => { const r = a % m; return r < 0n ? r + m : r; };
function egcd(a, b) {
    let r0 = a, r1 = b, s0 = 1n, s1 = 0n;
    while (r1 !== 0n) {
        const q = r0 / r1;
        [r0, r1] = [r1, r0 - q * r1];
        [s0, s1] = [s1, s0 - q * s1];
    }
    return [r0, s0];
}
function modInv(a, m) {
    const [g, x] = egcd(bmod(a, m), m);
    if (g !== 1n) throw new Error('internal: non-invertible residue');
    return bmod(x, m);
}
function isqrt(n) {
    if (n < 2n) return n;
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
const pw = (p, k) => p ** BigInt(k);

const SMALL_PRIMES = (() => {
    const lim = 3000, sieve = new Uint8Array(lim + 1), ps = [];
    for (let i = 2; i <= lim; i++) if (!sieve[i]) { ps.push(i); for (let j = i * i; j <= lim; j += i) sieve[j] = 1; }
    return ps;
})();

function makeRng(seed = 0x9e3779b9) {
    let s = seed >>> 0;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
    return {
        mod: (p) => { let x = 0n; const bits = p.toString(2).length + 16; for (let b = 0; b < bits; b += 32) x = (x << 32n) | BigInt(next()); return x % p; },
    };
}

// ---------------- polynomials over F_p (BigInt[], low → high) ----------------

function fpTrim(a) { let k = a.length; while (k > 0 && a[k - 1] === 0n) k--; return k === a.length ? a : a.slice(0, k); }
const fpNorm = (a, p) => fpTrim(a.map((x) => bmod(x, p)));
function fpAdd(a, b, p) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(bmod((a[i] || 0n) + (b[i] || 0n), p)); return fpTrim(r); }
function fpSub(a, b, p) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r.push(bmod((a[i] || 0n) - (b[i] || 0n), p)); return fpTrim(r); }
function fpMul(a, b, p) {
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(0n);
    for (let i = 0; i < a.length; i++) { if (!a[i]) continue; for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; }
    return fpNorm(r, p);
}
function fpDivmod(a, b, p) {
    const db = b.length - 1, inv = modInv(b[db], p);
    let r = a.slice();
    const q = new Array(Math.max(0, r.length - db)).fill(0n);
    while (r.length && r.length - 1 >= db) {
        const k = r.length - 1 - db, c = r[r.length - 1] * inv % p;
        q[k] = c;
        for (let i = 0; i <= db; i++) r[i + k] = bmod(r[i + k] - c * b[i], p);
        r = fpTrim(r);
    }
    return [fpTrim(q), r];
}
const fpMonic = (a, p) => { if (!a.length) return a; const inv = modInv(a[a.length - 1], p); return a.map((x) => x * inv % p); };
function fpGcd(a, b, p) { while (b.length) [a, b] = [b, fpDivmod(a, b, p)[1]]; return fpMonic(a, p); }
function fpXgcd(a, b, p) { // s a + t b = g (monic)
    let [r0, r1, s0, s1, t0, t1] = [a, b, [1n], [], [], [1n]];
    while (r1.length) {
        const [q, r] = fpDivmod(r0, r1, p);
        [r0, r1] = [r1, r];
        [s0, s1] = [s1, fpSub(s0, fpMul(q, s1, p), p)];
        [t0, t1] = [t1, fpSub(t0, fpMul(q, t1, p), p)];
    }
    const c = modInv(r0[r0.length - 1], p);
    const sc = (x) => fpNorm(x.map((y) => y * c), p);
    return [sc(r0), sc(s0), sc(t0)];
}
const fpRem = (a, m, p) => fpDivmod(a, m, p)[1];
function fpPowMod(base, e, m, p) {
    let r = fpRem([1n], m, p), b = fpRem(base, m, p);
    while (e > 0n) { if (e & 1n) r = fpRem(fpMul(r, b, p), m, p); b = fpRem(fpMul(b, b, p), m, p); e >>= 1n; }
    return r;
}
const fpDeriv = (a, p) => fpNorm(a.slice(1).map((c, i) => c * BigInt(i + 1)), p);

/** Distinct-degree factorisation of a monic squarefree f: [[product, degree], …]. */
function fpDDF(f, p) {
    const res = [], X = [0n, 1n];
    let rem = f, h = X, d = 0;
    while (rem.length - 1 >= 2 * (d + 1)) {
        d++;
        h = fpPowMod(h, p, rem, p);
        const g = fpGcd(rem, fpSub(h, X, p), p);
        if (g.length > 1) { res.push([g, d]); rem = fpDivmod(rem, g, p)[0]; h = fpRem(h, rem, p); }
    }
    if (rem.length > 1) res.push([rem, rem.length - 1]);
    return res;
}
/** Equal-degree splitting (Cantor–Zassenhaus; trace map in characteristic 2). */
function fpEDF(g, d, p, rng) {
    const n = g.length - 1;
    if (n === d) return [g];
    for (let tries = 0; tries < 400; tries++) {
        const a = fpTrim(Array.from({ length: n }, () => rng.mod(p)));
        if (a.length < 2) continue;
        let b;
        if (p === 2n) { b = a; let t = a; for (let i = 1; i < d; i++) { t = fpRem(fpMul(t, t, p), g, p); b = fpAdd(b, t, p); } }
        else b = fpSub(fpPowMod(a, (pw(p, d) - 1n) / 2n, g, p), [1n], p);
        const h = fpGcd(g, b, p);
        if (h.length > 1 && h.length < g.length) return fpEDF(h, d, p, rng).concat(fpEDF(fpDivmod(g, h, p)[0], d, p, rng));
    }
    throw new Error('internal: equal-degree factorisation failed');
}
function fpFactorSquarefree(f, p, rng) {
    const out = [];
    for (const [g, d] of fpDDF(fpMonic(f, p), p)) out.push(...fpEDF(g, d, p, rng));
    return out;
}

// ---------------- factoring over Z (Zassenhaus) ----------------

const zTrim = (a) => { let k = a.length; while (k > 0 && a[k - 1] === 0n) k--; return a.slice(0, k); };
function zMul(a, b) { const r = new Array(a.length + b.length - 1).fill(0n); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; return zTrim(r); }
const zContent = (a) => a.reduce((g, x) => bgcd(g, x), 0n);
function zPrimitive(a) { const c = zContent(a); let r = a.map((x) => x / c); if (r[r.length - 1] < 0n) r = r.map((x) => -x); return r; }
const zEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const symmetric = (a, m) => a.map((x) => { x = bmod(x, m); return x > m / 2n ? x - m : x; });
const zPolyMulMod = (a, b, m) => zMul(a, b).map((x) => bmod(x, m));

function henselLift(F, facs, p, k) { // F ≡ lc · ∏ facs (mod p), facs monic → lifts mod p^k
    const pk = pw(p, k);
    if (facs.length === 1) { const inv = modInv(F[F.length - 1], pk); return [F.map((x) => bmod(x * inv, pk))]; }
    const g0 = facs[0];
    let h0 = [bmod(F[F.length - 1], p)];
    for (let i = 1; i < facs.length; i++) h0 = fpMul(h0, facs[i], p);
    const [, s, t] = fpXgcd(g0, h0, p);
    let g = g0.slice(), h = h0.slice();
    for (let j = 1; j < k; j++) {
        const pj = pw(p, j);
        const diff = zTrim(zMul(g, h).map((x, i) => bmod((F[i] || 0n) - x, pw(p, j + 1))));
        const e = fpNorm(diff.map((x) => x / pj), p);
        const te = fpMul(t, e, p);
        const [q, dg] = fpDivmod(te, g0, p);
        const dh = fpAdd(fpMul(s, e, p), fpMul(q, h0, p), p);
        g = g.map((x, i) => x + pj * (dg[i] || 0n));
        h = Array.from({ length: Math.max(h.length, dh.length) }, (_, i) => (h[i] || 0n) + pj * (dh[i] || 0n));
    }
    return [g.map((x) => bmod(x, pk))].concat(henselLift(h.map((x) => bmod(x, pk)), facs.slice(1), p, k));
}
function* combinations(n, k, start = 0, acc = []) {
    if (acc.length === k) { yield acc.slice(); return; }
    for (let i = start; i < n; i++) { acc.push(i); yield* combinations(n, k, i + 1, acc); acc.pop(); }
}

/** Irreducible factors of a primitive squarefree F ∈ Z[x]. */
function zFactorSquarefree(F) {
    const n = F.length - 1;
    if (n <= 1) return [F];
    const rng = makeRng(12345), lc = F[n];
    let best = null, tried = 0;
    for (const sp of SMALL_PRIMES) {
        const p = BigInt(sp);
        if (lc % p === 0n) continue;
        const fp = fpMonic(fpNorm(F, p), p);
        if (fpGcd(fp, fpDeriv(fp, p), p).length > 1) continue;
        const facs = fpFactorSquarefree(fp, p, rng);
        if (facs.length === 1) return [F];
        if (!best || facs.length < best.facs.length) best = { p, facs };
        if (++tried >= 8) break;
    }
    if (!best) throw new Error('internal: no good prime for factoring');
    const { p, facs } = best;
    let norm2 = 0n; for (const c of F) norm2 += c * c;
    const bound = 2n * babs(lc) * pw(2n, n) * (isqrt(norm2) + 1n);
    let k = 1; while (pw(p, k) <= bound) k++;
    const pk = pw(p, k);
    let rest = henselLift(F, facs, p, k), f = F;
    const result = [];
    for (let s = 1; 2 * s <= rest.length;) {
        let found = false;
        for (const T of combinations(rest.length, s)) {
            const lcf = f[f.length - 1], inT = new Set(T);
            let G = [bmod(lcf, pk)], H = [bmod(lcf, pk)];
            rest.forEach((g, i) => { if (inT.has(i)) G = zPolyMulMod(G, g, pk); else H = zPolyMulMod(H, g, pk); });
            const Gp = zPrimitive(zTrim(symmetric(G, pk))), Hp = zPrimitive(zTrim(symmetric(H, pk)));
            const prod = zMul(Gp, Hp);
            if (zEq(prod, f) || zEq(prod.map((x) => -x), f)) {
                result.push(Gp); f = Hp; rest = rest.filter((_, i) => !inT.has(i)); found = true; break;
            }
        }
        if (!found) s++;
    }
    result.push(f);
    return result;
}

// ---------------- polynomials over Q (Frac[], low → high) ----------------

function qTrim(a) { let k = a.length; while (k > 0 && a[k - 1].isZero()) k--; return a.slice(0, k); }
function qDivmod(a, b) {
    const db = b.length - 1, lead = b[db];
    let r = a.slice();
    const q = new Array(Math.max(0, r.length - db)).fill(F0);
    while (r.length && r.length - 1 >= db) {
        const k = r.length - 1 - db, c = r[r.length - 1].div(lead);
        q[k] = c;
        for (let i = 0; i <= db; i++) r[i + k] = r[i + k].sub(c.mul(b[i]));
        r = qTrim(r);
    }
    return [qTrim(q), r];
}
const qMonic = (a) => { const l = a[a.length - 1]; return a.map((x) => x.div(l)); };
function qGcd(a, b) { a = qTrim(a); b = qTrim(b); while (b.length) [a, b] = [b, qDivmod(a, b)[1]]; return a.length ? qMonic(a) : a; }
const qDeriv = (a) => qTrim(a.slice(1).map((c, i) => c.mul(new Frac(BigInt(i + 1)))));

/** The squarefree part of f ∈ ℚ[x], monic. */
export function squarefreeQ(f) {
    f = qTrim(f);
    if (f.length <= 2) return f.length ? qMonic(f) : f;
    const g = qGcd(f, qDeriv(f));
    return qMonic(g.length > 1 ? qDivmod(f, g)[0] : f);
}

/** f ∈ ℚ[x] as a primitive integer polynomial. */
function toZ(f) {
    let den = 1n;
    for (const c of f) den = den / bgcd(den, c.q) * c.q;
    return zPrimitive(f.map((c) => c.p * (den / c.q)));
}

/**
 * True when f ∈ ℚ[x] is provably squarefree: it is squarefree modulo some
 * small prime not dividing its leading coefficient. False means probably not.
 */
export function isSquarefreeModP(f) {
    f = qTrim(f);
    if (f.length <= 2) return true;
    const F = toZ(f), lc = F[F.length - 1];
    let tried = 0;
    for (const sp of SMALL_PRIMES) {
        const p = BigInt(sp);
        if (lc % p === 0n) continue;
        const fp = fpMonic(fpNorm(F, p), p);
        if (fpGcd(fp, fpDeriv(fp, p), p).length === 1) return true;
        if (++tried >= 12) return false;
    }
    return false;
}

/**
 * The distinct monic irreducible factors over ℚ of f (Frac coefficients,
 * low → high, degree ≥ 1). Multiplicities are dropped; pass
 * { squarefree: true } to skip that step when f is known to be squarefree.
 */
export function factorQ(f, { squarefree = false } = {}) {
    f = squarefree ? qMonic(qTrim(f)) : squarefreeQ(f);
    if (f.length <= 2) return f.length === 2 ? [f] : [];
    return zFactorSquarefree(toZ(f)).map((g) => qMonic(g.map((x) => new Frac(x))));
}

export { F0, F1 };
