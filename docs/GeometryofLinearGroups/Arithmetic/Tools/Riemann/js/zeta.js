/* ζ(s) in double precision, for the Riemann viewer's readouts, its worker and its tests.

   Methods (the GPU shader in shaders.js makes the same choices in single precision):
   - Euler–Maclaurin summation for small heights and for Re s far from 1/2;
   - the Riemann–Siegel formula for every Re s at large heights, in the form of
     J. Arias de Reyna, "High precision computation of Riemann's zeta function by the
     Riemann–Siegel formula, I", Math. Comp. 80 (2011): with R the Riemann–Siegel
     sum plus its correction,
         ζ(s) = R(s) + χ(s) · conj(R(1 − s̄)),
     and the correction terms C_k(p) built from F(z) = (e^{πi(z²/2 + 3/8)} − i√2 cos(πz/2)) / (2 cos πz);
   - the functional equation ζ(s) = χ(s) ζ(1 − s) on the left, where the Dirichlet
     series would cancel catastrophically.
   Complex numbers are pairs [re, im]. */

export const TWO_PI = 2 * Math.PI;
export const LOG_PI = Math.log(Math.PI);
export const LOG_2PI = Math.log(TWO_PI);

/* ---- tuning ----
   Riemann–Siegel with C_0 … C_3 is good to about 1e-6 at t = 100 and 1e-9 at t = 1500
   (tests/zeta.test.mjs); the shader works in single precision and switches at GPU.T_RS,
   while these double-precision readouts keep Euler–Maclaurin up to T_RS. */
export const T_RS = 1500;      // Riemann–Siegel from this height up …
export const RS_SIG = 8;       // … for |σ − 1/2| ≤ min(a/3, RS_SIG), a = √(t/2π)
export const RS_K = 4;         // correction terms C_0 … C_3
export const EM_TERMS = 10;    // Bernoulli terms B_2 … B_20 in Euler–Maclaurin
export const EM_SLACK = 2;     // M ≥ EM_SLACK·|s + 2m|/π
export const GPU = { T_RS: 100, EM_SLACK: 1, EPS: 1e-7 };

/* ---- small complex helpers ---- */
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cexp = (a) => { const r = Math.exp(a[0]); return [r * Math.cos(a[1]), r * Math.sin(a[1])]; };
const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
export { cmul, cdiv, cexp, clog };

/* reduce an angle to (−π, π] */
export function wrap(x) { return x - TWO_PI * Math.round(x / TWO_PI); }

/* ================================================================
   log Γ, ψ, χ and the Riemann–Siegel θ
   ================================================================ */
const STIRLING = [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188, -691 / 360360, 1 / 156, -3617 / 122400];

/** The principal branch of log Γ(z), by shifting to |z| ≥ 15 and Stirling's series. */
export function logGamma(x, y) {
  let ar = 0, ai = 0;                          // Σ log(z + j) over the shift
  while (x < 10 && (x < 0 || x * x + y * y < 225)) {
    ar += 0.5 * Math.log(x * x + y * y); ai += Math.atan2(y, x);
    x += 1;
  }
  const lr = 0.5 * Math.log(x * x + y * y), li = Math.atan2(y, x);
  // (z − 1/2) log z − z + log(2π)/2
  let rr = (x - 0.5) * lr - y * li - x + 0.5 * LOG_2PI;
  let ri = (x - 0.5) * li + y * lr - y;
  // Σ c_k z^{1−2k}
  const d = x * x + y * y, ir = x / d, ii = -y / d;   // 1/z
  const w2r = ir * ir - ii * ii, w2i = 2 * ir * ii;  // 1/z²
  let pr = ir, pi = ii;
  for (let k = 0; k < STIRLING.length; k++) {
    rr += STIRLING[k] * pr; ri += STIRLING[k] * pi;
    const t = pr * w2r - pi * w2i; pi = pr * w2i + pi * w2r; pr = t;
  }
  return [rr - ar, ri - ai];
}

