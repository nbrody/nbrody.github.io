/**
 * Burau Representation Engine for B_n  (general n-strand braid group)
 * 
 * The reduced Burau representation sends σ_i to an (n-1)×(n-1) matrix over 
 * Z[t,t^{-1}].  We represent Laurent polynomials as objects 
 * { coeffs: Map<int, int> } where the key is the exponent of t and the value
 * is the integer coefficient.
 *
 * When a quotient ring Z[t,t^{-1}]/(p(t)) is chosen, we reduce modulo p(t)
 * after every operation, bounding the polynomial degree.
 */

// ============================================================
//  Laurent Polynomial Arithmetic
// ============================================================

class LaurentPoly {
    /**
     * @param {Map<number,number>|Object} coeffs - Map from exponent to coefficient
     */
    constructor(coeffs) {
        if (coeffs instanceof Map) {
            this.coeffs = new Map(coeffs);
        } else if (typeof coeffs === 'object' && !(coeffs instanceof Map)) {
            // Allow {exp: coeff, ...} notation
            this.coeffs = new Map();
            for (const [k, v] of Object.entries(coeffs)) {
                if (v !== 0) this.coeffs.set(parseInt(k), v);
            }
        } else {
            this.coeffs = new Map();
        }
        this._cleanup();
    }

    _cleanup() {
        for (const [k, v] of this.coeffs) {
            if (v === 0) this.coeffs.delete(k);
        }
    }

    static zero() {
        return new LaurentPoly(new Map());
    }

    static one() {
        return new LaurentPoly(new Map([[0, 1]]));
    }

    static t(exp = 1) {
        return new LaurentPoly(new Map([[exp, 1]]));
    }

    static fromInt(n) {
        if (n === 0) return LaurentPoly.zero();
        return new LaurentPoly(new Map([[0, n]]));
    }

    isZero() {
        return this.coeffs.size === 0;
    }

    isOne() {
        return this.coeffs.size === 1 && this.coeffs.get(0) === 1;
    }

    equals(other) {
        if (this.coeffs.size !== other.coeffs.size) return false;
        for (const [k, v] of this.coeffs) {
            if (other.coeffs.get(k) !== v) return false;
        }
        return true;
    }

    clone() {
        return new LaurentPoly(new Map(this.coeffs));
    }

    get(exp) {
        return this.coeffs.get(exp) || 0;
    }

    add(other) {
        const result = new Map(this.coeffs);
        for (const [k, v] of other.coeffs) {
            result.set(k, (result.get(k) || 0) + v);
        }
        return new LaurentPoly(result);
    }

    sub(other) {
        return this.add(other.neg());
    }

    neg() {
        const result = new Map();
        for (const [k, v] of this.coeffs) {
            result.set(k, -v);
        }
        return new LaurentPoly(result);
    }

    mul(other) {
        const result = new Map();
        for (const [k1, v1] of this.coeffs) {
            for (const [k2, v2] of other.coeffs) {
                const exp = k1 + k2;
                result.set(exp, (result.get(exp) || 0) + v1 * v2);
            }
        }
        return new LaurentPoly(result);
    }

    /** Multiply by a scalar integer */
    scale(n) {
        if (n === 0) return LaurentPoly.zero();
        const result = new Map();
        for (const [k, v] of this.coeffs) {
            result.set(k, v * n);
        }
        return new LaurentPoly(result);
    }

    /** Multiply by t^n */
    shift(n) {
        const result = new Map();
        for (const [k, v] of this.coeffs) {
            result.set(k + n, v);
        }
        return new LaurentPoly(result);
    }

    /** Min and max exponents */
    degree() {
        if (this.isZero()) return { min: 0, max: 0 };
        const exps = [...this.coeffs.keys()];
        return { min: Math.min(...exps), max: Math.max(...exps) };
    }

    /** Leading coefficient (highest exponent) */
    leadingCoeff() {
        if (this.isZero()) return 0;
        const { max } = this.degree();
        return this.get(max);
    }

