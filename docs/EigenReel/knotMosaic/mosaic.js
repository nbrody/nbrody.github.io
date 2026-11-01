/**
 * Knot mosaics (Lomonaco–Kauffman): the tiles, a small library, the walk that turns a mosaic into
 * closed curves in ℝ³, and the Kauffman bracket / Jones polynomial that names what came out.
 * Pure functions, no DOM, so Node can test them.
 *
 * Tiles (as in Topology/knotTheory/knotMosaics):
 *   0 blank   1 ─   2 │   3 ╰ (N,E)   4 ╯ (N,W)   5 ╭ (S,E)   6 ╮ (S,W)
 *   7 ┿ horizontal strand over   8 ╂ vertical strand over   9 arcs NE + SW   10 arcs NW + SE
 *
 * Coordinates. Cell (row r, col c) of an n×n mosaic is the unit square [c, c+1] × [−r−1, −r], shifted so
 * the mosaic is centred at the origin: x to the right, y up (north), z out of the page, towards the viewer.
 */

export const TILE_SIDES = {
  1: [['W', 'E']], 2: [['N', 'S']],
  3: [['N', 'E']], 4: [['N', 'W']], 5: [['S', 'E']], 6: [['S', 'W']],
  7: [['W', 'E'], ['N', 'S']], 8: [['N', 'S'], ['W', 'E']],     // first pair is the over strand
  9: [['N', 'E'], ['S', 'W']], 10: [['N', 'W'], ['S', 'E']],
};
export const isCrossing = t => t === 7 || t === 8;
const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
const STEP = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };   // [dr, dc]
const MID = { N: [0.5, 0], S: [0.5, -1], W: [0, -0.5], E: [1, -0.5] };   // side midpoints in the cell

/* ───────── building mosaics ───────── */

const ART = { ' ': 0, '·': 0, '─': 1, '│': 2, '╰': 3, '╯': 4, '╭': 5, '╮': 6, '┿': 7, '╂': 8, '⟋': 9, '⟍': 10 };
export function fromArt(lines) {
  const n = Math.max(lines.length, ...lines.map(l => [...l].length));
  const g = Array.from({ length: n }, () => new Array(n).fill(0));
  lines.forEach((l, r) => [...l].forEach((ch, c) => { g[r][c] = ART[ch] ?? 0; }));
  return g;
}
export function toArt(g) {
  const inv = Object.fromEntries(Object.entries(ART).filter(([k]) => k !== '·').map(([k, v]) => [v, k]));
  return g.map(row => row.map(t => inv[t]).join(''));
}

// Put a tile on each cell from the sides that a set of curves uses there.
function tileFromSides(s) {
  const k = ['N', 'E', 'S', 'W'].filter(d => s.has(d)).join('');
  return { '': 0, WE: 1, EW: 1, NS: 2, NE: 3, NW: 4, ES: 5, SW: 6, NESW: 7 }[k] ?? -1;
}

// Rectangles [r0, r1, c0, c1] → the mosaic of their boundaries. Where two cross, a crossing tile goes
// in (over/under chosen later, by alternate()).
export function rectangles(n, rects) {
  const sides = Array.from({ length: n }, () => Array.from({ length: n }, () => new Set()));
  const add = (r, c, ...ds) => ds.forEach(d => sides[r][c].add(d));
  for (const [r0, r1, c0, c1] of rects) {
    for (let c = c0 + 1; c < c1; c++) { add(r0, c, 'W', 'E'); add(r1, c, 'W', 'E'); }
    for (let r = r0 + 1; r < r1; r++) { add(r, c0, 'N', 'S'); add(r, c1, 'N', 'S'); }
    add(r0, c0, 'S', 'E'); add(r0, c1, 'S', 'W'); add(r1, c0, 'N', 'E'); add(r1, c1, 'N', 'W');
  }
  return sides.map(row => row.map(s => {
    const t = tileFromSides(s);
    if (t < 0) throw new Error('rectangles overlap badly');
    return t;
  }));
}

