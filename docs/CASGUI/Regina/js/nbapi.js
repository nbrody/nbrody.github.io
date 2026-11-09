// The scripting API that notebook code cells run against.
//
// Everything that talks to Regina is asynchronous. Methods return "lazy"
// promises, so chains such as  link('figureEight').complement().volume()
// work without an await at every step; the cell awaits the final value.

import * as E from './engine.js';
import * as Census from './census.js';
import { braidToPD } from './braid.js';
import { diagramSVG } from './diagram.js';
import {
  abelianTeX, laurentTeX, polyTeX, textPolyTeX, cyclotomicTeX, piTeX,
  presentationTeX, recognizedTeX, surfaceTeX, complexTeX,
} from './tex.js';
import { h, mixed, M, cssVar, plural } from './dom.js';
import { renderMarkdown } from './markdown.js';

// ---------------------------------------------------------------- lazy chains

const THEN = new Set(['then', 'catch', 'finally']);

export function lazy(promise, owner, key) {
  promise.catch(() => {});
  return new Proxy(function () {}, {
    get(_, p) {
      if (THEN.has(p)) return promise[p].bind(promise);
      if (typeof p === 'symbol') return undefined;
      return lazy(promise.then((v) => (v == null ? v : v[p])), promise, p);
    },
    apply(_, __, args) {
      if (!owner) throw new TypeError('This is not a function');
      return lazy(owner.then(async (o) => {
        const m = o?.[key];
        if (typeof m !== 'function') throw new TypeError(`.${key}() is not a method of ${describe(o)}`);
        const vals = [];
        for (const a of args) vals.push(isThenable(a) ? await a : a);
        return m.apply(o, vals);
      }));
    },
  });
}

const isThenable = (v) => v != null && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';

function describe(o) {
  if (o == null) return String(o);
  if (o instanceof Tri) return 'a triangulation';
  if (o instanceof Link) return 'a link';
  return o.constructor?.name ? `a ${o.constructor.name}` : typeof o;
}

// Resolve promises inside arrays and plain objects (so tables can hold them).
export async function resolveDeep(v, depth = 0) {
  if (isThenable(v)) v = await v;
  if (v && typeof v._resolve === 'function') { await v._resolve(); return v; }
  if (depth > 3) return v;
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) out.push(await resolveDeep(x, depth + 1));
    return out;
  }
  if (v && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = await resolveDeep(x, depth + 1);
    return out;
  }
  return v;
}

// ---------------------------------------------------------------- host hooks

// Set by the app: open(kind, sig, name, size) puts an object in the workspace.
export const host = { open: null };

// Per-signature cache shared by every notebook (Regina's answers never change).
const caches = new Map();
function cacheFor(kind, sig) {
  const k = kind + ':' + sig;
  if (!caches.has(k)) caches.set(k, new Map());
  return caches.get(k);
}
function memo(obj, key, fn) {
  const c = cacheFor(obj instanceof Link ? 'link' : 'tri', obj.sig);
  if (!c.has(key)) {
    const p = fn();
    c.set(key, p);
    p.catch(() => c.delete(key));
  }
  return c.get(key);
}

// ---------------------------------------------------------------- values

export class Abelian {
  constructor(g) { this.rank = g.rank; this.torsion = g.torsion.map(Number); this._g = g; }
  get tex() { return abelianTeX(this._g); }
  get order() { return this.rank ? Infinity : this.torsion.reduce((a, b) => a * b, 1); }
  isTrivial() { return this.rank === 0 && this.torsion.length === 0; }
  equals(o) { return o instanceof Abelian && this.toString() === o.toString(); }
  toString() { return this._g.text; }
  render() { return M(this.tex); }
}

export class Group {
  constructor(g) {
    this.text = g.text; this.generators = g.generators; this.relations = g.relations; this.recognized = g.recognized;
  }
  get tex() { return presentationTeX(this.text); }
  // What Regina recognizes the group as (LaTeX), or null.
  get name() { const r = recognizedTeX(this.recognized); return r ? new Tex(r.tex) : null; }
  toString() { return this.text; }
  render() {
    const box = h('div', { class: 'nb-group' });
    box.append(h('div', { class: 'math-block' }, M(this.tex, true)));
    const rec = recognizedTeX(this.recognized);
    box.append(h('div', { class: 'nb-meta' },
      `${plural(this.generators, 'generator')}, ${plural(this.relations, 'relation')}`,
      rec ? h('span', {}, ' · recognized as ', M(rec.tex)) : ' · not a group Regina can name'));
    return box;
  }
}

export class Poly {
  // kind: 'jones' (variable √t), 'laurent' or 'poly' (ascending coefficients).
  constructor(data, kind, name) {
    this.kind = kind; this.name = name;
    if (kind === 'poly') this.data = { min: 0, coeffs: data };
    else this.data = data;
  }
  get tex() { return laurentTeX(this.data, 't', this.kind === 'jones'); }
  get coefficients() { return this.data.coeffs.map(Number); }
  get minDegree() { return this.kind === 'jones' ? this.data.min / 2 : this.data.min; }
  get maxDegree() { return this.minDegree + (this.data.coeffs.length - 1) / (this.kind === 'jones' ? 2 : 1); }
  equals(o) { return o instanceof Poly && o.kind === this.kind && JSON.stringify(o.data) === JSON.stringify(this.data); }
  // Value at t (for Jones, t is the usual variable; Regina stores powers of √t).
  at(t) {
    const x = this.kind === 'jones' ? Math.sqrt(t) : t;
    return this.data.coeffs.reduce((s, c, i) => s + Number(c) * x ** (this.data.min + i), 0);
  }
  toString() { return this.tex; }
  render() { return M((this.name ? this.name + ' = ' : '') + this.tex); }
}

