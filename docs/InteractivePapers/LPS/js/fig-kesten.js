// Figure 4 — Proposition 4.2 / 4.3: the spectrum of X^{p,q} against Kesten's density μ_{p+1},
// and the moments (1/n)Σλ^l against the tree's closed-walk counts ρ(l), equal below the girth (4.4).
import { el, makeCanvas, labelLayer, setTex, chips, controls, palette, onTheme, fmt, ticks, rgba } from './common.js';
import { kestenDensity, treeClosedWalks, lambdaX, legendre, girth, buildX } from './lps.js';
import { getSpectrum, SPECTRUM_PAIRS } from './spectrum.js';

// (5,13): girth 8, so the moments agree for l = 0..7 — the cleanest picture of (4.4).
const DEFAULT_PAIR = [5, 13];
const L_MAX = 10;

// ───────────────────────── pure math (node-testable) ─────────────────────────

/**
 * Histogram of the nontrivial eigenvalues over the window [−2√p, 2√p], as a density
 * (count / (n · binWidth)), with the trivial eigenvalues ±(p+1) and anything outside
 * the window returned separately.
 */
export function eigenHistogram(lam, p, bins) {
  const k = p + 1, R = 2 * Math.sqrt(p), tol = 1e-7 * k;
  const counts = new Array(bins).fill(0), trivial = [], outside = [];
  const w = (2 * R) / bins;
  for (const x of lam) {
    if (Math.abs(Math.abs(x) - k) < tol) { trivial.push(x); continue; }
    if (Math.abs(x) > R + 1e-9) { outside.push(x); continue; }
    let i = Math.floor((x + R) / w);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    counts[i]++;
  }
  const n = lam.length;
  return { R, w, bins, counts, density: counts.map((c) => c / (n * w)), trivial, outside };
}

/** m_l = (1/n) Σ_j λ_j^l for l = 0..L (all eigenvalues, trivial ones included). */
export function moments(lam, L) {
  const out = new Array(L + 1).fill(0);
  for (const x of lam) {
    let v = 1;
    for (let l = 0; l <= L; l++) { out[l] += v; v *= x; }
  }
  return out.map((s) => s / lam.length);
}

export const agrees = (m, rho) => Math.abs(m - rho) <= 1e-7 * Math.max(1, Math.abs(rho));

/** A sensible number of bins for n eigenvalues. */
export const binCount = (n) => Math.max(10, Math.min(40, Math.round(1.1 * Math.sqrt(n))));

// ───────────────────────── figure ─────────────────────────

const girthCache = new Map();
function girthOf(p, q) {
  const key = p + ',' + q;
  if (!girthCache.has(key)) girthCache.set(key, girth(buildX(p, q)).girth);
  return girthCache.get(key);
}

