/**
 * input.js — the page's input, kept minimal: generators as 2×2 grids of
 * MathQuill entries, and one entry for the field they live over:
 *
 *     over ℚ( w, a = √2, i )
 *
 * Its items are read as in the Discreteness Algorithm (poincare's input), into
 * a tower of number fields:
 *     w          a symbol: a row appears below, "w root of P(w)", with the
 *                root of P picked by clicking it in the complex plane;
 *     a = …      a named number (radicals, i, ζ, cos(π/5), (1+√5)/2, …);
 *     √2, i, …   a number adjoined as it is (entries may use it directly).
 * The state is poincare's own input state { mats, anti, consts }.
 */
import { parse, parseName } from '../../assets/js/hyperbolic/expr.js';

const $ = (id) => document.getElementById(id);
const MQ_CONFIG = {
    spaceBehavesLikeTab: true,
    leftRightIntoCmdGoes: 'up',
    restrictMismatchedBrackets: true,
    supSubsRequireOperand: true,
    charsThatBreakOutOfSupSub: '+-=<>,',
    autoSubscriptNumerals: true,
    autoCommands: 'pi sqrt nthroot zeta omega alpha beta gamma theta',
    autoOperatorNames: 'sin cos tan exp ln log arg Re Im abs conj',
};
const BLANK = ['', '', '', ''];

/** The state of an older permalink of this page ({ gens, consts, field }) as poincare's state. */
export function fromZariskiStyle(st) {
    const consts = [];
    if (st.field) consts.push({ name: st.field.gen, poly: st.field.poly, near: st.field.root || null });
    for (const [n, v] of st.consts || []) consts.push([n, v]);
    return { mats: st.gens, anti: st.gens.map(() => false), consts };
}

/** Split LaTeX at top-level occurrences of `sep` (outside {}, (), [], \left…\right). */
function splitTop(s, sep) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        if (s.startsWith('\\left', i)) { depth++; i += 4; continue; }
        if (s.startsWith('\\right', i)) { depth--; i += 5; continue; }
        const ch = s[i];
        if ('{(['.includes(ch)) depth++;
        else if ('})]'.includes(ch)) depth--;
        else if (ch === sep && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out.map((x) => x.trim());
}

/**
 * The items of the field entry:
 *   { kind: 'value', name, src }   a = …
 *   { kind: 'root', name }         a bare symbol, defined below
 *   { kind: 'number', src }        an explicit number
 *   { kind: 'bad', src, error }
 */
export function fieldItems(latex) {
    const items = [];
    for (const raw of splitTop(String(latex || ''), ',')) {
        if (!raw) continue;
        const eq = splitTop(raw, '=');
        try {
            if (eq.length === 2) {
                const nm = parseName(eq[0]);
                if (!nm) throw new Error('name the number before =');
                if (!eq[1]) throw new Error(`give ${eq[0]} a value`);
                items.push({ kind: 'value', name: eq[0], src: eq[1] });
                continue;
            }
            if (eq.length > 2) throw new Error('one = per item');
            const ast = parse(raw);
            if (ast && ast.t === 'var') items.push({ kind: 'root', name: raw });
            else items.push({ kind: 'number', src: raw });
        } catch (e) {
            items.push({ kind: 'bad', src: raw, error: e.message });
        }
    }
    return items;
}

/**
 * Build the input on the page's elements. onEdit() after every change,
 * onEnter() for Enter in an entry.
 */
