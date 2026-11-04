// Numbered references become links: "Theorem 4.1", "Lemma 3.1", "Props. 4.2, 4.3", "(4.15)", "(3.2)′",
// "Figure 5", "§3", "Remark 2". Hovering a link previews the statement; clicking jumps to it.
//
// Targets come from the page itself: any element with an id and data-ref="Theorem 4.1" / "(4.15)" /
// "Figure 5", or data-alias="Remark 2" (several aliases separated by |), and every h2 with a .secnum
// for "§N". A reference whose target is not on the page is left as plain text. A target on another
// page can be registered with data-ref + data-href="other/page/#id" on an empty element.

import { reveal } from './collapse.js';

const KIND = String.raw`(Definitions?|Defs?\.|Lemmas?|Corollar(?:y|ies)|Cors?\.|Propositions?|Props?\.|Theorems?|Thms?\.|Remarks?|Rems?\.|Figures?|Figs?\.)`;
const NUM = String.raw`S?\d+(?:\.\d+)?`; // "Figure S2": supplement figures
// groups: 1 kind, 2 space, 3 number list · 4 equation number, 5 prime · 6 section
const RE = new RegExp(String.raw`\b${KIND}(\s+)(${NUM}(?:\s*(?:,|and|&|–)\s*${NUM})*)|\((\d+\.\d+)\)(′)?|§\s?(\d+)`, 'g');

// never link inside these (definitions themselves, headings, existing links, UI, typeset math)
const EXCLUDE = 'a, h1, h2, h3, .label, .fig-head, .rail, .rail-button, mjx-container, button, select, input, textarea, .cv-labels, .ref-pop, script, style';

function canonKind(k) {
  k = k.toLowerCase();
  if (k.startsWith('def')) return 'Definition';
  if (k.startsWith('lem')) return 'Lemma';
  if (k.startsWith('cor')) return 'Corollary';
  if (k.startsWith('prop')) return 'Proposition';
  if (k.startsWith('th')) return 'Theorem';
  if (k.startsWith('rem')) return 'Remark';
  if (k.startsWith('fig')) return 'Figure';
  return k;
}

let index = null;
function getIndex() {
  if (index) return index;
  index = new Map();
  const norm = (s) => s.trim().replace(/\s+/g, ' ');
  for (const e of document.querySelectorAll('[id][data-ref], [id][data-alias]')) {
    const keys = [e.dataset.ref, ...(e.dataset.alias || '').split('|')].filter(Boolean);
    for (const k of keys) if (!index.has(norm(k))) index.set(norm(k), e);
  }
  for (const h of document.querySelectorAll('h2[id]')) {
    const n = h.querySelector('.secnum');
    if (n) index.set('§' + parseInt(n.textContent, 10), h);
  }
  return index;
}

/** The pieces of one match: [[text, targetElement|null], …]. */
function resolve(m) {
  const idx = getIndex();
  if (m[1]) {
    const kind = canonKind(m[1]), list = m[3], parts = [], numRe = /S?\d+(?:\.\d+)?/g;
    let k, last = 0, first = true;
    while ((k = numRe.exec(list))) {
      const tg = idx.get(kind + ' ' + k[0]) || null;
      if (first) parts.push([m[1] + m[2] + k[0], tg]);
      else { parts.push([list.slice(last, k.index), null]); parts.push([k[0], tg]); }
      first = false;
      last = k.index + k[0].length;
    }
    return parts;
  }
  if (m[4]) return [[m[0], idx.get('(' + m[4] + ')') || null]];
  return [[m[0], idx.get('§' + m[6]) || null]];
}

function makeLink(text, target) {
  const a = document.createElement('a');
  a.className = 'ref' + (target.closest && target.closest('.supp') ? ' supp-ref' : '');
  a.textContent = text;
  if (target.dataset.href) { a.href = target.dataset.href; a.dataset.external = '1'; }
  else a.href = '#' + target.id;
  a.dataset.target = target.id;
  return a;
}

function linkTextNode(t) {
  const s = t.nodeValue;
  RE.lastIndex = 0;
  let m, last = 0, any = false;
  const frag = document.createDocumentFragment();
  while ((m = RE.exec(s))) {
    const pieces = resolve(m);
    if (!pieces.some(([, tg]) => tg)) continue;
    frag.append(s.slice(last, m.index));
    for (const [text, tg] of pieces) {
      const self = tg && t.parentElement.closest('#' + CSS.escape(tg.id));
      frag.append(tg && !self ? makeLink(text, tg) : text);
    }
    last = m.index + m[0].length;
    any = true;
  }
  if (!any) return;
  frag.append(s.slice(last));
  t.replaceWith(frag);
}

/** Link every numbered reference under root. Safe to call repeatedly (existing links are skipped). */
export function linkRefs(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!/[0-9]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      return !p || p.closest(EXCLUDE) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const t of nodes) linkTextNode(t);
}

// ───────────────────────── previews ─────────────────────────

function stripIds(node) {
  node.querySelectorAll('.caret').forEach((x) => x.remove());
  node.removeAttribute('id');
  node.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  node.removeAttribute('data-ref');
  node.removeAttribute('data-alias');
  return node;
}

