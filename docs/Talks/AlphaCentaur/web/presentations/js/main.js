// alphaPresent (alphaCentaur's slide editor) — editor shell: home screen, top bar, actions,
// keyboard, clipboard, files, present mode, and the undo/autosave loop.

import { app, currentSlide, findEl, selectedEls, setSelection, editCtx } from './state.js';
import {
  newDeck, normalizeDeck, normalizeElements, normalizeAssets, makeText, makeMath, makeImage, makeShape, makeEmbed, makeApplet, makeSlide, LAYOUTS,
  SHAPES, W, H, uid, clone, aabb, unionBox, textToHTML, slideTitle,
} from './model.js';
import { renderSlide, appletDoc, viewURL } from './render.js';
import { themeVars, googleFontURL } from './themes.js';
import { exportHTML, parseDeckHTML, inspectDeckHTML, stubHTML, fileNameFor, download, deckAsFolder } from './exporter.js';
import { HOST, onHost, toHost, writeHostDraft, hostRequest } from './host.js';
import { ctx as folderCtx, installHostFolder, folderMode, uploadAsset, pickFromProject, downloadFolderZip, saveToFolder, canPickFolders, deckFromFolder } from './folder.js';
import { listDecks, getDeck, putDeck, deleteDeck, canUseFiles, pickOpenFile, pickSaveFile, writeHandle } from './storage.js';
import { createHistory } from './history.js';
import { APPLETS } from './applets.js';
import * as canvas from './canvas.js';
import { initSlides, renderSlides, updateThumb, markCurrent, layoutPicker, duplicateSlide, deleteSlide } from './slides.js';
import { initInspector, renderInspector, syncGeometry, focusField, ensureFontHook } from './inspector.js';
import { h, icon, button, menu, menuButton, popover, popoverAt, closePopover, modal, confirmDialog, toast, kbd, select } from './ui.js';
import { sampleDeck } from './sample.js';
import { initRemotePreview, updateRemotePreview, setRemotePreview } from './remote-preview.js';
import { normalizeRemoteDeck } from './remote-model.js';
import { effectiveSetup } from './remote-setup.js';

const root = document.getElementById('app');
let ui = {};               // editor chrome references
let saveTimer = null, thumbTimer = null, fileDirty = false;

// ---------------------------------------------------------------- fonts --
const loadedFonts = new Set();
export function ensureFont(family) {
  if (!family || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const url = googleFontURL(family);
  if (url) document.head.append(h('link', { rel: 'stylesheet', href: url }));
}
ensureFontHook.fn = ensureFont;
function ensureDeckFonts(deck) {
  Object.values(deck.theme.fonts).forEach(ensureFont);
  for (const s of deck.slides) for (const e of s.elements) if (e.type === 'text' && e.font && !['heading', 'body', 'mono'].includes(e.font)) ensureFont(e.font);
}

// ------------------------------------------------------------- routing --
async function route() {
  closePopover();
  const id = new URLSearchParams(location.search).get('deck');
  if (id) {
    const rec = await getDeck(id).catch(() => null);
    if (rec) return openEditor(rec);
    toast('That presentation is no longer in this browser.', 'error');
  }
  showHome();
}
if (!HOST) addEventListener('popstate', route);
app.host = HOST;
const go = (id) => history.pushState(null, '', id ? `?deck=${encodeURIComponent(id)}` : location.pathname);

// ----------------------------------------------------------------- home --
async function showHome() {
  await flushSave();
  app.deck = null; app.record = null;
  document.title = 'alphaPresent';
  const decks = await listDecks().catch(() => []);
  const grid = h('div.home-grid');
  for (const rec of decks) grid.append(deckCard(rec));
  if (!decks.length) grid.append(h('div.home-empty', null, h('p', null, 'No presentations yet.'), h('p.hint', null, 'Start a new one, open the tour, or open an HTML file exported from here.')));
  root.className = 'home-mode';
  root.replaceChildren(h('div.home', null,
    h('header.home-head', null,
      h('div.brand', null, h('img.brand-mark', { src: 'icon.png', alt: '' }), h('span', null, 'alphaPresent'), h('span.brand-sub', null, 'alphaCentaur'))),
    h('section.home-hero', null,
      h('h1', null, 'Presentations'),
      h('p', null, 'Arrange text, LaTeX, images, shapes and live JavaScript applets on slides, then export one HTML file that runs as a fullPage.js deck.'),
      h('div.home-actions', null,
        h('button.btn.primary.lg', { type: 'button', onclick: () => createDeck(newDeck()) }, icon('plus'), h('span', null, 'New presentation')),
        h('button.btn.lg', { type: 'button', onclick: () => createDeck(sampleDeck()) }, icon('play'), h('span', null, 'Take the tour')),
        h('button.btn.lg', { type: 'button', onclick: openFile }, icon('file'), h('span', null, 'Open HTML…')))),
    decks.length ? h('h2.home-sub', null, 'Recent') : null,
    grid));
  // Thumbnails scale with their (fluid) card width.
  const fitThumbs = () => grid.querySelectorAll('.deck-thumb').forEach(t => { t.firstChild.style.transform = `scale(${t.clientWidth / W})`; });
  new ResizeObserver(fitThumbs).observe(grid);
  fitThumbs();
}

function deckCard(rec) {
  const d = normalizeDeck(rec.deck);
  const stage = h('div.pz-stage', { style: themeVars(d.theme) });
  stage.innerHTML = renderSlide(d.slides[0], { mode: 'thumb', deck: d, macros: {}, macroKey: 'home' });
  ensureDeckFonts(d);
  const open = () => { go(rec.id); openEditor(rec); };
  const more = h('button.btn.ghost.sm.card-more', { type: 'button', title: 'More', 'aria-label': 'More actions' }, icon('more', 16));
  more.addEventListener('click', e => {
    e.stopPropagation();
    popover(more, menu([
      { label: 'Open', icon: 'file', action: open },
      { label: 'Duplicate', icon: 'copy', action: async () => { const c = clone(d); c.id = uid('d'); c.title = d.title + ' (copy)'; await putDeck({ id: c.id, deck: c, title: c.title }); showHome(); } },
      { label: 'Download HTML', icon: 'download', action: async () => download(fileNameFor(d), await exportDeck(d)) },
      '-',
      { label: 'Delete', icon: 'trash', danger: true, action: async () => {
        if (await confirmDialog('Delete presentation?', `“${d.title}” will be removed from this browser. Exported HTML files are not affected.`)) { await deleteDeck(rec.id); showHome(); }
      } },
    ]), { align: 'end' });
  });
  return h('div.deck-card', { role: 'button', tabindex: '0', onclick: open, onkeydown: e => { if (e.key === 'Enter') open(); } },
    h('div.deck-thumb', null, h('div.thumb-scale', null, stage)),
    h('div.deck-meta', null,
      h('div', null, h('div.deck-title', null, d.title || 'Untitled'), h('div.deck-sub', null, `${d.slides.length} slide${d.slides.length === 1 ? '' : 's'} · ${ago(rec.updated)}`)),
      more));
}
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 3e7 ? 'numeric' : undefined });
}

