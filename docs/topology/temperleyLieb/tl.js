/* tl.js — exact Temperley–Lieb engine.
 *
 * TL_n(δ) with basis the planar (non-crossing) matchings of n top + n bottom points.
 * Coefficients live in one of three exact fields:
 *   'delta' : ℚ(δ)            — generic loop value
 *   'A'     : ℚ(A), δ = −A²−A⁻² — Kauffman variable, braid generators available
 *   'num'   : ℚ, δ = a fixed rational number
 *
 * Conventions
 *   points 0..n−1 are the top (left→right), n..2n−1 the bottom (left→right);
 *   a diagram is an Int8Array of partners;  x·y = x stacked ON TOP of y;
 *   e_i joins top i,i+1 and bottom i,i+1 (1-based i);
 *   σ_i = A·1 + A⁻¹·e_i (writhe +1), so the closure of σ₁³ is the right-handed trefoil.
 *
 * Works in the browser (window.TL) and in node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const MAXN = 8;

/* ------------------------------------------------------------------ integers */
const babs = a => (a < 0n ? -a : a);
function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
const BINOM = [];
function binom(n, k) {
  while (BINOM.length <= n) {
    const m = BINOM.length, row = [1n];
    for (let j = 1; j < m; j++) row.push(BINOM[m - 1][j - 1] + BINOM[m - 1][j]);
    if (m) row.push(1n);
    BINOM.push(row);
  }
  return BINOM[n][k];
}

/* -------------------------------------------- dense ℤ[x] (BigInt[], low→high) */
const P = {};
P.trim = a => { let k = a.length; while (k && a[k - 1] === 0n) k--; return k === a.length ? a : a.slice(0, k); };
P.add = (a, b) => {
  if (a.length < b.length) { const t = a; a = b; b = t; }
  const r = a.slice();
  for (let i = 0; i < b.length; i++) r[i] += b[i];
  return P.trim(r);
};
P.neg = a => a.map(c => -c);
P.sub = (a, b) => P.add(a, P.neg(b));
P.scale = (a, c) => (c === 0n ? [] : c === 1n ? a : a.map(x => x * c));
P.mul = (a, b) => {
  if (!a.length || !b.length) return [];
  if (a.length === 1 && a[0] === 1n) return b;
  if (b.length === 1 && b[0] === 1n) return a;
  const r = new Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    if (ai === 0n) continue;
    for (let j = 0; j < b.length; j++) r[i + j] += ai * b[j];
  }
  return r;
};
P.shift = (a, k) => (k === 0 || !a.length ? a : new Array(k).fill(0n).concat(a));
P.eq = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
P.content = a => { let g = 0n; for (const c of a) { g = bgcd(g, c); if (g === 1n) break; } return g; };
P.lc = a => a[a.length - 1];
P.prim = a => {
  if (!a.length) return a;
  let g = P.content(a);
  if (P.lc(a) < 0n) g = -g;
  return g === 1n ? a : a.map(x => x / g);
};
// exact quotient a/b in ℤ[x]; throws if b ∤ a
P.divExact = (a, b) => {
  if (b.length === 1) {
    if (b[0] === 1n) return a;
    return a.map(x => { if (x % b[0]) throw new Error('inexact division'); return x / b[0]; });
  }
  const r = a.slice(), m = b.length - 1, lb = b[m];
  if (a.length - 1 < m) { if (a.length) throw new Error('inexact division'); return []; }
  const q = new Array(a.length - m).fill(0n);
  for (let k = a.length - 1; k >= m; k--) {
    const c = r[k];
    if (c === 0n) continue;
    if (c % lb) throw new Error('inexact division');
    const t = c / lb;
    q[k - m] = t;
    for (let i = 0; i <= m; i++) r[k - m + i] -= t * b[i];
  }
  for (let i = 0; i < m; i++) if (r[i] !== 0n) throw new Error('inexact division');
  return P.trim(q);
};
// quotient if monic b divides a, else null
P.divMonic = (a, b) => {
  const m = b.length - 1;
  if (a.length - 1 < m) return null;
  const r = a.slice(), q = new Array(a.length - m).fill(0n);
  for (let k = a.length - 1; k >= m; k--) {
    const t = r[k];
    if (t === 0n) continue;
    q[k - m] = t;
    for (let i = 0; i <= m; i++) r[k - m + i] -= t * b[i];
  }
  for (let i = 0; i < m; i++) if (r[i] !== 0n) return null;
  return P.trim(q);
};
P.prem = (a, b) => {
  const m = b.length - 1, lb = b[m];
  const r = a.slice();
  for (let k = r.length - 1; k >= m; k--) {
    const c = r[k];
    if (c !== 0n) {
      for (let i = 0; i < k; i++) r[i] *= lb;
      for (let i = 0; i < m; i++) r[k - m + i] -= c * b[i];
    }
    r.length = k;
  }
  return P.trim(r);
};
// gcd over ℚ[x], returned primitive with positive leading coefficient
P.gcd = (a, b) => {
  if (!a.length) return P.prim(b);
  if (!b.length) return P.prim(a);
  if (a.length === 1 || b.length === 1) return [1n];
  a = P.prim(a); b = P.prim(b);
  if (P.eq(a, b)) return a;
  if (a.length < b.length) { const t = a; a = b; b = t; }
  for (;;) {
    if (!b.length) return P.prim(a);
    if (b.length === 1) return [1n];
    const r = P.prem(a, b);
    a = b; b = r.length ? P.prim(r) : [];
  }
};
P.lcm = (a, b) => {
  if (P.eq(a, b) || (b.length === 1 && b[0] === 1n)) return a;
  if (a.length === 1 && a[0] === 1n) return b;
  const ca = P.content(a), cb = P.content(b);
  const pa = a.map(x => x / ca), pb = b.map(x => x / cb);
  const g = P.gcd(pa, pb);
  const lc = (ca / bgcd(ca, cb)) * cb;
  return P.scale(P.divExact(P.mul(pa, pb), g), lc);
};
P.evalQ = (a, num, den) => { // a(num/den) as [N, D] with D = den^deg
  let N = 0n, pw = 1n;
  const d = a.length - 1;
  for (let i = d; i >= 0; i--) { N = N * num + a[i] * pw; pw *= den; }
  return [N, den ** BigInt(Math.max(d, 0))];
};

/* ------------------------------------------------ Laurent polys {v, c} */
const LP = {};
LP.zero = { v: 0, c: [] };
LP.add = (a, b) => {
  if (!a.c.length) return b;
  if (!b.c.length) return a;
  const v = Math.min(a.v, b.v);
  const len = Math.max(a.v - v + a.c.length, b.v - v + b.c.length);
  const r = new Array(len).fill(0n);
  for (let i = 0; i < a.c.length; i++) r[a.v - v + i] += a.c[i];
  for (let i = 0; i < b.c.length; i++) r[b.v - v + i] += b.c[i];
  return { v, c: r };
};
LP.mul = (a, b) => ({ v: a.v + b.v, c: P.mul(a.c, b.c) });
LP.negVar = (v, c) => ({ v, c: c.map((x, i) => ((v + i) % 2 !== 0 ? -x : x)) });
LP.invVar = (v, c) => ({ v: -(v + c.length - 1), c: c.slice().reverse() });
LP.norm = a => { // strip zeros at both ends
  let c = P.trim(a.c), i = 0;
  while (i < c.length && c[i] === 0n) i++;
  return i ? { v: a.v + i, c: c.slice(i) } : { v: a.v, c };
};

