// Export a deck as a standalone fullPage.js HTML document, and read one back.
//
// The exported file carries its own source: a <script type="application/json"
// id="pz-deck"> block holds the deck model (minus image bytes, which are
// recovered from the <img data-asset> tags), so "Open…" round-trips exactly.

import { renderSlide, backgroundCSS, usedFonts, fontLinks } from './render.js';
import { themeVars, googleFontURL } from './themes.js';
import { parseMacros, hasMath, escapeHTML as esc } from './math.js';
import { sectionsOf, normalizeDeck, clone, slideTitle } from './model.js';
import { normalizeRemoteDeck, resolveRemote } from './remote-model.js';

const KATEX_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.18.5/dist/katex.min.css';
const FP_CSS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/fullPage.js/4.0.20/fullpage.min.css';
const FP_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/fullPage.js/4.0.20/fullpage.min.js';
const here = p => new URL(p, import.meta.url).href;

const textCache = new Map();
async function fetchText(url) {
  if (!textCache.has(url)) textCache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }));
  return textCache.get(url);
}
async function fetchDataURL(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const blob = await r.blob();
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
}

// Project macros (alphaCentaur's macros.tex) come first so the deck's own
// definitions can override them.
export function macroSource(deck) {
  return [deck.settings.hostMacros, deck.settings.macros].filter(Boolean).join('\n');
}
export function mathContext(deck) {
  const src = macroSource(deck);
  return { macros: parseMacros(src), macroKey: String(hashString(src)) };
}
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function deckUsesMath(deck) {
  return deck.slides.some(s => s.elements.some(e => e.type === 'math' || (e.type === 'text' && hasMath(e.html))));
}

async function inlineKatexCSS() {
  let css = await fetchText(here('../vendor/katex/katex.min.css'));
  const fonts = new Map();
  for (const m of css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)) fonts.set(m[1], null);
  await Promise.all([...fonts.keys()].map(async f => fonts.set(f, await fetchDataURL(here('../vendor/katex/' + f)))));
  // Keep only the woff2 source of each @font-face.
  return css.replace(/src:([^;}]+)/g, (all, src) => {
    const m = /url\((fonts\/[^)]+\.woff2)\)/.exec(src);
    return m && fonts.get(m[1]) ? `src:url(${fonts.get(m[1])}) format("woff2")` : all;
  });
}

async function inlineGoogleFont(family) {
  const url = googleFontURL(family);
  if (!url) return '';
  const css = await fetchText(url);
  const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter(b => /^\/\*\s*(latin|latin-ext)\s*\*\//.test(b));
  const out = [];
  for (const b of blocks) {
    const m = /url\((https:[^)]+)\)/.exec(b);
    if (!m) continue;
    out.push(b.replace(m[1], await fetchDataURL(m[1])));
  }
  return out.join('\n');
}

