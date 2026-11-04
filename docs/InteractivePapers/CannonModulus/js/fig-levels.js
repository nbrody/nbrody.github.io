// Figure 5 — Lemma 3.4 (the paper's first figure, made live): the raw cost function b_N, its
// interpolant U^0_N, the two path envelopes F_N and H_N, and the lateral level continuum C_{N,t}.
//
// Discretization (everything below is exact for this model, not an approximation of it):
//  • Q = [0,1]² carries an nx × ny grid of closed square cells q with weights ρ_q ≥ 0; the top band
//    [0,1]×[−1,0] and the bottom band [0,1]×[1,2] complete Q̂. y = 0 is the top edge, y grows downward.
//  • A path π pays ℓ_ρ(π) = Σ ρ_q over the closed cells it meets (the paper's B(q,2r_N) ∩ π ≠ ∅,
//    with closed squares for the balls). A continuous path from the top edge meets a 4-connected
//    chain of cells, so with dist(c) = least Σρ over 4-chains from the top row to c (node-weighted
//    Dijkstra, the cell's own weight included), the infimum over continuous paths ending at a point x
//    that lies in the closed cells S(x) is
//          b_N(x) = min_{c∈S(x)} (dist(c) − ρ_c) + Σ_{c∈S(x)} ρ_c.
//    The triangulation of Q is the cell grid itself, each square cut by one diagonal (alternating),
//    so the vertices are the cell corners and S(x) has 1, 2 or 4 cells there. Raw value
//    min{1, b_N}: exactly 0 on the top edge, and 1 on the bottom edge because the weights are
//    normalized so that the cheapest top-to-bottom crossing costs exactly 1 (admissibility).
//  • U^0_N is the affine interpolation of the raw vertex values (0 and 1 on the bands).
//  • For PL U on a triangulation, sublevel and superlevel sets meet each closed triangle in a convex
//    piece containing a vertex, so the envelopes are computed exactly by bottleneck Dijkstra on the
//    vertex graph and extended to the triangles in closed form:
//          F_N = max(U^0_N, f_T),  f_T = min of F_N over the vertices of T,
//          H_N = min(F_N, h_T),    h_T = max of H_N over the vertices of T.
//    (These are the continuous envelopes themselves; the affine interpolation of the vertex values
//    of F_N would not satisfy (3.3).) Hence on T, {F_N = t} = {U^0_N = t} when f_T < t and is empty
//    otherwise, and {H_N = t} = {U^0_N = t} when f_T < t ≤ h_T: every level set is a sub-collection
//    of the marching-triangle segments of U^0_N. Ties are broken by reading t as t − ε throughout
//    (a vertex with value t counts as above), so each level set is a 1-manifold.
//  • Along a segment, each of U^0_N, F_N, H_N is monotone on every piece cut out by the grid lines and
//    diagonals, so oscillations along η are exact maxima/minima over those breakpoints.
import { el, makeCanvas, labelLayer, segmented, chips, slider, controls, pointer, setTex, palette, onTheme, cssVar, rgba, mix, ramp, Heap } from './common.js';

export const NX = 36, NY = 20;

// ───────────────────────── grid ─────────────────────────

export function makeGrid(nx = NX, ny = NY) {
  const W = nx + 1, NV = W * (ny + 1), NC = nx * ny, NT = 2 * NC;
  const tv = new Int32Array(3 * NT);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = j * nx + i, v00 = j * W + i, v10 = v00 + 1, v01 = v00 + W, v11 = v01 + 1;
    const T = tv.subarray(6 * s, 6 * s + 6);
    if (((i + j) & 1) === 0) T.set([v00, v10, v11, v00, v11, v01]);   // diagonal v00–v11
    else T.set([v00, v10, v01, v10, v11, v01]);                          // diagonal v10–v01
  }
  // vertex graph = edges of the triangulation
  const nb = Array.from({ length: NV }, () => new Set());
  for (let t = 0; t < NT; t++) {
    const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2];
    nb[a].add(b); nb[b].add(a); nb[b].add(c); nb[c].add(b); nb[a].add(c); nb[c].add(a);
  }
  const start = new Int32Array(NV + 1);
  for (let v = 0; v < NV; v++) start[v + 1] = start[v] + nb[v].size;
  const adj = new Int32Array(start[NV]);
  for (let v = 0; v < NV; v++) { let k = start[v]; for (const u of nb[v]) adj[k++] = u; }
  return { nx, ny, W, NV, NC, NT, tv, start, adj };
}

export const vx = (G, v) => (v % G.W) / G.nx;
export const vy = (G, v) => Math.floor(v / G.W) / G.ny;

/** Cell distances from the top row: least Σρ over 4-connected chains, the cell's own weight included. */
export function cellDist(G, w) {
  const { nx, ny, NC } = G, dist = new Float64Array(NC).fill(Infinity), heap = new Heap(4 * NC + 8);
  for (let i = 0; i < nx; i++) { dist[i] = w[i]; heap.push(w[i], i); }
  while (heap.n) {
    const c = heap.pop(), d = heap.lastKey;
    if (d > dist[c]) continue;
    const i = c % nx, j = (c - i) / nx;
    const relax = (e) => { const nd = d + w[e]; if (nd < dist[e]) { dist[e] = nd; heap.push(nd, e); } };
    if (i > 0) relax(c - 1);
    if (i < nx - 1) relax(c + 1);
    if (j > 0) relax(c - nx);
    if (j < ny - 1) relax(c + nx);
  }
  return dist;
}

/** Cost of the cheapest top-to-bottom crossing. */
export function crossingCost(G, w) {
  const dist = cellDist(G, w);
  let m = Infinity;
  for (let i = 0; i < G.nx; i++) m = Math.min(m, dist[(G.ny - 1) * G.nx + i]);
  return m;
}

/** Scale weights so that the cheapest top-to-bottom crossing costs exactly 1. */
export function normalize(G, w) {
  const m = crossingCost(G, w);
  return Float64Array.from(w, (x) => x / m);
}

/** The raw function min{1, b_N} at the vertices (cell corners). */
export function rawValues(G, w, dist = cellDist(G, w)) {
  const { nx, ny, W, NV } = G, U = new Float64Array(NV);
  for (let v = 0; v < NV; v++) {
    const i = v % W, j = (v - i) / W;
    if (j === 0) { U[v] = 0; continue; }          // exactly zero on the top edge
    if (j === ny) { U[v] = 1; continue; }         // admissibility: every path to the bottom edge costs ≥ 1
    let lo = Infinity, sum = 0;
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
      const a = i + di, b = j + dj;
      if (a < 0 || a >= nx || b < 0 || b >= ny) continue;
      const c = b * nx + a;
      sum += w[c];
      lo = Math.min(lo, dist[c] - w[c]);
    }
    U[v] = Math.min(1, lo + sum);
  }
  return U;
}