/* ---------------------------------------------------- cyclotomic factor bank */
const CYC = [null];
function cyclotomic(m) {
  while (CYC.length <= m) {
    const k = CYC.length;
    let p = new Array(k + 1).fill(0n); p[0] = -1n; p[k] = 1n;
    for (let d = 1; d < k; d++) if (k % d === 0) p = P.divExact(p, CYC[d]);
    CYC.push(p);
  }
  return CYC[m];
}
// symmetric Laurent poly (dense array over exponents −r..r) → polynomial in y = x + 1/x
function symToY(arr, r) {
  arr = arr.slice();
  const out = new Array(r + 1).fill(0n);
  for (let k = r; k >= 0; k--) {
    const c = arr[k + r];
    if (c === 0n) continue;
    out[k] = c;
    for (let j = 0; j <= k; j++) arr[k - 2 * j + r] -= c * binom(k, j);
  }
  for (const x of arr) if (x !== 0n) return null;
  return P.trim(out);
}
const PSI = [];
// Ψ_m(δ): minimal polynomial of 2cos(2π/m); Ψ_m(δ)=0 ⇔ q is a primitive m-th root of unity (δ = q + q⁻¹)
function psi(m) {
  if (PSI[m]) return PSI[m];
  let r;
  if (m === 1) r = [-2n, 1n];
  else if (m === 2) r = [2n, 1n];
  else { const f = cyclotomic(m), h = (f.length - 1) / 2; r = symToY(f, h); }
  return (PSI[m] = r);
}
const FACTOR_M = 72;
function factorBank(kind) {
  const bank = [];
  for (let m = 1; m <= FACTOR_M; m++) {
    if (kind === 'delta') { if (m !== 4) bank.push({ m, p: psi(m) }); }
    else bank.push({ m, p: cyclotomic(m) });
  }
  bank.sort((a, b) => a.p.length - b.p.length || a.m - b.m);
  return bank;
}
const BANKS = {};
// p ∈ ℤ[x] with p[0] ≠ 0 → { unit (BigInt), factors: [{m, p, e}], rest (poly) }
function factorPoly(p, kind) {
  const bank = BANKS[kind] || (BANKS[kind] = factorBank(kind));
  let unit = P.content(p);
  if (P.lc(p) < 0n) unit = -unit;
  let rest = p.map(x => x / unit);
  const factors = [];
  for (const f of bank) {
    if (rest.length <= 1) break;
    if (f.p.length > rest.length) continue;
    let e = 0, q;
    while (rest.length >= f.p.length && (q = P.divMonic(rest, f.p))) { rest = q; e++; }
    if (e) factors.push({ m: f.m, p: f.p, e });
  }
  return { unit, factors, rest };
}

/* ------------------------------------------------------ rational functions ℚ(x)
 * a = x^v · n(x)/d(x),  n,d ∈ ℤ[x], n(0)≠0≠d(0), gcd(n,d)=1, lc(d)>0, integer contents coprime.
 */
const RZ = { v: 0, n: [], d: [1n] };
function rfNorm(v, n, d, gcdDone) {
  n = P.trim(n);
  if (!n.length) return RZ;
  d = P.trim(d);
  let i = 0; while (n[i] === 0n) i++;
  if (i) { n = n.slice(i); v += i; }
  let j = 0; while (d[j] === 0n) j++;
  if (j) { d = d.slice(j); v -= j; }
  if (!gcdDone && n.length > 1 && d.length > 1) {
    const g = P.gcd(n, d);
    if (g.length > 1) { n = P.divExact(n, g); d = P.divExact(d, g); }
  }
  let g = bgcd(P.content(n), P.content(d));
  if (P.lc(d) < 0n) g = -g;
  if (g !== 1n) { n = n.map(x => x / g); d = d.map(x => x / g); }
  return { v, n, d };
}
const RF = {
  zero: RZ,
  one: { v: 0, n: [1n], d: [1n] },
  x: { v: 1, n: [1n], d: [1n] },
  xinv: { v: -1, n: [1n], d: [1n] },
  isZero: a => !a.n.length,
  isOne: a => a.v === 0 && a.n.length === 1 && a.n[0] === 1n && a.d.length === 1 && a.d[0] === 1n,
  eq: (a, b) => a.v === b.v && P.eq(a.n, b.n) && P.eq(a.d, b.d),
  fromInt: k => (BigInt(k) === 0n ? RZ : { v: 0, n: [BigInt(k)], d: [1n] }),
  fromRat: (p, q) => rfNorm(0, [BigInt(p)], [BigInt(q)]),
  neg: a => (a.n.length ? { v: a.v, n: P.neg(a.n), d: a.d } : a),
  mul(a, b) {
    if (!a.n.length || !b.n.length) return RZ;
    if (a.d.length === 1 && b.d.length === 1) return rfNorm(a.v + b.v, P.mul(a.n, b.n), [a.d[0] * b.d[0]], true);
    let an = a.n, bn = b.n, ad = a.d, bd = b.d;
    if (an.length > 1 && bd.length > 1) { const g = P.gcd(an, bd); if (g.length > 1) { an = P.divExact(an, g); bd = P.divExact(bd, g); } }
    if (bn.length > 1 && ad.length > 1) { const g = P.gcd(bn, ad); if (g.length > 1) { bn = P.divExact(bn, g); ad = P.divExact(ad, g); } }
    return rfNorm(a.v + b.v, P.mul(an, bn), P.mul(ad, bd), true);
  },
  add(a, b) {
    if (!a.n.length) return b;
    if (!b.n.length) return a;
    const m = Math.min(a.v, b.v);
    const an = P.shift(a.n, a.v - m), bn = P.shift(b.n, b.v - m);
    if (P.eq(a.d, b.d)) return rfNorm(m, P.add(an, bn), a.d, a.d.length === 1);
    if (a.d.length === 1 && b.d.length === 1)
      return rfNorm(m, P.add(P.scale(an, b.d[0]), P.scale(bn, a.d[0])), [a.d[0] * b.d[0]], true);
    const g = P.gcd(a.d, b.d);
    const ad = P.divExact(a.d, g), bd = P.divExact(b.d, g);
    return rfNorm(m, P.add(P.mul(an, bd), P.mul(bn, ad)), P.mul(a.d, bd));
  },
  inv(a) { if (!a.n.length) throw new Error('division by zero'); return rfNorm(-a.v, a.d, a.n, true); },
  // a(−x)
  negVar(a) { const N = LP.negVar(a.v, a.n), D = LP.negVar(0, a.d); return rfNorm(N.v - D.v, N.c, D.c, true); },
  // a(1/x)
  invVar(a) { if (!a.n.length) return a; const N = LP.invVar(a.v, a.n), D = LP.invVar(0, a.d); return rfNorm(N.v - D.v, N.c, D.c, true); },
  // ℚ(A) → ℚ(δ) with δ = −A²−A⁻², or null if a ∉ ℚ(δ)
  toDelta(a) {
    if (!a.n.length) return RZ;
    if (!RF.eq(a, RF.negVar(a)) || !RF.eq(a, RF.invVar(a))) return null;
    const d1 = LP.negVar(0, a.d), d2 = LP.invVar(0, a.d), d3 = LP.negVar(d2.v, d2.c);
    const rest = LP.mul(LP.mul(d1, d2), d3);
    const D = LP.norm(LP.mul({ v: 0, c: a.d }, rest));
    const N = LP.norm(LP.mul({ v: a.v, c: a.n }, rest));
    const nd = invariantToDelta(N), dd = invariantToDelta(D);
    if (!nd || !dd) return null;
    return rfNorm(0, nd, dd);
  },
};
// Laurent poly in A invariant under A→−A and A→1/A  →  polynomial in δ = −A²−A⁻²
function invariantToDelta(L) {
  const lo = L.v, hi = L.v + L.c.length - 1;
  if (lo !== -hi || lo % 2) return null;
  const r = hi / 2, arr = new Array(2 * r + 1).fill(0n);
  for (let i = 0; i < L.c.length; i++) {
    const e = lo + i;
    if (e % 2) { if (L.c[i] !== 0n) return null; continue; }
    arr[e / 2 + r] = L.c[i];
  }
  const y = symToY(arr, r);              // in y = B + 1/B, B = A², and δ = −y
  return y && y.map((c, k) => (k % 2 ? -c : c));
}

