// Figure 3: the girth, read off a count (Theorem 3.4, (3.1), (4.14)).
// For t = 0, 1, 2, … count r_Q(p^t) row by row (never blocking the page); the first t with a
// solution other than ±p^{t/2} is the girth of X^{p,q}. That solution, factored by Lemma 3.1,
// is the shortest relation.
import { el, makeCanvas, labelLayer, setTex, chips, palette, onTheme, fmt, chunked, cssVar, pointer, rgba } from './common.js';
import { isqrt, legendre, girthBound, rQCost, factorQuaternion, generators, buildX, girth, orderX } from './lps.js';

export const PAIRS = [[5, 13], [13, 17], [17, 13], [5, 29], [13, 29], [5, 37], [29, 13]];
const COST_CAP = 2e7; // per t; r_Q(p^t) work estimate (rQCost)

/**
 * r_Q(N) for Q = x1² + 4q²(x2²+x3²+x4²), one (x2, x3) row per step. Returns { count, solution }
 * where solution is one quaternion x1 + 2q(x2 i + x3 j + x4 k) with (x2, x3, x4) ≠ 0, or null.
 */
export function* rQSteps(N, q) {
  const c = 4 * q * q, B = isqrt(Math.floor(N / c));
  let count = 0, solution = null;
  for (let x2 = 0; x2 <= B; x2++) {
    const r2 = N - c * x2 * x2;
    if (r2 < 0) break;
    const w2 = x2 ? 2 : 1;
    for (let x3 = 0; x3 <= B; x3++) {
      const r3 = r2 - c * x3 * x3;
      if (r3 < 0) break;
      const w3 = w2 * (x3 ? 2 : 1);
      for (let x4 = 0; x4 <= B; x4++) {
        const r4 = r3 - c * x4 * x4;
        if (r4 < 0) break;
        const x1 = isqrt(r4);
        if (x1 * x1 === r4) {
          count += w3 * (x4 ? 2 : 1) * (x1 ? 2 : 1);
          if (!solution && (x2 || x3 || x4)) solution = [x1, 2 * q * x2, 2 * q * x3, 2 * q * x4];
        }
      }
      yield;
    }
  }
  return { count, solution };
}

/** Run rQSteps to completion synchronously (for tests). */
export function rQWithSolution(N, q) {
  const g = rQSteps(N, q);
  let r;
  while (!(r = g.next()).done);
  return r.value;
}

/** The solutions every r_Q(p^t) contains: ±p^{t/2} for even t. */
export const trivialCount = (t) => (t % 2 ? 0 : 2);

/** TeX for a word in the generators (S ordered α1, ᾱ1, α2, ᾱ2, …), runs written as powers. */
export function wordTex(word) {
  const out = [];
  for (let i = 0; i < word.length;) {
    let j = i;
    while (j < word.length && word[j] === word[i]) j++;
    const s = word[i];
    const base = (s % 2 ? '\\bar\\alpha' : '\\alpha') + '_{' + (Math.floor(s / 2) + 1) + '}';
    out.push(j - i > 1 ? `${base}^{${j - i}}` : base);
    i = j;
  }
  return out.join('\\,');
}

