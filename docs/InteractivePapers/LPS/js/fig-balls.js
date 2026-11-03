// Figure 8: how fast X^{p,q} fills up (Theorem 5.1, Proposition 5.2).
// Sphere sizes |S(r)| around the identity against the tree's (p+1)p^{r−1}; the diameter against
// Theorem 5.1; a greedy independent set against Alon's bound.
import { el, makeCanvas, labelLayer, setTex, chips, palette, onTheme, fmt, cssVar, pointer, rgba } from './common.js';
import { legendre, buildX, girth, sphereSizes, diameterBound, greedyIndependentSet, orderX } from './lps.js';

export const PAIRS = [[5, 29], [5, 13], [13, 17], [17, 13], [5, 37]];

/** |S(r)| in the (p+1)-regular tree: 1, then (p+1)p^{r−1}. */
export const treeSphere = (p, r) => (r === 0 ? 1 : (p + 1) * Math.pow(p, r - 1));

/** Everything the figure reports, computed synchronously (also used by the node test). */
export function ballData(p, q) {
  const X = buildX(p, q);
  const spheres = sphereSizes(X);
  const g = girth(X).girth;
  const diam = spheres.length - 1;
  const treeLike = Math.floor((g - 1) / 2);
  let agree = true;
  for (let r = 0; r <= Math.min(treeLike, diam); r++) if (spheres[r] !== treeSphere(p, r)) agree = false;
  const psl = legendre(p, q) === 1;
  const indep = psl ? greedyIndependentSet(X) : null;
  return {
    p, q, n: X.n, psl, spheres, girth: g, diam, treeLike, agree,
    upper: diameterBound(p, X.n), lower: Math.log(X.n) / Math.log(p),
    indep, alon: (2 * Math.sqrt(p) / (p + 1)) * X.n,
  };
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { p: 5, q: 29, d: null, hover: null, busy: true };
  let token = 0;

  const legend = el('div', { class: 'panel-hint' });
  left.append(legend);
  setTex(legend, '<span style="color:var(--c-graph)">■</span> spheres $|S(r)|$ in $X^{p,q}$ &nbsp; <span style="color:var(--c-tree)">□</span> the tree, $(p+1)p^{r-1}$');
  const cv = makeCanvas(left, { aspect: (w) => (w < 480 ? 0.8 : 0.56), maxHeight: 400, minHeight: 240, draw });
  const labels = labelLayer(cv.wrap);
  left.append(el('div', { class: 'hint' }, 'Hover or tap a bar to read its count.'));

  chips(right, {
    label: 'Primes $(p,q)$',
    options: PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: '5,29',
    onchange: (key) => { const [p, q] = key.split(',').map(Number); start(p, q); },
  });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  const hov = el('div', { class: 'readout', style: 'margin-top:.5rem' });
  right.append(ro, hov);

  function layout(w, h) {
    const d = st.d;
    const L = 46, R = 10, T = 26, B = 32;
    const Rmax = d ? Math.max(d.diam + 1, Math.ceil(d.upper)) : 8;
    const slot = (w - L - R) / (Rmax + 1);
    const top = d ? Math.ceil(Math.log10(Math.max(d.n, treeSphere(d.p, d.diam + 1))) + 0.05) : 4;
    const X = (r) => L + (r + 0.5) * slot;
    const Y = (lv) => h - B - (lv / top) * (h - B - T);
    return { L, R, T, B, Rmax, slot, top, X, Y };
  }

  function draw(ctx, w, h) {
    const P = palette();
    const font = cssVar('--font-body');
    const labs = [];
    const { L, R, T, B, Rmax, slot, top, X, Y } = layout(w, h);
    const d = st.d;

    for (let e = 0; e <= top; e++) {
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, Y(e) + 0.5); ctx.lineTo(w - R, Y(e) + 0.5); ctx.stroke();
      labs.push({ id: 'y' + e, x: L - 6, y: Y(e), tex: e === 0 ? '1' : e === 1 ? '10' : `10^{${e}}`, anchor: 'w', cls: 'small' });
    }
    ctx.fillStyle = P.muted;
    ctx.font = `11px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let r = 0; r <= Rmax; r++) ctx.fillText(String(r), X(r), h - B + 6);
    labs.push({ id: 'xr', x: w - R, y: h - 4, tex: 'r', anchor: 'nw', cls: 'small' });

    if (!d) { labels.set(labs); return; }

    // tree-like region r ≤ ⌊(g−1)/2⌋
    const xr = X(Math.min(d.treeLike, d.diam)) + slot / 2;
    ctx.fillStyle = P.window;
    ctx.fillRect(L, T - 4, xr - L, h - B - T + 4);
    labs.push({ id: 'tl', x: (L + xr) / 2, y: T - 6, html: 'tree-like', anchor: 's', cls: 'small' });

    // n
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = rgba(P.text, 0.45);
    ctx.beginPath(); ctx.moveTo(L, Y(Math.log10(d.n)) + 0.5); ctx.lineTo(w - R, Y(Math.log10(d.n)) + 0.5); ctx.stroke();
    ctx.restore();
    let xn = X(d.diam + 1) + slot * 0.55, an = 'ne';
    if (xn > w - R - 80) { xn = w - R - 2; an = 'nw'; }
    labs.push({ id: 'n', x: xn, y: Y(Math.log10(d.n)) - 3, tex: `n=${fmt.tex(d.n)}`, anchor: an, cls: 'small halo' });

    // bars
    const bw = Math.min(30, slot * 0.66);
    for (let r = 0; r <= Math.min(Rmax, d.diam + 1); r++) {
      const x = X(r), t = treeSphere(d.p, r);
      ctx.strokeStyle = P.tree; ctx.lineWidth = 1.2;
      ctx.strokeRect(x - bw / 2 + 0.5, Y(Math.log10(t)) + 0.5, bw - 1, Y(0) - Y(Math.log10(t)) - 1);
      if (r <= d.diam) {
        const s = d.spheres[r];
        ctx.fillStyle = r <= d.treeLike ? P.graph : rgba(P.graph, 0.78);
        const inner = bw * 0.62;
        ctx.fillRect(x - inner / 2, Y(Math.log10(s)), inner, Y(0) - Y(Math.log10(s)));
      }
    }
    if (st.hover !== null) {
      const x = X(st.hover);
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - bw / 2 - 3, T - 2, bw + 6, Y(0) - T + 4);
    }

    // diameter bounds
    const vline = (v, id, tex, dash, dy) => {
      const xv = X(v), right = xv > w * 0.68;
      ctx.save();
      ctx.setLineDash(dash);
      ctx.strokeStyle = rgba(P.text, 0.6);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(xv, T + 8); ctx.lineTo(xv, h - B); ctx.stroke();
      ctx.restore();
      labs.push({ id, x: xv + (right ? -3 : 3), y: T + dy, tex, anchor: right ? 'sw' : 'se', cls: 'small halo' });
    };
    vline(d.upper, 'ub', `\\text{Thm 5.1: }${d.upper.toFixed(2)}`, [6, 4], 10);
    vline(d.lower, 'lb', `\\log_p n=${d.lower.toFixed(2)}`, [2, 3], 26);

    ctx.strokeStyle = rgba(P.text, 0.4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, Y(0) + 0.5); ctx.lineTo(w - R, Y(0) + 0.5); ctx.stroke();
    labels.set(labs);
  }

  pointer(cv.wrap, {
    down(x) { pick(x); return false; },
    hover(x) { pick(x); },
    leave() { st.hover = null; cv.redraw(); updateHover(); },
  });
  function pick(x) {
    if (!st.d) return;
    const { X } = layout(cv.w, cv.h);
    let best = null, bd = Infinity;
    for (let r = 0; r <= st.d.diam; r++) { const dd = Math.abs(X(r) - x); if (dd < bd) { bd = dd; best = r; } }
    if (best !== st.hover) { st.hover = best; cv.redraw(); updateHover(); }
  }

  function updateHover() {
    const d = st.d;
    if (!d) { setTex(hov, ''); return; }
    const r = st.hover !== null ? st.hover : d.diam;
    const s = d.spheres[r], t = treeSphere(d.p, r);
    const ball = d.spheres.slice(0, r + 1).reduce((a, b) => a + b, 0);
    setTex(hov, `<div>$r=${r}$${st.hover === null ? ' (the last sphere)' : ''}: $|S(r)|=${fmt.tex(s)}$, tree $${fmt.tex(t)}$${s === t ? ' <span class="dim">(equal)</span>' : ''}</div>
      <div class="dim" style="margin-top:.2rem">ball of radius $${r}$: $${fmt.tex(ball)}$ of $${fmt.tex(d.n)}$ vertices</div>`);
  }

  function updateReadout() {
    const { p, q } = st;
    const d = st.d;
    const leg = legendre(p, q), n = orderX(p, q);
    const grp = leg === -1 ? `\\PGL_2(\\F_{${q}})` : `\\PSL_2(\\F_{${q}})`;
    if (!d) {
      setTex(ro, `<table><tr><td>$X^{p,q}$</td><td class="num">$${grp}$, $n=${fmt.tex(n)}$</td></tr></table><div class="dim" style="margin-top:.3rem">building the graph…</div>`);
      return;
    }
    const diamOk = d.diam <= d.upper;
    let indep;
    if (d.psl) {
      const ok = d.indep <= d.alon;
      indep = `<tr class="sep"><td>greedy independent set</td><td class="num">$${fmt.tex(d.indep)}$</td></tr>
        <tr><td>Alon: $\\frac{2\\sqrt p}{p+1}n$</td><td class="num">$${fmt.tex(Math.floor(d.alon))}$ ${ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
        <tr><td>so $\\chi\\ge\\frac{p+1}{2\\sqrt p}$</td><td class="num">$${((p + 1) / (2 * Math.sqrt(p))).toFixed(2)}$</td></tr>`;
    } else {
      indep = `<tr class="sep"><td colspan="2" class="dim">$\\leg pq=-1$: $X^{p,q}$ is bipartite, each side is independent, $i(X)=n/2$. Proposition 5.2 needs a non-bipartite graph.</td></tr>`;
    }
    setTex(ro, `<table>
      <tr><td>$X^{p,q}$</td><td class="num">$${grp}$, $n=${fmt.tex(d.n)}$</td></tr>
      <tr><td>girth $g$</td><td class="num">$${d.girth}$</td></tr>
      <tr><td>equals the tree for $r\\le\\lfloor\\frac{g-1}2\\rfloor$</td><td class="num">$${d.treeLike}$ ${d.agree ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
      <tr class="sep"><td>diameter</td><td class="num">$${d.diam}$</td></tr>
      <tr><td>$2\\log_pn+2\\log_p2+1$</td><td class="num">$${d.upper.toFixed(2)}$ ${diamOk ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
      <tr><td>$\\log_pn$</td><td class="num">$${d.lower.toFixed(2)}$</td></tr>
      ${indep}
    </table>`);
  }

  function start(p, q) {
    const my = ++token;
    Object.assign(st, { p, q, d: null, hover: null });
    cv.redraw(); updateReadout(); updateHover();
    setTimeout(() => {
      if (my !== token) return;
      const d = ballData(p, q);
      if (my !== token) return;
      st.d = d;
      cv.redraw(); updateReadout(); updateHover();
    }, 40);
  }

  onTheme(() => cv.redraw());
  start(5, 29);
}
