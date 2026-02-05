/**
 * Matrix input module: Complex number parsing, matrix input UI, and generator management
 * Adapted from /poincare/ for use with poincare2
 */

import { Complex, Matrix2x2 } from './math.js';
import { exampleLibrary } from './groupLibrary.js';

// Re-export for use in other modules
export { exampleLibrary };

// Convert LaTeX to expression string for math.js
export function latexToExpr(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let parserString = String(latex);

    // Normalize common wrappers / symbols
    parserString = parserString.replace(/\\left|\\right/g, '');
    parserString = parserString.replace(/\u2212/g, '-');
    parserString = parserString.replace(/\\mathrm\{?i\}?/g, 'i');
    parserString = parserString.replace(/\\operatorname\{?i\}?/g, 'i');

    // Replace Greek letters with their names (for use as variable names)
    parserString = parserString.replace(/\\alpha/g, 'alpha');
    parserString = parserString.replace(/\\beta/g, 'beta');
    parserString = parserString.replace(/\\gamma/g, 'gamma');
    parserString = parserString.replace(/\\delta/g, 'delta');
    parserString = parserString.replace(/\\epsilon/g, 'epsilon');
    parserString = parserString.replace(/\\zeta/g, 'zeta');
    parserString = parserString.replace(/\\eta/g, 'eta');
    parserString = parserString.replace(/\\theta/g, 'theta');
    parserString = parserString.replace(/\\iota/g, 'iota');
    parserString = parserString.replace(/\\kappa/g, 'kappa');
    parserString = parserString.replace(/\\lambda/g, 'lambda');
    parserString = parserString.replace(/\\mu/g, 'mu');
    parserString = parserString.replace(/\\nu/g, 'nu');
    parserString = parserString.replace(/\\xi/g, 'xi');
    parserString = parserString.replace(/\\omicron/g, 'omicron');
    parserString = parserString.replace(/\\rho/g, 'rho');
    parserString = parserString.replace(/\\sigma/g, 'sigma');
    parserString = parserString.replace(/\\tau/g, 'tau');
    parserString = parserString.replace(/\\upsilon/g, 'upsilon');
    parserString = parserString.replace(/\\phi/g, 'phi');
    parserString = parserString.replace(/\\chi/g, 'chi');
    parserString = parserString.replace(/\\psi/g, 'psi');
    parserString = parserString.replace(/\\omega/g, 'omega');

    // Replace LaTeX constructs
    parserString = parserString.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1)/($2)');
    parserString = parserString.replace(/\\sqrt\[(.+?)\]\{(.+?)\}/g, 'nthRoot($2, $1)');
    parserString = parserString.replace(/\\sqrt\{(.+?)\}/g, 'sqrt($1)');
    parserString = parserString.replace(/x_\{(.+?)\}/g, 'x$1');
    parserString = parserString.replace(/x_(\d+)/g, 'x$1');
    parserString = parserString.replace(/\\(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)h?\((.*)?\)/g, '$1($2)');
    parserString = parserString.replace(/\\log_\{(.+?)\}\((.+?)\)/g, 'log($2, $1)');
    parserString = parserString.replace(/\\ln\((.+?)\)/g, 'log($1)');
    parserString = parserString.replace(/\\pi/g, 'pi');
    parserString = parserString.replace(/\\times/g, '*');
    parserString = parserString.replace(/\\div/g, '/');
    parserString = parserString.replace(/e\^\{(.+?)\}/g, 'exp($1)');

    // Handle cases like sqrt(5)i -> sqrt(5)*i (implicit multiplication with i)
    parserString = parserString.replace(/\)i(?![a-z])/g, ')*i');
    parserString = parserString.replace(/(\d)i(?![a-z])/g, '$1*i');

    // Handle implicit multiplication between numbers and variables (e.g., 2omega -> 2*omega)
    parserString = parserString.replace(/(\d)([a-z])/gi, '$1*$2');
    // Handle implicit multiplication between ) and variables (e.g., )omega -> )*omega)
    parserString = parserString.replace(/\)([a-z])/gi, ')*$1');

    return parserString;
}