// localLibs: load fullPage.js/KaTeX from this editor's vendor folder (used by
// Present, so presenting works without a network connection).
// `remote`: the phone remote's { firebase, page } when they come from outside
// the deck (alphaCentaur's workspace setting); otherwise the deck's own are used.
export async function exportHTML(deck, { selfContained = false, localLibs = false, remote = null, base = '', resolveURLs = false } = {}) {
  const ctx = { mode: 'export', deck, offline: selfContained, resolve: resolveURLs, ...mathContext(deck) };
  const sections = sectionsOf(deck);
  const chapters = deck.settings.nav === 'chapters';
  let index = 0;

  const frame = slide => `<div class="pz-frame"><div class="pz-stage">${renderSlide(slide, ctx)}</div></div>`
    + (slide.notes ? `<aside class="pz-notes">${esc(slide.notes)}</aside>` : '');
  const bgAttr = slide => ` style="background:${esc(backgroundCSS(slide))}"`;

  const body = sections.map((sec, si) => {
    if (!chapters) {
      const s = sec.slides[0];
      index++;
      return `<div class="section" data-anchor="s${index}"${bgAttr(s)}>\n${frame(s)}\n</div>`;
    }
    const slides = sec.slides.map((s, j) => { index++; return `<div class="slide" data-anchor="${j + 1}"${bgAttr(s)}>\n${frame(s)}\n</div>`; }).join('\n');
    return `<div class="section" data-anchor="c${si + 1}">\n${slides}\n</div>`;
  }).join('\n\n');

  const [stageCSS, deckCSS, runtimeJS] = await Promise.all([
    fetchText(here('../runtime/stage.css')), fetchText(here('../runtime/deck.css')), fetchText(here('../runtime/deck.js')),
  ]);
  const remoteJS = await remoteScripts(deck, { local: localLibs, remote });
  const math = deckUsesMath(deck);
  const fonts = usedFonts(deck);

  let headLibs, fpScript;
  if (selfContained) {
    const [fpCSS, fpJS, katexCSS, ...fontCSS] = await Promise.all([
      fetchText(here('../vendor/fullpage/fullpage.min.css')),
      fetchText(here('../vendor/fullpage/fullpage.min.js')),
      math ? inlineKatexCSS() : '',
      ...fonts.map(f => inlineGoogleFont(f).catch(() => `/* ${f}: could not be inlined */`)),
    ]);
    headLibs = `<style>${fpCSS}</style>\n` + (math ? `<style>${katexCSS}</style>\n` : '') + `<style>${fontCSS.join('\n')}</style>`;
    fpScript = `<script>${fpJS}</script>`;
  } else {
    const fpCSS = localLibs ? here('../vendor/fullpage/fullpage.min.css') : FP_CSS_CDN;
    const fpJS = localLibs ? here('../vendor/fullpage/fullpage.min.js') : FP_JS_CDN;
    const katex = localLibs ? here('../vendor/katex/katex.min.css') : KATEX_CDN;
    headLibs = `<link rel="stylesheet" href="${fpCSS}">\n` + (math ? `<link rel="stylesheet" href="${katex}">\n` : '')
      + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' + fontLinks(fonts);
    fpScript = `<script src="${fpJS}"></script>`;
  }

  const config = {
    width: deck.size.w, height: deck.size.h, nav: deck.settings.nav, dots: deck.settings.dots, arrows: deck.settings.arrows,
    speed: deck.settings.speed, tooltips: sections.map(s => s.title),
  };

  // Source block: image bytes are omitted (they live in the <img> tags).
  const source = clone(deck);
  for (const id of Object.keys(source.assets)) source.assets[id] = assetRef(source.assets[id]);
  const json = sourceJSON(source);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">${base ? `\n<base href="${esc(base)}">` : ''}
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="alphaPresent (alphaCentaur)">
<meta name="pz-source" content="${hashString(json)}">
<title>${esc(deck.title || 'Presentation')}</title>
${headLibs}
<style>
:root{${themeVars(deck.theme)}}
${stageCSS}
${deckCSS}
</style>
</head>
<body>
<!-- Made with alphaPresent (alphaCentaur). The JSON block at the end of this
     file is the editable source: open this file in the editor to change it. -->
<div id="fullpage">
${body}
</div>
${deck.settings.progress ? '<div class="pz-progress"></div>' : ''}
${deck.settings.numbers ? '<div class="pz-number"></div>' : ''}
<div class="pz-notes-panel"></div>
<div class="pz-goto"></div>
<script>window.PZ_CONFIG=${JSON.stringify(config).replace(/</g, '\\u003c')};</script>
${fpScript}
<script>
${runtimeJS}
</script>
${remoteJS}<script type="application/json" id="pz-deck">${json}</script>
</body>
</html>
`;
}

// The phone remote (runtime/remote.js), only in decks that turn it on. The
// phone renders what is published here: titles, notes, each slide's controls
// and the theme. `local` (presenting from the editor) adds a link to the
// editor's own phone page for trying the remote on this computer.
export function remotePayload(deck, { local = false, remote = null } = {}) {
  const r = normalizeRemoteDeck(deck.remote);
  return {
    deckId: deck.id,
    firebase: remote?.firebase || r.firebase,
    page: remote?.page || r.page,
    localPage: local ? here('../remote.html') : '',
    deck: {
      v: 1,
      title: deck.title,
      theme: { colors: { ...deck.theme.colors }, fonts: { heading: deck.theme.fonts.heading, body: deck.theme.fonts.body },
        fontURLs: [...new Set([deck.theme.fonts.heading, deck.theme.fonts.body])].map(googleFontURL).filter(Boolean) },
      slides: deck.slides.map(s => ({ t: slideTitle(s), n: s.notes || '', r: resolveRemote(deck, s) })),
    },
  };
}
async function remoteScripts(deck, { local = false, remote = null } = {}) {
  if (!normalizeRemoteDeck(deck.remote).enabled) return '';
  const [qr, link, runtime] = await Promise.all(['../vendor/qrcode/qrcode.js', './remote-link.js', '../runtime/remote.js'].map(p => fetchText(here(p))));
  const payload = JSON.stringify(remotePayload(deck, { local, remote })).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>window.PZ_REMOTE=${payload};</script>\n<script>\n${qr}\n</script>\n<script>\n${link}\n</script>\n<script>\n${runtime}\n</script>\n`;
}

