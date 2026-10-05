/**
 * Matrix input: the generator and constant editors, the example library, and
 * the page's input state for permalinks.
 *
 * Entries and constants are read by expr.js: exactly, into a tower of number
 * fields, whenever every value is algebraic, and in floating point
 * otherwise. The floating-point matrices are the embeddings of the exact
 * ones, so the two agree by construction. Constants come in two kinds of
 * row: `name = expression`, and `name root of polynomial` with the root
 * chosen by clicking it in the complex plane.
 */

import { Complex, Matrix2x2 } from './math.js';
import { exampleLibrary } from './groupLibrary.js';
import { readGroup, numericPolyRoots } from './expr.js';

// Re-export for use in other modules
export { exampleLibrary };

const ENTRY_NAMES = ['(1,1)', '(1,2)', '(2,1)', '(2,2)'];

let lastBuilt = null;           // { matrices, exactCtx, read } from the most recent successful parse

/** { field, gens } from the last successful parse when it was exact, else null. */
export function getExactContext() {
    return lastBuilt ? lastBuilt.exactCtx : null;
}

/**
 * Read a group from plain data { mats, anti, consts } (no DOM): the
 * normalized floating-point generators, the exact context when every entry
 * is algebraic, and expr.js's report (field, fallback reason, root menus).
 * Errors carry err.where = { constant } or { gen, entry }.
 */
export function buildGroup(state) {
    const read = readGroup(state);
    const matrices = read.entries.map((e, g) => {
        const [a, b, c, d] = e.map(z => new Complex(z.re, z.im));
        const det = a.mul(d).sub(b.mul(c));
        // Written so that NaN fails too (NaN < x is false for every x).
        if (!(det.normSq() >= 1e-12)) {
            const err = new Error(`g${g + 1} has determinant 0 (not invertible)`);
            err.where = { gen: g };
            throw err;
        }
        // Normalize to determinant 1 so all downstream formulas (orbit maps,
        // log/exp animation) can assume SL(2,C).
        return new Matrix2x2(a, b, c, d, !!(state.anti && state.anti[g])).normalized();
    });
    return { matrices, exactCtx: read.exact ? { field: read.field, gens: read.gens } : null, read };
}

// ---------------- MathQuill helpers ----------------

function mathField(span, initial) {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (!MQ) { span.textContent = initial; return; }
    const mf = MQ.MathField(span, { spaceBehavesLikeTab: true, handlers: { edit: () => { } } });
    mf.latex(String(initial ?? '').replace(/\*\*/g, '^'));
    span.MathQuill = () => mf;
}

function getLatex(el) {
    try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api && typeof api.latex === 'function' ? api.latex() : (el ? el.textContent : '');
    } catch {
        return '';
    }
}

// ---------------- constants ----------------

/** A row `name = expression`. */
export function addConstantInput(labelValue = '', exprValue = '') {
    const block = constantBlock('value');
    if (!block) return null;
    mathField(block.querySelector('.constant-label-input'), labelValue);
    mathField(block.querySelector('.constant-expr-input'), exprValue);
    return block;
}

/** A row `name root of polynomial`; `near` ({re, im}) picks the root, else the first. */
export function addRootInput(name = 'w', poly = '', near = null) {
    const block = constantBlock('root');
    if (!block) return null;
    mathField(block.querySelector('.constant-label-input'), name);
    mathField(block.querySelector('.constant-expr-input'), poly);
    block._near = near && Number.isFinite(near.re) ? { re: near.re, im: near.im || 0 } : null;
    block._roots = [];
    const plot = block.querySelector('.root-picker');
    if (plot && window.RootPicker) {
        block._picker = window.RootPicker.create(plot, {
            onSelect: (i) => {
                if (!block._roots[i]) return;
                block._near = block._roots[i];
                if (refreshCallback) refreshCallback();
            },
        });
    }
    return block;
}

