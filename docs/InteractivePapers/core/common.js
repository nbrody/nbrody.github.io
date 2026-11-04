// Shared helpers for interactive-paper figures: theme colours, DOM, MathJax, canvases, controls.
// A paper's own js/common.js re-exports this file and adds its colour roles to palette().
import { linkRefs } from './refs.js';
// Math anywhere in a figure — readouts, canvas labels, control labels — goes through MathJax:
// use setTex(node, html) for HTML with $…$, and labelLayer(wrap) for labels over a canvas.

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Theme colours, read at draw time. A paper names its own colour roles as --c-<role> in its
 *  style.css and reads them with role('<role>'), or adds them to palette() in its js/common.js. */
export function palette() {
  const v = cssVar;
  return {
    bg: v('--bg'), surface: v('--surface'), text: v('--text'), muted: v('--muted'), border: v('--border'),
    grid: v('--cv-grid'), ink: v('--cv-ink'),
    accent: v('--accent'), accentInk: v('--accent-ink'), accent2: v('--accent-2'), accent3: v('--accent-3'),
    neutral: v('--neutral'), supp: v('--supp'),
    good: v('--good'), bad: v('--bad'),
    dark: isDark(),
  };
}

/** A paper colour role: --c-<name> from the paper's style.css. */
export function role(name) {
  return cssVar('--c-' + name);
}

export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}

export function onTheme(fn) {
  window.addEventListener('ip-theme', fn);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
}

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined) e.append(kid);
  return e;
}

// ───────────────────────── MathJax ─────────────────────────

let mjReady = null;
export function mathJaxReady() {
  if (!mjReady) {
    mjReady = new Promise((resolve) => {
      const check = () => {
        const MJ = window.MathJax;
        if (MJ && MJ.startup && MJ.startup.promise && MJ.typesetPromise) MJ.startup.promise.then(resolve);
        else setTimeout(check, 40);
      };
      check();
    });
  }
  return mjReady;
}

let mjQueue = Promise.resolve();
/** Typeset nodes (serialized, so concurrent calls don't collide). */
export function typeset(nodes) {
  nodes = [].concat(nodes).filter(Boolean);
  mjQueue = mjQueue.then(() => mathJaxReady()).then(() => {
    window.MathJax.typesetClear(nodes);
    return window.MathJax.typesetPromise(nodes);
  }).catch((e) => console.warn('MathJax:', e));
  return mjQueue;
}

/** Set HTML containing $…$ math, typeset it, and link numbered references in it. Skips work when unchanged. */
export function setTex(node, html) {
  if (node._texSrc === html) return mjQueue;
  node._texSrc = html;
  node.innerHTML = html;
  return typeset(node).then(() => { if (node._texSrc === html) linkRefs(node); });
}

/**
 * HTML labels over a canvas wrap, typeset with MathJax.
 * layer.set([{ id, x, y, tex | html, anchor: 'c'|'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw', cls }])
 * x, y in CSS pixels of the canvas. Labels are hidden until typeset, then reused.
 */
export function labelLayer(wrap) {
  const layer = el('div', { class: 'cv-labels', 'aria-hidden': 'true' });
  wrap.append(layer);
  const live = new Map();
  const shift = {
    c: '-50%,-50%', n: '-50%,-100%', s: '-50%,0', e: '0,-50%', w: '-100%,-50%',
    ne: '0,-100%', nw: '-100%,-100%', se: '0,0', sw: '-100%,0',
  };
  return {
    layer,
    set(list) {
      const seen = new Set();
      for (const L of list) {
        seen.add(L.id);
        let rec = live.get(L.id);
        if (!rec) {
          rec = { node: el('div', { class: 'cv-label' }), src: null };
          layer.append(rec.node);
          live.set(L.id, rec);
        }
        const src = L.tex !== undefined ? `$${L.tex}$` : L.html;
        if (rec.src !== src) {
          rec.src = src;
          if (L.tex !== undefined) {
            rec.node.style.visibility = 'hidden';
            setTex(rec.node, src).then(() => { if (rec.src === src) rec.node.style.visibility = ''; });
          } else {
            rec.node._texSrc = null;
            rec.node.innerHTML = src;
            rec.node.style.visibility = '';
          }
        }
        rec.node.className = 'cv-label' + (L.cls ? ' ' + L.cls : '');
        rec.node.style.transform = `translate(${L.x}px, ${L.y}px) translate(${shift[L.anchor || 'c']})`;
        if (L.color) rec.node.style.color = L.color; else rec.node.style.removeProperty('color');
      }
      for (const [id, rec] of live) if (!seen.has(id)) { rec.node.remove(); live.delete(id); }
    },
    clear() { this.set([]); },
  };
}

// ───────────────────────── canvas and controls ─────────────────────────

/**
 * A responsive canvas: width follows the container, height = width·aspect (clamped).
 * aspect may be a function of the width. draw(ctx, w, h) works in CSS pixels.
 */
