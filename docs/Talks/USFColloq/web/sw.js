// alphaCentaur's web demo: the standalone editors on a static web host.
//
// Each editor talks to a folder server (server/applet-server.mjs, latex/server.mjs,
// server/library-folder.mjs) at <editor>/api/…. On a static host this service
// worker answers those requests instead. The folder's files are shipped beside
// it (data/<editor>/files/, listed in data/<editor>/manifest.json), and changes
// stay in this browser (IndexedDB), so a visitor can edit freely and a reload
// keeps their edits. alphaTeX can't run TeX here: it serves the build recorded by
// scripts/build-web-demo.mjs (PDF, log, word count) and answers SyncTeX from the
// recorded tables. Built by scripts/build-web-demo.mjs; see webdemo/README.md.
import { kindOf, editable, cleanPath, IMAGE } from './latex/js/kinds.js';
import { citationKey, paperPath, parseArxiv } from './library/js/references.js';

const BASE = new URL('./', self.location.href);
const EDITORS = { markdown: 'alphaMarkdown', ink: 'alphaNote', library: 'alphaLibrary', latex: 'alphaTeX', python: 'alphaPy' };
const MAX_TEXT = 4 * 1024 * 1024;
const enc = new TextEncoder(), dec = new TextDecoder();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const m = /^([a-z]+)\/api\/(.+)$/.exec(url.pathname.slice(BASE.pathname.length));
  if (!m || !EDITORS[m[1]]) return;
  e.respondWith(handle(m[1], m[2], url, e.request).catch((err) =>
    json(err.status || 500, { error: err.status ? err.message : `The web demo hit an error: ${err.message || err}`, ...(err.current ? { current: err.current } : {}) })));
});

// ---------------------------------------------------------------- helpers --
const fault = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const need = (ok, status, message) => { if (!ok) throw fault(status, message); };
const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const body = async (req) => { try { return await req.json(); } catch { return {}; } };
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf' };
const ext = (p) => (/\.[^./]+$/.exec(p)?.[0] || '').toLowerCase();
const base = (p) => p.split('/').pop();
const isEntryPoint = (s) => /\\begin\s*\{document\}/.test(s.replace(/(?<!\\)%[^\n]*/g, ''));
const hashes = new WeakMap();
async function revisionOf(bytes) {   // the servers' revision: the first 16 hex digits of the SHA-1
  if (hashes.has(bytes)) return hashes.get(bytes);
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  hashes.set(bytes, h);
  return h;
}
const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (b64) => Uint8Array.from(atob(String(b64)), (c) => c.charCodeAt(0));

// ------------------------------------------------------- the files' store --
// What shipped: data/<editor>/manifest.json and data/<editor>/files/<path>.
const shipped = new Map();   // editor → Promise<Map(path → {size, mtime})>
const shippedBytes = new Map();
const manifest = (ed) => {
  if (!shipped.has(ed)) shipped.set(ed, fetch(new URL(`data/${ed}/manifest.json`, BASE)).then((r) => r.json()).then((m) => new Map(m.files.map((f) => [f.path, f]))));
  return shipped.get(ed);
};
async function shippedFile(ed, p) {
  const key = `${ed}:${p}`;
  if (!shippedBytes.has(key)) {
    const r = await fetch(new URL(`data/${ed}/files/${p.split('/').map(encodeURIComponent).join('/')}`, BASE));
    need(r.ok, 404, `${p} was not found.`);
    shippedBytes.set(key, new Uint8Array(await r.arrayBuffer()));
  }
  return shippedBytes.get(key);
}
// What changed here: IndexedDB "changes", key "<editor>:<path>" →
// {bytes | null (deleted), mtime, history: [{id, created, content}]}.
let opened = null;
const idb = () => opened ||= new Promise((resolve, reject) => {
  const r = indexedDB.open('alphacentaur-web-demo', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('changes'); r.result.createObjectStore('state'); };
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
});
async function tx(storeName, mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode), req = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error);
  });
}
const getChange = (ed, p) => tx('changes', 'readonly', (s) => s.get(`${ed}:${p}`));
const putChange = (ed, p, v) => tx('changes', 'readwrite', (s) => s.put(v, `${ed}:${p}`));
async function changes(ed) {
  const [keys, values] = await Promise.all([tx('changes', 'readonly', (s) => s.getAllKeys()), tx('changes', 'readonly', (s) => s.getAll())]);
  const out = new Map();
  keys.forEach((k, i) => { if (k.startsWith(ed + ':')) out.set(k.slice(ed.length + 1), values[i]); });
  return out;
}
const getState = (k) => tx('state', 'readonly', (s) => s.get(k));
const putState = (k, v) => tx('state', 'readwrite', (s) => s.put(v, k));

