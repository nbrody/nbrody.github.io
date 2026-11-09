// Notebooks: text cells (Markdown with math) and code cells that run the
// scripting API in nbapi.js. Each notebook has its own variables ("kernel"),
// shared between its cells, and its cells run one at a time.

import { API, render, resolveDeep } from './nbapi.js';
import { NOTEBOOKS } from './notebooks.js';
import { renderMarkdown } from './markdown.js';
import { h, mixed, toast, plural } from './dom.js';

const STORE = 'regina-gui-nb-v1';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ---------------------------------------------------------------- storage

let store = { user: [], edits: {} };
try { store = Object.assign(store, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch {}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch {} }

let cellIds = 1;
const toCells = (cells) => cells.map((c) => ({
  id: cellIds++, type: c.md !== undefined || c.type === 'md' ? 'md' : 'code',
  src: (c.md ?? c.code ?? c.src ?? '').replace(/^\n+|\s+$/g, ''),
  out: null, n: null, status: 'idle', editing: false,
}));

export function builtins() { return NOTEBOOKS; }
export function userNotebooks() { return store.user; }
export function isEdited(id) { return !!store.edits[id]; }
export function find(id) { return NOTEBOOKS.find((n) => n.id === id) || store.user.find((n) => n.id === id) || null; }

// Live notebooks (cells with outputs + a kernel), created on first open.
const live = new Map();

function liveFor(id) {
  if (live.has(id)) return live.get(id);
  const def = find(id);
  if (!def) return null;
  const builtin = NOTEBOOKS.includes(def);
  const src = builtin ? (store.edits[id]?.cells || def.cells) : def.cells;
  const nb = { id, def, builtin, cells: toCells(src), kernel: newKernel(), title: def.title };
  live.set(id, nb);
  return nb;
}

function saveNb(nb) {
  const cells = nb.cells.map((c) => ({ type: c.type, src: c.src }));
  if (nb.builtin) store.edits[nb.id] = { cells };
  else { nb.def.cells = cells; nb.def.title = nb.title; }
  persist();
  onChange();
}

let onChange = () => {};
export function setOnChange(f) { onChange = f; }

export function create(title = 'Untitled notebook', cells) {
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const def = {
    id, title, blurb: '',
    cells: cells || [
      { type: 'md', src: '# ' + title + '\n\nWrite notes with $\\LaTeX$ here. Double-click a text cell to edit it.' },
      { type: 'code', src: "const M = await census('m004')\nM.homology()" },
    ],
  };
  store.user.push(def);
  persist();
  return id;
}

export function remove(id) {
  store.user = store.user.filter((n) => n.id !== id);
  live.delete(id);
  persist();
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.cells)) throw new Error('This file has no notebook cells');
  return create(String(data.title || 'Imported notebook'), data.cells.map((c) => ({ type: c.type === 'md' ? 'md' : 'code', src: String(c.src ?? '') })));
}

