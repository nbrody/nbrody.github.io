// Draw a link diagram from its PD code.
//
// The PD code fixes the planar map: X[a,b,c,d] lists the four arcs at a
// crossing counterclockwise, starting with the incoming under-arc. We trace
// its faces, put the largest face on a circle, place every other vertex at
// the average of its neighbours (Tutte's barycentric embedding, on the map
// with each arc subdivided), and draw each component as a smooth closed curve
// through those points, breaking the under-strand at each crossing.

const SUB = 3; // interior points per arc

export function parsePD(pd) {
  return [...pd.matchAll(/X\[([^\]]*)\]/g)].map((m) => m[1].split(',').map((s) => parseInt(s, 10)));
}

// Layout of one connected diagram; crossings are indices into X.
function layoutComponent(X, cross, partner) {
  // Dart h = 4c + s. Face to the left of dart h continues with dart
  // 4c' + (s' - 1) where (c', s') is the far end of h.
  const darts = cross.flatMap((c) => [0, 1, 2, 3].map((s) => 4 * c + s));
  const seen = new Set();
  const faces = [];
  for (const d0 of darts) {
    if (seen.has(d0)) continue;
    const f = [];
    let d = d0;
    while (!seen.has(d)) {
      seen.add(d); f.push(d);
      const e = partner[d];
      d = 4 * Math.floor(e / 4) + ((e % 4) + 3) % 4;
    }
    faces.push(f);
  }

  // Vertices: crossings, then SUB points per arc (ordered from dart min(h, partner) side).
  const id = new Map();
  const pts = [];
  const nb = [];
  const addV = (key) => { id.set(key, pts.length); pts.push([0, 0]); nb.push([]); return pts.length - 1; };
  for (const c of cross) addV('c' + c);
  const arcPts = new Map();
  for (const d of darts) {
    const e = partner[d];
    const k = Math.min(d, e);
    if (arcPts.has(k)) continue;
    const ids = [];
    for (let i = 0; i < SUB; i++) ids.push(addV(`a${k}_${i}`));
    arcPts.set(k, ids);
    const a = id.get('c' + Math.floor(k / 4)), b = id.get('c' + Math.floor(Math.max(d, e) / 4));
    const chain = [a, ...ids, b];
    for (let i = 0; i + 1 < chain.length; i++) { nb[chain[i]].push(chain[i + 1]); nb[chain[i + 1]].push(chain[i]); }
  }
  // Points along dart d, from its crossing towards the far crossing.
  const along = (d) => {
    const e = partner[d];
    const ids = arcPts.get(Math.min(d, e));
    return d <= e ? ids : [...ids].reverse();
  };

  // Outer face on a circle, clockwise (the outer face lies to the left of its darts).
  const outer = faces.reduce((a, b) => (b.length > a.length ? b : a));
  const ring = [];
  for (const d of outer) ring.push(id.get('c' + Math.floor(d / 4)), ...along(d));
  const fixed = new Set();
  const N = ring.length;
  ring.forEach((v, i) => {
    if (fixed.has(v)) return;
    const t = -2 * Math.PI * i / N;
    pts[v] = [Math.cos(t), Math.sin(t)];
    fixed.add(v);
  });
  // Hidden vertex inside every inner face, joined to its whole boundary, so
  // the two arcs of a bigon do not collapse onto one segment.
  const P = pts.slice();
  const nbT = nb.map((a) => a.slice());
  for (const f of faces) {
    if (f === outer) continue;
    const fv = P.length;
    P.push([0, 0]); nbT.push([]);
    for (const d of f) {
      for (const v of [id.get('c' + Math.floor(d / 4)), ...along(d)]) { nbT[fv].push(v); nbT[v].push(fv); }
    }
  }
  for (let it = 0; it < 1500; it++) {
    for (let v = 0; v < P.length; v++) {
      if (fixed.has(v)) continue;
      let x = 0, y = 0;
      for (const w of nbT[v]) { x += P[w][0]; y += P[w][1]; }
      P[v] = [x / nbT[v].length, y / nbT[v].length];
    }
  }
  for (let v = 0; v < pts.length; v++) pts[v] = P[v];

  // The four darts at a crossing must run counterclockwise (y up); mirror if not.
  const c0 = cross[0];
  const Q = [0, 1, 2, 3].map((s) => pts[along(4 * c0 + s)[0]]);
  let area = 0;
  for (let i = 0; i < 4; i++) area += Q[i][0] * Q[(i + 1) % 4][1] - Q[(i + 1) % 4][0] * Q[i][1];
  if (area < 0) for (const p of pts) p[0] = -p[0];

  const frames = cross.map((c) => [id.get('c' + c), [0, 1, 2, 3].map((s) => along(4 * c + s)[0])]);
  relax(pts, nb, frames);
  const edges = [];
  for (let v = 0; v < pts.length; v++) for (const w of nb[v]) if (w > v) edges.push([v, w]);
  return { pts, along, cpos: (c) => pts[id.get('c' + c)], ok: valid(pts, edges, frames) };
}

