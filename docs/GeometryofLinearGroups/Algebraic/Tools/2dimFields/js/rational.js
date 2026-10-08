// Exact rationals over BigInt, always reduced with a positive denominator.

const abs = (a) => (a < 0n ? -a : a);
export function gcd(a, b) {
    a = abs(a); b = abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
}

export class Q {
    constructor(n, d) { this.n = n; this.d = d; }

    static of(n, d = 1n) {
        n = BigInt(n); d = BigInt(d);
        if (d === 0n) throw new Error('division by zero');
        if (d < 0n) { n = -n; d = -d; }
        if (d === 1n) return new Q(n, 1n);
        const g = gcd(n, d);
        return g === 1n ? new Q(n, d) : new Q(n / g, d / g);
    }
    static int(n) { return new Q(BigInt(n), 1n); }
    // "12", "1.25", ".5" → exact
    static decimal(s) {
        const [i, f = ''] = s.split('.');
        return Q.of(BigInt((i || '0') + f), 10n ** BigInt(f.length));
    }

    add(o) { return this.d === 1n && o.d === 1n ? new Q(this.n + o.n, 1n) : Q.of(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return this.d === 1n && o.d === 1n ? new Q(this.n - o.n, 1n) : Q.of(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return this.d === 1n && o.d === 1n ? new Q(this.n * o.n, 1n) : Q.of(this.n * o.n, this.d * o.d); }
    div(o) {
        if (o.n === 0n) throw new Error('division by zero');
        return Q.of(this.n * o.d, this.d * o.n);
    }
    neg() { return new Q(-this.n, this.d); }
    inv() { return Q.of(this.d, this.n); }
    isZero() { return this.n === 0n; }
    isOne() { return this.n === 1n && this.d === 1n; }
    eq(o) { return this.n === o.n && this.d === o.d; }
    sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
    toNumber() { return Number(this.n) / Number(this.d); }
    toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
    // magnitude only; callers place the sign
    texAbs() { return this.d === 1n ? String(abs(this.n)) : `\\tfrac{${abs(this.n)}}{${this.d}}`; }
}
Q.ZERO = new Q(0n, 1n);
Q.ONE = new Q(1n, 1n);
