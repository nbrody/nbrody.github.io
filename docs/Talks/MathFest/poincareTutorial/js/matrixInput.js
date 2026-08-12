/**
 * Matrix input module: Complex number parsing, matrix input UI, and generator management
 * Adapted from /poincare/ for use with poincare2
 */

import { Complex, Matrix2x2 } from './math.js';
import { exampleLibrary } from './groupLibrary.js';
import { parseKElem, ExactMat } from './exact.js';

// Re-export for use in other modules
export { exampleLibrary };

// --- Exact-arithmetic mode ---
// When a NumberField is configured, entries are parsed EXACTLY as elements
// of K and the floating-point matrices are derived from the embedding, so
// the floats and the exact values agree by construction.
let exactField = null;          // NumberField | null
let lastExactGens = null;       // ExactMat[] from the most recent parse

/** Enable (field) / disable (null) exact entry parsing. */
export function configureExact(field) {
    exactField = field;
    lastExactGens = null;
}

/** { field, gens } from the last successful exact parse, or null. */
export function getExactContext() {
    if (!exactField || !lastExactGens) return null;
    return { field: exactField, gens: lastExactGens };
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
        // We use a regex that handles one level of nesting safely, then repeat
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
    parserString = parserString.replace(/\)i(?![a-z])/g, ')*i');
    parserString = parserString.replace(/(\d)i(?![a-z])/g, '$1*i');
    parserString = parserString.replace(/(\d)([a-z])/gi, '$1*$2');
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

// Add a matrix input UI element. `anti` marks the generator as
// orientation-reversing: the map z ↦ (a·z̄+b)/(c·z̄+d).
export function addMatrixInput(values = ['1', '0', '0', '1'], anti = false) {
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
                <label class="anti-toggle" title="Click to conjugate first: z ↦ (a·z̄+b)/(c·z̄+d) — an orientation-reversing generator (reflection / glide reflection).">
                    <input type="checkbox" class="anti-checkbox"${anti ? ' checked' : ''}>
                    <span class="anti-glyph">z</span>
                </label>
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
    const exactGens = exactField ? [] : null;
    if (exactField && Object.keys(constants).length > 0) {
        throw new Error('Exact mode does not support the Constants section — write entries in the field generator.');
    }

    for (const block of blocks) {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const antiBox = block.querySelector('.anti-checkbox');
        const anti = !!(antiBox && antiBox.checked);
        if (exactField && anti && !exactField.hasConj()) {
            throw new Error('Orientation-reversing (z̄) generators in exact mode need complex ' +
                'conjugation as a field automorphism, which is not configured for this field/root — ' +
                'use a field closed under conjugation (real embedding or degree 2), a preset that ' +
                'supplies σ(w), or turn off exact mode.');
        }

        let a, b, c, d;
        if (exactField) {
            // Exact path: parse each entry as an element of K, embed for floats.
            const toK = (latex) => parseKElem(latexToExpr(String(latex || '0')), exactField);
            const ea = toK(getLatex(spans[0])), eb = toK(getLatex(spans[1]));
            const ec = toK(getLatex(spans[2])), ed = toK(getLatex(spans[3]));
            const em = new ExactMat(ea, eb, ec, ed, anti);
            if (em.det().isZero()) {
                throw new Error('Matrix has determinant 0 exactly (not invertible)');
            }
            exactGens.push(em);
            const z = (e) => { const v = e.embed(); return new Complex(v.re, v.im); };
            a = z(ea); b = z(eb); c = z(ec); d = z(ed);
        } else {
            const toC = (latex) => evalComplexExpression(latexToExpr(String(latex || '0')), constants);
            a = toC(getLatex(spans[0]));
            b = toC(getLatex(spans[1]));
            c = toC(getLatex(spans[2]));
            d = toC(getLatex(spans[3]));
        }

        const det = a.mul(d).sub(b.mul(c));
        if (det.normSq() < 1e-12) {
            throw new Error('Matrix has determinant 0 (not invertible)');
        }

        // Normalize to determinant 1 so all downstream formulas (orbit maps,
        // log/exp animation) can assume SL(2,C).
        matrices.push(new Matrix2x2(a, b, c, d, anti).normalized());
    }

    if (exactField) lastExactGens = exactGens;
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

// Load an example. `anti` is an optional per-matrix array of booleans marking
// orientation-reversing generators.
function setExample(example, exampleName = '', consts = null, anti = null) {
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

    // Library-provided constants ([name, latex] pairs, defined in order)
    if (consts) {
        consts.forEach(([name, expr]) => addConstantInput(name, expr));
    }

    example.forEach((vals, i) => addMatrixInput(
        vals.map(v => String(v).replace(/\*\*/g, '^')),
        !!(anti && anti[i])));
}

/**
 * Configure exact mode for a library example: examples with an `exact` spec
 * ({gen?, minpoly, root, conj?}) enable exact mode with that field; examples
 * without one disable it (their entries are plain float expressions).
 * main.js owns the exact-panel state and listens for this event.
 */
function setExampleExact(spec) {
    window.dispatchEvent(new CustomEvent('poincare:set-exact', { detail: spec || null }));
}

// Store the onRefresh callback for use by the example picker
let refreshCallback = null;

/** Load library example `idx` into the inputs and refresh. */
export function loadExample(idx) {
    if (!(idx >= 0 && idx < exampleLibrary.length)) return;
    const example = exampleLibrary[idx];
    setExample(example.mats, example.name, example.consts, example.anti);
    setExampleExact(example.exact);
    // Trigger refresh after a short delay for MathQuill to initialize
    if (refreshCallback) {
        setTimeout(refreshCallback, 50);
    }
}

// ---- Example picker modal ----
// Categories are shown in this order; presets keep library order inside each.
const CATEGORY_ORDER = [
    'Knots, links & bundles',
    'Kaleidoscopes — reflection groups',
    'Arithmetic & Bianchi groups',
    'Surfaces & Fuchsian groups',
    'Closed 3-manifolds',
    'Fractal limit sets'
];

function buildExampleModal() {
    const modal = document.createElement('div');
    modal.id = 'example-modal';
    modal.className = 'example-modal';
    modal.hidden = true;

    const cats = new Map();
    exampleLibrary.forEach((ex, idx) => {
        const cat = ex.cat || 'Other';
        if (!cats.has(cat)) cats.set(cat, []);
        cats.get(cat).push({ ex, idx });
    });
    const ordered = [
        ...CATEGORY_ORDER.filter(c => cats.has(c)),
        ...[...cats.keys()].filter(c => !CATEGORY_ORDER.includes(c))
    ];

    let html = `
        <div class="example-modal-backdrop"></div>
        <div class="example-modal-panel" role="dialog" aria-label="Example library">
            <div class="example-modal-head">
                <h3>Example Library</h3>
                <button class="example-modal-close" aria-label="Close">×</button>
            </div>
            <div class="example-modal-body">`;
    for (const cat of ordered) {
        html += `<section class="example-cat">
                <h4 class="example-cat-title">${cat}</h4>
                <div class="example-grid">`;
        for (const { ex, idx } of cats.get(cat)) {
            const badges =
                (ex.exact ? '<span class="ex-badge exact" title="Certifies with exact arithmetic">exact</span>' : '') +
                (ex.anti ? '<span class="ex-badge mirrors" title="Orientation-reversing generators">mirrors</span>' : '');
            html += `<button class="example-card" data-idx="${idx}">
                    <span class="example-card-head">
                        <span class="example-name">${ex.name}</span>
                        <span class="example-badges">${badges}</span>
                    </span>
                    ${ex.desc ? `<span class="example-desc">${ex.desc}</span>` : ''}
                </button>`;
        }
        html += `</div></section>`;
    }
    html += `</div></div>`;
    modal.innerHTML = html;
    document.body.appendChild(modal);

    const close = () => { modal.hidden = true; };
    modal.querySelector('.example-modal-backdrop').addEventListener('click', close);
    modal.querySelector('.example-modal-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) { e.stopPropagation(); close(); }
    }, true);
    modal.querySelectorAll('.example-card').forEach(card => {
        card.addEventListener('click', () => {
            close();
            loadExample(parseInt(card.dataset.idx, 10));
        });
    });

    const openBtn = document.getElementById('load-example-btn');
    if (openBtn) openBtn.addEventListener('click', () => { modal.hidden = false; });
    return modal;
}

