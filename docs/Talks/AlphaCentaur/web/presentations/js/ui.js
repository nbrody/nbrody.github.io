// Small DOM toolkit: element builder, icons, menus, modals, toasts and the
// form controls the inspector is made of.

import { COLOR_TOKENS, COLOR_LABELS } from './themes.js';

export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Lucide-style 24×24 stroke icons.
const P = {
  text: '<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>',
  sigma: '<path d="M18 6.5V4H6l6 8-6 8h12v-2.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17.5 5-5 4 4 2.5-2.5 4.5 4.5"/>',
  shapes: '<rect x="3.5" y="11" width="9" height="9" rx="1.5"/><circle cx="16.5" cy="8" r="4.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.8 2.6 14.2 0 17M12 3.5c-2.6 2.8-2.6 14.2 0 17"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9 7V4.5h6V7"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9a4.4 4.4 0 0 0 4.4-4.4c0-4.2-3.8-7-8.5-7z"/><circle cx="7.5" cy="11.5" r="1.1"/><circle cx="10" cy="7.5" r="1.1"/><circle cx="14.5" cy="7.5" r="1.1"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3.5 2"/>',
  folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17.5z"/>',
  home: '<path d="m4 11 8-7 8 7v8.5a1 1 0 0 1-1 1h-4.5V15h-5v5.5H5a1 1 0 0 1-1-1z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
  front: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 15.5V5a1 1 0 0 1 1-1h10.5"/>',
  back: '<rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M20 8.5V19a1 1 0 0 1-1 1H8.5"/>',
  alignL: '<path d="M4 3.5v17M8 7h11v4H8zM8 13h7v4H8z"/>',
  alignC: '<path d="M12 3.5v17M5.5 7h13v4h-13zM8 13h8v4H8z"/>',
  alignR: '<path d="M20 3.5v17M5 7h11v4H5zM9 13h7v4H9z"/>',
  alignT: '<path d="M3.5 4h17M7 8h4v11H7zM13 8h4v7h-4z"/>',
  alignM: '<path d="M3.5 12h17M7 5.5h4v13H7zM13 8h4v8h-4z"/>',
  alignB: '<path d="M3.5 20h17M7 5h4v11H7zM13 9h4v7h-4z"/>',
  distH: '<path d="M4 3.5v17M20 3.5v17M9.5 8h5v8h-5z"/>',
  distV: '<path d="M3.5 4h17M3.5 20h17M8 9.5h8v5H8z"/>',
  bold: '<path d="M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7zM7 12h7a3.75 3.75 0 0 1 0 7.5H7z"/>',
  italic: '<path d="M14 4.5h5M5 19.5h5M15.5 4.5l-7 15"/>',
  underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20.5h14"/>',
  strike: '<path d="M4 12h16M16.5 7.5c-.6-1.8-2.4-3-4.5-3-2.6 0-4.5 1.5-4.5 3.4 0 4.1 9.3 3.1 9.3 7.6 0 2.1-2 3.5-4.8 3.5-2.4 0-4.3-1.2-4.9-3"/>',
  sup: '<path d="m4 8 8 11M12 8l-8 11M15 6.5a2 2 0 1 1 3.4 1.4L15 11h4.5"/>',
  sub: '<path d="m4 5 8 11M12 5 4 16M15 15.5a2 2 0 1 1 3.4 1.4L15 20h4.5"/>',
  ul: '<path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20"/><circle cx="5" cy="6.5" r="1.1"/><circle cx="5" cy="12" r="1.1"/><circle cx="5" cy="17.5" r="1.1"/>',
  ol: '<path d="M10 6.5h10M10 12h10M10 17.5h10M4.5 5l1.3-.8v4.3M4.2 13.5c0-1.6 2.6-1.6 2.6-.2 0 1-2.6 1.6-2.6 2.9h2.8"/>',
  tAlignL: '<path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h10"/>',
  tAlignC: '<path d="M4 6h16M7 10.5h10M4 15h16M7 19.5h10"/>',
  tAlignR: '<path d="M4 6h16M10 10.5h10M4 15h16M10 19.5h10"/>',
  tAlignJ: '<path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h16"/>',
  vTop: '<path d="M4 4h16M12 20V8M8 12l4-4 4 4"/>',
  vMid: '<path d="M4 12h16M12 3v5M9.5 5.5 12 8l2.5-2.5M12 21v-5M9.5 18.5 12 16l2.5 2.5"/>',
  vBot: '<path d="M4 20h16M12 4v12M8 12l4 4 4-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  eraser: '<path d="m7 20-3.3-3.3a1.5 1.5 0 0 1 0-2.1l9.9-9.9a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L13 19.5M7 20h13M9 11l6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  reload: '<path d="M20 11.5A8 8 0 1 1 17.7 6M20 4.5v5h-5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5h-.8A5.5 5.5 0 0 1 5 17.6l-1.6-3a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  layout: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M9 9v10.5"/>',
  window: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 8.5h17M14 13.5h3.5V17"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  save: '<path d="M5 4h11l3.5 3.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M7.5 20v-6h9v6"/>',
  section: '<path d="M4 6h16M4 12h10M4 18h7"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M6.3 7.2A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
};
export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', name === 'play' ? 'currentColor' : 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}