/** F_N at the vertices: min over vertex paths to the top edge of the max of U (bottleneck Dijkstra). */
export function floodF(G, U) {
  const { NV, W, start, adj } = G, F = new Float64Array(NV).fill(Infinity), heap = new Heap(4 * NV + 8);
  for (let i = 0; i < W; i++) { F[i] = U[i]; heap.push(U[i], i); }
  while (heap.n) {
    const v = heap.pop(), d = heap.lastKey;
    if (d > F[v]) continue;
    for (let k = start[v]; k < start[v + 1]; k++) {
      const u = adj[k], c = Math.max(d, U[u]);
      if (c < F[u]) { F[u] = c; heap.push(c, u); }
    }
  }
  return F;
}

/** H_N at the vertices: max over vertex paths to the bottom edge of the min of F. */
export function drainH(G, F) {
  const { NV, W, ny, start, adj } = G, H = new Float64Array(NV).fill(-Infinity), heap = new Heap(4 * NV + 8);
  for (let i = 0; i < W; i++) { const v = ny * W + i; H[v] = F[v]; heap.push(-F[v], v); }
  while (heap.n) {
    const v = heap.pop(), d = -heap.lastKey;
    if (d < H[v]) continue;
    for (let k = start[v]; k < start[v + 1]; k++) {
      const u = adj[k], c = Math.min(d, F[u]);
      if (c > H[u]) { H[u] = c; heap.push(-c, u); }
    }
  }
  return H;
}

/** Everything the figure needs for one weight field. w is normalized here. */
export function buildModel(G, w0) {
  const w = normalize(G, w0);
  const dist = cellDist(G, w);
  const U = rawValues(G, w, dist), F = floodF(G, U), H = drainH(G, F);
  const fT = new Float64Array(G.NT), hT = new Float64Array(G.NT);
  for (let t = 0; t < G.NT; t++) {
    const a = G.tv[3 * t], b = G.tv[3 * t + 1], c = G.tv[3 * t + 2];
    fT[t] = Math.min(F[a], F[b], F[c]);
    hT[t] = Math.max(H[a], H[b], H[c]);
  }
  let crossing = Infinity;
  for (let i = 0; i < G.nx; i++) crossing = Math.min(crossing, dist[(G.ny - 1) * G.nx + i]);
  return { G, w, dist, U, F, H, fT, hT, crossing };
}

/** The vertex values of the chosen function. */
export const vals = (M, kind) => (kind === 'U' ? M.U : kind === 'F' ? M.F : M.H);

/** Exact value of U^0_N, F_N or H_N at a point (x, y) of Q̂. */
export function valueAt(M, kind, x, y) {
  if (y <= 0) return 0;
  if (y >= 1) return 1;
  const { G, U } = M, { nx, ny, W } = G;
  const X = Math.min(nx, Math.max(0, x * nx)), Y = y * ny;
  const i = Math.min(nx - 1, Math.floor(X)), j = Math.min(ny - 1, Math.floor(Y));
  const u = X - i, v = Y - j, v00 = j * W + i, v10 = v00 + 1, v01 = v00 + W, v11 = v01 + 1;
  let val, t;
  const s = j * nx + i;
  if (((i + j) & 1) === 0) {
    if (u >= v) { val = U[v00] + u * (U[v10] - U[v00]) + v * (U[v11] - U[v10]); t = 2 * s; }
    else { val = U[v00] + v * (U[v01] - U[v00]) + u * (U[v11] - U[v01]); t = 2 * s + 1; }
  } else if (u + v <= 1) { val = U[v00] + u * (U[v10] - U[v00]) + v * (U[v01] - U[v00]); t = 2 * s; }
  else { val = U[v11] + (1 - u) * (U[v01] - U[v11]) + (1 - v) * (U[v10] - U[v11]); t = 2 * s + 1; }
  if (kind === 'U') return val;
  val = Math.max(val, M.fT[t]);
  if (kind === 'F') return val;
  return Math.min(val, M.hT[t]);
}

/** Parameters in [0,1] where the segment p→q crosses a grid line or a diagonal (sorted, with 0 and 1). */
export function breakpoints(G, p, q) {
  const { nx, ny } = G, out = [0, 1];
  const X0 = p[0] * nx, Y0 = p[1] * ny, X1 = q[0] * nx, Y1 = q[1] * ny;
  const fam = (g0, g1, step, lo, hi) => {
    if (g0 === g1) return;
    const a = Math.max(lo, Math.min(g0, g1)), b = Math.min(hi, Math.max(g0, g1));
    for (let k = Math.ceil(a / step) * step; k <= b; k += step) {
      const s = (k - g0) / (g1 - g0);
      if (s > 0 && s < 1) out.push(s);
    }
  };
  fam(X0, X1, 1, 0, nx);
  fam(Y0, Y1, 1, 0, ny);
  fam(X0 - Y0, X1 - Y1, 2, -Infinity, Infinity);
  fam(X0 + Y0, X1 + Y1, 2, -Infinity, Infinity);
  return out.sort((a, b) => a - b);
}

/** Exact min and max of the chosen function along a polyline [[x,y], …]. */
export function rangeAlong(M, kind, pts) {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k], q = pts[k + 1];
    for (const s of breakpoints(M.G, p, q)) {
      const f = valueAt(M, kind, p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1]));
      if (f < lo) lo = f;
      if (f > hi) hi = f;
    }
  }
  return { lo, hi, osc: hi - lo };
}

/** The three oscillations of (3.3) along a polyline. */
export function oscTriple(M, pts) {
  return { U: rangeAlong(M, 'U', pts).osc, F: rangeAlong(M, 'F', pts).osc, H: rangeAlong(M, 'H', pts).osc };
}

// ───────────────────────── level sets ─────────────────────────

/**
 * The level set {f = t} of f ∈ {U, F, H} by marching triangles, its components (joined through shared
 * edge crossings) and which of them are lateral (meet both the left and the right edge of Q).
 */
