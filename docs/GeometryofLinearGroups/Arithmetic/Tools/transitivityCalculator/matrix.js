// Helper function for gcd
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a || 1;
}

// 2x2 Matrix class for projective transformations
class Matrix2x2 {
    constructor(a, b, c, d) {
        this.a = a instanceof Fraction ? a : parseFraction(a.toString());
        this.b = b instanceof Fraction ? b : parseFraction(b.toString());
        this.c = c instanceof Fraction ? c : parseFraction(c.toString());
        this.d = d instanceof Fraction ? d : parseFraction(d.toString());
    }

    multiply(other) {
        return new Matrix2x2(
            this.a.multiply(other.a).add(this.b.multiply(other.c)),
            this.a.multiply(other.b).add(this.b.multiply(other.d)),
            this.c.multiply(other.a).add(this.d.multiply(other.c)),
            this.c.multiply(other.b).add(this.d.multiply(other.d))
        );
    }

    determinant() {
        return this.a.multiply(this.d).add(this.b.multiply(this.c).negate());
    }

    inverse() {
        const det = this.determinant();
        return new Matrix2x2(
            this.d.divide(det),
            this.b.negate().divide(det),
            this.c.negate().divide(det),
            this.a.divide(det)
        );
    }

    apply(p, q) {
        // Apply matrix to projective point [p:q]
        // Returns [p':q'] in lowest terms (gcd(p',q') = 1)
        const p_frac = p instanceof Fraction ? p : new Fraction(p, 1);
        const q_frac = q instanceof Fraction ? q : new Fraction(q, 1);

        let newP = this.a.multiply(p_frac).add(this.b.multiply(q_frac));
        let newQ = this.c.multiply(p_frac).add(this.d.multiply(q_frac));

        // Reduce [newP : newQ] to lowest terms
        // Both are fractions, so we need gcd of numerators after finding common denominator
        const gcdVal = gcd(Math.abs(newP.num * newQ.den), Math.abs(newQ.num * newP.den));

        if (gcdVal > 1) {
            // The gcd of the projective coordinates
            // We need to divide both by their common factor
            // For fractions p/pd and q/qd, the gcd is gcd(p*qd, q*pd) / (pd*qd)

            // Simpler: just compute gcd of numerators when in same denominator
            const commonDen = newP.den * newQ.den;
            const p_num = newP.num * newQ.den;
            const q_num = newQ.num * newP.den;
            const projGcd = gcd(Math.abs(p_num), Math.abs(q_num));

            if (projGcd > 1) {
                newP = new Fraction(p_num / projGcd, commonDen);
                newQ = new Fraction(q_num / projGcd, commonDen);
            }
        }

        return [newP, newQ];
    }

    toString() {
        return `[[${this.a}, ${this.b}], [${this.c}, ${this.d}]]`;
    }

    toTeX() {
        return `\\begin{pmatrix} ${this.a} & ${this.b} \\\\ ${this.c} & ${this.d} \\end{pmatrix}`;
    }
}

function height(p, q) {
    // Height of [p:q] where gcd(p,q) = 1 (coprime)
    // For [p:q] with gcd(p,q)=1, height = max(|p|, |q|)

    if (q.den === 0) return Math.abs(p.num); // [p:0] has height |p|
    if (p.den === 0) return Math.abs(q.num); // [1:0] has height 1

    // Assumes p and q are already in lowest terms (as Fractions)
    // and that gcd(p.num, q.num) = 1
    return Math.max(Math.abs(p.num), Math.abs(q.num));
}