/* -------------------------------------------------------------- rationals ℚ */
const QZ = { n: 0n, d: 1n };
function qNorm(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return QZ;
  const g = bgcd(n, d);
  return g === 1n ? { n, d } : { n: n / g, d: d / g };
}
const Q = {
  zero: QZ,
  one: { n: 1n, d: 1n },
  isZero: a => a.n === 0n,
  isOne: a => a.n === 1n && a.d === 1n,
  eq: (a, b) => a.n === b.n && a.d === b.d,
  fromInt: k => ({ n: BigInt(k), d: 1n }),
  fromRat: (p, q) => qNorm(BigInt(p), BigInt(q)),
  neg: a => ({ n: -a.n, d: a.d }),
  add: (a, b) => (a.d === b.d ? qNorm(a.n + b.n, a.d) : qNorm(a.n * b.d + b.n * a.d, a.d * b.d)),
  mul: (a, b) => qNorm(a.n * b.n, a.d * b.d),
  inv: a => { if (a.n === 0n) throw new Error('division by zero'); return qNorm(a.d, a.n); },
};
function parseRational(s) {
  s = String(s).trim().replace(/−/g, '-');
  let m = s.match(/^([+-]?\d+)\s*(?:\/\s*(\d+))?$/);
  if (m) { const d = BigInt(m[2] || '1'); if (d === 0n) throw new Error('zero denominator'); return Q.fromRat(m[1], d); }
  m = s.match(/^([+-]?)(\d*)\.(\d+)$/);
  if (m) { const d = 10n ** BigInt(m[3].length); return Q.fromRat(BigInt(m[1] + (m[2] || '0') + m[3]), d); }
  throw new Error('δ must be a rational number like 1, -1, 3/2 or 0.5');
}

/* -------------------------------------------------------------- formatting */
const MINUS = '−';
const SUPS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '/': 'ᐟ' };
function supHtml(e) { return '<sup>' + String(e).replace('-', MINUS) + '</sup>'; }
// terms of x^v·c(x), highest power first: [{k: BigInt, e: int}]
function terms(v, c) {
  const out = [];
  for (let i = c.length - 1; i >= 0; i--) if (c[i] !== 0n) out.push({ k: c[i], e: v + i });
  return out;
}
function monoHtml(k, e, x) { // |k| x^e
  const a = babs(k);
  if (e === 0) return String(a);
  return (a === 1n ? '' : String(a)) + '<i>' + x + '</i>' + (e === 1 ? '' : supHtml(e));
}
function monoText(k, e, x) {
  const a = babs(k);
  if (e === 0) return String(a);
  return (a === 1n ? '' : a + '*') + x + (e === 1 ? '' : '^' + (e < 0 ? '(' + e + ')' : e));
}
function sumHtml(ts, x) {
  if (!ts.length) return '0';
  return ts.map((t, i) => (t.k < 0n ? (i ? ' ' + MINUS + ' ' : MINUS) : i ? ' + ' : '') + monoHtml(t.k, t.e, x)).join('');
}
function sumText(ts, x) {
  if (!ts.length) return '0';
  return ts.map((t, i) => (t.k < 0n ? (i ? ' - ' : '-') : i ? ' + ' : '') + monoText(t.k, t.e, x)).join('');
}
const isMonoTerms = ts => ts.length === 1;