// The closure of a 2-strand twist with n crossings down the diagonal: the torus link T(2, n).
export function torus2(n) {
  const N = n + 2, g = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let k = 1; k <= n; k++) g[k][k] = 7;
  for (let k = 1; k < n; k++) { g[k][k + 1] = 6; g[k + 1][k] = 3; }
  g[n][n + 1] = 4; for (let r = 1; r < n; r++) g[r][n + 1] = 2;
  g[0][n + 1] = 6; for (let c = 2; c <= n; c++) g[0][c] = 1; g[0][1] = 5;
  g[n + 1][n] = 4; for (let c = 1; c < n; c++) g[n + 1][c] = 1;
  g[n + 1][0] = 3; for (let r = 2; r <= n; r++) g[r][0] = 2; g[1][0] = 5;
  return g;
}

// A twist knot: k crossings of twist down the diagonal, then a clasp. k = 1 trefoil, 2 figure-eight,
// 3 the three-twist knot 5₂, 4 the stevedore 6₁. The mosaic is (k+3)×(k+3).
export function twistKnot(k) {
  const N = k + 3, g = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let j = 1; j <= k; j++) g[j][j] = 7;
  for (let j = 1; j < k; j++) { g[j][j + 1] = 6; g[j + 1][j] = 3; }
  g[k][k + 1] = 7; g[k + 1][k] = 7; g[k + 1][k + 1] = 4;          // the clasp
  g[k][k + 2] = 6; g[k + 1][k + 2] = 2; g[k + 2][k + 2] = 4;       // round the bottom right…
  g[k + 2][k + 1] = 1; g[k + 2][k] = 3;
  for (let r = 1; r < k; r++) g[r][k + 1] = 2;                     // …up the right…
  g[0][k + 1] = 6; for (let c = 2; c <= k; c++) g[0][c] = 1; g[0][1] = 5;
  for (let c = 1; c < k; c++) g[k + 1][c] = 1;                     // …and round the left
  g[k + 1][0] = 3; for (let r = 2; r <= k; r++) g[r][0] = 2; g[1][0] = 5;
  return g;
}

export const clone = g => g.map(r => r.slice());
export const crossings = g => {
  const out = [];
  g.forEach((row, r) => row.forEach((t, c) => { if (isCrossing(t)) out.push([r, c]); }));
  return out;
};

// Choose over/under at every crossing so that each strand alternates over, under, over, …
// (`flip` picks the mirror image). Assumes the diagram's shadow is connected.
export function alternate(g, flip = false) {
  const cs = crossings(g), m = cs.length, best = clone(g);
  if (!m) return best;
  // Walk the shadow; at each crossing passage we need the parity of the passage along its strand.
  // Over at a crossing = the strand that is horizontal there for tile 7, vertical for 8.
  const { comps } = walk(g);
  const want = new Map();    // "r,c" → which direction ('h'|'v') should be over
  let ok = true;
  for (const comp of comps) {
    // seed the parity from a crossing an earlier component already decided, if there is one
    let seed = 0;
    for (let i = 0; i < comp.passes.length; i++) {
      const p = comp.passes[i], k = `${p.r},${p.c}`;
      if (want.has(k)) { seed = ((want.get(k) === p.dir ? 0 : 1) + i) % 2; break; }
    }
    comp.passes.forEach((p, i) => {
      const k = `${p.r},${p.c}`, over = (i + seed) % 2 === 0;
      const dir = over ? p.dir : (p.dir === 'h' ? 'v' : 'h');
      if (want.has(k) && want.get(k) !== dir) ok = false;
      want.set(k, dir);
    });
  }
  if (!ok) throw new Error('could not alternate this diagram');
  for (const [r, c] of cs) {
    const d = want.get(`${r},${c}`);
    best[r][c] = (d === 'h') !== flip ? 7 : 8;
  }
  return best;
}

/* ───────── the walk: mosaic → closed curves ───────── */

/**
 * Follow the strands. Returns { comps, error }: each comp has
 *   pieces: [{ r, c, a, b, t }]  the tile pieces in order, entering side a, leaving side b, tile t,
 *   passes: [{ r, c, dir, over, i }]  each passage through a crossing (dir 'h' or 'v'), in order.
 * error is set (and comps partial) when a strand runs off the board or two tiles don't meet.
 */
