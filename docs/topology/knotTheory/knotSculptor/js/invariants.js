// Knot and link invariants from a signed Gauss code (see diagram.js), plus geometric quantities of the
// 3D curve itself.

import { P, BP } from './poly.js';
import {
  pdFromGauss, seifertCircles, linkingMatrix, writhe, crossingCount, simplifyGauss,
} from './diagram.js';

const D_LOOP = P.from([[2, -1], [-2, -1]]); // d = −A² − A⁻²

// ⟨D⟩ by contracting crossings one at a time. The state is a pairing of the open edge ends on the
// frontier; ⟨X[i,j,k,l]⟩ = A⟨P[i,j]P[k,l]⟩ + A⁻¹⟨P[i,l]P[j,k]⟩. Returns the unnormalized bracket
// (every loop, including the last one, contributes d), or null if the frontier gets too wide.
export function kauffmanBracket(pd, freeLoops = 0, { maxStates = 400000 } = {}) {
  let states = new Map([['', { pairs: new Map(), poly: P.one() }]]);
  const remaining = pd.map((x, i) => i);
  const open = new Set();
  while (remaining.length) {
    // greedy: the crossing touching the most open ends keeps the frontier narrow
    let bi = 0, bs = -1;
    for (let r = 0; r < remaining.length; r++) {
      const X = pd[remaining[r]];
      let s = 0;
      for (const e of X) if (open.has(e)) s++;
      if (s > bs) { bs = s; bi = r; }
    }
    const X = pd[remaining.splice(bi, 1)[0]];
    for (const e of X) { if (open.has(e)) open.delete(e); else open.add(e); }
    const [i, j, k, l] = X;
    const smoothings = [[1, [[i, j], [k, l]]], [-1, [[i, l], [j, k]]]];
    const next = new Map();
    for (const st of states.values()) {
      for (const [aexp, pairs] of smoothings) {
        const m = new Map(st.pairs);
        let loops = 0;
        for (const [x, y] of pairs) loops += addPair(m, x, y);
        let poly = P.shift(st.poly, aexp);
        for (let t = 0; t < loops; t++) poly = P.mul(poly, D_LOOP);
        const key = pairingKey(m);
        const prev = next.get(key);
        if (prev) P.addInto(prev.poly, poly);
        else next.set(key, { pairs: m, poly });
      }
    }
    states = next;
    if (states.size > maxStates) return null;
  }
  let total = P.zero();
  for (const st of states.values()) P.addInto(total, st.poly);
  if (!pd.length) total = P.one();
  // crossingless components are extra loops
  for (let t = 0; t < freeLoops; t++) total = P.mul(total, D_LOOP);
  return total;
}

// Join the arc ends x and y in the pairing m (label → partner). Returns 1 if this closes a loop.
function addPair(m, x, y) {
  if (x === y) return 1;
  const px = m.get(x), py = m.get(y);
  if (px === undefined && py === undefined) { m.set(x, y); m.set(y, x); return 0; }
  if (px !== undefined && py === undefined) { m.delete(x); m.set(px, y); m.set(y, px); return 0; }
  if (px === undefined && py !== undefined) { m.delete(y); m.set(py, x); m.set(x, py); return 0; }
  if (px === y) { m.delete(x); m.delete(y); return 1; }
  m.delete(x); m.delete(y);
  m.set(px, py); m.set(py, px);
  return 0;
}

function pairingKey(m) {
  const ks = [];
  for (const [a, b] of m) if (a < b) ks.push(a * 100003 + b);
  ks.sort((a, b) => a - b);
  return ks.join(',');
}

// Jones polynomial V(t) = (−A³)^{−w}⟨D⟩/d at A = t^{−1/4}. Returns { bracket, jones } or null.
export function jonesFromGauss(g) {
  const { pd, freeLoops } = pdFromGauss(g);
  const br = kauffmanBracket(pd, freeLoops);
  if (!br) return null;
  const norm = P.divExact(br, D_LOOP);             // ⟨unknot⟩ = 1
  const w = writhe(g);
  const f = P.scale(P.shift(norm, -3 * w), w % 2 === 0 ? 1 : -1); // (−A³)^{−w}
  return { bracket: norm, jones: P.substitute(f, -1 / 4) };
}

