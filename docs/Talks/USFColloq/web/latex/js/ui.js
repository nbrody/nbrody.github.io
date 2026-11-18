// Small DOM helpers: element builder, icons, dialogs and toasts.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function replace(el, ...children) { el.replaceChildren(); append(el, children); return el; }

const PATHS = {
  sidebar: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  filePlus: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  play: '<path d="M6 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L7.5 3.64A1 1 0 0 0 6 4.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect width="12" height="12" x="6" y="6" rx="1.5" fill="currentColor" stroke="none"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  move: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  locate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  pointer: '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  width: '<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  box: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  italic: '<path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4 9 20"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  sigma: '<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>',
  displayMath: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3"/><path d="M9 11.2h5.7"/>',
  listOrdered: '<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  omega: '<path d="M3 20h4.5a.5.5 0 0 0 .5-.5v-.28a.52.52 0 0 0-.25-.44 8 8 0 1 1 8.5 0 .52.52 0 0 0-.25.44v.28a.5.5 0 0 0 .5.5H21"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  outline: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  count: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  keyboard: '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
};
export function icon(name, size = 16, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`;
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
  return span;
}

export function button({label, title, iconName, cls = '', onClick, disabled, pressed, size = 15} = {}) {
  return h('button', {type: 'button', class: `btn ${cls}`, title: title || label, 'aria-label': title || label, disabled,
    'aria-pressed': pressed === undefined ? undefined : String(!!pressed), onclick: onClick},
    iconName ? icon(iconName, size) : null, label && !cls.includes('icon-only') ? h('span', {}, label) : null);
}

// ---------------------------------------------------------------- toasts
let toasts;
export function toast(message, {kind = 'info', timeout = kind === 'error' ? 8000 : 4000} = {}) {
  toasts ||= document.body.appendChild(h('div', {class: 'toasts', role: 'status', 'aria-live': 'polite'}));
  const el = h('div', {class: `toast ${kind}`}, icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info', 15), h('span', {}, message),
    h('button', {class: 'toast-x', 'aria-label': 'Dismiss', onclick: () => el.remove()}, icon('x', 13)));
  toasts.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// --------------------------------------------------------------- dialogs
export function dialog({title, body, actions = [], wide = false, onClose}) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', key, true); onClose?.(); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const box = h('div', {class: `dialog ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title},
    h('div', {class: 'dialog-head'}, h('h2', {}, title), h('button', {class: 'btn ghost icon-only', 'aria-label': 'Close', onclick: close}, icon('x', 16))),
    h('div', {class: 'dialog-body'}, body),
    actions.length ? h('div', {class: 'dialog-actions'}, actions.map(a => h('button', {type: a.submit ? 'submit' : 'button', class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`,
      form: a.submit ? a.submit : undefined, onclick: a.submit ? undefined : async () => { if ((await a.run?.()) !== false) close(); }}, a.label))) : null);
  const overlay = h('div', {class: 'overlay', onmousedown: e => { if (e.target === overlay) close(); }}, box);
  document.body.append(overlay);
  document.addEventListener('keydown', key, true);
  setTimeout(() => (box.querySelector('[autofocus]') || box.querySelector('input,select,textarea,button.primary'))?.focus(), 0);
  return {close, box};
}

// A one-field form; resolves to the value, or null when dismissed.
export function prompt({title, label, value = '', hint, submit = 'Save', extra, validate}) {
  return new Promise(resolve => {
    let done = false;
    const id = `f${Math.random().toString(36).slice(2)}`;
    const input = h('input', {value, autofocus: true, spellcheck: 'false', autocomplete: 'off'});
    const error = h('div', {class: 'field-error', role: 'alert'});
    const form = h('form', {id, class: 'form', onsubmit: e => {
      e.preventDefault();
      const v = input.value.trim(), problem = validate?.(v);
      if (problem) { error.textContent = problem; return; }
      done = true; d.close(); resolve(extra ? {value: v, extra: extra.value()} : v);
    }}, h('label', {}, h('span', {}, label), input), hint ? h('p', {class: 'hint'}, hint) : null, extra?.element, error);
    const d = dialog({title, body: form, actions: [{label: 'Cancel'}, {label: submit, primary: true, submit: id}], onClose: () => { if (!done) resolve(null); }});
    setTimeout(() => { input.focus(); const dot = value.lastIndexOf('.'), slash = value.lastIndexOf('/') + 1; input.setSelectionRange(slash, dot > slash ? dot : value.length); }, 0);
  });
}

export function confirmDialog({title, message, confirm = 'Continue', danger = false}) {
  return new Promise(resolve => {
    let answered = false;
    dialog({title, body: h('p', {class: 'dialog-text'}, message), onClose: () => { if (!answered) resolve(false); },
      actions: [{label: 'Cancel'}, {label: confirm, primary: !danger, danger, run: () => { answered = true; resolve(true); }}]});
  });
}

// A dropdown menu under `anchor`. Items: {label, checked?, disabled?, hint?,
// onClick} | {header} | {separator: true}. Returns a close function.
let openMenu = null;
export function menu(anchor, items, {align = 'left', className = ''} = {}) {
  openMenu?.();
  const close = () => { el.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); anchor.setAttribute('aria-expanded', 'false'); openMenu = null; };
  const outside = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = [...el.querySelectorAll('button:not(:disabled)')], i = buttons.indexOf(document.activeElement);
      buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  };
  const el = h('div', {class: `menu ${className}`, role: 'menu'}, items.filter(Boolean).map(item =>
    item.separator ? h('div', {class: 'menu-sep', role: 'separator'}) :
    item.header ? h('div', {class: 'menu-header'}, item.header) :
    item.element ? item.element :
    h('button', {type: 'button', role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': item.checked === undefined ? undefined : String(!!item.checked),
      disabled: item.disabled, onclick: () => { if (!item.keepOpen) close(); item.onClick?.(); }},
      h('span', {class: 'menu-check'}, item.checked ? icon('check', 14) : null), h('span', {class: 'menu-label'}, item.label),
      item.hint ? h('span', {class: 'menu-hint'}, item.hint) : null)));
  document.body.append(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hgt = el.offsetHeight;
  el.style.top = `${Math.min(r.bottom + 4, innerHeight - hgt - 8)}px`;
  el.style.left = `${Math.max(8, Math.min(align === 'right' ? r.right - w : r.left, innerWidth - w - 8))}px`;
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true); }, 0);
  openMenu = close;
  return close;
}

export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const mod = isMac ? '⌘' : 'Ctrl+';
export const timeOf = iso => iso ? new Date(iso).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', second: '2-digit'}) : '';