export function walk(g) {
  const n = g.length, used = new Set();
  const comps = [];
  const pieceAt = (r, c, side) => {
    const t = g[r]?.[c];
    if (!t) return null;
    for (let k = 0; k < (TILE_SIDES[t] || []).length; k++) {
      const [a, b] = TILE_SIDES[t][k];
      if (a === side) return { k, other: b };
      if (b === side) return { k, other: a };
    }
    return null;
  };
  for (let r0 = 0; r0 < n; r0++) for (let c0 = 0; c0 < n; c0++) {
    const t0 = g[r0][c0];
    if (!t0) continue;
    for (let k0 = 0; k0 < TILE_SIDES[t0].length; k0++) {
      if (used.has(`${r0},${c0},${k0}`)) continue;
      const pieces = [], passes = [];
      let r = r0, c = c0, enter = TILE_SIDES[t0][k0][0], k = k0, guard = 0;
      while (!used.has(`${r},${c},${k}`)) {
        if (++guard > 8 * n * n) return { comps, error: 'runaway walk' };
        used.add(`${r},${c},${k}`);
        const t = g[r][c], [a, b] = TILE_SIDES[t][k], leave = enter === a ? b : a;
        pieces.push({ r, c, a: enter, b: leave, t });
        if (isCrossing(t)) {
          const dir = (enter === 'W' || enter === 'E') ? 'h' : 'v';
          passes.push({ r, c, dir, over: k === 0, i: pieces.length - 1, enter });
        }
        const [dr, dc] = STEP[leave], nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) return { comps, error: `a strand runs off the board at row ${r + 1}, column ${c + 1}` };
        const nx = pieceAt(nr, nc, OPP[leave]);
        if (!nx) return { comps, error: `the strand at row ${r + 1}, column ${c + 1} doesn't continue` };
        r = nr; c = nc; k = nx.k; enter = OPP[leave];
      }
      comps.push({ pieces, passes });
    }
  }
  return { comps, error: null };
}

// One tile piece as dense points in its cell's local frame, entering at side a, leaving at side b.
function piecePoints(a, b, samples) {
  const out = [];
  const [ax, ay] = MID[a], [bx, by] = MID[b];
  const straight = OPP[a] === b;
  if (straight) {
    for (let s = 0; s <= samples; s++) { const u = s / samples; out.push([ax + (bx - ax) * u, ay + (by - ay) * u]); }
    return out;
  }
  // quarter circle of radius ½ about the corner the two sides share
  const cx = (a === 'E' || b === 'E') ? 1 : 0, cy = (a === 'N' || b === 'N') ? 0 : -1;
  const t0 = Math.atan2(ay - cy, ax - cx);
  let t1 = Math.atan2(by - cy, bx - cx);
  let d = t1 - t0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  for (let s = 0; s <= samples; s++) {
    const th = t0 + d * s / samples;
    out.push([cx + 0.5 * Math.cos(th), cy + 0.5 * Math.sin(th)]);
  }
  return out;
}

/**
 * Each component as a dense closed polyline in ℝ³: { pts: [[x,y,z]…], cell: [[r,c]…], s: [tile index…] }.
 * Over strands rise by `lift` across a crossing tile and under strands dip by `lift` (a sin profile).
 */
export function curves(g, { lift = 0.35, samples = 10 } = {}) {
  const n = g.length, half = n / 2;
  const { comps, error } = walk(g);
  if (error) return { error, comps: [] };
  const out = comps.map(comp => {
    const pts = [], cell = [], s = [];
    comp.pieces.forEach((p, idx) => {
      const local = piecePoints(p.a, p.b, samples);
      const cross = isCrossing(p.t);
      const over = cross && ((p.t === 7) === (p.a === 'W' || p.a === 'E'));
      for (let q = 0; q < local.length - 1; q++) {
        const u = q / (local.length - 1);
        const z = cross ? (over ? 1 : -1) * lift * Math.sin(Math.PI * u) : 0;
        pts.push([p.c + local[q][0] - half, -p.r + local[q][1] + half, z]);
        cell.push([p.r, p.c]);
        s.push(idx + u);
      }
    });
    return { pts, cell, s, pieces: comp.pieces, passes: comp.passes };
  });
  return { comps: out, error: null };
}

/* ───────── Laurent polynomials in A (exponent → integer coefficient) ───────── */