async function createDeck(deck, handle = null) {
  const rec = { id: deck.id, title: deck.title, deck, handle };
  await putDeck(rec);
  go(rec.id);
  openEditor(rec);
}

// --------------------------------------------------------------- editor --
function openEditor(rec) {
  app.record = rec;
  app.deck = normalizeDeck(rec.deck);
  rec.deck = app.deck;
  app.slideIndex = 0; app.sel = new Set(); app.editingId = null; app.interactId = null;
  fileDirty = false;
  app.history = createHistory(() => app.deck, restored => {
    app.deck = { ...restored, assets: app.deck.assets };
    app.record.deck = app.deck;
    app.slideIndex = Math.min(app.slideIndex, app.deck.slides.length - 1);
    app.editingId = null; app.interactId = null;
    scheduleSave();
    refresh(['all']);
  });
  app.history.reset();
  ensureDeckFonts(app.deck);
  buildShell();
  canvas.fit();
  refresh(['all']);
}

// Swap in a different version of the deck without rebuilding the editor
// (alphaCentaur sends a new revision, e.g. after an AI collaborator's edit).
function replaceDeck(deck, keepSlideId) {
  canvas.finishEditing(); canvas.endInteract(); closePopover();
  app.deck = deck;
  app.record.deck = deck;
  const i = keepSlideId ? deck.slides.findIndex(s => s.id === keepSlideId) : -1;
  app.slideIndex = i >= 0 ? i : Math.min(app.slideIndex, deck.slides.length - 1);
  app.sel = new Set();
  app.history.reset();
  canvas.resetNodes();
  ensureDeckFonts(deck);
  refresh(['all']);
}

