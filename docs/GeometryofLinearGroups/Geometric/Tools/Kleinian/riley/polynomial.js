// Polynomial class for operations
class Polynomial {
    constructor(coeffs) {
        // coeffs[i] is coefficient of z^i
        this.coeffs = coeffs.slice();
        this.trim();
    }

    trim() {
        while (this.coeffs.length > 1 && Math.abs(this.coeffs[this.coeffs.length - 1]) < 1e-10) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) {
            this.coeffs = [0];
        }
    }

    static fromConstant(c) {
        return new Polynomial([c]);
    }

    add(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = new Array(maxLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            result[i] += this.coeffs[i];
        }
        for (let i = 0; i < other.coeffs.length; i++) {
            result[i] += other.coeffs[i];
        }
        return new Polynomial(result);
    }

    subtract(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = new Array(maxLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            result[i] += this.coeffs[i];
        }
        for (let i = 0; i < other.coeffs.length; i++) {
            result[i] -= other.coeffs[i];
        }
        return new Polynomial(result);
    }

    multiply(other) {
        const result = new Array(this.coeffs.length + other.coeffs.length - 1).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }
        return new Polynomial(result);
    }

    toString() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (Math.abs(coeff) < 1e-10) continue;

            let term = '';
            const absCoeff = Math.abs(coeff);

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1) {
                    term = 'z';
                } else {
                    term = `${absCoeff}z`;
                }
            } else {
                if (absCoeff === 1) {
                    term = `z^${i}`;
                } else {
                    term = `${absCoeff}z^${i}`;
                }
            }

            if (coeff < 0) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }

    // Convert to LaTeX format for MathJax
    toLatex() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (Math.abs(coeff) < 1e-10) continue;

            let term = '';
            const absCoeff = Math.abs(coeff);

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1) {
                    term = 'z';
                } else {
                    term = `${absCoeff}z`;
                }
            } else {
                if (absCoeff === 1) {
                    term = `z^{${i}}`;
                } else {
                    term = `${absCoeff}z^{${i}}`;
                }
            }

            if (coeff < 0) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }

    // Evaluate polynomial at complex number z = re + im*i
    evaluateComplex(re, im) {
        let resultRe = 0;
        let resultIm = 0;
        let powerRe = 1;
        let powerIm = 0;

        for (let i = 0; i < this.coeffs.length; i++) {
            // Add coeff * power to result
            resultRe += this.coeffs[i] * powerRe;
            resultIm += this.coeffs[i] * powerIm;

            // Multiply power by z
            const newPowerRe = powerRe * re - powerIm * im;
            const newPowerIm = powerRe * im + powerIm * re;
            powerRe = newPowerRe;
            powerIm = newPowerIm;
        }

        return { re: resultRe, im: resultIm };
    }

    // Find roots using Durand-Kerner method
    findRoots() {
        const degree = this.coeffs.length - 1;
        if (degree < 1) return [];

        // Normalize polynomial (make it monic)
        const leadCoeff = this.coeffs[degree];
        if (Math.abs(leadCoeff) < 1e-10) return [];

        const p = this.coeffs.map(c => c / leadCoeff);

        // Special cases
        if (degree === 1) {
            return [{ re: -p[0], im: 0 }];
        }
        if (degree === 2) {
            const a = 1;
            const b = p[1];  // linear coefficient
            const c = p[0];  // constant term
            const discriminant = b * b - 4 * a * c;
            if (discriminant >= 0) {
                return [
                    { re: (-b + Math.sqrt(discriminant)) / (2 * a), im: 0 },
                    { re: (-b - Math.sqrt(discriminant)) / (2 * a), im: 0 }
                ];
            } else {
                const sqrtDisc = Math.sqrt(-discriminant);
                return [
                    { re: -b / (2 * a), im: sqrtDisc / (2 * a) },
                    { re: -b / (2 * a), im: -sqrtDisc / (2 * a) }
                ];
            }
        }

        // Durand-Kerner method for higher degrees
        let roots = [];
        // Better initial guesses - spread on a circle with radius based on coefficients
        const radius = 1 + Math.abs(p[0]);
        for (let i = 0; i < degree; i++) {
            const angle = (2 * Math.PI * i) / degree + 0.4;
            roots.push({
                re: radius * Math.cos(angle),
                im: radius * Math.sin(angle)
            });
        }

        const MAX_ITER = 200;
        const TOLERANCE = 1e-10;

        for (let iter = 0; iter < MAX_ITER; iter++) {
            let maxChange = 0;
            const newRoots = roots.map(root => ({ ...root }));

            for (let i = 0; i < degree; i++) {
                // Evaluate polynomial at roots[i]
                let p_val = this.evaluateComplex(roots[i].re, roots[i].im);

                // Compute denominator: product of (roots[i] - roots[j]) for j != i
                let denominator = { re: 1, im: 0 };
                for (let j = 0; j < degree; j++) {
                    if (i === j) continue;
                    const diff = {
                        re: roots[i].re - roots[j].re,
                        im: roots[i].im - roots[j].im
                    };
                    const newDenom = {
                        re: denominator.re * diff.re - denominator.im * diff.im,
                        im: denominator.re * diff.im + denominator.im * diff.re
                    };
                    denominator = newDenom;
                }

                // Divide p_val by denominator
                const den_mag_sq = denominator.re * denominator.re + denominator.im * denominator.im;
                if (den_mag_sq < 1e-15) continue;

                const correction = {
                    re: (p_val.re * denominator.re + p_val.im * denominator.im) / den_mag_sq,
                    im: (p_val.im * denominator.re - p_val.re * denominator.im) / den_mag_sq
                };

                newRoots[i].re -= correction.re;
                newRoots[i].im -= correction.im;

                const change = correction.re * correction.re + correction.im * correction.im;
                if (change > maxChange) maxChange = change;
            }

            roots = newRoots;
            if (Math.sqrt(maxChange) < TOLERANCE) break;
        }

        // Filter out roots that don't actually satisfy p(z) ≈ 0
        const validRoots = [];
        const ERROR_THRESHOLD = 1e-3; // More lenient for high-degree polynomials

        for (const root of roots) {
            const val = this.evaluateComplex(root.re, root.im);
            const magnitude = Math.sqrt(val.re * val.re + val.im * val.im);
            if (magnitude < ERROR_THRESHOLD) {
                validRoots.push(root);
            }
        }

        return validRoots;
    }

    // Polynomial division: returns {quotient, remainder}
    divide(divisor) {
        let remainder = [...this.coeffs];
        const quotientCoeffs = [];

        while (remainder.length >= divisor.coeffs.length) {
            const coeff = remainder[remainder.length - 1] / divisor.coeffs[divisor.coeffs.length - 1];
            quotientCoeffs.push(coeff);

            for (let i = 0; i < divisor.coeffs.length; i++) {
                remainder[remainder.length - divisor.coeffs.length + i] -= coeff * divisor.coeffs[i];
            }
            remainder.pop();
        }

        quotientCoeffs.reverse();
        return {
            quotient: new Polynomial(quotientCoeffs.length > 0 ? quotientCoeffs : [0]),
            remainder: new Polynomial(remainder.length > 0 ? remainder : [0])
        };
    }

    // Simple factorization using rational root theorem
    factorOverIntegers() {
        const allInteger = this.coeffs.every(c => Math.abs(c - Math.round(c)) < 1e-9);
        if (!allInteger) return null;

        const intCoeffs = this.coeffs.map(c => Math.round(c));
        const degree = intCoeffs.length - 1;

        if (degree === 0) return [{ coeffs: intCoeffs, multiplicity: 1 }];
        if (degree === 1) return [{ coeffs: intCoeffs, multiplicity: 1 }];

        // Extract content
        function gcdTwo(a, b) {
            a = Math.abs(a);
            b = Math.abs(b);
            while (b) [a, b] = [b, a % b];
            return a;
        }

        let content = intCoeffs.reduce((a, b) => gcdTwo(a, b));
        const primitiveCoeffs = intCoeffs.map(c => c / content);
        let poly = new Polynomial(primitiveCoeffs);

        const factors = [];
        const a0 = Math.abs(Math.round(poly.coeffs[0]));

        function getDivisors(n) {
            if (n === 0) return [1];
            const divs = [];
            for (let i = 1; i <= Math.min(Math.abs(n), 100); i++) {
                if (n % i === 0) divs.push(i);
            }
            return divs;
        }

        // Try rational roots
        for (const num of getDivisors(a0)) {
            for (const sign of [1, -1]) {
                const r = sign * num;
                const val = poly.evaluateComplex(r, 0);

                if (Math.abs(val.re) < 1e-6 && Math.abs(val.im) < 1e-6) {
                    const factor = new Polynomial([-r, 1]);
                    let mult = 0;

                    while (true) {
                        const { quotient, remainder } = poly.divide(factor);
                        if (remainder.coeffs.length === 1 && Math.abs(remainder.coeffs[0]) < 1e-6) {
                            mult++;
                            poly = new Polynomial(quotient.coeffs.map(c => Math.round(c)));
                        } else {
                            break;
                        }
                    }

                    if (mult > 0) {
                        factors.push({ coeffs: [-r, 1], multiplicity: mult });
                    }
                }
            }
        }

        // Add remaining polynomial
        if (poly.coeffs.length > 1) {
            factors.push({ coeffs: poly.coeffs.map(c => Math.round(c)), multiplicity: 1 });
        }

        // Include content
        if (Math.abs(content) > 1) {
            factors.unshift({ coeffs: [content], multiplicity: 1 });
        }

        return factors.length > 0 ? factors : null;
    }

    // Format factorization as LaTeX
    formatFactorization() {
        const factors = this.factorOverIntegers();
        if (!factors) {
            return null;
        }

        const degree = this.coeffs.length - 1;
        const leadCoeff = Math.round(this.coeffs[degree]);

        let latex = '';

        // Add leading coefficient if not ±1
        if (Math.abs(leadCoeff) !== 1) {
            latex = leadCoeff.toString();
        } else if (leadCoeff === -1) {
            latex = '-';
        }

        for (const factor of factors) {
            const c = factor.coeffs;

            if (c.length === 1) {
                // Constant
                if (c[0] !== 1 || factors.length === 1) {
                    latex += c[0].toString();
                }
            } else if (c.length === 2) {
                // Linear: c[0] + c[1]*z
                const a0 = c[0];
                const a1 = c[1];

                if (a1 === 1) {
                    if (a0 === 0) {
                        latex += 'z';
                    } else if (a0 > 0) {
                        latex += `(z - ${a0})`;
                    } else {
                        latex += `(z + ${-a0})`;
                    }
                } else if (a1 === -1) {
                    if (a0 === 0) {
                        latex += '(-z)';
                    } else if (a0 > 0) {
                        latex += `(${a0} - z)`;
                    } else {
                        latex += `(-z - ${-a0})`;
                    }
                } else {
                    // General linear with coefficient != ±1
                    latex += `(${a1}z`;
                    if (a0 !== 0) {
                        if (a0 > 0) {
                            latex += ` + ${a0}`;
                        } else {
                            latex += ` - ${-a0}`;
                        }
                    }
                    latex += ')';
                }

                if (factor.multiplicity > 1) {
                    latex += `^{${factor.multiplicity}}`;
                }
            } else {
                // General polynomial (quadratic or higher)
                // Format as (a_n*z^n + ... + a_1*z + a_0)
                const poly = new Polynomial(c);
                latex += `(${poly.toLatex()})`;

                if (factor.multiplicity > 1) {
                    latex += `^{${factor.multiplicity}}`;
                }
            }
        }

        return latex || null;
    }
}


