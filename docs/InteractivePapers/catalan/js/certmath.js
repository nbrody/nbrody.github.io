// Section 6-7 machinery: the two barrier functions X_kappa, Y_kappa in floating point,
// and an exact (BigInt) re-run of the derivative-numerator / Descartes / bracket certificate.

import { Q } from './catmath.js';
import { CERT } from './certdata.js';

export const ALPHA = 11 / 48, BETA = 7 / 48, GAMMA = 4 / 48, ETA = 2 / 48;

// ---------- complex helpers (floating point) ----------
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const clog = (a) => [0.5 * Math.log(a[0] * a[0] + a[1] * a[1]), Math.atan2(a[1], a[0])];

// Expand a sequence spec into { l: Float64Array, terms: [{ z:[re,im], r:[re,im] }] } including conjugates.
export function expandSeq(spec) {
  const l = spec.l.map((x) => x * 1e-8);
  const terms = [];
  for (const e of spec.exp) {
    const z = [e.z[0] / 1000, e.z[1] / 1000];
    if (e.z[1] === 0) terms.push({ z, r: [e.a * 1e-8, 0] });
    else {
      const r = [e.a * 0.5e-8, -e.b * 0.5e-8];
      terms.push({ z, r });
      terms.push({ z: [z[0], -z[1]], r: [r[0], -r[1]] });
    }
  }
  return { l, terms };
}

// T(u,x) = sum l_k T_k(x)/k - 1/2 sum r_z Log(1 - 2xz + z^2), the log split into its two factors
export function Tseq(u, x) {
  let s = 0, t0 = 1, t1 = x;
  for (let k = 1; k <= u.l.length; k++) {
    s += u.l[k - 1] * t1 / k;
    const t2 = 2 * x * t1 - t0; t0 = t1; t1 = t2;
  }
  if (u.terms.length) {
    const th = Math.acos(Math.max(-1, Math.min(1, x)));
    const e1 = [Math.cos(th), Math.sin(th)], e2 = [Math.cos(th), -Math.sin(th)];
    for (const { z, r } of u.terms) {
      const f1 = cmul(z, e1), f2 = cmul(z, e2);
      const L1 = clog([1 - f1[0], -f1[1]]), L2 = clog([1 - f2[0], -f2[1]]);
      const Lg = [L1[0] + L2[0], L1[1] + L2[1]];
      s -= 0.5 * (r[0] * Lg[0] - r[1] * Lg[1]);
    }
  }
  return s;
}

// S(u,x) = sum l_k x^k/k - sum r_z Log(1 - xz)
export function Sseq(u, x) {
  let s = 0, xk = 1;
  for (let k = 1; k <= u.l.length; k++) { xk *= x; s += u.l[k - 1] * xk / k; }
  for (const { z, r } of u.terms) {
    const Lg = clog([1 - x * z[0], -x * z[1]]);
    s -= r[0] * Lg[0] - r[1] * Lg[1];
  }
  return s;
}

// |u|_*^2 by the finite formula (90)
export function normSq(u) {
  let s = 0;
  for (let k = 1; k <= u.l.length; k++) {
    let cross = 0;
    for (const { z, r } of u.terms) {
      let zk = [1, 0];
      for (let j = 0; j < k; j++) zk = cmul(zk, z);
      cross += r[0] * zk[0] - r[1] * zk[1];
    }
    s += (u.l[k - 1] ** 2 + 2 * u.l[k - 1] * cross) / k;
  }
  for (const A of u.terms) for (const B of u.terms) {
    const zz = cmul(A.z, B.z), rr = cmul(A.r, B.r);
    const Lg = clog([1 - zz[0], -zz[1]]);
    s -= rr[0] * Lg[0] - rr[1] * Lg[1];
  }
  return s;
}

export function caseData(kappa) {
  const c = CERT[kappa];
  return { kappa, lambda: c.lambda, d: c.d, p: expandSeq(c.p), v: expandSeq(c.v) };
}

export function Xfun(cd, x) {
  const { kappa, lambda, p, v } = cd;
  const W = (ALPHA + 2 * GAMMA) * Math.log(Math.abs(x)) + 2 * ETA * Math.log(1 - x)
    - (kappa / 2 + ALPHA + ETA + GAMMA) * Math.log(1 + x * x);
  const D = 2 * GAMMA - 2 * x * x / (1 + x * x);
  return W + lambda * D - 2 * kappa * Tseq(p, x) - Sseq(v, x);
}
export function Yfun(cd, s) {
  return BETA * Math.log(s) + GAMMA * Math.log(1 - s) + 2 * Tseq(cd.v, s);
}
export function normConst(cd) { return cd.kappa * normSq(cd.p) + 0.5 * normSq(cd.v); }

// ---------- exact certificate: Gaussian-rational polynomials ----------