export class Homfly {
  constructor(az, lm) { this.az = az; this.lm = lm; }
  get tex() { return textPolyTeX(this.az); }
  equals(o) { return o instanceof Homfly && o.az === this.az; }
  toString() { return this.az; }
  render() { return M('P(a, z) = ' + this.tex); }
}

export class Covers {
  constructor(r) {
    this.index = r.index; this.count = r.count;
    this.list = r.list.map((g) => new Abelian(g));
  }
  // A canonical string: the sorted multiset of abelianizations.
  get signature() { return this.list.map(String).sort().join(' | '); }
  equals(o) { return o instanceof Covers && o.index === this.index && o.signature === this.signature; }
  render() {
    const tally = new Map();
    for (const g of this.list) {
      const k = g.toString();
      if (!tally.has(k)) tally.set(k, [g, 0]);
      tally.get(k)[1]++;
    }
    const rows = [...tally.values()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const box = h('div');
    box.append(h('div', { class: 'nb-meta' }, this.count === 0
      ? `No subgroups of index ${this.index}, so no connected ${this.index}-sheeted covers`
      : `${plural(this.count, 'subgroup')} of index ${this.index} up to conjugacy, so ${plural(this.count, 'connected cover')} with ${this.index} sheets`));
    if (rows.length) {
      box.append(h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Homology of the cover'), h('th', {}, 'How many'))),
        h('tbody', {}, rows.map(([g, n]) => h('tr', {}, h('td', {}, M(`H_1 = ${g.tex}`)), h('td', { class: 'num' }, n)))))));
    }
    return box;
  }
}

const SOLUTIONS = ['not attempted', 'geometric', 'non-geometric', 'flat', 'degenerate', 'other', 'no solution', 'externally computed'];

export class Hyperbolic {
  constructor(r) { Object.assign(this, r); this.solutionType = SOLUTIONS[r.solution] ?? String(r.solution); }
  get isGeometric() { return this.solution === 1; }
  render() {
    const g = h('div', { class: 'grid' });
    g.append(kv('Solution', this.solutionType));
    g.append(kv('Volume', h('span', { class: 'mono' }, this.volume == null ? '—' : this.volume.toFixed(12))));
    g.append(kv('Cusps', String(this.cusps)));
    const box = h('div', {}, g);
    if (this.shapes?.length) {
      box.append(h('div', { class: 'nb-shapes' }, this.shapes.map((z, i) => M(`z_{${i}} = ${complexTeX(z.re, z.im)}`))));
    }
    return box;
  }
}

export class TuraevViro {
  constructor(r, rr, parity) { Object.assign(this, r); this.r = rr; this.parity = parity; this.value = r.approx; }
  get tex() { return cyclotomicTeX(this.exact, this.field); }
  equals(o) { return o instanceof TuraevViro && o.exact === this.exact && o.field === this.field; }
  toString() { return this.exact; }
  render() { return M(`\\mathrm{TV}_{${this.r}} = ${this.tex} \\approx ${this.approx.toFixed(8)}`); }
}

export class Surface {
  constructor(s, i, list) {
    Object.assign(this, s);
    if (s.euler !== undefined) this.euler = Number(s.euler);
    this.index = i; this._list = list;
  }
  get type() { return surfaceTeX(this); }
  // Boundary slopes per cusp as fractions -L/M (null when the cusp is missed).
  get boundarySlopes() {
    return (this.slopes || []).map(([m, l]) => (m === 0 && l === 0 ? null : slopeTeX(-l, m)));
  }
  cutAlong() { return this._list._op(this.index, 'cut', 'cut along surface ' + this.index); }
  crush() { return this._list._op(this.index, 'crush', 'crushed along surface ' + this.index); }
  isIncompressible() { return this._list._op(this.index, 'incompressible'); }
  render() { return M(this.type); }
}

function slopeTeX(p, q) {
  if (q < 0) { p = -p; q = -q; }
  if (q === 0) return '\\infty';
  const g = gcd(Math.abs(p), q);
  p /= g; q /= g;
  return q === 1 ? String(p) : `${p < 0 ? '-' : ''}\\tfrac{${Math.abs(p)}}{${q}}`;
}

export class SurfaceList {
  constructor(r, tri, coords, which) {
    this.tri = tri; this.coords = coords; this.which = which;
    this.count = r.count; this.hasSlopes = r.slopes;
    this.list = r.list.map((s, i) => new Surface(s, i, this));
  }
  get length() { return this.list.length; }
  [Symbol.iterator]() { return this.list[Symbol.iterator](); }
  filter(f) { return this.list.filter(f); }
  map(f) { return this.list.map(f); }
  _op(i, op, label) {
    return lazy(E.call('surfaceOp', this.tri.sig, this.coords, this.which, i, op).then((x) =>
      x.sig ? new Tri(x.sig, x.size, `${this.tri.name} · ${label}`) : x.value));
  }
  render() {
    const box = h('div');
    box.append(h('div', { class: 'nb-meta' }, `${plural(this.count, this.which + ' surface')} in ${this.coords} coordinates` + (this.list.length < this.count ? `, showing ${this.list.length}` : '')));
    const cols = ['#', 'Surface', M('\\chi'), 'Orientable', 'Two-sided', 'Notes'];
    if (this.hasSlopes) cols.push('Boundary slope');
    const yn = (v) => (v === undefined ? '—' : v ? 'yes' : 'no');
    const rows = this.list.slice(0, 200).map((s) => h('tr', {},
      h('td', { class: 'num' }, s.index), h('td', {}, M(s.type)), h('td', { class: 'num' }, s.euler ?? '—'),
      h('td', {}, yn(s.orientable)), h('td', {}, yn(s.twoSided)),
      h('td', {}, s.vertexLink ? 'vertex link' : s.splitting ? 'splitting' : s.central ? 'central' : ''),
      this.hasSlopes ? h('td', {}, s.boundarySlopes.length ? s.boundarySlopes.map((x, k) => (x === null ? '—' : M(x))).reduce((a, el, k) => (k ? [...a, ', ', el] : [el]), []) : '') : null));
    box.append(h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)))), h('tbody', {}, rows))));
    return box;
  }
}

