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
        if (typeof n === 'number') n = BigInt(n);
        if (typeof d === 'number') d = BigInt(d);
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

    // p^v * u where u is unit
    getUP(p) {
        const bigP = BigInt(p);
        const v = this.val(p);
        let n = this.n;
        let d = this.d;
        if (v >= 0) {
            d *= (bigP ** BigInt(v));
        } else {
            n *= (bigP ** BigInt(-v));
        }
        // Actually simpler:
        const pv = (v >= 0) ? (bigP ** BigInt(v)) : 1n;
        const pminv = (v < 0) ? (bigP ** BigInt(-v)) : 1n;
        // unit = x / p^v = (n/d) * (pminv/pv)
        const unit = new BigFrac(this.n * pminv, this.d * pv);
        return { v, unit };
    }

    modPn(p, n) {
        const bigP = BigInt(p);
        const pn = (n >= 0) ? new BigFrac(bigP ** BigInt(n)) : new BigFrac(1n, bigP ** BigInt(-n));
        const val = this.div(pn);
        let rem = val.n % val.d;
        if (rem < 0n) rem += val.d;
        return pn.mul(new BigFrac(rem, val.d));
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
    getMulFormula(other) {
        return {
            a: `${this.a.toLatex()} \\cdot ${other.a.toLatex()} + ${this.b.toLatex()} \\cdot ${other.c.toLatex()}`,
            b: `${this.a.toLatex()} \\cdot ${other.b.toLatex()} + ${this.b.toLatex()} \\cdot ${other.d.toLatex()}`,
            c: `${this.c.toLatex()} \\cdot ${other.a.toLatex()} + ${this.d.toLatex()} \\cdot ${other.c.toLatex()}`,
            d: `${this.c.toLatex()} \\cdot ${other.b.toLatex()} + ${this.d.toLatex()} \\cdot ${other.d.toLatex()}`
        };
    }
}