    /** L1 norm: sum of absolute values of coefficients */
    l1Norm() {
        let s = 0;
        for (const v of this.coeffs.values()) {
            s += Math.abs(v);
        }
        return s;
    }

    /** Convert to a standard polynomial (shift so min exp = 0) */
    toStandardPoly() {
        if (this.isZero()) return new LaurentPoly(new Map());
        const { min } = this.degree();
        return this.shift(-min);
    }

    /** Pretty print */
    toString() {
        if (this.isZero()) return '0';
        const exps = [...this.coeffs.keys()].sort((a, b) => b - a);
        const parts = [];
        for (const e of exps) {
            const c = this.coeffs.get(e);
            if (c === 0) continue;
            let term = '';
            const absC = Math.abs(c);
            if (parts.length > 0) {
                term += c > 0 ? ' + ' : ' − ';
            } else if (c < 0) {
                term += '−';
            }
            if (e === 0) {
                term += String(absC);
            } else {
                if (absC !== 1) term += String(absC);
                term += 't';
                if (e !== 1) term += `^{${e}}`;
            }
            parts.push(term);
        }
        return parts.join('') || '0';
    }

    /** LaTeX representation */
    toLatex() {
        if (this.isZero()) return '0';
        const exps = [...this.coeffs.keys()].sort((a, b) => b - a);
        const parts = [];
        for (const e of exps) {
            const c = this.coeffs.get(e);
            if (c === 0) continue;
            let term = '';
            const absC = Math.abs(c);
            if (parts.length > 0) {
                term += c > 0 ? ' + ' : ' - ';
            } else if (c < 0) {
                term += '-';
            }
            if (e === 0) {
                term += String(absC);
            } else {
                if (absC !== 1) term += String(absC);
                term += 't';
                if (e === -1) term += '^{-1}';
                else if (e !== 1) term += `^{${e}}`;
            }
            parts.push(term);
        }
        return parts.join('') || '0';
    }
}


// ============================================================
//  Quotient Ring: Z[t,t^{-1}] / (p(t))
// ============================================================

class QuotientRing {
    /**
     * @param {LaurentPoly} modPoly - The polynomial p(t) to mod by. 
     *   Must be a standard polynomial (non-negative exponents only, monic preferred).
     * @param {string} name - Display name
     */
    constructor(modPoly, name) {
        this.modPoly = modPoly;
        this.name = name;
        this.modDeg = modPoly.degree().max;
    }