const P = {
  mono: (e, c = 1) => new Map([[e, c]]),
  add(a, b) { const r = new Map(a); for (const [e, c] of b) { const v = (r.get(e) || 0) + c; v ? r.set(e, v) : r.delete(e); } return r; },
  mul(a, b) {
    const r = new Map();
    for (const [e1, c1] of a) for (const [e2, c2] of b) { const e = e1 + e2, v = (r.get(e) || 0) + c1 * c2; v ? r.set(e, v) : r.delete(e); }
    return r;
  },
  pow(a, k) { let r = P.mono(0); for (let i = 0; i < k; i++) r = P.mul(r, a); return r; },
  scale(a, e, c) { const r = new Map(); for (const [x, v] of a) r.set(x + e, v * c); return r; },
  mirror(a) { const r = new Map(); for (const [e, c] of a) r.set(-e, c); return r; },
  sorted: a => [...a.entries()].sort((x, y) => x[0] - y[0]),
};
export const Poly = P;

// Number of loops after replacing every crossing tile by one of its smoothings.
function countLoops(g, smooth) {
  const n = g.length;
  // union–find on side slots: horizontal slot between (r,c) and (r,c+1) etc.
  const id = (r, c, s) => {
    if (s === 'E') return `v${r},${c + 1}`;
    if (s === 'W') return `v${r},${c}`;
    if (s === 'S') return `h${r + 1},${c}`;
    return `h${r},${c}`;
  };
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const join = (x, y) => {
    if (!parent.has(x)) parent.set(x, x);
    if (!parent.has(y)) parent.set(y, y);
    const a = find(x), b = find(y);
    if (a !== b) parent.set(a, b);
  };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let t = g[r][c];
    if (!t) continue;
    if (isCrossing(t)) t = smooth.get(`${r},${c}`);
    for (const [a, b] of TILE_SIDES[t]) join(id(r, c, a), id(r, c, b));
  }
  let k = 0;
  for (const [x] of parent) if (find(x) === x) k++;
  return k;
}

/**
 * Kauffman bracket ⟨D⟩ = Σ_states A^{#A − #B} δ^{loops − 1}, δ = −A² − A⁻².
 * At a crossing the A-smoothing joins the two regions swept as the over strand turns anticlockwise:
 * for tile 7 (over strand W–E) those are NE and SW, so the A-smoothing is tile 10 (arcs NW + SE);
 * for tile 8 it is tile 9.
 */
export function bracket(g) {
  const cs = crossings(g), m = cs.length;
  if (m > 16) return null;
  const delta = P.add(P.mono(2, -1), P.mono(-2, -1));
  const dPow = [P.mono(0)];
  let total = new Map();
  for (let mask = 0; mask < (1 << m); mask++) {
    const sm = new Map();
    let nA = 0;
    cs.forEach(([r, c], i) => {
      const A = !((mask >> i) & 1), t = g[r][c];
      if (A) nA++;
      sm.set(`${r},${c}`, A ? (t === 7 ? 10 : 9) : (t === 7 ? 9 : 10));
    });
    const loops = countLoops(g, sm);
    while (dPow.length < loops) dPow.push(P.mul(dPow[dPow.length - 1], delta));
    total = P.add(total, P.scale(dPow[loops - 1], nA - (m - nA), 1));
  }
  return total;
}

// Writhe and linking numbers, using the orientation of the walk.
// A crossing is positive when (over direction × under direction) points out of the page.
export function writhe(g) {
  const { comps, error } = walk(g);
  if (error) return null;
  const at = new Map();   // "r,c" → [{comp, dir vector, over}]
  const vec = { W: [1, 0], E: [-1, 0], N: [0, -1], S: [0, 1] };   // entering from side → direction of travel
  comps.forEach((comp, ci) => comp.passes.forEach(p => {
    const k = `${p.r},${p.c}`;
    if (!at.has(k)) at.set(k, []);
    at.get(k).push({ ci, v: vec[p.enter], over: p.over });
  }));
  let w = 0;
  const lk = comps.map(() => comps.map(() => 0));
  for (const [, ps] of at) {
    const o = ps.find(p => p.over), u = ps.find(p => !p.over);
    const sign = Math.sign(o.v[0] * u.v[1] - o.v[1] * u.v[0]);
    w += sign;
    if (o.ci !== u.ci) { lk[o.ci][u.ci] += sign / 2; lk[u.ci][o.ci] += sign / 2; }
  }
  return { w, lk, components: comps.length };
}

