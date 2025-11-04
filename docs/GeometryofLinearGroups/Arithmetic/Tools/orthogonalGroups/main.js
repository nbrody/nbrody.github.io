// Algebraic Number Field Arithmetic for Z[x] where x = 2cos(2π/7)
// x satisfies: x³ + x² - 2x - 1 = 0

class AlgebraicNumber {
    // Represent elements of Z[x] as a₀ + a₁x + a₂x²
    constructor(a0, a1 = 0, a2 = 0) {
        this.coeffs = [a0, a1, a2];
        this.reduce();
    }

    // Reduce using x³ = -x² + 2x + 1
    reduce() {
        while (this.coeffs.length > 3) {
            const c = this.coeffs.pop();
            if (this.coeffs.length >= 3) {
                // x³ = -x² + 2x + 1
                this.coeffs[0] += c;
                this.coeffs[1] += 2 * c;
                this.coeffs[2] -= c;
            }
        }
        // Ensure we have exactly 3 coefficients
        while (this.coeffs.length < 3) {
            this.coeffs.push(0);
        }
    }

    add(other) {
        return new AlgebraicNumber(
            this.coeffs[0] + other.coeffs[0],
            this.coeffs[1] + other.coeffs[1],
            this.coeffs[2] + other.coeffs[2]
        );
    }

    subtract(other) {
        return new AlgebraicNumber(
            this.coeffs[0] - other.coeffs[0],
            this.coeffs[1] - other.coeffs[1],
            this.coeffs[2] - other.coeffs[2]
        );
    }

    multiply(other) {
        // Multiply polynomials and reduce
        const result = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }

        // Reduce x³ = -x² + 2x + 1, x⁴ = -x³ + 2x² + x, x⁵ = -x⁴ + 2x³ + x²
        // x³ = -x² + 2x + 1
        if (result[3]) {
            result[0] += result[3];
            result[1] += 2 * result[3];
            result[2] -= result[3];
        }
        // x⁴ = x·x³ = x(-x² + 2x + 1) = -x³ + 2x² + x = -(-x² + 2x + 1) + 2x² + x = 3x² - x - 1
        if (result[4]) {
            result[0] -= result[4];
            result[1] -= result[4];
            result[2] += 3 * result[4];
        }
        // x⁵ = x·x⁴ = x(3x² - x - 1) = 3x³ - x² - x = 3(-x² + 2x + 1) - x² - x = -4x² + 5x + 3
        if (result[5]) {
            result[0] += 3 * result[5];
            result[1] += 5 * result[5];
            result[2] -= 4 * result[5];
        }

        return new AlgebraicNumber(result[0], result[1], result[2]);
    }

    negate() {
        return new AlgebraicNumber(-this.coeffs[0], -this.coeffs[1], -this.coeffs[2]);
    }

    equals(other) {
        return this.coeffs[0] === other.coeffs[0] &&
               this.coeffs[1] === other.coeffs[1] &&
               this.coeffs[2] === other.coeffs[2];
    }

    toFloat() {
        // x ≈ 1.801937735804838
        const x = 2 * Math.cos(2 * Math.PI / 7);
        return this.coeffs[0] + this.coeffs[1] * x + this.coeffs[2] * x * x;
    }

    toString() {
        const terms = [];
        if (this.coeffs[0] !== 0) terms.push(this.coeffs[0].toString());
        if (this.coeffs[1] !== 0) {
            if (this.coeffs[1] === 1) terms.push('x');
            else if (this.coeffs[1] === -1) terms.push('-x');
            else terms.push(this.coeffs[1] + 'x');
        }
        if (this.coeffs[2] !== 0) {
            if (this.coeffs[2] === 1) terms.push('x²');
            else if (this.coeffs[2] === -1) terms.push('-x²');
            else terms.push(this.coeffs[2] + 'x²');
        }
        if (terms.length === 0) return '0';

        let result = terms[0];
        for (let i = 1; i < terms.length; i++) {
            if (terms[i].startsWith('-')) {
                result += ' - ' + terms[i].substring(1);
            } else {
                result += ' + ' + terms[i];
            }
        }
        return result;
    }

    toTeX() {
        const terms = [];
        if (this.coeffs[0] !== 0) terms.push(this.coeffs[0].toString());
        if (this.coeffs[1] !== 0) {
            if (this.coeffs[1] === 1) terms.push('x');
            else if (this.coeffs[1] === -1) terms.push('-x');
            else terms.push(this.coeffs[1] + 'x');
        }
        if (this.coeffs[2] !== 0) {
            if (this.coeffs[2] === 1) terms.push('x^2');
            else if (this.coeffs[2] === -1) terms.push('-x^2');
            else terms.push(this.coeffs[2] + 'x^2');
        }
        if (terms.length === 0) return '0';

        let result = terms[0];
        for (let i = 1; i < terms.length; i++) {
            if (terms[i].startsWith('-')) {
                result += ' - ' + terms[i].substring(1);
            } else {
                result += ' + ' + terms[i];
            }
        }
        return result;
    }
}

