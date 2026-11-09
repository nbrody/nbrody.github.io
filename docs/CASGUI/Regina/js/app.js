import * as E from './engine.js';
import * as Census from './census.js';
import {
  abelianTeX, laurentTeX, polyTeX, textPolyTeX, cyclotomicTeX, piTeX,
  presentationTeX, recognizedTeX, surfaceTeX, complexTeX,
} from './tex.js';
import { diagramSVG } from './diagram.js';
import { dualGraphSVG } from './dualgraph.js';
import * as NB from './notebook.js';
import { host as nbHost, Covers, Plot, Table, Abelian, tex as texVal } from './nbapi.js';
import { braidToPD } from './braid.js';
import { $, h, mixed, M, toast, copy, cssVar, busyEl, errEl, flag, card, section, plural } from './dom.js';

// ---------------------------------------------------------------- examples

const TRI_EXAMPLES = [
  { id: 'threeSphere', label: '$S^3$' },
  { id: 'poincare', label: 'Poincaré sphere' },
  { id: 'lens', label: 'Lens space $L(p,q)$', params: [['p', 7], ['q', 2]], name: (p) => `$L(${p[0]},${p[1]})$` },
  { id: 'weeks', label: 'Weeks manifold' },
  { id: 'weberSeifert', label: 'Weber–Seifert' },
  { id: 'figureEight', label: 'Figure-eight complement' },
  { id: 'whitehead', label: 'Whitehead link complement' },
  { id: 'trefoil', label: 'Trefoil complement' },
  { id: 'gieseking', label: 'Gieseking manifold' },
  { id: 's2xs1', label: '$S^2 \\times S^1$' },
  { id: 'rp2xs1', label: '$\\mathbb{R}P^2 \\times S^1$' },
  { id: 'threeTorus', label: '$T^3$' },
  { id: 'rp3rp3', label: '$\\mathbb{R}P^3 \\# \\mathbb{R}P^3$' },
  { id: 'sfsOverSphere', label: 'Seifert fibered over $S^2$', params: [['$a_1$', 2], ['$b_1$', -1], ['$a_2$', 3], ['$b_2$', 1], ['$a_3$', 5], ['$b_3$', 1]],
    name: (p) => `$SFS\\big(S^2 : (${p[0]},${p[1]}), (${p[2]},${p[3]}), (${p[4]},${p[5]})\\big)$` },
  { id: 'lst', label: 'Layered solid torus', params: [['a', 3], ['b', 4]], name: (p) => `$\\mathrm{LST}(${p[0]},${p[1]},${+p[0] + +p[1]})$` },
  { id: 'layeredLoop', label: 'Layered loop', params: [['length', 4], ['twisted', 0]], name: (p) => `Layered loop (${p[0]}${+p[1] ? ', twisted' : ''})` },
  { id: 'handlebody', label: 'Handlebody', params: [['genus', 2]], name: (p) => `Genus ${p[0]} handlebody` },
  { id: 'solidKleinBottle', label: 'Solid Klein bottle' },
  { id: 'idealGenusTwoHandlebody', label: 'Ideal genus 2 handlebody' },
  { id: 'smallClosedOrblHyperbolic', label: 'Small closed hyperbolic' },
  { id: 'smallClosedNonOrblHyperbolic', label: 'Small closed hyperbolic, non-orientable' },
  { id: 'bingsHouse', label: "Bing's house" },
];

const LINK_EXAMPLES = [
  { id: 'trefoilLeft', label: 'Left trefoil' },
  { id: 'trefoilRight', label: 'Right trefoil' },
  { id: 'figureEight', label: 'Figure-eight knot' },
  { id: 'torus', label: 'Torus link $T(p,q)$', params: [['p', 3], ['q', 5]], name: (p) => `Torus link $T(${p[0]},${p[1]})$` },
  { id: 'hopf', label: 'Hopf link' },
  { id: 'whitehead', label: 'Whitehead link' },
  { id: 'borromean', label: 'Borromean rings' },
  { id: 'conway', label: 'Conway knot' },
  { id: 'kinoshitaTerasaka', label: 'Kinoshita–Terasaka knot' },
  { id: 'gst', label: 'GST 48-crossing knot' },
  { id: 'monster', label: 'Monster unknot' },
  { id: 'gordian', label: 'Gordian unknot' },
  { id: 'unknot', label: 'Unknot' },
];

const TRI_HINTS = {
  isosig: ['Signature', 'e.g. cPcbbbiht', "Regina's isomorphism signature, as printed by tri.isoSig()."],
  census: ['Census name', 'e.g. m004, s912, L104001', 'Searches the cusped and closed hyperbolic censuses, Christy’s knot complements and the closed minimal censuses.'],
  dehydration: ['Dehydration string', 'e.g. baaaade', 'The Callahan–Hildebrand–Weeks dehydration notation.'],
};

const LINK_PLACEHOLDERS = {
  pd: 'PD[X[1, 4, 2, 5], X[3, 6, 4, 1], X[5, 2, 6, 3]]',
  dt: '4 6 2   or   bca',
  gauss: '1 -2 3 -1 2 -3',
  ogauss: '+>1 -<2 +>3 -<1 +>2 -<3',
  sig: 'dabcabcv-',
  braid: '1 1 1   or   s1 s2^-1 s1 s2^-1',
};

// ---------------------------------------------------------------- state

const state = { objs: [], cur: null, nextId: 1, mode: 'tri', nb: null };
const STORE = 'regina-gui-ws-v1';

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      objs: state.objs.map(({ kind, name, sig, size }) => ({ kind, name, sig, size })),
      cur: state.objs.findIndex((o) => o === state.cur),
    }));
  } catch {}
}

function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!data) return;
    for (const o of data.objs || []) addObj(o.kind, o.sig, o.name, o.size, false);
    if (data.cur >= 0 && state.objs[data.cur]) state.cur = state.objs[data.cur];
  } catch {}
}

function addObj(kind, sig, name, size, select = true) {
  const obj = { id: state.nextId++, kind, sig, name, size, cache: {}, tab: 'overview', ui: {} };
  state.objs.push(obj);
  if (select) selectObj(obj); else renderList();
  save();
  return obj;
}

function selectObj(obj) {
  state.cur = obj;
  state.nb = null;
  try { history.replaceState(null, '', obj ? `#${obj.kind}=${encodeURIComponent(obj.sig)}` : location.pathname); } catch {}
  renderList();
  renderNbList();
  renderView();
  save();
}

function removeObj(obj) {
  const i = state.objs.indexOf(obj);
  state.objs.splice(i, 1);
  if (state.cur === obj) selectObj(state.objs[Math.min(i, state.objs.length - 1)] || null);
  else { renderList(); save(); }
}

let untitled = 1;
async function loadTri(kind, text, params = '', name) {
  const r = await E.call('triLoad', kind, text, params);
  return addObj('tri', r.sig, name || `Triangulation ${untitled++}`, r.size);
}
async function loadLink(kind, text, params = '', name) {
  const r = await E.call('linkLoad', kind, text, params);
  return addObj('link', r.sig, name || `Link ${untitled++}`, r.crossings);
}

// ---------------------------------------------------------------- sidebar

function renderList() {
  const ul = $('#objs');
  ul.replaceChildren();
  for (const o of state.objs) {
    const li = h('li', { class: o === state.cur && !state.nb ? 'on' : '', onclick: () => selectObj(o), title: o.sig },
      h('span', { class: 'kind ' + o.kind }, o.kind === 'tri' ? 'T' : 'L'),
      h('div', {}, mixed(o.name, 'div', 'name'),
        h('div', { class: 'meta' }, o.kind === 'tri' ? `${o.size} tetrahedr${o.size === 1 ? 'on' : 'a'}` : `${o.size} crossing${o.size === 1 ? '' : 's'}`)),
      h('button', { class: 'x', title: 'Remove', 'aria-label': 'Remove', onclick: (e) => { e.stopPropagation(); removeObj(o); } }, '×'));
    ul.append(li);
  }
  $('#ws-empty').hidden = state.objs.length > 0;
  $('#ws-count').textContent = state.objs.length ? String(state.objs.length) : '';
}

function setMode(mode) {
  state.mode = mode;
  $('#mode-tri').setAttribute('aria-pressed', mode === 'tri');
  $('#mode-link').setAttribute('aria-pressed', mode === 'link');
  $('#new-tri').hidden = mode !== 'tri';
  $('#new-link').hidden = mode !== 'link';
}

