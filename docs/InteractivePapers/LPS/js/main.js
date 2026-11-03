// Page wiring: lazy-mounted figures, theme button, numbered-reference links, and the link-tree rail.
import { el, setTex, typeset, mathJaxReady } from './common.js';
import { linkRefs, initRefPreviews } from './refs.js';
import { COMPANIONS, initCompanions } from './companions.js';
import { collapsibleHeadings, reveal, setAll } from './collapse.js';

// ───────────────────────── numbered references ─────────────────────────
// Link "Theorem 4.1", "(4.15)", "Figure 5", "§3"… once MathJax has typeset the page
// (figure readouts are linked as they are typeset, in common.js setTex).
initRefPreviews();
mathJaxReady().then(() => linkRefs(document.querySelector('.paper')));

// ───────────────────────── figures ─────────────────────────

const modules = {
  generators: () => import('./fig-generators.js'),
  tree: () => import('./fig-tree.js'),
  girth: () => import('./fig-girth.js'),
  kesten: () => import('./fig-kesten.js'),
  trace: () => import('./fig-trace.js'),
  mainterm: () => import('./fig-mainterm.js'),
  projective: () => import('./fig-projective.js'),
  balls: () => import('./fig-balls.js'),
};

function mountFigure(fig) {
  if (fig.dataset.mounted) return;
  fig.dataset.mounted = '1';
  const mount = fig.querySelector('.fig-mount');
  const loader = modules[fig.dataset.fig];
  if (!loader) return;
  loader().then((m) => m.mount(mount)).catch((err) => {
    console.error(err);
    mount.innerHTML = '<div class="fallback">This figure could not be loaded: ' + String(err.message || err) + '</div>';
  });
}

const figs = [...document.querySelectorAll('figure.fig[data-fig]')];
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { mountFigure(e.target); io.unobserve(e.target); }
  }, { rootMargin: '700px 0px' });
  figs.forEach((f) => io.observe(f));
} else {
  figs.forEach(mountFigure);
}
// a link straight to a figure should find it mounted
window.addEventListener('hashchange', () => {
  const t = document.getElementById(location.hash.slice(1));
  if (t && t.matches('figure.fig')) mountFigure(t);
});

// ───────────────────────── theme ─────────────────────────

const toggle = document.getElementById('theme-toggle');
toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>';
toggle.addEventListener('click', () => {
  const root = document.documentElement;
  const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = root.dataset.theme || (sysDark ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('ip-theme', next); } catch (e) { /* storage unavailable */ }
  window.dispatchEvent(new Event('ip-theme'));
});

// ───────────────────────── the link tree ─────────────────────────
// Level 1: h2[id]. Level 2: h3[id]. Level 3: [data-ref] (statements, equations, figures).
// Labels come from data-nav (may contain $…$) or the heading text.

