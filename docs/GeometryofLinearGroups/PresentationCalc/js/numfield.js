/**
 * numfield.js — exact arithmetic in a number field F = ℚ(w) = ℚ[x]/(f), f monic in ℤ[x] (ℚ itself is
 * f = x), with the complex embeddings for display and for floating-point hints, valuations at
 * primes (exact: factoring over ℚ, ringEngine.js's maximal order and primes above p otherwise), and
 * the lattice of multiplicative relations among nonzero elements.
 *
 * Elements are { n: BigInt[d], q: BigInt } = (n₀ + n₁w + … ) / q with q > 0 and gcd 1.
 *
 * multRelations(F, xs): the lattice L = { e ∈ ℤ^k : ∏ xᵢ^{eᵢ} = 1 }, exactly. The valuation
 * vectors give L_v = { e : ∏ xᵢ^{eᵢ} is a unit } (exact). Among the units, relations modulo roots of
 * unity are found by LLL on the logarithmic embedding and each is checked exactly; they span a
 * lattice whose saturation is L_μ = { e : ∏ xᵢ^{eᵢ} is a root of unity } (F^×/μ_F is torsion-free),
 * provided the other units are independent, which the LLL output shows numerically (a gap of many
 * orders of magnitude, reported as unitGap). Then L is the kernel of L_μ → μ_F (exact). Over ℚ and
 * imaginary quadratic fields the unit group is finite, and everything is exact.
 */
import { field, parsePoly } from './cusps.js';
import { babs, bgcd, blcm, egcd, hnf, leftKernel, saturate, intRelations } from './intlin.js';

// ───────────────────────── integers ─────────────────────────

function modPow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
export function isProbablePrime(n) {
    n = babs(n);
    if (n < 2n) return false;
    for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
    let d = n - 1n, s = 0;
    while (!(d & 1n)) { d >>= 1n; s++; }
    for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        let ok = false;
        for (let r = 1; r < s; r++) { x = x * x % n; if (x === n - 1n) { ok = true; break; } }
        if (!ok) return false;
    }
    return true;
}
function rho(n) {
    if (n % 2n === 0n) return 2n;
    for (let c = 1n; c < 200n; c++) {
        let x = 2n, y = 2n, d = 1n, it = 0;
        const f = (v) => (v * v + c) % n;
        while (d === 1n && it++ < 2000000) { x = f(x); y = f(f(y)); d = bgcd(x > y ? x - y : y - x, n); }
        if (d !== 1n && d !== n) return d;
    }
    return null;
}
/** The prime factorization of a nonzero BigInt: Map p → e (throws when it cannot finish). */
export function factorInt(n) {
    n = babs(n);
    const out = new Map();
    const add = (p, e = 1) => out.set(p, (out.get(p) || 0) + e);
    for (let p = 2n; p < 10000n && p * p <= n; p += p === 2n ? 1n : 2n) while (n % p === 0n) { add(p); n /= p; }
    const stack = n > 1n ? [n] : [];
    while (stack.length) {
        const m = stack.pop();
        if (m === 1n) continue;
        if (isProbablePrime(m)) { add(m); continue; }
        const d = rho(m);
        if (!d) throw new Error(`could not factor ${m}`);
        stack.push(d, m / d);
    }
    return out;
}
export const vpInt = (x, p) => { let v = 0; x = babs(x); if (!x) return Infinity; while (x % p === 0n) { x /= p; v++; } return v; };

// ───────────────────────── complex numbers, roots ─────────────────────────

