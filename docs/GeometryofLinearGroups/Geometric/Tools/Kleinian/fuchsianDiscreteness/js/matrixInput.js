/**
 * matrixInput.js — MathQuill 2×2 grid input for generators with EXACT rational entries.
 */
import { parseRational } from './rparse.js';
import { Mat2Q } from './mat2.js';
import { examples } from './examples.js';

function getLatex(el) {
    try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api && typeof api.latex === 'function' ? api.latex() : (el ? el.textContent : '0');
    } catch { return '0'; }
}

export function addMatrixInput(values = ['1', '0', '0', '1']) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;
    const idx = container.querySelectorAll('.matrix-block').length;
    const block = document.createElement('div');
    block.className = 'matrix-block';
    block.innerHTML = `
        <div class="matrix-row">
            <span class="matrix-label">${labelFor(idx)} =</span>
            <span class="matrix-bracket">(</span>
            <span class="matrix-grid-inline">
                <span class="mq-matrix-input" data-initial="${values[0]}"></span>
                <span class="mq-matrix-input" data-initial="${values[1]}"></span>
                <span class="mq-matrix-input" data-initial="${values[2]}"></span>
                <span class="mq-matrix-input" data-initial="${values[3]}"></span>
            </span>
            <span class="matrix-bracket">)</span>
            <button class="delete-matrix-btn" title="Remove">✖</button>
        </div>
        <div class="matrix-readout" aria-live="polite"></div>`;
    block.querySelector('.delete-matrix-btn').addEventListener('click', () => { block.remove(); relabel(); });
    container.appendChild(block);

    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (MQ) {
        block.querySelectorAll('.mq-matrix-input').forEach(span => {
            const mf = MQ.MathField(span, { spaceBehavesLikeTab: true, handlers: { edit: () => { } } });
            mf.latex(String(span.getAttribute('data-initial') || '0'));
            span.MathQuill = () => mf;
        });
    }
    relabel();
}

function labelFor(i) { return i < 26 ? 'abcdefghijklmnopqrstuvwxyz'[i] : `g${i + 1}`; }

function relabel() {
    document.querySelectorAll('#matrixInputs .matrix-label').forEach((lbl, i) => { lbl.textContent = `${labelFor(i)} =`; });
}

/** Read generators as Mat2Q. Throws Error with a helpful message on bad/singular input. */
export function getMatricesFromUI() {
    const blocks = [...document.querySelectorAll('#matrixInputs .matrix-block')];
    if (blocks.length === 0) throw new Error('Add at least one generator.');
    const mats = [];
    blocks.forEach((block, bi) => {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const entries = [...spans].map((s, ci) => {
            try { return parseRational(getLatex(s)); }
            catch (e) { throw new Error(`Generator ${labelFor(bi)}, entry ${'abcd'[ci]}: ${e.message}`); }
        });
        const [a, b, c, d] = entries;
        const det = a.mul(d).sub(b.mul(c));
        if (det.isZero()) throw new Error(`Generator ${labelFor(bi)} is singular (det = 0).`);
        mats.push(Mat2Q.fromRationals(a, b, c, d));
    });
    return mats;
}

/** Raw LaTeX of every generator as rows [a,b,c,d] (for algebraic/number-field detection). */
export function getLatexRows() {
    return [...document.querySelectorAll('#matrixInputs .matrix-block')]
        .map(block => [...block.querySelectorAll('.mq-matrix-input')].map(getLatex));
}

export function setMatrixReadouts(htmlPerBlock) {
    document.querySelectorAll('#matrixInputs .matrix-readout').forEach((el, i) => { el.innerHTML = htmlPerBlock[i] || ''; });
}

export function loadExample(ex) {
    const container = document.getElementById('matrixInputs');
    container.innerHTML = '';
    ex.mats.forEach(vals => addMatrixInput(vals.map(String)));
}

export function setupMatrixInput(onRun) {
    const sel = document.getElementById('example-select');
    examples.forEach((ex, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = ex.name; sel.appendChild(o); });
    sel.addEventListener('change', () => {
        const ex = examples[parseInt(sel.value, 10)];
        if (!ex) return;
        loadExample(ex);
        const d = document.getElementById('example-desc'); if (d) d.textContent = ex.desc;
        setTimeout(onRun, 60);
    });
    document.getElementById('addMatrixBtn').addEventListener('click', () => addMatrixInput());
    document.getElementById('check-btn').addEventListener('click', onRun);

    // default: modular group
    loadExample(examples[0]);
    const d = document.getElementById('example-desc'); if (d) d.textContent = examples[0].desc;
}