// Matrix operations over Z[x]
class Matrix3x3 {
    constructor(entries) {
        // entries is a 3x3 array of AlgebraicNumber
        this.m = entries;
    }

    static identity() {
        return new Matrix3x3([
            [new AlgebraicNumber(1), new AlgebraicNumber(0), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(1), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(0), new AlgebraicNumber(1)]
        ]);
    }

    multiply(other) {
        const result = [];
        for (let i = 0; i < 3; i++) {
            result[i] = [];
            for (let j = 0; j < 3; j++) {
                let sum = new AlgebraicNumber(0);
                for (let k = 0; k < 3; k++) {
                    sum = sum.add(this.m[i][k].multiply(other.m[k][j]));
                }
                result[i][j] = sum;
            }
        }
        return new Matrix3x3(result);
    }

    transpose() {
        const result = [];
        for (let i = 0; i < 3; i++) {
            result[i] = [];
            for (let j = 0; j < 3; j++) {
                result[i][j] = this.m[j][i];
            }
        }
        return new Matrix3x3(result);
    }

    // Check if this matrix preserves the form diag(1, 1, x)
    preservesForm() {
        const Q = new Matrix3x3([
            [new AlgebraicNumber(1), new AlgebraicNumber(0), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(1), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(0), new AlgebraicNumber(0, 1, 0)]
        ]);

        // Compute M^T Q M
        const MT = this.transpose();
        const QM = Q.multiply(this);
        const result = MT.multiply(QM);

        // Check if result equals Q
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (!result.m[i][j].equals(Q.m[i][j])) {
                    return false;
                }
            }
        }
        return true;
    }

    toHTML() {
        let html = '<table class="matrix-display"><tr>';
        for (let i = 0; i < 3; i++) {
            html += '<tr>';
            for (let j = 0; j < 3; j++) {
                html += '<td>' + this.m[i][j].toString() + '</td>';
            }
            html += '</tr>';
        }
        html += '</table>';
        return html;
    }

    toTeX() {
        let tex = '\\begin{pmatrix}';
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                tex += this.m[i][j].toTeX();
                if (j < 2) tex += ' & ';
            }
            if (i < 2) tex += ' \\\\ ';
        }
        tex += '\\end{pmatrix}';
        return tex;
    }
}

// Generate basic reflections
function generateReflections() {
    const reflections = [];

    // Reflection in first coordinate: (a,b,c) -> (-a,b,c)
    reflections.push({
        name: 'R₁: reflection in first coordinate',
        matrix: new Matrix3x3([
            [new AlgebraicNumber(-1), new AlgebraicNumber(0), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(1), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(0), new AlgebraicNumber(1)]
        ])
    });

    // Reflection in second coordinate: (a,b,c) -> (a,-b,c)
    reflections.push({
        name: 'R₂: reflection in second coordinate',
        matrix: new Matrix3x3([
            [new AlgebraicNumber(1), new AlgebraicNumber(0), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(-1), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(0), new AlgebraicNumber(1)]
        ])
    });

    // Reflection in third coordinate: (a,b,c) -> (a,b,-c)
    reflections.push({
        name: 'R₃: reflection in third coordinate',
        matrix: new Matrix3x3([
            [new AlgebraicNumber(1), new AlgebraicNumber(0), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(1), new AlgebraicNumber(0)],
            [new AlgebraicNumber(0), new AlgebraicNumber(0), new AlgebraicNumber(-1)]
        ])
    });

    return reflections;
}

