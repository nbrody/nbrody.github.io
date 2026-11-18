// In-page static backend for AlphaCentaur's standalone editors (no Service Worker required).
import { kindOf, editable, cleanPath, IMAGE } from './latex/js/kinds.js';
import { citationKey, paperPath, parseArxiv } from './library/js/references.js';

const BASE = new URL('./', import.meta.url);
const origFetch = window.fetch.bind(window);
const EDITORS = { markdown: 'alphaMarkdown', ink: 'alphaNote', library: 'alphaLibrary', latex: 'alphaTeX', python: 'alphaPy' };
const MAX_TEXT = 4 * 1024 * 1024;
const enc = new TextEncoder(), dec = new TextDecoder();

const fault = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const need = (ok, status, message) => { if (!ok) throw fault(status, message); };
const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const body = async (req) => { try { return await req.json(); } catch { return {}; } };
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf' };
const ext = (p) => (/\.[^./]+$/.exec(p)?.[0] || '').toLowerCase();
const base = (p) => p.split('/').pop();
const isEntryPoint = (s) => /\\begin\s*\{document\}/.test(s.replace(/(?<!\\)%[^\n]*/g, ''));

function fnvHex(bytes) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i]; h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i]; h2 = Math.imul(h2, 0x811c9dc5);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
const hashes = new WeakMap();
async function revisionOf(bytes) {
  if (hashes.has(bytes)) return hashes.get(bytes);
  let h;
  try {
    if (crypto?.subtle) {
      h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } else h = fnvHex(bytes);
  } catch { h = fnvHex(bytes); }
  hashes.set(bytes, h);
  return h;
}
const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (b64) => Uint8Array.from(atob(String(b64)), (c) => c.charCodeAt(0));

const shipped = new Map();
const shippedBytes = new Map();
const manifest = (ed) => {
  if (!shipped.has(ed)) shipped.set(ed, origFetch(new URL(`data/${ed}/manifest.json`, BASE)).then((r) => r.json()).then((m) => new Map(m.files.map((f) => [f.path, f]))));
  return shipped.get(ed);
};
async function shippedFile(ed, p) {
  const key = `${ed}:${p}`;
  if (!shippedBytes.has(key)) {
    const r = await origFetch(new URL(`data/${ed}/files/${p.split('/').map(encodeURIComponent).join('/')}`, BASE));
    need(r.ok, 404, `${p} was not found.`);
    shippedBytes.set(key, new Uint8Array(await r.arrayBuffer()));
  }
  return shippedBytes.get(key);
}