export function levelSet(M, kind, t) {
  const { G, U, fT, hT } = M, { tv, NT, NV, W, nx } = G;
  const xs1 = [], ys1 = [], xs2 = [], ys2 = [], k1 = [], k2 = [], tri = [];
  const cross = (a, b) => {   // a below, b above
    const s = (t - U[a]) / (U[b] - U[a]);
    return [vx(G, a) + s * (vx(G, b) - vx(G, a)), vy(G, a) + s * (vy(G, b) - vy(G, a)), Math.min(a, b) * NV + Math.max(a, b)];
  };
  for (let T = 0; T < NT; T++) {
    if (kind === 'F' && !(fT[T] < t)) continue;
    if (kind === 'H' && !(fT[T] < t && hT[T] >= t)) continue;
    const v = [tv[3 * T], tv[3 * T + 1], tv[3 * T + 2]];
    const up = v.map((x) => U[x] >= t);
    if (up[0] === up[1] && up[1] === up[2]) continue;
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], ua = up[e], ub = up[(e + 1) % 3];
      if (ua !== ub) pts.push(ua ? cross(b, a) : cross(a, b));
    }
    xs1.push(pts[0][0]); ys1.push(pts[0][1]); k1.push(pts[0][2]);
    xs2.push(pts[1][0]); ys2.push(pts[1][1]); k2.push(pts[1][2]);
    tri.push(T);
  }
  const n = tri.length, parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  const link = (key, i) => {
    const o = seen.get(key);
    if (o === undefined) seen.set(key, i);
    else { const a = find(o), b = find(i); if (a !== b) parent[a] = b; }
  };
  for (let i = 0; i < n; i++) { link(k1[i], i); link(k2[i], i); }
  const side = (key) => {
    const a = Math.floor(key / NV), b = key % NV, ia = a % W, ib = b % W;
    return ia === 0 && ib === 0 ? 1 : ia === nx && ib === nx ? 2 : 0;
  };
  const touch = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const m = (touch.get(r) || 0) | side(k1[i]) | side(k2[i]);
    touch.set(r, m);
  }
  const comp = new Int32Array(n), lateral = new Uint8Array(n);
  const ids = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!ids.has(r)) ids.set(r, ids.size);
    comp[i] = ids.get(r);
    lateral[i] = touch.get(r) === 3 ? 1 : 0;
  }
  let nLateral = 0, nClosed = 0, nOther = 0;
  for (const [, m] of touch) { if (m === 3) nLateral++; else if (m === 0) nClosed++; else nOther++; }
  return { t, kind, n, x1: Float64Array.from(xs1), y1: Float64Array.from(ys1), x2: Float64Array.from(xs2), y2: Float64Array.from(ys2), tri: Int32Array.from(tri), comp, lateral, nComp: ids.size, nLateral, nClosed, nOther };
}

/** Points where the segment p→q meets the level segments (only the lateral ones if lateralOnly). */
export function meetPoints(L, p, q, lateralOnly = true, first = false) {
  const out = [], eps = 1e-9;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const bx0 = Math.min(p[0], q[0]) - 1e-9, bx1 = Math.max(p[0], q[0]) + 1e-9;
  const by0 = Math.min(p[1], q[1]) - 1e-9, by1 = Math.max(p[1], q[1]) + 1e-9;
  for (let i = 0; i < L.n; i++) {
    if (lateralOnly && !L.lateral[i]) continue;
    const cx = L.x1[i], cy = L.y1[i], ex = L.x2[i] - cx, ey = L.y2[i] - cy;
    if (Math.max(cx, cx + ex) < bx0 || Math.min(cx, cx + ex) > bx1 || Math.max(cy, cy + ey) < by0 || Math.min(cy, cy + ey) > by1) continue;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-18) continue;
    const wx = cx - p[0], wy = cy - p[1];
    const s = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
    if (s >= -eps && s <= 1 + eps && u >= -eps && u <= 1 + eps) {
      out.push([p[0] + s * dx, p[1] + s * dy, i]);
      if (first) return out;
    }
  }
  return out;
}

export function polylineMeets(L, pts, lateralOnly = true) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) out.push(...meetPoints(L, pts[k], pts[k + 1], lateralOnly));
  return out;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random segments in Q̂ whose endpoint values strictly straddle t; count how many meet the lateral
 * part of {f = t}. Returns the misses too (a straddling segment that misses: inside an island).
 */
export function batchCheck(M, kind, t, L, count = 500, seed = 7) {
  const rnd = mulberry32(seed);
  let tried = 0, met = 0, n = 0;
  const misses = [];
  while (n < count && tried < 60 * count) {
    tried++;
    const a = [rnd(), -0.05 + 1.1 * rnd()];
    const ang = 2 * Math.PI * rnd(), len = 0.03 + 0.45 * rnd() * rnd();
    const b = [Math.min(1, Math.max(0, a[0] + len * Math.cos(ang))), Math.min(1.05, Math.max(-0.05, a[1] + len * Math.sin(ang) * (M.G.nx / M.G.ny)))];
    const fa = valueAt(M, kind, a[0], a[1]), fb = valueAt(M, kind, b[0], b[1]);
    if (!((fa < t && fb > t) || (fa > t && fb < t))) continue;
    n++;
    if (meetPoints(L, a, b, true, true).length) met++;
    else misses.push([a, b]);
  }
  return { n, met, misses, tried };
}

/** The non-lateral components of a level set (islands), largest first: bbox and size in cells. */
export function islands(M, L) {
  const by = new Map();
  for (let i = 0; i < L.n; i++) {
    if (L.lateral[i]) continue;
    let b = by.get(L.comp[i]);
    if (!b) by.set(L.comp[i], (b = { comp: L.comp[i], x0: 1, x1: 0, y0: 1, y1: 0, n: 0 }));
    b.x0 = Math.min(b.x0, L.x1[i], L.x2[i]); b.x1 = Math.max(b.x1, L.x1[i], L.x2[i]);
    b.y0 = Math.min(b.y0, L.y1[i], L.y2[i]); b.y1 = Math.max(b.y1, L.y1[i], L.y2[i]);
    b.n++;
  }
  const out = [...by.values()];
  for (const b of out) b.size = Math.hypot((b.x1 - b.x0) * M.G.nx, (b.y1 - b.y0) * M.G.ny);
  return out.sort((a, b) => b.size - a.size);
}

/**
 * A path [inside, middle, outside] from deep inside the largest island of {f = t} to a point on the
 * other side of t: its endpoint values strictly straddle t, yet it misses the lateral part. null if
 * the level has no island such a path can be built for.
 */
export function islandPath(M, kind, t, L) {
  const { nx, ny } = M.G, f = (p) => valueAt(M, kind, p[0], p[1]);
  for (const b of islands(M, L).slice(0, 4)) {
    let best = null, bs = -Infinity;
    const r = b.size / 2;
    for (let a = 0; a <= 4; a++) for (let c = 0; c <= 4; c++) {
      const pin = [b.x0 + ((b.x1 - b.x0) * a) / 4, b.y0 + ((b.y1 - b.y0) * c) / 4], fin = f(pin);
      if (fin === t) continue;
      for (let k = 0; k < 16; k++) {
        const th = (2 * Math.PI * k) / 16;
        for (const d of [r + 2.2, r + 3.2, r + 4.5]) {
          const pout = [pin[0] + (d * Math.cos(th)) / nx, pin[1] + (d * Math.sin(th)) / ny];
          if (pout[0] < 0.03 || pout[0] > 0.97 || pout[1] < 0.04 || pout[1] > 0.96) continue;
          const fout = f(pout);
          if (!((fin < t && fout > t) || (fin > t && fout < t))) continue;
          if (meetPoints(L, pin, pout, true, true).length) continue;
          const sc = Math.abs(fin - t) + Math.abs(fout - t) - 0.015 * d;
          if (sc > bs) { bs = sc; best = [pin, pout]; }
        }
      }
    }
    if (best) {
      const [p, q] = best;
      return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], q];
    }
  }
  return null;
}