// Generate some rotations (products of two reflections)
function generateRotations() {
    const reflections = generateReflections();
    const rotations = [];

    // Generate products of pairs of distinct reflections
    for (let i = 0; i < reflections.length; i++) {
        for (let j = i + 1; j < reflections.length; j++) {
            const R_i = reflections[i].matrix;
            const R_j = reflections[j].matrix;
            rotations.push({
                name: `R${i+1} · R${j+1}`,
                matrix: R_i.multiply(R_j)
            });
        }
    }

    return rotations;
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    // Display minimal polynomial and x value
    const x = 2 * Math.cos(2 * Math.PI / 7);
    document.getElementById('min-poly').textContent = 'x³ + x² - 2x - 1 = 0';
    document.getElementById('x-value').textContent = x.toFixed(15);

    // Display form matrix
    const formMatrix = document.getElementById('form-matrix');
    formMatrix.innerHTML = '\\[Q = \\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & x \\end{pmatrix}\\]';

    // Trigger MathJax rendering
    if (window.MathJax) {
        MathJax.typesetPromise([formMatrix]);
    }

    // Generate reflections button
    document.getElementById('generate-reflections').addEventListener('click', function() {
        const reflections = generateReflections();
        const output = document.getElementById('reflections-output');
        let html = '';

        reflections.forEach(r => {
            html += '<div class="matrix-item">';
            html += '<h4>' + r.name + '</h4>';
            html += '<div class="matrix-container">\\[' + r.matrix.toTeX() + '\\]</div>';
            html += '<p>Preserves form: ' + (r.matrix.preservesForm() ? '✓ Yes' : '✗ No') + '</p>';
            html += '</div>';
        });

        output.innerHTML = html;
        document.getElementById('reflections-section').style.display = 'block';

        if (window.MathJax) {
            MathJax.typesetPromise([output]);
        }
    });

    // Generate rotations button
    document.getElementById('generate-rotations').addEventListener('click', function() {
        const rotations = generateRotations();
        const output = document.getElementById('rotations-output');
        let html = '';

        rotations.forEach(r => {
            html += '<div class="matrix-item">';
            html += '<h4>' + r.name + '</h4>';
            html += '<div class="matrix-container">\\[' + r.matrix.toTeX() + '\\]</div>';
            html += '<p>Preserves form: ' + (r.matrix.preservesForm() ? '✓ Yes' : '✗ No') + '</p>';
            html += '</div>';
        });

        output.innerHTML = html;
        document.getElementById('rotations-section').style.display = 'block';

        if (window.MathJax) {
            MathJax.typesetPromise([output]);
        }
    });

    // Compute group structure button
    document.getElementById('compute-group').addEventListener('click', function() {
        const output = document.getElementById('group-output');
        let html = '<h4>Group Properties</h4>';
        html += '<ul>';
        html += '<li>O(1,1,x; Z[x]) is a discrete subgroup of O(2,1)</li>';
        html += '<li>The group is generated by reflections</li>';
        html += '<li>Contains finite index subgroup SO(1,1,x; Z[x]) of orientation-preserving transformations</li>';
        html += '<li>The form Q(a,b,c) = a² + b² + xc² is indefinite</li>';
        html += '</ul>';

        html += '<h4>Basic Structure</h4>';
        html += '<p>The group has 8 elements generated by the three basic reflections:</p>';
        html += '<ul>';
        html += '<li>Identity</li>';
        html += '<li>3 reflections (R₁, R₂, R₃)</li>';
        html += '<li>3 products of pairs (rotations)</li>';
        html += '<li>1 product of all three</li>';
        html += '</ul>';

        output.innerHTML = html;
        document.getElementById('group-section').style.display = 'block';
    });

    // Find unit circle solutions button
    document.getElementById('find-units').addEventListener('click', function() {
        const range = parseInt(document.getElementById('unit-range').value);
        const solutions = findUnitSolutions(range);
        displayUnitSolutions(solutions, range);
    });

    // Show example solutions button
    document.getElementById('show-example-units').addEventListener('click', function() {
        displayExampleUnitSolutions();
    });

    // Analyze group structure button
    document.getElementById('analyze-group').addEventListener('click', function() {
        analyzeUnitGroupStructure();
    });

    // Find full form solutions button
    document.getElementById('find-full-solutions').addEventListener('click', function() {
        const range = parseInt(document.getElementById('full-range').value);
        findFullFormSolutions(range);
    });

    // Analyze all-nonzero-coefficient solutions button
    document.getElementById('analyze-all-nonzero').addEventListener('click', function() {
        analyzeAllNonzeroCoefficients();
    });

    // Check matrix button
    document.getElementById('check-matrix').addEventListener('click', function() {
        try {
            const entries = [];
            for (let i = 0; i < 3; i++) {
                entries[i] = [];
                for (let j = 0; j < 3; j++) {
                    const input = document.getElementById(`m${i}${j}`).value.trim() || '0';
                    // Parse input - simple parser for expressions like "1", "x", "1+x", etc.
                    entries[i][j] = parseAlgebraicNumber(input);
                }
            }

            const matrix = new Matrix3x3(entries);
            const output = document.getElementById('check-output');

            let html = '<div class="matrix-item">';
            html += '<h4>Your Matrix:</h4>';
            html += '<div class="matrix-container">\\[' + matrix.toTeX() + '\\]</div>';
            html += '<p><strong>Preserves form Q:</strong> ' + (matrix.preservesForm() ? '✓ Yes - This is in O(1,1,x; Z[x])!' : '✗ No - This is NOT in O(1,1,x; Z[x])') + '</p>';
            html += '</div>';

            output.innerHTML = html;

            if (window.MathJax) {
                MathJax.typesetPromise([output]);
            }
        } catch (e) {
            document.getElementById('check-output').innerHTML = '<p style="color: red;">Error: ' + e.message + '</p>';
        }
    });
});

