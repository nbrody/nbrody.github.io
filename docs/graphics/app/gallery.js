// gallery.js — the studio home: browse the library, build & manage playlists,
// and launch the stage / remote.

import { VISUALIZATIONS, CATEGORIES, vizById, vizPath, vizThumb } from './manifest.js';
import { PlaylistStore } from './store.js';
import { qs, el, clear, params } from './util.js';

const catalog = qs('#catalog');
const editor = qs('#editor');
let activeId = null; // playlist currently being edited
const VIEW_KEY = 'graphics.galleryView';
const view = { mode: 'grid', query: '', cat: null };
try { if (localStorage.getItem(VIEW_KEY) === 'list') view.mode = 'list'; } catch { /* storage unavailable */ }

// ── toast ──────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = qs('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── launching ────────────────────────────────────────────────────────────────
function playPlaylist(id) {
  if (!id) return;
  location.href = `stage.html?pl=${encodeURIComponent(id)}`;
}
function openRemote(id) {
  const url = `remote.html${id ? `?pl=${encodeURIComponent(id)}` : ''}`;
  window.open(url, 'graphics-remote', 'width=420,height=820');
}
function playSingle(vizId) {
  location.href = `stage.html?viz=${encodeURIComponent(vizId)}`;
}

// ── library ──────────────────────────────────────────────────────────────────
function matches(v) {
  if (view.cat && v.cat !== view.cat) return false;
  const q = view.query.trim().toLowerCase();
  if (!q) return true;
  return [v.title, v.blurb, v.id, CATEGORIES[v.cat]?.label].some((s) => s && s.toLowerCase().includes(q));
}

/** How many times each visualization appears in the active playlist. */
function activeCounts() {
  const counts = new Map();
  const pl = activeId && PlaylistStore.get(activeId);
  for (const it of pl?.items || []) counts.set(it.vizId, (counts.get(it.vizId) || 0) + 1);
  return counts;
}

function renderCatalog() {
  clear(catalog);
  const counts = activeCounts();
  let shown = 0;
  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    const items = VISUALIZATIONS.filter((v) => v.cat === catKey && matches(v));
    if (!items.length) continue;
    shown += items.length;
    catalog.append(el('div', { class: 'cat-title', style: { '--cat': cat.accent } }, [cat.label, el('span', { class: 'n' }, `· ${items.length}`)]));
    const wrap = el('div', { class: view.mode === 'list' ? 'rows' : 'cards' });
    for (const v of items) wrap.append((view.mode === 'list' ? row : card)(v, cat.accent, counts.get(v.id) || 0));
    catalog.append(wrap);
  }
  if (!shown) catalog.append(el('div', { class: 'no-results' }, 'No visualizations match.'));
}

function thumb(v, inPlaylist) {
  const img = el('img', { src: vizThumb(v.id), alt: '', loading: 'lazy', decoding: 'async', width: '320', height: '200' });
  img.addEventListener('error', () => img.remove(), { once: true });
  return el('a', { class: 'thumb', href: vizPath(v.id), 'aria-label': `Open ${v.title}`, tabindex: '-1' }, [
    img,
    el('span', { class: 'glyph', 'aria-hidden': 'true' }, v.glyph),
    inPlaylist ? el('span', { class: 'in-pl', title: 'In the current playlist' }, inPlaylist > 1 ? `✓ ×${inPlaylist}` : '✓') : null,
  ]);
}

/** Direct links + add-to-playlist, shared by grid and list layouts. */
function links(v) {
  return el('div', { class: 'links' }, [
    el('button', { class: 'mini add', title: 'Add to current playlist', onclick: () => addToActive(v.id) }, '+ Add'),
    el('span', { class: 'spacer' }),
    el('a', { class: 'mini', href: `${vizPath(v.id)}?standalone=1`, target: '_blank', rel: 'noopener', title: 'Open the original page on its own, without the studio shell (new tab)' }, '↗'),
    el('button', { class: 'mini', title: `Copy link to ${vizPath(v.id)}`, onclick: () => copyLink(v) }, '⧉'),
  ]);
}

function card(v, accent, inPlaylist) {
  return el('article', { class: 'card', style: { '--cat': accent } }, [
    thumb(v, inPlaylist),
    el('div', { class: 'meta' }, [
      el('a', { class: 'name', href: vizPath(v.id) }, v.title),
      el('div', { class: 'blurb' }, v.blurb),
    ]),
    links(v),
  ]);
}