/**
 * A strict-side extension: a polyline from p to the outer edge of the top band inside {f < t}
 * (side −1) or to the outer edge of the bottom band inside {f > t} (side +1). null if there is none.
 * Shortest in the drawn metric (square cells) on the vertex graph, then straightened; every piece
 * is checked exactly, so the extension never meets the level.
 */
export function extension(M, kind, t, p, side) {
  const { G } = M, { nx, ny, W, NV, start, adj } = G, f = vals(M, kind);
  const ok = side < 0 ? (z) => z < t : (z) => z > t;
  const fp = valueAt(M, kind, p[0], p[1]);
  if (!ok(fp)) return null;
  const bandY = side < 0 ? -1 : 2;
  if ((side < 0 && p[1] <= 0) || (side > 0 && p[1] >= 1)) return [p, [p[0], bandY]];
  const allowed = (v) => ok(f[v]);
  const X = (v) => (v % W), Y = (v) => Math.floor(v / W);
  const dist = new Float64Array(NV).fill(Infinity), prev = new Int32Array(NV).fill(-1), heap = new Heap(4 * NV + 8);
  // sources: the vertices of the triangle containing p that lie on the strict side
  const px = Math.min(nx, Math.max(0, p[0] * nx)), py = Math.min(ny, Math.max(0, p[1] * ny));
  const i = Math.min(nx - 1, Math.floor(px)), j = Math.min(ny - 1, Math.floor(py));
  const cand = [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1];
  for (const v of cand) {
    if (!allowed(v)) continue;
    if (!segmentOnSide(M, kind, t, p, [vx(G, v), vy(G, v)], side)) continue;
    const d = Math.hypot(X(v) - px, Y(v) - py);
    if (d < dist[v]) { dist[v] = d; heap.push(d, v); }
  }
  const targetRow = side < 0 ? 0 : ny;
  let end = -1;
  while (heap.n) {
    const v = heap.pop(), d = heap.lastKey;
    if (d > dist[v]) continue;
    if (Y(v) === targetRow) { end = v; break; }
    for (let k = start[v]; k < start[v + 1]; k++) {
      const u = adj[k];
      if (!allowed(u)) continue;
      const nd = d + Math.hypot(X(u) - X(v), Y(u) - Y(v));
      if (nd < dist[u]) { dist[u] = nd; prev[u] = v; heap.push(nd, u); }
    }
  }
  if (end < 0) return null;
  const chain = [];
  for (let v = end; v !== -1; v = prev[v]) chain.push([vx(G, v), vy(G, v)]);
  chain.reverse();
  const raw = [p, ...chain, [vx(G, end), bandY]];
  // straighten greedily, keeping every piece on the strict side
  const out = [raw[0]];
  let a = 0;
  while (a < raw.length - 1) {
    let b = raw.length - 1;
    while (b > a + 1 && !segmentOnSide(M, kind, t, raw[a], raw[b], side)) b--;
    out.push(raw[b]);
    a = b;
  }
  return out;
}

/** Does the segment p→q stay strictly below t (side −1) or strictly above t (side +1)? Exact. */
export function segmentOnSide(M, kind, t, p, q, side) {
  const r = rangeAlong(M, kind, [p, q]);
  return side < 0 ? r.hi < t : r.lo > t;
}

// ───────────────────────── weights (presets) ─────────────────────────

const LAKES = [[7.5, 7.5, 3.1], [17.5, 12.5, 3.6], [28, 6.5, 2.7]];

/**
 * Dual weights (Lemma 3.3 on this board): the least-norm point P of the convex hull of incidence
 * vectors of left-to-right crossings, by pairwise Frank–Wolfe with a shortest-chain oracle. The
 * left–right crossings are 8-connected chains that avoid three lakes (cells no left–right crossing
 * may use); every top-to-bottom 4-chain shares a cell with each of them, so ρ = P is admissible for
 * top-to-bottom crossings (Lemma 3.3), with weight 0 in the lakes.
 */
export function dualWeights(G, { lakes = LAKES, maxIter = 4000, gap = 2e-3 } = {}) {
  const { nx, ny, NC } = G;
  const hole = new Uint8Array(NC);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    for (const [cx, cy, r] of lakes) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r) hole[j * nx + i] = 1;
  }
  const heap = new Heap(8 * NC + 8), dist = new Float64Array(NC), prev = new Int32Array(NC);
  const chain = (w) => {
    dist.fill(Infinity); prev.fill(-1); heap.clear();
    for (let j = 0; j < ny; j++) { const c = j * nx; if (!hole[c]) { dist[c] = w[c]; heap.push(w[c], c); } }
    while (heap.n) {
      const c = heap.pop(), d = heap.lastKey;
      if (d > dist[c]) continue;
      const i = c % nx, j = (c - i) / nx;
      if (i === nx - 1) { const cells = []; for (let v = c; v !== -1; v = prev[v]) cells.push(v); return { len: d, cells }; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || a >= nx || b < 0 || b >= ny) continue;
        const e = b * nx + a;
        if (hole[e]) continue;
        const nd = d + w[e];
        if (nd < dist[e]) { dist[e] = nd; prev[e] = c; heap.push(nd, e); }
      }
    }
    return null;
  };
  const P = new Float64Array(NC);
  const atoms = new Map();
  const keyOf = (cells) => cells.slice().sort((a, b) => a - b).join(',');
  const first = chain(new Float64Array(NC).fill(1));
  for (const c of first.cells) P[c] = 1;
  atoms.set(keyOf(first.cells), { cells: first.cells, lam: 1, k: keyOf(first.cells) });
  const stamp = new Int32Array(NC);
  let tick = 0, iter = 0, lower = 0, upper = Infinity;
  for (; iter < maxIter; iter++) {
    const s = chain(P);
    let n2 = 0; for (let c = 0; c < NC; c++) n2 += P[c] * P[c];
    lower = 1 / n2; upper = n2 / (s.len * s.len);
    if ((upper - lower) / lower < gap) break;
    let away = null, gA = -Infinity;
    for (const a of atoms.values()) { let g = 0; for (const c of a.cells) g += P[c]; if (g > gA) { gA = g; away = a; } }
    if (gA - s.len <= 1e-12 * Math.max(1, gA)) break;
    tick++;
    for (const c of s.cells) stamp[c] = tick;
    let inter = 0; for (const c of away.cells) if (stamp[c] === tick) inter++;
    const d2 = s.cells.length + away.cells.length - 2 * inter;
    if (d2 <= 0) break;
    const gamma = Math.min(away.lam, (gA - s.len) / d2);
    for (const c of s.cells) P[c] += gamma;
    for (const c of away.cells) P[c] -= gamma;
    const k = keyOf(s.cells), a = atoms.get(k);
    if (a) a.lam += gamma; else atoms.set(k, { cells: s.cells, lam: gamma, k });
    away.lam -= gamma;
    if (away.lam <= 1e-14) atoms.delete(away.k);
  }
  for (let c = 0; c < NC; c++) if (P[c] < 0) P[c] = 0;
  return { w: P, hole, iter, lower, upper };
}