const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im), csub = (a, b) => C(a.re - b.re, a.im - b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
export const cabs = (a) => Math.hypot(a.re, a.im);

/** The complex roots of a monic polynomial (Number coefficients, low → high), by Aberth's method. */
function polyRoots(coef) {
    const n = coef.length - 1;
    if (n === 1) return [C(-coef[0])];
    const ev = (z) => { let v = C(0), dv = C(0); for (let i = n; i >= 0; i--) { dv = cadd(cmul(dv, z), v); v = cadd(cmul(v, z), C(coef[i])); } return { v, dv }; };
    const R = 1 + Math.max(...coef.slice(0, n).map(Math.abs));
    let z = Array.from({ length: n }, (_, k) => C(0.5 * R * Math.cos(2 * Math.PI * k / n + 0.4), 0.5 * R * Math.sin(2 * Math.PI * k / n + 0.4)));
    for (let it = 0; it < 500; it++) {
        let moved = 0;
        z = z.map((zk, k) => {
            const { v, dv } = ev(zk);
            if (cabs(v) === 0) return zk;
            const ratio = cdiv(v, dv);
            let s = C(0);
            z.forEach((zj, j) => { if (j !== k) s = cadd(s, cdiv(C(1), csub(zk, zj))); });
            const w = cdiv(ratio, csub(C(1), cmul(ratio, s)));
            moved = Math.max(moved, cabs(w) / Math.max(1, cabs(zk)));
            return csub(zk, w);
        });
        if (moved < 1e-15) break;
    }
    // a few Newton steps each, and exact conjugate pairs for real polynomials
    z = z.map((zk) => { for (let i = 0; i < 3; i++) { const { v, dv } = ev(zk); if (cabs(dv)) zk = csub(zk, cdiv(v, dv)); } return zk; });
    return z.map((r) => (Math.abs(r.im) < 1e-12 * Math.max(1, cabs(r)) ? C(r.re) : r));
}

// ───────────────────────── the field ─────────────────────────

/**
 * F = ℚ[x]/(poly): poly BigInt[] low → high, monic. root (optional): the embedding to list first.
 */
export function numberField(polyIn, root = null) {
    const poly = polyIn.map(BigInt);
    const d = poly.length - 1;
    if (poly[d] !== 1n) throw new Error('the field polynomial must be monic');
    const Z = field(poly);
    const norm = (n, q) => {
        if (q < 0n) { n = n.map((x) => -x); q = -q; }
        const g = n.reduce((s, x) => bgcd(s, x), q);
        return g > 1n ? { n: n.map((x) => x / g), q: q / g } : { n, q };
    };
    const el = (n, q = 1n) => norm(n.map(BigInt), BigInt(q));
    const rat = (a, b = 1n) => el(Array.from({ length: d }, (_, i) => (i === 0 ? BigInt(a) : 0n)), BigInt(b));
    const zero = rat(0n), one = rat(1n);
    const isZero = (x) => x.n.every((c) => c === 0n);
    const add = (x, y) => norm(x.n.map((c, i) => c * y.q + y.n[i] * x.q), x.q * y.q);
    const neg = (x) => ({ n: x.n.map((c) => -c), q: x.q });
    const sub = (x, y) => add(x, neg(y));
    const mul = (x, y) => norm(Z.mul(x.n, y.n), x.q * y.q);
    const inv = (x) => {
        if (isZero(x)) throw new Error('division by zero');
        if (d === 1) return norm([x.q], x.n[0]);
        const r = Z.divide(Z.one, x.n);                 // 1 / x.n
        return norm(r.num.map((c) => c * x.q), r.den);
    };
    const div = (x, y) => mul(x, inv(y));
    const eq = (x, y) => x.q === y.q && x.n.every((c, i) => c === y.n[i]);
    const isRat = (x) => x.n.every((c, i) => i === 0 || c === 0n);
    const pow = (x, e) => {
        e = BigInt(e);
        if (e < 0n) { x = inv(x); e = -e; }
        let r = one, b = x;
        while (e > 0n) { if (e & 1n) r = mul(r, b); e >>= 1n; if (e) b = mul(b, b); }
        return r;
    };
    const fromSrc = (s) => { const p = parsePoly(s, d); if (!p) throw new Error(`could not read the entry ${s}`); return norm(p.num, p.den); };
    const key = (x) => `${x.n.join(',')}/${x.q}`;
    // embeddings
    const roots = d === 1 ? [C(-Number(poly[0]))] : polyRoots(poly.map(Number));
    if (root && d > 1) {
        let bi = 0, bd = Infinity;
        roots.forEach((r, i) => { const dd = Math.hypot(r.re - root.re, r.im - root.im); if (dd < bd) { bd = dd; bi = i; } });
        roots.unshift(...roots.splice(bi, 1));
    }
    const emb = (x, j = 0) => {
        const z = roots[j];
        let v = C(0);
        for (let i = d - 1; i >= 0; i--) v = cadd(cmul(v, z), C(Number(x.n[i])));
        return C(v.re / Number(x.q), v.im / Number(x.q));
    };
    // archimedean places: real roots, and one of each conjugate pair
    const places = [];
    roots.forEach((r, j) => {
        if (r.im === 0) places.push({ j, real: true });
        else if (!places.some((p) => !p.real && Math.abs(roots[p.j].re - r.re) < 1e-9 && Math.abs(roots[p.j].im + r.im) < 1e-9)) places.push({ j, real: false });
    });
    const r1 = places.filter((p) => p.real).length, r2 = places.length - r1;
    // N(x) ∈ ℚ: the determinant of multiplication by x.n, over x.q^d
    const normOf = (x) => {
        if (d === 1) return { n: x.n[0], q: x.q };
        const cols = []; let y = x.n;
        for (let j = 0; j < d; j++) { cols.push(y); y = Z.mul(y, Z.w); }
        return { n: detInt(Array.from({ length: d }, (_, r) => cols.map((c) => c[r]))), q: x.q ** BigInt(d) };
    };
    const F = { d, poly, el, rat, zero, one, isZero, add, neg, sub, mul, inv, div, eq, isRat, pow, fromSrc, key, roots, emb, places, r1, r2, normOf };
    F.unitRank = r1 + r2 - 1;
    F.tex = (x, w = 'w') => elementTex(F, x, w);
    F.text = (x, w = 'w') => elementText(F, x, w);
    F.valuations = makeValuations(F);
    return F;
}

function detInt(A) {
    // Bareiss
    const n = A.length;
    const M = A.map((r) => r.slice());
    let prev = 1n, sign = 1n;
    for (let k = 0; k < n; k++) {
        let p = k; while (p < n && M[p][k] === 0n) p++;
        if (p === n) return 0n;
        if (p !== k) { [M[k], M[p]] = [M[p], M[k]]; sign = -sign; }
        for (let i = k + 1; i < n; i++) {
            for (let j = k + 1; j < n; j++) M[i][j] = (M[i][j] * M[k][k] - M[i][k] * M[k][j]) / prev;
            M[i][k] = 0n;
        }
        prev = M[k][k];
    }
    return sign * M[n - 1][n - 1];
}

/**
 * valuations(x): Map from a prime's key to v_𝔭(x) ≠ 0, plus prime(key) → { p, tex } for display.
 * Over ℚ by factoring; otherwise ringEngine.js (globalThis.NumberRingEngine) must be loaded.
 */
function makeValuations(F) {
    const primes = new Map();
    if (F.d === 1) {
        const f = (x) => {
            const out = new Map();
            for (const [p, e] of factorInt(x.n[0])) { out.set(`${p}`, e); primes.set(`${p}`, { p, tex: `${p}` }); }
            for (const [p, e] of factorInt(x.q)) { out.set(`${p}`, (out.get(`${p}`) || 0) - e); primes.set(`${p}`, { p, tex: `${p}` }); }
            return out;
        };
        f.prime = (k) => primes.get(k);
        return f;
    }
    let ring = null;
    const above = new Map();
    const f = (x) => {
        const RE = globalThis.NumberRingEngine;
        if (!RE || !RE._internal) throw new Error('valuations over a number field need ringEngine.js');
        const X = RE._internal;
        if (!ring) ring = X.maximalOrderFor(F.poly);
        const sv = X.toSV(ring.O.toCoords(x.n.map((c) => new X.Rat(c, x.q))));
        const N = F.normOf(x);
        const ps = new Set([...factorInt(N.n).keys(), ...factorInt(N.q).keys(), ...factorInt(x.q).keys()]);
        const out = new Map();
        for (const p of ps) {
            if (!above.has(p)) above.set(p, X.primesAbove(ring.O, p));
            above.get(p).forEach((pr, i) => {
                const v = X.valuationSV(ring.O, pr, sv);
                const key = `${p}#${i}`;
                if (!primes.has(key)) primes.set(key, { p, i, e: pr.e, f: pr.f, count: above.get(p).length, tex: above.get(p).length === 1 ? `${p}` : `\\mathfrak{p}_{${p}${i ? `,${i + 1}` : ''}}` });
                if (v) out.set(key, v);
            });
        }
        return out;
    };
    f.prime = (k) => primes.get(k);
    return f;
}

// ───────────────────────── TeX ─────────────────────────

export function ratTex(n, q, { frac = true } = {}) {
    if (q === 1n) return `${n}`;
    const s = n < 0n ? '-' : '';
    return frac ? `${s}\\tfrac{${babs(n)}}{${q}}` : `${s}${babs(n)}/${q}`;
}
function elementTex(F, x, w) {
    if (F.d === 1 || F.isRat(x)) return ratTex(x.n[0], x.q);
    const terms = [];
    for (let i = F.d - 1; i >= 0; i--) {
        const c = x.n[i];
        if (!c) continue;
        const g = bgcd(c, x.q), num = babs(c) / g, den = x.q / g;
        const mono = i === 0 ? '' : i === 1 ? w : `${w}^{${i}}`;
        let coef = den === 1n ? (num === 1n && mono ? '' : `${num}`) : `\\tfrac{${num}}{${den}}`;
        terms.push({ neg: c < 0n, s: `${coef}${mono}` });
    }
    return terms.map((t, k) => (k === 0 ? (t.neg ? '-' : '') : t.neg ? ' - ' : ' + ') + t.s).join('');
}
function elementText(F, x, w) {
    if (F.d === 1 || F.isRat(x)) return ratTex(x.n[0], x.q, { frac: false });
    return elementTex(F, x, w).replace(/\\tfrac\{(\d+)\}\{(\d+)\}/g, '$1/$2').replace(/\^\{(\d+)\}/g, '^$1');
}

// ───────────────────────── roots of unity ─────────────────────────

/** The order of x as a root of unity, or 0 when it is not one (exact). */
export function rootOrder(F, x) {
    if (F.isZero(x)) return 0;
    for (let j = 0; j < F.roots.length; j++) if (Math.abs(cabs(F.emb(x, j)) - 1) > 1e-6) return 0;
    if (F.isRat(x)) return x.q === 1n && x.n[0] === 1n ? 1 : x.q === 1n && x.n[0] === -1n ? 2 : 0;
    const bound = 2 * F.d * F.d + 2;
    let y = x;
    for (let n = 1; n <= bound; n++) {
        if (F.eq(y, F.one)) return n;
        y = F.mul(y, x);
    }
    return 0;
}
const ord = (n, p) => { let v = 0; while (n % p === 0) { n /= p; v++; } return v; };
const smallPrimes = (n) => { const out = []; for (let p = 2; p <= n; p++) if (n % p === 0 && out.every((q) => p % q)) out.push(p); return out; };
/** A generator of the cyclic group generated by roots of unity ωᵢ (with their orders). */
export function cyclicGenerator(F, items) {
    let g = F.one, a = 1;
    for (const { x, order: b } of items) {
        if (a % b === 0) continue;
        let ga = 1, hb = 1;
        for (const p of smallPrimes(a * b)) {
            const va = ord(a, p), vb = ord(b, p);
            if (va >= vb) ga *= p ** va; else hb *= p ** vb;
        }
        g = F.mul(F.pow(g, a / ga), F.pow(x, b / hb));
        a = ga * hb;
    }
    return { zeta: g, order: a };
}

// ───────────────────────── multiplicative relations ─────────────────────────

const prodPow = (F, xs, e) => e.reduce((acc, c, i) => (c ? F.mul(acc, F.pow(xs[i], c)) : acc), F.one);

/**
 * L = { e ∈ ℤ^k : ∏ xᵢ^{eᵢ} = 1 } for nonzero xᵢ ∈ F. Returns { L: basis rows, torsion: m (the
 * order of the torsion of ⟨xᵢ⟩), zeta (a generator of it, as a field element), unitGap (null when
 * exact, else the margin of the numerical independence check) }.
 */
export function multRelations(F, xs) {
    const k = xs.length;
    if (!k) return { L: [], torsion: 1, zeta: F.one, unitGap: null };
    if (xs.some((x) => F.isZero(x))) throw new Error('a multiplier is zero');
    // valuations
    const vals = xs.map((x) => F.valuations(x));
    const keys = [...new Set(vals.flatMap((v) => [...v.keys()]))];
    const V = xs.map((_, i) => keys.map((key) => BigInt(vals[i].get(key) || 0)));
    let Lv = keys.length ? leftKernel(V) : Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1n : 0n)));
    // units modulo roots of unity
    let unitGap = null;
    let Lmu = Lv;
    if (Lv.length && F.unitRank > 0) {
        const logs = xs.map((x) => F.places.map(({ j }) => Math.log(cabs(F.emb(x, j)))));
        const vecs = Lv.map((b) => F.places.map((_, t) => b.reduce((s, c, i) => s + Number(c) * logs[i][t], 0)));
        const scale = Math.max(1, ...vecs.flat().map(Math.abs));
        const { relations, rest, minRest } = intRelations(vecs.map((v) => v.map((x) => x / scale)));
        const found = [];
        for (const c of relations) {
            const e = Array.from({ length: k }, (_, i) => Lv.reduce((s, b, t) => s + BigInt(c[t]) * b[i], 0n));
            if (!rootOrder(F, prodPow(F, xs, e))) throw new Error('a numerical relation among units failed the exact check');
            found.push(e);
        }
        if (found.length + rest !== Lv.length) throw new Error('the units could not be separated numerically');
        Lmu = saturate(found, k);
        unitGap = rest ? minRest * scale : null;
    }
    // the roots of unity ∏ x^b, b ∈ L_μ
    if (!Lmu.length) return { L: [], torsion: 1, zeta: F.one, unitGap };
    const omegas = Lmu.map((b) => {
        const x = prodPow(F, xs, b);
        const o = rootOrder(F, x);
        if (!o) throw new Error('internal: an element of L_μ is not a root of unity');
        return { x, order: o };
    });
    const { zeta, order: m } = cyclicGenerator(F, omegas);
    if (m === 1) return { L: hnf(Lmu).H.slice(0, Lmu.length), torsion: 1, zeta: F.one, unitGap };
    const logs = omegas.map(({ x }) => {
        let y = F.one;
        for (let a = 0; a < m; a++) { if (F.eq(y, x)) return BigInt(a); y = F.mul(y, zeta); }
        throw new Error('internal: a root of unity outside the cyclic group');
    });
    // y with Σ yⱼ logⱼ ≡ 0 (mod m)
    const Y = leftKernel(logs.map((a) => [a]).concat([[BigInt(m)]])).map((r) => r.slice(0, logs.length));
    const Lrows = hnf(Y.length ? Y : [logs.map(() => 0n)]).H.filter((r) => r.some((x) => x)).map((y) => Array.from({ length: k }, (_, i) => Lmu.reduce((s, b, t) => s + y[t] * b[i], 0n)));
    return { L: hnf(Lrows).H.filter((r) => r.some((x) => x)), torsion: m, zeta, unitGap };
}

export { blcm, egcd };
