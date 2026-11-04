// Figure S3: the singular series. θ_Q near the cusps, the local densities, and r_Q = C + (cusp form).
import { el, makeCanvas, labelLayer, setTex, slider, chips, controls, palette, onTheme, fmt, rgba, pointer } from './common.js';

// ───────────── pure math (node-testable) ─────────────

/**
 * The forms in the figure. coeffs are the diagonal coefficients c_i of Q = Σ c_i x_i²,
 * sqrtDet = √(c1c2c3c4), bad = the primes dividing 2·det. q = null for the sum of four squares.
 */
export function makeForm(q) {
  if (!q) return { key: 'four', q: null, coeffs: [1, 1, 1, 1], sqrtDet: 1, bad: [2], N: 1500 };
  const c = 4 * q * q;
  return { key: 'q' + q, q, coeffs: [1, c, c, c], sqrtDet: 8 * q * q * q, bad: [2, q], N: q === 5 ? 30000 : q === 13 ? 200000 : 80000 };
}
export const FORMS = { four: makeForm(null), q5: makeForm(5), q13: makeForm(13), q17: makeForm(17) };

/** r_Q(n) for every 0 ≤ n ≤ N, by convolving the one-variable counts #{x : c x² = a}. */
export function countsUpTo(form, N) {
  let acc = new Float64Array(N + 1);
  acc[0] = 1;
  for (const c of form.coeffs) {
    const terms = [[0, 1]];
    for (let x = 1; c * x * x <= N; x++) terms.push([c * x * x, 2]);
    const next = new Float64Array(N + 1);
    for (let a = 0; a <= N; a++) {
      const v = acc[a];
      if (!v) continue;
      for (const [s, w] of terms) { if (a + s > N) break; next[a + s] += v * w; }
    }
    acc = next;
  }
  return acc;
}

/** Smallest-prime-factor sieve up to N. */
export function spfSieve(N) {
  const spf = new Int32Array(N + 1);
  for (let i = 2; i <= N; i++) if (!spf[i]) for (let j = i; j <= N; j += i) if (!spf[j]) spf[j] = i;
  return spf;
}

/** [[ℓ, v], …] for n ≥ 1, by trial division (or a sieve when given). */
export function factor(n, spf = null) {
  const out = [];
  if (spf && n < spf.length) {
    while (n > 1) { const l = spf[n]; let v = 0; while (n % l === 0) { n /= l; v++; } out.push([l, v]); }
    return out;
  }
  for (let l = 2; l * l <= n; l++) if (n % l === 0) { let v = 0; while (n % l === 0) { n /= l; v++; } out.push([l, v]); }
  if (n > 1) out.push([n, 1]);
  return out;
}

const val = (n, l) => { let v = 0; while (n % l === 0) { n /= l; v++; } return v; };
const geomSum = (l, v) => { let s = 0, t = 1; for (let i = 0; i <= v; i++) { s += t; t /= l; } return s; }; // 1 + 1/ℓ + … + 1/ℓ^v

/** Four squares at 2: δ₂(n) = 1 for n odd, 3/2^v for n = 2^v·odd (v ≥ 1). */
function delta2Four(n) { const v = val(n, 2); return v === 0 ? 1 : 3 / Math.pow(2, v); }

function legendreSym(a, q) {
  a = ((a % q) + q) % q;
  if (!a) return 0;
  let r = 1, b = a, e = (q - 1) / 2, m = q;
  // modpow
  let base = b; r = 1;
  while (e > 0) { if (e & 1) r = (r * base) % m; base = (base * base) % m; e >>= 1; }
  return r === 1 ? 1 : -1;
}

/**
 * Local density δ_ℓ(n) = lim_k ℓ^{−3k} #{x mod ℓ^k : Q(x) ≡ n}, n ≥ 1.
 * Bad primes by the closed forms below (checked against counting in the tests); good primes
 * ℓ ∤ 2·det by (1 − ℓ^{−2})(1 + ℓ^{−1} + ⋯ + ℓ^{−v}); det is a square, so no character appears.
 *  four squares, ℓ = 2:  1 (n odd), 3/2^v (v ≥ 1)
 *  x1² + 4q²(x2²+x3²+x4²), ℓ = 2:  2 (n ≡ 1 mod 4), 0 (n ≡ 2, 3 mod 4), 2·δ₂^{four}(n/4) (4 | n)
 *                          ℓ = q:  1 + (n/q) (q ∤ n), 0 (q ‖ n), q(1 − q^{−2})(1 + ⋯ + q^{−(v−2)}) (v ≥ 2)
 */
