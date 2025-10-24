/**
 * Matrix input module adapted for rational matrix input
 */

import { Rational } from './pAdic.js';

// Convert LaTeX to expression string for math.js
export function latexToExpr(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let parserString = String(latex);

    // Normalize common wrappers / symbols
    parserString = parserString.replace(/\\left|\\right/g, '');
    parserString = parserString.replace(/\u2212/g, '-');

    // Replace Greek letters with their names
    parserString = parserString.replace(/\\alpha/g, 'alpha');
    parserString = parserString.replace(/\\beta/g, 'beta');
    parserString = parserString.replace(/\\gamma/g, 'gamma');
    parserString = parserString.replace(/\\delta/g, 'delta');
    parserString = parserString.replace(/\\epsilon/g, 'epsilon');
    parserString = parserString.replace(/\\theta/g, 'theta');
    parserString = parserString.replace(/\\lambda/g, 'lambda');
    parserString = parserString.replace(/\\mu/g, 'mu');
    parserString = parserString.replace(/\\omega/g, 'omega');
    parserString = parserString.replace(/\\phi/g, 'phi');
    parserString = parserString.replace(/\\pi/g, 'pi');

    // Replace LaTeX constructs
    parserString = parserString.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1)/($2)');
    parserString = parserString.replace(/\\sqrt\[(.+?)\]\{(.+?)\}/g, 'nthRoot($2, $1)');
    parserString = parserString.replace(/\\sqrt\{(.+?)\}/g, 'sqrt($1)');
    parserString = parserString.replace(/\\times/g, '*');
    parserString = parserString.replace(/\\div/g, '/');
    parserString = parserString.replace(/\\cdot/g, '*');

    // Handle implicit multiplication between numbers and variables
    parserString = parserString.replace(/(\d)([a-z])/gi, '$1*$2');
    parserString = parserString.replace(/\)([a-z])/gi, ')*$1');

    return parserString;
}

// Evaluate expression and convert to Rational
export function evalRationalExpression(expr, constants = {}) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/\u2212/g, '-');

        // First try to parse as a simple fraction (with or without parentheses)
        const fractionMatch = expr.match(/^\(?(-?\d+)\)?\s*\/\s*\(?(-?\d+)\)?$/);
        if (fractionMatch) {
            return new Rational(fractionMatch[1], fractionMatch[2]);
        }

        // Try to evaluate with math.js
        const val = math.evaluate(expr, constants);

        // Convert to rational
        if (typeof val === 'number') {
            if (Number.isInteger(val)) {
                return new Rational(BigInt(val), 1n);
            }
            // Try to convert decimal to fraction
            const sign = val < 0 ? -1n : 1n;
            const absVal = Math.abs(val);
            const tolerance = 1e-9;
            let num = 1n;
            let den = 1n;

            // Simple continued fraction approximation
            let x = absVal;
            for (let i = 0; i < 20; i++) {
                const floor = Math.floor(x);
                if (Math.abs(x - floor) < tolerance) {
                    num = BigInt(Math.round(absVal * Number(den)));
                    break;
                }
                const frac = x - floor;
                if (frac < tolerance) break;
                x = 1 / frac;

                const oldNum = num;
                num = BigInt(floor) * num + den;
                den = oldNum;

                const approx = Number(num) / Number(den);
                if (Math.abs(approx - absVal) < tolerance) break;
            }

            return new Rational(sign * num, den);
        }

        return new Rational(0n, 1n);
    } catch (e) {
        console.error('Error evaluating expression:', e);
        return new Rational(0n, 1n);
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
        varName = varName.replace(/[^a-zA-Z0-9_]/g, '');
        if (!varName) continue;

        // Evaluate expression with previously defined constants
        const exprString = latexToExpr(exprLatex);
        const val = math.evaluate(exprString, constants);

        constants[varName] = val;
    }

    return constants;
}

// Add a matrix input UI element
export function addMatrixInput(values = ['3', '1', '0', '1']) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;

    const idx = container.querySelectorAll('.matrix-block').length;
    const matrixBlock = document.createElement('div');
    matrixBlock.className = 'matrix-block';
    matrixBlock.innerHTML = `
        <div style="position:relative;padding-right:34px;white-space:nowrap;">
            <label>
                <span class="matrix-label">$g_${idx + 1} = $</span>
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

// Extract matrices from UI as Rational matrices
export function getMatricesFromUI() {
    // First, extract all constants
    const constants = getConstantsFromUI();

    const matrices = [];
    const blocks = document.querySelectorAll('#matrixInputs .matrix-block');

    for (const block of blocks) {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const toRat = (latex) => evalRationalExpression(latexToExpr(String(latex || '0')), constants);

        const a = toRat(getLatex(spans[0]));
        const b = toRat(getLatex(spans[1]));
        const c = toRat(getLatex(spans[2]));
        const d = toRat(getLatex(spans[3]));

        // Check determinant is non-zero
        const det = a.mul(d).sub(b.mul(c));
        if (det.num === 0n) {
            throw new Error('Matrix has determinant 0 (not invertible)');
        }

        matrices.push([
            [a, b],
            [c, d]
        ]);
    }

    return matrices;
}

// Setup matrix input UI
export function setupMatrixInput() {
    // Add initial matrices
    addMatrixInput(['3', '0', '0', '1']);  // ((3,0),(0,1))
    addMatrixInput(['5', '-4', '2', '-1']); // ((5,-4),(2,-1))

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
}
