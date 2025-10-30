// Fraction Explorer - Find parabolic words using continued fraction algorithm with exact arithmetic

// Rational number operations
class Rational {
    constructor(p, q) {
        if (q === 0) {
            this.isInfinity = true;
            this.p = 0;
            this.q = 0;
        } else {
            this.isInfinity = false;
            // Reduce to lowest terms
            const g = gcd(Math.abs(p), Math.abs(q));
            this.p = p / g;
            this.q = q / g;
            // Keep denominator positive
            if (this.q < 0) {
                this.p = -this.p;
                this.q = -this.q;
            }
        }
    }

    static infinity() {
        const r = new Rational(0, 1);
        r.isInfinity = true;
        return r;
    }

    static zero() {
        return new Rational(0, 1);
    }

    isZero() {
        return !this.isInfinity && this.p === 0;
    }

    add(other) {
        if (this.isInfinity || other.isInfinity) return Rational.infinity();
        return new Rational(this.p * other.q + other.p * this.q, this.q * other.q);
    }

    multiply(other) {
        if (this.isInfinity || other.isInfinity) return Rational.infinity();
        return new Rational(this.p * other.p, this.q * other.q);
    }

    negate() {
        if (this.isInfinity) return Rational.infinity();
        return new Rational(-this.p, this.q);
    }

    invert() {
        if (this.isInfinity) return Rational.zero();
        if (this.p === 0) return Rational.infinity();
        return new Rational(this.q, this.p);
    }

    toString() {
        if (this.isInfinity) return '∞';
        if (this.q === 1) return this.p.toString();
        return `${this.p}/${this.q}`;
    }

    toDecimal() {
        if (this.isInfinity) return Infinity;
        return this.p / this.q;
    }
}

// Rational number class using BigInt for exact arithmetic
class RationalBig {
    constructor(p, q) {
        if (q === 0n) {
            throw new Error("Division by zero");
        }
        const g = gcdBig(p < 0n ? -p : p, q < 0n ? -q : q);
        this.p = p / g;
        this.q = q / g;
        // Keep denominator positive
        if (this.q < 0n) {
            this.p = -this.p;
            this.q = -this.q;
        }
    }

    add(other) {
        return new RationalBig(this.p * other.q + other.p * this.q, this.q * other.q);
    }

    multiply(other) {
        return new RationalBig(this.p * other.p, this.q * other.q);
    }

    toDecimal() {
        return Number(this.p) / Number(this.q);
    }

    toString() {
        if (this.q === 1n) return this.p.toString();
        return `${this.p}/${this.q}`;
    }

    toLatexFraction() {
        if (this.q === 1n) return this.p.toString();
        const sign = this.p < 0n ? '-' : '';
        const absP = this.p < 0n ? -this.p : this.p;
        return `${sign}\\frac{${absP}}{${this.q}}`;
    }
}

