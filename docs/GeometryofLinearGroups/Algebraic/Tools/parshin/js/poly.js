// Polynomials over ℚ as coefficient arrays by degree ([] is zero), with division and gcd.
import { Q, gcd } from './rational.js';

export const trim = (a) => { let n = a.length; while (n && a[n - 1].isZero()) n--; return n === a.length ? a : a.slice(0, n); };
export const padd = (a, b) => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || Q.ZERO).add(b[i] || Q.ZERO)));
export const pneg = (a) => a.map((x) => x.neg());
export const psub = (a, b) => padd(a, pneg(b));
export const pscale = (a, q) => trim(a.map((x) => x.mul(q)));
export function pmul(a, b) {
    if (!a.length || !b.length) return [];
    const c = new Array(a.length + b.length - 1).fill(Q.ZERO);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) c[i + j] = c[i + j].add(a[i].mul(b[j]));
    return trim(c);
}
export const monic = (a) => (a.length ? pscale(a, a[a.length - 1].inv()) : a);

// [quotient, remainder] of a by a nonzero b
export function pdivmod(a, b) {
    b = trim(b);
    if (!b.length) throw new Error('division by zero');
    const r = trim(a).slice(), db = b.length - 1, lb = b[db];
    if (r.length - 1 < db) return [[], r];
    const q = new Array(r.length - db).fill(Q.ZERO);
    for (let k = r.length - 1 - db; k >= 0; k--) {
        const c = r[k + db].div(lb);
        q[k] = c;
        if (!c.isZero()) for (let j = 0; j <= db; j++) r[k + j] = r[k + j].sub(c.mul(b[j]));
    }
    return [trim(q), trim(r)];
}
export function pgcd(a, b) {
    a = trim(a); b = trim(b);
    while (b.length) [a, b] = [b, pdivmod(a, b)[1]];
    return monic(a);
}
export const plcm = (a, b) => monic(pdivmod(pmul(a, b), pgcd(a, b))[0]);

// The same point of a projective space: divide the polynomials by their gcd, scale them to
// coprime integer coefficients, and make the first nonzero one have a positive leading coefficient.
export function primitive(P) {
    let G = null;
    for (const p of P) if (p.length) G = G ? pgcd(G, p) : monic(p);
    if (!G) return P;
    P = P.map((p) => (p.length ? pdivmod(p, G)[0] : p));
    let den = 1n, num = 0n;
    for (const p of P) for (const c of p) den = den / gcd(den, c.d) * c.d;
    P = P.map((p) => p.map((c) => c.mul(Q.of(den))));
    for (const p of P) for (const c of p) num = gcd(num, c.n);
    const lead = P.find((p) => p.length), s = lead[lead.length - 1].sign() < 0 ? -1n : 1n;
    return P.map((p) => p.map((c) => Q.of(s * c.n, num)));
}

// Entries {num, den} of a matrix over ℚ(t) → polynomial entries of the same element of PGL₂.
export function polyMatrix(rats) {
    let L = [Q.ONE];
    for (const r of rats) if (r.num.length) L = plcm(L, r.den);
    return primitive(rats.map((r) => (r.num.length ? pmul(r.num, pdivmod(L, r.den)[0]) : [])));
}
