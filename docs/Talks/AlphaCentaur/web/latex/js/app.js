// The editor shell: files, source buffers, autosave, builds, PDF and SyncTeX.
// Everything that touches files or compilers goes through `backend`, which is
// either the standalone server (backend-http.js) or a host page
// (backend-host.js), so the same editor runs on its own and inside alphaCentaur.
import {h, replace, icon, button, toast, dialog, prompt, confirmDialog, store, debounce, mod, timeOf, menu} from './ui.js';
import {makeState, jumpTo, outsideEdit, scanSource, scanBib, emptyIndex, EditorView, DEFAULT_SETTINGS, settingsEffects, relint, refreshPreview, toggleWrap, insertSnippet} from './editor.js';
import {formattingToolbar, symbolPalette} from './toolbar.js';
import {outlinePanel, searchPanel} from './panels.js';
import {diffLines, hunks} from './diff.js';
import {outlineOf, blankComments} from './latex.js';
import {PdfView} from './pdf.js';
import {parseLog, matchFile} from './log.js';
import {renderTree, fileRow} from './tree.js';
import {kindOf, editable, cleanPath} from './kinds.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dirname = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const words = text => (text.replace(/(?<!\\)%[^\n]*/g, '').replace(/\\[a-zA-Z@]+\*?/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

