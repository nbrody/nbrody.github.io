// Shared helpers for the residual-finiteness walkthrough figures.

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function palette() {
  return {
    bg: cssVar('--cv-bg'), ink: cssVar('--cv-ink'), grid: cssVar('--cv-grid'),
    a: cssVar('--cv-a'), b: cssVar('--cv-b'), line: cssVar('--cv-line'),
    muted: cssVar('--muted'), rule: cssVar('--rule'), panel: cssVar('--panel'), panel2: cssVar('--panel-2'),
    accent: cssVar('--accent'), accent2: cssVar('--accent-2'), accent3: cssVar('--accent-3'), accent4: cssVar('--accent-4'),
    dark: document.documentElement.dataset.theme === 'dark' ||
      (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches),
  };
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
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined) e.append(kid);
  return e;
}

// A responsive canvas: width follows the container, height = width * aspect (aspect may be a function of width).
// draw(ctx, w, h) is called with CSS-pixel coordinates.
export function makeCanvas(parent, { aspect = 1, maxHeight = Infinity, minHeight = 0, bordered = false, draw }) {
  const wrap = el('div', { class: 'cv-wrap' + (bordered ? ' bordered' : '') });
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
  state.redraw = () => { if (state.w) { state.ctx.save(); state.draw(state.ctx, state.w, state.h); state.ctx.restore(); } };
  state.resize = resize;
  new ResizeObserver(resize).observe(wrap);
  requestAnimationFrame(resize);
  return state;
}

export function slider(parent, { label, min, max, step, value, fmt = (v) => v, oninput }) {
  const input = el('input', { type: 'range', min, max, step, value });
  const val = el('span', { class: 'val' }, fmt(+value));
  const lab = el('label', { class: 'ctl' }, label, input, val);
  input.addEventListener('input', () => { val.textContent = fmt(+input.value); oninput && oninput(+input.value); });
  parent.append(lab);
  return {
    input, label: lab,
    get value() { return +input.value; },
    set(v, fire = false) { input.value = v; val.textContent = fmt(+input.value); if (fire && oninput) oninput(+input.value); },
  };
}

export function button(parent, text, onclick, cls = '') {
  const b = el('button', { type: 'button', class: cls }, text);
  b.addEventListener('click', onclick);
  parent.append(b);
  return b;
}

export function segmented(parent, options, value, onchange) {
  const seg = el('div', { class: 'seg', role: 'group' });
  const btns = options.map(([key, text]) => {
    const b = el('button', { type: 'button' }, text);
    b.addEventListener('click', () => { set(key); onchange(key); });
    seg.append(b);
    return [key, b];
  });
  function set(key) { for (const [k, b] of btns) b.classList.toggle('on', k === key); }
  set(value);
  parent.append(seg);
  return { set };
}

export function controls(parent) {
  const c = el('div', { class: 'controls' });
  parent.append(c);
  return c;
}

// Pointer drag helper on a canvas wrap. handlers: down(x,y,e) -> truthy to capture, move(x,y,e), up(x,y,e), hover(x,y)
export function pointer(target, handlers) {
  let active = false;
  const pos = (e) => {
    const r = target.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  target.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e);
    if (handlers.down && handlers.down(x, y, e) !== false) {
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
}

export const fmt = {
  f(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; },
  g(v, d = 3) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(d - 1);
    return v.toPrecision(d);
  },
};

// Simple color helpers
export function hexToRgb(c) {
  c = c.trim();
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2]];
  }
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

// Perceptual-ish sequential ramp between two theme colors via a midpoint.
export function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  return mix(stops[i], stops[i + 1], t * n - i);
}

// Binary min-heap keyed by Float64 priorities over integer ids.
export class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(key, val) {
    let i = this.n++;
    if (i >= this.k.length) {
      const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    const k = this.k, v = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() { // returns val; key in this.lastKey
    const k = this.k, v = this.v;
    const topV = v[0]; this.lastKey = k[0];
    const n = --this.n;
    if (n > 0) {
      const key = k[n], val = v[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = key; v[i] = val;
    }
    return topV;
  }
}
