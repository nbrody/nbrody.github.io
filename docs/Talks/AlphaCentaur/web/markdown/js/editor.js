// alphaMarkdown's note editor: a toolbar (name, Live editing / Source /
// Reading, Editor guide) over the note. Live editing is one editor that draws
// the note as it reads and shows Markdown only where the cursor is
// (live-preview.js); Source edits the plain Markdown; Reading only renders.
// Used by both hosts: alphaCentaur (js/host.js) and the standalone folder
// shell (/standalone/shell.js). A bare editor (alphaCentaur's Overview shows
// description.md this way) has no toolbar and is always Live editing.
import {
  EditorState, EditorView, keymap, drawSelection, history, defaultKeymap, historyKeymap, indentWithTab,
  searchKeymap, highlightSelectionMatches, syntaxHighlighting, HighlightStyle, tags as t, bracketMatching, markdown,
} from '../vendor/codemirror.js';
import { libs, info, katex } from './libs.js';
import { renderTree } from './render.js';
import { toDom } from './hast.js';
import { toggleFold, readFolds, writeFolds } from './folding.js';
import { createLiveEditor } from './live-preview.js';
import { openGuide } from './guide.js';

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

const MODES = [['live', 'Live editing'], ['source', 'Source'], ['reading', 'Reading']];
const storedMode = () => { try { const m = localStorage.getItem('alphaMarkdown:mode'); return MODES.some(([k]) => k === m) ? m : 'live'; } catch { return 'live'; } };

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

// Source mode: the plain Markdown, monospaced.
function sourceEditor(parent, { doc, onChange }) {
  let quiet = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(), drawSelection(), bracketMatching(), highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.lineWrapping, syntaxHighlighting(skinHighlight), markdown(),
        EditorView.updateListener.of(u => { if (u.docChanged && !quiet) onChange(u.state.doc.toString()); }),
        EditorView.theme({
          '&': { fontSize: '16px' },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, monospace', overflow: 'auto' },
          '.cm-content': { padding: '28px 26px', minHeight: '300px' },
          '&.cm-focused': { outline: 'none' },
          '.cm-cursor': { borderLeftColor: 'var(--skin-accent)' },
          '.cm-selectionBackground': { background: '#d3ece6 !important' },
        }),
      ],
    }),
  });
  return {
    // Replace the text without reporting it as an edit.
    set(text) { if (text === view.state.doc.toString()) return; quiet = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); quiet = false; },
    destroy() { view.destroy(); },
  };
}

