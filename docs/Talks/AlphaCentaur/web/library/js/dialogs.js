// alphaLibrary's dialogs: the reference editor, adding a reference from a DOI
// or an arXiv number, and attaching a PDF to a reference.
import {h, dialog, confirmDialog, toast, icon, button, busy, sizeLabel, fileBase64} from './ui.js';
import {suggestedPdfs, pdfDownload, paperPath, roleOf, blankRecord} from './references.js';

const FIELDS = [['title', 'Title'], ['authors', 'Authors'], ['year', 'Year'], ['journal', 'Journal'], ['volume', 'Volume'], ['number', 'Number'],
  ['pages', 'Pages'], ['publisher', 'Publisher'], ['doi', 'DOI'], ['url', 'URL'], ['key', 'Citation key'], ['coverage', 'Coverage']];
const TYPES = ['misc', 'article', 'book', 'incollection', 'inproceedings', 'phdthesis', 'unpublished'];
const MAX_PDF = 16_000_000;
export const recordOf = ref => {
  try {
    const r = JSON.parse(ref?.content || '');
    if (r && typeof r === 'object' && !Array.isArray(r)) return r;
  } catch {}
  return {title: ref?.title || '', annotation: ref?.content || ''};
};
const select = (value, options, attrs = {}) => h('select', {class: 'select', ...attrs},
  options.map(o => h('option', {value: o.value, selected: o.value === value}, o.label)));

// The reference editor. `ref` is a Ref, or null for a new reference whose
// starting record is `record`. lib: {backend, manuscript, manuscriptName, onSaved(ref), onRemoved(id)}.
export function editReference(lib, ref, record = recordOf(ref)) {
  const draft = {...record};
  const id = `ref-form-${Math.random().toString(36).slice(2)}`;
  const inputs = FIELDS.map(([k, label]) => h('label', {}, h('span', {}, label),
    h('input', {value: draft[k] ?? '', required: k === 'title', placeholder: k === 'authors' ? 'Ada Lovelace and Emmy Noether' : undefined,
      spellcheck: k === 'title' ? 'true' : 'false', oninput: e => { draft[k] = e.target.value; }})));
  const type = select(draft.type || 'misc', TYPES.map(value => ({value, label: value})), {onchange: e => { draft.type = e.target.value; }});
  const role = select(roleOf(draft, lib.manuscript), [{value: 'primary', label: 'Primary: cite in the paper'}, {value: 'secondary', label: 'Secondary: related reading'}], {
    onchange: e => {
      if (lib.manuscript === 'project') draft.role = e.target.value;
      else draft.roles = {...draft.roles, [lib.manuscript]: e.target.value};
    }});
  const notes = h('textarea', {rows: 7, oninput: e => { draft.annotation = e.target.value; }});
  notes.value = draft.annotation || '';
  const error = h('div', {class: 'field-error', role: 'alert'});
  const form = h('form', {id, class: 'form ref-form', onsubmit: async e => {
    e.preventDefault();
    if (!String(draft.title || '').trim()) { error.textContent = 'A reference needs a title.'; return; }
    error.textContent = '';
    const submit = d.box.querySelector('button[type=submit]');
    try {
      const saved = await busy(submit, () => ref ? lib.backend.save(ref.id, draft, ref.revision, true) : lib.backend.create(draft));
      d.close();
      lib.onSaved(saved);
    } catch (err) {
      error.textContent = err.code === 'conflict' ? 'This reference changed somewhere else. Close this dialog to see the newer version, then edit again.' : err.message;
    }
  }},
  h('div', {class: 'form-grid'}, inputs,
    h('label', {}, h('span', {}, 'Entry type'), type),
    h('label', {}, h('span', {}, lib.manuscript === 'project' ? 'Role' : `Role in ${lib.manuscriptName}`), role)),
  h('label', {}, h('span', {}, 'Reading notes'), notes),
  draft.pdf ? h('p', {class: 'hint'}, 'PDF: ', h('code', {}, draft.pdf)) : null,
  error,
  ref ? h('div', {class: 'form-foot'}, button({label: 'Move to Trash', iconName: 'trash', cls: 'ghost sm danger-text', onClick: async () => {
    if (!await confirmDialog({title: 'Move this reference to the Trash?', message: 'Its PDF stays in the project. You can restore the reference from the Trash.', confirm: 'Move to Trash', danger: true})) return;
    try { await lib.backend.remove(ref.id); d.close(); lib.onRemoved(ref.id); }
    catch (err) { toast(err.message, {kind: 'error'}); }
  }})) : null);
  const d = dialog({title: ref ? 'Reference and reading notes' : 'New reference', body: form, wide: true,
    actions: [{label: 'Cancel'}, {label: 'Save reference', primary: true, submit: id}]});
  return d;
}

