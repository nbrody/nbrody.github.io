// G₂ = Aut(O) and its Bruhat–Tits buildings B(G₂(Q_p)).
//
// • The octonion algebra O ⊗ Q_p is split for every prime p (including 2), and G₂ is
//   split over every Q_p, so each B_p is a thick building of type G̃₂ whose apartments are
//   the 30–60–90 tiling (barycentric subdivision of the triangular tiling).
// • Vertex types (nodes of G̃₂ = 0 — 1 ≡> 2):  type 0 = hyperspecial (G₂(Z_p), 12 chambers
//   around it), type 1 = edge midpoints (SO₄-type, 4 chambers), type 2 = triangle centres
//   (SL₃-type, 6 chambers).  Every panel lies in p+1 chambers.
// • The link of a hyperspecial vertex is the split Cayley hexagon H(p): points = isotropic
//   points of the trace-zero part of the split octonions over F_p, lines = 2-spaces ⟨x,y⟩
//   with xy = 0.  We build it from the octavians mod p.
// • Aut(octavians) ≅ G₂(F₂) (order 12096) and the genus has class number one (Gross), so
//   G₂(Z[1/N]) = Aut(O[1/N]) acts transitively on the hyperspecial vertices of ∏_{p|N} B_p.

import * as O from "./octavian.js";

// ---------------------------------------------------------------------------------------
// Arithmetic in O/pO, coordinates w.r.t. the Z-basis O_BASIS.

const BAS = O.O_BASIS;
export function toBasisCoords(d) {
  // BAS is upper triangular (Hermite form): solve c · BAS = d by forward substitution.
  const c = new Array(8).fill(0n);
  for (let j = 0; j < 8; j++) {
    let s = d[j];
    for (let i = 0; i < j; i++) s -= c[i] * BAS[i][j];
    if (s % BAS[j][j]) throw new Error("not an octavian");
    c[j] = s / BAS[j][j];
  }
  return c;
}
const SC = (() => { // structure constants: b_i b_j = Σ_k SC[i][j][k] b_k
  const t = [];
  for (let i = 0; i < 8; i++) {
    t.push([]);
    for (let j = 0; j < 8; j++) t[i].push(toBasisCoords(O.mul(BAS[i], BAS[j])).map(Number));
  }
  return t;
})();
const NB = BAS.map((b) => Number(O.norm(b)));
const PB = BAS.map((b) => BAS.map((c) => Number(O.polar(b, c))));
const TB = BAS.map((b) => Number(b[0]));

const mod = (x, p) => ((x % p) + p) % p;
export function mulModP(x, y, p) {
  const r = new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    if (!x[i]) continue;
    for (let j = 0; j < 8; j++) {
      if (!y[j]) continue;
      const s = x[i] * y[j], v = SC[i][j];
      for (let k = 0; k < 8; k++) if (v[k]) r[k] += s * v[k];
    }
  }
  return r.map((v) => mod(v, p));
}
export function normModP(x, p) {
  let s = 0;
  for (let i = 0; i < 8; i++) {
    if (!x[i]) continue;
    s += x[i] * x[i] * NB[i];
    for (let j = i + 1; j < 8; j++) if (x[j]) s += x[i] * x[j] * PB[i][j];
  }
  return mod(s, p);
}
export const traceModP = (x, p) => mod(x.reduce((s, v, i) => s + v * TB[i], 0), p);
export function reduceModP(d, p) { return toBasisCoords(d).map((c) => Number(((c % BigInt(p)) + BigInt(p)) % BigInt(p))); }