function row(v, accent, inPlaylist) {
  return el('article', { class: 'vrow', style: { '--cat': accent } }, [
    thumb(v, inPlaylist),
    el('div', { style: { minWidth: '0' } }, [
      el('div', { class: 'row', style: { gap: '0.5rem' } }, [
        el('a', { class: 'name', href: vizPath(v.id) }, v.title),
        el('span', { class: 'path' }, `${v.id}/`),
      ]),
      el('div', { class: 'blurb', title: v.blurb }, v.blurb),
    ]),
    links(v),
  ]);
}

async function copyLink(v) {
  const url = new URL(vizPath(v.id), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    toast(`Copied ${url}`);
  } catch {
    prompt('Copy this link:', url);
  }
}

function renderFilters() {
  const box = qs('#filters');
  clear(box);
  const chip = (key, label, accent) => el('button', {
    type: 'button', class: 'filter', 'aria-pressed': String(view.cat === key),
    style: accent ? { '--cat': accent } : {},
    onclick: () => { view.cat = key; renderFilters(); renderCatalog(); },
  }, label);
  box.append(chip(null, `All · ${VISUALIZATIONS.length}`));
  for (const [key, cat] of Object.entries(CATEGORIES)) box.append(chip(key, cat.label, cat.accent));
}

function wireLibraryTools() {
  qs('#search').addEventListener('input', (e) => { view.query = e.target.value; renderCatalog(); });
  const buttons = document.querySelectorAll('.view-toggle button');
  const sync = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view.mode)));
  buttons.forEach((b) => b.addEventListener('click', () => {
    view.mode = b.dataset.view;
    try { localStorage.setItem(VIEW_KEY, view.mode); } catch { /* storage unavailable */ }
    sync();
    renderCatalog();
  }));
  sync();
  renderFilters();
}

function addToActive(vizId) {
  if (!activeId) {
    const pl = PlaylistStore.create('My playlist', [vizId]);
    activeId = pl.id;
    toast(`Created "My playlist" + added ${vizById(vizId).title}`);
  } else {
    PlaylistStore.addItem(activeId, vizId);
    toast(`Added ${vizById(vizId).title}`);
  }
  refresh();
}

// ── editor ───────────────────────────────────────────────────────────────────
function renderEditor() {
  clear(editor);
  const all = PlaylistStore.all();
  if (activeId && !all.find((p) => p.id === activeId)) activeId = null;
  if (!activeId && all.length) activeId = all[0].id;

  // playlist picker + new
  const picker = el('select', {
    onchange: (e) => { activeId = e.target.value; refresh(); },
  }, all.map((p) => el('option', { value: p.id, selected: p.id === activeId }, `${p.name} · ${p.items.length}`)));
  editor.append(el('div', { class: 'row', style: { 'justify-content': 'space-between' } }, [el('h2', {}, 'Playlist'), el('span', { class: 'chip' }, `${all.length} saved`)]));

  if (!all.length) {
    editor.append(el('div', { class: 'empty-hint' }, 'No playlists yet. Add a visualization with “+ Add”, or click “New playlist”.'));
    editor.append(el('button', { class: 'btn primary', style: { width: '100%' }, onclick: newPlaylist }, '+ New playlist'));
    return;
  }

  editor.append(el('div', { class: 'pl-picker' }, [picker, el('button', { class: 'btn', title: 'New playlist', onclick: newPlaylist }, '+')]));

  const pl = PlaylistStore.get(activeId);
  if (!pl) return;

  // name
  editor.append(el('input', {
    class: 'pl-name', type: 'text', value: pl.name,
    onchange: (e) => { PlaylistStore.update(pl.id, { name: e.target.value.trim() || 'Untitled' }); refresh(); },
  }));

  // settings
  const advanceSel = el('select', {
    onchange: (e) => { PlaylistStore.update(pl.id, { advance: e.target.value }); refresh(); },
  }, [el('option', { value: 'manual', selected: pl.advance === 'manual' }, 'Manual'), el('option', { value: 'auto', selected: pl.advance === 'auto' }, 'Auto-advance')]);

  const settings = el('div', { class: 'pl-settings' }, [
    el('label', {}, 'Advance'), advanceSel,
    el('label', {}, 'Seconds / item'),
    el('input', {
      type: 'number', min: '3', max: '600', value: pl.defaultDuration,
      disabled: pl.advance !== 'auto',
      onchange: (e) => { PlaylistStore.update(pl.id, { defaultDuration: Math.max(3, Number(e.target.value) || 30) }); },
    }),
    el('label', { class: '', for: 'loopChk' }, 'Loop'),
    switchEl(pl.loop, (on) => PlaylistStore.update(pl.id, { loop: on })),
    el('label', {}, 'Shuffle'),
    switchEl(pl.shuffle, (on) => PlaylistStore.update(pl.id, { shuffle: on })),
  ]);
  editor.append(settings);

  // items
  const list = el('div', { class: 'items scroll' });
  if (!pl.items.length) {
    list.append(el('div', { class: 'empty-hint' }, 'Empty — add visualizations from the library with “+ Add”.'));
  } else {
    pl.items.forEach((it, i) => list.append(itemRow(pl, it, i)));
  }
  editor.append(list);

  // actions
  editor.append(el('div', { class: 'pl-actions' }, [
    el('button', { class: 'btn primary full', disabled: !pl.items.length, onclick: () => playPlaylist(pl.id) }, '▶ Play on stage'),
    el('button', { class: 'btn', onclick: () => openRemote(pl.id) }, '🕹 Remote'),
    el('button', { class: 'btn', onclick: () => { PlaylistStore.duplicate(pl.id); refresh(); toast('Duplicated'); } }, '⧉ Duplicate'),
    el('button', { class: 'btn', onclick: () => exportPlaylist(pl.id) }, '⇩ Export'),
    el('button', { class: 'btn danger', onclick: () => { if (confirm(`Delete "${pl.name}"?`)) { PlaylistStore.remove(pl.id); activeId = null; refresh(); } } }, '🗑 Delete'),
  ]));
}

