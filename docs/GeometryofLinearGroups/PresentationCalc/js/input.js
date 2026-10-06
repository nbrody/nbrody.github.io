/**
 * input.js — the page's input, as on the Zariski Closure page: generators as
 * 2×2 grids of MathQuill entries, named constants, and an optional number
 * field K = ℚ(w) given by a minimal polynomial, with its embedding picked by
 * clicking a root in the complex plane.
 *
 * The state { gens, consts, field } becomes poincare's input state
 * { mats, anti, consts } for its exact reader (expr.js readGroup): the field is
 * a root row { name, poly, near } placed first, so constants and entries may
 * use its generator.
 */
import { parse, texOf, parseName, numericPolyRoots } from '../../assets/js/hyperbolic/expr.js';
import { sortRoots, nearestIndex } from '../../assets/js/hyperbolic/tower.js';

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

/** poincare's input state for the page's state. */
export function toPoincareState(st) {
    const consts = [];
    if (st.field) consts.push({ name: st.field.gen, poly: st.field.poly, near: st.field.root || null });
    for (const [n, v] of st.consts || []) if (String(n || '').trim() || String(v || '').trim()) consts.push([n, v]);
    return { mats: st.gens.map((g) => g.slice()), anti: st.gens.map(() => false), consts };
}

/** The page's state for poincare's input state (the first root row becomes the number field). */
export function fromPoincareState(ps) {
    let field = null;
    const consts = [];
    for (const r of ps.consts || []) {
        if (Array.isArray(r)) consts.push([r[0], r[1]]);
        else if (r && 'poly' in r && !field) field = { gen: r.name, poly: r.poly, root: r.near || null };
        else if (r && 'poly' in r) return null;           // more than one root: not representable here
        else if (r) consts.push([r.name, r.value]);
    }
    return { gens: (ps.mats || []).map((g) => g.map(String)), consts, field };
}

