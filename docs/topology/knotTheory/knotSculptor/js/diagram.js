// Knot diagrams from 3D polylines.
//
// A link is an array of closed polylines (Float64Array of x,y,z triples; the last point joins the first).
// projectDiagram projects it orthogonally along a direction `dir` that points from the knot TOWARD the
// viewer, finds every crossing with its over/under information and sign, and returns a combinatorial
// diagram (signed Gauss code). From a Gauss code we build PD codes, Seifert circles and simplifications.
//
// Sign convention: a crossing is positive when (d_over × d_under) · w > 0, w the unit vector toward the
// viewer (right-handed crossing; the right-handed trefoil has writhe +3).
// PD convention (KnotTheory`): X[i,j,k,l] starts at the incoming under edge i and goes counterclockwise.

const EPS = 1e-12;

export function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Orthonormal (u, v, w): w = dir (toward viewer), v ≈ up, u = v × w (so u × v = w and u points right).
export function basisFromDir(dir, up = null) {
  const w = normalize(dir);
  let upv = up || (Math.abs(w[1]) < 0.95 ? [0, 1, 0] : [0, 0, -1]);
  let d = dot3(upv, w);
  let v = [upv[0] - d * w[0], upv[1] - d * w[1], upv[2] - d * w[2]];
  if (Math.hypot(...v) < 1e-6) {
    upv = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    d = dot3(upv, w);
    v = [upv[0] - d * w[0], upv[1] - d * w[1], upv[2] - d * w[2]];
  }
  v = normalize(v);
  const u = cross3(v, w);
  return { u, v, w };
}

// Project every component: returns [{ N, x, y, z }] with x = p·u, y = p·v, z = p·w (depth toward viewer).
export function projectPoints(components, basis) {
  const { u, v, w } = basis;
  return components.map(pts => {
    const N = pts.length / 3;
    const x = new Float64Array(N), y = new Float64Array(N), z = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = pts[3 * i], b = pts[3 * i + 1], c = pts[3 * i + 2];
      x[i] = a * u[0] + b * u[1] + c * u[2];
      y[i] = a * v[0] + b * v[1] + c * v[2];
      z[i] = a * w[0] + b * w[1] + c * w[2];
    }
    return { N, x, y, z };
  });
}

// All crossings of the projected link. Segments: (component c, index i) from point i to i+1 (mod N).
export function findCrossings(proj) {
  const segs = [];
  proj.forEach((P, c) => {
    for (let i = 0; i < P.N; i++) {
      const j = (i + 1) % P.N;
      const x0 = P.x[i], x1 = P.x[j], y0 = P.y[i], y1 = P.y[j];
      segs.push({ c, i, x0, y0, x1, y1, z0: P.z[i], z1: P.z[j],
        xmin: Math.min(x0, x1), xmax: Math.max(x0, x1), ymin: Math.min(y0, y1), ymax: Math.max(y0, y1) });
    }
  });
  segs.sort((a, b) => a.xmin - b.xmin);
  const out = [];
  for (let a = 0; a < segs.length; a++) {
    const S = segs[a];
    for (let b = a + 1; b < segs.length; b++) {
      const T = segs[b];
      if (T.xmin > S.xmax) break;
      if (T.ymin > S.ymax || T.ymax < S.ymin) continue;
      if (S.c === T.c) {
        const N = proj[S.c].N;
        const d = Math.abs(S.i - T.i);
        if (d <= 1 || d === N - 1) continue;
      }
      const rx = S.x1 - S.x0, ry = S.y1 - S.y0, sx = T.x1 - T.x0, sy = T.y1 - T.y0;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < EPS) continue;
      const qx = T.x0 - S.x0, qy = T.y0 - S.y0;
      const t = (qx * sy - qy * sx) / den;
      const u = (qx * ry - qy * rx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      const zA = S.z0 + t * (S.z1 - S.z0), zB = T.z0 + u * (T.z1 - T.z0);
      const overA = zA > zB;
      const [ox, oy, ux, uy] = overA ? [rx, ry, sx, sy] : [sx, sy, rx, ry];
      const sign = Math.sign(ox * uy - oy * ux) || 1;
      // sine of the crossing angle and depth gap, used to judge how generic the projection is
      const sinAng = Math.abs(den) / (Math.hypot(rx, ry) * Math.hypot(sx, sy));
      out.push({
        A: { c: S.c, s: S.i + t }, B: { c: T.c, s: T.i + u },
        x: S.x0 + t * rx, y: S.y0 + t * ry,
        overA, sign, sinAng, dz: Math.abs(zA - zB),
      });
    }
  }
  out.forEach((x, k) => { x.id = k; });
  return out;
}