export class AngleList {
  constructor(r) { Object.assign(this, r); }
  get length() { return this.list.length; }
  render() {
    const box = h('div');
    box.append(h('div', { class: 'nb-meta' }, `${plural(this.count, 'vertex angle structure')}`,
      ` · strict structure ${this.spansStrict ? 'exists' : 'does not exist'} · taut structure ${this.spansTaut ? 'exists' : 'does not exist'}`));
    const yn = (v) => (v ? 'yes' : 'no');
    const rows = this.list.slice(0, 100).map((a, i) => h('tr', {}, h('td', { class: 'num' }, i), h('td', {}, yn(a.strict)), h('td', {}, yn(a.taut)), h('td', {}, yn(a.veering)),
      h('td', {}, a.angles.map((t) => M(`(${t.map(piTeX).join(', ')})`)).reduce((acc, el, k) => (k ? [...acc, ' ', el] : [el]), []))));
    if (rows.length) box.append(h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['#', 'Strict', 'Taut', 'Veering', 'Angles by tetrahedron'].map((c) => h('th', {}, c)))), h('tbody', {}, rows))));
    return box;
  }
}

function kv(k, v) {
  const vEl = h('div', { class: 'v' + (typeof v === 'string' ? ' text' : '') });
  vEl.append(v instanceof Node ? v : String(v));
  return h('div', { class: 'card' }, h('div', { class: 'k' }, k), vEl);
}

// ---------------------------------------------------------------- triangulations

let untitled = 1;

export class Tri {
  constructor(sig, size, name) { this.sig = sig; this.size = size; this.name = name || `Triangulation ${untitled++}`; }
  toString() { return this.name; }

  _summary() { return memo(this, 'summary', () => E.call('triSummary', this.sig)); }
  _snap() { return memo(this, 'snap', () => E.call('triSnap', this.sig)); }
  _canon() { return memo(this, 'canon', () => E.call('triCanon', this.sig)); }
  _derived(op, suffix, param = 0) {
    return lazy(E.call('triOp', this.sig, op, param).then((r) => new Tri(r.sig, r.size, `${this.name} · ${suffix}`)));
  }
  _prop(name) { return lazy(memo(this, 'p:' + name, () => E.call('triProp', this.sig, name)).then((r) => r.value)); }