// structured formatting of x^v n/d (n, d ∈ ℤ[x]) — expanded or factored
function rfParts(a, x, kind, factored) {
  if (!factored) {
    const nt = terms(a.d.length === 1 && a.d[0] === 1n ? a.v : Math.max(a.v, 0), a.n);
    const dt = a.d.length === 1 && a.d[0] === 1n ? null : terms(Math.max(-a.v, 0), a.d);
    return { num: nt, den: dt };
  }
  return { fnum: factorPoly(a.n, kind), fden: factorPoly(a.d, kind), v: a.v };
}
function factorProductHtml(fp, v, x, withUnit) {
  // returns {sign, body} where body is product of factors (unit magnitude included if withUnit)
  const parts = [];
  const u = babs(fp.unit);
  if (withUnit && u !== 1n) parts.push(String(u));
  if (v > 0) parts.push('<i>' + x + '</i>' + (v === 1 ? '' : supHtml(v)));
  const fs = fp.factors.slice();
  for (const f of fs) parts.push('(' + sumHtml(terms(0, f.p), x) + ')' + (f.e > 1 ? supHtml(f.e) : ''));
  if (fp.rest.length > 1) parts.push('(' + sumHtml(terms(0, fp.rest), x) + ')');
  return { neg: fp.unit < 0n, body: parts.join('') || '1', count: parts.length };
}
function factorProductText(fp, v, x) {
  const parts = [];
  const u = babs(fp.unit);
  if (u !== 1n) parts.push(String(u));
  if (v > 0) parts.push(x + (v === 1 ? '' : '^' + v));
  for (const f of fp.factors) parts.push('(' + sumText(terms(0, f.p), x) + ')' + (f.e > 1 ? '^' + f.e : ''));
  if (fp.rest.length > 1) parts.push('(' + sumText(terms(0, fp.rest), x) + ')');
  return { neg: fp.unit < 0n, body: parts.join('*') || '1', count: parts.length };
}
function rfHtml(a, x, kind, factored) {
  if (!a.n.length) return '0';
  if (!factored) {
    const { num, den } = rfParts(a, x, kind, false);
    if (!den) return sumHtml(num, x);
    let neg = false, nt = num;
    if (isMonoTerms(num) && num[0].k < 0n) { neg = true; nt = [{ k: -num[0].k, e: num[0].e }]; }
    return (neg ? MINUS : '') + '<span class="fr"><span>' + sumHtml(nt, x) + '</span><span>' + sumHtml(den, x) + '</span></span>';
  }
  const N = factorPoly(a.n, kind), D = factorPoly(a.d, kind);
  const dIsOne = D.unit === 1n && !D.factors.length && D.rest.length <= 1;
  if (dIsOne && a.v >= 0 && N.factors.length === 0) return rfHtml(a, x, kind, false);
  const nh = factorProductHtml(N, Math.max(a.v, 0), x, true);
  const dh = factorProductHtml(D, Math.max(-a.v, 0), x, true);
  // a lone non-factored numerator with several terms is fine without parens
  let nb = nh.body;
  if (nh.count === 1 && /^\(.*\)$/.test(nb) && !/\)\(/.test(nb) && !N.factors.length) nb = nb.slice(1, -1);
  let db = dh.body;
  if (dh.count === 1 && /^\(.*\)$/.test(db) && !/\)\(/.test(db) && !D.factors.length) db = db.slice(1, -1);
  const neg = nh.neg !== dh.neg;
  if (db === '1') return (neg ? MINUS : '') + nb;
  return (neg ? MINUS : '') + '<span class="fr"><span>' + nb + '</span><span>' + db + '</span></span>';
}
function rfText(a, x, kind, factored) {
  if (!a.n.length) return '0';
  const dIsOne = a.d.length === 1 && a.d[0] === 1n;
  if (!factored) {
    const { num, den } = rfParts(a, x, kind, false);
    if (!den) return sumText(num, x);
    const ns = sumText(num, x);
    return (num.length > 1 ? '(' + ns + ')' : ns) + '/(' + sumText(den, x) + ')';
  }
  const N = factorPoly(a.n, kind), D = factorPoly(a.d, kind);
  if (dIsOne && a.v >= 0 && !N.factors.length) return rfText(a, x, kind, false);
  const nt = factorProductText(N, Math.max(a.v, 0), x), dt = factorProductText(D, Math.max(-a.v, 0), x);
  const neg = nt.neg !== dt.neg;
  const single = t => t.count === 1 && /^\(.*\)$/.test(t.body) && !/\)\*?\(/.test(t.body);
  const den = single(dt) || /^[\w^]+$/.test(dt.body) ? dt.body : '(' + dt.body + ')';
  return (neg ? '-' : '') + (dt.body === '1' ? nt.body : nt.body + '/' + den);
}
function qHtml(a) {
  if (a.d === 1n) return (a.n < 0n ? MINUS : '') + babs(a.n);
  return (a.n < 0n ? MINUS : '') + '<span class="fr"><span>' + babs(a.n) + '</span><span>' + a.d + '</span></span>';
}
const qText = a => (a.d === 1n ? String(a.n) : a.n + '/' + a.d);

/* ---------------------------------------------------------------- fields */
function makeField(kind, deltaValue) {
  if (kind === 'num') {
    const dv = typeof deltaValue === 'object' ? deltaValue : parseRational(deltaValue);
    const F = Object.assign({}, Q, {
      kind, varName: null,
      label: 'ℚ, δ = ' + qText(dv),
      delta: dv, A: null, Ainv: null,
      html: a => qHtml(a),
      text: a => qText(a),
      bar: a => a,
      prep: cs => ({ den: null, nums: cs }),
      rmul: Q.mul, radd: Q.add, rzero: QZ,
      finish: s => s, denMul: () => null,
    });
    F.rdpow = k => F.dpow(k);
    attachPow(F);
    return F;
  }
  const isA = kind === 'A';
  const x = isA ? 'A' : 'δ';
  const delta = isA ? rfNorm(-2, [-1n, 0n, 0n, 0n, -1n], [1n], true) : RF.x;
  const F = Object.assign({}, RF, {
    kind, varName: x,
    label: isA ? 'ℚ(A), δ = −A² − A⁻²' : 'ℚ(δ)',
    delta, A: isA ? RF.x : null, Ainv: isA ? RF.xinv : null,
    html(a, o = {}) {
      if (isA && o.deltaForm !== false) { const d = RF.toDelta(a); if (d) return rfHtml(d, 'δ', 'delta', !!o.factored); }
      return rfHtml(a, x, kind, !!o.factored);
    },
    text(a, o = {}) {
      if (isA && o.deltaForm !== false) { const d = RF.toDelta(a); if (d) return rfText(d, 'd', 'delta', !!o.factored); }
      return rfText(a, isA ? 'A' : 'd', kind, !!o.factored);   // plain text uses d for δ (parseable, Sage-friendly)
    },
    bar: isA ? RF.invVar : (a => a),
    prep(cs) {
      let L = [1n];
      const seen = new Set();
      for (const c of cs) {
        if (c.d.length === 1 && c.d[0] === 1n) continue;
        const key = c.d.join(',');
        if (!seen.has(key)) { seen.add(key); L = P.lcm(L, c.d); }
      }
      return { den: L, nums: cs.map(c => ({ v: c.v, c: P.mul(c.n, P.divExact(L, c.d)) })) };
    },
    rmul: LP.mul, radd: LP.add, rzero: LP.zero,
    finish: (s, den) => rfNorm(s.v, s.c, den),
    denMul: P.mul,
  });
  const dl = isA ? { v: -2, c: [-1n, 0n, 0n, 0n, -1n] } : { v: 1, c: [1n] };
  const rp = [{ v: 0, c: [1n] }];
  F.rdpow = k => { while (rp.length <= k) rp.push(LP.mul(rp[rp.length - 1], dl)); return rp[k]; };
  attachPow(F);
  return F;
}
function attachPow(F) {
  const dp = [F.one];
  F.dpow = k => { while (dp.length <= k) dp.push(F.mul(dp[dp.length - 1], F.delta)); return dp[k]; };
  F.sub = (a, b) => F.add(a, F.neg(b));
  F.div = (a, b) => F.mul(a, F.inv(b));
  F.pow = (a, k) => {
    if (k < 0) return F.pow(F.inv(a), -k);
    let r = F.one, b = a;
    while (k) { if (k & 1) r = F.mul(r, b); b = F.mul(b, b); k >>= 1; }
    return r;
  };
  const qi = [F.zero, F.one];
  // quantum integer [k] = U_{k−1}(δ/2): [0]=0, [1]=1, [k+1] = δ[k] − [k−1]
  F.qint = k => {
    if (k < 0) return F.neg(F.qint(-k));
    while (qi.length <= k) qi.push(F.sub(F.mul(F.delta, qi[qi.length - 1]), qi[qi.length - 2]));
    return qi[k];
  };
}

