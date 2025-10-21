/**
 * numberRing.js
 * A JavaScript library for working with number rings (finitely generated Z-algebras)
 * that embed in the algebraic numbers.
 */

// =============================================================================
// RATIONAL NUMBER CLASS
// =============================================================================

class Rational {
    constructor(numerator, denominator = 1) {
        if (denominator === 0) {
            throw new Error("Denominator cannot be zero");
        }

        // Ensure denominator is positive
        if (denominator < 0) {
            numerator = -numerator;
            denominator = -denominator;
        }

        // Reduce to lowest terms
        const g = Rational.gcd(Math.abs(numerator), Math.abs(denominator));
        this.num = numerator / g;
        this.den = denominator / g;
    }

    static gcd(a, b) {
        a = Math.abs(Math.floor(a));
        b = Math.abs(Math.floor(b));
        while (b !== 0) {
            const t = b;
            b = a % b;
            a = t;
        }
        return a === 0 ? 1 : a;
    }

    static lcm(a, b) {
        return Math.abs(a * b) / Rational.gcd(a, b);
    }

    add(other) {
        if (typeof other === 'number') {
            other = new Rational(other);
        }
        const num = this.num * other.den + other.num * this.den;
        const den = this.den * other.den;
        return new Rational(num, den);
    }

    subtract(other) {
        if (typeof other === 'number') {
            other = new Rational(other);
        }
        return this.add(other.negate());
    }

    multiply(other) {
        if (typeof other === 'number') {
            other = new Rational(other);
        }
        return new Rational(this.num * other.num, this.den * other.den);
    }

    divide(other) {
        if (typeof other === 'number') {
            other = new Rational(other);
        }
        if (other.num === 0) {
            throw new Error("Division by zero");
        }
        return new Rational(this.num * other.den, this.den * other.num);
    }

    negate() {
        return new Rational(-this.num, this.den);
    }

    isZero() {
        return this.num === 0;
    }

    isOne() {
        return this.num === this.den;
    }

    toNumber() {
        return this.num / this.den;
    }

    toString() {
        if (this.den === 1) {
            return this.num.toString();
        }
        return `${this.num}/${this.den}`;
    }

    equals(other) {
        if (typeof other === 'number') {
            other = new Rational(other);
        }
        return this.num === other.num && this.den === other.den;
    }

    clone() {
        return new Rational(this.num, this.den);
    }
}

// =============================================================================
// POLYNOMIAL CLASS (over Z or Q)
// =============================================================================

class Polynomial {
    constructor(coefficients, ring = 'Q') {
        // coefficients[i] is the coefficient of x^i
        // Ensure coefficients are Rational if ring is Q
        this.ring = ring;

        if (ring === 'Q') {
            this.coeffs = coefficients.map(c =>
                c instanceof Rational ? c : new Rational(c)
            );
        } else if (ring === 'Z') {
            this.coeffs = coefficients.map(c => {
                if (c instanceof Rational) {
                    if (c.den !== 1) {
                        throw new Error("Z-coefficients must be integers");
                    }
                    return c.num;
                }
                return Math.floor(c);
            });
        } else {
            this.coeffs = coefficients;
        }

        this._normalize();
    }

