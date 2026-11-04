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

// ───────────────────────── supplements ─────────────────────────
// <div class="supp" id="…"><button class="supp-toggle">…</button><div class="supp-body" hidden>…</div></div>
// Material that is not in the paper. Closed by default; the button opens it in place. Opened
// supplements are remembered per page in this browser. reveal() opens one like a collapsed section
// (its body carries the same controller), but "Expand all" leaves supplements alone.

const SUPP_KEY = 'ip-supp-open:' + (typeof location !== 'undefined' ? location.pathname : '');
let suppOpen = new Set();
try { suppOpen = new Set(JSON.parse(localStorage.getItem(SUPP_KEY) || '[]')); } catch (e) { /* storage unavailable */ }
function persistSupp() { try { localStorage.setItem(SUPP_KEY, JSON.stringify([...suppOpen])); } catch (e) { /* storage unavailable */ } }
const supplements = [];

/** Wire one supplement box. Returns its controller { heading, body, collapsed, set(collapsed) }. */
export function makeSupplement(box) {
  if (box._supp) return box._supp;
  if (!box.querySelector(':scope > .supp-toggle') && box.dataset.title) buildSupplement(box);
  const btn = box.querySelector(':scope > .supp-toggle');
  const body = box.querySelector(':scope > .supp-body');
  if (!btn || !body) return null;
  const action = btn.querySelector('.supp-action');
  if (!body.id && box.id) body.id = box.id + '-body';
  if (body.id) btn.setAttribute('aria-controls', body.id);
  const ctl = {
    heading: btn, body, box,
    get collapsed() { return body.hidden; },
    set(collapsed, { remember = true } = {}) {
      body.hidden = collapsed;
      box.classList.toggle('open', !collapsed);
      btn.setAttribute('aria-expanded', String(!collapsed));
      if (action) action.textContent = collapsed ? 'Show' : 'Hide';
      if (remember && box.id) { collapsed ? suppOpen.delete(box.id) : suppOpen.add(box.id); persistSupp(); }
      dispatchEvent(new Event('ip-collapse'));
    },
  };
  btn.addEventListener('click', () => ctl.set(!body.hidden));
  const end = document.createElement('button');
  end.type = 'button';
  end.className = 'supp-end';
  end.textContent = 'Close this supplement';
  end.addEventListener('click', () => {
    ctl.set(true);
    const r = btn.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) btn.scrollIntoView({ block: 'center' });
    btn.focus({ preventScroll: true });
  });
  body.append(end);
  body._collapse = ctl;
  box._supp = ctl;
  supplements.push(ctl);
  ctl.set(!(box.id && suppOpen.has(box.id)), { remember: false });
  return ctl;
}

/** The short form: <div class="supp" id="…" data-title="…" data-meta="…">content</div>. Builds the
 *  orange button from data-title (may hold $…$) and data-meta (one line), and wraps the content. */
function buildSupplement(box) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'supp-toggle';
  btn.setAttribute('aria-expanded', 'false');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  btn.innerHTML = '<span class="supp-icon"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span>'
    + `<span class="supp-text"><span class="supp-kicker">${esc(box.dataset.kicker || 'Supplement · not in the paper')}</span>`
    + `<span class="supp-title">${esc(box.dataset.title)}</span>`
    + (box.dataset.meta ? `<span class="supp-meta">${esc(box.dataset.meta)}</span>` : '')
    + '</span><span class="supp-action">Show</span>';
  const body = document.createElement('div');
  body.className = 'supp-body';
  body.hidden = true;
  body.append(...box.childNodes);
  box.append(btn, body);
  // typeset the title's math if MathJax has already made its first pass
  const MJ = typeof window !== 'undefined' && window.MathJax;
  if (MJ && MJ.startup && MJ.startup.promise) MJ.startup.promise.then(() => MJ.typesetPromise && MJ.typesetPromise([btn])).catch(() => {});
}

/** Wire every supplement under root. */
export function initSupplements(root = document) {
  return [...root.querySelectorAll('.supp')].map(makeSupplement).filter(Boolean);
}

/** Open or close every supplement (used by the page checker). */
export function setAllSupplements(open) {
  for (const s of supplements) s.set(!open);
}