function exampleChips(container, list, load) {
  container.replaceChildren();
  const paramsBox = h('div', { class: 'card', style: 'margin-top:10px', hidden: true });
  for (const ex of list) {
    container.append(h('button', {
      class: 'chip',
      onclick: () => {
        if (!ex.params) { paramsBox.hidden = true; return load(ex, []); }
        paramsBox.hidden = false;
        paramsBox.replaceChildren(
          mixed(ex.label, 'div', 'k'),
          h('div', { class: 'params' }, ex.params.map(([n, v]) =>
            h('label', {}, mixed(n), h('input', { type: 'number', value: v })))),
          h('button', {
            class: 'btn primary small', style: 'margin-top:10px',
            onclick: () => load(ex, [...paramsBox.querySelectorAll('input')].map((i) => i.value || '0')),
          }, 'Build'));
      },
    }, mixed(ex.label)));
  }
  container.after(paramsBox);
}

function triKindChanged() {
  const k = $('#tri-kind').value;
  const [label, ph, hint] = TRI_HINTS[k];
  $('#tri-text-label').textContent = label;
  $('#tri-text').placeholder = ph;
  $('#tri-hint').textContent = hint;
  $('#tri-load').textContent = k === 'census' ? 'Search censuses' : 'Load triangulation';
  $('#census-results').replaceChildren();
}

