/**
 * Matrix input module: real-expression parsing and Seitz-matrix {R | t}
 * input UI for generators of subgroups of Isom(R^3).
 * Adapted from poincare2 (2×2 complex) to 3×4 real Seitz form.
 */

import * as THREE from 'three';
import { Iso, mat3Mul, mat3T, mat3Det } from './math.js';
import { exampleLibrary } from './groupLibrary.js';

// Re-export for use in other modules
export { exampleLibrary };

// Convert LaTeX to expression string for math.js
export function latexToExpr(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let parserString = String(latex);

    // Normalize common wrappers / symbols
    parserString = parserString.replace(/\\left|\\right/g, '');
    parserString = parserString.replace(/−/g, '-');
    parserString = parserString.replace(/\\cdot/g, '*');

    // Replace Greek letters
    const greek = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
    greek.forEach(g => {
        const re = new RegExp('\\\\' + g, 'g');
        parserString = parserString.replace(re, g);
    });

    // Handle LaTeX constructs iteratively to support nesting
    let prev;
    do {
        prev = parserString;
        // frac{a}{b} -> (a)/(b)
        parserString = parserString.replace(/\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '($1)/($2)');
        // sqrt[n]{a} -> nthRoot(a, n)
        parserString = parserString.replace(/\\sqrt\s*\[((?:[^{}]|\{[^{}]*\})*)\]\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, 'nthRoot($2, $1)');
        // sqrt{a} -> sqrt(a)
        parserString = parserString.replace(/\\sqrt\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, 'sqrt($1)');
    } while (parserString !== prev);

    // Other replacements
    parserString = parserString.replace(/x_\{(.+?)\}/g, 'x$1');
    parserString = parserString.replace(/x_(\d+)/g, 'x$1');
    parserString = parserString.replace(/\\(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)h?\((.*)?\)/g, '$1($2)');
    parserString = parserString.replace(/\\log_\{(.+?)\}\((.+?)\)/g, 'log($2, $1)');
    parserString = parserString.replace(/\\ln\((.+?)\)/g, 'log($1)');
    parserString = parserString.replace(/\\pi/g, 'pi');
    parserString = parserString.replace(/\\times/g, '*');
    parserString = parserString.replace(/\\div/g, '/');
    parserString = parserString.replace(/e\^\{(.+?)\}/g, 'exp($1)');

    // Handle implicit multiplication
    parserString = parserString.replace(/(\d)([a-z])/gi, '$1*$2');
    parserString = parserString.replace(/\)([a-z0-9])/gi, ')*$1');
    parserString = parserString.replace(/([a-z0-9])\(/gi, (m, p1, off, s) => {
        // Don't break function calls like sqrt( / cos( / pi( — only single vars & digits
        const fnNames = ['sqrt', 'nthRoot', 'sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'sinh', 'cosh', 'tanh', 'log', 'exp'];
        for (const fn of fnNames) {
            const start = off - fn.length + 1;
            if (start >= 0 && s.slice(start, off + 1) === fn) return m;
        }
        return p1 + '*(';
    });

    return parserString;
}

// Evaluate a REAL expression using math.js, with optional constants scope.
// Returns NaN on failure or if the value has a significant imaginary part.
export function evalRealExpression(expr, constants = {}) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/−/g, '-');
        const val = math.evaluate(expr, constants);

        if (val == null) return NaN;
        if (typeof val === 'number') return val;
        if (typeof val === 'object' && typeof val.re === 'number' && typeof val.im === 'number') {
            return Math.abs(val.im) < 1e-9 ? val.re : NaN;
        }
        if (typeof val === 'object' && typeof val.valueOf === 'function') {
            const num = Number(val.valueOf());
            if (!Number.isNaN(num)) return num;
        }
        if (typeof val === 'string') {
            const n = Number(val);
            if (!Number.isNaN(n)) return n;
        }
        return NaN;
    } catch (e) {
        return NaN;
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
        constants[varName] = evalRealExpression(exprString, constants);
    }

    return constants;
}

const DEFAULT_SEITZ = ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '0'];