/** The enclosing section's heading, as typeset (math included), or null. */
function sectionName(target) {
  const sec = target.closest('section');
  const h = sec && sec.querySelector('h2');
  if (!h || h === target) return null;
  const c = stripIds(h.cloneNode(true));
  c.querySelectorAll('.tag').forEach((x) => x.remove());
  const span = document.createElement('span');
  span.append(...c.childNodes);
  return span;
}

function headLine(head, label, where) {
  head.append(label);
  if (where) head.append(label ? ' · ' : '', where);
}

/** Preview content for a target: the statement as typeset, a figure's snapshot and caption, or a section's opening. */
function preview(target) {
  const box = document.createElement('div');
  const head = document.createElement('div');
  head.className = 'ref-pop-head';
  const where = sectionName(target);
  if (target.matches('.thm, .eq')) {
    const label = target.dataset.ref || target.dataset.alias || '';
    headLine(head, (/^\(/.test(label) ? 'Equation ' : '') + label, where);
    const c = stripIds(target.cloneNode(true));
    c.classList.remove('wide');
    box.append(head, c);
  } else if (target.matches('figure')) {
    headLine(head, target.dataset.ref || '', where);
    box.append(head);
    const title = target.querySelector('.fig-head .title');
    if (title) { const t = stripIds(title.cloneNode(true)); t.className = 'ref-pop-title'; box.append(t); }
    const cv = target.querySelector('.fig-mount canvas');
    if (cv && cv.width > 0) {
      try { const img = document.createElement('img'); img.src = cv.toDataURL('image/png'); img.alt = ''; box.append(img); } catch (e) { /* tainted */ }
    }
    const cap = target.querySelector('figcaption');
    if (cap) box.append(stripIds(cap.cloneNode(true)));
  } else if (target.matches('h2, h3')) {
    if (target.matches('h2')) head.textContent = 'Section'; else headLine(head, '', where);
    const t = stripIds(target.cloneNode(true));
    t.className = 'ref-pop-title';
    box.append(head, t);
    let p = target.nextElementSibling;
    while (p && !(p.matches('p') && p.textContent.trim().length > 40)) p = p.nextElementSibling;
    if (p) box.append(stripIds(p.cloneNode(true)));
  } else {
    headLine(head, (target.dataset.alias || '').split('|')[0], where);
    const p = target.closest('p, li, td') || target;
    box.append(head, stripIds(p.cloneNode(true)));
  }
  return box;
}

export function initRefPreviews() {
  const pop = document.createElement('div');
  pop.className = 'ref-pop';
  pop.setAttribute('role', 'tooltip');
  document.body.append(pop);
  let showT = 0, hideT = 0, current = null;

  function place(a) {
    const r = a.getBoundingClientRect();
    const W = Math.min(544, innerWidth - 24);
    pop.style.width = W + 'px';
    pop.style.left = Math.max(12, Math.min(r.left - 16, innerWidth - W - 12)) + 'px';
    const h = pop.offsetHeight, below = innerHeight - r.bottom, above = r.top;
    if (below >= h + 16 || below >= above) { pop.style.top = (r.bottom + 8) + 'px'; pop.style.maxHeight = Math.max(160, below - 20) + 'px'; }
    else { pop.style.maxHeight = Math.max(160, above - 20) + 'px'; pop.style.top = Math.max(8, r.top - 8 - Math.min(h, above - 20)) + 'px'; }
  }
  function show(a) {
    const target = document.getElementById(a.dataset.target);
    if (!target) return;
    current = a;
    pop.replaceChildren(preview(target));
    pop.classList.add('on');
    place(a);
  }
  function hide() { current = null; pop.classList.remove('on'); }

  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest && e.target.closest('a.ref');
    if (!a || e.pointerType === 'touch') return;
    clearTimeout(hideT);
    if (a === current) return;
    clearTimeout(showT);
    showT = setTimeout(() => show(a), current ? 0 : 160);
  });
  document.addEventListener('pointerout', (e) => {
    const a = e.target.closest && e.target.closest('a.ref');
    if (!a) return;
    const to = e.relatedTarget;
    if (to && (a.contains(to) || pop.contains(to))) return;
    clearTimeout(showT);
    hideT = setTimeout(hide, 160);
  });
  pop.addEventListener('pointerenter', () => clearTimeout(hideT));
  pop.addEventListener('pointerleave', (e) => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('a.ref') === current) return;
    hideT = setTimeout(hide, 160);
  });
  document.addEventListener('focusin', (e) => { const a = e.target.closest && e.target.closest('a.ref'); if (a) show(a); });
  document.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('a.ref')) hideT = setTimeout(hide, 120); });
  addEventListener('scroll', () => { if (current) hide(); }, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  // clicking any in-page link: open a collapsed section or proof that holds the target, then let the browser jump
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.dataset.external) return;
    const id = decodeURIComponent((a.getAttribute('href') || '').slice(1));
    const target = id && !id.startsWith('view-') && document.getElementById(id);
    if (!target) return;
    reveal(target);
    for (let d = target.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    hide();
  });
  const flash = () => {
    const t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!t) return;
    reveal(t);
    t.classList.remove('ref-flash');
    void t.offsetWidth;
    t.classList.add('ref-flash');
    setTimeout(() => t.classList.remove('ref-flash'), 1500);
  };
  addEventListener('hashchange', flash);
}
