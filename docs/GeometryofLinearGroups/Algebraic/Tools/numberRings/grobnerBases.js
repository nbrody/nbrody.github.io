/**
 * grobnerBases.js
 * A JavaScript library for computing Grobner bases of polynomial ideals over Z
 * Implements Buchberger's algorithm with various monomial orderings
 * Uses integer arithmetic for Z-basis computation
 */

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function gcd(a, b) {
    a = Math.abs(Math.floor(a));
    b = Math.abs(Math.floor(b));
    while (b !== 0) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a === 0 ? 1 : a;
}

function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
}

function gcdArray(arr) {
    if (arr.length === 0) return 1;
    return arr.reduce((g, val) => gcd(g, Math.abs(val)), 0);
}

// =============================================================================
// MONOMIAL CLASS
// =============================================================================

class Monomial {
    constructor(exponents, coefficient = 1) {
        // exponents is an array [e1, e2, ..., en] representing x_1^e1 * x_2^e2 * ... * x_n^en
        // coefficient is an INTEGER
        this.exponents = exponents;
        this.coeff = Math.floor(coefficient);
    }

    degree() {
        return this.exponents.reduce((sum, e) => sum + e, 0);
    }

    numVars() {
        return this.exponents.length;
    }

    multiply(other) {
        // Ensure same number of variables
        const n = Math.max(this.numVars(), other.numVars());
        const newExponents = [];

        for (let i = 0; i < n; i++) {
            const e1 = i < this.exponents.length ? this.exponents[i] : 0;
            const e2 = i < other.exponents.length ? other.exponents[i] : 0;
            newExponents.push(e1 + e2);
        }

        return new Monomial(newExponents, this.coeff * other.coeff);
    }

    divide(other) {
        // Check if divisible (all exponents of this >= exponents of other)
        for (let i = 0; i < this.exponents.length; i++) {
            const e1 = this.exponents[i];
            const e2 = i < other.exponents.length ? other.exponents[i] : 0;
            if (e1 < e2) return null; // Not divisible
        }

        const newExponents = [];
        const n = Math.max(this.numVars(), other.numVars());

        for (let i = 0; i < n; i++) {
            const e1 = i < this.exponents.length ? this.exponents[i] : 0;
            const e2 = i < other.exponents.length ? other.exponents[i] : 0;
            newExponents.push(e1 - e2);
        }

        // For integer division, just return the monomial part (coefficient division handled elsewhere)
        return new Monomial(newExponents, 1);
    }

    monomialLcm(other) {
        // Least common multiple of two monomials (ignoring coefficients)
        const n = Math.max(this.numVars(), other.numVars());
        const newExponents = [];

        for (let i = 0; i < n; i++) {
            const e1 = i < this.exponents.length ? this.exponents[i] : 0;
            const e2 = i < other.exponents.length ? other.exponents[i] : 0;
            newExponents.push(Math.max(e1, e2));
        }

        return new Monomial(newExponents, 1);
    }

    equals(other) {
        if (this.numVars() !== other.numVars()) return false;

        for (let i = 0; i < this.exponents.length; i++) {
            if (this.exponents[i] !== other.exponents[i]) return false;
        }

        return true;
    }

    clone() {
        return new Monomial([...this.exponents], this.coeff);
    }

    toString(varNames = null) {
        if (this.coeff === 0) return '0';

        let result = '';
        const coeffStr = this.coeff.toString();

        // Check if this is just a constant
        const isConstant = this.exponents.every(e => e === 0);

        if (isConstant) {
            return coeffStr;
        }

        // Add coefficient if not 1 or -1
        if (this.coeff !== 1) {
            if (this.coeff === -1) {
                result = '-';
            } else {
                result = coeffStr + '*';
            }
        }

        // Add variables
        const terms = [];
        for (let i = 0; i < this.exponents.length; i++) {
            if (this.exponents[i] > 0) {
                const varName = varNames ? varNames[i] : `x_${i + 1}`;
                if (this.exponents[i] === 1) {
                    terms.push(varName);
                } else {
                    terms.push(`${varName}^${this.exponents[i]}`);
                }
            }
        }

        result += terms.join('*');
        return result || '1';
    }
}

