// kleinian.js — the two-generator machinery of Indra's Pearls
// (Mumford, Series & Wright), shared by the Fig 10.13 and Fig 12.1 renderers.
//
// Complex numbers are [re, im] pairs; a Möbius map z ↦ (az+b)/(cz+d) is the
// array [a, b, c, d] of complex numbers with ad − bc = 1. Generators are
// indexed 0..3 as a, b, A = a⁻¹, B = b⁻¹, so gens[(k + 2) % 4] is the inverse of
// gens[k] — the book's convention.

export const LETTERS = ['a', 'b', 'A', 'B'];

// ---- complex arithmetic ----------------------------------------------------
export const cx = (re, im = 0) => [re, im];
export const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
export const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
export const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
export const scale = (p, s) => [p[0] * s, p[1] * s];
export const abs2 = (p) => p[0] * p[0] + p[1] * p[1];
export function div(p, q) {
  const n = abs2(q);
  return [(p[0] * q[0] + p[1] * q[1]) / n, (p[1] * q[0] - p[0] * q[1]) / n];
}
export function sqrt(p) {
  const r = Math.hypot(p[0], p[1]);
  const re = Math.sqrt(Math.max(0, (r + p[0]) / 2));
  const im = Math.sqrt(Math.max(0, (r - p[0]) / 2));
  return [re, p[1] < 0 ? -im : im];
}

// ---- Möbius maps -------------------------------------------------------------
export function mmul(X, Y) {
  return [
    add(mul(X[0], Y[0]), mul(X[1], Y[2])),
    add(mul(X[0], Y[1]), mul(X[1], Y[3])),
    add(mul(X[2], Y[0]), mul(X[3], Y[2])),
    add(mul(X[2], Y[1]), mul(X[3], Y[3])),
  ];
}
export const minv = (X) => [X[3], scale(X[1], -1), scale(X[2], -1), X[0]];
export const apply = (X, z) => div(add(mul(X[0], z), X[1]), add(mul(X[2], z), X[3]));
export const trace = (X) => add(X[0], X[3]);

/** The attracting fixed point of X (the unique one if X is parabolic). */
export function fixedPoint(X) {
  const [a, b, c, d] = X;
  if (abs2(c) < 1e-24) return [1e12, 0];
  const amd = sub(a, d);
  const disc = sqrt(add(mul(amd, amd), scale(mul(b, c), 4)));
  const c2 = scale(c, 2);
  const z1 = div(add(amd, disc), c2);
  const z2 = div(sub(amd, disc), c2);
  // Attracting ⇔ |X'(z)| = 1/|cz + d|² < 1.
  return abs2(add(mul(c, z1), d)) >= abs2(add(mul(c, z2), d)) ? z1 : z2;
}

// ---- Grandma's special parabolic commutator recipe (Box 21, p. 229) ----------
// Given traces ta, tb it returns generators a, b with Tr abAB = −2, i.e. the
// commutator is parabolic. `root` picks which solution of
// x² − ta·tb·x + ta² + tb² = 0 is used for tab.
export function grandma(ta, tb, root = -1) {
  const p = mul(ta, tb);
  const q = add(mul(ta, ta), mul(tb, tb));
  const disc = sqrt(sub(mul(p, p), scale(q, 4)));
  const tab = scale(add(p, scale(disc, root)), 0.5);
  const I = [0, 1];
  const z0 = div(mul(sub(tab, [2, 0]), tb), add(sub(mul(tb, tab), scale(ta, 2)), scale(mul(I, tab), 2)));
  const tatab = mul(ta, tab);
  const a = [
    scale(ta, 0.5),
    div(add(sub(tatab, scale(tb, 2)), scale(I, 4)), mul(add(scale(tab, 2), [4, 0]), z0)),
    div(mul(sub(sub(tatab, scale(tb, 2)), scale(I, 4)), z0), sub(scale(tab, 2), [4, 0])),
    scale(ta, 0.5),
  ];
  const b = [
    scale(sub(tb, scale(I, 2)), 0.5),
    scale(tb, 0.5),
    scale(tb, 0.5),
    scale(add(tb, scale(I, 2)), 0.5),
  ];
  return { gens: [a, b, minv(a), minv(b)], tab };
}

