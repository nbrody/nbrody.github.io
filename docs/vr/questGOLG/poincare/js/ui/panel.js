/**
 * panel.js — immediate-mode 2D panels drawn on a canvas and shown in 3D.
 *
 * A panel is a THREE.Mesh (a plane) textured with a canvas. `build(ui, state)`
 * is called on every redraw and draws the whole panel top to bottom; controls
 * register hit regions as they draw. Hover/pressed looks use the regions from
 * the previous redraw (the usual immediate-mode trick).
 *
 * Coordinates
 *  - Canvas px: x right, y down, origin at the panel's top-left corner.
 *  - Panel UV: u right, v UP (v = 1 at the top), exactly what three.js gives in
 *    raycast hits on a PlaneGeometry. Canvas px = (u·W, (1 − v)·H).
 *  - Poke depth: signed distance in meters from the panel plane along its
 *    front normal (+z of the mesh). Positive = in front of the panel.
 *
 * Sizes: every size you pass (space, width, size, …) is in canvas px. Defaults
 * are designed at 2400 px/m and multiplied by `ui.s` = pxPerM / 2400.
 */
import * as THREE from 'three';
import { texImage, onTexReady, drawTex, texEngineReady } from './tex.js';

const BASE_PX_PER_M = 2400;
const MAX_CANVAS = 2048;

const FONT_BODY = '"Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif';
const FONT_HEAD = '"Source Serif 4", Georgia, "Times New Roman", serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

// ---------------------------------------------------------------- colors