function buildShell() {
  root.className = 'editor-mode' + (HOST ? ' hosted' : '');
  const title = h('input.deck-title', { type: 'text', value: app.deck.title, 'aria-label': 'Presentation title', spellcheck: false });
  title.addEventListener('change', () => app.mutate(d => { d.title = title.value.trim() || 'Untitled presentation'; title.value = d.title; }, { parts: ['chrome'] }));
  title.addEventListener('keydown', e => { if (e.key === 'Enter') title.blur(); });
  const undo = button('Undo', 'undo', () => doUndo(), { cls: 'ghost', title: `Undo (${kbd('Mod+Z')})` });
  const redo = button('Redo', 'redo', () => doRedo(), { cls: 'ghost', title: `Redo (${kbd('Shift+Mod+Z')})` });
  const status = h('span.save-status', { 'aria-live': 'polite' });
  // Inside alphaCentaur there is no toolbar above this one: the document's
  // tools (source view, history, move/rename, web export) are here.
  const fileMenu = HOST ? menuButton('File', null, () => [
    { label: 'Save to project now', icon: 'save', kbd: kbd('Mod+S'), action: () => hostSaveNow() },
    { label: 'Revision history…', icon: 'history', action: () => toHost('pz-history') },
    hostInfo?.canRename ? { label: 'Move or rename…', icon: 'folder', action: () => toHost('pz-rename') } : null,
    { label: 'HTML source', icon: 'code', action: () => toHost('pz-mode', { mode: 'source' }) },
    { heading: 'Download' },
    { label: 'For the web (folder .zip)', icon: 'download', action: () => toHost('pz-export-web') },
    { label: 'HTML (loads libraries from CDN)', icon: 'download', action: () => exportDownload(false) },
    { label: 'Self-contained HTML (works offline)', icon: 'download', action: () => exportDownload(true) },
    '-',
    { label: fullWindow ? 'Exit full window' : 'Full window', icon: 'window', action: () => toHost('pz-fullwindow', { on: !fullWindow }) },
  ].filter(Boolean)) : menuButton('File', null, () => [
    { label: 'New presentation', icon: 'plus', action: () => createDeck(newDeck()) },
    { label: 'Open HTML…', icon: 'file', kbd: kbd('Mod+O'), action: openFile },
    '-',
    { label: app.record.handle ? `Save to ${app.record.handle.name}` : 'Save as HTML…', icon: 'save', kbd: kbd('Mod+S'), action: () => save() },
    canUseFiles() ? { label: 'Save as…', icon: 'save', kbd: kbd('Shift+Mod+S'), action: () => save(true) } : null,
    { heading: 'Folder (index.html + assets/)' },
    canPickFolders() ? { label: 'Save to a folder…', icon: 'save', action: () => saveFolder() } : null,
    { label: 'Download as a folder (.zip)', icon: 'download', action: () => downloadFolderZip(exportDeck, fileNameFor(app.deck).replace(/\.html?$/i, '')) },
    { label: 'Open a folder…', icon: 'file', action: () => openFolder() },
    { heading: 'Download one file' },
    { label: 'HTML (loads libraries from CDN)', icon: 'download', action: () => exportDownload(false) },
    { label: 'Self-contained HTML (works offline)', icon: 'download', action: () => exportDownload(true) },
    '-',
    { label: 'All presentations', icon: 'home', action: () => { go(null); showHome(); } },
  ].filter(Boolean));
  const insert = h('div.tb-group.insert', { role: 'group', 'aria-label': 'Insert' },
    tool('Text', 'text', () => insertText()),
    tool('Equation', 'sigma', () => insertMath()),
    tool('Image', 'image', () => chooseImages()),
    menuButton('Shape', 'shapes', () => Object.entries(SHAPES).map(([k, v]) => ({ label: v, icon: 'shapes', action: () => insertShape(k) })), { cls: 'tool' }),
    tool('Embed', 'globe', () => insertEmbed()),
    HOST ? tool('Project', 'file', () => insertFromProject()) : null,
    menuButton('Applet', 'code', () => [
      ...APPLETS.map(a => ({ label: a.name, icon: 'code', action: () => insertApplet(a) })),
      '-',
      { label: 'From an .html file…', icon: 'file', action: () => loadAppletFile(null) },
    ], { cls: 'tool' }));
  const presentBtn = h('button.btn.primary.present-btn', { type: 'button', title: `Present from this slide (${kbd('Mod+Enter')})`, onclick: () => present() }, icon('play', 15), h('span', null, 'Present'));
  const presentMore = menuButton('More present options', null, () => [
    { label: 'From the beginning', icon: 'play', action: () => present(0) },
    { label: 'From this slide', icon: 'play', kbd: kbd('Mod+Enter'), action: () => present() },
    { label: 'In a new window', icon: 'window', action: () => presentInWindow() },
  ], { cls: 'primary present-more', showLabel: false, align: 'end' });
  const fullBtn = HOST ? h('button.btn.ghost.full-btn', { type: 'button', onclick: () => toHost('pz-fullwindow', { on: !fullWindow }) }) : null;
  const top = h('header.topbar', null,
    h('div.tb-left', null,
      HOST ? null : h('button.btn.ghost.home-btn', { type: 'button', title: 'All presentations', 'aria-label': 'All presentations', onclick: () => { go(null); showHome(); } }, h('img.brand-mark', { src: 'icon.png', alt: '' })),
      // The editor's name, inside alphaCentaur too (the sidebar says Presentation).
      h('span.applet-name', { title: HOST ? 'alphaPresent, alphaCentaur\'s slide editor. It also runs on its own: python3 presentations/serve.py' : 'alphaPresent, alphaCentaur\'s slide editor' }, 'alphaPresent'),
      h('div.title-wrap', null, title, status),
      fileMenu),
    h('div.tb-center', null, h('div.tb-group', null, undo, redo), insert),
    h('div.tb-right', null, fullBtn, h('div.present-split', null, presentBtn, presentMore)));

  const slidesPanel = h('aside.slides-panel', { 'aria-label': 'Slides' });
  const viewport = h('div.viewport', { tabindex: '-1', 'aria-label': 'Slide canvas' });
  const notes = h('textarea.notes-input', { placeholder: 'Speaker notes for this slide…  (press N while presenting)', spellcheck: true, 'aria-label': 'Speaker notes' });
  notes.addEventListener('input', () => { currentSlide().notes = notes.value; scheduleThumb(400); updateRemotePreview(); if (HOST) queueHostChange(800); });
  notes.addEventListener('change', () => app.commit('notes'));
  const inspector = h('aside.inspector', { 'aria-label': 'Format and design' });
  const zoom = select([['fit', 'Fit'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.5', '150%']], 'fit', v => { app.zoom = v === 'fit' ? 'fit' : +v; canvas.fit(); }, { label: 'Zoom' });
  const slideInfo = h('span.sb-slide');
  const phoneBtn = h('button.btn.ghost.sm.phone-btn', { type: 'button', title: 'Phone remote preview', onclick: togglePhone }, icon('phone', 16), h('span', null, 'Phone'));
  const statusbar = h('footer.statusbar', null,
    slideInfo,
    h('span.sb-hint', null, 'Double-click to edit · drag to move · Shift keeps proportions · ⌘ disables snapping'),
    h('span.sb-right', null, phoneBtn, h('button.btn.ghost.sm', { type: 'button', onclick: showShortcuts, title: 'Keyboard shortcuts (?)' }, icon('keyboard', 16), h('span', null, 'Shortcuts')), zoom));

  const phonePane = initRemotePreview(viewport);
  const notice = h('div.folder-notice', { hidden: true, role: 'status' });
  root.replaceChildren(top, slidesPanel, h('main.workspace', null, notice, h('div.work-main', null, viewport, phonePane), h('div.notes', null, notes)), inspector, statusbar);
  ui = { title, undo, redo, status, notes, slideInfo, zoom, viewport, fullBtn, phoneBtn, notice };
  drawFolderNotice();
  setFullWindow(fullWindow);
  initSlides(slidesPanel);
  canvas.initCanvas(viewport);
  initInspector(inspector);
}
// Exports carry the phone remote's setup (alphaCentaur's workspace setting
// inside alphaCentaur; the deck's own copy standalone).
const exportDeck = (deck, opts = {}) => exportHTML(deck, { ...opts, remote: effectiveSetup(deck) });

// The phone preview needs the remote on; offer that instead when it is off.
function togglePhone() {
  if (normalizeRemoteDeck(app.deck.remote).enabled) return setRemotePreview(!app.remotePreview);
  app.tab = 'design'; setSelection([]);
  toast('Turn on the phone remote first (Design → Phone remote)');
  setTimeout(() => document.querySelector('.insp-body .insp-title-row')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
}
function tool(label, ic, fn) {
  return h('button.btn.tool', { type: 'button', title: label, onclick: fn }, icon(ic), h('span', null, label));
}

// ------------------------------------------------------- update loop ----
function refresh(parts) {
  if (!app.deck || !ui.viewport) return;
  const P = new Set(parts.includes('all') ? ['canvas', 'slides', 'inspector', 'notes', 'chrome'] : parts);
  if (P.has('canvas')) canvas.sync();
  else if (P.has('overlay')) canvas.drawOverlay();
  if (P.has('slides')) renderSlides();
  else if (P.has('thumb')) scheduleThumb(60);
  else if (P.has('thumbSoon')) scheduleThumb(350);
  if (P.has('inspector')) renderInspector();
  else if (P.has('geometry')) syncGeometry();
  if (P.has('notes') && document.activeElement !== ui.notes) ui.notes.value = currentSlide().notes || '';
  updateChrome();
  updateRemotePreview();
}
function scheduleThumb(ms) {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => app.deck && updateThumb(app.slideIndex), ms);
}
function updateChrome() {
  ui.undo.disabled = !app.history.canUndo;
  ui.redo.disabled = !app.history.canRedo;
  ui.slideInfo.textContent = `Slide ${app.slideIndex + 1} of ${app.deck.slides.length}`;
  const phoneOn = app.remotePreview && normalizeRemoteDeck(app.deck.remote).enabled;
  ui.phoneBtn.classList.toggle('on', !!phoneOn); ui.phoneBtn.setAttribute('aria-pressed', String(!!phoneOn));
  if (document.activeElement !== ui.title) ui.title.value = app.deck.title;
  document.title = `${app.deck.title} · alphaPresent`;
}

app.refresh = refresh;
app.commit = key => { if (app.history.commit(key)) { scheduleSave(); updateChrome(); } };
app.mutate = (fn, { key = null, parts = ['canvas', 'thumb', 'inspector'] } = {}) => {
  fn(app.deck);
  if (app.history.commit(key)) scheduleSave();
  refresh(parts);
};
app.goSlide = i => {
  if (i === app.slideIndex && app.deck.slides[i]) return;
  canvas.finishEditing(); canvas.endInteract();
  app.slideIndex = Math.max(0, Math.min(app.deck.slides.length - 1, i));
  app.sel = new Set();
  refresh(['canvas', 'inspector', 'notes', 'chrome']);
  markCurrent();
};
app.present = i => present(i);
app.focusInspector = name => { renderInspector(); setTimeout(() => focusField(name), 30); };

function doUndo() { canvas.finishEditing(); closePopover(); if (app.history.undo()) toast('Undone'); }
function doRedo() { canvas.finishEditing(); closePopover(); if (app.history.redo()) toast('Redone'); }

// ------------------------------------------------------------- saving ----
function scheduleSave() {
  if (!app.record) return;
  if (HOST) return queueHostChange();
  if (app.record.handle) fileDirty = true;
  setStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
}
async function flushSave() {
  if (HOST || !saveTimer || !app.record) return;
  clearTimeout(saveTimer); saveTimer = null;
  app.record.deck = app.deck;
  app.record.title = app.deck.title;
  try {
    await putDeck(app.record);
    setStatus(fileDirty ? `Saved in browser · ${app.record.handle.name} has unsaved changes` : 'Saved', fileDirty ? 'warn' : '');
  } catch (e) {
    setStatus('Could not save', 'error');
    toast('Saving failed: ' + e.message + ' — download the HTML to keep your work.', 'error');
  }
}
function setStatus(text, kind = '') {
  if (!ui.status) return;
  ui.status.textContent = text;
  ui.status.className = 'save-status ' + kind;
}
if (!HOST) addEventListener('beforeunload', e => {
  if (saveTimer) flushSave();
  if (fileDirty) { e.preventDefault(); e.returnValue = ''; }
});

// ------------------------------------------------------- alphaCentaur ----
// Inside alphaCentaur the artifact is the store: each change is re-exported
// and handed to the host, which saves it with its usual conflict checks.
let hostInfo = null, changeTimer = null, pendingChange = false, fullWindow = false;
const HOST_LIMIT = 15_500_000;   // alphaCentaur stores up to 16 MB per artifact
function queueHostChange(ms = 350) {
  pendingChange = true;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(sendHostChange, ms);
}
async function sendHostChange() {
  changeTimer = null;
  let html;
  try { html = await exportDeck(app.deck); } catch (e) { toast('Could not render the presentation: ' + e.message, 'error'); return; }
  if (changeTimer) return;                // superseded while rendering
  if (html.length > HOST_LIMIT) {
    setStatus('Too large to save', 'error');
    toast(`This presentation is ${(html.length / 1e6).toFixed(1)} MB; alphaCentaur keeps up to 16 MB per document. Remove or shrink some images.`, 'error');
    return;
  }
  pendingChange = false;
  toHost('pz-change', { content: html });
}
// A single-file deck inside alphaCentaur: offer to make it a folder.
function drawFolderNotice() {
  if (!ui.notice) return;
  const show = HOST && folderCtx.path && !folderCtx.folderDeck;
  ui.notice.hidden = !show;
  if (!show) return;
  ui.notice.replaceChildren(icon('layout', 16),
    h('span', null, 'This deck is one HTML file with its pictures inside. As a folder (index.html + assets/) it can link the project’s web apps and keep pictures as files.'),
    h('button.btn.sm', { type: 'button', onclick: convertToFolder }, 'Convert to a folder'));
}
async function convertToFolder() {
  canvas.finishEditing();
  if (changeTimer) { clearTimeout(changeTimer); await sendHostChange(); }
  try {
    const { deck, files } = deckAsFolder(app.deck);
    const content = await exportDeck(deck);
    const { path } = await hostRequest('pz-convert', { files, content });
    toast(`Now a folder: ${path}`);
  } catch (e) { toast(e.message, 'error'); }
}
async function hostSaveNow() {
  canvas.finishEditing();
  if (changeTimer) { clearTimeout(changeTimer); await sendHostChange(); }
  toHost('pz-save');
}
function setFullWindow(on) {
  fullWindow = !!on;
  if (!ui.fullBtn) return;
  ui.fullBtn.replaceChildren(icon('window', 16), h('span', null, fullWindow ? 'Exit full window' : 'Full window'));
  ui.fullBtn.title = fullWindow ? 'Return to the project layout' : 'Use the whole window for the editor';
}
function startHost() {
  // Uncommitted typing counts as a change, so a newer revision arriving from
  // the project is held back (and conflict-checked) instead of replacing it.
  app.liveChange = () => queueHostChange(700);
  root.replaceChildren(h('div.boot', null, 'Opening presentation…'));
  // Where the deck is decides what its relative URLs show: draw again from scratch.
  installHostFolder(() => { if (app.deck && ui.viewport) { canvas.resetNodes(); refresh(['canvas', 'slides', 'inspector']); drawFolderNotice(); } });
  onHost('pz-load', d => {
    hostInfo = { pid: d.pid, aid: d.aid, revision: d.revision, canRename: !!d.canRename };
    let deck = null, fresh = false;
    try { ({ deck, fresh } = inspectDeckHTML(String(d.content || ''))); }
    catch (e) { toast('The presentation source block could not be read: ' + e.message, 'error'); }
    // A folder deck (talk/index.html) is named after its folder.
    const parts = String(d.title || '').replace(/\.html?$/i, '').split('/');
    const fileTitle = parts.at(-1) === 'index' && parts.length > 1 ? parts.at(-2) : parts.at(-1);
    if (!deck) { deck = newDeck(fileTitle || 'Presentation'); fresh = false; }
    else if (deck.title === 'Untitled presentation' && fileTitle) { deck.title = fileTitle; fresh = false; }
    if (typeof d.macros === 'string' && deck.settings.hostMacros !== d.macros) { deck.settings.hostMacros = d.macros; fresh = false; }
    const keep = app.deck && app.deck.id === deck.id ? app.deck.slides[app.slideIndex]?.id : null;
    fullWindow = !!d.fullWindow;
    if (!ui.viewport) openEditor({ id: deck.id, deck });
    else replaceDeck(deck, keep);
    setFullWindow(fullWindow);
    // A stub, a stale render (source edited elsewhere) or new project macros:
    // render now so the stored document matches its source.
    if (!fresh) queueHostChange(50);
  });
  onHost('pz-revision', d => { if (hostInfo) hostInfo.revision = d.revision; });
  onHost('pz-status', d => setStatus(String(d.status || ''), /attention|conflict|failed/i.test(d.status) ? 'error' : /new revision/i.test(d.status) ? 'warn' : ''));
  onHost('pz-fullwindow', d => setFullWindow(d.on));
  // Closing mid-change: leave the source where alphaCentaur recovers drafts.
  addEventListener('pagehide', () => { if (pendingChange && hostInfo && app.deck) writeHostDraft(hostInfo, stubHTML(app.deck)); });
  toHost('pz-ready');
}

async function save(as = false) {
  if (HOST) return hostSaveNow();
  canvas.finishEditing();
  await flushSave();
  const html = await exportDeck(app.deck);
  if (canUseFiles()) {
    try {
      let handle = !as && app.record.handle;
      if (!handle) handle = await pickSaveFile(fileNameFor(app.deck));
      await writeHandle(handle, html);
      app.record.handle = handle;
      fileDirty = false;
      await putDeck(app.record);
      setStatus(`Saved to ${handle.name}`);
      toast(`Saved ${handle.name}`);
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error');
    }
  } else {
    download(fileNameFor(app.deck), html);
    toast('Downloaded ' + fileNameFor(app.deck));
  }
}
async function exportDownload(selfContained) {
  canvas.finishEditing();
  toast(selfContained ? 'Bundling fonts, KaTeX and fullPage.js…' : 'Exporting…');
  try {
    const html = await exportDeck(app.deck, { selfContained });
    download(fileNameFor(app.deck, selfContained ? '-offline' : ''), html);
    toast(`Downloaded ${fileNameFor(app.deck, selfContained ? '-offline' : '')} (${Math.round(html.length / 1024)} KB)`);
  } catch (e) { toast('Export failed: ' + e.message, 'error'); }
}

async function openFile() {
  let text, name, handle = null;
  try {
    if (canUseFiles()) ({ text, name, handle } = await pickOpenFile());
    else {
      const f = await pickFile('.html,.htm,text/html');
      if (!f) return;
      text = await f.text(); name = f.name;
    }
  } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); return; }
  let deck = null;
  try { deck = parseDeckHTML(text); } catch (e) { toast('That file has a damaged presentation block: ' + e.message, 'error'); return; }
  if (!deck) {
    if (app.deck) {
      modal('Not an editable presentation', h('p.modal-text', null, `“${name}” wasn't made with this editor, so it can't be opened for editing. You can still place it on a slide as an applet.`), {
        actions: [{ label: 'Cancel' }, { label: 'Insert as applet', primary: true, action: () => insertApplet({ name: name.replace(/\.html?$/, ''), code: text }, true) }],
      });
    } else toast(`“${name}” wasn't made with this editor. Open a presentation first to insert it as an applet.`, 'error');
    return;
  }
  const existing = await getDeck(deck.id).catch(() => null);
  if (existing) {
    const useFile = await new Promise(res => {
      let v = null;
      modal('Already in your library', h('p.modal-text', null, `This presentation is already here (edited ${ago(existing.updated)}). Open the version in your library, or replace it with the contents of “${name}”?`), {
        actions: [{ label: 'Open library version', action: () => { v = false; } }, { label: 'Use the file', primary: true, action: () => { v = true; } }],
        onclose: () => res(v),
      });
    });
    if (useFile === null) return;
    if (!useFile) { if (handle) existing.handle = handle; await putDeck(existing); go(existing.id); return openEditor(existing); }
  }
  await createDeck(deck, handle);
  toast(`Opened ${name}`);
}

// A deck as a folder on disk (standalone): index.html + assets/.
async function saveFolder() {
  canvas.finishEditing();
  try { const name = await saveToFolder(exportDeck); toast(`Saved to the folder ${name}`); }
  catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); }
}
function openFolder() {
  const inp = h('input', { type: 'file', webkitdirectory: true, style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    try { if (inp.files.length) { await createDeck(await deckFromFolder(inp.files)); toast('Opened the folder'); } }
    catch (e) { toast(e.message, 'error'); }
    inp.remove();
  });
  document.body.append(inp);
  inp.click();
}
function pickFile(accept, multiple = false) {
  return new Promise(res => {
    const inp = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(multiple ? [...inp.files] : inp.files[0] || null); inp.remove(); });
    inp.addEventListener('cancel', () => { res(multiple ? [] : null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

// ------------------------------------------------------------- insert ----
function place(el, at) {
  const c = at || canvas.visibleCenter();
  el.x = Math.round(Math.max(-el.w / 2, Math.min(W - el.w / 2, c.x - el.w / 2)));
  el.y = Math.round(Math.max(-el.h / 2, Math.min(H - el.h / 2, c.y - el.h / 2)));
  return el;
}
function addElements(els, { edit = false } = {}) {
  canvas.finishEditing(); canvas.endInteract();
  app.tab = 'format';
  app.mutate(() => { currentSlide().elements.push(...els); app.sel = new Set(els.map(e => e.id)); }, { parts: ['canvas', 'thumb', 'inspector'] });
  if (edit) canvas.startEditing(els[0].id, null, true);
}
function insertText(html = '', at) {
  const el = place(makeText({ role: 'body', w: 900, html: html || '<p>Text</p>' }), at);
  addElements([el], { edit: !html });
}
function insertMath() {
  const el = place(makeMath({ w: 800, h: 160 }));
  addElements([el]);
  canvas.openMathEditor(el);
}
function insertShape(kind) { addElements([place(makeShape(kind))]); }
function insertEmbed() {
  const inp = h('input.text-input.lg', { type: 'url', placeholder: 'https://…', autofocus: true });
  const examples = [
    ['A YouTube video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['Desmos graphing calculator', 'https://www.desmos.com/calculator'],
    ['Wikipedia', 'https://en.wikipedia.org/wiki/Hyperbolic_geometry'],
  ];
  const go = () => { const v = inp.value.trim(); if (!v) return false; addElements([place(makeEmbed(v))]); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { if (go() !== false) m.close(); } });
  const m = modal('Embed a web page', h('div.stack', null,
    h('p.modal-text', null, 'Any page that allows framing: your own tools, videos, calculators. It stays live in the slide.'),
    inp,
    h('div.chips', null, examples.map(([l, u]) => h('button.chip', { type: 'button', onclick: () => { inp.value = u; inp.focus(); } }, l)))),
  { actions: [{ label: 'Cancel' }, { label: 'Embed', primary: true, action: go }] });
}
function insertApplet(a, newSlide = false) {
  const el = place(makeApplet(a.code, a.name, { w: 1400, h: 788 }));
  if (newSlide) {
    el.x = 0; el.y = 0; el.w = W; el.h = H; el.radius = 0;
    const s = makeSlide([el]);
    app.mutate(d => { d.slides.splice(app.slideIndex + 1, 0, s); app.slideIndex += 1; app.sel = new Set([el.id]); }, { parts: ['all'] });
    return;
  }
  addElements([el]);
}

// Images: read, downscale anything huge, store once in deck.assets.
async function fileToAsset(file) {
  // A folder deck in alphaCentaur: the picture becomes a file in assets/.
  if (folderMode()) {
    const url = URL.createObjectURL(file), img = await loadImage(url);
    URL.revokeObjectURL(url);
    const path = await uploadAsset(file);
    const id = uid('a');
    app.deck.assets[id] = { name: file.name, mime: file.type, path };
    return { id, w: img.naturalWidth || 800, h: img.naturalHeight || 600 };
  }
  let data = await readDataURL(file);
  let img = await loadImage(data);
  // Inside alphaCentaur images live in the 16 MB artifact, so shrink harder.
  const [limit, edge] = HOST ? [5e5, 2048] : [1.5e6, 2560];
  const big = file.size > limit && /^image\/(jpeg|png|webp)$/.test(file.type);
  if (big && Math.max(img.naturalWidth, img.naturalHeight) > edge) {
    const k = edge / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
    img = await loadImage(data);
  }
  const id = uid('a');
  app.deck.assets[id] = { name: file.name, mime: file.type, data };
  return { id, w: img.naturalWidth || 800, h: img.naturalHeight || 600 };
}
const readDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
const loadImage = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; });
function fitSize(w, hgt, maxW = W * 0.62, maxH = H * 0.7) {
  const k = Math.min(1, maxW / w, maxH / hgt);
  return { w: Math.round(w * k), h: Math.round(hgt * k) };
}

async function insertFiles(files, at) {
  const els = [];
  let i = 0;
  for (const f of files) {
    if (f.type.startsWith('image/')) {
      const a = await fileToAsset(f);
      const s = fitSize(a.w, a.h);
      const el = makeImage({ asset: a.id, w: s.w, h: s.h, fit: 'cover', alt: f.name.replace(/\.\w+$/, '') });
      place(el, at ? { x: at.x + i * 30, y: at.y + i * 30 } : null);
      els.push(el); i++;
    } else if (/\.html?$/i.test(f.name)) {
      const code = await f.text();
      if (parseDeckHTML(code)) { toast(`${f.name} is a presentation — use File → Open to edit it.`); continue; }
      els.push(place(makeApplet(code, f.name.replace(/\.html?$/i, '')), at));
    } else toast(`Can't insert ${f.name} (${f.type || 'unknown type'})`, 'error');
  }
  if (els.length) addElements(els);
}
// A picture or web app from elsewhere in the project, linked by relative URL.
function insertFromProject() {
  void pickFromProject(async ({ kind, path, url }) => {
    const name = path.split('/').pop().replace(/\.\w+$/, '');
    if (kind === 'image') {
      const img = await loadImage(viewURL({ mode: 'edit', deck: app.deck }, url, 'image'));
      const s = fitSize(img.naturalWidth || 800, img.naturalHeight || 600);
      addElements([place(makeImage({ src: url, w: s.w, h: s.h, fit: 'contain', alt: name }))]);
    } else addElements([place(makeEmbed(url))]);
  });
}
async function chooseImages() {
  const files = await pickFile('image/*', true);
  if (files.length) insertFiles(files);
}
app.onDropFiles = (files, at) => insertFiles(files, at);
app.onReplaceImage = async el => {
  const f = await pickFile('image/*');
  if (!f) return;
  const a = await fileToAsset(f);
  app.mutate(() => {
    el.asset = a.id; el.src = '';
    if (!el.alt) el.alt = f.name.replace(/\.\w+$/, '');
    // Keep the box's width; match the new picture's proportions.
    if (el.lockAspect) { const cy = el.y + el.h / 2; el.h = Math.round(el.w * a.h / a.w); el.y = Math.round(cy - el.h / 2); }
  }, { parts: ['canvas', 'thumb', 'inspector'] });
};
app.onChooseBackground = async () => {
  const f = await pickFile('image/*');
  if (!f) return;
  const a = await fileToAsset(f);
  app.mutate(() => { currentSlide().bg = { ...currentSlide().bg, kind: 'image', asset: a.id, fit: 'cover' }; }, { parts: ['canvas', 'thumb', 'inspector'] });
};
app.onLoadAppletFile = el => loadAppletFile(el);
async function loadAppletFile(el) {
  const f = await pickFile('.html,.htm,text/html');
  if (!f) return;
  const code = await f.text();
  if (el) app.mutate(() => { el.code = code; el.name = f.name.replace(/\.html?$/i, ''); }, { parts: ['canvas', 'thumb', 'inspector'] });
  else addElements([place(makeApplet(code, f.name.replace(/\.html?$/i, '')))]);
}

// ------------------------------------------------------- applet editor ---
app.onEditApplet = el => {
  const ta = h('textarea.code.applet-code', { spellcheck: false, 'aria-label': 'Applet source' });
  ta.value = el.code;
  const frame = h('iframe.applet-preview', { sandbox: 'allow-scripts allow-modals allow-pointer-lock', title: 'Preview' });
  const err = h('div.applet-err');
  const run = () => { frame.srcdoc = appletDoc(ta.value, app.deck); };
  let t;
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 600); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
  });
  const starter = select([['', 'Load a starter…'], ...APPLETS.map(a => [a.id, a.name])], '', v => { const a = APPLETS.find(x => x.id === v); if (a) { ta.value = a.code; run(); } });
  const m = modal(`Edit applet — ${el.name || 'Applet'}`, h('div.applet-editor', null,
    h('div.applet-pane', null, h('div.pane-head', null, h('span', null, 'HTML · CSS · JavaScript'), starter), ta),
    h('div.applet-pane', null, h('div.pane-head', null, h('span', null, 'Preview'), button('Run', 'play', run, { cls: 'ghost sm', showLabel: true, title: 'Run (⌘⏎)' })), h('div.preview-box', { style: { background: app.deck.theme.colors.bg } }, frame), err)),
  {
    wide: true,
    actions: [{ label: 'Cancel' }, { label: 'Save applet', primary: true, action: () => app.mutate(() => { el.code = ta.value; }, { parts: ['canvas', 'thumb', 'inspector'] }) }],
  });
  run();
  setTimeout(() => ta.focus(), 50);
  return m;
};