    _normalize() {
        // Remove leading zeros
        while (this.coeffs.length > 1 && this._isZero(this.coeffs[this.coeffs.length - 1])) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) {
            this.coeffs = this.ring === 'Z' ? [0] : [new Rational(0)];
        }
    }

    _isZero(c) {
        if (c instanceof Rational) {
            return c.isZero();
        }
        return c === 0;
    }

    degree() {
        return this.coeffs.length - 1;
    }

    leadingCoeff() {
        return this.coeffs[this.coeffs.length - 1];
    }

    add(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = [];

        for (let i = 0; i < maxLen; i++) {
            const a = i < this.coeffs.length ? this.coeffs[i] : (this.ring === 'Z' ? 0 : new Rational(0));
            const b = i < other.coeffs.length ? other.coeffs[i] : (this.ring === 'Z' ? 0 : new Rational(0));

            if (this.ring === 'Q') {
                result.push(a.add(b));
            } else {
                result.push(a + b);
            }
        }

        return new Polynomial(result, this.ring);
    }

    subtract(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = [];

        for (let i = 0; i < maxLen; i++) {
            const a = i < this.coeffs.length ? this.coeffs[i] : (this.ring === 'Z' ? 0 : new Rational(0));
            const b = i < other.coeffs.length ? other.coeffs[i] : (this.ring === 'Z' ? 0 : new Rational(0));

            if (this.ring === 'Q') {
                result.push(a.subtract(b));
            } else {
                result.push(a - b);
            }
        }

        return new Polynomial(result, this.ring);
    }

    multiply(other) {
        const result = new Array(this.coeffs.length + other.coeffs.length - 1);
        result.fill(this.ring === 'Z' ? 0 : new Rational(0));

        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                if (this.ring === 'Q') {
                    result[i + j] = result[i + j].add(this.coeffs[i].multiply(other.coeffs[j]));
                } else {
                    result[i + j] += this.coeffs[i] * other.coeffs[j];
                }
            }
        }

        return new Polynomial(result, this.ring);
    }

    // Polynomial division with remainder
    divmod(other) {
        if (other.degree() < 0 || this._isZero(other.leadingCoeff())) {
            throw new Error("Division by zero polynomial");
        }

        let remainder = this.clone();
        const quotient = [];

        while (remainder.degree() >= other.degree() && !this._isZero(remainder.leadingCoeff())) {
            const coeff = this.ring === 'Q'
                ? remainder.leadingCoeff().divide(other.leadingCoeff())
                : Math.floor(remainder.leadingCoeff() / other.leadingCoeff());

            const deg = remainder.degree() - other.degree();

            // Store quotient coefficient
            while (quotient.length <= deg) {
                quotient.push(this.ring === 'Z' ? 0 : new Rational(0));
            }
            quotient[deg] = coeff;

            // Subtract coeff * x^deg * other from remainder
            const term = new Array(deg + 1);
            term.fill(this.ring === 'Z' ? 0 : new Rational(0));
            term[deg] = coeff;
            const termPoly = new Polynomial(term, this.ring);
            const subtrahend = termPoly.multiply(other);
            remainder = remainder.subtract(subtrahend);
        }

        return {
            quotient: new Polynomial(quotient.length > 0 ? quotient : [this.ring === 'Z' ? 0 : new Rational(0)], this.ring),
            remainder: remainder
        };
    }

    // Evaluate polynomial at a value
    evaluate(x) {
        let result = this.ring === 'Z' ? 0 : new Rational(0);
        let power = this.ring === 'Z' ? 1 : new Rational(1);

        for (let i = 0; i < this.coeffs.length; i++) {
            if (this.ring === 'Q') {
                result = result.add(this.coeffs[i].multiply(power));
                power = power.multiply(x);
            } else {
                result += this.coeffs[i] * Math.pow(x, i);
            }
        }

        return result;
    }

    clone() {
        return new Polynomial([...this.coeffs], this.ring);
    }

    toString() {
        if (this.coeffs.length === 0) return '0';

        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const c = this.coeffs[i];
            if (this._isZero(c)) continue;

            let term = '';
            const coeffStr = c instanceof Rational ? c.toString() : c.toString();

            if (i === 0) {
                term = coeffStr;
            } else {
                const absCoeff = c instanceof Rational ? Math.abs(c.toNumber()) : Math.abs(c);
                if (absCoeff === 1) {
                    term = i === 1 ? 'x' : `x^${i}`;
                } else {
                    term = i === 1 ? `${coeffStr}*x` : `${coeffStr}*x^${i}`;
                }
            }

            if (terms.length > 0) {
                const isNegative = c instanceof Rational ? c.num < 0 : c < 0;
                if (isNegative) {
                    term = term.replace('-', '');
                    terms.push(`- ${term}`);
                } else {
                    terms.push(`+ ${term}`);
                }
            } else {
                terms.push(term);
            }
        }

        return terms.join(' ') || '0';
    }
}

// =============================================================================
// ALGEBRAIC NUMBER CLASS
// =============================================================================

class AlgebraicNumber {
    constructor(minPoly, representation = null) {
        // minPoly: minimal polynomial over Q
        // representation: how to express this number in terms of generators
        this.minimalPolynomial = minPoly;
        this.representation = representation || { coeffs: [new Rational(0), new Rational(1)] };
    }

    degree() {
        return this.minimalPolynomial.degree();
    }

    toString() {
        return `AlgebraicNumber[${this.minimalPolynomial.toString()}]`;
    }
}

// =============================================================================
// NUMBER RING CLASS
// =============================================================================

