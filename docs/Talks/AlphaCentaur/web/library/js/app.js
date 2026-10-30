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
        h('div', {class: 'eyebrow'}, h('span', {class: 'applet-name', title: "alphaLibrary, alphaCentaur's reference library and PDF reader. It also runs on its own: node library/server.mjs <folder> --open"}, 'alphaLibrary'),
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
        h('p', {class: 'annotation'}, r.annotation || 'No reading notes yet.'),
        h('div', {class: 'ref-bottom'},
          h('span', {class: 'coverage'}, r.coverage || 'Unverified'),
          pdf ? h('button', {type: 'button', class: 'read-pdf', onclick: () => openPaper(ref.id)}, icon('bookOpenText', 13), 'Read PDF')
            : r.pdf ? h('button', {type: 'button', class: 'pdf-missing', title: `No file at ${r.pdf}`, onclick: () => attachPdf(lib, ref)}, icon('alert', 13), 'PDF missing')
            : h('button', {type: 'button', title: 'Attach a PDF, or drop one on this card', onclick: () => attachPdf(lib, ref)}, icon('paperclip', 13), offer),
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
  function openPaper(id) {
    const ref = lib.refs.find(r => r.id === id);
    if (!ref) return;
    if (lib.reader?.id === id) return;
    if (!lib.reader) listScroll = list.scrollTop;
    void lib.reader?.close();
    list.hidden = true;
    readerHost.hidden = false;
    lib.reader = openReader(lib, readerHost, ref);
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
        const {references, pdfs} = await backend.list();
        lib.refs = references; lib.pdfs = pdfs;
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
