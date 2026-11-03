// Figure 5: identity (4.15). Direct count r_Q(p^t) against (2/n) Σ_j H_t(λ_j) over the spectrum of X^{p,q}.
import { el, makeCanvas, labelLayer, setTex, slider, chips, controls, palette, onTheme, fmt, rgba, pointer } from './common.js';
import { H, isqrt, rQCost, legendre, orderX } from './lps.js';
import { getSpectrum, SPECTRUM_PAIRS } from './spectrum.js';

// ───────────── pure helpers (node-testable) ─────────────

/** Group a descending spectrum into [{ x, m }] (value, multiplicity). */
export function multiplicities(lam, tol = 1e-6) {
  const out = [];
  for (const x of lam) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - x) < tol) last.m++;
    else out.push({ x, m: 1 });
  }
  return out;
}

/** Split (2/n) Σ H_t(λ_j) into the part from ±(p+1) and the part from the rest. */
export function spectralParts(lam, t, p) {
  const n = lam.length, k = p + 1;
  let triv = 0, rest = 0;
  for (const x of lam) {
    const v = H(t, x, p);
    if (Math.abs(Math.abs(x) - k) < 1e-7) triv += v; else rest += v;
  }
  return { total: (2 * (triv + rest)) / n, trivial: (2 * triv) / n, rest: (2 * rest) / n };
}

/** The bound on the rest when every nontrivial eigenvalue is in the window: |H_t| ≤ (t+1)p^{t/2}. */
export const restBound = (t, p) => 2 * (t + 1) * Math.pow(p, t / 2);

const COST_CAP = 2.5e8;

/** r_Q(N) counted in slices of rows so the page stays responsive. Resolves to the count, or null if cancelled. */
function rQAsync(N, q, isLive) {
  const c = 4 * q * q, B = isqrt(Math.floor(N / c));
  let x2 = 0, cnt = 0;
  return new Promise((resolve) => {
    const step = () => {
      if (!isLive()) { resolve(null); return; }
      const t0 = performance.now();
      while (x2 <= B && performance.now() - t0 < 9) {
        const r2 = N - c * x2 * x2;
        if (r2 < 0) { x2 = B + 1; break; }
        const w2 = x2 ? 2 : 1;
        for (let x3 = 0; x3 <= B; x3++) {
          const r3 = r2 - c * x3 * x3;
          if (r3 < 0) break;
          const w3 = w2 * (x3 ? 2 : 1);
          for (let x4 = 0; x4 <= B; x4++) {
            const r4 = r3 - c * x4 * x4;
            if (r4 < 0) break;
            const x1 = Math.floor(Math.sqrt(r4));
            if (x1 * x1 === r4) cnt += w3 * (x4 ? 2 : 1) * (x1 ? 2 : 1);
          }
        }
        x2++;
      }
      if (x2 > B) resolve(cnt); else setTimeout(step, 0);
    };
    step();
  });
}

const countCache = new Map();

// ───────────── the figure ─────────────

