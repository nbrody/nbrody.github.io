/* app.js — Temperley–Lieb calculator UI (uses window.TL from tl.js).
 * Layout follows Kleinian/poincare: a full-screen stage showing the current element,
 * a floating tabbed control panel, a status banner, generator pills and a term inspector. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const MINUS = '−';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = k => String(k).replace(/\d/g, c => SUBS[c]);

const S = {
  n: 3, ring: 'A', deltaStr: '1',
  deltaForm: true, factored: false, view: 'diagrams', mode: 'result',
  regs: { x: null, y: null, z: null, ans: null },
  result: null, error: null, showAll: false, selTerm: null,
  bm: null, sel: -1, bmsg: '', top: null, bot: null,
  matK: null, matKind: 'rho', heavy: false, mp: null,
};
const fieldCache = {};
let F, T;
const ringKey = () => (S.ring === 'num' ? 'num:' + S.deltaStr : S.ring);
function setup() {
  const k = ringKey();
  if (!fieldCache[k]) fieldCache[k] = TL.makeField(S.ring, S.deltaStr);
  F = fieldCache[k];
  T = new TL.Algebra(S.n, F);
}

/* ============================================================ formatting */
const fo = () => ({ deltaForm: S.deltaForm, factored: S.factored });
let CUR = null;   // formatting options for the object being rendered (see withOpts)
const ch = c => F.html(c, CUR || fo());
// δ-form only if every coefficient of the object can be written in δ — never a mixture
function optsFor(coefs) {
  const o = fo();
  if (F.kind === 'A' && o.deltaForm) for (const c of coefs) if (!TL.RF.toDelta(c)) { o.deltaForm = false; break; }
  return o;
}
function withOpts(coefs, f) { const prev = CUR; CUR = optsFor(coefs); try { return f(); } finally { CUR = prev; } }
const chA = c => F.html(c, { deltaForm: false, factored: S.factored });
function topLevel(h) {
  h = h.replace(/<span class="fr"><span>.*?<\/span><span>.*?<\/span><\/span>/g, 'F');
  let prev;
  do { prev = h; h = h.replace(/\([^()]*\)/g, 'P'); } while (h !== prev);
  return h;
}
const compound = h => / [+−] /.test(topLevel(h));
function coefParts(c) {
  let h = ch(c), neg = false;
  if (h.startsWith(MINUS) && !compound(h.slice(1))) { neg = true; h = h.slice(1); }
  return { neg, abs: h, compound: compound(h) };
}
const paren = h => (compound(h) ? '(' + h + ')' : h);
const wordHtml = w => (w.length ? w.map(i => '<i>e</i><sub>' + i + '</sub>').join('') : '1');
const wordText = w => (w.length ? w.map(i => 'e' + i).join('*') : '1');
function braidHtml(br, max = 60) {
  if (!br.length) return '1';
  const s = br.slice(0, max).map(g => 'σ<sub>' + Math.abs(g) + '</sub>' + (g < 0 ? '<sup>' + MINUS + '1</sup>' : '')).join('');
  return s + (br.length > max ? ' … (' + br.length + ' letters)' : '');
}
function textCoefTerm(c, word) {
  const t = F.text(c, CUR || fo());
  const comp = / [+-] /.test(t.replace(/\([^()]*\)/g, 'P'));
  if (word === '1') return comp ? '(' + t + ')' : t;
  if (t === '1') return word;
  if (t === '-1') return '-' + word;
  return (comp ? '(' + t + ')' : t) + '*' + word;
}
function polyInX(coeffs) { // monic, low→high
  const out = [];
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = coeffs[k];
    if (F.isZero(c)) continue;
    const X = k === 0 ? '' : '<i>X</i>' + (k > 1 ? '<sup>' + k + '</sup>' : '');
    const p = coefParts(c);
    const body = !X ? p.abs : p.abs === '1' ? X : (p.compound ? '(' + p.abs + ')' : p.abs) + X;
    out.push((p.neg ? (out.length ? ' ' + MINUS + ' ' : MINUS) : out.length ? ' + ' : '') + body);
  }
  return out.join('');
}

