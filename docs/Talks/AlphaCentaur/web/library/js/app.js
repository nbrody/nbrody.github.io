// alphaLibrary: a project's references, their PDFs and reading notes.
// The list (this file), the reader (reader.js) and the dialogs (dialogs.js)
// work against a backend: alphaCentaur's Bibliography section
// (backend-host.js) or a folder on disk (backend-http.js).
import {h, icon, button, toast, store, debounce, fileBase64} from './ui.js';
import {suggestedPdfs, pdfDownload, roleOf} from './references.js';
import {mathHTML, plainText, setMacros} from './math.js';
import {recordOf, editReference, addReference, attachPdf} from './dialogs.js';
import {openReader} from './reader.js';

const FILTERS = [['all', 'All'], ['primary', 'Primary'], ['secondary', 'Secondary'], ['pdf', 'With PDF']];

export async function start(root, backend) {
  const info = await backend.hello();
  setMacros(info.macrosSource || '');
  const embedded = backend.kind === 'host';
  const lib = {
    backend, info, embedded,
    refs: [], pdfs: [],
    // Papers converted to read-only Markdown and the conversions under way
    // (by reference id), and whether Marker is installed (server/paper-markdown.mjs).
    converted: {}, conversions: {}, converter: false,
    filter: store.get('alphaLibrary.filter', 'all'),
    search: '',
    manuscript: 'project',
    reader: null,
    get manuscriptName() { return info.manuscripts?.find(m => m.id === lib.manuscript)?.title || 'the manuscript'; },
    replace(ref) { lib.refs = lib.refs.map(r => (r.id === ref.id ? ref : r)); renderCards(); },
    onSaved(ref, {added = false} = {}) {
      lib.refs = [ref, ...lib.refs.filter(r => r.id !== ref.id)];
      renderCards();
      lib.reader?.update(ref);
      if (added) toast(`Added ${plainText(recordOf(ref).title || ref.title).slice(0, 80)}.`, {kind: 'ok'});
      void load();
    },
    onRemoved(id) {
      lib.refs = lib.refs.filter(r => r.id !== id);
      if (lib.reader?.id === id) void lib.closeReader();
      renderCards();
      void load();
    },
    // A PDF was linked: from a card, open the paper; in the reader, show it.
    async onAttached(ref) {
      lib.replace(ref);
      await load();
      if (lib.reader) lib.reader.update(lib.refs.find(r => r.id === ref.id) || ref);
      else if (recordOf(ref).pdf) openPaper(ref.id);
    },
    closeReader,
  };
  document.title = embedded ? `alphaLibrary · ${plainText(info.name)}` : `${info.name} · alphaLibrary`;

  // ---------------------------------------------------------- the list
  const search = h('input', {type: 'search', placeholder: 'Search references and notes', 'aria-label': 'Search references',
    oninput: debounce(e => { lib.search = e.target.value.trim().toLowerCase(); renderCards(); }, 120)});
  const filters = h('div', {class: 'segmented', role: 'tablist', 'aria-label': 'Show'});
  const manuscriptChoice = info.manuscripts?.length ? h('select', {class: 'select', 'aria-label': 'Reference roles for',
    onchange: e => { lib.manuscript = e.target.value; renderCards(); }},
    h('option', {value: 'project'}, 'Project reading list'), info.manuscripts.map(m => h('option', {value: m.id}, m.title))) : null;
  const cards = h('div', {class: 'ref-list'});
  const list = h('div', {class: 'lib-scroll'}, h('div', {class: 'lib-page'},
    h('header', {class: 'lib-head'},
      h('div', {},
        h('div', {class: 'eyebrow'}, h('span', {class: 'applet-name', title: "alphaLibrary, AlphaCentaur's reference library and PDF reader. It also runs on its own: node library/server.mjs <folder> --open"}, 'alphaLibrary'),
          embedded ? 'Project library' : 'Library'),
        h('h1', {}, embedded ? 'Bibliography' : info.name),
        h('p', {}, embedded ? 'Sources worth understanding. References worth citing.' : info.root)),
      button({label: 'Add reference', iconName: 'plus', cls: 'primary', onClick: () => addReference(lib)})),
    embedded && info.capabilities?.manuscript ? h('div', {class: 'sync-note'}, icon('book', 18),
      h('p', {}, 'Linked to ', h('strong', {}, 'alphacentaur.bib'), ' in Manuscript. Reference edits sync automatically; recompile to update the PDF. Both primary and secondary references are available to cite.'),
      button({label: 'Open Manuscript', onClick: () => backend.action('manuscript')})) : null,
    h('div', {class: 'lib-controls'},
      h('label', {class: 'search-field'}, icon('search', 15), search),
      button({label: 'Primary .bib', iconName: 'download', title: 'Download the primary references as BibTeX', onClick: e => exportBib(e.currentTarget)})),
    h('div', {class: 'lib-controls'}, filters, manuscriptChoice),
    cards));
  const readerHost = h('div', {class: 'reader-host', hidden: true});
  root.replaceChildren(h('div', {class: 'library'}, list, readerHost));

  const visible = () => lib.refs.filter(ref => {
    const r = recordOf(ref);
    if (lib.filter === 'pdf' ? !hasPdf(r) : lib.filter !== 'all' && roleOf(r, lib.manuscript) !== lib.filter) return false;
    return !lib.search || JSON.stringify(r).toLowerCase().includes(lib.search);
  });
  const hasPdf = r => !!r.pdf && lib.pdfs.some(p => p.path === r.pdf);
  function renderFilters() {
    const count = {all: lib.refs.length, pdf: 0, primary: 0, secondary: 0};
    for (const ref of lib.refs) { const r = recordOf(ref); count[roleOf(r, lib.manuscript)]++; if (hasPdf(r)) count.pdf++; }
    filters.replaceChildren(...FILTERS.map(([value, label]) => h('button', {type: 'button', role: 'tab', 'aria-selected': String(lib.filter === value),
      onclick: () => { lib.filter = value; store.set('alphaLibrary.filter', value); renderCards(); }}, label, h('span', {class: 'count'}, count[value]))));
  }
  function renderCards() {
    renderFilters();
    const shown = visible();
    if (!shown.length) {
      cards.replaceChildren(h('div', {class: 'empty'}, icon('book', 26),
        lib.refs.length ? h('h2', {}, 'Nothing matches') : h('h2', {}, 'Build your reading list'),
        h('p', {}, lib.refs.length ? 'Try another search or filter.' : 'Primary references belong in the paper. Secondary references help you explore the surrounding ideas.'),
        lib.refs.length ? null : button({label: 'Add the first reference', iconName: 'plus', onClick: () => addReference(lib)})));
      return;
    }
    cards.replaceChildren(...shown.map(card));
  }
  // Reading notes, with their $…$ math rendered like the title's.
  function annotationEl(text) {
    const p = h('p', {class: 'annotation'});
    if (text) p.innerHTML = mathHTML(text);
    else p.textContent = 'No reading notes yet.';
    return p;
  }
  function card(ref) {
    const r = recordOf(ref), pdf = hasPdf(r), role = roleOf(r, lib.manuscript);
    const offer = suggestedPdfs(r, lib.pdfs.map(p => p.path)).length ? 'Link PDF' : pdfDownload(r) ? 'Get PDF' : 'Attach PDF';
    const titleBtn = h('button', {type: 'button', class: 'ref-title', title: 'Edit this reference', onclick: () => editReference(lib, ref)});
    titleBtn.innerHTML = mathHTML(r.title || ref.title);
    const el = h('article', {class: `ref-card ${pdf ? 'has-pdf' : ''}`},
      pdf ? h('button', {type: 'button', class: 'ref-icon ref-pdf', title: 'Read the PDF', onclick: () => openPaper(ref.id)}, icon('fileText', 21), h('small', {}, 'PDF'))
        : h('div', {class: 'ref-icon'}, icon('book', 21)),
      h('div', {class: 'ref-body'},
        h('div', {class: 'ref-top'},
          h('span', {class: `reference-role ${role}`}, role),
          embedded ? h('span', {class: `owner ${ref.owner}`}, ref.owner === 'ai' ? 'AI-created' : 'Human-created') : null,
          h('code', {class: 'citation-key', title: 'Use this key in a LaTeX citation'}, r.key || `ref${String(ref.id).replace(/\W/g, '')}`)),
        titleBtn,
        h('p', {class: 'ref-meta'}, [r.authors || 'Authors not recorded', r.year].filter(Boolean).join(' · ')),
        annotationEl(r.annotation),
        h('div', {class: 'ref-bottom'},
          h('span', {class: 'coverage'}, r.coverage || 'Unverified'),
          pdf ? h('button', {type: 'button', class: 'read-pdf', onclick: () => openPaper(ref.id)}, icon('bookOpenText', 13), 'Read PDF')
            : r.pdf ? h('button', {type: 'button', class: 'pdf-missing', title: `No file at ${r.pdf}`, onclick: () => attachPdf(lib, ref)}, icon('alert', 13), 'PDF missing')
            : h('button', {type: 'button', title: 'Attach a PDF, or drop one on this card', onclick: () => attachPdf(lib, ref)}, icon('paperclip', 13), offer),
          pdf ? markdownControl(ref) : null,
          /^https?:/.test(r.url || '') ? h('a', {href: r.url, target: '_blank', rel: 'noreferrer'}, 'Open source', icon('arrowUpRight', 13)) : null,
          info.capabilities?.ask ? h('button', {type: 'button', onclick: () => backend.action('ask', {id: ref.id})}, icon('sparkles', 13), 'Discuss') : null)));
    // Drop a PDF on a card to attach it.
    el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('dropping'); } });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('dropping'); });
    el.addEventListener('drop', async e => {
      e.preventDefault();
      el.classList.remove('dropping');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast(`${file.name} is not a PDF.`, {kind: 'error'});
      if (file.size > 16_000_000) return toast('That PDF is larger than 16 MB.', {kind: 'error'});
      el.classList.add('uploading');
      try { await lib.onAttached(await backend.attach(ref.id, {base64: await fileBase64(file)})); }
      catch (err) { toast(err.message, {kind: 'error'}); }
      finally { el.classList.remove('uploading'); }
    });
    return el;
  }
  // ------------------------------------------- PDF → Markdown (Marker)
  // A card's Markdown control: convert, the conversion under way, or read
  // the result (read-only, with highlights and annotations, in the reader).
  function markdownControl(ref) {
    const job = lib.conversions[ref.id];
    if (job && job.state !== 'failed') {
      return h('span', {class: 'converting', title: job.pages ? `${job.pages} pages, about ${Math.ceil(job.estimate / 60)} minutes in all` : ''},
        icon('loader', 13, 'spin'), conversionLabel(job),
        h('button', {type: 'button', title: 'Stop converting this PDF', onclick: () => cancelConversion(ref)}, 'Cancel'));
    }
    if (job) return h('button', {type: 'button', class: 'pdf-missing', title: `${job.error} Click to try again.`, onclick: () => convert(ref)}, icon('alert', 13), 'Markdown failed');
    if (lib.converted[ref.id]) return h('button', {type: 'button', class: 'read-pdf', title: 'Read the paper as Markdown, with its math as LaTeX. Highlight and annotate it as you read.',
      onclick: () => openPaper(ref.id, 'markdown')}, icon('fileText', 13), 'Read Markdown');
    return h('button', {type: 'button',
      title: lib.converter ? 'Convert the PDF to Markdown with its math as LaTeX, by OCR. It takes about 12 seconds a page, in the background.'
        : 'Converting to Markdown needs Marker. Install it in Terminal with: uv tool install --python 3.12 marker-pdf',
      onclick: () => convert(ref)}, icon('fileText', 13), 'To Markdown');
  }
  function conversionLabel(job) {
    if (job.state === 'queued') return 'Waiting to convert';
    const elapsed = (Date.now() - Date.parse(job.started)) / 1000;
    if (!job.estimate) return `Converting · ${Math.max(1, Math.round(elapsed / 60))} min`;
    const left = job.estimate - elapsed;
    return left > 90 ? `Converting · about ${Math.round(left / 60)} min left` : 'Converting · almost done';
  }
  async function convert(ref) {
    try {
      const job = await backend.convert(ref.id);
      if (job.state === 'done') { await load(); openPaper(ref.id, 'markdown'); return; } // this PDF already was
      lib.conversions = {...lib.conversions, [ref.id]: job};
      renderCards();
      watchConversions();
    } catch (e) { toast(e.message, {kind: 'error'}); }
  }
  async function cancelConversion(ref) {
    try { await backend.cancelConvert(ref.id); }
    catch (e) { toast(e.message, {kind: 'error'}); }
    await load();
  }
  // While a conversion runs, ask how it is going every few seconds.
  let poll = null;
  function watchConversions() {
    clearTimeout(poll);
    if (Object.values(lib.conversions).some(j => j.state !== 'failed')) poll = setTimeout(() => void load(), 5000);
  }
  // Say so when a conversion finishes: its job is gone and the paper is
  // converted, or it failed. (A cancelled one just goes.)
  function announceConversions(before) {
    for (const [id, job] of Object.entries(before)) {
      if (job.state === 'failed') continue;
      const now = lib.conversions[id], ref = lib.refs.find(x => x.id === id);
      if (now?.state === 'failed') toast(`Markdown conversion failed: ${now.error}`, {kind: 'error'});
      else if (!now && ref && lib.converted[id]) toast(`${plainText(recordOf(ref).title || ref.title).slice(0, 60)} is ready to read as Markdown.`, {kind: 'ok'});
    }
  }

  async function exportBib(btn) {
    try {
      btn.disabled = true;
      const bib = await backend.bibtex(lib.manuscript, true);
      if (bib.warnings?.length) throw new Error(bib.warnings.join(' '));
      const a = h('a', {download: 'primary.bib', href: URL.createObjectURL(new Blob([bib.content], {type: 'text/plain'}))});
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(e.message, {kind: 'error'}); }
    finally { btn.disabled = false; }
  }

  // --------------------------------------------------------- the reader
  let listScroll = 0;
  // mode: 'pdf' or 'markdown' (a converted paper); left out, the one last used.
  function openPaper(id, mode) {
    const ref = lib.refs.find(r => r.id === id);
    if (!ref) return;
    if (lib.reader?.id === id) { if (mode) lib.reader.show(mode); return; }
    if (!lib.reader) listScroll = list.scrollTop;
    void lib.reader?.close();
    list.hidden = true;
    readerHost.hidden = false;
    lib.reader = openReader(lib, readerHost, ref, {mode});
  }
  async function closeReader() {
    const reader = lib.reader;
    lib.reader = null;
    readerHost.hidden = true;
    list.hidden = false;
    list.scrollTop = listScroll;
    renderCards();
    await reader?.close();
    readerHost.replaceChildren();
  }

  // ------------------------------------------------------------- data
  let loading = null;
  async function load() {
    loading ||= (async () => {
      try {
        const {references, pdfs, converted = {}, conversions = {}, converter = false} = await backend.list();
        const before = lib.conversions;
        lib.refs = references; lib.pdfs = pdfs; lib.converted = converted; lib.conversions = conversions; lib.converter = converter;
        announceConversions(before);
        watchConversions();
        if (!lib.reader) renderCards();
        else { renderFilters(); lib.reader.update(lib.refs.find(r => r.id === lib.reader.id)); }
      } catch (e) { toast(e.message, {kind: 'error'}); }
      finally { loading = null; }
    })();
    return loading;
  }
  backend.subscribe((name, data) => {
    if (name === 'changed') void load();
    else if (name === 'open' && data.id) void load().then(() => openPaper(data.id));
  });
  await load();
  if (info.open) openPaper(info.open);
}
