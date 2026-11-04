// 3D curves for known knots and links. Each builder returns an array of closed polylines
// (Float64Array of x,y,z triples), in arbitrary units centered near the origin; the app rescales
// and relaxes them. The same curves serve as reference diagrams for the knot table (projected along z).

// ── plats: strands at x = 0..n−1 running down through crossings, closed by caps above and cups below ──
// word: list of nonzero integers ±i, meaning σ_i^{±1} acting on positions i−1 and i (1-based i).
// topPairs / bottomPairs: position pairs joined by nested semicircles (must not cross each other).
export function platCurves(n, word, topPairs, bottomPairs, { bump = 0.32, samples = 10 } = {}) {
  const m = word.length;
  const partnerTop = new Map(), partnerBot = new Map();
  for (const [a, b] of topPairs) { partnerTop.set(a, b); partnerTop.set(b, a); }
  for (const [a, b] of bottomPairs) { partnerBot.set(a, b); partnerBot.set(b, a); }

  // step through crossing level k (between y = −k and y = −k−1), entering at position p
  const stepDown = (k, p, pts) => {
    const g = word[k], i = Math.abs(g) - 1; // positions i, i+1
    if (p !== i && p !== i + 1) { pts.push([p, -k - 0.5, 0], [p, -k - 1, 0]); return p; }
    const q = p === i ? i + 1 : i;
    const backslash = p === i; // going down-right is the "\" strand
    const over = (g > 0) === backslash;
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * t); // eased horizontal motion
      pts.push([p + (q - p) * e, -k - t, (over ? 1 : -1) * bump * Math.sin(Math.PI * t)]);
    }
    return q;
  };
  const stepUp = (k, p, pts) => { // through level k going up (from y = −k−1 to y = −k)
    const g = word[k], i = Math.abs(g) - 1;
    if (p !== i && p !== i + 1) { pts.push([p, -k - 0.5, 0], [p, -k, 0]); return p; }
    const q = p === i ? i + 1 : i;
    // going up from p to q is the same geometric strand as going down from q to p
    const backslash = q === i;
    const over = (g > 0) === backslash;
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
      pts.push([p + (q - p) * e, -k - 1 + t, (over ? 1 : -1) * bump * Math.sin(Math.PI * (1 - t))]);
    }
    return q;
  };
  const arc = (a, b, y0, upward, pts) => { // semicircle from position a to b at height y0
    const c = (a + b) / 2, r = Math.abs(b - a) / 2;
    const ns = Math.max(6, Math.round(8 * r));
    for (let s = 1; s <= ns; s++) {
      const th = Math.PI * s / ns;
      const x = c + (a < b ? -1 : 1) * r * Math.cos(th);
      pts.push([x, y0 + (upward ? 1 : -1) * r * Math.sin(th) * 0.9, 0]);
    }
  };

  const visitedTop = new Set();
  const curves = [];
  for (const [a0] of topPairs) {
    if (visitedTop.has(a0)) continue;
    const pts = [];
    let p = a0;
    let guard = 0;
    while (guard++ < 1000) {
      visitedTop.add(p);
      pts.push([p, 0, 0]);
      for (let k = 0; k < m; k++) p = stepDown(k, p, pts);
      const q = partnerBot.get(p);
      arc(p, q, -m, false, pts);
      p = q;
      for (let k = m - 1; k >= 0; k--) p = stepUp(k, p, pts);
      const r = partnerTop.get(p);
      visitedTop.add(p);
      arc(p, r, 0, true, pts);
      p = r;
      if (p === a0) break;
    }
    pts.pop(); // last point repeats the first
    curves.push(dedupe(pts));
  }
  return curves.map(c => center(c, n, m));
}

function dedupe(pts) {
  const out = [];
  for (const q of pts) {
    const l = out[out.length - 1];
    if (l && Math.hypot(l[0] - q[0], l[1] - q[1], l[2] - q[2]) < 1e-9) continue;
    out.push(q);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9) out.pop();
  }
  return out;
}

function center(pts, n, m) {
  const f = new Float64Array(pts.length * 3);
  pts.forEach((q, i) => { f[3 * i] = q[0] - (n - 1) / 2; f[3 * i + 1] = q[1] + m / 2; f[3 * i + 2] = q[2]; });
  return f;
}

// 2-bridge (rational) knot or link from Conway notation [a1 … an] as a 4-plat
// σ2^{a1} σ1^{−a2} σ2^{a3} …, using an odd-length continued fraction.
export function rationalCurves(conway) {
  let a = conway.slice();
  if (a.length % 2 === 0) { // [… x, y] = [… x, y − 1, 1], and [… x, 1] = [… x + 1]
    const last = a[a.length - 1];
    if (last === 1) { a.pop(); a[a.length - 1] += 1; } else { a[a.length - 1] = last - 1; a.push(1); }
  }
  const word = [];
  a.forEach((k, idx) => {
    const g = idx % 2 === 0 ? 2 : -1;
    for (let r = 0; r < k; r++) word.push(g);
  });
  return platCurves(4, word, [[0, 1], [2, 3]], [[0, 1], [2, 3]]);
}

