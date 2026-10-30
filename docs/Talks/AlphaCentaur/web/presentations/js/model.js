// The deck model. A deck is plain JSON: theme + settings + slides of
// absolutely positioned elements on a fixed 1920×1080 stage. Image bytes live
// in deck.assets (data URLs) and are referenced by id, which keeps undo
// snapshots small.

import { defaultTheme, DEFAULT_MACROS, COLOR_TOKENS, FONT_ROLES, FONTS, SYSTEM_FONTS } from './themes.js';
import { normalizeRemoteDeck, normalizeRemoteSlide } from './remote-model.js';

export const W = 1920, H = 1080;

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
export const clone = o => JSON.parse(JSON.stringify(o));

export const TYPE_LABELS = {
  text: 'Text box', math: 'Equation', image: 'Image', shape: 'Shape', embed: 'Web embed', applet: 'Applet',
};

export const TEXT_STYLES = {
  title: { label: 'Title', font: 'heading', size: 104, weight: 700, color: 'text', lh: 1.08, ls: -0.02, italic: false },
  subtitle: { label: 'Subtitle', font: 'body', size: 46, weight: 400, color: 'muted', lh: 1.3, ls: 0, italic: false },
  heading: { label: 'Heading', font: 'heading', size: 72, weight: 700, color: 'text', lh: 1.12, ls: -0.01, italic: false },
  body: { label: 'Body', font: 'body', size: 42, weight: 400, color: 'text', lh: 1.4, ls: 0, italic: false },
  caption: { label: 'Caption', font: 'body', size: 28, weight: 400, color: 'muted', lh: 1.35, ls: 0.01, italic: false },
  eyebrow: { label: 'Eyebrow', font: 'body', size: 26, weight: 700, color: 'accent', lh: 1.2, ls: 0.14, italic: false, upper: true },
  quote: { label: 'Quote', font: 'heading', size: 56, weight: 400, color: 'text', lh: 1.25, ls: 0, italic: true },
  code: { label: 'Code', font: 'mono', size: 30, weight: 400, color: 'text', lh: 1.45, ls: 0, italic: false },
};

const base = (type, x, y, w, h, extra) => ({
  id: uid('e'), type, x, y, w, h, rot: 0, opacity: 1, locked: false, build: 0, anim: 'fade', shadow: 'none', ...extra,
});

export function makeText(opts = {}) {
  const style = TEXT_STYLES[opts.role || 'body'];
  return base('text', opts.x ?? 160, opts.y ?? 160, opts.w ?? 1000, opts.h ?? 80, {
    html: opts.html ?? '', placeholder: opts.placeholder ?? '', role: opts.role || 'body',
    font: style.font, size: style.size, weight: style.weight, color: style.color, lh: style.lh, ls: style.ls,
    italic: style.italic, upper: !!style.upper, align: opts.align || 'left', valign: 'top', autoH: true,
    fill: 'none', stroke: 'none', strokeW: 0, radius: 0, pad: 8, buildBy: 'element',
    ...(opts.role === 'code' ? { fill: 'surface', pad: 28, radius: 14 } : {}),
    ...(opts.extra || {}),
  });
}

export function applyTextStyle(el, role) {
  const s = TEXT_STYLES[role];
  Object.assign(el, { role, font: s.font, size: s.size, weight: s.weight, color: s.color, lh: s.lh, ls: s.ls, italic: s.italic, upper: !!s.upper });
  if (role === 'code') Object.assign(el, { fill: 'surface', pad: 28, radius: 14 });
}

export function makeMath(opts = {}) {
  return base('math', opts.x ?? 460, opts.y ?? 420, opts.w ?? 1000, opts.h ?? 200, {
    tex: opts.tex ?? String.raw`e^{i\pi} + 1 = 0`, size: opts.size ?? 72, color: opts.color ?? 'text', align: 'center',
    fill: 'none', radius: 0, pad: 0,
  });
}

export function makeImage(opts = {}) {
  return base('image', opts.x ?? 560, opts.y ?? 240, opts.w ?? 800, opts.h ?? 600, {
    asset: opts.asset ?? null, src: opts.src ?? '', fit: opts.fit ?? 'cover', radius: 0, stroke: 'none', strokeW: 0, alt: opts.alt ?? '',
    lockAspect: true,
  });
}