async function triLoadClicked() {
  const k = $('#tri-kind').value;
  const text = $('#tri-text').value.trim();
  if (!text) return toast('Enter something first');
  try {
    if (k === 'census') {
      const box = $('#census-results');
      box.replaceChildren(busyEl('Searching'));
      const hits = await Census.searchName(text);
      box.replaceChildren();
      if (!hits.length) { box.append(h('p', { class: 'hint' }, 'No census entry with that name.')); return; }
      if (hits.length === 1) { await loadTri('isosig', hits[0].sig, '', hits[0].name.replace(/\s*:\s*#1$/, '')); return; }
      for (const hit of hits) {
        box.append(h('button', {
          class: 'chip', title: hit.census.title,
          onclick: () => loadTri('isosig', hit.sig, '', hit.name).catch((e) => toast(e.message)),
        }, hit.name));
      }
      return;
    }
    await loadTri(k, text);
  } catch (e) { toast(e.message); }
}

async function linkLoadClicked() {
  const k = $('#link-kind').value;
  const text = $('#link-text').value.trim();
  if (!text) return toast('Enter a code first');
  try {
    if (k === 'braid') {
      const b = braidToPD(text);
      if (b.freeStrands) throw new Error('Every strand must cross something: drop the unused strands');
      await loadLink('pd', b.pd, '', `Closure of the braid ${text}`);
    } else await loadLink(k, text);
  } catch (e) { toast(e.message); }
}

async function openRga(buf, label) {
  try {
    const r = await E.call('openRga', new Uint8Array(buf));
    const items = r.items.slice(0, 200);
    if (!items.length) return toast('No 3-manifold triangulations or links in ' + label);
    let last;
    for (const it of items) last = addObj(it.kind, it.sig, it.label || label, it.size, false);
    selectObj(last === undefined ? null : state.objs[state.objs.length - items.length]);
    toast(`Opened ${items.length} object${items.length > 1 ? 's' : ''} from ${label}` + (r.items.length > 200 ? ' (first 200)' : ''));
  } catch (e) { toast(e.message); }
}

// ---------------------------------------------------------------- view

let renderToken = 0;
const live = (tok, obj) => tok === renderToken && state.cur === obj;

function renderView() {
  const view = $('#view');
  const obj = state.cur;
  renderToken++;
  view.replaceChildren();
  if (state.nb) {
    NB.renderNotebook(state.nb, view, { onDeleted: () => { state.nb = null; renderNbList(); renderView(); toast('Notebook deleted'); } });
    return;
  }
  if (!obj) return view.append(welcome());
  view.append(header(obj));
  const tabs = obj.kind === 'tri' ? TRI_TABS : LINK_TABS;
  if (!tabs.some((t) => t.id === obj.tab)) obj.tab = 'overview';
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  for (const t of tabs) {
    bar.append(h('button', {
      role: 'tab', 'aria-selected': t.id === obj.tab,
      onclick: () => { obj.tab = t.id; renderView(); },
    }, t.label));
  }
  const panel = h('div', { role: 'tabpanel' });
  view.append(bar, panel);
  const tab = tabs.find((t) => t.id === obj.tab);
  tab.render(obj, panel, renderToken);
}

function welcome() {
  const w = h('div', { class: 'welcome' },
    h('h2', {}, 'Regina, in the browser'),
    h('p', {}, 'Regina is software for low-dimensional topology: 3-manifold triangulations, normal surfaces, angle structures, and knots and links. This is the real Regina engine compiled to WebAssembly, so everything is computed on your machine.'),
    h('p', {}, 'Start with an example, or load your own signature, census name, knot code or Regina file from the panel on the right.'));
  const chips = h('div', { class: 'chips' });
  const quick = [
    ['Poincaré sphere', () => loadTri('example', 'poincare', '', 'Poincaré sphere')],
    ['Figure-eight complement', () => loadTri('example', 'figureEight', '', 'Figure-eight complement')],
    ['m004 from the census', () => loadTri('isosig', 'cPcbbbiht', '', 'm004')],
    ['Weeks manifold', () => loadTri('example', 'weeks', '', 'Weeks manifold')],
    ['Conway knot', () => loadLink('example', 'conway', '', 'Conway knot')],
    ['Borromean rings', () => loadLink('example', 'borromean', '', 'Borromean rings')],
  ];
  for (const [label, f] of quick) chips.append(h('button', { class: 'chip', onclick: () => f().catch((e) => toast(e.message)) }, label));
  w.append(chips);
  w.append(h('h3', { class: 'gallery-h' }, 'Example notebooks'),
    h('p', {}, 'Guided computations you can run, edit and extend. Each one is live code against the Regina engine.'));
  w.append(h('div', { class: 'gallery' }, NB.builtins().map((n) => h('button', { class: 'nb-card', onclick: () => openNotebook(n.id) },
    mixed(n.title, 'div', 'nb-card-title'), mixed(n.blurb, 'div', 'nb-card-blurb'),
    h('div', { class: 'nb-card-tags' }, (n.tags || []).map((t) => h('span', {}, t)))))));
  return w;
}

const TRI_OPS = [
  ['simplify', 'Simplify', 'simplified'],
  ['simplifyExhaustive', 'Exhaustive simplify', 'exhaustively simplified'],
  ['idealToFinite', 'Truncate ideal vertices', 'truncated'],
  ['finiteToIdeal', 'Cone boundary to ideal', 'ideal'],
  ['minimiseVertices', 'Minimize vertices', 'fewer vertices'],
  ['subdivide', 'Barycentric subdivision', 'subdivided'],
  ['puncture', 'Puncture', 'punctured'],
  ['doubleCover', 'Orientable double cover', 'double cover'],
  ['summands', 'Prime decomposition', 'summand'],
  ['components', 'Split components', 'component'],
];

const LINK_OPS = [
  ['simplify', 'Simplify', 'simplified'],
  ['simplifyExhaustive', 'Exhaustive simplify', 'exhaustively simplified'],
  ['reflect', 'Mirror', 'mirror'],
  ['reverse', 'Reverse', 'reversed'],
  ['changeAll', 'Change all crossings', 'crossings changed'],
  ['whiteheadDouble', 'Whitehead double', 'Whitehead double'],
  ['parallel', '2-cable', '2-cable'],
  ['complement', 'Complement', 'complement'],
];

async function runOp(obj, op, label, suffix) {
  try {
    if (obj.kind === 'tri') {
      const r = await E.call('triOp', obj.sig, op, op === 'simplifyExhaustive' ? 2 : 0);
      if (r.sigs) {
        if (!r.sigs.length) return toast(op === 'summands' ? 'This is the 3-sphere: there are no prime summands' : 'Empty triangulation');
        if (r.sigs.length === 1 && r.sigs[0] === obj.sig) return toast(op === 'summands' ? 'Already prime' : 'Already connected');
        let first;
        for (const [i, s] of r.sigs.entries()) {
          const t = await E.call('triLoad', 'isosig', s, '');
          const o = addObj('tri', t.sig, `${obj.name} · ${suffix} ${i + 1}`, t.size, false);
          first ??= o;
        }
        selectObj(first);
        return toast(`${r.sigs.length} ${suffix}${r.sigs.length > 1 ? 's' : ''}`);
      }
      if (!r.changed || r.sig === obj.sig) return toast('No change: Regina could not improve this one');
      addObj('tri', r.sig, `${obj.name} · ${suffix}`, r.size);
    } else {
      const r = await E.call('linkOp', obj.sig, op, op === 'parallel' ? 2 : op === 'whiteheadDouble' ? 1 : 1);
      if (r.triSig) return addObj('tri', r.triSig, `Complement of ${obj.name}`, r.size);
      if (!r.changed || r.sig === obj.sig) return toast(op.startsWith('simplify') ? 'No simpler diagram found' : 'No change');
      addObj('link', r.sig, `${obj.name} · ${suffix}`, r.crossings);
    }
  } catch (e) { toast(e.message); }
}

function header(obj) {
  const title = h('div', { class: 'obj-title' });
  const showTitle = () => {
    title.replaceChildren(mixed(obj.name, 'h2'),
      h('button', { class: 'btn quiet small', title: 'Rename', onclick: editTitle }, 'Rename'));
  };
  const editTitle = () => {
    const inp = h('input', { type: 'text', value: obj.name, 'aria-label': 'Name' });
    const done = () => { obj.name = inp.value.trim() || obj.name; save(); renderList(); showTitle(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = obj.name; inp.blur(); } });
    inp.addEventListener('blur', done);
    title.replaceChildren(inp);
    inp.focus(); inp.select();
  };
  showTitle();
  const sub = obj.kind === 'tri'
    ? `3-manifold triangulation · ${obj.size} tetrahedr${obj.size === 1 ? 'on' : 'a'}`
    : `Link diagram · ${obj.size} crossing${obj.size === 1 ? '' : 's'}`;
  const sig = h('div', { class: 'sig', title: obj.sig },
    h('span', {}, obj.sig),
    h('button', { onclick: () => copy(obj.sig, 'Signature copied') }, 'Copy'),
    h('button', { onclick: () => copy(location.href, 'Link copied') }, 'Share link'));
  const ops = h('div', { class: 'ops' });
  for (const [op, label, suffix] of obj.kind === 'tri' ? TRI_OPS : LINK_OPS) {
    ops.append(h('button', { class: 'btn small', onclick: () => runOp(obj, op, label, suffix) }, label));
  }
  ops.append(h('button', { class: 'btn small quiet', title: 'Start a notebook that loads this object', onclick: () => openNotebook(NB.create(obj.name.replace(/\$/g, '') + ' notebook', starterCells(obj))) }, 'Explore in a notebook'));
  return h('div', {},
    h('div', { class: 'obj-head' },
      h('div', { style: 'min-width:0;flex:1' }, title, h('div', { class: 'sub' }, sub)),
      sig),
    h('div', { style: 'margin:-4px 0 18px' }, ops));
}

// Run an engine call for a tab, cached on the object.
async function cached(obj, key, fn) {
  if (obj.cache[key] !== undefined) return obj.cache[key];
  const v = await fn();
  obj.cache[key] = v;
  return v;
}

// ---------------------------------------------------------------- triangulation tabs

const TRI_TABS = [
  { id: 'overview', label: 'Overview', render: triOverview },
  { id: 'skeleton', label: 'Skeleton', render: triSkeleton },
  { id: 'group', label: 'Fundamental group', render: triGroupTab },
  { id: 'surfaces', label: 'Normal surfaces', render: triSurfaces },
  { id: 'angles', label: 'Angle structures', render: triAngles },
  { id: 'hyperbolic', label: 'Hyperbolic structure', render: triHyperbolic },
  { id: 'tv', label: 'Turaev–Viro', render: triTV },
  { id: 'covers', label: 'Covers', render: (o, p, t) => coversTab('tri', o, p, t) },
];

// Index-k subgroups of the fundamental group, i.e. connected k-sheeted covers.
function coversTab(kind, obj, panel, tok) {
  const ui = obj.ui.cov ??= { k: 3 };
  const kSel = sel('ck', [2, 3, 4, 5, 6, 7].map((k) => [String(k), `Index ${k}`]), String(ui.k));
  const out = h('div');
  const show = async (compute) => {
    ui.k = +kSel.value;
    const key = 'cov' + ui.k;
    if (!compute && obj.cache[key] === undefined) return;
    out.replaceChildren(busyEl(`Enumerating subgroups of index ${ui.k}`));
    try {
      const r = await cached(obj, key, () => E.call('groupCovers', kind, obj.sig, ui.k));
      if (live(tok, obj)) out.replaceChildren(new Covers(r).render());
    } catch (e) { if (live(tok, obj)) out.replaceChildren(errEl(e, () => show(true))); }
  };
  panel.append(h('div', { class: 'row' }, h('div', { style: 'width:160px' }, kSel), h('button', { class: 'btn primary', onclick: () => show(true) }, 'Enumerate')));
  panel.append(mixed('Each transitive action of $\\pi_1$ on $k$ points (up to relabeling) gives a subgroup of index $k$ and a connected $k$-sheeted cover. The list of their homology groups is an invariant of the group, good at telling manifolds and knots apart. The cost grows like $(k!)^g$ for $g$ generators, so start small.', 'p', 'note'));
  panel.append(out);
  show(false);
}

function summaryOf(obj) { return cached(obj, 'summary', () => E.call('triSummary', obj.sig)); }

const LINK_NAMES = { sphere: 'sphere', disc: 'disc', torus: 'torus', klein: 'Klein bottle', cusp: 'non-standard cusp', invalid: 'invalid' };

async function triOverview(obj, panel, tok) {
  panel.append(busyEl());
  let s;
  try { s = await summaryOf(obj); } catch (e) { return live(tok, obj) && panel.replaceChildren(errEl(e, renderView)); }
  if (!live(tok, obj)) return;
  panel.replaceChildren();

  const grid = h('div', { class: 'grid' });
  grid.append(card('Tetrahedra', s.size));
  grid.append(card('Skeleton', `${plural(s.vertices, 'vertex', 'vertices')}, ${plural(s.edges, 'edge')}, ${plural(s.triangles, 'triangle')}`));
  if (s.h1) grid.append(card('First homology', M(`H_1 = ${abelianTeX(s.h1)}`)));
  if (s.h2) grid.append(card('Second homology', M(`H_2 = ${abelianTeX(s.h2)}`)));
  if (s.eulerManifold !== undefined) grid.append(card('Euler characteristic', M(`\\chi = ${s.eulerManifold}`)));
  const cusps = s.vertexList.filter((v) => v.link === 'torus' || v.link === 'klein').length;
  grid.append(card('Boundary', s.boundaryComponents === 0 ? 'closed'
    : [cusps ? `${cusps} cusp${cusps > 1 ? 's' : ''}` : null,
      s.realBoundary ? `${s.boundaryComponents - cusps} real boundary component${s.boundaryComponents - cusps === 1 ? '' : 's'}` : null]
      .filter(Boolean).join(', ') || `${s.boundaryComponents} components`));
  panel.append(grid);

  panel.append(section('Properties', null, h('div', { class: 'flags' },
    flag('Valid', s.valid), flag('Closed', s.closed), flag('Orientable', s.orientable),
    flag('Connected', s.connected), flag('Ideal vertices', s.ideal), flag('Real boundary', s.realBoundary),
    flag('Standard', s.standard))));

  // Census
  const censusBox = h('div', {}, busyEl('Looking up the censuses'));
  panel.append(section('Census', 'exact triangulation match', censusBox));
  cached(obj, 'census', () => Census.lookup(obj.sig)).then((hits) => {
    if (!live(tok, obj)) return;
    censusBox.replaceChildren();
    if (!hits.length) {
      censusBox.append(h('p', { class: 'note' }, 'Not found. Census lookups only match the exact triangulation, so try Simplify and look again.'));
      return;
    }
    const tbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Census'))),
      h('tbody', {}, hits.map((x) => h('tr', {}, h('td', {}, x.name), h('td', {}, x.census.title)))));
    censusBox.append(h('div', { class: 'tablewrap' }, tbl));
    if (/^Triangulation \d+$/.test(obj.name)) {
      obj.name = hits[0].name.replace(/\s*:\s*#\d+$/, '');
      save(); renderList();
      const t = $('.obj-title h2'); if (t) t.replaceWith(mixed(obj.name, 'h2'));
    }
  }).catch((e) => live(tok, obj) && censusBox.replaceChildren(errEl(e)));

  // Recognition
  const recBox = h('div', {}, busyEl('Recognizing'));
  panel.append(section('Recognition', 'standard triangulations Regina knows by name', recBox));
  cached(obj, 'recog', () => E.call('triRecognize', obj.sig)).then((r) => {
    if (!live(tok, obj)) return;
    recBox.replaceChildren();
    if (!r.triangulation) return recBox.append(h('p', { class: 'note' }, 'Not one of Regina’s standard triangulations. The tests below and the census can still identify it.'));
    const g = h('div', { class: 'grid' });
    g.append(card('Triangulation', M(r.triangulationTex || r.triangulation)));
    if (r.manifold) g.append(card('Manifold', M(r.manifoldTex || r.manifold)));
    recBox.append(g);
  }).catch((e) => live(tok, obj) && recBox.replaceChildren(errEl(e)));

  // Decision tests
  const tests = [
    ['sphere', '3-sphere', '$S^3$?', s.closed && s.valid],
    ['ball', '3-ball', '3-ball?', s.realBoundary && s.valid],
    ['solidTorus', 'Solid torus', 'Solid torus?', s.valid && !s.closed],
    ['txi', 'T × I', '$T^2 \\times I$?', s.valid && !s.closed],
    ['handlebody', 'Handlebody', 'Handlebody?', s.valid && !s.closed && s.orientable],
    ['irreducible', 'Irreducible', 'Irreducible?', s.valid && s.closed && s.orientable && s.connected],
    ['haken', 'Haken', 'Haken?', s.valid && s.closed && s.orientable && s.connected],
    ['compressingDisc', 'Compressing disc', 'Has a compressing disc?', s.valid && !s.closed],
    ['zeroEfficient', '0-efficient', '0-efficient?', s.valid],
    ['oneEfficient', '1-efficient', '1-efficient?', s.valid && s.ideal],
    ['strictAngle', 'Strict angle structure', 'Strict angle structure?', s.valid],
  ].filter((t) => t[3]);
  obj.cache.props ??= {};
  const grid2 = h('div', { class: 'tests' });
  const runOne = async (id, cell) => {
    cell.replaceChildren(h('span', { class: 'spinner' }));
    try {
      const r = await E.call('triProp', obj.sig, id);
      obj.cache.props[id] = r.value;
    } catch (e) { obj.cache.props[id] = { error: e.message }; }
    if (live(tok, obj)) showRes(id, cell);
  };
  const showRes = (id, cell) => {
    const v = obj.cache.props[id];
    cell.replaceChildren();
    if (v && v.error) cell.append(h('span', { class: 'res no', title: v.error }, v.error === 'Stopped' ? 'stopped' : 'n/a'));
    else if (id === 'handlebody') cell.append(h('span', { class: 'res ' + (v >= 0 ? 'yes' : 'no') }, v >= 0 ? `yes, genus ${v}` : 'no'));
    else cell.append(h('span', { class: 'res ' + (v ? 'yes' : 'no') }, v ? 'yes' : 'no'));
  };
  const cells = [];
  for (const [id, , label] of tests) {
    const cell = h('span');
    if (obj.cache.props[id] !== undefined) showRes(id, cell);
    else cell.append(h('button', { class: 'btn small', onclick: () => runOne(id, cell) }, 'Test'));
    cells.push([id, cell]);
    grid2.append(h('div', { class: 'test' }, mixed(label), cell));
  }
  const runAll = h('button', { class: 'btn small', onclick: async () => {
    for (const [id, cell] of cells) if (obj.cache.props[id] === undefined) await runOne(id, cell);
  } }, 'Run all');
  panel.append(section('Decision tests', 'these can be slow on large triangulations', grid2, h('div', { style: 'margin-top:10px' }, runAll)));
}

async function triSkeleton(obj, panel, tok) {
  panel.append(busyEl());
  let s;
  try { s = await summaryOf(obj); } catch (e) { return live(tok, obj) && panel.replaceChildren(errEl(e, renderView)); }
  if (!live(tok, obj)) return;
  panel.replaceChildren();

  if (s.size <= 80) {
    const fig = h('div', { class: 'figure', html: dualGraphSVG(s.gluings, {
      accent: cssVar('--accent'), ink: cssVar('--text'), muted: cssVar('--muted'), nodeFill: cssVar('--bg'),
    }) });
    panel.append(section('Face pairing graph', 'one node per tetrahedron, one edge per glued pair of faces; dashed stubs are boundary faces', fig));
  }

  const head = h('tr', {}, h('th', {}, 'Tetrahedron'), ['012', '013', '023', '123'].map((f) => h('th', {}, 'Face ' + f)));
  const rows = s.gluings.map((row, t) => h('tr', {}, h('td', { class: 'num' }, t),
    row.map((g) => h('td', { class: 'mono' }, g ? `${g.tet} (${g.img})` : 'boundary'))));
  panel.append(section('Gluing table', 'each cell: the adjacent tetrahedron and the images of the face’s three vertices',
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, head), h('tbody', {}, rows)))));

  const vt = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Vertex'), h('th', {}, 'Degree'), h('th', {}, 'Link'), h('th', {}, 'Link Euler characteristic'))),
    h('tbody', {}, s.vertexList.map((v, i) => h('tr', {}, h('td', { class: 'num' }, i), h('td', { class: 'num' }, v.degree),
      h('td', {}, LINK_NAMES[v.link] + (v.link === 'torus' || v.link === 'klein' ? ' (ideal)' : '')), h('td', { class: 'num' }, v.linkEuler)))));
  panel.append(section('Vertices', null, h('div', { class: 'tablewrap' }, vt)));

  const degs = new Map();
  for (const e of s.edgeList) degs.set(e.degree, (degs.get(e.degree) || 0) + 1);
  const et = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Edge'), h('th', {}, 'Degree'), h('th', {}, 'Boundary'), h('th', {}, 'Valid'))),
    h('tbody', {}, s.edgeList.map((e, i) => h('tr', {}, h('td', { class: 'num' }, i), h('td', { class: 'num' }, e.degree),
      h('td', {}, e.boundary ? 'yes' : ''), h('td', {}, e.valid ? '' : 'invalid')))));
  panel.append(section('Edges', [...degs].sort((a, b) => a[0] - b[0]).map(([d, k]) => `${k}× degree ${d}`).join(' · '),
    h('div', { class: 'tablewrap' }, et)));

  const g = h('div', { class: 'grid' });
  if (s.dehydration) g.append(card('Dehydration', h('span', { class: 'mono' }, s.dehydration)));
  g.append(card('Triangulation Euler characteristic', M(`\\chi_{\\mathrm{tri}} = ${s.eulerTri}`)));
  if (s.h2z2 !== undefined) g.append(card('Second homology mod 2', M(`\\dim H_2(M;\\mathbb{Z}_2) = ${s.h2z2}`)));
  panel.append(section('Other data', null, g));
}