  summary() { return lazy(this._summary()); }
  homology(dim = 1) {
    return lazy(this._summary().then((s) => {
      const g = dim === 1 ? s.h1 : dim === 2 ? s.h2 : null;
      if (!g) throw new Error(`Homology in dimension ${dim} is not available for this triangulation`);
      return new Abelian(g);
    }));
  }
  isOrientable() { return lazy(this._summary().then((s) => s.orientable)); }
  isClosed() { return lazy(this._summary().then((s) => s.closed)); }
  isValid() { return lazy(this._summary().then((s) => s.valid)); }
  cusps() { return lazy(this._summary().then((s) => s.vertexList.filter((v) => v.link === 'torus' || v.link === 'klein').length)); }
  group() { return lazy(memo(this, 'group', () => E.call('triGroup', this.sig)).then((g) => new Group(g))); }
  covers(k) { return lazy(memo(this, 'cov' + k, () => E.call('groupCovers', 'tri', this.sig, k)).then((r) => new Covers(r))); }
  recognize() {
    return lazy(memo(this, 'recog', () => E.call('triRecognize', this.sig)).then((r) => (r.triangulation
      ? { triangulation: new Tex(r.triangulationTex || r.triangulation), manifold: r.manifold ? new Tex(r.manifoldTex || r.manifold) : null }
      : null)));
  }
  census() { return lazy(Census.lookup(this.sig).then((hits) => hits.map((x) => x.name.replace(/\s*:\s*#\d+$/, '')))); }

  isSphere() { return this._prop('sphere'); }
  isBall() { return this._prop('ball'); }
  isSolidTorus() { return this._prop('solidTorus'); }
  isTxI() { return this._prop('txi'); }
  isIrreducible() { return this._prop('irreducible'); }
  isHaken() { return this._prop('haken'); }
  isZeroEfficient() { return this._prop('zeroEfficient'); }
  isOneEfficient() { return this._prop('oneEfficient'); }
  hasCompressingDisc() { return this._prop('compressingDisc'); }
  hasStrictAngleStructure() { return this._prop('strictAngle'); }
  handlebodyGenus() { return lazy(this._prop('handlebody').then((g) => (g >= 0 ? g : null))); }

  simplify() { return this._derived('simplify', 'simplified'); }
  simplifyExhaustive(height = 2) { return this._derived('simplifyExhaustive', 'simplified', height); }
  doubleCover() { return this._derived('doubleCover', 'double cover'); }
  truncate() { return this._derived('idealToFinite', 'truncated'); }
  makeIdeal() { return this._derived('finiteToIdeal', 'ideal'); }
  puncture() { return this._derived('puncture', 'punctured'); }
  subdivide() { return this._derived('subdivide', 'subdivided'); }
  minimizeVertices() { return this._derived('minimiseVertices', 'fewer vertices'); }
  summands() {
    return lazy(E.call('triOp', this.sig, 'summands', 0).then((r) =>
      r.sigs.map((s, i) => new Tri(s, null, `${this.name} · summand ${i + 1}`))).then(sized));
  }
  components() {
    return lazy(E.call('triOp', this.sig, 'components', 0).then((r) =>
      r.sigs.map((s, i) => new Tri(s, null, `${this.name} · component ${i + 1}`))).then(sized));
  }

  hyperbolic() { return lazy(this._snap().then((r) => { if (r.null) throw new Error('SnapPea could not use this triangulation (it needs ideal torus or Klein bottle cusps)'); return new Hyperbolic(r); })); }
  // The hyperbolic volume, or null when SnapPea finds no hyperbolic structure.
  volume() { return lazy(this._snap().then((r) => (!r.null && (r.solution === 1 || r.solution === 2) ? r.volume : null))); }
  shapes() { return lazy(this._snap().then((r) => r.shapes || [])); }

  fill(m, l, cusp = 0) {
    return lazy(E.call('triFill', this.sig, m, l, cusp).then((r) => new Tri(r.sig, r.size, `${this.name}(${m}, ${l})`)));
  }
  // Many Dehn fillings at once. slopes: [[m, l], ...]. Returns table rows.
  fillings(slopes, cusp = 0) {
    const list = slopes.map((s) => (Array.isArray(s) ? s : [s.m, s.l]));
    return lazy(E.call('triFillMany', this.sig, list.map((s) => s.join(',')).join(';'), cusp).then((r) =>
      table(r.list.map((x) => ({
        slope: tex(`(${x.m}, ${x.l})`), m: x.m, l: x.l,
        type: x.ok ? SOLUTIONS[x.solution] : 'not allowed',
        volume: x.ok && (x.solution === 1 || x.solution === 2) ? x.volume : null,
        homology: x.h1 ? new Abelian(x.h1) : null,
      })), { columns: ['slope', 'type', 'volume', 'homology'] })));
  }

  canonical() { return lazy(this._canon().then((r) => new Tri(r.sig, r.size, `${this.name} · canonical`))); }
  symmetries() {
    return lazy(this._canon().then((r) => ({ order: r.symmetries, preserving: r.preserving, reversing: r.reversing })));
  }
  isAmphichiral() { return lazy(this._canon().then((r) => (r.orientable ? r.reversing > 0 : null))); }
  // Exact for cusped hyperbolic manifolds: the canonical triangulations agree.
  isIsometricTo(other) {
    return lazy(Promise.resolve(other).then((o) => Promise.all([this._canon(), o._canon()])).then(([a, b]) => a.sig === b.sig));
  }
  isIsomorphicTo(other) { return lazy(Promise.resolve(other).then((o) => o.sig === this.sig)); }

  surfaces({ coords = 'standard', which = 'vertex', limit = 3000 } = {}) {
    return lazy(memo(this, `surf:${coords}:${which}`, () => E.call('surfaces', this.sig, coords, which, limit))
      .then((r) => new SurfaceList(r, this, coords, which)));
  }
  angles({ taut = false } = {}) {
    return lazy(memo(this, 'ang:' + taut, () => E.call('angles', this.sig, taut, 2000)).then((r) => new AngleList(r)));
  }
  turaevViro(r, parity = true) {
    return lazy(memo(this, `tv:${r}:${parity}`, () => E.call('triTV', this.sig, r, parity)).then((v) => new TuraevViro(v, r, parity)));
  }

  open(name) { host.open?.('tri', this.sig, name || this.name, this.size); return this; }
  as(name) { this.name = name; return this; }

  render() {
    return objCard('tri', this, `${this.size ?? '?'} tetrahedr${this.size === 1 ? 'on' : 'a'}`);
  }
}

async function sized(tris) {
  for (const t of tris) {
    if (t.size == null) t.size = (await E.call('triLoad', 'isosig', t.sig, '')).size;
  }
  return tris;
}

// ---------------------------------------------------------------- links

export class Link {
  constructor(sig, crossings, name) { this.sig = sig; this.crossings = crossings; this.name = name || `Link ${untitled++}`; }
  toString() { return this.name; }

  _summary() { return memo(this, 'summary', () => E.call('linkSummary', this.sig)); }
  _polys() { return memo(this, 'polys', () => E.call('linkPolys', this.sig, true)); }
  _derived(op, suffix, param = 0) {
    return lazy(E.call('linkOp', this.sig, op, param).then((r) => new Link(r.sig, r.crossings, suffix(this.name))));
  }

  summary() { return lazy(this._summary()); }
  countComponents() { return lazy(this._summary().then((s) => s.components)); }
  writhe() { return lazy(this._summary().then((s) => s.writhe)); }
  linking() { return lazy(this._summary().then((s) => s.linking)); }
  isAlternating() { return lazy(this._summary().then((s) => s.alternating)); }
  pd() { return lazy(this._summary().then((s) => s.pd)); }
  dt() { return lazy(this._summary().then((s) => s.dt ?? null)); }

  jones() { return lazy(this._polys().then((p) => new Poly(p.jones, 'jones', 'V(t)'))); }
  alexander() { return lazy(this._polys().then((p) => (p.alexander ? new Poly(p.alexander, 'poly', '\\Delta(t)') : null))); }
  homfly() { return lazy(this._polys().then((p) => new Homfly(p.homflyAZ, p.homflyLM))); }
  group() { return lazy(memo(this, 'group', () => E.call('linkGroup', this.sig)).then((g) => new Group(g))); }
  covers(k) { return lazy(memo(this, 'cov' + k, () => E.call('groupCovers', 'link', this.sig, k)).then((r) => new Covers(r))); }

  complement() {
    return lazy(memo(this, 'compl', () => E.call('linkOp', this.sig, 'complement', 0)).then((r) => new Tri(r.triSig, r.size, `Complement of ${this.name}`)));
  }
  // For a knot: is it the unknot? (Its complement is a solid torus.)
  isUnknot() {
    return lazy(this._summary().then(async (s) => {
      if (s.components !== 1) return false;
      if (s.crossings === 0) return true;
      const c = await this.complement();
      return c.isSolidTorus();
    }));
  }

  mirror() { return this._derived('reflect', (n) => `Mirror of ${n}`); }
  reverse() { return this._derived('reverse', (n) => `${n}, reversed`); }
  changeAll() { return this._derived('changeAll', (n) => `${n}, all crossings changed`); }
  simplify() { return this._derived('simplify', (n) => `${n} · simplified`); }
  simplifyExhaustive(height = 1) { return this._derived('simplifyExhaustive', (n) => `${n} · simplified`, height); }
  whiteheadDouble(positive = true) { return this._derived('whiteheadDouble', (n) => `Whitehead double of ${n}`, positive ? 1 : -1); }
  cable(n = 2) { return this._derived('parallel', (x) => `${n}-cable of ${x}`, n); }
  connectedSum(other) {
    return lazy(Promise.resolve(other).then((o) => E.call('linkCompose', this.sig, o.sig).then((r) => new Link(r.sig, r.crossings, `${this.name} # ${o.name}`))));
  }

  diagram() { return lazy(this._summary().then((s) => new Diagram(s, this.name))); }

  open(name) { host.open?.('link', this.sig, name || this.name, this.crossings); return this; }
  as(name) { this.name = name; return this; }

  render() {
    const el = objCard('link', this, plural(this.crossings, 'crossing'));
    const fig = h('div', { class: 'nb-mini' });
    el.prepend(fig);
    this._summary().then((s) => fig.append(diagramNode(s, 150))).catch(() => fig.remove());
    return el;
  }
}

function diagramNode(s, size) {
  const colors = [cssVar('--accent'), cssVar('--accent-2'), cssVar('--accent-3'), '#1f9d6a', '#e08a3c', '#d1495b'];
  if (!s.classical) return h('span', { class: 'nb-meta' }, 'virtual link');
  if (s.crossings === 0) return h('span', { class: 'nb-meta' }, 'no crossings');
  try {
    const { svg } = diagramSVG(s.pd, s.trivialComponents, { colors, bg: cssVar('--surface') });
    const el = h('div', { class: 'nb-diagram', html: svg, style: size ? `width:${size}px;height:${size}px` : null });
    return el;
  } catch { return h('span', { class: 'nb-meta' }, 'could not draw'); }
}

export class Diagram {
  constructor(s, name) { this.s = s; this.name = name; }
  render() {
    return h('figure', { class: 'nb-bigdiagram' }, diagramNode(this.s, 0),
      h('figcaption', {}, mixed(this.name), ' · ', plural(this.s.crossings, 'crossing')));
  }
}

function objCard(kind, obj, sub) {
  return h('div', { class: 'nb-obj' },
    h('div', { class: 'nb-obj-body' },
      mixed(obj.name, 'div', 'nb-obj-name'),
      h('div', { class: 'nb-meta' }, sub),
      h('div', { class: 'nb-sig mono', title: obj.sig }, obj.sig),
      h('button', { class: 'btn small quiet', onclick: () => obj.open() }, 'Open in workspace')));
}

// ---------------------------------------------------------------- display

export class Tex {
  constructor(s, display) { this.s = s; this.display = display; }
  toString() { return this.s; }
  render() { return M(this.s, this.display); }
}
export class Markdown {
  constructor(s) { this.s = s; }
  render() { return renderMarkdown(this.s); }
}

export class Table {
  constructor(rows, opts = {}) { this.rows = rows; this.opts = opts; }
  async _resolve() { this.rows = await resolveDeep(this.rows); }
  get length() { return this.rows.length; }
  map(f) { return this.rows.map(f); }
  filter(f) { return this.rows.filter(f); }
  column(c) { return this.rows.map((r) => r[c]); }
  [Symbol.iterator]() { return this.rows[Symbol.iterator](); }
  render() {
    const rows = this.rows;
    const objRows = rows.length && !Array.isArray(rows[0]);
    let cols = this.opts.columns;
    if (!cols) {
      if (objRows) { cols = []; for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k); }
      else cols = (rows[0] || []).map((_, i) => i);
    }
    const head = this.opts.headers || cols.map((c) => (typeof c === 'number' ? '' : label(c)));
    const body = rows.slice(0, this.opts.limit ?? 500).map((r) => h('tr', {}, cols.map((c) => {
      const v = r[c];
      return h('td', { class: typeof v === 'number' ? 'num' : '' }, inline(v));
    })));
    const t = h('table', {}, head.some(Boolean) ? h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x instanceof Node ? x : mixed(x))))) : null, h('tbody', {}, body));
    const wrap = h('div', { class: 'tablewrap' }, t);
    if (rows.length > (this.opts.limit ?? 500)) return h('div', {}, wrap, h('div', { class: 'nb-meta' }, `showing ${this.opts.limit ?? 500} of ${rows.length} rows`));
    return wrap;
  }
}