/* ------------------------------------------------------------- diagrams */
const cycPos = (p, n) => (p < n ? p : 3 * n - 1 - p);   // point ↔ position around the boundary (involution)

function dyckToMatch(code, n) {
  if (code.length !== 2 * n) throw new Error('diagram code {…} needs exactly ' + 2 * n + ' brackets for n = ' + n);
  const m = new Int8Array(2 * n), st = [];
  for (let p = 0; p < 2 * n; p++) {
    const ch = code[p];
    if (ch === '(') st.push(p);
    else if (ch === ')') {
      if (!st.length) throw new Error('unbalanced diagram code {' + code + '}');
      const q = st.pop(), a = cycPos(q, n), b = cycPos(p, n);
      m[a] = b; m[b] = a;
    } else throw new Error('diagram codes use only ( and )');
  }
  if (st.length) throw new Error('unbalanced diagram code {' + code + '}');
  return m;
}
function matchToDyck(m, n) {
  let s = '';
  for (let p = 0; p < 2 * n; p++) s += cycPos(m[cycPos(p, n)], n) > p ? '(' : ')';
  return s;
}
function isPlanar(m, n) {
  const N = 2 * n, pos = new Int32Array(N);
  for (let p = 0; p < N; p++) pos[p] = cycPos(m[cycPos(p, n)], n);
  for (let a = 0; a < N; a++) {
    const b = pos[a];
    if (b < a) continue;
    for (let c = a + 1; c < b; c++) { const d = pos[c]; if (d < a || d > b) return false; }
  }
  return true;
}
function compose(A, B, n) {
  const R = new Int8Array(2 * n).fill(-1), mid = new Uint8Array(n);
  const fromA = p => {
    for (;;) {
      const q = A[p];
      if (q < n) return q;
      const j = q - n; mid[j] = 1;
      const r = B[j];
      if (r >= n) return r;
      mid[r] = 1; p = n + r;
    }
  };
  const fromB = p => {
    for (;;) {
      const q = B[p];
      if (q >= n) return q;
      mid[q] = 1;
      const r = A[n + q];
      if (r < n) return r;
      const j = r - n; mid[j] = 1; p = j;
    }
  };
  for (let i = 0; i < n; i++) if (R[i] < 0) { const e = fromA(i); R[i] = e; R[e] = i; }
  for (let i = n; i < 2 * n; i++) if (R[i] < 0) { const e = fromB(i); R[i] = e; R[e] = i; }
  let loops = 0;
  for (let j = 0; j < n; j++) {
    if (mid[j]) continue;
    loops++;
    let k = j;
    do { mid[k] = 1; const k2 = A[n + k] - n; mid[k2] = 1; k = B[k2]; } while (k !== j);
  }
  return { R, loops };
}
function closureLoops(m, n, plat) {
  // Markov closure: top i ~ bottom i.   Plat: top 2j~2j+1, bottom 2j~2j+1.
  const seen = new Uint8Array(2 * n);
  let loops = 0;
  const cap = p => (plat ? (p < n ? (p ^ 1) : n + ((p - n) ^ 1)) : (p < n ? p + n : p - n));
  for (let s = 0; s < 2 * n; s++) {
    if (seen[s]) continue;
    loops++;
    let p = s;
    do { seen[p] = 1; const q = m[p]; seen[q] = 1; p = cap(q); } while (p !== s);
  }
  return loops;
}

const BASES = [];
function basis(n) {
  if (n < 1 || n > MAXN) throw new Error('n must be between 1 and ' + MAXN);
  if (BASES[n]) return BASES[n];
  const codes = [];
  (function gen(s, open, close) {
    if (s.length === 2 * n) { codes.push(s); return; }
    if (open < n) gen(s + '(', open + 1, close);
    if (close < open) gen(s + ')', open, close + 1);
  })('', 0, 0);
  const mats = codes.map(c => dyckToMatch(c, n));
  const thr = m => { let t = 0; for (let i = 0; i < n; i++) if (m[i] >= n) t++; return t; };
  const order = codes.map((c, i) => i).sort((a, b) => thr(mats[b]) - thr(mats[a]) || (codes[a] < codes[b] ? -1 : codes[a] > codes[b] ? 1 : 0));
  const B = {
    n, size: codes.length,
    codes: order.map(i => codes[i]),
    mats: order.map(i => mats[i]),
  };
  B.index = new Map(B.codes.map((c, i) => [c, i]));
  B.through = Int8Array.from(B.mats, thr);
  B.trLoops = Int8Array.from(B.mats, m => closureLoops(m, n, false));
  B.platLoops = n % 2 ? null : Int8Array.from(B.mats, m => closureLoops(m, n, true));
  B.idOf = m => B.index.get(matchToDyck(m, n));
  B.identity = B.index.get('('.repeat(n) + ')'.repeat(n));
  const table = new Int32Array(B.size * B.size).fill(-1);
  B.comp = (i, j) => {
    const k = i * B.size + j;
    let r = table[k];
    if (r < 0) { const c = compose(B.mats[i], B.mats[j], n); r = table[k] = B.idOf(c.R) * 32 + c.loops; }
    return r;
  };
  B.gen = i => { // e_i, 1 ≤ i ≤ n−1
    const m = new Int8Array(2 * n);
    for (let t = 0; t < n; t++) { m[t] = n + t; m[n + t] = t; }
    m[i - 1] = i; m[i] = i - 1; m[n + i - 1] = n + i; m[n + i] = n + i - 1;
    return B.idOf(m);
  };
  BASES[n] = B;
  return B;
}
// shortest words in the e_i (BFS from the identity)
function words(B) {
  if (B.words) return B.words;
  const n = B.n, W = new Array(B.size).fill(null);
  W[B.identity] = [];
  const gens = []; for (let i = 1; i < n; i++) gens.push(B.gen(i));
  let frontier = [B.identity];
  while (frontier.length) {
    const next = [];
    for (const d of frontier) for (let i = 0; i < gens.length; i++) {
      const r = B.comp(d, gens[i]) >> 5;
      if (W[r] === null) { W[r] = W[d].concat(i + 1); next.push(r); }
    }
    frontier = next;
  }
  return (B.words = W);
}
function embedMatch(m, k, n, off) {
  const R = new Int8Array(2 * n);
  for (let t = 0; t < n; t++) { R[t] = n + t; R[n + t] = t; }
  const map = p => (p < k ? off + p : n + off + (p - k));
  for (let p = 0; p < 2 * k; p++) R[map(p)] = map(m[p]);
  return R;
}
function transformMatch(m, n, f) { const R = new Int8Array(2 * n); for (let p = 0; p < 2 * n; p++) R[f(p)] = f(m[p]); return R; }

/* --------------------------------------------------------- cell modules W_{n,k}
 * link states: top halves of diagrams with k through strands; state[i] = partner or −1 (defect)
 */