function switchEl(checked, onToggle) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onToggle(input.checked));
  return el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]);
}

function itemRow(pl, it, i) {
  const v = vizById(it.vizId);
  const row = el('div', { class: 'pl-item', draggable: 'true', dataset: { index: String(i) } }, [
    el('span', { class: 'idx' }, String(i + 1)),
    el('span', { class: 'g' }, v ? plThumb(v) : '▦'),
    v ? el('a', { class: 't', href: vizPath(v.id), title: `Open ${v.title}` }, v.title) : el('span', { class: 't' }, it.vizId),
    el('span', { class: 'ord' }, [
      el('button', { title: 'Move up', onclick: () => { PlaylistStore.moveItem(pl.id, i, i - 1); refresh(); } }, '▲'),
      el('button', { title: 'Move down', onclick: () => { PlaylistStore.moveItem(pl.id, i, i + 1); refresh(); } }, '▼'),
    ]),
    el('button', { class: 'x', title: 'Remove', onclick: () => { PlaylistStore.removeItemAt(pl.id, i); refresh(); } }, '✕'),
  ]);
  // drag-to-reorder
  row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
  row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('dragover'); });
  row.addEventListener('dragleave', () => row.classList.remove('dragover'));
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('dragover');
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from) && from !== i) { PlaylistStore.moveItem(pl.id, from, i); refresh(); }
  });
  return row;
}

function plThumb(v) {
  const img = el('img', { src: vizThumb(v.id), alt: '', loading: 'lazy', width: '40', height: '25' });
  img.addEventListener('error', () => img.replaceWith(v.glyph), { once: true });
  return img;
}

function newPlaylist() {
  const pl = PlaylistStore.create('New playlist');
  activeId = pl.id;
  refresh();
  toast('Playlist created');
}

// ── import / export ──────────────────────────────────────────────────────────
function exportPlaylist(id) {
  const json = PlaylistStore.exportOne(id);
  const pl = PlaylistStore.get(id);
  const blob = new Blob([json], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${(pl?.name || 'playlist').replace(/\s+/g, '-')}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  toast('Exported JSON');
}

function wireImport() {
  const dlg = qs('#importDialog');
  qs('#importBtn').addEventListener('click', () => { qs('#importText').value = ''; dlg.showModal(); });
  qs('#importCancel').addEventListener('click', () => dlg.close());
  qs('#importConfirm').addEventListener('click', () => {
    try {
      const n = PlaylistStore.import(qs('#importText').value);
      dlg.close();
      refresh();
      toast(n ? `Imported ${n} playlist${n > 1 ? 's' : ''}` : 'Nothing valid to import');
    } catch (err) {
      toast(err.message || 'Import failed');
    }
  });
}

// ── glue ─────────────────────────────────────────────────────────────────────
function refresh() {
  renderEditor();
  renderCatalog(); // playlist membership badges
}

function init() {
  // pre-select a playlist if linked with ?pl=
  const p = params();
  if (p.pl && PlaylistStore.get(p.pl)) activeId = p.pl;

  wireLibraryTools();
  renderEditor();
  renderCatalog();
  wireImport();
  qs('#newPlBtn').addEventListener('click', newPlaylist);

  // keep editor fresh if another tab edits the same store
  window.addEventListener('playlists:changed', refresh);
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('graphics.playlists')) refresh(); });
}

init();