export const SHAPES = {
  rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Diamond', line: 'Line', arrow: 'Arrow',
};
export function makeShape(shape = 'rect', opts = {}) {
  const linear = shape === 'line' || shape === 'arrow';
  return base('shape', opts.x ?? 760, opts.y ?? (linear ? 520 : 390), opts.w ?? 400, opts.h ?? (linear ? 40 : 300), {
    shape, fill: linear ? 'none' : 'accent', stroke: linear ? 'text' : 'none', strokeW: linear ? 6 : 0,
    radius: shape === 'rect' ? 24 : 0, dash: 'solid', head: shape === 'arrow' ? 'end' : 'none', ...(opts.extra || {}),
  });
}

export function makeEmbed(src = '', opts = {}) {
  return base('embed', opts.x ?? 260, opts.y ?? 160, opts.w ?? 1400, opts.h ?? 788, { src, radius: 12, stroke: 'none', strokeW: 0 });
}

export function makeApplet(code, name = 'Applet', opts = {}) {
  return base('applet', opts.x ?? 260, opts.y ?? 160, opts.w ?? 1400, opts.h ?? 788, { code, name, radius: 12, stroke: 'none', strokeW: 0 });
}

export function makeSlide(elements = [], extra = {}) {
  return { id: uid('s'), section: false, sectionTitle: '', notes: '', bg: { kind: 'theme' }, elements, ...extra };
}

// ---------------------------------------------------------------- layouts --
// Titles and headings sit in fixed boxes anchored at the bottom, so a title
// that wraps grows upward into empty space instead of over the content.
const fixedBottom = { autoH: false, valign: 'bottom' };
const heading = placeholder => makeText({ role: 'heading', x: 140, y: 40, w: 1640, h: 160, placeholder, extra: fixedBottom });

export const LAYOUTS = {
  title: {
    name: 'Title',
    make: () => makeSlide([
      makeText({ role: 'title', x: 160, y: 130, w: 1600, h: 360, align: 'left', placeholder: 'Presentation title', extra: fixedBottom }),
      makeShape('rect', { x: 166, y: 522, w: 120, h: 12, extra: { radius: 6, fill: 'accent' } }),
      makeText({ role: 'subtitle', x: 160, y: 568, w: 1600, h: 70, placeholder: 'Speaker · venue · date' }),
    ]),
  },
  content: {
    name: 'Title & content',
    make: () => makeSlide([
      heading('Slide title'),
      makeText({ role: 'body', x: 140, y: 250, w: 1640, h: 140, placeholder: 'Click to add text — use $…$ for math' }),
    ]),
  },
  two: {
    name: 'Two columns',
    make: () => makeSlide([
      heading('Slide title'),
      makeText({ role: 'body', x: 140, y: 250, w: 780, h: 140, placeholder: 'Left column' }),
      makeText({ role: 'body', x: 1000, y: 250, w: 780, h: 140, placeholder: 'Right column' }),
    ]),
  },
  section: {
    name: 'Section header',
    make: () => makeSlide([
      makeText({ role: 'eyebrow', x: 160, y: 380, w: 1600, h: 40, placeholder: 'Part one' }),
      makeText({ role: 'title', x: 160, y: 440, w: 1600, h: 120, placeholder: 'Section title' }),
    ], { section: true }),
  },
  equation: {
    name: 'Statement',
    make: () => makeSlide([
      heading('Theorem'),
      makeMath({ x: 160, y: 380, w: 1600, h: 240, tex: String.raw`\sum_{k=1}^{n} k = \frac{n(n+1)}{2}`, size: 80 }),
      makeText({ role: 'caption', x: 160, y: 700, w: 1600, h: 50, align: 'center', placeholder: 'A remark about the statement' }),
    ]),
  },
  media: {
    name: 'Title & media',
    make: () => makeSlide([
      heading('Slide title'),
      makeImage({ x: 140, y: 240, w: 1640, h: 740, fit: 'contain' }),
    ]),
  },
  blank: { name: 'Blank', make: () => makeSlide([]) },
};

