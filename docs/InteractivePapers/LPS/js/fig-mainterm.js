// Figure 6: the main term C(p^k), the error on the p^{k/2} scale, and what a non-Ramanujan
// eigenvalue would add ((1.5), Lemma 4.4, (4.19), (4.20)).
import { el, makeCanvas, labelLayer, setTex, chips, slider, palette, onTheme, fmt, chunked, cssVar, rgba } from './common.js';
import { legendre, mainTerm, orderX, rQCost, H } from './lps.js';
import { rQSteps } from './fig-girth.js';

export const PAIRS = [[13, 17], [5, 29], [17, 13], [29, 5], [5, 13]];
const COST_CAP = 6e7;

/** c1 = c2 = 4/(q(q²−1)): the constant in C(p^k) = c·σ(p^k). */
export const mainConstant = (q) => 4 / (q * (q * q - 1));

/** Normalized error (r − C)/p^{k/2}. */
export const normError = (r, p, q, k) => (r - mainTerm(p, q, k)) / Math.pow(p, k / 2);

/**
 * The term a single extra eigenvalue λ* (2√p < λ* < p+1) would add to (4.15), in units of p^{k/2}:
 * (2/n) H_k(λ*) / p^{k/2} = (2/n) sinh((k+1)μ)/sinh μ with λ* = 2√p cosh μ.
 * In the bipartite case eigenvalues come in pairs ±λ*, which double even k and cancel odd k.
 */
export function hypotheticalTerm(lam, p, q, k) {
  const n = orderX(p, q);
  const bip = legendre(p, q) === -1;
  if (bip && k % 2) return 0;
  return (bip ? 2 : 1) * (2 / n) * H(k, lam, p) / Math.pow(p, k / 2);
}

