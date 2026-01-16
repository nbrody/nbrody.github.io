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
    toNumber() { return Number(this.n) / Number(this.d); }
    toLatex() {
        if (this.n === 0n) return "0";
        if (this.d === 1n) return this.n.toString();
        return `\\frac{${this.n}}{${this.d}}`;
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
    // Action on upper half plane point z = x + iy
    // (az+b)/(cz+d)
    action(z) {
        const a = this.a.toNumber();
        const b = this.b.toNumber();
        const c = this.c.toNumber();
        const d = this.d.toNumber();

        // (a(x+iy)+b) / (c(x+iy)+d) = (ax+b + iay) / (cx+d + icy)
        const numR = a * z.re + b;
        const numI = a * z.im;
        const denR = c * z.re + d;
        const denI = c * z.im;
        const denMagSq = denR * denR + denI * denI;

        return {
            re: (numR * denR + numI * denI) / denMagSq,
            im: (numI * denR - numR * denI) / denMagSq
        };
    }
}

// Convert Upper Half Plane (z) to Poincare Disk (w)
// w = (z - i) / (z + i)
function toDisk(z) {
    const denR = z.re;
    const denI = z.im + 1;
    const numR = z.re;
    const numI = z.im - 1;
    const magSq = denR * denR + denI * denI;
    return {
        re: (numR * denR + numI * denI) / magSq,
        im: (numI * denR - numR * denI) / magSq
    };
}

// Convert Poincare Disk (w) to Upper Half Plane (z)
// z = i(1 + w) / (1 - w)
function fromDisk(w) {
    const denR = 1 - w.re;
    const denI = -w.im;
    const numR = -w.im; // Re[i(1+w)] = Re[i + ire - im] = -im
    const numI = 1 + w.re; // Im[i(1+w)] = Im[i + ire - im] = 1 + re
    const magSq = denR * denR + denI * denI;
    return {
        re: (numR * denR + numI * denI) / magSq,
        im: (numI * denR - numR * denI) / magSq
    };
}
