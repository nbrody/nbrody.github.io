// Two saves of one library reference must not both succeed. The notes field
// and a highlight leave together (a highlight click blurs the notes), and each
// sends the revision it loaded. The later one has to come back as a conflict
// carrying the reference that landed, which is what the reader applies its own
// change to. The published editors intercept fetch in boot.js; they do not
// register sw.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const stores = { changes: new Map(), state: new Map() };

function request(result) {
  const req = { result };
  Object.defineProperty(req, 'onsuccess', { set(fn) { queueMicrotask(fn); } });
  Object.defineProperty(req, 'onerror', { set() {} });
  return req;
}

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
            get: (k) => request(store.get(k)),
            put: (v, k) => { store.set(k, v); return request(k); },
            getAllKeys: () => request([...store.keys()]),
            getAll: () => request([...store.values()]),
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

const { create, read, dispatch } = await import('./boot.js');

const endpoint = 'https://demo.example/library/api/library/reference';

function put(path, record, baseRevision) {
  return dispatch('library', 'library/reference', new URL(endpoint), new Request(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: path, record, baseRevision }),
  }));
}

test('overlapping library saves: one wins and the other conflicts with that reference', async () => {
  const path = 'references/paper.json';
  const original = { title: 'Paper', annotation: '', highlights: [] };
  const created = await create('library', path, { content: `${JSON.stringify(original)}\n` });
  const noted = { ...original, annotation: 'check the cusp' };
  const marked = { ...original, highlights: [{ id: 'h1', quote: 'cusp' }] };
  const [notes, highlight] = await Promise.all([
    put(path, noted, created.revision),
    put(path, marked, created.revision),
  ]);
  const results = await Promise.all([notes, highlight].map(async (res) => ({ status: res.status, body: await res.json() })));
  const won = results.filter((r) => r.status === 200);
  const lost = results.filter((r) => r.status === 409);
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);

  const stored = await read('library', path);
  const conflict = lost[0].body.current;
  assert.equal(conflict.id, path);
  assert.equal(conflict.revision, stored.revision);
  assert.equal(conflict.content, stored.content);
  assert.equal(won[0].body.revision, stored.revision);

  // The reader retries once, onto the conflict's record, so the field that
  // lost is written beside the field that won.
  const winner = JSON.parse(stored.content);
  const other = JSON.parse(stored.content).annotation === 'check the cusp' ? marked : noted;
  const merged = winner.annotation === 'check the cusp'
    ? { ...winner, highlights: other.highlights }
    : { ...winner, annotation: other.annotation };
  const retry = await put(path, merged, stored.revision);
  assert.equal(retry.status, 200);
  const final = JSON.parse((await read('library', path)).content);
  assert.equal(final.annotation, 'check the cusp');
  assert.deepEqual(final.highlights, [{ id: 'h1', quote: 'cusp' }]);
});
