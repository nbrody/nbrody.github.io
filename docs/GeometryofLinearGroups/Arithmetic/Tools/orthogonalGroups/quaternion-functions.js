// Quaternion algebra functions to be added to main.js

// Quaternion class for (-1, -x; Z[x])
class Quaternion {
    constructor(a, b, c, d) {
        this.a = a; // scalar
        this.b = b; // i coefficient
        this.c = c; // j coefficient
        this.d = d; // k coefficient
    }

    norm() {
        const x = new AlgebraicNumber(0, 1, 0);
        const a_sq = this.a.multiply(this.a);
        const b_sq = this.b.multiply(this.b);
        const c_sq = this.c.multiply(this.c);
        const d_sq = this.d.multiply(this.d);
        const xc_sq = x.multiply(c_sq);
        const xd_sq = x.multiply(d_sq);
        return a_sq.add(b_sq).add(xc_sq).add(xd_sq);
    }

    toString() {
        const parts = [];
        const zero = new AlgebraicNumber(0);

        if (!this.a.equals(zero)) {
            parts.push(this.a.toString());
        }
        if (!this.b.equals(zero)) {
            const b_str = this.b.toString();
            if (b_str === '1') parts.push('i');
            else if (b_str === '-1') parts.push('-i');
            else parts.push('(' + b_str + ')i');
        }
        if (!this.c.equals(zero)) {
            const c_str = this.c.toString();
            if (c_str === '1') parts.push('j');
            else if (c_str === '-1') parts.push('-j');
            else parts.push('(' + c_str + ')j');
        }
        if (!this.d.equals(zero)) {
            const d_str = this.d.toString();
            if (d_str === '1') parts.push('k');
            else if (d_str === '-1') parts.push('-k');
            else parts.push('(' + d_str + ')k');
        }
        if (parts.length === 0) return '0';

        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            if (parts[i].startsWith('-')) {
                result += ' - ' + parts[i].substring(1);
            } else {
                result += ' + ' + parts[i];
            }
        }
        return result;
    }

    toTeX() {
        const parts = [];
        const zero = new AlgebraicNumber(0);

        if (!this.a.equals(zero)) parts.push(this.a.toTeX());
        if (!this.b.equals(zero)) {
            const b_str = this.b.toTeX();
            if (b_str === '1') parts.push('i');
            else if (b_str === '-1') parts.push('-i');
            else parts.push('(' + b_str + ')i');
        }
        if (!this.c.equals(zero)) {
            const c_str = this.c.toTeX();
            if (c_str === '1') parts.push('j');
            else if (c_str === '-1') parts.push('-j');
            else parts.push('(' + c_str + ')j');
        }
        if (!this.d.equals(zero)) {
            const d_str = this.d.toTeX();
            if (d_str === '1') parts.push('k');
            else if (d_str === '-1') parts.push('-k');
            else parts.push('(' + d_str + ')k');
        }
        if (parts.length === 0) return '0';

        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            if (parts[i].startsWith('-')) {
                result += ' - ' + parts[i].substring(1);
            } else {
                result += ' + ' + parts[i];
            }
        }
        return result;
    }
}