class NumberRing {
    constructor(generators = [], relations = []) {
        /**
         * generators: array of algebraic numbers that generate the ring
         * relations: array of polynomial relations between generators
         */
        this.generators = generators;
        this.relations = relations;
        this.valuations = [];
        this._computeBasicProperties();
    }

    _computeBasicProperties() {
        // Compute rank as Z-module
        if (this.generators.length === 0) {
            this.rank = 1; // Just Z
            this.dimension = 0;
        } else {
            // The rank is the product of degrees of generators
            // (assuming they're independent)
            this.rank = this.generators.reduce((prod, gen) => {
                return prod * (gen.degree ? gen.degree() : 1);
            }, 1);

            // Dimension over Q
            this.dimension = this.rank;
        }
    }

    /**
     * Add a valuation to this number ring
     * A valuation v satisfies:
     * - v(xy) = v(x) + v(y)
     * - v(x+y) >= min(v(x), v(y))
     * - v(0) = infinity
     */
    addValuation(valuation) {
        this.valuations.push(valuation);
    }

    /**
     * Create a number ring from a single polynomial
     * This creates Q[x]/(f(x)) where f is the polynomial
     */
    static fromPolynomial(poly) {
        // Check if polynomial is irreducible (simplified check)
        if (poly.degree() < 1) {
            throw new Error("Polynomial must have positive degree");
        }

        // Create algebraic number α where poly(α) = 0
        const alpha = new AlgebraicNumber(poly);

        const ring = new NumberRing([alpha], [poly]);

        // Add valuations
        ring._computeValuations();

        return ring;
    }

    /**
     * Create Z[sqrt(d)] for square-free d
     */
    static quadratic(d) {
        // Check if d is square-free (simplified)
        if (d === 0 || d === 1) {
            throw new Error("d must be square-free and non-zero/one");
        }

        // Create polynomial x^2 - d
        const poly = new Polynomial([new Rational(-d), new Rational(0), new Rational(1)], 'Q');
        return NumberRing.fromPolynomial(poly);
    }

    /**
     * Create cyclotomic field Q(ζ_n)
     */
    static cyclotomic(n) {
        if (n < 3) {
            throw new Error("n must be at least 3");
        }

        // Cyclotomic polynomial Φ_n(x)
        // For prime p: Φ_p(x) = 1 + x + x^2 + ... + x^(p-1)
        const isPrime = (num) => {
            for (let i = 2; i <= Math.sqrt(num); i++) {
                if (num % i === 0) return false;
            }
            return num > 1;
        };

        let poly;
        if (isPrime(n)) {
            const coeffs = new Array(n);
            for (let i = 0; i < n; i++) {
                coeffs[i] = new Rational(1);
            }
            poly = new Polynomial(coeffs, 'Q');
        } else {
            // General cyclotomic polynomial (simplified - just use x^n - 1 for now)
            const coeffs = new Array(n + 1);
            for (let i = 0; i < n + 1; i++) {
                coeffs[i] = new Rational(0);
            }
            coeffs[0] = new Rational(-1);
            coeffs[n] = new Rational(1);
            poly = new Polynomial(coeffs, 'Q');
        }

        return NumberRing.fromPolynomial(poly);
    }

    /**
     * Compute valuations for this number ring
     */
    _computeValuations() {
        if (this.generators.length === 0) {
            // Just Z - only archimedean valuation
            this.valuations.push({
                type: 'archimedean',
                isReal: true,
                description: 'Standard absolute value on ℤ ⊂ ℝ'
            });
            return;
        }

        const minPoly = this.generators[0].minimalPolynomial;
        const degree = minPoly.degree();

        // Check if this is a localization like Z[1/n]
        const localizationInfo = this._detectLocalization(minPoly);

        if (localizationInfo) {
            // Ring is Z[1/n] - has archimedean + p-adic for primes dividing n
            this.valuations.push({
                type: 'archimedean',
                isReal: true,
                description: 'Standard absolute value on ℝ'
            });

            // Add p-adic valuations for each prime dividing n
            localizationInfo.primes.forEach(p => {
                this.valuations.push({
                    type: 'non-archimedean',
                    prime: p,
                    description: `${p}-adic valuation`
                });
            });

            this.isLocalization = true;
            this.localizationDenominator = localizationInfo.n;
            return;
        }

        // For a number field, compute signature (r, s) where
        // r = number of real embeddings
        // 2s = number of complex embeddings
        // r + 2s = degree
        const signature = this._computeSignature(minPoly);

        // Add archimedean valuations (infinite places)
        for (let i = 0; i < signature.realEmbeddings; i++) {
            this.valuations.push({
                type: 'archimedean',
                isReal: true,
                index: i + 1,
                description: `Real embedding ${i + 1}`
            });
        }

        for (let i = 0; i < signature.complexPairs; i++) {
            this.valuations.push({
                type: 'archimedean',
                isReal: false,
                index: i + 1,
                description: `Complex conjugate pair ${i + 1}`
            });
        }

        this.signature = signature;
    }