export function localDensity(form, n, l) {
  const v = val(n, l);
  if (!form.q) {
    if (l === 2) return delta2Four(n);
    return (1 - 1 / (l * l)) * geomSum(l, v);
  }
  const q = form.q;
  if (l === 2) {
    const r = n % 4;
    if (r === 1) return 2;
    if (r === 2 || r === 3) return 0;
    return 2 * delta2Four(n / 4);
  }
  if (l === q) {
    if (v === 0) return 1 + legendreSym(n, q);
    if (v === 1) return 0;
    return q * (1 - 1 / (q * q)) * geomSum(q, v - 2);
  }
  return (1 - 1 / (l * l)) * geomSum(l, v);
}

/** #{x mod ℓ^k : Q(x) ≡ n} / ℓ^{3k}, by convolving square-count distributions mod M = ℓ^k. */
export function countDensity(form, n, l, k) {
  const M = Math.pow(l, k);
  const dist = (c) => {
    const d = new Float64Array(M);
    for (let x = 0; x < M; x++) d[(c * ((x * x) % M)) % M] += 1;
    return d;
  };
  const conv = (a, b) => {
    const out = new Float64Array(M);
    const nzA = [], nzB = [];
    for (let i = 0; i < M; i++) { if (a[i]) nzA.push(i); if (b[i]) nzB.push(i); }
    for (const i of nzA) { const ai = a[i]; for (const j of nzB) out[(i + j) % M] += ai * b[j]; }
    return out;
  };
  const [c1, ...rest] = form.coeffs;
  let tail = dist(rest[0]);
  for (let i = 1; i < rest.length; i++) tail = conv(tail, dist(rest[i]));
  const d1 = dist(c1), r = ((n % M) + M) % M;
  let cnt = 0;
  for (let a = 0; a < M; a++) if (d1[a]) cnt += d1[a] * tail[((r - a) % M + M) % M];
  return cnt / Math.pow(M, 3);
}

/** ∏ over good primes ℓ ∤ 2·det of (1 − ℓ^{−2}), in closed form from ζ(2) = π²/6. */
export function goodEulerConstant(form) {
  let c = 6 / (Math.PI * Math.PI);
  for (const l of form.bad) c /= 1 - 1 / (l * l);
  return c;
}

/**
 * The singular-series main term C(n) = (π²n/√det) ∏_ℓ δ_ℓ(n), with its parts:
 * { arch, bad: [[ℓ, δ_ℓ]], goodConst, goodDiv, series, C }.
 */
export function mainTermParts(form, n, spf = null) {
  const arch = (Math.PI * Math.PI * n) / form.sqrtDet;
  const bad = form.bad.map((l) => [l, localDensity(form, n, l)]);
  const goodConst = goodEulerConstant(form);
  let goodDiv = 1;
  for (const [l, v] of factor(n, spf)) if (!form.bad.includes(l)) goodDiv *= geomSum(l, v);
  let series = goodConst * goodDiv;
  for (const [, d] of bad) series *= d;
  return { arch, bad, goodConst, goodDiv, series, C: arch * series };
}
export const mainC = (form, n, spf) => mainTermParts(form, n, spf).C;

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/** Normalized Gauss sum g(b, m) = (1/m) Σ_{r mod m} e(b r²/m), as [re, im]. */
export function gaussNorm(b, m) {
  let re = 0, im = 0;
  b = ((b % m) + m) % m;
  for (let r = 0; r < m; r++) {
    const t = (2 * Math.PI * ((b * ((r * r) % m)) % m)) / m;
    re += Math.cos(t); im += Math.sin(t);
  }
  return [re / m, im / m];
}

/** G(a/m) = ∏_i g(a c_i, m): the size of θ_Q's singularity at the cusp a/m, as [re, im]. */
export function cuspG(form, a, m) {
  let re = 1, im = 0;
  for (const c of form.coeffs) {
    const [gr, gi] = gaussNorm(a * c, m);
    [re, im] = [re * gr - im * gi, re * gi + im * gr];
  }
  return [re, im];
}

/** A_m(n) = Σ_{a mod m, (a,m)=1} G(a/m) e(−an/m) (real; the imaginary parts cancel). */
export function seriesTerm(form, n, m) {
  let s = 0;
  for (let a = 0; a < m; a++) {
    if (m > 1 ? gcd(a, m) !== 1 : a !== 0) continue;
    const [gr, gi] = cuspG(form, a, m);
    const t = (-2 * Math.PI * ((a * (n % m)) % m)) / m;
    s += gr * Math.cos(t) - gi * Math.sin(t);
  }
  return s;
}

/** Partial sums Σ_{m ≤ M} A_m(n) for M = 1 … Mmax. */
export function seriesPartials(form, n, Mmax) {
  const out = new Float64Array(Mmax + 1);
  let s = 0;
  for (let m = 1; m <= Mmax; m++) { s += seriesTerm(form, n, m); out[m] = s; }
  return out;
}