function inv(a, p) { // inverse mod small prime
  let [r0, r1, s0, s1] = [mod(a, p), p, 1, 0];
  while (r1) { const q = Math.floor(r0 / r1); [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return mod(s0, p);
}
export function normalizePoint(x, p) {
  const i = x.findIndex((v) => v);
  if (i < 0) return null;
  const s = inv(x[i], p);
  return x.map((v) => mod(v * s, p));
}

// Kernel (mod p) of the linear map whose matrix has the given columns (each an 8-vector).
function kernel(cols, p) {
  const n = cols.length; // unknowns
  const A = Array.from({ length: 8 }, (_, r) => cols.map((c) => c[r]));
  const where = new Array(n).fill(-1);
  let row = 0;
  for (let c = 0; c < n && row < 8; c++) {
    let piv = -1;
    for (let r = row; r < 8; r++) if (A[r][c]) { piv = r; break; }
    if (piv < 0) continue;
    [A[row], A[piv]] = [A[piv], A[row]];
    const s = inv(A[row][c], p);
    A[row] = A[row].map((v) => mod(v * s, p));
    for (let r = 0; r < 8; r++) if (r !== row && A[r][c]) {
      const f = A[r][c];
      A[r] = A[r].map((v, k) => mod(v - f * A[row][k], p));
    }
    where[c] = row++;
  }
  const basis = [];
  for (let c = 0; c < n; c++) if (where[c] < 0) {
    const v = new Array(n).fill(0);
    v[c] = 1;
    for (let c2 = 0; c2 < n; c2++) if (where[c2] >= 0) v[c2] = mod(-A[where[c2]][c], p);
    basis.push(v);
  }
  return basis;
}

// ---------------------------------------------------------------------------------------
// The split Cayley hexagon H(p) from O/pO.

const hexCache = new Map();
export function cayleyHexagon(p) {
  if (hexCache.has(p)) return hexCache.get(p);
  if (p > 7) throw new Error("hexagon drawing is limited to p ≤ 7");
  // trace-zero subspace: tr(b_0) = 1 and tr(b_i) = 0 for i > 0 (checked below), so x_0 = 0.
  if (TB[0] !== 1 || TB.slice(1).some((t) => t)) throw new Error("unexpected trace on basis");
  const pts = [], index = new Map();
  const total = p ** 7;
  const x = new Array(8).fill(0);
  for (let n = 1; n < total; n++) {
    let m = n;
    for (let i = 1; i < 8; i++) { x[i] = m % p; m = Math.floor(m / p); }
    const lead = x.findIndex((v) => v);
    if (x[lead] !== 1) continue; // projective normalization
    if (normModP(x, p)) continue;
    index.set(x.join(","), pts.length);
    pts.push(x.slice());
  }
  const lines = [], lineIndex = new Map();
  const pointLines = pts.map(() => []);
  const scaleAdd = (u, s, v) => u.map((a, i) => mod(a + s * v[i], p));
  for (let a = 0; a < pts.length; a++) {
    const xa = pts[a];
    // K = {y in trace-zero part : x y = 0}; unknowns are coefficients on b_1..b_7.
    const cols = [];
    for (let j = 1; j < 8; j++) cols.push(mulModP(xa, BAS_E(j), p));
    const ker = kernel(cols, p).map((v) => [0, ...v]);
    if (ker.length !== 3) throw new Error("hexagon: kernel of L_x has dimension " + ker.length);
    // complete x to a basis (x, u, v) of K
    const others = [];
    for (const k of ker) {
      const cand = [xa, ...others, k];
      if (rankModP(cand, p) === cand.length) others.push(k);
      if (others.length === 2) break;
    }
    const [u, v] = others;
    const seconds = [v];
    for (let t = 0; t < p; t++) seconds.push(scaleAdd(u, t, v));
    for (const w of seconds) {
      const ids = [a];
      for (let s = 0; s < p; s++) {
        const y = normalizePoint(scaleAdd(w, s, xa), p);
        const id = index.get(y.join(","));
        if (id === undefined) throw new Error("hexagon: kernel vector is not a point");
        ids.push(id);
      }
      ids.sort((i, j) => i - j);
      const k = ids.join(",");
      if (!lineIndex.has(k)) {
        lineIndex.set(k, lines.length);
        lines.push(ids);
        for (const id of ids) pointLines[id].push(lines.length - 1);
      }
    }
  }
  const H = { p, points: pts, lines, pointLines };
  hexCache.set(p, H);
  return H;
}
const BAS_E = (j) => { const e = new Array(8).fill(0); e[j] = 1; return e; };
function rankModP(vecs, p) {
  const A = vecs.map((v) => v.slice());
  let r = 0;
  for (let c = 0; c < 8 && r < A.length; c++) {
    let piv = -1;
    for (let i = r; i < A.length; i++) if (A[i][c]) { piv = i; break; }
    if (piv < 0) continue;
    [A[r], A[piv]] = [A[piv], A[r]];
    const s = inv(A[r][c], p);
    A[r] = A[r].map((v) => mod(v * s, p));
    for (let i = 0; i < A.length; i++) if (i !== r && A[i][c]) { const f = A[i][c]; A[i] = A[i].map((v, k) => mod(v - f * A[r][k], p)); }
    r++;
  }
  return r;
}

// Breadth-first levels of the incidence graph from point 0 (points even levels, lines odd).
export function hexagonLevels(H) {
  const P = H.points.length;
  const level = new Map(), parent = new Map();
  const id = (kind, i) => kind + i;
  const q = [["p", 0]];
  level.set(id("p", 0), 0);
  while (q.length) {
    const [kind, i] = q.shift();
    const L = level.get(id(kind, i));
    const nbrs = kind === "p" ? H.pointLines[i].map((j) => ["l", j]) : H.lines[i].map((j) => ["p", j]);
    for (const [k2, j] of nbrs) {
      const key = id(k2, j);
      if (!level.has(key)) { level.set(key, L + 1); parent.set(key, id(kind, i)); q.push([k2, j]); }
    }
  }
  return { level, parent, P };
}

// Classify an octavian mod p as a point of the 8-dim quadric (when p | N(α)):
// trace ≡ 0 → a point of the hexagon (the G₂-orbit of size (p⁶−1)/(p−1));
// trace ≢ 0 → an "idempotent" point (orbit of size p³(p³+1), stabilizer SL₃(F_p)).
export function quadricType(alpha, p) {
  p = BigInt(p);
  if (O.norm(alpha) % p) return "unit";
  if (O.divisibleBy(alpha, p)) return "zero";
  return ((O.trace(alpha) % p) + p) % p === 0n ? "hexagon" : "idempotent";
}

// ---------------------------------------------------------------------------------------
// Apartment geometry.  Hyperspecial vertices: m·u1 + n·u2 with u1 = (1,0), u2 = (½, √3/2).
// Dominant cone at O: a·ω_s + b·ω_ℓ (a, b ≥ 0) with ω_s = u1 (short coweight θ^∨, the
// direction through an edge midpoint) and ω_ℓ = u1 + u2 (long coweight, through a centre).

export const U1 = [1, 0], U2 = [0.5, Math.sqrt(3) / 2];
export const pt = (m, n) => [m * U1[0] + n * U2[0], m * U1[1] + n * U2[1]];

// W(G₂) on lattice coordinates (m, n): rotation by 60° and reflection in the x-axis.
const ROT = ([m, n]) => [-n, m + n];
const REF = ([m, n]) => [m + n, -n];
export function weylOrbit(mn) {
  const out = [];
  let v = mn;
  for (let i = 0; i < 6; i++) { out.push(v); out.push(REF(v)); v = ROT(v); }
  return out;
}
// Position (a, b) of the hyperspecial vertex (m, n) relative to O.
export function position(mn) {
  for (const [m, n] of weylOrbit(mn)) if (m - n >= 0 && n >= 0) return [m - n, n];
  throw new Error("no dominant representative");
}
export const coneToMN = (a, b) => [a + b, b];

// Number of hyperspecial vertices of B(G₂(Q_p)) at position a·ω_s + b·ω_ℓ from a given one:
// |K ϖ^λ K / K| = p^{⟨2ρ,λ⟩} W(p⁻¹)/W_λ(p⁻¹), ⟨2ρ,ω_s⟩ = 6, ⟨2ρ,ω_ℓ⟩ = 10, W(t) = (1+t)(1+t+…+t⁵).
export function hyperspecialCount(p, a, b) {
  p = BigInt(p);
  const s5 = 1n + p + p ** 2n + p ** 3n + p ** 4n + p ** 5n;
  if (!a && !b) return 1n;
  if (!b) return p ** BigInt(6 * a - 5) * s5;
  if (!a) return p ** BigInt(10 * b - 5) * s5;
  return p ** BigInt(6 * a + 10 * b - 6) * (p + 1n) * s5;
}
// Vertices of type 1 or 2 adjacent to a hyperspecial vertex: the points / lines of H(p).
export const hexagonSize = (p) => { p = BigInt(p); return (p ** 6n - 1n) / (p - 1n); };
// Primes of norm p in O, and up to the 240 units (Rehm: a spread of the quadric mod p).
export const octavianPrimeCount = (p) => 240n * (BigInt(p) ** 3n + 1n);
export const G2F2_ORDER = 12096;

// Geometry of the apartment within radius R (in units |u1| = 1): returns hyperspecial
// vertices with their (m,n) and position, midpoints, centres and chambers (as triangles).
export function apartment(R) {
  const H = [], M = [], C = [], chambers = [];
  const N = Math.ceil(R * 1.3) + 2;
  const within = (q) => Math.hypot(q[0], q[1]) <= R + 1e-9;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const cen = (a, b, c) => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  const seenM = new Set();
  for (let m = -N; m <= N; m++) for (let n = -N; n <= N; n++) {
    const v = pt(m, n);
    if (within(v)) H.push({ mn: [m, n], xy: v, pos: position([m, n]) });
    for (const tri of [[[m, n], [m + 1, n], [m, n + 1]], [[m + 1, n], [m + 1, n + 1], [m, n + 1]]]) {
      const P = tri.map(([a, b]) => pt(a, b));
      const c = cen(...P);
      if (!within(c)) continue;
      C.push({ xy: c });
      for (let i = 0; i < 3; i++) {
        const A = P[i], Bp = P[(i + 1) % 3];
        const md = mid(A, Bp);
        const key = md.map((t) => t.toFixed(4)).join(",");
        if (!seenM.has(key)) { seenM.add(key); M.push({ xy: md }); }
        chambers.push([A, md, c]);
        chambers.push([Bp, md, c]);
      }
    }
  }
  return { hyperspecial: H, midpoints: M, centres: C, chambers };
}