    /** Reduce a Laurent poly mod the modPoly.
     *  First convert to standard form, then polynomial division.
     */
    reduce(p) {
        if (p.isZero()) return LaurentPoly.zero();

        // First: handle negative exponents by multiplying by t^|minExp|
        // Since t is invertible mod p(t), we need to find t^{-1} mod p(t).
        // For simplicity in the quotient ring, we represent elements as
        // polynomials of degree < deg(modPoly).

        // Shift to standard form
        const { min } = p.degree();
        let work = min < 0 ? p.shift(-min) : p.clone();

        // Now reduce: while deg(work) >= deg(modPoly), subtract
        const modDeg = this.modDeg;
        const lc = this.modPoly.leadingCoeff();

        // Standard polynomial long division (assuming monic modPoly for integer arithmetic)
        let maxIter = 500;
        while (maxIter-- > 0) {
            const { max } = work.degree();
            if (work.isZero() || max < modDeg) break;
            const topCoeff = work.get(max);
            // If monic, we can subtract directly; if not monic, we need exact division
            if (lc === 1 || lc === -1) {
                const shift = max - modDeg;
                const subtrahend = this.modPoly.shift(shift).scale(lc === 1 ? topCoeff : -topCoeff);
                work = work.sub(subtrahend);
            } else {
                // Non-monic: scale work by lc, subtract, but this changes the element
                // For integer coefficients with non-monic modulus, we do coefficient-wise mod
                // This is an approximation; ideally modPoly should be monic
                const shift = max - modDeg;
                const q = Math.round(topCoeff / lc);
                const subtrahend = this.modPoly.shift(shift).scale(q);
                work = work.sub(subtrahend);
                // If we can't reduce further, break
                const newMax = work.degree().max;
                if (newMax >= max) break;
            }
        }

        // Handle negative exponent shifts: multiply by t^{-1} ≡ (modPoly - leading) / lc
        // Actually, t^{-1} mod p(t): if p(t) = t^n + a_{n-1}t^{n-1} + ... + a_0,
        // then t * t^{n-1} = t^n ≡ -(a_{n-1}t^{n-1} + ... + a_0) mod p(t)
        // so t^{-1} ≡ -(1/a_0)(t^{n-1} + a_{n-1}/a_0 * t^{n-2} + ...)
        // This only works when a_0 is ±1. For general case we stay in Z[t].
        if (min < 0) {
            // We need to multiply by t^{min} effectively, i.e. by (t^{-1})^|min|
            // t^{-1} mod p(t):
            const a0 = this.modPoly.get(0);
            if (a0 === 1 || a0 === -1) {
                // t^{-1} ≡ (-1/a0) * (p(t) - t^n) / t
                // = (-1/a0) * sum_{i=0}^{n-1} a_i * t^{i-1}
                // = (-1/a0) * (a_0/t + a_1 + a_2*t + ... + a_{n-1}*t^{n-2})
                // Hmm, this still has t^{-1}. Let's use: 
                // t * q(t) ≡ 1 mod p(t)
                // From p(t) = t^n + ... + a0, we get:
                // t^n ≡ -(a_{n-1}t^{n-1} + ... + a_0) mod p(t)
                // So t^{-1} * a_0 ≡ -(t^{n-1} + a_{n-1}t^{n-2} + ... + a_1) mod p(t)
                // t^{-1} ≡ -(1/a_0)(t^{n-1} + a_{n-1}*t^{n-2} + ... + a_1)
                let tInvCoeffs = new Map();
                for (let i = 1; i <= this.modDeg; i++) {
                    const coeff = this.modPoly.get(i);
                    tInvCoeffs.set(i - 1, -a0 * coeff); // since 1/a0 = a0 when a0 = ±1
                }
                // Wait: 1/a0 = a0 when a0=1, and 1/a0 = -1 when a0=-1
                // Actually 1/a0 in integers: if a0=1 => 1/a0=1; if a0=-1 => 1/a0=-1
                const tInv = new LaurentPoly(tInvCoeffs).scale(a0 === 1 ? -1 : 1);

                // Apply t^{-|min|} by repeated multiplication
                for (let j = 0; j < -min; j++) {
                    work = this.reduce(work.mul(this.reduce(tInv)));
                }
            }
            // If a0 is not ±1, we just leave it (can't invert t in Z[t]/(p(t)) generally)
        }

        return work;
    }

    /** Reduce all entries of a matrix */
    reduceMatrix(mat) {
        const n = mat.length;
        const result = [];
        for (let i = 0; i < n; i++) {
            result[i] = [];
            for (let j = 0; j < n; j++) {
                result[i][j] = this.reduce(mat[i][j]);
            }
        }
        return result;
    }
}


// ============================================================
//  Matrix operations over LaurentPoly
// ============================================================

function matMul(A, B, ring = null) {
    const n = A.length;
    const result = [];
    for (let i = 0; i < n; i++) {
        result[i] = [];
        for (let j = 0; j < n; j++) {
            let sum = LaurentPoly.zero();
            for (let k = 0; k < n; k++) {
                sum = sum.add(A[i][k].mul(B[k][j]));
            }
            result[i][j] = ring ? ring.reduce(sum) : sum;
        }
    }
    return result;
}

function matIdentity(n) {
    const I = [];
    for (let i = 0; i < n; i++) {
        I[i] = [];
        for (let j = 0; j < n; j++) {
            I[i][j] = i === j ? LaurentPoly.one() : LaurentPoly.zero();
        }
    }
    return I;
}

function matEquals(A, B) {
    const n = A.length;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (!A[i][j].equals(B[i][j])) return false;
        }
    }
    return true;
}

