// Two saves of one web-demo file must not both succeed. The notes field and a
// highlight leave together (a highlight click blurs the notes), and each sends
// the revision it loaded. The later one has to come back as a conflict carrying
// the text that landed, which is what the reader applies its own change to.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const stores = { changes: new Map(), state: new Map() };

globalThis.addEventListener = () => {};
globalThis.skipWaiting = () => {};
globalThis.clients = { claim: async () => {} };
globalThis.location = new URL('./', import.meta.url);
globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        createObjectStore(name) { stores[name] ||= new Map(); },
        transaction(name) {
          const store = stores[name];
          const tx = { error: null };
          Object.defineProperty(tx, 'oncomplete', { set(fn) { queueMicrotask(fn); } });
          Object.defineProperty(tx, 'onerror', { set() {} });
          tx.objectStore = () => ({
            get: (k) => ({ result: store.get(k) }),
            put: (v, k) => { store.set(k, v); return { result: k }; },
            getAllKeys: () => ({ result: [...store.keys()] }),
            getAll: () => ({ result: [...store.values()] }),
          });
          return tx;
        },
      };
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ name: 'demo', files: [] }),
  arrayBuffer: async () => new ArrayBuffer(0),
});

const { create, read, write } = await import('./sw.js');

test('overlapping saves of one file: one wins and the other conflicts with that text', async () => {
  const path = 'references/paper.json';
  const original = '{"title":"Paper","annotation":"","highlights":[]}\n';
  const created = await create('library', path, { content: original });
  const noted = '{"title":"Paper","annotation":"check the cusp","highlights":[]}\n';
  const marked = '{"title":"Paper","annotation":"","highlights":[{"id":"h1","quote":"cusp"}]}\n';
  const [notes, highlight] = await Promise.allSettled([
    write('library', path, noted, created.revision),
    write('library', path, marked, created.revision),
  ]);
  const won = [notes, highlight].filter((r) => r.status === 'fulfilled');
  const lost = [notes, highlight].filter((r) => r.status === 'rejected');
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].reason.status, 409);

  const stored = await read('library', path);
  assert.ok(stored.content === noted || stored.content === marked);
  assert.equal(won[0].value.revision, stored.revision);
  assert.equal(lost[0].reason.current.content, stored.content);
  assert.equal(lost[0].reason.current.revision, stored.revision);

  // The reader retries once, onto the conflict's record, so the field that
  // lost is written beside the field that won.
  const winner = JSON.parse(stored.content);
  const other = JSON.parse(stored.content === noted ? marked : noted);
  const merged = stored.content === noted
    ? { ...winner, highlights: other.highlights }
    : { ...winner, annotation: other.annotation };
  const retry = JSON.stringify(merged) + '\n';
  const saved = await write('library', path, retry, stored.revision);
  const final = JSON.parse((await read('library', path)).content);
  assert.equal(saved.revision, (await read('library', path)).revision);
  assert.equal(final.annotation, 'check the cusp');
  assert.deepEqual(final.highlights, [{ id: 'h1', quote: 'cusp' }]);
});