// complex rational
const C0 = { re: Q.ZERO, im: Q.ZERO };
const cq = (re, im = Q.ZERO) => ({ re, im });
const cadd = (a, b) => ({ re: a.re.add(b.re), im: a.im.add(b.im) });
const cmulq = (a, b) => ({ re: a.re.mul(b.re).sub(a.im.mul(b.im)), im: a.re.mul(b.im).add(a.im.mul(b.re)) });
const cscale = (a, q) => ({ re: a.re.mul(q), im: a.im.mul(q) });

// polynomials: arrays of complex rationals, low degree first
const padd = (A, B) => { const n = Math.max(A.length, B.length), R = []; for (let k = 0; k < n; k++) R.push(cadd(A[k] || C0, B[k] || C0)); return R; };
const pmul = (A, B) => {
  const R = new Array(A.length + B.length - 1).fill(C0);
  for (let i = 0; i < A.length; i++) { if (A[i].re.isZero() && A[i].im.isZero()) continue; for (let j = 0; j < B.length; j++) R[i + j] = cadd(R[i + j], cmulq(A[i], B[j])); }
  return R;
};
const pscale = (A, c) => A.map((x) => cmulq(x, c));
const preal = (coeffs) => coeffs.map((q) => cq(q));
const pprod = (list) => list.reduce((acc, P) => pmul(acc, P), [cq(Q.ONE)]);

function exactSeq(spec) {
  const E8 = 100000000n;
  const l = spec.l.map((x) => new Q(BigInt(x), E8));
  const terms = [];
  for (const e of spec.exp) {
    const z = cq(new Q(BigInt(e.z[0]), 1000n), new Q(BigInt(e.z[1]), 1000n));
    if (e.z[1] === 0) terms.push({ z, r: cq(new Q(BigInt(e.a), E8)) });
    else {
      const r = cq(new Q(BigInt(e.a), 2n * E8), new Q(BigInt(-e.b), 2n * E8));
      terms.push({ z, r });
      terms.push({ z: cq(z.re, z.im.neg()), r: cq(r.re, r.im.neg()) });
    }
  }
  return { l, terms };
}

// U_{k-1}(x) as Q coefficient arrays
function chebUq(n) { // U_n
  let a = [Q.ONE], b = [Q.ZERO, new Q(2n)];
  if (n === 0) return a;
  if (n < 0) return [Q.ZERO];
  for (let k = 1; k < n; k++) {
    const c = new Array(k + 2).fill(Q.ZERO);
    for (let i = 0; i < b.length; i++) c[i + 1] = c[i + 1].add(b[i].mulInt(2));
    for (let i = 0; i < a.length; i++) c[i] = c[i].sub(a[i]);
    a = b; b = c;
  }
  return b;
}

const cosFactor = (z) => [cadd(cq(Q.ONE), cmulq(z, z)), cscale(z, new Q(-2n))]; // 1 + z^2 - 2 z x
const linFactor = (z) => [cq(Q.ONE), cscale(z, new Q(-1n))]; // 1 - x z
const X_ = [C0, cq(Q.ONE)];
const ONE_MINUS_X = [cq(Q.ONE), cq(new Q(-1n))];
const ONE_PLUS_X2 = [cq(Q.ONE), C0, cq(Q.ONE)];