    /**
     * Detect if polynomial defines a localization Z[1/n]
     * Returns null or {n: number, primes: [p1, p2, ...]}
     */
    _detectLocalization(poly) {
        // Check if polynomial is of the form n*x - 1
        if (poly.degree() !== 1) return null;

        const a = poly.coeffs[1]; // coefficient of x
        const b = poly.coeffs[0]; // constant term

        // Check if a*x + b = 0 => x = -b/a
        // We want n*x - 1 = 0 => x = 1/n
        if (poly.ring === 'Q') {
            if (!b.equals(new Rational(-1))) return null;
            if (a.den !== 1) return null; // a should be an integer

            const n = Math.abs(a.num);
            if (n === 1) return null; // Just Z

            return {
                n: n,
                primes: [...new Set(primeFactorization(n))]
            };
        }

        return null;
    }

    /**
     * Compute the signature (r, s) of a number field
     * r = number of real embeddings
     * s = number of complex conjugate pairs
     * r + 2s = degree
     */
    _computeSignature(poly) {
        const degree = poly.degree();

        // For polynomials with real coefficients:
        // Count real roots vs complex roots

        if (degree === 1) {
            return { realEmbeddings: 1, complexPairs: 0 };
        }

        if (degree === 2) {
            // Check discriminant
            const disc = this._polynomialDiscriminant(poly);
            const discValue = poly.ring === 'Q' ? disc.toNumber() : disc;

            if (discValue > 0) {
                // Two distinct real roots
                return { realEmbeddings: 2, complexPairs: 0 };
            } else if (discValue < 0) {
                // Complex conjugate pair
                return { realEmbeddings: 0, complexPairs: 1 };
            } else {
                // Repeated root (shouldn't happen for minimal polynomials)
                return { realEmbeddings: 2, complexPairs: 0 };
            }
        }

        // For degree 3 and higher, use Sturm's theorem or root counting
        // For now, simplified heuristic based on leading coefficient sign
        // A better implementation would actually count sign changes

        if (degree === 3) {
            // Cubic always has at least one real root
            // Could have 1 real + 2 complex or 3 real
            // Simplified: assume 1 real + 1 complex pair
            return { realEmbeddings: 1, complexPairs: 1 };
        }

        if (degree === 4) {
            // Could be 0, 2, or 4 real roots
            // Simplified: assume all real or all complex
            const disc = this._polynomialDiscriminant(poly);
            const discValue = poly.ring === 'Q' ? disc.toNumber() : disc;

            if (discValue > 0) {
                return { realEmbeddings: 4, complexPairs: 0 };
            } else {
                return { realEmbeddings: 0, complexPairs: 2 };
            }
        }

        // For higher degrees, default to complex case
        // In a full implementation, we'd use numerical root finding
        const complexPairs = Math.floor(degree / 2);
        const realEmbeddings = degree % 2;

        return { realEmbeddings, complexPairs };
    }

    /**
     * Compute non-archimedean valuations at a specific prime
     * (for future extension to study prime splitting)
     */
    _computeValuationsAtPrime(p, minPoly) {
        // This would factor minPoly mod p to find how p splits
        // Each irreducible factor corresponds to a prime ideal lying over p

        // Placeholder for now
        return [];
    }

    /**
     * Get all non-trivial inequivalent valuations
     */
    getValuations() {
        // All valuations we compute are non-trivial
        return this.valuations;
    }

    /**
     * Compute the discriminant of the number ring
     */
    discriminant() {
        if (this.generators.length === 0) {
            return 1; // Z has discriminant 1
        }

        // For Q(α), discriminant is the discriminant of the minimal polynomial
        const minPoly = this.generators[0].minimalPolynomial;
        return this._polynomialDiscriminant(minPoly);
    }