export function newDeck(title = 'Untitled presentation') {
  const first = LAYOUTS.title.make();
  return {
    version: 1, id: uid('d'), title, size: { w: W, h: H },
    theme: defaultTheme(),
    settings: {
      nav: 'linear', dots: true, arrows: false, numbers: true, progress: true, speed: 700, macros: DEFAULT_MACROS,
    },
    assets: {},
    remote: normalizeRemoteDeck(),
    slides: [first],
  };
}

// ------------------------------------------------------------ loading --
// Decks arrive from files, the clipboard, or (inside alphaCentaur) an AI
// collaborator, so every field is checked: unknown values fall back to
// defaults and nothing can smuggle markup into a style or attribute.
const ID = /^[\w-]{1,48}$/;
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]*\)|transparent)$/i;
const color = (v, d) => (v === 'none' || COLOR_TOKENS.includes(v) || (typeof v === 'string' && COLOR.test(v.trim())) ? v : d);
const font = (v, d) => (FONT_ROLES.includes(v) || FONTS[v] || SYSTEM_FONTS[v] ? v : d);
const num = (v, d, lo = -1e5, hi = 1e5) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, d = '', max = 2e6) => (typeof v === 'string' ? v.slice(0, max) : d);
export const safeURL = (u, { images = false } = {}) => {
  u = str(u).trim();
  if (!u) return '';
  if (images && /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(u)) return u;
  if (/^[a-z][\w+.-]*:/i.test(u)) return /^https?:/i.test(u) ? u : '';
  return u;   // relative, protocol-relative or bare host
};

function defaultsFor(e) {
  switch (e.type) {
    case 'text': return makeText({ role: TEXT_STYLES[e.role] ? e.role : 'body' });
    case 'math': return makeMath();
    case 'image': return makeImage();
    case 'shape': return makeShape(SHAPES[e.shape] ? e.shape : 'rect');
    case 'embed': return makeEmbed();
    case 'applet': return makeApplet('', 'Applet');
    default: return null;
  }
}

function normalizeElement(raw, seen) {
  if (!raw || typeof raw !== 'object') return null;
  const d = defaultsFor(raw);
  if (!d) return null;
  const e = { ...d, ...raw };
  e.id = ID.test(e.id) && !seen.has(e.id) ? e.id : uid('e');
  seen.add(e.id);
  for (const k of ['x', 'y']) e[k] = num(e[k], d[k]);
  for (const k of ['w', 'h']) e[k] = num(e[k], d[k], 1, 1e5);
  e.rot = num(e.rot, 0, -360, 360);
  e.opacity = num(e.opacity, 1, 0, 1);
  e.build = Math.round(num(e.build, 0, 0, 999));
  e.anim = pick(e.anim, ['fade', 'rise', 'zoom', 'wipe', 'drop'], 'fade');
  e.shadow = pick(e.shadow, ['none', 'soft', 'lifted', 'glow'], 'none');
  e.locked = !!e.locked;
  for (const k of ['fill', 'stroke', 'color']) if (k in d) e[k] = color(e[k], d[k]);
  for (const k of ['strokeW', 'radius', 'pad']) if (k in d) e[k] = num(e[k], d[k], 0, 1e4);
  switch (e.type) {
    case 'text':
      e.html = str(e.html); e.placeholder = str(e.placeholder, '', 200);
      e.role = TEXT_STYLES[e.role] ? e.role : 'body';
      e.font = font(e.font, d.font);
      e.size = num(e.size, d.size, 4, 1000); e.weight = pick(Number(e.weight), [100, 200, 300, 400, 500, 600, 700, 800, 900], d.weight);
      e.lh = num(e.lh, d.lh, 0.5, 4); e.ls = num(e.ls, d.ls, -1, 2);
      e.align = pick(e.align, ['left', 'center', 'right', 'justify'], 'left');
      e.valign = pick(e.valign, ['top', 'middle', 'bottom'], 'top');
      e.italic = !!e.italic; e.upper = !!e.upper; e.autoH = e.autoH !== false;
      e.buildBy = pick(e.buildBy, ['element', 'paragraph'], 'element');
      break;
    case 'math':
      e.tex = str(e.tex, '', 2e4); e.size = num(e.size, d.size, 4, 1000);
      e.align = pick(e.align, ['left', 'center', 'right'], 'center');
      break;
    case 'image':
      e.asset = ID.test(e.asset) ? e.asset : null; e.src = safeURL(e.src, { images: true });
      e.fit = pick(e.fit, ['contain', 'cover', 'fill'], 'cover'); e.alt = str(e.alt, '', 500); e.lockAspect = e.lockAspect !== false;
      break;
    case 'shape':
      e.shape = SHAPES[e.shape] ? e.shape : 'rect';
      e.dash = pick(e.dash, ['solid', 'dashed', 'dotted'], 'solid'); e.head = pick(e.head, ['none', 'end', 'start', 'both'], d.head);
      break;
    case 'embed': e.src = safeURL(e.src); break;
    case 'applet': e.code = str(e.code, '', 4e6); e.name = str(e.name, 'Applet', 200); break;
  }
  return e;
}