// -------------------------------------------------------------- actions --
app.action = (name, arg) => {
  const slide = currentSlide(), sel = selectedEls();
  switch (name) {
    case 'delete':
      if (!sel.length) return;
      app.mutate(() => { slide.elements = slide.elements.filter(e => !app.sel.has(e.id)); app.sel = new Set(); app.interactId = null; }, { parts: ['canvas', 'thumb', 'inspector'] });
      break;
    case 'duplicate':
      if (!sel.length) return;
      canvas.duplicateSelection(32);
      app.commit(); refresh(['canvas', 'thumb', 'inspector']);
      break;
    case 'interact': if (sel[0]) canvas.startInteract(sel[0].id); break;
    case 'reload': {
      const n = sel[0] && canvas.nodeFor(sel[0].id)?.querySelector('iframe');
      if (n) { if (n.hasAttribute('srcdoc')) n.srcdoc = n.srcdoc; else n.src = n.src; }
      break;
    }
    case 'align': {
      const b = unionBox(sel.map(aabb));
      if (!b) return;
      const dx = { left: -b.x, center: W / 2 - (b.x + b.w / 2), right: W - (b.x + b.w) }[arg] || 0;
      const dy = { top: -b.y, middle: H / 2 - (b.y + b.h / 2), bottom: H - (b.y + b.h) }[arg] || 0;
      app.mutate(() => sel.forEach(e => { e.x = Math.round(e.x + dx); e.y = Math.round(e.y + dy); }), { parts: ['canvas', 'thumb', 'geometry'] });
      break;
    }
    case 'alignSel': {
      const b = unionBox(sel.map(aabb));
      app.mutate(() => sel.forEach(e => {
        const a = aabb(e);
        if (arg === 'left') e.x += b.x - a.x;
        if (arg === 'center') e.x += b.x + b.w / 2 - (a.x + a.w / 2);
        if (arg === 'right') e.x += b.x + b.w - (a.x + a.w);
        if (arg === 'top') e.y += b.y - a.y;
        if (arg === 'middle') e.y += b.y + b.h / 2 - (a.y + a.h / 2);
        if (arg === 'bottom') e.y += b.y + b.h - (a.y + a.h);
        e.x = Math.round(e.x); e.y = Math.round(e.y);
      }), { parts: ['canvas', 'thumb'] });
      break;
    }
    case 'distribute': {
      const horiz = arg === 'h';
      const items = sel.map(e => ({ e, b: aabb(e) })).sort((p, q) => horiz ? p.b.x - q.b.x : p.b.y - q.b.y);
      const first = items[0].b, last = items[items.length - 1].b;
      const total = items.reduce((s, it) => s + (horiz ? it.b.w : it.b.h), 0);
      const span = horiz ? last.x + last.w - first.x : last.y + last.h - first.y;
      const gap = (span - total) / (items.length - 1);
      let pos = horiz ? first.x : first.y;
      app.mutate(() => items.forEach(({ e, b }) => {
        if (horiz) { e.x = Math.round(e.x + pos - b.x); pos += b.w + gap; } else { e.y = Math.round(e.y + pos - b.y); pos += b.h + gap; }
      }), { parts: ['canvas', 'thumb'] });
      break;
    }
    case 'order': {
      if (!sel.length) return;
      app.mutate(() => {
        const els = slide.elements, ids = app.sel;
        if (arg === 'front') slide.elements = [...els.filter(e => !ids.has(e.id)), ...els.filter(e => ids.has(e.id))];
        else if (arg === 'back') slide.elements = [...els.filter(e => ids.has(e.id)), ...els.filter(e => !ids.has(e.id))];
        else if (arg === 'forward') { for (let i = els.length - 2; i >= 0; i--) if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
        else if (arg === 'backward') { for (let i = 1; i < els.length; i++) if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
      }, { parts: ['canvas', 'thumb'] });
      break;
    }
    case 'imageToBackground': {
      const el = sel[0];
      if (!el?.asset) return;
      app.mutate(() => {
        slide.bg = { kind: 'image', asset: el.asset, fit: 'cover', dim: 0 };
        slide.elements = slide.elements.filter(e => e.id !== el.id);
        app.sel = new Set();
      }, { parts: ['canvas', 'thumb', 'inspector'] });
      toast('Image is now the slide background');
      break;
    }
    case 'bgToAll':
      app.mutate(d => d.slides.forEach(s => { s.bg = clone(slide.bg); }), { parts: ['canvas', 'slides'] });
      toast('Background applied to every slide');
      break;
    case 'duplicateSlide': duplicateSlide(app.slideIndex); break;
    case 'deleteSlide': deleteSlide(app.slideIndex); break;
  }
};

// --------------------------------------------------------- context menu --
app.onContextMenu = (e, el, at) => {
  const items = [];
  if (el) {
    if (el.type === 'text') items.push({ label: 'Edit text', icon: 'text', kbd: '⏎', action: () => canvas.startEditing(el.id, null, false) });
    if (el.type === 'math') items.push({ label: 'Edit LaTeX', icon: 'sigma', kbd: '⏎', action: () => canvas.openMathEditor(el) });
    if (el.type === 'image') items.push({ label: 'Replace image…', icon: 'image', action: () => app.onReplaceImage(el) });
    if (el.type === 'applet') items.push({ label: 'Edit code…', icon: 'code', action: () => app.onEditApplet(el) });
    if (el.type === 'embed' || el.type === 'applet') items.push({ label: 'Interact', icon: 'hand', kbd: '⏎', action: () => canvas.startInteract(el.id) });
    if (items.length) items.push('-');
    items.push(
      { label: 'Cut', kbd: kbd('Mod+X'), action: () => { copySelection(); app.action('delete'); } },
      { label: 'Copy', icon: 'copy', kbd: kbd('Mod+C'), action: copySelection },
      { label: 'Duplicate', kbd: kbd('Mod+D'), action: () => app.action('duplicate') },
      '-',
      { label: 'Bring to front', icon: 'front', kbd: kbd('Shift+Mod+]'), action: () => app.action('order', 'front') },
      { label: 'Send to back', icon: 'back', kbd: kbd('Shift+Mod+['), action: () => app.action('order', 'back') },
      { label: el.locked ? 'Unlock' : 'Lock position', icon: el.locked ? 'unlock' : 'lock', action: () => app.mutate(() => selectedEls().forEach(x => { x.locked = !el.locked; }), { parts: ['canvas', 'inspector'] }) },
      '-',
      { label: 'Delete', icon: 'trash', danger: true, kbd: '⌫', action: () => app.action('delete') });
  } else {
    items.push(
      { label: 'Paste', kbd: kbd('Mod+V'), disabled: !app.clipboard, action: () => pasteElements(app.clipboard, at) },
      { label: 'Text box here', icon: 'text', action: () => insertText('', at) },
      { label: 'Select all', kbd: kbd('Mod+A'), action: () => setSelection(currentSlide().elements.filter(x => !x.locked).map(x => x.id)) },
      '-',
      { label: 'Slide background…', icon: 'palette', action: () => { app.tab = 'format'; setSelection([]); } },
      { label: 'New slide after', icon: 'plus', action: () => layoutPicker(ui.viewport, app.slideIndex + 1) },
    );
  }
  popoverAt(e.clientX, e.clientY, menu(items));
};

// ----------------------------------------------------------- clipboard ---
const MARK = 'alphacentaur-presentations/elements';
function clipPayload() {
  const els = clone(selectedEls());
  const assets = {};
  for (const e of els) if (e.asset && app.deck.assets[e.asset]) assets[e.asset] = app.deck.assets[e.asset];
  return { [MARK]: 1, els, assets, from: currentSlide().id };
}
function copySelection(e) {
  if (!app.sel.size) return false;
  app.clipboard = clipPayload();
  app.clipboard.pastes = 0;
  const text = JSON.stringify(app.clipboard);
  if (e?.clipboardData) e.clipboardData.setData('text/plain', text);
  else navigator.clipboard?.writeText(text).catch(() => {});
  return true;
}
function pasteElements(payload, at) {
  if (!payload?.els?.length) return;
  Object.assign(app.deck.assets, normalizeAssets(payload.assets));
  const same = payload.from === currentSlide().id;
  payload.pastes = (payload.pastes || 0) + 1;
  const off = same ? 32 * payload.pastes : 0;
  const els = normalizeElements(payload.els.map(e => ({ ...clone(e), id: uid('e'), x: Number(e.x) + off, y: Number(e.y) + off })));
  if (at) {
    const b = unionBox(els.map(aabb));
    els.forEach(e => { e.x = Math.round(e.x + at.x - (b.x + b.w / 2)); e.y = Math.round(e.y + at.y - (b.y + b.h / 2)); });
  }
  addElements(els);
}
document.addEventListener('copy', e => { if (!app.deck || isTyping(e.target) || app.editingId) return; if (copySelection(e)) e.preventDefault(); });
document.addEventListener('cut', e => { if (!app.deck || isTyping(e.target) || app.editingId) return; if (copySelection(e)) e.preventDefault(); });
// WebKit does not always fire copy/paste events when nothing editable has
// focus, so ⌘C/⌘X also fill the internal clipboard and ⌘V falls back to it.
const pendingPastes = [];
document.addEventListener('paste', async e => {
  clearTimeout(pendingPastes.shift());
  if (!app.deck || isTyping(e.target) || app.editingId || document.querySelector('.modal-back')) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); return insertFiles(files); }
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!text) return;
  e.preventDefault();
  try {
    const p = JSON.parse(text);
    if (p && p[MARK]) {
      if (app.clipboard && JSON.stringify(app.clipboard.els) === JSON.stringify(p.els)) return pasteElements(app.clipboard);
      return pasteElements(p);
    }
  } catch { /* not ours */ }
  const t = text.trim();
  if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?$/i.test(t)) {
    const img = await loadImage(t);
    const s = fitSize(img.naturalWidth || 800, img.naturalHeight || 600);
    return addElements([place(makeImage({ src: t, w: s.w, h: s.h, fit: 'cover' }))]);
  }
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i.test(t)) return addElements([place(makeEmbed(t))]);
  const html = /^https?:\/\/\S+$/.test(t) ? `<p><a href="${t.replace(/"/g, '&quot;')}">${t.replace(/</g, '&lt;')}</a></p>` : textToHTML(text);
  insertText(html);
});

