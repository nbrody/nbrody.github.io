// Lemma 5.1 numerics: the Blaschke product B, F = z^D / B, the Cauchy integral over the
// imaginary segment, and the glued interpolant h_*. Complex numbers are [re, im].

export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
export const cabs = (a) => Math.hypot(a[0], a[1]);
export function cpow(z, k) { let r = [1, 0], b = z; while (k > 0) { if (k & 1) r = cmul(r, b); b = cmul(b, b); k >>= 1; } return r; }

// log|B(z)| and B(z) for real nodes x
export function blaschke(x, z) {
  let re = 1, im = 0;
  for (const xi of x) {
    // (z - xi) / (1 - xi z)
    const nr = z[0] - xi, ni = z[1], dr = 1 - xi * z[0], di = -xi * z[1];
    const d = dr * dr + di * di;
    const fr = (nr * dr + ni * di) / d, fi = (ni * dr - nr * di) / d;
    const t = re * fr - im * fi; im = re * fi + im * fr; re = t;
  }
  return [re, im];
}
export function logAbsB(x, z) {
  let s = 0;
  for (const xi of x) s += Math.log(Math.hypot(z[0] - xi, z[1])) - Math.log(Math.hypot(1 - xi * z[0], xi * z[1]));
  return s;
}
export function Ffun(x, D, z) { return cdiv(cpow(z, D), blaschke(x, z)); }
export function logAbsF(x, D, z) { return D * Math.log(Math.hypot(z[0], z[1])) - logAbsB(x, z); }

export function caseSum(x) { return x.reduce((s, t) => s + (1 - t * t) / (1 + t * t), 0); }

// ---------- adaptive Gauss-Kronrod (7-15) along straight complex segments ----------
const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0];
const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975,
  0.417959183673469387755102040816327];

function gk15(f, a, b) { // f: s -> [re, im] on real interval
  const c = (a + b) / 2, h = (b - a) / 2;
  const fc = f(c);
  let kr = [fc[0] * WGK[7], fc[1] * WGK[7]], gr = [fc[0] * WG[3], fc[1] * WG[3]];
  for (let j = 0; j < 7; j++) {
    const f1 = f(c - h * XGK[j]), f2 = f(c + h * XGK[j]);
    kr[0] += WGK[j] * (f1[0] + f2[0]); kr[1] += WGK[j] * (f1[1] + f2[1]);
    if (j % 2 === 1) { const w = WG[(j - 1) / 2]; gr[0] += w * (f1[0] + f2[0]); gr[1] += w * (f1[1] + f2[1]); }
  }
  return { val: [kr[0] * h, kr[1] * h], err: Math.hypot(kr[0] - gr[0], kr[1] - gr[1]) * Math.abs(h) };
}
export function integrate(f, a, b, tol = 1e-13, depth = 0, budget = { n: 4000 }) {
  const r = gk15(f, a, b);
  budget.n--;
  const scale = Math.max(1e-300, Math.hypot(r.val[0], r.val[1]));
  if (r.err <= Math.max(tol, 1e-12 * scale) || depth > 22 || budget.n <= 0) return r.val;
  const m = (a + b) / 2;
  const L = integrate(f, a, m, tol / 2, depth + 1, budget), R = integrate(f, m, b, tol / 2, depth + 1, budget);
  return [L[0] + R[0], L[1] + R[1]];
}

// (1/2 pi i) int_path 6 F(w)/(w - z) dw over a polyline path
export function cauchyPath(x, D, z, path, tol = 1e-13) {
  let tot = [0, 0];
  for (let k = 0; k + 1 < path.length; k++) {
    const w0 = path[k], w1 = path[k + 1], dw = csub(w1, w0);
    const f = (s) => {
      const w = [w0[0] + s * dw[0], w0[1] + s * dw[1]];
      return cmul(cdiv(Ffun(x, D, w), csub(w, z)), dw);
    };
    tot = cadd(tot, integrate(f, 0, 1, tol));
  }
  // multiply by 6/(2 pi i) = -3i/pi
  return [3 * tot[1] / Math.PI, -3 * tot[0] / Math.PI];
}