// GCD for BigInt
function gcdBig(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
        const temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// Matrix multiplication for 2x2 matrices with RationalBig entries
function multiplyMatricesBig(A, B) {
    return [
        [
            A[0][0].multiply(B[0][0]).add(A[0][1].multiply(B[1][0])),
            A[0][0].multiply(B[0][1]).add(A[0][1].multiply(B[1][1]))
        ],
        [
            A[1][0].multiply(B[0][0]).add(A[1][1].multiply(B[1][0])),
            A[1][0].multiply(B[0][1]).add(A[1][1].multiply(B[1][1]))
        ]
    ];
}

// Matrix power using BigInt rationals
function matrixPowerBig(T_p, T_q, n) {
    // T = [[1, p/q], [0, 1]]
    // T^n = [[1, n*p/q], [0, 1]]
    const one = new RationalBig(1n, 1n);
    const zero = new RationalBig(0n, 1n);
    const nBig = BigInt(n);
    const tpBig = BigInt(T_p);
    const tqBig = BigInt(T_q);

    const topRight = new RationalBig(nBig * tpBig, tqBig);

    return [
        [one, topRight],
        [zero, one]
    ];
}

// Find parabolic words using branching continued fraction algorithm
function findParabolicWord(p, q, maxSteps = 5000) {
    // State: { exponents, currentPoint, step, trace }
    const initialPoint = new Rational(-q, p);
    const initialState = {
        exponents: [1],
        currentPoint: initialPoint,
        step: 1,
        trace: [{ step: 0, point: initialPoint, exponent: 1, action: `Start: S T S(∞) = ${initialPoint.toString()}` }]
    };

    const completedPaths = []; // Store all converged words
    const queue = [initialState]; // BFS queue

    while (queue.length > 0 && completedPaths.length < 100) { // Limit to 100 words
        const state = queue.shift();
        const { exponents, currentPoint, step, trace } = state;

        if (step >= maxSteps) continue;

        // Check if we hit 0 exactly - S maps 0 to infinity, so we're done!
        if (currentPoint.isZero()) {
            const newTrace = [...trace, { step, point: currentPoint, exponent: null, action: `Point is exactly 0. Applying S maps to ∞ (converged!)` }];
            completedPaths.push({ exponents, trace: newTrace, converged: true });
            continue;
        }

        // Find the three n values that translate currentPoint closest to 0
        // T^n(z) = z + n*(p/q), so we want z + n*(p/q) ≈ 0, thus n ≈ -z*q/p
        const numeratorForN = -currentPoint.p * q;
        const denominatorForN = currentPoint.q * p;
        const nExact = numeratorForN / denominatorForN;
        const nCenter = Math.round(nExact);

        // Three candidates: nCenter-1, nCenter, nCenter+1 (but never 0)
        const candidates = [nCenter - 1, nCenter, nCenter + 1].filter(n => n !== 0);

        // Branch into three paths
        for (const n of candidates) {
            const newExponents = [...exponents, n];

            // T^n(z) = z + n*(p/q)
            const translation = new Rational(n * p, q);
            const translatedPoint = currentPoint.add(translation);

            let newTrace = [...trace];
            if (n === 0) {
                newTrace.push({ step, point: translatedPoint, exponent: 0, action: `Apply T^{0} (identity): point stays at ${currentPoint.toString()}` });
            } else {
                newTrace.push({ step, point: translatedPoint, exponent: n, action: `Apply T^{${n}}: translate by ${translation.toString()} → ${translatedPoint.toString()}` });
            }

            // Check if we hit 0 exactly
            if (translatedPoint.isZero()) {
                newTrace.push({ step: step + 0.5, point: Rational.infinity(), exponent: null, action: `Apply S: 0 → ∞ (converged!)` });
                completedPaths.push({ exponents: newExponents, trace: newTrace, converged: true });
                continue;
            }

            // Apply S: z -> -1/z
            const invertedPoint = translatedPoint.invert().negate();
            newTrace.push({ step: step + 0.5, point: invertedPoint, exponent: null, action: `Apply S: ${translatedPoint.toString()} → ${invertedPoint.toString()}` });

            // Check if we've reached infinity (convergence)
            if (invertedPoint.isInfinity) {
                newTrace.push({ step: step + 1, point: invertedPoint, exponent: null, action: `Reached ∞ (converged!)` });
                completedPaths.push({ exponents: newExponents, trace: newTrace, converged: true });
                continue;
            }

            // Add this state to the queue for further exploration
            queue.push({
                exponents: newExponents,
                currentPoint: invertedPoint,
                step: step + 1,
                trace: newTrace
            });
        }
    }

    // Sort completed paths by length (number of exponents)
    completedPaths.sort((a, b) => a.exponents.length - b.exponents.length);

    // Build words and matrices for all completed paths
    const results = completedPaths.map(path => {
        const { exponents, trace } = path;

        // Build the word from the exponents
        let word = 'S';
        for (let i = exponents.length - 1; i >= 0; i--) {
            const n = exponents[i];
            word = `S T^{${n}} ` + word;
        }

        // Compute the matrix using exact BigInt arithmetic
        const one = new RationalBig(1n, 1n);
        const zero = new RationalBig(0n, 1n);
        const negOne = new RationalBig(-1n, 1n);

        // S matrix with BigInt rationals
        const SBig = [
            [zero, negOne],
            [one, zero]
        ];

        let matrix = [
            [one, zero],
            [zero, one]
        ]; // Start with identity

        // Multiply matrices from left to right
        for (let i = exponents.length - 1; i >= 0; i--) {
            const n = exponents[i];
            // Apply S
            matrix = multiplyMatricesBig(matrix, SBig);
            // Apply T^n
            const Tn = matrixPowerBig(p, q, n);
            matrix = multiplyMatricesBig(matrix, Tn);
        }
        // Apply final S
        matrix = multiplyMatricesBig(matrix, SBig);

        return { word, matrix, exponents, trace, converged: true, length: exponents.length };
    });

    return results;
}

// Convert decimal to fraction
function decimalToFraction(decimal, maxDenominator = 10000000000) {
    if (Math.abs(decimal) < 1e-10) return { numerator: 0, denominator: 1 };
    if (Math.abs(decimal - Math.round(decimal)) < 1e-10) {
        return { numerator: Math.round(decimal), denominator: 1 };
    }

    const sign = decimal < 0 ? -1 : 1;
    decimal = Math.abs(decimal);

    let bestNumerator = Math.round(decimal);
    let bestDenominator = 1;
    let bestError = Math.abs(decimal - bestNumerator);

    for (let denominator = 2; denominator <= maxDenominator; denominator++) {
        const numerator = Math.round(decimal * denominator);
        const error = Math.abs(decimal - numerator / denominator);

        if (error < bestError) {
            bestNumerator = numerator;
            bestDenominator = denominator;
            bestError = error;
        }

        if (error < 1e-10) break;
    }

    return { numerator: sign * bestNumerator, denominator: bestDenominator };
}

// Format numeric matrix for LaTeX display (works with RationalBig)
function formatNumericMatrixLatex(M) {
    const format = (val) => {
        // val is a RationalBig object
        return val.toLatexFraction();
    };

    return `\\begin{pmatrix}${format(M[0][0])} & ${format(M[0][1])} \\\\ ${format(M[1][0])} & ${format(M[1][1])}\\end{pmatrix}`;
}

// Calculate and display results
function calculateExplorer() {
    const p = parseInt(document.getElementById('explorerNumerator').value);
    const q = parseInt(document.getElementById('explorerDenominator').value);
    const maxSteps = parseInt(document.getElementById('explorerMaxSteps').value) || 5000;
    const resultsDiv = document.getElementById('explorerResults');

    if (isNaN(p) || isNaN(q) || q <= 0 || p < 0) {
        resultsDiv.innerHTML = '<p class="error">Please enter valid non-negative integers with q > 0.</p>';
        return;
    }

    if (isNaN(maxSteps) || maxSteps < 10) {
        resultsDiv.innerHTML = '<p class="error">Max steps must be at least 10.</p>';
        return;
    }

    const reduced = reduceFraction(p, q);
    const results = findParabolicWord(reduced.p, reduced.q, maxSteps);

    let html = '<div class="polynomial-display">';
    html += `<h3>Parabolic Words for \\(\\frac{${reduced.p}}{${reduced.q}}\\)</h3>`;

    if (results.length > 0) {
        html += `<p style="color: #d1d5db; margin: 15px 0;">Using the branching continued fraction algorithm, we found <strong>${results.length}</strong> parabolic word${results.length > 1 ? 's' : ''} (sorted by length):</p>`;

        // Display each result
        results.forEach((result, index) => {
            html += `<div style="margin: 25px 0; padding: 20px; background: rgba(17, 24, 39, 0.4); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px;">`;
            html += `<h4 style="color: #93c5fd; margin-top: 0;">Word ${index + 1} (length ${result.length})</h4>`;

            html += `<div style="font-size: 18px; text-align: center; margin: 20px 0; padding: 15px; background: rgba(17, 24, 39, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;">`;
            html += `\\[${result.word}\\]`;
            html += `</div>`;

            html += `<p style="color: #d1d5db; margin-top: 20px;"><strong>Resulting Matrix:</strong></p>`;
            html += `<div style="text-align: center; margin: 15px 0;">\\[${formatNumericMatrixLatex(result.matrix)}\\]</div>`;

            // Check if upper triangular
            const isUpperTriangular = result.matrix[1][0].p === 0n;
            if (isUpperTriangular) {
                html += `<p style="color: #4ade80; text-align: center; font-weight: 600;">✓ Matrix is upper triangular!</p>`;
            } else {
                html += `<p style="color: #fbbf24; text-align: center;">Note: Matrix is not upper triangular (lower-left entry: ${result.matrix[1][0].toString()})</p>`;
            }

            // Display algorithm trace only for the first word to avoid clutter
            if (index === 0) {
                html += '<div style="margin-top: 25px;">';
                html += '<h4 style="color: #f3f4f6;">Algorithm Trace (for first word):</h4>';
                html += '<div style="font-family: monospace; font-size: 13px; background: rgba(17, 24, 39, 0.6); padding: 15px; border-radius: 6px; max-height: 300px; overflow-y: auto;">';
                result.trace.forEach(t => {
                    html += `<div style="margin: 5px 0; color: #9ca3af;">${t.action}</div>`;
                });
                html += '</div></div>';
            }

            html += `</div>`;
        });
    } else {
        html += `<p class="error">Algorithm did not converge within ${maxSteps} steps. Try increasing the max steps limit.</p>`;
    }

    html += '</div>';

    if (p !== reduced.p || q !== reduced.q) {
        html += `<p style="margin-top: 10px; color: #9ca3af; font-size: 14px;">Note: Reduced from ${p}/${q} to ${reduced.p}/${reduced.q}</p>`;
    }

    resultsDiv.innerHTML = html;

    // Typeset MathJax
    if (window.MathJax) {
        MathJax.typesetPromise([resultsDiv]).catch((err) => console.log('MathJax typeset error:', err));
    }
}

// Polynomial class for symbolic computation with BigInt coefficients
class PolyBig {
    constructor(coeffs) {
        // coeffs[i] is coefficient of t^i
        this.coeffs = coeffs.map(c => BigInt(c));
        this.trim();
    }

    trim() {
        while (this.coeffs.length > 1 && this.coeffs[this.coeffs.length - 1] === 0n) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) {
            this.coeffs = [0n];
        }
    }

    static zero() {
        return new PolyBig([0n]);
    }

    static constant(c) {
        return new PolyBig([c]);
    }

    degree() {
        return this.coeffs.length - 1;
    }

    isZero() {
        return this.coeffs.length === 1 && this.coeffs[0] === 0n;
    }

    // Check if this polynomial divides other (i.e., other % this === 0)
    divides(other) {
        try {
            const remainder = other.mod(this);
            const result = remainder.isZero();
            return result;
        } catch (error) {
            console.error('Error in divides:', error);
            return false;
        }
    }

    // Polynomial division: returns { quotient, remainder }
    divMod(divisor) {
        if (divisor.isZero()) {
            throw new Error("Division by zero polynomial");
        }

        let remainder = new PolyBig(this.coeffs);
        let quotient = PolyBig.zero();

        const divisorDegree = divisor.degree();
        const divisorLeadCoeff = divisor.coeffs[divisorDegree];

        while (remainder.degree() >= divisorDegree && !remainder.isZero()) {
            const remainderDegree = remainder.degree();
            const remainderLeadCoeff = remainder.coeffs[remainderDegree];

            // Check if division is exact
            if (remainderLeadCoeff % divisorLeadCoeff !== 0n) {
                // Not exactly divisible
                break;
            }

            const quotCoeff = remainderLeadCoeff / divisorLeadCoeff;
            const quotDegree = remainderDegree - divisorDegree;

            // Add to quotient
            while (quotient.coeffs.length <= quotDegree) {
                quotient.coeffs.push(0n);
            }
            quotient.coeffs[quotDegree] += quotCoeff;

            // Subtract divisor * quotCoeff * t^quotDegree from remainder
            for (let i = 0; i <= divisorDegree; i++) {
                remainder.coeffs[i + quotDegree] -= divisor.coeffs[i] * quotCoeff;
            }

            remainder.trim();
        }

        quotient.trim();
        return { quotient, remainder };
    }

    mod(divisor) {
        return this.divMod(divisor).remainder;
    }

    toString() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (coeff === 0n) continue;

            let term = '';
            const absCoeff = coeff < 0n ? -coeff : coeff;

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1n) {
                    term = 't';
                } else {
                    term = `${absCoeff}t`;
                }
            } else {
                if (absCoeff === 1n) {
                    term = `t^${i}`;
                } else {
                    term = `${absCoeff}t^${i}`;
                }
            }

            if (coeff < 0n) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }

    toLatex() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (coeff === 0n) continue;

            let term = '';
            const absCoeff = coeff < 0n ? -coeff : coeff;

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1n) {
                    term = 't';
                } else {
                    term = `${absCoeff}t`;
                }
            } else {
                if (absCoeff === 1n) {
                    term = `t^{${i}}`;
                } else {
                    term = `${absCoeff}t^{${i}}`;
                }
            }

            if (coeff < 0n) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }
}