// --- Helper Math Functions ---

/**
 * Computes the greatest common divisor of a and b.
 */
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
}

/**
 * Reduces a fraction p/q to its lowest terms.
 */
function reduceFraction(p, q) {
    const g = gcd(p, q);
    return { p: p / g, q: q / g };
}

/**
 * Checks if two fractions p1/q1 and p2/q2 are Farey neighbors.
 */
function areFareyNeighbors(p1, q1, p2, q2) {
    return Math.abs(p2 * q1 - p1 * q2) === 1;
}

/**
 * Traces the path from the root (0/1, 1/1) to p/q in the Stern-Brocot tree.
 */
function buildFareyPath(p, q) {
    if (q === 0) return [];
    if (p === 0 && q === 1) return [{ p: 0, q: 1, word: 'L' }];
    if (p === 1 && q === 1) return [{ p: 1, q: 1, word: 'R' }];

    let left = { p: 0, q: 1, word: 'L' };
    let right = { p: 1, q: 1, word: 'R' };
    const pathNodes = [left, right];

    // Iteratively find mediants until we hit target p/q
    while (true) {
        const med_p = left.p + right.p;
        const med_q = left.q + right.q;

        const mediant = {
            p: med_p,
            q: med_q,
            word: left.word + right.word,
            leftParent: { ...left },
            rightParent: { ...right }
        };

        pathNodes.push(mediant);

        if (med_p === p && med_q === q) break;

        // Decide which branch to follow
        if (p * med_q < med_p * q) {
            // Target is to the left of mediant
            right = mediant;
        } else {
            // Target is to the right of mediant
            left = mediant;
        }

        // Safety break
        if (pathNodes.length > 500) break;
    }

    return pathNodes;
}

