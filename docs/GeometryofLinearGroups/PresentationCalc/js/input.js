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
const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
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
 * Parse pasted 2×2 matrix text into an array of [a, b, c, d] string rows, or null if `raw` does not
 * look like one or more 2×2 matrices (so ordinary single-entry expressions paste normally).
 *
 * Accepts:
 *   · database keys:          "0,1,1,-2|0,2,3,0" or "1, 2, 0, 1"
 *   · LaTeX environments:     \begin{pmatrix} a & b \\ c & d \end{pmatrix}, smallmatrix, bmatrix, matrix
 *   · Python / Sage / JSON:   [[1, 2], [3, 4]], [[[1,2],[3,4]], [[0,1],[-1,0]]], {{a,b},{c,d}}, Matrix([[...]])
 *   · whitespace 2×2 blocks:  2k non-empty lines of 2 entries each
 */
export function parsePastedMatrices(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const cleanCell = (x) => String(x).trim().replace(/^['"]|['"]$/g, '').trim();

    // 1. LaTeX matrix environments
    const envRe = /\\begin\{(?:p|b|B|v|V|small)?matrix\}([\s\S]*?)\\end\{(?:p|b|B|v|V|small)?matrix\}/g;
    const latexMats = [];
    let m;
    while ((m = envRe.exec(s)) !== null) {
        const rows = m[1].trim().replace(/\\\\\s*$/, '').split(/\\\\/).map((r) => r.split('&').map(cleanCell));
        if (rows.length === 2 && rows[0].length === 2 && rows[1].length === 2) {
            latexMats.push([rows[0][0], rows[0][1], rows[1][0], rows[1][1]]);
        } else return null;
    }
    if (latexMats.length) return latexMats;

    // 2. Pipe-separated database keys: a,b,c,d|e,f,g,h
    if (s.includes('|') && !s.includes('\\')) {
        const parts = s.split('|').map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 1) {
            const out = [];
            let ok = true;
            for (const p of parts) {
                const cells = p.split(',').map(cleanCell);
                if (cells.length !== 4 || cells.some((c) => !c)) { ok = false; break; }
                out.push(cells);
            }
            if (ok && out.length) return out;
        }
    }

    // 3. Nested bracket/brace lists: [[a,b],[c,d]] or {{a,b},{c,d}} or [a,b,c,d]
    const stripped = s.replace(/\b(?:Matrix|matrix)\s*\(/g, '(');
    if (/^[\[\(\{]/.test(stripped)) {
        // Normalize { } and ( ) wrapper brackets only when balanced as list delimiters: match 2-row or 4-entry blocks
        const rowPairRe = /[\[\{]\s*[\[\{]\s*([^\]\[\{\},;]+?)\s*,\s*([^\]\[\{\},;]+?)\s*[\]\}]\s*,\s*[\[\{]\s*([^\]\[\{\},;]+?)\s*,\s*([^\]\[\{\},;]+?)\s*[\]\}]\s*[\]\}]/g;
        const pairs = [];
        while ((m = rowPairRe.exec(stripped)) !== null) {
            pairs.push([cleanCell(m[1]), cleanCell(m[2]), cleanCell(m[3]), cleanCell(m[4])]);
        }
        if (pairs.length) return pairs;

        // Flat [a, b, c, d]
        const flatMatch = /^[\[\{]\s*([^\]\[\{\},;]+?)\s*,\s*([^\]\[\{\},;]+?)\s*,\s*([^\]\[\{\},;]+?)\s*,\s*([^\]\[\{\},;]+?)\s*[\]\}]$/.exec(stripped);
        if (flatMatch) return [[cleanCell(flatMatch[1]), cleanCell(flatMatch[2]), cleanCell(flatMatch[3]), cleanCell(flatMatch[4])]];

        // Semicolon-separated 2×2 blocks: [a b; c d] or (a, b; c, d)
        const semiRe = /[\[\(\{]\s*([^\]\[\(\)\{\};]+?)\s*;\s*([^\]\[\(\)\{\};]+?)\s*[\]\)\}]/g;
        const semiMats = [];
        while ((m = semiRe.exec(stripped)) !== null) {
            const r0 = (m[1].includes(',') ? m[1].split(',') : m[1].trim().split(/\s+/)).map(cleanCell).filter(Boolean);
            const r1 = (m[2].includes(',') ? m[2].split(',') : m[2].trim().split(/\s+/)).map(cleanCell).filter(Boolean);
            if (r0.length === 2 && r1.length === 2) semiMats.push([r0[0], r0[1], r1[0], r1[1]]);
        }
        if (semiMats.length) return semiMats;
    }

    // 4. Single comma-separated 4-tuple: a, b, c, d (without unbalanced parens)
    if (!s.includes('\n')) {
        const commaCells = s.split(',').map(cleanCell);
        if (commaCells.length === 4 && commaCells.every((c) => c && !/[()\[\]{}]/.test(c))) {
            return [commaCells];
        }
        return null;
    }

    // 5. Multi-line 2×2 whitespace/comma blocks (2k lines, 2 entries per line)
    const lines = s.split(/\r?\n/).map((l) => l.trim().replace(/^[\[\(\|]+|[\]\)\|]+$/g, '').trim()).filter(Boolean);
    if (lines.length >= 2 && lines.length % 2 === 0) {
        const rows = lines.map((l) => (l.includes(',') ? l.split(',') : l.split(/\s+/)).map(cleanCell).filter(Boolean));
        if (rows.every((r) => r.length === 2)) {
            const out = [];
            for (let i = 0; i < rows.length; i += 2) {
                out.push([rows[i][0], rows[i][1], rows[i + 1][0], rows[i + 1][1]]);
            }
            return out;
        }
    }
    return null;
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
            return { get: () => mf.latex(), set: (v) => mf.latex(asLatex(v)), el: host, focus: () => mf.focus() };
        }
        const input = document.createElement('input');
        input.className = cls; input.spellcheck = false; input.autocomplete = 'off';
        input.value = latex || '';
        input.addEventListener('input', edited);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });
        host.replaceWith(input);
        return { get: () => input.value, set: (v) => { input.value = String(v ?? ''); }, el: input, focus: () => input.focus() };
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
    /** The root rows' roots as last shown: [{ row (its index among the definitions), roots }]. */
    function rootRows() {
        return [...defs.children].map((r, i) => ({ row: i, kind: r.dataset.kind, roots: r._roots || [] }))
            .filter((x) => x.kind === 'root' && x.roots.length);
    }
    /** Colour each root by tone(row, i) → { tone: 'yes' | 'no' | null, note }, or clear with null. */
    function showTones(tone) {
        [...defs.children].forEach((r, i) => {
            if (r.dataset.kind !== 'root' || !r._picker || !r._picker.setTones) return;
            const ts = (r._roots || []).map((_, j) => (tone ? tone(i, j) : null) || { tone: null, note: '' });
            r._picker.setTones(ts.map((t) => t.tone), ts.map((t) => t.note));
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

    function applyPasted(parsed, targetBlock = null) {
        if (!parsed || !parsed.length) return false;
        loading = true;
        if (parsed.length === 1 && targetBlock && targetBlock._cells) {
            parsed[0].forEach((val, k) => targetBlock._cells[k].set(val));
        } else {
            mats.innerHTML = '';
            parsed.forEach((g) => addMatrix(g));
        }
        loading = false;
        edited();
        return true;
    }

    mats.addEventListener('paste', (e) => {
        const text = e.clipboardData && e.clipboardData.getData('text/plain');
        const parsed = parsePastedMatrices(text);
        if (!parsed) return;
        e.preventDefault();
        e.stopPropagation();
        applyPasted(parsed, e.target.closest('.mat-block'));
    }, true);

    $('add-mat').addEventListener('click', () => { addMatrix(BLANK, true); edited(); });
    const pasteBtn = $('paste-mat');
    if (pasteBtn) pasteBtn.addEventListener('click', async () => {
        let text = '';
        try { text = await navigator.clipboard.readText(); } catch (e) { text = window.prompt('Paste matrices (LaTeX, [[a,b],[c,d]], or a,b,c,d|e,f,g,h):') || ''; }
        const parsed = parsePastedMatrices(text);
        if (parsed) {
            applyPasted(parsed, null);
            pasteBtn.textContent = 'pasted';
            setTimeout(() => { pasteBtn.textContent = 'paste'; }, 1400);
        } else if (text.trim()) {
            pasteBtn.textContent = 'unrecognized format';
            setTimeout(() => { pasteBtn.textContent = 'paste'; }, 1800);
        }
    });
    $('add-root').addEventListener('click', () => { addDef('root', freshName(ROOT_NAMES), '', null, true); edited(); });
    $('add-value').addEventListener('click', () => { addDef('value', freshName(VALUE_NAMES), '', null, true); edited(); });

    return { getState, setState, showRoots, rootRows, showTones, markErrors, isBlank, applyPasted, entryErrors: () => [] };
}