export function makeCanvas(parent, { aspect = 1, maxHeight = Infinity, minHeight = 0, draw }) {
  const wrap = el('div', { class: 'cv-wrap' });
  const canvas = el('canvas');
  wrap.append(canvas);
  parent.append(wrap);
  const state = { canvas, wrap, w: 0, h: 0, ctx: canvas.getContext('2d'), draw };
  const resize = () => {
    const w = Math.max(10, wrap.clientWidth);
    const a = typeof aspect === 'function' ? aspect(w) : aspect;
    const h = Math.max(minHeight, Math.min(maxHeight, Math.round(w * a)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === state.w && h === state.h && canvas.width === Math.round(w * dpr)) return;
    state.w = w; state.h = h;
    wrap.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.redraw();
  };
  state.redraw = () => {
    if (!state.w) return;
    state.ctx.save();
    state.ctx.clearRect(0, 0, state.w, state.h);
    state.draw(state.ctx, state.w, state.h);
    state.ctx.restore();
  };
  state.resize = resize;
  new ResizeObserver(resize).observe(wrap);
  requestAnimationFrame(resize);
  return state;
}

/** A labelled range slider. `label` may contain $…$ math. */
export function slider(parent, { label, min, max, step = 1, value, fmt = (v) => v, oninput }) {
  const input = el('input', { type: 'range', min, max, step, value });
  const name = el('span', { class: 'ctl-name' });
  const val = el('span', { class: 'val' });
  const lab = el('label', { class: 'ctl' }, name, input, val);
  setTex(name, label);
  const show = () => setTex(val, String(fmt(+input.value)));
  show();
  input.addEventListener('input', () => { show(); oninput && oninput(+input.value); });
  parent.append(lab);
  return {
    input, label: lab,
    get value() { return +input.value; },
    set(v, fire = false) { input.value = v; show(); if (fire && oninput) oninput(+input.value); },
    setRange(lo, hi) { input.min = lo; input.max = hi; show(); },
  };
}

/** A button. `text` may contain $…$ math. cls: '' (filled) or 'ghost'. */
export function button(parent, text, onclick, cls = '') {
  const b = el('button', { type: 'button', class: 'btn' + (cls ? ' ' + cls : '') });
  setTex(b, text);
  b.addEventListener('click', onclick);
  parent.append(b);
  return b;
}

/** Segmented control. options: [[key, html-with-math], …]. */
export function segmented(parent, options, value, onchange) {
  const seg = el('div', { class: 'seg', role: 'group' });
  const btns = options.map(([key, text]) => {
    const b = el('button', { type: 'button' });
    setTex(b, text);
    b.addEventListener('click', () => { set(key); onchange(key); });
    seg.append(b);
    return [key, b];
  });
  function set(key) { for (const [k, b] of btns) { b.classList.toggle('on', k === key); b.setAttribute('aria-pressed', k === key); } }
  set(value);
  parent.append(seg);
  return { set, el: seg };
}

/**
 * A row of choice chips (like a select, but every option visible and typeset).
 * options: [[key, html-with-math, extraClass?], …]
 */
export function chips(parent, { label, options, value, onchange }) {
  const wrap = el('div', { class: 'chips' });
  if (label) { const n = el('span', { class: 'ctl-name' }); setTex(n, label); wrap.append(n); }
  const row = el('div', { class: 'chip-row' });
  wrap.append(row);
  let btns = [];
  function build(opts) {
    row.innerHTML = '';
    btns = opts.map(([key, text, cls]) => {
      const b = el('button', { type: 'button', class: 'chip' + (cls ? ' ' + cls : '') });
      setTex(b, text);
      b.addEventListener('click', () => { set(key); onchange(key); });
      row.append(b);
      return [key, b];
    });
  }
  function set(key) { for (const [k, b] of btns) { b.classList.toggle('on', k === key); b.setAttribute('aria-pressed', k === key); } }
  build(options);
  set(value);
  parent.append(wrap);
  return { set, rebuild(opts, v) { build(opts); set(v); }, el: wrap };
}

export function controls(parent) {
  const c = el('div', { class: 'controls' });
  parent.append(c);
  return c;
}

/** Pointer drag helper. handlers: down(x,y,e) → truthy to capture, move, up, hover, leave. */
export function pointer(target, handlers) {
  let active = false;
  const pos = (e) => {
    const r = target.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  target.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e);
    if (handlers.down && handlers.down(x, y, e)) {
      active = true;
      target.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  target.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (active) handlers.move && handlers.move(x, y, e);
    else handlers.hover && handlers.hover(x, y, e);
  });
  const end = (e) => {
    if (!active) return;
    active = false;
    const [x, y] = pos(e);
    handlers.up && handlers.up(x, y, e);
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('pointerleave', (e) => { if (!active && handlers.leave) handlers.leave(e); });
}

export const fmt = {
  f(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; },
  int(v) { return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—'; },
  g(v, d = 3) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(d - 1);
    return v.toPrecision(d);
  },
  /** A number as TeX, with ×10^k for large/small values. */
  tex(v, d = 3) {
    if (!Number.isFinite(v)) return '\\text{—}';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e6)) {
      const [m, e] = v.toExponential(d - 1).split('e');
      return `${m}\\times 10^{${+e}}`;
    }
    return Number.isInteger(v) ? v.toLocaleString('en-US').replace(/,/g, '{,}') : v.toPrecision(d);
  },
};

export function hexToRgb(c) {
  c = c.trim();
  if (c.startsWith('rgb')) { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2]]; }
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
export function rgba(c, alpha) {
  const a = hexToRgb(c);
  return `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
}

/** Run fn in requestAnimationFrame slices of ~budget ms. fn() returns true when finished. */
export function chunked(fn, budget = 10) {
  return new Promise((resolve) => {
    const step = () => {
      const t = performance.now();
      while (performance.now() - t < budget) if (fn()) { resolve(); return; }
      requestAnimationFrame(step);
    };
    step();
  });
}

/** Nice axis ticks. */
export function ticks(lo, hi, count = 5) {
  const span = hi - lo, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