const paper = document.querySelector('.paper');
const rail = document.getElementById('rail');
const track = el('div', { class: 'rail-track' });
const fill = el('div', { class: 'rail-fill' });
track.append(fill);
const panel = el('nav', { class: 'rail-panel', 'aria-label': 'Contents' });
const filter = el('input', { class: 'tree-filter', type: 'search', placeholder: 'Jump to… (e.g. 4.15, girth)', 'aria-label': 'Filter contents' });
const treeRoot = el('ul');
const cmpGrid = el('div', { class: 'tree-cmp' });
for (const c of COMPANIONS) cmpGrid.append(el('a', { href: '#view-' + c.id, html: `${c.icon}<span>${c.title}</span>` }));
panel.append(
  el('div', { class: 'tree-title' }, document.querySelector('.hero h1').textContent),
  el('div', { class: 'tree-sub' }, 'Lubotzky · Phillips · Sarnak, 1988'),
  el('div', { class: 'tree-cmp-title' }, 'Companion pages'),
  cmpGrid,
  filter,
  el('div', { class: 'tree' }, treeRoot),
);
// the same pages as icons at the foot of the collapsed rail
const railCmp = el('div', { class: 'rail-cmp' });
for (const c of COMPANIONS) railCmp.append(el('a', { href: '#view-' + c.id, title: c.title, 'aria-label': c.title, html: c.icon }));
const railIcon = el('div', { class: 'rail-icon', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>' });
rail.append(railIcon, track, railCmp, panel);
const railButton = el('button', { class: 'rail-button', type: 'button', 'aria-label': 'Contents' }, '☰ Contents');
document.body.append(railButton);

const nodes = []; // { level, target, li, a, parent, text }
function labelOf(h) {
  if (h.dataset.nav) return h.dataset.nav;
  const c = h.cloneNode(true);
  c.querySelectorAll('.secnum, .tag, .caret').forEach((x) => x.remove());
  return c.innerHTML.trim();
}

function addNode(level, target, html, parent, extra = '') {
  const li = el('li', { class: 'l' + level });
  const row = el('div', { class: 'row' });
  const a = el('a', { href: '#' + target.id });
  a.innerHTML = extra + html;
  row.append(a);
  li.append(row);
  const node = { level, target, li, a, row, parent, children: null, text: (a.textContent + ' ' + (target.dataset.ref || '')).toLowerCase() };
  if (parent) {
    if (!parent.children) {
      parent.children = el('ul');
      parent.li.append(parent.children);
      const tw = el('button', { class: 'tw', type: 'button', 'aria-label': 'Expand' }, '▶');
      tw.addEventListener('click', () => { parent.li.classList.toggle('collapsed'); parent.manual = true; });
      parent.row.prepend(tw);
    }
    parent.children.append(li);
  } else treeRoot.append(li);
  nodes.push(node);
  return node;
}

let cur1 = null, cur2 = null;
for (const e of paper.querySelectorAll('h2[id], h3[id], [data-ref][id]')) {
  if (e.tagName === 'H2') {
    const n = e.querySelector('.secnum');
    cur1 = addNode(1, e, labelOf(e), null, n ? `<span class="n">${n.textContent}</span>` : '');
    cur2 = null;
  } else if (e.tagName === 'H3') {
    if (!cur1) continue;
    cur2 = addNode(2, e, labelOf(e), cur1);
  } else {
    const parent = cur2 || cur1;
    if (!parent) continue;
    const title = e.dataset.title ? ` <span>${e.dataset.title}</span>` : '';
    addNode(3, e, `<span class="k">${e.dataset.ref}</span>${title}`, parent);
  }
}
for (const n of nodes) if (n.children && n.level === 1) n.li.classList.add('collapsed');
for (const n of nodes) if (n.children && n.level === 2) n.li.classList.add('collapsed');
typeset(panel);

// ───────────────────────── collapsible sections ─────────────────────────
// Every section and subsection gets a caret (after the tree has read the headings' labels).
collapsibleHeadings(paper, 'h2[id], h3[id]');
const bulk = el('div', { class: 'tree-bulk' },
  el('button', { type: 'button', onclick: () => setAll(false, paper) }, 'Expand all'),
  el('span', { 'aria-hidden': 'true' }, '·'),
  el('button', { type: 'button', onclick: () => setAll(true, paper) }, 'Collapse all'));
panel.insertBefore(bulk, filter.nextSibling);
// a hidden element is measured at the collapsed heading that hides it
function measured(e) {
  let m = e;
  for (let a = e.parentElement; a; a = a.parentElement) if (a._collapse && a.hidden) m = a._collapse.heading;
  return m;
}

// rail markers: a numbered circle per numbered section, a dot for the unnumbered parts,
// a small tick per subsection; placed where each sits in the page, kept apart from each other
const ticks = nodes.filter((n) => n.level <= 2).map((n) => {
  let t;
  if (n.level === 1) {
    const num = n.target.querySelector('.secnum');
    t = el('div', { class: 'rail-mark' + (num ? '' : ' dot') }, num ? num.textContent.replace(/\D/g, '') : '');
  } else t = el('div', { class: 'rail-tick' });
  track.append(t);
  return { n, t };
});
function placeTicks() {
  const H = document.documentElement.scrollHeight, th = track.clientHeight;
  if (!th) return;
  const ys = ticks.map(({ n }) => (th * (measured(n.target).getBoundingClientRect().top + window.scrollY)) / H);
  const big = ticks.map((x, i) => i).filter((i) => ticks[i].n.level === 1);
  const gap = 24;
  for (let j = 1; j < big.length; j++) ys[big[j]] = Math.max(ys[big[j]], ys[big[j - 1]] + gap);
  let lim = th;
  for (let j = big.length - 1; j >= 0; j--) { ys[big[j]] = Math.min(ys[big[j]], lim); lim = ys[big[j]] - gap; }
  ticks.forEach(({ t }, i) => { t.style.top = ys[i].toFixed(1) + 'px'; });
}
new ResizeObserver(() => placeTicks()).observe(paper);

// active position
let queued = false;
function update() {
  queued = false;
  const H = document.documentElement.scrollHeight - innerHeight;
  fill.style.height = (100 * Math.min(1, Math.max(0, scrollY / Math.max(1, H)))).toFixed(2) + '%';
  const line = innerHeight * 0.28;
  let active = null;
  for (const n of nodes) if (measured(n.target) === n.target && n.target.getBoundingClientRect().top < line) active = n;
  const chain = new Set();
  for (let x = active; x; x = x.parent) chain.add(x);
  for (const n of nodes) {
    n.a.classList.toggle('on', n === active);
    if (n.children && !n.manual) n.li.classList.toggle('collapsed', !chain.has(n));
  }
  for (const { n, t } of ticks) {
    t.classList.toggle('on', chain.has(n));
    t.classList.toggle('passed', !chain.has(n) && measured(n.target).getBoundingClientRect().top < line);
  }
  if (active && rail.classList.contains('open') && !filter.value) {
    const r = active.a.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    if (r.top < pr.top + 80 || r.bottom > pr.bottom - 40) active.a.scrollIntoView({ block: 'center' });
  }
}
addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
addEventListener('resize', () => { placeTicks(); update(); });
update();

// open on hover (desktop), on the button (touch), on focus (keyboard)
let openT = 0, closeT = 0;
function setOpen(v) {
  rail.classList.toggle('open', v);
  railButton.setAttribute('aria-expanded', v);
  if (v) update();
}
rail.addEventListener('pointerenter', (e) => {
  if (e.pointerType === 'touch') return;
  clearTimeout(closeT);
  openT = setTimeout(() => setOpen(true), 70);
});
rail.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'touch') return;
  clearTimeout(openT);
  if (document.activeElement === filter && filter.value) return;
  closeT = setTimeout(() => setOpen(false), 260);
});
rail.addEventListener('focusin', () => { clearTimeout(closeT); setOpen(true); });
rail.addEventListener('focusout', (e) => { if (!rail.contains(e.relatedTarget)) closeT = setTimeout(() => setOpen(false), 120); });
railButton.addEventListener('click', () => setOpen(!rail.classList.contains('open')));
document.addEventListener('pointerdown', (e) => {
  if (rail.classList.contains('open') && !rail.contains(e.target) && e.target !== railButton) setOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && rail.classList.contains('open')) { setOpen(false); filter.blur(); }
});
panel.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  if (matchMedia('(hover: none), (max-width: 899px)').matches) setOpen(false);
});