export async function start(root, backend) {
  const info = await backend.hello();
  const caps = {compile: true, toSource: true, toPdf: true, create: true, rename: true, upload: 'text', history: false, ...info.capabilities};
  const key = info.key, embedded = backend.kind === 'host';
  const pref = (name, fallback) => store.get(`latex:${name}:${key}`, fallback);
  const setPref = (name, value) => store.set(`latex:${name}:${key}`, value);
  if (!embedded) document.title = `${info.name} — alphaTeX`;
  // Editor preferences are per person; compiler choices are per project.
  const PROJECT_SETTINGS = ['engine', 'draft', 'haltOnError'];
  const settings = {...DEFAULT_SETTINGS, ...(embedded ? {theme: 'light'} : {}), ...store.get('latex:settings', {}), ...pref('compile', {})};
  const saveSettings = () => {
    store.set('latex:settings', Object.fromEntries(Object.entries(settings).filter(([k]) => !PROJECT_SETTINGS.includes(k))));
    setPref('compile', Object.fromEntries(PROJECT_SETTINGS.map(k => [k, settings[k]])));
  };

  const S = {
    files: [], byId: new Map(), buffers: new Map(), texts: new Map(), current: null, preview: null,
    main: null, build: {latest: null, pdf: null}, shownPdf: null, compiling: false, problems: [],
    layout: pref('layout', 'split'), showFiles: pref('files', true), split: pref('split', 0.5), syncClicks: pref('sync', true),
    drawer: pref('drawer', false), drawerTab: 'problems', folds: new Set(pref('folds', [])), indexStale: true, index: emptyIndex(),
    sideMode: 'files', outlineOpen: pref('outline', true), symbols: false, pdfSearch: false,
  };
  const cur = () => S.buffers.get(S.current) || null;
  const fileOf = id => S.byId.get(id) || null;
  const projectFiles = () => S.files.filter(f => (f.group || 'project') === 'project');
  const sharedFiles = () => S.files.filter(f => f.group === 'shared');
  const isDirty = buf => !!buf && buf.state.doc !== buf.savedDoc && buf.state.doc.toString() !== buf.saved;
  const dirtyId = id => isDirty(S.buffers.get(id));

  // ------------------------------------------------------------ layout --
  const els = {};
  els.files = button({iconName: 'sidebar', title: 'Show files', cls: 'ghost icon-only', onClick: () => { S.showFiles = !S.showFiles; setPref('files', S.showFiles); renderFrame(); }});
  els.mainSelect = h('select', {class: 'select', 'aria-label': 'Main document', title: 'Main document', onchange: e => setMain(e.target.value)});
  els.compile = h('button', {type: 'button', class: 'btn primary compile', title: `Save and compile (${mod}S or ${mod}↩)`, onclick: () => compile()});
  els.compileMenu = h('button', {type: 'button', class: 'btn primary compile-more', title: 'Compile options', 'aria-label': 'Compile options',
    'aria-haspopup': 'menu', onclick: e => compileMenu(e.currentTarget)}, icon('down', 14));
  els.stop = button({iconName: 'stop', title: 'Stop compiling', cls: 'ghost icon-only', onClick: () => stop()});
  // Inside alphaCentaur: which document (a folder with a main .tex) this is,
  // plus New document… and Move into a folder…. The host has no row of its own.
  let documents = embedded && info.documents?.options ? info.documents : null;
  els.docSelect = documents ? h('select', {class: 'select doc-select', 'aria-label': 'Document', title: 'Document', onchange: e => void pickDocument(e.target)}) : null;
  els.layoutTabs = h('div', {class: 'segmented', role: 'tablist', 'aria-label': 'Layout'}, ['source', 'split', 'pdf'].map(l =>
    h('button', {type: 'button', role: 'tab', 'data-layout': l, onclick: () => setLayout(l)}, {source: 'Source', split: 'Split', pdf: 'PDF'}[l])));
  const top = h('header', {class: 'topbar'},
    els.files,
    // alphaTeX's name: the full brand on its own, a name tag inside
    // alphaCentaur (whose sidebar calls the section Manuscript).
    embedded ? h('span', {class: 'applet-name', title: 'alphaTeX, alphaCentaur\'s LaTeX editor. It also runs on its own: node latex/server.mjs <folder> --open'}, 'alphaTeX')
      : h('div', {class: 'brand', title: info.root}, h('span', {class: 'brand-mark'}, 'TeX'), h('div', {}, h('strong', {}, 'alphaTeX'), h('small', {}, info.name))),
    els.docSelect ? h('label', {class: 'main-picker doc-picker'}, h('span', {}, 'Document'), els.docSelect) : null,
    h('label', {class: 'main-picker'}, h('span', {}, 'Main document'), els.mainSelect),
    h('div', {class: 'compile-group'}, els.compile, els.compileMenu), els.stop,
    h('div', {class: 'spacer'}),
    els.layoutTabs,
    h('button', {type: 'button', class: 'btn ghost icon-only', title: 'Menu', 'aria-label': 'Menu', 'aria-haspopup': 'menu', onclick: e => mainMenu(e.currentTarget)}, icon('menu', 17)));

  els.tree = h('div', {class: 'tree', role: 'tree', 'aria-label': 'Project files'});
  els.shared = h('div', {class: 'shared'});
  els.upload = h('input', {type: 'file', multiple: true, hidden: true, onchange: e => { const list = [...e.target.files]; e.target.value = ''; void upload(list); }});
  els.sideTitle = h('strong', {}, 'Files');
  els.searchToggle = button({iconName: 'search', title: `Search in project (${mod}⇧F)`, cls: 'ghost icon-only sm', onClick: () => setSideMode(S.sideMode === 'search' ? 'files' : 'search')});
  els.filesBox = h('div', {class: 'files-box'}, els.tree, els.shared);
  els.sideHead = h('div', {class: 'side-head'}, els.sideTitle, h('div', {class: 'spacer'}),
      caps.create ? button({iconName: 'filePlus', title: 'New file', cls: 'ghost icon-only sm', onClick: () => newFile()}) : null,
      caps.create && caps.upload ? button({iconName: 'upload', title: 'Upload files (or drop them here)', cls: 'ghost icon-only sm', onClick: () => els.upload.click()}) : null,
      els.searchToggle);
  const search = searchPanel({files: () => searchableFiles(), onOpen: (id, line, select) => void open(id, {line, select})});
  const outline = outlinePanel({open: S.outlineOpen, onToggle: v => { S.outlineOpen = v; setPref('outline', v); }, onJump: line => { if (cur()) jumpTo(view, line); }});
  search.el.hidden = true;
  const sidebar = h('aside', {class: 'sidebar', 'aria-label': 'Files'},
    els.sideHead, els.filesBox, search.el, outline.el, els.upload,
    h('p', {class: 'side-hint'}, 'Drop files here to upload. Use folder/name.tex to make folders.'));
  // Files dragged in from the desktop are uploaded.
  sidebar.addEventListener('dragover', e => { if (caps.create && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); sidebar.classList.add('dropping'); } });
  sidebar.addEventListener('dragleave', e => { if (!sidebar.contains(e.relatedTarget)) sidebar.classList.remove('dropping'); });
  sidebar.addEventListener('drop', e => {
    sidebar.classList.remove('dropping');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    const folder = e.target.closest('.tree-row.folder')?.dataset.path || '';
    void upload([...e.dataTransfer.files], folder);
  });

  els.sourceHead = h('div', {class: 'pane-head'});
  els.banners = h('div', {class: 'banners'});
  els.cm = h('div', {class: 'cm-host'});
  els.preview = h('div', {class: 'file-preview', hidden: true});
  els.sourceEmpty = h('div', {class: 'empty', hidden: true});
  els.status = h('div', {class: 'statusbar'});
  const sourcePane = h('section', {class: 'pane source-pane', 'aria-label': 'Source'}, els.sourceHead, els.banners, els.cm, els.preview, els.sourceEmpty, els.status);

  els.splitter = h('div', {class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize source and PDF', tabindex: '0'});
  els.pdfHead = h('div', {class: 'pane-head pdf-head'});
  els.pdfBody = h('div', {class: 'pdf-body'});
  els.pdfMessage = h('div', {class: 'pdf-message'});
  els.drawer = h('div', {class: 'drawer'});
  els.pdfFind = h('div', {class: 'pdf-find', hidden: true});
  els.pdfWrap = h('div', {class: 'pdf-wrap'}, els.pdfBody, els.pdfMessage);
  const pdfPane = h('section', {class: 'pane pdf-pane', 'aria-label': 'PDF'}, els.pdfHead, els.pdfFind, els.pdfWrap, els.drawer);
  els.body = h('div', {class: 'workspace'}, sidebar, sourcePane, els.splitter, pdfPane);
  replace(root, top, els.body);
  root.classList.add('app');

  // ------------------------------------------------------------ editor --
  const writable = v => !v.state.readOnly;
  const editorCommands = [
    {key: 'Mod-Enter', run: () => (void compile(), true)},
    {key: 'Mod-s', run: () => (void compile(), true)}, // as in Overleaf: saving is automatic
    {key: 'Mod-Alt-j', run: () => (void locate(), true)},
    {key: 'Mod-Shift-f', run: () => (setSideMode('search'), true)},
    {key: 'Mod-b', run: v => writable(v) && (toggleWrap(v, '\\textbf{', '}'), true)},
    {key: 'Mod-i', run: v => writable(v) && (toggleWrap(v, '\\textit{', '}'), true)},
  ];
  const getIndex = () => {
    if (!S.indexStale) return S.index;
    const idx = emptyIndex();
    const base = S.main ? dirname(fileOf(S.main)?.path || '') : '';
    idx.files = S.files.filter(f => (f.group || 'project') === 'project').map(f => base && f.path.startsWith(base + '/') ? f.path.slice(base.length + 1) : f.path);
    idx.labelUses = new Map();
    for (const f of S.files) {
      const text = textOf(f.id);
      if (typeof text !== 'string') continue;
      if (f.kind === 'bib') scanBib(text, f.label || f.path, idx);
      else if (f.kind === 'tex') {
        scanSource(text, f.label || f.path, idx);
        for (const m of blankComments(text).matchAll(/\\[a-zA-Z]*ref\*?\{([^{}]*)\}/g))
          for (const name of m[1].split(',')) idx.labelUses.set(name.trim(), (idx.labelUses.get(name.trim()) || 0) + 1);
      }
    }
    S.index = idx; S.indexStale = false;
    return idx;
  };
  const textOf = id => { const buf = S.buffers.get(id); return buf ? buf.state.doc.toString() : S.texts.get(id)?.content; };
  const view = new EditorView({parent: els.cm, state: makeState('', {kind: 'text', readOnly: true})});
  const toolbar = formattingToolbar({view, onSymbols: () => toggleSymbols()});
  const palette = symbolPalette({view, onClose: () => toggleSymbols(false)});
  palette.el.hidden = true;
  sourcePane.insertBefore(toolbar.el, els.cm);
  sourcePane.insertBefore(palette.el, els.status);
  function toggleSymbols(on = !S.symbols) {
    S.symbols = on; palette.el.hidden = !on;
    toolbar.update(cur()?.readOnly, S.symbols);
    if (on) palette.focus(); else view.focus();
  }
  const writeDraft = debounce(buf => {
    if (isDirty(buf)) store.set(buf.draftKey, {baseRevision: buf.revision, content: buf.state.doc.toString(), saved: Date.now()});
    else store.remove(buf.draftKey);
  }, 250);
  const onUpdate = u => {
    const buf = cur();
    if (!buf || u.view !== view) return;
    buf.state = u.state;
    if (u.docChanged) {
      S.indexStale = true;
      const dirty = isDirty(buf);
      if (dirty) { writeDraft(buf); scheduleSave(buf); }
      else { writeDraft.cancel(); store.remove(buf.draftKey); clearTimeout(buf.timer); }
      renderSaveState();
      if (dirty !== buf.shownDirty) { buf.shownDirty = dirty; renderTreeOnly(); renderPdfStatus(); }
      scheduleAuto();
    }
    if (u.docChanged || u.selectionSet) {
      renderCursor();
      outline.update(u.docChanged ? u.state.doc.toString() : undefined, u.state.doc.lineAt(u.state.selection.main.head).number);
      toolbar.update(buf.readOnly, S.symbols);
    }
  };
  function makeBuffer(f, data) {
    const draftKey = data.draftKey || `latex-draft:${key}:${f.id}`;
    const draft = store.get(draftKey);
    let content = data.content, recovered = false, draftConflict = null;
    if (draft && typeof draft.content === 'string' && draft.content !== data.content) {
      if (draft.baseRevision === data.revision) { content = draft.content; recovered = true; }
      else draftConflict = {content: draft.content, saved: draft.saved};
    } else if (draft) store.remove(draftKey);
    const readOnly = !!(data.readOnly || f.readOnly);
    const id = f.id;
    const state = makeState(content, {kind: f.kind, readOnly, onUpdate, commands: editorCommands, getIndex, settings,
      onNavigate: ref => void navigate(ref), getProblems: () => problemsFor(buf?.id ?? id),
      onImage: caps.upload === 'any' ? (files, v) => void pasteImages(files, v) : undefined});
    var buf = {id: f.id, path: f.path, kind: f.kind, readOnly, draftKey, state, revision: data.revision, saved: data.content,
      savedDoc: recovered ? null : state.doc, conflict: null, draftConflict, saving: null, timer: null, error: null, scroll: 0, notice: recovered ? 'Recovered unsaved changes from this browser.' : null};
    if (recovered) scheduleSave(buf);
    return buf;
  }

  let openToken = 0;
  async function open(id, {line, focus = true, select} = {}) {
    const f = fileOf(id);
    if (!f) return;
    if (!editable(f.kind) || f.binary) {
      if (f.kind === 'image' && backend.rawUrl(f.id)) { stash(); S.current = null; S.preview = f.id; renderAll(); }
      else if (backend.rawUrl(f.id)) window.open(backend.rawUrl(f.id), '_blank', 'noopener');
      else toast(`${f.label || f.path} can't be opened here.`);
      return;
    }
    const token = ++openToken;
    let buf = S.buffers.get(id);
    if (!buf) {
      try {
        const data = await backend.read(id);
        if (token !== openToken) return;
        buf = S.buffers.get(id) || makeBuffer(f, data);
        S.buffers.set(id, buf);
      } catch (e) { toast(e.message, {kind: 'error'}); return; }
    }
    if (S.current !== id) {
      stash();
      S.current = id; S.preview = null;
      view.setState(buf.state);
      view.scrollDOM.scrollTop = buf.scroll || 0;
      setPref('open', id);
    }
    // Opening a document that can be compiled makes it the main document.
    if (f.main && f.kind === 'tex' && S.main !== id) setMain(id);
    backend.notify('opened', {id});
    if (S.layout === 'pdf') setLayout('split');
    renderAll();
    outline.update(view.state.doc.toString(), view.state.doc.lineAt(view.state.selection.main.head).number);
    toolbar.update(buf.readOnly, S.symbols);
    if (line) jumpTo(view, line, {focus, select});
    else if (focus) view.focus();
  }
  function stash() {
    const buf = cur();
    if (!buf) return;
    buf.state = view.state; buf.scroll = view.scrollDOM.scrollTop;
    if (isDirty(buf)) writeDraft.flush(buf);
  }
  // Applies text that changed elsewhere to a clean buffer.
  function applyOutside(buf, text, revision) {
    buf.saved = text; buf.revision = revision; buf.conflict = null;
    if (buf.id === S.current) { const spec = outsideEdit(view.state, text); if (spec) view.dispatch(spec); buf.state = view.state; }
    else { const spec = outsideEdit(buf.state, text); if (spec) buf.state = buf.state.update(spec).state; }
    buf.savedDoc = buf.state.doc;
    S.indexStale = true;
  }
  async function setEditorText(buf, text) {
    if (buf.id !== S.current) await open(buf.id);
    if (buf.id === S.current) view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});
  }

  // -------------------------------------------------------------- saving --
  function scheduleSave(buf) {
    clearTimeout(buf.timer);
    buf.timer = setTimeout(() => void save(buf), 900);
  }
  async function save(buf) {
    clearTimeout(buf.timer);
    if (buf.saving) { await buf.saving; return isDirty(buf) && !buf.conflict ? save(buf) : undefined; }
    if (!isDirty(buf) || buf.readOnly || buf.conflict) return;
    buf.saving = (async () => {
      renderSaveState();
      while (isDirty(buf) && !buf.conflict) {
        const doc = buf.state.doc, content = doc.toString();
        try {
          const r = await backend.write(buf.id, content, buf.revision);
          buf.revision = r.revision; buf.saved = content; buf.savedDoc = doc; buf.error = null; buf.notice = null;
          const f = fileOf(buf.id);
          if (f) { f.revision = r.revision; if (typeof r.main === 'boolean') f.main = r.main; }
          if (!isDirty(buf)) { writeDraft.cancel(); store.remove(buf.draftKey); }
        } catch (e) {
          if (e.code === 'conflict') buf.conflict = e.current || {content: null, revision: null};
          else { buf.error = e.message; toast(`Couldn't save ${buf.path}: ${e.message}`, {kind: 'error'}); }
          break;
        }
      }
    })();
    try { await buf.saving; } finally { buf.saving = null; renderAll(); }
  }
  async function saveAll() {
    for (const buf of S.buffers.values()) if (isDirty(buf)) await save(buf);
    const blocked = [...S.buffers.values()].find(b => b.conflict || (isDirty(b) && b.error));
    if (blocked) throw new Error(blocked.conflict ? `${blocked.path} changed elsewhere. Choose a version before compiling.` : `${blocked.path} could not be saved.`);
  }

  // -------------------------------------------------------------- files --
  function setFiles(files) {
    S.files = files;
    S.byId = new Map(files.map(f => [f.id, f]));
    S.indexStale = true;
    const candidates = mainCandidates();
    if (S.main && !S.byId.has(S.main)) S.main = null;
    if (!S.main) {
      const remembered = pref('main', null) || info.preferredMain;
      const pick = candidates.find(f => f.id === remembered) || candidates.find(f => /(^|\/)main\.tex$/i.test(f.path)) || candidates[0];
      if (pick) setMain(pick.id, {quiet: true});
    }
  }
  const mainCandidates = () => {
    const mains = S.files.filter(f => f.main && f.kind === 'tex');
    return mains.length ? mains : projectFiles().filter(f => f.kind === 'tex');
  };
  async function refreshFiles(files) {
    try { files ||= (await backend.list()).files; } catch (e) { toast(e.message, {kind: 'error'}); return; }
    setFiles(files);
    await Promise.all([...S.buffers.values()].map(async buf => {
      const f = fileOf(buf.id);
      if (!f || f.revision === buf.revision || buf.saving) return;
      // The list can lag behind a save; a fresh read is the authority.
      let data;
      try { data = await backend.read(buf.id); } catch { return; }
      if (data.revision === buf.revision || buf.saving) { f.revision = buf.revision; return; }
      if (!isDirty(buf)) {
        applyOutside(buf, data.content, data.revision);
        if (buf.id === S.current) toast(`${f.label || f.path} was updated with changes made elsewhere.`);
      } else buf.conflict = {content: data.content, revision: data.revision};
    }));
    renderAll();
    void loadTexts();
  }
  // Reads closed .tex/.bib files in the background for completions.
  let loadingTexts = false;
  async function loadTexts() {
    if (loadingTexts) return;
    loadingTexts = true;
    try {
      const wanted = S.files.filter(f => editable(f.kind) && !f.binary && (f.size ?? 0) < 2_000_000 && !S.buffers.has(f.id) && S.texts.get(f.id)?.revision !== f.revision).slice(0, 150);
      for (const f of wanted) {
        try { const d = await backend.read(f.id); S.texts.set(f.id, {revision: d.revision, content: d.content}); S.indexStale = true; } catch {}
      }
    } finally { loadingTexts = false; }
  }

  function setMain(id, {quiet = false} = {}) {
    if (!id || S.main === id) return;
    S.main = id;
    setPref('main', id);
    backend.notify('main', {id});
    S.build = {latest: null, pdf: null};
    S.indexStale = true;
    if (!quiet) { renderTop(); renderTreeOnly(); }
    void loadBuilds();
  }

  async function newFile() {
    const folder = dirname(cur()?.path || '');
    const templates = info.templates?.length ? info.templates : [{id: 'blank', label: 'Blank file', content: ''}];
    const select = h('select', {class: 'select'}, templates.map(t => h('option', {value: t.id}, t.label)));
    if (mainCandidates().some(f => f.main)) select.value = templates.find(t => !t.content)?.id || templates[0].id;
    const first = !S.files.some(f => f.kind === 'tex');
    const result = await prompt({title: 'New file', label: 'File path', value: `${folder ? folder + '/' : ''}${first ? 'main.tex' : 'section.tex'}`,
      hint: 'Use folder/name.tex to put it in a folder.', submit: 'Create',
      extra: {element: h('label', {}, h('span', {}, 'Start with'), select), value: () => select.value},
      validate: v => !cleanPath(v) ? 'Enter a relative path with valid folder names.' : S.files.some(f => f.path === v) ? 'A file with that name already exists.' : null});
    if (!result) return;
    const template = templates.find(t => t.id === result.extra);
    const content = kindOf(result.value) === 'tex' ? template?.content || '' : '';
    try {
      const f = await backend.create(result.value, {content});
      await refreshFiles();
      await open(f.id);
    } catch (e) { toast(e.message, {kind: 'error'}); }
  }
  async function upload(list, folder = '') {
    // Dropping onto a folder row uploads into that folder (by its real path).
    const prefix = folder ? realFolder(folder) : '';
    for (const file of list) {
      const path = prefix ? `${prefix}/${file.name}` : file.name, kind = kindOf(path);
      if (!cleanPath(path)) { toast(`${path} has a name the editor can't use.`, {kind: 'error'}); continue; }
      if (!editable(kind) && caps.upload !== 'any') { toast(`Only text files can be imported here; ${path} was skipped.`, {kind: 'error'}); continue; }
      const exists = S.files.find(f => f.path === path);
      if (exists && !(await confirmDialog({title: 'Replace file?', message: `${path} already exists. Replace it with the uploaded file?`, confirm: 'Replace', danger: true}))) continue;
      try {
        if (exists && editable(kind)) {
          const data = await backend.read(exists.id);
          await backend.write(exists.id, await file.text(), data.revision);
        } else if (editable(kind)) await backend.create(path, {content: await file.text()});
        else await backend.create(path, {base64: await base64(file), overwrite: !!exists});
        toast(`Uploaded ${path}.`, {kind: 'ok'});
      } catch (e) { toast(`${path}: ${e.message}`, {kind: 'error'}); }
    }
    await refreshFiles();
  }
  const base64 = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  async function rename(id, target) {
    const f = fileOf(id);
    if (!f || !caps.rename || f.readOnly || f.group === 'shared') return;
    const to = target || await prompt({title: 'Move or rename', label: 'File path', value: f.path, submit: 'Move',
      hint: 'Use a path such as sections/introduction.tex to move it into a folder.',
      validate: v => !cleanPath(v) ? 'Enter a relative path with valid folder names.' : v !== f.path && S.files.some(x => x.path === v) ? 'A file with that name already exists.' : null});
    if (!to || to === f.path) return;
    try {
      const buf = S.buffers.get(id);
      if (buf) { await save(buf); if (buf.conflict || isDirty(buf)) throw new Error('Save or resolve this file before moving it.'); }
      const moved = await backend.rename(id, to);
      if (buf && moved.id !== id) {
        S.buffers.delete(id); buf.id = moved.id; buf.path = moved.path; S.buffers.set(moved.id, buf);
        store.remove(buf.draftKey); buf.draftKey = `latex-draft:${key}:${moved.id}`;
        if (S.current === id) S.current = moved.id;
      } else if (buf) buf.path = moved.path;
      if (buf) buf.revision = moved.revision ?? buf.revision;
      if (S.main === id) { S.main = moved.id; setPref('main', moved.id); }
      await refreshFiles();
      renderAll();
    } catch (e) { toast(e.message, {kind: 'error'}); }
  }
  function download(buf) {
    const a = h('a', {download: (fileOf(buf.id)?.label || buf.path).split('/').pop(), href: URL.createObjectURL(new Blob([buf.state.doc.toString()], {type: 'text/plain'}))});
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // Versions of a file, each shown as its changes against the current text
  // (Overleaf's History), with the full text one click away.
  async function history(buf) {
    let revisions;
    try { revisions = await backend.history(buf.id); } catch (e) { toast(e.message, {kind: 'error'}); return; }
    if (!revisions.length) { toast('No earlier versions yet. Versions are kept as you edit.'); return; }
    const contentOf = async r => r.content ?? (r.content = (await backend.version(buf.id, r.id)).content);
    const area = h('div', {class: 'history-preview'}, 'Choose a version to compare it with the current file.');
    const legend = h('div', {class: 'history-legend'});
    let chosen = null, mode = 'changes';
    const modes = h('div', {class: 'segmented small'}, [['changes', 'Changes'], ['full', 'Full text']].map(([m, label]) =>
      h('button', {type: 'button', 'aria-selected': String(m === mode), onclick: e => { mode = m; modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b === e.currentTarget))); show(); }}, label)));
    const restore = h('button', {type: 'button', class: 'btn primary', disabled: true, onclick: () => {
      if (chosen?.content === undefined) return;
      void setEditorText(buf, chosen.content);
      d.close();
      toast('Restored. It will be saved as a new version.', {kind: 'ok'});
    }}, 'Restore this version');
    function show() {
      if (!chosen) return;
      const current = buf.state.doc.toString();
      if (mode === 'full') { area.className = 'history-preview'; area.textContent = chosen.content; legend.textContent = ''; return; }
      const ops = hunks(diffLines(chosen.content, current), 3);
      const added = ops.filter(o => o.type === 'add').length, removed = ops.filter(o => o.type === 'del').length;
      legend.textContent = added || removed ? `− ${removed} line${removed === 1 ? '' : 's'} only in this version · + ${added} only in the current file` : 'Identical to the current file.';
      area.className = 'history-preview diff';
      area.replaceChildren(...ops.map(o => o.type === 'skip' ? h('div', {class: 'diff-skip'}, `⋯ ${o.count} unchanged line${o.count === 1 ? '' : 's'}`)
        : h('div', {class: `diff-${o.type}`}, h('span', {class: 'diff-mark'}, o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' '), o.line || ' ')));
    }
    const list = h('div', {class: 'history-list'}, revisions.map((r, i) => h('button', {type: 'button', class: 'history-item', onclick: async e => {
      list.querySelectorAll('.history-item').forEach(b => b.classList.toggle('selected', b === e.currentTarget));
      try { await contentOf(r); } catch (err) { toast(err.message, {kind: 'error'}); return; }
      chosen = r; restore.disabled = buf.readOnly || r.content === buf.state.doc.toString();
      show();
    }}, h('strong', {}, new Date(r.created).toLocaleString()), h('span', {}, r.author || ''), i === 0 ? h('span', {class: 'pill'}, 'latest') : null)));
    const d = dialog({title: `History · ${fileOf(buf.id)?.label || buf.path}`, wide: true,
      body: h('div', {class: 'history'}, list, h('div', {class: 'history-side'}, h('div', {class: 'history-bar'}, modes, legend), area, h('div', {class: 'dialog-actions'}, restore)))});
    list.querySelector('.history-item')?.click();
  }

  // -------------------------------------------------------------- builds --
  let buildToken = 0;
  async function loadBuilds(options = {}) {
    const main = S.main, token = ++buildToken;
    if (!main) { S.build = {latest: null, pdf: null}; showPdf(); renderPdf(); return; }
    let b;
    try { b = await backend.builds(main, options); } catch (e) { if (!options.quiet) toast(e.message, {kind: 'error'}); return; }
    if (token !== buildToken || main !== S.main) return;
    S.build = {latest: b.latest || null, pdf: b.pdf || null};
    const latest = S.build.latest;
    // The TeX log is the most complete; latexmk's output adds BibTeX's messages.
    const before = S.problemsFor;
    if (latest && latest.status !== 'running') S.problems = parseLog(latest.texLog ? `${latest.log || ''}\n${latest.texLog}` : latest.log || '');
    else if (!latest) S.problems = [];
    S.problemsFor = latest?.id;
    showPdf();
    renderTop(); renderPdf();
    if (before !== S.problemsFor && cur()) relint(view); // compile errors in the gutter
  }
  function showPdf() {
    const p = S.build.pdf;
    if ((p?.id || null) === S.shownPdf) return;
    S.shownPdf = p?.id || null;
    if (p?.pdfUrl) void pdf.open(p.pdfUrl); else pdf.close();
  }
  async function compile({clean = false, auto = false} = {}) {
    if (!S.main || S.compiling || !caps.compile || S.build.latest?.status === 'running') return;
    S.compiling = true;
    renderTop(); renderPdfStatus();
    try {
      await saveAll();
      const options = {};
      if (settings.engine !== 'auto' && caps.engines?.includes(settings.engine)) options.engine = settings.engine;
      if (settings.draft && caps.draft) options.draft = true;
      if (settings.haltOnError && caps.haltOnError) options.haltOnError = true;
      if (clean && caps.clean) options.clean = true;
      const started = await backend.compile(S.main, options);
      for (let i = 0; i < 900; i++) {
        await sleep(i < 20 ? 400 : 1000);
        await loadBuilds({fresh: true, quiet: true});
        const l = S.build.latest;
        if (l && l.id === started.id && l.status !== 'running') break;
      }
      const l = S.build.latest;
      if (!auto && l && l.status !== 'succeeded' && S.problems.some(p => p.level === 'error')) { S.drawer = true; S.drawerTab = 'problems'; }
      else if (!auto && l && l.status !== 'succeeded' && l.status !== 'running' && !S.problems.length) { S.drawer = true; S.drawerTab = 'log'; }
    } catch (e) { if (!auto) toast(e.message, {kind: 'error'}); }
    finally { S.compiling = false; renderTop(); renderPdf(); if (stale()) scheduleAuto(); }
  }
  // Auto compile: a few seconds after typing stops, if the PDF is out of date.
  const scheduleAuto = debounce(() => {
    if (settings.autoCompile && S.main && caps.compile && !S.compiling && S.build.latest?.status !== 'running' && stale()) void compile({auto: true});
  }, 2500);
  async function stop() {
    const l = S.build.latest;
    if (l?.status === 'running') try { await backend.cancel(l.id); } catch (e) { toast(e.message, {kind: 'error'}); }
  }
  // A PDF is stale when any input it was built from has changed since.
  function stale() {
    const p = S.build.pdf;
    if (!p) return false;
    for (const [id, rev] of Object.entries(p.inputs || {})) { const f = fileOf(id); if (f && f.revision !== rev) return true; }
    return [...S.buffers.values()].some(b => (b.kind === 'tex' || b.kind === 'bib') && isDirty(b));
  }

  // Compile problems located in one file, for its gutter.
  function problemsFor(id) {
    const base = dirname(fileOf(S.main)?.path || '');
    return S.problems.filter(p => p.line && matchFile(p.file, S.files, base)?.id === id);
  }

  // ⌘-click: \ref → its \label, \cite → its bibliography entry, \input → the file.
  async function navigate(ref) {
    const idx = getIndex(), byName = name => S.files.find(f => (f.label || f.path) === name || f.path === name);
    if (ref.type === 'ref' || ref.type === 'cite') {
      const target = ref.type === 'ref' ? idx.labels.get(ref.name) : idx.cites.get(ref.name);
      if (!target) { toast(ref.type === 'ref' ? `There is no \\label{${ref.name}} in this project.` : `There is no bibliography entry ${ref.name}.`); return; }
      const f = byName(target.file);
      if (f) await open(f.id, {line: target.line});
      return;
    }
    if (ref.type === 'label') return;
    const bases = [...new Set([dirname(fileOf(S.main)?.path || ''), dirname(cur()?.path || ''), ''])];
    const names = ref.type === 'package' ? [`${ref.name}.sty`, `${ref.name}.cls`] :
      [ref.name, ...['.tex', '.bib', '.pdf', '.png', '.jpg', '.jpeg', '.eps', '.svg'].map(ext => ref.name + ext)];
    for (const base of bases) for (const name of names) {
      const full = base ? `${base}/${name}` : name;
      const f = S.files.find(f => f.path === full || (f.label || f.path) === full);
      if (f) { await open(f.id); return; }
    }
    if (ref.type !== 'package') toast(`${ref.name} is not a file in this project.`);
  }

  // The real folder path for a folder shown in the tree (hosts may shorten paths).
  function realFolder(shown) {
    const inside = S.files.find(f => (f.label || f.path).startsWith(shown + '/'));
    return inside ? inside.path.slice(0, inside.path.length - (inside.label || inside.path).length) + shown : shown;
  }
  async function moveTo(id, folder) {
    const f = fileOf(id);
    if (!f || f.readOnly || f.group === 'shared' || !caps.rename) return;
    const name = f.path.split('/').pop(), prefix = folder ? realFolder(folder) : f.path.slice(0, f.path.length - (f.label || f.path).length).replace(/\/$/, '');
    const to = prefix ? `${prefix}/${name}` : name;
    if (to === f.path) return;
    if (S.files.some(x => x.path === to)) { toast(`${to} already exists.`, {kind: 'error'}); return; }
    await rename(id, to);
  }
  async function remove(id) {
    const f = fileOf(id);
    if (!f || !caps.remove) return;
    if (!(await confirmDialog({title: 'Delete file?', message: `Move ${f.label || f.path} to the Trash? You can restore it from there.`, confirm: 'Move to Trash', danger: true}))) return;
    try {
      const buf = S.buffers.get(id);
      if (buf) { clearTimeout(buf.timer); writeDraft.cancel(); store.remove(buf.draftKey); S.buffers.delete(id); }
      if (S.current === id) { S.current = null; view.setState(makeState('', {kind: 'text', readOnly: true})); }
      await backend.remove(id);
      toast(`Moved ${f.label || f.path} to the Trash.`, {kind: 'ok'});
      await refreshFiles();
    } catch (e) { toast(e.message, {kind: 'error'}); }
  }

  // A pasted or dropped image is saved under figures/ and a figure inserted.
  async function pasteImages(files, v) {
    const base = dirname(fileOf(S.main)?.path || '');
    for (const file of files) {
      const ext = {'image/jpeg': 'jpg', 'image/svg+xml': 'svg'}[file.type] || file.type.split('/')[1];
      const stem = (file.name && file.name !== 'image.png' ? file.name.replace(/\.[^.]+$/, '') : `pasted-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`).replace(/[^\w.-]+/g, '-');
      let rel = `figures/${stem}.${ext}`;
      for (let n = 2; S.files.some(f => f.path === (base ? `${base}/${rel}` : rel)); n++) rel = `figures/${stem}-${n}.${ext}`;
      try {
        await backend.create(base ? `${base}/${rel}` : rel, {base64: await base64(file)});
        insertSnippet(v, `\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.6\\linewidth]{${rel}}\n  \\caption{\${Caption}}\n  \\label{fig:\${${stem.replace(/[^\w-]/g, '')}}}\n\\end{figure}\n`);
        toast(`Saved ${rel}.`, {kind: 'ok'});
      } catch (e) { toast(e.message, {kind: 'error'}); }
    }
    await refreshFiles();
  }

  // Every editable file's text, for project search.
  async function searchableFiles() {
    await loadTexts();
    return S.files.filter(f => editable(f.kind) && !f.binary).map(f => ({id: f.id, path: f.path, label: f.label || f.path, text: textOf(f.id)}))
      .filter(f => typeof f.text === 'string');
  }
  function setSideMode(mode) {
    S.sideMode = mode;
    if (!S.showFiles) { S.showFiles = true; setPref('files', true); renderFrame(); }
    els.filesBox.hidden = mode !== 'files';
    search.el.hidden = mode !== 'search';
    els.sideTitle.textContent = mode === 'search' ? 'Search' : 'Files';
    els.searchToggle.setAttribute('aria-pressed', String(mode === 'search'));
    if (mode === 'search') search.focus();
  }

  // --------------------------------------------------------------- menus --
  const engineNames = {pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX'};
  function compileMenu(anchor) {
    const set = (k, v) => () => { settings[k] = v; saveSettings(); renderTop(); };
    const engines = caps.engines || [];
    menu(anchor, [
      {header: 'Auto compile'},
      {label: 'On', checked: settings.autoCompile, onClick: set('autoCompile', true)},
      {label: 'Off', checked: !settings.autoCompile, onClick: set('autoCompile', false)},
      ...(caps.draft ? [{separator: true}, {header: 'Compile mode'},
        {label: 'Normal', checked: !settings.draft, onClick: set('draft', false)},
        {label: 'Fast [draft]', hint: 'images as boxes', checked: settings.draft, onClick: set('draft', true)}] : []),
      ...(caps.haltOnError ? [{separator: true}, {header: 'Compile error handling'},
        {label: 'Try to compile despite errors', checked: !settings.haltOnError, onClick: set('haltOnError', false)},
        {label: 'Stop on first error', checked: settings.haltOnError, onClick: set('haltOnError', true)}] : []),
      ...(engines.length > 1 ? [{separator: true}, {header: 'Compiler'},
        {label: 'From the document', hint: '% !TEX program', checked: settings.engine === 'auto', onClick: set('engine', 'auto')},
        ...engines.map(e => ({label: engineNames[e] || e, checked: settings.engine === e, onClick: set('engine', e)}))] : []),
      {separator: true},
      {label: 'Stop compilation', disabled: S.build.latest?.status !== 'running', onClick: () => stop()},
      caps.clean ? {label: 'Recompile from scratch', hint: 'clears cached files', onClick: () => compile({clean: true})} : null,
    ]);
  }
  function mainMenu(anchor) {
    const zip = backend.zipUrl?.() || info.zipUrl, p = S.build.pdf;
    menu(anchor, [
      {header: 'Download'},
      zip ? {label: 'Source (.zip)', onClick: () => downloadUrl(zip)} : null,
      {label: 'PDF', disabled: !p?.pdfUrl, onClick: () => downloadUrl(p.pdfUrl, `${(fileOf(S.main)?.path || 'document').split('/').pop().replace(/\.tex$/i, '')}.pdf`)},
      {separator: true}, {header: 'Actions'},
      {label: 'Word count', disabled: !S.main, onClick: () => void wordCount()},
      {label: 'Search in project', hint: `${mod}⇧F`, onClick: () => setSideMode('search')},
      {label: 'File outline', checked: S.outlineOpen, onClick: () => outline.el.querySelector('.panel-head').click()},
      {separator: true},
      {label: 'Settings…', onClick: () => settingsDialog()},
      {label: 'Keyboard shortcuts', onClick: () => shortcuts()},
    ], {align: 'right'});
  }
  function renderDocuments() {
    if (!els.docSelect || !documents) return;
    replace(els.docSelect,
      documents.options.map(o => h('option', {value: o.value}, o.label)),
      h('option', {disabled: true}, '──────────'),
      h('option', {value: '', 'data-action': 'new-document'}, 'New document…'),
      documents.canMove ? h('option', {value: '', 'data-action': 'move-document', title: 'Make this a folder document, like new ones'}, 'Move into a folder…') : null);
    els.docSelect.value = documents.current;
  }
  async function pickDocument(select) {
    const action = select.selectedOptions[0]?.dataset.action, value = select.value;
    select.value = documents.current;
    try {
      if (action) await backend.action(action);
      else if (value !== documents.current) {
        await saveAll(); // the other document's editor replaces this one
        await backend.action('document', value);
      }
    } catch (e) { toast(e.message, {kind: 'error'}); }
  }
  function downloadUrl(url, name) {
    const a = h('a', {href: url, download: name || ''});
    document.body.append(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------ settings --
  const LINE_HEIGHTS = {compact: '1.35', normal: '1.6', wide: '1.9'};
  function applySettings() {
    const html = document.documentElement;
    if (settings.theme === 'system' && !embedded) delete html.dataset.theme;
    else html.dataset.theme = settings.theme === 'system' ? 'light' : settings.theme;
    root.style.setProperty('--editor-size', `${settings.fontSize}px`);
    root.style.setProperty('--editor-line', LINE_HEIGHTS[settings.lineHeight] || '1.6');
    els.pdfWrap.classList.toggle('pdf-dark', !!settings.pdfDark);
    for (const buf of S.buffers.values()) {
      const spec = settingsEffects(settings, buf.kind, getIndex);
      if (buf.id === S.current) { view.dispatch(spec); buf.state = view.state; }
      else buf.state = buf.state.update(spec).state;
    }
    if (cur()) { relint(view); view.dispatch({effects: refreshPreview.of(null)}); }
    saveSettings();
  }
  function settingsDialog() {
    const change = (k, v) => { settings[k] = v; applySettings(); renderTop(); };
    const select = (k, options, number = false) => {
      const el = h('select', {class: 'select', onchange: e => change(k, number ? Number(e.target.value) : e.target.value)}, options.map(([v, label]) => h('option', {value: String(v)}, label)));
      el.value = String(settings[k]);
      return el;
    };
    const toggle = k => { const el = h('input', {type: 'checkbox', class: 'switch', onchange: e => change(k, e.target.checked)}); el.checked = !!settings[k]; return el; };
    const row = (label, control, hint) => h('label', {class: 'setting'}, h('span', {}, label, hint ? h('small', {}, hint) : null), control);
    const engines = caps.engines || [];
    dialog({title: 'Settings', body: h('div', {class: 'settings'},
      engines.length > 1 || caps.draft ? h('h3', {}, 'Compiler') : null,
      engines.length > 1 ? row('Compiler', select('engine', [['auto', 'From the document'], ...engines.map(e => [e, engineNames[e] || e])]), 'A “% !TEX program = …” line in the main file also works.') : null,
      caps.draft ? row('Fast draft mode', toggle('draft'), 'Images become boxes; compiles faster.') : null,
      row('Auto compile', toggle('autoCompile'), 'Recompile a few seconds after you stop typing.'),
      h('h3', {}, 'Editor'),
      row('Autocomplete', toggle('complete'), 'Commands, environments, labels, citations, files.'),
      row('Auto-close brackets', toggle('brackets')),
      row('Code check', toggle('check'), 'Flags mismatched environments, braces and math.'),
      row('Equation preview', toggle('preview'), 'Shows rendered math while the cursor is in it.'),
      row('Spell check', toggle('spell'), 'Uses your browser’s dictionary.'),
      row('Wrap long lines', toggle('wrap')),
      h('h3', {}, 'Appearance'),
      row('Theme', select('theme', [['system', embedded ? 'Light (host)' : 'Match system'], ['light', 'Light'], ['dark', 'Dark']])),
      row('Font size', select('fontSize', [10, 11, 12, 13, 14, 15, 16, 18, 20, 24].map(n => [n, `${n}px`]), true)),
      row('Line height', select('lineHeight', [['compact', 'Compact'], ['normal', 'Normal'], ['wide', 'Wide']])),
      row('Dark PDF', toggle('pdfDark'), 'Inverts the PDF colors for night reading.'))});
  }

  // Overleaf's Word Count: texcount when the backend has it, else an estimate.
  async function wordCount() {
    try { await saveAll(); } catch {}
    let r = null;
    if (caps.wordCount && backend.wordCount) try { r = await backend.wordCount(S.main); } catch (e) { toast(e.message, {kind: 'error'}); }
    if (!r) r = estimateWords();
    const rows = [['Total words', r.total ?? r.words + r.headers + r.captions], ['Words in text', r.words], ['Words in headings', r.headers],
      ['Words in captions and floats', r.captions], ['Headings', r.headings], ['Figures and tables', r.floats],
      ['Inline equations', r.mathInline], ['Displayed equations', r.mathDisplay], ['Files counted', r.files]];
    dialog({title: `Word count · ${fileOf(S.main)?.label || fileOf(S.main)?.path || ''}`, body: h('div', {},
      h('table', {class: 'keys counts'}, rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {class: 'num'}, String(v ?? '–'))))),
      r.estimated ? h('p', {class: 'hint'}, 'Estimated from the main document and the files it inputs.') : h('p', {class: 'hint'}, 'Counted with texcount, including \\input and \\include files.'))});
  }
  function estimateWords() {
    const seen = new Set(), base = dirname(fileOf(S.main)?.path || '');
    const r = {words: 0, headers: 0, captions: 0, headings: 0, floats: 0, mathInline: 0, mathDisplay: 0, files: 0, estimated: true};
    const visit = id => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const text = textOf(id);
      if (typeof text !== 'string') return;
      r.files++;
      let src = blankComments(text);
      const body = src.indexOf('\\begin{document}');
      if (body >= 0) src = src.slice(body);
      for (const m of src.matchAll(/\\(?:input|include|subfile)\s*\{([^{}]+)\}/g)) {
        const name = m[1].trim(), f = S.files.find(f => [name, `${name}.tex`].some(n => f.path === n || f.path === (base ? `${base}/${n}` : n)));
        if (f) visit(f.id);
      }
      for (const item of outlineOf(src)) { r.headings++; r.headers += words(item.title); }
      r.floats += (src.match(/\\begin\{(figure|table)\*?\}/g) || []).length;
      for (const m of src.matchAll(/\\caption\s*\{([^{}]*)\}/g)) r.captions += words(m[1]);
      r.mathDisplay += (src.match(/\\\[|\$\$|\\begin\{(equation|align|gather|multline|eqnarray)\*?\}/g) || []).length;
      const prose = src.replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|eqnarray)(\*?)\}[\s\S]*?\\end\{\1\2\}/g, ' ');
      r.mathInline += (prose.match(/\$[^$]+\$|\\\(/g) || []).length;
      const plain = prose.replace(/\$[^$]*\$|\\\([\s\S]*?\\\)/g, ' ').replace(/\\(part|chapter|(sub)*section|paragraph|caption|label|ref|eqref|cite\w*|input|include|usepackage|documentclass|begin|end|bibliography\w*)\*?(\[[^\]]*\])?\{[^{}]*\}/g, ' ');
      r.words += words(plain);
    };
    visit(S.main);
    r.total = r.words + r.headers + r.captions;
    return r;
  }

  // ------------------------------------------------------------- SyncTeX --
  const pdf = new PdfView(els.pdfBody, {
    onState: () => renderPdfControls(),
    onPoint: async point => {
      const p = S.build.pdf;
      if (!S.syncClicks || !p?.sync?.toSource) return;
      try {
        const r = await backend.toSource(p.id, point);
        if (S.layout === 'pdf') setLayout('split');
        await open(r.id, {line: r.line});
        if (r.stale) toast('This PDF was built from an earlier version of the file, so the line may have moved. Recompile to update it.');
      } catch (e) { toast(e.message, {kind: 'error'}); }
    },
  });
  async function locate() {
    const buf = cur(), p = S.build.pdf;
    if (!buf) return;
    if (!p?.sync?.toPdf) { toast(p ? 'Recompile to find source lines in this PDF.' : 'Compile first to find this line in the PDF.'); return; }
    const pos = view.state.selection.main.head, line = view.state.doc.lineAt(pos);
    if (S.layout === 'source') setLayout('split');
    try {
      const box = await backend.toPdf(p.id, buf.id, line.number, pos - line.from);
      if (!pdf.highlight(box)) toast('That part of the PDF is not ready yet. Try again in a moment.');
    } catch (e) { toast(e.message, {kind: 'error'}); }
  }

  // ------------------------------------------------------------ render --
  function setLayout(l) { S.layout = l; setPref('layout', l); renderFrame(); }
  function renderFrame() {
    root.dataset.layout = S.layout;
    root.dataset.files = S.showFiles ? 'on' : 'off';
    els.body.style.setProperty('--split', `${S.split}fr`);
    els.body.style.setProperty('--split-rest', `${1 - S.split}fr`);
    els.files.setAttribute('aria-pressed', String(S.showFiles));
    for (const b of els.layoutTabs.children) b.setAttribute('aria-selected', String(b.dataset.layout === S.layout));
  }
  function renderTop() {
    const candidates = mainCandidates();
    const options = candidates.length ? candidates : [];
    if (S.main && !options.some(f => f.id === S.main) && fileOf(S.main)) options.push(fileOf(S.main));
    replace(els.mainSelect, options.length ? options.map(f => h('option', {value: f.id}, `${f.label || f.path}${f.tag ? ` · ${f.tag}` : ''}`)) : h('option', {value: ''}, 'No main document'));
    els.mainSelect.value = S.main || '';
    els.mainSelect.disabled = !options.length;
    const running = S.compiling || S.build.latest?.status === 'running';
    replace(els.compile, icon(running ? 'loader' : 'play', 15, running ? 'spin' : ''), h('span', {}, running ? 'Compiling…' : 'Recompile'));
    els.compile.disabled = !S.main || running || !caps.compile;
    if (!caps.compile) els.compile.title = 'Compiling is not available here.';
    els.stop.hidden = S.build.latest?.status !== 'running';
  }
  function renderTreeOnly() {
    renderTree(els.tree, projectFiles(), {activeId: S.current || S.preview, mainId: S.main, isDirty: dirtyId, folds: S.folds,
      onToggle: path => { S.folds.has(path) ? S.folds.delete(path) : S.folds.add(path); setPref('folds', [...S.folds]); renderTreeOnly(); },
      onOpen: id => void open(id), onRename: caps.rename ? id => void rename(id) : null, onDelete: caps.remove ? id => void remove(id) : null,
      onMove: caps.rename ? (id, folder) => void moveTo(id, folder) : null});
    if (!S.files.length) els.tree.replaceChildren(h('p', {class: 'tree-empty'}, 'No files yet.'));
    for (const b of S.buffers.values()) b.shownDirty = isDirty(b);
    const shared = sharedFiles();
    els.shared.hidden = !shared.length;
    replace(els.shared, h('small', {}, 'Project shared'), shared.map(f => fileRow({...f, name: f.label || f.path}, {active: f.id === S.current, dirty: dirtyId(f.id), onOpen: id => void open(id)})));
  }
  function renderSourceHead() {
    const buf = cur(), f = buf ? fileOf(buf.id) : S.preview ? fileOf(S.preview) : null;
    if (!f) { replace(els.sourceHead, icon('fileText', 15), h('strong', {}, 'No file open')); return; }
    const actions = [];
    if (buf) {
      if (caps.toPdf && (f.kind === 'tex')) actions.push(button({iconName: 'locate', title: `Show this line in the PDF (${mod}⌥J)`, cls: 'ghost icon-only sm', onClick: () => locate()}));
      if (caps.history && backend.history && !f.readOnly) actions.push(button({iconName: 'history', title: 'History', cls: 'ghost icon-only sm', onClick: () => history(buf)}));
      if (caps.rename && !f.readOnly && f.group !== 'shared') actions.push(button({iconName: 'move', title: 'Move or rename', cls: 'ghost icon-only sm', onClick: () => rename(buf.id)}));
      actions.push(button({iconName: 'download', title: 'Download this file', cls: 'ghost icon-only sm', onClick: () => download(buf)}));
      for (const a of info.fileActions || []) if (!f.readOnly || a.readOnly) actions.push(button({iconName: a.icon || 'message', label: a.label, title: a.label, cls: 'ghost sm', onClick: () => backend.action(a.id, buf.id)}));
    }
    replace(els.sourceHead, icon(f.kind === 'image' ? 'image' : f.icon || 'fileText', 15), h('strong', {class: 'path', title: f.path}, f.label || f.path),
      f.badge ? h('span', {class: 'pill linked'}, f.badge) : null, buf?.readOnly ? h('span', {class: 'pill'}, 'Read only') : null,
      f.tag ? h('span', {class: 'pill'}, f.tag) : null, h('div', {class: 'spacer'}), actions);
  }
  function renderBanners() {
    const buf = cur(), f = buf ? fileOf(buf.id) : null, out = [];
    if (buf?.conflict) out.push(h('div', {class: 'banner warn'}, icon('alert', 15),
      h('span', {}, `${f?.label || buf.path} was changed elsewhere while you were editing.`),
      buf.conflict.content !== null ? h('button', {class: 'btn sm', onclick: () => dialog({title: 'The other version', wide: true, body: h('pre', {class: 'history-preview tall'}, buf.conflict.content)})}, 'View theirs') : null,
      h('button', {class: 'btn sm', onclick: () => { if (buf.conflict.content !== null) applyOutside(buf, buf.conflict.content, buf.conflict.revision); store.remove(buf.draftKey); renderAll(); }}, 'Use theirs'),
      h('button', {class: 'btn sm primary', onclick: () => { buf.revision = buf.conflict.revision; buf.conflict = null; void save(buf); }}, 'Keep mine')));
    if (buf?.draftConflict) out.push(h('div', {class: 'banner warn'}, icon('history', 15),
      h('span', {}, 'This browser kept unsaved changes made to an earlier version of this file.'),
      h('button', {class: 'btn sm', onclick: () => dialog({title: 'Unsaved changes', wide: true, body: h('pre', {class: 'history-preview tall'}, buf.draftConflict.content)})}, 'View'),
      h('button', {class: 'btn sm', onclick: () => { buf.draftConflict = null; store.remove(buf.draftKey); renderAll(); }}, 'Discard'),
      h('button', {class: 'btn sm primary', onclick: () => { const t = buf.draftConflict.content; buf.draftConflict = null; void setEditorText(buf, t).then(renderAll); }}, 'Restore')));
    if (buf?.error && isDirty(buf)) out.push(h('div', {class: 'banner error'}, icon('alert', 15), h('span', {}, `Not saved: ${buf.error}`), h('button', {class: 'btn sm', onclick: () => { buf.error = null; void save(buf); }}, 'Retry')));
    if (buf?.notice) out.push(h('div', {class: 'banner info'}, icon('info', 15), h('span', {}, buf.notice), h('button', {class: 'btn ghost icon-only sm', 'aria-label': 'Dismiss', onclick: () => { buf.notice = null; renderBanners(); }}, icon('x', 13))));
    if (f?.note) out.push(h('div', {class: 'banner info'}, icon('info', 15), h('span', {}, f.note), (f.actions || []).map(a => h('button', {class: 'btn sm', onclick: () => backend.action(a.id, f.id)}, a.label))));
    for (const w of f?.warnings || []) out.push(h('div', {class: 'banner warn'}, icon('alert', 15), h('span', {}, w)));
    replace(els.banners, out);
  }
  function renderSaveState(text) {
    const buf = cur();
    let label = '', cls = '';
    if (!buf) label = '';
    else if (buf.readOnly) label = 'Read only';
    else if (buf.conflict) { label = 'Changed elsewhere'; cls = 'warn'; }
    else if (buf.saving) label = 'Saving…';
    else if (isDirty(buf)) { label = buf.error ? 'Not saved' : 'Unsaved changes'; cls = buf.error ? 'error' : ''; }
    else label = text || 'Saved';
    els.saveState ||= h('span', {class: 'save-state'});
    els.saveState.className = `save-state ${cls}`;
    els.saveState.textContent = label;
  }
  function renderCursor() {
    const buf = cur();
    els.cursor ||= h('span', {class: 'cursor-pos'});
    els.words ||= h('span', {class: 'word-count'});
    if (!buf) { els.cursor.textContent = ''; els.words.textContent = ''; return; }
    const pos = view.state.selection.main.head, line = view.state.doc.lineAt(pos);
    els.cursor.textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;
    clearTimeout(renderCursor.t);
    renderCursor.t = setTimeout(() => { if (cur() === buf) els.words.textContent = buf.kind === 'tex' ? `${words(view.state.doc.toString()).toLocaleString()} words` : ''; }, 300);
  }
  function renderSource() {
    const buf = cur(), f = S.preview ? fileOf(S.preview) : null;
    els.cm.hidden = !buf;
    els.preview.hidden = !f;
    if (f) replace(els.preview, h('img', {src: backend.rawUrl(f.id), alt: f.path}));
    els.sourceEmpty.hidden = !!(buf || f);
    if (!buf && !f) replace(els.sourceEmpty, icon('fileText', 30), h('h3', {}, S.files.length ? 'Choose a file' : 'Start a document'),
      h('p', {}, S.files.length ? 'Pick a file on the left to edit it. Source and PDF stay side by side.' : 'Create main.tex to begin writing.'),
      caps.create && !S.files.some(f => f.kind === 'tex') ? h('button', {class: 'btn primary', onclick: () => newFile()}, icon('filePlus', 15), h('span', {}, 'New file')) : null);
    renderSourceHead(); renderBanners(); renderSaveState(); renderCursor();
    replace(els.status, els.saveState, h('span', {class: 'spacer'}), els.cursor, els.words);
  }
  function renderPdfStatus() {
    els.chip ||= h('span', {class: 'chip'});
    const l = S.build.latest, p = S.build.pdf, running = S.compiling || l?.status === 'running';
    let text = '', cls = '';
    if (running) { text = 'Compiling…'; cls = 'busy'; }
    else if (l && l.status !== 'succeeded' && l.id !== p?.id) { text = {canceled: 'Stopped', timed_out: 'Timed out', storage_limit: 'Output too large', output_limit: 'Log too long', interrupted: 'Interrupted'}[l.status] || (p ? 'Build failed · showing the last PDF' : 'Build failed'); cls = 'bad'; }
    else if (p && p.status === 'failed') { text = stale() ? 'Compiled with errors · out of date' : 'Compiled with errors'; cls = 'bad'; }
    else if (p && stale()) { text = `Out of date · ${mod}↩ to recompile`; cls = 'stale'; }
    else if (p) { text = `Up to date · ${timeOf(p.finished || p.created)}`; cls = 'ok'; }
    els.chip.className = `chip ${cls}`;
    els.chip.textContent = text;
    els.chip.hidden = !text;
  }
  function renderPdfControls() {
    const st = pdf.state, on = !!st.pages;
    els.pageInput ||= h('input', {class: 'page-input', inputmode: 'numeric', 'aria-label': 'Page number',
      onchange: e => pdf.goto(Number(e.target.value) || 1), onkeydown: e => { if (e.key === 'Enter') pdf.goto(Number(e.target.value) || 1); }});
    if (document.activeElement !== els.pageInput) els.pageInput.value = on ? String(st.page) : '';
    els.pageCount ||= h('span', {class: 'page-count'});
    els.pageCount.textContent = on ? `/ ${st.pages}` : '';
    els.zoomLabel ||= h('button', {type: 'button', class: 'btn ghost sm zoom', title: 'Zoom', 'aria-haspopup': 'menu', onclick: e => menu(e.currentTarget, [
      {label: 'Fit to width', checked: pdf.fit === 'page-width', onClick: () => pdf.fitWidth()},
      {label: 'Fit to page', checked: pdf.fit === 'page-fit', onClick: () => pdf.fitPage()},
      {separator: true},
      ...[50, 75, 100, 125, 150, 200, 300].map(z => ({label: `${z}%`, checked: !pdf.fit && pdf.state.zoom === z, onClick: () => pdf.setZoom(z)})),
    ])});
    els.zoomLabel.textContent = on ? `${st.zoom}%` : '–';
    els.pdfControls ||= h('div', {class: 'pdf-controls'},
      button({iconName: 'left', title: 'Previous page', cls: 'ghost icon-only sm', onClick: () => pdf.goto(pdf.state.page - 1)}),
      els.pageInput, els.pageCount,
      button({iconName: 'right', title: 'Next page', cls: 'ghost icon-only sm', onClick: () => pdf.goto(pdf.state.page + 1)}),
      h('span', {class: 'sep'}),
      button({iconName: 'minus', title: 'Zoom out', cls: 'ghost icon-only sm', onClick: () => pdf.zoom(1 / 1.15)}),
      els.zoomLabel,
      button({iconName: 'plus', title: 'Zoom in', cls: 'ghost icon-only sm', onClick: () => pdf.zoom(1.15)}));
    els.pdfControls.classList.toggle('off', !on);
    if (els.findCount) els.findCount.textContent = st.matches ? (st.matches.total ? `${st.matches.current} of ${st.matches.total}` : 'No matches') : '';
    const p = S.build.pdf;
    els.pdfMessage.hidden = !(st.loading && !on) && !st.error && !!p;
    if (st.error) replace(els.pdfMessage, icon('alert', 24), h('p', {}, st.error), h('button', {class: 'btn', onclick: () => { S.shownPdf = null; showPdf(); }}, 'Reload'));
    else if (st.loading && !on) replace(els.pdfMessage, icon('loader', 22, 'spin'), h('p', {}, 'Loading PDF…'));
    else if (!p) replace(els.pdfMessage, icon('book', 32), h('h3', {}, 'Your document, typeset.'),
      h('p', {}, !caps.compile ? 'Compiling is not available here.' : S.main ? `Compile ${fileOf(S.main)?.label || 'the main document'} to see its PDF here.` : 'Choose or create a main document to begin.'),
      S.main && caps.compile ? h('button', {class: 'btn primary', disabled: S.compiling, onclick: () => compile()}, icon('play', 14), h('span', {}, 'Compile')) : null);
  }
  function renderPdf() {
    renderPdfStatus();
    renderPdfControls();
    const p = S.build.pdf;
    const sync = caps.toSource && p?.sync?.toSource;
    replace(els.pdfHead, icon('book', 15), h('strong', {class: 'path'}, S.main ? fileOf(S.main)?.label || '' : 'PDF'), els.chip,
      h('div', {class: 'spacer'}), els.pdfControls,
      p?.pdfUrl ? button({iconName: 'search', title: 'Search the PDF', cls: 'ghost icon-only sm', pressed: S.pdfSearch, onClick: () => togglePdfSearch()}) : null,
      sync ? button({iconName: 'pointer', title: S.syncClicks ? 'Clicking the PDF opens the source (on)' : 'Clicking the PDF opens the source (off)', cls: 'ghost icon-only sm', pressed: S.syncClicks,
        onClick: () => { S.syncClicks = !S.syncClicks; setPref('sync', S.syncClicks); renderPdf(); }}) : null,
      p?.pdfUrl ? h('a', {class: 'btn ghost icon-only sm', href: p.pdfUrl, download: `${(fileOf(S.main)?.path || 'document').split('/').pop().replace(/\.tex$/i, '')}.pdf`, title: 'Download PDF', 'aria-label': 'Download PDF'}, icon('download', 15)) : null,
      p?.pdfUrl ? h('button', {type: 'button', class: 'btn ghost icon-only sm', title: 'More PDF options', 'aria-label': 'More PDF options', 'aria-haspopup': 'menu', onclick: e => menu(e.currentTarget, [
        {label: 'Presentation mode', hint: 'full screen', onClick: () => void pdf.present(els.pdfWrap)},
        {label: 'Dark PDF', checked: settings.pdfDark, onClick: () => { settings.pdfDark = !settings.pdfDark; applySettings(); }},
        {label: 'Open in a new tab', onClick: () => window.open(p.pdfUrl, '_blank', 'noopener')},
      ], {align: 'right'})}, icon('menu', 15)) : null);
    renderDrawer();
  }
  // Search inside the PDF (pdf.js find), Enter for next, ⇧Enter for previous.
  function togglePdfSearch(on = !S.pdfSearch) {
    S.pdfSearch = on;
    els.pdfFind.hidden = !on;
    if (!els.findInput) {
      els.findInput = h('input', {type: 'search', placeholder: 'Search the PDF', 'aria-label': 'Search the PDF',
        oninput: debounce(e => pdf.find(e.target.value), 200),
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); pdf.find(e.target.value, {again: true, previous: e.shiftKey}); } else if (e.key === 'Escape') togglePdfSearch(false); }});
      els.findCount = h('span', {class: 'find-count'});
      replace(els.pdfFind, icon('search', 14), els.findInput, els.findCount,
        button({iconName: 'up', title: 'Previous match', cls: 'ghost icon-only sm', onClick: () => pdf.find(els.findInput.value, {again: true, previous: true})}),
        button({iconName: 'down', title: 'Next match', cls: 'ghost icon-only sm', onClick: () => pdf.find(els.findInput.value, {again: true})}),
        button({iconName: 'x', title: 'Close search', cls: 'ghost icon-only sm', onClick: () => togglePdfSearch(false)}));
    }
    if (on) { els.findInput.focus(); els.findInput.select(); if (els.findInput.value) pdf.find(els.findInput.value); }
    else pdf.find('');
    renderPdf();
  }
  function renderDrawer() {
    const l = S.build.latest;
    els.drawer.hidden = !l;
    if (!l) return;
    const n = level => S.problems.filter(p => p.level === level).length;
    const counts = [['error', n('error'), 'error'], ['warning', n('warning'), 'alert'], ['badbox', n('badbox'), 'box']];
    const tab = (id, label) => h('button', {type: 'button', role: 'tab', 'aria-selected': String(S.drawerTab === id), onclick: e => { e.stopPropagation(); S.drawerTab = id; S.drawer = true; setPref('drawer', true); renderDrawer(); }}, label);
    const head = h('div', {class: 'drawer-head', role: 'button', tabindex: '0', 'aria-expanded': String(S.drawer),
      onclick: () => { S.drawer = !S.drawer; setPref('drawer', S.drawer); renderDrawer(); },
      onkeydown: e => { if (e.key === 'Enter') e.currentTarget.click(); }},
      icon(S.drawer ? 'down' : 'right', 13),
      l.status === 'running' ? h('span', {class: 'count'}, icon('loader', 13, 'spin'), 'Compiling') :
        counts.map(([level, count, ic]) => h('span', {class: `count ${level} ${count ? '' : 'zero'}`, title: `${count} ${level === 'badbox' ? 'bad boxes' : level + 's'}`}, icon(ic, 13), String(count))),
      h('div', {class: 'spacer'}), h('div', {class: 'segmented small', role: 'tablist'}, tab('problems', 'Problems'), tab('log', 'Log'),
        l.files?.length ? tab('files', 'Files') : null));
    let body = null;
    if (S.drawer) {
      if (S.drawerTab === 'files' && l.files?.length) body = h('ul', {class: 'output-files'}, l.files.map(f => h('li', {},
        h('a', {href: f.url, download: f.name}, icon(f.name.endsWith('.pdf') ? 'book' : 'fileText', 14), h('span', {}, f.name)), h('small', {}, `${Math.max(1, Math.round(f.size / 1024))} KB`))));
      else if (S.drawerTab === 'log' || l.status === 'running') body = h('pre', {class: 'raw-log'}, l.log || 'Starting…');
      else if (!S.problems.length) body = h('p', {class: 'no-problems'}, l.status === 'succeeded' ? 'No errors or warnings.' : 'No problems were recognized. See the log.');
      else body = h('ul', {class: 'problems'}, S.problems.map(p => {
        const f = matchFile(p.file, S.files, dirname(fileOf(S.main)?.path || ''));
        const where = f ? `${f.label || f.path}${p.line ? `:${p.line}` : ''}` : p.file ? `${p.file.replace(/^.*\//, '')}${p.line ? `:${p.line}` : ''}` : '';
        return h('li', {class: `problem ${p.level}`, title: p.detail || p.message},
          h('button', {type: 'button', disabled: !f, onclick: () => f && open(f.id, {line: p.line || undefined})},
            icon(p.level === 'error' ? 'error' : p.level === 'warning' ? 'alert' : 'box', 14),
            h('span', {class: 'msg'}, p.message), where ? h('span', {class: 'where'}, where) : null));
      }));
    }
    els.drawer.classList.toggle('open', S.drawer);
    replace(els.drawer, head, body);
  }
  function renderAll() { renderFrame(); renderTop(); renderTreeOnly(); renderSource(); renderPdf(); }

  function shortcuts() {
    const rows = [[`${mod}S or ${mod}↩`, 'Compile (saving is automatic)'], [`${mod}⌥J`, 'Show the current line in the PDF'],
      ['Click PDF', 'Open the source of that passage'], [`${mod}-click`, 'Go to a \\ref’s label, a \\cite’s entry, an \\input file'],
      [`${mod}B / ${mod}I`, 'Bold / italic'], [`${mod}/`, 'Toggle comment'], [`${mod}F`, 'Find and replace in this file'],
      [`${mod}⇧F`, 'Search the whole project'], [`${mod}⌥G`, 'Go to line'], ['Ctrl-Space', 'Complete commands, labels and citations'],
      ['Tab', 'Next field in an inserted figure or table'], [`${mod}Z / ${mod}⇧Z`, 'Undo / redo']];
    dialog({title: 'Keyboard shortcuts', body: h('table', {class: 'keys'}, rows.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v))))});
  }

  // ------------------------------------------------------------ events --
  els.splitter.addEventListener('pointerdown', e => {
    e.preventDefault();
    els.splitter.setPointerCapture(e.pointerId);
    const rect = sourcePane.getBoundingClientRect(), right = pdfPane.getBoundingClientRect().right;
    root.classList.add('resizing');
    const move = ev => { S.split = Math.max(0.2, Math.min(0.8, (ev.clientX - rect.left) / (right - rect.left))); renderFrame(); };
    const up = () => { els.splitter.removeEventListener('pointermove', move); root.classList.remove('resizing'); setPref('split', S.split); };
    els.splitter.addEventListener('pointermove', move);
    els.splitter.addEventListener('pointerup', up, {once: true});
  });
  els.splitter.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    S.split = Math.max(0.2, Math.min(0.8, S.split + (e.key === 'ArrowLeft' ? -0.04 : 0.04)));
    setPref('split', S.split); renderFrame();
  });
  addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.defaultPrevented) return;
    if (e.key === 'Enter') { e.preventDefault(); void compile(); }
    else if (e.key.toLowerCase() === 's' && !e.shiftKey) { e.preventDefault(); void compile(); }
    else if (e.key.toLowerCase() === 'f' && e.shiftKey) { e.preventDefault(); setSideMode('search'); }
    else if (e.code === 'KeyJ' && e.altKey) { e.preventDefault(); void locate(); }
  });
  // Keep work when the page goes away: drafts are written as you type, and
  // pending saves get one last chance.
  addEventListener('pagehide', () => { for (const b of S.buffers.values()) if (isDirty(b)) { writeDraft.flush(b); void save(b); } });
  if (!embedded) addEventListener('beforeunload', e => { if ([...S.buffers.values()].some(isDirty)) { e.preventDefault(); e.returnValue = ''; } });

  backend.subscribe((name, data) => {
    if (name === 'files') void refreshFiles(data?.files);
    else if (name === 'builds' && !S.compiling) void loadBuilds({quiet: true});
    else if (name === 'open' && data?.id) void open(data.id, {line: data.line});
    else if (name === 'documents' && data?.options && els.docSelect) { documents = data; renderDocuments(); }
  });

  // ------------------------------------------------------------- start --
  applySettings();
  renderFrame();
  renderDocuments();
  await refreshFiles();
  const first = [info.initialFile, pref('open', null), S.main].find(id => id && fileOf(id) && editable(fileOf(id).kind));
  if (first) await open(first, {focus: false});
  renderAll();
  void loadBuilds({quiet: true});
  backend.notify('ready');
}
