// =============================================================================
// math.js — Exact arithmetic and SL(2,Z) matrix utilities
// =============================================================================
// BigFrac: exact rational arithmetic using BigInt
// BigMat:  2x2 matrices over BigFrac
// SL2Z:   integer 2x2 matrices with det = 1 (elements of SL(2,Z))
// Helpers: gcd, isPrime, matA, matB
// =============================================================================

// ---------------------------------------------------------------------------
// BigFrac — exact rational numbers
// ---------------------------------------------------------------------------
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
    toLatex() {
        if (this.n === 0n) return "0";
        if (this.d === 1n) return this.n.toString();
        return `\\frac{${this.n}}{${this.d}}`;
    }
    toString() {
        if (this.n === 0n) return "0";
        if (this.d === 1n) return this.n.toString();
        return `${this.n}/${this.d}`;
    }
}

// ---------------------------------------------------------------------------
// BigMat — 2x2 matrices over BigFrac (exact rational entries)
// ---------------------------------------------------------------------------
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
    det() { return this.a.mul(this.d).sub(this.b.mul(this.c)); }
    inv() {
        const d = this.det();
        return new BigMat(this.d.div(d), this.b.neg().div(d), this.c.neg().div(d), this.a.div(d));
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
    toLatex() {
        return `\\begin{pmatrix} ${this.a.toLatex()} & ${this.b.toLatex()} \\\\ ${this.c.toLatex()} & ${this.d.toLatex()} \\end{pmatrix}`;
    }
}

// ---------------------------------------------------------------------------
// SL2Z — integer 2x2 matrices with determinant 1
// ---------------------------------------------------------------------------
// Entries stored as plain Numbers (sufficient for primes up to ~1000).
// Represents elements of SL(2,Z); equality check treats as PSL (M = +/-N).
// ---------------------------------------------------------------------------
class SL2Z {
    /**
     * @param {number} a - top-left entry
     * @param {number} b - top-right entry
     * @param {number} c - bottom-left entry
     * @param {number} d - bottom-right entry
     */
    constructor(a, b, c, d) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }

    /** Matrix multiplication: this * other */
    mul(other) {
        return new SL2Z(
            this.a * other.a + this.b * other.c,
            this.a * other.b + this.b * other.d,
            this.c * other.a + this.d * other.c,
            this.c * other.b + this.d * other.d
        );
    }

    /** Inverse for a det=1 matrix: [[d, -b], [-c, a]] */
    inv() {
        return new SL2Z(this.d, -this.b, -this.c, this.a);
    }

    /** Trace: a + d */
    trace() {
        return this.a + this.d;
    }

    /** Determinant: a*d - b*c (should always be 1) */
    det() {
        return this.a * this.d - this.b * this.c;
    }

    /** A matrix in SL(2,Z) is hyperbolic iff |trace| > 2 */
    isHyperbolic() {
        return Math.abs(this.trace()) > 2;
    }

    /**
     * Fixed points on the real projective line (boundary of the upper half-plane).
     * For M = [[a,b],[c,d]], the fixed-point equation Mx = x gives:
     *   c*x^2 + (d - a)*x - b = 0
     * Solutions: x = ((a - d) +/- sqrt((a-d)^2 + 4bc)) / (2c)
     *
     * Returns [x_minus, x_plus] as floats (repelling, attracting).
     * If c = 0, one fixed point is at infinity; returns [Infinity, -b/(d-a)]
     * or similar degenerate cases.
     */
    fixedPoints() {
        const { a, b, c, d } = this;

        if (c === 0) {
            // cx^2 + (d-a)x - b = 0 becomes (d-a)x = b
            if (d - a === 0) {
                // Identity-like: every point is fixed (or no finite fixed point)
                return [Infinity, Infinity];
            }
            // One finite fixed point, one at infinity
            return [Infinity, b / (d - a)];
        }

        const discriminant = (a - d) * (a - d) + 4 * b * c;
        if (discriminant < 0) {
            // Elliptic element — no real fixed points
            return [NaN, NaN];
        }

        const sqrtDisc = Math.sqrt(discriminant);
        const xMinus = ((a - d) - sqrtDisc) / (2 * c);
        const xPlus  = ((a - d) + sqrtDisc) / (2 * c);
        return [xMinus, xPlus];
    }

    /**
     * Equality as elements of PSL(2,Z): M equals N iff M = +/-N.
     */
    eq(other) {
        return (
            (this.a === other.a && this.b === other.b &&
             this.c === other.c && this.d === other.d) ||
            (this.a === -other.a && this.b === -other.b &&
             this.c === -other.c && this.d === -other.d)
        );
    }

    /** LaTeX representation as a 2x2 pmatrix */
    toLatex() {
        return `\\begin{pmatrix} ${this.a} & ${this.b} \\\\ ${this.c} & ${this.d} \\end{pmatrix}`;
    }

    /** Readable string form */
    toString() {
        return `[[${this.a}, ${this.b}], [${this.c}, ${this.d}]]`;
    }

    /** The 2x2 identity matrix */
    static identity() {
        return new SL2Z(1, 0, 0, 1);
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Integer greatest common divisor (Euclidean algorithm) */
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a;
}

/** Simple primality test */
function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i * i <= n; i += 2) {
        if (n % i === 0) return false;
    }
    return true;
}

/**
 * Generator matrix A(p) for the convex cocompact subgroup.
 * A(p) = [[1 + 2p, 2], [p, 1]]
 * det = (1+2p)*1 - 2*p = 1+2p - 2p = 1.  Always in SL(2,Z).
 */
function matA(p) {
    return new SL2Z(1 + 2 * p, 2, p, 1);
}

/**
 * Generator matrix B(p) for the convex cocompact subgroup.
 * B(p) = [[1 + 2p, 2p], [1, 1]]
 * det = (1+2p)*1 - 2p*1 = 1.  Always in SL(2,Z).
 */
function matB(p) {
    return new SL2Z(1 + 2 * p, 2 * p, 1, 1);
}
