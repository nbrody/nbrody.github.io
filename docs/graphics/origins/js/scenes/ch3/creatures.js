// creatures.js — Chapter 3, 38–72 s: the parade of body plans.
//
// Each animal is a hand-traced outline (side views facing right; a trilobite
// from above) that starts at the nose and runs along the back first. Outlines
// are smoothed, resampled to the same number of points by arc length, and
// morphed point by point — so a fish becomes a four-legged walker, which
// becomes a dinosaur, which (after the asteroid) becomes a mammal.

import { SHAPE } from '../../gfx/renderer.js';
import { hash, lerp } from '../../lib/math.js';

const NPTS = 220;

// Control points: x in [-1, 1] (head at +x), y up.
const OUTLINES = {
  trilobite: [
    [1.0, 0], [0.95, 0.22], [0.82, 0.38], [0.62, 0.47], [0.45, 0.5], [0.36, 0.53], [0.12, 0.58], [0.28, 0.46],
    [0.2, 0.45], [0.12, 0.47], [0.02, 0.43], [-0.08, 0.45], [-0.18, 0.41], [-0.28, 0.42], [-0.38, 0.38], [-0.48, 0.37],
    [-0.6, 0.31], [-0.73, 0.21], [-0.82, 0.09], [-0.85, 0],
    [-0.82, -0.09], [-0.73, -0.21], [-0.6, -0.31], [-0.48, -0.37], [-0.38, -0.38], [-0.28, -0.42], [-0.18, -0.41],
    [-0.08, -0.45], [0.02, -0.43], [0.12, -0.47], [0.2, -0.45], [0.28, -0.46], [0.12, -0.58], [0.36, -0.53],
    [0.45, -0.5], [0.62, -0.47], [0.82, -0.38], [0.95, -0.22],
  ],
  fish: [
    [1.0, 0.02], [0.9, 0.15], [0.72, 0.26], [0.5, 0.32], [0.3, 0.36], [0.16, 0.62], [0.04, 0.6], [0.0, 0.34],
    [-0.2, 0.28], [-0.4, 0.2], [-0.55, 0.12], [-0.66, 0.08], [-0.8, 0.28], [-0.98, 0.46], [-0.9, 0.2], [-0.8, 0.0],
    [-0.9, -0.2], [-0.98, -0.44], [-0.8, -0.27], [-0.66, -0.08], [-0.46, -0.14], [-0.42, -0.3], [-0.3, -0.24],
    [-0.2, -0.22], [0.0, -0.26], [0.2, -0.28], [0.3, -0.29], [0.22, -0.45], [0.38, -0.33], [0.6, -0.25],
    [0.8, -0.16], [0.95, -0.06],
  ],
  tetrapod: [
    [1.0, 0.0], [0.92, 0.1], [0.74, 0.16], [0.55, 0.15], [0.3, 0.18], [0.0, 0.2], [-0.3, 0.16], [-0.55, 0.1],
    [-0.8, 0.04], [-1.0, 0.0], [-0.8, -0.03], [-0.55, -0.05], [-0.42, -0.08], [-0.4, -0.33], [-0.32, -0.4],
    [-0.22, -0.38], [-0.24, -0.1], [0.0, -0.1], [0.2, -0.1], [0.3, -0.1], [0.32, -0.35], [0.42, -0.4],
    [0.47, -0.37], [0.42, -0.1], [0.6, -0.08], [0.85, -0.06],
  ],
  sauropod: [
    [1.0, 0.7], [0.95, 0.79], [0.86, 0.78], [0.72, 0.62], [0.55, 0.42], [0.4, 0.3], [0.2, 0.28], [0.0, 0.3],
    [-0.2, 0.26], [-0.45, 0.14], [-0.7, 0.02], [-1.0, -0.08], [-0.7, -0.05], [-0.45, 0.0], [-0.3, -0.03],
    [-0.31, -0.5], [-0.16, -0.5], [-0.15, -0.1], [0.0, -0.12], [0.12, -0.12], [0.2, -0.1], [0.2, -0.5],
    [0.33, -0.5], [0.33, -0.05], [0.42, 0.15], [0.58, 0.32], [0.76, 0.55], [0.9, 0.66], [0.97, 0.66],
  ],
  mammal: [
    [1.0, 0.12], [0.92, 0.2], [0.8, 0.26], [0.72, 0.3], [0.68, 0.46], [0.6, 0.3], [0.4, 0.28], [0.1, 0.3],
    [-0.2, 0.28], [-0.4, 0.24], [-0.55, 0.26], [-0.85, 0.32], [-1.0, 0.24], [-0.85, 0.2], [-0.56, 0.12],
    [-0.5, 0.05], [-0.46, -0.2], [-0.5, -0.44], [-0.4, -0.45], [-0.34, -0.2], [-0.3, 0.0], [-0.1, -0.02],
    [0.15, -0.02], [0.3, 0.0], [0.33, -0.44], [0.43, -0.45], [0.42, 0.02], [0.55, 0.05], [0.7, 0.08],
    [0.85, 0.07], [0.96, 0.08],
  ],
};
const EYES = { trilobite: [0.62, 0.25], fish: [0.72, 0.1], tetrapod: [0.8, 0.08], sauropod: [0.9, 0.74], mammal: [0.84, 0.19] };
export const COLORS = {
  trilobite: [1.0, 0.7, 0.35], fish: [0.35, 0.85, 1.0], tetrapod: [0.45, 1.0, 0.6],
  sauropod: [0.85, 0.95, 0.45], mammal: [1.0, 0.75, 0.5],
};

