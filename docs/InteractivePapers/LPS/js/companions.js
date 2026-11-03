// Companion pages that open over the paper: dependency graph, definitions, notation, cited results, print slips.
// Each has an address (#view-graph, #view-defs/cayley, …), so links can point at it and Back closes it.
// Numbered references inside them are links with previews (refs.js); clicking one closes the sheet and jumps.
import { el, setTex } from './common.js';
import { DEP_NODES, DEFINITIONS, DEF_TOPICS, NOTATION_GROUPS, CITED, SLIPS, GUIDE_HTML } from './companions-data.js';
import { collapsibleHeadings, reveal, restore } from './collapse.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const COMPANIONS = [
  { id: 'guide', title: 'Reading guide', blurb: 'where the weight sits',
    icon: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z"/>') },
  { id: 'graph', title: 'Dependency graph', blurb: 'what rests on what',
    icon: svg('<circle cx="6" cy="5" r="2.2"/><circle cx="18" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M7.2 6.8 11 17M16.8 6.8 13 17"/>') },
  { id: 'defs', title: 'Definitions', blurb: 'from the paper and background',
    icon: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M9 8h7M9 12h5"/>') },
  { id: 'notation', title: 'Notation atlas', blurb: 'every symbol, and its clashes',
    icon: svg('<path d="M17 4H7l6 8-6 8h10"/>') },
  { id: 'cited', title: 'Cited results', blurb: 'the outside theorems used',
    icon: svg('<path d="M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6"/>') },
  { id: 'slips', title: 'Print slips', blurb: 'typos in the printed paper',
    icon: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>') },
];

let root, sheet, body, titleEl, tabs, closeBtn, current = null, openedFromPage = false, lastFocus = null;
const rendered = new Map();

export function initCompanions() {
  root = el('div', { class: 'cmp', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cmp-title', hidden: '' });
  const backdrop = el('div', { class: 'cmp-backdrop' });
  sheet = el('div', { class: 'cmp-sheet' });
  titleEl = el('div', { class: 'cmp-title', id: 'cmp-title' });
  tabs = el('nav', { class: 'cmp-tabs', 'aria-label': 'Companion pages' });
  for (const c of COMPANIONS) {
    tabs.append(el('a', { href: '#view-' + c.id, 'data-view': c.id, class: 'cmp-tab', html: `${c.icon}<span>${c.title}</span>` }));
  }
  closeBtn = el('button', { class: 'cmp-close', type: 'button', 'aria-label': 'Close and return to the paper',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' });
  const head = el('header', { class: 'cmp-head' },
    el('div', { class: 'cmp-titles' }, el('div', { class: 'cmp-kicker' }, 'Ramanujan Graphs · companion'), titleEl),
    closeBtn, tabs);
  body = el('div', { class: 'cmp-body' });
  sheet.append(head, body);
  root.append(backdrop, sheet);
  document.body.append(root);

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); } });

  // links to companion pages: from the paper they push a history entry (so Back closes);
  // inside an open sheet they replace it (so Back still closes rather than stepping through tabs)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#view-"]');
    if (!a) return;
    if (current) {
      e.preventDefault();
      history.replaceState(history.state, '', a.getAttribute('href'));
      route();
    } else {
      lastFocus = a;
      openedFromPage = true;
    }
  });
  addEventListener('hashchange', route);
  addEventListener('popstate', route);
  route();
}