function constantBlock(kind) {
    const container = document.getElementById('constantsInputs');
    if (!container) return null;
    const block = document.createElement('div');
    block.className = `constant-block${kind === 'root' ? ' root-block' : ''}`;
    block.dataset.kind = kind;
    block.innerHTML = kind === 'root'
        ? `<div class="constant-row">
               <span class="constant-label-input"></span>
               <span class="constant-equals constant-rootof" title="The constant is the chosen root of this polynomial in it">root of</span>
               <span class="constant-expr-input"></span>
               <button class="delete-constant-btn" title="Remove" aria-label="Remove constant">✖</button>
           </div>
           <div class="root-picker"></div>`
        : `<div class="constant-row">
               <span class="constant-label-input"></span>
               <span class="constant-equals">=</span>
               <span class="constant-expr-input"></span>
               <button class="delete-constant-btn" title="Remove" aria-label="Remove constant">✖</button>
           </div>`;
    block.querySelector('.delete-constant-btn').addEventListener('click', () => block.remove());
    container.appendChild(block);
    return block;
}

/** The constants as rows for expr.js: ['name', 'expr'] or { name, poly, near }. */
function getConstantRows() {
    return [...document.querySelectorAll('#constantsInputs .constant-block')].map(block => {
        const name = getLatex(block.querySelector('.constant-label-input'));
        const src = getLatex(block.querySelector('.constant-expr-input'));
        return block.dataset.kind === 'root' ? { name, poly: src, near: block._near || null } : [name, src];
    });
}

/** Show each root row's roots after a parse, and remember the chosen one. */
function updateRootPickers(roots) {
    document.querySelectorAll('#constantsInputs .constant-block').forEach((block, i) => {
        if (block.dataset.kind !== 'root') return;
        const data = roots && roots[i];
        block._roots = data ? data.roots : [];
        if (data && !block._near) block._near = data.roots[data.index];
        if (block._picker) {
            const name = getLatex(block.querySelector('.constant-label-input')).replace(/\\/g, '') || 'w';
            block._picker.set(block._roots, data ? data.index : 0, name);
        }
    });
}

// ---------------- collapsed view ----------------

// The constants show collapsed by default: one typeset line each, giving its
// algebraic description (p = (1+√5)/2, or w² + w + 1 = 0 with w ≈ −0.5 + 0.866i).
// Expanding shows the editor.
let constantsExpanded = false;

/** Show the editor (true) or the summary (false). */
export function setConstantsExpanded(on) {
    constantsExpanded = !!on;
    document.getElementById('constants-group')?.classList.toggle('expanded', constantsExpanded);
    const toggle = document.getElementById('constants-toggle');
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(constantsExpanded));
        toggle.title = constantsExpanded ? 'Show the summary' : 'Show the editor';
    }
    if (constantsExpanded) {
        // Fields laid out while hidden measure their radicals and fractions again.
        document.querySelectorAll('#constantsInputs .constant-label-input, #constantsInputs .constant-expr-input').forEach(sp => {
            try { sp.MathQuill?.().reflow(); } catch (e) { /* not a MathQuill field */ }
        });
    } else {
        renderConstantsSummary();
    }
}

function approxTex(z) {
    const f = (x) => String(Number(x.toFixed(4)));
    const re = Math.abs(z.re) < 5e-5 ? 0 : z.re, im = Math.abs(z.im) < 5e-5 ? 0 : z.im;
    if (!im) return f(re);
    const imPart = `${f(Math.abs(im)) === '1' ? '' : f(Math.abs(im))}i`;
    return re ? `${f(re)} ${im < 0 ? '-' : '+'} ${imPart}` : `${im < 0 ? '-' : ''}${imPart}`;
}

/** One typeset line per constant; clicking one opens the editor at that row. */
function renderConstantsSummary() {
    const el = document.getElementById('constants-summary');
    if (!el) return;
    const items = [];
    document.querySelectorAll('#constantsInputs .constant-block').forEach((block, i) => {
        const name = getLatex(block.querySelector('.constant-label-input')).trim();
        const src = getLatex(block.querySelector('.constant-expr-input')).trim();
        if (!name && !src) return;
        const tex = block.dataset.kind === 'root'
            ? `${src || '?'} = 0` + (block._near ? `,\\quad ${name || '?'} \\approx ${approxTex(block._near)}` : '')
            : `${name || '?'} = ${src || '?'}`;
        items.push(`<button class="cs-item" type="button" data-row="${i}" title="Edit this constant">\\(\\displaystyle ${escapeHtml(tex)}\\)</button>`);
    });
    if (window.MathJax && MathJax.typesetClear) MathJax.typesetClear([el]);
    el.innerHTML = items.length ? items.join('')
        : '<button class="cs-item cs-empty" type="button" title="Add a constant">None</button>';
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([el]).catch(err => console.warn('MathJax typeset error:', err));
    }
}