/** TeX for a quaternion a0 + a1 i + a2 j + a3 k. */
export function quatTex(a) {
  const parts = [String(a[0])];
  ['\\bi', '\\bj', '\\bk'].forEach((u, i) => {
    const c = a[i + 1];
    if (!c) return;
    parts.push((c < 0 ? '-' : '+') + Math.abs(c) + u);
  });
  return parts.join('');
}

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { p: 5, q: 13, rows: [], firstT: null, sol: null, factor: null, bfs: null, pending: null, limit: null, hover: null };
  let token = 0;

  const cv = makeCanvas(left, { aspect: (w) => (w < 480 ? 0.78 : 0.56), maxHeight: 400, minHeight: 240, draw });
  const labels = labelLayer(cv.wrap);
  left.append(el('div', { class: 'hint' }, 'Hover or tap a bar to read its count.'));

  chips(right, {
    label: 'Primes $(p,q)$',
    options: PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: '5,13',
    onchange: (key) => { const [p, q] = key.split(',').map(Number); start(p, q); },
  });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  const rel = el('div', { class: 'readout', style: 'margin-top:.5rem' });
  right.append(ro, rel);

  function maxT() {
    const b = girthBound(st.p, st.q);
    const last = st.rows.length ? st.rows[st.rows.length - 1].t : 0;
    return Math.max(6, Math.ceil(b) + 1, last + (st.pending !== null ? 1 : 0), st.firstT !== null ? st.firstT + 2 : 0);
  }

  function layout(w, h) {
    const L = 44, R = 10, T = 28, B = 32;
    const Tm = maxT();
    const slot = (w - L - R) / (Tm + 1);
    let maxC = 2;
    for (const r of st.rows) maxC = Math.max(maxC, r.count);
    const yTop = Math.max(1, Math.ceil(Math.log10(maxC) + 0.12));
    const X = (t) => L + (t + 0.5) * slot;
    const Y = (lv) => h - B - (lv / yTop) * (h - B - T);
    return { L, R, T, B, Tm, slot, yTop, X, Y };
  }

  function draw(ctx, w, h) {
    const P = palette();
    const { L, R, T, B, Tm, slot, yTop, X, Y } = layout(w, h);
    const font = cssVar('--font-body');
    const labs = [];

    // grid at powers of ten
    ctx.lineWidth = 1;
    for (let k = 0; k <= yTop; k++) {
      ctx.strokeStyle = P.grid;
      ctx.beginPath(); ctx.moveTo(L, Y(k) + 0.5); ctx.lineTo(w - R, Y(k) + 0.5); ctx.stroke();
      labs.push({ id: 'y' + k, x: L - 6, y: Y(k), tex: k === 0 ? '1' : k === 1 ? '10' : `10^{${k}}`, anchor: 'w', cls: 'small' });
    }
    labs.push({ id: 'ytitle', x: L, y: 4, tex: 'r_Q(p^t)', anchor: 'se', cls: 'small' });

    // x ticks
    ctx.fillStyle = P.muted;
    ctx.font = `11px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= Tm; t++) ctx.fillText(String(t), X(t), h - B + 6);
    labs.push({ id: 'xtitle', x: w - R, y: h - 4, tex: 't', anchor: 'nw', cls: 'small' });

    // the bound of Theorem 3.4
    const b = girthBound(st.p, st.q);
    const xb = X(b);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = rgba(P.text, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xb, T - 6); ctx.lineTo(xb, h - B); ctx.stroke();
    ctx.restore();
    const boundTex = legendre(st.p, st.q) === -1 ? `4\\log_{${st.p}}${st.q}-\\log_{${st.p}}4` : `2\\log_{${st.p}}${st.q}`;
    labs.push({ id: 'bound', x: xb + (xb > w * 0.6 ? -5 : 5), y: T - 8, tex: `${boundTex}=${b.toFixed(2)}`, anchor: xb > w * 0.6 ? 'nw' : 'ne', cls: 'small halo' });

    // bars
    const bw = Math.min(34, slot * 0.64);
    for (const r of st.rows) {
      const x = X(r.t);
      if (r.count === 0) {
        ctx.fillStyle = P.muted;
        ctx.beginPath(); ctx.arc(x, Y(0) - 3, 2, 0, 2 * Math.PI); ctx.fill();
        continue;
      }
      const triv = Math.min(r.count, trivialCount(r.t));
      if (triv > 0) {
        ctx.fillStyle = rgba(P.tree, 0.75);
        ctx.fillRect(x - bw / 2, Y(Math.log10(triv)), bw, Y(0) - Y(Math.log10(triv)));
      }
      if (r.count > triv) {
        const y0 = triv > 0 ? Math.log10(triv) : 0;
        ctx.fillStyle = P.count;
        ctx.fillRect(x - bw / 2, Y(Math.log10(r.count)), bw, Y(y0) - Y(Math.log10(r.count)));
      }
      if (r.t === st.firstT) {
        labs.push({ id: 'g', x, y: Y(Math.log10(r.count)) - 4, html: 'girth', anchor: 'n', cls: 'small halo' });
      }
    }
    // the bar being counted
    if (st.pending !== null) {
      const x = X(st.pending);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = P.muted;
      ctx.strokeRect(x - bw / 2 + 0.5, Y(0.6) + 0.5, bw - 1, Y(0) - Y(0.6) - 1);
      ctx.restore();
    }
    // selection
    const sel = selected();
    if (sel) {
      const x = X(sel.t), top = sel.count ? Y(Math.log10(sel.count)) : Y(0) - 8;
      ctx.strokeStyle = P.text;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - bw / 2 - 2.5, top - 2.5, bw + 5, Y(0) - top + 2.5);
    }
    // baseline
    ctx.strokeStyle = rgba(P.text, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, Y(0) + 0.5); ctx.lineTo(w - R, Y(0) + 0.5); ctx.stroke();

    labels.set(labs);
  }

  function selected() {
    const t = st.hover !== null ? st.hover : st.firstT;
    return st.rows.find((r) => r.t === t) || null;
  }

  pointer(cv.wrap, {
    down(x) { pick(x); return false; },
    hover(x) { pick(x); },
    leave() { st.hover = null; cv.redraw(); updateReadout(); },
  });
  function pick(x) {
    const { X, Tm } = layout(cv.w, cv.h);
    let best = null, bd = Infinity;
    for (let t = 0; t <= Tm; t++) { const d = Math.abs(X(t) - x); if (d < bd) { bd = d; best = t; } }
    const t = st.rows.some((r) => r.t === best) ? best : null;
    if (t !== st.hover) { st.hover = t; cv.redraw(); updateReadout(); }
  }

  function updateReadout() {
    const { p, q } = st;
    const leg = legendre(p, q), n = orderX(p, q), b = girthBound(p, q);
    const grp = leg === -1 ? `\\PGL_2(\\F_{${q}})` : `\\PSL_2(\\F_{${q}})`;
    let first = '<span class="dim">counting…</span>';
    if (st.firstT !== null) first = `$${st.firstT}$`;
    else if (st.limit !== null) first = `<span class="dim">none up to $t=${st.limit}$</span>`;
    let bfs = '<span class="dim">…</span>';
    if (st.bfs) {
      const same = st.firstT !== null && st.bfs.girth === st.firstT;
      bfs = `$${st.bfs.girth}$ ` + (st.firstT === null ? '' : same ? '<span class="ok">✓ same</span>' : '<span class="bad">✗ differs</span>');
    }
    let check = '';
    if (st.firstT !== null) {
      check = st.firstT >= b - 1e-9
        ? `<span class="ok">✓</span> $${st.firstT}\\ge ${b.toFixed(2)}$, as Theorem 3.4 says`
        : `<span class="bad">✗</span> $${st.firstT}\\lt ${b.toFixed(2)}$`;
    }
    setTex(ro, `<table>
      <tr><td>$\\leg pq$</td><td class="num">$${leg}$</td></tr>
      <tr><td>group</td><td class="num">$${grp}$</td></tr>
      <tr><td>$n=|X^{p,q}|$</td><td class="num">$${fmt.tex(n)}$</td></tr>
      <tr><td>Theorem 3.4 bound</td><td class="num">$${b.toFixed(2)}$</td></tr>
      <tr class="sep"><td>first nontrivial $t$</td><td class="num">${first}</td></tr>
      <tr><td>girth (search)</td><td class="num">${bfs}</td></tr>
    </table>${check ? `<div style="margin-top:.35rem">${check}</div>` : ''}`);

    const sel = selected();
    let html = '';
    if (sel) {
      const triv = trivialCount(sel.t);
      const split = sel.count > triv ? ` $=${triv}+${fmt.tex(sel.count - triv)}$` : sel.count === 0 && leg === -1 && sel.t % 2 ? ' (odd $t$: $p^t$ is not a square mod $q$)' : ' (only $\\pm p^{t/2}$)';
      html += `<div>$r_Q(${p}^{${sel.t}})=${fmt.tex(sel.count)}$${split}</div>`;
    }
    if (st.factor && st.sol) {
      const f = st.factor, ok = f.word.length === st.firstT && f.r === 0 && f.steps.every((c) => c === 1);
      html += `<div style="margin-top:.35rem">Shortest relation, $t=${st.firstT}$:</div>
        <div style="margin:.2rem 0">$\\alpha=${quatTex(st.sol)}$</div>
        <div>$\\alpha=${f.sign < 0 ? '-' : ''}${wordTex(f.word)}$</div>
        <div style="margin-top:.3rem">${ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'} a reduced word of length $${f.word.length}$ in $\\Lambda(2q)$: a cycle through $e$</div>`;
    } else if (st.firstT === null) {
      html += '<div class="dim" style="margin-top:.35rem">The first solution with $(x_2,x_3,x_4)\\ne0$ will be factored here.</div>';
    }
    setTex(rel, html);
  }

  async function start(p, q) {
    const my = ++token;
    Object.assign(st, { p, q, rows: [], firstT: null, sol: null, factor: null, bfs: null, pending: null, limit: null, hover: null });
    cv.redraw(); updateReadout();
    const S = generators(p);
    for (let t = 0; ; t++) {
      const N = Math.pow(p, t);
      if (N > Number.MAX_SAFE_INTEGER || rQCost(N, q) > COST_CAP) { st.limit = t - 1; break; }
      if (st.firstT !== null && t > st.firstT + 2) break;
      st.pending = t;
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
      st.rows.push({ t, count: res.count });
      if (st.firstT === null && res.count > trivialCount(t)) {
        st.firstT = t;
        st.sol = res.solution;
        st.factor = res.solution ? factorQuaternion(res.solution, p, S) : null;
      }
      st.pending = null;
      cv.redraw(); updateReadout();
    }
    st.pending = null;
    cv.redraw(); updateReadout();
    // independent check: shortest cycle by breadth-first search in the Cayley graph
    await new Promise((r) => setTimeout(r, 30));
    if (my !== token) return;
    if (orderX(p, q) <= 60000) {
      st.bfs = girth(buildX(p, q));
      updateReadout();
    }
  }

  onTheme(() => cv.redraw());
  start(5, 13);
}