export function mount(root) {
  const st = { p: 17, q: 13, t: 4, spec: null, groups: null, counts: [], gen: 0, tMax: 0, hover: null };

  const top = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  top.append(left, right);
  root.append(top);

  left.append(el('p', { class: 'panel-hint', html: '' }));
  const hint = left.lastChild;
  const cv = makeCanvas(left, { aspect: (w) => (w < 500 ? 0.78 : 0.56), maxHeight: 440, draw });
  const labels = labelLayer(cv.wrap);

  const ctl = controls(right);
  const pairChips = chips(ctl, {
    label: 'the graph $X^{p,q}$',
    options: SPECTRUM_PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: '17,13',
    onchange: (key) => { const [p, q] = key.split(',').map(Number); setPair(p, q); },
  });
  const tSlider = slider(ctl, { label: '$t$', min: 0, max: 8, step: 1, value: st.t, oninput: (v) => { st.t = v; cv.redraw(); updateReadout(); } });
  const ro = el('div', { class: 'readout' });
  right.append(ro);
  const hintEl = el('div', { class: 'hint' });
  right.append(hintEl);
  setTex(hintEl, 'Move $t$, or hover an eigenvalue to see its term $H_t(\\lambda)$.');

  const tableWrap = el('div', { class: 'readout', style: 'margin-top:1rem; overflow-x:auto' });
  root.append(tableWrap);

  // ── data ──
  function setPair(p, q) {
    st.p = p; st.q = q; st.spec = null; st.groups = null; st.counts = []; st.gen++;
    const gen = st.gen;
    const n = orderX(p, q);
    setTex(hint, `Spectrum of $X^{${p},${q}}$, $n=${n}$ vertices, ${legendre(p, q) === 1 ? '$\\PSL_2(\\F_{' + q + '})$' : '$\\PGL_2(\\F_{' + q + '})$, bipartite'}.`);
    // how far can we count directly?
    let tMax = 0;
    while (tMax < 14 && rQCost(Math.pow(p, tMax + 1), q) < COST_CAP && Math.pow(p, tMax + 1) < 9e15) tMax++;
    st.tMax = tMax;
    tSlider.setRange(0, tMax);
    if (st.t > tMax) { st.t = Math.min(4, tMax); tSlider.set(st.t); }
    cv.redraw(); updateReadout(); updateTable();
    getSpectrum(p, q).then((res) => {
      if (gen !== st.gen) return;
      st.spec = res.lam; st.groups = multiplicities(res.lam); st.ms = res.ms;
      cv.redraw(); updateReadout(); updateTable();
    }).catch((e) => { ro.textContent = 'Spectrum failed: ' + e.message; });
    // counts, smallest t first
    (async () => {
      for (let t = 0; t <= tMax; t++) {
        const key = `${p},${q},${t}`;
        let v = countCache.get(key);
        if (v === undefined) {
          v = await rQAsync(Math.pow(p, t), q, () => gen === st.gen);
          if (v === null) return;
          countCache.set(key, v);
        }
        if (gen !== st.gen) return;
        st.counts[t] = v;
        updateTable(); updateReadout();
      }
    })();
  }

  // ── drawing ──
  // plot u_t(x) = H_t(x)/p^{t/2}; inside the window |u_t| ≤ t+1
  let geom = null;
  function draw(ctx, w, h) {
    const P = palette();
    const { p, t } = st, k = p + 1, R = 2 * Math.sqrt(p);
    const padL = 14, padR = 14, padT = 18, axisY = h - 46, spikeH = 34;
    const xmin = -k - 0.8, xmax = k + 0.8;
    const X = (x) => padL + ((x - xmin) / (xmax - xmin)) * (w - padL - padR);
    const yr = t + 1.6;
    const plotTop = padT, plotBot = axisY - spikeH - 10;
    const Y = (u) => plotTop + ((yr - u) / (2 * yr)) * (plotBot - plotTop);
    geom = { X, xmin, xmax, padL, padR, w, axisY, spikeH };

    // window
    ctx.fillStyle = P.window;
    ctx.fillRect(X(-R), plotTop - 6, X(R) - X(-R), axisY - plotTop + 6);
    // zero line and ±(t+1) guides
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (const u of [0, t + 1, -(t + 1)]) {
      ctx.setLineDash(u ? [3, 4] : []);
      ctx.beginPath(); ctx.moveTo(padL, Y(u)); ctx.lineTo(w - padR, Y(u)); ctx.stroke();
    }
    ctx.setLineDash([]);
    // axis
    ctx.strokeStyle = P.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, axisY + 0.5); ctx.lineTo(w - padR, axisY + 0.5); ctx.stroke();

    // the curve u_t(x), clipped to the plot
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, plotTop - 4, w - padL - padR, plotBot - plotTop + 8); ctx.clip();
    ctx.strokeStyle = P.tree; ctx.lineWidth = 1.8;
    ctx.beginPath();
    const steps = Math.max(200, Math.round(w * 1.5));
    for (let i = 0; i <= steps; i++) {
      const x = xmin + ((xmax - xmin) * i) / steps;
      const u = H(t, x, p) / Math.pow(p, t / 2);
      const yy = Y(Math.max(-yr * 3, Math.min(yr * 3, u)));
      if (i) ctx.lineTo(X(x), yy); else ctx.moveTo(X(x), yy);
    }
    ctx.stroke();
    ctx.restore();

    const lab = [];
    if (st.groups) {
      const maxM = Math.max(...st.groups.map((g) => g.m));
      for (const g of st.groups) {
        const triv = Math.abs(Math.abs(g.x) - k) < 1e-7;
        const col = triv ? P.trivial : P.graph;
        // multiplicity spike under the axis line
        const sh = 4 + (spikeH - 4) * Math.sqrt(g.m / maxM);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(g.x), axisY); ctx.lineTo(X(g.x), axisY - sh); ctx.stroke();
        // the term on the curve
        const u = H(t, g.x, p) / Math.pow(p, t / 2);
        if (triv) {
          ctx.fillStyle = col;
          const yy = Y(yr * 0.92);
          ctx.beginPath(); ctx.moveTo(X(g.x), yy - 7); ctx.lineTo(X(g.x) - 5, yy + 2); ctx.lineTo(X(g.x) + 5, yy + 2); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(X(g.x), Y(u), 2.6 + Math.min(3, Math.sqrt(g.m) / 4), 0, 2 * Math.PI); ctx.fill();
        }
      }
      // trivial value, written next to the arrow
      const trivVal = H(t, k, p) / Math.pow(p, t / 2);
      lab.push({ id: 'triv', x: X(k) - 8, y: Y(yr * 0.92), anchor: 'w', cls: 'small halo', tex: `${fmt.tex(trivVal, 3)}\\uparrow`, color: P.trivial });
      if (st.hover) {
        const g = st.hover, uu = H(t, g.x, p);
        ctx.strokeStyle = P.text; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X(g.x), Math.abs(Math.abs(g.x) - k) < 1e-7 ? Y(yr * 0.92) : Y(uu / Math.pow(p, t / 2)), 7, 0, 2 * Math.PI); ctx.stroke();
      }
    } else {
      lab.push({ id: 'wait', x: w / 2, y: (plotTop + plotBot) / 2, tex: '\\text{computing the spectrum of }X^{' + st.p + ',' + st.q + '}\\dots', cls: 'small' });
    }

    // axis labels in TeX
    const ax = [[-k, '-(p+1)'], [-R, '-2\\sqrt p'], [0, '0'], [R, '2\\sqrt p'], [k, 'p+1']];
    for (const [x, tex] of ax) lab.push({ id: 'ax' + tex, x: X(x), y: axisY + 6, anchor: 's', tex, cls: 'small' });
    lab.push({ id: 'curve', x: padL + 4, y: plotTop - 2, anchor: 'se', tex: `H_{${t}}(x)/p^{${t}/2}`, cls: 'small halo', color: P.tree });
    lab.push({ id: 'gd', x: padL + 4, y: Y(-(t + 1)) + 3, anchor: 'se', tex: `-(t+1)`, cls: 'small halo' });
    labels.set(lab);
  }

  pointer(cv.wrap, {
    hover(x) {
      if (!st.groups || !geom) return;
      let best = null, bd = 12;
      for (const g of st.groups) { const d = Math.abs(geom.X(g.x) - x); if (d < bd) { bd = d; best = g; } }
      if (best !== st.hover) { st.hover = best; cv.redraw(); updateReadout(); }
    },
    leave() { if (st.hover) { st.hover = null; cv.redraw(); updateReadout(); } },
  });

  // ── readouts ──
  function updateReadout() {
    const { p, q, t } = st;
    if (!st.spec) { setTex(ro, `<span class="dim">Computing the spectrum of $X^{${p},${q}}$…</span>`); return; }
    const n = st.spec.length, parts = spectralParts(st.spec, t, p);
    const c = st.counts[t];
    const agree = c !== undefined && Math.abs(c - parts.total) < 1e-6 * Math.max(1, c);
    const bound = restBound(t, p);
    let hov = '';
    if (st.hover) {
      const g = st.hover, theta = Math.abs(g.x) <= 2 * Math.sqrt(p) ? Math.acos(g.x / (2 * Math.sqrt(p))) : null;
      hov = `<tr class="sep"><td colspan="2">$\\lambda=${fmt.tex(+g.x.toFixed(4), 5)}$, multiplicity $${g.m}$${theta !== null ? `, $\\theta=${theta.toFixed(3)}$` : ', $\\theta\\notin\\R$'}<br>$H_{${t}}(\\lambda)=${fmt.tex(+H(t, g.x, p).toFixed(3), 5)}$</td></tr>`;
    }
    setTex(ro, `<table>
      <tr><td>direct count $r_Q(${p}^{${t}})$</td><td class="num">${c === undefined ? '…' : fmt.int(c)}</td></tr>
      <tr><td>$\\frac2n\\sum_j H_{${t}}(\\lambda_j)$</td><td class="num">${fmt.int(parts.total)}</td></tr>
      <tr><td colspan="2">${c === undefined ? '<span class="dim">counting…</span>' : agree ? '<span class="ok">✓ equal, as (4.15) says</span>' : '<span class="bad">✗ differ</span>'}</td></tr>
      <tr class="sep"><td>from $\\pm(p+1)$</td><td class="num">${fmt.int(parts.trivial)}</td></tr>
      <tr><td>from the rest</td><td class="num">${fmt.f(parts.rest, 2)}</td></tr>
      <tr><td>bound $2(t+1)p^{t/2}$</td><td class="num">${fmt.int(bound)}</td></tr>
      <tr><td colspan="2">${Math.abs(parts.rest) <= bound + 1e-9 ? '<span class="ok">✓</span> the rest is small, because every nontrivial $\\lambda_j$ is in the window' : '<span class="bad">✗</span>'}</td></tr>
      ${hov}
    </table>`);
  }

  function updateTable() {
    const { p, q } = st;
    const head = `<tr><th>$t$</th><th class="num">$r_Q(p^t)$, counted</th><th class="num">$\\frac2n\\sum_jH_t(\\lambda_j)$</th><th class="num">from $\\pm(p+1)$: $C(p^t)$</th><th class="num">from the rest</th><th></th></tr>`;
    let rows = '';
    for (let t = 0; t <= st.tMax; t++) {
      const c = st.counts[t];
      const parts = st.spec ? spectralParts(st.spec, t, p) : null;
      const ok = parts && c !== undefined && Math.abs(c - parts.total) < 1e-6 * Math.max(1, c);
      rows += `<tr${t === st.t ? ' style="background:var(--accent-soft)"' : ''} data-t="${t}"><td>${t}</td>` +
        `<td class="num" style="color:var(--c-count)">${c === undefined ? '…' : fmt.int(c)}</td>` +
        `<td class="num" style="color:var(--c-graph)">${parts ? fmt.int(parts.total) : '…'}</td>` +
        `<td class="num" style="color:var(--c-trivial)">${parts ? fmt.int(parts.trivial) : ''}</td>` +
        `<td class="num">${parts ? fmt.f(Math.abs(parts.rest) < 0.05 ? 0 : parts.rest, 1) : ''}</td>` +
        `<td>${ok ? '<span class="ok">✓</span>' : c !== undefined && parts ? '<span class="bad">✗</span>' : ''}</td></tr>`;
    }
    const all = st.spec && st.counts.length === st.tMax + 1 && st.counts.every((c, t) => Math.abs(c - spectralParts(st.spec, t, p).total) < 1e-6 * Math.max(1, c));
    const foot = `<p class="hint" style="margin:.5rem 0 0">${all ? `<span class="ok">✓</span> (4.15) holds exactly for $t=0,\\dots,${st.tMax}$ on $X^{${p},${q}}$.` : 'Counting…'} Larger $t$ would take too long to count directly here.</p>`;
    setTex(tableWrap, `<table style="min-width:520px">${head}${rows}</table>${foot}`);
    tableWrap.querySelectorAll('tr[data-t]').forEach((tr) => {
      tr.style.cursor = 'pointer';
      tr.onclick = () => { st.t = +tr.dataset.t; tSlider.set(st.t); cv.redraw(); updateReadout(); updateTable(); };
    });
  }

  const origSet = tSlider.input;
  origSet.addEventListener('input', () => updateTable());
  onTheme(() => cv.redraw());
  setPair(st.p, st.q);
}