function groupView(g, h1) {
  const box = h('div');
  box.append(h('div', { class: 'card' }, h('div', { class: 'k' }, `Presentation · ${g.generators} generator${g.generators === 1 ? '' : 's'}, ${g.relations} relation${g.relations === 1 ? '' : 's'}`),
    h('div', { class: 'math-block' }, M(presentationTeX(g.text), true))));
  const rec = recognizedTeX(g.recognized);
  const grid = h('div', { class: 'grid', style: 'margin-top:12px' });
  if (rec) {
    const c = card('Recognized as', M(rec.tex));
    if (rec.monoTeX) c.append(h('div', { class: 'k', style: 'margin-top:6px' }, 'with monodromy ', M(rec.monoTeX)));
    grid.append(c);
  } else grid.append(card('Recognized as', 'not a group Regina can name'));
  if (h1) grid.append(card('Abelianization', M(abelianTeX(h1))));
  box.append(grid);
  box.append(h('p', { class: 'note' }, 'Regina simplifies the presentation but does not guarantee it is as small as possible. Group recognition is heuristic: an unnamed group is not a proof of anything.'));
  return box;
}

async function triGroupTab(obj, panel, tok) {
  panel.append(busyEl());
  try {
    const [g, s] = await Promise.all([cached(obj, 'group', () => E.call('triGroup', obj.sig)), summaryOf(obj)]);
    if (!live(tok, obj)) return;
    panel.replaceChildren(groupView(g, s.h1));
  } catch (e) { if (live(tok, obj)) panel.replaceChildren(errEl(e, renderView)); }
}

