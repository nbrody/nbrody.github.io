/**
 * Matrix and constant input, as in Kleinian/poincare: 2×2 grids of MathQuill
 * fields, and one list of constants of two kinds,
 *
 *     p = expression            a value row
 *     w root of polynomial      a root row, the root chosen by clicking it
 *
 * Entries and constants are read EXACTLY by expr.js into a tower of number
 * fields: fractions and decimals, i, radicals, roots of unity, cos and sin at
 * rational multiples of π, and roots of polynomials. The tree is built over
 * the field they generate. (Unlike poincare there is no floating-point
 * fallback: a p-adic tree needs exact numbers.)
 */
import { readGroup } from '../../../../../assets/js/hyperbolic/expr.js';

// ---------------- MathQuill helpers ----------------

function mathField(span, initial) {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (!MQ) { span.textContent = initial; return; }
    const mf = MQ.MathField(span, { spaceBehavesLikeTab: true, handlers: { edit: () => span.classList.remove('mq-error') } });
    mf.latex(String(initial ?? '').replace(/\*\*/g, '^'));
    span.MathQuill = () => mf;
}

function getLatex(el) {
    try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api && typeof api.latex === 'function' ? api.latex() : (el ? el.textContent : '');
    } catch { return ''; }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const typeset = (el) => { if (window.MathJax && typeof MathJax.typeset === 'function') { try { MathJax.typeset([el]); } catch (e) { /* loading */ } } };

let refreshCallback = null;

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
    block.querySelector('.delete-constant-btn').addEventListener('click', () => { block.remove(); renderConstantsSummary(); });
    container.appendChild(block);
    return block;
}

/** The constants as rows for expr.js: ['name', 'expr'] or { name, poly, near }. */
function getConstantRows() {
    return [...document.querySelectorAll('#constantsInputs .constant-block')].map((block) => {
        const name = getLatex(block.querySelector('.constant-label-input'));
        const src = getLatex(block.querySelector('.constant-expr-input'));
        return block.dataset.kind === 'root' ? { name, poly: src, near: block._near || null } : [name, src];
    });
}