function sourceJSON(deck) {
  return JSON.stringify(deck).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// A minimal document holding only the source block. The editor writes this
// when it must save synchronously (closing mid-edit); the next open renders it.
export function stubHTML(deck) {
  const source = clone(deck);
  for (const id of Object.keys(source.assets)) source.assets[id] = assetRef(source.assets[id]);
  const imgs = Object.entries(deck.assets).filter(([, a]) => a.data).map(([id, a]) => `<img hidden alt="" data-asset="${esc(id)}" src="${esc(a.data)}">`).join('\n');
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="generator" content="alphaPresent (alphaCentaur)">\n<title>${esc(deck.title || 'Presentation')}</title>\n</head>\n<body>\n<p>Open this presentation in alphaPresent, alphaCentaur's slide editor, to render it.</p>\n${imgs}\n<script type="application/json" id="pz-deck">${sourceJSON(source)}</script>\n</body>\n</html>\n`;
}

// ------------------------------------------------------------------ import --
// Is the rendered document current with its source block? Not when the JSON
// was edited by hand or by an AI collaborator, or for stubs.
export function inspectDeckHTML(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const src = doc.getElementById('pz-deck');
  if (!src) return { deck: null, fresh: false };
  const meta = doc.querySelector('meta[name="pz-source"]')?.getAttribute('content');
  return { deck: parseDeckHTML(text, doc), fresh: !!meta && meta === hashString(src.textContent) && !!doc.getElementById('fullpage') };
}

// What the source block keeps of an image: its file, or (embedded) nothing
// but its name; the bytes are in the <img data-asset> tags.
const assetRef = a => ({ name: a.name || '', mime: a.mime || '', ...(a.path ? { path: a.path } : {}) });

// A single-file deck as a folder: every embedded image becomes a file in
// assets/, and the deck refers to it by path. Used to convert a deck inside
// alphaCentaur and to save or download a folder from the standalone editor.
export function deckAsFolder(deck) {
  const d = clone(deck), files = [], used = new Set(Object.values(d.assets).map(a => a.path).filter(Boolean));
  const extOf = (mime, data) => ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' })[mime] || (mime || (/^data:([^;]+)/.exec(data) || [])[1] || 'image/png').split('/')[1].replace(/[^a-z0-9]/g, '') || 'png';
  for (const [id, a] of Object.entries(d.assets)) {
    if (!a.data) continue;
    const stem = (a.name || 'image').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
    const ext = extOf(a.mime, a.data);
    let path = `assets/${stem}.${ext}`;
    for (let n = 2; used.has(path); n++) path = `assets/${stem}-${n}.${ext}`;
    used.add(path);
    files.push({ path, base64: a.data.slice(a.data.indexOf(',') + 1), mime: a.mime || '' });
    d.assets[id] = { name: a.name || '', mime: a.mime || '', path };
  }
  return { deck: d, files };
}

export function parseDeckHTML(text, parsed = null) {
  const doc = parsed || new DOMParser().parseFromString(text, 'text/html');
  const src = doc.getElementById('pz-deck');
  if (!src) return null;
  const deck = JSON.parse(src.textContent);
  deck.assets ??= {};
  const found = {};
  doc.querySelectorAll('[data-asset]').forEach(img => { found[img.getAttribute('data-asset')] = img.getAttribute('src'); });
  for (const id of Object.keys(deck.assets)) {
    const a = deck.assets[id];
    if (!a || typeof a !== 'object') delete deck.assets[id];
    else if (a.path) delete a.data;                       // a file beside the deck
    else if (/^data:/.test(found[id] || '')) a.data = found[id];
    else delete deck.assets[id];
  }
  return normalizeDeck(deck);
}

export function fileNameFor(deck, suffix = '') {
  const slug = (deck.title || 'presentation').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'presentation';
  return slug + suffix + '.html';
}

export function download(name, text, type = 'text/html') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