function sel(id, options, value) {
  return h('select', { id }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
}

async function triSurfaces(obj, panel, tok) {
  const ui = obj.ui.surf ??= { coords: 'standard', which: 'vertex', selected: null };
  const coords = sel('nc', [['standard', 'Standard (triangles and quads)'], ['quad', 'Quadrilateral'], ['quadClosed', 'Quadrilateral, closed only']], ui.coords);
  const which = sel('nw', [['vertex', 'Vertex surfaces'], ['fundamental', 'Fundamental surfaces']], ui.which);
  const go = h('button', { class: 'btn primary', onclick: () => { ui.coords = coords.value; ui.which = which.value; ui.selected = null; show(true); } }, 'Enumerate');
  panel.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, coords), h('div', { class: 'grow' }, which), go));
  panel.append(h('p', { class: 'note' }, 'Embedded normal surfaces, enumerated by Regina’s double description and tree traversal algorithms. Quadrilateral coordinates on an ideal triangulation can give spun-normal surfaces.'));
  const out = h('div');
  panel.append(out);

  const show = async (compute) => {
    const key = `surf:${ui.coords}:${ui.which}`;
    if (!compute && obj.cache[key] === undefined) return;
    out.replaceChildren(busyEl('Enumerating normal surfaces'));
    let r;
    try { r = await cached(obj, key, () => E.call('surfaces', obj.sig, ui.coords, ui.which, 3000)); }
    catch (e) { return live(tok, obj) && out.replaceChildren(errEl(e, () => show(true))); }
    if (!live(tok, obj)) return;
    out.replaceChildren();
    const quad = ui.coords !== 'standard';
    out.append(section(`${r.count} ${ui.which} surface${r.count === 1 ? '' : 's'}`, r.list.length < r.count ? `showing the first ${r.list.length}` : null));
    const detail = h('div');
    const rows = r.list.map((s, i) => {
      const coordsTxt = chunks(s.coords, quad ? 3 : 7).map((c) => c.join(' ')).join(' | ');
      const tr = h('tr', { class: 'clickable' + (ui.selected === i ? ' on' : ''), onclick: () => { ui.selected = i; [...tr.parentNode.children].forEach((x) => x.classList.remove('on')); tr.classList.add('on'); showDetail(i); } },
        h('td', { class: 'num' }, i),
        h('td', {}, M(surfaceTeX(s))),
        h('td', { class: 'num' }, s.euler ?? '—'),
        h('td', {}, yn(s.orientable)), h('td', {}, yn(s.twoSided)), h('td', {}, yn(s.boundary)),
        h('td', {}, s.vertexLink ? 'vertex link' : s.splitting ? 'splitting' : s.central ? 'central' : ''),
        r.slopes ? h('td', {}, slopesEl(s.slopes)) : null,
        h('td', { class: 'mono', title: coordsTxt }, coordsTxt.length > 70 ? coordsTxt.slice(0, 70) + '…' : coordsTxt));
      return tr;
    });
    out.lastChild.append(h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['#', 'Surface', M('\\chi'), 'Orientable', 'Two-sided', 'Boundary', 'Notes', r.slopes ? 'Boundary slope' : null, quad ? 'Quad coordinates' : 'Coordinates (4 triangles, 3 quads per tetrahedron)'].filter(Boolean).map((x) => h('th', {}, x)))),
      h('tbody', {}, rows))));
    out.append(detail);

    const showDetail = (i) => {
      const s = r.list[i];
      const res = h('div', { class: 'flags', style: 'margin-top:10px' });
      const act = (op, label) => h('button', { class: 'btn small', onclick: async () => {
        try {
          const x = await E.call('surfaceOp', obj.sig, ui.coords, ui.which, i, op);
          if (x.sig) addObj('tri', x.sig, `${obj.name} · ${op === 'cut' ? 'cut along' : 'crushed along'} surface ${i}`, x.size);
          else res.append(h('span', { class: 'flag ' + (x.value ? 'yes' : 'no') }, `${label}: ${x.value ? 'yes' : 'no'}`));
        } catch (e) { toast(e.message); }
      } }, label);
      detail.replaceChildren(section(`Surface ${i}`, null,
        h('div', { class: 'grid' },
          card('Type', M(surfaceTeX(s))),
          s.euler !== undefined ? card('Euler characteristic', M(`\\chi = ${s.euler}`)) : null,
          s.boundaries !== undefined ? card('Boundary curves', s.boundaries) : null),
        h('div', { class: 'card full', style: 'margin-top:12px' }, h('div', { class: 'k' }, 'Coordinates'),
          h('div', { class: 'mono', style: 'word-break:break-all;margin-top:4px' }, chunks(s.coords, quad ? 3 : 7).map((c, t) => `tet ${t}: ${c.join(' ')}`).join('    '))),
        s.edgeWeights.length ? h('div', { class: 'card full', style: 'margin-top:12px' }, h('div', { class: 'k' }, 'Edge weights'),
          h('div', { class: 'mono', style: 'word-break:break-all;margin-top:4px' }, s.edgeWeights.join(' '))) : null,
        h('div', { class: 'ops', style: 'margin-top:12px' },
          s.compact ? act('cut', 'Cut along') : null,
          s.compact ? act('crush', 'Crush') : null,
          s.compact && s.twoSided ? act('incompressible', 'Incompressible') : null,
          s.compact ? act('compressingDisc', 'Compressing disc') : null),
        res));
    };
    if (ui.selected !== null && r.list[ui.selected]) showDetail(ui.selected);
  };
  show(false);
}

// Boundary slopes of a spun-normal surface, one per cusp: -L/M from Regina's
// (M, L) intersection numbers with SnapPea's meridian and longitude.
function slopesEl(rows) {
  if (!rows || !rows.length) return '';
  const g = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const one = ([m, l]) => {
    if (m === 0 && l === 0) return '—';
    let p = -l, q = m;
    if (q < 0) { p = -p; q = -q; }
    if (q === 0) return M('\\infty');
    const d = g(p, q); p /= d; q /= d;
    return M(q === 1 ? String(p) : `${p < 0 ? '-' : ''}\\tfrac{${Math.abs(p)}}{${q}}`);
  };
  return h('span', {}, rows.map(one).reduce((a, el, i) => (i ? [...a, ', ', el] : [el]), []));
}

function chunks(a, k) { const o = []; for (let i = 0; i < a.length; i += k) o.push(a.slice(i, i + k)); return o; }
function yn(v) { return v === undefined ? '—' : v ? 'yes' : 'no'; }

async function triAngles(obj, panel, tok) {
  const ui = obj.ui.ang ??= { taut: false, selected: null };
  const which = sel('aw', [['all', 'Vertex angle structures'], ['taut', 'Taut angle structures only']], ui.taut ? 'taut' : 'all');
  const go = h('button', { class: 'btn primary', onclick: () => { ui.taut = which.value === 'taut'; ui.selected = null; show(true); } }, 'Enumerate');
  panel.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, which), go));
  panel.append(mixed('Angle structures assign angles (as multiples of $\\pi$) to the three pairs of opposite edges in each tetrahedron so that each tetrahedron’s angles sum to $\\pi$ and each edge’s angles sum to 2$\\pi$. The vertex structures span the whole polytope.', 'p', 'note'));
  const out = h('div');
  panel.append(out);
  const show = async (compute) => {
    const key = `ang:${ui.taut}`;
    if (!compute && obj.cache[key] === undefined) return;
    out.replaceChildren(busyEl('Enumerating angle structures'));
    let r;
    try { r = await cached(obj, key, () => E.call('angles', obj.sig, ui.taut, 2000)); }
    catch (e) { return live(tok, obj) && out.replaceChildren(errEl(e, () => show(true))); }
    if (!live(tok, obj)) return;
    out.replaceChildren();
    out.append(section(`${r.count} ${ui.taut ? 'taut' : 'vertex'} angle structure${r.count === 1 ? '' : 's'}`, null,
      h('div', { class: 'flags' }, flag('', r.spansStrict, '\\text{Strict structure exists}'), flag('', r.spansTaut, '\\text{Taut structure exists}'))));
    const detail = h('div');
    const rows = r.list.map((a, i) => {
      const tr = h('tr', { class: 'clickable' + (ui.selected === i ? ' on' : ''), onclick: () => { ui.selected = i; [...tr.parentNode.children].forEach((x) => x.classList.remove('on')); tr.classList.add('on'); showDetail(i); } },
        h('td', { class: 'num' }, i), h('td', {}, yn(a.strict)), h('td', {}, yn(a.taut)), h('td', {}, yn(a.veering)),
        h('td', {}, a.angles.slice(0, 4).map((t) => M(`(${t.map(piTeX).join(', ')})`)).reduce((acc, el, k) => { if (k) acc.push(' '); acc.push(el); return acc; }, []), a.angles.length > 4 ? ' …' : ''));
      return tr;
    });
    if (r.list.length) {
      out.append(h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['#', 'Strict', 'Taut', 'Veering', 'Angles by tetrahedron'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows))));
    }
    out.append(detail);
    const showDetail = (i) => {
      const a = r.list[i];
      const t = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Tetrahedron'), ['01 / 23', '02 / 13', '03 / 12'].map((x) => h('th', {}, 'Edges ' + x)))),
        h('tbody', {}, a.angles.map((row, k) => h('tr', {}, h('td', { class: 'num' }, k), row.map((v) => h('td', {}, M(piTeX(v))))))));
      detail.replaceChildren(section(`Angle structure ${i}`, [a.strict && 'strict', a.taut && 'taut', a.veering && 'veering'].filter(Boolean).join(', ') || 'neither strict nor taut',
        h('div', { class: 'tablewrap' }, t)));
    };
    if (ui.selected !== null && r.list[ui.selected]) showDetail(ui.selected);
  };
  show(false);
}