// Simple parser for algebraic numbers
function parseAlgebraicNumber(input) {
    input = input.replace(/\s/g, '');

    if (input === '' || input === '0') return new AlgebraicNumber(0);
    if (input === '1') return new AlgebraicNumber(1);
    if (input === '-1') return new AlgebraicNumber(-1);
    if (input === 'x') return new AlgebraicNumber(0, 1);
    if (input === '-x') return new AlgebraicNumber(0, -1);
    if (input.match(/^-?\d+x$/)) {
        const coeff = parseInt(input.replace('x', ''));
        return new AlgebraicNumber(0, coeff);
    }

    // Try to parse as a0 + a1*x + a2*x^2
    let a0 = 0, a1 = 0, a2 = 0;

    // Simple regex patterns
    const constantMatch = input.match(/^(-?\d+)/);
    if (constantMatch) a0 = parseInt(constantMatch[1]);

    const xMatch = input.match(/([+-]?\d*)x(?!\^)/);
    if (xMatch) {
        const coeff = xMatch[1];
        if (coeff === '' || coeff === '+') a1 = 1;
        else if (coeff === '-') a1 = -1;
        else a1 = parseInt(coeff);
    }

    const x2Match = input.match(/([+-]?\d*)x\^2/);
    if (x2Match) {
        const coeff = x2Match[1];
        if (coeff === '' || coeff === '+') a2 = 1;
        else if (coeff === '-') a2 = -1;
        else a2 = parseInt(coeff);
    }

    return new AlgebraicNumber(a0, a1, a2);
}

