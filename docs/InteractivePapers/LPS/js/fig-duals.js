// Figure S4 — two unitary duals and the discrete series. The eigenvalues of X^{p,q} sit in the
// tempered part of the spherical dual of PGL2(Q_p); after Jacquet–Langlands the same automorphic
// representations are the discrete series D_2 at ∞, which is why Weil's Riemann hypothesis for
// curves (through Eichler–Shimura) puts every Satake parameter on the unit circle.
import { el, makeCanvas, labelLayer, setTex, chips, segmented, controls, palette, onTheme, fmt, rgba, pointer, cssVar } from './common.js';
import { kestenDensity, isPrime } from './lps.js';
import { getSpectrum, SPECTRUM_PAIRS } from './spectrum.js';

// ───────────────────────── pure math (node-testable) ─────────────────────────

/** Laplace (Casimir) eigenvalue of the representation with spectral parameter s. */
export const casimir = (s) => s * (1 - s);

/** Discrete series D_k of PGL2(R) (k even): Casimir eigenvalue (k/2)(1−k/2), Plancherel atom ∝ k−1,
 *  and the dimension k−1 of the SO(3) representation that Jacquet–Langlands sends to it. */
export function discreteSeries(kMax = 6) {
  const out = [];
  for (let k = 2; k <= kMax; k += 2) out.push({ k, lambda: (k / 2) * (1 - k / 2), mass: k - 1, dim: k - 1 });
  return out;
}

/** Plancherel density of PGL2(R) on the principal series, in the variable λ = 1/4 + r². */
export function plancherelR(lambda) {
  return lambda <= 0.25 ? 0 : 0.5 * Math.tanh(Math.PI * Math.sqrt(lambda - 0.25));
}

/**
 * Satake parameter z of the spherical representation with Hecke eigenvalue λ: λ = √p (z + 1/z).
 * Tempered (|λ| ≤ 2√p): z = e^{iθ}, λ = 2√p cos θ. Otherwise z is real with |z| > 1.
 * kind: 'tempered' | 'complementary' | 'trivial' (λ = p+1) | 'sign' (λ = −(p+1)) | 'outside'.
 */
export function satake(lambda, p, tol = 1e-9) {
  const R = 2 * Math.sqrt(p), k = p + 1;
  const a = Math.abs(lambda);
  if (a <= R * (1 + tol)) {
    const th = Math.acos(Math.max(-1, Math.min(1, lambda / R)));
    return { kind: 'tempered', theta: th, re: Math.cos(th), im: Math.sin(th), abs: 1 };
  }
  const r = (a + Math.sqrt(Math.max(0, a * a - 4 * p))) / R;
  const sg = lambda < 0 ? -1 : 1;
  const kind = Math.abs(a - k) <= tol * k * 100 ? (sg > 0 ? 'trivial' : 'sign') : a < k ? 'complementary' : 'outside';
  return { kind, theta: null, re: sg * r, im: 0, abs: r };
}

/** λ = √p (z + 1/z) for z = re + i·im (real part; the imaginary part vanishes on the unitary locus). */
export function lambdaFromZ(re, im, p) {
  const m2 = re * re + im * im;
  return Math.sqrt(p) * (re + re / m2);
}

/** Sato–Tate density on [0, π]. */
export const satoTate = (th) => (2 / Math.PI) * Math.sin(th) ** 2;

/** Kesten–McKay μ_{p+1} pushed to the angle θ (λ = 2√p cos θ), by change of variables. */
export function kestenTheta(th, p) {
  const R = 2 * Math.sqrt(p);
  return kestenDensity(R * Math.cos(th), p + 1) * R * Math.sin(th);
}
/** The same density in closed form: 2(p+1) sin²θ / (π((√p + 1/√p)² − 4cos²θ)). */
export function kestenThetaClosed(th, p) {
  const s = Math.sqrt(p) + 1 / Math.sqrt(p);
  return (2 * (p + 1) * Math.sin(th) ** 2) / (Math.PI * (s * s - 4 * Math.cos(th) ** 2));
}

/** Group a spectrum into distinct values with multiplicities, and summarize it against the band. */
export function spectrumSummary(lam, p, tol = 1e-7) {
  const sorted = Array.from(lam).sort((a, b) => b - a);
  const groups = [];
  for (const x of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.x - x) < tol * (p + 1)) g.m++;
    else groups.push({ x, m: 1 });
  }
  const R = 2 * Math.sqrt(p);
  let inside = 0, trivial = 0, outside = 0, maxRatio = 0;
  for (const g of groups) {
    g.sat = satake(g.x, p, 1e-7);
    if (g.sat.kind === 'trivial' || g.sat.kind === 'sign') { trivial += g.m; continue; }
    if (g.sat.kind === 'tempered') inside += g.m; else outside += g.m;
    maxRatio = Math.max(maxRatio, Math.abs(g.x) / R);
  }
  return { n: sorted.length, groups, inside, trivial, outside, maxRatio };
}

// elliptic curves y² + a1 xy + a3 y = x³ + a2 x² + a4 x + a6, as [a1, a2, a3, a4, a6]
export const CURVES = {
  '11a': { tex: 'y^2+y=x^3-x^2', a: [0, -1, 1, 0, 0], N: 11, cm: false },
  '37a': { tex: 'y^2+y=x^3-x', a: [0, 0, 1, -1, 0], N: 37, cm: false },
  '32a': { tex: 'y^2=x^3-x', a: [0, 0, 0, -1, 0], N: 32, cm: true },
};