// Parse polynomial from string like "7t - 5" or "t^2 - 3t + 2"
function parsePolynomial(str) {
    str = str.trim().toLowerCase();

    // Remove all spaces
    str = str.replace(/\s+/g, '');

    // Replace ** with ^ for convenience
    str = str.replace(/\*\*/g, '^');

    // Parse terms by splitting on + and - (keeping the signs)
    const terms = [];
    let currentTerm = '';
    for (let i = 0; i < str.length; i++) {
        if ((str[i] === '+' || str[i] === '-') && i > 0) {
            terms.push(currentTerm);
            currentTerm = str[i] === '-' ? '-' : '';
        } else {
            currentTerm += str[i];
        }
    }
    if (currentTerm) terms.push(currentTerm);

    // Parse each term
    const coeffs = {};
    for (const term of terms) {
        if (!term || term === '+' || term === '-') continue;

        let coeff = 1;
        let degree = 0;

        if (term.includes('t')) {
            const parts = term.split('t');

            // Coefficient part
            if (parts[0] === '' || parts[0] === '+') {
                coeff = 1;
            } else if (parts[0] === '-') {
                coeff = -1;
            } else {
                coeff = parseInt(parts[0]);
                if (isNaN(coeff)) {
                    throw new Error(`Invalid coefficient: ${parts[0]}`);
                }
            }

            // Degree part
            if (parts[1] === '') {
                degree = 1;
            } else if (parts[1].startsWith('^')) {
                degree = parseInt(parts[1].substring(1));
                if (isNaN(degree)) {
                    throw new Error(`Invalid degree: ${parts[1]}`);
                }
            } else {
                throw new Error(`Invalid term format: ${term}`);
            }
        } else {
            // Constant term
            coeff = parseInt(term);
            if (isNaN(coeff)) {
                throw new Error(`Invalid constant: ${term}`);
            }
            degree = 0;
        }

        coeffs[degree] = (coeffs[degree] || 0) + coeff;
    }

    // Convert to coefficient array
    const maxDegree = Math.max(...Object.keys(coeffs).map(k => parseInt(k)));
    const coeffArray = new Array(maxDegree + 1).fill(0);
    for (const [deg, coeff] of Object.entries(coeffs)) {
        coeffArray[parseInt(deg)] = coeff;
    }

    return new PolyBig(coeffArray);
}

