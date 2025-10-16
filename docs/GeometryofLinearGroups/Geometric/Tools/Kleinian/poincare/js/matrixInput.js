/**
 * Matrix input module: Complex number parsing, matrix input UI, and generator management
 */

// Complex number class
export class Complex {
    constructor(re = 0, im = 0) {
        this.re = re;
        this.im = im;
    }

    add(z) {
        return new Complex(this.re + z.re, this.im + z.im);
    }

    sub(z) {
        return new Complex(this.re - z.re, this.im - z.im);
    }

    mul(z) {
        return new Complex(
            this.re * z.re - this.im * z.im,
            this.re * z.im + this.im * z.re
        );
    }

    div(z) {
        const denom = z.re * z.re + z.im * z.im;
        if (denom === 0) return new Complex(Infinity, Infinity);
        return new Complex(
            (this.re * z.re + this.im * z.im) / denom,
            (this.im * z.re - this.re * z.im) / denom
        );
    }

    conjugate() {
        return new Complex(this.re, -this.im);
    }

    normSq() {
        return this.re * this.re + this.im * this.im;
    }

    abs() {
        return Math.sqrt(this.normSq());
    }

    toString() {
        const formatNum = (x) => {
            if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
            return String(parseFloat(x.toFixed(6)));
        };
        const reZero = Math.abs(this.re) < 1e-9;
        const imZero = Math.abs(this.im) < 1e-9;

        if (imZero) return formatNum(this.re);
        if (reZero) {
            const coeff = this.im === 1 ? '' : this.im === -1 ? '-' : formatNum(this.im);
            return `${coeff}i`;
        }

        const rePart = formatNum(this.re);
        const imAbs = Math.abs(this.im);
        const imPart = imAbs === 1 ? 'i' : `${formatNum(imAbs)}i`;
        const sign = this.im < 0 ? '-' : '+';
        return `${rePart} ${sign} ${imPart}`;
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

// Evaluate complex expression using math.js
export function evalComplexExpression(expr) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/\u2212/g, '-');
        const val = math.evaluate(expr);

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

// Example library
const exampleLibrary = [
    { name: 'Apollonian Gasket', mats: [['1', '1+i', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'quasiSchottky', mats: [['\\sqrt{2}', '1', '1', '\\sqrt{2}'], ['\\sqrt{2}', 'i', '-i', '\\sqrt{2}']] },
    { name: 'Modular group', mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'Borromean rings group', mats: [['1', '2', '0', '1'], ['1', 'i', '0', '1'], ['1', '0', '-1-i', '1']] },
    { name: 'Z[i] congruence', mats: [['1', '2', '0', '1'], ['1', '2i', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'Surface group', mats: [['2', '-2', '0', '1/2'], ['3', '4', '2', '3']] },
    { name: 'Surface group 2', mats: [['\\sqrt{2}', '0', '0', '\\sqrt{\\frac{1}{2}}'], ['0', '-1', '1', '0'], ['1', '2', '2', '5']] },
    { name: 'Figure eight knot group', mats: [['1', '\\frac{-1+ \\sqrt{3} i}{2}', '0', '1'], ['1', '0', '1', '1']] },
    { name: 'Dense circles', mats: [['1', '2i', '0', '1'], ['\\frac{1}{\\sqrt{2}}', '\\frac{-1}{\\sqrt{2}}', '\\frac{1}{\\sqrt{2}}', '\\frac{1}{\\sqrt{2}}']] },
    { name: 'P(1/3)', mats: [['1', '\\frac{\\sqrt{7}+i}{2}', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'P(1/4)', mats: [['1', '\\sqrt{1+\\sqrt{1+2i}}', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'P(2/5)', mats: [['1', '1.1028+0.6655i', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'Hecke group', mats: [['1', '2\\cos(\\frac{\\pi}{n})', '0', '1'], ['0', '-1', '1', '0']] },
    { name: 'Figure eight fiber', mats: [['\\frac{1+\\sqrt{3}i}{2}', '1', '\\frac{-1+\\sqrt{3}i}{2}', '1'], ['\\frac{1+\\sqrt{3}i}{2}', '-1', '\\frac{1-\\sqrt{3}i}{2}', '1']] }
];

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

// Update matrix labels after deletion
function updateMatrixLabels() {
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => {
        lbl.innerHTML = `g<sub>${i + 1}</sub> = `;
    });
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

    for (const block of blocks) {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const toC = (latex) => evalComplexExpression(latexToExpr(String(latex || '0')));

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
            setExample(exampleLibrary[idx].mats);
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
}