/**
 * Ordered sample limit points for the continuations of a word ending in k.
 * The book uses three — for words ending in a: Fix(bABa), Fix(a), Fix(BAba),
 * the extreme left, middle and extreme right continuations. With `fine` we
 * also split by the next letter j ∈ {k+1, k, k−1}, taking for each its
 * leftmost Fix(j j+1 j+2 j+3), middle Fix(j), rightmost Fix(j j−1 j−2 j−3);
 * neighbouring extremes coincide, leaving seven points. Sphere-filling limit
 * sets need this: three close points can still bound a large loop.
 */
function repetendFixedPoints(gens, fine) {
  const g = (k) => gens[((k % 4) + 4) % 4];
  const left = (j) => fixedPoint(mmul(mmul(g(j), g(j + 1)), mmul(g(j + 2), g(j + 3))));
  const right = (j) => fixedPoint(mmul(mmul(g(j), g(j - 1)), mmul(g(j - 2), g(j - 3))));
  const fix = [];
  for (let k = 0; k < 4; k++) {
    fix.push(fine
      ? [left(k + 1), fixedPoint(g(k + 1)), left(k), fixedPoint(g(k)), right(k), fixedPoint(g(k - 1)), right(k - 1)]
      : [left(k + 1), fixedPoint(g(k)), right(k - 1)]);
  }
  return fix;
}

// Flat Float64 Möbius arithmetic for the hot loops: [ar, ai, br, bi, cr, ci, dr, di].
function flat(X) {
  return new Float64Array([X[0][0], X[0][1], X[1][0], X[1][1], X[2][0], X[2][1], X[3][0], X[3][1]]);
}
function fmul(out, o, X, Y) {
  const ar = X[0], ai = X[1], br = X[2], bi = X[3], cr = X[4], ci = X[5], dr = X[6], di = X[7];
  const er = Y[0], ei = Y[1], fr = Y[2], fi = Y[3], gr = Y[4], gi = Y[5], hr = Y[6], hi = Y[7];
  out[o] = ar * er - ai * ei + br * gr - bi * gi;
  out[o + 1] = ar * ei + ai * er + br * gi + bi * gr;
  out[o + 2] = ar * fr - ai * fi + br * hr - bi * hi;
  out[o + 3] = ar * fi + ai * fr + br * hi + bi * hr;
  out[o + 4] = cr * er - ci * ei + dr * gr - di * gi;
  out[o + 5] = cr * ei + ci * er + dr * gi + di * gr;
  out[o + 6] = cr * fr - ci * fi + dr * hr - di * hi;
  out[o + 7] = cr * fi + ci * fr + dr * hi + di * hr;
}

/**
 * The book's depth-first limit set algorithm (pp. 148–185), run incrementally.
 * Leaves are visited in the order the limit curve is traced, so each leaf's
 * sample points continue the polyline from the previous leaf. A leaf word w
 * (last letter k) terminates when the chain oldpoint → w(fix[k][0]) → … →
 * w(fix[k][n]) has every step < epsilon — comparing with the *previous* leaf's
 * endpoint is what forces refinement where a piece hides a long tentacle.
 * Sphere-filling (degenerate) limit sets hide tentacles even so; `minNorm`
 * additionally demands ‖w‖² ≥ minNorm, so that w squashes all but a small disk
 * about its repelling point into a small disk.
 * `emit(xs, ys, letters, level)` receives the chain (xs[0] = oldpoint) and the
 * word's letter stack (letters[1..level]). `step(budget)` advances by at most
 * `budget` nodes and returns true once the whole tree has been explored.
 * With `prefix` (generator indices) only the subtree below that word is
 * explored, so disjoint prefixes can be walked in parallel. `donate()` gives
 * away the not-yet-started children of every ancestor on the current path,
 * returning their prefixes: they come after everything this walker still has
 * to do, so its curve stays continuous and theirs start fresh.
 */