/** Names already used by constants, so a new row can pick a fresh one. */
export function freshName(prefer = ['w', 'u', 'v', 'x', 'y', 'z']) {
    const used = new Set(getConstantRows().map((r) => (Array.isArray(r) ? r[0] : r.name)));
    return prefer.find((n) => !used.has(n)) || '';
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

// ---------------- the collapsed view ----------------

// The constants show collapsed by default: one typeset line each, giving its
// algebraic description. Expanding shows the editor.
let constantsExpanded = false;

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
        document.querySelectorAll('#constantsInputs .constant-label-input, #constantsInputs .constant-expr-input').forEach((sp) => {
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
    el.innerHTML = items.length ? items.join('')
        : '<button class="cs-item cs-empty" type="button" title="Add a constant">None</button>';
    typeset(el);
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

export function renderFieldStatus(read) {
    const el = document.getElementById('field-status');
    if (!el) return;
    if (!read) { el.innerHTML = ''; return; }
    if (read.exact) {
        const K = read.field;
        el.innerHTML = `<span class="fs-badge exact">exact</span> over \\(${K.tex()}\\)` + (K.deg > 1 ? `, degree ${K.deg}` : '');
        el.title = 'Every entry is an algebraic number: the tree is built over the field they generate.';
    } else {
        el.innerHTML = `<span class="fs-badge float">not exact</span> ` +
            (read.reasonWhere ? `<span class="fs-where">${escapeHtml(read.reasonWhere)}:</span> ` : '') +
            `${escapeHtml(read.reason)}. A p-adic tree needs algebraic numbers.`;
        el.title = 'Some value is not an algebraic number this tool can represent.';
    }
    typeset(el);
}

// ---------------- generators ----------------

export function addMatrixInput(values = ['1', '0', '0', '1']) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;
    const block = document.createElement('div');
    block.className = 'matrix-block';
    block.innerHTML = `
        <div style="position:relative;padding-right:34px;white-space:nowrap;">
            <label>
                <span class="matrix-label"></span>
                <span class="matrix-bracket">(</span>
                <span class="matrix-grid-inline">
                    <span class="mq-matrix-input"></span><span class="mq-matrix-input"></span>
                    <span class="mq-matrix-input"></span><span class="mq-matrix-input"></span>
                </span>
                <span class="matrix-bracket">)</span>
            </label>
            <button class="delete-matrix-btn" title="Remove this generator"
                style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:26px;height:30px;">✖</button>
        </div>`;
    block.querySelector('.delete-matrix-btn').addEventListener('click', () => { block.remove(); updateMatrixLabels(); });
    container.appendChild(block);
    block.querySelectorAll('.mq-matrix-input').forEach((span, i) => mathField(span, values[i] ?? '0'));
    updateMatrixLabels();
}

function updateMatrixLabels() {
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => { lbl.innerHTML = `$g_{${i + 1}} = $`; });
    if (window.MathJax && typeof MathJax.typeset === 'function') {
        try { MathJax.typeset([...labels]); } catch (e) { /* MathJax still loading */ }
    }
}

/** Outline the field an error points at (err.where from expr.js). */
function markError(where, extraNames = []) {
    document.querySelectorAll('#matrixInputs .mq-error, #constantsInputs .mq-error').forEach((el) => el.classList.remove('mq-error'));
    document.querySelectorAll('.extra-input.input-error').forEach((el) => el.classList.remove('input-error'));
    if (!where) return;
    const nMats = document.querySelectorAll('#matrixInputs .matrix-block').length;
    if (where.constant != null) {
        setConstantsExpanded(true);
        const block = document.querySelectorAll('#constantsInputs .constant-block')[where.constant];
        block?.querySelectorAll('.constant-label-input, .constant-expr-input').forEach((el) => el.classList.add('mq-error'));
    } else if (where.gen != null && where.gen < nMats) {
        const block = document.querySelectorAll('#matrixInputs .matrix-block')[where.gen];
        const spans = block ? block.querySelectorAll('.mq-matrix-input') : [];
        if (where.entry != null) spans[where.entry]?.classList.add('mq-error');
        else spans.forEach((el) => el.classList.add('mq-error'));
    } else if (where.gen != null) {
        document.getElementById(extraNames[where.gen - nMats]?.id)?.classList.add('input-error');
    }
}

/**
 * Read the generators, the constants and `extra` numbers (each { id, label,
 * src }: the base vertex, a preset's prime) exactly, in one tower.
 * Returns { read, nMats, extra: [TElem] }; throws with a located message.
 */
export function readInputs(extra = []) {
    const state = getInputState();
    const nMats = state.mats.length;
    const mats = state.mats.concat(extra.map((x) => ['1', String(x.src ?? '0') || '0', '0', '1']));
    let read;
    try {
        read = readGroup({ mats, consts: state.consts });
    } catch (e) {
        markError(e.where, extra);
        if (e.where && e.where.gen != null && e.where.gen >= nMats) {
            const x = extra[e.where.gen - nMats];
            throw new Error(`${x.label}: ${e.message.replace(/^g\d+, entry \(1,2\): /, '')}`);
        }
        throw e;
    }
    markError(null);
    updateRootPickers(read.roots);
    if (!constantsExpanded) renderConstantsSummary();
    renderFieldStatus(read);
    return {
        read, nMats,
        gens: read.exact ? read.gens.slice(0, nMats) : null,
        extra: read.exact ? read.gens.slice(nMats).map((M) => M.b) : null,
    };
}

/** The inputs as typed: { mats: [[latex ×4], …], consts: [row, …] }. */
export function getInputState() {
    const mats = [...document.querySelectorAll('#matrixInputs .matrix-block')]
        .map((b) => [...b.querySelectorAll('.mq-matrix-input')].map(getLatex));
    return { mats, consts: getConstantRows() };
}

/** Replace the inputs (no refresh). Rows are ['name', 'expr'] or { name, poly, near }. */
export function applyInputState(st) {
    document.getElementById('matrixInputs').innerHTML = '';
    document.getElementById('constantsInputs').innerHTML = '';
    renderFieldStatus(null);
    for (const row of st.consts || []) {
        if (Array.isArray(row)) addConstantInput(row[0], row[1]);
        else if (row && 'poly' in row) addRootInput(row.name, row.poly, row.near);
    }
    if (!constantsExpanded) renderConstantsSummary();
    for (const m of st.mats || []) addMatrixInput(m.map(String));
}

export function setupMatrixInput(onRefresh) {
    refreshCallback = onRefresh;
    setupConstantsView();
    document.getElementById('addMatrixBtn')?.addEventListener('click', () => addMatrixInput());
    document.getElementById('addConstantBtn')?.addEventListener('click', () => { addConstantInput(); setConstantsExpanded(true); });
    document.getElementById('addRootBtn')?.addEventListener('click', () => {
        const name = freshName();
        addRootInput(name, name ? `${name}^2+1` : '');
        setConstantsExpanded(true);
    });
}