/** First k ≥ 1 with hypotheticalTerm > bound (searching up to kmax). */
export function leavesBandAt(lam, p, q, bound = 1, kmax = 400) {
  for (let k = 1; k <= kmax; k++) if (hypotheticalTerm(lam, p, q, k) > bound) return k;
  return null;
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { p: 13, q: 17, rows: [], pending: null, done: false, v: 650 };
  let token = 0;

  const legend = el('div', { class: 'panel-hint' });
  left.append(legend);
  setTex(legend, '<span style="color:var(--c-count)">●</span> $r_Q(p^k)$ &nbsp; <span style="color:var(--c-trivial)">━</span> $C(p^k)$ &nbsp; <span style="color:var(--c-graph)">╌</span> an extra eigenvalue $\\lambda^\\ast$ &nbsp; hollow: $r_Q\\lt C$');
  const cv = makeCanvas(left, { aspect: (w) => (w < 480 ? 1.08 : 0.74), maxHeight: 520, minHeight: 320, draw });
  const labels = labelLayer(cv.wrap);

  chips(right, {
    label: 'Primes $(p,q)$',
    options: PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: '13,17',
    onchange: (key) => { const [p, q] = key.split(',').map(Number); start(p, q); },
  });
  const ctl = el('div', { class: 'controls', style: 'margin-top:.7rem' });
  right.append(ctl);
  const lamOf = (v) => (v <= 0 ? null : 2 * Math.sqrt(st.p) + (st.p + 1 - 2 * Math.sqrt(st.p)) * (v / 1000));
  const sl = slider(ctl, {
    label: 'extra $\\lambda^\\ast$',
    min: 0, max: 990, step: 5, value: st.v,
    fmt: (v) => { const l = lamOf(v); return l === null ? 'off' : `$${l.toFixed(2)}$`; },
    oninput: (v) => { st.v = v; cv.redraw(); updateReadout(); },
  });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  const tbl = el('div', { class: 'readout', style: 'margin-top:.5rem;overflow-x:auto' });
  right.append(ro, tbl);

  function kAxis() {
    const K = st.rows.length ? st.rows[st.rows.length - 1].k : 0;
    let k = Math.max(K + 1, st.pending !== null ? st.pending + 1 : 0, 8);
    const lam = lamOf(st.v);
    if (lam !== null) {
      const ks = leavesBandAt(lam, st.p, st.q);
      if (ks !== null) k = Math.max(k, Math.min(ks + 2, 30));
    }
    return k;
  }

  function draw(ctx, w, h) {
    const P = palette();
    const font = cssVar('--font-body');
    const labs = [];
    const L = 46, R = 12, gap = 34, T1 = 22, B = 30;
    const Kx = kAxis();
    const hTop = Math.round((h - T1 - gap - B) * 0.44);
    const top = { y0: T1, y1: T1 + hTop };
    const bot = { y0: T1 + hTop + gap, y1: h - B };
    const X = (k) => L + (k / Kx) * (w - L - R);

    // ── top panel: r_Q(p^k) and C(p^k), log scale
    let maxV = 10, minC = 0.1;
    for (const r of st.rows) { maxV = Math.max(maxV, r.r, r.C); if (r.C > 0) minC = Math.min(minC, r.C); }
    const tTop = Math.ceil(Math.log10(maxV));
    const tBot = Math.max(-4, Math.floor(Math.log10(minC)));
    const Yt = (lv) => top.y1 - ((lv - tBot) / (tTop - tBot)) * (top.y1 - top.y0);
    frame(ctx, P, top, L, w - R, tBot, tTop, Yt, labs, 't');
    labs.push({ id: 'tt', x: L + 2, y: top.y0 - 3, tex: 'r_Q(p^k)\\ \\text{and}\\ C(p^k)', anchor: 'ne', cls: 'small' });
    // main term as a line through its nonzero values
    ctx.strokeStyle = P.trivial;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const r of st.rows) {
      if (r.C <= 0) { started = false; continue; }
      const x = X(r.k), y = Yt(Math.max(tBot, Math.log10(r.C)));
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // counts as dots
    for (const r of st.rows) {
      const x = X(r.k);
      if (r.r > 0) {
        ctx.fillStyle = P.count;
        ctx.beginPath(); ctx.arc(x, Yt(Math.log10(r.r)), 3.8, 0, 2 * Math.PI); ctx.fill();
      } else { // r_Q = 0: a short tick on the floor
        ctx.strokeStyle = P.count; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 4, Yt(tBot) - 1); ctx.lineTo(x + 4, Yt(tBot) - 1); ctx.stroke();
      }
    }

    // ── bottom panel: |r − C| / p^{k/2}, log scale, with the band and the hypothetical term
    let lo = -2;
    for (const r of st.rows) if (r.k >= 1 && r.e !== 0) lo = Math.min(lo, Math.floor(Math.log10(Math.abs(r.e))));
    lo = Math.max(lo, -5);
    const lam = lamOf(st.v);
    let hi = 1;
    const hyp = [];
    if (lam !== null) {
      for (let k = 1; k <= Kx; k++) {
        const v = hypotheticalTerm(lam, st.p, st.q, k);
        if (v > 0) { hyp.push([k, v]); hi = Math.max(hi, Math.min(Math.ceil(Math.log10(v)), 6)); }
      }
    }
    const Yb = (lv) => bot.y1 - ((lv - lo) / (hi - lo)) * (bot.y1 - bot.y0);
    // band |·| ≤ 1
    ctx.fillStyle = P.window;
    ctx.fillRect(L, Yb(0), w - R - L, Yb(lo) - Yb(0));
    frame(ctx, P, bot, L, w - R, lo, hi, Yb, labs, 'b');
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = rgba(P.graph, 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(L, Yb(0) + 0.5); ctx.lineTo(w - R, Yb(0) + 0.5); ctx.stroke();
    ctx.restore();
    labs.push({ id: 'bt', x: L + 2, y: bot.y0 - 3, tex: '|r_Q(p^k)-C(p^k)|\\,/\\,p^{k/2}', anchor: 'ne', cls: 'small' });
    labs.push({ id: 'band', x: w - R - 4, y: Yb(0) + 3, tex: '\\le 1', anchor: 'sw', cls: 'small halo' });

    // hypothetical eigenvalue
    if (hyp.length) {
      ctx.save();
      ctx.beginPath(); ctx.rect(L, bot.y0 - 2, w - R - L, bot.y1 - bot.y0 + 4); ctx.clip();
      ctx.strokeStyle = P.graph;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      hyp.forEach(([k, v], i) => { const x = X(k), y = Yb(Math.max(lo, Math.log10(v))); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.graph;
      for (const [k, v] of hyp) { ctx.beginPath(); ctx.arc(X(k), Yb(Math.max(lo, Math.log10(v))), 2.4, 0, 2 * Math.PI); ctx.fill(); }
      ctx.restore();
      const ks = leavesBandAt(lam, st.p, st.q);
      if (ks !== null && ks <= Kx) {
        const v = hypotheticalTerm(lam, st.p, st.q, ks);
        const x = X(ks), y = Yb(Math.min(hi, Math.log10(v)));
        ctx.strokeStyle = P.bad; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 2 * Math.PI); ctx.stroke();
        labs.push({ id: 'ks', x: x - 8, y: y - 6, tex: `\\lambda^\\ast\\text{ leaves at }k=${ks}`, anchor: 'nw', cls: 'small halo', color: P.bad });
      }
    }
    // errors as dots (filled: r > C, hollow: r < C)
    for (const r of st.rows) {
      if (r.k < 1 || r.e === 0) continue;
      const x = X(r.k), y = Yb(Math.max(lo, Math.log10(Math.abs(r.e))));
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = P.count; ctx.fillStyle = P.count;
      ctx.beginPath(); ctx.arc(x, y, 3.8, 0, 2 * Math.PI);
      if (r.e > 0) ctx.fill(); else ctx.stroke();
    }

    // x axis (shared)
    ctx.fillStyle = P.muted;
    ctx.font = `11px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = Kx > 20 ? 5 : Kx > 10 ? 2 : 1;
    for (let k = 0; k <= Kx; k += step) ctx.fillText(String(k), X(k), h - B + 6);
    labs.push({ id: 'xk', x: w - R, y: h - 4, tex: 'k', anchor: 'nw', cls: 'small' });
    if (st.pending !== null) labs.push({ id: 'pend', x: X(st.pending), y: top.y1 - 2, html: '…', anchor: 'n', cls: 'small' });

    labels.set(labs);
  }

  // log-scale frame: gridlines at powers of ten, labels via TeX
  function frame(ctx, P, box, x0, x1, lo, hi, Y, labs, id) {
    const span = hi - lo, step = span > 7 ? 2 : 1;
    ctx.lineWidth = 1;
    for (let e = Math.ceil(lo); e <= hi; e++) {
      ctx.strokeStyle = P.grid;
      ctx.beginPath(); ctx.moveTo(x0, Y(e) + 0.5); ctx.lineTo(x1, Y(e) + 0.5); ctx.stroke();
      if ((e - Math.ceil(lo)) % step === 0) labs.push({ id: id + e, x: x0 - 6, y: Y(e), tex: e === 0 ? '1' : e === 1 ? '10' : `10^{${e}}`, anchor: 'w', cls: 'small' });
    }
    ctx.strokeStyle = rgba(P.text, 0.35);
    ctx.beginPath(); ctx.moveTo(x0 + 0.5, box.y0); ctx.lineTo(x0 + 0.5, box.y1); ctx.lineTo(x1, box.y1); ctx.stroke();
  }

  function updateReadout() {
    const { p, q } = st;
    const leg = legendre(p, q), n = orderX(p, q), c = mainConstant(q);
    const errs = st.rows.filter((r) => r.k >= 1).map((r) => Math.abs(r.e));
    const mx = errs.length ? Math.max(...errs) : NaN;
    const K = st.rows.length ? st.rows[st.rows.length - 1].k : 0;
    const bandOk = errs.length && mx <= 1;
    const lam = lamOf(st.v);
    let hyp = '<div class="dim" style="margin-top:.35rem">Move the slider to add a hypothetical eigenvalue $\\lambda^\\ast\\gt 2\\sqrt p$.</div>';
    if (lam !== null) {
      const mu = Math.acosh(lam / (2 * Math.sqrt(p)));
      const ks = leavesBandAt(lam, p, q);
      hyp = `<div style="margin-top:.4rem">$\\lambda^\\ast=${lam.toFixed(2)}=2\\sqrt p\\cosh\\mu$ with $\\mu=${mu.toFixed(3)}$. Its term $\\frac2nH_k(\\lambda^\\ast)/p^{k/2}=\\frac2n\\frac{\\sinh(k+1)\\mu}{\\sinh\\mu}$ grows like $e^{k\\mu}$.</div>
        <div style="margin-top:.25rem">${ks !== null ? `<span style="color:var(--bad);font-weight:700">It leaves the band at $k=${ks}$</span>: (1.5) and (4.15) leave no room for it.` : '<span class="dim">It stays in the band for $k\\le 400$.</span>'}</div>`;
    }
    setTex(ro, `<table>
      <tr><td>$\\leg pq$, $n$</td><td class="num">$${leg}$, $${fmt.tex(n)}$</td></tr>
      <tr><td>$c_1=c_2=\\frac{4}{q(q^2-1)}$</td><td class="num">$${fmt.tex(c, 3)}$</td></tr>
      <tr class="sep"><td>$\\max_{1\\le k\\le ${K}}\\frac{|r_Q-C|}{p^{k/2}}$</td><td class="num">${errs.length ? `$${mx.toFixed(3)}$` : '…'}</td></tr>
    </table>
    <div style="margin-top:.3rem">${!errs.length ? '<span class="dim">counting…</span>' : bandOk ? '<span class="ok">✓</span> the error stays within $p^{k/2}$' : '<span class="bad">✗</span> outside the band'}${st.pending !== null ? ' <span class="dim">(counting $k=' + st.pending + '$…)</span>' : ''}</div>
    ${hyp}`);

    const fmtC = (v) => (v >= 1000 ? fmt.tex(Math.round(v)) : v === 0 ? '0' : fmt.tex(v, 4));
    const rowsHtml = st.rows.map((r) => `<tr><td class="num">$${r.k}$</td><td class="num">$${fmt.tex(r.r)}$</td><td class="num">$${fmtC(r.C)}$</td><td class="num">${r.k >= 1 ? `$${r.e.toFixed(3)}$` : '<span class="dim">—</span>'}</td></tr>`).join('');
    setTex(tbl, `<table><tr><th class="num">$k$</th><th class="num">$r_Q(p^k)$</th><th class="num">$C(p^k)$</th><th class="num">$\\frac{r_Q-C}{p^{k/2}}$</th></tr>${rowsHtml}</table>`);
  }

  async function start(p, q) {
    const my = ++token;
    Object.assign(st, { p, q, rows: [], pending: null, done: false });
    sl.set(st.v);
    cv.redraw(); updateReadout();
    for (let k = 0; ; k++) {
      const N = Math.pow(p, k);
      if (N > Number.MAX_SAFE_INTEGER || rQCost(N, q) > COST_CAP) break;
      st.pending = k;
      cv.redraw();
      const gen = rQSteps(N, q);
      let res = null;
      await chunked(() => {
        if (my !== token) return true;
        const r = gen.next();
        if (r.done) { res = r.value; return true; }
        return false;
      }, 8);
      if (my !== token) return;
      const C = mainTerm(p, q, k);
      st.rows.push({ k, r: res.count, C, e: normError(res.count, p, q, k) });
      st.pending = null;
      cv.redraw(); updateReadout();
    }
    st.done = true;
    cv.redraw(); updateReadout();
  }

  onTheme(() => cv.redraw());
  start(13, 17);
}
