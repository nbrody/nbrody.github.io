/**
 * input.js — the page's input, kept minimal: generators as 2×2 grids of
 * MathQuill entries, and the field they live over.
 *
 * The field is defined as in the Discreteness Algorithm (poincare's input):
 * a list of definitions read by expr.js into a tower of number fields,
 *     w  root of  P(w)      the root of P picked by clicking it in the plane
 *     p  =  expression      a named number (radicals, i, ζ, cos(π/5), …)
 * and a line saying which field the entries generate ("over ℚ(w)"). The state
 * is poincare's own input state { mats, anti, consts }.
 */
const $ = (id) => document.getElementById(id);
const MQ_CONFIG = {
    spaceBehavesLikeTab: true,
    leftRightIntoCmdGoes: 'up',
    restrictMismatchedBrackets: true,
    supSubsRequireOperand: true,
    charsThatBreakOutOfSupSub: '+-=<>',
    autoSubscriptNumerals: true,
    autoCommands: 'pi sqrt nthroot zeta omega alpha beta gamma theta',
    autoOperatorNames: 'sin cos tan exp ln log arg Re Im abs conj',
};
const BLANK = ['', '', '', ''];
const ROOT_NAMES = ['w', 'v', 'u', 't', 'z', 'y'];
const VALUE_NAMES = ['a', 'b', 'c', 'p', 'q', 'r', 's'];

/**
 * Text written in the plain convention (w^12, x^-1, a_10), as the examples
 * and older links store polynomials, read as LaTeX: there w^12 is w¹·2. Brace
 * every exponent and subscript longer than one character.
 */
export function asLatex(src) {
    return String(src ?? '')
        .replace(/\^(-?\d{2,}|-\d)/g, '^{$1}')
        .replace(/_(\d{2,})/g, '_{$1}');
}

/** The state of an older permalink of this page ({ gens, consts, field }) as poincare's state. */
export function fromZariskiStyle(st) {
    const consts = [];
    if (st.field) consts.push({ name: st.field.gen, poly: st.field.poly, near: st.field.root || null });
    for (const [n, v] of st.consts || []) consts.push([n, v]);
    return { mats: st.gens, anti: st.gens.map(() => false), consts };
}

/**
 * Build the input on the page's elements. onEdit() after every change,
 * onEnter() for Enter in an entry.
 */