/**
 * Rough weights: mild log-normal noise plus a few heavy boulders and walled pockets (a cheap
 * interior inside a heavy ring) at random places. Boulders make peaks of U^0_N, pockets make pits,
 * so its levels have islands.
 */
export function roughWeights(G, seed = 3, K = 9) {
  const { nx, ny, NC } = G, rnd = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const w = Float64Array.from({ length: NC }, () => Math.exp(0.3 * gauss()));
  for (let k = 0; k < K; k++) {
    const cx = 2 + rnd() * (nx - 4), cy = 2 + rnd() * (ny - 5), pocket = rnd() < 0.45;
    const r = pocket ? 2.2 + rnd() * 0.9 : 1.3 + rnd() * 1.1, heavy = 3.5 + 3 * rnd();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy), c = j * nx + i;
      if (pocket) { if (d <= r && d > r - 1.05) w[c] *= heavy; else if (d <= r - 1.05) w[c] *= 0.15; }
      else if (d <= r) w[c] *= heavy;
    }
  }
  return w;
}

/** A cheap meandering channel from the top edge most of the way down. */
export function channelWeights(G) {
  const { nx, ny, NC } = G, w = new Float64Array(NC).fill(1);
  const depth = Math.round(ny * 0.8);
  for (let j = 0; j < depth; j++) {
    const xc = nx * (0.5 + 0.17 * Math.sin((j / ny) * 2.4 * Math.PI + 0.4));
    for (let i = 0; i < nx; i++) if (Math.abs(i + 0.5 - xc) <= 2.1) w[j * nx + i] = 0.25;
  }
  return w;
}

export const PRESETS = ['dual', 'rough', 'channel'];

export function presetWeights(G, name) {
  if (name === 'rough') return roughWeights(G);
  if (name === 'channel') return channelWeights(G);
  return dualWeights(G, { gap: 1e-2 }).w;
}

// ───────────────────────── figure ─────────────────────────

const SYM = { U: 'U^0_N', F: 'F_N', H: 'H_N' };
const ETA0 = [[0.74, 0.30], [0.65, 0.43], [0.60, 0.62]];