/** Discriminant of a Weierstrass model. */
export function discriminant([a1, a2, a3, a4, a6]) {
  const b2 = a1 * a1 + 4 * a2, b4 = 2 * a4 + a1 * a3, b6 = a3 * a3 + 4 * a6;
  const b8 = a1 * a1 * a6 + 4 * a2 * a6 - a1 * a3 * a4 + a2 * a3 * a3 - a4 * a4;
  return -b2 * b2 * b8 - 8 * b4 * b4 * b4 - 27 * b6 * b6 + 9 * b2 * b4 * b6;
}

const mod = (x, p) => ((x % p) + p) % p;

/** Number of points of the curve over F_p, the point at infinity included. */
export function countPoints([a1, a2, a3, a4, a6], p) {
  let affine = 0;
  if (p === 2) {
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      if (mod(y * y + a1 * x * y + a3 * y - (x * x * x + a2 * x * x + a4 * x + a6), 2) === 0) affine++;
    }
    return affine + 1;
  }
  // p odd: (2y + a1 x + a3)² = 4(x³ + a2 x² + a4 x + a6) + (a1 x + a3)², and y ↦ 2y + a1x + a3 is a bijection
  const chi = new Int8Array(p).fill(-1);
  chi[0] = 0;
  for (let t = 1; t < p; t++) chi[(t * t) % p] = 1;
  for (let x = 0; x < p; x++) {
    const f = mod(4 * (mod(x * x, p) * x + a2 * x * x + a4 * x + a6) + (a1 * x + a3) * (a1 * x + a3), p);
    affine += 1 + chi[f];
  }
  return affine + 1;
}

/** a_p = p + 1 − #E(F_p). */
export const apOf = (a, p) => p + 1 - countPoints(a, p);

/** For every prime p ≤ P of good reduction: { p, ap, theta } with a_p = 2√p cos θ. */
export function curveData(key, P = 1000) {
  const c = CURVES[key], D = Math.abs(discriminant(c.a));
  const out = [];
  for (let p = 2; p <= P; p++) {
    if (!isPrime(p) || D % p === 0) continue;
    const ap = apOf(c.a, p);
    const r = ap / (2 * Math.sqrt(p));
    out.push({ p, ap, ratio: r, theta: Math.acos(Math.max(-1, Math.min(1, r))) });
  }
  return out;
}

/** Histogram of angles in [0, π] as a density (weights optional). */
export function angleHistogram(thetas, bins, weights = null) {
  const c = new Array(bins).fill(0);
  let tot = 0;
  thetas.forEach((t, i) => {
    const w = weights ? weights[i] : 1;
    let b = Math.floor((t / Math.PI) * bins);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    c[b] += w; tot += w;
  });
  const bw = Math.PI / bins;
  return c.map((v) => (tot ? v / (tot * bw) : 0));
}

// ───────────────────────── the figure ─────────────────────────

const DS = discreteSeries(6);

const CHAIN = [
  { key: 'so3', title: 'Functions on $X^{p,q}$', sub: 'automorphic forms on $H^\\times$; at $\\infty$, $H^\\times(\\R)/\\R^\\times\\cong SO(3)$ is compact, so $\\pi_\\infty$ is trivial' },
  { key: 'jl', title: 'Jacquet–Langlands', sub: 'the same Hecke eigenvalue at $p$; at $\\infty$ the $SO(3)$-representation of dimension $k-1$ goes to $D_k$' },
  { key: 'd2', title: 'A weight-two cusp form', sub: '$\\pi_\\infty=D_2$, the discrete series: a holomorphic form on the upper half-plane' },
  { key: 'es', title: 'Eichler–Shimura', sub: '$\\lambda=a_p$, the trace of Frobenius on the Jacobian of a modular curve over $\\F_p$' },
  { key: 'weil', title: 'Weil', sub: 'the Frobenius eigenvalues have $|\\alpha|=\\sqrt p$: the Riemann hypothesis for curves' },
  { key: 'band', title: '$|\\lambda|\\le2\\sqrt p$', sub: 'every Satake parameter $z=\\alpha/\\sqrt p$ is on the unit circle', goal: true },
];
const BRANCH = {
  key: 'maass', title: 'Compare: Maass forms',
  sub: '$\\pi_\\infty$ in the principal series, and no curve behind them. Ramanujan is open at $p$; at $\\infty$ it is Selberg\'s conjecture $\\lambda_1\\ge\\frac14$ (known: $\\lambda_1\\ge\\frac{975}{4096}$, Kim–Sarnak).',
};

