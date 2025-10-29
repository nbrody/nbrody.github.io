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

        // Three candidates: nCenter-1, nCenter, nCenter+1
        const candidates = [nCenter - 1, nCenter, nCenter + 1];

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
    const result = findParabolicWord(reduced.p, reduced.q, maxSteps);

    let html = '<div class="polynomial-display">';
    html += `<h3>Parabolic Word for \\(\\frac{${reduced.p}}{${reduced.q}}\\)</h3>`;

    if (result.converged) {
        html += `<p style="color: #d1d5db; margin: 15px 0;">Using the continued fraction algorithm, we find:</p>`;
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

        // Display algorithm trace
        html += '<div style="margin-top: 25px;">';
        html += '<h4 style="color: #f3f4f6;">Algorithm Trace:</h4>';
        html += '<div style="font-family: monospace; font-size: 13px; background: rgba(17, 24, 39, 0.6); padding: 15px; border-radius: 6px; max-height: 300px; overflow-y: auto;">';
        result.trace.forEach(t => {
            html += `<div style="margin: 5px 0; color: #9ca3af;">${t.action}</div>`;
        });
        html += '</div></div>';
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
});