/* ============================================================ diagram drawing */
function levels(arcs) {
  const sorted = arcs.slice().sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
  const lv = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    let L = 1;
    for (let j = 0; j < i; j++) { const b = sorted[j]; if (b[0] > a[0] && b[1] < a[1]) L = Math.max(L, lv.get(b) + 1); }
    lv.set(a, L);
  }
  return lv;
}
const geom = (n, s, H, px, py) => ({ n, s, H, px, py, X: i => px + (i + 0.5) * s, y0: py, y1: py + H, W: n * s + 2 * px });
const f1 = v => Math.round(v * 10) / 10;
function arcPaths(m, g, special) {
  const n = g.n, caps = [], cups = [], thru = [];
  for (let p = 0; p < 2 * n; p++) {
    const q = m[p];
    if (q < 0 || q < p) continue;
    if (q < n) caps.push([p, q]); else if (p >= n) cups.push([p - n, q - n]); else thru.push([p, q - n]);
  }
  const lc = levels(caps), lu = levels(cups);
  const mc = Math.max(1, ...lc.values()), mu = Math.max(1, ...lu.values());
  const uc = Math.min(g.s * 0.42, g.H * 0.36 / mc), uu = Math.min(g.s * 0.42, g.H * 0.36 / mu);
  let norm = '', spec = '';
  const put = (d, sp) => { if (sp) spec += d; else norm += d; };
  const X = g.X, y0 = g.y0, y1 = g.y1, ym = (y0 + y1) / 2;
  for (const a of caps) { const dp = lc.get(a) * uc * 4 / 3; put(`M${f1(X(a[0]))} ${f1(y0)}C${f1(X(a[0]))} ${f1(y0 + dp)} ${f1(X(a[1]))} ${f1(y0 + dp)} ${f1(X(a[1]))} ${f1(y0)}`, special && special('cap', a)); }
  for (const a of cups) { const dp = lu.get(a) * uu * 4 / 3; put(`M${f1(X(a[0]))} ${f1(y1)}C${f1(X(a[0]))} ${f1(y1 - dp)} ${f1(X(a[1]))} ${f1(y1 - dp)} ${f1(X(a[1]))} ${f1(y1)}`, special && special('cup', a)); }
  for (const [i, j] of thru) put(`M${f1(X(i))} ${f1(y0)}C${f1(X(i))} ${f1(ym)} ${f1(X(j))} ${f1(ym)} ${f1(X(j))} ${f1(y1)}`, special && special('thru', [i, j]));
  return { norm, spec };
}
function frame(g) {
  const a = f1(g.px * 0.4), b = f1(g.W - g.px * 0.4);
  return `<path d="M${a} ${f1(g.y0)}H${b}M${a} ${f1(g.y1)}H${b}" stroke="var(--hairline-strong)" stroke-width="1"/>`;
}
function diagramSVG(m, n, o = {}) {
  const s = o.s || (n <= 4 ? 18 : 15), H = o.h || 34 + 3 * n, g = geom(n, s, H, 5, 4);
  const { norm } = arcPaths(m, g);
  return `<svg width="${g.W}" height="${H + 8}" viewBox="0 0 ${g.W} ${H + 8}" aria-hidden="true">${frame(g)}` +
    `<path d="${norm}" fill="none" stroke="currentColor" stroke-width="${o.sw || 1.6}" stroke-linecap="round"/></svg>`;
}
const stageDiagram = (m, n) => diagramSVG(m, n, { s: n <= 3 ? 28 : n <= 5 ? 24 : 19, h: 46 + 5 * n, sw: 2.1 });
function stateSVG(st, n) {
  const m = new Int8Array(2 * n).fill(-1);
  for (let i = 0; i < n; i++) { if (st[i] < 0) { m[i] = n + i; m[n + i] = i; } else m[i] = st[i]; }
  const g = geom(n, 11, 20, 3, 3);
  const { norm } = arcPaths(m, g);
  return `<svg width="${g.W}" height="26" viewBox="0 0 ${g.W} 26" aria-hidden="true">` +
    `<path d="M${f1(g.px * .4)} 3H${f1(g.W - g.px * .4)}" stroke="var(--hairline-strong)"/><path d="${norm}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

/* ============================================================ parser */
const NAMES = ['delta', 'mirror', 'trace', 'plat', 'star', 'dual', 'flip', 'qint', 'half', 'rot', 'bar', 'inv', 'ans',
  'tr', 'id', 'JW', 'ft', 'e', 'U', 's', 'σ', 'S', 'p', 'P', 'A', 'd', 'δ', 'x', 'y', 'z', 'I', 'Δ'].sort((a, b) => b.length - a.length);
const INDEXED = new Set(['e', 'U', 's', 'σ', 'S', 'p', 'P']);
const FUNCS = new Set(['tr', 'trace', 'plat', 'star', 'dual', 'flip', 'mirror', 'rot', 'bar', 'inv', 'qint', 'JW']);
class ParseError extends Error { constructor(msg, pos) { super(msg); this.pos = pos; } }
function normalize(src) {
  const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  return src
    .replace(/[−–]/g, '-').replace(/[·⋅×∙]/g, '*')
    .replace(/[₀-₉]/g, c => String(SUBS.indexOf(c)))
    .replace(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => '^' + m.replace(/./g, c => (c === '⁻' ? '-' : c === '⁺' ? '' : String(sup.indexOf(c)))));
}
function tokenize(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = s.slice(i).match(/^(\d+(\.\d*)?|\.\d+)/);
    if (num) { toks.push({ t: 'num', v: num[0], pos: i }); i += num[0].length; continue; }
    if ('+-*/^(),[]'.includes(c)) { toks.push({ t: 'op', v: c, pos: i }); i++; continue; }
    if (c === '{') {
      const j = s.indexOf('}', i);
      if (j < 0) throw new ParseError('missing } after diagram code', i);
      toks.push({ t: 'dia', v: s.slice(i + 1, j).replace(/\s+/g, ''), pos: i });
      i = j + 1; continue;
    }
    const name = NAMES.find(nm => s.startsWith(nm, i));
    if (!name) {
      const w = (s.slice(i).match(/^[^\s+\-*/^(),[\]{}]+/) || [c])[0];
      throw new ParseError('unknown symbol “' + w + '”', i);
    }
    const pos = i;
    i += name.length;
    let idx = null;
    if (INDEXED.has(name)) {
      let j = i;
      if (s[j] === '_') j++;
      if (s[j] === '{') { const k = s.indexOf('}', j); if (k < 0) throw new ParseError('missing }', j); idx = parseInt(s.slice(j + 1, k), 10); i = k + 1; }
      else if (/\d/.test(s[j] || '')) { idx = +s[j]; i = j + 1; }
      else if (j !== i) throw new ParseError('expected an index after _', j);
    }
    toks.push({ t: 'name', v: name, idx, pos });
  }
  return toks;
}

/* values: {k:'s', v} scalar   or   {k:'e', v: Map, br: braid word | null} */
const Sc = v => ({ k: 's', v });
const El = (v, br) => ({ k: 'e', v, br: br || null });
const MAXPOW = 400;
const V = {
  elem(a) { return a.k === 's' ? El(T.scalar(a.v), F.isOne(a.v) ? [] : null) : a; },
  add(a, b) { if (a.k === 's' && b.k === 's') return Sc(F.add(a.v, b.v)); return El(T.add(V.elem(a).v, V.elem(b).v)); },
  sub(a, b) { return V.add(a, V.neg(b)); },
  neg(a) { return a.k === 's' ? Sc(F.neg(a.v)) : El(T.neg(a.v)); },
  mul(a, b) {
    if (a.k === 's' && b.k === 's') return Sc(F.mul(a.v, b.v));
    if (a.k === 's') return El(T.scale(b.v, a.v), F.isOne(a.v) ? b.br : null);
    if (b.k === 's') return El(T.scale(a.v, b.v), F.isOne(b.v) ? a.br : null);
    guardSize(a.v.size * b.v.size);
    return El(T.mul(a.v, b.v), a.br && b.br ? a.br.concat(b.br) : null);
  },
  div(a, b) {
    const c = b.k === 's' ? b.v : T.isScalar(b.v);
    if (c === null) throw new Error('can only divide by scalars — for an element y use inv(y) or y^-1');
    if (F.isZero(c)) throw new Error('division by zero');
    return V.mul(a, Sc(F.inv(c)));
  },
  pow(a, k) {
    if (Math.abs(k) > MAXPOW) throw new Error('exponent too large (|k| ≤ ' + MAXPOW + ')');
    if (a.k === 's') { if (k < 0 && F.isZero(a.v)) throw new Error('division by zero'); return Sc(F.pow(a.v, k)); }
    if (k >= 0) { guardSize(a.v.size * a.v.size); return El(T.pow(a.v, k), a.br ? repeat(a.br, k) : null); }
    if (a.br) { const ib = a.br.slice().reverse().map(g => -g); return El(T.pow(T.braid(ib), -k), repeat(ib, -k)); }
    return El(T.pow(T.inverse(a.v), -k));
  },
};
function repeat(w, k) { if (w.length * k > 5000) return null; let r = []; for (let i = 0; i < k; i++) r = r.concat(w); return r; }
function guardSize(pairs) {
  if (pairs > 2.1e6) throw new Error('that product needs ' + pairs.toLocaleString() + ' diagram compositions — too big to do here');
}
function toInt(a, what) {
  if (a.k !== 's') throw new Error(what + ' must be an integer');
  const c = a.v;
  if (F.isZero(c)) return 0;
  if (typeof c.n === 'bigint') { if (c.d === 1n) return Number(c.n); }
  else if (c.v === 0 && c.n.length === 1 && c.d.length === 1 && c.d[0] === 1n) return Number(c.n[0]);
  throw new Error(what + ' must be an integer');
}
function halfTwist(n) { const w = []; for (let j = 1; j < n; j++) for (let i = j; i >= 1; i--) w.push(i); return w; }

function evaluate(src) {
  const s = normalize(src);
  const toks = tokenize(s);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (t, v) => t && t.t === 'op' && t.v === v;
  const expect = v => { const t = toks[i]; if (!isOp(t, v)) throw new ParseError('expected “' + v + '”', t ? t.pos : s.length); i++; };
  const startsFactor = t => t && (t.t === 'num' || t.t === 'name' || t.t === 'dia' || isOp(t, '(') || isOp(t, '['));
  function expr() {
    let a = term();
    while (isOp(peek(), '+') || isOp(peek(), '-')) { const op = toks[i++].v; const b = term(); a = op === '+' ? V.add(a, b) : V.sub(a, b); }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      const t = peek();
      if (isOp(t, '*') || isOp(t, '/')) { i++; const b = unary(); a = t.v === '*' ? V.mul(a, b) : V.div(a, b); }
      else if (startsFactor(t)) a = V.mul(a, power());
      else return a;
    }
  }
  function unary() {
    if (isOp(peek(), '-')) { i++; return V.neg(unary()); }
    if (isOp(peek(), '+')) { i++; return unary(); }
    return power();
  }
  function power() {
    let b = atom();
    while (isOp(peek(), '^')) { i++; b = V.pow(b, exponent()); }
    return b;
  }
  function exponent() {
    let t = toks[i], sign = 1;
    if (t && t.t === 'dia' && /^[+-]?\d+$/.test(t.v)) { i++; return parseInt(t.v, 10); }
    if (isOp(t, '(')) { i++; const k = exponent(); expect(')'); return k; }
    while (isOp(t, '-') || isOp(t, '+')) { if (t.v === '-') sign = -sign; t = toks[++i]; }
    if (!t || t.t !== 'num' || !/^\d+$/.test(t.v)) throw new ParseError('exponent must be an integer', t ? t.pos : s.length);
    i++;
    return sign * parseInt(t.v, 10);
  }
  function args() {
    expect('(');
    const out = [];
    if (isOp(peek(), ')')) { i++; return out; }
    out.push(expr());
    while (isOp(peek(), ',')) { i++; out.push(expr()); }
    expect(')');
    return out;
  }
  function atom() {
    const t = toks[i++];
    if (!t) throw new ParseError('unexpected end of expression', s.length);
    if (t.t === 'num') { const q = TL.parseRational(t.v); return Sc(F.fromRat(q.n, q.d)); }
    if (t.t === 'dia') return El(T.fromCode(t.v));
    if (t.t === 'op') {
      if (t.v === '(') { const v = expr(); expect(')'); return v; }
      if (t.v === '[') { const v = expr(); expect(']'); return Sc(F.qint(toInt(v, 'the argument of [ ]'))); }
      throw new ParseError('unexpected “' + t.v + '”', t.pos);
    }
    const nm = t.v, n = S.n;
    const needIdx = () => { if (t.idx === null) throw new ParseError(nm + ' needs an index, e.g. ' + nm + '1', t.pos); return t.idx; };
    switch (nm) {
      case 'e': case 'U': return El(T.e(needIdx()));
      case 's': case 'σ': { const k = needIdx(); return El(T.sigma(k, 1), [k]); }
      case 'S': { const k = needIdx(); return El(T.sigma(k, -1), [-k]); }
      case 'p': case 'P':
        if (t.idx !== null) return El(T.jw(t.idx, 0));
        if (isOp(peek(), '(')) return jwArgs(args());
        return El(T.jw(n, 0));
      case 'A': if (!F.A) throw new ParseError('A is only available with ℚ(A) coefficients', t.pos); return Sc(F.A);
      case 'd': case 'δ': case 'delta': return Sc(F.delta);
      case 'id': case 'I': return El(T.identity(), []);
      case 'x': case 'y': case 'z': case 'ans': {
        const r = S.regs[nm];
        if (!r) throw new ParseError(nm + ' is empty' + (nm === 'ans' ? '' : ' — store a result with “→ ' + nm + '”'), t.pos);
        if (r.n !== S.n || r.rk !== ringKey()) throw new ParseError(nm + ' was stored for n = ' + r.n + (r.rk !== ringKey() ? ' with other coefficients' : ''), t.pos);
        return r.k === 's' ? Sc(r.v) : El(r.v, r.br);
      }
      case 'Δ': case 'half': case 'ft': {
        const w = halfTwist(n), word = nm === 'ft' ? w.concat(w) : w;
        if (!F.A && word.length) throw new ParseError('braids need ℚ(A) coefficients', t.pos);
        return El(T.braid(word), word);
      }
    }
    if (FUNCS.has(nm)) return applyFn(nm, args(), t.pos);
    throw new ParseError('unexpected ' + nm, t.pos);
  }
  function jwArgs(a) {
    if (!a.length) return El(T.jw(S.n, 0));
    const k = toInt(a[0], 'JW size'), at = a.length > 1 ? toInt(a[1], 'JW position') : 1;
    if (at < 1) throw new Error('JW position counts strands from 1');
    return El(T.jw(k, at - 1));
  }
  function applyFn(nm, a, pos) {
    const one = () => { if (a.length !== 1) throw new ParseError(nm + '( ) takes one argument', pos); return a[0]; };
    const n = S.n;
    switch (nm) {
      case 'tr': case 'trace': return Sc(T.trace(V.elem(one()).v));
      case 'plat': return Sc(T.plat(V.elem(one()).v));
      case 'star': case 'dual': case 'flip': { const x = one(); return x.k === 's' ? x : El(T.star(x.v), x.br && x.br.slice().reverse()); }
      case 'mirror': { const x = one(); return x.k === 's' ? x : El(T.mirror(x.v), x.br && x.br.map(g => Math.sign(g) * (n - Math.abs(g)))); }
      case 'rot': { if (!a.length || a.length > 2) throw new ParseError('rot(x) or rot(x, k)', pos); const x = V.elem(a[0]); return El(T.rot(x.v, a.length > 1 ? toInt(a[1], 'rotation') : 1)); }
      case 'bar': { const x = one(); return x.k === 's' ? Sc(F.bar(x.v)) : El(T.bar(x.v), x.br && x.br.map(g => -g)); }
      case 'inv': return V.pow(one(), -1);
      case 'qint': return Sc(F.qint(toInt(one(), 'qint argument')));
      case 'JW': return jwArgs(a);
    }
    throw new ParseError('unknown function ' + nm, pos);
  }
  const v = expr();
  if (i < toks.length) throw new ParseError('unexpected “' + (toks[i].v || '') + '”', toks[i].pos);
  return { v, normalized: s };
}

/* ============================================================ evaluation */
function run(opts = {}) {
  const src = $('#expr').value;
  writeHash();
  S.error = null; S.selTerm = null;
  try {
    setup();
    if (!src.trim()) { S.result = null; renderAll(); return; }
    const { v } = evaluate(src);
    S.result = { k: v.k, v: v.v, br: v.br || null, n: S.n, rk: ringKey(), src };
    S.regs.ans = S.result;
    S.showAll = false; S.heavy = false; S.mp = null;
    if (!opts.noHistory) pushHistory(src);
  } catch (e) {
    S.result = null;
    S.error = { msg: e.message || String(e), pos: e instanceof ParseError ? e.pos : undefined, src };
    if (!(e instanceof Error)) console.error(e);
  }
  renderAll();
}
function renderAll() { renderStage(); renderStatus(); renderError(); renderInvariants(); renderRegs(); renderInspector(); }
function renderError() {
  const el = $('#err'), E = S.error;
  if (!E) { el.innerHTML = ''; return; }
  let h = esc(E.msg);
  if (E.pos !== undefined) h += '<span class="caret">' + esc(normalize(E.src)) + '\n' + ' '.repeat(Math.max(0, E.pos)) + '^</span>';
  el.innerHTML = h;
}

/* ============================================================ stage */
const TERM_LIMIT = 150;
function renderStage() {
  const st = $('#stage');
  if (S.mode === 'builder') { st.innerHTML = builderHtml(); renderEditor(); renderComposer(); return; }
  const R = S.result;
  const cap = '<div class="stage-caption">TL<sub>' + S.n + '</sub> over <span class="m">' + esc(F.label) + '</span></div>';
  if (!R) {
    st.innerHTML = '<div class="stage-inner">' + cap + '<div class="scalar-big" style="color:var(--ink-faint)">' + (S.error ? '—' : 'enter an expression') + '</div></div>';
    return;
  }
  const lhs = '<div class="stage-caption" style="letter-spacing:0;text-transform:none;font-family:var(--mono);font-size:13px;color:var(--ink-dim)">' + esc(R.src) + '</div>';
  if (R.k === 's') {
    st.innerHTML = '<div class="stage-inner">' + cap + lhs + '<div class="scalar-big">= ' + ch(R.v) + '</div></div>';
    return;
  }
  const x = R.v;
  if (!x.size) {
    st.innerHTML = '<div class="stage-inner">' + cap + lhs + '<div class="scalar-big">= 0</div></div>';
    return;
  }
  const B = T.B, W = TL.words(B), entries = [...x];
  const shown = S.showAll ? entries : entries.slice(0, TERM_LIMIT);
  const body = withOpts(x.values(), () => (S.view === 'diagrams' ? equationHtml(shown, B, W) : wordsHtml(shown, W)));
  const more = entries.length > shown.length ? `<div class="stage-more"><button class="toggle-btn" id="showAll" style="width:auto">show all ${entries.length} terms</button></div>` : '';
  st.innerHTML = '<div class="stage-inner">' + cap + lhs + body + more + '</div>';
}
function equationHtml(shown, B, W) {
  let h = '<div class="equation"><span class="eq-lhs">=</span>';
  shown.forEach(([id, c], k) => {
    const p = coefParts(c);
    const op = p.neg ? MINUS : k ? '+' : '';
    if (op) h += '<span class="op">' + op + '</span>';
    const coef = p.abs === '1' ? '' : '<span class="coef">' + (p.compound ? '(' + p.abs + ')' : p.abs) + '</span>';
    h += `<span class="tile${S.selTerm === id ? ' sel' : ''}" data-id="${id}" title="${esc(wordText(W[id]))}">${coef}${stageDiagram(B.mats[id], S.n)}</span>`;
  });
  return h + '</div>';
}
function wordsHtml(shown, W) {
  return '<div class="words-big">= ' + shown.map(([id, c], k) => {
    const p = coefParts(c), w = W[id];
    let body;
    if (!w.length) body = p.abs;
    else if (p.abs === '1') body = '<span class="w">' + wordHtml(w) + '</span>';
    else body = (p.compound ? '(' + p.abs + ')' : p.abs) + ' <span class="w">' + wordHtml(w) + '</span>';
    return '<span style="white-space:nowrap">' + (p.neg ? (k ? ' ' + MINUS + ' ' : MINUS) : k ? ' + ' : '') + body + '</span>';
  }).join('') + '</div>';
}
function resultText() {
  const R = S.result;
  if (!R) return '';
  if (R.k === 's') return F.text(R.v, fo());
  if (!R.v.size) return '0';
  const W = TL.words(T.B);
  return withOpts(R.v.values(), () => [...R.v].map(([id, c]) => textCoefTerm(c, wordText(W[id])))
    .reduce((acc, t, i) => (i === 0 ? t : t.startsWith('-') ? acc + ' - ' + t.slice(1) : acc + ' + ' + t), ''));
}

/* ============================================================ status banner */
function renderStatus() {
  const b = $('#status-banner'), t = $('#status-text'), R = S.result;
  b.classList.remove('verified', 'failed', 'warning', 'pending');
  if (S.error) {
    b.classList.add('failed');
    t.innerHTML = '<span class="sum">' + esc(S.error.msg) + '</span>';
    return;
  }
  if (!R) { t.innerHTML = '<span class="sum">TL<sub>' + S.n + '</sub> · ' + esc(F.label) + '</span>'; return; }
  const ex = '<div class="expr">' + esc(R.src) + '</div>';
  if (R.k === 's') { t.innerHTML = '<span class="sum">a scalar</span>' + ex; return; }
  const x = R.v;
  if (!x.size) {
    const trivial = /^\s*0\s*$/.test(R.src);
    if (!trivial) b.classList.add('verified');
    t.innerHTML = '<span class="sum">' + (trivial ? 'zero' : '= 0 — the relation holds') + '</span>' + ex;
    return;
  }
  const ths = [...x.keys()].map(id => T.B.through[id]);
  const lo = Math.min(...ths), hi = Math.max(...ths);
  let sum = x.size + ' of ' + T.B.size + ' diagrams · through-strands ' + (lo === hi ? lo : lo + '–' + hi);
  if (R.br) sum += ' · braid of length ' + R.br.length;
  t.innerHTML = '<span class="sum">' + sum + '</span>' + ex;
}

/* ============================================================ term inspector */
function renderInspector() {
  const el = $('#face-info'), R = S.result, id = S.selTerm;
  if (S.mode !== 'result' || !R || R.k !== 'e' || id === null || !R.v.has(id)) { el.hidden = true; return; }
  const B = T.B, W = TL.words(B), c = R.v.get(id);
  const coef = withOpts(R.v.values(), () => ch(c));
  el.hidden = false;
  el.innerHTML = '<button class="fi-close" data-act="close" aria-label="Close">×</button>' +
    `<div class="fi-row"><span class="fi-key">coefficient</span><span class="fi-val">${coef}</span></div>` +
    `<div class="fi-row"><span class="fi-key">word</span><span class="fi-val">${wordHtml(W[id])}</span></div>` +
    `<div class="fi-row"><span class="fi-key">code</span><span class="fi-val code">{${B.codes[id]}}</span></div>` +
    `<div class="fi-row"><span class="fi-key">through</span><span class="fi-val">${B.through[id]} strand${B.through[id] === 1 ? '' : 's'}</span></div>` +
    '<div class="chip-row" style="margin-top:4px"><button class="btn btn-add-alt" data-act="builder">Open in builder</button><button class="btn btn-add-alt" data-act="insert">Insert {…}</button></div>';
}

/* ============================================================ invariants */
function prop(yes, label, detail, extra) {
  return `<div class="prop ${yes ? 'yes' : ''}"><span class="mk">${yes ? '✓' : '·'}</span><span>${label}${detail ? ' <span class="detail">' + detail + '</span>' : ''}</span>${extra || ''}</div>`;
}
const card = (label, body) => '<div class="control-group"><span class="control-label">' + label + '</span>' + body + '</div>';
function renderInvariants() {
  const R = S.result, el = $('#inv');
  if (!R) { el.innerHTML = '<p class="empty-message">' + (S.error ? 'Fix the expression to see its invariants.' : 'Evaluate an expression.') + '</p>'; return; }
  if (R.k === 's') {
    let h = '<dl class="kv"><dt>value</dt><dd>' + ch(R.v) + '</dd>';
    if (F.kind === 'A' && S.deltaForm && TL.RF.toDelta(R.v)) h += '<dt>in A</dt><dd>' + chA(R.v) + '</dd>';
    el.innerHTML = card('Scalar', h + '</dl><p class="note">Scalars have no further invariants — evaluate an element, or wrap one in <b>tr( )</b> or <b>plat( )</b>.</p>');
    return;
  }
  const x = R.v, n = S.n;
  const tr = T.trace(x);
  let h = '<dl class="kv"><dt>Markov trace tr(x)</dt><dd class="big">' + ch(tr) + '</dd>';
  if (!F.isZero(F.delta)) h += '<dt>tr(x)/δ<sup>' + n + '</sup></dt><dd>' + ch(F.div(tr, F.dpow(n))) + '</dd>';
  if (n % 2 === 0) h += '<dt>plat closure</dt><dd>' + ch(T.plat(x)) + '</dd>';
  let out = card('Closures', h + '</dl>');
  if (R.br && F.A) out += braidCard(R.br, x);
  const central = x.size > 0 && T.commutesWithAll(x);
  out += card('Structure', '<div class="props">' + properties(x, central) + '</div>');
  out += card('Cell modules W<sub>' + n + ',k</sub>', cellSection(x, central));
  out += '<div class="control-group" id="matSect">' + matrixSection(x) + '</div>';
  out += '<div class="control-group" id="mpSect">' + minpolySection() + '</div>';
  el.innerHTML = out;
}
function braidCard(br, x) {
  const n = S.n;
  let h = '<p class="note">β = <span class="m" style="color:var(--ink);font-size:14px">' + braidHtml(br) + '</span> in B<sub>' + n + '</sub></p><dl class="kv">';
  const one = (label, bracketRaw, plat) => {
    const info = TL.braidClosure(br, n, plat);
    const brk = F.div(bracketRaw, F.delta);
    const js = TL.jonesFromBracket(brk, info.writhe);
    return `<dt>${label}</dt><dd class="plain">${info.components} component${info.components === 1 ? '' : 's'}, writhe ${info.writhe < 0 ? MINUS + -info.writhe : info.writhe}</dd>` +
      `<dt>Kauffman bracket</dt><dd>${chA(brk)}</dd>` +
      `<dt>Jones V(t)</dt><dd class="big">${js ? TL.laurentT(js, true) : '—'}</dd>`;
  };
  h += one('Markov closure', T.trace(x), false);
  if (n % 2 === 0) h += one('Plat closure', T.plat(x), true);
  h += '</dl><p class="note">⟨○⟩ = 1; σ<sub>i</sub> has writhe +1; V(t) = (' + MINUS + 'A<sup>3</sup>)<sup>' + MINUS + 'w</sup>⟨L⟩ at A = t<sup>' + MINUS + '1/4</sup>. The plat closure is oriented by walking it from the top-left.</p>';
  return card('Braid closure', h);
}
function properties(x, central) {
  const n = S.n, B = T.B;
  let h = '';
  if (!x.size) return prop(true, 'zero');
  if (T.isScalar(x) !== null) h += prop(true, 'a scalar multiple of 1');
  if (x.size * x.size <= 40000 || S.heavy) {
    const x2 = T.mul(x, x), id0 = x.keys().next().value;
    if (T.eq(x2, x)) h += prop(true, 'idempotent', 'x² = x');
    else if (!x2.size) h += prop(true, 'square-zero', 'x² = 0');
    else {
      const c = x2.has(id0) ? F.div(x2.get(id0), x.get(id0)) : null;
      if (c && T.eq(x2, T.scale(x, c))) h += prop(true, 'quasi-idempotent', 'x² = ' + paren(ch(c)) + '·x');
      else h += prop(false, 'idempotent');
    }
  } else h += prop(false, 'x² not checked (' + x.size + ' terms)', '', '<button id="heavyBtn" class="btn btn-add-alt" style="padding:2px 10px">check</button>');
  h += prop(central, 'central', central ? 'commutes with every e<sub>i</sub>' : '');
  const kl = n > 1 && T.killedBy(x, 'left'), kr = n > 1 && T.killedBy(x, 'right');
  if (kl || kr) {
    h += prop(true, 'killed by every e<sub>i</sub> on the ' + (kl && kr ? 'left and right' : kl ? 'left' : 'right'));
    if (kl && kr) {
      try {
        const p = T.jw(n), c = x.get(B.identity);
        if (c && T.eq(x, T.scale(p, c))) h += prop(true, 'a multiple of the Jones–Wenzl projector', 'x = ' + (F.isOne(c) ? '' : paren(ch(c)) + '·') + 'p<sub>' + n + '</sub>');
      } catch (e) { /* p_n undefined at this δ */ }
    }
  } else h += prop(false, 'killed by the e<sub>i</sub>');
  const sa = T.eq(T.star(x), x);
  h += prop(sa, 'self-adjoint', sa ? 'x* = x' : '');
  const mi = T.eq(T.mirror(x), x);
  h += prop(mi, 'mirror-symmetric', mi ? 'left↔right' : '');
  let kmax = 0;
  for (const id of x.keys()) kmax = Math.max(kmax, B.through[id]);
  h += prop(kmax < n, 'in the ideal J<sub>' + kmax + '</sub>', kmax < n ? '≤ ' + kmax + ' through-strands' : '');
  return h;
}
function cellSection(x, central) {
  const n = S.n;
  let rows = '', sum = F.zero;
  for (let k = n % 2; k <= n; k += 2) {
    const chi = T.cellChar(x, k), dim = TL.cellDim(n, k);
    sum = F.add(sum, F.mul(F.qint(k + 1), chi));
    let scal = '';
    if (central) {
      const M = T.cellMatrix(x, k);
      let ok = true;
      for (let i = 0; i < M.length && ok; i++) for (let j = 0; j < M.length; j++) if (i === j ? !F.eq(M[i][i], M[0][0]) : !F.isZero(M[i][j])) { ok = false; break; }
      scal = ok ? ch(M[0][0]) : '—';
    }
    rows += `<tr><td>${k}</td><td>${dim}</td><td class="m">${ch(F.qint(k + 1))}</td><td class="m">${ch(chi)}</td>${central ? '<td class="m">' + scal + '</td>' : ''}</tr>`;
  }
  const good = F.eq(sum, T.trace(x));
  return '<div class="tbl-wrap"><table class="tbl"><tr><th>k</th><th>dim</th><th>[k+1]</th><th>χ<sub>k</sub>(x)</th>' + (central ? '<th>acts by</th>' : '') + '</tr>' + rows + '</table></div>' +
    `<p class="note">${good ? '<span class="ok">✓</span>' : '✗'} tr(x) = Σ<sub>k</sub> [k+1]·χ<sub>k</sub>(x), where χ<sub>k</sub> is the trace on the cell module with k through-strands.</p>`;
}
function matrixSection(x) {
  const n = S.n, ks = [];
  for (let k = n % 2; k <= n; k += 2) ks.push(k);
  if (S.matK === null || !ks.includes(S.matK)) S.matK = ks.includes(n - 2) ? n - 2 : ks[0];
  const C = TL.cellModule(T.B, S.matK);
  let h = '<span class="control-label">Matrices</span>' +
    '<div class="seg-selector"><div class="seg-options" id="matKind"><button class="seg-opt ' + (S.matKind === 'rho' ? 'active' : '') + '" data-k="rho">ρ(x)</button><button class="seg-opt ' + (S.matKind === 'gram' ? 'active' : '') + '" data-k="gram">Gram form</button></div>' +
    '<span class="seg-label" style="min-width:0">on W<sub>' + n + ',k</sub>, k =</span><select id="matK" class="select-input" style="flex:none;width:64px">' + ks.map(k => `<option value="${k}" ${k === S.matK ? 'selected' : ''}>${k}</option>`).join('') + '</select></div>';
  if (C.size > 42) return h + '<p class="note">too large to display (' + C.size + '×' + C.size + ')</p>';
  const M = S.matKind === 'rho' ? T.cellMatrix(x, S.matK)
    : Array.from({ length: C.size }, (_, a) => Array.from({ length: C.size }, (_, b) => { const l = C.gram(a, b); return l < 0 ? F.zero : F.dpow(l); }));
  const hdr = C.states.map(st => '<th>' + stateSVG(st, n) + '</th>').join('');
  h += '<div class="tbl-wrap"><table class="mat"><tr><th></th>' + hdr + '</tr>' + withOpts(M.flat(), () => {
    let rows = '';
    for (let i = 0; i < C.size; i++) {
      rows += '<tr><th>' + stateSVG(C.states[i], n) + '</th>';
      for (let j = 0; j < C.size; j++) rows += F.isZero(M[i][j]) ? '<td class="z">0</td>' : '<td>' + ch(M[i][j]) + '</td>';
      rows += '</tr>';
    }
    return rows;
  }) + '</table></div><p class="note">' + (S.matKind === 'rho'
    ? 'Column = link state v (dim ' + C.size + '), row = the link state in x·v; joining two defects gives 0.'
    : '⟨v, w⟩ = δ<sup>#loops</sup> when v reflected onto w pairs defects with defects, else 0.') + '</p>';
  return h;
}
function minpolySection() {
  const head = '<span class="control-label">Minimal polynomial</span>';
  if (S.mp && S.mp.forResult === S.result) {
    const mp = S.mp;
    if (mp.error) return head + '<p class="note">' + esc(mp.error) + '</p>';
    const inv = !F.isZero(mp.c[0]);
    return head + '<div class="minpoly">m<sub>x</sub>(X) = ' + withOpts(mp.c, () => polyInX(mp.c)) + '</div>' +
      '<div class="props">' + prop(inv, inv ? 'invertible' : 'not invertible', inv ? 'm<sub>x</sub>(0) ≠ 0' : 'm<sub>x</sub>(0) = 0',
        inv ? '<button id="invBtn" class="btn btn-add-alt" style="padding:2px 10px">x⁻¹</button>' : '') + '</div>';
  }
  const big = T.B.size > 132 && F.kind !== 'num';
  return head + '<button id="mpBtn" class="toggle-btn">Compute m<sub>x</sub>(X)</button>' +
    '<p class="note">The smallest monic m with m(x) = 0, by row-reducing 1, x, x², … in the ' + T.B.size + '-dimensional regular representation.' + (big ? ' May take a while for n ≥ 7.' : '') + '</p>';
}

/* ============================================================ algebra */
const gramCache = {};
function renderAlgebra() {
  const n = S.n, el = $('#alg');
  $('#algTitle').innerHTML = 'TL<sub>' + n + '</sub>(δ) over ' + esc(F.label) + ': dimension, Gram determinants of the cell modules, and where it fails to be semisimple.';
  if (!gramCache[n]) {
    gramCache[n] = {};
    for (let k = n % 2; k <= n; k += 2) gramCache[n][k] = TL.gramDet(n, k);
  }
  const C = [1, 1, 2, 5, 14, 42, 132, 429, 1430][n];
  const isNum = F.kind === 'num';
  let rows = '', numZero = false;
  const ms = new Set();
  for (let k = n % 2; k <= n; k += 2) {
    const det = gramCache[n][k], rf = TL.rfFromPoly(det);
    TL.factorPoly(rf.n, 'delta').factors.forEach(f => ms.add(f.m));
    if (rf.v > 0) ms.add(4);
    let extra = '';
    if (isNum) {
      const [N] = TL.P.evalQ(det, F.delta.n, F.delta.d);
      const Cm = TL.cellModule(T.B, k);
      const G = Array.from({ length: Cm.size }, (_, a) => Array.from({ length: Cm.size }, (_, b) => { const l = Cm.gram(a, b); return l < 0 ? F.zero : F.dpow(l); }));
      if (N === 0n) numZero = true;
      extra = `<td>${N === 0n ? '0' : '≠ 0'}</td><td>${TL.rankOver(F, G)}</td>`;
    }
    rows += `<tr><td>${k}</td><td>${TL.cellDim(n, k)}</td><td class="m">${TL.rfHtml(rf, 'δ', 'delta', true)}</td>${extra}</tr>`;
  }
  let h = card('Dimension', '<dl class="kv"><dt>dim TL<sub>' + n + '</sub></dt><dd class="plain">C<sub>' + n + '</sub> = ' + C + ' (Catalan) = Σ<sub>k</sub> (dim W<sub>' + n + ',k</sub>)²</dd>' +
    '<dt>relations</dt><dd class="plain">' + (n > 1 ? 'e<sub>i</sub>² = δe<sub>i</sub>, e<sub>i</sub>e<sub>i±1</sub>e<sub>i</sub> = e<sub>i</sub>, e<sub>i</sub>e<sub>j</sub> = e<sub>j</sub>e<sub>i</sub> for |i−j| ≥ 2' : 'none — TL<sub>1</sub> is the ground field') + '</dd></dl>');
  let note;
  if (isNum) {
    let firstBad = 0;
    for (let j = 2; j <= n; j++) if (F.isZero(F.qint(j))) { firstBad = j; break; }
    note = (numZero
      ? '<b>Not semisimple</b> at δ = ' + esc(F.text(F.delta)) + ': some Gram forms degenerate. dim L = rank of the Gram form = dimension of the simple head of W<sub>n,k</sub>.'
      : '<b>Semisimple</b> at δ = ' + esc(F.text(F.delta)) + ': every cell module is simple.') +
      (firstBad ? ' Jones–Wenzl projectors exist only up to p<sub>' + (firstBad - 1) + '</sub>, since [' + firstBad + '] = 0.' : '');
  } else {
    const msl = [...ms].sort((a, b) => a - b);
    note = msl.length
      ? 'Generically semisimple. It fails exactly when δ = q + q<sup>' + MINUS + '1</sup> with q a primitive m-th root of unity, m ∈ {' + msl.join(', ') + '}. Factors are minimal polynomials of 2cos(2π/m); δ itself is m = 4.'
      : 'Semisimple for every δ.';
  }
  h += card('Gram determinants', '<div class="tbl-wrap"><table class="tbl"><tr><th>k</th><th>dim W</th><th>det G<sub>' + n + ',k</sub></th>' + (isNum ? '<th>at δ</th><th>dim L</th>' : '') + '</tr>' + rows + '</table></div><p class="note">' + note + '</p>');
  el.innerHTML = h;
}

/* ============================================================ diagram builder */
const cyc = p => (p < S.n ? p : 3 * S.n - 1 - p);
function builderHtml() {
  return '<div class="stage-inner"><div class="builder-stage">' +
    '<div class="stage-card"><div class="control-row" style="justify-content:space-between"><h3>Diagram builder <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink-faint)">— click two boundary points to join them</span></h3>' +
    '<button class="toggle-btn" style="width:auto;padding:4px 12px" data-b="back">← Result</button></div>' +
    '<svg id="editor" role="img" aria-label="diagram editor"></svg><div class="bstatus" id="bstatus"></div>' +
    '<div class="chip-row">' +
    '<button class="btn btn-add" data-b="use">Use as expression</button><button class="btn btn-add-alt" data-b="insert">Insert {…}</button>' +
    '<button class="toggle-btn" style="width:auto" data-b="top">→ top</button><button class="toggle-btn" style="width:auto" data-b="bot">→ bottom</button>' +
    '<button class="toggle-btn" style="width:auto" data-b="id">identity</button><button class="toggle-btn" style="width:auto" data-b="rand">random</button><button class="toggle-btn" style="width:auto" data-b="clear">clear</button>' +
    '</div></div>' +
    '<div class="stage-card"><h3>Stacking</h3><div class="comp-row" id="compPic"></div><div class="comp-note" id="compNote"></div></div>' +
    '</div></div>';
}
function renderEditor() {
  const svg = $('#editor');
  if (!svg) return;
  const n = S.n, g = geom(n, 54, 160, 30, 34), m = S.bm;
  svg.setAttribute('viewBox', `0 0 ${g.W} ${g.y1 + 34}`);
  svg.style.width = Math.min(560, g.W * 1.2) + 'px';
  const { norm } = arcPaths(m, g);
  let pts = '', labels = '';
  for (let p = 0; p < 2 * n; p++) {
    const top = p < n, i = top ? p : p - n, X = g.X(i), Y = top ? g.y0 : g.y1;
    const cls = 'pt' + (S.sel === p ? ' sel' : '') + (m[p] < 0 ? ' free' : '');
    pts += `<g class="${cls}" data-p="${p}"><circle class="hit" cx="${X}" cy="${Y}" r="16"/><circle class="dot" cx="${X}" cy="${Y}" r="6.5"/></g>`;
    labels += `<text x="${X}" y="${top ? Y - 15 : Y + 24}" text-anchor="middle" font-size="12" fill="var(--ink-faint)" font-family="var(--font)">${i + 1}${top ? '' : '′'}</text>`;
  }
  svg.innerHTML = frame(g) + `<path d="${norm}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>` + labels + pts;
  const done = [...m].every(q => q >= 0), st = $('#bstatus');
  $$('[data-b="use"],[data-b="insert"],[data-b="top"],[data-b="bot"]').forEach(b => { b.disabled = !done; });
  st.classList.toggle('warn', !!S.bmsg);
  if (S.bmsg) st.textContent = S.bmsg;
  else if (done) {
    const id = T.B.idOf(m), w = TL.words(T.B)[id];
    st.innerHTML = 'code <span class="code">{' + T.B.codes[id] + '}</span> · word <span class="m">' + wordHtml(w) + '</span> · ' + T.B.through[id] + ' through-strand' + (T.B.through[id] === 1 ? '' : 's');
  } else {
    const k = [...m].filter(q => q >= 0).length;
    st.textContent = S.sel >= 0 ? 'now click the point to join it to (click it again to ' + (m[S.sel] >= 0 ? 'cut its strand' : 'cancel') + ')' : k + ' of ' + 2 * n + ' points joined — amber points are still free';
  }
}
function clickPoint(p) {
  S.bmsg = '';
  const m = S.bm;
  if (S.sel < 0) { S.sel = p; return renderEditor(); }
  if (S.sel === p) {
    if (m[p] >= 0) { m[m[p]] = -1; m[p] = -1; }
    S.sel = -1; return renderEditor();
  }
  const a = S.sel, b = p, t = Int8Array.from(m);
  for (const q of [a, b]) if (t[q] >= 0) { t[t[q]] = -1; t[q] = -1; }
  const pa = cyc(a), pb = cyc(b), lo = Math.min(pa, pb), hi = Math.max(pa, pb);
  if ((hi - lo - 1) % 2) { S.bmsg = 'That strand would enclose an odd number of points, so the rest could never be paired without crossings.'; S.sel = -1; return renderEditor(); }
  for (let q = 0; q < 2 * S.n; q++) {
    const r = t[q];
    if (r < 0 || r < q) continue;
    if ((cyc(q) > lo && cyc(q) < hi) !== (cyc(r) > lo && cyc(r) < hi)) { S.bmsg = 'That strand would cross an existing one — Temperley–Lieb diagrams are planar.'; S.sel = -1; return renderEditor(); }
  }
  t[a] = b; t[b] = a;
  S.bm = t; S.sel = -1;
  renderEditor();
}
function resetBuilder() {
  S.bm = Int8Array.from(T.B.mats[T.B.identity]); S.sel = -1; S.bmsg = '';
  const g1 = S.n > 1 ? T.B.mats[T.B.gen(1)] : T.B.mats[T.B.identity];
  S.top = Int8Array.from(g1); S.bot = Int8Array.from(g1);
}
function loopMids(A, B, n) {
  const mid = new Uint8Array(n);
  const fromA = p => { for (;;) { const q = A[p]; if (q < n) return; const j = q - n; mid[j] = 1; const r = B[j]; if (r >= n) return; mid[r] = 1; p = n + r; } };
  const fromB = p => { for (;;) { const q = B[p]; if (q >= n) return; mid[q] = 1; const r = A[n + q]; if (r < n) return; const j = r - n; mid[j] = 1; p = j; } };
  for (let i = 0; i < n; i++) fromA(i);
  for (let i = n; i < 2 * n; i++) fromB(i);
  return mid;
}
function renderComposer() {
  const pic = $('#compPic'), note = $('#compNote');
  if (!pic) return;
  const n = S.n;
  if (!S.top || !S.bot) { pic.innerHTML = ''; note.textContent = ''; return; }
  const A = S.top, B = S.bot, mid = loopMids(A, B, n);
  const s = 34, H = 80, px = 10, py = 8;
  const gA = geom(n, s, H, px, py), gB = geom(n, s, H, px, py + H);
  const pA = arcPaths(A, gA, (kind, a) => kind === 'cup' && !mid[a[0]]);
  const pB = arcPaths(B, gB, (kind, a) => kind === 'cap' && !mid[a[0]]);
  const W = gA.W, Ht = 2 * H + 2 * py;
  const stacked = `<svg width="${W}" height="${Ht}" viewBox="0 0 ${W} ${Ht}" aria-label="stacked diagrams">` +
    `<path d="M${px * .4} ${py}H${W - px * .4}M${px * .4} ${py + 2 * H}H${W - px * .4}" stroke="var(--hairline-strong)"/>` +
    `<path d="M${px * .4} ${py + H}H${W - px * .4}" stroke="var(--ink-faint)" stroke-dasharray="3 4"/>` +
    `<path d="${pA.norm}${pB.norm}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="${pA.spec}${pB.spec}" fill="none" stroke="var(--loop)" stroke-width="2.8" stroke-linecap="round"/></svg>`;
  const c = TL.compose(A, B, n), id = T.B.idOf(c.R);
  const coef = c.loops ? (c.loops === 1 ? 'δ' : 'δ<sup>' + c.loops + '</sup>') + ' ·' : '';
  pic.innerHTML = stacked + '<span class="eq">=</span><span class="eq">' + coef + '</span>' + diagramSVG(c.R, n, { s: 26, h: 2 * H - 24, sw: 2.2 });
  const Wd = TL.words(T.B), idA = T.B.idOf(A), idB = T.B.idOf(B);
  note.innerHTML = '<span class="m" style="color:var(--ink)">' + wordHtml(Wd[idA]) + ' · ' + wordHtml(Wd[idB]) + ' = ' + (c.loops ? (c.loops === 1 ? 'δ ' : 'δ<sup>' + c.loops + '</sup> ') : '') + wordHtml(Wd[id]) + '</span><br>' +
    (c.loops ? '<span class="loop-key">' + c.loops + ' closed loop' + (c.loops > 1 ? 's' : '') + '</span>, each worth a factor δ.' : 'No closed loops.') +
    ' The top diagram is the left factor. Send diagrams here with “→ top” / “→ bottom”.';
}