/** ψ(z) = Γ′(z)/Γ(z). */
export function digamma(x, y) {
  let ar = 0, ai = 0;
  while (x < 10 && (x < 0 || x * x + y * y < 225)) {
    const d = x * x + y * y; ar += x / d; ai -= y / d;
    x += 1;
  }
  const d = x * x + y * y, ir = x / d, ii = -y / d;
  const w2r = ir * ir - ii * ii, w2i = 2 * ir * ii;
  let rr = 0.5 * Math.log(d) - 0.5 * ir, ri = Math.atan2(y, x) - 0.5 * ii;
  const B = [1 / 12, -1 / 120, 1 / 252, -1 / 240, 1 / 132, -691 / 32760];
  let pr = w2r, pi = w2i;
  for (let k = 0; k < B.length; k++) {
    rr -= B[k] * pr; ri -= B[k] * pi;
    const t = pr * w2r - pi * w2i; pi = pr * w2i + pi * w2r; pr = t;
  }
  return [rr - ar, ri - ai];
}

/** log χ(s), where ζ(s) = χ(s) ζ(1 − s) and χ(s) = π^{s−1/2} Γ((1−s)/2) / Γ(s/2). */
export function logChi(x, y) {
  const a = logGamma((1 - x) / 2, -y / 2), b = logGamma(x / 2, y / 2);
  return [(x - 0.5) * LOG_PI + a[0] - b[0], y * LOG_PI + a[1] - b[1]];
}

/** ϑ(t) = (t/2) log(t/2π) − t/2 − π/8, the main part of θ(t) and the phase of U in Riemann–Siegel. */
export function vartheta(t) { return 0.5 * t * Math.log(t / TWO_PI) - 0.5 * t - Math.PI / 8; }

/** The Riemann–Siegel theta function θ(t) = arg Γ(1/4 + it/2) − (t/2) log π (continuous, odd). */
export function theta(t) {
  if (t < 0) return -theta(-t);
  if (t >= 20) {
    const u = 1 / t, u2 = u * u;
    return vartheta(t) + u * (1 / 48 + u2 * (7 / 5760 + u2 * (31 / 80640 + u2 * 127 / 430080)));
  }
  return logGamma(0.25, t / 2)[1] - 0.5 * t * LOG_PI;
}

/** θ′(t), for Newton's method on Gram points. */
export function thetaPrime(t) { return 0.5 * digamma(0.25, Math.abs(t) / 2)[0] - 0.5 * LOG_PI; }

/* ================================================================
   Euler–Maclaurin
   ================================================================ */
