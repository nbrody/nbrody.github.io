/**
 * Matrix input module: Real number parsing, matrix input UI, and generator management
 */

// Real number wrapper (for consistency with previous Complex interface)
export class Complex {
    constructor(re = 0) {
        this.re = re;
        this.im = 0;  // Always zero for real numbers
    }

    add(z) {
        return new Complex(this.re + z.re);
    }

    sub(z) {
        return new Complex(this.re - z.re);
    }

    mul(z) {
        return new Complex(this.re * z.re);
    }

    div(z) {
        if (z.re === 0) return new Complex(Infinity);
        return new Complex(this.re / z.re);
    }

    conjugate() {
        return new Complex(this.re);
    }

    normSq() {
        return this.re * this.re;
    }

    abs() {
        return Math.abs(this.re);
    }

    toString() {
        const formatNum = (x) => {
            if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
            return String(parseFloat(x.toFixed(6)));
        };
        return formatNum(this.re);
    }
}

// Matrix2 class for 2x2 matrices
export class Matrix2 {
    constructor(a, b, c, d) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }

    multiply(m) {
        return new Matrix2(
            this.a.mul(m.a).add(this.b.mul(m.c)),
            this.a.mul(m.b).add(this.b.mul(m.d)),
            this.c.mul(m.a).add(this.d.mul(m.c)),
            this.c.mul(m.b).add(this.d.mul(m.d))
        );
    }

    determinant() {
        return this.a.mul(this.d).sub(this.b.mul(this.c));
    }

    inverse() {
        const det = this.determinant();
        if (det.normSq() === 0) return null;
        const invDet = new Complex(1, 0).div(det);
        return new Matrix2(
            this.d.mul(invDet),
            this.b.mul(new Complex(-1, 0)).mul(invDet),
            this.c.mul(new Complex(-1, 0)).mul(invDet),
            this.a.mul(invDet)
        );
    }

    isIdentity() {
        const eps = 1e-9;
        return Math.abs(this.a.re - 1) < eps && Math.abs(this.a.im) < eps &&
            Math.abs(this.b.re) < eps && Math.abs(this.b.im) < eps &&
            Math.abs(this.c.re) < eps && Math.abs(this.c.im) < eps &&
            Math.abs(this.d.re - 1) < eps && Math.abs(this.d.im) < eps;
    }

    neg() {
        const minus = new Complex(-1, 0);
        return new Matrix2(
            this.a.mul(minus),
            this.b.mul(minus),
            this.c.mul(minus),
            this.d.mul(minus)
        );
    }

    trace() {
        return this.a.add(this.d);
    }

    toString() {
        return `[[${this.a}, ${this.b}], [${this.c}, ${this.d}]]`;
    }
}

// Convert LaTeX to expression string for math.js
export function latexToExpr(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let parserString = String(latex);

    // Normalize common wrappers / symbols
    parserString = parserString.replace(/\\left|\\right/g, '');
    parserString = parserString.replace(/\u2212/g, '-');
    parserString = parserString.replace(/\\mathrm\{?i\}?/g, 'i');
    parserString = parserString.replace(/\\operatorname\{?i\}?/g, 'i');

    // Replace LaTeX constructs
    parserString = parserString.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1)/($2)');
    parserString = parserString.replace(/\\sqrt\[(.+?)\]\{(.+?)\}/g, 'nthRoot($2, $1)');
    parserString = parserString.replace(/\\sqrt\{(.+?)\}/g, 'sqrt($1)');
    parserString = parserString.replace(/x_\{(.+?)\}/g, 'x$1');
    parserString = parserString.replace(/x_(\d+)/g, 'x$1');
    parserString = parserString.replace(/\\(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)h?\((.*?)\)/g, '$1($2)');
    parserString = parserString.replace(/\\log_\{(.+?)\}\((.+?)\)/g, 'log($2, $1)');
    parserString = parserString.replace(/\\ln\((.+?)\)/g, 'log($1)');
    parserString = parserString.replace(/\\pi/g, 'pi');
    parserString = parserString.replace(/\\times/g, '*');
    parserString = parserString.replace(/\\div/g, '/');
    parserString = parserString.replace(/e\^\{(.+?)\}/g, 'exp($1)');

    return parserString;
}