// Small force simulation started from the (planar) barycentric layout:
// repulsion keeps faces open, springs keep arcs even, bending smooths the
// strands, and each crossing is pulled into a "+" so strands pass straight
// through. Steps are small so the picture stays planar.
function relax(pts, nb, crossings) {
  const N = pts.length;
  let total = 0, cnt = 0;
  for (let v = 0; v < N; v++) for (const w of nb[v]) if (w > v) { total += Math.hypot(pts[v][0] - pts[w][0], pts[v][1] - pts[w][1]); cnt++; }
  const s = cnt ? cnt / total : 1;
  for (const p of pts) { p[0] *= s; p[1] *= s; }
  const isCross = new Set(crossings.map(([c]) => c));
  const E = [[-1, 0], [0, -1], [1, 0], [0, 1]]; // slots 0..3 counterclockwise
  if (N > 1500) return;
  const iters = N > 600 ? 150 : N > 250 ? 300 : 500;
  const F = pts.map(() => [0, 0]);
  const edges = [];
  for (let v = 0; v < N; v++) for (const w of nb[v]) if (w > v) edges.push([v, w]);
  let snapshot = pts.map((p) => [p[0], p[1]]);
  // A diagram with nugatory crossings can give a degenerate starting layout.
  // Then relax without checks, and keep the result only if it comes out valid.
  const guard = valid(pts, edges, crossings);
  const start = snapshot;
  for (let it = 0; it < iters; it++) {
    for (const f of F) { f[0] = 0; f[1] = 0; }
    for (let a = 0; a < N; a++) {
      const pa = pts[a];
      for (let b = a + 1; b < N; b++) {
        const dx = pa[0] - pts[b][0], dy = pa[1] - pts[b][1];
        const d2 = dx * dx + dy * dy;
        if (d2 > 16) continue;
        const k = 0.25 / (d2 + 0.05);
        F[a][0] += dx * k; F[a][1] += dy * k; F[b][0] -= dx * k; F[b][1] -= dy * k;
      }
    }
    for (let v = 0; v < N; v++) {
      for (const w of nb[v]) {
        if (w < v) continue;
        const dx = pts[w][0] - pts[v][0], dy = pts[w][1] - pts[v][1];
        const d = Math.hypot(dx, dy) || 1e-9;
        const k = 0.35 * (d - 1) / d;
        F[v][0] += dx * k; F[v][1] += dy * k; F[w][0] -= dx * k; F[w][1] -= dy * k;
      }
      if (!isCross.has(v) && nb[v].length === 2) {
        const [a, b] = nb[v];
        F[v][0] += 0.45 * ((pts[a][0] + pts[b][0]) / 2 - pts[v][0]);
        F[v][1] += 0.45 * ((pts[a][1] + pts[b][1]) / 2 - pts[v][1]);
      }
    }
    for (const [c, ns] of crossings) {
      const pc = pts[c];
      let sc = 0, cc = 0;
      ns.forEach((v, k) => {
        const dx = pts[v][0] - pc[0], dy = pts[v][1] - pc[1];
        cc += E[k][0] * dx + E[k][1] * dy;
        sc += E[k][0] * dy - E[k][1] * dx;
      });
      const th = Math.atan2(sc, cc), co = Math.cos(th), si = Math.sin(th);
      ns.forEach((v, k) => {
        const tx = pc[0] + co * E[k][0] - si * E[k][1];
        const ty = pc[1] + si * E[k][0] + co * E[k][1];
        const fx = 0.6 * (tx - pts[v][0]), fy = 0.6 * (ty - pts[v][1]);
        F[v][0] += fx; F[v][1] += fy; F[c][0] -= fx; F[c][1] -= fy;
      });
    }
    const cool = 0.12 * (1 - it / iters) + 0.02;
    for (let v = 0; v < N; v++) {
      const m = Math.hypot(F[v][0], F[v][1]);
      const k = m > cool ? cool / m : 1;
      pts[v][0] += F[v][0] * k; pts[v][1] += F[v][1] * k;
    }
    // Every few steps make sure the drawing is still a picture of the same
    // diagram; if not, go back to the last good state and stop.
    if (guard && (it % 10 === 9 || it === iters - 1)) {
      if (valid(pts, edges, crossings)) snapshot = pts.map((p) => [p[0], p[1]]);
      else { snapshot.forEach((p, v) => { pts[v][0] = p[0]; pts[v][1] = p[1]; }); break; }
    }
  }
  if (!guard && !valid(pts, edges, crossings)) start.forEach((p, v) => { pts[v][0] = p[0]; pts[v][1] = p[1]; });
  // Back to the unit disc.
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= N; cy /= N;
  let r = 1e-9;
  for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy));
  for (const p of pts) { p[0] = (p[0] - cx) / r; p[1] = (p[1] - cy) / r; }
}

