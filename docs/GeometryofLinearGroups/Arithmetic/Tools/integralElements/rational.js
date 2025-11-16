/**
 * Rational number class for exact representation
 */
export class Rational {
    constructor(numerator, denominator = 1) {
        if (denominator === 0) {
            throw new Error('Denominator cannot be zero');
        }

        // Normalize sign
        if (denominator < 0) {
            numerator = -numerator;
            denominator = -denominator;
        }

        // Simplify
        const g = this.gcd(Math.abs(numerator), Math.abs(denominator));
        this.numerator = numerator / g;
        this.denominator = denominator / g;
    }

    gcd(a, b) {
        return b === 0 ? a : this.gcd(b, a % b);
    }

    toString() {
        if (this.denominator === 1) return String(this.numerator);
        return `${this.numerator}/${this.denominator}`;
    }

    toLatex() {
        if (this.denominator === 1) return String(this.numerator);
        return `\\frac{${this.numerator}}{${this.denominator}}`;
    }

    add(other) {
        const num = this.numerator * other.denominator + other.numerator * this.denominator;
        const den = this.denominator * other.denominator;
        return new Rational(num, den);
    }

    sub(other) {
        const num = this.numerator * other.denominator - other.numerator * this.denominator;
        const den = this.denominator * other.denominator;
        return new Rational(num, den);
    }

    mul(other) {
        return new Rational(this.numerator * other.numerator, this.denominator * other.denominator);
    }

    neg() {
        return new Rational(-this.numerator, this.denominator);
    }
}