function label(k) {
  if (/^[A-Za-z]$/.test(String(k))) return `$${k}$`;
  return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function fmtNum(x) {
  if (Number.isInteger(x)) return String(x);
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : 'NaN';
  return Math.abs(x) >= 1e6 || Math.abs(x) < 1e-4 ? x.toExponential(6) : String(+x.toPrecision(10));
}

// Compact rendering for table cells and lists.
function inline(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return h('span', { class: 'mono' }, fmtNum(v));
  if (typeof v === 'boolean') return h('span', { class: 'res ' + (v ? 'yes' : 'no') }, v ? 'yes' : 'no');
  if (typeof v === 'string') return mixed(v);
  if (v instanceof Tri || v instanceof Link) {
    return h('button', { class: 'linkish', title: 'Open in workspace: ' + v.sig, onclick: () => v.open() }, mixed(v.name));
  }
  if (v instanceof Surface) return M(v.type);
  if (typeof v.render === 'function') return v.render();
  if (Array.isArray(v)) return h('span', {}, v.map(inline).reduce((a, el, i) => (i ? [...a, ', ', el] : [el]), []));
  return h('span', { class: 'mono' }, JSON.stringify(v));
}

// Full rendering of a cell result.
export function render(v) {
  if (v === undefined) return null;
  if (v === null) return h('div', { class: 'nb-plain' }, 'null');
  if (typeof v === 'boolean') return h('div', {}, h('span', { class: 'res big ' + (v ? 'yes' : 'no') }, v ? 'yes' : 'no'));
  if (typeof v === 'number') return h('div', { class: 'nb-plain mono' }, fmtNum(v));
  if (typeof v === 'string') return h('div', { class: 'nb-plain' }, mixed(v));
  if (typeof v === 'bigint') return h('div', { class: 'nb-plain mono' }, String(v));
  if (typeof v.render === 'function') return v.render();
  if (typeof v === 'function') return h('div', { class: 'nb-plain mono' }, `function ${v.name || ''}`);
  if (Array.isArray(v)) {
    if (!v.length) return h('div', { class: 'nb-plain' }, 'empty list');
    if (v.every((x) => x instanceof Tri || x instanceof Link)) return h('div', { class: 'nb-objs' }, v.map((x) => x.render()));
    if (v.every((x) => x && Object.getPrototypeOf(x) === Object.prototype)) return new Table(v).render();
    if (v.every((x) => Array.isArray(x))) return new Table(v).render();
    return h('div', { class: 'nb-plain' }, inline(v));
  }
  if (v instanceof Error) return h('div', { class: 'err' }, v.message);
  if (Object.getPrototypeOf(v) === Object.prototype) {
    return h('div', { class: 'tablewrap' }, h('table', { class: 'nb-kv' }, h('tbody', {},
      Object.entries(v).map(([k, x]) => h('tr', {}, h('th', {}, mixed(label(k))), h('td', {}, inline(x)))))));
  }
  return h('div', { class: 'nb-plain mono' }, String(v));
}

// ---------------------------------------------------------------- plots

export class Plot {
  constructor(data, opts = {}) { this.data = data; this.opts = opts; }
  async _resolve() { this._setup(await resolveDeep(this.data)); }
  _setup(data) {
    const opts = this.opts;
    const norm = (pts) => pts.map((p, i) => (Array.isArray(p) ? { x: p[0], y: p[1], label: p[2] }
      : typeof p === 'number' ? { x: i, y: p } : { x: +p.x, y: +p.y, label: p.label }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (Array.isArray(data)) this.series = [{ name: opts.name || '', points: norm(data) }];
    else this.series = Object.entries(data).map(([name, pts]) => ({ name, points: norm(pts) }));
  }
  render() {
    if (!this.series) this._setup(this.data);
    const W = 640, H = 340, L = 56, R = 16, T = 14, B = 40;
    const all = this.series.flatMap((s) => s.points);
    const wrap = h('div', { class: 'nb-plot' });
    if (this.opts.title) wrap.append(mixed(this.opts.title, 'div', 'nb-plot-title'));
    if (!all.length) { wrap.append(h('div', { class: 'nb-meta' }, 'nothing to plot')); return wrap; }
    const ext = (k, lo, hi) => {
      let a = Math.min(...all.map((p) => p[k])), b = Math.max(...all.map((p) => p[k]));
      if (Number.isFinite(lo)) a = Math.min(a, lo);
      if (Number.isFinite(hi)) b = Math.max(b, hi);
      if (a === b) { a -= 1; b += 1; }
      return [a, b];
    };
    const refs = (this.opts.hlines || []).map((r) => (typeof r === 'number' ? r : r.y));
    const [x0r, x1r] = ext('x', this.opts.xmin, this.opts.xmax);
    const [y0r, y1r] = ext('y', Math.min(this.opts.ymin ?? Infinity, ...refs), Math.max(this.opts.ymax ?? -Infinity, ...refs));
    const ty = ticks(y0r, y1r), tx = ticks(x0r, x1r);
    const y0 = Math.min(y0r, ty[0]), y1 = Math.max(y1r, ty[ty.length - 1]);
    const x0 = Math.min(x0r, tx[0]), x1 = Math.max(x1r, tx[tx.length - 1]);
    const X = (x) => L + (x - x0) / (x1 - x0) * (W - L - R);
    const Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, a = {}) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'nb-plot-svg', role: 'img' });
    for (const t of ty) {
      svg.append(el('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: 'grid' }));
      const tx_ = el('text', { x: L - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick' }); tx_.textContent = fmtTick(t); svg.append(tx_);
    }
    for (const t of tx) {
      const tt = el('text', { x: X(t), y: H - B + 18, 'text-anchor': 'middle', class: 'tick' }); tt.textContent = fmtTick(t); svg.append(tt);
    }
    svg.append(el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'axis' }));
    for (const ref of this.opts.hlines || []) {
      const y = typeof ref === 'number' ? ref : ref.y;
      if (y < y0 || y > y1) continue;
      svg.append(el('line', { x1: L, x2: W - R, y1: Y(y), y2: Y(y), class: 'ref' }));
      if (ref.label) { const t = el('text', { x: W - R - 4, y: Y(y) - 6, 'text-anchor': 'end', class: 'reflabel' }); t.textContent = ref.label; svg.append(t); }
    }
    const tip = h('div', { class: 'nb-tip', hidden: true });
    this.series.forEach((s, k) => {
      const cls = 's' + (k % 4 + 1);
      if (this.opts.line) {
        const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
        svg.append(el('path', { d, class: 'line ' + cls }));
      }
      for (const p of s.points) {
        const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: this.opts.line ? 3.5 : 4.5, class: 'dot ' + cls });
        const hit = el('circle', { cx: X(p.x), cy: Y(p.y), r: 10, class: 'hit' });
        hit.addEventListener('mouseenter', () => {
          tip.hidden = false;
          tip.replaceChildren(...[s.name ? h('b', {}, s.name) : null, p.label ? mixed(p.label, 'div') : null,
            h('div', { class: 'mono' }, `${this.opts.x || 'x'} = ${fmtNum(p.x)}, ${this.opts.y || 'y'} = ${fmtNum(p.y)}`)].filter(Boolean));
          const r = svg.getBoundingClientRect(), sc = r.width / W;
          tip.style.left = Math.min(X(p.x) * sc + 12, r.width - 180) + 'px';
          tip.style.top = Y(p.y) * sc - 10 + 'px';
          c.classList.add('on');
        });
        hit.addEventListener('mouseleave', () => { tip.hidden = true; c.classList.remove('on'); });
        svg.append(c, hit);
      }
    });
    const stage = h('div', { class: 'nb-plot-stage' }, svg, tip);
    wrap.append(stage);
    const axes = h('div', { class: 'nb-plot-axes' });
    if (this.opts.x) axes.append(h('span', {}, 'horizontal: ', mixed(this.opts.x)));
    if (this.opts.y) axes.append(h('span', {}, 'vertical: ', mixed(this.opts.y)));
    if (this.series.length > 1) {
      axes.append(h('span', { class: 'nb-legend' }, this.series.map((s, k) =>
        h('span', {}, h('i', { class: 's' + (k % 4 + 1) }), mixed(s.name)))));
    }
    if (axes.childNodes.length) wrap.append(axes);
    return wrap;
  }
}

