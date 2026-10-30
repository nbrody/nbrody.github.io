// Decks persist in IndexedDB (they can hold megabytes of images, which would
// overflow localStorage). Where the browser supports the File System Access
// API, a deck also remembers the .html file it was opened from or saved to.

const DB = 'alphacentaur-presentations', STORE = 'decks';
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const listDecks = () => tx('readonly', s => s.getAll()).then(all => all.sort((a, b) => b.updated - a.updated));
export const getDeck = id => tx('readonly', s => s.get(id));
export const deleteDeck = id => tx('readwrite', s => s.delete(id));
export async function putDeck(record) {
  record.updated = Date.now();
  try {
    await tx('readwrite', s => s.put(record));
  } catch (e) {
    // Some browsers refuse to clone file handles; keep the deck regardless.
    if (record.handle) { const { handle, ...rest } = record; await tx('readwrite', s => s.put(rest)); }
    else throw e;
  }
  return record;
}

export const canUseFiles = () => 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
const types = [{ description: 'HTML presentation', accept: { 'text/html': ['.html', '.htm'] } }];

export async function pickOpenFile() {
  const [handle] = await window.showOpenFilePicker({ types, multiple: false });
  const file = await handle.getFile();
  return { handle, text: await file.text(), name: file.name };
}
export async function pickSaveFile(suggestedName) {
  return window.showSaveFilePicker({ suggestedName, types });
}
export async function writeHandle(handle, text) {
  if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permission to write the file was declined.');
  }
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}