async function bytesOf(ed, p) {   // null when the file doesn't exist
  const c = await getChange(ed, p);
  if (c) return c.bytes ? new Uint8Array(c.bytes) : null;
  return (await manifest(ed)).has(p) ? shippedFile(ed, p) : null;
}
async function entry(ed, p, bytes) {
  const kind = kindOf(p), text = editable(kind) && bytes.length <= MAX_TEXT;
  return { id: p, path: p, kind, size: bytes.length, revision: text ? await revisionOf(bytes) : `${bytes.length}-0`,
    main: kind === 'tex' && isEntryPoint(dec.decode(bytes)), ...(text ? {} : { binary: true }) };
}
async function list(ed) {
  const [m, c] = await Promise.all([manifest(ed), changes(ed)]);
  const paths = [...new Set([...m.keys(), ...c.keys()])].sort((a, b) => a.localeCompare(b));
  const out = [];
  for (const p of paths) {
    const ch = c.get(p);
    if (ch && !ch.bytes) continue;
    out.push(await entry(ed, p, ch ? new Uint8Array(ch.bytes) : await shippedFile(ed, p)));
  }
  return out;
}
const clean = (p) => { const r = cleanPath(p); need(r, 400, 'Use a relative path inside the folder, such as notes/idea.md.'); return r; };
async function read(ed, p) {
  p = clean(p);
  const bytes = await bytesOf(ed, p);
  need(bytes, 404, `${p} was not found.`);
  need(editable(kindOf(p)) && bytes.length <= MAX_TEXT, 415, `${p} is not a text file the editor can open.`);
  return { ...(await entry(ed, p, bytes)), content: dec.decode(bytes) };
}
async function save(ed, p, bytes, previous) {
  const old = (await getChange(ed, p)) || {};
  const history = (old.history || []).slice(-49);
  const now = Date.now();
  if (!history.length && previous) history.push({ id: String(now - 1), created: new Date(now - 1).toISOString(), content: dec.decode(previous) });
  if (editable(kindOf(p))) history.push({ id: String(now), created: new Date(now).toISOString(), content: dec.decode(bytes) });
  await putChange(ed, p, { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mtime: now, history });
}
async function write(ed, p, content, baseRevision) {
  p = clean(p);
  need(typeof content === 'string' && content.length <= MAX_TEXT, 413, 'This file is too large to save.');
  const current = await bytesOf(ed, p);
  need(current, 404, `${p} was not found.`);
  if ((await revisionOf(current)) !== baseRevision)
    throw fault(409, `${p} changed since it was opened.`, { current: { content: dec.decode(current), revision: await revisionOf(current) } });
  const bytes = enc.encode(content);
  await save(ed, p, bytes, current);
  return entry(ed, p, bytes);
}
async function create(ed, p, { content = '', base64, overwrite = false } = {}) {
  p = clean(p);
  need(overwrite || !(await bytesOf(ed, p)), 409, `${p} already exists.`);
  const bytes = base64 !== undefined ? fromBase64(base64) : enc.encode(String(content));
  await save(ed, p, bytes, null);
  return entry(ed, p, bytes);
}
async function rename(ed, p, to) {
  p = clean(p); to = clean(to);
  const bytes = await bytesOf(ed, p);
  need(bytes, 404, `${p} was not found.`);
  need(!(await bytesOf(ed, to)), 409, `${to} already exists.`);
  const old = await getChange(ed, p);
  await putChange(ed, to, { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mtime: Date.now(), history: old?.history || [] });
  await putChange(ed, p, { bytes: null, mtime: Date.now(), history: [] });
  return entry(ed, to, bytes);
}
async function remove(ed, p) {
  p = clean(p);
  need(await bytesOf(ed, p), 404, `${p} was not found.`);
  await putChange(ed, p, { bytes: null, mtime: Date.now(), history: [] });
  return { ok: true, trashed: 'removed in this browser (reload the demo data to restore it)' };
}
async function versions(ed, p) {
  const c = await getChange(ed, clean(p));
  return (c?.history || []).slice().reverse().map((v) => ({ id: v.id, created: v.created, author: 'Saved', size: v.content.length }));
}
async function version(ed, p, id) {
  const v = ((await getChange(ed, clean(p)))?.history || []).find((x) => x.id === String(id));
  need(v, 404, 'That version is no longer kept.');
  return { id: v.id, content: v.content };
}
async function raw(ed, p, download) {
  p = clean(p);
  const bytes = await bytesOf(ed, p);
  need(bytes, 404, `${p} was not found.`);
  const inline = (IMAGE.test(p) || ext(p) === '.pdf') && !download;
  return new Response(bytes, { headers: {
    'Content-Type': inline ? TYPES[ext(p)] : 'application/octet-stream', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    ...(inline ? {} : { 'Content-Disposition': `attachment; filename="${base(p).replace(/"/g, '')}"` }),
  } });
}