// No two arc segments cross, and every crossing still has its four arcs in
// counterclockwise order.
function valid(pts, edges, crossings) {
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    const A = pts[a], B = pts[b];
    const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]);
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j];
      if (c === a || c === b || d === a || d === b) continue;
      const C = pts[c], D = pts[d];
      if (Math.max(C[0], D[0]) < x0 || Math.min(C[0], D[0]) > x1 || Math.max(C[1], D[1]) < y0 || Math.min(C[1], D[1]) > y1) continue;
      if (orient(A, B, C) * orient(A, B, D) < 0 && orient(C, D, A) * orient(C, D, B) < 0) return false;
    }
  }
  for (const [c, ns] of crossings) {
    const P = pts[c];
    const ang = ns.map((v) => Math.atan2(pts[v][1] - P[1], pts[v][0] - P[0]));
    let turn = 0;
    for (let k = 0; k < 4; k++) {
      let d = ang[(k + 1) % 4] - ang[k];
      while (d <= 0) d += 2 * Math.PI;
      turn += d;
    }
    if (Math.abs(turn - 2 * Math.PI) > 1e-6) return false;
    // The strands must really cross: segment 0-2 meets segment 1-3, with 1-3
    // running from right to left of 0-2 (counterclockwise slots).
    const [a0, a1, a2, a3] = ns.map((v) => pts[v]);
    if (!(orient(a0, a2, a1) < 0 && orient(a0, a2, a3) > 0 && orient(a1, a3, a0) > 0 && orient(a1, a3, a2) < 0)) return false;
  }
  return true;
}

// Returns {components: [{points, overs: [index of crossing points that pass over]}], ...}
export function buildDiagram(pd) {
  const X = parsePD(pd);
  const n = X.length;
  if (!n) return { pieces: [], n: 0 };
  // Pair up the two occurrences of each arc label.
  const where = new Map();
  X.forEach((row, c) => row.forEach((lab, s) => {
    if (!where.has(lab)) where.set(lab, []);
    where.get(lab).push(4 * c + s);
  }));
  const partner = new Array(4 * n);
  for (const [lab, hs] of where) {
    if (hs.length !== 2) throw new Error(`Arc ${lab} appears ${hs.length} times in the PD code`);
    partner[hs[0]] = hs[1]; partner[hs[1]] = hs[0];
  }
  // Connected pieces of the diagram.
  const comp = new Array(n).fill(-1);
  const groups = [];
  for (let c = 0; c < n; c++) {
    if (comp[c] >= 0) continue;
    const g = [];
    const st = [c]; comp[c] = groups.length;
    while (st.length) {
      const x = st.pop(); g.push(x);
      for (let s = 0; s < 4; s++) {
        const y = Math.floor(partner[4 * x + s] / 4);
        if (comp[y] < 0) { comp[y] = groups.length; st.push(y); }
      }
    }
    groups.push(g.sort((a, b) => a - b));
  }

  const layouts = groups.map((g) => layoutComponent(X, g, partner));

  // Trace link components: entering a crossing at slot s, leave at s + 2.
  // Start from incoming under-arcs (slot 0) so the direction is the link's.
  const used = new Set();
  const strands = [];
  const starts = [];
  for (let c = 0; c < n; c++) starts.push(4 * c + 0);
  for (let c = 0; c < n; c++) starts.push(4 * c + 1, 4 * c + 3);
  for (const h0 of starts) {
    if (used.has(h0)) continue;
    const L = layouts[comp[Math.floor(h0 / 4)]];
    const points = [], overs = [], cross = [];
    let h = h0;
    while (!used.has(h)) {
      const c = Math.floor(h / 4), s = h % 4;
      const out = 4 * c + (s + 2) % 4;
      used.add(h); used.add(out);
      cross.push({ c, idx: points.length, over: s % 2 === 1, slot: s });
      points.push(L.cpos(c));
      if (s % 2 === 1) overs.push(points.length - 1);
      for (const v of L.along(out)) points.push(L.pts[v]);
      h = partner[out];
    }
    strands.push({ points, overs, cross, piece: comp[Math.floor(h0 / 4)] });
  }
  return { strands, layouts, groups, comp, X, n, ok: layouts.every((L) => L.ok) };
}

