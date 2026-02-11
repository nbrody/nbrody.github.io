/**
 * rational.js — Exact rational arithmetic using BigInt
 */

class BigRational {
    constructor(num, den = 1n) {
        if (typeof num === 'number') num = BigInt(Math.round(num));
        if (typeof den === 'number') den = BigInt(Math.round(den));
        if (den === 0n) throw new Error('Denominator cannot be zero');
        if (den < 0n) { num = -num; den = -den; }
        const g = BigRational.gcd(num < 0n ? -num : num, den);
        this.num = num / g;
        this.den = den / g;
    }

    static ZERO = new BigRational(0n, 1n);
    static ONE  = new BigRational(1n, 1n);
    static MINUS_ONE = new BigRational(-1n, 1n);

    static fromInt(n) {
        return new BigRational(BigInt(n), 1n);
    }

    static fromFraction(num, den) {
        return new BigRational(BigInt(num), BigInt(den));
    }

    static gcd(a, b) {
        if (a < 0n) a = -a;
        if (b < 0n) b = -b;
        while (b !== 0n) { const t = b; b = a % b; a = t; }
        return a === 0n ? 1n : a;
    }

    static lcm(a, b) {
        if (a < 0n) a = -a;
        if (b < 0n) b = -b;
        if (a === 0n || b === 0n) return 0n;
        return (a / BigRational.gcd(a, b)) * b;
    }

    add(other) {
        if (!(other instanceof BigRational)) other = BigRational.fromInt(other);
        return new BigRational(
            this.num * other.den + other.num * this.den,
            this.den * other.den
        );
    }

    sub(other) {
        if (!(other instanceof BigRational)) other = BigRational.fromInt(other);
        return new BigRational(
            this.num * other.den - other.num * this.den,
            this.den * other.den
        );
    }

    mul(other) {
        if (!(other instanceof BigRational)) other = BigRational.fromInt(other);
        return new BigRational(this.num * other.num, this.den * other.den);
    }

    div(other) {
        if (!(other instanceof BigRational)) other = BigRational.fromInt(other);
        if (other.num === 0n) throw new Error('Division by zero');
        return new BigRational(this.num * other.den, this.den * other.num);
    }

    neg()     { return new BigRational(-this.num, this.den); }
    inv()     { return new BigRational(this.den, this.num); }
    abs()     { return new BigRational(this.num < 0n ? -this.num : this.num, this.den); }
    sign()    { return this.num > 0n ? 1 : this.num < 0n ? -1 : 0; }
    isZero()  { return this.num === 0n; }
    isOne()   { return this.num === 1n && this.den === 1n; }
    isInteger() { return this.den === 1n; }

    toNumber() { return Number(this.num) / Number(this.den); }

    compareTo(other) {
        if (!(other instanceof BigRational)) other = BigRational.fromInt(other);
        const diff = this.num * other.den - other.num * this.den;
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    }

    equals(other) {
        if (!(other instanceof BigRational)) other = BigRational.fromInt(other);
        return this.num === other.num && this.den === other.den;
    }

    pow(n) {
        if (n === 0) return BigRational.ONE;
        if (n < 0) return this.inv().pow(-n);
        let result = BigRational.ONE;
        let base = this;
        while (n > 0) {
            if (n & 1) result = result.mul(base);
            base = base.mul(base);
            n >>= 1;
        }
        return result;
    }

    toString() {
        if (this.den === 1n) return this.num.toString();
        return `${this.num}/${this.den}`;
    }

    toLatex() {
        if (this.den === 1n) return this.num.toString();
        const sign = this.num < 0n ? '-' : '';
        const absNum = this.num < 0n ? -this.num : this.num;
        return `${sign}\\frac{${absNum}}{${this.den}}`;
    }

    clone() { return new BigRational(this.num, this.den); }
}

// Convenience
const Q = (n, d) => d !== undefined ? new BigRational(BigInt(n), BigInt(d)) : BigRational.fromInt(n);
