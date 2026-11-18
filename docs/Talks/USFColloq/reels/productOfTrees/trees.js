/**
 * trees.js — the k-regular tree T_k around a base vertex o, with a marked line through o, drawn two ways.
 *
 * Names. The marked line is …, a₋₁, a₀ = o, a₁, a₂, …. Every vertex v projects to one aᵢ, and
 * v = (i, path): path[0] picks one of the k − 2 edges at aᵢ that leave the line, and each later entry
 * picks one of the k − 1 edges going further out. So |v| = d(o, v) = |i| + path.length, and the
 * translation g along the line is simply (i, path) ↦ (i + 1, path).
 *
 * Pictures (both in the plane of the tree, x along the line):
 *   round     the Cayley-graph drawing about o: the k edges at every vertex at equal angles 2π/k, and
 *             edges m steps out of length L1·rr^{m−1} (for k = 4 this is the usual picture of F₂).
 *             Turning it by 2π/k about o is an isometry of T_k.
 *   straight  the line drawn straight, aᵢ at (i·L, 0), with the same branches hanging off every aᵢ
 *             (drawn the same way, starting from length l1), so g is a rigid shift by L.
 * Both pictures keep the cyclic order of the edges at every vertex. `layout` blends them edge by edge
 * (angle and length), so the tree unfolds smoothly from one picture into the other.
 */
export const TAU = 2 * Math.PI;
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };   // to [−π, π)
const ccw = (a, from) => (((a - from) % TAU) + TAU) % TAU;

export const GEOM = {
  L1: 1.0,     // round: length of o's edges
  L: 1.0,      // straight: spacing along the line
};
// per valence: shrink per level (small enough that branches never touch, the turn between edges being
// 2π/k), and the first edge off the line in the straight picture (short enough to clear the neighbours)
export const SHRINK = { 3: 0.56, 4: 0.48, 5: 0.34, 6: 0.32 };
export const BRANCH = { 3: 0.6, 4: 0.55, 5: 0.42, 6: 0.4 };

/** Size of the ball of radius r in T_k. */
export const ballSize = (k, r) => (r <= 0 ? 1 : 1 + k * ((k - 1) ** r - 1) / (k - 2));

/**
 * The ball of radius R + 1 about o (the outer layer is only ever drawn while it fades in or out).
 * Vertices come parents-first. Each has: i, path, d (= path.length), dist (= |i| + d), parent, children,
 * and the edge from its parent in both pictures (thr, lr round; tha, la straight; dth = the turn between).
 */