function setupConstantsView() {
    document.getElementById('constants-toggle')?.addEventListener('click', () => setConstantsExpanded(!constantsExpanded));
    document.getElementById('constants-summary')?.addEventListener('click', (e) => {
        const item = e.target.closest('.cs-item');
        if (!item) return;
        setConstantsExpanded(true);
        const block = document.querySelectorAll('#constantsInputs .constant-block')[item.dataset.row];
        try { block?.querySelector('.constant-expr-input')?.MathQuill?.().focus(); } catch (err) { /* not a MathQuill field */ }
    });
    setConstantsExpanded(constantsExpanded);
}

// ---------------- the field status line ----------------

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderFieldStatus(read) {
    const el = document.getElementById('field-status');
    if (!el) return;
    if (!read) { el.innerHTML = ''; return; }
    if (read.exact) {
        const K = read.field;
        el.innerHTML = `<span class="fs-badge exact">exact</span> over \\(${K.tex()}\\)` +
            (K.deg > 1 ? `, degree ${K.deg}` : '');
        el.title = 'Every entry is an algebraic number: the certifier checks the group relations exactly in PGL₂ of this field.';
    } else {
        el.innerHTML = `<span class="fs-badge float">floating point</span> ` +
            (read.reasonWhere ? `<span class="fs-where">${escapeHtml(read.reasonWhere)}:</span> ` : '') +
            `${escapeHtml(read.reason)}.`;
        el.title = 'Some value is not an algebraic number this tool can represent, so the group is computed numerically.';
    }
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([el]).catch(err => console.warn('MathJax typeset error:', err));
    }
}

// ---------------- generators ----------------

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
                    <span class="mq-matrix-input"></span>
                    <span class="mq-matrix-input"></span>
                    <span class="mq-matrix-input"></span>
                    <span class="mq-matrix-input"></span>
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
    matrixBlock.querySelectorAll('.mq-matrix-input').forEach((span, k) => mathField(span, values[k] ?? '0'));
    updateMatrixLabels();
}

// Update matrix labels after deletion
function updateMatrixLabels() {
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => {
        lbl.innerHTML = `$g_{${i + 1}} = $`;
    });

    // Render LaTeX with MathJax if available
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise(labels).catch(err => console.warn('MathJax typeset error:', err));
    }
}

/** Outline the field an error points at (err.where from expr.js). */
function markError(where) {
    document.querySelectorAll('#matrixInputs .mq-error, #constantsInputs .mq-error').forEach(el => el.classList.remove('mq-error'));
    if (!where) return;
    if (where.constant != null) {
        setConstantsExpanded(true);
        const block = document.querySelectorAll('#constantsInputs .constant-block')[where.constant];
        block?.querySelectorAll('.constant-label-input, .constant-expr-input').forEach(el => el.classList.add('mq-error'));
    } else if (where.gen != null) {
        const block = document.querySelectorAll('#matrixInputs .matrix-block')[where.gen];
        const spans = block ? block.querySelectorAll('.mq-matrix-input') : [];
        if (where.entry != null) spans[where.entry]?.classList.add('mq-error');
        else spans.forEach(el => el.classList.add('mq-error'));
    }
}

