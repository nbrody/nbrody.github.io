/**
 * matrixUI.js
 * A module to manage the matrix input UI for the Dirichlet Polyhedron Viewer.
 * It handles creating, reading, and populating MathQuill-enabled matrix input fields.
 */
const matrixUI = (() => {
    // Module-private state
    let containerEl = null; // The DOM element that holds all matrix inputs
    let MQ = null; // The MathQuill interface, initialized if available

    // Dependencies injected from the main script during initialization
    const deps = {
        evalComplexExpression: () => ({ re: 0, im: 0 }),
        latexToExpr: (s) => s,
        Matrix2: class { },
        showMessage: () => { },
    };

    /**
     * Renders mathematical notation within the matrix container using MathJax.
     */
    function typesetMath() {
        if (window.MathJax && window.MathJax.typesetPromise && containerEl) {
            // Typeset only the container to improve performance
            window.MathJax.typesetPromise([containerEl]).catch(() => { });
        }
    }

    /**
     * Creates and appends a new matrix input row to the UI.
     * Each entry is a MathQuill editable field.
     * @param {string[]} [values=['1', '0', '0', '1']] - Initial LaTeX strings for the matrix entries [a, b, c, d].
     */
    function addMatrixInput(values = ['1', '0', '0', '1']) {
        if (!containerEl) return;

        const matrixCount = containerEl.querySelectorAll('.matrix-block').length;
        const block = document.createElement('div');
        block.className = 'matrix-block';
        block.innerHTML = `
      <div style="display:flex;align-items:center;">
        <label style="flex-grow:1;">
          <span class="matrix-label">\\( g_{${matrixCount + 1}} = \\)</span>
          <span class="matrix-bracket">(</span>
          <span class="matrix-grid-inline">
            <span class="mq-matrix-input" data-initial="${values[0]}"></span>
            <span class="mq-matrix-input" data-initial="${values[1]}"></span>
            <span class="mq-matrix-input" data-initial="${values[2]}"></span>
            <span class="mq-matrix-input" data-initial="${values[3]}"></span>
          </span>
          <span class="matrix-bracket">)</span>
        </label>
        <button class="delete-matrix-btn" style="margin-left:8px;width:26px;height:30px;" title="Delete generator">✖</button>
      </div>`;

        // Add event listener for the delete button
        block.querySelector('.delete-matrix-btn').addEventListener('click', () => {
            block.remove();
            // After removing, re-label the remaining matrices to maintain sequential numbering
            const labels = containerEl.querySelectorAll('.matrix-label');
            labels.forEach((label, i) => { label.innerHTML = `\\( g_{${i + 1}} = \\)`; });
            typesetMath();
        });

        containerEl.appendChild(block);

        // Initialize MathQuill for the new input fields if it's available
        if (MQ) {
            const spans = block.querySelectorAll('.mq-matrix-input');
            spans.forEach(span => {
                const mathField = MQ.MathField(span, {
                    spaceBehavesLikeTab: true,
                    handlers: { edit: () => { /* Optional: Add an on-edit callback */ } }
                });
                const initialValue = span.getAttribute('data-initial') || '0';
                // Normalize exponent notation for LaTeX
                const normalizedValue = String(initialValue).replace(/\*\*/g, '^');
                mathField.latex(normalizedValue);
                // Store an accessor on the element to easily retrieve the MathQuill API object later
                span.MathQuill = () => mathField;
            });
        }

        // Update all labels to ensure correct numbering
        const allLabels = containerEl.querySelectorAll('.matrix-label');
        allLabels.forEach((label, i) => { label.innerHTML = `\\( g_{${i + 1}} = \\)`; });
        typesetMath();
    }

    /**
     * Reads the current values from all matrix inputs in the UI,
     * parses them, and returns them as an array of Matrix2 objects.
     * @returns {Matrix2[]} An array of `Matrix2` instances.
     */
    function getMatrices() {
        const matrices = [];
        if (!containerEl) return matrices;

        const matrixBlocks = containerEl.querySelectorAll('.matrix-block');
        for (const block of matrixBlocks) {
            const spans = block.querySelectorAll('.mq-matrix-input');

            const getLatexValue = (element) => {
                try {
                    const api = element && typeof element.MathQuill === 'function' ? element.MathQuill() : null;
                    return api && typeof api.latex === 'function' ? api.latex() : (element ? element.textContent : '0');
                } catch {
                    return '0';
                }
            };

            const parseToComplex = (latex) => deps.evalComplexExpression(deps.latexToExpr(String(latex || '0')));

            const a = parseToComplex(getLatexValue(spans[0]));
            const b = parseToComplex(getLatexValue(spans[1]));
            const c = parseToComplex(getLatexValue(spans[2]));
            const d = parseToComplex(getLatexValue(spans[3]));

            // Validate that the matrix is invertible before adding it
            const det = a.mul(d).sub(b.mul(c));
            if (det.normSq() < 1e-12) {
                deps.showMessage('Matrix skipped: determinant is 0 (not invertible).', true);
                continue; // Skip this matrix
            }
            matrices.push(new deps.Matrix2(a, b, c, d));
        }
        return matrices;
    }

    /**
     * Clears all current matrix inputs and loads a new set from an array.
     * @param {Array<string[]>} matrixArray - An array where each element is an array of 4 strings representing a matrix.
     */
    function loadMatrices(matrixArray) {
        if (!containerEl) return;
        containerEl.innerHTML = ''; // Clear existing matrix inputs
        if (Array.isArray(matrixArray)) {
            matrixArray.forEach(matrixValues => {
                const normalizedValues = matrixValues.map(v => String(v).replace(/\*\*/g, '^'));
                addMatrixInput(normalizedValues);
            });
        }
        typesetMath();
    }

    /**
     * Initializes the module, setting up DOM element references and event listeners.
     * This must be called before any other public methods.
     * @param {object} config - The configuration object.
     * @param {string} config.containerId - ID of the DOM element to contain the matrix inputs.
     * @param {string} config.addButtonId - ID of the button that adds a new matrix row.
     * @param {object} config.dependencies - Required functions and classes from the main script.
     */
    function init(config) {
        containerEl = document.getElementById(config.containerId);
        const addButton = document.getElementById(config.addButtonId);

        if (!containerEl || !addButton) {
            console.error('MatrixUI initialization failed: Could not find required container or add button elements.');
            return;
        }

        // Inject external dependencies
        if (config.dependencies) {
            Object.assign(deps, config.dependencies);
        }

        // Safely initialize MathQuill
        MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
        if (!MQ) {
            console.warn('MathQuill library not found. Matrix input will fall back to plain text.');
        }

        // Attach event listener to the "add matrix" button
        addButton.addEventListener('click', () => addMatrixInput());
    }

    // Expose public methods
    return {
        init,
        getMatrices,
        loadMatrices,
    };
})();

// To make this module accessible from a <script type="module">, you would typically use an export statement.
// For compatibility with the provided HTML file, we'll assign it to the window object.
window.matrixUI = matrixUI;