// --- Riley Polynomial Computation Core ---

const polynomialCache = new Map();
const matrixWordCache = new Map();

/**
 * Computes the Riley polynomial Q(p/q) recursively using the Farey tree rule.
 */
function getRileyPolynomial(p, q) {
    const key = `${p}/${q}`;
    if (polynomialCache.has(key)) {
        return polynomialCache.get(key);
    }

    // Base cases
    if (p === 0 && q === 1) {
        const poly = new Polynomial([2, 0, -1]); // 2 - z^2
        polynomialCache.set(key, poly);
        matrixWordCache.set(key, 'L');
        return poly;
    }
    if (p === 1 && q === 1) {
        const poly = new Polynomial([2, 0, 1]); // 2 + z^2
        polynomialCache.set(key, poly);
        matrixWordCache.set(key, 'R');
        return poly;
    }
    if (p === 1 && q === 2) {
        const poly = new Polynomial([2, 0, 0, 0, 1]); // 2 + z^4
        polynomialCache.set(key, poly);
        matrixWordCache.set(key, 'LR');
        return poly;
    }

    // Recursion using Farey neighbors
    const target = reduceFraction(p, q);
    const path = buildFareyPath(target.p, target.q);
    if (path.length > 0) {
        const node = path[path.length - 1];
        if (node.leftParent && node.rightParent) {
            const Q1 = getRileyPolynomial(node.leftParent.p, node.leftParent.q);
            const Q2 = getRileyPolynomial(node.rightParent.p, node.rightParent.q);

            const diffP = Math.abs(node.rightParent.p - node.leftParent.p);
            const diffQ = Math.abs(node.rightParent.q - node.leftParent.q);
            const diffReduced = reduceFraction(diffP, diffQ);
            const Q3 = getRileyPolynomial(diffReduced.p, diffReduced.q);

            // Recursion rule: Q(med) = 8 - Q(L)Q(R) - Q(diff)
            const product = Q1.multiply(Q2);
            const sum = product.add(Q3);
            const result = Polynomial.fromConstant(8).subtract(sum);

            polynomialCache.set(key, result);
            matrixWordCache.set(key, node.word);
            return result;
        }
    }

    return null;
}