// ------------------------------------------------------------ keyboard ---
const isTyping = t => !!t?.closest?.('input, textarea, select, [contenteditable="true"]');
document.addEventListener('keydown', e => {
  if (!app.deck || !ui.viewport || document.querySelector('.present-overlay')) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key, kl = k.toLowerCase();
  if (mod && kl === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && kl === 'o') { e.preventDefault(); if (!HOST) openFile(); return; }
  if ((mod && k === 'Enter') || k === 'F5') { e.preventDefault(); present(e.shiftKey || k === 'F5' ? 0 : undefined); return; }
  if (document.querySelector('.modal-back')) return;
  if (isTyping(e.target) || app.editingId) return;
  const sel = selectedEls();
  if (mod && kl === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if (mod && kl === 'y') { e.preventDefault(); doRedo(); return; }
  if (mod && kl === 'd') { e.preventDefault(); app.action('duplicate'); return; }
  if (mod && (kl === 'c' || kl === 'x') && sel.length && !getSelection().toString()) {
    app.clipboard = { ...clipPayload(), pastes: 0 };
    if (kl === 'x') setTimeout(() => { if (selectedEls().length) app.action('delete'); }, 0);
    return;
  }
  if (mod && kl === 'v' && !e.shiftKey) { pendingPastes.push(setTimeout(() => { pendingPastes.shift(); pasteElements(app.clipboard); }, 120)); return; }
  if (mod && kl === 'a') { e.preventDefault(); setSelection(currentSlide().elements.filter(x => !x.locked).map(x => x.id)); return; }
  if (mod && (k === ']' || k === '[')) { e.preventDefault(); app.action('order', k === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); return; }
  if (mod && (k === '=' || k === '+' || k === '-' || k === '0')) {
    e.preventDefault();
    const steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
    const cur = app.zoom === 'fit' ? canvas.getScale() : app.zoom;
    app.zoom = k === '0' ? 'fit' : k === '-' ? ([...steps].reverse().find(s => s < cur - 0.01) || 0.25) : (steps.find(s => s > cur + 0.01) || 2);
    ui.zoom.value = String(app.zoom);
    if (![...ui.zoom.options].some(o => o.value === String(app.zoom))) ui.zoom.append(h('option', { value: String(app.zoom) }, Math.round(app.zoom * 100) + '%')), ui.zoom.value = String(app.zoom);
    canvas.fit();
    return;
  }
  if (mod) return;
  if (k === 'Escape') {
    if (app.interactId) canvas.endInteract();
    else if (sel.length) setSelection([]);
    return;
  }
  if (k === 'Delete' || k === 'Backspace') { if (sel.length) { e.preventDefault(); app.action('delete'); } return; }
  if (k === 'Enter' && sel.length === 1) { e.preventDefault(); canvas.openElement(sel[0]); return; }
  if (k === 'Tab') {
    e.preventDefault();
    const els = currentSlide().elements;
    if (!els.length) return;
    const i = sel.length ? els.indexOf(sel[sel.length - 1]) : -1;
    setSelection([els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length].id]);
    return;
  }
  if (k.startsWith('Arrow')) {
    e.preventDefault();
    if (sel.length) {
      const d = e.shiftKey ? 10 : 1;
      const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0;
      app.mutate(() => sel.filter(x => !x.locked).forEach(x => { x.x += dx; x.y += dy; }), { key: 'nudge', parts: ['canvas', 'geometry', 'thumbSoon'] });
    } else app.goSlide(app.slideIndex + (k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1));
    return;
  }
  if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); app.goSlide(app.slideIndex + (k === 'PageDown' ? 1 : -1)); return; }
  if (k === '?') { showShortcuts(); return; }
});

