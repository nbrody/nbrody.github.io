// The paper reader: a reference's PDF beside its reading notes. The PDF view
// is alphaTeX's (latex/js/pdf.js: pdf.js with text selection, links, search
// and zoom); the reader adds Back after a link inside the paper, the page
// you left each paper on, and quoting a selection into the notes or the chat.
import {PdfView} from '../../latex/js/pdf.js';
import {h, icon, button, toast, store, debounce} from './ui.js';
import {cleanQuote, quoteForNotes, shortTitle, roleOf} from './references.js';
import {mathHTML} from './math.js';
import {recordOf, attachPdf, editReference} from './dialogs.js';

export function openReader(lib, container, ref) {
  let current = ref, record = recordOf(ref);
  const pageKey = `alphaLibrary.page.${lib.info.key}.${ref.id}`;
  const hasFile = () => !!record.pdf && lib.pdfs.some(p => p.path === record.pdf);

  // ---------------------------------------------------------------- header
  const title = h('strong', {class: 'reader-title-text'}), byline = h('small', {});
  const showHeader = () => {
    title.innerHTML = mathHTML(record.title || current.title);
    title.title = record.title || current.title;
    byline.replaceChildren([record.authors, record.year].filter(Boolean).join(' · ') || 'Authors not recorded',
      record.key ? h('code', {class: 'citation-key'}, record.key) : '');
  };
  let notesOpen = store.get('alphaLibrary.notes', innerWidth >= 900);
  const notesToggle = button({title: 'Reading notes', iconName: notesOpen ? 'panelClose' : 'panelOpen', cls: 'ghost icon-only', pressed: notesOpen, onClick: () => toggleNotes()});
  const head = h('header', {class: 'reader-head'},
    button({label: lib.embedded ? 'Bibliography' : 'Library', iconName: 'arrowLeft', cls: 'ghost reader-back', onClick: () => lib.closeReader()}),
    h('div', {class: 'reader-title'}, title, byline),
    h('div', {class: 'reader-actions'},
      lib.info.capabilities?.ask ? button({label: 'Discuss', iconName: 'sparkles', cls: 'ghost', title: 'Ask the collaborator about this paper', onClick: () => lib.backend.action('ask', {id: current.id})}) : null,
      button({title: 'Replace or unlink this PDF', iconName: 'fileUp', cls: 'ghost icon-only', onClick: () => attachPdf(lib, current)}),
      notesToggle));

  // ---------------------------------------------------------- PDF toolbar
  const pageInput = h('input', {class: 'page-input', 'aria-label': 'Page number', inputmode: 'numeric', value: '1'});
  const pageCount = h('span', {class: 'page-count'}, '/ …');
  const zoomLabel = h('button', {type: 'button', class: 'btn ghost sm zoom', title: 'Fit to width', onclick: () => view.fitWidth()}, '100%');
  const backBtn = button({label: 'Back', iconName: 'arrowLeft', cls: 'ghost sm pdf-back', title: 'Back to where you were before the link (⌥←)', onClick: () => goBack()});
  backBtn.hidden = true;
  const searchBtn = button({title: 'Search in this PDF (⌘F)', iconName: 'search', cls: 'ghost icon-only sm', onClick: () => (findBar.hidden ? openFind() : closeFind())});
  const download = h('a', {class: 'btn ghost icon-only sm', title: 'Download PDF', 'aria-label': 'Download PDF', download: ''}, icon('download', 15));
  const toolbar = h('div', {class: 'pdf-toolbar'},
    backBtn,
    button({title: 'Previous page', iconName: 'left', cls: 'ghost icon-only sm', onClick: () => view.goto(view.state.page - 1)}),
    h('form', {class: 'page-form', onsubmit: e => { e.preventDefault(); view.goto(Number(pageInput.value) || 1); }}, pageInput, pageCount),
    button({title: 'Next page', iconName: 'right', cls: 'ghost icon-only sm', onClick: () => view.goto(view.state.page + 1)}),
    h('span', {class: 'spacer'}),
    searchBtn,
    button({title: 'Zoom out', iconName: 'minus', cls: 'ghost icon-only sm', onClick: () => view.zoom(1 / 1.2)}),
    zoomLabel,
    button({title: 'Zoom in', iconName: 'plus', cls: 'ghost icon-only sm', onClick: () => view.zoom(1.2)}),
    download);
  pageInput.addEventListener('blur', () => view.goto(Number(pageInput.value) || 1));

  // ------------------------------------------------------------ search
  const findInput = h('input', {placeholder: 'Search this PDF', 'aria-label': 'Search text in PDF', spellcheck: 'false'});
  const findCount = h('span', {class: 'find-count', role: 'status'});
  const findBar = h('div', {class: 'find-bar', hidden: true}, icon('search', 13), findInput, findCount,
    button({title: 'Previous match', iconName: 'up', cls: 'ghost icon-only sm', onClick: () => view.find(findInput.value, {again: true, previous: true})}),
    button({title: 'Next match', iconName: 'down', cls: 'ghost icon-only sm', onClick: () => view.find(findInput.value, {again: true})}),
    button({title: 'Close search', iconName: 'x', cls: 'ghost icon-only sm', onClick: () => closeFind()}));
  const openFind = () => { findBar.hidden = false; searchBtn.setAttribute('aria-pressed', 'true'); findInput.focus(); findInput.select(); };
  const closeFind = () => { findBar.hidden = true; searchBtn.setAttribute('aria-pressed', 'false'); view.find(''); view.layer?.scroller.focus({preventScroll: true}); };
  const findNow = debounce(() => view.find(findInput.value.trim()), 250);
  findInput.addEventListener('input', findNow);
  findInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); findNow.cancel(); view.find(findInput.value.trim(), {again: view.query === findInput.value.trim(), previous: e.shiftKey}); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
  });

  // ---------------------------------------------------------- the PDF
  const pdfBody = h('div', {class: 'pdf-body'});
  const message = h('div', {class: 'pdf-message', hidden: true});
  const pdfArea = h('div', {class: 'pdf-wrap'}, pdfBody, message);
  let restored = false;
  const savePage = debounce(page => store.set(pageKey, page), 400);
  const view = new PdfView(pdfBody, {onState: s => {
    pageInput.value = String(s.page || 1);
    pageCount.textContent = `/ ${s.pages || '…'}`;
    zoomLabel.textContent = `${s.zoom || 100}%`;
    const q = findInput.value.trim();
    findCount.textContent = !q ? '' : !s.matches ? '' : s.matches.total ? `${s.matches.current} of ${s.matches.total}` : 'No matches';
    findInput.classList.toggle('not-found', !!q && s.matches?.total === 0 && !s.loading);
    message.hidden = !(s.loading || s.error);
    message.replaceChildren(s.error ? h('p', {}, s.error) : h('span', {class: 'loading'}, icon('loader', 18, 'spin'), 'Loading paper…'));
    if (!s.loading && s.pages && !restored) {
      restored = true;
      const page = Number(store.get(pageKey, 1)) || 1;
      if (page > 1) setTimeout(() => view.goto(page), 0);
    } else if (restored && s.page) savePage(s.page);
  }});

  // Back after following a link inside the paper.
  const spots = [];
  pdfBody.addEventListener('click', e => {
    const link = e.target.closest?.('.annotationLayer a');
    const scroller = view.layer?.scroller, viewer = view.viewer;
    if (!link || !scroller || !viewer || !(link.getAttribute('href') || '').startsWith('#')) return;
    spots.push({page: viewer.currentPageNumber, top: scroller.scrollTop, left: scroller.scrollLeft, scale: viewer.currentScale});
    if (spots.length > 30) spots.shift();
    backBtn.hidden = false;
  }, true);
  const goBack = () => {
    const spot = spots.pop(), scroller = view.layer?.scroller, viewer = view.viewer;
    backBtn.hidden = !spots.length;
    if (!spot || !scroller || !viewer) return;
    if (Math.abs(viewer.currentScale - spot.scale) < 1e-6) scroller.scrollTo({top: spot.top, left: spot.left});
    else view.goto(spot.page);
  };

  // A paper with no PDF (or whose file was moved or trashed).
  const missing = h('div', {class: 'reader-missing', hidden: true});
  const showPdf = () => {
    const ok = hasFile();
    missing.hidden = ok;
    pdfArea.hidden = toolbar.hidden = !ok;
    if (!ok) {
      findBar.hidden = true;
      view.close();
      missing.replaceChildren(icon('fileText', 28),
        h('p', {}, record.pdf ? ['There is no file at ', h('code', {}, record.pdf), ' any more. It may have been moved or trashed.'] : 'This reference has no PDF.'),
        button({label: 'Attach a PDF', iconName: 'fileUp', cls: 'primary', onClick: () => attachPdf(lib, current)}));
      return;
    }
    download.href = lib.backend.pdfUrl(record.pdf, true);
    download.setAttribute('download', record.pdf.split('/').pop());
    restored = false;
    spots.length = 0;
    backBtn.hidden = true;
    void view.open(lib.backend.pdfUrl(record.pdf));
  };

  // ------------------------------------------------------ reading notes
  const notes = h('textarea', {spellcheck: 'true', 'aria-label': 'Reading notes',
    placeholder: 'What this paper proves, how it fits, what to check… Select text in the PDF to quote it here.'});
  notes.value = record.annotation || '';
  const status = h('span', {class: 'save-status'}, 'Saved');
  let dirty = false, saving = false;
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = `save-status ${kind}`; };
  const save = async () => {
    saveSoon.cancel();
    if (!dirty || saving) return;
    saving = true;
    const text = notes.value;
    setStatus('Saving…');
    const put = base => lib.backend.save(base.id, {...recordOf(base), annotation: text}, base.revision);
    try {
      let next;
      try { next = await put(current); }
      catch (e) {
        // Changed elsewhere since it loaded (a linked PDF, the collaborator): keep that, apply these notes.
        if (e.code !== 'conflict' || !e.current) throw e;
        next = await put(e.current);
      }
      current = next; record = recordOf(next);
      lib.replace(next);
      if (notes.value === text) { dirty = false; setStatus('Saved'); }
      else { setStatus('Unsaved'); saveSoon(); }
    } catch (e) {
      setStatus('Not saved', 'error');
      toast(e.message, {kind: 'error'});
    } finally { saving = false; }
  };
  const saveSoon = debounce(() => void save(), 900);
  notes.addEventListener('input', () => { dirty = true; setStatus('Unsaved'); saveSoon(); });
  notes.addEventListener('blur', () => void save());
  const role = h('span', {class: 'reference-role'});
  const coverage = h('span', {class: 'coverage'});
  const showFoot = () => {
    const r = roleOf(record, lib.manuscript);
    role.className = `reference-role ${r}`; role.textContent = r;
    coverage.textContent = record.coverage || 'Unverified';
  };
  const aside = h('aside', {class: 'reader-notes', 'aria-label': 'Reading notes'},
    h('div', {class: 'reader-notes-head'}, h('span', {class: 'eyebrow'}, 'Reading notes'), status),
    notes,
    h('div', {class: 'reader-notes-foot'}, role, coverage,
      button({label: 'Edit details', iconName: 'pencil', cls: 'ghost sm', onClick: async () => { await save(); editReference(lib, current); }})));
  const toggleNotes = (open = !notesOpen) => {
    notesOpen = open;
    store.set('alphaLibrary.notes', open);
    aside.hidden = !open;
    body.classList.toggle('notes-open', open);
    notesToggle.setAttribute('aria-pressed', String(open));
    notesToggle.querySelector('.icon').replaceWith(icon(open ? 'panelClose' : 'panelOpen', 15));
  };

  // ------------------------------------- a selection: quote it, or ask
  const pick = h('div', {class: 'reader-pick', hidden: true});
  let picked = null;
  pick.addEventListener('pointerdown', e => e.preventDefault()); // keep the selection
  const measure = () => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { pick.hidden = true; picked = null; return; }
    const range = sel.getRangeAt(0), node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el?.closest('.pdf-scroller') || !pdfArea.contains(el)) { pick.hidden = true; picked = null; return; }
    const text = cleanQuote(sel.toString());
    if (!text) { pick.hidden = true; return; }
    const anchor = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    const page = Number(anchor?.closest('.page[data-page-number]')?.dataset.pageNumber) || 0;
    const rect = range.getBoundingClientRect(), frame = pdfArea.getBoundingClientRect();
    const top = rect.top - frame.top, below = top < 56;
    picked = {text, page};
    pick.hidden = false;
    pick.classList.toggle('below', below);
    pick.style.left = `${Math.min(Math.max(rect.left + rect.width / 2 - frame.left, 130), frame.width - 130)}px`;
    pick.style.top = `${below ? rect.bottom - frame.top : top}px`;
  };
  const settle = () => requestAnimationFrame(measure);
  pdfArea.addEventListener('pointerup', settle);
  pdfArea.addEventListener('keyup', settle);
  pdfArea.addEventListener('scroll', () => { if (!pick.hidden) measure(); }, true);
  const collapse = () => { if (getSelection()?.isCollapsed) { pick.hidden = true; picked = null; } };
  document.addEventListener('selectionchange', collapse);
  const clear = () => { getSelection()?.removeAllRanges(); pick.hidden = true; picked = null; };
  pick.append(
    h('button', {type: 'button', onclick: () => {
      if (!picked) return;
      notes.value = quoteForNotes(notes.value, picked.text, picked.page);
      dirty = true; setStatus('Unsaved'); saveSoon();
      clear();
      if (!notesOpen) toggleNotes(true);
      requestAnimationFrame(() => { notes.scrollTop = notes.scrollHeight; });
    }}, icon('quote', 13), 'Quote in notes'),
    lib.info.capabilities?.ask ? h('button', {type: 'button', onclick: () => {
      if (!picked) return;
      const text = `From “${shortTitle(record.title || current.title)}”${picked.page ? `, p. ${picked.page}` : ''}:\n> ${picked.text}\n\n`;
      void lib.backend.action('ask', {id: current.id, text});
      clear();
    }}, icon('sparkles', 13), 'Ask collaborator') : null);
  pdfArea.append(pick);

  // ----------------------------------------------------------- layout
  const body = h('div', {class: 'reader-body'}, h('div', {class: 'reader-pdf'}, toolbar, findBar, pdfArea, missing), aside);
  const root = h('div', {class: 'paper-reader'}, head, body);
  root.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'f' && hasFile()) { e.preventDefault(); openFind(); }
    else if (mod && e.key.toLowerCase() === 'g' && findInput.value) { e.preventDefault(); view.find(findInput.value.trim(), {again: true, previous: e.shiftKey}); }
    else if (!backBtn.hidden && ((e.altKey && e.key === 'ArrowLeft') || (e.metaKey && e.key === '['))) { e.preventDefault(); goBack(); }
  });
  container.replaceChildren(root);
  toggleNotes(notesOpen);
  showHeader();
  showFoot();
  showPdf();
  lib.backend.notify('reading', {id: ref.id});

  return {
    id: ref.id,
    // The library reloaded (an edit elsewhere, a linked PDF): show what changed.
    update(next) {
      const shown = missing.hidden; // the PDF is on screen
      if (!next || next.revision === current.revision) { if (shown !== hasFile()) showPdf(); return; }
      const before = record.pdf;
      current = next; record = recordOf(next);
      if (!dirty) notes.value = record.annotation || '';
      showHeader(); showFoot();
      if (record.pdf !== before || shown !== hasFile()) showPdf();
    },
    async close() {
      await save();
      document.removeEventListener('selectionchange', collapse);
      view.close();
      lib.backend.notify('reading', {id: null});
    },
  };
}