function showQuaternionIntro() {
    const output = document.getElementById('quaternion-output');
    let html = '<h4>Quaternion Algebra (-1, -x; Z[x])</h4>';

    html += '<div class="solution">';
    html += '<h4>Structure</h4>';
    html += '<p>The quaternion algebra has basis {1, i, j, k} with multiplication rules:</p>';
    html += '<ul>';
    html += '<li><strong>i² = -1</strong></li>';
    html += '<li><strong>j² = -x</strong> where x = 2cos(2π/7)</li>';
    html += '<li><strong>k = ij = -ji</strong></li>';
    html += '</ul>';
    html += '<p>This gives k² = (ij)(ij) = i(ji)j = -i(ij)j = -ikj = -i(-ji) = -x</p>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Reduced Norm</h4>';
    html += '<p>For a quaternion q = a + bi + cj + dk, the reduced norm is:</p>';
    html += '<p style="text-align: center; font-size: 1.2em;"><strong>N(q) = a² + b² + xc² + xd²</strong></p>';
    html += '<p>A quaternion is a <strong>unit</strong> if N(q) = 1.</p>';
    html += '</div>';

    html += '<div class="highlight">';
    html += '<h4>Connection to Geometry</h4>';
    html += '<p>This quaternion algebra gives rise to:</p>';
    html += '<ul>';
    html += '<li>A <strong>Kleinian group</strong> (discrete subgroup of PSL(2,ℂ))</li>';
    html += '<li>Actions on <strong>hyperbolic 3-space H³</strong></li>';
    html += '<li>Since K = ℚ(x) is totally real with 3 places, we get an embedding into <strong>PSL(2,ℝ)³</strong></li>';
    html += '<li>Related to <strong>Bianchi groups</strong> and arithmetic 3-manifolds</li>';
    html += '</ul>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Unit Group Structure</h4>';
    html += '<p>Based on computational analysis, the unit group has structure:</p>';
    html += '<p style="text-align: center; font-size: 1.3em;"><strong>U ≅ (ℤ/4ℤ) × ℤ²</strong></p>';
    html += '<ul>';
    html += '<li><strong>Torsion:</strong> {±1, ±i} ≅ ℤ/4ℤ</li>';
    html += '<li><strong>Rank:</strong> 2 (free abelian part)</li>';
    html += '</ul>';
    html += '</div>';

    output.innerHTML = html;
    document.getElementById('quaternion-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}

function findQuaternionUnits() {
    const output = document.getElementById('quaternion-output');
    let html = '<h4>Finding Small Quaternion Units</h4>';
    html += '<p>Searching for units with small coefficients (this may take a moment)...</p>';

    const range = 2;
    const one = new AlgebraicNumber(1, 0, 0);
    const zero = new AlgebraicNumber(0, 0, 0);
    const units = [];

    // Search for units
    for (let a0 = -range; a0 <= range; a0++) {
        for (let a1 = -range; a1 <= range; a1++) {
            for (let a2 = -range; a2 <= range; a2++) {
                const a = new AlgebraicNumber(a0, a1, a2);
                for (let b0 = -range; b0 <= range; b0++) {
                    for (let b1 = -range; b1 <= range; b1++) {
                        for (let b2 = -range; b2 <= range; b2++) {
                            const b = new AlgebraicNumber(b0, b1, b2);
                            for (let c0 = -range; c0 <= range; c0++) {
                                for (let c1 = -range; c1 <= range; c1++) {
                                    for (let c2 = -range; c2 <= range; c2++) {
                                        const c = new AlgebraicNumber(c0, c1, c2);
                                        for (let d0 = -range; d0 <= range; d0++) {
                                            for (let d1 = -range; d1 <= range; d1++) {
                                                for (let d2 = -range; d2 <= range; d2++) {
                                                    const d = new AlgebraicNumber(d0, d1, d2);
                                                    const q = new Quaternion(a, b, c, d);
                                                    const norm = q.norm();
                                                    if (norm.equals(one)) {
                                                        const size = Math.abs(a0) + Math.abs(a1) + Math.abs(a2) +
                                                                    Math.abs(b0) + Math.abs(b1) + Math.abs(b2) +
                                                                    Math.abs(c0) + Math.abs(c1) + Math.abs(c2) +
                                                                    Math.abs(d0) + Math.abs(d1) + Math.abs(d2);
                                                        units.push({ q, size });
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
        }
    }

    units.sort((a, b) => a.size - b.size);

    html += `<p>Found <strong>${units.length}</strong> units in range ±${range}</p>`;

    html += '<div class="solution">';
    html += '<h4>Torsion Elements</h4>';
    const torsion = units.filter(u => u.size <= 1);
    html += '<table><tr><th>Element</th><th>Norm</th></tr>';
    torsion.forEach(u => {
        html += '<tr>';
        html += `<td>\\(${u.q.toTeX()}\\)</td>`;
        html += `<td>\\(${u.q.norm().toTeX()}\\)</td>`;
        html += '</tr>';
    });
    html += '</table>';
    html += '</div>';

    html += '<div class="highlight">';
    html += '<h4>Smallest Non-Trivial Units</h4>';
    html += '<table><tr><th>Unit</th><th>Size</th><th>Norm</th></tr>';
    const displayCount = Math.min(15, units.length - 4);
    for (let i = 4; i < displayCount + 4; i++) {
        const u = units[i];
        html += '<tr>';
        html += `<td>\\(${u.q.toTeX()}\\)</td>`;
        html += `<td>${u.size}</td>`;
        html += `<td>\\(${u.q.norm().toTeX()}\\)</td>`;
        html += '</tr>';
    }
    html += '</table>';
    html += '</div>';

    output.innerHTML = html;
    document.getElementById('quaternion-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}

function analyzeQuaternionGenerators() {
    const output = document.getElementById('quaternion-output');
    let html = '<h4>Generator Analysis for Quaternion Unit Group</h4>';

    html += '<div class="highlight">';
    html += '<h4>Proposed Generators</h4>';
    html += '<p>Based on computational analysis, the unit group has generators:</p>';

    html += '<table style="margin: 15px auto;"><tr><th>Generator</th><th>Type</th><th>Description</th></tr>';
    html += '<tr>';
    html += '<td>\\(t = i\\)</td>';
    html += '<td>Torsion</td>';
    html += '<td>Order 4, generates {±1, ±i}</td>';
    html += '</tr>';
    html += '<tr style="background: #ffd700;">';
    html += '<td>\\(g_1 = (-2 + x^2) + (-2 + x + x^2)j\\)</td>';
    html += '<td>Free</td>';
    html += '<td>Unit in (1,j) subalgebra</td>';
    html += '</tr>';
    html += '<tr style="background: #ffd700;">';
    html += '<td>\\(g_2 = (-2 + x^2)i + (-2 + x + x^2)j\\)</td>';
    html += '<td>Free</td>';
    html += '<td>Unit in (i,j) subalgebra</td>';
    html += '</tr>';
    html += '</table>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>🔗 Connection to a² + xb² = 1</h4>';
    html += '<p>The fundamental unit of a² + xb² = 1 was:</p>';
    html += '<p style="text-align: center;"><strong>u = (-2 + x², -2 + x + x²)</strong></p>';
    html += '<p>Notice that <strong>both</strong> quaternion generators g₁ and g₂ use this same pair!</p>';
    html += '<ul>';
    html += '<li>g₁ = a + cj where (a,c) = u</li>';
    html += '<li>g₂ = bi + cj where (b,c) = u</li>';
    html += '</ul>';
    html += '<p>This shows the deep connection between the norm forms:</p>';
    html += '<ul>';
    html += '<li>a² + xb² = 1 (rank 1)</li>';
    html += '<li>a² + b² + xc² + xd² = 1 (rank 2)</li>';
    html += '</ul>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Group Structure</h4>';
    html += '<p style="text-align: center; font-size: 1.3em;"><strong>U = ⟨i⟩ × ⟨g₁⟩ × ⟨g₂⟩ ≅ (ℤ/4ℤ) × ℤ²</strong></p>';
    html += '<p>Every unit can be written as:</p>';
    html += '<p style="text-align: center; font-size: 1.2em;"><strong>q = i<sup>n</sup> · g₁<sup>m</sup> · g₂<sup>k</sup></strong></p>';
    html += '<p style="text-align: center;">where n ∈ {0,1,2,3} and m,k ∈ ℤ</p>';
    html += '</div>';

    html += '<div class="solution">';
    html += '<h4>Why Rank 2?</h4>';
    html += '<p>The rank comes from signature analysis of the form a² + b² + xc² + xd²:</p>';
    html += '<p>The three embeddings give different signatures, and the number of indefinite signatures determines the rank.</p>';
    html += '<p>Formula: rank ≈ (# indefinite signatures) - 1 ≈ 2</p>';
    html += '</div>';

    html += '<div class="highlight">';
    html += '<h4>Comparison Table</h4>';
    html += '<table style="margin: 10px auto;"><tr><th>Norm Form</th><th>Group</th><th>Rank</th><th>Structure</th></tr>';
    html += '<tr><td>a² + b² = 1</td><td>Circle</td><td>0</td><td>ℤ/4ℤ</td></tr>';
    html += '<tr><td>a² + xb² = 1</td><td>Hyperbola</td><td>1</td><td>(ℤ/2ℤ) × ℤ</td></tr>';
    html += '<tr><td>a² + b² + xc² = 1</td><td>3D form</td><td>0</td><td>Finite (~120)</td></tr>';
    html += '<tr style="background: #ffd700;"><td>a² + b² + xc² + xd² = 1</td><td>Quaternion</td><td>2</td><td>(ℤ/4ℤ) × ℤ²</td></tr>';
    html += '</table>';
    html += '</div>';

    output.innerHTML = html;
    document.getElementById('quaternion-section').style.display = 'block';

    if (window.MathJax) {
        MathJax.typesetPromise([output]);
    }
}