// The derivative numerators A_X, A_Y of (93) for case kappa, as BigInt integer coefficient arrays
// (positive rescaling of the exact rational polynomial), plus a flag that the imaginary parts cancel.
export function derivativeNumerators(kappa) {
  const c = CERT[kappa];
  const p = exactSeq(c.p), v = exactSeq(c.v);
  const lam = c.lambdaExact ? new Q(c.lambdaExact[0], c.lambdaExact[1]) : Q.ZERO;
  const powP = (P, e) => { let R = [cq(Q.ONE)]; for (let k = 0; k < e; k++) R = pmul(R, P); return R; };
  const prodExcept = (factors, skip) => pprod(factors.filter((_, k) => k !== skip));

  // ---- A_X ----
  const pCos = p.terms.map((t) => cosFactor(t.z)), vLin = v.terms.map((t) => linFactor(t.z));
  const PP = pprod(pCos), PV = pprod(vLin);
  const core = (e) => pmul(pmul(PP, PV), powP(ONE_PLUS_X2, e)); // (1+x^2)^e * prod * prod
  const QX = pmul(pmul(X_, ONE_MINUS_X), core(3 - kappa));
  let AX = [];
  AX = padd(AX, pscale(pmul(ONE_MINUS_X, core(3 - kappa)), cq(new Q(19n, 48n))));
  AX = padd(AX, pscale(pmul(X_, core(3 - kappa)), cq(new Q(-1n, 12n))));
  AX = padd(AX, pscale(pmul(pmul(X_, pmul(X_, ONE_MINUS_X)), core(2 - kappa)), cq(new Q(-BigInt(48 * kappa + 34), 48n))));
  if (!lam.isZero()) AX = padd(AX, pscale(pmul(pmul(X_, pmul(X_, ONE_MINUS_X)), core(1 - kappa)), cq(lam.mulInt(-4))));
  // -2 kappa t_p(x) Q_X
  const m2k = cq(new Q(BigInt(-2 * kappa)));
  for (let k = 1; k <= p.l.length; k++) AX = padd(AX, pscale(pmul(preal(chebUq(k - 1)), QX), cmulq(m2k, cq(p.l[k - 1]))));
  p.terms.forEach((t, idx) => {
    const rest = pmul(pmul(pmul(X_, ONE_MINUS_X), powP(ONE_PLUS_X2, 3 - kappa)), pmul(prodExcept(pCos, idx), PV));
    AX = padd(AX, pscale(rest, cmulq(m2k, cmulq(t.r, t.z))));
  });
  // - h_v(x) Q_X
  for (let k = 1; k <= v.l.length; k++) {
    const mono = new Array(k).fill(C0); mono[k - 1] = cq(Q.ONE);
    AX = padd(AX, pscale(pmul(mono, QX), cq(v.l[k - 1].neg())));
  }
  v.terms.forEach((t, idx) => {
    const rest = pmul(pmul(pmul(X_, ONE_MINUS_X), powP(ONE_PLUS_X2, 3 - kappa)), pmul(PP, prodExcept(vLin, idx)));
    AX = padd(AX, pscale(rest, cscale(cmulq(t.r, t.z), new Q(-1n))));
  });

  // ---- A_Y ----
  const vCos = v.terms.map((t) => cosFactor(t.z));
  const PVc = pprod(vCos);
  const QY = pmul(pmul(X_, ONE_MINUS_X), PVc);
  let AY = [];
  AY = padd(AY, pscale(pmul(ONE_MINUS_X, PVc), cq(new Q(7n, 48n))));
  AY = padd(AY, pscale(pmul(X_, PVc), cq(new Q(-1n, 12n))));
  for (let k = 1; k <= v.l.length; k++) AY = padd(AY, pscale(pmul(preal(chebUq(k - 1)), QY), cq(v.l[k - 1].mulInt(2))));
  v.terms.forEach((t, idx) => {
    const rest = pmul(pmul(X_, ONE_MINUS_X), prodExcept(vCos, idx));
    AY = padd(AY, pscale(rest, cscale(cmulq(t.r, t.z), new Q(2n))));
  });

  return { AX: toIntegerPoly(AX), AY: toIntegerPoly(AY) };
}

function trimC(P) { let n = P.length; while (n > 1 && P[n - 1].re.isZero() && P[n - 1].im.isZero()) n--; return P.slice(0, n); }

// Clear denominators by a positive integer; report whether all imaginary parts vanished exactly.
function toIntegerPoly(P) {
  P = trimC(P);
  const imagZero = P.every((c) => c.im.isZero());
  let l = 1n;
  const g = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };
  for (const c of P) l = l / g(l, c.re.d) * c.re.d;
  const ints = P.map((c) => c.re.n * (l / c.re.d));
  return { coeffs: ints, degree: ints.length - 1, imagZero };
}

// Descartes transform (94) on (b, c) with b = B/Dn, c = C/Dn; returns sign-variation count
export function descartesCount(A, B, C, Dn) {
  const d0 = A.length - 1;
  const binom = (n) => { const r = [1n]; for (let k = 1; k <= n; k++) r.push(r[k - 1] * BigInt(n - k + 1) / BigInt(k)); return r; };
  let total = new Array(d0 + 1).fill(0n);
  const Bb = BigInt(B), Cb = BigInt(C), Db = BigInt(Dn);
  // (B + C t)^j (1+t)^(d0-j) * D^(d0-j) * A_j
  let pw = [1n]; // (B + C t)^j
  for (let j = 0; j <= d0; j++) {
    if (A[j] !== 0n) {
      const bn = binom(d0 - j), scale = A[j] * Db ** BigInt(d0 - j);
      for (let a = 0; a < pw.length; a++) for (let b = 0; b < bn.length; b++) total[a + b] += scale * pw[a] * bn[b];
    }
    const nx = new Array(pw.length + 1).fill(0n);
    for (let a = 0; a < pw.length; a++) { nx[a] += pw[a] * Bb; nx[a + 1] += pw[a] * Cb; }
    pw = nx;
  }
  const nz = total.filter((x) => x !== 0n);
  let changes = 0;
  for (let k = 1; k < nz.length; k++) if ((nz[k] > 0n) !== (nz[k - 1] > 0n)) changes++;
  return changes;
}

// N_A(s) = sum A_j (1e10)^(d0-j) s^j, eq. (95); returns its sign
export function bracketSign(A, s) {
  const d0 = A.length - 1, S = BigInt(s), T = 10000000000n;
  // Horner in the homogenised form: terms[j] = A_j T^(d0-j)
  const terms = [];
  let Tp = 1n, acc = 0n;
  for (let j = d0; j >= 0; j--) { terms[j] = A[j] * Tp; Tp *= T; }
  for (let j = d0; j >= 0; j--) acc = acc * S + terms[j];
  return acc > 0n ? 1 : acc < 0n ? -1 : 0;
}