export function buildTree(k, R, geom = {}) {
  if (k < 3) throw new Error('k must be at least 3');
  const G = { ...GEOM, rr: SHRINK[k] ?? 0.28, l1: BRANCH[k] ?? 0.36, ...geom };
  const B = Math.ceil(k / 2);                       // o's edge to a₋₁; edge 0 goes to a₁
  const th0 = Math.PI / 2 - (Math.PI * B) / k;      // so that a₁ and a₋₁ sit symmetrically about the vertical
  const RMAX = R + 1;
  const turn = c => -Math.PI + (TAU * (c + 1)) / k; // child c's direction, relative to the edge coming in
  // the branch directions off the line: exactly o's other edges in the round picture
  const fanJ = [];
  for (let j = 1; j < k; j++) if (j !== B) fanJ.push(j);
  const fan = fanJ.map(j => th0 + (TAU * j) / k);

  const verts = [];
  const add = o => { o.id = verts.length; verts.push(o); if (o.parent >= 0) verts[o.parent].children.push(o.id); return o; };
  add({ i: 0, path: [], d: 0, dist: 0, parent: -1, children: [], th: 0, pr: [0, 0], pa: [0, 0], ath: 0 });

  for (let q = 0; q < verts.length; q++) {
    const v = verts[q];
    if (v.dist >= RMAX) continue;
    // round picture: the children's directions, in counterclockwise order
    const thetas = v.parent < 0
      ? Array.from({ length: k }, (_, j) => th0 + (TAU * j) / k)
      : Array.from({ length: k - 1 }, (_, c) => v.th + turn(c));
    const lr = G.L1 * G.rr ** v.dist;
    // straight picture: who the children are, in the same counterclockwise order
    let kids;
    if (v.parent < 0) {
      kids = thetas.map((_, j) => {
        if (j === 0) return { i: 1, path: [], pa: [G.L, 0], ath: 0 };
        if (j === B) return { i: -1, path: [], pa: [-G.L, 0], ath: Math.PI };
        const b = fanJ.indexOf(j);
        return { i: 0, path: [b], pa: [G.l1 * Math.cos(fan[b]), G.l1 * Math.sin(fan[b])], ath: fan[b] };
      });
    } else if (v.d === 0) {
      const sg = Math.sign(v.i), back = sg > 0 ? Math.PI : 0, x = v.i * G.L;
      const opts = [{ dir: sg > 0 ? 0 : Math.PI, i: v.i + sg, path: [], pa: [(v.i + sg) * G.L, 0], ath: sg > 0 ? 0 : Math.PI }];
      fan.forEach((a, b) => opts.push({ dir: a, i: v.i, path: [b], pa: [x + G.l1 * Math.cos(a), G.l1 * Math.sin(a)], ath: a }));
      opts.sort((p, r) => ccw(p.dir, back) - ccw(r.dir, back));
      kids = opts;
    } else {
      const la = G.l1 * G.rr ** v.d;
      kids = thetas.map((_, c) => {
        const a = v.ath + turn(c);
        return { i: v.i, path: v.path.concat(c), pa: [v.pa[0] + la * Math.cos(a), v.pa[1] + la * Math.sin(a)], ath: a };
      });
    }
    kids.forEach((id, c) => {
      const d = id.path.length, dist = Math.abs(id.i) + d;
      add({
        i: id.i, path: id.path, d, dist, parent: v.id, children: [],
        th: thetas[c], pr: [v.pr[0] + lr * Math.cos(thetas[c]), v.pr[1] + lr * Math.sin(thetas[c])],
        pa: id.pa, ath: id.ath,
      });
    });
  }
  for (const v of verts) {
    if (v.parent < 0) continue;
    const p = verts[v.parent];
    const rx = v.pr[0] - p.pr[0], ry = v.pr[1] - p.pr[1], ax = v.pa[0] - p.pa[0], ay = v.pa[1] - p.pa[1];
    v.thr = Math.atan2(ry, rx); v.lr = Math.hypot(rx, ry);
    v.tha = Math.atan2(ay, ax); v.la = Math.hypot(ax, ay);
    v.dth = wrap(v.tha - v.thr);
  }
  const key = (i, path) => i + ':' + path.join('.');
  const index = new Map(verts.map(v => [key(v.i, v.path), v.id]));
  return {
    k, R, G, verts, index, key,
    root: 0,
    nbrs: verts[0].children.slice(),                              // o's k neighbours, counterclockwise
    edges: verts.filter(v => v.parent >= 0).map(v => [v.parent, v.id]),
    fan, th0, B,
  };
}

/**
 * Positions of every vertex at blend mu (0 round, 1 straight), with the round picture turned by phi
 * and the straight one shifted c steps along the line. Writes into out (an array of [x, y]).
 * The turn unwinds as mu goes to 1, so straightening always ends at the same straight picture.
 */
export function layout(T, mu, phi, c, out) {
  const V = T.verts;
  if (!out) out = V.map(() => [0, 0]);
  out[0][0] = 0; out[0][1] = 0;
  const rot = phi * (1 - mu);
  for (let n = 1; n < V.length; n++) {
    const v = V[n], p = out[v.parent];
    const th = v.thr + rot + mu * v.dth, l = v.lr + (v.la - v.lr) * mu;
    out[n][0] = p[0] + l * Math.cos(th);
    out[n][1] = p[1] + l * Math.sin(th);
  }
  if (c) { const s = c * T.G.L; for (const o of out) o[0] += s; }
  return out;
}

/** Distance from the middle of the frame once the tree has been slid c steps along its line. */
export const slotDist = (v, c) => Math.abs(v.i + c) + v.d;

/** The vertex ids of the marked line, in order (a₋ₙ … a₀ … aₙ). */
export function lineIds(T) {
  return T.verts.filter(v => v.d === 0).sort((a, b) => a.i - b.i).map(v => v.id);
}

/** Where (i, path) goes under g^s (s an integer): the id in this pool, or −1 if it leaves the pool. */
export function shiftId(T, id, s) {
  const v = T.verts[id], j = T.index.get(T.key(v.i + s, v.path));
  return j === undefined ? -1 : j;
}