// Alexander polynomial from the Wirtinger presentation (Fox calculus, all meridians ↦ t).
// Returns { poly (Laurent, symmetric), split } — split links give 0.
export function alexanderFromGauss(g) {
  const n = crossingCount(g);
  const mu = g.ncomp;
  if (n === 0) return { poly: mu === 1 ? P.one() : P.zero() };
  // arcs: a new arc starts after every under event
  let arcs = 0;
  const compArcs = g.comps.map(ev => {
    if (!ev.length) return null;
    const firstUnder = ev.findIndex(e => !e.over);
    if (firstUnder < 0) return 'allover';
    return firstUnder;
  });
  if (compArcs.some(a => a === null || a === 'allover')) return { poly: P.zero(), split: true };
  const rec = new Map(); // x → { o: over arc, a: incoming under arc, b: outgoing under arc }
  const R = x => { let r = rec.get(x); if (!r) { r = {}; rec.set(x, r); } return r; };
  g.comps.forEach((ev, c) => {
    const k = ev.length;
    const start = compArcs[c];       // index of the first under event; its outgoing arc is `base`
    const base = arcs;
    let cur = base;
    for (let s = 1; s <= k; s++) {
      const e = ev[(start + s) % k];
      if (e.over) R(e.x).o = cur;
      else {
        R(e.x).a = cur;
        if (s === k) R(e.x).b = base;
        else { cur++; R(e.x).b = cur; }
      }
    }
    arcs = cur + 1;
  });
  if (arcs !== n) return { poly: P.zero(), split: true };
  const xs = [...rec.keys()];
  const M = xs.map(() => Array.from({ length: n }, () => []));
  const addTo = (row, col, poly) => { M[row][col] = BP.add(M[row][col], poly); };
  const ONE = [1n], T = [0n, 1n], ONE_MINUS_T = [1n, -1n], NEG = [-1n];
  xs.forEach((x, row) => {
    const r = rec.get(x);
    const s = g.sign.get(x);
    addTo(row, r.o, ONE_MINUS_T);
    if (s > 0) { addTo(row, r.a, T); addTo(row, r.b, NEG); }
    else { addTo(row, r.a, NEG); addTo(row, r.b, T); }
  });
  const minor = M.slice(0, n - 1).map(row => row.slice(0, n - 1));
  const det = BP.det(minor);
  if (!det.length) return { poly: P.zero() };
  // to a Laurent polynomial, centered
  let lo = 0; while (det[lo] === 0n) lo++;
  const hi = det.length - 1;
  const mid = (lo + hi) / 2;
  let poly = new Map();
  for (let e = lo; e <= hi; e++) if (det[e] !== 0n) poly.set(e - mid, Number(det[e]));
  if (mu === 1) {
    const v1 = P.evalAt(poly, 1);
    if (v1 < 0) poly = P.scale(poly, -1);
  } else {
    // links: sign is not canonical here; make the top coefficient positive
    if (poly.get(P.maxExp(poly)) < 0) poly = P.scale(poly, -1);
  }
  return { poly };
}

export function determinantFromAlexander(poly) {
  // |Δ(−1)| with half-integer exponents handled by |(-1)^e| = 1 phases: Δ(−1) = Σ c_e (−1)^e, take modulus
  let re = 0, im = 0;
  for (const [e, c] of poly) { re += c * Math.cos(Math.PI * e); im += c * Math.sin(Math.PI * e); }
  return Math.round(Math.hypot(re, im));
}

// ────────────────────────── geometry of the 3D curve ──────────────────────────

export function curveLength(components) {
  let L = 0;
  for (const pts of components) {
    const N = pts.length / 3;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      L += Math.hypot(pts[3 * j] - pts[3 * i], pts[3 * j + 1] - pts[3 * i + 1], pts[3 * j + 2] - pts[3 * i + 2]);
    }
  }
  return L;
}

// Total curvature of each component = sum of exterior angles (Fáry–Milnor: knotted ⇒ > 4π).
export function totalCurvature(pts) {
  const N = pts.length / 3;
  let K = 0;
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const ux = pts[3 * i] - pts[3 * a], uy = pts[3 * i + 1] - pts[3 * a + 1], uz = pts[3 * i + 2] - pts[3 * a + 2];
    const vx = pts[3 * b] - pts[3 * i], vy = pts[3 * b + 1] - pts[3 * i + 1], vz = pts[3 * b + 2] - pts[3 * i + 2];
    const c = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz) || 1);
    K += Math.acos(Math.max(-1, Math.min(1, c)));
  }
  return K;
}