function parse() {
  const m = location.hash.match(/^#view-([a-z]+)(?:\/([\w-]+))?$/);
  return m && COMPANIONS.some((c) => c.id === m[1]) ? { id: m[1], entry: m[2] } : null;
}

function route() {
  const r = parse();
  if (r) open(r.id, r.entry);
  else if (current) hideSheet();
}

function close() {
  if (!current) return;
  if (openedFromPage) { openedFromPage = false; history.back(); }
  else { history.replaceState(history.state, '', location.pathname + location.search); hideSheet(); }
}

function hideSheet() {
  current = null;
  root.classList.remove('on');
  document.documentElement.classList.remove('cmp-open');
  setTimeout(() => { if (!current) root.hidden = true; }, 180);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

function open(id, entry) {
  const c = COMPANIONS.find((x) => x.id === id);
  const first = !current;
  current = id;
  root.hidden = false;
  document.documentElement.classList.add('cmp-open');
  void root.offsetWidth; // flush styles so the fade-in transition runs
  root.classList.add('on');
  titleEl.textContent = c.title;
  for (const t of tabs.children) t.classList.toggle('on', t.dataset.view === id);
  if (!rendered.has(id)) {
    const page = el('div', { class: 'cmp-page', 'data-page': id });
    rendered.set(id, { page, ready: RENDER[id](page) });
  }
  const { page, ready } = rendered.get(id);
  body.replaceChildren(page);
  if (first) setTimeout(() => closeBtn.focus({ preventScroll: true }), 30);
  Promise.resolve(ready).then(() => {
    if (current !== id) return;
    if (entry) {
      const t = page.querySelector('#' + CSS.escape(id + '-' + entry));
      if (t) {
        t.hidden = false;
        reveal(t);
        t.scrollIntoView({ block: 'start' });
        t.classList.remove('ref-flash'); void t.offsetWidth; t.classList.add('ref-flash');
      }
    } else if (first) body.scrollTop = 0;
  });
}

// ───────────────────────── pages ─────────────────────────

const LEVELS = [['basic', 'Basic'], ['intermediate', 'Intermediate'], ['specialized', 'Specialized']];
const ORIGINS = [['paper', 'From the paper'], ['background', 'Background']];

function toggleChips(parent, label, options, onchange) {
  const row = el('div', { class: 'cmp-chiprow' }, el('span', { class: 'cmp-chiplabel' }, label));
  const on = new Set(options.map(([k]) => k));
  for (const [k, text] of options) {
    const b = el('button', { type: 'button', class: 'chip on', 'aria-pressed': 'true' }, text);
    b.addEventListener('click', () => {
      if (on.has(k) && on.size > 1) on.delete(k); else on.add(k);
      b.classList.toggle('on', on.has(k));
      b.setAttribute('aria-pressed', on.has(k));
      onchange(on);
    });
    row.append(b);
  }
  parent.append(row);
  return on;
}

function renderDefs(page) {
  const intro = el('p', { class: 'cmp-intro' });
  const filters = el('div', { class: 'cmp-filters' });
  const search = el('input', { type: 'search', class: 'cmp-search', placeholder: 'Search definitions…', 'aria-label': 'Search definitions' });
  const count = el('div', { class: 'cmp-count' });
  const list = el('div', { class: 'def-list' });
  page.append(intro, filters, list);
  let levels, origins;
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    if (!q) restore(list);
    for (const sec of list.children) {
      let any = false;
      for (const e of sec.querySelectorAll('.def-entry')) {
        const ok = levels.has(e.dataset.level) && origins.has(e.dataset.origin) && (!q || e.textContent.toLowerCase().includes(q));
        e.hidden = !ok;
        if (ok) { any = true; shown++; }
      }
      sec.hidden = !any;
      const h = sec.querySelector('h3');
      if (q && any && h && h._collapse) h._collapse.set(false, { remember: false });
    }
    count.textContent = `${shown} of ${DEFINITIONS.length} shown`;
  };
  levels = toggleChips(filters, 'Level', LEVELS, apply);
  origins = toggleChips(filters, 'Source', ORIGINS, apply);
  filters.append(el('div', { class: 'cmp-chiprow' }, search, count));
  search.addEventListener('input', apply);

  const html = DEF_TOPICS.map((topic, t) => {
    const items = DEFINITIONS.filter((d) => d.topic === t).map((d) => `
      <article class="def-entry" id="defs-${d.key}" data-level="${d.level}" data-origin="${d.origin}">
        <div class="def-top"><h4 class="def-term">${d.term}</h4>
          <span class="badge lvl-${d.level}">${LEVELS.find(([k]) => k === d.level)[1]}</span>
          <span class="badge">${d.origin === 'paper' ? 'From the paper' : 'Background'}</span></div>
        <p>${d.text}</p>
        ${d.where ? `<div class="def-where">On the page: ${d.where}</div>` : ''}
      </article>`).join('');
    return `<section class="def-topic"><h3 class="cmp-h3" id="defs-topic-${t}">${topic}</h3>${items}</section>`;
  }).join('');
  setTex(intro, 'Every definition the paper makes, and the background terms it assumes. Filter by level — <b>basic</b> (an undergraduate course), <b>intermediate</b> (a first graduate course), <b>specialized</b> (number theory and automorphic forms) — or search. References are links: hover to preview, click to jump.');
  return setTex(list, html).then(() => { collapsibleHeadings(list, '.def-topic > h3'); apply(); });
}

function renderNotation(page) {
  const intro = el('p', { class: 'cmp-intro' });
  const search = el('input', { type: 'search', class: 'cmp-search', placeholder: 'Search symbols and meanings…', 'aria-label': 'Search notation' });
  const filters = el('div', { class: 'cmp-filters' }, el('div', { class: 'cmp-chiprow' }, search));
  const tables = el('div', { class: 'not-list' });
  page.append(intro, filters, tables);
  setTex(intro, 'Every symbol in the paper, where it first appears, and where the paper uses one letter for two things (marked <span class="clash">clash</span>). The paper writes $\\Delta$ for the adjacency matrix; this page often writes $A$.');
  const html = NOTATION_GROUPS.map((g, gi) => `
    <section class="not-group"><h3 class="cmp-h3" id="notation-group-${gi}">${g.title}</h3>
      <div class="table-scroll"><table class="not-table">
        <tr><th>Symbol</th><th>Meaning</th><th>First</th><th>Note</th></tr>
        ${g.rows.map(([sym, meaning, first, note]) => `<tr><td class="not-sym">${sym}</td><td>${meaning}</td><td class="not-first">${first.startsWith('#') ? `<a class="ref" href="${first}" data-target="${first.slice(1)}">Before the paper</a>` : first}</td><td class="not-note">${note ? `${/Not |Also |reuses|collid|Distinct/.test(note) ? '<span class="clash">clash</span> ' : ''}${note}` : ''}</td></tr>`).join('')}
      </table></div></section>`).join('');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) restore(tables);
    for (const sec of tables.children) {
      let any = false;
      for (const tr of sec.querySelectorAll('tr')) {
        if (tr.querySelector('th')) continue;
        const ok = !q || tr.textContent.toLowerCase().includes(q);
        tr.hidden = !ok;
        any = any || ok;
      }
      sec.hidden = !any;
      const h = sec.querySelector('h3');
      if (q && any && h && h._collapse) h._collapse.set(false, { remember: false });
    }
  });
  return setTex(tables, html).then(() => collapsibleHeadings(tables, '.not-group > h3'));
}