/** L1 norm of a matrix: sum of L1 norms of all entries */
function matL1Norm(M) {
    let s = 0;
    for (let i = 0; i < M.length; i++) {
        for (let j = 0; j < M[i].length; j++) {
            s += M[i][j].l1Norm();
        }
    }
    return s;
}

/** Distance from the identity: L1 norm of (M - I) */
function matDistFromIdentity(M) {
    const n = M.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const entry = i === j ? M[i][j].sub(LaurentPoly.one()) : M[i][j];
            s += entry.l1Norm();
        }
    }
    return s;
}

/** Serialize a matrix to a canonical string for hashing */
function matToString(M) {
    const parts = [];
    for (let i = 0; i < M.length; i++) {
        for (let j = 0; j < M[i].length; j++) {
            const poly = M[i][j];
            if (poly.isZero()) {
                parts.push('0');
            } else {
                const exps = [...poly.coeffs.keys()].sort((a, b) => a - b);
                parts.push(exps.map(e => `${e}:${poly.get(e)}`).join(','));
            }
        }
    }
    return parts.join('|');
}

/** Pretty print matrix as LaTeX */
function matToLatex(M) {
    const n = M.length;
    let s = '\\begin{pmatrix} ';
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            s += M[i][j].toLatex();
            if (j < n - 1) s += ' & ';
        }
        if (i < n - 1) s += ' \\\\ ';
    }
    s += ' \\end{pmatrix}';
    return s;
}


// ============================================================
//  Reduced Burau Representation for B_n  (general n-strand)
// ============================================================

/**
 *  The reduced Burau representation ψ: B_n → GL_{n-1}(Z[t,t^{-1}])
 *
 *  For B_n, we get (n-1)×(n-1) matrices.
 *  
 *  Using the Birman convention on the free module with basis e_1,…,e_{n-1}:
 *    σ_i(e_j) = e_j                     if j ≠ i-1, i, i+1
 *    σ_i(e_{i-1}) = e_{i-1} + t·e_i     (if i > 1)
 *    σ_i(e_i) = -t·e_i
 *    σ_i(e_{i+1}) = e_i + e_{i+1}        (if i < n-1)
 *
 *  The inverse σ_i^{-1} is obtained by replacing t with t^{-1}:
 *    σ_i⁻¹(e_j) = e_j                         if j ≠ i-1, i, i+1
 *    σ_i⁻¹(e_{i-1}) = e_{i-1} + e_i            (if i > 1)
 *    σ_i⁻¹(e_i) = -t^{-1}·e_i
 *    σ_i⁻¹(e_{i+1}) = t^{-1}·e_i + e_{i+1}     (if i < n-1)
 */

const t = LaurentPoly.t(1);        // t
const tInv = LaurentPoly.t(-1);    // t^{-1}
const one = LaurentPoly.one();     // 1
const zero = LaurentPoly.zero();   // 0

/** Current strand count — mutable, defaults to 4 */
let _numStrands = 4;

/** Get the current strand count */
function getStrandCount() { return _numStrands; }

/** Set the strand count (also triggers generator rebuild upstream) */
function setStrandCount(n) { _numStrands = n; }

/** Unicode subscript for a digit */
function subscriptDigit(n) {
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).split('').map(d => subs[parseInt(d)]).join('');
}

/**
 * Build the reduced Burau generators for B_n.
 * @param {number} [n] — number of strands (defaults to _numStrands)
 * @returns {{ generators: Array, inverseMap: Object }}
 */