// Crossing sign from the drawing (for checking): over × under > 0 is positive.
export function drawnSigns(D) {
  const dirs = new Map();
  for (const st of D.strands) {
    const m = st.points.length;
    for (const { c, idx, over } of st.cross) {
      const a = st.points[(idx - 1 + m) % m], b = st.points[(idx + 1) % m];
      const v = [b[0] - a[0], b[1] - a[1]];
      if (!dirs.has(c)) dirs.set(c, {});
      dirs.get(c)[over ? 'o' : 'u'] = v;
    }
  }
  return [...Array(D.n).keys()].map((c) => {
    const { o, u } = dirs.get(c);
    return Math.sign(o[0] * u[1] - o[1] * u[0]);
  });
}

function bezierPath(P, closed = true) {
  const m = P.length;
  const at = (i) => P[(i + m) % m];
  let d = `M${f(P[0][0])},${f(P[0][1])}`;
  for (let i = 0; i < m; i++) d += seg(at(i - 1), at(i), at(i + 1), at(i + 2));
  return d + (closed ? 'Z' : '');
}
function seg(p0, p1, p2, p3) {
  const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
  const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
  return `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
}
function f(x) { return Math.round(x * 100) / 100; }

// Render to SVG. Returns {svg, ok}; ok is false when the layout could not be
// verified planar (so the picture may misrepresent some crossings).
export function diagramSVG(pd, trivial, opts = {}) {
  const colors = opts.colors || ['#818cf8', '#00a7da', '#d38ae7', '#1f9d6a', '#e08a3c'];
  const bg = opts.bg || '#f4f6f8';
  const D = buildDiagram(pd);
  const R = 200;           // radius of each piece
  const gap = 60;
  const items = [];        // {kind, ...} in piece coordinates
  const pieces = D.n ? D.groups.length : 0;
  const total = pieces + trivial;
  if (total === 0) return { svg: '', ok: true };
  const cols = Math.min(total, 3);
  const rows = Math.ceil(total / cols);
  const W = cols * (2 * R + gap) + gap, H = rows * (2 * R + gap) + gap;
  const origin = (k) => [gap + R + (k % cols) * (2 * R + gap), gap + R + Math.floor(k / cols) * (2 * R + gap)];
  const tr = (p, k) => { const o = origin(k); return [o[0] + p[0] * R, o[1] - p[1] * R]; };
  const sw = Math.max(3.2, Math.min(6, 60 / Math.sqrt(D.n + 1)));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Link diagram">`;
  svg += `<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
  const paths = [];
  (D.strands || []).forEach((st, k) => {
    const P = st.points.map((p) => tr(p, st.piece));
    const color = colors[k % colors.length];
    paths.push(`<path d="${bezierPath(P)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`);
    // Over-passes: redraw the two segments around the crossing on a halo.
    const m = P.length;
    const at = (i) => P[(i + m) % m];
    for (const i of st.overs) {
      const d = `M${f(at(i - 1)[0])},${f(at(i - 1)[1])}` + seg(at(i - 2), at(i - 1), at(i), at(i + 1)) + seg(at(i - 1), at(i), at(i + 1), at(i + 2));
      items.push(`<path d="${d}" fill="none" stroke="${bg}" stroke-width="${sw * 3.2}" stroke-linecap="butt"/>`);
      items.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`);
    }
    // One direction arrow per component, mid-way along its first arc.
    const j = Math.floor((SUB + 1) / 2);
    if (opts.arrows !== false && m > j + 1) {
      const a = at(j), b = at(j + 1);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      items.push(`<path d="M${f(a[0])},${f(a[1])} L${f(mid[0])},${f(mid[1])}" stroke="${color}" stroke-width="${sw}" fill="none" marker-end="url(#arr)"/>`);
    }
  });
  for (let t = 0; t < trivial; t++) {
    const k = pieces + t;
    const o = origin(k);
    const color = colors[((D.strands || []).length + t) % colors.length];
    paths.push(`<circle cx="${o[0]}" cy="${o[1]}" r="${R * 0.7}" fill="none" stroke="${color}" stroke-width="${sw}"/>`);
  }
  svg += paths.join('') + items.join('');
  if (opts.labels && D.n) {
    for (let c = 0; c < D.n; c++) {
      const L = D.layouts[D.comp[c]];
      const p = tr(L.cpos(c), D.comp[c]);
      svg += `<text x="${f(p[0] + 10)}" y="${f(p[1] - 10)}" font-size="15" font-family="Atkinson Hyperlegible, sans-serif" fill="currentColor" opacity="0.75">${c}</text>`;
    }
  }
  return { svg: svg + '</svg>', ok: D.n ? D.ok : true };
}
