// =============================================================================
// algebra.js — Algebra panel: renders mathematical data about the group
// =============================================================================
// Depends on math.js: SL2Z class with .toLatex(), .trace(), .det(),
//                     .fixedPoints(), .isHyperbolic()
// Depends on bassSerre.js: periodicCF(), translationLength(), cfToString()
// Depends on construct.js: constructGroup(p) returns the group data
//
// Exports:
//   AlgebraPanel  — class that renders group algebraic data using MathJax
// =============================================================================

// ---------------------------------------------------------------------------
// AlgebraPanel — Renders mathematical data about the group using MathJax
// ---------------------------------------------------------------------------
class AlgebraPanel {
    /**
     * @param {HTMLElement} container - DOM element to render into (e.g. #algebra-content)
     */
    constructor(container) {
        this.container = container;
    }

    /**
     * Render all algebraic data for the group.
     * @param {Object} groupData - result from constructGroup(p)
     */
    render(groupData) {
        const { A, B, P, p } = groupData;
        const boundaries = groupData.extendedSurface.boundaries;
        const boundaryMatrices = groupData.extendedSurface.boundaryMatrices;
        const reducedWords = groupData.extendedSurface.reducedWords;
        const topology = groupData.extendedSurface.topology;
        const commutator = groupData.puncturedTorus.commutator;

        let html = '';

        // Section 1: Generators
        html += this._renderGenerators(A, B, P, p);

        // Section 2: Boundary Components
        html += this._renderBoundaries(boundaries, boundaryMatrices, reducedWords);

        // Section 3: The Commutator
        html += this._renderCommutator(commutator);

        // Section 4: Topological Invariants
        html += this._renderInvariants(p, A, topology);

        this.container.innerHTML = html;

        // Trigger MathJax rendering
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([this.container]);
        }
    }

    // -----------------------------------------------------------------------
    // Section 1: Generators
    // -----------------------------------------------------------------------
    _renderGenerators(A, B, P, p) {
        const trA = A.trace();
        const trB = B.trace();
        const trP = P.trace();

        return `
        <div class="math-block">
            <h3>Generators</h3>
            <p>Generators of \\(\\Gamma = \\langle A, B, P \\rangle \\cong F_3\\)</p>
            <div class="generator-display">
                $$ \\color{#3b82f6}{A} = ${A.toLatex()}, \\quad \\det = ${A.det()}, \\quad \\text{tr} = ${trA} $$
            </div>
            <div class="generator-display">
                $$ \\color{#ef4444}{B} = ${B.toLatex()}, \\quad \\det = ${B.det()}, \\quad \\text{tr} = ${trB} $$
            </div>
            <div class="generator-display">
                $$ \\color{#10b981}{P} = B^2 = ${P.toLatex()}, \\quad \\det = ${P.det()}, \\quad \\text{tr} = ${trP} $$
            </div>
        </div>`;
    }

    // -----------------------------------------------------------------------
    // Section 2: Boundary Components
    // -----------------------------------------------------------------------
    _renderBoundaries(boundaries, boundaryMatrices, reducedWords) {
        let html = '<div class="math-block"><h3>Boundary Components</h3>';

        for (let i = 0; i < boundaries.length; i++) {
            const mat = boundaryMatrices[i];
            const word = reducedWords[i];
            const tr = mat.trace();
            const absTr = Math.abs(tr);
            const color = i === 0 ? '#3b82f6' : '#ef4444';
            const label = i === 0 ? 'A' : 'B';

            // Format the reduced word for LaTeX display
            const wordLatex = this._wordToLatex(word);

            html += `<div style="margin-bottom: 20px; padding-left: 12px; border-left: 3px solid ${color};">`;
            html += `<h4 style="color: ${color}; margin-top: 0;">Boundary ${i + 1} (associated with ${label})</h4>`;
            html += `<p><strong>Word:</strong> \\(${wordLatex}\\)</p>`;
            html += `<div class="generator-display">$$ \\text{Matrix} = ${mat.toLatex()} $$</div>`;
            html += `<p><strong>Trace:</strong> \\(${tr}\\)</p>`;

            if (mat.isHyperbolic()) {
                const fps = mat.fixedPoints();
                const fpMinus = fps[0].toFixed(6);
                const fpPlus = fps[1].toFixed(6);

                html += `<p><strong>Fixed points:</strong> \\(\\alpha^- = ${fpMinus}, \\quad \\alpha^+ = ${fpPlus}\\)</p>`;

                // Translation length: 2 * arccosh(|tr| / 2)
                const transLength = 2 * Math.acosh(absTr / 2);
                html += `<p><strong>Translation length:</strong> \\(\\ell = 2\\,\\text{arccosh}(${absTr}/2) = ${transLength.toFixed(6)}\\)</p>`;

                // Continued fraction
                try {
                    const cf = periodicCF(mat);
                    html += `<p><strong>Continued fraction:</strong> \\(${this._cfToLatex(cf)}\\)</p>`;
                } catch (e) {
                    // periodicCF may fail for some matrices; skip CF display
                }
            }

            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // -----------------------------------------------------------------------
    // Section 3: The Commutator
    // -----------------------------------------------------------------------
    _renderCommutator(commutator) {
        if (!commutator) return '';

        const tr = commutator.trace();

        return `
        <div class="math-block">
            <h3>The Commutator</h3>
            <p>Boundary of the original punctured torus:</p>
            <div class="generator-display">
                $$ [A,B] = ABA^{-1}B^{-1} = ${commutator.toLatex()} $$
            </div>
            <p><strong>Trace:</strong> \\(\\text{tr}([A,B]) = ${tr}\\)</p>
        </div>`;
    }

    // -----------------------------------------------------------------------
    // Section 4: Topological Invariants
    // -----------------------------------------------------------------------
    _renderInvariants(p, A, topology) {
        const trA = A.trace();
        // Eigenvalues of A: (tr +/- sqrt(tr^2 - 4)) / 2
        // tr = 2 + 2p, so eigenvalues = (1+p) +/- sqrt(p^2 + 2p)
        const genus = topology.genus;
        const numBoundaries = topology.boundaries;
        const chi = 2 - 2 * genus - numBoundaries;

        return `
        <div class="math-block">
            <h3>Topological Invariants</h3>
            <table class="invariants-table">
                <thead>
                    <tr>
                        <th>Property</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Prime \\(p\\)</td>
                        <td>\\(${p}\\)</td>
                    </tr>
                    <tr>
                        <td>Generators</td>
                        <td>\\(\\color{#3b82f6}{A},\\; \\color{#ef4444}{B},\\; \\color{#10b981}{P}\\)</td>
                    </tr>
                    <tr>
                        <td>Rank of \\(\\Gamma\\)</td>
                        <td>\\(3\\)</td>
                    </tr>
                    <tr>
                        <td>Genus \\(g\\)</td>
                        <td>\\(${genus}\\)</td>
                    </tr>
                    <tr>
                        <td>Boundary components \\(b\\)</td>
                        <td>\\(${numBoundaries}\\)</td>
                    </tr>
                    <tr>
                        <td>Euler characteristic \\(\\chi\\)</td>
                        <td>\\(${chi}\\)</td>
                    </tr>
                    <tr>
                        <td>\\(\\text{tr}(A) = \\text{tr}(B)\\)</td>
                        <td>\\(2 + 2p = ${trA}\\)</td>
                    </tr>
                    <tr>
                        <td>Eigenvalues of \\(A\\)</td>
                        <td>\\((1+${p}) \\pm \\sqrt{${p * p + 2 * p}} = ${(1 + p)} \\pm \\sqrt{${p * p + 2 * p}}\\)</td>
                    </tr>
                </tbody>
            </table>
            <style>
                .invariants-table { width: 100%; border-collapse: collapse; }
                .invariants-table td, .invariants-table th {
                    padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: left;
                }
                .invariants-table th {
                    color: #64748b; font-weight: 600; font-size: 13px; text-transform: uppercase;
                }
            </style>
        </div>`;
    }

    // -----------------------------------------------------------------------
    // Helper: Convert a word array to LaTeX
    // -----------------------------------------------------------------------
    _wordToLatex(word) {
        return word.map(function(letter) {
            if (letter.endsWith('^-1')) {
                var gen = letter.slice(0, -3);
                return gen + '^{-1}';
            }
            return letter;
        }).join(' \\, ');
    }

    // -----------------------------------------------------------------------
    // Helper: Convert a periodic CF to LaTeX notation
    // -----------------------------------------------------------------------
    _cfToLatex(cf) {
        var preperiod = cf.preperiod;
        var period = cf.period;

        if (period.length === 0) {
            return '[' + preperiod.join(',\\, ') + ']';
        }
        if (preperiod.length === 0) {
            return '[\\overline{' + period.join(',\\, ') + '}]';
        }
        return '[' + preperiod.join(',\\, ') + ';\\, \\overline{' + period.join(',\\, ') + '}]';
    }
}