function makeBurauGenerators(n) {
    n = n || _numStrands;
    const dim = n - 1; // matrix size
    const negT = t.neg();         // -t
    const negTinv = tInv.neg();   // -t^{-1}

    const generators = [];
    const inverseMap = {};

    for (let i = 1; i <= n - 1; i++) {
        // Build σ_i  (dim × dim matrix)
        const sigma = [];
        const sigmaInv = [];
        for (let r = 0; r < dim; r++) {
            sigma[r] = [];
            sigmaInv[r] = [];
            for (let c = 0; c < dim; c++) {
                sigma[r][c] = (r === c) ? one.clone() : zero.clone();
                sigmaInv[r][c] = (r === c) ? one.clone() : zero.clone();
            }
        }

        // Row i-1 (0-indexed): e_i → -t·e_i
        const row = i - 1; // 0-indexed row for σ_i
        sigma[row][row] = negT.clone();        // diagonal: -t
        sigmaInv[row][row] = negTinv.clone();  // diagonal: -t^{-1}

        // σ_i(e_{i-1}) = e_{i-1} + t·e_i   →  column (i-2) gets t at row (i-1)
        //   i.e. matrix[row][row-1] += t   (if i > 1)
        if (i > 1) {
            sigma[row][row - 1] = t.clone();       // M[i-1][i-2] = t
            sigmaInv[row][row - 1] = one.clone();  // M⁻¹[i-1][i-2] = 1
        }

        // σ_i(e_{i+1}) = e_i + e_{i+1}  →  column (i) gets 1 at row (i-1)
        //   i.e. matrix[row][row+1] += 1   (if i < n-1, i.e. row+1 < dim)
        if (row + 1 < dim) {
            sigma[row][row + 1] = one.clone();       // M[i-1][i] = 1
            sigmaInv[row][row + 1] = tInv.clone();   // M⁻¹[i-1][i] = t^{-1}
        }

        const fwdSym = `s${i}`;
        const invSym = `S${i}`;
        const fwdName = `σ${subscriptDigit(i)}`;
        const invName = `σ${subscriptDigit(i)}⁻¹`;

        generators.push({ name: fwdName, symbol: fwdSym, matrix: sigma });
        generators.push({ name: invName, symbol: invSym, matrix: sigmaInv });

        inverseMap[fwdSym] = invSym;
        inverseMap[invSym] = fwdSym;
    }

    // Re-order: all forward generators first, then all inverses
    const fwd = generators.filter(g => g.symbol[0] === 's');
    const inv = generators.filter(g => g.symbol[0] === 'S');

    return {
        generators: [...fwd, ...inv],
        inverseMap
    };
}


// ============================================================
//  Predefined Quotient Rings
// ============================================================

function getQuotientRings() {
    return [
        {
            name: 'Z[t,t⁻¹]  (no quotient — full Laurent)',
            value: 'none',
            modPoly: null
        },
        {
            name: 'Z[t]/(t − 1) ≅ Z  (t = 1, permutation rep)',
            value: 't-1',
            modPoly: new LaurentPoly(new Map([[1, 1], [0, -1]])) // t - 1
        },
        {
            name: 'Z[t]/(t + 1) ≅ Z  (t = −1)',
            value: 't+1',
            modPoly: new LaurentPoly(new Map([[1, 1], [0, 1]])) // t + 1
        },
        {
            name: 'Z[t]/(t² + 1)  (t = i)',
            value: 't2+1',
            modPoly: new LaurentPoly(new Map([[2, 1], [0, 1]])) // t² + 1
        },
        {
            name: 'Z[t]/(t² + t + 1)  (t = ω, cube root of unity)',
            value: 't2+t+1',
            modPoly: new LaurentPoly(new Map([[2, 1], [1, 1], [0, 1]])) // t² + t + 1
        },
        {
            name: 'Z[t]/(t² − t + 1)  (t = −ω)',
            value: 't2-t+1',
            modPoly: new LaurentPoly(new Map([[2, 1], [1, -1], [0, 1]]))
        },
        {
            name: 'Z[t]/(t³ − 1)  (t³ = 1)',
            value: 't3-1',
            modPoly: new LaurentPoly(new Map([[3, 1], [0, -1]])) // t³ - 1
        },
        {
            name: 'Z[t]/(t⁴ − 1)  (t⁴ = 1)',
            value: 't4-1',
            modPoly: new LaurentPoly(new Map([[4, 1], [0, -1]]))
        },
        {
            name: 'Z[t]/(t² − 2)  (t = √2)',
            value: 't2-2',
            modPoly: new LaurentPoly(new Map([[2, 1], [0, -2]]))
        },
        {
            name: 'Z[t]/(Φ₅(t)) = Z[t]/(t⁴+t³+t²+t+1)',
            value: 'phi5',
            modPoly: new LaurentPoly(new Map([[4, 1], [3, 1], [2, 1], [1, 1], [0, 1]]))
        },
    ];
}