/** Closed Catmull-Rom → dense polyline → resampled by arc length to n points. */
function resample(ctrl, n = NPTS) {
  const dense = [];
  const m = ctrl.length;
  for (let i = 0; i < m; i++) {
    const p0 = ctrl[(i - 1 + m) % m], p1 = ctrl[i], p2 = ctrl[(i + 1) % m], p3 = ctrl[(i + 2) % m];
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      dense.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
  }
  return out;
}

const SHAPES = Object.fromEntries(Object.entries(OUTLINES).map(([k, v]) => [k, resample(v)]));

/** Per-creature motion, applied to outline points (x, y in shape units). */
function animate(kind, pts, t) {
  return pts.map(([x, y]) => {
    if (kind === 'fish') return [x, y + 0.07 * Math.sin(3.2 * x - t * 7) * (0.6 - 0.4 * x)];
    if (kind === 'trilobite') return [x + 0.01 * Math.sin(t * 9 + y * 20), y * (1 + 0.02 * Math.sin(t * 3))];
    const legs = y < -0.12;
    if (kind === 'tetrapod' && legs) {
      const ph = x > 0 ? 0 : Math.PI;
      return [x + 0.06 * Math.sin(t * 4 + ph), y + 0.02 * Math.max(0, Math.sin(t * 4 + ph))];
    }
    if (kind === 'tetrapod') return [x, y + 0.03 * Math.sin(x * 4 - t * 4)];
    if (kind === 'sauropod') {
      const ph = x > 0 ? 0 : Math.PI;
      const neck = Math.max(0, x - 0.4);
      return [x + (legs ? 0.05 * Math.sin(t * 2.2 + ph) : 0), y + 0.04 * Math.sin(t * 1.3) * neck * 2 + 0.01 * Math.sin(t * 4.4)];
    }
    if (kind === 'mammal') {
      const ph = x > 0 ? 0 : Math.PI * 0.7;
      const bob = 0.04 * Math.sin(t * 9);
      return [x + (legs ? 0.1 * Math.sin(t * 9 + ph) : 0), y + bob + (legs ? 0.03 * Math.max(0, Math.sin(t * 9 + ph)) : 0)];
    }
    return [x, y];
  });
}

/**
 * Draw the creature morphing from `a` to `b` by `k` (0..1).
 * xf = { x, y, s (px per unit), flip } — screen placement.
 */