/**
 * Returns the Farey word associated with the fraction p/q.
 */
function getMatrixWord(p, q) {
    const key = `${p}/${q}`;
    if (matrixWordCache.has(key)) return matrixWordCache.get(key);
    getRileyPolynomial(p, q);
    return matrixWordCache.get(key) || null;
}

/**
 * Multiplies two matrices with polynomial entries.
 */
function multiplySymbolicMatrices(M1, M2) {
    return [
        [M1[0][0].multiply(M2[0][0]).add(M1[0][1].multiply(M2[1][0])), M1[0][0].multiply(M2[0][1]).add(M1[0][1].multiply(M2[1][1]))],
        [M1[1][0].multiply(M2[0][0]).add(M1[1][1].multiply(M2[1][0])), M1[1][0].multiply(M2[0][1]).add(M1[1][1].multiply(M2[1][1]))]
    ];
}

/**
 * Computes the symbolic matrix for a given Farey word.
 */
function computeMatrixFromWord(word) {
    const L = [
        [Polynomial.fromConstant(1), Polynomial.fromConstant(0)],
        [new Polynomial([0, 1]), Polynomial.fromConstant(1)] // z
    ];
    const R = [
        [Polynomial.fromConstant(1), new Polynomial([0, 1])], // z
        [Polynomial.fromConstant(0), Polynomial.fromConstant(1)]
    ];

    let result = [
        [Polynomial.fromConstant(1), Polynomial.fromConstant(0)],
        [Polynomial.fromConstant(0), Polynomial.fromConstant(1)]
    ];

    for (const char of word) {
        if (char === 'L') result = multiplySymbolicMatrices(result, L);
        else if (char === 'R') result = multiplySymbolicMatrices(result, R);
    }
    return result;
}

/**
 * Formats a symbolic matrix for LaTeX rendering.
 */
function formatMatrixLatex(matrix) {
    return `\\begin{pmatrix}${matrix[0][0].toLatex()} & ${matrix[0][1].toLatex()} \\\\ ${matrix[1][0].toLatex()} & ${matrix[1][1].toLatex()}\\end{pmatrix}`;
}

// --- Node.js Exports ---
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Polynomial,
        gcd,
        reduceFraction,
        areFareyNeighbors,
        buildFareyPath,
        getRileyPolynomial,
        getMatrixWord,
        computeMatrixFromWord,
        formatMatrixLatex
    };
}