const SOLUTIONS = ['not attempted', 'geometric', 'non-geometric', 'flat', 'degenerate', 'other', 'no solution', 'externally computed'];

async function triHyperbolic(obj, panel, tok) {
  panel.append(busyEl('Asking SnapPea for a hyperbolic structure'));
  const s = await summaryOf(obj).catch(() => null);
  if (!live(tok, obj)) return;
  if (s && !(s.valid && s.vertexList.length && s.vertexList.every((v) => v.link === 'torus' || v.link === 'klein'))) {
    panel.replaceChildren(h('p', { class: 'note' }, s.closed
      ? 'SnapPea works with ideal triangulations, where every vertex is a torus or Klein bottle cusp. For a closed manifold, start from a cusped manifold (an example, a census entry or a knot complement) and use Dehn filling here.'
      : 'SnapPea works with ideal triangulations, where every vertex is a torus or Klein bottle cusp. For a triangulation with real boundary, try “Cone boundary to ideal” first.'));
    return;
  }
  let r;
  try { r = await cached(obj, 'snap', () => E.call('triSnap', obj.sig)); }
  catch (e) { return live(tok, obj) && panel.replaceChildren(errEl(e, renderView)); }
  if (!live(tok, obj)) return;
  panel.replaceChildren();
  if (r.null) {
    panel.append(h('p', { class: 'note' }, 'SnapPea could not use this triangulation. It needs a valid triangulation whose vertices are all ideal (torus or Klein bottle cusps), or a closed triangulation that SnapPea can handle. Try “Cone boundary to ideal” for a bounded triangulation.'));
    return;
  }
  const grid = h('div', { class: 'grid' });
  grid.append(card('Solution type', SOLUTIONS[r.solution] ?? String(r.solution)));
  grid.append(card('Volume', h('span', { class: 'mono' }, r.volume == null ? '—' : r.volume.toFixed(12))));
  grid.append(card('Cusps', r.cusps));
  if (r.homologyFilled) grid.append(card('Homology of the filled manifold', M(abelianTeX(r.homologyFilled))));
  panel.append(grid);
  panel.append(h('p', { class: 'note' }, 'These numbers come from the SnapPea kernel inside Regina and are floating point, not certified. Volume is meaningful when the solution is geometric.'));

  if (r.cusps > 0) {
    const cusp = h('select', {}, [...Array(r.cusps).keys()].map((c) => h('option', { value: c }, `Cusp ${c}`)));
    const m = h('input', { type: 'number', value: 1, 'aria-label': 'meridian coefficient' });
    const l = h('input', { type: 'number', value: 1, 'aria-label': 'longitude coefficient' });
    const go = h('button', { class: 'btn primary', onclick: async () => {
      try {
        const f = await E.call('triFill', obj.sig, +m.value, +l.value, +cusp.value);
        addObj('tri', f.sig, `${obj.name}(${m.value}, ${l.value})`, f.size);
        toast(`Filled: ${SOLUTIONS[f.solution]} solution${f.volume > 0 ? `, volume ${f.volume.toFixed(6)}` : ''}`);
      } catch (e) { toast(e.message); }
    } }, 'Fill');
    panel.append(section('Dehn filling', 'fill a cusp along the slope (m, l) in SnapPea’s meridian–longitude basis; the result is a new triangulation',
      h('div', { class: 'row' }, r.cusps > 1 ? cusp : null,
        h('label', { class: 'row' }, M('m ='), h('div', { style: 'width:90px' }, m)),
        h('label', { class: 'row' }, M('\\ell ='), h('div', { style: 'width:90px' }, l)), go)));
  }

  if (r.cusps > 0) {
    // Symmetries from the canonical cell decomposition.
    const symBox = h('div');
    const showSym = (c) => {
      const g = h('div', { class: 'grid' });
      g.append(card('Isometries', String(c.symmetries)));
      if (c.orientable) {
        g.append(card('Orientation-preserving', String(c.preserving)));
        g.append(card('Amphichiral', c.reversing > 0 ? 'yes' : 'no'));
      }
      g.append(card('Canonical triangulation', `${plural(c.size, 'tetrahedron', 'tetrahedra')}`));
      symBox.replaceChildren(g, h('div', { class: 'ops', style: 'margin-top:10px' },
        c.sig === obj.sig ? h('span', { class: 'note' }, 'This is already the canonical triangulation.')
          : h('button', { class: 'btn small', onclick: () => addObj('tri', c.sig, `${obj.name} · canonical`, c.size) }, 'Open the canonical triangulation')));
    };
    const runSym = async () => {
      symBox.replaceChildren(busyEl('Canonizing'));
      try { const c = await cached(obj, 'canon', () => E.call('triCanon', obj.sig)); if (live(tok, obj)) showSym(c); }
      catch (e) { if (live(tok, obj)) symBox.replaceChildren(errEl(e, runSym)); }
    };
    if (obj.cache.canon) showSym(obj.cache.canon);
    else symBox.append(h('button', { class: 'btn small', onclick: runSym }, 'Compute symmetries'));
    panel.append(section('Symmetries', 'from SnapPea’s canonical (Epstein–Penner) cell decomposition, whose automorphisms are the isometries; two cusped hyperbolic manifolds are homeomorphic exactly when their canonical triangulations match', symBox));

    // A survey of many fillings at once.
    const ui = obj.ui.survey ??= { p: 8, q: 3, cusp: 0 };
    const pIn = h('input', { type: 'number', value: ui.p, min: 1, 'aria-label': 'largest |m|' });
    const qIn = h('input', { type: 'number', value: ui.q, min: 1, max: 12, 'aria-label': 'largest l' });
    const cuspSel = h('select', {}, [...Array(r.cusps).keys()].map((c) => h('option', { value: c, selected: c === ui.cusp }, `Cusp ${c}`)));
    const out = h('div');
    const survey = async () => {
      ui.p = Math.max(1, Math.min(60, +pIn.value || 1)); ui.q = Math.max(1, Math.min(12, +qIn.value || 1)); ui.cusp = +cuspSel.value;
      const slopes = [[1, 0]];
      const g = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
      for (let q = 1; q <= ui.q; q++) for (let p = -ui.p; p <= ui.p; p++) if (g(p, q) === 1) slopes.push([p, q]);
      out.replaceChildren(busyEl(`Filling ${slopes.length} slopes`));
      let res;
      try { res = await E.call('triFillMany', obj.sig, slopes.map((s) => s.join(',')).join(';'), ui.cusp); }
      catch (e) { return live(tok, obj) && out.replaceChildren(errEl(e, survey)); }
      if (!live(tok, obj)) return;
      const rows = res.list.map((x) => ({
        slope: texVal(`(${x.m}, ${x.l})`), type: x.ok ? SOLUTIONS[x.solution] : 'not allowed',
        volume: x.ok && (x.solution === 1 || x.solution === 2) ? x.volume : null,
        homology: x.h1 ? new Abelian(x.h1) : null, m: x.m, l: x.l,
      }));
      const exceptional = rows.filter((x) => x.type !== 'geometric' && x.type !== 'not allowed');
      const byQ = {};
      for (const x of rows) if (x.volume && x.l > 0 && x.l <= 4) (byQ['q = ' + x.l] ??= []).push([x.m / x.l, x.volume, `(${x.m}, ${x.l})`]);
      out.replaceChildren(
        h('p', { class: 'note' }, `${plural(exceptional.length, 'slope')} with no hyperbolic structure found: `,
          exceptional.map((x) => M(`(${x.m}, ${x.l})`)).reduce((a, el, i) => (i ? [...a, ', ', el] : [el]), [])),
        h('div', { style: 'margin-top:12px' }, new Plot(byQ, { x: 'slope $m/\\ell$', y: 'volume', hlines: r.volume ? [{ y: r.volume, label: 'unfilled volume' }] : [] }).render()),
        h('div', { style: 'margin-top:12px' }, new Table(rows, { columns: ['slope', 'type', 'volume', 'homology'] }).render()));
    };
    panel.append(section('Filling survey', 'SnapPea’s structure on many Dehn fillings at once; exceptional slopes are those with no hyperbolic structure (SnapPea is numerical, so treat borderline cases with care)',
      h('div', { class: 'row' }, r.cusps > 1 ? cuspSel : null,
        h('label', { class: 'row' }, M('|m| \\le'), h('div', { style: 'width:80px' }, pIn)),
        h('label', { class: 'row' }, M('1 \\le \\ell \\le'), h('div', { style: 'width:80px' }, qIn)),
        h('button', { class: 'btn primary', onclick: survey }, 'Survey')), out));
  }

  const rows = r.shapes.map((z, i) => h('tr', {}, h('td', { class: 'num' }, i), h('td', {}, M(`z_{${i}} = ${complexTeX(z.re, z.im)}`))));
  panel.append(section('Tetrahedron shapes', 'shape parameters for edges 01 and 23',
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Tetrahedron'), h('th', {}, 'Shape'))), h('tbody', {}, rows)))));
}

async function triTV(obj, panel, tok) {
  const s = await summaryOf(obj).catch(() => null);
  if (!live(tok, obj)) return;
  if (s && !(s.closed && s.valid)) {
    panel.append(h('p', { class: 'note' }, 'Turaev–Viro invariants are defined here for closed, valid triangulations only.'));
    return;
  }
  const ui = obj.ui.tv ??= { r: 5, parity: true };
  const r = h('input', { type: 'number', value: ui.r, min: 3, 'aria-label': 'r' });
  const root = sel('tvroot', [['1', 'Primitive 2r-th root of unity'], ['0', 'Primitive r-th root of unity (odd r only)']], ui.parity ? '1' : '0');
  const results = h('div');
  const go = h('button', { class: 'btn primary', onclick: async () => {
    ui.r = Math.max(3, parseInt(r.value, 10) || 3); ui.parity = root.value === '1';
    const key = `tv:${ui.r}:${ui.r % 2 ? ui.parity : true}`;
    const holder = h('div', {}, busyEl(`Computing the invariant for r = ${ui.r}`));
    results.prepend(holder);
    try {
      const v = await cached(obj, key, () => E.call('triTV', obj.sig, ui.r, ui.parity));
      obj.ui.tvList ??= [];
      if (!obj.ui.tvList.includes(key)) obj.ui.tvList.unshift(key);
      if (live(tok, obj)) drawList();
    } catch (e) { holder.replaceChildren(errEl(e)); }
  } }, 'Compute');
  panel.append(h('div', { class: 'row' }, h('label', { class: 'row' }, M('r ='), h('div', { style: 'width:90px' }, r)), h('div', { class: 'grow' }, root), go));
  panel.append(h('p', { class: 'note' }, 'Exact values live in the cyclotomic field named in each row. The cost grows quickly with r and with the number of tetrahedra; Stop restarts the engine if it runs too long.'));
  panel.append(results);
  const drawList = () => {
    results.replaceChildren();
    const keys = obj.ui.tvList || [];
    if (!keys.length) return;
    const rows = keys.map((k) => {
      const [, rr, par] = k.split(':');
      const v = obj.cache[k];
      return h('tr', {}, h('td', {}, M(`r = ${rr}`)), h('td', {}, +rr % 2 ? (par === 'true' ? '2r-th root' : 'r-th root') : '2r-th root'),
        h('td', {}, M(cyclotomicTeX(v.exact, v.field))), h('td', { class: 'mono' }, v.approx.toFixed(10)));
    });
    results.append(h('div', { class: 'tablewrap', style: 'margin-top:14px' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, M('q_0')), h('th', {}, 'Exact value'), h('th', {}, 'Numerical value'))), h('tbody', {}, rows))));
  };
  drawList();
}