export function limitSetWalker(gens, { epsilon = 0.002, maxLevel = 40, fine = false, minNorm = 0, prefix = [], emit }) {
  const G = gens.map(flat);
  const fix = repetendFixedPoints(gens, fine);
  const np = fix[0].length;
  const words = new Float64Array((maxLevel + 2) * 8); // words[lev] = g_{t1}…g_{tlev}
  const tags = new Int8Array(maxLevel + 2);
  const next = new Int8Array(maxLevel + 2); // which child (0..2) to try next at each level
  // xs[0], ys[0] hold oldpoint; the leaf's own points follow.
  const xs = new Float64Array(np + 1), ys = new Float64Array(np + 1);
  // The first leaf continues from the leftmost limit point, Fix(abAB).
  const start = fixedPoint(mmul(mmul(gens[0], gens[1]), mmul(gens[2], gens[3])));
  xs[0] = start[0];
  ys[0] = start[1];
  const eps2 = epsilon * epsilon;
  let lev = 0;
  // Level-0 sentinel: children are all four generators.
  let rootNext = 0;
  let done = false;
  const base = prefix.length;

  function image(lev, k, j) {
    const o = lev * 8;
    const zr = fix[k][j][0], zi = fix[k][j][1];
    const nr = words[o] * zr - words[o + 1] * zi + words[o + 2];
    const ni = words[o] * zi + words[o + 1] * zr + words[o + 3];
    const dr = words[o + 4] * zr - words[o + 5] * zi + words[o + 6];
    const di = words[o + 4] * zi + words[o + 5] * zr + words[o + 7];
    const q = dr * dr + di * di;
    xs[j + 1] = (nr * dr + ni * di) / q;
    ys[j + 1] = (ni * dr - nr * di) / q;
  }
  function isLeaf() {
    const k = tags[lev];
    for (let j = 0; j < np; j++) image(lev, k, j);
    if (lev >= maxLevel) return true;
    if (minNorm > 0) {
      let n2 = 0;
      for (let i = lev * 8, e = i + 8; i < e; i++) n2 += words[i] * words[i];
      if (n2 < minNorm) return false;
    }
    for (let j = 1; j <= np; j++) {
      if ((xs[j] - xs[j - 1]) ** 2 + (ys[j] - ys[j - 1]) ** 2 >= eps2) return false;
    }
    return true;
  }
  function descend(k) {
    lev++;
    tags[lev] = k;
    next[lev] = 0;
    if (lev === 1) words.set(G[k], 8);
    else fmul(words, lev * 8, words.subarray((lev - 1) * 8, lev * 8), G[k]);
  }

  if (base) {
    for (const k of prefix) descend(k);
    // Continue from the subtree's leftmost limit point, w(fix[k][0]).
    image(base, tags[base], 0);
    xs[0] = xs[1];
    ys[0] = ys[1];
  }

  function step(budget) {
    let n = 0;
    while (!done && n < budget) {
      if (lev < base) {
        done = true;
      } else if (lev === 0) {
        if (rootNext >= 4) { done = true; break; }
        descend(rootNext++);
      } else if (next[lev] === 0 && isLeaf()) {
        emit(xs, ys, tags, lev);
        xs[0] = xs[np];
        ys[0] = ys[np];
        lev--;
      } else if (next[lev] < 3) {
        // children of last letter k in turn order: k+1, k, k−1
        const k = tags[lev];
        const c = next[lev]++;
        descend((k + 1 - c + 4) % 4);
      } else {
        lev--;
      }
      n++;
    }
    return done;
  }
  function donate() {
    const out = [];
    for (let L = Math.max(base, 1); L < lev; L++) {
      if (next[L] >= 3) continue;
      const stem = Array.from(tags.subarray(1, L + 1));
      for (let c = next[L]; c < 3; c++) out.push([...stem, (tags[L] + 1 - c + 4) % 4]);
      next[L] = 3;
    }
    return out;
  }
  return { step, donate, get done() { return done; } };
}

