// alphaMarkdown's Live editing, in the spirit of Obsidian's Live Preview: one
// editor for the whole note, drawn the way it reads. Markdown syntax is
// hidden, and math, links, pictures, tables, checkboxes and theorem labels are
// drawn in place, except for the one element the cursor is in, which shows its
// source so it can be edited. A heading or quote shows its marks only on its
// own line. Nothing shows source while the editor doesn't have focus.
//
// What is hidden or drawn is worked out from the editor state alone
// (decorationsFor), so tests can check it without a browser.
import {
  EditorState, EditorView, StateField, StateEffect, Facet, Compartment, Decoration, WidgetType, keymap, drawSelection, placeholder,
  history, defaultKeymap, historyKeymap, indentWithTab, searchKeymap, highlightSelectionMatches,
  syntaxTree, ensureSyntaxTree, foldEffect, unfoldEffect, foldedRanges, codeFolding,
  markdown, markdownLanguage, markdownKeymap,
} from '../vendor/codemirror.js';
import { mathPattern, formula, environmentStart, environmentLabel, katexOptions } from './syntax.js';
import { headingKey, readFolds, writeFolds } from './folding.js';
import { safeUrl } from './render.js';

// What the note needs from its page: {katex, macros, resolveURL(url),
// onLink(name), renderTable(source) → Node}.
export const liveConfig = Facet.define({ combine: values => values[0] || {} });

// Whether the editor has focus (source is only ever shown while it does).
export const setFocus = StateEffect.define();
const focusField = StateField.define({
  create: () => false,
  update(value, tr) { for (const e of tr.effects) if (e.is(setFocus)) value = e.value; return value; },
});

// --------------------------------------------------------------- widgets --
class TextWidget extends WidgetType {
  constructor(text, cls) { super(); this.text = text; this.cls = cls; }
  eq(o) { return o.text === this.text && o.cls === this.cls; }
  toDOM() { const s = document.createElement('span'); s.className = this.cls; s.textContent = this.text; return s; }
  ignoreEvent() { return false; }
}
class MathWidget extends WidgetType {
  constructor(tex, display, block, cfg) { super(); Object.assign(this, { tex, display, block, cfg }); }
  eq(o) { return o.tex === this.tex && o.display === this.display && o.block === this.block && o.cfg.macros === this.cfg.macros; }
  toDOM() {
    const el = document.createElement(this.block ? 'div' : 'span');
    el.className = this.display ? 'cm-math cm-math-display' : 'cm-math';
    try { this.cfg.katex.render(this.tex, el, { ...katexOptions(this.cfg.macros), displayMode: this.display }); }
    catch { el.textContent = this.tex; }
    return el;
  }
  // Clicks reach the editor, which puts the cursor here and so shows the source.
  ignoreEvent() { return false; }
}
class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt; }
  eq(o) { return o.src === this.src && o.alt === this.alt; }
  toDOM() { const img = document.createElement('img'); img.className = 'cm-image'; img.src = this.src; img.alt = this.alt; return img; }
  ignoreEvent() { return false; }
}
class TaskWidget extends WidgetType {
  constructor(checked, pos) { super(); this.checked = checked; this.pos = pos; }
  eq(o) { return o.checked === this.checked && o.pos === this.pos; }
  toDOM(view) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-task';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done' : 'To do');
    box.addEventListener('mousedown', e => e.preventDefault());
    box.addEventListener('click', e => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return box;
  }
  ignoreEvent() { return true; }
}
class TableWidget extends WidgetType {
  constructor(source, cfg) { super(); this.source = source; this.cfg = cfg; }
  eq(o) { return o.source === this.source && o.cfg.macros === this.cfg.macros; }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table';
    try { wrap.append(this.cfg.renderTable(this.source)); } catch { wrap.textContent = this.source; }
    return wrap;
  }
  ignoreEvent() { return false; }
}
class FoldWidget extends WidgetType {
  constructor(range, folded, label) { super(); Object.assign(this, { range, folded, label }); }
  eq(o) { return o.range.from === this.range.from && o.range.to === this.range.to && o.folded === this.folded && o.label === this.label; }
  toDOM(view) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-fold-toggle';
    b.setAttribute('aria-expanded', String(!this.folded));
    b.setAttribute('aria-label', `${this.folded ? 'Expand' : 'Collapse'} section: ${this.label}`);
    b.title = `${this.folded ? 'Expand' : 'Collapse'} section`;
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    b.addEventListener('mousedown', e => {
      e.preventDefault();
      view.dispatch({ effects: (this.folded ? unfoldEffect : foldEffect).of({ from: this.range.from, to: this.range.to }) });
    });
    return b;
  }
  ignoreEvent() { return true; }
}