// Signed Gauss code from crossings: per component, the events along it in order.
// gauss = { comps: [[{ x, over }]], sign: Map(x → ±1), ncomp }
export function gaussFromCrossings(crossings, ncomp) {
  const comps = Array.from({ length: ncomp }, () => []);
  const sign = new Map();
  for (const X of crossings) {
    sign.set(X.id, X.sign);
    comps[X.A.c].push({ x: X.id, over: X.overA, s: X.A.s });
    comps[X.B.c].push({ x: X.id, over: !X.overA, s: X.B.s });
  }
  for (const ev of comps) ev.sort((a, b) => a.s - b.s);
  return { comps, sign, ncomp };
}

export function cloneGauss(g) {
  return { comps: g.comps.map(ev => ev.map(e => ({ ...e }))), sign: new Map(g.sign), ncomp: g.ncomp };
}

export const crossingCount = g => g.sign.size;
export const writhe = g => { let w = 0; for (const s of g.sign.values()) w += s; return w; };

// Remove Reidemeister I kinks and Reidemeister II bigons until none are left (both are always valid moves
// on S², see the notes in the app README). Returns a new Gauss code.
export function simplifyGauss(g0) {
  const g = cloneGauss(g0);
  const removeX = (xs) => {
    const set = new Set(xs);
    g.comps = g.comps.map(ev => ev.filter(e => !set.has(e.x)));
    for (const x of xs) g.sign.delete(x);
  };
  let changed = true, guard = 0;
  while (changed && guard++ < 10000) {
    changed = false;
    // R1: the two events of a crossing are cyclically adjacent on one component.
    outer1:
    for (const ev of g.comps) {
      const k = ev.length;
      for (let m = 0; m < k; m++) {
        const a = ev[m], b = ev[(m + 1) % k];
        if (k >= 2 && a.x === b.x) { removeX([a.x]); changed = true; break outer1; }
      }
    }
    if (changed) continue;
    // R2: over events of x,y adjacent and under events of x,y adjacent.
    const adjOver = new Map(), adjUnder = new Map();
    const pairKey = (x, y) => (x < y ? `${x},${y}` : `${y},${x}`);
    for (const ev of g.comps) {
      const k = ev.length;
      if (k < 2) continue;
      for (let m = 0; m < k; m++) {
        const a = ev[m], b = ev[(m + 1) % k];
        if (a.x === b.x || a.over !== b.over) continue;
        (a.over ? adjOver : adjUnder).set(pairKey(a.x, b.x), [a.x, b.x]);
      }
    }
    for (const [key, xy] of adjOver) {
      if (adjUnder.has(key)) { removeX(xy); changed = true; break; }
    }
  }
  return g;
}

// PD code and edge bookkeeping. Edge labels are integers 1..E; component c's edges are consecutive.
// Returns { pd: [[i,j,k,l]], signs: [±1], freeLoops, edgeOf: per component array of edge labels,
//           next: Map(edge → next edge along the knot) }.
export function pdFromGauss(g) {
  let label = 1;
  const edgeLabels = [];        // per component: label of edge m (event m → event m+1)
  let freeLoops = 0;
  for (const ev of g.comps) {
    if (!ev.length) { edgeLabels.push([]); freeLoops++; continue; }
    edgeLabels.push(ev.map(() => label++));
  }
  const info = new Map(); // x → { uI, uO, oI, oO, sign }
  g.comps.forEach((ev, c) => {
    const k = ev.length;
    ev.forEach((e, m) => {
      const inE = edgeLabels[c][(m - 1 + k) % k], outE = edgeLabels[c][m];
      const r = info.get(e.x) || { sign: g.sign.get(e.x) };
      if (e.over) { r.oI = inE; r.oO = outE; } else { r.uI = inE; r.uO = outE; }
      info.set(e.x, r);
    });
  });
  const pd = [], signs = [], xs = [];
  for (const [x, r] of info) {
    pd.push(r.sign > 0 ? [r.uI, r.oO, r.uO, r.oI] : [r.uI, r.oI, r.uO, r.oO]);
    signs.push(r.sign);
    xs.push(x);
  }
  return { pd, signs, xs, info, freeLoops, edgeLabels, nEdges: label - 1 };
}