function showShortcuts() {
  const rows = [
    ['Present from this slide', 'Mod+Enter'], ['Present from the start', 'F5'], ['Save', 'Mod+S'], ['Open', 'Mod+O'],
    ['Undo / redo', 'Mod+Z  /  Shift+Mod+Z'], ['Copy, cut, paste, duplicate', 'Mod+C  Mod+X  Mod+V  Mod+D'],
    ['Edit the selected text / equation / applet', 'Enter'], ['Finish editing, deselect', 'Esc'],
    ['Nudge (×10 with Shift)', '← ↑ → ↓'], ['Previous / next slide (nothing selected)', '← →  or  PgUp PgDn'],
    ['Select next element', 'Tab'], ['Bring forward / to front', 'Mod+]  /  Shift+Mod+]'], ['Send backward / to back', 'Mod+[  /  Shift+Mod+['],
    ['Zoom in / out / fit', 'Mod+=  Mod+-  Mod+0'], ['Inline math while typing', 'Shift+Mod+M'], ['Link while typing', 'Mod+K'],
    ['While dragging', 'Shift: axis lock · Alt: duplicate · Mod: no snapping'],
    ['While resizing', 'Shift: keep proportions · Alt: from center'],
    ['While presenting', '→ / Space next · ← back · N notes · F fullscreen · R phone remote · 12⏎ go to slide 12'],
  ];
  modal('Keyboard shortcuts', h('table.shortcuts', null, rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, kbd(b)))))));
}

