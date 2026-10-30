// Decks as folders: index.html beside its files.
//
// Inside alphaCentaur a deck at <name>/index.html is a folder deck: pictures
// are saved as files in <name>/assets/, and pages elsewhere in the project
// (a web app, a figure) are linked by relative URL (../Calc/index.html). The
// host says where the deck is (pz-context) and serves the project's files, so
// the canvas shows relative URLs through it. A deck that is still one HTML
// file keeps its pictures inside until it is converted.
//
// Standalone, decks live in this browser with their pictures inside; they can
// be saved to, downloaded as, and opened from a folder.

import { app } from './state.js';
import { HOST, onHost, hostRequest } from './host.js';
import { setURLResolver } from './render.js';
import { deckAsFolder, parseDeckHTML } from './exporter.js';
import { zipFiles, base64Bytes } from './zip.js';
import { h, icon, modal, toast } from './ui.js';

// Where this deck sits in the project (alphaCentaur only).
export const ctx = { path: '', folder: '', folderDeck: false, files: '', apps: null };

// The project path a relative URL points to from `folder`; '' if it leaves the project.
export function projectPath(folder, url) {
  const parts = folder ? folder.split('/') : [];
  for (const seg of String(url).split(/[?#]/)[0].split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return ''; parts.pop(); } else parts.push(decodeURIComponent(seg));
  }
  return parts.join('/');
}
// The relative URL from `folder` to the project path `to`.
export function relativeURL(folder, to) {
  const a = folder ? folder.split('/') : [], b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return ('../'.repeat(a.length - i) || './') + b.slice(i).map(encodeURIComponent).join('/');
}
const encodePath = p => p.split('/').map(encodeURIComponent).join('/');
const suffixOf = url => (/[?#].*$/.exec(url) || [''])[0];

export function installHostFolder(onChange) {
  if (!HOST) return;
  onHost('pz-context', d => {
    Object.assign(ctx, { path: String(d.path || ''), folder: String(d.folder || ''), folderDeck: !!d.folderDeck, files: String(d.files || ''), apps: d.apps || null });
    setURLResolver((url, kind) => {
      const p = projectPath(ctx.folder, url);
      if (!p) return '';
      if (kind === 'frame') return ctx.apps ? ctx.apps + encodePath(p) + suffixOf(url) : '';
      // Absolute, so it also works inside a presented (blob) document.
      return new URL(ctx.files + encodePath(p), location.href).href;
    });
    onChange?.();
  });
}
export const folderMode = () => HOST && ctx.folderDeck;


const readDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

// A picture into <folder>/assets/; returns its path relative to the deck.
export async function uploadAsset(file) {
  const data = await readDataURL(file);
  const { path } = await hostRequest('pz-file', { name: file.name, mime: file.type, base64: data.slice(data.indexOf(',') + 1) });
  return path;
}

// Insert → From the project…: pictures and web apps anywhere in the project.
export async function pickFromProject(onPick) {
  let files;
  try { files = await hostRequest('pz-project-files'); } catch (e) { toast(e.message, 'error'); return; }
  const own = ctx.path;
  const images = files.filter(f => /^image\//.test(f.mime || '')).sort((a, b) => a.path.localeCompare(b.path));
  const apps = files.filter(f => f.path !== own && /\.html?$/i.test(f.path) && f.kind !== 'presentation').sort((a, b) => a.path.localeCompare(b.path));
  const search = h('input.text-input', { type: 'search', placeholder: 'Find a picture or app…', 'aria-label': 'Find' });
  const lists = h('div.project-pick');
  let m;
  const row = (f, kind) => h('button.project-pick-row', { type: 'button', onclick: () => { m.close(); onPick({ kind, path: f.path, url: relativeURL(ctx.folder, f.path) }); } },
    icon(kind === 'image' ? 'image' : 'globe', 16), h('span', null, f.path));
  const draw = () => {
    const q = search.value.trim().toLowerCase(), hit = f => !q || f.path.toLowerCase().includes(q);
    const ai = apps.filter(hit), ii = images.filter(hit);
    lists.replaceChildren(...[
      h('h4', null, 'Web apps'), ai.length ? ai.slice(0, 200).map(f => row(f, 'app')) : h('p.hint', null, 'No web pages in this project.'),
      h('h4', null, 'Pictures'), ii.length ? ii.slice(0, 300).map(f => row(f, 'image')) : h('p.hint', null, 'No pictures yet. Insert → Image uploads one into this deck’s assets folder.'),
    ].flat());
  };
  search.addEventListener('input', draw);
  draw();
  m = modal('Insert from the project', h('div.stack', null,
    h('p.hint', null, 'A web app is linked where it lives in the project, so changes to it show up here. Export for the web copies it alongside the deck.'),
    search, lists), {});
}

// ------------------------------------------------------------ standalone --
// The deck and its pictures as files: index.html + assets/….
async function folderFiles(exportDeck) {
  const { deck, files } = deckAsFolder(app.deck);
  const html = await exportDeck(deck);
  return [{ path: 'index.html', bytes: new TextEncoder().encode(html) }, ...files.map(f => ({ path: f.path, bytes: base64Bytes(f.base64) }))];
}
export async function downloadFolderZip(exportDeck, name) {
  const blob = zipFiles(await folderFiles(exportDeck));
  const a = h('a', { href: URL.createObjectURL(blob), download: `${name}.zip` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export const canPickFolders = () => typeof window.showDirectoryPicker === 'function';
export async function saveToFolder(exportDeck) {
  const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'pz-deck-folder' });
  for (const f of await folderFiles(exportDeck)) {
    let d = dir;
    const parts = f.path.split('/');
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(f.bytes); await w.close();
  }
  return dir.name;
}
// A folder holding index.html (picked with <input webkitdirectory>): the deck
// with its pictures brought inside, ready for this browser's library.
export async function deckFromFolder(fileList) {
  const files = [...fileList];
  const byPath = new Map(files.map(f => [String(f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name, f]));
  const index = byPath.get('index.html');
  if (!index) throw new Error('That folder has no index.html at its top.');
  const deck = parseDeckHTML(await index.text());
  if (!deck) throw new Error('index.html in that folder wasn’t made with this editor.');
  for (const a of Object.values(deck.assets)) {
    if (!a.path) continue;
    const f = byPath.get(a.path);
    if (f) { a.data = await readDataURL(f); delete a.path; }
  }
  return deck;
}