// Add a Seitz matrix input UI element: a 3×4 grid (R | t)
export function addMatrixInput(values = DEFAULT_SEITZ) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;

    const idx = container.querySelectorAll('.matrix-block').length;
    const matrixBlock = document.createElement('div');
    matrixBlock.className = 'matrix-block';

    let cells = '';
    for (let i = 0; i < 12; i++) {
        const sep = (i % 4 === 3) ? ' seitz-t' : '';
        cells += `<span class="mq-matrix-input${sep}" data-initial="${values[i]}"></span>`;
    }
    matrixBlock.innerHTML = `
        <div style="position:relative;padding-right:34px;">
            <label style="display:block;">
                <span class="matrix-label">g₍${idx + 1}₎ = </span>
                <span class="matrix-bracket seitz-bracket">(</span>
                <span class="matrix-grid-inline seitz-grid">${cells}</span>
                <span class="matrix-bracket seitz-bracket">)</span>
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

// Extract isometries from UI as Iso objects
export function getMatricesFromUI() {
    // First, extract all constants
    const constants = getConstantsFromUI();

    const matrices = [];
    const blocks = document.querySelectorAll('#matrixInputs .matrix-block');
    let blockIdx = 0;

    for (const block of blocks) {
        blockIdx++;
        const spans = block.querySelectorAll('.mq-matrix-input');
        const vals = [];
        for (let i = 0; i < 12; i++) {
            const v = evalRealExpression(latexToExpr(String(getLatex(spans[i]) || '0')), constants);
            if (!Number.isFinite(v)) {
                throw new Error(`g${blockIdx}: entry ${Math.floor(i / 4) + 1},${(i % 4) + 1} is not a real number`);
            }
            vals.push(v);
        }

        // Row-major 3×4: rows are [r r r | t]
        const R = [vals[0], vals[1], vals[2], vals[4], vals[5], vals[6], vals[8], vals[9], vals[10]];
        const t = new THREE.Vector3(vals[3], vals[7], vals[11]);

        // The linear part must be orthogonal (an element of O(3))
        const RtR = mat3Mul(mat3T(R), R);
        let err = 0;
        for (let i = 0; i < 9; i++) {
            err = Math.max(err, Math.abs(RtR[i] - (i % 4 === 0 ? 1 : 0)));
        }
        if (err > 1e-6) {
            throw new Error(`g${blockIdx}: the 3×3 part is not orthogonal (RᵀR ≠ I, error ${err.toExponential(1)}) — not a Euclidean isometry`);
        }
        const det = mat3Det(R);
        if (Math.abs(Math.abs(det) - 1) > 1e-6) {
            throw new Error(`g${blockIdx}: the 3×3 part has |det| ≠ 1`);
        }

        // Snap to exactly orthogonal so downstream products stay clean
        matrices.push(new Iso(R, t).normalized());
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
function setExample(example, exampleName = '', consts = null) {
    const matrixContainer = document.getElementById('matrixInputs');
    const constantsContainer = document.getElementById('constantsInputs');
    if (!matrixContainer) return;

    // Clear matrices and constants
    matrixContainer.innerHTML = '';
    if (constantsContainer) {
        constantsContainer.innerHTML = '';
    }

    // Library-provided constants ([name, latex] pairs, defined in order)
    if (consts) {
        consts.forEach(([name, expr]) => addConstantInput(name, expr));
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
            setExample(example.mats, example.name, example.consts);
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

    // ?example=<name substring or index> in the URL wins; else Hantzsche–Wendt
    const qs = new URLSearchParams(location.search);
    const want = qs.get('example');
    let startIdx = exampleLibrary.findIndex(e => e.name.includes('Hantzsche'));
    if (want !== null) {
        const asNum = parseInt(want, 10);
        if (!Number.isNaN(asNum) && asNum >= 0 && asNum < exampleLibrary.length) {
            startIdx = asNum;
        } else {
            const found = exampleLibrary.findIndex(e => e.name.toLowerCase().includes(want.toLowerCase()));
            if (found >= 0) startIdx = found;
        }
    }
    if (startIdx >= 0) {
        const example = exampleLibrary[startIdx];
        setExample(example.mats, example.name, example.consts);
        const sel = document.getElementById('matrix-example-select');
        if (sel) {
            // reflect the initial choice in the dropdown once populated
            setTimeout(() => { sel.value = String(startIdx); }, 0);
        }
    } else {
        addMatrixInput();
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