// Evaluate complex expression using math.js, with optional constants scope
export function evalComplexExpression(expr, constants = {}) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/\u2212/g, '-');
        const val = math.evaluate(expr, constants);

        function toComplex(v) {
            if (v == null) return new Complex(0, 0);
            if (typeof v === 'object' && typeof v.re === 'number' && typeof v.im === 'number') {
                return new Complex(v.re, v.im);
            }
            if (typeof v === 'object' && typeof v.valueOf === 'function') {
                const num = Number(v.valueOf());
                if (!Number.isNaN(num)) return new Complex(num, 0);
            }
            if (typeof v === 'number') return new Complex(v, 0);
            if (typeof v === 'string') {
                const n = Number(v);
                if (!Number.isNaN(n)) return new Complex(n, 0);
            }
            return new Complex(NaN, NaN);
        }

        return toComplex(val);
    } catch (e) {
        return new Complex(NaN, NaN);
    }
}

// Add a constant input UI element
export function addConstantInput(labelValue = '', exprValue = '') {
    const container = document.getElementById('constantsInputs');
    if (!container) return;

    const constantBlock = document.createElement('div');
    constantBlock.className = 'constant-block';
    constantBlock.innerHTML = `
        <span class="constant-label-input" data-initial="${labelValue}"></span>
        <span class="constant-equals">=</span>
        <span class="constant-expr-input" data-initial="${exprValue}"></span>
        <button class="delete-constant-btn">✖</button>
    `;

    constantBlock.querySelector('.delete-constant-btn').addEventListener('click', () => {
        constantBlock.remove();
    });

    container.appendChild(constantBlock);

    // Initialize MathQuill on the input fields
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (MQ) {
        const labelSpan = constantBlock.querySelector('.constant-label-input');
        const exprSpan = constantBlock.querySelector('.constant-expr-input');

        const labelField = MQ.MathField(labelSpan, {
            spaceBehavesLikeTab: true,
            handlers: { edit: () => { } }
        });
        const exprField = MQ.MathField(exprSpan, {
            spaceBehavesLikeTab: true,
            handlers: { edit: () => { } }
        });

        const labelInit = labelSpan.getAttribute('data-initial') || '';
        const exprInit = exprSpan.getAttribute('data-initial') || '';

        labelField.latex(String(labelInit).replace(/\*\*/g, '^'));
        exprField.latex(String(exprInit).replace(/\*\*/g, '^'));

        labelSpan.MathQuill = () => labelField;
        exprSpan.MathQuill = () => exprField;
    }
}

// Extract constants from UI
export function getConstantsFromUI() {
    const constants = {};
    const blocks = document.querySelectorAll('#constantsInputs .constant-block');

    for (const block of blocks) {
        const labelSpan = block.querySelector('.constant-label-input');
        const exprSpan = block.querySelector('.constant-expr-input');

        const labelLatex = getLatex(labelSpan);
        const exprLatex = getLatex(exprSpan);

        // Convert label LaTeX to plain variable name
        let varName = latexToExpr(labelLatex);
        // Simple cleanup for variable names
        varName = varName.replace(/[^a-zA-Z0-9_]/g, '');
        if (!varName) continue;

        // Evaluate expression with previously defined constants
        const exprString = latexToExpr(exprLatex);
        const complexVal = evalComplexExpression(exprString, constants);

        // Store in constants scope for math.js
        constants[varName] = complexVal.im === 0 ? complexVal.re : math.complex(complexVal.re, complexVal.im);
    }

    return constants;
}

// Add a matrix input UI element
export function addMatrixInput(values = ['1', '0', '0', '1']) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;

    const idx = container.querySelectorAll('.matrix-block').length;
    const matrixBlock = document.createElement('div');
    matrixBlock.className = 'matrix-block';
    matrixBlock.innerHTML = `
        <div style="position:relative;padding-right:34px;">
            <label style="display:block;">
                <span class="matrix-label">g₍${idx + 1}₎ = </span>
                <span class="matrix-bracket">(</span>
                <span class="matrix-grid-inline">
                    <span class="mq-matrix-input" data-initial="${values[0]}"></span>
                    <span class="mq-matrix-input" data-initial="${values[1]}"></span>
                    <span class="mq-matrix-input" data-initial="${values[2]}"></span>
                    <span class="mq-matrix-input" data-initial="${values[3]}"></span>
                </span>
                <span class="matrix-bracket">)</span>
            </label>
            <button class="delete-matrix-btn" style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:26px;height:30px;">✖</button>
        </div>`;

    matrixBlock.querySelector('.delete-matrix-btn').addEventListener('click', () => {
        matrixBlock.remove();
        updateMatrixLabels();
    });

    container.appendChild(matrixBlock);

    // Initialize MathQuill on the input fields
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (MQ) {
        const spans = matrixBlock.querySelectorAll('.mq-matrix-input');
        spans.forEach(span => {
            const mf = MQ.MathField(span, {
                spaceBehavesLikeTab: true,
                handlers: { edit: () => { } }
            });
            const init = span.getAttribute('data-initial') || '0';
            const normalized = String(init).replace(/\*\*/g, '^');
            mf.latex(normalized);
            span.MathQuill = () => mf;
        });
    }

    updateMatrixLabels();
}

