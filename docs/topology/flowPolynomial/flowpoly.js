/*
 * flowpoly.js — exact flow polynomials of multigraphs via deletion–contraction,
 * plus exact arithmetic in Z[phi] for checking Tutte's golden identity
 *     F(G, phi+2) = phi^|E| * F(G, phi+1)^2   (planar cubic G)
 * whose converse is the Agol–Krushkal conjecture (arXiv:1801.00502).
 *
 * Works in the browser (window.FlowPoly) and in node (module.exports).
 * Vertex ids must be numbers. Edges are pairs [u, v]; loops and parallel
 * edges are allowed (they arise during contraction).
 */
(function (root) {
  'use strict';

  // ---------- polynomials over the integers: p[i] = coefficient of t^i ----------
  function pTrim(p) {
    let n = p.length;
    while (n > 0 && p[n - 1] === 0) n--;
    p.length = n;
    return p;
  }
  function pAdd(a, b) {
    const r = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) r[i] = (a[i] || 0) + (b[i] || 0);
    return pTrim(r);
  }
  function pSub(a, b) {
    const r = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) r[i] = (a[i] || 0) - (b[i] || 0);
    return pTrim(r);
  }
  function pMul(a, b) {
    if (!a.length || !b.length) return [];
    const r = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0) continue;
      for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    }
    return pTrim(r);
  }
  function pPow(p, n) {
    let r = [1], base = p;
    while (n > 0) {
      if (n & 1) r = pMul(r, base);
      base = pMul(base, base);
      n >>= 1;
    }
    return r;
  }
  function pEval(p, x) {
    if (Number.isInteger(x)) {
      // exact BigInt Horner (intermediates can exceed 2^53 even when the
      // coefficients don't); Number() at the end is exactly-rounded, and
      // zero results stay exactly zero
      let v = 0n;
      const bx = BigInt(x);
      for (let i = p.length - 1; i >= 0; i--) v = v * bx + BigInt(p[i]);
      return Number(v);
    }
    let v = 0;
    for (let i = p.length - 1; i >= 0; i--) v = v * x + p[i];
    return v;
  }
  function polyToString(p, varName) {
    varName = varName || 't';
    if (!p.length) return '0';
    const parts = [];
    for (let i = p.length - 1; i >= 0; i--) {
      const c = p[i];
      if (c === 0) continue;
      const abs = Math.abs(c);
      let term;
      if (i === 0) term = String(abs);
      else term = (abs === 1 ? '' : String(abs)) + varName + (i > 1 ? '^' + i : '');
      parts.push([c < 0 ? '-' : '+', term]);
    }
    let s = parts.map(([sg, t], k) => (k === 0 ? (sg === '-' ? '-' : '') : ' ' + sg + ' ') + t).join('');
    return s;
  }

  const T1 = [-1, 1]; // t - 1

  // ---------- Z[phi], phi^2 = phi + 1; x = [a, b] represents a + b*phi ----------
  // BigInt throughout: the identity's right-hand side phi^E * F(phi+1)^2 has
  // components that exceed 2^53 already around E = 57, and the identity
  // check must stay exact. Inputs may be Number or BigInt pairs.
  function gNorm(x) { return [BigInt(x[0]), BigInt(x[1])]; }
  function gAdd(x, y) {
    x = gNorm(x); y = gNorm(y);
    return [x[0] + y[0], x[1] + y[1]];
  }
  function gMul(x, y) {
    const a = BigInt(x[0]), b = BigInt(x[1]), c = BigInt(y[0]), d = BigInt(y[1]);
    return [a * c + b * d, a * d + b * c + b * d];
  }
  function gPow(x, n) {
    let r = [1n, 0n], base = gNorm(x);
    while (n > 0) {
      if (n & 1) r = gMul(r, base);
      base = gMul(base, base);
      n >>= 1;
    }
    return r;
  }
  function gEq(x, y) {
    x = gNorm(x); y = gNorm(y);
    return x[0] === y[0] && x[1] === y[1];
  }
  function gToNumber(x) { return Number(x[0]) + Number(x[1]) * (1 + Math.sqrt(5)) / 2; }
  function gToString(x) {
    const [a, b] = gNorm(x);
    if (a === 0n && b === 0n) return '0';
    const parts = [];
    if (a !== 0n) parts.push(String(a));
    if (b !== 0n) {
      const abs = b < 0n ? -b : b;
      const coef = abs === 1n ? '' : String(abs);
      if (parts.length) parts.push((b < 0n ? '- ' : '+ ') + coef + 'φ');
      else parts.push((b < 0n ? '-' : '') + coef + 'φ');
    }
    return parts.join(' ');
  }
  // Horner evaluation of an integer polynomial at a point of Z[phi]
  function pEvalGolden(p, x) {
    let v = [0n, 0n];
    const bx = gNorm(x);
    for (let i = p.length - 1; i >= 0; i--) v = gAdd(gMul(v, bx), [BigInt(p[i]), 0n]);
    return v;
  }

  // ---------- graph helpers (edges: array of [u, v], numeric ids) ----------
  function componentsOf(edges) {
    const parent = new Map();
    const find = (x) => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)));
        x = parent.get(x);
      }
      return x;
    };
    for (const [a, b] of edges) {
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const groups = new Map();
    for (const e of edges) {
      const r = find(e[0]);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(e);
    }
    return [...groups.values()];
  }

  function hasBridge(edges) {
    const adj = new Map();
    const push = (a, b, i) => {
      let l = adj.get(a);
      if (!l) { l = []; adj.set(a, l); }
      l.push([b, i]);
    };
    edges.forEach(([a, b], i) => { if (a !== b) { push(a, b, i); push(b, a, i); } });
    const disc = new Map(), low = new Map();
    let time = 0, found = false;
    function dfs(u, parentEdge) {
      disc.set(u, time); low.set(u, time); time++;
      for (const [w, ei] of adj.get(u)) {
        if (ei === parentEdge) continue;
        if (!disc.has(w)) {
          dfs(w, ei);
          if (found) return;
          low.set(u, Math.min(low.get(u), low.get(w)));
          if (low.get(w) > disc.get(u)) { found = true; return; }
        } else {
          low.set(u, Math.min(low.get(u), disc.get(w)));
        }
      }
    }
    for (const v of adj.keys()) {
      if (!disc.has(v)) {
        dfs(v, -1);
        if (found) return true;
      }
    }
    return false;
  }

  // ---------- flow polynomial ----------
  // Deterministic cache key: relabel vertices by first appearance in the
  // sorted edge list. Not isomorphism-invariant, but catches the frequent
  // identical subproblems produced by deletion-contraction.
  function canonKey(edges) {
    const norm = edges
      .map(([a, b]) => (a < b ? [a, b] : [b, a]))
      .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const map = new Map();
    let next = 0;
    const rel = norm.map(([a, b]) => {
      if (!map.has(a)) map.set(a, next++);
      if (!map.has(b)) map.set(b, next++);
      const x = map.get(a), y = map.get(b);
      return x < y ? [x, y] : [y, x];
    }).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return rel.map((e) => e[0] + ',' + e[1]).join(';');
  }

  function fp(edges, memo, budget) {
    if (++budget.calls > budget.limit) throw new Error('flow-poly-budget-exceeded');
    // factor out loops: each contributes (t - 1)
    let loops = 0;
    let list = [];
    for (const [a, b] of edges) {
      if (a === b) loops++;
      else list.push([a, b]);
    }
    // smooth degree-2 vertices (flow polynomial is invariant); this may
    // produce loops (when both edges go to the same neighbour), which
    // become (t - 1) factors
    for (;;) {
      const deg = new Map();
      for (const [a, b] of list) {
        deg.set(a, (deg.get(a) || 0) + 1);
        deg.set(b, (deg.get(b) || 0) + 1);
      }
      let v2 = null;
      for (const [v, d] of deg) if (d === 2) { v2 = v; break; }
      if (v2 === null) break;
      const inc = [], rest = [];
      for (const e of list) (e[0] === v2 || e[1] === v2 ? inc : rest).push(e);
      const ends = inc.map((e) => (e[0] === v2 ? e[1] : e[0]));
      if (ends[0] === ends[1]) loops++;
      else rest.push([ends[0], ends[1]]);
      list = rest;
    }
    const loopFactor = pPow(T1, loops);
    if (!list.length) return loopFactor;
    if (hasBridge(list)) return [];
    let result = loopFactor;
    for (const comp of componentsOf(list)) {
      result = pMul(result, fpCore(comp, memo, budget));
      if (!result.length) return result;
    }
    return result;
  }

  // core deletion-contraction on a connected, bridgeless, loop-free
  // multigraph with minimum degree >= 3
  function fpCore(edges, memo, budget) {
    const key = canonKey(edges);
    const hit = memo.get(key);
    if (hit) return hit;
    // pick a parallel edge if one exists (contraction turns its partners
    // into loops), otherwise an edge of maximal degree sum
    const count = new Map(), deg = new Map();
    for (const [a, b] of edges) {
      const k = a < b ? a + '|' + b : b + '|' + a;
      count.set(k, (count.get(k) || 0) + 1);
      deg.set(a, (deg.get(a) || 0) + 1);
      deg.set(b, (deg.get(b) || 0) + 1);
    }
    let best = null, bestScore = -Infinity;
    for (const e of edges) {
      const [a, b] = e;
      const k = a < b ? a + '|' + b : b + '|' + a;
      const score = (count.get(k) > 1 ? 1e6 : 0) + deg.get(a) + deg.get(b);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    const e = best, u = e[0], v = e[1];
    const del = edges.filter((x) => x !== e);
    const con = del.map(([a, b]) => [a === v ? u : a, b === v ? u : b]);
    // F(G) = F(G/e) - F(G\e)
    const res = pSub(fp(con, memo, budget), fp(del, memo, budget));
    memo.set(key, res);
    return res;
  }

  function flowPoly(edgePairs, opts) {
    const memo = new Map();
    const budget = { calls: 0, limit: (opts && opts.limit) || 500000 };
    return fp(edgePairs.map((e) => [e[0], e[1]]), memo, budget);
  }

  const api = {
    flowPoly, hasBridge, componentsOf,
    pAdd, pSub, pMul, pPow, pEval, polyToString,
    gAdd, gMul, gPow, gEq, gToNumber, gToString, pEvalGolden,
    PHI: (1 + Math.sqrt(5)) / 2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlowPoly = api;
})(typeof window !== 'undefined' ? window : globalThis);