// -------------------------------------------------------------- present --
async function present(i = app.slideIndex) {
  canvas.finishEditing(); canvas.endInteract(); closePopover();
  await flushSave();
  // Presented from a blob: relative URLs become the project's absolute ones.
  const html = await exportDeck(app.deck, { localLibs: true, resolveURLs: HOST });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const frame = h('iframe.present-frame', { src: `${url}#pz-${i}`, allow: 'fullscreen; autoplay', title: 'Presentation' });
  const ov = h('div.present-overlay', null, frame,
    h('button.present-close', { type: 'button', title: 'Exit (Esc)', 'aria-label': 'Exit presentation' }, icon('x', 18)));
  let last = i, wasFull = false, keepUntil = 0;
  // Inside alphaCentaur the frame covers only the document pane; have the
  // host give it the whole window while presenting, in case fullscreen is refused.
  if (HOST) toHost('pz-presenting', { on: true });
  const close = () => {
    if (HOST) toHost('pz-presenting', { on: false });
    removeEventListener('message', onMsg);
    document.removeEventListener('fullscreenchange', onFs);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    ov.remove();
    URL.revokeObjectURL(url);
    app.goSlide(last);
    ui.viewport.focus({ preventScroll: true });
  };
  const onMsg = e => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'pz-exit') close();
    if (e.data?.type === 'pz-state') last = e.data.index;
    if (e.data?.type === 'pz-keep-open') keepUntil = Date.now() + 3000;   // the deck is opening the phone remote's window
  };
  const onFs = () => {
    if (document.fullscreenElement) wasFull = true;
    else if (wasFull && Date.now() < keepUntil) { wasFull = false; frame.contentWindow?.focus(); }
    else if (wasFull) close();
  };
  ov.querySelector('.present-close').addEventListener('click', close);
  addEventListener('message', onMsg);
  document.addEventListener('fullscreenchange', onFs);
  document.body.append(ov);
  ov.requestFullscreen?.().catch(() => {});
  frame.addEventListener('load', () => frame.contentWindow.focus());
}
async function presentInWindow() {
  canvas.finishEditing();
  // Presented from a blob: relative URLs become the project's absolute ones.
  const html = await exportDeck(app.deck, { localLibs: true, resolveURLs: HOST });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(`${url}#pz-${app.slideIndex}`, '_blank');
  if (!w) toast('The browser blocked the new window — allow pop-ups for this page.', 'error');
}

// ---------------------------------------------------------------- start --
if (HOST) startHost(); else route();