// Update matrix labels after deletion
function updateMatrixLabels() {
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => {
        lbl.innerHTML = `$g_${i + 1} = $`;
    });

    // Render LaTeX with MathJax if available
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise(labels).catch(err => console.warn('MathJax typeset error:', err));
    }
}

// Get LaTeX from MathQuill field
function getLatex(el) {
    try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api && typeof api.latex === 'function' ? api.latex() : (el ? el.textContent : '0');
    } catch {
        return '0';
    }
}

// Extract matrices from UI as Matrix2x2 objects
export function getMatricesFromUI() {
    // First, extract all constants
    const constants = getConstantsFromUI();

    const matrices = [];
    const blocks = document.querySelectorAll('#matrixInputs .matrix-block');

    for (const block of blocks) {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const toC = (latex) => evalComplexExpression(latexToExpr(String(latex || '0')), constants);

        const a = toC(getLatex(spans[0]));
        const b = toC(getLatex(spans[1]));
        const c = toC(getLatex(spans[2]));
        const d = toC(getLatex(spans[3]));

        const det = a.mul(d).sub(b.mul(c));
        if (det.normSq() < 1e-12) {
            throw new Error('Matrix has determinant 0 (not invertible)');
        }

        matrices.push(new Matrix2x2(a, b, c, d));
    }

    return matrices;
}

// Get generators (matrices and their inverses) from UI
export function getGeneratorsFromUI() {
    const matrices = getMatricesFromUI();
    const generators = [];
    for (const m of matrices) {
        generators.push(m);
        generators.push(m.inv());
    }
    return generators;
}

// Load an example
function setExample(example, exampleName = '') {
    const matrixContainer = document.getElementById('matrixInputs');
    const constantsContainer = document.getElementById('constantsInputs');
    if (!matrixContainer) return;

    // Clear matrices and constants
    matrixContainer.innerHTML = '';
    if (constantsContainer) {
        constantsContainer.innerHTML = '';
    }

    // Special handling for Hecke group - add random n constant
    if (exampleName === 'Hecke group') {
        const randomN = Math.floor(Math.random() * 8) + 3; // Random integer from 3 to 10
        addConstantInput('n', String(randomN));
    }

    example.forEach(vals => addMatrixInput(vals.map(v => String(v).replace(/\*\*/g, '^'))));
}

// Store the onRefresh callback for use by example dropdown
let refreshCallback = null;

// Populate example dropdown
function populateExampleDropdown() {
    const sel = document.getElementById('matrix-example-select');
    if (!sel) return;

    exampleLibrary.forEach((ex, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = ex.name;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        const idx = parseInt(sel.value, 10);
        if (idx >= 0 && idx < exampleLibrary.length) {
            const example = exampleLibrary[idx];
            setExample(example.mats, example.name);
            // Trigger refresh after a short delay for MathQuill to initialize
            if (refreshCallback) {
                setTimeout(refreshCallback, 50);
            }
        }
    });
}

// Setup matrix input UI
export function setupMatrixInput(onRefresh) {
    refreshCallback = onRefresh;

    // Find and load Figure eight knot group as default
    const figEightIndex = exampleLibrary.findIndex(e => e.name === 'Figure eight knot group');
    if (figEightIndex >= 0) {
        const example = exampleLibrary[figEightIndex];
        setExample(example.mats, example.name);
    } else {
        // Fallback to basic matrices
        addMatrixInput(['1', '0', '0', '1']);
        addMatrixInput(['0', '-1', '1', '0']);
    }

    // Populate examples
    populateExampleDropdown();

    // Add matrix button
    const addMatrixBtn = document.getElementById('addMatrixBtn');
    if (addMatrixBtn) {
        addMatrixBtn.addEventListener('click', () => addMatrixInput());
    }

    // Add constant button
    const addConstantBtn = document.getElementById('addConstantBtn');
    if (addConstantBtn) {
        addConstantBtn.addEventListener('click', () => addConstantInput());
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn && onRefresh) {
        refreshBtn.addEventListener('click', onRefresh);
    }
}