// --------------------------------------------------------------- requests --
async function handle(ed, route, url, req) {
  const q = url.searchParams, key = `${req.method} ${route}`;
  if (ed === 'library' && route.startsWith('library')) return library(key, url, req);
  if (ed === 'latex') { const r = await latex(key, route, url, req); if (r) return r; }
  switch (key) {
    case 'GET info': {
      const m = await fetch(new URL(`data/${ed}/manifest.json`, BASE)).then((r) => r.json());
      return json(200, { applet: EDITORS[ed], name: m.name, root: `${m.name} (web demo: changes stay in this browser)` });
    }
    case 'GET files': return json(200, { files: await list(ed), truncated: false });
    case 'GET file': return json(200, await read(ed, q.get('path')));
    case 'PUT file': { const b = await body(req); return json(200, await write(ed, b.path, b.content, b.baseRevision)); }
    case 'POST file': { const b = await body(req); return json(201, await create(ed, b.path, b)); }
    case 'POST rename': { const b = await body(req); return json(200, await rename(ed, b.path, b.to)); }
    case 'POST delete': { const b = await body(req); return json(200, await remove(ed, b.path)); }
    case 'GET history': return json(200, await versions(ed, q.get('path')));
    case 'GET version': return json(200, await version(ed, q.get('path'), q.get('id')));
    case 'GET raw': return raw(ed, q.get('path'), q.get('download') === '1');
  }
  return json(404, { error: 'This web demo does not do that. Run the editor on your computer for everything.' });
}