// Gauss-integral writhe Wr of one closed polygon (Klenin–Langowski exact segment-pair formula):
// the average of the diagram writhe over all projection directions.
export function gaussWrithe(pts) {
  const N = pts.length / 3;
  const p = i => [pts[3 * (i % N)], pts[3 * (i % N) + 1], pts[3 * (i % N) + 2]];
  let W = 0;
  for (let i = 0; i < N; i++) {
    const p1 = p(i), p2 = p(i + 1);
    for (let j = i + 2; j < N; j++) {
      if (i === 0 && j === N - 1) continue;
      const p3 = p(j), p4 = p(j + 1);
      W += pairOmega(p1, p2, p3, p4);
    }
  }
  return (2 * W) / (4 * Math.PI);
}

// Gauss linking integral between two closed polygons (should be an integer up to rounding).
export function gaussLinking(A, B) {
  const NA = A.length / 3, NB = B.length / 3;
  let W = 0;
  for (let i = 0; i < NA; i++) {
    const p1 = [A[3 * i], A[3 * i + 1], A[3 * i + 2]];
    const i2 = (i + 1) % NA;
    const p2 = [A[3 * i2], A[3 * i2 + 1], A[3 * i2 + 2]];
    for (let j = 0; j < NB; j++) {
      const j2 = (j + 1) % NB;
      W += pairOmega(p1, p2, [B[3 * j], B[3 * j + 1], B[3 * j + 2]], [B[3 * j2], B[3 * j2 + 1], B[3 * j2 + 2]]);
    }
  }
  return W / (4 * Math.PI);
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function crs(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dt(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function nrm(a) { const n = Math.hypot(a[0], a[1], a[2]); return n < 1e-300 ? null : [a[0] / n, a[1] / n, a[2] / n]; }
function asinC(x) { return Math.asin(Math.max(-1, Math.min(1, x))); }

function pairOmega(p1, p2, p3, p4) {
  const r13 = sub(p3, p1), r14 = sub(p4, p1), r23 = sub(p3, p2), r24 = sub(p4, p2);
  const n1 = nrm(crs(r13, r14)), n2 = nrm(crs(r14, r24)), n3 = nrm(crs(r24, r23)), n4 = nrm(crs(r23, r13));
  if (!n1 || !n2 || !n3 || !n4) return 0;
  const om = asinC(dt(n1, n2)) + asinC(dt(n2, n3)) + asinC(dt(n3, n4)) + asinC(dt(n4, n1));
  const s = dt(crs(sub(p4, p3), sub(p2, p1)), r13);
  return s > 0 ? om : s < 0 ? -om : 0;
}

// ────────────────────────── everything at once ──────────────────────────

// Combinatorial invariants of a (simplified) Gauss code.
export function diagramInvariants(g, { simplify = true } = {}) {
  const gs = simplify ? simplifyGauss(g) : g;
  const mu = gs.ncomp;
  const c = crossingCount(gs);
  const sc = seifertCircles(gs);
  const res = {
    components: mu,
    crossings: c,
    writhe: writhe(gs),
    seifertCircles: sc.count,
    gauss: gs,
  };
  // Seifert's algorithm surface: χ = s − c; genus of a connected surface = (2 − μ − χ)/2
  res.seifertGenus = (c - sc.count - mu + 2) / 2;
  const J = c <= 40 ? jonesFromGauss(gs) : null;
  if (J) { res.jones = J.jones; res.bracket = J.bracket; }
  if (c <= 60) {
    const A = alexanderFromGauss(gs);
    res.alexander = A.poly;
    res.determinant = determinantFromAlexander(A.poly);
  }
  if (mu > 1) res.linking = linkingMatrix(gs);
  if (res.alexander && res.alexander.size) {
    const span = P.span(res.alexander);
    res.genusLower = Math.max(0, Math.ceil((span - mu + 1) / 2));
  } else if (res.alexander) {
    res.genusLower = 0;
  }
  return res;
}

export function geometricInvariants(components) {
  const curv = components.map(totalCurvature);
  const out = {
    length: curveLength(components),
    curvature: curv,
    writheGauss: components.map(c => gaussWrithe(c)),
  };
  if (components.length > 1) {
    out.linkingGauss = [];
    for (let a = 0; a < components.length; a++) for (let b = a + 1; b < components.length; b++) {
      out.linkingGauss.push({ a, b, lk: gaussLinking(components[a], components[b]) });
    }
  }
  return out;
}