// --------------------------------------------------------------- headings --
// A heading's text as it reads, for its fold key (shared with Reading mode).
const plainHeading = src => src.replace(/^#{1,6}[ \t]*/, '').replace(/[ \t]+#+[ \t]*$/, '')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '').trim();
export function headings(state) {
  const out = [], seen = new Map();
  syntaxTree(state).iterate({
    enter: n => {
      const m = /^ATXHeading([1-6])$/.exec(n.name);
      if (!m) return;
      const line = state.doc.lineAt(n.from), level = Number(m[1]), label = plainHeading(state.doc.sliceString(n.from, n.to));
      const identity = `${level}:${label}`, occurrence = seen.get(identity) || 0;
      seen.set(identity, occurrence + 1);
      out.push({ level, from: line.from, to: line.to, label, key: `${headingKey(identity)}-${occurrence}` });
      return false;
    },
  });
  return out;
}
// A heading's section: to the next heading at its level or above, without trailing blank lines.
export function sectionRange(state, list, i) {
  const h = list[i], next = list.slice(i + 1).find(x => x.level <= h.level);
  let end = next ? next.from - 1 : state.doc.length;
  while (end > h.to) {
    const l = state.doc.lineAt(end);
    if (l.text.trim()) break;
    end = l.from - 1;
  }
  return end > h.to ? { from: h.to, to: end } : null;
}

// ------------------------------------------------------------ decorations --
const within = (list, from, to) => list.some(([a, b]) => from < b && to > a);

export function decorationsFor(state) {
  const cfg = state.facet(liveConfig), doc = state.doc, text = doc.toString();
  const focused = state.field(focusField, false) ?? false, sel = state.selection.ranges;
  // The cursor (or selection) touches [from, to]; or is on one of its lines.
  const touches = (from, to) => focused && sel.some(r => r.from <= to && r.to >= from);
  const onLines = (from, to) => { const a = doc.lineAt(from).from, b = doc.lineAt(to).to; return touches(a, b); };
  const decos = [], claimed = [];
  const replace = (from, to, spec = {}) => {
    if (from >= to || within(claimed, from, to)) return false;
    claimed.push([from, to]);
    decos.push(Decoration.replace(spec).range(from, to));
    return true;
  };
  const mark = (from, to, cls, attributes) => { if (from < to) decos.push(Decoration.mark(attributes ? { class: cls, attributes } : { class: cls }).range(from, to)); };
  const lineClass = (pos, cls) => decos.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from));
  const tree = syntaxTree(state);

  // Code: nothing inside it is math, a wiki link or a theorem label.
  const code = [], tableNodes = [];
  tree.iterate({ enter: n => {
    if (n.name === 'InlineCode' || n.name === 'FencedCode' || n.name === 'CodeBlock') { code.push([n.from, n.to]); return false; }
    if (n.name === 'Table') { tableNodes.push([n.from, n.to]); return false; }
  } });
  // Tables are drawn whole (their formulas too), unless the cursor is in one.
  const tables = [];
  for (const [from, to] of tableNodes) {
    const a = doc.lineAt(from), b = doc.lineAt(to);
    if (!touches(a.from, b.to) && cfg.renderTable && replace(a.from, b.to, { widget: new TableWidget(doc.sliceString(a.from, b.to), cfg), block: true })) tables.push([a.from, b.to]);
    else for (let k = a.number; k <= b.number; k++) lineClass(doc.line(k).from, 'cm-table-source');
  }

  // Theorem-like blocks: [[kind:label]] (Title) starting a paragraph, to the next blank line.
  const envs = [], prefixes = [];
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (i > 1 && doc.line(i - 1).text.trim()) continue;
    const m = environmentStart.exec(l.text);
    if (!m || within(code, l.from, l.to + 1)) continue;
    let last = i;
    while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
    const kind = m[1].toLowerCase(), end = l.from + m[0].length;
    envs.push({ label: m[2], from: l.from });
    prefixes.push([l.from, end]);
    for (let k = i; k <= last; k++) lineClass(doc.line(k).from, `cm-env cm-env-${kind}${k === i ? ' cm-env-first' : ''}${k === last ? ' cm-env-last' : ''}`);
    if (touches(l.from, end)) mark(l.from, end, 'cm-source');
    else replace(l.from, end, { widget: new TextWidget(environmentLabel(kind, m[3]), 'cm-env-label') });
    i = last;
  }

  // Math: $…$, \(…\), and $$…$$ or \[…\] (a block when it fills its lines).
  const math = [];
  for (const m of text.matchAll(new RegExp(mathPattern.source, 'g'))) {
    const from = m.index, to = from + m[0].length;
    if (within(code, from, to) || within(tables, from, to)) continue;
    math.push([from, to]);
    if (touches(from, to)) { mark(from, to, 'cm-math-source'); continue; }
    const { tex, display } = formula(m[0]);
    const block = display && from === doc.lineAt(from).from && to === doc.lineAt(to).to;
    replace(from, to, block ? { widget: new MathWidget(tex, display, true, cfg), block: true } : { widget: new MathWidget(tex, display, false, cfg) });
  }

  // [[Note]], [[Note|text]], and [[label]] for a theorem-like block in this note.
  const labels = new Set(envs.map(e => e.label).filter(Boolean)), wiki = [];
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const from = m.index, to = from + m[0].length;
    if (within(code, from, to) || within(tables, from, to) || within(math, from, to) || within(prefixes, from, to)) continue;
    wiki.push([from, to]);
    if (touches(from, to)) { mark(from, to, 'cm-source'); continue; }
    const ref = m[1].split(':').pop(), shown = m[2] ? from + 2 + m[1].length + 1 : from + 2;
    replace(from, shown);
    replace(to - 2, to);
    mark(shown, to - 2, 'cm-link cm-follow', labels.has(ref) ? { 'data-env': ref } : { 'data-wiki': m[1] });
  }

  // Everything the Markdown parser finds.
  const skip = (from, to) => within(math, from, to) || within(wiki, from, to) || within(prefixes, from, to);
  const heads = headings(state), folded = foldedRanges(state);
  const isFolded = pos => { let found = false; folded.between(pos, pos, a => { if (a === pos) found = true; }); return found; };
  const kids = node => { const out = []; for (let c = node.firstChild; c; c = c.nextSibling) out.push(c); return out; };
  tree.iterate({
    enter: ref => {
      const { name, from, to } = ref, node = ref.node;
      const heading = /^ATXHeading([1-6])$/.exec(name);
      if (heading) {
        const line = doc.lineAt(from);
        lineClass(line.from, `cm-h cm-h${heading[1]}`);
        const i = heads.findIndex(h => h.from === line.from), range = i < 0 ? null : sectionRange(state, heads, i);
        if (range) decos.push(Decoration.widget({ widget: new FoldWidget(range, isFolded(range.from), heads[i].label), side: -1 }).range(line.from));
        const shown = onLines(from, to);
        for (const c of kids(node)) {
          if (c.name !== 'HeaderMark') continue;
          if (shown) { mark(c.from, c.to, 'cm-formatting'); continue; }
          if (c.from === line.from) { let end = c.to; while (text[end] === ' ' || text[end] === '\t') end++; replace(c.from, end); }
          else { let start = c.from; while (start > line.from && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--; replace(start, c.to); }
        }
        return;
      }
      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        lineClass(from, `cm-h cm-h${name.endsWith('1') ? 1 : 2}`);
        for (const c of kids(node)) if (c.name === 'HeaderMark') lineClass(c.from, 'cm-setext-mark');
        return;
      }
      if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough' || name === 'InlineCode') {
        if (skip(from, to)) return false;
        mark(from, to, { Emphasis: 'cm-em', StrongEmphasis: 'cm-strong', Strikethrough: 'cm-strike', InlineCode: 'cm-code' }[name]);
        const shown = touches(from, to);
        for (const c of kids(node)) if (/Mark$/.test(c.name)) { if (shown) mark(c.from, c.to, 'cm-formatting'); else replace(c.from, c.to); }
        return name === 'InlineCode' ? false : undefined;
      }
      if (name === 'Link') {
        if (skip(from, to)) return false;
        const parts = kids(node), url = parts.find(c => c.name === 'URL'), marks = parts.filter(c => c.name === 'LinkMark');
        if (!url || marks.length < 2) return; // a reference link stays as written
        if (touches(from, to)) { mark(from, to, 'cm-source'); return; }
        replace(from, marks[0].to);
        replace(marks[1].from, to);
        mark(marks[0].to, marks[1].from, 'cm-link cm-follow', { 'data-href': doc.sliceString(url.from, url.to) });
        return;
      }
      if (name === 'Image') {
        if (skip(from, to)) return false;
        if (touches(from, to)) { mark(from, to, 'cm-source'); return false; }
        const parts = kids(node), url = parts.find(c => c.name === 'URL'), marks = parts.filter(c => c.name === 'LinkMark');
        if (!url) return false;
        const src = doc.sliceString(url.from, url.to), alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
        const resolved = cfg.resolveURL && src && !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(src) ? cfg.resolveURL(src) : safeUrl(src);
        replace(from, to, { widget: new ImageWidget(resolved, alt) });
        return false;
      }
      if (name === 'ListMark') {
        const item = node.parent, list = item?.parent;
        if (list?.name !== 'BulletList' || touches(from, to + 1)) { mark(from, to, 'cm-list-mark'); return; }
        // A task's checkbox replaces its bullet; other items get a dot.
        if (item.getChild('Task')) replace(from, text[to] === ' ' ? to + 1 : to);
        else replace(from, to, { widget: new TextWidget('•', 'cm-bullet') });
        return;
      }
      if (name === 'TaskMarker') {
        if (touches(from, to)) return;
        const checked = /x/i.test(doc.sliceString(from, to));
        replace(from, to, { widget: new TaskWidget(checked, from) });
        let start = to;
        while (text[start] === ' ' || text[start] === '\t') start++;
        if (checked) mark(start, doc.lineAt(from).to, 'cm-task-done');
        return;
      }
      if (name === 'Blockquote') {
        for (let pos = from; pos <= to;) { const l = doc.lineAt(pos); lineClass(l.from, 'cm-quote'); pos = l.to + 1; }
        return;
      }
      if (name === 'QuoteMark') {
        if (onLines(from, to)) mark(from, to, 'cm-formatting');
        else replace(from, text[to] === ' ' ? to + 1 : to);
        return;
      }
      if (name === 'HorizontalRule') {
        if (onLines(from, to)) mark(from, to, 'cm-formatting');
        else replace(from, to, { widget: new TextWidget('', 'cm-hr') });
        return false;
      }
      if (name === 'FencedCode' || name === 'CodeBlock') {
        const first = doc.lineAt(from).number, last = doc.lineAt(to).number;
        for (let k = first; k <= last; k++) lineClass(doc.line(k).from, `cm-codeblock${k === first ? ' cm-codeblock-first' : ''}${k === last ? ' cm-codeblock-last' : ''}`);
        for (const c of kids(node)) if (c.name === 'CodeMark' || c.name === 'CodeInfo') mark(c.from, c.to, 'cm-fence');
        return false;
      }
      if (name === 'Table') return false; // drawn (or shown as source) above
    },
  });
  return Decoration.set(decos, true);
}