// Jones polynomial V(t) = (−A³)^{−w} ⟨D⟩ at A = t^{−1/4}, as a map from exponents of t (multiples of ½).
export function jones(g) {
  const b = bracket(g), wr = writhe(g);
  if (!b || !wr) return null;
  const f = P.scale(b, -3 * wr.w, wr.w % 2 === 0 ? 1 : -1);
  const v = new Map();
  for (const [e, c] of f) v.set(-e / 4, c);
  return v;
}

// V(t) as display text, e.g. "t + t³ − t⁴" or "−t^½ − t^{5/2}".
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '/': 'ᐟ' };
const sup = s => [...String(s)].map(ch => SUP[ch] ?? ch).join('');
export function formatJones(v) {
  if (!v || !v.size) return '0';
  let s = '';
  for (const [e, c] of P.sorted(v)) {
    const a = Math.abs(c), neg = c < 0;
    let ex = Number.isInteger(e) ? String(e) : `${e * 2}/2`;
    let term;
    if (e === 0) term = String(a);
    else term = (a === 1 ? '' : a) + 't' + (ex === '1' ? '' : sup(ex));
    s += s ? (neg ? ' − ' : ' + ') + term : (neg ? '−' : '') + term;
  }
  return s;
}

// Do two brackets agree up to ±A^{3k} (framing) and, if allowed, mirror image?
// That is: are they the same unoriented link? Returns 'same', 'mirror' or null.
export function compareBrackets(a, b) {
  const test = (x, y) => {
    const X = P.sorted(x), Y = P.sorted(y);
    if (X.length !== Y.length || !X.length) return false;
    const shift = Y[0][0] - X[0][0];
    if (((shift % 3) + 3) % 3 !== 0) return false;
    const sgn = Math.sign(Y[0][1]) * Math.sign(X[0][1]);
    return X.every(([e, c], i) => Y[i][0] === e + shift && Y[i][1] === sgn * c);
  };
  if (test(a, b)) return 'same';
  if (test(P.mirror(a), b)) return 'mirror';
  return null;
}

/* ───────── the library ───────── */

const borromean = () => alternate(rectangles(6, [[0, 3, 0, 3], [1, 4, 2, 5], [2, 5, 1, 4]]));

// B is a figure-eight curve through the centre crossing; A is the square around it.
const whitehead = () => alternate(fromArt([
  '╭─╮  ',
  '│╭┿╮ ',
  '╰┿┿┿╮',
  ' ╰┿╯│',
  '  ╰─╯',
]));

const unknotInDisguise = () => {
  const g = alternate(torus2(3));
  g[2][2] = g[2][2] === 7 ? 8 : 7;
  return g;
};

export const LIBRARY = [
  { key: 'unknot', name: 'Unknot in disguise', short: 'Unknot', grid: unknotInDisguise },
  { key: 'trefoil', name: 'Trefoil', short: 'Trefoil', grid: () => alternate(twistKnot(1)), chiral: true, V: { 1: 1, 3: 1, 4: -1 } },
  { key: 'figure8', name: 'Figure-eight knot', short: 'Figure-eight', grid: () => alternate(twistKnot(2)), V: { '-2': 1, '-1': -1, 0: 1, 1: -1, 2: 1 } },
  { key: 'cinquefoil', name: 'Cinquefoil', short: 'Cinquefoil', grid: () => alternate(torus2(5)), chiral: true, V: { '-7': -1, '-6': 1, '-5': -1, '-4': 1, '-2': 1 } },
  { key: 'threeTwist', name: 'Three-twist knot', short: '5₂', grid: () => alternate(twistKnot(3)), chiral: true, V: { '-6': -1, '-5': 1, '-4': -1, '-3': 2, '-2': -1, '-1': 1 } },
  { key: 'stevedore', name: 'Stevedore knot', short: '6₁', grid: () => alternate(twistKnot(4)), V: { 2: 1, 1: -1, 0: 2, '-1': -2, '-2': 1, '-3': -1, '-4': 1 } },
  { key: 'hopf', name: 'Hopf link', short: 'Hopf', grid: () => alternate(torus2(2)) },
  { key: 'solomon', name: 'Solomon link', short: 'Solomon', grid: () => alternate(torus2(4)), chiral: true },
  { key: 'whitehead', name: 'Whitehead link', short: 'Whitehead', grid: whitehead, chiral: true },
  { key: 'borromean', name: 'Borromean rings', short: 'Borromean', grid: borromean, V: { '-3': -1, '-2': 3, '-1': -2, 0: 4, 1: -2, 2: 3, 3: -1 } },
];
export const byKey = Object.fromEntries(LIBRARY.map(e => [e.key, e]));