function ticks(a, b, n = 5) {
  const span = b - a;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let t = Math.floor(a / step) * step; t <= b + step * 1e-9; t += step) out.push(+t.toFixed(10));
  if (out[out.length - 1] < b - 1e-9) out.push(+(out[out.length - 1] + step).toFixed(10));
  return out;
}
function fmtTick(t) { return Math.abs(t) >= 1e5 ? t.toExponential(1) : String(+t.toPrecision(6)); }

// ---------------------------------------------------------------- top-level functions

function looksLikeExample(s) { return /^[a-zA-Z][a-zA-Z0-9]*$/.test(s); }

const TRI_EXAMPLE_IDS = new Set(['threeSphere', 's2xs1', 'rp2xs1', 'threeTorus', 'rp3rp3', 'poincare', 'weeks', 'weberSeifert', 'lens', 'lst', 'layeredLoop', 'sfsOverSphere', 'handlebody', 'solidKleinBottle', 'figureEight', 'trefoil', 'whitehead', 'gieseking', 'smallClosedOrblHyperbolic', 'smallClosedNonOrblHyperbolic', 'bingsHouse', 'idealGenusTwoHandlebody']);
const LINK_EXAMPLE_IDS = new Set(['unknot', 'trefoilLeft', 'trefoilRight', 'figureEight', 'hopf', 'whitehead', 'borromean', 'conway', 'kinoshitaTerasaka', 'torus', 'gst', 'monster', 'gordian']);
const NICE = {
  threeSphere: '$S^3$', s2xs1: '$S^2 \\times S^1$', rp2xs1: '$\\mathbb{R}P^2 \\times S^1$', threeTorus: '$T^3$', rp3rp3: '$\\mathbb{R}P^3 \\# \\mathbb{R}P^3$',
  poincare: 'Poincaré sphere', weeks: 'Weeks manifold', weberSeifert: 'Weber–Seifert space', figureEight: 'Figure-eight', trefoil: 'Trefoil complement',
  whitehead: 'Whitehead link', gieseking: 'Gieseking manifold', trefoilLeft: 'Left trefoil', trefoilRight: 'Right trefoil', hopf: 'Hopf link',
  borromean: 'Borromean rings', conway: 'Conway knot', kinoshitaTerasaka: 'Kinoshita–Terasaka knot', gst: 'GST knot', monster: 'Monster unknot',
  gordian: 'Gordian unknot', unknot: 'Unknot',
};

