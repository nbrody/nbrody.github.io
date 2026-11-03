// Collapsible sections with small wiki-style carets.
// makeCollapsible(heading) wraps everything after the heading, up to the next heading of the same or a higher
// level (or the end of its parent), in a body that the caret shows and hides. State is remembered per page
// in this browser (a per-viewer convenience; the page works without it). reveal(el) opens every collapsed
// section that contains el, so links into a collapsed section still land.

// (no DOM access at module load, so node can import the figure modules that depend on this one)
const KEY = 'ip-collapsed:' + (typeof location !== 'undefined' ? location.pathname : '');
let saved = new Set();
try { saved = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* storage unavailable, or not a browser */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify([...saved])); } catch (e) { /* storage unavailable */ } }

const CARET = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LEVEL = { H2: 2, H3: 3, H4: 4 };
const all = [];

/** Make one heading collapsible. Returns { heading, body, set(collapsed, opts) }. */
export function makeCollapsible(heading) {
  if (heading._collapse) return heading._collapse;
  const lvl = LEVEL[heading.tagName] || 3;
  const body = document.createElement('div');
  body.className = 'collapse-body';
  let n = heading.nextSibling;
  while (n) {
    if (n.nodeType === 1 && LEVEL[n.tagName] && LEVEL[n.tagName] <= lvl) break;
    const next = n.nextSibling;
    body.append(n);
    n = next;
  }
  heading.after(body);
  const caret = document.createElement('button');
  caret.type = 'button';
  caret.className = 'caret';
  caret.innerHTML = CARET;
  heading.classList.add('collapsible');
  heading.prepend(caret);
  const key = heading.id || null;
  const ctl = {
    heading, body, caret,
    get collapsed() { return body.hidden; },
    set(collapsed, { remember = true } = {}) {
      body.hidden = collapsed;
      heading.classList.toggle('is-collapsed', collapsed);
      caret.setAttribute('aria-expanded', String(!collapsed));
      caret.setAttribute('aria-label', (collapsed ? 'Expand' : 'Collapse') + ' this section');
      if (remember && key) { collapsed ? saved.add(key) : saved.delete(key); persist(); }
      dispatchEvent(new Event('ip-collapse'));
    },
  };
  caret.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ctl.set(!body.hidden); });
  body._collapse = ctl;
  heading._collapse = ctl;
  all.push(ctl);
  ctl.set(!!(key && saved.has(key)), { remember: false });
  return ctl;
}

/** Make every heading matching `selector` under root collapsible (outer headings first). */
export function collapsibleHeadings(root, selector) {
  const hs = [...root.querySelectorAll(selector)].sort((a, b) => (LEVEL[a.tagName] || 9) - (LEVEL[b.tagName] || 9));
  return hs.map(makeCollapsible);
}

/** Open every collapsed section containing el (and el's own section, if el is a collapsible heading). */
export function reveal(el) {
  if (!el) return;
  if (el._collapse && el._collapse.collapsed) el._collapse.set(false);
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (a._collapse && a.hidden) a._collapse.set(false);
  }
}

/** Expand or collapse every collapsible heading under root (default: the whole page). */
export function setAll(collapsed, root = document) {
  for (const c of all) if (root.contains(c.heading)) c.set(collapsed);
}

/** Re-apply the remembered state under root (after a temporary expand, e.g. while searching). */
export function restore(root) {
  for (const c of all) if (root.contains(c.heading)) c.set(!!(c.heading.id && saved.has(c.heading.id)), { remember: false });
}