/** θ₁(τ) = Σ_{n∈ℤ} e^{2πin²τ} at τ = x + iy, as [re, im] (phases by recurrence, no trig in the loop). */
export function theta1(x, y) {
  const nMax = Math.ceil(Math.sqrt(30 / (2 * Math.PI * y))) + 1;
  // z_n = e^{2πi n² x}, step w_n = e^{2πi(2n+1)x}, w_{n+1} = w_n · e^{4πix}
  let zr = 1, zi = 0;
  let wr = Math.cos(2 * Math.PI * x), wi = Math.sin(2 * Math.PI * x);
  const sr = Math.cos(4 * Math.PI * x), si = Math.sin(4 * Math.PI * x);
  let re = 1, im = 0;
  for (let n = 1; n <= nMax; n++) {
    [zr, zi] = [zr * wr - zi * wi, zr * wi + zi * wr];
    [wr, wi] = [wr * sr - wi * si, wr * si + wi * sr];
    const amp = 2 * Math.exp(-2 * Math.PI * n * n * y);
    if (amp < 1e-16) break;
    re += amp * zr; im += amp * zi;
  }
  return [re, im];
}

/** 4√det · y² · |θ_Q(x+iy)|: the cusp at 0 has height 1, the cusp a/m tends to |G(a/m)| as y → 0. */
export function spikeValue(form, x, y) {
  // |θ_Q| = ∏ |θ₁(c τ)|, one evaluation per distinct coefficient
  let mod = 1;
  const seen = new Map();
  for (const c of form.coeffs) seen.set(c, (seen.get(c) || 0) + 1);
  for (const [c, e] of seen) {
    // reduce c·x mod 1 first, so the recurrence starts from a small angle
    const cx = c * x - Math.floor(c * x);
    const [tr, ti] = theta1(cx, c * y);
    mod *= Math.pow(Math.hypot(tr, ti), e);
  }
  return 4 * form.sqrtDet * y * y * mod;
}

/** The reduced fractions a/m in [0, 1] with m ≤ M, with |G(a/m)|. */
export function cusps(form, M) {
  const out = [];
  for (let m = 1; m <= M; m++) for (let a = 0; a <= m; a++) {
    if (gcd(a, m) !== 1) continue;
    const [gr, gi] = cuspG(form, a, m);
    out.push({ a, m, x: a / m, G: Math.hypot(gr, gi), Gre: gr, Gim: gi });
  }
  return out;
}

/** Number of divisors. */
export function numDivisors(n, spf = null) {
  let d = 1;
  for (const [, v] of factor(n, spf)) d *= v + 1;
  return d;
}

/** n = p^k (k ≥ 1) for a prime p ≡ 1 mod 4 not dividing 2q: the counts the paper uses. */
export function paperPower(n, form, spf = null) {
  const f = factor(n, spf);
  return f.length === 1 && f[0][0] % 4 === 1 && f[0][0] !== form.q ? f[0] : null;
}

/**
 * Everything the counting panel needs for 1 ≤ n ≤ N: r, C, remainder b = r − C, and b/(d(n)√n).
 * Returns typed arrays indexed by n.
 */
export function countingData(form, N) {
  const r = countsUpTo(form, N), spf = spfSieve(N);
  const C = new Float64Array(N + 1), b = new Float64Array(N + 1), bn = new Float64Array(N + 1);
  let maxNorm = 0, maxAt = 0, maxAbsB = 0;
  for (let n = 1; n <= N; n++) {
    C[n] = mainC(form, n, spf);
    b[n] = r[n] - C[n];
    if (Math.abs(b[n]) < 1e-7 * Math.max(1, C[n])) b[n] = 0;
    bn[n] = b[n] / (numDivisors(n, spf) * Math.sqrt(n));
    maxAbsB = Math.max(maxAbsB, Math.abs(b[n]));
    if (Math.abs(bn[n]) > maxNorm) { maxNorm = Math.abs(bn[n]); maxAt = n; }
  }
  return { N, r, C, b, bn, spf, maxNorm, maxAt, maxAbsB };
}

// ───────────── the figure ─────────────

const FORM_CHIPS = [
  ['four', '$x_1^2+x_2^2+x_3^2+x_4^2$'],
  ['q5', '$Q$, $q=5$'],
  ['q13', '$Q$, $q=13$'],
];
const SPIKE_M = 12;     // cusps drawn as predicted dots
const DENSE_M = 40;     // cusps around which the curve is sampled densely
const Y_DEFAULT = { four: -2.6, q5: -4.4, q13: -5.2 };
const Y_RANGE = { four: [-4, -1.4], q5: [-5.6, -2.6], q13: [-6.2, -3.6] };
// a starting n coprime to 2q: a power p^k with p ≡ 1 mod 4 a square mod q, as in the paper
const N_START = { four: 30, q5: 13 ** 4, q13: 17 ** 3 };
const dataCache = new Map();

