// Main application code

// Initialize visualization
let visualization;

// Function to perform the calculation
function calculatePolynomial(skipRileySliceUpdate = false) {
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
    html += '<div class="polynomial-display">';
    html += `<h3>Stern-Brocot Tree for \\(\\frac{${reduced.p}}{${reduced.q}}\\)</h3>`;
    html += '<p style="text-align: center; color: #9ca3af; font-size: 14px; margin-bottom: 15px;">The path to the target fraction is highlighted in blue:</p>';
    html += generateSternBrocotTree(reduced.p, reduced.q);
    html += '</div>';

    // Display Farey word and matrix
    if (word && matrix) {
        html += '<div class="polynomial-display">';
        html += `<h3>Farey Word for \\(\\frac{${reduced.p}}{${reduced.q}}\\)</h3>`;
        html += `<p style="font-size: 20px; text-align: center; font-family: monospace; font-weight: bold; color: #60a5fa; margin: 15px 0;">${word}</p>`;
        html += `<p style="text-align: center; margin-top: 20px; color: #f3f4f6;"><strong>Corresponding Matrix:</strong></p>`;
        html += `<div style="text-align: center; margin: 20px 0;">\\[${formatMatrixLatex(matrix)}\\]</div>`;
        html += '<p style="font-size: 12px; color: #9ca3af; text-align: center;">where \\(L = \\begin{pmatrix}1 & 0 \\\\ z & 1\\end{pmatrix}\\) and \\(R = \\begin{pmatrix}1 & z \\\\ 0 & 1\\end{pmatrix}\\)</p>';
        html += '</div>';
    }

    resultsDiv.innerHTML = html;

    // Typeset the MathJax content
    if (window.MathJax) {
        MathJax.typesetPromise([resultsDiv]).catch((err) => console.log('MathJax typeset error:', err));
    }

    // Plot visualization
    setTimeout(() => {
        visualization.plotRealLocus(p, q);
    }, 100);

    // Update Riley Slice to highlight this polynomial (unless called from Riley Slice itself)
    if (!skipRileySliceUpdate && window.rileySliceInstance) {
        window.rileySliceInstance.highlightPolynomial(reduced.p, reduced.q);
    }
}

// Global function to update fraction (called from Stern-Brocot tree clicks and Riley Slice clicks)
function updateFraction(p, q, fromRileySlice = false) {
    const numeratorInput = document.getElementById('numerator');
    const denominatorInput = document.getElementById('denominator');
    const floatingCalc = document.getElementById('floatingCalculator');

    if (numeratorInput && denominatorInput) {
        numeratorInput.value = p;
        denominatorInput.value = q;

        // Brief visual feedback
        if (floatingCalc) {
            floatingCalc.style.borderColor = '#28a745';
            setTimeout(() => {
                floatingCalc.style.borderColor = '#007bff';
            }, 300);
        }

        // Skip Riley Slice update if this was called from Riley Slice
        calculatePolynomial(fromRileySlice);
    }
}

// Event handlers - auto-calculate when inputs change
document.getElementById('numerator').addEventListener('change', calculatePolynomial);
document.getElementById('denominator').addEventListener('change', calculatePolynomial);
document.getElementById('numerator').addEventListener('input', function() {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(calculatePolynomial, 500); // Debounce
});
document.getElementById('denominator').addEventListener('input', function() {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(calculatePolynomial, 500); // Debounce
});

// Trigger calculation on Enter key
document.getElementById('numerator').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') calculatePolynomial();
});
document.getElementById('denominator').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') calculatePolynomial();
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    visualization = new RileyVisualization('rileyCanvas');

    // Initial calculation
    calculatePolynomial();

    // Initial plot
    setTimeout(() => {
        const p = parseInt(document.getElementById('numerator').value);
        const q = parseInt(document.getElementById('denominator').value);
        visualization.plotRealLocus(p, q);
    }, 200);
});