// Matrix class with polynomial entries
class MatrixPoly {
    constructor(entries) {
        // entries is [[a, b], [c, d]] where each is a PolyBig
        this.entries = entries;
    }

    static identity() {
        return new MatrixPoly([
            [PolyBig.constant(1n), PolyBig.zero()],
            [PolyBig.zero(), PolyBig.constant(1n)]
        ]);
    }

    multiply(other) {
        // Multiply two 2x2 matrices with polynomial entries
        const a = this.entries;
        const b = other.entries;

        return new MatrixPoly([
            [
                polyAdd(polyMultiply(a[0][0], b[0][0]), polyMultiply(a[0][1], b[1][0])),
                polyAdd(polyMultiply(a[0][0], b[0][1]), polyMultiply(a[0][1], b[1][1]))
            ],
            [
                polyAdd(polyMultiply(a[1][0], b[0][0]), polyMultiply(a[1][1], b[1][0])),
                polyAdd(polyMultiply(a[1][0], b[0][1]), polyMultiply(a[1][1], b[1][1]))
            ]
        ]);
    }

    getBottomLeft() {
        return this.entries[1][0];
    }
}

// Polynomial arithmetic helpers
function polyAdd(p1, p2) {
    const maxLen = Math.max(p1.coeffs.length, p2.coeffs.length);
    const result = new Array(maxLen).fill(0n);
    for (let i = 0; i < p1.coeffs.length; i++) {
        result[i] += p1.coeffs[i];
    }
    for (let i = 0; i < p2.coeffs.length; i++) {
        result[i] += p2.coeffs[i];
    }
    return new PolyBig(result);
}