export function createInput({ onEdit = () => { }, onEnter = () => { }, tex = (t) => t }) {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    let loading = false;
    const edited = () => { if (!loading) onEdit(); };

    function makeField(host, cls, latex) {
        if (MQ) {
            host.classList.add(cls);
            const mf = MQ.MathField(host, Object.assign({}, MQ_CONFIG, { handlers: { edit: edited, enter: () => onEnter() } }));
            mf.latex(asLatex(latex));
            return { get: () => mf.latex(), el: host, focus: () => mf.focus() };
        }
        const input = document.createElement('input');
        input.className = cls; input.spellcheck = false; input.autocomplete = 'off';
        input.value = latex || '';
        input.addEventListener('input', edited);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });
        host.replaceWith(input);
        return { get: () => input.value, el: input, focus: () => input.focus() };
    }

    // ── generators ──
    const mats = $('mats');
    function addMatrix(vals = BLANK, focus = false) {
        const block = document.createElement('div');
        block.className = 'mat-block';
        block.innerHTML = '<span class="lbl"></span><div class="grid2"><span></span><span></span><span></span><span></span></div><button class="del" title="Remove" aria-label="Remove matrix">×</button>';
        mats.appendChild(block);
        block._cells = [...block.querySelectorAll('.grid2 > span')].map((h, k) => makeField(h, 'cell', vals[k]));
        block.querySelector('.del').addEventListener('click', () => { block.remove(); relabel(); edited(); });
        relabel();
        if (focus) block._cells[0].focus();
    }
    function relabel() { [...mats.children].forEach((b, i) => { b.querySelector('.lbl').innerHTML = tex(`g_{${i + 1}} =`); }); }

    // ── the field: definitions ──
    const defs = $('defs');
    const usedNames = () => new Set([...defs.children].map((r) => r._name.get().trim()));
    function addDef(kind, name, src = '', near = null, focus = false) {
        const row = document.createElement('div');
        row.className = 'def';
        row.dataset.kind = kind;
        row.innerHTML = `<div class="def-row"><span></span><span class="op">${kind === 'root' ? 'root of' : '='}</span><span></span><button class="del" title="Remove" aria-label="Remove">×</button></div>${kind === 'root' ? '<div class="def-picker" hidden></div>' : ''}`;
        defs.appendChild(row);
        const [hn, , hs] = row.querySelector('.def-row').children;
        row._name = makeField(hn, 'dname', name);
        row._src = makeField(hs, 'dsrc', src);
        row._near = near && Number.isFinite(near.re) ? { re: near.re, im: near.im || 0 } : null;
        row._roots = [];
        if (kind === 'root' && window.RootPicker) {
            row._picker = window.RootPicker.create(row.querySelector('.def-picker'), {
                onSelect: (i) => { if (!row._roots[i]) return; row._near = row._roots[i]; edited(); },
            });
        }
        row.querySelector('.del').addEventListener('click', () => { row.remove(); edited(); });
        if (focus) row._src.focus();
    }
    const freshName = (pool) => { const used = usedNames(); return pool.find((n) => !used.has(n)) || ''; };

    // ── whole state: poincare's input state ──
    function getState() {
        const gens = [...mats.children].map((b) => b._cells.map((c) => c.get()));
        // a definition still being typed (no polynomial or value yet) is left out, not flagged
        const consts = [...defs.children].map((r) => {
            const name = r._name.get(), src = r._src.get();
            if (!String(src).trim()) return ['', ''];
            return r.dataset.kind === 'root' ? { name, poly: src, near: r._near || null } : [name, src];
        });
        return { mats: gens, anti: gens.map(() => false), consts };
    }
    function isBlank() { return [...mats.children].every((b) => b._cells.every((c) => !String(c.get()).trim())); }
    function setState(st) {
        loading = true;
        mats.innerHTML = ''; defs.innerHTML = '';
        (st.mats && st.mats.length ? st.mats : [BLANK, BLANK]).forEach((g) => addMatrix(g.map((x) => String(x ?? ''))));
        for (const r of st.consts || []) {
            if (Array.isArray(r)) { if (r[0] || r[1]) addDef('value', r[0], r[1]); }
            else if (r && 'poly' in r) addDef('root', r.name, r.poly, r.near || null);
            else if (r) addDef('value', r.name, r.value);
        }
        loading = false;
    }
    /** After a read: each root row's roots, for its picker (readGroup's roots, by row). */
    function showRoots(roots) {
        [...defs.children].forEach((r, i) => {
            if (r.dataset.kind !== 'root') return;
            const data = roots && roots[i];
            r._roots = data ? data.roots : [];
            if (data && !r._near) r._near = data.roots[data.index];
            if (r._picker) r._picker.set(r._roots, data ? data.index : 0, r._name.get().replace(/\\/g, '') || 'w');
            r.querySelector('.def-picker').hidden = !r._roots.length;
        });
    }
    /** Mark what an error of readGroup points at (err.where). */
    function markErrors(where) {
        [...mats.children].forEach((b, g) => {
            b.classList.toggle('invalid', !!where && where.gen === g && where.entry === undefined);
            b._cells.forEach((c, k) => c.el.classList.toggle('invalid', !!where && where.gen === g && where.entry === k));
        });
        [...defs.children].forEach((r, i) => {
            const bad = !!where && where.constant === i;
            r._name.el.classList.toggle('invalid', bad); r._src.el.classList.toggle('invalid', bad);
        });
    }

    $('add-mat').addEventListener('click', () => { addMatrix(BLANK, true); edited(); });
    $('add-root').addEventListener('click', () => { addDef('root', freshName(ROOT_NAMES), '', null, true); edited(); });
    $('add-value').addEventListener('click', () => { addDef('value', freshName(VALUE_NAMES), '', null, true); edited(); });

    return { getState, setState, showRoots, markErrors, isBlank, entryErrors: () => [] };
}
