// gallery.js — the studio home: browse the library, build & manage playlists,
// and launch the stage / remote.

import { VISUALIZATIONS, CATEGORIES, vizById } from './manifest.js';
import { PlaylistStore } from './store.js';
import { qs, el, clear, params } from './util.js';

const catalog = qs('#catalog');
const editor = qs('#editor');
let activeId = null; // playlist currently being edited

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
function renderCatalog() {
  clear(catalog);
  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    const items = VISUALIZATIONS.filter((v) => v.cat === catKey);
    if (!items.length) continue;
    catalog.append(el('div', { class: 'cat-title', style: { '--cat': cat.accent } }, cat.label));
    const grid = el('div', { class: 'cards' });
    for (const v of items) grid.append(card(v, cat.accent));
    catalog.append(grid);
  }
}

function card(v, accent) {
  const open = el('button', { class: 'btn icon', title: `Open ${v.title} on the stage`, onclick: () => playSingle(v.id) }, '▶');
  const add = el('button', { class: 'btn icon', title: 'Add to current playlist', onclick: () => addToActive(v.id) }, '+');
  return el('div', { class: 'card', style: { '--cat': accent }, tabindex: '0' }, [
    el('div', { class: 'actions' }, [open, add]),
    el('div', { class: 'thumb' }, v.glyph),
    el('div', { class: 'meta' }, [
      el('div', { class: 'name' }, v.title),
      el('div', { class: 'blurb' }, v.blurb),
    ]),
  ]);
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
  renderEditor();
}

// ── editor ───────────────────────────────────────────────────────────────────
function renderEditor() {
  clear(editor);
  const all = PlaylistStore.all();
  if (activeId && !all.find((p) => p.id === activeId)) activeId = null;
  if (!activeId && all.length) activeId = all[0].id;

  // playlist picker + new
  const picker = el('select', {
    onchange: (e) => { activeId = e.target.value; renderEditor(); },
  }, all.map((p) => el('option', { value: p.id, selected: p.id === activeId }, `${p.name} · ${p.items.length}`)));
  editor.append(el('div', { class: 'row', style: { 'justify-content': 'space-between' } }, [el('h2', {}, 'Playlist'), el('span', { class: 'chip' }, `${all.length} saved`)]));

  if (!all.length) {
    editor.append(el('div', { class: 'empty-hint' }, 'No playlists yet. Add a visualization with “+”, or click “New playlist”.'));
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
    list.append(el('div', { class: 'empty-hint' }, 'Empty — add visualizations from the library with “+”.'));
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
    el('span', { class: 'g' }, v?.glyph || '▦'),
    el('span', { class: 't', title: v?.title || it.vizId }, v?.title || it.vizId),
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
}

function init() {
  // pre-select a playlist if linked with ?pl=
  const p = params();
  if (p.pl && PlaylistStore.get(p.pl)) activeId = p.pl;

  renderCatalog();
  renderEditor();
  wireImport();
  qs('#newPlBtn').addEventListener('click', newPlaylist);

  // keep editor fresh if another tab edits the same store
  window.addEventListener('playlists:changed', renderEditor);
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('graphics.playlists')) renderEditor(); });
}

init();