function numCell(v) {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v) || 0; // no "-0"
  if (Math.abs(r) < 1e12) return r.toLocaleString('en-US');
  return `$${fmt.tex(v, 4)}$`;
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { p: DEFAULT_PAIR[0], q: DEFAULT_PAIR[1], data: null, token: 0 };

  const cv = makeCanvas(left, { aspect: (w) => (w < 520 ? 0.8 : 0.62), maxHeight: 440, minHeight: 240, draw });
  const labels = labelLayer(cv.wrap);
  const status = el('div', { class: 'hint' });
  left.append(status);

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  chips(ctl, {
    label: 'Pair $(p,q)$',
    options: SPECTRUM_PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: st.p + ',' + st.q,
    onchange: (key) => { const [p, q] = key.split(',').map(Number); load(p, q); },
  });
  const legend = el('div', { class: 'hint', style: 'margin-top:.2rem' });
  ctl.append(legend);
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  const mt = el('div', { class: 'readout', style: 'margin-top:.6rem' });
  right.append(ro, mt);

  function setLegend() {
    const P = palette();
    setTex(legend,
      `<span style="color:${P.graph}">■</span> eigenvalues of $X^{p,q}$ &nbsp; ` +
      `<span style="color:${P.tree}">━</span> Kesten's $\\mu_{p+1}$ &nbsp; ` +
      `<span style="color:${P.trivial}">●</span> trivial $\\pm(p+1)$`);
  }
  setLegend();

  function load(p, q) {
    const token = ++st.token;
    st.p = p; st.q = q; st.data = null;
    setTex(status, `Computing the spectrum of $X^{${p},${q}}$…`);
    setTex(ro, `<span class="dim">Computing the spectrum of $X^{${p},${q}}$…</span>`);
    setTex(mt, '');
    cv.redraw();
    getSpectrum(p, q).then((res) => {
      if (token !== st.token) return;
      const lam = res.lam, n = lam.length, k = p + 1;
      const hist = eigenHistogram(lam, p, binCount(n));
      const m = moments(lam, L_MAX);
      const rho = treeClosedWalks(k, L_MAX);
      const g = girthOf(p, q);
      st.data = { lam, n, hist, m, rho, g, ms: res.ms, bipartite: res.bipartite, lamX: lambdaX(lam, k) };
      setTex(status, `$n=${fmt.tex(n)}$ eigenvalues, computed in ${Math.round(res.ms)} ms.`);
      updateReadouts();
      cv.redraw();
    }).catch((err) => {
      if (token !== st.token) return;
      setTex(status, `<span class="bad">Could not compute the spectrum: ${String(err.message || err)}</span>`);
    });
  }

  function updateReadouts() {
    const { p, q } = st, d = st.data, k = p + 1, R = 2 * Math.sqrt(p);
    const leg = legendre(p, q);
    const below = [];
    for (let l = 0; l <= L_MAX && l < d.g; l++) below.push(agrees(d.m[l], d.rho[l]));
    const allBelow = below.every(Boolean);
    const rama = d.lamX <= R + 1e-9 && d.hist.outside.length === 0;
    setTex(ro, `<table>
      <tr><td>$n=|X^{${p},${q}}|$</td><td class="num">${d.n.toLocaleString('en-US')}</td></tr>
      <tr><td>$\\leg{${p}}{${q}}$</td><td class="num">$${leg}$ ${d.bipartite ? '(bipartite)' : ''}</td></tr>
      <tr><td>girth $g$</td><td class="num">${d.g}</td></tr>
      <tr class="sep"><td colspan="2">$\\lambda(X)=${d.lamX.toFixed(4)}\\le2\\sqrt{${p}}=${R.toFixed(4)}$ ${rama ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
      <tr><td colspan="2">$\\frac1n\\sum_j\\lambda_j^l=\\rho(l)$ for all $l\\lt g$ ${allBelow ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
    </table>`);

    let rows = '';
    for (let l = 0; l <= L_MAX; l++) {
      if (l === d.g) rows += `<tr class="sep"><td colspan="4" class="dim">girth $g=${d.g}$: the first cycles</td></tr>`;
      const eq = agrees(d.m[l], d.rho[l]);
      const mark = l < d.g ? (eq ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>') : `<span class="dim">$${eq ? '=' : '\\ne'}$</span>`;
      rows += `<tr><td>${l}</td><td class="num">${numCell(d.m[l])}</td><td class="num">${numCell(d.rho[l])}</td><td>${mark}</td></tr>`;
    }
    setTex(mt, `<table>
      <tr><th>$l$</th><th class="num">$\\frac1n\\sum_j\\lambda_j^l$</th><th class="num">$\\rho(l)$</th><th></th></tr>
      ${rows}
    </table>`);
  }

  function draw(ctx, w, h) {
    const P = palette();
    const d = st.data;
    const k = st.p + 1, R = 2 * Math.sqrt(st.p);
    const padL = 38, padR = 14, padT = 30, padB = 30;
    const X0 = padL, X1 = w - padR, Y0 = h - padB, Y1 = padT;
    const xmax = k * 1.06;
    const sx = (t) => X0 + ((t + xmax) / (2 * xmax)) * (X1 - X0);

    // the window
    ctx.fillStyle = P.window;
    ctx.fillRect(sx(-R), Y1, sx(R) - sx(-R), Y0 - Y1);
    ctx.strokeStyle = rgba(P.graph, 0.45);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const t of [-R, R]) { ctx.beginPath(); ctx.moveTo(sx(t), Y1); ctx.lineTo(sx(t), Y0); ctx.stroke(); }
    ctx.setLineDash([]);

    // x axis and numbers
    ctx.strokeStyle = P.muted;
    ctx.beginPath(); ctx.moveTo(X0, Y0 + 0.5); ctx.lineTo(X1, Y0 + 0.5); ctx.stroke();
    ctx.fillStyle = P.muted;
    ctx.font = '11px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of ticks(-xmax, xmax, w < 520 ? 5 : 8)) {
      ctx.beginPath(); ctx.moveTo(sx(t), Y0); ctx.lineTo(sx(t), Y0 + 4); ctx.stroke();
      ctx.fillText(t < 0 ? '−' + (-t) : String(t), sx(t), Y0 + 7);
    }

    if (!d) { labels.set([]); return; }

    // y scale: fit the density, but don't let a few tall spikes (small q) flatten the curve
    let curveMax = 0;
    for (let i = 0; i <= 200; i++) curveMax = Math.max(curveMax, kestenDensity(-R + (2 * R * i) / 200, k));
    const histMax = Math.max(...d.hist.density);
    const ymax = Math.max(curveMax * 1.3, Math.min(histMax, curveMax * 3)) * 1.08;
    const sy = (v) => Y0 - (v / ymax) * (Y0 - Y1);

    // y grid
    ctx.strokeStyle = P.grid;
    ctx.fillStyle = P.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of ticks(0, ymax, 4)) {
      if (v === 0) continue;
      ctx.beginPath(); ctx.moveTo(X0, sy(v) + 0.5); ctx.lineTo(X1, sy(v) + 0.5); ctx.stroke();
      ctx.fillText(String(v), X0 - 5, sy(v));
    }

    // histogram bars
    const { hist } = d;
    ctx.fillStyle = rgba(P.graph, P.dark ? 0.62 : 0.55);
    ctx.strokeStyle = P.graph;
    for (let i = 0; i < hist.bins; i++) {
      const v = hist.density[i];
      if (!v) continue;
      const xa = sx(-R + i * hist.w), xb = sx(-R + (i + 1) * hist.w);
      const top = Math.max(Y1, sy(v));
      ctx.fillRect(xa + 0.5, top, Math.max(1, xb - xa - 1), Y0 - top);
      if (sy(v) < Y1) { // clipped: a small notch
        ctx.beginPath(); ctx.moveTo(xa + 1, Y1 + 5); ctx.lineTo((xa + xb) / 2, Y1); ctx.lineTo(xb - 1, Y1 + 5); ctx.stroke();
      }
    }

    // eigenvalues outside the window (there should be none)
    ctx.strokeStyle = P.bad;
    ctx.lineWidth = 2;
    for (const x of hist.outside) { ctx.beginPath(); ctx.moveTo(sx(x), Y0); ctx.lineTo(sx(x), Y0 - 26); ctx.stroke(); }

    // Kesten's density
    ctx.strokeStyle = P.tree;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const t = -R + (2 * R * i) / N;
      const y = sy(kestenDensity(t, k));
      if (i === 0) ctx.moveTo(sx(t), Y0); else ctx.lineTo(sx(t), y);
    }
    ctx.lineTo(sx(R), Y0);
    ctx.stroke();

    // trivial eigenvalues ±(p+1): point masses, drawn as lollipops
    const lab = [
      { id: 'wl', x: sx(-R), y: Y1 - 5, tex: `-2\\sqrt{${st.p}}`, anchor: 'n', cls: 'small' },
      { id: 'wr', x: sx(R), y: Y1 - 5, tex: `2\\sqrt{${st.p}}`, anchor: 'n', cls: 'small' },
    ];
    ctx.strokeStyle = P.trivial;
    ctx.fillStyle = P.trivial;
    ctx.lineWidth = 2;
    const stemTop = Y0 - 0.62 * (Y0 - Y1);
    for (const x of hist.trivial) {
      const X = sx(x);
      ctx.beginPath(); ctx.moveTo(X, Y0); ctx.lineTo(X, stemTop); ctx.stroke();
      ctx.beginPath(); ctx.arc(X, stemTop, 4.5, 0, 2 * Math.PI); ctx.fill();
      const pos = x > 0;
      lab.push({
        id: pos ? 't+' : 't-', x: X + (pos ? -8 : 8), y: stemTop,
        tex: pos ? `\\lambda_0=${k}` : `\\lambda_{n-1}=-${k}`, anchor: pos ? 'w' : 'e', cls: 'halo', color: P.trivial,
      });
    }

    // curve label
    const tl = 0.58 * R;
    lab.push({ id: 'mu', x: sx(tl) + 4, y: sy(kestenDensity(tl, k)) - 5, tex: `\\mu_{${k}}`, anchor: 'ne', cls: 'halo', color: P.tree });
    labels.set(lab);
  }

  onTheme(() => { setLegend(); cv.redraw(); });
  load(st.p, st.q);
}