// Format a complex number as a MathQuill-friendly string like "1.25-0.5i"
function formatComplexEntry(re, im) {
    const fmt = x => String(Number(x.toPrecision(12)));
    if (Math.abs(im) < 1e-12) return fmt(re);
    const imPart = (Math.abs(Math.abs(im) - 1) < 1e-12 ? '' : fmt(Math.abs(im))) + 'i';
    if (Math.abs(re) < 1e-12) return (im < 0 ? '-' : '') + imPart;
    return fmt(re) + (im < 0 ? '-' : '+') + imPart;
}

// A group passed in the URL, e.g. exported from the Riley slice tool:
//   ?riley=<re>,<im>   →  ⟨(1 ρ; 0 1), (1 0; 1 1)⟩      (classical Riley ρ)
//   ?rileyz=<re>,<im>  →  ⟨(1 z; 0 1), (0 −1; 1 0)⟩     (symmetric z, ρ = z²)
function loadGroupFromURL() {
    const qs = new URLSearchParams(location.search);
    const parseComplex = s => {
        if (!s) return null;
        const parts = s.split(',').map(Number);
        return parts.length === 2 && parts.every(Number.isFinite)
            ? formatComplexEntry(parts[0], parts[1]) : null;
    };
    const rho = parseComplex(qs.get('riley'));
    if (rho) {
        setExample([['1', rho, '0', '1'], ['1', '0', '1', '1']], 'Riley');
        return true;
    }
    const z = parseComplex(qs.get('rileyz'));
    if (z) {
        setExample([['1', z, '0', '1'], ['0', '-1', '1', '0']], 'Riley symmetric');
        return true;
    }
    return false;
}

// Setup matrix input UI
export function setupMatrixInput(onRefresh) {
    refreshCallback = onRefresh;

    // A group in the URL wins; otherwise load Figure eight knot group
    const figEightIndex = exampleLibrary.findIndex(e => e.name === 'Figure eight knot group');
    if (loadGroupFromURL()) {
        // loaded from ?riley=...
    } else if (figEightIndex >= 0) {
        const example = exampleLibrary[figEightIndex];
        setExample(example.mats, example.name, example.consts, example.anti);
    } else {
        // Fallback to basic matrices
        addMatrixInput(['1', '0', '0', '1']);
        addMatrixInput(['0', '-1', '1', '0']);
    }

    // Example picker modal (opened by the Load Example button)
    buildExampleModal();

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