// tri('poincare'), tri('lens', 7, 2), tri('cPcbbbiht'), tri('baaaade') (dehydration)
export function tri(input, ...params) {
  const s = String(input).trim();
  let p;
  if (TRI_EXAMPLE_IDS.has(s)) {
    let name = NICE[s] || s;
    if (s === 'figureEight') name = 'Figure-eight knot complement';
    if (s === 'whitehead') name = 'Whitehead link complement';
    if (s === 'lens') name = `$L(${params[0] ?? 5},${params[1] ?? 2})$`;
    p = E.call('triLoad', 'example', s, params.join(',')).then((r) => new Tri(r.sig, r.size, name));
  } else {
    p = E.call('triLoad', 'isosig', s, '').catch(() => E.call('triLoad', 'dehydration', s, ''))
      .then((r) => new Tri(r.sig, r.size, params[0]));
  }
  return lazy(p);
}

export function lens(p, q) { return tri('lens', p, q); }

// census('m004'), census('L104001'), census('m003(-3, 1)')
export function census(name) {
  return lazy(Census.searchName(String(name)).then((hits) => {
    const q = String(name).trim().toLowerCase().replace(/\s+/g, '');
    const hit = hits.find((x) => x.name.toLowerCase().replace(/\s+/g, '').split(':').includes(q)) || hits[0];
    if (!hit) throw new Error(`No census entry is called “${name}”`);
    return E.call('triLoad', 'isosig', hit.sig, '').then((r) => new Tri(r.sig, r.size, String(name).trim()));
  }));
}