function cellModule(B, k) {
  B.cells = B.cells || {};
  if (B.cells[k]) return B.cells[k];
  const n = B.n, seen = new Map();
  const keyOf = s => Array.from(s, x => (x < 0 ? '|' : String.fromCharCode(65 + x))).join('');
  for (let id = 0; id < B.size; id++) {
    if (B.through[id] !== k) continue;
    const m = B.mats[id], s = new Int8Array(n);
    for (let i = 0; i < n; i++) s[i] = m[i] < n ? m[i] : -1;
    const key = keyOf(s);
    if (!seen.has(key)) seen.set(key, s);
  }
  const states = [...seen.values()];
  const index = new Map(states.map((s, i) => [keyOf(s), i]));
  const size = states.length;
  const actTab = new Int32Array(B.size * size).fill(-2);
  // D · v  →  (state index)*32 + loops, or −1 for 0
  function act(id, si) {
    const key = id * size + si;
    let r = actTab[key];
    if (r !== -2) return r;
    const D = B.mats[id], v = states[si], res = new Int8Array(n).fill(-3), mid = new Uint8Array(n);
    let dead = false;
    for (let i = 0; i < n && !dead; i++) {
      if (res[i] !== -3) continue;
      let p = i;
      for (;;) {
        const q = D[p];
        if (q < n) { res[i] = q; res[q] = i; break; }
        const j = q - n; mid[j] = 1;
        const w = v[j];
        if (w < 0) { res[i] = -1; break; }
        mid[w] = 1; p = n + w;
      }
    }
    // defects of v must each reach the top
    for (let j = 0; j < n && !dead; j++) {
      if (v[j] >= 0 || mid[j]) continue;
      // defect j not reached from the top ⇒ it is joined to another defect
      dead = true;
    }
    let loops = 0;
    if (!dead) {
      let defects = 0;
      for (let i = 0; i < n; i++) if (res[i] === -1) defects++;
      if (defects !== k) dead = true;
    }
    if (!dead) {
      for (let j = 0; j < n; j++) {
        if (mid[j]) continue;
        loops++;
        let t = j;
        do { mid[t] = 1; const t2 = D[n + t] - n; mid[t2] = 1; t = v[t2]; } while (t !== j);
      }
      r = index.get(keyOf(res)) * 32 + loops;
    } else r = -1;
    actTab[key] = r;
    return r;
  }
  // ⟨v, w⟩ = δ^loops or 0 (returns loops or −1)
  function gram(a, b) {
    const v = states[a], w = states[b], seen = new Uint8Array(n);
    let loops = 0;
    for (let s = 0; s < n; s++) {
      if (seen[s]) continue;
      // walk both ways from s, alternating v-arcs and w-arcs, until a defect or back at s
      const walk = (start, first) => {
        let q = start, useV = first, steps = 0;
        for (;;) {
          seen[q] = 1;
          const nx = useV ? v[q] : w[q];
          if (nx < 0) return useV ? 'v' : 'w';
          seen[nx] = 1;
          q = nx; useV = !useV;
          if (q === start && useV === first) return 'loop';
          if (++steps > 4 * n) return 'loop';
        }
      };
      const e1 = walk(s, true);
      if (e1 === 'loop') { loops++; continue; }
      const e2 = walk(s, false);
      if (e1 === e2) return -1;   // two defects of the same side joined
    }
    return loops;
  }
  const C = { n, k, size, states, index, act, gram };
  B.cells[k] = C;
  return C;
}
function cellDim(n, k) {
  if ((n - k) % 2 || k < 0 || k > n) return 0;
  const j = (n - k) / 2;
  const c = (a, b) => { if (b < 0 || b > a) return 0; let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return Math.round(r); };
  return c(n, j) - c(n, j - 1);
}

/* --------------------------------------------- Bareiss determinant over ℤ[δ] */
function bareissDet(M) {
  const m = M.length;
  if (!m) return [1n];
  M = M.map(r => r.slice());
  let sign = 1n, prev = [1n];
  for (let k = 0; k < m - 1; k++) {
    if (!M[k][k].length) {
      let s = k + 1;
      while (s < m && !M[s][k].length) s++;
      if (s === m) return [];
      const t = M[k]; M[k] = M[s]; M[s] = t; sign = -sign;
    }
    for (let i = k + 1; i < m; i++) {
      for (let j = k + 1; j < m; j++)
        M[i][j] = P.divExact(P.sub(P.mul(M[i][j], M[k][k]), P.mul(M[i][k], M[k][j])), prev);
      M[i][k] = [];
    }
    prev = M[k][k];
  }
  return P.scale(M[m - 1][m - 1], sign);
}
function rankOver(F, M) {
  M = M.map(r => r.slice());
  const rows = M.length, cols = rows ? M[0].length : 0;
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r;
    while (p < rows && F.isZero(M[p][c])) p++;
    if (p === rows) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const iv = F.inv(M[r][c]);
    for (let i = r + 1; i < rows; i++) {
      if (F.isZero(M[i][c])) continue;
      const f = F.mul(M[i][c], iv);
      for (let j = c; j < cols; j++) M[i][j] = F.sub(M[i][j], F.mul(f, M[r][j]));
    }
    r++;
  }
  return r;
}

