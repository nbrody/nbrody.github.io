// store.js — playlist persistence in localStorage.
//
// A playlist is an ordered sequence of visualization references plus playback
// settings. Gallery, stage, and remote all read/write the same store, keyed by
// playlist id, so opening a playlist on the display and on a remote stays in
// sync through localStorage + the live transport.

import { uid } from './util.js';
import { vizById } from './manifest.js';

const KEY = 'graphics.playlists.v1';

/** Default playback settings for a fresh playlist. */
function defaults() {
  return {
    advance: 'manual', // 'manual' | 'auto'
    defaultDuration: 30, // seconds per item in auto mode
    loop: true,
    shuffle: false,
  };
}

/** Shape of a single playlist item. `state` is a captured control snapshot
 *  (selector → value) applied on load — reserved for the preset feature. */
function makeItem(vizId, extra = {}) {
  return { vizId, duration: null, state: null, ...extra };
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  // Notify same-tab listeners (the storage event only fires in *other* tabs).
  window.dispatchEvent(new CustomEvent('playlists:changed'));
}

export const PlaylistStore = {
  /** All playlists, newest first. */
  all() {
    return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  get(id) {
    return readAll().find((p) => p.id === id) || null;
  },

  /** Create and persist a new playlist. `items` may be ids or item objects. */
  create(name, items = []) {
    const now = Math.floor(performance.now());
    const pl = {
      id: uid('pl'),
      name: name || 'Untitled playlist',
      createdAt: now,
      updatedAt: now,
      ...defaults(),
      items: items.map((it) => (typeof it === 'string' ? makeItem(it) : it)),
    };
    const list = readAll();
    list.push(pl);
    writeAll(list);
    return pl;
  },

  /** Shallow-merge a patch into a playlist and persist. */
  update(id, patch) {
    const list = readAll();
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, id, updatedAt: Math.floor(performance.now()) };
    writeAll(list);
    return list[i];
  },

  remove(id) {
    writeAll(readAll().filter((p) => p.id !== id));
  },

  duplicate(id) {
    const src = this.get(id);
    if (!src) return null;
    return this.create(`${src.name} (copy)`, src.items.map((it) => ({ ...it })));
  },

  // — item helpers —
  addItem(id, vizId) {
    const pl = this.get(id);
    if (!pl) return null;
    return this.update(id, { items: [...pl.items, makeItem(vizId)] });
  },

  removeItemAt(id, index) {
    const pl = this.get(id);
    if (!pl) return null;
    const items = pl.items.slice();
    items.splice(index, 1);
    return this.update(id, { items });
  },

  /** Move the item at `from` to `to` (clamped). */
  moveItem(id, from, to) {
    const pl = this.get(id);
    if (!pl) return null;
    const items = pl.items.slice();
    if (from < 0 || from >= items.length) return pl;
    const dest = Math.max(0, Math.min(items.length - 1, to));
    const [moved] = items.splice(from, 1);
    items.splice(dest, 0, moved);
    return this.update(id, { items });
  },

  makeItem,

  // — import / export —
  exportOne(id) {
    const pl = this.get(id);
    return pl ? JSON.stringify(pl, null, 2) : null;
  },

  exportAll() {
    return JSON.stringify(readAll(), null, 2);
  },

  /**
   * Import playlists from a JSON string (single object or array). Items
   * referencing unknown visualizations are dropped. Returns imported count.
   */
  import(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('Not valid JSON.');
    }
    const incoming = Array.isArray(data) ? data : [data];
    const list = readAll();
    let count = 0;
    for (const raw of incoming) {
      if (!raw || !Array.isArray(raw.items)) continue;
      const now = Math.floor(performance.now());
      const items = raw.items
        .map((it) => (typeof it === 'string' ? makeItem(it) : it))
        .filter((it) => it && vizById(it.vizId));
      list.push({
        id: uid('pl'),
        name: String(raw.name || 'Imported playlist'),
        createdAt: now,
        updatedAt: now,
        ...defaults(),
        advance: raw.advance === 'auto' ? 'auto' : 'manual',
        defaultDuration: Number(raw.defaultDuration) || 30,
        loop: raw.loop !== false,
        shuffle: !!raw.shuffle,
        items,
      });
      count++;
    }
    writeAll(list);
    return count;
  },
};
