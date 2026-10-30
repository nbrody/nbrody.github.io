// alphaPy's notebook: marimo's reactive model in alphaCentaur's look. The file
// is a marimo notebook (format.js); each cell shows its output above its code;
// a live Python kernel (kernel.js) runs a cell and everything that depends on
// it, and reports which names each cell defines and uses so the file's
// signatures stay right. Markdown cells (mo.md) are edited as Markdown. As in
// Colab, a caret left of each cell shows or hides its code, and a Markdown
// heading's caret collapses its section. Used by both hosts: alphaCentaur
// (js/host.js) and the standalone shell.
import {
  EditorState, EditorView, Compartment, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  history, defaultKeymap, historyKeymap, indentWithTab, searchKeymap, highlightSelectionMatches,
  syntaxHighlighting, HighlightStyle, tags as t, bracketMatching, indentUnit, python, markdown,
} from '../vendor/codemirror.js';
import { parse, serialize, markdownParts, markdownCell, configFlag, setConfigFlag } from './format.js';
import { KernelClient } from './kernel.js';
import { createOutputs } from './outputs.js';
import { projectMacros } from '../../markdown/js/syntax.js';
import { katex } from '../../markdown/js/libs.js';
import { headingKey } from '../../markdown/js/folding.js';

// Syntax colors from the skin's hues (alphaCentaur's Settings → Appearance;
// Harbor's on their own), so code stays readable on dark skins too.
const skinHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: 'var(--skin-purple)' },
  { tag: [t.function(t.variableName), t.labelName, t.atom, t.bool, t.special(t.variableName)], color: 'var(--skin-blue)' },
  { tag: [t.typeName, t.className, t.number, t.annotation, t.modifier, t.self, t.namespace, t.constant(t.name), t.standard(t.name)], color: 'var(--skin-amber)' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.special(t.string)], color: 'var(--skin-accent)' },
  { tag: [t.string, t.inserted, t.processingInstruction], color: 'var(--skin-green)' },
  { tag: [t.comment, t.meta], color: 'color-mix(in srgb, var(--skin-fg) 50%, var(--skin-bg))', fontStyle: 'italic' },
  { tag: t.heading, fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.invalid, color: 'var(--skin-red)' },
]);

