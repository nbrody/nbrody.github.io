class BigFrac {
    constructor(n, d = 1n) {
        if (typeof n === 'string') {
            if (n.includes('/')) {
                const parts = n.split('/');
                n = BigInt(parts[0]);
                d = BigInt(parts[1]);
            } else {
                n = BigInt(n);
                d = 1n;
            }
        }
        if (typeof n === 'number' || typeof n === 'bigint') n = BigInt(n);
        if (typeof d === 'number' || typeof d === 'bigint') d = BigInt(d);
        if (d === 0n) d = 1n;
        const common = this.gcd(n < 0n ? -n : n, d < 0n ? -d : d);
        this.n = n / common;
        this.d = d / common;
        if (this.d < 0n) { this.n = -this.n; this.d = -this.d; }
    }
    gcd(a, b) { return b === 0n ? a : this.gcd(b, a % b); }
    static from(val) {
        if (val instanceof BigFrac) return val;
        return new BigFrac(val);
    }
    add(b) { b = BigFrac.from(b); return new BigFrac(this.n * b.d + b.n * this.d, this.d * b.d); }
    sub(b) { b = BigFrac.from(b); return new BigFrac(this.n * b.d - b.n * this.d, this.d * b.d); }
    mul(b) { b = BigFrac.from(b); return new BigFrac(this.n * b.n, this.d * b.d); }
    div(b) { b = BigFrac.from(b); return (b.n === 0n) ? new BigFrac(0n) : new BigFrac(this.n * b.d, this.d * b.n); }
    inv() { return new BigFrac(this.d, this.n); }
    neg() { return new BigFrac(-this.n, this.d); }
    toNumber() { return Number(this.n) / Number(this.d); }

    val(p) {
        if (this.n === 0n) return 1000;
        let v = 0;
        let n = this.n < 0n ? -this.n : this.n;
        let d = this.d;
        const bigP = BigInt(p);
        while (n > 0n && n % bigP === 0n) { n /= bigP; v++; }
        while (d > 0n && d % bigP === 0n) { d /= bigP; v--; }
        return v;
    }

    getUP(p) {
        const bigP = BigInt(p);
        const v = this.val(p);
        const pv = (v >= 0) ? (bigP ** BigInt(v)) : 1n;
        const pminv = (v < 0) ? (bigP ** BigInt(-v)) : 1n;
        const unit = new BigFrac(this.n * pminv, this.d * pv);
        return { v, unit };
    }

    static modInverse(a, m) {
        let m0 = m, t, q;
        let x0 = 0n, x1 = 1n;
        if (m === 1n) return 0n;
        let aa = (a % m + m) % m;
        while (aa > 1n) {
            if (m === 0n) break;
            q = aa / m;
            t = m;
            m = aa % m;
            aa = t;
            t = x0;
            x0 = x1 - q * x0;
            x1 = t;
        }
        if (x1 < 0n) x1 += m0;
        return x1;
    }

    modPn(p, n) {
        if (this.n === 0n) return new BigFrac(0n);
        const bigP = BigInt(p);
        const v = this.val(p);
        if (v >= n) return new BigFrac(0n);

        const mVal = n - v; // Precision we need for the unit part
        // this = p^v * (N/D) where p does not divide N or D
        const { unit } = this.getUP(p);
        // unit = unit.n / unit.d. 
        // We want (unit.n * modInv(unit.d, p^mVal)) % p^mVal
        const mod = bigP ** BigInt(mVal);
        const invD = BigFrac.modInverse(unit.d, mod);
        const resUnit = (unit.n * invD) % mod;
        let finalN = resUnit < 0n ? resUnit + mod : resUnit;

        // Final result is p^v * finalN
        const pv = (v >= 0) ? (bigP ** BigInt(v)) : 1n;
        const pminv = (v < 0) ? (bigP ** BigInt(-v)) : 1n;
        return new BigFrac(finalN * pv, pminv);
    }

    toLatex() {
        if (this.n === 0n) return "0";
        if (this.d === 1n) return this.n.toString();
        return `\\frac{${this.n}}{${this.d}}`;
    }

    toVertexLatex(n) {
        return `\\lfloor ${this.toLatex()} \\rfloor_{${n}}`;
    }

    toString() {
        if (this.n === 0n) return "0";
        if (this.d === 1n) return this.n.toString();
        return `${this.n}/${this.d}`;
    }
}

class BigMat {
    constructor(a, b, c, d) {
        this.a = BigFrac.from(a); this.b = BigFrac.from(b);
        this.c = BigFrac.from(c); this.d = BigFrac.from(d);
    }
    mul(other) {
        return new BigMat(
            this.a.mul(other.a).add(this.b.mul(other.c)),
            this.a.mul(other.b).add(this.b.mul(other.d)),
            this.c.mul(other.a).add(this.d.mul(other.c)),
            this.c.mul(other.b).add(this.d.mul(other.d))
        );
    }
    scale(k) {
        k = BigFrac.from(k);
        return new BigMat(this.a.mul(k), this.b.mul(k), this.c.mul(k), this.d.mul(k));
    }
    swapCols() {
        return new BigMat(this.b, this.a, this.d, this.c);
    }

    action(z) {
        const a = this.a.toNumber();
        const b = this.b.toNumber();
        const c = this.c.toNumber();
        const d = this.d.toNumber();
        const numR = a * z.re + b, numI = a * z.im;
        const denR = c * z.re + d, denI = c * z.im;
        const denMagSq = denR * denR + denI * denI;
        return {
            re: (numR * denR + numI * denI) / denMagSq,
            im: (numI * denR - numR * denI) / denMagSq
        };
    }

    getOrientedIwasawa(p) {
        let a = this.a, b = this.b, c = this.c, d = this.d;
        if (c.val(p) < d.val(p)) {
            let tA = a, tC = c;
            a = b; c = d;
            b = tA; d = tC;
        }
        const k = c.div(d).modPn(p, 0); // Ensure k is in Z_p. modPn(p, 0) should handle v_p >= 0.
        // Actually k = c/d is already in Z_p because v_p(c) >= v_p(d).
        a = a.sub(k.mul(b));
        a = a.div(d);
        b = b.div(d);
        const { v: n, unit } = a.getUP(p);
        // Canonical form is M' = [[p^n, q'], [0, 1]]
        // M = [[p^n unit, b], [0, 1]] = [[p^n, b/unit], [0, 1]] * [[unit, 0], [0, 1]]
        // So q' = (b/unit) mod p^n
        return { n, q: b.div(unit).modPn(p, n) };
    }

    getMulFormula(other) {
        return {
            a: `${this.a.toLatex()} \\cdot ${other.a.toLatex()} + ${this.b.toLatex()} \\cdot ${other.c.toLatex()}`,
            b: `${this.a.toLatex()} \\cdot ${other.b.toLatex()} + ${this.b.toLatex()} \\cdot ${other.d.toLatex()}`,
            c: `${this.c.toLatex()} \\cdot ${other.a.toLatex()} + ${this.d.toLatex()} \\cdot ${other.c.toLatex()}`,
            d: `${this.c.toLatex()} \\cdot ${other.b.toLatex()} + ${this.d.toLatex()} \\cdot ${other.d.toLatex()}`
        };
    }
}