/* ---------------------------------------------------------------- algebra */
class Algebra {
  constructor(n, F) {
    this.n = n; this.F = F; this.B = basis(n);
    this.jwCache = new Map();
  }
  zero() { return new Map(); }
  identity() { return new Map([[this.B.identity, this.F.one]]); }
  scalar(c) { return this.F.isZero(c) ? new Map() : new Map([[this.B.identity, c]]); }
  diagram(id, c) { return new Map([[id, c || this.F.one]]); }
  fromCode(code) { const m = dyckToMatch(code, this.n); return this.diagram(this.B.idOf(m)); }
  e(i) {
    if (!(i >= 1 && i <= this.n - 1)) throw new Error('e' + i + ' needs 1 ≤ i ≤ ' + (this.n - 1) + ' (n = ' + this.n + ')');
    return this.diagram(this.B.gen(i));
  }
  sigma(i, sign) {
    const F = this.F;
    if (!F.A) throw new Error(F.kind === 'num' ? 'braid generators need the A variable — switch coefficients to ℚ(A)' : 'braid generators need the A variable — switch coefficients to ℚ(A)');
    if (!(i >= 1 && i <= this.n - 1)) throw new Error('σ' + i + ' needs 1 ≤ i ≤ ' + (this.n - 1) + ' (n = ' + this.n + ')');
    const r = new Map([[this.B.identity, sign > 0 ? F.A : F.Ainv]]);
    r.set(this.B.gen(i), sign > 0 ? F.Ainv : F.A);
    return r;
  }
  braid(word) {
    let r = this.identity();
    for (const g of word) r = this.mul(r, this.sigma(Math.abs(g), Math.sign(g)));
    return r;
  }
  add(x, y) {
    const F = this.F, r = new Map(x);
    for (const [id, c] of y) {
      const s = r.has(id) ? F.add(r.get(id), c) : c;
      if (F.isZero(s)) r.delete(id); else r.set(id, s);
    }
    return r;
  }
  scale(x, c) {
    const F = this.F;
    if (F.isZero(c)) return new Map();
    if (F.isOne(c)) return x;
    const r = new Map();
    for (const [id, a] of x) r.set(id, F.mul(a, c));
    return r;
  }
  neg(x) { return this.scale(x, this.F.neg(this.F.one)); }
  sub(x, y) { return this.add(x, this.neg(y)); }
  mul(x, y) {
    const F = this.F, B = this.B;
    if (!x.size || !y.size) return new Map();
    const xs = [...x], ys = [...y];
    const px = prepOf(F, x, xs), py = prepOf(F, y, ys);
    const acc = new Map();
    for (let a = 0; a < xs.length; a++) {
      const ia = xs[a][0], na = px.nums[a];
      for (let b = 0; b < ys.length; b++) {
        const r = B.comp(ia, ys[b][0]), id = r >> 5, loops = r & 31;
        let t = F.rmul(na, py.nums[b]);
        if (loops) t = F.rmul(t, F.rdpow(loops));
        const cur = acc.get(id);
        acc.set(id, cur === undefined ? t : F.radd(cur, t));
      }
    }
    const den = F.denMul(px.den, py.den), out = new Map();
    for (const [id, s] of acc) { const c = F.finish(s, den); if (!F.isZero(c)) out.set(id, c); }
    return this.sorted(out);
  }
  sorted(x) { return new Map([...x].sort((a, b) => a[0] - b[0])); }
  pow(x, k) {
    let r = this.identity(), b = x;
    while (k) { if (k & 1) r = this.mul(r, b); k >>= 1; if (k) b = this.mul(b, b); }
    return r;
  }
  eq(x, y) {
    if (x.size !== y.size) return false;
    for (const [id, c] of x) { const d = y.get(id); if (d === undefined || !this.F.eq(c, d)) return false; }
    return true;
  }
  isScalar(x) { // returns c if x = c·1
    if (!x.size) return this.F.zero;
    if (x.size === 1 && x.has(this.B.identity)) return x.get(this.B.identity);
    return null;
  }
  trace(x) {
    const F = this.F; let s = F.zero;
    for (const [id, c] of x) s = F.add(s, F.mul(c, F.dpow(this.B.trLoops[id])));
    return s;
  }
  plat(x) {
    if (this.n % 2) throw new Error('plat closure needs an even number of strands');
    const F = this.F; let s = F.zero;
    for (const [id, c] of x) s = F.add(s, F.mul(c, F.dpow(this.B.platLoops[id])));
    return s;
  }
  mapDiagrams(x, f, coef) {
    const r = new Map(), F = this.F;
    for (const [id, c] of x) {
      const id2 = this.B.idOf(f(this.B.mats[id]));
      const c2 = coef ? coef(c) : c;
      const s = r.has(id2) ? F.add(r.get(id2), c2) : c2;
      if (F.isZero(s)) r.delete(id2); else r.set(id2, s);
    }
    return this.sorted(r);
  }
  star(x) { const n = this.n; return this.mapDiagrams(x, m => transformMatch(m, n, p => (p < n ? p + n : p - n))); }
  mirror(x) { const n = this.n; return this.mapDiagrams(x, m => transformMatch(m, n, p => (p < n ? n - 1 - p : 3 * n - 1 - p))); }
  rot(x, k = 1) {
    const n = this.n, N = 2 * n;
    return this.mapDiagrams(x, m => transformMatch(m, n, p => cycPos((((cycPos(p, n) + k) % N) + N) % N, n)));
  }
  bar(x) { const F = this.F; return this.mapDiagrams(x, m => m, c => F.bar(c)); }
  embed(x, k, off) { // element of TL_k (Map over basis(k)) placed on strands off..off+k−1
    const Bk = basis(k), n = this.n, r = new Map();
    for (const [id, c] of x) r.set(this.B.idOf(embedMatch(Bk.mats[id], k, n, off)), c);
    return this.sorted(r);
  }
  // Jones–Wenzl projector p_k on strands off+1..off+k
  jw(k, off = 0) {
    if (!(k >= 0 && k + off <= this.n)) throw new Error('JW(' + k + (off ? ',' + (off + 1) : '') + ') does not fit in ' + this.n + ' strands');
    if (k <= 1) return this.identity();
    return this.embed(jwIn(this.F, k), k, off);
  }
  // minimal polynomial of x (monic, coefficients low→high) via the regular representation
  minpoly(x, maxDeg = 40) {
    const F = this.F, rows = []; // {vec: Map, piv, comb: [] coeffs of powers}
    let pw = this.identity();
    for (let m = 0; m <= maxDeg; m++) {
      let v = new Map(pw), comb = new Array(m + 1).fill(F.zero); comb[m] = F.one;
      for (const r of rows) {
        const c = v.get(r.piv);
        if (c === undefined) continue;
        const f = F.mul(c, r.ipiv);
        v = this.sub(v, this.scale(r.vec, f));
        for (let i = 0; i < r.comb.length; i++) comb[i] = F.sub(comb[i], F.mul(f, r.comb[i]));
      }
      if (!v.size) return comb;   // Σ comb[i] x^i = 0, comb[m] = 1
      const piv = v.keys().next().value;
      rows.push({ vec: v, piv, ipiv: F.inv(v.get(piv)), comb });
      pw = this.mul(pw, x);
    }
    throw new Error('minimal polynomial degree exceeds ' + maxDeg);
  }
  inverse(x) {
    const F = this.F, mp = this.minpoly(x);
    if (F.isZero(mp[0])) throw new Error('not invertible: the minimal polynomial has zero constant term');
    // x^{-1} = −(1/c0) Σ_{i≥1} c_i x^{i−1}
    let r = new Map(), pw = this.identity();
    for (let i = 1; i < mp.length; i++) { r = this.add(r, this.scale(pw, mp[i])); if (i + 1 < mp.length) pw = this.mul(pw, x); }
    return this.scale(r, F.neg(F.inv(mp[0])));
  }
  commutesWithAll(x) {
    for (let i = 1; i < this.n; i++) { const e = this.e(i); if (!this.eq(this.mul(e, x), this.mul(x, e))) return false; }
    return true;
  }
  killedBy(x, side) {
    for (let i = 1; i < this.n; i++) { const e = this.e(i); if ((side === 'left' ? this.mul(e, x) : this.mul(x, e)).size) return false; }
    return true;
  }
  // matrix of x on W_{n,k}: M[row][col] (F elements)
  cellMatrix(x, k) {
    const C = cellModule(this.B, k), F = this.F;
    const M = Array.from({ length: C.size }, () => new Array(C.size).fill(F.zero));
    for (const [id, c] of x) for (let s = 0; s < C.size; s++) {
      const r = C.act(id, s);
      if (r < 0) continue;
      const t = r >> 5;
      M[t][s] = F.add(M[t][s], F.mul(c, F.dpow(r & 31)));
    }
    return M;
  }
  cellChar(x, k) {
    const C = cellModule(this.B, k), F = this.F;
    let s = F.zero;
    for (const [id, c] of x) {
      let t = F.zero;
      for (let v = 0; v < C.size; v++) { const r = C.act(id, v); if (r >= 0 && r >> 5 === v) t = F.add(t, F.dpow(r & 31)); }
      if (!F.isZero(t)) s = F.add(s, F.mul(c, t));
    }
    return s;
  }
}
// cleared-denominator form of an element, cached (elements are never mutated once built)
const PREP = new WeakMap();
function prepOf(F, x, entries) {
  let p = PREP.get(x);
  if (!p || p.F !== F) { p = F.prep(entries.map(t => t[1])); p.F = F; PREP.set(x, p); }
  return p;
}
const JW = new WeakMap();
// p_k ∈ TL_k via p_k = (p_{k−1}⊗1)·Σ_{j=1}^{k} (−1)^{k−j} ([j]/[k]) e_{k−1}e_{k−2}⋯e_j
function jwIn(F, k) {
  let cache = JW.get(F);
  if (!cache) JW.set(F, (cache = []));
  if (cache[k]) return cache[k];
  if (k <= 1) { const B = basis(Math.max(k, 1)); return (cache[k] = new Map([[B.identity, F.one]])); }
  for (let j = 2; j <= k; j++) if (F.isZero(F.qint(j))) throw new Error('p' + k + ' does not exist at this δ: [' + j + '] = 0');
  const prev = jwIn(F, k - 1), T = new Algebra(k, F);
  const left = T.embed(prev, k - 1, 0);
  let right = new Map(), word = T.identity();
  const ik = F.inv(F.qint(k));
  for (let j = k; j >= 1; j--) {
    if (j < k) word = T.mul(word, T.e(j));
    let c = F.mul(F.qint(j), ik);
    if ((k - j) % 2) c = F.neg(c);
    right = T.add(right, T.scale(word, c));
  }
  return (cache[k] = T.mul(left, right));
}