const BERN = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798, -174611 / 330, 854513 / 138];
function fact(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
/** b_k = B_{2k}/(2k)!, and the ratios b_{k+1}/b_k used to step the Bernoulli terms. */
export const EM_B = BERN.map((b, k) => b / fact(2 * k + 2));
export const EM_RATIO = EM_B.slice(1).map((b, k) => b / EM_B[k]);

/** Number of terms M for Euler–Maclaurin with m Bernoulli terms: |s + 2m|/(2πM) ≤ 1/(2·slack). */
export function emTerms(x, t, slack = EM_SLACK) { return Math.max(6, Math.ceil(slack * Math.hypot(x + 2 * EM_TERMS, t) / Math.PI) + 1); }
/** Number of terms for a plain partial sum (one Bernoulli term) when σ is large: the next term,
    about |s|³ M^{−σ−3}/720, is below eps·2^{−σ}, so that even ζ(s) − 1 ≈ 2^{−s} is accurate. */
export function directTerms(x, t, eps) {
  if (x < 1.5) return Infinity;
  const ls = Math.log(Math.hypot(x, t) + 1);
  return Math.max(3, Math.ceil(Math.exp((3 * ls - Math.log(720 * eps) + x * Math.LN2) / (x + 3))));
}

/** Σ_{n<M} n^{−s} + M^{1−s}/(s−1) + M^{−s}/2 + Σ_{k≤m} b_k (s)_{2k−1} M^{1−s−2k}. */
export function eulerMaclaurin(x, t, M, m) {
  let sr = 0, si = 0;
  for (let n = 1; n < M; n++) {
    const l = Math.log(n), r = Math.exp(-x * l), ph = -t * l;
    sr += r * Math.cos(ph); si += r * Math.sin(ph);
  }
  const lM = Math.log(M), rM = Math.exp(-x * lM), phM = -t * lM;
  const pr = rM * Math.cos(phM), pi = rM * Math.sin(phM);      // M^{−s}
  // M^{1−s}/(s − 1)
  const q = cdiv([M * pr, M * pi], [x - 1, t]);
  sr += q[0] + 0.5 * pr; si += q[1] + 0.5 * pi;
  // Bernoulli terms
  let tr = EM_B[0] * (x * pr - t * pi) / M, ti = EM_B[0] * (x * pi + t * pr) / M;
  const M2 = M * M;
  for (let k = 1; k <= m; k++) {
    sr += tr; si += ti;
    if (k === m) break;
    // × (s + 2k − 1)(s + 2k) / M² · b_{k+1}/b_k
    const ar = x + 2 * k - 1, br = x + 2 * k;
    const fr = ar * br - t * t, fi = t * (ar + br);
    const g = EM_RATIO[k - 1] / M2;
    const nr = (tr * fr - ti * fi) * g; ti = (tr * fi + ti * fr) * g; tr = nr;
  }
  return [sr, si];
}

/** ζ(s) for σ ≥ 0 by Euler–Maclaurin or, when cheaper, a short partial sum. */
function zetaRight(x, t, eps = 1e-15) {
  const Me = emTerms(x, t), Md = directTerms(x, t, eps);
  return Md < Me ? eulerMaclaurin(x, t, Md, 1) : eulerMaclaurin(x, t, Me, EM_TERMS);
}

/* ================================================================
   Riemann–Siegel for general σ
   ================================================================ */
/* Taylor coefficients c_{2n} of the (entire, even) function F, from Arias de Reyna's
   formula with Euler numbers, computed with mpmath at 60 digits. */
const F_COEF = [
  [0.1913417161825449, -0.24516701493090415], [0.21862023403876021, -0.036933834884962956],
  [0.06618828774017176, 0.06353439385614602], [-0.006802513023837094, 0.027223912663570066],
  [-0.0067838109850517905, 0.001385760877106652], [-0.0008118626615722327, -0.001189449446101378],
  [0.00014852676866689845, -0.00021269820192893323], [3.971650439760735e-05, 1.1171327401990151e-05],
  [2.3278062307252252e-07, 5.87285839865207e-06], [-7.163625815477553e-07, 2.498212552923518e-07],
  [-5.177423556156473e-08, -7.308700305101552e-08], [6.178963541930869e-09, -7.53679144816402e-09],
  [8.940541928977453e-10, 4.1044257973312284e-10], [-1.695707194963518e-11, 9.106559550294084e-11],
  [-8.163316951282953e-12, 4.3480990952496187e-13], [-1.8925546592706103e-13, -6.52091326154013e-13],
  [4.6637116296008625e-14, -2.574698839194822e-14], [2.6109215079890685e-15, 2.9783351960862874e-15],
  [-1.675336536372132e-16, 2.241756964196517e-16], [-1.7062132614058632e-17, -7.993661378773457e-18],
  [2.8756016707161996e-19, -1.1768943516467545e-18], [7.447650681605753e-20, 3.424141569957982e-21],
  [6.282686358510708e-22, 4.354432465678006e-21], [-2.360647625071713e-22, 8.042677010875067e-23],
  [-6.63453468151981e-24, -1.187404814328495e-23], [5.526719997560709e-25, -4.533873522499421e-25],
  [2.7498231887637325e-26, 2.3622132419636895e-26], [-9.115688251159012e-28, 1.524413235942887e-27],
];
/* F^{(m)} as a power series in p: coefficient of p^j */
const F_DER = [];
{
  const deg = 2 * (F_COEF.length - 1);
  let cur = Array.from({ length: deg + 1 }, (_, j) => (j % 2 ? [0, 0] : F_COEF[j / 2]));
  for (let m = 0; m <= 3 * (RS_K - 1); m++) {
    F_DER.push(cur);
    cur = cur.slice(1).map(([a, b], j) => [(j + 1) * a, (j + 1) * b]);
  }
}
export function fDeriv(m, p) {
  const c = F_DER[m];
  let r = 0, i = 0;
  for (let j = c.length - 1; j >= 0; j--) { r = r * p + c[j][0]; i = i * p + c[j][1]; }
  return [r, i];
}

/* The numbers d_{k,ℓ}(σ) of Arias de Reyna (II, §3.17), as polynomials in σ:
   D[k][ℓ][j] is the coefficient of σ^j. */
export const RS_D = (() => {
  const add = (a, b) => { const o = a.slice(); b.forEach((v, j) => { o[j] = (o[j] || 0) + v; }); return o; };
  const scale = (a, f) => a.map((v) => v * f);
  const shift = (a) => [0, ...a];
  const D = [[[1]]];
  for (let n = 1; n < RS_K; n++) {
    const row = [], prev = D[n - 1];
    const get = (k) => (k >= 0 && k < prev.length ? prev[k] : [0]);
    for (let k = 0; k <= Math.floor(3 * n / 2); k++) {
      const m = 3 * n - 2 * k;
      if (m !== 0) {
        // −(m+1) d_{n−1,k−2} + d_{n−1,k}/(4m) + (1 − 2σ)/(2m) d_{n−1,k−1}
        let v = scale(get(k - 2), -(m + 1));
        v = add(v, scale(get(k), 1 / (4 * m)));
        v = add(v, scale(get(k - 1), 1 / (2 * m)));
        v = add(v, scale(shift(get(k - 1)), -1 / m));
        row.push(v);
      } else {
        let v = [0];
        for (let r = 0; r < k; r++) v = add(v, scale(row[r], -((-1) ** (k - r)) * fact(2 * k - 2 * r) / fact(k - r)));
        row.push(v);
      }
    }
    D.push(row);
  }
  return D;
})();

/* 1/(π^{2k−ℓ} (2i)^ℓ) */
function rsScale(k, l) {
  const f = 1 / (Math.PI ** (2 * k - l) * 2 ** l);
  // 1/i^ℓ = (−i)^ℓ
  return [[f, 0], [0, -f], [-f, 0], [0, f]][l % 4];
}

/** G_{k,j}(p) with rs(σ, p) = Σ_k a^{−k} Σ_j σ^j G_{k,j}(p): the table the shader samples. */
export function rsG(k, j, p) {
  let r = 0, i = 0;
  RS_D[k].forEach((poly, l) => {
    const c = poly[j] || 0;
    if (!c) return;
    const F = fDeriv(3 * k - 2 * l, p), sc = rsScale(k, l);
    const g = cmul(F, sc);
    r += c * g[0]; i += c * g[1];
  });
  return [r, i];
}

/** The Riemann–Siegel correction Σ_k C_k(p) a^{−k} for abscissa σ. */
export function rsCorrection(x, p, a) {
  let r = 0, i = 0, ak = 1;
  for (let k = 0; k < RS_K; k++) {
    let xj = 1;
    for (let j = 0; j <= k; j++) {
      const g = rsG(k, j, p);
      r += ak * xj * g[0]; i += ak * xj * g[1];
      xj *= x;
    }
    ak /= a;
  }
  return [r, i];
}

/** Whether ζ(σ + it), t ≥ 0, is computed by Riemann–Siegel. */
export function usesRS(x, t, tRS = T_RS) {
  if (t < tRS) return false;
  const a = Math.sqrt(t / TWO_PI);
  return Math.abs(x - 0.5) <= Math.min(a / 3, RS_SIG);
}

/** ζ(σ + it) for t ≥ T_RS by Riemann–Siegel: R(s) + χ(s) conj(R(1 − s̄)). */
export function zetaRS(x, t) {
  const a = Math.sqrt(t / TWO_PI), N = Math.floor(a), p = 1 - 2 * (a - N);
  let s1r = 0, s1i = 0, s2r = 0, s2i = 0;
  for (let n = 1; n <= N; n++) {
    const l = Math.log(n), ph = -t * l, c = Math.cos(ph), s = Math.sin(ph);
    const r1 = Math.exp(-x * l), r2 = Math.exp((x - 1) * l);
    s1r += r1 * c; s1i += r1 * s;          // n^{−s}
    s2r += r2 * c; s2i -= r2 * s;          // n^{s−1}
  }
  const th = vartheta(t), U = [Math.cos(th), -Math.sin(th)];
  const sg = N % 2 ? 1 : -1;
  const c1 = rsCorrection(x, p, a), c2 = rsCorrection(1 - x, p, a);
  const la = Math.log(a);
  const k1 = cmul(U, c1), f1 = sg * Math.exp(-x * la);
  const k2 = cmul([U[0], -U[1]], [c2[0], -c2[1]]), f2 = sg * Math.exp((x - 1) * la);
  const X1 = [s1r + f1 * k1[0], s1i + f1 * k1[1]];
  const X2 = [s2r + f2 * k2[0], s2i + f2 * k2[1]];
  const chi = cexp(logChi(x, t));
  const m = cmul(chi, X2);
  return [X1[0] + m[0], X1[1] + m[1]];
}

/* ================================================================
   ζ(s), Hardy's Z, ξ
   ================================================================ */
/** ζ(σ + it) in double precision. */
export function zeta(x, t) {
  if (t < 0) { const v = zeta(x, -t); return [v[0], -v[1]]; }
  if (usesRS(x, t)) return zetaRS(x, t);
  if (x < 0) {
    // ζ(s) = χ(s) ζ(1 − s), and ζ(1 − s) = conj ζ(1 − σ + it)
    const w = zeta(1 - x, t), lc = logChi(x, t);
    return cmul(cexp(lc), [w[0], -w[1]]);
  }
  return zetaRight(x, t);
}

/** log ζ(s) without overflow for very negative σ: [log|ζ|, arg ζ]. */
export function logZeta(x, t) {
  if (t < 0) { const v = logZeta(x, -t); return [v[0], -v[1]]; }
  if (x < 0 && !usesRS(x, t)) {
    const w = zeta(1 - x, t), lc = logChi(x, t);
    const lw = clog([w[0], -w[1]]);
    return [lc[0] + lw[0], wrap(lc[1] + lw[1])];
  }
  return clog(zeta(x, t));
}

/** log ξ(s) for ξ(s) = ½ s(s−1) π^{−s/2} Γ(s/2) ζ(s), using ξ(s) = conj ξ(1 − σ + it). */
export function logXi(x, t) {
  if (x < 0.5) { const v = logXi(1 - x, t); return [v[0], -v[1]]; }
  const lz = logZeta(x, t), lg = logGamma(x / 2, t / 2);
  const pre = clog(cmul([x / 2, t / 2], [x - 1, t]));
  return [lz[0] + pre[0] - 0.5 * x * LOG_PI + lg[0], wrap(lz[1] + pre[1] - 0.5 * t * LOG_PI + lg[1])];
}

/** Hardy's Z(t) = e^{iθ(t)} ζ(1/2 + it), real. */
export function hardyZ(t) {
  if (t < 0) return hardyZ(-t);
  if (t < T_RS) {
    const z = zeta(0.5, t), th = theta(t);
    return z[0] * Math.cos(th) - z[1] * Math.sin(th);
  }
  const a = Math.sqrt(t / TWO_PI), N = Math.floor(a), p = 1 - 2 * (a - N);
  const th = theta(t);
  let s = 0;
  for (let n = 1; n <= N; n++) { const l = Math.log(n); s += Math.cos(th - t * l) / Math.sqrt(n); }
  const c = rsCorrection(0.5, p, a), d = th - vartheta(t);
  const re = c[0] * Math.cos(d) - c[1] * Math.sin(d);
  return 2 * s + 2 * (N % 2 ? 1 : -1) * re / Math.sqrt(a);
}

/* ================================================================
   Gram points, zeros on the critical line, and N(T)
   ================================================================ */
/** Mean spacing of zeros near height t. */
export function meanGap(t) { return TWO_PI / Math.log(Math.max(Math.abs(t), 20) / TWO_PI); }

/** Solve θ(t) = πv for t (v real, v ≥ −1); the Gram point g_n is v = n. */
export function thetaInverse(v) {
  const target = Math.PI * v;
  let t = Math.max(18, TWO_PI * Math.exp(1 + lambertW((8 * v + 1) / (8 * Math.E))));
  for (let i = 0; i < 60; i++) {
    const dt = (theta(t) - target) / thetaPrime(t);
    t -= dt;
    if (Math.abs(dt) < 1e-13 * t) break;
  }
  return t;
}
export const gramPoint = (n) => thetaInverse(n);
function lambertW(x) {
  let w = x < 3 ? Math.log1p(x) : Math.log(x) - Math.log(Math.log(x));
  for (let i = 0; i < 40; i++) {
    const e = Math.exp(w), f = w * e - x, d = e * (w + 1) - (w + 2) * f / (2 * w + 2);
    const dw = f / d; w -= dw;
    if (Math.abs(dw) < 1e-15 * (1 + Math.abs(w))) break;
  }
  return w;
}

/** Brent's method for a sign change of f on [a, b]. */
function brent(f, a, b, fa, fb, tol) {
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < 100; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = e = b - a; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2e-16 * Math.abs(b) + 0.5 * tol, xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p, q, r, s = fb / fa;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else { q = fa / fc; r = fb / fc; p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

/** The zeros 1/2 + iγ with t0 < γ ≤ t1 (0 ≤ t0), as sign changes of Z, sorted.
    Close pairs (Lehmer's phenomenon) are caught by refining every local minimum of |Z|. */
export function zerosBetween(t0, t1, opts = {}) {
  const maxSamples = opts.maxSamples || 20000;
  t0 = Math.max(t0, 10);
  if (!(t1 > t0)) return [];
  const pts = [];
  let t = t0;
  while (t < t1 && pts.length < maxSamples) { pts.push([t, hardyZ(t)]); t += meanGap(t) / 10; }
  pts.push([t1, hardyZ(t1)]);
  if (pts.length >= maxSamples) return null;
  // refine local minima of |Z| without a sign change
  const fine = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ta, za] = pts[i - 1], [tb, zb] = pts[i];
    const zc = i + 1 < pts.length ? pts[i + 1][1] : zb;
    if (za * zb > 0 && zb * zc > 0 && Math.abs(zb) < Math.abs(za) && Math.abs(zb) < Math.abs(zc) && i + 1 < pts.length) {
      const tc = pts[i + 1][0];
      // look between ta and tc in 24 steps, twice if needed
      let sub = [];
      for (let k = 1; k < 24; k++) { const u = ta + (tc - ta) * k / 24; sub.push([u, hardyZ(u)]); }
      if (!sub.some(([, z]) => z * za < 0)) {
        let m = 0; sub.forEach(([, z], k) => { if (Math.abs(z) < Math.abs(sub[m][1])) m = k; });
        const lo = m > 0 ? sub[m - 1][0] : ta, hi = m < sub.length - 1 ? sub[m + 1][0] : tc;
        const sub2 = [];
        for (let k = 1; k < 32; k++) { const u = lo + (hi - lo) * k / 32; sub2.push([u, hardyZ(u)]); }
        if (sub2.some(([, z]) => z * za < 0)) sub = sub.concat(sub2).sort((p, q) => p[0] - q[0]);
      }
      for (const q of sub) if (q[0] > ta && q[0] < tc && q[0] !== tb) fine.push(q);
    }
    fine.push(pts[i]);
  }
  fine.sort((p, q) => p[0] - q[0]);
  const out = [];
  for (let i = 1; i < fine.length; i++) {
    const [ta, za] = fine[i - 1], [tb, zb] = fine[i];
    if (za === 0) { if (ta > t0) out.push(ta); continue; }
    if (za * zb < 0) out.push(brent(hardyZ, ta, tb, za, zb, 2e-15 * tb));
  }
  return out.filter((g, i) => i === 0 || g - out[i - 1] > 1e-12 * g);
}

/** S(T) = arg ζ(1/2 + iT)/π, continued from 2 + iT along the horizontal line. */
export function bigS(T) {
  let z = zeta(2, T), arg = Math.atan2(z[1], z[0]), x = 2, prev = arg;
  let h = 0.05;
  while (x > 0.5) {
    const xn = Math.max(0.5, x - h), w = zeta(xn, T);
    const a = Math.atan2(w[1], w[0]);
    const d = wrap(a - prev);
    if (Math.abs(d) > 0.6 && h > 1e-6) { h /= 2; continue; }
    arg += d; prev = a; x = xn;
    if (Math.abs(d) < 0.15) h = Math.min(0.1, h * 1.5);
  }
  return arg / Math.PI;
}

/** N(T) = #{0 < γ ≤ T} = θ(T)/π + 1 + S(T), for T not the ordinate of a zero.
    Returns {n, err}: the nearest integer and how far the formula was from it. */
export function countZeros(T) {
  const v = theta(T) / Math.PI + 1 + bigS(T);
  const n = Math.round(v);
  return { n, err: Math.abs(v - n) };
}

/** Zeros in [t0, t1] with their indices: [{n, gamma}]; indices are null when the count fails. */
export function indexedZeros(t0, t1, opts) {
  const zs = zerosBetween(t0, t1, opts);
  if (!zs || !zs.length) return zs ? [] : null;
  const base = zs.length > 1 ? 0.5 * (zs[0] + zs[1]) : 0.5 * (zs[0] + Math.min(t1, zs[0] + meanGap(zs[0])));
  let c = zs.length > 1 || zs[0] + meanGap(zs[0]) < t1 ? countZeros(base) : null;
  if (!c && zs[0] > t0) c = countZeros(0.5 * (Math.max(t0, 10) + zs[0])), c.n += 1;
  const ok = c && c.err < 0.25;
  return zs.map((g, i) => ({ n: ok ? c.n + i : null, gamma: g }));
}

/** The n-th zero ordinate γ_n (n ≥ 1), located near the Gram point g_{n−3/2}. */
export function nthZero(n) {
  let t = thetaInverse(n - 1.5);
  for (let width = 4; width <= 64; width *= 2) {
    const g = meanGap(t), lo = Math.max(10, t - width * g), hi = t + width * g;
    const zs = indexedZeros(lo, hi);
    if (zs && zs.length && zs[0].n != null) {
      const hit = zs.find((z) => z.n === n);
      if (hit) return hit.gamma;
      const first = zs[0].n, last = zs[zs.length - 1].n;
      if (n < first) t = lo; else if (n > last) t = hi;
    }
  }
  return null;
}