const hexCache = new Map();
function parseColor(c) {
  let v = hexCache.get(c);
  if (v) return v;
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(c))) v = [...m[1]].map((h) => parseInt(h + h, 16));
  else if ((m = /^#([0-9a-f]{6})$/i.exec(c))) v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^rgba?\(([^)]+)\)$/i.exec(c))) v = m[1].split(',').slice(0, 3).map((x) => parseFloat(x));
  else v = [128, 128, 128];
  hexCache.set(c, v);
  return v;
}
const mixCache = new Map();
/** Mix two colors: t = 0 → a, t = 1 → b. */
export function mix(a, b, t) {
  t = Math.round(Math.min(1, Math.max(0, t)) * 100) / 100;
  if (t === 0) return a;
  if (t === 1) return b;
  const key = a + '|' + b + '|' + t;
  let r = mixCache.get(key);
  if (!r) {
    const A = parseColor(a), B = parseColor(b);
    const h = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
    r = '#' + h(0) + h(1) + h(2);
    if (mixCache.size > 4000) mixCache.clear();
    mixCache.set(key, r);
  }
  return r;
}

function makeTheme(name, t) {
  return {
    name,
    ...t,
    accentSoftHover: mix(t.accentSoft, t.accent, name === 'dark' ? 0.22 : 0.16),
    accentHover: mix(t.accent, name === 'dark' ? '#ffffff' : t.accentInk, 0.14),
  };
}

/** Color themes. Dark is a dim slate (never near-black). */
export const THEMES = {
  light: makeTheme('light', {
    bg: '#ffffff', surface: '#f4f6f8', field: '#e7e9ec', text: '#16181e', muted: '#5f636c',
    border: '#dadce0', accent: '#818cf8', accentInk: '#5f67cf', accentOn: '#141414',
    accentSoft: '#eff2ff', accent2: '#00a7da', accent3: '#d38ae7',
    ok: '#2e9d62', warn: '#c98a14', fail: '#d14d41',
    track: '#e1e4e8', switchOff: '#d2d5db', knob: '#ffffff',
    hoverOverlay: 'rgba(22,24,30,0.045)', scrollThumb: 'rgba(95,99,108,0.38)', scrollThumbActive: 'rgba(95,99,108,0.7)',
  }),
  dark: makeTheme('dark', {
    bg: '#2b3138', surface: '#373e47', field: '#3f464d', text: '#e8ebef', muted: '#a5abb4',
    border: '#4c535d', accent: '#818cf8', accentInk: '#a5b0ff', accentOn: '#141414',
    accentSoft: '#3a4166', accent2: '#3cc3ec', accent3: '#dc9cf0',
    ok: '#4cc283', warn: '#e2aa3c', fail: '#ec6e62',
    track: '#4a525c', switchOff: '#58606b', knob: '#f4f6f8',
    hoverOverlay: 'rgba(255,255,255,0.06)', scrollThumb: 'rgba(165,171,180,0.4)', scrollThumbActive: 'rgba(165,171,180,0.75)',
  }),
};

/** Resolve a theme key ('ok', 'accent2', …) or pass a CSS color through. */
function themeColor(theme, c, dflt) {
  if (!c) return dflt;
  if (c === true) return theme.accent;
  return theme[c] || c;
}

// ---------------------------------------------------------------- text metrics (shared)

const mctx = document.createElement('canvas').getContext('2d');
const HAS_LS = 'letterSpacing' in mctx;
let measureCache = new Map();
let wrapCache = new Map();
let capCache = new Map();
let mFont = '', mLS = '0px';

function measure(font, ls, text) {
  const key = font + '\u0001' + ls + '\u0001' + text;
  let w = measureCache.get(key);
  if (w === undefined) {
    if (font !== mFont) { mctx.font = font; mFont = font; }
    if (HAS_LS && ls !== mLS) { mctx.letterSpacing = ls; mLS = ls; }
    w = mctx.measureText(text).width;
    if (measureCache.size > 20000) measureCache = new Map();
    measureCache.set(key, w);
  }
  return w;
}

/** Cap height / font size for a font string (measured once). */
function capRatio(font) {
  let r = capCache.get(font);
  if (r === undefined) {
    const f = font.replace(/[\d.]+px/, '100px');
    mctx.font = f; mFont = f;
    if (HAS_LS) { mctx.letterSpacing = '0px'; mLS = '0px'; }
    const m = mctx.measureText('H');
    r = m.actualBoundingBoxAscent ? m.actualBoundingBoxAscent / 100 : 0.7;
    capCache.set(font, r);
  }
  return r;
}

/** Greedy word wrap; returns an array of lines (cached). */
function wrapText(font, ls, text, maxW) {
  const key = font + '\u0001' + ls + '\u0001' + Math.round(maxW) + '\u0001' + text;
  let lines = wrapCache.get(key);
  if (lines) return lines;
  lines = [];
  const space = measure(font, ls, ' ');
  for (const para of String(text).split('\n')) {
    const words = para.split(/ +/);
    let line = '', lw = 0;
    for (const word of words) {
      const ww = measure(font, ls, word);
      if (line && lw + space + ww > maxW) { lines.push(line); line = word; lw = ww; }
      else if (line) { line += ' ' + word; lw += space + ww; }
      else { line = word; lw = ww; }
    }
    lines.push(line);
  }
  if (wrapCache.size > 4000) wrapCache = new Map();
  wrapCache.set(key, lines);
  return lines;
}

/** Truncate with an ellipsis to fit maxW. */
function fitText(font, ls, text, maxW) {
  text = String(text);
  if (measure(font, ls, text) <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(font, ls, text.slice(0, mid) + '…') <= maxW) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}

// ---------------------------------------------------------------- shared readiness

const livePanels = new Set();
function invalidateAll() { for (const p of livePanels) p.invalidate(); }
function fontsChanged() {
  measureCache = new Map(); wrapCache = new Map(); capCache = new Map(); mFont = '';
  invalidateAll();
}
onTexReady(invalidateAll);

const FONT_SPECS = [
  `400 30px "Atkinson Hyperlegible"`, `700 30px "Atkinson Hyperlegible"`,
  `500 40px "Source Serif 4"`, `400 30px "JetBrains Mono"`,
];
let fontsAreReady = false;

/** Resolves when the three web fonts are loaded (or after a 15 s timeout). */
export const fontsReady = (async () => {
  if (!document.fonts || !document.fonts.load) { fontsAreReady = true; return; }
  document.fonts.addEventListener?.('loadingdone', fontsChanged);
  const t0 = performance.now();
  // The stylesheet may still be loading: retry until every face is found.
  while (performance.now() - t0 < 15000) {
    const got = await Promise.all(FONT_SPECS.map((f) => document.fonts.load(f).catch(() => [])));
    if (got.every((faces) => faces && faces.length)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  fontsAreReady = true;
  fontsChanged();
})();

/** True once the web fonts have loaded (panels redraw automatically when they do). */
export function fontsLoaded() { return fontsAreReady; }

// ---------------------------------------------------------------- drawing helpers

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ICONS = new Set(['close', 'back', 'forward', 'chevron-left', 'chevron-right', 'chevron-up', 'chevron-down',
  'plus', 'minus', 'check', 'play', 'pause', 'reset', 'menu', 'dot', 'stop']);

/** Built-in vector icons, drawn centered at (cx, cy) inside a size×size box. */
function drawIcon(ctx, name, cx, cy, size, color) {
  const r = size / 2;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.12); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const L = (pts) => { ctx.moveTo(cx + pts[0] * r, cy + pts[1] * r); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(cx + pts[i] * r, cy + pts[i + 1] * r); };
  switch (name) {
    case 'close': L([-0.62, -0.62, 0.62, 0.62]); L([0.62, -0.62, -0.62, 0.62]); ctx.stroke(); break;
    case 'back': case 'chevron-left': L([0.3, -0.7, -0.4, 0, 0.3, 0.7]); ctx.stroke(); break;
    case 'forward': case 'chevron-right': L([-0.3, -0.7, 0.4, 0, -0.3, 0.7]); ctx.stroke(); break;
    case 'chevron-up': L([-0.7, 0.3, 0, -0.4, 0.7, 0.3]); ctx.stroke(); break;
    case 'chevron-down': L([-0.7, -0.3, 0, 0.4, 0.7, -0.3]); ctx.stroke(); break;
    case 'plus': L([-0.72, 0, 0.72, 0]); L([0, -0.72, 0, 0.72]); ctx.stroke(); break;
    case 'minus': L([-0.72, 0, 0.72, 0]); ctx.stroke(); break;
    case 'check': L([-0.72, 0.02, -0.22, 0.52, 0.72, -0.5]); ctx.stroke(); break;
    case 'play': L([-0.5, -0.75, 0.75, 0, -0.5, 0.75]); ctx.closePath(); ctx.fill(); break;
    case 'pause': ctx.rect(cx - 0.6 * r, cy - 0.7 * r, 0.42 * r, 1.4 * r); ctx.rect(cx + 0.18 * r, cy - 0.7 * r, 0.42 * r, 1.4 * r); ctx.fill(); break;
    case 'stop': rr(ctx, cx - 0.62 * r, cy - 0.62 * r, 1.24 * r, 1.24 * r, 0.18 * r); ctx.fill(); break;
    case 'reset': {
      ctx.arc(cx, cy, 0.66 * r, -Math.PI * 0.55, Math.PI * 1.15); ctx.stroke();
      const a = -Math.PI * 0.55, ex = cx + 0.66 * r * Math.cos(a), ey = cy + 0.66 * r * Math.sin(a);
      ctx.beginPath(); ctx.moveTo(ex + 0.42 * r, ey - 0.12 * r); ctx.lineTo(ex - 0.06 * r, ey); ctx.lineTo(ex + 0.22 * r, ey + 0.4 * r); ctx.stroke();
      break;
    }
    case 'menu': L([-0.7, -0.55, 0.7, -0.55]); L([-0.7, 0, 0.7, 0]); L([-0.7, 0.55, 0.7, 0.55]); ctx.stroke(); break;
    case 'dot': ctx.arc(cx, cy, 0.38 * r, 0, Math.PI * 2); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
}

function decimalsOf(step) {
  if (!step || !Number.isFinite(step)) return 2;
  const s = String(step);
  if (s.includes('e-')) return parseInt(s.split('e-')[1], 10);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function formatNumber(v, step, min, max) {
  const d = step ? decimalsOf(step) : (Math.abs(max - min) <= 10 ? 2 : Math.abs(max - min) <= 100 ? 1 : 0);
  const s = v.toFixed(d);
  return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s;
}

const isTexLabel = (l) => l && typeof l === 'object' && !Array.isArray(l) && l.tex != null;

// ---------------------------------------------------------------- panel

/**
 * @typedef {Object} PanelOptions
 * @property {string} [name]
 * @property {number} widthM  width in meters
 * @property {number} heightM height in meters
 * @property {number} [pxPerM=2400] canvas resolution (the longer side is capped at 2048 px)
 * @property {'light'|'dark'|Object} [theme='light']
 * @property {(ui: UI, state: Object) => void} [build]
 * @property {Object} [state] initial state passed to build
 * @property {boolean} [autoState=false] write toggle/slider/segmented/tabs values into state[id] before onAction fires
 * @property {number} [anisotropy=8]
 * @property {number} [renderOrder=10]
 */

/**
 * Create a canvas-textured 3D panel.
 * @param {PanelOptions} opts
 */
export function createPanel({
  name = 'panel', widthM, heightM, pxPerM = BASE_PX_PER_M, theme = 'light', build = null,
  state = {}, autoState = false, anisotropy = 8, renderOrder = 10,
} = {}) {
  if (!(widthM > 0 && heightM > 0)) throw new Error('createPanel: widthM and heightM are required');
  let W = Math.round(widthM * pxPerM), H = Math.round(heightM * pxPerM);
  if (Math.max(W, H) > MAX_CANVAS) {
    pxPerM *= MAX_CANVAS / Math.max(W, H);
    W = Math.round(widthM * pxPerM); H = Math.round(heightM * pxPerM);
  }
  const s = pxPerM / BASE_PX_PER_M;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Upload premultiplied so mipmaps of the transparent corners don't get dark fringes.
  texture.premultiplyAlpha = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, toneMapped: false, alphaTest: 0.02, depthWrite: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const geometry = new THREE.PlaneGeometry(widthM, heightM);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = renderOrder;

  // Default metrics at 2400 px/m, scaled.
  const M = {
    pad: 36 * s, gap: 16 * s, gapX: 12 * s, body: 30 * s, small: 24 * s, h1: 46 * s, h2: 36 * s, label: 22 * s,
    lh: 1.4, btnH: 64 * s, btnPadX: 28 * s, chipH: 44 * s, rowH: 64 * s, swW: 76 * s, swH: 42 * s,
    track: 12 * s, thumbR: 19 * s, sliderRowH: 50 * s, segH: 62 * s, segPad: 5 * s, tabH: 62 * s,
    cardPad: 24 * s, cardR: 34 * s, panelR: 44 * s, sbW: 8 * s, sbReserve: 20 * s, iconGap: 12 * s,
    drift: 8 * s, scrollSlop: 14 * s, hoverBleed: 14 * s,
  };

  let themeObj = typeof theme === 'string' ? (THEMES[theme] || THEMES.light) : theme;
  let buildFn = build;
  let dirty = true;
  let frame = 0, lastDraw = 0, dt = 1 / 60, needsAnim = false;

  /** Hit regions: `regions` from the last redraw, `next` being built. */
  let regions = [], next = [];
  let byKey = new Map(), nextByKey = new Map();
  const anims = new Map();
  const scrolls = new Map(); // id → { offset, contentH, viewH }
  const pointers = new Map();
  const actionCbs = new Set();
  const hapticCbs = new Set();

  let curFont = null, curLS = null;
  function setFont(font, ls = '0px') {
    if (font !== curFont) { ctx.font = font; curFont = font; }
    if (HAS_LS && ls !== curLS) { ctx.letterSpacing = ls; curLS = ls; }
  }
  function resetFontTracking() { curFont = null; curLS = null; }

  const fontStr = (kind, size, weight) => {
    const fam = kind === 'head' ? FONT_HEAD : kind === 'mono' ? FONT_MONO : FONT_BODY;
    return `${weight || (kind === 'head' ? 500 : 400)} ${Math.round(size * 2) / 2}px ${fam}`;
  };

  // ------------------------------------------------------------ state helpers used while building

  function anim(key, target, tau = 0.055) {
    let a = anims.get(key);
    if (!a) { a = { v: target, f: frame }; anims.set(key, a); return target; }
    a.f = frame;
    if (a.v !== target) {
      const k = 1 - Math.exp(-dt / tau);
      a.v += (target - a.v) * k;
      if (Math.abs(target - a.v) < 0.004) a.v = target; else needsAnim = true;
    }
    return a.v;
  }
  function isHovered(key) {
    for (const p of pointers.values()) if (p.hoverKey === key && p.inside) return true;
    return false;
  }
  function isPressed(key) {
    for (const p of pointers.values()) if (p.downKey === key && p.over) return true;
    return false;
  }
  function isDragging(key) {
    for (const p of pointers.values()) if (p.downKey === key && (p.mode === 'slider' || p.mode === 'drag')) return p;
    return null;
  }
  function addRegion(r) {
    next.push(r);
    nextByKey.set(r.key, r);
    return r;
  }

  // ------------------------------------------------------------ UI (layout + widgets)

  /** Immediate-mode builder passed to `build(ui, state)`. */
  class UI {
    constructor() {
      this.ctx = ctx; this.s = s; this.W = W; this.H = H; this.metrics = M;
      this.fonts = { body: FONT_BODY, head: FONT_HEAD, mono: FONT_MONO };
    }
    get theme() { return themeObj; }
    get state() { return state; }
    get panel() { return api; }
    get gap() { return M.gap; }

    _begin() {
      this.x = M.pad; this.width = W - 2 * M.pad; this.cursorY = M.pad;
      this._bottom = H - M.pad; this._trail = 0; this._row = null; this._clip = null; this._scrollId = null;
    }
    _end() {
      if (this._row) { const r = this._row; this._row = null; this._flushRow(r); }
    }

    /** Space left below the cursor in the current container (px). */
    remaining() { return Math.max(0, this._bottom - this.cursorY); }

    _visible(y, h) {
      const c = this._clip;
      return !c || (y + h > c.y && y < c.y + c.h);
    }

    /** Place an item: draws now (vertical flow) or defers (inside row). */
    _item(w, h, draw, o = {}) {
      if (this._row) { this._row.items.push({ w, h, draw, stretch: !!o.stretch, flex: o.flex || 0 }); return; }
      let x = this.x;
      if (o.align === 'center') x += (this.width - w) / 2;
      else if (o.align === 'right') x += this.width - w;
      const y = this.cursorY;
      if (draw && this._visible(y, h)) draw(x, y, w, h);
      const g = o.gap ?? M.gap;
      this.cursorY = y + h + g;
      this._trail = g;
    }

    _blockOnly(what) {
      if (this._row) {
        console.warn(`[panel ${name}] ui.${what}() is block-level; flushing the open row first`);
        const r = this._row; this._row = null; this._flushRow(r);
      }
    }

    // ---------------- containers

    /**
     * Lay children out horizontally, wrapping to new lines. Buttons size to their labels.
     * @param {(ui: UI) => void} fn
     * @param {{gap?: number, vgap?: number, align?: 'left'|'center'|'right'|'stretch'}} [o]
     */
    row(fn, o = {}) {
      if (this._row) { fn(this); return; }
      const row = { items: [], gap: o.gap ?? M.gapX, vgap: o.vgap ?? (o.gap ?? M.gapX), align: o.align || 'left' };
      this._row = row;
      try { fn(this); } finally { this._row = null; }
      this._flushRow(row);
    }

    _flushRow({ items, gap, vgap, align }) {
      const maxW = this.width;
      const lines = [];
      let line = [], lw = 0;
      for (const it of items) {
        it.w = Math.min(it.w, maxW);
        if (line.length && lw + gap + it.w > maxW + 0.5) { lines.push({ items: line, w: lw }); line = []; lw = 0; }
        lw += (line.length ? gap : 0) + it.w;
        line.push(it);
      }
      if (line.length) lines.push({ items: line, w: lw });
      let y = this.cursorY;
      for (const ln of lines) {
        let lh = 0;
        for (const it of ln.items) lh = Math.max(lh, it.h);
        let extra = maxW - ln.w, x = this.x;
        const flexTotal = ln.items.reduce((a, it) => a + it.flex, 0);
        if (flexTotal > 0) {
          for (const it of ln.items) if (it.flex) it.w += (extra * it.flex) / flexTotal;
        } else if (align === 'stretch') {
          const st = ln.items.filter((it) => it.stretch);
          for (const it of st) it.w += extra / st.length;
        } else if (align === 'center') x += extra / 2;
        else if (align === 'right') x += extra;
        const vis = this._visible(y, lh);
        for (const it of ln.items) {
          if (vis && it.draw && it.w > 0) it.draw(x, y + (lh - it.h) / 2, it.w, it.h);
          x += it.w + gap;
        }
        y += lh + vgap;
      }
      this.cursorY = (lines.length ? y - vgap : y) + M.gap;
      this._trail = M.gap;
    }

    /** Flexible empty space inside a row (pushes later items to the right). */
    spacer(weight = 1) {
      if (this._row) this._row.items.push({ w: 0, h: 0, draw: null, flex: weight });
    }

    _sub(x, width, fn, arg) {
      const saved = [this.x, this.width, this._trail];
      this.x = x; this.width = width; this._trail = 0;
      fn(arg, this);
      const end = this.cursorY - this._trail;
      [this.x, this.width, this._trail] = saved;
      return end;
    }

    /**
     * Split the width into columns. `n` = count or an array of weights.
     * fn(colIndex, ui) is called once per column; columns start at the same y.
     */
    columns(n, fn, o = {}) {
      this._blockOnly('columns');
      const weights = Array.isArray(n) ? n : Array.from({ length: n }, () => 1);
      const gap = o.gap ?? M.gapX;
      const total = weights.reduce((a, b) => a + b, 0);
      const avail = this.width - gap * (weights.length - 1);
      const top = this.cursorY;
      let x = this.x, bottom = top;
      weights.forEach((wt, c) => {
        const w = (avail * wt) / total;
        this.cursorY = top;
        bottom = Math.max(bottom, this._sub(x, w, fn, c));
        x += w + gap;
      });
      this.cursorY = bottom + M.gap; this._trail = M.gap;
    }

    /**
     * Grid of items, n per row: fn(item, index, ui) draws one cell.
     * Cells in a row share a top edge; each row is as tall as its tallest cell.
     */
    grid(n, items, fn, o = {}) {
      this._blockOnly('grid');
      const gap = o.gap ?? M.gapX, vgap = o.vgap ?? gap;
      const w = (this.width - gap * (n - 1)) / n;
      for (let i = 0; i < items.length; i += n) {
        const top = this.cursorY;
        let bottom = top;
        for (let c = 0; c < n && i + c < items.length; c++) {
          this.cursorY = top;
          const idx = i + c;
          bottom = Math.max(bottom, this._sub(this.x + c * (w + gap), w, () => fn(items[idx], idx, this)));
        }
        this.cursorY = bottom + vgap;
      }
      if (items.length) { this.cursorY += M.gap - vgap; this._trail = M.gap; }
    }

    /**
     * A flat rounded block in the surface color holding its children.
     * With `id`, the whole card is clickable (fires onAction(id, value)).
     * @param {(ui: UI) => void} fn
     * @param {{tint?: string, pad?: number, radius?: number, id?: string, value?: any, active?: boolean, disabled?: boolean}} [o]
     */
    card(fn, o = {}) {
      this._blockOnly('card');
      const pad = o.pad ?? M.cardPad, r = o.radius ?? M.cardR;
      const x0 = this.x, w0 = this.width, top = this.cursorY;
      const regionIndex = next.length;
      this.cursorY = top + pad;
      const end = this._sub(x0 + pad, w0 - 2 * pad, fn, this);
      const h = Math.max(end - top + pad, 2 * pad);
      const T = themeObj;
      const named = { surface: T.surface, accent: T.accentSoft, bg: T.bg, field: T.field };
      let fill = !o.tint ? T.surface : named[o.tint] ?? (T[o.tint] ? mix(T.bg, T[o.tint], T.name === 'dark' ? 0.2 : 0.12) : o.tint);
      if (o.id != null) {
        const key = o.value !== undefined ? o.id + '#' + String(o.value) : o.id;
        const reg = { key, id: o.id, kind: 'card', value: o.value, disabled: !!o.disabled, x: x0, y: top, w: w0, h, clip: this._clip, scrollId: this._scrollId };
        next.splice(regionIndex, 0, reg); // under the card's own children
        nextByKey.set(key, reg);
        const hov = anim('h:' + key, isHovered(key) && !o.disabled ? 1 : 0);
        const pr = isPressed(key);
        if (o.active) fill = mix(T.accentSoft, T.accent, pr ? 0.35 : hov * 0.12);
        else fill = mix(fill, T.accent, pr ? 0.22 : hov * 0.09);
      }
      if (this._visible(top, h)) {
        // Children are already drawn: paint the card behind them.
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = fill;
        rr(ctx, x0, top, w0, h, r);
        ctx.fill();
        ctx.restore(); resetFontTracking();
      }
      this.cursorY = top + h + M.gap; this._trail = M.gap;
    }

    /**
     * Clipped, vertically scrolling region. Drag on empty space (or drag a
     * button vertically) to scroll; panel.scroll() handles wheels/thumbsticks.
     * @param {string} id
     * @param {number|null} heightPx  null → fill the remaining height
     * @param {(ui: UI) => void} fn
     */
    scrollArea(id, heightPx, fn) {
      this._blockOnly('scrollArea');
      const h = heightPx == null ? this.remaining() : heightPx;
      const x = this.x, w = this.width, top = this.cursorY;
      let st = scrolls.get(id);
      if (!st) { st = { offset: 0, contentH: 0, viewH: h }; scrolls.set(id, st); }
      st.viewH = h;
      st.offset = Math.max(0, Math.min(st.offset, Math.max(0, st.contentH - h)));
      const key = 'scroll:' + id;
      addRegion({ key, id, kind: 'scroll', x, y: top, w, h, clip: this._clip, scrollId: id });

      // Clip (a little wider than the content so hover highlights can bleed out).
      const bleed = M.hoverBleed + 2 * s;
      const parent = this._clip;
      let clip = { x: x - bleed, y: top, w: w + 2 * bleed, h };
      if (parent) {
        const x1 = Math.max(clip.x, parent.x), y1 = Math.max(clip.y, parent.y);
        const x2 = Math.min(clip.x + clip.w, parent.x + parent.w), y2 = Math.min(clip.y + clip.h, parent.y + parent.h);
        clip = { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();
      const saved = { clip: this._clip, sid: this._scrollId, bottom: this._bottom };
      this._clip = clip; this._scrollId = id; this._bottom = top + h;
      const scrollable = st.contentH > h + 0.5;
      this.cursorY = top - st.offset;
      const end = this._sub(x, w - (scrollable ? M.sbReserve : 0), fn, this);
      ctx.restore(); resetFontTracking();
      this._clip = saved.clip; this._scrollId = saved.sid; this._bottom = saved.bottom;

      const contentH = end - (top - st.offset);
      if (Math.abs(contentH - st.contentH) > 0.5) {
        const wasScrollable = scrollable;
        st.contentH = contentH;
        // Layout width depends on whether a scrollbar shows: redo next frame if that flipped.
        if ((contentH > h + 0.5) !== wasScrollable || st.offset > Math.max(0, contentH - h)) needsAnim = true;
      }
      if (st.contentH > h + 0.5) {
        const thumbH = Math.max(40 * s, (h * h) / st.contentH);
        const ty = top + (st.offset / (st.contentH - h)) * (h - thumbH);
        let active = false;
        for (const p of pointers.values()) if (p.mode === 'scroll' && p.scrollId === id) active = true;
        const hov = anim('sb:' + id, active || isHovered(key) ? 1 : 0);
        ctx.fillStyle = hov > 0.5 ? themeObj.scrollThumbActive : themeObj.scrollThumb;
        const sw = M.sbW * (1 + 0.25 * hov);
        rr(ctx, x + w - sw, ty, sw, thumbH, sw / 2);
        ctx.fill();
      }
      this.cursorY = top + h + M.gap; this._trail = M.gap;
    }

    // ---------------- text

    _lines(text, font, ls, size, lh, color, o) {
      const wrap = o.wrap !== false && !this._row;
      const cap = capRatio(font);
      const lineH = size * lh;
      const maxW = this._row ? this.width : (o.width ?? this.width);
      const lines = wrap ? wrapText(font, ls, text, maxW) : [fitText(font, ls, text, maxW)];
      let w = 0;
      for (const l of lines) w = Math.max(w, measure(font, ls, l));
      w = Math.min(w, maxW);
      const h = lines.length * lineH;
      const align = o.align || 'left';
      this._item(this._row ? w : maxW, h, (x, y, bw) => {
        setFont(font, ls);
        ctx.fillStyle = color;
        lines.forEach((l, i) => {
          const base = y + i * lineH + lineH / 2 + (cap * size) / 2;
          let lx = x;
          if (align !== 'left') { const lw = measure(font, ls, l); lx = align === 'center' ? x + (bw - lw) / 2 : x + bw - lw; }
          if (this._clip && (base < this._clip.y - size || base > this._clip.y + this._clip.h + size)) return;
          ctx.fillText(l, lx, base);
        });
      }, { gap: o.gap });
    }

    /** Serif page heading. */
    heading(text, o = {}) {
      const size = o.size ?? M.h1;
      this._lines(String(text), fontStr('head', size, 500), `${(-0.012 * size).toFixed(2)}px`, size, 1.18, o.color ?? themeObj.text, o);
    }

    /** Smaller serif heading. */
    subheading(text, o = {}) {
      const size = o.size ?? M.h2;
      this._lines(String(text), fontStr('head', size, 500), `${(-0.01 * size).toFixed(2)}px`, size, 1.22, o.color ?? themeObj.text, o);
    }

    /** Small muted section label. */
    label(text, o = {}) {
      const size = o.size ?? M.label;
      this._lines(String(text).toUpperCase(), fontStr('body', size, 700), `${(0.08 * size).toFixed(2)}px`, size, 1.3, o.color ?? themeObj.muted, { ...o, gap: o.gap ?? M.gap * 0.6 });
    }

    /**
     * Body text (word-wrapped). Pass an array to get richLine behaviour.
     * @param {string|Array} text
     * @param {{muted?: boolean, size?: number, mono?: boolean, bold?: boolean, serif?: boolean, wrap?: boolean, color?: string, align?: string}} [o]
     */
    text(text, o = {}) {
      if (Array.isArray(text)) return this.richLine(text, o);
      const size = o.size ?? M.body;
      const kind = o.mono ? 'mono' : o.serif ? 'head' : 'body';
      const font = fontStr(kind, size, o.bold ? 700 : (kind === 'head' ? 500 : 400));
      const color = o.color ? themeColor(themeObj, o.color) : o.muted ? themeObj.muted : themeObj.text;
      this._lines(String(text), font, '0px', size, o.lineHeight ?? M.lh, color, o);
    }

    /**
     * A LaTeX formula as its own block. Shrinks to fit if too wide.
     * @param {string} tex
     * @param {{display?: boolean, size?: number, color?: string, align?: string}} [o]
     */
    tex(tex, o = {}) {
      const size = o.size ?? M.body;
      const color = o.color ? themeColor(themeObj, o.color) : themeObj.text;
      const t = texImage(tex, { display: !!o.display, color, px: size });
      const align = o.align || (o.display ? 'center' : 'left');
      if (!t.img) {
        const err = t.error && texEngineReady();
        this.text(t.fallback, { size, color: err ? themeObj.fail : themeObj.muted, align, wrap: true });
        return;
      }
      const maxW = this.width;
      const scale = Math.min(1, maxW / t.w);
      const vpad = (o.display ? 0.2 : 0.06) * size;
      const w = t.w * scale, h = t.h * scale + 2 * vpad;
      this._item(w, h, (x, y) => {
        drawTex(ctx, t, x, y + vpad + (t.h - t.depth) * scale, scale);
      }, { align: this._row ? undefined : align, gap: o.gap });
    }

    /**
     * One paragraph mixing plain strings and inline math: ['Let ', {tex:'G'}, ' act.'].
     * Parts may also be {text, bold, mono, color, muted}. Breaks only at spaces.
     */
    richLine(parts, o = {}) {
      const size = o.size ?? M.body;
      const T = themeObj;
      const baseColor = o.color ? themeColor(T, o.color) : o.muted ? T.muted : T.text;
      const baseFont = fontStr(o.mono ? 'mono' : 'body', size, o.bold ? 700 : 400);
      const atoms = [];
      let space = false;
      const pushText = (str, font, color) => {
        const re = /(\n)|([ \t]+)|([^\s]+)/g;
        let m;
        while ((m = re.exec(str))) {
          if (m[1]) { atoms.push({ br: true }); space = false; }
          else if (m[2]) space = true;
          else { atoms.push({ text: m[3], font, color, w: measure(font, '0px', m[3]), space }); space = false; }
        }
      };
      for (const part of Array.isArray(parts) ? parts : [parts]) {
        if (part == null || part === false) continue;
        if (typeof part === 'string' || typeof part === 'number') pushText(String(part), baseFont, baseColor);
        else if (part.tex != null) {
          const color = part.color ? themeColor(T, part.color) : baseColor;
          const t = texImage(part.tex, { display: false, color, px: part.size ?? size });
          if (t.img) atoms.push({ tex: t, w: t.w, asc: t.h - t.depth, desc: t.depth, space });
          else {
            const err = t.error && texEngineReady();
            atoms.push({ text: t.fallback, font: baseFont, color: err ? T.fail : T.muted, w: measure(baseFont, '0px', t.fallback), space });
          }
          space = false;
        } else if (part.text != null) {
          const font = fontStr(part.mono ? 'mono' : 'body', part.size ?? size, part.bold ? 700 : 400);
          const color = part.color ? themeColor(T, part.color) : part.muted ? T.muted : baseColor;
          pushText(String(part.text), font, color);
        }
      }
      const spaceW = measure(baseFont, '0px', ' ');
      const maxW = this._row ? Infinity : this.width;
      // Group atoms glued without spaces into unbreakable clusters, then fill lines.
      const lines = [];
      let cur = { atoms: [], w: 0 };
      let i = 0;
      while (i < atoms.length) {
        if (atoms[i].br) { lines.push(cur); cur = { atoms: [], w: 0 }; i++; continue; }
        let j = i + 1, cw = atoms[i].w;
        while (j < atoms.length && !atoms[j].br && !atoms[j].space) cw += atoms[j++].w;
        const lead = cur.atoms.length && atoms[i].space ? spaceW : 0;
        if (cur.atoms.length && cur.w + lead + cw > maxW) { lines.push(cur); cur = { atoms: [], w: 0 }; }
        for (let k = i; k < j; k++) {
          const a = atoms[k];
          const gap = cur.atoms.length && a.space ? spaceW : 0;
          cur.atoms.push({ a, x: cur.w + gap });
          cur.w += gap + a.w;
        }
        i = j;
      }
      lines.push(cur);
      const cap = capRatio(baseFont) * size;
      const lineH = size * (o.lineHeight ?? M.lh);
      let total = 0, maxLW = 0;
      for (const ln of lines) {
        let asc = lineH / 2 + cap / 2, desc = lineH - asc;
        for (const { a } of ln.atoms) if (a.tex) { asc = Math.max(asc, a.asc + 0.12 * size); desc = Math.max(desc, a.desc + 0.12 * size); }
        ln.base = total + asc; ln.h = asc + desc; total += ln.h;
        maxLW = Math.max(maxLW, ln.w);
      }
      const w = this._row ? Math.min(maxLW, this.width) : this.width;
      const align = o.align || 'left';
      this._item(w, total, (x, y, bw) => {
        for (const ln of lines) {
          const by = y + ln.base;
          if (this._clip && (by < this._clip.y - size * 2 || by > this._clip.y + this._clip.h + size * 2)) continue;
          const lx = x + (align === 'center' ? (bw - ln.w) / 2 : align === 'right' ? bw - ln.w : 0);
          for (const { a, x: ax } of ln.atoms) {
            if (a.tex) drawTex(ctx, a.tex, lx + ax, by);
            else { setFont(a.font); ctx.fillStyle = a.color; ctx.fillText(a.text, lx + ax, by); }
          }
        }
      }, { gap: o.gap });
    }

    // ---------------- decoration

    divider(o = {}) {
      const t = o.thickness ?? 2 * s;
      this._item(this.width, t, (x, y, w) => {
        ctx.fillStyle = themeObj.border;
        ctx.fillRect(x, y, w, t);
      }, { gap: o.gap });
    }

    /** Vertical space (or horizontal space inside a row). */
    space(px) {
      if (this._row) { this._row.items.push({ w: px, h: 0, draw: null, flex: 0 }); return; }
      this.cursorY += px;
    }

    /** Reserve a full-width block of height h and return its rect for custom drawing. */
    block(h) {
      this._blockOnly('block');
      const r = { x: this.x, y: this.cursorY, w: this.width, h };
      this.cursorY += h + M.gap; this._trail = M.gap;
      return r;
    }

    /** Custom-drawn item that works in rows too: draw(ctx, x, y, w, h). */
    custom(w, h, draw, o = {}) {
      this._item(w ?? this.width, h, (x, y, ww, hh) => { draw(ctx, x, y, ww, hh); resetFontTracking(); }, o);
    }

    /**
     * Small status pill: colored dot + text.
     * @param {string|{tex: string}} text
     * @param {{color?: string}} [o]  'ok' | 'warn' | 'fail' | 'accent' | 'muted' | CSS color
     */
    chip(text, o = {}) {
      const T = themeObj;
      const col = themeColor(T, o.color, T.accent);
      const size = o.size ?? M.small;
      const h = o.height ?? M.chipH;
      const font = fontStr('body', size, 700);
      const padX = 0.42 * h, dot = 0.27 * h, dg = 0.24 * h;
      let tw, t = null;
      if (isTexLabel(text)) { t = texImage(text.tex, { color: T.text, px: size }); tw = t.img ? t.w : measure(font, '0px', t.fallback); }
      else tw = measure(font, '0px', String(text));
      const w = padX * 2 + dot + dg + tw - 0.1 * h;
      this._item(w, h, (x, y, bw, bh) => {
        ctx.fillStyle = mix(T.bg, col, T.name === 'dark' ? 0.2 : 0.13);
        rr(ctx, x, y, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x + padX * 0.8 + dot / 2, y + bh / 2, dot / 2, 0, Math.PI * 2); ctx.fill();
        const tx = x + padX * 0.8 + dot + dg;
        const base = y + bh / 2 + (capRatio(font) * size) / 2;
        if (t && t.img) drawTex(ctx, t, tx, y + bh / 2 + (t.h / 2 - t.depth));
        else { setFont(font); ctx.fillStyle = T.text; ctx.fillText(t ? t.fallback : String(text), tx, base); }
      }, { gap: o.gap });
    }

    // ---------------- controls

    /** Measure a label: string, {tex}, or array of rich parts (single line). */
    _labelInfo(label, font, size, color, texFlag) {
      if (texFlag && typeof label === 'string') label = { tex: label };
      if (isTexLabel(label)) {
        const t = texImage(label.tex, { color, px: size });
        if (t.img) return { kind: 'tex', t, w: t.w };
        return { kind: 'text', text: t.fallback, w: measure(font, '0px', t.fallback), fallback: true };
      }
      if (label == null || label === '') return { kind: 'none', w: 0 };
      const text = String(label);
      return { kind: 'text', text, w: measure(font, '0px', text) };
    }

    _drawLabel(info, font, size, x, cy, color, maxW) {
      if (info.kind === 'tex') {
        const t = info.t;
        const scale = maxW && t.w > maxW ? maxW / t.w : 1;
        drawTex(ctx, t, x, cy + (t.h / 2 - t.depth) * scale, scale);
      } else if (info.kind === 'text') {
        setFont(font);
        ctx.fillStyle = info.fallback ? mix(color, themeObj.muted, 0.5) : color;
        const text = maxW && info.w > maxW ? fitText(font, '0px', info.text, maxW) : info.text;
        ctx.fillText(text, x, cy + (capRatio(font) * size) / 2);
      }
    }

    /**
     * Pill button. Full width in the vertical flow, label-sized inside a row.
     * @param {string} id
     * @param {string|{tex: string}} label
     * @param {{active?: boolean, disabled?: boolean, tex?: boolean, width?: number|string, height?: number,
     *          icon?: string|Function, accent?: boolean|string, value?: any, size?: number, align?: string}} [o]
     *   icon: built-in name ('close','back','forward','chevron-*','plus','minus','check','play','pause','stop','reset','menu','dot'),
     *         any other string (drawn as text), or fn(ctx, cx, cy, size, color).
     *   accent: true → solid accent (primary); a theme key/color → tinted in that hue.
     */
    button(id, label, o = {}) {
      const T = themeObj;
      const size = o.size ?? M.body;
      const h = o.height ?? M.btnH;
      const font = fontStr('body', size, 700);
      const key = o.value !== undefined ? id + '#' + String(o.value) : id; // same id + different values = separate controls
      const hovered = isHovered(key) && !o.disabled;
      const pressed = isPressed(key) && !o.disabled;
      // Colors
      let bg, fg;
      const hue = typeof o.accent === 'string' ? themeColor(T, o.accent) : null;
      const hov = anim('h:' + key, hovered ? 1 : 0);
      const pr = anim('p:' + key, pressed ? 1 : 0, 0.04);
      if (o.disabled) { bg = T.field; fg = T.muted; }
      else if (o.active || pressed || o.accent === true) {
        bg = mix(T.accent, T.accentHover, Math.max(hov, pr) * (o.active || o.accent === true ? 1 : 0));
        if (pressed && !o.active && o.accent !== true) bg = T.accent;
        fg = T.accentOn;
      } else if (hue) {
        const k = T.name === 'dark' ? 0.24 : 0.14;
        bg = mix(T.bg, hue, k + hov * 0.1);
        fg = mix(hue, T.text, T.name === 'dark' ? 0.25 : 0.3);
      } else {
        bg = mix(T.accentSoft, T.accentSoftHover, hov);
        fg = T.accentInk;
      }
      const info = this._labelInfo(label, font, size, fg, o.tex);
      const iconSize = 0.86 * size;
      const hasIcon = o.icon != null && o.icon !== '';
      const iconW = hasIcon ? (typeof o.icon === 'string' && !ICONS.has(o.icon) ? measure(font, '0px', o.icon) : iconSize) : 0;
      const contentW = iconW + (hasIcon && info.w ? M.iconGap : 0) + info.w;
      const natural = info.w ? Math.max(h, contentW + 2 * M.btnPadX) : h;
      let w;
      if (o.width != null) w = typeof o.width === 'string' && o.width.endsWith('%') ? (this.width * parseFloat(o.width)) / 100 : o.width;
      else w = this._row ? natural : this.width;
      const clip = this._clip, scrollId = this._scrollId;
      this._item(w, h, (x, y, bw, bh) => {
        addRegion({ key, id, kind: 'button', value: o.value, disabled: !!o.disabled, x, y, w: bw, h: bh, clip, scrollId });
        const inset = 2.5 * s * pr;
        ctx.globalAlpha = o.disabled ? 0.6 : 1;
        ctx.fillStyle = bg;
        rr(ctx, x + inset, y + inset, bw - 2 * inset, bh - 2 * inset, (bh - 2 * inset) / 2);
        ctx.fill();
        const avail = bw - 2 * M.btnPadX - iconW - (hasIcon && info.w ? M.iconGap : 0);
        const cw = hasIcon && !info.w ? iconW : Math.min(contentW, bw - 2 * M.btnPadX);
        let cx = x + (bw - cw) / 2;
        if (o.align === 'left') cx = x + M.btnPadX;
        const cy = y + bh / 2;
        if (hasIcon) {
          if (typeof o.icon === 'function') o.icon(ctx, cx + iconW / 2, cy, iconSize, fg);
          else if (ICONS.has(o.icon)) drawIcon(ctx, o.icon, cx + iconW / 2, cy, iconSize, fg);
          else { setFont(font); ctx.fillStyle = fg; ctx.fillText(o.icon, cx, cy + (capRatio(font) * size) / 2); }
          resetFontTracking();
          cx += iconW + (info.w ? M.iconGap : 0);
        }
        if (info.w) {
          // Tex labels re-tint to the final color (sync once rendered).
          const li = info.kind === 'tex' ? { ...info, t: texImage((isTexLabel(label) ? label.tex : label), { color: fg, px: size }) } : info;
          this._drawLabel(li, font, size, cx, cy, fg, Math.max(10, avail));
        }
        ctx.globalAlpha = 1;
      }, { stretch: o.width == null, align: o.alignSelf, gap: o.gap });
    }

    /**
     * Label on the left, phone-style switch on the right. Click anywhere on the row.
     * Fires onAction(id, !value).
     */
    toggle(id, label, value, o = {}) {
      const T = themeObj;
      const size = o.size ?? M.body;
      const font = fontStr('body', size, 400);
      const h = o.height ?? M.rowH;
      const info = this._labelInfo(label, font, size, T.text, o.tex);
      const natural = info.w + M.gapX * 2 + M.swW;
      const w = this._row ? natural : this.width;
      const clip = this._clip, scrollId = this._scrollId;
      const key = id;
      const hov = anim('h:' + key, isHovered(key) && !o.disabled ? 1 : 0);
      const pr = anim('p:' + key, isPressed(key) && !o.disabled ? 1 : 0, 0.04);
      const k = anim('t:' + key, value ? 1 : 0, 0.07);
      this._item(w, h, (x, y, bw, bh) => {
        addRegion({ key, id, kind: 'toggle', value: !!value, disabled: !!o.disabled, x, y, w: bw, h: bh, clip, scrollId });
        ctx.globalAlpha = o.disabled ? 0.5 : 1;
        if (hov > 0.01) {
          ctx.globalAlpha *= hov;
          ctx.fillStyle = T.hoverOverlay;
          const b = this._row ? 0 : M.hoverBleed;
          rr(ctx, x - b, y, bw + 2 * b, bh, bh / 2);
          ctx.fill();
          ctx.globalAlpha = o.disabled ? 0.5 : 1;
        }
        const sx = x + bw - M.swW - (this._row ? 0 : 2 * s), sy = y + (bh - M.swH) / 2;
        this._drawLabel(info, font, size, x, y + bh / 2, T.text, sx - x - M.gapX);
        ctx.fillStyle = mix(T.switchOff, T.accent, k);
        rr(ctx, sx, sy, M.swW, M.swH, M.swH / 2);
        ctx.fill();
        const kr = M.swH / 2 - 4 * s;
        const stretch = 7 * s * pr;
        const kx = sx + M.swH / 2 + k * (M.swW - M.swH);
        ctx.fillStyle = T.knob;
        rr(ctx, kx - kr - stretch * k, sy + 4 * s, 2 * kr + stretch, 2 * kr, kr);
        ctx.fill();
        ctx.globalAlpha = 1;
      }, { gap: o.gap });
    }

    /**
     * Slider with label + value readout above the track.
     * Fires onAction(id, value, {final:false}) while dragging, then {final:true}.
     * @param {{step?: number, format?: (v:number) => string|{tex:string}, width?: number, disabled?: boolean, tex?: boolean}} [o]
     */
    slider(id, label, value, min, max, o = {}) {
      const T = themeObj;
      const size = o.size ?? M.body;
      const font = fontStr('body', size, 400);
      const monoSize = size * 0.9;
      const mono = fontStr('mono', monoSize, 400);
      const key = id;
      const drag = isDragging(key);
      const v = drag && drag.sliderValue != null ? drag.sliderValue : value;
      const info = this._labelInfo(label, font, size, T.text, o.tex);
      const fmt = o.format ? o.format(v) : formatNumber(v, o.step, min, max);
      const vinfo = isTexLabel(fmt) ? this._labelInfo(fmt, mono, size, T.text) : { kind: 'text', text: String(fmt), w: measure(mono, '0px', String(fmt)) };
      const labelH = size * M.lh;
      const h = labelH + M.sliderRowH;
      const w = o.width ?? (this._row ? 360 * s : this.width);
      const clip = this._clip, scrollId = this._scrollId;
      const hov = anim('h:' + key, (isHovered(key) || drag) && !o.disabled ? 1 : 0);
      const pr = anim('p:' + key, drag ? 1 : 0, 0.04);
      this._item(w, h, (x, y, bw) => {
        const tr = M.thumbR;
        const trackX = x + tr, trackW = bw - 2 * tr;
        const ty = y + labelH + M.sliderRowH / 2;
        addRegion({ key, id, kind: 'slider', value: v, min, max, step: o.step, disabled: !!o.disabled,
          x, y: y + labelH - 6 * s, w: bw, h: M.sliderRowH + 12 * s, trackX, trackW, clip, scrollId });
        ctx.globalAlpha = o.disabled ? 0.5 : 1;
        this._drawLabel(info, font, size, x, y + labelH / 2, T.text, bw - vinfo.w - M.gapX);
        if (vinfo.kind === 'tex') this._drawLabel(vinfo, mono, size, x + bw - vinfo.w, y + labelH / 2, T.text);
        else { setFont(mono); ctx.fillStyle = drag ? T.accentInk : T.muted; ctx.fillText(vinfo.text, x + bw - vinfo.w, y + labelH / 2 + (capRatio(mono) * monoSize) / 2); }
        const f = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
        const th = M.track;
        ctx.fillStyle = T.track;
        rr(ctx, trackX - th / 2, ty - th / 2, trackW + th, th, th / 2); ctx.fill();
        ctx.fillStyle = T.accent;
        rr(ctx, trackX - th / 2, ty - th / 2, f * trackW + th, th, th / 2); ctx.fill();
        const r = tr * (1 + 0.12 * hov + 0.12 * pr);
        const cx = trackX + f * trackW;
        ctx.fillStyle = T.accent;
        ctx.beginPath(); ctx.arc(cx, ty, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = T.bg;
        ctx.beginPath(); ctx.arc(cx, ty, r * 0.36, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }, { gap: o.gap });
    }

    _optionList(options) {
      return options.map((op) => {
        if (op == null || typeof op !== 'object') return { value: op, label: String(op) };
        if ('value' in op) return { ...op, label: op.label ?? (op.tex != null ? { tex: op.tex } : String(op.value)) };
        if (op.tex != null) return { value: op.tex, label: { tex: op.tex } };
        return op;
      });
    }

    /**
     * Pill group of mutually exclusive options. Fires onAction(id, option.value).
     * @param {string} id
     * @param {Array<{value:any, label:string|{tex:string}, disabled?: boolean}|string>} options
     */
    segmented(id, options, value, o = {}) {
      const T = themeObj;
      const opts = this._optionList(options);
      const size = o.size ?? M.body * 0.93;
      const font = fontStr('body', size, 700);
      const h = o.height ?? M.segH, pad = M.segPad;
      const sel = opts.findIndex((op) => op.value === value);
      const infos = opts.map((op) => this._labelInfo(op.label, font, size, T.text));
      const padX = 22 * s;
      const natural = infos.reduce((a, inf) => a + inf.w + 2 * padX, 0) + 2 * pad;
      const w = o.width ?? (this._row ? natural : this.width);
      const pos = sel >= 0 ? anim('seg:' + id, sel, 0.06) : -1;
      const clip = this._clip, scrollId = this._scrollId;
      this._item(w, h, (x, y, bw, bh) => {
        ctx.fillStyle = T.field;
        rr(ctx, x, y, bw, bh, bh / 2); ctx.fill();
        const ow = (bw - 2 * pad) / opts.length, oh = bh - 2 * pad;
        opts.forEach((op, i) => {
          const ox = x + pad + i * ow;
          const k = id + '#' + i;
          addRegion({ key: k, id, kind: 'segment', value: op.value, disabled: !!op.disabled, x: ox, y: y + pad, w: ow, h: oh, clip, scrollId });
          const hv = anim('h:' + k, isHovered(k) && i !== sel && !op.disabled ? 1 : 0);
          if (hv > 0.01 || isPressed(k)) {
            ctx.fillStyle = isPressed(k) ? T.accentSoftHover : mix(T.field, T.accentSoftHover, 0.35 + 0.65 * hv);
            ctx.globalAlpha = isPressed(k) ? 1 : hv;
            rr(ctx, ox, y + pad, ow, oh, oh / 2); ctx.fill();
            ctx.globalAlpha = 1;
          }
        });
        if (pos >= 0) {
          ctx.fillStyle = T.accent;
          rr(ctx, x + pad + pos * ow, y + pad, ow, oh, oh / 2); ctx.fill();
        }
        opts.forEach((op, i) => {
          const on = pos >= 0 && Math.abs(pos - i) < 0.5;
          const col = on ? T.accentOn : op.disabled ? T.muted : T.text;
          let inf = infos[i];
          if (inf.kind === 'tex') inf = { ...inf, t: texImage(isTexLabel(op.label) ? op.label.tex : op.label, { color: col, px: size }) };
          const lw = Math.min(inf.w, ow - 16 * s);
          this._drawLabel(inf, font, size, x + pad + i * ow + (ow - lw) / 2, y + bh / 2, col, ow - 16 * s);
        });
      }, { stretch: o.width == null, gap: o.gap });
    }

    /**
     * Top tabs: text labels with a sliding accent underline. Fires onAction(id, option.value).
     */
    tabs(id, options, value, o = {}) {
      this._blockOnly('tabs');
      const T = themeObj;
      const opts = this._optionList(options);
      const size = o.size ?? M.body;
      const font = fontStr('body', size, 700);
      const h = o.height ?? M.tabH;
      const padX = 22 * s;
      const infos = opts.map((op) => this._labelInfo(op.label, font, size, T.text));
      let widths = infos.map((inf) => inf.w + 2 * padX);
      const total = widths.reduce((a, b) => a + b, 0);
      const fill = o.fill || total > this.width;
      if (fill) widths = widths.map(() => this.width / opts.length);
      const sel = opts.findIndex((op) => op.value === value);
      const lefts = [];
      let acc = 0;
      for (const w of widths) { lefts.push(acc); acc += w; }
      const ux = sel >= 0 ? anim('tabx:' + id, lefts[sel]) : 0;
      const uw = sel >= 0 ? anim('tabw:' + id, widths[sel]) : 0;
      const clip = this._clip, scrollId = this._scrollId;
      this._item(this.width, h, (x, y, bw, bh) => {
        ctx.fillStyle = T.border;
        ctx.fillRect(x, y + bh - 2 * s, bw, 2 * s);
        opts.forEach((op, i) => {
          const k = id + '#' + i;
          const tx = x + lefts[i], tw = widths[i];
          addRegion({ key: k, id, kind: 'tab', value: op.value, disabled: !!op.disabled, x: tx, y, w: tw, h: bh, clip, scrollId });
          const hv = anim('h:' + k, isHovered(k) && i !== sel && !op.disabled ? 1 : 0);
          if (hv > 0.01) {
            ctx.globalAlpha = hv;
            ctx.fillStyle = T.hoverOverlay;
            rr(ctx, tx + 4 * s, y + 6 * s, tw - 8 * s, bh - 14 * s, (bh - 14 * s) / 2); ctx.fill();
            ctx.globalAlpha = 1;
          }
          const col = i === sel ? T.text : op.disabled ? mix(T.muted, T.bg, 0.4) : mix(T.muted, T.text, hv);
          let inf = infos[i];
          if (inf.kind === 'tex') inf = { ...inf, t: texImage(isTexLabel(op.label) ? op.label.tex : op.label, { color: col, px: size }) };
          const lw = Math.min(inf.w, tw - 2 * padX * 0.5);
          this._drawLabel(inf, font, size, tx + (tw - lw) / 2, y + bh / 2 - 2 * s, col, tw - padX);
        });
        if (sel >= 0) {
          const bar = 5 * s;
          ctx.fillStyle = T.accent;
          rr(ctx, x + ux + padX * 0.6, y + bh - bar - 0.5 * s, uw - padX * 1.2, bar, bar / 2); ctx.fill();
        }
      }, { gap: o.gap });
    }

    // ---------------- custom hit regions

    /**
     * Register a custom hit region (canvas px). Returns {hover, pressed}.
     * Click fires onAction(id, value ?? {x, y}) with x, y in [0,1] within the region.
     * With {drag:true}, fires continuously while dragging (info.final false, then true).
     */
    region(id, x, y, w, h, o = {}) {
      addRegion({ key: id, id, kind: 'custom', value: o.value, drag: !!o.drag, disabled: !!o.disabled, x, y, w, h, clip: this._clip, scrollId: this._scrollId });
      return { hover: isHovered(id), pressed: isPressed(id) || !!isDragging(id) };
    }

    /** Is any pointer hovering / pressing this key? (key = id; segmented/tabs use `${id}#${index}`) */
    hovered(key) { return isHovered(key); }
    pressed(key) { return isPressed(key); }
    /** Smoothly animated value (keeps the panel redrawing until it settles). */
    anim(key, target, tau) { return anim(key, target, tau); }
    /** Draw a built-in icon. */
    icon(name, cx, cy, size, color) { drawIcon(ctx, name, cx, cy, size, color ?? themeObj.text); }
  }

  const ui = new UI();

  // ------------------------------------------------------------ redraw

  let lastBuildMs = 0, contentHeight = 0;

  function redraw() {
    const t0 = performance.now();
    dt = Math.min(1 / 30, Math.max(0.001, (t0 - lastDraw) / 1000));
    lastDraw = t0;
    frame++;
    needsAnim = false;
    next = []; nextByKey = new Map();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.clearRect(0, 0, W, H);
    resetFontTracking();
    ui._begin();
    try {
      if (buildFn) buildFn(ui, state);
      ui._end();
    } catch (e) {
      console.error(`[panel ${name}] build failed`, e);
      ui._row = null;
    }
    contentHeight = ui.cursorY - ui._trail + M.pad;
    // Mask to the rounded panel shape, then paint the background behind everything.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';
    rr(ctx, 0, 0, W, H, M.panelR); ctx.fill();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = themeObj.bg;
    rr(ctx, 0, 0, W, H, M.panelR); ctx.fill();
    ctx.restore(); resetFontTracking();

    regions = next; byKey = nextByKey;
    for (const [k, a] of anims) if (a.f < frame) anims.delete(k);
    texture.needsUpdate = true;
    dirty = needsAnim;
    // Controls may have moved: refresh hovers against the new regions.
    for (const p of pointers.values()) if (p.inside && (p.mode == null || p.mode === 'idle')) setHover(p, interactiveAt(p.x, p.y), false);
    lastBuildMs = performance.now() - t0;
  }

  // ------------------------------------------------------------ hit testing & pointers

  const inClip = (c, x, y) => !c || (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  function regionAt(x, y) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && inClip(r.clip, x, y)) return r;
    }
    return null;
  }
  function interactiveAt(x, y) {
    const r = regionAt(x, y);
    return r && r.kind !== 'scroll' && !r.disabled ? r : null;
  }
  function scrollAt(x, y) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (r.kind === 'scroll' && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && inClip(r.clip, x, y)) return r;
    }
    return null;
  }
  function toPx(uv) {
    return { x: uv.x * W, y: (1 - uv.y) * H };
  }
  function getPointer(pid) {
    let p = pointers.get(pid);
    if (!p) {
      p = { pid, x: 0, y: 0, inside: false, hoverKey: null, mode: null, down: null, downKey: null, downX: 0, downY: 0, over: false, grab: 0, sliderValue: null, scrollId: null, scrollStartY: 0, scrollStart: 0 };
      pointers.set(pid, p);
    }
    return p;
  }
  function haptic(pid, strength) {
    for (const cb of hapticCbs) { try { cb(pid, strength); } catch (e) { console.error(e); } }
  }
  function setHover(p, r, buzz = true) {
    const key = r ? r.key : null;
    if (key === p.hoverKey) return;
    p.hoverKey = key;
    dirty = true;
    if (key && buzz && r.kind !== 'scroll') haptic(p.pid, 0.2);
  }
  function emit(id, value, info) {
    if (autoState && ['toggle', 'slider', 'segment', 'tab'].includes(info.kind)) state[id] = value;
    for (const cb of actionCbs) { try { cb(id, value, { panel: api, ...info }); } catch (e) { console.error(`[panel ${name}] onAction handler failed`, e); } }
    dirty = true;
  }
  function liveRegion(p) { return (p.downKey != null && byKey.get(p.downKey)) || p.down; }
  function overDown(p) {
    const r = liveRegion(p);
    if (!r) return false;
    const at = regionAt(p.x, p.y);
    if (at && at.key === p.downKey) return true;
    const t = M.drift;
    return p.x >= r.x - t && p.x < r.x + r.w + t && p.y >= r.y - t && p.y < r.y + r.h + t;
  }
  function relXY(r, p) {
    return { x: Math.min(1, Math.max(0, (p.x - r.x) / r.w)), y: Math.min(1, Math.max(0, (p.y - r.y) / r.h)) };
  }
  function sliderValueAt(r, p) {
    let t = (p.x + p.grab - r.trackX) / r.trackW;
    t = Math.min(1, Math.max(0, t));
    let v = r.min + t * (r.max - r.min);
    if (r.step) {
      v = r.min + Math.round((v - r.min) / r.step) * r.step;
      v = parseFloat(v.toFixed(decimalsOf(r.step)));
    }
    return Math.min(Math.max(v, Math.min(r.min, r.max)), Math.max(r.min, r.max));
  }
  function dragSlider(p, first) {
    const r = liveRegion(p);
    const v = sliderValueAt(r, p);
    const prev = first ? r.value : p.sliderValue;
    p.sliderValue = v;
    if (v !== prev) {
      emit(r.id, v, { kind: 'slider', pid: p.pid, final: false });
      if (!first && r.step && Math.abs(r.max - r.min) / r.step <= 60) haptic(p.pid, 0.1);
    }
    dirty = true;
  }
  function setScroll(id, offset) {
    const st = scrolls.get(id);
    if (!st) return;
    const o = Math.max(0, Math.min(offset, Math.max(0, st.contentH - st.viewH)));
    if (o !== st.offset) { st.offset = o; dirty = true; }
  }

  function pointerMove(pid, uv) {
    const p = getPointer(pid);
    if (!uv) {
      if (p.inside) { p.inside = false; dirty = true; }
      setHover(p, null);
      if (p.mode === 'press' && p.over) { p.over = false; dirty = true; }
      return;
    }
    ({ x: p.x, y: p.y } = toPx(uv));
    p.inside = true;
    switch (p.mode) {
      case 'slider': dragSlider(p, false); return;
      case 'drag': {
        const r = liveRegion(p);
        emit(r.id, relXY(r, p), { kind: 'custom', pid, final: false });
        return;
      }
      case 'scroll':
        setScroll(p.scrollId, p.scrollStart - (p.y - p.scrollStartY));
        return;
      case 'press': {
        if (p.down.scrollId != null && Math.abs(p.y - p.downY) > M.scrollSlop) {
          // A vertical drag that began on a button inside a scroll area scrolls instead.
          p.mode = 'scroll'; p.scrollId = p.down.scrollId; p.scrollStartY = p.y;
          p.scrollStart = scrolls.get(p.scrollId)?.offset ?? 0;
          p.down = null; p.downKey = null; p.over = false;
          setHover(p, null, false);
          dirty = true;
          return;
        }
        const o = overDown(p);
        if (o !== p.over) { p.over = o; dirty = true; }
        setHover(p, interactiveAt(p.x, p.y), false);
        return;
      }
      default:
        setHover(p, interactiveAt(p.x, p.y), p.mode == null);
    }
  }

  function pointerDown(pid, uv) {
    if (!uv) return;
    const p = getPointer(pid);
    ({ x: p.x, y: p.y } = toPx(uv));
    p.inside = true;
    if (p.mode) return;
    p.downX = p.x; p.downY = p.y;
    const r = interactiveAt(p.x, p.y);
    if (r) {
      p.down = r; p.downKey = r.key; p.over = true;
      setHover(p, r, false);
      haptic(pid, 0.6);
      if (r.kind === 'slider') {
        p.mode = 'slider';
        const f = r.max > r.min ? (r.value - r.min) / (r.max - r.min) : 0;
        const thumbX = r.trackX + Math.min(1, Math.max(0, f)) * r.trackW;
        p.grab = Math.abs(p.x - thumbX) <= M.thumbR * 1.4 ? thumbX - p.x : 0; // grab the thumb without a jump
        p.sliderValue = r.value;
        dragSlider(p, true);
      } else if (r.kind === 'custom' && r.drag) {
        p.mode = 'drag';
        emit(r.id, relXY(r, p), { kind: 'custom', pid, final: false });
      } else p.mode = 'press';
    } else {
      const sr = scrollAt(p.x, p.y);
      if (sr) { p.mode = 'scroll'; p.scrollId = sr.id; p.scrollStartY = p.y; p.scrollStart = scrolls.get(sr.id)?.offset ?? 0; }
      else p.mode = 'idle';
    }
    dirty = true;
  }

  function pointerUp(pid, uv) {
    const p = pointers.get(pid);
    if (!p || !p.mode) return;
    if (uv) { ({ x: p.x, y: p.y } = toPx(uv)); p.inside = true; }
    const r = liveRegion(p);
    switch (p.mode) {
      case 'press':
        if (p.inside && r && overDown(p)) {
          const info = { kind: r.kind, pid, final: true };
          if (r.kind === 'toggle') emit(r.id, !r.value, info);
          else if (r.kind === 'custom') emit(r.id, r.value !== undefined ? r.value : relXY(r, p), info);
          else emit(r.id, r.value, info);
        }
        break;
      case 'slider':
        if (r) emit(r.id, p.sliderValue, { kind: 'slider', pid, final: true });
        break;
      case 'drag':
        if (r) emit(r.id, relXY(r, p), { kind: 'custom', pid, final: true });
        break;
      default: break;
    }
    p.mode = null; p.down = null; p.downKey = null; p.over = false; p.sliderValue = null; p.scrollId = null; p.grab = 0;
    if (p.inside) setHover(p, interactiveAt(p.x, p.y), false);
    dirty = true;
  }

  /** Forget a pointer's press without firing anything (e.g. tracking lost). */
  function pointerCancel(pid) {
    const p = pointers.get(pid);
    if (!p) return;
    pointers.delete(pid);
    dirty = true;
  }

  /** Scroll the scroll area under uv by dy canvas px (positive = content moves up). Returns true if consumed. */
  function scroll(pid, uv, dy) {
    if (!uv) return false;
    const { x, y } = toPx(uv);
    const sr = scrollAt(x, y);
    if (!sr) return false;
    const st = scrolls.get(sr.id);
    const before = st.offset;
    setScroll(sr.id, st.offset + dy);
    return st.offset !== before || st.contentH > st.viewH;
  }

  // ------------------------------------------------------------ 3D geometry helpers

  const _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _o = new THREE.Vector3();

  /**
   * Finger-tip (world point) → { uv, depth, inside }. depth: signed meters from the
   * plane along its front normal (+ in front). null if outside the rectangle + margin.
   * Uses mesh.matrixWorld as last updated (call mesh.updateMatrixWorld() first if you moved it this frame).
   */
  function localPoke(worldPoint, margin = 0.015) {
    _inv.copy(mesh.matrixWorld).invert();
    _p.copy(worldPoint).applyMatrix4(_inv);
    const u = _p.x / widthM + 0.5, v = _p.y / heightM + 0.5;
    const mu = margin / widthM, mv = margin / heightM;
    if (u < -mu || u > 1 + mu || v < -mv || v > 1 + mv) return null;
    _n.setFromMatrixColumn(mesh.matrixWorld, 2).normalize();
    _o.setFromMatrixPosition(mesh.matrixWorld);
    const depth = _p.copy(worldPoint).sub(_o).dot(_n);
    return { uv: new THREE.Vector2(u, v), depth, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  }

  /** UV of a THREE.Raycaster hit on this panel's mesh. */
  function uvFromIntersection(hit) {
    if (!hit) return null;
    if (hit.uv) return hit.uv.clone();
    _inv.copy(mesh.matrixWorld).invert();
    _p.copy(hit.point).applyMatrix4(_inv);
    return new THREE.Vector2(_p.x / widthM + 0.5, _p.y / heightM + 0.5);
  }

  /** Is an enabled control (or a scroll area) under uv? */
  function hasInteractive(uv) {
    if (!uv) return false;
    const { x, y } = toPx(uv);
    const r = regionAt(x, y);
    return !!r && (!r.disabled || !!scrollAt(x, y));
  }

  /** What is under uv: { id, kind, disabled, value } or null. */
  function hitInfo(uv) {
    if (!uv) return null;
    const { x, y } = toPx(uv);
    const r = regionAt(x, y);
    return r ? { id: r.id, kind: r.kind, disabled: r.disabled, value: r.value } : null;
  }

  // ------------------------------------------------------------ public object

  const api = {
    name, mesh, canvas, ctx, texture, material, geometry,
    widthM, heightM, pxPerM, W, H, s, metrics: M,
    get state() { return state; },
    get theme() { return themeObj; },
    get themeName() { return themeObj.name; },
    get build() { return buildFn; },
    get lastBuildMs() { return lastBuildMs; },
    /** Height the last build used (px); compare with H to detect overflow. */
    get contentHeight() { return contentHeight; },
    get dirty() { return dirty; },
    setBuild(fn) { buildFn = fn; dirty = true; },
    invalidate() { dirty = true; },
    /** Redraw if needed. Call every frame; cheap when nothing changed. Returns true if redrawn. */
    update() { if (!dirty) return false; redraw(); return true; },
    setTheme(t) { themeObj = typeof t === 'string' ? (THEMES[t] || THEMES.light) : t; dirty = true; },
    setState(obj) { Object.assign(state, obj); dirty = true; },
    /** cb(id, value, info) for clicks, toggles, slider moves. Returns an unsubscribe function. */
    onAction(cb) { actionCbs.add(cb); return () => actionCbs.delete(cb); },
    /** cb(pid, strength 0..1) when a pointer enters or presses a control. */
    onHaptic(cb) { hapticCbs.add(cb); return () => hapticCbs.delete(cb); },
    pointerMove, pointerDown, pointerUp, pointerCancel, scroll,
    localPoke, uvFromIntersection, hasInteractive, hitInfo,
    /** Is this pointer currently pressing/dragging something on the panel? */
    isCaptured(pid) { const p = pointers.get(pid); return !!(p && p.mode && p.mode !== 'idle'); },
    getScroll(id) { return scrolls.get(id)?.offset ?? 0; },
    setScroll(id, offset) { if (!scrolls.has(id)) scrolls.set(id, { offset: 0, contentH: Infinity, viewH: 0 }); setScroll(id, offset); },
    /** Uv → canvas px. */
    uvToPx(uv) { return toPx(uv); },
    dispose() {
      livePanels.delete(api);
      texture.dispose(); material.dispose(); geometry.dispose();
      mesh.removeFromParent();
    },
  };
  mesh.userData.panel = api;
  livePanels.add(api);
  return api;
}