// censusList('cusped', 20) → the first 20 triangulations of a census.
export function censusList(key, count = 20, from = 0) {
  return lazy(Census.entries(key, from, count).then((rows) =>
    rows.map((r) => new Tri(r.sig, sizeFromSig(r.sig), r.name))));
}

// The number of tetrahedra is encoded in the first character of a
// (connected, < 63 tetrahedra) isomorphism signature.
function sizeFromSig(sig) {
  const c = sig.charCodeAt(0);
  if (c >= 97 && c <= 122) return c - 97;
  if (c >= 65 && c <= 90) return c - 65 + 26;
  if (c >= 48 && c <= 57) return c - 48 + 52;
  return null;
}

function linkKind(s) {
  if (/^\s*(PD|\[|\()/.test(s) || /X\[/.test(s)) return 'pd';
  if (/[<>]/.test(s)) return 'ogauss';
  if (/^\s*-?\d+(\s*[ ,]\s*-?\d+)*\s*$/.test(s)) {
    const n = s.trim().split(/[\s,]+/).map(Number);
    return n.every((x) => x % 2 === 0) ? 'dt' : 'gauss';
  }
  return 'sig';
}

// link('figureEight'), link('torus', 3, 5), link('PD[X[...]]'), link('4 6 2'), link(sig)
export function link(input, ...params) {
  const s = String(input).trim();
  let p;
  if (LINK_EXAMPLE_IDS.has(s)) {
    const name = s === 'torus' ? `$T(${params[0] ?? 2},${params[1] ?? 3})$` : s === 'figureEight' ? 'Figure-eight knot' : (NICE[s] || s);
    p = E.call('linkLoad', 'example', s, params.join(',')).then((r) => new Link(r.sig, r.crossings, name));
  } else {
    const kind = linkKind(s);
    p = E.call('linkLoad', kind, s, '').then((r) => new Link(r.sig, r.crossings, params[0]));
  }
  return lazy(p);
}
export const knot = link;

export function torusKnot(p, q) { return link('torus', p, q); }

// braid([1, 1, 1]) or braid('s1 s2^-1 s1 s2^-1')
export function braid(word, name) {
  return lazy(Promise.resolve().then(() => {
    const b = braidToPD(word);
    if (b.freeStrands) throw new Error(`${plural(b.freeStrands, 'strand')} of this braid never cross${b.freeStrands === 1 ? 'es' : ''} anything, and Regina’s PD input cannot record an unlinked unknot. Drop the unused strand.`);
    const label = name || `Closure of $${braidTeX(word)}$`;
    return E.call('linkLoad', 'pd', b.pd, '').then((r) => new Link(r.sig, r.crossings, label));
  }));
}

function braidTeX(word) {
  const w = Array.isArray(word) ? word : String(word).trim().split(/\s+/).map(Number);
  if (w.some((x) => !Number.isFinite(x))) return String(word);
  const out = [];
  for (let i = 0; i < w.length;) {
    let j = i; while (j < w.length && w[j] === w[i]) j++;
    const e = (j - i) * Math.sign(w[i]);
    out.push(`\\sigma_{${Math.abs(w[i])}}${e === 1 ? '' : `^{${e}}`}`);
    i = j;
  }
  return out.join('');
}

// Wait for every promise inside a value (arrays and plain objects too).
export function all(v) { return resolveDeep(v); }

export function tex(s, display = false) { return new Tex(s, display); }
export function md(strings, ...vals) {
  const s = Array.isArray(strings) && strings.raw ? String.raw({ raw: strings.raw }, ...vals) : String(strings);
  return new Markdown(s);
}
export function table(rows, opts) { return new Table(rows, opts); }
export function plot(data, opts) { return new Plot(data, opts); }
export function range(a, b, step = 1) {
  if (b === undefined) { b = a; a = 0; }
  const out = [];
  for (let x = a; step > 0 ? x < b : x > b; x += step) out.push(x);
  return out;
}
export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
// Coprime slopes (p, q) with |p| ≤ maxP and 1 ≤ q ≤ maxQ, plus (1, 0).
export function slopes(maxP, maxQ = 1) {
  const out = [[1, 0]];
  for (let q = 1; q <= maxQ; q++) for (let p = -maxP; p <= maxP; p++) if (gcd(p, q) === 1) out.push([p, q]);
  return out;
}

export const API = {
  tri, lens, census, censusList, link, knot, torusKnot, braid,
  tex, md, table, plot, range, gcd, slopes, all,
  Tri, Link, Abelian, Poly, Group, Covers,
};