// The path used for C(z): the segment, or the paper's rectangular detour near ±i
export function contourFor(n, z, side) {
  const U = 1 + 2 / n;
  if (Math.abs(z[0]) < 1 / (10 * n) && Math.abs(Math.abs(z[1]) - 1) < 0.25) {
    const r = -side / n; // detour into the half-plane opposite to z
    if (z[1] > 0) return [[0, -U], [0, 1 - 1 / n], [r, 1 - 1 / n], [r, U], [0, U]];
    return [[0, -U], [r, -U], [r, -1 + 1 / n], [0, -1 + 1 / n], [0, U]];
  }
  return [[0, -U], [0, U]];
}

// Gauss-Legendre 8-point nodes/weights on [-1, 1]
const GL8X = [0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GL8W = [0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

// Precomputed data for one node list: F on a fine Gauss-Legendre rule along Gamma = [-iU, iU].
export class Interp {
  constructor(x, D, panels = 480) {
    this.x = x; this.D = D; this.n = x.length; this.U = 1 + 2 / this.n;
    const U = this.U, h = 2 * U / panels;
    this.panel = h;
    const w = [], f = [];
    for (let k = 0; k < panels; k++) {
      const c = -U + (k + 0.5) * h;
      for (let j = 0; j < 4; j++) for (const sg of [-1, 1]) {
        const u = c + sg * GL8X[j] * h / 2;
        w.push([0, u, GL8W[j] * h / 2]);
        f.push(Ffun(x, D, [0, u]));
      }
    }
    this.nodes = w; this.F = f;
  }
  // (1/2 pi i) int 6F/(w - z) dw; dw = i du
  cauchy(z) {
    const zr = z[0];
    if (Math.abs(zr) > 6 * this.panel || Math.abs(z[1]) > this.U + 6 * this.panel) {
      let re = 0, im = 0;
      for (let k = 0; k < this.nodes.length; k++) {
        const [, u, wt] = this.nodes[k], F = this.F[k];
        // F * i / (iu - z) * wt
        const dr = -z[0], di = u - z[1], d = dr * dr + di * di;
        const qr = (F[0] * dr + F[1] * di) / d, qi = (F[1] * dr - F[0] * di) / d; // F / (iu - z)
        re += -qi * wt; im += qr * wt; // times i
      }
      return [3 * im / Math.PI, -3 * re / Math.PI];
    }
    const side = z[0] >= 0 ? 1 : -1;
    return cauchyPath(this.x, this.D, z, contourFor(this.n, z, side));
  }
  h(z) {
    const side = z[0] >= 0 ? 1 : -1;
    const C = this.cauchy(z), c = side > 0 ? -5 : 1, zD = cpow(z, this.D);
    return csub([c * zD[0], c * zD[1]], cmul(blaschke(this.x, z), C));
  }
}

// Node presets in the x coordinate (eq. (64)); all distinct and nonzero
export function hStar(x, D, z) { return new Interp(x, D).h(z); }

// Gluing check at z = eps + iy, just right of the segment: the right-hand formula of (69) versus the
// left-hand formula continued across Gamma (its contour bulges to the right of z). Relative defect.
export function gluingDefect(x, D, y, eps = 1e-3) {
  const n = x.length, U = 1 + 2 / n, z = [eps, y], zD = cpow(z, D), B = blaschke(x, z);
  const Cr = cauchyPath(x, D, z, [[0, -U], [0, U]]);
  const right = csub([-5 * zD[0], -5 * zD[1]], cmul(B, Cr));
  const bump = 0.08;
  const Cl = cauchyPath(x, D, z, [[0, -U], [0, y - bump], [2 * bump, y - bump], [2 * bump, y + bump], [0, y + bump], [0, U]]);
  const left = csub(zD, cmul(B, Cl));
  return cabs(csub(right, left)) / Math.max(1, cabs(right));
}

export function nodePreset(kind, n, scale = 1) {
  const xs = [];
  const fromT = (t) => t / (1 + Math.sqrt(1 - t * t));
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'spread') x = fromT(Math.cos(Math.PI * (i + 0.5) / n));
    else if (kind === 'cluster') x = fromT(0.3 * Math.cos(Math.PI * (i + 0.5) / n));
    else if (kind === 'clumps') x = i < n / 2 ? -0.93 - 1e-4 * i : 0.9 + 1e-4 * (i - n / 2);
    else { // deterministic pseudo-random
      const u = Math.sin(12.9898 * (i + 1) + 78.233) * 43758.5453; x = 2 * (u - Math.floor(u)) - 1;
      if (Math.abs(x) < 1e-3) x = 1e-3;
    }
    xs.push(x * scale);
  }
  return xs;
}