export function button(label, iconName, onclick, opts = {}) {
  return h('button.btn' + (opts.cls ? '.' + opts.cls : ''), { type: 'button', title: opts.title || (iconName && !opts.showLabel ? label : null), 'aria-label': label, onclick, disabled: opts.disabled },
    iconName ? icon(iconName, opts.size || 18) : null, (opts.showLabel ?? !iconName) ? h('span', null, label) : null);
}

// ------------------------------------------------------------ popovers --
let openPop = null;
export function closePopover() {
  if (openPop) { openPop.el.remove(); openPop.anchor?.classList.remove('open'); openPop.onclose?.(); openPop = null; }
}
export function popover(anchor, content, { align = 'start', onclose, cls = '' } = {}) {
  closePopover();
  const el = h('div.popover' + (cls ? '.' + cls : ''), { role: 'dialog' }, content);
  document.body.append(el);
  const r = anchor.getBoundingClientRect(), pr = el.getBoundingClientRect();
  let left = align === 'end' ? r.right - pr.width : r.left;
  left = Math.max(8, Math.min(innerWidth - pr.width - 8, left));
  let top = r.bottom + 6;
  if (top + pr.height > innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
  el.style.left = left + 'px'; el.style.top = top + 'px';
  anchor.classList.add('open');
  openPop = { el, anchor, onclose };
  return el;
}
export function popoverAt(x, y, content) {
  closePopover();
  const el = h('div.popover', { role: 'menu' }, content);
  document.body.append(el);
  const pr = el.getBoundingClientRect();
  el.style.left = Math.min(x, innerWidth - pr.width - 8) + 'px';
  el.style.top = Math.min(y, innerHeight - pr.height - 8) + 'px';
  openPop = { el };
  return el;
}
document.addEventListener('pointerdown', e => {
  if (openPop && !openPop.el.contains(e.target) && !openPop.anchor?.contains(e.target)) closePopover();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPop) { closePopover(); e.stopPropagation(); } }, true);

// items: [{label, icon, kbd, action, disabled, danger} | '-' | {heading}]
export function menu(items) {
  return h('div.menu', null, items.map(it => {
    if (it === '-') return h('div.menu-sep');
    if (it.heading) return h('div.menu-heading', null, it.heading);
    return h('button.menu-item' + (it.danger ? '.danger' : ''), {
      type: 'button', disabled: it.disabled, onclick: () => { closePopover(); it.action(); },
    }, it.icon ? icon(it.icon, 16) : h('span.menu-icon-gap'), h('span.menu-label', null, it.label), it.kbd ? h('kbd', null, it.kbd) : null);
  }));
}
export function menuButton(label, iconName, items, opts = {}) {
  const b = h('button.btn.menu-btn' + (opts.cls ? '.' + opts.cls : ''), { type: 'button', title: opts.title || label, 'aria-haspopup': 'menu' },
    iconName ? icon(iconName, 18) : null, opts.showLabel === false ? null : h('span', null, label), icon('chevron', 14));
  b.addEventListener('click', () => {
    if (b.classList.contains('open')) return closePopover();
    popover(b, menu(typeof items === 'function' ? items() : items), { align: opts.align });
  });
  return b;
}

// ---------------------------------------------------------------- modal --
export function modal(title, body, { actions = [], wide = false, onclose } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', onkey, true); onclose?.(); };
  const onkey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  const back = h('div.modal-back', { onpointerdown: e => { if (e.target === back) close(); } },
    h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header.modal-head', null, h('h2', null, title), button('Close', 'x', close, { cls: 'ghost' })),
      h('div.modal-body', null, body),
      actions.length ? h('footer.modal-foot', null, actions.map(a => h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), {
        type: 'button', onclick: () => { if (a.action?.() !== false) close(); },
      }, a.label))) : null));
  document.body.append(back);
  document.addEventListener('keydown', onkey, true);
  setTimeout(() => back.querySelector('[autofocus], input, textarea')?.focus(), 30);
  return { close, el: back };
}
export function confirmDialog(title, message, label = 'Delete') {
  return new Promise(res => {
    let ok = false;
    modal(title, h('p.modal-text', null, message), {
      actions: [{ label: 'Cancel' }, { label, danger: true, action: () => { ok = true; } }],
      onclose: () => res(ok),
    });
  });
}

let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = kind; }, kind === 'error' ? 5200 : 2400);
}

// -------------------------------------------------------------- controls --
export function field(label, control, opts = {}) {
  return h('label.field' + (opts.cls ? '.' + opts.cls : ''), null, h('span.field-label', null, label), control);
}

