// A paper converted to Markdown (server/paper-markdown.mjs), in the reader:
// read-only, rendered by alphaMarkdown's renderer (KaTeX with the project's
// macros) one PDF page at a time, with the reader's highlights on top.
//
// The text is never edited. A highlight is kept in the reference record
// (`highlights`: {id, quote, prefix, suffix, at, page, color, note?, created,
// updated?}) and found again by its quote (references.js). A highlight with a
// note is an annotation: a numbered dot after it opens a popup with the note.
import {renderTree} from '../../markdown/js/render.js';
import {toDom} from '../../markdown/js/hast.js';
import {libs, info as hast} from '../../markdown/js/libs.js';
import {h, icon, button, store, debounce} from './ui.js';
import {markdownPages, quoteAnchor, findAnchor, HIGHLIGHT_COLORS, cleanQuote} from './references.js';
import {mathHTML, mathMacros} from './math.js';

const BLOCK = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'TABLE', 'UL', 'OL', 'FIGURE', 'SECTION', 'DIV']);
const COLOR_NAMES = {yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink'};

// The paper's reading text, and where each piece of it is in the page: text
// nodes, and each formula as one piece written $…$ (or $$…$$). Highlight
// marks are see-through and dots and page labels ([data-skip]) are left out,
// so the text is the same with or without highlights on it.
export function readingText(root) {
  const segs = [];
  let text = '';
  const visit = node => {
    if (node.nodeType === 3) {
      const v = node.nodeValue;
      if (v) { segs.push({node, math: false, start: text.length, end: text.length + v.length}); text += v; }
      return;
    }
    if (node.nodeType !== 1 || node.hasAttribute('data-skip')) return;
    if (node.classList.contains('katex')) {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '';
      const s = node.closest('.katex-display') ? `$$${tex}$$` : `$${tex}$`;
      segs.push({node, math: true, start: text.length, end: text.length + s.length});
      text += s;
      return;
    }
    const block = BLOCK.has(node.tagName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    for (const child of node.childNodes) visit(child);
    if (block && text && !text.endsWith('\n')) text += '\n';
  };
  visit(root);
  return {text, segs};
}

// The reading-text offset of a point in the page; a point inside a formula
// moves to the formula's start (or its end, for the end of a selection).
function offsetOf(index, node, offset, isEnd) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  const atom = el?.closest('.katex');
  if (atom) { const s = index.segs.find(x => x.node === atom); if (s) return isEnd ? s.end : s.start; }
  if (node.nodeType === 3) { const s = index.segs.find(x => x.node === node); if (s) return s.start + Math.min(offset, s.end - s.start); }
  const point = document.createRange();
  point.setStart(node, offset);
  for (const s of index.segs) if (point.comparePoint(s.node, 0) >= 0) return s.start;
  return index.text.length;
}

// Wraps reading text [start, end) in <mark>s, one per text node or formula.
function wrap(root, start, end) {
  const marks = [];
  for (const seg of readingText(root).segs) {
    if (seg.end <= start || seg.start >= end) continue;
    let node = seg.node;
    if (!seg.math) {
      const a = Math.max(start, seg.start) - seg.start, b = Math.min(end, seg.end) - seg.start;
      if (!node.nodeValue.slice(a, b).trim()) continue; // whitespace between blocks
      if (b < node.nodeValue.length) node.splitText(b);
      if (a > 0) node = node.splitText(a);
    }
    const mark = document.createElement('mark');
    node.parentNode.insertBefore(mark, node);
    mark.append(node);
    marks.push(mark);
  }
  return marks;
}

const newId = () => `hl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const when = iso => { try { return new Date(iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}); } catch { return ''; } };
const noteHTML = note => String(note).trim().split(/\n{2,}/).map(p => `<p>${mathHTML(p).replace(/\n/g, '<br>')}</p>`).join('');
const excerpt = (quote, max = 220) => { const q = cleanQuote(quote); return q.length <= max ? q : `${q.slice(0, max).replace(/\s+\S*$/, '')}…`; };

// lib: the library. pageKey: where to remember the page. onSave(change)
// keeps a change to the highlights (change: list → list). onQuote and onAsk
// (null without a collaborator) take (text, page). fileName(): a name for
// the downloaded .md.
export function paperView(lib, {pageKey, onSave, onQuote, onAsk, fileName}) {
  let source = '', base = '', loadedFor = null, highlights = [], index = {text: '', segs: []}, popId = null, editing = null;
  let color = store.get('alphaLibrary.highlightColor', 'yellow');
  if (!HIGHLIGHT_COLORS.includes(color)) color = 'yellow';

  // --------------------------------------------------------- toolbar
  const pageLabel = h('span', {class: 'md-page-count'});
  const countLabel = h('span', {class: 'md-count'});
  const prev = button({title: 'Previous annotation', iconName: 'up', cls: 'ghost icon-only sm', onClick: () => step(-1)});
  const next = button({title: 'Next annotation', iconName: 'down', cls: 'ghost icon-only sm', onClick: () => step(1)});
  const toolbar = h('div', {class: 'pdf-toolbar md-toolbar'},
    h('span', {class: 'md-readonly', title: 'Converted from the PDF by OCR. It is read-only: select text to highlight or annotate it. Check a formula against the PDF before relying on it.'},
      icon('lock', 13), 'Read-only'),
    pageLabel,
    h('span', {class: 'spacer'}),
    countLabel, prev, next,
    button({title: 'Download the Markdown', iconName: 'download', cls: 'ghost icon-only sm', onClick: () => download()}));

  // ------------------------------------------------------- the page
  const article = h('article', {class: 'md-paper'});
  const pick = h('div', {class: 'reader-pick', hidden: true});
  const pop = h('div', {class: 'hl-pop', role: 'dialog', hidden: true});
  const sheet = h('div', {class: 'md-sheet'}, article, pick, pop);
  const scroller = h('div', {class: 'md-scroller', tabindex: '-1'}, sheet);
  const message = h('div', {class: 'pdf-message', hidden: true});
  const el = h('div', {class: 'md-view', hidden: true}, toolbar, h('div', {class: 'pdf-wrap md-wrap'}, scroller, message));

  const show = (text, loading = false) => {
    message.hidden = !text;
    message.replaceChildren(loading ? h('span', {class: 'loading'}, icon('loader', 18, 'spin'), text) : h('p', {}, text));
  };

  // Each PDF page as a section, under a "Page n" rule.
  function render() {
    const macros = mathMacros(), resolveURL = url => base + url;
    article.replaceChildren(...markdownPages(source).map((page, i) => {
      const section = h('section', {class: 'md-page', 'data-page': String(i + 1)},
        h('div', {class: 'md-page-label', 'data-skip': ''}, `Page ${i + 1}`));
      try {
        section.append(toDom(renderTree(libs, page.replace(/<br\s*\/?>/gi, ' '), {macros, resolveURL}), hast));
      } catch {
        section.append(h('pre', {class: 'md-raw'}, page)); // a page the renderer can't read shows as text
      }
      return section;
    }));
    for (const img of article.querySelectorAll('img')) img.loading = 'lazy';
  }

  // ------------------------------------------------- the highlights
  let placed = [], orphans = [];
  function apply() {
    for (const m of article.querySelectorAll('mark[data-hl]')) m.replaceWith(...m.childNodes);
    for (const d of article.querySelectorAll('.hl-dot')) d.remove();
    article.normalize();
    index = readingText(article);
    const found = [];
    orphans = [];
    for (const hl of highlights) {
      const at = findAnchor(index.text, hl);
      if (at) found.push({hl, start: at[0], end: at[1]});
      else orphans.push(hl);
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    let n = 0;
    placed = found.map(({hl, start, end}) => {
      const marks = wrap(article, start, end);
      const tone = HIGHLIGHT_COLORS.includes(hl.color) ? hl.color : 'yellow';
      for (const m of marks) {
        m.className = `hl hl-${tone}${hl.note ? ' has-note' : ''}`;
        m.dataset.hl = hl.id;
      }
      let dot = null;
      if (hl.note && marks.length) {
        n++;
        dot = h('button', {type: 'button', class: `hl-dot hl-${tone}`, 'data-skip': '', 'data-hl': hl.id,
          'aria-label': `Annotation ${n}`, title: excerpt(hl.note, 120)}, String(n));
        marks[marks.length - 1].after(dot);
      }
      return {hl, marks, dot, n: dot ? n : 0};
    });
    const notes = placed.filter(p => p.dot).length;
    countLabel.textContent = [
      placed.length ? `${placed.length} highlight${placed.length === 1 ? '' : 's'}` : 'Select text to highlight it',
      notes ? `${notes} note${notes === 1 ? '' : 's'}` : '',
      orphans.length ? `${orphans.length} not found` : '',
    ].filter(Boolean).join(' · ');
    countLabel.title = orphans.length ? `Not found in the text:\n${orphans.map(o => `“${excerpt(o.quote, 80)}”`).join('\n')}` : '';
    prev.disabled = next.disabled = !notes;
    for (const m of article.querySelectorAll('mark.active')) m.classList.remove('active');
    if (popId) {
      if (placed.some(p => p.hl.id === popId)) drawPopup();
      else closePopup();
    }
  }
  // A change to the highlights: shown now, kept by the reader.
  function change(fn) {
    highlights = fn(highlights);
    apply();
    onSave(fn);
  }
  function create(sel) {
    const hl = {id: newId(), ...quoteAnchor(index.text, sel.start, sel.end), page: sel.page, color, created: new Date().toISOString()};
    change(list => [...list, hl]);
    return hl;
  }

  // ------------------------------------------- selecting some text
  let picked = null;
  pick.addEventListener('pointerdown', e => e.preventDefault()); // keep the selection
  function measure() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { pick.hidden = true; picked = null; return; }
    const range = sel.getRangeAt(0), node = range.commonAncestorContainer;
    const host = node.nodeType === 1 ? node : node.parentElement;
    if (!article.contains(host)) { pick.hidden = true; picked = null; return; }
    let start = offsetOf(index, range.startContainer, range.startOffset, false), end = offsetOf(index, range.endContainer, range.endOffset, true);
    while (start < end && /\s/.test(index.text[start])) start++;
    while (end > start && /\s/.test(index.text[end - 1])) end--;
    if (end <= start) { pick.hidden = true; picked = null; return; }
    const anchor = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const page = Number(anchor?.closest('.md-page')?.dataset.page) || 0;
    picked = {start, end, page, text: index.text.slice(start, end)};
    const rect = range.getBoundingClientRect(), frame = sheet.getBoundingClientRect();
    const below = rect.top - scroller.getBoundingClientRect().top < 56;
    pick.hidden = false;
    pick.classList.toggle('below', below);
    pick.style.left = `${Math.min(Math.max(rect.left + rect.width / 2 - frame.left, 170), frame.width - 170)}px`;
    pick.style.top = `${(below ? rect.bottom : rect.top) - frame.top}px`;
  }
  const clearSelection = () => { getSelection()?.removeAllRanges(); pick.hidden = true; picked = null; };
  pick.append(
    h('button', {type: 'button', title: 'Highlight this text', onclick: () => { if (picked) { create(picked); clearSelection(); } }}, icon('highlighter', 13), 'Highlight'),
    h('button', {type: 'button', title: 'Highlight this text and write a note about it', onclick: () => {
      if (!picked) return;
      const hl = create(picked);
      clearSelection();
      openPopup(hl.id, {edit: true, fresh: true});
    }}, icon('notePlus', 13), 'Annotate'),
    h('button', {type: 'button', onclick: () => { if (picked) { onQuote(cleanQuote(picked.text), picked.page); clearSelection(); } }}, icon('quote', 13), 'Quote in notes'),
    onAsk ? h('button', {type: 'button', onclick: () => { if (picked) { onAsk(cleanQuote(picked.text), picked.page); clearSelection(); } }}, icon('sparkles', 13), 'Ask collaborator') : null);
  const settle = () => requestAnimationFrame(measure);
  sheet.addEventListener('pointerup', settle);
  sheet.addEventListener('keyup', settle);
  const collapse = () => { if (getSelection()?.isCollapsed) { pick.hidden = true; picked = null; } };
  document.addEventListener('selectionchange', collapse);

  // Clicking a highlight or a dot opens its popup.
  article.addEventListener('click', e => {
    const target = e.target.closest?.('mark[data-hl], .hl-dot');
    if (!target || !getSelection()?.isCollapsed) return;
    e.preventDefault();
    openPopup(target.dataset.hl);
  });

  // ------------------------------------------------------- the popup
  function openPopup(id, {edit = false, fresh = false} = {}) {
    popId = id;
    editing = edit ? {fresh} : null;
    drawPopup();
  }
  function closePopup({keep = false} = {}) {
    const id = popId, fresh = editing?.fresh;
    popId = null; editing = null;
    pop.hidden = true;
    for (const m of article.querySelectorAll('mark.active')) m.classList.remove('active');
    // Annotate, then nothing written: no highlight either.
    const hl = highlights.find(x => x.id === id);
    if (!keep && fresh && hl && !hl.note) change(list => list.filter(x => x.id !== id));
  }
  function drawPopup() {
    const spot = placed.find(p => p.hl.id === popId);
    if (!spot) { closePopup({keep: true}); return; }
    const {hl} = spot, tone = HIGHLIGHT_COLORS.includes(hl.color) ? hl.color : 'yellow';
    for (const m of article.querySelectorAll('mark.active')) m.classList.remove('active');
    for (const m of spot.marks) m.classList.add('active');
    const swatches = h('div', {class: 'hl-swatches', role: 'group', 'aria-label': 'Highlight color'},
      HIGHLIGHT_COLORS.map(c => h('button', {type: 'button', class: `hl-swatch hl-${c}`, title: COLOR_NAMES[c], 'aria-label': COLOR_NAMES[c], 'aria-pressed': String(c === tone),
        onclick: () => {
          color = c;
          store.set('alphaLibrary.highlightColor', c);
          if (c !== tone) change(list => list.map(x => (x.id === hl.id ? {...x, color: c} : x)));
        }})));
    const quote = h('blockquote', {class: 'hl-quote'});
    quote.innerHTML = mathHTML(excerpt(hl.quote));
    const head = h('div', {class: 'hl-pop-head'}, swatches, h('span', {class: 'spacer'}),
      spot.n ? h('span', {class: `hl-num hl-${tone}`}, String(spot.n)) : null,
      hl.page ? h('span', {class: 'hl-page'}, `p. ${hl.page}`) : null,
      button({title: 'Close', iconName: 'x', cls: 'ghost icon-only sm', onClick: () => closePopup()}));
    let body, foot;
    if (editing) {
      const input = h('textarea', {class: 'hl-input', placeholder: 'Your note on this passage. Write math as $…$.', 'aria-label': 'Annotation', rows: '4'});
      input.value = hl.note || '';
      const saveNote = () => {
        const note = input.value.trim();
        editing = null;
        change(list => list.map(x => (x.id === hl.id ? {...x, note: note || undefined, updated: new Date().toISOString()} : x)));
        if (!note) closePopup({keep: true});
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      });
      const cancel = () => { if (editing?.fresh || !hl.note) closePopup(); else { editing = null; drawPopup(); } };
      body = input;
      foot = h('div', {class: 'hl-pop-foot'}, h('span', {class: 'hl-hint'}, '⌘↩ to save'), h('span', {class: 'spacer'}),
        button({label: 'Cancel', cls: 'ghost sm', onClick: cancel}),
        button({label: 'Save', cls: 'primary sm', onClick: saveNote}));
      requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
    } else {
      body = hl.note ? h('div', {class: 'hl-note'}) : null;
      if (body) body.innerHTML = noteHTML(hl.note);
      foot = h('div', {class: 'hl-pop-foot'},
        h('span', {class: 'hl-when', title: hl.updated ? `Edited ${when(hl.updated)}` : ''}, when(hl.created)),
        h('span', {class: 'spacer'}),
        onAsk ? button({label: 'Discuss', iconName: 'sparkles', cls: 'ghost sm', title: 'Ask the collaborator about this passage',
          onClick: () => onAsk(cleanQuote(hl.quote) + (hl.note ? `\n\nMy note: ${hl.note}` : ''), hl.page)}) : null,
        button({label: hl.note ? 'Edit' : 'Add note', iconName: hl.note ? 'pencil' : 'notePlus', cls: 'ghost sm', onClick: () => { editing = {fresh: false}; drawPopup(); }}),
        button({title: hl.note ? 'Delete this annotation and its highlight' : 'Remove this highlight', iconName: 'trash', cls: 'ghost icon-only sm danger-text',
          onClick: () => { const id = hl.id; closePopup({keep: true}); change(list => list.filter(x => x.id !== id)); }}));
    }
    pop.className = `hl-pop hl-${tone}`;
    pop.replaceChildren(head, quote, body || '', foot);
    pop.hidden = false;
    place(spot);
  }
  // Under the dot (or the highlight's end); above it when there is no room below.
  function place(spot) {
    const target = spot.dot || spot.marks[spot.marks.length - 1];
    const r = target.getBoundingClientRect(), frame = sheet.getBoundingClientRect(), view = scroller.getBoundingClientRect();
    const width = pop.offsetWidth, height = pop.offsetHeight;
    const centre = r.left + r.width / 2 - frame.left;
    const left = Math.min(Math.max(centre - width / 2, 12), frame.width - width - 12);
    const above = r.bottom + height + 16 > view.bottom && r.top - height - 16 > view.top;
    pop.classList.toggle('above', above);
    pop.style.left = `${left}px`;
    pop.style.top = `${above ? r.top - frame.top - height - 10 : r.bottom - frame.top + 10}px`;
    pop.style.setProperty('--caret', `${Math.min(Math.max(centre - left, 18), width - 18)}px`);
  }
  // Click elsewhere or Escape: close.
  const outside = e => {
    if (pop.hidden || pop.contains(e.target) || e.target.closest?.('mark[data-hl], .hl-dot')) return;
    if (editing) return; // a note being written stays until saved or cancelled
    closePopup();
  };
  document.addEventListener('pointerdown', outside, true);
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden && !editing) closePopup(); });

  // Previous / next annotation.
  function step(dir) {
    const notes = placed.filter(p => p.dot);
    if (!notes.length) return;
    const i = notes.findIndex(p => p.hl.id === popId);
    const target = notes[i < 0 ? (dir > 0 ? 0 : notes.length - 1) : (i + dir + notes.length) % notes.length];
    target.dot.scrollIntoView({block: 'center', behavior: 'smooth'});
    setTimeout(() => openPopup(target.hl.id), 250);
  }

  // ---------------------------------------------- page and download
  const pages = () => [...article.querySelectorAll('.md-page')];
  const savePage = debounce(page => store.set(pageKey, page), 400);
  const track = () => {
    const top = scroller.getBoundingClientRect().top + 60, all = pages();
    const current = all.find(s => s.getBoundingClientRect().bottom > top) || all[all.length - 1];
    const page = Number(current?.dataset.page) || 1;
    pageLabel.textContent = all.length ? `Page ${page} of ${all.length}` : '';
    savePage(page);
  };
  let ticking = false;
  scroller.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; track(); }); } });
  function download() {
    const a = h('a', {download: `${fileName()}.md`, href: URL.createObjectURL(new Blob([source], {type: 'text/markdown'}))});
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return {
    el,
    // Shows reference `ref`'s converted paper (fetched once per PDF).
    async open(ref, record) {
      const key = `${ref.id}#${record.pdf}`;
      if (loadedFor === key) return;
      loadedFor = key;
      show('Loading the Markdown…', true);
      try {
        const paper = await lib.backend.markdown(ref.id);
        if (loadedFor !== key) return;
        source = paper.text;
        base = paper.base || '';
        highlights = Array.isArray(record.highlights) ? record.highlights : [];
        render();
        apply();
        show('');
        const page = Number(store.get(pageKey, 1)) || 1, section = pages()[page - 1];
        scroller.scrollTop = page > 1 && section ? section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12 : 0;
        track();
      } catch (e) {
        loadedFor = null;
        show(e.message || 'The Markdown could not be loaded.');
      }
    },
    // The highlights as saved (the reader, after a save or a change elsewhere).
    setHighlights(list) {
      const next = Array.isArray(list) ? list : [];
      if (JSON.stringify(next) === JSON.stringify(highlights) || !loadedFor) { highlights = next; return; }
      highlights = next;
      if (editing) return; // keep the note being written; it applies on save
      apply();
    },
    forget() { loadedFor = null; },
    close() {
      document.removeEventListener('selectionchange', collapse);
      document.removeEventListener('pointerdown', outside, true);
    },
  };
}