// ============================================================
//  Polynomial Parser
// ============================================================

/**
 * Parse a polynomial string into a LaurentPoly.
 * Accepts formats like:
 *   "t^3 - 2t + 1"
 *   "t^2+t+1"
 *   "3t^4 - t^2 + 7"
 *   "t^2 - 2"
 *   "-t^3 + 1"
 *   "t^{-1} + 1"  (LaTeX-style exponents also accepted)
 *
 * Returns { poly: LaurentPoly, error: string|null }
 */
function parsePoly(str) {
    try {
        str = str.trim();
        if (!str) return { poly: null, error: 'Empty input' };

        // Normalize: remove spaces around operators but keep signs
        // First, strip all spaces
        let s = str.replace(/\s+/g, '');

        // Handle LaTeX-style exponents: t^{-2} → t^-2
        s = s.replace(/\^\{([^}]+)\}/g, '^$1');

        // Tokenize into terms by splitting on + or - (keeping the sign)
        // Insert a '+' before each '-' that isn't at the start or after '^'
        // Strategy: walk through and split
        const terms = [];
        let current = '';
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if ((ch === '+' || ch === '-') && i > 0 && s[i - 1] !== '^') {
                if (current.trim()) terms.push(current.trim());
                current = ch;
            } else {
                current += ch;
            }
        }
        if (current.trim()) terms.push(current.trim());

        const coeffs = new Map();

        for (const term of terms) {
            let t = term;

            // Check if term contains 't'
            const hasT = t.includes('t');

            if (!hasT) {
                // Pure constant
                const val = parseInt(t);
                if (isNaN(val)) return { poly: null, error: `Cannot parse constant "${t}"` };
                coeffs.set(0, (coeffs.get(0) || 0) + val);
                continue;
            }

            // Has 't' — parse coefficient and exponent
            // Possible forms: t, -t, 2t, -3t, t^2, -t^3, 2t^-1, etc.
            const tIdx = t.indexOf('t');
            let coeffStr = t.substring(0, tIdx);
            let expStr = t.substring(tIdx + 1);

            // Parse coefficient
            let coeff;
            if (coeffStr === '' || coeffStr === '+') coeff = 1;
            else if (coeffStr === '-') coeff = -1;
            else {
                // Remove trailing '*' if present (e.g., "2*t")
                coeffStr = coeffStr.replace(/\*$/, '');
                coeff = parseInt(coeffStr);
                if (isNaN(coeff)) return { poly: null, error: `Cannot parse coefficient "${coeffStr}"` };
            }

            // Parse exponent
            let exp;
            if (expStr === '') {
                exp = 1;
            } else if (expStr.startsWith('^')) {
                exp = parseInt(expStr.substring(1));
                if (isNaN(exp)) return { poly: null, error: `Cannot parse exponent "${expStr.substring(1)}"` };
            } else {
                return { poly: null, error: `Unexpected after 't': "${expStr}"` };
            }

            coeffs.set(exp, (coeffs.get(exp) || 0) + coeff);
        }

        const poly = new LaurentPoly(coeffs);
        return { poly, error: null };
    } catch (e) {
        return { poly: null, error: e.message };
    }
}


// ============================================================
//  Exports
// ============================================================

export {
    LaurentPoly,
    QuotientRing,
    parsePoly,
    matMul,
    matIdentity,
    matEquals,
    matL1Norm,
    matDistFromIdentity,
    matToString,
    matToLatex,
    makeBurauGenerators,
    getQuotientRings,
    getStrandCount,
    setStrandCount
};
