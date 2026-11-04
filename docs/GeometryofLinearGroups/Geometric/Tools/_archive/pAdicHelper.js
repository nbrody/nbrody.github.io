// pAdicHelper.js
// Utilities for working with p-adic numbers using BigInt and Hensel lifting
// This module focuses on elements of Z_p modulo p^N (i.e., p-adic integers at finite precision).
// We provide: exact modular arithmetic with BigInt, conversions of rationals with p ∤ denom,
// base‑p digit expansions, and a general Hensel lift for polynomial roots in Z_p.

// ======= BigInt helpers =======
const B0 = 0n, B1 = 1n, B2 = 2n;

function toBigInt(x) {
    if (typeof x === 'bigint') return x;
    if (typeof x === 'number') return BigInt(x);
    if (typeof x === 'string') return BigInt(x);
    throw new TypeError('Expected bigint|number|string convertible to BigInt');
}

function mod(a, m) {
    a = toBigInt(a); m = toBigInt(m);
    const r = a % m;
    return r >= 0n ? r : r + m;
}

function egcd(a, b) {
    // Extended GCD: returns [g, x, y] with ax+by=g
    a = toBigInt(a); b = toBigInt(b);
    let x = 1n, y = 0n, u = 0n, v = 1n;
    while (b) {
        const q = a / b;
        [a, b] = [b, a - q * b];
        [x, u] = [u, x - q * u];
        [y, v] = [v, y - q * v];
    }
    return [a, x, y];
}

function invMod(a, m) {
    // multiplicative inverse of a mod m, if gcd(a,m)=1
    a = mod(a, m);
    const [g, x] = egcd(a, m);
    if (g !== 1n && g !== -1n) throw new Error(`invMod: non-invertible (gcd=${g})`);
    return mod(x, m);
}

function powBigInt(base, exp) {
    base = toBigInt(base); exp = toBigInt(exp);
    let res = 1n, b = base, e = exp;
    while (e > 0n) {
        if (e & 1n) res *= b;
        b *= b; e >>= 1n;
    }
    return res;
}

// v_p(n): p-adic valuation of a nonzero integer n
function vpZ(n, p) {
    n = n < 0n ? -n : n; // absolute value
    if (n === 0n) return Infinity;
    let v = 0;
    const P = toBigInt(p);
    while (n % P === 0n) { n /= P; v++; }
    return v;
}

// ======= Polynomials over Z =======
// Represent a polynomial by an array of BigInts coeffs: c[0] + c[1] x + ... + c[d] x^d
function polyEval(coeffs, x, modM = null) {
    let acc = 0n;
    for (let i = coeffs.length - 1; i >= 0; i--) {
        acc = modM ? mod(acc * x, modM) : acc * x;
        const ci = toBigInt(coeffs[i]);
        acc = modM ? mod(acc + ci, modM) : acc + ci;
    }
    return acc;
}

function polyDeriv(coeffs) {
    if (coeffs.length <= 1) return [0n];
    const d = [];
    for (let i = 1; i < coeffs.length; i++) d.push(toBigInt(coeffs[i]) * BigInt(i));
    return d;
}

// ======= Hensel lifting =======
// Hensel lift a simple root a0 mod p to precision p^N for f ∈ Z[x] with f'(a0) ≠ 0 mod p.
// Returns a lifted root a modulo p^N (0 ≤ a < p^N), or throws if the simple-root condition fails.
function henselLiftSimpleRoot(coeffs, p, N, a0) {
    const P = toBigInt(p);
    const n = toBigInt(N);
    let k = 1n;
    let modPow = P; // current modulus = p^k
    while (powBigInt(P, k) < powBigInt(P, n)) k++;
    // Ensure we start at modulus p (k=1)
    k = 1n; modPow = P;

    // check base root mod p
    const fprime = polyDeriv(coeffs);
    a0 = mod(a0, P);
    const f_a0 = mod(polyEval(coeffs, a0, P), P);
    const fp_a0 = mod(polyEval(fprime, a0, P), P);
    if (f_a0 !== 0n) throw new Error('henselLift: a0 is not a root mod p');
    if (fp_a0 % P === 0n) throw new Error("henselLift: f'(a0) ≡ 0 (mod p), simple-root condition fails");

    let a = a0; // will lift
    let m = P;  // current modulus p^t
    while (m < powBigInt(P, n)) {
        // Solve f'(a) * delta ≡ -f(a) (mod m)
        const f_a = polyEval(coeffs, a, m);
        const fp_a = polyEval(fprime, a, m);
        // Reduce mod m first
        const rhs = mod(-f_a, m);
        // Need inverse of fp_a modulo m (must be unit: gcd=1)
        if (egcd(fp_a % m, m)[0] !== 1n) {
            // Try to bump modulus only by factor p and retry (rare); otherwise fail
            throw new Error("henselLift: derivative not invertible modulo current modulus");
        }
        const inv = invMod(fp_a, m);
        const delta = mod(inv * rhs, m);
        a = mod(a + delta, m);
        // increase modulus from m to m * p
        m = m * P;
        // Lift 'a' uniquely to the new modulus by keeping same integer representative
        a = a; // already canonical 0..m-1 on next loop iteration
    }
    return mod(a, powBigInt(P, n));
}