// Pretzel link P(p1, …, pk): vertical twist columns on positions (2j, 2j+1); column j's right strand
// joins column j+1's left strand at top and bottom; the outer strands join over the top/bottom.
export function pretzelCurves(ps) {
  const k = ps.length, n = 2 * k;
  const word = [];
  ps.forEach((p, j) => { for (let r = 0; r < Math.abs(p); r++) word.push(Math.sign(p) * (2 * j + 1)); });
  const pairs = [[0, n - 1]];
  for (let j = 0; j < k - 1; j++) pairs.push([2 * j + 1, 2 * j + 2]);
  return platCurves(n, word, pairs, pairs);
}

// Closure of a braid word on n strands (σ_i^{±1} as ±i), closed around the right-hand side.
export function braidClosureCurves(n, word, { bump = 0.32, samples = 10 } = {}) {
  const m = word.length;
  const perm = [];
  // trace strands: position p at top → position at bottom
  const segs = []; // per start position, list of points through the braid
  for (let p0 = 0; p0 < n; p0++) {
    let p = p0;
    const pts = [[p, 0, 0]];
    for (let k = 0; k < m; k++) {
      const g = word[k], i = Math.abs(g) - 1;
      if (p !== i && p !== i + 1) { pts.push([p, -k - 1, 0]); continue; }
      const q = p === i ? i + 1 : i;
      const over = (g > 0) === (p === i);
      for (let s = 1; s <= samples; s++) {
        const t = s / samples, e = 0.5 - 0.5 * Math.cos(Math.PI * t);
        pts.push([p + (q - p) * e, -k - t, (over ? 1 : -1) * bump * Math.sin(Math.PI * t)]);
      }
      p = q;
    }
    perm[p0] = p;
    segs[p0] = pts;
  }
  // closure: from bottom position p go down, right, up and back left to top position p (nested loops)
  const s = 0.9;
  const closing = p => {
    const off = (n - p) * s;
    const xr = n - 1 + off, yb = -m - off, yt = off;
    const out = [];
    const line = (a, b, steps) => { for (let i = 1; i <= steps; i++) { const t = i / steps; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]); } };
    line([p, -m, 0], [p, yb, 0], 3);
    line([p, yb, 0], [xr, yb, 0], 6);
    line([xr, yb, 0], [xr, yt, 0], 10);
    line([xr, yt, 0], [p, yt, 0], 6);
    line([p, yt, 0], [p, 0, 0], 3);
    out.pop();
    return out;
  };
  const used = new Set();
  const curves = [];
  for (let p0 = 0; p0 < n; p0++) {
    if (used.has(p0)) continue;
    const pts = [];
    let p = p0;
    do {
      used.add(p);
      pts.push(...segs[p]);
      const q = perm[p];
      pts.push(...closing(q));
      p = q;
    } while (p !== p0);
    curves.push(dedupe(pts));
  }
  return curves.map(c => center(c, n, m));
}

export function torusKnotCurves(p, q) { // T(p,q) as the closure of (σ1⋯σ_{p−1})^q
  const word = [];
  for (let r = 0; r < q; r++) for (let i = 1; i < p; i++) word.push(i);
  return braidClosureCurves(p, word);
}

// ── smooth parametric presets (already nice, no relaxation needed) ──

export function parametric(f, N = 240) {
  const out = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = f((2 * Math.PI * i) / N);
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
  return out;
}

export const PRESETS = {
  unknot: () => [parametric(t => [Math.cos(t), Math.sin(t), 0])],
  trefoil: () => [parametric(t => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)])],
  figureEight: () => [parametric(t => [(2 + Math.cos(2 * t)) * Math.cos(3 * t), (2 + Math.cos(2 * t)) * Math.sin(3 * t), Math.sin(4 * t)], 300)],
  torus: (p, q) => [parametric(t => {
    const r = 2 + 0.9 * Math.cos(q * t);
    return [r * Math.cos(p * t), r * Math.sin(p * t), 0.9 * Math.sin(q * t)];
  }, Math.max(200, 50 * (p + q)))],
  hopf: () => [
    parametric(t => [Math.cos(t) - 0.5, Math.sin(t), 0], 160),
    parametric(t => [Math.cos(t) + 0.5, 0, Math.sin(t)], 160),
  ],
  borromean: () => [
    parametric(t => [1.6 * Math.cos(t), Math.sin(t), 0], 180),
    parametric(t => [0, 1.6 * Math.cos(t), Math.sin(t)], 180),
    parametric(t => [Math.sin(t), 0, 1.6 * Math.cos(t)], 180),
  ],
};