function polyMultiply(p1, p2) {
    const result = new Array(p1.coeffs.length + p2.coeffs.length - 1).fill(0n);
    for (let i = 0; i < p1.coeffs.length; i++) {
        for (let j = 0; j < p2.coeffs.length; j++) {
            result[i + j] += p1.coeffs[i] * p2.coeffs[j];
        }
    }
    return new PolyBig(result);
}

// Find matrices whose bottom-left entry is divisible by P(t)
function findMatrixForPolynomial(P, maxSteps = 5000) {
    // We work symbolically with matrices in Z[t]
    // S = [[0, -1], [1, 0]]
    // T = [[1, t], [0, 1]]

    const S = new MatrixPoly([
        [PolyBig.zero(), PolyBig.constant(-1n)],
        [PolyBig.constant(1n), PolyBig.zero()]
    ]);

    // T^n = [[1, n*t], [0, 1]]
    function matrixT(n) {
        return new MatrixPoly([
            [PolyBig.constant(1n), new PolyBig([0n, BigInt(n)])], // n*t
            [PolyBig.zero(), PolyBig.constant(1n)]
        ]);
    }

    // Test: compute S T S manually
    const testMatrix = S.multiply(matrixT(1)).multiply(S);
    console.log('Test S T S matrix bottom-left:', testMatrix.getBottomLeft().toString());

    // Start with exponents = [1]
    const initialState = {
        exponents: [1],
        matrix: S.multiply(matrixT(1)).multiply(S),
        step: 1
    };

    const completedPaths = [];
    const queue = [initialState];
    const seenBottomLeft = new Set(); // To avoid duplicate results

    console.log('Starting BFS with initial bottom-left:', initialState.matrix.getBottomLeft().toString());
    console.log('Looking for multiples of P(t) =', P.toString());

    let iterations = 0;
    while (queue.length > 0 && completedPaths.length < 20) {
        iterations++;
        const state = queue.shift();
        const { exponents, matrix, step } = state;

        if (step > 10) continue; // Limit depth for now

        const bottomLeft = matrix.getBottomLeft();

        if (iterations <= 10) {
            console.log(`Step ${step}, exponents: [${exponents}], bottom-left: ${bottomLeft.toString()}`);
        }

        // Check if P divides the bottom-left entry
        if (P.divides(bottomLeft)) {
            console.log('FOUND! Bottom-left', bottomLeft.toString(), 'is divisible by', P.toString());
            const blString = bottomLeft.toString();
            if (!seenBottomLeft.has(blString)) {
                seenBottomLeft.add(blString);
                completedPaths.push({ exponents, matrix, converged: true, length: exponents.length });
            }
            continue;
        }

        // Heuristic for choosing n based on the bottom-left polynomial
        // For linear P(t) = qt - p, we want to find n such that after applying S T^n,
        // the resulting bottom-left entry has a better chance of being divisible by P.

        // Strategy: The bottom-left entry grows in degree, and we want to make it
        // a multiple of P. For a simple heuristic, try values around the current step.
        let nCenter = 1;

        // For finding multiples of P, we need to try a wider range
        // Start with candidates around small values
        let candidates = [];
        if (step <= 3) {
            // Early steps: try small values extensively
            candidates = [0, 1, 2, 3, 4, 5];
        } else {
            // Later steps: use narrower range
            nCenter = Math.max(0, step - 2);
            candidates = [nCenter, nCenter + 1, nCenter + 2];
        }

        candidates = candidates.filter(n => n >= 0);

        for (const n of candidates) {
            const newExponents = [...exponents, n];

            // Apply S T^n to the current matrix (multiply on the left)
            const newMatrix = S.multiply(matrixT(n)).multiply(matrix);

            queue.push({
                exponents: newExponents,
                matrix: newMatrix,
                step: step + 1
            });
        }
    }

    // Sort by length
    completedPaths.sort((a, b) => a.length - b.length);

    // Build results
    const results = completedPaths.map(path => {
        const { exponents, matrix } = path;

        // Build word
        let word = 'S';
        for (let i = exponents.length - 1; i >= 0; i--) {
            const n = exponents[i];
            word = `S T^{${n}} ` + word;
        }

        return { word, matrix, exponents, converged: true, length: exponents.length };
    });

    return results;
}