// Evaluate real expression using math.js (reject complex/imaginary numbers)
export function evalComplexExpression(expr, scope = {}) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/\u2212/g, '-');

        // Reject expressions containing 'i' (imaginary unit)
        if (/[iI]/.test(expr) && !/\b(sin|cos|tan|sinh|cosh|tanh|pi|ln)\b/.test(expr)) {
            throw new Error('Complex numbers not allowed');
        }

        const val = math.evaluate(expr, scope);

        function toReal(v) {
            if (v == null) return new Complex(0);

            // Check if it's a complex number with non-zero imaginary part
            if (typeof v === 'object' && typeof v.re === 'number' && typeof v.im === 'number') {
                if (Math.abs(v.im) > 1e-10) {
                    throw new Error('Complex numbers not allowed');
                }
                return new Complex(v.re);
            }

            if (typeof v === 'object' && typeof v.valueOf === 'function') {
                const num = Number(v.valueOf());
                if (!Number.isNaN(num)) return new Complex(num);
            }
            if (typeof v === 'number') return new Complex(v);
            if (typeof v === 'string') {
                const n = Number(v);
                if (!Number.isNaN(n)) return new Complex(n);
            }
            return new Complex(NaN);
        }

        return toReal(val);
    } catch (e) {
        return new Complex(NaN);
    }
}

// Group library
import { exampleLibrary } from './libraries/fuchsianLibrary.js';

// Re-export for use in other modules
export { exampleLibrary };

// Add a matrix input UI element
export function addMatrixInput(values = ['1', '0', '0', '1']) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;

    const idx = container.querySelectorAll('.matrix-block').length;
    const matrixBlock = document.createElement('div');
    matrixBlock.className = 'matrix-block';
    matrixBlock.innerHTML = `
        <div style="display:flex;align-items:center;">
            <label style="flex-grow:1;">
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
            <button class="delete-matrix-btn" style="margin-left:8px;width:26px;height:30px;">✖</button>
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

// Add a constant input UI element
export function addConstantInput(name = 't', value = '2') {
    const container = document.getElementById('constants-list');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'constant-row flex items-center gap-2 mb-2';
    row.innerHTML = `
        <input type="text" class="constant-name w-16 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 bg-gray-700 text-white border border-gray-600" value="${name}" placeholder="Name">
        <span class="text-gray-400">=</span>
        <input type="text" class="constant-value flex-1 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 bg-gray-700 text-white border border-gray-600" value="${value}" placeholder="Value">
        <button class="delete-constant-btn text-gray-400 hover:text-red-400 font-bold px-2">✖</button>
    `;

    row.querySelector('.delete-constant-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
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

// Extract matrices from UI
export function getMatricesFromUI() {
    const matrices = [];
    const blocks = document.querySelectorAll('#matrixInputs .matrix-block');

    // Get constants from UI
    const scope = {};
    document.querySelectorAll('#constants-list .constant-row').forEach(row => {
        const name = row.querySelector('.constant-name').value.trim();
        const valStr = row.querySelector('.constant-value').value;
        if (name) {
            try {
                // Evaluate constant value (using current scope to allow dependencies if order permits)
                const valComplex = evalComplexExpression(valStr, scope);
                scope[name] = isNaN(valComplex.re) ? 0 : valComplex.re;
            } catch (e) {
                scope[name] = 0;
            }
        }
    });

    for (const block of blocks) {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const toC = (latex) => evalComplexExpression(latexToExpr(String(latex || '0')), scope);

        const a = toC(getLatex(spans[0]));
        const b = toC(getLatex(spans[1]));
        const c = toC(getLatex(spans[2]));
        const d = toC(getLatex(spans[3]));

        const det = a.mul(d).sub(b.mul(c));
        if (det.normSq() < 1e-12) {
            throw new Error('Matrix has determinant 0 (not invertible)');
        }

        matrices.push(new Matrix2(a, b, c, d));
    }

    return matrices;
}

// Load an example
function setExample(example) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;

    container.innerHTML = '';
    example.forEach(vals => addMatrixInput(vals.map(v => String(v).replace(/\*\*/g, '^'))));
}

function setExampleWithConstants(ex) {
    // Clear matrices
    const container = document.getElementById('matrixInputs');
    if (container) container.innerHTML = '';

    // Clear constants
    const constContainer = document.getElementById('constants-list');
    if (constContainer) constContainer.innerHTML = '';

    // Add matrices
    ex.mats.forEach(vals => addMatrixInput(vals.map(v => String(v).replace(/\*\*/g, '^'))));

    // Add constants if any
    if (ex.constants) {
        Object.entries(ex.constants).forEach(([name, val]) => {
            addConstantInput(name, val);
        });
    }
}

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
            setExampleWithConstants(exampleLibrary[idx]);
        }
    });
}

// Setup matrix input UI
export function setupMatrixInput() {
    // Add initial matrix
    addMatrixInput();

    // Populate examples
    populateExampleDropdown();

    // Add matrix button
    const addBtn = document.getElementById('addMatrixBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addMatrixInput());
    }

    // Add constant button
    const addConstBtn = document.getElementById('addConstantBtn');
    if (addConstBtn) {
        addConstBtn.addEventListener('click', () => addConstantInput());
    }
}
