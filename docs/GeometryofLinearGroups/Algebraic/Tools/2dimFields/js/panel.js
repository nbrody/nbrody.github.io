// The floating control panel, after poincare's (Kleinian/poincare/js/controlPanel.js and
// matrixInput.js): tabs, collapse, the MathQuill matrix editor, segmented controls, sliders and
// the generator buttons under the picture.

const $ = (id) => document.getElementById(id);

export function typeset(els) {
    const MJ = window.MathJax;
    if (!MJ) return;
    const run = () => (MJ.typesetPromise ? MJ.typesetPromise(els).catch(() => {}) : null);
    if (MJ.startup && MJ.startup.promise) MJ.startup.promise.then(run);
    else run();
}

const typing = (e) => !!(e.target && e.target.closest && e.target.closest('input, textarea, select, .mq-editable-field'));

// ---------- tabs and collapse ----------
export function setupPanel({ onLayout }) {
    const tabBtns = [...document.querySelectorAll('.tab-btn')];
    const contents = [...document.querySelectorAll('.tab-content')];
    const nav = document.querySelector('.tab-navigation');
    const tabs = document.createElement('div');
    tabs.className = 'panel-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Controls');
    nav.prepend(tabs);
    tabBtns.forEach((b) => tabs.appendChild(b));
    const activate = (btn, focus = false) => {
        tabBtns.forEach((b) => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', String(on));
            b.tabIndex = on ? 0 : -1;
        });
        contents.forEach((c) => c.classList.toggle('active', c.id === `tab-${btn.dataset.tab}`));
        if (focus) btn.focus();
    };
    tabBtns.forEach((btn, i) => {
        btn.id = `tab-button-${btn.dataset.tab}`;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-controls', `tab-${btn.dataset.tab}`);
        $(`tab-${btn.dataset.tab}`)?.setAttribute('role', 'tabpanel');
        btn.addEventListener('click', () => activate(btn));
        btn.addEventListener('keydown', (e) => {
            const n = tabBtns.length;
            const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
            if (next === undefined) return;
            e.preventDefault();
            activate(tabBtns[next], true);
        });
    });
    activate(tabBtns.find((b) => b.classList.contains('active')) || tabBtns[0]);

    const panel = $('control-panel'), collapse = $('collapse-btn');
    const report = () => onLayout(panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().width + 24);
    const sync = () => {
        const c = panel.classList.contains('collapsed');
        collapse.title = c ? 'Expand panel (H)' : 'Collapse panel (H)';
        collapse.setAttribute('aria-label', collapse.title);
        collapse.setAttribute('aria-expanded', String(!c));   // the × turns into a + by CSS rotation
    };
    const toggle = () => { panel.classList.toggle('collapsed'); sync(); report(); };
    collapse.addEventListener('click', toggle);
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e)) toggle();
    });
    new ResizeObserver(report).observe(panel);
    if (matchMedia('(max-width: 600px)').matches) panel.classList.add('collapsed');   // a phone sees the picture first
    sync();
    report();
    return { activate: (name) => activate(tabBtns.find((b) => b.dataset.tab === name)) };
}

// ---------- small controls ----------
export function segmented(id, onChange) {
    const root = $(id), btns = [...root.querySelectorAll('[data-value]')];
    const set = (v) => btns.forEach((b) => { const on = b.dataset.value === v; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    btns.forEach((b) => b.addEventListener('click', () => { set(b.dataset.value); onChange(b.dataset.value); }));
    return { set };
}

export function slider(id, fmt, onInput) {
    const el = $(id), out = $(`${id}O`);
    const show = () => { out.textContent = fmt(parseFloat(el.value)); };
    el.addEventListener('input', () => { show(); onInput(parseFloat(el.value)); });
    show();
    return { set: (v) => { el.value = v; show(); } };
}

export function toggle(id, on, onChange) {
    const btn = $(id);
    const set = (v) => { on = v; btn.classList.toggle('active', v); btn.setAttribute('aria-pressed', String(v)); };
    btn.addEventListener('click', () => { set(!on); onChange(on); });
    set(on);
    return { set };
}

// ---------- the matrix editor ----------
let onEdit = () => {};
export function onMatrixEdit(fn) { onEdit = fn; }

function mathField(span, initial) {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (!MQ) {                                   // still usable without MathQuill: a plain text field
        span.contentEditable = 'true';
        span.textContent = initial;
        span.addEventListener('input', () => onEdit());
        return;
    }
    const mf = MQ.MathField(span, { spaceBehavesLikeTab: true, handlers: { edit: () => onEdit() } });
    mf.latex(String(initial ?? ''));
    span.MathQuill = () => mf;
}
function latexOf(el) {
    try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api ? api.latex() : el ? el.textContent : '';
    } catch { return ''; }
}

function relabel() {
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => { lbl.innerHTML = `\\(g_{${i + 1}} =\\)`; });
    typeset([...labels]);
}

export function addMatrixInput(values = ['1', '0', '0', '1']) {
    const container = $('matrixInputs');
    const block = document.createElement('div');
    block.className = 'matrix-block';
    block.innerHTML = `
        <div class="matrix-row">
            <span class="matrix-label"></span>
            <span class="matrix-bracket">(</span>
            <span class="matrix-grid-inline">
                <span class="mq-matrix-input"></span><span class="mq-matrix-input"></span>
                <span class="mq-matrix-input"></span><span class="mq-matrix-input"></span>
            </span>
            <span class="matrix-bracket">)</span>
            <button class="delete-matrix-btn" title="Remove this generator" aria-label="Remove this generator">✖</button>
        </div>`;
    block.querySelector('.delete-matrix-btn').addEventListener('click', () => { block.remove(); relabel(); onEdit(); });
    container.appendChild(block);
    block.querySelectorAll('.mq-matrix-input').forEach((span, k) => mathField(span, values[k] ?? '0'));
    relabel();
}

export function setMatrices(list) {
    $('matrixInputs').innerHTML = '';
    list.forEach((m) => addMatrixInput(m));
}

export function readMatrices() {
    return [...document.querySelectorAll('#matrixInputs .matrix-block')].map((b) =>
        [...b.querySelectorAll('.mq-matrix-input')].map(latexOf));
}

export function markError(where) {
    document.querySelectorAll('#matrixInputs .mq-error').forEach((el) => el.classList.remove('mq-error'));
    if (!where) return;
    const block = document.querySelectorAll('#matrixInputs .matrix-block')[where.gen];
    const spans = block ? [...block.querySelectorAll('.mq-matrix-input')] : [];
    (where.entry != null ? [spans[where.entry]] : spans).forEach((el) => el && el.classList.add('mq-error'));
}

// ---------- generator buttons under the picture ----------
let metaHeld = false;
const genLabel = (i) => `g<sub>${i + 1}</sub>${metaHeld ? '<sup>−1</sup>' : ''}`;
export function setGeneratorButtons(n, onClick) {
    const c = $('isometry-controls');
    c.innerHTML = '';

    for (let i = 0; i < n; i++) {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.dataset.gen = i;
        btn.innerHTML = genLabel(i);
        btn.title = 'Apply this generator (⌘/Ctrl-click for its inverse)';
        btn.addEventListener('click', (e) => onClick(i, e.metaKey || e.ctrlKey));
        c.appendChild(btn);
    }
}
function setMeta(v) {
    if (metaHeld === v) return;
    metaHeld = v;
    document.querySelectorAll('#isometry-controls .isometry-btn').forEach((b) => { b.innerHTML = genLabel(+b.dataset.gen); });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMeta(true); });
document.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMeta(false); });
window.addEventListener('blur', () => setMeta(false));