// Seifert circles: follow the knot, and at every crossing switch to the other strand's outgoing edge.
// Returns { count, circleOfEdge: Map(edge → circle id) }, counting crossingless components as circles.
export function seifertCircles(g) {
  const { info, edgeLabels, freeLoops } = pdFromGauss(g);
  const next = new Map();
  for (const r of info.values()) {
    next.set(r.uI, r.oO);
    next.set(r.oI, r.uO);
  }
  const circleOfEdge = new Map();
  let count = 0;
  for (const labels of edgeLabels) for (const e of labels) {
    if (circleOfEdge.has(e)) continue;
    let f = e, guard = 0;
    while (!circleOfEdge.has(f) && guard++ < 1e6) { circleOfEdge.set(f, count); f = next.get(f); }
    count++;
  }
  return { count: count + freeLoops, circleOfEdge, edgeLabels };
}

// Linking numbers between components (from any diagram): half the sum of signs of mixed crossings.
export function linkingMatrix(g) {
  const n = g.ncomp;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  const compsOf = new Map();
  g.comps.forEach((ev, c) => ev.forEach(e => {
    const a = compsOf.get(e.x) || [];
    a.push(c);
    compsOf.set(e.x, a);
  }));
  for (const [x, cs] of compsOf) {
    const [a, b] = cs;
    if (a !== b) { L[a][b] += g.sign.get(x) / 2; L[b][a] += g.sign.get(x) / 2; }
  }
  return L;
}

// Full diagram along one direction.
export function projectDiagram(components, dir, up = null) {
  const basis = basisFromDir(dir, up);
  const proj = projectPoints(components, basis);
  const crossings = findCrossings(proj);
  const gauss = gaussFromCrossings(crossings, components.length);
  // Genericity: smallest crossing angle and depth gap (tiny values mean a nearly singular projection).
  let minSin = 1, minDz = Infinity;
  for (const X of crossings) { minSin = Math.min(minSin, X.sinAng); minDz = Math.min(minDz, X.dz); }
  return { basis, proj, crossings, gauss, minSin, minDz };
}

// Fibonacci points on the upper hemisphere (z > 0); d and −d give mirror-image diagrams of the same knot.
export function hemisphereDirections(n) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (i + 0.5) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([r * Math.cos(ga * i), r * Math.sin(ga * i), z]);
  }
  return out;
}

// Downsample a component by index stride (for quick crossing counts only, never for invariants).
export function downsample(pts, maxN) {
  const N = pts.length / 3;
  if (N <= maxN) return pts;
  const out = new Float64Array(3 * maxN);
  for (let k = 0; k < maxN; k++) {
    const i = Math.floor((k * N) / maxN);
    out[3 * k] = pts[3 * i]; out[3 * k + 1] = pts[3 * i + 1]; out[3 * k + 2] = pts[3 * i + 2];
  }
  return out;
}

// A good diagram for computing invariants: try many directions, simplify, keep the fewest crossings.
export function bestDiagram(components, { tries = 96 } = {}) {
  const coarse = components.map(c => downsample(c, 90));
  const dirs = hemisphereDirections(tries);
  // Tilt the sample set by a fixed irrational rotation so axis-aligned (degenerate) views are avoided.
  const tilt = d => normalize([d[0] + 0.0137 * d[2], d[1] - 0.0091 * d[2], d[2] + 0.0071 * d[0]]);
  const scored = dirs.map(d0 => {
    const d = tilt(d0);
    const basis = basisFromDir(d);
    return { d, n: findCrossings(projectPoints(coarse, basis)).length };
  }).sort((a, b) => a.n - b.n);
  let best = null;
  for (const cand of scored.slice(0, 6)) {
    const D = projectDiagram(components, cand.d);
    if (D.minSin < 0.02 || D.minDz < 1e-7) continue; // nearly singular: skip
    const simp = simplifyGauss(D.gauss);
    const n = crossingCount(simp);
    if (!best || n < best.n) best = { n, dir: cand.d, diagram: D, simplified: simp };
  }
  if (!best) {
    const D = projectDiagram(components, scored[0].d);
    best = { n: D.crossings.length, dir: scored[0].d, diagram: D, simplified: simplifyGauss(D.gauss) };
  }
  return best;
}
