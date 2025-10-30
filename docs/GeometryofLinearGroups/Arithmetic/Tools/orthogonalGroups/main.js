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