// =============================================================================
// MULTIVARIATE POLYNOMIAL CLASS
// =============================================================================

class MultivariatePolynomial {
    constructor(monomials = [], numVars = 0) {
        // monomials is an array of Monomial objects
        this.terms = monomials;
        this.numVars = numVars;
        this._simplify();
    }

    _simplify() {
        // Combine like terms and remove zero terms
        const termMap = new Map();

        for (const term of this.terms) {
            const key = term.exponents.join(',');

            if (termMap.has(key)) {
                const existing = termMap.get(key);
                const newCoeff = existing.coeff + term.coeff;
                termMap.set(key, new Monomial(term.exponents, newCoeff));
            } else {
                termMap.set(key, term.clone());
            }
        }

        // Remove zero terms
        this.terms = Array.from(termMap.values()).filter(t => t.coeff !== 0);

        // Update numVars
        if (this.terms.length > 0) {
            this.numVars = Math.max(...this.terms.map(t => t.numVars()));
        }
    }

    isZero() {
        return this.terms.length === 0;
    }

    leadingTerm(ordering = 'lex') {
        if (this.isZero()) return null;

        // Sort terms and return the leading one
        const sorted = this._sortTerms(ordering);
        return sorted[0];
    }

    leadingMonomial(ordering = 'lex') {
        const lt = this.leadingTerm(ordering);
        return lt ? new Monomial(lt.exponents, 1) : null;
    }

    leadingCoefficient(ordering = 'lex') {
        const lt = this.leadingTerm(ordering);
        return lt ? lt.coeff : 0;
    }

    /**
     * Compute the content (GCD of all coefficients)
     */
    content() {
        if (this.isZero()) return 1;
        const coeffs = this.terms.map(t => Math.abs(t.coeff));
        return gcdArray(coeffs);
    }

    /**
     * Return the primitive part (polynomial divided by its content)
     */
    primitivePart() {
        const c = this.content();
        if (c === 1) return this.clone();

        const newTerms = this.terms.map(t =>
            new Monomial(t.exponents, t.coeff / c)
        );
        return new MultivariatePolynomial(newTerms, this.numVars);
    }

    /**
     * Make polynomial primitive (divide by content)
     */
    makePrimitive() {
        const c = this.content();
        if (c === 1) return this;

        for (let t of this.terms) {
            t.coeff = t.coeff / c;
        }
        return this;
    }

    _sortTerms(ordering = 'lex') {
        const comparator = MonomialOrdering.getComparator(ordering);
        return [...this.terms].sort((a, b) => comparator(b, a)); // Descending order
    }

    add(other) {
        const allTerms = [...this.terms, ...other.terms];
        return new MultivariatePolynomial(allTerms, Math.max(this.numVars, other.numVars));
    }

    subtract(other) {
        const negatedTerms = other.terms.map(t =>
            new Monomial(t.exponents, -t.coeff)
        );
        const allTerms = [...this.terms, ...negatedTerms];
        return new MultivariatePolynomial(allTerms, Math.max(this.numVars, other.numVars));
    }

    negate() {
        const negatedTerms = this.terms.map(t =>
            new Monomial(t.exponents, -t.coeff)
        );
        return new MultivariatePolynomial(negatedTerms, this.numVars);
    }

    multiplyScalar(scalar) {
        const newTerms = this.terms.map(t =>
            new Monomial(t.exponents, t.coeff * scalar)
        );
        return new MultivariatePolynomial(newTerms, this.numVars);
    }

    multiplyMonomial(monomial) {
        const newTerms = this.terms.map(t => t.multiply(monomial));
        return new MultivariatePolynomial(newTerms, this.numVars);
    }

    multiply(other) {
        const newTerms = [];

        for (const t1 of this.terms) {
            for (const t2 of other.terms) {
                newTerms.push(t1.multiply(t2));
            }
        }

        return new MultivariatePolynomial(newTerms, Math.max(this.numVars, other.numVars));
    }

    clone() {
        return new MultivariatePolynomial(this.terms.map(t => t.clone()), this.numVars);
    }