export function drawCreature(R, { a, b, k, t, xf, alpha }) {
  if (alpha <= 0.001) return;
  const ka = animate(a, SHAPES[a], t), kb = animate(b, SHAPES[b], t);
  const e = k * k * (3 - 2 * k);
  const pts = ka.map((p, i) => [lerp(p[0], kb[i][0], e), lerp(p[1], kb[i][1], e)]);
  const ca = COLORS[a], cb = COLORS[b];
  const col = [lerp(ca[0], cb[0], e), lerp(ca[1], cb[1], e), lerp(ca[2], cb[2], e)];
  const sx = (x) => xf.x + x * xf.s, sy = (y) => xf.y - y * xf.s;
  // fill, on the 2D layer
  const g = R.begin2D();
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))));
  g.closePath();
  const grad = g.createRadialGradient(xf.x, xf.y, 0, xf.x, xf.y, xf.s * 1.1);
  const c255 = col.map((v) => Math.round(v * 255));
  grad.addColorStop(0, `rgba(${c255},${0.2 * alpha})`);
  grad.addColorStop(1, `rgba(${c255},${0.05 * alpha})`);
  g.fillStyle = grad;
  g.fill();
  R.flush2D(1.2);
  // glowing outline
  const L = R.lines, S = R.sprites;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    L.add(sx(p[0]), sy(p[1]), sx(q[0]), sy(q[1]), 5, col, alpha * 0.16, col, alpha * 0.16, 1);
    L.add(sx(p[0]), sy(p[1]), sx(q[0]), sy(q[1]), 1.1, [col[0] * 1.4, col[1] * 1.4, col[2] * 1.4], alpha, [col[0] * 1.4, col[1] * 1.4, col[2] * 1.4], alpha, 0);
  }
  L.flush('add');
  // shimmering motes riding the outline
  for (let j = 0; j < 60; j++) {
    const i = Math.floor((hash(j, 7) * NPTS + t * (8 + 10 * hash(j, 8))) % NPTS);
    const p = pts[i];
    const tw = 0.5 + 0.5 * Math.sin(t * (3 + 4 * hash(j, 9)) + j);
    S.add(sx(p[0]), sy(p[1]), 2.5 + 2 * tw, [1, 1, 1], alpha * tw * 0.8, SHAPE.glow);
  }
  // eye
  const ea = EYES[a], eb = EYES[b];
  const ex = lerp(ea[0], eb[0], e), ey = lerp(ea[1], eb[1], e);
  S.add(sx(ex), sy(ey), 7, col, alpha * 0.9, SHAPE.glow);
  S.add(sx(ex), sy(ey), 2.4, [1, 1, 1], alpha, SHAPE.disc);
  S.flush('add');
}

/** A jellyfish: pulsing bell, trailing tentacles (radial symmetry, before bilateral bodies). */
export function drawJellyfish(R, { x, y, s, t, alpha }) {
  if (alpha <= 0.001) return;
  const L = R.lines, S = R.sprites;
  const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 2.2), 2);
  const bw = s * (1 - 0.18 * pulse), bh = s * (0.72 + 0.12 * pulse);
  const col = [0.75, 0.55, 1.0], col2 = [0.4, 0.9, 1.0];
  const bell = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI + (i / 40) * Math.PI;
    const rim = 1 + 0.05 * Math.sin(i * 1.3 + t * 3);
    bell.push([x + Math.cos(a) * bw * rim, y + Math.sin(a) * bh * rim]);
  }
  for (let i = 0; i < bell.length - 1; i++) {
    const [x0, y0] = bell[i], [x1, y1] = bell[i + 1];
    L.add(x0, y0, x1, y1, 6, col, alpha * 0.18, col, alpha * 0.18, 1);
    L.add(x0, y0, x1, y1, 1.3, [1, 0.8, 1.3], alpha, [1, 0.8, 1.3], alpha, 0);
  }
  // scalloped margin
  for (let i = 0; i < 12; i++) {
    const u0 = i / 12, u1 = (i + 1) / 12;
    const xa = x - bw + u0 * 2 * bw, xb = x - bw + u1 * 2 * bw;
    const xm = (xa + xb) / 2;
    L.add(xa, y, xm, y + s * 0.06, 1, col2, alpha * 0.8, col2, alpha * 0.8, 0);
    L.add(xm, y + s * 0.06, xb, y, 1, col2, alpha * 0.8, col2, alpha * 0.8, 0);
  }
  // inner glow of the bell, gonads as four soft arcs
  S.add(x, y - bh * 0.4, bw * 0.9, col, alpha * 0.18, SHAPE.glow);
  for (let k = 0; k < 4; k++) S.add(x + (k - 1.5) * bw * 0.32, y - bh * 0.35, s * 0.1, [1, 0.6, 1.0], alpha * 0.5, SHAPE.ring, 0.2);
  // tentacles
  for (let k = 0; k < 14; k++) {
    const x0 = x - bw * 0.9 + (k / 13) * bw * 1.8;
    let px = x0, py = y + s * 0.04;
    const len = s * (1.6 + 1.2 * hash(k, 3));
    for (let j = 1; j <= 16; j++) {
      const u = j / 16;
      const nx = x0 + Math.sin(t * 1.6 - u * 5 + k) * s * 0.18 * u + (x0 - x) * 0.25 * u * pulse;
      const ny = y + s * 0.04 + u * len * (0.85 + 0.15 * (1 - pulse));
      L.add(px, py, nx, ny, 0.8, col2, alpha * (1 - u) * 0.8, col2, alpha * (1 - u - 1 / 16) * 0.8, 0);
      px = nx; py = ny;
    }
  }
  L.flush('add');
  S.flush('add');
}


/** A creature's resampled outline (for callbacks — memories in Chapter 4). */
export function outlineOf(kind) {
  return SHAPES[kind];
}