// ---------------------------------------------------------- alphaLibrary --
// The routes of server/library-folder.mjs, over the same store.
async function library(key, url, req) {
  const ed = 'library', DIR = 'references';
  const reference = async (p) => {
    const file = await read(ed, p), c = await getChange(ed, p), m = (await manifest(ed)).get(p);
    let record = null;
    try { record = JSON.parse(file.content); } catch {}
    return { id: p, title: record?.title || base(p).replace(/\.json$/, ''), owner: 'human', revision: file.revision,
      updated: new Date(c?.mtime || m?.mtime || 0).toISOString(), content: file.content };
  };
  const references = async () => {
    const out = [];
    for (const f of await list(ed)) if (f.path.startsWith(`${DIR}/`) && f.path.endsWith('.json') && !f.binary) out.push(await reference(f.path));
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  };
  const keys = async () => (await references()).map((r) => { try { return JSON.parse(r.content).key; } catch { return ''; } });
  const text = (rec) => JSON.stringify(rec, null, 2) + '\n';
  const recordOf = (r) => {
    try { const v = JSON.parse(r.content); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch {}
    throw fault(400, 'This reference is not a valid record. Fix its JSON file first.');
  };
  const add = async (rec) => {
    need(rec && typeof rec === 'object' && String(rec.title || '').trim(), 400, 'A reference needs a title.');
    const slug = String(rec.key || citationKey(rec, await keys())).replace(/[^\w.-]+/g, '-').replace(/^[-.]+/, '') || 'reference';
    let p = `${DIR}/${slug}.json`;
    for (let n = 2; await bytesOf(ed, p); n++) p = `${DIR}/${slug}-${n}.json`;
    await create(ed, p, { content: text(rec) });
    return reference(p);
  };
  switch (key) {
    case 'GET library': {
      const pdfs = (await list(ed)).filter((f) => /\.pdf$/i.test(f.path)).map((f) => ({ path: f.path, size: f.size }));
      return json(200, { references: await references(), pdfs });
    }
    case 'POST library/reference': return json(201, await add((await body(req)).record));
    case 'PUT library/reference': {
      const b = await body(req);
      need(b.record && typeof b.record === 'object', 400, 'Send the reference record.');
      try { await write(ed, b.id, text(b.record), b.baseRevision); }
      catch (e) { if (e.status === 409) throw fault(409, 'This reference changed elsewhere.', { current: await reference(b.id) }); throw e; }
      return json(200, await reference(b.id));
    }
    case 'POST library/delete': return json(200, await remove(ed, (await body(req)).id));
    case 'POST library/resolve': {
      const rec = await resolveReference((await body(req)).doi);
      rec.key = citationKey(rec, await keys());
      return json(201, await add(rec));
    }
    case 'POST library/pdf': {
      const b = await body(req), current = await reference(b.id);
      let target = null;
      if (typeof b.path === 'string') {
        target = clean(b.path);
        need(/\.pdf$/i.test(target), 400, 'Choose a PDF file.');
      } else if (b.path !== null) {
        let bytes = typeof b.base64 === 'string' ? fromBase64(b.base64) : null;
        if (!bytes && typeof b.url === 'string') {
          try { const r = await fetch(b.url); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch {}
          need(bytes, 502, 'The web demo can’t download that PDF (the site doesn’t allow it from a browser). Drop the PDF on the card instead.');
        }
        need(bytes, 400, 'Give a PDF to link: a file in the folder, a link, or an upload.');
        need(dec.decode(bytes.subarray(0, 1024)).includes('%PDF-'), 400, 'That file is not a PDF.');
        const rec = recordOf(current), first = paperPath(rec);
        target = first;
        for (let n = 2; await bytesOf(ed, target); n++) target = first.replace(/\.pdf$/, `-${n}.pdf`);
        await create(ed, target, { base64: toBase64(bytes) });
      }
      const latest = await reference(b.id), rec = recordOf(latest);
      if ((rec.pdf ?? null) !== target) {
        if (target) rec.pdf = target; else delete rec.pdf;
        await write(ed, b.id, text(rec), latest.revision);
      }
      return json(200, await reference(b.id));
    }
    case 'GET library/bibtex': {
      const primary = url.searchParams.get('primary') === 'true', esc = (s) => String(s ?? '').replace(/[{}]/g, '');
      const entries = (await references()).map((r) => { try { return JSON.parse(r.content); } catch { return null; } })
        .filter((r) => r && (!primary || r.role === 'primary'))
        .map((r) => `@${r.type || (r.journal ? 'article' : 'misc')}{${esc(r.key)},\n` + [['title', r.title], ['author', r.authors], ['journal', r.journal], ['year', r.year], ['doi', r.doi], ['url', r.url]]
          .filter(([, v]) => v).map(([k, v]) => `  ${k} = {${esc(v)}}`).join(',\n') + '\n}');
      return json(200, { content: entries.join('\n\n') + '\n', warnings: [] });
    }
  }
  return json(404, { error: 'Unknown request.' });
}

// server/papers.mjs resolveReference, from the browser (Crossref and DataCite allow it).
async function resolveReference(input) {
  const raw = String(input ?? '').trim(), arxiv = parseArxiv(raw);
  const doi = arxiv ? `10.48550/arXiv.${arxiv}` : raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  need(/^10\.\d{4,9}\/.{1,200}$/.test(doi), 400, 'Enter a DOI such as 10.1000/example, or an arXiv number such as 2312.11258.');
  const get = async (u) => { try { return await fetch(u); } catch { throw fault(502, `Could not reach ${new URL(u).host}.`); } };
  const base = { role: 'secondary', annotation: '', tags: [], key: `ref${Date.now()}`, retrievedAt: new Date().toISOString() };
  if (!/^10\.48550\//i.test(doi)) {
    const r = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    need(r.ok, 502, 'Crossref could not resolve that DOI. You can add it manually.');
    const m = (await r.json()).message;
    return { ...base, title: m.title?.[0] || doi, authors: (m.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).join(' and '),
      type: m.type === 'journal-article' ? 'article' : m.type === 'book' ? 'book' : 'misc', journal: m['container-title']?.[0] || '',
      volume: m.volume || '', number: m.issue || '', pages: m.page || '', publisher: m.publisher || '',
      year: m.published?.['date-parts']?.[0]?.[0] || '', doi, url: m.URL || `https://doi.org/${doi}`, coverage: 'Metadata only', source: 'Crossref' };
  }
  const r = await get(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  need(r.ok, 502, 'arXiv (through DataCite) could not resolve that identifier. You can add it manually.');
  const a = (await r.json()).data?.attributes || {}, id = doi.replace(/^10\.48550\/arxiv\./i, '');
  return { ...base, title: a.titles?.[0]?.title || `arXiv:${id}`,
    authors: (a.creators || []).map((c) => (c.givenName || c.familyName ? [c.givenName, c.familyName].filter(Boolean).join(' ') : c.name)).join(' and '),
    type: 'misc', year: a.publicationYear || '', doi, url: `https://arxiv.org/abs/${id}`, eprint: id, archiveprefix: 'arXiv', coverage: 'Metadata only', source: 'arXiv' };
}

// --------------------------------------------------------------- alphaTeX --
// The recorded build (data/latex/build/): info.json, build.json, wordcount.json,
// sync.json, and the output files in out/.
let recorded = null;
const build = () => recorded ||= Promise.all(['info', 'build', 'wordcount', 'sync'].map((n) => fetch(new URL(`data/latex/build/${n}.json`, BASE)).then((r) => r.json())))
  .then(([info, b, wordcount, sync]) => {
    const near = new Map();
    for (const [page, x, y, p, line] of sync.toSource) near.set(`${page}:${x}:${y}`, { p, line });
    return { info, build: b, wordcount, sync, near };
  });
const NOTE = 'Web demo: this PDF was compiled ahead of time with TeX, so recompiling shows the same PDF. Run alphaTeX on your computer to compile your edits.\n\n';
async function latex(key, route, url, req) {
  const R = await build(), b = R.build, outUrl = (n) => `api/output/${b.id}/${encodeURIComponent(n)}`;
  const done = async () => {
    const t = (await getState('latex:compiled')) || Date.now();
    return { ...b, created: new Date(t).toISOString(), finished: new Date(t + 1200).toISOString(), log: NOTE + b.log,
      files: b.files.map((f) => ({ ...f, url: outUrl(f.name) })), pdfUrl: outUrl('main.pdf'), sync: { toSource: true, toPdf: true } };
  };
  switch (key) {
    case 'GET info': return json(200, { ...R.info, root: `${R.info.name} (web demo: changes stay in this browser)`,
      capabilities: { ...R.info.capabilities, zip: false, engines: [b.engine], draft: false, haltOnError: false, clean: false } });
    case 'POST compile': {
      await putState('latex:compiled', Date.now());
      return json(202, { ...(await done()), status: 'running', finished: null });
    }
    case 'GET builds': {
      const main = cleanPath(url.searchParams.get('main') || '') || '';
      if (main !== b.main || !(await getState('latex:compiled'))) return json(200, { latest: null, pdf: null });
      const d = await done();
      return json(200, { latest: d, pdf: d });
    }
    case 'POST cancel': return json(200, { ok: true });
    case 'GET wordcount': return json(200, R.wordcount);
    case 'POST sync/source': {
      const { page, x, y } = await body(req), { x: dx, y: dy } = R.sync.step;
      need([page, x, y].every(Number.isFinite), 400, 'Choose a point on the PDF.');
      let hit = null, best = Infinity;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const gx = Math.round(x / dx) * dx + i * dx, gy = Math.round(y / dy) * dy + j * dy, h = R.near.get(`${page}:${gx}:${gy}`);
        const d = (gx - x) ** 2 + (gy - y) ** 2;
        if (h && d < best) { best = d; hit = h; }
      }
      need(hit, 404, 'No project source was found here. Try clicking the text of a paragraph or equation.');
      return json(200, { id: hit.p, path: hit.p, line: hit.line, column: -1, stale: false });
    }
    case 'POST sync/pdf': {
      const { path: p, line } = await body(req), lines = R.sync.toPdf[p] || {};
      need(Number.isInteger(line) && line > 0, 400, 'Choose a source line.');
      let box = null;
      for (let d = 0; d < 40 && !box; d++) box = lines[line - d] || lines[line + d];
      need(box, 404, 'This line does not appear in the PDF. Try a line of text or an equation.');
      const [page, x, y, width, height] = box;
      return json(200, { page, x, y, width, height });
    }
  }
  const out = /^output\/[0-9a-f]+\/([^/]+)$/.exec(route);
  if (req.method === 'GET' && out) {
    const r = await fetch(new URL(`data/latex/build/out/${out[1]}`, BASE));
    if (!r.ok) return json(404, { error: 'Not found.' });
    const name = decodeURIComponent(out[1]);
    return new Response(await r.arrayBuffer(), { headers: name.endsWith('.pdf') ? { 'Content-Type': 'application/pdf' }
      : { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"` } });
  }
  return null;
}