// ---------------------------------------------------------------- link tabs

const LINK_TABS = [
  { id: 'overview', label: 'Diagram', render: linkOverview },
  { id: 'polys', label: 'Polynomials', render: linkPolys },
  { id: 'group', label: 'Link group', render: linkGroupTab },
  { id: 'covers', label: 'Covers', render: (o, p, t) => coversTab('link', o, p, t) },
];

function linkSummaryOf(obj) { return cached(obj, 'lsum', () => E.call('linkSummary', obj.sig)); }

async function linkOverview(obj, panel, tok) {
  panel.append(busyEl());
  let s;
  try { s = await linkSummaryOf(obj); } catch (e) { return live(tok, obj) && panel.replaceChildren(errEl(e, renderView)); }
  if (!live(tok, obj)) return;
  panel.replaceChildren();

  const colors = [cssVar('--accent'), cssVar('--accent-2'), cssVar('--accent-3'), '#1f9d6a', '#e08a3c', '#d1495b'];
  let svg = '', ok = true;
  if (s.classical) {
    try { ({ svg, ok } = diagramSVG(s.pd, s.trivialComponents, { colors, bg: cssVar('--surface') })); }
    catch (e) { svg = ''; }
  }
  if (svg) panel.append(h('div', { class: 'figure', html: svg }));
  else panel.append(h('p', { class: 'note' }, s.classical ? 'Could not draw this diagram.' : 'Virtual link: no planar diagram to draw.'));
  if (s.crossings > 0 && svg) panel.append(h('p', { class: 'note' }, ok
    ? 'Drawn from the PD code: a barycentric embedding of the diagram, then smoothed. It shows the same diagram as Regina’s, up to planar isotopy.'
    : 'Drawn from the PD code, but this diagram (it has nugatory crossings or is very large) did not lay out cleanly, so the picture may misrepresent some crossings. Try Simplify first.'));

  const grid = h('div', { class: 'grid', style: 'margin-top:16px' });
  grid.append(card('Crossings', s.crossings));
  grid.append(card('Components', s.components));
  grid.append(card('Writhe', s.writhe));
  if (s.components > 1 && s.linking !== undefined) grid.append(card('Linking number', s.linking));
  if (s.alternating !== undefined) grid.append(card('Alternating diagram', s.alternating ? 'yes' : 'no'));
  if (s.seifertCircles !== undefined) grid.append(card('Seifert circles', s.seifertCircles));
  panel.append(grid);

  const codes = [
    ['PD code', s.pd], ['DT code', s.dt], ['DT code (letters)', s.dtAlpha], ['Gauss code', s.gauss],
    ['Oriented Gauss code', s.ogauss], ['Signature', s.sig], ['Brief format', s.brief],
  ].filter(([, v]) => v);
  const rows = codes.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'mono', style: 'white-space:normal;word-break:break-all' }, v),
    h('td', {}, h('button', { class: 'btn small quiet', onclick: () => copy(v, k + ' copied') }, 'Copy'))));
  panel.append(section('Codes', null, h('div', { class: 'tablewrap' }, h('table', {}, h('tbody', {}, rows)))));

  const others = state.objs.filter((o) => o.kind === 'link');
  if (s.components === 1 && others.length) {
    const pick = h('select', { 'aria-label': 'Second knot' }, others.map((o) => h('option', { value: o.id }, o.name.replace(/\$/g, ''))));
    panel.append(section('Connected sum', 'with a knot from your workspace (both must be knots)',
      h('div', { class: 'row' }, h('div', { class: 'grow', style: 'max-width:360px' }, pick),
        h('button', { class: 'btn primary', onclick: async () => {
          const other = others.find((o) => String(o.id) === pick.value);
          try {
            const r = await E.call('linkCompose', obj.sig, other.sig);
            addObj('link', r.sig, `${obj.name} # ${other.name}`, r.crossings);
          } catch (e) { toast(e.message); }
        } }, 'Connected sum'))));
  }
}