// Extract matrices from UI as Matrix2x2 objects
export function getMatricesFromUI() {
    let built;
    try {
        built = buildGroup(getInputState());
    } catch (e) {
        markError(e.where);
        throw e;
    }
    markError(null);
    lastBuilt = built;
    updateRootPickers(built.read.roots);
    if (!constantsExpanded) renderConstantsSummary();
    renderFieldStatus(built.read);
    return built.matrices;
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

// ---------------- loading groups ----------------

/** Add the constants rows of a preset or permalink. */
function addConstantRows(consts) {
    for (const row of consts || []) {
        if (Array.isArray(row)) addConstantInput(row[0], row[1]);
        else if (row && 'poly' in row) addRootInput(row.name, row.poly, row.near);
    }
}

/**
 * The root row replacing an old exact-arithmetic spec { gen, minpoly, root?,
 * rootIndex? } (permalinks from before constants and fields were merged).
 * rootIndex counted the roots sorted by real part, then imaginary part.
 */
function legacyExactRow(spec) {
    const name = spec.gen || 'w', poly = String(spec.minpoly || name);
    let near = spec.root || null;
    if (!near) {
        try {
            const roots = numericPolyRoots(poly, name).sort((x, y) => (x.re - y.re) || (x.im - y.im));
            near = roots[Math.min(spec.rootIndex || 0, roots.length - 1)] || null;
        } catch (e) { near = null; }
    }
    return { name, poly, near };
}

// Load an example. `anti` is an optional per-matrix array of booleans marking
// orientation-reversing generators.
function setExample(example, exampleName = '', consts = null, anti = null) {
    const matrixContainer = document.getElementById('matrixInputs');
    const constantsContainer = document.getElementById('constantsInputs');
    if (!matrixContainer) return;

    // Clear matrices and constants
    matrixContainer.innerHTML = '';
    if (constantsContainer) constantsContainer.innerHTML = '';
    renderFieldStatus(null);

    // Special handling for Hecke group - add random n constant
    if (exampleName === 'Hecke group') {
        const randomN = Math.floor(Math.random() * 8) + 3; // Random integer from 3 to 10
        addConstantInput('n', String(randomN));
    }

    addConstantRows(consts);
    if (!constantsExpanded) renderConstantsSummary();

    example.forEach((vals, i) => addMatrixInput(
        vals.map(v => String(v).replace(/\*\*/g, '^')),
        !!(anti && anti[i])));
}

// Store the onRefresh callback for use by the example picker
let refreshCallback = null;

/** Load library example `idx` into the inputs and refresh. */
export function loadExample(idx) {
    if (!(idx >= 0 && idx < exampleLibrary.length)) return;
    const example = exampleLibrary[idx];
    setExample(example.mats, example.name, example.consts, example.anti);
    // Some presets need a deeper search (a long accidental parabolic).
    const wl = document.getElementById('wordLength');
    if (wl) wl.value = String(example.depth || 8);
    window.dispatchEvent(new CustomEvent('poincare:example', { detail: { name: example.name } }));
    // Trigger refresh after a short delay for MathQuill to initialize
    if (refreshCallback) {
        setTimeout(refreshCallback, 50);
    }
}

// ---- Input state (permalinks) ----

/** The current inputs as plain data: matrices (LaTeX), mirror flags, constants. */
export function getInputState() {
    const mats = [], anti = [];
    document.querySelectorAll('#matrixInputs .matrix-block').forEach(block => {
        mats.push([...block.querySelectorAll('.mq-matrix-input')].map(sp => getLatex(sp)));
        anti.push(!!block.querySelector('.anti-checkbox')?.checked);
    });
    return { mats, anti, consts: getConstantRows() };
}

/** Replace the inputs (no refresh). A state from before the merge may carry `exact`. */
export function applyInputState(st) {
    if (!st || !Array.isArray(st.mats) || !st.mats.length) return false;
    const consts = (st.consts || []).slice();
    if (st.exact && st.exact.minpoly && !consts.some(r => r && !Array.isArray(r))) consts.unshift(legacyExactRow(st.exact));
    setExample(st.mats.map(m => m.map(String)), '', consts.length ? consts : null, st.anti || null);
    return true;
}

// ---- Example picker modal ----
// Categories are shown in this order; presets keep library order inside each.
const CATEGORY_ORDER = [
    'Knots, links & bundles',
    'Riley slice — pleating-ray cusps',
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
            const badges = ex.anti ? '<span class="ex-badge mirrors" title="Orientation-reversing generators">mirrors</span>' : '';
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
export function setupMatrixInput(onRefresh, initialState = null) {
    refreshCallback = onRefresh;

    // A permalink wins, then a group in the query string, then the default.
    const figEightIndex = exampleLibrary.findIndex(e => e.name === 'Figure eight knot group');
    if (initialState && applyInputState(initialState)) {
        // loaded from #s=…
    } else if (loadGroupFromURL()) {
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
    setupConstantsView();

    document.getElementById('addMatrixBtn')?.addEventListener('click', () => addMatrixInput());
    document.getElementById('addConstantBtn')?.addEventListener('click', () => addConstantInput());
    document.getElementById('addRootBtn')?.addEventListener('click', () => {
        const used = new Set(getConstantRows().map(r => (Array.isArray(r) ? r[0] : r.name)));
        const name = ['w', 'u', 'v', 'x', 'y'].find(n => !used.has(n)) || '';
        addRootInput(name, name ? `${name}^2+1` : '');
    });

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn && onRefresh) {
        refreshBtn.addEventListener('click', onRefresh);
    }
}