/**
 * Enumerate group elements g₁…gₙ (reduced words) breadth-first-ish via DFS,
 * keeping those with |c|² + |d|² ≤ cutoff, up to `maxCount` visited nodes.
 * Returns a Float32Array of [a, b, c, d] (8 floats each), sorted by |c|²+|d|²
 * so that truncating to the first N gives the N "biggest" terms.
 */
export function enumerateElements(gens, { cutoff = 4000, maxLevel = 30, maxNodes = 400000 } = {}) {
  const G = gens.map(flat);
  const out = [];
  const stack = new Float64Array((maxLevel + 2) * 8);
  let nodes = 0;
  out.push({ s: 1, m: new Float64Array([1, 0, 0, 0, 0, 0, 1, 0]) });
  function rec(lev, last) {
    if (nodes >= maxNodes || lev > maxLevel) return;
    for (let k = 0; k < 4; k++) {
      if (lev > 0 && k === (last + 2) % 4) continue;
      const o = (lev + 1) * 8;
      if (lev === 0) stack.set(G[k], o);
      else fmul(stack, o, stack.subarray(lev * 8, lev * 8 + 8), G[k]);
      nodes++;
      const s = stack[o + 4] ** 2 + stack[o + 5] ** 2 + stack[o + 6] ** 2 + stack[o + 7] ** 2;
      if (s > cutoff) continue;
      out.push({ s, m: stack.slice(o, o + 8) });
      rec(lev + 1, k);
      if (nodes >= maxNodes) return;
    }
  }
  rec(0, -1);
  out.sort((p, q) => p.s - q.s);
  const data = new Float32Array(out.length * 8);
  out.forEach((e, i) => data.set(e.m, i * 8));
  return { data, count: out.length, nodes, saturated: nodes >= maxNodes };
}

// ---- Farey words and cusp circle chains (Chapters 9–10) ---------------------

/**
 * The p/q Farey word, built down the Stern–Brocot tree from w(0/1) = X and
 * w(1/0) = Y, each mediant being the product of its two parents' words.
 */
export function fareyWord(p, q, X, Y) {
  let L = { p: 0, q: 1, w: X }, R = { p: 1, q: 0, w: Y };
  for (;;) {
    const m = { p: L.p + R.p, q: L.q + R.q, w: L.w + R.w };
    if (m.p === p && m.q === q) return m.w;
    if (p * m.q < m.p * q) R = m; else L = m;
  }
}

const IDENTITY = [[1, 0], [0, 0], [0, 0], [1, 0]];
const INVERSE_LETTER = { a: 'A', A: 'a', b: 'B', B: 'b' };

function wordMatrix(gens, w) {
  let M = IDENTITY;
  for (const c of w) M = mmul(M, gens[LETTERS.indexOf(c)]);
  return M;
}
const parabolicFix = (M) => div(sub(M[0], M[3]), scale(M[2], 2));
const isParabolic = (M, tol = 1e-5) => {
  const t = trace(M);
  return Math.hypot(Math.abs(t[0]) - 2, t[1]) < tol;
};
function circumcircle(p, q, r) {
  const [ax, ay] = p, [bx, by] = q, [cx, cy] = r;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-14) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return [ux, uy, Math.hypot(ax - ux, ay - uy)];
}

/**
 * The circle chain of a cusp word W: the ordinary-set disks tangent at the
 * fixed points of W's cyclic permutations σᵢ. Two disks meet at each Fix(σᵢ);
 * each is stabilised by a thrice-punctured-sphere group ⟨σᵢ, Q⟩ with Q a
 * conjugate g σⱼ g⁻¹ and σᵢQ^±1 parabolic, so its boundary is the circle
 * through Fix(σᵢ), Fix(Q), Fix(σᵢQ^±1). Accidental Fuchsian subgroups also
 * pass that test, so a circle is kept only if one side is empty of the
 * sampled limit points `samples` = [x0, y0, x1, y1, …].
 * Returns disks [cx, cy, r, exterior] with exterior = 1 if the disk is the
 * outside of the circle.
 */