export function mount(root) {
  const G = makeGrid();
  const models = new Map();
  const model = (name) => {
    if (!models.has(name)) models.set(name, buildModel(G, presetWeights(G, name)));
    return models.get(name);
  };
  const st = { preset: 'dual', view: 'H', t: 0.5, showW: false, eta: ETA0.map((p) => p.slice()), drag: -1, hover: -1 };
  let M = model(st.preset), Lset = null, batch = null, contours = null, contourKey = '', E = null;
  let field = null, fieldKey = '';

  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  // layout: Q drawn with square cells, the two bands as strips above and below
  function layout(w) {
    const pad = 10, Qw = Math.max(40, w - 2 * pad), cell = Qw / G.nx, Qh = cell * G.ny;
    const band = Math.round(Math.min(46, Math.max(30, cell * 2.6)));
    const yQ0 = pad + band, yQ1 = yQ0 + Qh;
    return { pad, x0: pad, x1: pad + Qw, Qw, Qh, cell, band, yT: pad, yQ0, yQ1, yB: yQ1 + band, h: Math.ceil(yQ1 + band + pad) };
  }
  const PX = (Lo, x) => Lo.x0 + x * Lo.Qw;
  const PY = (Lo, y) => (y < 0 ? Lo.yQ0 + y * Lo.band : y > 1 ? Lo.yQ1 + (y - 1) * Lo.band : Lo.yQ0 + y * Lo.Qh);
  const MX = (Lo, px) => Math.min(1, Math.max(0, (px - Lo.x0) / Lo.Qw));
  const MY = (Lo, py) => Math.min(2, Math.max(-1, py < Lo.yQ0 ? (py - Lo.yQ0) / Lo.band : py > Lo.yQ1 ? 1 + (py - Lo.yQ1) / Lo.band : (py - Lo.yQ0) / Lo.Qh));

  const cv = makeCanvas(left, { aspect: (w) => layout(w).h / w, maxHeight: 2000, draw });
  const labels = labelLayer(cv.wrap);
  const hint = el('div', { class: 'hint' });
  left.append(hint);
  setTex(hint, 'Drag the three handles of $\\eta$. Dashed: its strict-side extensions to the bands. Filled dots: where $\\eta$ meets the lateral part of the level; open dots: where it meets an island.');

  // ── controls
  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const viewSeg = segmented(ctl, [['U', '$U^0_N$'], ['F', '$F_N$'], ['H', '$H_N$']], st.view, (k) => { st.view = k; update(); });
  const tSlider = slider(ctl, { label: 'level $t$', min: 0.02, max: 0.98, step: 0.005, value: st.t, fmt: (v) => v.toFixed(3), oninput: (v) => { st.t = v; update(); } });
  chips(ctl, {
    label: 'Weights $\\rho_q$',
    options: [['dual', 'Dual weights'], ['rough', 'Rough weights'], ['channel', 'A cheap channel']],
    value: st.preset,
    onchange: (k) => setPreset(k),
  });
  const btns = el('div', { class: 'btn-row' });
  ctl.append(btns);
  const wBtn = el('button', { type: 'button', class: 'chip' });
  setTex(wBtn, 'show $\\rho_q$');
  wBtn.addEventListener('click', () => { st.showW = !st.showW; wBtn.classList.toggle('on', st.showW); wBtn.setAttribute('aria-pressed', st.showW); cv.redraw(); });
  const islandBtn = el('button', { type: 'button', class: 'chip' });
  setTex(islandBtn, '$\\eta$ into an island');
  islandBtn.addEventListener('click', () => { if (intoIsland()) updateEta(); });
  btns.append(wBtn, islandBtn);
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);

  function setPreset(k) {
    st.preset = k;
    M = model(k);
    if (k === 'rough') {
      // the case the envelopes exist for: a level of U^0_N with islands, and η inside one
      st.view = 'U'; viewSeg.set('U');
      st.t = 0.6; tSlider.set(st.t);
      update(false);
      if (!intoIsland()) st.eta = ETA0.map((p) => p.slice());
      updateEta();
      return;
    }
    if (k === 'channel') st.eta = [[0.62, 0.30], [0.74, 0.40], [0.86, 0.30]];
    else st.eta = ETA0.map((p) => p.slice());
    update();
  }

  /** Move η from deep inside the largest island of the current level set to the other side of t. */
  function intoIsland() {
    let path = islandPath(M, st.view, st.t, Lset);
    if (!path && batch && batch.misses.length) {
      const len = ([a, b]) => Math.hypot((a[0] - b[0]) * G.nx, (a[1] - b[1]) * G.ny);
      const [a, b] = batch.misses.reduce((p, q) => (len(q) > len(p) ? q : p));
      path = [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
    }
    if (!path) return false;
    st.eta = path.map((p) => p.slice());
    return true;
  }

  // ── derived data
  function update(withEta = true) {
    Lset = levelSet(M, st.view, st.t);
    batch = batchCheck(M, st.view, st.t, Lset, 500);
    const ck = st.preset + st.view;
    if (ck !== contourKey) {
      contourKey = ck;
      contours = [];
      for (let k = 1; k < 10; k++) contours.push(levelSet(M, st.view, k / 10));
    }
    const hasIsland = Lset.nComp > Lset.nLateral || batch.misses.length > 0;
    islandBtn.disabled = !hasIsland;
    islandBtn.style.opacity = hasIsland ? '' : '0.45';
    if (withEta) updateEta();
  }

  function updateEta() {
    const pts = st.eta, f = (p) => valueAt(M, st.view, p[0], p[1]);
    const fa = f(pts[0]), fb = f(pts[pts.length - 1]), t = st.t;
    const straddle = (fa < t && fb > t) || (fa > t && fb < t);
    const lowEnd = fa < fb ? pts[0] : pts[pts.length - 1], highEnd = fa < fb ? pts[pts.length - 1] : pts[0];
    E = {
      fa, fb, straddle,
      osc: oscTriple(M, pts),
      lat: polylineMeets(Lset, pts, true),
      any: polylineMeets(Lset, pts, false),
      extLo: straddle ? extension(M, st.view, t, lowEnd, -1) : null,
      extHi: straddle ? extension(M, st.view, t, highEnd, +1) : null,
    };
    cv.redraw();
    queueReadout();
  }

  // typeset the readout at most once a frame while dragging
  let roQueued = false;
  function queueReadout() {
    if (roQueued) return;
    roQueued = true;
    const run = () => { if (!roQueued) return; roQueued = false; readout(); };
    requestAnimationFrame(run);
    setTimeout(run, 120);
  }

  // ── drawing
  function colours(P) {
    const a = P.dark ? 0.06 : 0.035, b = P.dark ? 0.42 : 0.34;
    return { lo: mix(P.bg, P.u, a), hi: mix(P.bg, P.u, b) };
  }

  function renderField(Lo, P) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = [st.preset, st.view, st.showW, Lo.Qw, Lo.Qh, dpr, P.bg, P.u, P.mu].join('|');
    if (key === fieldKey && field) return field;
    fieldKey = key;
    const W = Math.max(1, Math.round(Lo.Qw * dpr)), H = Math.max(1, Math.round(Lo.Qh * dpr));
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const g = off.getContext('2d');
    if (st.showW) {
      let mx = 0; for (const x of M.w) mx = Math.max(mx, x);
      for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
        const a = M.w[j * G.nx + i] / mx;
        g.fillStyle = mix(P.bg, P.mu, (P.dark ? 0.05 : 0.03) + (P.dark ? 0.5 : 0.42) * a);
        const x0 = Math.round((i / G.nx) * W), x1 = Math.round(((i + 1) / G.nx) * W);
        const y0 = Math.round((j / G.ny) * H), y1 = Math.round(((j + 1) / G.ny) * H);
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    } else {
      const { lo, hi } = colours(P);
      const lut = new Uint8ClampedArray(3 * 256);
      for (let k = 0; k < 256; k++) {
        const c = ramp([lo, hi], k / 255).match(/\d+/g).map(Number);
        lut.set(c, 3 * k);
      }
      const img = g.createImageData(W, H), d = img.data;
      for (let py = 0; py < H; py++) {
        const y = (py + 0.5) / H;
        for (let px = 0; px < W; px++) {
          const v = valueAt(M, st.view, (px + 0.5) / W, y);
          const k = 3 * Math.max(0, Math.min(255, Math.round(v * 255))), o = 4 * (py * W + px);
          d[o] = lut[k]; d[o + 1] = lut[k + 1]; d[o + 2] = lut[k + 2]; d[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }
    field = off;
    return off;
  }

  // a model-space polyline, bent where it crosses the band boundaries (they are drawn at another scale)
  function tracePath(ctx, Lo, pts) {
    ctx.moveTo(PX(Lo, pts[0][0]), PY(Lo, pts[0][1]));
    for (let k = 0; k + 1 < pts.length; k++) {
      const [p, q] = [pts[k], pts[k + 1]];
      const cuts = [];
      for (const yb of [0, 1]) if ((p[1] - yb) * (q[1] - yb) < 0) cuts.push((yb - p[1]) / (q[1] - p[1]));
      cuts.sort((a, b) => a - b);
      for (const s of cuts) ctx.lineTo(PX(Lo, p[0] + s * (q[0] - p[0])), PY(Lo, p[1] + s * (q[1] - p[1])));
      ctx.lineTo(PX(Lo, q[0]), PY(Lo, q[1]));
    }
  }

  function strokeLevel(ctx, Lo, L, sel) {
    ctx.beginPath();
    for (let i = 0; i < L.n; i++) {
      if (!sel(i)) continue;
      ctx.moveTo(PX(Lo, L.x1[i]), PY(Lo, L.y1[i]));
      ctx.lineTo(PX(Lo, L.x2[i]), PY(Lo, L.y2[i]));
    }
    ctx.stroke();
  }

  function draw(ctx, w) {
    const P = palette(), Lo = layout(w), { lo, hi } = colours(P), sym = SYM[st.view];
    // bands
    ctx.fillStyle = lo; ctx.fillRect(Lo.x0, Lo.yT, Lo.Qw, Lo.band);
    ctx.fillStyle = hi; ctx.fillRect(Lo.x0, Lo.yQ1, Lo.Qw, Lo.band);
    // the chosen function (or the weights) on Q
    ctx.drawImage(renderField(Lo, P), Lo.x0, Lo.yQ0, Lo.Qw, Lo.Qh);
    if (st.showW) {
      ctx.strokeStyle = rgba(P.mesh, 0.22); ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let i = 1; i < G.nx; i++) { const x = Math.round(PX(Lo, i / G.nx)) + 0.5; ctx.moveTo(x, Lo.yQ0); ctx.lineTo(x, Lo.yQ1); }
      for (let j = 1; j < G.ny; j++) { const y = Math.round(PY(Lo, j / G.ny)) + 0.5; ctx.moveTo(Lo.x0, y); ctx.lineTo(Lo.x1, y); }
      ctx.stroke();
    }
    // faint contours at tenths
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(P.u, P.dark ? 0.2 : 0.16); ctx.lineWidth = 0.8;
    for (const C of contours) strokeLevel(ctx, Lo, C, () => true);
    // frame: Q̂ and the band boundaries
    ctx.strokeStyle = rgba(P.mesh, 0.75); ctx.lineWidth = 1;
    ctx.strokeRect(Lo.x0 + 0.5, Lo.yT + 0.5, Lo.Qw - 1, Lo.yB - Lo.yT - 1);
    ctx.beginPath();
    ctx.moveTo(Lo.x0, Math.round(Lo.yQ0) + 0.5); ctx.lineTo(Lo.x1, Math.round(Lo.yQ0) + 0.5);
    ctx.moveTo(Lo.x0, Math.round(Lo.yQ1) + 0.5); ctx.lineTo(Lo.x1, Math.round(Lo.yQ1) + 0.5);
    ctx.stroke();

    // the level set at t: islands thin, the lateral part thick
    ctx.strokeStyle = P.u;
    ctx.lineWidth = 1.5;
    strokeLevel(ctx, Lo, Lset, (i) => !Lset.lateral[i]);
    ctx.lineWidth = 3.2;
    strokeLevel(ctx, Lo, Lset, (i) => Lset.lateral[i]);

    // η, its strict-side extensions, and where it meets the level
    ctx.strokeStyle = P.w;
    ctx.setLineDash([6, 5]); ctx.lineWidth = 1.8;
    for (const X of [E.extLo, E.extHi]) if (X) { ctx.beginPath(); tracePath(ctx, Lo, X); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.lineWidth = 2.6;
    ctx.beginPath(); tracePath(ctx, Lo, st.eta); ctx.stroke();
    const latSet = new Set(E.lat.map((m) => m[2]));
    for (const m of E.any) {
      const x = PX(Lo, m[0]), y = PY(Lo, m[1]), onC = latSet.has(m[2]);
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 2 * Math.PI);
      ctx.fillStyle = onC ? P.u : P.surface; ctx.fill();
      ctx.lineWidth = onC ? 1.6 : 1.8; ctx.strokeStyle = onC ? P.surface : P.u; ctx.stroke();
    }
    st.eta.forEach((p, k) => {
      const x = PX(Lo, p[0]), y = PY(Lo, p[1]), r = k === st.drag || k === st.hover ? 7.5 : 6.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = P.w; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = P.surface; ctx.stroke();
    });

    // labels
    const L = [];
    const small = w < 520;
    L.push({ id: 'tb', x: Lo.x0 + 10, y: Lo.yT + Lo.band / 2, tex: `\\text{top band: }${sym}=0`, anchor: 'e', cls: small ? 'small' : '' });
    L.push({ id: 'bb', x: Lo.x0 + 10, y: Lo.yQ1 + Lo.band / 2, tex: `\\text{bottom band: }${sym}=1`, anchor: 'e', cls: small ? 'small' : '' });
    L.push({ id: 'Q', x: Lo.x1 - 8, y: Lo.yQ0 + 8, tex: '\\cQ', anchor: 'sw', cls: 'small' });
    // name the lateral part where its label box is clear of the level set and of η
    const etaPx = [];
    for (let k = 0; k + 1 < st.eta.length; k++) {
      const a = st.eta[k], b = st.eta[k + 1];
      for (let s = 0; s <= 1; s += 0.05) etaPx.push([PX(Lo, a[0] + s * (b[0] - a[0])), PY(Lo, a[1] + s * (b[1] - a[1]))]);
    }
    const lvPx = [];
    for (let i = 0; i < Lset.n; i++) lvPx.push([PX(Lo, Lset.x1[i]), PY(Lo, Lset.y1[i])], [PX(Lo, Lset.x2[i]), PY(Lo, Lset.y2[i])]);
    const end = (p, q, v, id) => {   // label the end p on the side away from its neighbour q
      const rel = v < st.t ? '\\lt ' : v > st.t ? '\\gt ' : '=';
      const x = PX(Lo, p[0]), y = PY(Lo, p[1]);
      let right = x >= PX(Lo, q[0]);
      if (right && x > Lo.x1 - 80) right = false;
      if (!right && x < Lo.x0 + 80) right = true;
      L.push({ id, x: x + (right ? 11 : -11), y, tex: `${sym}${rel}t`, anchor: right ? 'e' : 'w', cls: 'halo' + (small ? ' small' : '') });
      for (let k = 0; k <= 4; k++) etaPx.push([x + (right ? 1 : -1) * (14 + 12 * k), y]);   // keep other labels off it
    };
    end(st.eta[0], st.eta[1], E.fa, 'e0');
    end(st.eta[st.eta.length - 1], st.eta[st.eta.length - 2], E.fb, 'e1');
    const lw = st.view === 'H' ? (small ? 96 : 116) : (small ? 52 : 64), lh = small ? 14 : 18;
    let best = null, bd = -Infinity;
    for (let i = 0; i < Lset.n; i += 1) {
      if (!Lset.lateral[i]) continue;
      const x = PX(Lo, (Lset.x1[i] + Lset.x2[i]) / 2), y = PY(Lo, (Lset.y1[i] + Lset.y2[i]) / 2);
      for (const dir of [-1, 1]) {
        const bx0 = x - lw / 2 - 3, bx1 = x + lw / 2 + 3;
        const by0 = dir < 0 ? y - 9 - lh - 3 : y + 6, by1 = dir < 0 ? y - 6 : y + 9 + lh + 3;
        if (bx0 < Lo.x0 + 4 || bx1 > Lo.x1 - 4 || by0 < Lo.yQ0 + 2 || by1 > Lo.yQ1 - 2) continue;
        const inside = (q) => q[0] > bx0 && q[0] < bx1 && q[1] > by0 && q[1] < by1;
        if (lvPx.some(inside) || etaPx.some(inside)) continue;
        let d = Infinity;
        for (const q of etaPx) d = Math.min(d, Math.hypot(q[0] - x, q[1] - y));
        const score = Math.min(d, 160) - (dir > 0 ? 8 : 0);
        if (score > bd) { bd = score; best = [x, y, dir]; }
      }
    }
    if (best) {
      const tex = st.view === 'H' ? 'C_{N,t}\\subset\\{H_N=t\\}' : `\\{${sym}=t\\}`;
      L.push({ id: 'C', x: best[0], y: best[1] + (best[2] < 0 ? -9 : 9), tex, anchor: best[2] < 0 ? 'n' : 's', cls: 'halo' + (small ? ' small' : ''), color: P.u });
    }
    // an island, if the level has one: named on the side away from η
    const isl = islands(M, Lset)[0];
    if (isl) {
      const xr = PX(Lo, isl.x1), xl = PX(Lo, isl.x0), yc = PY(Lo, (isl.y0 + isl.y1) / 2), yb = PY(Lo, isl.y1);
      const cands = [
        { x: xr + 5, y: yc, anchor: 'e', cx: xr + 25, cy: yc },
        { x: xl - 5, y: yc, anchor: 'w', cx: xl - 25, cy: yc },
        { x: (xl + xr) / 2, y: yb + 4, anchor: 's', cx: (xl + xr) / 2, cy: yb + 10 },
      ].filter((c) => c.cx > Lo.x0 + 25 && c.cx < Lo.x1 - 25 && c.cy < Lo.yQ1 - 8);
      let pick = null, pd = -1;
      for (const c of cands) {
        let d = Infinity;
        for (const q of etaPx) d = Math.min(d, Math.hypot(q[0] - c.cx, q[1] - c.cy));
        if (d > pd) { pd = d; pick = c; }
      }
      if (pick) L.push({ id: 'isl', x: pick.x, y: pick.y, html: 'island', anchor: pick.anchor, cls: 'small halo' });
    }
    // η named beside its middle handle, off the path
    const m = st.eta[1], a0 = st.eta[0], a2 = st.eta[2];
    let dx = PX(Lo, a2[0]) - PX(Lo, a0[0]), dy = PY(Lo, a2[1]) - PY(Lo, a0[1]);
    const dn = Math.hypot(dx, dy) || 1;
    let nx = -dy / dn, ny = dx / dn;
    if (ny > 0 || (Math.abs(ny) < 0.3 && nx < 0)) { nx = -nx; ny = -ny; }
    L.push({ id: 'eta', x: PX(Lo, m[0]) + 15 * nx, y: PY(Lo, m[1]) + 15 * ny, tex: '\\eta', anchor: 'c', cls: 'halo', color: P.w });
    labels.set(L);
  }

  // ── readout
  function readout() {
    const sym = SYM[st.view], t = st.t, f3 = (v) => v.toFixed(3);
    const mark = (b) => (b ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    const o = E.osc, ok33 = o.H <= o.F + 1e-12 && o.F <= o.U + 1e-12;
    const Cname = st.view === 'H' ? '$C_{N,t}$' : `the lateral part of $\\{${sym}=t\\}$`;
    let meet;
    if (!E.straddle) meet = `<span class="dim">$\\eta$ does not straddle $t$: nothing to check.</span>`;
    else if (E.lat.length) meet = `$\\eta$ straddles $t$ and meets ${Cname} ${mark(true)}`;
    else meet = `$\\eta$ straddles $t$ but misses ${Cname} ${mark(false)} <span class="dim">— it ends in an island, which continuity allows; this is what $F_N,H_N$ remove.</span>`;
    let ext = '';
    if (E.straddle) {
      const miss = [];
      if (!E.extLo) miss.push(`the low end cannot reach the top band inside $\\{${sym}\\lt t\\}$`);
      if (!E.extHi) miss.push(`the high end cannot reach the bottom band inside $\\{${sym}\\gt t\\}$`);
      ext = miss.length
        ? `<tr><td colspan="2" class="dim">No strict-side extension: ${miss.join('; ')}.</td></tr>`
        : `<tr><td colspan="2">strict-side extensions reach both bands ${mark(true)}</td></tr>`;
    }
    const allMet = batch.met === batch.n;
    const batchRow = allMet
      ? `${batch.n} random straddling segments all meet ${Cname} ${mark(true)}`
      : `${batch.met} of ${batch.n} random straddling segments meet ${Cname} ${mark(false)} <span class="dim">— ${batch.n - batch.met} end in islands: the reason for the envelopes, not a failure of Lemma 3.4.</span>`;
    const isl = Lset.nComp - Lset.nLateral;
    let pits = 0, peaks = 0;
    for (let v = 0; v < G.NV; v++) { if (M.F[v] > M.U[v]) pits++; if (M.H[v] < M.F[v]) peaks++; }
    setTex(ro, `<table>
      <tr><td>$\\eta$: ${'$' + sym + '$'} at the ends</td><td class="num">${f3(E.fa)}, ${f3(E.fb)}</td></tr>
      <tr><td colspan="2">${meet}</td></tr>
      ${ext}
      <tr class="sep"><td>$\\osc_\\eta H_N$</td><td class="num">${f3(o.H)}</td></tr>
      <tr><td>$\\osc_\\eta F_N$</td><td class="num">${f3(o.F)}</td></tr>
      <tr><td>$\\osc_\\eta U^0_N$</td><td class="num">${f3(o.U)}</td></tr>
      <tr><td colspan="2">(3.3) along $\\eta$ ${mark(ok33)}</td></tr>
      <tr class="sep"><td colspan="2">${batchRow}</td></tr>
      <tr class="sep"><td colspan="2" class="dim">$\\{${sym}=t\\}$: ${Lset.nLateral} lateral ${Lset.nLateral === 1 ? 'arc' : 'arcs'}, ${isl ? isl + (isl === 1 ? ' island' : ' islands') : 'no islands'}. $F_N$ fills pits of $U^0_N$ at ${pits} ${pits === 1 ? 'vertex' : 'vertices'}; $H_N$ cuts peaks of $F_N$ at ${peaks}. Cheapest top-to-bottom crossing: $${M.crossing.toFixed(3)}$.</td></tr>
    </table>`);
  }

  // ── handles
  function nearest(x, y) {
    const Lo = layout(cv.w);
    let k = -1, bd = 16 * 16;
    st.eta.forEach((p, i) => {
      const d = (PX(Lo, p[0]) - x) ** 2 + (PY(Lo, p[1]) - y) ** 2;
      if (d < bd) { bd = d; k = i; }
    });
    return k;
  }
  pointer(cv.wrap, {
    down(x, y) { const k = nearest(x, y); if (k < 0) return false; st.drag = k; cv.redraw(); return true; },
    move(x, y) {
      const Lo = layout(cv.w);
      st.eta[st.drag] = [MX(Lo, x), MY(Lo, y)];
      updateEta();
    },
    up() { st.drag = -1; cv.redraw(); },
    hover(x, y) {
      const k = nearest(x, y);
      cv.wrap.style.cursor = k >= 0 ? 'grab' : '';
      if (k !== st.hover) { st.hover = k; cv.redraw(); }
    },
    leave() { if (st.hover >= 0) { st.hover = -1; cv.redraw(); } },
  });

  onTheme(() => { fieldKey = ''; cv.redraw(); });
  update();
}