export function createInput({ onEdit = () => { }, onEnter = () => { }, tex = (t) => t }) {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    let loading = false;
    const edited = () => { if (!loading) onEdit(); };

    function makeField(host, cls, latex, onChange = edited) {
        if (MQ) {
            host.classList.add(cls);
            const mf = MQ.MathField(host, Object.assign({}, MQ_CONFIG, { handlers: { edit: () => onChange(), enter: () => onEnter() } }));
            mf.latex(latex || '');
            return { get: () => mf.latex(), set: (v) => mf.latex(v || ''), el: host, focus: () => mf.focus() };
        }
        const input = document.createElement('input');
        input.className = cls; input.spellcheck = false; input.autocomplete = 'off';
        input.value = latex || '';
        input.addEventListener('input', () => onChange());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });
        host.replaceWith(input);
        return { get: () => input.value, set: (v) => { input.value = v || ''; }, el: input, focus: () => input.focus() };
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

    // ── the field: ℚ( entry ), and a row for each symbol in it ──
    $('field-open').innerHTML = `over ${tex('\\mathbb{Q}(')}`;
    $('field-close').innerHTML = tex(')');
    // MathQuill calls the edit handler while it builds the field: fgen is null until then
    let fgen = null;
    fgen = makeField($('fgen'), 'fgen', '', () => { if (fgen) { syncRoots(); edited(); } });
    const defs = $('defs');
    const rows = new Map();          // symbol → its row (kept while the symbol is in the entry)
    const remembered = new Map();    // symbol → { poly, near }, so a symbol typed again keeps its polynomial

    function rootRow(name) {
        const row = document.createElement('div');
        row.className = 'def';
        row.innerHTML = '<div class="def-row"><span class="dname"></span><span class="op">root of</span><span></span></div><div class="def-picker" hidden></div>';
        row.querySelector('.dname').innerHTML = tex(name);
        const keep = remembered.get(name) || {};
        row._name = name;
        row._poly = makeField(row.querySelector('.def-row').children[2], 'dsrc', keep.poly || '');
        row._near = keep.near || null;
        row._roots = [];
        if (window.RootPicker) {
            row._picker = window.RootPicker.create(row.querySelector('.def-picker'), {
                onSelect: (i) => { if (!row._roots[i]) return; row._near = row._roots[i]; edited(); },
            });
        }
        return row;
    }
    /** Rows follow the symbols of the entry, in order. */
    function syncRoots() {
        const names = fieldItems(fgen.get()).filter((it) => it.kind === 'root').map((it) => it.name);
        for (const [name, row] of rows) {
            remembered.set(name, { poly: row._poly.get(), near: row._near });
            if (!names.includes(name)) { row.remove(); rows.delete(name); }
        }
        for (const name of names) {
            if (!rows.has(name)) rows.set(name, rootRow(name));
            defs.appendChild(rows.get(name));        // (re)ordered as in the entry
        }
    }

    // ── whole state: poincare's input state ──
    let constMap = [];               // consts index → { kind, name } of the item it came from
    function getState() {
        const gens = [...mats.children].map((b) => b._cells.map((c) => c.get()));
        const consts = [];
        constMap = [];
        for (const it of fieldItems(fgen.get())) {
            if (it.kind === 'value') { consts.push([it.name, it.src]); constMap.push(it); }
            else if (it.kind === 'root') {
                const row = rows.get(it.name);
                const poly = row ? row._poly.get() : '';
                // a polynomial still to be typed is left out, not flagged
                consts.push(String(poly).trim() ? { name: it.name, poly, near: row._near || null } : ['', '']);
                constMap.push(it);
            }
        }
        return { mats: gens, anti: gens.map(() => false), consts };
    }
    /** Errors in the entry itself (items that do not parse), before any reading. */
    function entryErrors() { return fieldItems(fgen.get()).filter((it) => it.kind === 'bad'); }
    function isBlank() { return [...mats.children].every((b) => b._cells.every((c) => !String(c.get()).trim())); }

    function setState(st) {
        loading = true;
        mats.innerHTML = '';
        const ms = st.mats && st.mats.length ? st.mats : [BLANK, BLANK];
        ms.forEach((g) => addMatrix(g.map((x) => String(x ?? ''))));
        const items = [];
        for (const [name] of rows) { rows.get(name).remove(); }
        rows.clear(); remembered.clear();
        for (const r of st.consts || []) {
            if (Array.isArray(r)) { if (r[0]) items.push(`${r[0]}=${r[1]}`); }
            else if (r && 'poly' in r) { items.push(r.name); remembered.set(r.name, { poly: r.poly, near: r.near || null }); }
            else if (r && r.name) items.push(`${r.name}=${r.value}`);
        }
        fgen.set(items.join(','));
        syncRoots();
        loading = false;
    }
    /** After a read: each symbol's roots, for its picker (readGroup's roots, by consts index). */
    function showRoots(roots) {
        constMap.forEach((it, i) => {
            if (it.kind !== 'root') return;
            const row = rows.get(it.name);
            if (!row) return;
            const data = roots && roots[i];
            row._roots = data ? data.roots : [];
            if (data && !row._near) row._near = data.roots[data.index];
            if (row._picker) row._picker.set(row._roots, data ? data.index : 0, it.name.replace(/\\/g, ''));
            row.querySelector('.def-picker').hidden = !row._roots.length;
        });
    }
    /** Mark what an error points at: readGroup's err.where, or the entry for its own items. */
    function markErrors(where, entryBad = false) {
        [...mats.children].forEach((b, g) => {
            b.classList.toggle('invalid', !!where && where.gen === g && where.entry === undefined);
            b._cells.forEach((c, k) => c.el.classList.toggle('invalid', !!where && where.gen === g && where.entry === k));
        });
        const it = where && where.constant !== undefined ? constMap[where.constant] : null;
        fgen.el.classList.toggle('invalid', entryBad || (!!it && it.kind === 'value'));
        for (const [name, row] of rows) row._poly.el.classList.toggle('invalid', !!it && it.kind === 'root' && it.name === name);
    }

    $('add-mat').addEventListener('click', () => { addMatrix(BLANK, true); edited(); });

    return { getState, setState, showRoots, markErrors, entryErrors, isBlank };
}