// Number input: live updates while typing/stepping, commit on change.
export function numberInput(value, { min, max, step = 1, suffix, onInput, onCommit, width } = {}) {
  const inp = h('input.num', { type: 'number', value: fmt(value), min, max, step, style: width ? { width } : null });
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onInput?.(clamp(v, min, max)); });
  inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v)) { inp.value = fmt(clamp(v, min, max)); onCommit?.(clamp(v, min, max)); } });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  const wrap = h('span.num-wrap', null, inp, suffix ? h('span.num-suffix', null, suffix) : null);
  wrap.set = v => { if (document.activeElement !== inp) inp.value = fmt(v); };
  return wrap;
}
const fmt = v => (Math.round(v * 100) / 100).toString();
const clamp = (v, a, b) => Math.min(b ?? Infinity, Math.max(a ?? -Infinity, v));

export function slider(value, { min = 0, max = 1, step = 0.01, onInput, onCommit, format = v => v } = {}) {
  const out = h('span.slider-val', null, format(value));
  const inp = h('input.slider', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => { out.textContent = format(+inp.value); onInput?.(+inp.value); });
  inp.addEventListener('change', () => onCommit?.(+inp.value));
  return h('span.slider-wrap', null, inp, out);
}

export function segmented(options, value, onChange, { icons = false } = {}) {
  const wrap = h('div.seg', { role: 'radiogroup' });
  for (const [v, label, ic] of options) {
    const b = h('button.seg-btn' + (v === value ? '.on' : ''), { type: 'button', title: label, 'aria-label': label, role: 'radio', 'aria-checked': String(v === value) },
      ic ? icon(ic, 16) : label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.seg-btn').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
      onChange(v);
    });
    wrap.append(b);
  }
  return wrap;
}

export function select(options, value, onChange, opts = {}) {
  const s = h('select.select', { 'aria-label': opts.label || null });
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const [v, l] of o.options) g.append(h('option', { value: v, selected: v === value }, l));
      s.append(g);
    } else {
      const [v, l] = o;
      s.append(h('option', { value: v, selected: v === value }, l));
    }
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function toggle(label, value, onChange) {
  const inp = h('input', { type: 'checkbox', checked: !!value });
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label.toggle', null, inp, h('span.toggle-track', null, h('span.toggle-thumb')), h('span', null, label));
}

// Color control: theme swatches (stored as tokens) + custom color.
export function colorControl(value, theme, onChange, { allowNone = false, onInput } = {}) {
  const wrap = h('div.color-ctl');
  const isToken = COLOR_TOKENS.includes(value);
  const hexOf = v => (COLOR_TOKENS.includes(v) ? theme.colors[v] : v) || '#000000';
  const custom = h('input.color-input', { type: 'color', value: toHex6(hexOf(value)), title: 'Custom color' });
  const hex = h('input.hex-input', { type: 'text', value: value && value !== 'none' && !isToken ? value : '', placeholder: isToken ? COLOR_LABELS[value] : (value === 'none' ? 'None' : '#hex'), spellcheck: false, 'aria-label': 'Color value' });
  const sw = h('div.swatches');
  const mark = v => {
    sw.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.dataset.v === v));
    hex.placeholder = COLOR_TOKENS.includes(v) ? COLOR_LABELS[v] : v === 'none' ? 'None' : '#hex';
    if (COLOR_TOKENS.includes(v) || v === 'none') hex.value = '';
  };
  if (allowNone) sw.append(h('button.swatch.none', { type: 'button', title: 'None', 'data-v': 'none', onclick: () => { mark('none'); onChange('none'); } }));
  for (const t of COLOR_TOKENS) {
    sw.append(h('button.swatch', { type: 'button', title: COLOR_LABELS[t] + ' (theme)', 'data-v': t, style: { background: theme.colors[t] }, onclick: () => { custom.value = toHex6(theme.colors[t]); mark(t); onChange(t); } }));
  }
  custom.addEventListener('input', () => { hex.value = custom.value; mark(custom.value); (onInput || onChange)(custom.value); });
  custom.addEventListener('change', () => onChange(custom.value));
  hex.addEventListener('change', () => {
    const v = hex.value.trim();
    if (!v) return;
    const ok = CSS.supports('color', v);
    hex.classList.toggle('bad', !ok);
    if (ok) { mark(v); if (/^#[0-9a-f]{6}$/i.test(v)) custom.value = v; onChange(v); }
  });
  wrap.append(sw, h('div.color-custom', null, custom, hex));
  mark(value || 'none');
  return wrap;
}
export function toHex6(c) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map(x => x + x).join('');
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillStyle = c;
  return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : '#000000';
}

export function section(title, ...children) {
  return h('section.insp-section', null, title ? h('h3.insp-title', null, title) : null, ...children);
}
export function row(...children) { return h('div.insp-row', null, ...children); }

export function kbd(s) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return mac ? s.replace(/Mod\+?/g, '⌘').replace(/Shift\+?/g, '⇧').replace(/Alt\+?/g, '⌥') : s.replace(/Mod/g, 'Ctrl');
}
