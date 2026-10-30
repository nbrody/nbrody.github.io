// Overleaf-style editor toolbar and symbol palette.
import {h, icon, mod} from './ui.js';
import {toggleWrap, setHeading, headingAt, insertList, insertSnippet, insertCompleting, SNIPPETS} from './editor.js';
import {undo, redo, toggleComment, openSearchPanel} from '../vendor/codemirror.js';
import {SYMBOLS, SYMBOL_GROUPS} from './symbols.js';

const HEADINGS = [['', 'Normal text'], ['part', 'Part'], ['chapter', 'Chapter'], ['section', 'Section'], ['subsection', 'Subsection'],
  ['subsubsection', 'Subsubsection'], ['paragraph', 'Paragraph'], ['subparagraph', 'Subparagraph']];

export function formattingToolbar({view, onSymbols}) {
  const tool = (name, title, run, cls = '') => h('button', {type: 'button', class: `tool ${cls}`, title, 'aria-label': title,
    onmousedown: e => e.preventDefault(), onclick: () => run(view)}, icon(name, 15));
  const heading = h('select', {class: 'tool-select', 'aria-label': 'Paragraph style', title: 'Section heading',
    onchange: e => setHeading(view, e.target.value)}, HEADINGS.map(([v, label]) => h('option', {value: v}, label)));
  const symbols = tool('omega', 'Symbol palette', () => onSymbols());
  const el = h('div', {class: 'format-bar', role: 'toolbar', 'aria-label': 'Formatting'},
    tool('undo', `Undo (${mod}Z)`, v => undo(v)), tool('redo', `Redo (${mod}⇧Z)`, v => redo(v)), h('span', {class: 'tool-sep'}),
    heading, h('span', {class: 'tool-sep'}),
    tool('bold', `Bold (${mod}B)`, v => toggleWrap(v, '\\textbf{', '}')), tool('italic', `Italic (${mod}I)`, v => toggleWrap(v, '\\textit{', '}')),
    h('span', {class: 'tool-sep'}),
    tool('sigma', 'Inline math', v => toggleWrap(v, '$', '$')), tool('displayMath', 'Display math', v => insertSnippet(v, SNIPPETS.display)),
    symbols, h('span', {class: 'tool-sep'}),
    tool('link', 'Link', v => insertSnippet(v, SNIPPETS.link)), tool('tag', 'Cross-reference (\\ref)', v => insertCompleting(v, '\\ref{}')),
    tool('quote', 'Citation (\\cite)', v => insertCompleting(v, '\\cite{}')), h('span', {class: 'tool-sep'}),
    tool('image', 'Figure', v => insertSnippet(v, SNIPPETS.figure)), tool('table', 'Table', v => insertSnippet(v, SNIPPETS.table)),
    tool('list', 'Bulleted list', v => insertList(v, 'itemize')), tool('listOrdered', 'Numbered list', v => insertList(v, 'enumerate')),
    h('span', {class: 'tool-sep'}),
    tool('percent', `Toggle comment (${mod}/)`, v => { toggleComment(v); v.focus(); }), tool('search', `Find and replace (${mod}F)`, v => openSearchPanel(v)));
  return {
    el,
    update(readOnly, symbolsOpen) {
      heading.value = headingAt(view.state);
      for (const b of el.querySelectorAll('button, select')) b.disabled = readOnly;
      symbols.classList.toggle('on', !!symbolsOpen);
    },
  };
}

export function symbolPalette({view, onClose}) {
  let group = SYMBOL_GROUPS[0], query = '';
  const grid = h('div', {class: 'symbol-grid', role: 'listbox', 'aria-label': 'Symbols'});
  const tabs = h('div', {class: 'symbol-tabs', role: 'tablist'});
  const search = h('input', {class: 'symbol-search', type: 'search', placeholder: 'Search symbols', 'aria-label': 'Search symbols',
    oninput: e => { query = e.target.value.trim().toLowerCase(); render(); }});
  const insert = s => {
    const {from, to} = view.state.selection.main;
    const braces = s.command.indexOf('{}');
    let text = s.command;
    const next = view.state.sliceDoc(to, to + 1);
    if (braces < 0 && /[a-zA-Z]/.test(next)) text += ' ';
    view.dispatch({changes: {from, to, insert: text}, selection: {anchor: from + (braces < 0 ? text.length : braces + 1)}, userEvent: 'input'});
    view.focus();
  };
  function render() {
    tabs.replaceChildren(...SYMBOL_GROUPS.map(g => h('button', {type: 'button', role: 'tab', 'aria-selected': String(!query && g === group),
      onclick: () => { group = g; query = ''; search.value = ''; render(); }}, g)));
    const list = query ? SYMBOLS.filter(s => `${s.command} ${s.words} ${s.group}`.toLowerCase().includes(query)) : SYMBOLS.filter(s => s.group === group);
    grid.replaceChildren(...(list.length ? list.map(s => h('button', {type: 'button', class: 'symbol', title: `${s.command}${s.words ? ` — ${s.words}` : ''}`,
      'aria-label': s.command, onmousedown: e => e.preventDefault(), onclick: () => insert(s)}, s.glyph)) : [h('p', {class: 'symbol-none'}, 'No symbols match.')]));
  }
  render();
  const el = h('div', {class: 'symbol-palette', role: 'region', 'aria-label': 'Symbol palette'},
    h('div', {class: 'symbol-head'}, tabs, search, h('button', {type: 'button', class: 'btn ghost icon-only sm', 'aria-label': 'Close symbol palette', onclick: onClose}, icon('x', 14))),
    grid);
  return {el, focus: () => search.focus()};
}