    _polynomialDiscriminant(poly) {
        // Discriminant of a polynomial
        // disc(f) = (-1)^(n(n-1)/2) * resultant(f, f') / leading_coeff(f)

        // For a monic polynomial of degree n with roots α_1, ..., α_n:
        // disc(f) = ∏_{i<j} (α_i - α_j)^2

        // Simplified computation for quadratics and cubics
        const n = poly.degree();

        if (n === 2) {
            // For ax^2 + bx + c: disc = b^2 - 4ac
            const a = poly.coeffs[2];
            const b = poly.coeffs[1];
            const c = poly.coeffs[0];

            if (poly.ring === 'Q') {
                return b.multiply(b).subtract(a.multiply(c).multiply(new Rational(4)));
            } else {
                return b * b - 4 * a * c;
            }
        }

        // For higher degrees, return a placeholder
        // Full implementation would use resultants
        return new Rational(1);
    }

    /**
     * Check if this ring is the full ring of integers in its field
     */
    isMaximal() {
        // A ring is maximal if it equals the integral closure of Z in K
        // For Q(α), this is O_K, the ring of algebraic integers in K

        // Check if the discriminant is square-free
        const disc = this.discriminant();
        // Simplified check
        return true; // Placeholder
    }

    /**
     * Get information about this number ring
     */
    getInfo() {
        return {
            generators: this.generators.length,
            rank: this.rank,
            dimension: this.dimension,
            valuations: this.valuations.length,
            discriminant: this.discriminant().toString(),
            isMaximal: this.isMaximal()
        };
    }

    toString() {
        if (this.generators.length === 0) {
            return 'Z';
        }

        if (this.generators.length === 1) {
            const gen = this.generators[0];
            const poly = gen.minimalPolynomial;
            return `Z[α]/(${poly.toString()})`;
        }

        return `NumberRing with ${this.generators.length} generators`;
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Parse a polynomial string like "x^2 - 2" into a Polynomial object
 */
function parsePolynomial(str, variable = 'x', ring = 'Q') {
    // Remove spaces
    str = str.replace(/\s+/g, '');

    // Replace ** with ^
    str = str.replace(/\*\*/g, '^');

    // Find maximum degree
    let maxDegree = 0;
    const powerRegex = new RegExp(variable + '\\^(\\d+)', 'g');
    let match;
    while ((match = powerRegex.exec(str)) !== null) {
        maxDegree = Math.max(maxDegree, parseInt(match[1]));
    }

    // Check for linear term
    if (str.includes(variable) && !str.includes(variable + '^')) {
        maxDegree = Math.max(maxDegree, 1);
    }

    // Initialize coefficients
    const coeffs = new Array(maxDegree + 1).fill(0);

    // Split into terms
    str = str.replace(/-/g, '+-');
    const terms = str.split('+').filter(t => t.length > 0);

    for (const term of terms) {
        if (!term.includes(variable)) {
            // Constant term
            coeffs[0] = parseFloat(term);
        } else if (term.includes('^')) {
            // Term with power
            const parts = term.split(variable + '^');
            let coeff = parts[0];
            if (coeff === '' || coeff === '+') coeff = '1';
            if (coeff === '-') coeff = '-1';
            coeff = coeff.replace(/\*/g, '');
            const power = parseInt(parts[1]);
            coeffs[power] = parseFloat(coeff);
        } else {
            // Linear term
            let coeff = term.replace(variable, '').replace('*', '');
            if (coeff === '' || coeff === '+') coeff = '1';
            if (coeff === '-') coeff = '-1';
            coeffs[1] = parseFloat(coeff);
        }
    }

    // Convert to rationals if ring is Q
    if (ring === 'Q') {
        return new Polynomial(coeffs.map(c => new Rational(c)), 'Q');
    } else {
        return new Polynomial(coeffs, 'Z');
    }
}

/**
 * Factor an integer into primes
 */
function primeFactorization(n) {
    n = Math.abs(Math.floor(n));
    if (n <= 1) return [];

    const factors = [];
    let d = 2;

    while (d * d <= n) {
        while (n % d === 0) {
            factors.push(d);
            n /= d;
        }
        d++;
    }

    if (n > 1) {
        factors.push(n);
    }

    return factors;
}

/**
 * Check if an integer is square-free
 */
function isSquareFree(n) {
    const factors = primeFactorization(n);
    for (let i = 0; i < factors.length - 1; i++) {
        if (factors[i] === factors[i + 1]) {
            return false;
        }
    }
    return true;
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Rational,
        Polynomial,
        AlgebraicNumber,
        NumberRing,
        parsePolynomial,
        primeFactorization,
        isSquareFree
    };
}
