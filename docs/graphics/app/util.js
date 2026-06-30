// util.js — tiny DOM + misc helpers shared across the wrapper pages.

/** querySelector shorthand. */
export const qs = (sel, root = document) => root.querySelector(sel);
/** querySelectorAll → array. */
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Create an element. `attrs` may include `class`, `text`, `html`, `dataset`,
 * event handlers (`onclick`, …), and any other attribute. `children` is an
 * array of nodes/strings.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, val] of Object.entries(attrs)) {
    if (val == null || val === false) continue;
    if (k === 'class') node.className = val;
    else if (k === 'text') node.textContent = val;
    else if (k === 'html') node.innerHTML = val;
    else if (k === 'dataset') Object.assign(node.dataset, val);
    else if (k === 'style' && typeof val === 'object') Object.assign(node.style, val);
    else if (k.startsWith('on') && typeof val === 'function') node.addEventListener(k.slice(2), val);
    else node.setAttribute(k, val === true ? '' : val);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Remove all children of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Read query-string params as a plain object. */
export function params() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

/** Build a query string while preserving transport pairing params. */
export function studioQuery(extra = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value == null || value === false) continue;
    search.set(key, String(value));
  }

  const current = new URLSearchParams(location.search);
  for (const key of ['transport', 'room']) {
    if (!search.has(key) && current.has(key)) search.set(key, current.get(key));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Short, sortable-ish unique id. */
export function uid(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8);
  // performance.now avoids Date dependency and is monotonic enough for ids.
  const stamp = Math.floor(performance.now()).toString(36);
  return `${prefix}_${stamp}${rand}`;
}

/** Human-readable name for a key string (e.g. ' ' → 'Space'). */
export function keyLabel(k) {
  if (k === ' ') return 'Space';
  if (k === 'ArrowLeft') return '◀';
  if (k === 'ArrowRight') return '▶';
  if (k === 'ArrowUp') return '▲';
  if (k === 'ArrowDown') return '▼';
  return k.length === 1 ? k.toUpperCase() : k;
}

/** mm:ss formatting for seconds. */
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