export function mount(root) {
  const st = {
    p: 17, q: 13, gen: 0, sum: null, hover: null, focus: null,
    source: 'X', curve: '11a', cdata: null, satHover: null,
  };
  const accent = () => cssVar('--accent');

  // ── row 1: the two duals ──
  const row1 = el('div', { class: 'fig-row' });
  const left1 = el('div', { class: 'grow' }), right1 = el('div', { class: 'side' });
  row1.append(left1, right1);
  root.append(row1);
  const hint1 = el('p', { class: 'panel-hint' });
  left1.append(hint1);
  setTex(hint1, 'Unitary representations, placed by the eigenvalue they give: Laplace at $\\infty$, Hecke at $p$.');
  const cvD = makeCanvas(left1, { aspect: (w) => (w < 520 ? 1.3 : 0.7), maxHeight: 470, minHeight: 380, draw: drawDuals });
  const labD = labelLayer(cvD.wrap);

  const ctl1 = controls(right1);
  chips(ctl1, {
    label: 'the graph $X^{p,q}$',
    options: SPECTRUM_PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: st.p + ',' + st.q,
    onchange: (key) => { const [p, q] = key.split(',').map(Number); setPair(p, q); },
  });
  const legend1 = el('div', { class: 'hint', style: 'margin-top:.1rem' });
  ctl1.append(legend1);
  const ro1 = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right1.append(ro1);

  // ── the chain ──
  const chainWrap = el('div', { style: 'margin:1.1rem 0 1rem' });
  const chainHead = el('p', { class: 'panel-hint' });
  setTex(chainHead, 'Why the bound is known for these forms. <b>Hover</b> a step to see it in the pictures.');
  const chainRow = el('div', { style: 'display:flex;flex-wrap:wrap;gap:.45rem;align-items:stretch' });
  const branch = el('div');
  chainWrap.append(chainHead, chainRow, branch);
  root.append(chainWrap);
  const boxes = [];
  const boxStyle = (goal) => `display:block;flex:1 1 118px;min-width:0;border:1px solid var(${goal ? '--good' : '--border'});border-radius:var(--r-sm);padding:.5rem .6rem;background:var(--surface);font-size:.8rem;line-height:1.3;cursor:default;transition:border-color .12s,box-shadow .12s`;
  function makeBox(item, extra = '') {
    const b = el('div', { tabindex: '0', role: 'button', 'aria-label': item.title.replace(/\$/g, ''), style: boxStyle(item.goal) + extra });
    const t = el('b', { style: 'display:block;font-weight:700;margin-bottom:.15rem' });
    const s = el('span', { style: 'color:var(--muted);font-size:.76rem' });
    b.append(t, s);
    setTex(t, item.title); setTex(s, item.sub);
    const on = () => setFocus(item.key), off = () => setFocus(null);
    b.addEventListener('pointerenter', on);
    b.addEventListener('pointerleave', off);
    b.addEventListener('focus', on);
    b.addEventListener('blur', off);
    b.addEventListener('click', () => setFocus(st.focus === item.key ? null : item.key));
    boxes.push([item.key, b]);
    return b;
  }
  const arrows = [];
  CHAIN.forEach((item, i) => {
    chainRow.append(makeBox(item));
    if (i < CHAIN.length - 1) {
      const a = el('span', { 'aria-hidden': 'true', style: 'flex:0 0 auto;align-self:center;color:var(--muted);font-size:.95rem' }, '→');
      arrows.push(a);
      chainRow.append(a);
    }
  });
  branch.style.cssText = 'margin-top:.45rem;display:flex';
  branch.append(makeBox(BRANCH, ';border-style:dashed;background:transparent;flex:1 1 100%'));
  // narrow: one column with down arrows
  new ResizeObserver(() => {
    const narrow = chainRow.clientWidth < 560;
    chainRow.style.flexDirection = narrow ? 'column' : 'row';
    for (const a of arrows) { a.textContent = narrow ? '↓' : '→'; a.style.alignSelf = 'center'; a.style.lineHeight = narrow ? '1' : ''; }
    for (const [, b] of boxes) b.style.flexBasis = narrow ? 'auto' : (b.parentNode === branch ? '100%' : '118px');
  }).observe(chainRow);

  function setFocus(key) {
    if (st.focus === key) return;
    st.focus = key;
    for (const [k, b] of boxes) {
      const onIt = k === key;
      b.style.borderColor = onIt ? 'var(--accent)' : k === 'band' ? 'var(--good)' : 'var(--border)';
      b.style.boxShadow = onIt ? '0 0 0 2px var(--accent-soft)' : '';
    }
    cvD.redraw(); cvS.redraw();
  }

  // ── row 2: the Satake circle ──
  const row2 = el('div', { class: 'fig-row' });
  const left2 = el('div', { class: 'grow' }), right2 = el('div', { class: 'side' });
  row2.append(left2, right2);
  root.append(row2);
  const hint2 = el('p', { class: 'panel-hint' });
  left2.append(hint2);
  const cvS = makeCanvas(left2, { aspect: (w) => (w < 520 ? 1.5 : 0.52), maxHeight: 560, minHeight: 280, draw: drawSatake });
  const labS = labelLayer(cvS.wrap);

  const ctl2 = controls(right2);
  const srcName = el('span', { class: 'ctl-name', style: 'color:var(--muted);font-size:.8rem' });
  ctl2.append(srcName);
  setTex(srcName, 'Satake parameters of');
  segmented(ctl2, [['X', '$X^{p,q}$, one $p$'], ['E', 'a curve, many $p$']], 'X', (v) => { st.source = v; st.satHover = null; curveChips.el.style.display = v === 'E' ? '' : 'none'; updateHint2(); updateRo2(); cvS.redraw(); });
  const curveChips = chips(ctl2, {
    label: 'the elliptic curve',
    options: Object.entries(CURVES).map(([k, c]) => [k, `$${c.tex}$`]),
    value: st.curve,
    onchange: (k) => { st.curve = k; st.cdata = curveData(k); st.satHover = null; updateRo2(); cvS.redraw(); },
  });
  curveChips.el.style.display = 'none';
  const ro2 = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right2.append(ro2);
  st.cdata = curveData(st.curve);

  function updateHint2() {
    setTex(hint2, st.source === 'X'
      ? `$\\lambda=\\sqrt p\\,(z+z^{-1})$: each eigenvalue of $X^{${st.p},${st.q}}$ as its two Satake parameters $z=e^{\\pm i\\theta}$, and the angles against Kesten–McKay.`
      : `$a_p=\\sqrt p\\,(z+z^{-1})$ for each prime $p\\le1000$: one point per prime, and the angles against Sato–Tate.`);
  }

  // ── data ──
  function setPair(p, q) {
    st.p = p; st.q = q; st.sum = null; st.hover = null; st.gen++;
    const gen = st.gen;
    updateLegend(); updateRo1(); updateHint2(); updateRo2();
    cvD.redraw(); cvS.redraw();
    getSpectrum(p, q).then((res) => {
      if (gen !== st.gen) return;
      st.sum = spectrumSummary(res.lam, p);
      st.sum.bipartite = res.bipartite;
      updateRo1(); updateRo2(); cvD.redraw(); cvS.redraw();
    }).catch((e) => { setTex(ro1, `<span class="bad">Spectrum failed: ${String(e.message || e)}</span>`); });
  }

  function updateLegend() {
    const P = palette();
    setTex(legend1,
      `<span style="color:${P.graph}">■</span> eigenvalues of $X^{${st.p},${st.q}}$ &nbsp; ` +
      `<span style="color:${P.tree}">━</span> Plancherel densities &nbsp; ` +
      `<span style="color:${P.trivial}">●</span> one-dimensional &nbsp; ` +
      `<span style="background:${P.window};padding:0 .5em;border-radius:3px">&nbsp;</span> tempered`);
  }

  function updateRo1() {
    const { p, q } = st, s = st.sum, R = 2 * Math.sqrt(p);
    if (!s) { setTex(ro1, `<span class="dim">Computing the spectrum of $X^{${p},${q}}$…</span>`); return; }
    let hov = '';
    if (st.hover) {
      const g = st.hover, z = g.sat;
      const zs = z.kind === 'tempered' ? `e^{\\pm ${z.theta.toFixed(3)}i}` : `${z.re > 0 ? '' : '-'}p^{\\pm1/2}`;
      hov = `<tr class="sep"><td colspan="2">$\\lambda=${fmt.tex(+g.x.toFixed(4), 5)}$, multiplicity $${g.m}$<br>Satake $z=${zs}$ ${z.kind === 'tempered' ? '<span class="ok">✓</span> tempered' : z.kind === 'trivial' ? '(trivial representation)' : z.kind === 'sign' ? '(sign character)' : '<span class="bad">✗</span> not tempered'}</td></tr>`;
    }
    const allIn = s.outside === 0;
    setTex(ro1, `<table>
      <tr><td>$n=|X^{${p},${q}}|$</td><td class="num">${s.n.toLocaleString('en-US')}</td></tr>
      <tr><td>in the tempered band</td><td class="num">${s.inside.toLocaleString('en-US')}</td></tr>
      <tr><td>one-dimensional, $\\pm(p+1)$</td><td class="num">${s.trivial}</td></tr>
      <tr><td>anywhere else</td><td class="num">${s.outside}</td></tr>
      <tr><td colspan="2">${allIn ? '<span class="ok">✓</span> every other eigenvalue is tempered' : '<span class="bad">✗</span> a non-tempered eigenvalue'}</td></tr>
      <tr class="sep"><td>largest $|\\lambda|/2\\sqrt p$, nontrivial</td><td class="num">${s.maxRatio.toFixed(4)}</td></tr>
      ${hov}
    </table>`);
  }

  function updateRo2() {
    if (st.source === 'X') {
      const s = st.sum;
      if (!s) { setTex(ro2, `<span class="dim">Computing the spectrum…</span>`); return; }
      const nontriv = s.groups.filter((g) => g.sat.kind !== 'trivial' && g.sat.kind !== 'sign');
      const onCircle = nontriv.filter((g) => g.sat.kind === 'tempered').length;
      let hov = '';
      if (st.satHover && st.satHover.g) {
        const g = st.satHover.g;
        hov = `<tr class="sep"><td colspan="2">$\\lambda=${g.x.toFixed(4)}$ (multiplicity $${g.m}$), $\\theta=${g.sat.theta.toFixed(4)}$</td></tr>`;
      }
      setTex(ro2, `<table>
        <tr><td>distinct nontrivial $\\lambda$</td><td class="num">${nontriv.length}</td></tr>
        <tr><td>with $|z|=1$</td><td class="num">${onCircle}</td></tr>
        <tr><td colspan="2">${onCircle === nontriv.length ? '<span class="ok">✓</span> all on the unit circle: $X^{' + st.p + ',' + st.q + '}$ is Ramanujan' : '<span class="bad">✗</span> some are off the circle'}</td></tr>
        <tr class="sep"><td colspan="2" class="dim">The trivial eigenvalue $p+1$ sits at $z=p^{\\pm1/2}$, off the circle.</td></tr>
        ${hov}
      </table>`);
    } else {
      const d = st.cdata, c = CURVES[st.curve];
      let worst = d[0];
      for (const r of d) if (Math.abs(r.ratio) > Math.abs(worst.ratio)) worst = r;
      const ok = d.every((r) => Math.abs(r.ap) <= 2 * Math.sqrt(r.p));
      const zeros = d.filter((r) => r.ap === 0).length;
      let hov = '';
      if (st.satHover && st.satHover.r) {
        const r = st.satHover.r;
        hov = `<tr class="sep"><td colspan="2">$p=${r.p}$: $\\#E(\\F_{${r.p}})=${r.p + 1 - r.ap}$, $a_{${r.p}}=${r.ap}$, $|a_p|/2\\sqrt p=${Math.abs(r.ratio).toFixed(3)}$</td></tr>`;
      }
      setTex(ro2, `<table>
        <tr><td>$E:\\ ${c.tex}$</td><td class="num">conductor $${c.N}$</td></tr>
        <tr><td>primes $p\\le1000$ of good reduction</td><td class="num">${d.length}</td></tr>
        <tr><td colspan="2">${ok ? '<span class="ok">✓</span> $|a_p|\\le2\\sqrt p$ for every one (Hasse)' : '<span class="bad">✗</span>'}</td></tr>
        <tr><td>largest $|a_p|/2\\sqrt p$ <span class="dim">($p=${worst.p}$)</span></td><td class="num">${Math.abs(worst.ratio).toFixed(4)}</td></tr>
        <tr><td>$a_p=0$</td><td class="num">${zeros} of ${d.length}</td></tr>
        ${c.cm ? '<tr class="sep"><td colspan="2" class="dim">Complex multiplication by $\\Z[i]$: $a_p=0$ for every $p\\equiv3\\pmod4$, so the angles pile up at $\\pi/2$ instead of following Sato–Tate.</td></tr>' : ''}
        ${hov}
      </table>`);
    }
  }

  // ── drawing: the two duals ──
  let gD = null;
  function drawDuals(ctx, w, h) {
    const P = palette(), A = accent(), narrow = w < 520;
    const padL = 16, padR = 10;
    const yS = narrow ? 44 : 40;            // SO(3) row
    const yR = Math.round(h * (narrow ? 0.48 : 0.5)); // PGL2(R) axis
    const yP = h - 28;                        // PGL2(Q_p) axis
    const L = 6.6, c0 = 0.35, AS = Math.asinh(L / c0);
    const XR = (lam) => padL + (w - padL - padR) * (0.5 + (0.5 * Math.asinh(lam / c0)) / AS);
    const { p } = st, k = p + 1, R = 2 * Math.sqrt(p);
    const xm = k + 0.9;
    const XP = (lam) => padL + ((lam + xm) / (2 * xm)) * (w - padL - padR);
    const lab = [];
    const glow = (draw) => { ctx.save(); ctx.strokeStyle = rgba(A, 0.35); ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; draw(); ctx.restore(); };

    // ── SO(3) row ──
    lab.push({ id: 'so3t', x: w - padR, y: yS - 20, anchor: 'nw', tex: narrow ? 'SO(3)' : 'H^\\times(\\R)/\\R^\\times\\cong SO(3)', cls: 'small' });
    for (const d of DS) {
      const x = XR(d.lambda);
      if (st.focus === 'so3' && d.k === 2) glow(() => { ctx.beginPath(); ctx.arc(x, yS, 4, 0, 2 * Math.PI); ctx.stroke(); });
      ctx.fillStyle = d.k === 2 ? P.trivial : P.tree;
      ctx.beginPath(); ctx.arc(x, yS, d.k === 2 ? 5 : 4, 0, 2 * Math.PI); ctx.fill();
      lab.push({ id: 'dim' + d.k, x: x, y: yS - 8, anchor: 'n', tex: `\\dim ${d.dim}`, cls: 'small halo' });
    }

    // ── PGL2(R) ──
    const Hmax = yR - yS - 30;
    const Hden = Hmax * 0.5;
    const yDen = (v) => yR - (v / 0.5) * Hden;
    // principal series: Plancherel density, tempered fill
    const focusMaass = st.focus === 'maass';
    ctx.beginPath();
    ctx.moveTo(XR(0.25), yR);
    for (let i = 0; i <= 160; i++) { const lam = 0.25 + ((L - 0.25) * i) / 160; ctx.lineTo(XR(lam), yDen(plancherelR(lam))); }
    ctx.lineTo(XR(L), yR); ctx.closePath();
    ctx.fillStyle = P.window; ctx.fill();
    if (focusMaass) { ctx.fillStyle = rgba(A, 0.14); ctx.fill(); }
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) { const lam = 0.25 + ((L - 0.25) * i) / 160; const y = yDen(plancherelR(lam)); if (i) ctx.lineTo(XR(lam), y); else ctx.moveTo(XR(lam), y); }
    ctx.strokeStyle = P.tree; ctx.lineWidth = 1.8; ctx.stroke();
    // axis
    ctx.strokeStyle = P.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yR + 0.5); ctx.lineTo(w - padR, yR + 0.5); ctx.stroke();
    // complementary (0, 1/4), dashed
    if (focusMaass) glow(() => { ctx.beginPath(); ctx.moveTo(XR(0.02), yR); ctx.lineTo(XR(0.25), yR); ctx.stroke(); });
    ctx.strokeStyle = P.muted; ctx.lineWidth = 2.6; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(XR(0.02), yR); ctx.lineTo(XR(0.25), yR); ctx.stroke();
    ctx.setLineDash([]);
    // discrete series lollipops, and Jacquet–Langlands from SO(3)
    for (const d of DS) {
      const x = XR(d.lambda), top = yR - (d.mass / 5) * Hmax * 0.92;
      const isD2 = d.k === 2;
      if ((st.focus === 'd2' && isD2) || st.focus === 'jl') glow(() => { ctx.beginPath(); ctx.moveTo(x, yR); ctx.lineTo(x, top); ctx.stroke(); });
      // JL arrow
      ctx.strokeStyle = st.focus === 'jl' ? A : rgba(P.tree, 0.75); ctx.lineWidth = st.focus === 'jl' ? 1.6 : 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, yS + 7); ctx.lineTo(x, top - 9); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(x, top - 5); ctx.lineTo(x - 3.5, top - 11); ctx.lineTo(x + 3.5, top - 11); ctx.closePath(); ctx.fill();
      // stick + head
      const col = isD2 ? P.graph : P.ink;
      ctx.strokeStyle = col; ctx.lineWidth = isD2 ? 2.4 : 1.8;
      ctx.beginPath(); ctx.moveTo(x, yR); ctx.lineTo(x, top); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, top, isD2 ? 4.5 : 3.6, 0, 2 * Math.PI); ctx.fill();
      lab.push({ id: 'D' + d.k, x: x + (d.k === 6 ? 7 : -7), y: top, anchor: d.k === 6 ? 'e' : 'w', tex: `D_{${d.k}}`, color: col, cls: 'halo' });
    }
    // trivial representation at λ = 0
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.trivial; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(XR(0), yR, 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    // labels
    lab.push({ id: 'Rt', x: w - padR, y: yR - Hmax - 4, anchor: 'nw', tex: '\\PGL_2(\\R)' });
    lab.push({ id: 'maass', x: w - padR, y: yR - Hden - 5, anchor: 'nw', html: narrow ? 'principal series' : 'principal series: Maass forms', cls: 'small halo' });
    lab.push({ id: 'hol', x: XR(-6) + 2, y: yR + 22, anchor: 'se', html: narrow ? 'discrete series' : 'discrete series: holomorphic forms', cls: 'small halo' });
    lab.push({ id: 'jlLab', x: XR(0) + 7, y: (yS + yR - Hmax * 0.2) / 2, anchor: 'e', html: 'Jacquet–Langlands', cls: 'small halo', color: st.focus === 'jl' ? A : undefined });
    const tickR = narrow ? [[-6, '-6'], [-2, '-2'], [0, '0'], [0.25, '\\frac14'], [2, '2'], [6, '6']] : [[-6, '-6'], [-2, '-2'], [0, '0'], [0.25, '\\frac14'], [1, '1'], [2, '2'], [6, '6']];
    for (const [x, tex] of tickR) {
      ctx.strokeStyle = P.border; ctx.beginPath(); ctx.moveTo(XR(x), yR); ctx.lineTo(XR(x), yR + 4); ctx.stroke();
      lab.push({ id: 'tR' + tex, x: XR(x), y: yR + 6, anchor: 's', tex, cls: 'small' });
    }
    lab.push({ id: 'trivR', x: XR(0) - 5, y: yR + 22, anchor: 'sw', html: 'trivial', cls: 'small halo', color: P.trivial });
    lab.push({ id: 'compR', x: XR(0) + 5, y: yR + 22, anchor: 'se', html: narrow ? 'compl.' : 'complementary', cls: 'small halo' });
    lab.push({ id: 'lamR', x: w - padR, y: yR + 22, anchor: 'sw', tex: '\\lambda=s(1-s)', cls: 'small' });

    // ── PGL2(Q_p), spherical ──
    const topP = yR + 58, Hb = yP - topP;
    const focusBand = st.focus === 'band';
    ctx.fillStyle = P.window;
    ctx.fillRect(XP(-R), topP, XP(R) - XP(-R), yP - topP);
    if (focusBand) { ctx.fillStyle = rgba(A, 0.16); ctx.fillRect(XP(-R), topP, XP(R) - XP(-R), yP - topP); }
    const kmMax = kestenDensity(0, k);
    const sy = (v) => yP - (v / kmMax) * Hb * 0.78;
    // eigenvalues of X^{p,q}: one spike per distinct value, height ∝ √multiplicity
    const s = st.sum;
    if (s) {
      const maxM = Math.max(1, ...s.groups.filter((g) => g.sat.kind === 'tempered').map((g) => g.m));
      for (const g of s.groups) {
        const triv = g.sat.kind === 'trivial' || g.sat.kind === 'sign';
        const hh = triv ? Hb * 0.55 : 6 + Hb * 0.62 * Math.sqrt(g.m / maxM);
        const col = triv ? P.trivial : P.graph;
        ctx.strokeStyle = col; ctx.lineWidth = triv ? 2.4 : 1.6;
        ctx.beginPath(); ctx.moveTo(XP(g.x), yP); ctx.lineTo(XP(g.x), yP - hh); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(XP(g.x), yP - hh, triv ? 4 : 2.4, 0, 2 * Math.PI); ctx.fill();
        g._top = yP - hh;
        if (g === st.hover) { ctx.strokeStyle = P.text; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(XP(g.x), yP - hh, 7, 0, 2 * Math.PI); ctx.stroke(); }
      }
    } else {
      lab.push({ id: 'wait', x: w / 2, y: (topP + yP) / 2, html: 'computing the spectrum…', cls: 'small' });
    }
    // Kesten–McKay
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const lam = -R + (2 * R * i) / 200; const y = sy(kestenDensity(lam * 0.99999, k)); if (i) ctx.lineTo(XP(lam), y); else ctx.moveTo(XP(lam), y); }
    ctx.strokeStyle = P.tree; ctx.lineWidth = 1.8; ctx.stroke();
    // axis, complementary, one-dimensional representations
    ctx.strokeStyle = P.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yP + 0.5); ctx.lineTo(w - padR, yP + 0.5); ctx.stroke();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 2.6; ctx.setLineDash([3, 3]);
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(XP(sg * R), yP); ctx.lineTo(XP(sg * (k - 0.1)), yP); ctx.stroke(); }
    ctx.setLineDash([]);
    if (!s || !s.groups.some((g) => g.sat.kind === 'sign')) {
      ctx.fillStyle = P.bg; ctx.strokeStyle = P.trivial; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(XP(-k), yP, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    if (!s) { ctx.fillStyle = P.bg; ctx.strokeStyle = P.trivial; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(XP(k), yP, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    const tickP = [[-k, '-(p+1)'], [-R, '-2\\sqrt p'], [0, '0'], [R, '2\\sqrt p'], [k, 'p+1']];
    for (const [x, tex] of tickP) {
      ctx.strokeStyle = P.border; ctx.beginPath(); ctx.moveTo(XP(x), yP); ctx.lineTo(XP(x), yP + 4); ctx.stroke();
      lab.push({ id: 'tP' + tex, x: XP(x), y: yP + 6, anchor: 's', tex, cls: 'small' });
    }
    lab.push({ id: 'Pt', x: padL, y: topP - 6, anchor: 'ne', tex: narrow ? `\\PGL_2(\\Q_{${p}})` : `\\PGL_2(\\Q_{${p}})\\text{, spherical}` });
    lab.push({ id: 'temp', x: XP(0), y: topP + 3, anchor: 's', html: 'tempered: principal series', cls: 'small halo' });
    lab.push({ id: 'trivP', x: XP(k), y: yP - Hb * 0.55 - 7, anchor: 'nw', html: 'trivial', cls: 'small halo', color: P.trivial });
    lab.push({ id: 'signP', x: XP(-k), y: yP - (s && s.groups.some((g) => g.sat.kind === 'sign') ? Hb * 0.55 + 7 : 9), anchor: 'ne', html: 'sign', cls: 'small halo', color: P.trivial });

    // one automorphic representation: π_∞ = D_2 (after JL) and π_p with Hecke eigenvalue λ
    const target = st.hover || (s ? s.groups.find((g) => g.sat.kind === 'tempered') : null);
    if (target) {
      const x0 = XR(0), y0 = yR + 6, x1 = XP(target.x), y1 = (target._top || yP - 8) - 4;
      ctx.strokeStyle = st.hover ? P.graph : rgba(P.graph, 0.55); ctx.lineWidth = st.hover ? 1.8 : 1.2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, x1, y1); ctx.stroke();
      ctx.setLineDash([]);
      lab.push({ id: 'pi', x: x0 + (x1 - x0) * 0.6 + 6, y: y0 + (y1 - y0) * 0.62, anchor: 'e', tex: st.hover ? '\\pi' : '\\text{one }\\pi', cls: 'small halo', color: P.graph });
    }
    gD = { XP, yP, topP, padL, padR, w };
    labD.set(lab);
  }

  pointer(cvD.wrap, {
    hover(x, y) {
      if (!st.sum || !gD || y < gD.topP - 10) { if (st.hover) { st.hover = null; cvD.redraw(); updateRo1(); } return; }
      let best = null, bd = 10;
      for (const g of st.sum.groups) { const d = Math.abs(gD.XP(g.x) - x); if (d < bd) { bd = d; best = g; } }
      if (best !== st.hover) { st.hover = best; cvD.redraw(); cvS.redraw(); updateRo1(); }
    },
    leave() { if (st.hover) { st.hover = null; cvD.redraw(); cvS.redraw(); updateRo1(); } },
  });

  // ── drawing: the Satake circle and the angle histogram ──
  let gS = null;
  function drawSatake(ctx, w, h) {
    const P = palette(), A = accent(), narrow = w < 520;
    const lab = [];
    let S, cx, cy, hx0, hx1, hy0, hy1;
    if (narrow) {
      S = Math.min(w, h * 0.6); cx = w / 2; cy = S / 2;
      hx0 = 30; hx1 = w - 12; hy0 = S + 22; hy1 = h - 26;
    } else {
      S = Math.min(h, w * 0.5); cx = S / 2; cy = h / 2;
      hx0 = S + 34; hx1 = w - 12; hy0 = 24; hy1 = h - 26;
    }
    const U = S * 0.34;
    const Z = (re, im) => [cx + re * U, cy - im * U];
    const p = st.p, sp = Math.sqrt(p);
    // axes
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - S * 0.48, cy); ctx.lineTo(cx + S * 0.48, cy); ctx.moveTo(cx, cy - S * 0.48); ctx.lineTo(cx, cy + S * 0.48); ctx.stroke();
    // the unit circle: tempered
    const focusCircle = st.focus === 'weil' || st.focus === 'band';
    ctx.strokeStyle = P.window; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(cx, cy, U, 0, 2 * Math.PI); ctx.stroke();
    if (focusCircle) { ctx.strokeStyle = rgba(A, 0.3); ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy, U, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.strokeStyle = rgba(P.graph, 0.6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, U, 0, 2 * Math.PI); ctx.stroke();
    // complementary: real z with 1/√p < |z| < √p, z ≠ ±1 (drawn to the edge of the view)
    const edge = (S * 0.48) / U;
    const oneP = st.source === 'X';
    if (oneP) {
      ctx.strokeStyle = P.muted; ctx.lineWidth = 2.6; ctx.setLineDash([3, 3]);
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(...Z(sg / sp, 0)); ctx.lineTo(...Z(sg * 0.93, 0)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(...Z(sg * 1.07, 0)); ctx.lineTo(...Z(sg * Math.min(edge, sp), 0)); ctx.stroke();
      }
      ctx.setLineDash([]);
      // trivial and sign: z = ±p^{±1/2}
      for (const sg of [-1, 1]) {
        const [x, y] = Z(sg / sp, 0);
        ctx.fillStyle = sg > 0 ? P.trivial : P.bg; ctx.strokeStyle = P.trivial; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      }
      // arrow to √p, off the view
      if (sp > edge) {
        const [x, y] = Z(edge, 0);
        ctx.fillStyle = P.trivial;
        ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x - 6, y - 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.fill();
        lab.push({ id: 'sqp', x: x, y: y + 7, anchor: 'sw', tex: `\\sqrt{${p}}`, cls: 'small halo', color: P.trivial });
      }
      lab.push({ id: 'isp', x: Z(1 / sp, 0)[0] + 2, y: cy + 7, anchor: 'se', tex: `p^{-1/2}`, cls: 'small halo', color: P.trivial });
    }
    lab.push({ id: 'one', x: Z(1, 0)[0] + 3, y: cy - 4, anchor: 'ne', tex: '1', cls: 'small halo' });
    lab.push({ id: 'zlab', x: cx - S * 0.47, y: cy - S * 0.46, anchor: 'se', tex: 'z', cls: 'small' });
    lab.push({ id: 'circ', x: cx - S * 0.47, y: cy - S * 0.46 + 20, anchor: 'se', tex: '|z|=1\\text{: tempered}', cls: 'small halo' });

    // points
    const pts = [];
    let thetas = [], weights = null;
    const focusPts = st.focus === 'es' || st.focus === 'weil';
    if (st.source === 'X') {
      if (st.sum) {
        weights = [];
        const maxM = Math.max(1, ...st.sum.groups.map((g) => g.m));
        for (const g of st.sum.groups) {
          if (g.sat.kind !== 'tempered') continue;
          thetas.push(g.sat.theta); weights.push(g.m);
          const r = 2 + 2.5 * Math.sqrt(g.m / maxM);
          for (const sg of [1, -1]) pts.push({ x: Z(g.sat.re, sg * g.sat.im)[0], y: Z(g.sat.re, sg * g.sat.im)[1], r, g });
        }
      } else lab.push({ id: 'waitS', x: cx, y: cy + U * 0.45, html: 'computing…', cls: 'small' });
    } else {
      for (const rr of st.cdata) {
        thetas.push(rr.theta);
        const re = Math.cos(rr.theta), im = Math.sin(rr.theta);
        for (const sg of [1, -1]) pts.push({ x: Z(re, sg * im)[0], y: Z(re, sg * im)[1], r: 2.4, rr });
      }
    }
    const hov = st.satHover || (st.source === 'X' && st.hover ? { g: st.hover } : null);
    for (const q of pts) {
      ctx.fillStyle = rgba(P.graph, focusPts ? 0.95 : 0.75);
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 2 * Math.PI); ctx.fill();
    }
    if (hov) {
      for (const q of pts) if ((hov.g && q.g === hov.g) || (hov.r && q.rr === hov.r)) {
        ctx.strokeStyle = P.text; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 4, 0, 2 * Math.PI); ctx.stroke();
      }
    }

    // histogram of angles
    const bins = 24;
    const dens = thetas.length ? angleHistogram(thetas, bins, weights) : new Array(bins).fill(0);
    const curves = [];
    let ymax = 0.9;
    for (let i = 0; i <= 120; i++) {
      const th = (Math.PI * i) / 120;
      ymax = Math.max(ymax, satoTate(th) * 1.15);
      if (st.source === 'X') ymax = Math.max(ymax, kestenThetaClosed(th, p) * 1.15);
    }
    ymax = Math.max(ymax, Math.min(Math.max(...dens) * 1.05, ymax * 2.2));
    const HX = (th) => hx0 + (th / Math.PI) * (hx1 - hx0);
    const HY = (v) => hy1 - (Math.min(v, ymax) / ymax) * (hy1 - hy0);
    ctx.strokeStyle = P.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx0, hy1 + 0.5); ctx.lineTo(hx1, hy1 + 0.5); ctx.stroke();
    ctx.fillStyle = rgba(P.graph, 0.32);
    for (let b = 0; b < bins; b++) {
      const x0 = HX((Math.PI * b) / bins), x1 = HX((Math.PI * (b + 1)) / bins), y = HY(dens[b]);
      ctx.fillRect(x0 + 0.5, y, x1 - x0 - 1, hy1 - y);
    }
    const curve = (f, col, dash) => {
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const th = (Math.PI * i) / 160, y = HY(f(th)); if (i) ctx.lineTo(HX(th), y); else ctx.moveTo(HX(th), y); }
      ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    };
    if (st.source === 'X') curve((th) => kestenThetaClosed(th, p), P.tree, []);
    curve(satoTate, P.muted, [5, 4]);
    for (const [th, tex] of [[0, '0'], [Math.PI / 2, '\\frac\\pi2'], [Math.PI, '\\pi']]) {
      ctx.strokeStyle = P.border; ctx.beginPath(); ctx.moveTo(HX(th), hy1); ctx.lineTo(HX(th), hy1 + 4); ctx.stroke();
      lab.push({ id: 'th' + tex, x: HX(th), y: hy1 + 6, anchor: 's', tex, cls: 'small' });
    }
    lab.push({ id: 'thx', x: hx1, y: hy1 - 4, anchor: 'nw', tex: '\\theta', cls: 'small halo' });
    lab.push({ id: 'st', x: HX(Math.PI * 0.5) + 6, y: HY(satoTate(Math.PI / 2)) - 4, anchor: 'ne', html: 'Sato–Tate', cls: 'small halo' });
    if (st.source === 'X') lab.push({ id: 'km', x: HX(Math.PI * 0.2), y: HY(kestenThetaClosed(Math.PI * 0.2, p)) - 4, anchor: 'n', html: 'Kesten–McKay', cls: 'small halo', color: P.tree });
    else lab.push({ id: 'km', x: -999, y: -999, html: '' });
    gS = { pts };
    labS.set(lab);
  }

  pointer(cvS.wrap, {
    hover(x, y) {
      if (!gS) return;
      let best = null, bd = 9;
      for (const q of gS.pts) { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q; } }
      const nh = best ? (best.g ? { g: best.g } : { r: best.rr }) : null;
      const same = (a, b) => (!a && !b) || (a && b && a.g === b.g && a.r === b.r);
      if (!same(nh, st.satHover)) { st.satHover = nh; cvS.redraw(); updateRo2(); }
    },
    leave() { if (st.satHover) { st.satHover = null; cvS.redraw(); updateRo2(); } },
  });

  onTheme(() => { updateLegend(); cvD.redraw(); cvS.redraw(); });
  updateHint2();
  setPair(st.p, st.q);
}