function renderCited(page) {
  const intro = el('p', { class: 'cmp-intro' });
  const list = el('div', { class: 'cited-list' });
  page.append(intro, list);
  setTex(intro, 'The results the paper takes from elsewhere, stated, with where each one is used. The deep one is the Ramanujan conjecture in weight two; the rest is classical.');
  const html = CITED.map((c) => `
    <article class="cited" id="cited-${c.key}">
      <h4 class="cited-name">${c.name}</h4>
      <div class="cited-who">${c.who}</div>
      <p class="cited-statement">${c.statement}</p>
      <div class="def-where">Used in: ${c.used}</div>
    </article>`).join('');
  return setTex(list, html);
}

function renderSlips(page) {
  const intro = el('p', { class: 'cmp-intro' });
  const list = el('ol', { class: 'slip-list' });
  page.append(intro, list);
  setTex(intro, 'Small errors in the printed paper (Combinatorica 8, 1988), found while transcribing it. The page states the intended reading and marks each place with a quiet "In print" note. None affects the results.');
  return setTex(list, SLIPS.map((s, i) => `<li id="slips-${i + 1}"><div class="slip-where">${s.where}</div><div>${s.text}</div></li>`).join(''));
}

// ───────────────────────── dependency graph ─────────────────────────

/** Layered layout, top to bottom. Pure: exported for tests. */
export function layoutGraph(nodes, cap = 6) {
  const ids = new Set(nodes.map((n) => n.id));
  const preds = new Map(nodes.map((n) => [n.id, n.uses.filter((u) => ids.has(u))]));
  const succs = new Map(nodes.map((n) => [n.id, []]));
  for (const [v, ps] of preds) for (const u of ps) succs.get(u).push(v);
  const depth = new Map();
  const d = (id) => {
    if (depth.has(id)) return depth.get(id);
    const ps = preds.get(id);
    const v = ps.length ? 1 + Math.max(...ps.map(d)) : 0;
    depth.set(id, v);
    return v;
  };
  for (const n of nodes) d(n.id);
  // sources sit just above their first use, not all in the top row
  for (const n of nodes) {
    if (preds.get(n.id).length || !succs.get(n.id).length) continue;
    depth.set(n.id, Math.min(...succs.get(n.id).map((s) => depth.get(s))) - 1);
  }
  const layers = [];
  for (const n of nodes) (layers[depth.get(n.id)] ||= []).push(n.id);
  for (let i = 0; i < layers.length; i++) layers[i] ||= [];
  // keep rows at most `cap` wide: move a sink down, or a source up, to the nearest row with room
  const move = (id, from, to) => { layers[from].splice(layers[from].indexOf(id), 1); layers[to].push(id); depth.set(id, to); };
  for (let i = 0; i < layers.length; i++) {
    for (let guard = 0; layers[i].length > cap && guard < 20; guard++) {
      const sink = layers[i].find((id) => !succs.get(id).length);
      const src = layers[i].find((id) => !preds.get(id).length);
      let j = -1;
      if (sink) { j = i + 1; while (j < layers.length && layers[j].length >= cap) j++; if (j < layers.length) { move(sink, i, j); continue; } }
      if (src) { j = i - 1; while (j >= 0 && layers[j].length >= cap) j--; if (j >= 0) { move(src, i, j); continue; } }
      break;
    }
  }
  const x = new Map();
  const setX = () => layers.forEach((L) => L.forEach((id, i) => x.set(id, i - (L.length - 1) / 2)));
  setX();
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  for (let sweep = 0; sweep < 8; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const L of order) {
      const key = new Map(L.map((id) => {
        const nb = down ? preds.get(id) : succs.get(id);
        return [id, nb.length ? avg(nb.map((v) => x.get(v))) : x.get(id)];
      }));
      L.sort((a, b) => key.get(a) - key.get(b));
      L.forEach((id, i) => x.set(id, i - (L.length - 1) / 2));
    }
  }
  return { layers, depth, x, preds, succs };
}