// opts: {icon, onChange(content), onLink(name), macrosHint, onCaret({top, bottom})}
// onCaret reports where the cursor went after typing or keyboard movement, so a
// host that scrolls the note itself can keep it in view.
// Returns {load(content, context), setContext(context), destroy()}.
// context: {docKey, macros, resolveURL, readOnly, bare}.
export function createNoteEditor(container, { icon, onChange, onLink, macrosHint, onCaret }) {
  let content = '', mode = storedMode(), macros = {}, docKey = '', resolveURL = null, readOnly = false, bare = false;
  let folds = [], editor = null, editorMode = null, loaded = false;

  const modeButtons = MODES.map(([key, label]) => h('button', { type: 'button', role: 'tab', 'data-mode': key, onclick: () => setMode(key) }, label));
  const toolbar = h('div', { class: 'note-toolbar' },
    h('span', { class: 'applet-name', title: "alphaMarkdown, alphaCentaur's Markdown notes editor. It also runs on its own: node markdown/server.mjs <folder> --open" }, 'alphaMarkdown'),
    h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Mode' }, ...modeButtons),
    h('div', { class: 'spacer' }),
    h('button', { type: 'button', class: 'ghost-btn', onclick: () => openGuide({ macros: macrosHint, icon }) }, icon('circle-question-mark', 16), 'Editor guide'));
  const prose = h('div', { class: 'prose' });
  const scroll = h('div', { class: 'note-scroll' });
  const root = h('div', { class: 'note-applet' }, toolbar, scroll);
  container.replaceChildren(root);

  // Live editing shows the note as Reading mode does when it can't be edited.
  const shown = () => {
    const m = bare ? 'live' : mode;
    return m === 'live' && readOnly ? 'reading' : m;
  };
  // A bare note ends where its text ends; a click in the space below it goes to the end of the note.
  const clickBelow = e => {
    if (!bare || editorMode !== 'live' || e.button !== 0 || e.target.closest?.('.cm-editor')) return;
    e.preventDefault();
    const view = editor.view;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  };
  container.ownerDocument.addEventListener('mousedown', clickBelow);
  const renderTable = source => toDom(renderTree(libs, source, { macros }), info);
  const liveConfig = () => ({ katex, macros, resolveURL, onLink, renderTable });
  const edited = text => { content = text; onChange(text); };

  function render() {
    for (const b of modeButtons) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    const want = shown();
    if (want !== editorMode) { editor?.destroy(); editor = null; editorMode = null; }
    scroll.classList.toggle('source', want === 'source');
    scroll.classList.toggle('live', want === 'live');
    if (want === 'source') {
      if (!editor) { scroll.replaceChildren(); editor = sourceEditor(scroll, { doc: content, onChange: edited }); editorMode = want; }
      return;
    }
    if (want === 'live') {
      if (!editor) { scroll.replaceChildren(); editor = createLiveEditor(scroll, { doc: content, config: liveConfig(), docKey, onChange: edited, onCaret }); editorMode = want; }
      return;
    }
    // Reading. Folds may have changed in Live editing.
    folds = readFolds(docKey);
    let tree;
    try { tree = renderTree(libs, content, { macros, folds: docKey ? folds : null, resolveURL }); }
    catch (e) {
      prose.replaceChildren(h('p', { class: 'render-error' }, `This note could not be rendered: ${e.message}`));
      scroll.replaceChildren(prose);
      return;
    }
    const frag = toDom(tree, info);
    for (const a of frag.querySelectorAll('a[href]')) {
      a.rel = 'noopener noreferrer';
      if (a.getAttribute('href').startsWith('http')) a.target = '_blank';
    }
    prose.replaceChildren(frag);
    scroll.replaceChildren(prose);
  }

  // ------------------------------------------------------- Reading mode --
  function toggle(key) {
    folds = toggleFold(folds, key);
    writeFolds(docKey, folds);
    render();
  }
  // An #anchor inside a folded section: unfold its sections, then scroll to it.
  function reveal(id) {
    const anchor = [...prose.querySelectorAll('[id]')].find(e => e.id === id);
    if (!anchor) return false;
    const path = JSON.parse(anchor.closest('[data-fold-path]')?.dataset.foldPath || '[]');
    folds = folds.filter(k => !path.includes(k));
    writeFolds(docKey, folds);
    render();
    requestAnimationFrame(() => [...prose.querySelectorAll('[id]')].find(e => e.id === id)?.scrollIntoView({ block: 'nearest' }));
    return true;
  }
  prose.addEventListener('click', e => {
    const fold = e.target.closest('[data-fold-toggle]');
    if (fold) { toggle(fold.dataset.foldToggle); return; }
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#note-')) { e.preventDefault(); onLink(decodeURIComponent(href.slice(6))); }
    else if (href.startsWith('#')) { if (reveal(decodeURIComponent(href.slice(1)))) e.preventDefault(); }
    // A relative link to another note opens it here.
    else if (/\.(md|markdown)$/i.test(href) && !/^[a-z][\w+.-]*:/i.test(href)) { e.preventDefault(); onLink(decodeURIComponent(href).replace(/\.(md|markdown)$/i, '')); }
  });

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    try { localStorage.setItem('alphaMarkdown:mode', mode); } catch { /* private window */ }
    render();
  }
  function apply(context) {
    if ('macros' in context) macros = context.macros || {};
    if ('resolveURL' in context) resolveURL = context.resolveURL;
    if ('readOnly' in context) readOnly = !!context.readOnly;
    if ('bare' in context) { bare = !!context.bare; root.classList.toggle('bare', bare); toolbar.hidden = bare; }
    if ('docKey' in context && context.docKey !== docKey) {
      docKey = context.docKey || '';
      // Folds are per note: a live editor for another note starts afresh.
      if (editorMode === 'live') { editor.destroy(); editor = null; editorMode = null; }
    }
  }
  // Same text, new context (macros, picture paths, read-only).
  function refresh() {
    if (!loaded) return;
    if (shown() !== editorMode) render();
    else if (editorMode === 'live') editor.setConfig(liveConfig());
  }
  return {
    load(text, context = {}) {
      apply(context);
      if (loaded && text === content) { refresh(); return; }
      loaded = true;
      content = text;
      if (editor && shown() === editorMode) { editor.set(text); if (editorMode === 'live') editor.setConfig(liveConfig()); }
      else render();
    },
    setContext(context) { apply(context); refresh(); },
    destroy() { container.ownerDocument.removeEventListener('mousedown', clickBelow); editor?.destroy(); container.replaceChildren(); },
  };
}