const liveDecorations = StateField.define({
  create: decorationsFor,
  update(value, tr) {
    const changed = tr.docChanged || tr.selection || tr.effects.some(e => e.is(setFocus) || e.is(foldEffect) || e.is(unfoldEffect))
      || syntaxTree(tr.state) !== syntaxTree(tr.startState) || tr.state.facet(liveConfig) !== tr.startState.facet(liveConfig);
    return changed ? decorationsFor(tr.state) : value;
  },
  provide: f => EditorView.decorations.from(f),
});

// The parts that work on an EditorState alone (also what the tests use).
export const liveState = config => [liveConfig.of(config), focusField, liveDecorations, markdown({ base: markdownLanguage }), codeFolding()];

// --------------------------------------------------------------- editor --
// Following a link: a click on a drawn link opens it (wiki links through
// onLink); to edit a link, put the cursor beside it and use the arrow keys.
function follow(e, view) {
  if (e.button !== 0 || e.shiftKey || e.altKey) return false;
  const el = e.target instanceof Element ? e.target.closest('.cm-follow') : null;
  if (!el) return false;
  e.preventDefault();
  const cfg = view.state.facet(liveConfig);
  if (el.dataset.wiki) cfg.onLink?.(el.dataset.wiki);
  else if (el.dataset.env) {
    const at = view.state.doc.toString().search(new RegExp(`^\\[\\[[a-z][\\w-]*:${el.dataset.env.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'im'));
    if (at >= 0) view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 40 }) });
  } else if (el.dataset.href) {
    const href = safeUrl(el.dataset.href);
    if (/\.(md|markdown)$/i.test(href) && !/^[a-z][\w+.-]*:/i.test(href)) cfg.onLink?.(decodeURIComponent(href).replace(/\.(md|markdown)$/i, ''));
    else if (href && !href.startsWith('#')) window.open(href, '_blank', 'noopener');
  }
  return true;
}

// opts: {doc, config (liveConfig), docKey (fold memory), onChange(text)}
export function createLiveEditor(parent, { doc, config, docKey, onChange, onCaret }) {
  const conf = new Compartment();
  let quiet = false;
  // Folded sections are remembered per note, with the same keys as Reading mode.
  const saveFolds = state => {
    const heads = headings(state), keys = [];
    foldedRanges(state).between(0, state.doc.length, from => { const h = heads.find(x => x.to === from); if (h) keys.push(h.key); });
    writeFolds(docKey, keys);
  };
  const state = EditorState.create({
    doc,
    extensions: [
      conf.of(liveConfig.of(config)), focusField, liveDecorations, markdown({ base: markdownLanguage }),
      codeFolding({ placeholderDOM: (view, onclick) => {
        const s = document.createElement('span');
        s.className = 'cm-fold-placeholder';
        s.textContent = '…';
        s.title = 'Folded section: click to show';
        s.onclick = onclick;
        return s;
      } }),
      EditorView.focusChangeEffect.of((_, focusing) => setFocus.of(focusing)),
      history(), drawSelection(), highlightSelectionMatches(), placeholder('Start writing…'),
      keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.editorAttributes.of({ class: 'cm-live' }),
      EditorView.contentAttributes.of({ 'aria-label': 'Note', spellcheck: 'true' }),
      EditorView.domEventHandlers({ mousedown: follow }),
      EditorView.updateListener.of(u => {
        if (u.docChanged && !quiet) onChange(u.state.doc.toString());
        // Typing or keyboard movement (not a click): tell the host where the cursor is.
        if (onCaret && u.view.hasFocus && u.transactions.some(t => (t.docChanged && !quiet) || (t.selection && t.isUserEvent('select') && !t.isUserEvent('select.pointer')))) {
          u.view.requestMeasure({
            key: 'alpha-caret',
            read: v => v.coordsAtPos(v.state.selection.main.head),
            write: c => { if (c) onCaret({ top: c.top, bottom: c.bottom }); },
          });
        }
        if (docKey && u.transactions.some(t => t.effects.some(e => e.is(foldEffect) || e.is(unfoldEffect)))) saveFolds(u.state);
      }),
    ],
  });
  ensureSyntaxTree(state, state.doc.length, 300);
  const view = new EditorView({ parent, state });
  // Reopen with the sections that were folded.
  const restore = () => {
    const stored = new Set(readFolds(docKey)), heads = headings(view.state);
    const effects = heads.map((h, i) => (stored.has(h.key) ? sectionRange(view.state, heads, i) : null)).filter(Boolean).map(r => foldEffect.of(r));
    if (effects.length) view.dispatch({ effects });
  };
  if (docKey) restore();
  return {
    view,
    // Replace the text (a newer revision) without reporting it as an edit.
    set(text) {
      if (text === view.state.doc.toString()) return;
      quiet = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      quiet = false;
    },
    setConfig(next) { view.dispatch({ effects: conf.reconfigure(liveConfig.of(next)) }); },
    destroy() { view.destroy(); },
  };
}