function closure(start, next) {
  const seen = new Set(), stack = [start];
  while (stack.length) for (const v of next(stack.pop())) if (!seen.has(v)) { seen.add(v); stack.push(v); }
  return seen;
}

const KIND_NAMES = { def: 'definition', lemma: 'lemma or corollary', prop: 'proposition', thm: 'theorem', goal: 'main theorem', eq: 'numbered equation', remark: 'remark or unnumbered step', input: 'cited result' };

function renderGraph(page) {
  const intro = el('p', { class: 'cmp-intro' });
  const controls = el('div', { class: 'cmp-filters' });
  const legend = el('div', { class: 'dep-legend' });
  const scroller = el('div', { class: 'dep-scroll' });
  page.append(intro, controls, legend, scroller);
  setTex(intro, 'Each box is a numbered statement, equation or cited result; an arrow runs from what is used to what uses it. <b>Hover</b> a box to light up everything it rests on (above) and everything that rests on it (below), and to preview the statement. <b>Click</b> to jump to it in the paper. Dashed boxes are results from the literature.');

  const st = { inputs: true, trace: true, hover: null };
  const row = el('div', { class: 'cmp-chiprow' });
  const mk = (text, key) => {
    const b = el('button', { type: 'button', class: 'chip on', 'aria-pressed': 'true' });
    setTex(b, text);
    b.addEventListener('click', () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); b.setAttribute('aria-pressed', st[key]); key === 'inputs' ? build() : paint(); });
    row.append(b);
  };
  mk('Show cited results', 'inputs');
  mk('Trace what Theorem 4.1 rests on', 'trace');
  controls.append(row);
  legend.innerHTML = ['goal', 'thm', 'prop', 'lemma', 'def', 'eq', 'remark', 'input'].map((k) => `<span class="dep-key"><i class="dep-swatch k-${k}"></i>${KIND_NAMES[k]}</span>`).join('');

  let G = null, nodeEls = new Map(), edgeEls = [];
  const NW = 156, NH = 62, CW = 170, RH = 100, PAD = 14;

  function build() {
    const nodes = DEP_NODES.filter((n) => st.inputs || n.kind !== 'input')
      .map((n) => ({ ...n, uses: n.uses }));
    G = layoutGraph(nodes);
    const width = Math.max(...G.layers.map((L) => L.length)) * CW + 2 * PAD;
    const height = G.layers.length * RH + 2 * PAD - (RH - NH);
    const pos = new Map(nodes.map((n) => [n.id, {
      x: width / 2 + G.x.get(n.id) * CW - NW / 2,
      y: PAD + G.depth.get(n.id) * RH,
    }]));
    const box = el('div', { class: 'dep-graph', style: `width:${width}px;height:${height}px` });
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', width); s.setAttribute('height', height); s.setAttribute('class', 'dep-edges');
    const marker = (id, color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" style="fill:var(${color})"/></marker>`;
    s.innerHTML = `<defs>${marker('dep-arrow', '--c-tree')}${marker('dep-arrow-up', '--accent')}${marker('dep-arrow-down', '--c-count')}</defs>`;
    edgeEls = [];
    for (const n of nodes) for (const u of G.preds.get(n.id)) {
      const a = pos.get(u), b = pos.get(n.id);
      const x1 = a.x + NW / 2, y1 = a.y + NH, x2 = b.x + NW / 2, y2 = b.y - 2;
      const dy = Math.max(26, (y2 - y1) * 0.45);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`);
      p.setAttribute('class', 'dep-edge');
      s.append(p);
      edgeEls.push({ el: p, from: u, to: n.id });
    }
    box.append(s);
    nodeEls = new Map();
    for (const n of nodes) {
      const { x, y } = pos.get(n.id);
      const attrs = n.target
        ? { href: '#' + n.target, class: `dep-node ref k-${n.kind}`, 'data-target': n.target }
        : { href: '#view-cited/' + n.cite, class: `dep-node k-${n.kind}` };
      const a = el('a', { ...attrs, 'data-id': n.id, style: `left:${x}px;top:${y}px;width:${NW}px;height:${NH}px` },
        el('span', { class: 'dep-label', html: n.label }), el('span', { class: 'dep-gist', html: n.gist }));
      a.addEventListener('pointerenter', () => { st.hover = n.id; paint(); });
      a.addEventListener('pointerleave', () => { if (st.hover === n.id) { st.hover = null; paint(); } });
      a.addEventListener('focus', () => { st.hover = n.id; paint(); });
      a.addEventListener('blur', () => { if (st.hover === n.id) { st.hover = null; paint(); } });
      box.append(a);
      nodeEls.set(n.id, a);
    }
    scroller.replaceChildren(box);
    paint();
    return setTex(box, box.innerHTML).then(() => {
      // setTex replaced the children: re-bind the elements
      nodeEls = new Map([...box.querySelectorAll('.dep-node')].map((a) => [a.dataset.id, a]));
      const paths = [...box.querySelectorAll('.dep-edge')];
      edgeEls = edgeEls.map((e, i) => ({ ...e, el: paths[i] }));
      for (const [id, a] of nodeEls) {
        a.addEventListener('pointerenter', () => { st.hover = id; paint(); });
        a.addEventListener('pointerleave', () => { if (st.hover === id) { st.hover = null; paint(); } });
        a.addEventListener('focus', () => { st.hover = id; paint(); });
        a.addEventListener('blur', () => { if (st.hover === id) { st.hover = null; paint(); } });
      }
      paint();
      // centre the scroll on the main theorem on narrow screens
      const goal = nodeEls.get('thm41');
      if (goal && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = goal.offsetLeft + NW / 2 - scroller.clientWidth / 2;
    });
  }

  function paint() {
    if (!G) return;
    const focus = st.hover || (st.trace ? 'thm41' : null);
    const up = focus ? closure(focus, (v) => G.preds.get(v) || []) : new Set();
    const down = st.hover ? closure(focus, (v) => G.succs.get(v) || []) : new Set();
    scroller.classList.toggle('focusing', !!focus);
    for (const [id, a] of nodeEls) {
      a.classList.toggle('self', id === focus);
      a.classList.toggle('up', up.has(id));
      a.classList.toggle('down', down.has(id));
    }
    for (const e of edgeEls) {
      const isUp = (up.has(e.to) || e.to === focus) && up.has(e.from);
      const isDown = (down.has(e.from) || e.from === focus) && down.has(e.to);
      e.el.classList.toggle('up', isUp);
      e.el.classList.toggle('down', isDown);
    }
  }

  return build();
}

function renderGuide(page) {
  const intro = el('p', { class: 'cmp-intro' });
  const body = el('div', { class: 'guide-body' });
  page.append(intro, body);
  setTex(intro, 'Which parts of the paper are new, which are cited, and where a reader checking the argument should spend time. References are links: hover to preview, click to jump.');
  return setTex(body, GUIDE_HTML).then(() => collapsibleHeadings(body, 'h3'));
}

const RENDER = { guide: renderGuide, graph: renderGraph, defs: renderDefs, notation: renderNotation, cited: renderCited, slips: renderSlips };
