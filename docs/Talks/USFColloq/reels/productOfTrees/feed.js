/**
 * feed.js — the feed loop as a pure function of time (seek = play).
 *
 *   0.6 – 5.4   the two trees grow out of the white vertex, a layer at a time
 *   5.8 – 13.0  copies of the first tree slide out along every edge of the second, sweeping out squares
 *  13.6 – 19.6  a rotation about the white vertex in both trees at once (order 3 and order 4): a "4D" turn
 *  20.0 – 21.2  a line in each tree lights up gold
 *  21.4 – 25.0  both trees straighten along their gold lines
 *  24.2 – 26.4  the product of the two lines fills in gold: a flat, lying flat
 *  26.8 – 33.8  the whole complex slides along the flat: one step diagonally, then one step the other way
 *  34.4 – 45.4  everything folds back: round again, the gold fades, the squares sweep back, the trees shrink
 *
 * Every state at a whole step (a full turn, a whole slide) is the same picture as the start, so the
 * values below drop back to 0 there without a visible jump.
 */
export const FEED_T = 46;

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const mod = (a, n) => ((a % n) + n) % n;

export const BEATS = {
  grow: [0.6, 5.4], sweep: [5.8, 13.0], turn: [13.6, 19.6],
  linesIn: [20.0, 21.2], straighten: [21.4, 25.0], flatIn: [24.2, 26.4],
  slides: [[26.8, 30.0, 1, 1], [30.6, 33.8, 1, -1]],
  bend: [34.4, 37.8], flatOut: [36.4, 38.2], unsweep: [38.2, 42.4], shrink: [42.4, 45.4],
};

// camera keys: t, azimuth, elevation, radius to fit, look-at height
const CAM = [
  [0.0, 0.62, 0.28, 1.75, 0.20],
  [5.4, 0.74, 0.30, 2.00, 0.25],
  [13.0, 0.98, 0.34, 2.25, 0.30],
  [19.6, 1.22, 0.30, 2.25, 0.30],
  [21.2, 1.18, 0.36, 2.30, 0.28],
  [25.4, 1.00, 0.62, 2.80, 0.25],
  [29.8, 0.80, 0.66, 2.80, 0.25],
  [33.6, 0.64, 0.64, 2.80, 0.25],
  [38.2, 0.46, 0.40, 2.40, 0.30],
  [42.4, 0.50, 0.32, 2.10, 0.25],
];

/** Periodic Catmull–Rom through the keys (non-uniform times, so tangents use the real gaps). */
function camAt(t) {
  const n = CAM.length, T = FEED_T;
  let j = n - 1;
  for (let q = 0; q < n; q++) if (CAM[q][0] <= t) j = q;
  const k0 = CAM[(j - 1 + n) % n], k1 = CAM[j], k2 = CAM[(j + 1) % n], k3 = CAM[(j + 2) % n];
  const t0 = k0[0] - (j === 0 ? T : 0), t1 = k1[0];
  let t2 = k2[0], t3 = k3[0];
  if (t2 <= t1) t2 += T;
  if (t3 <= t2) t3 += T;
  let tt = t; if (tt < t1) tt += T;
  const u = (tt - t1) / (t2 - t1), u2 = u * u, u3 = u2 * u;
  const out = [];
  for (let c = 1; c < 5; c++) {
    const m1 = ((k2[c] - k0[c]) / (t2 - t0)) * (t2 - t1), m2 = ((k3[c] - k1[c]) / (t3 - t1)) * (t2 - t1);
    out.push((2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * m2);
  }
  return { az: out[0], el: out[1], fit: out[2], ty: out[3] };
}

/**
 * The display state at time t of the loop, for a product of balls of radius R.
 * gamma, sigma ∈ [0, R]: how far the trees have grown and the squares have swept (per layer, linear).
 * turn ∈ [0, 1): fraction of the rotation about the white vertex. lines, eta ∈ [0, 1]: the gold lines
 * in the two trees, and the gold flat they span.
 * mu ∈ [0, 1]: round → straight. c1, c2 ∈ (−1, 1): how far each tree has slid along its line.
 */
export function feedState(t, R) {
  t = mod(t, FEED_T);
  const B = BEATS;
  const S = {};
  S.gamma = R * (t < B.shrink[0] ? ramp(t, ...B.grow) : 1 - ramp(t, ...B.shrink));
  S.sigma = R * (t < B.unsweep[0] ? ramp(t, ...B.sweep) : 1 - ramp(t, ...B.unsweep));
  S.turn = t > B.turn[0] && t < B.turn[1] ? ease(ramp(t, ...B.turn)) : 0;
  S.lines = ramp(t, ...B.linesIn) * (1 - ramp(t, ...B.flatOut));
  S.eta = ramp(t, ...B.flatIn) * (1 - ramp(t, ...B.flatOut));
  S.mu = ease(ramp(t, ...B.straighten)) * (1 - ease(ramp(t, ...B.bend)));
  S.c1 = 0; S.c2 = 0;
  for (const [a, b, d1, d2] of B.slides) {
    if (t > a && t < b) { const e = ease(ramp(t, a, b)); S.c1 = d1 * e; S.c2 = d2 * e; }
  }
  S.cam = camAt(t);
  return S;
}