/* ------------------------------------------------------- braid closures */
function braidClosure(word, n, plat) {
  const L = word.length;
  if (!plat) {
    let w = 0; const perm = []; for (let i = 0; i < n; i++) perm.push(i);
    for (const g of word) { w += Math.sign(g); const i = Math.abs(g) - 1; [perm[i], perm[i + 1]] = [perm[i + 1], perm[i]]; }
    // perm[pos] = strand now at pos; components = cycles of the induced permutation top→bottom
    const down = new Array(n); for (let p = 0; p < n; p++) down[perm[p]] = p;
    const seen = new Uint8Array(n); let comps = 0;
    for (let i = 0; i < n; i++) if (!seen[i]) { comps++; let j = i; while (!seen[j]) { seen[j] = 1; j = down[j]; } }
    return { writhe: w, components: comps };
  }
  // plat: orient by walking; record direction of each strand through each crossing
  const dirs = word.map(() => []);
  const seenTop = new Uint8Array(n);
  let comps = 0;
  const goDown = p => { for (let t = 0; t < L; t++) { const i = Math.abs(word[t]) - 1; if (p === i || p === i + 1) { dirs[t].push(1); p = p === i ? i + 1 : i; } } return p; };
  const goUp = p => { for (let t = L - 1; t >= 0; t--) { const i = Math.abs(word[t]) - 1; if (p === i || p === i + 1) { dirs[t].push(-1); p = p === i ? i + 1 : i; } } return p; };
  for (let s = 0; s < n; s++) {
    if (seenTop[s]) continue;
    comps++;
    let p = s;
    for (;;) {
      seenTop[p] = 1;
      const b = goDown(p) ^ 1;           // cup at the bottom
      const t = goUp(b);                 // arrive at top position t
      seenTop[t] = 1;
      p = t ^ 1;                         // cap at the top
      if (p === s) break;
    }
  }
  let w = 0;
  word.forEach((g, t) => { w += Math.sign(g) * (dirs[t][0] === dirs[t][1] ? 1 : -1); });
  return { writhe: w, components: comps };
}
// Jones polynomial from the bracket (⟨O⟩ = 1) and writhe: V = (−A³)^{−w}⟨L⟩ at A = t^{−1/4}
// returns sorted [{k: BigInt, e4: exponent of t times 4}]  (e4 = −(exponent of A))
function jonesFromBracket(br, w) {
  if (br.d.length !== 1 || br.d[0] !== 1n) return null;
  const sgn = w % 2 ? -1n : 1n, shift = -3 * w;
  const out = [];
  for (let i = 0; i < br.n.length; i++) {
    if (br.n[i] === 0n) continue;
    out.push({ k: (br.n[i] / br.d[0]) * sgn, e4: -(br.v + i + shift) });
  }
  return out.sort((a, b) => a.e4 - b.e4);
}
function laurentT(js, html) {
  if (!js.length) return '0';
  const fmtE = e4 => {
    const g = e4 % 4 === 0 ? 4 : e4 % 2 === 0 ? 2 : 1;
    const num = e4 / g, den = 4 / g;
    return den === 1 ? String(num) : num + '/' + den;
  };
  return js.map((t, i) => {
    const a = babs(t.k), e = fmtE(t.e4);
    let mono;
    if (t.e4 === 0) mono = String(a);
    else if (html) mono = (a === 1n ? '' : String(a)) + '<i>t</i>' + (e === '1' ? '' : supHtml(e));
    else mono = (a === 1n ? '' : a + '*') + 't' + (e === '1' ? '' : '^(' + e + ')');
    const s = t.k < 0n ? (i ? (html ? ' ' + MINUS + ' ' : ' - ') : (html ? MINUS : '-')) : i ? ' + ' : '';
    return s + mono;
  }).join('');
}

/* ---------------------------------------------------------- Gram data */
function gramData(n, k) {
  const B = basis(n), C = cellModule(B, k);
  const G = [];
  for (let a = 0; a < C.size; a++) {
    const row = [];
    for (let b = 0; b < C.size; b++) { const l = C.gram(a, b); row.push(l < 0 ? -1 : l); }
    G.push(row);
  }
  return { C, G };
}
function gramDet(n, k) { // polynomial in δ
  const { G } = gramData(n, k);
  const M = G.map(r => r.map(l => (l < 0 ? [] : P.shift([1n], l))));
  return bareissDet(M);
}

return {
  MAXN, P, LP, RF, Q, makeField, parseRational, basis, words, cellModule, cellDim, compose, dyckToMatch, matchToDyck,
  isPlanar, Algebra, braidClosure, jonesFromBracket, laurentT, gramData, gramDet, factorPoly, psi, cyclotomic,
  rfHtml, rfText, sumHtml, terms, supHtml, bareissDet, rankOver, closureLoops, jwIn,
  rfFromPoly: p => RF.mul({ v: 0, n: P.trim(p), d: [1n] }, RF.one),
};
});