// filter: show matching entries and their ancestors
filter.addEventListener('input', () => {
  const q = filter.value.trim().toLowerCase();
  if (!q) {
    for (const n of nodes) n.li.classList.remove('hidden');
    for (const n of nodes) n.manual = false;
    update();
    return;
  }
  const keep = new Set();
  for (const n of nodes) if (n.text.includes(q)) for (let x = n; x; x = x.parent) keep.add(x);
  for (const n of nodes) {
    n.li.classList.toggle('hidden', !keep.has(n));
    if (n.children) { n.manual = true; n.li.classList.toggle('collapsed', !keep.has(n)); }
  }
});
filter.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = filter.value.trim().toLowerCase();
  const hit = nodes.find((n) => n.level === 3 && n.text.includes(q)) || nodes.find((n) => n.text.includes(q));
  if (hit) { location.hash = hit.target.id; hit.target.scrollIntoView({ block: 'start' }); }
});

// typeset any data-nav labels used in headings' own text is already done by MathJax's page pass
export { setTex };

// ───────────────────────── companion pages ─────────────────────────
initCompanions();

// ───────────────────────── collapsing and navigation ─────────────────────────
// rail markers follow sections as they open and close; a page address that points into a
// collapsed section opens it
addEventListener('ip-collapse', () => { placeTicks(); update(); });
{
  const id = location.hash.slice(1);
  const initial = id && !id.startsWith('view-') && document.getElementById(decodeURIComponent(id));
  if (initial) { reveal(initial); setTimeout(() => initial.scrollIntoView(), 0); }
}