// Storage with automatic in-memory fallback when IndexedDB is unavailable/blocked
const memChanges = new Map();
const memState = new Map([['latex:compiled', Date.now()]]);
let idbPromise = null, useMem = false;
function openIDB() {
  if (useMem || typeof indexedDB === 'undefined') { useMem = true; return Promise.resolve(null); }
  return idbPromise ||= new Promise((resolve) => {
    try {
      const r = indexedDB.open('alphacentaur-web-demo', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('changes'); r.result.createObjectStore('state'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { useMem = true; resolve(null); };
    } catch { useMem = true; resolve(null); }
  });
}
async function getChange(ed, p) {
  const db = await openIDB();
  if (!db) return memChanges.get(`${ed}:${p}`);
  return new Promise((res) => {
    try { const req = db.transaction('changes', 'readonly').objectStore('changes').get(`${ed}:${p}`); req.onsuccess = () => res(req.result); req.onerror = () => res(memChanges.get(`${ed}:${p}`)); }
    catch { res(memChanges.get(`${ed}:${p}`)); }
  });
}
async function putChange(ed, p, v) {
  memChanges.set(`${ed}:${p}`, v);
  const db = await openIDB();
  if (!db) return;
  return new Promise((res) => {
    try { const t = db.transaction('changes', 'readwrite'); t.objectStore('changes').put(v, `${ed}:${p}`); t.oncomplete = () => res(); t.onerror = () => res(); }
    catch { res(); }
  });
}
async function changes(ed) {
  const db = await openIDB();
  const out = new Map();
  for (const [k, v] of memChanges) if (k.startsWith(ed + ':')) out.set(k.slice(ed.length + 1), v);
  if (!db) return out;
  return new Promise((res) => {
    try {
      const t = db.transaction('changes', 'readonly'), s = t.objectStore('changes');
      const rk = s.getAllKeys(), rv = s.getAll();
      t.oncomplete = () => { rk.result.forEach((k, i) => { if (String(k).startsWith(ed + ':')) out.set(String(k).slice(ed.length + 1), rv.result[i]); }); res(out); };
      t.onerror = () => res(out);
    } catch { res(out); }
  });
}
const getState = async (k) => memState.get(k) ?? Date.now();
const putState = async (k, v) => { memState.set(k, v); };

async function bytesOf(ed, p) {
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
const clean = (p) => { const r = cleanPath(p); need(r, 400, 'Use a relative path inside the folder.'); return r; };
async function read(ed, p) {
  p = clean(p);
  const bytes = await bytesOf(ed, p);
  need(bytes, 404, `${p} was not found.`);
  need(editable(kindOf(p)) && bytes.length <= MAX_TEXT, 415, `${p} is not a text file.`);
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
  return { ok: true, trashed: 'removed in this session' };
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
  return new Response(bytes, { headers: { 'Content-Type': inline ? TYPES[ext(p)] : 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

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
      await write(ed, b.id, text(b.record), b.baseRevision);
      return json(200, await reference(b.id));
    }
    case 'POST library/delete': return json(200, await remove(ed, (await body(req)).id));
    case 'GET library/bibtex': {
      const primary = url.searchParams.get('primary') === 'true', esc = (s) => String(s ?? '').replace(/[{}]/g, '');
      const entries = (await references()).map((r) => { try { return JSON.parse(r.content); } catch { return null; } })
        .filter((r) => r && (!primary || r.role === 'primary'))
        .map((r) => `@${r.type || (r.journal ? 'article' : 'misc')}{${esc(r.key)},\n` + [['title', r.title], ['author', r.authors], ['journal', r.journal], ['year', r.year], ['doi', r.doi], ['url', r.url]]
          .filter(([, v]) => v).map(([k, v]) => `  ${k} = {${esc(v)}}`).join(',\n') + '\n}');
      return json(200, { content: entries.join('\n\n') + '\n', warnings: [] });
    }
  }
  return json(404, { error: 'Not supported in static demo.' });
}

let recorded = null;
const latexBuild = () => recorded ||= Promise.all(['info', 'build', 'wordcount', 'sync'].map((n) => origFetch(new URL(`data/latex/build/${n}.json`, BASE)).then((r) => r.json())))
  .then(([info, b, wordcount, sync]) => {
    const near = new Map();
    for (const [page, x, y, p, line] of sync.toSource) near.set(`${page}:${x}:${y}`, { p, line });
    return { info, build: b, wordcount, sync, near };
  });
const NOTE = 'Demo: PDF pre-compiled with TeX; two-way SyncTeX click-sync is live.\n\n';
async function latex(key, route, url, req) {
  const R = await latexBuild(), b = R.build;
  const outUrl = (n) => new URL(`data/latex/build/out/${encodeURIComponent(n)}`, BASE).href;
  const done = async () => {
    const t = await getState('latex:compiled');
    return { ...b, created: new Date(t).toISOString(), finished: new Date(t + 800).toISOString(), log: NOTE + b.log,
      files: b.files.map((f) => ({ ...f, url: outUrl(f.name) })), pdfUrl: outUrl('main.pdf'), sync: { toSource: true, toPdf: true } };
  };
  switch (key) {
    case 'GET info': return json(200, { ...R.info, root: `${R.info.name} (live demo)`,
      capabilities: { ...R.info.capabilities, zip: false, engines: [b.engine], draft: false, haltOnError: false, clean: false } });
    case 'POST compile': {
      await putState('latex:compiled', Date.now());
      return json(202, { ...(await done()), status: 'running', finished: null });
    }
    case 'GET builds': {
      const main = cleanPath(url.searchParams.get('main') || '') || '';
      if (main !== b.main) return json(200, { latest: null, pdf: null });
      const d = await done();
      return json(200, { latest: d, pdf: d });
    }
    case 'POST cancel': return json(200, { ok: true });
    case 'GET wordcount': return json(200, R.wordcount);
    case 'POST sync/source': {
      const { page, x, y } = await body(req), { x: dx, y: dy } = R.sync.step;
      let hit = null, best = Infinity;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const gx = Math.round(x / dx) * dx + i * dx, gy = Math.round(y / dy) * dy + j * dy, h = R.near.get(`${page}:${gx}:${gy}`);
        const d = (gx - x) ** 2 + (gy - y) ** 2;
        if (h && d < best) { best = d; hit = h; }
      }
      need(hit, 404, 'No source line mapped to that point.');
      return json(200, { id: hit.p, path: hit.p, line: hit.line, column: -1, stale: false });
    }
    case 'POST sync/pdf': {
      const { path: p, line } = await body(req), lines = R.sync.toPdf[p] || {};
      let box = null;
      for (let d = 0; d < 40 && !box; d++) box = lines[line - d] || lines[line + d];
      need(box, 404, 'Line not in PDF.');
      const [page, x, y, width, height] = box;
      return json(200, { page, x, y, width, height });
    }
  }
  return null;
}

async function handle(ed, route, url, req) {
  const q = url.searchParams, key = `${req.method} ${route}`;
  if (ed === 'library' && route.startsWith('library')) return library(key, url, req);
  if (ed === 'latex') { const r = await latex(key, route, url, req); if (r) return r; }
  switch (key) {
    case 'GET info': {
      const m = await origFetch(new URL(`data/${ed}/manifest.json`, BASE)).then((r) => r.json());
      return json(200, { applet: EDITORS[ed], name: m.name, root: `${m.name} (live demo)` });
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
  return json(404, { error: 'Unsupported route.' });
}

window.fetch = async function(input, init) {
  const req = input instanceof Request ? (init ? new Request(input, init) : input) : new Request(new URL(String(input), location.href), init);
  const url = new URL(req.url);
  if (url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname)) {
    const m = /^([a-z]+)\/api\/(.+)$/.exec(url.pathname.slice(BASE.pathname.length));
    if (m && EDITORS[m[1]]) {
      try {
        return await handle(m[1], m[2], url, req);
      } catch (err) {
        return json(err.status || 500, { error: err.status ? err.message : String(err.message || err), ...(err.current ? { current: err.current } : {}) });
      }
    }
  }
  return origFetch(input, init);
};

await import(new URL('js/main.js', location.href).href);
