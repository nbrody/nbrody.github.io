/**
 * Matrix and constant input: 2×2 grids of MathQuill fields, read EXACTLY as
 * elements of the global field K (ℚ, or ℚ(w) when a number field is on).
 * Errors name the offending entry and outline it in red.
 */
import { latexToPlain } from './localField.js';

const ENTRY_NAMES = ['(1,1)', '(1,2)', '(2,1)', '(2,2)'];

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

export function addConstantInput(labelValue = '', exprValue = '') {
    const container = document.getElementById('constantsInputs');
    if (!container) return;
    const block = document.createElement('div');
    block.className = 'constant-block';
    block.innerHTML = `
        <span class="constant-label-input"></span>
        <span class="constant-equals">=</span>
        <span class="constant-expr-input"></span>
        <button class="delete-constant-btn" title="Remove this constant">✖</button>`;
    block.querySelector('.delete-constant-btn').addEventListener('click', () => block.remove());
    container.appendChild(block);
    mathField(block.querySelector('.constant-label-input'), labelValue);
    mathField(block.querySelector('.constant-expr-input'), exprValue);
}

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

/** Named constants as a Map name → element of K, defined in order. */
export function readConstants(F) {
    const scope = new Map();
    document.querySelectorAll('#constantsInputs .constant-block').forEach((block, i) => {
        const labelSpan = block.querySelector('.constant-label-input');
        const exprSpan = block.querySelector('.constant-expr-input');
        const name = latexToPlain(getLatex(labelSpan)).replace(/\s+/g, '');
        const expr = getLatex(exprSpan);
        if (!name && !String(expr).trim()) return;
        if (!/^([A-Za-z]|alpha|theta|[α-ωΑ-Ω])$/.test(name)) {
            labelSpan.classList.add('mq-error');
            throw new Error(`constant ${i + 1}: name it with a single letter`);
        }
        if (name === F.gen) {
            labelSpan.classList.add('mq-error');
            throw new Error(`constant ${i + 1}: ${name} is already the field generator`);
        }
        try {
            scope.set(name, F.parse(latexToPlain(expr), scope));
            exprSpan.classList.remove('mq-error');
        } catch (e) {
            exprSpan.classList.add('mq-error');
            throw new Error(`constant ${name}: ${e.message}`);
        }
    });
    return scope;
}

/** The generators as matrices { a, b, c, d } over K. */
export function readMatrices(F) {
    const scope = readConstants(F);
    const out = [];
    document.querySelectorAll('#matrixInputs .matrix-block').forEach((block, gi) => {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const vals = [0, 1, 2, 3].map((k) => {
            const latex = getLatex(spans[k]);
            try {
                const v = F.parse(latexToPlain(latex), scope);
                spans[k].classList.remove('mq-error');
                return v;
            } catch (e) {
                spans[k].classList.add('mq-error');
                throw new Error(`g${gi + 1}, entry ${ENTRY_NAMES[k]}: ${e.message}`);
            }
        });
        const [a, b, c, d] = vals;
        if (F.isZero(F.sub(F.mul(a, d), F.mul(b, c)))) {
            spans.forEach((s) => s.classList.add('mq-error'));
            throw new Error(`g${gi + 1} has determinant 0`);
        }
        out.push({ a, b, c, d });
    });
    return out;
}

/** The inputs as typed: { mats: [[latex ×4], …], consts: [[name, value], …] }. */
export function getInputState() {
    const mats = [...document.querySelectorAll('#matrixInputs .matrix-block')]
        .map((b) => [...b.querySelectorAll('.mq-matrix-input')].map(getLatex));
    const consts = [...document.querySelectorAll('#constantsInputs .constant-block')]
        .map((b) => [getLatex(b.querySelector('.constant-label-input')), getLatex(b.querySelector('.constant-expr-input'))]);
    return { mats, consts };
}

export function applyInputState(st) {
    document.getElementById('matrixInputs').innerHTML = '';
    document.getElementById('constantsInputs').innerHTML = '';
    for (const [n, v] of st.consts || []) addConstantInput(n, v);
    for (const m of st.mats || []) addMatrixInput(m.map(String));
}

export function setupMatrixInput() {
    document.getElementById('addMatrixBtn')?.addEventListener('click', () => addMatrixInput());
    document.getElementById('addConstantBtn')?.addEventListener('click', () => addConstantInput());
}