export function mount(root) {
  const st = { key: 'four', form: FORMS.four, logy: Y_DEFAULT.four, curve: null, cusps: null, hoverCusp: null, data: null, n: 0, hoverN: null, gen: 0 };

  // ── form choice ──
  const head = el('div', { class: 'controls inline', style: 'margin-bottom:.6rem' });
  root.append(head);
  chips(head, { label: 'the form', options: FORM_CHIPS, value: 'four', onchange: (k) => setForm(k) });
  const formNote = el('p', { class: 'panel-hint', style: 'margin:.2rem 0 .8rem' });
  root.append(formNote);

  // ── panel A: the cusps ──
  root.append(el('p', { class: 'panel-hint', html: '' }));
  const hintA = root.lastChild;
  setTex(hintA, '<b>The singularities.</b> $4\\sqrt{\\det Q}\\;y^2\\,|\\theta_Q(x+iy)|$ for $0\\le x\\le1$. Dots: the heights $|G(a/m)|$ that the Gauss sums predict at each cusp $a/m$.');
  const cvA = makeCanvas(root, { aspect: (w) => (w < 520 ? 0.62 : 0.34), maxHeight: 320, minHeight: 200, draw: drawA });
  const labA = labelLayer(cvA.wrap);
  const rowA = el('div', { class: 'fig-row', style: 'margin-top:.4rem; align-items:center' });
  const ctlA = el('div', { class: 'grow' }), roA = el('div', { class: 'side readout', style: 'min-height:3.2em' });
  rowA.append(ctlA, roA);
  root.append(rowA);
  const ySlider = slider(ctlA, {
    label: '$y$', min: -4, max: -1.4, step: 0.05, value: st.logy,
    fmt: (v) => `$10^{${v.toFixed(2)}}$`,
    oninput: (v) => { st.logy = v; scheduleCurve(); },
  });
  const hintY = el('div', { class: 'hint' });
  ctlA.append(hintY);
  setTex(hintY, '<b>Lower</b> $y$ toward the real axis: the spikes sharpen and climb onto the dots. Every rational is a cusp; dots mark those with $m\\le' + SPIKE_M + '$. <b>Hover</b> a dot to compare.');

  // ── panel B: the counts ──
  const rowB = el('div', { class: 'fig-row', style: 'margin-top:1.4rem' });
  const leftB = el('div', { class: 'grow' }), rightB = el('div', { class: 'side' });
  rowB.append(leftB, rightB);
  root.append(rowB);
  leftB.append(el('p', { class: 'panel-hint' }));
  const hintB = leftB.lastChild;
  const cvB = makeCanvas(leftB, { aspect: (w) => (w < 520 ? 0.95 : 0.62), maxHeight: 400, minHeight: 240, draw: drawB });
  const labB = labelLayer(cvB.wrap);
  leftB.append(el('p', { class: 'panel-hint', style: 'margin-top:.7rem' }));
  const hintR = leftB.lastChild;
  const cvR = makeCanvas(leftB, { aspect: (w) => (w < 520 ? 0.42 : 0.26), maxHeight: 200, minHeight: 120, draw: drawR });
  const labR = labelLayer(cvR.wrap);

  const ctlB = controls(rightB);
  const nSlider = slider(ctlB, { label: '$n$', min: 1, max: 1500, step: 1, value: 1, oninput: (v) => { st.n = v; st.hoverN = null; redrawB(); updateReadout(); } });
  const roB = el('div', { class: 'readout' });
  rightB.append(roB);
  const hintN = el('div', { class: 'hint' });
  rightB.append(hintN);
  setTex(hintN, '<b>Hover</b> a point, or <b>move</b> $n$, to see where $C(n)$ comes from.');

  // ── state changes ──
  function setForm(key) {
    st.key = key; st.form = FORMS[key]; st.gen++;
    const f = st.form;
    setTex(formNote, f.q
      ? `$Q=x_1^2+${4 * f.q * f.q}\\,(x_2^2+x_3^2+x_4^2)$, the form (1.3) with $q=${f.q}$: $\\sqrt{\\det Q}=8q^3=${fmt.tex(f.sqrtDet)}$, level $16q^2$. There are cusp forms of weight two at this level, so the main term is not the whole count.`
      : 'The sum of four squares: $\\det=1$, level $4$. There are no cusp forms of weight two on $\\Gamma_0(4)$, so the main term should be the whole count: Jacobi\'s formula (1.2).');
    const [lo, hi] = Y_RANGE[key];
    ySlider.setRange(lo, hi);
    st.logy = Y_DEFAULT[key]; ySlider.set(st.logy);
    st.cusps = cusps(f, DENSE_M);
    st.hoverCusp = null;
    st.curve = null;
    scheduleCurve();
    // counting data (cached; the large ones take a moment)
    st.data = null;
    redrawB(); updateReadout();
    const gen = st.gen;
    setTimeout(() => {
      if (gen !== st.gen) return;
      let d = dataCache.get(key);
      if (!d) { d = countingData(f, f.N); dataCache.set(key, d); }
      st.data = d;
      nSlider.setRange(1, f.N);
      st.n = N_START[key]; nSlider.set(st.n);
      redrawB(); updateReadout();
    }, 0);
  }

  // The curve: uniform samples plus clusters around every cusp with m ≤ DENSE_M, so the needles are caught.
  let curveQueued = false;
  function scheduleCurve() {
    if (curveQueued) return;
    curveQueued = true;
    setTimeout(() => { curveQueued = false; computeCurve(); }, 0);
  }
  function computeCurve() {
    const f = st.form, y = Math.pow(10, st.logy);
    const xs = new Set();
    const U = 1600;
    for (let i = 0; i <= U; i++) xs.add(i / U);
    for (const c of st.cusps) for (const t of [0, 0.25, 0.5, 1, 1.6, 2.5, 4, 7, 12]) {
      if (c.x + t * y <= 1) xs.add(c.x + t * y);
      if (c.x - t * y >= 0) xs.add(c.x - t * y);
    }
    const arr = [...xs].sort((a, b) => a - b);
    const vals = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) vals[i] = spikeValue(f, arr[i], y);
    st.curve = { xs: arr, vals, y };
    cvA.redraw(); updateCuspReadout();
  }

  // ── drawing: panel A ──
  let geomA = null;
  function drawA(ctx, w, h) {
    const P = palette();
    const padL = 34, padR = 10, padT = 14, padB = 30;
    const X = (x) => padL + x * (w - padL - padR);
    const top = 1.08;
    const Y = (v) => padT + (1 - v / top) * (h - padT - padB);
    geomA = { X, Y, padL, padR, w, h };
    // grid
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (const v of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke(); }
    ctx.strokeStyle = P.border;
    ctx.beginPath(); ctx.moveTo(padL, Y(0) + 0.5); ctx.lineTo(w - padR, Y(0) + 0.5); ctx.stroke();
    // curve: max per pixel column, drawn as a filled envelope so needles survive
    const lab = [];
    if (st.curve) {
      const { xs, vals } = st.curve;
      const cols = Math.max(1, Math.ceil(w - padL - padR) + 1);
      const colMax = new Float64Array(cols).fill(-1);
      for (let i = 0; i < xs.length; i++) {
        const c = Math.round(X(xs[i]) - padL);
        if (c >= 0 && c < cols && vals[i] > colMax[c]) colMax[c] = vals[i];
      }
      ctx.fillStyle = rgba(P.count, 0.22);
      ctx.strokeStyle = P.count; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(padL, Y(0));
      let last = 0;
      for (let c = 0; c < cols; c++) { if (colMax[c] >= 0) last = colMax[c]; ctx.lineTo(padL + c, Y(Math.min(top, last))); }
      ctx.lineTo(w - padR, Y(0)); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      last = 0;
      for (let c = 0; c < cols; c++) { if (colMax[c] >= 0) last = colMax[c]; const yy = Y(Math.min(top, last)); if (c) ctx.lineTo(padL + c, yy); else ctx.moveTo(padL + c, yy); }
      ctx.stroke();
    }
    // predicted heights
    if (st.cusps) {
      for (const c of st.cusps) {
        if (c.m > SPIKE_M) continue;
        const on = st.hoverCusp && st.hoverCusp.a === c.a && st.hoverCusp.m === c.m;
        ctx.fillStyle = c.G < 1e-9 ? P.surface : P.trivial;
        ctx.strokeStyle = P.trivial; ctx.lineWidth = on ? 2.2 : 1.4;
        const r = on ? 5 : c.m <= 4 ? 4 : 3;
        ctx.beginPath(); ctx.arc(X(c.x), Y(Math.min(top, c.G)), r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      }
      const mLab = st.form.q || w < 560 ? 4 : 6;
      for (const c of st.cusps) {
        if (c.m > mLab || c.x > 1) continue;
        const tex = c.m === 1 ? String(c.a) : `\\tfrac{${c.a}}{${c.m}}`;
        lab.push({ id: `x${c.a}/${c.m}`, x: X(c.x), y: Y(0) + 5, anchor: 's', tex, cls: 'small' });
      }
    }
    for (const v of [0.5, 1]) lab.push({ id: 'g' + v, x: padL - 5, y: Y(v), anchor: 'w', tex: String(v), cls: 'small' });
    labA.set(lab);
  }

  pointer(cvA.wrap, {
    hover(x, y) {
      if (!geomA || !st.cusps) return;
      let best = null, bd = 14;
      for (const c of st.cusps) {
        if (c.m > SPIKE_M) continue;
        const d = Math.hypot(geomA.X(c.x) - x, Math.max(0, Math.abs(geomA.Y(Math.min(1.08, c.G)) - y) - 30) * 0.3);
        if (d < bd) { bd = d; best = c; }
      }
      if (best !== st.hoverCusp) { st.hoverCusp = best; cvA.redraw(); updateCuspReadout(); }
    },
    leave() { if (st.hoverCusp) { st.hoverCusp = null; cvA.redraw(); updateCuspReadout(); } },
  });

  function updateCuspReadout() {
    const c = st.hoverCusp || st.cusps && st.cusps.find((u) => u.m === 1 && u.a === 0);
    if (!c || !st.curve) { roA.innerHTML = ''; return; }
    const y = st.curve.y;
    const actual = spikeValue(st.form, c.x, y);
    const frac = c.m === 1 ? String(c.a) : `\\frac{${c.a}}{${c.m}}`;
    const Gtex = c.G < 1e-9 ? '0' : fmt.tex(+c.G.toPrecision(4), 4);
    setTex(roA, `<table>
      <tr><td>cusp $${frac}$</td><td class="num">$|G|=${Gtex}$</td></tr>
      <tr><td>at $y=10^{${st.logy.toFixed(2)}}$</td><td class="num">$${fmt.tex(+actual.toPrecision(4), 4)}$</td></tr>
    </table>`);
  }

  // ── drawing: panel B (r_Q(n) against C(n)) and the remainder strip ──
  function redrawB() { cvB.redraw(); cvR.redraw(); }
  let geomB = null, geomR = null;
  function drawB(ctx, w, h) {
    const P = palette(), d = st.data, f = st.form;
    const lab = [];
    setTex(hintB, f.q
      ? `<b>The count against the main term</b>, both axes logarithmic. One dot per $n\\le${fmt.tex(f.N)}$ with $r_Q(n)\\ne0$: $r_Q(n)$ against $C(n)$. The cloud closes in on the diagonal as $C(n)$ grows, because the error is only about $\\sqrt{C(n)}$. Rings: $n=p^k$, $k\\ge2$.`
      : `<b>The count against the main term</b>, both axes logarithmic. One dot per $n\\le${fmt.tex(f.N)}$: $r_4(n)$ against $C(n)$. Every dot is on the diagonal: the singular series is exact.`);
    if (!d) { labB.set([{ id: 'wait', x: w / 2, y: h / 2, tex: '\\text{counting}\\dots' }]); geomB = null; return; }
    const padL = 40, padR = 12, padT = 12, padB = 30;
    // log–log: one dot per n with r(n) > 0 and C(n) ≥ 1/2 (both vanish together off the local obstructions)
    let mx = 0;
    for (let n = 1; n <= d.N; n++) mx = Math.max(mx, d.r[n], d.C[n]);
    const lo = Math.log10(0.5), hi = Math.log10(mx * 1.25);
    const X = (v) => padL + ((Math.log10(v) - lo) / (hi - lo)) * (w - padL - padR);
    const Y = (v) => h - padB - ((Math.log10(v) - lo) / (hi - lo)) * (h - padT - padB);
    const shown = (n) => d.r[n] > 0 && d.C[n] >= 0.5;
    geomB = { X, Y, shown };
    // axes and diagonal
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (let e = 0; Math.pow(10, e) < mx * 1.25; e++) {
      const v = Math.pow(10, e);
      ctx.beginPath(); ctx.moveTo(X(v), padT); ctx.lineTo(X(v), h - padB); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke();
      lab.push({ id: 'bx' + e, x: X(v), y: h - padB + 5, anchor: 's', tex: e < 4 ? fmt.tex(v) : `10^{${e}}`, cls: 'small' });
      lab.push({ id: 'by' + e, x: padL - 5, y: Y(v), anchor: 'w', tex: e < 4 ? fmt.tex(v) : `10^{${e}}`, cls: 'small' });
    }
    ctx.strokeStyle = P.border;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
    ctx.strokeStyle = rgba(P.trivial, 0.8); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(X(0.5), Y(0.5)); ctx.lineTo(X(mx * 1.25), Y(mx * 1.25)); ctx.stroke();
    // dots
    const big = d.N > 5000;
    ctx.fillStyle = rgba(P.count, big ? (d.N > 50000 ? 0.18 : 0.3) : 0.6);
    const r0 = big ? 1.1 : 1.8;
    for (let n = 1; n <= d.N; n++) {
      if (!shown(n)) continue;
      ctx.fillRect(X(d.C[n]) - r0, Y(d.r[n]) - r0, 2 * r0, 2 * r0);
    }
    // rings: n = p^k with k ≥ 2, powers like the ones the paper counts (for the form (1.3) only)
    ctx.strokeStyle = P.trivial; ctx.lineWidth = 1.3;
    for (let n = 2; f.q && n <= d.N; n++) {
      const pp = paperPower(n, f, d.spf);
      if (!pp || pp[1] < 2 || !shown(n)) continue;
      ctx.beginPath(); ctx.arc(X(d.C[n]), Y(d.r[n]), 3.6, 0, 2 * Math.PI); ctx.stroke();
    }
    // selected n
    const n = st.hoverN || st.n;
    if (n >= 1 && n <= d.N && shown(n)) {
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(X(d.C[n]), Y(d.r[n]), 6.5, 0, 2 * Math.PI); ctx.stroke();
    }
    lab.push({ id: 'bxl', x: w - padR, y: h - padB - 5, anchor: 'nw', tex: 'C(n)', cls: 'small halo', color: P.trivial });
    lab.push({ id: 'byl', x: padL + 6, y: padT, anchor: 'se', tex: f.q ? 'r_Q(n)' : 'r_4(n)', cls: 'small halo', color: P.count });
    labB.set(lab);
  }

  function drawR(ctx, w, h) {
    const P = palette(), d = st.data, f = st.form;
    setTex(hintR, f.q
      ? '<b>The remainder.</b> $\\big(r_Q(n)-C(n)\\big)/\\big(d(n)\\sqrt n\\big)$: the coefficients of a cusp form, normalized by the Ramanujan bound. It stays bounded while $C(n)$ grows like $n$.'
      : '<b>The remainder.</b> $\\big(r_4(n)-C(n)\\big)/\\big(d(n)\\sqrt n\\big)$ is exactly zero: no cusp form.');
    if (!d) { labR.set([]); geomR = null; return; }
    const padL = 40, padR = 12, padT = 10, padB = 24;
    const lim = Math.max(0.5, Math.ceil(d.maxNorm * 1.15 * 4) / 4);
    const X = (n) => padL + ((n - 1) / (d.N - 1)) * (w - padL - padR);
    const Y = (v) => padT + ((lim - v) / (2 * lim)) * (h - padT - padB);
    geomR = { X, Y, padL, padR, w };
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (const v of [-lim, lim]) { ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = P.border;
    ctx.beginPath(); ctx.moveTo(padL, Y(0) + 0.5); ctx.lineTo(w - padR, Y(0) + 0.5); ctx.stroke();
    const big = d.N > 5000;
    ctx.fillStyle = rgba(P.graph, big ? 0.4 : 0.75);
    const r0 = big ? 0.9 : 1.6;
    for (let n = 1; n <= d.N; n++) {
      if (!d.r[n] && !d.C[n]) continue;
      ctx.fillRect(X(n) - r0, Y(d.bn[n]) - r0, 2 * r0, 2 * r0);
    }
    const n = st.hoverN || st.n;
    if (n >= 1 && n <= d.N) {
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X(n), padT); ctx.lineTo(X(n), h - padB); ctx.stroke();
    }
    const lab = [
      { id: 'rl', x: padL - 5, y: Y(lim), anchor: 'w', tex: fmt.tex(lim), cls: 'small' },
      { id: 'r0', x: padL - 5, y: Y(0), anchor: 'w', tex: '0', cls: 'small' },
      { id: 'rm', x: padL - 5, y: Y(-lim), anchor: 'w', tex: '-' + fmt.tex(lim), cls: 'small' },
      { id: 'rx', x: w - padR, y: h - padB + 4, anchor: 'sw', tex: `n\\le ${fmt.tex(d.N)}`, cls: 'small' },
    ];
    labR.set(lab);
  }

  // hovering either panel picks an n
  pointer(cvB.wrap, {
    hover(x, y) {
      const d = st.data;
      if (!d || !geomB) return;
      let best = 0, bd = 9;
      for (let n = 1; n <= d.N; n++) {
        if (!geomB.shown(n)) continue;
        const dd = Math.hypot(geomB.X(d.C[n]) - x, geomB.Y(d.r[n]) - y);
        if (dd < bd) { bd = dd; best = n; }
      }
      if (best && best !== st.hoverN) { st.hoverN = best; redrawB(); updateReadout(); }
    },
    leave() { if (st.hoverN) { st.hoverN = null; redrawB(); updateReadout(); } },
  });
  pointer(cvR.wrap, {
    hover(x) {
      const d = st.data;
      if (!d || !geomR) return;
      const n0 = Math.round(1 + ((x - geomR.padL) / (geomR.w - geomR.padL - geomR.padR)) * (d.N - 1));
      // nearest n with a nonzero count, so the readout is never empty
      let best = 0;
      for (let k = 0; k < 400 && !best; k++) for (const n of [n0 + k, n0 - k]) if (n >= 1 && n <= d.N && (d.r[n] || d.C[n])) { best = n; break; }
      if (best && best !== st.hoverN) { st.hoverN = best; redrawB(); updateReadout(); }
    },
    leave() { if (st.hoverN) { st.hoverN = null; redrawB(); updateReadout(); } },
  });

  // ── the readout: where C(n) comes from ──
  function updateReadout() {
    const d = st.data, f = st.form;
    if (!d) { setTex(roB, '<span class="dim">Counting…</span>'); return; }
    const n = st.hoverN || st.n;
    const parts = mainTermParts(f, n, d.spf);
    const fac = factor(n, d.spf).map(([l, v]) => (v > 1 ? `${l}^{${v}}` : `${l}`)).join('\\cdot') || '1';
    const r = d.r[n], C = parts.C, diff = r - C;
    const partial = seriesPartials(f, n, 64);
    const rowsBad = parts.bad.map(([l, dl]) => {
      const ks = l === 2 ? [1, 2, 3, 4, 5, 6] : l <= 5 ? [1, 2, 3, 4] : [1, 2, 3];
      const counted = ks.map((k) => +countDensity(f, n, l, k).toFixed(4));
      let v = 0;
      for (let m = n; m % l === 0; m /= l) v++;
      const kStable = v + (l === 2 ? 3 : 2);
      const more = kStable > ks[ks.length - 1] ? `,\\ \\dots$ (settles from $k=${kStable}$)` : '$';
      return `<tr><td>$\\delta_{${l}}(n)$</td><td class="num">$${fmtD(dl)}$</td></tr>
        <tr><td colspan="2" class="dim" style="font-size:.72rem">counted mod $${l}^k$, $k=${ks[0]},\\dots,${ks[ks.length - 1]}$: $${counted.map(fmtD).join(',\\ ')}${more}</td></tr>`;
    }).join('');
    const exact = Math.abs(diff) < 1e-6 * Math.max(1, C);
    const pp = paperPower(n, f, d.spf);
    setTex(roB, `<table>
      <tr><td colspan="2">$n=${n}${fac !== String(n) ? '=' + fac : ''}$${pp && pp[1] > 1 && f.q ? ` <span class="dim">(a power of $p=${pp[0]}$, as in the paper)</span>` : ''}</td></tr>
      <tr class="sep"><td>volume $\\pi^2n/\\sqrt{\\det Q}$</td><td class="num">$${fmtD(parts.arch)}$</td></tr>
      ${rowsBad}
      <tr><td>other primes</td><td class="num">$${fmtD(parts.goodConst * parts.goodDiv)}$</td></tr>
      <tr><td>$\\mathfrak S(n)=\\prod_\\ell\\delta_\\ell(n)$</td><td class="num">$${fmtD(parts.series)}$</td></tr>
      <tr><td class="dim" style="font-size:.74rem">$\\sum_{m\\le M}A_m(n)$, $M=1,4,16,64$</td><td class="num dim" style="font-size:.72rem">$${[1, 4, 16, 64].map((M) => fmtD(partial[M])).join(',\\ ')}$</td></tr>
      <tr class="sep"><td>main term $C(n)$</td><td class="num" style="color:var(--c-trivial)">$${fmtD(C)}$</td></tr>
      <tr><td>count $${f.q ? 'r_Q' : 'r_4'}(n)$</td><td class="num" style="color:var(--c-count)">$${fmt.tex(r)}$</td></tr>
      <tr><td>difference</td><td class="num" style="color:var(--c-graph)">$${exact ? '0' : fmtD(diff)}$</td></tr>
      <tr><td colspan="2">${exact
        ? (f.q ? (C === 0 ? '<span class="ok">✓</span> $C(n)=0$ and no solutions: a local obstruction' : '<span class="ok">✓</span> here the cusp form has a zero coefficient') : '<span class="ok">✓</span> exact, as Jacobi (1.2) says')
        : `remainder $/\\big(d(n)\\sqrt n\\big)=${fmtD(diff / (numDivisors(n, d.spf) * Math.sqrt(n)))}$`}</td></tr>
    </table>
    <p class="hint" style="margin:.45rem 0 0">${f.q
      ? `Over all $n\\le${fmt.tex(d.N)}$: $|r_Q(n)-C(n)|\\le ${fmtD(d.maxNorm)}\\,d(n)\\sqrt n$.`
      : `<span class="ok">✓</span> $r_4(n)=C(n)$ for every $n\\le${fmt.tex(d.N)}$.`}</p>`);
  }

  onTheme(() => { cvA.redraw(); redrawB(); });
  setForm('four');
}

function fmtD(v) {
  if (!Number.isFinite(v)) return '\\text{—}';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return fmt.tex(Math.round(v));
  if (Number.isInteger(+v.toFixed(6))) return String(+v.toFixed(6));
  return (+v.toPrecision(4)).toString();
}

function tickVals(mx) {
  const raw = mx / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => mx / s <= 5);
  const out = [];
  for (let v = step; v < mx; v += step) out.push(+v.toFixed(6));
  return out;
}
