// Fraction class for exact rational arithmetic
class Fraction {
    constructor(num, den = 1) {
        if (den === 0) {
            this.num = num >= 0 ? 1 : -1;
            this.den = 0;
        } else {
            const g = this.gcd(Math.abs(num), Math.abs(den));
            this.num = num / g;
            this.den = den / g;
            if (this.den < 0) {
                this.num = -this.num;
                this.den = -this.den;
            }
        }
    }

    gcd(a, b) {
        a = Math.abs(a);
        b = Math.abs(b);
        while (b !== 0) {
            const t = b;
            b = a % b;
            a = t;
        }
        return a || 1;
    }

    add(other) {
        return new Fraction(
            this.num * other.den + other.num * this.den,
            this.den * other.den
        );
    }

    multiply(other) {
        return new Fraction(this.num * other.num, this.den * other.den);
    }

    divide(other) {
        return new Fraction(this.num * other.den, this.den * other.num);
    }

    negate() {
        return new Fraction(-this.num, this.den);
    }

    toString() {
        if (this.den === 0) return "∞";
        if (this.den === 1) return this.num.toString();
        return `${this.num}/${this.den}`;
    }

    equals(other) {
        return this.num === other.num && this.den === other.den;
    }
}

function parseFraction(str) {
    str = str.trim();
    if (str === '∞' || str === 'inf') return new Fraction(1, 0);

    if (str.includes('/')) {
        const parts = str.split('/');
        return new Fraction(parseInt(parts[0]), parseInt(parts[1]));
    }
    return new Fraction(parseInt(str), 1);
}