// Elements arriving by paste get the same treatment, with ids unique on the slide.
export function normalizeElements(list, existingIds = []) {
  const seen = new Set(existingIds);
  return (Array.isArray(list) ? list : []).map(e => normalizeElement(e, seen)).filter(Boolean);
}
// An image is embedded (data, single-file decks) or a file next to the deck
// (path, relative to the deck's folder: assets/plot.png).
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,/i;
export const safeAssetPath = p => (typeof p === 'string' && p.length <= 300 && /^[\w(][^\\:*?"<>|]*$/.test(p) && !p.split('/').some(s => !s || s === '.' || s === '..' || s.startsWith('.')) ? p : '');
function normalizeAsset(a) {
  if (!a || typeof a !== 'object') return null;
  const data = typeof a.data === 'string' && DATA_IMAGE.test(a.data) ? a.data : undefined, path = safeAssetPath(a.path);
  if (!data && !path) return null;
  return { name: str(a.name, '', 300), mime: str(a.mime, '', 100), ...(data ? { data } : { path }) };
}
export function normalizeAssets(assets) {
  const out = {};
  for (const [id, a] of Object.entries(assets || {})) { const n = ID.test(id) && normalizeAsset(a); if (n) out[id] = n; }
  return out;
}

function normalizeBackground(bg) {
  bg = bg && typeof bg === 'object' ? bg : {};
  return {
    kind: pick(bg.kind, ['theme', 'color', 'gradient', 'image'], 'theme'),
    color: color(bg.color, 'bg'), color2: color(bg.color2, 'surface'), angle: num(bg.angle, 135, -360, 720),
    asset: ID.test(bg.asset) ? bg.asset : null, fit: pick(bg.fit, ['cover', 'contain'], 'cover'),
    dim: num(bg.dim, 0, 0, 1), dimColor: pick(bg.dimColor, ['dark', 'light'], 'dark'),
  };
}

// Bring a stored, older, hand-written or AI-written deck to the current shape.
export function normalizeDeck(input) {
  const d = input && typeof input === 'object' ? input : {};
  const fresh = newDeck();
  const t = d.theme && typeof d.theme === 'object' ? d.theme : {};
  const out = {
    version: 1,
    id: ID.test(d.id) ? d.id : uid('d'),
    title: str(d.title, 'Untitled presentation', 300) || 'Untitled presentation',
    size: { w: W, h: H },
    theme: {
      palette: str(t.palette, 'custom', 40), fontPair: str(t.fontPair, 'custom', 40),
      colors: Object.fromEntries(COLOR_TOKENS.map(k => [k, COLOR.test(String(t.colors?.[k] || '').trim()) ? t.colors[k].trim() : fresh.theme.colors[k]])),
      fonts: Object.fromEntries(FONT_ROLES.map(k => [k, font(t.fonts?.[k], fresh.theme.fonts[k])])),
    },
    settings: {},
    assets: {},
    remote: normalizeRemoteDeck(d.remote),
    slides: [],
  };
  const st = d.settings && typeof d.settings === 'object' ? d.settings : {};
  out.settings = {
    nav: pick(st.nav, ['linear', 'chapters'], 'linear'),
    dots: st.dots ?? true, arrows: !!st.arrows, numbers: st.numbers ?? true, progress: st.progress ?? true,
    speed: num(st.speed, 700, 0, 5000), macros: str(st.macros, DEFAULT_MACROS, 1e5), hostMacros: str(st.hostMacros, '', 2e5),
  };
  for (const k of ['dots', 'numbers', 'progress']) out.settings[k] = !!out.settings[k];
  for (const [id, a] of Object.entries(d.assets || {})) {
    if (!ID.test(id) || !a || typeof a !== 'object') continue;
    // Embedded bytes arrive separately (<img data-asset>), so keep the entry.
    out.assets[id] = normalizeAsset(a) || { name: str(a.name, '', 300), mime: str(a.mime, '', 100) };
  }
  const seen = new Set(), seenSlides = new Set();
  for (const s of Array.isArray(d.slides) ? d.slides : []) {
    if (!s || typeof s !== 'object') continue;
    const sid = ID.test(s.id) && !seenSlides.has(s.id) ? s.id : uid('s');
    seenSlides.add(sid);
    const remote = normalizeRemoteSlide(s.remote);
    out.slides.push({
      id: sid, section: !!s.section, sectionTitle: str(s.sectionTitle, '', 300), notes: str(s.notes, '', 1e5),
      bg: normalizeBackground(s.bg),
      elements: (Array.isArray(s.elements) ? s.elements : []).map(e => normalizeElement(e, seen)).filter(Boolean),
      ...(remote ? { remote } : {}),
    });
  }
  if (!out.slides.length) out.slides.push(LAYOUTS.title.make());
  return out;
}

// Text is user-authored HTML from a contenteditable; keep its formatting but
// never anything that executes.
const ALLOWED = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'UL', 'OL', 'LI', 'A', 'CODE', 'PRE', 'FONT', 'BLOCKQUOTE', 'SMALL', 'MARK']);
export function sanitizeHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      if (!ALLOWED.has(child.tagName)) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|META|LINK|TEMPLATE)$/.test(child.tagName)) { child.remove(); continue; }
        walk(child);
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const a of [...child.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on')) child.removeAttribute(a.name);
        else if (n === 'href' && !/^\s*(https?:|mailto:|#)/i.test(a.value)) child.removeAttribute(a.name);
        else if (n === 'style' && /url\s*\(|expression\s*\(|@import|[<>]/i.test(a.value)) child.removeAttribute(a.name);
        else if (!['style', 'href', 'class', 'color', 'target'].includes(n)) child.removeAttribute(a.name);
      }
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
      walk(child);
    }
  };
  walk(tpl.content);
  return tpl.innerHTML.replace(/^(<br>)+$/, '').trim();
}

// Parse without side effects: <template> content is inert, so nothing in it
// loads or runs (a detached <div> would still fire <img onerror>).
export function inert(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  return tpl.content;
}
export function htmlIsEmpty(html) {
  return !(html || '').trim() || !inert(html).textContent.trim();
}

export function textToHTML(text) {
  return text.split(/\n{2,}/).map(p => `<p>${p.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>')}</p>`).join('');
}

// Axis-aligned bounds of a (possibly rotated) element.
export function aabb(el) {
  if (!el.rot) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2, t = el.rot * Math.PI / 180;
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const w = el.w * c + el.h * s, h = el.w * s + el.h * c;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
export function unionBox(boxes) {
  if (!boxes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function slideTitle(slide) {
  const t = slide.elements.find(e => e.type === 'text' && (e.role === 'title' || e.role === 'heading') && !htmlIsEmpty(e.html))
    || slide.elements.find(e => e.type === 'text' && !htmlIsEmpty(e.html));
  if (!t) return '';
  // Labels and nav tooltips are plain text: show math as its bare TeX.
  return inert(t.html).textContent.replace(/\$\$?([^$]+?)\$\$?/g, (_, tex) => tex.replace(/\\([A-Za-z]+)/g, '$1').replace(/[{}]/g, ''))
    .replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Group a flat slide list into fullPage sections. In "linear" navigation each
// slide is its own vertical section; in "chapters" a section break starts a
// new vertical section and the slides inside it run horizontally.
export function sectionsOf(deck) {
  if (deck.settings.nav !== 'chapters') return deck.slides.map((s, i) => ({ title: s.sectionTitle || slideTitle(s) || `Slide ${i + 1}`, slides: [s] }));
  const out = [];
  deck.slides.forEach((s, i) => {
    if (i === 0 || s.section) out.push({ title: s.sectionTitle || slideTitle(s) || `Part ${out.length + 1}`, slides: [] });
    out[out.length - 1].slides.push(s);
  });
  return out;
}