const h = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children.filter(c => c != null));
  return e;
};
let counter = 0;
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const seconds = s => (typeof s !== 'number' ? '' : s < 1 ? `${Math.round(s * 1000)} ms` : s < 60 ? `${s.toFixed(2)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// marimo writes `async def` for cells that await at the top level.
const usesAwait = code => /\bawait\b|\basync\s+(?:for|with)\b/.test(code) && !/\basync\s+def\b/.test(code);
const editorTheme = EditorView.theme({
  '&': { fontSize: '13.5px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.55' },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'color-mix(in srgb, var(--skin-bg) 58%, var(--skin-fg))' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--skin-bg) 95%, var(--skin-accent))' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--skin-accent)' },
  '.cm-selectionBackground': { background: '#d3ece6 !important' },
});

// opts: {icon, onChange(content)}. Returns {load(content, context), setContext(context), destroy()};
// context: {kernel, macrosSource, readOnly, docKey}. docKey: where collapsed sections are remembered.
export function createNotebook(container, { icon, onChange }) {
  let doc = null, cells = [], raw = null, content = null, loaded = false;
  let kernelSpec = null, kernel = null, kstatus = 'none', versions = '', deadMessage = '', firstRun = true;
  let macrosSource = null, macros = {}, readOnly = false, syncTimer = null;
  let docKey = '', folds = new Set();
  const graph = new Map();
  // A heading cell's caret lines up with its heading, which moves as the text reflows.
  const sizes = new ResizeObserver(entries => { for (const e of entries) alignCaret(e.target.cell); });
  const outputs = createOutputs({
    sendUI: (element, value) => kernel?.send({ type: 'ui', element, value }),
    macros: () => macros,
  });

  // ---------------------------------------------------------------- frame --
  // Labels hide on narrow screens, so each button also carries its name.
  const button = (iconName, label, onclick, cls = 'py-btn') => h('button', { type: 'button', class: cls, onclick, ...(label ? { title: label, 'aria-label': label } : {}) }, icon(iconName, 15), label ? h('span', {}, label) : null);
  const runAll = button('play', 'Run all', () => runAllCells());
  const staleCount = h('span', { class: 'py-count' });
  const runStale = h('button', { type: 'button', class: 'py-btn', title: 'Run stale cells (edited since they last ran)', 'aria-label': 'Run stale cells', onclick: () => runStaleCells() }, icon('play', 15), h('span', {}, 'Run stale'), staleCount);
  const interrupt = button('square', 'Interrupt', () => kernel?.interrupt());
  const restart = button('rotate-ccw', 'Restart', () => restartKernel());
  const status = h('span', { class: 'py-status', role: 'status' });
  const logText = h('pre', { class: 'py-log', hidden: true });
  const logToggle = h('button', { type: 'button', class: 'py-btn ghost', title: 'Kernel log', onclick: () => { logText.hidden = !logText.hidden; } }, 'Log');
  const addPy = button('plus', 'Python', () => addCell(cells.length, 'python'), 'py-btn ghost');
  const addMd = button('type', 'Markdown', () => addCell(cells.length, 'markdown'), 'py-btn ghost');
  for (const [b, name] of [[addPy, 'Add a Python cell'], [addMd, 'Add a Markdown cell']]) { b.title = name; b.setAttribute('aria-label', name); }
  const toolbar = h('div', { class: 'py-toolbar' },
    h('span', { class: 'applet-name', title: "alphaPy, alphaCentaur's Python notebooks (marimo-compatible). It also runs on its own: node python/server.mjs <folder> --open" }, 'alphaPy'),
    runAll, runStale, interrupt, restart, h('div', { class: 'spacer' }), status, logToggle, addPy, addMd);
  const column = h('div', { class: 'py-cells' });
  const endBar = h('div', { class: 'py-end' },
    button('plus', 'Python', () => addCell(cells.length, 'python'), 'py-btn ghost'),
    button('type', 'Markdown', () => addCell(cells.length, 'markdown'), 'py-btn ghost'));
  const rawBox = h('div', { class: 'py-raw', hidden: true });
  const scroll = h('div', { class: 'py-scroll' }, column, rawBox);
  container.replaceChildren(h('div', { class: 'py-applet' }, toolbar, logText, scroll));

  function paintToolbar() {
    const running = cells.filter(c => c.status === 'running' || c.status === 'queued').length;
    const stale = cells.filter(isStale).length;
    const ready = kstatus === 'idle';
    staleCount.textContent = stale ? String(stale) : '';
    runAll.disabled = !ready || readOnly || !doc;
    runStale.disabled = !ready || !stale || readOnly || !doc;
    interrupt.disabled = !ready || !running;
    restart.disabled = !kernelSpec || !doc;
    restart.classList.toggle('attention', kstatus === 'stopped');
    for (const b of [runAll, runStale, interrupt, restart, addPy, addMd]) b.hidden = readOnly || !doc;
    status.textContent = !doc ? 'Plain Python file' : !kernelSpec ? 'No kernel'
      : kstatus === 'starting' ? 'Starting Python…'
      : kstatus === 'stopped' ? `Kernel stopped${deadMessage ? `: ${deadMessage}` : ''}`
      : running ? `Running ${plural(running, 'cell')}…` : `Idle${versions ? ` · ${versions}` : ''}`;
    status.dataset.state = kstatus === 'idle' && running ? 'running' : kstatus;
  }
  function log(text) {
    logText.textContent = (logText.textContent + text).slice(-50_000);
    logText.scrollTop = logText.scrollHeight;
  }

  // ---------------------------------------------------------------- cells --
  const isStale = c => c.ranCode !== c.code;
  const readOnlyExtension = () => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];

  function makeCell(spec) {
    const md = markdownParts(spec.code);
    const c = {
      id: newId(), name: spec.name || '_', config: spec.config || '', args: [...(spec.args || [])], returns: [...(spec.returns || [])],
      isAsync: !!spec.isAsync, kind: md ? 'markdown' : 'python', code: spec.code || '', text: md?.text ?? '', prefix: md?.prefix ?? 'r',
      status: 'idle', ranCode: null, syncedCode: null, output: null, elapsed: null,
      heading: null, foldedAway: false,
    };
    // Python cells hide their code when the file says so; Markdown cells show their text, not their source.
    c.hidden = c.kind === 'markdown' || configFlag(c.config, 'hide_code');
    c.outputEl = h('div', { class: 'py-output' });
    c.consoleEl = h('pre', { class: 'py-console', hidden: true });
    c.runErrorEl = h('div', { class: 'py-run-error', hidden: true });
    c.graphErrorEl = h('div', { class: 'py-graph-error', hidden: true });
    c.editorEl = h('div', { class: 'py-editor' });
    // Showing a Markdown cell's source is temporary (it folds back on blur); for Python it's the setting.
    // The button stands in for a hidden cell that has no output yet.
    c.showCode = h('button', { type: 'button', class: 'py-show-code', onclick: () => setHidden(c, false, { persist: c.kind === 'python' && !readOnly, focus: !readOnly }) }, icon('code', 14), 'Show code');
    c.caret = h('button', { type: 'button', class: 'py-caret', onclick: e => { e.stopPropagation(); caretClicked(c); }, ondblclick: e => e.stopPropagation() });
    c.foldBar = h('button', { type: 'button', class: 'py-fold-bar', hidden: true, onclick: () => setFolded(c, false) });
    c.elapsedEl = h('span', { class: 'py-elapsed' });
    const tool = (name, title, fn) => h('button', { type: 'button', class: 'py-tool', title, 'aria-label': title, onclick: e => { e.stopPropagation(); fn(); } }, icon(name, 15));
    c.tools = h('div', { class: 'py-tools' },
      tool('play', 'Run (⌘↩)', () => runCells([c])),
      tool('chevron-up', 'Move up', () => moveCell(c, -1)), tool('chevron-down', 'Move down', () => moveCell(c, 1)),
      tool('plus', 'Add Python below', () => addCell(cells.indexOf(c) + 1, 'python')),
      tool('type', 'Add Markdown below', () => addCell(cells.indexOf(c) + 1, 'markdown')),
      tool('trash-2', 'Delete cell', () => deleteCell(c)));
    c.el = h('div', { class: 'py-cell' }, c.caret, c.tools, c.graphErrorEl, c.outputEl, c.foldBar, c.showCode, c.consoleEl, c.runErrorEl, c.editorEl, h('div', { class: 'py-foot' }, c.elapsedEl));
    // A Markdown cell's rendered text opens its editor on double-click.
    c.outputEl.addEventListener('dblclick', () => { if (c.kind === 'markdown' && c.hidden && !readOnly) setHidden(c, false, { persist: false, focus: true }); });
    c.outputEl.cell = c;
    sizes.observe(c.outputEl);
    buildEditor(c);
    paint(c);
    return c;
  }

  function buildEditor(c) {
    c.view?.destroy();
    c.editable = new Compartment();
    const keys = [
      { key: 'Shift-Enter', run: () => { runCells([c]); focusNext(c); return true; } },
      { key: 'Mod-Enter', run: () => { runCells([c]); return true; } },
      { key: 'Alt-Enter', run: () => { runCells([c]); addCell(cells.indexOf(c) + 1, 'python'); return true; } },
      { key: 'Escape', run: v => { v.contentDOM.blur(); return true; } },
    ];
    c.view = new EditorView({
      parent: c.editorEl,
      state: EditorState.create({
        doc: c.kind === 'markdown' ? c.text : c.code,
        extensions: [
          ...(c.kind === 'python' ? [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), python()] : [markdown(), EditorView.lineWrapping]),
          history(), drawSelection(), bracketMatching(), highlightSelectionMatches(), indentUnit.of('    '),
          keymap.of([...keys, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          syntaxHighlighting(skinHighlight), editorTheme, c.editable.of(readOnlyExtension()),
          EditorView.contentAttributes.of({ 'aria-label': c.kind === 'markdown' ? 'Markdown cell' : 'Python cell' }),
          EditorView.updateListener.of(u => {
            if (u.docChanged) edited(c, u.state.doc.toString());
            if (u.focusChanged && !u.view.hasFocus) blurred(c);
          }),
        ],
      }),
    });
  }

  function paint(c) {
    c.el.dataset.status = c.status;
    c.el.dataset.kind = c.kind;
    c.el.classList.toggle('stale', isStale(c) && c.status !== 'running' && c.status !== 'queued');
    c.el.classList.toggle('code-hidden', c.hidden);
    c.el.classList.toggle('has-output', !!c.output);
    c.editorEl.hidden = c.hidden;
    c.showCode.hidden = !c.hidden || !!c.output || (readOnly && c.kind === 'markdown');
    c.showCode.lastChild.textContent = c.kind === 'markdown' ? 'Edit Markdown' : 'Show code';
    c.tools.hidden = readOnly;
    paintCaret(c);
    c.elapsedEl.textContent = c.status === 'running' ? 'Running…' : c.status === 'queued' ? 'Queued' : c.elapsed != null ? seconds(c.elapsed) : '';
  }

  // Hiding code is a setting in the file (@app.cell(hide_code=True)). persist: false only
  // shows the editor for now (a hidden-code Markdown cell being edited).
  function setHidden(c, hidden, { persist = true, focus = false } = {}) {
    c.hidden = hidden;
    if (persist) {
      const config = setConfigFlag(c.config, 'hide_code', hidden);
      if (config !== c.config) { c.config = config; save(); }
    }
    paint(c);
    if (!hidden && focus) c.view.focus();
  }

  // ---------------------------------------------------------- the carets --
  // A Python cell's caret shows or hides its code (saved as hide_code; only for
  // now in a read-only notebook). A Markdown cell with a heading has a caret
  // that collapses its section: the cells below it, up to the next heading of
  // the same or a higher level. Collapsed sections are remembered on this device.
  function paintCaret(c) {
    const section = c.kind === 'markdown' && c.heading;
    c.caret.hidden = c.kind === 'markdown' && !section;
    if (c.caret.hidden) return;
    const open = section ? !folds.has(c.heading.key) : !c.hidden;
    const label = section ? (open ? 'Collapse section' : 'Expand section') : open ? 'Hide code' : 'Show code';
    c.caret.replaceChildren(icon(open ? 'chevron-down' : 'chevron-right', 16));
    c.caret.title = label;
    c.caret.setAttribute('aria-label', label);
    c.caret.setAttribute('aria-expanded', String(open));
    // An open code caret appears on hover; closed ones, and section carets, always show.
    c.caret.classList.toggle('quiet', !section && open);
  }
  function alignCaret(c) {
    const target = c.kind === 'markdown' && c.heading && !c.foldedAway && c.outputEl.querySelector(`h${c.heading.level}`);
    if (!target) { c.caret.style.top = ''; return; }
    const top = target.getBoundingClientRect().top - c.el.getBoundingClientRect().top + target.offsetHeight / 2 - 12;
    c.caret.style.top = `${Math.round(top)}px`;
  }
  function caretClicked(c) {
    if (c.kind === 'markdown') { if (c.heading) setFolded(c, !folds.has(c.heading.key)); return; }
    setHidden(c, !c.hidden, { persist: !readOnly });
  }

  // A Markdown cell's heading, outside code blocks: the highest level, and its first title.
  function headingOf(c) {
    if (c.kind !== 'markdown') return null;
    let fence = null, best = null;
    for (const line of c.text.split('\n')) {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
      if (fence) continue;
      const m = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(line);
      if (m && m[2] && (!best || m[1].length < best.level)) best = { level: m[1].length, label: m[2].trim() };
    }
    return best;
  }
  function paintFolds() {
    const seen = new Map();
    for (const c of cells) {
      const hd = headingOf(c);
      if (!hd) { c.heading = null; continue; }
      const identity = `${hd.level}:${hd.label}`, n = seen.get(identity) || 0;
      seen.set(identity, n + 1);
      c.heading = { ...hd, key: `${headingKey(identity)}-${n}` };
    }
    // Walk down the notebook, hiding what a collapsed heading covers.
    let hiding = null;
    for (const c of cells) {
      if (c.heading && hiding && c.heading.level <= hiding.heading.level) hiding = null;
      c.foldedAway = !!hiding;
      c.el.hidden = c.foldedAway;
      if (!hiding && c.heading && folds.has(c.heading.key)) hiding = c;
    }
    for (const [i, c] of cells.entries()) {
      paintCaret(c);
      alignCaret(c);
      const folded = c.heading && !c.foldedAway && folds.has(c.heading.key);
      c.foldBar.hidden = !folded;
      if (!folded) continue;
      const inside = [];
      for (const d of cells.slice(i + 1)) { if (d.heading && d.heading.level <= c.heading.level) break; inside.push(d); }
      const errors = inside.filter(d => d.status === 'error' || d.el.classList.contains('graph-error')).length;
      const running = inside.some(d => d.status === 'running' || d.status === 'queued');
      c.foldBar.replaceChildren(...[icon('chevron-right', 14), h('span', {}, inside.length ? `${plural(inside.length, 'cell')} hidden` : 'Nothing below this heading'),
        errors ? h('span', { class: 'err' }, `· ${plural(errors, 'error')}`) : null, running ? h('span', {}, '· running') : null].filter(Boolean));
      c.foldBar.title = 'Expand section';
    }
  }
  function setFolded(c, on) {
    if (!c.heading) return;
    if (on) folds.add(c.heading.key); else folds.delete(c.heading.key);
    writeFolds();
    paintFolds();
  }
  // Open the collapsed sections a cell is inside (a new cell, or the next one to edit).
  function reveal(c) {
    while (c.foldedAway) {
      const i = cells.indexOf(c);
      const owner = cells.slice(0, i).reverse().find(d => d.heading && !d.foldedAway && folds.has(d.heading.key));
      if (!owner) break;
      folds.delete(owner.heading.key);
      paintFolds();
    }
    writeFolds();
  }
  const foldsKey = () => `alpha:notebook-folds:${docKey}`;
  function readFolds() {
    if (!docKey) return new Set();
    try {
      const v = JSON.parse(localStorage.getItem(foldsKey()) || '[]');
      return new Set(Array.isArray(v) ? v.filter(k => typeof k === 'string' && /^[a-z0-9]+-[a-z0-9]+-\d+$/.test(k)) : []);
    } catch { return new Set(); }
  }
  function writeFolds() {
    if (!docKey) return;
    // Keys of headings that no longer exist are dropped.
    const live = new Set(cells.map(c => c.heading?.key).filter(Boolean));
    try { localStorage.setItem(foldsKey(), JSON.stringify([...folds].filter(k => live.has(k)))); } catch { /* collapsing still works without storage */ }
  }

  function edited(c, text) {
    if (c.kind === 'markdown') {
      c.text = text;
      const code = markdownCell(text, c.prefix);
      if (code == null) {
        // Text no triple-quoted string can hold: the cell becomes Python.
        c.kind = 'python';
        c.code = `mo.md(${JSON.stringify(text)})`;
        buildEditor(c);
        c.view.focus();
      } else c.code = code;
      // Its heading may have changed.
      paintFolds();
      // Markdown re-renders as you type, a moment after you stop.
      clearTimeout(c.mdTimer);
      c.mdTimer = setTimeout(() => { if (kstatus === 'idle' && isStale(c)) runCells([c]); }, 500);
    } else {
      c.code = text;
      c.isAsync = usesAwait(text) || (c.isAsync && /\bawait\b/.test(text));
    }
    paint(c);
    paintToolbar();
    scheduleSync();
    save();
  }
  // A hidden-code cell that was opened for editing folds back when you leave it,
  // and a Markdown cell shows its text again (once it has text to show).
  function blurred(c) {
    if (readOnly || c.hidden) return;
    if (c.kind === 'markdown') {
      if (isStale(c) && kstatus === 'idle') runCells([c]);
      if (!c.output) return;
    } else if (!configFlag(c.config, 'hide_code')) return;
    c.hidden = true;
    paint(c);
  }

  function addCell(index, kind) {
    if (readOnly || !doc) return null;
    const spec = kind === 'markdown'
      ? { name: '_', code: markdownCell('', 'r'), config: 'hide_code=True', args: [], returns: [] }
      : { name: '_', code: '', config: '', args: [], returns: [] };
    const c = makeCell(spec);
    if (kind === 'markdown') { c.hidden = false; paint(c); }
    cells.splice(index, 0, c);
    placeCells();
    reveal(c);
    c.view.focus();
    scheduleSync();
    save();
    return c;
  }
  function deleteCell(c) {
    const i = cells.indexOf(c);
    if (i < 0 || readOnly) return;
    cells.splice(i, 1);
    c.view.destroy();
    sizes.unobserve(c.outputEl);
    c.el.remove();
    graph.delete(c.id);
    // A notebook keeps at least one cell (with none, the file wouldn't be a notebook).
    if (!cells.length) addCell(0, 'python');
    else (cells[i] || cells[i - 1]).view.focus();
    scheduleSync();
    save();
    paintToolbar();
  }
  function moveCell(c, by) {
    const i = cells.indexOf(c), j = i + by;
    if (i < 0 || j < 0 || j >= cells.length || readOnly) return;
    [cells[i], cells[j]] = [cells[j], cells[i]];
    placeCells();
    scheduleSync();
    save();
  }
  function focusNext(c) {
    // The next cell you can see: collapsed sections are skipped.
    const next = cells.slice(cells.indexOf(c) + 1).find(n => !n.foldedAway);
    if (next) { if (next.hidden) setHidden(next, false, { persist: false }); next.view.focus(); }
    else addCell(cells.length, 'python');
  }
  function placeCells() { column.replaceChildren(...cells.map(c => c.el), endBar); paintFolds(); }

  // ------------------------------------------------------------ the file --
  const fileCell = c => ({ name: c.name, code: c.code, config: c.config, args: c.args, returns: c.returns, isAsync: c.isAsync });
  function save() {
    if (readOnly || !doc) return;
    const text = serialize({ header: doc.header, footer: doc.footer, cells: cells.map(fileCell) });
    if (text === content) return;
    content = text;
    onChange(text);
  }
  // A newer version of the file: keep cells whose code is unchanged (and their outputs).
  function reconcile(next) {
    const pool = new Map();
    for (const c of cells) (pool.get(c.code) || pool.set(c.code, []).get(c.code)).push(c);
    const kept = next.map(spec => {
      const same = pool.get(spec.code)?.shift();
      if (!same) return makeCell(spec);
      if (same.config !== spec.config && same.kind === 'python') same.hidden = configFlag(spec.config, 'hide_code');
      Object.assign(same, { name: spec.name, config: spec.config, args: [...spec.args], returns: [...spec.returns], isAsync: !!spec.isAsync });
      paint(same);
      return same;
    });
    for (const leftovers of pool.values()) for (const c of leftovers) { c.view.destroy(); sizes.unobserve(c.outputEl); graph.delete(c.id); }
    cells = kept;
    placeCells();
  }

  // Plain scripts (or newer marimo layouts) open in one editor that still saves.
  function showRaw(text) {
    for (const c of cells) c.view.destroy();
    cells = [];
    doc = null;
    column.hidden = true;
    rawBox.hidden = false;
    if (kernel) { kernel.stop(); kernel = null; kstatus = 'none'; }
    if (!raw) {
      const editorEl = h('div', { class: 'py-editor py-raw-editor' });
      rawBox.replaceChildren(h('div', { class: 'py-notice' }, icon('circle-alert', 16), h('span', {}, "This file isn't an alphaPy notebook alphaPy can split into cells, so it opens as plain Python.")), editorEl);
      raw = { editable: new Compartment(), quiet: false };
      raw.view = new EditorView({
        parent: editorEl,
        state: EditorState.create({
          doc: text,
          extensions: [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), python(), history(), drawSelection(), bracketMatching(), highlightSelectionMatches(), indentUnit.of('    '),
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]), syntaxHighlighting(skinHighlight), editorTheme, raw.editable.of(readOnlyExtension()),
            EditorView.updateListener.of(u => { if (u.docChanged && !raw.quiet && !readOnly) { content = u.state.doc.toString(); onChange(content); } })],
        }),
      });
    } else if (raw.view.state.doc.toString() !== text) {
      raw.quiet = true;
      raw.view.dispatch({ changes: { from: 0, to: raw.view.state.doc.length, insert: text } });
      raw.quiet = false;
    }
    paintToolbar();
  }
  function hideRaw() {
    if (!raw) return;
    raw.view.destroy();
    raw = null;
    rawBox.replaceChildren();
    rawBox.hidden = true;
    column.hidden = false;
  }

  // --------------------------------------------------------------- kernel --
  const byId = id => cells.find(c => c.id === id);
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(flushSync, 250); }
  function flushSync() {
    clearTimeout(syncTimer);
    syncTimer = null;
    if (!kernel || kstatus !== 'idle' || !doc) return;
    for (const c of cells) c.syncedCode = c.code;
    kernel.send({ type: 'sync', cells: cells.map(c => ({ id: c.id, code: c.code })) });
  }
  function runCells(list) {
    if (readOnly || kstatus !== 'idle' || !list.length) return;
    flushSync();
    kernel.send({ type: 'run', ids: list.map(c => c.id) });
  }
  function runAllCells() { if (kstatus !== 'idle' || readOnly) return; flushSync(); kernel.send({ type: 'run_all' }); }
  function runStaleCells() { runCells(cells.filter(isStale)); }

  function startKernel() {
    if (!kernelSpec || kernel || !doc) {
      // Without a kernel (a read-only view such as the web demo) nothing sends Markdown output,
      // so the Markdown cells render from their own text.
      if (!kernelSpec && doc) for (const c of cells) if (c.kind === 'markdown' && !c.output) setOutput(c, { mime: 'text/markdown', data: c.text });
      paintToolbar();
      return;
    }
    kstatus = 'starting';
    deadMessage = '';
    firstRun = true;
    const k = new KernelClient(kernelSpec, msg => { if (kernel === k) onKernel(msg); });
    kernel = k;
    k.start().catch(e => { if (kernel !== k) return; kstatus = 'stopped'; deadMessage = e.message; paintToolbar(); });
    paintToolbar();
  }
  function restartKernel() {
    kernel?.stop();
    kernel = null;
    // The new kernel has none of the old state: every cell needs running again.
    for (const c of cells) { c.ranCode = null; if (c.status === 'running' || c.status === 'queued') c.status = 'idle'; paint(c); }
    startKernel();
  }

  function onKernel(msg) {
    switch (msg.type) {
      case 'ready':
        kstatus = 'idle';
        versions = [msg.python && `Python ${msg.python}`, msg.flint && `FLINT ${msg.flint}`].filter(Boolean).join(' · ');
        flushSync();
        // marimo runs a notebook when it opens (and after a restart).
        if (firstRun) { firstRun = false; kernel.send({ type: 'run_all' }); }
        break;
      case 'graph': applyGraph(msg.cells || []); break;
      case 'queued':
        for (const id of msg.ids || []) { const c = byId(id); if (c) { c.status = 'queued'; paint(c); } }
        break;
      case 'cell': cellMessage(msg); break;
      case 'console': {
        const c = byId(msg.id);
        if (!c) break;
        c.consoleEl.hidden = false;
        const chunk = h('span', { class: msg.stream === 'stderr' ? 'stderr' : 'stdout' }, String(msg.text ?? ''));
        c.consoleEl.append(chunk);
        // Keep the console readable: the last 200 kB.
        while (c.consoleEl.textContent.length > 200_000 && c.consoleEl.firstChild) c.consoleEl.firstChild.remove();
        break;
      }
      case 'idle':
        for (const c of cells) if (c.status === 'queued') { c.status = 'idle'; paint(c); }
        break;
      case 'log': log(String(msg.text ?? '')); break;
      case 'dead':
        kstatus = 'stopped';
        deadMessage = msg.message || { time_limit: 'it hit its time limit', idle: 'it was idle', killed: 'it was stopped', exited: 'it exited' }[msg.reason] || '';
        kernel?.disconnect();
        for (const c of cells) { c.ranCode = null; if (c.status === 'running' || c.status === 'queued') c.status = 'idle'; paint(c); }
        break;
    }
    paintToolbar();
  }

  function applyGraph(list) {
    for (const g of list) graph.set(g.id, g);
    let changed = false;
    for (const c of cells) {
      const g = graph.get(c.id);
      if (!g) continue;
      const err = g.error;
      c.graphErrorEl.hidden = !err;
      c.graphErrorEl.replaceChildren(...(err ? [icon('circle-alert', 15), h('span', {}, `${{ syntax: 'Syntax error', 'multiple-definitions': 'Defined in more than one cell', cycle: 'Circular dependency' }[err.kind] || 'Problem'}${err.line ? ` (line ${err.line})` : ''}: ${err.message}`)] : []));
      c.el.classList.toggle('graph-error', !!err);
      // The file's signature: what this cell uses from other cells, and what it defines.
      if (err?.kind === 'syntax') continue;
      const fromParents = new Set((g.parents || []).flatMap(id => graph.get(id)?.defs || []));
      const args = [...new Set((g.refs || []).filter(n => fromParents.has(n) && !n.startsWith('_')))].sort();
      const returns = [...new Set((g.defs || []).filter(n => !n.startsWith('_')))].sort();
      if (!sameList(args, [...c.args].sort())) { c.args = args; changed = true; }
      if (!sameList(returns, [...c.returns].sort())) { c.returns = returns; changed = true; }
    }
    if (changed) save();
  }

  function cellMessage(msg) {
    const c = byId(msg.id);
    if (!c) return;
    if (msg.status === 'running') {
      c.status = 'running';
      c.consoleEl.replaceChildren();
      c.consoleEl.hidden = true;
      c.runErrorEl.hidden = true;
      c.outputEl.classList.add('dim');
      paint(c);
      return;
    }
    c.status = msg.status;
    c.elapsed = typeof msg.elapsed === 'number' ? msg.elapsed : null;
    c.outputEl.classList.remove('dim');
    // A cell that ran (even to an error, or mo.stop) is current; skipped or interrupted ones aren't.
    if (['done', 'error', 'stopped'].includes(msg.status)) c.ranCode = c.syncedCode ?? c.code;
    if (msg.status !== 'interrupted' && msg.status !== 'skipped') setOutput(c, msg.output || null);
    const err = msg.error;
    const note = msg.status === 'skipped' ? 'An earlier cell this one uses failed.'
      : msg.status === 'interrupted' ? 'Interrupted.' : msg.status === 'stopped' && !msg.output ? 'Stopped by mo.stop.' : '';
    c.runErrorEl.hidden = !err && !note;
    c.runErrorEl.replaceChildren(...(err ? [h('pre', {}, err.traceback || `${err.name}: ${err.message}`)] : note ? [h('p', {}, note)] : []));
    // A Markdown cell shows its text again once it has something to show.
    if (c.kind === 'markdown' && c.output && !c.view.hasFocus) c.hidden = true;
    paint(c);
    // A collapsed section's bar counts the errors inside it.
    if (c.foldedAway || c.heading) paintFolds();
  }
  function setOutput(c, output) {
    c.output = output;
    c.outputEl.replaceChildren(output ? outputs.render(output) : '');
    alignCaret(c);
  }

  // -------------------------------------------------------------- context --
  function apply(context) {
    let restartNeeded = false;
    if ('macrosSource' in context && (context.macrosSource || '') !== (macrosSource || '')) {
      macrosSource = context.macrosSource || '';
      macros = projectMacros(macrosSource, katex).macros;
      for (const c of cells) if (c.output) setOutput(c, c.output);
    }
    if ('readOnly' in context && !!context.readOnly !== readOnly) {
      readOnly = !!context.readOnly;
      for (const c of cells) { c.view.dispatch({ effects: c.editable.reconfigure(readOnlyExtension()) }); paint(c); }
      if (raw) raw.view.dispatch({ effects: raw.editable.reconfigure(readOnlyExtension()) });
      endBar.hidden = readOnly;
    }
    if ('docKey' in context && String(context.docKey || '') !== docKey) {
      docKey = String(context.docKey || '');
      folds = readFolds();
      paintFolds();
    }
    if ('kernel' in context && JSON.stringify(context.kernel || null) !== JSON.stringify(kernelSpec)) {
      kernelSpec = context.kernel || null;
      restartNeeded = true;
    }
    return restartNeeded;
  }

  return {
    load(text, context = {}) {
      const restartNeeded = apply(context);
      if (loaded && text === content) {
        if (restartNeeded) { kernel ? restartKernel() : startKernel(); }
        paintToolbar();
        return;
      }
      loaded = true;
      content = text;
      const parsed = parse(text);
      if (!parsed) { showRaw(text); return; }
      hideRaw();
      doc = { header: parsed.header, footer: parsed.footer };
      reconcile(parsed.cells);
      if (restartNeeded && kernel) restartKernel();
      else if (!kernel) startKernel();
      else flushSync();
      paintToolbar();
    },
    setContext(context) {
      if (apply(context)) { kernel ? restartKernel() : startKernel(); }
      paintToolbar();
    },
    destroy() {
      clearTimeout(syncTimer);
      kernel?.stop();
      kernel = null;
      for (const c of cells) c.view.destroy();
      raw?.view.destroy();
      sizes.disconnect();
      outputs.destroy();
      container.replaceChildren();
    },
  };
}