/** Split at top-level commas, respecting (), [], {}. */
function splitTop(s) {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
        else if ((ch === ',' || ch === ';') && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out.map((x) => x.trim()).filter((x) => x.length);
}
function flatten(s) {
    s = s.trim();
    const close = { '(': ')', '[': ']' }[s[0]];
    if (close && s[s.length - 1] === close) {
        let depth = 0, end = -1;
        for (let i = 0; i < s.length; i++) {
            if ('([{'.includes(s[i])) depth++;
            else if (')]}'.includes(s[i])) { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end === s.length - 1) {
            const inner = splitTop(s.slice(1, -1));
            if (inner.length > 1) return inner.flatMap(flatten);
        }
    }
    return [s];
}
/** "<((a,b),(c,d)), …>" → generators of LaTeX entries. */
export function fromText(src) {
    const s = String(src || '').trim().replace(/^[<⟨]\s*/, '').replace(/\s*[>⟩]$/, '');
    const gens = [];
    for (const item of splitTop(s)) {
        const f = flatten(item);
        if (f.length === 4) gens.push(f);
        else if (f.length % 4 === 0 && /^[([]/.test(item)) for (let i = 0; i < f.length; i += 4) gens.push(f.slice(i, i + 4));
        else throw new Error(`each generator must be a 2×2 matrix (found ${f.length} entr${f.length === 1 ? 'y' : 'ies'} in “${item}”)`);
    }
    if (!gens.length) throw new Error('no generators found');
    const toLatex = (x) => { try { const a = parse(x); return a ? texOf(a) : '0'; } catch (e) { return x; } };
    return gens.map((g) => g.map(toLatex));
}

/**
 * Build the input on the page's elements. onEdit() is called after every
 * change, onEnter() for Enter in an entry. Returns the input's interface.
 */
export function createInput({ onEdit = () => { }, onEnter = () => { }, tex = (t) => t }) {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    let loading = false;
    const edited = () => { if (!loading) onEdit(); };

    function makeField(host, cls, latex) {
        if (MQ) {
            host.classList.add(cls);
            const mf = MQ.MathField(host, Object.assign({}, MQ_CONFIG, { handlers: { edit: edited, enter: () => onEnter() } }));
            mf.latex(latex || '');
            return { get: () => mf.latex(), set: (v) => mf.latex(v), el: host, focus: () => mf.focus() };
        }
        const input = document.createElement('input');
        input.className = cls; input.spellcheck = false; input.autocomplete = 'off';
        input.value = latex || '';
        input.addEventListener('input', edited);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });
        host.replaceWith(input);
        return { get: () => input.value, set: (v) => { input.value = v; }, el: input, focus: () => input.focus() };
    }

    // ── generators ──
    const mats = $('mats');
    function addMatrix(vals = ['1', '0', '0', '1'], focus = false) {
        const block = document.createElement('div');
        block.className = 'mat-block';
        block.innerHTML = '<span class="lbl"></span><div class="grid2"><span></span><span></span><span></span><span></span></div><span class="meta"></span><button class="del" title="Remove" aria-label="Remove matrix">×</button>';
        mats.appendChild(block);
        block._cells = [...block.querySelectorAll('.grid2 > span')].map((h, k) => makeField(h, 'cell', vals[k]));
        block.querySelector('.del').addEventListener('click', () => { block.remove(); relabel(); edited(); });
        relabel();
        if (focus) block._cells[0].focus();
    }
    function relabel() { [...mats.children].forEach((b, i) => { b.querySelector('.lbl').innerHTML = tex(`g_{${i + 1}} =`); }); }

    // ── constants ──
    const constBox = $('consts');
    function addConstant(name = '', value = '', focus = false) {
        const row = document.createElement('div');
        row.className = 'const-row';
        row.innerHTML = '<span></span><span class="eq">=</span><span></span><button class="del" title="Remove" aria-label="Remove constant">×</button>';
        constBox.appendChild(row);
        const [hn, , hv] = row.children;
        row._name = makeField(hn, 'cname', name);
        row._value = makeField(hv, 'cval', value);
        row.querySelector('.del').addEventListener('click', () => { row.remove(); edited(); });
        if (focus) row._name.focus();
    }

    // ── number field ──
    let roots = [], rootIndex = 0, fieldName = 'w';
    const picker = window.RootPicker ? window.RootPicker.create($('root-plot'), {
        onSelect: (i) => { rootIndex = i; syncPicker(); edited(); },
    }) : null;
    const syncPicker = () => { if (picker) picker.set(roots, rootIndex, fieldName); };
    function refreshRoots(prefer = null) {
        const gen = String($('field-gen').value || 'w').trim() || 'w';
        let nm = null;
        try { nm = parseName(gen); } catch (e) { nm = null; }
        $('field-label').innerHTML = tex(`K = \\mathbb{Q}(${nm ? nm.tex : 'w'})`);
        const prev = prefer || roots[rootIndex] || null;
        try {
            if (!nm) throw new Error('name the generator, e.g. w');
            const rs = sortRoots(numericPolyRoots($('field-poly').value, nm.name));
            if (rs.length < 1) throw new Error(`enter a polynomial in ${gen}`);
            roots = rs; rootIndex = prev ? nearestIndex(rs, prev) : 0; fieldName = gen;
            $('field-msg').textContent = '';
        } catch (e) {
            roots = []; rootIndex = 0;
            $('field-msg').textContent = e.message.replace(/^constant [^:]*: /, '');
        }
        syncPicker();
    }
    function setFieldUI(on) {
        $('field-on').checked = on;
        $('field-panel').hidden = !on;
        $('field-hint').hidden = !on;
    }
    $('field-on').addEventListener('change', () => { setFieldUI($('field-on').checked); if ($('field-on').checked) refreshRoots(); edited(); });
    ['field-gen', 'field-poly'].forEach((id) => $(id).addEventListener('input', () => { refreshRoots(); edited(); }));
    ['field-gen', 'field-poly'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); }));

    // ── whole state ──
    function getState() {
        const consts = [...constBox.children].map((r) => [r._name.get(), r._value.get()]);
        const field = $('field-on').checked ? { gen: $('field-gen').value, poly: $('field-poly').value, root: roots[rootIndex] || null } : null;
        return { gens: [...mats.children].map((b) => b._cells.map((c) => c.get())), consts, field };
    }
    function setState(st) {
        loading = true;
        mats.innerHTML = ''; constBox.innerHTML = '';
        (st.gens && st.gens.length ? st.gens : [['1', '0', '0', '1']]).forEach((g) => addMatrix(g));
        (st.consts || []).forEach(([n, v]) => addConstant(n, v));
        if (st.field) {
            $('field-gen').value = st.field.gen || 'w';
            $('field-poly').value = st.field.poly || '';
            setFieldUI(true);
            roots = []; rootIndex = 0;
            refreshRoots(st.field.root || null);
        } else setFieldUI(false);
        loading = false;
    }
    /** Mark the entry, constant or field that an error points at (err.where of readGroup, in poincare's rows). */
    function markErrors(where, hasField) {
        [...mats.children].forEach((b, g) => {
            b.classList.toggle('invalid', !!where && where.gen === g && where.entry === undefined);
            b._cells.forEach((c, k) => c.el.classList.toggle('invalid', !!where && where.gen === g && where.entry === k));
        });
        const ci = where && where.constant !== undefined ? where.constant - (hasField ? 1 : 0) : -2;
        [...constBox.children].forEach((r, i) => { const bad = i === ci; r._name.el.classList.toggle('invalid', bad); r._value.el.classList.toggle('invalid', bad); });
        $('field-poly').classList.toggle('invalid', ci === -1);
    }
    function setMeta(i, html) { const b = mats.children[i]; if (b) b.querySelector('.meta').innerHTML = html; }
    function clearMeta() { [...mats.children].forEach((b) => { b.querySelector('.meta').innerHTML = ''; }); }

    $('add-mat').addEventListener('click', () => { addMatrix(['1', '0', '0', '1'], true); edited(); });
    $('add-const').addEventListener('click', () => addConstant(['c', 'd', 'u', 'v'].find((n) => ![...constBox.children].some((r) => r._name.get() === n)) || '', '', true));
    $('import-btn').addEventListener('click', () => {
        try {
            const gens = fromText($('import-text').value);
            $('import-err').textContent = '';
            const st = getState();
            setState({ gens, consts: st.consts, field: st.field });
            edited();
        } catch (e) { $('import-err').textContent = e.message; }
    });
    $('field-label').innerHTML = tex('K = \\mathbb{Q}(w)');

    return { getState, setState, markErrors, setMeta, clearMeta };
}