// Convenience: attempt to find a root mod p by brute force, then Hensel lift if simple
function henselLiftFromModP(coeffs, p, N) {
    const P = toBigInt(p);
    const modP = P;
    const fprime = polyDeriv(coeffs);
    for (let a = 0n; a < P; a++) {
        const f_a = mod(polyEval(coeffs, a, modP), modP);
        if (f_a === 0n) {
            const fp = mod(polyEval(fprime, a, modP), modP);
            if (fp !== 0n) {
                return henselLiftSimpleRoot(coeffs, p, N, a);
            }
        }
    }
    throw new Error('No simple root modulo p; either no root or repeated root.');
}

// ======= p-adic integers modulo p^N =======
export class PAdic {
    constructor(p, N, residue) {
        if (p < 2) throw new Error('Prime p must be ≥ 2');
        this.p = toBigInt(p);
        this.N = Number(N);
        this.modulus = powBigInt(this.p, BigInt(this.N));
        this.x = mod(residue ?? 0n, this.modulus); // canonical representative 0..p^N-1
    }

    static fromInteger(p, N, n) { return new PAdic(p, N, toBigInt(n)); }

    // Create from a rational a/b with p ∤ b
    static fromRational(p, N, a, b) {
        const P = toBigInt(p);
        const M = powBigInt(P, BigInt(N));
        a = toBigInt(a); b = toBigInt(b);
        if (b % P === 0n) throw new Error('Denominator divisible by p; not in Z_p.');
        const invb = invMod(mod(b, M), M);
        return new PAdic(p, N, mod(a, M) * invb % M);
    }

    clone() { return new PAdic(this.p, this.N, this.x); }

    add(other) {
        this._checkCompat(other);
        return new PAdic(this.p, this.N, mod(this.x + other.x, this.modulus));
    }
    neg() { return new PAdic(this.p, this.N, mod(-this.x, this.modulus)); }
    sub(other) { return this.add(other.neg()); }

    mul(other) {
        this._checkCompat(other);
        return new PAdic(this.p, this.N, (this.x * other.x) % this.modulus);
    }

    // Multiplicative inverse if x is a unit (v_p(x)=0)
    inv() {
        if (this.x % this.p === 0n) throw new Error('Non-unit: not invertible in Z/p^N Z');
        return new PAdic(this.p, this.N, invMod(this.x, this.modulus));
    }

    // Scalar multiply by integer/rational not divisible by p
    scaleByRational(a, b = 1n) {
        const r = PAdic.fromRational(this.p, this.N, a, b);
        return this.mul(r);
    }

    // Base‑p digits [d0, d1, ..., d_{N-1}] such that x ≡ Σ d_i p^i (mod p^N)
    digits() {
        const digs = [];
        let t = this.x;
        for (let i = 0; i < this.N; i++) {
            const di = t % this.p;
            digs.push(Number(di));
            t = (t - di) / this.p;
        }
        return digs; // least‑significant first
    }

    toString({ group = 4 } = {}) {
        // Pretty base‑p expansion ... d3 d2 d1 d0 (mod p^N)
        const digs = this.digits();
        const blocks = [];
        for (let i = 0; i < digs.length; i += group) {
            const chunk = digs.slice(i, i + group).map(d => d.toString()).join(' ');
            blocks.push(`[${chunk}]`);
        }
        return `p=${this.p.toString()}, N=${this.N}, x≡ Σ d_i p^i with digits (LSB→MSB): ${blocks.join(' ')}`;
    }

    _checkCompat(other) {
        if (this.p !== other.p || this.N !== other.N) throw new Error('Incompatible p-adic precisions');
    }
}

// ======= Convenience: expansions for some standard numbers =======
export function expandExamples(p, N) {
    const P = toBigInt(p);
    const out = {};
    const make = (x) => new PAdic(p, N, x);

    // -1, 1/2, 1/3 for p ∤ 2·3
    out['-1'] = make(-1n);
    if (P !== 2n) out['1/2'] = PAdic.fromRational(p, N, 1n, 2n);
    if (P !== 3n) out['1/3'] = PAdic.fromRational(p, N, 1n, 3n);

    // sqrt(2): if a^2 ≡ 2 (mod p) has a simple root
    try {
        const root = henselLiftFromModP([-2n, 0n, 1n], p, N); // x^2 - 2
        out['sqrt(2)'] = new PAdic(p, N, root);
    } catch (e) {
        out['sqrt(2)'] = null; // lives in a quadratic extension of Q_p for these p
    }

    // i: root of x^2 + 1
    try {
        const root = henselLiftFromModP([1n, 0n, 1n], p, N); // x^2 + 1
        out['i'] = new PAdic(p, N, root);
    } catch (e) {
        out['i'] = null; // no i in Q_p if -1 is nonsquare mod p
    }

    return out;
}

// ======= Public Hensel API =======
export const Hensel = {
    // Attempt to lift a simple root from mod p up to mod p^N. Throws on failure.
    liftSimpleRoot(coeffs, p, N, a0) {
        coeffs = coeffs.map(toBigInt);
        return henselLiftSimpleRoot(coeffs, p, N, toBigInt(a0));
    },
    // Brute-force search for a simple root mod p, then lift to p^N. Throws if none.
    liftFromModP(coeffs, p, N) {
        coeffs = coeffs.map(toBigInt);
        return henselLiftFromModP(coeffs, p, N);
    }
};

// ======= Small demo (comment out in production) =======
// Example usage:
// const p = 5, N = 10;
// const ex = expandExamples(p, N);
// console.log('Examples at p=5:', ex);
// for (const [k, v] of Object.entries(ex)) {
//   if (v instanceof PAdic) console.log(k, v.toString()); else console.log(k, '∉ Q_p (requires extension)');
// }

export default { PAdic, Hensel, expandExamples };