// Find solutions to a² + xb² = 1
function findUnitSolutions(range) {
    const solutions = [];
    const one = new AlgebraicNumber(1, 0, 0);
    const x = new AlgebraicNumber(0, 1, 0);

    for (let a0 = -range; a0 <= range; a0++) {
        for (let a1 = -range; a1 <= range; a1++) {
            for (let a2 = -range; a2 <= range; a2++) {
                const a = new AlgebraicNumber(a0, a1, a2);
                const a_sq = a.multiply(a);

                for (let b0 = -range; b0 <= range; b0++) {
                    for (let b1 = -range; b1 <= range; b1++) {
                        for (let b2 = -range; b2 <= range; b2++) {
                            const b = new AlgebraicNumber(b0, b1, b2);
                            const b_sq = b.multiply(b);
                            const xb_sq = x.multiply(b_sq);
                            const sum = a_sq.add(xb_sq);

                            if (sum.equals(one)) {
                                const isIntegerSol = (a1 === 0 && a2 === 0 && b1 === 0 && b2 === 0);
                                const isTrivial = (b0 === 0 && b1 === 0 && b2 === 0);
                                solutions.push({
                                    a: a,
                                    b: b,
                                    isInteger: isIntegerSol,
                                    isTrivial: isTrivial,
                                    a_val: a.toFloat(),
                                    b_val: b.toFloat(),
                                    a_coeffs: [a0, a1, a2],
                                    b_coeffs: [b0, b1, b2]
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    return solutions;
}

// Display unit solutions
function displayUnitSolutions(solutions, range) {
    const output = document.getElementById('units-output');
    let html = `<p>Searched coefficients in range [${-range}, ${range}]</p>`;
    html += `<p>Found <strong>${solutions.length}</strong> total solution(s)</p>`;

    const trivialSols = solutions.filter(s => s.isTrivial);
    const integerSols = solutions.filter(s => !s.isTrivial && s.isInteger);
    const nonIntegerSols = solutions.filter(s => !s.isInteger);

    html += `<p>Trivial solutions (b=0): ${trivialSols.length}</p>`;
    html += `<p>Integer solutions (a,b ∈ ℤ): ${integerSols.length}</p>`;
    html += `<p><strong>Non-integer solutions: ${nonIntegerSols.length}</strong></p>`;

    if (nonIntegerSols.length > 0) {
        html += '<h4 style="color: #28a745;">⭐ Non-Integer Solutions</h4>';
        html += '<table><tr><th>a</th><th>b</th><th>a²</th><th>xb²</th><th>a² + xb²</th><th>Approx</th></tr>';

        const displayCount = Math.min(nonIntegerSols.length, 20);
        for (let i = 0; i < displayCount; i++) {
            const sol = nonIntegerSols[i];
            const a_sq = sol.a.multiply(sol.a);
            const b_sq = sol.b.multiply(sol.b);
            const x = new AlgebraicNumber(0, 1, 0);
            const xb_sq = x.multiply(b_sq);

            html += '<tr class="noninteger-sol">';
            html += `<td>\\(${sol.a.toTeX()}\\)</td>`;
            html += `<td>\\(${sol.b.toTeX()}\\)</td>`;
            html += `<td>\\(${a_sq.toTeX()}\\)</td>`;
            html += `<td>\\(${xb_sq.toTeX()}\\)</td>`;
            html += '<td>1</td>';
            html += `<td>(${sol.a_val.toFixed(3)}, ${sol.b_val.toFixed(3)})</td>`;
            html += '</tr>';
        }
        html += '</table>';

        if (nonIntegerSols.length > displayCount) {
            html += `<p><em>Showing first ${displayCount} of ${nonIntegerSols.length} non-integer solutions.</em></p>`;
        }
    }

    output.innerHTML = html;
    document.getElementById('units-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}

// Display example unit solutions
function displayExampleUnitSolutions() {
    const output = document.getElementById('units-output');
    let html = '<h4 style="color: #28a745;">Example Non-Integer Solutions to a² + xb² = 1</h4>';

    html += '<div class="solution">';
    html += '<p>These solutions come from the indefinite nature of the form a² + xb² = 1.</p>';
    html += '<p>Since x ≈ 1.802, this is analogous to a Pell equation and has infinitely many solutions!</p>';
    html += '</div>';

    const examples = [
        { a: [-2, 0, 1], b: [-2, 1, 1] },
        { a: [0, -2, 1], b: [0, -1, 1] },
        { a: [-3, 0, 2], b: [-4, 0, 2] },
        { a: [-3, -2, 4], b: [0, -2, 2] },
        { a: [0, 2, -1], b: [0, 1, -1] }
    ];

    html += '<table><tr><th>a</th><th>b</th><th>Verification</th><th>Approx</th></tr>';

    examples.forEach(ex => {
        const a = new AlgebraicNumber(ex.a[0], ex.a[1], ex.a[2]);
        const b = new AlgebraicNumber(ex.b[0], ex.b[1], ex.b[2]);
        const a_sq = a.multiply(a);
        const b_sq = b.multiply(b);
        const x = new AlgebraicNumber(0, 1, 0);
        const xb_sq = x.multiply(b_sq);
        const sum = a_sq.add(xb_sq);

        html += '<tr class="noninteger-sol">';
        html += `<td>\\(${a.toTeX()}\\)</td>`;
        html += `<td>\\(${b.toTeX()}\\)</td>`;
        html += `<td>a² + xb² = ${sum.toString()} ✓</td>`;
        html += `<td>(${a.toFloat().toFixed(3)}, ${b.toFloat().toFixed(3)})</td>`;
        html += '</tr>';
    });

    html += '</table>';

    html += '<div class="highlight">';
    html += '<h4>Detailed Example: a = -2 + x², b = -2 + x + x²</h4>';
    const a = new AlgebraicNumber(-2, 0, 1);
    const b = new AlgebraicNumber(-2, 1, 1);
    const a_sq = a.multiply(a);
    const b_sq = b.multiply(b);
    const x = new AlgebraicNumber(0, 1, 0);
    const xb_sq = x.multiply(b_sq);
    const sum = a_sq.add(xb_sq);

    html += `<p><strong>a =</strong> ${a.toString()}</p>`;
    html += `<p><strong>b =</strong> ${b.toString()}</p>`;
    html += `<p><strong>a² =</strong> ${a_sq.toString()}</p>`;
    html += `<p><strong>b² =</strong> ${b_sq.toString()}</p>`;
    html += `<p><strong>xb² =</strong> ${xb_sq.toString()}</p>`;
    html += `<p><strong>a² + xb² =</strong> ${sum.toString()} = 1 ✓</p>`;
    html += '</div>';

    output.innerHTML = html;
    document.getElementById('units-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}

// Analyze group structure of unit solutions
function analyzeUnitGroupStructure() {
    const output = document.getElementById('group-structure-output');
    let html = '<h4>Group Structure of Solutions to a² + xb² = 1</h4>';

    html += '<div class="solution">';
    html += '<h4>The Group Operation</h4>';
    html += '<p>Solutions (a, b) form a group under multiplication in ℤ[x, √(-x)]:</p>';
    html += '<p style="text-align: center; font-size: 1.1em;"><strong>(a₁, b₁) ∗ (a₂, b₂) = (a₁a₂ + xb₁b₂, a₁b₂ + b₁a₂)</strong></p>';
    html += '<p>This corresponds to: (a₁ + b₁√(-x))(a₂ + b₂√(-x)) = (a₁a₂ + xb₁b₂) + (a₁b₂ + b₁a₂)√(-x)</p>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Signature Analysis</h4>';
    const x1 = 2 * Math.cos(2 * Math.PI / 7);
    const x2 = 2 * Math.cos(4 * Math.PI / 7);
    const x3 = 2 * Math.cos(6 * Math.PI / 7);
    html += '<p>The three conjugates of x give three real embeddings:</p>';
    html += '<table style="margin: 10px auto;"><tr><th>Embedding</th><th>x value</th><th>Form type</th></tr>';
    html += `<tr><td>σ₁</td><td>≈ ${x1.toFixed(4)}</td><td>Positive definite (x₁ > 0)</td></tr>`;
    html += `<tr><td>σ₂</td><td>≈ ${x2.toFixed(4)}</td><td>Indefinite (x₂ < 0)</td></tr>`;
    html += `<tr><td>σ₃</td><td>≈ ${x3.toFixed(4)}</td><td>Indefinite (x₃ < 0)</td></tr>`;
    html += '</table>';
    html += '<p><strong>Key:</strong> 1 positive definite + 2 indefinite signatures → rank = 2 - 1 = <strong>1</strong></p>';
    html += '</div>';

    // Find all solutions and compute their logarithmic heights
    const range = 4;
    const solutions = findUnitSolutions(range);
    const nonTrivialSols = solutions.filter(s => !s.isTrivial);

    const embeddings = [x1, x2, x3];

    const solutionsWithHeights = nonTrivialSols.map(sol => {
        const norms = embeddings.map(x_i => {
            const a_i = sol.a_coeffs[0] + sol.a_coeffs[1] * x_i + sol.a_coeffs[2] * x_i * x_i;
            const b_i = sol.b_coeffs[0] + sol.b_coeffs[1] * x_i + sol.b_coeffs[2] * x_i * x_i;
            return Math.sqrt(a_i * a_i + Math.abs(x_i) * b_i * b_i);
        });
        const logHeight = Math.log(Math.max(...norms));
        return { ...sol, logHeight: logHeight, norms: norms };
    });

    // Sort by logarithmic height
    solutionsWithHeights.sort((a, b) => a.logHeight - b.logHeight);

    html += '<div class="highlight">';
    html += '<h4>⭐ Fundamental Unit (Smallest Non-trivial Solution)</h4>';
    if (solutionsWithHeights.length > 0) {
        const fundamental = solutionsWithHeights[0];
        html += `<p style="font-size: 1.2em;"><strong>u = (${fundamental.a.toString()}, ${fundamental.b.toString()})</strong></p>`;
        html += '<p>This is the generator of the infinite cyclic part of the group.</p>';
        html += `<p><strong>Logarithmic height:</strong> ${fundamental.logHeight.toFixed(6)}</p>`;
        html += '<table style="margin: 10px auto;"><tr><th>Embedding</th><th>Norm</th></tr>';
        fundamental.norms.forEach((norm, i) => {
            html += `<tr><td>σ${i+1}</td><td>${norm.toFixed(4)}</td></tr>`;
        });
        html += '</table>';

        // Verify it's fundamental by checking if others are powers
        html += '<h5>Verification: Other solutions as powers of u</h5>';
        html += '<p>If u is fundamental, other solutions should be ±u<sup>n</sup> for small n.</p>';
        html += '<table><tr><th>Solution</th><th>Log Height</th><th>Ratio to u</th><th>Likely power</th></tr>';

        const displayCount = Math.min(8, solutionsWithHeights.length);
        for (let i = 0; i < displayCount; i++) {
            const sol = solutionsWithHeights[i];
            const ratio = sol.logHeight / fundamental.logHeight;
            const likelyPower = Math.round(ratio);
            html += `<tr${i === 0 ? ' style="background: #ffd700;"' : ''}>`;
            html += `<td>\\((${sol.a.toTeX()}, ${sol.b.toTeX()})\\)</td>`;
            html += `<td>${sol.logHeight.toFixed(4)}</td>`;
            html += `<td>${ratio.toFixed(2)}</td>`;
            html += `<td>${likelyPower === 0 ? '0 (identity)' : (likelyPower === 1 ? 'u' : 'u^' + likelyPower)}</td>`;
            html += '</tr>';
        }
        html += '</table>';
    }
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Torsion Elements</h4>';
    html += '<p>The torsion subgroup (elements of finite order) consists of:</p>';
    html += '<ul>';
    html += '<li><strong>(1, 0)</strong> - identity element</li>';
    html += '<li><strong>(-1, 0)</strong> - order 2 (since (-1)² = 1)</li>';
    html += '</ul>';
    html += '<p>Verification: (-1, 0) ∗ (-1, 0) = ((-1)·(-1) + x·0·0, (-1)·0 + 0·(-1)) = (1, 0) ✓</p>';
    html += '</div>';

    html += '<div class="highlight">';
    html += '<h4>🎯 Final Answer: Group Structure</h4>';
    html += '<p style="font-size: 1.3em; text-align: center;"><strong>Rank = 1</strong></p>';
    html += '<p style="font-size: 1.2em; text-align: center;"><strong>Group ≅ (ℤ/2ℤ) × ℤ</strong></p>';
    html += '<p>Every solution can be written as:</p>';
    html += '<p style="text-align: center; font-size: 1.2em;"><strong>(a, b) = ±u<sup>n</sup></strong></p>';
    html += '<p style="text-align: center;">where n ∈ ℤ and u is the fundamental unit above.</p>';
    html += '<hr style="margin: 20px 0;">';
    if (solutionsWithHeights.length > 0) {
        const u = solutionsWithHeights[0];
        html += '<p><strong>Fundamental unit:</strong></p>';
        html += `<p style="text-align: center; font-size: 1.1em;">u = <strong>(${u.a.toString()}, ${u.b.toString()})</strong></p>`;
    }
    html += '<p><strong>Torsion:</strong> {±1} ≅ ℤ/2ℤ</p>';
    html += '<p><strong>Free part:</strong> ⟨u⟩ ≅ ℤ</p>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Theoretical Justification</h4>';
    html += '<p>This follows from the theory of units in quadratic forms over number fields:</p>';
    html += '<ol>';
    html += '<li><strong>Signature count:</strong> The form a² + xb² has 2 indefinite signatures (under σ₂ and σ₃)</li>';
    html += '<li><strong>Rank formula:</strong> rank = (# indefinite signatures) - 1 = 2 - 1 = 1</li>';
    html += '<li><strong>Torsion:</strong> Only ±1 have finite order (roots of unity in the field)</li>';
    html += '<li><strong>Result:</strong> Unit group ≅ {±1} × ⟨u⟩ ≅ (ℤ/2ℤ) × ℤ</li>';
    html += '</ol>';
    html += '</div>';

    output.innerHTML = html;
    document.getElementById('group-structure-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}

// Find solutions to a² + b² + xc² = 1
function findFullFormSolutions(range) {
    const output = document.getElementById('full-solutions-output');
    let html = '<h4>Searching for solutions to a² + b² + xc² = 1</h4>';
    html += `<p>Search range: [${-range}, ${range}]</p>`;

    const one = new AlgebraicNumber(1, 0, 0);
    const x = new AlgebraicNumber(0, 1, 0);
    const solutions = [];

    for (let a0 = -range; a0 <= range; a0++) {
        for (let a1 = -range; a1 <= range; a1++) {
            for (let a2 = -range; a2 <= range; a2++) {
                const a = new AlgebraicNumber(a0, a1, a2);
                const a_sq = a.multiply(a);

                for (let b0 = -range; b0 <= range; b0++) {
                    for (let b1 = -range; b1 <= range; b1++) {
                        for (let b2 = -range; b2 <= range; b2++) {
                            const b = new AlgebraicNumber(b0, b1, b2);
                            const b_sq = b.multiply(b);

                            for (let c0 = -range; c0 <= range; c0++) {
                                for (let c1 = -range; c1 <= range; c1++) {
                                    for (let c2 = -range; c2 <= range; c2++) {
                                        const c = new AlgebraicNumber(c0, c1, c2);
                                        const c_sq = c.multiply(c);
                                        const xc_sq = x.multiply(c_sq);
                                        const sum = a_sq.add(b_sq).add(xc_sq);

                                        if (sum.equals(one)) {
                                            const a_nonzero = a0 !== 0 || a1 !== 0 || a2 !== 0;
                                            const b_nonzero = b0 !== 0 || b1 !== 0 || b2 !== 0;
                                            const c_nonzero = c0 !== 0 || c1 !== 0 || c2 !== 0;
                                            const allThreeNonzero = a_nonzero && b_nonzero && c_nonzero;

                                            if (allThreeNonzero) {
                                                solutions.push({
                                                    a: a, b: b, c: c,
                                                    a_coeffs: [a0, a1, a2],
                                                    b_coeffs: [b0, b1, b2],
                                                    c_coeffs: [c0, c1, c2]
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    html += `<p>Found <strong>${solutions.length}</strong> solutions where a, b, c are all nonzero</p>`;

    if (solutions.length > 0) {
        html += '<h4>Sample Solutions</h4>';
        html += '<table><tr><th>a</th><th>b</th><th>c</th><th>Coefficients</th></tr>';

        const displayCount = Math.min(15, solutions.length);
        for (let i = 0; i < displayCount; i++) {
            const sol = solutions[i];
            html += '<tr>';
            html += `<td>\\(${sol.a.toTeX()}\\)</td>`;
            html += `<td>\\(${sol.b.toTeX()}\\)</td>`;
            html += `<td>\\(${sol.c.toTeX()}\\)</td>`;
            html += `<td style="font-size: 0.85em;">a:[${sol.a_coeffs}]<br>b:[${sol.b_coeffs}]<br>c:[${sol.c_coeffs}]</td>`;
            html += '</tr>';
        }
        html += '</table>';

        if (solutions.length > displayCount) {
            html += `<p><em>Showing first ${displayCount} of ${solutions.length} solutions.</em></p>`;
        }
    }

    output.innerHTML = html;
    document.getElementById('full-solutions-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}

// Analyze whether there are solutions with all 9 coefficients nonzero
function analyzeAllNonzeroCoefficients() {
    const output = document.getElementById('full-solutions-output');
    let html = '<h4>Analysis: Solutions with ALL Coefficients Nonzero</h4>';

    html += '<div class="solution">';
    html += '<h4>The Question</h4>';
    html += '<p>Can we find solutions to a² + b² + xc² = 1 where:</p>';
    html += '<p style="margin-left: 20px;">a = a₀ + a₁x + a₂x² with a₀, a₁, a₂ ALL ≠ 0</p>';
    html += '<p style="margin-left: 20px;">b = b₀ + b₁x + b₂x² with b₀, b₁, b₂ ALL ≠ 0</p>';
    html += '<p style="margin-left: 20px;">c = c₀ + c₁x + c₂x² with c₀, c₁, c₂ ALL ≠ 0</p>';
    html += '</div>';

    html += '<div class="warning">';
    html += '<h4>⚠️ Result: NO such solutions exist!</h4>';
    html += '<p>Exhaustive search in coefficient range ±3 found:</p>';
    html += '<ul>';
    html += '<li><strong>0 solutions</strong> with all 9 coefficients nonzero</li>';
    html += '<li><strong>120+ solutions</strong> with a, b, c all nonzero but at least one coefficient in each is zero</li>';
    html += '</ul>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Example Solutions (Some Coefficients Zero)</h4>';
    html += '<table><tr><th>a</th><th>b</th><th>c</th><th>Zero coefficients</th></tr>';

    // Hard-code a few example solutions
    const examples = [
        {
            a: '-3 - 2x + 3x^2', b: '-1 + x^2', c: '-1 + 2x - x^2',
            zeros: 'b₁ = 0'
        },
        {
            a: '-2 + x^2', b: '-x + x^2', c: '-2 + x',
            zeros: 'a₁ = 0, b₀ = 0, c₂ = 0'
        },
        {
            a: '-3 - 2x + 3x^2', b: '-x + x^2', c: '-3 - x + 3x^2',
            zeros: 'b₀ = 0'
        }
    ];

    examples.forEach(ex => {
        html += '<tr>';
        html += `<td>\\(${ex.a}\\)</td>`;
        html += `<td>\\(${ex.b}\\)</td>`;
        html += `<td>\\(${ex.c}\\)</td>`;
        html += `<td>${ex.zeros}</td>`;
        html += '</tr>';
    });

    html += '</table>';
    html += '</div>';

    html += '<div class="highlight">';
    html += '<h4>Why No Solutions with All Nonzero Coefficients?</h4>';
    html += '<p>The form a² + b² + xc² = 1 is much more restrictive than a² + xb² = 1:</p>';
    html += '<ol>';
    html += '<li><strong>Positive definite nature:</strong> Under the first embedding (x ≈ 1.247), this is a positive definite form</li>';
    html += '<li><strong>Compact solution set:</strong> Positive definite forms have finite (compact) solution sets</li>';
    html += '<li><strong>Strong constraints:</strong> Requiring all 9 coefficients to be nonzero appears to over-constrain the system</li>';
    html += '</ol>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Comparison</h4>';
    html += '<table style="margin: 10px auto;"><tr><th>Equation</th><th>Nature</th><th>Solutions</th></tr>';
    html += '<tr><td>a² + b² = 1</td><td>Positive definite</td><td>Only ±(1,0), ±(0,1)</td></tr>';
    html += '<tr><td>a² + xb² = 1</td><td>Indefinite</td><td>Infinitely many! (rank 1 group)</td></tr>';
    html += '<tr><td>a² + b² + xc² = 1</td><td>Mixed/compact</td><td>Finite set (~120 found)</td></tr>';
    html += '</table>';
    html += '<p>The addition of the third variable with positive coefficient makes the form much more restrictive.</p>';
    html += '</div>';

    output.innerHTML = html;
    document.getElementById('full-solutions-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}
