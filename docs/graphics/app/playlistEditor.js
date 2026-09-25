import { VISUALIZATIONS, vizById } from './manifest.js';
import { PlaylistStore } from './store.js';
import { normalizePayload, normalizeItem } from './payload.js';
import { CMD, EVT } from './protocol.js';
import { el } from './util.js';

export function mountPlaylistEditor(container, transport) {
  let draft = { name: 'My playlist', items: [], advance: 'manual', loop: true, defaultDuration: 30 };
  let latest;
  const status = el('p', { role: 'status', class: 'faint' });
  const report = message => { status.textContent = message; };
  const safe = fn => () => { try { fn(); } catch (e) { report(e.message); } };
  const button = (label, fn, kind = '') => el('button', { type: 'button', class: `btn ${kind}`.trim(), onclick: safe(fn) }, label);
  const card = (title, children) => el('div', { class: 'pc-card' }, [el('div', { class: 'pc-label' }, title), ...children]);
  const toggle = (input, text) => el('label', { class: 'cv-row' }, [el('span', { class: 'cv-row-label' }, text), el('span', { class: 'switch' }, [input, el('span', { class: 'track' })])]);
  const name = el('input', { type: 'text', 'aria-label': 'Playlist name', value: draft.name });
  const saved = el('select', { 'aria-label': 'Saved playlists' });
  const catalog = el('select', { 'aria-label': 'Visualization to add' }, VISUALIZATIONS.map(v => el('option', { value: v.id }, v.title)));
  const rows = el('div', { class: 'editor-items' });
  const duration = el('input', { type: 'number', min: 1, value: 30, 'aria-label': 'Default seconds per visualization' });
  const auto = el('input', { type: 'checkbox', 'aria-label': 'Auto-advance' });
  const loop = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Loop' });
  const payload = el('textarea', { rows: 5, 'aria-label': 'Current visualization JSON payload', placeholder: '{ "#speed": 0.5 }', spellcheck: 'false' });
  function refreshSaved() {
    const value = saved.value;
    saved.replaceChildren(el('option', { value: '' }, 'Choose a saved playlist…'), ...PlaylistStore.all().map(p => el('option', { value: p.id }, p.name)));
    saved.value = value;
  }
  function readSettings() {
    draft.name = name.value.trim() || 'Untitled playlist';
    draft.defaultDuration = Number(duration.value);
    if (!(draft.defaultDuration > 0)) throw new Error('Duration must be greater than zero.');
    draft.advance = auto.checked ? 'auto' : 'manual'; draft.loop = loop.checked;
    if (!draft.items.length) throw new Error('Add at least one visualization.');
    return structuredClone(draft);
  }
  function showDraft() {
    name.value = draft.name; duration.value = draft.defaultDuration || 30;
    auto.checked = draft.advance === 'auto'; loop.checked = draft.loop !== false;
    renderRows();
  }
  function renderRows() {
    rows.replaceChildren();
    draft.items.forEach((item, i) => {
      const seconds = el('input', { type: 'number', min: 1, placeholder: 'Default seconds', value: item.duration, 'aria-label': `Duration for item ${i + 1}` });
      seconds.onchange = () => { item.duration = Number(seconds.value) > 0 ? Number(seconds.value) : null; };
      const json = el('textarea', { rows: 3, 'aria-label': `Payload for item ${i + 1}`, spellcheck: 'false' }, JSON.stringify(item.payload || {}, null, 2));
      json.onchange = () => { try { item.payload = normalizePayload(JSON.parse(json.value)); json.setCustomValidity(''); } catch (e) { json.setCustomValidity(e.message); json.reportValidity(); } };
      const move = delta => { const j = i + delta; if (j < 0 || j >= draft.items.length) return; [draft.items[i], draft.items[j]] = [draft.items[j], draft.items[i]]; renderRows(); };
      rows.append(el('div', { class: 'editor-item' }, [
        el('strong', {}, `${i + 1}. ${vizById(item.vizId)?.title || item.vizId}`),
        el('div', { class: 'btn-row' }, [button('↑', () => move(-1)), button('↓', () => move(1)), button('Remove', () => { draft.items.splice(i, 1); renderRows(); }, 'danger')]), seconds,
        el('details', {}, [el('summary', {}, 'Load payload (JSON)'), json]),
      ]));
    });
  }
  function validatedDraft() {
    for (const [i, input] of [...rows.querySelectorAll('textarea')].entries()) {
      try { draft.items[i].payload = normalizePayload(JSON.parse(input.value)); input.setCustomValidity(''); }
      catch (e) { input.setCustomValidity(e.message); input.reportValidity(); throw e; }
    }
    return readSettings();
  }
  transport.on(EVT.STATE, st => { latest = st; });
  transport.on(EVT.NOTICE, ({ message }) => report(message));
  const adopt = () => {
    if (!latest) throw new Error('Connect a display first.');
    draft = { id: latest.playlistId, name: latest.playlistName, items: latest.items.map(normalizeItem), advance: latest.advance, loop: latest.loop, defaultDuration: latest.defaultDuration };
    showDraft(); report('Display queue copied into the editor.');
  };
  container.append(
    card('Queue tools', [
      el('div', { class: 'btn-row' }, [button('Random next', () => transport.send(CMD.RANDOM)), button('Shuffle queue', () => transport.send(CMD.SHUFFLE))]),
    ]),
    card('Saved playlists', [
      saved,
      el('div', { class: 'btn-row' }, [button('Load saved', () => { const pl = PlaylistStore.get(saved.value); if (!pl) throw new Error('Choose a saved playlist.'); draft = { ...pl, items: pl.items.map(normalizeItem) }; showDraft(); }), button('New', () => { draft = { name: 'My playlist', items: [], advance: 'manual', loop: true, defaultDuration: 30 }; showDraft(); }), button('Use display queue', adopt)]),
    ]),
    card('Edit playlist', [
      name,
      el('div', { class: 'row' }, [catalog, button('Add visualization', () => { draft.items.push(normalizeItem({ vizId: catalog.value })); renderRows(); }, 'alt')]),
      rows,
      el('label', { class: 'cv-row' }, [el('span', { class: 'cv-row-label' }, 'Default seconds'), el('span', { style: { width: '6.5rem' } }, duration)]),
      toggle(auto, 'Auto-advance'), toggle(loop, 'Loop'),
      el('div', { class: 'btn-row' }, [
        button('Play on display', () => { transport.send(CMD.LOAD_PLAYLIST, { playlist: validatedDraft() }); report('Playlist sent to display.'); }, 'primary'),
        button('Save playlist', () => { const pl = validatedDraft(); if (!pl.id || !PlaylistStore.get(pl.id)) draft = PlaylistStore.create(pl.name, pl.items); draft = PlaylistStore.update(draft.id, { ...pl, id: draft.id }); refreshSaved(); saved.value = draft.id; report('Playlist saved in this browser.'); }),
        button('Export JSON', () => { const blob = new Blob([JSON.stringify(validatedDraft(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = el('a', { href: url, download: 'graphics-playlist.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }),
      ]),
      el('label', { class: 'pc-sub' }, ['Import playlists ', el('input', { type: 'file', accept: '.json,application/json', onchange: async e => { try { const file = e.target.files[0]; if (!file) return; const count = PlaylistStore.import(await file.text()); refreshSaved(); report(`Imported ${count} playlists.`); } catch (err) { report(err.message); } } })]),
    ]),
    card('Current visualization payload', [
      payload,
      el('div', { class: 'btn-row' }, [button('Read parameters', () => { const item = latest?.items[latest.index]; payload.value = JSON.stringify(item?.payload || {}, null, 2); }), button('Apply payload', () => transport.send(CMD.APPLY_PAYLOAD, { payload: normalizePayload(JSON.parse(payload.value || '{}')) })), button('Capture current view', () => transport.send(CMD.SAVE_VIEW))]),
      el('p', { class: 'pc-sub' }, 'To save live adjustments: capture the current view, use the display queue, then save the playlist. Payload keys are control IDs (such as #speed) or selectors. Saved playlists can be exported to another browser.'),
    ]),
    status,
  );
  refreshSaved();
  window.addEventListener('storage', refreshSaved);
  window.addEventListener('playlists:changed', refreshSaved);
}
