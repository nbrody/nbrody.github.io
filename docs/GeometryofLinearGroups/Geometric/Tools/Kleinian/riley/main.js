// Main application code

// Initialize visualization
let visualization;

// Event handlers
document.getElementById('calculateButton').addEventListener('click', () => {
    const p = parseInt(document.getElementById('numerator').value);
    const q = parseInt(document.getElementById('denominator').value);
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    if (isNaN(p) || isNaN(q) || q <= 0 || p < 0) {
        resultsDiv.innerHTML = '<p class="error">Please enter valid non-negative integers with q > 0.</p>';
        return;
    }

    const reduced = reduceFraction(p, q);
    const poly = getRileyPolynomial(reduced.p, reduced.q);

    if (poly === null) {
        resultsDiv.innerHTML = `<p class="error">Could not compute polynomial for ${reduced.p}/${reduced.q}. The recursion may require additional base cases or a higher iteration limit.</p>`;
        return;
    }

    // Get matrix word and compute matrix
    const word = getMatrixWord(reduced.p, reduced.q);
    const matrix = word ? computeMatrixFromWord(word) : null;

    let html = '';

    // Display Stern-Brocot tree
    html += '<div class="polynomial-display" style="background-color: #fff9f0;">';
    html += `<h3>Stern-Brocot Tree for \\(\\frac{${reduced.p}}{${reduced.q}}\\)</h3>`;
    html += '<p style="text-align: center; color: #666; font-size: 14px; margin-bottom: 15px;">The path to the target fraction is highlighted in blue:</p>';
    html += generateSternBrocotTree(reduced.p, reduced.q);
    html += '</div>';

    // Display linear path diagram
    html += '<div class="polynomial-display" style="background-color: #fff9f0; margin-top: 20px;">';
    html += `<h3>Construction Sequence</h3>`;
    html += '<p style="text-align: center; color: #666; font-size: 14px; margin-bottom: 15px;">Step-by-step construction using the mediant operation:</p>';
    html += generateFareyPathDiagram(reduced.p, reduced.q);
    html += '</div>';

    // Display Farey word and matrix
    if (word && matrix) {
        html += '<div class="polynomial-display" style="background-color: #f0f8ff;">';
        html += `<h3>Farey Word for \\(\\frac{${reduced.p}}{${reduced.q}}\\)</h3>`;
        html += `<p style="font-size: 20px; text-align: center; font-family: monospace; font-weight: bold; color: #0066cc; margin: 15px 0;">${word}</p>`;
        html += `<p style="text-align: center; margin-top: 20px;"><strong>Corresponding Matrix:</strong></p>`;
        html += `<div style="text-align: center; margin: 20px 0;">\\[${formatMatrixLatex(matrix)}\\]</div>`;
        html += '<p style="font-size: 12px; color: #666; text-align: center;">where \\(L = \\begin{pmatrix}1 & 0 \\\\ z & 1\\end{pmatrix}\\) and \\(R = \\begin{pmatrix}1 & z \\\\ 0 & 1\\end{pmatrix}\\)</p>';
        html += '</div>';
    }

    html += '<div class="polynomial-display">';
    html += `<h3>Riley Polynomial \\(Q\\left(\\frac{${reduced.p}}{${reduced.q}}\\right)\\)</h3>`;
    html += `<div class="polynomial">\\[${poly.toLatex()}\\]</div>`;

    if (p !== reduced.p || q !== reduced.q) {
        html += `<p style="margin-top: 10px; color: #6c757d; font-size: 14px;">Note: Reduced from ${p}/${q} to ${reduced.p}/${reduced.q}</p>`;
    }

    html += '</div>';

    // Show degree and coefficients
    html += '<div class="computation-steps">';
    html += '<h4>Polynomial Details</h4>';
    html += `<p><strong>Degree:</strong> ${poly.coeffs.length - 1}</p>`;
    html += `<p><strong>Coefficients</strong> (from \\(z^0\\) to \\(z^{${poly.coeffs.length - 1}}\\)):</p>`;
    html += '<p style="font-family: monospace;">[' + poly.coeffs.join(', ') + ']</p>';

    // Show roots of Q + 2
    const polyPlus2 = poly.add(Polynomial.fromConstant(2));
    const roots = polyPlus2.findRoots();
    if (roots.length > 0) {
        html += `<h4 style="margin-top: 15px;">Roots of \\(Q\\left(\\frac{${reduced.p}}{${reduced.q}}\\right) + 2\\)</h4>`;
        html += '<ul style="font-size: 14px; list-style: none; padding-left: 0;">';
        roots.forEach((root, i) => {
            const re = root.re.toFixed(4);
            const im = Math.abs(root.im).toFixed(4);
            const sign = root.im >= 0 ? '+' : '-';
            const rootStr = Math.abs(root.im) < 1e-6
                ? `${re}`
                : `${re} ${sign} ${im}i`;
            html += `<li>\\(z_{${i + 1}} = ${rootStr}\\)</li>`;
        });
        html += '</ul>';
    }

    html += '</div>';

    resultsDiv.innerHTML = html;

    // Typeset the MathJax content
    if (window.MathJax) {
        MathJax.typesetPromise([resultsDiv]).catch((err) => console.log('MathJax typeset error:', err));
    }

    // Plot visualization
    setTimeout(() => {
        visualization.plotRealLocus(p, q);
    }, 100);
});

// Trigger calculation on Enter key
document.getElementById('numerator').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('calculateButton').click();
});
document.getElementById('denominator').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('calculateButton').click();
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    visualization = new RileyVisualization('rileyCanvas');

    // Initial calculation
    document.getElementById('calculateButton').click();

    // Initial plot
    setTimeout(() => {
        const p = parseInt(document.getElementById('numerator').value);
        const q = parseInt(document.getElementById('denominator').value);
        visualization.plotRealLocus(p, q);
    }, 200);
});