    toString(varNames = null) {
        if (this.isZero()) return '0';

        const sortedTerms = this._sortTerms('lex');
        const termStrings = [];

        for (let i = 0; i < sortedTerms.length; i++) {
            const termStr = sortedTerms[i].toString(varNames);

            if (i === 0) {
                termStrings.push(termStr);
            } else {
                if (sortedTerms[i].coeff > 0) {
                    termStrings.push('+ ' + termStr);
                } else {
                    // Coefficient is negative, already has minus sign
                    termStrings.push(termStr);
                }
            }
        }

        return termStrings.join(' ');
    }

    static parse(str, varNames = null) {
        // Parse a string like "x_1^2 + 2*x_1*x_2 - 3" into a MultivariatePolynomial
        str = str.replace(/\s+/g, '');

        // Replace ** with ^
        str = str.replace(/\*\*/g, '^');

        // Determine variable names and count
        const varSet = new Set();
        const varPattern = /x_(\d+)/g;
        let match;

        while ((match = varPattern.exec(str)) !== null) {
            varSet.add(parseInt(match[1]));
        }

        const maxVar = varSet.size > 0 ? Math.max(...varSet) : 0;
        const numVars = maxVar;

        // Split into terms
        str = str.replace(/-/g, '+-');
        const termStrs = str.split('+').filter(t => t.length > 0);

        const monomials = [];

        for (const termStr of termStrs) {
            const exponents = new Array(numVars).fill(0);
            let coeff = 1;

            // Parse coefficient
            const coeffMatch = termStr.match(/^-?\d+(\.\d+)?(\/\d+)?/);
            if (coeffMatch) {
                const coeffStr = coeffMatch[0];
                if (coeffStr.includes('/')) {
                    const parts = coeffStr.split('/');
                    coeff = parseFloat(parts[0]) / parseFloat(parts[1]);
                } else {
                    coeff = parseFloat(coeffStr);
                }
            } else if (termStr.startsWith('-')) {
                coeff = -1;
            }

            // Parse variables and exponents
            const varMatches = termStr.matchAll(/x_(\d+)(\^(\d+))?/g);
            for (const vm of varMatches) {
                const varIndex = parseInt(vm[1]) - 1;
                const exp = vm[3] ? parseInt(vm[3]) : 1;
                exponents[varIndex] = exp;
            }

            monomials.push(new Monomial(exponents, Math.floor(coeff)));
        }

        return new MultivariatePolynomial(monomials, numVars);
    }
}

// =============================================================================
// MONOMIAL ORDERINGS
// =============================================================================

class MonomialOrdering {
    /**
     * Lexicographic (lex) ordering
     */
    static lex(m1, m2) {
        const n = Math.max(m1.exponents.length, m2.exponents.length);

        for (let i = 0; i < n; i++) {
            const e1 = i < m1.exponents.length ? m1.exponents[i] : 0;
            const e2 = i < m2.exponents.length ? m2.exponents[i] : 0;

            if (e1 > e2) return 1;
            if (e1 < e2) return -1;
        }

        return 0;
    }

    /**
     * Graded lexicographic (grlex) ordering
     */
    static grlex(m1, m2) {
        const d1 = m1.degree();
        const d2 = m2.degree();

        if (d1 > d2) return 1;
        if (d1 < d2) return -1;

        return MonomialOrdering.lex(m1, m2);
    }

    /**
     * Graded reverse lexicographic (grevlex) ordering
     */
    static grevlex(m1, m2) {
        const d1 = m1.degree();
        const d2 = m2.degree();

        if (d1 > d2) return 1;
        if (d1 < d2) return -1;

        // Compare in reverse lexicographic order
        const n = Math.max(m1.exponents.length, m2.exponents.length);

        for (let i = n - 1; i >= 0; i--) {
            const e1 = i < m1.exponents.length ? m1.exponents[i] : 0;
            const e2 = i < m2.exponents.length ? m2.exponents[i] : 0;

            if (e1 < e2) return 1;
            if (e1 > e2) return -1;
        }

        return 0;
    }