/* ============================================================ generator pills */
function renderPills() {
  const n = S.n, el = $('#isometry-controls');
  if (n < 2) { el.innerHTML = ''; return; }
  let h = '';
  for (let i = 1; i < n; i++) h += `<button class="isometry-btn" data-g="e${i}" title="click: x·e${i} · ⌘/Ctrl-click: e${i}·x">e${sub(i)}</button>`;
  if (F.A && S.mode === 'result') {
    h += '<span class="pill-sep"></span>';
    for (let i = 1; i < n; i++) h += `<button class="isometry-btn braid" data-g="s${i}" title="click: x·σ${i} · ⌘/Ctrl-click: σ${i}·x · ⇧: σ${i}⁻¹">σ${sub(i)}</button>`;
  }
  el.innerHTML = h;
}
function pillClick(g, left, inverse) {
  if (S.mode === 'builder') {
    const gm = T.B.mats[T.B.gen(+g.slice(1))];
    if (![...S.bm].every(q => q >= 0)) { S.bmsg = 'Finish the diagram first.'; renderEditor(); return; }
    const c = left ? TL.compose(gm, S.bm, S.n) : TL.compose(S.bm, gm, S.n);
    S.bm = Int8Array.from(c.R); S.sel = -1;
    S.bmsg = c.loops ? 'Multiplied by e' + g.slice(1) + ' — ' + c.loops + ' loop' + (c.loops > 1 ? 's' : '') + ' removed (a factor δ' + (c.loops > 1 ? '^' + c.loops : '') + ').' : '';
    renderEditor();
    return;
  }
  const tok = g + (inverse && g[0] === 's' ? '^-1' : '');
  const src = $('#expr').value.trim();
  const wrapped = !src ? '' : /^[A-Za-z0-9_^\s{}()δσΔ]*$/.test(src) && !/[+\-/*]/.test(src) ? src : '(' + src + ')';
  $('#expr').value = !wrapped ? tok : left ? tok + ' ' + wrapped : wrapped + ' ' + tok;
  run();
}

/* ============================================================ palette / registers / history */
function renderPalette() {
  const n = S.n, isA = !!(F && F.A);
  const btn = (label, ins, o = {}) => `<button class="chip ${o.cls || ''}" data-ins="${esc(ins)}" ${o.wrap ? 'data-wrap="1"' : ''} ${o.dis ? 'disabled' : ''} title="${esc(o.title || ins)}">${label}</button>`;
  let gens = btn('1', '1'), br = '', jw = '';
  for (let i = 1; i < n; i++) gens += btn('e' + sub(i), 'e' + i);
  const bt = isA ? '' : ' — needs ℚ(A)';
  for (let i = 1; i < n; i++) br += btn('σ' + sub(i), 's' + i, { dis: !isA, title: 's' + i + bt });
  for (let i = 1; i < n; i++) br += btn('σ' + sub(i) + '⁻¹', 's' + i + '^-1', { dis: !isA, title: 's' + i + '^-1' + bt });
  if (n > 1) br += btn('Δ', 'Δ', { dis: !isA, title: 'half twist' + bt }) + btn('Δ²', 'ft', { dis: !isA, title: 'full twist Δ², central' + bt });
  for (let k = 2; k <= n; k++) jw += btn('p' + sub(k), 'p' + k, { title: 'Jones–Wenzl projector on strands 1–' + k });
  const sc = btn('δ', 'd') + btn('A', 'A', { dis: !isA, title: 'A' + bt }) + btn('[k]', '[2]', { title: 'quantum integer, [2] = δ' });
  const fns = ['tr', 'plat', 'star', 'mirror', 'rot', 'bar', 'inv'].map(f =>
    btn(f, f, { cls: 'fn', wrap: true, dis: f === 'plat' && n % 2, title: f + '( ) — wraps the selection, or the whole expression, and evaluates' })).join('');
  const regs = ['x', 'y', 'z', 'ans'].map(r => btn(r, r, { cls: 'reg', title: 'stored result ' + r })).join('');
  const row = (l, b) => `<div class="pal-row"><span class="control-label">${l}</span><div class="chips">${b}</div></div>`;
  $('#palette').innerHTML = row('generators', gens) + (n > 1 ? row('braids', br) : '') + (jw ? row('projectors', jw) : '') +
    row('scalars', sc) + row('operations', fns) + row('registers', regs);
  renderRegs();
}
function renderRegs() {
  $$('#palette .chip.reg').forEach(b => {
    const r = S.regs[b.dataset.ins];
    b.classList.toggle('set', !!(r && r.n === S.n && r.rk === ringKey()));
  });
}
function insertToken(tok) {
  const inp = $('#expr'), s = inp.value;
  const a = inp.selectionStart ?? s.length, b = inp.selectionEnd ?? s.length;
  const before = s.slice(0, a), after = s.slice(b);
  const ins = (before.length && /[\w)\]}δσΔ]$/.test(before) && /^[\w({[δσΔ]/.test(tok) ? ' ' : '') + tok;
  inp.value = before + ins + after;
  inp.focus();
  inp.setSelectionRange(a + ins.length, a + ins.length);
}
function wrapFn(fn) {
  const inp = $('#expr'), s = inp.value;
  const a = inp.selectionStart ?? 0, b = inp.selectionEnd ?? 0;
  if (a !== b) inp.value = s.slice(0, a) + fn + '(' + s.slice(a, b) + ')' + s.slice(b);
  else if (s.trim()) inp.value = fn + '(' + s.trim() + ')';
  else { inp.value = fn + '()'; inp.focus(); inp.setSelectionRange(fn.length + 1, fn.length + 1); return; }
  run();
}
const HKEY = 'tlcalc.history';
let HIST = [];
try { HIST = JSON.parse(localStorage.getItem(HKEY) || '[]'); if (!Array.isArray(HIST)) HIST = []; } catch (e) { HIST = []; }
let hpos = -1;
function pushHistory(src) {
  HIST = [src].concat(HIST.filter(h => h !== src)).slice(0, 14);
  hpos = -1;
  try { localStorage.setItem(HKEY, JSON.stringify(HIST)); } catch (e) { /* storage unavailable */ }
  renderHistory();
}
function renderHistory() {
  $('#history').innerHTML = HIST.length
    ? HIST.map((h, i) => `<button class="std-gen-item" data-h="${i}" title="${esc(h)}">${esc(h)}</button>`).join('')
    : '<p class="empty-message">Nothing evaluated yet.</p>';
}

/* ============================================================ examples */
const EXAMPLES = [
  { cat: 'Jones–Wenzl projectors', items: [
    { label: 'The projector p₄', n: 4, ring: 'delta', expr: 'p4', desc: 'The unique idempotent killed by every cap and cup — 14 terms with rational coefficients.' },
    { label: 'Wenzl’s recursion', n: 4, ring: 'delta', expr: 'p3 - [3]/[4] p3 e3 p3 - p4', desc: 'p₄ = p₃ − ([3]/[4]) p₃e₃p₃, verified: the difference is zero.' },
    { label: 'Caps kill p₃', n: 3, ring: 'delta', expr: 'e1 p3', desc: 'e₁p₃ = 0.' },
    { label: 'tr(p₄) = [5]', n: 4, ring: 'delta', expr: 'tr(p4)', desc: 'The trace of p_k is the quantum integer [k+1].' },
    { label: 'A projector inside TL₅', n: 5, ring: 'delta', expr: 'JW(3,2)', desc: 'p₃ on strands 2–4, with identity strands on either side.' },
  ] },
  { cat: 'Relations and structure', items: [
    { label: 'e₁e₂e₁ = e₁', n: 3, ring: 'delta', expr: 'e1 e2 e1 - e1', desc: 'The defining relation, verified.' },
    { label: 'An idempotent e₁/δ', n: 2, ring: 'delta', expr: 'e1/d', desc: 'Rescaling the generator gives a rank-one idempotent.' },
    { label: 'Inverse of 1 + e₁ + e₂', n: 3, ring: 'delta', expr: 'inv(1 + e1 + e2)', desc: 'Found from the minimal polynomial.' },
    { label: 'Rotation by one click', n: 3, ring: 'delta', expr: 'rot(e1)', desc: 'Rotating a diagram around its boundary.' },
  ] },
  { cat: 'Knots and links — ℚ(A)', items: [
    { label: 'Trefoil', n: 2, ring: 'A', expr: 's1^3', desc: 'Closure of σ₁³: V = t + t³ − t⁴.' },
    { label: 'Figure-eight knot', n: 3, ring: 'A', expr: '(s1 s2^-1)^2', desc: 'Amphichiral, so the bracket lies in ℚ(δ).' },
    { label: 'Borromean rings', n: 3, ring: 'A', expr: '(s1 s2^-1)^3', desc: 'Three components.' },
    { label: 'Torus knot T(3,4)', n: 3, ring: 'A', expr: '(s1 s2)^4', desc: 'The knot 8₁₉.' },
    { label: 'Figure-eight as a 4-plat', n: 4, ring: 'A', expr: 's2^2 s1^-1 s2', desc: 'Its plat closure is the figure-eight knot.' },
    { label: 'The full twist is central', n: 3, ring: 'A', expr: 'ft', desc: 'Δ² acts by a scalar on every cell module.' },
    { label: 'Skein relation', n: 2, ring: 'A', expr: 's1 - s1^-1', desc: 'σ − σ⁻¹ = (A − A⁻¹)(1 − e).' },
    { label: 'Hecke relation', n: 2, ring: 'A', expr: '(s1 - A)(s1 + A^-3)', desc: '(σ − A)(σ + A⁻³) = 0.' },
  ] },
  { cat: 'Roots of unity', items: [
    { label: 'δ = 1: not semisimple', n: 3, ring: 'num', d: '1', expr: 'p2', desc: 'q = e^{iπ/3}; see the Algebra section of the Info tab.' },
    { label: 'δ = 1: p₃ does not exist', n: 3, ring: 'num', d: '1', expr: 'p3', desc: '[3] = 0, so Wenzl’s recursion breaks.' },
    { label: 'δ = 0: e₁ is square-zero', n: 2, ring: 'num', d: '0', expr: 'e1', desc: 'q = i.' },
  ] },
];
function renderExamples() {
  const badge = x => (x.ring === 'A' ? '<span class="ex-badge A">ℚ(A)</span>' : x.ring === 'num' ? '<span class="ex-badge num">δ = ' + esc(x.d) + '</span>' : '<span class="ex-badge">ℚ(δ)</span>');
  let k = 0;
  $('#example-body').innerHTML = EXAMPLES.map(c => '<div class="example-cat-title">' + esc(c.cat) + '</div><div class="example-grid">' +
    c.items.map(x => { x.key = k++; return `<button class="example-card" data-ex="${x.key}"><div class="example-card-head"><span class="example-name">${esc(x.label)}</span>${badge(x)}</div><div class="example-desc">${esc(x.desc)}</div><div class="example-expr">n = ${x.n} · ${esc(x.expr)}</div></button>`; }).join('') + '</div>').join('');
}
const exampleByKey = k => { for (const c of EXAMPLES) for (const x of c.items) if (x.key === k) return x; return null; };

/* ============================================================ hash state */
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const n = parseInt(h.get('n'), 10);
  if (n >= 1 && n <= TL.MAXN) S.n = n;
  const r = h.get('r');
  if (r === 'delta' || r === 'A' || r === 'num') S.ring = r;
  if (h.get('d')) S.deltaStr = h.get('d');
  return h.has('x') ? h.get('x') : null;
}
function writeHash() {
  const h = new URLSearchParams();
  h.set('n', S.n); h.set('r', S.ring);
  if (S.ring === 'num') h.set('d', S.deltaStr);
  h.set('x', $('#expr').value);
  try { history.replaceState(null, '', '#' + h.toString()); } catch (e) { /* sandboxed */ }
}

/* ============================================================ controls */
function syncControls() {
  $('#nOut').textContent = S.n;
  $('#nDown').disabled = S.n <= 1; $('#nUp').disabled = S.n >= TL.MAXN;
  $$('#ringSeg .seg-opt').forEach(b => b.classList.toggle('active', b.dataset.ring === S.ring));
  $('#deltaIn').value = S.deltaStr;
  $('#deltaIn').style.opacity = S.ring === 'num' ? '1' : '0.45';
  $('#ringHint').innerHTML = S.ring === 'A' ? 'δ = −A² − A⁻². Braid generators and the Jones polynomial are available.'
    : S.ring === 'delta' ? 'A generic loop value δ. Switch to ℚ(A) for braids.'
      : 'δ fixed to ' + esc(S.deltaStr) + '. Specializing at δ = 2cos(π/m) breaks semisimplicity.';
  $('#deltaForm').disabled = S.ring !== 'A';
  $('#deltaForm').classList.toggle('active', S.deltaForm);
  $('#factored').classList.toggle('active', S.factored);
  $$('#viewSeg .seg-opt').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  $$('#modeSeg .seg-opt').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
  const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  $$('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  $('#theme-btn').title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  $('#theme-btn').setAttribute('aria-label', $('#theme-btn').title);
}
function setTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  try { localStorage.setItem('tlcalc.theme', theme); } catch (e) { /* storage unavailable */ }
  syncControls();
}
function changeSetup(fn) {
  const prev = { n: S.n, ring: S.ring, d: S.deltaStr };
  fn();
  try { setup(); }
  catch (e) {
    Object.assign(S, { n: prev.n, ring: prev.ring, deltaStr: prev.d }); setup(); syncControls();
    S.error = { msg: e.message }; renderStatus(); renderError();
    return;
  }
  if (prev.n !== S.n) { resetBuilder(); S.matK = null; }
  syncControls(); renderPalette(); renderPills(); renderAlgebra();
  run({ noHistory: true });
}
function setTab(tab) {
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
}
function setCollapsed(c) {
  $('#control-panel').classList.toggle('collapsed', c);
  document.documentElement.classList.toggle('panel-collapsed', c);
  $('#collapse-btn').title = c ? 'Open panel' : 'Collapse panel';
}
function setMode(mode) {
  S.mode = mode;
  syncControls(); renderPills(); renderStage(); renderInspector();
}
function openExamples(open) { $('#example-modal').hidden = !open; }

function bind() {
  $('#nDown').onclick = () => changeSetup(() => { S.n = Math.max(1, S.n - 1); });
  $('#nUp').onclick = () => changeSetup(() => { S.n = Math.min(TL.MAXN, S.n + 1); });
  $('#ringSeg').addEventListener('click', e => {
    const b = e.target.closest('.seg-opt');
    if (!b) return;
    changeSetup(() => { S.ring = b.dataset.ring; if (S.ring === 'num') S.deltaStr = $('#deltaIn').value.trim() || '1'; });
  });
  $('#deltaIn').addEventListener('change', () => changeSetup(() => { S.ring = 'num'; S.deltaStr = $('#deltaIn').value.trim() || '1'; }));
  $('#deltaIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#deltaIn').blur(); });
  $('#deltaForm').onclick = () => { S.deltaForm = !S.deltaForm; syncControls(); renderAll(); };
  $('#factored').onclick = () => { S.factored = !S.factored; syncControls(); renderAll(); renderAlgebra(); };
  $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('.seg-opt'); if (!b) return; S.view = b.dataset.view; syncControls(); renderStage(); });
  $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('.seg-opt'); if (b) setMode(b.dataset.mode); });
  $$('.theme-opt').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  $('#theme-btn').onclick = () => setTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
  $('#evalBtn').onclick = () => run();
  $('#refresh-btn').onclick = () => run({ noHistory: true });
  $('#collapse-btn').onclick = () => setCollapsed(!$('#control-panel').classList.contains('collapsed'));
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('.info-jump-btn').forEach(b => b.addEventListener('click', () => {
    $$('.info-jump-btn').forEach(x => x.classList.toggle('active', x === b));
    document.getElementById(b.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('#help-btn').onclick = () => {
    setCollapsed(false); setTab('info');
    const jb = document.querySelector('.info-jump-btn[data-jump="info-syntax"]');
    if (jb) jb.click();
  };
  $('#expr').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'ArrowUp' && HIST.length) { e.preventDefault(); hpos = Math.min(HIST.length - 1, hpos + 1); $('#expr').value = HIST[hpos]; }
    else if (e.key === 'ArrowDown' && hpos >= 0) { e.preventDefault(); hpos--; $('#expr').value = hpos >= 0 ? HIST[hpos] : ''; }
  });
  $('#palette').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.wrap) wrapFn(b.dataset.ins); else insertToken(b.dataset.ins);
  });
  $('#history').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('#expr').value = HIST[+b.dataset.h];
    run();
  });
  $('#load-example-btn').onclick = () => openExamples(true);
  $('#example-modal').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { openExamples(false); return; }
    const c = e.target.closest('.example-card');
    if (!c) return;
    const x = exampleByKey(+c.dataset.ex);
    openExamples(false);
    if (S.mode !== 'result') S.mode = 'result';
    $('#expr').value = x.expr;
    changeSetup(() => { S.n = x.n; S.ring = x.ring; if (x.d) S.deltaStr = x.d; });
    pushHistory(x.expr);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#example-modal').hidden) openExamples(false);
    else if (S.selTerm !== null) { S.selTerm = null; renderStage(); renderInspector(); }
  });
  $('#copy-text').onclick = async () => copy(resultText(), $('#copy-text'));
  $('#copy-link').onclick = async () => { writeHash(); copy(location.href, $('#copy-link')); };
  $('#storeSeg').addEventListener('click', e => {
    const b = e.target.closest('.seg-opt');
    if (!b || !S.result) return;
    S.regs[b.dataset.reg] = S.result;
    renderRegs(); flash(b, '✓ ' + b.dataset.reg);
  });
  $('#status-close').onclick = e => { e.stopPropagation(); $('#status-banner').classList.add('collapsed'); };
  $('#status-banner').addEventListener('click', () => $('#status-banner').classList.remove('collapsed'));
  $('#isometry-controls').addEventListener('click', e => {
    const b = e.target.closest('.isometry-btn');
    if (b) pillClick(b.dataset.g, e.metaKey || e.ctrlKey, e.shiftKey);
  });
  $('#stage').addEventListener('click', e => {
    if (e.target.id === 'showAll') { S.showAll = true; renderStage(); return; }
    const tile = e.target.closest('.tile');
    if (tile) { const id = +tile.dataset.id; S.selTerm = S.selTerm === id ? null : id; renderStage(); renderInspector(); return; }
    const pt = e.target.closest('#editor .pt');
    if (pt) { clickPoint(+pt.dataset.p); return; }
    const bb = e.target.closest('[data-b]');
    if (bb && !bb.disabled) builderAction(bb.dataset.b);
  });
  $('#face-info').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const id = S.selTerm;
    if (a.dataset.act === 'close') { S.selTerm = null; renderStage(); renderInspector(); return; }
    if (id === null) return;
    if (a.dataset.act === 'insert') { setCollapsed(false); setTab('element'); insertToken('{' + T.B.codes[id] + '}'); }
    if (a.dataset.act === 'builder') { S.bm = Int8Array.from(T.B.mats[id]); S.sel = -1; S.bmsg = ''; S.selTerm = null; setMode('builder'); }
  });
  $('#inv').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'heavyBtn') { S.heavy = true; t.textContent = 'checking…'; setTimeout(renderInvariants, 20); }
    if (t.id === 'mpBtn') {
      t.textContent = 'computing…'; t.disabled = true;
      const b = $('#status-banner'); b.classList.add('pending');
      setTimeout(() => {
        const R = S.result;
        try { S.mp = { forResult: R, c: T.minpoly(R.v, 60) }; }
        catch (err) { S.mp = { forResult: R, error: err.message }; }
        b.classList.remove('pending');
        $('#mpSect').innerHTML = minpolySection();
      }, 20);
    }
    if (t.id === 'invBtn') { $('#expr').value = 'inv(' + S.result.src + ')'; run(); }
    if (t.closest('#matKind')) { S.matKind = t.dataset.k; $('#matSect').innerHTML = matrixSection(S.result.v); }
  });
  $('#inv').addEventListener('change', e => {
    if (e.target.id === 'matK') { S.matK = +e.target.value; $('#matSect').innerHTML = matrixSection(S.result.v); }
  });
}
function builderAction(a) {
  const B = T.B;
  if (a === 'back') { setMode('result'); return; }
  if (a === 'use') { $('#expr').value = '{' + B.codes[B.idOf(S.bm)] + '}'; setMode('result'); run(); return; }
  if (a === 'insert') { setCollapsed(false); setTab('element'); insertToken('{' + B.codes[B.idOf(S.bm)] + '}'); return; }
  if (a === 'top') { S.top = Int8Array.from(S.bm); renderComposer(); return; }
  if (a === 'bot') { S.bot = Int8Array.from(S.bm); renderComposer(); return; }
  if (a === 'id') S.bm = Int8Array.from(B.mats[B.identity]);
  if (a === 'rand') S.bm = Int8Array.from(B.mats[Math.floor(Math.random() * B.size)]);
  if (a === 'clear') S.bm = new Int8Array(2 * S.n).fill(-1);
  S.sel = -1; S.bmsg = '';
  renderEditor();
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); flash(btn, 'Copied'); }
  catch (e) { window.prompt('Copy:', text); }
}
function flash(el, text) {
  const old = el.textContent;
  el.textContent = text;
  setTimeout(() => { el.textContent = old; }, 900);
}

/* ============================================================ boot */
const fromHash = readHash();
try { setup(); } catch (e) { S.ring = 'A'; setup(); }
$('#expr').value = fromHash !== null ? fromHash : 'p3';
resetBuilder();
renderExamples();
bind();
syncControls(); renderPalette(); renderPills(); renderAlgebra(); renderHistory();
// on phones the banner would cover the stage: start it as just the status dot (tap to expand)
if (window.matchMedia('(max-width: 768px)').matches) $('#status-banner').classList.add('collapsed');
run({ noHistory: true });
})();
