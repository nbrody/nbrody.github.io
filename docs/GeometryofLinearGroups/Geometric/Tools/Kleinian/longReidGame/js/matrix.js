
class Fraction {
    constructor(numerator, denominator = 1) {
        if (denominator === 0) {
            throw new Error("Denominator cannot be zero");
        }
        this.numerator = BigInt(numerator);
        this.denominator = BigInt(denominator);

        if (this.denominator < 0n) {
            this.numerator = -this.numerator;
            this.denominator = -this.denominator;
        }
        this.simplify();
    }

    simplify() {
        const common = this.gcd(this.abs(this.numerator), this.denominator);
        this.numerator /= common;
        this.denominator /= common;
    }

    gcd(a, b) {
        return b === 0n ? a : this.gcd(b, a % b);
    }

    abs(n) {
        return n < 0n ? -n : n;
    }

    add(other) {
        return new Fraction(
            this.numerator * other.denominator + other.numerator * this.denominator,
            this.denominator * other.denominator
        );
    }

    sub(other) {
        return new Fraction(
            this.numerator * other.denominator - other.numerator * this.denominator,
            this.denominator * other.denominator
        );
    }

    mul(other) {
        return new Fraction(
            this.numerator * other.numerator,
            this.denominator * other.denominator
        );
    }

    div(other) {
        return new Fraction(
            this.numerator * other.denominator,
            this.denominator * other.numerator
        );
    }

    toString() {
        if (this.denominator === 1n) {
            return this.numerator.toString();
        }
        return `${this.numerator}/${this.denominator}`;
    }

    toNumber() {
        return Number(this.numerator) / Number(this.denominator);
    }
}

class Matrix {
    constructor(a, b, c, d) {
        // a, b, c, d are Fractions
        this.elements = [
            [a, b],
            [c, d]
        ];
    }

    static identity() {
        return new Matrix(
            new Fraction(1), new Fraction(0),
            new Fraction(0), new Fraction(1)
        );
    }

    mul(other) {
        const a11 = this.elements[0][0];
        const a12 = this.elements[0][1];
        const a21 = this.elements[1][0];
        const a22 = this.elements[1][1];

        const b11 = other.elements[0][0];
        const b12 = other.elements[0][1];
        const b21 = other.elements[1][0];
        const b22 = other.elements[1][1];

        return new Matrix(
            a11.mul(b11).add(a12.mul(b21)),
            a11.mul(b12).add(a12.mul(b22)),
            a21.mul(b11).add(a22.mul(b21)),
            a21.mul(b12).add(a22.mul(b22))
        );
    }

    // Generators
    // a = ((3,0),(0,1/3))
    static get A() {
        return new Matrix(
            new Fraction(3), new Fraction(0),
            new Fraction(0), new Fraction(1, 3)
        );
    }

    static get A_inv() {
        return new Matrix(
            new Fraction(1, 3), new Fraction(0),
            new Fraction(0), new Fraction(3)
        );
    }

    // b = 1/8((82,2),(9,1)) = ((82/8, 2/8), (9/8, 1/8)) = ((41/4, 1/4), (9/8, 1/8))
    static get B() {
        return new Matrix(
            new Fraction(82, 8), new Fraction(2, 8),
            new Fraction(9, 8), new Fraction(1, 8)
        );
    }

    static get B_inv() {
        // Inverse of 2x2 matrix ((a,b),(c,d)) is 1/(ad-bc) * ((d,-b),(-c,a))
        // det(B) = (82*1 - 2*9)/64 = (82-18)/64 = 64/64 = 1.
        // So B_inv = ((1/8, -2/8), (-9/8, 82/8))
        return new Matrix(
            new Fraction(1, 8), new Fraction(-2, 8),
            new Fraction(-9, 8), new Fraction(82, 8)
        );
    }

    getLCMDenominator() {
        const denoms = [
            this.elements[0][0].denominator,
            this.elements[0][1].denominator,
            this.elements[1][0].denominator,
            this.elements[1][1].denominator
        ];

        let result = denoms[0];
        for (let i = 1; i < 4; i++) {
            result = this.lcm(result, denoms[i]);
        }
        return result;
    }

    lcm(a, b) {
        if (a === 0n || b === 0n) return 0n;
        return (this.abs(a * b)) / this.gcd(a, b);
    }

    gcd(a, b) {
        return b === 0n ? a : this.gcd(b, a % b);
    }

    abs(n) {
        return n < 0n ? -n : n;
    }

    getPrimeFactorCount() {
        let n = this.getLCMDenominator();
        if (n <= 1n) return 0;

        // Count exponents of 2 and 3
        // Height = m + n where denominator = 2^n * 3^m
        let exponent2 = 0;
        let exponent3 = 0;

        // Count how many times 2 divides n
        while (n % 2n === 0n) {
            exponent2++;
            n /= 2n;
        }

        // Count how many times 3 divides n
        while (n % 3n === 0n) {
            exponent3++;
            n /= 3n;
        }

        // If n is not 1 at this point, there are other prime factors
        // This shouldn't happen for the Long-Reid group which lives in Z[1/6]
        if (n !== 1n) {
            console.warn(`Unexpected prime factor in denominator: ${n}`);
        }

        return exponent2 + exponent3;
    }


    toString() {
        return `[[${this.elements[0][0]}, ${this.elements[0][1]}], [${this.elements[1][0]}, ${this.elements[1][1]}]]`;
    }
}