function exportJSON(nb) {
  const data = { format: 'regina-gui-notebook', version: 1, title: nb.title, cells: nb.cells.map((c) => ({ type: c.type, src: c.src })) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: nb.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- kernel

function newKernel() {
  const k = { count: 0, queue: Promise.resolve(), sink: null };
  const vars = Object.create(null);
  Object.assign(vars, API, {
    // show(x, ...) displays values in the running cell's output, in order.
    show: (...xs) => { for (const x of xs) emit(k, x); },
    print: (...xs) => { k.sink?.append(h('div', { class: 'nb-print' }, xs.map(String).join(' '))); },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  k.vars = vars;
  k.scope = new Proxy(vars, {
    has: (t, key) => typeof key === 'string',
    get: (t, key) => {
      if (typeof key === 'symbol') return undefined;
      if (key in t) return t[key];
      if (key in globalThis) return globalThis[key];
      throw new ReferenceError(`${key} is not defined`);
    },
    set: (t, key, v) => { t[key] = v; return true; },
  });
  return k;
}

function emit(k, x) {
  const slot = h('div', { class: 'nb-result' });
  k.sink?.append(slot);
  resolveDeep(x).then((v) => { const n = render(v); if (n) slot.append(n); else slot.remove(); },
    (e) => slot.replaceWith(errorNode(e)));
}

// Top-level declarations become kernel variables, so later cells see them.
function rewrite(src) {
  return src.split('\n').map((line) => line
    // A top-level line starting with ( or [ begins a new statement (no ASI trap).
    .replace(/^(?=[([])/, ';')
    .replace(/^(?:const|let|var)\s+([{[].*?)(;?)\s*$/, ';($1)$2')
    .replace(/^(?:let|var)\s+([A-Za-z_$][\w$]*)\s*;?\s*$/, '$1 = undefined;')
    .replace(/^(?:const|let|var)\s+(?=[A-Za-z_$])/, '')
    .replace(/^(async\s+)?function\s*(\*?)\s*([A-Za-z_$][\w$]*)/, '$3 = $1function$2 $3')
    .replace(/^class\s+([A-Za-z_$][\w$]*)/, '$1 = class $1')).join('\n');
}

const STATEMENT = /^(if|for|while|do|return|function|async\s+function|class|throw|try|switch|import|export|break|continue)\b/;

// The cell's value is its last top-level expression, as in Jupyter.
function compile(src) {
  const code = rewrite(src);
  const lines = code.split('\n');
  let end = lines.length;
  while (end > 0 && (!lines[end - 1].trim() || /^\s*\/\//.test(lines[end - 1]))) end--;
  let i = end - 1;
  while (i > 0 && (/^[\s})\].?:+\-*/|&]/.test(lines[i]) || !lines[i].trim())) i--;
  if (i >= 0 && end > 0) {
    const head = lines.slice(0, i).join('\n');
    const tail = lines.slice(i, end).join('\n').replace(/;\s*$/, '').replace(/^;/, '');
    // A declaration on the last line shows nothing, as in Jupyter.
    const declaration = /^\s*(?:const|let|var)\s/.test(src.split('\n')[i] || '');
    if (!STATEMENT.test(tail.trim()) && !declaration) {
      try {
        return { fn: new AsyncFunction('__scope', `with (__scope) {\n${head}\nreturn (\n${tail}\n);\n}`) };
      } catch {}
    }
  }
  return { fn: new AsyncFunction('__scope', `with (__scope) {\n${code}\n}`) };
}

function errorNode(e) {
  const msg = e?.message || String(e);
  return h('div', { class: 'err nb-err' }, msg === 'Stopped' ? 'Stopped: the engine was restarted, so this cell did not finish.' : (e?.name && e.name !== 'Error' ? e.name + ': ' : '') + msg);
}

function runCell(nb, cell, ui) {
  if (cell.type !== 'code') return Promise.resolve();
  cell.status = 'queued';
  ui.refresh(cell);
  const k = nb.kernel;
  const job = async () => {
    if (nb.kernel !== k) return;
    cell.status = 'running';
    const out = h('div', { class: 'nb-out' });
    cell.out = out;
    ui.refresh(cell);
    k.sink = out;
    const t0 = performance.now();
    try {
      const { fn } = compile(cell.src);
      let v = await fn(k.scope);
      v = await resolveDeep(v);
      const node = render(v);
      if (node) out.append(h('div', { class: 'nb-result' }, node));
      cell.status = 'done';
    } catch (e) {
      console.debug('Notebook cell failed:', e);
      out.append(errorNode(e));
      cell.status = 'error';
    }
    cell.ms = performance.now() - t0;
    cell.n = ++k.count;
    if (k.sink === out) k.sink = null;
    ui.refresh(cell);
  };
  const p = k.queue.then(job, job);
  k.queue = p.catch(() => {});
  return p;
}

// ---------------------------------------------------------------- syntax colors

const KW = new Set('await async const let var if else for of in while return function new class true false null undefined this typeof instanceof try catch finally throw break continue switch case default do'.split(' '));
const API_NAMES = new Set([...Object.keys(API), 'show', 'print', 'sleep', 'Math']);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(src) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\.|[^`\\])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) out += `<span class="c">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="n">${m[3]}</span>`;
    else {
      const w = m[4];
      const prev = src[m.index - 1];
      const cls = KW.has(w) ? 'k' : API_NAMES.has(w) && prev !== '.' ? 'b' : m[5] ? 'f' : null;
      out += cls ? `<span class="${cls}">${w}</span>` : w;
      if (m[5]) out += esc(m[5]);
    }
  }
  return out + esc(src.slice(last)) + '\n';
}

function editor(cell, { onInput, onKey, autofocus }) {
  const pre = h('pre', { class: 'nb-hl', 'aria-hidden': 'true' });
  const ta = h('textarea', { class: 'nb-ta', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': cell.type === 'code' ? 'Code' : 'Text' });
  ta.value = cell.src;
  const paint = () => { pre.innerHTML = cell.type === 'code' ? highlight(ta.value) : esc(ta.value) + '\n'; };
  paint();
  ta.addEventListener('input', () => { cell.src = ta.value; paint(); onInput?.(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = ta;
      ta.setRangeText('  ', a, b, 'end');
      ta.dispatchEvent(new Event('input'));
      return;
    }
    onKey?.(e, ta);
  });
  const wrap = h('div', { class: 'nb-editor ' + (cell.type === 'code' ? 'code' : 'text') }, pre, ta);
  if (autofocus) requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
  return wrap;
}

// ---------------------------------------------------------------- view

export function renderNotebook(id, view, { onDeleted } = {}) {
  const nb = liveFor(id);
  view.replaceChildren();
  if (!nb) { view.append(h('p', { class: 'note' }, 'That notebook no longer exists.')); return; }

  const list = h('div', { class: 'nb-cells' });
  const nodes = new Map();
  let saveTimer;
  const dirty = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveNb(nb), 400); };

  const ui = {
    refresh(cell) {
      const old = nodes.get(cell.id);
      if (!old) return;
      const fresh = cellNode(cell);
      old.replaceWith(fresh);
      nodes.set(cell.id, fresh);
    },
  };

  const focusCell = (cell) => {
    const el = nodes.get(cell.id);
    el?.querySelector('textarea')?.focus();
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const insert = (at, type) => {
    const [c] = toCells([{ type, src: '' }]);
    c.editing = true;
    nb.cells.splice(at, 0, c);
    draw();
    dirty();
    focusCell(c);
  };

  const after = (cell) => {
    const i = nb.cells.indexOf(cell);
    const next = nb.cells[i + 1];
    if (next) {
      if (next.type === 'md' && !next.editing) nodes.get(next.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      else focusCell(next);
    } else insert(i + 1, 'code');
  };

  function cellNode(cell) {
    const i = nb.cells.indexOf(cell);
    const tools = h('div', { class: 'nb-tools' },
      cell.type === 'md' && !cell.editing ? h('button', { title: 'Edit text', onclick: () => { cell.editing = true; ui.refresh(cell); focusCell(cell); } }, 'Edit') : null,
      h('button', { title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { nb.cells.splice(i, 1); nb.cells.splice(i - 1, 0, cell); draw(); dirty(); } }, '↑'),
      h('button', { title: 'Move down', 'aria-label': 'Move down', disabled: i === nb.cells.length - 1, onclick: () => { nb.cells.splice(i, 1); nb.cells.splice(i + 1, 0, cell); draw(); dirty(); } }, '↓'),
      h('button', { title: 'Delete cell', 'aria-label': 'Delete cell', onclick: () => { nb.cells.splice(nb.cells.indexOf(cell), 1); draw(); dirty(); } }, '×'));

    if (cell.type === 'md') {
      if (!cell.editing) {
        const body = renderMarkdown(cell.src || '*Empty text cell. Double-click to write.*');
        body.addEventListener('dblclick', () => { cell.editing = true; ui.refresh(cell); focusCell(cell); });
        return h('div', { class: 'nb-cell md-cell' }, tools, body);
      }
      const done = () => { cell.editing = false; ui.refresh(cell); };
      const ed = editor(cell, {
        onInput: dirty,
        onKey: (e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey))) { e.preventDefault(); done(); if (e.key === 'Enter' && e.shiftKey) after(cell); }
        },
      });
      return h('div', { class: 'nb-cell md-cell editing' }, tools, ed,
        h('div', { class: 'nb-hint' }, h('button', { class: 'btn small', onclick: done }, 'Done'), ' Shift+Enter or Esc to finish. Markdown, with $…$ for math.'));
    }

    const status = cell.status;
    const run = h('button', {
      class: 'nb-run' + (status === 'running' || status === 'queued' ? ' busy' : ''),
      title: 'Run (Shift+Enter)', 'aria-label': 'Run cell',
      onclick: () => runCell(nb, cell, ui),
    }, status === 'running' || status === 'queued' ? h('span', { class: 'spinner' }) : h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, html: '<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>' }));
    const gutter = h('div', { class: 'nb-gutter' }, run, h('div', { class: 'nb-count' }, cell.n ? `[${cell.n}]` : status === 'queued' ? '[·]' : ''));
    const ed = editor(cell, {
      onInput: dirty,
      onKey: (e) => {
        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); runCell(nb, cell, ui); after(cell); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runCell(nb, cell, ui); }
      },
      autofocus: cell.editing,
    });
    cell.editing = false;
    const meta = cell.ms !== undefined && status !== 'running' ? h('div', { class: 'nb-time' }, cell.ms < 1000 ? `${Math.round(cell.ms)} ms` : `${(cell.ms / 1000).toFixed(1)} s`) : null;
    const body = h('div', { class: 'nb-body' }, ed,
      status === 'running' && cell.out && !cell.out.childNodes.length ? h('div', { class: 'nb-out' }, h('div', { class: 'busy' }, h('span', { class: 'spinner' }), 'Running…')) : null,
      cell.out && (status !== 'running' || cell.out.childNodes.length) ? cell.out : null, meta);
    if (status === 'running' && cell.out) {
      // Output streams in (show() calls) while the cell runs.
      body.append(h('div', { class: 'nb-out-running' }, h('span', { class: 'spinner' }), 'Running…'));
    }
    return h('div', { class: 'nb-cell code-cell s-' + status }, tools, gutter, body);
  }

  const adder = (at) => h('div', { class: 'nb-add' },
    h('button', { onclick: () => insert(at, 'code') }, '+ Code'),
    h('button', { onclick: () => insert(at, 'md') }, '+ Text'));

  function draw() {
    list.replaceChildren();
    nodes.clear();
    nb.cells.forEach((c, i) => {
      list.append(adder(i));
      const n = cellNode(c);
      nodes.set(c.id, n);
      list.append(n);
    });
    list.append(adder(nb.cells.length));
  }

  // Header
  const title = h('div', { class: 'obj-title' });
  const showTitle = () => {
    title.replaceChildren(mixed(nb.title, 'h2'));
    if (!nb.builtin) title.append(h('button', { class: 'btn quiet small', onclick: editTitle }, 'Rename'));
  };
  const editTitle = () => {
    const inp = h('input', { type: 'text', value: nb.title, 'aria-label': 'Notebook title' });
    const done = () => { nb.title = inp.value.trim() || nb.title; saveNb(nb); showTitle(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = nb.title; inp.blur(); } });
    inp.addEventListener('blur', done);
    title.replaceChildren(inp); inp.focus(); inp.select();
  };
  showTitle();

  const runAll = async () => {
    for (const c of nb.cells) if (c.type === 'code') { c.status = 'queued'; ui.refresh(c); }
    for (const c of nb.cells) {
      if (c.type !== 'code') continue;
      await runCell(nb, c, ui);
      if (c.status === 'error') {
        for (const d of nb.cells) if (d.status === 'queued') { d.status = d.n ? 'done' : 'idle'; ui.refresh(d); }
        toast('Stopped at a cell with an error');
        break;
      }
    }
  };
  const clearAll = () => { for (const c of nb.cells) { c.out = null; c.n = null; c.ms = undefined; c.status = 'idle'; } nb.kernel = newKernel(); draw(); };

  const bar = h('div', { class: 'ops nb-bar' },
    h('button', { class: 'btn primary small', onclick: runAll }, 'Run all'),
    h('button', { class: 'btn small', title: 'Clear outputs and forget all variables', onclick: () => { clearAll(); toast('Outputs cleared and variables reset'); } }, 'Restart'),
    h('button', { class: 'btn small', onclick: () => exportJSON(nb) }, 'Download'),
    h('button', { class: 'btn small', title: 'Save a copy under Your notebooks', onclick: () => {
      const nid = create(nb.title + (nb.builtin ? '' : ' (copy)'), nb.cells.map((c) => ({ type: c.type, src: c.src })));
      toast('Saved a copy in Your notebooks');
      onChange(nid);
    } }, 'Make a copy'),
    nb.builtin && store.edits[nb.id] ? h('button', { class: 'btn small', onclick: () => {
      if (!confirm('Discard your edits to this example notebook?')) return;
      delete store.edits[nb.id]; persist();
      nb.cells = toCells(nb.def.cells); nb.kernel = newKernel();
      renderNotebook(id, view, { onDeleted });
      onChange();
    } }, 'Undo my edits') : null,
    !nb.builtin ? h('button', { class: 'btn small quiet', onclick: () => {
      if (!confirm(`Delete “${nb.title}”? This cannot be undone.`)) return;
      remove(nb.id); onDeleted?.();
    } }, 'Delete') : null);

  const codeCount = nb.cells.filter((c) => c.type === 'code').length;
  view.append(h('div', { class: 'nb-head' },
    h('div', { class: 'obj-head' }, h('div', { style: 'min-width:0;flex:1' }, title,
      h('div', { class: 'sub' }, `${nb.builtin ? 'Example notebook' : 'Your notebook'} · ${plural(codeCount, 'code cell')}${nb.builtin && store.edits[nb.id] ? ' · edited' : ''}`))),
    nb.def.blurb ? mixed(nb.def.blurb, 'p', 'nb-blurb') : null,
    bar,
    h('p', { class: 'nb-help' }, 'Code cells are JavaScript. Shift+Enter runs a cell; the value of its last line is shown. ',
      h('button', { class: 'linkish', onclick: () => helpBox.hidden = !helpBox.hidden }, 'What can I call?'))));
  const helpBox = h('div', { class: 'nb-ref', hidden: true }, renderMarkdown(REFERENCE));
  view.append(helpBox, list);
  draw();
}

const REFERENCE = `
**Making objects.** \`tri('poincare')\`, \`tri('lens', 7, 2)\`, \`tri(isoSig)\`, \`census('m004')\`, \`censusList('cusped', 20)\` (also \`'closed'\`, \`'closed-hyperbolic'\`, \`'knots'\`), \`link('figureEight')\`, \`link('torus', 3, 5)\`, \`link('PD[X[1,4,2,5], …]')\` or a DT/Gauss code, \`braid('1 1 -2')\`.

**Triangulations.** \`homology()\`, \`group()\`, \`covers(k)\`, \`census()\`, \`recognize()\`, \`isSphere()\`, \`isSolidTorus()\`, \`isHaken()\`, \`isIrreducible()\`, \`isZeroEfficient()\`, \`simplify()\`, \`doubleCover()\`, \`summands()\`, \`truncate()\`, \`makeIdeal()\`, \`hyperbolic()\`, \`volume()\`, \`fill(m, l)\`, \`fillings(slopes(6, 2))\`, \`canonical()\`, \`symmetries()\`, \`isAmphichiral()\`, \`isIsometricTo(N)\`, \`surfaces({coords: 'quad'})\`, \`angles({taut: true})\`, \`turaevViro(r)\`, \`open()\`.

**Links.** \`jones()\`, \`alexander()\`, \`homfly()\`, \`group()\`, \`covers(k)\`, \`complement()\`, \`diagram()\`, \`isUnknot()\`, \`mirror()\`, \`simplify()\`, \`connectedSum(L)\`, \`cable(n)\`, \`whiteheadDouble()\`, \`writhe()\`, \`linking()\`, \`open()\`.

**Showing things.** The last line's value is displayed. Also \`show(x, …)\`, \`print(…)\`, \`table(rows)\`, \`plot(points, {x: 'label', y: 'label'})\`, \`tex('\\\\pi_1')\`, \`md\\\`text\\\`\`. Values like polynomials and groups have \`.equals()\` and \`.tex\`.

Calls to Regina return promises: use \`await\` when you keep a result in a variable (\`const M = await census('m004')\`). Chains such as \`link('conway').complement().volume()\` need no \`await\`. Stop (top right) restarts the engine if something runs too long.
`;