export function cuspChainDisks(gens, word, samples, { tol = 0.004, maxConj = 3 } = {}) {
  const n = word.length;
  const perms = [];
  for (let i = 0; i < n; i++) perms.push(wordMatrix(gens, word.slice(i) + word.slice(0, i)));
  const conj = [''];
  for (let L = 1; L <= maxConj; L++) {
    for (const w of conj.filter((x) => x.length === L - 1)) {
      for (const c of LETTERS) if (!w.length || w[w.length - 1] !== INVERSE_LETTER[c]) conj.push(w + c);
    }
  }
  const conjM = conj.map((g) => wordMatrix(gens, g));
  function emptySide(c) {
    let ins = 0, outs = 0;
    for (let k = 0; k < samples.length; k += 2) {
      const d = Math.hypot(samples[k] - c[0], samples[k + 1] - c[1]);
      if (d < c[2] - tol) ins++; else if (d > c[2] + tol) outs++;
      if (ins && outs) return -1;
    }
    return ins ? 1 : 0;
  }
  const same = (c, d) => Math.hypot(c[0] - d[0], c[1] - d[1]) < 1e-3 && Math.abs(c[2] - d[2]) < 1e-3;
  const disks = [];
  for (let i = 0; i < n; i++) {
    const mine = [];
    for (let gi = 0; gi < conj.length && mine.length < 2; gi++) {
      const Gm = conjM[gi];
      for (let j = 0; j < n && mine.length < 2; j++) {
        if (j === i && gi === 0) continue;
        const Q = mmul(mmul(Gm, perms[j]), minv(Gm));
        for (const Qs of [Q, minv(Q)]) {
          const Pr = mmul(perms[i], Qs);
          if (!isParabolic(Pr)) continue;
          const c = circumcircle(parabolicFix(perms[i]), parabolicFix(Q), parabolicFix(Pr));
          if (!c || c[2] > 50 || c[2] < 1e-3 || mine.some((m) => same(m, c))) continue;
          const side = emptySide(c);
          if (side < 0) continue;
          mine.push([...c, side]);
        }
      }
    }
    for (const m of mine) if (!disks.some((d) => same(d, m))) disks.push(m);
  }
  return disks;
}

/** Image of the disk (cx, cy, r) under M, or null if M's pole lies inside it. */
export function imageDisk(M, [cx, cy, r]) {
  const [, , c, d] = M;
  if (abs2(c) < 1e-20) {
    const z = apply(M, [cx, cy]), w = apply(M, [cx + r, cy]);
    return [z[0], z[1], Math.hypot(w[0] - z[0], w[1] - z[1])];
  }
  const pole = scale(div(d, c), -1);
  const dx = pole[0] - cx, dy = pole[1] - cy, d2 = dx * dx + dy * dy;
  if (d2 <= r * r * (1 + 1e-9)) return null;
  // The pole's reflection in the circle is mapped to the image's centre.
  const s = (r * r) / d2;
  const C = apply(M, [cx + dx * s, cy + dy * s]);
  const P = apply(M, [cx + r, cy]);
  return [C[0], C[1], Math.hypot(P[0] - C[0], P[1] - C[1])];
}

/**
 * The orbit of some ordinary-set disks under the group, breadth-first:
 * every disk's images under a, b, A, B, kept while their radius is ≥ minR
 * and their centre lies within `bound` of `center`. For a double cusp group
 * the orbit of the cusp chains' disks is every component of the ordinary set.
 */
export function orbitDisks(gens, seeds, { minR, center = [0, 0], bound = 6, max = 400000 }) {
  const key = (d) => `${Math.round(d[0] * 1e6)},${Math.round(d[1] * 1e6)},${Math.round(d[2] * 1e6)}`;
  const seen = new Set();
  const out = [];
  for (const d of seeds) {
    const k = key(d);
    if (!seen.has(k)) { seen.add(k); out.push(d); }
  }
  for (let h = 0; h < out.length && out.length < max; h++) {
    for (const g of gens) {
      const e = imageDisk(g, out[h]);
      if (!e || e[2] < minR || Math.hypot(e[0] - center[0], e[1] - center[1]) > bound) continue;
      const k = key(e);
      if (!seen.has(k)) { seen.add(k); out.push(e); }
    }
  }
  return out;
}