// Add a reference: a DOI (Crossref) or an arXiv number, or by hand.
export function addReference(lib) {
  const id = `add-form-${Math.random().toString(36).slice(2)}`;
  const input = h('input', {autofocus: true, placeholder: '10.1000/example  or  2312.11258', spellcheck: 'false', autocomplete: 'off'});
  const error = h('div', {class: 'field-error', role: 'alert'});
  const form = h('form', {id, class: 'form', onsubmit: async e => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    error.textContent = '';
    try {
      const ref = await busy(d.box.querySelector('button[type=submit]'), () => lib.backend.resolve(value));
      d.close();
      lib.onSaved(ref, {added: true});
    } catch (err) { error.textContent = err.message; }
  }},
  h('label', {}, h('span', {}, 'DOI or arXiv number'), input),
  h('p', {class: 'hint'}, 'Journal articles resolve through Crossref, arXiv preprints through DataCite.'),
  error);
  const d = dialog({title: 'Add a reference', body: form, actions: [
    {label: 'Enter manually', run: () => { d.close(); editReference(lib, null, blankRecord()); return false; }},
    {label: 'Look it up', primary: true, submit: id}]});
  return d;
}

// Attach a PDF to a reference: a matching file already there, a download
// (arXiv or a link), an upload, or any PDF in the project.
export function attachPdf(lib, ref) {
  const r = recordOf(ref), paths = lib.pdfs.map(p => p.path);
  const suggestions = suggestedPdfs(r, paths), download = pdfDownload(r);
  const where = lib.embedded ? 'this project' : 'this folder';
  const attach = async (btn, source) => {
    try {
      const saved = await busy(btn, () => lib.backend.attach(ref.id, source));
      d.close();
      lib.onAttached(saved);
    } catch (err) { toast(err.message, {kind: 'error'}); }
  };
  const upload = async (btn, file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast(`${file.name} is not a PDF.`, {kind: 'error'});
    if (file.size > MAX_PDF) return toast('That PDF is larger than 16 MB.', {kind: 'error'});
    await attach(btn, {base64: await fileBase64(file)});
  };
  const row = (...children) => h('div', {class: 'attach-row'}, children);
  const link = h('input', {placeholder: download ? 'Or another link to a PDF' : 'A link to the PDF, such as https://…/paper.pdf', 'aria-label': 'Link to a PDF', spellcheck: 'false'});
  const file = h('input', {type: 'file', accept: 'application/pdf,.pdf', hidden: true, onchange: e => { void upload(choose, e.target.files?.[0]); e.target.value = ''; }});
  const choose = button({label: 'Choose a file…', iconName: 'upload', cls: 'sm', onClick: () => file.click()});
  const any = h('select', {class: 'select', 'aria-label': `A PDF in ${where}`},
    h('option', {value: ''}, 'Choose a PDF…'), [...paths].sort().map(p => h('option', {value: p}, p)));
  const linkAny = button({label: 'Link', iconName: 'link', cls: 'sm', onClick: () => any.value && attach(linkAny, {path: any.value})});
  const getLink = button({label: 'Get', iconName: 'download', cls: 'sm', type: 'submit'});
  const body = h('div', {class: 'attach-pdf'},
    h('p', {class: 'attach-title'}, r.title || ref.title),
    suggestions.length ? h('section', {}, h('h3', {}, `Found in ${where}`), suggestions.map(p => {
      const btn = button({label: 'Link', iconName: 'link', cls: 'sm', onClick: () => attach(btn, {path: p})});
      return row(icon('fileText', 15), h('code', {}, p), h('small', {}, sizeLabel(lib.pdfs.find(x => x.path === p)?.size)), btn);
    })) : null,
    h('section', {}, h('h3', {}, 'Download'),
      download ? (() => {
        const btn = button({label: 'Download', iconName: 'download', cls: 'sm primary', onClick: () => attach(btn, {url: download.url})});
        return row(icon('download', 15), h('span', {}, 'From ', h('strong', {}, download.label)), btn);
      })() : null,
      h('form', {class: 'attach-row', onsubmit: e => { e.preventDefault(); if (link.value.trim()) void attach(getLink, {url: link.value.trim()}); }},
        icon('link', 15), link, getLink),
      h('p', {class: 'hint attach-hint'}, 'Saved as ', h('code', {}, paperPath(r)), '.')),
    h('section', {}, h('h3', {}, 'From this computer'),
      row(icon('upload', 15), h('span', {}, 'Drop a PDF here, or'), choose, file)),
    paths.length ? h('section', {}, h('h3', {}, `Any PDF in ${where}`), row(any, linkAny)) : null,
    r.pdf ? h('div', {class: 'attach-current'}, h('span', {}, 'Linked now: ', h('code', {}, r.pdf)), (() => {
      const btn = button({label: 'Unlink', iconName: 'unlink', cls: 'ghost sm', title: 'Unlink the PDF (the file stays)', onClick: () => attach(btn, {path: null})});
      return btn;
    })()) : null);
  body.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); body.classList.add('dropping'); } });
  body.addEventListener('dragleave', e => { if (!body.contains(e.relatedTarget)) body.classList.remove('dropping'); });
  body.addEventListener('drop', e => { e.preventDefault(); body.classList.remove('dropping'); void upload(choose, e.dataTransfer.files[0]); });
  const d = dialog({title: 'Attach a PDF', body});
  return d;
}