    static getComparator(ordering) {
        switch (ordering.toLowerCase()) {
            case 'lex': return MonomialOrdering.lex;
            case 'grlex': return MonomialOrdering.grlex;
            case 'grevlex': return MonomialOrdering.grevlex;
            default: return MonomialOrdering.lex;
        }
    }
}

// =============================================================================
// POLYNOMIAL DIVISION
// =============================================================================

/**
 * Divide polynomial f by a set of polynomials G = {g1, g2, ..., gm}
 * For integer coefficients, we use pseudo-division to keep everything in Z
 * Returns {quotients: [q1, q2, ..., qm], remainder: r}
 */
function polynomialDivision(f, G, ordering = 'lex') {
    let p = f.clone();
    const quotients = G.map(() => new MultivariatePolynomial([], f.numVars));
    const numVars = f.numVars;

    while (!p.isZero()) {
        let divisionOccurred = false;

        for (let i = 0; i < G.length; i++) {
            const lt_p = p.leadingTerm(ordering);
            const lt_gi = G[i].leadingTerm(ordering);

            if (!lt_p || !lt_gi) continue;

            const lm_p = new Monomial(lt_p.exponents, 1);
            const lm_gi = new Monomial(lt_gi.exponents, 1);

            const quotientMonomial = lm_p.divide(lm_gi);

            if (quotientMonomial && lt_p.coeff % lt_gi.coeff === 0) {
                // Exact division possible (monomial divides and coefficient divides)
                const coeff = Math.floor(lt_p.coeff / lt_gi.coeff);
                const q = new Monomial(quotientMonomial.exponents, coeff);

                quotients[i] = quotients[i].add(new MultivariatePolynomial([q], numVars));
                p = p.subtract(G[i].multiplyMonomial(q));

                divisionOccurred = true;
                break;
            }
        }

        if (!divisionOccurred) {
            // Cannot divide, move leading term to remainder
            break;
        }
    }

    return {
        quotients: quotients,
        remainder: p
    };
}

// =============================================================================
// S-POLYNOMIAL
// =============================================================================

/**
 * Compute the S-polynomial of two polynomials f and g over Z
 * For integer arithmetic: S(f, g) = (lcm_coeff/lc(f)) * (lcm_mon/lm(f)) * f - (lcm_coeff/lc(g)) * (lcm_mon/lm(g)) * g
 * where lcm_coeff = lcm(lc(f), lc(g)) and lcm_mon = lcm(lm(f), lm(g))
 */
function sPolynomial(f, g, ordering = 'lex') {
    const lt_f = f.leadingTerm(ordering);
    const lt_g = g.leadingTerm(ordering);

    if (!lt_f || !lt_g) {
        return new MultivariatePolynomial([], f.numVars);
    }

    const lm_f = new Monomial(lt_f.exponents, 1);
    const lm_g = new Monomial(lt_g.exponents, 1);

    // LCM of monomials (ignoring coefficients)
    const monomialLcm = lm_f.monomialLcm(lm_g);

    const coeff_f = Math.abs(lt_f.coeff);
    const coeff_g = Math.abs(lt_g.coeff);

    // LCM of leading coefficients to ensure integer arithmetic
    const coeffLcm = lcm(coeff_f, coeff_g);

    // Compute multipliers
    const mult_f = coeffLcm / coeff_f;
    const mult_g = coeffLcm / coeff_g;

    // Compute monomial multipliers
    const m1 = monomialLcm.divide(lm_f);
    m1.coeff = mult_f;

    const m2 = monomialLcm.divide(lm_g);
    m2.coeff = mult_g;

    const term1 = f.multiplyMonomial(m1);
    const term2 = g.multiplyMonomial(m2);

    const result = term1.subtract(term2);

    // Make result primitive to keep coefficients small
    return result.primitivePart();
}

// =============================================================================
// BUCHBERGER'S ALGORITHM
// =============================================================================

/**
 * Compute a Grobner basis over Z for the ideal generated by polynomials F
 * using Buchberger's algorithm with integer arithmetic
 */