async function linkPolys(obj, panel, tok) {
  const s = await linkSummaryOf(obj).catch(() => null);
  if (!live(tok, obj)) return;
  const big = s && s.crossings > 40;
  const out = h('div');
  panel.append(out);
  const show = async (compute) => {
    const key = 'polys';
    if (!compute && obj.cache[key] === undefined) {
      out.replaceChildren(h('p', { class: 'note' }, `This diagram has ${s.crossings} crossings, so the polynomials may take a while.`),
        h('button', { class: 'btn primary', onclick: () => show(true) }, 'Compute polynomials'));
      return;
    }
    out.replaceChildren(busyEl('Computing polynomials'));
    let p;
    try { p = await cached(obj, key, () => E.call('linkPolys', obj.sig, true)); }
    catch (e) { return live(tok, obj) && out.replaceChildren(errEl(e, () => show(true))); }
    if (!live(tok, obj)) return;
    out.replaceChildren();
    const block = (k, tex, note) => h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'k' }, k),
      h('div', { class: 'math-block' }, M(tex, true)), note ? h('div', { class: 'k' }, note) : null);
    out.append(block('Jones polynomial', `V(t) = ${laurentTeX(p.jones, 't', true)}`,
      s.components % 2 === 0 ? 'Links with an even number of components have half-integer powers of t.' : null));
    if (p.alexander) out.append(block('Alexander polynomial', `\\Delta(t) = ${polyTeX(p.alexander)}`));
    if (p.homflyAZ) out.append(block(mixed('HOMFLY-PT polynomial in $a, z$'), `P(a, z) = ${textPolyTeX(p.homflyAZ)}`));
    if (p.homflyLM) out.append(block(mixed('HOMFLY-PT polynomial in $\\ell, m$'), `P(\\ell, m) = ${textPolyTeX(p.homflyLM, { l: '\\ell' })}`));
    out.append(h('p', { class: 'note' }, 'Conventions are Regina’s: see the Regina documentation for the normalization of each polynomial.'));
  };
  show(!big);
}

async function linkGroupTab(obj, panel, tok) {
  panel.append(busyEl());
  try {
    const g = await cached(obj, 'lgroup', () => E.call('linkGroup', obj.sig));
    if (!live(tok, obj)) return;
    panel.replaceChildren(groupView(g, null));
  } catch (e) { if (live(tok, obj)) panel.replaceChildren(errEl(e, renderView)); }
}

// ---------------------------------------------------------------- notebooks

function starterCells(obj) {
  const name = JSON.stringify(obj.name);
  if (obj.kind === 'tri') {
    return [
      { type: 'md', src: `Notes on ${obj.name}. Press **Run all**, then add cells below. **What can I call?** above lists the functions.` },
      { type: 'code', src: `const M = (await tri('${obj.sig}')).as(${name})\nM` },
      { type: 'code', src: 'show(M.homology(), M.group())' },
      { type: 'code', src: '// Census names and hyperbolic volume (null if SnapPea finds no structure)\n({ census: M.census(), volume: M.volume() })' },
    ];
  }
  return [
    { type: 'md', src: `Notes on ${obj.name}. Press **Run all**, then add cells below. **What can I call?** above lists the functions.` },
    { type: 'code', src: `const K = (await link('${obj.sig}')).as(${name})\nK.diagram()` },
    { type: 'code', src: 'show(K.jones(), K.alexander())' },
    { type: 'code', src: 'const C = await K.complement()\n({ census: C.census(), volume: C.volume() })' },
  ];
}

function openNotebook(id) {
  state.nb = id;
  try { history.replaceState(null, '', '#nb=' + encodeURIComponent(id)); } catch {}
  renderList();
  renderNbList();
  renderView();
  $('#view').scrollTop = 0;
  window.scrollTo(0, 0);
}

function renderNbList() {
  const ul = $('#nb-list');
  ul.replaceChildren();
  const item = (n, mine) => h('li', { class: state.nb === n.id ? 'on' : '', onclick: () => openNotebook(n.id), title: n.title },
    h('span', { class: 'kind nb' }, h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, html: '<path d="M3 2h8l2 2v10H3z M5 6h6 M5 9h6 M5 12h4" fill="none" stroke="currentColor" stroke-width="1.4"/>' })),
    h('div', {}, mixed(n.title, 'div', 'name'), h('div', { class: 'meta' }, mine ? 'yours' : NB.isEdited(n.id) ? 'example · edited' : 'example')));
  for (const n of NB.builtins()) ul.append(item(n, false));
  for (const n of NB.userNotebooks()) ul.append(item(n, true));
}

// ---------------------------------------------------------------- startup

function initSidebar() {
  $('#mode-tri').onclick = () => setMode('tri');
  $('#mode-link').onclick = () => setMode('link');
  $('#tri-kind').onchange = triKindChanged;
  triKindChanged();
  $('#tri-load').onclick = triLoadClicked;
  $('#tri-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') triLoadClicked(); });
  $('#link-kind').onchange = () => { $('#link-text').placeholder = LINK_PLACEHOLDERS[$('#link-kind').value]; };
  $('#link-load').onclick = linkLoadClicked;
  $('#link-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) linkLoadClicked(); });

  exampleChips($('#tri-chips'), TRI_EXAMPLES, (ex, p) =>
    loadTri('example', ex.id, p.join(','), ex.name ? ex.name(p) : ex.label).catch((e) => toast(e.message)));
  exampleChips($('#link-chips'), LINK_EXAMPLES, (ex, p) =>
    loadLink('example', ex.id, p.join(','), ex.name ? ex.name(p) : ex.label).catch((e) => toast(e.message)));
  $('#tri-chips').before(h('label', { class: 'lbl', style: 'margin-top:16px' }, 'Examples'));
  $('#link-chips').before(h('label', { class: 'lbl', style: 'margin-top:16px' }, 'Examples'));

  $('#file').onchange = async (e) => {
    const f = e.target.files[0];
    if (f) openRga(await f.arrayBuffer(), f.name.replace(/\.rga$/, ''));
    e.target.value = '';
  };
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) openRga(await f.arrayBuffer(), f.name.replace(/\.rga$/, ''));
  });
  $('#sample').onclick = async (e) => {
    e.preventDefault();
    const res = await fetch('data/sample.rga');
    openRga(await res.arrayBuffer(), 'sample');
  };

  $('#theme').onclick = () => {
    const dark = cssVar('color-scheme') === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('regina-gui-theme', next); } catch {}
    renderView();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderView());

  let stopTimer;
  E.onStatus((st, info) => {
    const el = $('#status');
    el.dataset.state = st === 'busy' ? 'busy' : st;
    $('#status-text').textContent = st === 'loading' ? 'Loading engine' : st === 'busy' ? 'Computing' : st === 'error' ? 'Engine failed to load' : 'Regina 7.4.1 ready';
    clearTimeout(stopTimer);
    if (st === 'busy') stopTimer = setTimeout(() => { $('#stop').hidden = false; }, 500);
    else $('#stop').hidden = true;
    if (st === 'error') toast('The Regina engine failed to load: ' + info);
  });
  $('#stop').onclick = () => { E.stop(); toast('Stopped and restarted the engine'); };

  // Notebooks
  nbHost.open = (kind, sig, name, size) => {
    const existing = state.objs.find((o) => o.kind === kind && o.sig === sig);
    if (existing) { toast('Already in your workspace'); return; }
    addObj(kind, sig, name, size, false);
    toast('Added to your workspace');
  };
  NB.setOnChange((openId) => { renderNbList(); if (openId) openNotebook(openId); });
  $('#nb-new').onclick = () => openNotebook(NB.create());
  $('#nb-file').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { openNotebook(NB.importJSON(await f.text())); toast('Opened ' + f.name); }
    catch (err) { toast('Could not open that notebook: ' + err.message); }
  };
}

function fromHash() {
  const nbm = /^#nb=(.+)$/.exec(location.hash);
  if (nbm) { const id = decodeURIComponent(nbm[1]); if (NB.find(id) && state.nb !== id) openNotebook(id); return; }
  const m = /^#(tri|link)=(.+)$/.exec(location.hash);
  if (!m) return;
  const sig = decodeURIComponent(m[2]);
  const existing = state.objs.find((o) => o.kind === m[1] && o.sig === sig);
  if (existing) return selectObj(existing);
  const p = m[1] === 'tri' ? loadTri('isosig', sig) : loadLink('sig', sig, '', 'Shared link');
  p.catch((e) => toast('Could not open the shared object: ' + e.message));
}

function waitForKatex() {
  return new Promise((resolve) => {
    if (window.katex) return resolve();
    const t = setInterval(() => { if (window.katex) { clearInterval(t); resolve(); } }, 30);
    setTimeout(() => { clearInterval(t); resolve(); }, 5000);
  });
}

(async function main() {
  initSidebar();
  E.ready().catch(() => {});
  await waitForKatex();
  restore();
  renderList();
  renderNbList();
  renderView();
  fromHash();
  window.addEventListener('hashchange', fromHash);
})();