// Format polynomial matrix entry for LaTeX
function formatPolyMatrixLatex(M) {
    const format = (poly) => poly.toLatex();

    return `\\\\begin{pmatrix}${format(M.entries[0][0])} & ${format(M.entries[0][1])} \\\\\\\\ ${format(M.entries[1][0])} & ${format(M.entries[1][1])}\\\\end{pmatrix}`;
}

// Calculate polynomial results
function calculatePolynomial() {
    try {
        console.log('calculatePolynomial START');
        const polyInput = document.getElementById('polynomialInput').value;
        const maxSteps = parseInt(document.getElementById('polyMaxSteps').value) || 5000;
        const resultsDiv = document.getElementById('polyResults');

        console.log('calculatePolynomial called with input:', polyInput);

    if (!polyInput || polyInput.trim() === '') {
        resultsDiv.innerHTML = '<p class="error">Please enter a polynomial.</p>';
        return;
    }

    if (isNaN(maxSteps) || maxSteps < 10) {
        resultsDiv.innerHTML = '<p class="error">Max steps must be at least 10.</p>';
        return;
    }

    let P;
    try {
        P = parsePolynomial(polyInput);
        console.log('Parsed polynomial:', P.toString());
    } catch (error) {
        resultsDiv.innerHTML = `<p class="error">Error parsing polynomial: ${error.message}</p>`;
        console.error('Error parsing polynomial:', error);
        return;
    }

    console.log('Calling findMatrixForPolynomial...');
    const results = findMatrixForPolynomial(P, maxSteps);
    console.log('Found', results.length, 'results');

    let html = '<div class="polynomial-display">';
    html += `<h3>Matrices for \\(P(t) = ${P.toLatex()}\\)</h3>`;

    if (results.length > 0) {
        html += `<p style="color: #d1d5db; margin: 15px 0;">Found <strong>${results.length}</strong> matrix${results.length > 1 ? 'ces' : ''} whose bottom-left entry is divisible by \\(P(t)\\) (sorted by word length):</p>`;

        results.forEach((result, index) => {
            html += `<div style="margin: 25px 0; padding: 20px; background: rgba(17, 24, 39, 0.4); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px;">`;
            html += `<h4 style="color: #93c5fd; margin-top: 0;">Word ${index + 1} (length ${result.length})</h4>`;

            html += `<div style="font-size: 18px; text-align: center; margin: 20px 0; padding: 15px; background: rgba(17, 24, 39, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;">`;
            html += `\\[${result.word}\\]`;
            html += `</div>`;

            html += `<p style="color: #d1d5db; margin-top: 20px;"><strong>Resulting Matrix:</strong></p>`;
            html += `<div style="text-align: center; margin: 15px 0;">\\[${formatPolyMatrixLatex(result.matrix)}\\]</div>`;

            // Check divisibility
            const bottomLeft = result.matrix.getBottomLeft();
            html += `<p style="color: #d1d5db; margin-top: 15px;"><strong>Bottom-left entry:</strong> \\(${bottomLeft.toLatex()}\\)</p>`;

            if (P.divides(bottomLeft)) {
                const quotient = bottomLeft.divMod(P).quotient;
                html += `<p style="color: #4ade80; text-align: center; font-weight: 600;">✓ Divisible by \\(P(t)\\)! Quotient: \\(${quotient.toLatex()}\\)</p>`;
            }

            html += `</div>`;
        });
    } else {
        html += `<p class="error">No matrices found within ${maxSteps} steps. Try increasing the max steps limit.</p>`;
    }

    html += '</div>';

    resultsDiv.innerHTML = html;

    // Typeset MathJax
    if (window.MathJax) {
        MathJax.typesetPromise([resultsDiv]).catch((err) => console.log('MathJax typeset error:', err));
    }
    } catch (error) {
        console.error('ERROR in calculatePolynomial:', error);
        console.error('Error stack:', error.stack);
        const resultsDiv = document.getElementById('polyResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = `<p class="error">JavaScript error: ${error.message}</p>`;
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('explorerCalculate');
    const numeratorInput = document.getElementById('explorerNumerator');
    const denominatorInput = document.getElementById('explorerDenominator');
    const maxStepsInput = document.getElementById('explorerMaxSteps');

    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateExplorer);
    }

    // Allow Enter key to calculate
    if (numeratorInput && denominatorInput && maxStepsInput) {
        numeratorInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') calculateExplorer();
        });
        denominatorInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') calculateExplorer();
        });
        maxStepsInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') calculateExplorer();
        });
    }

    // Polynomial calculator
    const polyCalculateBtn = document.getElementById('polyCalculate');
    const polyInput = document.getElementById('polynomialInput');
    const polyMaxStepsInput = document.getElementById('polyMaxSteps');

    console.log('Polynomial explorer setup:');
    console.log('  polyCalculateBtn:', polyCalculateBtn);
    console.log('  polyInput:', polyInput);
    console.log('  polyMaxStepsInput:', polyMaxStepsInput);

    if (polyCalculateBtn) {
        console.log('Adding click listener to polynomial calculate button');
        polyCalculateBtn.addEventListener('click', () => {
            console.log('Polynomial calculate button clicked!');
            calculatePolynomial();
        });
    } else {
        console.error('polyCalculate button not found!');
    }

    if (polyInput && polyMaxStepsInput) {
        polyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') calculatePolynomial();
        });
        polyMaxStepsInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') calculatePolynomial();
        });
    }
});