// The feed loop shows these, in order, all on a 6×6 board so the tiles can flip in place between them.
export const FEED = [
  { key: 'trefoil', grid: () => pad(byKey.trefoil.grid(), 6) },
  { key: 'figure8', grid: () => stretch(byKey.figure8.grid(), 3, 3) },
  { key: 'borromean', grid: () => byKey.borromean.grid() },
];

// Name a mosaic by its bracket: the library entries plus the unknot and unlinks.
let catalog = null;
function buildCatalog() {
  catalog = [];
  const unknot = P.mono(0);
  const delta = P.add(P.mono(2, -1), P.mono(-2, -1));
  catalog.push({ name: 'Unknot', comps: 1, b: unknot, chiral: false });
  catalog.push({ name: 'Two-component unlink', comps: 2, b: delta, chiral: false });
  catalog.push({ name: 'Three-component unlink', comps: 3, b: P.mul(delta, delta), chiral: false });
  for (const e of LIBRARY) {
    if (e.key === 'unknot') continue;
    const g = e.grid();
    catalog.push({ name: e.name, key: e.key, comps: walk(g).comps.length, b: bracket(g), chiral: !!e.chiral, ref: writhe(g).w });
  }
  // two that turn up when you switch or smooth crossings: brackets multiply under split union (with δ)
  // and connected sum
  const hopf = catalog.find(k => k.key === 'hopf').b;
  catalog.push({ name: 'Hopf link and a separate circle', comps: 3, b: P.mul(hopf, delta), chiral: false });
  catalog.push({ name: 'Chain of three rings', comps: 3, b: P.mul(hopf, hopf), chiral: false });
  catalog.push({ name: 'Chain of three rings', comps: 3, b: P.mul(hopf, P.mirror(hopf)), chiral: false });
}
export function identify(g) {
  if (!catalog) buildCatalog();
  const { comps, error } = walk(g);
  if (error) return { error };
  const b = bracket(g), wr = writhe(g);
  for (const k of catalog) {
    if (k.comps !== comps.length) continue;
    const m = compareBrackets(k.b, b);
    if (m) return { name: k.name, key: k.key, mirror: m === 'mirror' && k.chiral, chiral: k.chiral, refWrithe: k.ref, comps: comps.length, writhe: wr.w, lk: wr.lk };
  }
  return { name: null, comps: comps.length, writhe: wr.w, lk: wr.lk };
}

/* ───────── resizing ───────── */

// Insert a row before index `row` (and a column before `col`, if given) that carries every strand straight
// across. The knot doesn't change; the mosaic gets one bigger.
export function stretch(g, row, col) {
  let h = clone(g);
  if (row != null) {
    const n = h[0].length, above = row > 0 ? h[row - 1] : new Array(n).fill(0);
    const down = t => (TILE_SIDES[t] || []).some(p => p.includes('S'));
    h.splice(row, 0, above.map(t => (down(t) ? 2 : 0)));
  }
  if (col != null) {
    const right = t => (TILE_SIDES[t] || []).some(p => p.includes('E'));
    h = h.map(r => { const left = col > 0 ? r[col - 1] : 0; const out = r.slice(); out.splice(col, 0, right(left) ? 1 : 0); return out; });
  }
  return h;
}

// Centre an m×m mosaic in an n×n board of blank tiles (n − m even keeps it exactly centred).
export function pad(g, n) {
  const m = g.length, o = Math.floor((n - m) / 2);
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) out[r + o][c + o] = g[r][c];
  return out;
}