function buchberger(F, ordering = 'lex', options = {}) {
    const maxIterations = options.maxIterations || 1000;
    const verbose = options.verbose || false;

    // Initialize G with primitive parts of F
    let G = F.map(f => f.primitivePart());

    // Track statistics
    const stats = {
        iterations: 0,
        sPolynomialsComputed: 0,
        reductionsPerformed: 0,
        primitivizationsPerformed: 0
    };

    let pairs = [];

    // Generate all pairs
    for (let i = 0; i < G.length; i++) {
        for (let j = i + 1; j < G.length; j++) {
            pairs.push([i, j]);
        }
    }

    while (pairs.length > 0 && stats.iterations < maxIterations) {
        stats.iterations++;

        // Get next pair
        const [i, j] = pairs.shift();

        if (i >= G.length || j >= G.length) continue;

        // Compute S-polynomial
        const s = sPolynomial(G[i], G[j], ordering);
        stats.sPolynomialsComputed++;

        // Reduce S-polynomial by current basis
        const division = polynomialDivision(s, G, ordering);
        let r = division.remainder;
        stats.reductionsPerformed++;

        if (!r.isZero()) {
            // Make primitive
            r = r.primitivePart();
            stats.primitivizationsPerformed++;

            // Add new polynomial to basis
            const newIndex = G.length;
            G.push(r);

            // Add new pairs
            for (let k = 0; k < newIndex; k++) {
                pairs.push([k, newIndex]);
            }

            if (verbose) {
                console.log(`Added new polynomial: ${r.toString()}`);
            }
        }
    }

    // Minimal Grobner basis: remove polynomials whose leading term is divisible by another
    G = minimizeGrobnerBasis(G, ordering);

    // Reduced Grobner basis: make sure no term in any polynomial is divisible by leading term of another
    G = reduceGrobnerBasis(G, ordering);

    return {
        basis: G,
        stats: stats,
        ordering: ordering
    };
}

/**
 * Remove redundant polynomials from Grobner basis
 */
function minimizeGrobnerBasis(G, ordering = 'lex') {
    const result = [];

    for (let i = 0; i < G.length; i++) {
        const lt_i = G[i].leadingTerm(ordering);
        if (!lt_i) continue;

        let isRedundant = false;

        for (let j = 0; j < G.length; j++) {
            if (i === j) continue;

            const lt_j = G[j].leadingTerm(ordering);
            if (!lt_j) continue;

            const lm_i = new Monomial(lt_i.exponents, new Rational(1));
            const lm_j = new Monomial(lt_j.exponents, new Rational(1));

            if (lm_i.divide(lm_j)) {
                isRedundant = true;
                break;
            }
        }

        if (!isRedundant) {
            result.push(G[i]);
        }
    }

    return result;
}

/**
 * Make basis reduced: each polynomial is fully reduced with respect to others
 * For Z-basis, we keep integer coefficients (make primitive instead of monic)
 */
function reduceGrobnerBasis(G, ordering = 'lex') {
    const result = [];

    for (let i = 0; i < G.length; i++) {
        // Make polynomial primitive
        const primitive = G[i].primitivePart();

        // Reduce by other polynomials
        const others = G.filter((_, j) => j !== i);
        const division = polynomialDivision(primitive, others, ordering);

        // Make result primitive again
        const reduced = division.remainder.primitivePart();
        if (!reduced.isZero()) {
            result.push(reduced);
        }
    }

    return result;
}

// =============================================================================
// IDEAL OPERATIONS
// =============================================================================

/**
 * Check if polynomial f is in the ideal generated by G (Grobner basis)
 */
function isInIdeal(f, G, ordering = 'lex') {
    const division = polynomialDivision(f, G, ordering);
    return division.remainder.isZero();
}

/**
 * Compute the radical membership test
 * (requires computing a Grobner basis with an auxiliary variable)
 */
function isInRadical(f, F, ordering = 'lex') {
    // To test if f is in √I, check if 1 ∈ I + <1 - yf> where y is new variable
    // This is a simplified placeholder
    return false;
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Monomial,
        MultivariatePolynomial,
        MonomialOrdering,
        polynomialDivision,
        sPolynomial,
        buchberger,
        minimizeGrobnerBasis,
        reduceGrobnerBasis,
        isInIdeal
    };
}
